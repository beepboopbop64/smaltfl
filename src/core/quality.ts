/**
 * Data quality from a step's rows, as pure functions over values the app reads through the viewer's policy: what each
 * column holds (its profile), which rows are odd (an isolation forest), how a column moved since an earlier run
 * (drift), and which checks are worth adding. A profile's counts are exact, counted by the engine over every row; its
 * shapes (percentiles, histogram, common values) come from an even sample of the rows. No engine, no DOM: emit.ts
 * writes the SQL that gathers the inputs.
 */
import { FILLED_FROM } from './document.js';
import type { FailAction, FlowPlan, PlanNode } from './plan.js';
import { identifiers, quoteIdent, tokens } from './sqltext.js';

/**
 * What a column is, for showing and checking it: a measure (numbers that vary), a code (numbers or ids standing for
 * a category), a time, a category (a few text values), free text, or empty.
 */
export type Kind = 'measure' | 'code' | 'time' | 'category' | 'text' | 'empty';

/** Exact counts over every row, from the engine. */
export interface ColumnFacts {
  rows: number;
  /** Rows where the column has a value. */
  present: number;
  distinct: number;
  min: unknown;
  max: unknown;
  /** The mean of a numeric column. */
  mean: number | null;
}

export interface Quantiles {
  p01: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p99: number;
}

export interface Profile {
  name: string;
  kind: Kind;
  facts: ColumnFacts;
  /** A measure's or a time's percentiles in the sample (a time's in milliseconds since 1970). */
  quantiles?: Quantiles;
  /** The sample between its 1st and 99th percentile in equal bins, and how many fell below and above. */
  hist?: { lo: number; hi: number; counts: number[]; below: number; above: number };
  /** The sample's most common values, with their share of the values present. */
  top?: { value: string; share: number }[];
  /** Values the sample held. */
  sampled: number;
  /** Where the sample's values are missing, as a fingerprint: columns missing in the same rows share it. */
  gapsAt?: number;
}

const TIME = /^\d{4}-\d{2}-\d{2}([ T]\d{2}(:\d{2}){0,2}(\.\d+)?)?$/;
const asTime = (v: unknown) => (typeof v === 'string' && TIME.test(v) ? Date.parse(v.length <= 10 ? `${v}T00:00:00Z` : `${v.replace(' ', 'T')}${v.length <= 16 ? ':00' : ''}Z`) : NaN);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The p-th quantile (0 to 1) of sorted numbers, interpolated between neighbours. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const at = (sorted.length - 1) * p;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

function quantilesOf(sorted: readonly number[]): Quantiles {
  const q = (p: number) => quantile(sorted, p);
  return { p01: q(0.01), p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), p99: q(0.99) };
}

/** The numbers a column's sampled values stand for: themselves, or a time's milliseconds. */
export function numbersOf(kind: Kind, values: readonly unknown[]): number[] {
  return values.map((v) => (kind === 'time' ? asTime(v) : isNumber(v) ? v : NaN)).filter((v) => !Number.isNaN(v));
}

