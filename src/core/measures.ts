/**
 * One load's numbers (ADR 0010 §6, E11 measures/0), and a source's appended periods as a tree (E12 tail/0). Pure: no
 * DOM, no engine. The plugin measures a load in the engine (src/plugin/measure.ts runs the statements emit.ts writes)
 * and assembles the record here, so the history builder, a run and verify make the same record from the same rows.
 *
 * - `measuresOf` assembles a load's measures from what the engine counted: the column facts, an even sample, one scan
 *   of the counted, followed and time columns, and the checks' counts. The same arithmetic the history builder has
 *   always done (scripts/data/history.ts), so a period built offline and the same load measured by its own run are
 *   equal, field for field.
 * - `measuresHash` and `measuresLeaf` hash a record (E11, E12); `tailRoot` is the root of a source's tail.
 * - `periodOf` takes a period out of a history file: the numbers the file keeps of it (`samePeriod` compares them with
 *   a load's measures). `appendPeriods` folds a tail of measures onto a history file, as the builder folds its days.
 */
import { isEvery, partsOf, plusDays, slotsPerDay, type Every } from './calendar.js';
import { canonicalJSON } from './canonical.js';
import { hashOf, utf8 } from './hash.js';
import { timeOf, type HistoryFile, type ValueHistory } from './history.js';
import { leafHash, rootOf } from './log.js';
import type { StepDef } from './document.js';
import type { FlowDocument } from './document.js';
import { propertyOf } from './ontology.js';
import { watchesOf, type FlowPlan, type NeedsPlan, type ReconcilePlan, type ScopePlan } from './plan.js';
import { minuteOfDay, numbersOf, profileColumn, quantile, type Kind } from './quality.js';

/** The checks that count a source's rows, as a history and a measures record name them: the step and its rules. */
export interface CheckRules {
  step: string;
  rules: { name: string; check: string; onFail: string }[];
}

/**
 * One load's numbers, the canonical record (E11): what the source's snapshot holds, counted exactly where a count is
 * kept, with a median and quantiles from the same even sample the profile takes.
 */
export interface Measures {
  smaltflMeasures: 0;
  /** The watched source's id, the slot the load covers (a day, or a slot of one, ADR 0010 §7) and its length. */
  source: string;
  slot: string;
  every: Every;
  /** The E1 sha256 of the load's bytes (null for a source read from a table), and its snapshot's dataset/0 hash. */
  file: string | null;
  snapshot: string;
  /** The checks whose counts `dropped` and `failed` are, or null when no checks read the source alone. */
  checks: CheckRules | null;
  columns: string[];
  types: string[];
  kinds: Kind[];
  rows: number;
  dropped: number;
  failed: number[];
  present: number[];
  p50: (number | null)[];
  quantiles: (number[] | null)[];
  sample: number;
  /** The rows in each part of the slot, by its time column (calendar.ts `partsOf`): a day's 24 hours, a slot's own hours
   * (3 hours or more) or quarter hours; none without one. A row whose time is outside the slot is in no part. */
  parts: number[];
  /** Each counted or followed column's values (each as JSON), and each pair's (`a|b`), with their rows, sorted by
   * the value's text. */
  values: Record<string, [value: string, rows: number][]>;
  pairs: Record<string, [value: string, rows: number][]>;
  /** The due marks' counts (ADR 0014 §3), by date column, only where the settings name a mark: the rows due on the
   * slot's day, and the rows still missed by each past due date within 90 days, sorted by date. */
  due?: Record<string, DueCounts>;
  /** The gate's rules' counts (ADR 0014 §4), only where the settings carry a rule: the scope's rows out of scope, keys
   * in scope with no row and keys in scope; each dependency rule's contradictions. */
  gate?: GateCounts;
}

export interface GateCounts {
  scope?: { out: number; missing: number; inScope: number };
  needs?: number[];
  /** The reconciliation's counts (ADR 0014 §6): the rows, the distinct keys, the rows with a blank key, the other
   * node's keys with no row here, the keys here not there. */
  reconcile?: ReconcileCounts;
}

export interface ReconcileCounts {
  rows: number;
  keys: number;
  blank: number;
  missing: number;
  extra: number;
}

/** A reconciliation's counts from the engine's row. */
export const reconcileOf = (row: readonly unknown[] | null | undefined): ReconcileCounts => ({ rows: Number(row?.[0] ?? 0), keys: Number(row?.[1] ?? 0), blank: Number(row?.[2] ?? 0), missing: Number(row?.[3] ?? 0), extra: Number(row?.[4] ?? 0) });

/** What a due mark counts of a load: rows due on the day, and the rows whose due date has passed and are still missed,
 * by due date. */
export interface DueCounts {
  on: number;
  late: [date: string, rows: number][];
}

/** How far back a load's missed due dates are counted: ninety days. */
export const DUE_LOOKBACK = 90;

/**
 * How a watched source's loads are measured: the same settings make the same record, and the plugin caches a file's
 * measures by its sha256 and these settings' canonical JSON. Counted columns are kept value by value each period,
 * followed ones only for the values new to them, and pairs among `paired`, in that order.
 */
