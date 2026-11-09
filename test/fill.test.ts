/**
 * Filling a paused day (ADR 0009 amendment 1), in the core: the missing part a story names, the donor each rule finds,
 * the derived document, the numbers each remedy gives readers, the options a held day gets, and a day's versions. On
 * the synthetic history and made-up record entries; the real history's donors are test/fill-real.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { isSpecial, NONE, US_1 } from '../src/core/calendar.js';
import type { FlowDocument } from '../src/core/document.js';
import { validateDocument } from '../src/core/document.js';
import { acceptable, dayVersions, donorChoices, donorFor, donorRuleOf, fillable, fillCounts, levelMetrics, levelOf, levelStray, levelWays, missingOf, offersOf, partLabel, partRows, repairDocument, type DonorQuery, type Repair } from '../src/core/fill.js';
import { HistoryRanges } from '../src/core/history.js';
import { donorGood, flowStory, rangesFor, type HistoryRef } from '../src/core/hold.js';
import type { LogEntry } from '../src/core/log.js';
import { flowHash, plannedDonor, translate } from '../src/core/plan.js';
import type { Split, Story } from '../src/core/story.js';
import { historyWith } from './helpers/history.js';

const HISTORY: HistoryRef = { path: 'history.json', sha256: 'a'.repeat(64), bytes: 1_234 };
const checks = { id: 'trips_valid', kind: 'expectations' as const, inputs: ['trips_filled'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' as const }] };
const fillStep = { id: 'trips_filled', kind: 'fill' as const, inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] };
/** A flow with a fill step on its watched source, as the example will have it. */
const doc = (): FlowDocument => ({
  smaltfl: 2, id: 'f', name: 'F', parameters: [{ name: 'day', type: 'text', default: null }],
  sources: [{ id: 'trips', table: 'trips_file' }, { id: 'zones', table: 'zones_file' }],
  steps: [structuredClone(fillStep), { ...structuredClone(checks), dataset: {} }],
  publish: { hold: ['checks', 'wrong'], watch: { trips: 'history.json' }, period: 'day' },
  layout: { trips_filled: [10, 20] },
});
const listedAll = (day: string): HistoryRef => ({ path: `loads/${day}.parquet`, sha256: 'b'.repeat(64), bytes: 100 });
const query = (h: HistoryRanges, day: string, over: Partial<DonorQuery> = {}): DonorQuery => ({ h, doc: doc(), day, source: 'trips', rule: 'weekday', direction: 'before', listed: listedAll, history: HISTORY, build: 'dev', ...over });

const split = (over: Partial<Split>): Split => ({ column: 'VendorID', value: '1', name: 'Vendor 1', trips: false, kind: 'vanished', part: { today: 2, usual: 30_000, low: null, high: null }, rest: { today: 70_000, usual: 70_000, low: null, high: null }, blank: [], ...over });
const story = (s: Partial<Pick<Story, 'hero' | 'hours' | 'split'>>): Pick<Story, 'hero' | 'hours' | 'split'> => ({ hero: 'amount', hours: null, split: null, ...s });
const hours = (from: number, to: number) => ({ got: [], usual: [], from, to, fall: 95 });

