<script lang="ts">
	import SignInGate from '#lib/components/SignInGate.svelte';
	import { act, form } from '#lib/check.js';
	import StatusRow from '#lib/components/StatusRow.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let setKey = $state('demo');
	let setValue = $state('hello');
	let setTtl = $state('300');
	let getKey = $state('demo');
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);

	async function vkSet() {
		const r = await act('/cache/set', form({ key: setKey, value: setValue, ttl: setTtl }));
		result = r.ok ? `Set "${r.data!.key}" = "${r.data!.value}" (TTL: ${r.data!.ttl_seconds}s)` : r.detail;
		resultOk = r.ok;
		resultVisible = true;
	}

	async function vkGet() {
		const r = await act(`/cache/get?key=${encodeURIComponent(getKey)}`);
		const hit = r.ok && r.data!.cache_hit === true;
		result = !r.ok ? r.detail : hit ? `"${r.data!.key}" = "${r.data!.value}"` : `Cache miss for "${r.data!.key}"`;
		resultOk = hit;
		resultVisible = true;
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Valkey Cache</h3>
		<span class="card-tag">Key-Value Store</span>
	</div>
	<StatusRow id="valkey" />
	{#if enabled}
		<SignInGate>
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
		</SignInGate>
	{:else}
		<p class="disabled-msg">Not configured - VALKEY_HOST not set</p>
	{/if}
</div>
