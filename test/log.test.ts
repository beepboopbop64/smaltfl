import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/core/canonical.js';
import { hex, unhex, utf8 } from '../src/core/hash.js';
import {
  EMPTY_ROOT,
  checkpointBody,
  consistencyProof,
  entryData,
  entryLeaf,
  entryOf,
  inclusionProof,
  leafHash,
  logOrigin,
  newNonce,
  parseCheckpoint,
  rootOf,
  signCheckpoint,
  verifyCheckpoint,
  verifyConsistency,
  verifyInclusion,
  verifyRecord,
  type LogEntry,
  type SignedCheckpoint,
} from '../src/core/log.js';
import { createIdentity, type Identity } from '../src/core/manifest.js';
import { sha256HexSync } from '../src/core/sha256.js';

// The reference test data of Certificate Transparency's Merkle tree tests (RFC 6962), as hex bytes.
const DATA = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657', '606162636465666768696a6b6c6d6e6f'];
const LEAVES = DATA.map((d) => leafHash(unhex(d)));
const ROOTS = [
  '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
  'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
  'aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77',
  'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
  '4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4',
  '76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef',
  'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
  '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328',
];

const webSha = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** MTH as RFC 9162 §2.1.1 writes it, on WebCrypto: the reference the tree is checked against. */
async function referenceRoot(data: Uint8Array[]): Promise<Uint8Array> {
  if (data.length === 0) return webSha(new Uint8Array(0));
  if (data.length === 1) return webSha(concat(new Uint8Array([0]), data[0]!));
  let k = 1;
  while (k * 2 < data.length) k *= 2;
  return webSha(concat(new Uint8Array([1]), await referenceRoot(data.slice(0, k)), await referenceRoot(data.slice(k))));
}

/** The same hash with one bit of one byte flipped. */
const flip = (hash: string, byte = 0) => hex(unhex(hash).map((b, i) => (i === byte ? b ^ 1 : b)));
const swap = <T>(list: readonly T[], i: number, j: number) => list.map((x, at) => (at === i ? list[j]! : at === j ? list[i]! : x));

