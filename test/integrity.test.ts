/**
 * File integrity: what a data file is, against the published list and against what this browser saw before.
 */
import { describe, expect, it } from 'vitest';
import { classify, describe as say, severityOf, usable } from '../src/core/integrity.js';

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
