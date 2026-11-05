/**
 * The example flow (examples/nyc-taxis-weather.smaltfl.json) on real data: tier XS, 10,000 trips sampled from the
 * TLC records for January 2024, with the zone lookup and Open-Meteo weather (fixtures/xs). Its results are checked
 * against the same rules computed independently in plain JavaScript, reading the Parquet file with hyparquet.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import { parquetReadObjects } from 'hyparquet';
import smaltfl from '../src/plugin/index.js';
import { runFlow, verifyRun, type FlowDocument } from '../src/index.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';

const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/xs/${name}`, import.meta.url)));

async function engine(): Promise<Database> {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  for (const s of EXAMPLE_SOURCES) {
    // A plain Uint8Array: @smaltdb/external misreads a Node Buffer (Buffer#slice is a view, not a copy).
    await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, fixture(s.file)]);
    await db.execAsync(s.ddl);
  }
  return db;
}

/** The checks and the borough totals, computed without the engine. */
async function reference() {
  const bytes = fixture('trips.parquet');
  const trips = (await parquetReadObjects({ file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })) as Record<string, unknown>[];
  const iso = (d: unknown) => (d as Date).toISOString().replace('T', ' ').slice(0, 19);
  const seconds = (t: Record<string, unknown>) => ((t.tpep_dropoff_datetime as Date).getTime() - (t.tpep_pickup_datetime as Date).getTime()) / 1000;
  const n = (v: unknown) => Number(v);
  const rules: Record<string, (t: Record<string, unknown>) => boolean> = {
    in_month: (t) => iso(t.tpep_pickup_datetime).slice(0, 7) === '2024-01',
    duration: (t) => seconds(t) >= 60 && seconds(t) <= 10800,
    distance: (t) => n(t.trip_distance) > 0 && n(t.trip_distance) <= 100,
    fare: (t) => n(t.fare_amount) >= 0,
    known_zones: (t) => ![264, 265].includes(n(t.PULocationID)) && ![264, 265].includes(n(t.DOLocationID)),
    passengers: (t) => t.passenger_count !== null && t.passenger_count !== undefined,
  };
  const drops = ['in_month', 'duration', 'distance', 'fare', 'known_zones'];
  const failed = Object.fromEntries(Object.entries(rules).map(([k, ok]) => [k, trips.filter((t) => !ok(t)).length]));
  const valid = trips.filter((t) => drops.every((k) => rules[k]!(t)));
  const seen = new Set<string>();
  const unique = valid.filter((t) => {
    const key = JSON.stringify(t, (_k, v) => (typeof v === 'bigint' ? String(v) : v));
    return seen.has(key) ? false : (seen.add(key), true);
  });
  const zones = new Map<number, string>();
  for (const line of new TextDecoder().decode(fixture('zones.csv')).trim().split('\n').slice(1)) {
    const [id, borough] = line.split(',').map((f) => f.replace(/^"|"$/g, ''));
    zones.set(Number(id), borough!);
  }
  const byBorough = new Map<string, number>();
  for (const t of unique) {
    const b = zones.get(n(t.PULocationID)) ?? null;
    byBorough.set(String(b), (byBorough.get(String(b)) ?? 0) + 1);
  }
  return { rows: trips.length, failed, dropped: trips.length - valid.length, unique: unique.length, byBorough };
}

describe('the example flow on real data (tier XS)', () => {
  it('runs, and its checks and totals match the independent computation', async () => {
    const db = await engine();
    const r = await runFlow(db, doc, { smaltdb: SMALTDB });
    const ref = await reference();
    const valid = r.manifest.nodes.find((x) => x.origin === 'trips_valid')!;
    expect(valid.expectations).toEqual({
      rows: ref.rows,
      dropped: ref.dropped,
      rules: Object.entries(ref.failed).map(([name, failed]) => ({ name, onFail: name === 'passengers' ? 'warn' : 'drop', failed })),
    });
    const totals = new Map(db.query('SELECT pu_borough, sum(trips) FROM borough_hour GROUP BY 1').rows.map(([b, n]) => [String(b), Number(n)]));
    expect(totals).toEqual(ref.byBorough);
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(ref.unique);
  });

  it("measures weather's effect on demand for every borough with dry hours to compare against", async () => {
    const db = await engine();
    await runFlow(db, doc, { smaltdb: SMALTDB });
    const conditions = db.query("SELECT condition, hours FROM weather_effect WHERE borough = 'Manhattan' ORDER BY condition").rows;
    expect(conditions.map(([c]) => c)).toEqual(['dry', 'heavy rain', 'rain', 'snow']);
    const dry = db.query("SELECT vs_dry FROM weather_effect WHERE borough = 'Manhattan' AND condition = 'dry'").rows[0]![0] as number;
    expect(dry).toBeCloseTo(1, 1);
    const weather = db.query('SELECT condition, count(*) FROM weather_hourly GROUP BY 1 ORDER BY 1').rows;
    expect(weather.reduce((n, [, c]) => n + Number(c), 0)).toBe(6 * 744);
  });

  it('reuses everything on a second run, and verifies', async () => {
    const db = await engine();
    const first = await runFlow(db, doc, { smaltdb: SMALTDB });
    const second = await runFlow(db, doc, { smaltdb: SMALTDB });
    expect(second.manifest.outputs).toEqual(first.manifest.outputs);
    expect(second.manifest.nodes.filter((x) => x.status === 'built').map((x) => x.origin)).toEqual([]);
    expect((await verifyRun(db, second.run, { smaltdb: SMALTDB })).ok).toBe(true);
  });
});
