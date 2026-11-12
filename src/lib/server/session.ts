import { config } from './config.js';
import { json, upstream } from './http.js';

export interface Session {
	user: { id: string; email: string; name: string; emailVerified: boolean };
	expiresAt: string;
}

/**
 * The BetterAuth session behind the request's cookies, or null. The lookup is
 * the only source of identity: handlers never read a user or address from the
 * request itself.
 */
export async function getSession(request: Request): Promise<Session | null> {
	if (!config.betterauth.enabled) return null;
	const cookie = request.headers.get('cookie');
	if (!cookie) return null;
	const resp = await upstream(`${config.betterauth.url}/api/auth/get-session`, { headers: { cookie } });
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

/** A verified session, or the JSON refusal that says why there is none. */
export async function requireVerifiedSession(request: Request): Promise<{ session: Session } | { refusal: Response }> {
	let session: Session | null;
	try {
		session = await getSession(request);
	} catch (err) {
		return {
			refusal: json({ success: false, reason: 'auth-unavailable', error: `session lookup failed: ${String(err instanceof Error ? err.message : err)}` }, 503)
		};
	}
	if (!session) return { refusal: json({ success: false, reason: 'unauthenticated', error: 'sign in to try this' }, 401) };
	if (!session.user.emailVerified) return { refusal: json({ success: false, reason: 'unverified', error: 'verify your email address to try this' }, 403) };
	return { session };
}
