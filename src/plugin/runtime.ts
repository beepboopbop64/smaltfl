/**
 * Running a flow plan in the engine (ARCHITECTURE.md §5): snapshot the sources, type every node, key it, then build
 * each stored node that has no version yet, in one statement with its folded inputs. Dataset names move to the new
 * versions only when everything has run, in one transaction, so a failed run leaves the previous versions current.
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import type { EmitContext } from '../core/emit.js';
import { createTable, emitExpectCounts, emitSelect } from '../core/emit.js';
import { hex, sha256Hex } from '../core/hash.js';
import type { KeyEnv } from '../core/keys.js';
import { nodeKey } from '../core/keys.js';
import { withoutDisplay, type FlowDocument } from '../core/document.js';
import type { DatasetRecord, ExpectationResult, ManifestNode, RunManifest, SourceFile } from '../core/manifest.js';
import { MANIFEST_FORMAT, manifestHash, ontologyHash, planHash, policiesHash } from '../core/manifest.js';
import { flowHash } from '../core/plan.js';
import { shapeOf } from '../core/optimize.js';
import type { Column, ColumnType, ExpectNode, FlowPlan, PlanNode, TableNode } from '../core/plan.js';
import { validatePlan } from '../core/plan.js';
import type { RunOptions, RunResult } from '../core/protocol.js';
import { quoteIdent as q } from '../core/sqltext.js';
import type { Declared, TableHash } from './dataset-hash.js';
import { hashTable, tableColumns } from './dataset-hash.js';
import { PINNED_PREFIX, takeOpened } from './pinned.js';

const STATIC: Record<Exclude<Declared, 'ANY'>, ColumnType> = { INTEGER: 'int', REAL: 'real', TEXT: 'text', BLOB: 'blob' };
import { ensureStore, findCheck, findVersion, inTransaction, isFresh, lastSnapshot, nameInUse, pointDataset, recordCheck, recordSnapshot, recordVersion, resetWatch, versionTable, watchable } from './store.js';

export class RunError extends Error {
  override name = 'RunError';
  constructor(
    message: string,
    readonly origin?: string,
  ) {
    super(origin ? `${origin}: ${message}` : message);
  }
}

/** The engine's own version: what a run records, whatever its caller says (ADR 0006 §4). */
export function engineVersion(db: Database): string {
  return String(db.query('SELECT smaltdb_version()').rows[0]?.[0] ?? '');
}

