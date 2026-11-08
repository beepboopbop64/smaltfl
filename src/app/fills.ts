/**
 * Filling a paused day in the app (ADR 0009 amendment 1 S3, S4, S9, S10; Q-61, Q-64): which days the data lists that a
 * held day may be filled from, and what each option gives readers (`donorsOf`); a donor's file fetched, checked against
 * the data's list and pinned in the engine only when a fill needs it (`pinDonor`); the derived document run staged, as
 * the record keeps it (`stageRepair`, `derivedAbout`); and what a release of it, or a withdrawal, names. main.ts calls
 * these from the decision sheet and when a day is run again (applyDecided): it keeps the record and the screens, this
 * module what a fill is made of.
 *
 * Every word on screen comes from core/decision.ts; every judgement from core/fill.ts and core/hold.ts. Nothing here
 * decides what a day may be filled from: the flow's verdict does (donorChoices), and the plugin checks the release.
 */
import { DONOR_SOURCE, pinnedDdl } from '../../examples/sources.js';
import { fillStepOf, type FlowDocument } from '../core/document.js';
import { donorChoices, donorRuleOf, fillCounts, missingOf, offersOf, repairDocument, type DonorPick, type FillCounts, type Missing, type NoDonor, type Offer, type Repair } from '../core/fill.js';
import type { HistoryRanges } from '../core/history.js';
import { heldOutputs, inputsOf, stagedKeys, type DerivedAbout, type HistoryRef, type StoryClaim } from '../core/hold.js';
import type { FlowPlan } from '../core/plan.js';
import type { RunResult } from '../core/protocol.js';
import type { Story } from '../core/story.js';
import { pinFile, runFlow } from '../index.js';
import type { Engine } from './engine.js';
import type { Expected } from './fetch-checked.js';

/** A day's file as the data lists it (loads.json's loads and donors), checked against MANIFEST.json at start. */
export interface Listed {
  day: string;
  file: string;
  sha256: string;
  bytes?: number;
  rows: number;
}

/** What the sheet offers a held day besides publishing it as is or not (S5), and what each gives readers. */
export interface Remedies {
  /** The fill step and the watched source it fills. */
  step: string;
  source: string;
  missing: Missing;
  offers: Offer[];
  /** The donors, the flow's rule first, each with what it gives readers; and why the flow's own rule found none. */
  picks: DonorPick[];
  none: NoDonor | null;
  counts: Map<string, FillCounts>;
  /** What the part that arrived alone gives readers. */
  part: FillCounts | null;
}

/**
 * The remedies a held day gets (S2, S3, S5): none without a fill step on the watched source, without a missing part, or
 * on a day whose rows aren't below their range. The donors are the good days the data lists near it (donorChoices, by
 * the watch's own rule first), each with the counts its drawing and row show (fillCounts, S4: the same number the
 * derived run counts).
 */
export function donorsOf(o: { h: HistoryRanges; doc: FlowDocument; day: string; source: string; story: Pick<Story, 'hero' | 'hours' | 'split'>; claim: StoryClaim | null; listed: (day: string) => HistoryRef | null; history: HistoryRef; build: string; later: string | null; readers: 'fill' | 'complete' | null; partFails: boolean }): Remedies | null {
  const step = fillStepOf(o.doc, o.source);
  if (!step) return null;
  const missing = missingOf(o.story, step.time);
  if (!missing) return null;
  const { picks, none } = donorChoices({ h: o.h, doc: o.doc, day: o.day, source: o.source, listed: o.listed, history: o.history, build: o.build }, donorRuleOf(o.doc, o.source));
  const counts = new Map<string, FillCounts>();
  for (const p of picks) {
    const c = fillCounts(o.h, o.day, missing, p.day);
    if (c) counts.set(p.day, c);
  }
  const usable = picks.filter((p) => counts.has(p.day));
  const offers = offersOf({ story: o.story, claim: o.claim, fill: step, donors: usable, later: o.later, partFails: o.partFails, readers: o.readers });
  if (!offers.length) return null;
  return { step: step.id, source: o.source, missing, offers, picks: usable, none, counts, part: fillCounts(o.h, o.day, missing, null) };
}

