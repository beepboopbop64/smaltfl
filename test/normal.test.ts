/**
 * Holidays, and a day's normal range from the days before it: the weeks before and its day last year, weighted by
 * how well each has been guessing, give or take three typical misses. On made-up days whose pattern is known.
 */
import { describe, expect, it } from 'vitest';
import { dayLastYear, holidayOf, holidaysOf, isSpecial, NONE, plusDays, seasonOf } from '../src/core/calendar.js';
import { HistoryRanges, seriesOf, type HistoryFile } from '../src/core/history.js';
import { NormalRanges, type DailySeries } from '../src/core/normal.js';
import { random } from '../src/core/quality.js';

const FROM = '2021-10-01';
const TO = '2024-01-31';
const span = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
};
const DAYS = span(FROM, TO);
const normal = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
// Mondays light, weekends busy; a slow climb, a yearly swell; holidays and Christmas week lighter.
const WEEKDAY = [0.9, 0.85, 0.95, 1, 1.05, 1.08, 1.1];
const truth = (day: string) => {
  const t = DAYS.indexOf(day);
  const doy = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${day.slice(0, 4)}-01-01T00:00:00Z`)) / 864e5;
  const base = 90_000 * (1 + 0.1 * (t / 365)) * (1 + 0.08 * Math.sin((2 * Math.PI * (doy - 80)) / 365));
  const wd = WEEKDAY[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
  return base * wd * (holidayOf(day) ? 0.7 : seasonOf(day) ? 0.8 : 1);
};
const trips = (noise = 0.03, seed = 7): DailySeries => {
  const rnd = random(seed);
  return { from: FROM, values: DAYS.map((d) => Math.round(truth(d) * Math.exp(noise * normal(rnd)))) };
};
const at = (s: DailySeries, day: string, v: number): DailySeries => ({ from: s.from, values: s.values.map((x, k) => (DAYS[k] === day ? v : x)) });

describe('holidays', () => {
  it('fall where the calendar puts them, a weekend one observed on the Friday before or the Monday after', () => {
    const named = (y: number) => Object.fromEntries([...holidaysOf(y)].map(([d, n]) => [n, d]));
    expect(named(2024)).toMatchObject({ "New Year's Day": '2024-01-01', 'Martin Luther King Jr. Day': '2024-01-15', "Presidents' Day": '2024-02-19', 'Memorial Day': '2024-05-27', 'Labor Day': '2024-09-02', Thanksgiving: '2024-11-28', 'Day after Thanksgiving': '2024-11-29' });
    expect(named(2023)).toMatchObject({ 'Martin Luther King Jr. Day': '2023-01-16', "New Year's Day (observed)": '2023-01-02', 'Columbus Day': '2023-10-09', 'Veterans Day (observed)': '2023-11-10', Thanksgiving: '2023-11-23' });
    expect(named(2022)).toMatchObject({ 'Juneteenth (observed)': '2022-06-20', 'Christmas Day (observed)': '2022-12-26' });
    // New Year's Day 2022 fell on a Saturday: its observed day is New Year's Eve, which keeps its own name.
    expect(holidayOf('2021-12-31')).toBe("New Year's Eve");
    expect(named(2022)["New Year's Day (observed)"]).toBeUndefined();
    expect([holidayOf('2024-01-08'), isSpecial('2024-01-08'), isSpecial('2023-12-27'), isSpecial('2024-01-04')]).toEqual([undefined, false, true, false]);
  });

  it('have windows around them, as a forecast’s holidays do: no holidays, but no ordinary days either', () => {
    expect(['2023-12-23', '2023-12-27', '2024-01-02', '2024-01-03'].map((d) => seasonOf(d))).toEqual(Array(4).fill('Holiday season'));
    expect([seasonOf('2023-12-25'), seasonOf('2024-01-01'), seasonOf('2024-01-04'), seasonOf('2023-12-22')]).toEqual([undefined, undefined, undefined, undefined]);
    expect([seasonOf('2023-07-01'), seasonOf('2023-07-07'), seasonOf('2023-07-04'), seasonOf('2023-07-08')]).toEqual(['Independence Day week', 'Independence Day week', undefined, undefined]);
    expect([seasonOf('2023-11-22'), seasonOf('2023-11-25'), seasonOf('2023-11-26'), seasonOf('2023-11-27')]).toEqual(['Day before Thanksgiving', 'Thanksgiving weekend', 'Thanksgiving weekend', undefined]);
    expect([seasonOf('2023-05-27'), seasonOf('2023-05-28'), seasonOf('2023-09-02'), seasonOf('2023-09-03')]).toEqual(['Memorial Day weekend', 'Memorial Day weekend', 'Labor Day weekend', 'Labor Day weekend']);
  });

  it('give a day its day last year: the same holiday, the same date in Christmas week, else 52 weeks back', () => {
    expect(dayLastYear('2024-01-01')).toBe('2023-01-01');
    expect(dayLastYear('2024-01-15')).toBe('2023-01-16');
    expect(dayLastYear('2024-01-08')).toBe('2023-01-09');
    // Christmas week: the same weekday in last year's, the observed Christmas Day of 2022 left out.
    expect(dayLastYear('2023-12-27')).toBe('2022-12-28');
    expect(dayLastYear('2023-12-26')).toBe('2022-12-27');
    expect(dayLastYear('2023-12-30')).toBe('2022-12-30');
    // 52 weeks before Thursday 2024-11-21 was Thanksgiving: the week after it instead.
    expect(dayLastYear('2024-11-21')).toBe('2023-11-30');
    // A day around a holiday: last year's same day of its window, on the same weekday.
    expect(dayLastYear('2024-01-02')).toBe('2023-01-03');
    expect(dayLastYear('2023-11-25')).toBe('2022-11-26');
    expect(dayLastYear('2023-11-22')).toBe('2022-11-23');
    expect(dayLastYear('2023-07-05')).toBe('2022-07-06');
    expect(dayLastYear('2023-05-27')).toBe('2022-05-28');
    // A weekend holiday's observed day: last year's observed day, else the holiday itself.
    expect(dayLastYear('2023-11-10')).toBe('2022-11-11');
    expect(dayLastYear('2023-01-02')).toBe('2022-01-01');
  });
});

describe('normal ranges', () => {
  it('guess an ordinary day from the same weekday in the weeks before and from its day last year', () => {
    const s = trips();
    const n = new NormalRanges(s, 'count');
    const r = n.at('2024-01-08')!;
    expect(r.special).toBeUndefined();
    expect(r.guesses.map((g) => g.by)).toEqual(['weeks', 'year']);
    expect(r.guesses.reduce((t, g) => t + g.weight, 0)).toBeCloseTo(1, 9);
    // Six Mondays, New Year's Day and Christmas Day left out; the latest counts most.
    const weeks = r.guesses[0]!;
    expect(weeks.from.map((x) => x.day)).toEqual(['2023-12-18', '2023-12-11', '2023-12-04', '2023-11-27', '2023-11-20', '2023-11-13']);
    expect(weeks.from[0]!.weight).toBeGreaterThan(weeks.from[1]!.weight);
    // Last year's Monday 52 weeks back; the weeks either side were holidays.
    expect(r.guesses[1]!.from.map((x) => x.day)).toEqual(['2023-01-09']);
    expect(n.at('2024-01-24')!.guesses.find((g) => g.by === 'year')!.from.map((x) => x.day)).toEqual(['2023-01-18', '2023-01-25', '2023-02-01']);
    // The climb over the year: this year's days are about a tenth above last year's.
    expect(r.guesses[1]!.ratio).toBeGreaterThan(1.05);
    expect(r.guesses[1]!.ratio).toBeLessThan(1.16);
    expect(r.low).toBeLessThan(truth('2024-01-08'));
    expect(r.high).toBeGreaterThan(truth('2024-01-08'));
    expect(Math.abs(r.expected / truth('2024-01-08') - 1)).toBeLessThan(0.06);
    expect(n.place(r, s.values[DAYS.indexOf('2024-01-08')]!)).toBe('within');
  });

  it('judge a holiday by last year’s holiday alone, give or take how well that did on last year’s holidays', () => {
    const s = trips();
    const n = new NormalRanges(s, 'count');
    const r = n.at('2024-01-01')!;
    expect(r.special).toBe("New Year's Day");
    expect(r.guesses.map((g) => [g.by, g.weight, g.from[0]!.day])).toEqual([['year', 1, '2023-01-01']]);
    expect(r.spreadFrom).toBe('holidays');
    expect(r.over).toBeGreaterThanOrEqual(5);
    const v = s.values[DAYS.indexOf('2024-01-01')]!;
    expect(n.place(r, v)).toBe('within');
    // Against an ordinary Monday's range, the holiday's lighter day would be out of it.
    expect(n.place(n.at('2024-01-08')!, v)).toBe('below');
  });

  it('move a holiday on a date to this year’s weekday', () => {
    const s = trips();
    const n = new NormalRanges(s, 'count');
    // Christmas Eve 2023 was a Sunday, 2022's a Saturday: moved by how Sundays compare with Saturdays lately.
    const r = n.at('2023-12-24')!;
    const g = r.guesses[0]!;
    expect(g.from[0]!.day).toBe('2022-12-24');
    expect(g.weekday!.from).toBe(6);
    expect(g.weekday!.to).toBe(0);
    expect(g.weekday!.by).toBeGreaterThan(0.75);
    expect(g.weekday!.by).toBeLessThan(0.89);
    expect(n.place(r, s.values[DAYS.indexOf('2023-12-24')]!)).toBe('within');
    // Thanksgiving is a Thursday every year: nothing to move.
    expect(n.at('2023-11-23')!.guesses[0]!.weekday).toBeUndefined();
  });

  it('hold nearly every ordinary day of a year, and catch a day a quarter off', () => {
    const s = trips();
    const n = new NormalRanges(s, 'count');
    const b = n.backtest('2023-01-01', '2023-12-31');
    expect(b.ordinary.days).toBeGreaterThan(300);
    // Three typical misses either way: a few days in a hundred out of range, from noise alone.
    expect(b.ordinary.outside / b.ordinary.days).toBeLessThan(0.03);
    expect(b.special.days).toBeGreaterThan(15);
    expect(b.special.outside / b.special.days).toBeLessThan(0.1);
    const day = '2023-10-18';
    const v = s.values[DAYS.indexOf(day)]!;
    const high = new NormalRanges(at(s, day, v * 1.25), 'count');
    const low = new NormalRanges(at(s, day, v * 0.78), 'count');
    expect(high.place(high.at(day)!, v * 1.25)).toBe('above');
    expect(low.place(low.at(day)!, v * 0.78)).toBe('below');
  });

  it('never let a day into its own range', () => {
    const s = trips();
    const day = '2023-10-18';
    const a = new NormalRanges(s, 'count').at(day)!;
    const b = new NormalRanges(at(s, day, 1), 'count').at(day)!;
    expect(b).toEqual(a);
  });

  it('weigh each guess by how well it has been doing', () => {
    // Last year's days are noise: the weeks before should count most.
    const rnd = random(3);
    const s = trips();
    const noisy: DailySeries = { from: FROM, values: s.values.map((v, k) => (DAYS[k]! < '2023-01-01' ? Math.round(50_000 + 100_000 * rnd()) : v)) };
    const r = new NormalRanges(noisy, 'count').at('2023-11-15')!;
    expect(r.guesses.find((g) => g.by === 'weeks')!.weight).toBeGreaterThan(0.7);
    // Every four weeks the level jumps, and the same four weeks last year jumped the same way: last year's guess should
    // count most.
    const jump = random(5);
    const lifts = Array.from({ length: 13 }, () => Math.exp(0.15 * normal(jump)));
    const yearly: DailySeries = { from: FROM, values: DAYS.map((d, k) => Math.round(truth(d) * lifts[Math.floor(k / 28) % 13]!)) };
    const y = new NormalRanges(yearly, 'count').at('2023-11-15')!;
    expect(y.guesses.find((g) => g.by === 'year')!.weight).toBeGreaterThan(0.7);
  });

  it('take a share of none as none, on a logit scale', () => {
    const none: DailySeries = { from: FROM, values: DAYS.map(() => 0) };
    const n = new NormalRanges(none, 'share');
    const r = n.at('2023-06-14')!;
    expect([r.expected, r.low, r.high]).toEqual([0, 0, 0]);
    expect(n.place(r, 0)).toBe('within');
    expect(n.place(r, 0.01)).toBe('above');
  });

  it('have no range without three weeks before, or last year’s day for a holiday', () => {
    const s = trips();
    const n = new NormalRanges(s, 'count');
    expect(n.at('2021-10-15')).toBeNull();
    // Thanksgiving 2021: no year before it here.
    expect(n.at('2021-11-25')).toBeNull();
    expect(n.at('2021-12-01')).not.toBeNull();
  });
});

describe('the history', () => {
  // Three days, the middle one not measured.
  const file: HistoryFile = {
    format: 'smaltfl-history/2', built: '2024-02-01T00:00:00Z', flow: 'f', step: 'trips_valid',
    rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }, { name: 'passengers', check: 'passenger_count IS NOT NULL', onFail: 'warn' }],
    columns: ['fare_amount', 'passenger_count'], types: ['real', 'int'], kinds: ['measure', 'code'], sample: 2000,
    days: ['2024-01-01', '2024-01-03'], rows: [100, 200], dropped: [5, 4], failed: [[5, 10], [4, 40]], present: [[100, 90], [200, 160]], p50: [[12.5, 1], [13, 1]],
    missing: [{ day: '2024-01-02', error: 'unreadable' }],
    quantiles: [[[1, 5, 8, 12.5, 18, 30, 60], null], [[1, 5, 8, 13, 18, 30, 60], null]], hours: [new Array(24).fill(4), new Array(24).fill(8)], warmup: 0,
    values: {}, pairs: {},
  };

  it('gives each number a day, with a gap for a day not measured', () => {
    expect(seriesOf(file, { of: 'trips' })).toEqual({ from: '2024-01-01', values: [100, null, 200] });
    expect(seriesOf(file, { of: 'dropped' })!.values).toEqual([0.05, null, 0.02]);
    expect(seriesOf(file, { of: 'rule', name: 'passengers' })!.values).toEqual([0.1, null, 0.2]);
    expect(seriesOf(file, { of: 'missing', column: 'passenger_count' })!.values.map((x) => (x === null ? x : Number(x.toFixed(9))))).toEqual([0.1, null, 0.2]);
    expect(seriesOf(file, { of: 'median', column: 'fare_amount' })!.values).toEqual([12.5, null, 13]);
    expect(seriesOf(file, { of: 'rule', name: 'nothing' })).toBeNull();
  });

  it('knows the checks it counted, and which medians vary', () => {
    const h = new HistoryRanges(file);
    expect(h.sameChecks(file.rules)).toBe(true);
    expect(h.sameChecks([file.rules[0]!])).toBe(false);
    expect(h.sameChecks([file.rules[0]!, { ...file.rules[1]!, onFail: 'drop' }])).toBe(false);
    expect([h.medians('fare_amount'), h.medians('passenger_count'), h.medians('nothing')]).toEqual([2, 1, 0]);
    expect([h.from, h.to]).toEqual(['2024-01-01', '2024-01-03']);
    expect(h.of({ of: 'trips' })!.scale).toBe('count');
    expect(h.of({ of: 'dropped' })!.scale).toBe('share');
  });
});

describe('patterns, breaks and re-learning (ADR 0010 §3, §5, phase 3)', () => {
  // A flat feed with a little noise: no weekday effect, no year.
  const flat = (f: (day: string, k: number) => number, noise = 0.02, seed = 11): DailySeries => {
    const rnd = random(seed);
    return { from: FROM, values: DAYS.map((d, k) => f(d, k) * Math.exp(noise * normal(rnd))) };
  };
  const within = (r: NormalRanges, d: string) => r.place(r.at(d)!, r.value(d)!) === 'within';
  const outsideFrom = (r: NormalRanges, from: string, n: number) => span(from, plusDays(from, n - 1)).filter((d) => r.at(d) && !within(r, d)).length;

  it('none: the periods before whatever the weekday, catching up with a change in days where weekly takes weeks', () => {
    // In the history's first year, with no last year to slow either.
    const STEP = '2022-05-04';
    const s = flat((d) => (d >= STEP ? 13_000 : 10_000));
    const none = new NormalRanges(s, 'count', { calendar: NONE, pattern: 'none' });
    const weekly = new NormalRanges(s, 'count', { calendar: NONE });
    // A step of +30% (an outlier for a count) is learned once the three periods before it are at the new level.
    expect(outsideFrom(none, STEP, 30)).toBeLessThanOrEqual(5);
    expect(outsideFrom(weekly, STEP, 30)).toBeGreaterThanOrEqual(14);
    const r = none.at('2022-06-15')!;
    expect(r.guesses[0]!.by).toBe('weeks');
    expect(r.guesses.find((g) => g.by === 'weeks')!.from.map((f) => f.day).slice(0, 3)).toEqual(['2022-06-14', '2022-06-13', '2022-06-12']);
    // Six periods at least: none for the history's first days.
    expect(none.at(plusDays(FROM, 5))).toBeNull();
    expect(none.at(plusDays(FROM, 20))).not.toBeNull();
  });

  it('monthly: the same day of the month as well, the month-end counted from its end', () => {
    // Payroll: the 1st and the 15th at 1.5×, the last day at 1.4×.
    const pay = (d: string) => (d.endsWith('-01') || d.endsWith('-15') ? 1.5 : plusDays(d, 1).endsWith('-01') ? 1.4 : 1);
    const s = flat((d) => 10_000 * pay(d), 0.02, 5);
    const monthly = new NormalRanges(s, 'count', { calendar: NONE, pattern: 'monthly' });
    const none = new NormalRanges(s, 'count', { calendar: NONE, pattern: 'none' });
    const paydays = span('2023-03-01', '2023-12-31').filter((d) => pay(d) > 1);
    expect(paydays.filter((d) => !within(monthly, d)).length).toBeLessThanOrEqual(2);
    expect(paydays.filter((d) => !within(none, d)).length).toBeGreaterThanOrEqual(paydays.length - 3);
    const r = monthly.at('2023-10-31')!;
    expect(r.guesses.map((g) => g.by)).toContain('month');
    expect(r.guesses.find((g) => g.by === 'month')!.from.map((f) => f.day).slice(0, 3)).toEqual(['2023-09-30', '2023-08-31', '2023-07-31']);
  });

  it('a level accepted on its first day: the next day is judged against it, not the three weeks before', () => {
    const STEP = '2023-05-03';
    const s = trips(0.03, 7);
    const stepped: DailySeries = { from: s.from, values: s.values.map((v, k) => (DAYS[k]! >= STEP ? Math.round(v! * 1.6) : v)) };
    const plain = new NormalRanges(stepped, 'count');
    const accepted = new NormalRanges(stepped, 'count', { breaks: [STEP] });
    // Unaccepted, +60% is outside its range for about three weeks; accepted, only on its own day.
    expect(outsideFrom(plain, STEP, 23)).toBeGreaterThanOrEqual(20);
    expect(outsideFrom(accepted, STEP, 23)).toBe(1);
    expect(accepted.at(plusDays(STEP, 1))).toMatchObject({ since: STEP });
    expect(accepted.breakAt(plusDays(STEP, 1))).toBe(STEP);
    expect(accepted.breakAt(STEP)).toBeNull();
    // The days before the break keep their ranges: a break never changes a day before it.
    expect(accepted.at('2023-05-01')).toEqual(plain.at('2023-05-01'));
    // Each weekday keeps its own level: a Saturday after the step is judged as a Saturday, at the new level.
    const sat = accepted.at('2023-05-06')!;
    expect(sat.expected / plain.at('2023-04-29')!.expected).toBeGreaterThan(1.45);
    // Once three of a weekday are since the break, its own; once a quarter of the window is, its own miss.
    expect(accepted.at('2023-05-31')!.guesses.find((g) => g.by === 'weeks')!.from.every((f) => f.day >= STEP)).toBe(true);
    // Weeks on, last year's guess carries the new level too.
    const late = accepted.at('2023-07-12')!;
    expect(late.guesses.find((g) => g.by === 'year')?.value ?? late.expected).toBeGreaterThan(1.4 * plain.at('2023-04-12')!.expected);
  });

  it('the echo fix: a share far from the same weekday’s three weeks before is not learned from', () => {
    // A share near 40%, one Tuesday at 60%; a year on, last year's guess for that Tuesday's neighbours.
    const ODD = '2022-11-08';
    const s = flat((d) => (d === ODD ? 0.6 : 0.4), 0.01, 3);
    const echo = new NormalRanges(s, 'share');
    const fixed = new NormalRanges(s, 'share', { echoes: true });
    const year = (r: NormalRanges, d: string) => r.at(d)!.guesses.find((g) => g.by === 'year')!.from.map((f) => f.day);
    expect(year(echo, '2023-11-07')).toContain(ODD);
    expect(year(fixed, '2023-11-07')).not.toContain(ODD);
    // Off, the legacy form's shares are as they were.
    expect(new NormalRanges(s, 'share', { echoes: false }).at('2023-11-07')).toEqual(echo.at('2023-11-07'));
  });

  it('re-learns on its own a change told as a note that has lasted 14 days, and then sees a second change', () => {
    // A share climbs from 30% to 50% over a month, then stays; three weeks later it falls 10 points.
    const RAMP = '2023-03-01';
    const FALL = '2023-04-19';
    const share = (d: string) => {
      const t = Math.max(0, Math.min(1, (Date.parse(d) - Date.parse(RAMP)) / (30 * 864e5)));
      return (0.3 + 0.2 * t) - (d >= FALL ? 0.1 : 0);
    };
    const s = flat(share, 0.01, 9);
    // The climb is ten points off its day's range once it has lasted, when it is told as a note: it holds no day.
    const held = (r: { expected: number }, v: number, d: number) => Math.abs(d) >= 4 && Math.abs(v - r.expected) >= 0.1;
    const relearn = new NormalRanges(s, 'share', { echoes: true, relearn: true, held });
    const blind = new NormalRanges(s, 'share', { echoes: true });
    const found = relearn.relearned('2023-06-30');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0]!.from >= RAMP && found[0]!.from < '2023-04-01').toBe(true);
    expect(found[0]!.found >= plusDays(found[0]!.from, 13)).toBe(true);
    expect(relearn.at(FALL)!.since).toBe(found[0]!.from);
    // The second change: told by the ranges that re-learned, missed by those still blind from the climb.
    expect(within(relearn, FALL)).toBe(false);
    expect(within(blind, FALL)).toBe(true);
  });

  it('never re-learns on its own a change that held a day (X7): a +60% step not accepted stays outside', () => {
    const STEP = '2023-05-03';
    const s = flat((d) => (d >= STEP ? 16_000 : 10_000), 0.02, 4);
    const held = (r: { expected: number }, v: number, d: number) => v < 0.1 * r.expected || Math.abs(d) >= 6;
    const r = new NormalRanges(s, 'count', { calendar: NONE, relearn: true, held });
    expect(r.relearned('2023-07-01')).toEqual([]);
    expect(outsideFrom(r, STEP, 23)).toBeGreaterThanOrEqual(20);
    // Told as a note, never held, the same step is re-learned once it has lasted 14 days.
    const never = new NormalRanges(s, 'count', { calendar: NONE, relearn: true, held: () => false });
    expect(never.relearned('2023-07-01').map((x) => x.from)).toEqual([STEP]);
    expect(outsideFrom(never, STEP, 23)).toBeLessThan(outsideFrom(r, STEP, 23));
  });
});
