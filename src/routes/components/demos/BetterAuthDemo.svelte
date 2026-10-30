<script lang="ts">
	import StatusIcon from '#lib/components/StatusIcon.svelte';

	let { enabled }: { enabled: boolean } = $props();

	let statusText = $state('Not checked');
	let statusOk = $state(false);
	let result = $state('');
	let resultOk = $state(false);
	let resultVisible = $state(false);
	let regName = $state('');
	let regEmail = $state('');
	let regPass = $state('');
	let loginEmail = $state('');
	let loginPass = $state('');

	async function checkStatus() {
		statusText = 'Checking...';
		try {
			const resp = await fetch('/auth/status');
			const d = await resp.json();
			statusOk = d.connected;
			statusText = d.connected ? `Connected - ${d.health}` : `Disconnected${d.error ? ' - ' + d.error : ''}`;
		} catch (err) {
			statusText = `Error: ${err}`;
			statusOk = false;
		}
	}

	function showResult(msg: string, ok: boolean) {
		result = msg;
		resultOk = ok;
		resultVisible = true;
	}

	async function register() {
		try {
			const resp = await fetch('/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: regName, email: regEmail, password: regPass })
			});
			const d = await resp.json();
			showResult(d.message, d.success);
		} catch (err) {
			showResult(`Error: ${err}`, false);
		}
	}

	async function login() {
		try {
			const resp = await fetch('/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: loginEmail, password: loginPass })
			});
			const d = await resp.json();
			showResult(d.message, d.success);
		} catch (err) {
			showResult(`Error: ${err}`, false);
		}
	}

	async function session() {
		try {
			const resp = await fetch('/auth/session');
			const d = await resp.json();
			showResult(d.message + (d.data ? ' - ' + JSON.stringify(d.data) : ''), d.success);
		} catch (err) {
			showResult(`Error: ${err}`, false);
		}
	}

	$effect(() => {
		checkStatus();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>BetterAuth</h3>
		<span class="card-tag">App Auth</span>
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
				<span class="form-label">Register</span>
				<input
					type="text"
					bind:value={regName}
					placeholder="Name"
					class="input"
				/>
				<input
					type="email"
					bind:value={regEmail}
					placeholder="Email"
					class="input"
				/>
				<input
					type="password"
					bind:value={regPass}
					placeholder="Password"
					class="input"
				/>
				<button
					onclick={register}
					class="btn btn-primary btn-sm w-full">Register</button
				>
			</div>
			<div class="form-col">
				<span class="form-label">Login</span>
				<input
					type="email"
					bind:value={loginEmail}
					placeholder="Email"
					class="input"
				/>
				<input
					type="password"
					bind:value={loginPass}
					placeholder="Password"
					class="input"
				/>
				<button
					onclick={login}
					class="btn btn-secondary btn-sm w-full">Login</button
				>
			</div>
		</div>
		<button
			onclick={session}
			class="btn btn-ghost w-full">Validate Session</button
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
		<p class="disabled-msg">Not configured - BETTERAUTH_URL not set</p>
	{/if}
</div>
