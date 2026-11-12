import client from 'prom-client';

// Create a custom registry (don't pollute default)
export const registry = new client.Registry();

// App info gauge
export const appInfo = new client.Gauge({
	name: 'epochcloud_app_info',
	help: 'Application build information',
	labelNames: ['version', 'commit', 'build_time', 'environment'] as const,
	registers: [registry]
});

// HTTP metrics
export const httpRequestsTotal = new client.Counter({
	name: 'epochcloud_http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'path', 'status'] as const,
	registers: [registry]
});

export const httpRequestDuration = new client.Histogram({
	name: 'epochcloud_http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'path'] as const,
	buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [registry]
});

export const activeRequests = new client.Gauge({
	name: 'epochcloud_active_requests',
	help: 'Currently in-flight HTTP requests',
	registers: [registry]
});

export const errorsTotal = new client.Counter({
	name: 'epochcloud_errors_total',
	help: 'Total errors by type',
	labelNames: ['type'] as const,
	registers: [registry]
});

// RabbitMQ metrics
export const rabbitMessagesPublished = new client.Counter({
	name: 'epochcloud_rabbitmq_messages_published_total',
	help: 'Total messages published to RabbitMQ',
	registers: [registry]
});

export const rabbitMessagesConsumed = new client.Counter({
	name: 'epochcloud_rabbitmq_messages_consumed_total',
	help: 'Total messages consumed from RabbitMQ',
	registers: [registry]
});

export const rabbitPublishErrors = new client.Counter({
	name: 'epochcloud_rabbitmq_publish_errors_total',
	help: 'Total RabbitMQ publish failures',
	registers: [registry]
});

export const rabbitConnected = new client.Gauge({
	name: 'epochcloud_rabbitmq_connected',
	help: 'RabbitMQ connection status (1=connected, 0=disconnected)',
	registers: [registry]
});

// Valkey metrics
export const valkeyCacheHits = new client.Counter({
	name: 'epochcloud_valkey_cache_hits_total',
	help: 'Total Valkey cache hits',
	registers: [registry]
});

export const valkeyCacheMisses = new client.Counter({
	name: 'epochcloud_valkey_cache_misses_total',
	help: 'Total Valkey cache misses',
	registers: [registry]
});

export const valkeyOperations = new client.Counter({
	name: 'epochcloud_valkey_operations_total',
	help: 'Total Valkey operations',
	labelNames: ['operation'] as const,
	registers: [registry]
});

export const valkeyConnected = new client.Gauge({
	name: 'epochcloud_valkey_connected',
	help: 'Valkey connection status (1=connected, 0=disconnected)',
	registers: [registry]
});

// CNPG metrics
export const cnpgConnected = new client.Gauge({
	name: 'epochcloud_cnpg_connected',
	help: 'CNPG/Postgres connection status (1=connected, 0=disconnected)',
	registers: [registry]
});

export const cnpgOperations = new client.Counter({
	name: 'epochcloud_cnpg_operations_total',
	help: 'Total CNPG/Postgres operations',
	labelNames: ['op'] as const,
	registers: [registry]
});

export const cnpgErrors = new client.Counter({
	name: 'epochcloud_cnpg_errors_total',
	help: 'Total CNPG/Postgres errors',
	labelNames: ['op'] as const,
	registers: [registry]
});

// DefectDojo metrics
export const defectdojoRequests = new client.Counter({
	name: 'epochcloud_defectdojo_api_requests_total',
	help: 'Total DefectDojo API requests',
	labelNames: ['endpoint', 'status'] as const,
	registers: [registry]
});

export const defectdojoConnected = new client.Gauge({
	name: 'epochcloud_defectdojo_connected',
	help: 'DefectDojo connection status (1=connected, 0=disconnected)',
	registers: [registry]
});

// Email metrics
export const emailsSentTotal = new client.Counter({
	name: 'epochcloud_emails_sent_total',
	help: 'Total emails sent successfully',
	registers: [registry]
});

export const emailErrors = new client.Counter({
	name: 'epochcloud_email_errors_total',
	help: 'Total email send failures',
	registers: [registry]
});

// Collect default Node.js metrics (GC, event loop, memory, etc.)
client.collectDefaultMetrics({ register: registry });

// Demo counter - users increment it from the dashboard to watch Prometheus
// scrape it. Defined here so every route reads the same instance.
export const demoCounter = new client.Counter({
	name: 'epochcloud_demo_counter_total',
	help: 'Demo counter incremented by users from the dashboard',
	registers: [registry]
});
