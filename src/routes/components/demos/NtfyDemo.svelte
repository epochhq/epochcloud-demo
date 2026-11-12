<script lang="ts">
	import SignInGate from '#lib/components/SignInGate.svelte';
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { act, form } from '#lib/check.js';
	import { getPage } from '#lib/status.svelte.js';

	let { enabled, domain }: { enabled: boolean; domain: string } = $props();

	const { account } = getPage();

	let topic = $state('');
	let result = $state('');
	let resultOk = $state(false);

	// The topic is the one stored in the signed-in user's own row; the page can
	// show it and subscribe to it, but never chooses it.
	async function loadTopic() {
		const r = await act('/ntfy/topic');
		if (r.ok) topic = String(r.data!.topic);
		else {
			result = r.detail;
			resultOk = false;
		}
	}

	async function send() {
		const r = await act('/ntfy/send', form());
		result = r.ok ? `Sent to your topic` : r.detail;
		resultOk = r.ok;
		if (r.ok) topic = String(r.data!.topic);
	}

	$effect(() => {
		if (account.session?.user.emailVerified) void loadTopic();
	});
</script>

<div class="card">
	<div class="card-head">
		<h3>ntfy</h3>
		<span class="card-tag">Push Notifications</span>
	</div>
	<StatusRow id="ntfy" />
	{#if enabled}
		<SignInGate>
			{#if topic}
				<p class="card-desc">
					Your private topic is <code>{topic}</code>. Subscribe in the ntfy app or at
					<a
						href="https://ntfy.{domain}/{topic}"
						target="_blank"
						rel="noopener">ntfy.{domain}/{topic}</a
					>, then send the test notification.
				</p>
			{/if}
			<button
				onclick={send}
				class="btn btn-primary btn-sm w-full">Send me a test notification</button
			>
			{#if result}
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
		<p class="disabled-msg">Not configured - NTFY_URL not set</p>
	{/if}
</div>
