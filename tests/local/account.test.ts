import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { sendEmail, publish, claimCooldown, config } = vi.hoisted(() => ({
	sendEmail: vi.fn(),
	publish: vi.fn(),
	claimCooldown: vi.fn(),
	config: {
		hostname: 'pod-a',
		environment: 'dev',
		smtp: { enabled: true },
		ntfy: { enabled: true, topicPrefix: 'epochcloud-demo', url: 'http://ntfy.test', user: '', password: '' },
		betterauth: { enabled: true, url: 'http://auth.test' }
	}
}));

vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ sendEmail }));
vi.mock('#lib/server/valkey.js', () => ({ claimCooldown }));
vi.mock('#lib/server/cnpg.js', () => ({ createItem: vi.fn(), listItems: vi.fn(), deleteItem: vi.fn() }));

import { POST as sendMail } from '../../src/routes/email/send/+server.js';
import { POST as sendNotification } from '../../src/routes/ntfy/send/+server.js';
import { POST as createItem } from '../../src/routes/cnpg/items/+server.js';
import { POST as chaos } from '../../src/routes/chaos/+server.js';
import { isOwnTopic, topicFor, publish as realPublish } from '../../src/lib/server/ntfy.js';

// BetterAuth answers get-session for the cookie the browser sent.
const people: Record<string, { id: string; email: string; verified: boolean }> = {
	'verified-a': { id: 'user-a', email: 'a@example.test', verified: true },
	unverified: { id: 'user-u', email: 'u@example.test', verified: false }
};
vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
	const who = people[String((init?.headers as Record<string, string> | undefined)?.cookie ?? '')];
	if (!who) return Response.json(null);
	return Response.json({ user: { id: who.id, email: who.email, name: 'N', emailVerified: who.verified }, session: { expiresAt: '2030-01-01T00:00:00Z' } });
});

type Handler = (event: never) => Promise<Response> | Response;
function call(handler: Handler, options: { cookie?: string; fields?: Record<string, string>; type?: string | null } = {}) {
	const headers: Record<string, string> = {};
	if (options.cookie) headers.cookie = options.cookie;
	const type = options.type === undefined ? 'application/x-www-form-urlencoded' : options.type;
	if (type) headers['content-type'] = type;
	const request = new Request('http://demo.test/x', { method: 'POST', headers, body: new URLSearchParams(options.fields ?? {}).toString() });
	return handler({ request, fetch } as never);
}

beforeEach(() => {
	sendEmail.mockReset().mockResolvedValue(undefined);
	publish.mockReset();
	claimCooldown.mockReset().mockResolvedValue(true);
});

it.each([
	['mail', sendMail],
	['notification', sendNotification],
	['item', createItem],
	['chaos', chaos]
])('refuses an anonymous or unverified %s request with a JSON reason before doing anything', async (_name, handler) => {
	const anonymous = await call(handler as Handler, { fields: { action: 'cpu', text: 'x' } });
	expect(anonymous.status).toBe(401);
	expect(await anonymous.json()).toMatchObject({ success: false, reason: 'unauthenticated' });
	const unverified = await call(handler as Handler, { cookie: 'unverified', fields: { action: 'cpu', text: 'x' } });
	expect(unverified.status).toBe(403);
	expect(await unverified.json()).toMatchObject({ reason: 'unverified' });
	expect(sendEmail).not.toHaveBeenCalled();
	expect(claimCooldown).not.toHaveBeenCalled();
});

it('accepts only form-encoded POSTs, so the framework origin check always applies', async () => {
	for (const type of ['application/json', null]) expect((await call(sendMail as Handler, { cookie: 'verified-a', type })).status).toBe(415);
	expect(sendEmail).not.toHaveBeenCalled();
});

it('mails the session address and ignores any recipient in the request', async () => {
	const response = await call(sendMail as Handler, { cookie: 'verified-a', fields: { email: 'victim@example.test', to: 'victim@example.test' } });
	expect(response.status).toBe(200);
	expect(sendEmail).toHaveBeenCalledExactlyOnceWith('a@example.test');
});

it('allows one test mail per cooldown window', async () => {
	claimCooldown.mockResolvedValue(false);
	const response = await call(sendMail as Handler, { cookie: 'verified-a' });
	expect(response.status).toBe(429);
	expect(sendEmail).not.toHaveBeenCalled();
});

it('derives the notification topic from the session user, never from the request', () => {
	expect(topicFor('user-a')).toMatch(/^epochcloud-demo-dev-[0-9a-f]{24}$/);
	expect(topicFor('user-a')).toBe(topicFor('user-a'));
	expect(topicFor('user-a')).not.toBe(topicFor('user-b'));
	for (const topic of ['alerts', 'epochcloud-security', 'epochcloud-demo', '../epochcloud-demo-x', 'epochcloud-demo-x/y'])
		expect(isOwnTopic(topic)).toBe(false);
	expect(isOwnTopic(topicFor('user-a'))).toBe(true);
});

it('refuses to publish outside the app prefix, whatever calls it', async () => {
	const fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
	await expect(realPublish('alerts', 't', 'm')).rejects.toThrow('outside the app prefix');
	expect(fetchMock).not.toHaveBeenCalled();
});
