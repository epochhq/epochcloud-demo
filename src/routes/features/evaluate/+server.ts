import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';
import { guard, unavailable } from '#lib/server/guard.js';
import { json, upstream } from '#lib/server/http.js';

const NAME = /^[A-Za-z0-9._-]{1,64}$/;

export const GET: RequestHandler = async ({ request, url }) => {
	const auth = await guard(request);
	if ('refusal' in auth) return auth.refusal;
	const flagName = url.searchParams.get('flag') ?? '';
	if (!NAME.test(flagName)) return json({ success: false, error: "'flag' is 1 to 64 letters, digits, dot, dash or underscore" }, 400);
	if (!config.gofeatureflag.enabled) return unavailable('GO Feature Flag');
	try {
		const resp = await upstream(`${config.gofeatureflag.url}/v1/feature/${encodeURIComponent(flagName)}/eval`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				evaluationContext: { targetingKey: (url.searchParams.get('user') || 'anonymous').slice(0, 64), environment: config.environment },
				defaultValue: false
			})
		});
		const result = await resp.json();
		return json({ flag: flagName, value: result.value, variationType: result.variationType, reason: result.reason, failed: result.failed || false });
	} catch {
		return json({ success: false, flag: flagName, error: 'the relay proxy did not answer' }, 502);
	}
};
