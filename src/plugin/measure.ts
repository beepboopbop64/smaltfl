/**
 * Measuring a load in the engine (ADR 0010 §6, E11): the numbers of a watched source's snapshot, counted by the
 * statements emit.ts writes and assembled by core/measures.ts, so the history builder, a run and verify make the same
 * record from the same rows.
 *
 *   measure [{ table, settings }]  → Measures   a source table before its run (a pinned file, as the page asks for it
 *                                               to tell its claim), copied and hashed as a run's snapshot is
 *
 * A file's measures are cached by its sha256 and the settings' canonical JSON: the page asks before the run, and the run
 * takes the same record when its snapshot is the one measured (the same content hash). A table that reads no pinned
 * file is measured again every time.
 */
import type { Database } from 'smaltdb/engine';
import { isEvery, isSlotOf } from '../core/calendar.js';
import { canonicalJSON } from '../core/canonical.js';
import { createTable, emitColumnFacts, emitNeedsCounts, emitRuleCounts, emitSample, emitScopeCounts } from '../core/emit.js';
import { hex } from '../core/hash.js';
import { isHistory, type HistoryFile } from '../core/history.js';
import { measuresLeaf, measuresOf, measuresProblem, scanColumns, type HistoryHeader, type MeasureSettings, type Measures } from '../core/measures.js';
import type { Column } from '../core/plan.js';
import { quoteIdent as q } from '../core/sqltext.js';
import { hashTable, sourceColumns } from './dataset-hash.js';
import { pinned, pinnedLocation, PINNED_PREFIX } from './pinned.js';

const NUMERIC = new Set(['int', 'real', 'num']);
/** Files' measures, by sha256 and settings; the oldest goes first past the limit. */
const cache = new Map<string, Measures>();
const LIMIT = 64;

const keyOf = (file: string, s: MeasureSettings) => `${file}\n${canonicalJSON(s as unknown as Parameters<typeof canonicalJSON>[0])}`;

export class MeasureError extends Error {
  override name = 'MeasureError';
}

function remember(key: string, m: Measures): void {
  cache.delete(key);
  cache.set(key, m);
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
}

/** The settings a caller sends, checked to be settings: anything else is refused, never guessed at. */
export function settingsOf(v: unknown): MeasureSettings {
  const s = v as MeasureSettings;
  const names = (x: unknown) => Array.isArray(x) && x.every((c) => typeof c === 'string');
  if (typeof s !== 'object' || s === null || typeof s.source !== 'string' || typeof s.slot !== 'string' || !isEvery(s.every) || (s.every !== 'day' && !isSlotOf(s.slot, s.every))
    || !names(s.counted) || !names(s.followed) || !names(s.paired) || !(s.time === null || typeof s.time === 'string') || !(s.zone === null || typeof s.zone === 'string')
    || !Number.isSafeInteger(s.sample) || s.sample < 1
    || !(s.counting === null || (names(s.counting) && s.checks !== null && s.counting.length === s.checks.rules.length))
    || !(s.checks === null || (typeof s.checks === 'object' && typeof s.checks.step === 'string' && Array.isArray(s.checks.rules) && s.checks.rules.every((r) => typeof r?.name === 'string' && typeof r.check === 'string' && typeof r.onFail === 'string')))
    || !(s.due === undefined || (Array.isArray(s.due) && s.due.every((d) => Array.isArray(d) && d.length === 4 && typeof d[0] === 'string' && typeof d[1] === 'string' && typeof d[2] === 'string' && Number.isInteger(d[3]) && d[3] >= 1)))
    || !(s.scope === undefined || (typeof s.scope === 'object' && s.scope !== null && typeof s.scope.table === 'string' && typeof s.scope.key === 'string' && typeof s.scope.own === 'string' && typeof s.scope.where === 'string'))
    || !(s.needs === undefined || (Array.isArray(s.needs) && s.needs.every((n) => typeof n === 'object' && n !== null && (n.table === null || typeof n.table === 'string') && (n.key === null || typeof n.key === 'string') && Array.isArray(n.when) && Array.isArray(n.then))))) {
    throw new MeasureError('measure needs its settings: { source, slot, every (day, or a slot of it: 12h … 1h), checks, counting, counted, followed, paired, time, zone, sample, due?, scope?, needs? }, its slot one of that length');
  }
  if (s.every !== 'day' && s.time === null) throw new MeasureError(`a load of ${s.every} is counted by its time column: its settings name none`);
  return { source: s.source, slot: s.slot, every: s.every, checks: s.checks ? { step: s.checks.step, rules: s.checks.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })) } : null, counting: s.counting ? [...s.counting] : null, counted: [...s.counted], followed: [...s.followed], paired: [...s.paired], time: s.time, zone: s.zone, sample: s.sample, ...(s.due?.length ? { due: s.due.map(([c, st, miss, within]): [string, string, string, number] => [c, st, miss, within]) } : {}), ...(s.scope ? { scope: { table: s.scope.table, key: s.scope.key, own: s.scope.own, where: s.scope.where } } : {}), ...(s.needs?.length ? { needs: s.needs.map((n) => ({ table: n.table, key: n.key, when: n.when.map(([c, v]: [string, readonly string[]]): [string, string[]] => [c, [...v]]), then: n.then.map(([c, v]: [string, readonly string[]]): [string, string[]] => [c, [...v]]) })) } : {}) };
}

