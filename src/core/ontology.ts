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
  /**
   * The codes that mean something went wrong ("fail", "locked"): one of them above its range, at twice its usual rows
   * and past its floor is something wrong, never marked as expected (ADR 0010 §4). It changes verdicts: a document with
   * it is format 3.
   */
  bad?: string[];
  /** A value never seen before in this column is something wrong: a new country, a new tool (ADR 0010 §4, Q-56). It
   * changes verdicts: format 3. */
  newValues?: 'alert';
  /** How a part with one of its codes is named in a head, `{code}` standing for the code: "Vendor {code}". Display. */
  name?: string;
  /** The column names who sent the rows: a part that stopped "sent almost nothing" rather than being "almost gone".
   * Display. */
  role?: 'sender';
  /** This time column runs behind another by about so many minutes (a drop-off after its pickup): what its quantiles are
   * told against. It changes verdicts: format 3. */
  after?: { of: string; minutes: number };
  /**
   * Expected bands (ADR 0014 §3): the share of rows a value is expected to have, written, each for the datasets it
   * names (else wherever the column appears). The `values` check compares the share with the band, and a value with a
   * band is judged by it alone; a band is changed by a recorded decision (Accept the new band). Needs a gate.
   */
  expect?: Band[];
  /**
   * A due mark (ADR 0014 §3): this date column is the day a row's obligation is due, `status` the column that says
   * whether it was met and `miss` the value that says it wasn't. The `due` check counts, over the last `within` days
   * (default 28), what was due and what is still missed, and judges the late share against its own history; the status
   * value's own rise is then told through it, not as a bad value. Needs a gate.
   */
  due?: Due;
}

/** An expected band on a value's share, 0 to 1, for the datasets it names (else everywhere the column appears). */
export interface Band {
  value: string;
  share: [low: number, high: number];
  datasets?: string[];
}

/** A due mark on a date column: the status column, the value that is a miss, and the window the late share is judged over. */
export interface Due {
  status: string;
  miss: string;
  within?: number;
}

/** The window a due mark's late share is judged over when the mark names none: four weeks. */
export const DUE_WITHIN = 28;