/** The plugins in the engine, with their versions, sorted: the code that decoded and ran a run. */
export function pluginsOf(db: Database): [string, string][] {
  const list = (db as Database & { plugins?: readonly { name: string; version: string }[] }).plugins ?? [];
  return list.map((p): [string, string] => [p.name, p.version]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export async function runPlan(db: Database, input: unknown, options: RunOptions, version: string, signal?: AbortSignal, commit = 'dev'): Promise<RunResult> {
  validatePlan(input);
  if (typeof options?.smaltdb !== 'string' || options.smaltdb === '') throw new RunError('a run needs the engine version: { smaltdb: "0.9.0" }');
  // An engine built from its sources (as in this repo's tests) reports 'unknown': there is nothing to check against.
  const actual = engineVersion(db);
  if (actual && actual !== 'unknown' && actual !== options.smaltdb) throw new RunError(`the engine is smaltdb ${actual}, not the ${options.smaltdb} the run was asked to record`);
  const plan = structuredClone(input) as FlowPlan;
  const env: KeyEnv = { smaltdb: options.smaltdb, smaltfl: version };
  ensureStore(db);
  // The flow document, when given, must be the one the plan was translated from: it is kept with the run.
  const context = options.context ?? {};
  let doc: string | null = null;
  let flow: RunManifest['flow'] = plan.flow;
  if (context.doc !== undefined) {
    const d = context.doc as FlowDocument;
    if ((await flowHash(d)) !== plan.flow.hash) throw new RunError("the flow document doesn't hash to the plan's flow hash: it isn't the document the plan was made from");
    doc = canonicalJSON(withoutDisplay(d) as Parameters<typeof canonicalJSON>[0]);
    flow = { ...plan.flow, policies: await policiesHash(d.policies), ontology: await ontologyHash(d.ontology) };
  }
  const started = new Date().toISOString();
  for (const o of plan.outputs) {
    const used = nameInUse(db, o.name);
    if (used && !used.ours) throw new RunError(`a ${used.type} named ${o.name} already exists and is not a smaltfl dataset`, o.name);
  }

  const { needed, stored } = shapeOf(plan);
  const keys = new Map<number, string>();
  const tables = new Map<number, string>();
  const records = new Map<number, ManifestNode>();
  const record = (i: number, status: ManifestNode['status'], extra: Partial<ManifestNode> = {}) => {
    const n = plan.nodes[i]!;
    records.set(i, { node: i, origin: n.origin, op: n.op, key: keys.get(i)!, status, ...extra });
  };

  // 1. Snapshots: each source's rows, kept by content hash.
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op !== 'table') continue;
    aborted(signal);
    const snap = await snapshot(db, n, env);
    n.schema = snap.schema;
    keys.set(i, snap.key);
    tables.set(i, snap.table);
    record(i, snap.reused ? 'reused' : 'built', { content: snap.content, rows: snap.rows, ...(snap.file ? { file: snap.file } : {}) });
  }

  // 2. Types: every node's output columns, with everything folded onto the snapshots.
  const columns = (i: number) => plan.nodes[i]!.schema!.map(([name]) => name);
  const onSnapshots: EmitContext = { table: (i) => (plan.nodes[i]!.op === 'table' ? tables.get(i) : undefined), columns };
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table') continue;
    n.schema = typeNode(db, emitSelect(plan, i, onSnapshots), n, snapshotsRead(plan, i, tables));
  }

  // 3. Keys, from the typed plan.
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op !== 'table') keys.set(i, await nodeKey(n, n.inputs.map((j) => keys.get(j)!), env));
  }

  // 4. Check expectations and build what isn't stored yet, inputs first. Folded nodes run inside the statement of
  // the stored node that reads them. An expectation's counts are recorded by key, so a reused one isn't recounted.
  const ctx: EmitContext = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns };
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table') continue;
    aborted(signal);
    const key = keys.get(i)!;
    let expectations: ExpectationResult | undefined;
    if (n.op === 'expect') {
      expectations = findCheck(db, key) ?? undefined;
      if (!expectations) {
        expectations = enforce(n, countExpectations(db, plan, i, ctx));
        recordCheck(db, key, expectations);
      }
    }
    const checked = expectations ? { expectations } : {};
    if (!stored.has(i)) {
      record(i, 'folded', checked);
      continue;
    }
    const existing = findVersion(db, key);
    if (existing) {
      tables.set(i, existing.table);
      record(i, 'reused', { content: existing.content, rows: existing.rows, ...checked });
      continue;
    }
    const table = versionTable(key);
    engine(n.origin, () =>
      inTransaction(db, () => {
        db.exec(`DROP TABLE IF EXISTS ${q(table)}`);
        db.exec(createTable(table, n.schema!, n.storage ? { storage: n.storage } : {}));
        db.run(`INSERT INTO ${q(table)} ${emitSelect(plan, i, ctx)}`);
      }),
    );
    const h = await hashTable(db, table);
    recordVersion(db, { key, table, content: h.content, rows: h.rows });
    tables.set(i, table);
    record(i, 'built', { content: h.content, rows: h.rows, ...checked });
  }

  // 5. The manifest.
  const outputs: Record<string, DatasetRecord> = {};
  for (const o of plan.outputs) {
    const r = records.get(o.node)!;
    outputs[o.name] = { key: r.key, content: r.content!, rows: r.rows! };
  }
  const typed = await planHash(plan);
  const previous = db.query('SELECT hash FROM _smaltfl_runs WHERE flow = ? ORDER BY id DESC LIMIT 1', [plan.flow.id]).rows[0]?.[0];
  const manifest: RunManifest = {
    smaltflRun: MANIFEST_FORMAT,
    flow,
    plan: typed,
    parameters: plan.parameters,
    engine: env,
    build: { smaltfl: commit, plugins: pluginsOf(db) },
    nodes: needed.map((i) => records.get(i)!),
    outputs,
    data: context.data ?? null,
    log: context.log ?? null,
    previous: typeof previous === 'string' ? previous : null,
  };
  const hash = await manifestHash(manifest);

  // 6. The plan, the document, the run and the dataset names, together.
  const run = inTransaction(db, () => {
    db.run('INSERT INTO _smaltfl_plans(hash, plan) VALUES (?, ?) ON CONFLICT(hash) DO NOTHING', [typed, canonicalJSON(plan)]);
    if (doc !== null) db.run('INSERT INTO _smaltfl_flows(hash, doc) VALUES (?, ?) ON CONFLICT(hash) DO NOTHING', [plan.flow.hash, doc]);
    const r = db.run('INSERT INTO _smaltfl_runs(flow, hash, manifest, started, finished) VALUES (?, ?, ?, ?, ?)', [plan.flow.id, hash, canonicalJSON(manifest), started, new Date().toISOString()]);
    const id = Number(r.lastInsertRowid);
    for (const o of plan.outputs) pointDataset(db, o.name, keys.get(o.node)!, tables.get(o.node)!, id);
    return id;
  });
  return { run, hash, manifest };
}

