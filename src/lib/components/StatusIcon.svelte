<script lang="ts">
	let { ok, checked }: { ok: boolean; checked: boolean } = $props();
</script>

<span
	class="status-icon"
	class:ok
	class:checked
>
	{#if checked}
		{#if ok}
			<svg
				viewBox="0 0 16 16"
				fill="currentColor"
				><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" /></svg
			>
		{:else}
			<svg
				viewBox="0 0 16 16"
				fill="currentColor"
				><path
					d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"
				/></svg
			>
		{/if}
	{/if}
</span>

<style>
	.status-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: var(--muted-fg);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.status-icon svg {
		width: 14px;
		height: 14px;
	}

	.status-icon.checked.ok {
		color: var(--success);
	}

	.status-icon.checked:not(.ok) {
		color: var(--danger);
	}
</style>
