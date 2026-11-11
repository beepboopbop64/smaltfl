/**
 * The classifier check (ADR 0014 §5): can today's rows be told apart from like days' rows? A kept sample of a few
 * hundred rows a day per watched node (`SampleFile`, smaltfl-sample/0, built by the history builder and appended by each
 * run, beside the history) is what it learns from: today's kept rows against the rows of the days like it, subsampled
 * to equal size, a shallow boosted model of stumps over the one-hot of the coded columns and the standardized
 * measures, trained on half and judged by its AUC on the other half against the binomial null and against the AUCs
 * random labels reach on the same rows. Explained by what the held-out half loses when a column's values are shuffled.
 * Learned: it warns under the layer's defaults. Everything is seeded, so the same rows always give the same verdict.
 */
import { plusDays } from './calendar.js';
import type { Kind } from './quality.js';
import { random } from './quality.js';
import { dataLeftOut } from './modelcols.js';

/** The rows kept of each day (ADR 0014 §5): a few hundred, stratified by the counted columns, every row flagged by a
 * check among them, in the columns' order. */
export interface SampleFile {
  format: 'smaltfl-sample/0';
  flow: string;
  source: string;
  columns: string[];
  kinds: Kind[];
  /** How many rows a day are kept at most. */
  keep: number;
  days: string[];
  /** Each day's rows, each row a value a column (JSON values: strings, numbers, booleans, null). */
  rows: unknown[][][];
}

/** How many rows a day are kept by default. */
export const SAMPLE_KEEP = 200;
/** How many days a sample keeps: eight weeks, the like days a classifier learns from. */
export const SAMPLE_WINDOW = 56;
/** The sample file pinned for a watched node, beside its history: what the engine reads to tell a step's claim. */
export const samplePath = (source: string): string => `sample.${source}.json`;

export const isSample = (v: unknown): v is SampleFile =>
  typeof v === 'object' && v !== null && (v as SampleFile).format === 'smaltfl-sample/0' && Array.isArray((v as SampleFile).columns) && Array.isArray((v as SampleFile).days) && Array.isArray((v as SampleFile).rows) && (v as SampleFile).days.length === (v as SampleFile).rows.length;

/**
 * The rows kept of a load (ADR 0014 §5): at most `keep`, stratified by the columns at `strata` (the counted columns:
 * every stratum present gets at least one row, the rest in proportion), each stratum sampled evenly through the rows
 * as they came, so a scan's order is kept; rows the caller flags (`flagged`, by position) are kept whatever their
 * stratum, within the same budget. Deterministic.
 */
export function keepSample(rows: readonly (readonly unknown[])[], strata: readonly number[], keep = SAMPLE_KEEP, flagged: ReadonlySet<number> = new Set()): unknown[][] {
  if (rows.length <= keep) return rows.map((r) => [...r]);
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const key = strata.map((c) => JSON.stringify(r[c] ?? null)).join('\u0001');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  });
  const chosen = new Set<number>();
  for (const i of flagged) if (i >= 0 && i < rows.length) chosen.add(i);
  const budget = Math.max(0, keep - chosen.size);
  const sizes = [...groups.values()].map((g) => g.length);
  const total = rows.length;
  // Each stratum's share of the budget, at least one; the largest strata give up rows when the floors overshoot.
  let quotas = sizes.map((n) => Math.max(1, Math.round((budget * n) / total)));
  let over = quotas.reduce((a, b) => a + b, 0) - budget;
  while (over > 0) {
    const k = quotas.indexOf(Math.max(...quotas));
    if (quotas[k]! <= 1) break;
    quotas[k]!--;
    over--;
  }
  [...groups.values()].forEach((g, k) => {
    const want = Math.min(quotas[k]!, g.length);
    if (want <= 0) return;
    const step = g.length / want;
    for (let j = 0; j < want; j++) {
      const i = g[Math.min(g.length - 1, Math.floor(j * step + step / 2))]!;
      chosen.add(i);
    }
  });
  return [...chosen].sort((a, b) => a - b).map((i) => [...rows[i]!]);
}

/** The sample file with a day's kept rows added after its last, the days older than the window dropped. A day at or
 * before the last is refused. */
