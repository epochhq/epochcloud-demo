import type { RequestHandler } from './$types';
import { json } from '#lib/server/http.js';
import { topicFor } from '#lib/server/ntfy.js';

// The caller's own topic, so the page can say what to subscribe to.
export const GET: RequestHandler = async ({ locals }) => {
	return json({ success: true, topic: topicFor(locals.session!.user.id) });
};
