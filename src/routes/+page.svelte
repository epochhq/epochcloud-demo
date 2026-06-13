<script lang="ts">
	import type { PageData } from './$types';
	import Header from './components/Header.svelte';
	import BuildBar from './components/BuildBar.svelte';
	import PlatformStack from './components/PlatformStack.svelte';
	import HowDeploy from './components/HowDeploy.svelte';
	import HowSecurity from './components/HowSecurity.svelte';
	import HowBackup from './components/HowBackup.svelte';
	import Dashboards from './components/Dashboards.svelte';
	import DemoTabs from './components/DemoTabs.svelte';
	import Footer from './components/Footer.svelte';
	import RabbitMqDemo from './components/demos/RabbitMqDemo.svelte';
	import ValkeyDemo from './components/demos/ValkeyDemo.svelte';
	import CnpgDemo from './components/demos/CnpgDemo.svelte';
	import EmailDemo from './components/demos/EmailDemo.svelte';
	import BetterAuthDemo from './components/demos/BetterAuthDemo.svelte';
	import CrowdSecDemo from './components/demos/CrowdSecDemo.svelte';
	import DefectDojoDemo from './components/demos/DefectDojoDemo.svelte';
	import PrometheusDemo from './components/demos/PrometheusDemo.svelte';
	import LinkerdDemo from './components/demos/LinkerdDemo.svelte';
	import ChaosDemo from './components/demos/ChaosDemo.svelte';
	import FeatureFlagsDemo from './components/demos/FeatureFlagsDemo.svelte';
	import NtfyDemo from './components/demos/NtfyDemo.svelte';
	import KnativeDemo from './components/demos/KnativeDemo.svelte';

	let { data }: { data: PageData } = $props();

	let activeDemo = $state('rabbitmq');
	let statuses: Record<string, { ok: boolean; checked: boolean }> = $state({});

	// Lightweight parallel status check on mount for tab dot indicators
	$effect(() => {
		const checks = [
			{ key: 'rabbitmq', url: '/rabbitmq/status' },
			{ key: 'valkey', url: '/cache/status' },
			{ key: 'cnpg', url: '/cnpg/status' },
			{ key: 'betterauth', url: '/auth/status' },
			{ key: 'crowdsec', url: '/crowdsec/status' },
			{ key: 'defectdojo', url: '/defectdojo/status' },
			{ key: 'featureflags', url: '/features/status' },
			{ key: 'ntfy', url: '/ntfy/status' }
		];

		Promise.allSettled(
			checks.map(async ({ key, url }) => {
				try {
					const resp = await fetch(url);
					const d = await resp.json();
					statuses[key] = { ok: d.connected, checked: true };
				} catch {
					statuses[key] = { ok: false, checked: true };
				}
			})
		);
	});
</script>

<svelte:head>
	<title>EpochCloud</title>
</svelte:head>

<div class="dashboard">
	<Header environment={data.environment} domain={data.domain} />
	<BuildBar
		version={data.version}
		commit={data.commit}
		buildTime={data.buildTime}
		startedAt={data.startedAt}
		hostname={data.hostname}
		environment={data.environment}
	/>
	<PlatformStack />
	<HowDeploy />
	<HowSecurity />
	<HowBackup />
	<Dashboards domain={data.domain} />

	<section class="section">
		<div class="section-head">
			<h2 class="section-title">Live Demos</h2>
			<span class="count-badge">13</span>
		</div>

		<DemoTabs {activeDemo} {statuses} onSelect={(id) => (activeDemo = id)} />

		{#if activeDemo === 'rabbitmq'}
			<RabbitMqDemo enabled={data.features.rabbitmq} />
		{:else if activeDemo === 'valkey'}
			<ValkeyDemo enabled={data.features.valkey} />
		{:else if activeDemo === 'cnpg'}
			<CnpgDemo enabled={data.features.cnpg} environment={data.environment} />
		{:else if activeDemo === 'email'}
			<EmailDemo enabled={data.features.smtp} />
		{:else if activeDemo === 'betterauth'}
			<BetterAuthDemo enabled={data.features.betterauth} />
		{:else if activeDemo === 'crowdsec'}
			<CrowdSecDemo enabled={data.features.crowdsec} />
		{:else if activeDemo === 'defectdojo'}
			<DefectDojoDemo enabled={data.features.defectdojo} domain={data.domain} />
		{:else if activeDemo === 'prometheus'}
			<PrometheusDemo />
		{:else if activeDemo === 'linkerd'}
			<LinkerdDemo />
		{:else if activeDemo === 'chaos'}
			<ChaosDemo />
		{:else if activeDemo === 'featureflags'}
			<FeatureFlagsDemo enabled={data.features.gofeatureflag} />
		{:else if activeDemo === 'ntfy'}
			<NtfyDemo enabled={data.features.ntfy} />
		{:else if activeDemo === 'knative'}
			<KnativeDemo enabled={data.features.knative} />
		{/if}
	</section>

	<Footer />
</div>
