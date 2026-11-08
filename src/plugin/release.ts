/**
 * Releasing a held run (ADR 0009 §5): publishing what a run held, as a decision recorded first says, in one
 * transaction. The plugin checks the decision against the run itself, not against what the caller says of it:
 *
 * - the run is the one the caller means (its manifest hash), and its stored manifest still has that hash;
 * - its plan holds, and something held it;
 * - the decision's actor may take that option under the policies stored with the run (core/policy.ts checkDecision);
 * - publish as is has a reason, and the decision is a record entry's leaf;
 * - each output it names is held by the run, with the staged key the decision names, and not yet released; and every
 *   held output it leaves out already shows the run's version, so the outputs never show different days;
 * - no later day, by the plan's period parameter, is current for a name it would point (without a period, no later
 *   run): a release never moves a name back.
 *
 * Then it points the names at the run's versions and keeps the release. A refusal is kept too, and returned, never
 * thrown: what was asked and why it was refused are part of the record of the day.
 */
import type { Database } from 'smaltdb/engine';
import type { FlowDocument } from '../core/document.js';
import { heldOutputs } from '../core/hold.js';
import { manifestHash, policiesHash, type RunManifest } from '../core/manifest.js';
import type { FlowPlan } from '../core/plan.js';
import { checkDecision, DECIDE_OPTIONS, type DecideOption } from '../core/policy.js';
import type { ReleaseInput, ReleaseResult } from '../core/protocol.js';
import { currentOf, ensureStore, findVersion, holdsOfRun, inTransaction, nameInUse, pointDataset, recordRelease, releasesOf, type StoredRelease } from './store.js';

const HEX64 = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const short = (h: string) => `${h.slice(0, 16)}…`;

