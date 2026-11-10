/**
 * A daily load's history: each day's numbers as scripts/data/history.ts measures them (history.json in the data
 * branch), and the series a day's normal range is drawn from (normal.ts). The numbers count the checks named here, as
 * they were published: a range for what the checks drop holds only while the checks are the same. No DOM, no engine.
 */
import { plusDays, daysBetween, partsOf, slotsPerDay, US_NYC_1, type Calendar, type Every } from './calendar.js';
import { canonicalJSON } from './canonical.js';
import { NormalRanges, type DailySeries, type NormalRange, type Pattern, type Scale } from './normal.js';
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
  every?: Every;
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
  /** Each day's trips by pickup hour; a slot's rows by its parts (`parts`). */
  hours: number[][];
  /** A slot's own series (`slotSeries`, ADR 0010 §7): where its parts start in the day and how long each is, in minutes.
   * None for a day's history, whose parts are its 24 hours. Never in a file: made when a slot is judged. */
  parts?: { start: number; width: number };
  /** Days at the start before a value counts as never seen. */
  warmup: number;
  /** The coded and zone columns' values, and the coded columns' pairs (`a|b`); a pair's cells kept day by day
   * (`counts`) while they number PAIR_CELLS or fewer (ADR 0013), else followed for new combinations only. */
  values: Record<string, ValueHistory>;
  pairs: Record<string, ValueHistory>;
  /** The due marks' counts (ADR 0014 §3), by date column: the mark (its status column, the value that is a miss, the
   * window in days), each day's rows due that day, and each day's rows still missed by past due date. Only where the
   * ontology marks a column. */
  due?: Record<string, { status: string; miss: string; within: number; on: number[]; late: [date: string, rows: number][][] }>;
  /** The gate's rules' counts (ADR 0014 §4), day by day, only where the gate writes a rule: the scope's rows out of
   * scope, keys in scope with no row and keys in scope; each dependency rule's contradictions. */
  gate?: { scope?: { out: number[]; missing: number[]; inScope: number[] }; needs?: number[][] };
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
  | { of: 'ruleRows'; name: string }
  /** How two values go together, beyond what their own shares explain (ADR 0013): the log odds ratio of the cell's
   * two-by-two table (the cell's rows times the rows with neither value, over the rows with one value alone times the
   * rows with the other alone, half a row added to each so none is empty). Zero when the two are independent,
   * positive when they go together, and unmoved when a column's share changes while the association doesn't. The
   * pair as the history names it (`a|b`), the cell as its JSON key. */
  | { of: 'combo'; pair: string; value: string }
  /** The late share of a due-marked column (ADR 0014 §3): over the window before the day, the rows still missed whose
   * due date fell in it over the rows that were due in it. Null on a day with nothing due in the window. */
  | { of: 'late'; column: string }
  /** The gate's rules' counts (ADR 0014 §4): the rows out of scope, the keys in scope with no row, a dependency
   * rule's contradictions (by its place in the gate's list). */
  | { of: 'scopeOut' }
  | { of: 'scopeMissing' }
  | { of: 'needs'; rule: number };

/** The quantiles the history keeps of a measure or a time, in order. */
export const QUANTILES = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];

export const metricKey = (m: Metric) =>
  m.of === 'trips' || m.of === 'dropped' || m.of === 'droppedRows' ? m.of
  : m.of === 'rule' ? `rule:${m.name}`
  : m.of === 'ruleRows' ? `ruleRows:${m.name}`
  : m.of === 'value' ? `value:${m.column}=${m.value}`
  : m.of === 'count' ? `count:${m.column}=${m.value}`
  : m.of === 'quantile' ? `quantile:${m.column}@${m.q}`
  : m.of === 'late' ? `late:${m.column}`
  : m.of === 'needs' ? `needs:${m.rule}`
  : m.of === 'scopeOut' || m.of === 'scopeMissing' ? m.of
  : m.of === 'combo' ? `combo:${m.pair}=${m.value}`
  : `${m.of}:${m.column}`;