/** A time's minutes since midnight as the record writes it, or null: to compare days by the time of day, not the date. */
export function minuteOfDay(v: unknown): number | null {
  const t = asTime(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Minutes since midnight as a clock: 14:58. */
export const clockText = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}`;

/**
 * A column's profile from its exact facts and a sample of its values. Numbers are codes when they are ids (by name)
 * or take a dozen values or fewer; text is a time when nine in ten of its values read as one, a category when it
 * takes sixty values or fewer.
 */
export function profileColumn(name: string, type: string, facts: ColumnFacts, values: readonly unknown[]): Profile {
  const present = values.filter((v) => v !== null && v !== undefined);
  const numeric = type === 'int' || type === 'real' || type === 'num' || (present.length > 0 && present.every(isNumber));
  let kind: Kind;
  if (facts.present === 0) kind = 'empty';
  else if (numeric) kind = /(^|_)id$|[a-z]ID$|^ID$/.test(name) || facts.distinct <= 12 ? 'code' : 'measure';
  else if (present.length > 0 && present.filter((v) => !Number.isNaN(asTime(v))).length >= present.length * 0.9) kind = 'time';
  else kind = facts.distinct <= 60 ? 'category' : 'text';
  const profile: Profile = { name, kind, facts, sampled: values.length };
  if (present.length < values.length) {
    // FNV-1a over the positions of the missing values.
    let hash = 0x811c9dc5;
    values.forEach((v, i) => {
      if (v === null || v === undefined) hash = Math.imul(hash ^ i, 0x01000193) >>> 0;
    });
    profile.gapsAt = hash;
  }
  if (kind === 'measure' || kind === 'time') {
    const sorted = numbersOf(kind, present).sort((a, b) => a - b);
    if (sorted.length) {
      profile.quantiles = quantilesOf(sorted);
      const lo = profile.quantiles.p01;
      const hi = profile.quantiles.p99;
      const bins = hi > lo ? 24 : 1;
      const counts = new Array<number>(bins).fill(0);
      let below = 0;
      let above = 0;
      for (const v of sorted) {
        if (v < lo) below++;
        else if (v > hi) above++;
        else counts[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo || 1)) * bins))]!++;
      }
      profile.hist = { lo, hi, counts, below, above };
    }
  }
  if (kind !== 'measure' && kind !== 'empty' && present.length) {
    const seen = new Map<string, number>();
    for (const v of present) seen.set(String(v), (seen.get(String(v)) ?? 0) + 1);
    profile.top = [...seen.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([value, n]) => ({ value, share: n / present.length }));
  }
  return profile;
}

// ------------------------------------------------------------------ odd rows: an isolation forest

/** mulberry32: a small, well-mixed generator, so the same rows always score the same. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The average path length of an unsuccessful search in a binary search tree of n points: the forest's yardstick. */
export const avgPath = (n: number) => (n > 2 ? 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n : n === 2 ? 1 : 0);

/** An isolation tree: a split on feature `f` at `split` (lower values go left), or a leaf of the points left. */
export type Tree = { f: number; split: number; left: Tree; right: Tree } | { size: number };

/** A forest's trees, each with the subsample of row positions it was grown on, and that subsample's size. */
export interface Forest {
  trees: { root: Tree; members: number[] }[];
  size: number;
}

/**
 * Isolation forest scores (Liu, Ting and Zhou, 2008): each tree splits a random subsample on a random feature at a
 * random point until every point stands alone, and a point that stands alone after few splits is odd. A score near 1
 * is very odd; around 0.5 or below is ordinary. `data` is rows of numbers with no gaps (fill them first); the trees
 * are seeded, so the same data always gets the same scores.
 */
export function isolationForest(data: readonly (readonly number[])[], options: { trees?: number; size?: number; seed?: number } = {}): number[] {
  const forest = growForest(data, options);
  return forest ? data.map((x) => scoreOf(forest, x)) : data.map(() => 0.5);
}

/** The trees an isolation forest grows on `data`, or null when there is too little to split (under 3 rows, or no columns). */
export function growForest(data: readonly (readonly number[])[], options: { trees?: number; size?: number; seed?: number } = {}): Forest | null {
  const n = data.length;
  const dims = data[0]?.length ?? 0;
  if (dims === 0 || n < 3) return null;
  const trees = options.trees ?? 100;
  const size = Math.min(options.size ?? 256, n);
  const limit = Math.ceil(Math.log2(size));
  const rnd = random(options.seed ?? 2008);
  const grow = (idx: number[], depth: number): Tree => {
    if (depth >= limit || idx.length <= 1) return { size: idx.length };
    for (let tries = 0; tries < 2 * dims; tries++) {
      const f = Math.floor(rnd() * dims);
      let lo = Infinity;
      let hi = -Infinity;
      for (const i of idx) {
        const v = data[i]![f]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi > lo) {
        const split = lo + rnd() * (hi - lo);
        const left: number[] = [];
        const right: number[] = [];
        for (const i of idx) (data[i]![f]! < split ? left : right).push(i);
        return { f, split, left: grow(left, depth + 1), right: grow(right, depth + 1) };
      }
    }
    return { size: idx.length };
  };
  const forest: Forest = { trees: [], size };
  const all = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < trees; t++) {
    // A subsample without replacement: the first `size` places of a partial shuffle.
    for (let i = 0; i < size; i++) {
      const j = i + Math.floor(rnd() * (n - i));
      [all[i], all[j]] = [all[j]!, all[i]!];
    }
    const members = all.slice(0, size);
    forest.trees.push({ root: grow(members, 0), members });
  }
  return forest;
}

/** How many splits a tree takes to set a point apart: the splits on its way to a leaf, plus a leaf's expected rest. */
export function pathLength(tree: Tree, x: readonly number[]): number {
  let node = tree;
  let depth = 0;
  while ('f' in node) {
    node = x[node.f]! < node.split ? node.left : node.right;
    depth++;
  }
  return depth + avgPath(node.size);
}

/** A point's score in a forest: 2 to the minus its average path length over the forest's yardstick. */
export function scoreOf(forest: Forest, x: readonly number[]): number {
  let total = 0;
  for (const t of forest.trees) total += pathLength(t.root, x);
  return 2 ** (-(total / forest.trees.length) / avgPath(forest.size));
}

/** One split on a point's way down a tree, and the tree's rows still beside it after it. */
export interface Cut {
  feature: number;
  split: number;
  /** Which side the point goes: 'below' the split, or 'at or above' it. */
  side: 'below' | 'above';
  /** Row positions of the tree's subsample on the point's side after this cut. */
  left: number[];
}

/**
 * The cuts a tree makes on a point's way down, each with the rows of the tree's subsample still on the point's side:
 * the forest at work, one tree at a time. The last cut leaves the point alone, or with the few rows a leaf keeps.
 */
export function isolationPath(forest: Forest, tree: number, data: readonly (readonly number[])[], x: readonly number[]): Cut[] {
  const t = forest.trees[tree]!;
  let node = t.root;
  let left = t.members;
  const cuts: Cut[] = [];
  while ('f' in node) {
    const below = x[node.f]! < node.split;
    const { f, split } = node;
    left = left.filter((i) => data[i]![f]! < split === below);
    cuts.push({ feature: f, split, side: below ? 'below' : 'above', left });
    node = below ? node.left : node.right;
  }
  return cuts;
}

// ------------------------------------------------------------------ a picture of the rows: principal components

/** Two directions across the rows, and where each row lies along them. */
export interface Projection {
  /** Each row's place along the components. */
  points: [number, number][];
  /** Each component's weight on each column (unit length, its largest weight positive). */
  components: [number[], number[]];
  /** The share of the rows' spread each component carries. */
  explained: [number, number];
}

/**
 * The rows' two principal components, for a picture where far rows look far. Each column is centred on its median
 * and scaled by its spread (1.4826 times the median absolute deviation, else its standard deviation), so dollars
 * don't outweigh miles and one extreme row doesn't set the scale. The directions are found on values capped at six
 * spreads, so a few extreme rows don't choose them; every row is then placed along them uncapped. Power iteration
 * with deflation, from a fixed start: the same rows always give the same picture.
 */
export function principalComponents(data: readonly (readonly number[])[]): Projection | null {
  const n = data.length;
  const dims = data[0]?.length ?? 0;
  if (n < 3 || dims === 0) return null;
  const centre: number[] = [];
  const spread: number[] = [];
  for (let k = 0; k < dims; k++) {
    const col = data.map((r) => r[k]!).sort((a, b) => a - b);
    const med = quantile(col, 0.5);
    const mad = quantile(col.map((v) => Math.abs(v - med)).sort((a, b) => a - b), 0.5) * 1.4826;
    const mean = col.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    centre.push(med);
    spread.push(mad > 0 ? mad : sd > 0 ? sd : 1);
  }
  const z = data.map((r) => r.map((v, k) => (v - centre[k]!) / spread[k]!));
  const capped = z.map((r) => r.map((v) => Math.max(-6, Math.min(6, v))));
  const means = Array.from({ length: dims }, (_, k) => capped.reduce((a, r) => a + r[k]!, 0) / n);
  const cov = Array.from({ length: dims }, (_, a) => Array.from({ length: dims }, (_, b) => capped.reduce((t, r) => t + (r[a]! - means[a]!) * (r[b]! - means[b]!), 0) / Math.max(1, n - 1)));
  const trace = cov.reduce((t, row, k) => t + row[k]!, 0);
  const found: number[][] = [];
  const shares: number[] = [];
  for (let c = 0; c < 2; c++) {
    let v = Array.from({ length: dims }, (_, k) => 1 / Math.sqrt(dims) + (k + 1) * 1e-3);
    let lambda = 0;
    for (let it = 0; it < 500; it++) {
      const w = cov.map((row) => row.reduce((t, x, k) => t + x * v[k]!, 0));
      const norm = Math.hypot(...w);
      if (norm < 1e-12) break;
      const next = w.map((x) => x / norm);
      const moved = next.reduce((t, x, k) => t + Math.abs(x - v[k]!), 0);
      v = next;
      lambda = norm;
      if (moved < 1e-10) break;
    }
    // One orientation: the largest weight positive.
    const big = v.reduce((b, x, k) => (Math.abs(x) > Math.abs(v[b]!) ? k : b), 0);
    if (v[big]! < 0) v = v.map((x) => -x);
    found.push(v);
    shares.push(trace > 0 ? lambda / trace : 0);
    // Deflate: take this direction's spread out before looking for the next.
    for (let a = 0; a < dims; a++) {
      const row = cov[a]!;
      for (let b = 0; b < dims; b++) row[b] = row[b]! - lambda * v[a]! * v[b]!;
    }
  }
  const [u, w] = found as [number[], number[]];
  return {
    points: z.map((r) => [r.reduce((t, x, k) => t + (x - means[k]!) * u[k]!, 0), r.reduce((t, x, k) => t + (x - means[k]!) * w[k]!, 0)]),
    components: [u, w],
    explained: [shares[0]!, shares[1]!],
  };
}

/** Each column's gaps filled with its median, so a missing value is ordinary rather than odd. */
export function fillGaps(columns: readonly (readonly (number | null)[])[]): number[][] {
  const medians = columns.map((c) => quantile(c.filter((v): v is number => v !== null).sort((a, b) => a - b), 0.5));
  const rows = columns[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, r) => columns.map((c, k) => c[r] ?? (Number.isNaN(medians[k]!) ? 0 : medians[k]!)));
}

export interface Unusual {
  column: string;
  value: number;
  /** How far from the middle of the column, in robust standard deviations. */
  z: number;
  /** Where most values lie: the 10th to the 90th percentile. */
  usual: [number, number];
}

/**
 * Why a row is odd, in its own columns: the measures where it sits far from most rows (more than 3.5 robust standard
 * deviations from the median, the spread taken from the median absolute deviation), farthest first.
 */
export function unusual(profiles: readonly Profile[], row: Readonly<Record<string, unknown>>, mads: ReadonlyMap<string, number>): Unusual[] {
  const out: Unusual[] = [];
  for (const p of profiles) {
    const v = row[p.name];
    const q = p.quantiles;
    const mad = mads.get(p.name);
    if (p.kind !== 'measure' || !q || !isNumber(v) || !mad) continue;
    const z = (v - q.p50) / (1.4826 * mad);
    if (Math.abs(z) > 3.5) out.push({ column: p.name, value: v, z, usual: [q.p10, q.p90] });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

/** Each measure's median absolute deviation in the sample, for `unusual`. A column that never varies has none. */
export function madsOf(profiles: readonly Profile[], sample: readonly Readonly<Record<string, unknown>>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of profiles) {
    if (p.kind !== 'measure' || !p.quantiles) continue;
    const devs = sample.map((r) => r[p.name]).filter(isNumber).map((v) => Math.abs(v - p.quantiles!.p50)).sort((a, b) => a - b);
    const mad = quantile(devs, 0.5);
    if (mad > 0) out.set(p.name, mad);
  }
  return out;
}

// ------------------------------------------------------------------ drift between runs

/**
 * The population stability index of two sets of shares over the same bins: Σ (b − a) · ln(b / a), with empty bins
 * smoothed. Under 0.1 is steady, 0.1 to 0.25 has moved, over 0.25 has shifted.
 */
export function psi(before: readonly number[], after: readonly number[]): number {
  const eps = 1e-4;
  let total = 0;
  for (let i = 0; i < before.length; i++) {
    const a = Math.max(eps, before[i]!);
    const b = Math.max(eps, after[i]!);
    total += (b - a) * Math.log(b / a);
  }
  return total;
}

export interface Drift {
  psi: number;
  level: 'steady' | 'moved' | 'shifted';
  /** What moved, in a few words: a median, or the value whose share changed most. */
  note: string;
}

const shares = (counts: readonly number[]) => {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((c) => c / total);
};

/**
 * How a column moved between two samples of it: binned at the earlier sample's deciles for a measure or a time,
 * by value for anything else, with missing values as a bin of their own, so a column that empties out drifts too.
 */
export function drift(kind: Kind, before: readonly unknown[], after: readonly unknown[], format: (v: number) => string = String): Drift {
  const missing = (vs: readonly unknown[]) => vs.filter((v) => v === null || v === undefined).length;
  let a: number[];
  let b: number[];
  let note = '';
  if (kind === 'measure' || kind === 'time') {
    const xs = numbersOf(kind, before).sort((x, y) => x - y);
    const ys = numbersOf(kind, after).sort((x, y) => x - y);
    const edges = [...new Set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((p) => quantile(xs, p)))].filter((e) => !Number.isNaN(e));
    const bin = (vs: readonly number[]) => {
      const counts = new Array<number>(edges.length + 1).fill(0);
      for (const v of vs) {
        let k = 0;
        while (k < edges.length && v > edges[k]!) k++;
        counts[k]!++;
      }
      return counts;
    };
    a = [...bin(xs), missing(before)];
    b = [...bin(ys), missing(after)];
    const [m0, m1] = [quantile(xs, 0.5), quantile(ys, 0.5)];
    if (!Number.isNaN(m0) && !Number.isNaN(m1)) note = m0 === m1 ? `median ${format(m0)} both times` : `median ${format(m0)} → ${format(m1)}`;
  } else {
    const count = (vs: readonly unknown[]) => {
      const m = new Map<string, number>();
      for (const v of vs) if (v !== null && v !== undefined) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
      return m;
    };
    const [ca, cb] = [count(before), count(after)];
    const keys = [...new Set([...ca.keys(), ...cb.keys()])].sort((x, y) => (cb.get(y) ?? 0) + (ca.get(y) ?? 0) - ((cb.get(x) ?? 0) + (ca.get(x) ?? 0)));
    const head = keys.slice(0, 12);
    const rest = (m: Map<string, number>) => [...m.entries()].filter(([k]) => !head.includes(k)).reduce((s, [, n]) => s + n, 0);
    a = [...head.map((k) => ca.get(k) ?? 0), rest(ca), missing(before)];
    b = [...head.map((k) => cb.get(k) ?? 0), rest(cb), missing(after)];
    const [sa, sb] = [shares(a), shares(b)];
    let most = -1;
    head.forEach((k, i) => {
      if (most < 0 || Math.abs(sb[i]! - sa[i]!) > Math.abs(sb[most]! - sa[most]!)) most = i;
    });
    if (most >= 0) note = `${head[most]} ${(sa[most]! * 100).toFixed(1)}% → ${(sb[most]! * 100).toFixed(1)}%`;
  }
  const value = psi(shares(a), shares(b));
  return { psi: value, level: value < 0.1 ? 'steady' : value < 0.25 ? 'moved' : 'shifted', note };
}

// ------------------------------------------------------------------ what a step's columns became

/**
 * A step's new and dropped columns, with the renames among them told as such: a dropped column and a new one whose
 * names are the same but for case and underscores (LocationID → location_id). The rest stay new or dropped.
 */
export function renamesOf(added: readonly string[], removed: readonly string[]): { renamed: [string, string][]; added: string[]; removed: string[] } {
  const key = (c: string) => c.toLowerCase().replace(/_/g, '');
  const renamed: [string, string][] = [];
  const left = [...added];
  const gone: string[] = [];
  for (const r of removed) {
    const k = left.findIndex((a) => key(a) === key(r));
    if (k >= 0) renamed.push([r, left.splice(k, 1)[0]!]);
    else gone.push(r);
  }
  return { renamed, added: left, removed: gone };
}

/**
 * What a simple rule asks of a row, read from its check, for a dropped row's why in plain words: a time between two
 * columns within a span ("unixepoch(b) - unixepoch(a) BETWEEN 60 AND 10800"), a column's bounds ("x > 0 AND x <= 100",
 * "x >= 0"), a value present, or values it must not be ("x NOT IN (264, 265) AND y NOT IN (264, 265)"). Null for
 * anything else, which is then said as its rule.
 */
export type Need =
  | { kind: 'span'; from: string; to: string; lo: number; hi: number }
  | { kind: 'bounds'; column: string; lo: number | null; loOpen: boolean; hi: number | null; hiOpen: boolean }
  | { kind: 'present'; column: string }
  | { kind: 'notIn'; columns: string[]; values: string[] };

export function needOf(check: string): Need | null {
  const t = check.trim().replace(/\s+/g, ' ');
  const id = '([A-Za-z_][A-Za-z0-9_]*)';
  const num = '(-?\\d+(?:\\.\\d+)?)';
  let m = new RegExp(`^unixepoch\\(${id}\\) - unixepoch\\(${id}\\) BETWEEN ${num} AND ${num}$`, 'i').exec(t);
  if (m) return { kind: 'span', to: m[1]!, from: m[2]!, lo: Number(m[3]), hi: Number(m[4]) };
  m = new RegExp(`^${id} (>=|>) ${num} AND ${id} (<=|<) ${num}$`, 'i').exec(t);
  if (m && m[1]!.toLowerCase() === m[4]!.toLowerCase()) return { kind: 'bounds', column: m[1]!, lo: Number(m[3]), loOpen: m[2] === '>', hi: Number(m[6]), hiOpen: m[5] === '<' };
  m = new RegExp(`^${id} (>=|>|<=|<) ${num}$`, 'i').exec(t);
  if (m) return m[2]!.startsWith('>') ? { kind: 'bounds', column: m[1]!, lo: Number(m[3]), loOpen: m[2] === '>', hi: null, hiOpen: false } : { kind: 'bounds', column: m[1]!, lo: null, loOpen: false, hi: Number(m[3]), hiOpen: m[2] === '<' };
  m = new RegExp(`^${id} IS NOT NULL$`, 'i').exec(t);
  if (m) return { kind: 'present', column: m[1]! };
  const parts = t.split(/ AND /i).map((x) => new RegExp(`^${id} NOT IN \\(([^)]*)\\)$`, 'i').exec(x));
  if (parts.every((x) => x) && parts.every((x) => x![2] === parts[0]![2])) return { kind: 'notIn', columns: parts.map((x) => x![1]!), values: parts[0]![2]!.split(',').map((v) => v.trim()) };
  return null;
}

/** A span of seconds as people say it: 19 s, 1 min, 2.5 min, 3 h. */
export function secondsText(x: number): string {
  const a = Math.abs(x);
  if (a < 60) return `${Math.round(x)} s`;
  if (a < 3600) return `${Number((x / 60).toPrecision(2))} min`;
  return `${Number((x / 3600).toPrecision(2))} h`;
}

/** What a need asks, said: "1 min–3 h", "over 0, at most 100", "0 or more", "a value", "not 264 or 265". */
export function needWords(n: Need, fmt: (column: string, v: number) => string = (_c, v) => String(v)): string {
  switch (n.kind) {
    case 'span': return `${secondsText(n.lo)}–${secondsText(n.hi)}`;
    case 'bounds': {
      const lo = n.lo === null ? '' : n.loOpen ? `over ${fmt(n.column, n.lo)}` : `${fmt(n.column, n.lo)} or more`;
      const hi = n.hi === null ? '' : n.hiOpen ? `under ${fmt(n.column, n.hi)}` : `at most ${fmt(n.column, n.hi)}`;
      return [lo, hi].filter(Boolean).join(', ');
    }
    case 'present': return 'a value';
    case 'notIn': return `not ${n.values.length > 1 ? `${n.values.slice(0, -1).join(', ')} or ${n.values.at(-1)}` : n.values[0]}`;
  }
}

// ------------------------------------------------------------------ checks worth adding

export interface Suggestion {
  /** The rule's name: the column and what it checks. */
  name: string;
  column: string;
  /** SQL that is true for a row that passes. */
  check: string;
  /** Why it is suggested, in a sentence, from what the column holds today. */
  why: string;
  /** Whether every row passes it today: a guard for later runs, rather than a catch now. */
  guard: boolean;
  /** What it tests, for a plain sentence before its SQL: a measure's upper bound (`bound`), not below 0, present, one
   * of the values it takes, or one of the codes its source documents. */
  kind: 'range' | 'negative' | 'present' | 'known' | 'documented';
  bound?: number;
}

const RESERVED = new Set(['all', 'and', 'as', 'between', 'by', 'case', 'cast', 'check', 'date', 'default', 'distinct', 'else', 'end', 'exists', 'from', 'group', 'in', 'index', 'is', 'join', 'key', 'like', 'limit', 'not', 'null', 'on', 'or', 'order', 'select', 'table', 'then', 'time', 'timestamp', 'unique', 'values', 'when', 'where']);
/** A column's name as SQL: bare when it can be, quoted when it must. */
export const columnSql = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED.has(name.toLowerCase()) ? name : quoteIdent(name));
/** A number as SQL: exact enough, without float noise. */
export const numberText = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));
/** A number for people: about three significant digits. */
export const roughText = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) >= 10 ? String(Math.round(v * 10) / 10) : String(Number(v.toPrecision(3))));
const textSql = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** The smallest round number at or above x (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten): a bound people read at a glance. */
export function niceCeil(x: number): number {
  if (x <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= x - 1e-9 * p) return Number((m * p).toPrecision(6));
  return 10 * p;
}

/**
 * Checks worth adding for these columns, the ones that catch rows today first:
 *
 * - a measure with a far tail (beyond the third quartile plus three times the middle half, reached by under 1% of the
 *   sampled rows: a bound past which more go would drop ordinary rows, an airport fare or a rainy hour) gets an upper
 *   bound;
 * - a measure with negative values where most are not gets `>= 0`; one that never goes below zero, a guard that it doesn't;
 * - a column with a few values missing (up to 5% of rows) gets `IS NOT NULL`, which flags them;
 * - a category of a dozen values or fewer gets `IN (…)` its values today, which flags a new one, and if it is never
 *   missing, a guard that it isn't;
 * - a column whose codes the ontology documents (`documented`) gets `IN (…)` those codes instead, whatever its kind (a
 *   weather code is a number, but 51–75 are rain and snow, not a tail): a catch if it holds a code they don't list,
 *   else a guard against one, saying what the codes it holds mean (`meaning`); never a bound.
 *
 * A column an expectation already checks (in `covered`) is left alone, as is one outside `only` when it is given
 * (the columns a step makes itself, so a check sits where its column is made). Columns missing in the same rows get
 * one check between them. Range checks let a missing value pass: missing values are a check of their own. `values`
 * holds each small category's values, exactly. `span` is what the rows cover, said in the reasons: "today" for a day's
 * load, "in this file" for a file of many days.
 */
export function suggestChecks(profiles: readonly Profile[], options: { covered?: ReadonlySet<string>; only?: ReadonlySet<string>; values?: ReadonlyMap<string, readonly string[]>; documented?: ReadonlyMap<string, readonly string[]>; meaning?: (column: string, code: string) => string | undefined; span?: string; limit?: number } = {}): Suggestion[] {
  const span = options.span ?? 'today';
  const catches: Suggestion[] = [];
  // A column's documented codes guard it better than the codes it holds today: they come first among the guards.
  const documentedGuards: Suggestion[] = [];
  const guards: Suggestion[] = [];
  const covered = options.covered ?? new Set<string>();
  const mine = profiles.filter((p) => !covered.has(p.name.toLowerCase()) && (!options.only || options.only.has(p.name.toLowerCase())));
  // Missing together: the same count of gaps, in the same rows of the sample.
  const together = new Map<string, Profile[]>();
  for (const p of mine) {
    const gaps = p.facts.rows - p.facts.present;
    if (p.kind !== 'empty' && gaps > 0 && gaps <= p.facts.rows * 0.05) {
      const key = `${gaps}|${p.gapsAt ?? ''}`;
      together.set(key, [...(together.get(key) ?? []), p]);
    }
  }
  for (const group of together.values()) {
    const [p] = group;
    const gaps = p!.facts.rows - p!.facts.present;
    const names = group.map((x) => x.name);
    catches.push({
      name: `${p!.name}_present`,
      column: p!.name,
      check: `${columnSql(p!.name)} IS NOT NULL`,
      guard: false,
      kind: 'present',
      why: names.length === 1 ? `${pctText(gaps / p!.facts.rows)} of rows have no ${p!.name}.` : `${pctText(gaps / p!.facts.rows)} of rows have no ${names.slice(0, -1).join(', ')} or ${names.at(-1)}: they go missing together.`,
    });
  }
  for (const p of mine) {
    if (p.kind === 'empty' || p.kind === 'text' || p.kind === 'time') continue;
    const c = columnSql(p.name);
    const { rows, present, min, max } = p.facts;
    const gaps = rows - present;
    const known = options.values?.get(p.name);
    const codes = options.documented?.get(p.name);
    // Documented codes first, whatever the column's kind: they say what its values are, and a bound would cut codes
    // the source lists (weather codes over 12 are drizzle, rain and snow).
    if (codes?.length) {
      if (!known?.length || known.length !== p.facts.distinct) continue;
      const numeric = codes.every((v) => /^-?\d+$/.test(v)) && p.kind !== 'category';
      const order = (a: string, b: string) => (numeric ? Number(a) - Number(b) : a < b ? -1 : 1);
      const list = [...codes].sort(order).map((v) => (numeric ? v : textSql(v)));
      const other = known.filter((v) => !codes.includes(v));
      const rule = { name: `${p.name}_documented`, column: p.name, check: `${c} IS NULL OR ${c} IN (${list.join(', ')})`, kind: 'documented' as const };
      const held = [...known].filter((v) => codes.includes(v)).sort(order);
      // A coded number whose high codes would read as a far tail says what they mean instead: weather codes 51–75 are
      // drizzle, rain and snow, not outliers.
      const said = (v: string) => options.meaning?.(p.name, v);
      const q = p.kind === 'measure' ? p.quantiles : undefined;
      const fence = q ? q.p75 + 3 * (q.p75 - q.p25) : Infinity;
      const past = numeric && q && q.p75 > q.p25 ? held.filter((v) => Number(v) > fence) : [];
      const tail = past.length && said(past[0]!) && said(past.at(-1)!)
        ? past.length === 1 ? `; ${past[0]} is ${said(past[0]!)}, not an outlier` : `; ${past[0]}–${past.at(-1)} are ${said(past[0]!)} to ${said(past.at(-1)!)}, not outliers`
        : '';
      if (other.length) catches.push({ ...rule, guard: false, why: `Its source documents ${codes.length} codes, and ${other.join(', ')} ${other.length === 1 ? 'isn’t one' : 'aren’t among them'}.` });
      else documentedGuards.push({ ...rule, guard: true, why: `It holds ${held.length} of the ${codes.length} codes its source documents${tail}. This flags any other.` });
      continue;
    }
    if (p.kind === 'measure' && p.quantiles && isNumber(min) && isNumber(max)) {
      const q = p.quantiles;
      const iqr = q.p75 - q.p25;
      const fence = q.p75 + 3 * iqr;
      const bound = niceCeil(fence);
      // A far tail only: past the bound go under 1% of the sampled rows.
      if (iqr > 0 && max > fence && q.p99 <= bound) {
        catches.push({ name: `${p.name}_range`, column: p.name, check: `${c} IS NULL OR ${c} <= ${numberText(bound)}`, guard: false, kind: 'range', bound, why: `The middle half lies between ${roughText(q.p25)} and ${roughText(q.p75)}, but some rows go up to ${roughText(max)}.` });
      }
      if (min < 0 && q.p01 >= 0) catches.push({ name: `${p.name}_not_negative`, column: p.name, check: `${c} IS NULL OR ${c} >= 0`, guard: false, kind: 'negative', why: `Nearly all values are 0 or more, but the smallest is ${roughText(min)}.` });
      else if (min >= 0) guards.push({ name: `${p.name}_not_negative`, column: p.name, check: `${c} IS NULL OR ${c} >= 0`, guard: true, kind: 'negative', why: `It has never been below 0; this flags a run where it is.` });
    }
    if ((p.kind === 'category' || p.kind === 'code') && known && known.length > 0 && known.length <= 12 && p.facts.distinct <= 12) {
      const numeric = known.every((v) => /^-?\d+(\.\d+)?$/.test(v)) && p.kind === 'code';
      const list = [...known].sort((a, b) => (numeric ? Number(a) - Number(b) : a < b ? -1 : 1)).map((v) => (numeric ? v : textSql(v)));
      guards.push({ name: `${p.name}_known`, column: p.name, check: `${c} IS NULL OR ${c} IN (${list.join(', ')})`, guard: true, kind: 'known', why: `It takes ${known.length} ${known.length === 1 ? 'value' : 'values'} ${span}; this flags a new one.` });
      if (gaps === 0) guards.push({ name: `${p.name}_present`, column: p.name, check: `${c} IS NOT NULL`, guard: true, kind: 'present', why: `Every row has a ${p.name} ${span}; this flags one that doesn't.` });
    }
  }
  const names = new Set<string>();
  return [...catches, ...documentedGuards, ...guards].filter((s) => !names.has(s.name) && (names.add(s.name), true)).slice(0, options.limit ?? 8);
}

