/**
 * A watched source's history (ADR 0010 §6): each load's numbers, measured by the plugin's `measure` on the runtime, the
 * method a run measures its own load with, so a period built offline and the same load measured by its own run are
 * equal; then folded into a smaltfl-history/3 file (core/measures.ts appendPeriods), as a run's tail is folded onto it.
 * Everything comes from the flow document and its data list: the watched source and its binding (the file format, the
 * table), the checks that read it alone (through its fill step), the columns counted value by value, followed for new
 * values and paired, the time column and zone, and the files, each with its slot.
 *
 *   node scripts/data/history.mjs --flow DOC --watch SOURCE --files LIST.json [--bind DATA.json]
 *        [--count a,b] [--follow c,d] [--pair a,b] [--time COLUMN] [--zone ZONE] [--param name={slot}|{slot:7}|value] OUT.json
 *   node scripts/data/history.mjs DAYS_DIR OUT.json      the taxi example, as before: its trips, its legacy columns
 *
 * LIST.json is `[{ "file": path, "slot": "2024-01-31" }, …]`. DATA.json is the flow's bindings (default
 * examples/<doc>.data.json). The columns: `--count` (else the watch's `count`, else the ontology's columns that list
 * values or bad codes), `--follow` (else the watch's `follow`, else its serious columns), `--pair` (else the counted
 * columns whose values number 20 or fewer, so any two multiply to 400 or fewer). `--param` sets the document's other
 * parameters for each load, from its slot (the taxi's checks read `:month`). The loads are measured in parallel, one
 * worker thread a core, each with an engine per load.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../../src/plugin/index.js';
import { measureLoad, pinFile, runFlow, translate, type FlowDocument, type WatchDef } from '../../src/index.js';
import { bindingsPath, readFlow } from '../flow.js';
import { type DayError, type HistoryFile } from '../../src/core/history.js';
import { appendPeriods, checksOf, emptyHistory, SAMPLE, watchColumns, type MeasureSettings, type Measures } from '../../src/core/measures.js';
import { marksOn } from '../../src/core/ontology.js';
import { pinnedDdl, type Binding, type DataBindings } from '../../examples/sources.js';
import type { Kind } from '../../src/core/quality.js';

/** Days at the start of the history before anything counts as never seen: at first, everything is. */
const WARMUP = 28;
/** The pinned smaltdb's version, which run keys depend on (history.mjs defines it from its package). */
declare const __SMALTDB_VERSION__: string | undefined;
const SMALTDB = typeof __SMALTDB_VERSION__ === 'string' ? __SMALTDB_VERSION__ : (JSON.parse(readFileSync('node_modules/smaltdb/package.json', 'utf8')) as { version: string }).version;
/** A history past this size is too big for a page to fetch and fold (ADR 0010, risks). */
const LIMIT = 8 * 1024 * 1024;
/** The taxi example's legacy columns (scripts/data/build.py): the coded columns counted, value by value and in pairs
 * (all but `extra`, whose amounts are many), the zones followed for new values, the trips by pickup hour. */
const TAXI = {
  count: ['VendorID', 'passenger_count', 'RatecodeID', 'store_and_fwd_flag', 'payment_type', 'extra', 'mta_tax', 'improvement_surcharge', 'congestion_surcharge', 'Airport_fee'],
  follow: ['PULocationID', 'DOLocationID'],
  pair: ['VendorID', 'passenger_count', 'RatecodeID', 'store_and_fwd_flag', 'payment_type', 'mta_tax', 'improvement_surcharge', 'congestion_surcharge', 'Airport_fee'],
  time: 'tpep_pickup_datetime',
};

/** A load: a source's file for a slot; for a watched step, each source's file for the slot (ADR 0013 §4). */
interface LoadFiles {
  slot: string;
  file?: string;
  files?: Record<string, string>;
}

interface Job {
  doc: FlowDocument;
  source: string;
  /** The watched source's binding; null for a watched step, whose loads name every source's file. */
  binding: Binding | null;
  bindings: Record<string, Binding>;
  /** Each load's settings but its slot, and the parameters' templates. */
  settings: Omit<MeasureSettings, 'slot' | 'checks' | 'counting'>;
  params: Record<string, string>;
  files: LoadFiles[];
}

/** A parameter's value for a load: `{slot}`, `{slot:N}` (its first N characters), or as written. */
const valueFor = (template: string, slot: string) => template.replace(/\{slot(?::(\d+))?\}/g, (_, n?: string) => (n ? slot.slice(0, Number(n)) : slot));

/**
 * One load measured: a source's file pinned under its binding's name, read through the binding's table, measured by
 * the plugin; a watched step's load (ADR 0013 §4) has every source's file pinned, the flow run on them without its
 * publish block (nothing to hold while its history is being built), and the dataset it built measured as a run
 * measures it: the same numbers, so the history's period and the run's own measures agree.
 */
