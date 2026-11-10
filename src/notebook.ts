/**
 * What a flow's notebook imports (ADR 0011): the markers that make a smaltnb cell a source binding, a check or a fill
 * step of the flow. smaltfl reads them from the notebook's code without running it (src/core/notebook.ts); in a
 * notebook run outside a flow they are plain functions that hand their input through, so the notebook typechecks and
 * the cells after them keep their types.
 */
import type { ExpectationRule } from './core/document.js';
import type { CheckMode, CheckName, Layer } from './core/gates.js';

export type { ExpectationRule } from './core/document.js';
export type { CheckMode, CheckName, Layer } from './core/gates.js';

/** A source of the flow, by its id in the flow document: `const auth = source('auth')`. */
export class Source {
  constructor(readonly id: string) {}
}

/** Binds a name to one of the flow's sources. A `sql` cell reads it as `${auth}`. */
export function source(id: string): Source {
  return new Source(id);
}

/** A check's settings: the rules, and how much may be dropped (0 to 1) before the run fails or holds. */
export interface CheckOptions {
  rules: ExpectationRule[];
  maxDropped?: number;
}

/**
 * The `expectations` step over `input`: each rule a SQL expression true for a row that passes, with `warn` (counted),
 * `drop` (left out) or `fail` (fails or holds the run). The result is the input's rows, the dropped ones left out.
 */
export function check<T>(input: T, options: CheckOptions): T {
  void options;
  return input;
}

/** What a published dataset says about itself: its description, and how the engine stores it (default `row`). */
export interface PublishOptions {
  description?: string;
  storage?: 'row' | 'columnar';
}

/**
 * Publishes a step as a dataset, under the cell's name (ADR 0011 §1): its versions are hashed, held or pointed by
 * the flow's runtime. Written as its own statement, usually in a cell of its own at the end of a notebook:
 * `publish(zone_hour); publish(borough_hour, { description: 'Trips per borough and hour' })`. An exported cell
 * another notebook imports is not published by that alone.
 */
export function publish<T>(step: T, options: PublishOptions = {}): T {
  void options;
  return step;
}

/** A fill step's settings (ADR 0009 amendment 1): the time column its hours are of, and the columns a donor's rows
 * are moved by whole days. */
export interface FillOptions {
  time: string;
  shift: string[];
}

/** The `fill` step over a watched source: its rows with `filled_from` (null until a day is filled). */
export function fill<T>(input: T, options: FillOptions): T {
  void options;
  return input;
}

/**
 * A gate's settings (ADR 0014 §1): its layer (bronze for a source as it arrives, silver for a step after the joins, gold
 * for an output people read; by default the node's own), and the checks it sets apart from the layer's defaults, each
 * `hold` (something wrong holds the day), `warn` (unusual at most) or `off`.
 */
export interface GateOptions {
  layer?: Layer;
  checks?: Partial<Record<CheckName, CheckMode>>;
}

/**
 * The gate on a source or a step (ADR 0014 §1): what it is judged by, and what holds. Written in a cell of its own
 * beside the node: `export const tls_gate = gate(tls, { layer: 'bronze', checks: { shares: 'hold' } })`. The node
 * passes through, so a cell after it may read either name.
 */
export function gate<T>(node: T, options: GateOptions = {}): T {
  void options;
  return node;
}
