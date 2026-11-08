/**
 * Filling a paused day on the real history (ADR 0009 amendment 1 S2, S3, S5): the days that can be filled, the donor
 * each rule picks (the amendment's table is a test vector, so a change that moves one fails here until it is accepted
 * on purpose, Q-52), how close each rule's fill lands, and, on the real files through the engine, Thu Sep 21, 2023
 * filled from Thu 14 and released, Mon Nov 14, 2022 filled from Mon 7, and Fri Sep 22, 2023's part that arrived, whose
 * checks trip. On the example with its fill step (test/helpers/example.ts exampleFilled). Runs when the app has been
 * built from the data branch (npm run build:app); the engine part needs its loads and donor days too. Skipped
 * otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDataList } from '../src/app/datalist.js';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import { dayMid, dayShort } from '../src/core/days.js';
import { donorChoices, donorFor, fillable, fillCounts, missingOf, repairDocument, type DonorPick, type DonorQuery, type Repair } from '../src/core/fill.js';
import { sha256Hex } from '../src/core/hash.js';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { claimHolds, dayClaim, flowStory, type HistoryRef } from '../src/core/hold.js';
import { pinFile, releaseRun, runFlow, verifyRun, type FlowDocument } from '../src/index.js';
import smaltfl from '../src/plugin/index.js';
import { EXAMPLE_DATA, DONOR_SOURCE, EXAMPLE_SOURCES, pinnedDdl } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { exampleFilled } from './helpers/example.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as unknown;
const has = existsSync(new URL('history.json', DATA)) && existsSync(new URL('loads.json', DATA)) && (read('history.json') as HistoryFile).days.length > 400;
interface Load { day: string; file: string; sha256: string; bytes: number; rows: number }
const loadsJson = has ? (readDataList(read('loads.json'), EXAMPLE_DATA) as unknown as { files: Record<string, { path: string; sha256: string; bytes: number }>; loads: Load[]; episodes: { loads: Load[] }[]; donors?: Load[] }) : null;
const donorDays = loadsJson?.donors ?? [];
const files = has && donorDays.length > 0 && existsSync(new URL('loads/yellow_tripdata_2023-09-14.parquet.txt', DATA)) && existsSync(new URL('loads/yellow_tripdata_2023-09-21.parquet.txt', DATA));

/** The 17 days of 2022 and 2023 that `wrong` holds with a missing part on a short day (S2). */
const FILLABLE = [
  '2022-01-04', '2022-01-29', '2022-08-10', '2022-09-17', '2022-09-18', '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20', '2022-12-22',
  '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24',
];
/** Real changes among them, not feed incidents: their medians are left out (S Context). */
const CHANGES = ['2022-01-04', '2022-01-29', '2022-12-22'];

