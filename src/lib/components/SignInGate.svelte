<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { getPage } from '#lib/status.svelte.js';

	// Shows its content to a signed-in user with a verified address and a plain
	// hint to everyone else. The server enforces the same rule on every call;
	// this only keeps the page from offering what would be refused.
	let { children }: { children: Snippet } = $props();

	const { account, open } = getPage();

	// Takes the visitor to the Account tab and puts the cursor in its first field.
	async function toAccount() {
		open('betterauth');
		await tick();
		document.getElementById('sign-in-email')?.focus();
	}
</script>

{#if !account.loaded}
	<p class="disabled-msg">Checking the session...</p>
{:else if !account.session || !account.session.user.emailVerified}
	<p class="disabled-msg">
		{account.session
			? 'Confirm your email address to try it.'
			: 'Sign in to try it. Every action that writes, sends or looks something up needs a verified sign-in.'}
		<button
			class="btn btn-outline btn-sm"
			onclick={toAccount}>{account.session ? 'Open your account' : 'Sign in or create an account'}</button
		>
	</p>
{:else}
	{@render children()}
{/if}
