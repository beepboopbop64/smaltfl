/**
 * A day's news: what is out of the ordinary about a daily load, from its history (history.ts) against its normal
 * ranges (normal.ts), ranked, each with its evidence, where to look for more, and what can be done about it. The kinds
 * of news are the ones data-observability tools watch a table for: volume (a normal amount of data or not, a day all
 * but blank, data that stops part way through), the values (one usually there gone, one's share unusual, a value or a
 * combination of values never seen before), completeness (a column missing more values than it does), shape (a
 * measure's or a time's quantiles moved), what the checks drop, the file's columns changing, and the weather as
 * context.
 *
 * False alarms are kept down three ways: a number has to be outside its normal range (three typical misses from what a
 * day like it has, which on 2023's days holds about 96 days in a hundred), it has to matter (enough rows, and a big
 * enough change: MATERIAL), and findings that are one thing seen through several columns (the same rows missing a
 * passenger count, a rate code and a surcharge) are told once. A day with nothing to tell says so. No DOM, no engine.
 */
import { daysBetween, namedOf, NONE, plusDays, resolveCalendar, specialOf, shortName, type Calendar } from './calendar.js';
import { isGeneralWatch, sourceOf, type FlowDocument } from './document.js';
import { apartEvidence, type Apart, type SampleFile } from './apart.js';
import { gated, gateChecksOf, writtenRules, type CheckName, type GateChecks, type NeedsRule, type ReconcileRule } from './gates.js';
import { HistoryRanges, lateAt, lateUsual, QUANTILES, type Metric, type ValueHistory } from './history.js';
import type { NoRange, NormalRange, NormalRanges } from './normal.js';
import { marksOn, nounOf, partNamed, propertyOf } from './ontology.js';
import { clockText } from './quality.js';
import { comboNews, unlikeNews } from './combos.js';

export type Severity = 'alert' | 'warn' | 'note' | 'ok';
/** Where a finding's details are: the tabs of a drill-down. */
export type Look = 'news' | 'rows' | 'columns' | 'dropped' | 'odd' | 'history' | 'integrity';
/** What can be done about a finding. */
export type Act = 'expected' | 'incident' | 'notify' | 'rule' | 'quarantine' | 'refetch' | 'export';

export interface Finding {
  key: string;
  kind: 'volume' | 'hours' | 'gone' | 'share' | 'band' | 'due' | 'scope' | 'needs' | 'reconcile' | 'apart' | 'new' | 'pair' | 'combo' | 'unlike' | 'missing' | 'shape' | 'dropped' | 'rule' | 'schema' | 'weather' | 'calm' | 'unlearned' | 'key' | 'unmatched' | 'placeholder' | 'empty' | 'integrity';
  severity: Severity;
  /** How far out, in typical misses (capped): what ranks findings of a severity. */
  score: number;
  title: string;
  detail: string;
  look: Look;
  /** The columns it is about, and for a value or a pair, the values (as JSON). */
  columns?: string[];
  values?: string[];
  /** The number's history, and the day's value and range: for its chart. */
  metric?: Metric;
  value?: number;
  range?: NormalRange;
  /** Rows it is about, when that is a number: for a finding's "on N trips". */
  rows?: number;
  acts: Act[];
  /** The table it is about, when it is told from a table's own rows (tableNewsOf), not the history. */
  table?: string;
  /** A change that has lasted: the first day of it. */
  lasting?: string;
  /** The finding it likely follows from (a feed that stopped): its key. */
  because?: string;
  /** Trips by pickup hour today and on a day like it, and the hours short of trips (an hours finding): for its bars;
   * `fall`, how far short those hours are in percent, as its title says it. */
  hours?: { got: number[]; usual: number[]; from: number; to: number; fall: number; start?: number; width?: number };
  /** The findings told together as one (the same trips seen through several columns): each with its own numbers. */
  members?: { column: string; value: string; label: string; share: number; range: NormalRange; rows: number }[];
  /** About a value the ontology marks bad (ADR 0010 §4): never folded under a cause, never marked as expected. */
  bad?: boolean;
  /** A day not judged (`unlearned`): why its rows have no range. */
  why?: NoRange;
  /** A day unlike the days before (`unlike`, ADR 0013 §3): the forest's score for it, the highest a day before reached,
   * the days learned from, and the numbers that set it apart, each with today's value and the usual. */
  unlike?: { score: number; highest: number; days: number; numbers: string[] };
  /** The gate's check it belongs to (ADR 0014 §2), set where the node has a gate. */
  check?: CheckName;
  /** A value's written band (ADR 0014 §3, a `band` finding): its low and high share. */
  band?: [number, number];
  /** A due mark's counts (a `due` finding): what was due in the window, what is still missed, the window in days, and
   * the usual late share where the history has one. */
  due?: { due: number; late: number; within: number; usual?: number };
  /** What the classifier found (an `apart` finding, ADR 0014 §5). */
  apart?: Apart;
}

/** How a column and a value are said: a column's title, and a code with what it stands for. */
export interface Names {
  column(c: string): string;
  value(c: string, v: unknown): string;
  /** A value said on its own, for short titles: what a code stands for ("Credit card"), or the value ("$2.50"). */
  label?(c: string, v: unknown): string;
  /** What `n` rows are called (ADR 0010 §8): "trip" for one, "trips" for any other number or none. Without it, rows. */
  noun?(n?: number): string;
  /** How a part with one of a column's codes is named ("Vendor {code}") and whether the column names who sent the rows,
   * from the ontology. */
  part?(column: string): { name?: string; role?: 'sender' } | undefined;
}

/** What `n` rows are called, by the names given: "trips", "trip", else "rows". */
export const nounFor = (names: Pick<Names, 'noun'>, n?: number): string => names.noun?.(n) ?? (n === 1 ? 'row' : 'rows');

/**
 * How a watched source is judged (ADR 0010 §4, §8), from its watch and the ontology's marks (`judgeOf`). The legacy
 * form, a watch given as a file name, keeps the rules every flow had before (fixed floors; a vendor named by its code; a
 * drop-off 15 minutes behind its pickup; the weather in Manhattan), so its verdicts don't move.
 */
export interface JudgeSettings {
  legacy: boolean;
  /** The flow's calendar for this source: none when its watch says `calendar: false`. */
  calendar: Calendar;
  /** Floors as set for 100,000 rows a day, or scaled with the day's expected rows. */
  scale: 'fixed' | 'volume';
  /** Each column's bad codes, as text. */
  bad: ReadonlyMap<string, ReadonlySet<string>>;
  /** Columns whose values never seen before are something wrong. */
  serious: ReadonlySet<string>;
  /** Time columns that run behind another, by minutes. */
  after: ReadonlyMap<string, { of: string; minutes: number }>;
  /** What a day is compared with (ADR 0010 §3): the watch's pattern; weekly in the legacy form. */
  pattern: 'weekly' | 'none' | 'monthly';
  /** Whether a lasting change is re-learned on its own (ADR 0010 §5): only when the watch says so. */
  relearn: boolean;
  /** The gate's checks (ADR 0014 §2), each hold, warn or off, for a node of a flow with gates; null where the flow has
   * none, and the day is judged as it always was. */
  checks: GateChecks | null;
  /** The ontology's expected bands (ADR 0014 §3), by `column|value` (the column in lower case, the value as text). */
  expect: ReadonlyMap<string, [number, number]>;
  /** The ontology's due marks (ADR 0014 §3). */
  due: readonly { column: string; status: string; miss: string; within: number }[];
  /** The gate's dependency rules (ADR 0014 §4), in the gate's order, for saying a contradiction in words. */
  needs: readonly NeedsRule[];
  /** The node's reconciliation (ADR 0014 §6), for saying its counts in words: the gate cell's, else the key the
   * ontology's `rows` entry gives it (ADR 0015 §1), as the plan counts it (`writtenRules`). */
  reconcile: ReconcileRule | null;
  /** The node's own key column as its scope counts it (`writtenRules`), where it has a scope: with the reconciliation's
   * key it says whether the two rules read one column, and so count a row with no key twice (ADR 0015 §1). */
  scopeKey?: string | null;
}

/** The legacy form's settings: what every flow was judged by before ADR 0010. */
export const LEGACY_JUDGE: JudgeSettings = Object.freeze({ legacy: true, calendar: resolveCalendar(undefined, true), scale: 'fixed', bad: new Map(), serious: new Set(), after: new Map(), pattern: 'weekly', relearn: false, checks: null, expect: new Map(), due: [], needs: [], reconcile: null }) as JudgeSettings;

/**
 * How a document judges a watched source (ADR 0010 §10, §11): its watch's settings and the marks its ontology puts on the
 * source's columns. A source the flow doesn't watch is judged in the legacy form.
 */
export function judgeOf(doc: Pick<FlowDocument, 'publish' | 'ontology' | 'calendar'> & Partial<Pick<FlowDocument, 'smaltfl' | 'gates' | 'sources' | 'steps'>>, source: string): JudgeSettings {
  const watches = Object.entries(doc.publish?.watch ?? {});
  const w = watches.find(([id]) => id.toLowerCase() === source.toLowerCase())?.[1];
  const general = isGeneralWatch(w) ? w : null;
  // New York's calendar is a format-2 flow's, as before ADR 0010; a format-3 document has its block's or none (Q-58).
  const legacyFlow = (doc.smaltfl ?? 2) < 3 && doc.calendar === undefined && watches.every(([, x]) => !isGeneralWatch(x));
  const m = marksOn(doc.ontology, source);
  // The written rules whose counts the judge says in words (ADR 0015 §1): the gate cell's, else the ontology's.
  const rules = writtenRules(doc, source);
  return {
    legacy: !general,
    calendar: general?.calendar === false ? NONE : resolveCalendar(doc.calendar, legacyFlow),
    scale: general ? (general.scale ?? 'volume') : 'fixed',
    bad: new Map(m.bad.map(([column, ...codes]) => [column.toLowerCase(), new Set(codes)])),
    serious: new Set(m.newValues.map(([column]) => column.toLowerCase())),
    after: new Map(m.after.map(([column, of, minutes]) => [column.toLowerCase(), { of, minutes }])),
    pattern: general?.pattern ?? 'weekly',
    relearn: general?.relearn ?? false,
    checks: gateChecksOf(doc, source),
    expect: new Map(m.expect.map(([column, value, low, high]) => [`${column.toLowerCase()}|${value}`, [low, high] as [number, number]])),
    due: m.due.map(([column, status, miss, within]) => ({ column, status, miss, within })),
    needs: rules.needs,
    reconcile: rules.reconcile ? { key: rules.reconcile.key, ...(rules.reconcile.of !== undefined ? { of: rules.reconcile.of } : {}) } : null,
    scopeKey: rules.scope?.own ?? null,
  };
}

