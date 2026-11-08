/**
 * What a day's own view shows (ADR 0008 §10): its own run, or after a held or refused run the latest day before it that
 * passed, said as such; never a day after it, whatever order the days were run in.
 */
import { describe, expect, it } from 'vitest';
import { dayMid, dayShort, noRowsBefore, rowsFrom, shownRun, stoppedLine } from '../src/core/days.js';

describe('the run a day shows', () => {
  it('is the day’s own newest run when it passed', () => {
    // Newest first: Thu 21 ran twice (an edit), then Fri 22 passed.
    expect(shownRun(['2023-09-22', '2023-09-21', '2023-09-21', '2023-09-18'], '2023-09-21')).toBe(1);
    expect(shownRun(['2023-09-22', '2023-09-21'], '2023-09-22')).toBe(0);
  });

  it('is the latest day before it that passed after a held run, whatever ran last', () => {
    // Stepped Mon 18 to Tue 26 (Fri 22 to Sun 24 held, so not in the list), then back to Sat 23: Thu 21, not Tue 26.
    const runs = ['2023-09-26', '2023-09-25', '2023-09-21', '2023-09-20', '2023-09-19', '2023-09-18'];
    expect(shownRun(runs, '2023-09-23')).toBe(2);
    // Thu 21 ran before Mon 18 was run again: the latest day, not the latest run.
    expect(shownRun(['2023-09-18', '2023-09-21'], '2023-09-22')).toBe(1);
    // Fri 22 reached straight from Mon 18 (the episode's first day): Mon 18 is what the engine has, and it is said so.
    expect(shownRun(['2023-09-18', '2024-01-01'], '2023-09-22')).toBe(0);
  });

  it('is never a day after it', () => {
    expect(shownRun(['2023-09-26', '2023-09-25'], '2023-09-23')).toBe(-1);
    expect(shownRun([], '2023-09-23')).toBe(-1);
  });

  it('is the newest run for a flow without daily loads', () => {
    expect(shownRun([undefined, undefined], undefined)).toBe(0);
    expect(shownRun([], null)).toBe(-1);
  });
});

describe('what the screens say of it', () => {
  it('names days short', () => {
    expect(dayShort('2023-09-21')).toBe('Thu 21');
    expect(dayMid('2023-09-21')).toBe('Thu Sep 21');
    expect(dayMid('2022-09-17')).toBe('Sat Sep 17');
  });

  it('says what stopped the run and what the outputs keep, in one line', () => {
    expect(stoppedLine({ refused: false, origin: 'trips_valid', shown: '2023-09-21', viewed: '2023-09-22' })).toEqual({ lead: 'Held at trips_valid', tail: 'outputs keep Thu 21' });
    expect(stoppedLine({ refused: true, origin: 'trips', shown: '2023-09-21', viewed: '2023-09-22' })).toEqual({ lead: 'File refused', tail: 'outputs keep Thu 21' });
    expect(stoppedLine({ refused: false, origin: 'trips_valid', shown: undefined, viewed: '2023-09-22' }).tail).toBe('nothing passed before');
    expect(stoppedLine({ refused: false, origin: 'trips_valid', shown: '2023-09-22', viewed: '2023-09-22' }).tail).toBe('outputs keep its last run');
    expect(stoppedLine({ refused: false, shown: '2023-09-21', viewed: '2023-09-22' }).lead).toBe('The run stopped');
  });

  it('puts another day’s rows under a bar naming that day, and the day’s own under none', () => {
    expect(rowsFrom('2023-09-21', '2023-09-22')).toBe('Rows from Thu Sep 21 · the last day that passed');
    expect(rowsFrom('2023-09-22', '2023-09-22')).toBeNull();
    expect(rowsFrom(undefined, '2023-09-22')).toBeNull();
    expect(noRowsBefore('2023-09-23')).toBe('No rows: no day before Sat 23 passed in this visit');
  });

  it('labels the run a held day shows with that run’s own day, stepping forward and back', () => {
    // A visit: each step runs a day; a held day adds no run. The label is checked on every step, as a page would show.
    const held = new Set(['2023-09-22', '2023-09-23', '2023-09-24']);
    const visit = ['2023-09-18', '2023-09-19', '2023-09-20', '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24', '2023-09-25', '2023-09-26', '2023-09-23', '2023-09-21', '2023-09-22'];
    const runs: string[] = [];
    const said: (string | null)[] = [];
    for (const day of visit) {
      if (!held.has(day)) runs.unshift(day);
      const k = shownRun(runs, day);
      const shown = k < 0 ? null : runs[k]!;
      expect(shown === null || shown <= day).toBe(true);
      said.push(held.has(day) ? stoppedLine({ refused: false, origin: 'trips_valid', shown, viewed: day }).tail : rowsFrom(shown, day));
    }
    expect(said).toEqual([null, null, null, null, 'outputs keep Thu 21', 'outputs keep Thu 21', 'outputs keep Thu 21', null, null, 'outputs keep Thu 21', null, 'outputs keep Thu 21']);
  });
});
