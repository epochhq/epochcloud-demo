import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { budgets, valkey, config } = vi.hoisted(() => ({
	// Valkey's shared budgets, counted here without time: a test ends a window by deleting its counts.
	budgets: new Map<string, number>(),
	valkey: { up: true },
	config: { podNamespace: 'epochcloud-demo-dev', betterauth: { enabled: true, url: 'http://auth.test' } }
}));

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: '' }));
vi.mock('node:os', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:os')>()),
	networkInterfaces: () => ({
		lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
		eth0: [{ address: '10.244.1.7', family: 'IPv4', internal: false }]
	})
}));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/valkey.js', () => ({
	pingValkey: vi.fn(),
	sharedBudget: (name: string, points: number) => ({
		take: async (key: string) => {
			if (!valkey.up) return 'unavailable';
			const count = (budgets.get(`${name}:${key}`) ?? 0) + 1;
			budgets.set(`${name}:${key}`, count);
			return count > points ? 'limited' : 'ok';
		}
	})
}));
vi.mock('#lib/server/rabbitmq.js', () => ({ getRabbitStatus: vi.fn() }));
vi.mock('#lib/server/cnpg.js', () => ({ getCnpgStatus: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ verifySmtp: vi.fn() }));
vi.mock('#lib/server/knative.js', () => ({ invokeFibonacci: vi.fn() }));

import '../../src/lib/server/checks.js';
import { refresh } from '../../src/lib/server/snapshot.js';
import { SENT, WRONG } from '../../src/lib/server/signin.js';
import { POST as signIn } from '../../src/routes/auth/sign-in/+server.js';
import { POST as signUp } from '../../src/routes/auth/sign-up/+server.js';
import { POST as resend } from '../../src/routes/auth/resend/+server.js';
import { POST as signOut } from '../../src/routes/auth/sign-out/+server.js';

// The sign-in routes against a fake BetterAuth that knows one confirmed account
// (known@example.test / right-password) and one unconfirmed one.

type Handler = (event: never) => Promise<Response>;
const calls: Array<{ path: string; body: Record<string, string>; headers: Headers }> = [];

function betterAuth(answer?: (path: string, body: Record<string, string>) => Response) {
	calls.length = 0;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		const path = new globalThis.URL(url).pathname.replace('/api/auth', '');
		const body = JSON.parse((init.body as string | undefined) ?? '{}') as Record<string, string>;
		calls.push({ path, body, headers: new Headers(init.headers) });
		if (answer) return answer(path, body);
		if (path === '/sign-in/email') {
			if (body.email === 'known@example.test' && body.password === 'right-password')
				return Response.json({ token: 't' }, { headers: { 'set-cookie': 'demo.session_token=t; Domain=.example.test; Secure; HttpOnly' } });
			if (body.email === 'new@example.test' && body.password === 'right-password')
				return Response.json({ code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' }, { status: 403 });
			return Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, { status: 401 });
		}
		return Response.json({ status: true });
	});
}

let nextClient = 0;
const post = (handler: unknown, fields: Record<string, string>, client = `client-${nextClient++}`, cookie = '') =>
	(handler as Handler)({
		request: new Request('https://demo.example.test/auth/x', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
			body: new URLSearchParams(fields).toString()
		}),
		url: new globalThis.URL('https://demo.example.test/auth/x'),
		getClientAddress: () => client
	} as never);

const endWindow = (name: string) => {
	for (const key of budgets.keys()) if (key.startsWith(`${name}:`)) budgets.delete(key);
};

beforeEach(() => {
	betterAuth();
	budgets.clear();
	valkey.up = true;
});

it('signs in, hands BetterAuth the page origin and the caller address, and passes its cookie on', async () => {
	const response = await post(signIn, { email: ' Known@Example.test ', password: 'right-password' }, '203.0.113.7');
	expect(response.status).toBe(200);
	expect(response.headers.getSetCookie()).toEqual(['demo.session_token=t; Domain=.example.test; Secure; HttpOnly']);
	expect(calls[0]!.headers.get('origin')).toBe('https://demo.example.test');
	expect(calls[0]!.headers.get('x-forwarded-for')).toBe('203.0.113.7');
	expect(calls[0]!.body.email).toBe('known@example.test');
});

