/**
 * The flow plan: what the machine runs (ADR 0004). A pure, deterministic translation of the flow document, with
 * nothing left open: parameters are filled in as literals, inputs are referenced by node, and display fields are
 * gone. The runtime adds each node's output schema when it types the plan, so a stored plan is complete.
 *
 * Nobody needs to read it. It is canonical JSON with positional references, built for hashing, optimizing and
 * replaying, and its format is versioned (`smaltflPlan`).
 */
import { calendarListProblems, calendarProblems, EVERIES, isEvery, isSlotOf, resolveCalendar, type Calendar, type Every } from './calendar.js';
import type { DonorRule, FlowDocument, HoldKind, Meanwhile, Missing, ParameterDef, StepDef, Until, WatchDef } from './document.js';
import { DONOR_RULES, HOLD_KINDS, isGeneralWatch, MEANWHILES, missingProblem, periodOf, UNTILS, validateDocument, withoutDisplay } from './document.js';
import { emitMatch, emitRuleCheck } from './emit.js';
import { hashOf } from './hash.js';
import { CHECK_NAMES, gateChecksOf, hasGates, writtenRules, type GateChecks } from './gates.js';
import { conditionOf, marksOn, type Ontology } from './ontology.js';
import { enforcedBy, ON_FAIL, type OntologyRule } from './rules.js';
import type { ParamType, ParamValue } from './sqltext.js';
import { bindParameters, quoteIdent, SqlTextError, withoutTrailingSemicolons } from './sqltext.js';

/**
 * The formats this version runs: 0; 1 for a plan that says what holds its publication (ADR 0009, E10 plan/1); 2 for one
 * that also says how its watched sources are judged (ADR 0010 §11, E13 plan/2); 3 for the plan of a format-4 document,
 * whose steps are its notebooks' cells (ADR 0011 §1, E14 plan/3): the shape of plan/2, its publish block optional and
 * always in plan/2's form, so a build that doesn't read notebooks refuses it rather than verify a document it can't
 * derive; 4 for the plan of a document with gates (ADR 0014 §1): plan/3's shape, each watch carrying its `checks`, so a
 * build without gates refuses it rather than hold or publish a day by other rules.
 */
export const PLAN_FORMATS = [0, 1, 2, 3, 4] as const;
export type PlanFormat = (typeof PLAN_FORMATS)[number];

/** A column's static type, as smaltdb reports it (`Statement.columnTypes`). */
export type ColumnType = 'int' | 'real' | 'num' | 'text' | 'blob' | 'null' | 'any';

/** An output column: its name and static type. */
export type Column = [name: string, type: ColumnType];

/** A computed column: its name and a SQL expression. */
export type Named = [name: string, expr: string];

export type FailAction = 'warn' | 'drop' | 'fail';

interface NodeBase {
  /** The source or step of the document this node came from (for messages and the canvas; not in keys). */
  origin: string;
  /** Earlier nodes this one reads, by position. */
  inputs: number[];
  /** The output columns, filled in when the plan is typed. */
  schema?: Column[];
  /** Columnar storage, when the node is stored and its dataset asks for it. */
  storage?: 'columnar';
}

/** Rows of a table in the database, snapshotted by content hash when a run reads them. */
export interface TableNode extends NodeBase {
  op: 'table';
  table: string;
}

/** A SELECT written by a person, over inputs it names. */
export interface SqlNode extends NodeBase {
  op: 'sql';
  names: string[];
  sql: string;
}

export interface FilterNode extends NodeBase {
  op: 'filter';
  where: string;
}

/** Columns added, or replacing the input column of the same name, in order. */
export interface FormulaNode extends NodeBase {
  op: 'formula';
  set: Named[];
}

export interface SelectNode extends NodeBase {
  op: 'select';
  project: Named[];
}

export interface JoinNode extends NodeBase {
  op: 'join';
  how: 'inner' | 'left';
  on: [left: string, right: string][];
  /** Right-hand columns added: [output name, right column]. */
  take: [name: string, column: string][];
}

export interface AggregateNode extends NodeBase {
  op: 'aggregate';
  groupBy: Named[];
  measures: Named[];
}

export interface ExpectNode extends NodeBase {
  op: 'expect';
  rules: [name: string, check: string, onFail: FailAction][];
  maxDropped: number | null;
}

/**
 * A watched source's fill step (ADR 0009 amendment 1 S1, S4): its source's rows with `filled_from`; with `missing`, the
 * rows outside it, plus (with `from`, from its second input, the donor) the rows inside it, their `shift` columns moved
 * from the donor's day `from` to the run's day `to` by whole days. Its key covers all of these, and its inputs' keys.
 */
export interface FillNode extends NodeBase {
  op: 'fill';
  time: string;
  shift: string[];
  missing: Missing | null;
  from: string | null;
  /** The day the donor's rows move to: the run's period value. Null exactly when `from` is. */
  to: string | null;
}

export type PlanNode = TableNode | SqlNode | FilterNode | FormulaNode | SelectNode | JoinNode | AggregateNode | ExpectNode | FillNode;

export interface PlanOutput {
  /** The dataset's name: the id of the step that produces it. */
  name: string;
  node: number;
}

/**
 * What holds the plan's publication (ADR 0009 §2), from the document's publish block: `hold` sorted, each watched
 * source by its node (sorted by node) with its history's file, the period parameter's name or null, and `together`.
 */
export interface PlanPublish {
  hold: HoldKind[];
  watch: [node: number, file: string][];
  period: string | null;
  together: boolean;
  /** Only when the document sets them, so every plan/1 hash made before the fills holds (ADR 0009 amendment 1 S1, C1). */
  donor?: DonorRule;
  meanwhile?: Meanwhile;
  until?: Until;
}

