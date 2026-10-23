<script lang="ts">
	import StatusIcon from '$lib/components/StatusIcon.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let setKey = $state('demo');
	let setValue = $state('hello');
	let setTtl = $state('300');
	let getKey = $state('demo');
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/cache/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? 'Connected' : 'Disconnected';
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	async function vkSet() {
		try {
			const resp = await fetch(`/cache/set?key=${encodeURIComponent(setKey)}&value=${encodeURIComponent(setValue)}&ttl=${setTtl}`);
			const d = await resp.json();
			result = d.success ? `Set "${d.key}" = "${d.value}" (TTL: ${d.ttl_seconds}s)` : d.error;
			resultOk = d.success;
			resultVisible = true;
		} catch (err) {
			result = String(err);
			resultOk = false;
			resultVisible = true;
		}
	}

	async function vkGet() {
		try {
			const resp = await fetch(`/cache/get?key=${encodeURIComponent(getKey)}`);
			const d = await resp.json();
			result = d.cache_hit ? `"${d.key}" = "${d.value}"` : `Cache miss for "${d.key}"`;
			resultOk = d.cache_hit;
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
		<h3>Valkey Cache</h3>
		<span class="card-tag">Key-Value Store</span>
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
		<div class="form-cols">
			<div class="form-col">
				<span class="form-label">Set Value</span>
				<div class="input-row">
					<span class="input-label">Key</span>
					<input
						type="text"
						bind:value={setKey}
						placeholder="demo"
						class="input"
					/>
				</div>
				<div class="input-row">
					<span class="input-label">Value</span>
					<input
						type="text"
						bind:value={setValue}
						placeholder="hello"
						class="input"
					/>
				</div>
				<div class="input-row">
					<span class="input-label">TTL</span>
					<input
						type="number"
						bind:value={setTtl}
						placeholder="300"
						class="input"
					/>
					<span class="input-unit">sec</span>
				</div>
				<button
					onclick={vkSet}
					class="btn btn-primary btn-sm w-full">Set</button
				>
			</div>
			<div class="form-col">
				<span class="form-label">Get Value</span>
				<div class="input-row">
					<span class="input-label">Key</span>
					<input
						type="text"
						bind:value={getKey}
						placeholder="demo"
						class="input"
					/>
				</div>
				<button
					onclick={vkGet}
					class="btn btn-secondary btn-sm w-full">Get</button
				>
			</div>
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
		<p class="disabled-msg">Not configured - VALKEY_HOST not set</p>
	{/if}
</div>
