import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new globalThis.URL('./package.json', import.meta.url), 'utf8'));
const actual = process.versions.bun;
if (manifest.packageManager !== `bun@${actual}` || manifest.engines.bun !== actual) {
	throw new Error(`Bun runtime does not match package.json: expected ${manifest.packageManager}, got ${actual ?? 'Node.js'}`);
}
