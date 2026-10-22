<script lang="ts">
	let {
		activeDemo,
		statuses,
		onSelect
	}: {
		activeDemo: string;
		statuses: Record<string, { ok: boolean; checked: boolean }>;
		onSelect: (id: string) => void;
	} = $props();

	const tabs = [
		{ id: 'rabbitmq', label: 'RabbitMQ', statusKey: 'rabbitmq' },
		{ id: 'valkey', label: 'Valkey', statusKey: 'valkey' },
		{ id: 'cnpg', label: 'CNPG', statusKey: 'cnpg' },
		{ id: 'email', label: 'Email', statusKey: null },
		{ id: 'betterauth', label: 'BetterAuth', statusKey: 'betterauth' },
		{ id: 'crowdsec', label: 'CrowdSec', statusKey: 'crowdsec' },
		{ id: 'defectdojo', label: 'DefectDojo', statusKey: 'defectdojo' },
		{ id: 'prometheus', label: 'Prometheus', statusKey: null },
		{ id: 'linkerd', label: 'Linkerd', statusKey: null },
		{ id: 'chaos', label: 'Chaos Testing', statusKey: null },
		{ id: 'featureflags', label: 'Feature Flags', statusKey: 'featureflags' },
		{ id: 'ntfy', label: 'ntfy', statusKey: 'ntfy' },
		{ id: 'knative', label: 'Knative', statusKey: null }
	];
</script>

<div class="demo-tabs">
	{#each tabs as tab (tab.id)}
		<button
			class="demo-tab"
			class:active={activeDemo === tab.id}
			onclick={() => onSelect(tab.id)}
		>
			{#if tab.statusKey && statuses[tab.statusKey]?.checked}
				<span
					class="tab-dot"
					class:ok={statuses[tab.statusKey]?.ok}
				></span>
			{/if}
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.demo-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-bottom: 1rem;
	}

	.demo-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--muted-fg);
		transition: all 0.15s ease;
		font-family: inherit;
		white-space: nowrap;
	}

	.demo-tab:hover {
		color: var(--text-secondary);
		border-color: var(--border-hover);
		background: rgba(255, 255, 255, 0.03);
	}

	.demo-tab.active {
		color: var(--text);
		background: rgba(255, 255, 255, 0.08);
		border-color: var(--border-hover);
	}

	.tab-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--danger);
		flex-shrink: 0;
	}

	.tab-dot.ok {
		background: var(--success);
	}
</style>
