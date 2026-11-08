/**
 * Deciding a held day, on screen (ADR 0009 §12): the drawing each option gets, by the day's cause and on one scale, and
 * the words of the decision sheet, the cause card's pause row, the day after an episode and the Runs view's ribbon,
 * within their budgets.
 */
import { describe, expect, it } from 'vitest';
import { afterLabel, afterLine, dayPausedLine, daySentence, decidedLines, decisionDrawing, goLabel, heldLine, outputPausedLine, pauseLines, ribbonOf, runFigures, sheetText, sheetWords, waitedLabel, type SheetIn, type Sight } from '../src/core/decision.js';
import { HistoryRanges } from '../src/core/history.js';
import { newsOf } from '../src/core/news.js';
import { storyOf, wordsIn } from '../src/core/story.js';
import { historyWith, vendorNames } from './helpers/history.js';

const names = { ...vendorNames, label: (_c: string, v: unknown) => String(v) };
const tell = (h: HistoryRanges, day: string) => storyOf(h, day, newsOf(h, day, names), { names });
const rowsOf = (h: HistoryRanges, day: string) => h.file.rows[h.file.days.indexOf(day)]!;

describe('what readers would get, drawn by the day’s cause (ADR 0009 §12)', () => {
  it('draws a day that falls at an hour as its 24 hours, the short hours lacking, and the day kept as its own 24', () => {
    const h = new HistoryRanges(historyWith({ '2023-09-21': { stopAt: 13 } }));
    const s = tell(h, '2023-09-21');
    expect(s.hero).toBe('hours');
    const d = decisionDrawing(h, s, '2023-09-21', '2023-09-20', { day: rowsOf(h, '2023-09-21'), readers: rowsOf(h, '2023-09-20') });
    expect(d.cause).toBe('hours');
    expect(d.asis).toEqual({ cause: 'hours', hours: s.hours!.got });
    expect(d.usual).toEqual({ cause: 'hours', hours: s.hours!.usual });
    expect(d.dont).toEqual({ cause: 'hours', hours: h.file.hours[h.file.days.indexOf('2023-09-20')] });
    expect(d.short).toEqual([13, 23]);
    expect(d.ticks).toEqual([[0, '0h'], [13, '13h'], [24, '24h']]);
    // One scale: the highest hour of any row or of the usual day.
    expect(d.scale).toBe(Math.max(...s.hours!.usual, ...s.hours!.got, ...(d.dont as { hours: readonly number[] }).hours));
    // Nothing published yet: nothing to keep.
    expect(decisionDrawing(h, s, '2023-09-21', null, { day: 1, readers: null }).dont).toBeNull();
  });

  it('draws a split as the part and the rest, the part named with its trips, and the day kept split by the same value', () => {
    const h = new HistoryRanges(historyWith({ '2022-11-14': { vendorGone: true } }));
    const s = tell(h, '2022-11-14');
    expect(s.split).toMatchObject({ kind: 'vanished', value: '1' });
    const thirteen = h.file.days.indexOf('2022-11-13');
    const d = decisionDrawing(h, s, '2022-11-14', '2022-11-13', { day: rowsOf(h, '2022-11-14'), readers: rowsOf(h, '2022-11-13') });
    expect(d.cause).toBe('split');
    expect(d.part).toBe(`${s.split!.name} · 0`);
    expect(d.asis).toEqual({ cause: 'split', part: 0, rest: s.split!.rest.today });
    const v1 = h.file.values.VendorID!.counts![thirteen]![1]!;
    expect(d.dont).toEqual({ cause: 'split', part: v1, rest: rowsOf(h, '2022-11-13') - v1 });
    expect(d.scale).toBeGreaterThanOrEqual(rowsOf(h, '2022-11-13'));
    expect(d.ticks[0]).toEqual([0, '0']);
    expect(d.ticks[1]![0]).toBe(d.scale);
  });

  it('draws anything else as the week to the day, what it lacks below its range on its own column, and without a history the day alone', () => {
    const h = new HistoryRanges(historyWith({ '2023-06-07': { more: 0.6 } }));
    const s = tell(h, '2023-06-07');
    const d = decisionDrawing(h, { ...s, hero: 'amount', split: null }, '2023-06-07', '2023-06-06', { day: rowsOf(h, '2023-06-07'), readers: rowsOf(h, '2023-06-06') });
    expect(d.cause).toBe('amount');
    const days = (d.asis as { days: readonly number[] }).days;
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toBe(rowsOf(h, '2023-06-07'));
    expect((d.dont as { days: readonly number[] }).days.at(-1)).toBe(rowsOf(h, '2023-06-06'));
    // Below its range, the day lacks up to its usual count.
    expect((d.usual as { days: readonly number[] }).days.at(-1)).toBe(h.of({ of: 'trips' })!.at('2023-06-07')!.expected);
    expect(d.ticks).toEqual([[0, 'Thu 1'], [6, 'Wed 7']]);
    const bare = decisionDrawing(null, null, '2024-01-03', '2024-01-02', { day: 9555, readers: 8000 });
    expect(bare).toMatchObject({ cause: 'amount', asis: { days: [9555] }, dont: { days: [8000] }, ticks: [] });
    expect(bare.scale).toBe(9555);
  });
});

