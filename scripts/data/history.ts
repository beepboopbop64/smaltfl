/**
 * The scenario's history: each day's numbers, measured the way the app measures a load, so a day can be judged
 * against its normal range (src/core/normal.ts) and its news told (src/core/news.ts). For every daily file, it runs
 * the example flow's trip checks on the runtime (the trips source and `trips_valid`, as published) and profiles the
 * trips as the app's profile box does: exact counts from the engine, a median and quantiles from an even sample of
 * 2,000 rows. It also counts every row of the coded columns (a vendor, a payment type, a rate code, the surcharges),
 * alone and in pairs, and the pickup and drop-off zones, so it can say when a value or a combination of values was
 * first and last seen and which day brought one never seen before; and the trips by pickup hour, so a day that stops
 * part way through shows. It records the numbers, not the rows.
 *
 *   node scripts/data/history.mjs DAYS_DIR OUT.json
 *
 * DAYS_DIR holds `yellow_tripdata_YYYY-MM-DD.parquet`, one file a day, in the example's columns (scripts/data/build.py
 * writes them). The days are measured in parallel, one worker thread a core, each with an engine per day.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../../src/plugin/index.js';
import { runFlow, type ExpectationsStep, type FlowDocument, type FlowPlan } from '../../src/index.js';
import { emitColumnFacts, emitRead, emitSample, type EmitContext } from '../../src/core/emit.js';
import { shapeOf } from '../../src/core/optimize.js';
import { minuteOfDay, numbersOf, profileColumn, quantile, type Kind } from '../../src/core/quality.js';
import { HISTORY_FORMAT, type DayError, type HistoryFile, type ValueHistory } from '../../src/core/history.js';
import { EXAMPLE_SOURCES } from '../../examples/sources.js';
import example from '../../examples/nyc-taxis-weather.smaltfl.json';

declare const __SMALTDB_VERSION__: string;

/** The app's sample for a column's shape (src/app/main.ts, SAMPLE). */
const SAMPLE = 2000;
const STEP = 'trips_valid';
const NUMERIC = new Set(['int', 'real', 'num']);
/** Quantiles kept a day, of a measure or a time (a time's in minutes of the day): as a profile has them. */
const PS = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
/** Coded columns with a handful of values: counted a day, value by value, and in pairs (all but `extra`, whose amounts are many). */
const CODED = ['VendorID', 'passenger_count', 'RatecodeID', 'store_and_fwd_flag', 'payment_type', 'extra', 'mta_tax', 'improvement_surcharge', 'congestion_surcharge', 'Airport_fee'];
const PAIRED = CODED.filter((c) => c !== 'extra');
/** Columns of many values, followed only for the values new to them. */
const ZONES = ['PULocationID', 'DOLocationID'];
/** Days at the start of the history before anything counts as never seen: at first, everything is. */
const WARMUP = 28;

/** One day's numbers. */
export interface DayNumbers {
  day: string;
  rows: number;
  /** Rows the checks' drop rules leave out. */
  dropped: number;
  /** Each rule's failures, in the step's order. */
  failed: number[];
  /** Each column's rows with a value. */
  present: number[];
  /** Each column's median in the sample: a number's, or a time's minute of the day; null for anything else. */
  p50: (number | null)[];
  kinds: Kind[];
  /** The columns and their types, the same every day. */
  schema: [string, string][];
  /** Each column's quantiles (PS) in the sample, a measure's or a time's, else null. */
  quantiles: (number[] | null)[];
  /** Trips by pickup hour. */
  hours: number[];
  /** Rows with each value of a coded or zone column, and each pair of coded columns' values: [value as JSON, rows]. */
  singles: Record<string, [string, number][]>;
  pairs: Record<string, [string, number][]>;
}

