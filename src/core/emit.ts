/**
 * The emitter: the only part of smaltfl that knows what the engine accepts (ADR 0004 §5). Today that is SQL; with
 * smaltdb's public plan API it becomes plans, and nothing else changes.
 *
 * The SQL written here is for the engine, not for people. Text that people wrote (expressions, SQL steps) is always
 * placed in parentheses on lines of its own, so a trailing `--` comment can't swallow what follows it, and the
 * engine's `prepare()` accepts one statement only, so nothing can be appended to it.
 */
import { daysBetween } from './calendar.js';
import { FILLED_FROM, type Missing } from './document.js';
import { foldedInto } from './optimize.js';
import type { Column, ColumnType, ExpectNode, FillNode, FlowPlan, FormulaNode, Named, PlanNode } from './plan.js';
import { identifiers, quoteIdent as q, tokens, type Token } from './sqltext.js';

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
    // A fill reads its inputs' types: its missing hours and shifts are written for the type of their column.
    const types = node.op === 'fill' ? node.inputs.map((j) => plan.nodes[j]!.schema) : undefined;
    return nodeSelect(node, node.inputs.map(ref), node.inputs.map((j) => ctx.columns(j)), types);
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
  return emitRuleCounts(emitRead(plan, n.inputs[0]!, ctx), n.rules);
}

/**
 * The same counts over any relation, for rules given as an expectation has them (`[name, check, onFail]`): what a
 * load's measures say its checks drop (ADR 0010 §6), counted over the source's snapshot as the run counts them.
 */
export function emitRuleCounts(sql: string, rules: readonly (readonly [name: string, check: string, onFail: string])[]): string {
  const failures = rules.map(([, check]) => `coalesce(sum(CASE WHEN (\n${check}\n) THEN 0 ELSE 1 END), 0)`);
  const drops = rules.filter(([, , onFail]) => onFail === 'drop').map(([, check]) => `(\n${check}\n)`);
  const dropped = drops.length ? `coalesce(sum(CASE WHEN ${drops.join(' AND ')} THEN 0 ELSE 1 END), 0)` : '0';
  return `SELECT count(*), ${[...failures, dropped].join(', ')} FROM (\n${sql}\n)`;
}

/**
 * One SELECT for one node, over its inputs' relations (quoted names) and their column names. A fill node needs its
 * inputs' typed columns too (`inputTypes`, as the typed plan has them).
 */
export function nodeSelect(node: PlanNode, from: readonly string[], inputColumns: readonly (readonly string[])[], inputTypes?: readonly (readonly Column[] | undefined)[]): string {
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
    case 'fill':
      return fillSelect(node, from, inputTypes?.[0]);
  }
}

/**
 * A fill (ADR 0009 amendment 1 S4): with nothing missing, the source's rows and `filled_from` null. With a missing part,
 * the rows outside it (filled_from null), and with a donor the donor's rows inside it, each column taken by the
 * source's name and cast to the source's type, the shift columns moved to the run's day by whole days, and
 * `filled_from` the donor's day. A row is inside the missing part only when the part's test is true: a row whose hour
 * or value can't be read stays with what arrived.
 */
