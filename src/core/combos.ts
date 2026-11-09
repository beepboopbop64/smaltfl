/**
 * Discovered checks (ADR 0013): what a watched dataset's columns do together, found from its history rather than
 * written as a rule. Two judges, both read in newsOf (news.ts) beside the value and pair findings:
 *
 * - `comboNews`: each pair of counted columns, cell by cell, by how its two values go together beyond what their own
 *   shares explain: the log odds ratio of the cell's two-by-two table (the `combo` metric, history.ts), which a
 *   column's share moving on its own leaves where it was. It has its own history and its own normal range, as a
 *   value's share does. A day whose odds are far outside it is a combination that moved, told by the cell that moved
 *   most and by the rows it moved, against the rows the day's own counts and the usual odds predict: "TLS Fail with
 *   Encryption Pass: 60 (usually ~30)". Each column's own share may be as usual that day; that is the point. Nothing
 *   names the pair in advance: every pair the history keeps day by day is judged. A value hardly there today (or
 *   nearly everything) says nothing of how it goes with another: its cells are passed over, its own finding speaks.
 * - `unlikeNews`: the day as a whole against the days before, by an isolation forest (quality.ts) grown on each learned
 *   day's numbers (every counted value's share, each pair's larger cells' excess, the share dropped). A day the forest
 *   sets apart in fewer splits than it took for any day before it is unlike them all, told with the numbers that set it
 *   apart most. The line is the days' own: each day before is scored by the trees it was not grown on, and today must
 *   score past every one of them (and past 0.5, the forest's own line for a point no quicker to isolate than the rest).
 *
 * Both are told as findings of the values cell (story.ts CELL_KINDS), never folded under a cause, and hold a day as
 * anything wrong does: a combination five points off is something wrong, two unusual; a day unlike the days before is
 * unusual. No DOM, no engine.
 */
import { comboLogOdds, comboPlaces, comboPredicted, comboTable, type HistoryRanges, type Metric, type ValueHistory } from './history.js';
import type { Finding, MATERIAL, Names, Severity } from './news.js';
import type { NormalRange } from './normal.js';
import { avgPath, growForest, isolationPath, pathLength, scoreOf } from './quality.js';