/**
 * How a watched source is judged (ADR 0010 §11): every setting filled in, so the plan says it and the flow hash covers
 * it. `bad`, `newValues` and `after` come from the ontology's properties that apply to the source, each a sorted list of
 * `[column, …]`: a column's bad codes (sorted), its new values alerting (every serious column: one listing bad codes or
 * saying so, Q-56), and the column it runs behind with the minutes.
 */
export interface WatchPlan {
  history: string;
  period: string | null;
  /** What one load covers (ADR 0010 §7): a day, or a slot of it, its period parameter naming the slot. */
  every: Every;
  pattern: 'weekly' | 'none' | 'monthly';
  donor: 'weekday' | 'nearest';
  time: string | null;
  zone: string | null;
  calendar: boolean;
  scale: 'fixed' | 'volume';
  holds: boolean;
  /** Whether a change told as a note that has lasted 14 days is re-learned on its own (ADR 0010 §5, X7): off unless
   * the watch says so. */
  relearn: boolean;
  count: string[] | null;
  follow: string[] | null;
  bad: [column: string, ...codes: string[]][];
  newValues: [column: string, alert: 'alert'][];
  after: [column: string, of: string, minutes: number][];
  /** plan/4 only (ADR 0014 §1): the gate's checks, every one filled in from its layer, each hold, warn or off. */
  checks?: GateChecks;
  /** plan/4 only (ADR 0014 §3): the ontology's expected bands on the node's values, `[column, value, low, high]`, and
   * its due marks, `[column, status, miss, within]`, each sorted by column. */
  expect?: [column: string, value: string, low: number, high: number][];
  due?: [column: string, status: string, miss: string, within: number][];
  /** plan/4 only (ADR 0014 §4): the gate's scope rule, the inventory by its table, and its dependency rules, each
   * `when` and `then` as `[column, values]` sorted by column, `from` by its table (null within the row). */
  scope?: ScopePlan | null;
  needs?: NeedsPlan[];
  /** plan/4 only (ADR 0014 §6): the gate's reconciliation, the other node by its table (a source), or null. */
  reconcile?: ReconcilePlan | null;
}

export interface ReconcilePlan {
  key: string[];
  table: string | null;
}

/** plan/4 (ADR 0014 §6): a gate on a published node the plan doesn't watch (gold): its checks and its reconciliation,
 * the other node by its place in the plan. The run counts it over the dataset it built. */
export interface GatePlan {
  checks: GateChecks;
  reconcile: { key: string[]; of: number | null } | null;
}

export interface ScopePlan {
  table: string;
  key: string;
  own: string;
  where: string;
}

export interface NeedsPlan {
  table: string | null;
  key: string | null;
  when: [column: string, values: string[]][];
  then: [column: string, values: string[]][];
}

/**
 * plan/2's publish block (ADR 0010 §11, C1): plan/1's, with the flow's calendar resolved, each watch's settings, and what
 * readers get while a day waits (`meanwhile`) and what closes a pause (`until`), filled in with their defaults (ADR 0009
 * amendment 1 S5, whose other values the fills add).
 */
export interface PlanPublish2 {
  hold: HoldKind[];
  period: string | null;
  together: boolean;
  calendar: Calendar;
  watch: [node: number, watch: WatchPlan][];
  meanwhile: Meanwhile;
  until: Until;
  /** plan/4 only (ADR 0014 §6): the gates on published nodes the plan doesn't watch, sorted by node. */
  gates?: [node: number, gate: GatePlan][];
}

/** A watched source as either plan format says it: its node, its history's file, its period, whether it holds, and in
 * plan/2 every setting it is judged by (null for a plan/1 watch: the settings every flow had before ADR 0010). */
export interface PlannedWatch {
  node: number;
  history: string;
  period: string | null;
  holds: boolean;
  settings: WatchPlan | null;
}

/** Whether a plan's publish block is plan/2's. */
export const isPublish2 = (pub: PlanPublish | PlanPublish2): pub is PlanPublish2 => 'calendar' in pub;

/** A plan's watched sources, in node order, whichever format it is. */
export function watchesOf(pub: PlanPublish | PlanPublish2 | undefined): PlannedWatch[] {
  if (!pub) return [];
  if (isPublish2(pub)) return pub.watch.map(([node, w]) => ({ node, history: w.history, period: w.period, holds: w.holds, settings: w }));
  return pub.watch.map(([node, history]) => ({ node, history, period: pub.period, holds: true, settings: null }));
}

/**
 * The donor rule a plan gives a watched source (ADR 0009 amendment 1 S3, C1): plan/2's watch names it; plan/1's
 * `publish.donor`, else the same weekday, the rule every flow had before the fills.
 */
export function plannedDonor(pub: PlanPublish | PlanPublish2 | undefined, node: number): DonorRule {
  if (pub && isPublish2(pub)) return pub.watch.find(([n]) => n === node)?.[1].donor ?? 'weekday';
  return pub?.donor ?? 'weekday';
}

/** The parameter a plan's days are named by: its period, else the one every watch names; null when they differ. */
export function planPeriod(pub: PlanPublish | PlanPublish2 | undefined): string | null {
  if (!pub) return null;
  if (pub.period !== null) return pub.period;
  const named = [...new Set(watchesOf(pub).map((w) => w.period))];
  return named.length === 1 ? named[0]! : null;
}

