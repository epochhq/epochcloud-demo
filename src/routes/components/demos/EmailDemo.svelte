<script lang="ts">
	let { enabled }: { enabled: boolean } = $props();

	let emailInput = $state('');
	let emailStatus = $state('');
	let emailError = $state(false);

	async function sendEmail() {
		if (!emailInput) return;
		emailStatus = 'Sending...';
		emailError = false;
		try {
			const resp = await fetch(`/email/send?email=${encodeURIComponent(emailInput)}`);
			const r = await resp.json();
			emailStatus = r.success ? `Sent to ${emailInput}` : r.error;
			emailError = !r.success;
		} catch (err) {
			emailStatus = String(err);
			emailError = true;
		}
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Email</h3>
		<span class="card-tag">SMTP</span>
	</div>
	{#if enabled}
		<div class="form-row">
			<input
				type="email"
				bind:value={emailInput}
				placeholder="recipient@example.com"
				class="input"
			/>
			<button
				onclick={sendEmail}
				class="btn btn-primary btn-sm">Send</button
			>
		</div>
		{#if emailStatus}
			<p
				class="result"
				class:ok={!emailError}
				class:err={emailError}
			>
				{emailStatus}
			</p>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured - SMTP_HOST not set</p>
	{/if}
</div>