/** A snapshot's measures: its rows counted where a count is kept, an even sample for the medians and quantiles. */
export async function measureTable(db: Database, table: string, s: MeasureSettings, file: string | null, snapshot: string): Promise<Measures> {
  const read = `SELECT * FROM ${q(table)}`;
  const st = db.prepare(read);
  const types = st.columnTypes;
  const schema: Column[] = st.columns.map((name, k): Column => [name, types[k] as Column[1]]);
  const facts = (await db.queryAsync(emitColumnFacts(read, schema.map(([name, type]) => ({ name, numeric: NUMERIC.has(type) }))))).rows[0]!;
  const rows = Number(facts[0]);
  const sample = rows ? (await db.queryAsync(emitSample(read, schema.map(([c]) => c), Math.ceil(rows / s.sample)))).rows : [];
  const wanted = scanColumns(s, schema.map(([c]) => c));
  const scan = rows && wanted.length ? (await db.queryAsync(emitSample(read, wanted, 1))).rows : [];
  // The checks as the run counts them: their parameters bound.
  const checks = s.checks ? (await db.queryAsync(emitRuleCounts(read, s.checks.rules.map((r, k) => [r.name, s.counting?.[k] ?? r.check, r.onFail] as const)))).rows[0]! : null;
  // The gate's rules (ADR 0014 §4): the scope's counts against the inventory's table, each dependency's contradictions.
  const scope = s.scope ? (await db.queryAsync(emitScopeCounts(read, s.scope))).rows[0]! : null;
  const needs = s.needs?.length ? (await db.queryAsync(emitNeedsCounts(read, s.needs))).rows[0]! : null;
  return measuresOf(s, { file, snapshot, schema, facts, sample, scan, checks, scope, needs });
}

/**
 * A run's watched snapshot measured (ADR 0010 §6): the cached record of its file when that record is of the same
 * snapshot, else measured now (and cached, for a pinned file).
 */
export async function measureSnapshot(db: Database, table: string, s: MeasureSettings, file: string | null, snapshot: string): Promise<Measures> {
  const key = file ? keyOf(file, s) : null;
  const known = key ? cache.get(key) : undefined;
  if (known && known.snapshot === snapshot) return structuredClone(known);
  const m = await measureTable(db, table, s, file, snapshot);
  if (key) remember(key, m);
  return structuredClone(m);
}

/**
 * The plugin's `measure`: a source table measured before its run, as the page asks for it to tell its claim. The table
 * is copied and hashed as a snapshot is (its dataset/0 content hash), and a pinned file's measures are cached by its
 * sha256 and the settings, which the run then takes.
 */
