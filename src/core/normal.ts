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
import { dayLastYear, daysBetween, isSpecial, occurrencesBefore, plusDays, recurringOf, specialOf, US_NYC_1, type Calendar } from './calendar.js';

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
  /** The weeks before (the periods before, for the patterns `none` and `monthly`); last year; the same day of the month
   * (`monthly`); or, for a flow's recurring day, its occurrences before (ADR 0010 §2, §3). */
  by: 'weeks' | 'year' | 'occurrences' | 'month';
  /** The guess, as the number is. */
  value: number;
  /** Its share of the range's centre. */
  weight: number;
  /** Its typical miss over the days it was measured on, on its scale: a count's is a ratio's logarithm. */
  miss: number | null;
  /** The weeks before: the same weekdays, each with its weight; last year: the days last year, a median of up to three;
   * the occurrences: the recurring day's days before, each with its weight. */
  from: Reference[];
  /** The occurrences': how far above a day like it each occurrence was, their weighted median, as a ratio for a count and
   * a difference otherwise. */
  lift?: number;
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
  spreadFrom: 'weeks' | 'holidays' | 'ordinary days' | 'occurrences';
  /** A holiday's name, or the window around one it is in: a day judged by last year's alone. */
  special?: string;
  /** Its typical miss came from ordinary days, for want of holidays with a guess: a rough range. */
  rough?: boolean;
  /** The day the level it was learned from starts (ADR 0010 §5): an accepted level's, or a lasting change's. */
  since?: string;
}

export type Place = 'below' | 'within' | 'above';

/** What a day is compared with (ADR 0010 §3): the same weekday over the weeks before (`weekly`); the periods before,
 * whatever the weekday (`none`); those and the same day of the month (`monthly`). */
export type Pattern = 'weekly' | 'none' | 'monthly';

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
  /** What a day is compared with (ADR 0010 §3): `weekly` unless the watch says otherwise. */
  pattern?: Pattern;
  /** The echo fix (ADR 0010 §5): a share far from the same weekday's three weeks before (0.6 on the logit) is not
   * learned from, as a count far from them isn't. Off in the legacy form, whose verdicts don't move. */
  echoes?: boolean;
  /** The days accepted levels start (ADR 0010 §5, C6): from each, the number is learned only from the days since. */
  breaks?: readonly string[];
  /** Re-learning on its own (ADR 0010 §5): a change that has lasted 14 days starts a break from its first day, unless
   * it held a day (`held`, X7). Off in the legacy form. */
  relearn?: boolean;
  /** Whether a number against its day's range would hold the day: a change that held a day is never re-learned on its
   * own (X7, Q-74), since the owner asked that deliberate changes pause until accepted. */
  held?: (range: NormalRange, value: number, distance: number) => boolean;
}

/** A break in what a number is learned from: the day it starts (`from`), and the last day it doesn't apply to yet
 * (`at`): an accepted level's own day, or the day a lasting change was found. */
interface Break {
  from: number;
  at: number;
  auto: boolean;
}

/**
 * Why a day has no range, for the words that say it isn't judged (ADR 0010 §1): a special day last year's history
 * doesn't have (`no last year`), one whose last year has moved too far to judge it by (`last year moved`), too few days
 * before it to learn from (`too few days`), a flow's recurring day with fewer than three of its days before it
 * (`too few times`), or a day past the history's end (`history ends`). `days` counts the days before it that have a
 * number; `special` names a special day or a recurring one.
 */
export interface NoRange {
  why: 'no last year' | 'last year moved' | 'too few days' | 'history ends' | 'too few times';
  days: number;
  special?: string;
  /** A flow's recurring day: how many of its days before the history has a number for (`too few times`). */
  times?: number;
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
  private readonly nameds = new Map<number, boolean>();
  private readonly occurringAt = new Map<number, boolean>();
  private readonly occurrencesAt = new Map<number, (Inner & { lift: number }) | null>();
  private readonly lastYears = new Map<number, number | null>();
  private readonly weeksAt = new Map<number, Inner | null>();
  private readonly yearAt = new Map<number, Inner | null>();
  private readonly ratioAt = new Map<number, number | null>();
  private readonly rangeAt = new Map<number, NormalRange | null>();
  private readonly outliers = new Map<number, boolean>();
  private readonly monthAt = new Map<number, Inner | null>();
  private readonly beforeAt = new Map<string, Inner | null>();
  private readonly stepAt = new Map<string, number | null>();
  private readonly underAt = new Map<string, Inner | null>();
  private readonly breakAtK = new Map<number, Break | null>();
  // Accepted levels' days; lasting changes found so far, and the last day looked at for them; the ranges they are found
  // from, which learn from accepted levels alone.
  private readonly accepted: number[];
  private readonly found: Break[] = [];
  private scanned = -1;
  private readonly base: NormalRanges | null;

