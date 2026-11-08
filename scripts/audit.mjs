// Checks a smaltfl audit bag (ADR 0006 §8) without trusting the browser that made it: bundles scripts/audit.ts for
// Node with esbuild, then runs it. Run it from your own checkout, at the commit the bag's bag-info.txt names.
//
//   node scripts/audit.mjs check smaltfl-audit-<flow>-<size>.zip
//   node scripts/audit.mjs consistent your-checkpoint.json smaltfl-audit-<flow>-<size>.zip
//
// A bag carries its own card and data list. To tie it to its signer and to the data branch, bring them yourself:
//   --signer <fingerprint>   the signer's card fingerprint, from its owner
//   --list <MANIFEST.json>   the data's list, from git show <Data-Commit>:MANIFEST.json
//   --history <history.json> the base history a flow's claim/2 were told from: each verdict is told again from it, the
//                            record's tail and each load's measures (ADR 0010 §6)
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Paths from this script's place, so it runs from any directory.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const outfile = here('../node_modules/.cache/smaltfl/audit.mjs');
await build({ entryPoints: [here('./audit.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node20', outfile, logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
