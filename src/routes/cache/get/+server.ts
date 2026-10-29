import type { RequestHandler } from './$types';
import { valkeyGet } from '#lib/server/valkey.js';

export const GET: RequestHandler = async ({ url }) => {
	const key = url.searchParams.get('key') || 'demo-key';

	try {
		const value = await valkeyGet(key);
		return new Response(
			JSON.stringify({
				key,
				value,
				cache_hit: value !== null,
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
