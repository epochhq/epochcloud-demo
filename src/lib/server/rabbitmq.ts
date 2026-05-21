import amqplib, { type ChannelModel, type Channel } from 'amqplib';
import { config } from './config.js';
import { log } from './logger.js';
import {
	rabbitConnected,
	rabbitMessagesPublished,
	rabbitMessagesConsumed,
	rabbitPublishErrors
} from './metrics.js';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 1000;
const MAX_BACKOFF = 30000;

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

		channel = await connection.createChannel();
		// checkQueue, not assertQueue: the queue is owned by the
		// rabbitmq.com Topology Operator (Queue CR in
		// kubernetes/apps/epochcloud-demo/templates/rabbitmq-demo.yaml).
		// assertQueue would re-declare with default args (classic queue,
		// no x-queue-type) - when the operator's Queue is `type: quorum`
		// the type-mismatch fails the channel with PRECONDITION_FAILED.
		// checkQueue only verifies existence; the operator stays the
		// single source of truth for queue type / durability / args.
		await channel.checkQueue(config.rabbitmq.queue);

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
	if (!channel) {
		throw new Error('RabbitMQ not connected');
	}

	try {
		channel.sendToQueue(config.rabbitmq.queue, Buffer.from(message), { persistent: true });
		rabbitMessagesPublished.inc();
		log('info', 'RabbitMQ message published', { message });
	} catch (err) {
		rabbitPublishErrors.inc();
		throw err;
	}
}

export function getRabbitStatus() {
	return {
		connected: !!channel,
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