export interface MeasureSettings {
  source: string;
  slot: string;
  every: Every;
  /** The checks as the document writes them (what the record names), and each one's text as the run counts it, its
   * parameters bound (the plan's). */
  checks: CheckRules | null;
  counting: string[] | null;
  counted: string[];
  followed: string[];
  paired: string[];
  /** The time column the parts are counted by, and its zone (null: the hour as the text writes it). */
  time: string | null;
  zone: string | null;
  sample: number;
  /** The ontology's due marks on the source (ADR 0014 §3), `[column, status, miss, within]`, sorted by column; only
   * where there are any, so every record measured before them is the same record. */
  due?: [column: string, status: string, miss: string, within: number][];
  /** The gate's rules (ADR 0014 §4, §6), as plan/4's watch carries them; only where the gate writes them. */
  scope?: ScopePlan;
  needs?: NeedsPlan[];
  reconcile?: ReconcilePlan;
}

/** The profile box's sample, as the app and the history take it (src/app/main.ts SAMPLE). */
export const SAMPLE = 2000;
/** A pair's cells are kept day by day while its combinations number this many or fewer (ADR 0013): 8 values by 8. */
export const PAIR_CELLS = 64;
/** Quantiles kept of a measure or a time (a time's in minutes of the day): history.ts QUANTILES. */
const PS = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
const NUMERIC = new Set(['int', 'real', 'num']);

/** The columns one scan reads, every row: the counted and followed ones the source has, then its time column. */
export function scanColumns(s: Pick<MeasureSettings, 'counted' | 'followed' | 'time' | 'due'>, columns: readonly string[]): string[] {
  const have = new Set(columns);
  return [...new Set([...s.counted, ...s.followed, ...(s.time ? [s.time] : []), ...(s.due ?? []).flatMap(([c, st]) => [c, st])])].filter((c) => have.has(c));
}

/** What a history's header says of how its periods were measured: enough to measure the next one the same way. */
export type HistoryHeader = Pick<HistoryFile, 'format' | 'columns' | 'values' | 'pairs' | 'sample'> & Partial<Pick<HistoryFile, 'time' | 'zone'>>;

/**
 * The checks that count a plan's watched source alone (ADR 0010 §6): the expectations whose one input is the source,
 * or the source's fill step (C7), as the run counts them. Null when none does.
 */
export function checksOf(plan: Pick<FlowPlan, 'nodes'>, node: number, steps?: readonly StepDef[]): { checks: CheckRules; counting: string[] } | null {
  const reads = (i: number) => i === node || (plan.nodes[i]?.op === 'fill' && plan.nodes[i]!.inputs[0] === node);
  const n = plan.nodes.find((x) => x.op === 'expect' && x.inputs.length === 1 && reads(x.inputs[0]!));
  if (!n || n.op !== 'expect') return null;
  // As the document writes them, when the caller has it: a rule with a parameter is the same rule whatever its value.
  const step = steps?.find((x) => x.id === n.origin);
  const written = step?.kind === 'expectations' && step.rules.length === n.rules.length ? step.rules : null;
  return {
    checks: { step: n.origin, rules: n.rules.map(([name, check, onFail], k) => ({ name, check: written?.[k]?.check ?? check, onFail })) },
    counting: n.rules.map(([, check]) => check),
  };
}

/**
 * How a plan's watched source is measured for its run's slot (ADR 0010 §6), the same for the page that tells the claim,
 * the run that judges it and verify: the columns its base history counts, follows and pairs, else the watch's `count`
 * and `follow`, else its bad and serious columns; the watch's time and zone (else the base's); the checks that read it
 * alone. Null for a node the plan doesn't watch, or a run with no slot.
 */
export function settingsFor(plan: Pick<FlowPlan, 'nodes' | 'parameters' | 'publish'>, node: number, base: HistoryHeader | null, steps?: readonly StepDef[]): MeasureSettings | null {
  const w = watchesOf(plan.publish).find((x) => x.node === node);
  if (!w || w.period === null) return null;
  const slot = plan.parameters[w.period];
  if (typeof slot !== 'string') return null;
  const st = w.settings;
  let counted: string[];
  let followed: string[];
  let paired: string[];
  if (base) {
    counted = Object.entries(base.values ?? {}).filter(([, vh]) => vh.counts).map(([c]) => c);
    followed = Object.entries(base.values ?? {}).filter(([, vh]) => !vh.counts).map(([c]) => c);
    paired = [...new Set(Object.keys(base.pairs ?? {}).flatMap((k) => k.split('|')))];
  } else {
    counted = st?.count ?? (st?.bad ?? []).map(([c]) => c);
    followed = st?.follow ?? (st?.newValues ?? []).map(([c]) => c).filter((c) => !counted.includes(c));
    paired = [];
  }
  const c = checksOf(plan, node, steps);
  return { source: plan.nodes[node]!.origin, slot, every: st?.every ?? 'day', checks: c?.checks ?? null, counting: c?.counting ?? null, counted, followed, paired, time: st?.time ?? (base ? timeOf(base) : null), zone: st?.zone ?? base?.zone ?? null, sample: base?.sample ?? SAMPLE, ...(st?.due?.length ? { due: st.due.map(([c, status, miss, within]): [string, string, string, number] => [c, status, miss, within]) } : {}), ...(st?.scope ? { scope: { ...st.scope } } : {}), ...(st?.needs?.length ? { needs: st.needs.map((n) => ({ table: n.table, key: n.key, when: n.when.map(([c, v]): [string, string[]] => [c, [...v]]), then: n.then.map(([c, v]): [string, string[]] => [c, [...v]]) })) } : {}), ...(st?.reconcile ? { reconcile: { key: [...st.reconcile.key], table: st.reconcile.table } } : {}) };
}

