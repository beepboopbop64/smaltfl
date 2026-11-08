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
import type { PauseState } from './days.js';
import type { FlowDocument, HoldKind } from './document.js';
import type { HistoryRanges } from './history.js';
import type { JSONValue, LogEntry } from './log.js';
import type { ExpectationResult, RunManifest } from './manifest.js';
import { newsOf, type Names } from './news.js';
import type { ExpectNode, FlowPlan } from './plan.js';
import { DECIDE_OPTIONS, type DecideOption } from './policy.js';
import { storyOf, type Story } from './story.js';

export { DECIDE, DECIDE_OPTIONS, checkDecision, type DecideOption } from './policy.js';

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
}

/** A watched source as the plugin judged it: by its claim, or not judged, with why. */
export type Judged = { node: number; claim: StoryClaim } | { node: number; unjudged: string };

/** What holds a run: the checks at a step, a source's story, or a source not judged; and the outputs it reaches. */
export interface Hold {
  by: 'checks' | 'story' | 'unjudged';
  node: number;
  origin: string;
  /** What it says: the checks' counts, the story's head, or why the source wasn't judged. */
  said: string;
  /** The outputs that read any source the holding node reads (`reachOf`). */
  reaches: string[];
  /** A story hold: the claim it rests on. */
  claim?: StoryClaim;
}

const RAW: Names = { column: (c) => c, value: (_c, v) => String(v) };

/**
 * Whether the history counts the document's checks: the step it counted reads the source alone, with the same rules
 * (names, checks and what each does). A box put in front of the source would leave the checks other rows to count.
 */
export function countedChecks(doc: Pick<FlowDocument, 'steps'>, h: HistoryRanges, source: string | undefined): boolean {
  const step = doc.steps.find((x) => x.id === h.file.step);
  return !!source && step?.kind === 'expectations' && step.inputs.length === 1 && step.inputs[0] === source
    && h.sameChecks(step.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })));
}

/**
 * The flow's story of a day (ADR 0009 §3): told with raw names, no hidden columns, no findings marked as expected, no
 * episode, and no gate (the checks hold from the run's own counts). `h` must learn from every day of the history:
 * leaving incident days out is one browser's choice, not the flow's.
 */
export function flowStory(h: HistoryRanges, day: string, doc: Pick<FlowDocument, 'steps'>, source: string): Story {
  if (h.skipped > 0) throw new Error("the flow's verdict learns from every day of the history: these ranges leave days out");
  return storyOf(h, day, newsOf(h, day, RAW, { checks: countedChecks(doc, h, source) }), { names: RAW, episode: false });
}

/**
 * The claim a page passes to a run for a watched source's day, from the history file it checked against the data's
 * list (ADR 0006 §2) and pinned in the engine. Null for a day the history doesn't have: the run holds it as not judged.
 */
export function dayClaim(h: HistoryRanges, doc: Pick<FlowDocument, 'steps'>, file: HistoryRef, day: string, source: string, build: string): StoryClaim | null {
  const k = h.file.days.indexOf(day);
  if (k < 0) return null;
  const s = flowStory(h, day, doc, source);
  return { by: 'story', source, day, state: s.state, below: !!s.amount && s.amount.value < s.amount.low, head: s.head, build, history: { path: file.path, sha256: file.sha256, bytes: file.bytes }, rows: h.file.rows[k]! };
}

/** Whether a claim holds under the flow's hold kinds: `wrong` on any day the story says something wrong, `short` only
 * when its rows are below their range too. A refused file, never told to a run, holds under either. */
export function claimHolds(hold: readonly HoldKind[], c: Pick<StoryClaim, 'state' | 'below'>): boolean {
  if (c.state === 'refused') return hold.includes('wrong') || hold.includes('short');
  return c.state === 'wrong' && (hold.includes('wrong') || (hold.includes('short') && c.below));
}

// ------------------------------------------------------------------ what holds