async function measure(job: Job, load: LoadFiles): Promise<Measures> {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  try {
    const watch = job.doc.publish?.watch?.[job.source];
    const period = (typeof watch === 'object' ? (watch as WatchDef).period : undefined) ?? job.doc.publish?.period;
    const values: Record<string, string> = Object.fromEntries(Object.entries(job.params).map(([k, t]) => [k, valueFor(t, load.slot)]));
    if (period) values[period] = load.slot;
    const plan = await translate(job.doc, values);
    if (job.binding) {
      if (!load.file) throw new Error(`${load.slot}: a load of ${job.source} names its file`);
      await pinFile(db, job.binding.file, new Uint8Array(readFileSync(load.file)));
      await db.execAsync(pinnedDdl(job.binding));
      const node = plan.nodes.findIndex((n) => n.op === 'table' && n.origin === job.source);
      const c = checksOf(plan, node, job.doc.steps);
      return await measureLoad(db, job.binding.table, { ...job.settings, slot: load.slot, checks: c?.checks ?? null, counting: c?.counting ?? null });
    }
    for (const [source, b] of Object.entries(job.bindings)) {
      const path = load.files?.[source];
      if (!path) throw new Error(`${load.slot}: no file for ${source}`);
      await pinFile(db, b.file, new Uint8Array(readFileSync(path)));
      await db.execAsync(pinnedDdl(b));
    }
    const bare: FlowDocument = { ...job.doc };
    delete bare.publish;
    const r = await runFlow(db, bare, { smaltdb: SMALTDB, parameters: values });
    if (!r.published.includes(job.source)) throw new Error(`${load.slot}: the run didn't publish ${job.source}`);
    const node = plan.nodes.findIndex((n) => n.origin === job.source);
    const c = checksOf(plan, node, job.doc.steps);
    return await measureLoad(db, job.source, { ...job.settings, slot: load.slot, checks: c?.checks ?? null, counting: c?.counting ?? null });
  } finally {
    db.close();
  }
}

async function worker(): Promise<void> {
  const { job, mine } = workerData as { job: Job; mine: { file: string; slot: string }[] };
  for (const load of mine) {
    try {
      parentPort!.postMessage(await measure(job, load));
    } catch (e) {
      parentPort!.postMessage({ day: load.slot, error: e instanceof Error ? e.message : String(e) } satisfies DayError);
    }
  }
}

const list = (v: string | undefined) => (v === undefined ? undefined : v.split(',').map((x) => x.trim()).filter(Boolean));

/** What to build, from the arguments. */
async function jobOf(args: string[]): Promise<{ job: Job; out: string }> {
  const flags = new Map<string, string[]>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      flags.set(a.slice(2), [...(flags.get(a.slice(2)) ?? []), args[i + 1] ?? '']);
      i++;
    } else rest.push(a);
  }
  const one = (k: string) => flags.get(k)?.at(-1);
  if (!flags.has('flow')) {
    // The taxi example, as build.py has always called it: a directory of daily files.
    const [dir, out] = rest;
    if (!dir || !out) throw new Error('usage: node scripts/data/history.mjs --flow DOC --watch SOURCE --files LIST.json OUT.json, or DAYS_DIR OUT.json');
    const files = readdirSync(dir).filter((x) => /^yellow_tripdata_\d{4}-\d{2}-\d{2}\.parquet$/.test(x)).sort().map((x) => ({ file: join(dir, x), slot: /(\d{4}-\d{2}-\d{2})/.exec(x)![1]! }));
    return jobOf(['--flow', 'examples/nyc-taxis-weather.smaltfl.json', '--watch', 'trips', '--files', JSON.stringify(files), '--count', TAXI.count.join(','), '--follow', TAXI.follow.join(','), '--pair', TAXI.pair.join(','), '--time', TAXI.time, '--param', 'month={slot:7}', out]);
  }
  const flowPath = one('flow')!;
  const doc = await readFlow(flowPath);
  const source = one('watch') ?? Object.keys(doc.publish?.watch ?? {})[0];
  // A watched step (ADR 0013 §4): its history is built by running the flow on each day's files and measuring the
  // dataset it builds, as a run does.
  const step = !!source && doc.steps.some((s) => s.id === source && s.dataset !== undefined);
  if (!source || (!step && !doc.sources.some((s) => s.id === source))) throw new Error(`${flowPath} has no source or published step ${source ?? '(none named)'} to watch`);
  const bindPath = one('bind') ?? bindingsPath(flowPath);
  if (!existsSync(bindPath)) throw new Error(`no data list ${bindPath} for ${basename(flowPath)}: pass --bind`);
  const data = JSON.parse(readFileSync(bindPath, 'utf8')) as DataBindings;
  const binding = step ? null : data.sources[source];
  if (!step && !binding) throw new Error(`${bindPath} binds no ${source}`);
  const filesArg = one('files');
  if (!filesArg) throw new Error(step ? '--files LIST.json: the loads, each { slot, files: { source: path, … } }' : '--files LIST.json: the loads, each { file, slot }');
  const files = (filesArg.trim().startsWith('[') ? JSON.parse(filesArg) : JSON.parse(readFileSync(filesArg, 'utf8'))) as LoadFiles[];
  if (step) for (const f of files) if (!f.files || typeof f.files !== 'object') throw new Error(`${f.slot}: a watched step's load names each source's file: { slot, files: { source: path, … } }`);
  const watch = doc.publish?.watch?.[source];
  const w = typeof watch === 'object' ? watch : null;
  const defaults = watchColumns(doc, source);
  const count = list(one('count')) ?? defaults.count;
  const follow = (list(one('follow')) ?? defaults.follow).filter((c) => !count.includes(c));
  const pair = list(one('pair')) ?? defaults.pair;
  const params = Object.fromEntries((flags.get('param') ?? []).map((p) => {
    const at = p.indexOf('=');
    return [p.slice(0, at), p.slice(at + 1)];
  }));
  const out = rest[0];
  if (!out) throw new Error('name the history file to write');
  // The ontology's due marks on the source (ADR 0014 §3), counted day by day where there are any.
  const due = marksOn(doc.ontology, source).due;
  return { job: { doc, source, binding, bindings: data.sources, settings: { source, every: 'day', counted: [...new Set(count)], followed: [...new Set(follow)], paired: [...new Set(pair)], time: one('time') ?? w?.time ?? null, zone: one('zone') ?? w?.zone ?? null, sample: SAMPLE, ...(due.length ? { due } : {}) }, params, files }, out };
}

