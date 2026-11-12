<script lang="ts">
	import { onMount } from 'svelte';
	import StatusIcon from './StatusIcon.svelte';
	import { WORDS } from '#lib/check.js';
	import { demo } from '#lib/demos.js';
	import { getPage } from '#lib/status.svelte.js';

	// The check row every integration panel shows: a button, the state as icon
	// plus word, and what the check found. Running it also updates the tab pill,
	// because both read the same entry on the board.
	let { id }: { id: string } = $props();

	const { board } = getPage();
	const entry = $derived(board.get(id));
	const tab = $derived(demo(id));
	const run = () => (tab.statusUrl ? board.run(id, tab.statusUrl, { describe: tab.describe }) : Promise.resolve());

	onMount(() => {
		if (entry.state === 'unchecked') void run();
	});
</script>

<div class="status-row">
	<button
		onclick={run}
		class="btn btn-outline btn-sm"
		disabled={entry.state === 'checking'}>Check Status</button
	>
	<StatusIcon state={entry.state} />
	<span
		class="status-text"
		role="status"
	>
		<strong>{WORDS[entry.state]}</strong>{entry.detail ? ` - ${entry.detail}` : ''}
	</span>
</div>
