<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled }: { enabled: boolean } = $props();

	const { board } = getPage();
	const refusals = $derived((board.get('crowdsec').data?.refusals as { total24h: number; lastAgoSeconds: number | null } | null | undefined) ?? null);
	const ago = (seconds: number) => (seconds < 3600 ? `${Math.max(1, Math.round(seconds / 60))} minutes` : `${Math.round(seconds / 3600)} hours`);
</script>

<div class="card">
	<div class="card-head">
		<h3>CrowdSec</h3>
		<span class="card-tag">Edge protection</span>
	</div>
	<StatusRow id="crowdsec" />
	{#if enabled}
		<p class="card-desc">
			Each check sends this app's own public address two requests from inside the cluster: a canary that carries a header the edge's CrowdSec layer refuses, and
			the same request without it. It passes only when the canary is refused with the CrowdSec remediation header and the control is served. A canary that is
			served fails the check: that is what an outage of the inspection engine looks like, because the edge lets traffic through when it is down. The test says
			nothing about Cloudflare's own protections.
		</p>
		{#if refusals}
			<p class="card-desc">
				{refusals.total24h} refusal{refusals.total24h === 1 ? '' : 's'} of this host by the edge in 24 hours, this check's canary included{#if refusals.lastAgoSeconds !== null},
					the newest {ago(refusals.lastAgoSeconds)} ago{/if}.
			</p>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured: this environment has no public address to test</p>
	{/if}
</div>
