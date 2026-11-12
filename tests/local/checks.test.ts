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

// The Linkerd tab's check, against a fake Prometheus that holds series with the
// label shapes the live proxies expose and applies the query's label matchers
// to them. An mTLS series from Traefik's identity to the app's pods is the pass.
// The proxy also creates default-policy series (plaintext, "all-unauthenticated",
// "default" route) at start-up, with a count of 1 to 6, and the BetterAuth pods
// share port 3000 in the namespace: neither is evidence against the mesh.

type Labels = Record<string, string>;
const NAMESPACE = 'epochcloud-demo-dev';
const TRAEFIK = 'traefik.traefik.serviceaccount.identity.linkerd.cluster.local';

const proxySeries = (pod: string, extra: Labels = {}): Labels => ({
	authz_kind: 'default',
	authz_name: 'all-unauthenticated',
	direction: 'inbound',
	job: 'linkerd-proxy',
	namespace: NAMESPACE,
	no_tls_reason: 'no_tls_from_remote',
	pod,
	route_kind: 'default',
	route_name: 'default',
	srv_kind: 'default',
	srv_name: 'all-unauthenticated',
	srv_port: '3000',
	tls: 'no_identity',
	...extra
});
const defaultPolicy = (pod: string) => proxySeries(pod);
const fromTraefik = (pod: string): Labels => {
	const { no_tls_reason: _reason, ...rest } = proxySeries(pod, { tls: 'true', client_id: TRAEFIK });
	return rest;
};

const appPod = 'epochcloud-demo-5d49b4bc48-qnc5d';
const newAppPod = 'epochcloud-demo-64579cf5cf-2sbqz';
const betterauthPod = 'epochcloud-demo-betterauth-bd44b6d7f-kd2th';

/** The label matchers of a query, applied to a series; an absent label is empty, as in PromQL. */
function selects(query: string, labels: Labels): boolean {
	for (const [, name, op, raw] of query.matchAll(/(\w+)(=~|!=|=)"((?:[^"\\]|\\.)*)"/g)) {
		const value = (raw ?? '').replaceAll('\\\\', '\\');
		const actual = labels[name ?? ''] ?? '';
		if (op === '=' && actual !== value) return false;
		if (op === '!=' && actual === value) return false;
		if (op === '=~' && !new RegExp(`^(?:${value})$`).test(actual)) return false;
	}
	return true;
}

function prometheus(series: Labels[], failing = false) {
	vi.stubGlobal('fetch', async (url: string) => {
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		if (failing) return new Response('boom', { status: 500 });
		// The existence form: count(last_over_time(request_total{...}[10m])) counts the series in the window.
		const count = q.startsWith('count(last_over_time(request_total{') ? series.filter((labels) => selects(q, labels)).length : 0;
		return Response.json({ status: 'success', data: { result: count ? [{ metric: {}, value: [0, String(count)] }] : [] } });
	});
}

beforeEach(() => vi.unstubAllGlobals());

const NOT_RUNNING = { connected: false, state: 'not-running', reason: 'No request from Traefik reached the app over mTLS in the last 10 minutes' };

it('is not running, with 200, when the proxies have no mTLS series from Traefik', async () => {
	prometheus([]);
	await refresh('linkerd', 1_000);
	const response = snapshotResponse('linkerd', 1_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it('does not fail on the default-policy series a new pod and a BetterAuth pod create, and is not running', async () => {
	prometheus([defaultPolicy(newAppPod), defaultPolicy(betterauthPod)]);
	await refresh('linkerd', 2_000);
	const response = snapshotResponse('linkerd', 2_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it('does not count an mTLS series from Traefik to the BetterAuth pods', async () => {
	prometheus([fromTraefik(betterauthPod)]);
	await refresh('linkerd', 3_000);
	expect(await snapshotResponse('linkerd', 3_000).json()).toMatchObject(NOT_RUNNING);
});

it('does not count an mTLS series from another caller, or in another namespace', async () => {
	prometheus([
		proxySeries(appPod, { tls: 'true', client_id: 'kube-prometheus-stack-prometheus.monitoring.serviceaccount.identity.linkerd.cluster.local' }),
		{ ...fromTraefik(appPod), namespace: 'epochcloud-demo-prod' }
	]);
	await refresh('linkerd', 3_500);
	expect(await snapshotResponse('linkerd', 3_500).json()).toMatchObject(NOT_RUNNING);
});

it('is connected when an mTLS series from Traefik reaches an app pod, whatever default-policy series are around', async () => {
	prometheus([defaultPolicy(newAppPod), defaultPolicy(betterauthPod), fromTraefik(appPod)]);
	await refresh('linkerd', 4_000);
	const response = snapshotResponse('linkerd', 4_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
});

it('fails, with 503, only when the query does not answer', async () => {
	prometheus([fromTraefik(appPod)], true);
	await refresh('linkerd', 5_000);
	const response = snapshotResponse('linkerd', 5_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
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
