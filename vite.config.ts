import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Build metadata is stamped at `vite build` time, NOT via Docker --build-arg.
// The in-cluster buildah pipeline deliberately passes no per-build --build-arg
// (a changing arg value busts every layer's cache key and forces a permanent
// cold dependency rebuild), so the Dockerfile ARGs never carried real values
// and the page rendered version=dev / commit=unknown / built=NaN. Reading the
// values here at build time keeps them out of the layer cache entirely while
// still baking the real commit and version into the bundle. Each lookup is
// defensive: a missing VERSION file or absent .git must never fail the build.
function readVersion(): string {
	try {
		return readFileSync('VERSION', 'utf8').trim() || 'dev';
	} catch {
		return 'dev';
	}
}

function readCommit(): string {
	if (process.env.PUBLIC_COMMIT) return process.env.PUBLIC_COMMIT;
	try {
		return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return 'unknown';
	}
}

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(readVersion()),
		__APP_COMMIT__: JSON.stringify(readCommit()),
		__APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
	},
	build: {
		sourcemap: false
	},
	server: {
		port: 3000
	}
});
