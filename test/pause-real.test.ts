/**
 * The owner's example held through the engine, on the real files (ADR 0009 §1, §4, §5): Wed Sep 20, 2023 publishes;
 * Thu 21 and Fri 22 are held with their manifests, by the claims the flow's story gives (core/hold.ts dayClaim, from
 * the history pinned in the engine), readers keep Wed 20, and only the three outputs built from the trips wait; a
 * release publishes Thu 21 as is, and verifies at the rederive level. Apart from test/hold-real.test.ts so the two run
 * side by side. Runs when the app has been built from the data branch (npm run build:app writes dist/app/data/ with
 * history.json, loads.json and the loads); skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import type { FlowDocument } from '../src/core/document.js';
import { sha256Hex } from '../src/core/hash.js';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { dayClaim } from '../src/core/hold.js';
import { pinFile, releaseRun, runFlow, verifyRun } from '../src/index.js';
import smaltfl from '../src/plugin/index.js';
import { EXAMPLE_SOURCES, pinnedDdl } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { exampleDoc } from './helpers/example.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as unknown;
const has = existsSync(new URL('history.json', DATA)) && existsSync(new URL('loads.json', DATA)) && existsSync(new URL('loads/yellow_tripdata_2023-09-21.parquet.txt', DATA)) && (read('history.json') as HistoryFile).days.length > 400;
describe.skipIf(!has)('the owner’s example, held through the engine on the real files (ADR 0009 §1, §4, §5)', () => {
  const file = has ? (read('history.json') as HistoryFile) : null;
  const h = file ? new HistoryRanges(file) : null;
  // The example as shipped: a day parameter, and the default publish block of ADR 0009 §2.
  const doc: FlowDocument = exampleDoc();
  const bytes = (path: string) => {
    const raw = readFileSync(new URL(path, DATA));
    return new Uint8Array(path.endsWith('.parquet.txt') ? Buffer.from(raw.toString('utf8'), 'base64') : raw);
  };

  it('publishes Wed 20, holds Thu 21 and Fri 22 with their manifests, and releases Thu 21 as is', async () => {
    expect(doc.publish).toEqual({ hold: ['checks', 'wrong'], watch: { trips: 'history.json' }, period: 'day', together: true, donor: 'weekday' });
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    // The sources and the history pinned in the engine, as the page pins them, each by the hash the data's list gives.
    const list = read('loads.json') as { files: Record<string, { path: string; sha256: string; bytes: number }>; episodes: { loads: { day: string; file: string; sha256: string; rows: number }[] }[] };
    for (const src of EXAMPLE_SOURCES.filter((x) => x.file !== 'trips.parquet')) await pinFile(db, src.file, bytes(src.file), list.files[src.file.split('.')[0]!]!.sha256);
    const history = list.files.history!;
    expect(await pinFile(db, 'history.json', bytes(history.path), history.sha256)).toMatchObject({ sha256: history.sha256, bytes: history.bytes });
    const loads = new Map(list.episodes.flatMap((e) => e.loads).map((l) => [l.day, l]));
    let tables = false;
    const runDay = async (day: string) => {
      const load = loads.get(day)!;
      const trips = bytes(`${load.file}.txt`);
      expect(await sha256Hex(trips)).toBe(load.sha256);
      await pinFile(db, 'trips.parquet', trips, load.sha256);
      if (!tables) for (const src of EXAMPLE_SOURCES) await db.execAsync(pinnedDdl(src));
      tables = true;
      const claim = dayClaim(h!, doc, history, day, 'trips', 'dev')!;
      return { claim, r: await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { month: day.slice(0, 7), day }, claims: [claim] }) };
    };
    const shows = (name: string) => db.query('SELECT key, run FROM _smaltfl_datasets WHERE name = ?', [name]).rows[0];

    const wed = await runDay('2023-09-20');
    expect(wed.r.holds).toEqual([]);
    expect(wed.r.published).toEqual(['borough_hour', 'districts', 'weather_effect', 'weather_hourly', 'zone_hour', 'zone_list']);

    // Thu 21: the story says the trips fall 95% from 13:00. Built, checked and stored; nothing published.
    const thu = await runDay('2023-09-21');
    expect(thu.claim).toMatchObject({ state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00', rows: 41_939 });
    expect(thu.r.manifest.nodes.find((n) => n.origin === 'trips')).toMatchObject({ rows: 41_939, file: { sha256: loads.get('2023-09-21')!.sha256 } });
    expect(thu.r.holds.map((x) => [x.by, x.origin, x.said])).toEqual([['story', 'trips', 'Trips fall to trickle from 13:00']]);
    expect(thu.r.published).toEqual([]);
    // The zones and the weather reuse their keys: only the outputs built from the trips wait (ADR 0009 §4).
    expect(thu.r.waiting).toEqual(['borough_hour', 'weather_effect', 'zone_hour']);
    for (const name of wed.r.published) expect(shows(name)).toEqual([wed.r.manifest.outputs[name]!.key, wed.r.run]);

    // Fri 22: the checks pass their limit too, and both hold.
    const fri = await runDay('2023-09-22');
    expect(fri.r.holds.map((x) => [x.by, x.origin])).toEqual([['checks', 'trips_valid'], ['story', 'trips']]);
    expect(fri.r.holds[0]!.said).toMatch(/^dropped 2,116 of 4,633 rows \(45\.67%\), more than the 10% allowed$/);
    expect(fri.r.published).toEqual([]);

    // Thu 21 published as is: every held output, by the keys a decision names. Fri 22 is still waiting, and later.
    const keys = Object.fromEntries(Object.entries(thu.r.manifest.outputs).map(([name, o]) => [name, o.key]));
    const out = await releaseRun(db, { run: thu.r.run, manifest: thu.r.hash, keys, option: 'asis', actor: 'owner', reason: 'Real change', decision: 'd'.repeat(64) });
    expect(out).toMatchObject({ outcome: 'applied', published: Object.keys(keys).sort() });
    expect(shows('zone_hour')).toEqual([keys.zone_hour, thu.r.run]);
    expect(Number(db.query('SELECT sum(trips) FROM borough_hour').rows[0]![0])).toBeLessThan(41_939);
    // Re-derived from its own file, pinned again as the app pins a run's file before re-deriving it.
    await pinFile(db, 'trips.parquet', bytes(`${loads.get('2023-09-21')!.file}.txt`), loads.get('2023-09-21')!.sha256);
    const v = await verifyRun(db, thu.r.run, { smaltdb: SMALTDB, manifest: thu.r.hash, level: 'rederive' });
    expect(v.checks.filter((c) => !c.ok)).toEqual([]);
    expect(v.checks.filter((c) => c.check === 'held').map((c) => c.origin)).toEqual(['holds', 'borough_hour', 'districts', 'weather_effect', 'weather_hourly', 'zone_hour', 'zone_list']);
    // Fri 22, held, verifies too, its outputs still staged.
    expect((await verifyRun(db, fri.r.run, { smaltdb: SMALTDB, level: 'stored' })).checks.filter((c) => !c.ok)).toEqual([]);
  }, 120_000);
});