it('gives a wrong password and an unknown address the same answer', async () => {
	const wrong = await post(signIn, { email: 'known@example.test', password: 'wrong' });
	const unknown = await post(signIn, { email: 'nobody@example.test', password: 'wrong' });
	expect([wrong.status, unknown.status]).toEqual([401, 401]);
	const strip = async (r: Response) => ({ ...((await r.json()) as Record<string, unknown>), timestamp: 0 });
	const [wrongBody, unknownBody] = [await strip(wrong), await strip(unknown)];
	expect(wrongBody).toEqual(unknownBody);
	expect(unknownBody).toMatchObject({ error: WRONG });
	expect(unknown.headers.getSetCookie()).toEqual([]);
});

it('says an account needs confirming only to the caller who gave its password', async () => {
	const response = await post(signIn, { email: 'new@example.test', password: 'right-password' });
	expect(response.status).toBe(403);
	expect(await response.json()).toMatchObject({ reason: 'unverified' });
});

it('limits sign-in attempts per client address, an IPv6 /64 counting as one', async () => {
	const statuses: number[] = [];
	for (let i = 0; i < 11; i++) statuses.push((await post(signIn, { email: `a${i}@example.test`, password: 'x' }, `2001:db8:1:2::${i + 1}`)).status);
	expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
	expect(statuses[10]).toBe(429);
	expect((await post(signIn, { email: 'a@example.test', password: 'x' }, '2001:db8:1:3::1')).status).toBe(401);
});

it('counts only wrong passwords, so neither signing in often nor a guesser elsewhere locks the owner out', async () => {
	const owner = { email: 'known@example.test', password: 'right-password' };
	for (let i = 0; i < 6; i++) expect((await post(signIn, owner, '203.0.113.9')).status).toBe(200);
	for (let i = 0; i < 5; i++) expect((await post(signIn, { ...owner, password: 'guess' }, '198.51.100.7')).status).toBe(401);
	expect((await post(signIn, owner, '198.51.100.7')).status).toBe(429);
	expect((await post(signIn, owner, '203.0.113.9')).status).toBe(200);
});

it('stops guessing at one account from many addresses at 100 wrong passwords an hour', async () => {
	for (let i = 0; i < 100; i++) await post(signIn, { email: 'spread@example.test', password: 'guess' }, `192.0.2.${i}`);
	expect((await post(signIn, { email: 'spread@example.test', password: 'guess' }, '192.0.2.200')).status).toBe(429);
});

it('answers a sign-up the same for a new and a registered address, with a confirmation link back to the app', async () => {
	// BetterAuth answers 200 with no token for both, because it requires email verification.
	betterAuth(() => Response.json({ token: null, user: { email: 'x' } }));
	const fresh = await post(signUp, { name: 'N', email: 'fresh@example.test', password: 'long-enough' });
	const taken = await post(signUp, { name: 'N', email: 'known@example.test', password: 'long-enough' });
	expect([fresh.status, taken.status]).toEqual([200, 200]);
	expect(await fresh.json()).toMatchObject({ message: SENT });
	expect(await taken.json()).toMatchObject({ message: SENT });
	expect(calls[0]!.body.callbackURL).toBe('https://demo.example.test/');
});

it('sends one confirmation mail per inbox in the cooldown, a +tag counting as the same inbox, and stores no address', async () => {
	expect((await post(signUp, { email: 'Victim@Example.test', password: 'long-enough' })).status).toBe(200);
	calls.length = 0;
	expect((await post(resend, { email: 'victim+1@example.test' })).status).toBe(429);
	expect((await post(signUp, { email: 'victim+2@example.test', password: 'long-enough' })).status).toBe(429);
	expect(calls).toHaveLength(0);
	expect([...budgets.keys()].some((key) => key.includes('victim'))).toBe(false);
});

it('sends an inbox at most 3 confirmation mails a day', async () => {
	const statuses: number[] = [];
	for (let i = 0; i < 4; i++) {
		endWindow('mail-cooldown');
		statuses.push((await post(resend, { email: `daily+${i}@example.test` })).status);
	}
	expect(statuses).toEqual([200, 200, 200, 429]);
});

it('sends at most 60 confirmation mails an hour for the whole demo', async () => {
	const statuses: number[] = [];
	for (let i = 0; i < 61; i++) statuses.push((await post(resend, { email: `inbox${i}@example.test` }, `192.0.2.${i}`)).status);
	expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
	expect(statuses[60]).toBe(429);
	expect(calls).toHaveLength(60);
});

it("sends a client network at most 3 confirmation mails an hour, so one client cannot use up everyone's", async () => {
	const statuses: number[] = [];
	for (let i = 0; i < 4; i++) statuses.push((await post(resend, { email: `net${i}@example.test` }, `2001:db8:9:9::${i + 1}`)).status);
	expect(statuses).toEqual([200, 200, 200, 429]);
	expect((await post(resend, { email: 'net9@example.test' }, '2001:db8:9:a::1')).status).toBe(200);
});

