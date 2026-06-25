<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import FlowNode from '$lib/components/flow/FlowNode.svelte';
	import FlowArrow from '$lib/components/flow/FlowArrow.svelte';
	import type { FlowAccent } from '$lib/components/flow/FlowNode.svelte';

	// CI/CD flow. Two distinct pipelines. The application path is the Argo
	// Workflows build DAG (workflow-templates/app/main.yaml) feeding Kargo and
	// Argo Rollouts. The infrastructure path is intentionally split: Argo
	// Workflows only VALIDATES IaC on PRs (infra/main.yaml runs tofu validate +
	// the IaC scanners, never apply); the real tofu apply runs from the local
	// scripts/deploy.sh an operator invokes, and ArgoCD separately GitOps-syncs
	// the rendered manifests.
	type Step = { label: string; sub?: string; accent?: FlowAccent };
	type Lane = { tag: string; tone: 'app' | 'infra'; accent: FlowAccent; steps: Step[] };

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
				{ label: 'Cosign sign', sub: 'key + keyless (Fulcio)' },
				{ label: 'SLSA attest', sub: 'provenance v1.0' },
				{ label: 'Harbor', sub: 'signed digest' },
				{ label: 'Kargo Warehouse', sub: 'new freight' },
				{ label: 'Promote stages', sub: 'dev -> staging -> prod' },
				{ label: 'Argo Rollouts', sub: 'canary delivery' },
				{ label: 'Serving', sub: 'live traffic', accent: 'green' }
			]
		}
	];

	// Infrastructure path renders as two sub-tracks sharing one PR origin: the
	// PR-gate validation lane and the operator-driven apply + GitOps lane.
	const infraValidate: Step[] = [
		{ label: 'IaC pull request', sub: 'GitHub' },
		{ label: 'Argo Workflows', sub: 'infra-validate' },
		{ label: 'tofu validate', sub: 'syntax + config' },
		{ label: 'IaC scans', sub: 'Checkov, Trivy, Pluto, TFLint' }
	];

	const infraApply: Step[] = [
		{ label: 'merge to main', sub: 'reviewed' },
		{ label: 'bin/ deploy', sub: 'operator runs tofu apply' },
		{ label: 'Proxmox + Talos', sub: 'VMs provisioned' },
		{ label: 'Cluster', sub: 'platform updated', accent: 'green' }
	];

	const infraSync: Step[] = [
		{ label: 'ArgoCD', sub: 'GitOps reconcile' },
		{ label: 'Manifests applied', sub: 'desired state', accent: 'green' }
	];
</script>

<FlowCard title="How a Deploy Flows" badge="CI/CD">
	{#each lanes as lane (lane.tag)}
		<div class="flow-lane">
			<span class="lane-tag lane-{lane.tone}">{lane.tag}</span>
			<div class="flow-track">
				{#each lane.steps as step, i (step.label)}
					<FlowNode label={step.label} sub={step.sub} accent={step.accent ?? lane.accent} />
					{#if i < lane.steps.length - 1}
						<FlowArrow size="0.85rem" />
					{/if}
				{/each}
			</div>
		</div>
	{/each}

	<div class="flow-lane">
		<span class="lane-tag lane-infra">Infrastructure path</span>
		<div class="infra-sub">
			<span class="sub-tag">PR validation (no apply)</span>
			<div class="flow-track">
				{#each infraValidate as step, i (step.label)}
					<FlowNode label={step.label} sub={step.sub} accent={step.accent ?? 'purple'} />
					{#if i < infraValidate.length - 1}
						<FlowArrow size="0.85rem" />
					{/if}
				{/each}
			</div>
		</div>
		<div class="infra-sub">
			<span class="sub-tag">Operator apply</span>
			<div class="flow-track">
				{#each infraApply as step, i (step.label)}
					<FlowNode label={step.label} sub={step.sub} accent={step.accent ?? 'purple'} />
					{#if i < infraApply.length - 1}
						<FlowArrow size="0.85rem" />
					{/if}
				{/each}
			</div>
		</div>
		<div class="infra-sub">
			<span class="sub-tag">GitOps sync (manifests)</span>
			<div class="flow-track">
				{#each infraSync as step, i (step.label)}
					<FlowNode label={step.label} sub={step.sub} accent={step.accent ?? 'purple'} />
					{#if i < infraSync.length - 1}
						<FlowArrow size="0.85rem" />
					{/if}
				{/each}
			</div>
		</div>
	</div>

	{#snippet note()}
		Nothing reaches a cluster by hand. Application images are signed and provenance-attested before a
		deployable tag exists, and Kargo gates prod on manual approval. Argo Workflows only validates
		infrastructure on PRs; the actual tofu apply runs from the deploy script, and ArgoCD reconciles
		the rendered manifests separately.
	{/snippet}
</FlowCard>

<style>
	.flow-lane {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.flow-lane + .flow-lane {
		margin-top: 0.5rem;
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

	.infra-sub {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.sub-tag {
		font-size: 0.62rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', 'SF Mono', monospace;
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