describe('the missing part (S2)', () => {
  it('is the hours an hours cause names, the part that vanished, or the rest where a part held', () => {
    expect(missingOf(story({ hero: 'hours', hours: hours(13, 23) }), 'tpep_pickup_datetime')).toEqual({ time: 'tpep_pickup_datetime', hours: [13, 23] });
    expect(missingOf(story({ hero: 'hours', hours: hours(6, 15) }), 'pickup')).toEqual({ time: 'pickup', hours: [6, 15] });
    expect(missingOf(story({ hero: 'split', split: split({}) }), 't')).toEqual({ column: 'VendorID', value: 1 });
    expect(missingOf(story({ hero: 'split', split: split({ kind: 'held', column: 'payment_type', value: '0', name: 'Flex Fare' }) }), 't')).toEqual({ column: 'payment_type', value: 0, rest: true });
    expect(missingOf(story({ hero: 'split', split: split({ column: 'store_and_fwd_flag', value: '"Y"' }) }), 't')).toEqual({ column: 'store_and_fwd_flag', value: 'Y' });
    expect(missingOf(story({ hero: 'split', split: split({ column: 'extra', value: '1.75' }) }), 't')).toEqual({ column: 'extra', value: 1.75 });
  });

  it('is nothing for an amount, a surge, the checks alone, or a calm day', () => {
    expect(missingOf(story({ hero: 'amount' }), 't')).toBeNull();
    expect(missingOf(story({ hero: 'split', split: split({ kind: 'surged' }) }), 't')).toBeNull();
    expect(missingOf(story({ hero: 'gate' }), 't')).toBeNull();
    expect(missingOf(story({ hero: 'calm' }), 't')).toBeNull();
    // A hero says it: hours on a split day aren't the missing part.
    expect(missingOf(story({ hero: 'split', hours: hours(13, 23), split: null }), 't')).toBeNull();
  });

  it('is filled only on a short day with something wrong, one source holding', () => {
    const s = story({ hero: 'split', split: split({}) });
    expect(fillable({ state: 'wrong', below: true }, s, 't')).toBe(true);
    // Dec 19, 2022: a code gone while the trips stayed in range. Its rows were coded another way: no fill.
    expect(fillable({ state: 'wrong', below: false }, s, 't')).toBe(false);
    expect(fillable({ state: 'unusual', below: true }, s, 't')).toBe(false);
    expect(fillable(null, s, 't')).toBe(false);
    expect(fillable({ state: 'wrong', below: true }, story({ hero: 'amount' }), 't')).toBe(false);
    expect(fillable({ state: 'wrong', below: true }, s, 't', 2)).toBe(false);
  });

  it('is told from the flow’s story on the synthetic history', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-11': { stopAt: 13 }, '2023-10-12': { vendorGone: true } }));
    expect(missingOf(flowStory(h, '2023-10-11', doc(), 'trips'), 'tpep_pickup_datetime')).toEqual({ time: 'tpep_pickup_datetime', hours: [13, 23] });
    expect(missingOf(flowStory(h, '2023-10-12', doc(), 'trips'), 'tpep_pickup_datetime')).toEqual({ column: 'VendorID', value: 1 });
  });

  it('is labelled by what readers would get: before an hour, from an hour, without hours or a part, a part only', () => {
    expect(partLabel({ time: 't', hours: [13, 23] })).toBe('Before 13:00 only');
    expect(partLabel({ time: 't', hours: [0, 6] })).toBe('From 07:00 only');
    expect(partLabel({ time: 't', hours: [6, 15] })).toBe('Without 06:00–16:00');
    expect(partLabel({ time: 't', hours: [0, 23] })).toBe('Without 00:00–00:00');
    expect(partLabel({ column: 'VendorID', value: 1 }, 'Vendor 1')).toBe('Without Vendor 1');
    expect(partLabel({ column: 'payment_type', value: 0, rest: true }, 'Flex Fare')).toBe('Flex Fare only');
    expect(partLabel({ column: 'VendorID', value: 1 })).toBe('Without VendorID 1');
  });
});