const pctText = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

/** A check somewhere in the flow that judges a step's rows with the values the step has. */
export interface Judge {
  /** The checks step, and the rule's place in it. */
  node: number;
  rule: number;
  name: string;
  check: string;
  onFail: FailAction;
  /** Where it runs, seen from the step: before it, in it (the step is the checks step), or after it. */
  at: 'before' | 'here' | 'after';
  /** The step's columns it reads, lowercased. */
  reads: string[];
}

/**
 * Whether SQL only selects * from its one input: maybe DISTINCT, maybe filtered, sorted or limited, nothing joined or
 * added. Its rows are some of its input's, their values unchanged.
 */
export function selectsStar(sql: string, input: string): boolean {
  let ts;
  try {
    ts = tokens(sql).filter((t) => t.kind !== 'space' && t.kind !== 'comment');
  } catch {
    return false;
  }
  const word = (k: number) => (ts[k]?.kind === 'word' ? ts[k]!.text.toLowerCase() : undefined);
  const name = (k: number) => (ts[k]?.kind === 'word' ? ts[k]!.text.toLowerCase() : ts[k]?.kind === 'quoted' ? [...identifiers(ts[k]!.text)][0] : undefined);
  let k = 0;
  if (word(k++) !== 'select') return false;
  if (word(k) === 'distinct' || word(k) === 'all') k++;
  if (ts[k++]?.text !== '*' || word(k++) !== 'from' || name(k++) !== input.toLowerCase()) return false;
  if (k < ts.length && !['where', 'order', 'limit'].includes(word(k) ?? '')) return false;
  let depth = 0;
  for (const t of ts.slice(k)) {
    if (t.text === '(') depth++;
    else if (t.text === ')') depth--;
    else if (depth === 0 && t.kind === 'word' && ['from', 'join', 'union', 'intersect', 'except', 'group', 'window', 'values'].includes(t.text.toLowerCase())) return false;
  }
  return true;
}

