import { config } from './config.js';
import { upstream } from './http.js';
import { log } from './logger.js';
import { query, selector } from './prometheus.js';

// The platform's edge protection, proven from inside: one harmless canary
// request that the edge must refuse, and the same request without the canary
// as a control. Both go to this environment's own public address, which
// split-horizon DNS answers with Traefik in-cluster (the hairpin the Linkerd
// check also uses), so they reach the CrowdSec layer from a pod address and
// never from a node or through Cloudflare. Neither sets CF-Connecting-IP.
//
// The canary is one fixed header the platform's AppSec rule refuses. A
// refusal by that rule creates no event, alert or decision, so the probe can
// never feed a ban. What it proves is the CrowdSec layer at Traefik, for this
// host. Cloudflare's own protections are outside it.

const CANARY_HEADER = 'x-epochcloud-edge-canary';
const CANARY_VALUE = 'refuse-me';
/** Set by the CrowdSec bouncer on every refusal it serves. */
const REMEDIATION_HEADER = 'x-crowdsec-remediation';

export interface EdgeProbe {
	canaryStatus: number;
	/** The remediation header of the canary's answer, or null when it had none. */
	remediation: string | null;
	controlStatus: number;
}

/** The canary and the control request, side by side. */
export async function probeEdge(url: string): Promise<EdgeProbe> {
	const send = async (headers: Record<string, string>) => {
		const resp = await upstream(`${url}/health`, { headers, redirect: 'manual' });
		await resp.body?.cancel();
		return resp;
	};
	const [canary, control] = await Promise.all([send({ [CANARY_HEADER]: CANARY_VALUE }), send({})]);
	return { canaryStatus: canary.status, remediation: canary.headers.get(REMEDIATION_HEADER), controlStatus: control.status };
}

/**
 * Throws unless the edge behaved: the canary refused by the CrowdSec layer and
 * the control served. A canary that is served says the layer did not evaluate
 * this host (an AppSec outage fails open and answers exactly so), and a canary
 * refused without the bouncer's header was refused by something else.
 */
export function judgeEdge(probe: EdgeProbe): void {
	if (probe.controlStatus !== 200) throw new Error(`the control request was answered ${probe.controlStatus}: normal traffic is not served`);
	if (probe.canaryStatus === 200) throw new Error('the canary was served: the CrowdSec layer did not evaluate this host');
	if (probe.canaryStatus !== 403 || probe.remediation !== 'ban')
		throw new Error(`the canary was answered ${probe.canaryStatus} without the CrowdSec remediation header`);
}

export interface Refusals {
	/** Refusals by the CrowdSec layer for this host over 24 hours, the check's own canary included. */
	total24h: number;
	/** Seconds since the newest one, or null when none was recorded. */
	lastAgoSeconds: number | null;
}

/** The host a PromQL label may carry: letters, digits, dots and dashes. */
const host = (url: string): string => {
	const name = new globalThis.URL(url).hostname;
	if (!/^[a-z0-9.-]+$/.test(name)) throw new Error('invalid host');
	return name;
};

/**
 * This host's refusals, from the platform's per-host counter, limited to this
 * namespace. The counter is recorded for hosts an IngressRoute of this
 * namespace serves; a series counts from its second increment on, so a first
 * refusal can be missing from a figure.
 */
export async function readRefusals(namespace: string, url: string, now = Date.now()): Promise<Refusals> {
	const labels = `${selector(namespace)},host="${host(url)}"`;
	const [counts, last] = await Promise.all([
		query(`sum(increase(edge_refused_requests_total{${labels}}[24h]))`),
		query(`max_over_time(timestamp(increase(edge_refused_requests_total{${labels}}[2m]) > 0)[24h:1m])`)
	]);
	const newest = last[0]?.value;
	return {
		total24h: Math.round(counts[0]?.value ?? 0),
		lastAgoSeconds: newest === undefined || Number.isNaN(newest) ? null : Math.max(0, Math.round(now / 1000 - newest))
	};
}

/** The counts are a supporting figure: Prometheus not answering leaves them out and fails nothing. */
export async function readRefusalsOrNull(namespace: string, url: string): Promise<Refusals | null> {
	try {
		return await readRefusals(namespace, url);
	} catch (err) {
		log('warn', 'edge refusal counts unavailable', { error: err instanceof Error ? err.message : String(err) });
		return null;
	}
}

export const edgeEnabled = (): boolean => !!config.entrypointUrl;
