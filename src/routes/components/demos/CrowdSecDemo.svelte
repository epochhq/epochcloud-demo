<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';

	let { enabled }: { enabled: boolean } = $props();
</script>

<div class="card">
	<div class="card-head">
		<h3>CrowdSec</h3>
		<span class="card-tag">Threat Intel</span>
	</div>
	<StatusRow id="crowdsec" />
	{#if enabled}
		<p class="card-desc">
			The check asks the CrowdSec LAPI for decisions with the bouncer key, so it passes only while the LAPI is up and accepts the key. Per-address lookups stay
			with the CrowdSec dashboard behind its login.
		</p>
	{:else}
		<p class="disabled-msg">Not configured - CROWDSEC_LAPI_URL not set</p>
	{/if}
</div>
