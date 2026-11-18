import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
const config = vi.hoisted(() => ({ podNamespace: 'epochcloud-demo-dev', entrypointUrl: '' }));
vi.mock('#lib/server/config.js', () => ({ config }));
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
// to them. The evidence is Traefik's own proxy: its outbound request_total
// series toward the app carry the destination (dst_namespace and
// dst_serviceaccount) and tls. The server side of the app is not read: the proxy
// creates default-policy series (plaintext, "all-unauthenticated", "default"
// route) at start-up, and the BetterAuth pods share port 3000 in the namespace.

type Labels = Record<string, string>;
const NAMESPACE = 'epochcloud-demo-dev';
const TRAEFIK = 'traefik.traefik.serviceaccount.identity.linkerd.cluster.local';

/** A series Traefik's proxy exports for requests it sends toward a destination (live label shape). */
const outbound = (dst: { namespace: string; serviceaccount: string; pod: string }, extra: Labels = {}): Labels => ({
	direction: 'outbound',
	dst_control_plane_ns: 'linkerd',
	dst_namespace: dst.namespace,
	dst_pod: dst.pod,
	dst_replicaset: dst.pod.replace(/-[a-z0-9]{5}$/, ''),
	dst_serviceaccount: dst.serviceaccount,
	instance: '10.244.0.123:4191',
	job: 'linkerd-proxy',
	namespace: 'traefik',
	pod: 'traefik-stpg2',
	server_id: `${dst.serviceaccount}.${dst.namespace}.serviceaccount.identity.linkerd.cluster.local`,
	target_addr: '10.244.5.58:3000',
	target_ip: '10.244.5.58',
	target_port: '3000',
	tls: 'true',
	...extra
});
const toApp = (extra: Labels = {}, namespace = NAMESPACE) =>
	outbound({ namespace, serviceaccount: 'epochcloud-demo', pod: 'epochcloud-demo-c888dc596-mw77d' }, extra);
/** The same series from Prometheus's own proxy, which scrapes the app and so also sends it requests (live label shape). */
const fromPrometheus = (extra: Labels = {}) =>
	toApp({ namespace: 'monitoring', pod: 'prometheus-kube-prometheus-stack-prometheus-0', instance: '10.244.0.5:4191', ...extra });
const toBetterauth = (extra: Labels = {}) =>
	outbound({ namespace: NAMESPACE, serviceaccount: 'epochcloud-demo-betterauth', pod: 'epochcloud-demo-betterauth-bd44b6d7f-kd2th' }, extra);

/** A series a meshed pod's own proxy exports for requests it receives (live label shape). */
const inbound = (pod: string, extra: Labels = {}): Labels => ({
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
const defaultPolicyOnNewAppPod = () => inbound('epochcloud-demo-64579cf5cf-2sbqz');
const defaultPolicyOnBetterauthPod = () => inbound('epochcloud-demo-betterauth-bd44b6d7f-kd2th');
const inboundFromTraefik = () => inbound('epochcloud-demo-c888dc596-mw77d', { tls: 'true', client_id: TRAEFIK, no_tls_reason: '' });

/** The label matchers of a query, applied to a series; an absent label is empty, as in PromQL. Refuses any operator it does not implement. */
function selects(query: string, labels: Labels): boolean {
	for (const [, name, op, raw] of query.matchAll(/(\w+)\s*(=~|!~|!=|=)\s*"((?:[^"\\]|\\.)*)"/g)) {
		if (op !== '=' && op !== '!=' && op !== '=~') throw new Error(`the fake Prometheus does not implement the ${op} matcher`);
		const value = (raw ?? '').replaceAll('\\\\', '\\');
		const actual = labels[name ?? ''] ?? '';
		if (op === '=' && actual !== value) return false;
		if (op === '!=' && actual === value) return false;
		if (op === '=~' && !new RegExp(`^(?:${value})$`).test(actual)) return false;
	}
	return true;
}

