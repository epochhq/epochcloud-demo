<script lang="ts">
	import SignInGate from '#lib/components/SignInGate.svelte';
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { act, form } from '#lib/check.js';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled }: { enabled: boolean } = $props();

	const { account } = getPage();

	let status = $state('');
	let isError = $state(false);

	// The server mails the signed-in user's own verified address; nothing is
	// sent from this page but the request itself.
	async function sendEmail() {
		status = 'Sending...';
		isError = false;
		const r = await act('/email/send', form());
		status = r.ok ? String(r.data!.message) : r.detail;
		isError = !r.ok;
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Email</h3>
		<span class="card-tag">SMTP</span>
	</div>
	<StatusRow id="email" />
	{#if enabled}
		<SignInGate>
			<p class="card-desc">The test mail goes to your own verified address, {account.session?.user.email}.</p>
			<button
				onclick={sendEmail}
				class="btn btn-primary btn-sm">Send me a test email</button
			>
			{#if status}
				<p
					class="result"
					class:ok={!isError}
					class:err={isError}
				>
					{status}
				</p>
			{/if}
		</SignInGate>
	{:else}
		<p class="disabled-msg">Not configured - SMTP_HOST not set</p>
	{/if}
</div>
