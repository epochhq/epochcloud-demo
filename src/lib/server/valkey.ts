import Redis from 'ioredis';
import { config } from './config.js';
import { log } from './logger.js';
import { UPSTREAM_TIMEOUT_MS } from '../limits.js';
import { valkeyConnected, valkeyCacheHits, valkeyCacheMisses, valkeyOperations } from './metrics.js';

let client: Redis | null = null;

export async function initValkey(): Promise<void> {
	if (!config.valkey.enabled) {
		log('info', 'Valkey disabled (VALKEY_HOST not set)');
		return;
	}

	try {
		client = new Redis({
			host: config.valkey.host,
			port: config.valkey.port,
			password: config.valkey.password || undefined,
			db: config.valkey.database,
			retryStrategy: (times) => {
				// Retry indefinitely with exponential backoff capped at 30s.
				// Kubernetes services always come back; giving up permanently after N
				// retries would leave the app broken until the next pod restart.
				return Math.min(times * 1000, 30000);
			},
			lazyConnect: true,
			// A command that gets no answer fails instead of waiting for ever.
			commandTimeout: UPSTREAM_TIMEOUT_MS,
			connectTimeout: UPSTREAM_TIMEOUT_MS,
			maxRetriesPerRequest: 1
		});

		client.on('connect', () => {
			valkeyConnected.set(1);
			log('info', 'Valkey connected', { host: config.valkey.host });
		});

		client.on('error', (err) => {
			valkeyConnected.set(0);
			log('error', 'Valkey error', { error: String(err) });
		});

		client.on('close', () => {
			valkeyConnected.set(0);
		});

		await client.connect();
	} catch (err) {
		log('error', 'Valkey init failed', { error: String(err) });
		valkeyConnected.set(0);
	}
}

export async function valkeyGet(key: string): Promise<string | null> {
	if (!client) throw new Error('Valkey not connected');

	valkeyOperations.inc({ operation: 'get' });
	const value = await client.get(key);

	if (value !== null) {
		valkeyCacheHits.inc();
	} else {
		valkeyCacheMisses.inc();
	}

	return value;
}

export async function valkeySet(key: string, value: string, ttlSeconds?: number): Promise<void> {
	if (!client) throw new Error('Valkey not connected');

	valkeyOperations.inc({ operation: 'set' });
	if (ttlSeconds) {
		await client.set(key, value, 'EX', ttlSeconds);
	} else {
		await client.set(key, value);
	}
}

// A round trip to the server: PING answers PONG only while the connection works.
// The client's cached "ready" state would stay true for a connection that has
// silently gone away.
export async function pingValkey(): Promise<{ reply: string }> {
	if (!client) throw new Error('Valkey not configured');
	const reply = await client.ping();
	if (reply !== 'PONG') throw new Error(`unexpected PING reply: ${String(reply)}`);
	valkeyConnected.set(1);
	return { reply };
}

/**
 * Take a cooldown slot: true for the first caller within the window, false for
 * everyone after, across all pods (SET NX EX is atomic in Valkey). It fails
 * closed: with no Valkey there is no slot, so no mail or message goes out.
 */
export async function claimCooldown(key: string, seconds: number): Promise<boolean> {
	if (!client) return false;
	try {
		return (await client.set(`demo:cooldown:${key}`, '1', 'EX', seconds, 'NX')) === 'OK';
	} catch {
		return false;
	}
}

export async function closeValkey(): Promise<void> {
	await client?.quit().catch(() => {});
}