export function appendSample(file: SampleFile, day: string, rows: readonly (readonly unknown[])[], window = SAMPLE_WINDOW): SampleFile {
  const last = file.days.at(-1);
  if (last !== undefined && day <= last) throw new Error(`the sample's ${day} isn't after its ${last}`);
  const days = [...file.days, day];
  const all = [...file.rows.map((d) => d.map((r) => [...r])), rows.map((r) => [...r])];
  const from = plusDays(day, -window);
  const keep = days.map((d, k) => k).filter((k) => days[k]! > from);
  return { ...file, days: keep.map((k) => days[k]!), rows: keep.map((k) => all[k]!) };
}

/**
 * The days like `day` a sample has (ADR 0014 §5), as the ranges' patterns have them (ADR 0010 §3): under the weekly
 * pattern the same weekday over the eight weeks before; under the monthly one the same day of the month (the month's
 * last day for a day the month lacks) over the months before, with the day either side of each, since a month's cycle
 * drifts; else every day of the four weeks before. The day itself and the days after it are left out, and the days
 * the caller says to leave out (the record's).
 */
export function likeDays(file: Pick<SampleFile, 'days'>, day: string, pattern: 'weekly' | 'none' | 'monthly', leaveOut: (d: string) => boolean = () => false): string[] {
  const from = plusDays(day, -28);
  let want: Set<string> | null = null;
  if (pattern === 'weekly') want = new Set(Array.from({ length: 8 }, (_, i) => plusDays(day, -7 * (i + 1))));
  else if (pattern === 'monthly') {
    want = new Set();
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    for (let back = 1; back <= 12; back++) {
      const month = new Date(Date.UTC(y, m - 1 - back, 1));
      const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      const same = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
      for (const x of [plusDays(same, -1), same, plusDays(same, 1)]) want.add(x);
    }
  }
  return file.days.filter((d) => d < day && (want ? want.has(d) : d > from) && !leaveOut(d));
}

/** An empty sample file for a node. */
export function emptySample(o: { flow: string; source: string; columns: readonly string[]; kinds: readonly Kind[]; keep?: number }): SampleFile {
  return { format: 'smaltfl-sample/0', flow: o.flow, source: o.source, columns: [...o.columns], kinds: [...o.kinds], keep: o.keep ?? SAMPLE_KEEP, days: [], rows: [] };
}

/** The sample's rows of the days given, pooled. */
export function sampleRows(file: SampleFile, days: readonly string[]): unknown[][] {
  const want = new Set(days);
  const out: unknown[][] = [];
  file.days.forEach((d, k) => {
    if (want.has(d)) for (const r of file.rows[k]!) out.push(r);
  });
  return out;
}

/**
 * The measures that are clocks (ADR 0014 §5): a column whose day's median climbs with the day over the like days (a
 * key's age, the days something has been overdue) tells today from any earlier day by itself, as a date does, and is
 * left out of the features. A median per day from the sample's rows; a clock when the correlation of median and day
 * is 0.9 or more over five days or more.
 */
export function clockColumns(file: Pick<SampleFile, 'days' | 'rows' | 'kinds'>, days: readonly string[]): number[] {
  const want = new Set(days);
  const picked = file.days.map((d, k) => k).filter((k) => want.has(file.days[k]!));
  const out: number[] = [];
  file.kinds.forEach((kind, c) => {
    if (kind === 'time' || kind === 'text' || kind === 'empty') return;
    const xs: number[] = [];
    const ys: number[] = [];
    picked.forEach((k, i) => {
      // A number, or a code that is one (days overdue kept as a code of few values).
      const raw = file.rows[k]!.map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== '');
      const values = raw.map((v) => Number(v)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      if (!values.length || values.length < 0.8 * raw.length) return;
      xs.push(i);
      ys.push(values[values.length >> 1]!);
    });
    if (xs.length < 5) return;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i]! - mx) * (ys[i]! - my);
      sxx += (xs[i]! - mx) ** 2;
      syy += (ys[i]! - my) ** 2;
    }
    if (sxx > 0 && syy > 0 && sxy / Math.sqrt(sxx * syy) >= 0.9) out.push(c);
  });
  return out;
}

// ------------------------------------------------------------------ features

interface Feature {
  /** The column it comes from, by place. */
  column: number;
  /** A one-hot of a value (as JSON), a missing flag, or the number itself. */
  kind: 'is' | 'missing' | 'number';
  value?: string;
}

