/**
 * smaltfl's own tables in the database. Version tables hold dataset versions and snapshots by key; the dataset names
 * people query are views over the current versions.
 *
 *   _smaltfl_versions(key, tbl, content, rows, info)   every stored version, by key
 *   _smaltfl_datasets(name, key, run)                  the views smaltfl owns, and the version each shows
 *   _smaltfl_plans(hash, plan)                         typed flow plans, by hash
 *   _smaltfl_runs(id, flow, hash, manifest, …)         run manifests
 *   _smaltfl_sources(source, watch, content, …)        each source table's last snapshot, and its watch
 *   _smaltfl_checks(key, result)                       expectation counts, by the expectation's key
 *   _smaltfl_edits(seq, action, object, …, prev, hash)  actions' edits and refusals, in a hash chain
 *   _smaltfl_flows(hash, doc)                          flow documents runs were translated from, by flow hash
 *   _smaltfl_holds(run, holds, claims)                 what held each run of a plan with a publish block, and its
 *                                                      watched sources as judged (ADR 0009 §3): a row for every
 *                                                      such run, holds [] when it published, so verify can judge
 *                                                      it again from what was stored
 *   _smaltfl_releases(id, run, manifest, names, …)     each release of a held run, applied or refused (ADR 0009 §5)
 *   _smaltfl_derived(run, from_run, from_manifest, …)  each derived run (a fill, or the part that arrived), the held run
 *                                                      it repairs, what held it besides its day's holds, its donors as
 *                                                      judged and the rows it took from another day (ADR 0009
 *                                                      amendment 1 S4)
 *   _smaltfl_repairs(release, run, from_run, …)        each applied release of a derived run: the repair, and the
 *                                                      version each name showed before it, which a withdrawal points
 *                                                      back to (S10)
 *   _smaltfl_withdrawals(release, withdraws)           each applied withdrawal, and the release it took back (Q-61)
 */
import type { Database } from 'smaltdb/engine';
import type { Repair } from '../core/fill.js';
import type { FillHold, Hold, Judged, RunRef } from '../core/hold.js';
import type { ExpectationResult } from '../core/manifest.js';
import type { DecisionOption } from '../core/policy.js';
import { quoteIdent as q } from '../core/sqltext.js';

