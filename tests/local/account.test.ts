import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { sendEmail, publish, claimCooldown, config } = vi.hoisted(() => ({
	sendEmail: vi.fn(),
	publish: vi.fn(),
	claimCooldown: vi.fn(),
	config: {
		hostname: 'pod-a',
		environment: 'dev',
		smtp: { enabled: true },
		ntfy: { enabled: true, topicPrefix: 'epochcloud-demo', url: 'http://ntfy.test', user: 'app', password: 'secret' },
		betterauth: { enabled: true, url: 'http://auth.test' }
	}
}));

vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
vi.mock('#lib/server/smtp.js', () => ({ sendEmail }));
vi.mock('#lib/server/valkey.js', () => ({ claimCooldown }));

import { POST as sendMail } from '../../src/routes/email/send/+server.js';
import { POST as sendNotification } from '../../src/routes/ntfy/send/+server.js';
import { isOwnTopic, topicFor, publish as realPublish } from '../../src/lib/server/ntfy.js';

// The hook (access.test.ts) decides who gets this far. These handlers act on
// the session it hands them, never on anything the request names.

type Handler = (event: never) => Promise<Response> | Response;
const call = (handler: Handler, fields: Record<string, string> = {}, userId = 'user-a') => {
	const request = new Request('http://demo.test/x?email=victim@example.test&topic=alerts', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(fields).toString()
	});
	return handler({
		request,
		locals: { session: { user: { id: userId, email: `${userId}@example.test`, name: 'N', emailVerified: true }, expiresAt: '' } }
	} as never);
};

beforeEach(() => {
	sendEmail.mockReset().mockResolvedValue(undefined);
	publish.mockReset();
	claimCooldown.mockReset().mockResolvedValue(true);
	config.ntfy.user = 'app';
	config.ntfy.password = 'secret';
});

it('mails the session address and ignores any recipient in the request', async () => {
	const response = await call(sendMail as Handler, { email: 'victim@example.test', to: 'victim@example.test' });
	expect(response.status).toBe(200);
	expect(sendEmail).toHaveBeenCalledExactlyOnceWith('user-a@example.test');
});

it('allows one test mail per cooldown window', async () => {
	claimCooldown.mockResolvedValue(false);
	expect((await call(sendMail as Handler)).status).toBe(429);
	expect(sendEmail).not.toHaveBeenCalled();
});

it('does not publish, and says why, while the app has no ntfy credential of its own', async () => {
	config.ntfy.user = '';
	config.ntfy.password = '';
	const response = await call(sendNotification as Handler);
	expect(response.status).toBe(503);
	expect(await response.json()).toMatchObject({ reason: 'unavailable' });
	expect(claimCooldown).not.toHaveBeenCalled();
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
