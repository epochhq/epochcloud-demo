import { config } from './config.js';
import { KNATIVE_ATTEMPTS, KNATIVE_ATTEMPT_MS, KNATIVE_BACKOFF_MS } from '../limits.js';

// Scale-from-zero window: the Kourier/activator path can return an empty or
// non-JSON body (or a transient 503) for the first request while the pod is
// still cold. Retries land on the warmed pod. The whole sequence is bounded
// (KNATIVE_WORST_CASE_MS in limits.ts), because a request that outlives the
// server's idle timeout is cut without a body.
export const MAX_ATTEMPTS = KNATIVE_ATTEMPTS;
export const ATTEMPT_TIMEOUT_MS = KNATIVE_ATTEMPT_MS;
export const RETRY_BACKOFF_MS = KNATIVE_BACKOFF_MS;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type FibPayload = { result?: unknown; error?: unknown; duration?: unknown };

export async function invokeFibonacci(n: number): Promise<FibPayload> {
	let lastErr: unknown;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const resp = await fetch(`${config.knative.fibonacciUrl}/api/fib`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ n }),
				signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)
			});

			// Read as text first so an empty/non-JSON cold-start body is a
			// retryable signal rather than a thrown SyntaxError.
			const body = (await resp.text()).trim();
			if (resp.ok && body) {
				return JSON.parse(body) as FibPayload;
			}
			lastErr = new Error(`cold-start response (status ${resp.status}, ${body ? 'non-JSON body' : 'empty body'})`);
		} catch (err) {
			lastErr = err;
		}

		if (attempt < MAX_ATTEMPTS) {
			await sleep(RETRY_BACKOFF_MS * attempt);
		}
	}

	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
