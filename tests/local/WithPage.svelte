<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { AccountState, StatusBoard, setPage } from '#lib/status.svelte.js';

	// Renders one component inside the page context the real page provides.
	let { component, account, children }: { component: Component<{ enabled: boolean; children?: Snippet }>; account: AccountState; children?: Snippet } =
		$props();

	// svelte-ignore state_referenced_locally
	setPage({ board: new StatusBoard(), account, open: () => {} });
	const Inner = $derived(component);
</script>

<Inner enabled={true}>{@render children?.()}</Inner>