const doc = example as unknown as FlowDocument;
const step: ExpectationsStep = (() => {
  const found = doc.steps.find((s): s is ExpectationsStep => s.id === STEP && s.kind === 'expectations');
  if (!found) throw new Error(`the example has no ${STEP} checks`);
  return found;
})();
// The checks alone, over the trips. The history counts every day's failures, so a day over the step's limit on
// dropped rows still runs to the end: the limit stops a run, it doesn't change what the checks count.
const checks: FlowDocument = {
  smaltfl: doc.smaltfl,
  id: `${doc.id}-history`,
  name: `${doc.name}: the trip checks`,
  parameters: doc.parameters,
  sources: doc.sources.filter((s) => step.inputs.includes(s.id)),
  steps: [{ ...step, maxDropped: 1 }],
};
const trips = EXAMPLE_SOURCES.find((s) => s.file === 'trips.parquet')!;

async function measure(file: string): Promise<DayNumbers> {
  const day = /(\d{4}-\d{2}-\d{2})\.parquet$/.exec(file)![1]!;
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  try {
    await db.callPlugin('@smaltdb/external', 'registerFile', ['trips.parquet', new Uint8Array(readFileSync(file))]);
    await db.execAsync(trips.ddl);
    const run = await runFlow(db, checks, { smaltdb: __SMALTDB_VERSION__, parameters: { month: day.slice(0, 7) } });
    const e = run.manifest.nodes.find((n) => n.origin === STEP)?.expectations;
    if (!e) throw new Error(`${day}: no counts from ${STEP}`);
    // The trips as the run stored them: the plan it typed, and its tables.
    const plan = JSON.parse(String(db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [run.manifest.plan]).rows[0]![0])) as FlowPlan;
    const tables = new Map<number, string>();
    for (const m of run.manifest.nodes) {
      const t = db.query('SELECT tbl FROM _smaltfl_versions WHERE key = ?', [m.key]).rows[0];
      if (t) tables.set(m.node, String(t[0]));
    }
    const { stored } = shapeOf(plan);
    const ctx: EmitContext = { table: (i) => (stored.has(i) ? tables.get(i) : undefined), columns: (i) => plan.nodes[i]!.schema!.map(([c]) => c) };
    const i = plan.nodes.findIndex((n) => n.origin === step.inputs[0]);
    const read = emitRead(plan, i, ctx);
    const schema = plan.nodes[i]!.schema!;
    const f = (await db.queryAsync(emitColumnFacts(read, schema.map(([name, type]) => ({ name, numeric: NUMERIC.has(type) }))))).rows[0]!;
    const rows = Number(f[0]);
    const sample = rows ? (await db.queryAsync(emitSample(read, schema.map(([c]) => c), Math.ceil(rows / SAMPLE)))).rows : [];
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const kinds: Kind[] = [];
    const p50: (number | null)[] = [];
    const present: number[] = [];
    const quantiles: (number[] | null)[] = [];
    schema.forEach(([name, type], k) => {
      const values = sample.map((r) => r[k]);
      const p = profileColumn(name, type, { rows, present: Number(f[1 + 5 * k]), distinct: Number(f[2 + 5 * k]), min: f[3 + 5 * k], max: f[4 + 5 * k], mean: num(f[5 + 5 * k]) }, values);
      kinds.push(p.kind);
      present.push(p.facts.present);
      const xs = p.kind === 'time' ? values.map(minuteOfDay).filter((x): x is number => x !== null) : NUMERIC.has(type) ? numbersOf('measure', values) : [];
      xs.sort((a, b) => a - b);
      p50.push(xs.length ? quantile(xs, 0.5) : null);
      quantiles.push(xs.length && (p.kind === 'measure' || p.kind === 'time') ? PS.map((q) => Number(quantile(xs, q).toPrecision(6))) : null);
    });
    if (rows !== e.rows) throw new Error(`${day}: ${rows} rows profiled, ${e.rows} checked`);
    // Every row of the coded and zone columns and the pickup time: values alone and in pairs, and trips by hour.
    const have = new Set(schema.map(([c]) => c));
    const wanted = [...CODED, ...ZONES, 'tpep_pickup_datetime'].filter((c) => have.has(c));
    const all = rows ? (await db.queryAsync(emitSample(read, wanted, 1))).rows : [];
    const at = (c: string) => wanted.indexOf(c);
    const singles: Record<string, Map<string, number>> = {};
    const pairs: Record<string, Map<string, number>> = {};
    const coded = CODED.filter((c) => have.has(c));
    const paired = PAIRED.filter((c) => have.has(c));
    for (const c of [...coded, ...ZONES.filter((z) => have.has(z))]) singles[c] = new Map();
    for (let a = 0; a < paired.length; a++) for (let b = a + 1; b < paired.length; b++) pairs[`${paired[a]}|${paired[b]}`] = new Map();
    const hours = new Array<number>(24).fill(0);
    const pick = at('tpep_pickup_datetime');
    const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);
    for (const r of all) {
      const keys = new Map<string, string>();
      for (const c of Object.keys(singles)) {
        const key = JSON.stringify(r[at(c)] ?? null);
        keys.set(c, key);
        bump(singles[c]!, key);
      }
      for (const name of Object.keys(pairs)) {
        const [a, b] = name.split('|') as [string, string];
        bump(pairs[name]!, `[${keys.get(a)},${keys.get(b)}]`);
      }
      const t = pick >= 0 ? r[pick] : null;
      if (typeof t === 'string' && t.length >= 13) hours[Number(t.slice(11, 13))]!++;
    }
    const entries = (o: Record<string, Map<string, number>>) => Object.fromEntries(Object.entries(o).map(([k, m]) => [k, [...m.entries()]]));
    return { day, rows, dropped: e.dropped, failed: e.rules.map((r) => r.failed), present, p50, kinds, schema: schema.map(([c, t]) => [c, t]), quantiles, hours, singles: entries(singles), pairs: entries(pairs) };
  } finally {
    db.close();
  }
}

