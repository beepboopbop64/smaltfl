/**
 * A day's normal range: what a daily number (a load's trips, the share its checks dropped, a column's median) would
 * be on a day like it, and how far from that is still ordinary, from the days before it alone: a day is never part
 * of its own range. As data-observability tools set an expected range for a daily metric (the same weekday's history,
 * robust statistics) and as forecasting practice combines guesses rather than picking one:
 *
 * - The weeks before: the same weekday over the six weeks before, holidays and the days around them left out (looking
 *   back up to ten weeks for six), the latest counting most and each two places back half as much; their weighted
 *   median, which no one day can make.
 * - Last year: the same weekday around this time last year (52 weeks back, and a week either side: their median, so
 *   one odd week last year doesn't make the guess), moved by how this year's days compared with last year's over the
 *   six weeks before (the median of their ratios, day by day). A holiday, or a day in a holiday's window
 *   (calendar.ts), goes by its own day last year: the same holiday, or the same day of the window; one on a date that
 *   fell on another weekday last year is moved too, for a count, by how the two weekdays compare over the weeks
 *   before (a share's or a level's is not: a holiday Monday has no rush hour). Last year's guess has to carry over: one
 *   that misses the ordinary days before by more than three times the weeks' guess does can't judge a holiday.
 * - Together: each guess weighted by how well it did over the six weeks before, as Bates and Granger combine
 *   forecasts (in inverse proportion to its squared typical miss, the larger of its miss over every day and over the
 *   same weekday's, so a guess that does well on weekdays and badly on Saturdays counts for Saturdays as it does
 *   there); a guess that misses by more than three times the other's is left out (a rule or a habit changed since last
 *   year, as the TLC's surcharges did in December 2022); else neither counts less than a fifth, since weights
 *   measured over a few weeks are rough. A holiday, or a day around one, has last year's guess alone.
 * - The range: the guess, give or take three typical misses of that combined guess over the six weeks before (the
 *   typical miss: 1.4826 times the median absolute miss, a standard deviation that a few odd days don't inflate). A
 *   holiday's typical miss is last year's guess's on the holidays of the year before.
 *
 * Counts are guessed on a log scale (a miss is a ratio), shares on a logit scale, anything else as it is. No DOM, no
 * engine: the numbers come from runs, or from the scenario's history (scripts/data/history.ts).
 */
import { dayLastYear, daysBetween, isSpecial, plusDays, specialOf, US_NYC_1, type Calendar } from './calendar.js';

/** How a number varies: a count (by ratios), a share of rows (0 to 1), or a level, such as a median. */
export type Scale = 'count' | 'share' | 'level';

/** A number a day, from `from` on, null where there is none. */
export interface DailySeries {
  from: string;
  values: readonly (number | null)[];
}

/** A day a guess was made from, with its value and its weight in the guess. */
export interface Reference {
  day: string;
  value: number;
  weight: number;
}

export interface Guess {
  by: 'weeks' | 'year';
  /** The guess, as the number is. */
  value: number;
  /** Its share of the range's centre. */
  weight: number;
  /** Its typical miss over the days it was measured on, on its scale: a count's is a ratio's logarithm. */
  miss: number | null;
  /** The weeks before: the same weekdays, each with its weight; last year: the days last year, a median of up to three. */
  from: Reference[];
  /** Last year's, for a count: how this year's days compared with last year's lately, as a ratio. */
  ratio?: number;
  /** Last year's, for a share or a level: how much this year's days were above last year's lately. */
  shift?: number;
  /** Last year's: what its days said before it was moved, their median. */
  base?: number;
  /**
   * Last year's, for a holiday on a date that fell on another weekday last year: the weekdays (0 is Sunday), and how
   * this year's day of the week compares with last year's lately, as a ratio for a count and a difference otherwise.
   */
  weekday?: { from: number; to: number; by: number };
}