describe('the donor (S3)', () => {
  const DAY = '2023-10-11'; // a Wednesday

  it('is the first good day by the rule and direction, within four weeks, with the flow’s verdict on it', () => {
    const h = new HistoryRanges(historyWith({ [DAY]: { stopAt: 13 } }));
    const wd = donorFor(query(h, DAY));
    expect(wd).toMatchObject({ rule: 'weekday', direction: 'before', day: '2023-10-04', file: listedAll('2023-10-04'), claim: { source: 'trips_donor', day: '2023-10-04', state: 'calm', history: HISTORY } });
    expect(donorFor(query(h, DAY, { rule: 'nearest' }))).toMatchObject({ day: '2023-10-10' });
    expect(donorFor(query(h, DAY, { direction: 'after' }))).toMatchObject({ day: '2023-10-18' });
    expect(donorFor(query(h, DAY, { rule: 'nearest', direction: 'after' }))).toMatchObject({ day: '2023-10-12' });
  });

  it('skips a day the verdict says something wrong of, a day the list doesn’t have, and gives up after four weeks', () => {
    const h = new HistoryRanges(historyWith({ [DAY]: { stopAt: 13 }, '2023-10-04': { vendorGone: true } }));
    expect(donorFor(query(h, DAY))).toMatchObject({ day: '2023-09-27' });
    expect(donorFor(query(h, DAY, { listed: (d) => (d === '2023-09-27' ? null : listedAll(d)) }))).toMatchObject({ day: '2023-09-20' });
    expect(donorFor(query(h, DAY, { listed: (d) => (d <= '2023-09-13' ? listedAll(d) : null) }))).toMatchObject({ day: '2023-09-13' });
    expect(donorFor(query(h, DAY, { listed: (d) => (d < '2023-09-13' ? listedAll(d) : null) }))).toEqual({ rule: 'weekday', direction: 'before', none: 'no good day within four weeks' });
  });

  it('never takes a day the flow’s calendar marks unless the held day is one', () => {
    // Mon Sep 11, 2023: the Monday before is Labor Day.
    const h = new HistoryRanges(historyWith({ '2023-09-11': { stopAt: 13 }, '2023-11-23': { stopAt: 13 } }));
    expect(isSpecial('2023-09-04')).toBe(true);
    expect(donorFor(query(h, '2023-09-11'))).toMatchObject({ day: '2023-08-28' });
    // Thanksgiving held: a day like any other is still a donor for it.
    expect(isSpecial('2023-11-23')).toBe(true);
    expect(donorFor(query(h, '2023-11-23'))).toMatchObject({ day: '2023-11-16' });
  });

  it('skips the days the flow’s own calendar marks, not a built-in list (ADR 0010 §2, I6)', () => {
    // The made-up history has its holidays light; here Labor Day 2023 and the day after Thanksgiving 2023 carry a
    // usual day's trips, so only the calendar keeps them from being donors.
    const held = { '2023-09-11': { stopAt: 13 }, '2023-12-01': { stopAt: 13 }, '2023-09-04': { more: 1 / 0.7 }, '2023-11-24': { more: 1 / 0.7 } };
    // The example's legacy watch: us-nyc/1 marks both.
    const legacy = new HistoryRanges(historyWith(held));
    expect(donorFor(query(legacy, '2023-09-11'))).toMatchObject({ day: '2023-08-28' });
    expect(donorFor(query(legacy, '2023-12-01'))).toMatchObject({ day: '2023-11-17' });
    // A flow with no calendar (Q-58) marks no day: Labor Day is a Monday like any other, and is the donor.
    const none: FlowDocument = { ...doc(), smaltfl: 3, calendar: { base: 'none' } };
    expect(validateDocument(none)).toEqual([]);
    const hNone = new HistoryRanges(historyWith(held), { calendar: NONE });
    expect(donorFor({ ...query(hNone, '2023-09-11'), doc: none })).toMatchObject({ day: '2023-09-04', claim: { state: 'calm' } });
    // A watch that says the calendar doesn't apply to its source is the same.
    const off: FlowDocument = { ...doc(), smaltfl: 3, publish: { ...doc().publish!, watch: { trips: { history: 'history.json', calendar: false } } } };
    expect(validateDocument(off)).toEqual([]);
    // Its ranges are the general form's (ADR 0010 §5: the echo fix and re-learning), made as the flow says.
    expect(donorFor({ ...query(new HistoryRanges(historyWith(held), rangesFor(off, 'trips')), '2023-09-11'), doc: off })).toMatchObject({ day: '2023-09-04' });
    // us/1 marks Labor Day, and not the day after Thanksgiving, which us-nyc/1 adds.
    const us: FlowDocument = { ...doc(), smaltfl: 3, calendar: { base: 'us' } };
    const hUs = new HistoryRanges(historyWith(held), { calendar: US_1 });
    expect([isSpecial('2023-11-24'), isSpecial('2023-11-24', US_1)]).toEqual([true, false]);
    expect(donorFor({ ...query(hUs, '2023-09-11'), doc: us })).toMatchObject({ day: '2023-08-28' });
    expect(donorFor({ ...query(hUs, '2023-12-01'), doc: us })).toMatchObject({ day: '2023-11-24', claim: { state: 'calm' } });
  });

  it('never takes a day not judged yet: nothing says it is good (C9, I7)', () => {
    // The history's first Thanksgiving, and the eve before it, have no last year to judge them by. Held the day after
    // (itself special, so a special day may give), the nearest days before are those two, which publish marked and
    // give nothing: the donor is the Tuesday.
    const h = new HistoryRanges(historyWith({ '2021-11-26': { stopAt: 13 } }));
    const first = flowStory(h, '2021-11-25', doc(), 'trips');
    expect(first.state).toBe('unlearned');
    expect(flowStory(h, '2021-11-24', doc(), 'trips').state).toBe('unlearned');
    expect(donorGood({ state: 'unlearned' })).toBe(false);
    const pick = donorFor(query(h, '2021-11-26', { rule: 'nearest' }));
    expect(pick).toMatchObject({ day: '2021-11-23' });
    expect(donorChoices(query(h, '2021-11-26'), 'nearest').picks.map((p) => p.day).filter((d) => d === '2021-11-24' || d === '2021-11-25')).toEqual([]);
    // A day not judged yet, held under a flow that lists unlearned, is never filled: nothing says what it is missing.
    expect(fillable({ state: 'unlearned', below: false }, first, 'tpep_pickup_datetime')).toBe(false);
    expect(offersOf({ story: first, claim: { state: 'unlearned', below: false }, fill: fillStep, donors: [{ day: '2021-11-23' }] })).toEqual([]);
  });

  it('after the day, waits for a day that hasn’t arrived, and takes none the history lacks', () => {
    const h = new HistoryRanges(historyWith({ '2024-01-29': { stopAt: 13 } }));
    expect(donorFor(query(h, '2024-01-29', { direction: 'after' }))).toEqual({ rule: 'weekday', direction: 'after', none: 'not arrived' });
    expect(donorFor(query(h, '2024-01-29', { rule: 'nearest', direction: 'after' }))).toMatchObject({ day: '2024-01-30' });
  });

  it('is offered three ways, the flow’s rule first, each day once', () => {
    const h = new HistoryRanges(historyWith({ [DAY]: { stopAt: 13 } }));
    const { picks, none } = donorChoices(query(h, DAY), 'weekday');
    expect(picks.map((p) => [p.rule, p.direction, p.day])).toEqual([['weekday', 'before', '2023-10-04'], ['nearest', 'before', '2023-10-10'], ['nearest', 'after', '2023-10-12'], ['weekday', 'after', '2023-10-18']]);
    expect(none).toBeNull();
    expect(donorChoices(query(h, DAY), 'nearest').picks.map((p) => p.day)).toEqual(['2023-10-10', '2023-10-04', '2023-10-12', '2023-10-18']);
    // A Sunday whose same weekday before is also its nearest good day before: one chip, the flow's rule's.
    const sun = new HistoryRanges(historyWith({ '2023-10-15': { stopAt: 13 }, '2023-10-14': { vendorGone: true }, '2023-10-13': { vendorGone: true }, '2023-10-12': { vendorGone: true }, '2023-10-11': { vendorGone: true }, '2023-10-10': { vendorGone: true }, '2023-10-09': { vendorGone: true } }));
    expect(donorChoices(query(sun, '2023-10-15'), 'weekday').picks.map((p) => [p.rule, p.direction, p.day])).toEqual([['weekday', 'before', '2023-10-08'], ['nearest', 'after', '2023-10-16'], ['weekday', 'after', '2023-10-22']]);
    // No good day before by the flow's rule: why, beside what the other rules found.
    const none2 = donorChoices(query(h, DAY, { listed: (d) => (d > DAY ? listedAll(d) : null) }), 'weekday');
    expect(none2.none).toEqual({ rule: 'weekday', direction: 'before', none: 'no good day within four weeks' });
    expect(none2.picks.map((p) => p.day)).toEqual(['2023-10-12', '2023-10-18']);
  });

  it('follows the watch’s rule, else its pattern’s; a legacy watch the flow’s, else the same weekday (C1, I5)', async () => {
    expect(donorRuleOf(doc(), 'trips')).toBe('weekday');
    expect(donorRuleOf({ publish: { hold: ['wrong'], donor: 'nearest' } }, 'trips')).toBe('nearest');
    expect(donorRuleOf({}, 'trips')).toBe('weekday');
    const general = (w: Record<string, unknown>): FlowDocument => ({ ...doc(), smaltfl: 3, publish: { ...doc().publish!, watch: { trips: { history: 'history.json', ...w } } } });
    expect(donorRuleOf(general({}), 'TRIPS')).toBe('weekday');
    expect(donorRuleOf(general({ pattern: 'weekly' }), 'trips')).toBe('weekday');
    expect(donorRuleOf(general({ donor: 'nearest' }), 'trips')).toBe('nearest');
    // The plan says the same rule for the watched source, whichever format it is.
    const legacy: FlowDocument = { ...doc(), publish: { ...doc().publish!, donor: 'nearest' } };
    for (const d of [doc(), legacy, general({}), general({ donor: 'nearest' })]) {
      expect(validateDocument(d)).toEqual([]);
      const plan = await translate(d, { day: '2023-10-11' });
      expect(plannedDonor(plan.publish, plan.nodes.findIndex((n) => n.origin === 'trips'))).toBe(donorRuleOf(d, 'trips'));
    }
  });
});

