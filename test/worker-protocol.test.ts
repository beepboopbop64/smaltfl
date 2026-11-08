/**
 * The path a page takes: the smaltdb client talks to the engine server (here in this thread, behind a stand-in for
 * the Worker, with every message structured-cloned), which runs the smaltfl plugin. Plans, results and errors must
 * cross the worker protocol unchanged.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as client from 'smaltdb';
import { Database } from 'smaltdb/engine';
import { EngineServer } from 'smaltdb-src/engine/server.js';
import type { Request, Response } from 'smaltdb-src/shared/protocol.js';
import { insertAfter, pinFile, releaseRun, repairDocument, runFlow, verifyRun, type FlowDocument, type Repair, type StoryClaim } from '../src/index.js';
import { sha256Hex } from '../src/core/hash.js';
import smaltfl from '../src/plugin/index.js';
import { literal } from '../src/core/sqltext.js';
import { loadFixture, makeTrips, visualFlow, ZONES } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

/** A Worker stand-in: the engine server runs in this thread; messages are cloned and delivered on later ticks. */
class FakeWorker {
  onmessage: ((e: { data: Response }) => void) | null = null;
  onerror: unknown = null;
  private readonly server = new EngineServer((_session, msg) => setTimeout(() => this.onmessage?.({ data: structuredClone(msg) })), {
    open: () => Database.openMemory({ plugins: [smaltfl] }),
    refreshTimer: false,
  });
  postMessage(req: Request): void {
    const r = structuredClone(req);
    setTimeout(() => this.server.receive(EngineServer.LOCAL, r));
  }
  terminate(): void {}
}

// The client checks `instanceof Worker`, which Node doesn't have.
(globalThis as { Worker?: unknown }).Worker ??= FakeWorker;

const opened: client.Database[] = [];
afterEach(async () => {
  for (const c of opened.splice(0)) await c.close();
});

const TRIPS = makeTrips(400, 7);

async function openClient(): Promise<client.Database> {
  const c = await client.open(':memory:', { storage: 'memory', worker: new FakeWorker() as unknown as Worker });
  opened.push(c);
  // The same tables as loadFixture, written through the client in two statements.
  await c.exec('CREATE TABLE raw_zones(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT)');
  await c.exec(
    'CREATE TABLE raw_trips(VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL)',
  );
  await c.exec(`INSERT INTO raw_zones VALUES ${ZONES.map(([id, b, z, s]) => `(${id}, ${literal(b, 'text')}, ${literal(z, 'text')}, ${literal(s, 'text')})`).join(', ')}`);
  const types = ['integer', 'text', 'text', 'integer', 'real', 'integer', 'integer', 'integer', 'real', 'real', 'real', 'real'] as const;
  await c.exec(`INSERT INTO raw_trips VALUES ${TRIPS.map((t) => `(${t.map((v, k) => literal(v, types[k]!)).join(', ')})`).join(', ')}`);
  return c;
}