describe.skipIf(!has)('filling a paused day on the real history (amendment 1 S2, S3)', () => {
  const file = has ? (read('history.json') as HistoryFile) : null;
  const h = file ? new HistoryRanges(file) : null;
  const doc = exampleFilled();
  const ref: HistoryRef = { path: 'history.json', sha256: '0'.repeat(64), bytes: 0 };
  const all = loadsJson ? [...loadsJson.loads, ...loadsJson.episodes.flatMap((e) => e.loads), ...donorDays] : [];
  const listed = (d: string): HistoryRef | null => {
    const l = all.find((x) => x.day === d);
    return l ? { path: l.file, sha256: l.sha256, bytes: l.bytes } : null;
  };
  const anyDay = (d: string): HistoryRef => ({ path: d, sha256: '0'.repeat(64), bytes: 0 });
  const query = (day: string, over: Partial<DonorQuery> = {}): DonorQuery => ({ h: h!, doc, day, source: 'trips', rule: 'weekday', direction: 'before', listed, history: ref, build: 'dev', ...over });
  const missing = (day: string) => missingOf(flowStory(h!, day, doc, 'trips'), 'tpep_pickup_datetime')!;
  const off = (day: string, donor: string) => {
    const s = flowStory(h!, day, doc, 'trips');
    const total = fillCounts(h!, day, missing(day), donor)!.total;
    return { total, off: (total - s.amount!.expected) / s.amount!.expected, within: total >= s.amount!.low && total <= s.amount!.high };
  };

  it('fills the 17 days with a missing part on a short day, and no other held day', () => {
    const held = file!.days.filter((d) => d >= '2022-01-01' && d <= '2024-01-31').filter((d) => claimHolds(['checks', 'wrong'], dayClaim(h!, doc, ref, d, 'trips', 'dev')!));
    expect(held).toHaveLength(28);
    const fills = held.filter((d) => fillable(dayClaim(h!, doc, ref, d, 'trips', 'dev'), flowStory(h!, d, doc, 'trips'), 'tpep_pickup_datetime'));
    expect(fills).toEqual(FILLABLE);
    // Dec 19–21, 2022: a code gone while the trips stayed in their range. Their rows were coded another way.
    for (const d of ['2022-12-19', '2022-12-20', '2022-12-21']) expect(dayClaim(h!, doc, ref, d, 'trips', 'dev')).toMatchObject({ state: 'wrong', below: false });
    expect(missing('2023-09-21')).toEqual({ time: 'tpep_pickup_datetime', hours: [13, 23] });
    expect(missing('2023-09-22')).toEqual({ column: 'payment_type', value: 0, rest: true });
    expect(missing('2022-11-14')).toEqual({ column: 'VendorID', value: 1 });
    expect(missing('2022-01-29')).toEqual({ time: 'tpep_pickup_datetime', hours: [6, 15] });
  }, 120_000);

  it('offers the donors of the amendment’s table on the 13 episode days, from the data’s list (vector)', () => {
    const said = (day: string) => {
      const { picks } = donorChoices(query(day), 'weekday');
      return picks.map((p: DonorPick) => `${dayShort(p.day)} ${(off(day, p.day).off * 100).toFixed(1).replace(/^(?!-)/, '+')}%`).join(', ');
    };
    expect(Object.fromEntries(FILLABLE.filter((d) => listed(d)).map((d) => [dayMid(d), said(d)]))).toEqual({
      'Sat Sep 17': 'Sat 10 +16.6%, Fri 16 +20.3%, Mon 19 +9.8%',
      'Sun Sep 18': 'Sun 11 +14.8%, Fri 16 +42.5%, Mon 19 +21.2%',
      'Mon Nov 14': 'Mon 7 -1.3%, Sun 13 -2.2%, Mon 21 -1.5%',
      'Tue Nov 15': 'Tue 1 +1.8%, Sun 13 -0.6%, Mon 21 +0.1%',
      'Wed Nov 16': 'Wed 9 -1.8%, Sun 13 -5.4%, Mon 21 -4.8%',
      'Thu Nov 17': 'Thu 10 -2.4%, Sun 13 -6.9%, Mon 21 -6.3%',
      'Fri Nov 18': 'Fri 4 -0.8%, Sun 13 -5.7%, Mon 21 -5.1%',
      'Sat Nov 19': 'Sat 12 -3.1%, Sun 13 -6.1%, Mon 21 -5.5%',
      // Sun 13 is both the same weekday and the nearest good day before: one chip.
      'Sun Nov 20': 'Sun 13 +1.3%, Mon 21 +2.1%',
      'Thu Sep 21': 'Thu 14 +2.1%, Wed 20 -7.2%, Mon 25 -17.9%',
      'Fri Sep 22': 'Fri 15 +1.4%, Wed 20 -5.3%, Mon 25 -19.7%',
      'Sat Sep 23': 'Sat 16 +2.5%, Wed 20 +0.8%, Mon 25 -14.3%',
      'Sun Sep 24': 'Sun 17 +4.4%, Wed 20 +20.8%, Mon 25 +2.4%',
    });
  }, 120_000);

  it('picks the same weekday before over a holiday, and after it, as each rule says on every fillable day', () => {
    const pick = (day: string, rule: 'weekday' | 'nearest', direction: 'before' | 'after') => {
      const p = donorFor(query(day, { rule, direction, listed: anyDay }));
      return 'none' in p ? null : p.day;
    };
    // Fri Nov 18, 2022: Fri Nov 11 is Veterans Day; Thu Nov 17's Thursday after is Thanksgiving.
    expect(pick('2022-11-18', 'weekday', 'before')).toBe('2022-11-04');
    expect(pick('2022-11-17', 'weekday', 'after')).toBe('2022-12-01');
    expect(Object.fromEntries(FILLABLE.map((d) => [d, [pick(d, 'weekday', 'before'), pick(d, 'nearest', 'before'), pick(d, 'nearest', 'after')]]))).toEqual({
      '2022-01-04': ['2021-12-21', '2021-12-22', '2022-01-10'],
      '2022-01-29': ['2022-01-22', '2022-01-28', '2022-01-30'],
      '2022-08-10': ['2022-08-03', '2022-08-09', '2022-08-11'],
      '2022-09-17': ['2022-09-10', '2022-09-16', '2022-09-19'],
      '2022-09-18': ['2022-09-11', '2022-09-16', '2022-09-19'],
      '2022-11-14': ['2022-11-07', '2022-11-13', '2022-11-21'],
      '2022-11-15': ['2022-11-01', '2022-11-13', '2022-11-21'],
      '2022-11-16': ['2022-11-09', '2022-11-13', '2022-11-21'],
      '2022-11-17': ['2022-11-10', '2022-11-13', '2022-11-21'],
      '2022-11-18': ['2022-11-04', '2022-11-13', '2022-11-21'],
      '2022-11-19': ['2022-11-12', '2022-11-13', '2022-11-21'],
      '2022-11-20': ['2022-11-13', '2022-11-13', '2022-11-21'],
      '2022-12-22': ['2022-12-15', '2022-12-18', '2023-01-04'],
      '2023-09-21': ['2023-09-14', '2023-09-20', '2023-09-25'],
      '2023-09-22': ['2023-09-15', '2023-09-20', '2023-09-25'],
      '2023-09-23': ['2023-09-16', '2023-09-20', '2023-09-25'],
      '2023-09-24': ['2023-09-17', '2023-09-20', '2023-09-25'],
    });
  }, 120_000);

  it('lands closest with the same weekday before, on the 14 feed incidents (S Context)', () => {
    const median = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
    };
    const incidents = FILLABLE.filter((d) => !CHANGES.includes(d));
    expect(incidents).toHaveLength(14);
    const by = (rule: 'weekday' | 'nearest', direction: 'before' | 'after') => incidents.map((d) => {
      const p = donorFor(query(d, { rule, direction, listed: anyDay }));
      return off(d, 'none' in p ? d : p.day);
    });
    const said = (xs: ReturnType<typeof by>) => [`${(median(xs.map((x) => Math.abs(x.off))) * 100).toFixed(1)}%`, xs.filter((x) => x.within).length];
    expect(said(by('weekday', 'before'))).toEqual(['2.2%', 12]);
    expect(said(by('nearest', 'before'))).toEqual(['5.6%', 12]);
    expect(said(by('nearest', 'after'))).toEqual(['5.3%', 13]);
  }, 120_000);
});

