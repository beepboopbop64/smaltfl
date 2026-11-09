/**
 * The sign-in log at work (ADR 0010), a synthetic dataset every phase asserts on (test/fixtures/security.ts): its
 * planted incidents each told by their cause, with their verb and hold; a day with nothing to compare against published,
 * marked; every word on screen saying sign-ins; and with no incidents, no day held.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument } from '../src/core/document.js';
import { HistoryRanges, slotSeries } from '../src/core/history.js';
import { claimHolds, dayClaim, flowStory, rangesFor, type StoryClaim } from '../src/core/hold.js';
import { flowNames, judgeOf, newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { translate, type PlanPublish2 } from '../src/core/plan.js';
import { ACT_VERB, glanceStrings, storyOf, type Story } from '../src/core/story.js';
import { acceptable, levelMetrics } from '../src/core/fill.js';
import { edrHistory, isMonthEnd, isPatchTuesday, PLANTED, securityDoc, securityHistory, twoSourceDoc } from './fixtures/security.js';

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
const ranges = (incidents = true) => new HistoryRanges(securityHistory({ incidents }), { ...rangesFor(doc, 'auth') });
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
    expect(pub.watch[0]![1]).toMatchObject({ history: 'auth-history.json', time: 'event_time', scale: 'volume', donor: 'weekday', bad: [['result', 'fail', 'locked']], newValues: [['country', 'alert'], ['result', 'alert'], ['ua_family', 'alert']] });
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
      // The migration to passkeys, a deliberate change: it pauses the day passkey's share first crosses three times its
      // usual, once, and Accept the new level is offered there (the owner: "pause until accepted").
      [PLANTED.migrationHeld, 'Method passkey: 9.0% (usually 2.6–3.4%)'],
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

describe('a deliberate change: the migration from password to passkey (the owner: pause until accepted, Q-57b)', () => {
  it('holds once, the day it crosses, offers Accept there, and holds nothing after it once accepted', () => {
    const s = story(PLANTED.migrationHeld);
    expect(s).toMatchObject({ state: 'wrong' });
    expect(acceptable(s, { state: 'wrong' }, [{ by: 'story' }])).toBe(true);
    const days = h.file.days.filter((d) => d >= PLANTED.migration && d <= '2024-08-31');
    const held = (r: HistoryRanges) => days.filter((d) => claimHolds(doc.publish!.hold, dayClaim(r, doc, ref, d, 'auth', 'dev')!));
    expect(held(h)).toEqual([PLANTED.migrationHeld]);
    // Accepted on it: the column's mix is learned from that day, and the month it goes on moving holds nothing more.
    const accepted = new HistoryRanges(securityHistory(), { ...rangesFor(doc, 'auth'), levels: [{ from: PLANTED.migrationHeld, metrics: levelMetrics(s) }] });
    expect(held(accepted)).toEqual([PLANTED.migrationHeld]);
  }, 60_000);
});

describe('rare but serious values with no range, and an attack that also signs in (the owner: always alert)', () => {
  const stuffing = { n: 150_000, hours: [2, 3, 4], dist: { result: { fail: 0.97, locked: 0.03 }, method: { password: 1 }, country: { RU: 1 }, ua_family: { 'python-requests': 1 } } };
  const told = (file: ReturnType<typeof securityHistory>, day: string) => {
    const r = new HistoryRanges(file, { ...rangesFor(doc, 'auth') });
    return { s: storyOf(r, day, newsOf(r, day, names, { judge }), { names, judge, step: 'auth_valid', limit: 0.05 }), c: dayClaim(r, doc, ref, day, 'auth', 'dev')! };
  };

  it('holds a burst of failures on a holiday in the feed’s first year, by the failures, not as a day not judged yet', () => {
    for (const day of ['2023-07-04', '2023-05-29']) {
      const { s, c } = told(securityHistory({ extra: { [day]: [stuffing] } }), day);
      expect([s.state, s.primary, s.head]).toEqual(['wrong', 'incident', expect.stringMatching(/^Failed \d+(\.\d)?× usual$/)]);
      expect(s.findings.find((f) => f.key === 'share:result="fail"')).toMatchObject({ was: 'alert', bad: true });
      expect(claimHolds(doc.publish!.hold, c)).toBe(true);
    }
    // The same holiday with nothing planted is still not judged yet, and published (Q-53).
    expect(told(securityHistory(), '2023-07-04').s.state).toBe('unlearned');
  }, 60_000);

  it('tells an attack whose successes rose too by its failures, never as a shortfall with lockouts that held', () => {
    const day = '2024-04-17';
    const { s, c } = told(securityHistory({ extra: { [day]: [{ n: 400_000, hours: [...Array(24).keys()], dist: { result: { success: 0.3, fail: 0.7 }, method: { password: 1 }, country: { RU: 1 }, ua_family: { 'python-requests': 1 } } }] } }), day);
    expect([s.state, s.primary]).toEqual(['wrong', 'incident']);
    expect(s.head).toMatch(/^Failed \d+(\.\d)?× usual$/);
    expect(c.head).not.toMatch(/short/);
    expect(claimHolds(doc.publish!.hold, c)).toBe(true);
  }, 60_000);

  it('holds a client never seen before, however few sign-ins bring it (Q-56: country and tool)', () => {
    const day = '2024-04-17';
    const { s, c } = told(securityHistory({ extra: { [day]: [{ n: 300, hours: [3], dist: { result: { success: 1 }, method: { password: 1 }, country: { US: 1 }, ua_family: { sqlmap: 1 } } }] } }), day);
    expect(s.findings.find((f) => f.key === 'new:ua_family')).toMatchObject({ was: 'alert', acts: ['incident', 'quarantine', 'notify'] });
    expect(claimHolds(doc.publish!.hold, c)).toBe(true);
  }, 60_000);
});

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

describe('a step in rows that stays: a +60% step, accepted and not (phase 3, ADR 0010 §5)', () => {
  const STEP = '2024-02-06';
  const file = securityHistory({ incidents: false, step: { from: STEP, by: 1.6 } });
  const first23 = file.days.filter((d) => d >= STEP && d < '2024-02-29');
  // With re-learning on its own asked for (ADR 0010 §5): the step held a day, so it is never re-learned (X7).
  const relearning = { ...doc, publish: { ...doc.publish!, watch: { auth: { history: 'auth-history.json', time: 'event_time', relearn: true } } } };
  const heldWith = (levels: { from: string; metrics: string[] }[]) => {
    const r = new HistoryRanges(file, { ...rangesFor(relearning, 'auth'), levels });
    return first23.filter((d) => claimHolds(doc.publish!.hold, dayClaim(r, relearning, ref, d, 'auth', 'dev')!));
  };

  it('holds its first day only, once the new level is accepted on it', () => {
    expect(heldWith([{ from: STEP, metrics: ['trips'] }])).toEqual([STEP]);
  }, 60_000);

  it('holds nearly all of its first 23 days unaccepted, never re-learned on its own: it held a day (X7)', () => {
    expect(heldWith([]).length).toBeGreaterThanOrEqual(20);
    expect(rangesFor(relearning, 'auth').relearn).toBe(true);
    expect(new HistoryRanges(file, rangesFor(relearning, 'auth')).of({ of: 'trips' })!.relearned('2024-03-31')).toEqual([]);
  }, 60_000);
});

describe('variant E: endpoint events every 6 hours beside the sign-ins (phase 4, ADR 0010 §7)', () => {
  const two = twoSourceDoc();
  it('is a format-3 flow of two watched sources with their own cadences, edr\'s calendar off', async () => {
    expect(validateDocument(two)).toEqual([]);
    const pub = (await translate(two, { day: '2024-09-10', slot: '2024-09-10T06' })).publish as PlanPublish2;
    expect(pub.watch.map(([, w]) => [w.period, w.every, w.calendar])).toEqual([['day', 'day', true], ['slot', '6h', false]]);
    expect(pub.together).toBe(false);
  });

  it('moves the collector\'s outage to edr: the sign-ins of Sep 10 calm, its 06–12 slot alone wrong', () => {
    const e = new HistoryRanges(securityHistory({ edr: true }), { ...rangesFor(doc, 'auth') });
    const s = storyOf(e, PLANTED.outage, newsOf(e, PLANTED.outage, names, { judge }), { names, judge });
    expect(s.state).not.toBe('wrong');
    const file = edrHistory();
    const sub = slotSeries(file, `${PLANTED.outage}T06`);
    expect(flowStory(new HistoryRanges(sub, rangesFor(two, 'edr')), PLANTED.outage, two, 'edr')).toMatchObject({ state: 'wrong', head: 'Gap in endpoint events, 06:00–10:00', primary: 'incident' });
    // Its noun is edr's own.
    expect(flowNames(two, 'edr').noun?.(2)).toBe('endpoint events');
  });
});
