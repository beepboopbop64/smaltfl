/**
 * The flow's verdict on the real history (ADR 0009 §3): the days `wrong` and `short` hold are a test vector, so a change
 * to the story that moves one fails here until it is accepted on purpose (Q-52). Runs when the app has been built from
 * the data branch (npm run build:app writes dist/app/data/history.json and loads.json); skipped otherwise. The same
 * days held through the engine, on the real files: test/pause-real.test.ts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FlowDocument } from '../src/core/document.js';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { claimHolds, dayClaim, type StoryClaim } from '../src/core/hold.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as unknown;
const has = existsSync(new URL('history.json', DATA)) && existsSync(new URL('loads.json', DATA)) && (read('history.json') as HistoryFile).days.length > 400;

/** The 22 days `short` holds over 2022-01-01 to 2024-01-31: seven episodes, four of them feed incidents. */
const SHORT = [
  '2022-01-04', '2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09', '2022-01-29', '2022-08-10', '2022-09-17', '2022-09-18',
  '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20', '2022-12-22',
  '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24',
];
/** What `wrong` adds: fare codes coming and going while the trips stay in their range. */
const WRONG_ONLY = ['2022-11-08', '2022-12-19', '2022-12-20', '2022-12-21', '2023-11-07', '2023-11-14'];

describe.skipIf(!has)('the flow’s verdict on the real history (ADR 0009 §3)', () => {
  const file = has ? (read('history.json') as HistoryFile) : null;
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
  const h = file ? new HistoryRanges(file) : null;
  const ref = { path: 'history.json', sha256: '0'.repeat(64), bytes: 0 };

  it('holds exactly the 28 days under wrong, and the 22 under short (vector)', () => {
    const claims: StoryClaim[] = [];
    for (const day of file!.days) if (day >= '2022-01-01' && day <= '2024-01-31') claims.push(dayClaim(h!, doc, ref, day, 'trips', 'dev')!);
    expect(claims).toHaveLength(761);
    const wrong = claims.filter((c) => claimHolds(['checks', 'wrong'], c)).map((c) => c.day);
    const short = claims.filter((c) => claimHolds(['checks', 'short'], c)).map((c) => c.day);
    expect(short).toEqual(SHORT);
    expect(wrong).toEqual([...SHORT, ...WRONG_ONLY].sort());
    // No day of 2023 holds under short but the feed incident of Sep 21–24.
    expect(short.filter((d) => d.startsWith('2023'))).toEqual(['2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24']);
  }, 120_000);

  it('tells the owner’s examples by their cause', () => {
    expect(dayClaim(h!, doc, ref, '2023-09-21', 'trips', 'dev')).toMatchObject({ state: 'wrong', below: true, head: 'Trips fall 95% from 13:00', rows: 41_939 });
    expect(dayClaim(h!, doc, ref, '2022-11-15', 'trips', 'dev')).toMatchObject({ state: 'wrong', below: true, head: 'Vendor 1 sent almost nothing' });
    expect(dayClaim(h!, doc, ref, '2023-09-20', 'trips', 'dev')).toMatchObject({ below: false });
    expect(claimHolds(['checks', 'wrong'], dayClaim(h!, doc, ref, '2023-09-20', 'trips', 'dev')!)).toBe(false);
  });

  it('counts, for every load, the rows of the day’s file: else every day would be held as not judged', () => {
    const loads = read('loads.json') as { loads: { day: string; rows: number }[]; episodes: { loads: { day: string; rows: number }[] }[] };
    const all = [...loads.loads, ...loads.episodes.flatMap((e) => e.loads)];
    expect(all).toHaveLength(57);
    for (const l of all) expect(file!.rows[file!.days.indexOf(l.day)], l.day).toBe(l.rows);
  });
});
