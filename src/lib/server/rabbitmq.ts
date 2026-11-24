import { promisify } from 'node:util';
import amqplib, {
	type Connection,
	type ConfirmChannel,
	type RecoveringConnection,
	type Replies,
	type ConsumeMessage,
	type Options
} from 'amqplib/callback_api';
import { config } from './config.js';
import { PUBLISH_CONFIRM_MS, UPSTREAM_TIMEOUT_MS } from '../limits.js';
import { withDeadline } from './http.js';
import { log } from './logger.js';
import { rabbitConnected, rabbitMessagesPublished, rabbitMessagesConsumed, rabbitPublishErrors } from './metrics.js';

// The recovering connection: amqplib's opt-in recovery reconnects with a growing
// delay and runs `setup` after every successful connect. The callback API hands
// the object back as soon as connect() is called, so shutdown can stop recovery
// whether or not a connection has succeeded yet (the promise API returns it only
// after the first success).
let connection: RecoveringConnection | null = null;
let channel: ConfirmChannel | null = null;
let consuming = false;
const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PUBLISH_CONFIRM_TIMEOUT_MS = PUBLISH_CONFIRM_MS;
const BROKER_PROBE_TIMEOUT_MS = 2000;

const consumedMessages: Array<{ message: string; timestamp: string }> = [];
const MAX_CONSUMED = 10;

// close() on an amqplib channel or connection throws when it is already closing.
function closeQuietly(target: { close(done?: (err: Error) => void): void }): void {
	try {
		target.close(() => {});
	} catch {
		// Already closed or closing: nothing left to close.
	}
}

function checkQueue(ch: ConfirmChannel): Promise<Replies.AssertQueue> {
	const check = ch.checkQueue.bind(ch) as (queue: string, done: (err: Error | null, ok: Replies.AssertQueue) => void) => void;
	return promisify(check)(config.rabbitmq.queue);
}

function getUrl(): string {
	const { host, port, username, password, vhost } = config.rabbitmq;
	const encodedVhost = encodeURIComponent(vhost);
	return `amqp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${encodedVhost}`;
}

// Runs on every successful connection, the first and each recovery: it opens the
// confirm channel and, in consumer mode, subscribes on it. A consumer lives on
// its channel, so every new connection needs its own subscription. A throw here
// closes the connection and recovery tries again after its delay.
async function setup(model: Connection): Promise<void> {
	try {
		// Confirm channel: the broker acks every publish, so publishMessage
		// can distinguish delivered from dropped instead of fire-and-forget.
		const open = model.createConfirmChannel.bind(model) as (done: (err: Error | null, ch: ConfirmChannel) => void) => void;
		const ch = await promisify(open)();

		ch.on('error', (err) => {
			log('error', 'RabbitMQ channel error', { error: String(err) });
		});

		// A channel can die while the connection stays up (a failed queue op
		// closes only the channel, and so does a cancelled consumer). Close the
		// connection: recovery opens a new one and runs setup again.
		ch.on('close', () => {
			if (channel === ch) {
				consuming = false;
				channel = null;
				rabbitConnected.set(0);
				closeQuietly(model);
			}
		});

		// checkQueue, not assertQueue: the queue is owned by the
		// rabbitmq.com Topology Operator (a Queue CR in the app's chart).
		// assertQueue would re-declare with default args (classic queue,
		// no x-queue-type) - when the operator's Queue is `type: quorum`
		// the type-mismatch fails the channel with PRECONDITION_FAILED.
		// checkQueue only verifies existence; the operator stays the
		// single source of truth for queue type / durability / args.
		await withDeadline(checkQueue(ch), UPSTREAM_TIMEOUT_MS, 'the broker');
		channel = ch;

		if (config.consumerMode) await startConsumer(ch);

		rabbitConnected.set(1);
		log('info', 'RabbitMQ connected', { host: config.rabbitmq.host });
	} catch (err) {
		log('error', 'RabbitMQ connect failed', { error: String(err) });
		rabbitConnected.set(0);
		consuming = false;
		channel = null;
		throw err;
	}
}

export async function initRabbitMQ(): Promise<void> {
	if (!config.rabbitmq.enabled) {
		log('info', 'RabbitMQ disabled (RABBITMQ_HOST not set)');
		return;
	}
	// The callback runs once: on the first successful connect, or with an error
	// when closeRabbit() ends recovery before that. The server starts meanwhile.
	const recovering = amqplib.connect(getUrl(), { recovery: { initialDelay: RECONNECT_INITIAL_MS, maxDelay: RECONNECT_MAX_MS, factor: 2, setup } }, (err) => {
		if (err && connection) log('error', 'RabbitMQ recovery gave up', { error: String(err) });
	});
	connection = recovering;
	recovering.on('error', (err) => {
		log('error', 'RabbitMQ connection error', { error: String(err) });
		rabbitConnected.set(0);
	});
	recovering.on('disconnect', (err) => {
		log('warn', 'RabbitMQ connection lost, recovering', { error: String(err) });
		rabbitConnected.set(0);
		consuming = false;
		channel = null;
	});
}

async function startConsumer(ch: ConfirmChannel): Promise<void> {
	const onMessage = (msg: ConsumeMessage | null): void => {
		if (!msg) {
			// RabbitMQ cancelled this consumer (its queue was deleted or
			// recreated). The channel stays open and recovery watches only the
			// connection, so nothing would subscribe again and the pod would sit
			// Ready with no consumer. End the channel: its close handler closes
			// the connection and recovery runs setup on a new one.
			consuming = false;
			log('warn', 'RabbitMQ cancelled the consumer, reconnecting', { queue: config.rabbitmq.queue });
			closeQuietly(ch);
			return;
		}
		const content = msg.content.toString();
		consumedMessages.unshift({
			message: content,
			timestamp: new Date().toISOString()
		});
		if (consumedMessages.length > MAX_CONSUMED) {
			consumedMessages.pop();
		}
		rabbitMessagesConsumed.inc();
		// Acknowledge only after the message is recorded: a crash before this
		// line returns it to the queue instead of losing it.
		ch.ack(msg);
		log('info', 'RabbitMQ message consumed');
	};
	const consume = ch.consume.bind(ch) as (
		queue: string,
		onMessage: (msg: ConsumeMessage | null) => void,
		options: Options.Consume,
		done: (err: Error | null, ok: Replies.Consume) => void
	) => void;
	await promisify(consume)(config.rabbitmq.queue, onMessage, { noAck: false, consumerTag: 'epochcloud-demo-consumer' });

	consuming = true;
	log('info', 'RabbitMQ consumer started', { queue: config.rabbitmq.queue });
}

/** Whether a consumer is subscribed on the live channel. */
export function isConsuming(): boolean {
	return consuming;
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
		log('info', 'RabbitMQ message published');
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
		checkQueue(ch).then(
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
	const info = await withDeadline(checkQueue(channel), UPSTREAM_TIMEOUT_MS, 'the broker');
	return {
		messageCount: info.messageCount,
		consumerCount: info.consumerCount
	};
}

/**
 * Close the connection on shutdown so the broker sees a clean goodbye. Closing the
 * recovering connection also cancels its pending reconnect, so it stops recovery
 * even when no connection has succeeded yet.
 */
export async function closeRabbit(): Promise<void> {
	const conn = connection;
	connection = null;
	channel = null;
	consuming = false;
	if (conn) await new Promise<void>((resolve) => conn.close(() => resolve()));
}
