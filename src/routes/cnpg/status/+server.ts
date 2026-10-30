import type { RequestHandler } from './$types';
import { getCnpgStatus } from '#lib/server/cnpg.js';

export const GET: RequestHandler = async () => {
	const status = getCnpgStatus();
	return new Response(JSON.stringify({ ...status, timestamp: new Date().toISOString() }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
