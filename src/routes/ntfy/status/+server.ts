import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async () => {
	if (!config.ntfy.enabled) {
		return new Response(JSON.stringify({ connected: false, error: 'NTFY_URL not set' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const resp = await fetch(`${config.ntfy.url}/v1/health`);
		const healthy = resp.ok;

		return new Response(
			JSON.stringify({
				connected: healthy,
				url: config.ntfy.url,
				timestamp: new Date().toISOString()
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return new Response(JSON.stringify({ connected: false, error: String(err) }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