async function worker(): Promise<void> {
  const files = workerData as string[];
  for (const file of files) {
    try {
      parentPort!.postMessage(await measure(file));
    } catch (e) {
      parentPort!.postMessage({ day: /(\d{4}-\d{2}-\d{2})\.parquet$/.exec(file)![1]!, error: e instanceof Error ? e.message : String(e) } satisfies DayError);
    }
  }
}

async function main(): Promise<void> {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) throw new Error('usage: node scripts/data/history.mjs DAYS_DIR OUT.json');
  const files = readdirSync(dir).filter((x) => /^yellow_tripdata_\d{4}-\d{2}-\d{2}\.parquet$/.test(x)).sort().map((x) => join(dir, x));
  if (!files.length) throw new Error(`no daily files in ${dir}`);
  const n = Math.max(1, Math.min(availableParallelism(), files.length));
  const started = Date.now();
  const results: DayNumbers[] = [];
  const failures: DayError[] = [];
  await Promise.all(Array.from({ length: n }, (_, w) => new Promise<void>((resolve, reject) => {
    // Every n-th day to each worker, so each has days from the whole span.
    const mine = files.filter((_, k) => k % n === w);
    const t = new Worker(new URL(import.meta.url), { workerData: mine });
    t.on('message', (d: DayNumbers | DayError) => {
      if ('error' in d) {
        failures.push(d);
        console.log(`${d.day}: not measured: ${d.error}`);
      } else results.push(d);
      const done = results.length + failures.length;
      if (done % 25 === 0 || done === files.length) console.log(`${done} of ${files.length} days (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    });
    t.on('error', reject);
    t.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited with ${code}`))));
  })));
  results.sort((a, b) => (a.day < b.day ? -1 : 1));
  failures.sort((a, b) => (a.day < b.day ? -1 : 1));
  // A few days that couldn't be measured are gaps a normal range steps over; more than a few is a broken history.
  if (!results.length || failures.length > files.length / 50) throw new Error(`${failures.length} of ${files.length} days not measured`);
  const columns = results[0]!.schema;
  const odd = results.find((r) => JSON.stringify(r.schema) !== JSON.stringify(columns));
  if (odd) throw new Error(`${odd.day}'s columns differ from ${results[0]!.day}'s: ${JSON.stringify(odd.schema)}`);
  // The kind a column has on most days.
  const kinds = columns.map((_, k) => {
    const count = new Map<Kind, number>();
    for (const r of results) count.set(r.kinds[k]!, (count.get(r.kinds[k]!) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  });
  const values: Record<string, ValueHistory> = {};
  for (const c of Object.keys(results[0]!.singles)) values[c] = followed(results.map((r) => r.singles[c] ?? []), !ZONES.includes(c));
  const pairs: Record<string, ValueHistory> = {};
  for (const c of Object.keys(results[0]!.pairs)) pairs[c] = followed(results.map((r) => r.pairs[c] ?? []), false);
  const history: HistoryFile = {
    format: HISTORY_FORMAT,
    built: new Date().toISOString().slice(0, 19) + 'Z',
    flow: doc.id,
    step: STEP,
    rules: step.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })),
    columns: columns.map(([c]) => c),
    types: columns.map(([, t]) => t),
    kinds,
    sample: SAMPLE,
    days: results.map((r) => r.day),
    rows: results.map((r) => r.rows),
    dropped: results.map((r) => r.dropped),
    failed: results.map((r) => r.failed),
    present: results.map((r) => r.present),
    p50: results.map((r) => r.p50.map((x) => (x === null ? null : Number(x.toPrecision(6))))),
    missing: failures,
    quantiles: results.map((r) => r.quantiles),
    hours: results.map((r) => r.hours),
    warmup: WARMUP,
    values,
    pairs,
  };
  writeFileSync(out, JSON.stringify(history) + '\n');
  console.log(`${out}: ${results.length} days, ${history.days[0]} to ${history.days.at(-1)}, in ${((Date.now() - started) / 1000).toFixed(0)} s on ${n} threads`);
}

