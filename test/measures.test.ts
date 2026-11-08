/**
 * One load's numbers (ADR 0010 §6): the E11 measures/0 and E12 tail/0 vectors; the record assembled from what the engine
 * counts (`measuresOf`); a pinned file measured before its run, and the same snapshot measured in the run, giving one
 * record; and a tail folded onto a history (`appendPeriods`), whose period is the load's measures again (`periodOf`,
 * `samePeriod`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { appendPeriods, emptyHistory, hourOf, measuresHash, measuresLeaf, measuresOf, periodOf, periodOfMeasures, samePeriod, scanColumns, tailBefore, tailRef, type MeasureSettings, type Measures } from '../src/core/measures.js';
import { measureLoad, pinFile, runFlow, type ExpectationsStep, type FlowDocument } from '../src/index.js';
import { measureTable } from '../src/plugin/measure.js';
import { EXAMPLE_SOURCES, pinnedDdl } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { exampleDoc } from './helpers/example.js';

/** E11's literal: a day of sign-ins, `rows` of them, `fail` failed and `locked` locked out. */
const literal = (slot: string, rows: number, fail: number, locked: number): Measures => ({
  smaltflMeasures: 0, source: 'auth', slot, every: 'day', file: 'a'.repeat(64), snapshot: 'b'.repeat(64),
  checks: { step: 'auth_valid', rules: [{ name: 'has_time', check: 'event_time IS NOT NULL', onFail: 'drop' }] },
  columns: ['event_time', 'result'], types: ['text', 'text'], kinds: ['time', 'category'],
  rows, dropped: 0, failed: [0], present: [rows, rows], p50: [720, null], quantiles: [[30, 180, 400, 720, 1000, 1250, 1420], null],
  sample: 2000, parts: Array.from({ length: 24 }, (_, h) => (h === 23 ? rows - 23 * Math.floor(rows / 24) : Math.floor(rows / 24))),
  values: { result: [['"fail"', fail], ['"locked"', locked], ['"success"', rows - fail - locked]] }, pairs: {},
});
const E11 = [literal('2024-03-10', 1000, 45, 5), literal('2024-03-11', 1200, 50, 6), literal('2024-03-12', 1500, 400, 30)];

describe('measures/0 and tail/0 (E11, E12)', () => {
  it('hashes the literal loads as the ADR pins them', async () => {
    expect(canonicalJSON(E11[0] as unknown as Parameters<typeof canonicalJSON>[0]).length).toBe(728);
    expect(await Promise.all(E11.map(measuresHash))).toEqual([
      'c695d293102a0e4de359d5b1e72fc48cc0ff2f365247c3547184a46e92e0c3ec',
      'f26be0d3df227eee473c29ec80265dc0bea0a9bd10aeb6a72be641d79253c4c6',
      'aa04377e0ee1382ead76aef5894d84611de4985973a63bfde0758c536e2d975e',
    ]);
  });

  it('makes their leaves and the tail roots of sizes 1 and 3', () => {
    expect(E11.map(measuresLeaf)).toEqual([
      'cfd9349041a64749b98ea5538279b6ba0132fe7f0246fb79cb35edea5f9776be',
      '8ae8255a0dbc9927cfb38affd93e9889e1c8ad07a32704a026f5241f2daf2290',
      '80fe7084f913fc52246eb9c22d075ec8b1eda4cb738ea79ca221208c41fdcde8',
    ]);
    expect(tailRef(E11.slice(0, 1))).toEqual({ size: 1, root: 'cfd9349041a64749b98ea5538279b6ba0132fe7f0246fb79cb35edea5f9776be' });
    expect(tailRef(E11)).toEqual({ size: 3, root: '0844dac548759a1d6b29af766a8ba1b4dc56536034118a6944318669913ee3e6' });
    expect(tailRef([])).toBeNull();
  });

  it('takes the tail before a slot, in slot order, whatever order the loads arrived in', () => {
    const arrived = [E11[2]!, E11[0]!, E11[1]!];
    expect(tailBefore(arrived, '2024-03-12').map((m) => m.slot)).toEqual(['2024-03-10', '2024-03-11']);
    expect(tailRef(tailBefore(arrived, '2024-03-13'))).toEqual(tailRef(E11));
  });
});

