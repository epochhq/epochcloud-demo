<script lang="ts">
	import StatusIcon from '$lib/components/StatusIcon.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let ip = $state('');
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/crowdsec/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? 'Connected' : `Disconnected${d.error ? ' - ' + d.error : ''}`;
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	async function checkIp() {
		if (!ip) return;
		try {
			const resp = await fetch(`/crowdsec/decisions?ip=${encodeURIComponent(ip)}`);
			const d = await resp.json();
			if (d.success) {
				result = d.blocked ? `BLOCKED - ${d.decisions.length} decision(s)` : 'Clean - no active decisions';
				resultOk = !d.blocked;
			} else {
				result = d.error;
				resultOk = false;
			}
			resultVisible = true;
		} catch (err) {
			result = String(err);
			resultOk = false;
			resultVisible = true;
		}
	}

	$effect(() => {
		checkStatus();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>CrowdSec</h3>
		<span class="card-tag">Threat Intel</span>
	</div>
	<div class="status-row">
		<button
			onclick={checkStatus}
			class="btn btn-outline btn-sm">Check Status</button
		>
		<StatusIcon
			ok={statusOk}
			checked={statusText !== 'Not checked'}
		/>
		<span class="status-text">{statusText}</span>
	</div>
	{#if enabled}
		<div class="form-row">
			<input
				type="text"
				bind:value={ip}
				placeholder="IP address"
				class="input"
			/>
			<button
				onclick={checkIp}
				class="btn btn-secondary btn-sm">Check IP</button
			>
		</div>
		{#if resultVisible}
			<p
				class="result"
				class:ok={resultOk}
				class:err={!resultOk}
			>
				{result}
			</p>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured - CROWDSEC_LAPI_URL not set</p>
	{/if}
</div>
