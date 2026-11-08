/**
 * The calendar as a parameter (ADR 0010 §2): `us-nyc/1` is exactly the calendar every flow had before, `us/1` the
 * federal days alone, `none` no day at all; a document's block is resolved, or refused when it asks for what this build
 * can't judge yet. And why a day has no range, which the words "Not judged yet" say (ADR 0010 §1).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { calendarProblems, dayLastYear, holidayOf, holidaysOf, isSpecial, NONE, plusDays, resolveCalendar, seasonOf, shortName, specialOf, US_1, US_NYC_1 } from '../src/core/calendar.js';
import { NormalRanges, type DailySeries } from '../src/core/normal.js';

const span = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = plusDays(d, 1)) out.push(d);
  return out;
};

describe('the built-in calendars', () => {
  it('us-nyc/1 is today’s calendar, day for day, 2020–2027 (vector)', () => {
    const days = span('2020-01-01', '2027-12-31');
    const lines = days.map((d) => `${d}|${holidayOf(d, US_NYC_1) ?? ''}|${seasonOf(d, US_NYC_1) ?? ''}|${dayLastYear(d, US_NYC_1) ?? ''}`);
    // Taken from the calendar as it was before it took a parameter (2,922 days: holiday, window, day last year).
    expect(createHash('sha256').update(lines.join('\n')).digest('hex')).toBe('00732022f476019bae9d1e2357ad00cf39fe1562d814a73ac083433000dbffde');
    // And it is the default, so every caller that names no calendar keeps it.
    expect(days.every((d) => holidayOf(d) === holidayOf(d, US_NYC_1) && seasonOf(d) === seasonOf(d, US_NYC_1) && dayLastYear(d) === dayLastYear(d, US_NYC_1))).toBe(true);
    const counts = (y: number) => [holidaysOf(y, US_NYC_1).size, span(`${y}-01-01`, `${y}-12-31`).filter((d) => seasonOf(d, US_NYC_1)).length];
    expect([2022, 2023, 2024].map(counts)).toEqual([[16, 20], [16, 20], [14, 21]]);
    expect(US_NYC_1).toMatchObject({ base: 'us-nyc/1', zone: 'America/New_York', days: [], windows: [], dates: [] });
  });

  it('us/1 has the federal days only, each on the weekday it is observed, and no windows', () => {
    const named = (y: number) => [...holidaysOf(y, US_1).values()];
    expect(named(2023)).toEqual(expect.arrayContaining(['Martin Luther King Jr. Day', "Presidents' Day", 'Memorial Day', 'Labor Day', 'Columbus Day', 'Thanksgiving', 'Veterans Day (observed)', "New Year's Day (observed)"]));
    for (const y of [2021, 2022, 2023, 2024]) expect(named(y).filter((n) => /Christmas Eve|New Year's Eve|Day after/.test(n))).toEqual([]);
    // New Year's Day 2022 fell on a Saturday: with no New Year's Eve of its own, Dec 31 is its observed day.
    expect(holidayOf('2021-12-31', US_1)).toBe("New Year's Day (observed)");
    expect([holidayOf('2023-11-24', US_1), seasonOf('2023-12-27', US_1), isSpecial('2023-12-27', US_1), isSpecial('2023-11-23', US_1)]).toEqual([undefined, undefined, false, true]);
    expect(span('2023-01-01', '2023-12-31').filter((d) => isSpecial(d, US_1))).toHaveLength(holidaysOf(2023, US_1).size);
    expect(dayLastYear('2024-01-15', US_1)).toBe('2023-01-16');
  });

  it('none has no day at all: every day is ordinary, its day last year 52 weeks back', () => {
    expect(span('2020-01-01', '2027-12-31').filter((d) => isSpecial(d, NONE))).toEqual([]);
    expect([holidaysOf(2023, NONE).size, specialOf('2023-12-25', NONE), dayLastYear('2023-12-25', NONE), dayLastYear('2023-11-23', NONE)]).toEqual([0, undefined, '2022-12-26', '2022-11-24']);
  });

  it('says long names short, as heads do', () => {
    expect(['Martin Luther King Jr. Day', 'Day after Thanksgiving', 'Independence Day week', 'Day before Thanksgiving', 'Labor Day'].map(shortName)).toEqual(['MLK Day', 'Black Friday', 'July 4th week', 'Thanksgiving Eve', 'Labor Day']);
  });
});

describe('a flow’s calendar', () => {
  it('is us-nyc/1 for a legacy document, and none unless chosen in format 3 (Q-58)', () => {
    expect(resolveCalendar(undefined, true)).toBe(US_NYC_1);
    expect(resolveCalendar({ base: 'none' }, true)).toBe(US_NYC_1);
    expect(resolveCalendar(undefined, false)).toBe(NONE);
    expect(resolveCalendar({}, false)).toEqual({ base: 'none', zone: 'UTC', days: [], windows: [], dates: [] });
    expect(resolveCalendar({ base: 'us' }, false)).toEqual({ base: 'us/1', zone: 'UTC', days: [], windows: [], dates: [] });
    expect(resolveCalendar({ base: 'us-nyc', zone: 'America/New_York', days: [] }, false)).toEqual({ base: 'us-nyc/1', zone: 'America/New_York', days: [], windows: [], dates: [] });
  });

  it('refuses what this build can’t judge yet, never ignoring it', () => {
    expect(calendarProblems({ base: 'us-nyc', zone: 'Europe/London' })).toEqual([]);
    expect(calendarProblems('us')).toEqual([['', '{ base, zone }: the built-in days and the zone a day is a date in']]);
    expect(calendarProblems({ base: 'uk' })).toEqual([['.base', 'one of none, us, us-nyc']]);
    expect(calendarProblems({ zone: 'Mars/Olympus' })).toEqual([['.zone', 'a time zone, such as UTC or America/New_York']]);
    expect(calendarProblems({ region: 'gb' })).toEqual([['.region', 'not a field this version reads (base, zone, days, windows, dates): refused rather than ignored']]);
    expect(calendarProblems({ days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }] })).toEqual([['.days', "a flow's own recurring days are not something this version can judge yet: refused rather than ignored"]]);
    expect(calendarProblems({ windows: [{ name: 'Change freeze', from: '12-15', to: '01-02' }], dates: 'x' })).toEqual([
      ['.windows', "a flow's own windows are not something this version can judge yet: refused rather than ignored"],
      ['.dates', 'a list'],
    ]);
    expect(() => resolveCalendar({ dates: [{ name: 'Move', on: '2024-06-15' }] }, false)).toThrow("calendar.dates: a flow's own dates are not something this version can judge yet");
  });
});

describe('why a day has no range', () => {
  const FROM = '2021-10-01';
  const days = span(FROM, '2023-12-31');
  const series = (f: (d: string, k: number) => number): DailySeries => ({ from: FROM, values: days.map(f) });
  const flat = series((d) => (isSpecial(d) ? 700 : 1000));

  it('a holiday with no last year in the history: its first one here', () => {
    const r = new NormalRanges(flat, 'count');
    expect(r.at('2021-11-25')).toBeNull();
    expect(r.explain('2021-11-25')).toEqual({ why: 'no last year', days: 55, special: 'Thanksgiving' });
    expect(r.explain('2021-12-27')).toMatchObject({ why: 'no last year', special: 'Holiday season' });
    // A year on, the same holiday has its range.
    expect(r.at('2022-11-24')).not.toBeNull();
    expect(r.explain('2022-11-24')).toBeNull();
  });

  it('a holiday whose number moved too far since last year to be judged by it', () => {
    const r = new NormalRanges(series((d) => (d >= '2022-06-01' ? 3000 : 1000) * (isSpecial(d) ? 0.7 : 1)), 'count');
    expect(r.at('2022-11-24')).toBeNull();
    expect(r.explain('2022-11-24')).toMatchObject({ why: 'last year moved', special: 'Thanksgiving' });
  });

  it('too few days before it, and a day past the history’s end', () => {
    const r = new NormalRanges(flat, 'count');
    expect(r.explain('2021-10-05')).toEqual({ why: 'too few days', days: 4 });
    expect(r.explain('2021-09-20')).toEqual({ why: 'too few days', days: 0 });
    expect(r.explain('2024-01-05')).toBeNull(); // the weeks before it say what a day like it has
    expect(r.explain('2024-06-01')).toEqual({ why: 'history ends', days: days.length });
    // Under a calendar with no days, Thanksgiving is an ordinary Thursday, judged by the weeks before.
    expect(new NormalRanges(flat, 'count', { calendar: NONE }).at('2021-11-25')).not.toBeNull();
  });
});