/**
 * The columns a watched node's history counts, follows and pairs when its watch doesn't say (ADR 0010 §6; the general
 * builder's rule, scripts/data/history.ts): counted, every column the ontology lists values or bad codes for; followed,
 * the columns a new value in is something wrong (`newValues: "alert"`) and not counted; paired, the counted columns of
 * twenty values or fewer, so any two multiply to four hundred or fewer. A watch's own `count` and `follow` win.
 */
export function watchColumns(doc: Pick<FlowDocument, 'ontology' | 'publish'>, source: string): { count: string[]; follow: string[]; pair: string[] } {
  const watch = Object.entries(doc.publish?.watch ?? {}).find(([id]) => id.toLowerCase() === source.toLowerCase())?.[1];
  const w = typeof watch === 'object' && watch !== null ? watch : null;
  const props = (doc.ontology?.properties ?? []).filter((p) => propertyOf(doc.ontology, source, p.column) === p);
  const count = [...new Set(w?.count ?? props.filter((p) => (p.values !== undefined && Object.keys(p.values).length > 0) || (p.bad?.length ?? 0) > 0).map((p) => p.column))];
  const follow = [...new Set((w?.follow ?? props.filter((p) => p.newValues === 'alert').map((p) => p.column)).filter((c) => !count.includes(c)))];
  const pair = count.filter((c) => {
    const p = props.find((x) => x.column === c);
    return p?.values !== undefined && Object.keys(p.values).length <= 20;
  });
  return { count, follow, pair };
}

/** What the engine counted of a load, for `measuresOf`. */
export interface MeasureInput {
  file: string | null;
  snapshot: string;
  /** The snapshot's columns and their types. */
  schema: readonly (readonly [string, string])[];
  /** emitColumnFacts' row: the rows, then each column's present, distinct, min, max and mean. */
  facts: readonly unknown[];
  /** emitSample's rows, every `ceil(rows / sample)`-th, all columns. */
  sample: readonly (readonly unknown[])[];
  /** Every row of `scanColumns`, in that order. */
  scan: readonly (readonly unknown[])[];
  /** The checks' row (emitRuleCounts): the rows, each rule's failures, the rows the drop rules leave out; null without checks. */
  checks: readonly unknown[] | null;
  /** The scope rule's row (emitScopeCounts), the dependency rules' row (emitNeedsCounts) and the reconciliation's row
   * (emitReconcileCounts), where the settings have them. */
  scope?: readonly unknown[] | null;
  needs?: readonly unknown[] | null;
  reconcile?: readonly unknown[] | null;
}

/** The hour of a time in a zone, or as the text writes it (characters 12–13) with no zone; null when it has none. */
export function hourOf(t: unknown, zone: string | null): number | null {
  if (zone === null) {
    if (typeof t !== 'string' || t.length < 13) return null;
    const h = Number(t.slice(11, 13));
    return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
  }
  const ms = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`) : NaN;
  if (!Number.isFinite(ms)) return null;
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(ms));
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
}

/**
 * A load's rows by hour and by one column's value (story.ts HourValues), from emitHourValues' rows: each stamp's hour
 * read as a row's time is read for its parts (`hourOf`, in the source's zone), each value as JSON, as a history writes
 * it. A stamp with no hour is in no hour, as a row with no time is in no part.
 */
export function hourValuesOf(rows: readonly (readonly unknown[])[], column: string, zone: string | null): { column: string; values: Record<string, number[]> } {
  const values: Record<string, number[]> = {};
  for (const [stamp, value, n] of rows) {
    const hr = hourOf(stamp, zone);
    if (hr === null) continue;
    const key = JSON.stringify(value ?? null);
    (values[key] ??= new Array<number>(24).fill(0))[hr]! += Number(n);
  }
  return { column, values };
}

/**
 * The minute of the day of a time in a zone, or as the text writes it (characters 12–16) with no zone, with the date
 * it falls on; null when it has none. What a slot's parts are counted by.
 */
export function minuteOf(t: unknown, zone: string | null): { day: string; minute: number } | null {
  if (zone === null) {
    if (typeof t !== 'string' || t.length < 16) return null;
    const h = Number(t.slice(11, 13));
    const m = Number(t.slice(14, 16));
    return Number.isInteger(h) && h >= 0 && h < 24 && Number.isInteger(m) && m >= 0 && m < 60 ? { day: t.slice(0, 10), minute: h * 60 + m } : null;
  }
  const ms = typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t.replace(' ', 'T')}Z`) : NaN;
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ms);
  const at = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  const h = Number(at('hour'));
  const m = Number(at('minute'));
  return Number.isInteger(h) && h >= 0 && h < 24 && Number.isInteger(m) ? { day: `${at('year')}-${at('month')}-${at('day')}`, minute: h * 60 + m } : null;
}

