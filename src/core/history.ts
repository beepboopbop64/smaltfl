/**
 * A daily load's history: each day's numbers as scripts/data/history.ts measures them (history.json in the data
 * branch), and the series a day's normal range is drawn from (normal.ts). The numbers count the checks named here, as
 * they were published: a range for what the checks drop holds only while the checks are the same. No DOM, no engine.
 */
import { plusDays, daysBetween, US_NYC_1, type Calendar } from './calendar.js';
import { NormalRanges, type DailySeries, type Scale } from './normal.js';
import type { Kind } from './quality.js';
import { appendPeriods, type Measures } from './measures.js';

/**
 * The time column a history's parts are counted by: a /3 file names it; a /2 file was built for the taxi example alone,
 * which counted its trips by pickup hour.
 */
export function timeOf(file: Pick<HistoryFile, 'format' | 'columns' | 'time'>): string | null {
  if (file.time !== undefined) return file.time;
  return file.format === 'smaltfl-history/2' && file.columns.includes('tpep_pickup_datetime') ? 'tpep_pickup_datetime' : null;
}

/** A day that couldn't be measured: left out of the history, with why. */
export interface DayError {
  day: string;
  error: string;
}

/** The builder's format now (ADR 0010 §6): /2 with the source, its slot's length, its time and zone, the columns it
 * couldn't count, and the checks each period was counted with. */
export const HISTORY_FORMAT = 'smaltfl-history/3';
/** The formats this build reads: /2 is /3 with a day a period, counted with one set of checks. */
export const HISTORY_FORMATS: readonly string[] = ['smaltfl-history/2', HISTORY_FORMAT];
/** Whether a file is a history this build reads, with days in it. */
export const isHistory = (f: unknown): f is HistoryFile =>
  typeof f === 'object' && f !== null && HISTORY_FORMATS.includes((f as HistoryFile).format) && Array.isArray((f as HistoryFile).days);

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
  format: 'smaltfl-history/2' | 'smaltfl-history/3';
  built: string;
  flow: string;
  /** /3: the watched source, its slot's length, and the time column its parts are counted by, in its zone (null: as the
   * text writes it). A /2 file has a day a period, by its pickup time. */
  source?: string;
  every?: 'day';
  time?: string | null;
  zone?: string | null;
  /** /3: the columns it couldn't count, and why ("2.1M values"). */
  skipped?: [column: string, why: string][];
  /** The checks step whose counts these are, and its rules as published: the latest period's. */
  step: string;
  rules: { name: string; check: string; onFail: string }[];
  /** /3: where the checks changed, each set of rules with the first period counted with it, in order; none when every
   * period was counted with `rules`. */
  checks?: { from: number; step: string; rules: { name: string; check: string; onFail: string }[] }[];
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
  /** Each day's weather in the city (scripts/data/build.py): hours on record per borough, rain and snow, the temperatures;
   * and the place it is of, said in the news (ADR 0010 §8: "Manhattan" for the legacy form when a history doesn't say). */
  weather?: { place?: string; boroughs: string[]; hours: number[][]; precip: (number | null)[]; snow: (number | null)[]; tmin: (number | null)[]; tmax: (number | null)[] };
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
  | { of: 'quantile'; column: string; q: number }
  /** Counts, for the visuals that draw rows against their usual rows: the day's rows with a coded value, the rows the
   * checks drop, and the rows a rule fails. */
  | { of: 'count'; column: string; value: string }
  | { of: 'droppedRows' }
  | { of: 'ruleRows'; name: string };

/** The quantiles the history keeps of a measure or a time, in order. */
export const QUANTILES = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];

export const metricKey = (m: Metric) =>
  m.of === 'trips' || m.of === 'dropped' || m.of === 'droppedRows' ? m.of
  : m.of === 'rule' ? `rule:${m.name}`
  : m.of === 'ruleRows' ? `ruleRows:${m.name}`
  : m.of === 'value' ? `value:${m.column}=${m.value}`
  : m.of === 'count' ? `count:${m.column}=${m.value}`
  : m.of === 'quantile' ? `quantile:${m.column}@${m.q}`
  : `${m.of}:${m.column}`;

const SCALES: Record<Metric['of'], Scale> = { trips: 'count', dropped: 'share', rule: 'share', missing: 'share', median: 'level', value: 'share', quantile: 'level', count: 'count', droppedRows: 'count', ruleRows: 'count' };

/** Whether a metric counts the checks: its periods are comparable only while they were counted with the same rules. */
const ofChecks = (m: Metric) => m.of === 'dropped' || m.of === 'rule' || m.of === 'droppedRows' || m.of === 'ruleRows';

/**
 * The first period counted with the rules the file's latest period was counted with, every one after it too (ADR 0010
 * §6): 0 for a file counted with one set of rules throughout (every /2 file), else where its latest set took over.
 */
export function checksStart(h: Pick<HistoryFile, 'checks'>): number {
  const segs = h.checks ?? [];
  if (segs.length === 0) return 0;
  const same = (a: (typeof segs)[number], b: (typeof segs)[number]) => a.step === b.step && a.rules.length === b.rules.length && a.rules.every((r, k) => r.name === b.rules[k]!.name && r.check === b.rules[k]!.check && r.onFail === b.rules[k]!.onFail);
  let k = segs.length - 1;
  while (k > 0 && same(segs[k - 1]!, segs[k]!)) k--;
  return segs[k]!.from;
}

