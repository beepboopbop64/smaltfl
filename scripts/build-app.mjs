// Builds the app into dist/app: page.html (the page's content; the artifact host adds the document skeleton),
// app.js (the page), worker.js (the engine worker), inline.js (the engine in the page, for browsers without the
// worker), and data/ (the example's files: from the data branch when it has been fetched, the week's daily loads,
// listed in data/loads.json; else the XS fixtures, as one load).
//
//   node scripts/build-app.mjs            the daily loads from origin/data, or the 10k fixtures
//   node scripts/build-app.mjs --xs       the 10k fixtures
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'dist/app';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/data`, { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const smaltdb = JSON.parse(readFileSync('node_modules/smaltdb/package.json', 'utf8')).version;
const common = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version), __SMALTDB_VERSION__: JSON.stringify(smaltdb) },
  // Only codecs other than Snappy need it (the example's files are Snappy), and the plugin loads it only then.
  external: ['hyparquet-compressors'],
  logLevel: 'warning',
};
await build({ ...common, entryPoints: { app: 'src/app/main.ts', worker: 'src/app/worker.ts', inline: 'src/app/inline.ts' }, outdir: out });
copyFileSync('src/app/page.html', `${out}/page.html`);

// The artifact host serves text but not Parquet: a Parquet file goes base64-encoded as <name>.txt (src/app/main.ts).
const put = (name, bytes) => (name.endsWith('.parquet') ? writeFileSync(`${out}/data/${name}.txt`, bytes.toString('base64')) : writeFileSync(`${out}/data/${name}`, bytes));
const xs = process.argv.includes('--xs');
const fromData = (path) => execFileSync('git', ['show', `origin/data:${path}`], { maxBuffer: 1 << 28 });
let manifest = null;
try {
  if (!xs) manifest = JSON.parse(fromData('MANIFEST.json').toString());
} catch {
  // No data branch here: the fixtures.
}
const days = manifest?.loads?.days ?? [];
// A few days the trips are known to differ on: holidays.
const NOTES = { '01-01': "New Year's Day", '07-04': 'Independence Day', '12-25': 'Christmas Day' };
const noteOf = (day) => {
  const d = new Date(`${day}T12:00:00Z`);
  // Martin Luther King Jr. Day: January's third Monday.
  if (d.getUTCMonth() === 0 && d.getUTCDay() === 1 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21) return 'Martin Luther King Jr. Day';
  return NOTES[day.slice(5)];
};
if (days.length) {
  put('zones.csv', fromData('tlc/taxi_zone_lookup.csv'));
  put('weather.csv', fromData(`weather/open-meteo_${manifest.month}.csv`));
  mkdirSync(`${out}/data/loads`, { recursive: true });
  const list = days.map((day) => {
    const path = `loads/yellow_tripdata_${day}.parquet`;
    const entry = manifest.files.find((f) => f.path === path);
    const bytes = fromData(path);
    put(path, bytes);
    const note = noteOf(day);
    return { day, file: path, rows: entry.rows, sha256: entry.sha256, ...(note ? { note } : {}) };
  });
  writeFileSync(`${out}/data/loads.json`, JSON.stringify({ month: manifest.month, built: manifest.built, loads: list }, null, 2) + '\n');
  console.log(`built ${out} with ${list.length} daily loads from origin/data (${list.reduce((n, l) => n + l.rows, 0).toLocaleString('en-US')} trips)`);
} else {
  for (const name of ['trips.parquet', 'zones.csv', 'weather.csv']) put(name, readFileSync(`fixtures/xs/${name}`));
  console.log(`built ${out} with data from fixtures/xs (10,000 trips)`);
}
