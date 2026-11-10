/**
 * The rows kept of a load (ADR 0014 §5): a few hundred of a table's rows, stratified by its counted columns, as the
 * classifier learns from them. The page asks for a source's before its run and appends them to the source's sample
 * beside its history; the run takes a watched step's from the dataset it has just built.
 *
 *   sample [{ table, settings: { keep, strata } }]  → unknown[][]   the rows, each a value a column of the table
 */
import type { Database } from 'smaltdb/engine';
import { keepSample, SAMPLE_KEEP } from '../core/apart.js';
import { emitSample } from '../core/emit.js';
import { quoteIdent as q } from '../core/sqltext.js';

export class SampleError extends Error {
  override name = 'SampleError';
}

export interface SampleSettings {
  keep: number;
  /** The columns the rows are stratified by (the counted columns). */
  strata: string[];
}

/** The settings a caller sends, checked. */
export function sampleSettingsOf(v: unknown): SampleSettings {
  const s = v as SampleSettings;
  if (typeof s !== 'object' || s === null || !Number.isSafeInteger(s.keep) || s.keep < 1 || !Array.isArray(s.strata) || s.strata.some((c) => typeof c !== 'string')) throw new SampleError('sample needs its settings: { keep, strata }');
  return { keep: s.keep, strata: [...s.strata] };
}

/** A table's kept rows with its columns: an even sample of at most four times `keep` rows, then stratified. */
export async function sampleTable(db: Database, table: string, s: SampleSettings): Promise<{ columns: string[]; rows: unknown[][] }> {
  const read = `SELECT * FROM ${q(table)}`;
  const st = db.prepare(read);
  const columns = [...st.columns];
  const n = Number((await db.queryAsync(`SELECT count(*) FROM (${read})`)).rows[0]![0]);
  const even = n ? (await db.queryAsync(emitSample(read, columns, Math.max(1, Math.ceil(n / (4 * s.keep)))))).rows : [];
  const strata = s.strata.map((c) => columns.indexOf(c)).filter((i) => i >= 0);
  return { columns, rows: keepSample(even.map((r) => [...r]), strata, s.keep) };
}

/** The plugin's `sample`. */
export async function sample(db: Database, input: unknown): Promise<{ columns: string[]; rows: unknown[][] }> {
  const i = input as { table?: unknown; settings?: unknown };
  if (typeof i !== 'object' || i === null || typeof i.table !== 'string' || i.table === '') throw new SampleError('sample names the table: { table, settings }');
  return sampleTable(db, i.table, i.settings === undefined ? { keep: SAMPLE_KEEP, strata: [] } : sampleSettingsOf(i.settings));
}
