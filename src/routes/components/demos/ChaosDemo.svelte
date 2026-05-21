<script lang="ts">
	interface ChaosEntry {
		action: string;
		ok: boolean;
		message: string;
		elapsedMs: number;
		raw: Record<string, unknown>;
		timestamp: string;
		services?: { service: string; status: string; latency_ms: number }[];
	}

	let chaosHistory: ChaosEntry[] = $state([]);
	let chaosLoading = $state(false);
	let chaosDegradeState: { current: number; max: number; active: boolean } | null = $state(null);
	let chaosLoadCount = $state('10');
	let chaosDelayMs = $state('2000');
	let chaosJitterMin = $state('100');
	let chaosJitterMax = $state('5000');
	let chaosCpuSec = $state('3');
	let chaosMemMb = $state('50');
	let chaosFlakyRate = $state('50');
	let chaosDegradeMax = $state('10');

	function formatChaosMessage(d: Record<string, unknown>, action: string): string {
		switch (action) {
			case 'cpu':
				return `CPU burn: ${d.seconds}s, ${Number(d.iterations).toLocaleString()} iterations (${d.duration_ms}ms)`;
			case 'memory':
				return `Memory spike: ${d.mb_allocated}MB held for 2s (alloc ${d.alloc_ms}ms)`;
			case 'slow':
				return `Fixed delay: ${d.delay_ms}ms`;
			case 'jitter':
				return `Jitter: ${d.delay_ms}ms (range ${d.min_ms}-${d.max_ms}ms)`;
			case 'timeout':
				return `Timeout simulation: ${d.delay_ms}ms`;
			case 'load':
				return `Concurrent load: ${d.count} ops in ${d.duration_ms}ms`;
			case 'flaky':
				return d.failed ? `Flaky FAILED (${d.rate}% rate)` : `Flaky OK (${d.rate}% rate)`;
			case 'cascade':
				return `Cascade: ${(d.services as unknown[])?.length || 0} services checked in ${d.total_ms}ms`;
			case 'degrade':
				return `Degradation #${d.request_number}: ${d.delay_ms}ms delay${d.saturated ? ' (saturated!)' : ''}`;
			case 'degrade-reset':
				return String(d.message || 'Counter reset');
			default:
				return String(d.message || d.error || 'Done');
		}
	}

	async function chaosAction(action: string, params: Record<string, string> = {}) {
		chaosLoading = true;
		const start = performance.now();
		const qs = new URLSearchParams({ action, ...params }).toString();
		try {
			const resp = await fetch(`/chaos?${qs}`);
			// Read as text first so we can fall back gracefully when Cloudflare's
			// edge intercepts an upstream 502/504 and serves its own HTML error
			// page instead of passing through the demo app's JSON. Without this,
			// resp.json() throws "Unexpected token '<', '<!DOCTYPE'..." which
			// looks like a frontend bug rather than the upstream interception
			// it actually demonstrates.
			const body = await resp.text();
			const elapsedMs = Math.round(performance.now() - start);
			let d: Record<string, unknown>;
			try {
				d = JSON.parse(body);
			} catch {
				const looksLikeHtml = body.trimStart().startsWith('<');
				const intercepted =
					looksLikeHtml && (resp.status === 502 || resp.status === 504);
				chaosHistory = [
					{
						action,
						ok: false,
						message: intercepted
							? `Chaos: ${resp.status} ${resp.statusText} (intercepted by Cloudflare edge - origin response not delivered)`
							: `Non-JSON response: HTTP ${resp.status} ${resp.statusText}`,
						elapsedMs,
						raw: {
							status: resp.status,
							statusText: resp.statusText,
							bodyPreview: body.slice(0, 200)
						},
						timestamp: new Date().toISOString()
					},
					...chaosHistory
				].slice(0, 20);
				return;
			}
			if (action === 'degrade') {
				chaosDegradeState = {
					current: d.request_number as number,
					max: d.max_requests as number,
					active: true
				};
			} else if (action === 'degrade-reset') {
				chaosDegradeState = null;
			}
			chaosHistory = [
				{
					action,
					ok: !d.error,
					message: formatChaosMessage(d, action),
					elapsedMs,
					raw: d,
					timestamp: new Date().toISOString(),
					services: d.services as ChaosEntry['services']
				},
				...chaosHistory
			].slice(0, 20);
		} catch (err) {
			const elapsedMs = Math.round(performance.now() - start);
			chaosHistory = [
				{
					action,
					ok: false,
					message: `Error: ${err}`,
					elapsedMs,
					raw: {},
					timestamp: new Date().toISOString()
				},
				...chaosHistory
			].slice(0, 20);
		} finally {
			chaosLoading = false;
		}
	}
