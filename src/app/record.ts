/**
 * The record (ADR 0006 §6): everything that happened to a flow in this browser, in one append-only RFC 9162 log
 * (src/core/log.ts), kept in IndexedDB, its head signed as a checkpoint by this browser's identity.
 *
 * - An append is one IndexedDB transaction, the entry hashed synchronously before it, so a closed tab can't leave half
 *   an entry. The checkpoint is signed after, in a second step: a tail not yet signed says so, it isn't broken.
 * - The identity is a non-extractable ECDSA key, kept in IndexedDB (structured clone keeps a CryptoKey without
 *   exposing it), named "This browser" until the person names it.
 * - Documents, plans and manifests the entries name are kept by hash beside them (blobs), so an export carries them.
 * - Where IndexedDB isn't there (a private window, a blocked store), the record lives in memory and says "kept for this
 *   visit only".
 *
 * What it proves: within this browser, that nothing was changed, put in or taken out since a checkpoint, and against
 * a checkpoint kept elsewhere (downloaded, or an auditor's), that nothing was rewritten at all. It is one device's
 * record; a team's shared record waits for a server.
 */
import { canonicalJSON } from '../core/canonical.js';
import { sha256Hex } from '../core/hash.js';
import { createIdentity, type Identity, type IdentityCard } from '../core/manifest.js';
import {
  consistencyProof,
  entryLeaf,
  entryOf,
  inclusionProof,
  logOrigin,
  parseCheckpoint,
  rootOf,
  signCheckpoint,
  verifyCheckpoint,
  verifyConsistency,
  verifyRecord,
  type JSONValue,
  type LogEntry,
  type SignedCheckpoint,
} from '../core/log.js';

const DB = 'smaltfl-record';

export interface RecordStatus {
  ok: boolean;
  size: number;
  root: string;
  /** The size of the latest checkpoint whose signature checks, and whether its signer is this browser. */
  signed: number;
  signer: IdentityCard | null;
  /** Where the record is kept. */
  durable: boolean;
  firstBad: number | null;
  reason: string | null;
}

export class FlowRecord {
  entries: LogEntry[] = [];
  leaves: string[] = [];
  checkpoints: SignedCheckpoint[] = [];
  status: RecordStatus | null = null;
  /** Blobs kept for this visit only, where there is no IndexedDB. */
  private readonly memoryBlobs = new Map<string, { hash: string; kind: string; json: string }>();
  private constructor(
    readonly flow: string,
    readonly origin: string,
    readonly identity: Identity,
    private readonly db: IDBDatabase | null,
  ) {}

  /** The record of a flow in this browser: opened (and checked), or begun. */
  static async open(flow: string): Promise<FlowRecord> {
    const db = await openDb().catch(() => null);
    const identity = (db && (await loadIdentity(db).catch(() => null))) || (await createIdentity('This browser'));
    if (db) await put(db, 'identity', { id: 'self', card: identity.card, privateKey: identity.privateKey }).catch(() => undefined);
    const rec = new FlowRecord(flow, logOrigin(flow, identity.card.fingerprint), identity, db);
    if (db) {
      const rows = (await getAll(db, 'entries', IDBKeyRange.bound([rec.origin, 0], [rec.origin, Number.MAX_SAFE_INTEGER]))) as { entry: LogEntry; leaf: string }[];
      rows.sort((a, b) => a.entry.seq - b.entry.seq);
      rec.entries = rows.map((r) => r.entry);
      rec.leaves = rows.map((r) => r.leaf);
      rec.checkpoints = ((await getAll(db, 'checkpoints', IDBKeyRange.bound([rec.origin, 0], [rec.origin, Number.MAX_SAFE_INTEGER]))) as { envelope: SignedCheckpoint }[]).map((r) => r.envelope);
      try {
        await navigator.storage?.persist?.();
      } catch {
        // Persistence is a request; the record works without it.
      }
    }
    await rec.check();
    return rec;
  }

  get durable(): boolean {
    return this.db !== null;
  }

  /** The record's head: what a run records as its context, and a checkpoint signs. */
  head(): { origin: string; size: number; root: string } {
    return { origin: this.origin, size: this.entries.length, root: rootOf(this.leaves) };
  }

  /** Append an entry, then sign the new head. `as` is the principal the person acts as. */
  async append(kind: string, as: string, about: JSONValue, reason: string | null = null, amends: number | null = null): Promise<LogEntry> {
    const entry = entryOf(this.origin, this.entries.length, { kind, by: { card: this.identity.card.fingerprint, as }, about, reason, amends });
    const leaf = entryLeaf(entry);
    if (this.db) await put(this.db, 'entries', { origin: this.origin, seq: entry.seq, entry, leaf });
    this.entries.push(entry);
    this.leaves.push(leaf);
    await this.sign();
    return entry;
  }