/** The most common values of a coded column over both sides, each a one-hot; past `limit`, an "other". */
const VALUES = 12;
/** A coded column with more distinct values than this over both sides is an id or a name: not a feature. */
const DISTINCT = 50;
const DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Whether a column is left out of the features: a time, a date written as text, or an id (too many distinct values).
 * A date tells today from any earlier day by itself, which is no news; the dates' meaning is the due check's.
 */
function leftOut(rows: readonly (readonly unknown[])[], c: number, kind: Kind): boolean {
  return dataLeftOut(rows, c, kind, DISTINCT) !== null;
}

function featuresOf(rows: readonly (readonly unknown[])[], columns: readonly string[], kinds: readonly Kind[], skip: ReadonlySet<number>): { features: Feature[]; encode: (r: readonly unknown[]) => number[] } {
  const features: Feature[] = [];
  const codes: (Map<string, number> | null)[] = [];
  const scale: ({ mean: number; sd: number } | null)[] = [];
  kinds.forEach((kind, c) => {
    if (skip.has(c) || leftOut(rows, c, kind)) {
      codes.push(null);
      scale.push(null);
      return;
    }
    if (kind === 'measure' || kind === 'time') {
      const xs = rows.map((r) => Number(r[c])).filter((x) => Number.isFinite(x));
      const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
      const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : 1;
      scale.push({ mean, sd: sd > 0 ? sd : 1 });
      codes.push(null);
      features.push({ column: c, kind: 'number' }, { column: c, kind: 'missing' });
      return;
    }
    // Coded, category or zone: the common values, one-hot.
    const count = new Map<string, number>();
    for (const r of rows) {
      const key = JSON.stringify(r[c] ?? null);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, VALUES).map(([k]) => k);
    const ix = new Map(top.map((k, i) => [k, i]));
    codes.push(ix);
    scale.push(null);
    for (const k of top) features.push({ column: c, kind: 'is', value: k });
    if (count.size > top.length) features.push({ column: c, kind: 'is', value: '\u0000other' });
  });
  const encode = (r: readonly unknown[]): number[] => {
    const x: number[] = [];
    for (const f of features) {
      const v = r[f.column];
      if (f.kind === 'number') {
        const n = Number(v);
        const s = scale[f.column]!;
        x.push(v === null || v === undefined || !Number.isFinite(n) ? 0 : (n - s.mean) / s.sd);
      } else if (f.kind === 'missing') x.push(v === null || v === undefined || v === '' ? 1 : 0);
      else {
        const key = JSON.stringify(v ?? null);
        const ix = codes[f.column]!;
        x.push(f.value === '\u0000other' ? (ix.has(key) ? 0 : 1) : key === f.value ? 1 : 0);
      }
    }
    return x;
  };
  return { features, encode };
}

// ------------------------------------------------------------------ the model

interface Stump {
  f: number;
  split: number;
  left: number;
  right: number;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Boosted stumps by gradient boosting on the log loss: each round fits the best stump to the gradient, Newton leaves. */
function boost(X: readonly (readonly number[])[], y: readonly number[], rounds: number, rate: number): Stump[] {
  const n = X.length;
  const dims = X[0]?.length ?? 0;
  const F = new Array<number>(n).fill(0);
  const out: Stump[] = [];
  // Candidate splits a feature: a binary feature's one, a number's eight quantiles.
  const candidates: number[][] = [];
  for (let f = 0; f < dims; f++) {
    const xs = [...new Set(X.map((r) => r[f]!))].sort((a, b) => a - b);
    if (xs.length <= 1) candidates.push([]);
    else if (xs.length <= 9) candidates.push(xs.slice(1).map((v, i) => (xs[i]! + v) / 2));
    else candidates.push(Array.from({ length: 8 }, (_, i) => xs[Math.floor(((i + 1) * xs.length) / 9)]!));
  }
  for (let round = 0; round < rounds; round++) {
    const g = new Array<number>(n);
    const h = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const p = sigmoid(F[i]!);
      g[i] = y[i]! - p;
      h[i] = Math.max(1e-6, p * (1 - p));
    }
    let best: { gain: number; s: Stump } | null = null;
    for (let f = 0; f < dims; f++) {
      for (const split of candidates[f]!) {
        let gl = 0;
        let hl = 0;
        let gr = 0;
        let hr = 0;
        for (let i = 0; i < n; i++) {
          if (X[i]![f]! < split) {
            gl += g[i]!;
            hl += h[i]!;
          } else {
            gr += g[i]!;
            hr += h[i]!;
          }
        }
        if (hl < 1e-6 || hr < 1e-6) continue;
        const gain = (gl * gl) / (hl + 1) + (gr * gr) / (hr + 1);
        if (!best || gain > best.gain) best = { gain, s: { f, split, left: gl / (hl + 1), right: gr / (hr + 1) } };
      }
    }
    if (!best || best.gain < 1e-9) break;
    out.push(best.s);
    for (let i = 0; i < n; i++) F[i] = F[i]! + rate * (X[i]![best.s.f]! < best.s.split ? best.s.left : best.s.right);
  }
  return out;
}