/** What a release asks, as far as it can be read: a refusal keeps it as asked. */
function asked(input: unknown): Omit<StoredRelease, 'id' | 'outcome' | 'why' | 'at'> {
  const i = isRecord(input) ? input : {};
  const keys = isRecord(i.keys) ? Object.fromEntries(Object.entries(i.keys).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  return { run: Number.isSafeInteger(i.run) ? (i.run as number) : null, manifest: text(i.manifest), names: keys, option: text(i.option), actor: text(i.actor), reason: text(i.reason), decision: text(i.decision) };
}

/** Why a release's input isn't shaped as one, or null. */
function shapeProblem(input: unknown): string | null {
  if (!isRecord(input)) return 'a release names the run, its manifest, the keys, the option, the actor, the reason and the decision';
  if (!Number.isSafeInteger(input.run)) return 'it names no run';
  if (typeof input.manifest !== 'string' || !HEX64.test(input.manifest)) return "it doesn't name the run's manifest by its hash";
  if (!isRecord(input.keys) || Object.keys(input.keys).length === 0 || Object.values(input.keys).some((k) => typeof k !== 'string' || !HEX64.test(k))) return 'it names no outputs with their keys';
  if (!(DECIDE_OPTIONS as readonly unknown[]).includes(input.option)) return `${String(input.option)} is not an option for a held day`;
  if (typeof input.actor !== 'string' || input.actor === '') return 'it names no one who decided';
  if (input.reason !== null && input.reason !== undefined && typeof input.reason !== 'string') return 'its reason is not text';
  return null;
}

/** The value of a run's period parameter, read from its stored manifest; undefined when the run isn't stored. */
function dayOfRun(db: Database, run: number, period: string): string | null | undefined {
  const row = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [run]).rows[0];
  if (!row) return undefined;
  const v = (JSON.parse(String(row[0])) as RunManifest).parameters[period];
  return typeof v === 'string' ? v : null;
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
  if (r.option !== 'asis') return refuse("only publish as is is released: don't publish is a decision, and publishes nothing");
  if (typeof r.decision !== 'string' || !HEX64.test(r.decision)) return refuse("the decision isn't a record entry's leaf (64 hex characters)");
  if (typeof r.reason !== 'string' || r.reason.trim() === '') return refuse('publish as is needs a reason');

  // What hashing needs, read before the transaction (WebCrypto is asynchronous); the transaction reads it again and
  // refuses if it changed in between.
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [r.run]).rows[0];
  if (!row) return refuse(`no run ${r.run} in this database`);
  const stored = { manifest: String(row[0]), hash: String(row[1]) };
  if (stored.hash !== r.manifest) return refuse(`run ${r.run} here is the manifest ${short(stored.hash)}, not the ${short(r.manifest)} the decision names`);
  const manifest = JSON.parse(stored.manifest) as RunManifest;
  if ((await manifestHash(manifest)) !== stored.hash) return refuse(`run ${r.run}'s stored manifest doesn't hash to its recorded hash`);
  const planRow = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [manifest.plan]).rows[0];
  if (!planRow) return refuse(`run ${r.run}'s plan is no longer stored`);
  const plan = JSON.parse(String(planRow[0])) as FlowPlan;
  const docRow = db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [plan.flow.hash]).rows[0];
  const docText = docRow ? String(docRow[0]) : null;
  const doc = docText === null ? null : (JSON.parse(docText) as FlowDocument);
  const policies = doc ? await policiesHash(doc.policies) : null;

  return inTransaction(db, (): ReleaseResult => {
    const again = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [r.run]).rows[0];
    const docAgain = db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [plan.flow.hash]).rows[0];
    const why = ((): string | { names: string[] } => {
      if (!again || String(again[0]) !== stored.manifest || String(again[1]) !== stored.hash || (docAgain ? String(docAgain[0]) : null) !== docText) return `run ${r.run} changed while its release was checked`;
      if (!plan.publish) return `run ${r.run}'s plan doesn't hold: there is nothing to release`;
      const kept = holdsOfRun(db, r.run);
      if (!kept) return `run ${r.run} has no record of what held it`;
      if (kept.holds.length === 0) return `nothing held run ${r.run}: its outputs were published as it ran`;
      // Who may decide, under the policies stored with the run: never the caller's word for them.
      if (!doc) return `run ${r.run}'s flow document isn't stored with it, so who may decide can't be checked`;
      if (policies !== manifest.flow.policies) return `the stored flow document's policies aren't the ones run ${r.run} recorded`;
      const may = checkDecision(doc.policies, r.actor, r.option as DecideOption);
      if (!may.allowed) return may.reason;
      const held = new Set(heldOutputs(plan, kept.holds));
      const names = Object.keys(r.keys).sort();
      const outputs = new Set(plan.outputs.map((o) => o.name));
      for (const name of names) {
        if (!outputs.has(name)) return `${name} isn't an output of run ${r.run}`;
        if (!held.has(name)) return `run ${r.run} doesn't hold ${name}`;
        const staged = manifest.outputs[name]!.key;
        if (staged !== r.keys[name]) return `${name}'s staged key is ${short(staged)}, not the ${short(r.keys[name]!)} the decision names`;
      }
      for (const earlier of releasesOf(db, r.run)) {
        const twice = names.find((n) => earlier.outcome === 'applied' && Object.hasOwn(earlier.names, n));
        if (twice) return `${twice} was already released, by release ${earlier.id}`;
      }
      // Together: what the decision leaves out must already show the run's version, or the outputs would show two days.
      for (const name of [...held].sort()) {
        if (Object.hasOwn(r.keys, name)) continue;
        if (currentOf(db, name)?.key !== manifest.outputs[name]!.key) return `the decision leaves out ${name}, which run ${r.run} holds with another version than its name shows`;
      }
      // A release never moves a name back: no later day (or, without a period, no later run) is current for it.
      const period = plan.publish.period;
      const day = period === null ? null : manifest.parameters[period];
      for (const name of names) {
        const cur = currentOf(db, name);
        if (!cur || cur.run === r.run) continue;
        if (typeof day === 'string') {
          const curDay = dayOfRun(db, cur.run, period!);
          if (curDay === undefined) return `${name} shows run ${cur.run}, which isn't in this database`;
          if (curDay !== null && curDay > day) return `${curDay} is current for ${name} (run ${cur.run}): a release never moves a name back to an earlier day`;
          if ((curDay === day || curDay === null) && cur.run > r.run) return `a later run of ${curDay ?? 'another day'} (run ${cur.run}) is current for ${name}`;
        } else if (cur.run > r.run) return `a later run (run ${cur.run}) is current for ${name}`;
      }
      for (const name of names) {
        const used = nameInUse(db, name);
        if (used && !used.ours) return `a ${used.type} named ${name} already exists and is not a smaltfl dataset`;
        if (!findVersion(db, r.keys[name]!)) return `${name}'s staged version is no longer stored`;
      }
      return { names };
    })();
    const at = new Date().toISOString();
    if (typeof why === 'string') return { outcome: 'refused', why, release: recordRelease(db, { ...ask, outcome: 'refused', why, at }), published: [] };
    for (const name of why.names) pointDataset(db, name, r.keys[name]!, findVersion(db, r.keys[name]!)!.table, r.run);
    return { outcome: 'applied', why: null, release: recordRelease(db, { ...ask, names: Object.fromEntries(why.names.map((n) => [n, r.keys[n]!])), outcome: 'applied', why: null, at }), published: why.names };
  });
}
