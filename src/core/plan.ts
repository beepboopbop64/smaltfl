/**
 * The flow plan: what the machine runs (ADR 0004). A pure, deterministic translation of the flow document, with
 * nothing left open: parameters are filled in as literals, inputs are referenced by node, and display fields are
 * gone. The runtime adds each node's output schema when it types the plan, so a stored plan is complete.
 *
 * Nobody needs to read it. It is canonical JSON with positional references, built for hashing, optimizing and
 * replaying, and its format is versioned (`smaltflPlan`).
 */
import type { FlowDocument, ParameterDef, StepDef } from './document.js';
import { validateDocument, withoutDisplay } from './document.js';
import { hashOf } from './hash.js';
import type { ParamType, ParamValue } from './sqltext.js';
import { bindParameters, quoteIdent, SqlTextError, withoutTrailingSemicolons } from './sqltext.js';

export const PLAN_FORMAT = 0;

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

export type PlanNode = TableNode | SqlNode | FilterNode | FormulaNode | SelectNode | JoinNode | AggregateNode | ExpectNode;

export interface PlanOutput {
  /** The dataset's name: the id of the step that produces it. */
  name: string;
  node: number;
}

export interface FlowPlan {
  smaltflPlan: typeof PLAN_FORMAT;
  /** The document's id, and its hash without display fields (the flow hash). */
  flow: { id: string; hash: string };
  /** The parameter values filled in, for the record (the nodes no longer need them). */
  parameters: Record<string, string | number | null>;
  /** In an order where every node's inputs come before it. */
  nodes: PlanNode[];
  /** Sorted by name. */
  outputs: PlanOutput[];
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
    nodes.push(translateStep(step, base, at, bind));
    index.set(step.id.toLowerCase(), nodes.length - 1);
    if (step.dataset) outputs.push({ name: step.id, node: nodes.length - 1 });
  }
  outputs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parameters: Record<string, string | number | null> = {};
  for (const [k, p] of Object.entries(params)) parameters[k] = typeof p.value === 'bigint' ? p.value.toString() : p.value;
  return { smaltflPlan: PLAN_FORMAT, flow: { id: doc.id, hash: await flowHash(doc) }, parameters, nodes, outputs };
}

type Base = Pick<NodeBase, 'origin' | 'inputs' | 'storage'>;

function translateStep(step: StepDef, base: Base, at: string, bind: (sql: string, path: string) => string): PlanNode {
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
        rules: step.rules.map((r, i) => [r.name, bind(r.check, `${at}.rules[${i}].check`), r.onFail]),
        maxDropped: step.maxDropped ?? null,
      };
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

const OPS = new Set(['table', 'sql', 'filter', 'formula', 'select', 'join', 'aggregate', 'expect']);

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
  if (p.smaltflPlan !== PLAN_FORMAT) fail(`format ${String(p.smaltflPlan)}, expected ${PLAN_FORMAT}`);
  if (!p.flow || typeof p.flow.id !== 'string' || typeof p.flow.hash !== 'string') fail('flow needs an id and a hash');
  if (!Array.isArray(p.nodes)) fail('nodes is not an array');
  p.nodes.forEach((n, i) => {
    if (typeof n !== 'object' || n === null || !OPS.has(n.op)) fail(`node ${i} has no known op`);
    if (!Array.isArray(n.inputs) || n.inputs.some((j) => !Number.isInteger(j) || j < 0 || j >= i)) fail(`node ${i} reads a node that does not come before it`);
    const arity = n.op === 'table' ? 0 : n.op === 'join' ? 2 : n.op === 'sql' ? n.names.length : 1;
    if (n.inputs.length !== arity) fail(`node ${i} (${n.op}) has ${n.inputs.length} inputs`);
  });
  if (!Array.isArray(p.outputs)) fail('outputs is not an array');
  const names = new Set<string>();
  for (const o of p.outputs) {
    if (typeof o.name !== 'string' || !Number.isInteger(o.node) || o.node < 0 || o.node >= p.nodes.length) fail(`output ${String(o.name)} points at no node`);
    if (p.nodes[o.node]!.op === 'table') fail(`output ${o.name} is a source: sources are snapshots, not datasets`);
    if (names.has(o.name.toLowerCase())) fail(`two outputs named ${o.name}`);
    names.add(o.name.toLowerCase());
  }
}