interface Snapshot {
  key: string;
  table: string;
  content: string;
  rows: number;
  schema: Column[];
  reused: boolean;
  /** The pinned file it read, as the engine saw it. */
  file?: SourceFile;
}

/**
 * A source's snapshot. While the table's watch is fresh, the last snapshot still holds and is reused without reading
 * the table. Otherwise its rows are copied, the copy is hashed, and it is kept under its key unless that content is
 * already stored. An external table (a file or URL the engine reads through `@smaltdb/external`) is copied with the
 * engine's async API, which fetches it first, and is read again every run: only a base table can be watched.
 */
async function snapshot(db: Database, n: TableNode, env: KeyEnv): Promise<Snapshot> {
  const st = describe(db, `SELECT * FROM ${q(n.table)}`, n.origin);
  // An external table's columns read as untyped (`any`) even when declared: take the declared types where it has them.
  const declared = st.external ? tableColumns(db, n.table) : [];
  const schema = st.schema.map(([name, type], k): Column => [name, type === 'any' && declared[k] && declared[k][1] !== 'ANY' ? STATIC[declared[k][1]] : type]);
  const watched = !st.external && watchable(db, n.table);
  const watch = `_smaltfl_w_${(await sha256Hex(n.table.toLowerCase())).slice(0, 24)}`;
  const last = watched ? lastSnapshot(db, n.table) : null;
  if (last && last.schema === canonicalJSON(schema) && isFresh(db, last.watch)) {
    const key = await nodeKey(n, [], env, last.content);
    const v = findVersion(db, key);
    if (v) return { key, table: v.table, content: v.content, rows: v.rows, schema, reused: true };
  }
  const stage = `_smaltfl_stage_${hex(crypto.getRandomValues(new Uint8Array(8)))}`;
  const copy = `INSERT INTO ${q(stage)} SELECT * FROM ${q(n.table)}`;
  let file: SourceFile | undefined;
  if (st.external) {
    // One statement copies the rows, so the copy is all or nothing without a transaction around the await.
    engine(n.origin, () => db.exec(createTable(stage, schema)));
    takeOpened();
    try {
      await db.runAsync(copy);
    } catch (e) {
      db.exec(`DROP TABLE IF EXISTS ${q(stage)}`);
      throw new RunError((e as Error).message, n.origin);
    }
    // The pinned file the copy read, if it read one: the bytes the engine itself hashed.
    const read = takeOpened().filter((f) => f.location.startsWith(PINNED_PREFIX));
    if (read.length > 1) throw new RunError(`read ${read.length} pinned files where a source reads one`, n.origin);
    file = read[0];
  } else {
    engine(n.origin, () =>
      inTransaction(db, () => {
        db.exec(createTable(stage, schema));
        db.run(copy);
        if (watched) resetWatch(db, watch, n.table);
      }),
    );
  }
  let h: TableHash;
  try {
    h = await hashTable(db, stage);
  } catch (e) {
    db.exec(`DROP TABLE IF EXISTS ${q(stage)}`);
    throw e;
  }
  const key = await nodeKey(n, [], env, h.content);
  const seen = { watch, content: h.content, rows: h.rows, schema: canonicalJSON(schema) };
  const existing = findVersion(db, key);
  if (existing) {
    inTransaction(db, () => {
      db.exec(`DROP TABLE ${q(stage)}`);
      if (watched) recordSnapshot(db, n.table, seen);
    });
    return { key, table: existing.table, content: existing.content, rows: existing.rows, schema, reused: true, ...(file ? { file } : {}) };
  }
  const table = versionTable(key);
  inTransaction(db, () => {
    db.exec(`DROP TABLE IF EXISTS ${q(table)}`);
    db.exec(`ALTER TABLE ${q(stage)} RENAME TO ${q(table)}`);
    recordVersion(db, { key, table, content: h.content, rows: h.rows });
    if (watched) recordSnapshot(db, n.table, seen);
  });
  return { key, table, content: h.content, rows: h.rows, schema, reused: false, ...(file ? { file } : {}) };
}

