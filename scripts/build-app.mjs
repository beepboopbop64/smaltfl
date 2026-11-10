// Builds the app into dist/app: page.html (the page's content; the artifact host adds the document skeleton),
// app.js (the page), worker.js (the engine worker), inline.js (the engine in the page, for browsers without the
// worker), and data/ (a flow's files, listed in data/loads.json, format 2: each source's binding with its file or its
// daily loads and the days a paused one may be filled from, and each watched source's history, ADR 0010 §9).
//
//   node scripts/build-app.mjs            the example (examples/nyc-taxis-weather/, its notebooks expanded, ADR 0011):
//                                         the daily loads from origin/data, or the 10k fixtures
//   node scripts/build-app.mjs --xs       the example on the 10k fixtures
//   node scripts/build-app.mjs --flow examples/security-signins/flow.json [--out dist/app-signins]
//                                         another example: its data list's generator (with its `generateArgs`) writes its daily files, the
//                                         general builder its history. Every build ships its document as data/flow.json,
//                                         a folder's with its notebooks' sources and the steps derived from them
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outAt = process.argv.indexOf('--out');
const out = outAt >= 0 ? process.argv[outAt + 1] : 'dist/app';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/data`, { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 28 });
// The commit the code is built from, which every run records (ADR 0006 §4): marked when the tree has changes on top.
let commit = 'dev';
try {
  commit = git('rev-parse', 'HEAD').toString().trim() + (git('status', '--porcelain', '--untracked-files=no').toString().trim() ? '+changes' : '');
} catch {
  // Not a git checkout: dev.
}
const smaltdb = JSON.parse(readFileSync('node_modules/smaltdb/package.json', 'utf8')).version;
const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version), __SMALTDB_VERSION__: JSON.stringify(smaltdb), __SMALTFL_COMMIT__: JSON.stringify(commit), __SMALTFL_DATA__: 'null' },
  // Only codecs other than Snappy need it (the example's files are Snappy), and the plugin loads it only then.
  external: ['hyparquet-compressors'],
  logLevel: 'warning',
};

// The artifact host serves text but not Parquet: a Parquet file goes base64-encoded as <name>.txt (src/app/main.ts).
const put = (name, bytes) => (name.endsWith('.parquet') ? writeFileSync(`${out}/data/${name}.txt`, bytes.toString('base64')) : writeFileSync(`${out}/data/${name}`, bytes));
const xs = process.argv.includes('--xs');
const flowAt = process.argv.indexOf('--flow');
const flowPath = flowAt >= 0 ? process.argv[flowAt + 1] : null;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The flow reader (scripts/flow.ts), bundled for Node: a folder's flow.json comes back with its notebooks loaded and its
// steps derived (ADR 0011); a .smaltfl.json as it is.
const reader = 'node_modules/.cache/smaltfl/flow.mjs';
await build({ entryPoints: ['scripts/flow.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: reader, logLevel: 'warning' });
const { readFlow, bindingsPath } = await import(pathToFileURL(reader).href);
const EXAMPLE_FLOW = 'examples/nyc-taxis-weather/flow.json';
// The example's bindings (ADR 0010 §9): each source's table, format and file name, which loads.json carries on.
const bindingsOf = (doc) => JSON.parse(readFileSync(bindingsPath(doc), 'utf8'));
/** The document the build ships, as data/flow.json, and its entry in loads.json. */
const shipFlow = async (path) => {
  const doc = await readFlow(path);
  const bytes = Buffer.from(JSON.stringify(doc, null, 2) + '\n');
  writeFileSync(`${out}/data/flow.json`, bytes);
  return { path: 'flow.json', from: path, sha256: sha256(bytes), bytes: bytes.length };
};
// The data branch at one commit, read by it for every file, so the list and the files can't come from two builds.
let data = null;
let manifestBytes = null;
let manifest = null;
if (!xs && !flowPath) {
  try {
    data = git('rev-parse', 'origin/data').toString().trim();
  } catch {
    // No data branch here: the fixtures.
  }
  // A data branch whose list can't be read fails the build, rather than quietly building from the fixtures.
  if (data) {
    manifestBytes = git('show', `${data}:MANIFEST.json`);
    manifest = JSON.parse(manifestBytes.toString());
  }
}
if (manifest) {
  // A path listed twice has two hashes, and the app and an auditor could each take a different one.
  const paths = manifest.files.map((f) => f.path);
  const twice = paths.find((p, i) => paths.indexOf(p) !== i);
  if (twice) throw new Error(`the data branch's MANIFEST.json at ${data} lists ${twice} twice`);
}
// The app is built knowing the list it may trust (its commit, hash and size), so a loads.json beside it that names
// another is refused: the files, the list and loads.json can't be swapped together without rebuilding the app.
const builtData = manifestBytes ? { commit: data, manifest: sha256(manifestBytes), bytes: manifestBytes.length } : null;
await build({ ...common, define: { ...common.define, __SMALTFL_DATA__: JSON.stringify(builtData) }, entryPoints: { app: 'src/app/main.ts', worker: 'src/app/worker.ts', inline: 'src/app/inline.ts' }, outdir: out });
// The bundles named by their content (app.3f2a9c1d.js), so a new build is never served from a browser's cache of the
// last one under the same name: the page's script tag and the page's references to the worker and the in-page engine
// take the new names.
const hashed = {};
for (const name of ['worker', 'inline', 'app']) {
  let js = readFileSync(`${out}/${name}.js`, 'utf8');
  for (const [from, to] of Object.entries(hashed)) js = js.split(`./${from}.js`).join(`./${to}`);
  const to = `${name}.${sha256(Buffer.from(js)).slice(0, 8)}.js`;
  writeFileSync(`${out}/${to}`, js);
  rmSync(`${out}/${name}.js`);
  rmSync(`${out}/${name}.js.map`, { force: true });
  hashed[name] = to;
}
// The page's title is the flow's name: the artifact host and the browser tab show it.
const titleOf = (doc) => `${doc.name} · smaltfl`.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
writeFileSync(`${out}/page.html`, readFileSync('src/app/page.html', 'utf8')
  .replace('src="app.js"', `src="${hashed.app}"`)
  .replace(/<title>[^<]*<\/title>/, `<title>${titleOf(await readFlow(flowPath ?? EXAMPLE_FLOW))}</title>`));