const byText = (a: readonly [string, number], b: readonly [string, number]) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const six = (x: number) => Number(x.toPrecision(6));

/** A load's measures (E11), from what the engine counted of its snapshot. */
export function measuresOf(s: MeasureSettings, x: MeasureInput): Measures {
  const rows = Number(x.facts[0]);
  const kinds: Kind[] = [];
  const p50: (number | null)[] = [];
  const present: number[] = [];
  const quantiles: (number[] | null)[] = [];
  x.schema.forEach(([name, type], k) => {
    const values = x.sample.map((r) => r[k]);
    const f = x.facts;
    const p = profileColumn(name, type, { rows, present: Number(f[1 + 5 * k]), distinct: Number(f[2 + 5 * k]), min: f[3 + 5 * k], max: f[4 + 5 * k], mean: num(f[5 + 5 * k]) }, values);
    kinds.push(p.kind);
    present.push(p.facts.present);
    const xs = p.kind === 'time' ? values.map(minuteOfDay).filter((v): v is number => v !== null) : NUMERIC.has(type) ? numbersOf('measure', values) : [];
    xs.sort((a, b) => a - b);
    p50.push(xs.length ? six(quantile(xs, 0.5)) : null);
    quantiles.push(xs.length && (p.kind === 'measure' || p.kind === 'time') ? PS.map((q) => six(quantile(xs, q))) : null);
  });
  const columns = x.schema.map(([c]) => c);
  const scanned = scanColumns(s, columns);
  const at = (c: string) => scanned.indexOf(c);
  const singles = new Map<string, Map<string, number>>();
  for (const c of [...s.counted, ...s.followed]) if (at(c) >= 0 && !singles.has(c)) singles.set(c, new Map());
  const paired = s.paired.filter((c) => at(c) >= 0);
  const pairs = new Map<string, Map<string, number>>();
  for (let a = 0; a < paired.length; a++) for (let b = a + 1; b < paired.length; b++) pairs.set(`${paired[a]}|${paired[b]}`, new Map());
  // A day's parts are its hours, whatever the date its times say (a time of another day is the checks' to drop); a
  // slot's are its own hours or quarter hours, of its own day: a row outside the slot is in none (ADR 0010 §7).
  const slotted = s.every !== 'day';
  const part = partsOf(s.slot, s.every);
  const parts = s.time && at(s.time) >= 0 ? new Array<number>(part.count).fill(0) : [];
  const time = s.time ? at(s.time) : -1;
  const slotDay = s.slot.slice(0, 10);
  // Each column's values as JSON, each text made once: a value's id is its place in its column's list, and a pair's
  // rows are counted by the two ids, its text made at the end. The same counts as one text a cell.
  const cols = [...singles.keys()];
  const place = cols.map((c) => at(c));
  const texts = cols.map(() => new Map<unknown, number>());
  const said: string[][] = cols.map(() => []);
  const counts: number[][] = cols.map(() => []);
  const ix = new Map(cols.map((c, k) => [c, k]));
  const pairOf = [...pairs.keys()].map((name) => name.split('|').map((c) => ix.get(c)!) as [number, number]);
  const pairCounts = pairOf.map(() => new Map<number, number>());
  const ids = new Array<number>(cols.length);
  // The due marks (ADR 0014 §3): a date column's rows due on the slot's day, and the rows still missed by each past due
  // date within the lookback, counted from the same scan.
  const dues = (s.due ?? []).filter(([c, st]) => at(c) >= 0 && at(st) >= 0).map(([c, st, miss]) => ({ column: c, dAt: at(c), sAt: at(st), miss, on: 0, late: new Map<string, number>() }));
  const floor = plusDays(slotDay, -DUE_LOOKBACK);
  for (const r of x.scan) {
    for (const d of dues) {
      const v = r[d.dAt];
      if (typeof v !== 'string' || v.length < 10) continue;
      const date = v.slice(0, 10);
      if (date === slotDay) d.on++;
      else if (date < slotDay && date >= floor && String(r[d.sAt] ?? '') === d.miss) d.late.set(date, (d.late.get(date) ?? 0) + 1);
    }
    for (let k = 0; k < cols.length; k++) {
      const v = r[place[k]!] ?? null;
      let id = texts[k]!.get(v);
      if (id === undefined) {
        const text = JSON.stringify(v);
        // Two raw values with one text (a number and its string never share a column, but -0 and 0 do) share an id.
        id = said[k]!.indexOf(text);
        if (id < 0) {
          id = said[k]!.length;
          said[k]!.push(text);
          counts[k]!.push(0);
        }
        texts[k]!.set(v, id);
      }
      ids[k] = id;
      counts[k]![id]!++;
    }
    for (let p = 0; p < pairOf.length; p++) {
      const [a, b] = pairOf[p]!;
      const key = ids[a]! * 1048576 + ids[b]!;
      const m = pairCounts[p]!;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    if (time >= 0) {
      if (!slotted) {
        const h = hourOf(r[time], s.zone);
        if (h !== null) parts[h]!++;
      } else {
        const t = minuteOf(r[time], s.zone);
        const k = t && t.day === slotDay ? Math.floor((t.minute - part.start) / part.width) : -1;
        if (k >= 0 && k < part.count) parts[k]!++;
      }
    }
  }
  cols.forEach((c, k) => {
    const m = singles.get(c)!;
    said[k]!.forEach((text, id) => m.set(text, counts[k]![id]!));
  });
  [...pairs.values()].forEach((m, p) => {
    const [a, b] = pairOf[p]!;
    for (const [key, n] of pairCounts[p]!) m.set(`[${said[a]![Math.floor(key / 1048576)]},${said[b]![key % 1048576]}]`, n);
  });
  const sorted = (m: Map<string, Map<string, number>>) => Object.fromEntries([...m].map(([k, v]) => [k, [...v.entries()].sort(byText)]));
  const c = x.checks;
  const n = s.checks?.rules.length ?? 0;
  if (c && Number(c[0]) !== rows) throw new Error(`${s.source} ${s.slot}: ${rows} rows profiled, ${Number(c[0])} checked`);
  return {
    smaltflMeasures: 0,
    source: s.source,
    slot: s.slot,
    every: s.every,
    file: x.file,
    snapshot: x.snapshot,
    checks: s.checks ? { step: s.checks.step, rules: s.checks.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })) } : null,
    columns,
    types: x.schema.map(([, t]) => t),
    kinds,
    rows,
    dropped: c ? Number(c[n + 1]) : 0,
    failed: c ? Array.from({ length: n }, (_, k) => Number(c[k + 1])) : [],
    present,
    p50,
    quantiles,
    sample: s.sample,
    parts,
    values: sorted(singles),
    pairs: sorted(pairs),
    ...(s.due?.length ? { due: Object.fromEntries(dues.map((d) => [d.column, { on: d.on, late: [...d.late.entries()].sort(byText) }])) } : {}),
    ...(s.scope || s.needs?.length || s.reconcile
      ? { gate: { ...(s.scope ? { scope: { out: Number(x.scope?.[0] ?? 0), missing: Number(x.scope?.[1] ?? 0), inScope: Number(x.scope?.[2] ?? 0) } } : {}), ...(s.needs?.length ? { needs: s.needs.map((_, i) => Number(x.needs?.[i] ?? 0)) } : {}), ...(s.reconcile ? { reconcile: reconcileOf(x.reconcile) } : {}) } }
      : {}),
  };
}

