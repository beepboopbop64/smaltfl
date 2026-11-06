/**
 * Opening the record (src/app/record.ts) when the browser's storage misbehaves: a store that never answers, a request
 * for persistence that waits on the person, and an identity that is there but can't be read. None may hold up the
 * page, and none may cost the browser its identity, which names its record.
 */
import { describe, expect, it } from 'vitest';
import { FlowRecord } from '../src/app/record.js';
import { installFakeIndexedDB } from './helpers/fake-idb.js';

const flowId = () => `open-${Math.random().toString(36).slice(2)}`;
type Loose = Record<string, unknown>;

describe('opening the record', () => {
  it('keeps the record in memory when IndexedDB never answers, rather than hold up the page', async () => {
    const g = globalThis as Loose;
    const before = { indexedDB: g.indexedDB, IDBKeyRange: g.IDBKeyRange };
    // An open request that never fires an event, as some browsers have left one.
    g.indexedDB = { open: () => ({}) };
    g.IDBKeyRange = { bound: () => ({}) };
    try {
      const rec = await FlowRecord.open(flowId(), { wait: 20 });
      expect(rec.durable).toBe(false);
      await rec.append('run', 'owner', { outcome: 'ok' });
      expect(rec.status).toMatchObject({ ok: true, size: 1, durable: false });
    } finally {
      g.indexedDB = before.indexedDB;
      g.IDBKeyRange = before.IDBKeyRange;
    }
  });

  it("doesn't wait for a request for persistent storage to be answered", async () => {
    const uninstall = installFakeIndexedDB();
    const had = Object.getOwnPropertyDescriptor(navigator, 'storage');
    // Firefox asks the person, and the promise settles only when they answer.
    Object.defineProperty(navigator, 'storage', { value: { persist: () => new Promise(() => {}) }, configurable: true });
    try {
      const rec = await FlowRecord.open(flowId(), { wait: 1000 });
      expect(rec.durable).toBe(true);
    } finally {
      if (had) Object.defineProperty(navigator, 'storage', had);
      else delete (navigator as unknown as Loose).storage;
      uninstall();
    }
  });

  it("keeps this browser's identity when it can't be read for a moment, so its record isn't orphaned", async () => {
    const uninstall = installFakeIndexedDB();
    const factory = (globalThis as Loose).indexedDB as { open(name: string): Loose };
    const open = factory.open.bind(factory);
    let unreadable = false;
    // The same store, but reading the identity fails while `unreadable` is set; writing it still works.
    factory.open = (name: string) => {
      const req = open(name);
      let db: Loose | undefined;
      Object.defineProperty(req, 'result', {
        get: () => db,
        set: (real: { transaction(store: string): Loose }) => {
          db = {
            ...real,
            transaction(store: string) {
              const tx = real.transaction(store);
              if (store !== 'identity' || !unreadable) return tx;
              const os = (tx.objectStore as () => Loose)();
              tx.objectStore = () => ({
                ...os,
                getAll() {
                  const r: Loose = {};
                  setTimeout(() => {
                    r.error = new DOMException('unreadable', 'UnknownError');
                    (r.onerror as () => void)?.();
                  }, 0);
                  return r;
                },
              });
              return tx;
            },
          };
        },
      });
      return req;
    };
    try {
      const flow = flowId();
      const first = await FlowRecord.open(flow, { wait: 1000 });
      await first.append('run', 'owner', { outcome: 'ok' });
      unreadable = true;
      const meanwhile = await FlowRecord.open(flow, { wait: 1000 });
      expect(meanwhile.durable).toBe(false);
      expect(meanwhile.origin).not.toBe(first.origin);
      unreadable = false;
      const later = await FlowRecord.open(flow, { wait: 1000 });
      expect(later.origin).toBe(first.origin);
      expect(later.entries.map((e) => e.kind)).toEqual(['run']);
      expect(later.status).toMatchObject({ ok: true, size: 1, durable: true });
    } finally {
      uninstall();
    }
  });
});
