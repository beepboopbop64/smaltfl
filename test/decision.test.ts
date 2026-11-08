/**
 * Deciding a held day, on screen (ADR 0009 §12): the drawing each option gets, by the day's cause and on one scale, and
 * the words of the decision sheet, the cause card's pause row, the day after an episode and the Runs view's ribbon,
 * within their budgets.
 */
import { describe, expect, it } from 'vitest';
import { afterLabel, afterLine, dayPausedLine, daySentence, decidedLines, decisionDrawing, goLabel, goShown, heldLine, outputPausedLine, passedLine, pausedChecks, pauseLines, pauseReasons, pauseWords, pickFails, receiptLines, ribbonOf, runFigures, sheetShown, sheetText, sheetWords, versionLines, waitedLabel, type SheetIn, type SheetPick, type SheetText, type Sight } from '../src/core/decision.js';
import { missingOf } from '../src/core/fill.js';
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
  const thu: SheetIn = { day: '2023-09-21', waited: 120, otherBuild: false, outputs: 3, rows: 41_939, reach: 37_935, readers: { day: '2023-09-20', rows: 108_434 }, later: null, checks: null, part: null, missing: '~77k missing', cut: '13h', ticks: [], unjudged: false, hash: '8324c8f4ab', may: true, deciders: 'Owner', head: 'Trips fall 95% from 13:00', noun: { one: 'trip', many: 'trips' } };
  const rest: SheetPick = { option: null, scope: 'day', reason: null };
  const words = (t: SheetText, p: SheetPick) => sheetShown(t, p).reduce((n, x) => n + wordsIn(x), 0);

  it('says every count with the held source’s noun (ADR 0010 §8, C3)', () => {
    const t = sheetText({ ...thu, noun: { one: 'sign-in', many: 'sign-ins' } });
    expect(t.options.map((o) => o.number)).toEqual(['41,939 sign-ins', '108,434 sign-ins']);
    expect(t.options[0]!.aria).toContain('as it came, 41,939 sign-ins, 37,935 of them past its checks');
    expect(sheetText({ ...thu, rows: 1, noun: { one: 'sign-in', many: 'sign-ins' } }).options[0]!.number).toBe('1 sign-in');
    // A noun of two words is said once, on the first row (Q-78); the aria keeps it on both.
    const two = sheetText({ ...thu, noun: { one: 'endpoint event', many: 'endpoint events' } });
    expect(two.options.map((o) => o.number)).toEqual(['41,939 endpoint events', '108,434']);
    expect(two.options[1]!.aria).toContain('108,434 endpoint events');
  });

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
    expect(fri.options[0]).toMatchObject({ number: '4,633 trips', sub: '2,517 after checks', warn: 'Overrides checks: 45.7% dropped (limit 10%)', warnPicked: '45.7% dropped (limit 10%)' });
    // Once picked, its figures alone: the button says "over the checks".
    const picked = sheetShown(fri, { option: 'asis', scope: 'day', reason: null });
    expect(picked).toContain('45.7% dropped (limit 10%)');
    expect(picked.join(' ')).not.toContain('Overrides checks');
    expect(fri.options[0]!.aria).toContain('this overrides its checks, which held it: 45.7% dropped (limit 10%)');
    expect(fri.go.asis).toBe('Publish over the checks · 3 outputs');
    // Near the limit, the share to the decimals that keep it off the limit (Sun Sep 18, 2022: 10.45%).
    expect(sheetText({ ...thu, checks: { share: 0.1045, limit: 0.1 } }).options[0]!.warn).toBe('Overrides checks: 10.45% dropped (limit 10%)');
    expect(sheetText(thu).options[0]!.warn).toBeNull();
    expect(sheetText(thu).go.asis).toBe('Publish as is · 3 outputs');
  });

  it('shows the reasons that fit the option picked, the switch for later days, and a button that says what is missing (amendment 1 S12)', () => {
    const t = sheetText(thu);
    expect(t.why).toEqual({ asis: 'Why? (needed)', dont: '', fill: '', complete: '' });
    expect(t.chips).toEqual({ asis: ['Real change', 'Source confirmed'], dont: ['Known outage', 'Re-send expected'], fill: [], complete: [] });
    expect(t.switch).toBe('Later days too');
    expect(t.go).toMatchObject({ rest: 'Pick an option', reason: 'Pick a reason', asis: 'Publish as is · 3 outputs', dont: 'Don’t publish Thu 21', until: 'Don’t publish from Thu 21' });
    // At rest: each row its label and number, and only Publish as is's override under it; the status; no reasons, no
    // switch.
    const r = sheetShown(t, rest);
    expect(r).toEqual(expect.arrayContaining(['Waiting 2 h', '41,939 trips', '108,434 trips']));
    expect(r).not.toContain('37,935 after checks');
    expect(r).not.toContain('Real change');
    expect(r).not.toContain('Later days too');
    expect(r.at(-1)).toBe('Pick an option');
    // Publish as is picked: its number and one line under it, its reasons, no switch, no status, and the button asks
    // for a reason until one is picked. The row not picked keeps its label, not its number.
    const asis = sheetShown(t, { option: 'asis', scope: 'day', reason: null });
    expect(asis).toEqual(expect.arrayContaining(['41,939 trips', '37,935 after checks', 'Why? (needed)', 'Real change', 'Source confirmed', 'Pick a reason', 'Keep Wed 20']));
    expect(asis).not.toContain('108,434 trips');
    expect(asis).not.toContain('Waiting 2 h');
    expect(asis).not.toContain('Known outage');
    expect(asis).not.toContain('Later days too');
    expect(sheetShown(t, { option: 'asis', scope: 'day', reason: 'Real change' }).at(-1)).toBe('Publish as is · 3 outputs');
    // Don't publish picked: its optional reasons, no heading, and the switch; the Publish row keeps its drawing alone.
    const dont = sheetShown(t, { option: 'dont', scope: 'untilPass', reason: null });
    expect(dont).toEqual(expect.arrayContaining(['Known outage', 'Later days too', 'Don’t publish from Thu 21']));
    expect(dont).not.toContain('Why?');
    expect(dont).not.toContain('41,939 trips');
    expect(sheetWords(t)).toBeGreaterThanOrEqual(Math.max(words(t, rest), words(t, { option: 'asis', scope: 'day', reason: 'x' }), words(t, { option: 'dont', scope: 'untilPass', reason: null })));
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
    // A run with no day is decided for itself: no switch. Nor once readers see a later day (Mon 25 passed before Thu
    // 21 was decided): "until a later day passes" would stand already ended, and close Fri on its next run.
    expect(sheetText({ ...thu, day: null }).switch).toBeNull();
    expect(sheetText({ ...thu, later: '2023-09-25' }).switch).toBeNull();
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

describe('the remedies on the sheet (ADR 0009 amendment 1 S12)', () => {
  // Thu Sep 21, 2023, as the real history has it: 41,939 arrived, 3,679 of them after 13:00; Thu 14 gives 83,671
  // trips from 13:00, Wed 20 72,582, Mon 25 a third.
  const counts = (taken: number) => ({ arrived: 41_939, setAside: 3679, taken, total: 41_939 - 3679 + taken });
  const thu: SheetIn = {
    day: '2023-09-21', waited: 120, otherBuild: false, outputs: 3, rows: 41_939, reach: 37_935, readers: { day: '2023-09-20', rows: 108_434 }, later: null, checks: null, part: null, missing: '~77k fewer', cut: '13h', ticks: [], unjudged: false, hash: '8324c8f4ab', may: true, deciders: 'Owner', head: 'Trips fall to trickle from 13:00', noun: { one: 'trip', many: 'trips' },
    offers: [{ option: 'fill', label: 'Fill from Thu 14' }, { option: 'complete', label: 'Before 13:00 only' }],
    donors: [{ day: '2023-09-14', counts: counts(83_671) }, { day: '2023-09-20', counts: counts(72_582) }, { day: '2023-09-25', counts: counts(60_000) }],
    partOnly: { arrived: 41_939, setAside: 3679, taken: 0, total: 38_260 },
  };
  const at = (t: SheetText, p: Partial<SheetPick>) => sheetShown(t, { option: null, scope: 'day', reason: null, ...p });

  it('offers a fill named by its donor and the part alone named by what it keeps, each with what readers get', () => {
    const t = sheetText(thu);
    expect(t.options.map((o) => [o.option, o.label, o.number])).toEqual([['asis', 'Publish as is', '41,939 trips'], ['dont', 'Keep Wed 20', '108,434 trips'], ['fill', 'Fill from Thu 14', '121,931 trips'], ['complete', 'Before 13:00 only', '38,260 trips']]);
    expect(t.options[2]!.aria).toBe('Fill from Thu 14: readers get 121,931 trips, 83,671 of them from Thu Sep 14, in place of the 3,679 that arrived of that part');
    const r = at(t, {});
    expect(r).toEqual(expect.arrayContaining(['Thu Sep 21 · what readers get', 'Fill from Thu 14', '121,931 trips', 'Before 13:00 only', '38,260 trips', 'Pick an option']));
    expect(r).not.toContain('37,935 after checks');
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
  });

  it('shows the fill’s donors as chips once picked, swaps the donor and its numbers, and names it on the button', () => {
    const t = sheetText(thu);
    const fill = at(t, { option: 'fill' });
    expect(fill).toEqual(expect.arrayContaining(['121,931 trips', '83,671 filled', 'Wed 20', 'Mon 25', 'Later days too', 'Fill from Thu 14']));
    expect(fill).not.toContain('Waiting 2 h');
    expect(fill).not.toContain('Thu 14');
    expect(fill.at(-1)).toBe('Fill from Thu 14');
    const wed = at(t, { option: 'fill', donor: 1 });
    expect(wed).toEqual(expect.arrayContaining(['Fill from Wed 20', '110,842 trips', '72,582 filled', 'Thu 14', 'Mon 25']));
    expect(wed.at(-1)).toBe('Fill from Wed 20');
    expect(at(t, { option: 'fill', preparing: true }).at(-1)).toBe('Preparing Thu 14');
    const part = at(t, { option: 'complete' });
    expect(part).toEqual(expect.arrayContaining(['38,260 trips', '3,679 set aside', 'Later days too']));
    expect(part.at(-1)).toBe('Publish before 13:00 only');
  });

  it('marks a remedy whose checks trip, and its button can’t go (Q-67)', () => {
    const staged = sheetText({ ...thu, staged: { option: 'fill', donor: '2023-09-14', fails: true } });
    expect(pickFails(staged, { option: 'fill' })).toBe(true);
    expect(pickFails(staged, { option: 'fill', donor: 1 })).toBe(false);
    expect(at(staged, { option: 'fill' })).toContain('fails its checks');
    expect(goShown(staged, { option: 'fill', scope: 'day', reason: null })).toBe('Fails its checks');
    // The part alone that the held run's checks tripped on is marked before it is staged; offered all the same.
    const fri = sheetText({ ...thu, day: '2023-09-22', offers: [{ option: 'fill', label: 'Fill from Fri 15' }, { option: 'complete', label: 'Flex Fare only', note: 'fails its checks' }] });
    expect(fri.options[3]).toMatchObject({ label: 'Flex Fare only', sub: 'fails its checks', fails: true, off: false });
    expect(at(fri, {})).not.toContain('fails its checks');
    expect(at(fri, { option: 'complete' }).at(-1)).toBe('Fails its checks');
  });

  it('draws a fill off when no good day is near or a later day is published, and offers no switch then', () => {
    const none = sheetText({ ...thu, offers: [{ option: 'fill', label: 'Fill', off: 'No good day near' }, { option: 'complete', label: 'Before 13:00 only' }], donors: [] });
    expect(none.options[2]).toMatchObject({ label: 'Fill', number: 'No good day near', off: true });
    const later = sheetText({ ...thu, later: '2023-09-25', offers: [{ option: 'fill', label: 'Fill from Thu 14', off: 'Mon 25 is published' }, { option: 'complete', label: 'Before 13:00 only', off: 'Mon 25 is published' }] });
    expect(later.options.map((o) => o.off)).toEqual([true, false, true, true]);
    expect(later.switch).toBeNull();
    expect(sheetWords(later)).toBeLessThanOrEqual(45);
  });

  it('takes a fill back with Keep once readers have it, back to the day they had (Q-61)', () => {
    const t = sheetText({ ...thu, withdraws: 'fill' });
    expect(t.options[1]).toMatchObject({ label: 'Keep Wed 20', withdraws: true });
    expect(t.options[1]!.aria).toBe('Withdraw the fill: readers see Wed Sep 20 again, 108,434 trips, and this day is not published');
    const keep = at(t, { option: 'dont', scope: 'untilPass' });
    expect(keep.at(-1)).toBe('Withdraw the fill');
    expect(keep).not.toContain('Later days too');
    expect(keep).not.toContain('Known outage');
    expect(goLabel('dont', 'day', 3, '2023-09-21', false, { withdraws: 'complete' })).toBe('Withdraw the part');
  });

  it('names each result on the button', () => {
    expect(goLabel('fill', 'untilPass', 3, '2022-11-14', false, { donor: '2022-11-07' })).toBe('Fill from Mon 7');
    expect(goLabel('complete', 'day', 3, '2022-11-14', false, { part: 'Without Vendor 1' })).toBe('Publish without Vendor 1');
    expect(goLabel('complete', 'day', 3, '2023-09-22', false, { part: 'Flex Fare only' })).toBe('Publish Flex Fare only');
  });

  it('keeps every pick within 45 words with a two-word noun, the noun said once (Q-78)', () => {
    const t = sheetText({ ...thu, noun: { one: 'endpoint event', many: 'endpoint events' } });
    expect(t.options.map((o) => o.number)).toEqual(['41,939 endpoint events', '108,434', '121,931', '38,260']);
    expect(sheetWords(t)).toBeLessThanOrEqual(45);
    expect(sheetWords(sheetText({ ...thu, may: false }))).toBeLessThanOrEqual(45);
  });

  it('draws each donor’s fill and the part alone on the sheet’s one scale, and counts what fill.ts counts', () => {
    const h = new HistoryRanges(historyWith({ '2023-09-21': { stopAt: 13 } }));
    const s = tell(h, '2023-09-21');
    const missing = missingOf(s, 'tpep_pickup_datetime')!;
    const d = decisionDrawing(h, s, '2023-09-21', '2023-09-20', { day: rowsOf(h, '2023-09-21'), readers: rowsOf(h, '2023-09-20') }, { missing, donors: ['2023-09-14', '2023-09-20'] });
    expect(d.fills.map((f) => f.day)).toEqual(['2023-09-14', '2023-09-20']);
    for (const f of d.fills) {
      const hours = (f.rows as { hours: readonly number[] }).hours;
      const donor = h.file.hours[h.file.days.indexOf(f.day)]!;
      expect(hours.slice(13)).toEqual(donor.slice(13));
      expect(hours.slice(0, 13)).toEqual(s.hours!.got.slice(0, 13));
      expect(f.filled).toEqual([13, 23]);
      expect(d.scale).toBeGreaterThanOrEqual(Math.max(...hours));
    }
    expect((d.complete!.rows as { hours: readonly number[] }).hours.slice(13).every((v) => v === 0)).toBe(true);
    expect(d.complete!.short).toEqual([13, 23]);
    // A split: the part that vanished taken from the donor, the rest as it came; the part alone, the rest only.
    const hv = new HistoryRanges(historyWith({ '2022-11-14': { vendorGone: true } }));
    const sv = tell(hv, '2022-11-14');
    const dv = decisionDrawing(hv, sv, '2022-11-14', '2022-11-13', { day: rowsOf(hv, '2022-11-14'), readers: rowsOf(hv, '2022-11-13') }, { missing: missingOf(sv, 'x')!, donors: ['2022-11-07'] });
    const v1 = hv.file.values.VendorID!.counts![hv.file.days.indexOf('2022-11-07')]![1]!;
    expect(dv.fills).toEqual([{ day: '2022-11-07', rows: { cause: 'split', part: v1, rest: sv.split!.rest.today }, filled: 'part' }]);
    expect(dv.complete).toMatchObject({ rows: { part: 0, rest: sv.split!.rest.today }, usual: { part: sv.split!.part.usual } });
    // Without a remedy, nothing extra is drawn.
    expect(decisionDrawing(h, s, '2023-09-21', '2023-09-20', { day: 1, readers: 1 })).toMatchObject({ fills: [], complete: null });
  });

  it('says what readers got everywhere else: the receipt, the cause card, the day line, the status, an output, the episode, the Runs view', () => {
    const fill = { option: 'fill' as const, donor: '2023-09-14', part: null };
    expect(receiptLines({ state: 'fill', day: '2023-09-21', readers: '2023-09-21', released: 3, who: 'Owner', at: '09:40', seq: 22, under: null, standing: false, remedy: { ...fill, filled: 83_671, setAside: 3679 } }))
      .toEqual({ head: 'Filled from Thu 14 · readers now see Thu 21', sub: '83,671 filled · 3 outputs released · Owner · 09:40 · record #22', change: 'Change decision', versions: true });
    expect(receiptLines({ state: 'fill', day: '2022-11-14', readers: '2022-11-14', released: 3, who: 'Owner', at: '09:40', seq: 22, under: null, standing: true, remedy: { option: 'fill', donor: '2022-11-07', part: null, filled: 33_000, setAside: 2 } }).sub).toContain('later days too, until a day passes');
    expect(receiptLines({ state: 'complete', day: '2023-09-21', readers: '2023-09-21', released: 3, who: 'Owner', at: '09:40', seq: 23, under: null, standing: false, remedy: { option: 'complete', donor: null, part: 'Before 13:00 only', filled: null, setAside: 3679 } }).head).toBe('Published before 13:00 only · readers now see Thu 21');
    expect(receiptLines({ state: 'dont', day: '2023-09-21', readers: '2023-09-20', released: 0, who: 'Owner', at: '09:50', seq: 24, under: null, standing: false, withdrawn: 'fill' }))
      .toEqual({ head: 'Fill withdrawn · readers see Wed 20 again', sub: 'Owner · 09:50 · record #24', change: 'Change decision', versions: true });
    const card = pauseLines({ state: 'fill', names: ['zone_hour'], who: 'Owner', at: '09:40', under: null, may: true, deciders: 'Owner', remedy: fill });
    expect(card).toMatchObject({ reach: 'Filled from Thu 14 · Owner · 09:40', see: null, verb: null });
    expect(pauseLines({ state: 'fill', names: [], who: 'Owner', at: null, under: 'Mon', may: true, deciders: 'Owner', remedy: { option: 'fill', donor: '2022-11-01', part: null } }).reach).toBe('Filled from Tue 1 · under Mon’s decision');
    expect(dayPausedLine({ state: 'fill', readers: '2023-09-21', may: true, standing: false, remedy: fill }).text).toBe('◧ Filled from Thu 14');
    expect(dayPausedLine({ state: 'complete', readers: '2023-09-21', may: true, standing: false, remedy: { option: 'complete', donor: null, part: 'Before 13:00 only' } }).text).toBe('◐ Before 13:00 only');
    expect(daySentence({ day: '2023-09-21', head: 'Trips fall to trickle from 13:00', wrong: true, pause: { state: 'fill', readers: '2023-09-21', standing: false, may: true, deciders: 'Owner', remedy: fill } })).toBe('Thu Sep 21: filled from Thu 14');
    expect(outputPausedLine({ state: 'complete', may: true, deciders: 'Owner', standing: false, remedy: { option: 'complete', donor: null, part: 'Without Vendor 1' } }).text).toBe('Published without Vendor 1');
    const days = ['2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20'].map((day) => ({ day, state: 'fill' as const }));
    expect(afterLine(days, { today: { day: '2022-11-21', state: 'published' } })!.text).toBe('Mon 21 published · Mon–Sun filled');
    expect(decidedLines({ day: '2022-11-15', state: 'fill', who: 'Owner', minutes: 3, reason: null, run: '#15', seq: 22, release: 24, under: 'Mon', remedy: { option: 'fill', donor: '2022-11-01', part: null } }))
      .toEqual({ head: 'Tue Nov 15 · filled from Tue 1', who: 'Under Mon’s decision', where: 'Released run #15 · record #24 ✓' });
    expect(ribbonOf([{ day: '2022-11-15', state: 'fill' }])[0]!.days[0]!.state).toBe('fill');
  });

  it('lists a day’s versions, the one readers have ticked, within 45 words with four', () => {
    const v = versionLines([
      { seq: 13, run: 3, manifest: 'a', kind: 'arrived', shown: null },
      { seq: 15, run: 4, manifest: 'b', kind: 'filled', donor: '2023-09-14', rows: 121_931, shown: 'before' },
      { seq: 18, run: 5, manifest: 'c', kind: 'filled', donor: '2023-09-20', rows: 110_842, shown: 'now' },
      { seq: 31, run: 6, manifest: 'd', kind: 'rerun', shown: null },
    ], { day: '2023-09-21', noun: { one: 'trip', many: 'trips' }, name: (x) => `#${x.seq}`, rows: (x) => x.rows ?? (x.kind === 'arrived' ? 41_939 : 118_250) });
    expect(v.title).toBe('Thu Sep 21 · versions');
    expect(v.lines.map((l) => l.text)).toEqual(['Arrived · 41,939 trips · held · run #13', 'Filled from Thu 14 · 121,931 trips · run #15', 'Refilled from Wed 20 · 110,842 trips · run #18 ✓', 'Corrected file · 118,250 trips · run #31']);
    expect([v.title, ...v.lines.map((l) => l.text)].reduce((n, x) => n + wordsIn(x), 0)).toBeLessThanOrEqual(45);
  });
});
