import type { RequestHandler } from './$types';
import { getRabbitStatus } from '#lib/server/rabbitmq.js';

export const GET: RequestHandler = async () => {
	const status = await getRabbitStatus();
	return new Response(JSON.stringify({ ...status, timestamp: new Date().toISOString() }), {
		headers: { 'Content-Type': 'application/json' }
	});
};
