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
 */
import type { Database } from 'smaltdb/engine';
import type { ExpectationResult } from '../core/manifest.js';
import { quoteIdent as q } from '../core/sqltext.js';

export function ensureStore(db: Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_versions(key TEXT PRIMARY KEY, tbl TEXT NOT NULL, content TEXT NOT NULL, rows INTEGER NOT NULL, info TEXT)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_datasets(name TEXT PRIMARY KEY, key TEXT NOT NULL, run INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_plans(hash TEXT PRIMARY KEY, plan TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_runs(id INTEGER PRIMARY KEY, flow TEXT NOT NULL, hash TEXT NOT NULL, manifest TEXT NOT NULL, started TEXT NOT NULL, finished TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_sources(source TEXT PRIMARY KEY, watch TEXT NOT NULL, content TEXT NOT NULL, rows INTEGER NOT NULL, schema TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS _smaltfl_checks(key TEXT PRIMARY KEY, result TEXT NOT NULL)');
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
  db.exec(`CREATE VIEW ${q(name)} AS SELECT * FROM ${q(table)}`);
  db.run('INSERT INTO _smaltfl_datasets(name, key, run) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET key = excluded.key, run = excluded.run', [name, key, run]);
}

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
