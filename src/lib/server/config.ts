import { env } from '$env/dynamic/private';

export const config = {
	// Build info - stamped at `vite build` time via the `define` constants in
	// vite.config.ts (version from the VERSION file, commit from git, build
	// timestamp from the build moment). NOT injected via Docker --build-arg:
	// the buildah pipeline passes none, so the old PUBLIC_* env path always
	// read dev / unknown / unknown.
	version: __APP_VERSION__,
	commit: __APP_COMMIT__,
	buildTime: __APP_BUILD_TIME__,

	// Runtime
	environment: env.ENVIRONMENT || 'dev',
	port: parseInt(env.PORT || '3000'),
	hostname: env.HOSTNAME || 'unknown',
	startedAt: new Date().toISOString(),

	// Consumer mode
	consumerMode: env.CONSUMER_MODE === 'true',

	// OpenTelemetry
	otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || 'alloy.alloy.svc.cluster.local:4317',

	// RabbitMQ
	rabbitmq: {
		host: env.RABBITMQ_HOST || '',
		port: parseInt(env.RABBITMQ_PORT || '5672'),
		username: env.RABBITMQ_USERNAME || '',
		password: env.RABBITMQ_PASSWORD || '',
		vhost: env.RABBITMQ_VHOST || '/',
		queue: env.RABBITMQ_QUEUE || 'epochcloud-demo',
		get enabled() {
			return !!env.RABBITMQ_HOST;
		}
	},

	// Valkey
	valkey: {
		host: env.VALKEY_HOST || '',
		port: parseInt(env.VALKEY_PORT || '6379'),
		password: env.VALKEY_PASSWORD || '',
		database: parseInt(env.VALKEY_DATABASE || '0'),
		get enabled() {
			return !!env.VALKEY_HOST;
		}
	},

	// CNPG (CloudNative-PG / Postgres)
	// DATABASE_URL is the CNPG-generated `fqdn-uri` from the
	// `<cluster>-app` Secret (see kubernetes/apps/epochcloud-demo/base/
	// templates/cnpg-cluster.yaml). Includes user/pass/host/db/sslmode.
	cnpg: {
		url: env.DATABASE_URL || '',
		get enabled() {
			return !!env.DATABASE_URL;
		}
	},

	// DefectDojo
	defectdojo: {
		url: env.DEFECTDOJO_URL || '',
		token: env.DEFECTDOJO_TOKEN || '',
		get enabled() {
			return !!(env.DEFECTDOJO_URL && env.DEFECTDOJO_TOKEN);
		}
	},

	// Rybbit analytics
	rybbit: {
		siteId: env.RYBBIT_SITE_ID || '',
		host: env.RYBBIT_HOST || '',
		get enabled() {
			return !!(env.RYBBIT_SITE_ID && env.RYBBIT_HOST);
		}
	},

	// SMTP (Maddy)
	smtp: {
		host: env.SMTP_HOST || '',
		port: parseInt(env.SMTP_PORT || '587'),
		from: env.SMTP_FROM || 'noreply@epoch.engineering',
		get enabled() {
			return !!env.SMTP_HOST;
		}
	},

	// BetterAuth
	betterauth: {
		url: env.BETTERAUTH_URL || '',
		get enabled() {
			return !!env.BETTERAUTH_URL;
		}
	},

	// GO Feature Flag relay proxy
	gofeatureflag: {
		url: env.GOFEATUREFLAG_URL || '',
		get enabled() {
			return !!env.GOFEATUREFLAG_URL;
		}
	},

	// ntfy push notifications
	ntfy: {
		url: env.NTFY_URL || '',
		user: env.NTFY_USER || '',
		password: env.NTFY_PASSWORD || '',
		get enabled() {
			return !!env.NTFY_URL;
		}
	},

	// Knative fibonacci service
	knative: {
		fibonacciUrl: env.KNATIVE_FIBONACCI_URL || '',
		get enabled() {
			return !!env.KNATIVE_FIBONACCI_URL;
		}
	},

	// CrowdSec LAPI
	crowdsec: {
		lapiUrl: env.CROWDSEC_LAPI_URL || '',
		bouncerKey: env.CROWDSEC_BOUNCER_KEY || '',
		get enabled() {
			return !!env.CROWDSEC_LAPI_URL;
		}
	},

	// Grafana Faro frontend observability
	faro: {
		get enabled() {
			return env.FARO_ENABLED === 'true';
		}
	}
};
