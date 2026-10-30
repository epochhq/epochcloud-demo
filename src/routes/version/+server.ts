import type { RequestHandler } from './$types';
import { config } from '#lib/server/config.js';

export const GET: RequestHandler = async () => {
	return new Response(
		JSON.stringify({
			version: config.version,
			commit: config.commit,
			buildTime: config.buildTime,
			hostname: config.hostname,
			environment: config.environment,
			framework: 'sveltekit',
			timestamp: new Date().toISOString()
		}),
		{
			headers: { 'Content-Type': 'application/json' }
		}
	);
};
