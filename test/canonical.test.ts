import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../src/core/canonical.js';
import { hashOf, hex, sha256Hex, unhex } from '../src/core/hash.js';

describe('canonical JSON (RFC 8785)', () => {
  it('sorts keys by UTF-16 code units, at every depth, with no whitespace', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, '€': 0, '😀': 0, A: true })).toBe(
      '{"A":true,"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1,"€":0,"😀":0}',
    );
  });

  it('writes numbers in their shortest round-trip form, and -0 as 0', () => {
    expect(canonicalJSON([1, 1.5, -0, 0.1 + 0.2, 1e21, 1e-7, 2 ** 53, 333333333.33333329])).toBe('[1,1.5,0,0.30000000000000004,1e+21,1e-7,9007199254740992,333333333.3333333]');
  });

  it('escapes strings as JSON.stringify does', () => {
    expect(canonicalJSON('a"b\\c\n\u0001 \ud800')).toBe('"a\\"b\\\\c\\n\\u0001 \\ud800"');
  });

  it('leaves out undefined properties, which JSON cannot hold', () => {
    expect(canonicalJSON({ a: undefined, b: 1 })).toBe('{"b":1}');
  });

  it('refuses what would change silently on the way to a hash', () => {
    expect(() => canonicalJSON([1, undefined])).toThrow(/\$\[1\] is undefined/);
    expect(() => canonicalJSON({ x: NaN })).toThrow(/\$\.x is NaN/);
    expect(() => canonicalJSON({ x: Infinity })).toThrow(/Infinity/);
    expect(() => canonicalJSON({ x: 1n })).toThrow(/bigint/);
    expect(() => canonicalJSON({ x: new Date(0) })).toThrow(/Date, not a plain object/);
    expect(() => canonicalJSON(new Map())).toThrow(/Map/);
    expect(() => canonicalJSON(() => 1)).toThrow(/function/);
  });

  it('gives equal text for equal values, whatever the key order', () => {
    expect(canonicalJSON({ x: 1, y: [1, 2] })).toBe(canonicalJSON({ y: [1, 2], x: 1 }));
  });
});

describe('hashes', () => {
  it('SHA-256 matches the standard test vectors', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('round-trips hex', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    expect(hex(bytes)).toBe('00017f80ff');
    expect(unhex('00017F80ff')).toEqual(bytes);
    expect(() => unhex('abc')).toThrow(/hex/);
  });

  it('tags each kind of value, so different kinds never share a hash', async () => {
    expect(await hashOf('flow/1', { a: 1 })).toBe(await sha256Hex('smaltfl/flow/1\n{"a":1}'));
    expect(await hashOf('flow/1', { a: 1 })).not.toBe(await hashOf('plan/0', { a: 1 }));
  });
});