export function ensureStore(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_versions(key TEXT PRIMARY KEY, tbl TEXT NOT NULL, content TEXT NOT NULL, rows INTEGER NOT NULL, info TEXT)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_datasets(name TEXT PRIMARY KEY, key TEXT NOT NULL, run INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_plans(hash TEXT PRIMARY KEY, plan TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_runs(id INTEGER PRIMARY KEY, flow TEXT NOT NULL, hash TEXT NOT NULL, manifest TEXT NOT NULL, started TEXT NOT NULL, finished TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_sources(source TEXT PRIMARY KEY, watch TEXT NOT NULL, content TEXT NOT NULL, rows INTEGER NOT NULL, schema TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_checks(key TEXT PRIMARY KEY, result TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_flows(hash TEXT PRIMARY KEY, doc TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_edits(seq INTEGER PRIMARY KEY, action TEXT NOT NULL, object_type TEXT NOT NULL, object TEXT NOT NULL, params TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, outcome TEXT NOT NULL, reason TEXT NOT NULL, prev TEXT, hash TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_holds(run INTEGER PRIMARY KEY, holds TEXT NOT NULL, claims TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_releases(id INTEGER PRIMARY KEY, run INTEGER, manifest TEXT, names TEXT NOT NULL, option TEXT, actor TEXT, reason TEXT, decision TEXT, outcome TEXT NOT NULL, why TEXT, at TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_derived(run INTEGER PRIMARY KEY, from_run INTEGER NOT NULL, from_manifest TEXT NOT NULL, holds TEXT NOT NULL, donors TEXT NOT NULL, filled INTEGER)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_repairs(release INTEGER PRIMARY KEY, run INTEGER NOT NULL, from_run INTEGER NOT NULL, from_manifest TEXT NOT NULL, repair TEXT NOT NULL, before TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_withdrawals(release INTEGER PRIMARY KEY, withdraws INTEGER NOT NULL)');
}

/** A derived run as the store keeps it (ADR 0009 amendment 1 S4): the held run it repairs, its own holds (`derived`,
 * `donor`), its donors as judged, and the rows it took from another day (null for the part that arrived alone). */
export interface StoredDerived {
  run: number;
  from: RunRef;
  holds: FillHold[];
  donors: Judged[];
  filled: number | null;
}

/** Runs inside the run's transaction. */
export function recordDerived(db: Database, d: StoredDerived): void {
  db.run('INSERT INTO _smaltfl_derived(run, from_run, from_manifest, holds, donors, filled) VALUES (?, ?, ?, ?, ?, ?)', [d.run, d.from.run, d.from.manifest, JSON.stringify(d.holds), JSON.stringify(d.donors), d.filled]);
}

const derivedOfRow = (row: readonly unknown[]): StoredDerived => ({
  run: Number(row[0]),
  from: { run: Number(row[1]), manifest: String(row[2]) },
  holds: JSON.parse(String(row[3])) as FillHold[],
  donors: JSON.parse(String(row[4])) as Judged[],
  filled: row[5] === null ? null : Number(row[5]),
});

/** A run's derived record, or null for a run that isn't derived. */
export function derivedOf(db: Database, run: number): StoredDerived | null {
  const row = db.query('SELECT run, from_run, from_manifest, holds, donors, filled FROM _smaltfl_derived WHERE run = ?', [run]).rows[0];
  return row ? derivedOfRow(row) : null;
}

/** The version a dataset name showed, and the run that made it current: what a withdrawal points back to. */
export type Shown = { key: string; run: number } | null;

/** An applied release of a derived run, as the store keeps it (S10). */
export interface StoredRepair {
  release: number;
  run: number;
  from: RunRef;
  repair: Repair;
  /** Each name it pointed, with what the name showed before it. */
  before: Record<string, Shown>;
}

export function recordRepair(db: Database, r: StoredRepair): void {
  db.run('INSERT INTO _smaltfl_repairs(release, run, from_run, from_manifest, repair, before) VALUES (?, ?, ?, ?, ?, ?)', [r.release, r.run, r.from.run, r.from.manifest, JSON.stringify(r.repair), JSON.stringify(r.before)]);
}

const repairOfRow = (row: readonly unknown[]): StoredRepair => ({
  release: Number(row[0]),
  run: Number(row[1]),
  from: { run: Number(row[2]), manifest: String(row[3]) },
  repair: JSON.parse(String(row[4])) as Repair,
  before: JSON.parse(String(row[5])) as Record<string, Shown>,
});

/** The applied release of a derived run with this number, or null. */
export function repairOf(db: Database, release: number): StoredRepair | null {
  const row = db.query('SELECT release, run, from_run, from_manifest, repair, before FROM _smaltfl_repairs WHERE release = ?', [release]).rows[0];
  return row ? repairOfRow(row) : null;
}

/** A derived run's applied releases, in order; every one when `run` is left out. */
export function repairsOf(db: Database, run?: number): StoredRepair[] {
  const cols = 'release, run, from_run, from_manifest, repair, before';
  const rows = run === undefined ? db.query(`SELECT ${cols} FROM _smaltfl_repairs ORDER BY release`).rows : db.query(`SELECT ${cols} FROM _smaltfl_repairs WHERE run = ? ORDER BY release`, [run]).rows;
  return rows.map(repairOfRow);
}

export function recordWithdrawal(db: Database, release: number, withdraws: number): void {
  db.run('INSERT INTO _smaltfl_withdrawals(release, withdraws) VALUES (?, ?)', [release, withdraws]);
}

/** Every applied withdrawal, in order: the withdrawal's release and the release it took back. */
export function withdrawalsOf(db: Database): { release: number; withdraws: number }[] {
  return db.query('SELECT release, withdraws FROM _smaltfl_withdrawals ORDER BY release').rows.map((row) => ({ release: Number(row[0]), withdraws: Number(row[1]) }));
}

/** What held a run, and its watched sources as the run judged them. Runs inside the run's transaction. */
export function recordHolds(db: Database, run: number, holds: readonly Hold[], judged: readonly Judged[]): void {
  db.run('INSERT INTO _smaltfl_holds(run, holds, claims) VALUES (?, ?, ?)', [run, JSON.stringify(holds), JSON.stringify(judged)]);
}

/** A run's stored holds and judged sources, or null for a run with no row (a plan without a publish block). */
export function holdsOfRun(db: Database, run: number): { holds: Hold[]; judged: Judged[] } | null {
  const row = db.query('SELECT holds, claims FROM _smaltfl_holds WHERE run = ?', [run]).rows[0];
  return row ? { holds: JSON.parse(String(row[0])) as Hold[], judged: JSON.parse(String(row[1])) as Judged[] } : null;
}

/** A release as the store keeps it: what was asked, and what came of it. */
export interface StoredRelease {
  id: number;
  run: number | null;
  manifest: string | null;
  /** The outputs it names, with their keys. */
  names: Record<string, string>;
  option: DecisionOption | string | null;
  actor: string | null;
  reason: string | null;
  /** The decide entry's log/1 leaf it cites. */
  decision: string | null;
  outcome: 'applied' | 'refused';
  why: string | null;
  at: string;
}

export function recordRelease(db: Database, r: Omit<StoredRelease, 'id'>): number {
  const out = db.run('INSERT INTO _smaltfl_releases(run, manifest, names, option, actor, reason, decision, outcome, why, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    r.run, r.manifest, JSON.stringify(r.names), r.option, r.actor, r.reason, r.decision, r.outcome, r.why, r.at,
  ]);
  return Number(out.lastInsertRowid);
}

const releaseOf = (row: readonly unknown[]): StoredRelease => ({
  id: Number(row[0]),
  run: row[1] === null ? null : Number(row[1]),
  manifest: row[2] === null ? null : String(row[2]),
  names: JSON.parse(String(row[3])) as Record<string, string>,
  option: row[4] === null ? null : String(row[4]),
  actor: row[5] === null ? null : String(row[5]),
  reason: row[6] === null ? null : String(row[6]),
  decision: row[7] === null ? null : String(row[7]),
  outcome: String(row[8]) as StoredRelease['outcome'],
  why: row[9] === null ? null : String(row[9]),
  at: String(row[10]),
});

/** A run's releases, applied and refused, in the order they were asked for; every release when `run` is left out. */
export function releasesOf(db: Database, run?: number): StoredRelease[] {
  const cols = 'id, run, manifest, names, option, actor, reason, decision, outcome, why, at';
  const rows = run === undefined ? db.query(`SELECT ${cols} FROM _smaltfl_releases ORDER BY id`).rows : db.query(`SELECT ${cols} FROM _smaltfl_releases WHERE run = ? ORDER BY id`, [run]).rows;
  return rows.map(releaseOf);
}

/**
 * What the engine names, for an audit bag (engine/datasets.json, core/audit.ts EngineName): each dataset name, the
 * key it shows, the run that made it current and that run's manifest hash ('' for a number that is no run), and the
 * applied release that pointed it, if one did; with every release, applied or refused (engine/releases.json); what
 * held each run of a plan with a publish block, as the plugin judged it (engine/holds.json, core/audit.ts EngineHolds),
 * so the audit reads what held a run from the engine, not only from the page's record; and the derived runs, the
 * releases of them and the withdrawals (engine/repairs.json).
 */
export function engineNames(db: Database): {
  datasets: { name: string; key: string; run: number; manifest: string; release: number | null }[];
  releases: StoredRelease[];
  holds: { run: number; manifest: string; holds: Hold[]; judged: Judged[] }[];
  repairs: EngineRepairs;
} {
  const releases = releasesOf(db);
  const datasets = db.query('SELECT d.name, d.key, d.run, r.hash FROM _smaltfl_datasets d LEFT JOIN _smaltfl_runs r ON r.id = d.run ORDER BY d.name').rows.map((row) => {
    const [name, key, run] = [String(row[0]), String(row[1]), Number(row[2])];
    const by = releases.filter((x) => x.outcome === 'applied' && x.run === run && x.names[name] === key).at(-1);
    return { name, key, run, manifest: row[3] === null ? '' : String(row[3]), release: by ? by.id : null };
  });
  const holds = db.query('SELECT h.run, r.hash, h.holds, h.claims FROM _smaltfl_holds h JOIN _smaltfl_runs r ON r.id = h.run ORDER BY h.run').rows.map((row) => ({
    run: Number(row[0]), manifest: String(row[1]), holds: JSON.parse(String(row[2])) as Hold[], judged: JSON.parse(String(row[3])) as Judged[],
  }));
  const derived = db.query('SELECT d.run, r.hash, d.from_run, d.from_manifest, d.holds, d.donors, d.filled FROM _smaltfl_derived d JOIN _smaltfl_runs r ON r.id = d.run ORDER BY d.run').rows.map((row) => ({
    ...derivedOfRow([row[0], row[2], row[3], row[4], row[5], row[6]]), manifest: String(row[1]),
  }));
  return { datasets, releases, holds, repairs: { derived, repairs: repairsOf(db), withdrawals: withdrawalsOf(db) } };
}

/** What the engine keeps of the fills (an audit bag's engine/repairs.json, ADR 0009 amendment 1 S11): each derived run
 * with its manifest's hash, each applied release of one, and each withdrawal. */
export interface EngineRepairs {
  derived: (StoredDerived & { manifest: string })[];
  repairs: StoredRepair[];
  withdrawals: { release: number; withdraws: number }[];
}

/** The version a dataset name shows now, and the run that made it current; null for a name smaltfl doesn't hold. */
export function currentOf(db: Database, name: string): { key: string; run: number } | null {
  const row = db.query('SELECT key, run FROM _smaltfl_datasets WHERE name = ?', [name]).rows[0];
  return row ? { key: String(row[0]), run: Number(row[1]) } : null;
}

/** An expectation's recorded counts: the same key means the same input and rules, so the same counts. */
export function findCheck(db: Database, key: string): ExpectationResult | null {
  const row = db.query('SELECT result FROM _smaltfl_checks WHERE key = ?', [key]).rows[0];
  return row ? (JSON.parse(String(row[0])) as ExpectationResult) : null;
}

export function recordCheck(db: Database, key: string, result: ExpectationResult): void {
  db.run('INSERT INTO _smaltfl_checks(key, result) VALUES (?, ?) ON CONFLICT(key) DO NOTHING', [key, JSON.stringify(result)]);
}

/** The table that holds the version with this key. */
export const versionTable = (key: string): string => `_smaltfl_v_${key.slice(0, 32)}`;

export interface StoredVersion {
  key: string;
  table: string;
  content: string;
  rows: number;
}

export function findVersion(db: Database, key: string): StoredVersion | null {
  const row = db.query('SELECT tbl, content, rows FROM _smaltfl_versions WHERE key = ?', [key]).rows[0];
  return row ? { key, table: String(row[0]), content: String(row[1]), rows: Number(row[2]) } : null;
}

export function recordVersion(db: Database, v: StoredVersion): void {
  db.run('INSERT INTO _smaltfl_versions(key, tbl, content, rows) VALUES (?, ?, ?, ?)', [v.key, v.table, v.content, v.rows]);
}

/** What a name in the database is: a table or view, and whether smaltfl owns it as a dataset. */
export function nameInUse(db: Database, name: string): { type: string; ours: boolean } | null {
  const row = db.query('SELECT type FROM sqlite_schema WHERE lower(name) = lower(?)', [name]).rows[0];
  if (!row) return null;
  const ours = db.query('SELECT 1 FROM _smaltfl_datasets WHERE lower(name) = lower(?)', [name]).rows.length > 0;
  return { type: String(row[0]), ours };
}

/** Point a dataset's name at a version. Runs inside the caller's transaction. */
export function pointDataset(db: Database, name: string, key: string, table: string, run: number): void {
  db.exec(`DROP VIEW IF EXISTS ${q(name)}`);
  db.exec(datasetView(name, table));
  db.run('INSERT INTO _smaltfl_datasets(name, key, run) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET key = excluded.key, run = excluded.run', [name, key, run]);
}

/** The exact statement that makes a dataset's name show a version: verify compares the stored view with it. */
export const datasetView = (name: string, table: string): string => `CREATE VIEW ${q(name)} AS SELECT * FROM ${q(table)}`;

/** Run `work` in one transaction: committed if it returns, rolled back if it throws. Synchronous, so no await can split it. */
export function inTransaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN');
  try {
    const out = work();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * A source table's watch: a materialized view of its row count, which the engine marks stale whenever the table
 * changes (any committed write, even one that keeps the count). While it is fresh, the last snapshot still holds, so
 * a run reuses it without reading the table.
 */
export interface SourceRecord {
  watch: string;
  content: string;
  rows: number;
  schema: string;
}

export function lastSnapshot(db: Database, source: string): SourceRecord | null {
  const row = db.query('SELECT watch, content, rows, schema FROM _smaltfl_sources WHERE source = lower(?)', [source]).rows[0];
  return row ? { watch: String(row[0]), content: String(row[1]), rows: Number(row[2]), schema: String(row[3]) } : null;
}

export function recordSnapshot(db: Database, source: string, r: SourceRecord): void {
  db.run(
    'INSERT INTO _smaltfl_sources(source, watch, content, rows, schema) VALUES (lower(?), ?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET watch = excluded.watch, content = excluded.content, rows = excluded.rows, schema = excluded.schema',
    [source, r.watch, r.content, r.rows, r.schema],
  );
}

/** Only a base table can be watched: a view can change its definition without its tables changing. */
export function watchable(db: Database, source: string): boolean {
  const row = db.query('SELECT table_type FROM information_schema.tables WHERE lower(table_name) = lower(?)', [source]).rows[0];
  return row?.[0] === 'BASE TABLE';
}

export function isFresh(db: Database, watch: string): boolean {
  return db.query('SELECT is_fresh FROM information_schema.materialized_views WHERE table_name = ?', [watch]).rows[0]?.[0] === 'YES';
}

/** Create the watch, or refresh it. Runs inside the snapshot's transaction, so no write can fall between the two. */
export function resetWatch(db: Database, watch: string, source: string): void {
  const exists = db.query('SELECT 1 FROM information_schema.materialized_views WHERE table_name = ?', [watch]).rows.length > 0;
  db.exec(exists ? `REFRESH MATERIALIZED VIEW ${q(watch)}` : `CREATE MATERIALIZED VIEW ${q(watch)} AS SELECT count(*) AS n FROM ${q(source)}`);
}