describe('the derived document (S4)', () => {
  const donor = { rule: 'weekday' as const, direction: 'before' as const, day: '2023-09-14', file: listedAll('2023-09-14'), claim: { by: 'story' as const, source: 'trips', day: '2023-09-14', state: 'calm' as const, below: false, head: 'A normal Thursday', build: 'dev', history: HISTORY, rows: 125_129 } };
  const fill: Repair = { kind: 'fill', step: 'trips_filled', source: 'trips', missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, donor };
  const complete: Repair = { kind: 'complete', step: 'trips_filled', source: 'trips', missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, donor: null };

  it('sets the fill step’s missing part and donor, adds the donor source, and changes nothing else', async () => {
    const d = repairDocument(doc(), fill);
    expect(validateDocument(d)).toEqual([]);
    expect(d.sources).toEqual([...doc().sources, { id: 'trips_donor', table: 'trips_file_donor', description: 'trips of 2023-09-14, filling its hours' }]);
    expect(d.steps[0]).toEqual({ ...fillStep, inputs: ['trips', 'trips_donor'], missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, from: '2023-09-14' });
    expect(d.steps[1]).toEqual(doc().steps[1]);
    expect({ ...d, sources: doc().sources, steps: doc().steps }).toEqual(doc());
    // Deterministic: anyone makes the same document from the flow and the decision.
    expect(await flowHash(repairDocument(doc(), fill))).toBe(await flowHash(d));
    expect(await flowHash(d)).not.toBe(await flowHash(doc()));
  });

  it('keeps only what arrived outside the missing part, for the complete part', () => {
    const d = repairDocument(doc(), complete);
    expect(validateDocument(d)).toEqual([]);
    expect(d.sources).toEqual(doc().sources);
    expect(d.steps[0]).toEqual({ ...fillStep, missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, from: null });
  });

  it('refuses a flow without the fill step, a derived document, and a remedy that doesn’t fit its kind', () => {
    expect(() => repairDocument({ ...doc(), steps: [{ ...checks, inputs: ['trips'] }] }, fill)).toThrow('the flow has no fill step trips_filled on trips');
    expect(() => repairDocument(doc(), { ...fill, step: 'other' })).toThrow('the flow has no fill step other on trips');
    expect(() => repairDocument(repairDocument(doc(), fill), fill)).toThrow('trips_filled fills already');
    expect(() => repairDocument(doc(), { ...fill, donor: null })).toThrow('a fill needs its donor');
    expect(() => repairDocument(doc(), { ...complete, donor })).toThrow('the complete part has no donor');
    expect(() => repairDocument({ ...doc(), sources: [...doc().sources, { id: 'trips_donor', table: 'x' }] }, fill)).toThrow('the flow has a source trips_donor already');
  });
});

