import type { RequestHandler } from './$types';
import { getDefectDojoStatus } from '#lib/server/defectdojo.js';

export const GET: RequestHandler = async () => {
	const status = await getDefectDojoStatus();
	return new Response(JSON.stringify({ ...status, timestamp: new Date().toISOString() }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