export interface ComboOptions {
  names: Names;
  /** The floors for the day (news.ts materialFor): `rows` is the fewest rows a combination must move. */
  M: typeof MATERIAL;
  /** A value in a short title (newsOf's `label`), and the noun for a count. */
  label: (column: string, key: string) => string;
  noun: (n?: number) => string;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const points = (x: number) => `${Math.abs(x * 100) >= 10 ? Math.round(Math.abs(x * 100)) : Math.round(Math.abs(x * 1000)) / 10} points`;
const listed = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const pct = (x: number) => `${Math.abs(x) >= 0.1 ? Math.round(x * 100) : Math.round(x * 1000) / 10}%`;

/** The values first seen on period `k` in a column's history, as their JSON keys. */
const freshOn = (vh: ValueHistory | undefined, k: number): Set<string> => new Set(vh ? vh.values.filter((_, i) => vh.first[i] === k) : []);

/** A cell's two values, from its key (`[x,y]` as JSON); null for a key of another shape. */
function cellOf(key: string): [unknown, unknown] | null {
  try {
    const xy = JSON.parse(key) as unknown;
    return Array.isArray(xy) && xy.length === 2 ? (xy as [unknown, unknown]) : null;
  } catch {
    return null;
  }
}

/** Days a cell must have been seen on before its excess has a range worth judging. */
const CELL_DAYS = 7;

/** The cell of a pair that moved most on the day: what its finding is told from. */
interface Best {
  key: string;
  x: unknown;
  y: unknown;
  d: number;
  delta: number;
  n: number;
  usual: number;
  /** How far the range's edge is from the usual, in rows of the day's share: what a day like it keeps within. */
  edge: number;
  metric: Metric;
  value: number;
  range: NormalRange;
}

/**
 * The combinations that moved on a day (ADR 0013 §2): for each pair kept day by day, the cell whose excess over what
 * its columns predict is furthest outside its own range, when it moved enough rows to matter (`M.rows`, and half a
 * point of the day). One finding a pair: a pair's cells move together (in a two-by-two table every cell moves by the
 * same amount), so the one named is the combination seen more than usual, the rarer of them when two tie.
 */
export function comboNews(h: HistoryRanges, day: string, o: ComboOptions): Finding[] {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0) return [];
  const rows = file.rows[k]!;
  if (!rows) return [];
  const out: Finding[] = [];
  for (const [pair, vh] of Object.entries(file.pairs ?? {})) {
    if (!vh.counts) continue;
    const [a, b] = pair.split('|') as [string, string];
    const newA = freshOn(file.values?.[a], k);
    const newB = freshOn(file.values?.[b], k);
    let best: Best | null = null;
    let worst: Severity = 'note';
    vh.values.forEach((key, i) => {
      if (vh.days[i]! < CELL_DAYS) return;
      const xy = cellOf(key);
      if (!xy) return;
      // A combination with a value new itself is told with that value (newOf's pair finding).
      if (newA.has(JSON.stringify(xy[0])) || newB.has(JSON.stringify(xy[1]))) return;
      const places = comboPlaces(file, pair, key);
      if (!places) return;
      const t = comboTable(places, k, rows);
      // A value hardly there today, or nearly everything, says nothing of how it goes with another.
      if (t.x < o.M.rows || t.y < o.M.rows || rows - t.x < o.M.rows || rows - t.y < o.M.rows) return;
      const metric: Metric = { of: 'combo', pair, value: key };
      const ranges = h.of(metric);
      const range = ranges?.at(day);
      const value = ranges?.value(day) ?? null;
      if (!ranges || !range || value === null || ranges.place(range, value) === 'within') return;
      const n = t.both;
      const usual = comboPredicted(t, range.expected);
      // Rows beyond what the columns' own counts and the usual odds predict, as a share of the day; too few to matter
      // are passed over.
      const delta = (n - usual) / rows;
      if (Math.abs(delta) * rows < o.M.rows || Math.abs(delta) < o.M.share) return;
      const d = ranges.distance(range, value);
      const edge = (comboPredicted(t, range.high) - usual) / rows;
      // Four typical misses out, and either five points of the day's rows or the combination at twice (or half) what
      // the columns predict by two points or more: something wrong. Two points: unusual. Else worth knowing. The pair's
      // severity is its worst cell's (in a two-by-two table every cell moves by the same amount, one doubling while
      // another halves); the cell named is the combination seen more than usual, the rarer when two tie.
      const far = Math.abs(d) >= 4;
      const doubled = usual > 0 ? n >= 2 * usual || n <= usual / 2 : n > 0;
      const unusual = Math.abs(delta) >= o.M.comboUnusual;
      const severity: Severity = !far ? 'note' : Math.abs(delta) >= o.M.comboWrong || (doubled && unusual) ? 'alert' : unusual ? 'warn' : 'note';
      worst = worst === 'alert' || severity === 'alert' ? 'alert' : worst === 'warn' || severity === 'warn' ? 'warn' : 'note';
      const better = !best || delta > 0 !== best.delta > 0 ? delta > 0 : Math.abs(delta) > Math.abs(best.delta) * 1.001 || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) <= Math.abs(best.delta) * 0.001 && vh.rows[i]! < vh.rows[vh.values.indexOf(best.key)]!);
      if (best && !better) return;
      best = { key, x: xy[0], y: xy[1], d, delta, n, usual, edge, metric, value, range };
    });
    if (!best) continue;
    const c: Best = best;
    const severity: Severity = worst;
    const col = (x: string) => o.names.column(x);
    const more = c.delta > 0;
    out.push({
      key: `combo:${pair}`,
      kind: 'combo',
      severity,
      score: Math.min(99, Math.abs(Number.isFinite(c.d) ? c.d : 99)),
      title: `${col(a)} ${o.label(a, JSON.stringify(c.x))} with ${col(b)} ${o.label(b, JSON.stringify(c.y))}: ${fmtInt(c.n)} (usually ~${fmtInt(c.usual)})`,
      detail: `${fmtInt(c.n)} ${o.noun(c.n)} together, ${points(c.delta)} ${more ? 'more' : 'fewer'} than ${col(a)} and ${col(b)} alone predict; a day like it is within ${points(c.edge)}.`,
      look: 'columns',
      columns: [a, b],
      values: [c.key],
      metric: c.metric,
      value: c.value,
      range: c.range,
      rows: c.n,
      acts: ['incident', 'expected', 'rule', 'notify'],
    });
  }
  return out;
}

export interface UnlikeOptions {
  names: Names;
  label: (column: string, key: string) => string;
  noun: (n?: number) => string;
}

/** The fewest learned days a forest is grown on; and a pair's cells it reads, the largest by rows. */
const LEARN_DAYS = 28;
const CELLS_A_PAIR = 8;
const TREES = 100;

/** One of a day's numbers the forest reads: how it is said, and its value on a period (null when unmeasured). */
interface Feature {
  columns: string[];
  /** What it is, in a few words, without numbers. */
  name: string;
  at: (k: number) => number | null;
  words: (k: number, usual: number) => string;
}

