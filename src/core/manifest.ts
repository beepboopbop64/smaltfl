/**
 * Run manifests and identity cards. A manifest records what a run executed and produced, by hash: the flow, the
 * typed flow plan, every node's key and every stored dataset's content. Signed with an identity card's key, it can be
 * checked by anyone it is shared with (ADR 0001 §8, ADR 0002 §1).
 *
 * WebCrypto only: ECDSA P-256 with SHA-256. A private key is created non-extractable and never leaves its browser.
 */
import { canonicalJSON } from './canonical.js';
import { hashOf, hex, unhex, utf8 } from './hash.js';
import type { KeyEnv } from './keys.js';
import type { FailAction, FlowPlan, PlanNode } from './plan.js';

/** run/1 (ADR 0006): run/0 and the source files read, the flow's policies and ontology, the build, the data and the record. */
export const MANIFEST_FORMAT = 1;

export interface ExpectationResult {
  /** Rows the expectation read. */
  rows: number;
  /** Rows its drop rules left out. */
  dropped: number;
  rules: { name: string; onFail: FailAction; failed: number }[];
}

export interface ManifestNode {
  node: number;
  origin: string;
  op: PlanNode['op'];
  key: string;
  /** built: a new version was stored (for a source: a new snapshot); reused: its key was already stored; folded: computed inside a stored node's statement. */
  status: 'built' | 'reused' | 'folded';
  /** Stored nodes: the content hash and row count of their version. */
  content?: string;
  rows?: number;
  expectations?: ExpectationResult;
  /** A source read from a pinned file: the file, as the engine observed it (run/1). */
  file?: SourceFile;
}

/** A file a source read (E1): its location, and the SHA-256 and size of the exact bytes the engine decoded. */
export interface SourceFile {
  location: string;
  sha256: string;
  bytes: number;
}

export interface DatasetRecord {
  key: string;
  content: string;
  rows: number;
}

export interface RunManifest {
  smaltflRun: 0 | 1;
  /** run/1 adds the hashes of the flow's policies and ontology (E5). */
  flow: { id: string; hash: string; policies?: string; ontology?: string };
  /** The hash of the typed flow plan that ran (stored with the run). */
  plan: string;
  parameters: Record<string, string | number | null>;
  engine: KeyEnv;
  nodes: ManifestNode[];
  outputs: Record<string, DatasetRecord>;
  /** run/1: the code that ran it: smaltfl's commit (or dev) and every plugin in the engine, with its version. */
  build?: { smaltfl: string; plugins: [string, string][] };
  /** run/1, the caller's claims: the data branch commit and MANIFEST.json hash it loaded from, and its record's head. */
  data?: { commit: string; manifest: string } | null;
  log?: { origin: string; size: number; root: string } | null;
  /** The previous run of this flow in the same database, by manifest hash. */
  previous: string | null;
}

/**
 * A plan's hash kind, by its own format (ADR 0009 E10, ADR 0010 E13, ADR 0011 E14): plan/3 for the plan of a format-4
 * document (its steps its notebooks' cells), plan/2 for a plan that says how its sources are judged, plan/1 for one
 * that says what holds it, else plan/0, so a plan without a publish block hashes byte for byte as
 * it always did. Q-47 is decided here and in `documentFormat`.
 */
export const planKind = (plan: Pick<FlowPlan, 'smaltflPlan'>): 'plan/0' | 'plan/1' | 'plan/2' | 'plan/3' =>
  plan.smaltflPlan === 3 ? 'plan/3' : plan.smaltflPlan === 2 ? 'plan/2' : plan.smaltflPlan === 1 ? 'plan/1' : 'plan/0';
export const planHash = (plan: FlowPlan): Promise<string> => hashOf(planKind(plan), plan);
/** A manifest's hash, by its own format: run/0 manifests made before run/1 still verify. */
export const manifestKind = (manifest: RunManifest): string => (manifest.smaltflRun === 1 ? 'run/1' : 'run/0');
export const manifestHash = (manifest: RunManifest): Promise<string> => hashOf(manifestKind(manifest), manifest);
/** E5: what the flow lets whom see, and what its objects are, each by itself. */
export const policiesHash = (policies: unknown): Promise<string> => hashOf('policies/0', policies ?? null);
export const ontologyHash = (ontology: unknown): Promise<string> => hashOf('ontology/0', ontology ?? null);

// ------------------------------------------------------------------ identity cards

/** A person's public identity: shared to be added as a principal (ADR 0002 §1). */
export interface IdentityCard {
  smaltflCard: 0;
  name: string;
  /** The public signing key (ECDSA P-256), as a JWK. */
  key: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
  /** The hash of the key alone: renaming a card does not change who it is. */
  fingerprint: string;
}

export interface Identity {
  card: IdentityCard;
  /** Non-extractable: it can sign, but it can't be exported or copied. */
  privateKey: CryptoKey;
}

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export async function createIdentity(name: string): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const key = { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x!, y: jwk.y! };
  return { card: { smaltflCard: 0, name, key, fingerprint: await fingerprint(key) }, privateKey: pair.privateKey };
}

export function fingerprint(key: IdentityCard['key']): Promise<string> {
  return hashOf('card-key/0', key);
}

// ------------------------------------------------------------------ signing

export interface SignedManifest {
  manifest: RunManifest;
  signer: IdentityCard;
  /** ECDSA P-256 / SHA-256 over the manifest's tagged canonical JSON, as hex (r ‖ s). */
  signature: string;
}

const signedBytes = (manifest: RunManifest) => utf8(`smaltfl/${manifestKind(manifest)}\n${canonicalJSON(manifest)}`);

export async function signManifest(manifest: RunManifest, identity: Identity): Promise<SignedManifest> {
  const sig = await crypto.subtle.sign(SIGN, identity.privateKey, signedBytes(manifest));
  return { manifest, signer: identity.card, signature: hex(new Uint8Array(sig)) };
}

export type SignatureCheck = { ok: true } | { ok: false; reason: string };

/**
 * Check a signed manifest: the signer's fingerprint matches its key, the signature matches the manifest, and, when
 * `trusted` is given, the signer is that card.
 */
export async function verifyManifest(signed: SignedManifest, trusted?: IdentityCard): Promise<SignatureCheck> {
  if ((await fingerprint(signed.signer.key)) !== signed.signer.fingerprint) return { ok: false, reason: "the signer's fingerprint doesn't match its key" };
  if (trusted && trusted.fingerprint !== signed.signer.fingerprint) return { ok: false, reason: `signed by ${signed.signer.name} (${signed.signer.fingerprint.slice(0, 16)}), not by ${trusted.name}` };
  let ok: boolean;
  try {
    const key = await crypto.subtle.importKey('jwk', { ...signed.signer.key, ext: true }, ECDSA, false, ['verify']);
    ok = await crypto.subtle.verify(SIGN, key, unhex(signed.signature), signedBytes(signed.manifest));
  } catch {
    ok = false;
  }
  return ok ? { ok: true } : { ok: false, reason: "the signature doesn't match the manifest" };
}
