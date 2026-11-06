/**
 * The integrity record (ADR 0006): what was done to a flow and by whom, as an append-only log in a Merkle tree
 * (log/1, RFC 9162, Certificate Transparency v2), and checkpoints that sign the tree's size and root (checkpoint/0).
 * This is its pure core: entries, the tree, proofs, checkpoints. Keeping it, in IndexedDB, is the caller's work.
 *
 * What the record proves. Every entry is hashed into a leaf and the leaves into one root, so a record that verifies
 * has its entries in the order they were appended, and an inclusion proof shows one entry is in a tree of a given
 * root, a consistency proof that a later tree only added entries to an earlier one. Kept in one browser, that
 * proves order and integrity against accidents (a lost or damaged write) and naive edits (an entry changed,
 * removed or put in between by hand, which no longer matches the root). It proves nothing against someone who can
 * rewrite the whole store: they can recompute every leaf and the root, and the rewritten record verifies as well
 * as the original. Against them only a checkpoint held outside the browser proves anything: a size and root signed
 * earlier and kept elsewhere (another device, a file sent to someone, a server), which the record must still
 * match. Nor does the record prove that what an entry says is true, that the device clock in `at` was right, or
 * that nothing went unrecorded.
 *
 * Entries are hashed as `smaltfl/log/1\n` and their canonical JSON (RFC 8785). The tree works from leaf hashes, as
 * lowercase hex, so a caller can keep leaf hashes rather than entries, and it is synchronous (src/core/sha256.ts),
 * so an append can be hashed inside an IndexedDB transaction, where awaiting WebCrypto would end it. Checkpoints
 * are signed with WebCrypto, like manifests (manifest.ts).
 */
import { canonicalJSON } from './canonical.js';
import { hex, unhex, utf8 } from './hash.js';
import { fingerprint, type Identity, type IdentityCard } from './manifest.js';
import { SHA256_PADDING, sha256Into } from './sha256.js';

export const LOG_FORMAT = 1;
export const CHECKPOINT_FORMAT = 0;

/** Plain JSON data, as canonical JSON accepts it. */
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

/** One entry of a record: log/1. */
export interface LogEntry {
  smaltflLog: typeof LOG_FORMAT;
  /** The log it belongs to: a flow's record is `logOrigin(flow id, signer's fingerprint)`. */
  origin: string;
  /** Its place in the log, from 0: its leaf index. */
  seq: number;
  /** What happened, such as a run, an action or a policy change. */
  kind: string;
  /** When, by the device clock (ISO 8601). */
  at: string;
  /** Who: the signer's card fingerprint (null when no card signed), and the principal the person acts as. */
  by: { card: string | null; as: string };
  /** What it is about: the run, the rows, the rule. */
  about: JSONValue;
  /** Why, when the person said. */
  reason: string | null;
  /** The seq of an earlier entry this one corrects. Entries are never changed: a correction is a new entry. */
  amends: number | null;
  /** 128 random bits, as hex: two entries that say the same thing still hash differently. */
  nonce: string;
}

/** A checkpoint's content: a log's size and root, as checkpoint/0 states them. */
export interface Checkpoint {
  origin: string;
  size: number;
  /** The tree's root, as hex. */
  root: string;
}

/** A signed checkpoint, kept outside the browser to anchor the record. */
export interface SignedCheckpoint {
  /** The body: `<origin>\n<size>\n<base64 root>\n`. */
  checkpoint: string;
  signer: IdentityCard;
  /** ECDSA P-256 / SHA-256 over `smaltfl/checkpoint/0\n` and the body, as hex (r ‖ s). */
  signature: string;
}

export type CheckpointCheck =
  | (Checkpoint & { ok: true; signer: IdentityCard; known: boolean; reason: null })
  | { ok: false; origin: string | null; size: number | null; root: string | null; signer: IdentityCard | null; known: false; reason: string };

