/**
 * The news: a day's findings from its history (newsOf), and a table's from its own rows (tableNewsOf). Each finding
 * says what, with its evidence, where to look, and what can be done; a day or a table with nothing to tell says so.
 */
import { describe, expect, it } from 'vitest';
import { holidayOf, plusDays, seasonOf } from '../src/core/calendar.js';
import { HistoryRanges, type HistoryFile, type ValueHistory } from '../src/core/history.js';
import { isPlaceholder, newsOf, schemaChanges, tableNewsOf, type TableFacts } from '../src/core/news.js';
import { random } from '../src/core/quality.js';

const names = { column: (c: string) => c, value: (_c: string, v: unknown) => String(v) };

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

// Two years and a quarter of made-up days whose pattern is known: weekends busy, holidays light, two vendors (70% and
// 30% of the trips), the trips spread over the day as a city's are, a few percent dropped; and on chosen days, trouble.
const DAYS: string[] = [];
for (let d = '2021-10-01'; d <= '2024-01-31'; d = plusDays(d, 1)) DAYS.push(d);
const WEEKDAY = [0.9, 0.85, 0.95, 1, 1.05, 1.08, 1.1];
const HOUR = Array.from({ length: 24 }, (_, h) => 0.3 + Math.max(0, Math.sin(((h - 5) / 19) * Math.PI)));
const HOURS = HOUR.reduce((a, b) => a + b, 0);
const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

interface Trouble { blank?: boolean; stopAt?: number; vendorGone?: boolean; vendorShare?: number; newValue?: boolean; snow?: number }
function historyWith(trouble: Record<string, Trouble> = {}): HistoryFile {
  const rnd = random(11);
  const rows: number[] = [];
  const hours: number[][] = [];
  const counts: number[][] = [];
  for (const day of DAYS) {
    const t = trouble[day] ?? {};
    const wd = WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
    let n = Math.round(100_000 * wd * (holidayOf(day) ? 0.7 : seasonOf(day) ? 0.8 : 1) * Math.exp(0.03 * gauss(rnd)));
    let byHour = HOUR.map((x) => Math.round((n * x) / HOURS));
    if (t.blank) byHour = byHour.map((x) => Math.round(x * 0.03));
    if (t.stopAt !== undefined) byHour = byHour.map((x, h) => (h >= t.stopAt! ? Math.round(x * 0.02) : x));
    const share1 = t.vendorShare ?? 0.3 + 0.005 * gauss(rnd);
    let v1 = Math.round((t.blank || t.stopAt !== undefined ? byHour.reduce((a, b) => a + b, 0) : n) * share1);
    let v2 = (t.blank || t.stopAt !== undefined ? byHour.reduce((a, b) => a + b, 0) : n) - v1;
    if (t.vendorGone) (v1 = 0, (byHour = byHour.map((x) => Math.round(x * 0.7))), (v2 = byHour.reduce((a, b) => a + b, 0)));
    n = v1 + v2;
    rows.push(n);
    hours.push(byHour);
    counts.push([v2, v1, t.newValue ? 500 : 0]);
  }
  const k = (d: string) => DAYS.indexOf(d);
  const newDay = Object.entries(trouble).find(([, t]) => t.newValue)?.[0];
  const vendors: ValueHistory = {
    values: ['2', '1', '6'], first: [0, 0, newDay ? k(newDay) : DAYS.length], last: [DAYS.length - 1, DAYS.length - 1, newDay ? k(newDay) : -1],
    days: [DAYS.length, DAYS.length, newDay ? 1 : 0], rows: [0, 0, newDay ? 500 : 0], fresh: newDay ? [[k(newDay), 500]] : [], counts,
  };
  const snow = DAYS.map((d) => trouble[d]?.snow ?? 0);
  return {
    format: 'smaltfl-history/2', built: '2024-02-01T00:00:00Z', flow: 'f', step: 'trips_valid',
    rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }],
    columns: ['VendorID'], types: ['int'], kinds: ['code'], sample: 2000,
    days: DAYS, rows, dropped: rows.map((n) => Math.round(n * 0.04)), failed: rows.map((n) => [Math.round(n * 0.04)]), present: rows.map((n) => [n]), p50: rows.map(() => [2]),
    missing: [], quantiles: rows.map(() => [null]), hours, warmup: 28, values: { VendorID: vendors }, pairs: {},
    weather: { boroughs: ['Manhattan'], hours: DAYS.map(() => [24]), precip: snow.map((x) => x * 1.2), snow, tmin: DAYS.map(() => -2), tmax: DAYS.map(() => 4) },
  };
}
const vendorNames = { column: (c: string) => (c === 'VendorID' ? 'vendor' : c), value: (_c: string, v: unknown) => String(v) };

