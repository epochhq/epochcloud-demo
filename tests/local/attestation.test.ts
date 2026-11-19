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
		maxAgeDays: 30,
		enabled: true
	}
}));
vi.mock('#lib/server/config.js', () => ({ config }));
vi.mock('#lib/server/logger.js', () => ({ log: vi.fn() }));
const verify = vi.hoisted(() => vi.fn());
vi.mock('sigstore', () => ({ verify }));

import { attestationOnce, credentialFor, parseImageRef, readVulnerabilityAttestation, resetAttestation, summarise } from '../../src/lib/server/attestation.js';

const CI = { issuer: 'https://auth.example.test/realms/one', subject: 'ci@example.test' };

beforeEach(() => {
	config.attestation.imageRef = REF;
	config.attestation.authFile = authFile;
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

const VULN = 'https://cosign.sigstore.dev/attestation/vuln/v1';
const SLSA = 'https://slsa.dev/provenance/v1';

interface Served {
	predicate: string;
	/** Who the stand-in verification says signed it; null means the signature does not verify. */
	signer: { issuer: string; subject: string } | null;
	payload: unknown;
}

/** A bundle as the registry stores it: the envelope, with a marker the stand-in verification reads the signer from. */
const served = (predicate: string, payload: unknown, signer: Served['signer'] = CI): Served => ({ predicate, payload, signer });
const provenance = (digestHex = 'a'.repeat(64)) => ({
	predicateType: SLSA,
	subject: [{ digest: { sha256: digestHex } }],
	predicate: {}
});

/** A registry that serves the referrers of the running digest with the Docker token flow. */
function registry(list: Served[]) {
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
				manifests: list.map((b, i) => ({
					digest: `sha256:${String(i).padStart(64, '0')}`,
					artifactType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
					annotations: { 'dev.sigstore.bundle.predicateType': b.predicate }
				}))
			});
		const manifest = /\/manifests\/sha256:(\d+)$/.exec(url.pathname);
		if (manifest) return Response.json({ layers: [{ digest: `sha256:blob${Number(manifest[1])}` }] });
		const blob = /\/blobs\/sha256:blob(\d+)$/.exec(url.pathname);
		if (blob) {
			const b = list[Number(blob[1])]!;
			return Response.json({ ...bundle(b.payload), signedBy: b.signer ?? undefined });
		}
		return new Response(null, { status: 404 });
	});
	return calls;
}

// The stand-in for sigstore's verification: it verifies a bundle that has a
// signer and reports who, and rejects one that has none. The real verification
// is the platform trust root's to do (prototyped against a production digest).
beforeEach(() => {
	verify.mockImplementation(async (b: { signedBy?: { issuer: string; subject: string } }) => {
		if (!b.signedBy) throw new Error('invalid signature');
		return { key: {}, identity: { subjectAlternativeName: b.signedBy.subject, extensions: { issuer: b.signedBy.issuer } } };
	});
});

it('reads the scan of the running digest through the token flow, verifies it and the provenance, and reports its signer', async () => {
	const calls = registry([served(SLSA, provenance()), served(VULN, statement())]);
	const summary = await readVulnerabilityAttestation();
	expect(summary).toMatchObject({ critical: 1, high: 2, signer: 'ci@example.test' });
	expect(calls.some((call) => call.includes(`/referrers/${DIGEST}`))).toBe(true);
	// Verified against the platform trust root, pinned by the chart's root.json; no signer is named.
	expect(verify).toHaveBeenCalledWith(expect.anything(), {
		tufMirrorURL: 'http://tuf.test',
		tufRootPath: '/etc/root.json',
		tufCachePath: '/tmp/x',
		ctLogThreshold: 0
	});
});

it('is not scanned, and says so, when the digest has no vulnerability attestation', async () => {
	registry([served(SLSA, provenance())]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('was not scanned');
});

it('fails a scan whose signature does not verify', async () => {
	registry([served(SLSA, provenance()), served(VULN, statement(), null)]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('no vulnerability attestation of the running digest verified');
});

it('fails a scan signed by anyone but the identity that signed the image, even though it verifies', async () => {
	registry([served(SLSA, provenance()), served(VULN, statement(), { issuer: CI.issuer, subject: 'someone-else@example.test' })]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('fails a scan signed by the same name under another issuer', async () => {
	registry([served(SLSA, provenance()), served(VULN, statement(), { issuer: 'https://auth.example.test/realms/two', subject: CI.subject })]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('accepts a scan signed by a developer when the developer signed the image, so a dev image needs no listed identity', async () => {
	const dev = { issuer: 'https://auth.example.test/realms/two', subject: 'dev@example.test' };
	registry([served(SLSA, provenance(), dev), served(VULN, statement(), dev)]);
	expect(await readVulnerabilityAttestation()).toMatchObject({ signer: 'dev@example.test' });
});

it('has no one to trust when the digest has no verifiable provenance', async () => {
	registry([served(VULN, statement())]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('no verifiable provenance');
	registry([served(SLSA, provenance(), null), served(VULN, statement())]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('no verifiable provenance');
});

it('ignores a provenance that names another digest', async () => {
	registry([served(SLSA, provenance('b'.repeat(64))), served(VULN, statement())]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('no verifiable provenance');
});

it('fails a scan that verifies but names another digest', async () => {
	registry([served(SLSA, provenance()), served(VULN, statement({ subject: [{ digest: { sha256: 'b'.repeat(64) } }] }))]);
	await expect(readVulnerabilityAttestation()).rejects.toThrow('verified');
});

it('uses the newest of several verified scans', async () => {
	const older = statement({ predicate: { scanner: { version: '1', result: { Results: [] } }, metadata: { scanFinishedOn: '2026-11-01T00:00:00Z' } } });
	registry([served(SLSA, provenance()), served(VULN, older), served(VULN, statement())]);
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
	registry([served(SLSA, provenance()), served(VULN, statement())]);
	await attestationOnce();
	await attestationOnce();
	expect(verify).toHaveBeenCalledTimes(2); // the provenance and the scan, once
	resetAttestation();
	verify.mockReset();
	verify.mockRejectedValue(new Error('trust root unreachable'));
	await expect(attestationOnce()).rejects.toThrow();
	verify.mockImplementation(async (b: { signedBy?: { issuer: string; subject: string } }) => ({
		key: {},
		identity: { subjectAlternativeName: b.signedBy!.subject, extensions: { issuer: b.signedBy!.issuer } }
	}));
	await expect(attestationOnce()).resolves.toMatchObject({ critical: 1 });
});
