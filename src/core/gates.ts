/**
 * Gates (ADR 0014): the checks a watched node is judged by, each on or off, each holding the day or warning. A gate is
 * written in the notebook as a `gate()` cell beside the node (`notebook.ts` derives `doc.gates`), the plan carries it
 * in the watch's settings (plan/4, `checks`), and `newsOf` reads it: a finding belongs to one check by its kind
 * (`checkOf`), and the check's mode says what becomes of it (`gated`). Deterministic checks hold by default and learned
 * ones warn (Q-114), by layer: bronze for a source as it arrives, silver for a step after the joins, gold for what
 * people read. A flow with no gate is judged as it always was: the defaults reach only a flow that declares one.
 */
import type { FlowDocument } from './document.js';
import type { Finding, Severity } from './news.js';
import { rowsOf } from './ontology.js';

/** The three layers (ADR 0014 §1): a source as it arrives, a joined step, an output people read. */
export const LAYERS = ['bronze', 'silver', 'gold'] as const;
export type Layer = (typeof LAYERS)[number];

/**
 * The vocabulary of checks (ADR 0014 §2), written ones first, then the learned. A check this build doesn't judge yet
 * (`due`, `scope`, `needs`, `reconcile`, `classifier`: slices 2 to 5) is in the vocabulary, so a gate may set it and
 * the Checks tab says it isn't judged yet, rather than refuse a notebook written for the next build.
 */
export const CHECK_NAMES = ['schema', 'amount', 'blanks', 'values', 'rules', 'scope', 'needs', 'due', 'reconcile', 'shares', 'shape', 'hours', 'pairs', 'forest', 'classifier'] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/** What a check does with what it finds: holds the day (its own severity), warns at most, or says nothing. */
export const CHECK_MODES = ['hold', 'warn', 'off'] as const;
export type CheckMode = (typeof CHECK_MODES)[number];

/** The checks that are written rules or contracts; the rest are learned from the history. */
export const WRITTEN: ReadonlySet<CheckName> = new Set<CheckName>(['schema', 'amount', 'blanks', 'values', 'rules', 'scope', 'needs', 'due', 'reconcile']);

/** The checks this build judges: the others are named, switchable and not yet told (ADR 0014's slices 2 to 5). */
export const JUDGED: ReadonlySet<CheckName> = new Set<CheckName>(['schema', 'amount', 'blanks', 'values', 'rules', 'scope', 'needs', 'due', 'reconcile', 'shares', 'shape', 'hours', 'pairs', 'forest', 'classifier']);

/** What each check says, in a few words, for the Checks tab. */
export const CHECK_SAID: Record<CheckName, string> = {
  schema: 'the columns and types are the contract’s',
  amount: 'rows against a day like it, or the written band',
  blanks: 'a column blank beyond its range',
  values: 'a value never seen; a bad value up; a written band missed',
  rules: 'the step’s check() rules, their drop share against its limit',
  scope: 'rows for keys out of scope; keys in scope with no row',
  needs: 'a value another dataset’s rule forbids',
  due: 'what was due and what ran late, against the usual late share',
  reconcile: 'rows by key equal the step it reads; keys unique; no blank key',
  shares: 'a value’s share against its learned range',
  shape: 'a measure’s quantiles against a day like it',
  hours: 'a time column’s hours against a day like it',
  pairs: 'two values together beyond what their shares explain',
  forest: 'the day unlike the days before',
  classifier: 'today’s rows told apart from like days’ rows',
};

/**
 * Each layer's defaults (ADR 0014 §2, the table): deterministic checks hold, learned ones warn, gold only reconciles.
 * Bronze holds on its key too (ADR 0015 §1, amending the table): a file tied to an object type is held to one row an
 * object; a node with no key written counts nothing, so the default says nothing there.
 */
export const LAYER_DEFAULTS: Record<Layer, Record<CheckName, CheckMode>> = {
  bronze: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', scope: 'hold', needs: 'off', due: 'hold', reconcile: 'hold', shares: 'warn', shape: 'warn', hours: 'warn', pairs: 'warn', forest: 'warn', classifier: 'warn' },
  silver: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', scope: 'hold', needs: 'hold', due: 'hold', reconcile: 'off', shares: 'warn', shape: 'warn', hours: 'warn', pairs: 'warn', forest: 'warn', classifier: 'warn' },
  gold: { schema: 'hold', amount: 'off', blanks: 'off', values: 'off', rules: 'hold', scope: 'off', needs: 'off', due: 'off', reconcile: 'hold', shares: 'off', shape: 'off', hours: 'off', pairs: 'off', forest: 'off', classifier: 'off' },
};

