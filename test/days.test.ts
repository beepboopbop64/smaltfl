/**
 * What a day's own view shows (ADR 0008 §10): its own run, or after a held or refused run the latest day before it that
 * passed, said as such; never a day after it, whatever order the days were run in.
 */
import { describe, expect, it } from 'vitest';
import { wordsIn } from '../src/core/story.js';
import { calendarHead, dayMid, heldLoadLine, lacked, readersSee, reachLabel, dayShort, noRowsBefore, rowsFrom, shortfall, shownRun, stagedBar, stoppedLine, toldLine, type EpisodeDay } from '../src/core/days.js';

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
    expect(rowsFrom('2023-09-21', '2023-09-22')).toBe('Rows from Thu Sep 21 · the last day published');
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

describe('an episode’s shortfall', () => {
  const usual = Array.from({ length: 24 }, () => 5000);
  const got = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 300));
  const fall = { day: '2023-09-21', from: 13, to: 23, got, usual };
  const days: EpisodeDay[] = [
    { day: '2023-09-21', got, low: 90_000, expected: 120_000, alert: true },
    { day: '2023-09-22', got: got.map(() => 1), low: 85_000, expected: 110_000, alert: true },
    { day: '2023-09-23', got: got.map(() => 1), low: 80_000, expected: 104_000, alert: true },
  ];

  it('counts the day the trips fell as its head does, and nothing after the viewed day', () => {
    // Thu: 11 hours of 5,000 usual, 300 came: 51,700 missing; the bound scales the usual to the range's low.
    expect(shortfall(days, fall, '2023-09-21')).toEqual({ estimate: 51_700, bound: 11 * 5000 * 0.75 - 3300 });
    // Fri adds its own whole day, Sat not yet.
    const fri = shortfall(days, fall, '2023-09-22');
    expect(fri.estimate).toBe(51_700 + 110_000 - 24);
    expect(fri.bound).toBe(11 * 5000 * 0.75 - 3300 + 85_000 - 24);
    expect(shortfall(days, fall, '2023-09-23').estimate).toBe(51_700 + 110_000 - 24 + 104_000 - 24);
  });

  it('skips days that weren’t wrong, and days before the fall', () => {
    const calm: EpisodeDay = { day: '2023-09-22', got: usual, low: 85_000, expected: 120_000, alert: false };
    const before: EpisodeDay = { day: '2023-09-20', got: got.map(() => 0), low: 85_000, expected: 120_000, alert: true };
    expect(shortfall([before, days[0]!, calm], fall, '2023-09-22').estimate).toBe(51_700);
  });
});

describe('the History calendar’s header', () => {
  it('counts no wrong days until every day is checked, then says them', () => {
    const v = new Map<string, string>([['2023-09-21', 'alert'], ['2023-09-20', 'ok']]);
    expect(calendarHead(v, 825)).toBe('Checking every day · 2 of 825');
    expect(calendarHead(v, 825)).not.toMatch(/wrong/);
    const all = new Map<string, string>(Array.from({ length: 825 }, (_, k) => [String(k), k < 9 ? 'alert' : k < 50 ? 'warn' : k % 3 ? 'ok' : 'note']));
    expect(calendarHead(all, 825)).toBe('825 days · 9 wrong · 41 unusual');
    // Stopped at the day on screen: the days after it aren't counted, and it says to when.
    expect(calendarHead(all, 825, '2023-09-21')).toBe('825 days to Thu Sep 21 · 9 wrong · 41 unusual');
  });
});

