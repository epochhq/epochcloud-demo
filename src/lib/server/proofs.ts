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
		healthy: { min: 1 }
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
		id: 'mtls-traefik',
		group: 'linkerd',
		title: 'Requests from Traefik over mTLS in the last 10 minutes',
		query: 'sum(increase(request_total{NS,direction="inbound",tls="true",client_id=~"traefik\\\\.traefik\\\\..*"}[10m]))',
		unit: 'requests',
		healthy: { min: 1 }
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
	series?: Array<{ label: string; value: number }>;
	state: 'ok' | 'failed' | 'info';
}

export function judge(proof: Proof, value: number | null): ProofResult['state'] {
	if (!proof.healthy) return 'info';
	if (value === null || Number.isNaN(value)) return 'failed';
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
				const samples = await query(proof.query.replaceAll('NS', ns));
				if (proof.by) {
					const series = samples.map((s) => ({
						label:
							proof.by === 'client_id'
								? `${identity(s.labels.client_id ?? '')} (${s.labels.tls === 'true' ? 'mTLS' : 'plaintext'})`
								: (s.labels[proof.by!] ?? '?'),
						value: Math.round(s.value)
					}));
					return { ...base, value: series.reduce((sum, s) => sum + s.value, 0), series, state: judge(proof, series.length ? 1 : null) };
				}
				const value = samples[0] ? samples[0].value : null;
				return { ...base, value, state: judge(proof, value) };
			} catch {
				return { ...base, value: null, state: 'failed' };
			}
		})
	);
}