writeFileSync(`${out}/bundles.json`, JSON.stringify(hashed, null, 2) + '\n');
const fromData = (path) => git('show', `${data}:${path}`);
/** A data file's entry in the published list, checked against the bytes read: the list is what the app trusts. */
const listed = (path, bytes) => {
  const entry = manifest.files.find((f) => f.path === path);
  if (!entry) throw new Error(`${path} is not in the data branch's MANIFEST.json`);
  if (entry.sha256 !== sha256(bytes) || entry.bytes !== bytes.length) throw new Error(`${path} at ${data} doesn't match its entry in MANIFEST.json`);
  return entry;
};
const days = manifest?.loads?.days ?? [];
if (days.length) {
  // Every file the app reads, with the sha256 and size the data branch publishes for it (ADR 0006 §2).
  const file = (name, path) => {
    const bytes = fromData(path);
    listed(path, bytes);
    put(name, bytes);
    return { path: name, from: path, sha256: sha256(bytes), bytes: bytes.length };
  };
  writeFileSync(`${out}/data/MANIFEST.json`, manifestBytes);
  const files = { zones: file('zones.csv', 'tlc/taxi_zone_lookup.csv'), weather: file('weather.csv', manifest.loads.weather ?? `weather/open-meteo_${manifest.month}.csv`) };
  mkdirSync(`${out}/data/loads`, { recursive: true });
  const entryOf = (day) => {
    const path = `loads/yellow_tripdata_${day}.parquet`;
    const bytes = fromData(path);
    const entry = listed(path, bytes);
    put(path, bytes);
    // The app names the holidays itself (src/core/calendar.ts).
    return { slot: day, file: path, rows: entry.rows, sha256: entry.sha256, bytes: entry.bytes };
  };
  const list = days.map(entryOf);
  // Real incidents in the records, a few days each, to step through as the month is.
  const episodes = (manifest.loads.episodes ?? []).map((e) => ({ name: e.name, about: e.about, loads: e.days.map(entryOf) }));
  // The days a paused day may be filled from that aren't loads already (ADR 0009 amendment 1 S13): checked against the
  // list like every file, pinned by the page only when a fill needs one. Not loads: the strip doesn't step through them.
  const donors = (manifest.loads.donors ?? []).map(entryOf);
  // Each day's numbers, for each load's normal range: a data branch built before the history has none.
  const history = manifest.history ? file('history.json', 'history.json') : null;
  const b = bindingsOf(EXAMPLE_FLOW).sources;
  const source = manifest.loads.source ?? 'trips';
  const index = {
    format: 2, month: manifest.month, built: manifest.built, data: { commit: data, manifest: sha256(manifestBytes), bytes: manifestBytes.length }, flow: await shipFlow(EXAMPLE_FLOW),
    sources: { [source]: { ...b[source], loads: list, donors }, zones: { ...b.zones, entry: files.zones }, weather: { ...b.weather, entry: files.weather } },
    histories: history ? { [source]: history } : {},
    episodes,
  };
  writeFileSync(`${out}/data/loads.json`, JSON.stringify(index, null, 2) + '\n');
  const trips = (ls) => ls.reduce((n, l) => n + l.rows, 0).toLocaleString('en-US');
  console.log(`built ${out} (${commit.slice(0, 12)}) with ${list.length} daily loads from data ${data.slice(0, 12)} (${trips(list)} trips), ${episodes.map((e) => `${e.loads.length} of ${e.name}`).join(', ') || 'no episodes'}, ${donors.length} donor days${history ? `, and the history from ${manifest.history.from} to ${manifest.history.to}` : ''}; every file checked against MANIFEST.json`);
} else if (flowPath) {
  // Another example (ADR 0010 §9): its data list's generator writes its daily files (generated, never fetched), the
  // general builder measures the history from the days before the loads, and the document ships beside them. The
  // build's own list: hashed here, never the data branch's.
  const bind = bindingsOf(flowPath);
  if (!bind.generate) throw new Error(`${flowPath}'s data list names no generator for its files`);
  const work = mkdtempSync(join(tmpdir(), 'smaltfl-data-'));
  execFileSync('node', [bind.generate, work, ...(bind.generateArgs ?? [])], { stdio: 'inherit' });
  const flowDoc = await readFlow(flowPath);
  // One history a watch (ADR 0013 §5): a control's from its own files (base.<watch>.json, else base.json), a watched
  // step's from a run of the flow on each day's files.
  const watches = Object.keys(flowDoc.publish?.watch ?? {});
  const historyName = (w) => (watches.length === 1 ? 'history.json' : `history.${w}.json`);
  // The generator's fixed sources (an inventory), which a gate's scope rule reads beside each load (ADR 0014 §4).
  const generated = existsSync(join(work, 'loads.json')) ? JSON.parse(readFileSync(join(work, 'loads.json'), 'utf8')) : null;
  const fixedArgs = Object.entries((generated && !Array.isArray(generated) && generated.fixed) || {}).flatMap(([id, path]) => ['--fixed', `${id}=${path}`]);
  for (const w of watches) {
    const base = existsSync(join(work, `base.${w}.json`)) ? join(work, `base.${w}.json`) : join(work, 'base.json');
    execFileSync('node', ['scripts/data/history.mjs', '--flow', flowPath, '--watch', w, '--files', base, ...fixedArgs, join(work, historyName(w))], { stdio: 'inherit' });
  }
  mkdirSync(`${out}/data/loads`, { recursive: true });
  const entry = (name, bytes, from) => {
    writeFileSync(`${out}/data/${name}`, bytes);
    return { path: name, from, sha256: sha256(bytes), bytes: bytes.length };
  };
  const flowEntry = await shipFlow(flowPath);
  const histories = Object.fromEntries(watches.map((w) => [w, entry(historyName(w), readFileSync(join(work, historyName(w))), `${bind.generate}, scripts/data/history.mjs`)]));
  // The generator's loads: a list of one source's files (`[{ file, slot, rows }]`), or days of several daily sources
  // with the fixed files beside them (`{ fixed: { id: path }, loads: [{ slot, files: { id: { file, rows } } }] }`).
  const made = JSON.parse(readFileSync(join(work, 'loads.json'), 'utf8'));
  const sources = {};
  let days = 0;
  if (Array.isArray(made)) {
    const [source, b] = Object.entries(bind.sources)[0];
    const list = made.map((l) => {
      const e = entry(`loads/${basename(l.file)}`, readFileSync(l.file), bind.generate);
      return { slot: l.slot, file: e.path, rows: l.rows, sha256: e.sha256, bytes: e.bytes };
    });
    sources[source] = { ...b, loads: list, donors: [] };
    days = list.length;
  } else {
    for (const [id, b] of Object.entries(bind.sources)) {
      if (made.fixed?.[id]) sources[id] = { ...b, entry: entry(b.file, readFileSync(made.fixed[id]), bind.generate) };
      else {
        const list = made.loads.flatMap((l) => {
          const f = l.files[id];
          if (!f) return [];
          const e = entry(`loads/${basename(f.file)}`, readFileSync(f.file), bind.generate);
          return [{ slot: l.slot, file: e.path, rows: f.rows, sha256: e.sha256, bytes: e.bytes }];
        });
        sources[id] = { ...b, loads: list, donors: [] };
      }
    }
    days = made.loads.length;
  }
  rmSync(work, { recursive: true, force: true });
  const first = Object.values(sources).find((s) => s.loads)?.loads[0];
  const index = { format: 2, month: first?.slot.slice(0, 7), built: new Date().toISOString().slice(0, 19) + 'Z', data: null, flow: flowEntry, sources, histories, episodes: [], ...(bind.judged ? { judged: bind.judged } : {}) };
  writeFileSync(`${out}/data/loads.json`, JSON.stringify(index, null, 2) + '\n');
  console.log(`built ${out} (${commit.slice(0, 12)}) with ${flowPath}: ${days} days of ${Object.values(sources).filter((s) => s.loads).length} daily source(s) and ${watches.length} histories, generated by ${bind.generate}`);
} else {
  // The fixtures: hashed here, as this build's own list, never as the data branch's.
  const b = bindingsOf(EXAMPLE_FLOW).sources;
  const sources = {};
  for (const [id, binding] of Object.entries(b)) {
    const bytes = readFileSync(`fixtures/xs/${binding.file}`);
    put(binding.file, bytes);
    sources[id] = { ...binding, entry: { path: binding.file, from: `fixtures/xs/${binding.file}`, sha256: sha256(bytes), bytes: bytes.length } };
  }
  writeFileSync(`${out}/data/loads.json`, JSON.stringify({ format: 2, data: null, flow: await shipFlow(EXAMPLE_FLOW), sources, histories: {}, episodes: [] }, null, 2) + '\n');
  console.log(`built ${out} (${commit.slice(0, 12)}) with data from fixtures/xs (10,000 trips)`);
}
