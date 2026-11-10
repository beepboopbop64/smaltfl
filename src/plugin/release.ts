/**
 * Releasing a held run (ADR 0009 §5): publishing what a run held, as a decision recorded first says, in one
 * transaction. The plugin checks the decision against the run itself, not against what the caller says of it:
 *
 * - the run is the one the caller means (its manifest hash), and its stored manifest still has that hash;
 * - its plan holds, and something held it;
 * - the decision's actor may take that option under the policies stored with the run (core/policy.ts checkDecision);
 * - publish as is (and accept the new level, which publishes as it does, amendment 1 S6) has a reason, and the decision
 *   is a record entry's leaf;
 * - each output it names is held by the run, with the staged key the decision names, and not yet released; and every
 *   held output it leaves out already shows the run's version, so the outputs never show different days;
 * - no later day, by the plan's period parameter, is current for a name it would point (without a period, no later
 *   run): a release never moves a name back.
 *
 * A fill, or the part that arrived (ADR 0009 amendment 1 S10), releases the derived run its decision made, and is
 * checked against the held run it repairs as well: that run is held here, of the same day; the derived run's document
 * is the repair of that run's document; it read the same snapshot of the watched source, and the donor's file the
 * repair names, its donor judged good; and nothing holds it but the held run's story and its being derived (a filled
 * day whose checks trip isn't released). A replacement (a better donor, the other remedy) may move a name from an
 * earlier version of the same day. What each name showed before is kept (`_smaltfl_repairs`), and a withdrawal (a
 * decision not to publish with `withdraws`, Q-61) points each name back to it, unless a later day is current.
 *
 * Then it points the names and keeps the release. A refusal is kept too, and returned, never thrown: what was asked and
 * why it was refused are part of the record of the day.
 */
import type { Database } from 'smaltdb/engine';
import type { FlowDocument } from '../core/document.js';
import { repairDocument, type Repair } from '../core/fill.js';
import { byLoad, donorGood, heldOutputs, inputsKey, inputsOf, isLoad, loadKey, loadsOf, type Hold, type RunRef } from '../core/hold.js';
import { manifestHash, policiesHash, type RunManifest } from '../core/manifest.js';
import { flowHash, planPeriod, plannedDonor, watchesOf, type FlowPlan } from '../core/plan.js';
import { checkDecision, DECIDE_OPTIONS, type DecisionOption } from '../core/policy.js';
import type { ReleaseInput, ReleaseResult } from '../core/protocol.js';
import { currentOf, derivedOf, ensureStore, findVersion, holdsOfRun, inTransaction, nameInUse, pointDataset, recordRelease, recordRepair, recordWithdrawal, releasesOf, repairOf, withdrawalsOf, type Shown, type StoredDerived, type StoredRelease } from './store.js';

