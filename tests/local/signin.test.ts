import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { claimCooldown, config } = vi.hoisted(() => ({
	claimCooldown: vi.fn(),
	config: { podNamespace: 'epochcloud-demo-dev', betterauth: { enabled: true, url: 'http://auth.test' } }
}));

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: '' }));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/valkey.js', () => ({ claimCooldown, pingValkey: vi.fn() }));
vi.mock('#lib/server/rabbitmq.js', () => ({ getRabbitStatus: vi.fn() }));
vi.mock('#lib/server/cnpg.js', () => ({ getCnpgStatus: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ verifySmtp: vi.fn() }));
vi.mock('#lib/server/knative.js', () => ({ invokeFibonacci: vi.fn() }));
vi.mock('#lib/server/defectdojo.js', () => ({ getDefectDojoSummary: vi.fn() }));

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

beforeEach(() => {
	betterAuth();
	claimCooldown.mockReset().mockResolvedValue(true);
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

it('limits sign-in attempts per client address and per account', async () => {
	const fromOne: number[] = [];
	for (let i = 0; i < 11; i++) fromOne.push((await post(signIn, { email: `a${i}@example.test`, password: 'x' }, 'one-address')).status);
	expect(fromOne.slice(0, 10).every((status) => status === 401)).toBe(true);
	expect(fromOne[10]).toBe(429);

	const onOneAccount: number[] = [];
	for (let i = 0; i < 11; i++) onOneAccount.push((await post(signIn, { email: 'target@example.test', password: 'x' })).status);
	expect(onOneAccount[10]).toBe(429);
	expect(calls).toHaveLength(20);
});

it('answers a sign-up the same for a new and a registered address, with a confirmation link back to the app', async () => {
	const fresh = await post(signUp, { name: 'N', email: 'fresh@example.test', password: 'long-enough' });
	betterAuth(() => Response.json({ message: 'User already exists' }, { status: 422 }));
	const taken = await post(signUp, { name: 'N', email: 'known@example.test', password: 'long-enough' });
	expect([fresh.status, taken.status]).toEqual([200, 200]);
	expect(await fresh.json()).toMatchObject({ message: SENT });
	expect(await taken.json()).toMatchObject({ message: SENT });
	expect(calls[0]!.body.callbackURL).toBe('https://demo.example.test/');
});

it('sends at most one confirmation mail per target address in the cooldown, for sign-up and resend alike', async () => {
	await post(signUp, { email: 'Victim@Example.test', password: 'long-enough' });
	await post(resend, { email: 'victim@example.test' });
	const [first, second] = claimCooldown.mock.calls.map((call) => call[0] as string);
	expect(first).toBe(second);
	expect(first).not.toContain('victim');
	expect(claimCooldown.mock.calls[0]![1]).toBe(300);

	claimCooldown.mockResolvedValue(false);
	calls.length = 0;
	expect((await post(signUp, { email: 'victim@example.test', password: 'long-enough' })).status).toBe(429);
	expect((await post(resend, { email: 'victim@example.test' })).status).toBe(429);
	expect(calls).toHaveLength(0);
});

it('spends no cooldown on a sign-up that would be refused anyway', async () => {
	for (const fields of [
		{ email: 'not-an-address', password: 'long-enough' },
		{ email: 'ok@example.test', password: 'short' }
	])
		expect((await post(signUp, fields)).status).toBe(400);
	expect(claimCooldown).not.toHaveBeenCalled();
	expect(calls).toHaveLength(0);
});

it('limits sign-ups and resends per client address', async () => {
	for (const [handler, fields] of [
		[signUp, { email: 'x@example.test', password: 'long-enough' }],
		[resend, { email: 'x@example.test' }]
	] as const) {
		const statuses: number[] = [];
		for (let i = 0; i < 11; i++) statuses.push((await post(handler, fields, `busy-${String(handler === signUp)}`)).status);
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
		[resend, { email: 'y@example.test' }]
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
	}
});
