import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { clientAddress, json } from '#lib/server/http.js';
import { unavailable } from '#lib/server/respond.js';
import { hasSessionCookie } from '#lib/server/session.js';
import { addressLimiter, callAuth, unreachable, withCookies } from '#lib/server/signin.js';

// Ends the session at BetterAuth and passes on the cookies that clear it.
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!config.betterauth.enabled) return unavailable('BetterAuth');
	if (!hasSessionCookie(request)) return json({ success: true, message: 'Signed out' });
	const client = clientAddress(getClientAddress);
	const limited = await addressLimiter.take(`sign-out:${client}`);
	if (limited) return limited;
	try {
		const answer = await callAuth('/sign-out', {}, url.origin, client, request.headers.get('cookie') ?? '');
		if (answer.status !== 200) return json({ success: false, error: 'the sign-in service refused the request' }, 502);
		return withCookies(json({ success: true, message: 'Signed out' }), answer.cookies);
	} catch (err) {
		return unreachable(err);
	}
};