/**
 * The names a flow's own verdict is told with (ADR 0009 §3): raw columns and values, as the claim's head has always
 * read, with the ontology's noun for the source and its parts' names and roles (ADR 0010 §8).
 */
export function flowNames(doc: Pick<FlowDocument, 'ontology' | 'steps'>, source: string): Names {
  // What reads the source reads it through its fill step, when it has one (C7): those steps' objects name its rows.
  const reads = (i: string) => sourceOf(doc, i)?.toLowerCase() === source.toLowerCase();
  const noun = nounOf(doc.ontology, source, doc.steps.filter((s) => s.inputs.some(reads)).map((s) => s.id));
  return {
    column: (c) => c,
    value: (_c, v) => String(v),
    noun: (n) => (n === 1 ? noun.one : noun.many),
    part: (column) => {
      const p = propertyOf(doc.ontology, source, column);
      return p && (p.name || p.role) ? { ...(p.name ? { name: p.name } : {}), ...(p.role ? { role: p.role } : {}) } : undefined;
    },
  };
}

/** A part's name by its column's template, through `Names.part` ("Vendor 1"), when the ontology gives one. */
export const partTemplate = (names: Pick<Names, 'part'>, column: string, code: unknown): string | undefined => partNamed(names.part?.(column) as never, code);

/** How much a finding must matter to be told. */
export const MATERIAL = {
  /** A share must move at least this far from what a day like it has (half a point), over this many rows, and by this
   * much of its smaller side (a fifth: 25% to 30% matters, 76% to 73% doesn't). */
  share: 0.005,
  rows: 50,
  shareRelative: 0.2,
  /** Unusual, not just worth knowing: two points. */
  shareUnusual: 0.02,
  /** A value or combination never seen before: on at least this many rows, or this share of the day. */
  newRows: 10,
  newShare: 0.001,
  /** A measure's quantile must move at least this far (a twentieth); a time's, this many minutes. To be unusual, not
   * worth knowing: three times as far, and five typical misses out. */
  relative: 0.05,
  minutes: 30,
  /** Outside its range on this many of the seven days before: a change that has lasted, told as a note. */
  lasting: 4,
  /** An hour is short of trips at under a quarter of what a day like it has then, counting hours that have this many. */
  hourShare: 0.25,
  hourRows: 200,
  /** All but blank: under a tenth of the trips a day like it has. */
  blank: 0.1,
  /** A new value is unusual, not just worth knowing, on this many rows (or a thousandth of the day). */
  newUnusual: 100,
  /** A part that held or moved is a split's cause from this many rows (story.ts). */
  split: 200,
  /** A combination's excess over what its columns predict (ADR 0013, combos.ts) must move at least `share` of the day's
   * rows; two points is unusual, five something wrong. */
  comboUnusual: 0.02,
  comboWrong: 0.05,
};

/** The floors that count rows, which scale with a day's expected rows in the general form (ADR 0010 §4). */
const ROW_FLOORS = ['rows', 'newRows', 'newUnusual', 'hourRows', 'split'] as const;

/**
 * The floors for a day expected to have `expected` rows (ADR 0010 §4): as set, with fixed floors (the legacy form); or
 * each floor f set for 100,000 rows a day scaled to f·√(E/100,000), kept between f/20 and 10f, since counting noise grows
 * as the square root.
 */
export function materialFor(expected: number, scale: 'fixed' | 'volume'): typeof MATERIAL {
  if (scale === 'fixed') return MATERIAL;
  const k = Math.sqrt(Math.max(0, expected) / 100_000);
  const out = { ...MATERIAL };
  for (const f of ROW_FLOORS) out[f] = Math.min(10 * MATERIAL[f], Math.max(MATERIAL[f] / 20, MATERIAL[f] * k));
  return out;
}

/** How long to say a day isn't judged, in four words at most (ADR 0010 §1): "First Thanksgiving here", "9 days of
 * history", "Changed since last year", "History ends Jan 31". */
export function notJudgedChip(why: NoRange, calendarShort = (name: string) => shortName(name), end?: string): string {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (why.why === 'no last year' && why.special) {
    const name = calendarShort(why.special.replace(/ \(observed\)$/, '')).replace(/^Holiday season$/, 'holiday season');
    const words = (t: string) => t.split(/\s+/).length;
    return words(`First ${name} here`) <= 4 ? `First ${name} here` : words(`First ${name}`) <= 4 ? `First ${name}` : 'None last year';
  }
  // A flow's recurring day with fewer than three of its days before: the first, or "2nd Patch Tuesday here".
  if (why.why === 'too few times' && why.special) {
    const name = calendarShort(why.special);
    const n = (why.times ?? 0) + 1;
    const nth = n === 1 ? 'First' : n === 2 ? '2nd' : '3rd';
    return `${nth} ${name} here`.split(/\s+/).length <= 4 ? `${nth} ${name} here` : `${nth} ${name}`.split(/\s+/).length <= 4 ? `${nth} ${name}` : 'Few before it';
  }
  if (why.why === 'last year moved') return 'Changed since last year';
  if (why.why === 'history ends' && end) return `History ends ${MON[Number(end.slice(5, 7)) - 1]} ${Number(end.slice(8, 10))}`;
  // A special day whose last year the history holds too little of to compare this year's days with.
  if (why.special) return 'Last year too short';
  return `${why.days.toLocaleString('en-US')} ${why.days === 1 ? 'day' : 'days'} of history`;
}

/**
 * What a day's news could judge (ADR 0010 §1): its rows; of the values that could be news (seen in the six weeks to it,
 * on half a percent of the rows or more that day or on average over those weeks), how many have a range (`values`:
 * judged, of); of the measures and times with quantiles that day, how many medians have one; whether the
 * checks' share does (false when the history doesn't count the flow's checks); and, when the rows have none, why.
 */
export interface Coverage {
  rows: boolean;
  values: [number, number];
  quantiles: [number, number];
  checks: boolean;
  why: NoRange | null;
}

export function coverageOf(h: HistoryRanges, day: string, options: { checks?: boolean } = {}): Coverage {
  const file = h.file;
  const k = file.days.indexOf(day);
  const trips = h.of({ of: 'trips' });
  const out: Coverage = { rows: !!trips?.at(day), values: [0, 0], quantiles: [0, 0], checks: options.checks !== false && !!h.of({ of: 'dropped' })?.at(day), why: trips && !trips.at(day) ? trips.explain(day) : null };
  if (k < 0) return out;
  // The values that could be news: on half a percent of the rows or more, today or on average over the six weeks before.
  const share = (vh: ValueHistory, i: number, j: number) => (file.rows[j] ? (vh.counts![j]?.[i] ?? 0) / file.rows[j]! : 0);
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts) continue;
    vh.values.forEach((value, i) => {
      if (vh.first[i]! > k || vh.last[i]! < k - 42) return;
      let sum = 0;
      for (let j = Math.max(0, k - 42); j < k; j++) sum += share(vh, i, j);
      if (Math.max(share(vh, i, k), sum / Math.max(1, Math.min(42, k))) < MATERIAL.share) return;
      out.values[1]++;
      if (h.of({ of: 'value', column, value })?.at(day)) out.values[0]++;
    });
  }
  file.columns.forEach((column, c) => {
    if ((file.kinds[c] !== 'measure' && file.kinds[c] !== 'time') || file.values?.[column]?.counts || !file.quantiles?.[k]?.[c]) return;
    out.quantiles[1]++;
    if (h.of({ of: 'quantile', column, q: 3 })?.at(day)) out.quantiles[0]++;
  });
  return out;
}

const RANK: Record<Severity, number> = { alert: 0, warn: 1, note: 2, ok: 3 };
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (x: number) => `${(x * 100).toFixed(x < 0.001 && x > 0 ? 2 : 1)}%`;
/** A share and its usual range, said with as few decimals as keep a share outside its range from reading as its edge:
 * "0.2% (usually 75–80%)". */
export function shareWords(value: number, low: number, high: number): { value: string; range: string } {
  const at = (x: number, d: number) => (x * 100).toFixed(d);
  const base = (x: number) => (x >= 0.1 ? 0 : x >= 0.001 ? 1 : 2);
  const outside = value < low || value > high;
  let d = value === 0 ? 0 : base(value);
  let dr = base(low > 0 ? low : high);
  while (dr < 3 && low < high && at(low, dr) === at(high, dr)) dr++;
  while (d < 3 && ((outside && (at(value, d) === at(low, dr) || at(value, d) === at(high, dr))) || (value > 0 && Number(at(value, d)) === 0))) d++;
  const lo = at(low, dr);
  const hi = at(high, dr);
  return { value: `${at(value, d)}%`, range: lo === hi ? `${lo}%` : `${lo}–${hi}%` };
}
const cap = (d: number) => (Number.isFinite(d) ? Math.min(99, Math.abs(d)) : 99);
/** A value in a short title, by its history key: its meaning when that is short ("Credit card"), else its own value
 * ("N", "$2.50"). What the findings and the models' views name a value by. */
export const labelOf = (names: Names) => (column: string, key: string): string => {
  const said = (names.label ?? names.value)(column, parse(key));
  return said.split(/\s+/).length <= 3 ? said : String(parse(key));
};

const parse = (key: string): unknown => {
  try {
    return JSON.parse(key) as unknown;
  } catch {
    return key;
  }
};
/**
 * A share's rows today against its usual share of the same trips, both counted: "9 of today’s trips with it; about
 * 3,360 at its usual share". Never "N fewer than a day like it": a share can fall while its trips rise (New Year's Day
 * 2024's credit cards), and on a short day the trips a day like it has are mostly the day's own shortfall.
 */
