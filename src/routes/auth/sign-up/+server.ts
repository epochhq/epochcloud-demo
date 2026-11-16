import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { addressKey, clientAddress, field, json } from '#lib/server/http.js';
import { unavailable } from '#lib/server/respond.js';
import { SENT, address, addressLimiter, callAuth, claimMail, unreachable } from '#lib/server/signin.js';

// BetterAuth answers an existing address exactly like a new one (it requires
// email verification), and so does this route.
export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!config.betterauth.enabled) return unavailable('BetterAuth');
	const client = clientAddress(getClientAddress);
	const limited = await addressLimiter.take(`sign-up:${addressKey(client)}`);
	if (limited) return limited;
	const form = await request.formData();
	const email = address(field(form, 'email'));
	const password = field(form, 'password');
	const name = field(form, 'name').trim().slice(0, 100);
	if (!email) return json({ success: false, error: 'enter a valid email address' }, 400);
	// BetterAuth's default password bounds, checked before the cooldown is spent.
	if (password.length < 8 || password.length > 128) return json({ success: false, error: 'use a password of 8 to 128 characters' }, 400);
	const cooling = await claimMail(email);
	if (cooling) return cooling;

	try {
		const answer = await callAuth('/sign-up/email', { name: name || email.split('@')[0]!, email, password, callbackURL: `${url.origin}/` }, url.origin, client);
		if (answer.status === 200) return json({ success: true, message: SENT });
		if (answer.status === 400) return json({ success: false, error: answer.message || 'the sign-up was refused' }, 400);
		return json({ success: false, error: 'the sign-in service refused the request' }, answer.status === 429 ? 429 : 502);
	} catch (err) {
		return unreachable(err);
	}
};
