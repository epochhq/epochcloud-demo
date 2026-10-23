<script lang="ts">
	import StatusIcon from '$lib/components/StatusIcon.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let topic = $state('epochcloud-demo');
	let message = $state('');
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/ntfy/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? 'Connected' : `Disconnected${d.error ? ' - ' + d.error : ''}`;
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	async function send() {
		try {
			const resp = await fetch('/ntfy/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					topic,
					message: message || `Hello from EpochCloud at ${new Date().toLocaleTimeString()}`
				})
			});
			const d = await resp.json();
			result = d.success ? `Sent to "${d.topic}"` : d.error;
			resultOk = d.success;
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
		<h3>ntfy</h3>
		<span class="card-tag">Push Notifications</span>
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
		<input
			type="text"
			bind:value={topic}
			placeholder="Topic"
			class="input"
		/>
		<input
			type="text"
			bind:value={message}
			placeholder="Message (optional)"
			class="input"
		/>
		<button
			onclick={send}
			class="btn btn-primary btn-sm w-full">Send Notification</button
		>
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
		<p class="disabled-msg">Not configured - NTFY_URL not set</p>
	{/if}
</div>
