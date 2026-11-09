/**
 * The flow's verdict on the real history (ADR 0009 §3): the days `wrong` and `short` hold are a test vector, so a change
 * to the story that moves one fails here until it is accepted on purpose (Q-52). The example judges its trips in the
 * general form since phase 3 (ADR 0010 §13): Election Day in its calendar and last year's oddities no longer echoing
 * take 2022-11-08, 2023-11-07 and 2023-11-14 out, as the owner accepted (Q-54: "yes, 25 days"); the legacy form still
 * holds its 28. Runs when the app has been built from the data branch (npm run build:app writes
 * dist/app/data/history.json and loads.json); skipped otherwise. The same days held through the engine, on the real
 * files: test/pause-real.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDataList } from '../src/app/datalist.js';
import { EXAMPLE_DATA } from '../examples/sources.js';
import type { FlowDocument } from '../src/core/document.js';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { levelMetrics } from '../src/core/fill.js';
import { claimHolds, countedChecks, dayClaim, flowStory, rangesFor, type StoryClaim } from '../src/core/hold.js';
import { exampleFilled, exampleLegacy } from './helpers/example.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as unknown;
const has = existsSync(new URL('history.json', DATA)) && existsSync(new URL('loads.json', DATA)) && (read('history.json') as HistoryFile).days.length > 400;

/** The 22 days `short` holds over 2022-01-01 to 2024-01-31: seven episodes, four of them feed incidents. */
const SHORT = [
  '2022-01-04', '2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09', '2022-01-29', '2022-08-10', '2022-09-17', '2022-09-18',
  '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20', '2022-12-22',
  '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24',
];
/** What `wrong` adds: fare codes coming and going while the trips stay in their range (the fare change of Dec 19, 2022). */
const WRONG_ONLY = ['2022-12-19', '2022-12-20', '2022-12-21'];
/** What the legacy form adds besides (ADR 0010 §13): Election Day 2022, unknown to its calendar, and its echoes. */
const LEGACY_ONLY = ['2022-11-08', '2023-11-07', '2023-11-14'];

