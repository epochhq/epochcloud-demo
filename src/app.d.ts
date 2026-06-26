// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Build metadata injected by Vite `define` at build time (see vite.config.ts).
	const __APP_VERSION__: string;
	const __APP_COMMIT__: string;
	const __APP_BUILD_TIME__: string;
}

export {};
