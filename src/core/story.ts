/**
 * A day's story (ADR 0008): the day's news told as one cause and what follows from it, so a screen can draw it instead
 * of listing it. newsOf (news.ts) finds what is out of the ordinary; storyOf says what it adds up to:
 *
 * - the cause, as a population or a time: the part of the trips that held and the part that moved (a split: on Fri Sep
 *   22, 2023 the Flex Fare trips arrived as usual and every other trip almost stopped), the hour the trips fall, or an
 *   amount with no part to blame;
 * - the gate: whether the flow's checks would hold the run, with the rows they drop against the rows a day like it drops
 *   (a share past its limit because the kept rows are missing reads differently from one past it because bad rows came);
 * - every finding sorted by what the cause explains: absorbed (it restates the cause), follows (the cause predicts its
 *   count), same day (untested, or the prediction missed, but no bigger than what the cause moved), standalone. New
 *   values, new pairs, schema changes and integrity never fold;
 * - the episode it is part of (day 2 since Thu 13:00), or the recovery after one;
 * - its head, chips and labels, short enough to count: the screen's words come from here.
 *
 * Severity is carried through: a folded finding is told as a note, with what it was kept. No DOM, no engine.
 */
import { holidayOf, plusDays, seasonOf } from './calendar.js';
import { QUANTILES, type HistoryRanges } from './history.js';
import { MATERIAL, hoursShort, shareWords, type Act, type Finding, type Names, type Severity } from './news.js';

/** Rows today against the rows a day like it has: `usual` is the guess; `low` and `high` its range, when it has one. */
export interface Count {
  today: number;
  usual: number;
  low: number | null;
  high: number | null;
}

/** The part of the day's trips with one coded value, against everything else, when one held and the other moved. */
export interface Split {
  column: string;
  value: string;
  /** What the part is called: "Flex Fare", "Vendor 1", "Extras $0.50"; `trips` when it reads as a kind of trip. */
  name: string;
  trips: boolean;
  /** Who a code names, when its name is only the column and the code: "Creative Mobile" for "Vendor 1". */
  who?: string;
  /** What the named part did: kept to its usual count while the rest moved, or fell away, or surged, while the rest held. */
  kind: 'held' | 'vanished' | 'surged';
  part: Count;
  rest: Count;
  /** Columns blank on the part's rows (its count of blanks is the part's count): the same trips, said once. */
  blank: string[];
  /** Found through its blanks (a value and the fields blank on its rows, moving together), not by the split's own
   * test: the population a finding of that value is about, told as the day's cause by its share. */
  via?: 'blanks';
}

/** The flow's checks on the day: the share they drop against their limit, and the rows against a day like it. */
export interface Gate {
  step: string;
  rows: number;
  dropped: number;
  share: number;
  limit: number | null;
  held: boolean;
  /** Not held, but within a point of its limit: shown, as a near miss is worth seeing. */
  near: boolean;
  usual: { expected: number; low: number; high: number } | null;
  rules: { name: string; warns: boolean; rows: number; share: number; usual: { low: number; high: number } | null }[];
}

export type Tier = 'cause' | 'absorbed' | 'follows' | 'sameDay' | 'standalone' | 'note';

/** A finding as the story tells it: its tier, its severity as told, and what it was before it was folded. */
export interface Told extends Finding {
  tier: Tier;
  was: Severity;
  /** Marked as expected on this day by a person: told among the notes, never as calm. */
  acknowledged?: boolean;
  /** For a folded value finding: the count the cause predicts, when it could be tested. */
  predicted?: number;
}

export type Hero = 'split' | 'hours' | 'amount' | 'gate' | 'finding' | 'calm' | 'refused';
export type Cell = 'file' | 'amount' | 'hours' | 'values' | 'shape';

export interface Story {
  day: string;
  state: 'calm' | 'notes' | 'unusual' | 'wrong' | 'refused' | 'recovery';
  severity: Severity;
  head: string;
  chip: string | null;
  hero: Hero;
  /** The day's count and its usual range; `change`, how far it is from the guess when it is outside that range. */
  amount: { value: number; low: number; high: number; expected: number; change: number | null } | null;
  split: Split | null;
  hours: Finding['hours'] | null;
  /** The hour chart's words: the first short hour, the trips an hour after it, the trips missing, the ghost's day. */
  hoursLabels: { cut: string; floor: string; missing: string; ghost: string } | null;
  gate: Gate | null;
  /** The finding the head is about, when there is one. */
  cause: Told | null;
  /** Up to two standalone findings that are something wrong or unusual, after the cause; `more`, the rest of them. */
  stories: Told[];
  more: Told[];
  follows: Told[];
  sameDay: Told[];
  absorbed: Told[];
  notes: Told[];
  /** Weather worth knowing on the day: context, never a reason. */
  context: Told | null;
  episode: { days: number; since: string; hour: number | null } | null;
  /** The episode a calm day comes after: its days, those the checks held (never published) and the rest (published
   * short), and what it was. */
  recovery: { from: string; to: string; held: string[]; published: string[]; name: string | null } | null;
  health: { cell: Cell; severity: Severity | null; explained: boolean; follows: number; sameDay: number }[];
  primary: Act | null;
  /** Labels the screen shows at a glance, so their words can be counted: rows, chips, the hero's marks. */
  labels: { amount: string[]; hero: string[]; follows: string | null; sameDay: string | null; notes: string | null; more: string | null; primary: string | null; kinds: string[]; after: string | null; key: string[] };
  findings: Told[];
}

export interface StoryOptions {
  names: Names;
  /** The checks: their step, and the most they may drop (a share), when the flow has a limit. */
  step?: string;
  limit?: number | null;
  /** The run on this load stopped at the gate, when the app knows (else judged from the history and the limit). */
  held?: boolean;
  /** The day's file was refused: its bytes don't match the published list. */
  refused?: boolean;
  /** Findings marked as expected on this day, by key. */
  acknowledged?: ReadonlySet<string>;
  /** Columns the viewer's policy removes: no finding, split or prediction is told from them. */
  hidden?: ReadonlySet<string>;
  /** Whether to look at the days before for an episode or a recovery (default true; a calendar of every day skips it). */
  episode?: boolean;
}