const SCALES: Record<Metric['of'], Scale> = { trips: 'count', dropped: 'share', rule: 'share', missing: 'share', median: 'level', value: 'share', quantile: 'level', count: 'count', droppedRows: 'count', ruleRows: 'count', combo: 'level', late: 'share', scopeOut: 'count', scopeMissing: 'count', needs: 'count' };

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
  const combo = m.of === 'combo' ? comboPlaces(h, m.pair, m.value) : null;
  if (m.of === 'combo' && !combo) return null;
  if (m.of === 'late' && !h.due?.[m.column]) return null;
  if ((m.of === 'scopeOut' || m.of === 'scopeMissing') && !h.gate?.scope) return null;
  if (m.of === 'needs' && !h.gate?.needs) return null;
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
      : m.of === 'combo' ? (rows ? comboLogOdds(comboTable(combo!, k, rows)) : null)
      : m.of === 'late' ? (lateAt(h, k, m.column)?.share ?? null)
      : m.of === 'scopeOut' ? (h.gate!.scope!.out[k] ?? null)
      : m.of === 'scopeMissing' ? (h.gate!.scope!.missing[k] ?? null)
      : m.of === 'needs' ? (h.gate!.needs![k]?.[m.rule] ?? null)
      : h.p50[k]![column]!;
    values[daysBetween(from, day)] = v;
  });
  return { from, values };
}

/**
 * What a due mark counts on a day (ADR 0014 §3): over the window of `within` days before the day (the day itself left
 * out), the rows that were due (each day's `on`, from the days the history has) and the rows still missed whose due
 * date fell in the window (the day's own `late` entries), with the late share; null where the column isn't marked or
 * the day is unknown, and `share` null when nothing was due.
 */
export function lateAt(h: Pick<HistoryFile, 'days' | 'due'>, k: number, column: string): { due: number; late: number; share: number | null; within: number; cohort: { due: number; late: number } } | null {
  const dh = h.due?.[column];
  const day = h.days[k];
  if (!dh || day === undefined) return null;
  const from = plusDays(day, -dh.within);
  let due = 0;
  for (let j = k - 1; j >= 0 && h.days[j]! >= from; j--) due += dh.on[j] ?? 0;
  let late = 0;
  for (const [d, n] of dh.late[k] ?? []) if (d >= from && d < day) late += n;
  // The cohort the day judges (ADR 0014 §3): what was due yesterday (the day before in the history, when it is the day
  // before) and how much of it is still missed today, every cohort seen at the same age.
  const yesterday = plusDays(day, -1);
  const cohortDue = k > 0 && h.days[k - 1] === yesterday ? (dh.on[k - 1] ?? 0) : 0;
  const cohortLate = (dh.late[k] ?? []).find(([d]) => d === yesterday)?.[1] ?? 0;
  return { due, late, share: due > 0 ? late / due : null, within: dh.within, cohort: { due: cohortDue, late: cohortLate } };
}

/**
 * The usual late share of a due-marked column before a day (ADR 0014 §3): over every earlier day's cohort (what was
 * due the day before it, and how much was still missed: `lateAt`'s `cohort`), the rows missed over the rows due,
 * pooled, so a control with few due dates a day is judged from all of them, each seen at the same age. Null until
 * twenty rows have been due: a share from fewer says nothing yet.
 */
export function lateUsual(h: Pick<HistoryFile, 'days' | 'due'>, k: number, column: string, learnsFrom: (day: string) => boolean = () => true): { share: number; due: number } | null {
  let due = 0;
  let late = 0;
  for (let j = 0; j < k; j++) {
    if (!learnsFrom(h.days[j]!)) continue;
    const at = lateAt(h, j, column);
    if (!at || at.cohort.due === 0) continue;
    due += at.cohort.due;
    late += at.cohort.late;
  }
  return due >= 20 ? { share: late / due, due } : null;
}

/** Where a pair's cell and its two values are counted in a history: the pair's history and the cell's place in it, and
 * each column's history with the value's place. Null unless all three are counted day by day. */
interface ComboPlaces {
  pair: ValueHistory;
  cell: number;
  a: ValueHistory;
  x: number;
  b: ValueHistory;
  y: number;
}