const HEX64 = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (h: string) => `${h.slice(0, 16)}…`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What a release asks, as far as it can be read: a refusal keeps it as asked. */
function asked(input: unknown): Omit<StoredRelease, 'id' | 'outcome' | 'why' | 'at'> {
  const i = isRecord(input) ? input : {};
  const keys = isRecord(i.keys) ? Object.fromEntries(Object.entries(i.keys).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return { run: Number.isSafeInteger(i.run) ? (i.run as number) : null, manifest: text(i.manifest), names: keys, option: text(i.option), actor: text(i.actor), reason: text(i.reason), decision: text(i.decision) };
}

const isRunRef = (v: unknown): v is RunRef => isRecord(v) && Number.isSafeInteger(v.run) && typeof v.manifest === 'string' && HEX64.test(v.manifest);

/** Why a release's input isn't shaped as one, or null. */
function shapeProblem(input: unknown): string | null {
  if (!isRecord(input)) return 'a release names the run, its manifest, the keys, the option, the actor, the reason and the decision';
  if (!Number.isSafeInteger(input.run)) return 'it names no run';
  if (typeof input.manifest !== 'string' || !HEX64.test(input.manifest)) return "it doesn't name the run's manifest by its hash";
  if (!isRecord(input.keys) || Object.keys(input.keys).length === 0 || Object.values(input.keys).some((k) => typeof k !== 'string' || !HEX64.test(k))) return 'it names no outputs with their keys';
  if (!(DECIDE_OPTIONS as readonly unknown[]).includes(input.option)) return `${String(input.option)} is not an option for a held day`;
  if (typeof input.actor !== 'string' || input.actor === '') return 'it names no one who decided';
  if (input.reason !== null && input.reason !== undefined && typeof input.reason !== 'string') return 'its reason is not text';
  if (input.withdraws !== undefined && (!Number.isSafeInteger(input.withdraws) || input.option !== 'dont')) return 'a withdrawal is a decision not to publish, naming the release it takes back by its number';
  if ((input.option === 'fill' || input.option === 'complete') && (!isRunRef(input.from) || !isRecord(input.repair))) return `${String(input.option)} releases a derived run: it names the held run it repairs (from) and the repair`;
  if (input.meanwhile !== undefined && typeof input.meanwhile !== 'boolean') return 'meanwhile is true or false';
  if (input.loads !== undefined) {
    const ls = input.loads;
    if (!Array.isArray(ls) || ls.length === 0) return 'loads lists the decisions it applies, one a load';
    for (const [k, x] of ls.entries()) {
      if (!isRecord(x) || !isLoad(x.load) || !(DECIDE_OPTIONS as readonly unknown[]).includes(x.option) || typeof x.actor !== 'string' || x.actor === '' || !(x.reason === null || typeof x.reason === 'string') || typeof x.decision !== 'string' || !HEX64.test(x.decision))
        return `loads[${k}] isn't a decision about a load: { load: { source, slot, sha256 }, option, actor, reason, decision }`;
    }
    const first = ls[0] as Record<string, unknown>;
    if (first.option !== input.option || first.actor !== input.actor || (first.reason ?? null) !== (input.reason ?? null) || first.decision !== input.decision) return "the release's option, actor, reason and decision are its first load's decision's";
  }
  return null;
}

/**
 * Why a run of a flow that watches several sources can't be released as asked (ADR 0010 §7), or null: each decision is
 * about a load the run read (its source's file and its slot parameter) and held, may be taken by its actor, publishes
 * (with a reason), and is cited once; each name it releases waits only for the loads it cites (a hold of no load, or
 * of another, keeps it back). `heldBy` is each held output's holds.
 */
function loadsProblem(r: ReleaseInput, run: Stored, holds: readonly Hold[], doc: FlowDocument): string | null {
  const ls = r.loads;
  if (!ls) return `run ${r.run} watches several sources: a release of it names the decisions it applies, one a load (loads)`;
  const read = new Map([...loadsOf(run.plan, run.manifest).values()].map((l) => [loadKey(l), l]));
  const holding = new Set(holds.flatMap((h) => (h.load ? [loadKey(h.load)] : [])));
  const cited = new Set<string>();
  for (const x of ls) {
    const k = loadKey(x.load);
    const name = `${x.load.source}'s ${x.load.slot} load`;
    if (cited.has(k)) return `it cites two decisions about ${name}`;
    cited.add(k);
    if (!read.has(k)) return `run ${r.run} didn't read ${name} (${short(x.load.sha256)}): a decision is applied to a run that read its load`;
    if (!holding.has(k)) return `${name} doesn't hold run ${r.run}: there is nothing of it to release`;
    if (x.option !== 'asis' && x.option !== 'accept' && !(r.option === 'fill' || r.option === 'complete')) return `the decision about ${name} is ${x.option}, which publishes nothing`;
    if ((x.option === 'asis' || x.option === 'accept') && (typeof x.reason !== 'string' || x.reason.trim() === '')) return `${x.option === 'asis' ? 'publish as is' : 'accept the new level'} needs a reason (${name})`;
    const may = checkDecision(doc.policies, x.actor, x.option);
    if (!may.allowed) return may.reason;
  }
  if ((r.option === 'fill' || r.option === 'complete') && ls.length !== 1) return `${r.option === 'fill' ? 'a fill' : 'the part that arrived'} is about one load, and it cites ${ls.length}`;
  for (const name of Object.keys(r.keys).sort()) {
    const other = holds.find((h) => h.reaches.includes(name) && !(h.load && cited.has(loadKey(h.load))));
    if (other) return `${name} waits for ${other.origin} (${other.by === 'checks' ? 'its checks' : other.by === 'story' ? other.said : 'not judged'}${other.load ? `, its ${other.load.slot} load` : ''}), which no decision it cites is about`;
  }
  return null;
}

/** Whether a run's periods are any of them later than another's, or all the same (ADR 0010 §7: each watched source's
 * period only moves forward, compared parameter by parameter). */
function periodsAfter(a: RunManifest['parameters'], b: RunManifest['parameters'], periods: readonly string[]): 'later' | 'same' | 'earlier' {
  let same = true;
  for (const p of periods) {
    const x = a[p];
    const y = b[p];
    if (typeof x === 'string' && typeof y === 'string' && x > y) return 'later';
    if (x !== y) same = false;
  }
  return same ? 'same' : 'earlier';
}

/** A stored run: its manifest and hash, its plan, and the flow document and its text, read before a transaction. */
interface Stored {
  manifest: RunManifest;
  text: string;
  hash: string;
  plan: FlowPlan;
  docText: string | null;
  doc: FlowDocument | null;
}

/** A run as stored here, or why it can't be used. */
async function storedRun(db: Database, run: number, manifest: string): Promise<Stored | string> {
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [run]).rows[0];
  if (!row) return `no run ${run} in this database`;
  const text = String(row[0]);
  const hash = String(row[1]);
  if (hash !== manifest) return `run ${run} here is the manifest ${short(hash)}, not the ${short(manifest)} the decision names`;
  const m = JSON.parse(text) as RunManifest;
  if ((await manifestHash(m)) !== hash) return `run ${run}'s stored manifest doesn't hash to its recorded hash`;
  const planRow = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [m.plan]).rows[0];
  if (!planRow) return `run ${run}'s plan is no longer stored`;
  const plan = JSON.parse(String(planRow[0])) as FlowPlan;
  const docRow = db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [plan.flow.hash]).rows[0];
  const docText = docRow ? String(docRow[0]) : null;
  return { manifest: m, text, hash, plan, docText, doc: docText === null ? null : (JSON.parse(docText) as FlowDocument) };
}

