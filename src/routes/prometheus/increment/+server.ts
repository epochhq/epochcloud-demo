import type { RequestHandler } from './$types';
import { guard } from '#lib/server/guard.js';
import { field, json } from '#lib/server/http.js';
import { demoCounter } from '#lib/server/metrics.js';

// Increments the demo counter on the pod that answers; the Prometheus tab then
// shows the scraped value per pod.
export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const burst = Math.min(Math.max(parseInt(field(await request.formData(), 'burst', '1'), 10) || 1, 1), 25);
	demoCounter.inc(burst);
	return json({ success: true, added: burst });
};
