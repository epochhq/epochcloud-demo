import { readFileSync } from 'node:fs';
import { verify } from 'sigstore';
import { config } from './config.js';
import { upstream } from './http.js';
import { log } from './logger.js';

// The vulnerability attestation of the image this pod runs. The platform's CI
// attaches the scan result of every digest it builds as a signed in-toto
// attestation next to the image, and the developer build does the same under
// the developer's own identity. The app reads the attestations of its own
// running digest with its own pull credential, verifies each against the
// platform's trust root (the TUF mirror, pinned by the root.json the chart
// carries), and checks that its subject is the running digest. Nothing is
// taken from the registry unverified, and no credential for the scanner or for
// DefectDojo is involved.
//
// Who may have signed is not listed here. The running image was admitted
// because its SLSA provenance carries a signature the platform's admission
// policy accepts, so the identity that signed that provenance is the one the
// platform trusts for this digest. The scan counts only when it is signed by
// the same identity under the same issuer: the CI signer for a CI image, the
// developer for a dev image. No realm or signer is named in this app.
//
// What the attestation states is what the scan was asked for: HIGH and
// CRITICAL findings that have a fix available. An empty list is a real "no
// findings"; no attestation at all is "not scanned", a different thing.

const VULN_PREDICATE = 'https://cosign.sigstore.dev/attestation/vuln/v1';
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1';
const BUNDLE_TYPE = 'application/vnd.dev.sigstore.bundle.v0.3+json';
const PREDICATE_ANNOTATION = 'dev.sigstore.bundle.predicateType';

export interface RunningImage {
	registry: string;
	repository: string;
	digest: string;
}

/** `registry/path[:tag]@sha256:digest` as the Rollout names the image it runs. */
export function parseImageRef(ref: string): RunningImage {
	const match = /^([^/]+)\/(.+?)(?::[^/@:]+)?@(sha256:[0-9a-f]{64})$/.exec(ref);
	if (!match) throw new Error('the running image is not named by digest');
	return { registry: match[1]!, repository: match[2]!, digest: match[3]! };
}

export interface VulnSummary {
	critical: number;
	high: number;
	scannedAt: string;
	scanner: string;
	signer: string;
}

interface InTotoStatement {
	_type?: string;
	predicateType?: string;
	subject?: Array<{ digest?: { sha256?: string } }>;
	predicate?: {
		scanner?: { uri?: string; version?: string; result?: { Results?: Array<{ Vulnerabilities?: Array<{ Severity?: string }> | null }> } };
		metadata?: { scanFinishedOn?: string };
	};
}

const subjectIs = (statement: InTotoStatement, digest: string): boolean =>
	!!statement.subject?.some((subject) => `sha256:${subject.digest?.sha256}` === digest);

/** The statement a verified bundle carries, checked against the running digest, as counts. */
export function summarise(statement: InTotoStatement, digest: string, signer: string): VulnSummary {
	if (statement.predicateType !== VULN_PREDICATE) throw new Error('the attestation is not a vulnerability attestation');
	if (!subjectIs(statement, digest)) throw new Error('the attestation is for another digest');
	const scanner = statement.predicate?.scanner;
	const results = scanner?.result?.Results;
	if (!results || !statement.predicate?.metadata?.scanFinishedOn) throw new Error('the attestation carries no scan result');
	const findings = results.flatMap((result) => result.Vulnerabilities ?? []);
	const count = (severity: string) => findings.filter((finding) => finding.Severity?.toUpperCase() === severity).length;
	return {
		critical: count('CRITICAL'),
		high: count('HIGH'),
		scannedAt: statement.predicate.metadata.scanFinishedOn,
		scanner: `trivy ${scanner?.version ?? ''}`.trim(),
		signer
	};
}

type Bundle = Parameters<typeof verify>[0];

/** Who signed a bundle the platform trust root verified: the issuer of the certificate and its identity. */
export interface SignerIdentity {
	issuer: string;
	subject: string;
}

export interface VerifiedBundle {
	signer: SignerIdentity;
	statement: InTotoStatement;
}

/** Verifies one bundle against the trust root and returns who signed it and what it states. */
export async function verifyBundle(bundle: Bundle): Promise<VerifiedBundle> {
	// The self-hosted Fulcio embeds no certificate transparency SCT, and the
	// trust root lists no CT log, so the threshold is zero.
	const verified = await verify(bundle, {
		tufMirrorURL: config.attestation.tufMirrorUrl,
		tufRootPath: config.attestation.tufRootFile,
		tufCachePath: config.attestation.cacheDir,
		ctLogThreshold: 0
	});
	const issuer = verified.identity?.extensions?.issuer;
	const subject = verified.identity?.subjectAlternativeName;
	if (!issuer || !subject) throw new Error('the signing certificate names no issuer or identity');
	const payload = (bundle as { dsseEnvelope?: { payload?: string } }).dsseEnvelope?.payload;
	if (!payload) throw new Error('the bundle holds no attestation');
	return { signer: { issuer, subject }, statement: JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as InTotoStatement };
}

