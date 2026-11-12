// Time budgets shared by the server, the client and the build configuration.
// Bun cuts a request that has written no byte for the idle timeout and the app
// still logs 200 for it, so nothing may be allowed to wait that long. The idle
// timeout is stated here at Bun's default; it is not raised to make slow work
// pass. Every outbound call is bounded, and HANDLER_WAITS lists the whole chain
// of waits each handler can run, which tests/local/budgets.test.ts sums.

/** Bun.serve per-request inactivity limit, set explicitly in vite.config.ts. */
export const IDLE_TIMEOUT_SECONDS = 10;

/** A chain of waits must end before this share of the idle timeout. */
export const CHAIN_CEILING_MS = IDLE_TIMEOUT_SECONDS * 1000 * 0.8;

/** The BetterAuth session lookup every signed-in request starts with. */
export const SESSION_TIMEOUT_MS = 1_500;

/** Longest a single server-to-upstream call may take. */
export const UPSTREAM_TIMEOUT_MS = 2_500;

/** Longest all the database work of one request may take, connecting included. */
export const DB_DEADLINE_MS = 4_000;

/** Longest the mail relay may take for the whole handshake and message. */
export const MAIL_DEADLINE_MS = 3_000;

/** Longest the broker may take to confirm a published message. */
export const PUBLISH_CONFIRM_MS = 3_000;

/** Longest a whole status check (all of its upstream calls) may take. */
export const STATUS_TIMEOUT_MS = 5_000;

/** The browser waits this long for any answer before it reports a timeout. */
export const CLIENT_TIMEOUT_MS = 9_000;

/** An answer slower than this is shown as slow rather than ok. */
export const SLOW_AFTER_MS = 2_000;

/** How often the server refreshes its status snapshot on its own. */
export const SNAPSHOT_INTERVAL_MS = 30_000;

export const KNATIVE_ATTEMPTS = 2;
export const KNATIVE_ATTEMPT_MS = 2_500;
export const KNATIVE_BACKOFF_MS = 750;
export const KNATIVE_WORST_CASE_MS = KNATIVE_ATTEMPTS * KNATIVE_ATTEMPT_MS + (KNATIVE_BACKOFF_MS * (KNATIVE_ATTEMPTS * (KNATIVE_ATTEMPTS - 1))) / 2;

const WITH_SESSION = SESSION_TIMEOUT_MS;

/**
 * Every wait a signed-in handler can perform, in order. A new handler needs an
 * entry here, and the sum of its entry stays under CHAIN_CEILING_MS.
 */
export const HANDLER_WAITS: Record<string, number[]> = {
	'/cache/get': [WITH_SESSION, UPSTREAM_TIMEOUT_MS],
	'/cache/set': [WITH_SESSION, UPSTREAM_TIMEOUT_MS],
	'/cnpg/items': [WITH_SESSION, DB_DEADLINE_MS],
	'/cnpg/items/delete': [WITH_SESSION, DB_DEADLINE_MS],
	'/email/send': [WITH_SESSION, UPSTREAM_TIMEOUT_MS, MAIL_DEADLINE_MS],
	'/features/all': [WITH_SESSION, UPSTREAM_TIMEOUT_MS],
	'/features/evaluate': [WITH_SESSION, UPSTREAM_TIMEOUT_MS],
	'/knative/invoke': [WITH_SESSION, KNATIVE_WORST_CASE_MS],
	'/ntfy/send': [WITH_SESSION, UPSTREAM_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS],
	'/ntfy/topic': [WITH_SESSION],
	'/prometheus/increment': [WITH_SESSION],
	'/rabbitmq/consume': [WITH_SESSION, 2_000, UPSTREAM_TIMEOUT_MS],
	'/rabbitmq/publish': [WITH_SESSION, PUBLISH_CONFIRM_MS]
};