  constructor(series: DailySeries, scale: Scale, options: NormalOptions = {}) {
    this.series = series;
    this.scale = scale;
    this.o = { weeks: 6, back: 10, half: 2, window: 42, z: 3, skip: new Set(), calendar: US_NYC_1, pattern: 'weekly', echoes: false, breaks: [], relearn: false, held: () => false, ...options };
    this.accepted = [...new Set(this.o.breaks)].map((d) => daysBetween(series.from, d)).sort((a, b) => a - b);
    this.base = this.o.relearn ? new NormalRanges(series, scale, { ...options, relearn: false }) : null;
  }

  /**
   * The break a day is judged after (ADR 0010 §5), as its first day: the latest accepted level that starts before it,
   * or lasting change found before it; null for none. Every guess for the day learns only from that day on.
   */
  private breakOf(k: number): Break | null {
    if (this.breakAtK.has(k)) return this.breakAtK.get(k)!;
    let b: Break | null = null;
    if (this.accepted.length || this.base) {
      for (const a of this.accepted) if (a < k && (b === null || a > b.from)) b = { from: a, at: a, auto: false };
      if (this.base) {
        this.detect(k - 1);
        for (const x of this.found) if (x.at < k && (b === null || x.from > b.from)) b = x;
      }
    }
    this.breakAtK.set(k, b);
    return b;
  }

  /** The day the level a day is judged against starts, when a break applies to it (ADR 0010 §5): `lasting()` reads it
   * so a number after a break is never called lasting against its old level. */
  breakAt(day: string): string | null {
    const b = this.breakOf(daysBetween(this.series.from, day));
    return b === null ? null : this.date(b.from);
  }

  /** The breaks found on their own so far, as days: each lasting change's first day and the day it was found. */
  relearned(to: string): { from: string; found: string }[] {
    if (!this.base) return [];
    this.detect(daysBetween(this.series.from, to));
    return this.found.filter((x) => x.auto).map((x) => ({ from: this.date(x.from), found: this.date(x.at) }));
  }

  /**
   * Lasting changes, found day by day up to `upTo` from the ranges that learn from accepted levels alone, so finding one
   * never depends on another found later: a day outside its range whose days before were outside it the same way (four
   * of the seven, or the same weekday twice running, as news.ts's `lasting()` says), back to the first day it was so;
   * once that has lasted 14 days, a break from that first day applies to the days after (ADR 0010 §5). Never for a
   * change any of whose days would have held (`held` on a day before it had lasted, X7), nor within 14 days of the last
   * break's first day (the same change, found again while the ranges learn it).
   */
  private detect(upTo: number): void {
    const base = this.base!;
    for (let t = this.scanned + 1; t <= upTo; t++) {
      this.scanned = t;
      const v = this.val(t);
      const r = v === null ? null : base.at(this.date(t));
      if (v === null || !r) continue;
      const way = base.place(r, v);
      if (way === 'within') continue;
      const so = (i: number): boolean => {
        const x = this.val(t - i);
        return x !== null && base.place(r, x) === way;
      };
      let n = 0;
      for (let i = 1; i <= 7; i++) n += so(i) ? 1 : 0;
      const daily = n >= 4;
      if (!daily && !(so(7) && so(14))) continue;
      let first = t;
      for (let i = daily ? 1 : 7, gap = 0; i <= 56 && gap < (daily ? 3 : 1); i += daily ? 1 : 7) {
        if (so(i)) (first = t - i), (gap = 0);
        else gap++;
      }
      if (t - first < 13) continue;
      const last = Math.max(-Infinity, ...this.accepted.filter((a) => a <= t), ...this.found.map((x) => x.from));
      if (first <= last + 13) continue;
      // A day held when its number would hold it and the change hadn't lasted yet: once it has, it is told as a note
      // (news.ts's `quiet`), which holds nothing.
      let held = false;
      for (let d = first; d <= t && !held; d++) {
        const x = this.val(d);
        const rd = x === null ? null : base.at(this.date(d));
        if (x === null || !rd || !this.o.held(rd, x, base.distance(rd, x))) continue;
        const w = base.place(rd, x);
        const was = (i: number) => {
          const y = this.val(d - i);
          return y !== null && base.place(rd, y) === w;
        };
        let m = 0;
        for (let i = 1; i <= 7; i++) m += was(i) ? 1 : 0;
        if (m < 4 && !(was(7) && was(14))) held = true;
      }
      if (!held) this.found.push({ from: first, at: t, auto: true });
    }
  }