export interface FlowPlan {
  /** 1 exactly when the plan has plan/1's `publish`, 2 when it has plan/2's; a plan without it is format 0, hashed as
   * plan/0 byte for byte. 3 for the plan of a format-4 document, with or without a publish block (plan/2's form); 4
   * for one with gates, each watch carrying its checks. */
  smaltflPlan: PlanFormat;
  /** The document's id, and its hash without display fields (the flow hash). */
  flow: { id: string; hash: string };
  /** The parameter values filled in, for the record (the nodes no longer need them). */
  parameters: Record<string, string | number | null>;
  /** In an order where every node's inputs come before it. */
  nodes: PlanNode[];
  /** Sorted by name. */
  outputs: PlanOutput[];
  /** What holds its publication: only in a format-1 or format-2 plan. */
  publish?: PlanPublish | PlanPublish2;
}

export class PlanError extends Error {
  override name = 'PlanError';
  constructor(
    message: string,
    readonly issues: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/** The flow hash: what the document says, without display fields. */
export function flowHash(doc: FlowDocument): Promise<string> {
  return hashOf('flow/1', withoutDisplay(doc));
}

/**
 * Translate a flow document into its flow plan, filling in parameter values (`values`, else each parameter's
 * default). The same document and values always give the same plan.
 */
export async function translate(doc: FlowDocument, values: Readonly<Record<string, ParamValue>> = {}): Promise<FlowPlan> {
  const issues = validateDocument(doc);
  if (issues.length > 0) throw new PlanError(`the flow document has ${issues.length} problem${issues.length === 1 ? '' : 's'}: ${issues[0]!.path}: ${issues[0]!.message}`, issues);
  const params = resolveParameters(doc.parameters ?? [], values);
  const bound = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v]));
  const bind = (sql: string, path: string): string => {
    try {
      return bindParameters(sql, bound);
    } catch (e) {
      if (e instanceof SqlTextError) throw new PlanError(`${path}: ${e.message}`, [{ path, message: e.message }]);
      throw e;
    }
  };

  const nodes: PlanNode[] = [];
  const index = new Map<string, number>();
  for (const s of doc.sources) {
    index.set(s.id.toLowerCase(), nodes.length);
    nodes.push({ op: 'table', origin: s.id, inputs: [], table: s.table });
  }
  const outputs: PlanOutput[] = [];
  for (const step of topological(doc.steps)) {
    const at = `steps.${step.id}`;
    const inputs = step.inputs.map((id) => index.get(id.toLowerCase())!);
    const base = { origin: step.id, inputs, ...(step.dataset?.storage === 'columnar' ? { storage: 'columnar' as const } : {}) };
    // The day a fill moves its donor's rows to: its source's period's value, the watch's own or the flow's
    // (validateDocument made sure a fill from a day has one).
    const period = step.kind === 'fill' ? periodOf(doc, step.inputs[0]!) : undefined;
    const day = period === undefined ? undefined : params[period]?.value;
    // A slot's (ADR 0010 §7) to the same slot of the run's day.
    const fits = (d: unknown, from: string) => typeof d === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(d) || /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(d)) && d.slice(10) === from.slice(10);
    if (step.kind === 'fill' && step.from !== undefined && step.from !== null && !fits(day, step.from)) {
      const message = `a fill from ${step.from} moves its rows to the run's day, and ${period} is ${day === null || day === undefined ? 'not given' : `'${String(day)}', not a day${step.from.length > 10 ? ` with that slot (${step.from.slice(11)})` : ''}`}`;
      throw new PlanError(`${at}: ${message}`, [{ path: at, message }]);
    }
    nodes.push(translateStep(step, base, at, bind, typeof day === 'string' ? day : null, enforcedBy(doc, step)));
    index.set(step.id.toLowerCase(), nodes.length - 1);
    if (step.dataset) outputs.push({ name: step.id, node: nodes.length - 1 });
  }
  outputs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parameters: Record<string, string | number | null> = {};
  for (const [k, p] of Object.entries(params)) parameters[k] = typeof p.value === 'bigint' ? p.value.toString() : p.value;
  // A format-4 document's plan is plan/3 (ADR 0011 §1, E14), with or without a publish block; with gates, plan/4
  // (ADR 0014 §1), each watch carrying the checks it is judged by.
  const notebooks = doc.smaltfl === 4;
  const gates = notebooks && hasGates(doc);
  const plan: FlowPlan = { smaltflPlan: gates ? 4 : notebooks ? 3 : 0, flow: { id: doc.id, hash: await flowHash(doc) }, parameters, nodes, outputs };
  // Without a publish block the plan is what it always was, so every plan/0 hash holds (ADR 0009, E10).
  if (!doc.publish) return plan;
  const p = doc.publish;
  const hold = [...new Set(p.hold)].sort();
  const entries = Object.entries(p.watch ?? {}).map(([id, w]) => ({ id, node: index.get(id.toLowerCase())!, w })).sort((a, b) => a.node - b.node);
  // plan/1 byte for byte unless the document says how a source is judged (ADR 0010 §11): a calendar, a watch given as
  // an object, or a watched source with a mark that changes verdicts (Q-79), which an older plugin must refuse. A
  // format-4 document's publish block is always in plan/2's form.
  if (!notebooks && !judgesItsOwnWay(doc, entries.map((e) => e.id))) {
    const watch = entries.map((e): [number, string] => [e.node, typeof e.w === 'string' ? e.w : e.w.history]);
    // The fills' settings only when the document sets them, so every plan/1 hash made before them holds (C1).
    const fills = { ...(p.donor !== undefined ? { donor: p.donor } : {}), ...(p.meanwhile !== undefined ? { meanwhile: p.meanwhile } : {}), ...(p.until !== undefined ? { until: p.until } : {}) };
    return { ...plan, smaltflPlan: 1, publish: { hold, watch, period: p.period ?? null, together: p.together ?? true, ...fills } };
  }
  // A format-2 flow whose watches are all given as file names keeps the calendar it always had; a format-3 document has
  // its block's, or none (the owner, Q-58: "None unless chosen"), whatever form its watches take.
  const legacy = doc.smaltfl < 3 && doc.calendar === undefined && entries.every((e) => !isGeneralWatch(e.w));
  const calendar = resolveCalendar(doc.calendar, legacy);
  // A node's written rules (ADR 0014 §4, ADR 0015 §1) in the plan: the inventory and a dependency's dataset by their
  // tables (sources). A gate cell's scope condition is bound as any SQL is; one the ontology's `rows` gives is data,
  // and the emitter writes it, so the plan's scope is the four fields it always was whichever wrote it.
  const tableOf = (id: string): string => {
    const node = index.get(id.toLowerCase());
    const n = node === undefined ? undefined : nodes[node];
    if (!n || n.op !== 'table') throw new PlanError(`${id} isn't a source: a gate's rule reads a source of the flow`, [{ path: `$.gates.${id}`, message: 'not a source' }]);
    return n.table;
  };
  const rulesOf = (id: string): Pick<WatchPlan, 'scope' | 'needs' | 'reconcile'> => {
    const r = writtenRules(doc, id);
    // A dependency's conditions are kept in one order as the ontology's is (`conditionOf`): by column, each column's
    // values sorted, each once.
    return {
      scope: r.scope ? { table: tableOf(r.scope.of), key: r.scope.key, own: r.scope.own, where: r.scope.from === 'gate' ? bind(r.scope.where, `$.gates.${id}.scope.where`) : emitMatch(r.scope.match) } : null,
      needs: r.needs.map((n): NeedsPlan => ({ table: n.from ? tableOf(n.from) : null, key: n.key ?? null, when: conditionOf(n.when), then: conditionOf(n.then) })),
      reconcile: r.reconcile ? { key: [...r.reconcile.key], table: r.reconcile.of ? tableOf(r.reconcile.of) : null } : null,
    };
  };
  const watch = entries.map((e): [number, WatchPlan] => [e.node, { ...watchPlan(e.w, e.id, p.period ?? null, doc.ontology, gates), ...(gates ? { checks: gateChecksOf(doc, e.id)!, ...rulesOf(e.id) } : {}) }]);
  // The gates on published nodes the plan doesn't watch (ADR 0014 §6): the run counts their reconciliation itself.
  const watchedNodes = new Set(entries.map((e) => e.node));
  const goldGates = gates
    ? outputs.filter((o) => !watchedNodes.has(o.node) && gateChecksOf(doc, o.name)).map((o): [number, GatePlan] => {
      const g = Object.entries(doc.gates ?? {}).find(([k]) => k.toLowerCase() === o.name.toLowerCase())?.[1];
      const of = g?.reconcile?.of ? index.get(g.reconcile.of.toLowerCase()) : undefined;
      return [o.node, { checks: gateChecksOf(doc, o.name)!, reconcile: g?.reconcile ? { key: [...g.reconcile.key], of: of ?? null } : null }];
    }).sort((a, b) => a[0] - b[0])
    : [];
  return { ...plan, smaltflPlan: gates ? 4 : notebooks ? 3 : 2, publish: { hold, period: p.period ?? null, together: p.together ?? true, calendar: { ...calendar }, watch, meanwhile: p.meanwhile ?? 'last', until: p.until ?? 'decision', ...(gates ? { gates: goldGates } : {}) } };
}

