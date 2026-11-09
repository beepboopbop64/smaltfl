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
 * judged by until its document says otherwise. A flow adds its own days (ADR 0010 §2, phase 3):
 *
 * - Recurring days, by a day of the month (`day`, negative from the month's end) or by the weekday that falls `between`
 *   two days of it, in every month or the months listed. One listed month makes a yearly day, judged as a holiday is,
 *   against last year's (`holidaysOf` names it); any other recurs more often and is judged against its occurrences
 *   before (`recurringOf`, `occurrencesBefore`, normal.ts's occurrences' guess). `around` puts the days before and after
 *   it in its window, each judged against the same day of the window the time before.
 * - Windows, spans of the year (`MM-DD` to `MM-DD`, across the new year when `to` comes first), as the holiday season.
 * - Dates, one-off: left out of learning and named on the day, judged as any other day (`datedOf`).
 *
 * No DOM, no engine.
 */

/** The built-in days a calendar starts from, each with its version. */
export type CalendarBase = 'none' | 'us/1' | 'us-nyc/1';

/** A day that recurs, each month or in the months listed: by its day of the month (`day`, negative from the month's end),
 * or by the weekday that falls `between` two days of it; with `around`, the days before and after it in its window. */
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

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_FIELDS = ['name', 'short', 'day', 'weekday', 'between', 'month', 'around'];
const MD = /^(\d{2})-(\d{2})$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
/** A month's length (February with its 29th, for a span of the year). */
const monthDays = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const validMD = (t: unknown) => typeof t === 'string' && MD.test(t) && isInt(Number(t.slice(0, 2)), 1, 12) && isInt(Number(t.slice(3)), 1, monthDays(2024, Number(t.slice(0, 2))));
const validYMD = (t: unknown) => typeof t === 'string' && YMD.test(t) && isInt(Number(t.slice(5, 7)), 1, 12) && isInt(Number(t.slice(8)), 1, monthDays(Number(t.slice(0, 4)), Number(t.slice(5, 7))));

/** Why a flow's own days, windows and dates aren't ones this build can judge, as [path, message] pairs; empty when they
 * are. Every name is said once: a yearly day is judged against last year's of the same name. */
function listProblems(c: Record<string, unknown>): [string, string][] {
  const out: [string, string][] = [];
  const names = new Set<string>();
  const named = (x: Record<string, unknown>, at: string) => {
    if (typeof x.name !== 'string' || x.name.trim() === '') return out.push([`${at}.name`, 'a name, said on the day']);
    if (names.has(x.name)) out.push([`${at}.name`, `${x.name} is named twice`]);
    names.add(x.name);
  };
  const list = (k: 'days' | 'windows' | 'dates', each: (x: Record<string, unknown>, at: string) => void, fields: string[], shape: string) => {
    if (c[k] === undefined) return;
    if (!Array.isArray(c[k])) return out.push([`.${k}`, 'a list']);
    (c[k] as unknown[]).forEach((x, i) => {
      const at = `.${k}[${i}]`;
      if (typeof x !== 'object' || x === null || Array.isArray(x)) return out.push([at, shape]);
      const r = x as Record<string, unknown>;
      for (const f of Object.keys(r)) if (!fields.includes(f)) out.push([`${at}.${f}`, `not a field this version reads (${fields.join(', ')}): refused rather than ignored`]);
      named(r, at);
      each(r, at);
    });
  };
  list('days', (d, at) => {
    if (d.short !== undefined && (typeof d.short !== 'string' || d.short.trim() === '')) out.push([`${at}.short`, 'a short name, for heads']);
    if ((d.day === undefined) === (d.weekday === undefined)) out.push([at, 'a day of the month (day) or a weekday between two days of it (weekday, between): one of them']);
    if (d.day !== undefined && !(isInt(d.day, 1, 31) || isInt(d.day, -31, -1))) out.push([`${at}.day`, 'a day of the month, 1 to 31, or -1 to -31 from its end']);
    if (d.weekday !== undefined && !(WEEKDAYS as readonly unknown[]).includes(d.weekday)) out.push([`${at}.weekday`, `one of ${WEEKDAYS.join(', ')}`]);
    if (d.weekday !== undefined || d.between !== undefined) {
      const b = d.between;
      if (!Array.isArray(b) || b.length !== 2 || !isInt(b[0], 1, 31) || !isInt(b[1], 1, 31) || b[1] < b[0] || b[1] - b[0] > 6) out.push([`${at}.between`, 'two days of the month, at most six apart, so one weekday falls between them: [8, 14]']);
      if (d.weekday === undefined) out.push([`${at}.weekday`, 'the weekday that falls between them']);
    }
    if (d.month !== undefined && (!Array.isArray(d.month) || d.month.length === 0 || d.month.some((m) => !isInt(m, 1, 12)) || new Set(d.month).size !== d.month.length)) out.push([`${at}.month`, 'the months it falls in, 1 to 12, each once']);
    if (d.around !== undefined && (!Array.isArray(d.around) || d.around.length !== 2 || !isInt(d.around[0], 0, 7) || !isInt(d.around[1], 0, 7))) out.push([`${at}.around`, 'the days before and after it in its window, 0 to 7 each: [0, 1]']);
  }, DAY_FIELDS, '{ name, day } or { name, weekday, between }, with month and around if it needs them');
  list('windows', (w, at) => {
    if (!validMD(w.from)) out.push([`${at}.from`, 'a day of the year, MM-DD']);
    if (!validMD(w.to)) out.push([`${at}.to`, 'a day of the year, MM-DD']);
  }, ['name', 'from', 'to'], '{ name, from, to }: a span of the year, MM-DD to MM-DD');
  list('dates', (d, at) => {
    if (!validYMD(d.on)) out.push([`${at}.on`, 'a date, YYYY-MM-DD']);
  }, ['name', 'on'], '{ name, on }: a date, YYYY-MM-DD');
  return out;
}

/**
 * Why a document's calendar block can't be judged by this build, as [path under the block, message] pairs: an unknown
 * field, base or zone, and a day, window or date that isn't written as ADR 0010 §2 has it. Empty when it can.
 */
export function calendarProblems(def: unknown): [string, string][] {
  if (typeof def !== 'object' || def === null || Array.isArray(def)) return [['', '{ base, zone, days, windows, dates }: the built-in days, the zone a day is a date in, and the flow’s own days']];
  const c = def as Record<string, unknown>;
  const out: [string, string][] = [];
  for (const k of Object.keys(c)) if (!CALENDAR_FIELDS.includes(k)) out.push([`.${k}`, `not a field this version reads (${CALENDAR_FIELDS.join(', ')}): refused rather than ignored`]);
  if (c.base !== undefined && !Object.hasOwn(BASES, c.base as string)) out.push(['.base', `one of ${Object.keys(BASES).join(', ')}`]);
  if (c.zone !== undefined && (typeof c.zone !== 'string' || c.zone === '' || !knownZone(c.zone))) out.push(['.zone', 'a time zone, such as UTC or America/New_York']);
  return [...out, ...listProblems(c)];
}

/** Why a plan's resolved calendar isn't one this build reads (`validatePlan`): its days, windows and dates as
 * `calendarProblems` checks a document's. */
export const calendarListProblems = (c: Record<string, unknown>): [string, string][] => listProblems(c);

/** A day as the plan carries it: only its fields, in a fixed order. */
const dayOf = (d: CalendarDay): CalendarDay => ({
  name: d.name, ...(d.short !== undefined ? { short: d.short } : {}), ...(d.day !== undefined ? { day: d.day } : {}), ...(d.weekday !== undefined ? { weekday: d.weekday } : {}),
  ...(d.between ? { between: [d.between[0], d.between[1]] as [number, number] } : {}), ...(d.month ? { month: [...d.month] } : {}), ...(d.around ? { around: [d.around[0], d.around[1]] as [number, number] } : {}),
});

/**
 * A flow's calendar: a legacy document's is `US_NYC_1`, as before ADR 0010; a format-3 document's is its block's, with
 * `none` and UTC by default (the owner, Q-58: "None unless chosen"), and its own days, windows and dates in the order
 * written. Throws on a block `calendarProblems` refuses.
 */
export function resolveCalendar(def: CalendarDef | undefined, legacy: boolean): Calendar {
  if (legacy) return US_NYC_1;
  if (def === undefined) return NONE;
  const problems = calendarProblems(def);
  if (problems.length) throw new Error(`calendar${problems[0]![0]}: ${problems[0]![1]}`);
  return {
    base: BASES[def.base ?? 'none'], zone: def.zone ?? 'UTC',
    days: (def.days ?? []).map(dayOf),
    windows: (def.windows ?? []).map((w) => ({ name: w.name, from: w.from, to: w.to })),
    dates: (def.dates ?? []).map((d) => ({ name: d.name, on: d.on })),
  };
}

/** The short names heads use, where a day's own name is long: "MLK Day", "Black Friday". */
const SHORT_NAMES: Record<string, string> = { 'Martin Luther King Jr. Day': 'MLK Day', 'Day after Thanksgiving': 'Black Friday', 'Independence Day week': 'July 4th week', 'Day before Thanksgiving': 'Thanksgiving Eve' };

/** A day's name as a head says it: the flow's own short name for it, else a built-in day's, else its own. */
export const shortName = (name: string, cal?: Calendar): string => cal?.days.find((d) => d.name === name)?.short ?? SHORT_NAMES[name] ?? name;

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
const signatures = new WeakMap<Calendar, string>();
/** What a calendar's days are, as one text: calendars alike share what is worked out of them. */
function signature(cal: Calendar): string {
  let s = signatures.get(cal);
  if (s === undefined) signatures.set(cal, (s = `${cal.base}|${JSON.stringify(cal.days)}|${JSON.stringify(cal.windows)}|${JSON.stringify(cal.dates)}`));
  return s;
}

/** A recurring day is yearly when it falls in one month: judged as a holiday is, against last year's. */
const yearly = (d: CalendarDay): boolean => d.month?.length === 1;

/** The date a recurring day falls on in a month, if it falls in it. */
function inMonth(d: CalendarDay, y: number, m: number): string | undefined {
  if (d.month && !d.month.includes(m)) return undefined;
  const last = monthDays(y, m);
  if (d.day !== undefined) {
    const n = d.day > 0 ? d.day : last + 1 + d.day;
    return n >= 1 && n <= last ? iso(utc(y, m, n)) : undefined;
  }
  const wd = WEEKDAYS.indexOf(d.weekday!);
  for (let n = d.between![0]; n <= Math.min(d.between![1], last); n++) if (utc(y, m, n).getUTCDay() === wd) return iso(utc(y, m, n));
  return undefined;
}

/** A day of a recurring day's window: the day itself (`offset` 0), or one of the days `around` it. */
export interface Occurrence {
  name: string;
  /** The recurring day's place in the calendar's days. */
  index: number;
  offset: number;
  /** The date the recurring day itself fell on. */
  anchor: string;
  yearly: boolean;
}

const occurrenceYears = new Map<string, Map<string, Occurrence>>();
/** A year's days of the flow's recurring days and their windows: each day's own date first, then the days around them,
 * the first day listed winning where two meet. */
function occurrencesOf(y: number, cal: Calendar): ReadonlyMap<string, Occurrence> {
  const key = `${signature(cal)}|${y}`;
  let out = occurrenceYears.get(key);
  if (out) return out;
  out = new Map();
  occurrenceYears.set(key, out);
  const anchors: Occurrence[] = [];
  cal.days.forEach((d, index) => {
    // December before and January after too: their windows can reach into the year.
    for (let k = -1; k <= 12; k++) {
      const [yy, m] = k < 0 ? [y - 1, 12] : k === 12 ? [y + 1, 1] : [y, k + 1];
      const at = inMonth(d, yy, m);
      if (at) anchors.push({ name: d.name, index, offset: 0, anchor: at, yearly: yearly(d) });
    }
  });
  for (const a of anchors) if (a.anchor.startsWith(`${y}-`) && !out.has(a.anchor)) out.set(a.anchor, a);
  for (const a of anchors) {
    const [before, after] = cal.days[a.index]!.around ?? [0, 0];
    for (let o = -before; o <= after; o++) {
      const at = plusDays(a.anchor, o);
      if (o !== 0 && at.startsWith(`${y}-`) && !out.has(at)) out.set(at, { ...a, offset: o });
    }
  }
  return out;
}

/** A recurring day's window day said: the day's own name, "Day before Patch Tuesday", "Day after …", "… window". */
const occurrenceName = (o: Pick<Occurrence, 'name' | 'offset'>): string => (o.offset === 0 ? o.name : o.offset === -1 ? `Day before ${o.name}` : o.offset === 1 ? `Day after ${o.name}` : `${o.name} window`);

/** A year's holidays under a calendar's built-in days, and the flow's yearly days, each day with its name. */
export function holidaysOf(y: number, cal: Calendar = US_NYC_1): ReadonlyMap<string, string> {
  const key = cal.days.length ? `${signature(cal)}|${y}` : `${cal.base}|${y}`;
  let out = years.get(key);
  if (out) return out;
  out = new Map<string, string>();
  years.set(key, out);
  const put = (d: Date, name: string) => {
    if (d.getUTCFullYear() === y && !out!.has(iso(d))) out!.set(iso(d), name);
  };
  // The flow's yearly days, after the built-in days: a built-in day keeps its name where they meet.
  const own = () => {
    for (const [at, o] of occurrencesOf(y, cal)) if (o.yearly && o.offset === 0) put(dateOf(at), o.name);
  };
  if (cal.base === 'none') {
    own();
    return out;
  }
  const nyc = cal.base === 'us-nyc/1';
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
  own();
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
 * The window around a holiday that a day is in, if it is no holiday itself: under `us-nyc/1`, the holiday season
 * (December 23 to January 3), Independence Day week (July 1 to 7), the day before Thanksgiving, Thanksgiving weekend
 * (the Saturday and Sunday after it), and the weekends before Memorial Day and Labor Day; then the days around a flow's
 * yearly day, and the flow's own windows.
 */
export function seasonOf(day: string, cal: Calendar = US_NYC_1): string | undefined {
  if (holidayOf(day, cal) !== undefined) return undefined;
  const md = day.slice(5);
  const own = () => {
    if (cal.days.length) {
      const o = occurrencesOf(Number(day.slice(0, 4)), cal).get(day);
      if (o && o.yearly && o.offset !== 0) return occurrenceName(o);
    }
    for (const w of cal.windows) if (w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to) return w.name;
    return undefined;
  };
  if (cal.base !== 'us-nyc/1') return own();
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
  return own();
}

/**
 * The flow's recurring day that a day is, or is in the window of, when that day recurs more often than yearly (a yearly
 * one is a holiday, its window a season): its name said for the day ("Patch Tuesday", "Day after Patch Tuesday"), the
 * day's own name (`of`) and its place in the window. Undefined on a holiday or in a season, which are judged by last
 * year's.
 */
export function recurringOf(day: string, cal: Calendar = US_NYC_1): { name: string; of: string; offset: number } | undefined {
  if (!cal.days.length) return undefined;
  const o = occurrencesOf(Number(day.slice(0, 4)), cal).get(day);
  if (!o || o.yearly || holidayOf(day, cal) !== undefined || seasonOf(day, cal) !== undefined) return undefined;
  return { name: occurrenceName(o), of: o.name, offset: o.offset };
}

/**
 * The `n` latest days before `day` that were the same day of the same recurring day's window, the latest first: a
 * Patch Tuesday's Patch Tuesdays before it, a month-end's month-ends. None for a day that isn't one (`recurringOf`).
 * They are what the occurrences' guess learns from (normal.ts).
 */
export function occurrencesBefore(day: string, cal: Calendar, n: number): string[] {
  const r = recurringOf(day, cal);
  if (!r) return [];
  const index = cal.days.findIndex((d) => d.name === r.of);
  const d = cal.days[index]!;
  const out: string[] = [];
  let [y, m] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)) + 1];
  if (m === 13) (m = 1), y++;
  // Back month by month, from the month after (an occurrence whose window day falls before it), for ten years at most.
  for (let k = 0; k < 122 && out.length < n; k++) {
    const at = inMonth(d, y, m);
    if (at) {
      const w = plusDays(at, r.offset);
      if (w < day && recurringOf(w, cal)?.of === r.of) out.push(w);
    }
    if (--m === 0) (m = 12), y--;
  }
  return out;
}

/** A flow's one-off date that a day is, if any: left out of learning, named on the day, judged as any other day. */
export const datedOf = (day: string, cal: Calendar = US_NYC_1): string | undefined => cal.dates.find((d) => d.on === day)?.name;

/** A day not to learn an ordinary day from: a holiday, one in a holiday's window or a flow's window, one of the flow's
 * recurring days (or in its window), or one of its dates. */
export function isSpecial(day: string, cal: Calendar = US_NYC_1): boolean {
  return holidayOf(day, cal) !== undefined || seasonOf(day, cal) !== undefined || recurringOf(day, cal) !== undefined || datedOf(day, cal) !== undefined;
}

/** A special day's name, judged by last year's alone: its holiday's, or the window's it is in. */
export const specialOf = (day: string, cal: Calendar = US_NYC_1): string | undefined => holidayOf(day, cal) ?? seasonOf(day, cal);

/** Any day the calendar names, as the day says it: a special day's name, a recurring day's, or a date's. */
export const namedOf = (day: string, cal: Calendar = US_NYC_1): string | undefined => specialOf(day, cal) ?? recurringOf(day, cal)?.name ?? datedOf(day, cal);

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
