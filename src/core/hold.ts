/**
 * What holds a run, what waits while it holds, and what was decided about it (ADR 0009). Pure: no DOM, no engine.
 *
 * - The flow's verdict on a day (`flowStory`, `dayClaim`): the story told for the flow, not for a viewer, with raw
 *   names, nothing hidden, nothing marked as expected, and every day of the history in its ranges, since those marks
 *   belong to one browser. The page passes it to the run as a claim; the plugin checks the claim against the run.
 * - What holds (`judgeClaims`, `holdsOf`): the checks, from the manifest's counts, and each watched source, from its
 *   claim, or as not judged when the claim is missing or doesn't match the run. It reads the manifest only, so a check
 *   reused by key holds again, and verify can compute the holds again from what was stored.
 * - What waits (`reachOf`, `heldOutputs`, `waitingOf`): every output while anything holds, or with `together: false`
 *   the outputs that read what the holding step reads; of those, the ones whose staged key isn't the current one.
 * - What the record says (`inputsOf`, `pausesOf`, `standingFor`, `decisionFor`): the record outlives the engine, so a
 *   pause opened by a held run is found again by the run's inputs (the flow, its parameters and its files), closed by a
 *   decision or by a passing run of the same inputs, and a decision is applied again only to the keys it named.
 */
import { canonicalJSON } from './canonical.js';
import type { DayState, PauseState } from './days.js';
import { isGeneralWatch, sourceOf, type FlowDocument, type HoldKind, type WatchDef } from './document.js';
import type { Repair } from './fill.js';
import { dayOfSlot, isEvery, type Every } from './calendar.js';
import { HistoryRanges, rangeSettings, slotSeries, type HistoryFile, type Level, type RangeOptions } from './history.js';
import { appendPeriods, emptyHistory, measuresHash, samePeriod, tailBefore, tailRef, type MeasureSettings, type Measures, type TailRef } from './measures.js';
import { rootOf } from './log.js';
import type { JSONValue, LogEntry } from './log.js';
import type { ExpectationResult, RunManifest } from './manifest.js';
import { flowNames, judgeOf, newsOf } from './news.js';
import { isPublish2, watchesOf, type ExpectNode, type FlowPlan, type WatchPlan } from './plan.js';
import { DECIDE_OPTIONS, type DecisionOption } from './policy.js';
import { storyOf, type Story } from './story.js';

export { DECIDE, DECIDE_OPTIONS, checkDecision, type DecideOption, type DecisionOption } from './policy.js';

// ------------------------------------------------------------------ the flow's verdict on a day

/** The history file a claim was told from, as the data's list gives it (E1: sha256 and size of its bytes). */
export interface HistoryRef {
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * What the page says the story said of a watched source's day (ADR 0009 §3): evidence at the Intact level, its inputs
 * hashed (the history's sha256, the day, the snapshot's rows, the build). A claim can only add a hold: a claim that
 * doesn't match the run leaves the source not judged, which holds too.
 */
export interface StoryClaim {
  by: 'story';
  /** The watched source's id. */
  source: string;
  day: string;
  state: Story['state'];
  /** Whether the day's rows are below their range: what `short` adds to `wrong`. */
  below: boolean;
  head: string;
  /** The build that told it: smaltfl's commit, or dev. */
  build: string;
  history: HistoryRef;
  /** The history's rows for the day, which must be the rows the run's snapshot holds. */
  rows: number;
  /** The days before it the record left out of learning (ADR 0010 §5, Q-80), when there are any: so the verdict can be
   * told again. */
  skip?: string[];
  /** The levels accepted before it (ADR 0010 §5, C6), when there are any: what it learned anew from each. */
  levels?: ClaimLevel[];
}

/** An accepted level as a claim names it (C6): the day it starts, the metrics it names, and the decide entry that
 * accepted it, by its seq. */
export interface ClaimLevel {
  from: string;
  metrics: string[];
  decision: number;
}

/**
 * claim/2 (ADR 0010 §6): what the page says the story said of a watched source's load under plan/2, told from the base
 * history plus the tail before the load (by its size and root), with the load's own measures (`measured`, the measures/0
 * hash), under the flow hash it names, leaving out of learning the days the record left out (`skip`) and learning the
 * accepted levels anew (`levels`, empty until Accept). Evidence at the Intact level, as claim/1 is.
 */
export interface StoryClaim2 {
  by: 'story';
  v: 2;
  source: string;
  slot: string;
  /** What the load covers (ADR 0010 §7): a day, or a slot of one, as its watch says. */
  every: Every;
  state: Story['state'];
  below: boolean;
  head: string;
  build: string;
  flow: string;
  history: { base: HistoryRef | null; tail: TailRef | null };
  measured: string;
  rows: number;
  skip: string[];
  levels: ClaimLevel[];
}

/** A watched source's claim, either version: claim/1 under plan/1, claim/2 under plan/2. */
export type Claim = StoryClaim | StoryClaim2;

/** Whether a claim is claim/2. */
export const isClaim2 = (c: Pick<Claim, 'by'> & { v?: unknown }): c is StoryClaim2 => (c as { v?: unknown }).v === 2;

/** The day (claim/1) or slot (claim/2) a claim is of. */
export const claimDay = (c: Claim): string => (isClaim2(c) ? c.slot : c.day);

/** The base history file a claim was told from: claim/1's file, claim/2's base (null for an empty base). */
export const claimBase = (c: Claim): HistoryRef | null => (isClaim2(c) ? c.history.base : c.history);

/** The name a source's tail is pinned under in the engine (ADR 0010 §6): pinned names take no slashes. */
export const tailPath = (source: string): string => `tail.${source}.json`;

/** A watched source as the plugin judged it: by its claim, or not judged, with why. */
export type Judged = { node: number; claim: Claim } | { node: number; unjudged: string };

/**
 * What holds a run: the checks at a step, a source's story, or a source not judged; with the fills (ADR 0009 amendment
 * 1), a derived run, held until a decision releases it, and a donor not judged good; and the outputs it reaches.
 */
export interface Hold {
  by: 'checks' | 'story' | 'unjudged';
  node: number;
  origin: string;
  /** What it says: the checks' counts, the story's head, why the source wasn't judged, what a derived run fills, or
   * why its donor isn't good. */
  said: string;
  /** The outputs that read any source the holding node reads (`reachOf`); every output, for a derived run. */
  reaches: string[];
  /** A story hold: the claim it rests on; a donor hold whose claim says something wrong: the donor's claim. */
  claim?: Claim;
  /**
   * With several watched sources (ADR 0010 §7): the load it is about, a story's or a source not judged, or the checks
   * of the one watched source they read. Holds and decisions are then about loads, not days.
   */
  load?: Load;
  /** The run that first held the load, when an earlier run did: a carried hold, decided once (ADR 0010 §7). */
  carried?: number;
  /** A check that reads several watched loads (a join of two sources), held once for each of them: which one is off its
   * failing doesn't say, so each is held and decided by its load (`spare` keeps those new in the run). */
  shared?: true;
}

/**
 * A load (ADR 0010 §7): one file of one watched source for one slot, by the file's sha256 (a source read from a table,
 * by its snapshot's content hash).
 */
export interface Load {
  source: string;
  slot: string;
  sha256: string;
}

/** A load as one comparable text: its source (without case), slot and file. */
export const loadKey = (l: Pick<Load, 'source' | 'slot' | 'sha256'>): string => `${l.source.toLowerCase()}|${l.slot}|${l.sha256}`;

/** Whether a value is a load. */
export const isLoad = (v: unknown): v is Load => typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as Load).source === 'string' && typeof (v as Load).slot === 'string' && typeof (v as Load).sha256 === 'string';

/**
 * Whether a plan's holds and decisions are about loads (ADR 0010 §7): it watches more than one source. With one, a load
 * is the run's day, and everything is as ADR 0009 has it.
 */
export const byLoad = (pub: FlowPlan['publish']): boolean => watchesOf(pub).length > 1;

/**
 * Each watched source's load in a run (ADR 0010 §7), by its node: its slot, the watch's period parameter's value; its
 * file, as the manifest names the snapshot's (else its content hash). A watch with no slot, or a source the run didn't
 * read, has none.
 */
export function loadsOf(plan: Pick<FlowPlan, 'nodes' | 'publish'>, manifest: Pick<RunManifest, 'nodes' | 'parameters'>): Map<number, Load> {
  const out = new Map<number, Load>();
  for (const w of watchesOf(plan.publish)) {
    const slot = w.period === null ? undefined : manifest.parameters[w.period];
    const n = manifest.nodes.find((x) => x.node === w.node);
    const sha256 = n?.file?.sha256 ?? n?.content;
    if (typeof slot === 'string' && sha256) out.set(w.node, { source: plan.nodes[w.node]!.origin, slot, sha256 });
  }
  return out;
}

/**
 * A check over several watched loads, held once for each (`shared`), kept for the loads new in the run (ADR 0010 §7,
 * Q-55): a load an earlier run of the flow read while the same check passed (`readBefore`) isn't what made it fail, so
 * its hold is dropped, unless every load the check reads was read so before (a run again: then each stays held).
 */
export function spare<H extends Pick<Hold, 'by' | 'node' | 'load' | 'shared'>>(holds: readonly H[], readBefore: (load: Load, node: number) => boolean): H[] {
  const drop = new Set<H>();
  for (const node of new Set(holds.filter((h) => h.shared).map((h) => h.node))) {
    const mine = holds.filter((h) => h.shared && h.node === node && h.by === 'checks' && h.load);
    const old = mine.filter((h) => readBefore(h.load!, node));
    if (old.length && old.length < mine.length) for (const h of old) drop.add(h);
  }
  return holds.filter((h) => !drop.has(h));
}

/**
 * Holds with the run each load was first held by, when an earlier run held it (`earlier`): carried holds, which cite
 * that run (ADR 0010 §7). The rest as they were.
 */
export function carry<H extends Pick<Hold, 'load' | 'carried'>>(holds: readonly H[], earlier: (load: Load) => number | undefined): H[] {
  return holds.map((h) => {
    const c = h.load ? earlier(h.load) : undefined;
    return c === undefined ? h : { ...h, carried: c };
  });
}