/** A measures record's hash (E11): SHA-256 of `smaltfl/measures/0\n` and its canonical JSON. */
export const measuresHash = (m: Measures): Promise<string> => hashOf('measures/0', m);

/** A measures record's leaf in its source's tail (E12): the RFC 9162 leaf over the same bytes its hash covers. */
export const measuresLeaf = (m: Measures): string => leafHash(utf8(`smaltfl/measures/0\n${canonicalJSON(m as unknown as Parameters<typeof canonicalJSON>[0])}`));

/** A tail as a claim names it (E12): its size and root; null for an empty one. */
export interface TailRef {
  size: number;
  root: string;
}

/** The root of a tail of measures, in its order (E12 tail/0); null when it is empty. */
export function tailRef(ms: readonly Measures[]): TailRef | null {
  if (ms.length === 0) return null;
  return { size: ms.length, root: rootOf(ms.map(measuresLeaf)) };
}

/**
 * A source's tail before a slot (ADR 0010 §6): the periods appended from its own runs, one per slot (the first to
 * arrive, C5), in slot order, before the slot judged. A period is judged by the base plus this.
 */
export function tailBefore(tail: readonly Measures[], slot: string): Measures[] {
  return [...tail].filter((m) => m.slot < slot).sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
}

/** Why a value isn't a measures record a run could have made, or null when it is one: a tail file is checked so. */
export function measuresProblem(m: unknown): string | null {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return "isn't a record";
  const r = m as Record<string, unknown>;
  if (r.smaltflMeasures !== 0) return "isn't measures/0";
  if (typeof r.source !== 'string' || typeof r.slot !== 'string' || !isEvery(r.every)) return 'names no source and slot';
  if (!Number.isSafeInteger(r.rows) || (r.rows as number) < 0) return 'counts no rows';
  for (const k of ['columns', 'types', 'kinds', 'failed', 'present', 'p50', 'quantiles', 'parts'] as const) if (!Array.isArray(r[k])) return `has no ${k}`;
  for (const k of ['values', 'pairs'] as const) if (typeof r[k] !== 'object' || r[k] === null || Array.isArray(r[k])) return `has no ${k}`;
  if (r.due !== undefined && (typeof r.due !== 'object' || r.due === null || Array.isArray(r.due))) return 'has due counts that aren’t by column';
  if (r.gate !== undefined && (typeof r.gate !== 'object' || r.gate === null || Array.isArray(r.gate))) return 'has gate counts that aren’t a record';
  return null;
}