export interface NormalRange {
  day: string;
  scale: Scale;
  /** The guess, and the range's ends, as the number is. */
  expected: number;
  low: number;
  high: number;
  guesses: Guess[];
  /** The centre and the typical miss on the guessing scale (log, logit or as is); the range is `z` misses each way. */
  centre: number;
  spread: number;
  z: number;
  /** The days the typical miss was measured on, and what they were. */
  over: number;
  spreadFrom: 'weeks' | 'holidays' | 'ordinary days';
  /** A holiday's name, or the window around one it is in: a day judged by last year's alone. */
  special?: string;
  /** Its typical miss came from ordinary days, for want of holidays with a guess: a rough range. */
  rough?: boolean;
}

export type Place = 'below' | 'within' | 'above';

export interface NormalOptions {
  /** Same weekdays the weeks' guess uses, and how many weeks back it looks for them. */
  weeks?: number;
  back?: number;
  /** Places among the weeks used after which a week's weight halves. */
  half?: number;
  /** Days before a day that its year ratio and its guesses' misses are measured over. */
  window?: number;
  /** Typical misses each way. */
  z?: number;
  /** Days left out of what a normal day is learned from: an incident's, say. A day left out still has its own range. */
  skip?: ReadonlySet<string>;
  /** The flow's calendar: its special days are judged by last year's alone and never learned from (ADR 0010 §2). */
  calendar?: Calendar;
}

/**
 * Why a day has no range, for the words that say it isn't judged (ADR 0010 §1): a special day last year's history
 * doesn't have (`no last year`), one whose last year has moved too far to judge it by (`last year moved`), too few days
 * before it to learn from (`too few days`), or a day past the history's end (`history ends`). `days` counts the days
 * before it that have a number; `special` names a special day.
 */
export interface NoRange {
  why: 'no last year' | 'last year moved' | 'too few days' | 'history ends';
  days: number;
  special?: string;
}

const EPS = 1e-4;
const logit = (p: number) => Math.log(p / (1 - p));

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The smallest value at which half the weight is reached. */
function weightedMedian(xs: readonly { v: number; w: number }[]): number {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const half = s.reduce((t, x) => t + x.w, 0) / 2;
  let acc = 0;
  for (const x of s) {
    acc += x.w;
    if (acc >= half - 1e-12) return x.v;
  }
  return s.at(-1)!.v;
}

/** A typical miss: 1.4826 times the median absolute miss, a standard deviation for normal misses. */
const typical = (misses: readonly number[]) => 1.4826 * median(misses.map(Math.abs));
/** A guess is broken when it misses by more than three times the other's typical miss, and by a twentieth or more on
 * the guessing scale (a twentieth of a count, roughly; on a share's logit, of its odds). */
const broken = (miss: number, other: number) => miss > 3 * other && miss - other >= 0.05;

interface Inner {
  /** The guess on the guessing scale. */
  g: number;
  from: Reference[];
  /** Last year's: what its days said before it was moved, the ratio or shift it was moved by, and a weekday's. */
  b?: number;
  r?: number;
  wd?: { from: number; to: number; a: number };
}

/** A day's normal range, for a number a day: kept per day, so ranges over many days reuse each other's guesses. */
export class NormalRanges {
  readonly scale: Scale;
  private readonly series: DailySeries;
  private readonly o: Required<NormalOptions>;
  // By day, counted from the series' first: its date, whether it is special, its day last year, and what was guessed.
  private readonly dates = new Map<number, string>();
  private readonly specials = new Map<number, boolean>();
  private readonly lastYears = new Map<number, number | null>();
  private readonly weeksAt = new Map<number, Inner | null>();
  private readonly yearAt = new Map<number, Inner | null>();
  private readonly ratioAt = new Map<number, number | null>();
  private readonly rangeAt = new Map<number, NormalRange | null>();
  private readonly outliers = new Map<number, boolean>();