/**
 * What holds a derived run besides (ADR 0009 amendment 1 S4, S9): `derived`, the run itself, released only by a
 * decision; `donor`, a donor not judged, or judged with something wrong of it. Only a derived run has them, and a
 * pause never opens for one (it belongs to its held run's pause), so the screens that read a day's holds never see
 * them.
 */
export interface FillHold extends Omit<Hold, 'by'> {
  by: 'derived' | 'donor';
}

/** Anything that holds a run. */
export type RunHold = Hold | FillHold;

/**
 * Whether the history counts the document's checks: the step it counted reads the source alone (directly, or through
 * its fill step, `sourceOf`), with the same rules (names, checks and what each does). A box put in front of the source
 * would leave the checks other rows to count.
 */
export function countedChecks(doc: Pick<FlowDocument, 'steps'>, h: HistoryRanges, source: string | undefined): boolean {
  const step = doc.steps.find((x) => x.id === h.file.step);
  return !!source && step?.kind === 'expectations' && step.inputs.length === 1 && sourceOf(doc, step.inputs[0]!) === source
    && h.sameChecks(step.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })));
}

/** What a flow's own verdict reads of its document: its steps, its ontology, its watch and its calendar. */
export type FlowFor = Pick<FlowDocument, 'steps' | 'ontology' | 'publish' | 'calendar'>;

/**
 * The flow's story of a day (ADR 0009 §3, ADR 0010): told with raw names and the ontology's noun and parts, no hidden
 * columns, no findings marked as expected, no episode, and no gate (the checks hold from the run's own counts); judged
 * as the document says (`judgeOf`: the watch's form and settings, the marks on the source). `h` must learn from every day
 * of the history but those the record leaves out (ADR 0010 §5, X8: held and not published as is, which its claim
 * names): leaving incident days out is one browser's choice, not the flow's. It must have the flow's calendar for the
 * source.
 */
export function flowStory(h: HistoryRanges, day: string, doc: FlowFor, source: string, upstream?: readonly { source: string; state: string; head: string }[]): Story {
  if (h.skipped > 0) throw new Error("the flow's verdict learns from every day of the history but those the record leaves out: these ranges leave out days one viewer marked");
  const judge = judgeOf(doc, source);
  if (h.calendar.base !== judge.calendar.base) throw new Error(`the flow judges ${source} by the ${judge.calendar.base} calendar: these ranges were made with ${h.calendar.base}`);
  if (canonicalJSON(h.calendar as never) !== canonicalJSON(judge.calendar as never)) throw new Error(`the flow judges ${source} by its own calendar's days: these ranges were made with other days`);
  if (h.settings !== rangeSettings(rangesFor(doc, source))) throw new Error(`the flow judges ${source} by its watch's pattern and re-learning: these ranges were made with other settings`);
  const names = flowNames(doc, source);
  // Only the sources this node reads may explain its findings (ADR 0014 §2).
  const reads = upstream?.length ? new Set([...upstreamSources(doc, source)].map((x) => x.toLowerCase())) : null;
  const up = reads ? upstream!.filter((u) => reads.has(u.source.toLowerCase())) : undefined;
  return storyOf(h, day, newsOf(h, day, names, { checks: countedChecks(doc, h, source), judge }), { names, episode: false, judge, ...(up?.length ? { upstream: up } : {}) });
}

/** The sources a step reads, directly or through other steps; a source reads itself. */
export function upstreamSources(doc: Pick<FlowDocument, 'steps'>, id: string): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x.toLowerCase())) continue;
    seen.add(x.toLowerCase());
    const step = doc.steps.find((s) => s.id.toLowerCase() === x.toLowerCase());
    if (!step) out.add(x);
    else stack.push(...step.inputs);
  }
  return out;
}

/** The calendar a flow judges a watched source by (ADR 0010 §2): what its history's ranges must be made with. */
export const calendarFor = (doc: Pick<FlowDocument, 'publish' | 'ontology' | 'calendar'>, source: string) => judgeOf(doc, source).calendar;

/**
 * What a flow's ranges for a watched source must be made with (ADR 0010 §2, §3, §5): its calendar and its watch's
 * pattern; in the general form the echo fix, and re-learning on its own when the watch asks for it (bad values never
 * re-learned). `flowStory`
 * refuses ranges made otherwise. The levels accepted come from the record (`levelsOf`), the days left out from it too.
 */
export function rangesFor(doc: Pick<FlowDocument, 'publish' | 'ontology' | 'calendar'>, source: string): Pick<RangeOptions, 'calendar' | 'pattern' | 'echoes' | 'relearn' | 'bad'> {
  const j = judgeOf(doc, source);
  return { calendar: j.calendar, pattern: j.pattern, echoes: !j.legacy, relearn: j.relearn, bad: j.bad };
}

/**
 * The donor rule a watch fills a paused day by when it names none (ADR 0010 §3, C1): the same weekday for the weekly
 * pattern, the nearest good day for any other. A watch given as a file name has the weekly pattern.
 */
export function donorDefault(watch: string | WatchDef | Pick<WatchPlan, 'pattern' | 'donor'>): 'weekday' | 'nearest' {
  if (!isGeneralWatch(watch)) return 'weekday';
  const w = watch as Partial<Pick<WatchDef, 'pattern' | 'donor'>>;
  return w.donor ?? ((w.pattern ?? 'weekly') === 'weekly' ? 'weekday' : 'nearest');
}

/**
 * The claim a page passes to a run for a watched source's day, from the history file it checked against the data's
 * list (ADR 0006 §2) and pinned in the engine. Null for a day the history doesn't have: the run holds it as not judged.
 */
export function dayClaim(h: HistoryRanges, doc: FlowFor, file: HistoryRef, day: string, source: string, build: string): StoryClaim | null {
  const k = h.file.days.indexOf(day);
  if (k < 0) return null;
  const s = flowStory(h, day, doc, source);
  // The days before it the record left out of learning, named when there are any (Q-80): a claim made with none is as
  // it always was.
  const skip = h.recordedSkips.filter((d) => d < day);
  const levels = claimLevels(h.levels, day);
  return { by: 'story', source, day, state: s.state, below: belowOf(s), head: s.head, build, history: { path: file.path, sha256: file.sha256, bytes: file.bytes }, rows: h.file.rows[k]!, ...(skip.length ? { skip } : {}), ...(levels.length ? { levels } : {}) };
}

/** The levels a claim names (C6): those the ranges learned that start before its day, each with the decision that
 * accepted it, in order. */
function claimLevels(levels: readonly Level[], day: string): ClaimLevel[] {
  return levels.filter((l) => l.from < day && Number.isInteger(l.decision)).map((l) => ({ from: l.from, metrics: [...l.metrics], decision: l.decision! })).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.decision - b.decision));
}

/** Whether a story's day is below its range; or, with no range, under the floor that needs none (ADR 0010 §1), which
 * `short` holds too (Q-53). */
const belowOf = (s: Story): boolean => (s.amount ? s.amount.value < s.amount.low : s.state === 'wrong' && s.hero === 'amount' && s.cause?.kind === 'volume');

/** What a page tells a load's claim/2 from (`loadClaim`). */
export interface LoadClaimInput {
  doc: FlowFor & Pick<FlowDocument, 'id'>;
  source: string;
  /** The flow hash it is told under: the plan's. */
  flow: string;
  /** The base history and its file as the data's list gives it; null for a source with no base. */
  base: HistoryFile | null;
  baseRef: HistoryRef | null;
  /** The source's tail: every period appended from its own runs, in any order (one per slot, C5). */
  tail: readonly Measures[];
  /** The load's own measures, as the plugin measured it (`measure`), and the settings it was measured with. */
  measures: Measures;
  settings: MeasureSettings;
  /** The days the record leaves out of learning (`skipOf`). */
  skip: readonly string[];
  /** The levels the record accepted for the source (`levelsOf`). */
  levels?: readonly ClaimLevel[];
  build: string;
  /** For a watched step (ADR 0014 §2): what each watched source upstream of it said of the day, so a finding that
   * repeats a source's is told as following from it. */
  upstream?: readonly { source: string; state: string; head: string }[];
}

/**
 * The claim/2 a page passes to a run for a watched source's load (ADR 0010 §6), with the ranges it was told from: the
 * base plus the tail before the slot, and the load's own measures as its period when the base doesn't have it. A load
 * the base has must be the base's period (`samePeriod`): a file other than the one the base was built from can't be
 * told from it, and a slot inside the base that the base lacks can't be added after it. Null in either case: the run
 * holds the source as not judged.
 */
export async function loadClaim(o: LoadClaimInput): Promise<{ claim: StoryClaim2; ranges: HistoryRanges; tail: Measures[] } | null> {
  const slot = o.measures.slot;
  const every = o.measures.every;
  const ms = tailBefore(o.tail, slot);
  const k = o.base ? o.base.days.indexOf(slot) : -1;
  let file: HistoryFile;
  if (o.base && (o.base.every ?? 'day') !== every) return null;
  if (o.base && k >= 0) {
    if (samePeriod(o.base, k, o.measures) !== null) return null;
    file = ms.length ? appendPeriods(o.base, ms) : o.base;
  } else {
    const start = o.base ?? emptyHistory({ flow: o.doc.id, source: o.source, settings: o.settings, columns: o.measures.columns, types: o.measures.types, kinds: o.measures.kinds });
    if (start.days.length && slot <= start.days.at(-1)!) return null;
    try {
      file = appendPeriods(start, [...ms, o.measures]);
    } catch {
      return null;
    }
  }
  const skip = [...new Set(o.skip)].filter((d) => d < slot).sort();
  const levels = (o.levels ?? []).filter((l) => l.from < slot);
  // A slot is judged from its own series, as a day (ADR 0010 §7): the same slot of the day, named by its day, the days
  // left out and the levels of that slot too.
  const slotted = every !== 'day';
  const own = (d: string) => !slotted || d.slice(10) === slot.slice(10);
  const ranges = new HistoryRanges(slotted ? slotSeries(file, slot) : file, { ...rangesFor(o.doc, o.source), recorded: new Set(skip.filter(own).map(dayOfSlot)), levels: levels.filter((l) => own(l.from)).map((l) => ({ ...l, from: dayOfSlot(l.from) })) });
  const s = flowStory(ranges, dayOfSlot(slot), o.doc, o.source, o.upstream);
  const claim: StoryClaim2 = {
    by: 'story', v: 2, source: o.source, slot, every, state: s.state, below: belowOf(s), head: s.head, build: o.build, flow: o.flow,
    history: { base: o.baseRef ? { path: o.baseRef.path, sha256: o.baseRef.sha256, bytes: o.baseRef.bytes } : null, tail: tailRef(ms) },
    measured: await measuresHash(o.measures), rows: o.measures.rows, skip, levels: claimLevels(levels, slot),
  };
  return { claim, ranges, tail: ms };
}