// ------------------------------------------------------------------ periods of a history file

/** What a history file keeps of one period: the numbers a load's measures must equal for the file to tell its story. */
export interface Period {
  slot: string;
  rows: number;
  dropped: number;
  failed: number[];
  present: number[];
  p50: (number | null)[];
  quantiles: (number[] | null)[];
  parts: number[];
  /** Each counted column's values with rows that period, and each pair's cells kept day by day (`a|b`), sorted by
   * the value's text. */
  counts: Record<string, [string, number][]>;
  /** The due marks' counts that period (ADR 0014 §3), by column, where the history keeps them. */
  due: Record<string, DueCounts>;
  /** The gate's rules' counts that period (ADR 0014 §4), where the history keeps them. */
  gate: GateCounts;
}

/** A history file's period `k`: the numbers it keeps of it. */
export function periodOf(file: HistoryFile, k: number): Period {
  const counts: Record<string, [string, number][]> = {};
  for (const [column, vh] of [...Object.entries(file.values ?? {}), ...Object.entries(file.pairs ?? {})]) {
    if (!vh.counts) continue;
    counts[column] = vh.values.flatMap((v, i): [string, number][] => ((vh.counts![k]?.[i] ?? 0) > 0 ? [[v, vh.counts![k]![i]!]] : [])).sort(byText);
  }
  const due: Record<string, DueCounts> = {};
  for (const [column, dh] of Object.entries(file.due ?? {})) due[column] = { on: dh.on[k] ?? 0, late: (dh.late[k] ?? []).map(([d, n]): [string, number] => [d, n]) };
  const gate: GateCounts = { ...(file.gate?.scope ? { scope: { out: file.gate.scope.out[k] ?? 0, missing: file.gate.scope.missing[k] ?? 0, inScope: file.gate.scope.inScope[k] ?? 0 } } : {}), ...(file.gate?.needs ? { needs: [...(file.gate.needs[k] ?? [])] } : {}), ...(file.gate?.reconcile ? { reconcile: { ...(file.gate.reconcile[k] ?? { rows: 0, keys: 0, blank: 0, missing: 0, extra: 0 }) } } : {}) };
  return { slot: file.days[k]!, rows: file.rows[k]!, dropped: file.dropped[k]!, failed: [...file.failed[k]!], present: [...file.present[k]!], p50: [...file.p50[k]!], quantiles: (file.quantiles[k] ?? []).map((q) => (q ? [...q] : null)), parts: [...(file.hours[k] ?? [])], counts, due, gate };
}

/** The same numbers of a load's measures, as `file` keeps them: its counted columns are those it counts each period. */
export function periodOfMeasures(m: Measures, file: Pick<HistoryFile, 'values' | 'pairs' | 'due' | 'gate'>): Period {
  const counts: Record<string, [string, number][]> = {};
  for (const [column, vh] of Object.entries(file.values ?? {})) if (vh.counts) counts[column] = (m.values[column] ?? []).filter(([, n]) => n > 0).map(([v, n]): [string, number] => [v, n]).sort(byText);
  for (const [pair, vh] of Object.entries(file.pairs ?? {})) if (vh.counts) counts[pair] = (m.pairs[pair] ?? []).filter(([, n]) => n > 0).map(([v, n]): [string, number] => [v, n]).sort(byText);
  const due: Record<string, DueCounts> = {};
  for (const column of Object.keys(file.due ?? {})) due[column] = { on: m.due?.[column]?.on ?? 0, late: (m.due?.[column]?.late ?? []).map(([d, n]): [string, number] => [d, n]) };
  const gate: GateCounts = { ...(file.gate?.scope ? { scope: { out: m.gate?.scope?.out ?? 0, missing: m.gate?.scope?.missing ?? 0, inScope: m.gate?.scope?.inScope ?? 0 } } : {}), ...(file.gate?.needs ? { needs: file.gate.needs[0] ? file.gate.needs[0].map((_, i) => m.gate?.needs?.[i] ?? 0) : [...(m.gate?.needs ?? [])] } : {}), ...(file.gate?.reconcile ? { reconcile: { ...(m.gate?.reconcile ?? { rows: 0, keys: 0, blank: 0, missing: 0, extra: 0 }) } } : {}) };
  return { slot: m.slot, rows: m.rows, dropped: m.dropped, failed: [...m.failed], present: [...m.present], p50: [...m.p50], quantiles: m.quantiles.map((q) => (q ? [...q] : null)), parts: [...m.parts], counts, due, gate };
}

/**
 * Where a history file's period `k` differs from a load's measures, or null when it tells the same numbers: every
 * number it keeps of the period, the columns, and for a column or pair it follows only for new values, the values it
 * says were first seen that day and the rows they brought.
 */
