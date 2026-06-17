<script lang="ts">
	let { domain }: { domain: string } = $props();

	const dashboards = [
		{ name: 'Grafana', sub: 'grafana', desc: 'Metrics & Dashboards' },
		{ name: 'Gatus', sub: 'status', desc: 'Status & Uptime' },
		{ name: 'Headlamp', sub: 'headlamp', desc: 'K8s Dashboard' },
		{ name: 'Keycloak', sub: 'auth', desc: 'Identity Provider' },
		{ name: 'ArgoCD', sub: 'argocd', desc: 'GitOps Delivery' },
		{ name: 'Traefik', sub: 'traefik', desc: 'Ingress Proxy' },
		{ name: 'Harbor', sub: 'registry', desc: 'Container Registry' },
		{ name: 'Kargo', sub: 'kargo', desc: 'Staged Promotions' },
		{ name: 'Longhorn', sub: 'longhorn', desc: 'Block Storage' },
		{ name: 'OpenBao', sub: 'bao', desc: 'Secrets Vault' },
		{ name: 'Workflows', sub: 'workflows', desc: 'CI Pipelines' },
		{ name: 'Rollouts', sub: 'rollouts', desc: 'Progressive Delivery' },
		{ name: 'Hubble', sub: 'hubble', desc: 'Network Observability' },
		{ name: 'Linkerd', sub: 'linkerd', desc: 'Service Mesh' },
		{ name: 'Goldilocks', sub: 'goldilocks', desc: 'Resource Tuning' },
		{ name: 'Velero', sub: 'velero', desc: 'Backup Management' },
		{ name: 'RabbitMQ', sub: 'rabbitmq', desc: 'Message Broker' },
		{ name: 'DefectDojo', sub: 'defectdojo', desc: 'Vulnerability Mgmt' },
		{ name: 'ntfy', sub: 'ntfy', desc: 'Push Notifications' },
		{ name: 'Rybbit', sub: 'analytics', desc: 'Web Analytics' },
		{ name: 'LitmusChaos', sub: 'chaos', desc: 'Chaos Engineering' }
	];
</script>

<section class="section">
	<div class="section-head">
		<h2 class="section-title">Dashboards</h2>
		<span class="count-badge">{dashboards.length}</span>
	</div>
	<div class="dash-grid">
		{#each dashboards as db (db.sub)}
			<a href="https://{db.sub}.{domain}" target="_blank" rel="noopener" class="dash-card">
				<span class="dash-name">{db.name}</span>
				<span class="dash-desc">{db.desc}</span>
			</a>
		{/each}
	</div>
</section>

<style>
	.dash-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.5rem;
	}

	.dash-card {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.75rem 1rem;
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.dash-card:hover {
		border-color: var(--border-hover);
		background: rgba(255, 255, 255, 0.03);
	}

	.dash-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text);
	}

	.dash-desc {
		font-size: 0.7rem;
		color: var(--muted-fg);
	}

	@media (max-width: 768px) {
		.dash-grid {
			grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		}
	}
</style>