export function comboPlaces(h: Pick<HistoryFile, 'values' | 'pairs'>, pair: string, key: string): ComboPlaces | null {
  const p = h.pairs?.[pair];
  const cell = p?.values.indexOf(key) ?? -1;
  if (!p?.counts || cell < 0) return null;
  const [ca, cb] = pair.split('|');
  const a = ca === undefined ? undefined : h.values?.[ca];
  const b = cb === undefined ? undefined : h.values?.[cb];
  if (!a?.counts || !b?.counts) return null;
  let xy: unknown;
  try {
    xy = JSON.parse(key);
  } catch {
    return null;
  }
  if (!Array.isArray(xy) || xy.length !== 2) return null;
  const x = a.values.indexOf(JSON.stringify(xy[0]));
  const y = b.values.indexOf(JSON.stringify(xy[1]));
  return x < 0 || y < 0 ? null : { pair: p, cell, a, x, b, y };
}

/** A cell's two-by-two table on a period: the rows with both values, with each alone, and with neither. */
export interface ComboTable {
  both: number;
  xOnly: number;
  yOnly: number;
  neither: number;
  rows: number;
  /** The rows with each value, as its own column counts them. */
  x: number;
  y: number;
}

export function comboTable(c: ComboPlaces, k: number, rows: number): ComboTable {
  const both = c.pair.counts![k]?.[c.cell] ?? 0;
  const nx = c.a.counts![k]?.[c.x] ?? 0;
  const ny = c.b.counts![k]?.[c.y] ?? 0;
  return { both, xOnly: Math.max(0, nx - both), yOnly: Math.max(0, ny - both), neither: Math.max(0, rows - nx - ny + both), rows, x: nx, y: ny };
}

/** The table's log odds ratio, half a row added to each cell (the `combo` metric). */
export const comboLogOdds = (t: ComboTable): number => Math.log(((t.both + 0.5) * (t.neither + 0.5)) / ((t.xOnly + 0.5) * (t.yOnly + 0.5)));

/**
 * How many rows a cell would hold were its two values to go together as a log odds ratio says, given the period's
 * rows with each value: the table with those margins and that odds ratio (the quadratic's root inside the margins).
 */
export function comboPredicted(t: ComboTable, logOdds: number): number {
  const r = t.both + t.xOnly;
  const c = t.both + t.yOnly;
  const n = t.rows;
  if (!n || !r || !c) return 0;
  const theta = Math.exp(logOdds);
  const lo = Math.max(0, r + c - n);
  const hi = Math.min(r, c);
  if (Math.abs(theta - 1) < 1e-9) return Math.min(hi, Math.max(lo, (r * c) / n));
  const B = (theta - 1) * (r + c) + n;
  const disc = Math.max(0, B * B - 4 * (theta - 1) * theta * r * c);
  const a = (B - Math.sqrt(disc)) / (2 * (theta - 1));
  return Math.min(hi, Math.max(lo, a));
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
  /** What a day is compared with (ADR 0010 §3): `weekly` unless the watch says otherwise. */
  pattern?: Pattern;
  /** The echo fix and re-learning on its own (ADR 0010 §5): the general form's, never the legacy form's. */
  echoes?: boolean;
  relearn?: boolean;
  /** Each column's bad codes (ADR 0010 §4): a bad value's share is never re-learned on its own. */
  bad?: ReadonlyMap<string, ReadonlySet<string>>;
  /** The levels accepted (ADR 0010 §5, C6): from each, the metrics it names are learned only from the days since. */
  levels?: readonly Level[];
}

/** An accepted level (ADR 0009 amendment 1 S6, C6): the day it starts, and the metrics it names, as `metricKey` does. */
export interface Level {
  from: string;
  metrics: readonly string[];
  /** The decide entry that accepted it, by its seq: what a claim names it by. */
  decision?: number;
}

/** The settings a flow's ranges are made with, as one text: what `flowStory` checks against the flow's own. */
export function rangeSettings(o: Pick<RangeOptions, 'calendar' | 'pattern' | 'echoes' | 'relearn' | 'bad'>): string {
  const bad = [...(o.bad ?? new Map()).entries()].map(([c, v]) => [c, ...[...v].sort()]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1));
  return canonicalJSON({ calendar: (o.calendar ?? US_NYC_1) as unknown as Record<string, never>, pattern: o.pattern ?? 'weekly', echoes: !!o.echoes, relearn: !!o.relearn, bad: o.relearn ? bad : [] });
}

