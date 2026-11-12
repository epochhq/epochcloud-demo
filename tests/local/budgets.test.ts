import { expect, it, vi } from 'vite-plus/test';
import { CHAOS_MAX_DELAY_MS, CLIENT_TIMEOUT_MS, IDLE_TIMEOUT_SECONDS, STATUS_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS } from '../../src/lib/limits.js';

vi.mock('#lib/server/config.js', () => ({ config: { knative: { enabled: true, fibonacciUrl: 'http://fibonacci.test' } } }));

import { WORST_CASE_MS } from '../../src/lib/server/knative.js';

// Bun cuts a request that writes nothing for the idle timeout. Every wait the
// app performs must end before it, or the visitor receives an empty body.
const idleMs = IDLE_TIMEOUT_SECONDS * 1000;

it('keeps every deliberate or bounded wait well below the server idle timeout', () => {
	const ceiling = idleMs * 0.8;
	expect(UPSTREAM_TIMEOUT_MS).toBeLessThan(ceiling);
	expect(STATUS_TIMEOUT_MS).toBeLessThan(ceiling);
	expect(CHAOS_MAX_DELAY_MS).toBeLessThan(ceiling);
	expect(WORST_CASE_MS).toBeLessThan(ceiling);
});

it('states the idle timeout at the framework default instead of raising it', () => {
	expect(IDLE_TIMEOUT_SECONDS).toBe(10);
});

it('lets the browser outwait the longest chaos action but not the server', () => {
	expect(CLIENT_TIMEOUT_MS).toBeGreaterThan(CHAOS_MAX_DELAY_MS);
	expect(CLIENT_TIMEOUT_MS).toBeLessThan(idleMs);
});
