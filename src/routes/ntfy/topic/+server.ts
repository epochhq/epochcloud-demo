import type { RequestHandler } from './$types';
import { guard } from '#lib/server/guard.js';
import { json } from '#lib/server/http.js';
import { topicFor } from '#lib/server/ntfy.js';

// The caller's own topic, so the page can say what to subscribe to.
export const GET: RequestHandler = async ({ request }) => {
	const auth = await guard(request);
	if ('refusal' in auth) return auth.refusal;
	return json({ success: true, topic: topicFor(auth.session.user.id) });
};
