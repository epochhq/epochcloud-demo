import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env }));

import { readSecret } from '../../src/lib/server/secrets.js';

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'demo-secret-'));
});

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
	for (const name of Object.keys(env)) delete env[name];
});

describe('mounted secret resolution', () => {
	it.each([
		['value\n', 'value'],
		[' value \n', ' value '],
		['value\n\n', 'value\n'],
		['value\r\n', 'value\r']
	])('prefers file bytes %j over the environment fallback', (stored, expected) => {
		const filename = join(directory, 'token');
		writeFileSync(filename, stored);
		env.APP_TOKEN_FILE = filename;
		env.APP_TOKEN = 'fallback';
		expect(readSecret('APP_TOKEN')).toBe(expected);
	});

	it.each([undefined, 'fallback'])('uses the environment when no file is configured: %j', (fallback) => {
		env.APP_TOKEN = fallback;
		expect(readSecret('APP_TOKEN')).toBe(fallback);
	});

	it('keeps a missing optional mount distinct from an environment fallback', () => {
		env.APP_TOKEN_FILE = join(directory, 'absent');
		env.APP_TOKEN = 'fallback';
		expect(readSecret('APP_TOKEN')).toBeUndefined();
	});

	it('propagates a configured mount read error', () => {
		env.APP_TOKEN_FILE = directory;
		env.APP_TOKEN = 'fallback';
		expect(() => readSecret('APP_TOKEN')).toThrow(expect.objectContaining({ code: 'EISDIR' }));
	});
});
