<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let promDemoCount = $state(0);
	let promHttpTotal = $state(0);
	let promActive = $state(0);
	let promLoaded = $state(false);
	let promPod = $state('');
	let promSource = $state('');
	let promStatusBreakdown: Record<string, number> = $state({});
	let promLatency = $state({ p50: 0, p95: 0, p99: 0 });
	let promErrors = $state(0);
	let promLive = $state(false);
	let promPrevHttpTotal = $state(0);
	let promRate = $state(0);
	let promHistory: Array<{ time: string; count: number }> = $state([]);
	let promLastUpdated = $state('');
	let promAgo = $state(0);
	let promLastTs = 0;

	async function loadPromMetrics(increment = false, burst = 1) {
		try {
			const action = increment ? 'increment' : 'status';
			const params = new SvelteURLSearchParams({ action });
			if (increment && burst > 1) params.set('burst', String(burst));
			const resp = await fetch(`/prometheus/demo?${params}`);
			const d = await resp.json();
			promPrevHttpTotal = promHttpTotal;
			promDemoCount = d.demo_counter;
			promHttpTotal = d.http_requests_total;
			promActive = d.active_requests;
			promPod = d.pod || '';
			promSource = d.source || '';
			promStatusBreakdown = d.status_breakdown || {};
			promLatency = d.latency || { p50: 0, p95: 0, p99: 0 };
			promErrors = d.errors || 0;
			if (promPrevHttpTotal > 0) {
				promRate = promHttpTotal - promPrevHttpTotal;
			}
			if (increment) {
				const now = new Date();
				promHistory = [
					{
						time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
						count: burst
					},
					...promHistory
				].slice(0, 15);
			}
			const now = new Date();
			promLastUpdated = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
			promLastTs = Date.now();
			promAgo = 0;
			promLoaded = true;
		} catch {
			promLoaded = false;
		}
	}

	// Auto-start live mode on mount
	$effect(() => {
		promLive = true;
		loadPromMetrics(false);
	});

	// Auto-refresh while live
	$effect(() => {
		if (!promLive) return;
		const id = setInterval(() => loadPromMetrics(false), 3000);
		return () => clearInterval(id);
	});

	// Tick "ago" counter
	$effect(() => {
		if (!promLoaded) return;
		const tick = setInterval(() => {
			if (promLastTs > 0) promAgo = Math.floor((Date.now() - promLastTs) / 1000);
		}, 1000);
		return () => clearInterval(tick);
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>Prometheus</h3>
		<span class="card-tag">Metrics</span>
	</div>
	<p class="card-desc">Counter &amp; in-flight are per-pod, HTTP total aggregated via Prometheus</p>
	<div class="prom-controls">
		<button
			onclick={() => loadPromMetrics(true)}
			class="btn btn-primary btn-sm">+1</button
		>
		<button
			onclick={() => loadPromMetrics(true, 5)}
			class="btn btn-primary btn-sm">+5</button
		>
		<button
			onclick={() => loadPromMetrics(true, 25)}
			class="btn btn-primary btn-sm">+25</button
		>
		<button
			onclick={() => loadPromMetrics(false)}
			class="btn btn-outline btn-sm">Refresh</button
		>
		<button
			class="btn btn-sm"
			class:btn-outline={!promLive}
			class:btn-ok={promLive}
			onclick={() => {
				promLive = !promLive;
				if (promLive) loadPromMetrics(false);
			}}
		>
			{#if promLive}<span class="live-dot"></span>{/if}
			{promLive ? 'Live' : 'Auto-refresh'}
		</button>
	</div>
	{#if promLoaded}
		<div class="prom-stats">
			<div class="prom-stat">
				<span class="prom-val">{promDemoCount.toLocaleString()}</span>
				<span class="prom-label">Demo Counter</span>
				<span class="prom-scope">this pod</span>
			</div>
			<div class="prom-stat">
				<span class="prom-val">{promHttpTotal.toLocaleString()}</span>
				<span class="prom-label">HTTP Total</span>
				<span class="prom-scope">{promSource === 'prometheus' ? 'all pods' : 'this pod'}{promRate > 0 ? ` · +${promRate}` : ''}</span>
			</div>
			<div class="prom-stat">
				<span class="prom-val">{promActive}</span>
				<span class="prom-label">In-Flight</span>
				<span class="prom-scope">this pod</span>
			</div>
			<div class="prom-stat">
				<span
					class="prom-val"
					class:prom-val-err={promErrors > 0}>{promErrors}</span
				>
				<span class="prom-label">Errors</span>
				<span class="prom-scope">this pod</span>
			</div>
		</div>

		{#if promLatency.p50 > 0 || promLatency.p95 > 0}
			<div class="prom-latency">
				<span class="prom-latency-title">Latency</span>
				<div class="prom-latency-bars">
					{#each [{ label: 'p50', val: promLatency.p50 }, { label: 'p95', val: promLatency.p95 }, { label: 'p99', val: promLatency.p99 }] as pct (pct.label)}
						<div class="prom-pct">
							<span class="prom-pct-label">{pct.label}</span>
							<div class="prom-pct-bar">
								<div
									class="prom-pct-fill"
									style="width: {Math.min((pct.val / Math.max(promLatency.p99, 0.001)) * 100, 100)}%"
								></div>
							</div>
							<span class="prom-pct-val">{pct.val < 1 ? `${(pct.val * 1000).toFixed(0)}ms` : `${pct.val.toFixed(2)}s`}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if Object.keys(promStatusBreakdown).length > 0}
			<div class="prom-status-section">
				<span class="prom-latency-title">Status Codes</span>
				<div class="prom-status-codes">
					{#each Object.entries(promStatusBreakdown).sort(([a], [b]) => a.localeCompare(b)) as [code, count] (code)}
						<div
							class="prom-status-chip"
							class:status-2xx={code.startsWith('2')}
							class:status-3xx={code.startsWith('3')}
							class:status-4xx={code.startsWith('4')}
							class:status-5xx={code.startsWith('5')}
						>
							<span class="prom-status-code">{code}</span>
							<span class="prom-status-count">{count.toLocaleString()}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if promHistory.length > 0}
			<div class="prom-history">
				<span class="prom-latency-title">Activity</span>
				<div class="prom-history-items">
					{#each promHistory as entry (entry.time)}
						<span class="prom-history-item">
							<span class="prom-history-time">{entry.time}</span>
							+{entry.count}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<div class="prom-meta">
			<span class="prom-meta-item">Pod: {promPod}</span>
			<span class="prom-meta-item">Source: {promSource}</span>
			<span class="prom-meta-item">Updated: {promLastUpdated}{promAgo > 0 ? ` (${promAgo}s ago)` : ''}</span>
		</div>
	{/if}
</div>

<style>
	.prom-controls {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.prom-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
	}

	.prom-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.5rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.5rem;
	}

	.prom-val {
		font-size: 1.25rem;
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text);
	}

	.prom-val-err {
		color: var(--danger);
	}

	.prom-label {
		font-size: 0.65rem;
		color: var(--muted-fg);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.prom-scope {
		font-size: 0.6rem;
		color: var(--muted-fg);
		font-style: italic;
	}

	.prom-latency {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.prom-latency-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.prom-latency-bars {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.prom-pct {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.prom-pct-label {
		font-size: 0.7rem;
		font-weight: 600;
		font-family: 'JetBrains Mono', monospace;
		color: var(--muted-fg);
		min-width: 2rem;
	}

	.prom-pct-bar {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		overflow: hidden;
	}

	.prom-pct-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.prom-pct-val {
		font-size: 0.7rem;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-secondary);
		min-width: 3.5rem;
		text-align: right;
	}

	.prom-status-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.prom-status-codes {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
	}

	.prom-status-chip {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: var(--bg);
		border: 1px solid var(--border);
		font-size: 0.7rem;
	}

	.prom-status-code {
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
	}

	.prom-status-count {
		color: var(--text-secondary);
	}

	.status-2xx {
		border-color: var(--ok);
	}
	.status-2xx .prom-status-code {
		color: var(--ok);
	}
	.status-3xx {
		border-color: var(--accent);
	}
	.status-3xx .prom-status-code {
		color: var(--accent);
	}
	.status-4xx {
		border-color: var(--warning);
	}
	.status-4xx .prom-status-code {
		color: var(--warning);
	}
	.status-5xx {
		border-color: var(--danger);
	}
	.status-5xx .prom-status-code {
		color: var(--danger);
	}

	.prom-history {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.prom-history-items {
		display: flex;
		gap: 0.375rem;
		flex-wrap: wrap;
	}

	.prom-history-item {
		font-size: 0.65rem;
		font-family: 'JetBrains Mono', monospace;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.15);
		color: var(--text-secondary);
	}

	.prom-history-time {
		color: var(--muted-fg);
		margin-right: 0.25rem;
	}

	@media (max-width: 768px) {
		.prom-stats {
			grid-template-columns: 1fr;
		}
	}
</style>
