import type { RequestHandler } from './$types';
import { createItem, listItems } from '#lib/server/cnpg.js';
import { guard } from '#lib/server/guard.js';
import { field, json } from '#lib/server/http.js';

const MAX_TEXT = 200;

export const GET: RequestHandler = async ({ request }) => {
	const auth = await guard(request);
	if ('refusal' in auth) return auth.refusal;
	try {
		return json({ success: true, items: await listItems() });
	} catch {
		return json({ success: false, error: 'the database did not answer' }, 502);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const text = field(await request.formData(), 'text').trim();
	if (!text || text.length > MAX_TEXT) return json({ success: false, error: `text is 1 to ${MAX_TEXT} characters` }, 400);
	try {
		return json({ success: true, item: await createItem(text) });
	} catch {
		return json({ success: false, error: 'the database did not accept the item' }, 502);
	}
};
