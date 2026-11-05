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

// ------------------------------------------------------------------ inspection: what a step changed

/** The rows an expectation rule fails on: where its check is not true, NULL included, as the counts count them. */
export function emitRuleFailures(plan: FlowPlan, node: number, rule: number, ctx: EmitContext): string {
  return emitFailures(plan, node, [rule], ctx);
}

/**
 * The rows an expectation drops (those failing any of its drop rules), each with a flag for each rule in `flags`
 * (by index): `_smaltfl_fail_<k>` is 1 when the row fails rule k, so a person can be told why it went.
 */
export function emitDropped(plan: FlowPlan, node: number, flags: readonly number[], ctx: EmitContext): string {
  const n = plan.nodes[node] as ExpectNode;
  const drops = n.rules.flatMap((r, k) => (r[2] === 'drop' ? [k] : []));
  const marks = flags.map((k) => `, CASE WHEN (\n${n.rules[k]![1]}\n) THEN 0 ELSE 1 END AS ${q(`_smaltfl_fail_${k}`)}`).join('');
  const all = drops.map((k) => `(\n${n.rules[k]![1]}\n)`).join(' AND ') || 'TRUE';
  return `SELECT *${marks} FROM (\n${emitRead(plan, n.inputs[0]!, ctx)}\n) WHERE CASE WHEN ${all} THEN 0 ELSE 1 END = 1`;
}

/** The rows that fail any of an expectation's rules (by index), each row once. */
export function emitFailures(plan: FlowPlan, node: number, rules: readonly number[], ctx: EmitContext): string {
  const n = plan.nodes[node] as ExpectNode;
  const all = rules.map((k) => `(\n${n.rules[k]![1]}\n)`).join(' AND ');
  return `SELECT * FROM (\n${emitRead(plan, n.inputs[0]!, ctx)}\n) WHERE CASE WHEN ${all} THEN 0 ELSE 1 END = 1`;
}

/**
 * The rows of a step's first input that its output doesn't have, as a multiset, for a step whose output has the same
 * columns as that input (a filter, a dedupe, an expectation's drops, a SQL step that keeps the columns).
 */
export function emitRemoved(plan: FlowPlan, node: number, ctx: EmitContext): string | null {
  const input = plan.nodes[node]!.inputs[0];
  if (input === undefined || !sameColumns(ctx.columns(input), ctx.columns(node))) return null;
  return emitExcept(emitRead(plan, input, ctx), emitRead(plan, node, ctx), ctx.columns(input));
}

/** Whether two column lists name the same columns in the same order (names compare without case, as the engine's do). */
export function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i]!.toLowerCase());
}

/**
 * The rows of `a` that `b` doesn't have, as a multiset over `columns` (which both have): each row is numbered among its
 * identical copies, so a removed duplicate shows up too.
 */
export function emitExcept(a: string, b: string, columns: readonly string[]): string {
  const list = columns.map(q).join(', ');
  const numbered = (sql: string) => `SELECT ${list}, row_number() OVER (PARTITION BY ${list} ORDER BY ${q(columns[0]!)}) AS "_smaltfl_copy" FROM (\n${sql}\n)`;
  return `SELECT ${list} FROM (\n${numbered(a)}\nEXCEPT\n${numbered(b)}\n)`;
}

/**
 * A join's left-hand rows that found no match on the right: the rows a left join keeps with its new columns empty, and
 * an inner join leaves out. Exact: a row matches when some right-hand row has its key (a NULL key matches nothing).
 */
export function emitUnmatched(plan: FlowPlan, node: number, ctx: EmitContext): string | null {
  const n = plan.nodes[node]!;
  if (n.op !== 'join') return null;
  const keys = n.on.map(([, r]) => q(r)).join(', ');
  const on = n.on.map(([l, r]) => `"_l".${q(l)} = "_r".${q(r)}`).join(' AND ');
  const right = `SELECT DISTINCT ${keys} FROM (\n${emitRead(plan, n.inputs[1]!, ctx)}\n)`;
  return `SELECT "_l".* FROM (\n${emitRead(plan, n.inputs[0]!, ctx)}\n) AS "_l" LEFT JOIN (${right}) AS "_r" ON ${on} WHERE "_r".${q(n.on[0]![1])} IS NULL`;
}

