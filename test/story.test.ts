/**
 * A day's story (ADR 0008): the cause as a population or a time, the gate, what follows from it, and the words a screen
 * shows at a glance, on made-up days whose trouble is known.
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { HistoryRanges } from '../src/core/history.js';
import { newsOf } from '../src/core/news.js';
import { approx, compact, countLabel, glanceStrings, splitOf, splitSentence, storyOf, wordsIn, type Story, type StoryOptions } from '../src/core/story.js';
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
    expect(s.labels.hero).toEqual(['Vendor 1', expect.stringMatching(/^0 · usual ~[\d.]+k$/), 'Everything else', expect.stringMatching(/^[\d,]+ · usual ~[\d.]+k$/)]);
  });

  it('names a part that surged, as unusual, with OK this day as its verb', () => {
    const s = story({ [DAY]: { vendorSurge: 2.3 } });
    expect(s.split).toMatchObject({ kind: 'surged', name: 'Vendor 1' });
    expect(s.head).toMatch(/^Vendor 1 records 2\.\d× usual$/);
    expect(s.primary).toBe('expected');
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
    // Where the fall applies, in the head; that the trips go on, and what is missing, on the chart.
    expect(s.head).toMatch(/^Trips fall 9\d% from 13:00$/);
    expect(s.hours).toMatchObject({ from: 13, to: 23 });
    expect(s.hoursLabels).toMatchObject({ cut: '13:00', ghost: 'usual Wednesday' });
    expect(s.hoursLabels!.floor).toMatch(/^still ~[\d,]+\/h$/);
    expect(s.hoursLabels!.missing).toMatch(/^~[\d.]+k missing$/);
    expect(s.labels.hero.slice(0, 4)).toEqual([s.hoursLabels!.cut, s.hoursLabels!.floor, s.hoursLabels!.missing, s.hoursLabels!.ghost]);
    // The day's own change sits on the amount line, since the head's fall is the hours'.
    expect(s.labels.amount).toEqual([expect.stringMatching(/ trips$/), expect.stringMatching(/^−\d+%$/), expect.stringMatching(/^usual /)]);
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
  it('says which day of an episode it is, and since when', () => {
    const next = plusDays(DAY, 1);
    const s = story({ [DAY]: { stopAt: 13 }, [next]: { onlyVendor1: true } }, next);
    expect(s.episode).toMatchObject({ days: 2, since: DAY, hour: 13 });
    expect(s.chip).toBe('Day 2 · since Wed 13:00');
  });

  it('says a day after an episode is back to normal, names the episode, and says nothing is left to do', () => {
    const after = plusDays(DAY, 1);
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } }, after);
    expect(s.state).toBe('recovery');
    expect(s.head).toBe('Back to normal');
    expect(s.chip).toBe('after Wed · only Vendor 1');
    expect(s.recovery).toMatchObject({ from: DAY, to: DAY, held: [DAY], published: [] });
    expect(s.labels.after).toBe('Nothing to do · Wed held');
    expect(s.primary).toBeNull();
    // A day that went out short is said as published, not held.
    const short = story({ [DAY]: { stopAt: 13 } }, after);
    expect(short.chip).toBe('after Wed · trips fell');
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

  it('names the explained changes in words, not counted chips', () => {
    const s = story({ [DAY]: { onlyVendor1: true, dropShare: 0.105 } });
    expect(s.labels.follows).toMatch(/^\d+ changes? this explains$/);
    for (const k of s.labels.kinds) expect(k).toMatch(/^(shares|values gone|blanks|spreads|times|checks|new values|new pairs|other)$/);
    expect(s.labels.kinds.length).toBeLessThanOrEqual(3);
  });
});
