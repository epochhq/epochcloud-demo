import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('#lib/server/config.js', () => ({
	config: {
		version: 't',
		commit: 'c',
		buildTime: 'b',
		environment: 'dev',
		hostname: 'h',
		consumerMode: false,
		rybbit: { enabled: false },
		faro: { enabled: false },
		otelEndpoint: '',
		betterauth: { enabled: true, url: 'http://auth.test' }
	}
}));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/rabbitmq.js', () => ({ initRabbitMQ: vi.fn(), closeRabbit: vi.fn() }));
vi.mock('#lib/server/valkey.js', () => ({ initValkey: vi.fn(), closeValkey: vi.fn() }));
vi.mock('#lib/server/cnpg.js', () => ({ initCnpg: vi.fn(), closeCnpg: vi.fn() }));
vi.mock('#lib/server/defectdojo.js', () => ({ initDefectDojo: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ initSmtp: vi.fn() }));
vi.mock('#lib/server/checks.js', () => ({}));
vi.mock('#lib/server/snapshot.js', () => ({ startSnapshots: vi.fn() }));

import { handle } from '../../src/hooks.server.js';
import { ANONYMOUS_PREFIXES, ANONYMOUS_ROUTES } from '../../src/lib/server/access.js';
import { HANDLER_WAITS } from '../../src/lib/limits.js';
import { getSession } from '../../src/lib/server/session.js';
import { httpRequestsTotal } from '../../src/lib/server/metrics.js';

// Sign-in is decided once, in the `handle` hook. These tests drive the real hook
// over every route module in the tree, so a new route is closed until it is
// opened on purpose, and removing the check from any one route cannot go unseen.

const ANONYMOUS = ['/api/faro/collect', '/auth/session', '/health', '/metrics', '/robots.txt', '/status/x', '/version'];

const modules = Object.keys(import.meta.glob('/src/routes/**/+server.ts')).map((file) =>
	file.replace('/src/routes', '').replace('/+server.ts', '').replace('[name]', 'x')
);

const sessionFetch = vi.fn();
vi.stubGlobal('fetch', sessionFetch);

let nextClient = 0;
function event(pathname: string, init: { method?: string; cookie?: string; type?: string; client?: string } = {}) {
	const headers: Record<string, string> = {};
	if (init.cookie) headers.cookie = init.cookie;
	if (init.type) headers['content-type'] = init.type;
	const request = new Request(`http://demo.test${pathname}`, {
		method: init.method ?? 'GET',
		headers,
		body: init.method && init.method !== 'GET' ? '' : undefined
	});
	const client = init.client ?? `client-${nextClient++}`;
	return { url: new globalThis.URL(request.url), request, getClientAddress: () => client, locals: {} as Record<string, unknown> };
}
const run = (e: ReturnType<typeof event>) => {
	const resolve = vi.fn(async () => new Response('ok'));
	return { resolve, done: handle({ event: e, resolve } as never) };
};

function sessionFor(user: { id: string; verified: boolean } | null) {
	sessionFetch.mockReset().mockImplementation(async () =>
		user
			? Response.json({
					user: { id: user.id, email: `${user.id}@example.test`, name: 'N', emailVerified: user.verified },
					session: { expiresAt: '2030-01-01T00:00:00Z' }
				})
			: Response.json(null)
	);
}

beforeEach(() => sessionFor(null));

it('lists exactly the anonymous routes the tree is meant to have', () => {
	expect(modules.filter((path) => ANONYMOUS_ROUTES.includes(path) || ANONYMOUS_PREFIXES.some((prefix) => path.startsWith(prefix))).sort()).toEqual(ANONYMOUS);
	expect(HANDLER_WAITS).toBeDefined();
});

it.each(modules.filter((path) => !ANONYMOUS.includes(path)))('refuses %s without a sign-in, and never reaches the handler', async (path) => {
	for (const method of ['GET', 'POST']) {
		const { resolve, done } = run(event(path, { method, type: method === 'POST' ? 'application/x-www-form-urlencoded' : undefined }));
		const response = await done;
		expect(response.status, `${method} ${path}`).toBe(401);
		expect(resolve).not.toHaveBeenCalled();
	}
	expect(sessionFetch).not.toHaveBeenCalled();
});

