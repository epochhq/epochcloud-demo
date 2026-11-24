import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

// A fake of amqplib's callback API with opt-in recovery. connect() returns the
// recovering object at once, as the real one does, runs the recovery `setup` on a
// first fake connection and calls its callback after that setup succeeds. When a
// connection closes the recovering object emits 'disconnect' and runs `setup` on
// a new connection after a delay that starts at initialDelay and multiplies by
// factor on each failed attempt up to maxDelay, without the jitter the real one
// adds (lib/recovery.js), and starts over after a successful connect. Closing the
// recovering object cancels the pending attempt, ends recovery and, if no
// connection has succeeded yet, calls the connect callback with an error. The
// consumer callback is kept so a test can have the broker cancel the consumer
// (amqplib calls it with null), and closing a channel emits its close event as the
// real one does. Callbacks run on a later microtask, as the real ones do.
type Done<T = unknown> = (err: Error | null, result?: T) => void;
const later = (run: () => void): void => void Promise.resolve().then(run);

class FakeChannel extends EventEmitter {
	callback: ((msg: unknown) => void) | undefined;
	checkQueue = vi.fn((_queue: string, done: Done) => {
		later(() => {
			if (!broker.queueExists) done(Object.assign(new Error('NOT_FOUND - no queue'), { code: 404 }));
			else done(null, { messageCount: 0, consumerCount: 0 });
		});
	});
	consume = vi.fn((_queue: string, callback: (msg: unknown) => void, _options: unknown, done: Done) => {
		this.callback = callback;
		later(() => done(null, { consumerTag: 'epochcloud-demo-consumer' }));
	});
	ack = vi.fn();
	close = vi.fn((done?: Done) => {
		this.emit('close');
		done?.(null);
	});
}

class FakeModel extends EventEmitter {
	channels: FakeChannel[] = [];
	createConfirmChannel = vi.fn((done: Done<FakeChannel>) => {
		const channel = new FakeChannel();
		this.channels.push(channel);
		later(() => done(null, channel));
	});
	close = vi.fn((done?: Done) => {
		this.emit('close');
		done?.(null);
	});
}

type Recovery = { initialDelay: number; maxDelay: number; factor: number; setup: (model: FakeModel) => Promise<void> };

const { models, connect, config, broker } = vi.hoisted(() => {
	const models: unknown[] = [];
	return {
		models,
		broker: { queueExists: true, reachable: true },
		connect: vi.fn(),
		config: {
			consumerMode: true,
			rabbitmq: { enabled: true, host: 'rabbit.test', port: 5672, username: 'u', password: 'p', vhost: 'v', queue: 'q' }
		}
	};
});

vi.mock('amqplib/callback_api', () => ({ default: { connect } }));
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
	broker.reachable = true;
	config.consumerMode = true;
	connect.mockReset().mockImplementation((_url: string, options: { recovery: Recovery }, done: Done) => {
		const { setup, initialDelay, maxDelay, factor } = options.recovery;
		const recovering = new EventEmitter();
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		let connected = false;
		let current: FakeModel | undefined;
		const schedule = (): void => {
			if (stopped || timer) return;
			attempt += 1;
			const delay = Math.min(maxDelay, initialDelay * factor ** (attempt - 1));
			timer = setTimeout(() => {
				timer = undefined;
				void open();
			}, delay);
		};
		const open = async (): Promise<void> => {
			if (stopped) return;
			if (!broker.reachable) {
				schedule();
				return;
			}
			const model = new FakeModel();
			models.push(model);
			try {
				await setup(model);
			} catch {
				// A failed setup closes that connection and schedules the next attempt.
				schedule();
				return;
			}
			if (stopped) return;
			attempt = 0;
			current = model;
			model.on('close', () => {
				if (current !== model) return;
				current = undefined;
				recovering.emit('disconnect', new Error('Connection closed'));
				schedule();
			});
			if (!connected) {
				connected = true;
				done(null, recovering);
			}
		};
		recoveringClose = vi.fn((closed?: Done) => {
			stopped = true;
			clearTimeout(timer);
			timer = undefined;
			if (!connected) {
				connected = true;
				done(new Error('Connection closed'));
			}
			current = undefined;
			closed?.(null);
		});
		Object.assign(recovering, { close: recoveringClose });
		void open();
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
	// The second failed attempt waits twice the initial delay.
	await vi.advanceTimersByTimeAsync(2000);
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

it('stops reconnecting when shutdown comes before the first connection', async () => {
	broker.reachable = false;
	const { rabbit } = await load();
	await rabbit.initRabbitMQ();
	// The broker is unreachable: attempts follow after 1 s, then 2 s.
	await vi.advanceTimersByTimeAsync(0);
	expect(vi.getTimerCount()).toBe(1);
	await rabbit.closeRabbit();
	expect(recoveringClose).toHaveBeenCalledTimes(1);
	// Nothing is left waiting, so the process can end, and the broker coming back
	// later is not connected to.
	expect(vi.getTimerCount()).toBe(0);
	broker.reachable = true;
	await vi.advanceTimersByTimeAsync(60_000);
	expect(models).toHaveLength(0);
	expect(rabbit.isConsuming()).toBe(false);
});

it('stops reconnecting when shutdown comes while the first setup keeps failing', async () => {
	broker.queueExists = false;
	const { rabbit } = await load();
	await rabbit.initRabbitMQ();
	await vi.advanceTimersByTimeAsync(1000);
	expect(models).toHaveLength(2);
	await rabbit.closeRabbit();
	expect(vi.getTimerCount()).toBe(0);
	broker.queueExists = true;
	await vi.advanceTimersByTimeAsync(60_000);
	expect(models).toHaveLength(2);
	expect(rabbit.isConsuming()).toBe(false);
});

it('keeps a web pod healthy without a consumer', async () => {
	config.consumerMode = false;
	const { health } = await load();
	expect((await health()).status).toBe(200);
});
