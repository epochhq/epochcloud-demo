<script lang="ts">
	import { WORDS, type CheckState } from '#lib/check.js';

	// Each state has its own shape as well as its own colour, so the state never
	// depends on colour alone (WCAG 2.2 SC 1.4.1). OK is a filled green dot and
	// carries its word for assistive technology only; every other state shows
	// its word, from the caller or, with `showWord`, from this component.
	let { state, showWord = false }: { state: CheckState; showWord?: boolean } = $props();
</script>

<span
	class="status-icon {state}"
	title={WORDS[state]}
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
		{#if state === 'ok'}
			<circle
				cx="8"
				cy="8"
				r="4"
				fill="currentColor"
				stroke="none"
			/>
		{:else if state === 'failed'}
			<path d="M4 4l8 8M12 4l-8 8" />
		{:else if state === 'notrunning'}
			<path d="M4 8h8" />
		{:else if state === 'slow'}
			<circle
				cx="8"
				cy="8"
				r="5.5"
			/>
			<path d="M8 4.8V8l2.2 1.4" />
		{:else if state === 'checking'}
			<path
				class="spinner"
				d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5"
			/>
		{:else}
			<circle
				cx="8"
				cy="8"
				r="5.5"
				stroke-dasharray="2 2.6"
			/>
		{/if}
	</svg>
	{#if state === 'ok'}<span class="sr-only">{WORDS[state]}</span>{:else if showWord}<span class="word">{WORDS[state]}</span>{/if}
</span>

<style>
	.status-icon {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
		color: var(--muted-fg);
	}

	svg {
		width: 14px;
		height: 14px;
	}

	.word {
		font-size: 0.7rem;
		font-weight: 600;
	}

	.ok {
		color: var(--success);
	}

	.ok svg {
		filter: drop-shadow(0 0 3px rgba(34, 197, 94, 0.45));
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.slow {
		color: var(--warning);
	}

	.failed {
		color: var(--danger);
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
