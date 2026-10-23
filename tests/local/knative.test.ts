import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$lib/server/config.js', () => ({ config: { knative: { enabled: true, fibonacciUrl: 'http://fibonacci.test' } } }));
vi.mock('$lib/server/logger.js', () => ({ log: vi.fn() }));

import { GET } from '../../src/routes/knative/invoke/+server.js';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it.each([
	[{ result: 55, duration: 2 }, 55],
	[{ error: 'upstream failure' }, 'upstream failure'],
	[{ unexpected: 'payload' }, '{"unexpected":"payload"}']
])('preserves useful upstream payload values: %j', async (payload, expected) => {
	const fetchUpstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
	vi.stubGlobal('fetch', fetchUpstream);
	const response = await GET({ url: new globalThis.URL('http://demo.test/knative/invoke?n=10') } as Parameters<typeof GET>[0]);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ success: true, n: 10, result: expected });
	expect(fetchUpstream).toHaveBeenCalledOnce();
});

it('preserves bounded retries and the upstream failure response', async () => {
	const fetchUpstream = vi.fn(async () => new Response('unavailable', { status: 503 }));
	vi.stubGlobal('fetch', fetchUpstream);
	const pending = GET({ url: new globalThis.URL('http://demo.test/knative/invoke?n=10') } as Parameters<typeof GET>[0]);
	await vi.runAllTimersAsync();
	const response = await pending;
	expect(response.status).toBe(502);
	expect(await response.json()).toMatchObject({
		success: false,
		error: 'Knative invoke failed after 3 attempts: Error: cold-start response (status 503, non-JSON body)'
	});
	expect(fetchUpstream).toHaveBeenCalledTimes(3);
});
