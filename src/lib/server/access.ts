import { addressKey, json } from './http.js';
import { createLimiter } from './ratelimit.js';
import { getSession, hasSessionCookie, type Session } from './session.js';

// Who may call what, decided once in the `handle` hook. A route is anonymous
// only if it is listed here; every other route needs a verified sign-in, and a
// request that changes anything must be a form-encoded POST so SvelteKit's
// origin check applies. A new route is therefore closed until someone opens it
// on purpose, and tests/local/access.test.ts holds the list.
// Signing up, in and out and asking for the confirmation mail again are open
// to visitors on purpose: they are how a visitor gets a session. They still
// change state, so they take form POSTs only, and src/lib/server/signin.ts
// bounds each per client address and per target mail address.
export const SIGN_IN_ROUTES = ['/auth/sign-in', '/auth/sign-up', '/auth/sign-out', '/auth/resend'];
export const ANONYMOUS_ROUTES = ['/', '/health', '/version', '/robots.txt', '/metrics', '/auth/session', '/api/faro/collect', ...SIGN_IN_ROUTES];
export const ANONYMOUS_PREFIXES = ['/status/', '/_app/'];

export const isAnonymous = (pathname: string): boolean =>
	ANONYMOUS_ROUTES.includes(pathname) || ANONYMOUS_PREFIXES.some((prefix) => pathname.startsWith(prefix));

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const FORM_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data']);

// Per user, after sign-in. Per client address, before the session lookup: a
// request that carries any cookie costs one upstream call, so those are bounded.
export const userLimiter = createLimiter({ points: 60, durationSeconds: 60 });
export const lookupLimiter = createLimiter({ points: 60, durationSeconds: 60 });

/** Null when the request may proceed; otherwise the refusal. `session` is set on success. */
export async function authorize(request: Request, pathname: string, client: string): Promise<{ refusal: Response } | { session: Session | null }> {
	const signIn = SIGN_IN_ROUTES.includes(pathname);
	if (isAnonymous(pathname) && !signIn) return { session: null };

	if (!SAFE_METHODS.has(request.method)) {
		const type = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
		if (!FORM_TYPES.has(type)) return { refusal: json({ success: false, error: 'POST a form-encoded body so the origin check applies' }, 415) };
	}
	if (signIn) return { session: null };
	if (!hasSessionCookie(request)) return { refusal: json({ success: false, reason: 'unauthenticated', error: 'sign in to try this' }, 401) };

	const limitedLookup = await lookupLimiter.take(addressKey(client));
	if (limitedLookup) return { refusal: limitedLookup };

	let session: Session | null;
	try {
		session = await getSession(request, client);
	} catch {
		return {
			refusal: json({ success: false, reason: 'auth-unavailable', error: 'the sign-in service could not check your session; try again in a moment' }, 503)
		};
	}
	if (!session) return { refusal: json({ success: false, reason: 'unauthenticated', error: 'sign in to try this' }, 401) };
	if (!session.user.emailVerified) return { refusal: json({ success: false, reason: 'unverified', error: 'verify your email address to try this' }, 403) };

	const limited = await userLimiter.take(session.user.id);
	if (limited) return { refusal: limited };
	return { session };
}