/**
 * Whether a number against its day's range would hold the day by itself (ADR 0010 §5, X7): rows under a tenth of a day
 * like it, or six typical misses off; a share four typical misses and ten points off, or a share of a fifth or more
 * gone; what the checks drop doubled to a tenth or more. A change that held a day is never re-learned on its own.
 */
const HELD: Partial<Record<Metric['of'], (r: NormalRange, v: number, d: number) => boolean>> = {
  trips: (r, v, d) => v < 0.1 * r.expected || Math.abs(d) >= 6,
  value: (r, v, d) => (Math.abs(d) >= 4 && Math.abs(v - r.expected) >= 0.1) || (v === 0 && r.expected >= 0.2),
  missing: (r, v, d) => Math.abs(d) >= 4 && Math.abs(v - r.expected) >= 0.1,
  dropped: (r, v) => v >= 2 * r.expected && v >= 0.1,
};

/** Whether a level applies to a metric: it names it, or it names the rows and the metric counts rows. */
/** Whether a level applies to a metric: one it names; every count, for a level of the rows; and every value of a column
 * one of whose values' shares it names, share and count, since a column's shares move together (a migration from
 * password to passkey moves both, at its own pace). */
const levelOn = (l: Level, m: Metric): boolean =>
  l.metrics.includes(metricKey(m)) || (l.metrics.includes('trips') && SCALES[m.of] === 'count') || ((m.of === 'value' || m.of === 'count') && l.metrics.some((k) => k.startsWith(`value:${m.column}=`)));

/** Each metric's normal ranges over a history, made once a metric. */
export class HistoryRanges {
  readonly file: HistoryFile;
  private readonly made = new Map<string, NormalRanges | null>();
  private readonly skip: ReadonlySet<string>;
  private readonly recorded: ReadonlySet<string>;
  private readonly left: ReadonlySet<string>;
  /** The flow's calendar (ADR 0010 §2): `US_NYC_1` unless the flow chose one. */
  readonly calendar: Calendar;
  private readonly options: RangeOptions;
  /** The settings these ranges are made with (`rangeSettings`). */
  readonly settings: string;
  /** The levels accepted, as these ranges learn them. */
  readonly levels: readonly Level[];
  /** What a day is compared with (ADR 0010 §3): the same weekday (`weekly`, the default), the periods before (`none`),
   * or the same day of the months before (`monthly`). */
  get pattern(): Pattern {
    return this.options.pattern ?? 'weekly';
  }

  constructor(file: HistoryFile, options: RangeOptions = {}) {
    this.file = file;
    this.skip = options.skip ?? new Set();
    this.recorded = options.recorded ?? new Set();
    this.left = this.recorded.size ? new Set([...this.skip, ...this.recorded]) : this.skip;
    this.calendar = options.calendar ?? US_NYC_1;
    this.options = options;
    this.settings = rangeSettings(options);
    this.levels = options.levels ?? [];
  }

  /**
   * A base history with its tail folded in after it (ADR 0010 §6): the periods appended from their own runs, in slot
   * order (measures.ts appendPeriods).
   */
  static of(parts: { base: HistoryFile; tail?: readonly Measures[] }, options: RangeOptions = {}): HistoryRanges {
    return new HistoryRanges(parts.tail?.length ? appendPeriods(parts.base, parts.tail) : parts.base, options);
  }

  /** The same history with some of its options changed: a viewer's incident days, the record's days, its levels. */
  with(changes: RangeOptions): HistoryRanges {
    return new HistoryRanges(this.file, { ...this.options, ...changes });
  }

