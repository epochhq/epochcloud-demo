import { createHash } from 'node:crypto';
import { config } from './config.js';
import { isTimeout, json, upstream } from './http.js';
import { createLimiter } from './ratelimit.js';
import { claimCooldown } from './valkey.js';

// The page's sign-up, sign-in and sign-out. The browser posts a form to the app
// (the page's CSP allows no other origin), and the app calls its BetterAuth on
// the in-cluster address with the page's origin and the caller's address, then
// hands BetterAuth's cookies back. Answers never say whether an address is
// registered (OWASP Authentication Cheat Sheet).

/** Per client address and route: room for a few typos, not for a script. Per pod. */
export const addressLimiter = createLimiter({ points: 10, durationSeconds: 60 });
/** Password attempts on one account from any address. Per pod. */
export const accountLimiter = createLimiter({ points: 10, durationSeconds: 15 * 60 });
/** At most one confirmation mail per target address in this window, across pods. */
export const MAIL_COOLDOWN_SECONDS = 300;

export const WRONG = 'The address or the password is wrong.';
export const SENT = 'If the address can be used, a link to confirm it is on its way. Follow it to finish signing in.';

export interface AuthAnswer {
	status: number;
	message: string;
	cookies: string[];
}

/** One call to BetterAuth's API. Throws when it does not answer in time. */
export async function callAuth(path: string, body: Record<string, string>, origin: string, client: string, cookie = ''): Promise<AuthAnswer> {
	const headers: Record<string, string> = { 'content-type': 'application/json', origin, 'x-forwarded-for': client };
	if (cookie) headers.cookie = cookie;
	const resp = await upstream(`${config.betterauth.url}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
	const data = (await resp.json().catch(() => null)) as { message?: unknown } | null;
	return { status: resp.status, message: typeof data?.message === 'string' ? data.message : '', cookies: resp.headers.getSetCookie() };
}

/** A JSON answer that also sets BetterAuth's cookies on the page's origin. */
export function withCookies(response: Response, cookies: string[]): Response {
	for (const cookie of cookies) response.headers.append('set-cookie', cookie);
	return response;
}

export const unreachable = (err: unknown) =>
	json({ success: false, reason: 'auth-unavailable', timeout: isTimeout(err), error: 'the sign-in service did not answer' }, 503);

/**
 * Claims the one confirmation mail a target address may get in the cooldown.
 * The key is a digest, so no address is stored. Without Valkey nothing is sent.
 */
export async function claimMail(email: string): Promise<Response | null> {
	const key = createHash('sha256').update(email).digest('hex').slice(0, 32);
	if (await claimCooldown(`verify-mail:${key}`, MAIL_COOLDOWN_SECONDS)) return null;
	return json({ success: false, error: `a confirmation mail for this address went out in the last ${MAIL_COOLDOWN_SECONDS / 60} minutes` }, 429);
}

/** The address as BetterAuth stores it, or '' when it cannot be one. */
export function address(value: string): string {
	const email = value.trim().toLowerCase();
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