const predict = (model: readonly Stump[], x: readonly number[], rate: number): number => {
  let F = 0;
  for (const s of model) F += rate * (x[s.f]! < s.split ? s.left : s.right);
  return F;
};

/** The area under the ROC curve of scores against labels (1 today, 0 before), by ranks, ties at half. */
export function aucOf(scores: readonly number[], labels: readonly number[]): number {
  const order = scores.map((s, i) => i).sort((a, b) => scores[a]! - scores[b]!);
  let rankSum = 0;
  let i = 0;
  const ranks = new Array<number>(scores.length);
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && scores[order[j + 1]!] === scores[order[i]!]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]!] = r;
    i = j + 1;
  }
  let n1 = 0;
  for (let k = 0; k < labels.length; k++) if (labels[k] === 1) (rankSum += ranks[k]!), n1++;
  const n0 = labels.length - n1;
  if (n1 === 0 || n0 === 0) return 0.5;
  return (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

/** What the classifier found (ADR 0014 §5). */
export interface Apart {
  /** The held-out AUC: 0.5 is chance, 1 is told apart every time. */
  auc: number;
  /** Standard errors over chance (Hanley and McNeil's null variance). */
  z: number;
  /** The highest AUC random labels reached on the same rows: the floor a real one must clear. */
  floor: number;
  /** Rows a side, and the days the reference came from. */
  n: number;
  days: number;
  /** What tells today apart: each column's share of the AUC lost when its values are shuffled, largest first, the
   * columns that explain anything. */
  columns: { column: string; share: number }[];
}

/**
 * Today's rows against the reference rows (ADR 0014 §5): both subsampled to the smaller side (at least 30 each),
 * split in half by turns, boosted stumps trained on one half and judged on the other. Null where there are too few
 * rows or nothing to learn from.
 */
export function tellApart(today: readonly (readonly unknown[])[], reference: readonly (readonly unknown[])[], columns: readonly string[], kinds: readonly Kind[], options: { rounds?: number; rate?: number; seed?: number; permutations?: number; days?: number; leaveOut?: ReadonlySet<number> } = {}): Apart | null {
  const n = Math.min(today.length, reference.length);
  if (n < 30) return null;
  const rnd = random(options.seed ?? 2017);
  const take = (rows: readonly (readonly unknown[])[]): (readonly unknown[])[] => {
    if (rows.length === n) return [...rows];
    const idx = Array.from({ length: rows.length }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(rnd() * (rows.length - i));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    return idx.slice(0, n).sort((a, b) => a - b).map((i) => rows[i]!);
  };
  const a = take(today);
  const b = take(reference);
  const all = [...a, ...b];
  const { features, encode } = featuresOf(all, columns, kinds, options.leaveOut ?? new Set());
  if (features.length === 0) return null;
  const X = all.map(encode);
  const y = [...a.map(() => 1), ...b.map(() => 0)];
  // By turns into the training and the held-out half, each side evenly.
  const train: number[] = [];
  const held: number[] = [];
  for (let i = 0; i < all.length; i++) ((i % n) % 2 === 0 ? train : held).push(i);
  const rounds = options.rounds ?? 50;
  const rate = options.rate ?? 0.3;
  const fit = (labels: readonly number[]) => boost(train.map((i) => X[i]!), train.map((i) => labels[i]!), rounds, rate);
  const judge = (model: readonly Stump[], rows: readonly (readonly number[])[]) => aucOf(rows.map((x) => predict(model, x, rate)), held.map((i) => y[i]!));
  const model = fit(y);
  const heldX = held.map((i) => X[i]!);
  const auc = judge(model, heldX);
  const n1 = held.filter((i) => y[i] === 1).length;
  const n0 = held.length - n1;
  const se = Math.sqrt((n1 + n0 + 1) / (12 * n1 * n0));
  const z = (auc - 0.5) / se;
  // The floor: random labels, the same rows, the same method.
  let floor = 0.5;
  for (let p = 0; p < (options.permutations ?? 3); p++) {
    const shuffled = [...y];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const m = fit(shuffled);
    const score = aucOf(heldX.map((x) => predict(m, x, rate)), held.map((i) => shuffled[i]!));
    floor = Math.max(floor, score);
  }
  // Permutation importance by column: shuffle its features together in the held-out half.
  const byColumn = new Map<number, number[]>();
  features.forEach((f, k) => (byColumn.get(f.column) ?? byColumn.set(f.column, []).get(f.column)!).push(k));
  const drops: { column: string; drop: number }[] = [];
  for (const [c, fs] of byColumn) {
    const perm = Array.from({ length: heldX.length }, (_, i) => i);
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j]!, perm[i]!];
    }
    const shuffled = heldX.map((x, i) => {
      const row = [...x];
      for (const k of fs) row[k] = heldX[perm[i]!]![k]!;
      return row;
    });
    drops.push({ column: columns[c]!, drop: auc - judge(model, shuffled) });
  }
  const positive = drops.filter((d) => d.drop > 0);
  const total = positive.reduce((t, d) => t + d.drop, 0);
  const cols = positive.sort((p, q) => q.drop - p.drop).map((d) => ({ column: d.column, share: total > 0 ? d.drop / total : 0 }));
  return { auc, z, floor, n, days: options.days ?? 0, columns: cols };
}