describe('the log/1 tree: RFC 6962 test vectors', () => {
  it('hashes leaves and the empty tree as RFC 9162 does', async () => {
    expect(rootOf([])).toBe(EMPTY_ROOT);
    expect(EMPTY_ROOT).toBe(hex(await webSha(new Uint8Array(0))));
    expect(LEAVES[0]).toBe('6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
    expect(LEAVES[1]).toBe('96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7');
    for (const [i, d] of DATA.entries()) expect(LEAVES[i]).toBe(hex(await webSha(concat(new Uint8Array([0]), unhex(d)))));
  });

  it('gives the reference roots for every size from 1 to 8', () => {
    for (let n = 1; n <= 8; n++) expect(rootOf(LEAVES, n), `size ${n}`).toBe(ROOTS[n - 1]);
    expect(rootOf(LEAVES)).toBe(ROOTS[7]);
  });

  it('gives the reference audit paths', () => {
    // From the Certificate Transparency reference tests, where leaves are numbered from 1.
    expect(inclusionProof(LEAVES, 0, 1)).toEqual([]);
    expect(inclusionProof(LEAVES, 0, 8)).toEqual([
      '96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7',
      '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e',
      '6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4',
    ]);
    expect(inclusionProof(LEAVES, 5, 8)).toEqual([
      'bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b',
      'ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0',
      'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
    ]);
    expect(inclusionProof(LEAVES, 2, 3)).toEqual(['fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125']);
    expect(inclusionProof(LEAVES, 1, 5)).toEqual([
      '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
      '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e',
      'bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b',
    ]);
  });

  it('gives the reference consistency proofs', () => {
    expect(consistencyProof(LEAVES, 1, 1)).toEqual([]);
    expect(consistencyProof(LEAVES, 1, 8)).toEqual([
      '96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7',
      '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e',
      '6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4',
    ]);
    expect(consistencyProof(LEAVES, 6, 8)).toEqual([
      '0ebc5d3437fbe2db158b9f126a1d118e308181031d0a949f8dededebc558ef6a',
      'ca854ea128ed050b41b35ffc1b87b8eb2bde461e9e3b5596ece6b9d5975a0ae0',
      'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
    ]);
    expect(consistencyProof(LEAVES, 2, 5)).toEqual([
      '5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e',
      'bc1a0643b12e4d2d7c77918f44e0f4f79a838b6cf9ec5b5c283e1f4d88599e6b',
    ]);
  });

  it('proves every leaf in every tree up to 8, and nothing else', () => {
    for (let n = 1; n <= 8; n++) {
      const root = rootOf(LEAVES, n);
      for (let i = 0; i < n; i++) {
        const at = `leaf ${i} of ${n}`;
        const proof = inclusionProof(LEAVES, i, n);
        expect(verifyInclusion(LEAVES[i]!, i, n, proof, root), at).toBe(true);
        expect(verifyInclusion(flip(LEAVES[i]!), i, n, proof, root), `${at}, flipped leaf`).toBe(false);
        expect(verifyInclusion(LEAVES[i]!, i, n, proof, flip(root, 31)), `${at}, flipped root`).toBe(false);
        // The size is checked through the root, so a root is only meaningful with its own size, as a checkpoint
        // gives them: the same proof can fit another size's path, never another size's root.
        if (n < 8) expect(verifyInclusion(LEAVES[i]!, i, n + 1, proof, rootOf(LEAVES, n + 1)), `${at}, a larger tree`).toBe(false);
        if (i < n - 1) expect(verifyInclusion(LEAVES[i]!, i, n - 1, proof, rootOf(LEAVES, n - 1)), `${at}, a smaller tree`).toBe(false);
        expect(verifyInclusion(LEAVES[i]!, i, i, proof, root), `${at}, outside the tree`).toBe(false);
        for (let j = 0; j < n; j++) if (j !== i) expect(verifyInclusion(LEAVES[i]!, j, n, proof, root), `${at} as ${j}`).toBe(false);
        for (let p = 0; p < proof.length; p++) {
          for (const byte of [0, 17, 31]) {
            expect(verifyInclusion(LEAVES[i]!, i, n, proof.map((h, q) => (q === p ? flip(h, byte) : h)), root), `${at}, flipped step ${p}`).toBe(false);
          }
          if (p > 0) expect(verifyInclusion(LEAVES[i]!, i, n, swap(proof, p - 1, p), root), `${at}, steps ${p - 1} and ${p} swapped`).toBe(false);
        }
        if (proof.length > 0) expect(verifyInclusion(LEAVES[i]!, i, n, proof.slice(0, -1), root), `${at}, truncated`).toBe(false);
        expect(verifyInclusion(LEAVES[i]!, i, n, [...proof, LEAVES[0]!], root), `${at}, extended`).toBe(false);
      }
    }
  });

  it('proves every tree up to 8 consistent with every smaller one, and nothing else', () => {
    for (let n = 1; n <= 8; n++) {
      const rootN = rootOf(LEAVES, n);
      for (let m = 0; m <= n; m++) {
        const at = `${m} to ${n}`;
        const rootM = rootOf(LEAVES, m);
        const proof = consistencyProof(LEAVES, m, n);
        expect(verifyConsistency(m, n, rootM, rootN, proof), at).toBe(true);
        if (m === 0 || m === n) expect(proof, at).toEqual([]);
        if (m === 0) continue;
        expect(verifyConsistency(m, n, flip(rootM), rootN, proof), `${at}, flipped first root`).toBe(false);
        if (m < n) expect(verifyConsistency(m, n, rootM, flip(rootN), proof), `${at}, flipped second root`).toBe(false);
        if (m < n) expect(verifyConsistency(n, m, rootN, rootM, proof), `${at}, reversed`).toBe(false);
        for (let other = 1; other <= 8; other++) {
          if (other !== m && other < n) expect(verifyConsistency(other, n, rootM, rootN, proof), `${at} claimed from ${other}`).toBe(false);
        }
        for (let p = 0; p < proof.length; p++) {
          expect(verifyConsistency(m, n, rootM, rootN, proof.map((h, q) => (q === p ? flip(h, 9) : h))), `${at}, flipped step ${p}`).toBe(false);
          if (p > 0) expect(verifyConsistency(m, n, rootM, rootN, swap(proof, p - 1, p)), `${at}, steps ${p - 1} and ${p} swapped`).toBe(false);
        }
        if (proof.length > 0) expect(verifyConsistency(m, n, rootM, rootN, proof.slice(0, -1)), `${at}, truncated`).toBe(false);
        expect(verifyConsistency(m, n, rootM, rootN, [...proof, LEAVES[3]!]), `${at}, extended`).toBe(false);
      }
    }
    // A tree is consistent with the empty tree only by its own root, and with no proof.
    expect(verifyConsistency(0, 5, flip(EMPTY_ROOT), ROOTS[4]!, [])).toBe(false);
    expect(verifyConsistency(0, 5, EMPTY_ROOT, ROOTS[4]!, [LEAVES[0]!])).toBe(false);
    // The empty tree is consistent with itself, and with nothing else claimed at size 0.
    expect(verifyConsistency(0, 0, EMPTY_ROOT, EMPTY_ROOT, [])).toBe(true);
    expect(verifyConsistency(0, 0, EMPTY_ROOT, ROOTS[2]!, [])).toBe(false);
    expect(verifyConsistency(0, 0, ROOTS[2]!, ROOTS[2]!, [])).toBe(false);
  });

  it('checks proofs from a reference written out in full, against mutations of every kind', () => {
    // RFC 9162 §2.1.1, §2.1.3.1 and §2.1.4.1 as written, slicing lists of leaf hashes: a second reading of the RFC
    // to check the first against, through a power of two (32) and one past it.
    const node = (l: string, r: string) => sha256HexSync(concat(new Uint8Array([1]), unhex(l), unhex(r)));
    const mthRef = (d: string[]): string => {
      if (d.length === 0) return EMPTY_ROOT;
      if (d.length === 1) return d[0]!;
      let k = 1;
      while (k * 2 < d.length) k *= 2;
      return node(mthRef(d.slice(0, k)), mthRef(d.slice(k)));
    };
    const pathRef = (m: number, d: string[]): string[] => {
      if (d.length <= 1) return [];
      let k = 1;
      while (k * 2 < d.length) k *= 2;
      return m < k ? [...pathRef(m, d.slice(0, k)), mthRef(d.slice(k))] : [...pathRef(m - k, d.slice(k)), mthRef(d.slice(0, k))];
    };
    const subRef = (m: number, d: string[], b: boolean): string[] => {
      if (m === d.length) return b ? [] : [mthRef(d)];
      let k = 1;
      while (k * 2 < d.length) k *= 2;
      return m <= k ? [...subRef(m, d.slice(0, k), b), mthRef(d.slice(k))] : [...subRef(m - k, d.slice(k), false), mthRef(d.slice(0, k))];
    };
    const leaves = Array.from({ length: 33 }, (_, i) => leafHash(new Uint8Array([i, i * 7, 255 - i])));
    const other = leafHash(utf8('not in the tree'));
    const mutations = (proof: string[]) => {
      const out: string[][] = [[], [...proof, other], [other, ...proof]];
      for (let p = 0; p < proof.length; p++) {
        out.push(proof.map((h, q) => (q === p ? other : h)));
        out.push(proof.filter((_, q) => q !== p));
        out.push([...proof.slice(0, p + 1), ...proof.slice(p)]);
        for (let q = p + 1; q < proof.length; q++) out.push(swap(proof, p, q));
      }
      return out.filter((m) => m.join() !== proof.join());
    };
    const roots = leaves.map((_, i) => rootOf(leaves, i)).concat(rootOf(leaves));
    for (let n = 1; n <= 33; n++) {
      const d = leaves.slice(0, n);
      const root = roots[n]!;
      expect(root, `size ${n}`).toBe(mthRef(d));
      for (let i = 0; i < n; i++) {
        const proof = inclusionProof(leaves, i, n);
        expect(proof, `leaf ${i} of ${n}`).toEqual(pathRef(i, d));
        for (const m of mutations(proof)) expect(verifyInclusion(leaves[i]!, i, n, m, root), `leaf ${i} of ${n}: ${m.length} steps`).toBe(false);
      }
      for (let m = 1; m <= n; m++) {
        const proof = consistencyProof(leaves, m, n);
        expect(proof, `${m} to ${n}`).toEqual(subRef(m, d, true));
        for (const x of mutations(proof)) expect(verifyConsistency(m, n, roots[m]!, root, x), `${m} to ${n}: ${x.length} steps`).toBe(false);
      }
    }
  });

  it('matches the RFC written out on WebCrypto, and proves every leaf and prefix, in trees up to 70', async () => {
    let seed = 7;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
    const data = Array.from({ length: 70 }, (_, i) => new Uint8Array(i % 13).map(() => next()));
    const leaves = data.map(leafHash);
    for (let n = 0; n <= 70; n++) expect(rootOf(leaves, n), `size ${n}`).toBe(hex(await referenceRoot(data.slice(0, n))));
    for (let n = 1; n <= 40; n++) {
      const rootN = rootOf(leaves, n);
      for (let i = 0; i < n; i++) expect(verifyInclusion(leaves[i]!, i, n, inclusionProof(leaves, i, n), rootN), `leaf ${i} of ${n}`).toBe(true);
      for (let m = 0; m <= n; m++) expect(verifyConsistency(m, n, rootOf(leaves, m), rootN, consistencyProof(leaves, m, n)), `${m} to ${n}`).toBe(true);
    }
  });

  it('refuses malformed input: building throws, checking says no', () => {
    expect(() => rootOf(LEAVES, 9)).toThrow(RangeError);
    expect(() => rootOf(['ab'])).toThrow(TypeError);
    expect(() => rootOf([LEAVES[0]!.toUpperCase()])).toThrow(TypeError);
    expect(() => inclusionProof(LEAVES, 8, 8)).toThrow(RangeError);
    expect(() => inclusionProof(LEAVES, -1, 8)).toThrow(RangeError);
    expect(() => consistencyProof(LEAVES, 5, 4)).toThrow(RangeError);
    expect(() => consistencyProof(LEAVES, 1, 9)).toThrow(RangeError);
    const proof = inclusionProof(LEAVES, 3, 8);
    expect(verifyInclusion(LEAVES[3]!, 3, 8, proof, ROOTS[7]!)).toBe(true);
    expect(verifyInclusion(LEAVES[3]!.toUpperCase(), 3, 8, proof, ROOTS[7]!)).toBe(false);
    expect(verifyInclusion(LEAVES[3]!, 3, 8, [...proof.slice(0, 2), 'zz'], ROOTS[7]!)).toBe(false);
    expect(verifyInclusion(LEAVES[3]!, 3.5, 8, proof, ROOTS[7]!)).toBe(false);
    expect(verifyInclusion(LEAVES[3]!, 3, Number.NaN, proof, ROOTS[7]!)).toBe(false);
    expect(verifyInclusion(LEAVES[3]!, 3, 8, 'nope' as unknown as string[], ROOTS[7]!)).toBe(false);
    expect(verifyConsistency(3, 8, ROOTS[2]!, ROOTS[7]!, consistencyProof(LEAVES, 3, 8))).toBe(true);
    expect(verifyConsistency(3, 8, ROOTS[2]!, ROOTS[7]!, [])).toBe(false);
    expect(verifyConsistency(-1, 8, ROOTS[2]!, ROOTS[7]!, [])).toBe(false);
    expect(verifyConsistency(8, 8, ROOTS[7]!, ROOTS[7]!, [LEAVES[0]!])).toBe(false);
  });
});

// ------------------------------------------------------------------ entries and records

const CARD = 'a1'.repeat(32);
const ORIGIN = logOrigin('nyc-taxis', CARD);

function logOf(n: number, origin = ORIGIN): LogEntry[] {
  return Array.from({ length: n }, (_, i) => entryOf(origin, i, { kind: 'run', by: { card: CARD, as: 'owner' }, about: { run: i }, at: '2026-11-06T10:00:00.000Z' }));
}

const leavesOf = (entries: readonly LogEntry[]) => entries.map(entryLeaf);

describe('log/1 entries', () => {
  it('makes entries with a fresh nonce at the place given', () => {
    const nonce = newNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(nonce);
    const fields = { kind: 'run', by: { card: CARD, as: 'owner' }, about: { run: 'r' }, at: new Date('2026-11-06T10:00:00Z') };
    const a = entryOf(ORIGIN, 4, fields);
    const b = entryOf(ORIGIN, 4, fields);
    expect(a).toEqual({ smaltflLog: 1, origin: ORIGIN, seq: 4, kind: 'run', at: '2026-11-06T10:00:00.000Z', by: { card: CARD, as: 'owner' }, about: { run: 'r' }, reason: null, amends: null, nonce: a.nonce });
    expect(a.nonce).not.toBe(b.nonce);
    expect(entryLeaf(a)).not.toBe(entryLeaf(b));
    const now = entryOf(ORIGIN, 0, { kind: 'note', by: { card: null, as: 'guest' } });
    expect(now.about).toBeNull();
    expect(Math.abs(Date.parse(now.at) - Date.now())).toBeLessThan(60_000);
  });

  it('hashes an entry as a tagged leaf of its canonical JSON, whatever order its fields are in', async () => {
    const [entry] = logOf(1);
    const data = entryData(entry!);
    expect(new TextDecoder().decode(data)).toBe(`smaltfl/log/1\n${canonicalJSON(entry)}`);
    expect(entryLeaf(entry!)).toBe(hex(await webSha(concat(new Uint8Array([0]), data))));
    const reversed = Object.fromEntries(Object.entries(entry!).reverse()) as unknown as LogEntry;
    expect(entryLeaf(reversed)).toBe(entryLeaf(entry!));
    expect(entryLeaf({ ...entry!, about: { run: 1 } })).not.toBe(entryLeaf(entry!));
  });

  it('refuses to make an entry that is not log/1', () => {
    const by = { card: CARD, as: 'owner' };
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by: { card: 'abc', as: 'owner' } })).toThrow(/card/);
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by: { card: CARD, as: '' } })).toThrow(/principal/);
    expect(() => entryOf(ORIGIN, 2, { kind: 'fix', by, amends: 2 })).toThrow(/earlier entry/);
    expect(() => entryOf(ORIGIN, 2, { kind: 'fix', by, amends: 1 })).not.toThrow();
    expect(() => entryOf('two\nlines', 0, { kind: 'run', by })).toThrow(/origin/);
    expect(() => entryOf(ORIGIN, 0, { kind: '', by })).toThrow(/kind/);
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by, at: 'yesterday' })).toThrow(/ISO 8601/);
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by, at: '2026-13-01T00:00:00Z' })).toThrow(/ISO 8601/);
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by, at: '2026-11-06T10:00:00+01:00' })).not.toThrow();
    expect(() => entryOf(ORIGIN, 0, { kind: 'run', by, about: { when: new Date() } as never })).toThrow(/plain JSON/);
    expect(() => entryOf(ORIGIN, -1, { kind: 'run', by })).toThrow(/seq/);
  });
});