/** A registry client for one repository: the Docker token flow with the pull secret's credential. */
export function registryClient(image: RunningImage, authB64: string) {
	let bearer = '';
	const base = `https://${image.registry}/v2/${image.repository}`;
	const get = async (path: string, accept: string): Promise<Response> => {
		const call = () => upstream(`${base}${path}`, { headers: { accept, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } });
		let resp = await call();
		if (resp.status !== 401) return resp;
		const challenge = /Bearer realm="([^"]+)",service="([^"]*)"/.exec(resp.headers.get('www-authenticate') ?? '');
		if (!challenge) return resp;
		const scope = encodeURIComponent(`repository:${image.repository}:pull`);
		const token = await upstream(`${challenge[1]}?service=${encodeURIComponent(challenge[2]!)}&scope=${scope}`, {
			headers: { authorization: `Basic ${authB64}` }
		});
		if (!token.ok) throw new Error(`the registry refused the pull credential (${token.status})`);
		bearer = ((await token.json()) as { token?: string }).token ?? '';
		resp = await call();
		return resp;
	};
	return { get };
}

/** The first credential of a Docker config file for a registry, as the Basic value. */
export function credentialFor(configJson: string, registry: string): string {
	const auth = (JSON.parse(configJson) as { auths?: Record<string, { auth?: string }> }).auths?.[registry]?.auth;
	if (!auth) throw new Error('the pull secret holds no credential for the registry');
	return auth;
}

/** Every attestation bundle of one predicate type that rides the running digest, as the registry serves them. */
async function attestationBundles(image: RunningImage, authB64: string, predicateType: string): Promise<Bundle[]> {
	const registry = registryClient(image, authB64);
	const index = await registry.get(`/referrers/${image.digest}`, 'application/vnd.oci.image.index.v1+json');
	if (!index.ok) throw new Error(`the registry answered ${index.status} for the referrers of the running digest`);
	const manifests =
		((await index.json()) as { manifests?: Array<{ digest: string; artifactType?: string; annotations?: Record<string, string> }> }).manifests ?? [];
	const mine = manifests.filter((m) => m.artifactType === BUNDLE_TYPE && m.annotations?.[PREDICATE_ANNOTATION] === predicateType);
	return Promise.all(
		mine.map(async (m) => {
			const manifest = await registry.get(`/manifests/${m.digest}`, 'application/vnd.oci.image.manifest.v1+json');
			const layer = ((await manifest.json()) as { layers?: Array<{ digest: string }> }).layers?.[0];
			if (!manifest.ok || !layer) throw new Error('an attestation manifest could not be read');
			const blob = await registry.get(`/blobs/${layer.digest}`, '*/*');
			if (!blob.ok) throw new Error('an attestation bundle could not be read');
			return (await blob.json()) as Bundle;
		})
	);
}

/**
 * The verified vulnerability attestation of the running digest, the newest
 * when there are several, signed by the identity that signed the digest's
 * provenance. Throws when there is none, or when none verifies.
 */
export async function readVulnerabilityAttestation(): Promise<VulnSummary> {
	const { imageRef, authFile } = config.attestation;
	const image = parseImageRef(imageRef);
	const authB64 = credentialFor(readFileSync(authFile, 'utf8'), image.registry);
	const [scans, provenances] = await Promise.all([
		attestationBundles(image, authB64, VULN_PREDICATE),
		attestationBundles(image, authB64, PROVENANCE_PREDICATE)
	]);
	if (scans.length === 0) throw new Error('the running digest has no vulnerability attestation: it was not scanned');
	// Who the platform trusts for this digest: the signers of its verified provenance.
	const trusted: SignerIdentity[] = [];
	for (const bundle of provenances) {
		try {
			const provenance = await verifyBundle(bundle);
			if (provenance.statement.predicateType === PROVENANCE_PREDICATE && subjectIs(provenance.statement, image.digest)) trusted.push(provenance.signer);
		} catch {
			// A provenance that does not verify names no one.
		}
	}
	if (trusted.length === 0) throw new Error('the running digest has no verifiable provenance to say who may sign its scan');
	const verified: VulnSummary[] = [];
	let failure: unknown;
	for (const bundle of scans) {
		try {
			const { signer, statement } = await verifyBundle(bundle);
			if (!trusted.some((who) => who.issuer === signer.issuer && who.subject === signer.subject))
				throw new Error('the scan is not signed by the identity that signed the image');
			verified.push(summarise(statement, image.digest, signer.subject));
		} catch (err) {
			failure = err;
		}
	}
	if (verified.length === 0) {
		log('error', 'no vulnerability attestation verified', { error: failure instanceof Error ? failure.message : String(failure) });
		throw new Error('no vulnerability attestation of the running digest verified');
	}
	return verified.sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))[0]!;
}

// A verified attestation is bound to a digest and does not change, so it is
// read once per digest. The first read fetches the trust root and can outlast
// a status check; it keeps running and the next check finds it done.
let cached: { ref: string; result: Promise<VulnSummary> } | null = null;

export function attestationOnce(): Promise<VulnSummary> {
	const ref = config.attestation.imageRef;
	if (cached?.ref !== ref) {
		const result = readVulnerabilityAttestation();
		result.catch(() => {
			if (cached?.result === result) cached = null;
		});
		cached = { ref, result };
	}
	return cached.result;
}

export function resetAttestation(): void {
	cached = null;
}