function prometheus(series: Labels[], failing: boolean | ((query: string) => boolean) = false) {
	vi.stubGlobal('fetch', async (url: string) => {
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		if (typeof failing === 'function' ? failing(q) : failing) return new Response('boom', { status: 500 });
		// The existence form: count(last_over_time(request_total{...}[10m])) counts the series in the window.
		const count = q.startsWith('count(last_over_time(request_total{') ? series.filter((labels) => selects(q, labels)).length : 0;
		return Response.json({ status: 'success', data: { result: count ? [{ metric: {}, value: [0, String(count)] }] : [] } });
	});
}

beforeEach(() => {
	vi.unstubAllGlobals();
	config.entrypointUrl = '';
});

const NOT_RUNNING = { connected: false, state: 'not-running', reason: 'No request from Traefik to the app in the last 10 minutes' };

it('refuses a matcher operator it does not implement', () => {
	expect(() => selects('count(last_over_time(request_total{tls!~"tru.*"}[10m]))', toApp())).toThrow('does not implement the !~ matcher');
	expect(selects('request_total{tls="true",dst_namespace=~"epochcloud-demo-.*",direction!="inbound"}', toApp())).toBe(true);
});

it('is not running, with 200, when Traefik sent the app no request in the window', async () => {
	prometheus([]);
	await refresh('linkerd', 1_000);
	const response = snapshotResponse('linkerd', 1_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it('is not running, never failed, on the default-policy series a new pod and a BetterAuth pod create', async () => {
	prometheus([defaultPolicyOnNewAppPod(), defaultPolicyOnBetterauthPod(), inboundFromTraefik()]);
	await refresh('linkerd', 2_000);
	const response = snapshotResponse('linkerd', 2_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it("is not running when the only series toward the app are Prometheus's own scrapes", async () => {
	prometheus([fromPrometheus()]);
	await refresh('linkerd', 2_500);
	const response = snapshotResponse('linkerd', 2_500);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it('does not fail on a plaintext series from a source other than Traefik', async () => {
	prometheus([fromPrometheus({ tls: 'no_identity', no_tls_reason: 'no_tls_from_remote' })]);
	await refresh('linkerd', 2_600);
	expect(await snapshotResponse('linkerd', 2_600).json()).toMatchObject(NOT_RUNNING);
	prometheus([toApp(), fromPrometheus({ tls: 'no_identity', no_tls_reason: 'no_tls_from_remote' })]);
	await refresh('linkerd', 2_700);
	expect(await snapshotResponse('linkerd', 2_700).json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
});

it('does not count what Traefik sends to BetterAuth, or to the app of another environment', async () => {
	prometheus([toBetterauth(), toBetterauth({ tls: 'no_identity' }), toApp({}, 'epochcloud-demo-prod'), toApp({ tls: 'no_identity' }, 'epochcloud-demo-prod')]);
	await refresh('linkerd', 3_000);
	const response = snapshotResponse('linkerd', 3_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject(NOT_RUNNING);
});

it('is connected when Traefik sends the app requests over mTLS, whatever default-policy series are around', async () => {
	prometheus([toApp(), defaultPolicyOnNewAppPod(), defaultPolicyOnBetterauthPod()]);
	await refresh('linkerd', 4_000);
	const response = snapshotResponse('linkerd', 4_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
});

it.each(['no_identity', 'false'])('fails, with 503, when Traefik sent the app requests with tls %s, even beside mTLS series', async (tls) => {
	prometheus([toApp(), toApp({ tls, no_tls_reason: 'no_tls_from_remote' })]);
	await refresh('linkerd', 5_000);
	const response = snapshotResponse('linkerd', 5_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

it.each([
	['plaintext', (query: string) => query.includes('tls!="true"')],
	['mTLS', (query: string) => query.includes('tls="true"')]
])('fails, with 503, when only the %s query does not answer', async (_name, failing) => {
	prometheus([toApp()], failing);
	await refresh('linkerd', 5_500);
	expect(snapshotResponse('linkerd', 5_500).status).toBe(503);
});

it('fails, with 503, when the queries do not answer', async () => {
	prometheus([toApp()], true);
	await refresh('linkerd', 6_000);
	const response = snapshotResponse('linkerd', 6_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

// An idle demo: the series Traefik's proxy keeps toward the app disappear after
// ten idle minutes, and a request recreates one that Prometheus holds from its
// next scrape on. The check sends that request itself, through the public
// entrypoint, and reads what earlier runs sent.
const ENTRYPOINT = 'https://demo-dev.test';

/** A fake Prometheus plus a fake entrypoint: the entrypoint's answer, and the series a request leaves for the scrape to publish. */
function idleWorld(entrypoint: () => Response | Promise<Response>, leaves: Labels[] = []) {
	const published: Labels[] = [];
	const pending: Labels[] = [];
	const probes: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		if (url.startsWith(ENTRYPOINT)) {
			probes.push(url);
			pending.push(...leaves);
			return entrypoint();
		}
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		const count = published.filter((labels) => selects(q, labels)).length;
		return Response.json({ status: 'success', data: { result: count ? [{ metric: {}, value: [0, String(count)] }] : [] } });
	});
	/** Prometheus scrapes the proxy: what the requests left becomes queryable. */
	const scrape = () => void published.push(...pending.splice(0));
	return { published, probes, scrape };
}

it('sends a request through the entrypoint on every run, and says so when the series is not scraped yet', async () => {
	config.entrypointUrl = ENTRYPOINT;
	const world = idleWorld(() => new Response('{}'));
	await refresh('linkerd', 8_100);
	expect(world.probes).toEqual([`${ENTRYPOINT}/health`]);
	const response = snapshotResponse('linkerd', 8_100);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: false, state: 'not-running', reason: expect.stringContaining('Probed the entrypoint just now') });
});

it('is connected on an idle demo from the second run, on the series the first run's request created', async () => {
	config.entrypointUrl = ENTRYPOINT;
	// The proxy recreates the series on the request; the scrape publishes it before the next run.
	const world = idleWorld(() => new Response('{}'), [toApp()]);
	await refresh('linkerd', 8_200);
	expect(await snapshotResponse('linkerd', 8_200).json()).toMatchObject({ state: 'not-running' });
	world.scrape();
	await refresh('linkerd', 8_300);
	expect(await snapshotResponse('linkerd', 8_300).json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
	expect(world.probes.length).toBe(2);
});

it('still fails, with 503, on a plaintext series from Traefik while the probe is answered', async () => {
	config.entrypointUrl = ENTRYPOINT;
	const world = idleWorld(() => new Response('{}'));
	world.published.push(toApp(), toApp({ tls: 'no_identity', no_tls_reason: 'no_tls_from_remote' }));
	await refresh('linkerd', 8_400);
	expect(snapshotResponse('linkerd', 8_400).status).toBe(503);
});

it('fails, with 503, when the entrypoint does not answer the probe and there is no series to show', async () => {
	config.entrypointUrl = ENTRYPOINT;
	idleWorld(() => new Response('down', { status: 503 }));
	await refresh('linkerd', 8_500);
	const response = snapshotResponse('linkerd', 8_500);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

it('does not hide an unreachable entrypoint behind a no-series answer when the probe throws', async () => {
	config.entrypointUrl = ENTRYPOINT;
	idleWorld(() => {
		throw new Error('connection refused');
	});
	await refresh('linkerd', 8_600);
	expect(snapshotResponse('linkerd', 8_600).status).toBe(503);
});

it('stays connected on real mesh evidence when a probe fails', async () => {
	config.entrypointUrl = ENTRYPOINT;
	const world = idleWorld(() => new Response('down', { status: 503 }));
	world.published.push(toApp());
	await refresh('linkerd', 8_700);
	expect(await snapshotResponse('linkerd', 8_700).json()).toMatchObject({ connected: true, mtls_series_10m: 1 });
});

it('sends no request to the entrypoint, and keeps the no-request answer, where no public address is configured', async () => {
	const world = idleWorld(() => new Response('{}'));
	await refresh('linkerd', 8_800);
	expect(world.probes).toEqual([]);
	expect(await snapshotResponse('linkerd', 8_800).json()).toMatchObject(NOT_RUNNING);
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