/** Whether a claim holds under the flow's hold kinds: `wrong` on any day the story says something wrong, `short` only
 * when its rows are below their range too; a day not judged yet (`unlearned`) only when `hold` lists it, since such a
 * day is published, marked (ADR 0010 §1, the owner, Q-53). A refused file, never told to a run, holds under either. */
export function claimHolds(hold: readonly HoldKind[], c: Pick<Claim, 'state' | 'below'>): boolean {
  if (c.state === 'refused') return hold.includes('wrong') || hold.includes('short');
  if (c.state === 'unlearned') return hold.includes('unlearned');
  return c.state === 'wrong' && (hold.includes('wrong') || (hold.includes('short') && c.below));
}

// ------------------------------------------------------------------ what holds

/** What the plugin knows of a run when it judges its claims: each watched node's snapshot rows, and the files pinned
 * in the engine, as the engine hashed them. */
export interface ClaimFacts {
  rows(node: number): number | undefined;
  pinned(path: string): { sha256: string; bytes: number } | undefined;
  /** plan/2 (ADR 0010 §6): the measures/0 hash of a watched node's snapshot as the run measured it; for a derived run,
   * its held run's stored measures (C4). Undefined when it couldn't be measured. */
  measured?(node: number): string | undefined;
  /** plan/2: why a watched node's snapshot has no measures to judge its claim by (`measured` gave none). */
  unmeasured?(node: number): string | undefined;
  /** plan/2: the tail pinned for a source (`tailPath`): its leaves as the plugin computed them, or why it isn't a tail;
   * undefined when none is pinned. A claim names a prefix of it: its first `size` leaves. */
  tail?(source: string): { leaves: string[] } | { known: TailRef[] } | { problem: string } | undefined;
  /** plan/2: the flow hash a claim must be told under: the plan's; for a derived run, its held run's (C4). */
  flow?: string;
}

const STATES: readonly string[] = ['calm', 'notes', 'unusual', 'wrong', 'refused', 'recovery', 'unlearned'];
const HEX64 = /^[0-9a-f]{64}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fmt = (n: number | undefined) => (n === undefined ? 'none' : n.toLocaleString('en-US'));

/** Why a value isn't shaped as a story claim, or null when it is. */
function claimProblem(c: Record<string, unknown>): string | null {
  if (c.by !== 'story') return "isn't a story's claim";
  if (typeof c.day !== 'string' || c.day === '') return 'names no day';
  if (!STATES.includes(c.state as string)) return 'has no story state';
  if (typeof c.below !== 'boolean') return "doesn't say whether its rows are below their range";
  if (typeof c.head !== 'string') return 'has no head';
  if (typeof c.build !== 'string' || c.build === '') return 'names no build';
  const h = c.history;
  if (!isRecord(h) || typeof h.path !== 'string' || typeof h.sha256 !== 'string' || !HEX64.test(h.sha256) || !Number.isSafeInteger(h.bytes) || (h.bytes as number) < 0) return "doesn't name its history's file, sha256 and size";
  if (!Number.isSafeInteger(c.rows) || (c.rows as number) < 0) return 'counts no rows';
  if (c.skip !== undefined && !isDays(c.skip)) return "names days left out that aren't days";
  if (c.levels !== undefined && !isLevels(c.levels)) return "names levels that aren't levels: a day, metrics and a decision";
  return null;
}

/** Whether a value lists accepted levels as a claim names them (`ClaimLevel`). */
const isLevels = (v: unknown): v is ClaimLevel[] => Array.isArray(v) && v.every((l) => isRecord(l) && typeof l.from === 'string' && DAY.test(l.from) && Array.isArray(l.metrics) && l.metrics.every((m) => typeof m === 'string') && Number.isInteger(l.decision));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A day, or a slot of one (ADR 0010 §7): what the record leaves out of learning. */
const PERIOD = /^\d{4}-\d{2}-\d{2}(T\d{2})?$/;
const isDays = (v: unknown): v is string[] => Array.isArray(v) && v.every((d) => typeof d === 'string' && PERIOD.test(d));
const isRef = (h: unknown): h is HistoryRef => isRecord(h) && typeof h.path === 'string' && typeof h.sha256 === 'string' && HEX64.test(h.sha256) && Number.isSafeInteger(h.bytes) && (h.bytes as number) >= 0;

/** Why a value isn't shaped as a claim/2, or null when it is. */
function claim2Problem(c: Record<string, unknown>): string | null {
  if (c.by !== 'story') return "isn't a story's claim";
  if (c.v !== 2) return "isn't claim/2, which plan/2 needs";
  if (typeof c.slot !== 'string' || c.slot === '') return 'names no slot';
  if (!isEvery(c.every)) return "names a slot's length this build doesn't read";
  if (!STATES.includes(c.state as string)) return 'has no story state';
  if (typeof c.below !== 'boolean') return "doesn't say whether its rows are below their range";
  if (typeof c.head !== 'string') return 'has no head';
  if (typeof c.build !== 'string' || c.build === '') return 'names no build';
  if (typeof c.flow !== 'string' || !HEX64.test(c.flow)) return 'names no flow hash';
  const h = c.history;
  if (!isRecord(h) || !(h.base === null || isRef(h.base))) return "doesn't name its base history's file, sha256 and size";
  const t = h.tail;
  if (!(t === null || (isRecord(t) && Number.isSafeInteger(t.size) && (t.size as number) > 0 && typeof t.root === 'string' && HEX64.test(t.root)))) return "doesn't name its tail's size and root";
  if (typeof c.measured !== 'string' || !HEX64.test(c.measured)) return "doesn't name the measures it was told from";
  if (!Number.isSafeInteger(c.rows) || (c.rows as number) < 0) return 'counts no rows';
  if (!isDays(c.skip)) return "doesn't list the days left out";
  if (!isLevels(c.levels)) return "doesn't list its levels: a day, metrics and a decision each";
  return null;
}

/**
 * Where a claim is judged: the node whose snapshot it must count, that node's origin (for what it says), the history
 * file pinned under the watch's name, and the day it must be of (the run's period parameter, as the plan holds it).
 */
export interface ClaimAt {
  node: number;
  origin: string;
  file: string;
  day: unknown;
  /** The plan's format: claim/1 under plan/1, claim/2 under plan/2. */
  plan?: 1 | 2;
  /** claim/2: the watched source whose tail the claim was told from (a donor's is its source's). */
  tailOf?: string;
  /** claim/2: what a load of the source covers, as its watch says (ADR 0010 §7): a day unless it names a slot. */
  every?: Every;
}

/**
 * One claim judged against the run (ADR 0009 §3): the one check every claim goes through, a watched source's and, with
 * the fills, a donor's (amendment 1 S3, C4). Not judged, saying why, when it isn't shaped as a claim, names another day,
 * was told from another history than the file pinned under the watch's name, or counts other rows than the node's
 * snapshot holds; else the source judged by a clean copy of the claim, only its own fields.
 */
export function judgeClaim(c: Record<string, unknown>, at: ClaimAt, facts: ClaimFacts): Judged {
  const { node, origin, file, day } = at;
  if (at.plan === 2) return judgeClaim2(c, at, facts);
  if (c.v === 2) return { node, unjudged: `the claim for ${origin} is claim/2, which a plan/1 doesn't read` };
  const problem = claimProblem(c);
  if (problem) return { node, unjudged: `the claim for ${origin} ${problem}` };
  const claim = c as unknown as StoryClaim;
  if (typeof day !== 'string' || claim.day !== day) return { node, unjudged: `the claim is of ${claim.day}, the run of ${day === undefined ? 'no day' : String(day)}` };
  if (claim.history.path !== file) return { node, unjudged: `the claim was told from ${claim.history.path}, not ${file}` };
  const pin = facts.pinned(file);
  if (!pin) return { node, unjudged: `${file} isn't pinned in the engine` };
  if (pin.sha256 !== claim.history.sha256 || pin.bytes !== claim.history.bytes) return { node, unjudged: `the claim's ${file} isn't the one pinned in the engine` };
  const rows = facts.rows(node);
  if (rows !== claim.rows) return { node, unjudged: `the claim counts ${fmt(claim.rows)} rows of ${origin}, the snapshot holds ${fmt(rows)}` };
  // A clean copy: only the claim's own fields reach the record.
  return { node, claim: { by: 'story', source: claim.source, day: claim.day, state: claim.state, below: claim.below, head: claim.head, build: claim.build, history: { path: claim.history.path, sha256: claim.history.sha256, bytes: claim.history.bytes }, rows: claim.rows, ...(claim.skip?.length ? { skip: [...claim.skip] } : {}), ...(claim.levels?.length ? { levels: copyLevels(claim.levels) } : {}) } };
}

/**
 * A claim/2 judged against a plan/2 run (ADR 0010 §6), in this order, the first that fails saying why it isn't judged:
 * shaped as claim/2; told under the flow hash the run names (the plan's, or a derived run's held run's, C4); of the
 * slot the run's period parameter holds; from the base pinned under the watch's name (or no base, when none is
 * pinned there); from the tail pinned for the source (its size and root, computed again by the plugin); from the
 * measures the run made of its snapshot (`measured`); counting the snapshot's rows.
 */
