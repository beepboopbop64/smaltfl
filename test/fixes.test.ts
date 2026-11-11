/**
 * The fixes a held day may be offered (src/core/rules.ts `FIX_KINDS`, the maintainer 2026-11-11): set by file in the
 * ontology (and in a shared ontology), and only those suggested and offered. The sign-in log allows carrying a good day
 * forward or back and replacing the file: never an estimate, never the part alone.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { missingOf, offersOf } from '../src/core/fill.js';
import { FIX_KINDS, fixesOf, fixOfDonor } from '../src/core/rules.js';
import { sharedOf } from '../src/core/shared.js';
import { loadFlowDir, signinsDir } from './helpers/notebooks.js';

describe('the fixes a file allows', () => {
  it('are the ontology’s list for the file, else every one; the sign-in log allows forward, back and replace', async () => {
    const doc = await loadFlowDir(signinsDir);
    expect(validateDocument(doc)).toEqual([]);
    expect([...fixesOf(doc.ontology, 'auth')]).toEqual(['forward', 'backward', 'replace']);
    expect([...fixesOf(doc.ontology, 'elsewhere')]).toEqual([...FIX_KINDS]);
    expect([...fixesOf(undefined, 'auth')]).toEqual([...FIX_KINDS]);
    // From the shared ontology, and written back with it.
    expect(sharedOf(doc, 'auth').fixes).toEqual(['forward', 'backward', 'replace']);
  });

  it('refuses a fix that isn’t one, a list with one twice, or a file the flow doesn’t read', async () => {
    const doc = await loadFlowDir(signinsDir);
    const issues = (fixes: unknown) => validateDocument({ ...doc, ontology: { ...doc.ontology!, fixes } } as FlowDocument).filter((i) => i.path.startsWith('$.ontology.fixes')).map((i) => i.message);
    expect(issues({ auth: ['forward', 'teleport'] })).toEqual(['forward, backward, impute, part, replace, each once']);
    expect(issues({ auth: ['forward', 'forward'] })).toEqual(['forward, backward, impute, part, replace, each once']);
    expect(issues({ trips: ['forward'] })).toEqual(['no source trips']);
  });

  it('names each donor by the fix it gives: a like day is an estimate, the nearest day before or after is carried', () => {
    expect(fixOfDonor({ rule: 'weekday', direction: 'before' })).toBe('impute');
    expect(fixOfDonor({ rule: 'weekday', direction: 'after' })).toBe('impute');
    expect(fixOfDonor({ rule: 'nearest', direction: 'before' })).toBe('forward');
    expect(fixOfDonor({ rule: 'nearest', direction: 'after' })).toBe('backward');
  });
});

describe('what a held day is offered', () => {
  const claim = { state: 'wrong' as const, below: true };
  const fill = { time: 'event_time' };
  const vanished = { hero: 'split' as const, hours: null, split: { kind: 'vanished', column: 'method', value: '"mfa_push"' } } as never;

  it('fills a day whose file came with no rows, whole: there is no part that arrived to offer', () => {
    const empty = { hero: 'amount' as const, hours: null, split: null, amount: { value: 0, low: 5000, high: 8000, expected: 6500, change: -1 } } as never;
    expect(missingOf(empty, 'event_time')).toEqual({ time: 'event_time', hours: [0, 23] });
    expect(offersOf({ story: empty, claim, fill, donors: [{ day: '2024-03-14' }] }).map((x) => x.option)).toEqual(['fill']);
    // A day short but not empty is no missing part by its amount alone.
    expect(missingOf({ hero: 'amount', hours: null, split: null, amount: { value: 3000, low: 5000, high: 8000, expected: 6500, change: -0.5 } } as never, 'event_time')).toBeNull();
  });

  it('offers the part that arrived only where the file allows it, and a fill only where some fill is allowed', () => {
    const all = offersOf({ story: vanished, claim, fill, donors: [{ day: '2024-03-14' }] }).map((x) => x.option);
    expect(all).toEqual(['fill', 'complete']);
    expect(offersOf({ story: vanished, claim, fill, donors: [{ day: '2024-03-14' }], fixes: new Set(['forward', 'backward', 'replace']) }).map((x) => x.option)).toEqual(['fill']);
    expect(offersOf({ story: vanished, claim, fill, donors: [], fixes: new Set(['part', 'replace']) }).map((x) => x.option)).toEqual(['complete']);
  });
});