/**
 * What a derived run's donor read, as a repair names it: the file the engine opened (its sha256 and size), or, for a
 * donor read from a table, its snapshot's content hash, as a run's inputs name a source read from a table.
 */
export function donorRead(m: RunManifest, node: number): { sha256: string; bytes: number | null } | null {
  const n = m.nodes.find((x) => x.node === node);
  if (n?.file) return { sha256: n.file.sha256, bytes: n.file.bytes };
  return n?.content ? { sha256: n.content, bytes: null } : null;
}

/** Whether a stored run read the same inputs as a held run (its flow, parameters and sources): the same day's version. */
function sameInputs(db: Database, run: number, held: Stored): boolean {
  const row = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [run]).rows[0];
  return !!row && inputsKey(inputsOf(JSON.parse(String(row[0])) as RunManifest)) === inputsKey(inputsOf(held.manifest));
}

/** The value of a run's period parameter, read from its stored manifest; undefined when the run isn't stored. */
function dayOfRun(db: Database, run: number, period: string): string | null | undefined {
  const row = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [run]).rows[0];
  if (!row) return undefined;
  const v = (JSON.parse(String(row[0])) as RunManifest).parameters[period];
  return typeof v === 'string' ? v : null;
}

/**
 * Why a derived run isn't the repair its release says (amendment 1 S10), checked against the held run it repairs; or
 * null. Read before the transaction, since hashing is asynchronous: `from` and the derived run can't change in between
 * without the transaction seeing their stored text change.
 */
