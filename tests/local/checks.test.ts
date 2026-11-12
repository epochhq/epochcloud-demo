import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
vi.mock('#lib/server/config.js', () => ({ config: { podNamespace: 'epochcloud-demo-dev' } }));
vi.mock('#lib/server/rabbitmq.js', () => ({}));
vi.mock('#lib/server/valkey.js', () => ({}));
vi.mock('#lib/server/cnpg.js', () => ({}));
vi.mock('#lib/server/smtp.js', () => ({}));
vi.mock('#lib/server/knative.js', () => ({}));
vi.mock('#lib/server/defectdojo.js', () => ({}));

import '../../src/lib/server/checks.js';
import { refresh, snapshotResponse } from '../../src/lib/server/snapshot.js';

// The Linkerd tab's check. No request at all through the entrypoint is not a
// failure; requests that reached the app without mTLS, or a query that fails,
// are.

type Answers = { entry?: number | 'empty' | 'error'; mtls?: number | 'empty' | 'error'; proofs?: 'error' };
function prometheus(answers: Answers) {
	vi.stubGlobal('fetch', async (url: string) => {
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		const pick = q.includes('traefik_service_requests_total') ? answers.entry : q.includes('tls="true"') ? answers.mtls : 0;
		if (pick === 'error') return new Response('boom', { status: 500 });
		if (pick === 'empty') return Response.json({ status: 'success', data: { result: [] } });
		return Response.json({ status: 'success', data: { result: [{ metric: {}, value: [0, String(pick)] }] } });
	});
}

beforeEach(() => vi.unstubAllGlobals());

it('is not running, with 200, when no request came through the entrypoint at all', async () => {
	prometheus({ entry: 'empty', mtls: 'empty' });
	await refresh('linkerd', 1_000);
	const response = snapshotResponse('linkerd', 1_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: false, state: 'not-running' });
	prometheus({ entry: 0, mtls: 0 });
	await refresh('linkerd', 2_000);
	expect(await snapshotResponse('linkerd', 2_000).json()).toMatchObject({ state: 'not-running' });
});

it('fails, with 503, when requests came through the entrypoint but none reached the app over mTLS', async () => {
	prometheus({ entry: 40, mtls: 0 });
	await refresh('linkerd', 3_000);
	const response = snapshotResponse('linkerd', 3_000);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ connected: false, error: 'the check failed' });
});

it('fails, with 503, when Prometheus does not answer the mesh queries', async () => {
	prometheus({ entry: 'error', mtls: 'error' });
	await refresh('linkerd', 4_000);
	expect(snapshotResponse('linkerd', 4_000).status).toBe(503);
});

it('is connected when requests came through the entrypoint and reached the app over mTLS', async () => {
	prometheus({ entry: 40, mtls: 38 });
	await refresh('linkerd', 5_000);
	const response = snapshotResponse('linkerd', 5_000);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ connected: true, mtls_requests_10m: 38 });
});