/** Whether a document judges its watched sources other than every flow did before ADR 0010: a plan/2. */
function judgesItsOwnWay(doc: FlowDocument, watched: readonly string[]): boolean {
  if (doc.calendar !== undefined || Object.values(doc.publish?.watch ?? {}).some(isGeneralWatch)) return true;
  return watched.some((id) => {
    const m = marksOn(doc.ontology, id);
    return m.bad.length + m.newValues.length + m.after.length > 0;
  });
}

/** A watch's settings, filled in: a file name means the settings every flow had before ADR 0010 (fixed floors, the
 * weekly pattern, the same weekday's donor), an object its own, each default as ADR 0010 §10 gives it. */
function watchPlan(w: string | WatchDef, source: string, period: string | null, ontology: Ontology | undefined, gated = false): WatchPlan {
  const g = typeof w === 'string' ? null : w;
  const pattern = g?.pattern ?? 'weekly';
  const sorted = (xs: readonly string[] | undefined) => (xs ? [...xs].sort() : null);
  // The bands and due marks (ADR 0014 §3) are plan/4's: a plan without gates carries the marks it always did.
  const { expect, due, ...marks } = marksOn(ontology, source);
  return {
    history: typeof w === 'string' ? w : w.history,
    period: g?.period ?? period,
    every: g?.every ?? 'day',
    pattern,
    donor: g?.donor ?? (pattern === 'weekly' ? 'weekday' : 'nearest'),
    time: g?.time ?? null,
    zone: g?.zone ?? null,
    calendar: g?.calendar ?? true,
    scale: g ? (g.scale ?? 'volume') : 'fixed',
    holds: g?.holds ?? true,
    relearn: g?.relearn ?? false,
    count: sorted(g?.count),
    follow: sorted(g?.follow),
    ...marks,
    ...(gated ? { expect, due } : {}),
  };
}

type Base = Pick<NodeBase, 'origin' | 'inputs' | 'storage'>;