// ------------------------------------------------------------------ data quality: what a step's columns hold

/**
 * Exact facts about each column of a relation, in one row: the rows, then for each column the values present, the
 * distinct values, the smallest, the largest, and the mean of a numeric one (NULL otherwise).
 */
export function emitColumnFacts(sql: string, columns: readonly { name: string; numeric: boolean }[]): string {
  const parts = ['count(*)'];
  for (const c of columns) {
    const x = q(c.name);
    parts.push(`count(${x})`, `count(DISTINCT ${x})`, `min(${x})`, `max(${x})`, c.numeric ? `avg(${x})` : 'NULL');
  }
  return `SELECT ${parts.join(', ')} FROM (\n${sql}\n)`;
}

/**
 * An even sample of a relation: its first row and every `every`-th one after, in the order it gives them. Each check
 * in `flags` adds a column after the relation's, 1 where the row fails it (NULL failing, as an expectation counts).
 */
export function emitSample(sql: string, columns: readonly string[], every: number, flags: readonly string[] = []): string {
  const list = columns.map(q).join(', ');
  const marks = flags.map((check, k) => `CASE WHEN (\n${check}\n) THEN 0 ELSE 1 END AS ${q(`_smaltfl_check_${k}`)}`);
  const inner = [list, ...marks, 'row_number() OVER () AS "_smaltfl_n"'].join(', ');
  const outer = [list, ...flags.map((_, k) => q(`_smaltfl_check_${k}`))].join(', ');
  return `SELECT ${outer} FROM (SELECT ${inner} FROM (\n${sql}\n)) WHERE ("_smaltfl_n" - 1) % ${Math.max(1, Math.floor(every))} = 0`;
}

/**
 * A SQL step's text over relations other than its inputs': each name it reads bound to a relation (a subquery), as
 * nodeSelect binds a step's inputs. For a step measured over many runs' rows at once.
 */
export function emitSqlOver(sql: string, bindings: readonly (readonly [name: string, relation: string])[]): string {
  const inner = `SELECT * FROM (\n${sql}\n)`;
  if (!bindings.length) return inner;
  return `SELECT * FROM (\nWITH ${bindings.map(([name, rel]) => `${q(name)} AS (\n${rel}\n)`).join(', ')}\n${inner}\n)`;
}

/** Relations' rows together, one after another. */
export function emitUnionAll(relations: readonly string[]): string {
  return relations.map((r) => `SELECT * FROM (\n${r}\n)`).join('\nUNION ALL\n');
}

/** A relation's keys and what names them: the two columns of a lookup (a zone's LocationID and Zone). */
export function emitLookup(sql: string, key: string, label: string): string {
  return `SELECT ${q(key)}, ${q(label)} FROM (\n${sql}\n) WHERE ${q(key)} IS NOT NULL AND ${q(label)} IS NOT NULL`;
}

/** Up to `limit` distinct values of one column of a relation. */
export function emitDistinct(sql: string, column: string, limit: number): string {
  return `SELECT DISTINCT ${q(column)} FROM (\n${sql}\n) LIMIT ${Math.max(1, Math.floor(limit))}`;
}

/** How many rows of a relation fail each check, counted as an expectation counts: a row fails when its check isn't true. */
export function emitCheckCounts(sql: string, checks: readonly string[]): string {
  return `SELECT ${checks.map((c) => `coalesce(sum(CASE WHEN (\n${c}\n) THEN 0 ELSE 1 END), 0)`).join(', ')} FROM (\n${sql}\n)`;
}

/** Copy a relation's rows into a table made for them (createTable): the rows a long look at a step reads. */
export function emitCopy(table: string, columns: readonly string[], sql: string): string {
  const list = columns.map(q).join(', ');
  return `INSERT INTO ${q(table)} (${list}) SELECT ${list} FROM (\n${sql}\n)`;
}

export function emitDrop(table: string): string {
  return `DROP TABLE ${q(table)}`;
}
