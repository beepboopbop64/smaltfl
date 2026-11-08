/**
 * Running a flow plan in the engine (ARCHITECTURE.md §5): snapshot the sources, type every node, key it, then build
 * each stored node that has no version yet, in one statement with its folded inputs. Dataset names move to the new
 * versions only when everything has run, in one transaction, so a failed run leaves the previous versions current.
 *
 * A plan with a publish block (plan/1, ADR 0009) can hold: its checks (with `checks` in `hold`) count without
 * throwing, each watched source is judged by the page's claim, and what holds keeps its outputs back. A held run is
 * built, checked, hashed and stored like any other, its versions staged; only the outputs nothing holds are pointed,
 * and a release (release.ts) publishes the rest when a person decides. A plan without the block runs as it always did.
 *
 * A derived run (`stage`, ADR 0009 amendment 1 S4) holds every output whatever else holds: it is a fill, or the part
 * that arrived, of a held day, and only a decision releases it. Its donors are judged by their claims, as watched
 * sources are. A plan whose fill step fills a day runs only so, and every output a fill step reaches carries
 * `filled_from`, or the run is refused (S1, Q-65).
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import type { EmitContext } from '../core/emit.js';
import { createTable, emitExpectCounts, emitSelect } from '../core/emit.js';
import { hex, sha256Hex } from '../core/hash.js';
import type { KeyEnv } from '../core/keys.js';
import { nodeKey } from '../core/keys.js';
import { FILLED_FROM, withoutDisplay, type FlowDocument } from '../core/document.js';
import type { DatasetRecord, ExpectationResult, ManifestNode, RunManifest, SourceFile } from '../core/manifest.js';
import { MANIFEST_FORMAT, manifestHash, ontologyHash, planHash, policiesHash } from '../core/manifest.js';
import { flowHash, translate } from '../core/plan.js';
import { shapeOf } from '../core/optimize.js';
import type { Column, ColumnType, ExpectNode, FillNode, FlowPlan, PlanNode, TableNode } from '../core/plan.js';
import { isPublish2, validatePlan, watchesOf } from '../core/plan.js';
import { heldOutputs, holdsOf, judgeClaims, judgeDonors, tailPath, tripped, waitingOf, type ClaimFacts, type FillHold, type Hold, type Judged, type RunRef } from '../core/hold.js';
import { measuresHash, settingsFor, type MeasureSettings, type Measures } from '../core/measures.js';
import { measureSnapshot, pinnedHeader, pinnedTail } from './measure.js';
import type { RunOptions, RunResult } from '../core/protocol.js';
import { quoteIdent as q, type ParamValue } from '../core/sqltext.js';
import type { TableHash } from './dataset-hash.js';
import { hashTable, sourceColumns } from './dataset-hash.js';
import { pinned, pinnedLocation, takeOpened } from './pinned.js';

import { currentOf, ensureStore, findCheck, findVersion, inTransaction, isFresh, lastSnapshot, measuresOfRun, nameInUse, pointDataset, recordCheck, recordDerived, recordHolds, recordMeasures, recordSnapshot, recordVersion, resetWatch, versionTable, watchable } from './store.js';

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
  const stage = stageOf(plan, options);
  ensureStore(db);
  // The flow document, when given, must be the one the plan was translated from: it is kept with the run.
  const context = options.context ?? {};
  let doc: string | null = null;
  let steps: FlowDocument['steps'] | undefined;
  let flow: RunManifest['flow'] = plan.flow;
  if (context.doc !== undefined) {
    const d = context.doc as FlowDocument;
    steps = d.steps;
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

  // 2. Types: every node's output columns, with everything folded onto the snapshots. A donor has its source's
  // columns, or a fill can't take them by name (S4); every output a fill step reaches carries its mark (S1).
  const columns = (i: number) => plan.nodes[i]!.schema!.map(([name]) => name);
  const onSnapshots: EmitContext = { table: (i) => (plan.nodes[i]!.op === 'table' ? tables.get(i) : undefined), columns };
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table') continue;
    if (n.op === 'fill' && n.inputs.length === 2) sameColumnsAsSource(plan, n);
    n.schema = typeNode(db, emitSelect(plan, i, onSnapshots), n, snapshotsRead(plan, i, tables));
  }
  marked(plan, needed);

  // 3. Keys, from the typed plan.
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op !== 'table') keys.set(i, await nodeKey(n, n.inputs.map((j) => keys.get(j)!), env));
  }

  // 4. Check expectations and build what isn't stored yet, inputs first. Folded nodes run inside the statement of
  // the stored node that reads them. An expectation's counts are recorded by key, so a reused one isn't recounted.
  // A flow that holds on its checks records counts that trip and goes on: what they hold is read from the manifest
  // (core/hold.ts holdsOf), so a check reused by key holds again. Any other flow throws on them, reused ones too: a
  // count a holding flow recorded never lets a flow that doesn't hold publish the same day.
  const holdsChecks = plan.publish?.hold.includes('checks') ?? false;
  const ctx: EmitContext = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns };
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table') continue;
    aborted(signal);
    const key = keys.get(i)!;
    let expectations: ExpectationResult | undefined;
    if (n.op === 'expect') {
      const known = findCheck(db, key);
      expectations = known ?? countExpectations(db, plan, i, ctx);
      if (!holdsChecks) enforce(n, expectations);
      if (!known) recordCheck(db, key, expectations);
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

  // What holds the run (ADR 0009 §3, §4): its checks from the manifest's counts, each watched source by its claim,
  // checked against the run's day, the history pinned in the engine and the snapshot's rows. Nothing, for a plan
  // without a publish block.
  let judged: Judged[] = [];
  let holds: Hold[] = [];
  let held: string[] = [];
  let waiting: string[] = [];
  let derived: { from: RunRef; holds: FillHold[]; donors: Judged[]; filled: number | null } | null = null;
  // plan/2 (ADR 0010 §6): each watched load measured from its snapshot (the record the page asked for before the run,
  // when it is of this snapshot), its claim told from those measures; a derived run's claims are judged against the
  // held run it repairs (C4): its flow hash, and its stored measures when the snapshot is the same.
  const measured = new Map<number, { hash: string; measures: Measures; settings: MeasureSettings }>();
  let told: { flow: string; measured: (node: number) => string | undefined; unmeasured: (node: number) => string } | null = null;
  if (plan.publish && isPublish2(plan.publish)) {
    if (stage) {
      told = heldMeasures(db, stage, plan, records);
      // Each donor a fill reads, measured as a load of its source on its own day: what its claim/2 is told from (C4).
      for (const n of plan.nodes) {
        if (n.op !== 'fill' || n.from === null || n.inputs.length !== 2) continue;
        const [src, donor] = n.inputs as [number, number];
        const w = watchesOf(plan.publish).find((x) => x.node === src);
        const table = tables.get(donor);
        const rec = records.get(donor);
        if (!w || w.period === null || !table || !rec?.content || context.doc === undefined) continue;
        // Its checks counted as its own day's run counts them: the document's parameters with the donor's day.
        const own = settingsFor(await translate(context.doc as FlowDocument, typedValues(context.doc as FlowDocument, { ...plan.parameters, [w.period]: n.from })), src, pinnedHeader(w.history), steps);
        if (!own) continue;
        aborted(signal);
        const settings = { ...own, slot: n.from };
        const m = await measureSnapshot(db, table, settings, rec.file?.sha256 ?? null, rec.content);
        measured.set(donor, { hash: await measuresHash(m), measures: m, settings });
      }
    } else {
      for (const w of watchesOf(plan.publish)) {
        const table = tables.get(w.node);
        const rec = records.get(w.node);
        const settings = settingsFor(plan, w.node, pinnedHeader(w.history), steps);
        if (!table || !rec?.content || !settings) continue;
        aborted(signal);
        const m = await measureSnapshot(db, table, settings, rec.file?.sha256 ?? null, rec.content);
        measured.set(w.node, { hash: await measuresHash(m), measures: m, settings });
      }
    }
  }
  if (plan.publish) {
    const facts: ClaimFacts = {
      rows: (node) => records.get(node)?.rows,
      pinned: (path) => {
        const p = pinned(path);
        return p && { sha256: p.sha256, bytes: p.bytes.byteLength };
      },
      measured: (node) => measured.get(node)?.hash ?? told?.measured(node),
      unmeasured: (node) => told?.unmeasured(node) ?? `${plan.nodes[node]?.origin ?? node}'s snapshot wasn't measured`,
      tail: (source) => pinnedTail(tailPath(source), source),
      flow: told ? told.flow : plan.flow.hash,
    };
    judged = judgeClaims(plan, context.claims, facts);
    holds = holdsOf(plan, manifest, judged);
    if (stage) {
      // A derived run: held by its fill whatever else holds, and by each donor not judged good (S3, S4).
      const donors = judgeDonors(plan, context.claims, facts);
      const fills = holdsOf(plan, manifest, judged, { derived: true, donors }).filter((h): h is FillHold => h.by === 'derived' || h.by === 'donor');
      derived = { from: stage, holds: fills, donors, filled: filledRows(db, plan, ctx) };
    }
    held = heldOutputs(plan, [...holds, ...(derived?.holds ?? [])]);
    const current = Object.fromEntries(held.map((name) => [name, currentOf(db, name)?.key]));
    waiting = waitingOf(manifest, held, current);
  }
  const holding = new Set(held);

  // 6. The plan, the document, the run and the dataset names, together: only the outputs nothing holds. A held
  // output's version stays staged, by its key, until a release points its name at it.
  const run = inTransaction(db, () => {
    db.run('INSERT INTO _smaltfl_plans(hash, plan) VALUES (?, ?) ON CONFLICT(hash) DO NOTHING', [typed, canonicalJSON(plan)]);
    if (doc !== null) db.run('INSERT INTO _smaltfl_flows(hash, doc) VALUES (?, ?) ON CONFLICT(hash) DO NOTHING', [plan.flow.hash, doc]);
    const r = db.run('INSERT INTO _smaltfl_runs(flow, hash, manifest, started, finished) VALUES (?, ?, ?, ?, ?)', [plan.flow.id, hash, canonicalJSON(manifest), started, new Date().toISOString()]);
    const id = Number(r.lastInsertRowid);
    for (const o of plan.outputs) if (!holding.has(o.name)) pointDataset(db, o.name, keys.get(o.node)!, tables.get(o.node)!, id);
    if (plan.publish) recordHolds(db, id, holds, judged);
    if (derived) recordDerived(db, { run: id, ...derived });
    for (const [node, m] of measured) recordMeasures(db, { run: id, node, slot: m.measures.slot, hash: m.hash, measures: m.measures, settings: m.settings });
    return id;
  });
  return {
    run, hash, manifest, holds, published: plan.outputs.map((o) => o.name).filter((name) => !holding.has(name)), waiting,
    ...(derived ? { derived: { holds: derived.holds, filled: derived.filled } } : {}),
    ...(measured.size ? { measures: [...measured.values()].map((m) => m.measures) } : {}),
  };
}

/** A plan's parameter values as its document types them (an integer is recorded as text, to keep its digits). */
function typedValues(doc: FlowDocument, values: Readonly<Record<string, string | number | null>>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const d of doc.parameters ?? []) {
    if (!Object.hasOwn(values, d.name)) continue;
    const v = values[d.name]!;
    out[d.name] = d.type === 'integer' && typeof v === 'string' && /^-?\d+$/.test(v) ? BigInt(v) : v;
  }
  return out;
}

