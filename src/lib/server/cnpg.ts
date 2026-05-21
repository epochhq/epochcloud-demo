import pg from 'pg';
import { config } from './config.js';
import { log } from './logger.js';
import { cnpgConnected, cnpgOperations, cnpgErrors } from './metrics.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

// One row per item in the demo CRUD table. `created_at` is the source
// of truth for ordering; `environment` is captured at insert time so
// the UI can show which env wrote the row even after data flows
// through the prod→staging/dev sync (where rows from prod's DB get
// restored into the dev/staging clusters and originated_in shows
// `prod`).
export interface CnpgItem {
	id: number;
	text: string;
	created_at: string;
	originated_in: string;
}

// Schema-ensure SQL - CREATE TABLE IF NOT EXISTS is idempotent and
// cheap (information_schema lookup) when the table already exists, so
// it's safe to call on every reconnect attempt.
const ENSURE_SCHEMA_SQL = `
	CREATE TABLE IF NOT EXISTS demo_items (
		id SERIAL PRIMARY KEY,
		text TEXT NOT NULL,
		originated_in TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)
`;

let schemaReady = false;

async function tryConnectAndEnsureSchema(): Promise<boolean> {
	if (!pool) return false;
	try {
		const c = await pool.connect();
		try {
			await c.query(ENSURE_SCHEMA_SQL);
			schemaReady = true;
			cnpgConnected.set(1);
			return true;
		} finally {
			c.release();
		}
	} catch (err) {
		cnpgConnected.set(0);
		cnpgErrors.inc({ op: 'init' });
		log('warn', 'CNPG connect/ensure-schema failed (will retry)', {
			error: String(err)
		});
		return false;
	}
}

export async function initCnpg(): Promise<void> {
	if (!config.cnpg.enabled) {
		log('info', 'CNPG demo disabled (DATABASE_URL not set)');
		return;
	}

	pool = new Pool({
		connectionString: config.cnpg.url,
		// Small pool - this is a demo, not a hot path. Per-pod limit kept
		// low so N preview pods sharing a dev DB don't exhaust the
		// upstream Postgres `max_connections` (the env-isolation task
		// will route through a CNPG Pooler / PgBouncer; until then
		// keep client-side reasonable).
		max: 5,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 5_000
	});

	pool.on('error', (err) => {
		log('error', 'CNPG pool error', { error: String(err) });
		cnpgConnected.set(0);
		cnpgErrors.inc({ op: 'pool' });
		// pg auto-evicts the broken client; subsequent ops re-acquire.
		// Mark schema as needing re-verification in case the cluster
		// was re-bootstrapped (env-isolation daily resync recreates
		// the staging+dev clusters from prod's S3 archive).
		schemaReady = false;
	});

	// First attempt synchronously so the pod knows immediately if the
	// DB is reachable.
	if (await tryConnectAndEnsureSchema()) {
		log('info', 'CNPG connected', { environment: config.environment });
		return;
	}

	// Background retry loop - handles the cold-start race where the
	// CNPG Cluster is provisioning but not yet Ready when this pod
	// boots. Fire-and-forget; CRUD operations check `schemaReady`
	// independently.
	void (async () => {
		let delayMs = 1000;
		while (!schemaReady) {
			await new Promise((r) => setTimeout(r, delayMs));
			if (await tryConnectAndEnsureSchema()) {
				log('info', 'CNPG connected (after retry)', {
					environment: config.environment
				});
				return;
			}
			delayMs = Math.min(delayMs * 2, 30_000);
		}
	})();
}

// CRUD operations call this defensively - the schema may have
// disappeared if the upstream Cluster was deleted+recreated by the
// daily env-isolation sync. Cheap idempotent re-ensure.
async function ensureSchemaIfNeeded(): Promise<void> {
	if (schemaReady) return;
	await tryConnectAndEnsureSchema();
}

export async function listItems(): Promise<CnpgItem[]> {
	if (!pool) throw new Error('CNPG not connected');
	await ensureSchemaIfNeeded();
	cnpgOperations.inc({ op: 'list' });
	const r = await pool.query<CnpgItem>(
		'SELECT id, text, originated_in, created_at FROM demo_items ORDER BY id DESC LIMIT 100'
	);
	return r.rows;
}

export async function createItem(text: string): Promise<CnpgItem> {
	if (!pool) throw new Error('CNPG not connected');
	await ensureSchemaIfNeeded();
	cnpgOperations.inc({ op: 'create' });
	const r = await pool.query<CnpgItem>(
		'INSERT INTO demo_items (text, originated_in) VALUES ($1, $2) RETURNING id, text, originated_in, created_at',
		[text, config.environment]
	);
	const row = r.rows[0];
	if (!row) throw new Error('INSERT ... RETURNING produced no row');
	return row;
}

export async function deleteItem(id: number): Promise<boolean> {
	if (!pool) throw new Error('CNPG not connected');
	await ensureSchemaIfNeeded();
	cnpgOperations.inc({ op: 'delete' });
	const r = await pool.query('DELETE FROM demo_items WHERE id = $1', [id]);
	return (r.rowCount ?? 0) > 0;
}

export function getCnpgStatus() {
	return {
		// "connected" reflects schema-ready, not just pool-allocated.
		// During the cold-start race the pool exists but the schema
		// isn't proven yet, and CRUD ops would 500. Returning false
		// here lets the UI show "Disconnected" until the retry loop
		// or an op-driven ensure succeeds.
		connected: schemaReady
	};
}