/** The numbers a day is seen by: every counted value's share, each pair's larger cells' log odds, the share dropped. */
export function dayFeatures(h: HistoryRanges, o: Pick<UnlikeOptions, 'names' | 'label'>): Feature[] {
  const file = h.file;
  const out: Feature[] = [];
  const col = (x: string) => o.names.column(x);
  const share = (k: number, n: number | undefined) => (file.rows[k]! > 0 ? (n ?? 0) / file.rows[k]! : null);
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts) continue;
    vh.values.forEach((key, i) => {
      out.push({ columns: [column], name: `${col(column)} ${o.label(column, key)}`, at: (k) => share(k, vh.counts![k]?.[i]), words: (k, usual) => `${col(column)} ${o.label(column, key)} ${pct(share(k, vh.counts![k]?.[i]) ?? 0)} (usually ${pct(usual)})` });
    });
  }
  for (const [pair, vh] of Object.entries(file.pairs ?? {})) {
    if (!vh.counts) continue;
    const [a, b] = pair.split('|') as [string, string];
    const top = vh.values.map((key, i) => ({ key, i })).sort((p, q) => vh.rows[q.i]! - vh.rows[p.i]!).slice(0, CELLS_A_PAIR);
    for (const { key, i } of top) {
      const places = comboPlaces(file, pair, key);
      const xy = cellOf(key);
      if (!places || !xy) continue;
      const at = (k: number) => {
        const rows = file.rows[k]!;
        return rows ? comboLogOdds(comboTable(places, k, rows)) : null;
      };
      out.push({ columns: [a, b], name: `${col(a)} ${o.label(a, JSON.stringify(xy[0]))} with ${col(b)} ${o.label(b, JSON.stringify(xy[1]))}`, at, words: (k, usual) => {
        const v = at(k) ?? 0;
        return `${col(a)} ${o.label(a, JSON.stringify(xy[0]))} with ${col(b)} ${o.label(b, JSON.stringify(xy[1]))} ${v >= usual ? 'together more' : 'together less'} than usual (odds ${Math.exp(v).toFixed(1)}×, usually ${Math.exp(usual).toFixed(1)}×)`;
      } });
    }
  }
  if (file.dropped.some((d) => d > 0)) out.push({ columns: [], name: 'the share dropped', at: (k) => share(k, file.dropped[k]), words: (k, usual) => `${pct(share(k, file.dropped[k]) ?? 0)} dropped by the checks (usually ${pct(usual)})` });
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0;
};

/**
 * A day unlike every day before it (ADR 0013 §3): an isolation forest grown on the learned days' numbers scores today;
 * each learned day is scored by the trees it was left out of; today is unlike them when its score is past every one of
 * theirs and past 0.5. Told with the numbers that set it apart most: for each tree the splits on today's way down,
 * each credited with the share of the day's companions it cut away.
 */
export function unlikeNews(h: HistoryRanges, day: string, o: UnlikeOptions): Finding[] {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0 || !file.rows[k]) return [];
  const features = dayFeatures(h, o);
  if (features.length < 2) return [];
  const learned = file.days.map((d, j) => j).filter((j) => j < k && j >= file.warmup && file.rows[j]! > 0 && h.learnsFrom(file.days[j]!));
  if (learned.length < LEARN_DAYS) return [];
  const row = (j: number) => features.map((f) => f.at(j) ?? 0);
  const train = learned.map(row);
  const today = row(k);
  const size = Math.ceil(train.length / 2);
  const forest = growForest(train, { trees: TREES, size, seed: 2008 });
  if (!forest) return [];
  // Each learned day by the trees it was not grown on (half of them, on average).
  const yard = avgPath(size);
  let highest = 0;
  learned.forEach((_, i) => {
    let total = 0;
    let n = 0;
    for (const t of forest.trees) {
      if (t.members.includes(i)) continue;
      total += pathLength(t.root, train[i]!);
      n++;
    }
    if (n) highest = Math.max(highest, 2 ** (-(total / n) / yard));
  });
  const score = scoreOf(forest, today);
  if (score <= Math.max(0.5, highest)) return [];
  // What set it apart: the splits on its way down each tree, credited with the share of companions each cut away.
  const credit = new Array<number>(features.length).fill(0);
  forest.trees.forEach((t, ti) => {
    let before = t.members.length;
    for (const cut of isolationPath(forest, ti, train, today)) {
      if (before > 0) credit[cut.feature]! += (before - cut.left.length) / before;
      before = cut.left.length;
    }
  });
  const top = credit.map((c, f) => ({ c, f })).filter((x) => x.c > 0).sort((p, q) => q.c - p.c).slice(0, 3);
  const columns = [...new Set(top.flatMap(({ f }) => features[f]!.columns))];
  // Words at a glance are budgeted (ADR 0008): the title names what set the day apart most when that fits eight
  // words, the detail the three that did; the numbers are in `members`, for a screen with room.
  const lead = top[0] ? features[top[0].f]!.name : '';
  const withLead = `Unlike any day: ${lead}`;
  return [{
    key: 'unlike',
    kind: 'unlike',
    severity: 'warn',
    score: Math.round(score * 100) / 10,
    title: lead && withLead.split(/\s+/).length <= 8 ? withLead : 'Unlike any day before',
    detail: `Set apart from ${fmtInt(learned.length)} days before by ${listed(top.slice(0, 2).map(({ f }) => features[f]!.name))}.`,
    look: 'history',
    columns,
    acts: ['incident', 'expected', 'notify'],
    unlike: { score, highest, days: learned.length, numbers: top.map(({ f }) => features[f]!.words(k, median(learned.map((j) => features[f]!.at(j) ?? 0)))) },
  }];
}
