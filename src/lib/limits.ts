// Time budgets shared by the server, the client and the build configuration.
// Bun cuts a request that has written no byte for the idle timeout and the app
// still logs 200 for it, so nothing may be allowed to wait that long. The idle
// timeout is stated here at Bun's own default; it is not raised to make slow
// work pass. Every outbound call and every deliberate delay is bounded well
// below it, so no handler can outlive it.

/** Bun.serve per-request inactivity limit, set explicitly in vite.config.ts. */
export const IDLE_TIMEOUT_SECONDS = 10;

/** Longest a single server-to-upstream call may take. */
export const UPSTREAM_TIMEOUT_MS = 3_000;

/** Longest a whole status check (all of its upstream calls) may take. */
export const STATUS_TIMEOUT_MS = 5_000;

/** Longest deliberate delay the chaos actions inject. */
export const CHAOS_MAX_DELAY_MS = 4_000;

/** The browser waits this long for any answer before it reports a timeout. */
export const CLIENT_TIMEOUT_MS = 8_000;

/** An answer slower than this is shown as slow rather than ok. */
export const SLOW_AFTER_MS = 2_000;

/** How often the server refreshes its status snapshot on its own. */
export const SNAPSHOT_INTERVAL_MS = 30_000;
