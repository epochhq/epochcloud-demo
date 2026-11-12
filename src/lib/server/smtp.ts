import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config.js';
import { log } from './logger.js';
import { emailsSentTotal, emailErrors } from './metrics.js';
import { MAIL_DEADLINE_MS, UPSTREAM_TIMEOUT_MS } from '../limits.js';
import { withDeadline } from './http.js';

let transporter: Transporter | null = null;

export function initSmtp(): void {
	if (!config.smtp.enabled) {
		log('info', 'SMTP disabled (SMTP_HOST not set)');
		return;
	}

	transporter = nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: false, // STARTTLS
		// Nodemailer's own deadlines: a stalled relay ends the request instead
		// of holding it past the server's idle timeout.
		connectionTimeout: UPSTREAM_TIMEOUT_MS,
		greetingTimeout: UPSTREAM_TIMEOUT_MS,
		socketTimeout: UPSTREAM_TIMEOUT_MS
	});

	log('info', 'SMTP configured', { host: config.smtp.host, port: config.smtp.port });
}

/** Connect to the relay and complete the SMTP handshake: proves the relay is reachable and accepting. */
export async function verifySmtp(): Promise<void> {
	if (!transporter) throw new Error('SMTP not configured');
	await transporter.verify();
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
		await withDeadline(
			transporter.sendMail({
				from: config.smtp.from,
				to,
				subject: 'Hello from EpochCloud SvelteKit!',
				text: body
			}),
			MAIL_DEADLINE_MS,
			'the mail relay'
		);
		emailsSentTotal.inc();
		log('info', 'Email sent');
	} catch (err) {
		emailErrors.inc();
		log('error', 'Email send failed', { error: String(err) });
		throw err;
	}
}