  /** A day not learned from: a holiday or one around it, a day the flow's calendar names, or one left out. */
  private excluded(k: number): boolean {
    return this.named(k) || (this.o.skip.size > 0 && this.o.skip.has(this.date(k))) || this.outlier(k);
  }

  /**
   * A count far from the same weekday's over the three weeks before it (half as much again, or a third less: a feed
   * that stopped, part way or all day): not learned from, as data-observability tools leave the anomalies they find
   * out of what they learn. Its own day is judged as any other. With the echo fix (ADR 0010 §5), a share far from them
   * (0.6 on the logit) is not learned from either, so last year's oddities don't come back. Under the patterns `none`
   * and `monthly`, against the three periods before; after a break, only against days since it, so the new level is
   * never kept out.
   */
  private outlier(k: number): boolean {
    if (this.scale !== 'count' && !(this.scale === 'share' && this.o.echoes)) return false;
    let out = this.outliers.get(k);
    if (out === undefined) {
      const v = this.val(k);
      const b = this.breakOf(k + 1)?.from ?? -Infinity;
      // Against the same weekday's three weeks before; the patterns' own kind otherwise: the three periods before, or
      // the same day of the three months before.
      const near = this.o.pattern === 'weekly' ? [k - 7, k - 14, k - 21] : this.o.pattern === 'monthly' ? this.monthsBefore(k, 3) : [k - 1, k - 2, k - 3];
      const before = near.filter((j) => j >= b && !this.named(j)).flatMap((j) => (this.val(j) === null ? [] : [this.fwd(this.val(j)!)]));
      out = v !== null && before.length >= 2 && Math.abs(this.fwd(v) - median(before)) > (this.scale === 'count' ? Math.log(1.5) : 0.6);
      this.outliers.set(k, out);
    }
    return out;
  }

  private date(k: number): string {
    let d = this.dates.get(k);
    if (d === undefined) this.dates.set(k, (d = plusDays(this.series.from, k)));
    return d;
  }

  /** A day judged by last year's alone: a holiday, a flow's yearly day, or a day in a window. */
  private special(k: number): boolean {
    let s = this.specials.get(k);
    if (s === undefined) this.specials.set(k, (s = specialOf(this.date(k), this.o.calendar) !== undefined));
    return s;
  }

  /** A day the calendar names, never learned from as an ordinary day: a special day, a recurring day, or a date. */
  private named(k: number): boolean {
    let s = this.nameds.get(k);
    if (s === undefined) this.nameds.set(k, (s = isSpecial(this.date(k), this.o.calendar)));
    return s;
  }

