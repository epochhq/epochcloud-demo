import type { RequestHandler } from './$types';
import { valkeySet } from '#lib/server/valkey.js';

export const GET: RequestHandler = async ({ url }) => {
	const key = url.searchParams.get('key') || 'demo-key';
	const value = url.searchParams.get('value') || `demo-value-${Date.now()}`;
	const ttl = parseInt(url.searchParams.get('ttl') || '300');

	try {
		await valkeySet(key, value, ttl);
		return new Response(
			JSON.stringify({
				success: true,
				key,
				value,
				ttl_seconds: ttl,
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