describe('the numbers readers would get (S4, S12)', () => {
  const h = new HistoryRanges(historyWith({ '2023-10-11': { stopAt: 13 }, '2023-10-12': { vendorGone: true }, '2023-10-13': { onlyVendor1: true } }));
  const f = h.file;
  const k = (d: string) => f.days.indexOf(d);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  it('counts a fill of hours from the history’s hours: what arrived, set aside, taken, and in all', () => {
    const arrived = f.rows[k('2023-10-11')]!;
    const setAside = sum(f.hours[k('2023-10-11')]!.slice(13));
    const taken = sum(f.hours[k('2023-10-04')]!.slice(13));
    expect(fillCounts(h, '2023-10-11', { time: 't', hours: [13, 23] }, '2023-10-04')).toEqual({ arrived, setAside, taken, total: arrived - setAside + taken });
    expect(fillCounts(h, '2023-10-11', { time: 't', hours: [13, 23] }, null)).toEqual({ arrived, setAside, taken: 0, total: arrived - setAside });
  });

  it('counts a part from the value counts, and the rest as the day’s rows less the part', () => {
    const v1 = (d: string) => f.values.VendorID!.counts![k(d)]![1]!;
    expect(partRows(h, '2023-10-12', { column: 'VendorID', value: 1 })).toBe(v1('2023-10-12'));
    expect(fillCounts(h, '2023-10-12', { column: 'VendorID', value: 1 }, '2023-10-05')).toEqual({ arrived: f.rows[k('2023-10-12')]!, setAside: v1('2023-10-12'), taken: v1('2023-10-05'), total: f.rows[k('2023-10-12')]! - v1('2023-10-12') + v1('2023-10-05') });
    expect(partRows(h, '2023-10-13', { column: 'VendorID', value: 1, rest: true })).toBe(f.rows[k('2023-10-13')]! - v1('2023-10-13'));
    // A value the day never had counts none; a column the history doesn't count, and a day it lacks, can't be counted.
    expect(partRows(h, '2023-10-12', { column: 'VendorID', value: 9 })).toBe(0);
    expect(partRows(h, '2023-10-12', { column: 'payment_type', value: 0 })).toBeNull();
    expect(fillCounts(h, '2025-01-01', { time: 't', hours: [13, 23] }, null)).toBeNull();
    expect(fillCounts(h, '2023-10-11', { time: 't', hours: [13, 23] }, '2025-01-01')).toBeNull();
  });
});