const atShare = (share: number, usual: number, rows: number, how: string, noun = 'trips') => `${fmtInt(share * rows)} of today’s ${noun} ${how}; about ${fmtInt(usual * rows)} at its usual share.`;
const listed = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A day's findings, most important first; `checks` says whether the flow's checks are the ones the history counted, and
 * `judge` how the source is judged (ADR 0010 §4: bad values, serious columns, floors; the legacy form by default).
 */
export function newsOf(h: HistoryRanges, day: string, names: Names, options: { checks?: boolean; judge?: JudgeSettings; apart?: { sample: SampleFile; today: readonly (readonly unknown[])[] } } = {}): Finding[] {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0) return [];
  const rows = file.rows[k]!;
  const out: Finding[] = [];
  const judge = options.judge ?? LEGACY_JUDGE;
  const noun = (n?: number) => nounFor(names, n);
  const Noun = (n?: number) => sentence(noun(n));
  const cal = h.calendar;
  const label = labelOf(names);
  const judged = (m: Metric): { ranges: NormalRanges; range: NormalRange; value: number; d: number } | null => {
    const ranges = h.of(m);
    const range = ranges?.at(day);
    const value = ranges?.value(day) ?? null;
    if (!ranges || !range || value === null) return null;
    return { ranges, range, value, d: ranges.distance(range, value) };
  };
  // Outside its range, and for a share or a level a typical miss past its edge, so a number hugging the edge isn't told
  // as news (ADR 0008). Counts are told from the edge: a day's trips are judged against their own wide range.
  const outside = (j: { ranges: NormalRanges; range: NormalRange; value: number }) =>
    j.ranges.place(j.range, j.value) !== 'within' && (j.range.scale === 'count' || Math.abs(j.ranges.distance(j.range, j.value)) >= j.range.z + 1);
  // A change that has lasted: the days before were outside today's range the same way, most of the week before or the
  // same weekday twice running (a weekend surcharge). Told as a note from the first day it was, not as news every
  // day: the range learns it within weeks, or it is marked expected.
  const lasting = (j: { ranges: NormalRanges; range: NormalRange; value: number }): string | null => {
    const way = j.ranges.place(j.range, j.value);
    // After a break (an accepted level, or a change re-learned, ADR 0010 §5) a day before it is never counted: a number
    // is never called lasting against its old level.
    const since = j.ranges.breakAt(day);
    const so = (i: number): boolean | null => {
      if (since !== null && plusDays(day, -i) < since) return null;
      const v = j.ranges.value(plusDays(day, -i));
      return v === null ? null : j.ranges.place(j.range, v) === way;
    };
    let n = 0;
    for (let i = 1; i <= 7; i++) n += so(i) ? 1 : 0;
    const daily = n >= MATERIAL.lasting;
    if (!daily && !(so(7) && so(14))) return null;
    // From when: back day by day (or week by week) until it wasn't so.
    let first = day;
    for (let i = daily ? 1 : 7, gap = 0; i <= 56 && gap < (daily ? 3 : 1); i += daily ? 1 : 7) {
      if (so(i)) (first = plusDays(day, -i), (gap = 0));
      else gap++;
    }
    return first;
  };
  // A share: four typical misses out and ten points off, something wrong; two points, unusual; else worth knowing.
  const shareSeverity = (delta: number, j: { d: number }): Severity => (Math.abs(j.d) < 4 ? 'note' : Math.abs(delta) >= 0.1 ? 'alert' : Math.abs(delta) >= MATERIAL.shareUnusual ? 'warn' : 'note');
  const quiet = (f: Finding, j: Parameters<typeof lasting>[0]): Finding => {
    const since = lasting(j);
    if (!since) return f;
    // A deliberate change pauses (the owner: "pause until accepted"; ADR 0009 amendment 1 S6, Q-57b: "the change pauses
    // once"): in the general form a value that was a part of the mix (1% or more), on the first day its lasting change
    // crosses three times its usual share or a third of it (the relative rule), within the change's first week, is never
    // lowered to a note but held as something wrong, so Accept the new level is offered: a migration from password to
    // passkey holds the day it crosses. Once accepted, the ranges learn it from its day (a break, the column's mix with
    // it), and it is no longer outside them. A change that crossed already (told, or held, that day), codes under 1%
    // coming and going, smaller lasting changes and the legacy form's are told as notes: the taxi example's 25 days stay
    // as the owner accepted them (Q-54).
    if (!judge.legacy && f.metric?.of === 'value' && f.value !== undefined && f.range && f.range.expected >= 0.01 && daysBetween(since, day) <= 7) {
      const crosses = (value: number | null, expected: number | undefined) => value !== null && expected !== undefined && expected > 0 && (value / expected >= 3 || value / expected <= 1 / 3);
      // The first day it crosses: a day of the change before it that crossed already paused, or was told, then.
      let first = true;
      for (let d = since; d < day && first; d = plusDays(d, 1)) if (crosses(j.ranges.value(d), j.ranges.at(d)?.expected)) first = false;
      if (first && crosses(f.value, f.range.expected) && Math.abs(f.value - f.range.expected) * rows >= M.rows) return { ...f, severity: 'alert', lasting: since };
    }
    // Told as a note, without its first day in words: which day a change began is for its chart to show (ADR 0008).
    return { ...f, severity: 'note', score: f.score / 10, lasting: since };
  };

  // Volume: the day's trips against what a day like it has; all but blank; the hours it stops or starts.
  const trips = judged({ of: 'trips' });
  // The floors, scaled in the general form with the day's expected rows (its rows, when they have no range).
  const M = materialFor(trips?.range.expected ?? rows, judge.scale);
  if (trips) {
    const { range, value } = trips;
    const like = `A day like it has ${fmtInt(range.low)} to ${fmtInt(range.high)}.`;
    if (value < MATERIAL.blank * range.expected) {
      out.push({ key: 'volume', kind: 'volume', severity: 'alert', score: 99, title: `Almost no ${noun()}: ${fmtInt(value)}`, detail: like, look: 'history', metric: { of: 'trips' }, value, range, rows: value, acts: ['incident', 'notify', 'expected'] });
    } else if (outside(trips)) {
      const more = value > range.expected;
      // A rise or fall that has lasted (most of the week before outside each day's own range the same way, as the
      // weeks after Labor Day 2022 were, with no last year to learn the season from) is told as a note, unless it is
      // something wrong: each past day against its own range, not today's, so a weekday's level never judges a Sunday.
      const way = trips.ranges.place(range, value);
      let lastedDays = 0;
      for (let i = 1; i <= 7; i++) {
        const d = plusDays(day, -i);
        const r = trips.ranges.at(d);
        const v = trips.ranges.value(d);
        if (r && v !== null && trips.ranges.place(r, v) === way) lastedDays++;
      }
      const lasted = cap(trips.d) < 6 && lastedDays >= MATERIAL.lasting;
      // From when: back day by day while the days were outside their own ranges the same way, two in a row at most not.
      let since = day;
      for (let i = 1, gap = 0; lasted && i <= 56 && gap < 3; i++) {
        const d = plusDays(day, -i);
        const r = trips.ranges.at(d);
        const v = trips.ranges.value(d);
        if (r && v !== null && trips.ranges.place(r, v) === way) (since = d), (gap = 0);
        else gap++;
      }
      out.push({
        key: 'volume', kind: 'volume', severity: cap(trips.d) >= 6 ? 'alert' : lasted ? 'note' : 'warn', score: lasted ? cap(trips.d) / 10 : cap(trips.d),
        title: `${more ? 'More' : 'Fewer'} ${noun()}: ${fmtInt(value)} (${more ? '+' : '−'}${Math.round(Math.abs(value / range.expected - 1) * 100)}%)`,
        detail: like,
        look: 'history', metric: { of: 'trips' }, value, range, rows: value, acts: ['expected', 'incident', 'notify'],
        ...(lasted ? { lasting: since } : {}),
      });
    }
    // The hours: trips by pickup hour against what a day like it has then, from the same weekday's hours lately.
    const hours = hoursShort(h, k, range.expected, M, names);
    if (hours && value >= MATERIAL.blank * range.expected) out.push(hours);
  } else {
    // The floor that needs no range (ADR 0010 §1): a day with under a tenth of the median of its last seven days' rows,
    // any weekday, is something wrong, judged or not (a first-year holiday cut to 5%). The owner: it still pauses (Q-53).
    const before = file.rows.slice(Math.max(0, k - 7), k);
    const usual = before.length >= 3 ? [...before].sort((a, b) => a - b)[before.length >> 1]! : null;
    if (usual !== null && rows < MATERIAL.blank * usual) {
      out.push({ key: 'volume', kind: 'volume', severity: 'alert', score: 99, title: `Almost no ${noun()}: ${fmtInt(rows)}`, detail: `Under a tenth of the last ${before.length} days’ median, ${fmtInt(usual)}; not judged against a day like it.`, look: 'history', metric: { of: 'trips' }, value: rows, rows, acts: ['incident', 'notify', 'expected'] });
    }
  }

  /** A bad value's burst on a day its share has no range (`newsOf`'s rule for bad values with none): its share against
   * the median of the last seven days before it that aren't special in the calendar, at least three of them. */
  const badWithoutRange = (column: string, vh: ValueHistory, i: number, key: string): Finding | null => {
    const shares: number[] = [];
    for (let x = k - 1; x >= 0 && shares.length < 7; x--) {
      if (!file.rows[x] || specialOf(file.days[x]!, cal)) continue;
      shares.push((vh.counts![x]?.[i] ?? 0) / file.rows[x]!);
    }
    if (shares.length < 3 || !rows) return null;
    const usual = [...shares].sort((a, b) => a - b)[shares.length >> 1]!;
    const today = vh.counts![k]?.[i] ?? 0;
    const usualRows = usual * rows;
    if (today < 2 * usualRows || today - usualRows < M.rows) return null;
    const times = usualRows > 0 ? today / usualRows : Infinity;
    const w = shareWords(today / rows, usual, usual);
    return {
      key: `share:${column}=${key}`, kind: 'share', severity: 'alert', score: Number.isFinite(times) ? Math.min(99, times) : 99, bad: true,
      title: `${sentence(names.column(column))} ${label(column, key)}: ${w.value} (usually ${w.range})`,
      detail: `${fmtInt(today)} ${noun(today)} with it today${Number.isFinite(times) ? `, ${times.toFixed(1).replace(/\.0$/, '')}× the median of the last ${shares.length} days` : ''}: a value marked bad, with no range for a day like it yet.`,
      look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: today / rows, rows: Math.round(today - usualRows), acts: ['incident', 'notify'],
    };
  };

  // The due marks (ADR 0014 §3): what was due in the window before the day and what is still missed, the late share
  // against its own history. Where it is judged (a range for the day), the miss value's own rise and blanks in the date
  // column are its to tell: a cluster of due dates with the usual share late is a note, not a bad value up.
  // The day judges yesterday's cohort: what was due the day before and how much of it is still missed today, against
  // the usual share pooled over every earlier cohort at the same age (`lateUsual`), not a day's range: a control with a
  // few due dates a day has too few to learn a range from, and the question is one of proportion. Something wrong
  // when the late rows are three standard errors over the usual share of the dues, and at least five rows (or a
  // twentieth of the dues) over it; a note otherwise; not judged until twenty rows have been due. The window's counts
  // (the last `within` days) are said beside it.
  const dueJudged = new Set<string>();
  for (const d of judge.due) {
    const at = lateAt(file, k, d.column);
    if (!at) continue;
    const usual = lateUsual(file, k, d.column, (day) => h.learnsFrom(day));
    if (usual) dueJudged.add(d.column.toLowerCase());
    const c = at.cohort;
    if (c.late === 0 && (c.due === 0 || !usual)) continue;
    const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(/\.0%$/, '%');
    const counts = `${fmtInt(c.late)} of ${fmtInt(c.due)} due`;
    const miss = names.value(d.status, d.miss);
    const window = `Last ${at.within} days: ${fmtInt(at.due)} due, ${fmtInt(at.late)} late.`;
    const share = c.due > 0 ? c.late / c.due : null;
    const base = { key: `due:${d.column}`, kind: 'due' as const, look: 'columns' as const, columns: [d.column, d.status], values: [JSON.stringify(d.miss)], metric: { of: 'late' as const, column: d.column }, rows: c.late, ...(share !== null ? { value: share } : {}), due: { due: c.due, late: c.late, within: at.within, ...(usual ? { usual: usual.share } : {}) } };
    // Yesterday's load not in the history (a day skipped, or run out of order): what was due isn't known.
    if (c.due === 0 && !(k > 0 && file.days[k - 1] === plusDays(day, -1))) {
      out.push({ ...base, severity: 'note', score: 1, title: `Late: ${fmtInt(c.late)}, due yesterday`, detail: `Still ${miss} from yesterday's due date; yesterday's load isn't in the history, so what was due isn't known. ${window}`, acts: ['notify'] });
      continue;
    }
    if (!usual || share === null) {
      out.push({ ...base, severity: 'note', score: 1, title: `Late: ${counts}`, detail: `Due yesterday and still ${miss}; too few due dates in the history to judge the late share by yet. ${window}`, acts: ['notify'] });
      continue;
    }
    const expected = usual.share * c.due;
    const z = (c.late - expected) / Math.sqrt(Math.max(0.25, c.due * usual.share * (1 - usual.share)));
    if (z >= 3 && c.late - expected >= Math.max(5, 0.05 * c.due)) {
      out.push({ ...base, severity: 'alert', score: Math.min(99, z), title: `Late: ${counts} (usually ${pct(usual.share)})`, detail: `${pct(share)} of what was due yesterday is still ${miss}; usually ${pct(usual.share)} the day after. ${window}`, acts: ['incident', 'notify', 'expected'] });
    } else {
      out.push({ ...base, severity: 'note', score: Math.max(0, z) / 10, title: `Late: ${counts} (usually ${pct(usual.share)})`, detail: `${pct(share)} of what was due yesterday is still ${miss}, as usual (${pct(usual.share)} over ${fmtInt(usual.due)} due). ${window}`, acts: ['notify'] });
    }
  }
  // The gate's written rules (ADR 0014 §4): the scope's rows out of scope and keys in scope with no row, and each
  // dependency's contradictions, against their usual counts (a few out of scope every day is the inventory's lag, not
  // news): something wrong at five or more and past twice the usual high (or with no history), a note otherwise.
  const ruleCount = (key: string, kind: 'scope' | 'needs', metric: Metric, n: number, title: string, detail: string) => {
    if (n <= 0) return;
    const j = judged(metric);
    const wrong = n >= 5 && (!j || n > 2 * j.range.high);
    out.push({ key, kind, severity: wrong ? 'alert' : 'note', score: wrong ? Math.min(99, n) : 1, title, detail: j ? `${detail} A day like it has ${fmtInt(Math.round(j.range.low))}–${fmtInt(Math.round(j.range.high))}.` : detail, look: 'rows', metric, value: n, ...(j ? { range: j.range } : {}), rows: n, acts: ['incident', 'notify', 'expected'] });
  };
  if (file.gate?.scope) {
    const sc = file.gate.scope;
    const inScope = sc.inScope[k] ?? 0;
    ruleCount('scope:out', 'scope', { of: 'scopeOut' }, sc.out[k] ?? 0, `${fmtInt(sc.out[k] ?? 0)} ${noun(sc.out[k] ?? 0)} out of scope`, `Rows whose key the inventory doesn’t list in scope, beside ${fmtInt(inScope)} keys in scope.`);
    ruleCount('scope:missing', 'scope', { of: 'scopeMissing' }, sc.missing[k] ?? 0, `${fmtInt(sc.missing[k] ?? 0)} in scope with no ${noun(1)}`, `Keys the inventory lists in scope that have no row here, of ${fmtInt(inScope)} in scope.`);
  }
  // The reconciliation (ADR 0014 §6): exact, so any count is something wrong: a key on two rows, a blank key, a key
  // of the other node with no row here, a key here the other node lacks.
  const rc = file.gate?.reconcile?.[k];
  if (rc) {
    const keyName = judge.reconcile?.key.map((c) => names.column(c)).join(' and ') ?? 'key';
    const other = judge.reconcile?.of ?? 'the other node';
    const exact = (count: 'repeats' | 'blank' | 'missing' | 'extra', n: number, title: string, detail: string) => {
      if (n <= 0) return;
      out.push({ key: `reconcile:${count}`, kind: 'reconcile', severity: 'alert', score: Math.min(99, n), title, detail, look: 'rows', metric: { of: 'reconcile', count }, value: n, rows: n, acts: ['incident', 'notify'] });
    };
    const repeats = rc.rows - rc.keys - rc.blank;
    exact('repeats', repeats, `${fmtInt(repeats)} ${noun(repeats)} ${repeats === 1 ? 'repeats' : 'repeat'} a key`, `${fmtInt(rc.rows)} rows for ${fmtInt(rc.keys)} ${keyName} values: ${(rc.rows / Math.max(1, rc.keys)).toFixed(1).replace(/\.0$/, '')} rows a key, where one is expected.`);
    exact('blank', rc.blank, `${fmtInt(rc.blank)} ${noun(rc.blank)} with no ${keyName}`, `Rows whose ${keyName} is blank: a row no key names is never found.`);
    exact('missing', rc.missing, `${fmtInt(rc.missing)} keys of ${other} with no ${noun(1)}`, `${sentence(other)} has ${fmtInt(rc.missing)} ${keyName} values with no row here: the rows don't reconcile.`);
    exact('extra', rc.extra, `${fmtInt(rc.extra)} ${noun(rc.extra)} not in ${other}`, `Keys here that ${other} doesn't have: rows from nowhere the flow reads.`);
  }
  (file.gate?.needs?.[k] ?? []).forEach((n, i) => {
    const rule = judge.needs[i];
    const said = (m: Record<string, string | string[]> | undefined) => (m ? Object.entries(m).map(([c, v]) => `${names.column(c)} ${(Array.isArray(v) ? v : [v]).join('/')}`).join(' and ') : `rule ${i + 1}`);
    ruleCount(`needs:${i}`, 'needs', { of: 'needs', rule: i }, n, `${fmtInt(n)} ${noun(n)}: ${said(rule?.when)} needs ${said(rule?.then)}`, `${rule?.from ? `Read against ${rule.from} by ${rule.key}: ` : ''}rows matching the rule's condition whose required value isn't there.`);
  });

  /** Whether a column's value is the miss a judged due mark tells: its rise is the due check's, not a bad value's. */
  const dueMiss = (column: string, key: string): boolean => judge.due.some((d) => d.status.toLowerCase() === column.toLowerCase() && d.miss === String(parse(key)) && dueJudged.has(d.column.toLowerCase()));
  const dueColumn = (column: string): boolean => judge.due.some((d) => d.column.toLowerCase() === column.toLowerCase());

  // Each coded value's share: one usually there and gone, or one whose share is unusual.
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts) continue;
    const badCodes = judge.bad.get(column.toLowerCase());
    vh.values.forEach((key, i) => {
      // A value first seen today is told as new (below), not as a share against a history of none.
      if (vh.first[i]! >= k) return;
      if (dueMiss(column, key)) return;
      const bad = key !== 'null' && !!badCodes?.has(String(parse(key)));
      // A written band (ADR 0014 §3): the share against the band, and nothing else; a value with a band is judged by it.
      const band = judge.expect.get(`${column.toLowerCase()}|${String(parse(key))}`);
      if (band) {
        const share = rows ? (vh.counts![k]?.[i] ?? 0) / rows : 0;
        const [low, high] = band;
        if (share < low - 1e-9 || share > high + 1e-9) {
          const today = vh.counts![k]?.[i] ?? 0;
          const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(/\.0%$/, '%');
          out.push({ key: `band:${column}=${key}`, kind: 'band', severity: 'alert', score: 99, title: `${sentence(names.column(column))} ${label(column, key)}: ${pct(share)} (band ${pct(low)}–${pct(high)})`, detail: `${fmtInt(today)} ${noun(today)} with it today; the ontology expects ${pct(low)} to ${pct(high)} of ${noun()}.`, look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: share, rows: today, band: [low, high], acts: ['incident', 'notify'], ...(bad ? { bad: true } : {}) });
        }
        return;
      }
      const j = judged({ of: 'value', column, value: key });
      if (!j) {
        // A value marked bad with no range to judge it by (a first-year holiday, a flow's first weeks): something wrong
        // at twice its median share over the last seven ordinary days or more, past its floor, as the rows' own floor
        // needs no range (the owner: rare but serious values always alert).
        if (bad) {
          const f = badWithoutRange(column, vh, i, key);
          if (f) out.push(f);
        }
        return;
      }
      const delta = j.value - j.range.expected;
      const said = label(column, key);
      const w = shareWords(j.value, j.range.low, j.range.high);
      const place = j.ranges.place(j.range, j.value);
      // A value marked bad (ADR 0010 §4): something wrong above its range at twice its usual rows past its floor, however
      // few points it moved; good news below it; else told as any value is. Never marked as expected, never folded
      // (story.ts).
      if (bad && place !== 'within') {
        const usualRows = j.range.expected * (trips?.range.expected ?? rows);
        const today = j.value * rows;
        const base = { key: `share:${column}=${key}`, kind: 'share' as const, score: cap(j.d), columns: [column], values: [key], metric: { of: 'value' as const, column, value: key }, value: j.value, range: j.range, rows: Math.round(Math.abs(today - usualRows)), look: 'columns' as const, bad: true };
        if (place === 'above' && today >= 2 * usualRows && today - usualRows >= M.rows) {
          const times = usualRows > 0 ? today / usualRows : Infinity;
          out.push({ ...base, severity: 'alert', title: `${sentence(names.column(column))} ${said}: ${w.value} (usually ${w.range})`, detail: `${fmtInt(today)} ${noun(today)} with it today${Number.isFinite(times) ? `, ${times.toFixed(1).replace(/\.0$/, '')}× its usual ${fmtInt(usualRows)}` : ''}: a value marked bad.`, acts: ['incident', 'notify'] });
          return;
        }
        if (place === 'below') {
          out.push({ ...base, severity: 'note', title: `${sentence(names.column(column))} ${said}: ${w.value} (usually ${w.range})`, detail: `Fewer than usual of a value marked bad: ${fmtInt(today)} ${noun(today)}, about ${fmtInt(usualRows)} usually.`, acts: ['notify'] });
          return;
        }
      }
      // A bad value's finding never offers to mark it as expected (C9).
      const marked = (f: Finding): Finding => (bad ? { ...f, bad: true, acts: f.acts.filter((a) => a !== 'expected') } : f);
      // The relative rule (ADR 0010 §4, the general form): a value at three times its usual rows or more, or a third or
      // less, outside its range and past its floor, is at least unusual, where the point gates miss 0.5% → 0.9%.
      const ratio = j.value / Math.max(1e-9, j.range.expected);
      const relative = !judge.legacy && place !== 'within' && (ratio >= 3 || ratio <= 1 / 3) && Math.abs(delta) * rows >= M.rows;
      if (!outside(j) && !relative) return;
      if (!relative && (Math.abs(delta) < MATERIAL.share || Math.abs(delta) * rows < M.rows)) return;
      if (!relative && Math.abs(delta) < MATERIAL.shareRelative * Math.min(j.range.expected, 1 - j.range.expected)) return;
      const atLeast = (sv: Severity): Severity => (relative && RANK[sv] > RANK.warn ? 'warn' : sv);
      if (j.value === 0) {
        out.push(marked(quiet({ key: `gone:${column}=${key}`, kind: 'gone', severity: atLeast(j.range.expected >= 0.2 ? 'alert' : 'warn'), score: cap(j.d), title: `${sentence(names.column(column))} ${said}: none`, detail: `Usually on ${w.range} of ${noun()}; none today.`, look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: j.value, range: j.range, rows: Math.round(-delta * rows), acts: ['incident', 'notify', 'expected'] }, j)));
      } else {
        out.push(marked(quiet({ key: `share:${column}=${key}`, kind: key === 'null' ? 'missing' : 'share', severity: atLeast(shareSeverity(delta, j)), score: cap(j.d), title: key === 'null' ? `${sentence(names.column(column))} blank: ${w.value} (usually ${w.range})` : `${sentence(names.column(column))} ${said}: ${w.value} (usually ${w.range})`, detail: atShare(j.value, j.range.expected, rows, key === 'null' ? 'blank' : 'with it', noun()), look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: j.value, range: j.range, rows: Math.round(Math.abs(delta) * rows), acts: ['expected', 'rule', 'notify'] }, j)));
      }
    });
  }

  // Completeness: a column missing more (or fewer) values than a day like it.
  file.columns.forEach((column, c) => {
    if (file.values?.[column]?.counts) return; // a coded column's missing values are its null value, above
    if (dueColumn(column)) return; // a due date's blank is nothing due (ADR 0014 §3)
    const j = judged({ of: 'missing', column });
    if (!j || !outside(j)) return;
    const delta = j.value - j.range.expected;
    if (Math.abs(delta) < MATERIAL.share || Math.abs(delta) * rows < M.rows) return;
    if (Math.abs(delta) < MATERIAL.shareRelative * Math.min(j.range.expected, 1 - j.range.expected)) return;
    void c;
    const w = shareWords(j.value, j.range.low, j.range.high);
    out.push(quiet({ key: `missing:${column}`, kind: 'missing', severity: shareSeverity(delta, j), score: cap(j.d), title: `${sentence(names.column(column))} blank: ${w.value} (usually ${w.range})`, detail: atShare(j.value, j.range.expected, rows, 'without it', noun()), look: 'columns', columns: [column], values: ['null'], metric: { of: 'missing', column }, value: j.value, range: j.range, rows: Math.round(Math.abs(delta) * rows), acts: ['expected', 'rule', 'notify'] }, j));
  });

  // Values and combinations never seen before.
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    const found = newOn(vh, k);
    if (!found) continue;
    // A judged due mark's miss first seen today is lateness, told by the due check (ADR 0014 §3), not a new value.
    const fresh = found.keys.some((key) => dueMiss(column, key)) ? { ...found, keys: found.keys.filter((key) => !dueMiss(column, key)), rows: undefined } : found;
    if (fresh.keys.length === 0) continue;
    const n = fresh.rows ?? vh.fresh.find(([d]) => d === k)?.[1] ?? 0;
    // A serious column's new value is something wrong, however few rows bring it (ADR 0010 §4, the owner, Q-56).
    const serious = judge.serious.has(column.toLowerCase());
    if (!serious && n < M.newRows && n < MATERIAL.newShare * rows) continue;
    const said = fresh.keys.slice(0, 5).map((key) => names.value(column, parse(key)));
    // A new value the ontology marks bad is something wrong, and never marked as expected (C9); so is any new value in
    // a serious column: marking it expected is for the column's owner to do in the ontology, not on a paused day.
    const badCodes = judge.bad.get(column.toLowerCase());
    const bad = fresh.keys.some((key) => key !== 'null' && !!badCodes?.has(String(parse(key))));
    const alert = serious || bad;
    // A column whose one new value is null went blank (ADR 0013: a control's file with no rows leaves its column of the
    // posture blank): told as blanks, so the day reads as the data missing, not as a value.
    if (fresh.keys.length === 1 && fresh.keys[0] === 'null' && rows > 0) {
      const share = n / rows;
      // Ten points of the day blank where none ever was: something wrong; two: unusual.
      out.push({ key: `missing:${column}`, kind: 'missing', severity: share >= 0.1 && n >= M.rows ? 'alert' : share >= MATERIAL.shareUnusual ? 'warn' : 'note', score: Math.min(99, share * 100), title: `${sentence(names.column(column))} blank: ${share >= 0.995 ? 'all' : `${Math.round(share * 100)}%`} (never before)`, detail: `${fmtInt(n)} ${noun(n)} without it today; never a blank in ${daysSeen(file, k)} days.`, look: 'columns', columns: [column], values: ['null'], value: share, rows: n, acts: ['incident', 'expected', 'rule', 'notify'] });
      continue;
    }
    out.push({ key: `new:${column}`, kind: 'new', severity: alert ? 'alert' : n >= M.newUnusual || n >= 0.001 * rows ? 'warn' : 'note', score: alert ? 60 : Math.min(99, n / Math.max(1, rows) * 1000), title: fresh.keys.length === 1 ? `New ${names.column(column)}: ${label(column, fresh.keys[0]!)} · ${fmtInt(n)} ${noun(n)}` : `New ${names.column(column)} values: ${fresh.keys.length} · ${fmtInt(n)} ${noun(n)}`, detail: `${listed(said)}${fresh.keys.length > 5 ? ` and ${fresh.keys.length - 5} more` : ''}: never in ${daysSeen(file, k)} days of history.`, look: 'columns', columns: [column], values: fresh.keys, rows: n, acts: alert ? ['incident', 'quarantine', 'notify'] : ['expected', 'quarantine', 'rule', 'notify'], ...(bad ? { bad: true } : {}) });
  }
  for (const [pair, vh] of Object.entries(file.pairs ?? {})) {
    const fresh = newOn(vh, k);
    if (!fresh) continue;
    const [a, b] = pair.split('|') as [string, string];
    // A combination with a value new itself is told with that value.
    const newA = new Set(newOn(file.values?.[a] ?? empty, k)?.keys ?? []);
    const newB = new Set(newOn(file.values?.[b] ?? empty, k)?.keys ?? []);
    const keys = fresh.keys.filter((key) => {
      const [x, y] = parse(key) as [unknown, unknown];
      return !newA.has(JSON.stringify(x)) && !newB.has(JSON.stringify(y));
    });
    const n = vh.fresh.find(([d]) => d === k)?.[1] ?? 0;
    if (!keys.length || (n < M.newRows && n < MATERIAL.newShare * rows)) continue;
    const said = keys.slice(0, 3).map((key) => {
      const [x, y] = parse(key) as [unknown, unknown];
      return `${names.column(a)} ${names.value(a, x)} with ${names.column(b)} ${names.value(b, y)}`;
    });
    out.push({ key: `pair:${pair}`, kind: 'pair', severity: n >= M.newUnusual || n >= 0.001 * rows ? 'warn' : 'note', score: Math.min(99, n / Math.max(1, rows) * 1000), title: `New pair: ${names.column(a)} with ${names.column(b)} · ${fmtInt(n)} ${noun(n)}`, detail: `${sentence(listed(said))}${keys.length > 3 ? ` and ${keys.length - 3} more` : ''}: never together in ${daysSeen(file, k)} days.`, look: 'columns', columns: [a, b], values: keys, rows: n, acts: ['expected', 'quarantine', 'rule', 'notify'] });
  }

  // Combinations (ADR 0013): a pair's cell against what its two columns alone predict, and the day as a whole against
  // the days before, by an isolation forest: checks discovered from the history, not written as rules.
  out.push(...comboNews(h, day, { names, M, label, noun }));
  // The forest speaks when nothing loud is said of the columns it would name: what it adds is the day no single
  // number flags.
  for (const f of unlikeNews(h, day, { names, label, noun })) {
    const loud = out.filter((x) => x.severity === 'alert' || x.severity === 'warn');
    if (!loud.some((x) => (x.columns ?? []).some((c) => f.columns?.includes(c)) || x.kind === 'volume' || x.kind === 'hours')) out.push(f);
  }

  // Shape: a measure's or a time's bottom tenth, median or top tenth moved.
  file.columns.forEach((column, c) => {
    if (file.kinds[c] !== 'measure' && file.kinds[c] !== 'time') return;
    // A coded column's values are told value by value, above: its quantiles only jump between them.
    if (file.values?.[column]?.counts) return;
    const time = file.kinds[c] === 'time';
    let best: { q: number; j: NonNullable<ReturnType<typeof judged>> } | null = null;
    for (const q of [3, 5, 1]) {
      const j = judged({ of: 'quantile', column, q });
      if (!j || !outside(j)) continue;
      // A quantile that takes only a few values over the weeks before (a toll, mostly none) moves by jumps, not shifts.
      const seen = new Set<number>();
      for (let i = 1; i <= 42; i++) {
        const v = j.ranges.value(plusDays(day, -i));
        if (v !== null) seen.add(v);
      }
      if (seen.size <= 4) continue;
      const moved = Math.abs(j.value - j.range.expected);
      if (time ? moved < MATERIAL.minutes : moved < MATERIAL.relative * Math.max(Math.abs(j.range.expected), 1e-9)) continue;
      if (!best || cap(j.d) > cap(best.j.d)) best = { q, j };
    }
    if (!best) return;
    const { q, j } = best;
    const up = j.value > j.range.expected;
    const at = (v: number) => (time ? clockText(v) : String(Number(v.toPrecision(3))));
    const which = q === 3 ? 'Half of them are under' : q === 5 ? 'The top tenth starts at' : 'The bottom tenth ends at';
    // A time's quantile is said as what it is: "90% before 12:54", never "they end by" (10% come later).
    const title = time
      ? `${sentence(names.column(column))}: ${q === 3 ? 'half' : q === 5 ? '90%' : '10%'} before ${at(j.value)} (usually ${at(j.range.low)}–${at(j.range.high)})`
      : `${sentence(names.column(column))}: the ${q === 5 ? 'highest tenth' : q === 1 ? 'lowest tenth' : 'middle'} ${up ? 'higher' : 'lower'}`;
    const far = time ? Math.abs(j.value - j.range.expected) >= 3 * MATERIAL.minutes : Math.abs(j.value - j.range.expected) >= 3 * MATERIAL.relative * Math.abs(j.range.expected);
    out.push(quiet({ key: `shape:${column}`, kind: 'shape', severity: far && q === 3 && Math.abs(j.d) >= 6 ? 'warn' : 'note', score: cap(j.d), title, detail: `${time ? `${Math.round(QUANTILES[q]! * 100)}% of them come before ${at(j.value)}` : `${which} ${at(j.value)}`}; a day like it has ${at(j.range.low)}–${at(j.range.high)}.`, look: 'columns', columns: [column], metric: { of: 'quantile', column, q }, value: j.value, range: j.range, acts: ['expected', 'rule'] }, j));
  });

  // What the checks drop, and which rules drop more or less than usual.
  if (options.checks !== false) {
    const dropped = judged({ of: 'dropped' });
    const rules = file.rules.map((r) => ({ r, j: judged({ of: 'rule', name: r.name }) })).filter((x) => x.j && outside(x.j) && Math.abs(x.j.value - x.j.range.expected) * rows >= M.rows);
    const ruleWords = rules.map(({ r, j }) => `${r.name} ${shareWords(j!.value, j!.range.low, j!.range.high).value}`);
    if (dropped && outside(dropped) && Math.abs(dropped.value - dropped.range.expected) * rows >= M.rows) {
      const more = dropped.value > dropped.range.expected;
      out.push(quiet({ key: 'dropped', kind: 'dropped', severity: dropped.value >= 2 * dropped.range.expected && dropped.value >= 0.1 ? 'alert' : 'warn', score: cap(dropped.d), title: `Checks dropped ${shareWords(dropped.value, dropped.range.low, dropped.range.high).value} (usually ${shareWords(dropped.value, dropped.range.low, dropped.range.high).range})`, detail: `A ${more ? 'larger' : 'smaller'} share than a day like it drops${ruleWords.length ? `; by rule, ${listed(ruleWords)}` : ''}.`, look: 'dropped', metric: { of: 'dropped' }, value: dropped.value, range: dropped.range, rows: Math.round(dropped.value * rows), acts: ['quarantine', 'rule', 'notify', 'expected'] }, dropped));
    } else {
      for (const { r, j } of rules) {
        out.push({ key: `rule:${r.name}`, kind: 'rule', severity: 'note', score: cap(j!.d), title: `${sentence(r.name)} rule: ${shareWords(j!.value, j!.range.low, j!.range.high).value} ${r.onFail === 'warn' ? 'flagged' : 'fail'} (usually ${shareWords(j!.value, j!.range.low, j!.range.high).range})`, detail: atShare(j!.value, j!.range.expected, rows, r.onFail === 'warn' ? 'flagged' : 'failed', noun()), look: 'dropped', metric: { of: 'rule', name: r.name }, value: j!.value, range: j!.range, acts: ['quarantine', 'rule', 'expected'] });
      }
    }
  }

  // The file's own columns changed this month: told on the month's first day.
  const month = day.slice(0, 7);
  const sm = file.schemas?.findIndex((x) => x.month === month) ?? -1;
  if (file.schemas && sm > 0 && day.endsWith('-01')) {
    const changes = schemaChanges(file.schemas[sm - 1]!.columns, file.schemas[sm]!.columns);
    if (changes.length) out.push({ key: 'schema', kind: 'schema', severity: 'note', score: changes.length, title: `Columns changed: ${schemaCount(changes)}`, detail: `${sentence(listed(changes))}. The loads are cast to the month's columns.`, look: 'columns', acts: ['expected', 'notify'] });
  }

  // The weather, as context: in the place the history names (ADR 0010 §8); the legacy form's is Manhattan.
  const w = file.weather;
  if (w) {
    const place = w.place ?? (judge.legacy ? 'Manhattan' : null);
    const inPlace = place ? ` in ${place}` : '';
    const snow = w.snow[k] ?? 0;
    const rain = w.precip[k] ?? 0;
    const gaps = w.boroughs.filter((_, b) => (w.hours[k]?.[b] ?? 24) < 24);
    // Whole degrees, rounded first: never "−0".
    const deg = (x: number) => String(Math.round(x) || 0);
    const temps = w.tmin[k] != null && w.tmax[k] != null ? `between ${deg(w.tmin[k]!)} and ${deg(w.tmax[k]!)} °C` : 'its temperatures not on record';
    if (snow >= 1) out.push({ key: 'weather', kind: 'weather', severity: 'note', score: snow, title: `Snow: ${snow.toFixed(1)} cm${inPlace}`, detail: `With ${rain.toFixed(1)} mm of rain and snow in all, ${temps}.`, look: 'history', acts: [] });
    else if (rain >= 15) out.push({ key: 'weather', kind: 'weather', severity: 'note', score: rain / 10, title: `Heavy rain: ${rain.toFixed(0)} mm${inPlace}`, detail: `${sentence(temps)}.`, look: 'history', acts: [] });
    else out.push({ key: 'weather', kind: 'weather', severity: 'ok', score: 0, title: rain >= 1 ? `Some rain: ${rain.toFixed(0)} mm${inPlace}` : `A dry day${inPlace}`, detail: `${sentence(temps)}${gaps.length ? '' : ', every district’s 24 hours on record'}.`, look: 'history', acts: [] });
    if (gaps.length) out.push({ key: 'weather-gaps', kind: 'weather', severity: 'note', score: 1, title: `The weather has hours missing`, detail: `${listed(gaps)}: fewer than 24 hours on record.`, look: 'history', acts: ['notify'] });
  }

  // The classifier (ADR 0014 §5, ADR 0015 §6): today's kept rows against the like days' rows of the sample, wherever a
  // sample is kept, unless a gate switches it off; told as unusual at most under the layer's defaults (learned), and
  // with no gate never more than unusual: a model warns, it doesn't hold. Nothing with too few rows a side.
  if (options.apart && (!judge.checks || judge.checks.classifier !== 'off')) {
    const { sample, today } = options.apart;
    const e = apartEvidence(sample, today, day, judge.pattern, (d) => h.learnsFrom(d));
    // Told at an AUC of 0.7 and four standard errors over chance (and over what random labels reach): `apartSpeaks`.
    const found = 'found' in e ? e.found : null;
    if (found && 'speaks' in e && e.speaks) {
      const top = found.columns.slice(0, 2);
      const share = Math.round(top.reduce((t, c) => t + c.share, 0) * 100);
      const said = top.map((c) => names.column(c.column)).join(' and ');
      out.push({
        key: 'apart', kind: 'apart', severity: judge.checks && found.z >= 6 && found.auc >= 0.8 ? 'alert' : 'warn', score: Math.min(99, found.z), title: `Rows unlike earlier days: AUC ${found.auc.toFixed(2)}`,
        detail: `${sentence(said)} explain ${share}% of what tells today’s ${noun()} from ${found.days} earlier days’ (${fmtInt(found.n)} a side; chance reaches ${found.floor.toFixed(2)}).`,
        look: 'rows', columns: top.map((c) => c.column), value: found.auc, rows: today.length, apart: found, acts: ['expected', 'notify'],
      });
    }
  }

  // The gate's rule on each finding (ADR 0014 §2, Q-114): under a check that warns, something wrong is unusual at most
  // (a value marked bad excepted); under one that is off, nothing is told; a flow with no gate is judged as it was.
  const passed = judge.checks ? out.map((f) => gated(f, judge.checks)).filter((f): f is Finding => f !== null) : out;
  // What follows from what (a feed that stopped skews the mix of values, the shapes, what the checks drop) is the
  // story's to tell: storyOf (story.ts) sorts these findings by what the day's cause explains.
  const told = together(passed, rows, names);
  told.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.score - a.score);
  if (!told.some((f) => f.severity === 'alert' || f.severity === 'warn')) {
    const note = namedOf(day, cal);
    const why = trips ? null : h.of({ of: 'trips' })?.explain(day) ?? null;
    if (why) {
      // Nothing to compare the day's rows with: not judged, never "normal" (ADR 0010 §1). Published, marked (Q-53).
      const name = why.special ? shortName(why.special).replace(/^Holiday season$/, 'holiday season') : '';
      const because = why.why === 'no last year' ? `the history has no ${name || 'day like it'} before this one to judge it by`
        : why.why === 'too few times' ? `the history has ${fmtInt(why.times ?? 0)} ${name} before this one, too few to judge it by`
        : why.why === 'last year moved' ? `last year’s ${name || 'day'} is too far from this year’s days to judge it by`
        : why.why === 'history ends' ? 'the history ends before it'
        : `${fmtInt(why.days)} ${why.days === 1 ? 'day' : 'days'} of history before it, too few to judge it by`;
      told.unshift({ key: 'unlearned', kind: 'unlearned', severity: 'ok', score: 0, title: 'Not judged yet', detail: `${fmtInt(rows)} ${noun(rows)}; ${because}.`, look: 'history', metric: { of: 'trips' }, value: rows, rows, why, acts: [] });
    } else told.unshift({ key: 'calm', kind: 'calm', severity: 'ok', score: 0, title: 'Nothing out of the ordinary', detail: trips ? `${fmtInt(trips.value)} ${noun(trips.value)}, normal for ${note ?? 'a day like it'} (${fmtInt(trips.range.low)} to ${fmtInt(trips.range.high)}).` : 'Every value, column and check as a day like it has them.', look: 'history', metric: trips ? { of: 'trips' } : undefined, value: trips?.value, range: trips?.range, acts: [] });
  }
  return told;
}

