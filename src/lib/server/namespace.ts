import { readFileSync } from 'node:fs';
import { config } from './config.js';

/**
 * The Kubernetes namespace this pod runs in. The chart sets POD_NAMESPACE from
 * the downward API; without it, the pod's DNS search path names the namespace
 * as its first entry (`<namespace>.svc.<cluster domain> ...`). Empty outside a
 * cluster.
 */
export function namespaceFrom(podNamespace: string, resolvConf: string): string {
	if (podNamespace) return podNamespace;
	const search = resolvConf.split('\n').find((line) => line.startsWith('search '));
	const first = search?.split(/\s+/)[1] ?? '';
	const match = /^([a-z0-9-]+)\.svc\./.exec(first);
	return match?.[1] ?? '';
}

let resolved: string | undefined;

export function currentNamespace(): string {
	if (resolved === undefined) {
		let resolvConf = '';
		try {
			resolvConf = readFileSync('/etc/resolv.conf', 'utf8');
		} catch {
			// not in a cluster
		}
		resolved = namespaceFrom(config.podNamespace, resolvConf);
	}
	return resolved;
}
