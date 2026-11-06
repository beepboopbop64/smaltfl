/**
 * Just enough of IndexedDB for the record (src/app/record.ts) in Node: object stores with key paths, put and getAll
 * with a key range, and a transaction that completes on a later task, as a browser's does. Values are kept as given
 * (a browser would clone them). Install it, open the record, and uninstall it after.
 */
type Key = string | number | (string | number)[];
const compare = (a: Key, b: Key): number => {
  const x = Array.isArray(a) ? a : [a];
  const y = Array.isArray(b) ? b : [b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    return typeof x[i] === typeof y[i] ? (x[i]! < y[i]! ? -1 : 1) : typeof x[i] === 'number' ? -1 : 1;
  }
  return x.length - y.length;
};

export function installFakeIndexedDB(): () => void {
  const databases = new Map<string, Map<string, { keyPath: string | string[]; rows: Map<string, unknown> }>>();
  const later = (f: () => void) => setTimeout(f, 0);
  const keyOf = (keyPath: string | string[], value: Record<string, unknown>): Key => (Array.isArray(keyPath) ? keyPath.map((k) => value[k] as string | number) : (value[keyPath] as Key));
  const g = globalThis as Record<string, unknown>;
  const before = { indexedDB: g.indexedDB, IDBKeyRange: g.IDBKeyRange };
  g.IDBKeyRange = { bound: (lower: Key, upper: Key) => ({ lower, upper }) };
  g.indexedDB = {
    open(name: string) {
      const req: Record<string, unknown> = {};
      later(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const stores = databases.get(name)!;
        const db = {
          createObjectStore: (store: string, o: { keyPath: string | string[] }) => void stores.set(store, { keyPath: o.keyPath, rows: new Map() }),
          transaction(store: string) {
            const tx: Record<string, unknown> = {};
            const s = stores.get(store)!;
            tx.objectStore = () => ({
              put(value: Record<string, unknown>) {
                later(() => {
                  s.rows.set(JSON.stringify(keyOf(s.keyPath, value)), value);
                  later(() => (tx.oncomplete as () => void)?.());
                });
              },
              getAll(range?: { lower: Key; upper: Key }) {
                const r: Record<string, unknown> = {};
                later(() => {
                  r.result = [...s.rows.values()].filter((v) => !range || (compare(keyOf(s.keyPath, v as Record<string, unknown>), range.lower) >= 0 && compare(keyOf(s.keyPath, v as Record<string, unknown>), range.upper) <= 0));
                  (r.onsuccess as () => void)?.();
                });
                return r;
              },
            });
            return tx;
          },
          close() {},
        };
        req.result = db;
        if (fresh) (req.onupgradeneeded as () => void)?.();
        (req.onsuccess as () => void)?.();
      });
      return req;
    },
  };
  return () => {
    g.indexedDB = before.indexedDB;
    g.IDBKeyRange = before.IDBKeyRange;
  };
}
