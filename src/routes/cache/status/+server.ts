import type { RequestHandler } from './$types';
import { getValkeyStatus } from '#lib/server/valkey.js';

export const GET: RequestHandler = async () => {
	const status = getValkeyStatus();
	return new Response(JSON.stringify({ ...status, timestamp: new Date().toISOString() }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