async function repairProblem(db: Database, r: ReleaseInput, run: Stored, d: StoredDerived, held: Stored): Promise<string | null> {
  const repair = r.repair as Repair;
  if (repair.kind !== r.option) return `the repair is a ${repair.kind === 'fill' ? 'fill' : 'complete part'}, and the decision says ${r.option}`;
  if (d.from.run !== r.from!.run || d.from.manifest !== r.from!.manifest) return `run ${r.run} repairs run ${d.from.run} (${short(d.from.manifest)}), not the run ${r.from!.run} the decision names`;
  const kept = holdsOfRun(db, d.from.run);
  if (!kept || kept.holds.length === 0) return `run ${d.from.run} isn't a held run here: there is nothing to repair`;
  if (derivedOf(db, d.from.run)) return `run ${d.from.run} is a derived run itself: a repair is made from the held run`;
  const period = planPeriod(run.plan.publish);
  if (period === null || held.manifest.parameters[period] !== run.manifest.parameters[period]) return `run ${r.run} isn't of run ${d.from.run}'s day`;
  // Several watched sources: of the same slot of each (ADR 0010 §7).
  for (const w of watchesOf(run.plan.publish)) if (w.period !== null && held.manifest.parameters[w.period] !== run.manifest.parameters[w.period]) return `run ${r.run} isn't of run ${d.from.run}'s ${w.period}`;
  // The derived document: the repair of the held run's own document, compared by flow hash.
  if (!held.doc || !run.doc) return "the held run's flow document, or the derived run's, isn't stored, so the repair can't be checked";
  let rebuilt: FlowDocument;
  try {
    rebuilt = repairDocument(held.doc, repair);
  } catch (e) {
    return `the repair doesn't apply to run ${d.from.run}'s flow: ${(e as Error).message}`;
  }
  if ((await flowHash(rebuilt)) !== run.plan.flow.hash) return `run ${r.run}'s document isn't run ${d.from.run}'s repaired as the decision says`;
  // What arrived is what arrived: the watched source's snapshot is the held run's.
  const source = run.manifest.nodes.find((n) => n.op === 'table' && n.origin.toLowerCase() === repair.source.toLowerCase());
  const was = held.manifest.nodes.find((n) => n.op === 'table' && n.origin.toLowerCase() === repair.source.toLowerCase());
  if (!source || !was || source.content !== was.content) return `run ${r.run} read another ${repair.source} than run ${d.from.run} did`;
  // The donor's file is the one the repair names, and the donor was judged good.
  if (repair.donor) {
    const fill = run.plan.nodes.find((n) => n.op === 'fill' && n.origin === repair.step);
    const donorNode = fill && fill.inputs.length === 2 ? fill.inputs[1]! : -1;
    const read = donorRead(run.manifest, donorNode);
    if (!read || read.sha256 !== repair.donor.file.sha256 || (read.bytes !== null && read.bytes !== repair.donor.file.bytes)) return `run ${r.run}'s donor read ${read ? short(read.sha256) : 'nothing'}, not the ${repair.donor.day} file the repair names`;
    const judged = d.donors.find((j) => j.node === donorNode);
    if (!judged || !('claim' in judged) || !donorGood(judged.claim)) return `its donor, ${repair.donor.day}, wasn't judged good${judged && 'unjudged' in judged ? `: ${judged.unjudged}` : ''}`;
  }
  // Held by nothing but the held run's story (its claims, the same) and its being derived.
  const own = holdsOfRun(db, r.run);
  const checks = own?.holds.find((h: Hold) => h.by === 'checks');
  if (checks) return `the filled day fails its checks: ${checks.said}`;
  const other = [...(own?.holds ?? []).filter((h) => h.by !== 'story'), ...d.holds.filter((h) => h.by !== 'derived')];
  if (other.length) return `run ${r.run} is held by ${other.map((h) => `${h.origin} (${h.said})`).join(', ')}`;
  const claims = (hs: readonly Hold[]) => hs.filter((h) => h.by === 'story').map((h) => [h.node, h.claim]);
  if (!same(claims(own?.holds ?? []), claims(kept.holds.filter((h) => h.by === 'story')))) return `run ${r.run}'s story isn't run ${d.from.run}'s`;
  // A meanwhile release: the held run's plan sets the setting to this option, and the repair is its donor rule, before.
  if (r.meanwhile) {
    const pub = held.plan.publish;
    if (pub?.meanwhile !== r.option) return `run ${d.from.run}'s flow doesn't set meanwhile to ${r.option}`;
    const rule = plannedDonor(pub, held.plan.nodes.findIndex((n) => n.op === 'table' && n.origin.toLowerCase() === repair.source.toLowerCase()));
    if (repair.donor && (repair.donor.direction !== 'before' || repair.donor.rule !== rule)) return `meanwhile fills by the flow's rule, before: ${rule}, not ${repair.donor.rule} ${repair.donor.direction}`;
  }
  return null;
}