function translateStep(step: StepDef, base: Base, at: string, bind: (sql: string, path: string) => string, day: string | null, ontologyRules: readonly OntologyRule[] = []): PlanNode {
  const named = (c: string | { name: string; expr: string }, path: string): Named => (typeof c === 'string' ? [c, quoteIdent(c)] : [c.name, bind(c.expr, path)]);
  switch (step.kind) {
    case 'sql':
      return { op: 'sql', ...base, names: [...step.inputs], sql: bind(withoutTrailingSemicolons(step.sql), `${at}.sql`) };
    case 'filter':
      return { op: 'filter', ...base, where: bind(step.where, `${at}.where`) };
    case 'formula':
      return { op: 'formula', ...base, set: step.columns.map((c, i) => named(c, `${at}.columns[${i}]`)) };
    case 'select':
      return { op: 'select', ...base, project: step.columns.map((c, i) => named(c, `${at}.columns[${i}]`)) };
    case 'join':
      return {
        op: 'join',
        ...base,
        how: step.how,
        on: step.on.map((p) => [p.left, p.right]),
        take: step.columns.map((c) => (typeof c === 'string' ? [c, c] : [c.name, c.column])),
      };
    case 'aggregate':
      return {
        op: 'aggregate',
        ...base,
        groupBy: step.groupBy.map((c, i) => named(c, `${at}.groupBy[${i}]`)),
        measures: step.measures.map((c, i) => named(c, `${at}.measures[${i}]`)),
      };
    case 'expectations':
      return {
        op: 'expect',
        ...base,
        // The step's own rules, then the ontology's rules of the file it reads, if it is the step that enforces them
        // (rules.ts): each by its name, written for the engine.
        rules: [
          ...step.rules.map((r, i): [string, string, FailAction] => [r.name, bind(r.check, `${at}.rules[${i}].check`), r.onFail]),
          ...ontologyRules.map((r): [string, string, FailAction] => [r.id, emitRuleCheck(r), ON_FAIL[r.action]]),
        ],
        maxDropped: step.maxDropped ?? null,
      };
    case 'fill': {
      const from = step.from ?? null;
      return { op: 'fill', ...base, time: step.time, shift: [...step.shift], missing: step.missing ? structuredClone(step.missing) : null, from, to: from === null ? null : day };
    }
  }
}

function resolveParameters(defs: readonly ParameterDef[], values: Readonly<Record<string, ParamValue>>): Record<string, { type: ParamType; value: ParamValue }> {
  const out: Record<string, { type: ParamType; value: ParamValue }> = {};
  const known = new Set(defs.map((d) => d.name));
  for (const name of Object.keys(values)) if (!known.has(name)) throw new PlanError(`no parameter named ${name}`);
  for (const d of defs) {
    const value = Object.hasOwn(values, d.name) ? values[d.name]! : d.default;
    if (value === undefined) throw new PlanError(`parameter ${d.name} needs a value (it has no default)`);
    if (value !== null && !fitsType(value, d.type)) throw new PlanError(`parameter ${d.name} is a ${d.type}; got ${typeof value === 'string' ? `'${value}'` : String(value)}`);
    out[d.name] = { type: d.type, value };
  }
  return out;
}

function fitsType(value: ParamValue, type: ParamType): boolean {
  if (type === 'text') return typeof value === 'string';
  if (type === 'integer') return typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value));
  return typeof value === 'number' && Number.isFinite(value);
}

/** The steps in an order where inputs come first; ties keep the document's order. */
function topological(steps: readonly StepDef[]): StepDef[] {
  const ids = new Set(steps.map((s) => s.id.toLowerCase()));
  const done = new Set<string>();
  const out: StepDef[] = [];
  while (out.length < steps.length) {
    const next = steps.find((s) => !done.has(s.id.toLowerCase()) && s.inputs.every((i) => !ids.has(i.toLowerCase()) || done.has(i.toLowerCase())));
    if (!next) throw new PlanError('the steps form a cycle');
    done.add(next.id.toLowerCase());
    out.push(next);
  }
  return out;
}