describe('the options a held day gets (S5)', () => {
  const short = { state: 'wrong' as const, below: true };
  const hoursDay = story({ hero: 'hours', hours: hours(13, 23) });
  const partDay = story({ hero: 'split', split: split({ kind: 'held', column: 'payment_type', value: '0', name: 'Flex Fare' }) });
  const fillOf = { time: 'tpep_pickup_datetime' };

  it('fills from the first donor and offers the part that arrived, by the cause', () => {
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [{ day: '2023-09-14' }, { day: '2023-09-20' }] })).toEqual([
      { option: 'fill', label: 'Fill from Thu 14' },
      { option: 'complete', label: 'Before 13:00 only' },
    ]);
    expect(offersOf({ story: partDay, claim: short, fill: fillOf, donors: [{ day: '2023-09-15' }], partFails: true })).toEqual([
      { option: 'fill', label: 'Fill from Fri 15' },
      { option: 'complete', label: 'Flex Fare only', note: 'fails its checks' },
    ]);
  });

  it('draws the fill off with no good day near, and both off while a later day is current', () => {
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [] })).toEqual([
      { option: 'fill', label: 'Fill', off: 'No good day near' },
      { option: 'complete', label: 'Before 13:00 only' },
    ]);
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [{ day: '2023-09-14' }], later: '2023-09-25' })).toEqual([
      { option: 'fill', label: 'Fill from Thu 14', off: 'Mon 25 is published' },
      { option: 'complete', label: 'Before 13:00 only', off: 'Mon 25 is published' },
    ]);
  });

  it('offers neither without a fill step, without a missing part, on a day that isn’t short, or with two sources held', () => {
    expect(offersOf({ story: hoursDay, claim: short, fill: undefined, donors: [{ day: '2023-09-14' }] })).toEqual([]);
    expect(offersOf({ story: story({ hero: 'amount' }), claim: short, fill: fillOf, donors: [{ day: '2023-09-14' }] })).toEqual([]);
    expect(offersOf({ story: hoursDay, claim: { state: 'wrong', below: false }, fill: fillOf, donors: [{ day: '2023-09-14' }] })).toEqual([]);
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [{ day: '2023-09-14' }], holding: 2 })).toEqual([]);
  });

  it('offers to withdraw a fill or a part readers have (Q-61)', () => {
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [{ day: '2023-09-20' }], readers: 'fill' })).toEqual([
      { option: 'fill', label: 'Fill from Wed 20' },
      { option: 'complete', label: 'Before 13:00 only' },
      { option: 'dont', label: 'Withdraw the fill', withdraws: true },
    ]);
    expect(offersOf({ story: hoursDay, claim: short, fill: fillOf, donors: [], readers: 'complete' }).at(-1)).toEqual({ option: 'dont', label: 'Withdraw the part', withdraws: true });
  });
});