  of(m: Metric): NormalRanges | null {
    const key = metricKey(m);
    if (!this.made.has(key)) {
      const s = seriesOf(this.file, m);
      const o = this.options;
      const breaks = this.levels.filter((l) => levelOn(l, m)).map((l) => l.from);
      // A bad value's share is never re-learned on its own: it always alerts (ADR 0010 §4).
      const bad = m.of === 'value' && !!o.bad?.get(m.column.toLowerCase())?.has(String(parseKey(m.value)));
      const general = { ...(o.pattern && o.pattern !== 'weekly' ? { pattern: o.pattern } : {}), ...(o.echoes ? { echoes: true } : {}), ...(o.relearn && !bad ? { relearn: true, held: HELD[m.of] ?? (() => false) } : {}), ...(breaks.length ? { breaks } : {}) };
      this.made.set(key, s ? new NormalRanges(s, SCALES[m.of], { skip: this.left, calendar: this.calendar, ...general }) : null);
    }
    return this.made.get(key)!;
  }

  /** Whether a day is learned from: not one a viewer marked or the record left out. */
  learnsFrom(day: string): boolean {
    return !this.left.has(day);
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

const parseKey = (key: string): unknown => {
  try {
    return JSON.parse(key) as unknown;
  } catch {
    return key;
  }
};

/** The days from one to another, both included. */
export function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
}

/**
 * A slot's own series (ADR 0010 §7): the periods of a history kept by slot (`every` other than a day) that are the same
 * slot of the day, each named by its day, with the slot's parts placed in the day (`parts`). A slot is judged from it as a
 * day is from a day's history, so the bands are per slot: the weekly pattern compares the same slot of the same weekday,
 * none the same slot of the days before, monthly the same slot of the same day of the month; last year's guess is the
 * same slot 52 weeks back; windows count days; a special day is special in every slot; floors scale with the slot's own
 * rows, so a quiet night slot isn't held to a busy afternoon's. A value is new only when the source never had it, in any
 * slot: one first seen in another slot of the day reads as seen before (its first and last places fall between this
 * series' periods). A day's history is its own series. The file itself is left as it was.
 */
export function slotSeries(file: HistoryFile, slot: string): HistoryFile {
  const every = file.every ?? 'day';
  if (every === 'day') return file;
  const at = slot.slice(10);
  const idx: number[] = [];
  file.days.forEach((d, k) => {
    if (d.slice(10) === at) idx.push(k);
  });
  const pos = new Map(idx.map((k, j) => [k, j]));
  // Places before `f` in this series; a place not in it falls half way between the periods around it.
  const below = (f: number) => {
    let lo = 0;
    let hi = idx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (idx[mid]! < f) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const place = (f: number) => pos.get(f) ?? below(f) - 0.5;
  const pick = <T>(xs: readonly T[]) => idx.map((k) => xs[k]!);
  const remap = (vh: ValueHistory): ValueHistory => {
    const counts = vh.counts ? pick(vh.counts) : undefined;
    return {
      values: [...vh.values],
      first: vh.first.map(place),
      last: vh.last.map(place),
      days: counts ? vh.values.map((_, i) => counts.filter((r) => (r[i] ?? 0) > 0).length) : [...vh.days],
      rows: counts ? vh.values.map((_, i) => counts.reduce((t, r) => t + (r[i] ?? 0), 0)) : [...vh.rows],
      fresh: vh.fresh.filter(([d]) => pos.has(d)).map(([d, n]): [number, number] => [pos.get(d)!, n]),
      ...(counts ? { counts } : {}),
    };
  };
  const { start, width } = partsOf(slot, every);
  const per = slotsPerDay(every);
  return {
    ...file,
    days: idx.map((k) => file.days[k]!.slice(0, 10)),
    rows: pick(file.rows),
    dropped: pick(file.dropped),
    failed: pick(file.failed),
    present: pick(file.present),
    p50: pick(file.p50),
    quantiles: idx.map((k) => file.quantiles[k] ?? []),
    hours: idx.map((k) => file.hours[k] ?? []),
    missing: file.missing.filter((m) => m.day.slice(10) === at).map((m) => ({ ...m, day: m.day.slice(0, 10) })),
    ...(file.checks ? { checks: file.checks.map((c) => ({ ...c, from: below(c.from) })) } : {}),
    warmup: Math.ceil(file.warmup / per),
    values: Object.fromEntries(Object.entries(file.values ?? {}).map(([c, vh]) => [c, remap(vh)])),
    pairs: Object.fromEntries(Object.entries(file.pairs ?? {}).map(([c, vh]) => [c, remap(vh)])),
    parts: { start, width },
  };
}