/**
 * A metric's days, from the history's first to its last, null where a day wasn't measured; none for a name it lacks.
 * The checks' numbers only from the first period counted with the latest rules (`checksStart`): before it they counted
 * other rules.
 */
export function seriesOf(h: HistoryFile, m: Metric): DailySeries | null {
  const from = h.days[0];
  if (!from) return null;
  const rule = m.of === 'rule' || m.of === 'ruleRows' ? h.rules.findIndex((r) => r.name === m.name) : -1;
  const column = m.of === 'missing' || m.of === 'median' || m.of === 'quantile' ? h.columns.indexOf(m.column) : -1;
  if (((m.of === 'rule' || m.of === 'ruleRows') && rule < 0) || ((m.of === 'missing' || m.of === 'median' || m.of === 'quantile') && column < 0)) return null;
  const counted = m.of === 'value' || m.of === 'count' ? h.values?.[m.column] : undefined;
  const place = counted && (m.of === 'value' || m.of === 'count') ? counted.values.indexOf(m.value) : -1;
  if ((m.of === 'value' || m.of === 'count') && (!counted?.counts || place < 0)) return null;
  const start = ofChecks(m) ? checksStart(h) : 0;
  const values = new Array<number | null>(daysBetween(from, h.days.at(-1)!) + 1).fill(null);
  h.days.forEach((day, k) => {
    if (k < start) return;
    const rows = h.rows[k]!;
    const v =
      m.of === 'trips' ? rows
      : m.of === 'dropped' ? (rows ? h.dropped[k]! / rows : null)
      : m.of === 'rule' ? (rows ? h.failed[k]![rule]! / rows : null)
      : m.of === 'missing' ? (rows ? 1 - h.present[k]![column]! / rows : null)
      : m.of === 'value' ? (rows ? (counted!.counts![k]![place] ?? 0) / rows : null)
      : m.of === 'count' ? (counted!.counts![k]![place] ?? 0)
      : m.of === 'droppedRows' ? h.dropped[k]!
      : m.of === 'ruleRows' ? h.failed[k]![rule]!
      : m.of === 'quantile' ? (h.quantiles?.[k]?.[column]?.[m.q] ?? null)
      : h.p50[k]![column]!;
    values[daysBetween(from, day)] = v;
  });
  return { from, values };
}

/** What ranges are learned from, besides the history: days left out, and the flow's calendar. */
export interface RangeOptions {
  /** Days one viewer left out of what a normal day is learned from (an incident's marked as such in one browser). */
  skip?: ReadonlySet<string>;
  /** Days the record leaves out (ADR 0010 §5, Q-80): held and not published as is, so a fill or an outage never
   * becomes normal. The flow's verdict leaves these out, and its claim names them. */
  recorded?: ReadonlySet<string>;
  /** The flow's calendar (ADR 0010 §2): `US_NYC_1` unless the flow chose one. */
  calendar?: Calendar;
}

/** Each metric's normal ranges over a history, made once a metric. */
export class HistoryRanges {
  readonly file: HistoryFile;
  private readonly made = new Map<string, NormalRanges | null>();
  private readonly skip: ReadonlySet<string>;
  private readonly recorded: ReadonlySet<string>;
  private readonly left: ReadonlySet<string>;
  /** The flow's calendar (ADR 0010 §2): `US_NYC_1` unless the flow chose one. */
  readonly calendar: Calendar;

  constructor(file: HistoryFile, options: RangeOptions = {}) {
    this.file = file;
    this.skip = options.skip ?? new Set();
    this.recorded = options.recorded ?? new Set();
    this.left = this.recorded.size ? new Set([...this.skip, ...this.recorded]) : this.skip;
    this.calendar = options.calendar ?? US_NYC_1;
  }

  /**
   * A base history with its tail folded in after it (ADR 0010 §6): the periods appended from their own runs, in slot
   * order (measures.ts appendPeriods).
   */
  static of(parts: { base: HistoryFile; tail?: readonly Measures[] }, options: RangeOptions = {}): HistoryRanges {
    return new HistoryRanges(parts.tail?.length ? appendPeriods(parts.base, parts.tail) : parts.base, options);
  }

  of(m: Metric): NormalRanges | null {
    const key = metricKey(m);
    if (!this.made.has(key)) {
      const s = seriesOf(this.file, m);
      this.made.set(key, s ? new NormalRanges(s, SCALES[m.of], { skip: this.left, calendar: this.calendar }) : null);
    }
    return this.made.get(key)!;
  }

  /** How many days one viewer left out: none for the flow's own verdict (ADR 0009 §3, ADR 0010 §5). */
  get skipped(): number {
    return this.skip.size;
  }

  /** The days the record leaves out, in order: what the flow's claim names (`skip`). */
  get recordedSkips(): string[] {
    return [...this.recorded].sort();
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

  /** Whether the checks a flow has now are the ones the history's latest periods counted: their names, checks and what
   * each does. */
  sameChecks(rules: readonly { name: string; check: string; onFail: string }[]): boolean {
    const a = this.file.rules;
    return a.length === rules.length && a.every((r, k) => r.name === rules[k]!.name && r.check === rules[k]!.check && r.onFail === rules[k]!.onFail);
  }

  /** The first day counted with the checks the history's latest periods counted (ADR 0010 §6): the checks' findings
   * are judged from there on. */
  checksFrom(): string | null {
    return this.file.days[checksStart(this.file)] ?? null;
  }
}

/** The days from one to another, both included. */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}
