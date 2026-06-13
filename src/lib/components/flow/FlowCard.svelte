<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		badge,
		gap = '1.25rem',
		children,
		note
	}: {
		title: string;
		badge: string;
		gap?: string;
		children: Snippet;
		note?: Snippet;
	} = $props();
</script>

<section class="section">
	<div class="section-head">
		<h2 class="section-title">{title}</h2>
		<span class="count-badge">{badge}</span>
	</div>

	<div class="flow-card" style:gap>
		{@render children()}
		{#if note}
			<p class="flow-note">{@render note()}</p>
		{/if}
	</div>
</section>

<style>
	.flow-card {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
	}

	.flow-note {
		font-size: 0.75rem;
		color: var(--muted-fg);
		line-height: 1.5;
		margin: 0;
		padding-top: 0.25rem;
		border-top: 1px solid var(--border);
	}
</style>