export const ACT_VERB: Record<Act, string> = {
  expected: 'OK this day',
  incident: 'Open an incident',
  notify: 'Tell the source',
  rule: 'Add a check',
  quarantine: 'Set aside',
  refetch: 'Fetch again',
  export: 'Export for audit',
};

const RANK: Record<Severity, number> = { alert: 0, warn: 1, note: 2, ok: 3 };
const VALUE_KINDS = new Set<Finding['kind']>(['gone', 'share', 'missing']);
const NEVER_FOLD = new Set<Finding['kind']>(['new', 'pair', 'schema', 'integrity', 'weather', 'calm']);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_HOLIDAY: Record<string, string> = { 'Martin Luther King Jr. Day': 'MLK Day', 'Day after Thanksgiving': 'Black Friday', 'Independence Day week': 'July 4th week', 'Day before Thanksgiving': 'Thanksgiving Eve' };
const worst = (xs: readonly Severity[]): Severity => xs.reduce<Severity>((a, b) => (RANK[b] < RANK[a] ? b : a), 'ok');
const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A day's change against its guess, as the amount line says it: "−65%", "+29%". */
export const changeLabel = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;

/** A count said short: 20, 4,613, 4.8k, 110k, 1.2M. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (a < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A count said short but fine enough to subtract from another: 68.5k (not 68k beside a +2k), 4.8k, 110k. */
export function approx(n: number): string {
  const a = Math.abs(n);
  return a >= 10_000 && a < 100_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : compact(n);
}

/** A part's count against its usual one, so it can't read as a fraction of it: "10,518 · usual ~4.5k". */
export const countLabel = (c: Count) => `${fmtInt(c.today)} · usual ~${approx(c.usual)}`;

/** The split's part as its visuals name it: its name, and who a code names beside it ("Vendor 1 · Creative Mobile"). */
export const partLabel = (sp: Pick<Split, 'name' | 'who'>) => (sp.who ? `${sp.name} · ${sp.who}` : sp.name);

/** A strip of days' key, where it is first shown: each day's usual range as a box, and what it had as a tick. */
export const STRIP_KEY = ['usual', 'actual'] as const;

/** A share as a percentage that keeps the decimals showing which side of the limit it is on: "10.45%" against 10%. */
export function pastLimit(x: number, limit: number | null): string {
  if (limit === null) return `${Math.round(x * 100)}%`;
  for (let d = 0; d <= 3; d++) {
    const shown = Number((x * 100).toFixed(d));
    if ((x > limit) === (shown > limit * 100) && shown !== limit * 100) return `${(x * 100).toFixed(d)}%`;
  }
  return `${(x * 100).toFixed(3)}%`;
}

/** How close to its limit a share has to be for the gate to be drawn zoomed, with its margin said (two points). */
export const NEAR_LIMIT = 0.02;

/**
 * The checks' words (ADR 0008), one per bar so neither reads as the other: the share of the rows that arrived that they
 * dropped ("46% of arrived rows dropped"), the limit, how far from it within two points ("0.45 pt over"), and the rows
 * they dropped against the rows a day like it drops ("2,116 rows dropped", "usual 3.2k–7.7k").
 */
export function gateLabels(g: Gate): { share: string; limit: string | null; margin: string | null; rows: string; usual: string | null } {
  const off = g.limit === null ? null : g.share - g.limit;
  const pts = off === null ? 0 : Math.abs(off) * 100;
  const near = off !== null && off !== 0 && Math.abs(off) <= NEAR_LIMIT;
  // Near the limit, the share and its margin are said to the same decimals, so one is the other less the limit.
  let dec = pts < 1 ? 2 : 1;
  while (near && Number(pts.toFixed(dec)) === 0 && dec < 4) dec++;
  const share = near ? `${(g.share * 100).toFixed(dec)}%` : pastLimit(g.share, g.limit);
  return {
    share: `${share} of arrived rows dropped`,
    limit: g.limit !== null ? `limit ${Math.round(g.limit * 100)}%` : null,
    margin: near ? `${pts.toFixed(dec)} pt ${off! > 0 ? 'over' : 'under'}` : null,
    rows: `${fmtInt(g.dropped)} rows dropped`,
    usual: g.usual ? `usual ${compact(g.usual.low)}–${compact(g.usual.high)}` : null,
  };
}

/** A company's name said short, legal form and all but its first two words left off: "Creative Mobile". */
export function shortWho(name: string): string {
  return name.replace(/,?\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|Corp\.?|Co\.?|Company)$/i, '').split(/\s+/).slice(0, 2).join(' ');
}

/** Words as the screen's budgets count them: whitespace tokens with a letter or a digit in them. */
export function wordsIn(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * What a coded value's part is called in a head, and whether it reads as a kind of trip: a code's short meaning is one
 * ("Flex Fare" trips, "Cash" trips); anything else is said with its column ("Extras $0.50", "Vendor 1").
 */
function partName(column: string, value: string, names: Names): { name: string; trips: boolean; who?: string } {
  const parsed = (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })();
  if (/vendor/i.test(column)) {
    // A vendor is said by its code, as the files and the TLC say it, and named beside it: "Vendor 1 · Creative Mobile".
    const meant = names.label?.(column, parsed);
    return { name: `Vendor ${String(parsed)}`, trips: true, ...(meant && meant !== String(parsed) ? { who: shortWho(meant) } : {}) };
  }
  const label = (names.label ?? names.value)(column, parsed).replace(/\s+trips?$/i, '');
  const meaning = label !== String(parsed) && !/^\$?-?[\d.,]+$/.test(label);
  return meaning && wordsIn(label) <= 3 ? { name: label, trips: true } : { name: `${names.column(column)} ${label.length <= 8 ? label : String(parsed)}`, trips: false };
}

