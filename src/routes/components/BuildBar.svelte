<script lang="ts">
	let {
		version,
		commit,
		buildTime,
		startedAt,
		hostname,
		environment
	}: {
		version: string;
		commit: string;
		buildTime: string;
		startedAt: string;
		hostname: string;
		environment: string;
	} = $props();

	let uptime = $state('');
	let podRotating = $state(false);
	let podRotateMsg = $state('');

	function formatUptime(startIso: string): string {
		const diff = Date.now() - new Date(startIso).getTime();
		if (diff < 0) return 'just now';
		const s = Math.floor(diff / 1000);
		if (s < 60) return `${s}s`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ${s % 60}s`;
		const h = Math.floor(m / 60);
		if (h < 24) return `${h}h ${m % 60}m`;
		const d = Math.floor(h / 24);
		return `${d}d ${h % 24}h`;
	}

	function formatBuildAge(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		if (diff < 0) return iso;
		const h = Math.floor(diff / 3600000);
		if (h < 1) return 'just now';
		if (h < 24) return `${h}h ago`;
		const d = Math.floor(h / 24);
		return `${d}d ago`;
	}

	$effect(() => {
		uptime = formatUptime(startedAt);
		const tick = setInterval(() => {
			uptime = formatUptime(startedAt);
		}, 1000);
		return () => clearInterval(tick);
	});

	function rotatePod() {
		podRotating = true;
		podRotateMsg = 'Reloading…';
		window.location.reload();
	}
</script>

<section class="build-bar">
	<div class="build-top">
		<div class="build-items">
			<div class="build-item">
				<span class="build-label">Version</span>
				<span class="build-value build-version">{version}</span>
			</div>
			<span class="build-sep"></span>
			<div class="build-item">
				<span class="build-label">Commit</span>
				<span class="build-value"><code class="build-commit">{commit.substring(0, 7)}</code></span>
			</div>
			<span class="build-sep"></span>
			<div class="build-item">
				<span class="build-label">Built</span>
				<span
					class="build-value"
					title={buildTime}>{formatBuildAge(buildTime)}</span
				>
			</div>
			<span class="build-sep"></span>
			<div class="build-item">
				<span class="build-label">Uptime</span>
				<span class="build-value build-uptime">{uptime}</span>
			</div>
			<span class="build-sep"></span>
			<div class="build-item">
				<span class="build-label">Environment</span>
				<span class="build-value"><span class="build-env-badge badge-{environment}">{environment}</span></span>
			</div>
		</div>
	</div>
	<div class="build-pod-row">
		<div class="build-pod-info">
			<span class="build-label">Pod</span>
			<span class="build-value build-pod-name">{hostname}</span>
		</div>
		<button
			class="btn btn-outline btn-sm build-rotate-btn"
			onclick={rotatePod}
			disabled={podRotating}
		>
			{podRotating ? '↻ Rotating...' : '↻ Rotate Pod'}
		</button>
		{#if podRotateMsg}
			<span class="build-rotate-msg">{podRotateMsg}</span>
		{/if}
	</div>
	<div class="pipeline">
		{#each [{ name: 'Git Push', icon: '⬆' }, { name: 'Argo Workflows', icon: '⚙' }, { name: 'Harbor', icon: '📦' }, { name: 'Kargo', icon: '🚀' }, { name: 'ArgoCD', icon: '🔄' }] as step, i (step.name)}
			{#if i > 0}<span class="pipe-connector"></span>{/if}
			<div class="pipe-step">
				<span class="pipe-icon">{step.icon}</span>
				<span class="pipe-name">{step.name}</span>
			</div>
		{/each}
	</div>
</section>

<style>
	.build-bar {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.build-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.build-items {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.build-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.build-label {
		font-size: 0.65rem;
		color: var(--muted-fg);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.build-value {
		font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	.build-version {
		color: var(--accent);
		font-weight: 600;
	}

	.build-commit {
		font-size: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		color: var(--text-secondary);
	}

	.build-uptime {
		color: var(--ok);
	}

	.build-env-badge {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
	}

	.badge-prod {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.badge-staging {
		background: rgba(245, 158, 11, 0.15);
		color: #f59e0b;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.badge-dev {
		background: rgba(99, 102, 241, 0.15);
		color: #818cf8;
		border: 1px solid rgba(99, 102, 241, 0.3);
	}

	.build-sep {
		width: 1px;
		height: 24px;
		background: var(--border);
	}

	.build-pod-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.625rem;
		background: rgba(0, 0, 0, 0.15);
		border-radius: 6px;
		border: 1px solid var(--border);
	}

	.build-pod-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.build-pod-name {
		font-size: 0.75rem;
		word-break: break-all;
	}

	.build-rotate-btn {
		margin-left: auto;
		white-space: nowrap;
	}

	.build-rotate-msg {
		font-size: 0.7rem;
		color: var(--text-secondary);
	}

	.pipeline {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0;
	}

	.pipe-step {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.6rem;
		border-radius: 0.375rem;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--border);
	}

	.pipe-icon {
		font-size: 0.7rem;
	}

	.pipe-name {
		font-size: 0.7rem;
	}

	.pipe-connector {
		width: 16px;
		height: 2px;
		background: var(--border);
	}

	@media (max-width: 768px) {
		.build-items {
			gap: 0.5rem;
		}

		.build-sep {
			display: none;
		}

		.pipeline {
			display: none;
		}
	}
</style>