/** What the plugin knows of a run when it judges its claims: each watched node's snapshot rows, and the files pinned
 * in the engine, as the engine hashed them. */
export interface ClaimFacts {
  rows(node: number): number | undefined;
  pinned(path: string): { sha256: string; bytes: number } | undefined;
}

const STATES: readonly string[] = ['calm', 'notes', 'unusual', 'wrong', 'refused', 'recovery'];
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
  return null;
}

/**
 * Each watched source of a plan judged by its claim (ADR 0009 §3), or not judged when there is no claim for it, more
 * than one, or one that isn't shaped as a claim, names another day than the run's period, was told from another
 * history than the file pinned under the watch's name, or counts other rows than the snapshot holds. Not judged holds.
 */
export function judgeClaims(plan: Pick<FlowPlan, 'nodes' | 'parameters' | 'publish'>, claims: readonly unknown[] | undefined, facts: ClaimFacts): Judged[] {
  const pub = plan.publish;
  if (!pub) return [];
  const day = pub.period === null ? undefined : plan.parameters[pub.period];
  return pub.watch.map(([node, file]): Judged => {
    const origin = plan.nodes[node]!.origin;
    const mine = (claims ?? []).filter((c): c is Record<string, unknown> => isRecord(c) && typeof c.source === 'string' && c.source.toLowerCase() === origin.toLowerCase());
    if (mine.length === 0) return { node, unjudged: `no claim for ${origin}` };
    if (mine.length > 1) return { node, unjudged: `${mine.length} claims for ${origin}` };
    const c = mine[0]!;
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
    return { node, claim: { by: 'story', source: claim.source, day: claim.day, state: claim.state, below: claim.below, head: claim.head, build: claim.build, history: { path: claim.history.path, sha256: claim.history.sha256, bytes: claim.history.bytes }, rows: claim.rows } };
  });
}

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
 * What holds a run (ADR 0009 §3), from its plan, its manifest and its judged sources: with `checks` in `hold`, each
 * step whose counts trip (a step whose counts are missing holds too); each watched source whose claim holds under
 * `hold`; each watched source not judged. None for a plan that doesn't say what holds it. In node order, checks first.
 */
