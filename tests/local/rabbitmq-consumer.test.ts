import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

// A fake broker connection: the consumer callback is kept so the test can have
// the broker cancel the consumer (amqplib calls it with null), and closing the
// channel emits its close event as the real one does.
class FakeChannel extends EventEmitter {
	callback: ((msg: unknown) => void) | undefined;
	checkQueue = vi.fn().mockResolvedValue({ messageCount: 0, consumerCount: 0 });
	consume = vi.fn(async (_queue: string, callback: (msg: unknown) => void) => {
		this.callback = callback;
		return { consumerTag: 'epochcloud-demo-consumer' };
	});
	ack = vi.fn();
	close = vi.fn(async () => {
		this.emit('close');
	});
}

class FakeConnection extends EventEmitter {
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

const { connections, connect, config } = vi.hoisted(() => {
	const connections: unknown[] = [];
	return {
		connections,
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

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetModules();
	connections.length = 0;
	config.consumerMode = true;
	connect.mockReset().mockImplementation(async () => {
		const connection = new FakeConnection();
		connections.push(connection);
		return connection;
	});
});

afterEach(() => {
	vi.useRealTimers();
});

const load = async () => {
	const rabbit = await import('../../src/lib/server/rabbitmq.js');
	const health = await import('../../src/routes/health/+server.js');
	return { rabbit, health: () => health.GET({} as never) };
};

it('subscribes on the first connection and reports itself consuming', async () => {
	const { rabbit, health } = await load();
	expect(rabbit.isConsuming()).toBe(false);
	expect((await health()).status).toBe(503);
	await rabbit.initRabbitMQ();
	expect((connections[0] as FakeConnection).channels[0].consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
	expect((await health()).status).toBe(200);
});

it('subscribes again after the broker cancels the consumer on a channel that stays open', async () => {
	const { rabbit, health } = await load();
	await rabbit.initRabbitMQ();
	const first = (connections[0] as FakeConnection).channels[0];
	first.callback?.(null);
	await vi.advanceTimersByTimeAsync(0);
	expect(rabbit.isConsuming()).toBe(false);
	expect(first.close).toHaveBeenCalledTimes(1);
	expect((connections[0] as FakeConnection).close).toHaveBeenCalledTimes(1);
	expect((await health()).status).toBe(503);
	await vi.advanceTimersByTimeAsync(1000);
	expect(connections).toHaveLength(2);
	expect((connections[1] as FakeConnection).channels[0].consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
	expect((await health()).status).toBe(200);
});

it('subscribes again after the connection drops', async () => {
	const { rabbit } = await load();
	await rabbit.initRabbitMQ();
	(connections[0] as FakeConnection).emit('close');
	expect(rabbit.isConsuming()).toBe(false);
	await vi.advanceTimersByTimeAsync(1000);
	expect((connections[1] as FakeConnection).channels[0].consume).toHaveBeenCalledTimes(1);
	expect(rabbit.isConsuming()).toBe(true);
});

it('keeps a web pod healthy without a consumer', async () => {
	config.consumerMode = false;
	const { health } = await load();
	expect((await health()).status).toBe(200);
});
