import { beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('#lib/server/config.js', () => ({ config: { defectdojo: { url: 'http://dojo.test', token: 't', product: 'epochcloud-demo', enabled: true } } }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));

import { CACHE_TTL_MS, getDefectDojoSummary, resetDefectDojoCache } from '../../src/lib/server/defectdojo.js';

const PER_SEVERITY: Record<string, number> = { Critical: 2, High: 31, Medium: 67, Low: 5, Info: 1 };

function dojo(options: { failOn?: string; productExists?: boolean } = {}) {
	return vi.fn(async (input: string | URL | Request) => {
		const url = typeof input === 'string' ? input : input instanceof globalThis.URL ? input.href : input.url;
		if (options.failOn && url.includes(options.failOn)) return new Response('boom', { status: 502 });
		if (url.includes('/products/'))
			return Response.json({ results: options.productExists === false ? [{ id: 9, name: 'someone-elses-product' }] : [{ id: 7, name: 'epochcloud-demo' }] });
		const severity = /severity=(\w+)/.exec(url)?.[1];
		return Response.json({ count: severity ? PER_SEVERITY[severity] : 106, results: [] });
	});
}

beforeEach(() => {
	resetDefectDojoCache();
	vi.unstubAllGlobals();
});

it('counts only the demo product, each severity with a one-row query', async () => {
	const fetchMock = dojo();
	vi.stubGlobal('fetch', fetchMock);
	const summary = await getDefectDojoSummary(0);
	expect(summary).toEqual({ product: 'epochcloud-demo', findings: { total: 106, by_severity: PER_SEVERITY } });
	const findingCalls = fetchMock.mock.calls.map(([url]) => (typeof url === 'string' ? url : '')).filter((url) => url.includes('/findings/'));
	expect(findingCalls.length).toBe(6);
	for (const url of findingCalls) {
		expect(url).toContain('test__engagement__product=7');
		expect(url).toContain('limit=1');
	}
});

it('discloses nothing when the demo product is missing, even if other products exist', async () => {
	vi.stubGlobal('fetch', dojo({ productExists: false }));
	await expect(getDefectDojoSummary(0)).rejects.toThrow('the demo product does not exist');
});

it('is not connected when any upstream call fails: no false green', async () => {
	vi.stubGlobal('fetch', dojo({ failOn: 'severity=High' }));
	await expect(getDefectDojoSummary(0)).rejects.toThrow('DefectDojo answered 502');
});

it('serves a good summary from the cache for the TTL and never caches a failure', async () => {
	const fetchMock = dojo();
	vi.stubGlobal('fetch', fetchMock);
	await getDefectDojoSummary(Date.now());
	const calls = fetchMock.mock.calls.length;
	await getDefectDojoSummary(Date.now() + CACHE_TTL_MS - 1);
	expect(fetchMock.mock.calls.length).toBe(calls);
	await getDefectDojoSummary(Date.now() + CACHE_TTL_MS + 1);
	expect(fetchMock.mock.calls.length).toBe(calls * 2);

	resetDefectDojoCache();
	vi.stubGlobal('fetch', dojo({ failOn: '/products/' }));
	await expect(getDefectDojoSummary(0)).rejects.toThrow();
	vi.stubGlobal('fetch', dojo());
	await expect(getDefectDojoSummary(0)).resolves.toMatchObject({ product: 'epochcloud-demo' });
});