describe('a day’s news from its history', () => {
  it('says an ordinary day is one, with its trips against their range', () => {
    const news = newsOf(new HistoryRanges(historyWith()), '2023-10-11', vendorNames);
    expect(news[0]!.kind).toBe('calm');
    expect(news.filter((f) => f.severity === 'alert' || f.severity === 'warn')).toEqual([]);
    expect(news[0]!.detail).toMatch(/^[\d,]+ trips, a normal amount for a day like it \([\d,]+ to [\d,]+\); every value, column and check as a day like it has them\.$/);
  });

  it('calls a day all but blank a feed that stopped', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { blank: true } })), '2023-10-11', vendorNames);
    expect(news[0]).toMatchObject({ kind: 'volume', severity: 'alert', acts: ['incident', 'notify', 'expected'] });
    expect(news[0]!.title).toMatch(/^Almost no data: [\d,]+ trips$/);
  });

  it('finds the hour the trips stop, and tells what follows from it as such', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { stopAt: 13, vendorShare: 0.5 } })), '2023-10-11', vendorNames);
    const hours = news.find((f) => f.kind === 'hours')!;
    expect(hours.severity).toBe('alert');
    expect(hours.title).toBe('The trips stop at 13:00');
    // The vendors' mix is off too, but as a result of the morning alone: a note that says so, not news of its own.
    const mix = news.find((f) => f.key === 'share:VendorID=1')!;
    expect(mix).toMatchObject({ severity: 'note', because: 'hours' });
    expect(mix.detail).toMatch(/^Likely from the trips stopping or starting late \(the trips stop at 13:00\): the rows the day has are not a whole day's\./);
  });

  it('says where a shortfall is: the vendor whose trips are gone', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } })), '2023-10-11', vendorNames);
    const volume = news.find((f) => f.kind === 'volume')!;
    expect(volume.severity).toBe('alert');
    expect(volume.detail).toMatch(/Where it is: vendor 1, 0 trips where a day like it has about [\d,]+: nearly all of the change\.$/);
    expect(news.find((f) => f.kind === 'gone')).toMatchObject({ title: 'No trips with vendor 1', severity: 'alert' });
  });

  it('tells a value never seen before, after the history’s first weeks', () => {
    const news = newsOf(new HistoryRanges(historyWith({ '2023-10-11': { newValue: true } })), '2023-10-11', vendorNames);
    expect(news.find((f) => f.kind === 'new')).toMatchObject({ severity: 'warn', title: 'A vendor never seen before', rows: 500, acts: ['expected', 'quarantine', 'rule', 'notify'] });
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
    expect(later.title).toBe('Since Oct 2: vendor 1 on 15.0% of trips');
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

describe('a file’s columns, month to month', () => {
  it('says what was renamed, retyped, added and gone', () => {
    expect(schemaChanges(
      [['VendorID', 'int64'], ['airport_fee', 'double'], ['ehail_fee', 'double']],
      [['VendorID', 'int32'], ['Airport_fee', 'double'], ['cbd_congestion_fee', 'double']],
    )).toEqual(['VendorID is now int32, not int64', 'airport_fee is now Airport_fee', 'cbd_congestion_fee is new (double)', 'ehail_fee is gone']);
  });
});