/**
 * The part that held and the part that moved, when one coded value's trips and everything else's went different ways:
 * one side within two thirds to one and a half of its usual count, the other off by twice or more, the moved side
 * carrying at least 40% of the day's change and 200 trips. The named side is the smaller one, and never a blank, so a
 * head names a population ("Flex Fare") and not its symptom ("Stored and forwarded N"). Null when nothing stands out.
 */
export function splitOf(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string> = new Set()): Split | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  const range = h.of({ of: 'trips' })?.at(day);
  if (k < 0 || !range) return null;
  const n = file.rows[k]!;
  const E = range.expected;
  const change = n - E;
  const steady = (r: number) => r >= 2 / 3 && r <= 1.5;
  let best: { column: string; value: string; kind: Split['kind']; nv: number; Ev: number; score: number } | null = null;
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts || hidden.has(column.toLowerCase())) continue;
    vh.values.forEach((value, i) => {
      if (value === 'null') return;
      const share = h.of({ of: 'value', column, value })?.at(day)?.expected;
      if (share === undefined) return;
      const Ev = share * E;
      if (Ev < 200 || Ev > E - Ev) return;
      const nv = vh.counts![k]![i] ?? 0;
      const rs = nv / Ev;
      const rr = (n - nv) / Math.max(1, E - Ev);
      const apart = Math.abs(Math.log((rs + 1e-4) / (rr + 1e-4))) >= Math.log(2);
      if (!apart) return;
      const dv = nv - Ev;
      const dr = n - nv - (E - Ev);
      let kind: Split['kind'] | null = null;
      if (steady(rr) && Math.abs(dv) >= 0.4 * Math.abs(change) && Math.abs(dv) >= 200) kind = rs < rr ? 'vanished' : 'surged';
      else if (steady(rs) && Math.abs(dr) >= 0.4 * Math.abs(change) && Math.abs(dr) >= 200) kind = 'held';
      if (!kind) return;
      const score = Math.abs(Math.log((rs + 1e-4) / (rr + 1e-4)));
      if (!best || score > best.score) best = { column, value, kind, nv, Ev, score };
    });
  }
  const b = best as { column: string; value: string; kind: Split['kind']; nv: number; Ev: number } | null;
  return b ? splitWith(h, day, names, hidden, b) : null;
}

/** The split for one coded value, its kind and counts decided. */
function splitWith(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string>, b: { column: string; value: string; kind: Split['kind']; nv: number; Ev: number }): Split {
  const file = h.file;
  const k = file.days.indexOf(day);
  const n = file.rows[k]!;
  const E = h.of({ of: 'trips' })!.at(day)!.expected;
  // Its usual count is the one the split was judged on (its usual share of the trips a day like it has); its count's
  // own range is drawn when that range is about the same day (a new tariff's count has no usual yet).
  const counted = h.of({ of: 'count', column: b.column, value: b.value })?.at(day);
  const usual = b.Ev;
  const near = counted && counted.expected > usual / 2 && counted.expected < usual * 2;
  // Columns blank on the part's rows: their blanks number the part's rows, give or take a fiftieth of the day.
  const blank: string[] = [];
  if (b.kind !== 'vanished' && b.nv > 0) {
    for (const [column, vh] of Object.entries(file.values ?? {})) {
      const at = vh.values.indexOf('null');
      if (column === b.column || at < 0 || !vh.counts || hidden.has(column.toLowerCase())) continue;
      if (Math.abs((vh.counts[k]![at] ?? 0) - b.nv) <= 0.02 * n) blank.push(names.column(column));
    }
  }
  const named = partName(b.column, b.value, names);
  return {
    column: b.column,
    value: b.value,
    name: named.name,
    trips: named.trips,
    ...(named.who ? { who: named.who } : {}),
    kind: b.kind,
    part: { today: b.nv, usual, low: near ? counted!.low : null, high: near ? counted!.high : null },
    rest: { today: n - b.nv, usual: Math.max(0, E - usual), low: null, high: null },
    blank,
  };
}

/**
 * A coded value's count on a day like it: its count's own range, or, where that has none (a holiday whose count moved
 * too far since last year to be judged by it: New Year's Day 2024's Flex Fare trips), its share's range of the trips a
 * day like it has, which is the count a split is judged on (ADR 0008 §2). Null when neither has a range.
 */
export function countRange(h: HistoryRanges, column: string, value: string, day: string): { low: number; high: number; expected: number } | null {
  const own = h.of({ of: 'count', column, value })?.at(day);
  if (own) return { low: own.low, high: own.high, expected: own.expected };
  const share = h.of({ of: 'value', column, value })?.at(day);
  const trips = h.of({ of: 'trips' })?.at(day);
  return share && trips ? { low: share.low * trips.expected, high: share.high * trips.expected, expected: share.expected * trips.expected } : null;
}

/**
 * The population a value and the fields blank on its rows are (a finding told together: payment type 0 with five
 * fields blank, Mon Sep 18, 2023's Flex Fare trips at 5.3% of the day where 2.1–4.6% is usual), as a split: its trips
 * against everything else's, when everything else kept to its usual count and the part moved by 200 trips or more.
 * That finding has already judged the part out of the ordinary, so the split's own test of twice apart isn't asked
 * again. Null when it doesn't hold.
 */
export function populationOf(h: HistoryRanges, day: string, names: Names, f: Finding, hidden: ReadonlySet<string> = new Set()): Split | null {
  const ms = f.members ?? [];
  const coded = ms.filter((m) => m.value !== 'null');
  if (ms.length < 2 || coded.length !== 1) return null;
  const { column, value } = coded[0]!;
  const file = h.file;
  const k = file.days.indexOf(day);
  const range = h.of({ of: 'trips' })?.at(day);
  const vh = file.values?.[column];
  const share = h.of({ of: 'value', column, value })?.at(day)?.expected;
  if (k < 0 || !range || !vh?.counts || share === undefined || hidden.has(column.toLowerCase())) return null;
  const at = vh.values.indexOf(value);
  if (at < 0) return null;
  const n = file.rows[k]!;
  const E = range.expected;
  const Ev = share * E;
  const nv = vh.counts[k]![at] ?? 0;
  const rr = (n - nv) / Math.max(1, E - Ev);
  if (Ev < 1 || Ev > E - Ev || rr < 2 / 3 || rr > 1.5 || Math.abs(nv - Ev) < 200) return null;
  return { ...splitWith(h, day, names, hidden, { column, value, kind: nv > Ev ? 'surged' : 'vanished', nv, Ev }), via: 'blanks' };
}

