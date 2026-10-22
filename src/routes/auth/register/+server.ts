import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';

export const POST: RequestHandler = async ({ request }) => {
	const timestamp = new Date().toISOString();

	if (!config.betterauth.enabled) {
		return Response.json({ success: false, action: 'register', message: 'BetterAuth not configured', timestamp }, { status: 503 });
	}

	try {
		const body = await request.json();
		const origin = request.headers.get('Origin');
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (origin) headers['Origin'] = origin;
		const resp = await fetch(`${config.betterauth.url}/api/auth/sign-up/email`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ ...body, callbackURL: origin || '/' }),
			signal: AbortSignal.timeout(10000)
		});

		const data = await resp.json().catch(() => null);
		const success = resp.ok;

		return Response.json(
			{
				success,
				action: 'register',
				message: `Registration ${success ? 'successful' : 'failed'} (HTTP ${resp.status})`,
				data,
				timestamp
			},
			{ status: success ? 200 : resp.status }
		);
	} catch (err) {
		return Response.json(
			{
				success: false,
				action: 'register',
				message: `BetterAuth request failed: ${String(err)}`,
				timestamp
			},
			{ status: 502 }
		);
	}
};
