import type { RequestHandler } from './$types';
import { errorsTotal } from '$lib/server/metrics.js';

// In-memory degradation counter (per process)
let degradeCounter = 0;

const json = (data: Record<string, unknown>, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

export const GET: RequestHandler = async ({ url, fetch: svelteKitFetch }) => {
	const action = url.searchParams.get('action');

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
		const delay = Math.min(Math.max(parseInt(url.searchParams.get('delay') || '2000'), 100), 30000);
		await new Promise((resolve) => setTimeout(resolve, delay));
		return json({
			message: `Slow response completed after ${delay}ms`,
			action: 'slow',
			delay_ms: delay,
			timestamp: new Date().toISOString()
		});
	}

	if (action === 'jitter') {
		const min = Math.max(parseInt(url.searchParams.get('min') || '100'), 0);
		const max = Math.min(parseInt(url.searchParams.get('max') || '5000'), 30000);
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
		// 30s delay to trigger proxy/client timeouts
		await new Promise((resolve) => setTimeout(resolve, 30000));
		return json({
			message: 'Timeout simulation completed (30s)',
			action: 'timeout',
			delay_ms: 30000,
			timestamp: new Date().toISOString()
		});
	}

	// ═══════════════════════════════════════════════
	// 3. RESOURCE PRESSURE
	// ═══════════════════════════════════════════════

	if (action === 'cpu') {
		const seconds = Math.min(Math.max(parseInt(url.searchParams.get('seconds') || '3'), 1), 10);
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
		const mb = Math.min(Math.max(parseInt(url.searchParams.get('mb') || '50'), 1), 256);
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
		const count = Math.min(parseInt(url.searchParams.get('count') || '10'), 100);
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
		const rate = Math.min(Math.max(parseInt(url.searchParams.get('rate') || '50'), 1), 99);
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
			{ name: 'Valkey', path: '/cache/get?key=chaos-test' },
			{ name: 'RabbitMQ', path: '/rabbitmq/status' },
			{ name: 'Prometheus', path: '/prometheus/demo' }
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
		const maxRequests = Math.min(
			Math.max(parseInt(url.searchParams.get('requests') || '10'), 2),
			50
		);
		// Delay grows linearly: 0ms at request 1, up to 5000ms at maxRequests
		const delay = Math.round(Math.min(degradeCounter / maxRequests, 1) * 5000);
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
			available: [
				'error',
				'error502',
				'error503',
				'slow',
				'jitter',
				'timeout',
				'cpu',
				'memory',
				'load',
				'flaky',
				'cascade',
				'degrade',
				'degrade-reset'
			],
			timestamp: new Date().toISOString()
		},
		400
	);
};
