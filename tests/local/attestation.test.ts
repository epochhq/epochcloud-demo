import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const REF = `registry.example.test/epochcloud/demo:latest@${DIGEST}`;
const authDir = mkdtempSync(join(tmpdir(), 'attestation-'));
const authFile = join(authDir, 'config.json');
writeFileSync(authFile, JSON.stringify({ auths: { 'registry.example.test': { auth: 'cm9ib3Q6c2VjcmV0' } } }));

const config = vi.hoisted(() => ({
	attestation: {
		imageRef: '',
		authFile: '',
		tufMirrorUrl: 'http://tuf.test',
		tufRootFile: '/etc/root.json',
		cacheDir: '/tmp/x',
		signers: '',
		maxAgeDays: 30,
		enabled: true
	}
}));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
const verify = vi.hoisted(() => vi.fn());
vi.mock('sigstore', () => ({ verify }));

import {
	attestationOnce,
	credentialFor,
	parseImageRef,
	parseSigners,
	readVulnerabilityAttestation,
	resetAttestation,
	summarise
} from '../../src/lib/server/attestation.js';

const CI = { issuer: 'https://auth.example.test/realms/platform', subject: 'ci@example.test' };
const DEV = { issuer: 'https://auth.example.test/realms/app', subjectDomain: 'example.test' };

beforeEach(() => {
	config.attestation.imageRef = REF;
	config.attestation.authFile = authFile;
	config.attestation.signers = JSON.stringify([CI, DEV]);
	resetAttestation();
	verify.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const statement = (overrides: Record<string, unknown> = {}) => ({
	_type: 'https://in-toto.io/Statement/v0.1',
	predicateType: 'https://cosign.sigstore.dev/attestation/vuln/v1',
	subject: [{ name: 'registry.example.test/epochcloud/demo', digest: { sha256: 'a'.repeat(64) } }],
	predicate: {
		scanner: {
			version: '0.76.1',
			result: { Results: [{ Vulnerabilities: [{ Severity: 'CRITICAL' }, { Severity: 'HIGH' }, { Severity: 'HIGH' }] }, { Vulnerabilities: null }] }
		},
		metadata: { scanFinishedOn: '2026-11-17T10:00:00Z' }
	},
	...overrides
});
const bundle = (payload: unknown) => ({ dsseEnvelope: { payload: Buffer.from(JSON.stringify(payload)).toString('base64') } });

it('reads the digest the Rollout names', () => {
	expect(parseImageRef(REF)).toEqual({ registry: 'registry.example.test', repository: 'epochcloud/demo', digest: DIGEST });
	expect(parseImageRef(`registry.example.test/epochcloud/demo@${DIGEST}`).repository).toBe('epochcloud/demo');
	expect(() => parseImageRef('registry.example.test/epochcloud/demo:latest')).toThrow('not named by digest');
});

it('refuses a signer list that names nobody precisely', () => {
	expect(parseSigners(JSON.stringify([CI, DEV]))).toHaveLength(2);
	expect(() => parseSigners('{}')).toThrow('not a list');
	expect(() => parseSigners(JSON.stringify([{ issuer: 'x' }]))).toThrow('needs an issuer');
	expect(() => parseSigners(JSON.stringify([{ subject: 'x' }]))).toThrow('needs an issuer');
});

it('takes the credential for the registry, and refuses a pull secret without one', () => {
	expect(credentialFor(JSON.stringify({ auths: { 'registry.example.test': { auth: 'abc' } } }), 'registry.example.test')).toBe('abc');
	expect(() => credentialFor(JSON.stringify({ auths: { 'other.test': { auth: 'abc' } } }), 'registry.example.test')).toThrow('no credential');
});

it('counts high and critical findings, and an empty list is a real no findings', () => {
	expect(summarise(statement() as never, DIGEST, 'ci@example.test')).toMatchObject({
		critical: 1,
		high: 2,
		scannedAt: '2026-11-17T10:00:00Z',
		scanner: 'trivy 0.76.1'
	});
	const clean = statement({ predicate: { scanner: { version: '0.76.1', result: { Results: [] } }, metadata: { scanFinishedOn: '2026-11-17T10:00:00Z' } } });
	expect(summarise(clean as never, DIGEST, 's')).toMatchObject({ critical: 0, high: 0 });
});

it('refuses an attestation of another digest, of another kind, or without a scan result', () => {
	const other = statement({ subject: [{ digest: { sha256: 'b'.repeat(64) } }] });
	expect(() => summarise(other as never, DIGEST, 's')).toThrow('another digest');
	expect(() => summarise(statement({ predicateType: 'https://slsa.dev/provenance/v1' }) as never, DIGEST, 's')).toThrow('not a vulnerability attestation');
	expect(() => summarise(statement({ predicate: {} }) as never, DIGEST, 's')).toThrow('no scan result');
});

/** A registry that serves the referrers of the running digest with the Docker token flow. */
function registry(bundles: Array<{ annotations?: Record<string, string>; artifactType?: string; body: unknown }>) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
		const url = new globalThis.URL(input);
		const headers = new globalThis.Headers(init.headers);
		calls.push(`${url.pathname}${url.search}`);
		if (url.pathname === '/service/token') {
			expect(headers.get('authorization')).toBe('Basic cm9ib3Q6c2VjcmV0');
			expect(url.searchParams.get('scope')).toBe('repository:epochcloud/demo:pull');
			return Response.json({ token: 't0ken' });
		}
		if (headers.get('authorization') !== 'Bearer t0ken')
			return new Response(null, {
				status: 401,
				headers: { 'www-authenticate': 'Bearer realm="https://registry.example.test/service/token",service="harbor-registry"' }
			});
		if (url.pathname.endsWith(`/referrers/${DIGEST}`))
			return Response.json({
				manifests: bundles.map((b, i) => ({
					digest: `sha256:${String(i).padStart(64, '0')}`,
					artifactType: b.artifactType ?? 'application/vnd.dev.sigstore.bundle.v0.3+json',
					annotations: b.annotations ?? { 'dev.sigstore.bundle.predicateType': 'https://cosign.sigstore.dev/attestation/vuln/v1' }
				}))
			});
		const manifest = /\/manifests\/sha256:(\d+)$/.exec(url.pathname);
		if (manifest) return Response.json({ layers: [{ digest: `sha256:blob${Number(manifest[1])}` }] });
		const blob = /\/blobs\/sha256:blob(\d+)$/.exec(url.pathname);
		if (blob) return Response.json(bundles[Number(blob[1])]!.body);
		return new Response(null, { status: 404 });
	});
	return calls;
}

