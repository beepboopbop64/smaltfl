/**
 * The days a flow's data is known to differ on, and a day's day last year to compare it with (ADR 0010 §2). A day is
 * `YYYY-MM-DD`, a date in the calendar's zone. Every function takes the flow's calendar, `US_NYC_1` by default, which is
 * the calendar every flow had before ADR 0010 and the one a legacy document keeps:
 *
 * - `none`: no built-in days.
 * - `us/1`: the US federal holidays, a weekend one on the weekday it is observed.
 * - `us-nyc/1`: `us/1` plus Christmas Eve, New Year's Eve and the day after Thanksgiving; and around some of them days
 *   that are no holidays but no ordinary days either, as a holiday's window in forecasting has it: the holiday season
 *   from December 23 to January 3, the week of July 4th, the day before Thanksgiving and the weekend after it, and the
 *   weekends before Memorial Day and Labor Day.
 *
 * A base carries a version: a build that adds a day to a built-in list makes `/2`, and a flow keeps the days it was
 * judged by until its document says otherwise. A flow's own recurring days, windows and dates are refused by this build
 * (`calendarProblems`): it can't judge them yet, and a setting it can't judge is refused, never ignored. No DOM, no
 * engine.
 */

/** The built-in days a calendar starts from, each with its version. */
export type CalendarBase = 'none' | 'us/1' | 'us-nyc/1';

/** A day that recurs, each month or in the months listed: by its day of the month (`day`, negative from the month's end),
 * or by the weekday that falls `between` two days of it. Written in a document; judged from a later build. */
export interface CalendarDay {
  name: string;
  short?: string;
  day?: number;
  weekday?: 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
  between?: [number, number];
  month?: number[];
  around?: [number, number];
}

/** A span of the year (`MM-DD` to `MM-DD`), as the holiday season is. */
export interface CalendarWindow {
  name: string;
  from: string;
  to: string;
}

/** A one-off date, left out of learning and named on the day. */
export interface CalendarDate {
  name: string;
  on: string;
}

/** A flow's calendar, resolved: what the plan carries (plan/2) and what every function here reads. */
export interface Calendar {
  base: CalendarBase;
  /** The zone a day is a date in. */
  zone: string;
  days: CalendarDay[];
  windows: CalendarWindow[];
  dates: CalendarDate[];
}

/** A document's calendar block (format 3), before its defaults are filled in. */
export interface CalendarDef {
  base?: 'none' | 'us' | 'us-nyc';
  zone?: string;
  days?: CalendarDay[];
  windows?: CalendarWindow[];
  dates?: CalendarDate[];
}

/** No built-in days: a format-3 document's calendar unless it chooses one (the owner, Q-58). */
export const NONE: Calendar = Object.freeze({ base: 'none', zone: 'UTC', days: [], windows: [], dates: [] }) as Calendar;
/** The US federal holidays. */
export const US_1: Calendar = Object.freeze({ base: 'us/1', zone: 'UTC', days: [], windows: [], dates: [] }) as Calendar;
/** Today's calendar, as every flow had it before ADR 0010: the taxi data's, days in New York. A legacy document's. */
export const US_NYC_1: Calendar = Object.freeze({ base: 'us-nyc/1', zone: 'America/New_York', days: [], windows: [], dates: [] }) as Calendar;

const BASES: Record<NonNullable<CalendarDef['base']>, CalendarBase> = { none: 'none', us: 'us/1', 'us-nyc': 'us-nyc/1' };
const CALENDAR_FIELDS = ['base', 'zone', 'days', 'windows', 'dates'];

/** Whether a zone is one the runtime knows (an IANA name, or UTC). */
function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Why a document's calendar block can't be judged by this build, as [path under the block, message] pairs: an unknown
 * field, base or zone, and any recurring day, window or date, which a later build judges (ADR 0010 §2). Empty when it
 * can.
 */
export function calendarProblems(def: unknown): [string, string][] {
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return [['', '{ base, zone }: the built-in days and the zone a day is a date in']];
  const c = def as Record<string, unknown>;
  const out: [string, string][] = [];
  for (const k of Object.keys(c)) if (!CALENDAR_FIELDS.includes(k)) out.push([`.${k}`, `not a field this version reads (${CALENDAR_FIELDS.join(', ')}): refused rather than ignored`]);
  if (c.base !== undefined && !Object.hasOwn(BASES, c.base as string)) out.push(['.base', `one of ${Object.keys(BASES).join(', ')}`]);
  if (c.zone !== undefined && (typeof c.zone !== 'string' || c.zone === '' || !knownZone(c.zone))) out.push(['.zone', 'a time zone, such as UTC or America/New_York']);
  for (const k of ['days', 'windows', 'dates'] as const) {
    if (c[k] === undefined) continue;
    if (!Array.isArray(c[k])) out.push([`.${k}`, 'a list']);
    else if ((c[k] as unknown[]).length > 0) out.push([`.${k}`, `a flow's own ${k === 'days' ? 'recurring days' : k} are not something this version can judge yet: refused rather than ignored`]);
  }
  return out;
}