export function holdsOf(plan: Pick<FlowPlan, 'nodes' | 'outputs' | 'publish'>, manifest: Pick<RunManifest, 'nodes'>, judged: readonly Judged[]): Hold[] {
  const pub = plan.publish;
  if (!pub) return [];
  const out: Hold[] = [];
  if (pub.hold.includes('checks'))
    plan.nodes.forEach((n, i) => {
      if (n.op !== 'expect') return;
      const counts = manifest.nodes.find((m) => m.node === i)?.expectations;
      const said = counts ? tripped(n, counts) : 'its checks were not counted';
      if (said) out.push({ by: 'checks', node: i, origin: n.origin, said, reaches: reachOf(plan, i) });
    });
  for (const [node] of pub.watch) {
    const origin = plan.nodes[node]!.origin;
    const mine = judged.filter((j) => j.node === node);
    const j = mine.length === 1 ? mine[0]! : null;
    if (!j || 'unjudged' in j) out.push({ by: 'unjudged', node, origin, said: j && 'unjudged' in j ? j.unjudged : mine.length ? `${mine.length} verdicts for ${origin}` : `no claim for ${origin}`, reaches: reachOf(plan, node) });
    else if (claimHolds(pub.hold, j.claim)) out.push({ by: 'story', node, origin, said: j.claim.head, reaches: reachOf(plan, node), claim: j.claim });
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
}

/** A decision's record entry (`decide`), appended before anything it decides is applied (ADR 0009 §9). */
export interface DecideAbout {
  day: string | null;
  run: number;
  manifest: string;
  inputs: Inputs;
  /** The outputs it is about, with the keys it lets out (or keeps back). */
  outputs: Record<string, string>;
  option: DecideOption;
  /** This day, or each held day after it until a day publishes. */
  scope: 'day' | 'untilPass';
  /** The hash of the policies it was checked against (E5), and the rule that allowed it (none for the owner). */
  policies: string;
  rule: string | null;
  /** The standing decision it applies, by its entry's seq. */
  under?: number;
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
   * whatever was decided after it: a release is never taken back. Null when no decision of these inputs publishes.
   */
  released: boolean | null;
}

type EntryLike = Pick<LogEntry, 'seq' | 'kind' | 'at' | 'by' | 'about' | 'reason' | 'amends'>;

function isInputs(v: unknown): v is Inputs {
  return isRecord(v) && typeof v.flow === 'string' && isRecord(v.parameters) && isRecord(v.files) && Object.values(v.files).every((x) => typeof x === 'string');
}
const isKeys = (v: unknown): v is Record<string, string> => isRecord(v) && Object.values(v).every((x) => typeof x === 'string');

function isDecide(a: unknown): a is DecideAbout {
  return isRecord(a) && isInputs(a.inputs) && isKeys(a.outputs) && (DECIDE_OPTIONS as readonly unknown[]).includes(a.option) && (a.scope === 'day' || a.scope === 'untilPass')
    && (a.day === null || typeof a.day === 'string') && (a.under === undefined || Number.isInteger(a.under));
}

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
 * when its keys are the held run's; a later `ok` run of the same inputs closes it as passed. In the order they opened.
 */
export function pausesOf(entries: readonly EntryLike[], period?: string | null): Pause[] {
  const pauses = new Map<string, Pause>();
  const releases = new Map<number, ReleaseAbout['outcome']>();
  // Each pause's decisions to publish as is, by their seq, with the keys each names.
  const asis = new Map<string, Map<number, Record<string, string>>>();
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    if (e.kind === 'run' && isHeld(a)) {
      const key = inputsKey(a.inputs);
      // Nothing waits (every held output's staged key is already current, as after a day published as is is run
      // again): there is nothing to decide, and nothing to open or change.
      const waiting = Array.isArray(a.waiting) ? a.waiting : Object.keys(a.keys);
      if (waiting.length === 0 || Object.keys(a.keys).length === 0) continue;
      const p = pauses.get(key) ?? { key, inputs: a.inputs, day: null, run: a.run, manifest: a.manifest, keys: {}, waiting: [], holds: [], opened: e.seq, seq: e.seq, state: 'open' as const, decision: null, otherBuild: false, released: null };
      Object.assign(p, { day: dayOf(a, period), run: a.run, manifest: a.manifest, keys: { ...a.keys }, waiting: [...waiting], holds: Array.isArray(a.holds) ? a.holds : [], seq: e.seq });
      p.otherBuild = !!p.decision && !sameKeys(p.decision.about.outputs, p.keys);
      p.state = p.decision && !p.otherBuild ? 'decided' : 'open';
      pauses.set(key, p);
    } else if (e.kind === 'run' && a.outcome === 'ok' && isInputs(a.inputs)) {
      const p = pauses.get(inputsKey(a.inputs));
      if (p) p.state = 'passed';
    } else if (e.kind === 'decide' && isDecide(a)) {
      const key = inputsKey(a.inputs);
      const p = pauses.get(key) ?? { key, inputs: a.inputs, day: a.day, run: a.run, manifest: a.manifest, keys: { ...a.outputs }, waiting: Object.keys(a.outputs), holds: [], opened: e.seq, seq: e.seq, state: 'open' as const, decision: null, otherBuild: false, released: null };
      p.decision = decided(e, a);
      p.otherBuild = !sameKeys(a.outputs, p.keys);
      p.state = p.otherBuild ? 'open' : 'decided';
      pauses.set(key, p);
      if (a.option === 'asis') asis.set(key, (asis.get(key) ?? new Map()).set(e.seq, a.outputs));
    } else if (e.kind === 'release' && Number.isInteger(a.decision) && (a.outcome === 'applied' || a.outcome === 'refused')) {
      if (releases.get(a.decision as number) !== 'applied') releases.set(a.decision as number, a.outcome);
    }
  }
  const out = [...pauses.values()].sort((x, y) => x.opened - y.opened);
  for (const p of out) {
    const mine = asis.get(p.key);
    p.released = mine ? [...mine].some(([seq, keys]) => releases.get(seq) === 'applied' && sameKeys(keys, p.keys)) : null;
  }
  return out;
}

