<script lang="ts">
	import StatusIcon from '$lib/components/StatusIcon.svelte';

	let { enabled, domain }: { enabled: boolean; domain: string } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let findings: { total: number; by_severity: Record<string, number> } | null = $state(null);

	const severityColors: Record<string, string> = {
		Critical: 'var(--danger)',
		High: '#f97316',
		Medium: 'var(--warning)',
		Low: 'var(--accent)',
		Info: 'var(--muted-fg)'
	};

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/defectdojo/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? `Connected - ${d.product_count} products` : 'Disconnected';

			if (d.connected) {
				const fr = await fetch('/defectdojo/findings');
				const f = await fr.json();
				if (f.success) findings = f.findings;
			}
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	$effect(() => {
		checkStatus();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>DefectDojo</h3>
		<span class="card-tag">Security</span>
	</div>
	<div class="status-row">
		<button
			onclick={checkStatus}
			class="btn btn-outline btn-sm">Check Status</button
		>
		<StatusIcon
			ok={statusOk}
			checked={statusText !== 'Not checked'}
		/>
		<span class="status-text">{statusText}</span>
	</div>
	{#if findings}
		<div class="findings-grid">
			{#each Object.entries(findings.by_severity) as [sev, count] (sev)}
				<div class="finding-item">
					<span
						class="finding-dot"
						style="background:{severityColors[sev] || 'var(--muted-fg)'}"
					></span>
					<span class="finding-label">{sev}</span>
					<span class="finding-count">{count}</span>
				</div>
			{/each}
			<div class="finding-item finding-total">
				<span class="finding-label">Total</span>
				<span class="finding-count">{findings.total}</span>
			</div>
		</div>
	{/if}
	{#if enabled && domain}
		<a
			href="https://defectdojo.{domain}"
			target="_blank"
			rel="noopener"
			class="btn btn-ghost btn-sm w-full"
			style="margin-top:0.5rem">Open Dashboard</a
		>
	{:else if !enabled}
		<p class="disabled-msg">Not configured - DEFECTDOJO_URL not set</p>
	{/if}
</div>

<style>
	.findings-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.finding-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
	}

	.finding-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.finding-label {
		color: var(--text-secondary);
	}

	.finding-count {
		font-weight: 600;
		color: var(--text);
		font-family: 'JetBrains Mono', monospace;
	}

	.finding-total {
		margin-left: auto;
		border-left: 1px solid var(--border);
		padding-left: 0.5rem;
	}
</style>
