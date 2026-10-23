<script lang="ts">
	let { enabled }: { enabled: boolean } = $props();

	let knativeN = $state('10');
	let knativeResult = $state('');
	let knativeResultOk = $state(false);
	let knativeResultVisible = $state(false);
	let knativeLoading = $state(false);

	async function knativeInvoke() {
		knativeLoading = true;
		knativeResultVisible = false;
		try {
			const resp = await fetch(`/knative/invoke?n=${knativeN}`);
			const d = await resp.json();
			if (d.success) {
				knativeResult = `F(${d.n}) = ${d.result}\nLatency: ${d.latency_ms}ms${d.cold_start ? ' (cold start!)' : ''}${d.duration ? `\nCompute: ${d.duration}` : ''}`;
				knativeResultOk = true;
			} else {
				knativeResult = d.error || 'Unknown error';
				knativeResultOk = false;
			}
			knativeResultVisible = true;
		} catch (err) {
			knativeResult = String(err);
			knativeResultOk = false;
			knativeResultVisible = true;
		}
		knativeLoading = false;
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Knative</h3>
		<span class="card-tag">Serverless</span>
	</div>
	<p class="card-desc">Invoke Fibonacci and measure cold start</p>
	{#if enabled}
		<div class="form-row">
			<span
				class="form-label"
				style="white-space:nowrap">n =</span
			>
			<input
				type="number"
				bind:value={knativeN}
				min="0"
				max="50"
				class="input input-sm"
				style="max-width:80px"
			/>
			<button
				onclick={knativeInvoke}
				class="btn btn-primary btn-sm"
				disabled={knativeLoading}
			>
				{knativeLoading ? 'Invoking...' : 'Invoke'}
			</button>
		</div>
		{#if knativeResultVisible}
			<pre
				class="result-pre"
				class:ok={knativeResultOk}
				class:err={!knativeResultOk}>{knativeResult}</pre>
		{/if}
	{:else}
		<p class="disabled-msg">Not configured - KNATIVE_FIBONACCI_URL not set</p>
	{/if}
</div>