describe('the decision sheet’s words (ADR 0009 §12: 45 at a glance)', () => {
  const thu: SheetIn = { day: '2023-09-21', waited: 120, otherBuild: false, outputs: 3, rows: 41_939, reach: 37_935, readers: { day: '2023-09-20', rows: 102_870 }, later: null, part: null, ticks: ['0h', '13h', '24h'], unjudged: false, hash: '8324c8f4ab', may: true, deciders: 'Owner', head: 'Trips fall 95% from 13:00' };

  it('names the day, each option with one number, the reasons, and a button that names the result beside the hash', () => {
    const t = sheetText(thu);
    expect(t.title).toBe('Thu Sep 21 · what readers get');
    expect(t.status).toBe('Waiting 2 h');
    // The numbers are what readers get: the trips that reach the outputs, past the checks, on both rows.
    expect(t.options.map((o) => [o.label, o.number])).toEqual([['Publish as is', '37,935'], ['Don’t publish', 'Wed 20 · 102,870']]);
    for (const o of t.options) expect(wordsIn(o.label)).toBeLessThanOrEqual(4);
    expect(t.options[0]!.aria).toContain('37,935 trips past its checks, of 41,939 that arrived');
    expect(t.options[1]!.aria).toContain('102,870 trips');
    expect(sheetText({ ...thu, reach: null }).options[0]!.number).toBe('41,939');
    // What a decision covers, named by its effect: a day that publishes ends it, not one that passes.
    expect(t.scopes).toEqual(['This day', 'Until a day publishes']);
    expect(t.chips).toEqual(['Real change', 'Source confirmed', 'Known outage']);
    expect(t.go).toEqual(['Decide', 'Publish as is · 3 outputs', 'Don’t publish Thu 21', 'Don’t publish from Thu 21']);
    expect(t.hash).toBe('8324 c8f4');
    expect(t.denied).toBeNull();
    expect(sheetWords(t)).toBe(40);
  });

  it('stays within 45 words in its wordiest case: a split’s part, a later day published, another build’s decision', () => {
    const t = sheetText({ ...thu, part: 'Vendor 1 · 2', ticks: ['0', '120k'], later: '2023-09-25', otherBuild: true, waited: 3000 });
    expect(t.options[0]).toMatchObject({ number: 'Mon 25 is published', off: true });
    expect(t.status).toBe('Other build’s decision');
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
    // A day not judged (no history) offers its reason, and has no drawing words; still within 45.
    const xs = sheetText({ ...thu, unjudged: true, ticks: [], later: '2024-01-05', readers: null });
    expect(xs.chips[0]).toBe('No history');
    expect(xs.options[1]!.number).toBe('nothing shown');
    expect(sheetWords(xs)).toBeLessThanOrEqual(45);
  });

  it('says who decides in the button’s place for someone who may not', () => {
    const t = sheetText({ ...thu, may: false });
    expect(t.denied).toBe('Only Owner decides');
    expect(sheetWords(t)).toBeLessThan(sheetWords(sheetText(thu)));
    expect(goLabel('dont', 'untilPass', 3, null)).toBe('Don’t publish this run');
    expect(goLabel('asis', 'day', 1, '2023-09-21')).toBe('Publish as is · 1 output');
  });

  it('says how long a day has waited, and how long after it was held it was decided', () => {
    expect([0.2, 5, 125, 60 * 50].map(waitedLabel)).toEqual(['Waiting <1 min', 'Waiting 5 min', 'Waiting 2 h', 'Waiting 2 days']);
    expect(waitedLabel(null)).toBeNull();
    expect(afterLabel(26)).toBe('26 min after');
  });
});

