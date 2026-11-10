/**
 * Gold's reconciliation (ADR 0014 §6, slice 5): a gate on a published node names a key, and the node the keys must
 * equal; the run counts the rows, the distinct keys, the blank keys, the other node's keys with no row and the keys it
 * lacks, over the dataset it built, and keeps them with the node in the manifest. Exact: any count holds where the
 * gate says hold, is recorded where it says warn; verify counts them again.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { emitReconcileCounts } from '../src/core/emit.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { reconcileSaid } from '../src/core/hold.js';
import { planKind } from '../src/core/manifest.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { runFlow, translate, verifyRun } from '../src/index.js';
import { openEngine, SMALTDB } from './helpers/engine.js';
import { ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { gate, publish, source } from 'smaltfl/notebook';\n";
const nb = (gateCell: string, posture = 'SELECT a.app_id, a.business_unit, t.status AS tls FROM ${apps} a LEFT JOIN ${tls} t ON t.app_id = a.app_id') => `${SETUP}
cell('params');
export const params = param({ day: param.text('') });
cell('apps');
export const apps = source('apps');
cell('tls');
export const tls = source('tls');
cell('posture', { lang: 'sql' });
export const posture = sql\`${posture}\`;
cell('posture_gate');
export const posture_gate = ${gateCell};
cell('published');
publish(posture);
`;
const flow = (source: string): FlowDocument =>
  ({
    smaltfl: 4, id: 'reconciled', name: 'Reconciled', steps: [],
    parameters: [{ name: 'day', type: 'text', default: '2024-03-01' }],
    sources: [{ id: 'apps', table: 'apps_file' }, { id: 'tls', table: 'tls_file' }],
    notebooks: [{ path: 'a.nb.ts', source }],
    publish: { hold: ['checks'], period: 'day', watch: {} },
  }) as FlowDocument;
const GOLD = "gate(posture, { layer: 'gold', reconcile: { key: 'app_id', of: apps } })";

function tables(db: ReturnType<typeof openEngine>, doubled = false): void {
  db.exec("CREATE TABLE apps_file(app_id TEXT, business_unit TEXT); INSERT INTO apps_file VALUES ('a1','Payments'),('a2','Payments'),('a3','Retail'),('a4','Retail')");
  db.exec("CREATE TABLE tls_file(app_id TEXT, status TEXT); INSERT INTO tls_file VALUES ('a1','pass'),('a2','fail'),('a3','pass'),('zz','pass'),(NULL,'pass')");
  if (doubled) db.exec("INSERT INTO tls_file VALUES ('a1','pass'),('a2','fail')");
}

describe('the reconciliation in the notebook, the plan and the engine', () => {
  it('counts rows, keys, blank keys, the other node’s keys with no row, and keys it lacks', async () => {
    const db = openEngine();
    try {
      tables(db);
      const counts = (sql: string, of: string | null) => db.query(emitReconcileCounts(sql, ['app_id'], of)).rows[0]!.map(Number);
      // The TLS file against the inventory: five rows, four keys, one blank, a4 has no row, zz isn't an application.
      expect(counts('SELECT * FROM tls_file', 'SELECT * FROM apps_file')).toEqual([5, 4, 1, 1, 1]);
      // The inventory alone: every key once, nothing to compare against.
      expect(counts('SELECT * FROM apps_file', null)).toEqual([4, 4, 0, 0, 0]);
      // Two columns as the key: a pair repeats where both repeat.
      expect(db.query(emitReconcileCounts("SELECT * FROM tls_file WHERE app_id IS NOT NULL", ['app_id', 'status'], null)).rows[0]!.map(Number)).toEqual([4, 4, 0, 0, 0]);
    } finally {
      db.close();
    }
  });

  it('reads the rule from the gate cell, the other node by its name, and carries it in plan/4 as a gate on the published node', async () => {
    const doc = await expandNotebooks(flow(nb(GOLD)), ts);
    expect(validateDocument(doc)).toEqual([]);
    expect(doc.gates!.posture).toEqual({ layer: 'gold', checks: {}, reconcile: { key: ['app_id'], of: 'apps' } });
    const plan = await translate(doc, { day: '2024-03-01' });
    expect(planKind(plan)).toBe('plan/4');
    const pub = plan.publish as unknown as { watch: unknown[]; gates: [number, { checks: Record<string, string>; reconcile: { key: string[]; of: number | null } | null }][] };
    expect(pub.watch).toEqual([]);
    expect(pub.gates).toHaveLength(1);
    const [node, g] = pub.gates[0]!;
    expect(plan.nodes[node]!.origin).toBe('posture');
    expect(g.checks).toEqual(LAYER_DEFAULTS.gold);
    expect(g.reconcile).toEqual({ key: ['app_id'], of: plan.nodes.findIndex((n) => n.origin === 'apps') });
    // A gate with no reconciliation carries none; the other node may be left out.
    const bare = await translate(await expandNotebooks(flow(nb("gate(posture, { layer: 'gold' })")), ts), { day: '2024-03-01' });
    expect((bare.publish as unknown as { gates: [number, { reconcile: unknown }][] }).gates[0]![1].reconcile).toBeNull();
    const alone = await translate(await expandNotebooks(flow(nb("gate(posture, { layer: 'gold', reconcile: { key: ['app_id', 'business_unit'] } })")), ts), { day: '2024-03-01' });
    expect((alone.publish as unknown as { gates: [number, { reconcile: unknown }][] }).gates[0]![1].reconcile).toEqual({ key: ['app_id', 'business_unit'], of: null });
  });

  it('says what the counts mean, or nothing when the rows reconcile', () => {
    expect(reconcileSaid({ rows: 4, keys: 4, blank: 0, missing: 0, extra: 0 }, ['app_id'], 'apps')).toBeNull();
    expect(reconcileSaid({ rows: 406, keys: 203, blank: 0, missing: 0, extra: 0 }, ['app_id'], 'apps')).toBe("rows don't reconcile: 203 rows repeat a key (406 rows, 203 app_id values)");
    expect(reconcileSaid({ rows: 5, keys: 4, blank: 1, missing: 1, extra: 1 }, ['app_id'], 'apps')).toBe("rows don't reconcile: 1 row with a blank app_id; 1 key of apps with no row; 1 row not in apps");
    expect(reconcileSaid({ rows: 5, keys: 4, blank: 1, missing: 0, extra: 0 }, ['app_id', 'day'], null)).toBe("rows don't reconcile: 1 row with a blank app_id and day");
  });

  it('counts the gate over the dataset the run built, publishes when the rows reconcile, and verify counts it again', async () => {
    const db = openEngine();
    try {
      tables(db);
      const doc = await expandNotebooks(flow(nb(GOLD)), ts);
      const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: '2024-03-01' } });
      const node = r.manifest.nodes.find((n) => n.origin === 'posture')!;
      expect(node.gate).toEqual({ reconcile: { rows: 4, keys: 4, blank: 0, missing: 0, extra: 0 } });
      expect(r.manifest.nodes.filter((n) => n.gate)).toHaveLength(1);
      expect(r.holds).toEqual([]);
      expect(r.published).toEqual(['posture']);
      const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun', manifest: r.hash });
      expect(v.ok).toBe(true);
      expect(v.checks.find((c) => c.check === 'gate')).toMatchObject({ origin: 'posture', ok: true });
    } finally {
      db.close();
    }
  });

  it('holds the run on the gate where the rows don’t reconcile, said with the counts; records them and publishes under warn', async () => {
    const db = openEngine();
    try {
      tables(db, true);
      const doc = await expandNotebooks(flow(nb(GOLD)), ts);
      const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: '2024-03-01' } });
      expect(r.manifest.nodes.find((n) => n.origin === 'posture')!.gate).toEqual({ reconcile: { rows: 6, keys: 4, blank: 0, missing: 0, extra: 0 } });
      expect(r.holds).toHaveLength(1);
      expect(r.holds[0]).toMatchObject({ by: 'checks', origin: 'posture', said: "rows don't reconcile: 2 rows repeat a key (6 rows, 4 app_id values)", reaches: ['posture'] });
      expect(r.published).toEqual([]);
      expect(r.waiting).toEqual(['posture']);
      const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun', manifest: r.hash });
      expect(v.ok).toBe(true);
      expect(v.checks.find((c) => c.check === 'held')!.note).toBe('held by posture (its checks)');
      // The same rows read from the TLS file: a blank key, an application with no row, a row for no application.
      const fromTls = await expandNotebooks(flow(nb(GOLD, 'SELECT t.app_id, t.status AS tls FROM ${tls} t')), ts);
      const r2 = await runFlow(db, fromTls, { smaltdb: SMALTDB, parameters: { day: '2024-03-01' } });
      expect(r2.holds[0]!.said).toBe("rows don't reconcile: 2 rows repeat a key (7 rows, 4 app_id values); 1 row with a blank app_id; 1 key of apps with no row; 1 row not in apps");
      // Under warn, the counts are recorded and nothing holds.
      const warned = await expandNotebooks(flow(nb("gate(posture, { layer: 'gold', checks: { reconcile: 'warn' }, reconcile: { key: 'app_id', of: apps } })")), ts);
      const r3 = await runFlow(db, warned, { smaltdb: SMALTDB, parameters: { day: '2024-03-01' } });
      expect(r3.manifest.nodes.find((n) => n.origin === 'posture')!.gate!.reconcile.rows).toBe(6);
      expect(r3.holds).toEqual([]);
      expect(r3.published).toEqual(['posture']);
    } finally {
      db.close();
    }
  });
});
