import { expect, it } from 'vite-plus/test';
import { runCheck } from '../../src/lib/check.js';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetcher = (respond: () => Response | Promise<Response>) => (async () => respond()) as unknown as typeof fetch;

// The page decides what to show from these classifications. The empty 500 is
// the failure a cut request produces: it must read as a failure with its
// status, not as a JSON syntax error.

it('classifies an empty 500 as failed, naming the status', async () => {
	const result = await runCheck('/x', { fetcher: fetcher(() => new Response(null, { status: 500 })) });
	expect(result).toMatchObject({ state: 'failed', status: 500, data: null });
	expect(result.detail).toBe('HTTP 500 without a JSON body');
});

it('classifies an upstream-reported timeout as slow and a refused connection as failed', async () => {
	const timedOut = await runCheck('/x', { fetcher: fetcher(() => jsonResponse({ connected: false, timeout: true }, 503)) });
	expect(timedOut.state).toBe('slow');
	const down = await runCheck('/x', { fetcher: fetcher(() => jsonResponse({ connected: false, error: 'refused' }, 503)) });
	expect(down).toMatchObject({ state: 'failed', detail: 'refused' });
});

it('classifies an expired client deadline as slow', async () => {
	const result = await runCheck('/x', {
		fetcher: (async () => {
			throw new globalThis.DOMException('deadline', 'TimeoutError');
		}) as unknown as typeof fetch
	});
	expect(result.state).toBe('slow');
});

it('shows a good but slow answer as slow, a fast one as ok', async () => {
	let clock = 0;
	const slow = await runCheck('/x', {
		now: () => (clock += 4_000),
		fetcher: fetcher(() => jsonResponse({ connected: true }))
	});
	expect(slow.state).toBe('slow');
	clock = 0;
	const fast = await runCheck('/x', { now: () => (clock += 10), fetcher: fetcher(() => jsonResponse({ connected: true })) });
	expect(fast.state).toBe('ok');
});

it('shows a check that did not run as not running, with its reason, neither ok nor failed', async () => {
	const result = await runCheck('/x', {
		fetcher: fetcher(() => jsonResponse({ connected: false, state: 'not-running', reason: 'Unavailable: needs a platform key' }))
	});
	expect(result).toMatchObject({ state: 'notrunning', detail: 'Unavailable: needs a platform key' });
});
