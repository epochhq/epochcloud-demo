import type { RequestHandler } from './$types';
import { config } from '$lib/server/config.js';
import { log } from '$lib/server/logger.js';

// Scale-from-zero window: the Kourier/activator path can return an empty or
// non-JSON body (or a transient 503) for the first request while the pod is
// still cold. A single retry after a short backoff lands on the now-warm pod,
// so the invoke succeeds (slower) instead of leaking "Unexpected end of JSON
// input" to the UI. Each attempt is bounded by a timeout so a stuck cold start
// can't hang the request indefinitely.
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 15000;
const RETRY_BACKOFF_MS = 750;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type FibPayload = { result?: unknown; error?: unknown; duration?: unknown };

async function invokeFibonacci(n: number): Promise<FibPayload> {
	let lastErr: unknown;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
		try {
			const resp = await fetch(`${config.knative.fibonacciUrl}/api/fib`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ n }),
				signal: controller.signal
			});

			// Read as text first so an empty/non-JSON cold-start body is a
			// retryable signal rather than a thrown SyntaxError.
			const body = (await resp.text()).trim();
			if (resp.ok && body) {
				return JSON.parse(body) as FibPayload;
			}
			lastErr = new Error(
				`cold-start response (status ${resp.status}, ${body ? 'non-JSON body' : 'empty body'})`
			);
		} catch (err) {
			lastErr = err;
		} finally {
			clearTimeout(timer);
		}

		if (attempt < MAX_ATTEMPTS) {
			await sleep(RETRY_BACKOFF_MS * attempt);
		}
	}

	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export const GET: RequestHandler = async ({ url }) => {
	if (!config.knative.enabled) {
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Knative not configured (KNATIVE_FIBONACCI_URL not set)'
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const n = parseInt(url.searchParams.get('n') || '10');
	if (isNaN(n) || n < 0 || n > 50) {
		return new Response(JSON.stringify({ success: false, error: 'n must be between 0 and 50' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const startTime = performance.now();

	try {
		const data = await invokeFibonacci(n);
		const elapsed = performance.now() - startTime;

		log('info', 'Knative fibonacci invoked', { n, elapsed_ms: elapsed.toFixed(0) });

		return new Response(
			JSON.stringify({
				success: true,
				n,
				result: data.result ?? data.error ?? String(data),
				duration: data.duration ?? null,
				latency_ms: Math.round(elapsed),
				cold_start: elapsed > 2000,
				timestamp: new Date().toISOString()
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const elapsed = performance.now() - startTime;
		return new Response(
			JSON.stringify({
				success: false,
				error: `Knative invoke failed after ${MAX_ATTEMPTS} attempts: ${String(err)}`,
				latency_ms: Math.round(elapsed),
				timestamp: new Date().toISOString()
			}),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
