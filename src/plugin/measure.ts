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
import { canonicalJSON } from '../core/canonical.js';
import { createTable, emitColumnFacts, emitRuleCounts, emitSample } from '../core/emit.js';
import { hex } from '../core/hash.js';
import { measuresOf, scanColumns, type MeasureSettings, type Measures } from '../core/measures.js';
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
  if (typeof s !== 'object' || s === null || typeof s.source !== 'string' || typeof s.slot !== 'string' || s.every !== 'day'
    || !names(s.counted) || !names(s.followed) || !names(s.paired) || !(s.time === null || typeof s.time === 'string') || !(s.zone === null || typeof s.zone === 'string')
    || !Number.isSafeInteger(s.sample) || s.sample < 1
    || !(s.counting === null || (names(s.counting) && s.checks !== null && s.counting.length === s.checks.rules.length))
    || !(s.checks === null || (typeof s.checks === 'object' && typeof s.checks.step === 'string' && Array.isArray(s.checks.rules) && s.checks.rules.every((r) => typeof r?.name === 'string' && typeof r.check === 'string' && typeof r.onFail === 'string')))) {
    throw new MeasureError('measure needs its settings: { source, slot, every: "day", checks, counting, counted, followed, paired, time, zone, sample }');
  }
  return { source: s.source, slot: s.slot, every: 'day', checks: s.checks ? { step: s.checks.step, rules: s.checks.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })) } : null, counting: s.counting ? [...s.counting] : null, counted: [...s.counted], followed: [...s.followed], paired: [...s.paired], time: s.time, zone: s.zone, sample: s.sample };
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
  return measuresOf(s, { file, snapshot, schema, facts, sample, scan, checks });
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