/** The checks on the day, from the history: the share and the rows they drop, by rule, against a day like it. */
export function gateOf(h: HistoryRanges, day: string, step: string, limit: number | null): Gate | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0) return null;
  const rows = file.rows[k]!;
  const dropped = file.dropped[k]!;
  const share = rows ? dropped / rows : 0;
  const usual = h.of({ of: 'droppedRows' })?.at(day);
  return {
    step, rows, dropped, share, limit,
    held: limit !== null && share > limit,
    near: limit !== null && share <= limit && share >= limit - 0.01,
    usual: usual ? { expected: usual.expected, low: usual.low, high: usual.high } : null,
    rules: file.rules.map((r, i) => {
      const u = h.of({ of: 'ruleRows', name: r.name })?.at(day);
      const n = file.failed[k]![i] ?? 0;
      return { name: r.name, warns: r.onFail === 'warn', rows: n, share: rows ? n / rows : 0, usual: u ? { low: u.low, high: u.high } : null };
    }),
  };
}

/** P(a column's value | the split's value), from the history's long-run counts of the two together; null untested. */
function conditional(h: HistoryRanges, column: string, of: string, value: string): Map<string, number> | null {
  const pairs = h.file.pairs ?? {};
  const key = pairs[`${column}|${of}`] ? `${column}|${of}` : pairs[`${of}|${column}`] ? `${of}|${column}` : null;
  if (!key) return null;
  const p = pairs[key]!;
  const ofFirst = key.startsWith(`${of}|`);
  const out = new Map<string, number>();
  let total = 0;
  p.values.forEach((vj, i) => {
    const [a, b] = JSON.parse(vj) as [unknown, unknown];
    const s = ofFirst ? a : b;
    const v = ofFirst ? b : a;
    if (JSON.stringify(s) !== value) return;
    out.set(JSON.stringify(v), (out.get(JSON.stringify(v)) ?? 0) + p.rows[i]!);
    total += p.rows[i]!;
  });
  if (!total) return null;
  for (const [v, n] of out) out.set(v, n / total);
  return out;
}

/** The minute of the day by which a share of the day's trips have been picked up, from its trips by hour. */
function minuteAt(hours: readonly number[], q: number): number {
  const total = hours.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let x = 0; x < 24; x++) {
    if (hours[x]! > 0 && acc + hours[x]! >= q * total) return x * 60 + (60 * (q * total - acc)) / hours[x]!;
    acc += hours[x]!;
  }
  return 1440;
}

/**
 * Whether a day had a cause of something wrong (almost no trips, trips that stop, or a part that vanished or held),
 * and what it was, in at most three words: "trips fell", "only Flex Fare", "Vendor 1 missing".
 */
function badDay(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string>): { hour: number | null; name: string | null } | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  const r = h.of({ of: 'trips' })?.at(day);
  if (k < 0 || !r) return null;
  const n = file.rows[k]!;
  const hours = hoursShort(h, k, r.expected);
  if (hours && n >= MATERIAL.blank * r.expected) return { hour: hours.hours && hours.hours.to === 23 ? hours.hours.from : null, name: hours.hours && hours.hours.from === 0 ? 'late start' : 'trips fell' };
  const s = n >= r.low && n <= r.high ? null : splitOf(h, day, names, hidden);
  const said = (x: string) => (wordsIn(x) <= 3 ? x : null);
  if (s && s.kind === 'held') return { hour: null, name: s.rest.today < 0.1 * s.rest.usual ? said(`only ${s.name}`) : 'trips short' };
  if (s && s.kind === 'vanished') return { hour: null, name: said(`${s.name} ${s.part.today < 0.1 * s.part.usual ? 'missing' : 'short'}`) };
  if (n < MATERIAL.blank * r.expected) return { hour: null, name: 'almost no trips' };
  return null;
}

