import type { RequestHandler } from './$types';
import { json } from '#lib/server/http.js';
import { valkeyGet } from '#lib/server/valkey.js';

const KEY = /^[A-Za-z0-9_-]{1,64}$/;

export const GET: RequestHandler = async ({ url }) => {
	const key = url.searchParams.get('key') || 'demo-key';
	if (!KEY.test(key)) return json({ success: false, error: 'key: letters, digits, dash and underscore, at most 64' }, 400);
	try {
		const value = await valkeyGet(`demo:${key}`);
		return json({ key, value, cache_hit: value !== null });
	} catch {
		return json({ success: false, error: 'the cache did not answer' }, 502);
	}
};
