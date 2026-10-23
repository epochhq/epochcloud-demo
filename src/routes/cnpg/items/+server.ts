import type { RequestHandler } from './$types';
import { listItems, createItem, deleteItem } from '$lib/server/cnpg.js';

export const GET: RequestHandler = async () => {
	try {
		const items = await listItems();
		return new Response(JSON.stringify({ success: true, items, timestamp: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return new Response(JSON.stringify({ success: false, error: String(err), timestamp: new Date().toISOString() }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as { text?: string };
		const text = (body.text ?? '').trim();
		if (!text) {
			return new Response(JSON.stringify({ success: false, error: 'text is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}
		const item = await createItem(text);
		return new Response(JSON.stringify({ success: true, item, timestamp: new Date().toISOString() }), { headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return new Response(JSON.stringify({ success: false, error: String(err), timestamp: new Date().toISOString() }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const DELETE: RequestHandler = async ({ url }) => {
	try {
		const idStr = url.searchParams.get('id');
		const id = Number(idStr);
		if (!Number.isFinite(id) || id <= 0) {
			return new Response(JSON.stringify({ success: false, error: 'id query param required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		const deleted = await deleteItem(id);
		return new Response(JSON.stringify({ success: true, deleted, id, timestamp: new Date().toISOString() }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		return new Response(JSON.stringify({ success: false, error: String(err), timestamp: new Date().toISOString() }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
