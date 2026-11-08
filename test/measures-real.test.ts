/**
 * A load measured by the plugin is the history's day, on the real files (ADR 0010 §6): for the loads the app ships (the
 * month's days, the incidents' and the donor days), `measure` on the load, with the settings the flow's watch and its
 * history give (`settingsFor`), tells every number history.json keeps of that day: rows, what the checks drop, each
 * column's values present, medians and quantiles, the trips by hour, the coded columns' values, and the zones' and pairs'
 * values first seen. This is what keeps a period added from its own run equal to the same day built offline.
 *
 * Eight loads by default, spread over the month, the incidents and the donors; every load with SMALTFL_REAL=all (each
 * takes two or three seconds). Runs when the app has been built from the data branch; skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDataList } from '../src/app/datalist.js';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import type { HistoryFile } from '../src/core/history.js';
import { samePeriod, settingsFor } from '../src/core/measures.js';
import { measureLoad, pinFile, translate } from '../src/index.js';
import { EXAMPLE_DATA, EXAMPLE_SOURCES, pinnedDdl } from '../examples/sources.js';
import { exampleDoc } from './helpers/example.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as unknown;
const has = existsSync(new URL('history.json', DATA)) && existsSync(new URL('loads.json', DATA)) && (read('history.json') as HistoryFile).days.length > 400;
interface Listed { day: string; file: string; sha256: string; rows: number }

describe.skipIf(!has)('a load measured is the history\'s day (ADR 0010 §6)', () => {
  it('tells every number the history keeps of each load', async () => {
    const h = read('history.json') as HistoryFile;
    const list = readDataList(read('loads.json'), EXAMPLE_DATA) as unknown as { loads: Listed[]; episodes: { loads: Listed[] }[]; donors?: Listed[] };
    const all = [...list.loads, ...list.episodes.flatMap((e) => e.loads), ...(list.donors ?? [])];
    const picked = process.env.SMALTFL_REAL === 'all' ? all : [list.loads[0]!, list.loads[14]!, list.loads.at(-1)!, ...list.episodes.map((e) => e.loads[1] ?? e.loads[0]!), (list.donors ?? [])[0], (list.donors ?? []).at(-1)].filter((l): l is Listed => !!l);
    expect(picked.length).toBeGreaterThanOrEqual(6);
    const doc = exampleDoc();
    const trips = EXAMPLE_SOURCES.find((x) => x.file === 'trips.parquet')!;
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    try {
      let made = false;
      for (const l of picked) {
        const raw = readFileSync(new URL(`${l.file}.txt`, DATA));
        await pinFile(db, trips.file, new Uint8Array(Buffer.from(raw.toString('utf8'), 'base64')), l.sha256);
        if (!made) await db.execAsync(pinnedDdl(trips));
        made = true;
        const plan = await translate(doc, { month: l.day.slice(0, 7), day: l.day });
        const s = settingsFor(plan, plan.nodes.findIndex((n) => n.origin === 'trips'), h, doc.steps)!;
        expect(s.time).toBe('tpep_pickup_datetime');
        const m = await measureLoad(db, trips.table, s);
        const k = h.days.indexOf(l.day);
        expect(k, l.day).toBeGreaterThanOrEqual(0);
        expect({ day: l.day, rows: m.rows, file: m.file, differs: samePeriod(h, k, m) }).toEqual({ day: l.day, rows: l.rows, file: l.sha256, differs: null });
        expect(m.types).toEqual(h.types);
      }
    } finally {
      db.close();
    }
  }, 600_000);
});
