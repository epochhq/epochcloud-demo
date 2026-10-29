import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async ({ url }) => {
	const timestamp = new Date().toISOString();
	const userId = url.searchParams.get('user') || 'anonymous';

	if (!config.gofeatureflag.enabled) {
		return Response.json({
			error: 'GO Feature Flag not configured',
			timestamp
		});
	}

	try {
		const resp = await fetch(`${config.gofeatureflag.url}/v1/allflags`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				evaluationContext: {
					targetingKey: userId,
					environment: config.environment
				}
			}),
			signal: AbortSignal.timeout(5000)
		});

		const allFlags = await resp.json();
		return Response.json(allFlags);
	} catch (err) {
		return Response.json({
			error: `Relay proxy request failed: ${String(err)}`,
			timestamp
		});
	}
};