/**
 * The days a flow's record says were published, in the order they were: by a passing run, or by an applied release
 * (its decision's day). A day published twice is listed twice.
 */
function publishedDays(entries: readonly EntryLike[], period: string | null | undefined): { seq: number; day: string }[] {
  const decisionDay = new Map<number, string | null>();
  const out: { seq: number; day: string }[] = [];
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    let d: string | null = null;
    if (e.kind === 'decide' && isDecide(a)) decisionDay.set(e.seq, a.day);
    else if (e.kind === 'run' && a.outcome === 'ok') d = dayOf(a, period);
    else if (e.kind === 'release' && a.outcome === 'applied') d = (Number.isInteger(a.decision) ? decisionDay.get(a.decision as number) : null) ?? dayOf(a, period);
    if (d) out.push({ seq: e.seq, day: d });
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
 * The standing decision a held day falls under (ADR 0009 §6), if any: the decision not to publish "until a day
 * passes" made for the nearest day before it (the latest such entry for that day, never one amended since, never one
 * applied under another), when no day after that one and before this one has published, by a passing run or an
 * applied release. Publish as is never stands (Q-50). Days compare as text, so ISO dates order as days.
 */
export function standingFor(entries: readonly EntryLike[], day: string, period?: string | null): Decided | null {
  const amended = new Set(entries.filter((e) => e.kind === 'decide' && e.amends !== null).map((e) => e.amends));
  let best: Decided | null = null;
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (e.kind !== 'decide' || !isDecide(a)) continue;
    if (a.option !== 'dont' || a.scope !== 'untilPass' || a.under !== undefined || amended.has(e.seq) || a.day === null || !(a.day < day)) continue;
    if (!best || a.day > best.about.day! || (a.day === best.about.day && e.seq > best.seq)) best = decided(e, a);
  }
  if (!best) return null;
  const from = best.about.day!;
  return publishedDays(entries, period).some((p) => p.day > from && p.day < day) ? null : best;
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
  return standingFor(before, mine.day, period)?.seq ?? null;
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
 * What became of a held day (ADR 0009 §6, §12): `waiting` for a decision, `asis` published as is, `dont` not published.
 * From a held run in this engine (how many holds and waiting outputs it has, and whether a release of it applied here)
 * and the record's pause of its inputs; or, with no run here (a day held in an earlier visit), from the pause alone.
 * Published as is needs the release applied (here, or in the record before the engine was lost) or, with a run here,
 * nothing left waiting; until then the day still waits, decided or not. An applied release stands over any decision
 * after it, since readers have the day. Null for a run that published, a pause a passing run closed, and a held run
 * with nothing waiting and nothing decided (each name already shows its versions: there is nothing to decide).
 */
export function pauseState(run: { holds: number; waiting: number; released: boolean } | null, pause: Pick<Pause, 'state' | 'decision' | 'released'> | null): PauseState | null {
  if (!run) {
    if (!pause || pause.state === 'passed') return null;
    if (pause.released === true) return 'asis';
    return pause.state === 'decided' && pause.decision?.about.option === 'dont' ? 'dont' : 'waiting';
  }
  if (run.holds === 0) return null;
  if (run.released || pause?.released === true) return 'asis';
  const d = pause?.state === 'decided' ? pause.decision : null;
  if (d?.about.option === 'dont') return 'dont';
  if (d?.about.option === 'asis' && run.waiting === 0) return 'asis';
  return run.waiting === 0 ? null : 'waiting';
}
