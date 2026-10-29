import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, lazyPlugins } from 'vite-plus';

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
	lint: {
		plugins: ['oxc', 'typescript', 'unicorn'],
		jsPlugins: [
			{
				name: 'vite-plus',
				specifier: 'vite-plus/oxlint-plugin'
			}
		],
		categories: {
			correctness: 'warn'
		},
		env: {
			builtin: true
		},
		globals: {
			fetch: 'readonly',
			Request: 'readonly',
			Response: 'readonly',
			Headers: 'readonly',
			console: 'readonly',
			setTimeout: 'readonly',
			clearTimeout: 'readonly',
			setInterval: 'readonly',
			clearInterval: 'readonly',
			process: 'readonly',
			Buffer: 'readonly',
			AbortController: 'readonly',
			AbortSignal: 'readonly',
			URLSearchParams: 'readonly',
			performance: 'readonly',
			window: 'readonly',
			document: 'readonly',
			__APP_VERSION__: 'readonly',
			__APP_COMMIT__: 'readonly',
			__APP_BUILD_TIME__: 'readonly'
		},
		ignorePatterns: ['**/.svelte-kit/**', '**/build/**', '**/dist/**', '**/node_modules/**'],
		rules: {
			'constructor-super': 'error',
			'for-direction': 'error',
			'getter-return': 'error',
			'no-async-promise-executor': 'error',
			'no-case-declarations': 'error',
			'no-class-assign': 'error',
			'no-compare-neg-zero': 'error',
			'no-cond-assign': 'error',
			'no-const-assign': 'error',
			'no-constant-binary-expression': 'error',
			'no-constant-condition': 'error',
			'no-control-regex': 'error',
			'no-debugger': 'error',
			'no-delete-var': 'error',
			'no-dupe-class-members': 'error',
			'no-dupe-else-if': 'error',
			'no-dupe-keys': 'error',
			'no-duplicate-case': 'error',
			'no-empty': 'error',
			'no-empty-character-class': 'error',
			'no-empty-pattern': 'error',
			'no-empty-static-block': 'error',
			'no-ex-assign': 'error',
			'no-extra-boolean-cast': 'error',
			'no-fallthrough': 'error',
			'no-func-assign': 'error',
			'no-global-assign': 'error',
			'no-import-assign': 'error',
			'no-invalid-regexp': 'error',
			'no-irregular-whitespace': 'error',
			'no-loss-of-precision': 'error',
			'no-misleading-character-class': 'error',
			'no-new-native-nonconstructor': 'error',
			'no-nonoctal-decimal-escape': 'error',
			'no-obj-calls': 'error',
			'no-prototype-builtins': 'error',
			'no-redeclare': 'error',
			'no-regex-spaces': 'error',
			'no-self-assign': 'error',
			'no-setter-return': 'error',
			'no-shadow-restricted-names': 'error',
			'no-sparse-arrays': 'error',
			'no-this-before-super': 'error',
			'no-unassigned-vars': 'error',
			'no-undef': 'error',
			'no-unexpected-multiline': 'error',
			'no-unreachable': 'error',
			'no-unsafe-finally': 'error',
			'no-unsafe-negation': 'error',
			'no-unsafe-optional-chaining': 'error',
			'no-unused-labels': 'error',
			'no-unused-private-class-members': 'error',
			'no-unused-vars': 'error',
			'no-useless-assignment': 'error',
			'no-useless-backreference': 'error',
			'no-useless-catch': 'error',
			'no-useless-escape': 'error',
			'no-with': 'error',
			'preserve-caught-error': 'error',
			'require-yield': 'error',
			'use-isnan': 'error',
			'valid-typeof': 'error',
			'vite-plus/prefer-vite-plus-imports': 'error'
		},
		overrides: [
			{
				files: ['*.svelte', '**/*.svelte'],
				globals: {
					$state: 'readonly',
					$derived: 'readonly',
					$effect: 'readonly',
					$props: 'readonly',
					$bindable: 'readonly',
					$inspect: 'readonly',
					$host: 'readonly'
				}
			},
			{
				files: ['**/*.{ts,tsx}'],
				rules: {
					'no-unused-vars': [
						'warn',
						{
							argsIgnorePattern: '^_',
							varsIgnorePattern: '^_'
						}
					],
					'typescript/no-explicit-any': 'off'
				}
			}
		],
		options: {
			typeAware: true,
			typeCheck: true
		}
	},
	fmt: {
		useTabs: true,
		singleQuote: true,
		trailingComma: 'none',
		printWidth: 160,
		semi: true,
		singleAttributePerLine: true,
		sortPackageJson: false,
		svelte: {},
		ignorePatterns: ['.svelte-kit', 'build', 'dist', 'node_modules', 'bun.lock']
	},
	test: {
		include: ['tests/local/**/*.test.ts'],
		testTimeout: 1000
	},
	plugins: lazyPlugins(() => [
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ out: 'build', precompress: false, envPrefix: '' }),
			tracing: { server: true }
		})
	]),
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