/**
 * What a derived run's watched sources are judged by (ADR 0010 §6, C4): the flow hash of the held run it repairs, and
 * for each watched source, that run's stored measures when the derived run read the same snapshot (its content hash);
 * none otherwise, which leaves the source not judged.
 */
function heldMeasures(db: Database, from: RunRef, plan: FlowPlan, records: ReadonlyMap<number, ManifestNode>): { flow: string; measured: (node: number) => string | undefined; unmeasured: (node: number) => string } {
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [from.run]).rows[0];
  const held = row && String(row[1]) === from.manifest ? (JSON.parse(String(row[0])) as RunManifest) : null;
  const stored = held ? measuresOfRun(db, from.run) : [];
  const of = (node: number) => {
    const origin = plan.nodes[node]?.origin;
    const heldNode = held?.nodes.find((n) => n.op === 'table' && n.origin === origin)?.node;
    return { origin, m: stored.find((x) => x.node === heldNode) };
  };
  return {
    flow: held?.flow.hash ?? '',
    measured: (node) => {
      const { m } = of(node);
      return m && m.measures.snapshot === records.get(node)?.content ? m.hash : undefined;
    },
    unmeasured: (node) => {
      const { origin, m } = of(node);
      if (!held) return `run ${from.run}, which it repairs, isn't in this database with that manifest`;
      if (!m) return `run ${from.run}, which it repairs, has no measures of ${origin}`;
      return `it read another ${origin} than run ${from.run}, which it repairs, measured`;
    },
  };
}

