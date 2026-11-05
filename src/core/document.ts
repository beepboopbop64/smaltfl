/**
 * The flow document: what people write and read (ADR 0004 §1). It is the source of truth, a plain JSON file that
 * diffs in Git, and it says what a flow computes. How it runs is the flow plan's business (plan.ts).
 *
 * Expressions are SQL expression text (smaltdb's SQL), so a visual step reads the way its SQL would. Steps refer to
 * their inputs, and SQL steps to their inputs' data, by the inputs' ids.
 */
import type { Ontology } from './ontology.js';
import type { Policies } from './policy.js';
import type { ParamType, ParamValue } from './sqltext.js';
import { renameIdentifier, SqlTextError, tokens } from './sqltext.js';

export const DOCUMENT_FORMAT = 1;

export interface FlowDocument {
  smaltfl: typeof DOCUMENT_FORMAT;
  id: string;
  name: string;
  description?: string;
  parameters?: ParameterDef[];
  sources: SourceDef[];
  steps: StepDef[];
  /** The object, link and action types over the flow's datasets (ontology.ts). */
  ontology?: Ontology;
  /** Who may read which rows and columns, and run which actions (policy.ts). */
  policies?: Policies;
  /** Display only: sections of the canvas, each holding sources and steps. Not part of any hash. */
  groups?: GroupDef[];
  /**
   * Display only: profile boxes, each looking at one source's or step's rows (what its columns hold, the rows an
   * isolation forest finds odd, how it moved from one load to the next). A profile changes no data. Not part of any hash.
   */
  profiles?: ProfileDef[];
  /** Display only: where each card sits on the canvas. Not part of any hash. */
  layout?: Record<string, [number, number]>;
}

export interface GroupDef {
  id: string;
  name: string;
  /** Source and step ids, each in at most one group. A group may be empty: a box waiting for steps. */
  steps: string[];
  collapsed?: boolean;
  /** One of the canvas's section colours. */
  color?: GroupColor;
}

/** A profile box: what it looks at, and what it is for. It sits beside that source or step, in its section. */
export interface ProfileDef {
  id: string;
  /** The source or step whose rows it profiles. */
  of: string;
  description?: string;
}

