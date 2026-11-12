import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { json, isTimeout } from '#lib/server/http.js';
import { getSession } from '#lib/server/session.js';

// What the server sees behind the browser's cookies: who, whether the address
// is verified and when the session ends. Anonymous is a normal answer (200).
export const GET: RequestHandler = async ({ request }) => {
	if (!config.betterauth.enabled) return json({ success: false, configured: false, message: 'BetterAuth not configured' }, 503);
	try {
		const session = await getSession(request);
		return json({ success: true, signed_in: session !== null, session });
	} catch (err) {
		return json({ success: false, timeout: isTimeout(err), message: 'BetterAuth session lookup failed' }, 502);
	}
};
