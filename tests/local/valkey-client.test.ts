import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { clients } = vi.hoisted(() => ({ clients: [] as Array<{ options: Record<string, unknown> }> }));

// config.ts reads its plain settings from SvelteKit's private env module; none matter here.
vi.mock('$app/env/private', () => ({
	BETTERAUTH_URL: '',
	CONSUMER_MODE: '',
	CROWDSEC_LAPI_URL: '',
	DEFECTDOJO_PRODUCT: '',
	DEFECTDOJO_URL: '',
	ENVIRONMENT: '',
	FARO_ENABLED: '',
	FARO_RECEIVER_URL: '',
	GOFEATUREFLAG_URL: '',
	HOSTNAME: '',
	KNATIVE_FIBONACCI_URL: '',
	NTFY_TOPIC_PREFIX: '',
	NTFY_URL: '',
	POD_NAMESPACE: '',
	PORT: '',
	RABBITMQ_QUEUE: '',
	RYBBIT_HOST: '',
	RYBBIT_SITE_ID: '',
	SMTP_FROM: '',
	SMTP_HOST: '',
	SMTP_PORT: ''
}));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('ioredis', () => ({
	default: class {
		options: Record<string, unknown>;
		constructor(options: Record<string, unknown>) {
			this.options = options;
			clients.push(this);
		}
		on() {}
		connect() {
			return Promise.resolve();
		}
		quit() {
			return Promise.resolve('OK');
		}
	}
}));

// The real config and client, with ioredis stubbed: what the connection is
// given for the files the platform mounts, and for none.

const VARIABLES = [
	'VALKEY_HOST',
	'VALKEY_HOST_FILE',
	'VALKEY_USERNAME',
	'VALKEY_USERNAME_FILE',
	'VALKEY_PASSWORD',
	'VALKEY_PASSWORD_FILE',
	'VALKEY_KEY_PREFIX',
	'VALKEY_KEY_PREFIX_FILE'
];

let directory: string;

const mount = (name: string, content: string) => {
	const path = join(directory, name);
	writeFileSync(path, content);
	return path;
};

async function connect() {
	vi.resetModules();
	const { initValkey } = await import('../../src/lib/server/valkey.js');
	await initValkey();
	expect(clients).toHaveLength(1);
	return clients[0]!.options;
}

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'demo-valkey-'));
	clients.length = 0;
	for (const name of VARIABLES) vi.stubEnv(name, undefined);
	vi.stubEnv('VALKEY_HOST', 'valkey.test');
});

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe('Valkey connection options', () => {
	it('logs in as the mounted ACL user and prefixes every key with the mounted prefix', async () => {
		vi.stubEnv('VALKEY_USERNAME_FILE', mount('username', 'demo-dev\n'));
		vi.stubEnv('VALKEY_PASSWORD_FILE', mount('password', 's3cret\n'));
		vi.stubEnv('VALKEY_KEY_PREFIX_FILE', mount('prefix', 'demo-dev:\n'));

		const options = await connect();

		expect(options).toMatchObject({ host: 'valkey.test', username: 'demo-dev', password: 's3cret', keyPrefix: 'demo-dev:' });
	});

	it('skips the INFO ready check for an ACL user, which is denied INFO', async () => {
		vi.stubEnv('VALKEY_USERNAME_FILE', mount('username', 'demo-dev\n'));

		expect((await connect()).enableReadyCheck).toBe(false);
	});

	it('sends no username and no prefix when the files are not set, as before the platform change', async () => {
		vi.stubEnv('VALKEY_PASSWORD_FILE', mount('password', 's3cret\n'));

		const options = await connect();

		expect(options.password).toBe('s3cret');
		expect(options.username).toBeUndefined();
		expect(options.keyPrefix).toBeUndefined();
		expect(options.enableReadyCheck).toBe(true);
	});

	it('sends no username and no prefix when a mounted file is empty or not there yet', async () => {
		vi.stubEnv('VALKEY_USERNAME_FILE', mount('username', ''));
		vi.stubEnv('VALKEY_KEY_PREFIX_FILE', join(directory, 'absent'));

		const options = await connect();

		expect(options.username).toBeUndefined();
		expect(options.keyPrefix).toBeUndefined();
	});

	it('takes the plain environment variables when no file is configured', async () => {
		vi.stubEnv('VALKEY_USERNAME', 'local-user');
		vi.stubEnv('VALKEY_KEY_PREFIX', 'local:');

		const options = await connect();

		expect(options).toMatchObject({ username: 'local-user', keyPrefix: 'local:' });
	});
});
