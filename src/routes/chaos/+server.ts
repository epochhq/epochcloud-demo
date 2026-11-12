import type { RequestHandler } from './$types';
import { errorsTotal } from '#lib/server/metrics.js';
import { CHAOS_MAX_DELAY_MS } from '#lib/limits.js';
import { guard } from '#lib/server/guard.js';

// In-memory degradation counter (per process)
let degradeCounter = 0;

const json = (data: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

// Fault injection runs inside this app and only for a signed-in user. Every
// action is capped far below the pod's limits and below the server's idle
// timeout, and none takes input beyond its own size or duration.
export const POST: RequestHandler = async ({ request, fetch: svelteKitFetch }) => {
	const auth = await guard(request, { write: true });
	if ('refusal' in auth) return auth.refusal;
	const params = new URLSearchParams();
	for (const [key, value] of await request.formData()) if (typeof value === 'string') params.set(key, value);
	const action = params.get('action');

	// ═══════════════════════════════════════════════
	// 1. ERROR INJECTION
	// ═══════════════════════════════════════════════

	if (action === 'error') {
		errorsTotal.inc({ type: 'chaos_500' });
		return json(
			{
				error: 'Chaos: Internal Server Error (500)',
				action: 'error',
				timestamp: new Date().toISOString()
			},
			500
		);
	}

	if (action === 'error502') {
		errorsTotal.inc({ type: 'chaos_502' });
		return json(
			{
				error: 'Chaos: Bad Gateway (502)',
				action: 'error502',
				timestamp: new Date().toISOString()
			},
			502
		);
	}

	if (action === 'error503') {
		errorsTotal.inc({ type: 'chaos_503' });
		return json(
			{
				error: 'Chaos: Service Unavailable (503)',
				action: 'error503',
				timestamp: new Date().toISOString()
			},
			503
		);
	}

	// ═══════════════════════════════════════════════
	// 2. LATENCY INJECTION
	// ═══════════════════════════════════════════════

	if (action === 'slow') {
		const delay = Math.min(Math.max(parseInt(params.get('delay') || '2000'), 100), CHAOS_MAX_DELAY_MS);
		await new Promise((resolve) => setTimeout(resolve, delay));
		return json({
			message: `Slow response completed after ${delay}ms`,
			action: 'slow',
			delay_ms: delay,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'jitter') {
		const min = Math.min(Math.max(parseInt(params.get('min') || '100'), 0), CHAOS_MAX_DELAY_MS);
		const max = Math.min(parseInt(params.get('max') || '5000'), CHAOS_MAX_DELAY_MS);
		const delay = Math.round(min + Math.random() * (max - min));
		await new Promise((resolve) => setTimeout(resolve, delay));
		return json({
			message: `Jitter response: ${delay}ms (range ${min}-${max}ms)`,
			action: 'jitter',
			delay_ms: delay,
			min_ms: min,
			max_ms: max,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'timeout') {
		// The longest delay the server allows: longer than the client waits in
		// the chaos panel, shorter than the server's idle timeout.
		await new Promise((resolve) => setTimeout(resolve, CHAOS_MAX_DELAY_MS));
		return json({
			message: `Timeout simulation completed (${CHAOS_MAX_DELAY_MS / 1000}s)`,
			action: 'timeout',
			delay_ms: CHAOS_MAX_DELAY_MS,
			timestamp: new Date().toISOString()
		});
	}

	// ═══════════════════════════════════════════════
	// 3. RESOURCE PRESSURE
	// ═══════════════════════════════════════════════

	if (action === 'cpu') {
		const seconds = Math.min(Math.max(parseInt(params.get('seconds') || '1'), 1), 2);
		const start = performance.now();
		const end = start + seconds * 1000;
		let iterations = 0;
		while (performance.now() < end) {
			Math.sqrt(Math.random() * 1_000_000);
			iterations++;
		}
		const elapsed = Math.round(performance.now() - start);
		return json({
			message: `CPU burn completed: ${seconds}s, ${iterations.toLocaleString()} iterations`,
			action: 'cpu',
			seconds,
			iterations,
			duration_ms: elapsed,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'memory') {
		const mb = Math.min(Math.max(parseInt(params.get('mb') || '8'), 1), 16);
		const start = performance.now();
		// Allocate buffer and fill to prevent optimization
		const buffers: Buffer[] = [];
		for (let i = 0; i < mb; i++) {
			const buf = Buffer.alloc(1024 * 1024); // 1MB each
			buf.fill(i % 256);
			buffers.push(buf);
		}
		const elapsed = Math.round(performance.now() - start);
		// Hold for 2s so metrics can capture it
		await new Promise((resolve) => setTimeout(resolve, 2000));
		// Let GC reclaim
		buffers.length = 0;
		return json({
			message: `Memory spike: ${mb}MB allocated for 2s, then released`,
			action: 'memory',
			mb_allocated: mb,
			alloc_ms: elapsed,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'load') {
		const count = Math.min(Math.max(parseInt(params.get('count') || '5'), 1), 20);
		const start = performance.now();
		const promises = Array.from({ length: count }, async (_, i) => {
			let sum = 0;
			for (let j = 0; j < 1_000_000; j++) sum += Math.sqrt(j);
			return { worker: i, result: sum };
		});
		await Promise.all(promises);
		const durationMs = Math.round(performance.now() - start);
		return json({
			message: `Load test: ${count} concurrent operations in ${durationMs}ms`,
			action: 'load',
			count,
			duration_ms: durationMs,
			timestamp: new Date().toISOString()
		});
	}

	// ═══════════════════════════════════════════════
	// 4. FAILURE PATTERNS
	// ═══════════════════════════════════════════════

	if (action === 'flaky') {
		const rate = Math.min(Math.max(parseInt(params.get('rate') || '50'), 1), 99);
		const failed = Math.random() * 100 < rate;
		if (failed) {
			errorsTotal.inc({ type: 'chaos_flaky' });
			return json(
				{
					error: `Flaky failure (${rate}% failure rate)`,
					action: 'flaky',
					failed: true,
					rate,
					timestamp: new Date().toISOString()
				},
				500
			);
		}
		return json({
			message: `Flaky success (${rate}% failure rate)`,
			action: 'flaky',
			failed: false,
			rate,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'cascade') {
		const start = performance.now();
		const results: { service: string; status: string; latency_ms: number }[] = [];

		const services = [
			{ name: 'Valkey', path: '/status/valkey' },
			{ name: 'RabbitMQ', path: '/status/rabbitmq' },
			{ name: 'Prometheus', path: '/status/prometheus' }
		];

		for (const svc of services) {
			const svcStart = performance.now();
			try {
				const resp = await svelteKitFetch(svc.path);
				results.push({
					service: svc.name,
					status: resp.ok ? 'ok' : `error (${resp.status})`,
					latency_ms: Math.round(performance.now() - svcStart)
				});
			} catch (err) {
				results.push({
					service: svc.name,
					status: `failed: ${String(err).slice(0, 80)}`,
					latency_ms: Math.round(performance.now() - svcStart)
				});
			}
		}

		const totalMs = Math.round(performance.now() - start);
		const allOk = results.every((r) => r.status === 'ok');
		return json(
			{
				message: `Cascade check: ${results.filter((r) => r.status === 'ok').length}/${results.length} services healthy`,
				action: 'cascade',
				services: results,
				total_ms: totalMs,
				all_healthy: allOk,
				timestamp: new Date().toISOString()
			},
			allOk ? 200 : 503
		);
	}

	if (action === 'degrade') {
		degradeCounter++;
		const maxRequests = Math.min(Math.max(parseInt(params.get('requests') || '10'), 2), 20);
		// Delay grows linearly: 0ms at request 1, up to 5000ms at maxRequests
		const delay = Math.round(Math.min(degradeCounter / maxRequests, 1) * CHAOS_MAX_DELAY_MS);
		await new Promise((resolve) => setTimeout(resolve, delay));
		return json({
			message: `Degradation: request #${degradeCounter}, delay ${delay}ms (saturates at ${maxRequests} requests)`,
			action: 'degrade',
			request_number: degradeCounter,
			delay_ms: delay,
			max_requests: maxRequests,
			saturated: degradeCounter >= maxRequests,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'degrade-reset') {
		const prev = degradeCounter;
		degradeCounter = 0;
		return json({
			message: `Degradation counter reset (was at ${prev})`,
			action: 'degrade-reset',
			previous_count: prev,
			timestamp: new Date().toISOString()
		});
	}

	return json(
		{
			error: 'Unknown action',
			available: ['error', 'error502', 'error503', 'slow', 'jitter', 'timeout', 'cpu', 'memory', 'load', 'flaky', 'cascade', 'degrade', 'degrade-reset'],
			timestamp: new Date().toISOString()
		},
		400
	);
};
