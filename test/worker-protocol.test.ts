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
import { runFlow, verifyRun } from '../src/index.js';
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

  it("carries a run's error back, with the step it came from", async () => {
    const c = await openClient();
    const doc = visualFlow();
    const dedup = doc.steps.find((s) => s.id === 'trips_dedup')!;
    if (dedup.kind === 'sql') dedup.sql = 'SELECT * FROM raw_trips';
    await expect(runFlow(c, doc, { smaltdb: SMALTDB })).rejects.toThrow('trips_dedup: reads raw_trips, which is not one of its inputs: add it as a source');
  });
});
