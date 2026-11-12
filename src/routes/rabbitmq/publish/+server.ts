import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { guard } from '#lib/server/guard.js';
import { field, json } from '#lib/server/http.js';
import { publishMessage } from '#lib/server/rabbitmq.js';

const MAX_MESSAGE = 200;

export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const text = field(await request.formData(), 'message');
	if (text.length > MAX_MESSAGE) return json({ success: false, error: `message is at most ${MAX_MESSAGE} characters` }, 400);
	const message = text || `Hello from SvelteKit (${config.hostname}) at ${new Date().toISOString()}`;
	try {
		await publishMessage(message);
		return json({ success: true, message });
	} catch {
		return json({ success: false, error: 'the broker did not confirm the message' }, 502);
	}
};