/**
 * The held run a derived run repairs, when it is one (ADR 0009 amendment 1 S4, C4): `stage` needs a plan that says
 * what holds it and names the held run (`from`); a plan whose fill step fills a day runs only staged, so a fill is
 * never published but by a decision. Null for a run that isn't staged.
 */
function stageOf(plan: FlowPlan, options: RunOptions): RunRef | null {
  const filling = plan.nodes.find((n): n is FillNode => n.op === 'fill' && n.missing !== null);
  if (options.stage === undefined || options.stage === false) {
    if (options.from !== undefined) throw new RunError('from names the held run a derived run repairs: it goes with stage');
    if (filling) throw new RunError(`${filling.origin} fills a day: a derived document runs staged, as the derived run of a decision`);
    return null;
  }
  if (options.stage !== true) throw new RunError('stage is true or false');
  if (!plan.publish) throw new RunError('a derived run is held until a decision releases it, and this plan says nothing of what holds it');
  const f = options.from;
  if (typeof f !== 'object' || f === null || !Number.isSafeInteger(f.run) || typeof f.manifest !== 'string' || !/^[0-9a-f]{64}$/.test(f.manifest)) throw new RunError('a derived run names the held run it repairs: from { run, manifest }');
  return { run: f.run, manifest: f.manifest };
}