describe.skipIf(!files)('a day filled on the real files, through the engine (amendment 1 S4, S10)', () => {
  const file = has ? (read('history.json') as HistoryFile) : null;
  const h = file ? new HistoryRanges(file) : null;
  const doc: FlowDocument = exampleFilled();
  const list = loadsJson!;
  const bytes = (path: string) => {
    const raw = readFileSync(new URL(path, DATA));
    return new Uint8Array(path.endsWith('.parquet.txt') ? Buffer.from(raw.toString('utf8'), 'base64') : raw);
  };
  const loads = new Map([...list.episodes.flatMap((e) => e.loads), ...donorDays].map((l) => [l.day, l]));

  async function engine() {
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    for (const src of EXAMPLE_SOURCES.filter((x) => x.file !== 'trips.parquet')) await pinFile(db, src.file, bytes(src.file), list.files[src.file.split('.')[0]!]!.sha256);
    const history = list.files.history!;
    await pinFile(db, 'history.json', bytes(history.path), history.sha256);
    const made = new Set<string>();
    /** Pin a day's file as the trips (or as the donor), and make its tables the first time: a table reads its file's
     * columns as it is made. */
    const pinDay = async (name: string, day: string) => {
      const load = loads.get(day)!;
      const trips = bytes(`${load.file}.txt`);
      expect(await sha256Hex(trips)).toBe(load.sha256);
      await pinFile(db, name, trips, load.sha256);
      if (!made.has(name)) for (const src of name === DONOR_SOURCE.file ? [DONOR_SOURCE] : EXAMPLE_SOURCES) await db.execAsync(pinnedDdl(src));
      made.add(name);
      return load;
    };
    const historyRef = { path: 'history.json', sha256: history.sha256, bytes: history.bytes };
    const claimOf = (day: string, source = 'trips') => ({ ...dayClaim(h!, doc, historyRef, day, 'trips', 'dev')!, source });
    const held = async (day: string) => {
      await pinDay('trips.parquet', day);
      return runFlow(db, doc, { smaltdb: SMALTDB, parameters: { month: day.slice(0, 7), day }, claims: [claimOf(day)] });
    };
    /** The derived run of a day's repair from a donor day (null: the part that arrived), as the page stages it. */
    const derive = async (r: Awaited<ReturnType<typeof held>>, day: string, donor: string | null) => {
      const m = missingOf(flowStory(h!, day, doc, 'trips'), 'tpep_pickup_datetime')!;
      const load = donor ? await pinDay('trips_donor.parquet', donor) : null;
      const repair: Repair = { kind: donor ? 'fill' : 'complete', step: 'trips_filled', source: 'trips', missing: m, donor: donor ? { rule: 'weekday', direction: 'before', day: donor, file: { path: load!.file, sha256: load!.sha256, bytes: load!.bytes }, claim: claimOf(donor, 'trips_donor') } : null };
      await pinDay('trips.parquet', day);
      const out = await runFlow(db, repairDocument(doc, repair), { smaltdb: SMALTDB, parameters: { month: day.slice(0, 7), day }, claims: [claimOf(day), ...(donor ? [claimOf(donor, 'trips_donor')] : [])], stage: true, from: { run: r.run, manifest: r.hash } });
      return { out, repair };
    };
    return { db, held, derive };
  }

  it('fills Thu Sep 21, 2023 from Thu 14: the drawing’s numbers, released, marked, and verified with its repair', async () => {
    const e = await engine();
    const thu = await e.held('2023-09-21');
    expect(thu.holds.map((x) => [x.by, x.said])).toEqual([['story', 'Trips fall to trickle from 13:00']]);
    const { out: r, repair } = await e.derive(thu, '2023-09-21', '2023-09-14');
    const counts = fillCounts(h!, '2023-09-21', repair.missing, '2023-09-14')!;
    expect(counts).toEqual({ arrived: 41_939, setAside: 3_679, taken: 83_671, total: 121_931 });
    // The derived run counts what the drawing counts: the rows at the fill step, and those from another day.
    expect(r.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations!.rows).toBe(counts.total);
    expect(r.derived).toMatchObject({ filled: counts.taken, holds: [{ by: 'derived', said: 'fills 13:00–23:59 from 2023-09-14' }] });
    expect(r.holds.map((x) => x.by)).toEqual(['story']);
    const keys = Object.fromEntries(Object.entries(r.manifest.outputs).map(([n, o]) => [n, o.key]));
    const rel = await releaseRun(e.db, { run: r.run, manifest: r.hash, keys, option: 'fill', actor: 'owner', reason: null, decision: 'd'.repeat(64), from: { run: thu.run, manifest: thu.hash }, repair });
    expect(rel).toMatchObject({ outcome: 'applied', why: null, filled: 83_671 });
    const [filledRows, from] = e.db.query('SELECT sum(filled), max(filled_from) FROM borough_hour').rows[0]!;
    expect(from).toBe('2023-09-14');
    expect(Number(filledRows)).toBeGreaterThan(70_000);
    expect(Number(filledRows)).toBeLessThanOrEqual(83_671);
    expect(e.db.query("SELECT count(*) FROM zone_hour WHERE filled > 0 AND CAST(substr(pu_hour, 12, 2) AS INTEGER) < 13").rows[0]![0]).toBe(0);
    const v = await verifyRun(e.db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'stored' });
    expect(v.checks.filter((c) => !c.ok)).toEqual([]);
    expect(v.checks.find((c) => c.check === 'repair')).toMatchObject({ ok: true });
  }, 300_000);

  it('fills Mon Nov 14, 2022 from Mon 7, and stages Fri Sep 22, 2023’s part that arrived, whose checks trip', async () => {
    const e = await engine();
    const mon = await e.held('2022-11-14');
    const { out: nov } = await e.derive(mon, '2022-11-14', '2022-11-07');
    expect(nov.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations!.rows).toBe(114_863);
    expect(nov.derived!.filled).toBe(32_587);
    const fri = await e.held('2023-09-22');
    expect(fri.holds.map((x) => x.by)).toEqual(['checks', 'story']);
    const { out: part, repair } = await e.derive(fri, '2023-09-22', null);
    // Flex Fare only: the part that arrived, almost all of it payment type 0 with the checks' fields blank (Q-67).
    expect(part.derived).toEqual({ holds: [expect.objectContaining({ by: 'derived', said: 'keeps only payment_type 0' })], filled: null });
    expect(part.holds.map((x) => x.by)).toEqual(['checks', 'story']);
    const keys = Object.fromEntries(Object.entries(part.manifest.outputs).map(([n, o]) => [n, o.key]));
    const rel = await releaseRun(e.db, { run: part.run, manifest: part.hash, keys, option: 'complete', actor: 'owner', reason: null, decision: 'd'.repeat(64), from: { run: fri.run, manifest: fri.hash }, repair });
    expect(rel.outcome).toBe('refused');
    expect(rel.why).toMatch(/^the filled day fails its checks: dropped [\d,]+ of [\d,]+ rows \([\d.]+%\), more than the 10% allowed$/);
  }, 300_000);
});
