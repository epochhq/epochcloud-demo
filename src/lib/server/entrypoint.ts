import { config } from './config.js';
import { upstream } from './http.js';
import { log } from './logger.js';

/** True when the chart gave the app the public address its own entrypoint serves. */
export const entrypointEnabled = (): boolean => !!config.entrypointUrl;

/**
 * One real request from the app to its own public address. Split-horizon DNS
 * answers it with Traefik, so it enters through the entrypoint like a
 * visitor's and Traefik's proxy sends it to the app over the mesh. That is the
 * traffic the Linkerd check reads: Linkerd's own proofs of mTLS (viz edges,
 * viz tap) only show anything while requests flow, and the proxy forgets a
 * series after ten idle minutes. /health, so the request proofs, which leave
 * it out, do not count it.
 */
export async function probeEntrypoint(): Promise<void> {
	try {
		const resp = await upstream(`${config.entrypointUrl}/health`);
		await resp.body?.cancel();
		if (!resp.ok) throw new Error(`the entrypoint answered ${resp.status}`);
	} catch (err) {
		log('warn', 'entrypoint probe failed', { error: err instanceof Error ? err.message : String(err) });
		throw err;
	}
}
