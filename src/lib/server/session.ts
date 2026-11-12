import { config } from './config.js';
import { SESSION_TIMEOUT_MS } from '../limits.js';
import { upstream } from './http.js';

export interface Session {
	user: { id: string; email: string; name: string; emailVerified: boolean };
	expiresAt: string;
}

/** True when the request carries a BetterAuth session cookie (`<prefix>.session_token`). */
export function hasSessionCookie(request: Request): boolean {
	return (request.headers.get('cookie') ?? '').split(';').some((pair) => (pair.split('=')[0]?.trim() ?? '').endsWith('session_token'));
}

/**
 * The BetterAuth session behind the request's cookies, or null. This is the one
 * function the app asks who is signed in; the login behind it is replaceable.
 * With no session cookie there is nothing to look up, so a visitor without one
 * never causes an upstream call.
 */
export async function getSession(request: Request): Promise<Session | null> {
	if (!config.betterauth.enabled || !hasSessionCookie(request)) return null;
	const cookie = request.headers.get('cookie') ?? '';
	const resp = await upstream(`${config.betterauth.url}/api/auth/get-session`, { headers: { cookie } }, SESSION_TIMEOUT_MS);
	if (!resp.ok) return null;
	const body = (await resp.json().catch(() => null)) as { user?: Record<string, unknown>; session?: Record<string, unknown> } | null;
	const user = body?.user;
	const session = body?.session;
	if (!user || !session || typeof user.id !== 'string' || typeof user.email !== 'string') return null;
	return {
		user: { id: user.id, email: user.email, name: typeof user.name === 'string' ? user.name : '', emailVerified: user.emailVerified === true },
		expiresAt: typeof session.expiresAt === 'string' ? session.expiresAt : ''
	};
}
