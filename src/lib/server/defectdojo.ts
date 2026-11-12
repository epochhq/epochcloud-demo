import { config } from './config.js';
import { log } from './logger.js';
import { upstream } from './http.js';
import { defectdojoRequests, defectdojoConnected } from './metrics.js';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;

export interface DefectDojoSummary {
	product: string;
	findings: { total: number; by_severity: Record<string, number> };
}

async function get(path: string, endpoint: string): Promise<{ count?: unknown; results?: Array<{ id?: number; name?: string }> }> {
	const resp = await upstream(`${config.defectdojo.url}${path}`, {
		headers: { Authorization: `Token ${config.defectdojo.token}`, 'Content-Type': 'application/json' }
	});
	if (!resp.ok) {
		defectdojoRequests.inc({ endpoint, status: 'error' });
		throw new Error(`DefectDojo answered ${resp.status} for ${endpoint}`);
	}
	defectdojoRequests.inc({ endpoint, status: 'success' });
	return (await resp.json()) as { count?: unknown; results?: Array<{ id?: number; name?: string }> };
}

/** The `count` of a list query. limit=1 keeps the response a few hundred bytes. */
async function count(path: string, endpoint: string): Promise<number> {
	const body = await get(path, endpoint);
	if (typeof body.count !== 'number') throw new Error(`DefectDojo answer for ${endpoint} carries no count`);
	return body.count;
}

// DefectDojo holds every tenant's products. The page shows this app's own
// product only: its id is resolved by exact name, and every count is scoped to it.
async function fetchSummary(): Promise<DefectDojoSummary> {
	const name = config.defectdojo.product;
	const product = (await get(`/api/v2/products/?name=${encodeURIComponent(name)}&limit=5`, 'products')).results?.find((p) => p.name === name);
	if (typeof product?.id !== 'number') throw new Error('the demo product does not exist in DefectDojo');
	const scope = `/api/v2/findings/?active=true&test__engagement__product=${product.id}`;
	const [total, ...perSeverity] = await Promise.all([
		count(`${scope}&limit=1`, 'findings'),
		...SEVERITIES.map((severity) => count(`${scope}&severity=${severity}&limit=1`, `findings-${severity.toLowerCase()}`))
	]);
	return { product: name, findings: { total, by_severity: Object.fromEntries(SEVERITIES.map((severity, i) => [severity, perSeverity[i] ?? 0])) } };
}

/** Connected only when every upstream call succeeded; otherwise it throws. The server's status snapshot is the cache. */
export async function getDefectDojoSummary(): Promise<DefectDojoSummary> {
	try {
		const summary = await fetchSummary();
		defectdojoConnected.set(1);
		return summary;
	} catch (err) {
		defectdojoConnected.set(0);
		throw err;
	}
}

export async function initDefectDojo(): Promise<void> {
	if (!config.defectdojo.enabled) {
		log('info', 'DefectDojo disabled (DEFECTDOJO_URL not set)');
		return;
	}
	try {
		await getDefectDojoSummary();
		log('info', 'DefectDojo connected', { url: config.defectdojo.url });
	} catch (err) {
		log('error', 'DefectDojo init failed', { error: String(err) });
	}
}
