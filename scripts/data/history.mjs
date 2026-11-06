// Runs scripts/data/history.ts: bundles it for Node with esbuild (the smaltdb packages stay in node_modules), then
// runs the bundle, which measures each day in a worker thread of its own.
//
//   node scripts/data/history.mjs DAYS_DIR OUT.json
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const smaltdb = JSON.parse(readFileSync('node_modules/smaltdb/package.json', 'utf8')).version;
const outfile = 'node_modules/.cache/smaltfl/history.mjs';
await build({
  entryPoints: ['scripts/data/history.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  define: { __PLUGIN_VERSION__: JSON.stringify(pkg.version), __SMALTDB_VERSION__: JSON.stringify(smaltdb) },
  external: ['smaltdb', 'smaltdb/*', '@smaltdb/*', 'hyparquet', 'hyparquet-compressors'],
  logLevel: 'warning',
});
await import(pathToFileURL(outfile).href);
