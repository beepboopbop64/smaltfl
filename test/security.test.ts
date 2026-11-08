/**
 * The sign-in log at work (ADR 0010), a synthetic dataset every phase asserts on (test/fixtures/security.ts): its
 * planted incidents each told by their cause, with their verb and hold; a day with nothing to compare against published,
 * marked; every word on screen saying sign-ins; and with no incidents, no day held.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../src/core/document.js';
import { HistoryRanges } from '../src/core/history.js';
import { calendarFor, claimHolds, dayClaim, type StoryClaim } from '../src/core/hold.js';
import { judgeOf, newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { translate, type PlanPublish2 } from '../src/core/plan.js';
import { ACT_VERB, glanceStrings, storyOf, type Story } from '../src/core/story.js';
import { PLANTED, securityDoc, securityHistory } from './fixtures/security.js';

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
const judge = judgeOf(doc, 'auth');
const ranges = (incidents = true) => new HistoryRanges(securityHistory({ incidents }), { calendar: calendarFor(doc, 'auth') });
const h = ranges();
const story = (day: string): Story => storyOf(h, day, newsOf(h, day, names, { judge }), { names, judge, step: 'auth_valid', limit: 0.05 });
const claimsOf = (r: HistoryRanges): StoryClaim[] => r.file.days.filter((d) => d >= '2023-01-01').map((d) => dayClaim(r, doc, ref, d, 'auth', 'dev')!);

describe('the sign-in flow (ADR 0010 §10)', () => {
  it('is a format-3 document whose plan judges its source as it says, its bad codes and serious columns marked', async () => {
    expect(validateDocument(doc)).toEqual([]);
    const plan = await translate(doc, { day: '2024-03-12' });
    expect(plan.smaltflPlan).toBe(2);
    const pub = plan.publish as PlanPublish2;
    expect(pub.calendar.base).toBe('us/1');
    expect(pub.watch[0]![1]).toMatchObject({ history: 'auth-history.json', time: 'event_time', scale: 'volume', donor: 'weekday', bad: [['result', 'fail', 'locked']], newValues: [['country', 'alert'], ['result', 'alert']] });
    expect(judge).toMatchObject({ legacy: false, scale: 'volume', calendar: { base: 'us/1' } });
  });
});

describe('the planted incidents, as the flow judges them (phase 1)', () => {
  it('holds exactly the planted days that are something wrong, 2023 to 2024', () => {
    const held = claimsOf(h).filter((c) => claimHolds(doc.publish!.hold, c));
    expect(held.map((c) => [c.day, c.head])).toEqual([
      [PLANTED.burst, 'result fail 15× usual'],
      [PLANTED.mfa[0], 'method mfa_push almost gone'],
      [PLANTED.mfa[1], 'method mfa_push almost gone'],
      [PLANTED.outage, 'Gap in sign-ins, 06:00–12:00'],
      [PLANTED.hydra, 'result fail 4.7× usual'],
    ]);
  }, 120_000);

  it('tells credential stuffing by its failed sign-ins, a value marked bad, with an incident as its verb', () => {
    const s = story(PLANTED.burst);
    expect(s).toMatchObject({ state: 'wrong', head: 'Failed 15× usual', primary: 'incident' });
    expect(s.labels.primary).toBe(ACT_VERB.incident);
    // Lockouts at 2% are something wrong, not a note; and nothing marked bad offers to mark it as expected.
    expect(s.findings.find((f) => f.key === 'share:result="locked"')).toMatchObject({ was: 'alert', bad: true });
    expect(s.findings.filter((f) => f.bad).flatMap((f) => f.acts)).not.toContain('expected');
  });

  it('tells MFA push dropped by a logging agent as a part almost gone, and its second day with its running total', () => {
    expect(story(PLANTED.mfa[0])).toMatchObject({ state: 'wrong', head: 'MFA push records almost gone', primary: 'notify' });
    const second = story(PLANTED.mfa[1]);
    expect(second.head).toBe('MFA push records almost gone');
    expect(second.chip).toMatch(/^Day 2 · ~[\d.]+k short$/);
  });

  it('tells the collector’s outage by its hours, and the second burst by its failures', () => {
    expect(story(PLANTED.outage)).toMatchObject({ state: 'wrong', head: 'Gap in sign-ins, 06:00–12:00', primary: 'incident' });
    expect(story(PLANTED.hydra)).toMatchObject({ state: 'wrong', head: 'Failed 4.7× usual', primary: 'incident' });
  });

  it('publishes a holiday in the feed’s first year, marked not judged yet, never calm (Q-53)', () => {
    const s = story(PLANTED.firstHoliday);
    expect(s).toMatchObject({ state: 'unlearned', head: 'Not judged yet', chip: 'First Christmas Day here', primary: null });
    const c = dayClaim(h, doc, ref, PLANTED.firstHoliday, 'auth', 'dev')!;
    expect(c.state).toBe('unlearned');
    expect(claimHolds(doc.publish!.hold, c)).toBe(false);
  });

  it('says sign-ins in every word at a glance, never trips', () => {
    for (const day of [PLANTED.burst, ...PLANTED.mfa, PLANTED.outage, PLANTED.hydra, PLANTED.firstHoliday, '2024-02-07']) {
      const s = story(day);
      expect(glanceStrings(s).filter((x) => /trip/i.test(x)), `${day}: ${s.head}`).toEqual([]);
      if (s.labels.amount[0]) expect(s.labels.amount[0]).toMatch(/ sign-ins$/);
    }
  });
});

describe('the same log with no incidents (variant C)', () => {
  it('holds no day, and finds at most 15 unusual, 2023 to 2024', () => {
    const claims = claimsOf(ranges(false));
    expect(claims.filter((c) => claimHolds(doc.publish!.hold, c))).toEqual([]);
    expect(claims.filter((c) => c.state === 'unusual').length).toBeLessThanOrEqual(15);
  }, 120_000);
});
