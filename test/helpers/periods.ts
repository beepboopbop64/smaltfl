/**
 * A history's periods as the loads' measures a run would make of them (ADR 0010 §6), and a history cut short: so a
 * test can split a made-up history into a base and a tail, and check that the tail folded back tells the same story.
 */
import type { HistoryFile, ValueHistory } from '../../src/core/history.js';
import { periodOf, type Measures } from '../../src/core/measures.js';

/** Period `k` of a history as its load's measures: its counted columns' values, its parts, its checks. */
export function measuresAt(file: HistoryFile, k: number, source = 'trips'): Measures {
  const p = periodOf(file, k);
  return {
    smaltflMeasures: 0, source, slot: p.slot, every: 'day', file: null, snapshot: '0'.repeat(64),
    checks: { step: file.step, rules: file.rules.map((r) => ({ ...r })) },
    columns: [...file.columns], types: [...file.types], kinds: [...file.kinds],
    rows: p.rows, dropped: p.dropped, failed: p.failed, present: p.present, p50: p.p50, quantiles: p.quantiles, sample: file.sample, parts: p.parts,
    values: p.counts, pairs: {},
  };
}

/** A history's first `n` periods, its counted columns' values folded again over them (no pairs, no followed columns). */
export function headOf(file: HistoryFile, n: number): HistoryFile {
  const cut = <T>(xs: T[]) => xs.slice(0, n);
  const values: Record<string, ValueHistory> = {};
  for (const [c, vh] of Object.entries(file.values)) {
    if (!vh.counts) throw new Error(`headOf folds counted columns only, not ${c}`);
    const counts = cut(vh.counts);
    const seen = vh.values.map((_, i) => counts.map((r, d) => [d, r[i] ?? 0] as const).filter(([, x]) => x > 0));
    const keep = vh.values.map((_, i) => i).filter((i) => seen[i]!.length > 0).sort((a, b) => seen[b]!.reduce((t, [, x]) => t + x, 0) - seen[a]!.reduce((t, [, x]) => t + x, 0));
    values[c] = {
      values: keep.map((i) => vh.values[i]!), first: keep.map((i) => seen[i]![0]![0]), last: keep.map((i) => seen[i]!.at(-1)![0]),
      days: keep.map((i) => seen[i]!.length), rows: keep.map((i) => seen[i]!.reduce((t, [, x]) => t + x, 0)),
      fresh: vh.fresh.filter(([d]) => d < n), counts: counts.map((r) => keep.map((i) => r[i] ?? 0)),
    };
  }
  const { weather: _weather, ...rest } = file;
  return { ...rest, days: cut(file.days), rows: cut(file.rows), dropped: cut(file.dropped), failed: cut(file.failed), present: cut(file.present), p50: cut(file.p50), quantiles: cut(file.quantiles), hours: cut(file.hours), values, pairs: {} };
}