/** A donor has its source's columns, with their types (ADR 0009 amendment 1 S4), or its rows can't be taken by name. */
function sameColumnsAsSource(plan: FlowPlan, n: FillNode): void {
  const [source, donor] = n.inputs.map((j) => plan.nodes[j]!) as [PlanNode, PlanNode];
  const key = (cols: readonly Column[]) => new Map(cols.map(([c, t]) => [c.toLowerCase(), t]));
  const a = key(source.schema!);
  const b = key(donor.schema!);
  const lacks = [...a.keys()].filter((c) => !b.has(c));
  const extra = [...b.keys()].filter((c) => !a.has(c));
  const typed = [...a].filter(([c, t]) => b.has(c) && b.get(c) !== t).map(([c, t]) => `${c} is ${b.get(c)}, not ${t}`);
  if (lacks.length || extra.length || typed.length) {
    const said = [...(lacks.length ? [`it lacks ${lacks.join(', ')}`] : []), ...(extra.length ? [`it has ${extra.join(', ')} besides`] : []), ...typed];
    throw new RunError(`the donor ${donor.origin} has other columns than ${source.origin}: ${said.join('; ')}`, n.origin);
  }
}

/**
 * Every output a fill step reaches carries `filled_from` (ADR 0009 amendment 1 S1): a run that doesn't is refused,
 * naming the output (Q-65), so the published data always says which rows came from another day.
 */
function marked(plan: FlowPlan, needed: readonly number[]): void {
  const fills = plan.nodes.flatMap((n, i) => (n.op === 'fill' ? [i] : []));
  if (fills.length === 0) return;
  const reads = (from: number, target: number): boolean => {
    const stack = [target];
    const seen = new Set<number>();
    while (stack.length) {
      const i = stack.pop()!;
      if (i === from) return true;
      if (seen.has(i)) continue;
      seen.add(i);
      stack.push(...plan.nodes[i]!.inputs);
    }
    return false;
  };
  for (const o of plan.outputs) {
    if (!needed.includes(o.node)) continue;
    const fill = fills.find((f) => reads(f, o.node));
    if (fill === undefined) continue;
    if (!plan.nodes[o.node]!.schema!.some(([c]) => c.toLowerCase() === FILLED_FROM)) throw new RunError(`${o.name} reads ${plan.nodes[fill]!.origin} and doesn't carry ${FILLED_FROM}`, o.name);
  }
}

/** The rows a derived run's fills took from another day: those whose mark isn't null. Null when nothing is filled from
 * a donor (the part that arrived alone). */
function filledRows(db: Database, plan: FlowPlan, ctx: EmitContext): number | null {
  let total: number | null = null;
  plan.nodes.forEach((n, i) => {
    if (n.op !== 'fill' || n.from === null) return;
    const row = engine(n.origin, () => db.query(`SELECT count(*) FROM (\n${emitSelect(plan, i, ctx)}\n) WHERE ${q(FILLED_FROM)} IS NOT NULL`).rows[0]);
    total = (total ?? 0) + Number(row?.[0] ?? 0);
  });
  return total;
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
  const schema = engine(n.origin, () => sourceColumns(db, n.table, db.prepare(`SELECT * FROM ${q(n.table)}`))) as Column[];
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
    // The pinned file it reads, if any: only as the external table over it, so the snapshot is that file's rows.
    const location = engine(n.origin, () => pinnedLocation(db, n.table));
    // One statement copies the rows, so the copy is all or nothing without a transaction around the await.
    engine(n.origin, () => db.exec(createTable(stage, schema)));
    takeOpened();
    try {
      await db.runAsync(copy);
    } catch (e) {
      db.exec(`DROP TABLE IF EXISTS ${q(stage)}`);
      throw new RunError((e as Error).message, n.origin);
    }
    // The pinned file the copy read: the bytes the engine itself hashed as it opened them. Files other statements
    // opened meanwhile (an engine in the page has no request queue) are not this source's.
    if (location) {
      file = takeOpened().find((f) => f.location === location);
      if (!file) {
        db.exec(`DROP TABLE IF EXISTS ${q(stage)}`);
        throw new RunError(`the engine didn't open ${location} as it copied it, so there is no hash of what it read`, n.origin);
      }
    }
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

/**
 * Fail the run when a `fail` rule failed for any row, or more rows were dropped than allowed: what a hold says of the
 * same counts (core/hold.ts `tripped`), so a flow that holds and one that throws say it the same way.
 */
function enforce(n: ExpectNode, result: ExpectationResult): ExpectationResult {
  const said = tripped(n, result);
  if (said) throw new RunError(said, n.origin);
  return result;
}

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
