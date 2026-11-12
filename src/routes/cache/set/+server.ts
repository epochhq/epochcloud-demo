import type { RequestHandler } from './$types';
import { guard } from '#lib/server/guard.js';
import { field, json } from '#lib/server/http.js';
import { valkeySet } from '#lib/server/valkey.js';

const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TTL = 3600;

// The shared Valkey belongs to the platform, so the demo writes only keys under
// its own prefix, short ones, and always with an expiry.
export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const form = await request.formData();
	const key = field(form, 'key', 'demo-key');
	const value = field(form, 'value').slice(0, 200) || `demo-value-${Date.now()}`;
	const ttl = Math.min(Math.max(parseInt(field(form, 'ttl', '300'), 10) || 300, 1), MAX_TTL);
	if (!KEY.test(key)) return json({ success: false, error: 'key: letters, digits, dash and underscore, at most 64' }, 400);
	try {
		await valkeySet(`demo:${key}`, value, ttl);
		return json({ success: true, key, value, ttl_seconds: ttl });
	} catch {
		return json({ success: false, error: 'the cache did not accept the value' }, 502);
	}
};
