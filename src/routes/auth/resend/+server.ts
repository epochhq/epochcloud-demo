import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { addressKey, clientAddress, field, json } from '#lib/server/http.js';
import { unavailable } from '#lib/server/respond.js';
import { SENT, address, addressLimiter, callAuth, claimMail, unreachable } from '#lib/server/signin.js';

// Sends the confirmation mail again. BetterAuth answers the same for an unknown,
// an unconfirmed and a confirmed address, and so does this route.
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!config.betterauth.enabled) return unavailable('BetterAuth');
	const client = clientAddress(getClientAddress);
	const limited = await addressLimiter.take(`resend:${addressKey(client)}`);
	if (limited) return limited;
	const email = address(field(await request.formData(), 'email'));
	if (!email) return json({ success: false, error: 'enter a valid email address' }, 400);
	const cooling = await claimMail(email);
	if (cooling) return cooling;

	try {
		const answer = await callAuth('/send-verification-email', { email, callbackURL: `${url.origin}/` }, url.origin, client);
		if (answer.status === 200) return json({ success: true, message: SENT });
		return json({ success: false, error: 'the sign-in service refused the request' }, answer.status === 429 ? 429 : 502);
	} catch (err) {
		return unreachable(err);
	}
};
