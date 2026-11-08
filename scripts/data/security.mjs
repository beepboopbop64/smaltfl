// Runs scripts/data/security.ts: bundles it for Node with esbuild, then runs the bundle, which writes the security
// example's daily sign-in files from the fixture's seed.
//
//   node scripts/data/security.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--scale X]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = 'node_modules/.cache/smaltfl/security.mjs';
await build({ entryPoints: ['scripts/data/security.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
