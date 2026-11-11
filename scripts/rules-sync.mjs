// Writes every flow folder's check cells in step with its ontology and the shared ontologies it imports (shared.ts):
// each cell that enforces a file lists the file's rules, a new one on, a dropped one gone. Reading a flow does the same
// in memory, so a flow runs right before this is run; this makes the notebooks on disk say it.
//
//   node scripts/rules-sync.mjs [flow.json …]      default: every examples/*/flow.json
import { build } from 'esbuild';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const reader = 'node_modules/.cache/smaltfl/flow.mjs';
await build({ entryPoints: ['scripts/flow.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile: reader, logLevel: 'warning' });
const { syncFlowFiles } = await import(pathToFileURL(reader).href);
const given = process.argv.slice(2);
const flows = given.length ? given : readdirSync('examples', { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join('examples', d.name, 'flow.json'))).map((d) => join('examples', d.name, 'flow.json'));
let n = 0;
for (const f of flows) {
  const changed = await syncFlowFiles(f);
  for (const c of changed) console.log(`wrote ${c}`);
  n += changed.length;
}
console.log(n ? `${n} notebook${n === 1 ? '' : 's'} written` : 'every check cell is in step with its ontology');