const empty: ValueHistory = { values: [], first: [], last: [], days: [], rows: [], fresh: [] };

/**
 * What a table holds as it is now, for an input or a step the history does not follow: told from the rows themselves,
 * the facts the app measures on the day's run.
 */
export interface TableFacts {
  /** What its rows are, said: "zones", "rows". */
  noun: string;
  rows: number;
  columns: { name: string; present: number; distinct: number; added?: boolean }[];
  /** The columns a join reads it by, together, with the join: their values together should be on one row only, or the
   * join multiplies rows; with the rows that have them all, and how many different ones those have. */
  keys: { columns: string[]; by: string; present: number; distinct: number }[];
  /** Joins reading this table whose other side finds no row here: their rows, and of how many; or, on a join's own
   * card (`own`, the table it looks rows up in), its rows that find no match there. */
  unmatched: { by: string; column: string; rows: number; of: number; own?: string }[];
  /** Values that stand for no value ("Unknown", "N/A"), by column, with their rows; and the steps that leave them out. */
  placeholders: { column: string; value: string; rows: number }[];
  /** Rows with a placeholder anywhere, and whether the sample was every row (else the counts are the sample's, scaled). */
  placeholderRows: number;
  exact: boolean;
  handledBy: string[];
  /** Whether its columns come from a file (every column told when empty) or a step (only the columns it adds). */
  input: boolean;
}

