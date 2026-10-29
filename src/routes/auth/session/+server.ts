import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async ({ request }) => {
	const timestamp = new Date().toISOString();

	if (!config.betterauth.enabled) {
		return Response.json({
			success: false,
			action: 'session',
			message: 'BetterAuth not configured',
			timestamp
		});
	}

	try {
		// Forward all cookies to BetterAuth for session validation
		const cookieHeader = request.headers.get('cookie') || '';
		const resp = await fetch(`${config.betterauth.url}/api/auth/get-session`, {
			headers: { cookie: cookieHeader },
			signal: AbortSignal.timeout(5000)
		});

		const data = await resp.json().catch(() => null);
		const hasSession = resp.ok && data !== null;

		return Response.json({
			success: hasSession,
			action: 'session',
			message: hasSession ? 'Active session found' : 'No active session',
			data,
			timestamp
		});
	} catch (err) {
		return Response.json(
			{
				success: false,
				action: 'session',
				message: `BetterAuth request failed: ${String(err)}`,
				timestamp
			},
			{ status: 502 }
		);
	}
};
