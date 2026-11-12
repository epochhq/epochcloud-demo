import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { valkeySet, config } = vi.hoisted(() => ({
	valkeySet: vi.fn(),
	config: {
		valkey: { enabled: false, host: '', port: 6379, password: '', database: 0 },
		faro: { receiverUrl: 'http://collector.test' },
		betterauth: { enabled: true, url: 'http://auth.test' }
	}
}));

vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));

import { POST as cacheSet } from '../../src/routes/cache/set/+server.js';
import { POST as faro } from '../../src/routes/api/faro/collect/+server.js';
import { claimCooldown } from '../../src/lib/server/valkey.js';
import { GET as sessionRoute } from '../../src/routes/auth/session/+server.js';

// Small guards on the routes that reach shared services.

vi.mock('#lib/server/valkey.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/lib/server/valkey.js')>()), valkeySet }));

const form = (fields: Record<string, string>) =>
	new Request('http://demo.test/x', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields).toString()
	});

beforeEach(() => valkeySet.mockReset().mockResolvedValue(undefined));

it('writes to the shared cache only with an expiry, a short key and the demo prefix', async () => {
	for (const ttl of ['0', 'x', '999999']) {
		const response = await cacheSet({ request: form({ key: 'k', value: 'v', ttl }) } as never);
		expect(response.status).toBe(200);
	}
	const ttls = valkeySet.mock.calls.map((call) => call[2] as number);
	expect(ttls.every((ttl) => ttl >= 1 && ttl <= 3600)).toBe(true);
	expect(valkeySet.mock.calls.every((call) => String(call[0]).startsWith('demo:'))).toBe(true);
	const refused = await cacheSet({ request: form({ key: 'a'.repeat(65) }) } as never);
	expect(refused.status).toBe(400);
});

it('refuses a telemetry payload over the size cap before calling the collector', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	const request = new Request('http://demo.test/api/faro/collect', { method: 'POST', headers: { 'content-length': String(70 * 1024) }, body: 'x' });
	const response = await faro({ request, getClientAddress: () => 'client-faro' } as never);
	expect(response.status).toBe(413);
	expect(fetchMock).not.toHaveBeenCalled();
});

it('gives no cooldown slot, so sends nothing, when the shared cache is not there', async () => {
	expect(await claimCooldown('mail:user', 300)).toBe(false);
});

it('limits the telemetry relay per client address, and one client does not use up another', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(null, { status: 202 }))
	);
	const post = (client: string) =>
		faro({ request: new Request('http://demo.test/api/faro/collect', { method: 'POST', body: '{}' }), getClientAddress: () => client } as never);
	const statuses: number[] = [];
	for (let i = 0; i < 121; i++) statuses.push((await post('relay-one')).status);
	expect(statuses.slice(0, 120).every((status) => status === 202)).toBe(true);
	expect(statuses[120]).toBe(429);
	expect((await post('relay-two')).status).toBe(202);
});

it('limits the session lookups /auth/session can cause per client address', async () => {
	const lookups = vi.fn(async () => Response.json(null));
	vi.stubGlobal('fetch', lookups);
	const get = (client: string) =>
		sessionRoute({
			request: new Request('http://demo.test/auth/session', { headers: { cookie: 'demo.session_token=x' } }),
			getClientAddress: () => client
		} as never);
	const statuses: number[] = [];
	for (let i = 0; i < 61; i++) statuses.push((await get('session-one')).status);
	expect(statuses[60]).toBe(429);
	expect(lookups).toHaveBeenCalledTimes(60);
	expect((await get('session-two')).status).toBe(200);
});