/** Values that stand for no value: a lookup's "Unknown", a form's "N/A". Case and spaces aside. */
export const PLACEHOLDERS = new Set(['unknown', 'n/a', 'na', 'nv', 'none', 'null', 'nil', '-', '--', '?', 'tbd', 'undefined', 'not available', 'missing', '']);
export const isPlaceholder = (v: unknown) => typeof v === 'string' && PLACEHOLDERS.has(v.trim().toLowerCase());

/** A table's news from its own rows: keys that repeat, rows a join finds no match for, placeholder rows, empty columns. */
export function tableNewsOf(f: TableFacts, names: Names): Finding[] {
  const out: Finding[] = [];
  const about = (n: number) => `${f.exact ? '' : 'about '}${fmtInt(n)}`;
  for (const { columns, by, present, distinct } of f.keys) {
    const said = listed(columns.map(names.column));
    const one = columns.length === 1;
    const repeats = present - distinct;
    if (repeats > 0) out.push({ key: `key:${columns.join(',')}`, kind: 'key', severity: 'warn', score: Math.min(99, (repeats / Math.max(1, present)) * 100), title: `${sentence(said)} ${one ? 'repeats' : 'together repeat'}: ${fmtInt(distinct)} ${one ? 'values' : 'combinations'} on ${fmtInt(present)} ${f.noun}`, detail: `${by} reads it by ${said}, so a row there that finds two ${f.noun} here comes out twice. A lookup's key is on one row each.`, look: 'columns', columns, rows: repeats, acts: ['notify', 'expected'] });
    if (present < f.rows) out.push({ key: `key-empty:${columns.join(',')}`, kind: 'key', severity: 'warn', score: 10, title: `${fmtInt(f.rows - present)} ${f.noun} without ${one ? `a ${said}` : `all of ${said}`}`, detail: `${by} reads it by ${said}: a row without ${one ? 'one' : 'them all'} is never found.`, look: 'columns', columns, values: ['null'], rows: f.rows - present, acts: one ? ['notify', 'rule', 'expected'] : ['notify', 'expected'] });
  }
  for (const u of f.unmatched) {
    if (u.rows <= 0) continue;
    const share = u.rows / Math.max(1, u.of);
    const severity: Severity = share >= MATERIAL.share && u.rows >= MATERIAL.rows ? 'warn' : 'note';
    if (u.own) out.push({ key: `unmatched:${u.by}`, kind: 'unmatched', severity, score: Math.min(99, share * 100), title: `${fmtInt(u.rows)} of ${fmtInt(u.of)} rows find no match in ${u.own}`, detail: `Their ${names.column(u.column)} is not among ${u.own}’s (${pct(share)} of them): ${u.own}’s columns are empty on them.`, look: 'dropped', columns: [u.column], rows: u.rows, acts: ['notify', 'rule', 'expected'] });
    else out.push({ key: `unmatched:${u.by}`, kind: 'unmatched', severity, score: Math.min(99, share * 100), title: `${fmtInt(u.rows)} of ${u.by}’s ${fmtInt(u.of)} rows find no row here`, detail: `Their ${names.column(u.column)} is not among this table’s (${pct(share)} of them). ${u.by} keeps them, with this table’s columns empty.`, look: 'rows', columns: [u.column], rows: u.rows, acts: ['notify', 'rule', 'expected'] });
  }
  if (f.placeholderRows > 0) {
    const by = new Map<string, string[]>();
    for (const p of f.placeholders) by.set(p.column, [...(by.get(p.column) ?? []), `${p.value === '' ? 'an empty text' : `“${p.value}”`} (${about(p.rows)})`]);
    const said = [...by].map(([c, vs]) => `${names.column(c)} ${listed(vs)}`);
    const handled = f.handledBy.length ? ` ${listed(f.handledBy)} ${f.handledBy.length === 1 ? 'leaves' : 'leave'} them out.` : ' Nothing in the flow leaves them out: a step that reads them shows them as if they were real.';
    out.push({ key: 'placeholder', kind: 'placeholder', severity: 'note', score: 1, title: `${about(f.placeholderRows)} ${f.placeholderRows === 1 ? 'row is a placeholder' : `${f.noun} are placeholders`}, not real ${f.noun}`, detail: `${sentence(listed(said))}: values that stand for no value.${handled}`, look: 'rows', columns: [...by.keys()], values: f.placeholders.map((p) => JSON.stringify(p.value)), rows: f.placeholderRows, acts: f.handledBy.length ? ['expected'] : ['quarantine', 'expected'] });
  }
  const told = new Set(f.keys.flatMap((k) => k.columns.map((c) => c.toLowerCase())));
  const lookedUp = f.unmatched.filter((u) => u.own && u.rows > 0).map((u) => u.rows);
  for (const c of f.columns) {
    if (told.has(c.name.toLowerCase()) || c.present >= f.rows || (!f.input && !c.added)) continue;
    const missing = f.rows - c.present;
    // A join's looked-up column, empty on just the rows that found no match: told by that finding.
    if (c.added && lookedUp.includes(missing)) continue;
    out.push({ key: `empty:${c.name}`, kind: 'empty', severity: c.present === 0 ? 'warn' : 'note', score: (missing / Math.max(1, f.rows)) * 10, title: c.present === 0 ? `${sentence(names.column(c.name))} is empty on every row` : `${sentence(names.column(c.name))} empty on ${pct(missing / f.rows)} of ${f.noun}`, detail: c.added ? `${fmtInt(missing)} of ${fmtInt(f.rows)}: this step gives no value for them, from what it reads.` : `${fmtInt(missing)} of ${fmtInt(f.rows)} come without one.`, look: 'columns', columns: [c.name], values: ['null'], rows: missing, acts: c.added ? ['expected'] : ['expected', 'rule', 'notify'] });
  }
  out.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.score - a.score);
  if (!out.some((x) => x.severity === 'alert' || x.severity === 'warn')) {
    const rest = [
      ...f.keys.map((k) => `each ${listed(k.columns.map(names.column))} once${k.columns.length > 1 ? ' together' : ''}`),
      ...f.unmatched.filter((u) => u.rows === 0).map((u) => (u.own ? `every row finds its match in ${u.own}` : `every row of ${u.by} finds its row here`)),
    ];
    out.unshift({ key: 'calm', kind: 'calm', severity: 'ok', score: 0, title: 'Nothing out of the ordinary', detail: `${fmtInt(f.rows)} ${f.noun}${rest.length ? `: ${listed(rest)}` : ''}.`, look: 'columns', rows: f.rows, acts: [] });
  }
  return out;
}