describe('the cause card’s pause row, the day after an episode, and the record of decisions (ADR 0009 §12)', () => {
  it('says what waits with one verb, Decide; whom it waits on for someone who may not decide; then the receipt', () => {
    const base = { outputs: 3, who: null, at: null, under: null, may: true, deciders: 'Owner' };
    expect(pauseLines({ ...base, state: 'waiting' })).toEqual({ reach: 'Paused · 3 outputs waiting', verb: 'Decide' });
    expect(pauseLines({ ...base, state: 'waiting', may: false })).toEqual({ reach: 'Paused · waiting on Owner', verb: null });
    expect(pauseLines({ ...base, state: 'asis', who: 'Owner', at: '09:40' })).toEqual({ reach: 'Published as is · Owner · 09:40', verb: null });
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', at: '09:41' }).reach).toBe('Not published · Owner · 09:41');
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', under: 'Fri' }).reach).toBe('Not published · under Fri’s decision');
    // A decision that stands says it closes the days after it too.
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', at: '09:24', standing: true }).reach).toBe('Unpublished until a day publishes');
    // Every held output already showing its versions: published as is, by nobody.
    expect(pauseLines({ ...base, state: 'asis' }).reach).toBe('Published as is');
    // Never more words than the row it replaces and the verb: 4 + 1.
    for (const s of ['waiting', 'asis', 'dont'] as const) for (const may of [true, false]) for (const standing of [false, true]) {
      const l = pauseLines({ ...base, state: s, may, who: 'Owner', at: '09:40', under: s === 'dont' && !standing ? 'Fri' : null, standing });
      expect(wordsIn(l.reach) + (l.verb ? wordsIn(l.verb) : 0)).toBeLessThanOrEqual(6);
    }
  });

  it('says the day held under the strip, readers’ day and Decide; and atop a waiting output’s News, that it waits', () => {
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-18', may: true, standing: false })).toEqual({ text: 'Paused · readers see Mon 18', verb: 'Decide' });
    expect(dayPausedLine({ state: 'waiting', readers: null, may: false, standing: false })).toEqual({ text: 'Paused · nothing published yet', verb: null });
    expect(dayPausedLine({ state: 'asis', readers: '2023-09-21', may: true, standing: false })).toEqual({ text: 'Published as is', verb: null });
    expect(dayPausedLine({ state: 'dont', readers: '2022-11-13', may: true, standing: true }).text).toBe('Unpublished until a day publishes · readers see Sun 13');
    // The day readers see, with its age once it is stale: Tue 19 and Wed 20 not run in this visit.
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-18', may: true, standing: false, day: '2023-09-21' })).toEqual({ text: 'Paused · readers see Mon 18 · 3 days old', verb: 'Decide' });
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-20', may: true, standing: false, day: '2023-09-21' }).text).toBe('Paused · readers see Wed 20');
    expect(outputPausedLine({ state: 'waiting', may: true, deciders: 'Owner', standing: false })).toEqual({ text: 'Waits for a decision', verb: 'Decide' });
    expect(outputPausedLine({ state: 'waiting', may: false, deciders: 'Owner', standing: false })).toEqual({ text: 'Waits on Owner', verb: null });
    expect(outputPausedLine({ state: 'dont', may: true, deciders: 'Owner', standing: false }).text).toBe('Not published');
    // A line, not a paragraph: at most 8 words with its verb, in every state.
    for (const state of ['waiting', 'asis', 'dont'] as const) for (const standing of [false, true]) {
      const l = dayPausedLine({ state, readers: '2023-09-18', may: true, standing, day: '2023-09-21' });
      expect(wordsIn(l.text) + (l.verb ? wordsIn(l.verb) : 0)).toBeLessThanOrEqual(10);
    }
  });

  it('says what held a day with no story plainly: no history to judge it by, or none for the day; any other hold in its own words', () => {
    const unjudged = { by: 'unjudged', origin: 'trips', said: 'no claim for trips' } as const;
    expect(heldLine(unjudged, false)).toBe('trips: no history to judge it by');
    expect(heldLine(unjudged, true)).toBe('trips: the history doesn’t have this day');
    // A claim that came but didn't match is evidence: said as the plugin says it.
    expect(heldLine({ by: 'unjudged', origin: 'trips', said: 'the claim is of 2023-09-20, the run of 2023-09-21' }, true)).toBe('trips: the claim is of 2023-09-20, the run of 2023-09-21');
    expect(heldLine({ by: 'checks', origin: 'trips_valid', said: '45.67% dropped, more than 10%' }, true)).toBe('trips_valid: 45.67% dropped, more than 10%');
  });

  it('says what became of an episode’s days the day after it, what still waits first', () => {
    expect(afterLine([{ day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'dont' }, { day: '2023-09-23', state: 'dont' }, { day: '2023-09-24', state: 'dont' }])).toBe('Thu as is · Fri–Sun not published');
    expect(afterLine([{ day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'waiting' }, { day: '2023-09-23', state: 'waiting' }, { day: '2023-09-24', state: null }])).toBe('Fri–Sat waiting · Thu as is');
    expect(afterLine([{ day: '2022-11-14', state: 'published' }, { day: '2022-11-16', state: 'published' }])).toBe('Mon, Wed published');
    expect(afterLine([{ day: '2023-09-21', state: null }])).toBeNull();
  });

  it('puts the paused days on a ribbon by month, each once, and says a day’s decision in three lines', () => {
    const r = ribbonOf([{ day: '2023-09-22', state: 'dont' }, { day: '2022-11-14', state: 'waiting' }, { day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'dont' }]);
    expect(r).toEqual([
      { month: 'Nov 2022', days: [{ day: '2022-11-14', date: '14', state: 'waiting' }] },
      { month: 'Sep 2023', days: [{ day: '2023-09-21', date: '21', state: 'asis' }, { day: '2023-09-22', date: '22', state: 'dont' }] },
    ]);
    expect(decidedLines({ day: '2023-09-21', state: 'asis', who: 'Owner', minutes: 26, reason: 'Real change', run: 41, seq: 212, under: null })).toEqual({ head: 'Thu Sep 21 · published as is', who: 'Owner · 26 min after · Real change', where: 'Run 41 · record #212 ✓' });
    expect(decidedLines({ day: '2023-09-23', state: 'dont', who: 'Owner', minutes: 1, reason: null, run: null, seq: 230, under: 'Fri' })).toEqual({ head: 'Sat Sep 23 · not published', who: 'Under Fri’s decision', where: 'record #230 ✓' });
    expect(decidedLines({ day: '2022-11-14', state: 'waiting', who: null, minutes: 125, reason: null, run: 7, seq: null, under: null })).toEqual({ head: 'Mon Nov 14 · waiting', who: 'Waiting 2 h', where: 'Run 7' });
  });

  it('says a run on the status line in one day sentence for every viewer, of what they may see', () => {
    const waiting = { state: 'waiting' as const, readers: '2023-09-20', standing: false, may: false, deciders: 'Owner' };
    // Someone who reads the day's story gets its head; the pause is its mark.
    expect(daySentence({ day: '2023-09-21', head: 'Trips fall 95% from 13:00', wrong: true, pause: { ...waiting, may: true } })).toBe('Thu Sep 21: Trips fall 95% from 13:00');
    expect(daySentence({ day: '2023-09-18', head: 'A normal Monday', wrong: false, pause: null })).toBe('Mon Sep 18: A normal Monday');
    // Someone the source is closed to gets what became of the day, naming no source and telling no story.
    expect(daySentence({ day: '2023-09-21', head: null, wrong: false, pause: waiting })).toBe('Thu Sep 21: paused · readers see Wed 20 · waits on Owner');
    expect(daySentence({ day: '2023-09-21', head: null, wrong: false, pause: { ...waiting, may: true } })).toBe('Thu Sep 21: paused · readers see Wed 20');
    expect(daySentence({ day: '2023-09-21', head: null, wrong: false, pause: { ...waiting, state: 'asis' } })).toBe('Thu Sep 21: published as is');
    expect(daySentence({ day: '2023-09-22', head: null, wrong: false, pause: { ...waiting, state: 'dont', standing: true } })).toBe('Fri Sep 22: unpublished until a day publishes · readers see Wed 20');
    expect(daySentence({ day: '2023-09-18', head: null, wrong: false, pause: null })).toBe('Mon Sep 18: published');
    // Dev on Tue Nov 8, 2022: held for Extras, a column closed to him, his own story calm: the pause, not a calm head.
    expect(daySentence({ day: '2022-11-08', head: 'A normal Tuesday', wrong: false, pause: waiting })).toBe('Tue Nov 8: paused · readers see Wed 20 · waits on Owner');
  });

  it('puts a run’s figures in the line’s title, a node closed to the viewer neither counted nor named, a hold’s words only to who reads all of it', () => {
    const nodes = [
      { origin: 'trips', status: 'built' }, { origin: 'trips_valid', status: 'built' }, { origin: 'zones', status: 'reused' },
      { origin: 'zone_hour', status: 'built' }, { origin: 'weather', status: 'folded' },
    ];
    const holds = [{ origin: 'trips', said: 'Trips fall 95% from 13:00' }, { origin: 'trips_valid', said: '10.45% of arrived rows dropped' }];
    const figures = (sight: (id: string) => Sight, h = holds) => runFigures({ day: '2023-09-21', run: 15, ms: '820 ms', nodes, holds: h, sight, page: false });
    expect(figures(() => 'all')).toBe('Thu Sep 21: Run 15 took 820 ms: 3 built, 1 reused, 1 folded; held: trips, Trips fall 95% from 13:00; trips_valid, 10.45% of arrived rows dropped.');
    // Ana: the trips and their checks are closed to her; zone_hour she reads some rows of.
    const ana = (id: string): Sight => (id === 'trips' || id === 'trips_valid' ? 'closed' : id === 'zone_hour' ? 'some' : 'all');
    const said = figures(ana);
    expect(said).toBe('Thu Sep 21: Run 15 took 820 ms: 1 built, 1 reused, 1 folded; held.');
    expect(said).not.toMatch(/trips|13:00|95%/);
    // Dev reads the trips without their fares: the source named, never the flow's story told over every column.
    const dev = (id: string): Sight => (id === 'trips' || id === 'trips_valid' ? 'some' : 'all');
    expect(figures(dev)).toBe('Thu Sep 21: Run 15 took 820 ms: 3 built, 1 reused, 1 folded; held: trips; trips_valid.');
    // A run that published says nothing held; the engine in the page says so.
    expect(runFigures({ day: null, run: 2, ms: '1.2 s', nodes, holds: [], sight: () => 'all', page: true })).toBe('Run 2 took 1.2 s: 3 built, 1 reused, 1 folded (the engine runs in the page here).');
  });
});