function judgeClaim2(c: Record<string, unknown>, at: ClaimAt, facts: ClaimFacts): Judged {
  const { node, origin, file, day } = at;
  const problem = claim2Problem(c);
  if (problem) return { node, unjudged: `the claim for ${origin} ${problem}` };
  const claim = c as unknown as StoryClaim2;
  if (facts.flow === undefined || claim.flow !== facts.flow) return { node, unjudged: `the claim was told under another flow than the run's` };
  if (claim.every !== (at.every ?? 'day')) return { node, unjudged: `the claim is of a load of ${claim.every}, and the watch's loads are of ${at.every ?? 'day'}` };
  if (typeof day !== 'string' || claim.slot !== day) return { node, unjudged: `the claim is of ${claim.slot}, the run of ${day === undefined ? 'no day' : String(day)}` };
  const pin = facts.pinned(file);
  const base = claim.history.base;
  if (base === null) {
    if (pin) return { node, unjudged: `the claim was told with no base history, and ${file} is pinned` };
  } else {
    if (base.path !== file) return { node, unjudged: `the claim was told from ${base.path}, not ${file}` };
    if (!pin) return { node, unjudged: `${file} isn't pinned in the engine` };
    if (pin.sha256 !== base.sha256 || pin.bytes !== base.bytes) return { node, unjudged: `the claim's ${file} isn't the one pinned in the engine` };
  }
  if (claim.history.tail !== null) {
    const of = at.tailOf ?? claim.source;
    const t = facts.tail?.(of);
    if (!t) return { node, unjudged: `the claim names a tail of ${claim.history.tail.size}, and no tail is pinned for ${of}` };
    if ('problem' in t) return { node, unjudged: `the tail pinned for ${of} ${t.problem}` };
    // The claim's tail is the first `size` periods of the one pinned: a donor's, told before the day, is shorter.
    const { size, root } = claim.history.tail;
    const fits = 'leaves' in t ? size <= t.leaves.length && rootOf(t.leaves, size) === root : t.known.some((k) => k.size === size && k.root === root);
    if (!fits) return { node, unjudged: `the claim's tail isn't the one pinned for ${of}` };
  }
  const measured = facts.measured?.(node);
  if (measured === undefined) return { node, unjudged: facts.unmeasured?.(node) ?? `${origin}'s snapshot wasn't measured` };
  if (measured !== claim.measured) return { node, unjudged: `the claim was told from other measures of ${origin} than its snapshot's` };
  const rows = facts.rows(node);
  if (rows !== claim.rows) return { node, unjudged: `the claim counts ${fmt(claim.rows)} rows of ${origin}, the snapshot holds ${fmt(rows)}` };
  return {
    node,
    claim: {
      by: 'story', v: 2, source: claim.source, slot: claim.slot, every: claim.every, state: claim.state, below: claim.below, head: claim.head, build: claim.build, flow: claim.flow,
      history: { base: base ? { path: base.path, sha256: base.sha256, bytes: base.bytes } : null, tail: claim.history.tail ? { size: claim.history.tail.size, root: claim.history.tail.root } : null },
      measured: claim.measured, rows: claim.rows, skip: [...claim.skip], levels: copyLevels(claim.levels),
    },
  };
}

/** Levels as a clean copy keeps them: only their own fields. */
const copyLevels = (ls: readonly ClaimLevel[]): ClaimLevel[] => ls.map((l) => ({ from: l.from, metrics: [...l.metrics], decision: l.decision }));

/**
 * Each watched source of a plan judged by its claim (ADR 0009 §3, `judgeClaim`), or not judged when there is no claim
 * for it, or more than one. Not judged holds.
 */
export function judgeClaims(plan: Pick<FlowPlan, 'nodes' | 'parameters' | 'publish'>, claims: readonly unknown[] | undefined, facts: ClaimFacts): Judged[] {
  const format = plan.publish && isPublish2(plan.publish) ? 2 : 1;
  return watchesOf(plan.publish).map(({ node, history: file, period, settings }): Judged => {
    const day = period === null ? undefined : plan.parameters[period];
    const origin = plan.nodes[node]!.origin;
    const mine = (claims ?? []).filter((c): c is Record<string, unknown> => isRecord(c) && typeof c.source === 'string' && c.source.toLowerCase() === origin.toLowerCase());
    if (mine.length === 0) return { node, unjudged: `no claim for ${origin}` };
    if (mine.length > 1) return { node, unjudged: `${mine.length} claims for ${origin}` };
    return judgeClaim(mine[0]!, { node, origin, file, day, plan: format, every: settings?.every ?? 'day' }, facts);
  });
}

/**
 * What a run's stored claims say of themselves, for judging them again where the engine's pinned files are gone (verify
 * against what it kept, the audit against the bag): each history file and tail as the claims name them, the snapshot's
 * rows from the manifest, the measures as stored (else as the claims name them), and the flow hash they must be told
 * under.
 */
export function factsFromClaims(claims: readonly Claim[], o: { rows(node: number): number | undefined; flow?: string; measured?(node: number): string | undefined; origin?(node: number): string | undefined }): ClaimFacts {
  // Several watched sources (ADR 0010 §7): each node's measures are its own source's claim's.
  const own = (node: number) => {
    const c2 = claims.filter(isClaim2);
    const origin = o.origin?.(node)?.toLowerCase();
    return origin !== undefined ? c2.find((c) => c.source.toLowerCase() === origin)?.measured : c2.length === 1 ? c2[0]!.measured : undefined;
  };
  return {
    rows: o.rows,
    pinned: (path) => {
      const b = claims.map(claimBase).find((x) => x?.path === path);
      return b ? { sha256: b.sha256, bytes: b.bytes } : undefined;
    },
    measured: o.measured ?? own,
    // The claims' own tails: judged again where the pinned tail is gone, each stands for itself.
    tail: () => ({ known: claims.flatMap((c) => (isClaim2(c) && c.history.tail ? [c.history.tail] : [])) }),
    ...(o.flow !== undefined ? { flow: o.flow } : {}),
  };
}

/**
 * Each donor a derived run reads, judged by its claim (ADR 0009 amendment 1 S3, C4): every fill node that fills from a
 * day reads the donor as its second input, and the donor's claim must name the donor source, be of the node's `from`
 * day, be told from the history file pinned under the watch of the fill's source, and count the donor snapshot's rows
 * (`judgeClaim`). Not judged, saying why, when there is no such claim, more than one, or the fill's source isn't watched.
 * In node order; none for a plan that fills nothing.
 */
export function judgeDonors(plan: Pick<FlowPlan, 'nodes' | 'publish'>, claims: readonly unknown[] | undefined, facts: ClaimFacts): Judged[] {
  const out: Judged[] = [];
  const format = plan.publish && isPublish2(plan.publish) ? 2 : 1;
  plan.nodes.forEach((n) => {
    if (n.op !== 'fill' || n.from === null || n.inputs.length !== 2) return;
    const [source, donor] = n.inputs as [number, number];
    const origin = plan.nodes[donor]!.origin;
    const file = watchesOf(plan.publish).find((w) => w.node === source)?.history;
    if (file === undefined) return out.push({ node: donor, unjudged: `${plan.nodes[source]!.origin} isn't watched: there is no history to judge its donor by` });
    const mine = (claims ?? []).filter((c): c is Record<string, unknown> => isRecord(c) && typeof c.source === 'string' && c.source.toLowerCase() === origin.toLowerCase());
    if (mine.length === 0) return out.push({ node: donor, unjudged: `no claim for ${origin}` });
    if (mine.length > 1) return out.push({ node: donor, unjudged: `${mine.length} claims for ${origin}` });
    const every = watchesOf(plan.publish).find((w) => w.node === source)?.settings?.every ?? 'day';
    out.push(judgeClaim(mine[0]!, { node: donor, origin, file, day: n.from, plan: format, tailOf: plan.nodes[source]!.origin, every }, facts));
  });
  return out;
}

/** Whether a donor's claim says it is good: judged, with nothing wrong of it (S3). A day not judged yet (ADR 0010 §1,
 * C9) has nothing to say it is good, so it is never a donor, though it publishes. */
export const donorGood = (c: Pick<Claim, 'state'>): boolean => c.state !== 'wrong' && c.state !== 'refused' && c.state !== 'unlearned';

const count = (n: number) => n.toLocaleString('en-US');
const percent = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

/**
 * What a step's checks say when they trip, as the runtime says it when it throws: a `fail` rule that failed for any
 * row, or more rows dropped than `maxDropped` allows (strictly more). Null when they pass.
 */
export function tripped(n: Pick<ExpectNode, 'maxDropped'>, r: ExpectationResult): string | null {
  const failing = r.rules.filter((x) => x.onFail === 'fail' && x.failed > 0);
  if (failing.length > 0) return `expectations failed: ${failing.map((x) => `${x.name} (${count(x.failed)} row${x.failed === 1 ? '' : 's'})`).join(', ')}`;
  if (n.maxDropped !== null && r.rows > 0 && r.dropped / r.rows > n.maxDropped) return `dropped ${count(r.dropped)} of ${count(r.rows)} rows (${percent(r.dropped / r.rows)}), more than the ${percent(n.maxDropped)} allowed`;
  return null;
}

/**
 * What a run was asked to be, beside its plan (ADR 0009 amendment 1 S4): a derived run (`stage`), held whatever else
 * holds until a decision releases it, with its donors as judged.
 */
export interface Derived {
  derived?: boolean;
  donors?: readonly Judged[];
}

/**
 * What a fill node does, said: "fills 13:00–23:59 from 2023-09-14", "fills all but payment_type 0 from 2023-09-15";
 * for the part that arrived, "keeps all but 13:00–23:59", "keeps all but VendorID 1", "keeps only payment_type 0".
 */
function fillSaid(n: Extract<FlowPlan['nodes'][number], { op: 'fill' }>): string {
  const m = n.missing!;
  const part = 'hours' in m ? `${String(m.hours[0]).padStart(2, '0')}:00–${String(m.hours[1]).padStart(2, '0')}:59` : `${m.column} ${JSON.stringify(m.value)}`;
  const rest = !('hours' in m) && m.rest === true;
  if (n.from !== null) return `fills ${rest ? 'all but ' : ''}${part} from ${n.from}`;
  return rest ? `keeps only ${part}` : `keeps all but ${part}`;
}

/**
 * What holds a run (ADR 0009 §3), from its plan, its manifest and its judged sources: with `checks` in `hold`, each
 * step whose counts trip (a step whose counts are missing holds too); each watched source whose claim holds under
 * `hold`; each watched source not judged. A derived run (amendment 1 S4) is held too, by each fill node that fills,
 * reaching every output, and by each donor not judged or not good. None for a plan that doesn't say what holds it. In
 * node order, checks first. With several watched sources, each hold of a source (and each check that reads one) names
 * its load (ADR 0010 §7).
 */
