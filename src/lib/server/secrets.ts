// Secret resolution for the demo server.
//
// Secret values reach this process as mounted files rather than environment
// variables: an env-var value is readable through /proc/<pid>/environ, lands
// in crash dumps, and is inherited by every child process, while a mounted
// Secret file is permissioned by the volume's defaultMode plus the pod's
// fsGroup and is refreshed in place by the kubelet on rotation.
//
// Each secret is addressed by a `<NAME>_FILE` env var holding the path to the
// mounted file. The plain `<NAME>` env var stays as a fallback so the app
// runs unchanged outside the charts (local dev, compose) where nothing is
// mounted.

import { readFileSync } from 'node:fs';

/**
 * Resolves a secret from the file named by `<name>_FILE`, falling back to the
 * `<name>` env var when no file path is configured.
 *
 * Every secret-backed integration in this app is optional-by-design (each
 * config block gates on presence), so a configured path whose file is absent
 * resolves to undefined instead of aborting boot - an `optional` Secret
 * volume mounts empty until the Secret exists, and a key may not be seeded.
 *
 * One trailing newline is stripped: a secret store round-trip commonly
 * appends one and no value consumed here (connection credential, URI, API
 * token) may legitimately end in a newline. Every other byte passes through
 * verbatim.
 */
export function readSecret(name: string): string | undefined {
	const path = process.env[`${name}_FILE`];
	if (!path) return process.env[name];
	try {
		return readFileSync(path, 'utf8').replace(/\n$/, '');
	} catch (err) {
		if ((err as { code?: unknown }).code === 'ENOENT') return undefined;
		throw err;
	}
}