it.each(modules.filter((path) => ANONYMOUS.includes(path)))('lets the anonymous route %s through without a lookup', async (path) => {
	const { resolve, done } = run(event(path));
	expect((await done).status).toBe(200);
	expect(resolve).toHaveBeenCalledOnce();
	expect(sessionFetch).not.toHaveBeenCalled();
});

it('accepts a verified session on a protected route and hands the handler its session', async () => {
	sessionFor({ id: 'user-a', verified: true });
	const e = event('/cache/get', { cookie: 'demo.session_token=abc' });
	const { resolve, done } = run(e);
	expect((await done).status).toBe(200);
	expect(resolve).toHaveBeenCalledOnce();
	expect((e.locals.session as { user: { id: string } }).user.id).toBe('user-a');
});

it('refuses an unverified session, and a cookie that is not a session cookie makes no lookup', async () => {
	sessionFor({ id: 'user-u', verified: false });
	const unverified = await run(event('/cache/get', { cookie: 'demo.session_token=abc' })).done;
	expect(unverified.status).toBe(403);
	sessionFetch.mockClear();
	const other = await run(event('/cache/get', { cookie: 'theme=dark' })).done;
	expect(other.status).toBe(401);
	expect(sessionFetch).not.toHaveBeenCalled();
});

it('requires a form-encoded body for every request that changes anything', async () => {
	sessionFor({ id: 'user-a', verified: true });
	for (const type of ['application/json', undefined, 'text/plain']) {
		const response = await run(event('/email/send', { method: 'POST', cookie: 'demo.session_token=abc', type })).done;
		expect(response.status).toBe(415);
	}
});

it('limits a signed-in user to 60 calls a minute, whichever address they come from', async () => {
	sessionFor({ id: 'user-limited', verified: true });
	const statuses: number[] = [];
	for (let i = 0; i < 61; i++) statuses.push((await run(event('/cache/get', { cookie: 'demo.session_token=abc' })).done).status);
	expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
	expect(statuses[60]).toBe(429);
});

it('does not spend a client address lookup budget on requests that carry no session cookie', async () => {
	sessionFor({ id: 'user-quiet', verified: true });
	for (let i = 0; i < 61; i++) expect((await run(event('/cache/get', { client: 'quiet-client' })).done).status).toBe(401);
	expect((await run(event('/cache/get', { cookie: 'demo.session_token=abc', client: 'quiet-client' })).done).status).toBe(200);
});

it('asks BetterAuth nothing for a request without a session cookie', async () => {
	expect(await getSession(new Request('http://demo.test/', { headers: { cookie: 'theme=dark' } }))).toBeNull();
	expect(await getSession(new Request('http://demo.test/'))).toBeNull();
	expect(sessionFetch).not.toHaveBeenCalled();
});

it('limits the session lookups one client address can cause', async () => {
	sessionFor(null);
	const statuses: number[] = [];
	for (let i = 0; i < 61; i++) statuses.push((await run(event('/cache/get', { cookie: 'demo.session_token=junk', client: 'one-client-lookup' })).done).status);
	expect(sessionFetch).toHaveBeenCalledTimes(60);
	expect(statuses[60]).toBe(429);
});

it('puts the response headers on what it answers, refusals included', async () => {
	for (const response of [await run(event('/health')).done, await run(event('/cache/get')).done]) {
		expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('permissions-policy')).toContain('camera=()');
	}
});

it('labels the metrics of a path the app does not route as /other, so a request cannot make a new series', async () => {
	await run(event('/_app/immutable/chunks/never-seen-xyz.js')).done;
	await run(event('/status/never-seen-xyz')).done;
	const labels = (await httpRequestsTotal.get()).values.map((value) => String(value.labels.path));
	expect(labels).toContain('/other');
	expect(labels).toContain('/status/:name');
	expect(labels.filter((path) => path.includes('never-seen'))).toEqual([]);
});
