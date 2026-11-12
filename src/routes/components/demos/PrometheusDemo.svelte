<script lang="ts">
	import ProofTable from '#lib/components/ProofTable.svelte';
	import SignInGate from '#lib/components/SignInGate.svelte';
	import StatusRow from '#lib/components/StatusRow.svelte';
	import { act, form } from '#lib/check.js';
	import { demo } from '#lib/demos.js';
	import { getPage } from '#lib/status.svelte.js';

	const { board } = getPage();
	let result = $state('');

	async function increment(burst: number) {
		const r = await act('/prometheus/increment', form({ burst: String(burst) }));
		result = r.ok ? `Added ${burst} on the pod that answered. Prometheus shows it after its next scrape.` : r.detail;
		await board.run('prometheus', '/status/proofs', { describe: demo('prometheus').describe });
	}
</script>

<div class="card">
	<div class="card-head">
		<h3>Prometheus</h3>
		<span class="card-tag">Metrics</span>
	</div>
	<StatusRow id="prometheus" />
	<p class="card-desc">Every number is a Prometheus query limited to this app's namespace, evaluated by the server on a schedule.</p>
	<ProofTable group="prometheus" />
	<SignInGate>
		<div class="form-row">
			<button
				onclick={() => increment(1)}
				class="btn btn-primary btn-sm">+1</button
			>
			<button
				onclick={() => increment(5)}
				class="btn btn-primary btn-sm">+5</button
			>
			<button
				onclick={() => increment(25)}
				class="btn btn-primary btn-sm">+25</button
			>
		</div>
		{#if result}<p class="card-desc">{result}</p>{/if}
	</SignInGate>
</div>
