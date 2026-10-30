import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';
import { log } from './logger.js';
import { emailsSentTotal, emailErrors } from './metrics.js';

let transporter: Transporter | null = null;

export function initSmtp(): void {
	if (!config.smtp.enabled) {
		log('info', 'SMTP disabled (SMTP_HOST not set)');
		return;
	}

	transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: false // STARTTLS
	});

	log('info', 'SMTP configured', { host: config.smtp.host, port: config.smtp.port });
}

export async function sendEmail(to: string): Promise<void> {
	if (!transporter) {
		throw new Error('SMTP not configured');
	}

	const body = `Hello from EpochCloud SvelteKit!

This email was sent by the SvelteKit demo app running on the EpochCloud platform.

Server: ${config.hostname}
Version: ${config.version}
Environment: ${config.environment}
Framework: SvelteKit 3
Timestamp: ${new Date().toISOString()}

Pipeline: SvelteKit App → Maddy (SMTP relay) → Resend API → DKIM-signed delivery

---
EpochCloud - Self-hosted Kubernetes platform`;

	try {
		await transporter.sendMail({
			from: config.smtp.from,
			to,
			subject: 'Hello from EpochCloud SvelteKit!',
			text: body
		});
		emailsSentTotal.inc();
		log('info', 'Email sent', { to });
	} catch (err) {
		emailErrors.inc();
		log('error', 'Email send failed', { to, error: String(err) });
		throw err;
	}
}