/** The day's story, from its findings (newsOf, with the app's integrity findings when it has them). */
export function storyOf(h: HistoryRanges, day: string, findings: readonly Finding[], o: StoryOptions): Story {
  const file = h.file;
  const k = file.days.indexOf(day);
  const names = o.names;
  const ack = o.acknowledged ?? new Set<string>();
  const hidden = new Set([...(o.hidden ?? [])].map((c) => c.toLowerCase()));
  const shown = (f: Finding) => !(f.columns ?? []).some((c) => hidden.has(c.toLowerCase())) && !(f.members ?? []).some((m) => hidden.has(m.column.toLowerCase()));
  const tripsRange = k >= 0 ? h.of({ of: 'trips' })?.at(day) : null;
  const amount = tripsRange && k >= 0 ? { value: file.rows[k]!, low: tripsRange.low, high: tripsRange.high, expected: tripsRange.expected, change: file.rows[k]! < tripsRange.low || file.rows[k]! > tripsRange.high ? file.rows[k]! / tripsRange.expected - 1 : null } : null;
  const live = findings.filter((f) => f.kind !== 'calm' && shown(f));
  const volume = live.find((f) => f.kind === 'volume') ?? null;
  const hoursF = live.find((f) => f.kind === 'hours') ?? null;
  const loud = (f: Finding) => (f.severity === 'alert' || f.severity === 'warn') && !ack.has(f.key);
  const valueStories = live.filter((f) => VALUE_KINDS.has(f.kind) && loud(f)).length;
  const split = k >= 0 && (volume || valueStories >= 2) ? splitOf(h, day, names, hidden) : null;
  const gate = k >= 0 && o.step ? gateOf(h, day, o.step, o.limit ?? null) : null;
  if (gate && o.held !== undefined) (gate.held = o.held), gate.held && (gate.near = false);
  const blankDay = !!volume && volume.value !== undefined && !!volume.range && volume.value < MATERIAL.blank * volume.range.expected;
  // A population seen through its blanks (a value and the fields blank on its rows, told together): the day's cause
  // when nothing else is, named by the value and not by a blank or a symptom (Mon Sep 18, 2023's Flex Fare trips).
  const popFinding = k >= 0 && !o.refused && !split && !hoursF && !(volume && loud(volume)) && !gate?.held
    ? (live.filter((f) => f.members && loud(f)).sort((a, b) => b.score - a.score).find((f) => populationOf(h, day, names, f, hidden)) ?? null)
    : null;
  const population = popFinding ? populationOf(h, day, names, popFinding, hidden) : null;
  // What the findings are tested against: the split, or the population.
  const basis = split ?? population;

  // The rows the cause moved: what a finding folded as "same day" may be no bigger than.
  const size = basis ? Math.max(Math.abs(basis.part.today - basis.part.usual), Math.abs(basis.rest.today - basis.rest.usual))
    : hoursF ? (hoursF.rows ?? 0)
    : volume && volume.range && volume.value !== undefined ? Math.abs(volume.value - volume.range.expected) : 0;
  const caused = !!(basis || hoursF || (volume && loud(volume)));
  const hero: Hero = o.refused ? 'refused' : hoursF ? 'hours' : split ? 'split' : volume && loud(volume) ? 'amount' : gate?.held ? 'gate' : 'finding';

  // Tier each finding.
  const n = k >= 0 ? file.rows[k]! : 0;
  const scale = basis ? basis.rest.today / Math.max(1, basis.rest.usual) : 1;
  const conditionals = new Map<string, Map<string, number> | null>();
  const predict = (column: string, value: string): { pred: number; ok: boolean } | null => {
    const split = basis;
    if (!split || k < 0) return null;
    const vh = file.values?.[column];
    const r = h.of({ of: 'value', column, value })?.at(day);
    if (!vh?.counts || !r || !tripsRange) return null;
    const at = vh.values.indexOf(value);
    if (at < 0) return null;
    let pS: number | null;
    if (column === split.column) pS = value === split.value ? 1 : 0;
    else if (hidden.has(column.toLowerCase())) return null;
    else {
      if (!conditionals.has(column)) conditionals.set(column, conditional(h, column, split.column, split.value));
      const c = conditionals.get(column)!;
      pS = c ? (c.get(value) ?? 0) : null;
    }
    if (pS === null) return null;
    const Ev = r.expected * tripsRange.expected;
    const pred = split.part.today * pS + scale * Math.max(0, Ev - split.part.usual * pS);
    const obs = vh.counts[k]![at] ?? 0;
    const tol = 3 * Math.sqrt(Math.max(1, pred)) + ((r.high - r.low) / 6) * n;
    const resid = Math.abs(obs - pred);
    return { pred, ok: resid <= tol || resid < MATERIAL.rows || resid / Math.max(1, n) < MATERIAL.share };
  };
  const members = (f: Finding): { column: string; value: string }[] =>
    f.members?.map((m) => ({ column: m.column, value: m.value })) ?? (f.columns ?? []).map((c, i) => ({ column: c, value: f.values?.[i] ?? 'null' }));
  const blankCols = new Set(basis?.blank ?? []);
  const tierOf = (f: Finding): { tier: Tier; predicted?: number } => {
    if (ack.has(f.key)) return { tier: 'note' };
    if (f === popFinding && population) return { tier: 'cause' };
    if (f === hoursF && hero === 'hours') return { tier: 'cause' };
    if (f === volume) return hero === 'amount' ? { tier: 'cause' } : caused ? { tier: 'absorbed' } : { tier: loud(f) ? 'standalone' : 'note' };
    if (NEVER_FOLD.has(f.kind) || f.severity === 'ok') return { tier: loud(f) ? 'standalone' : 'note' };
    if (f.kind === 'dropped' && gate?.held && hero === 'gate') return { tier: 'absorbed' };
    if (!caused) return { tier: loud(f) ? 'standalone' : 'note' };
    const within = (f.rows ?? 0) <= size;
    if (VALUE_KINDS.has(f.kind)) {
      const ms = members(f);
      if (basis && ms.every((m) => m.column === basis.column || (m.value === 'null' && blankCols.has(names.column(m.column))))) return { tier: 'absorbed' };
      if (basis) {
        const tests = ms.map((m) => predict(m.column, m.value));
        if (tests.every((t) => t?.ok)) return { tier: 'follows', predicted: ms.length === 1 ? tests[0]!.pred : undefined };
      }
      return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
    }
    if (f.kind === 'shape') {
      const c = f.columns?.[0];
      const time = c !== undefined && file.kinds[file.columns.indexOf(c)] === 'time';
      if (time && f.metric?.of === 'quantile' && f.value !== undefined && file.hours?.[k]) {
        const off = /drop/i.test(c!) ? 15 : 0;
        if (Math.abs(f.value - minuteAt(file.hours[k]!, QUANTILES[f.metric.q]!) - off) <= 75) return { tier: 'follows' };
      }
      return { tier: 'sameDay' };
    }
    if (f.kind === 'dropped' || f.kind === 'rule') {
      const u = f.kind === 'dropped' ? h.of({ of: 'droppedRows' })?.at(day) : f.metric?.of === 'rule' ? h.of({ of: 'ruleRows', name: f.metric.name })?.at(day) : null;
      const today = f.kind === 'dropped' ? (gate?.dropped ?? 0) : f.metric?.of === 'rule' ? (file.failed[k]?.[file.rules.findIndex((r) => r.name === (f.metric as { name: string }).name)] ?? 0) : 0;
      if (u && today <= u.high * 1.1) return { tier: 'follows' };
      return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
    }
    return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
  };
  const told: Told[] = live.map((f) => {
    const t = tierOf(f);
    const severity: Severity = t.tier === 'cause' || t.tier === 'standalone' ? f.severity : f.severity === 'ok' ? 'ok' : 'note';
    return { ...f, severity, was: f.severity, tier: t.tier, ...(ack.has(f.key) ? { acknowledged: true } : {}), ...(t.predicted !== undefined ? { predicted: t.predicted } : {}), ...(t.tier === 'absorbed' || t.tier === 'follows' || t.tier === 'sameDay' ? { because: (hoursF ?? popFinding ?? volume)?.key ?? 'split' } : {}) };
  });
  const byRank = (a: Told, b: Told) => RANK[a.severity] - RANK[b.severity] || b.score - a.score;
  const standalone = told.filter((f) => f.tier === 'standalone').sort(byRank);
  // The finding the head is about: the cause, or with none, the first standalone one.
  const cause = told.find((f) => f.tier === 'cause') ?? (hero === 'finding' ? (standalone[0] ?? null) : null);
  const absorbed = told.filter((f) => f.tier === 'absorbed');
  const follows = told.filter((f) => f.tier === 'follows').sort((a, b) => RANK[a.was] - RANK[b.was] || b.score - a.score);
  const sameDay = told.filter((f) => f.tier === 'sameDay').sort((a, b) => RANK[a.was] - RANK[b.was] || b.score - a.score);
  const weather = told.find((f) => f.kind === 'weather' && f.severity === 'note' && f.key === 'weather') ?? null;
  const notes = told.filter((f) => f.tier === 'note' && f.severity !== 'ok' && f !== weather).sort(byRank);

  // How bad the day is: its cause with what it absorbed (a split with nothing worse is unusual), a held gate, its stories.
  let causeSeverity: Severity = cause && cause.tier === 'cause' ? cause.was : 'ok';
  causeSeverity = worst([causeSeverity, ...absorbed.map((f) => f.was)]);
  if (split && RANK[causeSeverity] > RANK.warn) causeSeverity = 'warn';
  if (gate?.held) causeSeverity = 'alert';
  const severity: Severity = o.refused ? 'alert' : worst([causeSeverity, ...standalone.map((f) => f.severity), notes.length ? 'note' : 'ok']);

  // The episode: the days before with a cause of something wrong, back to its first.
  let episode: Story['episode'] = null;
  const badToday = k >= 0 && severity === 'alert' && caused && o.episode !== false;
  const before = (from: string) => {
    let first = from;
    let hour: number | null = null;
    let days = 0;
    for (let i = 1; i <= 14; i++) {
      const d = plusDays(from, -i);
      const b = badDay(h, d, names, hidden);
      if (!b) break;
      first = d;
      hour = b.hour;
      days++;
    }
    return { days, first, hour };
  };
  let recovery: Story['recovery'] = null;
  if (badToday) {
    const b = before(day);
    if (b.days > 0) episode = { days: b.days + 1, since: b.first, hour: b.hour };
  } else if (k >= 0 && !o.refused && severity !== 'alert' && severity !== 'warn' && o.episode !== false) {
    const yesterday = plusDays(day, -1);
    const last = badDay(h, yesterday, names, hidden);
    if (last) {
      const b = before(yesterday);
      const from = b.days ? b.first : yesterday;
      // Which of its days the checks held (never published) and which went out short, as the history judges them.
      const days: string[] = [];
      for (let d = from; d <= yesterday; d = plusDays(d, 1)) days.push(d);
      const held = o.step ? days.filter((d) => gateOf(h, d, o.step!, o.limit ?? null)?.held) : [];
      recovery = { from, to: yesterday, held, published: o.step ? days.filter((d) => !held.includes(d)) : [], name: last.name };
    }
  }

  // The population's share, as its finding judged it.
  const popMember = popFinding?.members?.find((m) => m.value !== 'null') ?? null;
  const popShare = popMember ? shareWords(popMember.share, popMember.range.low, popMember.range.high) : null;

  // The head: the cause as a population or a time, in at most six words.
  const holiday = holidayOf(day);
  const season = seasonOf(day);
  const calmHead = holiday ? `Normal for ${SHORT_HOLIDAY[holiday] ?? holiday}` : season ? `Normal for ${(SHORT_HOLIDAY[season] ?? season).replace(/^Holiday season$/, 'the holidays')}` : `A normal ${weekdayOf(day)}`;
  const pctShort = (x: number) => `${Math.round(x * 100)}%`;
  let head: string;
  if (o.refused) head = 'File refused: bytes don’t match';
  else if (hero === 'hours' && hoursF) head = hoursF.title;
  else if (hero === 'split' && split) {
    const restRatio = split.rest.today / Math.max(1, split.rest.usual);
    const partRatio = split.part.today / Math.max(1, split.part.usual);
    const part = split.trips ? `${split.name} records` : split.name;
    head = split.kind === 'held'
      ? restRatio < 0.1 ? `Only ${part} arrived` : `Trips ${pctShort(1 - restRatio)} short; ${split.name} held`
      : split.kind === 'vanished'
        ? partRatio < 0.1 ? (/^Vendor /.test(split.name) ? `${split.name} sent almost nothing` : `${part} almost gone`) : `${part} ${pctShort(1 - partRatio)} short`
        : partRatio >= 1.95 ? `${part} ${partRatio.toFixed(1).replace(/\.0$/, '')}× usual` : `${part} up ${pctShort(partRatio - 1)}`;
  } else if (hero === 'amount' && volume) head = volume.title;
  else if (hero === 'gate' && gate) head = `Held at ${gate.step}: ${pastLimit(gate.share, gate.limit)} dropped`;
  else if (population && popShare) {
    // "More Flex Fare trips: 5.3%": the population, which way, and its share; its usual range is on the visual under it.
    const way = population.kind === 'surged' ? 'More' : 'Fewer';
    const full = `${way} ${population.name}${population.trips ? ' trips' : ''}: ${popShare.value}`;
    head = wordsIn(full) <= 6 ? full : `${way} ${population.name}: ${popShare.value}`;
  } else if (standalone[0]) {
    // A finding's title as a head, in six words: its usual range left to the visual under it when it doesn't fit.
    const t = standalone[0].title;
    head = wordsIn(t) > 6 ? t.replace(/\s*\(usually [^)]*\)$/, '') : t;
  }
  else if (recovery) head = 'Back to normal';
  // A rise or fall in trips that has lasted is a note, but never "a normal day" beside a count outside its range.
  else if (volume?.lasting && volume.severity === 'note' && volume.value !== undefined && volume.range) head = `${volume.value > volume.range.expected ? 'Busier' : 'Quieter'} than usual for days`;
  else head = calmHead;

  // Snow names its day ("❄ 7.2 cm Sat"): today's, or the day before's when today's trips are the news.
  const snowOn = (d: string) => {
    const j = file.days.indexOf(d);
    const cm = j >= 0 ? (file.weather?.snow[j] ?? 0) : 0;
    return cm >= 1 ? `❄ ${cm.toFixed(1)} cm ${weekdayOf(d).slice(0, 3)}` : null;
  };
  const snowChip = k >= 0 && (hero === 'amount' || severity === 'ok' || severity === 'note') ? (snowOn(day) ?? (hero === 'amount' ? snowOn(plusDays(day, -1)) : null)) : null;
  const span = (a: string, b: string) => (a === b ? weekdayOf(a).slice(0, 3) : `${weekdayOf(a).slice(0, 3)}–${weekdayOf(b).slice(0, 3)}`);
  // Days said as runs: "Fri–Sun", "Mon, Wed".
  const spans = (ds: readonly string[]) => {
    const runs: [string, string][] = [];
    for (const d of ds) {
      const r = runs.at(-1);
      if (r && plusDays(r[1], 1) === d) r[1] = d;
      else runs.push([d, d]);
    }
    return runs.map(([a, b]) => span(a, b)).join(', ');
  };
  // After an episode, the chip names it ("after Thu–Sun · only Flex Fare"), in five words or fewer.
  const afterChip = recovery ? [`after ${span(recovery.from, recovery.to)} · ${recovery.name}`, `after ${span(recovery.from, recovery.to)}`].find((c) => !c.includes('null') && wordsIn(c) <= 5)! : null;
  const chip = episode
    ? `Day ${episode.days} · since ${weekdayOf(episode.since).slice(0, 3)}${episode.hour !== null ? ` ${clock(episode.hour)}` : ''}`
    : afterChip ?? snowChip;
  // And whether anything is left to do: a held load is never published, and nothing waits on a person to release it.
  const after = recovery && o.step ? `Nothing to do · ${[recovery.published.length ? `${spans(recovery.published)} published short` : '', recovery.held.length ? `${spans(recovery.held)} held` : ''].filter(Boolean).join(', ')}` : null;

  const state: Story['state'] = o.refused ? 'refused' : severity === 'alert' ? 'wrong' : severity === 'warn' ? 'unusual' : recovery ? 'recovery' : notes.length ? 'notes' : 'calm';
  const shownHero: Hero = state === 'calm' || state === 'notes' || state === 'recovery' ? 'calm' : hero;

  // One verb: what can be done about the cause.
  const primary: Act | null = o.refused ? 'refetch'
    : state === 'calm' || state === 'notes' || state === 'recovery' ? null
    : hero === 'hours' ? 'incident'
    : hero === 'split' && split ? (split.kind === 'surged' ? 'expected' : 'notify')
    : hero === 'gate' ? 'notify'
    : cause?.acts[0] ?? standalone[0]?.acts[0] ?? null;

  // The health row: each cell the worst of its kinds as told, and whether the cause explains it.
  const cells: [Cell, Finding['kind'][]][] = [['file', ['integrity', 'schema']], ['amount', ['volume']], ['hours', ['hours']], ['values', ['gone', 'share', 'new', 'pair', 'missing']], ['shape', ['shape']]];
  const health = cells.map(([cell, kinds]) => {
    const mine = told.filter((f) => kinds.includes(f.kind) && f.severity !== 'ok');
    const loudOnes = mine.filter((f) => f.tier === 'cause' || f.tier === 'standalone');
    const folded = mine.filter((f) => f.tier === 'absorbed' || f.tier === 'follows' || f.tier === 'sameDay');
    // The cell holding the cause's own measure carries the cause's mark: the amount on a split day with a volume
    // finding, the hours on a day they fall, the values on a surge with no volume finding.
    const causeCell = hero === 'hours' ? 'hours' : hero === 'split' ? (volume ? 'amount' : 'values') : hero === 'amount' ? 'amount' : null;
    if (cell === causeCell && (causeSeverity === 'alert' || causeSeverity === 'warn')) return { cell, severity: causeSeverity, explained: false, follows: mine.filter((f) => f.tier === 'follows' || f.tier === 'absorbed').length, sameDay: mine.filter((f) => f.tier === 'sameDay').length };
    const explained = (folded.length > 0 && loudOnes.length === 0) || (cell === 'hours' && blankDay);
    return { cell, severity: loudOnes.length ? worst(loudOnes.map((f) => f.severity)) : mine.length && !explained ? 'note' as Severity : null, explained, follows: mine.filter((f) => f.tier === 'follows' || f.tier === 'absorbed').length, sameDay: mine.filter((f) => f.tier === 'sameDay').length };
  });

  // The labels at a glance.
  const heroLabels: string[] = [];
  if (shownHero === 'split' && split) heroLabels.push(partLabel(split), countLabel(split.part), 'Everything else', countLabel(split.rest));
  if (shownHero === 'finding' && population && popShare) heroLabels.push(population.name, popShare.value, `usually ${popShare.range}`);
  // The hour chart: the hour they fall, what still came an hour after it (they don't stop: Sep 21, 2023 kept ~330 an
  // hour), what is missing against a usual day, and which day that is.
  const hoursLabels = hoursF?.hours ? (() => {
    const { got, usual, from, to } = hoursF.hours;
    const had = got.slice(from, to + 1).reduce((a, b) => a + b, 0);
    const want = usual.slice(from, to + 1).reduce((a, b) => a + b, 0);
    const per = had / Math.max(1, to - from + 1);
    const said = per >= 100 ? Number(per.toPrecision(2)) : Math.round(per);
    return { cut: clock(from), floor: `${to === 23 ? 'still ' : ''}~${fmtInt(said)}/h`, missing: `~${compact(Math.max(0, want - had))} missing`, ghost: `usual ${weekdayOf(day)}` };
  })() : null;
  if (shownHero === 'hours' && hoursLabels) heroLabels.push(hoursLabels.cut, hoursLabels.floor, hoursLabels.missing, hoursLabels.ghost);
  // The amount line carries the day's count and its usual range on every day; a strip of days adds no words.
  if (gate?.held || gate?.near) {
    const g = gateLabels(gate);
    heroLabels.push(gate.held ? 'Checks held' : 'Checks near the limit', g.share, ...(g.limit ? [g.limit] : []), ...(g.margin ? [g.margin] : []), g.rows, ...(g.usual ? [g.usual] : []));
  }
  // What the explained changes are, in words a newcomer has: "shares, times, checks", most first, three at most.
  const kindWord: Partial<Record<Finding['kind'], string>> = { share: 'shares', gone: 'values gone', missing: 'blanks', shape: 'spreads', dropped: 'checks', rule: 'checks', new: 'new values', pair: 'new pairs' };
  const wordOf = (f: Finding) => (f.kind === 'shape' && f.columns?.[0] && file.kinds[file.columns.indexOf(f.columns[0])] === 'time' ? 'times' : (kindWord[f.kind] ?? 'other'));
  const kinds = new Map<string, number>();
  for (const f of follows) kinds.set(wordOf(f), (kinds.get(wordOf(f)) ?? 0) + 1);
  const shownKinds = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  const stories = standalone.filter((f) => f !== cause).slice(0, 2);
  const more = standalone.filter((f) => f !== cause && !stories.includes(f));

  return {
    day, state, severity, head, chip, hero: shownHero, amount, split: shownHero === 'calm' ? null : basis, hours: hoursF?.hours ?? null, hoursLabels, gate,
    cause, stories, more, follows, sameDay, absorbed, notes, context: weather,
    episode, recovery, health, primary,
    labels: {
      // The day's own change sits on the amount line when its count is outside its range and the head doesn't say it.
      amount: amount ? [`${fmtInt(amount.value)} trips`, ...(amount.change !== null && hero !== 'amount' && cause?.kind !== 'volume' ? [changeLabel(amount.change)] : []), `usual ${compact(amount.low)}–${compact(amount.high)}`] : [],
      hero: heroLabels,
      follows: follows.length ? `${follows.length} ${follows.length === 1 ? 'change' : 'changes'} this explains` : null,
      sameDay: sameDay.length ? `${sameDay.length} more ${sameDay.length === 1 ? 'change' : 'changes'} this day` : null,
      notes: notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : null,
      more: more.length ? `${more.length} more unusual` : null,
      primary: primary ? ACT_VERB[primary] : null,
      kinds: shownKinds,
      after,
      // A strip of days at a glance (a calm day's week, an amount day's four weeks) carries its one-line key.
      key: shownHero === 'calm' || ((shownHero === 'amount' || shownHero === 'finding') && cause?.kind === 'volume') ? [...STRIP_KEY] : [],
    },
    findings: [...told].sort(byRank),
  };
}

