import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async () => {
	const timestamp = new Date().toISOString();

	if (!config.gofeatureflag.enabled) {
		return Response.json({
			connected: false,
			url: '',
			error: 'GO Feature Flag not configured (GOFEATUREFLAG_URL not set)',
			timestamp
		});
	}

	try {
		// Try evaluating all flags to check connectivity
		const resp = await fetch(`${config.gofeatureflag.url}/v1/allflags`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				evaluationContext: { targetingKey: 'health-check' }
			}),
			signal: AbortSignal.timeout(5000)
		});

		const body = await resp.json();
		const flagCount = typeof body === 'object' ? Object.keys(body).length : 0;

		return Response.json({
			connected: resp.ok,
			url: config.gofeatureflag.url,
			flags_available: flagCount,
			timestamp
		});
	} catch (err) {
		return Response.json({
			connected: false,
			url: config.gofeatureflag.url,
			error: `Connection failed: ${String(err)}`,
			timestamp
		});
	}
};
