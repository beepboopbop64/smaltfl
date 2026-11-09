/**
 * The calendar as a parameter (ADR 0010 §2): `us-nyc/1` is exactly the calendar every flow had before, `us/1` the
 * federal days alone, `none` no day at all; a document's block is resolved, or refused when it asks for what this build
 * can't judge yet. And why a day has no range, which the words "Not judged yet" say (ADR 0010 §1).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { calendarProblems, datedOf, dayLastYear, holidayOf, holidaysOf, isSpecial, namedOf, NONE, occurrencesBefore, plusDays, recurringOf, resolveCalendar, seasonOf, shortName, specialOf, US_1, US_NYC_1, type Calendar } from '../src/core/calendar.js';
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
    expect(['Martin Luther King Jr. Day', 'Day after Thanksgiving', 'Independence Day week', 'Day before Thanksgiving', 'Labor Day'].map((n) => shortName(n))).toEqual(['MLK Day', 'Black Friday', 'July 4th week', 'Thanksgiving Eve', 'Labor Day']);
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

  it('refuses what it can’t judge, never ignoring it', () => {
    expect(calendarProblems({ base: 'us-nyc', zone: 'Europe/London' })).toEqual([]);
    expect(calendarProblems('us')).toEqual([['', '{ base, zone, days, windows, dates }: the built-in days, the zone a day is a date in, and the flow’s own days']]);
    expect(calendarProblems({ base: 'uk' })).toEqual([['.base', 'one of none, us, us-nyc']]);
    expect(calendarProblems({ zone: 'Mars/Olympus' })).toEqual([['.zone', 'a time zone, such as UTC or America/New_York']]);
    expect(calendarProblems({ region: 'gb' })).toEqual([['.region', 'not a field this version reads (base, zone, days, windows, dates): refused rather than ignored']]);
    expect(calendarProblems({ days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }], windows: [{ name: 'Change freeze', from: '12-15', to: '01-02' }], dates: [{ name: 'Move', on: '2024-06-15' }] })).toEqual([]);
    expect(calendarProblems({ windows: [{ name: 'Change freeze', from: '12-15', to: '01-02' }], dates: 'x' })).toEqual([['.dates', 'a list']]);
    // Each day written one way, as ADR 0010 §2 has it.
    expect(calendarProblems({ days: [
      { name: 'Both', day: 1, weekday: 'mon', between: [1, 7] },
      { name: 'Neither' },
      { name: 'Wide', weekday: 'tue', between: [1, 14] },
      { name: 'Lost', between: [8, 14] },
      { name: 'Odd', day: 0, month: [13], around: [0, 9], when: 'later' },
      { name: 'Odd', day: -1 },
      { name: '', day: 1 },
    ], windows: [{ name: 'Bad', from: '02-30', to: '13-01' }], dates: [{ name: 'Never', on: '2023-02-29' }] })).toEqual([
      ['.days[0]', 'a day of the month (day) or a weekday between two days of it (weekday, between): one of them'],
      ['.days[1]', 'a day of the month (day) or a weekday between two days of it (weekday, between): one of them'],
      ['.days[2].between', 'two days of the month, at most six apart, so one weekday falls between them: [8, 14]'],
      ['.days[3]', 'a day of the month (day) or a weekday between two days of it (weekday, between): one of them'],
      ['.days[3].weekday', 'the weekday that falls between them'],
      ['.days[4].when', 'not a field this version reads (name, short, day, weekday, between, month, around): refused rather than ignored'],
      ['.days[4].day', 'a day of the month, 1 to 31, or -1 to -31 from its end'],
      ['.days[4].month', 'the months it falls in, 1 to 12, each once'],
      ['.days[4].around', 'the days before and after it in its window, 0 to 7 each: [0, 1]'],
      ['.days[5].name', 'Odd is named twice'],
      ['.days[6].name', 'a name, said on the day'],
      ['.windows[0].from', 'a day of the year, MM-DD'],
      ['.windows[0].to', 'a day of the year, MM-DD'],
      ['.dates[0].on', 'a date, YYYY-MM-DD'],
    ]);
    expect(() => resolveCalendar({ dates: [{ name: 'Move', on: '2024-13-15' }] }, false)).toThrow('calendar.dates[0].on: a date, YYYY-MM-DD');
  });

  it('keeps a flow’s own days, windows and dates as written, only their fields', () => {
    const cal = resolveCalendar({ base: 'us-nyc', zone: 'America/New_York', days: [{ name: 'Election Day', weekday: 'tue', between: [2, 8], month: [11] }], windows: [{ name: 'Freeze', from: '12-15', to: '01-02' }], dates: [{ name: 'Move', on: '2024-06-15' }] }, false);
    expect(cal).toEqual({ base: 'us-nyc/1', zone: 'America/New_York', days: [{ name: 'Election Day', weekday: 'tue', between: [2, 8], month: [11] }], windows: [{ name: 'Freeze', from: '12-15', to: '01-02' }], dates: [{ name: 'Move', on: '2024-06-15' }] });
  });
});

describe('a flow’s own days (ADR 0010 §2, phase 3)', () => {
  const cal = (def: Parameters<typeof resolveCalendar>[0]): Calendar => resolveCalendar(def, false);
  const patch = cal({ days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14], around: [0, 1] }] });
  const ends = cal({ days: [{ name: 'Month-end', day: -1 }, { name: 'Quarter-end', day: -1, month: [3, 6, 9, 12] }] });
  const election = cal({ base: 'us-nyc', zone: 'America/New_York', days: [{ name: 'Election Day', weekday: 'tue', between: [2, 8], month: [11] }] });
  const inYear = (c: Calendar, y: number, f: (d: string) => boolean) => span(`${y}-01-01`, `${y}-12-31`).filter(f);

  it('finds a weekday between two days of the month: Patch Tuesday 2024, every month', () => {
    expect(inYear(patch, 2024, (d) => recurringOf(d, patch)?.offset === 0)).toEqual(['2024-01-09', '2024-02-13', '2024-03-12', '2024-04-09', '2024-05-14', '2024-06-11', '2024-07-09', '2024-08-13', '2024-09-10', '2024-10-08', '2024-11-12', '2024-12-10']);
    // around [0, 1]: the Wednesday after is in its window, named for it.
    expect([recurringOf('2024-01-10', patch), namedOf('2024-01-10', patch), isSpecial('2024-01-10', patch), isSpecial('2024-01-11', patch)]).toEqual([{ name: 'Day after Patch Tuesday', of: 'Patch Tuesday', offset: 1 }, 'Day after Patch Tuesday', true, false]);
    // A day that recurs more often than yearly is no holiday judged by last year's: its occurrences judge it, and a
    // day last year that was one is never an ordinary day's comparison.
    expect([holidayOf('2024-01-09', patch), specialOf('2024-01-09', patch), dayLastYear('2024-01-09', patch)]).toEqual([undefined, undefined, '2023-01-17']);
  });

  it('finds a day of the month counted from its end, and a quarter-end in its months', () => {
    expect(inYear(ends, 2024, (d) => recurringOf(d, ends) !== undefined)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30', '2024-07-31', '2024-08-31', '2024-09-30', '2024-10-31', '2024-11-30', '2024-12-31']);
    // Where the two meet the first listed names the day; the quarter-end's own occurrences are its months'.
    expect(recurringOf('2024-03-31', ends)?.of).toBe('Month-end');
    expect(occurrencesBefore('2024-03-31', ends, 6)).toEqual(['2024-02-29', '2024-01-31', '2023-12-31', '2023-11-30', '2023-10-31', '2023-09-30']);
    expect(occurrencesBefore('2024-01-09', patch, 3)).toEqual(['2023-12-12', '2023-11-14', '2023-10-10']);
    expect(occurrencesBefore('2024-01-10', patch, 2)).toEqual(['2023-12-13', '2023-11-15']);
    expect(occurrencesBefore('2024-01-11', patch, 2)).toEqual([]);
  });

  it('makes a day in one month a yearly day, judged as a holiday: Election Day 2021–2025', () => {
    expect([2021, 2022, 2023, 2024, 2025].map((y) => inYear(election, y, (d) => holidayOf(d, election) === 'Election Day'))).toEqual([['2021-11-02'], ['2022-11-08'], ['2023-11-07'], ['2024-11-05'], ['2025-11-04']]);
    expect([dayLastYear('2023-11-07', election), dayLastYear('2022-11-08', election), recurringOf('2023-11-07', election), isSpecial('2023-11-07', election)]).toEqual(['2022-11-08', '2021-11-02', undefined, true]);
    // The days around a yearly day are its window, judged against the same day last year; and the built-in days stay.
    const around = cal({ base: 'us-nyc', days: [{ name: 'Election Day', weekday: 'tue', between: [2, 8], month: [11], around: [1, 0] }] });
    expect([seasonOf('2023-11-06', around), dayLastYear('2023-11-06', around), holidayOf('2023-11-23', around)]).toEqual(['Day before Election Day', '2022-11-07', 'Thanksgiving']);
    // A day that is a built-in holiday keeps the built-in name.
    const clash = cal({ base: 'us', days: [{ name: 'Founders', day: 4, month: [7] }] });
    expect(holidayOf('2024-07-04', clash)).toBe('Independence Day');
  });

  it('puts a window across the new year, and a date on its day', () => {
    const c = cal({ windows: [{ name: 'Change freeze', from: '12-15', to: '01-02' }], dates: [{ name: 'Data centre move', on: '2024-06-15' }] });
    expect(span('2023-12-10', '2024-01-05').filter((d) => seasonOf(d, c) === 'Change freeze')).toEqual(span('2023-12-15', '2024-01-02'));
    expect(dayLastYear('2023-12-20', c)).toBe('2022-12-21');
    // A date is named and never learned from, but no special day: it is judged as any other.
    expect([datedOf('2024-06-15', c), namedOf('2024-06-15', c), isSpecial('2024-06-15', c), specialOf('2024-06-15', c), recurringOf('2024-06-15', c)]).toEqual(['Data centre move', 'Data centre move', true, undefined, undefined]);
  });

  it('says a flow’s own short name in heads', () => {
    const c = cal({ days: [{ name: 'Second Tuesday release', short: 'Release day', weekday: 'tue', between: [8, 14] }] });
    expect([shortName('Second Tuesday release', c), shortName('Martin Luther King Jr. Day', c), shortName('Labor Day')]).toEqual(['Release day', 'MLK Day', 'Labor Day']);
  });

  it('leaves today’s calendar exactly as it was when a flow adds no day', () => {
    const same = cal({ base: 'us-nyc', zone: 'America/New_York' });
    expect(span('2021-01-01', '2024-12-31').every((d) => holidayOf(d, same) === holidayOf(d) && seasonOf(d, same) === seasonOf(d) && dayLastYear(d, same) === dayLastYear(d) && isSpecial(d, same) === isSpecial(d))).toBe(true);
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

describe('the occurrences’ guess (ADR 0010 §2)', () => {
  const FROM = '2022-01-01';
  const days = span(FROM, '2024-12-31');
  const ends = resolveCalendar({ days: [{ name: 'Month-end', day: -1 }] }, false);
  const patch = resolveCalendar({ days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }] }, false);
  // A weekday effect, a slow rise and a little noise; a month-end batch at 1.6× and a Patch Tuesday at +30%.
  let seed = 3;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.04;
  const wd = [0.8, 1.02, 1.03, 1.03, 1.02, 0.97, 0.8];
  const values = days.map((d, k) => {
    const end = plusDays(d, 1).endsWith('-01');
    const tue = new Date(`${d}T12:00:00Z`).getUTCDay() === 2 && Number(d.slice(8)) >= 8 && Number(d.slice(8)) <= 14;
    return 10_000 * wd[new Date(`${d}T12:00:00Z`).getUTCDay()]! * (1 + k / 3000) * Math.exp(noise()) * (end ? 1.6 : 1) * (tue ? 1.3 : 1);
  });
  const series: DailySeries = { from: FROM, values };
  const ends2023 = span('2023-01-01', '2024-12-31').filter((d) => plusDays(d, 1).endsWith('-01'));

  it('judges a month-end against the month-ends before it, moved by how the weeks before them compare', () => {
    const r = new NormalRanges(series, 'count', { calendar: ends });
    const off = ends2023.filter((d) => r.place(r.at(d)!, r.value(d)!) !== 'within');
    expect(off).toEqual([]);
    const g = r.at('2024-05-31')!;
    expect(g).toMatchObject({ special: 'Month-end', spreadFrom: 'occurrences' });
    expect(g.guesses).toHaveLength(1);
    expect(g.guesses[0]!.by).toBe('occurrences');
    expect(g.guesses[0]!.from.map((f) => f.day)).toEqual(['2024-04-30', '2024-03-31', '2024-02-29', '2024-01-31', '2023-12-31', '2023-11-30']);
    expect(g.guesses[0]!.lift).toBeGreaterThan(1.5);
    expect(g.guesses[0]!.lift).toBeLessThan(1.7);
    // Without the day in the calendar, nearly every month-end is far above its range: the rule matters.
    const plain = new NormalRanges(series, 'count', { calendar: NONE });
    expect(ends2023.filter((d) => plain.place(plain.at(d)!, plain.value(d)!) === 'above').length).toBeGreaterThanOrEqual(20);
    // And a month-end is never learned from as an ordinary day: the days after it keep their own range.
    expect(r.at('2024-06-07')!.guesses.flatMap((x) => x.from.map((f) => f.day))).not.toContain('2024-05-31');
  });

  it('judges Patch Tuesday by its own kind, and says the first ones aren’t judged yet', () => {
    const r = new NormalRanges(series, 'count', { calendar: patch });
    expect(span('2023-01-01', '2024-12-31').filter((d) => recurringOf(d, patch) && r.place(r.at(d)!, r.value(d)!) !== 'within')).toEqual([]);
    // The history's first Patch Tuesdays have fewer than three before them.
    expect(r.at('2022-01-11')).toBeNull();
    expect(r.explain('2022-01-11')).toMatchObject({ why: 'too few days', special: 'Patch Tuesday' });
    expect(r.explain('2022-03-08')).toEqual({ why: 'too few times', days: 66, special: 'Patch Tuesday', times: 2 });
    expect(r.at('2022-05-10')).not.toBeNull();
  });
});
