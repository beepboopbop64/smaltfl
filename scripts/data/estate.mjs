// Runs scripts/data/estate.ts: bundles it for Node with esbuild, then runs the bundle, which writes the control estate
// example's inventory and daily control files from the fixture's seed.
//
//   node scripts/data/estate.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--calm]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = 'node_modules/.cache/smaltfl/estate.mjs';
await build({ entryPoints: ['scripts/data/estate.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
