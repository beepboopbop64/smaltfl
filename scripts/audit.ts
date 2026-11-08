// The auditor's check of a smaltfl audit bag, from their own checkout (ADR 0006 §8). See scripts/audit.mjs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { auditBag, type AuditTrust } from '../src/core/audit.js';
import type { BagFile } from '../src/core/bag.js';
import { unzip } from '../src/core/zip.js';

const [command, ...rest] = process.argv.slice(2);
// What the auditor brings from outside the bag: the signer's fingerprint from its owner, and the data's list from the
// data branch (git show <Data-Commit>:MANIFEST.json > list.json).
const trust: AuditTrust = {};
const args: string[] = [];
let listPath: string | undefined;
let historyPath: string | undefined;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--signer' && rest[i + 1]) trust.signer = rest[++i]!;
  else if (rest[i] === '--list' && rest[i + 1]) listPath = rest[++i]!;
  else if (rest[i] === '--history' && rest[i + 1]) historyPath = rest[++i]!;
  else args.push(rest[i]!);
}

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
  if (listPath) trust.list = new Uint8Array(readFileSync(listPath));
  // The base history a flow's claim/2 were told from (ADR 0010 §6): each verdict is told again from it and the record.
  if (historyPath) trust.history = new Uint8Array(readFileSync(historyPath));
  if (command === 'check' && args.length === 1) {
    return report(await auditBag(readBag(args[0]!), undefined, trust), false);
  }
  if (command === 'consistent' && args.length === 2) {
    return report(await auditBag(readBag(args[1]!), JSON.parse(readFileSync(args[0]!, 'utf8')), trust), true);
  }
  console.error('usage: node scripts/audit.mjs check [--signer <fingerprint>] [--list <MANIFEST.json>] [--history <history.json>] <bag.zip | bag folder>\n       node scripts/audit.mjs consistent [--signer <fingerprint>] [--list <MANIFEST.json>] <your-checkpoint.json> <bag.zip | bag folder>');
  return 2;
}

function report(r: Awaited<ReturnType<typeof auditBag>>, kept: boolean): number {
  for (const l of r.lines) console.log(`${l.ok ? 'ok  ' : 'FAIL'} ${l.what}`);
  console.log(r.ok ? `\nThe bag holds: the record ${r.origin} at ${r.size} entries, root ${r.root}.` : '\nThe bag does NOT hold: see FAIL above.');
  // What the bag can't say about itself.
  if (r.ok && !kept && !trust.signer) console.log("It holds together; who made it, only a checkpoint you kept (consistent) or the signer's fingerprint from its owner (--signer) can say.");
  if (r.ok && !trust.list) console.log("Its data list is the one in the bag: pass the data branch's with --list to check the files against it.");
  return r.ok ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (e) {
  // A file that isn't there, or isn't a bag, says so plainly: the auditor needs the reason, not a stack trace.
  const err = e as NodeJS.ErrnoException;
  console.error(err.code === 'ENOENT' ? `can't read ${err.path ?? 'a file'}: it isn't there` : `can't check it: ${err.message}`);
  process.exitCode = 2;
}
