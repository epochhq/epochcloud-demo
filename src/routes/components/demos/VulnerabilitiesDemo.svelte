<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled }: { enabled: boolean } = $props();

	const { board } = getPage();
	const scan = $derived(board.get('vulnerabilities').data as { critical: number; high: number; scanned_at: string; scanner: string; signer: string } | null);
</script>

<div class="card">
	<div class="card-head">
		<h3>Vulnerabilities</h3>
		<span class="card-tag">Security</span>
	</div>
	<StatusRow id="vulnerabilities" />
	{#if enabled}
		<p class="card-desc">
			The platform scans every image it builds and attaches the result to the image's digest as a signed attestation. The check reads the attestation of the
			image this pod runs from the registry, verifies its signature against the platform's trust root and the identities allowed to sign, and confirms it names
			the running digest. A digest with no attestation was not scanned, which is not the same as scanned clean. The scan reports high and critical findings that
			have a fix available.
		</p>
		{#if scan}
			<div class="findings-grid">
				<div class="finding-item"><span class="finding-label">Critical</span><span class="finding-count">{scan.critical}</span></div>
				<div class="finding-item"><span class="finding-label">High</span><span class="finding-count">{scan.high}</span></div>
				<div class="finding-item finding-total"><span class="finding-label">{scan.scanner}, {scan.scanned_at.slice(0, 10)}</span></div>
			</div>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured: needs the running image reference and the platform trust root</p>
	{/if}
</div>

<style>
	.findings-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}

	.finding-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8rem;
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
	}
</style>
