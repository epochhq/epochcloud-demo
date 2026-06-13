<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import FlowArrow from '$lib/components/flow/FlowArrow.svelte';

	// Security model. Three phases: admission + supply chain at deploy, runtime
	// detection on the cluster, and aggregation into DefectDojo. Tools verified
	// present in platform-security + platform-ci.
	type Item = { name: string; sub: string };
	type Phase = { tag: string; accent: 'blue' | 'amber' | 'green'; narrow?: boolean; items: Item[] };

	const phases: Phase[] = [
		{
			tag: 'Build + Admission',
			accent: 'blue',
			items: [
				{ name: 'Kyverno', sub: 'admission policy' },
				{ name: 'Cosign + Fulcio + Rekor', sub: 'keyless signing' },
				{ name: 'SLSA L3', sub: 'build provenance' },
				{ name: 'Trivy / Grype / Syft', sub: 'image + SBOM scan' },
				{ name: 'Semgrep', sub: 'SAST' }
			]
		},
		{
			tag: 'Runtime',
			accent: 'amber',
			items: [
				{ name: 'Falco', sub: 'syscall detection' },
				{ name: 'CrowdSec', sub: 'threat intel + bouncer' },
				{ name: 'OWASP ZAP', sub: 'DAST on promotion' }
			]
		},
		{
			tag: 'Aggregation',
			accent: 'green',
			narrow: true,
			items: [{ name: 'DefectDojo', sub: 'unified findings + SLA' }]
		}
	];
</script>

<FlowCard title="How Security Layers" badge="Defense in depth" gap="1rem">
	<div class="sec-flow">
		{#each phases as phase, i (phase.tag)}
			<div class="sec-phase flow-accent-{phase.accent}" class:narrow={phase.narrow}>
				<span class="sec-tag">{phase.tag}</span>
				<div class="sec-items">
					{#each phase.items as item (item.name)}
						<div class="sec-item">
							<span class="sec-name">{item.name}</span>
							<span class="sec-sub">{item.sub}</span>
						</div>
					{/each}
				</div>
			</div>
			{#if i < phases.length - 1}
				<FlowArrow />
			{/if}
		{/each}
	</div>

	{#snippet note()}
		Build-time gates stop unsigned or unattested images at admission. Runtime sensors watch live
		workloads. Every signal lands in DefectDojo for triage on an SLA.
	{/snippet}
</FlowCard>

<style>
	.sec-flow {
		display: flex;
		align-items: stretch;
		gap: 0.6rem;
	}

	.sec-phase {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		/* Top-edge accent reads the shared palette; wider edge uses 0.6 alpha. */
		border-top: 2px solid rgb(var(--flow-accent-rgb) / 0.6);
		background: rgba(255, 255, 255, 0.02);
	}

	.sec-phase.narrow {
		flex: 0.7;
	}

	.sec-tag {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
	}

	.sec-items {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.sec-item {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		padding: 0.4rem 0.55rem;
		border-radius: 0.4rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--border);
	}

	.sec-name {
		font-size: 0.76rem;
		font-weight: 500;
		color: var(--text);
	}

	.sec-sub {
		font-size: 0.64rem;
		color: var(--muted-fg);
	}

	@media (max-width: 768px) {
		.sec-flow {
			flex-direction: column;
		}

		.sec-phase.narrow {
			flex: 1;
		}
	}
</style>
