import type { RequestHandler } from './$types';
import { deleteItem } from '#lib/server/cnpg.js';
import { guard } from '#lib/server/guard.js';
import { json } from '#lib/server/http.js';

export const POST: RequestHandler = async ({ request }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const id = Number((await request.formData()).get('id'));
	if (!Number.isInteger(id) || id <= 0) return json({ success: false, error: 'id is required' }, 400);
	try {
		return json({ success: true, deleted: await deleteItem(id), id });
	} catch {
		return json({ success: false, error: 'the database did not accept the change' }, 502);
	}
};
