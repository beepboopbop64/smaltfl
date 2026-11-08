/**
 * A day's story (ADR 0008): the cause as a population or a time, the gate, what follows from it, and the words a screen
 * shows at a glance, on made-up days whose trouble is known.
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { HistoryRanges } from '../src/core/history.js';
import { newsOf } from '../src/core/news.js';
import { ACT_VERB, CELL_KINDS, CONTEXT_TAG, HEALTH_HEAD, SETTLE_LINE, STRIP_KEY, approx, cardWords, compact, countLabel, gateLabels, glanceStrings, partLabel, ruleOrder, ruleUsual, rowName, shortWho, splitOf, splitSentence, stepLabels, storyOf, wordsIn, type Gate, type Story, type StoryOptions } from '../src/core/story.js';
import { historyWith, vendorNames, type Trouble } from './helpers/history.js';

const DAY = '2023-10-11'; // a Wednesday
const options: StoryOptions = { names: vendorNames, step: 'trips_valid', limit: 0.1 };
const story = (trouble: Record<string, Trouble>, day = DAY, more: Partial<StoryOptions> = {}): Story => {
  const h = new HistoryRanges(historyWith(trouble));
  return storyOf(h, day, newsOf(h, day, vendorNames), { ...options, ...more });
};
const words = (s: Story) => glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0);

describe('the cause, as a population', () => {
  it('names the part that arrived as usual when everything else almost stopped', () => {
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } });
    expect(s.state).toBe('wrong');
    expect(s.head).toBe('Only Vendor 1 records arrived');
    expect(s.hero).toBe('split');
    expect(s.split).toMatchObject({ kind: 'held', name: 'Vendor 1' });
    expect(s.split!.part.today / s.split!.part.usual).toBeGreaterThan(0.67);
    expect(s.split!.rest.today / s.split!.rest.usual).toBeLessThan(0.01);
    // The amount restates the split: absorbed, not told again.
    expect(s.absorbed.map((f) => f.kind)).toContain('volume');
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'absorbed', severity: 'note', was: 'alert' });
    expect(s.primary).toBe('notify');
  });

  it('shows a held gate with its rows against a day like it, so a share past its limit isn’t read as more bad rows', () => {
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } });
    expect(s.gate).toMatchObject({ step: 'trips_valid', held: true, limit: 0.1 });
    // 10.5% of a near-blank day’s rows is fewer rows than a day like it drops.
    expect(s.gate!.dropped).toBeLessThan(s.gate!.usual!.low);
    expect(s.labels.hero).toContain('Checks held');
    expect(s.labels.hero).toContain('limit 10%');
    // The dropped share follows from the cause (its count is not past usual): folded, not a story of its own.
    expect(s.follows.map((f) => f.kind)).toContain('dropped');
  });

  it('names a part that vanished while everything else held', () => {
    const s = story({ [DAY]: { vendorGone: true } });
    expect(s.head).toBe('Vendor 1 sent almost nothing');
    expect(s.split).toMatchObject({ kind: 'vanished', name: 'Vendor 1' });
    expect(s.split!.rest.today / s.split!.rest.usual).toBeGreaterThan(0.9);
    expect(s.findings.find((f) => f.kind === 'gone')!.tier).toBe('absorbed');
    // Each part's count against its usual one, said so it can't read as a fraction of it.
    expect(s.labels.hero.slice(0, 4)).toEqual(['Vendor 1', expect.stringMatching(/^0 · usual ~[\d.]+k$/), 'Everything else', expect.stringMatching(/^[\d,]+ · usual ~[\d.]+k$/)]);
    // Something wrong shows its checks, passed or not (ADR 0008 §10), and their words count at a glance.
    expect(s.labels.hero.slice(4, 6)).toEqual(['Checks passed', '4.0% of arrived rows dropped']);
    expect(words(s)).toBeLessThanOrEqual(60);
  });

  it('names a part that surged, as unusual, with marking it as expected its verb, said optional', () => {
    const s = story({ [DAY]: { vendorSurge: 2.3 } });
    expect(s.split).toMatchObject({ kind: 'surged', name: 'Vendor 1' });
    expect(s.head).toMatch(/^Vendor 1 records 2\.\d× usual$/);
    expect(s.primary).toBe('expected');
    expect(s.labels.primary).toBe('Mark as expected (optional)');
    expect(ACT_VERB.expected).toBe('Mark as expected (optional)');
  });

  it('says there is nothing to do under an unusual head only when the day’s total is in its range (ADR 0008 §6)', () => {
    // (A day whose total is in its range says it: New Year's Day 2024, test/story-real.test.ts.) Fewer trips, or more,
    // than the range: unusual, but its total isn't in range, so nothing is said of acting.
    for (const t of [{ more: 0.8 }, { vendorSurge: 1.6 }]) {
      const low = story({ [DAY]: t });
      expect(low.state).toBe('unusual');
      expect(low.amount!.value < low.amount!.low || low.amount!.value > low.amount!.high).toBe(true);
      expect(low.labels.settle).toBeNull();
    }
    expect(SETTLE_LINE).toBe('Total in range · nothing to do');
    // Something wrong, and a calm day: never.
    expect(story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }).labels.settle).toBeNull();
    expect(story({}, '2023-10-04').labels.settle).toBeNull();
  });

  it('finds no split on an ordinary day, and none from a symptom: the named side is the smaller one', () => {
    const h = new HistoryRanges(historyWith({ [DAY]: { onlyVendor1: true } }));
    expect(splitOf(h, '2023-10-04', vendorNames)).toBeNull();
    // Vendor 2 (70% of the trips) vanishing is the same day said from its other side: it is named as vendor 1 held.
    expect(splitOf(h, DAY, vendorNames)!.value).toBe('1');
  });
});

describe('the split in one sentence, from its figures', () => {
  it('says “almost stopped” only for a rest that stayed near nothing all day, and “as usual” only near the usual', () => {
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } });
    expect(splitSentence(s)).toMatch(/^Vendor 1 as usual \([\d,]+; usual [\d.]+k–[\d.]+k\); everything else almost stopped \([\d,]+; usual ~[\d.]+k\)\.$/);
    const gone = story({ [DAY]: { vendorGone: true } });
    expect(splitSentence(gone)).toMatch(/^Vendor 1 almost stopped \(0; usual [\d.]+k–[\d.]+k\); everything else (as usual|up \d+%|down \d+%) /);
    const surge = story({ [DAY]: { vendorSurge: 2.3 } });
    expect(splitSentence(surge)).toMatch(/^Vendor 1 2\.\d× usual \(/);
    for (const x of [s, gone, surge]) expect(wordsIn(splitSentence(x)!)).toBeLessThanOrEqual(20);
  });

  it('says a rest that fell during the day as a fall from its hour, not as stopping', () => {
    const s = story({ [DAY]: { stopAt: 13, onlyVendor1: false, vendorShare: 0.5 } });
    if (s.split?.kind === 'held') expect(splitSentence(s)).toMatch(/everything else fell from 13:00 \(/);
    expect(splitSentence(s) ?? '').not.toMatch(/almost stopped/);
  });
});

describe('the cause, as a time', () => {
  it('leads with the hour the trips fall, and folds what follows from it', () => {
    const s = story({ [DAY]: { stopAt: 13, vendorShare: 0.5 } });
    expect(s.hero).toBe('hours');
    // Where the fall applies, and the rate the trips fell to, in the head; that they go on, and what is missing, on the
    // chart.
    expect(s.head).toMatch(/^Trips fall to ~[\d,]+\/h from 13:00$/);
    expect(s.head.match(/~[\d,]+\/h/)![0]).toBe(s.hoursLabels!.floor.replace(/^still /, ''));
    expect(s.hours).toMatchObject({ from: 13, to: 23 });
    expect(s.hoursLabels).toMatchObject({ cut: '13:00', ghost: 'usual Wednesday' });
    expect(s.hoursLabels!.floor).toMatch(/^still ~[\d,]+\/h$/);
    expect(s.hoursLabels!.missing).toMatch(/^~[\d.]+k missing$/);
    expect(s.labels.hero.slice(0, 4)).toEqual([s.hoursLabels!.cut, s.hoursLabels!.floor, s.hoursLabels!.missing, s.hoursLabels!.ghost]);
    // The day's own change sits on the amount line, since the head's fall is the hours', named as the whole day's.
    expect(s.labels.amount).toEqual([expect.stringMatching(/ trips$/), expect.stringMatching(/^whole day −\d+%$/), expect.stringMatching(/^usual /)]);
    expect(s.primary).toBe('incident');
    // The vendors' mix moved with it, within what the cause moved: folded as the same day's, told as a note.
    const mix = s.findings.find((f) => f.key === 'share:VendorID=1')!;
    expect(['follows', 'sameDay', 'absorbed']).toContain(mix.tier);
    expect(mix.severity).toBe('note');
    expect(s.stories).toEqual([]);
  });
});

describe('what never folds', () => {
  it('keeps a value never seen before as its own story, even on a day with a cause', () => {
    const s = story({ [DAY]: { stopAt: 13, newValue: true } });
    const fresh = s.findings.find((f) => f.kind === 'new')!;
    expect(fresh.tier).toBe('standalone');
    expect(fresh.severity).toBe('warn');
    expect(s.stories.map((f) => f.kind)).toContain('new');
  });

  it('tells a finding marked as expected among the notes, marked, never as calm', () => {
    const s = story({ [DAY]: { newValue: true } }, DAY, { acknowledged: new Set(['new:VendorID']) });
    const fresh = s.findings.find((f) => f.kind === 'new')!;
    expect(fresh).toMatchObject({ tier: 'note', acknowledged: true, severity: 'note' });
    expect(s.state).toBe('notes');
    expect(s.labels.notes).toBe('1 note');
  });
});

describe('what a viewer may see', () => {
  it('tells nothing from a column the viewer’s policy removes: no finding, no split', () => {
    const open = story({ [DAY]: { vendorGone: true } });
    expect(open.split?.column).toBe('VendorID');
    const closed = story({ [DAY]: { vendorGone: true } }, DAY, { hidden: new Set(['vendorid']) });
    expect(closed.split).toBeNull();
    expect(closed.findings.some((f) => f.columns?.includes('VendorID'))).toBe(false);
    // The amount is still the viewer's to see: told as the day's cause, without the part they can't.
    expect(closed.head).toMatch(/^Fewer trips: [\d,]+ \(−\d+%\)$/);
  });
});

describe('days in a row', () => {
  it('says which day of an episode it is, and the trips short so far', () => {
    const next = plusDays(DAY, 1);
    const s = story({ [DAY]: { stopAt: 13 }, [next]: { onlyVendor1: true } }, next);
    expect(s.episode).toMatchObject({ days: 2, since: DAY, hour: 13 });
    // Day 2's chip counts the trips short so far, as the episode's hours count them (days.shortfall), to this day.
    expect(s.episode!.short!.estimate).toBeGreaterThan(0);
    expect(s.chip).toBe(`Day 2 · ~${compact(s.episode!.short!.estimate)} short`);
  });

  it('says a day after an episode is back to normal, names the episode, and says nothing is left to do', () => {
    const after = plusDays(DAY, 1);
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }, after);
    expect(s.state).toBe('recovery');
    expect(s.head).toBe('Back to normal');
    // Its days, never what its last day was: what it was is a tap away, in the episode's sheet.
    expect(s.chip).toBe('after Wed');
    expect(s.recovery).toMatchObject({ from: DAY, to: DAY, held: [DAY], published: [] });
    expect(s.labels.after).toBe('Nothing to do · Wed held');
    expect(s.primary).toBeNull();
    // A day that went out short is said as published, not held.
    const short = story({ [DAY]: { stopAt: 13 } }, after);
    // From the hour its day fell.
    expect(short.chip).toBe('after Wed 13:00');
    expect(short.labels.after).toBe('Nothing to do · Wed published short');
    expect(wordsIn(s.chip!)).toBeLessThanOrEqual(5);
    expect(glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(24);
  });

  it('says an ordinary day is one, by its weekday, with nothing to do', () => {
    const s = story({}, '2023-10-04');
    expect(s).toMatchObject({ state: 'calm', head: 'A normal Wednesday', hero: 'calm', primary: null });
    expect(s.health.every((c) => c.severity === null)).toBe(true);
  });
});

describe('the words at a glance', () => {
  it('stays within its budgets: an incident day 60 words, a calm day 16', () => {
    expect(words(story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }))).toBeLessThanOrEqual(60);
    expect(words(story({ [DAY]: { stopAt: 13, vendorShare: 0.5 } }))).toBeLessThanOrEqual(60);
    expect(words(story({}, '2023-10-04'))).toBeLessThanOrEqual(16);
    for (const s of [story({ [DAY]: { onlyVendor1: true } }), story({ [DAY]: { vendorGone: true } }), story({}, '2023-10-04')]) {
      expect(wordsIn(s.head), s.head).toBeLessThanOrEqual(6);
      expect(wordsIn(s.chip ?? ''), s.chip ?? '').toBeLessThanOrEqual(5);
      for (const l of glanceStrings(s)) expect(l).not.toMatch(/because|caused by|feed stopped|disappeared|The band/);
    }
  });

  it('says counts short: 20, 4,613 as 4.6k, 110k; fine enough to subtract where a difference sits beside them', () => {
    expect([compact(20), compact(4613), compact(110_400), compact(1_234_000)]).toEqual(['20', '4.6k', '110k', '1.2M']);
    // 70,495 against ~68k beside a +2k step reads as 2.5k: 68.5k doesn't.
    expect([approx(68_486), approx(4_756), approx(110_157), approx(85_000)]).toEqual(['68.5k', '4.8k', '110k', '85k']);
    expect(countLabel({ today: 10_518, usual: 4_508, low: null, high: null })).toBe('10,518 · usual ~4.5k');
  });

  it('labels a waterfall in one format, whole counts that add up as read and end on the count its card prints', () => {
    expect(stepLabels(115_240, [-110_480, -143], 4_617)).toEqual({ start: '115,240', steps: ['−110,480', '−143'], end: '4,617' });
    expect(stepLabels(119_431, [-77_466, -26], 41_939)).toEqual({ start: '119,431', steps: ['−77,466', '−26'], end: '41,939' });
    expect(stepLabels(120_000, [-60_000, 2_000], 62_000)).toEqual({ start: '120,000', steps: ['−60,000', '+2,000'], end: '62,000' });
    expect(stepLabels(100_000, [], 100_000)).toEqual({ start: '100,000', steps: [], end: '100,000' });
  });

  it('labels the gate’s two bars by what they count, at one decimal (two within a point of its limit), with the gap to it', () => {
    const gate = (dropped: number, rows: number, limit: number | null = 0.1): Gate => ({ step: 'trips_valid', rows, dropped, share: dropped / rows, limit, held: limit !== null && dropped / rows > limit, near: false, usual: { expected: 5000, low: 3800, high: 5400 }, rules: [] });
    // Just over: the share and its margin to the same decimals, so one is the other less the limit; zoomed.
    expect(gateLabels(gate(442, 4229))).toEqual({ said: '10.45%', share: '10.45% of arrived rows dropped', limit: 'limit 10%', margin: '0.45 pt over', zoom: true, rows: '442 rows dropped', usual: 'usual 3.8k–5.4k' });
    expect(gateLabels(gate(4004, 41_939))).toMatchObject({ share: '9.55% of arrived rows dropped', margin: '0.45 pt under', zoom: true });
    // Past a point from it, a tenth; zoomed within two points.
    expect(gateLabels(gate(1150, 10_000))).toMatchObject({ said: '11.5%', margin: '1.5 pt over', zoom: true });
    // Far past it, still a tenth and the gap said, not zoomed: Fri Sep 22, 2023's 45.67%.
    expect(gateLabels(gate(2116, 4633))).toMatchObject({ share: '45.7% of arrived rows dropped', margin: '35.7 pt over', zoom: false });
    // Far under it: Tue Nov 15, 2022's 4.61%, as the canvas says it.
    expect(gateLabels(gate(461, 10_000))).toMatchObject({ said: '4.6%', margin: '5.4 pt under', zoom: false });
    // Never a margin of nothing, nor a share printed as its limit, nor a share of something as 0.0%.
    const hair = gateLabels(gate(100_004, 1_000_000));
    expect(hair.margin).toBe('0.0004 pt over');
    expect(hair.share).not.toMatch(/^10(\.0+)?%/);
    expect(gateLabels(gate(3, 10_000)).said).toBe('<0.1%');
    expect(gateLabels(gate(500, 4000, null))).toMatchObject({ limit: null, margin: null, zoom: false, share: '12.5% of arrived rows dropped' });
  });

  it('says a rule’s usual one way, and orders the rules one way (tabs #12)', () => {
    // A rule no day has failed: "never fails", not a band of half a row rounded to "usual 1–1".
    expect(ruleUsual({ rows: 0, never: true, usual: { low: 0.5, high: 0.5 } })).toBe('never fails');
    expect(ruleUsual({ rows: 3, never: false, usual: { low: 0.5, high: 0.5 } })).toBe('usual 0');
    expect(ruleUsual({ rows: 1, never: false, usual: { low: 1.2, high: 1.4 } })).toBe('usual 1');
    expect(ruleUsual({ rows: 4305, never: false, usual: { low: 365.4, high: 2604.8 } })).toBe('usual 365–2.6k');
    // No range: nothing, so the row ends on its count.
    expect(ruleUsual({ rows: 1306, never: false, usual: null })).toBe('');
    const order = ruleOrder([{ name: 'in_month', warns: false, rows: 0 }, { name: 'passengers', warns: true, rows: 10_518 }, { name: 'duration', warns: false, rows: 1553 }, { name: 'distance', warns: false, rows: 4305 }]).map((r) => r.name);
    expect(order).toEqual(['distance', 'duration', 'in_month', 'passengers']);
    // The head over the gate says its share as its bar does: 8.6%, never 9% over a bar labelled 8.6%.
    const g: Gate = { step: 'trips_valid', rows: 81_013, dropped: 6942, share: 6942 / 81_013, limit: 0.1, held: false, near: false, usual: null, rules: [] };
    expect(gateLabels(g).said).toBe('8.6%');
    expect(gateLabels(g).share.startsWith(gateLabels(g).said)).toBe(true);
  });

  it('cuts a head to a canvas card’s line without cutting a word or its number (tabs #32)', () => {
    expect(cardWords('More Flex Fare trips: 5.3%', 21)).toBe('Flex Fare trips: 5.3%');
    expect(cardWords('Stored and forwarded N: 97% (usually 98–99%)', 21)).toBe('forwarded N: 97%');
    expect(cardWords('Busier than usual for days', 21)).toBe('Busier than usual');
    expect(cardWords('Normal for MLK Day', 21)).toBe('Normal for MLK Day');
    for (const h of ['More Flex Fare trips: 5.3%', 'Stored and forwarded N: 97%', 'Busier than usual for days']) expect(cardWords(h, 21).length).toBeLessThanOrEqual(21);
  });

  it('names who a vendor’s code is beside it, short', () => {
    expect(shortWho('Creative Mobile Technologies, LLC')).toBe('Creative Mobile');
    expect(shortWho('Curb Mobility, LLC')).toBe('Curb Mobility');
    expect(shortWho('Myle Technologies Inc')).toBe('Myle Technologies');
    expect(shortWho('Helix')).toBe('Helix');
    expect(partLabel({ name: 'Vendor 1', who: 'Creative Mobile' })).toBe('Vendor 1 · Creative Mobile');
    expect(partLabel({ name: 'Flex Fare' })).toBe('Flex Fare');
    const named = new HistoryRanges(historyWith({ [DAY]: { vendorGone: true } }));
    const names = { ...vendorNames, label: (_c: string, v: unknown) => (String(v) === '1' ? 'Creative Mobile Technologies, LLC' : String(v)) };
    const s = storyOf(named, DAY, newsOf(named, DAY, names), { ...options, names });
    expect(s.split).toMatchObject({ name: 'Vendor 1', who: 'Creative Mobile' });
    expect(s.labels.hero[0]).toBe('Vendor 1 · Creative Mobile');
    // Without a meaning, the code alone.
    expect(story({ [DAY]: { vendorGone: true } }).split!.who).toBeUndefined();
  });

  it('counts a strip’s key where a strip of days is shown at a glance', () => {
    expect(story({}, '2023-10-04').labels.key).toEqual([...STRIP_KEY]);
    expect(story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }).labels.key).toEqual([]);
    expect(glanceStrings(story({}, '2023-10-04'))).toEqual(expect.arrayContaining([...STRIP_KEY]));
  });

  it('names the explained changes in words, not counted chips', () => {
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } });
    expect(s.labels.follows).toMatch(/^\d+ changes? this explains$/);
    for (const k of s.labels.kinds) expect(k).toMatch(/^(shares|values gone|blanks|spreads|times|checks|new values|new pairs|other)$/);
    expect(s.labels.kinds.length).toBeLessThanOrEqual(3);
  });

  it('folds the changes it explains and the same day’s into one row at a glance, its first named (ADR 0008 §6)', () => {
    const s = story({ [DAY]: { vendorSurge: 1.6 } });
    const all = [...s.follows, ...s.sameDay];
    expect(all.length).toBeGreaterThan(1);
    const first = all[0]!;
    expect(s.labels.folded).toBe(`${rowName(first, first.columns?.[0] ? vendorNames.column(first.columns[0]) : null)} + ${all.length - 1} more`);
    // At a glance the one row stands for both; their own heads show once it opens.
    const g = glanceStrings(s);
    expect(g).toContain(s.labels.folded);
    expect(g).not.toContain(s.labels.follows);
    expect(g).not.toContain(s.labels.sameDay);
    for (const k of s.labels.kinds) expect(g).not.toContain(k);
    // A calm day has nothing to fold.
    expect(story({}, '2023-10-04').labels.folded).toBeNull();
  });

  it('names a finding short by its title up to its figures, with what a share is', () => {
    expect(rowName({ title: 'Passengers 1: 0.2% (usually 70–75%)', kind: 'share' })).toBe('Passengers 1 share');
    expect(rowName({ title: 'Extras 2.5: 0.02% (usually 12–14%)', kind: 'gone' })).toBe('Extras 2.5 gone');
    expect(rowName({ title: 'Duration rule: 1.7% fail (usually 1.2–1.6%)', kind: 'rule' })).toBe('Duration rule');
    expect(rowName({ title: 'Checks dropped 9.5% (usually 4.0–6.4%)', kind: 'dropped' })).toBe('Checks dropped');
    expect(rowName({ title: 'Distance: the lowest tenth higher', kind: 'shape' })).toBe('Distance');
    // A title still over four words is said by its column.
    expect(rowName({ title: 'Pickup time earlier in the day than usual', kind: 'shape' }, 'Pickup time')).toBe('Pickup time');
  });
});

describe('the context, the health row and the tiers (ADR 0008 §6)', () => {
  it('tells snow as a note after the numbers, never in the chip a cause takes, and never as a reason', () => {
    // A calm day with snow: a plain note of today's, and no chip.
    const calm = story({ '2023-10-04': { snow: 6 } }, '2023-10-04');
    expect(calm.chip).toBeNull();
    expect(calm.labels.context).toBe('❄ 6.0 cm today');
    // Tagged as context where it shows, the tag counted at a glance (ADR 0008 §11).
    expect(glanceStrings(calm)).toContain(`${CONTEXT_TAG} ❄ 6.0 cm today`);
    expect(words(calm)).toBeLessThanOrEqual(16);
    // A day of fewer trips after a snowy one: today's and the day before's, its weekday named.
    const before = plusDays(DAY, -1);
    const low = story({ [DAY]: { more: 0.8, snow: 1.5 }, [before]: { snow: 7.2 } });
    expect(low).toMatchObject({ hero: 'amount', state: 'unusual' });
    expect(low.chip).toBeNull();
    expect(low.labels.context).toBe('❄ 1.5 cm today · 7.2 cm Tue');
    for (const l of glanceStrings(low)) expect(l).not.toMatch(/because|caused by|due to/);
    // A day with something wrong tells its cause; the day after an episode, what is left of it: no weather on either.
    expect(story({ [DAY]: { onlyVendor1: true, dropShare: 0.105, snow: 4 } }).labels.context).toBeNull();
    expect(story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 }, [plusDays(DAY, 1)]: { snow: 4 } }, plusDays(DAY, 1)).labels.context).toBeNull();
  });

  it('heads the health row once, counted at a glance, the same five cells on every day', () => {
    for (const s of [story({}, '2023-10-04'), story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }), story({ [DAY]: { vendorSurge: 2.3 } })]) {
      // A calm day's head says its cells are all normal: a blank cell can't be told from one not checked.
      const head = s.state === 'calm' ? `${HEALTH_HEAD} · all normal` : HEALTH_HEAD;
      expect(s.labels.health).toBe(head);
      expect(glanceStrings(s)).toContain(head);
      expect(s.health.map((c) => c.cell)).toEqual(Object.keys(CELL_KINDS));
    }
    expect(story({}, '2023-10-04').state).toBe('calm');
  });

  it('accounts for every finding in one tier, so the rows on screen add up to what was found', () => {
    for (const trouble of [{ onlyVendor1: true, dropShare: 0.105 }, { vendorGone: true }, { vendorSurge: 2.3 }, { stopAt: 13, vendorShare: 0.5 }, { newValue: true }, { more: 0.55, snow: 2 }] as Trouble[]) {
      const h = new HistoryRanges(historyWith({ [DAY]: trouble }));
      const found = newsOf(h, DAY, vendorNames).filter((f) => f.severity !== 'ok');
      const s = storyOf(h, DAY, found, options);
      const tiers = [s.cause, ...s.stories, ...s.more, ...s.absorbed, ...s.follows, ...s.sameDay, ...s.notes, s.context].filter((f) => !!f);
      // Each finding told once, in exactly one tier.
      expect(new Set(tiers.map((f) => f!.key)).size, JSON.stringify(trouble)).toBe(tiers.length);
      expect(tiers.map((f) => f!.key).sort(), JSON.stringify(trouble)).toEqual(found.map((f) => f.key).sort());
      // The rows' counts are their tiers' sizes, and what the cause absorbed is a tap away in its health cell.
      if (s.labels.follows) expect(s.labels.follows).toMatch(new RegExp(`^${s.follows.length} `));
      if (s.labels.sameDay) expect(s.labels.sameDay).toMatch(new RegExp(`^${s.sameDay.length} `));
      if (s.labels.notes) expect(s.labels.notes).toMatch(new RegExp(`^${s.notes.length} `));
      for (const f of s.absorbed) expect(Object.values(CELL_KINDS).flat(), f.kind).toContain(f.kind);
    }
  });

  it('says the noun of the same day’s changes once, under the changes the cause explains', () => {
    const s = story({ [DAY]: { stopAt: 13, vendorShare: 0.5 } });
    if (s.follows.length && s.sameDay.length) expect(s.labels.sameDay).toMatch(/^\d+ more this day$/);
    const alone = story({ [DAY]: { more: 0.55 } });
    if (!alone.follows.length && alone.sameDay.length) expect(alone.labels.sameDay).toMatch(/^\d+ more changes? this day$/);
  });

  it('draws an episode’s days so far, the viewed day last and none after it', () => {
    const next = plusDays(DAY, 1);
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 }, [next]: { onlyVendor1: true, dropShare: 0.105 }, [plusDays(DAY, 2)]: { onlyVendor1: true, dropShare: 0.105 } }, next);
    expect(s.episode).toMatchObject({ days: 2, since: DAY });
    expect(s.episode!.trend.map((d) => d.day)).toEqual([DAY, next]);
    for (const d of s.episode!.trend) expect(d.trips / d.expected).toBeLessThan(0.5);
  });
});
