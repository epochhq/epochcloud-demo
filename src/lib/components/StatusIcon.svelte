<script lang="ts">
	import { WORDS, type CheckState } from '#lib/check.js';

	// A state is a dot: filled green, amber or red for OK, slow and failed, a
	// grey ring for not running, a dashed grey ring for not checked, and a
	// spinner while checking. The state's word is never shown: it is the
	// tooltip above the dot on hover (unless the caller shows one of its own,
	// `tip={false}`) and is read by assistive technology.
	let { state, tip = true }: { state: CheckState; tip?: boolean } = $props();
</script>

<span
	class="status-icon {state}"
	data-tip={tip ? WORDS[state] : undefined}
>
	<svg
		viewBox="0 0 16 16"
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		stroke-width="1.8"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		{#if state === 'ok' || state === 'slow' || state === 'failed'}
			<circle
				cx="8"
				cy="8"
				r="4"
				fill="currentColor"
				stroke="none"
			/>
		{:else if state === 'notrunning'}
			<circle
				cx="8"
				cy="8"
				r="3.2"
			/>
		{:else if state === 'checking'}
			<path
				class="spinner"
				d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5"
			/>
		{:else}
			<circle
				cx="8"
				cy="8"
				r="3.2"
				stroke-dasharray="2 2.6"
			/>
		{/if}
	</svg>
	<span class="sr-only">{WORDS[state]}</span>
</span>

<style>
	.status-icon {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--muted-fg);
	}

	svg {
		width: 14px;
		height: 14px;
	}

	.ok {
		color: var(--success);
	}

	.ok svg {
		filter: drop-shadow(0 0 3px rgba(34, 197, 94, 0.45));
	}

	.slow {
		color: var(--warning);
	}

	.failed {
		color: var(--danger);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.spinner {
		transform-origin: 8px 8px;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