export async function release(db: Database, input: unknown): Promise<ReleaseResult> {
  ensureStore(db);
  const ask = asked(input);
  const refuse = (why: string): ReleaseResult => {
    const id = recordRelease(db, { ...ask, outcome: 'refused', why, at: new Date().toISOString() });
    return { outcome: 'refused', why, release: id, published: [] };
  };
  const shape = shapeProblem(input);
  if (shape) return refuse(shape);
  const r = input as unknown as ReleaseInput;
  if (r.option === 'dont' && r.withdraws === undefined) return refuse("only publish as is is released: don't publish is a decision, and publishes nothing");
  if (typeof r.decision !== 'string' || !HEX64.test(r.decision)) return refuse("the decision isn't a record entry's leaf (64 hex characters)");
  if (r.option === 'asis' && (typeof r.reason !== 'string' || r.reason.trim() === '')) return refuse('publish as is needs a reason');
  // Accept the new level is released as publish as is is (amendment 1 S6), with its option and a reason.
  if (r.option === 'accept' && (typeof r.reason !== 'string' || r.reason.trim() === '')) return refuse('accept the new level needs a reason');

  // What hashing needs, read before the transaction (WebCrypto is asynchronous); the transaction reads it again and
  // refuses if it changed in between.
  const stored = await storedRun(db, r.run, r.manifest);
  if (typeof stored === 'string') return refuse(stored);
  const { manifest, plan, doc, docText } = stored;
  const policies = doc ? await policiesHash(doc.policies) : null;
  const derived = derivedOf(db, r.run);
  if (r.withdraws !== undefined) return withdraw(db, r, stored, policies);
  const refusedFile = manifest.nodes.find((m) => m.status === 'refused');
  if (refusedFile) return refuse(`run ${r.run} built nothing: ${refusedFile.origin}'s file was refused (${refusedFile.refused ?? 'as declared'}), so there is nothing to publish; the day waits for a corrected file`);
  if ((r.option === 'asis' || r.option === 'accept') && derived) return refuse(`run ${r.run} is a derived run: it is released as the fill or the part its decision names`);
  let held: Stored | null = null;
  if (r.option === 'fill' || r.option === 'complete') {
    if (!derived) return refuse(`run ${r.run} isn't a derived run: ${r.option === 'fill' ? 'a fill' : 'the part that arrived'} releases the run its decision derived`);
    const from = await storedRun(db, r.from!.run, r.from!.manifest);
    if (typeof from === 'string') return refuse(from);
    held = from;
    const problem = await repairProblem(db, r, stored, derived, from);
    if (problem) return refuse(problem);
  }

  return inTransaction(db, (): ReleaseResult => {
    const again = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [r.run]).rows[0];
    const docAgain = db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [plan.flow.hash]).rows[0];
    const heldAgain = held ? db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [r.from!.run]).rows[0] : null;
    const before: Record<string, Shown> = {};
    const why = ((): string | { names: string[] } => {
      if (!again || String(again[0]) !== stored.text || String(again[1]) !== stored.hash || (docAgain ? String(docAgain[0]) : null) !== docText) return `run ${r.run} changed while its release was checked`;
      if (held && (!heldAgain || String(heldAgain[0]) !== held.text)) return `run ${r.from!.run} changed while its release was checked`;
      if (!plan.publish) return `run ${r.run}'s plan doesn't hold: there is nothing to release`;
      const kept = holdsOfRun(db, r.run);
      if (!kept) return `run ${r.run} has no record of what held it`;
      const fills = derived?.holds ?? [];
      if (kept.holds.length === 0 && fills.length === 0) return `nothing held run ${r.run}: its outputs were published as it ran`;
      // Who may decide, under the policies stored with the run: never the caller's word for them.
      if (!doc) return `run ${r.run}'s flow document isn't stored with it, so who may decide can't be checked`;
      if (policies !== manifest.flow.policies) return `the stored flow document's policies aren't the ones run ${r.run} recorded`;
      const may = checkDecision(doc.policies, r.actor, r.option as DecisionOption);
      if (!may.allowed) return may.reason;
      // Several watched sources: each load decided once, and a name released only by the decisions it waits for.
      const several = byLoad(plan.publish);
      if (several) {
        const problem = loadsProblem(r, stored, kept.holds, doc);
        if (problem) return problem;
      } else if (r.loads !== undefined) return `run ${r.run} watches one source: its decisions are about its day, not loads`;
      const heldNames = new Set(heldOutputs(plan, [...kept.holds, ...fills]));
      const names = Object.keys(r.keys).sort();
      const outputs = new Set(plan.outputs.map((o) => o.name));
      for (const name of names) {
        if (!outputs.has(name)) return `${name} isn't an output of run ${r.run}`;
        if (!heldNames.has(name)) return `run ${r.run} doesn't hold ${name}`;
        const staged = manifest.outputs[name]!.key;
        if (staged !== r.keys[name]) return `${name}'s staged key is ${short(staged)}, not the ${short(r.keys[name]!)} the decision names`;
      }
      // Released once: a fill released again after a withdrawal took it back may go out again. A withdrawal's own
      // release names what it took back, and published none of it.
      const withdrawals = withdrawalsOf(db);
      const withdrawn = new Set(withdrawals.map((w) => w.withdraws));
      const backs = new Set(withdrawals.map((w) => w.release));
      for (const earlier of releasesOf(db, r.run)) {
        const twice = names.find((n) => earlier.outcome === 'applied' && Object.hasOwn(earlier.names, n) && !withdrawn.has(earlier.id) && !backs.has(earlier.id));
        if (twice) return `${twice} was already released, by release ${earlier.id}`;
      }
      // A withdrawn decision stays withdrawn (Q-61, S5): only a new decision applies the fill again, never the one a
      // withdrawal took back, whichever run it is cited for.
      const taken = releasesOf(db).find((x) => x.outcome === 'applied' && withdrawn.has(x.id) && x.decision === r.decision);
      if (taken) return `the decision it cites was withdrawn (release ${withdrawals.find((w) => w.withdraws === taken.id)!.release} took release ${taken.id} back): a new decision may apply it again, not that one`;
      // Publish as is can't be taken back (§12, S5): a day readers have as it arrived, or at its new level, is never
      // filled or replaced with the part alone afterwards.
      if (held) {
        const sameDay = (run: number | null) => run !== null && (run === r.from!.run || sameInputs(db, run, held!));
        const asis = releasesOf(db).find((x) => x.outcome === 'applied' && (x.option === 'asis' || x.option === 'accept') && sameDay(x.run));
        if (asis) return `run ${r.from!.run}'s day was published ${asis.option === 'accept' ? 'at its new level' : 'as is'} by release ${asis.id}, which can't be taken back`;
      }
      // Together: what the decision leaves out must already show the run's version, or the outputs would show two days.
      // With several watched sources, only of the names its loads alone keep back: the rest wait for other loads.
      const cites = new Set((r.loads ?? []).map((x) => loadKey(x.load)));
      const freed = (name: string) => !several || kept.holds.filter((h) => h.reaches.includes(name)).every((h) => h.load && cites.has(loadKey(h.load)));
      for (const name of [...heldNames].sort()) {
        if (Object.hasOwn(r.keys, name) || !freed(name)) continue;
        if (currentOf(db, name)?.key !== manifest.outputs[name]!.key) return `the decision leaves out ${name}, which run ${r.run} holds with another version than its name shows`;
      }
      // A release never moves a name back: no later day (or, without a period, no later run) is current for it. A
      // fill or the part alone replaces any version of its own day, whatever order the runs were made in.
      const period = planPeriod(plan.publish);
      const day = period === null ? null : manifest.parameters[period];
      const periods = [...new Set(watchesOf(plan.publish).flatMap((w) => (w.period === null ? [] : [w.period])))];
      for (const name of names) {
        const cur = currentOf(db, name);
        if (!cur || cur.run === r.run) continue;
        if (several) {
          const row = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [cur.run]).rows[0];
          if (!row) return `${name} shows run ${cur.run}, which isn't in this database`;
          const was = periodsAfter((JSON.parse(String(row[0])) as RunManifest).parameters, manifest.parameters, periods);
          if (was === 'later') return `a later load is current for ${name} (run ${cur.run}): a release never moves a name back`;
          if (!held && was === 'same' && cur.run > r.run) return `a later run of the same loads (run ${cur.run}) is current for ${name}`;
          continue;
        }
        if (typeof day === 'string') {
          const curDay = dayOfRun(db, cur.run, period!);
          if (curDay === undefined) return `${name} shows run ${cur.run}, which isn't in this database`;
          if (curDay !== null && curDay > day) return `${curDay} is current for ${name} (run ${cur.run}): a release never moves a name back to an earlier day`;
          if (!held && (curDay === day || curDay === null) && cur.run > r.run) return `a later run of ${curDay ?? 'another day'} (run ${cur.run}) is current for ${name}`;
        } else if (cur.run > r.run) return `a later run (run ${cur.run}) is current for ${name}`;
      }
      for (const name of names) {
        const used = nameInUse(db, name);
        if (used && !used.ours) return `a ${used.type} named ${name} already exists and is not a smaltfl dataset`;
        if (!findVersion(db, r.keys[name]!)) return `${name}'s staged version is no longer stored`;
        before[name] = currentOf(db, name);
      }
      return { names };
    })();
    const at = new Date().toISOString();
    if (typeof why === 'string') return { outcome: 'refused', why, release: recordRelease(db, { ...ask, outcome: 'refused', why, at }), published: [] };
    for (const name of why.names) pointDataset(db, name, r.keys[name]!, findVersion(db, r.keys[name]!)!.table, r.run);
    const id = recordRelease(db, { ...ask, names: Object.fromEntries(why.names.map((n) => [n, r.keys[n]!])), outcome: 'applied', why: null, at });
    if (derived) recordRepair(db, { release: id, run: r.run, from: derived.from, repair: r.repair as Repair, before });
    return { outcome: 'applied', why: null, release: id, published: why.names, ...(derived ? { filled: derived.filled } : {}) };
  });
}