export function samePeriod(file: HistoryFile, k: number, m: Measures): string | null {
  if (file.days[k] !== m.slot) return `the file's period ${k} is ${file.days[k] ?? 'none'}, the measures' ${m.slot}`;
  if (canonicalJSON(file.columns) !== canonicalJSON(m.columns) || canonicalJSON(file.types) !== canonicalJSON(m.types)) return 'its columns differ';
  const a = periodOf(file, k);
  const b = periodOfMeasures(m, file);
  for (const key of ['rows', 'dropped', 'failed', 'present', 'p50', 'quantiles', 'parts', 'counts', 'due', 'gate'] as const) {
    if (canonicalJSON(a[key] as Parameters<typeof canonicalJSON>[0]) !== canonicalJSON(b[key] as Parameters<typeof canonicalJSON>[0])) return `its ${key} differ`;
  }
  const fresh = (vh: ValueHistory, entries: readonly [string, number][], name: string): string | null => {
    const seen = new Map(entries);
    const novel = vh.values.flatMap((v, i) => (vh.first[i] === k ? [v] : []));
    if (novel.some((v) => !seen.has(v))) return `${name}: a value first seen that day isn't in the load`;
    if ([...seen.keys()].some((v) => {
      const i = vh.values.indexOf(v);
      return i < 0 || vh.first[i]! > k || vh.last[i]! < k;
    })) return `${name}: a value in the load isn't one the file saw that day`;
    const rows = novel.reduce((t, v) => t + seen.get(v)!, 0);
    const said = vh.fresh.find(([d]) => d === k)?.[1] ?? 0;
    return k >= file.warmup && rows !== said ? `${name}: ${rows} rows of new values, the file says ${said}` : null;
  };
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    const why = fresh(vh, m.values[column] ?? [], column);
    if (why) return why;
  }
  for (const [pair, vh] of Object.entries(file.pairs ?? {})) {
    const why = fresh(vh, m.pairs[pair] ?? [], pair);
    if (why) return why;
  }
  return null;
}

/** A history file with no periods yet, for a source whose base is empty: its header from the settings and the first
 * load's columns, its counted and followed columns and pairs declared. */
export function emptyHistory(o: { flow: string; source: string; settings: Pick<MeasureSettings, 'checks' | 'counted' | 'followed' | 'paired' | 'time' | 'zone' | 'sample'> & Partial<Pick<MeasureSettings, 'every' | 'due' | 'scope' | 'needs' | 'reconcile'>>; columns: string[]; types: string[]; kinds: Kind[]; warmup?: number; built?: string }): HistoryFile {
  const s = o.settings;
  const have = new Set(o.columns);
  const vh = (counted: boolean): ValueHistory => ({ values: [], first: [], last: [], days: [], rows: [], fresh: [], ...(counted ? { counts: [] } : {}) });
  const values: Record<string, ValueHistory> = {};
  for (const c of s.counted) if (have.has(c)) values[c] = vh(true);
  for (const c of s.followed) if (have.has(c) && !values[c]) values[c] = vh(false);
  // A pair's cells are counted day by day too, while they are few (PAIR_CELLS; ADR 0013): what the combination judge
  // reads. A pair that grows past that is followed for new combinations only, as every pair was before.
  const paired = s.paired.filter((c) => have.has(c));
  const pairs: Record<string, ValueHistory> = {};
  for (let a = 0; a < paired.length; a++) for (let b = a + 1; b < paired.length; b++) pairs[`${paired[a]}|${paired[b]}`] = vh(true);
  // The due marks' counts (ADR 0014 §3), kept day by day for each marked column the source has.
  const due: HistoryFile['due'] = {};
  for (const [column, status, miss, within] of s.due ?? []) if (have.has(column) && have.has(status)) due[column] = { status, miss, within, on: [], late: [] };
  return {
    format: 'smaltfl-history/3', built: o.built ?? '', flow: o.flow, source: o.source, every: s.every ?? 'day', time: s.time, zone: s.zone, skipped: [],
    step: s.checks?.step ?? '', rules: s.checks?.rules.map((r) => ({ ...r })) ?? [],
    columns: [...o.columns], types: [...o.types], kinds: [...o.kinds], sample: s.sample,
    days: [], rows: [], dropped: [], failed: [], present: [], p50: [], missing: [], quantiles: [], hours: [], warmup: o.warmup ?? 28 * slotsPerDay(s.every ?? 'day'), values, pairs,
    ...(Object.keys(due).length ? { due } : {}),
    // The gate's rules' counts (ADR 0014 §4), kept day by day where the gate writes a rule.
    ...(s.scope || s.needs?.length || s.reconcile ? { gate: { ...(s.scope ? { scope: { out: [], missing: [], inScope: [] } } : {}), ...(s.needs?.length ? { needs: [] } : {}), ...(s.reconcile ? { reconcile: [] } : {}) } } : {}),
  };
}

/**
 * A history file with a tail of measures folded in after its last period (ADR 0010 §6), as the builder folds its days:
 * each value's first and last period, the periods it was seen and its rows; the rows of values never seen before, once
 * the warmup is past; and each counted column's rows a period. Values stay in order of rows over the history (ties
 * keep their order). The file itself is left as it was. A period at or before the file's last, or out of order, or of
 * other columns, is refused: the tail extends the file.
 */