describe('records', () => {
  it('verifies a record whose entries are in place, with its size and root', () => {
    const entries = logOf(7);
    expect(verifyRecord(entries)).toEqual({ ok: true, origin: ORIGIN, size: 7, root: rootOf(leavesOf(entries)), firstBad: null, reason: null });
    expect(verifyRecord([])).toEqual({ ok: true, origin: null, size: 0, root: EMPTY_ROOT, firstBad: null, reason: null });
    // Entries read back from storage are plain JSON.
    expect(verifyRecord(JSON.parse(JSON.stringify(entries)) as unknown[]).ok).toBe(true);
  });

  it('finds the first entry out of place, of another log or not shaped as an entry', () => {
    const entries = logOf(6);
    const at = (list: unknown[]) => {
      const check = verifyRecord(list);
      return { ok: check.ok, firstBad: check.firstBad, size: check.size, root: check.root };
    };
    const prefix = (n: number) => ({ ok: false, firstBad: n, size: n, root: rootOf(leavesOf(entries), n) });
    expect(at([...entries.slice(0, 3), ...entries.slice(4)])).toEqual(prefix(3));
    expect(at(swap(entries, 2, 3))).toEqual(prefix(2));
    expect(at(entries.slice(1))).toEqual(prefix(0));
    expect(at(entries.map((e, i) => (i === 4 ? { ...e, origin: logOrigin('other', CARD) } : e)))).toEqual(prefix(4));
    expect(at(entries.map((e, i) => (i === 1 ? { ...e, extra: true } : e)))).toEqual(prefix(1));
    expect(at(entries.map((e, i) => (i === 5 ? { ...e, nonce: e.nonce.toUpperCase() } : e)))).toEqual(prefix(5));
    expect(at(entries.map((e, i) => (i === 2 ? { ...e, amends: 3 } : e)))).toEqual(prefix(2));
    expect(at(entries.map((e, i) => (i === 3 ? { ...e, by: { card: CARD } } : e)))).toEqual(prefix(3));
    expect(at(entries.map((e, i) => (i === 3 ? { ...e, smaltflLog: 2 } : e)))).toEqual(prefix(3));
    expect(at([...entries.slice(0, 2), null])).toEqual(prefix(2));
    expect(verifyRecord(swap(entries, 2, 3)).reason).toBe('entry 2 has seq 3 where 2 belongs');
  });

  it('shows a changed entry only against a checkpoint: a record rewritten whole verifies on its own', () => {
    const entries = logOf(8);
    const checkpoints = [2, 5, 8].map((size) => ({ origin: ORIGIN, size, root: rootOf(leavesOf(entries), size) }));
    expect(verifyRecord(entries, checkpoints)).toMatchObject({ ok: true, size: 8, firstBad: null });
    // One byte of one entry changed: its nonce, still a nonce.
    const changed = entries.map((e, i) => (i === 3 ? { ...e, nonce: (e.nonce[0] === '0' ? '1' : '0') + e.nonce.slice(1) } : e));
    expect(verifyRecord(changed).ok).toBe(true);
    const check = verifyRecord(changed, checkpoints);
    expect(check).toEqual({
      ok: false,
      origin: ORIGIN,
      size: 2,
      root: checkpoints[0]!.root,
      firstBad: 2,
      reason: "the record doesn't match its checkpoint at size 5: an entry between entries 2 and 4 was changed, removed or put in",
    });
    expect(verifyRecord(changed, [checkpoints[2]!])).toMatchObject({ ok: false, size: 0, firstBad: 0 });
    // Changed after the last checkpoint: nothing vouches for entries after it, and nothing is wrong with them.
    expect(verifyRecord(changed, checkpoints.slice(0, 1)).ok).toBe(true);
  });

  it('finds a truncated log, a spliced entry and checkpoints of another log', () => {
    const entries = logOf(8);
    const leaves = leavesOf(entries);
    const checkpoint = { origin: ORIGIN, size: 8, root: rootOf(leaves) };
    expect(verifyRecord(entries.slice(0, 6), [checkpoint])).toMatchObject({ ok: false, size: 6, firstBad: 6, reason: 'the record has 6 entries, but a checkpoint was signed at 8: entries are missing from its end' });
    // An entry put in between, the ones after renumbered: in place, but not the log that was checkpointed.
    const inserted = entryOf(ORIGIN, 3, { kind: 'run', by: { card: CARD, as: 'owner' }, about: { run: 'late' } });
    const spliced = [...entries.slice(0, 3), inserted, ...entries.slice(3).map((e) => ({ ...e, seq: e.seq + 1 }))];
    expect(verifyRecord(spliced).ok).toBe(true);
    expect(verifyRecord(spliced, [checkpoint])).toMatchObject({ ok: false, firstBad: 0 });
    const splicedLeaves = leavesOf(spliced);
    expect(verifyConsistency(8, 9, checkpoint.root, rootOf(splicedLeaves), consistencyProof(splicedLeaves, 8, 9))).toBe(false);
    // An entry appended at the end is what a consistency proof shows.
    const grown = [...entries, entryOf(ORIGIN, 8, { kind: 'run', by: { card: CARD, as: 'owner' } })];
    const grownLeaves = leavesOf(grown);
    expect(verifyRecord(grown, [checkpoint])).toMatchObject({ ok: true, size: 9 });
    expect(verifyConsistency(8, 9, checkpoint.root, rootOf(grownLeaves), consistencyProof(grownLeaves, 8, 9))).toBe(true);
    expect(verifyInclusion(grownLeaves[8]!, 8, 9, inclusionProof(grownLeaves, 8, 9), rootOf(grownLeaves))).toBe(true);
    // Checkpoints of another log, or that disagree, are not this record's.
    const other = { ...checkpoint, origin: logOrigin('other', CARD) };
    expect(verifyRecord(entries, [other])).toMatchObject({ ok: false, origin: other.origin, firstBad: 0 });
    expect(verifyRecord(entries, [checkpoint, other])).toMatchObject({ ok: false, firstBad: null });
    expect(verifyRecord(entries, [checkpoint, { ...checkpoint, root: flip(checkpoint.root) }])).toMatchObject({ ok: false, firstBad: null, reason: 'the checkpoints disagree: two roots at size 8' });
    expect(verifyRecord(entries, [{ origin: ORIGIN, size: -1, root: checkpoint.root }])).toMatchObject({ ok: false, firstBad: null });
    expect(verifyRecord(entries, [{ origin: ORIGIN, size: 0, root: leaves[0]! }])).toMatchObject({ ok: false, firstBad: null, reason: "checkpoint 0 is at size 0 with a root other than the empty tree's" });
    expect(verifyRecord(entries, [{ origin: ORIGIN, size: 0, root: EMPTY_ROOT }])).toMatchObject({ ok: true, size: 8 });
    // A failed verifyCheckpoint result is not a checkpoint, even with a size and root in it.
    expect(verifyRecord(entries, [{ ...checkpoint, ok: false } as never])).toMatchObject({ ok: false, firstBad: null, reason: 'checkpoint 0 failed its check' });
  });

  it('reports the first fault, whether an entry or a checkpoint finds it', () => {
    const entries = logOf(8);
    const leaves = leavesOf(entries);
    const cp = (size: number) => ({ origin: ORIGIN, size, root: rootOf(leaves, size) });
    // Entry 1 changed (only a checkpoint shows it) and entry 5 malformed: the checkpoint at 4 comes first.
    const both = entries.map((e, i) => (i === 1 ? { ...e, nonce: (e.nonce[0] === '0' ? '1' : '0') + e.nonce.slice(1) } : i === 5 ? { ...e, extra: true } : e));
    expect(verifyRecord(both, [cp(4)])).toEqual({ ok: false, origin: ORIGIN, size: 0, root: EMPTY_ROOT, firstBad: 0, reason: "the record doesn't match its checkpoint at size 4: an entry before entry 4 was changed, removed or put in" });
    expect(verifyRecord(both, [cp(6)])).toMatchObject({ ok: false, size: 5, root: rootOf(leavesOf(both), 5), firstBad: 5 });
    // Checkpoints that disagree are found whatever the entries are.
    expect(verifyRecord(both, [cp(8), { ...cp(8), root: flip(cp(8).root) }])).toMatchObject({ ok: false, firstBad: null, reason: 'the checkpoints disagree: two roots at size 8' });
  });

  it('checks a checkpoint at every size, and says no to what is not a record', () => {
    const entries = logOf(70);
    const leaves = leavesOf(entries);
    const every = Array.from({ length: 71 }, (_, size) => ({ origin: ORIGIN, size, root: rootOf(leaves, size) })).reverse();
    expect(verifyRecord(entries, every)).toEqual({ ok: true, origin: ORIGIN, size: 70, root: rootOf(leaves), firstBad: null, reason: null });
    for (const k of [0, 1, 31, 32, 33, 63, 64, 69]) {
      const changed = entries.map((e, i) => (i === k ? { ...e, kind: 'edited' } : e));
      expect(verifyRecord(changed, every), `entry ${k}`).toMatchObject({ ok: false, size: k, root: rootOf(leaves, k), firstBad: k });
    }
    for (const bad of [null, undefined, {}, 'entries', 3]) expect(verifyRecord(bad as never), String(bad)).toMatchObject({ ok: false, size: 0, firstBad: null });
    for (const bad of [null, {}, 'checkpoints', 3]) expect(verifyRecord(entries, bad as never), String(bad)).toMatchObject({ ok: false, size: 0, firstBad: null });
    expect(verifyRecord(entries, [null as never])).toMatchObject({ ok: false, firstBad: null });
  });
});

