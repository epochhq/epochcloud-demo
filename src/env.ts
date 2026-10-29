import { defineEnvVars } from '@sveltejs/kit/env';

// Runtime-only, private and optional: the existing integration config owns
// defaults and enables each service only when its endpoint is present.
const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
	ENVIRONMENT: optional,
	PORT: optional,
	HOSTNAME: optional,
	CONSUMER_MODE: optional,
	RABBITMQ_QUEUE: optional,
	DEFECTDOJO_URL: optional,
	RYBBIT_SITE_ID: optional,
	RYBBIT_HOST: optional,
	SMTP_HOST: optional,
	SMTP_PORT: optional,
	SMTP_FROM: optional,
	BETTERAUTH_URL: optional,
	GOFEATUREFLAG_URL: optional,
	NTFY_URL: optional,
	KNATIVE_FIBONACCI_URL: optional,
	CROWDSEC_LAPI_URL: optional,
	FARO_ENABLED: optional,
	PROMETHEUS_URL: optional
});
