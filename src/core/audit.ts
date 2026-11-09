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
 * decide entry, by its leaf, still the day's decision when it was released) and the run it releases; a proof may
 * cite a release, or a held run's entry for an output it didn't hold; and the engine's names (engine/datasets.json,
 * engine/releases.json) show only versions of runs in the record, never a held output without a release citing a
 * decision in the record. What held a run is read from the engine (engine/holds.json) as well as from the record: a
 * run the engine held, recorded as published, fails, and its outputs need a release all the same.
 *
 * A day filled, or published with the part that arrived (ADR 0009 amendment 1 S11), is checked through its derived
 * run as a held run is, and against the held run it repairs: its document is that run's repaired by the decision's
 * repair, it read the same snapshot of the watched source, and its donor's file is in the list, on a day the rule's
 * direction allows within four weeks, with a claim that says nothing wrong, told from the held run's history. A
 * release of it names the derived run and keys its decision names (`derived`), and never moves the names back past a
 * later day; a withdrawal (Q-61) amends the fill's decision and points each name back to what it showed before the
 * fill. What the engine kept of the fills (engine/repairs.json) agrees with the record.
 *
 * A bag carries its own card and its own data list, so on its own it shows only that it is consistent with itself:
 * anyone can make a bag that is. What ties it to someone is what the auditor brings: a checkpoint they kept, the
 * signer's fingerprint from its owner, and the data list from the data branch (`git show <commit>:MANIFEST.json`).
 * The script (scripts/audit.mjs) and the tests use this; nothing here needs a browser or the engine.
 */
import { checkBag, readBagInfo, type BagFile } from './bag.js';
import type { FlowDocument } from './document.js';
import { sha256Hex } from './hash.js';
import { daysBetween } from './calendar.js';
import { DONOR_WINDOW, levelStray, levelWays, repairDocument, type Repair } from './fill.js';
import { carry, claimBase, claimHolds, donorGood, factsFromClaims, heldOutputs, holdsOf, inputsKey, isLoad, loadKey, type Load, isClaim2, isLevel, judgeClaims, lastPublished, sameKeys, standingFor, standingForLoad, type Claim, type DecideAbout, type DerivedAbout, type HeldAbout, type Hold, type Judged, type ReleaseAbout, type RunHold } from './hold.js';
import { canonicalJSON } from './canonical.js';
import { consistencyProof, entryLeaf, parseCheckpoint, rootOf, verifyCheckpoint, verifyConsistency, verifyInclusion, verifyRecord, type JSONValue, type LogEntry, type SignedCheckpoint } from './log.js';
import { manifestHash, planHash, policiesHash, type IdentityCard, type RunManifest } from './manifest.js';
import { flowHash, planPeriod, watchesOf, type FlowPlan } from './plan.js';
import { checkDecision, DECIDE_OPTIONS } from './policy.js';
import { isHistory, type HistoryFile } from './history.js';
import { retellClaims, toTell, type Retold } from './retell.js';
import type { Story } from './story.js';

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

/**
 * What held a run, as the plugin kept it (engine/holds.json, its `_smaltfl_holds`): a row for every run of a plan with a
 * publish block in the engine, `holds` empty when it published, and its watched sources as it judged them.
 */
export interface EngineHolds {
  run: number;
  manifest: string;
  holds: Hold[];
  judged: Judged[];
}

/**
 * What the engine kept of the fills (engine/repairs.json, ADR 0009 amendment 1 S11): each derived run with the held
 * run it repairs, what held it besides its day's holds and its donors as judged; each applied release of one, with its
 * repair and what each name showed before it; and each withdrawal.
 */
export interface EngineRepairs {
  derived: { run: number; manifest: string; from: { run: number; manifest: string }; holds: RunHold[]; donors: Judged[]; filled: number | null }[];
  repairs: { release: number; run: number; from: { run: number; manifest: string }; repair: Repair; before: Record<string, { key: string; run: number } | null> }[];
  withdrawals: { release: number; withdraws: number }[];
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
  /** The base history a flow's claim/2 were told from (ADR 0010 §6): with it, each is told again (`--history`). */
  history?: Uint8Array;
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

  // The held run's own claim for its day, from its entry's story hold or what the engine judged it by.
  const heldClaim = (entry: LogEntry, manifest: string): Claim | null => {
    const story = ((entry.about as Partial<HeldAbout>).holds ?? []).find((h) => h.by === 'story' && h.claim)?.claim;
    const judged = engineHolds.get(manifest)?.judged.find((j) => 'claim' in j);
    return story ?? (judged && 'claim' in judged ? judged.claim : null);
  };

