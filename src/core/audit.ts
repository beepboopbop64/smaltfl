/**
 * Checking an audit bag (ADR 0006 §8), as an auditor does: the bag's own manifests; the record's entries against its
 * root and every signed checkpoint; every run the record names, its manifest by hash, the plan and the flow document
 * it names by theirs, the record's head it says it ran after, and each source file it read in the data's list; each
 * dataset's inclusion proof, and that the dataset is one its run made, with that content; and, given a checkpoint the
 * auditor kept, that the record is a continuation of it, signed by the same card.
 *
 * A day held by its flow (ADR 0009) is checked as an `ok` run is, and its holds against its manifest and its claims;
 * each decision against the run it decides and the policies of its flow document (who may decide, a reason for
 * publish as is, a standing decision that stands for its day); each release against the decision it cites (an earlier
 * decide entry, by its leaf) and the run it releases; a proof may cite a release; and the engine's names
 * (engine/datasets.json, engine/releases.json) never show a held run's output without a release citing a decision in
 * the record.
 *
 * A bag carries its own card and its own data list, so on its own it shows only that it is consistent with itself:
 * anyone can make a bag that is. What ties it to someone is what the auditor brings: a checkpoint they kept, the
 * signer's fingerprint from its owner, and the data list from the data branch (`git show <commit>:MANIFEST.json`).
 * The script (scripts/audit.mjs) and the tests use this; nothing here needs a browser or the engine.
 */
import { checkBag, readBagInfo, type BagFile } from './bag.js';
import type { FlowDocument } from './document.js';
import { sha256Hex } from './hash.js';
import { claimHolds, heldOutputs, holdsOf, inputsKey, judgeClaims, sameKeys, standingFor, type DecideAbout, type HeldAbout, type Hold, type ReleaseAbout, type StoryClaim } from './hold.js';
import { consistencyProof, entryLeaf, parseCheckpoint, rootOf, verifyCheckpoint, verifyConsistency, verifyInclusion, verifyRecord, type LogEntry, type SignedCheckpoint } from './log.js';
import { manifestHash, planHash, policiesHash, type IdentityCard, type RunManifest } from './manifest.js';
import { flowHash, type FlowPlan } from './plan.js';
import { checkDecision, DECIDE_OPTIONS } from './policy.js';

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

/**
 * What the engine names, as a bag carries it in engine/datasets.json: each dataset name, the version it shows (its
 * key), the run that made it current (by its number in the engine and its manifest's hash), and the release that
 * pointed it, if one did.
 */
export interface EngineName {
  name: string;
  key: string;
  run: number;
  manifest: string;
  release: number | null;
}

/** A release as the engine keeps it (engine/releases.json): what was asked, and what came of it. */
export interface EngineRelease {
  id: number;
  run: number | null;
  manifest: string | null;
  names: Record<string, string>;
  option: string | null;
  actor: string | null;
  reason: string | null;
  decision: string | null;
  outcome: 'applied' | 'refused';
  why: string | null;
  at: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isKeys = (v: unknown): v is Record<string, string> => isRecord(v) && Object.values(v).every((x) => typeof x === 'string');
const isInputs = (v: unknown): v is HeldAbout['inputs'] => isRecord(v) && typeof v.flow === 'string' && isRecord(v.parameters) && isKeys(v.files);
const shortHash = (h: unknown) => `${String(h).slice(0, 16)}…`;

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
  // The runs that made something, published or held, by their manifest's hash: what decisions, releases and proofs cite.
  const runs = new Map<string, { entry: LogEntry; manifest: RunManifest | null; plan: FlowPlan | null; ok: boolean }>();
  for (const e of entries.filter((x) => x.kind === 'run' && ['ok', 'held'].includes(String((x.about as { outcome?: string } | null)?.outcome)))) {
    const a = e.about as { run: number; manifest: string; blob: string; outcome: 'ok' | 'held' };
    const b = blobs.get(`manifest-${a.blob}`);
    if (!b) {
      say(false, `run ${a.run} (#${e.seq}): its manifest isn't in the bag`);
      runs.set(a.manifest, { entry: e, manifest: null, plan: null, ok: false });
      continue;
    }
    const m = JSON.parse(text(b.bytes)) as RunManifest;
    const mh = await manifestHash(m);
    const problems: string[] = [];
    if (mh !== a.manifest) problems.push(`its manifest hashes to ${mh.slice(0, 16)}…, not the ${a.manifest.slice(0, 16)}… the record says`);
    const plan = plans.get(m.plan);
    const typed = plan ? (JSON.parse(text(plan.bytes)) as FlowPlan) : null;
    if (typed && (await planHash(typed)) !== m.plan) problems.push("its plan doesn't hash to what the manifest says");
    if (!plan && (m.smaltflRun === 1 || a.outcome === 'held')) problems.push("its plan isn't in the bag, so what it ran can't be checked");
    // A held run: its holds are what its manifest's counts and its claims hold, and the keys it names are its own.
    const said = a.outcome === 'held' && typed ? heldProblems(e.about, typed, m, problems) : '';
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
    say(problems.length === 0, problems.length ? `run ${a.run} (#${e.seq}): ${problems.join('; ')}` : `run ${a.run} (#${e.seq}): manifest ${a.manifest.slice(0, 16)}… holds${plan ? ', with its plan' : ''}${flow ? ' and flow document' : ''}; read ${where || 'no files'}${unlisted ? ' (a build with no published data list: the files\' hashes are recorded, but nothing outside the build vouches for them)' : ''}${said}`);
    runs.set(a.manifest, { entry: e, manifest: mh === a.manifest ? m : null, plan: typed, ok: problems.length === 0 });
  }