/**
 * A withdrawal (Q-61): a decision not to publish that takes back a fill, or the part that arrived, readers have. The
 * release it names was applied here, of a derived run, with these names and keys; each name still shows that
 * release's version (with a later day current, the names stay on it: refused, the decision stays recorded); the actor
 * may take don't publish; and each name goes back to the version it showed before that release, which must be stored.
 * The withdrawal's own release names what it took back; `_smaltfl_withdrawals` says which release.
 */
function withdraw(db: Database, r: ReleaseInput, run: Stored, policies: string | null): ReleaseResult {
  return inTransaction(db, (): ReleaseResult => {
    const ask = asked(r);
    const back: Record<string, { key: string; run: number; table: string }> = {};
    const why = ((): string | null => {
      const again = db.query('SELECT hash FROM _smaltfl_runs WHERE id = ?', [r.run]).rows[0];
      if (!again || String(again[0]) !== run.hash) return `run ${r.run} changed while its withdrawal was checked`;
      const taken = releasesOf(db).find((x) => x.id === r.withdraws);
      const repair = repairOf(db, r.withdraws!);
      if (!taken || taken.outcome !== 'applied' || !repair) return `release ${r.withdraws} isn't an applied release of a fill or a part here: there is nothing to withdraw`;
      if (taken.run !== r.run || taken.manifest !== r.manifest || !same(Object.entries(taken.names).sort(), Object.entries(r.keys).sort())) return `release ${r.withdraws} released other outputs, or another run, than the withdrawal names`;
      if (withdrawalsOf(db).some((w) => w.withdraws === r.withdraws)) return `release ${r.withdraws} was withdrawn already`;
      if (!run.doc) return `run ${r.run}'s flow document isn't stored with it, so who may decide can't be checked`;
      if (policies !== run.manifest.flow.policies) return `the stored flow document's policies aren't the ones run ${r.run} recorded`;
      const may = checkDecision(run.doc.policies, r.actor, 'dont');
      if (!may.allowed) return may.reason;
      const period = planPeriod(run.plan.publish);
      const day = period === null ? null : run.manifest.parameters[period];
      for (const [name, key] of Object.entries(r.keys).sort()) {
        const cur = currentOf(db, name);
        if (!cur || cur.key !== key || cur.run !== r.run) {
          const curDay = cur && period ? dayOfRun(db, cur.run, period) : null;
          if (typeof day === 'string' && typeof curDay === 'string' && curDay > day) return `${curDay} is current for ${name} (run ${cur!.run}): a withdrawal never moves a name back past a later day`;
          return `${name} no longer shows release ${r.withdraws}'s version`;
        }
        const was = repair.before[name];
        if (!was) return `nothing was published for ${name} before release ${r.withdraws}: there is no version to go back to`;
        const v = findVersion(db, was.key);
        if (!v) return `${name}'s version before release ${r.withdraws} is no longer stored`;
        back[name] = { key: was.key, run: was.run, table: v.table };
      }
      return null;
    })();
    const at = new Date().toISOString();
    if (why) return { outcome: 'refused', why, release: recordRelease(db, { ...ask, outcome: 'refused', why, at }), published: [] };
    const names = Object.keys(back).sort();
    for (const name of names) pointDataset(db, name, back[name]!.key, back[name]!.table, back[name]!.run);
    const id = recordRelease(db, { ...ask, outcome: 'applied', why: null, at });
    recordWithdrawal(db, id, r.withdraws!);
    return { outcome: 'applied', why: null, release: id, published: names };
  });
}
