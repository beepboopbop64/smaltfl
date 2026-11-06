/**
 * The days the trips are known to differ on, and a day's day last year to compare it with. A day is `YYYY-MM-DD`, a
 * date in New York, as the trip records give it. Holidays are the US federal ones (with the weekday a weekend holiday
 * is observed on), Christmas Eve, New Year's Eve and the day after Thanksgiving. Around some of them are days that are
 * no holidays but no ordinary days either, as a holiday's window in forecasting has it: the holiday season from
 * December 23 to January 3, the week of July 4th, the day before Thanksgiving and the weekend after it, and the
 * weekends before Memorial Day and Labor Day. No DOM, no engine.
 */

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

/** The day `n` days after `day` (before it, for a negative `n`). */
export function plusDays(day: string, n: number): string {
  return iso(new Date(dateOf(day).getTime() + n * 864e5));
}

/** Days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / 864e5);
}

/** A month's `n`-th weekday (0 is Sunday), or its last for `n` = -1. */
function nth(y: number, m: number, weekday: number, n: number): Date {
  if (n < 0) {
    const last = utc(y, m + 1, 0);
    return utc(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
  }
  const first = utc(y, m, 1);
  return utc(y, m, 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (n - 1));
}

const years = new Map<number, Map<string, string>>();

/** A year's holidays, each day with its name. */
export function holidaysOf(y: number): ReadonlyMap<string, string> {
  let out = years.get(y);
  if (out) return out;
  out = new Map<string, string>();
  const put = (d: Date, name: string) => {
    if (d.getUTCFullYear() === y && !out!.has(iso(d))) out!.set(iso(d), name);
  };
  // Federal holidays on a date, observed on the Friday before a Saturday and the Monday after a Sunday; Juneteenth
  // since 2021.
  const fixed: [number, number, string][] = [[1, 1, "New Year's Day"], [6, 19, 'Juneteenth'], [7, 4, 'Independence Day'], [11, 11, 'Veterans Day'], [12, 25, 'Christmas Day']];
  const dated = fixed.filter(([m]) => m !== 6 || y >= 2021);
  for (const [m, d, name] of dated) put(utc(y, m, d), name);
  put(nth(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  put(nth(y, 2, 1, 3), "Presidents' Day");
  put(nth(y, 5, 1, -1), 'Memorial Day');
  put(nth(y, 9, 1, 1), 'Labor Day');
  put(nth(y, 10, 1, 2), 'Columbus Day');
  const thanksgiving = nth(y, 11, 4, 4);
  put(thanksgiving, 'Thanksgiving');
  put(new Date(thanksgiving.getTime() + 864e5), 'Day after Thanksgiving');
  put(utc(y, 12, 24), 'Christmas Eve');
  put(utc(y, 12, 31), "New Year's Eve");
  // Observed days last: a day that is a holiday of its own keeps its name (New Year's Eve, not New Year's Day observed).
  // Next year's New Year's Day on a Saturday is observed on this year's last day.
  for (const [m, d, name] of dated) {
    for (const year of [y, y + 1]) {
      const at = utc(year, m, d);
      const wd = at.getUTCDay();
      if (wd === 6) put(new Date(at.getTime() - 864e5), `${name} (observed)`);
      if (wd === 0) put(new Date(at.getTime() + 864e5), `${name} (observed)`);
    }
  }
  years.set(y, out);
  return out;
}

/** A day's holiday, if it is one. */
export function holidayOf(day: string): string | undefined {
  return holidaysOf(Number(day.slice(0, 4))).get(day);
}

/**
 * The window around a holiday that a day is in, if it is no holiday itself: the holiday season (December 23 to January
 * 3), Independence Day week (July 1 to 7), the day before Thanksgiving, Thanksgiving weekend (the Saturday and Sunday
 * after it), and the weekends before Memorial Day and Labor Day.
 */
export function seasonOf(day: string): string | undefined {
  if (holidayOf(day) !== undefined) return undefined;
  const md = day.slice(5);
  if (md >= '12-23' || md <= '01-03') return 'Holiday season';
  if (md >= '07-01' && md <= '07-07') return 'Independence Day week';
  const y = Number(day.slice(0, 4));
  const named = holidaysOf(y);
  const at = (name: string) => [...named].find(([, n]) => n === name)?.[0];
  const thanksgiving = at('Thanksgiving');
  if (thanksgiving) {
    if (day === plusDays(thanksgiving, -1)) return 'Day before Thanksgiving';
    if (day === plusDays(thanksgiving, 2) || day === plusDays(thanksgiving, 3)) return 'Thanksgiving weekend';
  }
  for (const name of ['Memorial Day', 'Labor Day']) {
    const d = at(name);
    if (d && (day === plusDays(d, -2) || day === plusDays(d, -1))) return `${name} weekend`;
  }
  return undefined;
}

/** A day not to learn an ordinary day from: a holiday, or one in a holiday's window. */
export function isSpecial(day: string): boolean {
  return holidayOf(day) !== undefined || seasonOf(day) !== undefined;
}

/**
 * A day's day last year, to compare it with: the same holiday (Martin Luther King Jr. Day on its own date; a weekend
 * holiday's observed day, else the holiday itself); in a holiday's window, the day of last year's window on the same
 * weekday, else the same date, but no holiday; any other day, the same weekday 52 weeks back, or a week either side of
 * it when that one was a holiday or in a window. None for a holiday last year didn't have.
 */
export function dayLastYear(day: string): string | undefined {
  const y = Number(day.slice(0, 4));
  const name = holidayOf(day);
  if (name) {
    const last = holidaysOf(y - 1);
    for (const [d, n] of last) if (n === name) return d;
    const plain = name.replace(/ \(observed\)$/, '');
    if (plain !== name) for (const [d, n] of last) if (n === plain) return d;
    return undefined;
  }
  const season = seasonOf(day);
  if (season) {
    // Last year's day of the same window on the same weekday, the nearest to 52 weeks back within a fortnight.
    for (const w of [0, -7, 7, -14, 14]) {
      const c = plusDays(day, w - 364);
      if (seasonOf(c) === season) return c;
    }
    const same = `${y - 1}${day.slice(4)}`;
    return seasonOf(same) === season ? same : undefined;
  }
  for (const back of [364, 357, 371]) {
    const d = plusDays(day, -back);
    if (!isSpecial(d)) return d;
  }
  return undefined;
}