/**
 * A column's (or a pair's) values over the days, in order: each value, the day it was first and last seen, the days it
 * was seen and its rows in all, and each day's rows with a value first seen that day, once the first weeks are past.
 * With `daily`, each day's rows with each value too.
 */
function followed(days: readonly (readonly [string, number][])[], daily: boolean): ValueHistory {
  const at = new Map<string, number>();
  const first: number[] = [];
  const last: number[] = [];
  const seen: number[] = [];
  const total: number[] = [];
  const fresh: [number, number][] = [];
  days.forEach((entries, d) => {
    let novel = 0;
    for (const [key, n] of entries) {
      let k = at.get(key);
      if (k === undefined) {
        at.set(key, (k = first.length));
        first.push(d);
        last.push(d);
        seen.push(0);
        total.push(0);
        if (d >= WARMUP) novel += n;
      }
      last[k] = d;
      seen[k]!++;
      total[k]! += n;
    }
    if (novel) fresh.push([d, novel]);
  });
  // In order of rows over the history.
  const order = [...at.keys()].map((key) => [key, at.get(key)!] as const).sort((a, b) => total[b[1]]! - total[a[1]]!);
  const out: ValueHistory = { values: order.map(([key]) => key), first: order.map(([, k]) => first[k]!), last: order.map(([, k]) => last[k]!), days: order.map(([, k]) => seen[k]!), rows: order.map(([, k]) => total[k]!), fresh };
  if (daily) {
    const place = new Map(order.map(([key], i) => [key, i]));
    out.counts = days.map((entries) => {
      const row = new Array<number>(order.length).fill(0);
      for (const [key, n] of entries) row[place.get(key)!] = n;
      return row;
    });
  }
  return out;
}

if (isMainThread) await main();
else await worker();
