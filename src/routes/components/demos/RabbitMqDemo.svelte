<script lang="ts">
	import SignInGate from '#lib/components/SignInGate.svelte';
	import { act, form } from '#lib/check.js';
	import StatusRow from '#lib/components/StatusRow.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let message = $state('');
	let batchCount = $state('5');
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);
	let consumed: Array<{ message: string; timestamp: string }> = $state([]);

	async function publish() {
		const msg = message || undefined;
		const count = parseInt(batchCount) || 1;
		const results: string[] = [];

		for (let i = 0; i < count; i++) {
			const r = await act('/rabbitmq/publish', form(msg ? { message: msg + (count > 1 ? ` #${i + 1}` : '') } : {}));
			if (!r.ok) results.push(`#${i + 1}: ${r.detail}`);
		}

		if (results.length === 0) {
			result = `Published ${count} message${count > 1 ? 's' : ''}`;
			resultOk = true;
		} else {
			result = `Errors: ${results.join(', ')}`;
			resultOk = false;
		}
		resultVisible = true;
	}

	async function consume() {
		const r = await act('/rabbitmq/consume');
		if (r.ok) {
			const d = r.data!;
			consumed = (d.messages as typeof consumed) || [];
			const consumers = Number(d.consumerCount ?? 0);
			result = `${d.count} message${d.count !== 1 ? 's' : ''} in queue, ${consumers} consumer${consumers !== 1 ? 's' : ''}`;
			resultOk = true;
		} else {
			result = r.detail;
			resultOk = false;
		}
		resultVisible = true;
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>RabbitMQ</h3>
		<span class="card-tag">Message Queue</span>
	</div>
	<StatusRow id="rabbitmq" />
	{#if enabled}
		<SignInGate>
			<div class="form-cols">
				<div class="form-col">
					<span class="form-label">Publish</span>
					<div class="input-row">
						<span class="input-label">Message</span>
						<input
							type="text"
							bind:value={message}
							placeholder="optional"
							class="input"
						/>
					</div>
					<div class="input-row">
						<span class="input-label">Count</span>
						<input
							type="number"
							bind:value={batchCount}
							min="1"
							max="50"
							class="input input-sm"
							style="max-width:70px"
						/>
					</div>
					<button
						onclick={publish}
						class="btn btn-primary btn-sm w-full">Publish</button
					>
				</div>
				<div class="form-col">
					<span class="form-label">Consume</span>
					<button
						onclick={consume}
						class="btn btn-outline btn-sm w-full">Check Buffer</button
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
			{#if consumed.length > 0}
				<div class="consumed-list">
					{#each consumed.slice(0, 5) as msg (msg.timestamp)}
						<div class="consumed-item">
							<span class="consumed-msg">{msg.message}</span>
							<span class="consumed-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
						</div>
					{/each}
				</div>
			{/if}
		</SignInGate>
	{:else}
		<p class="disabled-msg">Not configured - RABBITMQ_HOST not set</p>
	{/if}
</div>

<style>
	.consumed-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.consumed-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.6rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 0.375rem;
		font-size: 0.75rem;
	}

	.consumed-msg {
		color: var(--text-secondary);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-right: 0.5rem;
	}

	.consumed-time {
		color: var(--muted-fg);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		flex-shrink: 0;
	}
</style>
