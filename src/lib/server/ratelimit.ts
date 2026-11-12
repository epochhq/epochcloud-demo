import { RateLimiterMemory } from 'rate-limiter-flexible';
import { json } from './http.js';

// Limits are per pod. The deployment runs two pods, so the effective ceiling
// is at most twice the numbers below; they bound abuse, they do not meter it.

export interface Limit {
	points: number;
	durationSeconds: number;
}

export interface Limiter {
	/** Null when the key may proceed, else the 429 answer to return. */
	take(key: string): Promise<Response | null>;
}

export function createLimiter(limit: Limit): Limiter {
	const limiter = new RateLimiterMemory({ points: limit.points, duration: limit.durationSeconds });
	return {
		async take(key) {
			try {
				await limiter.consume(key);
				return null;
			} catch (rejected) {
				const retryAfter = Math.max(1, Math.ceil(((rejected as { msBeforeNext?: number }).msBeforeNext ?? 1000) / 1000));
				const response = json({ success: false, error: 'rate limited', retry_after_seconds: retryAfter }, 429);
				response.headers.set('Retry-After', String(retryAfter));
				return response;
			}
		}
	};
}

/** Take from several limiters; the first refusal wins. */
export async function takeAll(checks: Array<[Limiter, string]>): Promise<Response | null> {
	for (const [limiter, key] of checks) {
		const refused = await limiter.take(key);
		if (refused) return refused;
	}
	return null;
}
