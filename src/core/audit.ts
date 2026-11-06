/**
 * Checking an audit bag (ADR 0006 §8), as an auditor does: the bag's own manifests; the record's entries against its
 * root and every signed checkpoint; every run the record names, its manifest by hash, the plan and the flow document
 * it names by theirs, the record's head it says it ran after, and each source file it read in the data's list; each
 * dataset's inclusion proof, and that the dataset is one its run made, with that content; and, given a checkpoint the
 * auditor kept, that the record is a continuation of it, signed by the same card.
 *
 * A bag carries its own card and its own data list, so on its own it shows only that it is consistent with itself:
 * anyone can make a bag that is. What ties it to someone is what the auditor brings: a checkpoint they kept, the
 * signer's fingerprint from its owner, and the data list from the data branch (`git show <commit>:MANIFEST.json`).
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

/** What the auditor brings, from outside the bag: the signer's fingerprint, and the data's list from the data branch. */
export interface AuditTrust {
  signer?: string;
  list?: Uint8Array;
}

/**
 * Check a bag's files (paths under one top-level folder, as unzip gives them); with `kept`, against a checkpoint the
 * auditor kept; with `trust`, against the signer and the data list the auditor got elsewhere.
 */
export async function auditBag(files: readonly BagFile[], kept?: unknown, trust: AuditTrust = {}): Promise<AuditReport> {
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
  say(unsigned === 0 && good.length > 0, unsigned === 0 ? `${good.length} checkpoint${good.length === 1 ? '' : 's'}, each signed by the card in record/card.json, fingerprint ${card?.fingerprint ?? '?'}${trust.signer || kept !== undefined ? '' : ' (the bag carries this card itself: compare the fingerprint with one you got from its owner, or check against a checkpoint you kept)'}` : `${unsigned} checkpoint${unsigned === 1 ? '' : 's'} with a signature that doesn't check, or by another key`);
  if (trust.signer !== undefined) say(card?.fingerprint === trust.signer.toLowerCase(), card?.fingerprint === trust.signer.toLowerCase() ? 'the card is the signer you named' : `the card in the bag is ${card?.fingerprint ?? 'missing'}, not the signer you named (${trust.signer})`);
  const signerInfo = info.get('signer-fingerprint');
  if (signerInfo !== undefined) say(signerInfo === card?.fingerprint, signerInfo === card?.fingerprint ? 'bag-info names the same signer' : `bag-info names the signer ${signerInfo}, not the card in the bag`);
  const r = verifyRecord(entries, good);
  say(r.ok, r.ok ? `the record's ${entries.length} entries hash to its root ${r.root.slice(0, 16)}…, consistent with every checkpoint` : `the record doesn't hold: ${r.reason}`);
  const leaves = entries.map(entryLeaf);
  const named = info.get('external-identifier')?.split(' ');
  if (named) say(named[1] === String(entries.length) && named[2] === rootOf(leaves), `bag-info names the record at ${named[1]} entries, root ${named[2]?.slice(0, 16)}…${named[2] === rootOf(leaves) ? ': the same' : ': not the record in the bag'}`);

  // The data's list.
  const list = file('data/data/MANIFEST.json');
  const listHash = list ? await sha256Hex(list.bytes as Uint8Array<ArrayBuffer>) : null;
  const listFiles = list ? (JSON.parse(text(list.bytes)) as { files: { path: string; sha256: string; bytes: number }[] }).files : null;
  const listed = listFiles ? new Map(listFiles.map((f) => [f.sha256, f])) : null;
  // A list that names a path twice gives that path two hashes: which one is the file published is anybody's guess.
  const twice = listFiles?.find((f, i) => listFiles.findIndex((g) => g.path === f.path) !== i);
  if (twice) say(false, `the data's list names ${twice.path} twice, with two hashes`);
  const yours = trust.list ? await sha256Hex(new Uint8Array(trust.list)) : null;
  const how = `git show ${info.get('data-commit') ?? '<Data-Commit>'}:MANIFEST.json`;
  if (list) say(!info.get('data-manifest-sha256') || info.get('data-manifest-sha256') === listHash, `the data's list hashes to ${listHash!.slice(0, 16)}…, as bag-info says${yours ? '' : `; check it is the data branch's with \`${how} | sha256sum\`, or pass \`${how} > list.json\` with --list list.json`}`);
  if (yours) say(yours === listHash, yours === listHash ? 'the data\'s list is the one you gave: the data branch\'s' : `the data's list in the bag is ${listHash ?? 'missing'}, not the one you gave (${yours})`);

  // Every run the record names.
  const blobs = new Map(files.filter((f) => f.path.startsWith(`${top}/data/blobs/`)).map((f) => [f.path.slice(`${top}/data/blobs/`.length).replace(/\.json$/, ''), f]));
  const plans = new Map(files.filter((f) => f.path.startsWith(`${top}/data/engine/plans/`)).map((f) => [f.path.split('/').pop()!.replace(/\.json$/, ''), f]));
  const flows = new Map(files.filter((f) => f.path.startsWith(`${top}/data/engine/flows/`)).map((f) => [f.path.split('/').pop()!.replace(/\.json$/, ''), f]));
  // The record keeps each run's plan and flow document as blobs too, so a run from an earlier visit carries them: found
  // by the hash they actually have, not by their names.
  for (const [name, f] of blobs) {
    try {
      if (name.startsWith('plan-')) plans.set(await planHash(JSON.parse(text(f.bytes)) as FlowPlan), f);
      if (name.startsWith('flow-')) flows.set(await flowHash(JSON.parse(text(f.bytes)) as FlowDocument), f);
    } catch {
      say(false, `blobs/${name}.json isn't a plan or flow document`);
    }
  }
  // The engine's own copies of its runs: each must hash to the hash in its name.
  for (const f of files.filter((x) => x.path.startsWith(`${top}/data/engine/runs/`))) {
    const want = f.path.split('/').pop()!.replace(/\.json$/, '').split('-').pop()!;
    const got = await manifestHash(JSON.parse(text(f.bytes)) as RunManifest);
    if (got !== want) say(false, `engine/runs/${f.path.split('/').pop()}: hashes to ${got.slice(0, 16)}…, not the hash in its name`);
  }
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
    if (!plan && m.smaltflRun === 1) problems.push("its plan isn't in the bag, so what it ran can't be checked");
    const flow = flows.get(m.flow.hash);
    if (flow && (await flowHash(JSON.parse(text(flow.bytes)) as FlowDocument)) !== m.flow.hash) problems.push("its flow document doesn't hash to what the manifest says");
    const read = m.nodes.filter((n) => n.file);
    // Each file it read is in the data's list in the bag, by its sha256 and size; a run that read files from another
    // list, or from none, can't be checked here, and saying it holds would say what nobody checked.
    // A build from the fixtures has no published list: its files' hashes are recorded, and nothing outside the build
    // vouches for them. Said as it is, not as a failure and not as checked.
    const unlisted = read.length > 0 && m.data === null;
    if (unlisted) void 0;
    else if (read.length && !listed) problems.push(`it read ${read.length} file${read.length === 1 ? '' : 's'}, and the bag has no data list to check ${read.length === 1 ? 'it' : 'them'} against`);
    else if (read.length && m.data?.manifest !== listHash) problems.push(`it read its files under ${m.data ? `the data list ${m.data.manifest.slice(0, 16)}…` : 'no data list'}, not the one in the bag (${listHash!.slice(0, 16)}…): they can't be checked here`);
    else {
      const offList = read.filter((n) => listed!.get(n.file!.sha256)?.bytes !== n.file!.bytes);
      if (offList.length) problems.push(`it read ${offList.map((n) => n.origin).join(', ')} with bytes the data's list doesn't have`);
    }
    // The record's head it says it ran after: a place in this record, before the run's own entry.
    if (m.log) {
      const at = m.log;
      if (at.origin !== r.origin || !Number.isSafeInteger(at.size) || at.size < 0 || at.size > e.seq || rootOf(leaves, at.size) !== at.root) problems.push(`it says it ran after the record stood at ${at.size} entries, root ${String(at.root).slice(0, 16)}…, which isn't this record before it`);
    }
    const where = read.map((n) => `${n.origin} ${listed?.get(n.file!.sha256)?.path ?? n.file!.location} (${n.file!.sha256.slice(0, 12)}…)`).join(', ');
    say(problems.length === 0, problems.length ? `run ${a.run} (#${e.seq}): ${problems.join('; ')}` : `run ${a.run} (#${e.seq}): manifest ${a.manifest.slice(0, 16)}… holds${plan ? ', with its plan' : ''}${flow ? ' and flow document' : ''}; read ${where || 'no files'}${unlisted ? ' (a build with no published data list: the files\' hashes are recorded, but nothing outside the build vouches for them)' : ''}`);
  }

  // Each dataset's proof: its run entry is in the record, and the run's manifest made that dataset with that content.
  for (const f of files.filter((x) => x.path.startsWith(`${top}/data/proofs/`))) {
    const p = JSON.parse(text(f.bytes)) as { dataset: string; key?: string; content: string; rows?: number; manifest?: string; entry: LogEntry; inclusion: { seq: number; size: number; root: string; leaf: string; proof: string[] } };
    const leaf = entryLeaf(p.entry);
    const proven = leaf === p.inclusion.leaf && verifyInclusion(leaf, p.inclusion.seq, p.inclusion.size, p.inclusion.proof, p.inclusion.root) && p.inclusion.size <= leaves.length && rootOf(leaves, p.inclusion.size) === p.inclusion.root;
    const about = (p.entry?.about ?? null) as { outcome?: string; manifest?: string; blob?: string } | null;
    const blob = about?.blob ? blobs.get(`manifest-${about.blob}`) : undefined;
    const m = blob ? (JSON.parse(text(blob.bytes)) as RunManifest) : undefined;
    const made = m?.outputs[p.dataset];
    const problems: string[] = [];
    if (!proven) problems.push("its proof doesn't hold");
    else if (p.entry.kind !== 'run' || about?.outcome !== 'ok') problems.push(`entry #${p.inclusion.seq} is not a run that made anything`);
    else if (p.manifest !== undefined && p.manifest !== about.manifest) problems.push(`it names the manifest ${String(p.manifest).slice(0, 16)}…, and its entry the manifest ${String(about.manifest).slice(0, 16)}…`);
    else if (!m || (await manifestHash(m)) !== about.manifest) problems.push("its run's manifest isn't in the bag as the record names it");
    else if (!made) problems.push(`its run made no dataset named ${p.dataset}`);
    else if (made.content !== p.content || (p.key !== undefined && made.key !== p.key) || (p.rows !== undefined && made.rows !== p.rows)) problems.push(`its run made it with content ${made.content.slice(0, 16)}…, ${made.rows} rows, not the content ${String(p.content).slice(0, 16)}…${p.rows !== undefined ? `, ${p.rows} rows` : ''} the proof says`);
    say(problems.length === 0, `${p.dataset}: content ${String(p.content).slice(0, 16)}…, in run entry #${p.inclusion.seq} ${problems.length ? `: ${problems.join('; ')}` : 'proven in the record, as its run made it'}`);
  }

  // A checkpoint the auditor kept.
  if (kept !== undefined) {
    const c = await verifyCheckpoint(kept);
    if (!c.ok) say(false, `your checkpoint doesn't check: ${c.reason}`);
    else if (c.origin !== r.origin) say(false, `your checkpoint is of ${c.origin}, not of this record`);
    else if (c.signer.fingerprint !== card?.fingerprint) say(false, `your checkpoint was signed by ${c.signer.fingerprint}, not by the card in the bag (${card?.fingerprint ?? 'none'})`);
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
