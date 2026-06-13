<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import FlowNode from '$lib/components/flow/FlowNode.svelte';
	import FlowArrow from '$lib/components/flow/FlowArrow.svelte';

	// Backup + data-retention flow. Three sources converge on SeaweedFS S3, with
	// retention windows and verified restore. Schedules / retention read from
	// velero/templates/schedules.yaml, the CNPG ScheduledBackup (Barman Cloud),
	// and the Kanister drill-runner CronJob.
	type Source = { name: string; sub: string; cadence: string };

	const sources: Source[] = [
		{ name: 'Velero', sub: 'cluster manifests + CSI snapshots', cadence: 'daily / weekly' },
		{ name: 'CloudNativePG', sub: 'base backup + continuous WAL', cadence: 'daily base' },
		{ name: 'Kanister', sub: 'recovery-drill verification', cadence: 'weekly' }
	];

	const retention = [
		'Tier-2 daily: 7 days',
		'Weekly + secrets: 30 days',
		'Continuous WAL: point-in-time'
	];
</script>

<FlowCard title="How Data Is Protected" badge="Backup + restore" gap="1rem">
	<div class="bk-flow">
		<div class="bk-sources">
			{#each sources as source (source.name)}
				<FlowNode label={source.name} sub={source.sub} accent="blue">
					{#snippet extra()}
						<span class="bk-cadence">{source.cadence}</span>
					{/snippet}
				</FlowNode>
			{/each}
		</div>

		<FlowArrow />

		<div class="bk-store">
			<FlowNode label="SeaweedFS S3" sub="object storage" accent="amber" emphasis />
		</div>

		<FlowArrow />

		<div class="bk-restore">
			<FlowNode label="Restore" sub="drill-verified recovery" accent="green">
				{#snippet extra()}
					<div class="bk-retention">
						{#each retention as line (line)}
							<span class="bk-chip">{line}</span>
						{/each}
					</div>
				{/snippet}
			</FlowNode>
		</div>
	</div>

	{#snippet note()}
		Three independent sources back up to one S3 store. Kanister exercises the recovery path on a
		schedule, so restores are tested, not assumed.
	{/snippet}
</FlowCard>

<style>
	.bk-flow {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.bk-sources {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		flex: 1;
	}

	.bk-store {
		flex: 0.8;
		align-self: center;
	}

	.bk-restore {
		flex: 1;
	}

	.bk-cadence {
		font-size: 0.62rem;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', 'SF Mono', monospace;
	}

	.bk-retention {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.35rem;
	}

	.bk-chip {
		font-size: 0.62rem;
		padding: 0.15rem 0.45rem;
		border-radius: 9999px;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.bk-flow {
			flex-direction: column;
			align-items: stretch;
		}

		.bk-store {
			align-self: stretch;
		}
	}
</style>
