<script lang="ts">
	import StatusIcon from '#lib/components/StatusIcon.svelte';
	import { DEMOS } from '#lib/demos.js';
	import { getPage } from '#lib/status.svelte.js';

	let { activeDemo, onSelect }: { activeDemo: string; onSelect: (id: string) => void } = $props();

	const { board } = getPage();
</script>

<div class="demo-tabs">
	{#each DEMOS as tab (tab.id)}
		{@const entry = board.get(tab.id)}
		<button
			class="demo-tab"
			class:active={activeDemo === tab.id}
			onclick={() => onSelect(tab.id)}
			title={tab.noCheck ?? entry.detail}
		>
			{#if tab.statusUrl}
				<StatusIcon
					state={entry.state}
					showWord
				/>
			{:else}
				<span
					class="no-check"
					title={tab.noCheck}>In-app</span
				>
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

	.no-check {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--muted-fg);
	}
</style>
