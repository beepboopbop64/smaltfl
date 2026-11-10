/**
 * Rules people set on a file's columns (ADR 0015 amendment 1, piece b; Q-140 to Q-143): kept in the ontology, each one
 * file's own, enforced when the file comes into a flow. A rule says what a column must hold (a value, one of some
 * values, a number in a range, or one of some values where another column has one of its own) and what a row that
 * breaks it does: it is flagged and kept, left out, or holds the day. It runs once it is set (Q-141); the file's import
 * card switches it off and on again.
 *
 * A rule is enforced by the check step that reads its file directly: `translate` (plan.ts) adds it to that step's rules
 * by its id, written for the engine by `emitRuleCheck` (emit.ts), so the run counts it, the manifest keeps its count,
 * verify counts it again and a broken `hold` rule holds the day, as every rule of a check step does. A file no check
 * step reads directly has its rules said and not enforced (`checkStepOf` is null), and the page says so.
 *
 * Pure: no DOM, no engine.
 */
import type { FlowDocument, StepDef } from './document.js';
import { meaningOf, propertyOf, type Ontology } from './ontology.js';

/** What a rule asks of its column: a value on every row, one of some values, a number from `min` to `max`, or one of
 * some values on the rows where another column has one of its own. */
export const RULE_KINDS = ['required', 'oneOf', 'range', 'when'] as const;
export type OntologyRuleKind = (typeof RULE_KINDS)[number];

/** What a row that breaks the rule does: flagged and kept, left out of what goes on, or holds the day. */
export const RULE_ACTIONS = ['flag', 'drop', 'hold'] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

/** A rule's action as the check step's rules have it. */
export const ON_FAIL: Record<RuleAction, 'warn' | 'drop' | 'fail'> = { flag: 'warn', drop: 'drop', hold: 'fail' };

/** What each action does, in words, for the form and the card. */
export const ACTION_SAID: Record<RuleAction, string> = {
  flag: 'flag the row and keep it',
  drop: 'leave the row out',
  hold: 'hold the day',
};

/** A rule as the ontology keeps it. */
export interface OntologyRule {
  /** Its name, unique among the rules of its file and of the check step that reads the file: what the run's counts and
   * the history call it (`user_required`). */
  id: string;
  /** The source whose rows it is about. */
  file: string;
  /** The column it asks something of, as the file writes it. */
  column: string;
  kind: OntologyRuleKind;
  /** `oneOf` and `when`: the values the column may hold, as the file writes them. */
  values?: string[];
  /** `range`: the lowest and highest the column may hold; either may be left out. */
  min?: number;
  max?: number;
  /** `when`: the rows the rule is about, by another column's values. */
  when?: { column: string; values: string[] };
  action: RuleAction;
  /** Switched off on the file's import card: kept, said, and not enforced. */
  off?: true;
}

/** A rule's settings: any other is refused by name. */
export const RULE_FIELDS = ['id', 'file', 'column', 'kind', 'values', 'min', 'max', 'when', 'action', 'off'] as const;

type RulesDoc = Pick<FlowDocument, 'sources'> & Partial<Pick<FlowDocument, 'steps' | 'ontology'>>;

const lower = (x: string) => x.toLowerCase();
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const values = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== '') && new Set(v).size === v.length;

/** A file's rules in the ontology's order: every one, or with `on` only the ones switched on. */
export function rulesOf(o: Ontology | undefined, file: string, which: 'all' | 'on' = 'all'): OntologyRule[] {
  return (o?.rules ?? []).filter((r) => lower(r.file) === lower(file) && (which === 'all' || !r.off));
}

/** The check step that enforces a file's rules: the first, in the flow's order, whose one input is the file itself. */
export function checkStepOf(doc: RulesDoc, file: string): StepDef | null {
  return (doc.steps ?? []).find((s) => s.kind === 'expectations' && s.inputs.length === 1 && lower(s.inputs[0]!) === lower(file)) ?? null;
}

/** The rules a check step enforces beside its own: the ones switched on of the file it reads, if it is that file's. */
export function enforcedBy(doc: RulesDoc, step: StepDef): OntologyRule[] {
  if (step.kind !== 'expectations' || step.inputs.length !== 1) return [];
  const file = doc.sources.find((s) => lower(s.id) === lower(step.inputs[0]!));
  if (!file || checkStepOf(doc, file.id)?.id !== step.id) return [];
  return rulesOf(doc.ontology, file.id, 'on');
}