export function holdsOf(plan: Pick<FlowPlan, 'nodes' | 'outputs' | 'publish'>, manifest: Pick<RunManifest, 'nodes' | 'parameters'>, judged: readonly Judged[]): Hold[];
export function holdsOf(plan: Pick<FlowPlan, 'nodes' | 'outputs' | 'publish'>, manifest: Pick<RunManifest, 'nodes' | 'parameters'>, judged: readonly Judged[], derived: Derived): RunHold[];
export function holdsOf(plan: Pick<FlowPlan, 'nodes' | 'outputs' | 'publish'>, manifest: Pick<RunManifest, 'nodes' | 'parameters'>, judged: readonly Judged[], derived: Derived = {}): RunHold[] {
  const pub = plan.publish;
  if (!pub) return [];
  const out: RunHold[] = [];
  if (pub.hold.includes('checks'))
    plan.nodes.forEach((n, i) => {
      if (n.op !== 'expect') return;
      const counts = manifest.nodes.find((m) => m.node === i)?.expectations;
      const said = counts ? tripped(n, counts) : 'its checks were not counted';
      if (said) out.push({ by: 'checks', node: i, origin: n.origin, said, reaches: reachOf(plan, i) });
    });
  for (const { node, holds } of watchesOf(pub)) {
    const origin = plan.nodes[node]!.origin;
    const mine = judged.filter((j) => j.node === node);
    const j = mine.length === 1 ? mine[0]! : null;
    // A watch that never holds (ADR 0010 §10, `holds: false`) is told and recorded, and holds nothing, its claim
    // missing or not.
    if (!holds) continue;
    if (!j || 'unjudged' in j) out.push({ by: 'unjudged', node, origin, said: j && 'unjudged' in j ? j.unjudged : mine.length ? `${mine.length} verdicts for ${origin}` : `no claim for ${origin}`, reaches: reachOf(plan, node) });
    else if (claimHolds(pub.hold, j.claim)) out.push({ by: 'story', node, origin, said: j.claim.head, reaches: reachOf(plan, node), claim: j.claim });
  }
  for (const j of derived.donors ?? []) {
    const origin = plan.nodes[j.node]?.origin ?? String(j.node);
    if ('unjudged' in j) out.push({ by: 'donor', node: j.node, origin, said: j.unjudged, reaches: reachOf(plan, j.node) });
    else if (!donorGood(j.claim)) out.push({ by: 'donor', node: j.node, origin, said: `the donor day ${claimDay(j.claim)}: ${j.claim.head}`, reaches: reachOf(plan, j.node), claim: j.claim });
  }
  // Several watched sources (ADR 0010 §7): each hold of a source, and each check that reads one watched source, is about
  // its load.
  if (byLoad(pub)) {
    const loads = loadsOf(plan, manifest as Pick<RunManifest, 'nodes' | 'parameters'>);
    const watched = new Set(loads.keys());
    for (const h of out) {
      if (h.by === 'story' || h.by === 'unjudged') {
        const l = loads.get(h.node);
        if (l) h.load = { ...l };
      } else if (h.by === 'checks') {
        const read = [...upstream(plan, h.node)].filter((i) => watched.has(i));
        if (read.length === 1) h.load = { ...loads.get(read[0]!)! };
      }
    }
    // A check that reads several watched loads (a join of both sources) is held once for each of them, each reaching
    // only the outputs that read its source: every hold is about a load, so every hold can be decided, and outputs that
    // read neither publish (Q-55).
    for (let k = out.length - 1; k >= 0; k--) {
      const h = out[k]!;
      if (h.by !== 'checks' || h.load) continue;
      const read = [...upstream(plan, h.node)].filter((i) => watched.has(i)).sort((a, b) => a - b);
      if (read.length < 2) continue;
      const split = read.map((i): Hold => {
        const reach = new Set(reachOf(plan, i));
        return { ...(h as Hold), reaches: h.reaches.filter((n) => reach.has(n)), load: { ...loads.get(i)! }, shared: true };
      });
      out.splice(k, 1, ...split);
    }
  }
  if (derived.derived) {
    const all = plan.outputs.map((o) => o.name);
    let filling = false;
    plan.nodes.forEach((n, i) => {
      if (n.op !== 'fill' || n.missing === null) return;
      filling = true;
      out.push({ by: 'derived', node: i, origin: n.origin, said: fillSaid(n), reaches: all });
    });
    // Staged with nothing filled: held all the same, as the run asked.
    if (!filling) out.push({ by: 'derived', node: -1, origin: 'run', said: 'staged: released only by a decision', reaches: all });
  }
  return out;
}

// ------------------------------------------------------------------ what waits

/** A node and every node it reads, directly or not. */
function upstream(plan: Pick<FlowPlan, 'nodes'>, node: number): Set<number> {
  const seen = new Set<number>();
  const stack = [node];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i) || !plan.nodes[i]) continue;
    seen.add(i);
    stack.push(...plan.nodes[i]!.inputs);
  }
  return seen;
}

/** The outputs that read any source the node reads (a source reads itself), in the plan's order (by name). */
export function reachOf(plan: Pick<FlowPlan, 'nodes' | 'outputs'>, node: number): string[] {
  const sources = [...upstream(plan, node)].filter((i) => plan.nodes[i]!.op === 'table');
  return plan.outputs.filter((o) => {
    const up = upstream(plan, o.node);
    return sources.some((s) => up.has(s));
  }).map((o) => o.name);
}

/** The outputs a run's holds keep back: every output while anything holds (`together`, the default), else the
 * outputs the holds reach. None when nothing holds. */
export function heldOutputs(plan: Pick<FlowPlan, 'outputs' | 'publish'>, holds: readonly Pick<Hold, 'reaches'>[]): string[] {
  if (holds.length === 0) return [];
  if (plan.publish?.together !== false) return plan.outputs.map((o) => o.name);
  const reached = new Set(holds.flatMap((h) => h.reaches));
  return plan.outputs.filter((o) => reached.has(o.name)).map((o) => o.name);
}

/**
 * The held outputs that wait for a decision (ADR 0009 §4): those whose staged key isn't the key the name shows now.
 * A held output whose key is already current (the zones and the weather, which reuse theirs) has nothing to wait for.
 */
export function waitingOf(manifest: Pick<RunManifest, 'outputs'>, held: readonly string[], current: Readonly<Record<string, string | null | undefined>>): string[] {
  return held.filter((name) => {
    const staged = manifest.outputs[name]?.key;
    return staged !== undefined && staged !== current[name];
  });
}

/** Each named output's staged key, as a decision names them: `{ name: key }`. */
export function stagedKeys(manifest: Pick<RunManifest, 'outputs'>, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.filter((n) => manifest.outputs[n]).map((n) => [n, manifest.outputs[n]!.key]));
}

// ------------------------------------------------------------------ what the record says

/**
 * A run's inputs, which find its day again after the engine is gone (ADR 0009 §10): the flow hash, the parameters,
 * and each source's file (its sha256), or, for a source read from a table, its snapshot's content hash.
 */
export interface Inputs {
  flow: string;
  parameters: Record<string, string | number | null>;
  files: Record<string, string>;
}

export function inputsOf(manifest: Pick<RunManifest, 'flow' | 'parameters' | 'nodes'>): Inputs {
  const files: Record<string, string> = {};
  for (const n of manifest.nodes) if (n.op === 'table') files[n.origin] = n.file?.sha256 ?? n.content ?? '';
  return { flow: manifest.flow.hash, parameters: { ...manifest.parameters }, files };
}

/** Inputs as one comparable text: their canonical JSON. */
export const inputsKey = (i: Inputs): string => canonicalJSON(i);

/** Whether two `{ name: key }` maps name the same outputs with the same keys. */
export function sameKeys(a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && a[k] === b[k]);
}

/** A held run's record entry (`run`, outcome `held`), as ADR 0009 §9 has it: as an `ok` run's, with what holds it. */
export interface HeldAbout {
  run: number;
  manifest: string;
  outcome: 'held';
  /** The run's period value, the day (null without a period). */
  day: string | null;
  inputs: Inputs;
  holds: Hold[];
  /** The held outputs whose staged key isn't the one their name showed: a pause opens only when one waits. */
  waiting: string[];
  /**
   * Every held output's staged key (`stagedKeys(manifest, held)`): what a decision names. Not only the waiting ones:
   * the same day run again after a reload, in an empty engine, has every held output waiting, and the same keys, so
   * the decision is still the same one.
   */
  keys: Record<string, string>;
  /** With several watched sources (ADR 0010 §7): every load the run read (`loadsOf`), held or not. A run's entry, `ok`
   * or held, names them, so a load that holds no more is seen to pass. */
  loads?: Load[];
}

/** A run, by its number in the engine and its manifest's hash. */
export interface RunRef {
  run: number;
  manifest: string;
}

/**
 * A derived run's record entry (`run`, outcome `derived`, ADR 0009 amendment 1 S9): what a held run's carries (its day,
 * inputs, holds and staged keys), with the held run it repairs and the repair. Its inputs are its own (the derived
 * document's flow hash, the donor's file among its files), so it opens no pause: it belongs to its held run's.
 */
export interface DerivedAbout {
  run: number;
  manifest: string;
  outcome: 'derived';
  day: string | null;
  inputs: Inputs;
  holds: RunHold[];
  /** Its held outputs whose staged key isn't the one their name showed, as a held run's entry says. */
  waiting: string[];
  keys: Record<string, string>;
  from: RunRef;
  repair: Repair;
  /** The rows at the fill step, what readers would get at the source: for a day's versions. */
  rows?: number;
}

