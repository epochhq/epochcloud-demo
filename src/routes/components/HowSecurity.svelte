<script lang="ts">
	import FlowCard from '$lib/components/flow/FlowCard.svelte';
	import type { FlowAccent } from '$lib/components/flow/FlowNode.svelte';

	// Security model as a full defense-in-depth view. Five layers, each verified
	// against platform-identity, platform-network, platform-security,
	// platform-ci and platform-tools manifests. Cosign signs every CI image twice
	// via OCI referrers: a self-managed ECDSA key signature plus an additive
	// keyless signature against the self-hosted Sigstore stack (Fulcio CA, Rekor v2
	// transparency log, RFC3161 TSA, TUF trust root). Kyverno admission verifies
	// either. Cloudflare is a DNS-proxy/WAF edge locked to CF IP ranges. WireGuard
	// pod encryption is the Cilium encryption mode set in ansible/tasks/cilium-deploy.yml.
	type Item = { name: string; sub: string };
	type Layer = { tag: string; accent: FlowAccent; items: Item[] };

	const layers: Layer[] = [
		{
			tag: 'Identity & Access',
			accent: 'blue',
			items: [
				{ name: 'Keycloak', sub: 'SSO / OIDC' },
				{ name: 'oauth2-proxy', sub: 'ForwardAuth' },
				{ name: 'Cloudflare edge', sub: 'proxy + WAF' },
				{ name: 'OpenBao', sub: 'secrets vault' },
				{ name: 'External Secrets', sub: 'vault sync' },
				{ name: 'SOPS + age', sub: 'encrypted at rest' }
			]
		},
		{
			tag: 'Network & Mesh',
			accent: 'purple',
			items: [
				{ name: 'Linkerd', sub: 'mTLS mesh' },
				{ name: 'Cilium', sub: 'default-deny + Hubble' },
				{ name: 'WireGuard', sub: 'pod encryption' },
				{ name: 'cert-manager', sub: 'TLS + trust-manager' },
				{ name: 'Traefik', sub: 'TLS edge termination' }
			]
		},
		{
			tag: 'Supply Chain & Admission',
			accent: 'amber',
			items: [
				{ name: 'Kyverno', sub: 'admission policy' },
				{ name: 'Cosign', sub: 'key + keyless signing' },
				{ name: 'SLSA L3', sub: 'build provenance' },
				{ name: 'Trivy / Syft / Grype', sub: 'image + SBOM scan' },
				{ name: 'Semgrep', sub: 'SAST' },
				{ name: 'TruffleHog', sub: 'secret scan' },
				{ name: 'OSV', sub: 'dependency vulns' },
				{ name: 'Pluto', sub: 'deprecated APIs' }
			]
		},
		{
			tag: 'Runtime',
			accent: 'green',
			items: [
				{ name: 'Falco', sub: 'syscall detection' },
				{ name: 'Falcosidekick', sub: 'alert routing' },
				{ name: 'CrowdSec', sub: 'threat intel + bouncer' },
				{ name: 'fail2ban', sub: 'edge brute-force ban' },
				{ name: 'Beelzebub', sub: 'honeypot' },
				{ name: 'OWASP ZAP', sub: 'DAST on promotion' }
			]
		},
		{
			tag: 'Aggregation & Response',
			accent: 'blue',
			items: [
				{ name: 'DefectDojo', sub: 'findings + SLA' },
				{ name: 'Loki Ruler', sub: 'LogQL alerting' },
				{ name: 'ntfy', sub: 'notifications' }
			]
		}
	];
</script>

<FlowCard title="How Security Layers" badge="Defense in depth" gap="1rem">
	<div class="sec-grid">
		{#each layers as layer (layer.tag)}
			<div class="sec-layer flow-accent-{layer.accent}">
				<span class="sec-tag">{layer.tag}</span>
				<div class="sec-items">
					{#each layer.items as item (item.name)}
						<div class="sec-item">
							<span class="sec-name">{item.name}</span>
							<span class="sec-sub">{item.sub}</span>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	{#snippet note()}
		Five layers, each independent. Identity and secrets gate access, the mesh encrypts and
		segments every hop, supply-chain gates stop unsigned or unattested images at admission, runtime
		sensors watch live workloads, and every signal lands in DefectDojo for triage on an SLA.
	{/snippet}
</FlowCard>

<style>
	.sec-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.sec-layer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: 0.625rem;
		/* Top-edge accent reads the shared palette; wider edge uses 0.6 alpha. */
		border-top: 2px solid rgb(var(--flow-accent-rgb) / 0.6);
		background: rgba(255, 255, 255, 0.02);
	}

	.sec-tag {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-secondary);
	}

	.sec-items {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.sec-item {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		padding: 0.4rem 0.55rem;
		border-radius: 0.4rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid var(--border);
	}

	.sec-name {
		font-size: 0.76rem;
		font-weight: 500;
		color: var(--text);
	}

	.sec-sub {
		font-size: 0.64rem;
		color: var(--muted-fg);
	}

	@media (max-width: 900px) {
		.sec-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 560px) {
		.sec-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
