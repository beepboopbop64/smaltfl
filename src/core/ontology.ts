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

/**
 * What a column means: one property type per column name, shared by every dataset of the flow with a column of that
 * name, or only by the ones `datasets` lists, where the name means something else elsewhere. Meanings are for people:
 * they stay out of the flow plan, so out of every key.
 */
export interface PropertyType {
  /** The column, as the datasets name it (in any case). */
  column: string;
  /** What people call it: "Rate code" for RatecodeID. */
  title: string;
  /** What it holds, in the words of its source where it has one. */
  description: string;
  /** Its unit: "miles", "USD", "°C". */
  unit?: string;
  /** For a column of codes: what each code means, by the code as text. */
  values?: Record<string, string>;
  /**
   * For a column of another dataset's keys: that dataset, its key column, and the column that names each key, so a
   * value reads as its name (a zone's name for PULocationID).
   */
  lookup?: { dataset: string; key: string; label: string };
  /** What the data itself shows that the description doesn't say: gaps, reversals, a vendor's habits. */
  note?: string;
  /** The references it comes from, by id. A column a step of the flow makes has none: the step says how it's made. */
  sources?: string[];
  /** Only on these sources or steps, when the same name means something else elsewhere. */
  datasets?: string[];
}

/** A document the ontology's meanings come from. */
export interface Reference {
  id: string;
  title: string;
  url: string;
  /** Who publishes it. */
  publisher?: string;
  /** Which version was read: its date or edition. */
  version?: string;
}

export interface Ontology {
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
  /** What the columns mean. */
  properties?: PropertyType[];
  /** Where those meanings come from. */
  references?: Reference[];
}

/** A dataset's column's property type: the one named for that dataset, else the one its name has everywhere. */
export function propertyOf(ontology: Ontology | undefined, dataset: string, column: string): PropertyType | undefined {
  const c = column.toLowerCase();
  const d = dataset.toLowerCase();
  const named = (ontology?.properties ?? []).filter((p) => p.column.toLowerCase() === c);
  return named.find((p) => p.datasets?.some((x) => x.toLowerCase() === d)) ?? named.find((p) => p.datasets === undefined);
}

/** A coded value's meaning ("Credit card" for payment_type 1), if its property type lists it. */
export function meaningOf(property: PropertyType | undefined, value: unknown): string | undefined {
  if (!property?.values || value === null || value === undefined) return undefined;
  return Object.prototype.hasOwnProperty.call(property.values, String(value)) ? property.values[String(value)] : undefined;
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
