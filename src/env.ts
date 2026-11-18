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
	RYBBIT_SITE_ID: optional,
	RYBBIT_HOST: optional,
	SMTP_HOST: optional,
	SMTP_PORT: optional,
	SMTP_FROM: optional,
	BETTERAUTH_URL: optional,
	GOFEATUREFLAG_URL: optional,
	NTFY_URL: optional,
	NTFY_TOPIC_PREFIX: optional,
	POD_NAMESPACE: optional,
	KNATIVE_FIBONACCI_URL: optional,
	FARO_ENABLED: optional,
	FARO_RECEIVER_URL: optional,
	PROMETHEUS_URL: optional,
	ENTRYPOINT_URL: optional,
	IMAGE_REF: optional,
	REGISTRY_AUTH_FILE: optional,
	SIGSTORE_TUF_MIRROR_URL: optional,
	SIGSTORE_TUF_ROOT_FILE: optional,
	SIGSTORE_CACHE_DIR: optional,
	ATTESTATION_SIGNERS: optional,
	ATTESTATION_MAX_AGE_DAYS: optional,
	CHAOS_ENGINE: optional,
	CHAOS_INTERVAL_HOURS: optional
});