/** The repair a decision names (S9): a fill from a donor, its file as the data lists it, or the part alone. */
export function repairOf(r: Pick<Remedies, 'step' | 'source' | 'missing'>, pick: DonorPick | null): Repair {
  return { kind: pick ? 'fill' : 'complete', step: r.step, source: r.source, missing: structuredClone(r.missing), donor: pick ? { rule: pick.rule, direction: pick.direction, day: pick.day, file: { ...pick.file }, claim: pick.claim } : null };
}

/** The engines whose donor table exists: it reads whatever file is pinned under the donor's name now. */
const tables = new WeakSet<Engine>();

/**
 * Pin a donor's file in the engine (S3): fetched, checked against the data's list (its sha256 and size), hashed again
 * by the engine as it pins it under the donor's name, and read through the donor's own external table. Pinned only when
 * a fill needs it; a later fill from another day pins that day's file in its place.
 */
export async function pinDonor(engine: Engine, file: HistoryRef, fetch: (path: string, expected: Expected) => Promise<Uint8Array>): Promise<void> {
  const bytes = await fetch(file.path, { sha256: file.sha256, bytes: file.bytes, from: file.path });
  await pinFile(engine, DONOR_SOURCE.file, bytes, file.sha256);
  if (!tables.has(engine)) {
    await engine.exec(pinnedDdl(DONOR_SOURCE));
    tables.add(engine);
  }
}

/**
 * Run a repair's derived document staged (S4): the flow's own document with the repair (repairDocument), on the held
 * run's parameters, with the day's claim and the donor's, every output held whatever else holds, naming the held run it
 * repairs. Its versions are kept and hashed like any run's, and go out only by a decision's release.
 */
export async function stageRepair(engine: Engine, o: { doc: FlowDocument; held: RunResult; repair: Repair; claims: readonly StoryClaim[]; smaltdb: string; data: { commit: string; manifest: string } | null; log: { origin: string; size: number; root: string } | null }): Promise<{ doc: FlowDocument; result: RunResult }> {
  const doc = repairDocument(o.doc, o.repair);
  const claims = [...o.claims, ...(o.repair.donor ? [o.repair.donor.claim] : [])];
  const result = await runFlow(engine, doc, { smaltdb: o.smaltdb, parameters: { ...o.held.manifest.parameters } as Record<string, string>, data: o.data, log: o.log, claims, stage: true, from: { run: o.held.run, manifest: o.held.hash } });
  return { doc, result };
}

/** The outputs a derived run holds, with their staged keys: what its decision names (`derived.keys`), and its release. */
export const derivedKeys = (plan: FlowPlan, r: RunResult): Record<string, string> => stagedKeys(r.manifest, heldOutputs(plan, [...r.holds, ...(r.derived?.holds ?? [])]));

/** The rows a derived run has at its fill step: what readers get at the source (a day's versions, S7). */
export const filledRows = (r: RunResult, step: string): number | undefined => r.manifest.nodes.find((n) => n.origin === step)?.rows;

/**
 * A derived run's record entry (S9), as a held run's, with what it repairs: its day, inputs, holds (its day's and its
 * own), waiting outputs and staged keys; the held run; the repair as it read it; its rows at the fill step.
 */
export function derivedAbout(o: { result: RunResult; plan: FlowPlan; day: string | null; held: RunResult; repair: Repair }): DerivedAbout {
  const r = o.result;
  const rows = filledRows(r, o.repair.step);
  return {
    run: r.run, manifest: r.hash, outcome: 'derived', day: o.day, inputs: inputsOf(r.manifest), holds: [...r.holds, ...(r.derived?.holds ?? [])], waiting: r.waiting, keys: derivedKeys(o.plan, r),
    from: { run: o.held.run, manifest: o.held.hash }, repair: o.repair, ...(rows !== undefined ? { rows } : {}),
  };
}

/** Whether a derived run can be released: nothing holds it but its day's story and its being derived (S10). Its checks
 * tripping, or its donor not judged good, keep it back: "fails its checks". */
export function derivedFails(r: RunResult): boolean {
  return r.holds.some((x) => x.by !== 'story') || (r.derived?.holds ?? []).some((x) => x.by !== 'derived');
}