</script>

<div class="chaos-panel">
	<div class="chaos-header">
		<div>
			<h3>Chaos Testing</h3>
			<p class="card-desc">
				Inject failures, latency, and resource pressure to test observability and resilience
			</p>
		</div>
		{#if chaosLoading}<span class="chaos-loading">Running...</span>{/if}
	</div>

	<div class="chaos-grid">
		<!-- Error Injection -->
		<div class="chaos-section chaos-danger">
			<h4 class="chaos-section-title">Error Injection</h4>
			<p class="chaos-section-desc">Trigger HTTP errors to test alerting and Prometheus counters</p>
			<div class="chaos-actions">
				<button
					onclick={() => chaosAction('error')}
					class="btn btn-danger btn-sm"
					disabled={chaosLoading}>500 Error</button
				>
				<button
					onclick={() => chaosAction('error502')}
					class="btn btn-danger btn-sm"
					disabled={chaosLoading}>502 Gateway</button
				>
				<button
					onclick={() => chaosAction('error503')}
					class="btn btn-danger btn-sm"
					disabled={chaosLoading}>503 Unavailable</button
				>
			</div>
		</div>

		<!-- Latency Injection -->
		<div class="chaos-section chaos-warning">
			<h4 class="chaos-section-title">Latency Injection</h4>
			<p class="chaos-section-desc">
				Inject delays to observe p99 latency in Linkerd and Prometheus
			</p>
			<div class="chaos-fields">
				<div class="chaos-field">
					<span class="chaos-field-label">Fixed delay</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosDelayMs}
							class="input input-sm chaos-input"
							min="100"
							max="30000"
						/>
						<span class="chaos-unit">ms</span>
						<button
							onclick={() => chaosAction('slow', { delay: chaosDelayMs })}
							class="btn btn-warning btn-sm"
							disabled={chaosLoading}>Inject</button
						>
					</div>
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Random jitter</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosJitterMin}
							class="input input-sm chaos-input"
							min="0"
						/>
						<span class="chaos-unit">&ndash;</span>
						<input
							type="number"
							bind:value={chaosJitterMax}
							class="input input-sm chaos-input"
							min="100"
						/>
						<span class="chaos-unit">ms</span>
						<button
							onclick={() => chaosAction('jitter', { min: chaosJitterMin, max: chaosJitterMax })}
							class="btn btn-warning btn-sm"
							disabled={chaosLoading}>Jitter</button
						>
					</div>
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Timeout</span>
					<button
						onclick={() => chaosAction('timeout')}
						class="btn btn-warning btn-sm"
						disabled={chaosLoading}>30s Timeout</button
					>
				</div>
			</div>
		</div>

		<!-- Resource Pressure -->
		<div class="chaos-section chaos-accent">
			<h4 class="chaos-section-title">Resource Pressure</h4>
			<p class="chaos-section-desc">
				Stress CPU/memory to observe metrics, OOM behavior, and scaling
			</p>
			<div class="chaos-fields">
				<div class="chaos-field">
					<span class="chaos-field-label">CPU burn</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosCpuSec}
							class="input input-sm chaos-input"
							min="1"
							max="10"
						/>
						<span class="chaos-unit">sec</span>
						<button
							onclick={() => chaosAction('cpu', { seconds: chaosCpuSec })}
							class="btn btn-accent btn-sm"
							disabled={chaosLoading}>Burn</button
						>
					</div>
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Memory spike</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosMemMb}
							class="input input-sm chaos-input"
							min="1"
							max="256"
						/>
						<span class="chaos-unit">MB</span>
						<button
							onclick={() => chaosAction('memory', { mb: chaosMemMb })}
							class="btn btn-accent btn-sm"
							disabled={chaosLoading}>Spike</button
						>
					</div>
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Concurrent load</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosLoadCount}
							class="input input-sm chaos-input"
							min="1"
							max="100"
						/>
						<span class="chaos-unit">ops</span>
						<button
							onclick={() => chaosAction('load', { count: chaosLoadCount })}
							class="btn btn-accent btn-sm"
							disabled={chaosLoading}>Run</button
						>
					</div>
				</div>
			</div>
		</div>

		<!-- Failure Patterns -->
		<div class="chaos-section chaos-muted">
			<h4 class="chaos-section-title">Failure Patterns</h4>
			<p class="chaos-section-desc">
				Intermittent errors, cascading failures, and gradual degradation
			</p>
			<div class="chaos-fields">
				<div class="chaos-field">
					<span class="chaos-field-label">Flaky endpoint</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosFlakyRate}
							class="input input-sm chaos-input"
							min="1"
							max="99"
						/>
						<span class="chaos-unit">%</span>
						<button
							onclick={() => chaosAction('flaky', { rate: chaosFlakyRate })}
							class="btn btn-outline btn-sm"
							disabled={chaosLoading}>Test</button
						>
					</div>
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Degradation</span>
					<div class="chaos-field-row">
						<input
							type="number"
							bind:value={chaosDegradeMax}
							class="input input-sm chaos-input"
							min="2"
							max="50"
						/>
						<span class="chaos-unit">reqs</span>
						<button
							onclick={() => chaosAction('degrade', { requests: chaosDegradeMax })}
							class="btn btn-outline btn-sm"
							disabled={chaosLoading}>Start</button
						>
						<button
							onclick={() => chaosAction('degrade-reset')}
							class="btn btn-outline btn-sm"
							disabled={chaosLoading}>Reset</button
						>
					</div>
					{#if chaosDegradeState}
						<div class="degrade-progress">
							<div
								class="degrade-bar"
								style="width: {Math.min(
									(chaosDegradeState.current / chaosDegradeState.max) * 100,
									100
								)}%"
							></div>
						</div>
						<span class="chaos-unit"
							>{chaosDegradeState.current}/{chaosDegradeState.max} requests{chaosDegradeState.current >=
							chaosDegradeState.max
								? ' (saturated)'
								: ''}</span
						>
					{/if}
				</div>
				<div class="chaos-field">
					<span class="chaos-field-label">Cascade check</span>
					<button
						onclick={() => chaosAction('cascade')}
						class="btn btn-outline btn-sm"
						disabled={chaosLoading}>Valkey + RabbitMQ + Prometheus</button
					>
				</div>
			</div>
		</div>
	</div>

	<!-- Action History -->
	{#if chaosHistory.length > 0}
		<div class="chaos-log">
			<div class="chaos-log-header">
				<h4 class="chaos-section-title">Action Log</h4>
				<button
					class="btn btn-outline btn-sm"
					onclick={() => {
						chaosHistory = [];
						chaosDegradeState = null;
					}}>Clear</button
				>
			</div>
			<div class="chaos-log-entries">
				{#each chaosHistory as entry (entry.timestamp)}
					<div class="chaos-log-entry" class:ok={entry.ok} class:err={!entry.ok}>
						<div class="chaos-log-main">
							<span class="chaos-log-badge" class:ok={entry.ok} class:err={!entry.ok}
								>{entry.ok ? '✓' : '✗'}</span
							>
							<span class="chaos-log-action">{entry.action}</span>
							<span class="chaos-log-msg">{entry.message}</span>
						</div>
						<span class="chaos-log-time">{entry.elapsedMs}ms</span>
					</div>
					{#if entry.services}
						<table class="cascade-table">
							<thead><tr><th>Service</th><th>Status</th><th>Latency</th></tr></thead>
							<tbody>
								{#each entry.services as svc (svc.service)}
									<tr>
										<td>{svc.service}</td>
										<td
											><span
												class="cascade-dot"
												class:ok={svc.status === 'ok'}
												class:err={svc.status !== 'ok'}
											></span>
											{svc.status}</td
										>
										<td>{svc.latency_ms}ms</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.chaos-panel {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
	}

	.chaos-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.chaos-header h3 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.chaos-loading {
		font-size: 0.8rem;
		color: var(--accent);
		font-weight: 500;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.chaos-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.chaos-section {
		padding: 1rem;
		background: var(--bg);
		border-radius: 8px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--border);
		overflow: hidden;
	}

	.chaos-section.chaos-danger {
		border-left-color: var(--danger);
	}

	.chaos-section.chaos-warning {
		border-left-color: var(--warning);
	}

	.chaos-section.chaos-accent {
		border-left-color: var(--accent);
	}

	.chaos-section.chaos-muted {
		border-left-color: var(--muted-fg);
	}

	.chaos-section-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 0.375rem;
	}

	.chaos-section-desc {
		font-size: 0.75rem;
		color: var(--muted-fg);
		margin-bottom: 0.75rem;
		line-height: 1.4;
	}

	.chaos-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chaos-fields {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.chaos-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.chaos-field-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.chaos-field-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
	}

	.chaos-input {
		width: 5rem;
		min-width: 0;
	}

	.chaos-unit {
		font-size: 0.75rem;
		color: var(--muted-fg);
		white-space: nowrap;
	}

	.degrade-progress {
		height: 4px;
		background: var(--border);
		border-radius: 2px;
		margin-top: 0.375rem;
		overflow: hidden;
	}

	.degrade-bar {
		height: 100%;
		background: var(--warning);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.chaos-log {
		margin-top: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}

	.chaos-log-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.75rem;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}

	.chaos-log-header .chaos-section-title {
		margin-bottom: 0;
	}

	.chaos-log-entries {
		max-height: 280px;
		overflow-y: auto;
	}

	.chaos-log-entry {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.8rem;
		gap: 0.5rem;
	}

	.chaos-log-entry:last-child {
		border-bottom: none;
	}

	.chaos-log-main {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.chaos-log-badge {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.chaos-log-badge.ok {
		background: color-mix(in srgb, var(--ok) 15%, transparent);
		color: var(--ok);
	}

	.chaos-log-badge.err {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
	}

	.chaos-log-action {
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.chaos-log-msg {
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chaos-log-time {
		font-size: 0.7rem;
		color: var(--muted-fg);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.cascade-table {
		width: 100%;
		font-size: 0.75rem;
		border-collapse: collapse;
		background: var(--bg);
	}

	.cascade-table th {
		text-align: left;
		padding: 0.25rem 0.75rem;
		color: var(--muted-fg);
		font-weight: 500;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.cascade-table td {
		padding: 0.25rem 0.75rem;
		color: var(--text-secondary);
		border-top: 1px solid var(--border);
	}

	.cascade-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		margin-right: 0.25rem;
		vertical-align: middle;
	}

	.cascade-dot.ok {
		background: var(--ok);
	}

	.cascade-dot.err {
		background: var(--danger);
	}

	@media (max-width: 768px) {
		.chaos-panel {
			padding: 1rem;
		}

		.chaos-grid {
			grid-template-columns: 1fr;
		}

		.chaos-field-row {
			flex-wrap: wrap;
		}
	}
</style>
