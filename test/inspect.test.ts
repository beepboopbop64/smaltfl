/**
 * What a step changed: the rows each expectation rule fails on match the run's counts, the rows a step removed are
 * found as a multiset (an expectation's drops, a dedupe's extra copies), and a left join's unmatched rows are the
 * ones the lookup has no entry for. On real data (tier XS) and on the seeded fixture, which has exact duplicates and,
 * here, a zone lookup with a zone missing, checked against the plain JavaScript reference.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { runFlow, type FlowDocument, type FlowPlan, type RunResult } from '../src/index.js';
import { emitRead, emitRemoved, emitRuleFailures, emitUnmatched, type EmitContext } from '../src/core/emit.js';
import { shapeOf } from '../src/core/optimize.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { reference } from './fixtures/reference.js';
import { loadFixture, makeTrips, visualFlow, ZONES } from './fixtures/taxi.js';
import { SMALTDB } from './helpers/engine.js';

/** The run's plan, and what reading it needs: where each stored node is, and every node's columns. */
function inspect(db: Database, r: RunResult) {
  const plan = JSON.parse(String(db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [r.manifest.plan]).rows[0]![0])) as FlowPlan;
  const tables = new Map<number, string>();
  for (const m of r.manifest.nodes) {
    const t = db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [m.key]).rows[0];
    if (t) tables.set(m.node, String(t[0]));
  }
  const { stored } = shapeOf(plan);
  const ctx: EmitContext = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns: (i) => plan.nodes[i]!.schema!.map(([c]) => c) };
  const at = (id: string) => plan.nodes.findIndex((n) => n.origin === id);
  const count = (sql: string) => Number(db.query(`SELECT count(*) FROM (\n${sql}\n)`).rows[0]![0]);
  const expectations = (id: string) => r.manifest.nodes.find((n) => n.origin === id)!.expectations!;
  return { plan, ctx, at, count, expectations };
}

async function realRun() {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  for (const s of EXAMPLE_SOURCES) {
    await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, new Uint8Array(readFileSync(new URL(`../fixtures/xs/${s.file}`, import.meta.url)))]);
    await db.execAsync(s.ddl);
  }
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
  return inspect(db, await runFlow(db, doc, { smaltdb: SMALTDB }));
}

const TRIPS = makeTrips(4000);
const JFK = 132;
const ASTORIA = 7;

/** The seeded fixture, with JFK left out of the zone lookup and Astoria in it without a borough or a name. */
async function seededRun() {
  const db = Database.openMemory({ plugins: [smaltfl] });
  const zones = ZONES.filter(([id]) => id !== JFK).map((z) => (z[0] === ASTORIA ? [z[0], null, null, z[3]] : z)) as typeof ZONES;
  loadFixture(db, TRIPS, zones);
  return inspect(db, await runFlow(db, visualFlow(), { smaltdb: SMALTDB }));
}

describe('what a step changed', () => {
  it("finds each rule's failing rows, as many as the run counted", async () => {
    const { plan, ctx, at, count, expectations } = await realRun();
    const valid = expectations('trips_valid');
    expect(valid.rules.some((rule) => rule.failed > 0)).toBe(true);
    for (const [k, rule] of valid.rules.entries()) expect(count(emitRuleFailures(plan, at('trips_valid'), k, ctx)), rule.name).toBe(rule.failed);
  });

  it("finds the rows an expectation's drop rules left out", async () => {
    const { plan, ctx, at, count, expectations } = await realRun();
    const valid = expectations('trips_valid');
    expect(count(emitRemoved(plan, at('trips_valid'), ctx)!)).toBe(valid.dropped);
    expect(count(emitRead(plan, at('trips_valid'), ctx))).toBe(valid.rows - valid.dropped);
    // A step whose columns differ from its input's has no removed rows to show: what it changed is its columns.
    expect(emitRemoved(plan, at('trips_zoned'), ctx)).toBeNull();
    expect(emitRemoved(plan, at('zone_hour'), ctx)).toBeNull();
  });

  it("finds a dedupe's extra copies as a multiset, as many as the reference removes", async () => {
    const ref = reference(TRIPS);
    const copies = ref.rows - ref.dropped - ref.unique;
    expect(copies).toBeGreaterThan(0);
    const { plan, ctx, at, count } = await seededRun();
    const removed = emitRemoved(plan, at('trips_dedup'), ctx)!;
    expect(count(removed)).toBe(copies);
    // Each removed row is an extra copy: the row itself is still in the output.
    expect(count(`SELECT * FROM (\n${removed}\n) EXCEPT SELECT * FROM (\n${emitRead(plan, at('trips_dedup'), ctx)}\n)`)).toBe(0);
  });

  it("finds a join's rows with no match by their keys, not by empty columns", async () => {
    const { plan, ctx, at, count } = await seededRun();
    const atJfk = reference(TRIPS.filter((t) => t[5] === JFK)).unique;
    const atAstoria = reference(TRIPS.filter((t) => t[5] === ASTORIA)).unique;
    expect(atJfk).toBeGreaterThan(0);
    expect(atAstoria).toBeGreaterThan(0);
    const unmatched = emitUnmatched(plan, at('trips_zoned'), ctx)!;
    expect(count(unmatched)).toBe(atJfk);
    expect(count(`SELECT * FROM (\n${unmatched}\n) WHERE PULocationID <> ${JFK}`)).toBe(0);
    // Astoria's trips found their zone, though the columns the join adds came back empty for them.
    const zoned = emitRead(plan, at('trips_zoned'), ctx);
    expect(count(`SELECT * FROM (\n${zoned}\n) WHERE pu_borough IS NULL AND pu_zone IS NULL`)).toBe(atJfk + atAstoria);
    expect(emitUnmatched(plan, at('zone_hour'), ctx)).toBeNull();

    // In the real sample every pickup zone is in the lookup, the unknown zones included, and every borough hour has its
    // weather: each hour of weather has a condition, so an hour without it is one whose condition came back empty.
    const real = await realRun();
    expect(real.count(emitUnmatched(real.plan, real.at('trips_zoned'), real.ctx)!)).toBe(0);
    const noWeather = real.count(emitUnmatched(real.plan, real.at('borough_hour_weather'), real.ctx)!);
    expect(noWeather).toBe(real.count(`SELECT * FROM (\n${emitRead(real.plan, real.at('borough_hour_weather'), real.ctx)}\n) WHERE condition IS NULL`));
  });
});
