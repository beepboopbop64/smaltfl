/**
 * The ontology (ARCHITECTURE.md §8): object types backed by the flow's datasets, named links between them, and action
 * types that edit them. An object is its backing row with its edits applied. Edits are recorded by the runtime in a
 * hash chain, refusals included, after the action rule (policy.ts) allows them.
 */
import type { ParamType } from './sqltext.js';

export interface ObjectType {
  id: string;
  name: string;
  /** The source or step whose rows are the objects. */
  dataset: string;
  /** The columns that identify an object. */
  key: string[];
  /** The column people call an object by. */
  title: string;
  description?: string;
}

export interface LinkType {
  id: string;
  name: string;
  from: string;
  to: string;
  /** Pairs of [column of `from`, column of `to`]. */
  on: [string, string][];
  cardinality?: 'many-to-one' | 'one-to-many';
}

export interface ActionType {
  id: string;
  name: string;
  /** The object type it edits. */
  on: string;
  description?: string;
  params: { name: string; label: string; type: ParamType }[];
}

export interface Ontology {
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
}

/** One recorded edit, or a refusal. `hash` chains it to the edit before it. */
export interface Edit {
  seq: number;
  action: string;
  objectType: string;
  /** The object's key, as canonical JSON of its key columns. */
  object: string;
  params: Record<string, string | number | null>;
  actor: string;
  at: string;
  outcome: 'applied' | 'refused';
  reason: string;
  prev: string | null;
  hash: string;
}

/** What `act` is asked to do. The runtime reads the object's row itself, so the check sees the stored data. */
export interface ActRequest {
  action: string;
  actor: string;
  /** The object's key values, by key column. */
  key: Record<string, string | number | null>;
  params: Record<string, string | number | null>;
}
