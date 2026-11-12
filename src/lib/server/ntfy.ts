import { createHash } from 'node:crypto';
import { config } from './config.js';
import { upstream } from './http.js';

const TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The user's own topic, derived on the server from the BetterAuth user id: an
 * unguessable UUID only that user's session ever carries. The same user always
 * gets the same topic, and nothing in a request chooses it.
 */
export function topicFor(userId: string): string {
	return `${config.ntfy.topicPrefix}-${config.environment}-${createHash('sha256').update(userId).digest('hex').slice(0, 24)}`;
}

/** The app publishes only under its own prefix, whatever a stored row says. */
export function isOwnTopic(topic: string): boolean {
	return TOPIC.test(topic) && topic.startsWith(`${config.ntfy.topicPrefix}-`);
}

export async function publish(topic: string, title: string, message: string): Promise<void> {
	if (!isOwnTopic(topic)) throw new Error('topic is outside the app prefix');
	const auth: Record<string, string> =
		config.ntfy.user && config.ntfy.password ? { Authorization: `Basic ${Buffer.from(`${config.ntfy.user}:${config.ntfy.password}`).toString('base64')}` } : {};
	const resp = await upstream(`${config.ntfy.url}/${topic}`, { method: 'POST', headers: { Title: title, Tags: 'rocket', ...auth }, body: message });
	if (!resp.ok) throw new Error(`ntfy answered ${resp.status}`);
}