const OPS = new Set(['table', 'sql', 'filter', 'formula', 'select', 'join', 'aggregate', 'expect', 'fill']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_ID = /^\d{4}-\d{2}-\d{2}T\d{2}$/;

/**
 * Check a plan's structure before the runtime trusts it: the format, the operations, inputs that come earlier, and
 * outputs that point at nodes. A plan from `translate` always passes; a plan from anywhere else is checked too.
 */
export function validatePlan(plan: unknown): asserts plan is FlowPlan {
  const fail = (message: string): never => {
    throw new PlanError(`invalid flow plan: ${message}`);
  };
  if (typeof plan !== 'object' || plan === null) fail('not an object');
  const p = plan as FlowPlan;
  if (!(PLAN_FORMATS as readonly unknown[]).includes(p.smaltflPlan)) fail(`format ${String(p.smaltflPlan)}, expected ${PLAN_FORMATS.join(' or ')}`);
  if (!p.flow || typeof p.flow.id !== 'string' || typeof p.flow.hash !== 'string') fail('flow needs an id and a hash');
  if (!Array.isArray(p.nodes)) fail('nodes is not an array');
  p.nodes.forEach((n, i) => {
    if (typeof n !== 'object' || n === null || !OPS.has(n.op)) fail(`node ${i} has no known op`);
    if (!Array.isArray(n.inputs) || n.inputs.some((j) => !Number.isInteger(j) || j < 0 || j >= i)) fail(`node ${i} reads a node that does not come before it`);
    const arity = n.op === 'table' ? 0 : n.op === 'join' ? 2 : n.op === 'sql' ? n.names.length : n.op === 'fill' ? (n.from === null ? 1 : 2) : 1;
    if (n.inputs.length !== arity) fail(`node ${i} (${n.op}) has ${n.inputs.length} inputs`);
    if (n.op === 'fill') fillProblem(p, n, i, fail);
  });
  if (!Array.isArray(p.outputs)) fail('outputs is not an array');
  const names = new Set<string>();
  for (const o of p.outputs) {
    if (typeof o.name !== 'string' || !Number.isInteger(o.node) || o.node < 0 || o.node >= p.nodes.length) fail(`output ${String(o.name)} points at no node`);
    if (p.nodes[o.node]!.op === 'table') fail(`output ${o.name} is a source: sources are snapshots, not datasets`);
    if (names.has(o.name.toLowerCase())) fail(`two outputs named ${o.name}`);
    names.add(o.name.toLowerCase());
  }
  // Format 0 never holds; formats 1 and 2 always say what holds them. An older plugin refuses each outright.
  if (p.smaltflPlan === 0 && p.publish !== undefined) fail('a format-0 plan has no publish block: a plan that holds is format 1');
  if (p.smaltflPlan === 1) validatePublish(p, fail);
  if (p.smaltflPlan === 2) validatePublish2(p, fail);
  // A format-3 plan (ADR 0011 E14) holds, or not, as its document says: its publish block, when it has one, is plan/2's.
  if (p.smaltflPlan === 3 && p.publish !== undefined) validatePublish2(p, fail);
  // A format-4 plan (ADR 0014 §1) is a format-3 plan whose every watch carries its gate's checks.
  if (p.smaltflPlan === 4 && p.publish !== undefined) validatePublish2(p, fail, true);
}

const WATCH_PLAN_FIELDS = ['after', 'bad', 'calendar', 'count', 'donor', 'every', 'follow', 'history', 'holds', 'newValues', 'pattern', 'period', 'relearn', 'scale', 'time', 'zone'];
const WATCH_PLAN_FIELDS_4 = [...WATCH_PLAN_FIELDS, 'checks', 'due', 'expect', 'needs', 'reconcile', 'scope'].sort();

/** plan/2's publish block: every field there, each one this version reads, each value one it can judge. */
function validatePublish2(p: FlowPlan, fail: (message: string) => never, gated = false): void {
  const pub = p.publish as unknown;
  if (typeof pub !== 'object' || pub === null || Array.isArray(pub)) return fail('a format-2 plan says what holds it: publish { hold, period, together, calendar, watch, meanwhile, until }');
  const { hold, period, together, calendar, watch, meanwhile, until, gates: goldGates, ...rest } = pub as Record<string, unknown>;
  if (Object.keys(rest).length) fail(`publish has ${Object.keys(rest).join(', ')}, which this version doesn't read`);
  if (goldGates !== undefined && !gated) fail('publish.gates is plan/4’s: a plan/3 publish block has none');
  if (gated) {
    if (!Array.isArray(goldGates)) fail('publish.gates is a list of [node, gate]');
    (goldGates as unknown[]).forEach((x, i) => {
      if (!Array.isArray(x) || x.length !== 2 || !Number.isInteger(x[0]) || typeof x[1] !== 'object' || x[1] === null) fail(`publish.gates[${i}] is [node, gate]`);
      const [node, g] = x as [number, Record<string, unknown>];
      if (!p.outputs.some((o) => o.node === node)) fail(`publish.gates[${i}] is on node ${node}, which isn't a published node`);
      if (i > 0 && !(((goldGates as unknown[])[i - 1] as [number, unknown])[0] < node)) fail('publish.gates is sorted by node, each node once');
      const c = g.checks as Record<string, unknown> | null;
      if (typeof c !== 'object' || c === null || Object.keys(c).sort().join() !== [...CHECK_NAMES].sort().join() || Object.values(c).some((m) => m !== 'hold' && m !== 'warn' && m !== 'off')) fail(`publish.gates[${i}].checks is every check, each hold, warn or off`);
      const rc = g.reconcile as Record<string, unknown> | null;
      if (rc !== null && (typeof rc !== 'object' || !Array.isArray(rc.key) || (rc.key as unknown[]).length === 0 || (rc.key as unknown[]).some((k) => typeof k !== 'string') || !(rc.of === null || (Number.isInteger(rc.of) && p.nodes[rc.of as number])) || Object.keys(rc).sort().join() !== 'key,of')) fail(`publish.gates[${i}].reconcile is null or { key, of }`);
      if (Object.keys(g).sort().join() !== 'checks,reconcile') fail(`publish.gates[${i}] is { checks, reconcile }`);
    });
  }
  checkHold(hold, fail);
  const kinds = hold as string[];
  const text = (name: unknown) => typeof name === 'string' && Object.hasOwn(p.parameters ?? {}, name) && (typeof p.parameters[name] === 'string' || p.parameters[name] === null);
  if (period !== null && !text(period)) fail(`publish.period ${String(period)} is not one of the plan's text parameters`);
  if (typeof together !== 'boolean') fail('publish.together is true or false');
  // What readers get meanwhile, and what closes a pause (ADR 0009 amendment 1 S5), filled in (C1).
  if (!(MEANWHILES as readonly unknown[]).includes(meanwhile)) fail(`publish.meanwhile ${String(meanwhile)} is not one this version reads (${MEANWHILES.join(', ')})`);
  if (!(UNTILS as readonly unknown[]).includes(until)) fail(`publish.until ${String(until)} is not one this version reads (${UNTILS.join(', ')})`);
  const c = calendar as Record<string, unknown> | null;
  if (typeof c !== 'object' || c === null || !['none', 'us/1', 'us-nyc/1'].includes(c.base as string) || typeof c.zone !== 'string' || calendarProblems({ zone: c.zone }).length || Object.keys(c).sort().join() !== 'base,dates,days,windows,zone')
    fail('publish.calendar is { base: none, us/1 or us-nyc/1, zone, days, windows, dates }');
  const listed = calendarListProblems(c!);
  if ([c!.days, c!.windows, c!.dates].some((x) => !Array.isArray(x)) || listed.length) fail(`publish.calendar${listed[0]?.[0] ?? ''}: ${listed[0]?.[1] ?? 'days, windows and dates are lists'}`);
  if (!Array.isArray(watch)) fail('publish.watch is a list of [node, watch]');
  const pairs = watch as unknown[];
  let holding = 0;
  pairs.forEach((x, i) => {
    if (!Array.isArray(x) || x.length !== 2 || !Number.isInteger(x[0]) || typeof x[1] !== 'object' || x[1] === null) fail(`publish.watch[${i}] is [node, watch]`);
    const [node, w] = x as [number, Record<string, unknown>];
    // plan/2 and plan/3 may watch a step the plan publishes (ADR 0013 §4): its dataset is judged once the run has built it.
    if (p.nodes[node]?.op !== 'table' && !(p.nodes[node] && p.outputs.some((o) => o.node === node))) fail(`publish.watch[${i}] watches node ${node}, which isn't a source or a published step`);
    if (i > 0 && !((pairs[i - 1] as [number, unknown])[0] < node)) fail('publish.watch is sorted by node, each node once');
    const at = `publish.watch[${i}]`;
    const fields = gated ? WATCH_PLAN_FIELDS_4 : WATCH_PLAN_FIELDS;
    if (Object.keys(w).sort().join() !== fields.join()) fail(`${at} has ${Object.keys(w).sort().join(', ')}; a watch has exactly ${fields.join(', ')}`);
    if (typeof w.history !== 'string' || w.history === '') fail(`${at}.history is a file`);
    if (w.period === null ? period === null : !text(w.period)) fail(`${at}.period ${String(w.period)} is not one of the plan's text parameters`);
    if (!isEvery(w.every)) fail(`${at}.every ${String(w.every)} is not one this version can judge (${EVERIES.join(', ')})`);
    // A slot's period names a slot of its length (ADR 0010 §7): `2024-09-10T06` for a load of 6h.
    const value: unknown = p.parameters?.[(w.period ?? period) as string];
    if (w.every !== 'day' && typeof value === 'string' && !isSlotOf(value, w.every as Every)) fail(`${at}: ${String(w.period ?? period)} is ${value}, not a slot of ${String(w.every)} (such as ${String(value).slice(0, 10)}T00)`);
    if (w.every !== 'day' && w.time === null) fail(`${at}.time: a load of ${String(w.every)} is counted by its time column`);
    if (!['weekly', 'none', 'monthly'].includes(w.pattern as string)) fail(`${at}.pattern ${String(w.pattern)} is not one this version can judge (weekly, none, monthly)`);
    if (w.donor !== 'weekday' && w.donor !== 'nearest') fail(`${at}.donor is weekday or nearest`);
    if (w.time !== null && typeof w.time !== 'string') fail(`${at}.time is a column or null`);
    if (w.zone !== null && (typeof w.zone !== 'string' || calendarProblems({ zone: w.zone }).length)) fail(`${at}.zone is a time zone or null`);
    if (typeof w.calendar !== 'boolean' || typeof w.holds !== 'boolean' || typeof w.relearn !== 'boolean') fail(`${at}.calendar, holds and relearn are true or false`);
    if (w.scale !== 'fixed' && w.scale !== 'volume') fail(`${at}.scale is fixed or volume`);
    for (const k of ['count', 'follow'] as const) if (w[k] !== null && (!Array.isArray(w[k]) || (w[k] as unknown[]).some((v) => typeof v !== 'string'))) fail(`${at}.${k} is a list of columns or null`);
    const rows = (k: string, ok: (r: unknown[]) => boolean) => {
      if (!Array.isArray(w[k]) || (w[k] as unknown[]).some((r) => !Array.isArray(r) || typeof r[0] !== 'string' || !ok(r))) fail(`${at}.${k} is a list of [column, …]`);
    };
    rows('bad', (r) => r.length >= 2 && r.every((v) => typeof v === 'string'));
    rows('newValues', (r) => r.length === 2 && r[1] === 'alert');
    rows('after', (r) => r.length === 3 && typeof r[1] === 'string' && typeof r[2] === 'number' && Number.isFinite(r[2]));
    // plan/4 (ADR 0014 §1): every check of the vocabulary, each hold, warn or off, in the vocabulary's order.
    if (gated) {
      const c = w.checks as Record<string, unknown> | null;
      if (typeof c !== 'object' || c === null || Object.keys(c).sort().join() !== [...CHECK_NAMES].sort().join() || Object.values(c).some((m) => m !== 'hold' && m !== 'warn' && m !== 'off')) fail(`${at}.checks is every check (${CHECK_NAMES.join(', ')}), each hold, warn or off`);
      rows('expect', (r) => r.length === 4 && typeof r[1] === 'string' && typeof r[2] === 'number' && typeof r[3] === 'number' && (r[2] as number) >= 0 && (r[2] as number) <= (r[3] as number) && (r[3] as number) <= 1);
      rows('due', (r) => r.length === 4 && typeof r[1] === 'string' && typeof r[2] === 'string' && Number.isInteger(r[3]) && (r[3] as number) >= 1);
      const sc = w.scope as Record<string, unknown> | null;
      if (sc !== null && (typeof sc !== 'object' || typeof sc.table !== 'string' || typeof sc.key !== 'string' || typeof sc.own !== 'string' || typeof sc.where !== 'string' || Object.keys(sc).sort().join() !== 'key,own,table,where')) fail(`${at}.scope is null or { table, key, own, where }`);
      const match = (m: unknown) => Array.isArray(m) && m.length > 0 && m.every((x) => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && Array.isArray(x[1]) && (x[1] as unknown[]).length > 0 && (x[1] as unknown[]).every((v) => typeof v === 'string'));
      if (!Array.isArray(w.needs) || (w.needs as unknown[]).some((n) => typeof n !== 'object' || n === null || !('table' in n) || !match((n as NeedsPlan).when) || !match((n as NeedsPlan).then) || Object.keys(n).sort().join() !== 'key,table,then,when')) fail(`${at}.needs is a list of { table, key, when, then }`);
      const rc = w.reconcile as Record<string, unknown> | null;
      if (rc !== null && (typeof rc !== 'object' || !Array.isArray(rc.key) || (rc.key as unknown[]).length === 0 || (rc.key as unknown[]).some((k) => typeof k !== 'string') || !(rc.table === null || typeof rc.table === 'string') || Object.keys(rc).sort().join() !== 'key,table')) fail(`${at}.reconcile is null or { key, table }`);
    }
    if (w.holds) holding++;
  });
  const judged = kinds.includes('short') || kinds.includes('wrong');
  if (judged !== holding > 0) fail(judged ? 'publish.hold judges a source (short or wrong), and no watch holds' : 'publish.watch has a watch that holds, and publish.hold judges none');
}

function checkHold(hold: unknown, fail: (message: string) => never): void {
  if (!Array.isArray(hold) || hold.length === 0 || hold.some((k) => !(HOLD_KINDS as readonly unknown[]).includes(k))) fail(`publish.hold is a list of ${HOLD_KINDS.join(', ')}`);
  const kinds = hold as string[];
  if (kinds.some((k, i) => i > 0 && !(kinds[i - 1]! < k))) fail('publish.hold is sorted, each kind once');
  if (kinds.includes('short') && kinds.includes('wrong')) fail('publish.hold has short and wrong: one or the other');
  if (kinds.includes('unlearned') && !kinds.includes('short') && !kinds.includes('wrong')) fail('publish.hold has unlearned without short or wrong');
}

/** A fill node's own fields (ADR 0009 amendment 1 S1): its source and donor are snapshots, and its days are days. */
function fillProblem(p: FlowPlan, n: FillNode, i: number, fail: (message: string) => never): void {
  if (typeof n.time !== 'string' || n.time === '' || !Array.isArray(n.shift) || n.shift.some((c) => typeof c !== 'string' || c === '')) fail(`node ${i} (fill) names its time and the columns it shifts`);
  if (n.inputs.some((j) => p.nodes[j]?.op !== 'table')) fail(`node ${i} (fill) reads a node that isn't a source: it fills a source, from a source`);
  if (n.missing !== null && missingProblem(n.missing, n.time) !== null) fail(`node ${i} (fill): its missing part isn't one: ${missingProblem(n.missing, n.time)}`);
  // From a day to a day, or (ADR 0010 §7) from a slot to the same slot of another day.
  const period = (x: unknown) => typeof x === 'string' && (DAY.test(x) || SLOT_ID.test(x));
  if (n.from !== null && (!period(n.from) || !period(n.to) || n.from.slice(10) !== String(n.to).slice(10))) fail(`node ${i} (fill) fills from a day to a day: from and to are YYYY-MM-DD, or the same slot of two days, YYYY-MM-DDTHH`);
  if (n.from === null && n.to !== null) fail(`node ${i} (fill) moves rows to ${String(n.to)} from no day`);
  if (n.missing === null && n.from !== null) fail(`node ${i} (fill) fills from ${n.from} with no missing part`);
}

function validatePublish(p: FlowPlan, fail: (message: string) => never): void {
  const pub = p.publish as unknown;
  if (typeof pub !== 'object' || pub === null || Array.isArray(pub)) return fail('a format-1 plan says what holds it: publish { hold, watch, period, together }');
  const { hold, watch, period, together, donor, meanwhile, until, ...rest } = pub as Record<string, unknown>;
  if (Object.keys(rest).length) fail(`publish has ${Object.keys(rest).join(', ')}, which this version doesn't read`);
  if (donor !== undefined && !(DONOR_RULES as readonly unknown[]).includes(donor)) fail(`publish.donor is ${DONOR_RULES.join(' or ')}`);
  if (meanwhile !== undefined && !(MEANWHILES as readonly unknown[]).includes(meanwhile)) fail(`publish.meanwhile is ${MEANWHILES.join(', ')}`);
  if (until !== undefined && !(UNTILS as readonly unknown[]).includes(until)) fail(`publish.until is ${UNTILS.join(' or ')}`);
  checkHold(hold, fail);
  const kinds = hold as string[];
  if (!Array.isArray(watch)) fail('publish.watch is a list of [node, file]');
  const pairs = watch as unknown[];
  pairs.forEach((w, i) => {
    if (!Array.isArray(w) || w.length !== 2 || !Number.isInteger(w[0]) || typeof w[1] !== 'string' || w[1] === '') fail(`publish.watch[${i}] is [node, file]`);
    const [node] = w as [number, string];
    if (p.nodes[node]?.op !== 'table') fail(`publish.watch[${i}] watches node ${node}, which isn't a source`);
    if (i > 0 && !((pairs[i - 1] as [number, string])[0] < node)) fail('publish.watch is sorted by node, each node once');
  });
  const judged = kinds.includes('short') || kinds.includes('wrong');
  if (judged !== pairs.length > 0) fail(judged ? 'publish.hold judges a source (short or wrong), and publish.watch names none' : 'publish.watch names a source, and publish.hold judges none');
  if (period !== null && (typeof period !== 'string' || !Object.hasOwn(p.parameters ?? {}, period))) fail(`publish.period ${String(period)} is not one of the plan's parameters`);
  if (period !== null && typeof p.parameters[period as string] !== 'string' && p.parameters[period as string] !== null) fail(`publish.period ${String(period)} is not a text parameter`);
  if (period === null && pairs.length > 0) fail('publish.watch needs a period: the parameter whose value is the day a claim names');
  if (typeof together !== 'boolean') fail('publish.together is true or false');
}
