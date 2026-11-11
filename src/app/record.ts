/**
 * The record (ADR 0006 §6): everything that happened to a flow in this browser, in one append-only RFC 9162 log
 * (src/core/log.ts), kept in IndexedDB, its head signed as a checkpoint by this browser's identity.
 *
 * - An append is one IndexedDB transaction, the entry hashed synchronously before it, so a closed tab can't leave half
 *   an entry; appends run one after another, so each takes the next place. The checkpoint is signed after, in a second
 *   step: a tail not yet signed says so, it isn't broken.
 * - The identity is a non-extractable ECDSA key, kept in IndexedDB (structured clone keeps a CryptoKey without
 *   exposing it), named "This browser" until the person names it.
 * - Documents, plans and manifests the entries name are kept by hash beside them (blobs), so an export carries them.
 * - Where IndexedDB isn't there (a private window, a blocked store, one that doesn't answer within a few seconds), the
 *   record lives in memory and says "kept for this visit only".
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
  /** Checkpoints already checked, by body, signature and signer: each is checked once, not on every append. */
  private readonly checked = new Map<string, { origin: string; size: number; root: string; signer: IdentityCard } | null>();
  /** Blobs kept for this visit only, where there is no IndexedDB. */
  private readonly memoryBlobs = new Map<string, { hash: string; kind: string; json: string }>();
  private constructor(
    readonly flow: string,
    readonly origin: string,
    readonly identity: Identity,
    private readonly store: RecordStore | null,
  ) {}

  /**
   * The record of a flow in this browser: opened (and checked), or begun. `wait` is how long IndexedDB may take to
   * open (ms) before the record is kept in memory for this visit: a store that never answers must not hold up the page.
   */
  static async open(flow: string, options: { wait?: number } = {}): Promise<FlowRecord> {
    let db = await openDb(options.wait ?? OPEN_WAIT).catch(() => null);
    let identity: Identity | null = null;
    if (db) {
      try {
        identity = await loadIdentity(db);
      } catch {
        // The identity is kept but can't be read now: a new one put in its place would orphan its record for good,
        // so this visit keeps a record of its own, in memory.
        db.close();
        db = null;
      }
    }
    if (!identity) {
      identity = await createIdentity('This browser');
      if (db) await put(db, 'identity', { id: 'self', card: identity.card, privateKey: identity.privateKey }).catch(() => undefined);
    }
    const rec = new FlowRecord(flow, logOrigin(flow, identity.card.fingerprint), identity, db ? new RecordStore(db, options.wait ?? OPEN_WAIT) : null);
    if (db) {
      const rows = (await getAll(db, 'entries', IDBKeyRange.bound([rec.origin, 0], [rec.origin, Number.MAX_SAFE_INTEGER]))) as { entry: LogEntry; leaf: string }[];
      rows.sort((a, b) => a.entry.seq - b.entry.seq);
      rec.entries = rows.map((r) => r.entry);
      rec.leaves = rows.map((r) => r.leaf);
      rec.checkpoints = ((await getAll(db, 'checkpoints', IDBKeyRange.bound([rec.origin, 0], [rec.origin, Number.MAX_SAFE_INTEGER]))) as { envelope: SignedCheckpoint }[]).map((r) => r.envelope);
      // Persistence is a request, and not awaited: a browser may ask the person first (Firefox does) and settle only
      // when they answer. The record works without it.
      try {
        void navigator.storage?.persist?.()?.catch(() => undefined);
      } catch {
        // No storage manager here.
      }
    }
    await rec.check();
    return rec;
  }

  get durable(): boolean {
    return this.store !== null;
  }

  /** The record's head: what a run records as its context, and a checkpoint signs. */
  head(): { origin: string; size: number; root: string } {
    return { origin: this.origin, size: this.entries.length, root: rootOf(this.leaves) };
  }

  /**
   * Append an entry, then sign the new head. `as` is the principal the person acts as. Appends run one at a time, in
   * the order they were asked for: an entry takes its place only once the one before it is kept, so two appends
   * close together can't take the same place (and the second overwrite the first in IndexedDB).
   */
  append(kind: string, as: string, about: JSONValue, reason: string | null = null, amends: number | null = null): Promise<LogEntry> {
    const next = this.appending.then(() => this.appendNow(kind, as, about, reason, amends));
    // An entry that couldn't be kept is counted, so the record says so rather than looking whole.
    this.appending = next.catch(() => {
      this.lost++;
    });
    return next;
  }

  /** Entries asked for that couldn't be kept (the store refused them): shown with the record's status. */
  lost = 0;

  /** The appends asked for so far, in order: the next one waits for them. */
  private appending: Promise<unknown> = Promise.resolve();

  private async appendNow(kind: string, as: string, about: JSONValue, reason: string | null, amends: number | null): Promise<LogEntry> {
    const entry = entryOf(this.origin, this.entries.length, { kind, by: { card: this.identity.card.fingerprint, as }, about, reason, amends });
    const leaf = entryLeaf(entry);
    if (this.store) await this.store.put('entries', { origin: this.origin, seq: entry.seq, entry, leaf });
    this.entries.push(entry);
    this.leaves.push(leaf);
    await this.sign();
    return entry;
  }

  /** Keep a document, a plan or a manifest by its hash, for an export to carry. */
  async keep(kind: string, value: unknown): Promise<string> {
    const json = canonicalJSON(value as Parameters<typeof canonicalJSON>[0]);
    const hash = await sha256Hex(json);
    if (this.store) await this.store.put('blobs', { hash, kind, json }).catch(() => undefined);
    else this.memoryBlobs.set(hash, { hash, kind, json });
    return hash;
  }

  /** The documents, plans and manifests this record's entries name (by blob, doc or plan), and only those. */
  async blobs(): Promise<{ hash: string; kind: string; json: string }[]> {
    const named = new Set<string>();
    for (const e of this.entries) {
      const a = e.about as Record<string, unknown> | null;
      for (const k of ['blob', 'doc', 'plan']) if (a && typeof a[k] === 'string') named.add(a[k] as string);
    }
    const all = this.store ? ((await this.store.getAll('blobs')) as { hash: string; kind: string; json: string }[]) : [...this.memoryBlobs.values()];
    return all.filter((b) => named.has(b.hash));
  }

  /** Sign the current head as a checkpoint, and keep it. */
  async sign(): Promise<SignedCheckpoint> {
    const h = this.head();
    const envelope = await signCheckpoint(this.identity, h.origin, h.size, h.root);
    if (this.store) await this.store.put('checkpoints', { origin: h.origin, size: h.size, envelope }).catch(() => undefined);
    this.checkpoints = [...this.checkpoints.filter((c) => parseCheckpoint(c.checkpoint).size !== h.size), envelope];
    await this.check();
    return envelope;
  }

  /** Check every entry against the signed checkpoints: the record intact up to where. */
  async check(): Promise<RecordStatus> {
    const good: { size: number; root: string; origin: string }[] = [];
    let signer: IdentityCard | null = null;
    for (const env of this.checkpoints) {
      // By everything the signature covers and the key that made it, so a body swapped under an old signature is checked.
      const id = `${env.checkpoint}\u0000${env.signature}\u0000${canonicalJSON(env.signer as unknown as Parameters<typeof canonicalJSON>[0])}`;
      if (!this.checked.has(id)) {
        const c = await verifyCheckpoint(env, this.identity.card);
        this.checked.set(id, c.ok && c.origin === this.origin ? { origin: c.origin, size: c.size, root: c.root, signer: c.signer } : null);
      }
      const c = this.checked.get(id);
      if (c) {
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
    // The origin names the signer by 16 hex of its fingerprint only: the whole fingerprint must be this record's.
    if (c.signer.fingerprint !== this.identity.card.fingerprint) return { ok: false, size: c.size, reason: `it was signed by ${c.signer.fingerprint}, not by this browser (${this.identity.card.fingerprint})` };
    if (c.size > this.entries.length) return { ok: false, size: c.size, reason: `it was signed at ${c.size} entries, and this record has ${this.entries.length}: entries are missing` };
    const proof = consistencyProof(this.leaves, c.size, this.entries.length);
    const ok = c.size === 0 ? true : verifyConsistency(c.size, this.entries.length, c.root, rootOf(this.leaves), proof);
    return { ok, size: c.size, reason: ok ? null : `this record is not a continuation of the one signed at ${c.size} entries: an entry before it was changed` };
  }

  /** An inclusion proof for an entry, against the current head: proof that it is in the record. */
  proofOf(seq: number, size = this.entries.length): { seq: number; size: number; root: string; leaf: string; proof: string[] } {
    return { seq, size, root: rootOf(this.leaves, size), leaf: this.leaves[seq]!, proof: inclusionProof(this.leaves, seq, size) };
  }

  /** The last entry of a kind matching a test, newest first. */
  last(kind: string, test: (e: LogEntry) => boolean = () => true): LogEntry | undefined {
    for (let i = this.entries.length - 1; i >= 0; i--) if (this.entries[i]!.kind === kind && test(this.entries[i]!)) return this.entries[i];
    return undefined;
  }
}

/** How long IndexedDB may take to open, in ms: some browsers have been known to leave an open request unanswered. */
const OPEN_WAIT = 5000;

/** The record's database, or an error when there is none, it is blocked, or it doesn't answer within `wait` ms. */
function openDb(wait: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    let settled = false;
    const settle = (f: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      f();
    };
    const timer = setTimeout(() => settle(() => reject(new Error(`IndexedDB didn't answer within ${wait} ms`))), wait);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB, 1);
    } catch (e) {
      settle(() => reject(e));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('entries', { keyPath: ['origin', 'seq'] });
      db.createObjectStore('checkpoints', { keyPath: ['origin', 'size'] });
      db.createObjectStore('blobs', { keyPath: 'hash' });
      db.createObjectStore('identity', { keyPath: 'id' });
    };
    // A connection that arrives after the record stopped waiting for it is closed, so it holds up no other tab.
    req.onsuccess = () => (settled ? req.result.close() : settle(() => resolve(req.result)));
    req.onerror = () => settle(() => reject(req.error));
    req.onblocked = () => settle(() => reject(new Error('the record is open in an older tab')));
  });
}

