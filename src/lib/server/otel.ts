import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

// SvelteKit 3 initializes runtime environment variables before loading
// instrumentation.server.ts. Read the exporter endpoint directly here so
// tracing starts before application imports, without initializing unrelated
// service configuration or resolving mounted secret files in this entrypoint.
//
// This is the only place the endpoint is parsed; config.otelEndpoint re-exports
// it so the value an operator sees is the value the exporter is wired to.
export const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '';

let sdk: NodeSDK | undefined;

/**
 * Starts OTLP span export, and stops the export queue on server shutdown so the
 * in-flight batch survives a pod rotation.
 *
 * A no-op when no endpoint is set, which keeps local runs off the exporter's
 * retry loop. Service name and resource attributes are not passed here:
 * NodeSDK reads OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES from the
 * environment itself, and the deployment manifests already set both.
 *
 * The endpoint must carry an http:// or https:// scheme. The OTLP gRPC exporter
 * picks insecure credentials only for http://, and defaults a scheme-less value
 * to https://, so a bare host:port silently turns every export into a failed
 * TLS handshake.
 */
export function startTracing(): void {
	if (sdk || otelEndpoint === '') return;

	const started = new NodeSDK({
		traceExporter: new OTLPTraceExporter({ url: otelEndpoint })
	});
	started.start();
	sdk = started;

	process.on('sveltekit:shutdown', async () => {
		await started.shutdown();
	});
}
