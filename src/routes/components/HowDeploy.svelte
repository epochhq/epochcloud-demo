<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import FlowNode from '$lib/components/flow/FlowNode.svelte';
	import FlowArrow from '$lib/components/flow/FlowArrow.svelte';
	import type { FlowAccent } from '$lib/components/flow/FlowNode.svelte';

	// CI/CD pipeline flow. Two paths: application builds (Argo Workflows ->
	// Harbor -> Kargo -> Rollouts) and infra changes (OpenTofu via Argo
	// Workflows). Steps mirror the app-baseline DAG in
	// workflow-templates/app/main.yaml and the per-product Kargo pipeline.
	type Lane = {
		tag: string;
		tone: 'app' | 'infra';
		accent: FlowAccent;
		steps: { label: string; sub?: string }[];
	};

	const lanes: Lane[] = [
		{
			tag: 'Application path',
			tone: 'app',
			accent: 'blue',
			steps: [
				{ label: 'git push', sub: 'GitHub' },
				{ label: 'Argo Events', sub: 'webhook sensor' },
				{ label: 'Pre-build scans', sub: 'Semgrep, TruffleHog, OSV' },
				{ label: 'Buildah', sub: 'build + push image' },
				{ label: 'Post-build scans', sub: 'Trivy, Syft, Grype' },
				{ label: 'Cosign sign', sub: 'keyless signature' },
				{ label: 'SLSA attest', sub: 'provenance v1.0' },
				{ label: 'Harbor', sub: 'signed digest' },
				{ label: 'Kargo Warehouse', sub: 'new freight' },
				{ label: 'Promote stages', sub: 'dev -> staging -> prod' },
				{ label: 'Argo Rollouts', sub: 'progressive delivery' },
				{ label: 'Serving', sub: 'live traffic' }
			]
		},
		{
			tag: 'Infrastructure path',
			tone: 'infra',
			accent: 'purple',
			steps: [
				{ label: 'git push', sub: 'IaC change' },
				{ label: 'Argo Workflows', sub: 'OpenTofu plan + apply' },
				{ label: 'ArgoCD sync', sub: 'reconcile cluster' },
				{ label: 'Serving', sub: 'platform updated' }
			]
		}
	];
</script>

<FlowCard title="How a Deploy Flows" badge="CI/CD">
	{#each lanes as lane (lane.tag)}
		<div class="flow-lane">
			<span class="lane-tag lane-{lane.tone}">{lane.tag}</span>
			<div class="flow-track">
				{#each lane.steps as step, i (step.label)}
					<FlowNode label={step.label} sub={step.sub} accent={lane.accent} />
					{#if i < lane.steps.length - 1}
						<FlowArrow size="0.85rem" />
					{/if}
				{/each}
			</div>
		</div>
	{/each}

	{#snippet note()}
		Nothing reaches a cluster by hand. Every image is signed and provenance-attested before a
		deployable tag exists, and Kargo gates prod promotion on manual approval.
	{/snippet}
</FlowCard>

<style>
	.flow-lane {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.lane-tag {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.15rem 0.55rem;
		border-radius: 9999px;
		align-self: flex-start;
		border: 1px solid var(--border);
	}

	.lane-app {
		color: #60a5fa;
		background: rgba(59, 130, 246, 0.1);
		border-color: rgba(59, 130, 246, 0.25);
	}

	.lane-infra {
		color: #a78bfa;
		background: rgba(139, 92, 246, 0.1);
		border-color: rgba(139, 92, 246, 0.25);
	}

	.flow-track {
		display: flex;
		flex-wrap: wrap;
		align-items: stretch;
		gap: 0.4rem;
	}

	@media (max-width: 768px) {
		.flow-track {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