it('costs an inbox none of its daily mails when a mail is refused for another reason', async () => {
	for (let i = 0; i < 60; i++) await post(resend, { email: `filler${i}@example.test` }, `192.0.2.${i}`);
	expect((await post(resend, { email: 'patient@example.test' }, '203.0.113.30')).status).toBe(429);
	endWindow('mail-hour');
	const statuses: number[] = [];
	for (let i = 0; i < 3; i++) {
		endWindow('mail-cooldown');
		statuses.push((await post(resend, { email: 'patient@example.test' }, `203.0.113.${40 + i}`)).status);
	}
	expect(statuses).toEqual([200, 200, 200]);
});

it('sends nothing, and says so, when the mail budgets cannot be counted', async () => {
	valkey.up = false;
	for (const response of [await post(signUp, { email: 'z@example.test', password: 'long-enough' }), await post(resend, { email: 'z@example.test' })]) {
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ error: 'confirmation mails cannot be sent right now; nothing was sent' });
	}
	expect(calls).toHaveLength(0);
});

it('spends no mail budget on a sign-up that would be refused anyway', async () => {
	for (const fields of [
		{ email: 'not-an-address', password: 'long-enough' },
		{ email: 'ok@example.test', password: 'short' }
	])
		expect((await post(signUp, fields)).status).toBe(400);
	expect(budgets.size).toBe(0);
	expect(calls).toHaveLength(0);
});

it('limits sign-ups and resends per client address, an IPv6 /64 counting as one', async () => {
	for (const handler of [signUp, resend]) {
		const statuses: number[] = [];
		for (let i = 0; i < 11; i++) {
			endWindow('mail-client');
			statuses.push(
				(
					await post(
						handler,
						{ email: `${handler === signUp ? 'up' : 'again'}${i}@example.test`, password: 'long-enough' },
						`2001:db8:${handler === signUp ? 'a' : 'b'}::${i + 1}`
					)
				).status
			);
		}
		expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
		expect(statuses[10]).toBe(429);
	}
});

it('answers a resend the same whatever the address', async () => {
	const response = await post(resend, { email: 'nobody@example.test' });
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ message: SENT });
});

it('says the sign-in service did not answer, on every route, when it times out', async () => {
	vi.stubGlobal('fetch', async () => {
		throw new globalThis.DOMException('timed out', 'TimeoutError');
	});
	for (const [handler, fields] of [
		[signIn, { email: 'known@example.test', password: 'right-password' }],
		[signUp, { email: 'y@example.test', password: 'long-enough' }],
		[resend, { email: 'y2@example.test' }]
	] as const) {
		const response = await post(handler, fields);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ reason: 'auth-unavailable', timeout: true });
	}
	expect((await post(signOut, {}, 'c', 'demo.session_token=t')).status).toBe(503);
});

it('signs out at BetterAuth with the caller cookie and passes the clearing cookie on', async () => {
	betterAuth(() => Response.json({ success: true }, { headers: { 'set-cookie': 'demo.session_token=; Max-Age=0' } }));
	const response = await post(signOut, {}, 'c', 'demo.session_token=t');
	expect(response.status).toBe(200);
	expect(calls[0]!.headers.get('cookie')).toBe('demo.session_token=t');
	expect(response.headers.getSetCookie()).toEqual(['demo.session_token=; Max-Age=0']);
});

it('shows the Account check as not running, not failed, when BetterAuth turns it away under its rate limit', async () => {
	betterAuth(() => Response.json({ message: 'Too many requests' }, { status: 429 }));
	expect(await refresh('betterauth', 1_000, new AbortController().signal)).toMatchObject({ connected: false, state: 'not-running' });
});

it('passes the Account status check only when BetterAuth refuses an unknown sign-in from its database', async () => {
	const signal = new AbortController().signal;
	for (const [status, ok] of [
		[401, true],
		[200, false],
		[500, false]
	] as const) {
		betterAuth(() => Response.json({}, { status }));
		expect((await refresh('betterauth', 1_000, signal)).connected, `HTTP ${status}`).toBe(ok);
		expect(calls[0]!.path).toBe('/sign-in/email');
		expect(calls[0]!.headers.get('x-forwarded-for'), 'the pod address, so each pod has its own bucket').toBe('10.244.1.7');
	}
});
