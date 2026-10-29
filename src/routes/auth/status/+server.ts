import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async () => {
	const timestamp = new Date().toISOString();

	if (!config.betterauth.enabled) {
		return Response.json({
			connected: false,
			url: '',
			error: 'BetterAuth not configured (BETTERAUTH_URL not set)',
			timestamp
		});
	}

	try {
		const resp = await fetch(`${config.betterauth.url}/health`, {
			signal: AbortSignal.timeout(5000)
		});
		const body = await resp.json();

		return Response.json({
			connected: resp.ok,
			url: config.betterauth.url,
			health: `${body.status || 'unknown'} (v${body.version || '?'})`,
			timestamp
		});
	} catch (err) {
		return Response.json({
			connected: false,
			url: config.betterauth.url,
			error: `Connection failed: ${String(err)}`,
			timestamp
		});
	}
};
