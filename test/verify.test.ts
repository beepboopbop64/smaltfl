/**
 * Integrity through a run (ADR 0006): a source file pinned in the engine and recorded by what the engine read; run/1
 * manifests; and verify catching what it missed before: a swapped view, an edited key, a run whose previous run is
 * gone, a tampered count, a document that isn't the plan's, and a file that no longer decodes to its snapshot.
 */
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../src/plugin/index.js';
import { manifestHash, pinFile, runFlow, verifyRun, type FlowDocument } from '../src/index.js';
import { sha256Hex } from '../src/core/hash.js';
import { loadFixture, makeTrips, visualFlow, ZONES } from './fixtures/taxi.js';

import { openEngine, SMALTDB } from './helpers/engine.js';

const TRIPS = makeTrips(3000);
const zonesCsv = 'LocationID,Borough,Zone,service_zone\n' + ZONES.map((z) => z.map((v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(',')).join('\n') + '\n';
const fails = (v: Awaited<ReturnType<typeof verifyRun>>) => v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`);

/** An engine whose zones come from a pinned CSV file, as the app's sources do. */
async function pinnedEngine(name: string, bytes = new TextEncoder().encode(zonesCsv)) {
  const db = Database.openMemory({ plugins: [io, external, smaltfl] });
  loadFixture(db, TRIPS);
  const sha256 = await sha256Hex(new Uint8Array(bytes));
  await pinFile(db, name, bytes, sha256);
  await db.execAsync(`CREATE EXTERNAL TABLE zones_file(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT) WITH (location = 'smaltfl:${name}', format = 'csv', header = true)`);
  const doc = visualFlow();
  doc.sources[1]!.table = 'zones_file';
  return { db, doc, sha256, bytes };
}

describe('a pinned source file', () => {
  it('is hashed in the engine, read through smaltfl:, and recorded by what the engine read', async () => {
    const { db, doc, sha256, bytes } = await pinnedEngine('zones-a.csv');
    const r = await runFlow(db, doc, { smaltdb: SMALTDB, data: { commit: 'c'.repeat(40), manifest: 'm'.repeat(64) } });
    const zones = r.manifest.nodes.find((n) => n.origin === 'zones')!;
    expect(zones.file).toEqual({ location: 'smaltfl:zones-a.csv', sha256, bytes: bytes.byteLength });
    expect(r.manifest.nodes.find((n) => n.origin === 'trips')!.file).toBeUndefined();
    expect(r.manifest.smaltflRun).toBe(1);
    expect(r.manifest.data).toEqual({ commit: 'c'.repeat(40), manifest: 'm'.repeat(64) });
    expect(r.manifest.build!.plugins.map(([n]) => n)).toEqual(['@smaltdb/external', '@smaltdb/io', 'smaltfl']);
    expect(r.manifest.flow.policies).toMatch(/^[0-9a-f]{64}$/);
    expect(r.hash).toBe(await manifestHash(r.manifest));
    // A second run reads the file again and records it again, though the snapshot is reused.
    const again = await runFlow(db, doc, { smaltdb: SMALTDB });
    expect(again.manifest.nodes.find((n) => n.origin === 'zones')!).toMatchObject({ status: 'reused', file: { sha256 } });
  });

  it('is refused when its bytes are not the ones expected', async () => {
    const db = openEngine();
    const bytes = new TextEncoder().encode(zonesCsv);
    await expect(pinFile(db, 'zones-b.csv', bytes, '0'.repeat(64))).rejects.toThrow(/its bytes hash to [0-9a-f]{64}, not the 0{64} expected of them/);
  });

  it('decodes again to the snapshot it gave, at the rederive level', async () => {
    const { db, doc } = await pinnedEngine('zones-c.csv');
    const r = await runFlow(db, doc, { smaltdb: SMALTDB });
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rederive' });
    expect(fails(v)).toEqual(['trips:file']); // the trips are a table in the database: there is no file to decode
    expect(v.checks.find((c) => c.origin === 'zones' && c.check === 'file')).toMatchObject({ ok: true });
    // Another file under the same name: the run's own bytes are gone, and verify says so.
    const other = new TextEncoder().encode(zonesCsv.replace('Newark Airport', 'Newark Airport (EWR)'));
    await pinFile(db, 'zones-c.csv', other, await sha256Hex(other));
    const later = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rederive' });
    expect(later.checks.find((c) => c.origin === 'zones' && c.check === 'file')).toMatchObject({ ok: false, note: 'another file is pinned under that name now: load its day again to re-derive it' });
  });
});

describe('verify, end to end', () => {
  const fresh = async () => {
    const db = openEngine();
    loadFixture(db, TRIPS);
    const doc = visualFlow();
    const r = await runFlow(db, doc, { smaltdb: SMALTDB });
    return { db, doc, r };
  };

  it('passes for an untouched run at the stored level, with every new check', async () => {
    const { db, r } = await fresh();
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' });
    expect(v.ok).toBe(true);
    expect(new Set(v.checks.map((c) => c.check))).toEqual(new Set(['stored', 'coherent', 'flow', 'key', 'published', 'accounting']));
  });

  it('finds a dataset name pointed at another table', async () => {
    const { db, r } = await fresh();
    // The same version table, with a row left out: the name no longer shows what the run made.
    const table = String(db.query("SELECT v.tbl FROM _smaltfl_versions v JOIN _smaltfl_datasets d ON d.key = v.key WHERE d.name = 'zone_hour'").rows[0]![0]);
    db.exec('DROP VIEW zone_hour');
    db.exec(`CREATE VIEW zone_hour AS SELECT * FROM "${table}" WHERE rowid > 1`);
    expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(['zone_hour:published']);
  });

  it('finds a key that does not recompute, even when the manifest is re-hashed to match', async () => {
    const { db, r } = await fresh();
    const m = structuredClone(r.manifest);
    const node = m.nodes.find((n) => n.origin === 'zone_hour')!;
    node.key = 'f'.repeat(64);
    m.outputs.zone_hour!.key = node.key;
    db.run('UPDATE _smaltfl_runs SET manifest = ?, hash = ? WHERE id = ?', [JSON.stringify(m), await manifestHash(m), r.run]);
    const f = fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }));
    expect(f).toContain('zone_hour:key');
  });

  it('finds a run whose previous run is gone', async () => {
    const { db, doc } = await fresh();
    const second = await runFlow(db, doc, { smaltdb: SMALTDB });
    db.run('DELETE FROM _smaltfl_runs WHERE id = ?', [second.run - 1]);
    expect(fails(await verifyRun(db, second.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(['previous:previous']);
  });

  it('finds counts that do not add up, when the cached counts were tampered with before a run', async () => {
    const db = openEngine();
    loadFixture(db, TRIPS);
    const doc: FlowDocument = visualFlow();
    const first = await runFlow(db, doc, { smaltdb: SMALTDB });
    const valid = first.manifest.nodes.find((n) => n.origin === 'trips_valid')!;
    const forged = { ...valid.expectations!, rows: valid.expectations!.rows + 5 };
    db.run('UPDATE _smaltfl_checks SET result = ? WHERE key = ?', [JSON.stringify(forged), valid.key]);
    // The next run, on the same rows, reuses the cached counts by key, so the forgery reaches its manifest.
    const second = await runFlow(db, doc, { smaltdb: SMALTDB });
    expect(second.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations!.rows).toBe(forged.rows);
    expect(fails(await verifyRun(db, second.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(['trips_valid:accounting']);
  });

  it('refuses a run whose document is not the one the plan was made from', async () => {
    const db = openEngine();
    loadFixture(db, TRIPS);
    const doc = visualFlow();
    const { translate } = await import('../src/core/plan.js');
    const plan = await translate(doc);
    const other = { ...doc, name: `${doc.name}, edited` };
    await expect(db.callPlugin('smaltfl', 'run', [plan, { smaltdb: SMALTDB, context: { doc: other } }])).rejects.toThrow(/doesn't hash to the plan's flow hash/);
  });

  it('finds a stored document that no longer translates to the plan', async () => {
    const { db, r } = await fresh();
    const row = db.query('SELECT hash, doc FROM _smaltfl_flows').rows[0]!;
    const doc = JSON.parse(String(row[1])) as FlowDocument;
    const step = doc.steps.find((s) => s.id === 'trips_dedup')!;
    if (step.kind === 'sql') step.sql = 'SELECT DISTINCT * FROM trips_valid WHERE 1 = 1';
    db.run('UPDATE _smaltfl_flows SET doc = ? WHERE hash = ?', [JSON.stringify(doc), row[0]]);
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' });
    expect(fails(v)).toEqual(['flow:flow']);
    expect(v.checks.find((c) => c.check === 'flow')!.note).toMatch(/doesn't hash to the plan's flow hash/);
  });
});
