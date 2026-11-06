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

/** The history's file: the checks and columns measured, then a row of numbers a day, in order. */
export interface HistoryFile {
  format: 'smaltfl-history/1';
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
}

/** A number the history keeps a day of. */
export type Metric =
  | { of: 'trips' }
  | { of: 'dropped' }
  | { of: 'rule'; name: string }
  | { of: 'missing'; column: string }
  | { of: 'median'; column: string };

export const metricKey = (m: Metric) => (m.of === 'trips' || m.of === 'dropped' ? m.of : m.of === 'rule' ? `rule:${m.name}` : `${m.of}:${m.column}`);

const SCALES: Record<Metric['of'], Scale> = { trips: 'count', dropped: 'share', rule: 'share', missing: 'share', median: 'level' };

/** A metric's days, from the history's first to its last, null where a day wasn't measured; none for a name it lacks. */
export function seriesOf(h: HistoryFile, m: Metric): DailySeries | null {
  const from = h.days[0];
  if (!from) return null;
  const rule = m.of === 'rule' ? h.rules.findIndex((r) => r.name === m.name) : -1;
  const column = m.of === 'missing' || m.of === 'median' ? h.columns.indexOf(m.column) : -1;
  if ((m.of === 'rule' && rule < 0) || ((m.of === 'missing' || m.of === 'median') && column < 0)) return null;
  const values = new Array<number | null>(daysBetween(from, h.days.at(-1)!) + 1).fill(null);
  h.days.forEach((day, k) => {
    const rows = h.rows[k]!;
    const v =
      m.of === 'trips' ? rows
      : m.of === 'dropped' ? (rows ? h.dropped[k]! / rows : null)
      : m.of === 'rule' ? (rows ? h.failed[k]![rule]! / rows : null)
      : m.of === 'missing' ? (rows ? 1 - h.present[k]![column]! / rows : null)
      : h.p50[k]![column]!;
    values[daysBetween(from, day)] = v;
  });
  return { from, values };
}

/** Each metric's normal ranges over a history, made once a metric. */
export class HistoryRanges {
  readonly file: HistoryFile;
  private readonly made = new Map<string, NormalRanges | null>();

  constructor(file: HistoryFile) {
    this.file = file;
  }

  of(m: Metric): NormalRanges | null {
    const key = metricKey(m);
    if (!this.made.has(key)) {
      const s = seriesOf(this.file, m);
      this.made.set(key, s ? new NormalRanges(s, SCALES[m.of]) : null);
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