/**
 * A flow's calendar: a legacy document's is `US_NYC_1`, as before ADR 0010; a format-3 document's is its block's, with
 * `none` and UTC by default (the owner, Q-58: "None unless chosen"). Throws on a block `calendarProblems` refuses.
 */
export function resolveCalendar(def: CalendarDef | undefined, legacy: boolean): Calendar {
  if (legacy) return US_NYC_1;
  if (def === undefined) return NONE;
  const problems = calendarProblems(def);
  if (problems.length) throw new Error(`calendar${problems[0]![0]}: ${problems[0]![1]}`);
  return { base: BASES[def.base ?? 'none'], zone: def.zone ?? 'UTC', days: [], windows: [], dates: [] };
}

/** The short names heads use, where a day's own name is long: "MLK Day", "Black Friday". */
const SHORT_NAMES: Record<string, string> = { 'Martin Luther King Jr. Day': 'MLK Day', 'Day after Thanksgiving': 'Black Friday', 'Independence Day week': 'July 4th week', 'Day before Thanksgiving': 'Thanksgiving Eve' };

/** A built-in day's name as a head says it: its short name, else its own. */
export const shortName = (name: string): string => SHORT_NAMES[name] ?? name;

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

const years = new Map<string, Map<string, string>>();

/** A year's holidays under a calendar's built-in days, each day with its name. */
export function holidaysOf(y: number, cal: Calendar = US_NYC_1): ReadonlyMap<string, string> {
  const key = `${cal.base}|${y}`;
  let out = years.get(key);
  if (out) return out;
  out = new Map<string, string>();
  years.set(key, out);
  if (cal.base === 'none') return out;
  const nyc = cal.base === 'us-nyc/1';
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
  if (nyc) {
    put(new Date(thanksgiving.getTime() + 864e5), 'Day after Thanksgiving');
    put(utc(y, 12, 24), 'Christmas Eve');
    put(utc(y, 12, 31), "New Year's Eve");
  }
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
  return out;
}

/** A day's holiday, if it is one. */
export function holidayOf(day: string, cal: Calendar = US_NYC_1): string | undefined {
  return holidaysOf(Number(day.slice(0, 4)), cal).get(day);
}

/**
 * The window around a holiday that a day is in, if it is no holiday itself (`us-nyc/1` only): the holiday season
 * (December 23 to January 3), Independence Day week (July 1 to 7), the day before Thanksgiving, Thanksgiving weekend
 * (the Saturday and Sunday after it), and the weekends before Memorial Day and Labor Day.
 */
export function seasonOf(day: string, cal: Calendar = US_NYC_1): string | undefined {
  if (cal.base !== 'us-nyc/1' || holidayOf(day, cal) !== undefined) return undefined;
  const md = day.slice(5);
  if (md >= '12-23' || md <= '01-03') return 'Holiday season';
  if (md >= '07-01' && md <= '07-07') return 'Independence Day week';
  const y = Number(day.slice(0, 4));
  const named = holidaysOf(y, cal);
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
export function isSpecial(day: string, cal: Calendar = US_NYC_1): boolean {
  return holidayOf(day, cal) !== undefined || seasonOf(day, cal) !== undefined;
}

/** A special day's name: its holiday's, or the window's it is in. */
export const specialOf = (day: string, cal: Calendar = US_NYC_1): string | undefined => holidayOf(day, cal) ?? seasonOf(day, cal);

/**
 * A day's day last year, to compare it with: the same holiday (Martin Luther King Jr. Day on its own date; a weekend
 * holiday's observed day, else the holiday itself); in a holiday's window, the day of last year's window on the same
 * weekday, else the same date, but no holiday; any other day, the same weekday 52 weeks back, or a week either side of
 * it when that one was a holiday or in a window. None for a holiday last year didn't have.
 */
export function dayLastYear(day: string, cal: Calendar = US_NYC_1): string | undefined {
  const y = Number(day.slice(0, 4));
  const name = holidayOf(day, cal);
  if (name) {
    const last = holidaysOf(y - 1, cal);
    for (const [d, n] of last) if (n === name) return d;
    const plain = name.replace(/ \(observed\)$/, '');
    if (plain !== name) for (const [d, n] of last) if (n === plain) return d;
    return undefined;
  }
  const season = seasonOf(day, cal);
  if (season) {
    // Last year's day of the same window on the same weekday, the nearest to 52 weeks back within a fortnight.
    for (const w of [0, -7, 7, -14, 14]) {
      const c = plusDays(day, w - 364);
      if (seasonOf(c, cal) === season) return c;
    }
    const same = `${y - 1}${day.slice(4)}`;
    return seasonOf(same, cal) === season ? same : undefined;
  }
  for (const back of [364, 357, 371]) {
    const d = plusDays(day, -back);
    if (!isSpecial(d, cal)) return d;
  }
  return undefined;
}
