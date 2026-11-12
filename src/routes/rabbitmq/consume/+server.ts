import type { RequestHandler } from './$types';
import { json } from '#lib/server/http.js';
import { getQueueInfo, getRabbitStatus } from '#lib/server/rabbitmq.js';

export const GET: RequestHandler = async () => {
	const status = await getRabbitStatus();
	let queueInfo = { messageCount: 0, consumerCount: 0 };
	if (status.connected) {
		try {
			queueInfo = await getQueueInfo();
		} catch {
			// queue check failed, return defaults
		}
	}
	return json({ success: true, messages: status.consumed_messages, count: queueInfo.messageCount, consumerCount: queueInfo.consumerCount });
};