/** The colours a section can take, each drawn from the family's tokens in light and dark. */
export const GROUP_COLORS = ['slate', 'smalt', 'teal', 'green', 'amber', 'rose', 'violet'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface ParameterDef {
  name: string;
  type: ParamType;
  default?: ParamValue;
  description?: string;
}

/** A source: data the flow reads. v1 reads tables already in the database; files and URLs come next. */
export interface SourceDef {
  id: string;
  table: string;
  description?: string;
}

/** A stored dataset's settings, on the step that produces it. */
export interface DatasetDef {
  description?: string;
  owner?: string;
  /** How the engine stores it (default `row`). */
  storage?: 'row' | 'columnar';
}

interface StepBase {
  id: string;
  inputs: string[];
  description?: string;
  /** Persist this step's output as a dataset named by its id. */
  dataset?: DatasetDef;
}

/** A computed column: its name and a SQL expression over the step's input columns. */
export interface NamedExpr {
  name: string;
  expr: string;
}

export interface SqlStep extends StepBase {
  kind: 'sql';
  /** One SELECT over the inputs, which it names by their ids. */
  sql: string;
}

export interface FilterStep extends StepBase {
  kind: 'filter';
  /** Rows for which this is true are kept. */
  where: string;
}

export interface FormulaStep extends StepBase {
  kind: 'formula';
  /** Added, or replacing the input column of the same name, in order: a column may use the ones before it. */
  columns: NamedExpr[];
}

export interface SelectStep extends StepBase {
  kind: 'select';
  /** The output columns, in order: an input column's name, or a named expression. */
  columns: (string | NamedExpr)[];
}

export interface JoinStep extends StepBase {
  kind: 'join';
  /** `inputs` is [left, right]. */
  how: 'inner' | 'left';
  on: { left: string; right: string }[];
  /** The right input's columns to add, by name, or renamed. Every left column is kept. */
  columns: (string | { name: string; column: string })[];
}

export interface AggregateStep extends StepBase {
  kind: 'aggregate';
  groupBy: (string | NamedExpr)[];
  /** Aggregate expressions, such as `count(*)` or `avg(duration_min)`. */
  measures: NamedExpr[];
}

export interface ExpectationRule {
  name: string;
  /** True for a row that passes. A row for which it is NULL fails. */
  check: string;
  /** warn: count the failures; drop: also leave the row out; fail: fail the run if any row fails. */
  onFail: 'warn' | 'drop' | 'fail';
  /** Why the rule is there, for people: shown with the rows it flags or drops. Not part of the plan, nor of any key. */
  description?: string;
}

export interface ExpectationsStep extends StepBase {
  kind: 'expectations';
  rules: ExpectationRule[];
  /** Fail the run if more than this fraction of rows is dropped (0 to 1). */
  maxDropped?: number;
}

export type StepDef = SqlStep | FilterStep | FormulaStep | SelectStep | JoinStep | AggregateStep | ExpectationsStep;

export type StepKind = StepDef['kind'];

export interface Issue {
  path: string;
  message: string;
}

const ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const KINDS: readonly StepKind[] = ['sql', 'filter', 'formula', 'select', 'join', 'aggregate', 'expectations'];

/**
 * Check a document's shape and references. An empty list means it can be translated into a flow plan. SQL text is
 * checked only lexically here; the engine checks the rest when the plan is typed.
 */
export function validateDocument(doc: unknown): Issue[] {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (!isRecord(doc)) return [{ path: '$', message: 'a flow document is a JSON object' }];
  if (doc.smaltfl !== DOCUMENT_FORMAT) add('$.smaltfl', `expected ${DOCUMENT_FORMAT}, the format this version reads`);
  if (typeof doc.id !== 'string' || doc.id === '') add('$.id', 'a non-empty string');
  if (typeof doc.name !== 'string' || doc.name === '') add('$.name', 'a non-empty string');

  const params = new Map<string, ParameterDef>();
  if (doc.parameters !== undefined) {
    if (!Array.isArray(doc.parameters)) add('$.parameters', 'an array');
    else
      doc.parameters.forEach((p: unknown, i: number) => {
        const at = `$.parameters[${i}]`;
        if (!isRecord(p) || typeof p.name !== 'string' || !ID.test(p.name)) return add(at, 'a parameter needs a name: a letter, then letters, digits or _');
        if (params.has(p.name)) add(`${at}.name`, `duplicate parameter ${p.name}`);
        if (p.type !== 'text' && p.type !== 'integer' && p.type !== 'real') add(`${at}.type`, 'text, integer or real');
        else if (p.default !== undefined && p.default !== null && !fits(p.default, p.type)) add(`${at}.default`, `not a ${p.type}`);
        params.set(p.name, p as unknown as ParameterDef);
      });
  }

  const ids = new Map<string, string>();
  const claim = (id: unknown, at: string): id is string => {
    if (typeof id !== 'string' || !ID.test(id)) {
      add(at, 'an id: a letter, then up to 63 letters, digits or _');
      return false;
    }
    const lower = id.toLowerCase();
    if (ids.has(lower)) {
      add(at, `duplicate id ${id} (ids are compared without case, as SQL names are)`);
      return false;
    }
    ids.set(lower, at);
    return true;
  };

  if (!Array.isArray(doc.sources)) add('$.sources', 'an array');
  else
    doc.sources.forEach((s: unknown, i: number) => {
      const at = `$.sources[${i}]`;
      if (!isRecord(s)) return add(at, 'an object');
      claim(s.id, `${at}.id`);
      if (typeof s.table !== 'string' || s.table === '') add(`${at}.table`, 'the name of a table in the database');
    });

  const steps: Record<string, unknown>[] = [];
  if (!Array.isArray(doc.steps)) add('$.steps', 'an array');
  else
    doc.steps.forEach((s: unknown, i: number) => {
      const at = `$.steps[${i}]`;
      if (!isRecord(s)) return add(at, 'an object');
      claim(s.id, `${at}.id`);
      steps.push(s);
    });

  steps.forEach((s, i) => {
    const at = `$.steps[${i}]`;
    if (!KINDS.includes(s.kind as StepKind)) return add(`${at}.kind`, `one of ${KINDS.join(', ')}`);
    if (!Array.isArray(s.inputs) || s.inputs.some((x) => typeof x !== 'string')) return add(`${at}.inputs`, 'an array of ids');
    const inputs = s.inputs as string[];
    inputs.forEach((x, j) => {
      if (!ids.has(x.toLowerCase())) add(`${at}.inputs[${j}]`, `no source or step ${x}`);
      else if (x.toLowerCase() === String(s.id).toLowerCase()) add(`${at}.inputs[${j}]`, 'a step cannot read itself');
    });
    if (new Set(inputs.map((x) => x.toLowerCase())).size !== inputs.length) add(`${at}.inputs`, 'an input is listed twice');
    const arity = s.kind === 'join' ? 2 : s.kind === 'sql' ? -1 : 1;
    if (arity >= 0 && inputs.length !== arity) add(`${at}.inputs`, `a ${s.kind} step has ${arity === 1 ? 'one input' : 'two inputs'}`);
    if (s.dataset !== undefined) {
      if (!isRecord(s.dataset)) add(`${at}.dataset`, 'an object');
      else if (s.dataset.storage !== undefined && s.dataset.storage !== 'row' && s.dataset.storage !== 'columnar') add(`${at}.dataset.storage`, 'row or columnar');
    }
    validateConfig(s, at, add);
  });

  if (issues.length === 0) {
    const cycle = findCycle(steps as unknown as StepDef[]);
    if (cycle) add('$.steps', `the steps form a cycle: ${cycle.join(' → ')}`);
  }
  if (doc.layout !== undefined) {
    if (!isRecord(doc.layout)) add('$.layout', 'an object');
    // Keys are card ids, or `group:<id>` for where an empty section sits; a key nothing uses is ignored.
    else for (const [k, v] of Object.entries(doc.layout)) if (!(Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)))) add(`$.layout.${k}`, '[x, y]');
  }
  validateExtras(doc, ids, add);
  return issues;
}

