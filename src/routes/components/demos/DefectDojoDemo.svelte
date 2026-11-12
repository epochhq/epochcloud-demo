<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled, domain }: { enabled: boolean; domain: string } = $props();

	// The counts come with the status answer (one cached call), so the panel
	// shows exactly what the check read.
	const { board } = getPage();
	const findings = $derived((board.get('defectdojo').data?.findings as { total: number; by_severity: Record<string, number> } | undefined) ?? null);

	const severityColors: Record<string, string> = {
		Critical: 'var(--danger)',
		High: '#f97316',
		Medium: 'var(--warning)',
		Low: 'var(--accent)',
		Info: 'var(--muted-fg)'
	};
</script>

<div class="card">
	<div class="card-head">
		<h3>DefectDojo</h3>
		<span class="card-tag">Security</span>
	</div>
	<StatusRow id="defectdojo" />
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
	{#if domain}
		<a
			href="https://defectdojo.{domain}"
			target="_blank"
			rel="noopener"
			class="btn btn-ghost btn-sm w-full"
			style="margin-top:0.5rem">Open Dashboard</a
		>
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
