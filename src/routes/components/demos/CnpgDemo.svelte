<script lang="ts">
	import SignInGate from '#lib/components/SignInGate.svelte';
	import { act, form } from '#lib/check.js';
	import StatusRow from '#lib/components/StatusRow.svelte';

	let { enabled, environment }: { enabled: boolean; environment: string } = $props();

	let newItemText = $state('');
	let items = $state<Array<{ id: number; text: string; originated_in: string; created_at: string }>>([]);
	let itemsLoaded = $state(false);
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);

	function show(message: string, ok: boolean) {
		result = message;
		resultOk = ok;
		resultVisible = true;
	}

	async function loadItems() {
		const r = await act('/cnpg/items');
		if (r.ok) {
			items = r.data!.items as typeof items;
			itemsLoaded = true;
		} else {
			show(r.detail, false);
		}
	}

	async function createItem() {
		const text = newItemText.trim();
		if (!text) return;
		const r = await act('/cnpg/items', form({ text }));
		if (r.ok) {
			newItemText = '';
			show(`Created #${(r.data!.item as { id: number }).id}`, true);
			await loadItems();
		} else {
			show(r.detail, false);
		}
	}

	async function deleteItem(id: number) {
		const r = await act('/cnpg/items/delete', form({ id: String(id) }));
		if (r.ok) {
			const deleted = r.data!.deleted === true;
			show(deleted ? `Deleted #${id}` : `#${id} not found`, deleted);
			await loadItems();
		} else {
			show(r.detail, false);
		}
	}

	$effect(() => {
		if (enabled) loadItems();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>CNPG</h3>
		<span class="card-tag">Database</span>
	</div>
	<StatusRow id="cnpg" />
	<span class="env-pill">env: {environment}</span>
	{#if enabled}
		<SignInGate>
			<div class="form-cols">
				<div class="form-col">
					<span class="form-label">Create item</span>
					<div class="input-row">
						<span class="input-label">Text</span>
						<input
							type="text"
							bind:value={newItemText}
							placeholder="Hello from {environment}"
							class="input"
							onkeydown={(e) => e.key === 'Enter' && createItem()}
						/>
					</div>
					<button
						onclick={createItem}
						class="btn btn-primary btn-sm w-full">Create</button
					>
				</div>
				<div class="form-col">
					<span class="form-label">Items</span>
					<button
						onclick={loadItems}
						class="btn btn-secondary btn-sm w-full">Refresh</button
					>
					<p class="hint">
						When env-isolation lands, prod / staging / dev each have their own DB; PR previews share the dev DB. Compare these lists across envs to see
						isolation.
					</p>
				</div>
			</div>
			{#if itemsLoaded}
				{#if items.length === 0}
					<p class="empty">No items yet - create one above.</p>
				{:else}
					<ul class="items">
						{#each items as item (item.id)}
							<li class="item">
								<span class="item-id">#{item.id}</span>
								<span class="item-text">{item.text}</span>
								<span
									class="item-origin"
									title="originated_in column"
								>
									{item.originated_in}
								</span>
								<span class="item-time">{new Date(item.created_at).toLocaleString()}</span>
								<button
									onclick={() => deleteItem(item.id)}
									class="btn btn-outline btn-xs"
									aria-label="Delete item {item.id}"
								>
									Delete
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
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
		<p class="disabled-msg">Not configured - DATABASE_URL not set</p>
	{/if}
</div>

<style>
	.env-pill {
		font-size: 0.7rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
		color: var(--muted-fg);
		border: 1px solid var(--border);
		margin-left: auto;
	}

	.hint {
		font-size: 0.75rem;
		color: var(--muted-fg);
		margin-top: 0.5rem;
		line-height: 1.4;
	}

	.empty {
		font-size: 0.85rem;
		color: var(--muted-fg);
		margin-top: 0.75rem;
		text-align: center;
		padding: 1rem;
	}

	.items {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.item {
		display: grid;
		grid-template-columns: auto 1fr auto auto auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 0.375rem;
		font-size: 0.8rem;
	}

	.item-id {
		font-family: ui-monospace, monospace;
		color: var(--muted-fg);
		font-size: 0.7rem;
	}

	.item-text {
		font-weight: 500;
	}

	.item-origin {
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 9999px;
		background: var(--surface-subtle, rgba(255, 255, 255, 0.05));
		color: var(--muted-fg);
		font-family: ui-monospace, monospace;
	}

	.item-time {
		font-size: 0.7rem;
		color: var(--muted-fg);
		font-family: ui-monospace, monospace;
	}

	.btn-xs {
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
	}
</style>
