/**
 * Two years and a quarter of made-up daily history whose pattern is known, for the news and the story: weekends busy,
 * holidays light, two vendors (70% and 30% of the trips), the trips spread over the day as a city's are, a few percent
 * dropped; and on chosen days, trouble.
 */
import { holidayOf, plusDays, seasonOf } from '../../src/core/calendar.js';
import type { HistoryFile, ValueHistory } from '../../src/core/history.js';
import { random } from '../../src/core/quality.js';

export const DAYS: string[] = [];
for (let d = '2021-10-01'; d <= '2024-01-31'; d = plusDays(d, 1)) DAYS.push(d);
const WEEKDAY = [0.9, 0.85, 0.95, 1, 1.05, 1.08, 1.1];
const HOUR = Array.from({ length: 24 }, (_, h) => 0.3 + Math.max(0, Math.sin(((h - 5) / 19) * Math.PI)));
const HOURS = HOUR.reduce((a, b) => a + b, 0);
const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

export interface Trouble {
  blank?: boolean;
  stopAt?: number;
  /** With `stopAt`: the share of each hour's trips that still come from then (else 2%). */
  keep?: number;
  vendorGone?: boolean;
  vendorShare?: number;
  newValue?: boolean;
  snow?: number;
  /** Vendor 1's trips arrive as usual and almost none of vendor 2's (Fri Sep 22, 2023's Flex Fare). */
  onlyVendor1?: boolean;
  /** Vendor 1's trips this many times their usual, vendor 2's as usual. */
  vendorSurge?: number;
  /** The share of the day's rows the checks drop (else 4%). */
  dropShare?: number;
  /** The day's trips this many times what they would be (a season's rise). */
  more?: number;
}
export function historyWith(trouble: Record<string, Trouble> = {}): HistoryFile {
  const rnd = random(11);
  const rows: number[] = [];
  const hours: number[][] = [];
  const counts: number[][] = [];
  const dropShares: number[] = [];
  for (const day of DAYS) {
    const t = trouble[day] ?? {};
    const wd = WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
    let n = Math.round(100_000 * wd * (holidayOf(day) ? 0.7 : seasonOf(day) ? 0.8 : 1) * Math.exp(0.03 * gauss(rnd)) * (t.more ?? 1));
    let byHour = HOUR.map((x) => Math.round((n * x) / HOURS));
    if (t.blank) byHour = byHour.map((x) => Math.round(x * 0.03));
    if (t.stopAt !== undefined) byHour = byHour.map((x, h) => (h >= t.stopAt! ? Math.round(x * (t.keep ?? 0.02)) : x));
    const share1 = t.vendorShare ?? 0.3 + 0.005 * gauss(rnd);
    let v1 = Math.round((t.blank || t.stopAt !== undefined ? byHour.reduce((a, b) => a + b, 0) : n) * share1);
    let v2 = (t.blank || t.stopAt !== undefined ? byHour.reduce((a, b) => a + b, 0) : n) - v1;
    if (t.vendorGone) (v1 = 0, (byHour = byHour.map((x) => Math.round(x * 0.7))), (v2 = byHour.reduce((a, b) => a + b, 0)));
    if (t.onlyVendor1 || t.vendorSurge) {
      const usual1 = Math.round(n * share1);
      v1 = t.onlyVendor1 ? usual1 : Math.round(usual1 * t.vendorSurge!);
      v2 = t.onlyVendor1 ? Math.round((n - usual1) * 0.0005) : n - usual1;
      const scale = (v1 + v2) / n;
      byHour = byHour.map((x) => Math.round(x * scale));
    }
    n = v1 + v2;
    dropShares.push(t.dropShare ?? 0.04);
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
    days: DAYS, rows, dropped: rows.map((n, k) => Math.round(n * dropShares[k]!)), failed: rows.map((n, k) => [Math.round(n * dropShares[k]!)]), present: rows.map((n) => [n]), p50: rows.map(() => [2]),
    missing: [], quantiles: rows.map(() => [null]), hours, warmup: 28, values: { VendorID: vendors }, pairs: {},
    weather: { boroughs: ['Manhattan'], hours: DAYS.map(() => [24]), precip: snow.map((x) => x * 1.2), snow, tmin: DAYS.map(() => -2), tmax: DAYS.map(() => 4) },
  };
}
/** The made-up history's names: the taxi's noun (ADR 0010 §8), and its vendor column said short. */
export const tripNoun = (n?: number) => (n === 1 ? 'trip' : 'trips');
export const vendorNames = { column: (c: string) => (c === 'VendorID' ? 'vendor' : c), value: (_c: string, v: unknown) => String(v), noun: tripNoun };

