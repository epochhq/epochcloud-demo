import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { isConsuming } from '#lib/server/rabbitmq.js';

export const GET: RequestHandler = async () => {
	// A consumer pod exists to consume: one with no subscription (before its first
	// connection, or after the broker cancelled it) is not healthy, so its
	// readiness drops and the liveness probe restarts it.
	const consumerIdle = config.consumerMode && !isConsuming();
	return new Response(
		JSON.stringify({
			status: consumerIdle ? 'unhealthy' : 'healthy',
			...(consumerIdle ? { reason: 'the consumer has no subscription' } : {}),
			timestamp: new Date().toISOString()
		}),
		{
			status: consumerIdle ? 503 : 200,
			headers: { 'Content-Type': 'application/json' }
		}
	);
};
