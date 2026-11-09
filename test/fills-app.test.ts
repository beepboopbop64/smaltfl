/**
 * Filling a paused day in the app (src/app/fills.ts, ADR 0009 amendment 1 S3–S5, S9): the remedies the sheet offers a
 * held day, the repair a decision names, a derived run's record entry, and when a staged run can't go. On the
 * synthetic history (test/helpers/history.ts) and the example with its fill step.
 */
import { describe, expect, it } from 'vitest';
import { fillCounts } from '../src/core/fill.js';
import { HistoryRanges } from '../src/core/history.js';
import { dayClaim, flowStory, type HistoryRef } from '../src/core/hold.js';
import type { RunResult } from '../src/core/protocol.js';
import { derivedFails, derivedWhy, donorsOf, repairOf } from '../src/app/fills.js';
import { exampleLegacy, exampleUnfilled } from './helpers/example.js';
import { historyWith } from './helpers/history.js';

const DAY = '2023-09-21';
const ref: HistoryRef = { path: 'history.json', sha256: '0'.repeat(64), bytes: 0 };
const listed = (d: string): HistoryRef => ({ path: `loads/${d}.parquet`, sha256: 'a'.repeat(64), bytes: 1000 });

describe('the remedies a held day gets in the app (S2, S3, S5)', () => {
  const h = new HistoryRanges(historyWith({ [DAY]: { stopAt: 13 } }));
  // ADR 0009's machinery, on the example in the legacy form it had when the fills came (vector 4).
  const doc = exampleLegacy();
  const ask = (over: Partial<Parameters<typeof donorsOf>[0]> = {}) => donorsOf({ h, doc, day: DAY, source: 'trips', story: flowStory(h, DAY, doc, 'trips'), claim: dayClaim(h, doc, ref, DAY, 'trips', 'dev'), listed, history: ref, build: 'dev', later: null, readers: null, partFails: false, ...over });

  it('offers a fill from the good days the data lists, the watch’s rule first, and the part alone, each with its counts', () => {
    const r = ask()!;
    expect(r).toMatchObject({ step: 'trips_filled', source: 'trips', missing: { time: 'tpep_pickup_datetime', hours: [13, 23] } });
    expect(r.offers.map((o) => [o.option, o.label])).toEqual([['fill', 'Fill from Thu 14'], ['complete', 'Before 13:00 only']]);
    expect(r.picks[0]).toMatchObject({ rule: 'weekday', direction: 'before', day: '2023-09-14' });
    for (const p of r.picks) expect(r.counts.get(p.day)).toEqual(fillCounts(h, DAY, r.missing, p.day));
    expect(r.part).toEqual(fillCounts(h, DAY, r.missing, null));
    // A later day published: both off; the part alone marked when it fails its checks (Q-67).
    expect(ask({ later: '2023-09-25' })!.offers.map((o) => o.off)).toEqual(['Mon 25 is published', 'Mon 25 is published']);
    expect(ask({ partFails: true })!.offers[1]).toMatchObject({ note: 'fails its checks' });
    // Readers have the fill: it can be withdrawn (Q-61).
    expect(ask({ readers: 'fill' })!.offers.at(-1)).toEqual({ option: 'dont', label: 'Withdraw the fill', withdraws: true });
  });

  it('offers nothing without a fill step, on a day with nothing missing, or where the data lists no good day near', () => {
    const plain = exampleUnfilled();
    expect(ask({ doc: plain, story: flowStory(h, DAY, plain, 'trips'), claim: dayClaim(h, plain, ref, DAY, 'trips', 'dev') })).toBeNull();
    const calm = '2023-09-20';
    expect(ask({ day: calm, story: flowStory(h, calm, doc, 'trips'), claim: dayClaim(h, doc, ref, calm, 'trips', 'dev') })).toBeNull();
    const none = ask({ listed: () => null })!;
    expect(none.picks).toEqual([]);
    expect(none.offers[0]).toMatchObject({ option: 'fill', off: 'No good day near' });
  });

  it('names the repair a decision carries: the donor’s file as the data lists it, or no donor for the part alone', () => {
    const r = ask()!;
    const fill = repairOf(r, r.picks[0]!);
    expect(fill).toMatchObject({ kind: 'fill', step: 'trips_filled', source: 'trips', missing: r.missing, donor: { rule: 'weekday', direction: 'before', day: '2023-09-14', file: listed('2023-09-14') } });
    expect(fill.donor!.claim.source).toBe('trips_donor');
    expect(repairOf(r, null)).toEqual({ kind: 'complete', step: 'trips_filled', source: 'trips', missing: r.missing, donor: null });
  });
});

describe('a staged run that can’t go (S10)', () => {
  const result = (holds: string[], derived: string[]) => ({ holds: holds.map((by) => ({ by })), derived: { holds: derived.map((by) => ({ by })), filled: 1 } }) as unknown as RunResult;
  it('goes when only its day’s story and its being derived hold it; its checks or its donor keep it back', () => {
    expect(derivedFails(result(['story'], ['derived']))).toBe(false);
    expect(derivedFails(result(['story', 'checks'], ['derived']))).toBe(true);
    expect(derivedFails(result(['story'], ['derived', 'donor']))).toBe(true);
    expect(derivedFails(result(['unjudged'], ['derived']))).toBe(true);
  });
  it('says which hold keeps it back: its checks with their figures, a source not judged, or a donor judged not good', () => {
    const gate = { share: 0.12, limit: 0.1 };
    expect(derivedWhy(result(['story'], ['derived']), gate, '2023-09-14')).toBeNull();
    expect(derivedWhy(result(['story', 'checks'], ['derived']), gate, '2023-09-14')).toEqual({ by: 'checks', gate, rule: null });
    const rule = { holds: [{ by: 'checks', said: 'expectations failed: fare (3 rows)' }], derived: { holds: [{ by: 'derived' }], filled: 1 } } as unknown as RunResult;
    expect(derivedWhy(rule, null, null)).toEqual({ by: 'checks', gate: null, rule: 'fare' });
    // A day given no claim to be judged by (the owner's Sep 21 snapshot): not judged, not failing checks.
    expect(derivedWhy(result(['story', 'unjudged'], ['derived']), null, '2023-09-14')).toEqual({ by: 'unjudged' });
    const donor = (claim: boolean) => ({ holds: [{ by: 'story' }], derived: { holds: [{ by: 'derived' }, { by: 'donor', said: 'x', ...(claim ? { claim: {} } : {}) }], filled: 1 } }) as unknown as RunResult;
    expect(derivedWhy(donor(true), null, '2023-09-14')).toEqual({ by: 'donor', day: '2023-09-14' });
    expect(derivedWhy(donor(false), null, '2023-09-14')).toEqual({ by: 'unjudged' });
  });
});
