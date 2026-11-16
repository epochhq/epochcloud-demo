<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { act, form } from '#lib/check.js';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled }: { enabled: boolean } = $props();

	const { account } = getPage();

	let message = $state('');
	let isError = $state(false);
	let busy = $state(false);

	// dateStyle and timeStyle cannot be combined with timeZoneName (ECMA-402), so the fields are named one by one.
	const expires = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
	// The submitted form's fields; the page handles the submit itself.
	const fieldsOf = (event: { preventDefault(): void; currentTarget: ConstructorParameters<typeof globalThis.FormData>[0] }) => {
		event.preventDefault();
		return Object.fromEntries(new globalThis.FormData(event.currentTarget)) as Record<string, string>;
	};
	type Submit = Parameters<typeof fieldsOf>[0];
	const unconfirmed = $derived(account.session ? !account.session.user.emailVerified : account.pending !== '');

	async function post(url: string, fields: Record<string, string>) {
		busy = true;
		const result = await act(url, form(fields));
		busy = false;
		message = result.ok ? String(result.data?.message ?? '') : result.detail;
		isError = !result.ok;
		return result;
	}

	async function signIn(event: Submit) {
		const fields = fieldsOf(event);
		const result = await post('/auth/sign-in', fields);
		if (result.data?.reason === 'unverified') account.pending = fields.email ?? '';
		if (result.ok) await account.refresh();
	}

	async function signUp(event: Submit) {
		const fields = fieldsOf(event);
		if ((await post('/auth/sign-up', fields)).ok) account.pending = fields.email ?? '';
	}

	async function signOut() {
		if ((await post('/auth/sign-out', {})).ok) {
			account.pending = '';
			await account.refresh();
		}
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Account</h3>
		<span class="card-tag">BetterAuth</span>
	</div>
	<StatusRow id="betterauth" />
	{#if !enabled}
		<p class="disabled-msg">Not configured - BETTERAUTH_URL not set</p>
	{:else if !account.loaded}
		<p class="card-desc">Looking up the session...</p>
	{:else if account.problem}
		<p class="card-desc">Session lookup failed: {account.problem}</p>
	{:else if account.session && !unconfirmed}
		<p class="card-desc">
			Signed in as <strong>{account.session.user.name || account.session.user.email}</strong> ({account.session.user.email}). The session ends {expires(
				account.session.expiresAt
			)}.
		</p>
		<button
			class="btn btn-outline btn-sm"
			disabled={busy}
			onclick={signOut}>Sign out</button
		>
	{:else if unconfirmed}
		{@const email = account.session?.user.email ?? account.pending}
		<p class="card-desc">
			Confirm <strong>{email}</strong>: open the link in the mail we sent to it. The link signs you in. No mail? Check the spam folder, or have it sent again.
		</p>
		<div class="btn-row">
			<button
				class="btn btn-primary btn-sm"
				disabled={busy}
				onclick={() => post('/auth/resend', { email })}>Send the mail again</button
			>
			<button
				class="btn btn-ghost btn-sm"
				disabled={busy}
				onclick={() => (account.session ? signOut() : (account.pending = ''))}>Use another address</button
			>
		</div>
	{:else}
		<p class="card-desc">Sign in to try the live demos. A new account needs its email address confirmed first.</p>
		<div class="form-cols">
			<form
				class="form-col"
				onsubmit={signIn}
			>
				<span class="form-label">Sign in</span>
				<label
					class="input-label"
					for="sign-in-email">Email</label
				>
				<input
					id="sign-in-email"
					name="email"
					type="email"
					autocomplete="username"
					required
					class="input"
				/>
				<label
					class="input-label"
					for="current-password">Password</label
				>
				<input
					id="current-password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="input"
				/>
				<button
					class="btn btn-primary btn-sm w-full"
					disabled={busy}>Sign in</button
				>
			</form>
			<form
				class="form-col"
				onsubmit={signUp}
			>
				<span class="form-label">Create an account</span>
				<label
					class="input-label"
					for="sign-up-name">Name</label
				>
				<input
					id="sign-up-name"
					name="name"
					autocomplete="name"
					class="input"
				/>
				<label
					class="input-label"
					for="sign-up-email">Email</label
				>
				<input
					id="sign-up-email"
					name="email"
					type="email"
					autocomplete="email"
					required
					class="input"
				/>
				<label
					class="input-label"
					for="new-password">Password (8 to 128 characters)</label
				>
				<input
					id="new-password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="8"
					maxlength="128"
					required
					class="input"
				/>
				<button
					class="btn btn-secondary btn-sm w-full"
					disabled={busy}>Create account</button
				>
			</form>
		</div>
	{/if}
	{#if message}
		<p
			class="result"
			class:ok={!isError}
			class:err={isError}
			role="status"
		>
			{message}
		</p>
	{/if}
</div>
