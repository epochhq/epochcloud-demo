import type { RequestHandler } from './$types';
import client from 'prom-client';
import { env } from '$env/dynamic/private';
import {
	registry,
	httpRequestsTotal,
	activeRequests,
	httpRequestDuration,
	errorsTotal
} from '$lib/server/metrics.js';
import os from 'node:os';

// Demo counter - users can increment this to see Prometheus metrics in action
const demoCounter = new client.Counter({
	name: 'epochcloud_demo_counter_total',
	help: 'Demo counter incremented by users from the dashboard',
	registers: [registry]
});

const PROMETHEUS_URL = env.PROMETHEUS_URL;
const hostname = os.hostname();

/** Query Prometheus for a single instant value */
async function queryPrometheus(promql: string): Promise<number> {
	if (!PROMETHEUS_URL) return NaN;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3000);
	try {
		const resp = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {
			signal: controller.signal
		});
		if (!resp.ok) return NaN;
		const data = await resp.json();
		const value = data?.data?.result?.[0]?.value?.[1];
		return value !== undefined ? parseFloat(value) : NaN;
	} catch {
		return NaN;
	} finally {
		clearTimeout(timer);
	}
}

/** Query Prometheus for multiple results (e.g., by label) */
async function queryPrometheusMulti(
	promql: string
): Promise<Array<{ labels: Record<string, string>; value: number }>> {
	if (!PROMETHEUS_URL) return [];
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3000);
	try {
		const resp = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {
			signal: controller.signal
		});
		if (!resp.ok) return [];
		const data = await resp.json();
		return (data?.data?.result ?? []).map(
			(r: { metric: Record<string, string>; value: [number, string] }) => ({
				labels: r.metric,
				value: parseFloat(r.value[1])
			})
		);
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action') || 'status';
	const burst = parseInt(url.searchParams.get('burst') || '1', 10);

	if (action === 'increment') {
		const count = Math.min(Math.max(burst, 1), 100);
		demoCounter.inc(count);
	}

	// Demo counter: always local (immediate feedback for interactive demo)
	const demoCount = (await demoCounter.get()).values[0]?.value ?? 0;

	// Active requests: always local (point-in-time gauge only meaningful in real-time)
	const active = (await activeRequests.get()).values[0]?.value ?? 0;

	// HTTP total: try Prometheus for aggregated cross-pod view, fall back to local
	let httpTotal: number;
	let source: 'prometheus' | 'local';

	try {
		const h = await queryPrometheus('sum(epochcloud_http_requests_total)');
		if (!isNaN(h)) {
			httpTotal = Math.round(h);
			source = 'prometheus';
		} else {
			throw new Error('NaN result');
		}
	} catch {
		httpTotal = (await httpRequestsTotal.get()).values.reduce((sum, v) => sum + v.value, 0);
		source = 'local';
	}

	// Status code breakdown from Prometheus or local
	let statusBreakdown: Record<string, number> = {};
	if (source === 'prometheus') {
		const results = await queryPrometheusMulti('sum by (status) (epochcloud_http_requests_total)');
		for (const r of results) {
			const code = r.labels.status || 'unknown';
			statusBreakdown[code] = Math.round(r.value);
		}
	} else {
		const vals = (await httpRequestsTotal.get()).values;
		for (const v of vals) {
			const code = String(v.labels?.status ?? 'unknown');
			statusBreakdown[code] = (statusBreakdown[code] || 0) + v.value;
		}
	}

	// Duration percentiles from local histogram
	const durationValues = (await httpRequestDuration.get()).values;
	let p50 = 0,
		p95 = 0,
		p99 = 0;
	const buckets = durationValues.filter((v) => v.metricName?.endsWith('_bucket'));
	const totalCount = durationValues.find((v) => v.metricName?.endsWith('_count'))?.value ?? 0;
	if (totalCount > 0 && buckets.length > 0) {
		const sorted = buckets.sort((a, b) => {
			const aLabels = a.labels as Record<string, string | number>;
			const bLabels = b.labels as Record<string, string | number>;
			return (Number(aLabels.le) || 0) - (Number(bLabels.le) || 0);
		});
		const findPercentile = (p: number) => {
			const target = totalCount * p;
			for (const b of sorted) {
				const labels = b.labels as Record<string, string | number>;
				if (b.value >= target) return Number(labels.le) || 0;
			}
			const last = sorted[sorted.length - 1];
			if (last) {
				const labels = last.labels as Record<string, string | number>;
				return Number(labels.le) || 0;
			}
			return 0;
		};
		p50 = findPercentile(0.5);
		p95 = findPercentile(0.95);
		p99 = findPercentile(0.99);
	}

	// Error count
	const errorValues = (await errorsTotal.get()).values;
	const totalErrors = errorValues.reduce((sum, v) => sum + v.value, 0);

	return new Response(
		JSON.stringify({
			success: true,
			demo_counter: demoCount,
			http_requests_total: Math.round(httpTotal),
			active_requests: active,
			source,
			pod: hostname,
			timestamp: new Date().toISOString(),
			status_breakdown: statusBreakdown,
			latency: { p50, p95, p99 },
			errors: totalErrors,
			request_count: totalCount
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
};
