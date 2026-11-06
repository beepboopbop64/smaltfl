// Checks a smaltfl audit bag (ADR 0006 §8) without trusting the browser that made it: bundles scripts/audit.ts for
// Node with esbuild, then runs it. Run it from your own checkout, at the commit the bag's bag-info.txt names.
//
//   node scripts/audit.mjs check smaltfl-audit-<flow>-<size>.zip
//   node scripts/audit.mjs consistent your-checkpoint.json smaltfl-audit-<flow>-<size>.zip
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

const outfile = 'node_modules/.cache/smaltfl/audit.mjs';
await build({ entryPoints: ['scripts/audit.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
