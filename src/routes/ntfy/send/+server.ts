import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';
import { log } from '$lib/server/logger.js';

export const POST: RequestHandler = async ({ request }) => {
	if (!config.ntfy.enabled) {
		return new Response(
			JSON.stringify({ success: false, error: 'ntfy not configured (NTFY_URL not set)' }),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}

	try {
		const body = await request.json();
		const rawTopic = String(body.topic || 'epochcloud-demo');
		// Sanitize topic: alphanumeric, hyphens, underscores only - no path traversal
		const topic = rawTopic.replace(/[^a-zA-Z0-9_-]/g, '');
		if (!topic) {
			return new Response(JSON.stringify({ success: false, error: 'Invalid topic name' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const message = body.message || `Hello from SvelteKit (${config.hostname})`;
		const title = body.title || 'EpochCloud Demo';
		const priority = body.priority || '3';

		const resp = await fetch(`${config.ntfy.url}/${topic}`, {
			method: 'POST',
			headers: {
				Title: title,
				Priority: priority,
				Tags: 'rocket',
				...(config.ntfy.user && config.ntfy.password
					? {
							Authorization: `Basic ${Buffer.from(`${config.ntfy.user}:${config.ntfy.password}`).toString('base64')}`
						}
					: {})
			},
			body: message
		});

		if (resp.ok) {
			log('info', 'ntfy notification sent', { topic, message });
			return new Response(
				JSON.stringify({
					success: true,
					topic,
					message,
					timestamp: new Date().toISOString()
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			);
		} else {
			const errText = await resp.text();
			return new Response(
				JSON.stringify({ success: false, error: `ntfy error: ${resp.status} ${errText}` }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}
	} catch (err) {
		log('error', 'ntfy send error', { error: String(err) });
		return new Response(JSON.stringify({ success: false, error: String(err) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
