import { createHash } from 'node:crypto';
import { config } from './config.js';
import { UPSTREAM_TIMEOUT_MS } from '../limits.js';
import { isTimeout, json, upstream, withDeadline } from './http.js';
import { createLimiter } from './ratelimit.js';
import { sharedBudget } from './valkey.js';

// The page's sign-up, sign-in and sign-out. The browser posts a form to the app
// (the page's CSP allows no other origin), and the app calls its BetterAuth on
// the in-cluster address with the page's origin and the caller's address, then
// hands BetterAuth's cookies back. Answers never say whether an address is
// registered (OWASP Authentication Cheat Sheet).

/** Per client address (IPv6 by /64) and route: room for a few typos, not for a script. Per pod. */
export const addressLimiter = createLimiter({ points: 10, durationSeconds: 60 });
/** Five wrong passwords per account and address in 15 minutes: enough for typos; a guesser there stops, the owner elsewhere does not. Per pod. */
export const failuresByAccountAndAddress = createLimiter({ points: 5, durationSeconds: 15 * 60 });
/** A hundred wrong passwords per account an hour from anywhere: bounds guessing spread over many addresses. Per pod. */
export const failuresByAccount = createLimiter({ points: 100, durationSeconds: 60 * 60 });

// Confirmation mails, counted across pods in Valkey; nothing is sent when they cannot be counted.
export const MAIL_COOLDOWN_SECONDS = 300;
/** One mail per inbox per 5 minutes: a double click or an impatient resend sends one. */
const mailCooldown = sharedBudget('mail-cooldown', 1, MAIL_COOLDOWN_SECONDS);
/** Three per inbox a day: the sign-up mail and two resends cover a lost or late one. */
const mailsPerInbox = sharedBudget('mail-inbox', 3, 24 * 60 * 60);
/** Sixty an hour for the whole demo: far above its sign-ups, 1% of the platform relay's 6,000 an hour. */
const mailsPerHour = sharedBudget('mail-hour', 60, 60 * 60);

export const WRONG = 'The address or the password is wrong.';
export const SENT = 'If the address can be used, a link to confirm it is on its way. Follow it to finish signing in.';

export interface AuthAnswer {
	status: number;
	message: string;
	cookies: string[];
}

/** One call to BetterAuth's API. Throws when it does not answer in time. */
export async function callAuth(path: string, body: Record<string, string>, origin: string, client: string, cookie = ''): Promise<AuthAnswer> {
	const headers: Record<string, string> = { 'content-type': 'application/json', origin, 'x-forwarded-for': client };
	if (cookie) headers.cookie = cookie;
	const resp = await upstream(`${config.betterauth.url}/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
	const data = (await resp.json().catch(() => null)) as { message?: unknown } | null;
	return { status: resp.status, message: typeof data?.message === 'string' ? data.message : '', cookies: resp.headers.getSetCookie() };
}

/** A JSON answer that also sets BetterAuth's cookies on the page's origin. */
export function withCookies(response: Response, cookies: string[]): Response {
	for (const cookie of cookies) response.headers.append('set-cookie', cookie);
	return response;
}

export const unreachable = (err: unknown) =>
	json({ success: false, reason: 'auth-unavailable', timeout: isTimeout(err), error: 'the sign-in service did not answer' }, 503);

/** The mailbox an address delivers to: lower case, without a +tag. */
export function inbox(email: string): string {
	const [local = '', domain = ''] = email.toLowerCase().split('@');
	return `${local.split('+')[0]}@${domain}`;
}

/**
 * Spends one confirmation mail of the inbox's and the hour's budgets, or says
 * truthfully why none can be sent. The key is a digest, so no address is stored.
 */
export async function claimMail(email: string): Promise<Response | null> {
	const key = createHash('sha256').update(inbox(email)).digest('hex').slice(0, 32);
	const refusals: Record<string, string> = {
		cooldown: `a confirmation mail for this address was sent less than ${MAIL_COOLDOWN_SECONDS / 60} minutes ago`,
		inbox: 'this address has had its confirmation mails for today',
		hour: 'the demo has sent all the confirmation mails it sends in an hour; try again later'
	};
	const spendAll = async (): Promise<string> => {
		for (const [name, budget, budgetKey] of [
			['cooldown', mailCooldown, key],
			['inbox', mailsPerInbox, key],
			['hour', mailsPerHour, 'all']
		] as const) {
			const result = await budget.take(budgetKey);
			if (result !== 'ok') return result === 'limited' ? name : 'unavailable';
		}
		return 'ok';
	};
	// One deadline for all three Valkey calls keeps the handler's chain in HANDLER_WAITS.
	const outcome = await withDeadline(spendAll(), UPSTREAM_TIMEOUT_MS, 'Valkey').catch(() => 'unavailable');
	if (outcome === 'unavailable') return json({ success: false, error: 'confirmation mails cannot be sent right now; nothing was sent' }, 503);
	if (outcome !== 'ok') return json({ success: false, error: refusals[outcome] }, 429);
	return null;
}

/** The address as BetterAuth stores it, or '' when it cannot be one. */
export function address(value: string): string {
	const email = value.trim().toLowerCase();
	return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
