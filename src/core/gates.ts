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
export const JUDGED: ReadonlySet<CheckName> = new Set<CheckName>(['schema', 'amount', 'blanks', 'values', 'rules', 'shares', 'shape', 'hours', 'pairs', 'forest']);

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

/** Each layer's defaults (ADR 0014 §2, the table): deterministic checks hold, learned ones warn, gold only reconciles. */
export const LAYER_DEFAULTS: Record<Layer, Record<CheckName, CheckMode>> = {
  bronze: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', scope: 'hold', needs: 'off', due: 'hold', reconcile: 'off', shares: 'warn', shape: 'warn', hours: 'warn', pairs: 'warn', forest: 'warn', classifier: 'warn' },
  silver: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', scope: 'hold', needs: 'hold', due: 'hold', reconcile: 'off', shares: 'warn', shape: 'warn', hours: 'warn', pairs: 'warn', forest: 'warn', classifier: 'warn' },
  gold: { schema: 'hold', amount: 'off', blanks: 'off', values: 'off', rules: 'hold', scope: 'off', needs: 'off', due: 'off', reconcile: 'hold', shares: 'off', shape: 'off', hours: 'off', pairs: 'off', forest: 'off', classifier: 'off' },
};

/** A gate as the document keeps it (ADR 0014 §1): its layer, and the checks it sets apart from the layer's defaults. */
export interface GateDef {
  layer: Layer;
  checks: Partial<Record<CheckName, CheckMode>>;
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
  for (const k of Object.keys(r)) if (k !== 'layer' && k !== 'checks') out.push(`${k} isn't a gate's setting (layer, checks): refused rather than ignored`);
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
