import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async () => {
	if (!config.crowdsec.enabled) {
		return new Response(JSON.stringify({ connected: false, error: 'CROWDSEC_LAPI_URL not set' }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const resp = await fetch(`${config.crowdsec.lapiUrl}/health`);

		return new Response(
			JSON.stringify({
				connected: resp.ok,
				url: config.crowdsec.lapiUrl,
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
