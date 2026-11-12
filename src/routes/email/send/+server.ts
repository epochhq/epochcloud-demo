import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { unavailable } from '#lib/server/respond.js';
import { json } from '#lib/server/http.js';
import { sendEmail } from '#lib/server/smtp.js';
import { claimCooldown } from '#lib/server/valkey.js';

const COOLDOWN_SECONDS = 300;

// Sends one test mail to the signed-in user's own verified address. The
// recipient is the session's, never the request's, and a cooldown shared by all
// pods (a Valkey SET NX EX key) keeps it to one mail per user per window.
export const POST: RequestHandler = async ({ locals }) => {
	if (!config.smtp.enabled) return unavailable('SMTP');
	const { user } = locals.session!;

	if (!(await claimCooldown(`mail:${user.id}`, COOLDOWN_SECONDS))) {
		return json({ success: false, error: `one test mail per ${COOLDOWN_SECONDS / 60} minutes`, retry_after_seconds: COOLDOWN_SECONDS }, 429);
	}
	try {
		await sendEmail(user.email);
		return json({ success: true, message: `Email sent to ${user.email}` });
	} catch {
		return json({ success: false, error: 'the mail relay did not accept the message' }, 502);
	}
};
