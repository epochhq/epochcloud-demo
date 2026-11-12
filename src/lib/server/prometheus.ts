import { upstream } from './http.js';
import * as env from '$app/env/private';

export interface Sample {
	labels: Record<string, string>;
	value: number;
}

/** True when a Prometheus address is configured. */
export const prometheusEnabled = (): boolean => !!env.PROMETHEUS_URL;

const QUERY_TIMEOUT_MS = 4_000;

/** One instant query; throws unless Prometheus answers status "success". */
export async function query(promql: string): Promise<Sample[]> {
	if (!env.PROMETHEUS_URL) throw new Error('PROMETHEUS_URL not set');
	const resp = await upstream(`${env.PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promql)}`, {}, QUERY_TIMEOUT_MS);
	if (!resp.ok) throw new Error(`Prometheus answered ${resp.status}`);
	const body = (await resp.json()) as { status?: string; data?: { result?: Array<{ metric: Record<string, string>; value: [number, string] }> } };
	if (body.status !== 'success') throw new Error('Prometheus query did not succeed');
	return (body.data?.result ?? []).map((r) => ({ labels: r.metric, value: parseFloat(r.value[1]) }));
}

/** A PromQL label value is quoted text; refuse anything that could end the quote. */
export function selector(namespace: string): string {
	if (!/^[a-z0-9-]+$/.test(namespace)) throw new Error('invalid namespace');
	return `namespace="${namespace}"`;
}