/** Groups, the ontology and the policies: their references, checked against the flow's ids. */
function validateExtras(doc: Record<string, unknown>, ids: Map<string, string>, add: (path: string, message: string) => void): void {
  const known = (id: unknown) => typeof id === 'string' && ids.has(id.toLowerCase());
  if (doc.groups !== undefined) {
    if (!Array.isArray(doc.groups)) add('$.groups', 'an array');
    else {
      const placed = new Set<string>();
      const named = new Set<string>();
      doc.groups.forEach((g: unknown, i: number) => {
        if (!isRecord(g) || typeof g.id !== 'string' || typeof g.name !== 'string' || !Array.isArray(g.steps)) return add(`$.groups[${i}]`, '{ id, name, steps }');
        if (named.has(g.id.toLowerCase()) || known(g.id)) add(`$.groups[${i}].id`, `${g.id} is already the id of a group, source or step`);
        named.add(g.id.toLowerCase());
        if (g.color !== undefined && !(GROUP_COLORS as readonly unknown[]).includes(g.color)) add(`$.groups[${i}].color`, `one of ${GROUP_COLORS.join(', ')}`);
        g.steps.forEach((s: unknown, j: number) => {
          if (!known(s)) add(`$.groups[${i}].steps[${j}]`, `no source or step ${String(s)}`);
          else if (placed.has(String(s).toLowerCase())) add(`$.groups[${i}].steps[${j}]`, `${String(s)} is in two groups`);
          else placed.add(String(s).toLowerCase());
        });
      });
    }
  }
  if (doc.profiles !== undefined) {
    if (!Array.isArray(doc.profiles)) add('$.profiles', 'an array');
    else {
      const taken = new Set((Array.isArray(doc.groups) ? doc.groups : []).map((g: unknown) => (isRecord(g) && typeof g.id === 'string' ? g.id.toLowerCase() : '')));
      doc.profiles.forEach((p: unknown, i: number) => {
        if (!isRecord(p) || typeof p.id !== 'string' || p.id === '' || typeof p.of !== 'string') return add(`$.profiles[${i}]`, '{ id, of }');
        if (taken.has(p.id.toLowerCase()) || known(p.id)) add(`$.profiles[${i}].id`, `${p.id} is already the id of a profile, group, source or step`);
        taken.add(p.id.toLowerCase());
        if (!known(p.of)) add(`$.profiles[${i}].of`, `no source or step ${p.of}`);
      });
    }
  }
  const o = doc.ontology;
  const types = new Set<string>();
  if (o !== undefined) {
    if (!isRecord(o) || !Array.isArray(o.objectTypes) || !Array.isArray(o.linkTypes) || !Array.isArray(o.actionTypes)) add('$.ontology', '{ objectTypes, linkTypes, actionTypes }');
    else {
      o.objectTypes.forEach((t: unknown, i: number) => {
        if (!isRecord(t) || typeof t.id !== 'string' || !Array.isArray(t.key) || typeof t.title !== 'string') return add(`$.ontology.objectTypes[${i}]`, '{ id, name, dataset, key, title }');
        if (types.has(t.id)) add(`$.ontology.objectTypes[${i}].id`, `duplicate object type ${t.id}`);
        types.add(t.id);
        if (!known(t.dataset)) add(`$.ontology.objectTypes[${i}].dataset`, `no source or step ${String(t.dataset)}`);
      });
      o.linkTypes.forEach((l: unknown, i: number) => {
        if (!isRecord(l) || !types.has(String(l.from)) || !types.has(String(l.to))) add(`$.ontology.linkTypes[${i}]`, 'a link between two object types');
      });
      o.actionTypes.forEach((a: unknown, i: number) => {
        if (!isRecord(a) || typeof a.id !== 'string' || !types.has(String(a.on)) || !Array.isArray(a.params)) add(`$.ontology.actionTypes[${i}]`, '{ id, name, on: an object type, params }');
      });
      // What the columns mean, and where that comes from.
      const refs = new Set<string>();
      if (o.references !== undefined) {
        if (!Array.isArray(o.references)) add('$.ontology.references', 'a list of { id, title, url }');
        else
          o.references.forEach((r: unknown, i: number) => {
            if (!isRecord(r) || typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.url !== 'string') return add(`$.ontology.references[${i}]`, '{ id, title, url }');
            if (refs.has(r.id)) add(`$.ontology.references[${i}].id`, `duplicate reference ${r.id}`);
            refs.add(r.id);
          });
      }
      if (o.properties !== undefined) {
        if (!Array.isArray(o.properties)) add('$.ontology.properties', 'a list of { column, title, description }');
        else {
          const described = new Set<string>();
          o.properties.forEach((p: unknown, i: number) => {
            const at = `$.ontology.properties[${i}]`;
            if (!isRecord(p) || typeof p.column !== 'string' || p.column === '' || typeof p.title !== 'string' || typeof p.description !== 'string') return add(at, '{ column, title, description }');
            for (const f of ['unit', 'note'] as const) if (p[f] !== undefined && typeof p[f] !== 'string') add(`${at}.${f}`, 'text');
            if (p.values !== undefined && (!isRecord(p.values) || Object.values(p.values).some((v) => typeof v !== 'string'))) add(`${at}.values`, 'each code with its meaning, as text');
            if (p.lookup !== undefined && (!isRecord(p.lookup) || !known(p.lookup.dataset) || typeof p.lookup.key !== 'string' || typeof p.lookup.label !== 'string')) add(`${at}.lookup`, '{ dataset: a source or step, key, label }');
            if (p.sources !== undefined) {
              if (!Array.isArray(p.sources)) add(`${at}.sources`, 'a list of reference ids');
              else p.sources.forEach((r: unknown, j: number) => !refs.has(String(r)) && add(`${at}.sources[${j}]`, `no reference ${String(r)}`));
            }
            if (p.datasets !== undefined && (!Array.isArray(p.datasets) || p.datasets.length === 0)) add(`${at}.datasets`, 'a list of sources or steps');
            const column = p.column;
            const scopes = Array.isArray(p.datasets) ? p.datasets : ['*'];
            scopes.forEach((d: unknown, j: number) => {
              if (d !== '*' && !known(d)) add(`${at}.datasets[${j}]`, `no source or step ${String(d)}`);
              const k = `${column.toLowerCase()}|${String(d).toLowerCase()}`;
              if (described.has(k)) add(`${at}.column`, `${column} is described twice${d === '*' ? '' : ` on ${String(d)}`}`);
              described.add(k);
            });
          });
        }
      }
    }
  }
  const p = doc.policies;
  if (p !== undefined) {
    if (!isRecord(p) || !Array.isArray(p.principals) || !Array.isArray(p.rules)) return add('$.policies', '{ principals, rules }');
    const who = new Set<string>(['*']);
    p.principals.forEach((x: unknown, i: number) => {
      if (!isRecord(x) || typeof x.id !== 'string' || typeof x.name !== 'string') return add(`$.policies.principals[${i}]`, '{ id, name }');
      if (who.has(x.id)) add(`$.policies.principals[${i}].id`, `duplicate person ${x.id}`);
      who.add(x.id);
    });
    if (p.groups !== undefined) (Array.isArray(p.groups) ? p.groups : []).forEach((g: unknown) => isRecord(g) && typeof g.id === 'string' && who.add(g.id));
    p.rules.forEach((r: unknown, i: number) => {
      const at = `$.policies.rules[${i}]`;
      if (!isRecord(r) || !['row', 'column', 'action'].includes(String(r.kind)) || !Array.isArray(r.for)) return add(at, '{ id, kind: row, column or action, name, for }');
      r.for.forEach((x: unknown, j: number) => !who.has(String(x)) && add(`${at}.for[${j}]`, `no person or group ${String(x)}`));
      if (r.kind === 'row' && (!Array.isArray(r.columns) || r.columns.length === 0 || typeof r.attribute !== 'string')) add(at, 'a row rule needs columns and an attribute');
      if (r.kind === 'column' && !Array.isArray(r.remove)) add(at, 'a column rule needs remove');
      if (r.kind === 'action' && !(isRecord(o) && Array.isArray(o.actionTypes) && o.actionTypes.some((a: unknown) => isRecord(a) && a.id === r.action))) add(`${at}.action`, `no action type ${String(r.action)}`);
    });
  }
}

