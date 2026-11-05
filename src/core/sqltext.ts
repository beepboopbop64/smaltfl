/**
 * Just enough SQL lexing to work with SQL text safely without a parser: find parameters and identifiers outside
 * strings and comments, quote names, and write literals. Parsing proper belongs to the engine (and, with the public
 * plan API, to smaltql's `bind()`).
 */

export type TokenKind = 'string' | 'quoted' | 'word' | 'param' | 'comment' | 'space' | 'other';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
}

export class SqlTextError extends Error {
  override name = 'SqlTextError';
}

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;

/** Split SQL text into tokens. Unterminated strings and quoted names are errors. */
export function tokens(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, end: number) => {
    out.push({ kind, text: sql.slice(i, end), start: i });
    i = end;
  };
  while (i < sql.length) {
    const c = sql[i]!;
    const next = sql[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      push(c === "'" ? 'string' : 'quoted', closeQuote(sql, i, c));
    } else if (c === '[') {
      const end = sql.indexOf(']', i + 1);
      if (end < 0) throw new SqlTextError(`unterminated [name] at ${i}`);
      push('quoted', end + 1);
    } else if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      push('comment', end < 0 ? sql.length : end);
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      push('comment', end < 0 ? sql.length : end + 2);
    } else if (/\s/.test(c)) {
      let j = i + 1;
      while (j < sql.length && /\s/.test(sql[j]!)) j++;
      push('space', j);
    } else if ((c === ':' || c === '@' || c === '$') && next !== undefined && WORD_START.test(next)) {
      let j = i + 2;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j++;
      push('param', j);
    } else if (c === '?') {
      let j = i + 1;
      while (j < sql.length && /[0-9]/.test(sql[j]!)) j++;
      push('param', j);
    } else if (WORD_START.test(c)) {
      let j = i + 1;
      while (j < sql.length && WORD_PART.test(sql[j]!)) j++;
      push('word', j);
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < sql.length && /[0-9A-Za-z_.]/.test(sql[j]!)) j++;
      push('other', j);
    } else {
      push('other', i + 1);
    }
  }
  return out;
}

function closeQuote(sql: string, start: number, q: string): number {
  let j = start + 1;
  for (;;) {
    const k = sql.indexOf(q, j);
    if (k < 0) throw new SqlTextError(`unterminated ${q === "'" ? 'string' : 'quoted name'} at ${start}`);
    if (sql[k + 1] === q) {
      j = k + 2;
      continue;
    }
    return k + 1;
  }
}

/** A parameter value: what a flow parameter can hold. */
export type ParamValue = string | number | bigint | null;

/** The SQL type a parameter is declared with. */
export type ParamType = 'text' | 'integer' | 'real';

/**
 * Replace every `:name`, `@name` and `$name` outside strings and comments with the value's literal, so the text no
 * longer needs parameters (the flow plan is complete). Positional `?` parameters are refused: a flow names them.
 */
export function bindParameters(sql: string, params: Readonly<Record<string, { type: ParamType; value: ParamValue }>>): string {
  let out = '';
  for (const t of tokens(sql)) {
    if (t.kind !== 'param') {
      out += t.text;
      continue;
    }
    if (t.text.startsWith('?')) throw new SqlTextError(`positional parameter ${t.text}: name it, as :name`);
    const name = t.text.slice(1);
    const p = params[name];
    if (!p) throw new SqlTextError(`unknown parameter ${t.text}${Object.keys(params).length ? ` (parameters: ${Object.keys(params).join(', ')})` : ''}`);
    out += literal(p.value, p.type);
  }
  return out;
}

/** Whether SQL text uses parameters (outside strings and comments). */
export function parameterNames(sql: string): string[] {
  return [...new Set(tokens(sql).filter((t) => t.kind === 'param' && !t.text.startsWith('?')).map((t) => t.text.slice(1)))];
}

/** A SQL literal for a value of a declared type. */
export function literal(value: ParamValue, type: ParamType): string {
  if (value === null) return 'NULL';
  switch (type) {
    case 'text':
      if (typeof value !== 'string') throw new SqlTextError(`expected text, got ${typeof value}`);
      return `'${value.replace(/'/g, "''")}'`;
    case 'integer':
      if (typeof value === 'bigint') return value.toString();
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new SqlTextError(`expected an integer, got ${String(value)}`);
      return String(value);
    case 'real': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new SqlTextError(`expected a finite number, got ${String(value)}`);
      const s = String(value);
      return /[.eE]/.test(s) ? s : `${s}.0`;
    }
  }
}

/** Quote a name: `"name"`, with `"` doubled. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The names SQL text mentions (bare and quoted), lowercased; keywords and function names are included too. */
export function identifiers(sql: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(sql)) {
    if (t.kind === 'word') out.add(t.text.toLowerCase());
    else if (t.kind === 'quoted') out.add(unquote(t.text).toLowerCase());
  }
  return out;
}

/**
 * SQL text with every reference to one name (bare or quoted, in any case) changed to another, strings and comments
 * untouched: for a step whose SQL reads an input by name, when that input is replaced.
 */
export function renameIdentifier(sql: string, from: string, to: string): string {
  const f = from.toLowerCase();
  return tokens(sql)
    .map((t) => (t.kind === 'word' && t.text.toLowerCase() === f ? to : t.kind === 'quoted' && unquote(t.text).toLowerCase() === f ? quoteIdent(to) : t.text))
    .join('');
}

function unquote(text: string): string {
  const q = text[0];
  if (q === '[') return text.slice(1, -1);
  return text.slice(1, -1).split(`${q}${q}`).join(q!);
}

/** SQL text without trailing semicolons and whitespace (a common habit that a wrapped statement can't have). */
export function withoutTrailingSemicolons(sql: string): string {
  const ts = tokens(sql);
  let end = ts.length;
  while (end > 0 && (ts[end - 1]!.kind === 'space' || ts[end - 1]!.text === ';')) end--;
  return ts
    .slice(0, end)
    .map((t) => t.text)
    .join('');
}