export function appendPeriods(file: HistoryFile, ms: readonly Measures[]): HistoryFile {
  if (ms.length === 0) return file;
  const out: HistoryFile = structuredClone(file);
  if (out.days.length === 0 && out.columns.length === 0) {
    out.columns = [...ms[0]!.columns];
    out.types = [...ms[0]!.types];
    out.kinds = [...ms[0]!.kinds];
  }
  const touched = new Set<ValueHistory>();
  for (const m of ms) {
    const last = out.days.at(-1);
    if (last !== undefined && m.slot <= last) throw new Error(`the tail's ${m.slot} isn't after the history's ${last}`);
    if ((m.every ?? 'day') !== (out.every ?? 'day')) throw new Error(`the tail's ${m.slot} is a load of ${m.every}, the history's of ${out.every ?? 'day'}`);
    if (canonicalJSON(m.columns) !== canonicalJSON(out.columns) || canonicalJSON(m.types) !== canonicalJSON(out.types)) throw new Error(`the tail's ${m.slot} has other columns than the history`);
    const d = out.days.length;
    // A period counted with other checks than the latest starts their segment (ADR 0010 §6): the checks' numbers are
    // judged only from periods counted with the rules in force.
    const step = m.checks?.step ?? '';
    const rules = m.checks?.rules ?? [];
    const sameRules = out.step === step && out.rules.length === rules.length && out.rules.every((r, k) => r.name === rules[k]!.name && r.check === rules[k]!.check && r.onFail === rules[k]!.onFail);
    if (!sameRules) {
      if (d > 0) out.checks = [...(out.checks ?? [{ from: 0, step: out.step, rules: out.rules.map((r) => ({ ...r })) }]), { from: d, step, rules: rules.map((r) => ({ ...r })) }];
      out.step = step;
      out.rules = rules.map((r) => ({ ...r }));
    }
    out.days.push(m.slot);
    out.rows.push(m.rows);
    out.dropped.push(m.dropped);
    out.failed.push([...m.failed]);
    out.present.push([...m.present]);
    out.p50.push([...m.p50]);
    out.quantiles.push(m.quantiles.map((q) => (q ? [...q] : null)));
    out.hours.push([...m.parts]);
    for (const [column, dh] of Object.entries(out.due ?? {})) {
      dh.on.push(m.due?.[column]?.on ?? 0);
      dh.late.push((m.due?.[column]?.late ?? []).map(([d, n]): [string, number] => [d, n]));
    }
    if (out.gate?.scope) {
      out.gate.scope.out.push(m.gate?.scope?.out ?? 0);
      out.gate.scope.missing.push(m.gate?.scope?.missing ?? 0);
      out.gate.scope.inScope.push(m.gate?.scope?.inScope ?? 0);
    }
    if (out.gate?.needs) out.gate.needs.push([...(m.gate?.needs ?? [])]);
    if (out.gate?.reconcile) out.gate.reconcile.push({ ...(m.gate?.reconcile ?? { rows: 0, keys: 0, blank: 0, missing: 0, extra: 0 }) });
    const fold = (vh: ValueHistory, entries: readonly [string, number][]) => {
      touched.add(vh);
      let novel = 0;
      const row = vh.counts ? new Array<number>(vh.values.length).fill(0) : null;
      for (const [key, n] of entries) {
        let i = vh.values.indexOf(key);
        if (i < 0) {
          i = vh.values.length;
          vh.values.push(key);
          vh.first.push(d);
          vh.last.push(d);
          vh.days.push(0);
          vh.rows.push(0);
          row?.push(0);
          if (d >= out.warmup) novel += n;
        }
        vh.last[i] = d;
        vh.days[i]!++;
        vh.rows[i]! += n;
        if (row) row[i] = n;
      }
      if (novel) vh.fresh.push([d, novel]);
      if (vh.counts && row) vh.counts.push(row);
    };
    for (const [column, vh] of Object.entries(out.values ?? {})) fold(vh, m.values[column] ?? []);
    for (const [pair, vh] of Object.entries(out.pairs ?? {})) {
      fold(vh, m.pairs[pair] ?? []);
      // Past PAIR_CELLS combinations the pair's cells are no longer kept day by day (ADR 0013): its counts go, for good.
      if (vh.counts && vh.values.length > PAIR_CELLS) delete vh.counts;
    }
  }
  // In order of rows over the history, as the builder writes them.
  for (const vh of touched) {
    const order = vh.values.map((_, i) => i).sort((a, b) => vh.rows[b]! - vh.rows[a]!);
    if (order.every((i, j) => i === j)) {
      if (vh.counts) vh.counts = vh.counts.map((r) => (r.length < vh.values.length ? [...r, ...new Array<number>(vh.values.length - r.length).fill(0)] : r));
      continue;
    }
    const pick = <T>(xs: T[]) => order.map((i) => xs[i]!);
    vh.values = pick(vh.values);
    vh.first = pick(vh.first);
    vh.last = pick(vh.last);
    vh.days = pick(vh.days);
    vh.rows = pick(vh.rows);
    if (vh.counts) vh.counts = vh.counts.map((r) => order.map((i) => r[i] ?? 0));
  }
  return out;
}
