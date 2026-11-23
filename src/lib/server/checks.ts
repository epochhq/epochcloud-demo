import { networkInterfaces } from 'node:os';
import { config } from './config.js';
import { getCnpgStatus } from './cnpg.js';
import { getDefectDojoSummary } from './defectdojo.js';
import { upstream } from './http.js';
import { invokeFibonacci } from './knative.js';
import { getRabbitStatus } from './rabbitmq.js';
import { verifySmtp } from './smtp.js';
import { pingValkey } from './valkey.js';
import { currentNamespace } from './namespace.js';
import { entrypointEnabled, probeEntrypoint } from './entrypoint.js';
import { evaluateProofs } from './proofs.js';
import { prometheusEnabled } from './prometheus.js';
import { NotRunning, defineChecks } from './snapshot.js';

/**
 * The address the Account check counts under in BetterAuth's per-address limit:
 * this pod's own, so every pod that shares a BetterAuth has its own bucket.
 */
export function podAddress(): string {
	for (const entries of Object.values(networkInterfaces()))
		for (const entry of entries ?? []) if (entry.family === 'IPv4' && !entry.internal) return entry.address;
	return '127.0.0.1';
}

// Every integration the page reports on, as data. Each run proves its
// capability against the real service: a round trip, a query, or a handshake.
// Results carry no internal addresses; the page gets counts and words.
defineChecks([
	{
		name: 'rabbitmq',
		enabled: () => config.rabbitmq.enabled,
		missing: 'RabbitMQ not configured',
		run: async () => {
			const status = await getRabbitStatus();
			if (!status.connected) throw new Error('broker did not answer the queue probe');
		}
	},
	{ name: 'valkey', enabled: () => config.valkey.enabled, missing: 'Valkey not configured', run: pingValkey },
	{ name: 'cnpg', enabled: () => config.cnpg.enabled, missing: 'Database not configured', run: getCnpgStatus },
	{ name: 'email', enabled: () => config.smtp.enabled, missing: 'SMTP not configured', run: verifySmtp },
	{
		name: 'betterauth',
		enabled: () => config.betterauth.enabled,
		missing: 'BetterAuth not configured',
		// A sign-in for an address that cannot exist (the .invalid TLD, RFC 2606):
		// BetterAuth refuses it with 401 only after looking it up in its database,
		// so this passes only when signing in works end to end. A 429 is BetterAuth
		// turning the check away, which tests nothing: the dot says not running.
		run: async () => {
			const resp = await upstream(`${config.betterauth.url}/api/auth/sign-in/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-forwarded-for': podAddress() },
				body: JSON.stringify({ email: 'status-check@example.invalid', password: 'status-check-password' })
			});
			if (resp.status === 429) throw new NotRunning('BetterAuth turned this check away under its rate limit, so sign-in was not tested this time');
			if (resp.status !== 401) throw new Error(`a sign-in attempt got HTTP ${resp.status}, not the refusal it expects`);
		}
	},
	{
		name: 'crowdsec',
		enabled: () => config.crowdsec.enabled && !!config.crowdsec.bouncerKey,
		missing: 'Unavailable: needs a per-app read-only key from the platform',
		// A decisions lookup with the bouncer key succeeds only when the LAPI is up
		// and accepts the key, which /health does not prove.
		run: async () => {
			const resp = await upstream(`${config.crowdsec.lapiUrl}/v1/decisions?ip=127.0.0.1`, { headers: { 'X-Api-Key': config.crowdsec.bouncerKey } });
			if (!resp.ok) throw new Error(`LAPI answered ${resp.status} to the bouncer key`);
		}
	},
	{
		name: 'defectdojo',
		enabled: () => config.defectdojo.enabled,
		missing: 'Unavailable: the platform offers apps no read-only DefectDojo identity yet',
		everyMs: 60_000,
		run: async () => ({ ...(await getDefectDojoSummary()) })
	},
	{
		name: 'featureflags',
		enabled: () => config.gofeatureflag.enabled,
		missing: 'GO Feature Flag not configured',
		run: async () => {
			const resp = await upstream(`${config.gofeatureflag.url}/v1/allflags`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ evaluationContext: { targetingKey: 'health-check' } })
			});
			if (!resp.ok) throw new Error(`relay proxy answered ${resp.status}`);
			const body = (await resp.json()) as { flags?: object };
			return { flags_available: Object.keys(body.flags ?? body).length };
		}
	},
	{
		name: 'ntfy',
		enabled: () => config.ntfy.enabled,
		missing: 'ntfy not configured',
		run: async () => {
			const resp = await upstream(`${config.ntfy.url}/v1/health`);
			const body = (await resp.json().catch(() => ({}))) as { healthy?: boolean };
			if (!resp.ok || body.healthy === false) throw new Error(`ntfy reports unhealthy (HTTP ${resp.status})`);
		}
	},
	{
		// Evaluates the whole proof list (src/lib/server/proofs.ts) in one pass.
		// Connected means Prometheus answered; each proof carries its own verdict.
		name: 'proofs',
		enabled: prometheusEnabled,
		missing: 'Prometheus not configured',
		run: async () => {
			const namespace = currentNamespace();
			if (!namespace) throw new Error('namespace unknown');
			const proofs = await evaluateProofs(namespace);
			if (!proofs.some((proof) => proof.answered)) throw new Error('Prometheus answered none of the proofs');
			return { proofs };
		}
	},
	{
		// The mesh proof, from the series of Traefik's own proxy toward the app
		// (src/lib/server/proofs.ts). A series with tls "true" in the window is the
		// pass; the proxy drops an idle series and recreates it at 1, so existence
		// is the evidence, not an increase. A series toward the app with any other
		// tls is positive evidence that the entrypoint reached it without mTLS:
		// Failed. The server side of the app is deliberately not read: the proxies
		// create default-policy series at start-up and other workloads share the
		// port, so a plaintext series there says nothing about the entrypoint's
		// traffic. 503 also when the queries do not answer.
		//
		// The evidence only exists while requests flow, so each run also sends one
		// real request through the public entrypoint (src/lib/server/entrypoint.ts),
		// beside the read. The read sees what earlier runs sent: a run a scrape
		// interval after the request finds its series, so an idle demo keeps
		// showing the mesh. Only the first run after a start can find nothing; it
		// says the series is on its way, and a probe the entrypoint did not answer
		// with no series to show is a failure of the path, not an idle app.
		name: 'linkerd',
		enabled: prometheusEnabled,
		missing: 'Prometheus not configured',
		run: async () => {
			const namespace = currentNamespace();
			if (!namespace) throw new Error('namespace unknown');
			const probe = entrypointEnabled()
				? probeEntrypoint().then(
						() => true,
						() => false
					)
				: Promise.resolve(undefined);
			const [proofs, probed] = await Promise.all([evaluateProofs(namespace, 'linkerd'), probe]);
			const mtls = proofs.find((proof) => proof.id === 'mtls-traefik');
			const plaintext = proofs.find((proof) => proof.id === 'plaintext-traefik');
			if (!mtls?.answered || !plaintext?.answered) throw new Error('Prometheus did not answer the mesh queries');
			if (plaintext.value) throw new Error('Traefik reached the app without mTLS');
			if (mtls.value) return { mtls_series_10m: Math.round(mtls.value) };
			if (probed === false) throw new Error('The app got no answer from its own entrypoint');
			if (probed) throw new NotRunning('Probed the entrypoint just now; its series reaches Prometheus with the next scrape');
			throw new NotRunning('No request from Traefik to the app in the last 10 minutes');
		}
	},
	{
		name: 'knative',
		enabled: () => config.knative.enabled,
		missing: 'Knative not configured',
		// A real invocation, but rarely: it can scale the service up from zero.
		everyMs: 300_000,
		run: async () => {
			const started = performance.now();
			await invokeFibonacci(1);
			return { latency_ms: Math.round(performance.now() - started) };
		}
	}
]);