  /**
   * What is wrong with a derived run's entry (ADR 0009 amendment 1 S11), pushed onto `problems`, and what it is, said:
   * held as a held run is, of the held run it repairs (in the record before it, the same day), its document that run's
   * repaired, the same snapshot of the watched source, and its donor's file, day and claim.
   */
  const derivedProblems = async (e: LogEntry, plan: FlowPlan, m: RunManifest, problems: string[]): Promise<string> => {
    const a = e.about as Partial<DerivedAbout>;
    const repair = a.repair;
    if (!isRecord(a.from) || typeof a.from.manifest !== 'string' || !isRecord(repair)) {
      problems.push('it names no held run it repairs, or no repair');
      return '';
    }
    const said = heldProblems(a, plan, m, problems);
    const held = runs.get(a.from.manifest);
    if (!held || (held.entry.about as { outcome?: string }).outcome !== 'held' || held.entry.seq > e.seq) {
      problems.push(`it repairs run ${a.from.run} (${shortHash(a.from.manifest)}), which the record doesn't hold before it`);
      return said;
    }
    const hm = held.manifest;
    const period = planPeriod(plan.publish);
    const day = period !== null && typeof m.parameters[period] === 'string' ? (m.parameters[period] as string) : null;
    if (!hm || day === null || hm.parameters[period!] !== day) problems.push(`it isn't of run ${a.from.run}'s day`);
    const fromDoc = hm ? flowOf(flows, hm.flow.hash) : null;
    if (!fromDoc) problems.push(`run ${a.from.run}'s flow document isn't in the bag, so its repair can't be checked`);
    else {
      try {
        if ((await flowHash(repairDocument(fromDoc, repair))) !== m.flow.hash) problems.push(`its document isn't run ${a.from.run}'s repaired by its repair`);
      } catch (err) {
        problems.push(`its repair doesn't apply to run ${a.from.run}'s flow: ${(err as Error).message}`);
      }
    }
    const source = (x: RunManifest | null) => x?.nodes.find((n) => n.op === 'table' && n.origin.toLowerCase() === repair.source.toLowerCase())?.content;
    if (!source(m) || source(m) !== source(hm)) problems.push(`it read another ${repair.source} than run ${a.from.run}`);
    if (repair.donor) {
      const donor = repair.donor;
      const fill = plan.nodes.find((n) => n.op === 'fill' && n.origin === repair.step);
      const node = m.nodes.find((n) => n.node === (fill && fill.inputs.length === 2 ? fill.inputs[1] : -1));
      if ((node?.file?.sha256 ?? node?.content) !== donor.file.sha256) problems.push(`its donor didn't read the ${donor.day} file its repair names`);
      if (day) {
        const away = daysBetween(donor.day, day);
        const fits = (donor.direction === 'before' ? away > 0 : away < 0) && Math.abs(away) <= DONOR_WINDOW && (donor.rule !== 'weekday' || Math.abs(away) % 7 === 0);
        if (!fits) problems.push(`its donor, ${donor.day}, isn't ${donor.rule === 'weekday' ? 'the same weekday' : 'a day'} ${donor.direction} it within four weeks`);
      }
      const judged = engineRepairs?.derived.find((d) => d.manifest === a.manifest)?.donors.find((j) => j.node === node?.node);
      const claim = judged && 'claim' in judged ? judged.claim : donor.claim;
      if (judged && 'unjudged' in judged) problems.push(`its donor wasn't judged: ${judged.unjudged}`);
      else if (!isRecord(claim) || !donorGood(claim)) problems.push(`its donor's claim says something wrong${isRecord(claim) ? `: ${claim.head}` : ''}`);
      const told = heldClaim(held.entry, a.from.manifest);
      if (told && isRecord(claim) && claimBase(claim as Claim)?.sha256 !== claimBase(told)?.sha256) problems.push(`its donor's claim was told from another history than run ${a.from.run}'s`);
    }
    return `${said}; ${repair.donor ? `fills ${repair.source} from ${repair.donor.day}` : `the part of ${repair.source} that arrived`}, repairing run ${a.from.run}`;
  };

