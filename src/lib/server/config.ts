import * as env from '$app/env/private';
import { otelEndpoint } from './otel.js';
import { readSecret } from './secrets.js';

// Secret-backed values (sourced from Kubernetes Secrets by the chart) resolve
// once at module load via readSecret: the file named by `<NAME>_FILE` wins,
// the plain `<NAME>` env var is the fallback. Non-secret settings read env
// directly. Values that gate an `enabled` getter are hoisted so the getters
// share the same resolution.
const rabbitmqHost = readSecret('RABBITMQ_HOST') || '';
const valkeyHost = readSecret('VALKEY_HOST') || '';
const databaseUrl = readSecret('DATABASE_URL') || '';

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
	// Set from the downward API; the resolver falls back to the pod's DNS
	// search domain (see namespace.ts).
	podNamespace: env.POD_NAMESPACE || '',
	startedAt: new Date().toISOString(),

	// Consumer mode
	consumerMode: env.CONSUMER_MODE === 'true',

	// OpenTelemetry - the endpoint the span exporter is wired to, parsed in
	// otel.ts. Empty means tracing is off for this process.
	otelEndpoint,

	// RabbitMQ
	rabbitmq: {
		host: rabbitmqHost,
		port: parseInt(readSecret('RABBITMQ_PORT') || '5672'),
		username: readSecret('RABBITMQ_USERNAME') || '',
		password: readSecret('RABBITMQ_PASSWORD') || '',
		vhost: readSecret('RABBITMQ_VHOST') || '/',
		queue: env.RABBITMQ_QUEUE || 'epochcloud-demo',
		get enabled() {
			return !!rabbitmqHost;
		}
	},

	// Valkey
	valkey: {
		host: valkeyHost,
		port: parseInt(readSecret('VALKEY_PORT') || '6379'),
		password: readSecret('VALKEY_PASSWORD') || '',
		database: parseInt(readSecret('VALKEY_DATABASE') || '0'),
		get enabled() {
			return !!valkeyHost;
		}
	},

	// CNPG (CloudNative-PG / Postgres)
	// DATABASE_URL is the CNPG-generated `fqdn-uri` from the
	// `<cluster>-app` Secret (see kubernetes/apps/epochcloud-demo/base/
	// templates/cnpg-cluster.yaml). Includes user/pass/host/db/sslmode.
	cnpg: {
		url: databaseUrl,
		get enabled() {
			return !!databaseUrl;
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
		from: env.SMTP_FROM || '',
		get enabled() {
			return !!(env.SMTP_HOST && env.SMTP_FROM);
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
		user: readSecret('NTFY_USER') || '',
		password: readSecret('NTFY_PASSWORD') || '',
		// Every topic the app publishes to starts with this prefix. A per-app
		// ntfy user is granted write access to exactly `<prefix>-*`.
		topicPrefix: env.NTFY_TOPIC_PREFIX || 'epochcloud-demo',
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

	// The public address this environment is served at (https://<host>, no path).
	// The Linkerd check sends its own request to it; unset skips that request.
	entrypointUrl: env.ENTRYPOINT_URL || '',

	// The vulnerability attestation of the running image. The chart gives the
	// app its own image reference (with the digest it runs), the pull secret
	// mounted as a file, and the platform's trust anchor: the TUF mirror and the
	// root.json it was bootstrapped with. Unset skips the check.
	attestation: {
		imageRef: env.IMAGE_REF || '',
		authFile: env.REGISTRY_AUTH_FILE || '',
		tufMirrorUrl: env.SIGSTORE_TUF_MIRROR_URL || '',
		tufRootFile: env.SIGSTORE_TUF_ROOT_FILE || '',
		cacheDir: env.SIGSTORE_CACHE_DIR || '/tmp/sigstore',
		maxAgeDays: parseInt(env.ATTESTATION_MAX_AGE_DAYS || '30'),
		get enabled() {
			return !!(env.IMAGE_REF && env.REGISTRY_AUTH_FILE && env.SIGSTORE_TUF_MIRROR_URL && env.SIGSTORE_TUF_ROOT_FILE);
		}
	},

	// The tenant chaos experiment the chart ships and how often it is re-armed.
	chaos: {
		engine: env.CHAOS_ENGINE || '',
		intervalHours: parseFloat(env.CHAOS_INTERVAL_HOURS || '4'),
		get enabled() {
			return !!env.CHAOS_ENGINE;
		}
	},

	// Grafana Faro frontend observability
	faro: {
		// Where the collector accepts browser telemetry; unset disables the relay.
		receiverUrl: env.FARO_RECEIVER_URL || '',
		get enabled() {
			return env.FARO_ENABLED === 'true';
		}
	}
};