describe('measuresOf', () => {
  const settings: MeasureSettings = { source: 'auth', slot: '2024-03-10', every: 'day', checks: { step: 'auth_valid', rules: [{ name: 'has_time', check: 'event_time IS NOT NULL', onFail: 'drop' }] }, counting: null, counted: ['result', 'method'], followed: ['country'], paired: ['result', 'method', 'country'], time: 'event_time', zone: null, sample: 2 };
  const schema = [['event_time', 'text'], ['result', 'text'], ['method', 'text'], ['country', 'text']] as const;
  const rows = [
    ['2024-03-10 01:15:00', 'fail', 'password', 'GB'],
    ['2024-03-10 01:40:00', 'success', 'passkey', 'GB'],
    ['2024-03-10 13:05:00', 'success', 'password', 'FR'],
    [null, 'success', 'password', null],
  ];

  it('counts the counted and followed columns, the pairs and the hours, values sorted by their text', () => {
    expect(scanColumns(settings, schema.map(([c]) => c))).toEqual(['result', 'method', 'country', 'event_time']);
    const m = measuresOf(settings, {
      file: null, snapshot: 'c'.repeat(64), schema,
      facts: [4, 3, 3, '2024-03-10 01:15:00', '2024-03-10 13:05:00', null, 4, 2, 'fail', 'success', null, 4, 2, 'passkey', 'password', null, 3, 2, 'FR', 'GB', null],
      sample: [rows[0]!, rows[2]!],
      scan: rows.map((r) => [r[1], r[2], r[3], r[0]]),
      checks: [4, 1, 1],
    });
    expect(m.values).toEqual({ result: [['"fail"', 1], ['"success"', 3]], method: [['"passkey"', 1], ['"password"', 3]], country: [['"FR"', 1], ['"GB"', 2], ['null', 1]] });
    expect(m.pairs['result|method']).toEqual([['["fail","password"]', 1], ['["success","passkey"]', 1], ['["success","password"]', 2]]);
    expect(Object.keys(m.pairs)).toEqual(['result|method', 'result|country', 'method|country']);
    expect(m.parts.slice(0, 3)).toEqual([0, 2, 0]);
    expect(m.parts[13]).toBe(1);
    expect(m.parts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(m).toMatchObject({ rows: 4, dropped: 1, failed: [1], present: [3, 4, 4, 3], sample: 2, file: null });
  });

  it('refuses checks that counted other rows than the profile', () => {
    expect(() => measuresOf(settings, { file: null, snapshot: 'c'.repeat(64), schema, facts: [4, 3, 3, null, null, null, 4, 2, null, null, null, 4, 2, null, null, null, 3, 2, null, null, null], sample: [], scan: [], checks: [5, 0, 0] })).toThrow(/4 rows profiled, 5 checked/);
  });

  it('reads an hour as the text writes it, or in a zone', () => {
    expect(hourOf('2024-03-10 23:59:00', null)).toBe(23);
    expect(hourOf('short', null)).toBeNull();
    expect(hourOf('2024-03-10T23:30:00Z', 'Europe/London')).toBe(23);
    expect(hourOf('2024-07-10 23:30:00', 'Europe/London')).toBe(0);
    expect(hourOf('2024-07-10T12:00:00-04:00', 'America/New_York')).toBe(12);
  });
});

describe('appendPeriods and periodOf', () => {
  const s = { checks: E11[0]!.checks, counting: null, counted: ['result'], followed: [], paired: [], time: 'event_time', zone: null, sample: 2000 };
  const empty = () => emptyHistory({ flow: 'signins', source: 'auth', settings: s, columns: E11[0]!.columns, types: E11[0]!.types, kinds: E11[0]!.kinds, warmup: 1 });

  it('folds a tail onto an empty history, each period its load again', () => {
    const h = appendPeriods(empty(), E11);
    expect(h.format).toBe('smaltfl-history/3');
    expect(h.days).toEqual(['2024-03-10', '2024-03-11', '2024-03-12']);
    E11.forEach((m, k) => {
      expect(periodOf(h, k)).toEqual(periodOfMeasures(m, h));
      expect(samePeriod(h, k, m)).toBeNull();
    });
    // In order of rows over the history, each day's counts in the same order.
    expect(h.values.result!.values).toEqual(['"success"', '"fail"', '"locked"']);
    expect(h.values.result!.counts![2]).toEqual([1070, 400, 30]);
    expect(h.values.result!.first).toEqual([0, 0, 0]);
  });

  it('notes a value never seen before, once the warmup is past', () => {
    const blocked: Measures = { ...E11[2]!, values: { result: [['"blocked"', 7], ...E11[2]!.values.result!] } };
    const h = appendPeriods(appendPeriods(empty(), E11.slice(0, 2)), [blocked]);
    expect(h.values.result!.fresh).toEqual([[2, 7]]);
    expect(h.values.result!.counts![0]).toHaveLength(4);
    expect(samePeriod(h, 2, blocked)).toBeNull();
    expect(samePeriod(h, 2, E11[2]!)).toMatch(/counts differ|first seen/);
  });

  it('says where a period differs from a load', () => {
    const h = appendPeriods(empty(), E11);
    expect(samePeriod(h, 1, { ...E11[1]!, rows: 1201 })).toBe('its rows differ');
    expect(samePeriod(h, 1, E11[2]!)).toMatch(/period 1 is 2024-03-11/);
    expect(samePeriod(h, 1, { ...E11[1]!, parts: E11[1]!.parts.map((x, i) => (i === 3 ? x + 1 : x)) })).toBe('its parts differ');
  });

  it('refuses a tail that doesn\'t extend the history', () => {
    const h = appendPeriods(empty(), E11.slice(1));
    expect(() => appendPeriods(h, [E11[0]!])).toThrow(/isn't after the history's 2024-03-12/);
    expect(() => appendPeriods(empty(), [{ ...E11[0]!, columns: ['event_time', 'outcome'] }])).toThrow(/other columns/);
    expect(appendPeriods(h, [])).toBe(h);
  });
});

describe('a load measured in the engine (XS)', () => {
  const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/xs/${name}`, import.meta.url)));
  const doc = exampleDoc();
  const checks = doc.steps.find((x): x is ExpectationsStep => x.id === 'trips_valid')!;
  // The taxi's legacy counts (scripts/data/build.py): the coded columns, the zones followed, every coded one but extra paired.
  const CODED = ['VendorID', 'passenger_count', 'RatecodeID', 'store_and_fwd_flag', 'payment_type', 'extra', 'mta_tax', 'improvement_surcharge', 'congestion_surcharge', 'Airport_fee'];
  const settings: MeasureSettings = {
    source: 'trips', slot: '2024-01', every: 'day', checks: { step: 'trips_valid', rules: checks.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })) },
    counting: checks.rules.map((r) => r.check.replace(':month', "'2024-01'")),
    counted: CODED, followed: ['PULocationID', 'DOLocationID'], paired: CODED.filter((c) => c !== 'extra'), time: 'tpep_pickup_datetime', zone: null, sample: 2000,
  };
  /** The checks alone over the trips, as the history builder runs them. */
  const checksDoc: FlowDocument = { smaltfl: 1, id: 'xs-checks', name: 'checks', parameters: doc.parameters, sources: doc.sources.filter((x) => x.id === 'trips'), steps: [{ ...checks, inputs: ['trips'], maxDropped: 1 }] };

  it('gives one record before the run and in it, the snapshot\'s and the checks\' own', async () => {
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    try {
      const trips = EXAMPLE_SOURCES.find((x) => x.file === 'trips.parquet')!;
      const pin = await pinFile(db, trips.file, fixture(trips.file));
      await db.execAsync(pinnedDdl(trips));
      const m = await measureLoad(db, trips.table, settings);
      expect(m.file).toBe(pin.sha256);
      expect(m.rows).toBe(10000);
      expect(m.parts.reduce((a, b) => a + b, 0)).toBe(10000);
      expect(Object.keys(m.values)).toEqual([...CODED, 'PULocationID', 'DOLocationID']);
      expect(Object.keys(m.pairs)).toHaveLength(36);
      // Asked again: the cached record.
      expect(await measureLoad(db, trips.table, settings)).toEqual(m);
      // The run's snapshot is the one measured, and its checks counted what the measures say.
      const run = await runFlow(db, checksDoc, { smaltdb: SMALTDB, parameters: { month: '2024-01' } });
      const node = run.manifest.nodes.find((n) => n.origin === 'trips')!;
      expect(node.content).toBe(m.snapshot);
      const e = run.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations!;
      expect({ dropped: m.dropped, failed: m.failed }).toEqual({ dropped: e.dropped, failed: e.rules.map((r) => r.failed) });
      // Measured again from the stored snapshot, the same bytes hash the same.
      const table = String(db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [node.key]).rows[0]![0]);
      const again = await measureTable(db, table, settings, pin.sha256, node.content!);
      expect(await measuresHash(again)).toBe(await measuresHash(m));
      // Folded into a history, its period is the load again.
      const h = appendPeriods(emptyHistory({ flow: doc.id, source: 'trips', settings, columns: m.columns, types: m.types, kinds: m.kinds }), [m]);
      expect(samePeriod(h, 0, m)).toBeNull();
    } finally {
      db.close();
    }
  });

  it('refuses settings it can\'t read', async () => {
    const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
    try {
      await expect(db.callPlugin('smaltfl', 'measure', [{ table: 'trips_file', settings: { ...settings, every: '6h' } }])).rejects.toThrow(/needs its settings/);
      await expect(db.callPlugin('smaltfl', 'measure', [{ settings }])).rejects.toThrow(/names the source table/);
    } finally {
      db.close();
    }
  });
});