  /** A flow's recurring day (or a day in its window) that recurs more often than yearly: judged against its occurrences. */
  private occurring(k: number): boolean {
    let s = this.occurringAt.get(k);
    if (s === undefined) this.occurringAt.set(k, (s = recurringOf(this.date(k), this.o.calendar) !== undefined));
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

  /**
   * The same weekday over the weeks before, holidays left out: their weighted median, the latest counting most. Under the
   * patterns `none` and `monthly`, the 6 to 14 ordinary periods before, whatever the weekday (ADR 0010 §3). After a break
   * (ADR 0010 §5), only the days since it: until three of the same weekday exist, any day since it, each moved by how
   * its weekday compared with this one's before the break.
   */
  private weeks(k: number): Inner | null {
    if (this.weeksAt.has(k)) return this.weeksAt.get(k)!;
    const b = this.breakOf(k);
    const out = b !== null ? this.weeksUnder(k, b.from) : this.o.pattern !== 'weekly' ? this.periods(k, -Infinity, 6) : this.sameWeekday(k, -Infinity, k);
    this.weeksAt.set(k, out);
    return out;
  }

  /** The weeks' guess for a day as if a break from `b` applied to it: the days since alone (`weeks`). What the miss
   * after a break is measured with, on every day since it. */
  private weeksUnder(k: number, b: number): Inner | null {
    const key = `${k}|${b}`;
    if (!this.underAt.has(key)) this.underAt.set(key, this.o.pattern !== 'weekly' ? this.periods(k, b, 1) : this.sameWeekday(k, b, k) ?? this.stepped(k, b));
    return this.underAt.get(key)!;
  }

  /** The same day of the month in the `n` months before (the last three days counted from the month's end), latest
   * first. */
  private monthsBefore(k: number, n: number): number[] {
    const day = this.date(k);
    const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
    const length = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const fromEnd = d > length(y, m) - 3 ? d - length(y, m) - 1 : 0;
    const out: number[] = [];
    for (let back = 1; back <= 12 && out.length < n; back++) {
      const mm = (((m - 1 - back) % 12) + 12) % 12 + 1;
      const yy = y + Math.floor((m - 1 - back) / 12);
      const dd = fromEnd ? length(yy, mm) + 1 + fromEnd : d;
      if (dd <= length(yy, mm)) out.push(daysBetween(this.series.from, `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`));
    }
    return out;
  }

  /**
   * Days on `k`'s weekday from `lo` (included) to `hi` (not), the latest first, holidays left out, six at most, looking
   * back `back` weeks from the first before `hi`: their weighted median; null with fewer than three, as a weekly pattern
   * needs three of its weeks to be seen.
   */
  private sameWeekday(k: number, lo: number, hi: number): Inner | null {
    const from: (Reference & { x: number })[] = [];
    // Weighted by place among the days used, not by weeks back: when holidays are left out, the latest left is no
    // likelier to be right, and no one day weighs more than a third, so one odd day never makes the median.
    const w0 = hi >= k ? 1 : Math.ceil((k - hi + 1) / 7);
    for (let w = w0; w < w0 + this.o.back && from.length < this.o.weeks; w++) {
      const j = k - 7 * w;
      if (j < lo) break;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) from.push({ day: this.date(j), value: v, weight: 0.5 ** (from.length / this.o.half), x: this.fwd(v) });
    }
    if (from.length < 3) return null;
    const total = from.reduce((t, r) => t + r.weight, 0);
    return { g: weightedMedian(from.map((r) => ({ v: r.x, w: r.weight }))), from: from.map((r) => ({ day: r.day, value: r.value, weight: r.weight / total })) };
  }