/**
 * The columns a node sets on rows it keeps, lowercased, or null when it makes rows of its own (a source, an
 * aggregate, SQL other than a plain select of its input, a fill that fills a day): a check across it judges other
 * values.
 */
function keeps(plan: FlowPlan, n: PlanNode, columnsOf: (j: number) => readonly string[]): Set<string> | null {
  const lc = (c: string) => c.toLowerCase();
  switch (n.op) {
    case 'filter':
    case 'expect':
      return new Set();
    case 'formula':
      return new Set(n.set.map(([c]) => lc(c)));
    case 'join':
      return new Set(n.take.map(([c]) => lc(c)));
    case 'select': {
      const had = new Set(columnsOf(n.inputs[0]!).map(lc));
      return new Set(n.project.filter(([c, e]) => !had.has(lc(c)) || e.trim().replace(/^"(.*)"$/s, '$1').toLowerCase() !== lc(c)).map(([c]) => lc(c)));
    }
    case 'sql':
      return n.inputs.length === 1 && n.names.length === 1 && selectsStar(n.sql, n.names[0]!) ? new Set() : null;
    case 'fill':
      // A fill step that fills nothing passes its source's rows through and adds its mark (ADR 0009 amendment 1 S1);
      // one that fills a day brings another day's rows in.
      return n.missing === null ? new Set([FILLED_FROM]) : null;
    default:
      return null;
  }
}