/** The values first seen on a day (after the history's first weeks), and their rows that day when counted daily. */
function newOn(vh: ValueHistory, k: number): { keys: string[]; rows?: number } | null {
  const keys = vh.values.filter((_, i) => vh.first[i] === k);
  if (!keys.length || !vh.fresh.some(([d]) => d === k)) return null;
  const rows = vh.counts ? keys.reduce((t, key) => t + (vh.counts![k]![vh.values.indexOf(key)] ?? 0), 0) : undefined;
  return { keys, rows };
}

const daysSeen = (file: { days: string[] }, k: number) => fmtInt(k);

/**
 * Hours short of trips: under a quarter of what a day like it has in an hour that usually has a few hundred, two hours
 * or more in a row. What a day like it has in an hour: its expected trips, shared out as the same weekday's ordinary
 * days of the six weeks before share theirs (their median share, hour by hour).
 */
/**
 * Trips by pickup hour on a day like this one: its expected trips, shared out as the same weekday's ordinary days of
 * the six weeks before share theirs (their median share, hour by hour). Null with too few such days.
 */
export function usualHours(h: HistoryRanges, k: number, expected: number): number[] | null {
  const file = h.file;
  const day = file.days[k];
  if (!day) return null;
  // A day's 24 hours, or a slot's own parts (ADR 0010 §7, `slotSeries`).
  const n = file.parts ? (file.hours[k]?.length ?? 0) : 24;
  if (n === 0) return null;
  const shares: number[][] = Array.from({ length: n }, () => []);
  // The same weekday's hours lately; under the patterns none and monthly, the days before, whatever the weekday.
  const step = h.pattern === 'weekly' ? 7 : 1;
  for (let w = 1; w <= (step === 7 ? 10 : 28) && shares[0]!.length < 6; w++) {
    const d = plusDays(day, -step * w);
    const j = file.days.indexOf(d);
    if (j < 0 || specialOf(d, h.calendar) || !file.rows[j] || !file.hours?.[j] || file.hours[j]!.length !== n) continue;
    file.hours[j]!.forEach((x, hr) => shares[hr]!.push(x / file.rows[j]!));
  }
  if (shares[0]!.length < 3) return null;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
  return shares.map((xs) => median(xs) * expected);
}

