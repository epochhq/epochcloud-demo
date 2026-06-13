<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import FlowNode from '$lib/components/flow/FlowNode.svelte';
	import FlowArrow from '$lib/components/flow/FlowArrow.svelte';

	// Backup + data-retention flow. Four sources converge on SeaweedFS S3, with
	// retention tiers and verified restore. An independent monitor layer watches
	// freshness and exercises restores. Schedules / retention read from
	// velero/templates/schedules.yaml, the CNPG ScheduledBackup (Barman Cloud),
	// longhorn recurring jobs, and the Kanister drill-runner CronJob; the
	// monitors are the platform-data-recovery witnesses/exporters.
	type Source = { name: string; sub: string; cadence: string };

	const sources: Source[] = [
		{ name: 'Velero', sub: 'manifests + CSI snapshots', cadence: 'daily / weekly' },
		{ name: 'CloudNativePG', sub: 'base backup + continuous WAL', cadence: 'daily base' },
		{ name: 'Longhorn', sub: 'block-level snapshots', cadence: 'every 30 min' },
		{ name: 'Kanister', sub: 'recovery-drill verification', cadence: 'weekly' }
	];

	const retention = [
		'Longhorn snapshots: 30 min',
		'Tier-2 daily: 7 days',
		'Weekly + secrets: 30 days',
		'Continuous WAL: point-in-time'
	];

	const monitors = [
		'cnpg-witness',
		'velero-watcher',
		'sentinel-freshness',
		'drill-result-exporter'
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

	<div class="bk-monitors flow-accent-purple">
		<span class="bk-mon-tag">Verification monitors -> Prometheus alerts</span>
		<div class="bk-mon-items">
			{#each monitors as mon (mon)}
				<span class="bk-mon-chip">{mon}</span>
			{/each}
		</div>
	</div>

	{#snippet note()}
		Four independent sources back up to one S3 store. A monitor layer writes per-backup sentinels
		and tracks freshness, and Kanister exercises the full restore path on a schedule, so recovery is
		tested, not assumed.
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

	.bk-monitors {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.85rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--border);
		border-left: 2px solid rgb(var(--flow-accent-rgb) / 0.5);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.02);
	}

	.bk-mon-tag {
		font-size: 0.62rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		font-family: 'JetBrains Mono', 'SF Mono', monospace;
	}

	.bk-mon-items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	.bk-mon-chip {
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