  constructor(series: DailySeries, scale: Scale, options: NormalOptions = {}) {
    this.series = series;
    this.scale = scale;
    this.o = { weeks: 6, back: 10, half: 2, window: 42, z: 3, skip: new Set(), calendar: US_NYC_1, ...options };
  }

  /** A day not learned from: a holiday or one around it, or one left out. */
  private excluded(k: number): boolean {
    return this.special(k) || (this.o.skip.size > 0 && this.o.skip.has(this.date(k))) || this.outlier(k);
  }

  /**
   * A count far from the same weekday's over the three weeks before it (half as much again, or a third less: a feed
   * that stopped, part way or all day): not learned from, as data-observability tools leave the anomalies they find
   * out of what they learn. Its own day is judged as any other.
   */
  private outlier(k: number): boolean {
    if (this.scale !== 'count') return false;
    let out = this.outliers.get(k);
    if (out === undefined) {
      const v = this.val(k);
      const before = [k - 7, k - 14, k - 21].filter((j) => !this.special(j)).flatMap((j) => (this.val(j) === null ? [] : [this.fwd(this.val(j)!)]));
      out = v !== null && before.length >= 2 && Math.abs(this.fwd(v) - median(before)) > Math.log(1.5);
      this.outliers.set(k, out);
    }
    return out;
  }

  private date(k: number): string {
    let d = this.dates.get(k);
    if (d === undefined) this.dates.set(k, (d = plusDays(this.series.from, k)));
    return d;
  }

  private special(k: number): boolean {
    let s = this.specials.get(k);
    if (s === undefined) this.specials.set(k, (s = isSpecial(this.date(k), this.o.calendar)));
    return s;
  }

  private lastYear(k: number): number | null {
    let j = this.lastYears.get(k);
    if (j === undefined) {
      const d = dayLastYear(this.date(k), this.o.calendar);
      this.lastYears.set(k, (j = d === undefined ? null : daysBetween(this.series.from, d)));
    }
    return j;
  }

  /** A day's weekday, 0 for Sunday. */
  private weekday(k: number): number {
    return (((new Date(`${this.series.from}T12:00:00Z`).getUTCDay() + k) % 7) + 7) % 7;
  }

  private val(k: number): number | null {
    const v = k >= 0 && k < this.series.values.length ? this.series.values[k] : null;
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  }

  /** The day's number, if there is one. */
  value(day: string): number | null {
    return this.val(daysBetween(this.series.from, day));
  }

  /** On the guessing scale. */
  private fwd(x: number): number {
    if (this.scale === 'count') return Math.log(Math.max(x, 0.5));
    if (this.scale === 'share') return logit(Math.min(1 - EPS, Math.max(EPS, x)));
    return x;
  }

  private back(y: number): number {
    if (this.scale === 'count') return Math.exp(y);
    if (this.scale === 'share') {
      const p = 1 / (1 + Math.exp(-y));
      return p <= EPS * 1.0001 ? 0 : p >= 1 - EPS * 1.0001 ? 1 : p;
    }
    return y;
  }