export function hoursShort(h: HistoryRanges, k: number, expected: number, material: typeof MATERIAL = MATERIAL, names: Pick<Names, 'noun'> = {}): Finding | null {
  const file = h.file;
  const want = usualHours(h, k, expected);
  if (!want || !file.hours?.[k]) return null;
  const got = file.hours[k]!;
  const noun = (n?: number) => nounFor(names, n);
  // A day's parts are its hours; a slot's its own hours or quarter hours (ADR 0010 §7): the floor that makes a part count
  // is a part's share of the hour's.
  const { start, width } = file.parts ?? { start: 0, width: 60 };
  const last = got.length - 1;
  const floor = material.hourRows * (width / 60);
  const short = got.map((n, hr) => want[hr]! >= floor && n < material.hourShare * want[hr]!);
  // The longest run of short parts.
  let best = [0, -1];
  for (let a = 0; a <= last; a++) {
    if (!short[a]) continue;
    let b = a;
    while (b + 1 <= last && (short[b + 1] || want[b + 1]! < floor)) b++;
    while (b > a && !short[b]) b--;
    if (b - a > best[1]! - best[0]!) best = [a, b];
    a = b;
  }
  const [a, b] = best as [number, number];
  // Two hours or more in a row: two parts of an hour, or eight of a quarter hour.
  if ((b - a + 1) * width < 120) return null;
  const had = got.slice(a, b + 1).reduce((t, n) => t + n, 0);
  const usual = want.slice(a, b + 1).reduce((t, n) => t + n, 0);
  const from = start + a * width;
  const to = start + (b + 1) * width;
  const slot = !!file.parts;
  // A slot whose every part is short is a gap in the day, whatever its ends; a day's runs to its end or from its start
  // say so.
  const toEnd = b === last && !slot;
  const fromStart = a === 0 && !slot;
  const span = toEnd ? `from ${clockText(from)} on` : fromStart ? `until ${clockText(to)}` : `from ${clockText(from)} to ${clockText(to)}`;
  // Pickup times, not arrival times: the trips fall to a trickle, they don't end (Sep 21, 2023: 3,679 after 13:00).
  const fall = Math.round((1 - had / Math.max(1, usual)) * 100);
  return {
    key: 'hours', kind: 'hours', severity: 'alert', score: 50 + (b - a) * (width / 60),
    title: toEnd ? `${sentence(noun())} fall ${fall}% from ${clockText(from)}` : fromStart ? `${sentence(noun())} start late, at ${clockText(to)}` : `Gap in ${noun()}, ${clockText(from)}–${clockText(to)}`,
    detail: `${fmtInt(had)} ${noun(had)} ${span}, where ${slot ? 'a slot' : 'a day'} like it has about ${fmtInt(usual)}.`,
    look: 'history', rows: Math.round(usual - had), acts: ['incident', 'notify', 'expected'],
    hours: { got: [...got], usual: want.map((x) => Math.round(x)), from: a, to: b, fall, ...(slot ? { start, width } : {}) },
  };
}

