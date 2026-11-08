/**
 * The news: a day's findings from its history (newsOf), and a table's from its own rows (tableNewsOf). Each finding
 * says what, with its evidence, where to look, and what can be done; a day or a table with nothing to tell says so.
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { HistoryRanges } from '../src/core/history.js';
import { NONE } from '../src/core/calendar.js';
import type { FlowDocument } from '../src/core/document.js';
import { coverageOf, flowNames, isPlaceholder, judgeOf, LEGACY_JUDGE, MATERIAL, materialFor, newsOf, notJudgedChip, schemaChanges, shareWords, tableNewsOf, type JudgeSettings, type TableFacts } from '../src/core/news.js';
import { historyWith, tripNoun, vendorNames, type Trouble } from './helpers/history.js';

const names = { column: (c: string) => c, value: (_c: string, v: unknown) => String(v), noun: tripNoun };

const zones = (over: Partial<TableFacts> = {}): TableFacts => ({
  noun: 'zones',
  rows: 265,
  columns: [
    { name: 'LocationID', present: 265, distinct: 265 },
    { name: 'Borough', present: 265, distinct: 8 },
    { name: 'Zone', present: 264, distinct: 261 },
    { name: 'service_zone', present: 263, distinct: 4 },
  ],
  keys: [{ columns: ['LocationID'], by: 'trips_zoned', present: 265, distinct: 265 }],
  unmatched: [{ by: 'trips_zoned', column: 'PULocationID', rows: 0, of: 2_900_000 }],
  placeholders: [],
  placeholderRows: 0,
  exact: true,
  handledBy: [],
  input: true,
  ...over,
});

describe('a table’s news from its own rows', () => {
  it('says a sound lookup is sound, with what holds', () => {
    const news = tableNewsOf(zones({ columns: zones().columns.map((c) => ({ ...c, present: 265 })) }), names);
    expect(news.map((f) => f.kind)).toEqual(['calm']);
    expect(news[0]!.severity).toBe('ok');
    expect(news[0]!.detail).toBe('265 zones: each LocationID once and every row of trips_zoned finds its row here.');
  });

  it('warns when a key repeats, since a join then counts rows twice', () => {
    const news = tableNewsOf(zones({ keys: [{ columns: ['LocationID'], by: 'trips_zoned', present: 265, distinct: 263 }] }), names);
    const key = news.find((f) => f.kind === 'key')!;
    expect(key.severity).toBe('warn');
    expect(key.title).toBe('LocationID repeats: 263 values on 265 zones');
    expect(key.rows).toBe(2);
    expect(key.acts).toEqual(['notify', 'expected']);
    expect(news.some((f) => f.kind === 'calm')).toBe(false);
    // A key of two columns is judged together: each repeats alone, as a district's hours do.
    const hours = { ...zones(), noun: 'weather hours', rows: 4464, keys: [{ columns: ['borough', 'hour'], by: 'borough_hour_weather', present: 4464, distinct: 4464 }], columns: [{ name: 'borough', present: 4464, distinct: 6 }, { name: 'hour', present: 4464, distinct: 744 }], unmatched: [] };
    expect(tableNewsOf(hours, names).map((f) => [f.kind, f.detail])).toEqual([['calm', '4,464 weather hours: each borough and hour once together.']]);
    expect(tableNewsOf({ ...hours, keys: [{ ...hours.keys[0]!, distinct: 4400 }] }, names)[0]!.title).toBe('Borough and hour together repeat: 4,400 combinations on 4,464 weather hours');
  });

  it('tells rows a join finds no match for: a warning when they matter, a note when they don’t', () => {
    const many = tableNewsOf(zones({ unmatched: [{ by: 'trips_zoned', column: 'PULocationID', rows: 40_000, of: 2_900_000 }] }), names);
    expect(many.find((f) => f.kind === 'unmatched')).toMatchObject({ severity: 'warn', title: '40,000 of trips_zoned’s 2,900,000 rows find no row here', rows: 40_000 });
    const few = tableNewsOf(zones({ unmatched: [{ by: 'trips_zoned', column: 'PULocationID', rows: 12, of: 2_900_000 }] }), names);
    expect(few.find((f) => f.kind === 'unmatched')!.severity).toBe('note');
    // On the join's own card, said from its side; the looked-up column empty on just those rows is not told again.
    const own = tableNewsOf({
      ...zones(), noun: 'rows', rows: 2_900_000, input: false, keys: [],
      columns: [{ name: 'PULocationID', present: 2_900_000, distinct: 260 }, { name: 'pu_zone', present: 2_860_000, distinct: 255, added: true }],
      unmatched: [{ by: 'trips_zoned', column: 'PULocationID', rows: 40_000, of: 2_900_000, own: 'zones' }],
    }, names);
    expect(own.map((f) => f.title)).toEqual(['40,000 of 2,900,000 rows find no match in zones']);
    expect(own[0]!.look).toBe('dropped');
  });

  it('explains placeholder rows, and says what in the flow leaves them out', () => {
    const facts = zones({ placeholders: [{ column: 'Borough', value: 'Unknown', rows: 1 }, { column: 'Borough', value: 'N/A', rows: 1 }, { column: 'Zone', value: 'NV', rows: 1 }], placeholderRows: 2 });
    const left = tableNewsOf(facts, names).find((f) => f.kind === 'placeholder')!;
    expect(left.severity).toBe('note');
    expect(left.title).toBe('2 zones are placeholders, not real zones');
    expect(left.detail).toBe('Borough “Unknown” (1) and “N/A” (1) and Zone “NV” (1): values that stand for no value. Nothing in the flow leaves them out: a step that reads them shows them as if they were real.');
    expect(left.acts).toEqual(['quarantine', 'expected']);
    const handled = tableNewsOf({ ...facts, handledBy: ['zone_list'] }, names).find((f) => f.kind === 'placeholder')!;
    expect(handled.detail).toMatch(/zone_list leaves them out\.$/);
    expect(handled.acts).toEqual(['expected']);
  });

  it('tells an input’s empty values, and a step’s only in the columns it adds', () => {
    const news = tableNewsOf(zones(), names);
    expect(news.filter((f) => f.kind === 'empty').map((f) => f.title)).toEqual(['Service_zone empty on 0.8% of zones', 'Zone empty on 0.4% of zones']);
    const step = tableNewsOf({ ...zones(), noun: 'rows', input: false, keys: [], unmatched: [], columns: [{ name: 'fare', present: 90, distinct: 50 }, { name: 'tip_rate', present: 70, distinct: 60, added: true }], rows: 100 }, names);
    expect(step.filter((f) => f.kind === 'empty').map((f) => [f.title, f.acts])).toEqual([['Tip_rate empty on 30.0% of rows', ['expected']]]);
  });

  it('knows a placeholder when it sees one', () => {
    expect(['Unknown', ' N/A ', 'nv', '', '?', 'TBD'].every(isPlaceholder)).toBe(true);
    expect(['Outside of NYC', 'Manhattan', 0, null].some(isPlaceholder)).toBe(false);
  });
});

describe('a day’s news from its history', () => {
  it('says an ordinary day is one, with its trips against their range', () => {
    const news = newsOf(new HistoryRanges(historyWith()), '2023-10-11', vendorNames);
    expect(news[0]!.kind).toBe('calm');
    expect(news.filter((f) => f.severity === 'alert' || f.severity === 'warn')).toEqual([]);
    expect(news[0]!.detail).toMatch(/^[\d,]+ trips, normal for a day like it \([\d,]+ to [\d,]+\)\.$/);
  });

  it('calls a day all but blank something wrong, in a title that carries the number', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { blank: true } })), '2023-10-11', vendorNames);
    expect(news[0]).toMatchObject({ kind: 'volume', severity: 'alert', acts: ['incident', 'notify', 'expected'] });
    expect(news[0]!.title).toMatch(/^Almost no trips: [\d,]+$/);
    expect(news[0]!.detail).toMatch(/^A day like it has [\d,]+ to [\d,]+\.$/);
  });

  it('finds the hour the trips fall, and keeps the hours for their bars', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { stopAt: 13, vendorShare: 0.5 } })), '2023-10-11', vendorNames);
    const hours = news.find((f) => f.kind === 'hours')!;
    expect(hours.severity).toBe('alert');
    // Pickup times, not arrival times: the trips fall to a trickle, they don't end; the fall is said from its hour on.
    expect(hours.title).toMatch(/^Trips fall 9\d% from 13:00$/);
    expect(hours.hours).toMatchObject({ from: 13, to: 23 });
    expect(hours.hours!.got).toHaveLength(24);
    expect(hours.hours!.usual[14]).toBeGreaterThan(20 * hours.hours!.got[14]!);
    // What follows from it is the story's to tell (story.test.ts): newsOf no longer folds.
    expect(news.find((f) => f.key === 'share:VendorID=1')?.because).toBeUndefined();
  });

  it('says a value usually there is gone, by name, with its usual share', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } })), '2023-10-11', vendorNames);
    expect(news.find((f) => f.kind === 'volume')!.severity).toBe('alert');
    expect(news.find((f) => f.kind === 'gone')).toMatchObject({ title: 'Vendor 1: none', severity: 'alert' });
    expect(news.find((f) => f.kind === 'gone')!.detail).toMatch(/^Usually on \d+–\d+% of trips; none today\.$/);
  });

  it('counts a share’s trips against its usual share of the same trips, never “fewer than a day like it”', () => {
    // Vendor 1 gone on a day with 30% fewer trips: its detail counts today's trips and its usual share of them.
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { vendorShare: 0.15 } })), '2023-10-11', vendorNames);
    const share = news.find((f) => f.key === 'share:VendorID=1')!;
    expect(share.detail).toMatch(/^[\d,]+ of today’s trips with it; about [\d,]+ at its usual share\.$/);
    const [today, usual] = [...share.detail.replace(/,/g, '').matchAll(/\d+/g)].map((m) => Number(m[0]));
    expect(today).toBeLessThan(usual!);
    expect(today! / (today! / 0.15)).toBeCloseTo(0.15, 2);
    for (const f of news) expect(f.detail).not.toMatch(/than a day like it\.$/);
  });

  it('tells findings that are one set of trips by the value that names them, with its own numbers', () => {
    // Vendor 2 down and vendor 1 up by the same trips: told once, by the member most out of the ordinary.
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { vendorShare: 0.15 } })), '2023-10-11', vendorNames);
    const together = news.find((f) => f.key.startsWith('together:'));
    if (together) {
      expect(together.title).not.toMatch(/move together|trips (fewer|more)/);
      expect(together.title).toMatch(/^vendor \d: [\d.]+% \(usually [\d.–]+%\)$/i);
      expect(together.detail).toMatch(/moved with it: the same trips, likely\.$/);
      expect(together.members![0]!.share).toBe(together.value);
    }
  });

  it('tells a value never seen before, after the history’s first weeks', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { newValue: true } })), '2023-10-11', vendorNames);
    expect(news.find((f) => f.kind === 'new')).toMatchObject({ severity: 'warn', title: 'New vendor: 6 · 500 trips', rows: 500, acts: ['expected', 'quarantine', 'rule', 'notify'] });
  });

  it('keeps titles short: the number in them, and no paragraph after', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-11': { stopAt: 13, vendorShare: 0.5 }, '2023-10-12': { vendorGone: true }, '2023-10-13': { newValue: true } }));
    for (const day of ['2023-10-11', '2023-10-12', '2023-10-13']) {
      for (const f of newsOf(h, day, vendorNames)) {
        expect(f.title.split(/\s+/).length, f.title).toBeLessThanOrEqual(8);
        expect(f.detail.split(/\s+/).length, f.detail).toBeLessThanOrEqual(20);
        expect(f.title + f.detail).not.toMatch(/The band|because|caused by|feed stopped|disappeared/);
      }
    }
  });

  it('says a share outside its range with the decimals that keep it off the edge', () => {
    expect(shareWords(0.002, 0.75, 0.8)).toEqual({ value: '0.2%', range: '75–80%' });
    expect(shareWords(0.0001, 0.115, 0.134)).toEqual({ value: '0.01%', range: '12–13%' });
    // Today just past the edge: never printed as the edge itself.
    const w = shareWords(0.8012, 0.75, 0.8);
    expect(w.value).not.toBe('80%');
    expect(shareWords(0, 0.006, 0.006).range).toBe('0.6%');
  });

  it('tells a change once it has lasted as a note, from the day it began', () => {
    const trouble: Record<string, Trouble> = {};
    for (let d = '2023-10-02'; d <= '2023-10-20'; d = plusDays(d, 1)) trouble[d] = { vendorShare: 0.15 };
    const h = new HistoryRanges(historyWith(trouble));
    const first = newsOf(h, '2023-10-02', vendorNames).find((f) => f.key === 'share:VendorID=1')!;
    expect(first.severity).toBe('alert');
    expect(first.lasting).toBeUndefined();
    const later = newsOf(h, '2023-10-12', vendorNames).find((f) => f.key === 'share:VendorID=1')!;
    expect(later.severity).toBe('note');
    expect(later.lasting).toBe('2023-10-02');
    // Its first day is for the chart to show, not the title to say (ADR 0008).
    expect(later.title).toBe('Vendor 1: 15% (usually 27–32%)');
  });

  it('tells a rise in trips that has lasted most of a week as a note, each day judged against its own range', () => {
    // Two weeks 12% above what the weeks before had (the weeks after Labor Day 2022, with no last year to go by).
    const trouble: Record<string, Trouble> = {};
    for (let d = '2023-10-02'; d <= '2023-10-15'; d = plusDays(d, 1)) trouble[d] = { more: 1.12 };
    const h = new HistoryRanges(historyWith(trouble));
    const first = newsOf(h, '2023-10-02', vendorNames).find((f) => f.kind === 'volume')!;
    expect(first).toMatchObject({ severity: 'warn' });
    expect(first.title).toMatch(/^More trips: [\d,]+ \(\+1\d%\)$/);
    const later = newsOf(h, '2023-10-08', vendorNames).find((f) => f.kind === 'volume')!;
    expect(later).toMatchObject({ severity: 'note', lasting: '2023-10-02' });
    // Something wrong is never quieted for having lasted.
    const blank = newsOf(new HistoryRanges(historyWith({ ...trouble, '2023-10-08': { blank: true } })), '2023-10-08', vendorNames).find((f) => f.kind === 'volume')!;
    expect(blank.severity).toBe('alert');
  });

  it('gives the weather as context: snow is worth knowing, a dry day is normal', () => {
    const h = new HistoryRanges(historyWith({ '2023-12-12': { snow: 6 } }));
    expect(newsOf(h, '2023-12-12', vendorNames).find((f) => f.kind === 'weather')).toMatchObject({ severity: 'note', title: 'Snow: 6.0 cm in Manhattan' });
    expect(newsOf(h, '2023-12-13', vendorNames).find((f) => f.kind === 'weather')).toMatchObject({ severity: 'ok', title: 'A dry day in Manhattan' });
  });

  it('has nothing to say of a day outside the history', () => {
    expect(newsOf(new HistoryRanges(historyWith()), '2025-01-01', vendorNames)).toEqual([]);
  });
});

/** How a general-form watch judges the made-up history: the legacy settings but the general form's own, and its marks. */
const general = (over: Partial<JudgeSettings> = {}): JudgeSettings => ({ ...LEGACY_JUDGE, legacy: false, scale: 'fixed', ...over });
/** The made-up history with value 6 at about a fifth of a percent of every day's trips, and `share` on `day`. */
function rare(day: string, share: number) {
  const file = historyWith();
  const vh = file.values.VendorID!;
  vh.first[2] = 0;
  vh.last[2] = file.days.length - 1;
  vh.counts = vh.counts!.map((c, k) => [c[0]!, c[1]!, Math.round(file.rows[k]! * (file.days[k] === day ? share : 0.002 * (1 + 0.04 * Math.sin(k * 1.7))))]);
  return new HistoryRanges(file);
}

