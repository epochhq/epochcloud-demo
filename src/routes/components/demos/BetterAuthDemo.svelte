<script lang="ts">
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled }: { enabled: boolean } = $props();

	const { account } = getPage();

	const expires = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' });
</script>

<div class="card">
	<div class="card-head">
		<h3>Account</h3>
		<span class="card-tag">BetterAuth</span>
	</div>
	<StatusRow id="betterauth" />
	{#if enabled}
		<p
			class="card-desc"
			role="status"
		>
			{#if !account.loaded}
				Looking up the session...
			{:else if account.problem}
				Session lookup failed.
			{:else if account.session}
				Signed in as <strong>{account.session.user.name || account.session.user.email}</strong> - address {account.session.user.emailVerified
					? 'verified'
					: 'not verified yet'} - session ends {expires(account.session.expiresAt)}
			{:else}
				Not signed in. Every action that writes, sends or looks something up on request needs a verified sign-in.
			{/if}
		</p>
	{:else}
		<p class="disabled-msg">Not configured - BETTERAUTH_URL not set</p>
	{/if}
</div>
