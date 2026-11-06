// Builds the app into dist/app: page.html (the page's content; the artifact host adds the document skeleton),
// app.js (the page), worker.js (the engine worker), inline.js (the engine in the page, for browsers without the
// worker), and data/ (the example's files: from the data branch when it has been fetched, the month's daily loads and
// the days of a few real incidents, listed in data/loads.json, and the history each day's normal range and news come
// from, data/history.json; else the XS fixtures, as one load).
//
//   node scripts/build-app.mjs            the daily loads from origin/data, or the 10k fixtures
//   node scripts/build-app.mjs --xs       the 10k fixtures
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist/app';
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
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version), __SMALTDB_VERSION__: JSON.stringify(smaltdb), __SMALTFL_COMMIT__: JSON.stringify(commit) },
  // Only codecs other than Snappy need it (the example's files are Snappy), and the plugin loads it only then.
  external: ['hyparquet-compressors'],
  logLevel: 'warning',
};
await build({ ...common, entryPoints: { app: 'src/app/main.ts', worker: 'src/app/worker.ts', inline: 'src/app/inline.ts' }, outdir: out });
copyFileSync('src/app/page.html', `${out}/page.html`);

// The artifact host serves text but not Parquet: a Parquet file goes base64-encoded as <name>.txt (src/app/main.ts).
const put = (name, bytes) => (name.endsWith('.parquet') ? writeFileSync(`${out}/data/${name}.txt`, bytes.toString('base64')) : writeFileSync(`${out}/data/${name}`, bytes));
const xs = process.argv.includes('--xs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
// The data branch at one commit, read by it for every file, so the list and the files can't come from two builds.
let data = null;
let manifestBytes = null;
let manifest = null;
try {
  if (!xs) {
    data = git('rev-parse', 'origin/data').toString().trim();
    manifestBytes = git('show', `${data}:MANIFEST.json`);
    manifest = JSON.parse(manifestBytes.toString());
  }
} catch {
  // No data branch here: the fixtures.
}
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
    return { day, file: path, rows: entry.rows, sha256: entry.sha256, bytes: entry.bytes };
  };
  const list = days.map(entryOf);
  // Real incidents in the records, a few days each, to step through as the month is.
  const episodes = (manifest.loads.episodes ?? []).map((e) => ({ name: e.name, about: e.about, loads: e.days.map(entryOf) }));
  // Each day's numbers, for each load's normal range: a data branch built before the history has none.
  if (manifest.history) files.history = file('history.json', 'history.json');
  const index = { month: manifest.month, built: manifest.built, data: { commit: data, manifest: sha256(manifestBytes), bytes: manifestBytes.length }, files, loads: list, episodes, ...(files.history ? { history: 'history.json' } : {}) };
  writeFileSync(`${out}/data/loads.json`, JSON.stringify(index, null, 2) + '\n');
  const trips = (ls) => ls.reduce((n, l) => n + l.rows, 0).toLocaleString('en-US');
  console.log(`built ${out} (${commit.slice(0, 12)}) with ${list.length} daily loads from data ${data.slice(0, 12)} (${trips(list)} trips), ${episodes.map((e) => `${e.loads.length} of ${e.name}`).join(', ') || 'no episodes'}${files.history ? `, and the history from ${manifest.history.from} to ${manifest.history.to}` : ''}; every file checked against MANIFEST.json`);
} else {
  // The fixtures: hashed here, as this build's own list, never as the data branch's.
  const files = {};
  for (const name of ['trips.parquet', 'zones.csv', 'weather.csv']) {
    const bytes = readFileSync(`fixtures/xs/${name}`);
    put(name, bytes);
    files[name.split('.')[0]] = { path: name, from: `fixtures/xs/${name}`, sha256: sha256(bytes), bytes: bytes.length };
  }
  writeFileSync(`${out}/data/loads.json`, JSON.stringify({ data: null, files, loads: [] }, null, 2) + '\n');
  console.log(`built ${out} (${commit.slice(0, 12)}) with data from fixtures/xs (10,000 trips)`);
}
