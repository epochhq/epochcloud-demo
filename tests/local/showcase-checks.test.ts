import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
const config = vi.hoisted(() => ({
	podNamespace: 'epochcloud-demo-dev',
	entrypointUrl: 'https://demo-dev.example.test',
	attestation: { enabled: true, maxAgeDays: 30 },
	chaos: { enabled: true, intervalHours: 4 }
}));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/rabbitmq.js', () => ({ getRabbitStatus: vi.fn() }));
vi.mock('#lib/server/valkey.js', () => ({ pingValkey: vi.fn() }));
vi.mock('#lib/server/cnpg.js', () => ({ getCnpgStatus: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ verifySmtp: vi.fn() }));
vi.mock('#lib/server/knative.js', () => ({ invokeFibonacci: vi.fn() }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
const attestationOnce = vi.hoisted(() => vi.fn());
vi.mock('#lib/server/attestation.js', () => ({ attestationOnce }));

import '../../src/lib/server/checks.js';
import { refresh, tick } from '../../src/lib/server/snapshot.js';

// How the three showcase checks turn what they read into a dot: the CrowdSec
// canary, the signed vulnerability attestation and the chaos experiment.

const NOW = Date.UTC(2026, 10, 18);
const summary = (scannedAt: string) => ({ critical: 1, high: 2, scannedAt, scanner: 'trivy 0.76.1', signer: 'ci@example.test' });

beforeEach(() => {
	vi.unstubAllGlobals();
	attestationOnce.mockReset();
});

/** The app's own public address and a Prometheus, answering the canary and the counts. */
function edge(canary: { status: number; remediation?: string }, control = 200) {
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
		if (url.startsWith('http://prom.test')) return Response.json({ status: 'success', data: { result: [{ metric: {}, value: [0, '3'] }] } });
		const canaryRequest = new globalThis.Headers(init.headers).has('x-epochcloud-edge-canary');
		return canaryRequest
			? new Response(null, { status: canary.status, headers: canary.remediation ? { 'x-crowdsec-remediation': canary.remediation } : {} })
			: new Response('ok', { status: control });
	});
}

it('CrowdSec: a refused canary and a served control is connected, with the refusal counts beside it', async () => {
	edge({ status: 403, remediation: 'ban' });
	const result = await refresh('crowdsec', NOW);
	expect(result).toMatchObject({ connected: true, canary_status: 403, control_status: 200, refusals: { total24h: 3 } });
});

it('CrowdSec: a served canary is a failure, not a pass: the inspection engine fails open', async () => {
	edge({ status: 200 });
	expect(await refresh('crowdsec', NOW)).toMatchObject({ connected: false, error: 'the check failed' });
});

it('CrowdSec: counts that cannot be read leave the verdict to the canary', async () => {
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) =>
		url.startsWith('http://prom.test')
			? new Response('down', { status: 503 })
			: new globalThis.Headers(init.headers).has('x-epochcloud-edge-canary')
				? new Response(null, { status: 403, headers: { 'x-crowdsec-remediation': 'ban' } })
				: new Response('ok')
	);
	expect(await refresh('crowdsec', NOW)).toMatchObject({ connected: true, refusals: null });
});

it('CrowdSec: not running without a public address to test', async () => {
	config.entrypointUrl = '';
	expect(await refresh('crowdsec', NOW)).toMatchObject({ connected: false, state: 'not-running' });
	config.entrypointUrl = 'https://demo-dev.example.test';
});

it('Vulnerabilities: a verified, fresh scan reports its counts', async () => {
	attestationOnce.mockResolvedValue(summary(new Date(Date.now() - 86_400_000).toISOString()));
	expect(await refresh('vulnerabilities', NOW)).toMatchObject({ connected: true, critical: 1, high: 2, signer: 'ci@example.test' });
});

it('Vulnerabilities: a scan older than the age limit is stale, shown with its date, not a pass', async () => {
	attestationOnce.mockResolvedValue(summary('2026-01-01T00:00:00Z'));
	const result = await refresh('vulnerabilities', NOW);
	expect(result).toMatchObject({ connected: false, state: 'not-running' });
	expect(result.reason).toContain('2026-01-01');
});

it('Vulnerabilities: no attestation, or one that does not verify, is a failure', async () => {
	attestationOnce.mockRejectedValue(new Error('the running digest has no vulnerability attestation: it was not scanned'));
	expect(await refresh('vulnerabilities', NOW)).toMatchObject({ connected: false, error: 'the check failed' });
});

it('Vulnerabilities: a first verification that has not finished says so instead of failing', async () => {
	vi.useFakeTimers();
	try {
		attestationOnce.mockReturnValue(new Promise(() => {}));
		const pending = refresh('vulnerabilities', NOW);
		await vi.advanceTimersByTimeAsync(3_500);
		expect(await pending).toMatchObject({ connected: false, state: 'not-running' });
	} finally {
		vi.useRealTimers();
	}
});

it('Chaos: not running when the exporter holds no result for the namespace', async () => {
	vi.stubGlobal('fetch', async () => Response.json({ status: 'success', data: { result: [] } }));
	expect(await refresh('chaos', NOW)).toMatchObject({ connected: false, state: 'not-running' });
});

it('Chaos: not running in an environment that ships no experiment', async () => {
	config.chaos.enabled = false;
	expect(await refresh('chaos', NOW)).toMatchObject({ connected: false, state: 'not-running' });
	config.chaos.enabled = true;
});

it('CrowdSec: sends a canary at most once every fifteen minutes, so fail2ban never counts ten from one address', async () => {
	let canaries = 0;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
		if (url.startsWith('http://prom.test')) return Response.json({ status: 'success', data: { result: [] } });
		if (new globalThis.Headers(init.headers).has('x-epochcloud-edge-canary')) {
			canaries++;
			return new Response(null, { status: 403, headers: { 'x-crowdsec-remediation': 'ban' } });
		}
		return new Response('ok');
	});
	// The earlier cases ran the check at NOW; the first tick here is due.
	const start = NOW + 20 * 60_000;
	await tick(start);
	expect(canaries).toBe(1);
	await tick(start + 14 * 60_000);
	expect(canaries).toBe(1);
	await tick(start + 15 * 60_000);
	expect(canaries).toBe(2);
});