export interface RecordCheck {
  ok: boolean;
  /** The log the record is of: its checkpoints' origin, else its first entry's; null when there is neither. */
  origin: string | null;
  /** How many entries, from the first, pass every check: all of them when the record is ok. */
  size: number;
  /** The root of the tree of those entries. */
  root: string;
  /**
   * The first entry that fails a check or that no checkpoint can vouch for; the record's length when it is shorter
   * than a checkpoint; null when the record is ok, or when what fails is the checkpoints and not an entry.
   */
  firstBad: number | null;
  reason: string | null;
}

/** The root of the empty tree: SHA-256 of nothing. */
export const EMPTY_ROOT = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// ------------------------------------------------------------------ entries

/** 128 random bits as lowercase hex, for an entry's nonce. */
export function newNonce(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

/** What an entry says, besides its log, place and nonce. */
export interface EntryFields {
  kind: string;
  by: LogEntry['by'];
  /** Null when left out. */
  about?: JSONValue;
  reason?: string | null;
  amends?: number | null;
  /** Now when left out. */
  at?: string | Date;
}

/** A new entry for a log at `seq`, with a fresh nonce. Throws when the entry would not be a valid log/1 entry. */
export function entryOf(origin: string, seq: number, fields: EntryFields): LogEntry {
  const at = fields.at === undefined ? new Date() : fields.at;
  const entry: LogEntry = {
    smaltflLog: LOG_FORMAT,
    origin,
    seq,
    kind: fields.kind,
    at: typeof at === 'string' ? at : at.toISOString(),
    by: { card: fields.by.card, as: fields.by.as },
    about: fields.about === undefined ? null : fields.about,
    reason: fields.reason ?? null,
    amends: fields.amends ?? null,
    nonce: newNonce(),
  };
  const problem = entryProblem(entry, seq);
  if (problem) throw new TypeError(`not a log entry: ${problem}`);
  return entry;
}

/** The bytes an entry is hashed as: `smaltfl/log/1\n` and its canonical JSON, in UTF-8. */
export function entryData(entry: LogEntry): Uint8Array {
  return utf8(`smaltfl/log/${LOG_FORMAT}\n${canonicalJSON(entry)}`);
}

/** An entry's leaf hash, as hex. Synchronous, so an append can be hashed inside a database transaction. */
export function entryLeaf(entry: LogEntry): string {
  return hex(leafBytes(entryData(entry)));
}

/** The RFC 9162 leaf hash of any data: SHA-256 of 0x00 and the data, as hex. */
export function leafHash(data: Uint8Array): string {
  return hex(leafBytes(data));
}

const ENTRY_KEYS = ['about', 'amends', 'at', 'by', 'kind', 'nonce', 'origin', 'reason', 'seq', 'smaltflLog'];
const HEX64 = /^[0-9a-f]{64}$/;
const NONCE = /^[0-9a-f]{32}$/;
/** An RFC 3339 time, the profile of ISO 8601 that `toISOString` writes, checked the same way in every browser. */
const ISO_TIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

const isOrigin = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !value.includes('\n');
const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const sameKeys = (value: Record<string, unknown>, keys: readonly string[]) => {
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((k, i) => k === keys[i]);
};

/** What is wrong with a value as the log/1 entry at `seq`, or null when nothing is. */
function entryProblem(value: unknown, seq: number): string | null {
  if (!isPlain(value)) return 'is not an object';
  if (!sameKeys(value, ENTRY_KEYS)) return `doesn't have exactly the fields of a log/1 entry (${ENTRY_KEYS.join(', ')})`;
  if (value.smaltflLog !== LOG_FORMAT) return `is not a log/${LOG_FORMAT} entry`;
  if (!isOrigin(value.origin)) return 'has no origin, or one with a line break';
  if (!isSize(value.seq) || value.seq !== seq) return `has seq ${JSON.stringify(value.seq)} where ${seq} belongs`;
  if (typeof value.kind !== 'string' || value.kind === '') return 'has no kind';
  if (typeof value.at !== 'string' || !ISO_TIME.test(value.at)) return "doesn't say when, as an ISO 8601 time";
  const by = value.by;
  if (!isPlain(by) || !sameKeys(by, ['as', 'card'])) return "doesn't say who, as { card, as }";
  if (by.card !== null && (typeof by.card !== 'string' || !HEX64.test(by.card))) return "has a card that isn't a fingerprint (64 hex)";
  if (typeof by.as !== 'string' || by.as === '') return "doesn't say which principal the person acts as";
  if (value.reason !== null && typeof value.reason !== 'string') return 'has a reason that is not text';
  const amends = value.amends;
  if (amends !== null && (typeof amends !== 'number' || !Number.isInteger(amends) || amends < 0 || amends >= seq)) return 'amends something other than an earlier entry';
  if (typeof value.nonce !== 'string' || !NONCE.test(value.nonce)) return "has a nonce that isn't 128 bits of hex";
  try {
    canonicalJSON(value.about);
  } catch {
    return 'is about something that is not plain JSON';
  }
  return null;
}

// ------------------------------------------------------------------ the tree (RFC 9162 §2.1)

const words = new Uint32Array(8);
const nodeBuffer = new Uint8Array(65 + SHA256_PADDING);

/** SHA-256 of `buf[0, length)` as bytes; `buf` has room for the padding. */
function digest(buf: Uint8Array, length: number): Uint8Array {
  sha256Into(buf, length, words, 0);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const w = words[i]!;
    out[i * 4] = w >>> 24;
    out[i * 4 + 1] = w >>> 16;
    out[i * 4 + 2] = w >>> 8;
    out[i * 4 + 3] = w;
  }
  return out;
}