function fillSelect(node: FillNode, from: readonly string[], source: readonly Column[] | undefined): string {
  const mark = (v: string | null) => `CAST(${v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`} AS TEXT) AS ${q(FILLED_FROM)}`;
  if (node.missing === null) return `SELECT *, ${mark(null)} FROM ${from[0]}`;
  if (!source) throw new Error(`${node.origin}: a fill is written for its source's types, and the plan isn't typed`);
  const inside = `CASE WHEN (${missingSql(node.missing, source)}) THEN 1 ELSE 0 END`;
  const kept = `SELECT ${source.map(([c]) => q(c)).join(', ')}, ${mark(null)} FROM ${from[0]} WHERE ${inside} = 0`;
  if (node.from === null) return kept;
  const days = daysBetween(node.from, node.to!);
  const shifted = new Set(node.shift.map((c) => c.toLowerCase()));
  const cols = source.map(([c, t]) => {
    const value = shifted.has(c.toLowerCase()) ? shiftSql(q(c), days, t) : q(c);
    const cast = CASTS[t];
    return `${cast ? `CAST(${value} AS ${cast})` : value} AS ${q(c)}`;
  });
  return `${kept}\nUNION ALL\nSELECT ${cols.join(', ')}, ${mark(node.from)} FROM ${from[1]} WHERE ${inside} = 1`;
}

/** The declared types a donor's columns are cast to, so they are the source's (ADR 0009 amendment 1 S4). */
const CASTS: Partial<Record<ColumnType, string>> = { int: 'INTEGER', real: 'REAL', text: 'TEXT', blob: 'BLOB' };

/**
 * The test a row is inside a missing part by, over the source's columns: an hour from `hours[0]` to `hours[1]` of its
 * time (the text's hour, as the history counts them, for a time kept as text); the part's value (`IS`, so a null is a
 * value like another); or, for the rest, any other value.
 */
export function missingSql(m: Missing, columns: readonly Column[]): string {
  const typeOf = (c: string) => columns.find(([n]) => n.toLowerCase() === c.toLowerCase())?.[1];
  if ('hours' in m) {
    const t = q(m.time);
    const hour = typeOf(m.time) === 'text' ? `CAST(substr(${t}, 12, 2) AS INTEGER)` : `CAST(strftime('%H', ${t}) AS INTEGER)`;
    return `${hour} BETWEEN ${m.hours[0]} AND ${m.hours[1]}`;
  }
  return `${q(m.column)} ${m.rest ? 'IS NOT' : 'IS'} ${valueSql(m.value)}`;
}

function valueSql(v: string | number | boolean | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * A column moved by whole days: for a time kept as text, its date part moved and the rest of the text as it was (so a
 * local time keeps its hour); a whole number is read as seconds since 1970, a real number as a Julian day.
 */
export function shiftSql(col: string, days: number, type: ColumnType): string {
  if (days === 0) return col;
  if (type === 'int') return `(${col} + ${days * 86400})`;
  if (type === 'real') return `(${col} + ${days})`;
  return `(date(substr(${col}, 1, 10), '${days > 0 ? '+' : ''}${days} days') || substr(${col}, 11))`;
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

/** The engine's date and time functions, which take a stamp and then modifiers ("-1 hour"). */
const TIME_FUNCTIONS = new Set(['strftime', 'datetime', 'date', 'time', 'julianday', 'unixepoch']);
/** A modifier that moves a stamp by a whole amount of a unit: "-1 hour", "+30 minutes", "-60 minutes". */
const SHIFT = /^[+-]?\d+(\.\d+)? (hours?|minutes?|seconds?|days?)$/i;

/**
 * The shift that expressions people wrote give a stamp column, read in the engine's own terms (ADR 0004 §5: only the
 * emitter knows its language): the modifiers that follow `column` in one of its date and time functions, as written
 * ("strftime('%Y-%m-%d %H:00', \"time\", '-1 hour')", "datetime(time, '-60 minutes')"); the first expression that has
 * one wins. Null when none moves it. emitDayHours applies them, so a card reads the stamp as the flow's step does.
 */
export function stampShift(exprs: readonly string[], column: string): string[] | null {
  const named = (t: Token) => (t.kind === 'word' && t.text.toLowerCase() === column.toLowerCase()) || (t.kind === 'quoted' && t.text.slice(1, -1).replace(/""/g, '"') === column);
  for (const expr of exprs) {
    let toks: Token[];
    try {
      toks = tokens(expr).filter((t) => t.kind !== 'space' && t.kind !== 'comment');
    } catch {
      continue;
    }
    for (let i = 0; i + 1 < toks.length; i++) {
      if (toks[i]!.kind !== 'word' || !TIME_FUNCTIONS.has(toks[i]!.text.toLowerCase()) || toks[i + 1]!.text !== '(') continue;
      // Its arguments, split at its own commas.
      const args: Token[][] = [[]];
      let depth = 0;
      for (let j = i + 2; j < toks.length; j++) {
        const t = toks[j]!;
        if (t.text === '(') depth++;
        else if (t.text === ')' && depth-- === 0) break;
        if (t.text === ',' && depth === 0) args.push([]);
        else args.at(-1)!.push(t);
      }
      const at = args.findIndex((a) => a.length === 1 && named(a[0]!));
      if (at < 0) continue;
      const mods = args.slice(at + 1).map((a) => (a.length === 1 && a[0]!.kind === 'string' ? a[0]!.text.slice(1, -1).replace(/''/g, "'") : null));
      const shift = mods.filter((m): m is string => m !== null && SHIFT.test(m.trim())).map((m) => m.trim());
      if (shift.length) return shift;
    }
  }
  return null;
}

/**
 * One day's hours of a relation of hourly rows, each measure averaged over its places (the districts): the hour of
 * day (0–23) and each column's mean. `shift` moves the stamp first, for a source that stamps an hour at its end
 * (Open-Meteo: "-1 hour"), as its own step reads it (stampShift). For a card that draws the day's 24 hours.
 */
export function emitDayHours(sql: string, time: string, day: string, columns: readonly string[], shift: string | readonly string[] | null = null): string {
  const mods = shift === null ? [] : typeof shift === 'string' ? [shift] : shift;
  const t = [q(time), ...mods.map((m) => `'${m.replace(/'/g, "''")}'`)].join(', ');
  const avg = columns.map((c) => `avg(${q(c)}) AS ${q(c)}`).join(', ');
  return `SELECT CAST(strftime('%H', ${t}) AS INTEGER) AS "hour", ${avg} FROM (\n${sql}\n) WHERE date(${t}) = '${day.replace(/'/g, "''")}' GROUP BY 1 ORDER BY 1`;
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