/**
 * A node's output columns and their static types, from the engine's prepared statement, with the checks a step's
 * statement must pass: it only reads, reads no external data, names its columns once each, and reads no table or
 * view other than its inputs' snapshots. That last check sees what EXPLAIN QUERY PLAN reports, which in smaltdb 0.9
 * leaves out subqueries inside expressions; with bound plans it becomes exact.
 */
function typeNode(db: Database, sql: string, n: PlanNode, allowed: ReadonlySet<string>): Column[] {
  const st = describe(db, sql, n.origin);
  if (!st.readonly) throw new RunError('a step only reads, but this statement writes', n.origin);
  if (st.external) throw new RunError('reads external data: read it through a source', n.origin);
  const seen = new Set<string>();
  for (const [name] of st.schema) {
    if (seen.has(name.toLowerCase())) throw new RunError(`two output columns are named ${name}: rename one`, n.origin);
    seen.add(name.toLowerCase());
  }
  for (const row of engine(n.origin, () => db.query(`EXPLAIN QUERY PLAN ${sql}`).rows)) {
    const read = /^(?:SCAN|SEARCH) (\S+)/.exec(String(row[3]))?.[1];
    if (!read || allowed.has(read.toLowerCase())) continue;
    const isObject = db.query("SELECT 1 FROM sqlite_schema WHERE lower(name) = lower(?) AND type IN ('table', 'view')", [read]).rows.length > 0;
    if (isObject) throw new RunError(`reads ${read}, which is not one of its inputs: add it as a source`, n.origin);
  }
  return st.schema;
}

/** What the engine says about a statement without running it. Statements compile lazily, so every question is asked inside `engine()`. */
function describe(db: Database, sql: string, origin: string): { schema: Column[]; readonly: boolean; external: boolean } {
  return engine(origin, () => {
    const st = db.prepare(sql);
    const types = st.columnTypes;
    return { schema: st.columns.map((name, k): Column => [name, types[k] as ColumnType]), readonly: st.readonly, external: st.externalSources.length > 0 };
  });
}

/** The snapshot tables a node's statement may read when every node before it is folded: its sources'. */
function snapshotsRead(plan: FlowPlan, node: number, tables: ReadonlyMap<number, string>): Set<string> {
  const out = new Set<string>();
  const seen = new Set<number>();
  const visit = (i: number) => {
    if (seen.has(i)) return;
    seen.add(i);
    const t = plan.nodes[i]!.op === 'table' ? tables.get(i) : undefined;
    if (t) out.add(t.toLowerCase());
    plan.nodes[i]!.inputs.forEach(visit);
  };
  visit(node);
  return out;
}

/** An expectation's counts, from one statement over its input. */
export function countExpectations(db: Database, plan: FlowPlan, node: number, ctx: EmitContext): ExpectationResult {
  const n = plan.nodes[node] as ExpectNode;
  const row = engine(n.origin, () => db.query(emitExpectCounts(plan, node, ctx)).rows[0]!);
  return {
    rows: Number(row[0]),
    dropped: Number(row[n.rules.length + 1]),
    rules: n.rules.map(([name, , onFail], k) => ({ name, onFail, failed: Number(row[k + 1]) })),
  };
}

/** Fail the run when a `fail` rule failed for any row, or more rows were dropped than allowed. */
function enforce(n: ExpectNode, result: ExpectationResult): ExpectationResult {
  const failing = result.rules.filter((r) => r.onFail === 'fail' && r.failed > 0);
  if (failing.length > 0) throw new RunError(`expectations failed: ${failing.map((r) => `${r.name} (${r.failed} row${r.failed === 1 ? '' : 's'})`).join(', ')}`, n.origin);
  if (n.maxDropped !== null && result.rows > 0 && result.dropped / result.rows > n.maxDropped) {
    throw new RunError(`dropped ${result.dropped} of ${result.rows} rows (${percent(result.dropped / result.rows)}), more than the ${percent(n.maxDropped)} allowed`, n.origin);
  }
  return result;
}

const percent = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

/** Run engine work, naming the step an engine error came from. */
function engine<T>(origin: string, work: () => T): T {
  try {
    return work();
  } catch (e) {
    if (e instanceof RunError) throw e;
    throw new RunError((e as Error).message, origin);
  }
}

export function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunError('the run was cancelled');
}
