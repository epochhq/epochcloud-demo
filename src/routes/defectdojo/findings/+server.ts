import type { RequestHandler } from './$types';
import { getDefectDojoStatus } from '#lib/server/defectdojo.js';

export const GET: RequestHandler = async () => {
	const status = await getDefectDojoStatus();

	return new Response(
		JSON.stringify({
			success: status.connected,
			products: status.products,
			product_count: status.product_count,
			findings: status.findings_summary,
			timestamp: new Date().toISOString()
		}),
		{ headers: { 'Content-Type': 'application/json' } }
	);
};
