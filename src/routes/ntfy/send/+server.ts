import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { guard, unavailable } from '#lib/server/guard.js';
import { json } from '#lib/server/http.js';
import { topicFor, publish } from '#lib/server/ntfy.js';
import { claimCooldown } from '#lib/server/valkey.js';

const COOLDOWN_SECONDS = 30;

// One fixed notification to the signed-in user's own topic. Neither the topic
// nor the text comes from the request.
export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	if (!config.ntfy.enabled) return unavailable('ntfy');
	const topic = topicFor(auth.session.user.id);

	if (!(await claimCooldown(`ntfy:${auth.session.user.id}`, COOLDOWN_SECONDS))) {
		return json({ success: false, error: `one notification per ${COOLDOWN_SECONDS} seconds`, retry_after_seconds: COOLDOWN_SECONDS }, 429);
	}
	try {
		await publish(topic, 'EpochCloud demo', 'This notification came from the EpochCloud demo.');
		return json({ success: true, topic });
	} catch {
		return json({ success: false, error: 'ntfy did not accept the message' }, 502);
	}
};