/** A gate as the document keeps it (ADR 0014 §1): its layer, the checks it sets apart from the layer's defaults, and
 * its written rules (§4): the scope its rows must fall in, and what another value forbids. */
export interface GateDef {
  layer: Layer;
  checks: Partial<Record<CheckName, CheckMode>>;
  scope?: ScopeRule;
  needs?: NeedsRule[];
  reconcile?: ReconcileRule;
}

/**
 * The reconciliation rule (ADR 0014 §6): the node's key (one column or several), which must be on one row each and
 * never blank; and, with `of` (a source, or for an output that isn't watched a step), the node whose keys these must
 * equal: a key here not there, or there not here, is counted.
 */
export interface ReconcileRule {
  key: string[];
  of?: string;
}

/**
 * The scope rule (ADR 0014 §4): the inventory (a source, by id), its key column, the key column of the gated node
 * (`key` when they share a name) and the condition a key must meet to be in scope. The check counts the rows for keys
 * out of scope and the keys in scope with no row.
 */
export interface ScopeRule {
  of: string;
  key: string;
  where: string;
  /** The gated node's own key column, when it isn't `key`. */
  own?: string;
}

/**
 * A dependency rule (ADR 0014 §4): a row that matches `when` must match `then`; one that doesn't is a contradiction,
 * counted. Within the row, or, with `from` (a source, by id) and `key`, against the other dataset's row with the same
 * key, `when` read there. A value may be one of several.
 */
export interface NeedsRule {
  from?: string;
  key?: string;
  when: Record<string, string | string[]>;
  then: Record<string, string | string[]>;
}

/** Where a written rule comes from: the node's gate cell, or the ontology's `rows` entry for it (ADR 0015 §1). */
export type RuleFrom = 'gate' | 'ontology';

/**
 * A node's scope rule, from wherever it is written: the gate cell's (its condition as its author wrote it for the
 * engine, `where`), or the one the ontology's `rows` entry gives (its object type and the condition as data, `match`,
 * which `emit.ts` writes for the engine). `own` is the node's own key column either way.
 */
export type WrittenScope =
  | { from: 'gate'; of: string; key: string; own: string; where: string }
  | { from: 'ontology'; of: string; key: string; own: string; match: [column: string, values: string[]][]; type: string };

/** A node's written rules (`writtenRules`): its scope, its dependencies, and its key, each with where it is written. */
export interface WrittenRules {
  scope: WrittenScope | null;
  needs: NeedsRule[];
  reconcile: (ReconcileRule & { from: RuleFrom }) | null;
}

/**
 * The written rules a node is judged by (ADR 0014 §4, §6; ADR 0015 §1), read by the plan (what the engine counts) and
 * by the judge (what the counts are called), so the two agree. The gate cell's own rule comes first, each kind on its
 * own; where the cell writes none, the ontology's `rows` entry for the node gives two: the scope (the type's dataset
 * as the inventory, its key, the entry's condition; no condition is every object) and the key (a reconciliation by
 * the node's key column alone, against no other node: one row each, never blank). A type whose key is several
 * columns gives neither yet. Dependencies are only ever the gate cell's.
 */
export function writtenRules(doc: Partial<Pick<FlowDocument, 'gates' | 'ontology'>>, node: string): WrittenRules {
  const lower = node.toLowerCase();
  const g = Object.entries(doc.gates ?? {}).find(([id]) => id.toLowerCase() === lower)?.[1];
  const rows = rowsOf(doc.ontology, node);
  const tied = rows && rows.key !== null && rows.own !== null ? { key: rows.key, own: rows.own } : null;
  return {
    scope: g?.scope ? { from: 'gate', of: g.scope.of, key: g.scope.key, own: g.scope.own ?? g.scope.key, where: g.scope.where }
      : tied ? { from: 'ontology', of: rows!.type.dataset, key: tied.key, own: tied.own, match: rows!.where, type: rows!.type.id }
      : null,
    needs: g?.needs ?? [],
    reconcile: g?.reconcile ? { ...g.reconcile, from: 'gate' } : tied ? { key: [tied.own], from: 'ontology' } : null,
  };
}

/** A gate with every check's mode filled in from its layer: what the plan carries and the judges read. */
export type GateChecks = Record<CheckName, CheckMode>;

