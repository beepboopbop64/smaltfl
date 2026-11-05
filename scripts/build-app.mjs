// Builds the app into dist/app: page.html (the page's content; the artifact host adds the document skeleton),
// app.js (the page), worker.js (the engine worker), inline.js (the engine in the page, for browsers without the
// worker), and data/ (the example's files, from the data branch when it has been fetched, else the XS fixtures).
//
//   node scripts/build-app.mjs            the 100k sample from origin/data, or the 10k fixtures
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

const fromData = { 'trips.parquet': 'samples/yellow_tripdata_2024-01_100k.parquet', 'zones.csv': 'tlc/taxi_zone_lookup.csv', 'weather.csv': 'weather/open-meteo_2024-01.csv' };
let source = 'fixtures/xs (10,000 trips)';
const xs = process.argv.includes('--xs');
for (const [name, path] of Object.entries(fromData)) {
  let bytes;
  try {
    if (xs) throw new Error('--xs');
    bytes = execFileSync('git', ['show', `origin/data:${path}`], { maxBuffer: 1 << 28 });
    source = 'origin/data (the 100k sample)';
  } catch {
    bytes = readFileSync(`fixtures/xs/${name}`);
  }
  // The artifact host serves text but not Parquet: a Parquet file goes base64-encoded as <name>.txt (src/app/main.ts).
  if (name.endsWith('.parquet')) writeFileSync(`${out}/data/${name}.txt`, bytes.toString('base64'));
  else writeFileSync(`${out}/data/${name}`, bytes);
}
console.log(`built ${out} with data from ${source}`);
