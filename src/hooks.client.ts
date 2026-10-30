import type { ClientInit } from '@sveltejs/kit/hooks';

export const init: ClientInit = async () => {
	const meta = document.querySelector('meta[name="faro-config"]');
	if (!meta) return;

	const faroConfig = JSON.parse(meta.getAttribute('content') || '{}');
	if (!faroConfig.enabled) return;

	const { setupFaro } = await import('#lib/faro.js');
	setupFaro({
		version: faroConfig.version,
		environment: faroConfig.environment
	});
};
