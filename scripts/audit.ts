// The auditor's check of a smaltfl audit bag, from their own checkout (ADR 0006 §8). See scripts/audit.mjs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { auditBag } from '../src/core/audit.js';
import type { BagFile } from '../src/core/bag.js';
import { unzip } from '../src/core/zip.js';

const [command, ...args] = process.argv.slice(2);

function readBag(path: string): BagFile[] {
  if (statSync(path).isDirectory()) {
    const out: BagFile[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else out.push({ path: relative(join(path, '..'), p).split('\\').join('/'), bytes: new Uint8Array(readFileSync(p)) });
      }
    };
    walk(path);
    return out;
  }
  return unzip(new Uint8Array(readFileSync(path))).map((f) => ({ path: f.path, bytes: f.bytes }));
}

async function main(): Promise<number> {
  if (command === 'check' && args.length === 1) {
    return report(await auditBag(readBag(args[0]!)));
  }
  if (command === 'consistent' && args.length === 2) {
    return report(await auditBag(readBag(args[1]!), JSON.parse(readFileSync(args[0]!, 'utf8'))));
  }
  console.error('usage: node scripts/audit.mjs check <bag.zip | bag folder>\n       node scripts/audit.mjs consistent <your-checkpoint.json> <bag.zip | bag folder>');
  return 2;
}

function report(r: Awaited<ReturnType<typeof auditBag>>): number {
  for (const l of r.lines) console.log(`${l.ok ? 'ok  ' : 'FAIL'} ${l.what}`);
  console.log(r.ok ? `\nThe bag holds: the record ${r.origin} at ${r.size} entries, root ${r.root}.` : '\nThe bag does NOT hold: see FAIL above.');
  return r.ok ? 0 : 1;
}

process.exitCode = await main();
