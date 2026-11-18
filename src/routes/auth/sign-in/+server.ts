import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { addressKey, clientAddress, field, json } from '#lib/server/http.js';
import { unavailable } from '#lib/server/respond.js';
import { WRONG, address, addressLimiter, callAuth, failuresByAccount, failuresByAccountAndAddress, unreachable, withCookies } from '#lib/server/signin.js';

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!config.betterauth.enabled) return unavailable('BetterAuth');
	const client = clientAddress(getClientAddress);
	const limited = await addressLimiter.take(`sign-in:${addressKey(client)}`);
	if (limited) return limited;
	const form = await request.formData();
	const email = address(field(form, 'email'));
	const password = field(form, 'password');
	if (!email || !password) return json({ success: false, reason: 'wrong', error: WRONG }, 401);
	// Only wrong passwords count, so signing in often never locks the owner out.
	const pair = `${email}|${addressKey(client)}`;
	const guarded = (await failuresByAccountAndAddress.check(pair)) ?? (await failuresByAccount.check(email));
	if (guarded) return guarded;

	try {
		const answer = await callAuth('/sign-in/email', { email, password }, url.origin, client);
		if (answer.status === 200) return withCookies(json({ success: true, message: 'Signed in' }), answer.cookies);
		// BetterAuth says "not verified" only to a caller who gave the right password.
		if (answer.status === 403)
			return json({ success: false, reason: 'unverified', error: 'Confirm your address first with the link in the mail we sent.' }, 403);
		if (answer.status === 401) {
			await failuresByAccountAndAddress.take(pair);
			await failuresByAccount.take(email);
			return json({ success: false, reason: 'wrong', error: WRONG }, 401);
		}
		return json({ success: false, error: 'the sign-in service refused the request' }, answer.status === 429 ? 429 : 502);
	} catch (err) {
		return unreachable(err);
	}
};
