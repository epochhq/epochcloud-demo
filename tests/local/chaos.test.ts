import { afterEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
vi.mock('#lib/server/config.js', () => ({ config: { chaos: { intervalHours: 4 } } }));

import { judgeChaos, readChaos, type ChaosResult } from '../../src/lib/server/chaos.js';
import { NotRunning } from '../../src/lib/server/snapshot.js';

afterEach(() => vi.unstubAllGlobals());

const NOW = 1_800_000_000_000;
const pass: ChaosResult = {
	verdict: 'Pass',
	probeSuccessPercentage: 100,
	injectedAt: NOW / 1000 - 3600,
	endedAt: NOW / 1000 - 3500,
	replacementPods: 1,
	errorShare: 0.001
};

// Litmus reports its own verdict; the check must not take it alone. Each way
// the experiment can be hollow must fail it, and "nothing to judge" must read
// as not running, never as pass or fail.

it('passes a Pass verdict backed by a replacement pod, full probe success and a low error share', () => {
	expect(judgeChaos(pass, NOW)).toMatchObject({ verdict: 'Pass', probe_success_percentage: 100, replacement_pods: 1, ended_ago_minutes: 58 });
});

it('is not running with no result, while awaited, or after twice the schedule', () => {
	expect(() => judgeChaos(null, NOW)).toThrow(NotRunning);
	expect(() => judgeChaos({ ...pass, verdict: 'Awaited' }, NOW)).toThrow(NotRunning);
	expect(() => judgeChaos({ ...pass, endedAt: NOW / 1000 - 9 * 3600 }, NOW)).toThrow(NotRunning);
	expect(() => judgeChaos({ ...pass, endedAt: NOW / 1000 - 7 * 3600 }, NOW)).not.toThrow();
});

it('fails a Fail verdict', () => {
	expect(() => judgeChaos({ ...pass, verdict: 'Fail' }, NOW)).toThrow('reports the experiment as Fail');
});

it('fails a probe success below 100%, even on a Pass verdict', () => {
	expect(() => judgeChaos({ ...pass, probeSuccessPercentage: 80 }, NOW)).toThrow('80%');
});

it('fails an injection with no replacement pod: the kill is not taken on Litmus word', () => {
	expect(() => judgeChaos({ ...pass, replacementPods: 0 }, NOW)).toThrow('no replacement pod');
});

it('fails an error share over its limit, and does not fail when the app had no traffic to count', () => {
	expect(() => judgeChaos({ ...pass, errorShare: 0.2 }, NOW)).toThrow('too many requests');
	expect(judgeChaos({ ...pass, errorShare: null }, NOW)).toMatchObject({ error_share: null });
});

/** A Prometheus holding the chaos exporter's series, answering each query by what it asks. */
function exporter(series: { verdict?: string; injected?: string; ended?: string; probe?: string; replacements?: string; errors?: string; requests?: string }) {
	const queries: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		const promql = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		queries.push(promql);
		const value = (v: string | undefined, metric: Record<string, string> = {}) => ({
			status: 'success',
			data: { result: v === undefined ? [] : [{ metric, value: [0, v] }] }
		});
		if (promql.startsWith('litmuschaos_experiment_verdict'))
			return Response.json(value(series.verdict === undefined ? undefined : '1', { chaosresult_verdict: series.verdict ?? '' }));
		if (promql.includes('chaos_injected_time')) return Response.json(value(series.injected));
		if (promql.includes('experiment_end_time')) return Response.json(value(series.ended));
		if (promql.includes('probe_success_percentage')) return Response.json(value(series.probe));
		if (promql.includes('kube_pod_created')) return Response.json(value(series.replacements));
		return Response.json(value(promql.includes('status=~"5.."') ? series.errors : series.requests));
	});
	return queries;
}

it('reads the result from the exporter, limited to this namespace at every query', async () => {
	const queries = exporter({ verdict: 'Pass', injected: '1000', ended: '1030', probe: '100', replacements: '1', errors: '1', requests: '100' });
	const result = await readChaos('epochcloud-demo-dev');
	expect(result).toEqual({ verdict: 'Pass', probeSuccessPercentage: 100, injectedAt: 1000, endedAt: 1030, replacementPods: 1, errorShare: 0.01 });
	expect(queries).toHaveLength(7);
	for (const promql of queries) {
		expect(promql, promql).toMatch(/chaosresult_namespace="epochcloud-demo-dev"|namespace="epochcloud-demo-dev"/);
		expect(promql, promql).not.toContain('{}');
	}
	// The replacement pods are counted from the injection on, among the app's own pods.
	expect(queries.find((q) => q.includes('kube_pod_created'))).toContain('> 1000');
	// The error share is read over the window of the experiment, one minute wider.
	expect(queries.find((q) => q.includes('status=~"5.."'))).toContain('[90s] @ 1030');
});

it('has no result when the exporter holds no series for this namespace, or no times', async () => {
	exporter({});
	expect(await readChaos('epochcloud-demo-dev')).toBeNull();
	exporter({ verdict: 'Pass' });
	expect(await readChaos('epochcloud-demo-dev')).toBeNull();
});

it('refuses a namespace that could end the PromQL quote', async () => {
	exporter({});
	await expect(readChaos('x"} or vector(1) #')).rejects.toThrow('invalid namespace');
});
