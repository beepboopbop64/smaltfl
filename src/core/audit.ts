/**
 * Checking an audit bag (ADR 0006 §8), as an auditor does, without trusting the browser that made it: the bag's own
 * manifests; the record's entries against its root and every signed checkpoint; every run the record names, its
 * manifest by hash, the plan and the flow document it names by theirs, and each source file it read in the data's list;
 * each dataset's inclusion proof; and, given a checkpoint the auditor kept, that the record is a continuation of it.
 * The script (scripts/audit.mjs) and the tests use this; nothing here needs a browser or the engine.
 */
import { checkBag, readBagInfo, type BagFile } from './bag.js';
import type { FlowDocument } from './document.js';
import { sha256Hex } from './hash.js';
import { consistencyProof, entryLeaf, parseCheckpoint, rootOf, verifyCheckpoint, verifyConsistency, verifyInclusion, verifyRecord, type LogEntry, type SignedCheckpoint } from './log.js';
import { manifestHash, planHash, type IdentityCard, type RunManifest } from './manifest.js';
import { flowHash, type FlowPlan } from './plan.js';

export interface AuditLine {
  ok: boolean;
  what: string;
}

export interface AuditReport {
  ok: boolean;
  lines: AuditLine[];
  origin: string | null;
  size: number;
  root: string | null;
}

