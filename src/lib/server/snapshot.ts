import { SNAPSHOT_INTERVAL_MS, STATUS_TIMEOUT_MS } from '../limits.js';
import { isTimeout, json } from './http.js';

// The anonymous page reads a status snapshot the server refreshes on its own
// schedule. A visitor loading the page never causes an upstream call: the
// work is bounded by the check count and the interval, not by traffic.

/** Thrown by a check that could not run for a reason that is not a failure (no traffic yet, say). */
export class NotRunning extends Error {}

export interface Check {
	name: string;
	/** False when the integration is not configured. */
	enabled: () => boolean;
	/** Why it is not running when it is not configured or unavailable by design; shown instead of a result. */
	missing: string;
	/** Resolves with extra fields when healthy; throws when not. */
	run: (signal: AbortSignal) => Promise<Record<string, unknown> | void>;
	/** Refresh period; defaults to SNAPSHOT_INTERVAL_MS. */
	everyMs?: number;
}

export interface Snapshot {
	connected: boolean;
	/** "not-running": the check did not run, which is not a failure and carries no 5xx. */
	state?: 'not-running';
	reason?: string;
	timeout?: boolean;
	error?: string;
	checkedAt: number;
	[extra: string]: unknown;
}

const checks = new Map<string, Check>();
const results = new Map<string, Snapshot>();
const lastRun = new Map<string, number>();

export function defineChecks(list: Check[]): void {
	for (const check of list) checks.set(check.name, check);
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(signal.reason ?? new globalThis.DOMException('aborted', 'TimeoutError'));
		if (signal.aborted) return onAbort();
		signal.addEventListener('abort', onAbort, { once: true });
		work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
	});
}

/** Run one check now and store what it found. Never throws. */
export async function refresh(name: string, now = Date.now(), signal = AbortSignal.timeout(STATUS_TIMEOUT_MS)): Promise<Snapshot> {
	const check = checks.get(name);
	if (!check) throw new Error(`unknown check ${name}`);
	lastRun.set(name, now);
	let snapshot: Snapshot;
	if (!check.enabled()) {
		snapshot = { connected: false, state: 'not-running', reason: check.missing, checkedAt: now };
	} else {
		try {
			snapshot = { connected: true, ...(await abortable(check.run(signal), signal)), checkedAt: now };
		} catch (err) {
			if (err instanceof NotRunning) {
				snapshot = { connected: false, state: 'not-running', reason: err.message, checkedAt: now };
				results.set(name, snapshot);
				return snapshot;
			}
			// The raw error text can carry internal addresses; the page gets a
			// category, the logs get the detail from the check itself.
			snapshot = { connected: false, timeout: isTimeout(err), error: isTimeout(err) ? 'timed out' : 'the check failed', checkedAt: now };
		}
	}
	results.set(name, snapshot);
	return snapshot;
}

/** Refresh every check that is due. The tick is the only caller of upstreams. */
export async function tick(now = Date.now()): Promise<void> {
	const due = [...checks.values()].filter((check) => now - (lastRun.get(check.name) ?? 0) >= (check.everyMs ?? SNAPSHOT_INTERVAL_MS));
	await Promise.allSettled(due.map((check) => refresh(check.name, now)));
}

export function startSnapshots(): void {
	void tick();
	setInterval(() => void tick(), 5_000).unref?.();
}

/** The stored result as an HTTP answer: 200 when connected, 503 otherwise. */
export function snapshotResponse(name: string, now = Date.now()): Response {
	const check = checks.get(name);
	if (!check) return json({ connected: false, error: 'unknown check' }, 404);
	const snapshot = results.get(name);
	if (!snapshot) return json({ connected: false, state: 'not-running', reason: 'the first check has not finished yet' });
	const { checkedAt, ...rest } = snapshot;
	// A check that did not run is not a failure: 200, never a 5xx. Only a check that
	// ran and found its integration down answers 503.
	return json({ ...rest, age_seconds: Math.max(0, Math.round((now - checkedAt) / 1000)) }, snapshot.connected || snapshot.state === 'not-running' ? 200 : 503);
}

export function resetSnapshots(): void {
	checks.clear();
	results.clear();
	lastRun.clear();
}