/**
 * The split in one sentence, every word of it from the figures with a tolerance (ADR 0008): "as usual" only within 5%
 * of the usual count and inside the part's own range when it has one; "within its usual range" inside it but further
 * off; "almost stopped" only under a twentieth of usual on a day with no hour the trips fall (a fall during the day is
 * said as one: "fell from 13:00"); else "up 44%", "2.3× usual", "down 30%". Each side's count and usual follow it.
 */
export function splitSentence(s: Story): string | null {
  const sp = s.split;
  if (!sp) return null;
  const fall = s.hours && s.hours.to === 23 ? s.hours.from : null;
  const how = (c: Count, moved: boolean) => {
    const r = c.today / Math.max(1, c.usual);
    const inside = c.low !== null && c.high !== null ? c.today >= c.low && c.today <= c.high : null;
    if (inside !== false && Math.abs(r - 1) <= 0.05) return 'as usual';
    if (inside) return 'within its usual range';
    if (moved && fall !== null && r < 1) return `fell from ${clock(fall)}`;
    if (r < 0.05) return 'almost stopped';
    if (r >= 1.95) return `${r.toFixed(1).replace(/\.0$/, '')}× usual`;
    return r > 1 ? `up ${Math.round((r - 1) * 100)}%` : `down ${Math.round((1 - r) * 100)}%`;
  };
  const said = (c: Count) => `${fmtInt(c.today)}; usual ${c.low !== null && c.high !== null ? `${compact(c.low)}–${compact(c.high)}` : `~${approx(c.usual)}`}`;
  const restMoved = sp.kind === 'held';
  return `${sp.name} ${how(sp.part, !restMoved)} (${said(sp.part)}); everything else ${how(sp.rest, restMoved)} (${said(sp.rest)}).`;
}

/** Every string a story shows at a glance (head, chip, the hero's labels, rows, the verb), for its word budget. */
export function glanceStrings(s: Story): string[] {
  return [s.head, s.chip ?? '', s.labels.after ?? '', ...s.labels.amount, ...s.labels.hero, ...s.labels.key, s.labels.follows ?? '', ...s.labels.kinds, s.labels.sameDay ?? '', s.labels.more ?? '', s.labels.notes ?? '', s.labels.primary ?? '', ...s.stories.map((f) => f.title)].filter(Boolean);
}

export { shareWords };
