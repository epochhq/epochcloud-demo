<script lang="ts">
	// Directional connector between flow nodes. Rotates to vertical on narrow
	// viewports so stacked diagrams still read top-to-bottom.
	let { size = '1rem' }: { size?: string } = $props();
</script>

<span class="flow-arrow" style:font-size={size} aria-hidden="true">&rarr;</span>

<style>
	.flow-arrow {
		display: flex;
		align-items: center;
		color: var(--muted-fg);
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.flow-arrow {
			transform: rotate(90deg);
			align-self: center;
		}
	}
</style>