function validateConfig(s: Record<string, unknown>, at: string, add: (path: string, message: string) => void): void {
  const sqlText = (v: unknown, path: string) => {
    if (typeof v !== 'string' || v.trim() === '') return add(path, 'SQL text');
    try {
      tokens(v);
    } catch (e) {
      add(path, (e as SqlTextError).message);
    }
  };
  const names = new Set<string>();
  const name = (v: unknown, path: string) => {
    if (typeof v !== 'string' || v === '') return add(path, 'a column name');
    if (names.has(v.toLowerCase())) add(path, `duplicate column ${v}`);
    names.add(v.toLowerCase());
  };
  const namedExprs = (list: unknown, path: string, allowBare: boolean) => {
    if (!Array.isArray(list)) return add(path, 'an array');
    list.forEach((c: unknown, j: number) => {
      if (allowBare && typeof c === 'string') return name(c, `${path}[${j}]`);
      if (!isRecord(c)) return add(`${path}[${j}]`, allowBare ? 'a column name or { name, expr }' : '{ name, expr }');
      name(c.name, `${path}[${j}].name`);
      sqlText(c.expr, `${path}[${j}].expr`);
    });
  };
  switch (s.kind) {
    case 'sql':
      sqlText(s.sql, `${at}.sql`);
      break;
    case 'filter':
      sqlText(s.where, `${at}.where`);
      break;
    case 'formula':
      namedExprs(s.columns, `${at}.columns`, false);
      if (Array.isArray(s.columns) && s.columns.length === 0) add(`${at}.columns`, 'at least one column');
      break;
    case 'select':
      namedExprs(s.columns, `${at}.columns`, true);
      if (Array.isArray(s.columns) && s.columns.length === 0) add(`${at}.columns`, 'at least one column');
      break;
    case 'join':
      if (s.how !== 'inner' && s.how !== 'left') add(`${at}.how`, 'inner or left');
      if (!Array.isArray(s.on) || s.on.length === 0) add(`${at}.on`, 'at least one { left, right } pair');
      else
        s.on.forEach((p: unknown, j: number) => {
          if (!isRecord(p) || typeof p.left !== 'string' || typeof p.right !== 'string') add(`${at}.on[${j}]`, '{ left, right } column names');
        });
      if (!Array.isArray(s.columns)) add(`${at}.columns`, 'an array');
      else
        s.columns.forEach((c: unknown, j: number) => {
          if (typeof c === 'string') return name(c, `${at}.columns[${j}]`);
          if (!isRecord(c) || typeof c.column !== 'string') return add(`${at}.columns[${j}]`, 'a column name or { name, column }');
          name(c.name, `${at}.columns[${j}].name`);
        });
      break;
    case 'aggregate':
      namedExprs(s.groupBy, `${at}.groupBy`, true);
      namedExprs(s.measures, `${at}.measures`, false);
      if (Array.isArray(s.groupBy) && Array.isArray(s.measures) && s.groupBy.length + s.measures.length === 0) add(at, 'at least one column');
      break;
    case 'expectations': {
      if (!Array.isArray(s.rules) || s.rules.length === 0) add(`${at}.rules`, 'at least one rule');
      else {
        const rules = new Set<string>();
        s.rules.forEach((r: unknown, j: number) => {
          const rat = `${at}.rules[${j}]`;
          if (!isRecord(r)) return add(rat, '{ name, check, onFail }');
          if (typeof r.name !== 'string' || r.name === '') add(`${rat}.name`, 'a name');
          else if (rules.has(r.name)) add(`${rat}.name`, `duplicate rule ${r.name}`);
          else rules.add(r.name);
          sqlText(r.check, `${rat}.check`);
          if (r.onFail !== 'warn' && r.onFail !== 'drop' && r.onFail !== 'fail') add(`${rat}.onFail`, 'warn, drop or fail');
          if (r.description !== undefined && typeof r.description !== 'string') add(`${rat}.description`, 'text');
        });
      }
      if (s.maxDropped !== undefined && (typeof s.maxDropped !== 'number' || !(s.maxDropped >= 0 && s.maxDropped <= 1))) add(`${at}.maxDropped`, 'a fraction from 0 to 1');
      break;
    }
  }
}

