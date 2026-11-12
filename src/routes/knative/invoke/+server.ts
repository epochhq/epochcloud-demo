import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { unavailable } from '#lib/server/respond.js';
import { field, json } from '#lib/server/http.js';
import { invokeFibonacci, MAX_ATTEMPTS } from '#lib/server/knative.js';
import { log } from '#lib/server/logger.js';

// Spends a serverless invocation, so it is a signed-in POST.
export const POST: RequestHandler = async ({ request }) => {
	if (!config.knative.enabled) return unavailable('Knative');

	const n = parseInt(field(await request.formData(), 'n', '10'));
	if (isNaN(n) || n < 0 || n > 50) return json({ success: false, error: 'n must be between 0 and 50' }, 400);

	const startTime = performance.now();
	try {
		const data = await invokeFibonacci(n);
		const elapsed = performance.now() - startTime;
		log('info', 'Knative fibonacci invoked', { n, elapsed_ms: elapsed.toFixed(0) });
		return json({
			success: true,
			n,
			result: data.result ?? data.error ?? JSON.stringify(data),
			duration: data.duration ?? null,
			latency_ms: Math.round(elapsed),
			cold_start: elapsed > 2000
		});
	} catch {
		return json({ success: false, error: `Knative invoke failed after ${MAX_ATTEMPTS} attempts`, latency_ms: Math.round(performance.now() - startTime) }, 502);
	}
};