// A certificate is issued under one issuer, and the real verification checks it
// against the issuer it is asked for, so the stand-in verifies only for that one.
const verified = (subject: string, issuer = CI.issuer) =>
	verify.mockImplementation(async (_bundle: unknown, options: { certificateIssuer: string }) =>
		options.certificateIssuer === issuer
			? { key: {}, identity: { subjectAlternativeName: subject, extensions: { issuer } } }
			: Promise.reject(new Error('another issuer'))
	);

it('reads the vulnerability attestation of the running digest through the token flow and verifies it', async () => {
	const calls = registry([{ body: bundle(statement()) }]);
	verified('ci@example.test');
	const summary = await readVulnerabilityAttestation();
	expect(summary).toMatchObject({ critical: 1, high: 2, signer: 'ci@example.test' });
	// Only the vulnerability bundles of the running digest are fetched.
	expect(calls.some((call) => call.includes(`/referrers/${DIGEST}`))).toBe(true);
	// Verified against the platform trust root, pinned by the chart's root.json, for the issuer.
	expect(verify).toHaveBeenCalledWith(expect.anything(), {
		tufMirrorURL: 'http://tuf.test',
		tufRootPath: '/etc/root.json',
		tufCachePath: '/tmp/x',
		certificateIssuer: CI.issuer,
		ctLogThreshold: 0
	});
});

it('is not scanned, and says so, when the digest has no vulnerability attestation', async () => {
	registry([
		{
			artifactType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
			annotations: { 'dev.sigstore.bundle.predicateType': 'https://slsa.dev/provenance/v1' },
			body: {}
		}
	]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('was not scanned');
	expect(verify).not.toHaveBeenCalled();
});

it('fails an attestation whose signature does not verify', async () => {
	registry([{ body: bundle(statement()) }]);
	verify.mockRejectedValue(new Error('invalid signature'));
	await expect(readVulnerabilityAttestation()).rejects.toThrow('no vulnerability attestation of the running digest verified');
});

it('fails an attestation signed by an identity the platform does not allow, even though it verifies', async () => {
	registry([{ body: bundle(statement()) }]);
	verified('someone-else@example.test', CI.issuer);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('accepts any developer of the app realm, and only under that realm', async () => {
	registry([{ body: bundle(statement()) }]);
	verify.mockImplementation(async (_bundle: unknown, options: { certificateIssuer: string }) =>
		options.certificateIssuer === DEV.issuer
			? { key: {}, identity: { subjectAlternativeName: 'dev@example.test' } }
			: Promise.reject(new Error('another issuer'))
	);
	expect(await readVulnerabilityAttestation()).toMatchObject({ signer: 'dev@example.test' });
	// The same identity under the platform realm's issuer is not the developer's.
	verify.mockImplementation(async (_bundle: unknown, options: { certificateIssuer: string }) =>
		options.certificateIssuer === CI.issuer
			? { key: {}, identity: { subjectAlternativeName: 'dev@example.test' } }
			: Promise.reject(new Error('another issuer'))
	);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('fails an attestation that verifies but names another digest', async () => {
	registry([{ body: bundle(statement({ subject: [{ digest: { sha256: 'b'.repeat(64) } }] })) }]);
	verified('ci@example.test');
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('uses the newest of several verified attestations', async () => {
	const older = statement({ predicate: { scanner: { version: '1', result: { Results: [] } }, metadata: { scanFinishedOn: '2026-11-01T00:00:00Z' } } });
	registry([{ body: bundle(older) }, { body: bundle(statement()) }]);
	verified('ci@example.test');
	expect((await readVulnerabilityAttestation()).scannedAt).toBe('2026-11-17T10:00:00Z');
});

it('refuses a registry that refuses the pull credential', async () => {
	vi.stubGlobal('fetch', async (input: string) =>
		new globalThis.URL(input).pathname === '/service/token'
			? new Response(null, { status: 401 })
			: new Response(null, {
					status: 401,
					headers: { 'www-authenticate': 'Bearer realm="https://registry.example.test/service/token",service="harbor-registry"' }
				})
	);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('refused the pull credential');
});

it('verifies once per digest and tries again after a failure', async () => {
	registry([{ body: bundle(statement()) }]);
	verified('ci@example.test');
	await attestationOnce();
	await attestationOnce();
	expect(verify).toHaveBeenCalledTimes(1);
	resetAttestation();
	verify.mockRejectedValue(new Error('trust root unreachable'));
	await expect(attestationOnce()).rejects.toThrow();
	verified('ci@example.test');
	await expect(attestationOnce()).resolves.toMatchObject({ critical: 1 });
});
