import amqplib, { type ChannelModel, type ConfirmChannel } from 'amqplib';
import { config } from './config.js';
import { log } from './logger.js';
import { rabbitConnected, rabbitMessagesPublished, rabbitMessagesConsumed, rabbitPublishErrors } from './metrics.js';

let connection: ChannelModel | null = null;
let channel: ConfirmChannel | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 1000;
const MAX_BACKOFF = 30000;
const PUBLISH_CONFIRM_TIMEOUT_MS = 5000;
const BROKER_PROBE_TIMEOUT_MS = 2000;

const consumedMessages: Array<{ message: string; timestamp: string }> = [];
const MAX_CONSUMED = 10;

function getUrl(): string {
	const { host, port, username, password, vhost } = config.rabbitmq;
	const encodedVhost = encodeURIComponent(vhost);
	return `amqp://${username}:${password}@${host}:${port}/${encodedVhost}`;
}

async function connect(): Promise<void> {
	if (!config.rabbitmq.enabled) return;

	try {
		connection = await amqplib.connect(getUrl());

		// Register event handlers IMMEDIATELY after connect, before createChannel.
		// If the connection drops before handlers are attached, Node.js throws
		// "Unhandled 'error' event" and crashes the process.
		connection.on('close', () => {
			log('warn', 'RabbitMQ connection closed, reconnecting...');
			rabbitConnected.set(0);
			channel = null;
			connection = null;
			scheduleReconnect();
		});

		connection.on('error', (err) => {
			log('error', 'RabbitMQ connection error', { error: String(err) });
			rabbitConnected.set(0);
		});

		// Confirm channel: the broker acks every publish, so publishMessage
		// can distinguish delivered from dropped instead of fire-and-forget.
		const ch = await connection.createConfirmChannel();
		channel = ch;

		ch.on('error', (err) => {
			log('error', 'RabbitMQ channel error', { error: String(err) });
		});

		// A channel can die while the connection stays up (a failed queue op
		// closes only the channel). Cycle the connection so the connection
		// close handler rebuilds both through the normal reconnect path.
		ch.on('close', () => {
			if (channel === ch) {
				channel = null;
				connection?.close().catch(() => {});
			}
		});

		// checkQueue, not assertQueue: the queue is owned by the
		// rabbitmq.com Topology Operator (Queue CR in
		// kubernetes/apps/epochcloud-demo/templates/rabbitmq-demo.yaml).
		// assertQueue would re-declare with default args (classic queue,
		// no x-queue-type) - when the operator's Queue is `type: quorum`
		// the type-mismatch fails the channel with PRECONDITION_FAILED.
		// checkQueue only verifies existence; the operator stays the
		// single source of truth for queue type / durability / args.
		await ch.checkQueue(config.rabbitmq.queue);

		rabbitConnected.set(1);
		backoffMs = 1000;
		log('info', 'RabbitMQ connected', { host: config.rabbitmq.host });
	} catch (err) {
		log('error', 'RabbitMQ connect failed', { error: String(err) });
		rabbitConnected.set(0);
		scheduleReconnect();
	}
}

function scheduleReconnect(): void {
	if (reconnectTimeout) return;
	reconnectTimeout = setTimeout(async () => {
		reconnectTimeout = null;
		await connect();
	}, backoffMs);
	backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
}

export async function initRabbitMQ(): Promise<void> {
	if (!config.rabbitmq.enabled) {
		log('info', 'RabbitMQ disabled (RABBITMQ_HOST not set)');
		return;
	}
	await connect();
}

export async function startConsumer(): Promise<void> {
	if (!channel) return;

	await channel.consume(
		config.rabbitmq.queue,
		(msg) => {
			if (!msg) return;
			const content = msg.content.toString();
			consumedMessages.unshift({
				message: content,
				timestamp: new Date().toISOString()
			});
			if (consumedMessages.length > MAX_CONSUMED) {
				consumedMessages.pop();
			}
			rabbitMessagesConsumed.inc();
			log('info', 'RabbitMQ message consumed', { message: content });
		},
		{ noAck: true, consumerTag: 'epochcloud-demo-consumer' }
	);

	log('info', 'RabbitMQ consumer started', { queue: config.rabbitmq.queue });
}

export async function publishMessage(message: string): Promise<void> {
	const ch = channel;
	if (!ch) {
		throw new Error('RabbitMQ not connected');
	}

	try {
		// Resolve only on the broker's publish confirm; a nack, channel
		// death, or confirm timeout rejects so the caller sees the loss.
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`publish confirm timed out after ${PUBLISH_CONFIRM_TIMEOUT_MS}ms`));
			}, PUBLISH_CONFIRM_TIMEOUT_MS);
			ch.sendToQueue(config.rabbitmq.queue, Buffer.from(message), { persistent: true }, (err) => {
				clearTimeout(timer);
				if (err) {
					reject(err instanceof Error ? err : new Error(String(err)));
				} else {
					resolve();
				}
			});
		});
		rabbitMessagesPublished.inc();
		log('info', 'RabbitMQ message published', { message });
	} catch (err) {
		rabbitPublishErrors.inc();
		log('error', 'RabbitMQ publish failed', { error: String(err) });
		throw err;
	}
}

async function probeBroker(): Promise<boolean> {
	const ch = channel;
	if (!ch) return false;
	// checkQueue is a broker round-trip: it resolves only when the broker
	// answers, so it proves reachability rather than object existence.
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), BROKER_PROBE_TIMEOUT_MS);
		ch.checkQueue(config.rabbitmq.queue).then(
			() => {
				clearTimeout(timer);
				resolve(true);
			},
			() => {
				clearTimeout(timer);
				resolve(false);
			}
		);
	});
}

export async function getRabbitStatus() {
	return {
		connected: await probeBroker(),
		consumed_messages: [...consumedMessages]
	};
}

export async function getQueueInfo() {
	if (!channel) {
		throw new Error('RabbitMQ not connected');
	}
	const info = await channel.checkQueue(config.rabbitmq.queue);
	return {
		messageCount: info.messageCount,
		consumerCount: info.consumerCount
	};
}
