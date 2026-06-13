<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Accent maps to the shared token palette, not per-diagram semantics. */
	export type FlowAccent = 'blue' | 'purple' | 'amber' | 'green';

	let {
		label,
		sub,
		accent = 'blue',
		emphasis = false,
		extra
	}: {
		label: string;
		sub?: string;
		accent?: FlowAccent;
		emphasis?: boolean;
		extra?: Snippet;
	} = $props();
</script>

<div class="flow-node flow-accent-{accent}" class:emphasis>
	<span class="flow-node-label">{label}</span>
	{#if sub}<span class="flow-node-sub">{sub}</span>{/if}
	{#if extra}{@render extra()}{/if}
</div>

<style>
	.flow-node {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.5rem 0.75rem;
		min-width: 0;
		border: 1px solid var(--border);
		border-left: 2px solid rgb(var(--flow-accent-rgb) / 0.5);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.02);
	}

	.flow-node-label {
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text);
		white-space: nowrap;
	}

	.emphasis .flow-node-label {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.flow-node-sub {
		font-size: 0.65rem;
		color: var(--muted-fg);
		white-space: nowrap;
	}

	@media (max-width: 768px) {
		.flow-node-label,
		.flow-node-sub {
			white-space: normal;
		}
	}
</style>
