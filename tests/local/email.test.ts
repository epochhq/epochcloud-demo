import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const { sendEmail, config } = vi.hoisted(() => ({ sendEmail: vi.fn(), config: { smtp: { enabled: true } } }));
vi.mock('#lib/server/smtp.js', () => ({ sendEmail }));
vi.mock('#lib/server/config.js', () => ({ config }));

import { GET, POST } from '../../src/routes/email/send/+server.js';

beforeEach(() => {
	sendEmail.mockReset().mockResolvedValue(undefined);
	config.smtp.enabled = true;
	vi.useFakeTimers();
	vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

async function submitEmail(value: string | File | null): Promise<Response> {
	const form = new globalThis.FormData();
	if (value !== null) form.set('email', value);
	const request = new Request('http://demo.test/email/send', { method: 'POST', body: form });
	return POST({ request } as Parameters<typeof POST>[0]);
}

it('passes a textual recipient unchanged to SMTP', async () => {
	const response = await submitEmail('recipient@example.invalid');
	expect(response.status).toBe(200);
	expect(sendEmail).toHaveBeenCalledExactlyOnceWith('recipient@example.invalid');
});

it.each([null, new globalThis.File(['recipient@example.invalid'], 'recipient.txt')])('rejects an unusable email field: %j', async (field) => {
	const response = await submitEmail(field);
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ error: 'Missing email field' });
	expect(sendEmail).not.toHaveBeenCalled();
});

it.each(['GET', 'POST'])('preserves SMTP-disabled and delivery-error responses for %s', async (method) => {
	const invoke = () =>
		method === 'POST'
			? submitEmail('recipient@example.invalid')
			: GET({ url: new globalThis.URL('http://demo.test/email/send?email=recipient@example.invalid') } as Parameters<typeof GET>[0]);
	config.smtp.enabled = false;
	const disabled = await invoke();
	expect(disabled.status).toBe(503);
	expect(await disabled.json()).toMatchObject({ error: 'SMTP not configured (SMTP_HOST not set)' });
	expect(sendEmail).not.toHaveBeenCalled();
	config.smtp.enabled = true;
	sendEmail.mockRejectedValueOnce(new Error('smtp unavailable'));
	const failed = await invoke();
	expect(failed.status).toBe(500);
	expect(await failed.json()).toMatchObject({ success: false, error: 'Error: smtp unavailable' });
});
