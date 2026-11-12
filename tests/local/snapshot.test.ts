import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { NotRunning, defineChecks, refresh, resetSnapshots, snapshotResponse, tick } from '../../src/lib/server/snapshot.js';

// The anonymous page reads a stored snapshot. These tests pin that a request
// never triggers a check, that a failure is never reported as connected, and
// that nothing internal leaks into the answer.

const run = vi.fn();

beforeEach(() => {
	resetSnapshots();
	run.mockReset().mockResolvedValue({ items: 3 });
	defineChecks([{ name: 'db', enabled: () => true, missing: 'no db', run, everyMs: 30_000 }]);
});

it('serves the stored result and never runs a check because a request arrived', async () => {
	expect(snapshotResponse('db').status).toBe(200);
	await refresh('db', 1_000);
	run.mockClear();
	for (let i = 0; i < 5; i++) expect(snapshotResponse('db', 3_000).status).toBe(200);
	expect(run).not.toHaveBeenCalled();
	expect(await snapshotResponse('db', 3_000).json()).toMatchObject({ connected: true, items: 3, age_seconds: 2 });
});

it('refreshes on the schedule only: a check is due once its interval has passed', async () => {
	await tick(100_000);
	await tick(110_000);
	expect(run).toHaveBeenCalledTimes(1);
	await tick(131_000);
	expect(run).toHaveBeenCalledTimes(2);
});

it('is not connected when the check throws, and shows a category rather than the raw error', async () => {
	run.mockRejectedValue(new Error('connect ECONNREFUSED 10.1.2.3:5432'));
	const snapshot = await refresh('db', 1_000);
	expect(snapshot).toMatchObject({ connected: false, timeout: false, error: 'the check failed' });
	const response = snapshotResponse('db', 1_000);
	expect(response.status).toBe(503);
	expect(JSON.stringify(await response.json())).not.toContain('10.1.2.3');
});

it('reports a timeout when the deadline passes while the check is still waiting', async () => {
	run.mockImplementation(() => new Promise(() => {}));
	const deadline = new AbortController();
	const pending = refresh('db', 1_000, deadline.signal);
	deadline.abort(new globalThis.DOMException('deadline', 'TimeoutError'));
	expect(await pending).toMatchObject({ connected: false, timeout: true, error: 'timed out' });
});

it('answers 200 with state not-running, never a 5xx, for a check that did not run', async () => {
	expect(snapshotResponse('db').status).toBe(200);
	expect(await snapshotResponse('db').json()).toMatchObject({ connected: false, state: 'not-running' });

	defineChecks([{ name: 'off', enabled: () => false, missing: 'Unavailable: needs a platform key', run, everyMs: 30_000 }]);
	await refresh('off', 1_000);
	const off = snapshotResponse('off', 1_000);
	expect(off.status).toBe(200);
	expect(await off.json()).toMatchObject({ connected: false, state: 'not-running', reason: 'Unavailable: needs a platform key' });
	expect(run).not.toHaveBeenCalled();

	run.mockRejectedValue(new NotRunning('no traffic yet'));
	await refresh('db', 2_000);
	const quiet = snapshotResponse('db', 2_000);
	expect(quiet.status).toBe(200);
	expect(await quiet.json()).toMatchObject({ state: 'not-running', reason: 'no traffic yet' });
});

it('never reports an unconfigured check as connected', async () => {
	defineChecks([{ name: 'off', enabled: () => false, missing: 'not configured', run, everyMs: 30_000 }]);
	expect((await refresh('off', 1_000)).connected).toBe(false);
});
