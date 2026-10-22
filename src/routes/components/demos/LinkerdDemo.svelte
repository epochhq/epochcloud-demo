<script lang="ts">
	interface LinkerdStats {
		inbound: { requests: number; success: number; failures: number };
		outbound: { requests: number; success: number; failures: number };
		tcp_in: number;
		tcp_out: number;
		memory_mb: string;
	}

	let linkerdData: LinkerdStats | null = $state(null);
	let linkerdPrev: LinkerdStats | null = $state(null);
	let linkerdRates: { inbound: number; outbound: number } | null = $state(null);
	let linkerdError = $state('');
	let linkerdLoaded = $state(false);
	let linkerdLive = $state(false);
	let linkerdTrafficRunning = $state(false);
	let linkerdLastUpdated = $state('');
	let linkerdAgo = $state(0);
	let linkerdLastTs = 0;

	async function loadLinkerdStats() {
		try {
			const resp = await fetch('/linkerd/stats');
			const d = await resp.json();
			if (d.available) {
				const newData = {
					inbound: {
						requests: d.inbound.request_total,
						success: d.inbound.success_total,
						failures: d.inbound.failure_total
					},
					outbound: {
						requests: d.outbound.request_total,
						success: d.outbound.success_total,
						failures: d.outbound.failure_total
					},
					tcp_in: d.tcp_inbound,
					tcp_out: d.tcp_outbound,
					memory_mb: (d.proxy_memory_bytes / 1024 / 1024).toFixed(1)
				};
				if (linkerdData) {
					linkerdRates = {
						inbound: Math.max(0, newData.inbound.requests - linkerdData.inbound.requests),
						outbound: Math.max(0, newData.outbound.requests - linkerdData.outbound.requests)
					};
				}
				linkerdPrev = linkerdData;
				linkerdData = newData;
				linkerdError = '';
			} else {
				linkerdData = null;
				linkerdError = d.error || 'Linkerd proxy not available';
			}
			linkerdLoaded = true;
			const now = new Date();
			linkerdLastUpdated = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
			linkerdLastTs = Date.now();
			linkerdAgo = 0;
		} catch (err) {
			linkerdData = null;
			linkerdError = String(err);
			linkerdLoaded = true;
		}
	}

	async function linkerdGenerateTraffic() {
		linkerdTrafficRunning = true;
		const endpoints = [
			'/linkerd/stats',
			'/prometheus/demo',
			'/rabbitmq/status',
			'/valkey/get?key=chaos-test',
			'/features/status',
			'/crowdsec/status',
			'/ntfy/status'
		];
		for (let round = 0; round < 3; round++) {
			await Promise.allSettled(endpoints.map((e) => fetch(e)));
			await new Promise((r) => setTimeout(r, 200));
		}
		await loadLinkerdStats();
		linkerdTrafficRunning = false;
	}

	// Auto-start live mode on mount
	$effect(() => {
		linkerdLive = true;
		loadLinkerdStats();
	});

	// Auto-refresh while live
	$effect(() => {
		if (!linkerdLive) return;
		const id = setInterval(loadLinkerdStats, 3000);
		return () => clearInterval(id);
	});

	// Tick "ago" counter
	$effect(() => {
		if (!linkerdLoaded) return;
		const tick = setInterval(() => {
			if (linkerdLastTs > 0) linkerdAgo = Math.floor((Date.now() - linkerdLastTs) / 1000);
		}, 1000);
		return () => clearInterval(tick);
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>Linkerd</h3>
		<span class="card-tag">Service Mesh</span>
	</div>
	<p class="card-desc">mTLS proxy - inbound from meshed services, outbound to meshed services</p>
	<div class="linkerd-controls">
		<button
			onclick={loadLinkerdStats}
			class="btn btn-outline btn-sm">Refresh</button
		>
		<button
			onclick={linkerdGenerateTraffic}
			class="btn btn-accent btn-sm"
			disabled={linkerdTrafficRunning}
		>
			{linkerdTrafficRunning ? 'Generating...' : 'Generate Traffic'}
		</button>
		<button
			class="btn btn-sm"
			class:btn-outline={!linkerdLive}
			class:btn-ok={linkerdLive}
			onclick={() => {
				linkerdLive = !linkerdLive;
				if (linkerdLive) loadLinkerdStats();
			}}
		>
			{#if linkerdLive}<span class="live-dot"></span>{/if}
			{linkerdLive ? 'Live' : 'Auto-refresh'}
		</button>
	</div>
	{#if linkerdLoaded}
		{#if linkerdData}
			<div class="linkerd-sections">
				{#each [{ dir: 'Outbound', hint: 'this pod → services', data: linkerdData.outbound, tcp: linkerdData.tcp_out, rate: linkerdRates?.outbound ?? 0 }, { dir: 'Inbound', hint: 'services → this pod', data: linkerdData.inbound, tcp: linkerdData.tcp_in, rate: linkerdRates?.inbound ?? 0 }] as section (section.dir)}
					<div class="linkerd-dir">
						<div class="linkerd-dir-top">
							<span class="linkerd-dir-label">{section.dir} <span class="linkerd-dir-hint">{section.hint}</span></span>
							{#if section.rate > 0}
								<span class="linkerd-rate">+{section.rate}/3s</span>
							{/if}
						</div>
						{#if section.data.requests > 0}
							<div class="linkerd-success-bar">
								<div
									class="linkerd-success-fill"
									style="width: {section.data.requests > 0 ? (section.data.success / section.data.requests) * 100 : 100}%"
								></div>
							</div>
							<span class="linkerd-success-text"
								>{(section.data.requests > 0 ? (section.data.success / section.data.requests) * 100 : 100).toFixed(1)}% success rate</span
							>
						{/if}
						<div class="linkerd-stats">
							<div class="linkerd-stat">
								<span class="linkerd-val">{section.data.requests.toLocaleString()}</span>
								<span class="linkerd-stat-label">Requests</span>
							</div>
							<div class="linkerd-stat">
								<span class="linkerd-val">{section.data.success.toLocaleString()}</span>
								<span class="linkerd-stat-label">Success</span>
							</div>
							<div class="linkerd-stat">
								<span
									class="linkerd-val"
									class:linkerd-val-err={section.data.failures > 0}>{section.data.failures.toLocaleString()}</span
								>
								<span class="linkerd-stat-label">Failures</span>
							</div>
							<div class="linkerd-stat">
								<span class="linkerd-val">{section.tcp}</span>
								<span class="linkerd-stat-label">TCP</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
			<div class="prom-meta">
				<span class="prom-meta-item">Proxy Memory: {linkerdData.memory_mb} MB</span>
				<span class="prom-meta-item">mTLS: Active</span>
				<span class="prom-meta-item">Updated: {linkerdLastUpdated}{linkerdAgo > 0 ? ` (${linkerdAgo}s ago)` : ''}</span>
			</div>
		{:else}
			<pre class="result-pre err">{linkerdError}</pre>
		{/if}
	{/if}
</div>

<style>
	.linkerd-sections {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.linkerd-dir {
		padding: 0.5rem 0.625rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.5rem;
	}

	.linkerd-dir-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.375rem;
	}

	.linkerd-dir-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.linkerd-dir-hint {
		font-weight: 400;
		font-size: 0.6rem;
		color: var(--muted-fg);
		text-transform: none;
		letter-spacing: 0;
	}

	.linkerd-rate {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.linkerd-success-bar {
		height: 3px;
		background: var(--border);
		border-radius: 2px;
		margin-bottom: 0.25rem;
		overflow: hidden;
	}

	.linkerd-success-fill {
		height: 100%;
		background: var(--ok);
		border-radius: 2px;
		transition: width 0.5s ease;
	}

	.linkerd-success-text {
		font-size: 0.6rem;
		color: var(--ok);
		margin-bottom: 0.375rem;
		display: block;
	}

	.linkerd-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.linkerd-val-err {
		color: var(--danger) !important;
	}

	.linkerd-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.375rem;
	}

	.linkerd-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.linkerd-val {
		font-size: 1rem;
		font-weight: 700;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text);
	}

	.linkerd-stat-label {
		font-size: 0.6rem;
		color: var(--muted-fg);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
