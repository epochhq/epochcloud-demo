import type { PageServerLoad } from './$types';
import { config } from '#lib/server/config.js';

export const load: PageServerLoad = async ({ url }) => {
	const domain = url.hostname.split('.').slice(-2).join('.');
	return {
		domain,
		version: config.version,
		commit: config.commit,
		buildTime: config.buildTime,
		hostname: config.hostname,
		environment: config.environment,
		startedAt: config.startedAt,
		consumerMode: config.consumerMode,
		rybbit: config.rybbit.enabled ? { siteId: config.rybbit.siteId, host: config.rybbit.host } : null,
		features: {
			rabbitmq: config.rabbitmq.enabled,
			valkey: config.valkey.enabled,
			cnpg: config.cnpg.enabled,
			defectdojo: config.defectdojo.enabled,
			smtp: config.smtp.enabled,
			betterauth: config.betterauth.enabled,
			gofeatureflag: config.gofeatureflag.enabled,
			ntfy: config.ntfy.enabled,
			knative: config.knative.enabled,
			crowdsec: config.crowdsec.enabled
		},
		faro: config.faro.enabled
	};
};