describe('a day’s news on any dataset (ADR 0010 §1, §4, §8)', () => {
  const FIRST_THANKSGIVING = '2021-11-25';

  it('says a day with nothing to compare against is not judged, never normal, and why', () => {
    const h = new HistoryRanges(historyWith());
    const news = newsOf(h, FIRST_THANKSGIVING, names);
    expect(news[0]).toMatchObject({ kind: 'unlearned', severity: 'ok', title: 'Not judged yet', why: { why: 'no last year', special: 'Thanksgiving' } });
    expect(news[0]!.detail).toMatch(/^[\d,]+ trips; the history has no Thanksgiving before this one to judge it by\.$/);
    expect(news.some((f) => f.kind === 'calm')).toBe(false);
    // A year on it is judged, and normal.
    expect(newsOf(h, '2022-11-24', names)[0]).toMatchObject({ kind: 'calm', title: 'Nothing out of the ordinary' });
    expect(newsOf(h, '2021-10-05', names)[0]).toMatchObject({ kind: 'unlearned', why: { why: 'too few days', days: 4 } });
  });

  it('catches a first-year holiday cut to a few percent by the floor that needs no range, which pauses (Q-53)', () => {
    const h = new HistoryRanges(historyWith({ [FIRST_THANKSGIVING]: { blank: true } }));
    const f = newsOf(h, FIRST_THANKSGIVING, names)[0]!;
    expect(f).toMatchObject({ key: 'volume', kind: 'volume', severity: 'alert' });
    expect(f.title).toMatch(/^Almost no trips: [\d,]+$/);
    expect(f.detail).toMatch(/^Under a tenth of the last 7 days’ median, [\d,]+; not judged against a day like it\.$/);
    expect(f.range).toBeUndefined();
  });

  it('says counts with the source’s noun, and rows without one', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-04': { blank: true } }));
    const signIns = { ...names, noun: (n?: number) => (n === 1 ? 'sign-in' : 'sign-ins') };
    expect(newsOf(h, '2023-10-04', signIns)[0]!.title).toMatch(/^Almost no sign-ins: /);
    expect(newsOf(h, '2023-10-04', { column: names.column, value: names.value })[0]!.title).toMatch(/^Almost no rows: /);
    const fall = new HistoryRanges(historyWith({ '2023-10-04': { stopAt: 13 } }));
    expect(newsOf(fall, '2023-10-04', signIns).find((x) => x.kind === 'hours')!.title).toBe('Sign-ins fall 98% from 13:00');
  });

  it('calls a bad value that surged something wrong, with no marking as expected; one that fell, good news', () => {
    const judge = general({ bad: new Map([['vendorid', new Set(['1'])]]) });
    const up = new HistoryRanges(historyWith({ '2023-10-04': { vendorSurge: 2.5 } }));
    const f = newsOf(up, '2023-10-04', names, { judge }).find((x) => x.key === 'share:VendorID=1')!;
    expect(f).toMatchObject({ severity: 'alert', bad: true, acts: ['incident', 'notify'] });
    expect(f.detail).toMatch(/× its usual [\d,]+: a value marked bad\.$/);
    // Unmarked, the same surge is a share that moved, which may be marked as expected.
    expect(newsOf(up, '2023-10-04', names).find((x) => x.key === 'share:VendorID=1')!.acts).toContain('expected');
    const down = new HistoryRanges(historyWith({ '2023-10-04': { vendorShare: 0.1 } }));
    expect(newsOf(down, '2023-10-04', names, { judge }).find((x) => x.key === 'share:VendorID=1')).toMatchObject({ severity: 'note', bad: true, acts: ['notify'] });
  });

  it('marks a bad value something wrong however few points it moved: 0.2% to 0.65%, 3.3×', () => {
    const h = rare('2023-10-04', 0.0065);
    const judge = general({ bad: new Map([['vendorid', new Set(['6'])]]) });
    expect(newsOf(h, '2023-10-04', names, { judge }).find((x) => x.key === 'share:VendorID=6')).toMatchObject({ severity: 'alert', bad: true });
    // Unmarked, the legacy form's point gates leave it out (under half a point); the general form's relative rule tells it.
    expect(newsOf(h, '2023-10-04', names).find((x) => x.key === 'share:VendorID=6')).toBeUndefined();
    expect(newsOf(h, '2023-10-04', names, { judge: general() }).find((x) => x.key === 'share:VendorID=6')).toMatchObject({ severity: 'warn' });
    // Under three times its usual share, the relative rule says nothing.
    expect(newsOf(rare('2023-10-04', 0.005), '2023-10-04', names, { judge: general() }).find((x) => x.key === 'share:VendorID=6')).toBeUndefined();
  });

  it('alerts on a value never seen before in a serious column (Q-56)', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-04': { newValue: true } }));
    expect(newsOf(h, '2023-10-04', names).find((x) => x.kind === 'new')!.severity).toBe('warn');
    const f = newsOf(h, '2023-10-04', names, { judge: general({ serious: new Set(['vendorid']) }) }).find((x) => x.kind === 'new')!;
    expect(f).toMatchObject({ severity: 'alert', acts: ['incident', 'quarantine', 'notify', 'expected'] });
  });

  it('scales its floors with the day’s expected rows in the general form, and keeps them fixed in the legacy one', () => {
    expect(materialFor(2_000, 'fixed')).toBe(MATERIAL);
    expect(materialFor(100_000, 'volume')).toEqual(MATERIAL);
    const quiet = materialFor(2_000, 'volume');
    expect([quiet.hourRows, quiet.rows, quiet.newRows, quiet.newUnusual, quiet.split].map((x) => Math.round(x * 100) / 100)).toEqual([28.28, 7.07, 1.41, 14.14, 28.28]);
    const busy = materialFor(100_000_000, 'volume');
    expect([busy.hourRows, busy.rows, busy.share]).toEqual([2_000, 500, MATERIAL.share]);
    expect(materialFor(10, 'volume').hourRows).toBe(10);
  });

  it('says the weather’s place as the history names it; the legacy form’s is Manhattan', () => {
    const file = historyWith();
    expect(newsOf(new HistoryRanges(file), '2023-10-04', names).find((x) => x.kind === 'weather')!.title).toBe('A dry day in Manhattan');
    expect(newsOf(new HistoryRanges(file), '2023-10-04', names, { judge: general() }).find((x) => x.kind === 'weather')!.title).toBe('A dry day');
    const placed = { ...file, weather: { ...file.weather!, place: 'Leeds' } };
    expect(newsOf(new HistoryRanges(placed), '2023-10-04', names, { judge: general() }).find((x) => x.kind === 'weather')!.title).toBe('A dry day in Leeds');
  });

  it('counts what it could judge on a day', () => {
    const h = new HistoryRanges(historyWith());
    expect(coverageOf(h, '2023-10-04')).toEqual({ rows: true, values: [2, 2], quantiles: [0, 0], checks: true, why: null });
    expect(coverageOf(h, FIRST_THANKSGIVING)).toMatchObject({ rows: false, why: { why: 'no last year', special: 'Thanksgiving' } });
    expect(coverageOf(h, '2023-10-04', { checks: false }).checks).toBe(false);
    // Under a calendar with no days, the first Thanksgiving is an ordinary Thursday, judged.
    expect(coverageOf(new HistoryRanges(historyWith(), { calendar: NONE }), FIRST_THANKSGIVING).rows).toBe(true);
  });

  it('says why a day is not judged in four words at most', () => {
    expect(notJudgedChip({ why: 'no last year', days: 55, special: 'Thanksgiving' })).toBe('First Thanksgiving here');
    expect(notJudgedChip({ why: 'no last year', days: 55, special: 'Martin Luther King Jr. Day' })).toBe('First MLK Day here');
    expect(notJudgedChip({ why: 'no last year', days: 55, special: 'Holiday season' })).toBe('First holiday season here');
    expect(notJudgedChip({ why: 'no last year', days: 55, special: 'Memorial Day weekend' })).toBe('First Memorial Day weekend');
    expect(notJudgedChip({ why: 'last year moved', days: 400, special: 'Thanksgiving' })).toBe('Changed since last year');
    expect(notJudgedChip({ why: 'too few days', days: 9 })).toBe('9 days of history');
    expect(notJudgedChip({ why: 'too few days', days: 1 })).toBe('1 day of history');
    expect(notJudgedChip({ why: 'history ends', days: 800 }, undefined, '2024-01-31')).toBe('History ends Jan 31');
  });

  it('reads how a document judges a source: the legacy form for a file name, the general form’s settings and marks', () => {
    const base = { ontology: { objectTypes: [], linkTypes: [], actionTypes: [], nouns: { auth: { one: 'sign-in', many: 'sign-ins' } }, properties: [{ column: 'result', title: 'Result', description: 'How', values: { ok: 'Signed in', fail: 'Failed' }, bad: ['fail'] }, { column: 'country', title: 'Country', description: 'Where', newValues: 'alert' as const }, { column: 'VendorID', title: 'Vendor', description: 'Who', name: 'Vendor {code}', role: 'sender' as const }] } };
    const legacy = judgeOf({ ...base, publish: { hold: ['wrong'], watch: { auth: 'h.json' }, period: 'day' } }, 'auth');
    expect(legacy).toMatchObject({ legacy: true, scale: 'fixed', calendar: { base: 'us-nyc/1' } });
    expect([...legacy.bad]).toEqual([['result', new Set(['fail'])]]);
    expect([...legacy.serious].sort()).toEqual(['country', 'result']);
    const g = judgeOf({ ...base, publish: { hold: ['wrong'], watch: { auth: { history: 'h.json' } }, period: 'day' } }, 'auth');
    expect(g).toMatchObject({ legacy: false, scale: 'volume', calendar: { base: 'none' } });
    expect(judgeOf({ ...base, calendar: { base: 'us' }, publish: { hold: ['wrong'], watch: { auth: { history: 'h.json', calendar: false, scale: 'fixed' } }, period: 'day' } }, 'auth')).toMatchObject({ calendar: NONE, scale: 'fixed' });
    const n = flowNames({ ...base, steps: [] } as unknown as FlowDocument, 'auth');
    expect([n.noun!(1), n.noun!(2), n.noun!(), n.column('result'), n.part!('VendorID'), n.part!('result')]).toEqual(['sign-in', 'sign-ins', 'sign-ins', 'result', { name: 'Vendor {code}', role: 'sender' }, undefined]);
  });
});

describe('a file’s columns, month to month', () => {
  it('says what was renamed, retyped, added and gone', () => {
    expect(schemaChanges(
      [['VendorID', 'int64'], ['airport_fee', 'double'], ['ehail_fee', 'double']],
      [['VendorID', 'int32'], ['Airport_fee', 'double'], ['cbd_congestion_fee', 'double']],
    )).toEqual(['VendorID is now int32, not int64', 'airport_fee is now Airport_fee', 'cbd_congestion_fee is new (double)', 'ehail_fee is gone']);
  });
});
