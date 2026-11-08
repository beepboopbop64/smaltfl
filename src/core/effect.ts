/**
 * A table that measures an effect against a baseline, read from its rows (ADR 0008 §12): a ratio column named
 * `vs_<baseline>` ("vs_dry"), the column that holds the baseline as a value ("condition", whose dry hours are the 1×),
 * and the group each ratio is for (the first other text column, "borough"). On a day whose rows hold only the
 * baseline there is nothing to measure: every ratio is the baseline against itself. Pure, for the News tab and tests.
 */

export interface Effect {
  /** The ratio column, the baseline it is against, the column that holds it, and the groups' column. */
  ratio: string;
  baseline: string;
  by: string;
  group: string | null;
  /** Each row that isn't the baseline: its group, its value (rain, snow), its ratio to the baseline. */
  rows: { group: string; value: string; ratio: number }[];
  /** Rows in all, and whether any row is something other than the baseline with a ratio. */
  total: number;
  measured: boolean;
}

export function effectOf(columns: readonly string[], rows: readonly (readonly unknown[])[]): Effect | null {
  const r = columns.findIndex((c) => /^vs_[a-z]/i.test(c));
  if (r < 0) return null;
  const baseline = columns[r]!.slice(3).replace(/_/g, ' ').toLowerCase();
  const same = (v: unknown) => typeof v === 'string' && v.toLowerCase() === baseline;
  const by = columns.findIndex((_, j) => j !== r && rows.some((row) => same(row[j])));
  if (by < 0) return null;
  const group = columns.findIndex((_, j) => j !== r && j !== by && rows.length > 0 && rows.every((row) => typeof row[j] === 'string'));
  const out: Effect['rows'] = [];
  for (const row of rows) {
    const v = row[by];
    const x = row[r];
    if (same(v) || typeof v !== 'string') continue;
    const ratio = typeof x === 'number' ? x : typeof x === 'bigint' ? Number(x) : Number.NaN;
    if (!Number.isFinite(ratio)) continue;
    out.push({ group: group >= 0 ? String(row[group]) : '', value: v, ratio });
  }
  return { ratio: columns[r]!, baseline, by: columns[by]!, group: group >= 0 ? columns[group]! : null, rows: out, total: rows.length, measured: out.length > 0 };
}