/** A decision's record entry (`decide`), appended before anything it decides is applied (ADR 0009 §9). */
export interface DecideAbout {
  day: string | null;
  run: number;
  manifest: string;
  inputs: Inputs;
  /** The outputs it is about, with the keys it lets out (or keeps back): the held run's. */
  outputs: Record<string, string>;
  option: DecisionOption;
  /** This day, or each held day after it until a day publishes. */
  scope: 'day' | 'untilPass';
  /** The hash of the policies it was checked against (E5), and the rule that allowed it (none for the owner). */
  policies: string;
  rule: string | null;
  /** The standing decision it applies, by its entry's seq. */
  under?: number;
  /** A fill or the complete part (amendment 1 S9): the remedy, from which the derived document is made again. */
  repair?: Repair;
  /** The derived run whose versions go out, with their keys; null for a backfill whose donor hasn't come yet. */
  derived?: (RunRef & { keys: Record<string, string> }) | null;
  /** Accept the new level (amendment 1 S6, C6): the source, the day the level starts and the metrics it names, as
   * `metricKey` does. A day published under a standing level (`under`) names the same level. */
  level?: { source: string; from: string; metrics: string[]; band?: { column: string; value: string; share: [number, number] } };
  /**
   * With several watched sources (ADR 0010 §7): the load it is about, in place of the outputs (`outputs` is empty, or,
   * for a fill, the derived run's keys as evidence): one decision a load, applied to every run that carries it.
   */
  load?: Load;
}

/** A release's record entry (`release`), citing the decision it applies. */
export interface ReleaseAbout {
  run: number;
  manifest: string;
  outputs: Record<string, string>;
  /** The decide entry it cites: its seq and its log/1 leaf. */
  decision: number;
  leaf: string;
  outcome: 'applied' | 'refused';
  why: string | null;
  /** A derived run's release (amendment 1 S9): the held run it repairs, the repair as resolved, and the rows it took
   * from another day, at the source. */
  from?: RunRef;
  repair?: Repair;
  filled?: number;
  /** The standing decision it applies, or the `flow` entry of a `meanwhile` setting. */
  under?: number;
  /** A withdrawal (Q-61): the release of the fill it takes back, by its seq. */
  withdraws?: number;
  /** With several watched sources (ADR 0010 §7): every decide entry it applies, one a load that holds the outputs it
   * names, by seq; `decision` is the first. */
  decisions?: number[];
}

/** A decision as the record holds it. */
export interface Decided {
  seq: number;
  at: string;
  /** The principal who decided. */
  by: string;
  reason: string | null;
  amends: number | null;
  about: DecideAbout;
}

/** A day held and what became of it, as the record tells it. */
export interface Pause {
  /** Its inputs, and the same as one text (`inputsKey`): what finds the day again. */
  key: string;
  inputs: Inputs;
  day: string | null;
  /** The latest held run of these inputs, its manifest, its waiting outputs with their staged keys, and its holds. */
  run: number;
  manifest: string;
  keys: Record<string, string>;
  waiting: string[];
  holds: Hold[];
  /** The seq of the entry that opened it, and of the latest held run. */
  opened: number;
  seq: number;
  /** Open: waiting for a person. Decided: a decision for these keys stands. Passed: a later run of the same inputs
   * passed, and published. */
  state: 'open' | 'decided' | 'passed';
  /** The latest decision for these inputs, amendments included. */
  decision: Decided | null;
  /** The decision names other keys than the latest held run's (made under another build): shown, applied only by a
   * person, as an amendment. */
  otherBuild: boolean;
  /**
   * Whether readers got the day: an applied release cites a decision of these inputs to publish as is, naming the
   * pause's keys (a crash between the two leaves the decision to be applied the next time the day runs). It stands
   * whatever was decided after it: a release as is is never taken back. Null when no decision of these inputs publishes.
   */
  released: boolean | null;
  /**
   * What readers got of the day from a remedy (amendment 1 S5): the last applied release of a fill or of the part that
   * arrived, unless a withdrawal took it back since. `meanwhile` when it was released under the flow's `meanwhile`
   * setting, while a person still decides. Null when none.
   */
  repaired: { option: 'fill' | 'complete'; release: number; decision: number; donor: string | null; meanwhile: boolean } | null;
  /** The applied withdrawal that took the day's fill back (Q-61), by its seq; null when none since the last fill. */
  withdrawn: number | null;
  /** With several watched sources (ADR 0010 §7): the load it is about. Such a pause is keyed by its load, not by the
   * run's inputs: every later run that still reads the load carries it, and one decision decides it. `day` is its slot. */
  load?: Load;
}

type EntryLike = Pick<LogEntry, 'seq' | 'kind' | 'at' | 'by' | 'about' | 'reason' | 'amends'>;

function isInputs(v: unknown): v is Inputs {
  return isRecord(v) && typeof v.flow === 'string' && isRecord(v.parameters) && isRecord(v.files) && Object.values(v.files).every((x) => typeof x === 'string');
}
const isKeys = (v: unknown): v is Record<string, string> => isRecord(v) && Object.values(v).every((x) => typeof x === 'string');

function isDecide(a: unknown): a is DecideAbout {
  return isRecord(a) && isInputs(a.inputs) && isKeys(a.outputs) && (DECIDE_OPTIONS as readonly unknown[]).includes(a.option) && (a.scope === 'day' || a.scope === 'untilPass')
    && (a.day === null || typeof a.day === 'string') && (a.under === undefined || Number.isInteger(a.under))
    && ((a.option !== 'fill' && a.option !== 'complete') || isRecord(a.repair))
    && (a.option !== 'accept' || isLevel(a.level));
}

/** Whether a value is a decision's level: its source, the day it starts and the metrics it names. */
export const isLevel = (v: unknown): v is NonNullable<DecideAbout['level']> =>
  isRecord(v) && typeof v.source === 'string' && typeof v.from === 'string' && DAY.test(v.from) && Array.isArray(v.metrics) && v.metrics.length > 0 && v.metrics.every((m) => typeof m === 'string')
  && (v.band === undefined || (isRecord(v.band) && typeof v.band.column === 'string' && typeof v.band.value === 'string' && Array.isArray(v.band.share) && v.band.share.length === 2 && v.band.share.every((x) => typeof x === 'number' && x >= 0 && x <= 1) && (v.band.share[0] as number) <= (v.band.share[1] as number)));

/** Whether an option publishes the held run as it came: publish as is, or accept the new level (S6). */
const asCame = (o: unknown): boolean => o === 'asis' || o === 'accept';

const isRemedy = (o: unknown): o is 'fill' | 'complete' => o === 'fill' || o === 'complete';

function isHeld(a: unknown): a is HeldAbout {
  return isRecord(a) && a.outcome === 'held' && isInputs(a.inputs) && isKeys(a.keys) && Number.isInteger(a.run) && typeof a.manifest === 'string';
}

/** The day an entry is about: its own `day`, else its inputs' period value, else (a run of an earlier build) its load. */
function dayOf(a: Record<string, unknown>, period: string | null | undefined): string | null {
  if (typeof a.day === 'string') return a.day;
  const v = period && isInputs(a.inputs) ? a.inputs.parameters[period] : undefined;
  if (typeof v === 'string') return v;
  return typeof a.load === 'string' ? a.load : null;
}

const decided = (e: EntryLike, about: DecideAbout): Decided => ({ seq: e.seq, at: e.at, by: e.by.as, reason: e.reason, amends: e.amends, about });

/**
 * The days held and what became of each, from a flow's record, by their inputs (ADR 0009 §10). A pause opens with a
 * `run` entry whose outcome is held; the latest `decide` entry for the same inputs, amendments included, decides it
 * when its keys are the held run's; a later `ok` run of the same inputs closes it as passed. A derived run (outcome
 * `derived`) opens none: its releases say what readers got of its held run's day (`repaired`). In the order they
 * opened.
 */