/** The steps' ids in a cycle, if they have one. */
function findCycle(steps: readonly StepDef[]): string[] | null {
  const byId = new Map(steps.map((s) => [s.id.toLowerCase(), s]));
  const state = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    const key = id.toLowerCase();
    const s = byId.get(key);
    if (!s || state.get(key) === 'done') return null;
    if (state.get(key) === 'open') return [...path.slice(path.findIndex((p) => p.toLowerCase() === key)), id];
    state.set(key, 'open');
    path.push(s.id);
    for (const input of s.inputs) {
      const found = visit(input);
      if (found) return found;
    }
    path.pop();
    state.set(key, 'done');
    return null;
  };
  for (const s of steps) {
    const found = visit(s.id);
    if (found) return found;
  }
  return null;
}

function fits(value: unknown, type: ParamType): boolean {
  if (type === 'text') return typeof value === 'string';
  if (type === 'integer') return typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value));
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The document with `to` read in place of `from` by every step that read `from` (but `except`): in its inputs, and
 * where its SQL names it.
 */
export function rewire(doc: FlowDocument, from: string, to: string, except?: string): FlowDocument {
  return {
    ...doc,
    steps: doc.steps.map((st) => {
      if (st.id === except || !st.inputs.some((i) => sameId(i, from))) return st;
      const inputs = st.inputs.map((i) => (sameId(i, from) ? to : i));
      return st.kind === 'sql' ? { ...st, inputs, sql: renameIdentifier(st.sql, from, to) } : { ...st, inputs };
    }),
  };
}