describe('a day’s versions (S7)', () => {
  const inputs = (day: string, file = 'f1') => ({ flow: 'flow-a', parameters: { day }, files: { trips: file } });
  let seq = 0;
  const entry = (kind: LogEntry['kind'], about: Record<string, unknown>): Pick<LogEntry, 'seq' | 'kind' | 'about'> => ({ seq: seq++, kind, about: about as LogEntry['about'] });
  // A derived run's inputs are its own: the derived document's flow hash and the donor's file among its files.
  const derivedInputs = (day: string, donor: string) => ({ flow: `flow-filled-${donor}`, parameters: { day }, files: { trips: 'f1', trips_donor: `d-${donor}` } });
  const run = (outcome: string, run: number, manifest: string, day: string, extra: Record<string, unknown> = {}) => {
    const donor = ((extra.repair as { donor?: { day?: string } } | undefined)?.donor?.day) ?? 'none';
    return entry('run', { run, manifest, outcome, day, inputs: outcome === 'derived' ? derivedInputs(day, donor) : inputs(day, (extra.file as string) ?? 'f1'), ...extra });
  };

  it('lists what arrived, its fills and re-runs, and ticks the one readers have', () => {
    seq = 0;
    const entries = [
      run('ok', 1, 'm-wed', '2023-09-20'),
      run('held', 2, 'm-thu', '2023-09-21', { rows: 41_939 }),
      run('derived', 3, 'm-fill', '2023-09-21', { rows: 121_931, repair: { kind: 'fill', donor: { day: '2023-09-14' } } }),
      entry('decide', { day: '2023-09-21', option: 'fill', derived: { run: 3, manifest: 'm-fill' } }),
      entry('release', { run: 3, manifest: 'm-fill', decision: 3, outcome: 'applied' }),
      // The same day run again after a reload: the same version.
      run('held', 4, 'm-thu-2', '2023-09-21'),
      run('derived', 5, 'm-refill', '2023-09-21', { repair: { kind: 'fill', donor: { day: '2023-09-20' } } }),
    ];
    const v = dayVersions(entries, '2023-09-21');
    expect(v.map((x) => [x.kind, x.run, x.donor ?? null, x.rows ?? null, x.shown])).toEqual([
      ['arrived', 2, null, 41_939, null],
      ['filled', 3, '2023-09-14', 121_931, 'now'],
      ['filled', 5, '2023-09-20', null, null],
    ]);
    // A refill released, then withdrawn: readers go back to what they had before it (Wed 20, another day's version).
    const more = [
      ...entries,
      entry('decide', { day: '2023-09-21', option: 'fill', derived: { run: 5, manifest: 'm-refill' } }),
      entry('release', { run: 5, manifest: 'm-refill', decision: 7, outcome: 'applied' }),
    ];
    expect(dayVersions(more, '2023-09-21').map((x) => x.shown)).toEqual([null, 'before', 'now']);
    const withdrawn = [...more, entry('decide', { day: '2023-09-21', option: 'dont' }), entry('release', { decision: 9, outcome: 'applied', withdraws: 8 })];
    expect(dayVersions(withdrawn, '2023-09-21').map((x) => x.shown)).toEqual([null, 'now', 'before']);
    // A later day published: readers have no version of this day now.
    const later = [...more, run('ok', 6, 'm-fri', '2023-09-22')];
    expect(dayVersions(later, '2023-09-21').map((x) => x.shown)).toEqual([null, 'before', 'before']);
    // The fill made again in a new engine (its decision applied again after a reload): the same inputs, so the same
    // version, shown now once its release applies again.
    const reload = [...more, run('held', 7, 'm-thu-3', '2023-09-21'), run('derived', 8, 'm-refill-2', '2023-09-21', { repair: { kind: 'fill', donor: { day: '2023-09-20' } } }), entry('release', { run: 8, manifest: 'm-refill-2', decision: 7, outcome: 'applied' })];
    expect(dayVersions(reload, '2023-09-21').map((x) => [x.kind, x.run, x.shown])).toEqual([['arrived', 2, null], ['filled', 3, 'before'], ['filled', 5, 'now']]);
  });

  it('counts another file of the day as a re-run, and a passing re-run shown as it publishes', () => {
    seq = 0;
    const entries = [run('held', 1, 'm-a', '2023-09-21'), run('ok', 2, 'm-b', '2023-09-21', { file: 'f2' }), run('ok', 3, 'm-c', '2023-09-21', { file: 'f2' })];
    expect(dayVersions(entries, '2023-09-21').map((x) => [x.kind, x.run, x.shown])).toEqual([['arrived', 1, null], ['rerun', 2, 'now']]);
    expect(dayVersions(entries, '2023-09-22')).toEqual([]);
  });

  it('reads a day from the period parameter when an entry names no day', () => {
    seq = 0;
    const e = entry('run', { run: 1, manifest: 'm', outcome: 'held', inputs: inputs('2023-09-21') });
    expect(dayVersions([e], '2023-09-21', 'day').map((x) => x.kind)).toEqual(['arrived']);
    expect(dayVersions([e], '2023-09-21')).toEqual([]);
  });
});

