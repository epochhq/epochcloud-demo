import { config } from './config.js';
import { getCnpgStatus } from './cnpg.js';
import { getDefectDojoSummary } from './defectdojo.js';
import { upstream } from './http.js';
import { invokeFibonacci } from './knative.js';
import { getRabbitStatus } from './rabbitmq.js';
import { verifySmtp } from './smtp.js';
import { pingValkey } from './valkey.js';
import { currentNamespace } from './namespace.js';
import { evaluateProofs } from './proofs.js';
import { prometheusEnabled } from './prometheus.js';
import { NotRunning, defineChecks } from './snapshot.js';

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
		run: async () => {
			const resp = await upstream(`${config.betterauth.url}/ready`);
			if (!resp.ok) throw new Error(`BetterAuth answered ${resp.status}`);
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
		// The mesh proof, judged by which series exist in the window. The proxy
		// drops a series that stays idle and recreates it at 1 on the next
		// request, so a counter's increase would read a request on a recreated
		// series as none. A series from Traefik's identity over mTLS to the app's
		// pods is the pass. None is Not running: no request came, or the proxies
		// have no series for it yet. A plaintext series is no evidence against
		// the mesh: the proxy creates default-policy series at start-up and other
		// workloads share the port. Failed only when the query does not answer.
		name: 'linkerd',
		enabled: prometheusEnabled,
		missing: 'Prometheus not configured',
		run: async () => {
			const namespace = currentNamespace();
			if (!namespace) throw new Error('namespace unknown');
			const proofs = await evaluateProofs(namespace, 'linkerd');
			const mtls = proofs.find((proof) => proof.id === 'mtls-traefik');
			if (!mtls?.answered) throw new Error('Prometheus did not answer the mesh query');
			if (mtls.value) return { mtls_series_10m: Math.round(mtls.value) };
			throw new NotRunning('No request from Traefik reached the app over mTLS in the last 10 minutes');
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
