import { config } from './config.js';
import { NotRunning } from './snapshot.js';
import { query, selector } from './prometheus.js';

// The tenant's own chaos experiment, read from the platform's chaos-exporter
// and checked against evidence the fault cannot fake. The chart ships a Litmus
// pod-delete experiment in the dev namespace and an app-side CronJob that
// re-arms it. Litmus reports its own verdict; this check does not trust it
// alone: a replacement pod must really have been created after the injection
// (kube-state-metrics), and the app's own request metrics must show it kept
// serving. The experiment deletes one pod gracefully, so this is a resilience
// proof, not an outage.

/** The pods of the app's own Rollout, not its consumer or its auth service. */
const APP_PODS = 'epochcloud-demo-[0-9a-f]{6,}-[a-z0-9]{5}';
/** A request error share above this during the chaos window fails the check. */
const ERROR_SHARE_LIMIT = 0.05;

export interface ChaosResult {
	verdict: string;
	probeSuccessPercentage: number;
	injectedAt: number;
	endedAt: number;
	replacementPods: number;
	errorShare: number | null;
}

const first = async (promql: string): Promise<number | null> => (await query(promql))[0]?.value ?? null;

/**
 * The newest result of this namespace's experiment as numbers; null when the
 * experiment has produced none. Every query is limited to this namespace
 * (chaosresult_namespace on the exporter's series).
 */
export async function readChaos(namespace: string): Promise<ChaosResult | null> {
	const ns = selector(namespace).replace('namespace=', 'chaosresult_namespace=');
	const verdicts = await query(`litmuschaos_experiment_verdict{${ns}}`);
	if (verdicts.length === 0) return null;
	const newest = verdicts[0]!;
	const [injected, ended, probe] = await Promise.all([
		first(`max(litmuschaos_experiment_chaos_injected_time{${ns}})`),
		first(`max(litmuschaos_experiment_end_time{${ns}})`),
		first(`min(litmuschaos_probe_success_percentage{${ns}})`)
	]);
	if (injected === null || ended === null) return null;
	const own = selector(namespace);
	// The window runs from the injection to the end of the experiment, one
	// minute wider so the scrape that follows is in it.
	const window = `${Math.max(60, Math.round(ended - injected) + 60)}s`;
	const [replacements, errors, requests] = await Promise.all([
		first(`count(kube_pod_created{${own},pod=~"${APP_PODS}"} > ${Math.round(injected)}) or vector(0)`),
		first(`sum(increase(epochcloud_http_requests_total{${own},path!="/health",status=~"5.."}[${window}] @ ${Math.round(ended)}))`),
		first(`sum(increase(epochcloud_http_requests_total{${own},path!="/health"}[${window}] @ ${Math.round(ended)}))`)
	]);
	return {
		verdict: newest.labels.chaosresult_verdict ?? 'unknown',
		probeSuccessPercentage: probe ?? 0,
		injectedAt: injected,
		endedAt: ended,
		replacementPods: replacements ?? 0,
		errorShare: requests && requests > 0 ? (errors ?? 0) / requests : null
	};
}

/**
 * Throws NotRunning while there is nothing to judge (no result, still waiting,
 * or too old to be this schedule's), and an Error for a result that says the
 * resilience was not shown. Returns what the page shows when it was.
 */
export function judgeChaos(result: ChaosResult | null, now = Date.now(), intervalHours = config.chaos.intervalHours): Record<string, unknown> {
	if (!result) throw new NotRunning('No experiment result yet: the first run has not finished');
	if (result.verdict.toLowerCase() === 'awaited') throw new NotRunning('The experiment is still running');
	const ageHours = (now / 1000 - result.endedAt) / 3600;
	if (ageHours > 2 * intervalHours)
		throw new NotRunning(`The last experiment ended ${Math.round(ageHours)} hours ago, longer than twice its ${intervalHours} hour schedule`);
	if (result.verdict.toLowerCase() !== 'pass') throw new Error(`Litmus reports the experiment as ${result.verdict}`);
	if (result.probeSuccessPercentage < 100)
		throw new Error(`the app answered ${Math.round(result.probeSuccessPercentage)}% of the probe requests during the experiment`);
	if (result.replacementPods < 1) throw new Error('Litmus reports an injection but no replacement pod was created');
	if (result.errorShare !== null && result.errorShare > ERROR_SHARE_LIMIT)
		throw new Error('the app answered too many requests with an error during the experiment');
	return {
		verdict: result.verdict,
		probe_success_percentage: Math.round(result.probeSuccessPercentage),
		replacement_pods: result.replacementPods,
		error_share: result.errorShare === null ? null : Math.round(result.errorShare * 1000) / 1000,
		ended_ago_minutes: Math.max(0, Math.round((now / 1000 - result.endedAt) / 60))
	};
}