/** A gate's checks, every one filled in from its layer's defaults, in the vocabulary's order. */
export function resolveGate(g: GateDef): GateChecks {
  const out = {} as GateChecks;
  for (const c of CHECK_NAMES) out[c] = g.checks[c] ?? LAYER_DEFAULTS[g.layer][c];
  return out;
}

/** The layer a node has without a gate of its own (ADR 0014 §1): a source is bronze, a watched step silver, a published
 * step nothing watches gold. */
export function layerOf(node: { source: boolean; watched: boolean; published: boolean }): Layer {
  if (node.source) return 'bronze';
  return node.watched ? 'silver' : 'gold';
}

/**
 * The checks a document judges a node by (ADR 0014 §1): its gate's, filled in; without a gate of its own, its layer's
 * defaults, in a flow that declares any gate. Null in a flow with none: the node is judged as it always was.
 */
export function gateChecksOf(doc: Pick<FlowDocument, 'publish'> & Partial<Pick<FlowDocument, 'gates' | 'sources' | 'steps'>>, node: string): GateChecks | null {
  const gates = doc.gates ?? {};
  if (Object.keys(gates).length === 0) return null;
  const lower = node.toLowerCase();
  const own = Object.entries(gates).find(([id]) => id.toLowerCase() === lower)?.[1];
  if (own) return resolveGate(own);
  const source = (doc.sources ?? []).some((s) => s.id.toLowerCase() === lower);
  const watched = Object.keys(doc.publish?.watch ?? {}).some((id) => id.toLowerCase() === lower);
  const published = (doc.steps ?? []).some((s) => s.id.toLowerCase() === lower && s.dataset !== undefined);
  // An intermediate step, neither watched nor published, is judged by no gate: nothing judges it.
  if (!source && !watched && !published) return null;
  return resolveGate({ layer: layerOf({ source, watched, published }), checks: {} });
}

/** The layer a document judges a node at: its gate's, else the node's own; null in a flow with no gate. */
export function gateLayerOf(doc: Pick<FlowDocument, 'publish'> & Partial<Pick<FlowDocument, 'gates' | 'sources' | 'steps'>>, node: string): Layer | null {
  const gates = doc.gates ?? {};
  if (Object.keys(gates).length === 0) return null;
  const lower = node.toLowerCase();
  const own = Object.entries(gates).find(([id]) => id.toLowerCase() === lower)?.[1];
  if (own) return own.layer;
  const source = (doc.sources ?? []).some((s) => s.id.toLowerCase() === lower);
  const watched = Object.keys(doc.publish?.watch ?? {}).some((id) => id.toLowerCase() === lower);
  const published = (doc.steps ?? []).some((s) => s.id.toLowerCase() === lower && s.dataset !== undefined);
  return source || watched || published ? layerOf({ source, watched, published }) : null;
}

/** What each layer is, in a few words. */
export const LAYER_SAID: Record<Layer, string> = {
  bronze: 'the file as it arrives, before anything reads it',
  silver: 'the dataset after the joins, still being checked',
  gold: 'what people read, reconciled and sealed',
};

/** Whether a document declares any gate: then every watched node is judged by one (its own or its layer's). */
export const hasGates = (doc: Pick<FlowDocument, 'gates'>): boolean => Object.keys(doc.gates ?? {}).length > 0;

/**
 * The check a finding belongs to, by its kind (ADR 0014 §2): the amount by `volume`, the hours, a value's share, gone
 * or new value, a blank column, the shape, the step's rules, the columns, a pair or a combination, the forest. Null
 * for what isn't a check's finding (the calm day, a day not judged, the weather, a table's own facts).
 */
export function checkOf(kind: Finding['kind']): CheckName | null {
  switch (kind) {
    case 'volume': return 'amount';
    case 'hours': return 'hours';
    case 'share': return 'shares';
    case 'gone': return 'shares';
    case 'new': return 'values';
    case 'band': return 'values';
    case 'due': return 'due';
    case 'scope': return 'scope';
    case 'needs': return 'needs';
    case 'apart': return 'classifier';
    case 'reconcile': return 'reconcile';
    case 'missing': return 'blanks';
    case 'shape': return 'shape';
    case 'dropped': return 'rules';
    case 'rule': return 'rules';
    case 'schema': return 'schema';
    case 'integrity': return 'schema';
    case 'pair': return 'pairs';
    case 'combo': return 'pairs';
    case 'unlike': return 'forest';
    default: return null;
  }
}

