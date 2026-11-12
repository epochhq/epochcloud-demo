import { beforeEach, expect, it, vi } from 'vite-plus/test';

const { config } = vi.hoisted(() => ({ config: { defectdojo: { url: 'http://dojo.test', token: 't', product: 'epochcloud-demo', enabled: true } } }));
vi.mock('#lib/server/config.js', () => ({ config }));
const { log } = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock('#lib/server/logger.js', () => ({ log }));

import { getDefectDojoSummary, initDefectDojo } from '../../src/lib/server/defectdojo.js';

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
	vi.unstubAllGlobals();
});

it('counts only the demo product, each severity with a one-row query', async () => {
	const fetchMock = dojo();
	vi.stubGlobal('fetch', fetchMock);
	const summary = await getDefectDojoSummary();
	expect(summary).toEqual({ product: 'epochcloud-demo', findings: { total: 106, by_severity: PER_SEVERITY } });
	const findingCalls = fetchMock.mock.calls.map(([url]) => (typeof url === 'string' ? url : '')).filter((url) => url.includes('/findings/'));
	expect(findingCalls.length).toBe(6);
	for (const url of findingCalls) {
		expect(url).toContain('test__engagement__product=7');
		expect(url).toMatch(/[?&]limit=1(&|$)/);
	}
});

it('discloses nothing when the demo product is missing, even if other products exist', async () => {
	vi.stubGlobal('fetch', dojo({ productExists: false }));
	await expect(getDefectDojoSummary()).rejects.toThrow('the demo product does not exist');
});

it('is not connected when any upstream call fails: no false green', async () => {
	vi.stubGlobal('fetch', dojo({ failOn: 'severity=High' }));
	await expect(getDefectDojoSummary()).rejects.toThrow('DefectDojo answered 502');
});

it('logs why DefectDojo is not running: the token, when the URL is set', async () => {
	config.defectdojo.enabled = false;
	config.defectdojo.token = '';
	try {
		await initDefectDojo();
		expect(log).toHaveBeenCalledWith('info', 'DefectDojo not running', { reason: 'no DefectDojo token for the app' });
		config.defectdojo.url = '';
		await initDefectDojo();
		expect(log).toHaveBeenCalledWith('info', 'DefectDojo not running', { reason: 'DEFECTDOJO_URL not set' });
	} finally {
		config.defectdojo.enabled = true;
		config.defectdojo.token = 't';
		config.defectdojo.url = 'http://dojo.test';
	}
});
