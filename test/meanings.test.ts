/**
 * What the columns mean, the ontology's property types: checked, kept out of keys, and complete for the example on
 * real data (tier XS), codes included. And the checks that judge a step's rows, which the app uses to say an odd row
 * is already taken care of: found on paths that keep rows and values, and evaluated on each row as the engine would.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { meaningOf, propertyOf, runFlow, translate, validateDocument, type FlowDocument, type FlowPlan, type RunResult } from '../src/index.js';
import { emitDistinct, emitRead, emitSample, type EmitContext } from '../src/core/emit.js';
import { insertAfter } from '../src/core/document.js';
import { nodeKey } from '../src/core/keys.js';
import { shapeOf } from '../src/core/optimize.js';
import { checksOver, selectsStar, suggestChecks, profileColumn } from '../src/core/quality.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { examplePublishing } from './helpers/example.js';
import { visualFlow } from './fixtures/taxi.js';

const example = examplePublishing;
const ontology = (extra: object = {}) => ({ objectTypes: [], linkTypes: [], actionTypes: [], ...extra });

describe('what the columns mean', () => {
  it('is checked: a column, a title and a description each, with codes, references and datasets that exist', () => {
    const ok = { ...visualFlow(), ontology: ontology({
      references: [{ id: 'tlc', title: 'Data Dictionary', url: 'https://example.org/dictionary.pdf' }],
      properties: [
        { column: 'payment_type', title: 'Payment type', description: 'How the passenger paid.', values: { '1': 'Credit card' }, sources: ['tlc'] },
        { column: 'card_tip_rate', title: 'Card tip rate', description: 'Per trip.', datasets: ['trips_enriched'] },
        { column: 'card_tip_rate', title: 'Card tip rate', description: 'Averaged.', datasets: ['zone_hour'] },
      ],
    }) };
    expect(validateDocument(ok)).toEqual([]);
    const bad = { ...visualFlow(), ontology: ontology({
      references: [{ id: 'tlc', title: 'Data Dictionary', url: 'https://example.org/dictionary.pdf' }, { id: 'tlc', title: 'Again', url: 'x' }],
      properties: [
        { column: 'fare_amount', title: 'Meter fare' },
        { column: 'trip_distance', title: 'Distance', description: 'Miles.', unit: 3, sources: ['nowhere'] },
        { column: 'payment_type', title: 'Payment type', description: 'How.', values: { '1': 1 } },
        { column: 'Payment_Type', title: 'Again', description: 'Twice.' },
        { column: 'trips', title: 'Trips', description: 'Count.', datasets: ['nowhere'] },
      ],
    }) } as unknown as FlowDocument;
    expect(validateDocument(bad)).toEqual([
      { path: '$.ontology.references[1].id', message: 'duplicate reference tlc' },
      { path: '$.ontology.properties[0]', message: '{ column, title, description }' },
      { path: '$.ontology.properties[1].unit', message: 'text' },
      { path: '$.ontology.properties[1].sources[0]', message: 'no reference nowhere' },
      { path: '$.ontology.properties[2].values', message: 'each code with its meaning, as text' },
      { path: '$.ontology.properties[3].column', message: 'Payment_Type is described twice' },
      { path: '$.ontology.properties[4].datasets[0]', message: 'no source or step nowhere' },
    ]);
    const lookup = { column: 'PULocationID', title: 'Pickup zone', description: 'Where.', lookup: { dataset: 'zones', key: 'LocationID', label: 'Zone' } };
    expect(validateDocument({ ...visualFlow(), ontology: ontology({ properties: [lookup] }) })).toEqual([]);
    expect(validateDocument({ ...visualFlow(), ontology: ontology({ properties: [{ ...lookup, lookup: { dataset: 'nowhere', key: 'LocationID' } }] }) } as unknown as FlowDocument)).toEqual([{ path: '$.ontology.properties[0].lookup', message: '{ dataset: a source or step, key, label }' }]);
  });

  it("finds a dataset's own meaning first, then the shared one, in any case; and reads codes as text", () => {
    const o = example().ontology;
    expect(propertyOf(o, 'zone_hour', 'card_tip_rate')!.description).toMatch(/^The average/);
    expect(propertyOf(o, 'trips_enriched', 'CARD_TIP_RATE')!.description).toMatch(/^The tip as a share/);
    expect(propertyOf(o, 'trips_valid', 'card_tip_rate')).toBeUndefined();
    expect(propertyOf(o, 'zones', 'Borough')).toBe(propertyOf(o, 'weather', 'borough'));
    const pay = propertyOf(o, 'trips', 'payment_type');
    expect([meaningOf(pay, 1), meaningOf(pay, 0), meaningOf(pay, 1n), meaningOf(pay, 9), meaningOf(pay, null)]).toEqual(['Credit card', 'Flex Fare trip', 'Credit card', undefined, undefined]);
    expect(meaningOf(propertyOf(o, 'trips', 'trip_distance'), 1)).toBeUndefined();
  });

  it('stays out of the keys: what a column means changes no step', async () => {
    const env = { smaltdb: '0.9.0', smaltfl: '0.0.0' };
    const keysOf = async (doc: FlowDocument) => {
      const plan = await translate(doc);
      const keys: string[] = [];
      for (const n of plan.nodes) keys.push(await nodeKey(n, n.inputs.map((j) => keys[j]!), env, n.op === 'table' ? `content-of-${n.table}` : undefined));
      return keys;
    };
    const doc = example();
    const bare = { ...doc, ontology: { ...doc.ontology!, properties: undefined, references: undefined } };
    expect(await keysOf(doc)).toEqual(await keysOf(bare));
  });

  it('suggests the codes its source documents, and catches one it does not', () => {
    const facts = { rows: 4, present: 4, distinct: 2, min: 1, max: 9, mean: null };
    const p = profileColumn('RatecodeID', 'int', facts, [1, 1, 9, 1]);
    const documented = new Map([['RatecodeID', ['1', '2', '99']]]);
    const [s] = suggestChecks([p], { values: new Map([['RatecodeID', ['1', '9']]]), documented });
    expect(s).toMatchObject({ name: 'RatecodeID_documented', check: 'RatecodeID IS NULL OR RatecodeID IN (1, 2, 99)', guard: false });
    expect(s!.why).toBe('Its source documents 3 codes, and 9 isn’t one.');
    const [g] = suggestChecks([profileColumn('RatecodeID', 'int', { ...facts, max: 2 }, [1, 2, 1, 1])], { values: new Map([['RatecodeID', ['1', '2']]]), documented });
    expect(g).toMatchObject({ name: 'RatecodeID_documented', guard: true });
  });
});

describe('the example on real data', () => {
  const doc = example();
  let db: Database;
  let first: RunResult;
  let plan: FlowPlan;
  let ctx: EmitContext;
  const at = (origin: string) => plan.nodes.findIndex((n) => n.origin === origin);
  const columnsOf = (j: number) => plan.nodes[j]!.schema!.map(([c]) => c);

  beforeAll(async () => {
    db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    for (const s of EXAMPLE_SOURCES) {
      await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, new Uint8Array(readFileSync(new URL(`../fixtures/xs/${s.file}`, import.meta.url)))]);
      await db.execAsync(s.ddl);
    }
    first = await runFlow(db, doc, { smaltdb: SMALTDB });
    plan = JSON.parse(String(db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [first.manifest.plan]).rows[0]![0])) as FlowPlan;
    const tables = new Map<number, string>();
    for (const m of first.manifest.nodes) {
      const t = db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [m.key]).rows[0];
      if (t) tables.set(m.node, String(t[0]));
    }
    const { stored } = shapeOf(plan);
    ctx = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns: columnsOf };
  });

  it('says what every column of every source and step means, and what each code in the data stands for', async () => {
    const missing: string[] = [];
    const unknown: string[] = [];
    for (const [j, n] of plan.nodes.entries()) {
      for (const c of columnsOf(j)) {
        const p = propertyOf(doc.ontology, n.origin, c);
        if (!p) missing.push(`${n.origin}.${c}`);
        else if (p.values) {
          const values = (await db.queryAsync(emitDistinct(emitRead(plan, j, ctx), c, 100))).rows.map((r) => r[0]).filter((v) => v !== null);
          for (const v of values) if (meaningOf(p, v) === undefined) unknown.push(`${n.origin}.${c} = ${String(v)}`);
        } else if (p.lookup) {
          // Every key has its name in the lookup.
          const keys = emitRead(plan, at(p.lookup.dataset), ctx);
          const [[orphans]] = (await db.queryAsync(`SELECT count(*) FROM (${emitRead(plan, j, ctx)}) t WHERE t."${c}" IS NOT NULL AND t."${c}" NOT IN (SELECT "${p.lookup.key}" FROM (${keys}))`)).rows as [[number]];
          if (orphans) unknown.push(`${n.origin}.${c}: ${orphans} keys not in ${p.lookup.dataset}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('pairs each pickup hour with the precipitation that fell during it, which Open-Meteo stamps at the hour’s end', async () => {
    expect(db.query("SELECT \"time\", precipitation, condition FROM weather_hourly WHERE borough = 'Manhattan' AND hour = '2024-01-01 07:00'").rows).toEqual([['2024-01-01T08:00', 0.1, 'rain']]);
    const joined = emitRead(plan, at('borough_hour_weather'), ctx);
    const [[pairs, same]] = (await db.queryAsync(`SELECT count(*), sum(j.precip_mm = w.precipitation) FROM (${joined}) j JOIN weather_file w ON w.borough = j.pu_borough AND w."time" = strftime('%Y-%m-%dT%H:00', j.pu_hour, '+1 hour')`)).rows as [[number, number]];
    expect(pairs).toBeGreaterThan(1000);
    expect(same).toBe(pairs);
  });

  it('finds the checks that judge a step: after a source, before what follows a plain select, none past an aggregate', () => {
    const judges = (origin: string) => checksOver(plan, at(origin), columnsOf).map((j) => `${j.at} ${plan.nodes[j.node]!.origin}.${j.name}`);
    const rules = ['in_month', 'duration', 'distance', 'fare', 'known_zones', 'passengers'];
    expect(judges('trips')).toEqual(rules.map((r) => `after trips_valid.${r}`));
    expect(judges('trips_valid')).toEqual(rules.map((r) => `here trips_valid.${r}`));
    // trips_dedup is SELECT DISTINCT * FROM trips_valid: the rows it keeps are trips_valid's, values unchanged.
    expect(judges('trips_enriched')).toEqual(rules.map((r) => `before trips_valid.${r}`));
    expect(judges('zone_hour')).toEqual([]);
    expect(checksOver(plan, at('trips'), columnsOf).find((j) => j.name === 'duration')!.reads.sort()).toEqual(['tpep_dropoff_datetime', 'tpep_pickup_datetime']);
  });

  it('flags each row with the checks it fails, as the run counts them', async () => {
    const i = at('trips');
    const judges = checksOver(plan, i, columnsOf);
    const columns = columnsOf(i);
    const rows = (await db.queryAsync(emitSample(emitRead(plan, i, ctx), columns, 1, judges.map((j) => j.check)))).rows;
    expect(rows).toHaveLength(10000);
    expect(rows[0]).toHaveLength(columns.length + judges.length);
    const failed = judges.map((_, k) => rows.filter((r) => r[columns.length + k] === 1).length);
    expect(failed).toEqual(first.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations!.rules.map((r) => r.failed));
  });
});

describe('paths that keep rows and values', () => {
  it('reads a plain select of one input as keeping its rows', () => {
    expect(selectsStar('SELECT DISTINCT * FROM trips_valid', 'trips_valid')).toBe(true);
    expect(selectsStar('select * from "Trips_Valid" where fare_amount > 0 order by 1 limit 5', 'trips_valid')).toBe(true);
    expect(selectsStar('SELECT * FROM trips_valid WHERE PULocationID IN (SELECT LocationID FROM zones)', 'trips_valid')).toBe(true);
    expect(selectsStar('SELECT *, 1 AS one FROM trips_valid', 'trips_valid')).toBe(false);
    expect(selectsStar('SELECT * FROM trips_valid JOIN zones ON 1', 'trips_valid')).toBe(false);
    expect(selectsStar('SELECT * FROM trips_valid UNION ALL SELECT * FROM trips_valid', 'trips_valid')).toBe(false);
    expect(selectsStar('SELECT * FROM other', 'trips_valid')).toBe(false);
  });

  it('leaves out a check across a step that sets a column it reads', async () => {
    const doc = visualFlow();
    const doubled = insertAfter(doc, 'trips_valid', { id: 'doubled', kind: 'formula', inputs: ['trips_valid'], columns: [{ name: 'fare_amount', expr: 'fare_amount * 2' }] });
    const checked = insertAfter(doubled, 'doubled', { id: 'later', kind: 'expectations', inputs: ['doubled'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }, { name: 'far', check: 'trip_distance < 50', onFail: 'warn' }] });
    const plan = await translate(checked);
    const trips = ['VendorID', 'tpep_pickup_datetime', 'tpep_dropoff_datetime', 'passenger_count', 'trip_distance', 'PULocationID', 'DOLocationID', 'payment_type', 'fare_amount', 'tip_amount', 'total_amount'];
    const cols = (j: number): string[] => (plan.nodes[j]!.op === 'aggregate' || plan.nodes[j]!.op === 'sql' ? ['x'] : trips);
    const valid = plan.nodes.findIndex((n) => n.origin === 'trips_valid');
    const found = checksOver(plan, valid, cols).filter((j) => j.at === 'after').map((j) => j.name);
    expect(found).toEqual(['far']);
  });
});
