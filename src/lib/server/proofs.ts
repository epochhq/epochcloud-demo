import { query, selector } from './prometheus.js';

// What the Prometheus and Linkerd tabs prove, as data. Each entry is a query
// limited to this app's namespace, with a unit and the range that counts as
// healthy. Adding a proof of another capability is one more entry here, not new
// code: the check evaluates the list and the page renders it.
export interface Proof {
	id: string;
	group: 'prometheus' | 'linkerd';
	title: string;
	/** PromQL; `NS` stands for the namespace matcher. */
	query: string;
	unit: string;
	healthy?: { min?: number; max?: number };
	/** The row counts traffic: no traffic reads "nodata", never "failed". */
	traffic?: boolean;
	/** Split the answer by this label and list each series. */
	by?: string;
}

export const PROOFS: Proof[] = [
	{
		id: 'requests',
		group: 'prometheus',
		title: 'Requests served in the last 10 minutes (kubelet health probes left out)',
		query: 'sum(increase(epochcloud_http_requests_total{NS,path!="/health"}[10m]))',
		unit: 'requests',
		traffic: true
	},
	{
		id: 'error-share',
		group: 'prometheus',
		title: 'Share of requests answered with a 5xx',
		query:
			'sum(rate(epochcloud_http_requests_total{NS,path!="/health",status=~"5.."}[10m])) / sum(rate(epochcloud_http_requests_total{NS,path!="/health"}[10m]))',
		unit: 'ratio',
		healthy: { max: 0.05 }
	},
	{
		id: 'p95',
		group: 'prometheus',
		title: '95th percentile latency of the app routes (health probes and status routes left out)',
		query: 'histogram_quantile(0.95, sum by (le) (rate(epochcloud_http_request_duration_seconds_bucket{NS,path!~"/health|/status/.*"}[10m])))',
		unit: 's',
		healthy: { max: 0.5 }
	},
	{
		id: 'scrape',
		group: 'prometheus',
		title: 'Scrape targets up in this namespace',
		query: 'count(up{NS} == 1)',
		unit: 'targets',
		healthy: { min: 1 }
	},
	{
		id: 'restarts',
		group: 'prometheus',
		title: 'Container restarts in the last 10 minutes',
		query: 'sum(increase(kube_pod_container_status_restarts_total{NS}[10m]))',
		unit: 'restarts',
		healthy: { max: 0 }
	},
	{
		id: 'demo-counter',
		group: 'prometheus',
		title: 'Demo counter, per pod (scraped)',
		query: 'sum by (pod) (epochcloud_demo_counter_total{NS})',
		unit: 'increments',
		by: 'pod'
	},
	{
		// Traefik keeps a series for as long as it runs, so the increase over the
		// window counts the requests that came. A request that creates its series
		// is not in the figure.
		id: 'entrypoint-requests',
		group: 'linkerd',
		title: 'Requests that came through the entrypoint in the last 10 minutes',
		query: 'sum(increase(traefik_service_requests_total{exported_service=~"NSNAME-epochcloud-demo(-canary)?-80@kubernetescrd"}[10m])) or vector(0)',
		unit: 'requests',
		traffic: true
	},
	{
		// Traefik's own proxy counts every request it sends to the app, and labels
		// the series with the destination (dst_namespace, dst_serviceaccount) and
		// whether the connection used mTLS. The server side of the app (the
		// proxies' default-policy series at start-up, the BetterAuth pods on the
		// same port) is not in it. The proxy drops a series that stays idle and
		// recreates it at 1, so a series that exists in the window is the
		// evidence, not an increase.
		id: 'mtls-traefik',
		group: 'linkerd',
		title: 'Traefik request series to the app over mTLS in the last 10 minutes',
		query:
			'count(last_over_time(request_total{namespace="traefik",direction="outbound",dst_namespace="NSNAME",dst_serviceaccount="epochcloud-demo",tls="true"}[10m]))',
		unit: 'series',
		traffic: true
	},
	{
		id: 'plaintext-traefik',
		group: 'linkerd',
		title: 'Traefik request series to the app without mTLS in the last 10 minutes',
		query:
			'count(last_over_time(request_total{namespace="traefik",direction="outbound",dst_namespace="NSNAME",dst_serviceaccount="epochcloud-demo",tls!="true"}[10m])) or vector(0)',
		unit: 'series',
		healthy: { max: 0 }
	},
	{
		id: 'inbound-callers',
		group: 'linkerd',
		title: 'Inbound requests by caller identity and transport',
		query: 'sum by (client_id, tls) (increase(request_total{NS,direction="inbound"}[10m]))',
		unit: 'requests',
		by: 'client_id'
	}
];

export interface ProofResult {
	id: string;
	group: Proof['group'];
	title: string;
	unit: string;
	healthy?: Proof['healthy'];
	value: number | null;
	/** Whether Prometheus answered the query at all; an answer with no data is still an answer. */
	answered: boolean;
	series?: Array<{ label: string; value: number }>;
	/** "nodata": answered, nothing to judge (no traffic yet); "failed": out of range, or the query failed. */
	state: 'ok' | 'failed' | 'info' | 'nodata';
}

export function judge(proof: Proof, value: number | null): ProofResult['state'] {
	if (!proof.healthy && !proof.traffic) return 'info';
	if (value === null || Number.isNaN(value)) return 'nodata';
	if (proof.traffic && value === 0) return 'nodata';
	if (!proof.healthy) return 'ok';
	if (proof.healthy.min !== undefined && value < proof.healthy.min) return 'failed';
	if (proof.healthy.max !== undefined && value > proof.healthy.max) return 'failed';
	return 'ok';
}

const identity = (client: string) => client.replace(/\.serviceaccount\.identity\..*$/, '') || 'no identity';

export async function evaluateProofs(namespace: string, group?: Proof['group']): Promise<ProofResult[]> {
	const ns = selector(namespace);
	return Promise.all(
		PROOFS.filter((proof) => !group || proof.group === group).map(async (proof): Promise<ProofResult> => {
			const base = { id: proof.id, group: proof.group, title: proof.title, unit: proof.unit, healthy: proof.healthy };
			try {
				const samples = await query(proof.query.replaceAll('NSNAME', namespace).replaceAll('NS', ns));
				if (proof.by) {
					const series = samples.map((s) => ({
						label:
							proof.by === 'client_id'
								? `${identity(s.labels.client_id ?? '')} (${s.labels.tls === 'true' ? 'mTLS' : 'plaintext'})`
								: (s.labels[proof.by!] ?? '?'),
						value: Math.round(s.value)
					}));
					return { ...base, value: series.reduce((sum, s) => sum + s.value, 0), answered: true, series, state: judge(proof, series.length ? 1 : null) };
				}
				const value = samples[0] ? samples[0].value : null;
				return { ...base, value, answered: true, state: judge(proof, value) };
			} catch {
				return { ...base, value: null, answered: false, state: 'failed' };
			}
		})
	);
}
