// The live demos, in tab order. A tab with a statusUrl is checked when the
// page loads and again whenever its panel's own check runs.
export interface DemoTab {
	id: string;
	label: string;
	statusUrl?: string;
	describe?: (data: Record<string, unknown>) => string;
}

const n = (value: unknown) => Number(value ?? 0);

export const DEMOS: DemoTab[] = [
	{ id: 'rabbitmq', label: 'RabbitMQ', statusUrl: '/status/rabbitmq', describe: () => 'Broker answered a queue probe' },
	{ id: 'valkey', label: 'Valkey', statusUrl: '/status/valkey', describe: () => 'PING answered PONG' },
	{ id: 'cnpg', label: 'CNPG', statusUrl: '/status/cnpg', describe: (d) => `Query answered, ${n(d.items)} items` },
	{ id: 'email', label: 'Email', statusUrl: '/status/email', describe: () => 'Mail relay accepted the SMTP handshake' },
	{ id: 'betterauth', label: 'Account', statusUrl: '/status/betterauth', describe: () => 'BetterAuth reports ready' },
	{ id: 'crowdsec', label: 'CrowdSec', statusUrl: '/status/crowdsec', describe: () => 'LAPI accepted the bouncer key' },
	{
		id: 'defectdojo',
		label: 'DefectDojo',
		statusUrl: '/status/defectdojo',
		describe: (d) =>
			`${n((d.findings as { total?: number } | undefined)?.total)} active findings in ${typeof d.product === 'string' ? d.product : 'the demo product'}`
	},
	{
		id: 'prometheus',
		label: 'Prometheus',
		statusUrl: '/status/proofs',
		describe: (d) => {
			const proofs = (d.proofs as Array<{ value: number | null }> | undefined) ?? [];
			return `${proofs.filter((proof) => proof.value !== null).length} of ${proofs.length} queries answered`;
		}
	},
	{ id: 'linkerd', label: 'Linkerd', statusUrl: '/status/linkerd', describe: (d) => `${n(d.mtls_requests_10m)} mTLS requests from Traefik in 10 minutes` },
	{ id: 'featureflags', label: 'Feature Flags', statusUrl: '/status/featureflags', describe: (d) => `${n(d.flags_available)} flags` },
	{ id: 'ntfy', label: 'ntfy', statusUrl: '/status/ntfy', describe: () => 'Server reports healthy' },
	{ id: 'knative', label: 'Knative', statusUrl: '/status/knative', describe: (d) => `Invocation answered in ${n(d.latency_ms)} ms` }
];

export const demo = (id: string): DemoTab => DEMOS.find((tab) => tab.id === id) ?? { id, label: id };
