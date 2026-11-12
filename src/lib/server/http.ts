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

/**
 * State-changing endpoints accept only form-encoded bodies. SvelteKit's CSRF
 * protection compares the Origin header for exactly those content types, so
 * requiring one guarantees the check runs; a JSON or empty POST is refused.
 */
export function requireFormPost(request: Request): Response | null {
	const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
	if (type === 'application/x-www-form-urlencoded' || type === 'multipart/form-data') return null;
	return json({ success: false, error: 'POST a form-encoded body so the origin check applies' }, 415);
}

/** A text field of a form body; anything else (absent, a file) reads as the fallback. */
export function field(form: FormData, name: string, fallback = ''): string {
	const value = form.get(name);
	return typeof value === 'string' && value !== '' ? value : fallback;
}
