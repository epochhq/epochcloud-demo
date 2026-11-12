import { expect, it, vi } from 'vite-plus/test';

vi.mock('$app/env/private', () => ({ PROMETHEUS_URL: 'http://prom.test' }));
vi.mock('#lib/server/config.js', () => ({ config: { podNamespace: '' } }));

import { PROOFS, evaluateProofs, judge } from '../../src/lib/server/proofs.js';
import { namespaceFrom } from '../../src/lib/server/namespace.js';

// The Prometheus and Linkerd tabs show these queries' answers. No proof can be
// written without the namespace matcher, and the three request proofs leave the
// kubelet's health probes out.

it('limits every proof query to the namespace', () => {
	for (const proof of PROOFS) expect(proof.query, proof.id).toMatch(/\{NS|NSNAME/);
});

it('leaves kubelet health probes out of the request, error-share and latency proofs', () => {
	for (const id of ['requests', 'error-share', 'p95']) expect(PROOFS.find((proof) => proof.id === id)?.query, id).toContain('/health');
});

it('substitutes the namespace matcher, and refuses a namespace that could end the quote', async () => {
	const queries: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		queries.push(decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? ''));
		return Response.json({ status: 'success', data: { result: [{ metric: { pod: 'a' }, value: [0, '5'] }] } });
	});
	await evaluateProofs('epochcloud-demo-dev');
	expect(queries.length).toBe(PROOFS.length);
	for (const query of queries) expect(query).toContain('namespace="epochcloud-demo-dev"');
	await expect(evaluateProofs('x"} or vector(1) #')).rejects.toThrow('invalid namespace');
});

it('judges a value against the healthy range, and no data is not healthy', () => {
	const proof = PROOFS.find((p) => p.id === 'error-share')!;
	expect(judge(proof, 0.01)).toBe('ok');
	expect(judge(proof, 0.2)).toBe('failed');
	expect(judge(proof, null)).toBe('nodata');
	expect(judge(proof, Number.NaN)).toBe('nodata');
	expect(
		judge(
			PROOFS.find((p) => p.id === 'demo-counter')!,
			3
		)
	).toBe('info');
});

it('tells a query that answered with no data from one that failed', async () => {
	vi.stubGlobal('fetch', async (url: string) => {
		const q = decodeURIComponent(new globalThis.URL(url).searchParams.get('query') ?? '');
		if (q.includes('kube_pod_container_status_restarts_total')) throw new Error('refused');
		return Response.json({ status: 'success', data: { result: [] } });
	});
	const proofs = await evaluateProofs('epochcloud-demo-dev');
	const restarts = proofs.find((proof) => proof.id === 'restarts')!;
	expect(restarts).toMatchObject({ answered: false, state: 'failed' });
	const requests = proofs.find((proof) => proof.id === 'requests')!;
	expect(requests).toMatchObject({ answered: true, value: null, state: 'nodata' });
	expect(proofs.filter((proof) => proof.answered).length).toBe(PROOFS.length - 1);
});

it('takes the namespace from the environment, else from the pod DNS search path', () => {
	expect(namespaceFrom('given', '')).toBe('given');
	expect(namespaceFrom('', 'nameserver 10.0.0.10\nsearch epochcloud-demo-dev.svc.cluster.local svc.cluster.local cluster.local\n')).toBe('epochcloud-demo-dev');
	expect(namespaceFrom('', 'search example.com\n')).toBe('');
});