  /** The same weekday over the weeks before, holidays left out: their weighted median, the latest counting most. */
  private weeks(k: number): Inner | null {
    if (this.weeksAt.has(k)) return this.weeksAt.get(k)!;
    const from: (Reference & { x: number })[] = [];
    // Weighted by place among the days used, not by weeks back: when holidays are left out, the latest left is no
    // likelier to be right, and no one day weighs more than a third, so one odd day never makes the median.
    for (let w = 1; w <= this.o.back && from.length < this.o.weeks; w++) {
      const j = k - 7 * w;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) from.push({ day: this.date(j), value: v, weight: 0.5 ** (from.length / this.o.half), x: this.fwd(v) });
    }
    let out: Inner | null = null;
    // Three weeks at least, as a weekly pattern needs three of its weeks to be seen.
    if (from.length >= 3) {
      const total = from.reduce((t, r) => t + r.weight, 0);
      out = { g: weightedMedian(from.map((r) => ({ v: r.x, w: r.weight }))), from: from.map((r) => ({ day: r.day, value: r.value, weight: r.weight / total })) };
    }
    this.weeksAt.set(k, out);
    return out;
  }

  /** How this year's ordinary days compared with the same weekdays a year before, over the weeks before: the median. */
  private ratio(k: number): number | null {
    if (this.ratioAt.has(k)) return this.ratioAt.get(k)!;
    const diffs: number[] = [];
    for (let i = 1; i <= this.o.window; i++) {
      const [j, c] = [k - i, k - i - 364];
      if (this.excluded(j) || this.excluded(c)) continue;
      const [a, b] = [this.val(j), this.val(c)];
      if (a !== null && b !== null) diffs.push(this.fwd(a) - this.fwd(b));
    }
    // A quarter of the window's days at least.
    const out = diffs.length >= Math.ceil(this.o.window / 4) ? median(diffs) : null;
    this.ratioAt.set(k, out);
    return out;
  }

  /**
   * Last year's: an ordinary day's same weekday around this time last year (52 weeks back and a week either side, holidays
   * left out: their median), a holiday's own day last year; moved by how this year compares with last year lately.
   */
  private year(k: number): Inner | null {
    if (this.yearAt.has(k)) return this.yearAt.get(k)!;
    let out: Inner | null = null;
    const c = this.special(k) ? this.lastYear(k) : null;
    const days = this.special(k) ? (c === null ? [] : [c]) : [k - 364, k - 371, k - 357].filter((j) => !this.excluded(j));
    const known = days.filter((j) => this.val(j) !== null);
    const r = known.length ? this.ratio(k) : null;
    if (known.length && r !== null) {
      const b = median(known.map((j) => this.fwd(this.val(j)!)));
      const from = known.sort((x, y) => x - y).map((j) => ({ day: this.date(j), value: this.val(j)!, weight: 1 / known.length }));
      // A day on last year's weekday, the latest before this one: the two weekdays as the weeks before have them. Only
      // for a count: how many trips a weekday brings carries over to a holiday on it, but not what they are made of (a
      // holiday Monday has no rush hour, and no rush-hour surcharge).
      const back = this.scale === 'count' ? (this.weekday(k) - this.weekday(known[0]!) + 7) % 7 : 0;
      const [here, there] = back ? [this.weeks(k), this.weeks(k - back)] : [null, null];
      if (!back) out = { g: b + r, from, b, r };
      else if (here && there) {
        const a = here.g - there.g;
        out = { g: b + r + a, from, b, r, wd: { from: this.weekday(known[0]!), to: this.weekday(k), a } };
      }
    }
    this.yearAt.set(k, out);
    return out;
  }

  /** Each ordinary day of the window before a day: its number, and what each guess said of it. */
  private misses(k: number): { i: number; x: number; w: number | null; y: number | null }[] {
    const out: { i: number; x: number; w: number | null; y: number | null }[] = [];
    for (let i = 1; i <= this.o.window; i++) {
      const j = k - i;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) out.push({ i, x: this.fwd(v), w: this.weeks(j)?.g ?? null, y: this.year(j)?.g ?? null });
    }
    return out;
  }

  /**
   * How a guess misses days like this one: the larger of its typical miss over the window's ordinary days and over
   * those on the same weekday. A guess can do well on weekdays and badly on Saturdays, as last year's does when a
   * weekend surcharge has come in since; a typical miss over every day would hide it.
   */
  private missOf(ms: ReturnType<NormalRanges['misses']>, pick: (m: { w: number | null; y: number | null }) => number | null): number | null {
    const all = ms.flatMap((m) => (pick(m) === null ? [] : [m.x - pick(m)!]));
    if (all.length < Math.ceil(this.o.window / 4)) return null;
    const same = ms.flatMap((m) => (m.i % 7 !== 0 || pick(m) === null ? [] : [m.x - pick(m)!]));
    return same.length >= 3 ? Math.max(typical(all), typical(same)) : typical(all);
  }

  private guess(by: 'weeks' | 'year', inner: Inner, weight: number, miss: number | null): Guess {
    const out: Guess = { by, value: this.back(inner.g), weight, miss, from: inner.from };
    if (by === 'year' && inner.r !== undefined && inner.b !== undefined) {
      const a = inner.wd?.a ?? 0;
      if (this.scale === 'count') out.ratio = Math.exp(inner.r);
      else out.shift = this.back(inner.b + inner.r) - this.back(inner.b);
      if (inner.wd) out.weekday = { from: inner.wd.from, to: inner.wd.to, by: this.scale === 'count' ? Math.exp(a) : this.back(inner.g) - this.back(inner.g - a) };
      out.base = this.back(inner.b);
    }
    return out;
  }

  private range(k: number, centre: number, spread: number, guesses: Guess[], over: number, spreadFrom: NormalRange['spreadFrom'], extra: Partial<NormalRange> = {}): NormalRange {
    const z = this.o.z;
    return { day: this.date(k), scale: this.scale, expected: this.back(centre), low: this.back(centre - z * spread), high: this.back(centre + z * spread), guesses, centre, spread, z, over, spreadFrom, ...extra };
  }

  /** The day's normal range, from the days before it; none without enough of them. */
  at(day: string): NormalRange | null {
    const k = daysBetween(this.series.from, day);
    if (this.rangeAt.has(k)) return this.rangeAt.get(k)!;
    const out = this.compute(k);
    this.rangeAt.set(k, out);
    return out;
  }

  /**
   * Why the day has no range (`NoRange`), or null when it has one. It follows `compute`'s own order, so the reason given
   * is the one that left the day without a range.
   */
  explain(day: string): NoRange | null {
    if (this.at(day)) return null;
    const k = daysBetween(this.series.from, day);
    let days = 0;
    for (let j = 0; j < Math.min(k, this.series.values.length); j++) if (this.val(j) !== null) days++;
    if (k >= this.series.values.length) return { why: 'history ends', days };
    const special = k < 0 ? undefined : specialOf(day, this.o.calendar);
    if (!special) return { why: 'too few days', days };
    const c = this.lastYear(k);
    if (c === null || this.val(c) === null) return { why: 'no last year', days, special };
    const Y = this.year(k);
    if (!Y) return { why: 'too few days', days, special };
    const ms = this.misses(k);
    const [sW, sY] = [this.missOf(ms, (m) => m.w), this.missOf(ms, (m) => m.y)];
    if ((sW !== null && sY !== null && broken(sY, sW)) || Math.abs(Y.r ?? 0) > 0.5) return { why: 'last year moved', days, special };
    return { why: 'too few days', days, special };
  }

  private compute(k: number): NormalRange | null {
    const least = Math.ceil(this.o.window / 4);
    const day = this.date(k);
    const special = specialOf(day, this.o.calendar);
    const Y = this.year(k);
    if (special) {
      if (!Y) return null;
      // Last year's guess has to carry over: one that misses the ordinary days before by far more than the weeks'
      // guess does (a rule or a habit changed since last year) can't judge a holiday either.
      const ms = this.misses(k);
      const [sW, sY] = [this.missOf(ms, (m) => m.w), this.missOf(ms, (m) => m.y)];
      if (sW !== null && sY !== null && broken(sY, sW)) return null;
      // Nor when the number has moved far since last year (by half on the guessing scale: two thirds more or less of
      // a count): what a holiday had then, so moved, says little of what it has now (the TLC's $2.50 meant one
      // surcharge in 2022 and another in 2023).
      if (Math.abs(Y.r ?? 0) > 0.5) return null;
      // How well last year's guess did on the holidays of the year before.
      const misses: number[] = [];
      for (let i = 1; i <= 365; i++) {
        const j = k - i;
        if (!this.special(j) || this.o.skip.has(this.date(j))) continue;
        const [v, y] = [this.val(j), this.year(j)];
        if (v !== null && y) misses.push(this.fwd(v) - y.g);
      }
      if (misses.length >= 5) {
        const s = typical(misses);
        return this.range(k, Y.g, s, [this.guess('year', Y, 1, s)], misses.length, 'holidays', { special });
      }
      // Too few holidays yet: as well as last year's guess does on ordinary days, roughly.
      const ordinary = this.misses(k).flatMap((m) => (m.y === null ? [] : [m.x - m.y]));
      if (ordinary.length < least) return null;
      const s = typical(ordinary);
      return this.range(k, Y.g, s, [this.guess('year', Y, 1, s)], ordinary.length, 'ordinary days', { special, rough: true });
    }
    const W = this.weeks(k);
    if (!W && !Y) return null;
    const ms = this.misses(k);
    const sW = W ? this.missOf(ms, (m) => m.w) : null;
    const sY = Y ? this.missOf(ms, (m) => m.y) : null;
    let wW: number;
    if (W && Y && sW !== null && sY !== null) {
      const bg = sW === 0 && sY === 0 ? 0.5 : sW === 0 ? 1 : sY === 0 ? 0 : 1 / sW ** 2 / (1 / sW ** 2 + 1 / sY ** 2);
      // A guess that misses days like this one by far more than the other is left out; else neither counts less
      // than a fifth.
      wW = broken(sY, sW) ? 1 : broken(sW, sY) ? 0 : Math.min(0.8, Math.max(0.2, bg));
    } else if (W && sW !== null) wW = 1;
    else if (Y && sY !== null) wW = 0;
    else return null;
    const wY = 1 - wW;
    const centre = wW * (W?.g ?? 0) + wY * (Y?.g ?? 0);
    // How the guess, so weighted, did over the same days.
    const eC = ms.flatMap((m) => ((wW > 0 && m.w === null) || (wY > 0 && m.y === null) ? [] : [m.x - wW * (m.w ?? 0) - wY * (m.y ?? 0)]));
    if (eC.length < least) return null;
    const guesses = [...(W && wW > 0 ? [this.guess('weeks', W, wW, sW)] : []), ...(Y && wY > 0 ? [this.guess('year', Y, wY, sY)] : [])];
    return this.range(k, centre, typical(eC), guesses, eC.length, 'weeks');
  }

  /** How far a number is from the day's guess, in typical misses on the guessing scale: what ranks a finding. */
  distance(range: NormalRange, value: number): number {
    const x = this.fwd(value);
    if (range.spread === 0) return x === range.centre ? 0 : Math.sign(x - range.centre) * Infinity;
    return (x - range.centre) / range.spread;
  }

  /** Where a number falls against the day's range: on the guessing scale, so a share of none is a share of none. */
  place(range: NormalRange, value: number): Place {
    const x = this.fwd(value);
    const tol = 1e-9 * Math.max(1, Math.abs(x));
    const d = range.z * range.spread;
    return x < range.centre - d - tol ? 'below' : x > range.centre + d + tol ? 'above' : 'within';
  }

  /** How the ranges held over a span of days: each day against its own range, ordinary days and holidays apart. */
  backtest(from: string, to: string): Backtest {
    const out: Backtest = { ordinary: { days: 0, outside: 0 }, special: { days: 0, outside: 0 }, outside: [] };
    for (let d = from; d <= to; d = plusDays(d, 1)) {
      const v = this.value(d);
      const r = v === null ? null : this.at(d);
      if (v === null || !r) continue;
      const p = this.place(r, v);
      const part = r.special ? out.special : out.ordinary;
      part.days++;
      if (p !== 'within') {
        part.outside++;
        out.outside.push({ day: d, place: p, value: v, range: r });
      }
    }
    return out;
  }
}

export interface Backtest {
  ordinary: { days: number; outside: number };
  special: { days: number; outside: number };
  outside: { day: string; place: Place; value: number; range: NormalRange }[];
}
