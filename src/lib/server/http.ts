import { UPSTREAM_TIMEOUT_MS } from '../limits.js';

/** A JSON answer. Every endpoint answers JSON, also for failure and timeout. */
export function json(body: Record<string, unknown>, status = 200): Response {
	return Response.json({ ...body, timestamp: new Date().toISOString() }, { status });
}

/** True for the error an expired AbortSignal.timeout() raises. */
export function isTimeout(err: unknown): boolean {
	return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/** Call an upstream with a deadline below the server's idle timeout. */
export function upstream(url: string, init: RequestInit = {}, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Response> {
	return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** A text field of a form body; anything else (absent, a file) reads as the fallback. */
export function field(form: FormData, name: string, fallback = ''): string {
	const value = form.get(name);
	return typeof value === 'string' && value !== '' ? value : fallback;
}

/** Ends a wait that nothing answers, so no request outlives the server's idle timeout. */
export function withDeadline<T>(work: Promise<T>, ms: number, what = 'the upstream'): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new globalThis.DOMException(`no answer from ${what} within ${ms}ms`, 'TimeoutError')), ms);
	});
	return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
