import { describe, expect, it } from 'vitest';
import { hex } from '../src/core/hash.js';
import { sha256HexSync } from '../src/core/sha256.js';

const webcrypto = async (bytes: Uint8Array<ArrayBuffer>) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));

describe('synchronous SHA-256', () => {
  it('matches the FIPS 180-4 examples', () => {
    const utf8 = (s: string) => new TextEncoder().encode(s);
    expect(sha256HexSync(utf8(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256HexSync(utf8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexSync(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches WebCrypto at every length around the block and padding boundaries, and beyond', async () => {
    let seed = 1;
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24;
    for (const n of [...Array.from({ length: 200 }, (_, i) => i), 1000, 4095, 4096, 4097, 100_000]) {
      const bytes = new Uint8Array(n).map(() => next());
      expect(sha256HexSync(bytes), `${n} bytes`).toBe(await webcrypto(bytes));
    }
  });
});
