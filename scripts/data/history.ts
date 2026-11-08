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
import { measureLoad, pinFile, translate, type FlowDocument, type WatchDef } from '../../src/index.js';
import { type DayError, type HistoryFile } from '../../src/core/history.js';
import { appendPeriods, checksOf, emptyHistory, SAMPLE, type MeasureSettings, type Measures } from '../../src/core/measures.js';
import { pinnedDdl, type Binding, type DataBindings } from '../../examples/sources.js';
import type { Kind } from '../../src/core/quality.js';

/** Days at the start of the history before anything counts as never seen: at first, everything is. */
const WARMUP = 28;
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

interface Job {
  doc: FlowDocument;
  source: string;
  binding: Binding;
  /** Each load's settings but its slot, and the parameters' templates. */
  settings: Omit<MeasureSettings, 'slot' | 'checks' | 'counting'>;
  params: Record<string, string>;
  files: { file: string; slot: string }[];
}

/** A parameter's value for a load: `{slot}`, `{slot:N}` (its first N characters), or as written. */
const valueFor = (template: string, slot: string) => template.replace(/\{slot(?::(\d+))?\}/g, (_, n?: string) => (n ? slot.slice(0, Number(n)) : slot));

/** One load measured: pinned under its binding's name, read through the binding's table, measured by the plugin. */
async function measure(job: Job, load: { file: string; slot: string }): Promise<Measures> {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  try {
    await pinFile(db, job.binding.file, new Uint8Array(readFileSync(load.file)));
    await db.execAsync(pinnedDdl(job.binding));
    const watch = job.doc.publish?.watch?.[job.source];
    const period = (typeof watch === 'object' ? (watch as WatchDef).period : undefined) ?? job.doc.publish?.period;
    const values: Record<string, string> = Object.fromEntries(Object.entries(job.params).map(([k, t]) => [k, valueFor(t, load.slot)]));
    if (period) values[period] = load.slot;
    const plan = await translate(job.doc, values);
    const node = plan.nodes.findIndex((n) => n.op === 'table' && n.origin === job.source);
    const c = checksOf(plan, node, job.doc.steps);
    return await measureLoad(db, job.binding.table, { ...job.settings, slot: load.slot, checks: c?.checks ?? null, counting: c?.counting ?? null });
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
function jobOf(args: string[]): { job: Job; out: string } {
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
  const doc = JSON.parse(readFileSync(flowPath, 'utf8')) as FlowDocument;
  const source = one('watch') ?? Object.keys(doc.publish?.watch ?? {})[0];
  if (!source || !doc.sources.some((s) => s.id === source)) throw new Error(`${flowPath} has no source ${source ?? '(none named)'} to watch`);
  const bindPath = one('bind') ?? flowPath.replace(/\.smaltfl\.json$/, '.data.json');
  if (!existsSync(bindPath)) throw new Error(`no data list ${bindPath} for ${basename(flowPath)}: pass --bind`);
  const data = JSON.parse(readFileSync(bindPath, 'utf8')) as DataBindings;
  const binding = data.sources[source];
  if (!binding) throw new Error(`${bindPath} binds no ${source}`);
  const filesArg = one('files');
  if (!filesArg) throw new Error('--files LIST.json: the loads, each { file, slot }');
  const files = (filesArg.trim().startsWith('[') ? JSON.parse(filesArg) : JSON.parse(readFileSync(filesArg, 'utf8'))) as { file: string; slot: string }[];
  const watch = doc.publish?.watch?.[source];
  const w = typeof watch === 'object' ? watch : null;
  const props = doc.ontology?.properties ?? [];
  const count = list(one('count')) ?? w?.count ?? props.filter((p) => (p.values !== undefined && Object.keys(p.values).length > 0) || (p.bad?.length ?? 0) > 0).map((p) => p.column);
  const follow = (list(one('follow')) ?? w?.follow ?? props.filter((p) => p.newValues === 'alert').map((p) => p.column)).filter((c) => !count.includes(c));
  const pair = list(one('pair')) ?? count.filter((c) => {
    const p = props.find((x) => x.column === c);
    return p?.values !== undefined && Object.keys(p.values).length <= 20;
  });
  const params = Object.fromEntries((flags.get('param') ?? []).map((p) => {
    const at = p.indexOf('=');
    return [p.slice(0, at), p.slice(at + 1)];
  }));
  const out = rest[0];
  if (!out) throw new Error('name the history file to write');
  return { job: { doc, source, binding, settings: { source, every: 'day', counted: [...new Set(count)], followed: [...new Set(follow)], paired: [...new Set(pair)], time: one('time') ?? w?.time ?? null, zone: one('zone') ?? w?.zone ?? null, sample: SAMPLE }, params, files }, out };
}

async function main(): Promise<void> {
  const { job, out } = jobOf(process.argv.slice(2));
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
