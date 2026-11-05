/**
 * The emitter: the only part of smaltfl that knows what the engine accepts (ADR 0004 §5). Today that is SQL; with
 * smaltdb's public plan API it becomes plans, and nothing else changes.
 *
 * The SQL written here is for the engine, not for people. Text that people wrote (expressions, SQL steps) is always
 * placed in parentheses on lines of its own, so a trailing `--` comment can't swallow what follows it, and the
 * engine's `prepare()` accepts one statement only, so nothing can be appended to it.
 */
import { foldedInto } from './optimize.js';
import type { Column, ColumnType, ExpectNode, FlowPlan, FormulaNode, Named, PlanNode } from './plan.js';
import { identifiers, quoteIdent as q } from './sqltext.js';

export interface EmitContext {
  /** The table a stored node is read from; undefined when the node is folded into the statement. */
  table(node: number): string | undefined;
  /** A node's output column names (the plan's types). */
  columns(node: number): readonly string[];
}

/** The common table expression a folded node becomes. */
export const cteName = (node: number): string => `_smaltfl_n${node}`;

/** The statement that computes node `target` from stored tables, with every folded node it reads as a CTE. */
export function emitSelect(plan: FlowPlan, target: number, ctx: EmitContext): string {
  const folded = foldedInto(plan, target, (i) => ctx.table(i) !== undefined);
  const ref = (i: number) => q(ctx.table(i) ?? cteName(i));
  const body = (i: number) => {
    const node = plan.nodes[i]!;
    return nodeSelect(node, node.inputs.map(ref), node.inputs.map((j) => ctx.columns(j)));
  };
  const main = body(target);
  if (folded.length === 0) return main;
  return `WITH ${folded.map((i) => `${q(cteName(i))} AS (\n${body(i)}\n)`).join(',\n')}\n${main}`;
}

/** The rows of a node: its table when it is stored, else the statement that computes it. */
export function emitRead(plan: FlowPlan, node: number, ctx: EmitContext): string {
  const t = ctx.table(node);
  return t !== undefined ? `SELECT * FROM ${q(t)}` : emitSelect(plan, node, ctx);
}

/**
 * The counts an expectation reports, in one row: the input's rows, each rule's failures (a row fails when its
 * check is not true, NULL included), and the rows the drop rules leave out.
 */
export function emitExpectCounts(plan: FlowPlan, node: number, ctx: EmitContext): string {
  const n = plan.nodes[node] as ExpectNode;
  const failures = n.rules.map(([, check]) => `coalesce(sum(CASE WHEN (\n${check}\n) THEN 0 ELSE 1 END), 0)`);
  const drops = dropChecks(n);
  const dropped = drops.length ? `coalesce(sum(CASE WHEN ${drops.join(' AND ')} THEN 0 ELSE 1 END), 0)` : '0';
  return `SELECT count(*), ${[...failures, dropped].join(', ')} FROM (\n${emitRead(plan, n.inputs[0]!, ctx)}\n)`;
}

/** One SELECT for one node, over its inputs' relations (quoted names) and their column names. */
export function nodeSelect(node: PlanNode, from: readonly string[], inputColumns: readonly (readonly string[])[]): string {
  const expr = ([name, e]: Named) => `(\n${e}\n) AS ${q(name)}`;
  switch (node.op) {
    case 'table':
      throw new Error('a table node is a snapshot: it is read, never computed');
    case 'sql': {
      const inner = `SELECT * FROM (\n${node.sql}\n)`;
      if (node.names.length === 0) return inner;
      const bindings = node.names.map((name, k) => `${q(name)} AS (SELECT * FROM ${from[k]})`).join(', ');
      return `SELECT * FROM (\nWITH ${bindings}\n${inner}\n)`;
    }
    case 'filter':
      return `SELECT * FROM ${from[0]} WHERE (\n${node.where}\n)`;
    case 'formula':
      return formula(node, from[0]!, inputColumns[0]!);
    case 'select':
      return `SELECT ${node.project.map(expr).join(', ')} FROM ${from[0]}`;
    case 'join': {
      const take = node.take.map(([name, column]) => `, "_r".${q(column)} AS ${q(name)}`).join('');
      const on = node.on.map(([l, r]) => `"_l".${q(l)} = "_r".${q(r)}`).join(' AND ');
      return `SELECT "_l".*${take} FROM ${from[0]} AS "_l" ${node.how === 'left' ? 'LEFT JOIN' : 'JOIN'} ${from[1]} AS "_r" ON ${on}`;
    }
    case 'aggregate': {
      const cols = [...node.groupBy, ...node.measures].map(expr).join(', ');
      const group = node.groupBy.length ? ` GROUP BY ${node.groupBy.map((_, k) => k + 1).join(', ')}` : '';
      return `SELECT ${cols} FROM ${from[0]}${group}`;
    }
    case 'expect': {
      const drops = dropChecks(node);
      return `SELECT * FROM ${from[0]}${drops.length ? ` WHERE ${drops.join(' AND ')}` : ''}`;
    }
  }
}

function dropChecks(node: ExpectNode): string[] {
  return node.rules.filter(([, , onFail]) => onFail === 'drop').map(([, check]) => `(\n${check}\n)`);
}

/**
 * A formula's columns, in order. A column that uses a name set earlier in the same formula reads the new value,
 * so it starts a new layer (a SELECT over the previous one); the engine fuses the layers.
 */
function formula(node: FormulaNode, from: string, inputColumns: readonly string[]): string {
  let columns = [...inputColumns];
  let rel = from;
  let sql = '';
  let layer = 0;
  let pending: Named[] = [];
  const flush = () => {
    const set = new Map(pending.map((p) => [p[0].toLowerCase(), p]));
    const parts: string[] = [];
    const next: string[] = [];
    for (const c of columns) {
      const p = set.get(c.toLowerCase());
      if (p) {
        parts.push(`(\n${p[1]}\n) AS ${q(p[0])}`);
        next.push(p[0]);
        set.delete(c.toLowerCase());
      } else {
        parts.push(q(c));
        next.push(c);
      }
    }
    for (const [name, e] of set.values()) {
      parts.push(`(\n${e}\n) AS ${q(name)}`);
      next.push(name);
    }
    sql = `SELECT ${parts.join(', ')} FROM ${rel}`;
    rel = `(\n${sql}\n) AS ${q(`_smaltfl_l${layer++}`)}`;
    columns = next;
    pending = [];
  };
  for (const item of node.set) {
    const used = identifiers(item[1]);
    if (pending.some(([name]) => used.has(name.toLowerCase()))) flush();
    pending.push(item);
  }
  flush();
  return sql;
}

/** The declared column type for a static type: STRICT tables take INTEGER, REAL, TEXT, BLOB and ANY. */
export function declaredType(t: ColumnType): 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB' | 'ANY' {
  switch (t) {
    case 'int':
      return 'INTEGER';
    case 'real':
      return 'REAL';
    case 'text':
      return 'TEXT';
    case 'blob':
      return 'BLOB';
    default:
      return 'ANY';
  }
}

/** CREATE TABLE for a stored node's version, from its schema. A temporary table lives in memory only. */
export function createTable(name: string, schema: readonly Column[], options: { storage?: 'columnar'; temp?: boolean } = {}): string {
  const cols = schema.map(([n, t]) => `${q(n)} ${declaredType(t)}`).join(', ');
  return `CREATE ${options.temp ? 'TEMP ' : ''}TABLE ${q(name)}(${cols})${options.storage === 'columnar' ? " WITH (storage = 'columnar')" : ''}`;
}
