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
import { holidayOf, plusDays, seasonOf } from './calendar.js';
import { HistoryRanges, QUANTILES, type Metric, type ValueHistory } from './history.js';
import type { NormalRange, NormalRanges } from './normal.js';
import { clockText } from './quality.js';

export type Severity = 'alert' | 'warn' | 'note' | 'ok';
/** Where a finding's details are: the tabs of a drill-down. */
export type Look = 'news' | 'rows' | 'columns' | 'dropped' | 'odd' | 'history' | 'integrity';
/** What can be done about a finding. */
export type Act = 'expected' | 'incident' | 'notify' | 'rule' | 'quarantine' | 'refetch' | 'export';

export interface Finding {
  key: string;
  kind: 'volume' | 'hours' | 'gone' | 'share' | 'new' | 'pair' | 'missing' | 'shape' | 'dropped' | 'rule' | 'schema' | 'weather' | 'calm' | 'key' | 'unmatched' | 'placeholder' | 'empty' | 'integrity';
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
  hours?: { got: number[]; usual: number[]; from: number; to: number; fall: number };
  /** The findings told together as one (the same trips seen through several columns): each with its own numbers. */
  members?: { column: string; value: string; label: string; share: number; range: NormalRange; rows: number }[];
}

/** How a column and a value are said: a column's title, and a code with what it stands for. */
export interface Names {
  column(c: string): string;
  value(c: string, v: unknown): string;
  /** A value said on its own, for short titles: what a code stands for ("Credit card"), or the value ("$2.50"). */
  label?(c: string, v: unknown): string;
}

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
};

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
const atShare = (share: number, usual: number, rows: number, how: string) => `${fmtInt(share * rows)} of today’s trips ${how}; about ${fmtInt(usual * rows)} at its usual share.`;
const listed = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A day's findings, most important first; `checks` says whether the flow's checks are the ones the history counted. */
export function newsOf(h: HistoryRanges, day: string, names: Names, options: { checks?: boolean } = {}): Finding[] {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0) return [];
  const rows = file.rows[k]!;
  const out: Finding[] = [];
  // A value in a short title: its meaning when that is short ("Credit card"), else its own value ("N", "$2.50").
  const label = (column: string, key: string) => {
    const said = (names.label ?? names.value)(column, parse(key));
    return said.split(/\s+/).length <= 3 ? said : String(parse(key));
  };
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
    const so = (i: number): boolean | null => {
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
    // Told as a note, without its first day in words: which day a change began is for its chart to show (ADR 0008).
    return { ...f, severity: 'note', score: f.score / 10, lasting: since };
  };

  // Volume: the day's trips against what a day like it has; all but blank; the hours it stops or starts.
  const trips = judged({ of: 'trips' });
  if (trips) {
    const { range, value } = trips;
    const like = `A day like it has ${fmtInt(range.low)} to ${fmtInt(range.high)}.`;
    if (value < MATERIAL.blank * range.expected) {
      out.push({ key: 'volume', kind: 'volume', severity: 'alert', score: 99, title: `Almost no trips: ${fmtInt(value)}`, detail: like, look: 'history', metric: { of: 'trips' }, value, range, rows: value, acts: ['incident', 'notify', 'expected'] });
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
        title: `${more ? 'More' : 'Fewer'} trips: ${fmtInt(value)} (${more ? '+' : '−'}${Math.round(Math.abs(value / range.expected - 1) * 100)}%)`,
        detail: like,
        look: 'history', metric: { of: 'trips' }, value, range, rows: value, acts: ['expected', 'incident', 'notify'],
        ...(lasted ? { lasting: since } : {}),
      });
    }
    // The hours: trips by pickup hour against what a day like it has then, from the same weekday's hours lately.
    const hours = hoursShort(h, k, range.expected);
    if (hours && value >= MATERIAL.blank * range.expected) out.push(hours);
  }

  // Each coded value's share: one usually there and gone, or one whose share is unusual.
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts) continue;
    vh.values.forEach((key, i) => {
      if (vh.first[i]! > k) return;
      const j = judged({ of: 'value', column, value: key });
      if (!j || !outside(j)) return;
      const delta = j.value - j.range.expected;
      if (Math.abs(delta) < MATERIAL.share || Math.abs(delta) * rows < MATERIAL.rows) return;
      if (Math.abs(delta) < MATERIAL.shareRelative * Math.min(j.range.expected, 1 - j.range.expected)) return;
      const said = label(column, key);
      const w = shareWords(j.value, j.range.low, j.range.high);
      if (j.value === 0) {
        out.push(quiet({ key: `gone:${column}=${key}`, kind: 'gone', severity: j.range.expected >= 0.2 ? 'alert' : 'warn', score: cap(j.d), title: `${sentence(names.column(column))} ${said}: none`, detail: `Usually on ${w.range} of trips; none today.`, look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: j.value, range: j.range, rows: Math.round(-delta * rows), acts: ['incident', 'notify', 'expected'] }, j));
      } else {
        out.push(quiet({ key: `share:${column}=${key}`, kind: key === 'null' ? 'missing' : 'share', severity: shareSeverity(delta, j), score: cap(j.d), title: key === 'null' ? `${sentence(names.column(column))} blank: ${w.value} (usually ${w.range})` : `${sentence(names.column(column))} ${said}: ${w.value} (usually ${w.range})`, detail: atShare(j.value, j.range.expected, rows, key === 'null' ? 'blank' : 'with it'), look: 'columns', columns: [column], values: [key], metric: { of: 'value', column, value: key }, value: j.value, range: j.range, rows: Math.round(Math.abs(delta) * rows), acts: ['expected', 'rule', 'notify'] }, j));
      }
    });
  }

  // Completeness: a column missing more (or fewer) values than a day like it.
  file.columns.forEach((column, c) => {
    if (file.values?.[column]?.counts) return; // a coded column's missing values are its null value, above
    const j = judged({ of: 'missing', column });
    if (!j || !outside(j)) return;
    const delta = j.value - j.range.expected;
    if (Math.abs(delta) < MATERIAL.share || Math.abs(delta) * rows < MATERIAL.rows) return;
    if (Math.abs(delta) < MATERIAL.shareRelative * Math.min(j.range.expected, 1 - j.range.expected)) return;
    void c;
    const w = shareWords(j.value, j.range.low, j.range.high);
    out.push(quiet({ key: `missing:${column}`, kind: 'missing', severity: shareSeverity(delta, j), score: cap(j.d), title: `${sentence(names.column(column))} blank: ${w.value} (usually ${w.range})`, detail: atShare(j.value, j.range.expected, rows, 'without it'), look: 'columns', columns: [column], values: ['null'], metric: { of: 'missing', column }, value: j.value, range: j.range, rows: Math.round(Math.abs(delta) * rows), acts: ['expected', 'rule', 'notify'] }, j));
  });

  // Values and combinations never seen before.
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    const fresh = newOn(vh, k);
    if (!fresh) continue;
    const n = fresh.rows ?? vh.fresh.find(([d]) => d === k)?.[1] ?? 0;
    if (n < MATERIAL.newRows && n < MATERIAL.newShare * rows) continue;
    const said = fresh.keys.slice(0, 5).map((key) => names.value(column, parse(key)));
    out.push({ key: `new:${column}`, kind: 'new', severity: n >= 100 || n >= 0.001 * rows ? 'warn' : 'note', score: Math.min(99, n / Math.max(1, rows) * 1000), title: fresh.keys.length === 1 ? `New ${names.column(column)}: ${label(column, fresh.keys[0]!)} · ${fmtInt(n)} trips` : `New ${names.column(column)} values: ${fresh.keys.length} · ${fmtInt(n)} trips`, detail: `${listed(said)}${fresh.keys.length > 5 ? ` and ${fresh.keys.length - 5} more` : ''}: never in ${daysSeen(file, k)} days of history.`, look: 'columns', columns: [column], values: fresh.keys, rows: n, acts: ['expected', 'quarantine', 'rule', 'notify'] });
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
    if (!keys.length || (n < MATERIAL.newRows && n < MATERIAL.newShare * rows)) continue;
    const said = keys.slice(0, 3).map((key) => {
      const [x, y] = parse(key) as [unknown, unknown];
      return `${names.column(a)} ${names.value(a, x)} with ${names.column(b)} ${names.value(b, y)}`;
    });
    out.push({ key: `pair:${pair}`, kind: 'pair', severity: n >= 100 || n >= 0.001 * rows ? 'warn' : 'note', score: Math.min(99, n / Math.max(1, rows) * 1000), title: `New pair: ${names.column(a)} with ${names.column(b)} · ${fmtInt(n)} trips`, detail: `${sentence(listed(said))}${keys.length > 3 ? ` and ${keys.length - 3} more` : ''}: never together in ${daysSeen(file, k)} days.`, look: 'columns', columns: [a, b], values: keys, rows: n, acts: ['expected', 'quarantine', 'rule', 'notify'] });
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
    const rules = file.rules.map((r) => ({ r, j: judged({ of: 'rule', name: r.name }) })).filter((x) => x.j && outside(x.j) && Math.abs(x.j.value - x.j.range.expected) * rows >= MATERIAL.rows);
    const ruleWords = rules.map(({ r, j }) => `${r.name} ${shareWords(j!.value, j!.range.low, j!.range.high).value}`);
    if (dropped && outside(dropped) && Math.abs(dropped.value - dropped.range.expected) * rows >= MATERIAL.rows) {
      const more = dropped.value > dropped.range.expected;
      out.push(quiet({ key: 'dropped', kind: 'dropped', severity: dropped.value >= 2 * dropped.range.expected && dropped.value >= 0.1 ? 'alert' : 'warn', score: cap(dropped.d), title: `Checks dropped ${shareWords(dropped.value, dropped.range.low, dropped.range.high).value} (usually ${shareWords(dropped.value, dropped.range.low, dropped.range.high).range})`, detail: `A ${more ? 'larger' : 'smaller'} share than a day like it drops${ruleWords.length ? `; by rule, ${listed(ruleWords)}` : ''}.`, look: 'dropped', metric: { of: 'dropped' }, value: dropped.value, range: dropped.range, rows: Math.round(dropped.value * rows), acts: ['quarantine', 'rule', 'notify', 'expected'] }, dropped));
    } else {
      for (const { r, j } of rules) {
        out.push({ key: `rule:${r.name}`, kind: 'rule', severity: 'note', score: cap(j!.d), title: `${sentence(r.name)} rule: ${shareWords(j!.value, j!.range.low, j!.range.high).value} ${r.onFail === 'warn' ? 'flagged' : 'fail'} (usually ${shareWords(j!.value, j!.range.low, j!.range.high).range})`, detail: atShare(j!.value, j!.range.expected, rows, r.onFail === 'warn' ? 'flagged' : 'failed'), look: 'dropped', metric: { of: 'rule', name: r.name }, value: j!.value, range: j!.range, acts: ['quarantine', 'rule', 'expected'] });
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

  // The weather, as context.
  const w = file.weather;
  if (w) {
    const snow = w.snow[k] ?? 0;
    const rain = w.precip[k] ?? 0;
    const gaps = w.boroughs.filter((_, b) => (w.hours[k]?.[b] ?? 24) < 24);
    // Whole degrees, rounded first: never "−0".
    const deg = (x: number) => String(Math.round(x) || 0);
    const temps = w.tmin[k] != null && w.tmax[k] != null ? `between ${deg(w.tmin[k]!)} and ${deg(w.tmax[k]!)} °C` : 'its temperatures not on record';
    if (snow >= 1) out.push({ key: 'weather', kind: 'weather', severity: 'note', score: snow, title: `Snow: ${snow.toFixed(1)} cm in Manhattan`, detail: `With ${rain.toFixed(1)} mm of rain and snow in all, ${temps}.`, look: 'history', acts: [] });
    else if (rain >= 15) out.push({ key: 'weather', kind: 'weather', severity: 'note', score: rain / 10, title: `Heavy rain: ${rain.toFixed(0)} mm in Manhattan`, detail: `${sentence(temps)}.`, look: 'history', acts: [] });
    else out.push({ key: 'weather', kind: 'weather', severity: 'ok', score: 0, title: rain >= 1 ? `Some rain: ${rain.toFixed(0)} mm in Manhattan` : 'A dry day in Manhattan', detail: `${sentence(temps)}${gaps.length ? '' : ', every district’s 24 hours on record'}.`, look: 'history', acts: [] });
    if (gaps.length) out.push({ key: 'weather-gaps', kind: 'weather', severity: 'note', score: 1, title: `The weather has hours missing`, detail: `${listed(gaps)}: fewer than 24 hours on record.`, look: 'history', acts: ['notify'] });
  }

  // What follows from what (a feed that stopped skews the mix of values, the shapes, what the checks drop) is the
  // story's to tell: storyOf (story.ts) sorts these findings by what the day's cause explains.
  const told = together(out, rows, names);
  told.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.score - a.score);
  if (!told.some((f) => f.severity === 'alert' || f.severity === 'warn')) {
    const note = holidayOf(day) ?? seasonOf(day);
    told.unshift({ key: 'calm', kind: 'calm', severity: 'ok', score: 0, title: 'Nothing out of the ordinary', detail: trips ? `${fmtInt(trips.value)} trips, normal for ${note ?? 'a day like it'} (${fmtInt(trips.range.low)} to ${fmtInt(trips.range.high)}).` : 'Every value, column and check as a day like it has them.', look: 'history', metric: trips ? { of: 'trips' } : undefined, value: trips?.value, range: trips?.range, acts: [] });
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
  const shares: number[][] = Array.from({ length: 24 }, () => []);
  for (let w = 1; w <= 10 && shares[0]!.length < 6; w++) {
    const d = plusDays(day, -7 * w);
    const j = file.days.indexOf(d);
    if (j < 0 || holidayOf(d) || seasonOf(d) || !file.rows[j] || !file.hours?.[j]) continue;
    file.hours[j]!.forEach((n, hr) => shares[hr]!.push(n / file.rows[j]!));
  }
  if (shares[0]!.length < 3) return null;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;
  return shares.map((xs) => median(xs) * expected);
}

export function hoursShort(h: HistoryRanges, k: number, expected: number): Finding | null {
  const file = h.file;
  const want = usualHours(h, k, expected);
  if (!want || !file.hours?.[k]) return null;
  const got = file.hours[k]!;
  const short = got.map((n, hr) => want[hr]! >= MATERIAL.hourRows && n < MATERIAL.hourShare * want[hr]!);
  // The longest run of short hours.
  let best = [0, -1];
  for (let a = 0; a < 24; a++) {
    if (!short[a]) continue;
    let b = a;
    while (b + 1 < 24 && (short[b + 1] || want[b + 1]! < MATERIAL.hourRows)) b++;
    while (b > a && !short[b]) b--;
    if (b - a > best[1]! - best[0]!) best = [a, b];
    a = b;
  }
  const [a, b] = best as [number, number];
  if (b - a < 1) return null;
  const had = got.slice(a, b + 1).reduce((t, n) => t + n, 0);
  const usual = want.slice(a, b + 1).reduce((t, n) => t + n, 0);
  const span = b === 23 ? `from ${clockText(a * 60)} on` : a === 0 ? `until ${clockText((b + 1) * 60)}` : `from ${clockText(a * 60)} to ${clockText((b + 1) * 60)}`;
  // Pickup times, not arrival times: the trips fall to a trickle, they don't end (Sep 21, 2023: 3,679 after 13:00).
  const fall = Math.round((1 - had / Math.max(1, usual)) * 100);
  return {
    key: 'hours', kind: 'hours', severity: 'alert', score: 50 + (b - a),
    title: b === 23 ? `Trips fall ${fall}% from ${clockText(a * 60)}` : a === 0 ? `Trips start late, at ${clockText((b + 1) * 60)}` : `Gap in trips, ${clockText(a * 60)}–${clockText((b + 1) * 60)}`,
    detail: `${fmtInt(had)} trips ${span}, where a day like it has about ${fmtInt(usual)}.`,
    look: 'history', rows: Math.round(usual - had), acts: ['incident', 'notify', 'expected'],
    hours: { got: [...got], usual: want.map((x) => Math.round(x)), from: a, to: b, fall },
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
  const groupable = (f: Finding) => (f.kind === 'share' || f.kind === 'missing' || f.kind === 'gone') && f.rows !== undefined && f.rows > 0;
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
        ? fits(`${sentence(listed(others.map(said)))} ${blankOthers ? 'blank on' : 'moved with it:'} the same trips, likely.`, `${others.length} more ${blankOthers ? 'fields blank on' : 'values moved with it:'} the same trips, likely.`)
        : fits(`${sentence(listed(all.map(said)))}: blank on the same trips, likely.`, 'Blank on the same trips, likely.'),
      columns: all.flatMap((g) => g.columns ?? []),
      values: all.flatMap((g) => g.values ?? []),
      members: [lead, ...others].map((g) => ({ column: g.columns![0]!, value: g.values![0]!, label: g.values?.[0] === 'null' ? 'blank' : (names.label ?? names.value)(g.columns![0]!, parse(g.values![0]!)), share: g.value!, range: g.range!, rows: g.rows! })),
    });
  }
  void rows;
  return out;
}