/** Whether what the classifier found is news (ADR 0014 §5): an AUC of 0.7 and four standard errors over chance, and
 * over what random labels reach. A slow drift tells days apart a little, and a little is not news. */
export const apartSpeaks = (a: Apart): boolean => a.z >= 4 && a.auc >= 0.7 && a.auc > a.floor + 0.05;

/**
 * The classifier's evidence for a day (ADR 0015 §6), whether or not it speaks: today's kept rows against the like days'
 * rows of the sample (`likeDays`, leaving out the days `learnsFrom` refuses), and what it found; or why it can't run.
 */
export function apartEvidence(sample: SampleFile, today: readonly (readonly unknown[])[], day: string, pattern: 'weekly' | 'none' | 'monthly', learnsFrom: (d: string) => boolean = () => true, leaveOut: (column: string) => boolean = () => false): { found: Apart; days: string[]; speaks: boolean } | { why: string } {
  const days = likeDays(sample, day, pattern, (d) => !learnsFrom(d));
  if (!days.length) return { why: 'no like days kept in the sample yet' };
  const out = new Set([...clockColumns(sample, days), ...sample.columns.flatMap((c, k) => (leaveOut(c) ? [k] : []))]);
  const found = tellApart(today, sampleRows(sample, days), sample.columns, sample.kinds, { days: days.length, seed: 2017, leaveOut: out });
  if (!found) return { why: 'too few rows a side to learn from' };
  return { found, days, speaks: apartSpeaks(found) };
}

/**
 * What the classifier reads of a sample's columns on a day, and why it leaves the others out (ADR 0015 §6): the
 * ontology's or the name's reason (`leaveOut`, modelcols.ts `modelLeftOut`), a count that only grows with the day, or
 * what the rows are (free text, a time, dates, too many values). In the sample's column order.
 */
export function apartColumns(sample: SampleFile, day: string, pattern: 'weekly' | 'none' | 'monthly', learnsFrom: (d: string) => boolean = () => true, leaveOut: (column: string) => string | null = () => null): { column: string; why: string | null }[] {
  const days = likeDays(sample, day, pattern, (d) => !learnsFrom(d));
  const rows = sampleRows(sample, days);
  const clock = new Set(clockColumns(sample, days));
  return sample.columns.map((column, c) => ({ column, why: leaveOut(column) ?? (clock.has(c) ? 'grows with the day, like a clock' : dataLeftOut(rows, c, sample.kinds[c]!, DISTINCT)) }));
}