describe('through the worker protocol', () => {
  it('runs and verifies a flow exactly as in-process', async () => {
    const c = await openClient();
    const viaClient = await runFlow(c, visualFlow(), { smaltdb: SMALTDB });
    const local = openEngine();
    loadFixture(local, TRIPS);
    const inProcess = await runFlow(local, visualFlow(), { smaltdb: SMALTDB });
    expect(viaClient.manifest).toEqual(inProcess.manifest);
    expect(viaClient.hash).toBe(inProcess.hash);
    const viaRows = await c.query('SELECT * FROM zone_hour ORDER BY 1, 2, 3', [], { rowMode: 'array' });
    expect([...viaRows]).toEqual(local.query('SELECT * FROM zone_hour ORDER BY 1, 2, 3').rows);
    const v = await verifyRun(c, viaClient.run, { smaltdb: SMALTDB });
    expect(v.ok).toBe(true);
  });

  it('holds a run and releases it, the holds crossing by structured clone and a refused release returning', async () => {
    const c = await openClient();
    const doc: FlowDocument = { ...visualFlow(), smaltfl: 2, parameters: [...(visualFlow().parameters ?? []), { name: 'day', type: 'text', default: null }], publish: { hold: ['checks'] } };
    const held = await runFlow(c, doc, { smaltdb: SMALTDB, parameters: { month: '2024-02', day: '2024-02-01' } });
    expect(held.holds).toEqual([{ by: 'checks', node: 2, origin: 'trips_valid', said: 'dropped 400 of 400 rows (100%), more than the 5% allowed', reaches: ['borough_hour', 'zone_hour'] }]);
    expect(held).toMatchObject({ published: [], waiting: ['borough_hour', 'zone_hour'] });
    expect(await c.query("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'zone_hour'")).toEqual([{ n: 0 }]);
    const keys = Object.fromEntries(held.waiting.map((n) => [n, held.manifest.outputs[n]!.key]));
    const input = { run: held.run, manifest: held.hash, keys, option: 'asis' as const, actor: 'owner', reason: 'Real change', decision: 'd'.repeat(64) };
    await expect(releaseRun(c, { ...input, reason: null })).resolves.toMatchObject({ outcome: 'refused', why: 'publish as is needs a reason', published: [] });
    await expect(releaseRun(c, input)).resolves.toMatchObject({ outcome: 'applied', why: null, published: ['borough_hour', 'zone_hour'] });
    expect(await c.query('SELECT count(*) AS n FROM zone_hour')).toEqual([{ n: 0 }]);
    const v = await verifyRun(c, held.run, { smaltdb: SMALTDB, manifest: held.hash });
    expect(v.checks.filter((x) => !x.ok)).toEqual([]);
    expect(v.checks.filter((x) => x.check === 'held').map((x) => x.origin)).toEqual(['holds', 'borough_hour', 'zone_hour']);
  });

  it('runs a derived run staged and releases its fill, its holds and its repair crossing by structured clone', async () => {
    const c = await openClient();
    await c.exec('CREATE TABLE raw_trips_donor(VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL)');
    await c.exec('INSERT INTO raw_trips_donor SELECT * FROM raw_trips');
    const bytes = new TextEncoder().encode('{"history":true}');
    const history = { path: 'history-worker.json', sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
    await pinFile(c, history.path, bytes, history.sha256);
    const base: FlowDocument = {
      smaltfl: 2, id: 'w', name: 'W', parameters: [{ name: 'day', type: 'text', default: null }], sources: [{ id: 'trips', table: 'raw_trips' }],
      steps: [{ id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], dataset: {} }],
      publish: { hold: ['short'], watch: { trips: history.path }, period: 'day' },
    };
    const doc = insertAfter(base, 'trips', { id: 'trips_filled', kind: 'fill', inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] });
    const claim = (over: Partial<StoryClaim>): StoryClaim => ({ by: 'story', source: 'trips', day: '2024-01-15', state: 'wrong', below: true, head: 'Vendor 1 sent almost nothing', build: 'dev', history, rows: TRIPS.length, ...over });
    const held = await runFlow(c, doc, { smaltdb: SMALTDB, parameters: { day: '2024-01-15' }, claims: [claim({})] });
    expect(held.holds.map((h) => h.by)).toEqual(['story']);
    const donorClaim = claim({ source: 'trips_donor', day: '2024-01-08', state: 'calm', below: false, head: 'A normal Monday' });
    const repair: Repair = { kind: 'fill', step: 'trips_filled', source: 'trips', missing: { column: 'VendorID', value: 1 }, donor: { rule: 'weekday', direction: 'before', day: '2024-01-08', file: { path: 'raw_trips_donor', sha256: '0'.repeat(64), bytes: 0 }, claim: donorClaim } };
    const derived = await runFlow(c, repairDocument(doc, repair), { smaltdb: SMALTDB, parameters: { day: '2024-01-15' }, claims: [claim({}), donorClaim], stage: true, from: { run: held.run, manifest: held.hash } });
    const vendor1 = TRIPS.filter((t) => t[0] === 1).length;
    expect(derived.derived).toEqual({ holds: [{ by: 'derived', node: 2, origin: 'trips_filled', said: 'fills VendorID 1 from 2024-01-08', reaches: ['trips_valid'] }], filled: vendor1 });
    const donor = derived.manifest.nodes.find((n) => n.origin === 'trips_donor')!;
    const asRead = { ...repair, donor: { ...repair.donor!, file: { path: 'raw_trips_donor', sha256: donor.content!, bytes: donor.rows! } } };
    const keys = { trips_valid: derived.manifest.outputs.trips_valid!.key };
    const out = await releaseRun(c, { run: derived.run, manifest: derived.hash, keys, option: 'fill', actor: 'owner', reason: null, decision: 'd'.repeat(64), from: { run: held.run, manifest: held.hash }, repair: asRead });
    expect(out).toMatchObject({ outcome: 'applied', published: ['trips_valid'], filled: vendor1 });
    expect(await c.query('SELECT count(*) AS n FROM trips_valid WHERE filled_from IS NOT NULL')).toEqual([{ n: TRIPS.filter((t) => t[0] === 1 && t[8] >= 0).length }]);
    const v = await verifyRun(c, derived.run, { smaltdb: SMALTDB, manifest: derived.hash });
    expect(v.checks.filter((x) => !x.ok)).toEqual([]);
    expect(v.checks.find((x) => x.check === 'repair')).toMatchObject({ ok: true });
  });

  it("carries a run's error back, with the step it came from", async () => {
    const c = await openClient();
    const doc = visualFlow();
    const dedup = doc.steps.find((s) => s.id === 'trips_dedup')!;
    if (dedup.kind === 'sql') dedup.sql = 'SELECT * FROM raw_trips';
    await expect(runFlow(c, doc, { smaltdb: SMALTDB })).rejects.toThrow('trips_dedup: reads raw_trips, which is not one of its inputs: add it as a source');
  });
});