async function main(): Promise<void> {
  const { job, out } = await jobOf(process.argv.slice(2));
  const files = [...job.files].sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
  if (!files.length) throw new Error('no loads to measure');
  const n = Math.max(1, Math.min(availableParallelism(), files.length));
  const started = Date.now();
  const results: Measures[] = [];
  const failures: DayError[] = [];
  await Promise.all(Array.from({ length: n }, (_, w) => new Promise<void>((resolve, reject) => {
    // Every n-th load to each worker, so each has loads from the whole span.
    const mine = files.filter((_, k) => k % n === w);
    const t = new Worker(new URL(import.meta.url), { workerData: { job, mine } });
    t.on('message', (d: Measures | DayError) => {
      if ('error' in d) {
        failures.push(d);
        console.log(`${d.day}: not measured: ${d.error}`);
      } else results.push(d);
      const done = results.length + failures.length;
      if (done % 25 === 0 || done === files.length) console.log(`${done} of ${files.length} loads (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    });
    t.on('error', reject);
    t.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited with ${code}`))));
  })));
  results.sort((a, b) => (a.slot < b.slot ? -1 : 1));
  failures.sort((a, b) => (a.day < b.day ? -1 : 1));
  // A few loads that couldn't be measured are gaps a normal range steps over; more than a few is a broken history.
  if (!results.length || failures.length > files.length / 50) throw new Error(`${failures.length} of ${files.length} loads not measured`);
  const first = results[0]!;
  const odd = results.find((r) => JSON.stringify([r.columns, r.types]) !== JSON.stringify([first.columns, first.types]));
  if (odd) throw new Error(`${odd.slot}'s columns differ from ${first.slot}'s`);
  // The kind a column has on most loads.
  const kinds = first.columns.map((_, k) => {
    const count = new Map<Kind, number>();
    for (const r of results) count.set(r.kinds[k]!, (count.get(r.kinds[k]!) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  });
  const s = job.settings;
  const start = emptyHistory({ flow: job.doc.id, source: job.source, settings: { ...s, checks: first.checks }, columns: first.columns, types: first.types, kinds, warmup: WARMUP, built: new Date().toISOString().slice(0, 19) + 'Z' });
  const history: HistoryFile = { ...appendPeriods(start, results), kinds, missing: failures };
  // The columns asked for that the files don't have: said, not left out quietly.
  const have = new Set(first.columns);
  history.skipped = [...s.counted, ...s.followed, ...(s.time ? [s.time] : [])].filter((c) => !have.has(c)).map((c): [string, string] => [c, 'not in the files']);
  const text = JSON.stringify(history) + '\n';
  if (text.length > LIMIT) throw new Error(`${out} would be ${(text.length / 1048576).toFixed(1)} MB, past the ${LIMIT / 1048576} MB a page fetches`);
  writeFileSync(out, text);
  console.log(`${out}: ${results.length} loads of ${job.source}, ${history.days[0]} to ${history.days.at(-1)}, ${(text.length / 1048576).toFixed(2)} MB, in ${((Date.now() - started) / 1000).toFixed(0)} s on ${n} threads`);
}

if (isMainThread) await main();
else await worker();