const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** Check a bag's files (paths under one top-level folder, as unzip gives them); with `kept`, against a checkpoint. */
export async function auditBag(files: readonly BagFile[], kept?: unknown): Promise<AuditReport> {
  const lines: AuditLine[] = [];
  const say = (ok: boolean, what: string) => lines.push({ ok, what });
  const bag = await checkBag(files);
  say(bag.ok, bag.ok ? `the bag's manifests hold: every file is what manifest-sha256.txt and tagmanifest-sha256.txt say` : `the bag's manifests don't hold: ${bag.problems.slice(0, 3).join('; ')}`);
  const top = files[0]?.path.split('/')[0] ?? '';
  const file = (p: string) => files.find((f) => f.path === `${top}/${p}`);
  const json = <T>(p: string): T | undefined => {
    const f = file(p);
    return f ? (JSON.parse(text(f.bytes)) as T) : undefined;
  };
  const info = new Map(readBagInfo(text(file('bag-info.txt')?.bytes ?? new Uint8Array())).map(([k, v]) => [k.toLowerCase(), v]));

  // The record.
  const entries = text(file('data/record/entries.jsonl')?.bytes ?? new Uint8Array()).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as LogEntry);
  const envelopes = text(file('data/record/checkpoints.jsonl')?.bytes ?? new Uint8Array()).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as SignedCheckpoint);
  const card = json<IdentityCard>('data/record/card.json');
  const good: { origin: string; size: number; root: string }[] = [];
  let unsigned = 0;
  for (const env of envelopes) {
    const c = await verifyCheckpoint(env, card);
    if (c.ok && c.known) good.push({ origin: c.origin, size: c.size, root: c.root });
    else unsigned++;
  }
  say(unsigned === 0 && good.length > 0, unsigned === 0 ? `${good.length} checkpoint${good.length === 1 ? '' : 's'}, each signed by the card in record/card.json (${card?.fingerprint.slice(0, 16) ?? '?'}…)` : `${unsigned} checkpoint${unsigned === 1 ? '' : 's'} with a signature that doesn't check, or by another key`);
  const r = verifyRecord(entries, good);
  say(r.ok, r.ok ? `the record's ${entries.length} entries hash to its root ${r.root.slice(0, 16)}…, consistent with every checkpoint` : `the record doesn't hold: ${r.reason}`);
  const leaves = entries.map(entryLeaf);
  const named = info.get('external-identifier')?.split(' ');
  if (named) say(named[1] === String(entries.length) && named[2] === rootOf(leaves), `bag-info names the record at ${named[1]} entries, root ${named[2]?.slice(0, 16)}…${named[2] === rootOf(leaves) ? ': the same' : ': not the record in the bag'}`);

  // The data's list.
  const list = file('data/data/MANIFEST.json');
  const listHash = list ? await sha256Hex(list.bytes as Uint8Array<ArrayBuffer>) : null;
  const listed = list ? new Map((JSON.parse(text(list.bytes)) as { files: { path: string; sha256: string; bytes: number }[] }).files.map((f) => [f.sha256, f])) : null;
  if (list) say(!info.get('data-manifest-sha256') || info.get('data-manifest-sha256') === listHash, `the data's list hashes to ${listHash!.slice(0, 16)}…, as bag-info says; check it is the data branch's with \`git show ${info.get('data-commit') ?? '<Data-Commit>'}:MANIFEST.json | sha256sum\``);

  // Every run the record names.
  const blobs = new Map(files.filter((f) => f.path.startsWith(`${top}/data/blobs/`)).map((f) => [f.path.slice(`${top}/data/blobs/`.length).replace(/\.json$/, ''), f]));
  const plans = new Map(files.filter((f) => f.path.startsWith(`${top}/data/engine/plans/`)).map((f) => [f.path.split('/').pop()!.replace(/\.json$/, ''), f]));
  const flows = new Map(files.filter((f) => f.path.startsWith(`${top}/data/engine/flows/`)).map((f) => [f.path.split('/').pop()!.replace(/\.json$/, ''), f]));
  for (const e of entries.filter((x) => x.kind === 'run' && (x.about as { outcome?: string } | null)?.outcome === 'ok')) {
    const a = e.about as { run: number; manifest: string; blob: string };
    const b = blobs.get(`manifest-${a.blob}`);
    if (!b) {
      say(false, `run ${a.run} (#${e.seq}): its manifest isn't in the bag`);
      continue;
    }
    const m = JSON.parse(text(b.bytes)) as RunManifest;
    const mh = await manifestHash(m);
    const problems: string[] = [];
    if (mh !== a.manifest) problems.push(`its manifest hashes to ${mh.slice(0, 16)}…, not the ${a.manifest.slice(0, 16)}… the record says`);
    const plan = plans.get(m.plan);
    if (plan && (await planHash(JSON.parse(text(plan.bytes)) as FlowPlan)) !== m.plan) problems.push("its plan doesn't hash to what the manifest says");
    const flow = flows.get(m.flow.hash);
    if (flow && (await flowHash(JSON.parse(text(flow.bytes)) as FlowDocument)) !== m.flow.hash) problems.push("its flow document doesn't hash to what the manifest says");
    const read = m.nodes.filter((n) => n.file);
    const offList = listed && m.data?.manifest === listHash ? read.filter((n) => listed.get(n.file!.sha256)?.bytes !== n.file!.bytes) : [];
    if (offList.length) problems.push(`it read ${offList.map((n) => n.origin).join(', ')} with bytes the data's list doesn't have`);
    const where = read.map((n) => `${n.origin} ${listed?.get(n.file!.sha256)?.path ?? n.file!.location} (${n.file!.sha256.slice(0, 12)}…)`).join(', ');
    say(problems.length === 0, problems.length ? `run ${a.run} (#${e.seq}): ${problems.join('; ')}` : `run ${a.run} (#${e.seq}): manifest ${a.manifest.slice(0, 16)}… holds${plan ? ', with its plan' : ''}${flow ? ' and flow document' : ''}; read ${where || 'no files'}`);
  }

  // Each dataset's proof.
  for (const f of files.filter((x) => x.path.startsWith(`${top}/data/proofs/`))) {
    const p = JSON.parse(text(f.bytes)) as { dataset: string; content: string; entry: LogEntry; inclusion: { seq: number; size: number; root: string; leaf: string; proof: string[] } };
    const leaf = entryLeaf(p.entry);
    const ok = leaf === p.inclusion.leaf && verifyInclusion(leaf, p.inclusion.seq, p.inclusion.size, p.inclusion.proof, p.inclusion.root) && p.inclusion.size <= leaves.length && rootOf(leaves, p.inclusion.size) === p.inclusion.root;
    say(ok, `${p.dataset}: content ${p.content.slice(0, 16)}…, in run entry #${p.inclusion.seq} ${ok ? 'proven in the record' : "whose proof doesn't hold"}`);
  }

  // A checkpoint the auditor kept.
  if (kept !== undefined) {
    const c = await verifyCheckpoint(kept);
    if (!c.ok) say(false, `your checkpoint doesn't check: ${c.reason}`);
    else if (c.origin !== r.origin) say(false, `your checkpoint is of ${c.origin}, not of this record`);
    else if (c.size > leaves.length) say(false, `your checkpoint was signed at ${c.size} entries; the bag's record has ${leaves.length}: entries were removed`);
    else {
      const ok = c.size === 0 || verifyConsistency(c.size, leaves.length, c.root, rootOf(leaves), consistencyProof(leaves, c.size, leaves.length));
      say(ok, ok ? `the record is a continuation of your checkpoint at ${c.size} entries: nothing before it was rewritten` : `the record is NOT a continuation of your checkpoint at ${c.size} entries: something before it was rewritten`);
    }
  }
  const ok = lines.every((l) => l.ok);
  return { ok, lines, origin: r.origin, size: entries.length, root: rootOf(leaves) };
}

/** A checkpoint's size and root, said. */
export const checkpointSays = (env: SignedCheckpoint) => {
  const c = parseCheckpoint(env.checkpoint);
  return `${c.origin} at ${c.size} entries, root ${c.root}`;
};