describe('what the outputs of a day with something wrong say', () => {
  const base = { severity: 'alert', split: null, hours: null, amount: { value: 40_000, low: 90_000, expected: 120_000 }, gate: { held: false } };
  it('names what the load lacked, never "published" alone', () => {
    // Hours fall short, as the head says them, and are never said to be missing: trips still came in them.
    expect(lacked({ ...base, hours: { from: 13, to: 23, fall: 95 } })).toEqual({ short: 'from a short day', long: 'Built from a load 95% short from 13:00' });
    expect(lacked({ ...base, hours: { from: 6, to: 15, fall: 97 } })!.long).toBe('Built from a load 97% short 06:00–16:00');
    expect(lacked({ ...base, hours: { from: 0, to: 6, fall: 90 } })!.long).toBe('Built from a load 90% short until 07:00');
    // A part is "without" only under a tenth of its usual count, as its head's "almost gone"; else it was short.
    expect(lacked({ ...base, split: { kind: 'vanished', name: 'Vendor 1', part: { today: 3, usual: 35_000 } } })).toEqual({ short: 'without Vendor 1', long: 'Built without Vendor 1’s trips' });
    expect(lacked({ ...base, split: { kind: 'vanished', name: 'Vendor 1', part: { today: 5197, usual: 33_607 } } })).toEqual({ short: 'with Vendor 1 short', long: 'Built with Vendor 1’s trips 85% short' });
    expect(lacked(base)).toEqual({ short: 'from a short day', long: 'Built from a short day (−67% trips)' });
    expect(lacked({ ...base, amount: { value: 100_000, low: 90_000, expected: 120_000 } })!.short).toBe('from a day with an alert');
    expect(lacked({ ...base, severity: 'warn' })).toBeNull();
  });

  it('says a held load to someone who can’t read its story from the flow’s verdict, naming no source, value or figure', () => {
    const claim = (below: boolean) => ({ by: 'story' as const, claim: { state: 'wrong', below } });
    // Thu Sep 21, 2023 as Ana sees zone_hour: the trips closed to her, held by the story, the day short.
    expect(heldLoadLine([claim(true)])).toBe('Built from a short load');
    // Fri Sep 22: held by its checks too, still said by what the story found.
    expect(heldLoadLine([{ by: 'checks' }, claim(true)])).toBe('Built from a short load');
    // Tue Nov 8, 2022 as Dev sees it: held for Extras, a column closed to him; the trips in their range.
    expect(heldLoadLine([claim(false)])).toBe('Built from a load with something wrong');
    expect(heldLoadLine([{ by: 'checks' }])).toBe('Built from a load its checks held');
    expect(heldLoadLine([{ by: 'unjudged' }])).toBe('Built from a load not yet judged');
    expect(heldLoadLine([])).toBeNull();
    for (const s of [heldLoadLine([claim(true)]), heldLoadLine([claim(false)]), heldLoadLine([{ by: 'checks' }]), heldLoadLine([{ by: 'unjudged' }])]) {
      expect(s).not.toMatch(/trips|\d/);
      expect(wordsIn(s!)).toBeLessThanOrEqual(8);
    }
  });

  it('lets the icon’s boxes carry up to three outputs, and says a held day’s are not published', () => {
    expect(reachLabel(base, 3)).toBe('Outputs built from a short day');
    expect(reachLabel(base, 1)).toBe('Output built from a short day');
    expect(reachLabel(base, 5)).toBe('5 outputs built from a short day');
    expect(reachLabel({ ...base, gate: { held: true } }, 3)).toBe('Outputs not published');
    expect(reachLabel({ ...base, severity: 'warn' }, 2)).toBe('Reaches 2 outputs');
  });

  it('says what became of a paused day’s outputs: waiting, published as is, not published (ADR 0009 §12)', () => {
    expect(reachLabel(base, 3, 'waiting')).toBe('Paused · 3 outputs waiting');
    expect(reachLabel(base, 1, 'waiting')).toBe('Paused · 1 output waiting');
    // The checks' hold is a pause too, once the flow says what holds it.
    expect(reachLabel({ ...base, gate: { held: true } }, 3, 'waiting')).toBe('Paused · 3 outputs waiting');
    expect(reachLabel(base, 3, 'asis')).toBe('Published as is');
    expect(reachLabel(base, 3, 'dont')).toBe('Not published');
    // At most four words, as the cause card's reach row has room for.
    for (const p of ['waiting', 'asis', 'dont'] as const) expect(reachLabel(base, 6, p).split(/\s+/).filter((w) => w !== '·').length).toBeLessThanOrEqual(4);
  });
});

describe('a held day’s own rows, staged (ADR 0009 §12)', () => {
  it('sit under a bar naming the day staged and the day readers see', () => {
    expect(stagedBar('2023-09-21', '2023-09-20')).toBe('Staged Thu 21 · readers see Wed 20');
    expect(stagedBar('2023-09-21', null)).toBe('Staged Thu 21 · nothing published yet');
    // Published as is: its rows are what readers see, and no bar.
    expect(stagedBar('2023-09-21', '2023-09-21')).toBeNull();
  });

  it('say how old the day readers see is once it is two days or more before the day held', () => {
    // Tue 19 and Wed 20 not run in this visit: readers still see Mon 18, and the bar says it is stale.
    expect(stagedBar('2023-09-21', '2023-09-18')).toBe('Staged Thu 21 · readers see Mon 18 · 3 days old');
    expect(readersSee('2023-09-20', '2023-09-21')).toBe('readers see Wed 20');
    expect(readersSee('2022-11-12', '2022-11-15')).toBe('readers see Sat 12 · 3 days old');
    // Across a month's end, by the calendar.
    expect(readersSee('2023-08-30', '2023-09-01')).toBe('readers see Wed 30 · 2 days old');
    expect(readersSee(null, '2023-09-21')).toBe('nothing published yet');
    expect(readersSee('2023-09-18', null)).toBe('readers see Mon 18');
  });
});

describe('a source told during an episode (ADR 0008 §11)', () => {
  it('is said on each later day of the episode by the load’s day, and never from a day after the one viewed', () => {
    const log = [{ day: '2023-09-20', act: 'notify' }, { day: '2023-09-22', act: 'expected' }, { day: '2023-09-22', act: 'notify' }];
    // Told on Fri 22: Sat 23 says so; Fri 22 says today; Thu 21, before it, doesn't.
    expect(toldLine(log, '2023-09-21', '2023-09-23')).toBe('Source told on Fri');
    expect(toldLine(log, '2023-09-21', '2023-09-22')).toBe('Source told today');
    expect(toldLine(log, '2023-09-21', '2023-09-21')).toBeNull();
    // A note before the episode began is another episode's.
    expect(toldLine([{ day: '2023-09-20', act: 'notify' }], '2023-09-21', '2023-09-23')).toBeNull();
  });
});
