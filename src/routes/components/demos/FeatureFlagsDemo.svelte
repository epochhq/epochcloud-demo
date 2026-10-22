<script lang="ts">
	import StatusIcon from '$lib/components/StatusIcon.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let flagName = $state('maintenance-mode');
	let userId = $state('user-123');

	interface FfEvalResult {
		flag: string;
		value: unknown;
		variationType?: string;
		reason?: string;
		failed?: boolean;
		error?: string;
	}

	let evalResult: FfEvalResult | null = $state(null);
	let allFlags: Record<string, { value: unknown; variationType?: string; reason?: string }> | null = $state(null);
	let allUser = $state('user-456');
	let error = $state('');

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/features/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? `Connected - ${d.flags_available || 0} flags` : `Disconnected${d.error ? ' - ' + d.error : ''}`;
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	async function evaluate() {
		error = '';
		evalResult = null;
		try {
			const resp = await fetch(`/features/evaluate?flag=${encodeURIComponent(flagName)}&user=${encodeURIComponent(userId)}`);
			const d = await resp.json();
			if (d.error) {
				error = d.error;
			} else {
				evalResult = d;
			}
		} catch (err) {
			error = `Error: ${err}`;
		}
	}

	async function evalAll() {
		error = '';
		allFlags = null;
		try {
			const resp = await fetch(`/features/all?user=${encodeURIComponent(allUser)}`);
			const d = await resp.json();
			if (d.error) {
				error = d.error;
			} else {
				allFlags = d;
			}
		} catch (err) {
			error = `Error: ${err}`;
		}
	}

	$effect(() => {
		checkStatus();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>Feature Flags</h3>
		<span class="card-tag">GO Feature Flag</span>
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
		<div class="ff-sections">
			<div class="ff-section">
				<span class="form-label">Evaluate Flag</span>
				<select
					bind:value={flagName}
					class="input"
				>
					<option value="maintenance-mode">maintenance-mode</option>
					<option value="new-dashboard-layout">new-dashboard-layout</option>
					<option value="dark-mode">dark-mode</option>
					<option value="welcome-banner">welcome-banner</option>
				</select>
				<div class="ff-user-row">
					<input
						type="text"
						bind:value={userId}
						placeholder="User ID"
						class="input"
					/>
					<div class="ff-user-presets">
						{#each ['user-123', 'admin', 'beta-tester', 'anonymous'] as preset (preset)}
							<button
								class="ff-preset"
								class:active={userId === preset}
								onclick={() => (userId = preset)}>{preset}</button
							>
						{/each}
					</div>
				</div>
				<button
					onclick={evaluate}
					class="btn btn-primary btn-sm w-full">Evaluate</button
				>
				{#if evalResult}
					<div class="ff-result-card">
						<div class="ff-result-header">
							<span class="ff-flag-name">{evalResult.flag}</span>
							<span
								class="ff-value-badge"
								class:on={evalResult.value === true}
								class:off={evalResult.value === false}
							>
								{#if typeof evalResult.value === 'boolean'}
									{evalResult.value ? 'ON' : 'OFF'}
								{:else}
									{JSON.stringify(evalResult.value)}
								{/if}
							</span>
						</div>
						{#if evalResult.variationType}
							<div class="ff-result-meta">
								<span>Variation: <strong>{evalResult.variationType}</strong></span>
								{#if evalResult.reason}<span>Reason: {evalResult.reason}</span>{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="ff-section">
				<span class="form-label">All Flags</span>
				<div class="ff-user-row">
					<input
						type="text"
						bind:value={allUser}
						placeholder="User ID"
						class="input"
					/>
					<div class="ff-user-presets">
						{#each ['user-456', 'admin', 'new-user'] as preset (preset)}
							<button
								class="ff-preset"
								class:active={allUser === preset}
								onclick={() => (allUser = preset)}>{preset}</button
							>
						{/each}
					</div>
				</div>
				<button
					onclick={evalAll}
					class="btn btn-secondary btn-sm w-full">Evaluate All</button
				>
				{#if allFlags}
					<div class="ff-flags-table">
						{#each Object.entries(allFlags) as [name, flag] (name)}
							<div class="ff-flag-row">
								<span class="ff-flag-name">{name}</span>
								<span
									class="ff-value-badge"
									class:on={flag.value === true}
									class:off={flag.value === false}
								>
									{#if typeof flag.value === 'boolean'}
										{flag.value ? 'ON' : 'OFF'}
									{:else}
										{JSON.stringify(flag.value)}
									{/if}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
		{#if error}
			<pre class="result-pre err">{error}</pre>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured - GOFEATUREFLAG_URL not set</p>
	{/if}
</div>

<style>
	.ff-sections {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.ff-section {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.ff-user-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.ff-user-presets {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.ff-preset {
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text-secondary);
		cursor: pointer;
		font-family: inherit;
	}

	.ff-preset.active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.ff-result-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.5rem;
	}

	.ff-result-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.ff-result-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		margin-top: 0.375rem;
		font-size: 0.7rem;
		color: var(--text-secondary);
	}

	.ff-value-badge {
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		background: var(--border);
		color: var(--text-secondary);
	}

	.ff-value-badge.on {
		background: var(--ok);
		color: #fff;
	}

	.ff-value-badge.off {
		background: var(--danger);
		color: #fff;
	}

	.ff-flag-name {
		font-size: 0.75rem;
		font-family: 'SF Mono', monospace;
	}

	.ff-flags-table {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.ff-flag-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0.5rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
</style>
