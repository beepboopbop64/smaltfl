/**
 * Deciding a held day, on screen (ADR 0009 §12): the drawing each option gets, by the day's cause and on one scale, and
 * the words of the decision sheet, the cause card's pause row, the day after an episode and the Runs view's ribbon,
 * within their budgets.
 */
import { describe, expect, it } from 'vitest';
import { afterLabel, afterLine, dayPausedLine, daySentence, decidedLines, decisionDrawing, goLabel, heldLine, outputPausedLine, passedLine, pausedChecks, pauseLines, pauseReasons, pauseWords, receiptLines, ribbonOf, runFigures, sheetShown, sheetText, sheetWords, waitedLabel, type SheetIn, type SheetPick, type SheetText, type Sight } from '../src/core/decision.js';
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
    // The hour the trips fell is marked on the Publish row; the hours need no axis under the day kept.
    expect(d.ticks).toEqual([]);
    expect(d.cut).toEqual([13, '13h']);
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
  const thu: SheetIn = { day: '2023-09-21', waited: 120, otherBuild: false, outputs: 3, rows: 41_939, reach: 37_935, readers: { day: '2023-09-20', rows: 108_434 }, later: null, checks: null, part: null, missing: '~77k missing', cut: '13h', ticks: [], unjudged: false, hash: '8324c8f4ab', may: true, deciders: 'Owner', head: 'Trips fall 95% from 13:00' };
  const rest: SheetPick = { option: null, scope: 'day', reason: null };
  const words = (t: SheetText, p: SheetPick) => sheetShown(t, p).reduce((n, x) => n + wordsIn(x), 0);

  it('names the day, each option with what its drawing shows and its unit, the trips past the checks under it, and Keep beside the day readers keep', () => {
    const t = sheetText(thu);
    expect(t.title).toBe('Thu Sep 21 · what readers get');
    expect(t.status).toBe('Waiting 2 h');
    // The number is what the drawing shows, as the card counts it (41,939 arrived), with its unit; the trips that reach
    // the outputs, past the checks, are said under it: one count per drawing, each labelled.
    expect(t.options.map((o) => [o.label, o.number, o.sub])).toEqual([['Publish as is', '41,939 trips', '37,935 after checks'], ['Keep Wed 20', '108,434 trips', null]]);
    for (const o of t.options) expect(wordsIn(o.label)).toBeLessThanOrEqual(4);
    expect(t.options[0]!.aria).toContain('41,939 trips, 37,935 of them past its checks');
    expect(t.options[1]!.aria).toContain('readers keep Wed Sep 20, 108,434 trips');
    expect(sheetText({ ...thu, reach: null }).options[0]!.sub).toBeNull();
    // The drawing's own words: the trips the short hours lack, and the hour they fell, on the Publish row.
    expect([t.missing, t.cut]).toEqual(['~77k missing', '13h']);
    // Nothing published yet: nothing to keep.
    expect(sheetText({ ...thu, readers: null }).options[1]).toMatchObject({ label: 'Don’t publish', number: 'nothing shown' });
    // A day kept that is stale says its age under it.
    expect(sheetText({ ...thu, readers: { day: '2023-09-18', rows: 89_571 } }).options[1]!.sub).toBe('3 days old');
    // How long it has waited, said by the clock it was held at when that was today: "Paused since 10:31", never
    // "Waiting <1 min"; held on an earlier day, by how long.
    expect(sheetText({ ...thu, waited: 0.4, since: '10:31' }).status).toBe('Paused since 10:31');
    expect(sheetText({ ...thu, waited: 60 * 50, since: null }).status).toBe('Waiting 2 days');
  });

  it('says on the Publish row what it overrides when the checks held the day too, and the button names it', () => {
    // Fri Sep 22, 2023: 4,633 arrived, the checks dropped 46% against their 10% limit, 2,517 left.
    const fri = sheetText({ ...thu, day: '2023-09-22', rows: 4_633, reach: 2_517, readers: { day: '2023-09-21', rows: 41_939 }, checks: { share: 0.4567, limit: 0.1 }, part: 'Flex Fare · 4,613', missing: null, cut: null, ticks: ['0', '115k'] });
    expect(fri.options[0]).toMatchObject({ number: '4,633 trips', sub: '2,517 after checks', warn: 'Overrides checks: 45.7% dropped (limit 10%)' });
    expect(fri.options[0]!.aria).toContain('this overrides its checks, which held it: 45.7% dropped (limit 10%)');
    expect(fri.go.asis).toBe('Publish over the checks · 3 outputs');
    // Near the limit, the share to the decimals that keep it off the limit (Sun Sep 18, 2022: 10.45%).
    expect(sheetText({ ...thu, checks: { share: 0.1045, limit: 0.1 } }).options[0]!.warn).toBe('Overrides checks: 10.45% dropped (limit 10%)');
    expect(sheetText(thu).options[0]!.warn).toBeNull();
    expect(sheetText(thu).go.asis).toBe('Publish as is · 3 outputs');
  });

  it('shows the reasons that fit the option picked under Why?, the scope only under Don’t publish, and a button that says what is missing', () => {
    const t = sheetText(thu);
    expect(t.why).toEqual({ asis: 'Why? (needed)', dont: 'Why?' });
    expect(t.chips).toEqual({ asis: ['Real change', 'Source confirmed'], dont: ['Known outage', 'Re-send expected'] });
    expect(t.scopes).toEqual(['Just Thu 21', 'Until a later day passes']);
    expect(t.go).toEqual({ rest: 'Pick an option', reason: 'Pick a reason', asis: 'Publish as is · 3 outputs', dont: 'Don’t publish Thu 21', until: 'Don’t publish from Thu 21' });
    // At rest: both rows in full, no reasons, no scope.
    const r = sheetShown(t, rest);
    expect(r).toContain('37,935 after checks');
    expect(r).not.toContain('Real change');
    expect(r).not.toContain('Just Thu 21');
    expect(r.at(-1)).toBe('Pick an option');
    // Publish as is picked: its reasons, no scope, and the button asks for a reason until one is picked.
    const asis = sheetShown(t, { option: 'asis', scope: 'day', reason: null });
    expect(asis).toEqual(expect.arrayContaining(['Why? (needed)', 'Real change', 'Source confirmed', 'Pick a reason']));
    expect(asis).not.toContain('Known outage');
    expect(asis).not.toContain('Just Thu 21');
    expect(sheetShown(t, { option: 'asis', scope: 'day', reason: 'Real change' }).at(-1)).toBe('Publish as is · 3 outputs');
    // Don't publish picked: its reasons and the scope; the Publish row keeps its drawing, not what is under it.
    const dont = sheetShown(t, { option: 'dont', scope: 'untilPass', reason: null });
    expect(dont).toEqual(expect.arrayContaining(['Why?', 'Known outage', 'Just Thu 21', 'Until a later day passes', 'Don’t publish from Thu 21']));
    expect(dont).not.toContain('37,935 after checks');
    expect(sheetWords(t)).toBe(Math.max(words(t, rest), words(t, { option: 'asis', scope: 'day', reason: 'x' }), words(t, { option: 'dont', scope: 'untilPass', reason: null })));
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
    // A run with no day is decided for itself: no scope. Nor once readers see a later day (Mon 25 passed before Thu 21
    // was decided): "until a later day passes" would stand already ended, and close Fri on its next run.
    expect(sheetText({ ...thu, day: null }).scopes).toBeNull();
    expect(sheetText({ ...thu, later: '2023-09-25' }).scopes).toBeNull();
    expect(sheetShown(sheetText({ ...thu, later: '2023-09-25' }), { option: 'dont', scope: 'untilPass', reason: null }).at(-1)).toBe('Don’t publish Thu 21');
    // A day not judged (no history) offers its reason to publish.
    expect(sheetText({ ...thu, unjudged: true }).chips.asis[0]).toBe('No history');
  });

  it('can’t publish a day a later one has passed, and stays within 45 words at its wordiest', () => {
    const t = sheetText({ ...thu, later: '2023-09-25', otherBuild: true, waited: 3000 });
    expect(t.options[0]).toMatchObject({ number: 'Mon 25 is published', off: true, sub: null, warn: null });
    expect(t.status).toBe('Other build’s decision');
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
    const fri = sheetText({ ...thu, day: '2023-09-22', checks: { share: 0.4567, limit: 0.1 }, part: 'Flex Fare · 4,613', missing: null, cut: null, ticks: ['0', '115k'], readers: { day: '2023-09-18', rows: 89_571 }, otherBuild: true });
    expect(sheetWords(fri)).toBeLessThanOrEqual(45);
  });

  it('shows someone who may not decide what readers see until whoever does decides, a way to ask, and nothing to pick', () => {
    const t = sheetText({ ...thu, may: false });
    expect(t.status).toBeNull();
    expect(t.waitsOn).toBe('Readers see Wed 20 until Owner decides');
    expect(t.ask).toBe('Ask ›');
    const shown = sheetShown(t, rest);
    expect(shown).not.toContain('Pick an option');
    expect(shown).not.toContain('Real change');
    expect(sheetText({ ...thu, may: false, readers: null }).waitsOn).toBe('Nothing published yet until Owner decides');
    expect(goLabel('dont', 'untilPass', 3, null)).toBe('Don’t publish this run');
    expect(goLabel('asis', 'day', 1, '2023-09-21')).toBe('Publish as is · 1 output');
  });

  it('collapses to a receipt once decided: what readers now see, what was released, who, when, the record, and whether it can change', () => {
    expect(receiptLines({ state: 'asis', day: '2023-09-21', readers: '2023-09-21', released: 3, who: 'Owner', at: '10:32', seq: 21, under: null, standing: false }))
      .toEqual({ head: 'Published as is · readers now see Thu 21', sub: '3 outputs released · Owner · 10:32 · record #21', change: null });
    expect(receiptLines({ state: 'dont', day: '2023-09-22', readers: '2023-09-21', released: 0, who: 'Owner', at: '10:33', seq: 26, under: null, standing: true }))
      .toEqual({ head: 'Not published · readers keep Thu 21 until a day passes', sub: 'Owner · 10:33 · record #26', change: 'Change decision' });
    expect(receiptLines({ state: 'dont', day: '2023-09-23', readers: '2023-09-21', released: 0, who: 'Owner', at: '10:33', seq: 29, under: 'Fri', standing: true }))
      .toEqual({ head: 'Not published · readers keep Thu 21', sub: 'Under Fri’s decision · record #29', change: 'Change decision' });
    // Once a later day has published, the day kept then; never the later day.
    expect(receiptLines({ state: 'dont', day: '2023-09-23', readers: '2023-09-21', past: true, released: 0, who: 'Owner', at: null, seq: 29, under: 'Fri', standing: true }).head).toBe('Not published · readers kept Thu 21');
    expect(receiptLines({ state: 'dont', day: '2023-09-23', readers: null, past: true, released: 0, who: 'Owner', at: null, seq: 29, under: null, standing: false }).head).toBe('Not published');
    expect(receiptLines({ state: 'waiting', day: '2023-09-21', readers: '2023-09-20', released: 0, who: 'Owner', at: '10:32', seq: 20, under: null, standing: false }).head).toBe('Decided, not yet published');
    // A line and a second line, not a paragraph.
    for (const state of ['asis', 'dont'] as const) {
      const l = receiptLines({ state, day: '2023-09-21', readers: '2023-09-18', released: 3, who: 'Owner', at: '10:32', seq: 212, under: null, standing: true });
      expect(wordsIn(l.head) + wordsIn(l.sub)).toBeLessThanOrEqual(16);
    }
  });

  it('says how long a day has waited, and how long after it was held it was decided', () => {
    expect([0.2, 5, 125, 60 * 50].map(waitedLabel)).toEqual(['Waiting <1 min', 'Waiting 5 min', 'Waiting 2 h', 'Waiting 2 days']);
    expect(waitedLabel(null)).toBeNull();
    expect(afterLabel(26)).toBe('26 min after');
  });
});

