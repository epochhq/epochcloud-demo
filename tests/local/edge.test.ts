import { afterEach, expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
vi.mock('#lib/server/config.js', () => ({ config: { entrypointUrl: 'https://demo-dev.example.test' } }));

import { judgeEdge, probeEdge, readRefusals, type EdgeProbe } from '../../src/lib/server/edge.js';

afterEach(() => vi.unstubAllGlobals());

const served: EdgeProbe = { canaryStatus: 403, remediation: 'ban', controlStatus: 200 };

// The probe is the whole claim: the CrowdSec layer refuses the canary and
// serves the control. Every other outcome must fail it, with no false green.

it('passes only when the canary is refused with the CrowdSec header and the control is served', () => {
	expect(() => judgeEdge(served)).not.toThrow();
});

it('fails a canary that is served: the inspection engine did not evaluate the host, and its outage fails open', () => {
	expect(() => judgeEdge({ ...served, canaryStatus: 200, remediation: null })).toThrow('the canary was served');
});

it('fails a canary refused by something other than the bouncer', () => {
	expect(() => judgeEdge({ ...served, remediation: null })).toThrow('without the CrowdSec remediation header');
	expect(() => judgeEdge({ ...served, canaryStatus: 429, remediation: null })).toThrow('without the CrowdSec remediation header');
	expect(() => judgeEdge({ ...served, canaryStatus: 502, remediation: null })).toThrow('without the CrowdSec remediation header');
});

it('fails when normal traffic is not served: the control rules out a broken route', () => {
	expect(() => judgeEdge({ ...served, controlStatus: 403 })).toThrow('normal traffic is not served');
	expect(() => judgeEdge({ ...served, controlStatus: 502 })).toThrow('normal traffic is not served');
});

it('sends the canary and the control to the app health path of its own address, never as a visitor', async () => {
	const seen: Array<{ url: string; headers: Record<string, string> }> = [];
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		const headers = Object.fromEntries(new globalThis.Headers(init.headers).entries());
		seen.push({ url, headers });
		return headers['x-epochcloud-edge-canary'] === 'refuse-me'
			? new Response(null, { status: 403, headers: { 'X-Crowdsec-Remediation': 'ban' } })
			: new Response('ok', { status: 200 });
	});
	const probe = await probeEdge('https://demo-dev.example.test');
	expect(probe).toEqual(served);
	expect(seen).toHaveLength(2);
	expect(seen.filter((request) => 'x-epochcloud-edge-canary' in request.headers)).toHaveLength(1);
	for (const request of seen) {
		expect(request.url).toBe('https://demo-dev.example.test/health');
		// The visitor's address header is Cloudflare's to set; a pod sets none.
		expect(request.headers).not.toHaveProperty('cf-connecting-ip');
		expect(request.headers).not.toHaveProperty('x-forwarded-for');
	}
});

function prometheus(answers: Record<string, string | null>) {
	const queries: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		const promql = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		queries.push(promql);
		const key = promql.startsWith('sum(') ? 'count' : 'last';
		const value = answers[key];
		return Response.json({ status: 'success', data: { result: value === null || value === undefined ? [] : [{ metric: {}, value: [0, value] }] } });
	});
	return queries;
}

it("reads this host's refusals, limited to this namespace and host", async () => {
	const queries = prometheus({ count: '288.4', last: '1000' });
	const refusals = await readRefusals('epochcloud-demo-dev', 'https://demo-dev.example.test', 1_000_000 + 90_000);
	expect(refusals).toEqual({ total24h: 288, lastAgoSeconds: 90 + 0 });
	expect(queries).toHaveLength(2);
	for (const promql of queries) expect(promql).toContain('edge_refused_requests_total{namespace="epochcloud-demo-dev",host="demo-dev.example.test"}');
});

it('reads no refusals as zero and no time, not as a failure', async () => {
	prometheus({ count: null, last: null });
	expect(await readRefusals('epochcloud-demo-dev', 'https://demo-dev.example.test')).toEqual({ total24h: 0, lastAgoSeconds: null });
});

it('refuses a namespace or a host that could end the PromQL quote', async () => {
	prometheus({ count: '1', last: '1' });
	await expect(readRefusals('x"} or vector(1) #', 'https://demo-dev.example.test')).rejects.toThrow('invalid namespace');
	await expect(readRefusals('epochcloud-demo-dev', 'https://x%22%7D.example.test')).rejects.toThrow();
});