function leafBytes(data: Uint8Array): Uint8Array {
  const buf = new Uint8Array(1 + data.length + SHA256_PADDING);
  buf.set(data, 1);
  return digest(buf, 1 + data.length);
}

function nodeBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  nodeBuffer[0] = 1;
  nodeBuffer.set(left, 1);
  nodeBuffer.set(right, 33);
  return digest(nodeBuffer, 65);
}

const EMPTY = unhex(EMPTY_ROOT);

/** The largest power of two smaller than n, for n > 1. Arithmetic, not bit operations: sizes may pass 2^32. */
function split(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

const isSize = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const isPowerOfTwo = (n: number) => {
  while (n > 1 && n % 2 === 0) n /= 2;
  return n === 1;
};
const odd = (n: number) => n % 2 === 1;
const half = (n: number) => Math.floor(n / 2);

/** MTH(D[lo:hi]), RFC 9162 §2.1.1. */
function mth(leaves: readonly Uint8Array[], lo: number, hi: number): Uint8Array {
  const n = hi - lo;
  if (n === 0) return EMPTY;
  if (n === 1) return leaves[lo]!;
  const k = split(n);
  return nodeBytes(mth(leaves, lo, lo + k), mth(leaves, lo + k, hi));
}

/** PATH(m, D[lo:hi]), RFC 9162 §2.1.3.1, from the leaf up. */
function path(leaves: readonly Uint8Array[], m: number, lo: number, hi: number, out: Uint8Array[]): void {
  const n = hi - lo;
  if (n <= 1) return;
  const k = split(n);
  if (m < k) {
    path(leaves, m, lo, lo + k, out);
    out.push(mth(leaves, lo + k, hi));
  } else {
    path(leaves, m - k, lo + k, hi, out);
    out.push(mth(leaves, lo, lo + k));
  }
}

/** SUBPROOF(m, D[lo:hi], b), RFC 9162 §2.1.4.1. */
function subproof(leaves: readonly Uint8Array[], m: number, lo: number, hi: number, b: boolean, out: Uint8Array[]): void {
  const n = hi - lo;
  if (m === n) {
    if (!b) out.push(mth(leaves, lo, hi));
    return;
  }
  const k = split(n);
  if (m <= k) {
    subproof(leaves, m, lo, lo + k, b, out);
    out.push(mth(leaves, lo + k, hi));
  } else {
    subproof(leaves, m - k, lo + k, hi, false, out);
    out.push(mth(leaves, lo, lo + k));
  }
}

/** The first `size` leaves as bytes. Leaves are hashes the caller made, so a malformed one is a mistake: it throws. */
function leafHashes(leaves: readonly string[], size: number, what: string): Uint8Array[] {
  if (!isSize(size) || size > leaves.length) throw new RangeError(`${what}: size ${size} is not between 0 and the ${leaves.length} leaves given`);
  const out: Uint8Array[] = [];
  for (let i = 0; i < size; i++) {
    const leaf = leaves[i];
    if (typeof leaf !== 'string' || !HEX64.test(leaf)) throw new TypeError(`${what}: leaf ${i} is not a hash (64 lowercase hex)`);
    out.push(unhex(leaf));
  }
  return out;
}

/** A hash from outside, for checking: its bytes, or null when it isn't 64 lowercase hex. */
const hashBytes = (value: unknown): Uint8Array | null => (typeof value === 'string' && HEX64.test(value) ? unhex(value) : null);

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The root of the tree of the first `size` leaves (all of them by default), as hex. */
export function rootOf(leaves: readonly string[], size: number = leaves.length): string {
  const hashes = leafHashes(leaves, size, 'rootOf');
  return hex(mth(hashes, 0, size));
}

/** The inclusion proof of leaf `index` in the tree of the first `size` leaves: its audit path, from the leaf up. */
export function inclusionProof(leaves: readonly string[], index: number, size: number): string[] {
  const hashes = leafHashes(leaves, size, 'inclusionProof');
  if (!isSize(index) || index >= size) throw new RangeError(`inclusionProof: leaf ${index} is not in a tree of ${size}`);
  const out: Uint8Array[] = [];
  path(hashes, index, 0, size, out);
  return out.map(hex);
}

/**
 * Whether `proof` shows that `leaf` is leaf `index` of the tree of `size` leaves with root `root` (RFC 9162
 * §2.1.3.2). Anything malformed is false, not an error: proofs and roots come from elsewhere. The size is checked
 * only through the root (one proof can fit trees of more than one size, and at another size another index), so the
 * root must be known for that size, as a checkpoint states them together.
 */
export function verifyInclusion(leaf: string, index: number, size: number, proof: readonly string[], root: string): boolean {
  const hash = hashBytes(leaf);
  const expected = hashBytes(root);
  if (!hash || !expected || !isSize(index) || !isSize(size) || index >= size || !Array.isArray(proof)) return false;
  let fn = index;
  let sn = size - 1;
  let r = hash;
  for (const text of proof) {
    const p = hashBytes(text);
    if (!p || sn === 0) return false;
    if (odd(fn) || fn === sn) {
      r = nodeBytes(p, r);
      while (!odd(fn) && fn !== 0) {
        fn = half(fn);
        sn = half(sn);
      }
    } else {
      r = nodeBytes(r, p);
    }
    fn = half(fn);
    sn = half(sn);
  }
  return sn === 0 && equal(r, expected);
}

/**
 * The consistency proof between the trees of the first `m` and the first `n` leaves (RFC 9162 §2.1.4.1): empty when
 * m is 0 or m is n, which need none.
 */
export function consistencyProof(leaves: readonly string[], m: number, n: number): string[] {
  const hashes = leafHashes(leaves, n, 'consistencyProof');
  if (!isSize(m) || m > n) throw new RangeError(`consistencyProof: ${m} is not between 0 and ${n}`);
  if (m === 0) return [];
  const out: Uint8Array[] = [];
  subproof(hashes, m, 0, n, true, out);
  return out.map(hex);
}

/**
 * Whether `proof` shows that the tree of `n` leaves with root `rootN` extends the tree of `m` leaves with root
 * `rootM`: it has the same first m leaves (RFC 9162 §2.1.4.2). The RFC's algorithm is for 0 < m < n; for m = n the
 * proof is empty and the roots are equal, and for m = 0 the proof is empty and rootM is the empty tree's root (and
 * so is rootN when n is 0 too). As with inclusion, the sizes are checked only through the roots: each root must be
 * known for its size, as checkpoints state them.
 */
export function verifyConsistency(m: number, n: number, rootM: string, rootN: string, proof: readonly string[]): boolean {
  const first = hashBytes(rootM);
  const second = hashBytes(rootN);
  if (!first || !second || !isSize(m) || !isSize(n) || m > n || !Array.isArray(proof)) return false;
  if (m === 0) return proof.length === 0 && equal(first, EMPTY) && (n > 0 || equal(second, EMPTY));
  if (m === n) return proof.length === 0 && equal(first, second);
  if (proof.length === 0) return false;
  const chain: Uint8Array[] = [];
  for (const text of proof) {
    const c = hashBytes(text);
    if (!c) return false;
    chain.push(c);
  }
  if (isPowerOfTwo(m)) chain.unshift(first);
  let fn = m - 1;
  let sn = n - 1;
  while (odd(fn)) {
    fn = half(fn);
    sn = half(sn);
  }
  let fr = chain[0]!;
  let sr = chain[0]!;
  for (const c of chain.slice(1)) {
    if (sn === 0) return false;
    if (odd(fn) || fn === sn) {
      fr = nodeBytes(c, fr);
      sr = nodeBytes(c, sr);
      while (!odd(fn) && fn !== 0) {
        fn = half(fn);
        sn = half(sn);
      }
    } else {
      sr = nodeBytes(sr, c);
    }
    fn = half(fn);
    sn = half(sn);
  }
  return sn === 0 && equal(fr, first) && equal(sr, second);
}

// ------------------------------------------------------------------ the record

/**
 * Check a record: every entry is a log/1 entry of the same log, at its place (seq contiguous from 0), and the
 * record matches every checkpoint given (its first `size` entries have that root). Checkpoints are ones the caller
 * has verified (verifyCheckpoint) and kept outside the browser; without one, a record rewritten whole verifies.
 *
 * When a checkpoint's root doesn't match, the tree can't say which entry changed, only that one before its size
 * did: `firstBad` is then the size of the largest smaller checkpoint that matched (or 0), the first entry nothing
 * vouches for. Entries and checkpoints are checked in one pass, in order, so the first fault is the one reported,
 * and a checkpoint at every size costs little more than one.
 */
export function verifyRecord(entries: readonly unknown[], checkpoints: readonly Checkpoint[] = []): RecordCheck {
  const refuse = (reason: string): RecordCheck => ({ ok: false, origin: null, size: 0, root: EMPTY_ROOT, firstBad: null, reason });
  if (!Array.isArray(entries)) return refuse('the record is not a list of entries');
  if (!Array.isArray(checkpoints)) return refuse('the checkpoints are not a list');
  for (const [i, cp] of checkpoints.entries()) {
    if (!isPlain(cp) || !isOrigin(cp.origin) || !isSize(cp.size) || !hashBytes(cp.root)) return refuse(`checkpoint ${i} is not a checkpoint: an origin, a size and a root`);
    // A verifyCheckpoint result can be passed in as it is, but only one that succeeded.
    if (cp.ok === false) return refuse(`checkpoint ${i} failed its check`);
    if (cp.size === 0 && cp.root !== EMPTY_ROOT) return refuse(`checkpoint ${i} is at size 0 with a root other than the empty tree's`);
  }
  const first: unknown = entries[0];
  const origin = checkpoints[0]?.origin ?? (isPlain(first) && isOrigin(first.origin) ? first.origin : null);
  const sorted = [...checkpoints].sort((a, b) => a.size - b.size);
  for (const [i, cp] of sorted.entries()) {
    if (cp.origin !== origin) return { ...refuse(`the checkpoints are of different logs: ${origin} and ${cp.origin}`), origin };
    const before = sorted[i - 1];
    if (before && before.size === cp.size && before.root !== cp.root) return { ...refuse(`the checkpoints disagree: two roots at size ${cp.size}`), origin };
  }
  // The roots of the perfect subtrees the leaves so far make, largest first, and their heights: folded from the
  // right, they are MTH of the leaves so far (RFC 9162 §2.1.1 splits off the largest power of two each time).
  const frontier: Uint8Array[] = [];
  const heights: number[] = [];
  const rootNow = (): string => {
    let r = frontier[frontier.length - 1];
    if (!r) return EMPTY_ROOT;
    for (let j = frontier.length - 2; j >= 0; j--) r = nodeBytes(frontier[j]!, r);
    return hex(r);
  };
  const result = (size: number, root: string, firstBad: number | null, reason: string | null): RecordCheck => ({ ok: reason === null, origin, size, root, firstBad, reason });
  let vouched = 0;
  let vouchedRoot = EMPTY_ROOT;
  let next = 0;
  for (let i = 0; ; i++) {
    while (next < sorted.length && sorted[next]!.size === i) {
      const cp = sorted[next++]!;
      const root = rootNow();
      if (root !== cp.root) {
        const where = vouched === 0 ? `before entry ${cp.size}` : `between entries ${vouched} and ${cp.size - 1}`;
        return result(vouched, vouchedRoot, vouched, `the record doesn't match its checkpoint at size ${cp.size}: an entry ${where} was changed, removed or put in`);
      }
      vouched = i;
      vouchedRoot = root;
    }
    if (i === entries.length) break;
    const entry: unknown = entries[i];
    const problem = entryProblem(entry, i);
    if (problem) return result(i, rootNow(), i, `entry ${i} ${problem}`);
    const entryOrigin = (entry as LogEntry).origin;
    if (entryOrigin !== origin) return result(i, rootNow(), i, `entry ${i} is of ${entryOrigin}, not of ${origin}`);
    let hash = leafBytes(entryData(entry as LogEntry));
    let height = 0;
    while (heights.length > 0 && heights[heights.length - 1] === height) {
      hash = nodeBytes(frontier.pop()!, hash);
      heights.pop();
      height++;
    }
    frontier.push(hash);
    heights.push(height);
  }
  const size = entries.length;
  if (next < sorted.length) {
    return result(size, rootNow(), size, `the record has ${size} entries, but a checkpoint was signed at ${sorted[next]!.size}: entries are missing from its end`);
  }
  return result(size, rootNow(), null, null);
}

// ------------------------------------------------------------------ checkpoints (checkpoint/0)

/** A flow's record's origin: the flow, and the first 16 hex of the fingerprint of the card that signs its checkpoints. */
export function logOrigin(flowId: string, signer: string): string {
  if (!HEX64.test(signer)) throw new TypeError('logOrigin: the signer is a card fingerprint (64 lowercase hex)');
  return `smaltfl/log/${encodeURIComponent(flowId)}/${signer.slice(0, 16)}`;
}

/** The origin of a flow's record names who signs its checkpoints. */
const FLOW_LOG = /^smaltfl\/log\/[^/]*\/([0-9a-f]{16})$/;

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A checkpoint's body: its origin, its size in decimal and its root in base64, each on a line. */
export function checkpointBody(origin: string, size: number, root: string): string {
  if (!isOrigin(origin)) throw new TypeError('a checkpoint origin is a line of text');
  if (!isSize(size)) throw new RangeError(`a checkpoint size is a whole number, not ${size}`);
  if (!HEX64.test(root)) throw new TypeError('a checkpoint root is a hash (64 lowercase hex)');
  if (size === 0 && root !== EMPTY_ROOT) throw new RangeError("a checkpoint at size 0 has the empty tree's root");
  return `${origin}\n${size}\n${base64(unhex(root))}\n`;
}

/** A checkpoint body's content, parsed strictly: exactly three lines, a decimal size, a 44-character base64 root. */
export function parseCheckpoint(body: string): Checkpoint {
  if (typeof body !== 'string' || !body.endsWith('\n')) throw new TypeError("the checkpoint doesn't end with a line break");
  const lines = body.slice(0, -1).split('\n');
  if (lines.length !== 3) throw new TypeError(`the checkpoint has ${lines.length} lines, not three: origin, size and root`);
  const [origin, sizeText, rootText] = lines as [string, string, string];
  if (origin === '') throw new TypeError('the checkpoint has no origin');
  if (!/^(0|[1-9][0-9]*)$/.test(sizeText) || !Number.isSafeInteger(Number(sizeText))) throw new TypeError(`the checkpoint's size ${JSON.stringify(sizeText)} is not a decimal number`);
  let root: Uint8Array | null = null;
  if (/^[A-Za-z0-9+/]{43}=$/.test(rootText)) {
    const bytes = Uint8Array.from(atob(rootText), (c) => c.charCodeAt(0));
    if (base64(bytes) === rootText) root = bytes;
  }
  if (!root) throw new TypeError("the checkpoint's root is not 32 bytes of standard, padded base64");
  return { origin, size: Number(sizeText), root: hex(root) };
}

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

const checkpointBytes = (body: string) => utf8(`smaltfl/checkpoint/${CHECKPOINT_FORMAT}\n${body}`);

/** Sign a log's size and root with an identity. */
export async function signCheckpoint(identity: Identity, origin: string, size: number, root: string): Promise<SignedCheckpoint> {
  const body = checkpointBody(origin, size, root);
  const signature = await crypto.subtle.sign(SIGN, identity.privateKey, checkpointBytes(body));
  return { checkpoint: body, signer: identity.card, signature: hex(new Uint8Array(signature)) };
}

/** The card's key, when it has the shape of one: only its four fields, which its fingerprint covers. */
function cardKey(card: unknown): IdentityCard['key'] | null {
  if (!isPlain(card) || card.smaltflCard !== 0 || typeof card.fingerprint !== 'string' || typeof card.name !== 'string' || !isPlain(card.key)) return null;
  const { kty, crv, x, y } = card.key;
  if (kty !== 'EC' || crv !== 'P-256' || typeof x !== 'string' || typeof y !== 'string') return null;
  return { kty, crv, x, y };
}

/**
 * Check a signed checkpoint: its body parses, its signer's fingerprint matches the signer's key, the signature
 * matches the body, a flow record's origin names the signer, and a size of 0 has the empty tree's root, the only one
 * it can have. `known` says whether the signer is the `trusted` card (by fingerprint); a valid checkpoint by
 * someone else is still ok, and not known.
 */
export async function verifyCheckpoint(envelope: unknown, trusted?: IdentityCard): Promise<CheckpointCheck> {
  let claimed: Checkpoint | null = null;
  let signer: IdentityCard | null = null;
  const fail = (reason: string): CheckpointCheck => ({ ok: false, origin: claimed?.origin ?? null, size: claimed?.size ?? null, root: claimed?.root ?? null, signer, known: false, reason });
  if (!isPlain(envelope) || typeof envelope.checkpoint !== 'string' || typeof envelope.signature !== 'string') {
    return fail('this is not a signed checkpoint: a checkpoint, a signer and a signature');
  }
  const key = cardKey(envelope.signer);
  if (key) signer = envelope.signer as IdentityCard;
  try {
    claimed = parseCheckpoint(envelope.checkpoint);
  } catch (e) {
    return fail((e as Error).message);
  }
  if (!signer || !key) return fail('the signer is not an identity card');
  if ((await fingerprint(key)) !== signer.fingerprint) return fail("the signer's fingerprint doesn't match its key");
  let ok = false;
  if (/^[0-9a-f]{128}$/.test(envelope.signature)) {
    try {
      const publicKey = await crypto.subtle.importKey('jwk', { ...key, ext: true }, ECDSA, false, ['verify']);
      ok = await crypto.subtle.verify(SIGN, publicKey, unhex(envelope.signature), checkpointBytes(envelope.checkpoint));
    } catch {
      ok = false;
    }
  }
  if (!ok) return fail("the signature doesn't match the checkpoint");
  const named = FLOW_LOG.exec(claimed.origin)?.[1];
  if (named !== undefined && named !== signer.fingerprint.slice(0, 16)) {
    return fail(`the checkpoint is of a log signed by ${named}, but ${signer.name} (${signer.fingerprint.slice(0, 16)}) signed it`);
  }
  if (claimed.size === 0 && claimed.root !== EMPTY_ROOT) return fail("the checkpoint is at size 0 with a root other than the empty tree's");
  return { ok: true, ...claimed, signer, known: trusted?.fingerprint === signer.fingerprint, reason: null };
}