/**
 * The document with a step put between `id` and what reads it, such as a box of checks that drops rows: everything
 * that read `id` reads the new step instead, and the new step joins `id`'s section, just after it.
 */
export function insertAfter(doc: FlowDocument, id: string, step: StepDef): FlowDocument {
  const rewired = rewire(doc, id, step.id);
  const steps = [...rewired.steps];
  steps.splice(steps.findIndex((s) => s.id === id) + 1, 0, step);
  const groups = rewired.groups?.map((g) => {
    const k = g.steps.indexOf(id);
    return k < 0 ? g : { ...g, steps: [...g.steps.slice(0, k + 1), step.id, ...g.steps.slice(k + 1)] };
  });
  return { ...rewired, steps, groups };
}

/**
 * The document without a step: what read it reads its one input instead. Undefined when that can't be done (it reads
 * more than one input, and something reads it), and for a step that changes columns, since what reads it may need them.
 */
export function takeOut(doc: FlowDocument, id: string): FlowDocument | undefined {
  const st = doc.steps.find((s) => s.id === id);
  if (!st) return undefined;
  const read = doc.steps.some((s) => s.inputs.some((i) => sameId(i, id)));
  if (read && (st.inputs.length !== 1 || (st.kind !== 'expectations' && st.kind !== 'filter'))) return undefined;
  const rewired = read ? rewire(doc, id, st.inputs[0]!) : doc;
  return {
    ...rewired,
    steps: rewired.steps.filter((s) => s.id !== id),
    groups: rewired.groups?.map((g) => ({ ...g, steps: g.steps.filter((s) => s !== id) })),
    // A profile of the step goes with it.
    profiles: rewired.profiles?.filter((p) => !sameId(p.of, id)),
    layout: rewired.layout && Object.fromEntries(Object.entries(rewired.layout).filter(([k]) => k !== id && !rewired.profiles?.some((p) => p.id === k && sameId(p.of, id)))),
  };
}

/** The document without display-only fields (its layout, groups and profiles): what the flow hash covers. */
export function withoutDisplay(doc: FlowDocument): Omit<FlowDocument, 'layout' | 'groups' | 'profiles'> {
  const { layout: _layout, groups: _groups, profiles: _profiles, ...rest } = doc;
  return rest;
}