/**
 * The checks that judge a step's rows as they are: the rules of checks steps before and after it, on a path of steps
 * that keep their first input's rows and values (filters, checks, formulas, joins, projections, a plain select), as
 * long as nothing on the way sets a column the rule reads. A rule reading a column the step lacks doesn't judge it.
 */
export function checksOver(plan: FlowPlan, i: number, columnsOf: (j: number) => readonly string[]): Judge[] {
  const mine = new Set(columnsOf(i).map((c) => c.toLowerCase()));
  const out: Judge[] = [];
  const take = (j: number, at: Judge['at'], changed: ReadonlySet<string>) => {
    const n = plan.nodes[j]!;
    if (n.op !== 'expect') return;
    const cols = new Set(columnsOf(n.inputs[0]!).map((c) => c.toLowerCase()));
    n.rules.forEach(([name, check, onFail], rule) => {
      let ids: Set<string>;
      try {
        ids = identifiers(check);
      } catch {
        return;
      }
      const reads = [...ids].filter((x) => cols.has(x));
      if (reads.length && reads.every((x) => mine.has(x) && !changed.has(x))) out.push({ node: j, rule, name, check, onFail, at, reads });
    });
  };
  // Up from the step, while each step keeps its input's rows.
  const changed = new Set<string>();
  for (let j: number | undefined = i, at: Judge['at'] = 'here'; j !== undefined; at = 'before') {
    const n: PlanNode = plan.nodes[j]!;
    take(j, at, changed);
    const sets = keeps(plan, n, columnsOf);
    if (!sets) break;
    for (const c of sets) changed.add(c);
    j = n.inputs[0];
  }
  // Down from it, through the steps that read it first.
  const seen = new Set<number>();
  const down = (j: number, changed: ReadonlySet<string>) => {
    plan.nodes.forEach((r, k) => {
      if (r.inputs[0] !== j || seen.has(k)) return;
      seen.add(k);
      take(k, 'after', changed);
      const sets = keeps(plan, r, columnsOf);
      if (sets) down(k, new Set([...changed, ...sets]));
    });
  };
  down(i, new Set());
  return out;
}

