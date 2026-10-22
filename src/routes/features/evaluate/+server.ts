import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ url }) => {
	const timestamp = new Date().toISOString();
	const flagName = url.searchParams.get('flag');
	const userId = url.searchParams.get('user') || 'anonymous';

	if (!flagName) {
		return Response.json({ error: "Missing 'flag' query parameter", timestamp }, { status: 400 });
	}

	if (!config.gofeatureflag.enabled) {
		return Response.json({
			flag: flagName,
			error: 'GO Feature Flag not configured',
			timestamp
		});
	}

	try {
		const resp = await fetch(`${config.gofeatureflag.url}/v1/feature/${encodeURIComponent(flagName)}/eval`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				evaluationContext: {
					targetingKey: userId,
					environment: config.environment
				},
				defaultValue: false
			}),
			signal: AbortSignal.timeout(5000)
		});

		const result = await resp.json();

		return Response.json({
			flag: flagName,
			value: result.value,
			variationType: result.variationType,
			reason: result.reason,
			failed: result.failed || false,
			timestamp
		});
	} catch (err) {
		return Response.json({
			flag: flagName,
			error: `Relay proxy request failed: ${String(err)}`,
			timestamp
		});
	}
};
