/**
 * A history from its base and its tail (ADR 0010 §6, B11): the periods appended from their own runs, folded onto the
 * base, tell each day's story as the same days built offline do; days the record leaves out of learning are allowed in
 * the flow's verdict, a viewer's still aren't (X8); and the checks' numbers are judged only from periods counted with
 * the rules in force.
 */
import { describe, expect, it } from 'vitest';
import { checksStart, HistoryRanges, seriesOf } from '../src/core/history.js';
import { flowStory } from '../src/core/hold.js';
import { appendPeriods } from '../src/core/measures.js';
import { historyWith } from './helpers/history.js';
import { headOf, measuresAt } from './helpers/periods.js';

const doc = { steps: [{ id: 'trips_valid', kind: 'expectations' as const, inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' as const }] }], ontology: { objectTypes: [], linkTypes: [], actionTypes: [], nouns: { trips: { one: 'trip', many: 'trips' } } } };
const TROUBLE = { '2024-01-11': { stopAt: 13 }, '2024-01-17': { vendorGone: true }, '2024-01-24': { vendorShare: 0.45 } };

describe('a base and its tail', () => {
  const full = (() => {
    const { weather: _w, ...f } = historyWith(TROUBLE);
    return f;
  })();
  const n = full.days.indexOf('2024-01-01');
  const base = headOf(full, n);
  const tail = full.days.slice(n).map((_, j) => measuresAt(full, n + j));

  it('cuts and folds back to the same numbers', () => {
    const again = appendPeriods(base, tail);
    expect(again.days).toEqual(full.days);
    expect(again.rows).toEqual(full.rows);
    expect(again.values.VendorID!.counts!.slice(n).map((r) => r.slice(0, 2))).toEqual(full.values.VendorID!.counts!.slice(n).map((r) => r.slice(0, 2)));
  });

  it('tells every tail day as the history built offline tells it', () => {
    const offline = new HistoryRanges(full);
    const folded = HistoryRanges.of({ base, tail });
    for (const day of full.days.slice(n)) {
      const a = flowStory(offline, day, doc, 'trips');
      const b = flowStory(folded, day, doc, 'trips');
      expect({ day, state: b.state, head: b.head }).toEqual({ day, state: a.state, head: a.head });
    }
    expect(flowStory(folded, '2024-01-11', doc, 'trips')).toMatchObject({ state: 'wrong', head: 'Trips fall to trickle from 13:00' });
  });

  it('tells a day after the base from the tail alone: none of it is in the base', () => {
    expect(base.days.includes('2024-01-17')).toBe(false);
    expect(flowStory(HistoryRanges.of({ base, tail: tail.slice(0, 17) }), '2024-01-17', doc, 'trips').head).toBe('Vendor 1 sent almost nothing');
  });
});

describe('days left out of learning', () => {
  // A Thursday at 80%: low, not far enough off to be left out as an outlier (that takes 1.5×).
  const file = historyWith({ '2024-01-11': { more: 0.8 } });
  const THU = '2024-01-18';

  it('allows the record\'s in the flow\'s verdict and names them, and still refuses a viewer\'s (X8)', () => {
    const h = new HistoryRanges(file, { recorded: new Set(['2024-01-11']) });
    expect(h.skipped).toBe(0);
    expect(h.recordedSkips).toEqual(['2024-01-11']);
    expect(() => flowStory(h, THU, doc, 'trips')).not.toThrow();
    expect(() => flowStory(new HistoryRanges(file, { skip: new Set(['2024-01-11']) }), THU, doc, 'trips')).toThrow("learns from every day");
  });

  it('learns the next Thursday\'s range without the day left out', () => {
    const learned = new HistoryRanges(file).of({ of: 'trips' })!.at(THU)!;
    const left = new HistoryRanges(file, { recorded: new Set(['2024-01-11']) }).of({ of: 'trips' })!.at(THU)!;
    // A low day learned from pulls the Thursdays' range down; left out, it doesn't.
    expect(left.expected).toBeGreaterThan(learned.expected);
  });
});

describe('the checks counted with other rules', () => {
  const file = (() => {
    const { weather: _w, ...f } = historyWith({});
    return f;
  })();
  const n = file.days.indexOf('2024-01-01');
  const base = headOf(file, n);
  const rules = [{ name: 'fare', check: 'fare_amount > 0', onFail: 'drop' }];
  const tail = file.days.slice(n).map((_, j) => ({ ...measuresAt(file, n + j), checks: { step: 'trips_valid', rules } }));

  it('starts a segment where the rules changed, and judges the checks only from it', () => {
    const h = appendPeriods(base, tail);
    expect(h.checks).toEqual([{ from: 0, step: 'trips_valid', rules: file.rules }, { from: n, step: 'trips_valid', rules }]);
    expect(h.rules).toEqual(rules);
    expect(checksStart(h)).toBe(n);
    expect(new HistoryRanges(h).checksFrom()).toBe('2024-01-01');
    const dropped = seriesOf(h, { of: 'dropped' })!;
    expect(dropped.values.slice(0, n).every((v) => v === null)).toBe(true);
    expect(dropped.values.at(-1)).not.toBeNull();
    // The rows and values aren't the checks': every period still counts.
    expect(seriesOf(h, { of: 'trips' })!.values.filter((v) => v === null)).toHaveLength(0);
    // The same rules again later don't make a new start.
    expect(checksStart(appendPeriods(appendPeriods(base, tail.slice(0, 5)), tail.slice(5)))).toBe(n);
    expect(checksStart(file)).toBe(0);
  });
});
