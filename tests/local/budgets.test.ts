import { expect, it, vi } from 'vite-plus/test';
import {
	CHAIN_CEILING_MS,
	CLIENT_TIMEOUT_MS,
	DB_DEADLINE_MS,
	HANDLER_WAITS,
	IDLE_TIMEOUT_SECONDS,
	KNATIVE_WORST_CASE_MS,
	MAIL_DEADLINE_MS,
	PUBLISH_CONFIRM_MS,
	SESSION_TIMEOUT_MS,
	STATUS_TIMEOUT_MS,
	UPSTREAM_TIMEOUT_MS
} from '../../src/lib/limits.js';

vi.mock('#lib/server/config.js', () => ({ config: { knative: { enabled: true, fibonacciUrl: 'http://fibonacci.test' } } }));

import { ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS, RETRY_BACKOFF_MS } from '../../src/lib/server/knative.js';

// Bun cuts a request that writes nothing for the idle timeout. A handler can run
// several waits in a row (the session lookup, then its own calls), so the sum of
// each chain is what has to stay under the limit, not each constant alone.
const idleMs = IDLE_TIMEOUT_SECONDS * 1000;

const routes = Object.keys(import.meta.glob('/src/routes/**/+server.ts')).map((file) => file.replace('/src/routes', '').replace('/+server.ts', ''));
const ANONYMOUS_PREFIXES = ['/status/[name]', '/api/faro/collect', '/auth/session', '/health', '/metrics', '/robots.txt', '/version'];

it.each(Object.entries(HANDLER_WAITS))('keeps the whole chain of %s under the idle timeout', (_route, waits) => {
	expect(waits.reduce((sum, wait) => sum + wait, 0)).toBeLessThanOrEqual(CHAIN_CEILING_MS);
});

it('lists the waits of every signed-in route, so a new route cannot skip the budget', () => {
	const signedIn = routes.filter((route) => !ANONYMOUS_PREFIXES.includes(route));
	expect(Object.keys(HANDLER_WAITS).sort()).toEqual(signedIn.sort());
});

it('builds the Knative chain from the retry settings the handler really uses', () => {
	expect(MAX_ATTEMPTS * ATTEMPT_TIMEOUT_MS + (RETRY_BACKOFF_MS * (MAX_ATTEMPTS * (MAX_ATTEMPTS - 1))) / 2).toBe(KNATIVE_WORST_CASE_MS);
});

it('keeps every single wait, and the status check, inside the ceiling', () => {
	for (const wait of [SESSION_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS, DB_DEADLINE_MS, MAIL_DEADLINE_MS, PUBLISH_CONFIRM_MS, STATUS_TIMEOUT_MS])
		expect(wait).toBeLessThanOrEqual(CHAIN_CEILING_MS);
});

it('states the idle timeout at the framework default instead of raising it', () => {
	expect(IDLE_TIMEOUT_SECONDS).toBe(10);
});

it('lets the browser outwait a chain but not the server', () => {
	expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CHAIN_CEILING_MS);
	expect(CLIENT_TIMEOUT_MS).toBeLessThan(idleMs);
});