  /** Keep a document, a plan or a manifest by its hash, for an export to carry. */
  async keep(kind: string, value: unknown): Promise<string> {
    const json = canonicalJSON(value as Parameters<typeof canonicalJSON>[0]);
    const hash = await sha256Hex(json);
    if (this.db) await put(this.db, 'blobs', { hash, kind, json }).catch(() => undefined);
    else this.memoryBlobs.set(hash, { hash, kind, json });
    return hash;
  }

  async blobs(): Promise<{ hash: string; kind: string; json: string }[]> {
    return this.db ? ((await getAll(this.db, 'blobs')) as { hash: string; kind: string; json: string }[]) : [...this.memoryBlobs.values()];
  }

  /** Sign the current head as a checkpoint, and keep it. */
  async sign(): Promise<SignedCheckpoint> {
    const h = this.head();
    const envelope = await signCheckpoint(this.identity, h.origin, h.size, h.root);
    if (this.db) await put(this.db, 'checkpoints', { origin: h.origin, size: h.size, envelope }).catch(() => undefined);
    this.checkpoints = [...this.checkpoints.filter((c) => parseCheckpoint(c.checkpoint).size !== h.size), envelope];
    await this.check();
    return envelope;
  }

  /** Check every entry against the signed checkpoints: the record intact up to where. */
  async check(): Promise<RecordStatus> {
    const good: { size: number; root: string; origin: string }[] = [];
    let signer: IdentityCard | null = null;
    for (const env of this.checkpoints) {
      const c = await verifyCheckpoint(env, this.identity.card);
      if (c.ok && c.origin === this.origin) {
        good.push({ origin: c.origin, size: c.size, root: c.root });
        signer = c.signer;
      }
    }
    const r = verifyRecord(this.entries, good);
    const signed = good.filter((g) => g.size <= this.entries.length).reduce((m, g) => Math.max(m, g.size), 0);
    this.status = { ok: r.ok && good.length === this.checkpoints.length, size: this.entries.length, root: rootOf(this.leaves), signed, signer, durable: this.durable, firstBad: r.firstBad, reason: r.reason ?? (good.length === this.checkpoints.length ? null : 'a checkpoint kept here has a signature that does not check') };
    return this.status;
  }

  /** The latest checkpoint, to download and keep elsewhere: what anchors the record. */
  latest(): SignedCheckpoint | undefined {
    return [...this.checkpoints].sort((a, b) => parseCheckpoint(a.checkpoint).size - parseCheckpoint(b.checkpoint).size).at(-1);
  }

  /** Whether the record now is consistent with a checkpoint kept elsewhere (RFC 9162 consistency, and its signature). */
  async consistentWith(envelope: unknown): Promise<{ ok: boolean; size: number; reason: string | null }> {
    const c = await verifyCheckpoint(envelope);
    if (!c.ok) return { ok: false, size: 0, reason: c.reason };
    if (c.origin !== this.origin) return { ok: false, size: c.size, reason: `it is a checkpoint of ${c.origin}, not of this record (${this.origin})` };
    if (c.size > this.entries.length) return { ok: false, size: c.size, reason: `it was signed at ${c.size} entries, and this record has ${this.entries.length}: entries are missing` };
    const proof = consistencyProof(this.leaves, c.size, this.entries.length);
    const ok = c.size === 0 ? true : verifyConsistency(c.size, this.entries.length, c.root, rootOf(this.leaves), proof);
    return { ok, size: c.size, reason: ok ? null : `this record is not a continuation of the one signed at ${c.size} entries: an entry before it was changed` };
  }

  /** An inclusion proof for an entry, against the current head: proof that it is in the record. */
  proofOf(seq: number): { seq: number; size: number; root: string; leaf: string; proof: string[] } {
    const size = this.entries.length;
    return { seq, size, root: rootOf(this.leaves), leaf: this.leaves[seq]!, proof: inclusionProof(this.leaves, seq, size) };
  }

  /** The last entry of a kind matching a test, newest first. */
  last(kind: string, test: (e: LogEntry) => boolean = () => true): LogEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]!.kind === kind && test(this.entries[i]!)) return this.entries[i];
    return undefined;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('entries', { keyPath: ['origin', 'seq'] });
      db.createObjectStore('checkpoints', { keyPath: ['origin', 'size'] });
      db.createObjectStore('blobs', { keyPath: 'hash' });
      db.createObjectStore('identity', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('the record is open in an older tab'));
  });
}

/** One store's write, in its own transaction: resolved when it is committed. */
function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll(db: IDBDatabase, store: string, range?: IDBKeyRange): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll(range);
    req.onsuccess = () => resolve(req.result as unknown[]);
    req.onerror = () => reject(req.error);
  });
}

async function loadIdentity(db: IDBDatabase): Promise<Identity | null> {
  const rows = (await getAll(db, 'identity')) as { id: string; card: IdentityCard; privateKey: CryptoKey }[];
  const self = rows.find((r) => r.id === 'self');
  return self ? { card: self.card, privateKey: self.privateKey } : null;
}
