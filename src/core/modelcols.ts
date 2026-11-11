/**
 * The columns the two models read (ADR 0015 §6): the forest reads a day's counted values and their pairs, the classifier
 * a day's rows. A column that tells one row from another and nothing more (an id, a file's key) adds nothing to either
 * and would let the classifier tell any day from any other by its ids alone, so it is left out by default; so is a
 * column whose values are free text, times, dates or too many to be a code (`dataLeftOut`, read from the rows). The
 * ontology says otherwise for a column with `models: 'include'` or `'exclude'`. Pure.
 */
import { propertyOf, rowsOf, type Ontology } from './ontology.js';
import type { Kind } from './quality.js';

/** A name that says the column is an identifier: `id`, `uuid`, `guid`, or one ending `_id`, `_uuid`, `_guid`, `_key`. */
export const ID_LIKE = /(^|_)(id|uuid|guid|key)$/i;

/** Why a column is left out of the models by the ontology or its name, or null where it is read. A column whose coded
 * values the ontology lists is a code, whatever its name; `models: 'include'` reads any column. */
export function modelLeftOut(o: Ontology | undefined, dataset: string, column: string): string | null {
  const p = propertyOf(o, dataset, column);
  if (p?.models === 'include') return null;
  if (p?.models === 'exclude') return 'left out in the ontology';
  if (p?.values && Object.keys(p.values).length) return null;
  const lower = column.toLowerCase();
  const tied = rowsOf(o, dataset);
  const keys = new Set([...(o?.objectTypes ?? []).filter((t) => t.dataset.toLowerCase() === dataset.toLowerCase()).flatMap((t) => t.key), ...(tied?.own ? [tied.own] : [])].map((k) => k.toLowerCase()));
  if (keys.has(lower)) return 'the file’s key';
  if (ID_LIKE.test(column)) return 'an id';
  return null;
}

/** Why the rows leave a column out of the classifier, or null: free text, a time, empty, dates, or more values than a
 * code has (an id, a name). `distinct` is the most values a code may have. */
export function dataLeftOut(rows: readonly (readonly unknown[])[], c: number, kind: Kind, distinct = 50): string | null {
  if (kind === 'empty') return 'empty';
  if (kind === 'text') return 'free text';
  if (kind === 'time') return 'a time';
  if (kind === 'measure') return null;
  const seen = new Set<string>();
  let dates = 0;
  let present = 0;
  for (const r of rows) {
    const v = r[c];
    if (v === null || v === undefined || v === '') continue;
    present++;
    seen.add(JSON.stringify(v));
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) dates++;
  }
  if (present > 0 && dates >= 0.8 * present) return 'dates';
  if (seen.size > distinct) return `${seen.size > 1000 ? 'over 1,000' : seen.size.toLocaleString('en-US')} values: too many for a code`;
  return null;
}
