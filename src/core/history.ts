/**
 * A daily load's history: each day's numbers as scripts/data/history.ts measures them (history.json in the data
 * branch), and the series a day's normal range is drawn from (normal.ts). The numbers count the checks named here, as
 * they were published: a range for what the checks drop holds only while the checks are the same. No DOM, no engine.
 */
import { plusDays, daysBetween } from './calendar.js';
import { NormalRanges, type DailySeries, type Scale } from './normal.js';
import type { Kind } from './quality.js';

/** A day that couldn't be measured: left out of the history, with why. */
export interface DayError {
  day: string;
  error: string;
}

export const HISTORY_FORMAT = 'smaltfl-history/2';

/**
 * A column's values (or a pair of columns' values) over the history: each value as JSON (a pair's as a JSON array),
 * in order of rows; the day each was first and last seen (as places in `days`), the days it was seen and its rows in
 * all; and the days that brought a value never seen before, with the rows they had of it, once the first `warmup`
 * days are past (at first, every value is new).
 */
export interface ValueHistory {
  values: string[];
  first: number[];
  last: number[];
  days: number[];
  rows: number[];
  fresh: [day: number, rows: number][];
  /** Each day's rows with each value, for a column of a handful of values. */
  counts?: number[][];
}

/** The history's file: the checks and columns measured, then a row of numbers a day, in order. */
export interface HistoryFile {
  format: typeof HISTORY_FORMAT;
  built: string;
  flow: string;
  /** The checks step whose counts these are, and its rules as published. */
  step: string;
  rules: { name: string; check: string; onFail: string }[];
  columns: string[];
  types: string[];
  /** Each column's kind on most days. */
  kinds: Kind[];
  /** The sample a median comes from, as the app's profile box takes it. */
  sample: number;
  days: string[];
  rows: number[];
  /** Rows the drop rules leave out, and each rule's failures. */
  dropped: number[];
  failed: number[][];
  /** Each column's rows with a value, and its median in the sample (a number's, or a time's minute of the day). */
  present: number[][];
  p50: (number | null)[][];
  /** Days that couldn't be measured, and why: gaps in `days`. */
  missing: DayError[];
  /** Each day's quantiles of each measure or time (p01, p10, p25, p50, p75, p90, p99; a time's in minutes of the day). */
  quantiles: (number[] | null)[][];
  /** Each day's trips by pickup hour. */
  hours: number[][];
  /** Days at the start before a value counts as never seen. */
  warmup: number;
  /** The coded and zone columns' values, and the coded columns' pairs (`a|b`). */
  values: Record<string, ValueHistory>;
  pairs: Record<string, ValueHistory>;
  /** The trips file's own columns, month by month, before they were cast to the month's (scripts/data/build.py). */
  schemas?: { month: string; columns: [string, string][] }[];
  /** Each day's weather in the city (scripts/data/build.py): hours on record per borough, rain and snow, the temperatures. */
  weather?: { boroughs: string[]; hours: number[][]; precip: (number | null)[]; snow: (number | null)[]; tmin: (number | null)[]; tmax: (number | null)[] };
}

/** A number the history keeps a day of. */
export type Metric =
  | { of: 'trips' }
  | { of: 'dropped' }
  | { of: 'rule'; name: string }
  | { of: 'missing'; column: string }
  | { of: 'median'; column: string }
  /** The share of the day's rows with a coded column's value (the value as JSON). */
  | { of: 'value'; column: string; value: string }
  /** A measure's or a time's quantile: its place in QUANTILES. */
  | { of: 'quantile'; column: string; q: number };

/** The quantiles the history keeps of a measure or a time, in order. */
export const QUANTILES = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];

export const metricKey = (m: Metric) =>
  m.of === 'trips' || m.of === 'dropped' ? m.of
  : m.of === 'rule' ? `rule:${m.name}`
  : m.of === 'value' ? `value:${m.column}=${m.value}`
  : m.of === 'quantile' ? `quantile:${m.column}@${m.q}`
  : `${m.of}:${m.column}`;

const SCALES: Record<Metric['of'], Scale> = { trips: 'count', dropped: 'share', rule: 'share', missing: 'share', median: 'level', value: 'share', quantile: 'level' };

/** A metric's days, from the history's first to its last, null where a day wasn't measured; none for a name it lacks. */
export function seriesOf(h: HistoryFile, m: Metric): DailySeries | null {
  const from = h.days[0];
  if (!from) return null;
  const rule = m.of === 'rule' ? h.rules.findIndex((r) => r.name === m.name) : -1;
  const column = m.of === 'missing' || m.of === 'median' || m.of === 'quantile' ? h.columns.indexOf(m.column) : -1;
  if ((m.of === 'rule' && rule < 0) || ((m.of === 'missing' || m.of === 'median' || m.of === 'quantile') && column < 0)) return null;
  const counted = m.of === 'value' ? h.values?.[m.column] : undefined;
  const place = counted && m.of === 'value' ? counted.values.indexOf(m.value) : -1;
  if (m.of === 'value' && (!counted?.counts || place < 0)) return null;
  const values = new Array<number | null>(daysBetween(from, h.days.at(-1)!) + 1).fill(null);
  h.days.forEach((day, k) => {
    const rows = h.rows[k]!;
    const v =
      m.of === 'trips' ? rows
      : m.of === 'dropped' ? (rows ? h.dropped[k]! / rows : null)
      : m.of === 'rule' ? (rows ? h.failed[k]![rule]! / rows : null)
      : m.of === 'missing' ? (rows ? 1 - h.present[k]![column]! / rows : null)
      : m.of === 'value' ? (rows ? counted!.counts![k]![place]! / rows : null)
      : m.of === 'quantile' ? (h.quantiles?.[k]?.[column]?.[m.q] ?? null)
      : h.p50[k]![column]!;
    values[daysBetween(from, day)] = v;
  });
  return { from, values };
}

/** Each metric's normal ranges over a history, made once a metric. */
export class HistoryRanges {
  readonly file: HistoryFile;
  private readonly made = new Map<string, NormalRanges | null>();
  private readonly skip: ReadonlySet<string>;

  /** With `skip`, days left out of what a normal day is learned from (an incident's). */
  constructor(file: HistoryFile, options: { skip?: ReadonlySet<string> } = {}) {
    this.file = file;
    this.skip = options.skip ?? new Set();
  }

  of(m: Metric): NormalRanges | null {
    const key = metricKey(m);
    if (!this.made.has(key)) {
      const s = seriesOf(this.file, m);
      this.made.set(key, s ? new NormalRanges(s, SCALES[m.of], { skip: this.skip }) : null);
    }
    return this.made.get(key)!;
  }

  /** How many different medians a column had over the history: a few, for one whose values are a few amounts. */
  medians(column: string): number {
    const k = this.file.columns.indexOf(column);
    return k < 0 ? 0 : new Set(this.file.p50.map((row) => row[k]).filter((x) => x !== null)).size;
  }

  /** The history's span. */
  get from(): string {
    return this.file.days[0]!;
  }

  get to(): string {
    return this.file.days.at(-1)!;
  }

  /** Whether the checks a flow has now are the ones the history counted: their names, checks and what each does. */
  sameChecks(rules: readonly { name: string; check: string; onFail: string }[]): boolean {
    const a = this.file.rules;
    return a.length === rules.length && a.every((r, k) => r.name === rules[k]!.name && r.check === rules[k]!.check && r.onFail === rules[k]!.onFail);
  }
}

/** The days from one to another, both included. */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}