export async function measure(db: Database, input: unknown): Promise<Measures> {
  const i = input as { table?: unknown; settings?: unknown };
  if (typeof i !== 'object' || i === null || typeof i.table !== 'string' || i.table === '') throw new MeasureError('measure names the source table: { table, settings }');
  const s = settingsOf(i.settings);
  const location = pinnedLocation(db, i.table);
  const pin = location ? pinned(location.slice(PINNED_PREFIX.length)) : undefined;
  if (location && !pin) throw new MeasureError(`${i.table} reads ${location}, which isn't pinned`);
  const key = pin ? keyOf(pin.sha256, s) : null;
  const known = key ? cache.get(key) : undefined;
  if (known) return structuredClone(known);
  const columns = sourceColumns(db, i.table, db.prepare(`SELECT * FROM ${q(i.table)}`)) as Column[];
  const stage = `_smaltfl_measure_${hex(crypto.getRandomValues(new Uint8Array(8)))}`;
  db.exec(createTable(stage, columns));
  try {
    await db.runAsync(`INSERT INTO ${q(stage)} SELECT * FROM ${q(i.table)}`);
    const h = await hashTable(db, stage);
    const m = await measureTable(db, stage, s, pin?.sha256 ?? null, h.content);
    if (key) remember(key, m);
    return structuredClone(m);
  } finally {
    db.exec(`DROP TABLE IF EXISTS ${q(stage)}`);
  }
}

/** Pinned histories' headers and tails, by sha256: parsed once. */
const parsed = new Map<string, HistoryHeader | { leaves: string[] } | { problem: string } | null>();

/**
 * The header of the base history pinned under a watch's name (what a load is measured by: settingsFor), or null when
 * none is pinned or it isn't a history.
 */
export function pinnedHeader(path: string): HistoryHeader | null {
  const p = pinned(path);
  if (!p) return null;
  const key = `h:${p.sha256}`;
  if (!parsed.has(key)) {
    let header: HistoryHeader | null = null;
    try {
      const f = JSON.parse(new TextDecoder().decode(p.bytes)) as HistoryFile;
      if (isHistory(f)) header = { format: f.format, columns: f.columns, values: f.values, pairs: f.pairs, sample: f.sample, ...(f.time !== undefined ? { time: f.time } : {}), ...(f.zone !== undefined ? { zone: f.zone } : {}) };
    } catch {
      header = null;
    }
    parsed.set(key, header);
  }
  return parsed.get(key) as HistoryHeader | null;
}

/**
 * The tail pinned for a source (ADR 0010 §6, E12), its size and root computed here from its records; or why it isn't
 * one: not JSON, not a list of measures records of that source, or not in slot order, one a slot. Undefined when none
 * is pinned.
 */
export function pinnedTail(path: string, source: string): { leaves: string[] } | { problem: string } | undefined {
  const p = pinned(path);
  if (!p) return undefined;
  const key = `t:${source}:${p.sha256}`;
  if (!parsed.has(key)) {
    let out: { leaves: string[] } | { problem: string };
    try {
      const ms = JSON.parse(new TextDecoder().decode(p.bytes)) as unknown;
      if (!Array.isArray(ms) || ms.length === 0) out = { problem: "isn't a list of loads' measures" };
      else {
        const bad = ms.findIndex((m) => measuresProblem(m) !== null || (m as Measures).source !== source);
        const order = ms.findIndex((m, i) => i > 0 && !((m as Measures).slot > (ms[i - 1] as Measures).slot));
        out = bad >= 0 ? { problem: `has a record ${bad} that ${measuresProblem(ms[bad]) ?? `is of ${(ms[bad] as Measures).source}`}` } : order >= 0 ? { problem: 'isn\'t in slot order, one record a slot' } : { leaves: (ms as Measures[]).map(measuresLeaf) };
      }
    } catch {
      out = { problem: "isn't JSON" };
    }
    parsed.set(key, out);
  }
  return parsed.get(key) as { leaves: string[] } | { problem: string };
}