// ------------------------------------------------------------------ checkpoints

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const b64 = (hexText: string) => Buffer.from(hexText, 'hex').toString('base64');

/** A body signed as checkpoint/0 signs it, without checkpointBody's checks. */
async function signRaw(identity: Identity, body: string): Promise<SignedCheckpoint> {
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identity.privateKey, utf8(`smaltfl/checkpoint/0\n${body}`));
  return { checkpoint: body, signer: identity.card, signature: hex(new Uint8Array(sig)) };
}

describe('checkpoint/0', () => {
  it("names a flow's record by its flow and its signer", () => {
    expect(logOrigin('nyc taxis/2024', CARD)).toBe(`smaltfl/log/nyc%20taxis%2F2024/${CARD.slice(0, 16)}`);
    expect(() => logOrigin('nyc-taxis', 'abc')).toThrow(TypeError);
  });

  it('writes and parses the body as three lines', () => {
    const body = checkpointBody(ORIGIN, 8, ROOTS[7]!);
    expect(body).toBe(`${ORIGIN}\n8\n${b64(ROOTS[7]!)}\n`);
    expect(b64(ROOTS[7]!)).toHaveLength(44);
    expect(parseCheckpoint(body)).toEqual({ origin: ORIGIN, size: 8, root: ROOTS[7] });
    expect(parseCheckpoint(checkpointBody('o', 0, EMPTY_ROOT))).toEqual({ origin: 'o', size: 0, root: EMPTY_ROOT });
    expect(() => checkpointBody(ORIGIN, 8, ROOTS[7]!.toUpperCase())).toThrow(TypeError);
    expect(() => checkpointBody(ORIGIN, -1, ROOTS[7]!)).toThrow(RangeError);
    expect(() => checkpointBody(ORIGIN, 1.5, ROOTS[7]!)).toThrow(RangeError);
    expect(() => checkpointBody('a\nb', 8, ROOTS[7]!)).toThrow(TypeError);
    expect(() => checkpointBody(ORIGIN, 0, ROOTS[0]!)).toThrow(RangeError);
  });

  it('signs and verifies a checkpoint, known only to whoever trusts its card', async () => {
    const owner = await createIdentity('Owner');
    const other = await createIdentity('Other');
    const origin = logOrigin('nyc-taxis', owner.card.fingerprint);
    const signed = await signCheckpoint(owner, origin, 8, ROOTS[7]!);
    expect(signed.checkpoint).toBe(`${origin}\n8\n${b64(ROOTS[7]!)}\n`);
    expect(signed.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(await verifyCheckpoint(signed)).toEqual({ ok: true, origin, size: 8, root: ROOTS[7], signer: owner.card, known: false, reason: null });
    expect(await verifyCheckpoint(signed, owner.card)).toMatchObject({ ok: true, known: true });
    expect(await verifyCheckpoint(signed, { ...owner.card, name: 'Renamed' })).toMatchObject({ ok: true, known: true });
    expect(await verifyCheckpoint(signed, other.card)).toMatchObject({ ok: true, known: false });
    // The domain tag and body are exactly what is signed.
    expect(await verifyCheckpoint(await signRaw(owner, signed.checkpoint), owner.card)).toMatchObject({ ok: true, known: true });
    // Through JSON, as a file kept elsewhere.
    expect(await verifyCheckpoint(JSON.parse(JSON.stringify(signed)))).toMatchObject({ ok: true });
  });

  it('fails a changed size, root or origin', async () => {
    const owner = await createIdentity('Owner');
    const origin = logOrigin('nyc-taxis', owner.card.fingerprint);
    const signed = await signCheckpoint(owner, origin, 8, ROOTS[7]!);
    const reason = "the signature doesn't match the checkpoint";
    for (const body of [checkpointBody(origin, 7, ROOTS[7]!), checkpointBody(origin, 8, ROOTS[6]!), checkpointBody(logOrigin('other', owner.card.fingerprint), 8, ROOTS[7]!)]) {
      const check = await verifyCheckpoint({ ...signed, checkpoint: body }, owner.card);
      expect(check).toMatchObject({ ok: false, known: false, reason });
    }
    expect(await verifyCheckpoint({ ...signed, signature: flip(signed.signature, 40) })).toMatchObject({ ok: false, reason });
    expect(await verifyCheckpoint({ ...signed, signature: signed.signature.toUpperCase() })).toMatchObject({ ok: false, reason });
    expect(await verifyCheckpoint({ ...signed, signature: signed.signature.slice(2) })).toMatchObject({ ok: false, reason });
  });

  it('fails a different key with the same card name, and a card whose fingerprint is not its key', async () => {
    const owner = await createIdentity('Owner');
    const impostor = await createIdentity('Owner');
    const origin = logOrigin('nyc-taxis', owner.card.fingerprint);
    const signed = await signCheckpoint(owner, origin, 8, ROOTS[7]!);
    expect(await verifyCheckpoint({ ...signed, signer: impostor.card })).toMatchObject({ ok: false, reason: "the signature doesn't match the checkpoint" });
    expect(await verifyCheckpoint({ ...signed, signer: { ...owner.card, key: impostor.card.key } })).toMatchObject({ ok: false, reason: "the signer's fingerprint doesn't match its key" });
    expect(await verifyCheckpoint({ ...signed, signer: { ...impostor.card, fingerprint: owner.card.fingerprint } })).toMatchObject({ ok: false, reason: "the signer's fingerprint doesn't match its key" });
    // Signed by its own key, for a log that names someone else.
    const forged = await signCheckpoint(impostor, origin, 8, ROOTS[7]!);
    const check = await verifyCheckpoint(forged, owner.card);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe(`the checkpoint is of a log signed by ${owner.card.fingerprint.slice(0, 16)}, but Owner (${impostor.card.fingerprint.slice(0, 16)}) signed it`);
    // An origin that is not a flow's record names no signer.
    expect(await verifyCheckpoint(await signCheckpoint(impostor, 'example.com/log', 8, ROOTS[7]!))).toMatchObject({ ok: true });
  });

  it('parses the body strictly, even when it is validly signed', async () => {
    const owner = await createIdentity('Owner');
    const origin = logOrigin('nyc-taxis', owner.card.fingerprint);
    const root = b64(ROOTS[7]!);
    const last = B64.indexOf(root[42]!);
    expect(last % 4).toBe(0);
    const bodies = [
      `${origin}\n8\n${root}`,
      `${origin}\n8\n${root}\n\n`,
      `${origin}\n8\n${root}\nextension\n`,
      `${origin}\n${root}\n`,
      `\n8\n${root}\n`,
      `${origin}\n08\n${root}\n`,
      `${origin}\n+8\n${root}\n`,
      `${origin}\n8.0\n${root}\n`,
      `${origin}\n-1\n${root}\n`,
      `${origin}\n 8\n${root}\n`,
      `${origin}\n9007199254740993\n${root}\n`,
      `${origin}\n8\n${root.slice(0, 43)}\n`,
      `${origin}\n8\n${root.slice(0, 42)}${B64[last + 1]}=\n`,
      `${origin}\n8\n${b64(ROOTS[7]! + 'ab')}\n`,
      `${origin}\n8\n${Buffer.from(ROOTS[7]!, 'hex').toString('base64url')}\n`,
      `${origin}\n8\n${ROOTS[7]}\n`,
      `${origin}\r\n8\r\n${root}\r\n`,
    ];
    for (const body of bodies) {
      const check = await verifyCheckpoint(await signRaw(owner, body), owner.card);
      expect(check.ok, JSON.stringify(body)).toBe(false);
      expect(check.reason, JSON.stringify(body)).not.toMatch(/signature/);
    }
    expect((await verifyCheckpoint(await signRaw(owner, `${origin}\n8\n${root}\n`), owner.card)).ok).toBe(true);
    // The empty tree has one root: a checkpoint at size 0 with another says something no log can.
    expect(await verifyCheckpoint(await signRaw(owner, `${origin}\n0\n${root}\n`), owner.card)).toMatchObject({ ok: false, reason: "the checkpoint is at size 0 with a root other than the empty tree's" });
    expect(await verifyCheckpoint(await signCheckpoint(owner, origin, 0, EMPTY_ROOT), owner.card)).toMatchObject({ ok: true, size: 0, root: EMPTY_ROOT });
    for (const envelope of [null, {}, 'checkpoint', { checkpoint: `${origin}\n8\n${root}\n`, signer: owner.card }, { checkpoint: `${origin}\n8\n${root}\n`, signer: { name: 'Owner' }, signature: '00' }]) {
      expect(await verifyCheckpoint(envelope)).toMatchObject({ ok: false, known: false });
    }
  });

  it('anchors a record: a verified checkpoint is what the record is checked against', async () => {
    const owner = await createIdentity('Owner');
    const origin = logOrigin('nyc-taxis', owner.card.fingerprint);
    const entries = logOf(5, origin);
    const signed = await signCheckpoint(owner, origin, 5, rootOf(leavesOf(entries)));
    const check = await verifyCheckpoint(signed, owner.card);
    if (!check.ok) throw new Error(check.reason);
    expect(verifyRecord(entries, [check])).toMatchObject({ ok: true, origin, size: 5 });
    expect(verifyRecord(entries.slice(0, 4), [check])).toMatchObject({ ok: false, firstBad: 4 });
  });
});