  // Each decision: the held run it decides is in the record before it, with the same inputs and keys; its actor may
  // take its option under the policies of the run's flow document; publish as is has a reason; a decision applied
  // under a standing one stands for its day; an amendment amends an earlier decision of the same day.
  const allowed = new Map<number, boolean>();
  for (const e of entries.filter((x) => x.kind === 'decide')) {
    const a = e.about as unknown as DecideAbout;
    const where = `decision #${e.seq}`;
    const problems: string[] = [];
    if (!isRecord(a) || !isInputs(a.inputs) || !isKeys(a.outputs) || !(DECIDE_OPTIONS as readonly unknown[]).includes(a.option) || (a.scope !== 'day' && a.scope !== 'untilPass') || (a.under !== undefined && !Number.isInteger(a.under))) {
      say(false, `${where}: isn't shaped as a decision (day, run, manifest, inputs, outputs, option, scope, policies, rule)`);
      allowed.set(e.seq, false);
      continue;
    }
    const held = runs.get(a.manifest);
    const heldAbout = held?.entry.about as unknown as HeldAbout | undefined;
    if (!held || heldAbout?.outcome !== 'held' || held.entry.seq > e.seq) problems.push(`it decides run ${a.run} (${shortHash(a.manifest)}), which the record doesn't hold before it`);
    else {
      if (!isInputs(heldAbout.inputs) || inputsKey(heldAbout.inputs) !== inputsKey(a.inputs)) problems.push("its inputs aren't the held run's");
      if (!isKeys(heldAbout.keys) || !sameKeys(heldAbout.keys, a.outputs)) problems.push("the outputs it names aren't the held run's, with its keys");
    }
    const doc = flowOf(flows, a.inputs.flow);
    let rule: string | null | undefined;
    if (!doc) problems.push("its flow document isn't in the bag, so who may decide can't be checked");
    else {
      if ((await policiesHash(doc.policies)) !== a.policies) problems.push("the policies it names aren't its flow document's");
      const may = checkDecision(doc.policies, e.by.as, a.option);
      if (!may.allowed) problems.push(`${e.by.as} may not decide it: ${may.reason}`);
      else if ((may.rule ?? null) !== (a.rule ?? null)) problems.push(`it names the rule ${String(a.rule)}, and the rule that allows it is ${may.rule ?? 'none (no rule is needed)'}`);
      rule = may.rule ?? null;
    }
    if (a.option === 'asis' && (typeof e.reason !== 'string' || e.reason.trim() === '')) problems.push('it publishes as is with no reason');
    const period = held?.plan?.publish?.period ?? null;
    if (a.under !== undefined) {
      const stands = typeof a.day === 'string' ? standingFor(entries.slice(0, e.seq), a.day, period) : null;
      if (a.option !== 'dont' || stands?.seq !== a.under) problems.push(`it applies decision #${a.under}, which doesn't stand for ${a.day ?? 'a day with no date'}`);
    }
    if (e.amends !== null) {
      const amended = entries[e.amends];
      const was = amended?.about as unknown as DecideAbout | undefined;
      if (!amended || amended.kind !== 'decide' || amended.seq >= e.seq || !isInputs(was?.inputs) || inputsKey(was.inputs) !== inputsKey(a.inputs)) problems.push(`it amends #${e.amends}, which isn't an earlier decision of the same day`);
    }
    allowed.set(e.seq, problems.length === 0);
    const option = a.option === 'asis' ? 'publish as is' : "don't publish";
    say(problems.length === 0, `${where}: ${option}${a.scope === 'untilPass' ? ' until a day passes' : ''} for ${a.day ?? `run ${a.run}`}, by ${e.by.as}${a.under !== undefined ? `, under #${a.under}` : ''}${problems.length ? `: ${problems.join('; ')}` : `${rule ? ` (rule ${rule})` : ''}, on run ${a.run}'s keys`}`);
  }

  // Each release: it cites an earlier decide entry by its leaf, one that publishes and was allowed; it releases a held
  // run of that decision's inputs (the decided run, or a re-run of the same day); its keys are the decision's and that
  // run's.
  const releasedBy = new Map<number, ReleaseAbout>();
  for (const e of entries.filter((x) => x.kind === 'release')) {
    const a = e.about as unknown as ReleaseAbout;
    const where = `release #${e.seq}`;
    if (!isRecord(a) || !Number.isInteger(a.decision) || typeof a.leaf !== 'string' || !isKeys(a.outputs) || (a.outcome !== 'applied' && a.outcome !== 'refused')) {
      say(false, `${where}: isn't shaped as a release (run, manifest, outputs, decision, leaf, outcome)`);
      continue;
    }
    const problems: string[] = [];
    const cited = entries[a.decision];
    const decision = cited?.about as unknown as DecideAbout | undefined;
    if (!cited || cited.kind !== 'decide' || cited.seq >= e.seq) problems.push(`it cites #${a.decision}, which isn't a decision before it`);
    else if (entryLeaf(cited) !== a.leaf) problems.push(`it cites #${a.decision} by the leaf ${shortHash(a.leaf)}, which isn't that entry's`);
    else {
      if (decision?.option !== 'asis') problems.push(`its decision, #${a.decision}, doesn't publish`);
      if (allowed.get(cited.seq) === false) problems.push(`its decision, #${a.decision}, doesn't hold`);
      const run = runs.get(a.manifest);
      const runAbout = run?.entry.about as unknown as HeldAbout | undefined;
      if (!run || runAbout?.outcome !== 'held' || run.entry.seq > e.seq) problems.push(`it releases run ${a.run} (${shortHash(a.manifest)}), which the record doesn't hold before it`);
      else {
        if (!isInputs(runAbout.inputs) || !isInputs(decision?.inputs) || inputsKey(runAbout.inputs) !== inputsKey(decision.inputs)) problems.push("the run it releases isn't of its decision's day: their inputs differ");
        if (!isKeys(decision?.outputs) || !sameKeys(a.outputs, decision.outputs)) problems.push("its keys aren't its decision's");
        else if (!run.manifest || Object.entries(a.outputs).some(([name, key]) => run.manifest!.outputs[name]?.key !== key)) problems.push(`its keys aren't the ones run ${a.run} made`);
      }
    }
    if (a.outcome === 'applied' && problems.length === 0) releasedBy.set(e.seq, a);
    say(problems.length === 0, `${where}: ${a.outcome === 'applied' ? `${Object.keys(a.outputs).length} output${Object.keys(a.outputs).length === 1 ? '' : 's'} of run ${a.run} released` : `refused (${a.why ?? 'no reason given'})`}, citing decision #${a.decision}${problems.length ? `: ${problems.join('; ')}` : ''}`);
  }

  // Each dataset's proof: its run entry is in the record, and the run's manifest made that dataset with that content.
  for (const f of files.filter((x) => x.path.startsWith(`${top}/data/proofs/`))) {
    const p = JSON.parse(text(f.bytes)) as { dataset: string; key?: string; content: string; rows?: number; manifest?: string; entry: LogEntry; inclusion: { seq: number; size: number; root: string; leaf: string; proof: string[] } };
    const leaf = entryLeaf(p.entry);
    const proven = leaf === p.inclusion.leaf && verifyInclusion(leaf, p.inclusion.seq, p.inclusion.size, p.inclusion.proof, p.inclusion.root) && p.inclusion.size <= leaves.length && rootOf(leaves, p.inclusion.size) === p.inclusion.root;
    // A dataset published by its run cites the run's `ok` entry; one a release published cites the `release` entry,
    // and is proven by the held run it released, found in the record by the release's manifest.
    const released = p.entry?.kind === 'release' && proven && entries[p.inclusion.seq] && entryLeaf(entries[p.inclusion.seq]!) === leaf ? releasedBy.get(p.inclusion.seq) : undefined;
    const runEntry = released ? runs.get(released.manifest)?.entry : p.entry;
    const about = (runEntry?.about ?? null) as { outcome?: string; manifest?: string; blob?: string } | null;
    const blob = about?.blob ? blobs.get(`manifest-${about.blob}`) : undefined;
    const m = blob ? (JSON.parse(text(blob.bytes)) as RunManifest) : undefined;
    const made = m?.outputs[p.dataset];
    const problems: string[] = [];
    const kind = p.entry?.kind === 'release' ? 'release' : 'run';
    if (!proven) problems.push("its proof doesn't hold");
    else if (p.entry.kind === 'release' && !released) problems.push(`entry #${p.inclusion.seq} is not a release that holds, of a decision that publishes`);
    else if (!released && (p.entry.kind !== 'run' || about?.outcome !== 'ok')) problems.push(`entry #${p.inclusion.seq} is not a run that made anything`);
    else if (released && released.outputs[p.dataset] === undefined) problems.push(`its release doesn't name ${p.dataset}`);
    else if (p.manifest !== undefined && p.manifest !== about?.manifest) problems.push(`it names the manifest ${String(p.manifest).slice(0, 16)}…, and its entry the manifest ${String(about?.manifest).slice(0, 16)}…`);
    else if (!m || (await manifestHash(m)) !== about?.manifest) problems.push("its run's manifest isn't in the bag as the record names it");
    else if (!made) problems.push(`its run made no dataset named ${p.dataset}`);
    else if (released && released.outputs[p.dataset] !== made.key) problems.push(`its release names ${p.dataset} with another key than its run made`);
    else if (made.content !== p.content || (p.key !== undefined && made.key !== p.key) || (p.rows !== undefined && made.rows !== p.rows)) problems.push(`its run made it with content ${made.content.slice(0, 16)}…, ${made.rows} rows, not the content ${String(p.content).slice(0, 16)}…${p.rows !== undefined ? `, ${p.rows} rows` : ''} the proof says`);
    say(problems.length === 0, `${p.dataset}: content ${String(p.content).slice(0, 16)}…, in ${kind} entry #${p.inclusion.seq} ${problems.length ? `: ${problems.join('; ')}` : released ? 'proven in the record, as the held run its release published made it' : 'proven in the record, as its run made it'}`);
  }

  // What the engine names: no held run's output shows without an applied release citing a decision in the record.
  const names = json<EngineName[]>('data/engine/datasets.json');
  const engineReleases = json<EngineRelease[]>('data/engine/releases.json') ?? [];
  if (names !== undefined) {
    const decided = new Map(entries.filter((e) => e.kind === 'decide').map((e) => [entryLeaf(e), e]));
    for (const r of engineReleases.filter((x) => x.outcome === 'applied')) {
      const d = r.decision ? decided.get(r.decision) : undefined;
      const run = r.manifest ? runs.get(r.manifest) : undefined;
      const problems: string[] = [];
      if (!d) problems.push("it cites a decision that isn't in the record");
      else if (!sameKeys(r.names, (d.about as unknown as DecideAbout).outputs ?? {})) problems.push(`its names aren't decision #${d.seq}'s, with its keys`);
      if (!run || (run.entry.about as { outcome?: string }).outcome !== 'held') problems.push("the run it released isn't held in the record");
      if (problems.length) say(false, `engine release ${r.id} (run ${r.run}): ${problems.join('; ')}`);
    }
    let shown = 0;
    for (const n of names) {
      const run = runs.get(n.manifest);
      const problems: string[] = [];
      if (run?.manifest && run.manifest.outputs[n.name]?.key !== n.key) problems.push(`it shows the key ${shortHash(n.key)}, which its run didn't make for it`);
      if ((run?.entry.about as { outcome?: string } | undefined)?.outcome === 'held') {
        const rel = engineReleases.find((r) => r.outcome === 'applied' && r.run === n.run && r.manifest === n.manifest && r.names[n.name] === n.key && !!r.decision && decided.has(r.decision));
        if (!rel) problems.push(`it shows run ${n.run}'s version, which the record holds as held, with no release citing a decision in the record`);
      }
      if (problems.length) say(false, `${n.name} (engine): ${problems.join('; ')}`);
      else shown++;
    }
    if (shown === names.length) say(true, `the engine's ${names.length} dataset name${names.length === 1 ? '' : 's'} show versions their runs made, and no held run's output without a release`);
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

/** A flow document in the bag, by its flow hash. */
function flowOf(flows: Map<string, BagFile>, hash: string): FlowDocument | null {
  const f = flows.get(hash);
  try {
    return f ? (JSON.parse(text(f.bytes)) as FlowDocument) : null;
  } catch {
    return null;
  }
}

/**
 * What is wrong with a held run's entry, pushed onto `problems`, and what held it, said, for its line. Its plan holds;
 * its checks' holds are what its manifest's counts hold; each story hold's claim matches the manifest (its day, its
 * history's file, the snapshot's rows) and holds under the plan's hold; and the keys it names are its own, of outputs
 * it held, the waiting ones among them.
 */
function heldProblems(about: unknown, plan: FlowPlan, m: RunManifest, problems: string[]): string {
  const a = about as Partial<HeldAbout>;
  const pub = plan.publish;
  if (!pub) {
    problems.push("it was held, and its plan doesn't hold");
    return '';
  }
  const holds = Array.isArray(a.holds) ? (a.holds as Hold[]) : [];
  if (holds.length === 0) problems.push('it was held, and names nothing that held it');
  const checks = holdsOf({ ...plan, publish: { ...pub, hold: pub.hold.filter((k) => k === 'checks'), watch: [] } }, m, []);
  const stated = holds.filter((h) => h.by === 'checks');
  if (JSON.stringify(checks.map((h) => [h.node, h.said])) !== JSON.stringify(stated.map((h) => [h.node, h.said]))) problems.push("the checks it says held it aren't what its manifest's counts hold");
  const claims = holds.flatMap((h) => (h.by === 'story' && h.claim ? [h.claim] : []));
  const judged = judgeClaims(plan, claims, { rows: (node) => m.nodes.find((n) => n.node === node)?.rows, pinned: (path) => claims.find((c: StoryClaim) => c.history.path === path)?.history });
  for (const h of holds.filter((x) => x.by !== 'checks')) {
    if (!pub.watch.some(([node]) => node === h.node)) problems.push(`it says ${h.origin} held it, which the plan doesn't watch`);
    else if (h.by === 'story') {
      const j = judged.find((x) => x.node === h.node);
      if (!h.claim || !j || 'unjudged' in j) problems.push(`its claim for ${h.origin} doesn't match the run${j && 'unjudged' in j ? `: ${j.unjudged}` : ''}`);
      else if (!claimHolds(pub.hold, h.claim)) problems.push(`its claim for ${h.origin} doesn't hold under ${pub.hold.join(', ')}`);
    }
  }
  const held = new Set(heldOutputs(plan, holds));
  const keys = isKeys(a.keys) ? a.keys : {};
  const bad = Object.entries(keys).filter(([name, key]) => !held.has(name) || m.outputs[name]?.key !== key).map(([name]) => name);
  if (!isKeys(a.keys) || Object.keys(keys).length === 0) problems.push('it names no staged keys');
  else if (bad.length) problems.push(`the keys it names for ${bad.join(', ')} aren't the ones it held`);
  const waiting = Array.isArray(a.waiting) ? a.waiting : [];
  if (waiting.some((w) => typeof w !== 'string' || !Object.hasOwn(keys, w))) problems.push('it says an output waits that it names no key for');
  return `; held by ${holds.map((h) => `${h.origin} (${h.by === 'checks' ? 'its checks' : h.by === 'story' ? h.said : 'not judged'})`).join(', ')}, ${waiting.length} output${waiting.length === 1 ? '' : 's'} waiting`;
}

/** A checkpoint's size and root, said. */
export const checkpointSays = (env: SignedCheckpoint) => {
  const c = parseCheckpoint(env.checkpoint);
  return `${c.origin} at ${c.size} entries, root ${c.root}`;
};
