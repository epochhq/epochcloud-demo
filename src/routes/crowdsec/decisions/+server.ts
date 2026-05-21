import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ url }) => {
	if (!config.crowdsec.enabled) {
		return new Response(JSON.stringify({ success: false, error: 'CrowdSec not configured' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!config.crowdsec.bouncerKey) {
		return new Response(
			JSON.stringify({
				success: false,
				error: 'CROWDSEC_BOUNCER_KEY not set - IP lookup unavailable'
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const ip = url.searchParams.get('ip');
	if (!ip) {
		return new Response(JSON.stringify({ success: false, error: 'ip parameter required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const resp = await fetch(
			`${config.crowdsec.lapiUrl}/v1/decisions?ip=${encodeURIComponent(ip)}`,
			{
				headers: { 'X-Api-Key': config.crowdsec.bouncerKey }
			}
		);

		if (resp.status === 200) {
			const decisions = await resp.json();
			return new Response(
				JSON.stringify({
					success: true,
					ip,
					blocked: decisions !== null && decisions.length > 0,
					decisions: decisions || [],
					timestamp: new Date().toISOString()
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		} else if (resp.status === 404) {
			// 404 means no decisions - IP is clean
			return new Response(
				JSON.stringify({
					success: true,
					ip,
					blocked: false,
					decisions: [],
					timestamp: new Date().toISOString()
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		} else {
			return new Response(
				JSON.stringify({ success: false, error: `LAPI returned ${resp.status}` }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}
	} catch (err) {
		return new Response(JSON.stringify({ success: false, error: String(err) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
