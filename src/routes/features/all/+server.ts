import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { guard, unavailable } from '#lib/server/guard.js';
import { json, upstream } from '#lib/server/http.js';

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await guard(request);
	if ('refusal' in auth) return auth.refusal;
	if (!config.gofeatureflag.enabled) return unavailable('GO Feature Flag');
	try {
		const resp = await upstream(`${config.gofeatureflag.url}/v1/allflags`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ evaluationContext: { targetingKey: (url.searchParams.get('user') || 'anonymous').slice(0, 64), environment: config.environment } })
		});
		const body = (await resp.json()) as { flags?: object };
		return json({ success: resp.ok, flags: body.flags ?? body }, resp.ok ? 200 : 502);
	} catch {
		return json({ success: false, error: 'the relay proxy did not answer' }, 502);
	}
};