/** What a row of a source or step is called, one and many: "trip" and "trips", "sign-in" and "sign-ins". Display. */
export interface Noun {
  one: string;
  many: string;
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

/**
 * A condition over a dataset's columns, as data (ADR 0015 §1): every column named must hold, a list meaning any of
 * its values (`{ internet_facing: 'yes', criticality: ['critical', 'high'] }`). Values are text, as the codes of a
 * property are. `emit.ts` writes it for the engine; the page says it in the ontology's own titles.
 */
export type Condition = Record<string, string | string[]>;

/**
 * What a dataset's rows are (ADR 0015 §1): one row an object of a type (`of`, the object type's id), by the type's
 * key column (`key`, when this dataset names it otherwise), for the objects that meet `where` (a condition over the
 * type's own dataset; left out, every object). A watched dataset with an entry and no rule of its own in its gate
 * cell is judged by the two written rules the entry gives (`writtenRules`, gates.ts): its scope, and its key on one
 * row each. It changes verdicts, and like a band or a due mark it needs a gate.
 */
export interface RowsDef {
  dataset: string;
  of: string;
  key?: string;
  where?: Condition;
}

/** A rows entry's settings: any other is refused by name. */
export const ROWS_FIELDS = ['dataset', 'of', 'key', 'where'] as const;

export interface Ontology {
  objectTypes: ObjectType[];
  linkTypes: LinkType[];
  actionTypes: ActionType[];
  /** What the columns mean. */
  properties?: PropertyType[];
  /** Where those meanings come from. */
  references?: Reference[];
  /** What a row of each source or step is called, by its id (ADR 0010 §8). Display: kept out of the plan and every
   * verdict. */
  nouns?: Record<string, Noun>;
  /** What each dataset's rows are (ADR 0015 §1): one row an object of a type, for the objects a condition selects. */
  rows?: RowsDef[];
}

/** A condition in one order however it was written, the order the emitter writes it in: `[column, values]`, by column,
 * each column's values sorted and each once (a dependency rule's `when` is kept the same way in the plan). */
export function conditionOf(where: Condition | undefined): [column: string, values: string[]][] {
  return Object.entries(where ?? {})
    .map(([c, v]): [string, string[]] => [c, [...new Set(Array.isArray(v) ? v : [v])].sort()])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** A dataset's rows entry with its object type resolved (`rowsOf`). */
export interface RowsOf {
  entry: RowsDef;
  type: ObjectType;
  /** The type's key column, and this dataset's own name for it: null where the type's key isn't one column (a key of
   * several columns gives no rule yet, ADR 0015 §1). */
  key: string | null;
  own: string | null;
  /** The condition, in order (`conditionOf`): empty for every object. */
  where: [column: string, values: string[]][];
}

/**
 * What a dataset's rows are, as the ontology says it (ADR 0015 §1): its entry, the object type it names, the key on
 * both sides and the condition. Undefined for a dataset with no entry, or one whose entry names no type the ontology
 * has (validateDocument refuses that).
 */
export function rowsOf(ontology: Ontology | undefined, dataset: string): RowsOf | undefined {
  const d = dataset.toLowerCase();
  const entry = (ontology?.rows ?? []).find((r) => r.dataset.toLowerCase() === d);
  const type = entry ? ontology!.objectTypes.find((t) => t.id === entry.of) : undefined;
  if (!entry || !type) return undefined;
  const key = type.key.length === 1 ? type.key[0]! : null;
  return { entry, type, key, own: key === null ? null : (entry.key ?? key), where: conditionOf(entry.where) };
}

/** The marks on a property that change how a day is judged (ADR 0010 §4): a document with any of them is format 3. */
export const VERDICT_MARKS = ['bad', 'newValues', 'after', 'expect', 'due'] as const;

/** Whether an ontology carries a mark that changes verdicts. */
export const marksVerdicts = (ontology: Ontology | undefined): boolean => (ontology?.properties ?? []).some((p) => VERDICT_MARKS.some((m) => p[m] !== undefined));

/**
 * The marks the ontology puts on a source's columns that change verdicts (ADR 0010 §4, §11), each column's property for
 * it (`propertyOf`), as plan/2 carries them: a list of `[column, …]` sorted by column, `bad` as `[column, code, …]` (codes
 * sorted), `newValues` as `[column, "alert"]` for each serious column (one listing bad codes or saying so, Q-56), `after`
 * as `[column, of, minutes]`.
 */
export function marksOn(ontology: Ontology | undefined, source: string): { bad: [string, ...string[]][]; newValues: [string, 'alert'][]; after: [string, string, number][]; expect: [string, string, number, number][]; due: [string, string, string, number][] } {
  const columns = [...new Set((ontology?.properties ?? []).map((x) => x.column.toLowerCase()))];
  const props = columns.flatMap((c) => {
    const p = propertyOf(ontology, source, c);
    return p ? [p] : [];
  });
  const byColumn = <T extends unknown[]>(xs: T[]) => xs.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  return {
    bad: byColumn(props.filter((x) => x.bad?.length).map((x): [string, ...string[]] => [x.column, ...[...x.bad!].sort()])),
    newValues: byColumn(props.filter((x) => x.bad?.length || x.newValues === 'alert').map((x): [string, 'alert'] => [x.column, 'alert'])),
    after: byColumn(props.filter((x) => x.after).map((x): [string, string, number] => [x.column, x.after!.of, x.after!.minutes])),
    // A band for this dataset (ADR 0014 §3): for each value, the band naming the dataset, else the one naming none; by
    // column, then value.
    expect: props.flatMap((x) => {
      const bands = (x.expect ?? []).filter((b) => (b.datasets ? b.datasets.some((d) => d.toLowerCase() === source.toLowerCase()) : true));
      const values = [...new Set(bands.map((b) => b.value))];
      return values.map((v): [string, string, number, number] => {
        const b = bands.find((y) => y.value === v && y.datasets) ?? bands.find((y) => y.value === v)!;
        return [x.column, v, b.share[0], b.share[1]];
      });
    }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)),
    due: byColumn(props.filter((x) => x.due).map((x): [string, string, string, number] => [x.column, x.due!.status, x.due!.miss, x.due!.within ?? DUE_WITHIN])),
  };
}

/** The plain word for rows: what a row is called when nothing names it. */
export const ROWS: Noun = Object.freeze({ one: 'row', many: 'rows' });

/**
 * What a row of a source or step is called (ADR 0010 §8): the noun the ontology names for it; else the object type over
 * it, or over a step that reads it (`readers`, for a source a lookup is made from: "zones"); else "rows".
 */
export function nounOf(ontology: Ontology | undefined, id: string, readers: readonly string[] = []): Noun {
  const named = Object.entries(ontology?.nouns ?? {}).find(([k]) => k.toLowerCase() === id.toLowerCase())?.[1];
  if (named) return named;
  const types = ontology?.objectTypes ?? [];
  const t = types.find((x) => x.dataset === id) ?? types.find((x) => readers.includes(x.dataset));
  return t ? { one: t.name.toLowerCase(), many: `${t.name.toLowerCase()}s` } : ROWS;
}

/** A count said with its noun: "1 trip", "41,939 trips". */
export const counted = (n: number, noun: Noun): string => `${Math.round(n).toLocaleString('en-US')} ${Math.round(n) === 1 ? noun.one : noun.many}`;

/** A part named by its property's template ("Vendor {code}" → "Vendor 1"), when it has one. */
export const partNamed = (property: PropertyType | undefined, code: unknown): string | undefined => (property?.name ? property.name.split('{code}').join(String(code)) : undefined);

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

/**
 * A coded value glossed once where a head first names it (ADR 0008 §5), from what its property type says, in twenty
 * words at most: its code and what it is, the clause its note gives it ("Flex Fare: payment type 0, booked in an app at
 * a price set up front, not by the meter"), else its meaning and what the column's description says each value is
 * ("Vendor 1: Creative Mobile Technologies, LLC, the technology company whose system in the cab recorded the trip").
 * Null when the value has no meaning listed.
 */
export function glossOf(property: PropertyType | undefined, value: unknown, name: string): string | null {
  const meaning = meaningOf(property, value);
  if (!property || !meaning) return null;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A note that says what a value is: "A Flex Fare trip is booked in an app at a price set up front, not by the meter: …".
  const said = property.note ? new RegExp(`^(?:An?|The) ${esc(meaning)} (?:is|are) ([^:.]+)`, 'i').exec(property.note)?.[1] : undefined;
  // Else what the column's description says each of its values is, its aside between commas left out: "the technology
  // company whose system in the cab recorded the trip".
  const each = !said && property.description ? /:\s+(.+?)\.?$/.exec(property.description)?.[1]?.replace(/,[^,]+,\s*/, ' ') : undefined;
  const column = property.title;
  const code = name.toLowerCase().startsWith(column.toLowerCase()) ? meaning : `${column.charAt(0).toLowerCase()}${column.slice(1)} ${String(value)}`;
  const text = `${name}: ${code}${said ? `, ${said.trim()}` : each ? `, ${each.trim()}` : ''}.`;
  const words = text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));
  return words.length <= 20 ? text : `${name}: ${code}.`;
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
