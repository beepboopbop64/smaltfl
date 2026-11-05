/**
 * Verifying a run (ARCHITECTURE.md §6), at two levels:
 * - **stored:** the manifest still has its hash, the typed plan it names is stored and has its hash, and every
 *   version the run stored (snapshots included) still has its recorded content hash;
 * - **rerun:** recomputing every stored node from the run's snapshots, with the same plan, gives the same content
 *   hashes and the same expectation counts. The recomputed rows go to temporary tables, which are dropped after.
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import type { EmitContext } from '../core/emit.js';
import { createTable, emitSelect } from '../core/emit.js';
import { hex } from '../core/hash.js';
import type { RunManifest } from '../core/manifest.js';
import { manifestHash, planHash } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import type { FlowPlan } from '../core/plan.js';
import { validatePlan } from '../core/plan.js';
import type { RunOptions, VerifyCheck, VerifyResult } from '../core/protocol.js';
import { quoteIdent as q } from '../core/sqltext.js';
import { hashTable } from './dataset-hash.js';
import { aborted, countExpectations, RunError } from './runtime.js';
import { ensureStore, findVersion } from './store.js';

export async function verifyRun(db: Database, runId: number, options: RunOptions, signal?: AbortSignal): Promise<VerifyResult> {
  ensureStore(db);
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [runId]).rows[0];
  if (!row) throw new RunError(`no run ${runId} in this database`);
  const manifest = JSON.parse(String(row[0])) as RunManifest;
  const checks: VerifyCheck[] = [];
  const result = (): VerifyResult => ({ ok: checks.every((c) => c.ok), run: runId, engine: { ran: manifest.engine.smaltdb, verified: options.smaltdb }, checks });

  const mh = await manifestHash(manifest);
  checks.push({ node: -1, origin: 'manifest', check: 'stored', ok: mh === row[1], expected: String(row[1]), actual: mh });
  const planRow = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [manifest.plan]).rows[0];
  if (!planRow) {
    checks.push({ node: -1, origin: 'plan', check: 'stored', ok: false, expected: manifest.plan, actual: null, note: 'the plan is no longer stored' });
    return result();
  }
  const plan = JSON.parse(String(planRow[0])) as FlowPlan;
  validatePlan(plan);
  const ph = await planHash(plan);
  checks.push({ node: -1, origin: 'plan', check: 'stored', ok: ph === manifest.plan, expected: manifest.plan, actual: ph });

  // Stored: what is kept now still has the hash the run recorded.
  for (const m of manifest.nodes) {
    if (m.content === undefined) continue;
    aborted(signal);
    const v = findVersion(db, m.key);
    if (!v) {
      checks.push({ node: m.node, origin: m.origin, check: 'stored', ok: false, expected: m.content, actual: null, note: 'this version is no longer stored' });
      continue;
    }
    const h = await hashTable(db, v.table);
    checks.push({ node: m.node, origin: m.origin, check: 'stored', ok: h.content === m.content, expected: m.content, actual: h.content });
  }

  // Rerun: recompute every stored node from the snapshots, the way the run did.
  const { stored } = shapeOf(plan);
  const recomputed = new Map<number, string>();
  const ctx: EmitContext = { table: (i) => (stored.has(i) ? recomputed.get(i) : undefined), columns: (i) => plan.nodes[i]!.schema!.map(([name]) => name) };
  const made: string[] = [];
  const tag = hex(crypto.getRandomValues(new Uint8Array(4)));
  try {
    for (const m of manifest.nodes) {
      const n = plan.nodes[m.node]!;
      if (n.op === 'table') {
        const v = findVersion(db, m.key);
        if (v) recomputed.set(m.node, v.table);
        continue;
      }
      aborted(signal);
      if (n.inputs.some((j) => stored.has(j) && !recomputed.has(j))) {
        checks.push({ node: m.node, origin: m.origin, check: m.expectations ? 'expectations' : 'rerun', ok: false, expected: m.content, actual: null, note: 'an input could not be recomputed' });
        continue;
      }
      if (m.expectations) {
        const counts = countExpectations(db, plan, m.node, ctx);
        checks.push({ node: m.node, origin: m.origin, check: 'expectations', ok: canonicalJSON(counts) === canonicalJSON(m.expectations), expected: canonicalJSON(m.expectations), actual: canonicalJSON(counts) });
      }
      if (!stored.has(m.node)) continue;
      const t = `_smaltfl_verify_${tag}_${m.node}`;
      db.exec(createTable(t, n.schema!, { temp: true }));
      made.push(t);
      db.run(`INSERT INTO ${q(t)} ${emitSelect(plan, m.node, ctx)}`);
      recomputed.set(m.node, t);
      const h = await hashTable(db, t);
      checks.push({ node: m.node, origin: m.origin, check: 'rerun', ok: h.content === m.content, expected: m.content, actual: h.content });
    }
  } finally {
    for (const t of made) db.exec(`DROP TABLE IF EXISTS ${q(t)}`);
  }
  return result();
}