describe.skipIf(!has)('the flow’s verdict on the real history (ADR 0009 §3)', () => {
  const file = has ? (read('history.json') as HistoryFile) : null;
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
  // The flow's ranges as its document says: the calendar with Election Day, the echo fix (ADR 0010 §2, §5).
  const h = file ? new HistoryRanges(file, rangesFor(doc, 'trips')) : null;
  const ref = { path: 'history.json', sha256: '0'.repeat(64), bytes: 0 };
  const span = file ? file.days.filter((d) => d >= '2022-01-01' && d <= '2024-01-31') : [];
  let told: StoryClaim[] | null = null;
  const claimsOf = (): StoryClaim[] => (told ??= span.map((day) => dayClaim(h!, doc, ref, day, 'trips', 'dev')!));

  it('holds exactly the 25 days under wrong, and the 22 under short (vector, Q-54)', () => {
    const claims = claimsOf();
    expect(claims).toHaveLength(761);
    const wrong = claims.filter((c) => claimHolds(['checks', 'wrong'], c)).map((c) => c.day);
    const short = claims.filter((c) => claimHolds(['checks', 'short'], c)).map((c) => c.day);
    expect(short).toEqual(SHORT);
    expect(wrong).toEqual([...SHORT, ...WRONG_ONLY].sort());
    // No day of 2023 holds under short but the feed incident of Sep 21–24.
    expect(short.filter((d) => d.startsWith('2023'))).toEqual(['2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24']);
    // Election Day is judged now against last year's (2022-11-08 against 2021-11-02): unusual, which doesn't hold.
    expect(claims.find((c) => c.day === '2022-11-08')).toMatchObject({ state: 'unusual', below: false });
  }, 120_000);

  it('holds the 28 days it held in the legacy form, which keeps today’s rules (ADR 0010 §0)', () => {
    const legacy = exampleLegacy();
    const plain = new HistoryRanges(file!);
    const wrong = span.filter((d) => claimHolds(['checks', 'wrong'], dayClaim(plain, legacy, ref, d, 'trips', 'dev')!));
    expect(wrong).toEqual([...SHORT, ...WRONG_ONLY, ...LEGACY_ONLY].sort());
  }, 120_000);

  it('says the 21 days with nothing to compare against are not judged yet, holds none of them, and finds none under the floor (ADR 0010 §1, Q-53)', () => {
    const claims = claimsOf();
    const unlearned = claims.filter((c) => c.state === 'unlearned');
    // Every holiday and holiday window of 2022 before the history had a last year to judge it by, and Columbus Day 2022,
    // whose last year the history holds too little of.
    expect(unlearned.map((c) => c.day)).toEqual([
      '2022-01-01', '2022-01-02', '2022-01-03', '2022-01-17', '2022-02-21', '2022-05-28', '2022-05-29', '2022-05-30', '2022-06-19', '2022-06-20',
      '2022-07-01', '2022-07-02', '2022-07-03', '2022-07-04', '2022-07-05', '2022-07-06', '2022-07-07', '2022-09-03', '2022-09-04', '2022-09-05', '2022-10-10',
    ]);
    expect(unlearned.every((c) => c.head === 'Not judged yet' && !c.below)).toBe(true);
    expect(unlearned.filter((c) => claimHolds(['checks', 'wrong'], c) || claimHolds(['checks', 'short'], c))).toEqual([]);
    // A flow that lists them holds them.
    expect(unlearned.filter((c) => claimHolds(['checks', 'unlearned', 'wrong'], c))).toHaveLength(21);
    // No day of the span falls under the floor that needs no range.
    expect(claims.filter((c) => /^Almost no /.test(c.head))).toEqual([]);
  }, 120_000);

  it('holds the same days with the example’s fill step: the checks are still counted on the trips (A6)', () => {
    // A claim depends on the document only through whether the history counts its checks: with the fill step, the
    // checks read the trips through it, and still count them, so every verdict above stands.
    expect(countedChecks(doc, h!, 'trips')).toBe(true);
    expect(countedChecks(exampleFilled(), h!, 'trips')).toBe(true);
    const plain = new HistoryRanges(file!);
    for (const day of ['2023-09-21', '2022-11-15', '2023-09-20']) expect(dayClaim(plain, exampleFilled(), ref, day, 'trips', 'dev')).toEqual(dayClaim(h!, doc, ref, day, 'trips', 'dev'));
  });

  it('learns a level accepted from its day on: the fare change of Dec 19, 2022, and the vendor gone on Nov 14 (I15)', () => {
    // Each day after an Accept told with the level its cause moved (amendment 1 S6, C6): what the day was off by, learned
    // anew from it.
    const after = (from: string, days: string[]) => {
      const level = { from, metrics: levelMetrics(flowStory(h!, from, doc, 'trips')), decision: 1 };
      const hl = new HistoryRanges(file!, { ...rangesFor(doc, 'trips'), levels: [level] });
      return days.map((d) => dayClaim(hl, doc, ref, d, 'trips', 'dev')!);
    };
    // The TLC's new surcharges: Dec 20 and 21 publish, as the new level they are, and name it.
    const dec = after('2022-12-19', ['2022-12-20', '2022-12-21']);
    expect(dec.map((c) => claimHolds(['checks', 'wrong'], c))).toEqual([false, false]);
    expect(dec[0]!.levels).toEqual([expect.objectContaining({ from: '2022-12-19', decision: 1 })]);
    // Vendor 1 gone, accepted: Tue 15 and Wed 16 publish; Mon 21, the vendor back, is a change again and pauses.
    const nov = after('2022-11-14', ['2022-11-15', '2022-11-16', '2022-11-21']);
    expect(nov.map((c) => claimHolds(['checks', 'wrong'], c))).toEqual([false, false, true]);
    expect(nov[2]!.head).toMatch(/^More trips/);
  }, 120_000);

  it('tells the owner’s examples by their cause', () => {
    expect(dayClaim(h!, doc, ref, '2023-09-21', 'trips', 'dev')).toMatchObject({ state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00', rows: 41_939 });
    expect(dayClaim(h!, doc, ref, '2022-11-15', 'trips', 'dev')).toMatchObject({ state: 'wrong', below: true, head: 'Vendor 1 sent almost nothing' });
    expect(dayClaim(h!, doc, ref, '2023-09-20', 'trips', 'dev')).toMatchObject({ below: false });
    expect(claimHolds(['checks', 'wrong'], dayClaim(h!, doc, ref, '2023-09-20', 'trips', 'dev')!)).toBe(false);
  });

  it('counts, for every load, the rows of the day’s file: else every day would be held as not judged', () => {
    const loads = readDataList(read('loads.json'), EXAMPLE_DATA);
    const all = [...loads.loads, ...loads.episodes.flatMap((e) => e.loads)];
    expect(all).toHaveLength(57);
    for (const l of all) expect(file!.rows[file!.days.indexOf(l.day)], l.day).toBe(l.rows);
  });
});