/**
 * The gate's rule on a finding (Q-114): under `hold` the finding keeps its own severity, and holds the day when that
 * is something wrong; under `warn` it is unusual at most, unless the ontology marks its value bad (a bad value is
 * always something wrong); under `off` it isn't told (null). A finding of no check passes through.
 */
export function gated(f: Finding, checks: GateChecks | null): Finding | null {
  if (!checks) return f;
  const check = checkOf(f.kind);
  if (!check) return f;
  const mode = checks[check];
  if (mode === 'off') return null;
  const severity: Severity = mode === 'warn' && f.severity === 'alert' && !f.bad ? 'warn' : f.severity;
  return severity === f.severity ? { ...f, check } : { ...f, check, severity };
}

/** Whether a value is a gate as the document writes it. */
export function gateProblems(g: unknown): string[] {
  const out: string[] = [];
  if (typeof g !== 'object' || g === null || Array.isArray(g)) return [`a gate is { layer: ${LAYERS.join(' | ')}, checks: { name: ${CHECK_MODES.join(' | ')} } }`];
  const r = g as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!['layer', 'checks', 'scope', 'needs', 'reconcile'].includes(k)) out.push(`${k} isn't a gate's setting (layer, checks, scope, needs, reconcile): refused rather than ignored`);
  if (r.reconcile !== undefined) {
    const rc = r.reconcile as Record<string, unknown> | null;
    const key = rc && typeof rc === 'object' && !Array.isArray(rc) ? rc.key : undefined;
    const keys = typeof key === 'string' ? [key] : Array.isArray(key) ? key : null;
    if (!rc || typeof rc !== 'object' || Array.isArray(rc) || !keys || keys.length === 0 || keys.some((k) => typeof k !== 'string' || k === '') || (rc.of !== undefined && typeof rc.of !== 'string') || Object.keys(rc).some((k) => !['key', 'of'].includes(k)))
      out.push('reconcile is { key: a column or a list of columns, of?: the node whose keys these must equal }');
  }
  const values = (v: unknown) => typeof v === 'string' || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string'));
  const match = (m: unknown) => typeof m === 'object' && m !== null && !Array.isArray(m) && Object.keys(m).length > 0 && Object.values(m).every(values);
  if (r.scope !== undefined) {
    const sc = r.scope as Record<string, unknown> | null;
    if (typeof sc !== 'object' || sc === null || Array.isArray(sc) || typeof sc.of !== 'string' || typeof sc.key !== 'string' || sc.key === '' || typeof sc.where !== 'string' || sc.where.trim() === '' || (sc.own !== undefined && (typeof sc.own !== 'string' || sc.own === '')) || Object.keys(sc).some((k) => !['of', 'key', 'where', 'own'].includes(k)))
      out.push('scope is { of: a source, key, where, own? }: the inventory, its key column, the condition a key in scope meets, and the node’s own key column when it differs');
  }
  if (r.needs !== undefined) {
    const list = Array.isArray(r.needs) ? r.needs : [r.needs];
    list.forEach((n, i) => {
      const x = n as Record<string, unknown> | null;
      if (typeof x !== 'object' || x === null || Array.isArray(x) || !match(x.when) || !match(x.then) || (x.from !== undefined && typeof x.from !== 'string') || (x.key !== undefined && (typeof x.key !== 'string' || x.key === '')) || (x.from !== undefined && x.key === undefined) || Object.keys(x).some((k) => !['from', 'key', 'when', 'then'].includes(k)))
        out.push(`needs${list.length > 1 ? `[${i}]` : ''} is { when: { column: value }, then: { column: value }, from?: a source, key? }: a row matching when must match then (a value may be a list), within the row or, with from and key, against the other dataset’s row with the same key`);
    });
  }
  if (!(LAYERS as readonly unknown[]).includes(r.layer)) out.push(`layer is one of ${LAYERS.join(', ')}`);
  if (r.checks !== undefined) {
    if (typeof r.checks !== 'object' || r.checks === null || Array.isArray(r.checks)) out.push(`checks is { name: ${CHECK_MODES.join(' | ')} }`);
    else
      for (const [name, mode] of Object.entries(r.checks as Record<string, unknown>)) {
        if (!(CHECK_NAMES as readonly string[]).includes(name)) out.push(`${name} isn't a check (${CHECK_NAMES.join(', ')})`);
        else if (!(CHECK_MODES as readonly unknown[]).includes(mode)) out.push(`checks.${name} is one of ${CHECK_MODES.join(', ')}`);
      }
  }
  return out;
}
