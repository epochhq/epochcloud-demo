import type { RequestHandler } from './$types';
import { sendEmail } from '#lib/server/smtp.js';
import { config } from '#lib/server/config.js';

async function deliverEmail(email: string): Promise<Response> {
	if (!config.smtp.enabled) {
		return Response.json(
			{
				error: 'SMTP not configured (SMTP_HOST not set)',
				timestamp: new Date().toISOString()
			},
			{ status: 503 }
		);
	}

	try {
		await sendEmail(email);
		return Response.json({
			success: true,
			message: `Email sent to ${email}`,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		return Response.json(
			{
				success: false,
				error: String(err),
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const email = url.searchParams.get('email');
	if (!email) {
		return Response.json({ error: 'Missing email parameter', timestamp: new Date().toISOString() }, { status: 400 });
	}
	return deliverEmail(email);
};

export const POST: RequestHandler = async ({ request }) => {
	const email = (await request.formData()).get('email');
	if (typeof email !== 'string' || !email) {
		return Response.json({ error: 'Missing email field', timestamp: new Date().toISOString() }, { status: 400 });
	}
	return deliverEmail(email);
};