/** "A", "A or B", "A, B or C". */
const either = (xs: readonly string[], word = 'or') => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${word} ${xs.at(-1)}`);
const num = (x: number) => (Number.isInteger(x) ? x.toLocaleString('en-US') : String(x));

/** A rule in plain words, with the ontology's titles and words for values: "Result is Signed in, Failed or Locked out". */
export function ruleSaid(o: Ontology | undefined, r: Pick<OntologyRule, 'file' | 'column' | 'kind' | 'values' | 'min' | 'max' | 'when'>): string {
  const title = (c: string) => propertyOf(o, r.file, c)?.title ?? c;
  const word = (c: string, v: string) => meaningOf(propertyOf(o, r.file, c), v) ?? v;
  const these = (c: string, vs: readonly string[] = []) => either(vs.map((v) => word(c, v)));
  switch (r.kind) {
    case 'required':
      return `${title(r.column)} is never blank`;
    case 'oneOf':
      return `${title(r.column)} is ${these(r.column, r.values)}`;
    case 'range': {
      const unit = propertyOf(o, r.file, r.column)?.unit;
      const u = unit ? ` ${unit}` : '';
      return r.min !== undefined && r.max !== undefined ? `${title(r.column)} is from ${num(r.min)} to ${num(r.max)}${u}`
        : r.min !== undefined ? `${title(r.column)} is ${num(r.min)}${u} or more`
        : `${title(r.column)} is ${num(r.max ?? 0)}${u} or less`;
    }
    case 'when':
      return `Where ${title(r.when?.column ?? '')} is ${these(r.when?.column ?? '', r.when?.values)}, ${title(r.column)} is ${these(r.column, r.values)}`;
  }
}

/** A name for a new rule of a file, free among its rules and its check step's: `<column>_<kind>`, then `_2`, `_3`. */
export function newRuleId(doc: RulesDoc, file: string, column: string, kind: OntologyRuleKind): string {
  const step = checkStepOf(doc, file);
  const taken = new Set([...rulesOf(doc.ontology, file).map((r) => lower(r.id)), ...(step?.kind === 'expectations' ? step.rules.map((r) => lower(r.name)) : [])]);
  const base = `${column.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'column'}_${kind === 'oneOf' ? 'one_of' : kind}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/**
 * Problems with the ontology's rules, as `[path, message]`, for validateDocument: each rule's settings, its file a
 * source, its id free among its file's rules and its check step's own, and what its kind needs and nothing else.
 */
export function rulesIssues(doc: { sources?: unknown; steps?: unknown }, rules: unknown): [path: string, message: string][] {
  const out: [string, string][] = [];
  const add = (path: string, message: string) => out.push([path, message]);
  if (!Array.isArray(rules)) return [['$.ontology.rules', 'a list of rules: { id, file, column, kind, action, ... }']];
  const sources = (Array.isArray(doc.sources) ? doc.sources : []).filter((s): s is { id: string } => isRecord(s) && typeof s.id === 'string');
  const steps = (Array.isArray(doc.steps) ? doc.steps : []).filter((s): s is StepDef => isRecord(s) && typeof s.id === 'string' && Array.isArray(s.inputs));
  const ids = new Map<string, Set<string>>();
  rules.forEach((r: unknown, i: number) => {
    const at = `$.ontology.rules[${i}]`;
    if (!isRecord(r)) return add(at, '{ id, file, column, kind, action }');
    for (const k of Object.keys(r)) if (!(RULE_FIELDS as readonly string[]).includes(k)) add(`${at}.${k}`, `${k} isn't a rule's setting (${RULE_FIELDS.join(', ')}): refused rather than ignored`);
    if (typeof r.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(r.id)) add(`${at}.id`, 'a name of letters, digits and underscores, starting with a letter');
    if (typeof r.file !== 'string' || !sources.some((s) => lower(s.id) === lower(r.file as string))) add(`${at}.file`, `no source ${String(r.file)}: a rule is a file’s own`);
    if (typeof r.column !== 'string' || r.column === '') add(`${at}.column`, 'the column it is about, as the file writes it');
    if (!(RULE_KINDS as readonly unknown[]).includes(r.kind)) add(`${at}.kind`, RULE_KINDS.join(', '));
    if (!(RULE_ACTIONS as readonly unknown[]).includes(r.action)) add(`${at}.action`, `${RULE_ACTIONS.join(', ')}: what a row that breaks it does`);
    if (r.off !== undefined && r.off !== true) add(`${at}.off`, 'true, or left out while it is on');
    const needs = (field: 'values' | 'min' | 'max' | 'when', wanted: boolean) => {
      if (!wanted && r[field] !== undefined) add(`${at}.${field}`, `a ${String(r.kind)} rule has no ${field}`);
    };
    if (r.kind === 'oneOf' || r.kind === 'when') {
      if (!values(r.values)) add(`${at}.values`, 'the values the column may hold, each once');
    } else needs('values', false);
    if (r.kind === 'range') {
      const n = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x));
      if (!n(r.min)) add(`${at}.min`, 'a number');
      if (!n(r.max)) add(`${at}.max`, 'a number');
      if (r.min === undefined && r.max === undefined) add(at, 'a range needs a lowest (min), a highest (max) or both');
      if (typeof r.min === 'number' && typeof r.max === 'number' && r.min > r.max) add(`${at}.max`, `${r.max} is below the lowest, ${r.min}`);
    } else (needs('min', false), needs('max', false));
    if (r.kind === 'when') {
      const w = r.when;
      if (!isRecord(w) || typeof w.column !== 'string' || w.column === '' || !values(w.values)) add(`${at}.when`, '{ column, values }: the rows it is about, by another column’s values');
      else if (typeof r.column === 'string' && lower(w.column) === lower(r.column)) add(`${at}.when.column`, 'another column than the one the rule asks something of');
    } else needs('when', false);
    if (typeof r.id === 'string' && typeof r.file === 'string') {
      const file = lower(r.file);
      const seen = ids.get(file) ?? new Set<string>();
      if (seen.has(lower(r.id))) add(`${at}.id`, `${r.file} has two rules named ${r.id} (names are compared without case)`);
      seen.add(lower(r.id));
      ids.set(file, seen);
      const step = steps.find((s) => s.kind === 'expectations' && s.inputs.length === 1 && typeof s.inputs[0] === 'string' && lower(s.inputs[0]) === file);
      if (step?.kind === 'expectations' && Array.isArray(step.rules) && step.rules.some((x) => isRecord(x) && typeof x.name === 'string' && lower(x.name) === lower(r.id as string))) add(`${at}.id`, `${step.id}, the check step that enforces ${r.file}'s rules, has a rule of its own named ${r.id}`);
    }
  });
  return out;
}
