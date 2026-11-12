import type { RequestHandler } from './$types';
import { lookupLimiter } from '#lib/server/access.js';
import { config } from '#lib/server/config.js';
import { json, isTimeout } from '#lib/server/http.js';
import { getSession, hasSessionCookie } from '#lib/server/session.js';

// What the server sees behind the browser's cookies: who, whether the address
// is verified and when the session ends. Anonymous is a normal answer (200), and
// without a session cookie there is nothing to look up. A request with one costs
// a lookup, so those are limited per client address.
export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	if (!config.betterauth.enabled) return json({ success: true, signed_in: false, session: null });
	if (!hasSessionCookie(request)) return json({ success: true, signed_in: false, session: null });

	let client = 'unknown';
	try {
		client = getClientAddress();
	} catch {
		// no address behind this connection: one shared bucket
	}
	const limited = await lookupLimiter.take(client);
	if (limited) return limited;
	try {
		const session = await getSession(request);
		return json({ success: true, signed_in: session !== null, session });
	} catch (err) {
		return json({ success: false, timeout: isTimeout(err), message: 'the sign-in service did not answer' }, 502);
	}
};
