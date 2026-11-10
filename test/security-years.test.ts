/**
 * The sign-in log over 2023 and 2024 with no incidents (test/fixtures/security.ts, ADR 0010): no day held, and a flow's
 * own recurring days told as its calendar names them. Apart from test/security.test.ts so the two run side by side:
 * each judges every day of two years.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../src/core/document.js';
import { HistoryRanges } from '../src/core/history.js';
import { claimHolds, dayClaim, rangesFor, type StoryClaim } from '../src/core/hold.js';
import { judgeOf, newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { storyOf } from '../src/core/story.js';
import { isMonthEnd, isPatchTuesday, securityDoc, securityHistory } from './fixtures/security.js';

const doc = securityDoc();
const ref = { path: 'auth-history.json', sha256: '0'.repeat(64), bytes: 0 };
const prop = (c: string) => propertyOf(doc.ontology, 'auth', c);
/** The names a person reads the flow in: each column's title, each code's meaning, and the ontology's noun. */
const names: Names = {
  column: (c) => prop(c)?.title ?? c,
  value: (c, v) => {
    const m = meaningOf(prop(c), v);
    return m ? `${String(v)} (${m})` : String(v);
  },
  label: (c, v) => meaningOf(prop(c), v) ?? String(v),
  noun: (n) => (n === 1 ? 'sign-in' : 'sign-ins'),
};
const ranges = (incidents = true) => new HistoryRanges(securityHistory({ incidents }), { ...rangesFor(doc, 'auth') });
const claimsOf = (r: HistoryRanges): StoryClaim[] => r.file.days.filter((d) => d >= '2023-01-01').map((d) => dayClaim(r, doc, ref, d, 'auth', 'dev')!);

describe('the same log with no incidents (variant C)', () => {
  it('holds no day, and finds at most 15 unusual, 2023 to 2024', () => {
    const claims = claimsOf(ranges(false));
    expect(claims.filter((c) => claimHolds(doc.publish!.hold, c))).toEqual([]);
    expect(claims.filter((c) => c.state === 'unusual').length).toBeLessThanOrEqual(15);
  }, 120_000);
});

describe('a flow’s own recurring days (variant M, phase 3, ADR 0010 §2)', () => {
  // A month-end batch at 1.6× and Patch Tuesday at +30%, with no incidents, so only the batches can be off.
  const file = securityHistory({ incidents: false, monthEnd: 1.6, patchTuesday: 1.3 });
  const withDays = { ...doc, calendar: { base: 'us' as const, days: [{ name: 'Month-end', day: -1 }, { name: 'Patch Tuesday', weekday: 'tue' as const, between: [8, 14] as [number, number] }] } };
  // Each day told by the flow's own verdict, under the calendar the document gives.
  const claimsFor = (d: typeof doc) => {
    const r = new HistoryRanges(file, { ...rangesFor(d, 'auth') });
    return r.file.days.filter((x) => x >= '2023-01-01').map((x) => dayClaim(r, d, ref, x, 'auth', 'dev')!);
  };

  it('holds no month-end and no Patch Tuesday when the calendar names them, and says so on the day', () => {
    expect(validateDocument(withDays)).toEqual([]);
    const claims = claimsFor(withDays);
    expect(claims.filter((c) => claimHolds(withDays.publish!.hold, c)).map((c) => c.day)).toEqual([]);
    const r = new HistoryRanges(file, { ...rangesFor(withDays, 'auth') });
    const s = storyOf(r, '2024-05-14', newsOf(r, '2024-05-14', names, { judge: judgeOf(withDays, 'auth') }), { names, judge: judgeOf(withDays, 'auth') });
    expect(s.head).toBe('Normal for Patch Tuesday');
  }, 120_000);

  it('holds nearly every month-end without them: the rule matters', () => {
    const held = claimsFor(doc).filter((c) => claimHolds(doc.publish!.hold, c)).map((c) => c.day);
    // Of the 24 month-ends of 2023–24, and nothing but the batches.
    expect(held.filter(isMonthEnd).length).toBeGreaterThanOrEqual(20);
    expect(held.every((d) => isMonthEnd(d) || isPatchTuesday(d))).toBe(true);
  }, 120_000);
});