  /** What each name showed just before entry `seq`, from the record: the versions each publication pointed. */
  const shownBefore = (seq: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const x of entries.slice(0, seq)) {
      const a = x.about as Omit<Partial<ReleaseAbout>, 'outcome'> & { outcome?: string; manifest?: string };
      if (x.kind === 'run' && a.outcome === 'ok' && typeof a.manifest === 'string') for (const [name, o] of Object.entries(runs.get(a.manifest)?.manifest?.outputs ?? {})) out[name] = o.key;
      else if (x.kind === 'release' && a.outcome === 'applied' && isKeys(a.outputs)) Object.assign(out, a.outputs);
    }
    return out;
  };

  /** What is wrong with the release of a fill or the part that arrived: it releases the derived run its decision names,
   * with its keys, made by its decision's repair, of its decision's held run, and never moves a name back. */
  const remedyReleaseProblems = (e: LogEntry, a: ReleaseAbout, cited: LogEntry, decision: DecideAbout): string[] => {
    const problems: string[] = [];
    const named = decision.derived;
    // The same inputs, a run's or a held run's, name the same day's version in another engine: a decision applied again
    // after a reload releases the derived run made again there (S9), as a decision to publish as is releases the day's
    // held run made again (ADR 0009 §10).
    const inputsOfRun = (manifest: string | undefined) => {
      const ab = manifest ? (runs.get(manifest)?.entry.about as { inputs?: unknown } | undefined) : undefined;
      return isInputs(ab?.inputs) ? inputsKey(ab.inputs) : null;
    };
    if (!named) problems.push(`its decision, #${cited.seq}, names no derived run to release`);
    else {
      if (a.manifest !== named.manifest && (inputsOfRun(a.manifest) === null || inputsOfRun(a.manifest) !== inputsOfRun(named.manifest))) problems.push(`it releases run ${a.run}, not the derived run its decision names`);
      if (!isKeys(a.outputs) || !sameKeys(a.outputs, named.keys)) problems.push("its keys aren't those of the derived run its decision names");
      const run = runs.get(a.manifest);
      const ra = run?.entry.about as Partial<DerivedAbout> | undefined;
      if (!run || ra?.outcome !== 'derived' || run.entry.seq > e.seq) problems.push(`it releases run ${a.run} (${shortHash(a.manifest)}), which the record doesn't hold as a derived run before it`);
      else {
        if (ra.from?.manifest !== decision.manifest && (!isInputs(decision.inputs) || inputsOfRun(ra.from?.manifest) !== inputsKey(decision.inputs))) problems.push(`run ${a.run} repairs another run than its decision decides`);
        const repair = isRecord(a.repair) ? a.repair : decision.repair;
        if (canonicalJSON((ra.repair ?? null) as unknown as JSONValue) !== canonicalJSON((repair ?? null) as unknown as JSONValue)) problems.push(`run ${a.run} wasn't made by its decision's repair`);
        if (!run.manifest || Object.entries(a.outputs).some(([n, k]) => run.manifest!.outputs[n]?.key !== k)) problems.push(`its keys aren't the ones run ${a.run} made`);
      }
    }
    const since = entries.slice(cited.seq + 1, e.seq).find((x) => x.kind === 'decide' && (x.amends === cited.seq || (isRecord(x.about) && isInputs(x.about.inputs) && inputsKey(x.about.inputs) === inputsKey(decision.inputs))));
    if (since) problems.push(`its decision, #${cited.seq}, was ${since.amends === cited.seq ? 'amended' : 'decided again'} by #${since.seq} before it`);
    const period = planPeriod(runs.get(decision.manifest)?.plan?.publish);
    const shown = lastPublished(entries.slice(0, e.seq), period);
    if (a.outcome === 'applied' && decision.day && shown && shown > decision.day) problems.push(`it moved the names back past ${shown}, published before it`);
    const asis = a.outcome === 'applied' ? publishedAsIs(e.seq, decision) : undefined;
    if (asis) problems.push(`it took back ${decision.day ?? 'its day'}, published ${asis.option === 'accept' ? 'at its new level' : 'as is'} by release #${asis.release}`);
    return problems;
  };

  /**
   * The applied release, before entry `seq`, that published a decision's day (or its load) as is or at its new level, by
   * a decision of the same inputs (or about the same load): what no remedy may take back afterwards (§12, S5).
   */
  const publishedAsIs = (seq: number, a: DecideAbout): { release: number; option: 'asis' | 'accept' } | undefined => {
    for (const x of entries.slice(0, seq)) {
      const r = x.about as Partial<ReleaseAbout> | null;
      if (x.kind !== 'release' || !isRecord(r) || r.outcome !== 'applied' || Number.isInteger(r.withdraws)) continue;
      for (const c of Array.isArray(r.decisions) ? r.decisions : [r.decision]) {
        const d = Number.isInteger(c) ? entries[c as number] : undefined;
        const da = d?.about as unknown as DecideAbout | undefined;
        if (d?.kind !== 'decide' || !isRecord(da) || (da.option !== 'asis' && da.option !== 'accept')) continue;
        const same = a.load !== undefined ? isLoad(da.load) && isLoad(a.load) && loadKey(da.load) === loadKey(a.load) : da.load === undefined && isInputs(da.inputs) && isInputs(a.inputs) && inputsKey(da.inputs) === inputsKey(a.inputs);
        if (same) return { release: x.seq, option: da.option };
      }
    }
    return undefined;
  };

  /** What is wrong with a withdrawal (Q-61): it takes back an applied release of a fill or a part, amends that fill's
   * decision, takes back every name it released, points each back to what it showed before the fill, and never moves a
   * name back past a later day. */
  const withdrawalProblems = (e: LogEntry, a: ReleaseAbout, cited: LogEntry): string[] => {
    const problems: string[] = [];
    const taken = entries[a.withdraws!];
    const was = taken?.about as unknown as ReleaseAbout | undefined;
    if (!taken || taken.kind !== 'release' || taken.seq >= e.seq || was?.outcome !== 'applied' || !remedyOf(entries[was.decision])) {
      problems.push(`it withdraws #${String(a.withdraws)}, which isn't an earlier applied release of a fill or a part`);
      return problems;
    }
    if (cited.amends !== was.decision) problems.push(`its decision, #${cited.seq}, doesn't amend the fill's decision, #${was.decision}`);
    if (!isKeys(a.outputs) || !sameKeys(Object.fromEntries(Object.keys(a.outputs).map((n) => [n, ''])), Object.fromEntries(Object.keys(was.outputs).map((n) => [n, ''])))) problems.push(`it doesn't take back every name release #${taken.seq} released`);
    else {
      const before = shownBefore(taken.seq);
      const wrong = Object.entries(a.outputs).filter(([name, key]) => before[name] !== key).map(([name]) => name);
      if (wrong.length) problems.push(`it doesn't point ${wrong.join(', ')} back to what ${wrong.length === 1 ? 'it' : 'they'} showed before the fill`);
    }
    const decision = cited.about as unknown as DecideAbout;
    const period = planPeriod(runs.get(decision.manifest)?.plan?.publish);
    const shown = lastPublished(entries.slice(0, e.seq), period);
    if (a.outcome === 'applied' && decision.day && shown && shown > decision.day) problems.push(`it moved the names back past ${shown}, published before it`);
    return problems;
  };

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
  // What held each of the engine's runs, as the plugin kept it, by the run's manifest hash.
  const engineHolds = new Map((json<EngineHolds[]>('data/engine/holds.json') ?? []).map((x) => [x.manifest, x]));
  // The runs that made something, published or held, by their manifest's hash: what decisions, releases and proofs cite.
  const runs = new Map<string, { entry: LogEntry; manifest: RunManifest | null; plan: FlowPlan | null; ok: boolean }>();
  const engineRepairs = json<EngineRepairs>('data/engine/repairs.json');
  for (const e of entries.filter((x) => x.kind === 'run' && ['ok', 'held', 'derived'].includes(String((x.about as { outcome?: string } | null)?.outcome)))) {
    const a = e.about as { run: number; manifest: string; blob: string; outcome: 'ok' | 'held' | 'derived' };
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
    if (!plan && (m.smaltflRun === 1 || a.outcome !== 'ok')) problems.push("its plan isn't in the bag, so what it ran can't be checked");
    // A held run: its holds are what its manifest's counts and its claims hold, and the keys it names are its own. A
    // derived run is held as a held run is, and checked against the held run it repairs.
    const said = a.outcome === 'held' && typed ? heldProblems(e.about, typed, m, problems) : a.outcome === 'derived' && typed ? await derivedProblems(e, typed, m, problems) : '';
    // Recorded as published: a plan that holds on its checks must not have counts that hold it.
    if (a.outcome === 'ok' && typed?.publish && checksHolds(typed, m).length) problems.push("it was recorded as published, and its manifest's counts hold it");
    // What the engine kept of what held it: what its manifest and its judged sources hold, and what the record says.
    const kept = engineHolds.get(a.manifest);
    if (kept && typed) {
      // A load an earlier run of the flow held is carried, citing it (ADR 0010 §7): from what the engine kept of them.
      const earlier = (l: Load) => [...engineHolds.values()].filter((x) => x.run < kept.run && runs.get(x.manifest)?.manifest?.flow.id === m.flow.id).sort((x, y) => x.run - y.run).find((x) => Array.isArray(x.holds) && x.holds.some((h) => h.load && loadKey(h.load) === loadKey(l)))?.run;
      problems.push(...engineHoldsProblems(kept, e.about, typed, m, a.outcome === 'derived' ? 'derived' : a.outcome, engineRepairs?.derived.find((d) => d.manifest === a.manifest), earlier));
      // The claims its entry keeps (ADR 0010 §6) include each one the engine judged it by: what --history tells again.
      const keptClaims = (e.about as { claims?: unknown }).claims;
      if (Array.isArray(keptClaims) && Array.isArray(kept.judged)) {
        const said = new Set(keptClaims.map((c) => canonicalJSON(c as JSONValue)));
        if (kept.judged.some((j) => 'claim' in j && !said.has(canonicalJSON(j.claim as unknown as JSONValue)))) problems.push("the claims its entry keeps aren't the ones the engine judged it by");
      }
    }
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

  /**
   * The outputs a run held, by its manifest's hash: those its record entry's holds keep back and the keys it names,
   * and those the engine's holds keep back; every output of a held run whose plan isn't in the bag. Null for a run the
   * record doesn't have.
   */
  const heldBy = (manifest: string | undefined): Set<string> | null => {
    const run = manifest === undefined ? undefined : runs.get(manifest);
    if (!run) return null;
    const a = run.entry.about as Omit<Partial<HeldAbout>, 'outcome'> & { outcome?: string };
    const out = new Set<string>();
    // A derived run holds every output until a decision releases it.
    if (a.outcome === 'derived') for (const k of Object.keys(run.manifest?.outputs ?? {})) out.add(k);
    if (a.outcome === 'held') {
      if (isKeys(a.keys)) for (const k of Object.keys(a.keys)) out.add(k);
      if (run.plan) for (const k of heldOutputs(run.plan, Array.isArray(a.holds) ? a.holds : [])) out.add(k);
      else for (const k of Object.keys(run.manifest?.outputs ?? {})) out.add(k);
    }
    const kept = engineHolds.get(manifest!);
    if (kept && run.plan) for (const k of heldOutputs(run.plan, kept.holds)) out.add(k);
    return out;
  };

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
    else if (a.load !== undefined) {
      // Several watched sources (ADR 0010 §7): a decision about a load the run held, whatever its keys.
      if (!isLoad(a.load) || !(Array.isArray(heldAbout.holds) && heldAbout.holds.some((h) => isLoad(h.load) && loadKey(h.load) === loadKey(a.load!)))) problems.push("the load it is about isn't one that held the run");
    } else {
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
    // Accept the new level (amendment 1 S6, C6): a reason and the level it records; under a standing level, the Accept it
    // applies, earlier and released, of the same source and metrics, starting before the day, and a day held by its story
    // alone (a check, or a source not judged, pauses the day again).
    if (a.option === 'accept') {
      if (typeof e.reason !== 'string' || e.reason.trim() === '') problems.push('it accepts a new level with no reason');
      if (!isLevel(a.level)) problems.push('it accepts a new level and names none (its source, the day it starts and its metrics)');
      else if (a.under === undefined && a.level.from !== a.day) problems.push(`its level starts ${a.level.from}, not on the day it accepts, ${a.day ?? 'a day with no date'}`);
      if (a.under !== undefined) {
        const root = entries[a.under];
        const was = root?.about as unknown as DecideAbout | undefined;
        const level = isLevel(a.level) ? a.level : null;
        const released = entries.slice(0, e.seq).some((x) => x.kind === 'release' && isRecord(x.about) && x.about.decision === a.under && x.about.outcome === 'applied');
        if (!root || root.kind !== 'decide' || root.seq >= e.seq || was?.option !== 'accept' || was.under !== undefined || !isLevel(was.level)) problems.push(`it applies #${a.under}, which isn't an earlier Accept of a new level`);
        else if (!released) problems.push(`it applies #${a.under}, whose new level was never published`);
        else if (!level || level.source !== was.level.source || level.from !== was.level.from || canonicalJSON(level.metrics) !== canonicalJSON(was.level.metrics)) problems.push(`it names another level than #${a.under}'s`);
        else if (typeof a.day !== 'string' || !(was.level.from < a.day)) problems.push(`#${a.under}'s new level doesn't stand for ${a.day ?? 'a day with no date'}: it starts ${was.level.from}`);
        if (heldAbout && Array.isArray(heldAbout.holds) && heldAbout.holds.some((h) => h.by !== 'story')) problems.push(`#${a.under}'s new level doesn't stand for its day: something besides its story holds it`);
      }
    }
    const remedy = a.option === 'fill' || a.option === 'complete';
    if (remedy && (!isRecord(a.repair) || (a.repair as Repair).kind !== a.option)) problems.push(`it ${a.option === 'fill' ? 'fills' : 'publishes the part that arrived'} with no repair of that kind`);
    const period = planPeriod(held?.plan?.publish);
    if (a.under !== undefined && a.option !== 'accept') {
      // A decision about a load stands until a later load of its source passes (ADR 0010 §7), not until a day does.
      const stands = a.load !== undefined ? (isLoad(a.load) ? standingForLoad(entries.slice(0, e.seq), a.load) : null) : typeof a.day === 'string' ? standingFor(entries.slice(0, e.seq), a.day, period) : null;
      if (a.option === 'asis' || stands?.seq !== a.under || stands.about.option !== a.option) problems.push(`it applies decision #${a.under}, which doesn't stand for ${a.load !== undefined && isLoad(a.load) ? `${a.load.source}'s ${a.load.slot} load` : (a.day ?? 'a day with no date')}`);
    }
    // Publish as is can't be taken back (ADR 0009 §12, amendment 1 S5): no fill or part alone after the day went out as is.
    const asis = remedy ? publishedAsIs(e.seq, a) : undefined;
    if (asis) problems.push(`readers have ${a.day ?? `run ${a.run}`} ${asis.option === 'accept' ? 'at its new level' : 'as is'} since release #${asis.release}, which can't be taken back`);
    if (e.amends !== null) {
      const amended = entries[e.amends];
      const was = amended?.about as unknown as DecideAbout | undefined;
      const sameOf = a.load !== undefined ? isLoad(was?.load) && isLoad(a.load) && loadKey(was.load) === loadKey(a.load) : isInputs(was?.inputs) && inputsKey(was.inputs) === inputsKey(a.inputs);
      if (!amended || amended.kind !== 'decide' || amended.seq >= e.seq || !sameOf) problems.push(`it amends #${e.amends}, which isn't an earlier decision of the same ${a.load !== undefined ? 'load' : 'day'}`);
    }
    allowed.set(e.seq, problems.length === 0);
    const option = a.option === 'accept' ? (a.under !== undefined ? `publish by #${a.under}'s new level` : `accept the new level from ${isLevel(a.level) ? a.level.from : 'the day'}`) : a.option === 'asis' ? 'publish as is' : a.option === 'fill' ? `fill from ${(a.repair as Repair | undefined)?.donor?.day ?? 'another day'}` : a.option === 'complete' ? 'publish the part that arrived' : e.amends !== null && remedyOf(entries[e.amends]) ? "don't publish (withdraws the fill)" : "don't publish";
    say(problems.length === 0, `${where}: ${option}${a.scope === 'untilPass' ? ' until a later day passes' : ''} for ${a.day ?? `run ${a.run}`}, by ${e.by.as}${a.under !== undefined ? `, under #${a.under}` : ''}${problems.length ? `: ${problems.join('; ')}` : `${rule ? ` (rule ${rule})` : ''}, on run ${a.run}'s keys${a.option === 'accept' && a.under !== undefined && !trust.history ? "; not checked against the level's metrics: --history tells its day again to check it" : ''}`}`);
  }

  /**
   * A release of a run of several watched sources (ADR 0010 §7): it cites, by seq, one decision a load (the first as
   * `decision`), each an earlier decision about a load, publishing, allowed, and not amended or decided again before it;
   * the run it releases is held in the record before it, by each cited load; its keys are that run's, for outputs its
   * holds keep back and that wait for no load it doesn't cite.
   */
  const loadReleaseProblems = (e: LogEntry, a: ReleaseAbout): string[] => {
    const out: string[] = [];
    const cited = Array.isArray(a.decisions) ? a.decisions : [a.decision];
    if (cited[0] !== a.decision || !cited.every((d) => Number.isInteger(d))) return ['its decisions are not listed with its first as its decision'];
    const run = runs.get(a.manifest);
    const runAbout = run?.entry.about as unknown as HeldAbout | undefined;
    if (!run || runAbout?.outcome !== 'held' || run.entry.seq > e.seq) return [`it releases run ${a.run} (${shortHash(a.manifest)}), which the record doesn't hold before it`];
    const holds = Array.isArray(runAbout.holds) ? (runAbout.holds as Hold[]) : [];
    const covered = new Set<string>();
    for (const seq of cited) {
      const c = entries[seq];
      const d = c?.about as unknown as DecideAbout | undefined;
      if (!c || c.kind !== 'decide' || c.seq >= e.seq || !isLoad(d?.load)) {
        out.push(`it cites #${seq}, which isn't a decision about a load before it`);
        continue;
      }
      if (d.option !== 'asis' && d.option !== 'accept' && d.option !== 'fill' && d.option !== 'complete') out.push(`its decision, #${seq}, doesn't publish`);
      if (allowed.get(seq) === false) out.push(`its decision, #${seq}, doesn't hold`);
      const since = entries.slice(seq + 1, e.seq).find((x) => x.kind === 'decide' && (x.amends === seq || (isRecord(x.about) && isLoad(x.about.load) && loadKey(x.about.load) === loadKey(d.load!))));
      if (since) out.push(`its decision, #${seq}, was ${since.amends === seq ? 'amended' : 'decided again'} by #${since.seq} before it`);
      if (!holds.some((h) => isLoad(h.load) && loadKey(h.load) === loadKey(d.load!))) out.push(`its decision, #${seq}, is about ${d.load.source}'s ${d.load.slot} load, which didn't hold run ${a.run}`);
      covered.add(loadKey(d.load));
    }
    for (const [name, key] of Object.entries(a.outputs)) {
      if (!run.manifest || run.manifest.outputs[name]?.key !== key) out.push(`its key for ${name} isn't the one run ${a.run} made`);
      const waits = holds.filter((h) => h.reaches.includes(name));
      if (waits.length === 0) out.push(`run ${a.run} didn't hold ${name}`);
      else if (waits.some((h) => !(isLoad(h.load) && covered.has(loadKey(h.load))))) out.push(`${name} waits for a load none of its decisions is about`);
    }
    return out;
  };

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
    else if (decision?.option === 'fill' || decision?.option === 'complete' || (decision?.option === 'dont' && Number.isInteger(a.withdraws))) {
      if (allowed.get(cited.seq) === false) problems.push(`its decision, #${a.decision}, doesn't hold`);
      problems.push(...(decision.option === 'dont' ? withdrawalProblems(e, a, cited) : remedyReleaseProblems(e, a, cited, decision)));
    } else if (Array.isArray(a.decisions) || decision?.load !== undefined) {
      problems.push(...loadReleaseProblems(e, a));
    } else {
      if (decision?.option !== 'asis' && decision?.option !== 'accept') problems.push(`its decision, #${a.decision}, doesn't publish`);
      if (allowed.get(cited.seq) === false) problems.push(`its decision, #${a.decision}, doesn't hold`);
      // Still the day's decision when it is released: none amends it, and no other decision of its day follows it.
      const since = entries.slice(cited.seq + 1, e.seq).find((x) => x.kind === 'decide' && (x.amends === cited.seq || (isRecord(x.about) && isInputs(x.about.inputs) && isInputs(decision?.inputs) && inputsKey(x.about.inputs) === inputsKey(decision.inputs))));
      if (since) problems.push(`its decision, #${a.decision}, was ${since.amends === cited.seq ? 'amended' : 'decided again'} by #${since.seq} before it`);
      const run = runs.get(a.manifest);
      const runAbout = run?.entry.about as unknown as HeldAbout | undefined;
      if (!run || runAbout?.outcome !== 'held' || run.entry.seq > e.seq) problems.push(`it releases run ${a.run} (${shortHash(a.manifest)}), which the record doesn't hold before it`);
      else {
        if (!isInputs(runAbout.inputs) || !isInputs(decision?.inputs) || inputsKey(runAbout.inputs) !== inputsKey(decision.inputs)) problems.push("the run it releases isn't of its decision's day: their inputs differ");
        if (!isKeys(decision?.outputs) || !sameKeys(a.outputs, decision.outputs)) problems.push("its keys aren't its decision's");
        else if (!run.manifest || Object.entries(a.outputs).some(([name, key]) => run.manifest!.outputs[name]?.key !== key)) problems.push(`its keys aren't the ones run ${a.run} made`);
      }
    }
    if (a.outcome === 'applied' && problems.length === 0 && !Number.isInteger(a.withdraws)) releasedBy.set(e.seq, a);
    const what = Number.isInteger(a.withdraws) ? `release #${String(a.withdraws)} withdrawn: ${Object.keys(a.outputs).length} output${Object.keys(a.outputs).length === 1 ? '' : 's'} back` : `${Object.keys(a.outputs).length} output${Object.keys(a.outputs).length === 1 ? '' : 's'} of run ${a.run} released`;
    say(problems.length === 0, `${where}: ${a.outcome === 'applied' ? what : `refused (${a.why ?? 'no reason given'})`}, citing decision #${a.decision}${problems.length ? `: ${problems.join('; ')}` : ''}`);
  }

  // Each dataset's proof: its run entry is in the record, and the run's manifest made that dataset with that content.
  for (const f of files.filter((x) => x.path.startsWith(`${top}/data/proofs/`))) {
    const p = JSON.parse(text(f.bytes)) as { dataset: string; key?: string; content: string; rows?: number; manifest?: string; entry: LogEntry; inclusion: { seq: number; size: number; root: string; leaf: string; proof: string[] } };
    const leaf = entryLeaf(p.entry);
    const proven = leaf === p.inclusion.leaf && verifyInclusion(leaf, p.inclusion.seq, p.inclusion.size, p.inclusion.proof, p.inclusion.root) && p.inclusion.size <= leaves.length && rootOf(leaves, p.inclusion.size) === p.inclusion.root;
    // A dataset published by its run cites the run's `ok` entry, or a held run's entry for an output it didn't hold (a
    // flow that doesn't hold its outputs together); one a release published cites the `release` entry, and is proven by
    // the held run it released, found in the record by the release's manifest.
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
    else if (!released && (p.entry.kind !== 'run' || (about?.outcome !== 'ok' && about?.outcome !== 'held'))) problems.push(`entry #${p.inclusion.seq} is not a run that made anything`);
    else if (!released && about?.outcome === 'held' && heldBy(about.manifest)?.has(p.dataset) !== false) problems.push(`entry #${p.inclusion.seq} is a held run, which held ${p.dataset}: only a release publishes it`);
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
    const backs = new Map((engineRepairs?.withdrawals ?? []).map((w) => [w.release, w.withdraws]));
    // Each decision a withdrawal took back in the engine (Q-61), with the first engine release that withdrew it: no
    // later engine release applies it again (a new decision does, S5).
    const withdrawnAt = new Map<string, number>();
    for (const [back, taken] of backs) {
      const t = engineReleases.find((x) => x.id === taken);
      if (t?.decision && back < (withdrawnAt.get(t.decision) ?? Infinity)) withdrawnAt.set(t.decision, back);
    }
    // Each engine release that publishes is one the record keeps: as many applied releases citing a decision in the
    // engine as in the record, at most (the record holds those of earlier engines too).
    const recordedCites = (seq: number) => entries.filter((e) => e.kind === 'release' && isRecord(e.about) && e.about.outcome === 'applied' && !Number.isInteger(e.about.withdraws) && (Array.isArray(e.about.decisions) ? e.about.decisions : [e.about.decision]).includes(seq)).length;
    const engineCites = new Map<string, number>();
    for (const r of engineReleases) if (r.outcome === 'applied' && !backs.has(r.id) && r.decision) engineCites.set(r.decision, (engineCites.get(r.decision) ?? 0) + 1);
    for (const r of engineReleases.filter((x) => x.outcome === 'applied')) {
      const d = r.decision ? decided.get(r.decision) : undefined;
      const run = r.manifest ? runs.get(r.manifest) : undefined;
      const outcome = run ? (run.entry.about as { outcome?: string }).outcome : undefined;
      const about = d?.about as unknown as DecideAbout | undefined;
      const problems: string[] = [];
      if (!d) problems.push("it cites a decision that isn't in the record");
      else if (backs.has(r.id)) {
        // A withdrawal: a decision not to publish, naming what the release it takes back released.
        const taken = engineReleases.find((x) => x.id === backs.get(r.id));
        if (about?.option !== 'dont') problems.push(`its decision, #${d.seq}, isn't a decision not to publish`);
        if (!taken || taken.outcome !== 'applied' || !sameKeys(r.names, taken.names)) problems.push(`it doesn't take back what release ${String(backs.get(r.id))} released`);
      } else if (outcome === 'derived') {
        if (!about?.derived || !sameKeys(r.names, about.derived.keys)) problems.push(`its names aren't the derived run decision #${d.seq} names, with its keys`);
      } else if (about?.load !== undefined) {
        // A decision about a load (ADR 0010 §7) names no keys: the record's release of the same run names them.
        const recorded = entries.some((e) => e.kind === 'release' && isRecord(e.about) && e.about.manifest === r.manifest && e.about.outcome === 'applied' && isKeys(e.about.outputs) && sameKeys(r.names, e.about.outputs) && (Array.isArray(e.about.decisions) ? e.about.decisions : [e.about.decision]).includes(d.seq));
        if (!recorded) problems.push(`its names aren't those a release of run ${r.run} citing decision #${d.seq} names, with its keys`);
      } else if (!sameKeys(r.names, about?.outputs ?? {})) problems.push(`its names aren't decision #${d.seq}'s, with its keys`);
      if (d && !backs.has(r.id)) {
        const w = withdrawnAt.get(r.decision!);
        if (w !== undefined && w < r.id) problems.push(`it applies decision #${d.seq} again after engine release ${w} withdrew it: only a new decision applies a withdrawn fill again`);
        const k = recordedCites(d.seq);
        if ((engineCites.get(r.decision!) ?? 0) > k) problems.push(`the engine applied decision #${d.seq} ${engineCites.get(r.decision!)} times, and the record keeps ${k === 0 ? 'no applied release' : k === 1 ? 'one applied release' : `${k} applied releases`} citing it`);
      }
      if (!run || (outcome !== 'held' && outcome !== 'derived')) problems.push("the run it released isn't held in the record");
      if (problems.length) say(false, `engine release ${r.id} (run ${r.run}): ${problems.join('; ')}`);
    }
    // The fills the engine kept: each release of a derived run, by a derived run of the record that repairs the same
    // held run; each withdrawal, of such a release.
    if (engineRepairs) {
      const repaired = new Set(engineRepairs.repairs.map((x) => x.release));
      for (const x of engineRepairs.repairs) {
        const d = engineRepairs.derived.find((y) => y.run === x.run);
        const run = d ? runs.get(d.manifest) : undefined;
        const a = run?.entry.about as Partial<DerivedAbout> | undefined;
        if (!d || !run || a?.outcome !== 'derived' || a.from?.manifest !== x.from.manifest) say(false, `engine repair ${x.release} (run ${x.run}): its derived run isn't the record's, repairing run ${x.from.run}`);
        else if (canonicalJSON(a.repair as unknown as JSONValue) !== canonicalJSON(x.repair as unknown as JSONValue)) say(false, `engine repair ${x.release} (run ${x.run}): its repair isn't the one the record's derived run was made by`);
      }
      for (const w of engineRepairs.withdrawals) if (!repaired.has(w.withdraws)) say(false, `engine withdrawal ${w.release}: release ${w.withdraws} isn't a release of a fill or a part`);
    }
    let shown = 0;
    for (const n of names) {
      const run = runs.get(n.manifest);
      const problems: string[] = [];
      // A version shown under a number that is no run, or a run the record doesn't have, is one nobody can account for.
      if (!run) problems.push(`it shows run ${n.run}'s version, ${n.manifest ? `and the record has no run ${shortHash(n.manifest)}` : 'and the engine has no run by that number'}`);
      else if (run.manifest && run.manifest.outputs[n.name]?.key !== n.key) problems.push(`it shows the key ${shortHash(n.key)}, which its run didn't make for it`);
      if (run && heldBy(n.manifest)?.has(n.name)) {
        const rel = engineReleases.find((r) => r.outcome === 'applied' && !backs.has(r.id) && r.run === n.run && r.manifest === n.manifest && r.names[n.name] === n.key && !!r.decision && decided.has(r.decision));
        if (!rel) problems.push(`it shows run ${n.run}'s version, which ${(run.entry.about as { outcome?: string }).outcome === 'held' ? 'the record holds as held' : 'the engine held'}, with no release citing a decision in the record`);
      }
      if (problems.length) say(false, `${n.name} (engine): ${problems.join('; ')}`);
      else shown++;
    }
    if (shown === names.length) say(true, `the engine's ${names.length} dataset name${names.length === 1 ? '' : 's'} show versions their runs in the record made, and no output a run held without a release`);
  }

  // The verdicts told again from the record (ADR 0010 §6, --history): each claim/2 against the tail the record's run
  // entries make before it, the days it left out, its load's measures and the base history the auditor brings.
  if (trust.history) {
    const baseFile = JSON.parse(text(trust.history)) as HistoryFile;
    const base = isHistory(baseFile) ? { file: baseFile, sha256: await sha256Hex(new Uint8Array(trust.history) as Uint8Array<ArrayBuffer>) } : null;
    if (!base) say(false, "the history you gave isn't a smaltfl history");
    // Every run's claim/2, published or held (its entry keeps the claims it was judged by; for an earlier record, its
    // story holds' and the engine's), and every source a run measured with no claim/2 to tell: said, never skipped.
    // A derived run's claims are its held run's (C4), told again at the held run's entry; that they are the same is
    // checked with the derived run itself (its document, snapshot and claims against its held run's).
    const { told: found, untold } = toTell(entries.filter((e) => runs.has(String((e.about as { manifest?: unknown } | null)?.manifest))), (manifest) => (engineHolds.get(manifest)?.judged ?? []).flatMap((j) => ('claim' in j ? [j.claim] : [])));
    const told: Retold[] = found.map((f) => {
      const m = runs.get(f.manifest)?.manifest;
      return { seq: f.seq, claim: f.claim, doc: m ? flowOf(flows, m.flow.hash) : null };
    });
    const period = [...runs.values()].map((x) => (x.plan ? planPeriod(x.plan.publish) : null)).find((x) => x !== null) ?? null;
    const stories = new Map<string, Story>();
    const again = await retellClaims(entries, told.sort((a, b) => a.seq - b.seq), base, period, stories);
    for (const a of again) say(a.problems.length === 0, a.problems.length ? `#${a.seq} (${a.slot}), told again: ${a.problems.join('; ')}` : `#${a.seq} (${a.slot}): its verdict told again from the base, the record's tail and its load's measures says what its claim said`);
    for (const u of untold) say(false, `#${u.seq} (${u.slot}): its entry keeps ${u.source}'s measures and no claim/2 for ${u.source}: the verdict it was published or held by can't be told again`);
    if (!again.length && !untold.length) say(true, 'no claim/2 in the record to tell again');
    // A day published under a standing level (Q-57b, amendment 1 S6): every metric off on it is one the level names, off
    // the way it was on the level's own day, as its story and the level's day's tell them again.
    for (const e of entries.filter((x) => x.kind === 'decide')) {
      const a = e.about as unknown as DecideAbout;
      if (!isRecord(a) || a.option !== 'accept' || a.under === undefined || !isLevel(a.level)) continue;
      const root = entries[a.under]?.about as unknown as DecideAbout | undefined;
      if (!isRecord(root) || !isLevel(root.level)) continue;
      const source = root.level.source.toLowerCase();
      const at = (manifest: string) => {
        const seq = runs.get(manifest)?.entry.seq;
        return seq === undefined ? undefined : stories.get(`${seq}|${source}`);
      };
      const now = at(a.manifest);
      const then = at(root.manifest);
      const where = `decision #${e.seq} (${a.day ?? `run ${a.run}`}, under #${a.under}'s new level)`;
      if (!now || !then) {
        say(false, `${where}: ${!now ? 'its day' : `#${a.under}'s own day`} wasn't told again, so whether the level stands for it can't be checked`);
        continue;
      }
      const stray = levelStray(levelWays(now, then), levelWays(then), root.level.metrics);
      if (stray === null) say(false, `${where}: told again, nothing the level names is off on its day: it is back to the old level, a change again`);
      else say(stray.length === 0, stray.length ? `${where}: told again, it is off besides the level: ${stray.join('; ')}` : `${where}: told again, every metric off on its day is one the level names, off the same way`);
    }
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
 * What is wrong with what the engine kept of what held a run: its holds must be what the run's manifest and its judged
 * sources hold (each claim judged again against the manifest), and what the record says of the run: held by the same
 * holds, or, recorded as published, held by none.
 */
function engineHoldsProblems(kept: EngineHolds, about: unknown, plan: FlowPlan, m: RunManifest, outcome: 'ok' | 'held' | 'derived', derived: EngineRepairs['derived'][number] | undefined, earlier: (l: Load) => number | undefined): string[] {
  const problems: string[] = [];
  const holds = Array.isArray(kept.holds) ? kept.holds : [];
  const judged = Array.isArray(kept.judged) ? kept.judged.filter(isRecord) as Judged[] : [];
  if (!Array.isArray(kept.holds) || !Array.isArray(kept.judged)) problems.push("what the engine kept of what held it isn't shaped as holds and judged sources");
  try {
    const claims = judged.flatMap((j) => ('claim' in j ? [j.claim] : []));
    const again = judgeClaims(plan, claims, factsFromClaims(claims, { rows: (node) => m.nodes.find((n) => n.node === node)?.rows, flow: claimsFlow(claims, m), origin: (node) => plan.nodes[node]?.origin }));
    const same = (x: unknown, y: unknown) => x !== undefined && y !== undefined && canonicalJSON(x as JSONValue) === canonicalJSON(y as JSONValue);
    if (judged.some((j) => 'claim' in j && !same(again.find((k) => k.node === j.node), j))) problems.push("the claims the engine judged it by don't match it");
    if (!same(carry(holdsOf(plan, m, judged), earlier), holds)) problems.push("the engine's holds for it aren't what its manifest and its judged sources hold");
    if (outcome === 'held' && !same((about as Partial<HeldAbout>).holds ?? [], holds)) problems.push("the holds the record names aren't the ones the engine kept");
    // A derived run: what holds it besides, computed again from its plan and its donors as the engine judged them.
    if (outcome === 'derived' && derived) {
      const fills = holdsOf(plan, m, judged, { derived: true, donors: derived.donors }).filter((h) => h.by === 'derived' || h.by === 'donor');
      if (!same(fills, derived.holds)) problems.push("the engine's holds for it as a derived run aren't what its plan and its donors hold");
      if (!same((about as Partial<DerivedAbout>).holds ?? [], [...holds, ...derived.holds])) problems.push("the holds the record names aren't the ones the engine kept");
    }
  } catch (e) {
    problems.push(`what the engine kept of what held it can't be read: ${(e as Error).message}`);
  }
  if (outcome === 'ok' && holds.length) problems.push(`it was recorded as published, and the engine held it (${holds.map((x) => (isRecord(x) ? String(x.origin) : '?')).join(', ')})`);
  return problems;
}

/**
 * The flow hash a run's claim/2 must be told under: its own, or for a derived run its held run's (C4), which the audit
 * checks apart (derivedProblems: the same snapshot, its document the held run's repaired).
 */
function claimsFlow(claims: readonly Claim[], m: RunManifest): string {
  const told = claims.find(isClaim2)?.flow;
  return told !== undefined && told !== m.flow.hash ? told : m.flow.hash;
}

/** What a run's checks hold, from its manifest's counts alone: none for a plan that doesn't hold on its checks. */
function checksHolds(plan: FlowPlan, m: RunManifest): Hold[] {
  const pub = plan.publish;
  return pub ? holdsOf({ ...plan, publish: { ...pub, hold: pub.hold.filter((k) => k === 'checks'), watch: [] } }, m, []) : [];
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
  const holds = Array.isArray(a.holds) ? (a.holds as RunHold[]) : [];
  if (holds.length === 0) problems.push('it was held, and names nothing that held it');
  const checks = checksHolds(plan, m);
  const stated = holds.filter((h) => h.by === 'checks');
  if (JSON.stringify(checks.map((h) => [h.node, h.said])) !== JSON.stringify(stated.map((h) => [h.node, h.said]))) problems.push("the checks it says held it aren't what its manifest's counts hold");
  const claims = holds.flatMap((h) => (h.by === 'story' && h.claim ? [h.claim] : []));
  const judged = judgeClaims(plan, claims, factsFromClaims(claims, { rows: (node) => m.nodes.find((n) => n.node === node)?.rows, flow: claimsFlow(claims, m), origin: (node) => plan.nodes[node]?.origin }));
  for (const h of holds.filter((x) => x.by === 'story' || x.by === 'unjudged')) {
    if (!watchesOf(pub).some((w) => w.node === h.node)) problems.push(`it says ${h.origin} held it, which the plan doesn't watch`);
    else if (h.by === 'story') {
      const j = judged.find((x) => x.node === h.node);
      if (!h.claim || !j || 'unjudged' in j) problems.push(`its claim for ${h.origin} doesn't match the run${j && 'unjudged' in j ? `: ${j.unjudged}` : ''}`);
      else if (!claimHolds(pub.hold, h.claim)) problems.push(`its claim for ${h.origin} doesn't hold under ${pub.hold.join(', ')}`);
    }
  }
  const held = new Set(heldOutputs(plan, holds));
  const keys = isKeys(a.keys) ? a.keys : {};
  const bad = Object.entries(keys).filter(([name, key]) => !held.has(name) || m.outputs[name]?.key !== key).map(([name]) => name);
  const missing = [...held].filter((name) => m.outputs[name] && !Object.hasOwn(keys, name));
  if (!isKeys(a.keys) || Object.keys(keys).length === 0) problems.push('it names no staged keys');
  else if (bad.length) problems.push(`the keys it names for ${bad.join(', ')} aren't the ones it held`);
  else if (missing.length) problems.push(`it names no staged key for ${missing.join(', ')}, which it held`);
  const waiting = Array.isArray(a.waiting) ? a.waiting : [];
  if (waiting.some((w) => typeof w !== 'string' || !Object.hasOwn(keys, w))) problems.push('it says an output waits that it names no key for');
  return `; held by ${holds.map((h) => `${h.origin} (${h.by === 'checks' ? 'its checks' : h.by === 'unjudged' ? 'not judged' : h.said})`).join(', ')}, ${waiting.length} output${waiting.length === 1 ? '' : 's'} waiting`;
}

/** Whether an entry is a decision to fill, or to publish the part that arrived. */
function remedyOf(e: LogEntry | undefined): boolean {
  const o = e?.kind === 'decide' && isRecord(e.about) ? e.about.option : null;
  return o === 'fill' || o === 'complete';
}

/** A checkpoint's size and root, said. */
export const checkpointSays = (env: SignedCheckpoint) => {
  const c = parseCheckpoint(env.checkpoint);
  return `${c.origin} at ${c.size} entries, root ${c.root}`;
};