describe('the cause card’s pause row, the day after an episode, and the record of decisions (ADR 0009 §12)', () => {
  it('says what paused the day, what readers see and the outputs that wait, with one verb; who decides for someone who may not; then the receipt', () => {
    const names = ['zone_hour', 'borough_hour', 'weather_effect'];
    const base = { names, by: ['trips'], readers: '2023-09-20', who: null, at: null, under: null, may: true, deciders: 'Owner' };
    // Thu Sep 21, 2023: the story held it, its checks passed; readers keep Wed 20; the three outputs named.
    expect(pauseLines({ ...base, state: 'waiting' })).toEqual({ reach: 'Paused by trips', see: 'readers see Wed 20', names, verb: 'Decide', waits: null });
    // Fri Sep 22: its checks held it too.
    expect(pauseLines({ ...base, state: 'waiting', by: ['trips', 'checks'] }).reach).toBe('Paused by trips, checks');
    expect(pauseLines({ ...base, state: 'waiting', may: false })).toEqual({ reach: 'Paused by trips', see: 'readers see Wed 20', names, verb: null, waits: 'Owner decides' });
    // Nothing the viewer may see held it (a node closed to them): only the pause is said.
    expect(pauseLines({ ...base, state: 'waiting', by: [] }).reach).toBe('Paused');
    expect(pauseLines({ ...base, state: 'waiting', readers: null }).see).toBe('nothing published yet');
    expect(pauseLines({ ...base, state: 'asis', who: 'Owner', at: '09:40' })).toEqual({ reach: 'Published as is · Owner · 09:40', see: null, names, verb: null, waits: null });
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', at: '09:41' })).toMatchObject({ reach: 'Not published · Owner · 09:41', see: 'readers keep Wed 20' });
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', under: 'Fri' }).reach).toBe('Not published · under Fri’s decision');
    // A decision that stands says it closes the days after it too.
    expect(pauseLines({ ...base, state: 'dont', who: 'Owner', at: '09:24', standing: true }).reach).toBe('Not published until a day passes');
    // Every held output already showing its versions: published as is, by nobody.
    expect(pauseLines({ ...base, state: 'asis' }).reach).toBe('Published as is');
    // Once a later day has published (Mon 25), the day's own row says what readers kept then, never the later day:
    // Fri 22 waiting, or decided under Thu's rule, with Thu 21 published before it.
    expect(pauseLines({ ...base, state: 'waiting', readers: '2023-09-21', past: true }).see).toBe('readers kept Thu 21');
    expect(pauseLines({ ...base, state: 'dont', under: 'Fri', readers: '2023-09-21', past: true }).see).toBe('readers kept Thu 21');
    expect(pauseLines({ ...base, state: 'waiting', readers: null, past: true }).see).toBeNull();
    // A row and its verb, not a paragraph: at most 13 words with three outputs named, in every state (the card's budget
    // holds it: test/story-real.test.ts).
    for (const s of ['waiting', 'asis', 'dont'] as const) for (const may of [true, false]) for (const standing of [false, true]) {
      const l = pauseLines({ ...base, by: ['trips', 'checks'], state: s, may, who: 'Owner', at: '09:40', under: s === 'dont' && !standing ? 'Fri' : null, standing });
      expect(pauseWords(l), JSON.stringify(l)).toBeLessThanOrEqual(13);
    }
  });

  it('names what paused a day only as far as the viewer may see it', () => {
    const holds = [{ by: 'story', origin: 'trips' }, { by: 'checks', origin: 'trips_valid' }] as const;
    expect(pauseReasons(holds)).toEqual(['trips', 'checks']);
    // The source first, however the plugin ordered its holds (it holds at the checks first on Fri Sep 22, 2023).
    expect(pauseReasons([...holds].reverse())).toEqual(['trips', 'checks']);
    expect(pauseReasons([{ by: 'unjudged', origin: 'trips' }])).toEqual(['trips not judged']);
    // trips_valid closed to the viewer: its checks are neither named nor counted.
    expect(pauseReasons(holds, (o) => o !== 'trips_valid')).toEqual(['trips']);
    expect(pauseReasons(holds, () => false)).toEqual([]);
  });

  it('draws a paused card’s checks in full only when they held the day too, else says in one line that they passed', () => {
    const g = { step: 'trips_valid', rows: 41_939, dropped: 4_004, share: 0.0955, limit: 0.1, held: false, near: true, usual: { low: 3_700, high: 9_100, expected: 6_000 } };
    // Thu Sep 21, 2023: near its limit and under it, so fine: one line, its share as its bars say it.
    expect(pausedChecks(g)).toEqual({ full: false, line: 'Checks passed: 9.55% dropped', head: null });
    expect(pausedChecks({ ...g, share: 0.06, near: false })).toEqual({ full: false, line: 'Checks passed: 6.0% dropped', head: null });
    expect(pausedChecks({ ...g, held: true, near: false, share: 0.4567 })).toEqual({ full: true, line: null, head: null });
    // Once the day is decided (✕ or ⚑ on its header and tab), the held checks are headed in words, never a lone ‖.
    expect(pausedChecks({ ...g, held: true, near: false, share: 0.4567 }, true)).toEqual({ full: true, line: null, head: 'Checks held' });
    expect(pausedChecks(g, true).head).toBeNull();
    expect(pausedChecks(null)).toEqual({ full: false, line: null, head: null });
  });

  it('says the day held under the strip, readers’ day and Decide; and atop a waiting output’s News, that it waits', () => {
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-18', may: true, standing: false })).toEqual({ text: 'Paused · readers see Mon 18', verb: 'Decide' });
    expect(dayPausedLine({ state: 'waiting', readers: null, may: false, standing: false })).toEqual({ text: 'Paused · nothing published yet', verb: null });
    expect(dayPausedLine({ state: 'asis', readers: '2023-09-21', may: true, standing: false })).toEqual({ text: 'Published as is', verb: null });
    expect(dayPausedLine({ state: 'dont', readers: '2022-11-13', may: true, standing: true }).text).toBe('Not published until a day passes · readers keep Sun 13');
    // The day readers see, with its age once it is stale: Tue 19 and Wed 20 not run in this visit.
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-18', may: true, standing: false, day: '2023-09-21' })).toEqual({ text: 'Paused · readers see Mon 18 · 3 days old', verb: 'Decide' });
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-20', may: true, standing: false, day: '2023-09-21' }).text).toBe('Paused · readers see Wed 20');
    // A later day published since: the day kept then, in the past tense, or the pause alone when that isn't known here.
    expect(dayPausedLine({ state: 'waiting', readers: '2023-09-18', past: true, may: true, standing: false, day: '2023-09-22' }).text).toBe('Paused · readers kept Mon 18');
    expect(dayPausedLine({ state: 'waiting', readers: null, past: true, may: true, standing: false, day: '2023-09-22' }).text).toBe('Paused');
    expect(dayPausedLine({ state: 'dont', readers: '2023-09-21', past: true, may: true, standing: false }).text).toBe('Not published · readers kept Thu 21');
    expect(dayPausedLine({ state: 'dont', readers: null, past: true, may: true, standing: false }).text).toBe('Not published');
    expect(outputPausedLine({ state: 'waiting', may: true, deciders: 'Owner', standing: false })).toEqual({ text: 'Waits for a decision', verb: 'Decide' });
    expect(outputPausedLine({ state: 'waiting', may: false, deciders: 'Owner', standing: false })).toEqual({ text: 'Waits on Owner', verb: null });
    expect(outputPausedLine({ state: 'dont', may: true, deciders: 'Owner', standing: false }).text).toBe('Not published');
    expect(outputPausedLine({ state: 'dont', may: true, deciders: 'Owner', standing: true }).text).toBe('Not published until a day passes');
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

  it('says what became of an episode’s days the day after it: the day on screen once it published, what still waits with Decide', () => {
    const today = { day: '2023-09-25', state: 'published' } as const;
    // Each part carries its state, so the screen draws its mark beside its words: the line keys the strip's ‖ ⚑ ✕.
    expect(afterLine([{ day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'dont' }, { day: '2023-09-23', state: 'dont' }, { day: '2023-09-24', state: 'dont' }], { today }))
      .toEqual({ text: 'Mon 25 published · Thu as is · Fri–Sun unpublished', verb: null, parts: [{ state: 'published', text: 'Mon 25 published' }, { state: 'asis', text: 'Thu as is' }, { state: 'dont', text: 'Fri–Sun unpublished' }] });
    // Thu–Sat wait (Sun not run here, left to the strip): the row says so with Decide, whatever else became of them.
    expect(afterLine([{ day: '2023-09-21', state: 'waiting' }, { day: '2023-09-22', state: 'waiting' }, { day: '2023-09-23', state: 'waiting' }, { day: '2023-09-24', state: null }], { today }))
      .toEqual({ text: 'Mon 25 published · Thu–Sat still wait', verb: 'Decide', parts: [{ state: 'published', text: 'Mon 25 published' }, { state: 'waiting', text: 'Thu–Sat still wait' }] });
    expect(afterLine([{ day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'waiting' }, { day: '2023-09-23', state: 'waiting' }], { may: false }))
      .toMatchObject({ text: 'Fri–Sat still wait', verb: null });
    // One day waiting takes the singular: "Fri still waits", never "Fri still wait"; two days apart are two.
    expect(afterLine([{ day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'waiting' }], { today }))
      .toMatchObject({ text: 'Mon 25 published · Fri still waits', verb: 'Decide' });
    expect(afterLine([{ day: '2023-09-21', state: 'waiting' }, { day: '2023-09-23', state: 'waiting' }], { today })!.text).toBe('Mon 25 published · Thu, Sat still wait');
    expect(afterLine([{ day: '2022-11-14', state: 'published' }, { day: '2022-11-16', state: 'published' }])).toMatchObject({ text: 'Mon, Wed published', verb: null });
    expect(afterLine([{ day: '2023-09-21', state: null }])).toBeNull();
    expect(afterLine([{ day: '2023-09-21', state: null }], { today })).toMatchObject({ text: 'Mon 25 published', verb: null });
  });

  it('puts the paused days on a ribbon by month, each once, and says a day’s decision in three lines', () => {
    const r = ribbonOf([{ day: '2023-09-22', state: 'dont' }, { day: '2022-11-14', state: 'waiting' }, { day: '2023-09-21', state: 'asis' }, { day: '2023-09-22', state: 'dont' }]);
    expect(r).toEqual([
      { month: 'Nov 2022', days: [{ day: '2022-11-14', date: '14', state: 'waiting' }] },
      { month: 'Sep 2023', days: [{ day: '2023-09-21', date: '21', state: 'asis' }, { day: '2023-09-22', date: '22', state: 'dont' }] },
    ]);
    // Published as is: the run released and the release's entry, not the decision's nor a later run's.
    expect(decidedLines({ day: '2023-09-21', state: 'asis', who: 'Owner', minutes: 26, reason: 'Real change', run: '#13', seq: 20, release: 21, under: null })).toEqual({ head: 'Thu Sep 21 · published as is', who: 'Owner · 26 min after · Real change', where: 'Released run #13 · record #21 ✓' });
    expect(decidedLines({ day: '2023-09-23', state: 'dont', who: 'Owner', minutes: 1, reason: null, run: '#28', seq: 230, under: 'Fri' })).toEqual({ head: 'Sat Sep 23 · not published', who: 'Under Fri’s decision', where: 'record #230 ✓' });
    expect(decidedLines({ day: '2022-11-14', state: 'waiting', who: null, minutes: 125, reason: null, run: '#7', seq: null, under: null })).toEqual({ head: 'Mon Nov 14 · waiting', who: 'Waiting 2 h', where: 'Run #7' });
    // A day that passed once days were held: readers now see it, and a standing decision ends with it.
    expect(passedLine('2023-09-25', 26)).toBe('Mon Sep 25 passed: published; readers now see Mon 25 · ends #26');
    expect(passedLine('2022-09-19', null)).toBe('Mon Sep 19 passed: published; readers now see Mon 19');
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
    expect(daySentence({ day: '2023-09-22', head: null, wrong: false, pause: { ...waiting, state: 'dont', standing: true } })).toBe('Fri Sep 22: not published until a day passes · readers keep Wed 20');
    expect(daySentence({ day: '2023-09-18', head: null, wrong: false, pause: null })).toBe('Mon Sep 18: published');
    // Ana on Fri 22 once Mon 25 has published: as it stood then, naming no later day.
    expect(daySentence({ day: '2023-09-22', head: null, wrong: false, pause: { ...waiting, readers: '2023-09-18', past: true } })).toBe('Fri Sep 22: paused · readers kept Mon 18 · waits on Owner');
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
    // Named as the Runs view names the run, by its record entry: one run, one number.
    expect(runFigures({ day: '2023-09-23', run: '#34', ms: '154 ms', nodes, holds: [], sight: () => 'all', page: false })).toMatch(/^Sat Sep 23: Run #34 took 154 ms: /);
  });
});