/**
 * The record's connection to IndexedDB, opened again when the browser has closed it. A browser may close a page's
 * connection on its own: iOS Safari does when the page is put in the background or its web view is suspended, Chrome
 * when the store is cleared, any browser when another tab upgrades the database. A transaction asked of a closed
 * connection throws ("The database connection is closing"); the record then opens a new one and asks once more, so a
 * run started after the page comes back keeps its entry. A write that still can't be kept rejects, as before.
 */
export class RecordStore {
  private conn: IDBDatabase | null;
  constructor(conn: IDBDatabase, private readonly wait: number, private readonly reopen: (wait: number) => Promise<IDBDatabase> = openDb) {
    this.conn = this.watch(conn);
  }

  private watch(conn: IDBDatabase): IDBDatabase {
    // Closed by the browser, or asked to make way for another tab's upgrade: forget it, so the next use opens again.
    conn.onclose = () => {
      if (this.conn === conn) this.conn = null;
    };
    conn.onversionchange = () => {
      conn.close();
      if (this.conn === conn) this.conn = null;
    };
    return conn;
  }

  private async open(): Promise<IDBDatabase> {
    if (!this.conn) this.conn = this.watch(await this.reopen(this.wait));
    return this.conn;
  }

  /** `work` on the connection; once more on a new connection where the browser had closed this one. */
  private async use<T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await this.open();
    try {
      return await work(db);
    } catch (e) {
      if (!isClosedConnection(e)) throw e;
      try {
        db.close();
      } catch {
        // Already closing.
      }
      if (this.conn === db) this.conn = null;
      return work(await this.open());
    }
  }

  put(store: string, value: unknown): Promise<void> {
    return this.use((db) => put(db, store, value));
  }

  getAll(store: string, range?: IDBKeyRange): Promise<unknown[]> {
    return this.use((db) => getAll(db, store, range));
  }
}

/** Whether an error is IndexedDB saying the connection is closed or closing (an InvalidStateError from transaction()). */
export function isClosedConnection(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  const message = String((e as { message?: string } | null)?.message ?? '');
  return name === 'InvalidStateError' || /connection (is )?(closing|closed)/i.test(message);
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
