import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
vi.mock('#lib/server/config.js', () => ({ config: { podNamespace: 'epochcloud-demo-dev' } }));
vi.mock('#lib/server/rabbitmq.js', () => ({ getRabbitStatus: vi.fn() }));
vi.mock('#lib/server/valkey.js', () => ({ pingValkey: vi.fn() }));
vi.mock('#lib/server/cnpg.js', () => ({ getCnpgStatus: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ verifySmtp: vi.fn() }));
vi.mock('#lib/server/knative.js', () => ({ invokeFibonacci: vi.fn() }));
vi.mock('#lib/server/defectdojo.js', () => ({ getDefectDojoSummary: vi.fn() }));

import '../../src/lib/server/checks.js';
import { refresh, snapshotResponse } from '../../src/lib/server/snapshot.js';

// The Linkerd tab's check, against a fake Prometheus that answers the way the
// real one does for the series the proxies and Traefik expose. Traefik keeps its
// series, so a change over the window shows a request. A Linkerd proxy drops an
// idle series and recreates it at 1, so on a recreated series increase() is 0
// while last_over_time() still finds it. No request at all is not a failure;
// request series that reached the app without mTLS, or a query that fails, are.

interface Mesh {
	/** Requests Traefik counted in the window. */
	entry?: number;
	/** Series from Traefik over mTLS the proxy exposes in the window. */
	mtlsSeries?: number;
	/** Series that reached the app without mTLS, kubelet probes left out. */
	plaintextSeries?: number;
	/** The proxy recreated its series at 1 inside the window. */
	recreated?: boolean;
	/** Queries that fail. */
	failing?: Array<'entry' | 'mtls' | 'plaintext'>;
}

function prometheus(mesh: Mesh) {
	const sample = (value: number) => Response.json({ status: 'success', data: { result: [{ metric: {}, value: [0, String(value)] }] } });
	vi.stubGlobal('fetch', async (url: string) => {
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		const kind = q.includes('traefik_service_requests_total') ? 'entry' : q.includes('tls!="true"') ? 'plaintext' : q.includes('tls="true"') ? 'mtls' : null;
		if (!kind) return sample(0);
		if (mesh.failing?.includes(kind)) return new Response('boom', { status: 500 });
		if (kind === 'entry') return sample(mesh.entry ?? 0);
		if (kind === 'plaintext') return sample(mesh.plaintextSeries ?? 0);
		// A series the proxy recreated at 1 has one sample in the window: increase()
		// of it is 0, and last_over_time() of it is 1.
		const series = mesh.mtlsSeries ?? 0;
		if (mesh.recreated && q.includes('increase(')) return sample(0);
		return series ? sample(series) : Response.json({ status: 'success', data: { result: [] } });
	});
}

beforeEach(() => vi.unstubAllGlobals());

it('is not running, with 200, when no request came through the entrypoint at all', async () => {
	prometheus({});
	await refresh('linkerd', 1_000);
	const response = snapshotResponse('linkerd', 1_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		connected: false,
		state: 'not-running',
		reason: 'No request came through the entrypoint in the last 10 minutes'
	});
});

it('is not running, with 200, when requests came through the entrypoint and the proxies have no series for them yet', async () => {
	prometheus({ entry: 40 });
	await refresh('linkerd', 2_000);
	const response = snapshotResponse('linkerd', 2_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		connected: false,
		state: 'not-running',
		reason: 'Requests came through the entrypoint, but the proxies have no series for them yet'
	});
});

it('fails, with 503, when request series reached the app without mTLS', async () => {
	prometheus({ entry: 40, mtlsSeries: 1, plaintextSeries: 1 });
	await refresh('linkerd', 3_000);
	const response = snapshotResponse('linkerd', 3_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

it('fails, with 503, on plaintext series even when no request came through the entrypoint', async () => {
	prometheus({ plaintextSeries: 2 });
	await refresh('linkerd', 3_500);
	expect(snapshotResponse('linkerd', 3_500).status).toBe(503);
});

it.each(['entry', 'mtls', 'plaintext'] as const)('fails, with 503, when the %s query does not answer', async (failing) => {
	prometheus({ entry: 40, mtlsSeries: 1, failing: [failing] });
	await refresh('linkerd', 4_000);
	expect(snapshotResponse('linkerd', 4_000).status).toBe(503);
});

it('is connected when a series from Traefik over mTLS is in the window', async () => {
	prometheus({ entry: 40, mtlsSeries: 2 });
	await refresh('linkerd', 5_000);
	const response = snapshotResponse('linkerd', 5_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true, mtls_series_10m: 2 });
});

it('is connected when the proxy recreated the series at 1 inside the window', async () => {
	prometheus({ entry: 1, mtlsSeries: 1, recreated: true });
	await refresh('linkerd', 6_000);
	const response = snapshotResponse('linkerd', 6_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
});

// The proofs check connects whenever Prometheus answered at least one query. It
// fails, with 503, when Prometheus answers none.
it('fails the proofs check, with 503, when Prometheus answers no query', async () => {
	vi.stubGlobal('fetch', async () => {
		throw new Error('connection refused');
	});
	await refresh('proofs', 7_000);
	const response = snapshotResponse('proofs', 7_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

it('connects the proofs check when Prometheus answers, even with no data', async () => {
	vi.stubGlobal('fetch', async () => Response.json({ status: 'success', data: { result: [] } }));
	await refresh('proofs', 8_000);
	const response = snapshotResponse('proofs', 8_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true });
});
