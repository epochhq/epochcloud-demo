import { startTracing } from '#lib/server/otel.js';

// SvelteKit loads this module before any application code, so the OTLP exporter
// is registered before the first request is served. Combined with
// tracing.server, every request the app handles emits a span -
// including the kubelet and uptime probes, which is what keeps the trace
// pipeline fed when nobody is browsing the app.
startTracing();
