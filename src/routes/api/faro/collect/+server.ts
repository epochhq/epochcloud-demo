import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { json, upstream } from '#lib/server/http.js';
import { createLimiter } from '#lib/server/ratelimit.js';

// The browser telemetry relay stays anonymous, because the page sends it before
// any sign-in, so it is bounded instead: a size cap, a deadline and a limit per
// client address.
const MAX_BYTES = 64 * 1024;
const perClient = createLimiter({ points: 120, durationSeconds: 60 });

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!config.faro.receiverUrl) return new Response(null, { status: 204 });
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BYTES) return json({ error: 'payload too large' }, 413);

	let client = 'unknown';
	try {
		client = getClientAddress();
	} catch {
		// no address behind this connection: one shared bucket
	}
	const limited = await perClient.take(client);
	if (limited) return limited;

	const body = await request.text();
	if (body.length > MAX_BYTES) return json({ error: 'payload too large' }, 413);
	try {
		const response = await upstream(config.faro.receiverUrl, {
			method: 'POST',
			headers: { 'Content-Type': request.headers.get('content-type') || 'application/json' },
			body
		});
		return new Response(null, { status: response.ok ? 202 : 502 });
	} catch {
		return new Response(null, { status: 502 });
	}
};
