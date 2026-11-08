/**
 * Data quality: column profiles, the isolation forest, drift and suggested checks, as pure functions; and on real
 * data (tier XS) in the engine, that a suggested check, once added as a box, counts exactly what the suggestion said.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { runFlow, validateDocument, type FlowDocument, type FlowPlan } from '../src/index.js';
import { emitCheckCounts, emitColumnFacts, emitDistinct, emitDropped, emitRead, emitSample, type EmitContext } from '../src/core/emit.js';
import { insertAfter } from '../src/core/document.js';
import { shapeOf } from '../src/core/optimize.js';
import { identifiers } from '../src/core/sqltext.js';
import { columnSql, drift, fillGaps, isolationForest, madsOf, niceCeil, profileColumn, psi, quantile, random, suggestChecks, unusual, type ColumnFacts } from '../src/core/quality.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';

const facts = (values: unknown[]): ColumnFacts => {
  const present = values.filter((v) => v !== null);
  const nums = present.filter((v): v is number => typeof v === 'number');
  return { rows: values.length, present: present.length, distinct: new Set(present.map(String)).size, min: nums.length ? Math.min(...nums) : present.sort()[0], max: nums.length ? Math.max(...nums) : present.sort().at(-1), mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null };
};
const normal = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

describe('column profiles', () => {
  it('tell measures, codes, times and categories apart, with exact counts and the sample’s shape', () => {
    const rnd = random(1);
    const speeds = Array.from({ length: 1000 }, () => 12 + 3 * normal(rnd));
    const p = profileColumn('speed_mph', 'real', facts(speeds), speeds);
    expect(p.kind).toBe('measure');
    expect(p.quantiles!.p50).toBeCloseTo(quantile([...speeds].sort((a, b) => a - b), 0.5), 9);
    expect(p.hist!.counts.reduce((a, b) => a + b, 0) + p.hist!.below + p.hist!.above).toBe(1000);
    expect(profileColumn('VendorID', 'int', facts([1, 2, 2, 1, 2, 7, 1, 2, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2]), [1, 2]).kind).toBe('code');
    expect(profileColumn('passenger_count', 'int', facts([1, 2, 3, 1, 1, null]), [1, 2, 3, 1, 1, null]).kind).toBe('code');
    const times = ['2024-01-01 00:03:00', '2024-01-01 01:10:00', '2024-01-02 09:00:00', null];
    const t = profileColumn('tpep_pickup_datetime', 'any', facts(times), times);
    expect(t.kind).toBe('time');
    expect(t.quantiles!.p50).toBe(Date.parse('2024-01-01T01:10:00Z'));
    const boroughs = ['Manhattan', 'Manhattan', 'Queens', 'Brooklyn', 'Manhattan'];
    const b = profileColumn('pu_borough', 'text', facts(boroughs), boroughs);
    expect(b.kind).toBe('category');
    expect(b.top![0]).toEqual({ value: 'Manhattan', share: 0.6 });
  });
});

describe('the isolation forest', () => {
  const rnd = random(7);
  const data = Array.from({ length: 400 }, () => [normal(rnd), 2 * normal(rnd)]);
  data.push([8, 1]);

  it('scores a planted outlier as the oddest row, the same way every time', () => {
    const scores = isolationForest(data);
    const top = scores.indexOf(Math.max(...scores));
    expect(top).toBe(400);
    expect(scores[400]).toBeGreaterThan(0.65);
    expect(scores.every((s) => s > 0 && s <= 1)).toBe(true);
    expect(isolationForest(data)).toEqual(scores);
    const ordinary = [...scores].sort((a, b) => a - b)[200]!;
    expect(ordinary).toBeLessThan(0.5);
  });

  it('says which column makes a row odd, and fills gaps with the median', () => {
    const profiles = [profileColumn('x', 'real', facts(data.map((r) => r[0]!)), data.map((r) => r[0]!)), profileColumn('y', 'real', facts(data.map((r) => r[1]!)), data.map((r) => r[1]!))];
    const rows = data.map(([x, y]) => ({ x, y }));
    const why = unusual(profiles, rows[400]!, madsOf(profiles, rows));
    expect(why.map((u) => u.column)).toEqual(['x']);
    expect(why[0]!.value).toBe(8);
    expect(fillGaps([[1, null, 3], [null, 5, 7]])).toEqual([[1, 6], [2, 5], [3, 7]]);
  });
});

describe('drift', () => {
  it('is steady for the same rows, and names what moved', () => {
    const rnd = random(3);
    const a = Array.from({ length: 2000 }, () => 10 + normal(rnd));
    expect(psi([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(drift('measure', a, a).level).toBe('steady');
    const moved = drift('measure', a, a.map((v) => v + 1.5), (v) => v.toFixed(1));
    expect(moved.level).toBe('shifted');
    expect(moved.note).toMatch(/^median 10\.\d → 11\.\d$/);
    const before = [...Array(900).fill('dry'), ...Array(80).fill('rain'), ...Array(20).fill('heavy rain')];
    const after = [...Array(900).fill('dry'), ...Array(40).fill('rain'), ...Array(60).fill('heavy rain')];
    const d = drift('category', before, after);
    expect(d.psi).toBeGreaterThan(0.05);
    expect(d.note).toMatch(/^(rain|heavy rain) /);
    // A column that empties out drifts too.
    expect(drift('measure', a, a.map((v, i) => (i % 2 ? null : v))).level).not.toBe('steady');
  });
});

describe('suggested checks', () => {
  it('bound far tails, flag gaps and negatives, guard small categories, and leave checked columns alone', () => {
    const rnd = random(5);
    const speeds = [...Array.from({ length: 995 }, () => 12 + 3 * normal(rnd)), 150, 220, 312, 400, 90];
    const tips = [...Array.from({ length: 990 }, () => Math.abs(normal(rnd))), -5, null, null, null, null, null, null, null, null, null];
    const boroughs = Array.from({ length: 1000 }, (_, i) => ['Manhattan', 'Queens', 'Brooklyn'][i % 3]!);
    const profiles = [profileColumn('speed_mph', 'real', facts(speeds), speeds), profileColumn('tip_amount', 'real', facts(tips), tips), profileColumn('pu_borough', 'text', facts(boroughs), boroughs), profileColumn('fare_amount', 'real', facts(speeds), speeds)];
    const got = suggestChecks(profiles, { covered: new Set(['fare_amount']), values: new Map([['pu_borough', ['Queens', 'Manhattan', 'Brooklyn']]]) });
    const by = Object.fromEntries(got.map((s) => [s.name, s]));
    expect(by.speed_mph_range!.check).toMatch(/^speed_mph IS NULL OR speed_mph <= \d+$/);
    expect(by.speed_mph_range!.guard).toBe(false);
    expect(by.tip_amount_present!.check).toBe('tip_amount IS NOT NULL');
    expect(by.tip_amount_not_negative!.check).toBe('tip_amount IS NULL OR tip_amount >= 0');
    expect(by.pu_borough_known!.check).toBe("pu_borough IS NULL OR pu_borough IN ('Brooklyn', 'Manhattan', 'Queens')");
    expect(by.pu_borough_known!.guard).toBe(true);
    expect(got.some((s) => s.column === 'fare_amount')).toBe(false);
    // Catches come before guards.
    const lastCatch = got.map((s) => !s.guard).lastIndexOf(true);
    expect(got.findIndex((s) => s.guard)).toBeGreaterThan(lastCatch);
  });

  it('never bounds a documented code or a tail more than 1% of rows reach, and says what the rows cover (tabs #14)', () => {
    // A weather file's codes: clear to overcast most hours, drizzle, rain and snow (51–75) a fifth of them. As a number
    // its tail lies past 12, but the codes are documented: no bound, the documented codes instead, said by meaning.
    const codes = Array.from({ length: 1000 }, (_, i) => (i % 5 === 0 ? [51, 53, 55, 61, 63, 65, 71, 73, 75][(i / 5) % 9]! : [0, 1, 2, 3][i % 4]!));
    const wmo: Record<string, string> = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snowfall', 73: 'Moderate snowfall', 75: 'Heavy snowfall', 95: 'Thunderstorm' };
    const p = profileColumn('weather_code', 'int', facts(codes), codes);
    const held = [...new Set(codes.map(String))];
    const got = suggestChecks([p], { values: new Map([['weather_code', held]]), documented: new Map([['weather_code', Object.keys(wmo)]]), meaning: (_c, v) => wmo[v], span: 'in this file' });
    expect(got.some((x) => x.kind === 'range')).toBe(false);
    const doc = got.find((x) => x.kind === 'documented')!;
    expect(p.kind).toBe('measure');
    expect(doc.check).toBe('weather_code IS NULL OR weather_code IN (0, 1, 2, 3, 45, 51, 53, 55, 61, 63, 65, 71, 73, 75, 95)');
    expect(doc.guard).toBe(true);
    expect(doc.why).toBe('It holds 13 of the 15 codes its source documents; 51–75 are Light drizzle to Heavy snowfall, not outliers. This flags any other.');
    // A coded column that isn't a number with a tail says no more than how many codes it holds.
    const vendors = Array.from({ length: 300 }, (_, i) => [1, 2][i % 2]!);
    const v = suggestChecks([profileColumn('VendorID', 'int', facts(vendors), vendors)], { values: new Map([['VendorID', ['1', '2']]]), documented: new Map([['VendorID', ['1', '2', '6', '7']]]), meaning: (_c, x) => ({ 1: 'Creative Mobile', 2: 'Curb Mobility' })[x as '1' | '2'] });
    expect(v.find((x) => x.kind === 'documented')!.why).toBe('It holds 2 of the 4 codes its source documents. This flags any other.');
    // A tail a twentieth of the rows reach (surcharges, airport fares) is no far tail: no bound. A few far rows are.
    const rnd = random(9);
    const extras = Array.from({ length: 1000 }, (_, i) => (i % 20 === 0 ? 7.75 : Math.round(Math.abs(normal(rnd)) * 2) / 2));
    expect(suggestChecks([profileColumn('extra', 'real', facts(extras), extras)]).some((x) => x.kind === 'range')).toBe(false);
    const far = [...Array.from({ length: 997 }, () => 12 + 3 * normal(rnd)), 150, 220, 312];
    const range = suggestChecks([profileColumn('speed_mph', 'real', facts(far), far)]).find((x) => x.kind === 'range')!;
    expect(range.bound).toBe(Number(/<= ([\d.]+)$/.exec(range.check)![1]));
    // The rows' span in the reasons: a day's load says "today", a file of many days "in this file".
    const boroughs = Array.from({ length: 300 }, (_, i) => ['Manhattan', 'Queens', 'Bronx'][i % 3]!);
    const b = profileColumn('borough', 'text', facts(boroughs), boroughs);
    const known = new Map([['borough', ['Bronx', 'Manhattan', 'Queens']]]);
    expect(suggestChecks([b], { values: known, span: 'in this file' }).map((x) => x.why)).toEqual(['It takes 3 values in this file; this flags a new one.', 'Every row has a borough in this file; this flags one that doesn\'t.']);
    expect(suggestChecks([b], { values: known })[0]!.why).toBe('It takes 3 values today; this flags a new one.');
  });

  it('reads bounds and names as people would', () => {
    expect([niceCeil(47.3), niceCeil(312), niceCeil(1), niceCeil(0.023), niceCeil(21), niceCeil(29.8)]).toEqual([50, 400, 1, 0.025, 25, 30]);
    expect([columnSql('speed_mph'), columnSql('time'), columnSql('Airport_fee'), columnSql('trip distance')]).toEqual(['speed_mph', '"time"', 'Airport_fee', '"trip distance"']);
  });
});

describe('data quality on real data', () => {
  it('suggests checks whose counts are what the run reports once they are added as a box', async () => {
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    for (const s of EXAMPLE_SOURCES) {
      await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, new Uint8Array(readFileSync(new URL(`../fixtures/xs/${s.file}`, import.meta.url)))]);
      await db.execAsync(s.ddl);
    }
    const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
    const first = await runFlow(db, doc, { smaltdb: SMALTDB });
    const plan = JSON.parse(String(db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [first.manifest.plan]).rows[0]![0])) as FlowPlan;
    const tables = new Map<number, string>();
    for (const m of first.manifest.nodes) {
      const t = db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [m.key]).rows[0];
      if (t) tables.set(m.node, String(t[0]));
    }
    const { stored } = shapeOf(plan);
    const ctx: EmitContext = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns: (i) => plan.nodes[i]!.schema!.map(([c]) => c) };
    const i = plan.nodes.findIndex((n) => n.origin === 'trips_enriched');
    const read = emitRead(plan, i, ctx);
    const schema = plan.nodes[i]!.schema!;
    const row = db.query(emitColumnFacts(read, schema.map(([name, type]) => ({ name, numeric: ['int', 'real', 'num'].includes(type) })))).rows[0]!;
    const rows = Number(row[0]);
    const every = Math.ceil(rows / 500);
    const sample = db.query(emitSample(read, schema.map(([c]) => c), every)).rows;
    expect(sample).toHaveLength(Math.ceil(rows / every));
    const profiles = schema.map(([name, type], k) => profileColumn(name, type, { rows, present: Number(row[1 + 5 * k]), distinct: Number(row[2 + 5 * k]), min: row[3 + 5 * k], max: row[4 + 5 * k], mean: row[5 + 5 * k] as number | null }, sample.map((r) => r[k])));
    const kind = Object.fromEntries(profiles.map((p) => [p.name, p.kind]));
    expect([kind.trip_distance, kind.VendorID, kind.tpep_pickup_datetime, kind.pu_borough]).toEqual(['measure', 'code', 'time', 'category']);
    const values = new Map(profiles.filter((p) => (p.kind === 'category' || p.kind === 'code') && p.facts.distinct <= 12).map((p) => [p.name, db.query(emitDistinct(read, p.name, 13)).rows.map((r) => r[0]).filter((v) => v !== null).map(String)] as const));
    // The trip checks upstream already cover their columns.
    const valid = doc.steps.find((s) => s.id === 'trips_valid')!;
    const covered = new Set(valid.kind === 'expectations' ? valid.rules.flatMap((r) => [...identifiers(r.check)]) : []);
    // For the step's own columns: the ones its formulas add.
    const added = new Set(schema.map(([c]) => c.toLowerCase()).filter((c) => !ctx.columns(plan.nodes[i]!.inputs[0]!).some((x) => x.toLowerCase() === c)));
    expect([...added]).toEqual(['duration_min', 'pu_hour', 'speed_mph', 'card_tip_rate']);
    const suggestions = suggestChecks(profiles, { covered, values, only: added });
    // All of them, from the columns the trips arrive with, find the ones missing together.
    const all = suggestChecks(profiles, { covered, values });
    expect(all.filter((s) => s.check.endsWith('IS NOT NULL') && !s.guard)).toHaveLength(1);
    expect(all.find((s) => s.check === 'RatecodeID IS NOT NULL')!.why).toMatch(/RatecodeID, store_and_fwd_flag, congestion_surcharge or Airport_fee: they go missing together\.$/);
    expect(suggestions.length).toBeGreaterThan(2);
    expect(suggestions.every((s) => added.has(s.column.toLowerCase()))).toBe(true);
    // Duration's far tail gets a bound; speed's doesn't: more than 1% of the sampled trips go past 30 mph (tabs #14).
    expect(suggestions.some((s) => s.name === 'duration_min_range' && !s.guard)).toBe(true);
    expect(suggestions.some((s) => s.name === 'speed_mph_range')).toBe(false);
    const counts = db.query(emitCheckCounts(read, suggestions.map((s) => s.check))).rows[0]!.map(Number);
    // Odd rows, on the sample's measures.
    const measures = profiles.filter((p) => p.kind === 'measure');
    const scores = isolationForest(fillGaps(measures.map((p) => sample.map((r) => r[schema.findIndex(([c]) => c === p.name)] as number | null))));
    expect(scores).toHaveLength(sample.length);
    expect(Math.max(...scores)).toBeGreaterThan(0.6);

    // Added as a box beside the step: the run counts what the suggestions said, and nothing else changes: the box
    // computes the step it checks in its own statement, so nothing is rebuilt or newly stored.
    const box = { id: 'trips_enriched_checks', kind: 'expectations' as const, inputs: ['trips_enriched'], rules: suggestions.map((s) => ({ name: s.name, check: s.check, onFail: 'warn' as const })) };
    const next = { ...doc, steps: [...doc.steps, box] };
    expect(validateDocument(next)).toEqual([]);
    const second = await runFlow(db, next, { smaltdb: SMALTDB });
    const checks = second.manifest.nodes.find((n) => n.origin === 'trips_enriched_checks')!;
    expect(checks.expectations!.rules.map((r) => r.failed)).toEqual(counts);
    expect(checks.expectations!.dropped).toBe(0);
    const before = new Map(first.manifest.nodes.map((n) => [n.origin, n.key]));
    for (const n of second.manifest.nodes) if (n.origin !== 'trips_enriched_checks') expect(n.key, n.origin).toBe(before.get(n.origin));
    expect(second.manifest.nodes.filter((n) => n.status === 'built').map((n) => n.origin)).toEqual([]);
    expect(second.manifest.nodes.find((n) => n.origin === 'zone_hour')!.status).toBe('reused');

    // As a filter box between the step and what reads it: the rows the checks flag are dropped, what follows runs
    // again without them, and each dropped row says which rules it failed.
    const catches = suggestions.filter((x) => !x.guard);
    const filter = { id: 'trips_enriched_filtered', kind: 'expectations' as const, inputs: ['trips_enriched'], rules: catches.map((x) => ({ name: x.name, check: x.check, onFail: 'drop' as const, description: x.why })) };
    const filtered = insertAfter(doc, 'trips_enriched', filter);
    expect(validateDocument(filtered)).toEqual([]);
    const dropped = Number(db.query(emitCheckCounts(read, [catches.map((x) => `(${x.check})`).join(' AND ')])).rows[0]![0]);
    expect(dropped).toBeGreaterThan(0);
    const trips = () => Number(db.query('SELECT sum(trips) FROM zone_hour').rows[0]![0]);
    const tripsBefore = trips();
    const third = await runFlow(db, filtered, { smaltdb: SMALTDB });
    const box3 = third.manifest.nodes.find((n) => n.origin === 'trips_enriched_filtered')!;
    expect(box3.expectations!.dropped).toBe(dropped);
    expect(trips()).toBe(tripsBefore - dropped);
    expect(third.manifest.nodes.find((n) => n.origin === 'zone_hour')!.status).toBe('built');
    const plan3 = JSON.parse(String(db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [third.manifest.plan]).rows[0]![0])) as FlowPlan;
    const tables3 = new Map<number, string>();
    for (const m of third.manifest.nodes) {
      const t = db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [m.key]).rows[0];
      if (t) tables3.set(m.node, String(t[0]));
    }
    const stored3 = shapeOf(plan3).stored;
    const ctx3: EmitContext = { table: (j) => (stored3.has(j) ? tables3.get(j) : undefined), columns: (j) => plan3.nodes[j]!.schema!.map(([c]) => c) };
    const at3 = plan3.nodes.findIndex((n) => n.origin === 'trips_enriched_filtered');
    const flags = catches.map((_, k) => k);
    const why = db.query(`SELECT ${flags.map((k) => `"_smaltfl_fail_${k}"`).join(', ')} FROM (${emitDropped(plan3, at3, flags, ctx3)})`).rows;
    expect(why).toHaveLength(dropped);
    expect(why.every((r) => r.some((v) => Number(v) === 1))).toBe(true);
    expect(catches.map((_, k) => why.filter((r) => Number(r[k]) === 1).length)).toEqual(box3.expectations!.rules.map((r) => r.failed));
    // Three runs of the flow on real data: about four seconds alone, more beside the other real-data tests.
  }, 30_000);
});
