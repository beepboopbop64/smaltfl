/**
 * File integrity: what a data file is, against the published list and against what this browser saw before.
 */
import { describe, expect, it } from 'vitest';
import { fetchChecked, IntegrityError } from '../src/app/fetch-checked.js';
import { sha256Hex } from '../src/core/hash.js';
import { classify, describe as say, severityOf, usable, type FileCheck } from '../src/core/integrity.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('classifying a data file', () => {
  it('uses only bytes that match the list, and says how they compare with what was seen before', () => {
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: { sha256: A, bytes: 10 } })).toBe('new');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: { sha256: A, bytes: 10 }, seen: A })).toBe('same');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: { sha256: A, bytes: 10 }, seen: B })).toBe('republished');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: { sha256: B, bytes: 10 } })).toBe('corrupt');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: { sha256: A, bytes: 11 } })).toBe('corrupt');
    expect(classify({ actual: { sha256: A, bytes: 10 } })).toBe('unlisted');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: null, status: 404 })).toBe('missing');
    expect(classify({ listed: { sha256: A, bytes: 10 }, actual: null })).toBe('not-checked');
    expect(['same', 'new', 'republished', 'corrupt', 'missing', 'unlisted', 'list', 'not-checked'].filter((c) => usable(c as never))).toEqual(['same', 'new', 'republished']);
  });

  it('raises an alarm only for bytes that are wrong, and never for a network error', () => {
    expect(severityOf('corrupt')).toBe('alert');
    expect(severityOf('list')).toBe('alert');
    expect(severityOf('republished')).toBe('warn');
    expect(severityOf('not-checked')).toBe('note');
    expect(severityOf('same')).toBe('ok');
  });

  it('says what happened in plain words, with both hashes when they differ', () => {
    const c = say({ path: 'loads/yellow_tripdata_2024-01-07.parquet', class: 'corrupt', expected: A, actual: B, commit: 'f2c12f85e33bd346e1741535b4687103917bdb97', at: '' });
    expect(c.title).toBe("loads/yellow_tripdata_2024-01-07.parquet isn't the file published");
    expect(c.detail).toContain(`hash to ${B}, where the data's list at data commit f2c12f85e33b gives ${A}`);
    expect(say({ path: 'zones.csv', class: 'same', bytes: 12331, at: '' }).detail).toMatch(/^Its 12 kB hash to the sha256/);
  });
});

describe('fetching a data file, checked', () => {
  const real = globalThis.fetch;
  /** A server that answers every path with these bodies, in turn. */
  const serve = (...bodies: (string | Error)[]) => {
    let i = 0;
    globalThis.fetch = (async () => {
      const b = bodies[Math.min(i++, bodies.length - 1)]!;
      if (b instanceof Error) throw b;
      return new Response(b, { status: 200 });
    }) as typeof fetch;
  };
  const parquet = new Uint8Array([80, 65, 82, 49, 0, 1, 2, 3, 80, 65, 82, 49]);
  const b64 = btoa(String.fromCharCode(...parquet));
  const expected = async () => ({ sha256: await sha256Hex(parquet), bytes: parquet.length });

  it('uses bytes that match, decoded from base64', async () => {
    serve(b64);
    try {
      const got = await fetchChecked('loads/a.parquet', await expected());
      expect([...got]).toEqual([...parquet]);
    } finally {
      globalThis.fetch = real;
    }
  });

  it('refuses a body that arrived but is not base64 as bytes that are not the file, not as a network error', async () => {
    serve(`${b64.slice(0, 4)}!${b64.slice(5)}`);
    const checks: FileCheck[] = [];
    try {
      const e = await fetchChecked('loads/a.parquet', await expected(), { onCheck: (c) => checks.push(c) }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(IntegrityError);
      expect((e as IntegrityError).check.class).toBe('corrupt');
      expect(checks.map((c) => c.class)).toEqual(['corrupt']);
      expect(severityOf(checks[0]!.class)).toBe('alert');
    } finally {
      globalThis.fetch = real;
    }
  });

  it('says a network error is not checked', async () => {
    serve(new TypeError('Failed to fetch'));
    try {
      const e = await fetchChecked('loads/a.parquet', await expected()).catch((x: unknown) => x);
      expect((e as IntegrityError).check.class).toBe('not-checked');
    } finally {
      globalThis.fetch = real;
    }
  });
});
