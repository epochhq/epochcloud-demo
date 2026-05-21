<script lang="ts">
	const stackOnline = [
		'Proxmox VE + OpenTofu',
		'Talos OS + K8s 1.36',
		'Karpenter',
		'Cilium + Hubble',
		'WireGuard Encryption',
		'ArgoCD',
		'OpenBao',
		'External Secrets Operator',
		'SOPS + age',
		'helm-secrets',
		'Traefik + cert-manager + trust-manager',
		'Cloudflare Zero Trust',
		'Keycloak SSO',
		'oauth2-proxy',
		'Longhorn Storage',
		'CloudNativePG',
		'Harbor Registry',
		'Argo Workflows CI',
		'Argo Events',
		'Kyverno Policies',
		'Cosign Signing',
		'Syft + Grype',
		'Semgrep + Trivy',
		'OWASP ZAP',
		'Headlamp',
		'kubernetes-reflector',
		'Reloader',
		'Renovate',
		'ArgoCD Image Updater',
		'Kargo Promotions',
		'Argo Rollouts',
		'Linkerd mTLS',
		'Prometheus + AlertManager',
		'Grafana',
		'Alloy Collector',
		'Loki Logs',
		'Tempo Traces',
		'ntfy Notifications',
		'Goldilocks VPA',
		'HPA Autoscaling',
		'KEDA Scaling',
		'VPA Right-sizing',
		'KRR Analysis',
		'Velero Backups',
		'Velero UI',
		'SeaweedFS S3',
		'RabbitMQ',
		'Valkey Cache',
		'CrowdSec Threat Intel',
		'Beelzebub (Honeypot)',
		'Maddy SMTP',
		'BetterAuth + Hono',
		'Resend Email',
		'Knative Serving',
		'Rybbit Analytics',
		'GO Feature Flag',
		'Grafana Faro (Web Vitals)',
		'Falco Runtime',
		'Falcosidekick',
		'DefectDojo',
		'Loki Ruler (LogQL)',
		'LitmusChaos'
	];

	const stackReview = [
		'fail2ban'
	];

	const stackPending = ['Kanister (data-recovery drills)'];

	const total = stackOnline.length + stackReview.length + stackPending.length;
</script>

<section class="section">
	<div class="section-head">
		<h2 class="section-title">Platform Stack</h2>
		<span class="count-badge">{total}</span>
	</div>

	<div class="stack-groups">
		<div class="stack-group">
			<div class="stack-group-head">
				<span class="dot dot-online"></span>
				<span class="stack-group-label">Online</span>
				<span class="stack-group-count">{stackOnline.length}</span>
			</div>
			<div class="chip-grid">
				{#each stackOnline as item (item)}
					<span class="chip chip-online">{item}</span>
				{/each}
			</div>
		</div>

		<div class="stack-group">
			<div class="stack-group-head">
				<span class="dot dot-review"></span>
				<span class="stack-group-label">Under Review</span>
				<span class="stack-group-count">{stackReview.length}</span>
			</div>
			<div class="chip-grid">
				{#each stackReview as item (item)}
					<span class="chip chip-review">{item}</span>
				{/each}
			</div>
		</div>

		<div class="stack-group">
			<div class="stack-group-head">
				<span class="dot dot-pending"></span>
				<span class="stack-group-label">Pending</span>
				<span class="stack-group-count">{stackPending.length}</span>
			</div>
			<div class="chip-grid">
				{#each stackPending as item (item)}
					<span class="chip chip-pending">{item}</span>
				{/each}
			</div>
		</div>
	</div>
</section>

<style>
	.stack-groups {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.stack-group {
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.25rem;
	}

	.stack-group-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.stack-group-label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text);
	}

	.stack-group-count {
		font-size: 0.7rem;
		color: var(--muted-fg);
		margin-left: auto;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot-online {
		background: var(--success);
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
	}

	.dot-review {
		background: var(--warning);
		box-shadow: 0 0 6px rgba(234, 179, 8, 0.4);
	}

	.dot-pending {
		background: var(--muted-fg);
	}

	.chip-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		font-size: 0.75rem;
		padding: 0.25rem 0.625rem;
		border-radius: 9999px;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		background: transparent;
		white-space: nowrap;
	}

	.chip-online {
		border-color: rgba(34, 197, 94, 0.2);
	}

	.chip-review {
		border-color: rgba(234, 179, 8, 0.2);
		color: var(--muted-fg);
	}

	.chip-pending {
		border-color: rgba(113, 113, 122, 0.3);
		color: var(--muted-fg);
	}
</style>
