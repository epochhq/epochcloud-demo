<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';

	let { enabled }: { enabled: boolean } = $props();
</script>

<div class="card">
	<div class="card-head">
		<h3>Chaos</h3>
		<span class="card-tag">Resilience</span>
	</div>
	<StatusRow id="chaos" />
	{#if enabled}
		<p class="card-desc">
			In the dev environment only, the app owns a LitmusChaos experiment that deletes one of its own pods gracefully every few hours, outside the backup window.
			The check reads the result from the platform's chaos exporter and does not take Litmus's word alone: a replacement pod must really have been created after
			the injection, every probe request must have been answered, and the app's own request metrics must show an error share within its limit. No result yet, or
			one older than twice the schedule, reads as not running.
		</p>
	{:else}
		<p class="disabled-msg">Not running in this environment: the experiment runs in dev only</p>
	{/if}
</div>