/** Changes between two months' columns, said: renamed (in case only), retyped, added, gone. */
export function schemaChanges(before: readonly [string, string][], after: readonly [string, string][]): string[] {
  const out: string[] = [];
  const was = new Map(before.map(([n, t]) => [n.toLowerCase(), [n, t] as const]));
  const now = new Map(after.map(([n, t]) => [n.toLowerCase(), [n, t] as const]));
  for (const [key, [n, t]] of now) {
    const old = was.get(key);
    if (!old) out.push(`${n} is new (${t})`);
    else {
      if (old[0] !== n) out.push(`${old[0]} is now ${n}`);
      if (old[1] !== t) out.push(`${n} is now ${t}, not ${old[1]}`);
    }
  }
  for (const [key, [n]] of was) if (!now.has(key)) out.push(`${n} is gone`);
  return out;
}

/** Schema changes counted, for a short title: "1 added, 4 retyped". */
function schemaCount(changes: readonly string[]): string {
  const n = (re: RegExp) => changes.filter((c) => re.test(c)).length;
  const parts = [[n(/ is new /), 'added'], [n(/ is gone$/), 'removed'], [n(/ is now [^,]+, not /), 'retyped'], [n(/ is now [^ ,]+$/), 'renamed']] as const;
  return parts.filter(([k]) => k > 0).map(([k, w]) => `${k} ${w}`).join(', ') || `${changes.length} changes`;
}

/**
 * Findings that are likely one thing seen through several columns, told once: the same number of trips (within a
 * fiftieth) moving the same way, such as the trips that come without a passenger count, a rate code, a surcharge and
 * an airport fee together. Told by the value that names them, when one isn't a blank ("Payment type Flex Fare trip:
 * 5.3% (usually 2.1–4.6%)", the others blank on the same trips), with its own numbers; else as the fields blank.
 */
function together(findings: Finding[], rows: number, names: Names): Finding[] {
  const groupable = (f: Finding) => (f.kind === 'share' || f.kind === 'missing' || f.kind === 'gone') && f.rows !== undefined && f.rows > 0 && f.range !== undefined && f.value !== undefined;
  const out: Finding[] = [];
  const used = new Set<Finding>();
  for (const f of findings) {
    if (used.has(f)) continue;
    used.add(f);
    if (!groupable(f)) {
      out.push(f);
      continue;
    }
    const up = f.value! > f.range!.expected;
    const same = findings.filter((g) => !used.has(g) && groupable(g) && (g.value! > g.range!.expected) === up && Math.abs(g.rows! - f.rows!) <= 0.02 * Math.max(f.rows!, g.rows!));
    if (!same.length) {
      out.push(f);
      continue;
    }
    for (const g of same) used.add(g);
    const all = [f, ...same];
    const isBlank = (g: Finding) => g.values?.[0] === 'null';
    const best = (xs: Finding[]) => xs.reduce((a, b) => (b.score > a.score ? b : a));
    const named = all.filter((g) => !isBlank(g));
    // The member the group is told by: the value that names its trips, else the blank most out of the ordinary.
    const lead = named.length ? best(named) : best(all);
    const others = all.filter((g) => g !== lead);
    const blankOthers = others.every(isBlank);
    const said = (g: Finding) => (isBlank(g) ? names.column(g.columns![0]!) : `${names.column(g.columns![0]!)} ${names.value(g.columns![0]!, parse(g.values![0]!))}`);
    const w = shareWords(lead.value!, lead.range!.low, lead.range!.high);
    const fits = (text: string, short: string) => (text.split(/\s+/).length <= 20 ? text : short);
    out.push({
      ...lead,
      key: `together:${all.map((g) => g.key).sort().join(',')}`,
      severity: all.some((g) => g.severity === 'alert') ? 'alert' : best(all).severity,
      score: best(all).score,
      title: named.length ? lead.title : `${all.length} fields blank: ${w.value} (usually ${w.range})`,
      detail: named.length
        ? fits(`${sentence(listed(others.map(said)))} ${blankOthers ? 'blank on' : 'moved with it:'} the same ${nounFor(names)}, likely.`, `${others.length} more ${blankOthers ? 'fields blank on' : 'values moved with it:'} the same ${nounFor(names)}, likely.`)
        : fits(`${sentence(listed(all.map(said)))}: blank on the same ${nounFor(names)}, likely.`, `Blank on the same ${nounFor(names)}, likely.`),
      columns: all.flatMap((g) => g.columns ?? []),
      values: all.flatMap((g) => g.values ?? []),
      members: [lead, ...others].map((g) => ({ column: g.columns![0]!, value: g.values![0]!, label: g.values?.[0] === 'null' ? 'blank' : (names.label ?? names.value)(g.columns![0]!, parse(g.values![0]!)), share: g.value!, range: g.range!, rows: g.rows! })),
    });
  }
  void rows;
  return out;
}
