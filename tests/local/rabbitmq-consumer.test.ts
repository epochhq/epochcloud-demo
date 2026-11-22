import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

// A fake of amqplib's opt-in recovery: connect() runs the recovery `setup` on a
// first fake connection and resolves a recovering object; when a connection
// closes, the recovering object emits 'disconnect' and runs `setup` again on a
// new connection after the initial delay, as lib/recovery.js does. The consumer
// callback is kept so a test can have the broker cancel the consumer (amqplib
// calls it with null), and closing a channel emits its close event as the real
// one does.
class FakeChannel extends EventEmitter {
	callback: ((msg: unknown) => void) | undefined;
	checkQueue = vi.fn(async () => {
		if (!broker.queueExists) throw Object.assign(new Error('NOT_FOUND - no queue'), { code: 404 });
		return { messageCount: 0, consumerCount: 0 };
	});
	consume = vi.fn(async (_queue: string, callback: (msg: unknown) => void) => {
		this.callback = callback;
		return { consumerTag: 'epochcloud-demo-consumer' };
	});
	ack = vi.fn();
	close = vi.fn(async () => {
		this.emit('close');
	});
}

class FakeModel extends EventEmitter {
	channels: FakeChannel[] = [];
	createConfirmChannel = vi.fn(async () => {
		const channel = new FakeChannel();
		this.channels.push(channel);
		return channel;
	});
	close = vi.fn(async () => {
		this.emit('close');
	});
}

type Recovery = { initialDelay: number; setup: (model: FakeModel) => Promise<void> };

const { models, connect, config, broker } = vi.hoisted(() => {
	const models: unknown[] = [];
	return {
		models,
		broker: { queueExists: true },
		connect: vi.fn(),
		config: {
			consumerMode: true,
			rabbitmq: { enabled: true, host: 'rabbit.test', port: 5672, username: 'u', password: 'p', vhost: 'v', queue: 'q' }
		}
	};
});

vi.mock('amqplib', () => ({ default: { connect } }));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/metrics.js', () => ({
	rabbitConnected: { set: vi.fn() },
	rabbitMessagesPublished: { inc: vi.fn() },
	rabbitMessagesConsumed: { inc: vi.fn() },
	rabbitPublishErrors: { inc: vi.fn() }
}));

let recoveringClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetModules();
	models.length = 0;
	broker.queueExists = true;
	config.consumerMode = true;
	recoveringClose = vi.fn().mockResolvedValue(undefined);
	connect.mockReset().mockImplementation(async (_url: string, options: { recovery: Recovery }) => {
		const { setup, initialDelay } = options.recovery;
		const recovering = Object.assign(new EventEmitter(), { close: recoveringClose });
		const open = async (): Promise<void> => {
			const model = new FakeModel();
			models.push(model);
			try {
				await setup(model);
			} catch {
				// A failed setup closes that connection and schedules the next attempt.
				setTimeout(() => void open(), initialDelay);
				return;
			}
			model.on('close', () => {
				recovering.emit('disconnect', new Error('Connection closed'));
				setTimeout(() => void open(), initialDelay);
			});
		};
		await open();
		return recovering;
	});
});

afterEach(() => {
	vi.useRealTimers();
});

const modelOf = (n: number): FakeModel => {
	const model = models[n] as FakeModel | undefined;
	if (!model) throw new Error(`no connection ${n}`);
	return model;
};
const channelOf = (n: number): FakeChannel => {
	const channel = modelOf(n).channels[0];
	if (!channel) throw new Error(`connection ${n} opened no channel`);
	return channel;
};

const load = async () => {
	const rabbit = await import('../../src/lib/server/rabbitmq.js');
	const health = await import('../../src/routes/health/+server.js');
	return { rabbit, health: () => health.GET({} as never) };
};

it('connects through amqplib recovery and subscribes in its setup', async () => {
	const { rabbit, health } = await load();
	expect(rabbit.isConsuming()).toBe(false);
	expect((await health()).status).toBe(503);
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(0);
	expect(connect.mock.calls[0]?.[1]).toMatchObject({ recovery: { initialDelay: 1000, maxDelay: 30000 } });
	expect(channelOf(0).consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
	expect((await health()).status).toBe(200);
});

it('subscribes again after the broker cancels the consumer on a channel that stays open', async () => {
	const { rabbit, health } = await load();
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(0);
	const first = channelOf(0);
	first.callback?.(null);
	await vi.advanceTimersByTimeAsync(0);
	expect(rabbit.isConsuming()).toBe(false);
	expect(first.close).toHaveBeenCalledTimes(1);
	expect(modelOf(0).close).toHaveBeenCalledTimes(1);
	expect((await health()).status).toBe(503);
	await vi.advanceTimersByTimeAsync(1000);
	expect(models).toHaveLength(2);
	expect(channelOf(1).consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
	expect((await health()).status).toBe(200);
});

it('subscribes again after the connection drops', async () => {
	const { rabbit } = await load();
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(0);
	modelOf(0).emit('close');
	await vi.advanceTimersByTimeAsync(0);
	expect(rabbit.isConsuming()).toBe(false);
	await vi.advanceTimersByTimeAsync(1000);
	expect(channelOf(1).consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
});

it('stays unhealthy while its queue is missing and subscribes when it exists again', async () => {
	const { rabbit, health } = await load();
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(0);
	// The queue is deleted: the broker cancels the consumer, and the next
	// connection's checkQueue finds no queue.
	broker.queueExists = false;
	channelOf(0).callback?.(null);
	await vi.advanceTimersByTimeAsync(1000);
	expect(models).toHaveLength(2);
	expect(channelOf(1).consume).not.toHaveBeenCalled();
	expect(rabbit.isConsuming()).toBe(false);
	expect((await health()).status).toBe(503);
	broker.queueExists = true;
	await vi.advanceTimersByTimeAsync(1000);
	expect(models).toHaveLength(3);
	expect(channelOf(2).consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
	expect((await health()).status).toBe(200);
});

it('closes the recovering connection on shutdown', async () => {
	const { rabbit } = await load();
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(0);
	await rabbit.closeRabbit();
	expect(recoveringClose).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(false);
});

it('keeps a web pod healthy without a consumer', async () => {
	config.consumerMode = false;
	const { health } = await load();
	expect((await health()).status).toBe(200);
});
