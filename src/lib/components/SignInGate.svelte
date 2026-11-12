<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getPage } from '#lib/status.svelte.js';

	// Shows its content to a signed-in user with a verified address and a plain
	// hint to everyone else. The server enforces the same rule on every call;
	// this only keeps the page from offering what would be refused.
	let { children }: { children: Snippet } = $props();

	const { account } = getPage();
</script>

{#if !account.loaded}
	<p class="disabled-msg">Checking the session...</p>
{:else if !account.session}
	<p class="disabled-msg">Sign in to try it. Every action that writes, sends or looks something up needs a verified sign-in.</p>
{:else if !account.session.user.emailVerified}
	<p class="disabled-msg">Verify your email address to try it: follow the link in the mail sent when you signed up.</p>
{:else}
	{@render children()}
{/if}