  /** The ordinary periods before `k` from `lo` on, the latest first, fourteen at most within 28 days: their weighted
   * median, the latest counting most; null with fewer than `least`. */
  private periods(k: number, lo: number, least: number): Inner | null {
    const from: (Reference & { x: number })[] = [];
    for (let i = 1; i <= 28 && from.length < 14; i++) {
      const j = k - i;
      if (j < lo) break;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) from.push({ day: this.date(j), value: v, weight: 0.5 ** (from.length / this.o.half), x: this.fwd(v) });
    }
    if (from.length < least) return null;
    const total = from.reduce((t, r) => t + r.weight, 0);
    return { g: weightedMedian(from.map((r) => ({ v: r.x, w: r.weight }))), from: from.map((r) => ({ day: r.day, value: r.value, weight: r.weight / total })) };
  }

  /** The weeks' guess for a day from the days before a break alone: how its weekday was before the level changed. */
  private before(k: number, b: number): Inner | null {
    const key = `${k}|${b}`;
    if (!this.beforeAt.has(key)) this.beforeAt.set(key, this.sameWeekday(k, -Infinity, b));
    return this.beforeAt.get(key)!;
  }

  /**
   * How far the days since a break are from what their weekdays were before it (ADR 0010 §5), on the guessing scale:
   * the weighted median of each day's number against its weekday's guess from before the break, the latest counting
   * most. Null when no day since it can be compared.
   */
  private step(k: number, b: number): number | null {
    const key = `${k}|${b}`;
    if (this.stepAt.has(key)) return this.stepAt.get(key)!;
    const lifts: { v: number; w: number }[] = [];
    for (let j = k - 1; j >= b && lifts.length < 14; j--) {
      const v = this.excluded(j) ? null : this.val(j);
      const old = v === null ? null : this.before(j, b);
      if (v !== null && old) lifts.push({ v: this.fwd(v) - old.g, w: 0.5 ** (lifts.length / this.o.half) });
    }
    const out = lifts.length ? weightedMedian(lifts) : null;
    this.stepAt.set(key, out);
    return out;
  }

  /** The weeks' guess just after a break: the day's weekday as it was before, moved by the step (`step`); with no
   * weekday to go by, the days since the break as they are. */
  private stepped(k: number, b: number): Inner | null {
    const old = this.before(k, b);
    const lift = this.step(k, b);
    const since = this.periods(k, b, 1);
    if (!since) return null;
    if (!old || lift === null) return since;
    return { g: old.g + lift, from: since.from };
  }

  /**
   * The same day of the month over the six months before (`monthly`, ADR 0010 §3): the month's last three days counted
   * from its end, so month-ends line up; their weighted median, the latest counting most. Three months at least. After
   * a break, only the months since it.
   */
  private month(k: number): Inner | null {
    if (this.monthAt.has(k)) return this.monthAt.get(k)!;
    const b = this.breakOf(k)?.from ?? -Infinity;
    const from: (Reference & { x: number })[] = [];
    for (const j of this.monthsBefore(k, 12)) {
      if (j < b || from.length >= 6) break;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) from.push({ day: this.date(j), value: v, weight: 0.5 ** (from.length / this.o.half), x: this.fwd(v) });
    }
    let out: Inner | null = null;
    if (from.length >= 3) {
      const total = from.reduce((t, r) => t + r.weight, 0);
      out = { g: weightedMedian(from.map((r) => ({ v: r.x, w: r.weight }))), from: from.map((r) => ({ day: r.day, value: r.value, weight: r.weight / total })) };
    }
    this.monthAt.set(k, out);
    return out;
  }

  /** How this year's ordinary days compared with the same weekdays a year before, over the weeks before: the median. */
  private ratio(k: number): number | null {
    if (this.ratioAt.has(k)) return this.ratioAt.get(k)!;
    const diffs: number[] = [];
    // After a break (ADR 0010 §5), a day before it is moved by the step, so last year's guess carries the new level.
    const brk = this.breakOf(k)?.from ?? null;
    let moved: number | null | undefined;
    for (let i = 1; i <= this.o.window; i++) {
      const [j, c] = [k - i, k - i - 364];
      if (this.excluded(j) || this.excluded(c)) continue;
      const [a, b] = [this.val(j), this.val(c)];
      if (a === null || b === null) continue;
      if (brk !== null && j < brk) {
        if (moved === undefined) moved = this.step(k, brk);
        if (moved === null) continue;
        diffs.push(this.fwd(a) + moved - this.fwd(b));
      } else diffs.push(this.fwd(a) - this.fwd(b));
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

  /**
   * The occurrences' guess, for a flow's recurring day (ADR 0010 §2): how far above (or below) a day like it each of its
   * last six days was, on the guessing scale (its number against the weeks' guess for its own weekday), weighted as the
   * weeks are, the latest counting most; their weighted median, added to the weeks' guess for this day. So a month-end
   * batch or a Patch Tuesday is judged against its own kind, moved by how the weeks before them compare. Three
   * occurrences at least.
   */
  private occurrences(k: number): (Inner & { lift: number }) | null {
    if (this.occurrencesAt.has(k)) return this.occurrencesAt.get(k)!;
    let out: (Inner & { lift: number }) | null = null;
    const here = this.weeks(k);
    if (here) {
      const from: (Reference & { lift: number })[] = [];
      for (const day of occurrencesBefore(this.date(k), this.o.calendar, 6)) {
        if (this.o.skip.size > 0 && this.o.skip.has(day)) continue;
        const j = daysBetween(this.series.from, day);
        const v = this.val(j);
        const w = v === null ? null : this.weeks(j);
        if (v !== null && w) from.push({ day, value: v, weight: 0.5 ** (from.length / this.o.half), lift: this.fwd(v) - w.g });
      }
      if (from.length >= 3) {
        const total = from.reduce((t, r) => t + r.weight, 0);
        const lift = weightedMedian(from.map((r) => ({ v: r.lift, w: r.weight })));
        out = { g: here.g + lift, lift, from: from.map((r) => ({ day: r.day, value: r.value, weight: r.weight / total })) };
      }
    }
    this.occurrencesAt.set(k, out);
    return out;
  }

  /** Each ordinary day of the window before a day: its number, and what each guess said of it. */
  private misses(k: number): { i: number; x: number; w: number | null; y: number | null; m: number | null }[] {
    const out: { i: number; x: number; w: number | null; y: number | null; m: number | null }[] = [];
    const monthly = this.o.pattern === 'monthly';
    for (let i = 1; i <= this.o.window; i++) {
      const j = k - i;
      const v = this.excluded(j) ? null : this.val(j);
      if (v !== null) out.push({ i, x: this.fwd(v), w: this.weeks(j)?.g ?? null, y: this.year(j)?.g ?? null, m: monthly ? (this.month(j)?.g ?? null) : null });
    }
    return out;
  }

  /**
   * How a guess misses days like this one: the larger of its typical miss over the window's ordinary days and over
   * those on the same weekday. A guess can do well on weekdays and badly on Saturdays, as last year's does when a
   * weekend surcharge has come in since; a typical miss over every day would hide it.
   */
  private missOf(ms: ReturnType<NormalRanges['misses']>, pick: (m: { w: number | null; y: number | null; m: number | null }) => number | null): number | null {
    const all = ms.flatMap((m) => (pick(m) === null ? [] : [m.x - pick(m)!]));
    if (all.length < Math.ceil(this.o.window / 4)) return null;
    const same = ms.flatMap((m) => (m.i % 7 !== 0 || pick(m) === null ? [] : [m.x - pick(m)!]));
    return same.length >= 3 ? Math.max(typical(all), typical(same)) : typical(all);
  }

  private guess(by: Guess['by'], inner: Inner, weight: number, miss: number | null): Guess {
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
    const recurring = k < 0 ? undefined : recurringOf(day, this.o.calendar);
    if (recurring && !this.weeks(k)) return { why: 'too few days', days, special: recurring.name };
    if (recurring) {
      const times = occurrencesBefore(day, this.o.calendar, 6).filter((d) => !this.o.skip.has(d) && this.value(d) !== null).length;
      return times < 3 ? { why: 'too few times', days, special: recurring.name, times } : { why: 'too few days', days, special: recurring.name };
    }
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
    if (this.occurring(k)) return this.occurrenceRange(k);
    const W = this.weeks(k);
    if (!W && !Y) return null;
    const ms = this.misses(k);
    // After a break (ADR 0010 §5), while the window reaches back before it (or before the day a lasting change was
    // found): the weeks' guess since the break alone, last year's left out; its miss measured on the days since, each
    // guessed as if the break applied to it; until a quarter of the window is since it, the miss from before.
    const brk = this.breakOf(k);
    const since = brk === null ? {} : { since: this.date(brk.from) };
    if (brk !== null && k - Math.max(brk.from, brk.at) < this.o.window) {
      if (!W) return null;
      const after: number[] = [];
      for (let j = brk.from; j < k; j++) {
        const v = this.excluded(j) ? null : this.val(j);
        const g = v === null ? null : this.weeksUnder(j, brk.from);
        if (v !== null && g) after.push(this.fwd(v) - g.g);
      }
      const s = after.length >= least ? typical(after) : this.borrowed(brk.from);
      if (s === null) return null;
      return this.range(k, W.g, s, [this.guess('weeks', W, 1, s)], after.length >= least ? after.length : 0, 'weeks', since);
    }
    if (this.o.pattern === 'monthly') return this.monthlyRange(k, W, Y, ms, since);
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
    return this.range(k, centre, typical(eC), guesses, eC.length, 'weeks', since);
  }

  /** The typical miss just before a break: its own day's range's, else the nearest ordinary day's in the week before. */
  private borrowed(b: number): number | null {
    for (let j = b; j >= b - 7; j--) {
      const r = this.at(this.date(j));
      if (r && !r.special) return r.spread;
    }
    return null;
  }

  /**
   * `monthly` (ADR 0010 §3): the periods before, the same day of the month and last year, combined as the weeks and last
   * year are (Bates and Granger: each by the inverse of its squared typical miss, the larger of its miss over the window
   * and on the same day of the months before), a guess that misses by more than three times the best left out, none
   * counting less than a tenth.
   */
  private monthlyRange(k: number, W: Inner | null, Y: Inner | null, ms: ReturnType<NormalRanges['misses']>, extra: Partial<NormalRange>): NormalRange | null {
    const least = Math.ceil(this.o.window / 4);
    const M = this.month(k);
    type Pick = (m: { w: number | null; y: number | null; m: number | null }) => number | null;
    const all: { by: Guess['by']; g: Inner; s: number; pick: Pick }[] = [];
    // How each guess did on the same day of the months before, as well as over the window: the periods before can do
    // well on most days and badly on the 1st and the 15th, as the weeks can on Saturdays (`missOf`).
    const same = (M?.from ?? []).flatMap((r) => {
      const j = daysBetween(this.series.from, r.day);
      return [{ x: this.fwd(r.value), w: this.weeks(j)?.g ?? null, m: this.month(j)?.g ?? null, y: this.year(j)?.g ?? null }];
    });
    for (const [by, g, pick] of [['weeks', W, (m) => m.w], ['month', M, (m) => m.m], ['year', Y, (m) => m.y]] as [Guess['by'], Inner | null, Pick][]) {
      const miss = g ? this.missOf(ms, pick) : null;
      const onSame = same.flatMap((m) => (pick(m) === null ? [] : [m.x - pick(m)!]));
      if (g && miss !== null) all.push({ by, g, s: onSame.length >= 3 ? Math.max(miss, typical(onSame)) : miss, pick });
    }
    if (!all.length) return null;
    const best = Math.min(...all.map((x) => x.s));
    const kept = all.filter((x) => !broken(x.s, best));
    const inv = kept.map((x) => (best === 0 ? (x.s === 0 ? 1 : 0) : 1 / x.s ** 2));
    const t = inv.reduce((a, b) => a + b, 0);
    const floored = inv.map((x) => Math.max(0.1, x / t));
    const ws = floored.map((x) => x / floored.reduce((a, b) => a + b, 0));
    const centre = kept.reduce((c, x, i) => c + ws[i]! * x.g.g, 0);
    const eC = ms.flatMap((m) => (kept.some((x) => x.pick(m) === null) ? [] : [m.x - kept.reduce((c, x, i) => c + ws[i]! * x.pick(m)!, 0)]));
    if (eC.length < least) return null;
    return this.range(k, centre, typical(eC), kept.map((x, i) => this.guess(x.by, x.g, ws[i]!, x.s)), eC.length, 'weeks', extra);
  }

  /**
   * A recurring day's range: the occurrences' guess, give or take three typical misses: that guess's own on the
   * occurrences before (each guessed from its own, three of them at least), and never less than the weeks' guess
   * misses ordinary days by, since a few occurrences can agree by chance. Without three misses to measure, the ordinary
   * days' alone, and the range is rough.
   */
  private occurrenceRange(k: number): NormalRange | null {
    const O = this.occurrences(k);
    if (!O) return null;
    const misses: number[] = [];
    for (const r of O.from) {
      const j = daysBetween(this.series.from, r.day);
      const g = this.occurrences(j);
      if (g) misses.push(this.fwd(r.value) - g.g);
    }
    const ms = this.misses(k);
    const sW = this.missOf(ms, (m) => m.w);
    const sO = misses.length >= 3 ? typical(misses) : null;
    if (sW === null && sO === null) return null;
    const s = Math.max(sW ?? 0, sO ?? 0);
    const guess: Guess = { by: 'occurrences', value: this.back(O.g), weight: 1, miss: s, from: O.from, lift: this.scale === 'count' ? Math.exp(O.lift) : this.back(O.g) - this.back(O.g - O.lift) };
    const special = recurringOf(this.date(k), this.o.calendar)!.name;
    return this.range(k, O.g, s, [guess], sO !== null ? misses.length : ms.length, sO !== null ? 'occurrences' : 'ordinary days', { special, ...(sO === null ? { rough: true } : {}) });
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
