/**
 * The scenario benchmarks (docs/SCENARIO.md §7) on the seeded fixture, in Node with the in-process engine:
 *
 *   npm run bench                      tiers of 10k, 100k and 300k trips
 *   SMALTFL_BENCH_ROWS=1000000 npm run bench
 *
 * Each tier measures the compiled SQL run directly (the baseline smaltfl's overhead is measured against), a first
 * run, a run with nothing changed, a run after editing one gold step, and a verification; then the same flow holding on
 * its checks (ADR 0009), which rebuilds nothing, and its verification with the held check. Results are written to
 * bench/results/node.json. The budgets in SCENARIO.md are for Chromium on a laptop; these are a baseline to track.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { emitExpectCounts, emitSelect } from '../src/core/emit.js';
import { shapeOf } from '../src/core/optimize.js';
import type { FlowDocument } from '../src/core/document.js';
import type { FlowPlan } from '../src/core/plan.js';
import { runFlow, translate, verifyRun } from '../src/index.js';
import { hashTable } from '../src/plugin/dataset-hash.js';
import { loadFixture, makeTrips, visualFlow } from '../test/fixtures/taxi.js';
import { openEngine, SMALTDB } from '../test/helpers/engine.js';
import type { Database } from 'smaltdb/engine';

const TIERS = process.env.SMALTFL_BENCH_ROWS ? [Number(process.env.SMALTFL_BENCH_ROWS)] : [10_000, 100_000, 300_000];

const ms = (t: number) => Math.round(performance.now() - t);

/** The run's statements, on the raw tables, with no snapshots, keys, versions or hashes: what smaltfl adds to. */
function direct(db: Database, plan: FlowPlan): number {
  const { needed, stored } = shapeOf(plan);
  const raw = new Map<number, string>();
  plan.nodes.forEach((n, i) => n.op === 'table' && raw.set(i, n.table));
  const columns = new Map<number, string[]>();
  for (const [i, t] of raw) columns.set(i, db.prepare(`SELECT * FROM "${t}"`).columns);
  const typing = { table: (i: number) => raw.get(i), columns: (i: number) => columns.get(i)! };
  for (const i of needed) if (!raw.has(i)) columns.set(i, db.prepare(emitSelect(plan, i, typing)).columns);
  const built = new Map(raw);
  const ctx = { table: (i: number) => (stored.has(i) ? built.get(i) : undefined), columns: (i: number) => columns.get(i)! };
  const t = performance.now();
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table') continue;
    if (n.op === 'expect') db.query(emitExpectCounts(plan, i, ctx));
    if (!stored.has(i)) continue;
    const name = `direct_${i}`;
    db.exec(`CREATE TEMP TABLE "${name}"(${columns.get(i)!.map((c) => `"${c}" ANY`).join(', ')})`);
    db.run(`INSERT INTO "${name}" ${emitSelect(plan, i, ctx)}`);
    built.set(i, name);
  }
  return ms(t);
}

it('scenario benchmarks', async () => {
  const results = [];
  for (const rows of TIERS) {
    const db = openEngine();
    loadFixture(db, makeTrips(rows));
    const plan = await translate(visualFlow());
    const baseline = direct(db, plan);

    let t = performance.now();
    await hashTable(db, 'raw_trips');
    const hashTrips = ms(t);

    t = performance.now();
    const first = await runFlow(db, visualFlow(), { smaltdb: SMALTDB });
    const firstRun = ms(t);

    t = performance.now();
    await runFlow(db, visualFlow(), { smaltdb: SMALTDB });
    const unchanged = ms(t);

    const edited = visualFlow();
    const gold = edited.steps.find((s) => s.id === 'borough_hour')!;
    if (gold.kind === 'aggregate') gold.measures.push({ name: 'zones', expr: 'count(*)' });
    t = performance.now();
    await runFlow(db, edited, { smaltdb: SMALTDB });
    const editGold = ms(t);

    t = performance.now();
    const v = await verifyRun(db, first.run, { smaltdb: SMALTDB });
    const verify = ms(t);
    if (!v.ok) throw new Error(`verification failed at ${rows} rows`);

    // The cost of holding (ADR 0009): the same flow with a publish block that holds on its checks. Holding changes no
    // key, so nothing is rebuilt; what it adds is judging the run and recording its holds, then verify's held check.
    const holding: FlowDocument = { ...visualFlow(), smaltfl: 2, publish: { hold: ['checks'] } };
    t = performance.now();
    const held = await runFlow(db, holding, { smaltdb: SMALTDB });
    const holdingRun = ms(t);
    if (held.holds.length || held.waiting.length) throw new Error(`the fixture's checks held the run at ${rows} rows`);
    t = performance.now();
    const hv = await verifyRun(db, held.run, { smaltdb: SMALTDB });
    const holdingVerify = ms(t);
    if (!hv.ok || !hv.checks.some((c) => c.check === 'held')) throw new Error(`verification of the holding run failed at ${rows} rows`);

    results.push({
      trips: rows,
      directSqlMs: baseline,
      firstRunMs: firstRun,
      overhead: Number((firstRun / baseline - 1).toFixed(2)),
      hashTripsMs: hashTrips,
      unchangedRunMs: unchanged,
      editGoldStepMs: editGold,
      verifyMs: verify,
      holdingRunMs: holdingRun,
      holdingVerifyMs: holdingVerify,
      zoneHourRows: first.manifest.outputs.zone_hour!.rows,
    });
    console.log(JSON.stringify(results.at(-1)));
  }
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  writeFileSync(
    new URL('./results/node.json', import.meta.url),
    `${JSON.stringify({ engine: `smaltdb ${SMALTDB}`, runtime: `Node ${process.version}`, cpu: cpus()[0]?.model ?? 'unknown', date: new Date().toISOString().slice(0, 10), results }, null, 2)}\n`,
  );
}, 1_800_000);
