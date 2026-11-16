import { expect, it, vi } from 'vite-plus/test';

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
vi.mock('#lib/server/valkey.js', () => {
	const spent = new Map<string, number>();
	const sharedBudget = (name: string, points: number) => ({
		take: async (key: string) => {
			spent.set(`${name}:${key}`, (spent.get(`${name}:${key}`) ?? 0) + 1);
			return spent.get(`${name}:${key}`)! > points ? 'limited' : 'ok';
		}
	});
	return { initValkey: vi.fn(), closeValkey: vi.fn(), sharedBudget };
});
vi.mock('#lib/server/cnpg.js', () => ({ initCnpg: vi.fn(), closeCnpg: vi.fn() }));
vi.mock('#lib/server/defectdojo.js', () => ({ initDefectDojo: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ initSmtp: vi.fn() }));
vi.mock('#lib/server/checks.js', () => ({}));
vi.mock('#lib/server/snapshot.js', () => ({ startSnapshots: vi.fn() }));

import { handle } from '../../src/hooks.server.js';

// The whole visitor path through the real hook and the real route handlers,
// against a fake BetterAuth that keeps accounts, mails and sessions the way the
// service does: sign up, confirm the address from the mail, sign in, use a gated
// demo, sign out. If any step of sign-in disappears from the app, this fails.

const users = new Map<string, { password: string; verified: boolean }>();
const sessions = new Map<string, string>();
const mails: string[] = [];

vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
	const path = new globalThis.URL(url).pathname.replace('/api/auth', '');
	const body = JSON.parse((init.body as string | undefined) ?? '{}') as Record<string, string>;
	const token = /demo\.session_token=([^;]+)/.exec(new Headers(init.headers).get('cookie') ?? '')?.[1] ?? '';
	if (path === '/sign-up/email') {
		if (!users.has(body.email!)) users.set(body.email!, { password: body.password!, verified: false });
		mails.push(body.email!);
		return Response.json({ token: null });
	}
	if (path === '/sign-in/email') {
		const user = users.get(body.email!);
		if (!user || user.password !== body.password) return Response.json({}, { status: 401 });
		if (!user.verified) return Response.json({}, { status: 403 });
		sessions.set('tok', body.email!);
		return Response.json({ token: 'tok' }, { headers: { 'set-cookie': 'demo.session_token=tok; Path=/; HttpOnly' } });
	}
	if (path === '/get-session') {
		const email = sessions.get(token);
		return Response.json(email ? { user: { id: email, email, name: 'Visitor', emailVerified: true }, session: { expiresAt: '2030-01-01T00:00:00Z' } } : null);
	}
	if (path === '/sign-out') {
		sessions.delete(token);
		return Response.json({ success: true }, { headers: { 'set-cookie': 'demo.session_token=; Path=/; Max-Age=0' } });
	}
	return new Response(null, { status: 404 });
});

const routes = import.meta.glob<{ POST?: (event: never) => Promise<Response> }>('/src/routes/**/+server.ts', { eager: true });
let jar = '';

async function submit(pathname: string, fields: Record<string, string> = {}): Promise<Response> {
	const request = new Request(`https://demo.example.test${pathname}`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...(jar ? { cookie: jar } : {}) },
		body: new URLSearchParams(fields).toString()
	});
	const event = { url: new globalThis.URL(request.url), request, getClientAddress: () => '198.51.100.4', locals: {} as Record<string, unknown> };
	const resolve = async () => routes[`/src/routes${pathname}/+server.ts`]!.POST!(event as never);
	const response = await handle({ event, resolve } as never);
	for (const cookie of response.headers.getSetCookie()) jar = cookie.split(';')[0]!.endsWith('=') ? '' : cookie.split(';')[0]!;
	return response;
}

it('lets a visitor sign up, confirm, sign in, use a gated demo and sign out', async () => {
	expect((await submit('/prometheus/increment')).status).toBe(401);

	expect((await submit('/auth/sign-up', { name: 'Visitor', email: 'visitor@example.test', password: 'a-long-password' })).status).toBe(200);
	expect(mails).toEqual(['visitor@example.test']);
	expect((await submit('/auth/sign-in', { email: 'visitor@example.test', password: 'a-long-password' })).status).toBe(403);

	users.get('visitor@example.test')!.verified = true; // the link in the mail
	expect((await submit('/auth/sign-in', { email: 'visitor@example.test', password: 'a-long-password' })).status).toBe(200);
	expect(jar).toBe('demo.session_token=tok');

	const demo = await submit('/prometheus/increment', { burst: '1' });
	expect(demo.status).toBe(200);
	expect(await demo.json()).toMatchObject({ success: true, added: 1 });

	expect((await submit('/auth/sign-out')).status).toBe(200);
	expect(jar).toBe('');
	expect(sessions.size).toBe(0);
	expect((await submit('/prometheus/increment')).status).toBe(401);
});