describe('Accept the new level: when it is offered, and the level it records (amendment 1 S6, X6, Q-73)', () => {
  const DAY = '2023-10-11';
  const told = (trouble: Parameters<typeof historyWith>[0]) => {
    const h = new HistoryRanges(historyWith(trouble));
    return flowStory(h, DAY, doc(), 'trips');
  };
  const story = { by: 'story' as const };

  it('is offered for a part that vanished, with its share and count and the rows, and for an amount', () => {
    const gone = told({ [DAY]: { vendorGone: true } });
    expect(gone).toMatchObject({ state: 'wrong', hero: 'split', split: { kind: 'vanished' } });
    expect(acceptable(gone, { state: 'wrong' }, [story])).toBe(true);
    expect(levelMetrics(gone)).toEqual(expect.arrayContaining(['count:VendorID=1', 'value:VendorID=1']));
    expect(levelOf(gone, null, [story], DAY, 'trips')).toEqual({ source: 'trips', from: DAY, metrics: levelMetrics(gone) });
    const blank = told({ [DAY]: { more: 1.8 } });
    if (blank.state === 'wrong' && blank.hero === 'amount') expect(levelMetrics(blank)).toContain('trips');
    // As offersOf puts it on the sheet, last; off while a later day is current.
    expect(offersOf({ story: gone, claim: { state: 'wrong', below: true }, fill: undefined, donors: [], told: gone, holds: [story] })).toEqual([{ option: 'accept', label: 'Accept the new level' }]);
    expect(offersOf({ story: gone, claim: { state: 'wrong', below: true }, fill: undefined, donors: [], told: gone, holds: [story], later: '2023-10-16' })).toEqual([{ option: 'accept', label: 'Accept the new level', off: 'Mon 16 is published' }]);
  });

  it('is never offered for an hours cause, a part that held, a bad value, the checks, a source not judged, or a day not wrong', () => {
    const hours = told({ [DAY]: { stopAt: 13 } });
    expect(hours.hero).toBe('hours');
    expect(acceptable(hours, null, [story])).toBe(false);
    const heldPart = told({ [DAY]: { onlyVendor1: true } });
    if (heldPart.split) expect([heldPart.split.kind, acceptable(heldPart, null, [story])]).toEqual(['held', false]);
    const gone = told({ [DAY]: { vendorGone: true } });
    expect(acceptable({ ...gone, split: { ...gone.split!, bad: true } }, null, [story])).toBe(false);
    expect(acceptable(gone, null, [story, { by: 'checks' }])).toBe(false);
    expect(acceptable(gone, null, [{ by: 'unjudged' }])).toBe(false);
    expect(acceptable(gone, { state: 'unlearned' }, [story])).toBe(false);
    expect(acceptable(told({}), null, [story])).toBe(false);
    expect(offersOf({ story: gone, claim: null, fill: undefined, donors: [], told: gone, holds: [story], readers: 'fill' }).map((o) => o.option)).toEqual(['dont']);
  });
});

describe('the way a level’s metrics were off (amendment 1 S6, Q-57b)', () => {
  it('says each down for a part that vanished on a short day, so a day it comes back on is a change again', () => {
    const s = flowStory(new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } })), '2023-10-11', doc(), 'trips');
    const ways = levelWays(s);
    expect(ways.get('value:VendorID=1')).toBe(false);
    expect(ways.get('count:VendorID=1')).toBe(false);
    expect([...ways.keys()].every((k) => levelMetrics(s).includes(k))).toBe(true);
  });

  it('says what is off on a later day besides the level, and a day back at the old level (the audit tells both again)', () => {
    const level = flowStory(new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } })), '2023-10-11', doc(), 'trips');
    const then = levelWays(level);
    const metrics = levelMetrics(level);
    // The same part still gone: the level stands.
    expect(levelStray(new Map([['value:VendorID=1', false]]), then, metrics)).toEqual([]);
    // The part back (up), or another metric off: off besides the level.
    expect(levelStray(new Map([['value:VendorID=1', true]]), then, metrics)).toEqual(["value:VendorID=1 up, down on the level's day"]);
    expect(levelStray(new Map([['value:VendorID=1', false], ['share:store_and_fwd_flag=Y', true]]), then, metrics)).toEqual(["share:store_and_fwd_flag=Y up, which the level doesn't name"]);
    // Nothing off at all: back to the old level.
    expect(levelStray(new Map(), then, metrics)).toBeNull();
  });
});