export function pausesOf(entries: readonly EntryLike[], period?: string | null): Pause[] {
  const pauses = new Map<string, Pause>();
  const releases = new Map<number, ReleaseAbout['outcome']>();
  // The pause each held run's manifest belongs to; each decision's pause; the flow entries (a `meanwhile` release
  // cites the one that set it); and the applied releases, in order.
  const held = new Map<string, string>();
  const decisions = new Map<number, { key: string; about: DecideAbout }>();
  const flows = new Set<number>();
  const applied: { seq: number; about: Record<string, unknown> }[] = [];
  // Each pause's decisions to publish as is, by their seq, with the keys each names.
  const asis = new Map<string, Map<number, Record<string, string>>>();
  const blank = (key: string, inputs: Inputs, seq: number, run: number, manifest: string): Pause => ({ key, inputs, day: null, run, manifest, keys: {}, waiting: [], holds: [], opened: seq, seq, state: 'open', decision: null, otherBuild: false, released: null, repaired: null, withdrawn: null });
  // A load that a run read and doesn't hold (or a run that published) passes its pause (ADR 0010 §7).
  const pass = (loads: unknown, holding: ReadonlySet<string>) => {
    if (!Array.isArray(loads)) return;
    for (const l of loads) {
      if (!isLoad(l) || holding.has(loadKey(l))) continue;
      const p = pauses.get(`load:${loadKey(l)}`);
      if (p) p.state = 'passed';
    }
  };
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    if (e.kind === 'run' && isHeld(a) && Array.isArray(a.holds) && a.holds.some((h) => isLoad(h.load))) {
      // Several watched sources: a pause a load, keyed by it (ADR 0010 §7). Each load's holds keep back the outputs
      // they reach; a later run that reads the load again carries the same pause.
      const byKey = new Map<string, { load: Load; holds: Hold[] }>();
      for (const h of a.holds) if (isLoad(h.load)) byKey.set(loadKey(h.load), { load: h.load, holds: [...(byKey.get(loadKey(h.load))?.holds ?? []), h] });
      const waitingAll = Array.isArray(a.waiting) ? a.waiting : Object.keys(a.keys);
      for (const [lk, { load, holds }] of byKey) {
        const reach = new Set(holds.flatMap((h) => h.reaches));
        const keys = Object.fromEntries(Object.entries(a.keys).filter(([n]) => reach.has(n)));
        const waiting = waitingAll.filter((n) => reach.has(n));
        if (waiting.length === 0 || Object.keys(keys).length === 0) continue;
        const key = `load:${lk}`;
        held.set(a.manifest, key);
        const p = pauses.get(key) ?? blank(key, a.inputs, e.seq, a.run, a.manifest);
        Object.assign(p, { load: { source: load.source, slot: load.slot, sha256: load.sha256 }, day: load.slot, inputs: a.inputs, run: a.run, manifest: a.manifest, keys, waiting, holds, seq: e.seq });
        p.otherBuild = false;
        p.state = p.decision ? 'decided' : 'open';
        pauses.set(key, p);
      }
      pass(a.loads, new Set(byKey.keys()));
    } else if (e.kind === 'run' && isHeld(a)) {
      const key = inputsKey(a.inputs);
      // Nothing waits (every held output's staged key is already current, as after a day published as is is run
      // again): there is nothing to decide, and nothing to open or change.
      const waiting = Array.isArray(a.waiting) ? a.waiting : Object.keys(a.keys);
      pass(a.loads, new Set());
      if (waiting.length === 0 || Object.keys(a.keys).length === 0) continue;
      held.set(a.manifest, key);
      const p = pauses.get(key) ?? blank(key, a.inputs, e.seq, a.run, a.manifest);
      Object.assign(p, { day: dayOf(a, period), run: a.run, manifest: a.manifest, keys: { ...a.keys }, waiting: [...waiting], holds: Array.isArray(a.holds) ? a.holds : [], seq: e.seq });
      p.otherBuild = !!p.decision && !sameKeys(p.decision.about.outputs, p.keys);
      p.state = p.decision && !p.otherBuild ? 'decided' : 'open';
      pauses.set(key, p);
    } else if (e.kind === 'run' && a.outcome === 'ok' && isInputs(a.inputs)) {
      const p = pauses.get(inputsKey(a.inputs));
      if (p) p.state = 'passed';
      pass(a.loads, new Set());
    } else if (e.kind === 'decide' && isDecide(a)) {
      const key = isLoad(a.load) ? `load:${loadKey(a.load)}` : inputsKey(a.inputs);
      const p = pauses.get(key) ?? { ...blank(key, a.inputs, e.seq, a.run, a.manifest), day: a.day, keys: { ...a.outputs }, waiting: Object.keys(a.outputs), ...(isLoad(a.load) ? { load: { ...a.load }, day: a.load.slot } : {}) };
      p.decision = decided(e, a);
      // A load's decision names the load, not keys: it decides every run that carries it.
      p.otherBuild = !isLoad(a.load) && !sameKeys(a.outputs, p.keys);
      p.state = p.otherBuild ? 'open' : 'decided';
      pauses.set(key, p);
      if (asCame(a.option)) asis.set(key, (asis.get(key) ?? new Map()).set(e.seq, a.outputs));
      decisions.set(e.seq, { key, about: a });
    } else if (e.kind === 'flow') {
      flows.add(e.seq);
    } else if (e.kind === 'release' && Number.isInteger(a.decision) && (a.outcome === 'applied' || a.outcome === 'refused')) {
      const cited = Array.isArray(a.decisions) && a.decisions.every((d) => Number.isInteger(d)) ? (a.decisions as number[]) : [a.decision as number];
      for (const d of cited) if (releases.get(d) !== 'applied') releases.set(d, a.outcome);
      if (a.outcome === 'applied') applied.push({ seq: e.seq, about: a });
    }
  }
  const out = [...pauses.values()].sort((x, y) => x.opened - y.opened);
  for (const p of out) {
    const mine = asis.get(p.key);
    // A load's decision to publish is released when a release cites it: its keys are each run's own.
    p.released = mine ? [...mine].some(([seq, keys]) => releases.get(seq) === 'applied' && (p.load !== undefined || sameKeys(keys, p.keys))) : null;
  }
  // What readers got from remedies (amendment 1 S5, Q-61), release by release in the record's order: a fill or the part
  // alone, released for a decision of the day or under the flow's `meanwhile` setting, until a withdrawal takes it back.
  for (const { seq, about: a } of applied) {
    const d = decisions.get(a.decision as number);
    if (Number.isInteger(a.withdraws)) {
      const p = d && pauses.get(d.key);
      if (p) (p.repaired = null), (p.withdrawn = seq);
      continue;
    }
    const meanwhile = !d && flows.has(a.decision as number);
    const key = d ? d.key : meanwhile && isRecord(a.from) && typeof a.from.manifest === 'string' ? held.get(a.from.manifest) : undefined;
    const p = key === undefined ? undefined : pauses.get(key);
    const repair = (isRecord(a.repair) ? a.repair : d?.about.repair) as Repair | undefined;
    const option = d ? d.about.option : repair?.kind;
    if (!p || !isRemedy(option)) continue;
    p.repaired = { option, release: seq, decision: a.decision as number, donor: repair?.donor?.day ?? null, meanwhile };
    p.withdrawn = null;
  }
  // A withdrawal made once a later day was current moves no name back, so the engine has no release of it (amendment 1
  // S5): the decision not to publish, made after the fill went out, withdraws it in the record all the same, and the day
  // is not published; readers keep the later day.
  for (const p of out) {
    if (p.repaired && p.decision && p.decision.about.option === 'dont' && p.decision.amends !== null && p.decision.seq > p.repaired.release) (p.repaired = null), (p.withdrawn = p.decision.seq);
  }
  return out;
}

/**
 * The latest decision about a load (ADR 0010 §7), amendments included: what every run that carries the load applies
 * again, whatever its other sources' loads (their keys change with each). Null when the load was never decided.
 */
export function decisionForLoad(entries: readonly EntryLike[], load: Load): Decided | null {
  const key = loadKey(load);
  let found: Decided | null = null;
  for (const e of entries) if (e.kind === 'decide' && isDecide(e.about) && isLoad(e.about.load) && loadKey(e.about.load) === key) found = decided(e, e.about);
  return found;
}

/**
 * The standing decision a held load falls under (ADR 0009 §6, ADR 0010 §7): the decision not to publish, to fill, or to
 * publish only the part that arrived, "until a load passes", about the nearest earlier load of the same source (never
 * one amended since, never one applied under another), when no load of that source after it and before this one passed:
 * read by a run that didn't hold it, or published by a release of a decision about it to publish. Slots compare as
 * text, so ids order in time.
 */
export function standingForLoad(entries: readonly EntryLike[], load: Load): Decided | null {
  const source = load.source.toLowerCase();
  const amended = new Set(entries.filter((e) => e.kind === 'decide' && e.amends !== null).map((e) => e.amends));
  let best: Decided | null = null;
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (e.kind !== 'decide' || !isDecide(a) || !isLoad(a.load) || a.load.source.toLowerCase() !== source) continue;
    if ((a.option !== 'dont' && !isRemedy(a.option)) || a.scope !== 'untilPass' || a.under !== undefined || amended.has(e.seq) || !(a.load.slot < load.slot)) continue;
    if (!best || a.load.slot > best.about.load!.slot || (a.load.slot === best.about.load!.slot && e.seq > best.seq)) best = decided(e, a);
  }
  if (!best) return null;
  const from = best.about.load!.slot;
  const between = (l: Load) => l.source.toLowerCase() === source && l.slot > from && l.slot < load.slot;
  const publishing = new Set<number>();
  for (const e of entries) if (e.kind === 'decide' && isDecide(e.about) && isLoad(e.about.load) && between(e.about.load) && asCame(e.about.option)) publishing.add(e.seq);
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    if (e.kind === 'run' && (a.outcome === 'ok' || a.outcome === 'held') && Array.isArray(a.loads)) {
      const holding = new Set((Array.isArray(a.holds) ? (a.holds as unknown as Hold[]) : []).flatMap((h) => (isLoad(h.load) ? [loadKey(h.load)] : [])));
      if ((a.loads as unknown[]).some((l) => isLoad(l) && between(l) && !holding.has(loadKey(l)))) return null;
    } else if (e.kind === 'release' && a.outcome === 'applied') {
      const cited = Array.isArray(a.decisions) ? (a.decisions as number[]) : [a.decision as number];
      if (cited.some((d) => publishing.has(d))) return null;
    }
  }
  return best;
}

/**
 * The days the record leaves out of learning (ADR 0010 §5, C5, Q-80): every day held and not published as is, whether
 * still waiting, not published, filled, or the part that arrived published alone. A day published as is, or passed
 * by a later run of the same inputs, is learned from, as a day published as it arrived is. In order. With several
 * watched sources, a source's slots its loads' pauses leave out (`source`), and every pause of a day otherwise.
 */
export function skipOf(entries: readonly EntryLike[], period?: string | null, source?: string): string[] {
  const out = new Set<string>();
  for (const p of pausesOf(entries, period)) {
    if (p.day === null || p.state === 'passed') continue;
    if (p.state === 'decided' && asCame(p.decision?.about.option)) continue;
    // With several watched sources, a load's pause leaves out its slot for its own source alone (ADR 0010 §7).
    if (p.load && source !== undefined && p.load.source.toLowerCase() !== source.toLowerCase()) continue;
    out.add(p.day);
  }
  return [...out].sort();
}

/**
 * The levels a source was accepted at (ADR 0010 §5, C6), which its claims name and its ranges learn from: each Accept
 * the new level of the source whose release applied (a decision taken under a standing level names the same level,
 * and adds none), never amended since; with the decide entry's seq. In the order they start.
 */
export function levelsOf(entries: readonly EntryLike[], source: string): ClaimLevel[] {
  const amended = new Set(entries.filter((e) => e.kind === 'decide' && e.amends !== null).map((e) => e.amends));
  const applied = new Set<number>();
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (e.kind === 'release' && isRecord(a) && a.outcome === 'applied' && Number.isInteger(a.decision)) applied.add(a.decision as number);
  }
  const out: ClaimLevel[] = [];
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (e.kind !== 'decide' || !isDecide(a) || a.option !== 'accept' || a.under !== undefined || amended.has(e.seq) || !applied.has(e.seq)) continue;
    if (a.level!.source.toLowerCase() !== source.toLowerCase()) continue;
    out.push({ from: a.level!.from, metrics: [...a.level!.metrics], decision: e.seq });
  }
  return out.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.decision - y.decision));
}

/**
 * The accepted level a later held day publishes under (ADR 0009 amendment 1 S6, the owner, Q-57b: one acceptance
 * covers the following days while the numbers stay at the new level): the source's latest Accept that starts before
 * the day, its release applied, when every metric that is off on the day (`off`: each with the way it is off, up or
 * down; fill.ts `levelWays`) is one the level names and off the way it was on the level's own day (`ways`, the same of
 * that day's story), and nothing else holds the day (`only`: the story alone). Null when none stands: a new change,
 * another metric off, a metric going back the other way (a vendor that returns), or a check, pauses the day again.
 */
