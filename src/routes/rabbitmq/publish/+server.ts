import type { RequestHandler } from './$types';
import { publishMessage } from '$lib/server/rabbitmq.js';
import { config } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ url }) => {
	const message = url.searchParams.get('message') || `Hello from SvelteKit (${config.hostname}) at ${new Date().toISOString()}`;

	try {
		await publishMessage(message);
		return new Response(
			JSON.stringify({
				success: true,
				message,
				timestamp: new Date().toISOString()
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return new Response(
			JSON.stringify({
				success: false,
				error: String(err),
				timestamp: new Date().toISOString()
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const message = body.message || `Hello from SvelteKit (${config.hostname}) at ${new Date().toISOString()}`;

		await publishMessage(message);
		return new Response(
			JSON.stringify({
				success: true,
				message,
				timestamp: new Date().toISOString()
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		return new Response(
			JSON.stringify({
				success: false,
				error: String(err),
				timestamp: new Date().toISOString()
			}),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
