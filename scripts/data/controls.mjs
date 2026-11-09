// Runs scripts/data/controls.ts: bundles it for Node with esbuild, then runs the bundle, which writes the controls
// example's daily control files from the fixture's seed.
//
//   node scripts/data/controls.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--calm]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = 'node_modules/.cache/smaltfl/controls.mjs';
await build({ entryPoints: ['scripts/data/controls.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