export function levelFor(entries: readonly EntryLike[], source: string, day: string, offAt: ReadonlyMap<string, boolean> | ((from: string) => ReadonlyMap<string, boolean>), ways: (from: string) => ReadonlyMap<string, boolean>, only = true): Decided | null {
  if (!only) return null;
  const levels = levelsOf(entries, source).filter((l) => l.from < day);
  const latest = levels.at(-1);
  if (!latest) return null;
  // What is off on the day, told against the level's own day when the caller can (fill.ts levelWays with `then`).
  const off = typeof offAt === 'function' ? offAt(latest.from) : offAt;
  if (off.size === 0) return null;
  const was = ways(latest.from);
  if (![...off].every(([m, up]) => latest.metrics.includes(m) && was.get(m) === up)) return null;
  const e = entries.find((x) => x.seq === latest.decision)!;
  return decided(e, e.about as unknown as DecideAbout);
}

/**
 * The days a flow's record says were published, in the order they were: by a passing run, or by an applied release
 * (its decision's day). A day published twice is listed twice.
 */
function publishedDays(entries: readonly EntryLike[], period: string | null | undefined): { seq: number; day: string; decision?: number }[] {
  const decisionDay = new Map<number, string | null>();
  const out: { seq: number; day: string; decision?: number }[] = [];
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    if (e.kind === 'decide' && isDecide(a)) decisionDay.set(e.seq, a.day);
    else if (e.kind === 'run' && a.outcome === 'ok') {
      const d = dayOf(a, period);
      if (d) out.push({ seq: e.seq, day: d });
    } else if (e.kind === 'release' && a.outcome === 'applied') {
      const decision = Number.isInteger(a.decision) ? (a.decision as number) : undefined;
      // A withdrawal (Q-61) points the names back at what they showed before the fill it takes back: that day again.
      if (Number.isInteger(a.withdraws)) {
        const k = out.findIndex((p) => p.seq === a.withdraws);
        const back = k > 0 ? out[k - 1]!.day : null;
        if (back) out.push({ seq: e.seq, day: back, ...(decision !== undefined ? { decision } : {}) });
        continue;
      }
      const d = (decision !== undefined ? decisionDay.get(decision) : null) ?? dayOf(a, period);
      if (d) out.push({ seq: e.seq, day: d, ...(decision !== undefined ? { decision } : {}) });
    }
  }
  return out;
}

/**
 * The day readers saw at the end of a flow's record: the day of its last publication (a passing run, or an applied
 * release), since each one points the names at its day (an earlier day passing moves them back, Q-51). Read before a
 * decision's entry, the day readers had when it was made: what a decision not to publish kept. Null when nothing has
 * published.
 */
export function lastPublished(entries: readonly EntryLike[], period?: string | null): string | null {
  return publishedDays(entries, period).at(-1)?.day ?? null;
}

/**
 * The standing decision a held day falls under (ADR 0009 §6), if any: the decision not to publish, to fill, or to
 * publish only the part that arrived (amendment 1 S5, Q-64), "until a day passes", made for the nearest day before it
 * (the latest such entry for that day, never one amended since, never one applied under another), when no day after
 * that one and before this one has published, by a passing run or an applied release other than its own and those
 * under it (or under a decision it amends). A withdrawal of a fill it covered ends it too (Q-61): later days wait for a person. Publish as is never
 * stands (Q-50). Days compare as text, so ISO dates order as days.
 */
export function standingFor(entries: readonly EntryLike[], day: string, period?: string | null): Decided | null {
  const amended = new Set(entries.filter((e) => e.kind === 'decide' && e.amends !== null).map((e) => e.amends));
  const bySeq = new Map(entries.map((e) => [e.seq, e]));
  const ended = new Set<number>();
  for (const e of entries) {
    if (e.kind !== 'decide' || e.amends === null || !isDecide(e.about) || e.about.option !== 'dont') continue;
    const was = bySeq.get(e.amends)?.about;
    if (!isDecide(was) || !isRemedy(was.option)) continue;
    ended.add(e.amends);
    if (was.under !== undefined) ended.add(was.under);
  }
  let best: Decided | null = null;
  const under = new Map<number, number>();
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (e.kind !== 'decide' || !isDecide(a)) continue;
    if (a.under !== undefined) under.set(e.seq, a.under);
    if ((a.option !== 'dont' && !isRemedy(a.option)) || a.scope !== 'untilPass' || a.under !== undefined || amended.has(e.seq) || ended.has(e.seq) || a.day === null || !(a.day < day)) continue;
    if (!best || a.day > best.about.day! || (a.day === best.about.day && e.seq > best.seq)) best = decided(e, a);
  }
  if (!best) return null;
  const from = best.about.day!;
  // Its own releases, and those under it, end nothing: under the decisions it amends too (a refill of a standing fill).
  const chain = new Set<number>();
  for (let at: number | null | undefined = best.seq; at !== null && at !== undefined && !chain.has(at); at = bySeq.get(at)?.amends) chain.add(at);
  const own = (p: { decision?: number }) => p.decision !== undefined && (chain.has(p.decision) || chain.has(under.get(p.decision) ?? -1));
  return publishedDays(entries, period).some((p) => p.day > from && p.day < day && !own(p)) ? null : best;
}

/**
 * The standing decision an entry ends (ADR 0009 §12's "· ends #26"), by standingFor's own rule: a passing run, or an
 * applied release, publishes its day, and a decision that stood for that day just before it stands for no day after
 * it. Null for any other entry, for a day the decision is not before (a day before it publishing ends nothing), for a
 * decision amended or applied under another, and for a day already published (a run again ends nothing again).
 */
export function standingEnds(entries: readonly EntryLike[], index: number, period?: string | null): number | null {
  const e = entries[index];
  if (!e) return null;
  const before = entries.slice(0, index);
  const mine = publishedDays(entries.slice(0, index + 1), period).find((p) => p.seq === e.seq);
  if (!mine || publishedDays(before, period).some((p) => p.day === mine.day)) return null;
  const stood = standingFor(before, mine.day, period);
  if (!stood) return null;
  // A release that applies the standing decision itself (a fill that stands until a day passes, Q-64, released for the
  // day under it) is the decision at work: it ends nothing.
  const d = mine.decision !== undefined ? entries.find((x) => x.seq === mine.decision)?.about : undefined;
  if (mine.decision === stood.seq || (isDecide(d) && d.under === stood.seq)) return null;
  return stood.seq;
}

/**
 * A decision to apply again to a day held once more (ADR 0009 §10): the latest decision for the same inputs, `same`
 * when it names these keys (applied again, recorded as citing it) or `otherBuild` when it names others (shown, and
 * applied only by a person, as an amendment). Null when the day was never decided. `keys` are the run's held outputs
 * with their staged keys (`stagedKeys(manifest, held)`), as its record entry names them; with none waiting there is
 * nothing to apply.
 */
export function decisionFor(entries: readonly EntryLike[], inputs: Inputs, keys: Readonly<Record<string, string>>): { kind: 'same' | 'otherBuild'; decision: Decided } | null {
  const key = inputsKey(inputs);
  let found: Decided | null = null;
  for (const e of entries) if (e.kind === 'decide' && isDecide(e.about) && inputsKey(e.about.inputs) === key) found = decided(e, e.about);
  return found ? { kind: sameKeys(found.about.outputs, keys) ? 'same' : 'otherBuild', decision: found } : null;
}

/**
 * What became of a held day (ADR 0009 §6, §12): `waiting` for a decision, `asis` published as is, `dont` not published
 * (or its fill withdrawn, Q-61), `fill` filled and `complete` published with the part that arrived (amendment 1 S5),
 * once their release applied.
 * From a held run in this engine (how many holds and waiting outputs it has, and whether a release of it applied here)
 * and the record's pause of its inputs; or, with no run here (a day held in an earlier visit), from the pause alone.
 * Published as is needs the release applied (here, or in the record before the engine was lost) or, with a run here,
 * nothing left waiting; until then the day still waits, decided or not. An applied release stands over any decision
 * after it, since readers have the day. Null for a run that published, a pause a passing run closed, and a held run
 * with nothing waiting and nothing decided (each name already shows its versions: there is nothing to decide).
 */
export function dayState(run: { holds: number; waiting: number; released: boolean } | null, pause: (Pick<Pause, 'state' | 'decision' | 'released'> & Partial<Pick<Pause, 'repaired'>>) | null): DayState | null {
  // A remedy readers have (amendment 1 S5): the day is filled, or published with the part that arrived, once its
  // release applied; a release under the flow's `meanwhile` setting leaves it waiting for a person. A later decision not
  // to publish (a withdrawal, Q-61) makes it not published, whether or not the names could go back.
  const remedy = (d: Decided | null): DayState | null => {
    const r = pause?.repaired;
    if (!r || d?.about.option === 'dont') return null;
    return r.meanwhile && !(d && isRemedy(d.about.option)) ? null : r.option;
  };
  // Published as it came by an Accept (S6): the day readers got is the new level's first.
  const came = (): DayState => (pause?.decision?.about.option === 'accept' ? 'accepted' : 'asis');
  if (!run) {
    if (!pause || pause.state === 'passed') return null;
    if (pause.released === true) return came();
    const d = pause.state === 'decided' ? pause.decision : null;
    return remedy(d) ?? (d?.about.option === 'dont' ? 'dont' : 'waiting');
  }
  if (run.holds === 0) return null;
  if (run.released || pause?.released === true) return came();
  const d = pause?.state === 'decided' ? pause.decision : null;
  const r = remedy(d);
  if (r) return r;
  if (d?.about.option === 'dont') return 'dont';
  if (asCame(d?.about.option) && run.waiting === 0) return came();
  return run.waiting === 0 ? null : 'waiting';
}

/**
 * `dayState` as slice 1's screens draw it, until they draw the remedies (step A9): a day filled, or published with the
 * part that arrived, is a day readers got, so it reads as published.
 */
export function pauseState(run: { holds: number; waiting: number; released: boolean } | null, pause: (Pick<Pause, 'state' | 'decision' | 'released'> & Partial<Pick<Pause, 'repaired'>>) | null): PauseState | null {
  const s = dayState(run, pause);
  return s === 'fill' || s === 'complete' || s === 'accepted' ? 'asis' : s;
}
