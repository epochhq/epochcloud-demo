<script lang="ts">
	import StatusIcon from './StatusIcon.svelte';
	import { getPage } from '#lib/status.svelte.js';

	interface Proof {
		id: string;
		group: string;
		title: string;
		unit: string;
		value: number | null;
		series?: Array<{ label: string; value: number }>;
		state: 'ok' | 'failed' | 'info';
	}

	// Renders the proofs the server evaluated for one group. The list itself is
	// data on the server (src/lib/server/proofs.ts); this only shows it.
	let { group }: { group: string } = $props();

	const { board } = getPage();
	const entry = $derived(board.get('prometheus'));
	const proofs = $derived(((entry.data?.proofs as Proof[] | undefined) ?? []).filter((proof) => proof.group === group));
	const format = (value: number | null, unit: string) =>
		value === null || Number.isNaN(value)
			? 'no data'
			: unit === 'ratio'
				? `${(value * 100).toFixed(2)} %`
				: unit === 's'
					? `${value.toFixed(3)} s`
					: `${Math.round(value).toLocaleString()} ${unit}`;
</script>

{#if proofs.length === 0}
	<p class="card-desc">
		{entry.state === 'checking' || entry.state === 'unchecked' ? 'Waiting for the first snapshot.' : 'No proofs available: ' + entry.detail}
	</p>
{:else}
	<table class="proofs">
		<tbody>
			{#each proofs as proof (proof.id)}
				<tr>
					<td class="state"
						><StatusIcon
							state={proof.state === 'ok' ? 'ok' : proof.state === 'failed' ? 'failed' : 'unchecked'}
							showWord
						/></td
					>
					<td>{proof.title}</td>
					<td class="value">{format(proof.value, proof.unit)}</td>
				</tr>
				{#each proof.series ?? [] as row (row.label)}
					<tr class="series">
						<td></td>
						<td>{row.label}</td>
						<td class="value">{row.value.toLocaleString()}</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
	<p class="card-desc">Server snapshot, {entry.data?.age_seconds ?? 0}s old. Series are limited to this namespace.</p>
{/if}

<style>
	.proofs {
		width: 100%;
		font-size: 0.8rem;
		border-collapse: collapse;
	}

	.proofs td {
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.value {
		text-align: right;
		font-family: 'JetBrains Mono', monospace;
	}

	.series td {
		font-size: 0.7rem;
		color: var(--muted-fg);
	}
</style>
