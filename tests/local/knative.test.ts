import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('#lib/server/config.js', () => ({ config: { knative: { enabled: true, fibonacciUrl: 'http://fibonacci.test' } } }));

import { MAX_ATTEMPTS, invokeFibonacci } from '../../src/lib/server/knative.js';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(0);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it.each([[{ result: 55, duration: 2 }], [{ error: 'upstream failure' }], [{ unexpected: 'payload' }]])(
	'returns the upstream payload as is: %j',
	async (payload) => {
		const fetchUpstream = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
		vi.stubGlobal('fetch', fetchUpstream);
		await expect(invokeFibonacci(10)).resolves.toEqual(payload);
		expect(fetchUpstream).toHaveBeenCalledOnce();
	}
);

it('retries a cold start a bounded number of times, then fails', async () => {
	const fetchUpstream = vi.fn(async () => new Response('unavailable', { status: 503 }));
	vi.stubGlobal('fetch', fetchUpstream);
	const pending = invokeFibonacci(10);
	const assertion = expect(pending).rejects.toThrow('cold-start response (status 503, non-JSON body)');
	await vi.runAllTimersAsync();
	await assertion;
	expect(fetchUpstream).toHaveBeenCalledTimes(MAX_ATTEMPTS);
});
