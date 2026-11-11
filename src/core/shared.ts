/**
 * A starting file's ontology, shared by every flow that reads the file (Q-148, the maintainer: "changes live in one
 * place and can update multiple different flows"). It says what the file's columns mean and the rules its rows are held
 * to, once, in its own document (`smaltfl-ontology/1`, `examples/ontologies/<file>.json`); a flow lists it under
 * `ontology.import`, and reading the flow (`readFlow`, scripts/flow.ts) brings it in: its columns' meanings and its
 * rules join the flow's ontology, the check cell that enforces the file lists its rules (`syncRuleCells`), and the flow
 * keeps where each came from (`ontology.shared`). Change the shared file, and every flow that imports it has the change
 * the next time it is read; the cells follow on their own (a rule a cell doesn't list is on), and `npm run rules:sync`
 * writes them on disk.
 *
 * The flow document a run hashes is the one read, with the shared file's content in it: a change to the shared file is
 * a change to every flow that imports it, recorded as such. Pure: the caller reads the files.
 */
import type { FlowDocument } from './document.js';
import type { Noun, Ontology, PropertyType } from './ontology.js';
import type { OntologyRule } from './rules.js';

/** A rule as a shared file keeps it: its file is the shared file's. */
export type SharedRule = Omit<OntologyRule, 'file'>;

/** A starting file's ontology, in a document of its own. */
export interface SharedOntology {
  smaltflOntology: 1;
  /** The source it is about, as every flow that imports it names it. */
  file: string;
  /** What the file is: a flow whose source says nothing takes it. */
  description?: string;
  /** What a row of the file is called. */
  noun?: Noun;
  /** What its columns mean (a flow's steps that pass a column on read the same meaning). */
  properties?: PropertyType[];
  /** The rules its rows are held to. */
  rules?: SharedRule[];
}

/** Where a flow's shared parts came from, as the flow keeps it: the file it is about, the path it was read from, and
 * the columns whose meanings it gave (so what the flow edits can be written back to it). */
export interface SharedFrom {
  file: string;
  path: string;
  columns: string[];
}

export class SharedOntologyError extends Error {}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const lower = (x: string) => x.toLowerCase();

/** A shared ontology as read, checked for its shape (what each part says is validateDocument's, once merged). */
export function asShared(value: unknown, path: string): SharedOntology {
  if (!isRecord(value) || value.smaltflOntology !== 1) throw new SharedOntologyError(`${path} isn't a shared ontology ({ "smaltflOntology": 1, "file", … })`);
  if (typeof value.file !== 'string' || value.file === '') throw new SharedOntologyError(`${path} names no file: the source it is about`);
  const known = ['smaltflOntology', 'file', 'description', 'noun', 'properties', 'rules'];
  for (const k of Object.keys(value)) if (!known.includes(k)) throw new SharedOntologyError(`${path}: ${k} isn't a shared ontology's part (${known.join(', ')})`);
  if (value.properties !== undefined && !Array.isArray(value.properties)) throw new SharedOntologyError(`${path}: properties is a list`);
  if (value.rules !== undefined && !Array.isArray(value.rules)) throw new SharedOntologyError(`${path}: rules is a list`);
  if (Array.isArray(value.rules) && value.rules.some((r) => isRecord(r) && 'file' in r)) throw new SharedOntologyError(`${path}: a shared rule's file is the shared file's (${value.file}): it names none`);
  return value as unknown as SharedOntology;
}

/**
 * A flow with the ontologies it imports brought in, each read by `read` from the path the flow gives (relative to the
 * flow; the caller resolves it). The shared parts come first: a column's meaning, then the flow's own; the shared rules,
 * then the flow's own; the file's noun and description where the flow says none. A flow that describes the same column
 * again, or names a rule as a shared one is named, is refused by validateDocument, so a meaning is said in one place.
 * A flow that imports nothing is returned as it is.
 */
export async function importOntologies(doc: FlowDocument, read: (path: string) => Promise<unknown>): Promise<FlowDocument> {
  const o = doc.ontology as (Ontology & { import?: unknown }) | undefined;
  if (!o || o.import === undefined) return doc;
  if (!Array.isArray(o.import) || o.import.some((p) => typeof p !== 'string' || p === '')) throw new SharedOntologyError('ontology.import is a list of paths to shared ontologies, relative to the flow');
  const { import: paths, ...own } = o;
  const shared: SharedFrom[] = [];
  const properties: PropertyType[] = [];
  const rules: OntologyRule[] = [];
  const nouns: Record<string, Noun> = {};
  let sources = doc.sources;
  for (const path of paths as string[]) {
    const s = asShared(await read(path), path);
    const src = doc.sources.find((x) => lower(x.id) === lower(s.file));
    if (!src) throw new SharedOntologyError(`${path} is about ${s.file}, which this flow doesn't read`);
    if (shared.some((x) => lower(x.file) === lower(s.file))) throw new SharedOntologyError(`two shared ontologies are about ${s.file}: a file's meanings and rules are in one place`);
    shared.push({ file: src.id, path, columns: (s.properties ?? []).map((p) => p.column) });
    properties.push(...(s.properties ?? []));
    rules.push(...(s.rules ?? []).map((r) => ({ ...r, file: src.id }) as OntologyRule));
    if (s.noun) nouns[src.id] = s.noun;
    if (s.description && !src.description) sources = sources.map((x) => (x === src ? { ...x, description: s.description! } : x));
  }
  const ontology: Ontology = {
    ...own,
    ...(properties.length || own.properties ? { properties: [...properties, ...(own.properties ?? [])] } : {}),
    ...(rules.length || own.rules ? { rules: [...rules, ...(own.rules ?? [])] } : {}),
    ...(Object.keys(nouns).length || own.nouns ? { nouns: { ...nouns, ...(own.nouns ?? {}) } } : {}),
    shared,
  };
  return { ...doc, sources, ontology };
}

/**
 * A file's shared ontology as the flow on screen has it now, for writing back to its shared file: the rules of the file
 * and the meanings the shared file gave (by column), as edited here, and the file's noun and description. What a flow
 * changes reaches the other flows that import the file only once this replaces the shared file.
 */
export function sharedOf(doc: Pick<FlowDocument, 'sources' | 'ontology'>, file: string): SharedOntology {
  const o = doc.ontology;
  const src = doc.sources.find((x) => lower(x.id) === lower(file));
  const from = o?.shared?.find((x) => lower(x.file) === lower(file));
  const columns = new Set((from?.columns ?? []).map(lower));
  // The file's own meanings: the shared file's columns, and a meaning the flow gave this file alone.
  const properties = (o?.properties ?? []).filter((p) => columns.has(lower(p.column)) || (p.datasets?.length === 1 && lower(p.datasets[0]!) === lower(file)));
  const rules = (o?.rules ?? []).filter((r) => lower(r.file) === lower(file)).map(({ file: _f, ...r }) => r);
  const noun = o?.nouns?.[src?.id ?? file];
  return {
    smaltflOntology: 1,
    file: src?.id ?? file,
    ...(src?.description ? { description: src.description } : {}),
    ...(noun ? { noun } : {}),
    ...(properties.length ? { properties } : {}),
    ...(rules.length ? { rules } : {}),
  };
}
