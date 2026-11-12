import { CLIENT_TIMEOUT_MS, SLOW_AFTER_MS } from './limits.js';

/** What a check can show: not run, running, answered, answered slowly or timed out, or failed. */
export type CheckState = 'unchecked' | 'checking' | 'ok' | 'slow' | 'failed';

export const WORDS: Record<CheckState, string> = {
	unchecked: 'Not checked',
	checking: 'Checking',
	ok: 'OK',
	slow: 'Slow',
	failed: 'Failed'
};

export interface CheckResult {
	state: 'ok' | 'slow' | 'failed';
	detail: string;
	ms: number;
	status: number;
	data: Record<string, unknown> | null;
}

export interface CheckOptions {
	init?: RequestInit;
	timeoutMs?: number;
	slowAfterMs?: number;
	fetcher?: typeof fetch;
	now?: () => number;
	/** The text for a good answer; the default is "Connected". */
	describe?: (data: Record<string, unknown>) => string;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Call an endpoint and classify the answer. It never throws and never parses a
 * body it has not checked: the status and the content type come first, so an
 * empty or HTML failure page becomes "Failed" with its status instead of a
 * JSON syntax error. A deadline that expires, or an upstream that reports its
 * own timeout, is "Slow"; so is a good answer that took longer than slowAfterMs.
 */
export async function runCheck(url: string, options: CheckOptions = {}): Promise<CheckResult> {
	const { timeoutMs = CLIENT_TIMEOUT_MS, slowAfterMs = SLOW_AFTER_MS, fetcher = fetch, now = () => performance.now(), describe } = options;
	const started = now();
	const elapsed = () => Math.round(now() - started);

	let resp: Response;
	try {
		resp = await fetcher(url, { ...options.init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (err) {
		const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
		return timedOut
			? { state: 'slow', detail: `No answer within ${seconds(timeoutMs)}`, ms: elapsed(), status: 0, data: null }
			: { state: 'failed', detail: 'The app could not be reached', ms: elapsed(), status: 0, data: null };
	}

	if (!(resp.headers.get('content-type') ?? '').includes('json')) {
		return { state: 'failed', detail: `HTTP ${resp.status} without a JSON body`, ms: elapsed(), status: resp.status, data: null };
	}
	let data: Record<string, unknown>;
	try {
		data = (await resp.json()) as Record<string, unknown>;
	} catch {
		return { state: 'failed', detail: `HTTP ${resp.status} with a broken JSON body`, ms: elapsed(), status: resp.status, data: null };
	}
	const ms = elapsed();

	if (!resp.ok || data.connected === false || data.success === false) {
		if (data.timeout === true) return { state: 'slow', detail: 'The upstream timed out', ms, status: resp.status, data };
		const reason = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `HTTP ${resp.status}`;
		return { state: 'failed', detail: reason, ms, status: resp.status, data };
	}
	const detail = describe ? describe(data) : 'Connected';
	return ms > slowAfterMs
		? { state: 'slow', detail: `${detail} (took ${seconds(ms)})`, ms, status: resp.status, data }
		: { state: 'ok', detail, ms, status: resp.status, data };
}

export interface Action {
	ok: boolean;
	data: Record<string, unknown> | null;
	/** Why it failed, or what was wrong; empty when ok. */
	detail: string;
}

/**
 * Call an endpoint on behalf of a button. Like runCheck it never throws and
 * checks the status and content type before parsing; the caller shows `detail`
 * when `ok` is false.
 */
export async function act(url: string, init?: RequestInit): Promise<Action> {
	const result = await runCheck(url, { init, slowAfterMs: Number.POSITIVE_INFINITY });
	const ok = result.state === 'ok' && result.data !== null;
	return { ok, data: result.data, detail: ok ? '' : result.detail };
}

/** A form-encoded POST body: the shape the server's origin check applies to. */
export function form(fields: Record<string, string> = {}): RequestInit {
	return { method: 'POST', body: new URLSearchParams(fields) };
}
