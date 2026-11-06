/**
 * The runtime end to end, on the in-process engine with the plugin installed: the reference flow over the seeded
 * fixture, checked against the independent computation in fixtures/reference.ts, and the guarantees of ADR 0004:
 * only what changed is rebuilt, the visual and SQL versions agree, and every run can be verified.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { createIdentity, runFlow, signManifest, verifyManifest, verifyRun, type FlowDocument, type RunResult } from '../src/index.js';
import { reference } from './fixtures/reference.js';
import { loadFixture, makeTrips, sqlFlow, visualFlow, ZONES } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const TRIPS = makeTrips(6000);

function fixture(trips = TRIPS): Database {
  const db = openEngine();
  loadFixture(db, trips);
  return db;
}

const run = (db: Database, doc: FlowDocument = visualFlow(), parameters = {}) => runFlow(db, doc, { smaltdb: SMALTDB, parameters });
const status = (r: RunResult) => Object.fromEntries(r.manifest.nodes.map((n) => [n.origin, n.status]));

describe('running the reference flow', () => {
  it('matches the independent computation', async () => {
    const db = fixture();
    const ref = reference(TRIPS);
    const r = await run(db);

    const valid = r.manifest.nodes.find((n) => n.origin === 'trips_valid')!;
    expect(valid.expectations).toEqual({
      rows: ref.rows,
      dropped: ref.dropped,
      rules: Object.entries(ref.failed).map(([name, failed]) => ({ name, onFail: name === 'passengers' ? 'warn' : 'drop', failed })),
    });
    // The fixture really does have each kind of defect, and stays under the 5% the flow allows.
    expect(Object.values(ref.failed).every((n) => n > 0)).toBe(true);
    expect(ref.dropped / ref.rows).toBeLessThan(0.05);

    const rows = db.query('SELECT pu_borough, pu_zone, pu_hour, trips, avg_duration_min, avg_speed_mph, avg_fare, card_tip_rate FROM zone_hour').rows;
    expect(rows).toHaveLength(ref.zoneHour.size);
    for (const [borough, zone, hour, trips, duration, speed, fare, tip] of rows) {
      const want = ref.zoneHour.get(`${borough}|${zone}|${hour}`)!;
      expect(want, `${borough} ${zone} ${hour}`).toBeDefined();
      expect(trips).toBe(want.trips);
      expect(duration).toBeCloseTo(want.avgDuration, 9);
      expect(speed).toBeCloseTo(want.avgSpeed, 9);
      expect(fare).toBeCloseTo(want.avgFare, 9);
      if (want.tipRate === null) expect(tip).toBeNull();
      else expect(tip).toBeCloseTo(want.tipRate, 9);
    }
    const total = db.query('SELECT sum(trips) FROM borough_hour').rows[0]![0];
    expect(total).toBe(ref.unique);
    expect(db.query('SELECT count(*) FROM borough_hour').rows[0]![0]).toBe(ref.boroughHour.size);
  });

  it('stores sources and outputs, and folds the steps between them, expectations included', async () => {
    const r = await run(fixture());
    expect(status(r)).toEqual({
      trips: 'built',
      zones: 'built',
      trips_valid: 'folded',
      trips_dedup: 'folded',
      trips_zoned: 'folded',
      trips_enriched: 'folded',
      zone_hour: 'built',
      borough_hour: 'built',
    });
    expect(Object.keys(r.manifest.outputs)).toEqual(['borough_hour', 'zone_hour']);
    expect(r.manifest.parameters).toEqual({ month: '2024-01' });
    expect(r.manifest.engine).toEqual({ smaltdb: SMALTDB, smaltfl: '0.0.0' });
  });

  it('records each dataset with a typed schema, and serves it under its name', async () => {
    const db = fixture();
    await run(db);
    const cols = db.query("SELECT name FROM pragma_table_info((SELECT tbl FROM _smaltfl_versions v JOIN _smaltfl_datasets d ON d.key = v.key WHERE d.name = 'zone_hour'))").rows.map((r) => r[0]);
    expect(cols).toEqual(['pu_borough', 'pu_zone', 'pu_hour', 'trips', 'avg_duration_min', 'avg_speed_mph', 'avg_fare', 'card_tip_rate']);
    const types = db.prepare('SELECT * FROM zone_hour').columnTypes;
    expect(types).toEqual(['text', 'text', 'text', 'int', 'real', 'real', 'real', 'real']);
  });
});

describe('only what changed is rebuilt', () => {
  it('reuses everything when nothing changed, with the same hashes', async () => {
    const db = fixture();
    const first = await run(db);
    const second = await run(db);
    expect(Object.values(status(second)).filter((s) => s === 'built')).toEqual([]);
    expect(second.manifest.outputs).toEqual(first.manifest.outputs);
    expect(second.manifest.previous).toBe(first.hash);
    expect(second.run).toBe(first.run + 1);
  });

  it('rebuilds only downstream of an edited step', async () => {
    const db = fixture();
    const first = await run(db);
    const doc = visualFlow();
    const formula = doc.steps.find((s) => s.id === 'trips_enriched')!;
    if (formula.kind === 'formula') formula.columns[1]!.expr = "strftime('%Y-%m-%d %H:00', tpep_pickup_datetime, '+0 minutes')";
    const second = await run(db, doc);
    expect(status(second)).toMatchObject({ trips: 'reused', zones: 'reused', trips_valid: 'folded', zone_hour: 'built', borough_hour: 'built' });
    // The same result, reached a different way: a new key, but the same content.
    expect(second.manifest.outputs.zone_hour!.key).not.toBe(first.manifest.outputs.zone_hour!.key);
    expect(second.manifest.outputs.zone_hour!.content).toBe(first.manifest.outputs.zone_hour!.content);
  });

  it('rebuilds nothing when cards move or descriptions change', async () => {
    const db = fixture();
    await run(db);
    const doc = visualFlow();
    doc.layout = { zone_hour: [5, 5] };
    doc.steps[0]!.description = 'Trips that pass the checks';
    const again = await run(db, doc);
    expect(Object.values(status(again)).filter((s) => s === 'built')).toEqual([]);
  });

  it('notices a changed source, through its snapshot, and rebuilds from it', async () => {
    const db = fixture();
    const first = await run(db);
    db.exec("UPDATE raw_trips SET fare_amount = fare_amount + 1 WHERE PULocationID = 161 AND tpep_pickup_datetime < '2024-01-02'");
    const second = await run(db);
    expect(status(second)).toMatchObject({ trips: 'built', zones: 'reused', zone_hour: 'built', borough_hour: 'built' });
    expect(second.manifest.outputs.zone_hour!.content).not.toBe(first.manifest.outputs.zone_hour!.content);
    // Fares don't change trip counts: borough_hour was rebuilt (its input changed) and came out the same.
    expect(second.manifest.outputs.borough_hour!.content).toBe(first.manifest.outputs.borough_hour!.content);
  });

  it('rebuilds for a new parameter value, and goes back to the stored versions for the old one', async () => {
    const db = fixture();
    // The fixture has no February trips, so every row is dropped: past the 5% limit, the run fails.
    await expect(run(db, visualFlow(), { month: '2024-02' })).rejects.toThrow('trips_valid: dropped 6000 of 6000 rows (100%), more than the 5% allowed');
    const doc = visualFlow();
    const valid = doc.steps[0]!;
    if (valid.kind === 'expectations') delete valid.maxDropped;
    const jan = await run(db, doc);
    const feb = await run(db, doc, { month: '2024-02' });
    expect(feb.manifest.outputs.zone_hour!.rows).toBe(0);
    expect(db.query('SELECT count(*) FROM zone_hour').rows[0]![0]).toBe(0);
    const back = await run(db, doc);
    expect(Object.values(status(back)).filter((s) => s === 'built')).toEqual([]);
    expect(back.manifest.outputs).toEqual(jan.manifest.outputs);
    expect(db.query('SELECT count(*) FROM zone_hour').rows[0]![0]).toBe(jan.manifest.outputs.zone_hour!.rows);
  });
});

describe('watching sources', () => {
  const watchOf = (db: Database) => {
    const row = db.query("SELECT s.watch, m.is_fresh FROM _smaltfl_sources s JOIN information_schema.materialized_views m ON m.table_name = s.watch WHERE s.source = 'raw_trips'").rows[0];
    return row && { watch: row[0], fresh: row[1] };
  };

  it('keeps a watch on each source table that goes stale on any write, so an unchanged table is not read again', async () => {
    const db = fixture();
    await run(db);
    expect(watchOf(db)).toMatchObject({ fresh: 'YES' });
    db.exec('UPDATE raw_trips SET tip_amount = tip_amount WHERE rowid = 1');
    expect(watchOf(db)).toMatchObject({ fresh: 'NO' });
    const again = await run(db);
    // Read again, found to be the same content: the snapshot is reused, and the watch is fresh again.
    expect(status(again)).toMatchObject({ trips: 'reused', zone_hour: 'reused' });
    expect(watchOf(db)).toMatchObject({ fresh: 'YES' });
  });

  it("doesn't watch a view: its definition can change while its tables don't", async () => {
    const db = fixture();
    db.exec('CREATE VIEW recent_trips AS SELECT * FROM raw_trips WHERE PULocationID <> 1');
    const doc = visualFlow();
    doc.sources[0]!.table = 'recent_trips';
    const first = await run(db, doc);
    db.exec('DROP VIEW recent_trips');
    db.exec('CREATE VIEW recent_trips AS SELECT * FROM raw_trips WHERE PULocationID <> 132');
    const second = await run(db, doc);
    expect(second.manifest.nodes[0]!.content).not.toBe(first.manifest.nodes[0]!.content);
    expect(db.query("SELECT count(*) FROM _smaltfl_sources WHERE source = 'recent_trips'").rows[0]![0]).toBe(0);
  });
});

describe('one flow plan, whatever wrote it', () => {
  it('gives the visual and the SQL versions of zone_hour the same content hashes', async () => {
    const visual = await run(fixture());
    const sql = await run(fixture(), sqlFlow());
    expect(sql.manifest.outputs.zone_hour!.content).toBe(visual.manifest.outputs.zone_hour!.content);
    expect(sql.manifest.outputs.borough_hour!.content).toBe(visual.manifest.outputs.borough_hour!.content);
    // Until SQL is bound to plans, the two are different plans, so different keys.
    expect(sql.manifest.outputs.zone_hour!.key).not.toBe(visual.manifest.outputs.zone_hour!.key);
  });

  it('gives the same content hash for the same rows inserted in any order', async () => {
    const a = await run(fixture(TRIPS));
    const b = await run(fixture([...TRIPS].reverse()));
    expect(b.manifest.nodes[0]!.content).toBe(a.manifest.nodes[0]!.content);
    expect(b.manifest.outputs).toEqual(a.manifest.outputs);
  });
});

describe('a failed run leaves the previous versions current', () => {
  it('fails on a fail rule, naming the step and the rule', async () => {
    const db = fixture();
    const first = await run(db);
    const doc = visualFlow();
    const valid = doc.steps[0]!;
    if (valid.kind === 'expectations') valid.rules.push({ name: 'no_refunds', check: 'fare_amount >= 0', onFail: 'fail' });
    await expect(run(db, doc)).rejects.toThrow(/^trips_valid: expectations failed: no_refunds \(\d+ rows\)$/);
    expect(db.query('SELECT key FROM _smaltfl_datasets WHERE name = ?', ['zone_hour']).rows[0]![0]).toBe(first.manifest.outputs.zone_hour!.key);
    expect(db.query('SELECT count(*) FROM _smaltfl_runs').rows[0]![0]).toBe(1);
  });

  it('fails when more rows are dropped than allowed', async () => {
    const db = fixture();
    const doc = visualFlow();
    const valid = doc.steps[0]!;
    if (valid.kind === 'expectations') valid.maxDropped = 0.001;
    await expect(run(db, doc)).rejects.toThrow(/^trips_valid: dropped \d+ of 6000 rows \([\d.]+%\), more than the 0.1% allowed$/);
    expect(db.query("SELECT count(*) FROM sqlite_schema WHERE name = 'zone_hour'").rows[0]![0]).toBe(0);
  });

  it("reports the engine's error for a broken expression, on its step", async () => {
    const doc = visualFlow();
    const formula = doc.steps.find((s) => s.id === 'trips_enriched')!;
    if (formula.kind === 'formula') formula.columns[0]!.expr = 'no_such_column / 60.0';
    await expect(run(fixture(), doc)).rejects.toThrow(/^trips_enriched: .*no_such_column/);
  });
});

describe('what a step may read and write', () => {
  it('refuses a SQL step that reads a table that is not one of its inputs', async () => {
    const doc = visualFlow();
    const dedup = doc.steps.find((s) => s.id === 'trips_dedup')!;
    if (dedup.kind === 'sql') dedup.sql = 'SELECT DISTINCT * FROM raw_trips';
    await expect(run(fixture(), doc)).rejects.toThrow('trips_dedup: reads raw_trips, which is not one of its inputs: add it as a source');
  });

  it('refuses a SQL step that tries to write, or to run a second statement', async () => {
    for (const sql of ['DELETE FROM raw_trips', 'SELECT 1; DROP TABLE raw_trips', 'SELECT * FROM trips_valid) UNION SELECT * FROM (SELECT * FROM raw_trips']) {
      const doc = visualFlow();
      const dedup = doc.steps.find((s) => s.id === 'trips_dedup')!;
      if (dedup.kind === 'sql') dedup.sql = sql;
      await expect(run(fixture(), doc), sql).rejects.toThrow(/^trips_dedup: /);
    }
  });

  it("won't replace a table or view that isn't a smaltfl dataset", async () => {
    const db = fixture();
    db.exec('CREATE TABLE zone_hour(x INTEGER)');
    await expect(run(db)).rejects.toThrow('zone_hour: a table named zone_hour already exists and is not a smaltfl dataset');
  });

  it('names duplicate output columns', async () => {
    const doc = visualFlow();
    const zoned = doc.steps.find((s) => s.id === 'trips_zoned')!;
    if (zoned.kind === 'join') zoned.columns = [{ name: 'fare_amount', column: 'Borough' }];
    await expect(run(fixture(), doc)).rejects.toThrow('trips_zoned: two output columns are named fare_amount: rename one');
  });
});

describe('storage', () => {
  it('stores a dataset in columnar form when asked, with the same content', async () => {
    const row = await run(fixture());
    const doc = visualFlow();
    doc.steps.find((s) => s.id === 'zone_hour')!.dataset = { storage: 'columnar' };
    const db = fixture();
    const col = await run(db, doc);
    expect(col.manifest.outputs.zone_hour!.content).toBe(row.manifest.outputs.zone_hour!.content);
    expect(col.manifest.outputs.zone_hour!.key).not.toBe(row.manifest.outputs.zone_hour!.key);
    const sql = db.query("SELECT sql FROM sqlite_schema WHERE name = (SELECT tbl FROM _smaltfl_versions WHERE key = ?)", [col.manifest.outputs.zone_hour!.key]).rows[0]![0];
    expect(sql).toMatch(/WITH \(storage = 'columnar'\)$/);
  });
});

describe('verifying a run', () => {
  it('passes for an untouched run, at both levels', async () => {
    const db = fixture();
    const r = await run(db);
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB });
    expect(v.ok).toBe(true);
    expect(v.engine).toEqual({ ran: SMALTDB, verified: SMALTDB });
    const kinds = v.checks.map((c) => `${c.origin}:${c.check}`);
    expect(kinds).toEqual([
      'manifest:stored',
      'plan:stored',
      'manifest:coherent',
      'flow:flow',
      'keys:key',
      'trips:stored',
      'zones:stored',
      'zone_hour:stored',
      'borough_hour:stored',
      'borough_hour:published',
      'zone_hour:published',
      'trips_valid:accounting',
      'trips_valid:expectations',
      'zone_hour:rerun',
      'borough_hour:rerun',
    ]);
    expect([v.level, v.format]).toEqual(['rerun', 1]);
    expect(db.query("SELECT count(*) FROM sqlite_temp_schema WHERE name LIKE '_smaltfl_verify%'").rows[0]![0]).toBe(0);
  });

  it('finds a changed row in a stored dataset, and still recomputes the right one', async () => {
    const db = fixture();
    const r = await run(db);
    const table = String(db.query("SELECT v.tbl FROM _smaltfl_versions v JOIN _smaltfl_datasets d ON d.key = v.key WHERE d.name = 'zone_hour'").rows[0]![0]);
    db.exec(`UPDATE "${table}" SET trips = trips + 1 WHERE rowid = 1`);
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB });
    expect(v.ok).toBe(false);
    expect(v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`)).toEqual(['zone_hour:stored']);
  });

  it('finds a changed snapshot, and everything recomputed from it', async () => {
    const db = fixture();
    const r = await run(db);
    const table = String(db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [r.manifest.nodes[0]!.key]).rows[0]![0]);
    // Higher fares for one zone: its trips are still valid and still counted, so only the fares downstream move.
    db.exec(`UPDATE "${table}" SET fare_amount = fare_amount + 1 WHERE PULocationID = 161`);
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB });
    expect(v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`)).toEqual(['trips:stored', 'zone_hour:rerun']);
  });

  it('finds a changed manifest', async () => {
    const db = fixture();
    const r = await run(db);
    db.run("UPDATE _smaltfl_runs SET manifest = replace(manifest, '\"month\":\"2024-01\"', '\"month\":\"2024-03\"') WHERE id = ?", [r.run]);
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB });
    expect(v.checks[0]).toMatchObject({ origin: 'manifest', ok: false });
  });

  it('signs a run so that anyone it is shared with can check where its numbers came from', async () => {
    const db = fixture();
    const r = await run(db);
    const owner = await createIdentity('Owner');
    const signed = await signManifest(r.manifest, owner);
    expect(await verifyManifest(signed, owner.card)).toEqual({ ok: true });
  });
});

describe('external sources', () => {
  it('snapshots an external table by its rows, reading the file every run', async () => {
    const { Database } = await import('smaltdb/engine');
    const io = (await import('@smaltdb/io')).default;
    const external = (await import('@smaltdb/external')).default;
    const smaltfl = (await import('../src/plugin/index.js')).default;
    const db = Database.openMemory({ plugins: [io, external, smaltfl] });
    loadFixture(db, TRIPS);
    const zones = 'LocationID,Borough,Zone,service_zone\n' + ZONES.map((z) => z.map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(',')).join('\n') + '\n';
    await db.callPlugin('@smaltdb/external', 'registerFile', ['zones.csv', new TextEncoder().encode(zones)]);
    await db.execAsync("CREATE EXTERNAL TABLE zones_file(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT) WITH (location = 'file:zones.csv', format = 'csv', header = true)");
    const doc = visualFlow();
    doc.sources[1]!.table = 'zones_file';
    const fromFile = await run(db, doc);
    // The same rows as the table they were written from: the same snapshot, and the same results.
    const fromTable = await run(fixture());
    expect(fromFile.manifest.nodes[1]!.content).toBe(fromTable.manifest.nodes[1]!.content);
    expect(fromFile.manifest.outputs).toEqual(fromTable.manifest.outputs);
    expect(db.query("SELECT count(*) FROM _smaltfl_sources WHERE source = 'zones_file'").rows[0]![0]).toBe(0);
    const again = await run(db, doc);
    expect(status(again)).toMatchObject({ zones: 'reused', zone_hour: 'reused' });
  });
});
