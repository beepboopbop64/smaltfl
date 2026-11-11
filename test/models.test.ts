/**
 * The two models on the sign-in log (ADR 0013 §3, ADR 0014 §5, ADR 0015 §6): the isolation forest, which asks whether a
 * day is unlike every day before it, and the classifier, which asks whether today's rows can be told from like days'.
 * The world is the app's (test/helpers/signins-world.ts): a year of generated days as the history and the kept sample,
 * then March 2024 a day at a time, with the demo's planted days (`SIGNIN_DEMO`, `DEMO_DAYS`). Each kind of trouble is
 * caught by its own check, each model speaks only on the day planted for it, and neither holds a day.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { forestEvidence } from '../src/core/combos.js';
import { claimHolds } from '../src/core/hold.js';
import { flowNames } from '../src/core/news.js';
import { DEMO_DAYS, PLANTED } from './fixtures/security.js';
import { signinsWorld, type SigninsWorld } from './helpers/signins-world.js';

let w: SigninsWorld;
beforeAll(async () => {
  w = await signinsWorld({ baseFrom: '2023-03-01', baseTo: '2024-02-29', loadsTo: '2024-03-21', scale: 0.03 });
}, 600_000);

const loud = (day: string) => (w.findings.get(day) ?? []).filter((f) => f.severity === 'alert' || f.severity === 'warn');
const PLANTED_DAYS: string[] = [PLANTED.burst, ...Object.values(DEMO_DAYS)];

describe('the models on the sign-in log, March 2024', () => {
  it('say nothing on a calm day: neither the forest nor the classifier speaks, and the day publishes', () => {
    const calm = [...w.findings.keys()].filter((d) => !PLANTED_DAYS.includes(d));
    expect(calm).toHaveLength(15);
    for (const day of calm) {
      expect(loud(day).map((f) => f.kind), day).toEqual([]);
      expect(w.claims.get(day)?.state, day).toMatch(/^(calm|notes)$/);
    }
  });

  it('the forest: every value nudged a little, each inside its range, and the day as a whole unlike any before it (Thu Mar 14)', () => {
    const day = DEMO_DAYS.forest;
    expect(loud(day).map((f) => `${f.kind}:${f.severity}`)).toEqual(['unlike:warn']);
    expect(loud(day)[0]!.title).toMatch(/^Unlike any day/);
    const e = forestEvidence(w.ranges.get(day)!, day, { names: flowNames(w.doc, 'auth'), label: (_c, k) => k });
    if ('why' in e) throw new Error(e.why);
    expect(e.speaks).toBe(true);
    expect(e.score).toBeGreaterThan(e.cut);
    expect(e.learned.length).toBeGreaterThan(300);
    expect(e.top.length).toBeGreaterThan(0);
    // A model warns: the day is unusual, and publishes.
    expect(w.claims.get(day)).toMatchObject({ state: 'unusual' });
    expect(claimHolds(w.doc.publish!.hold, w.claims.get(day)!)).toBe(false);
  });

  it('the classifier: a client release moves sign-ins to the phone’s app, which no count the history keeps sees (Tue Mar 19)', () => {
    const day = DEMO_DAYS.classifier;
    const f = loud(day);
    expect(f.map((x) => `${x.kind}:${x.severity}`)).toEqual(['apart:warn']);
    expect(f[0]!.apart!.auc).toBeGreaterThanOrEqual(0.85);
    expect(f[0]!.apart!.columns[0]!.column).toBe('ua_family');
    expect(w.claims.get(day)).toMatchObject({ state: 'unusual' });
    expect(claimHolds(w.doc.publish!.hold, w.claims.get(day)!)).toBe(false);
    // The forest reads the day's counts, which didn't move.
    const e = forestEvidence(w.ranges.get(day)!, day, { names: flowNames(w.doc, 'auth'), label: (_c, k) => k });
    expect('why' in e ? null : e.speaks).toBe(false);
  });

  it('leaves the loud days to the checks that name them: each holds by its own finding', () => {
    expect(w.claims.get(PLANTED.burst)).toMatchObject({ state: 'wrong' });
    expect(loud(DEMO_DAYS.missing).map((f) => f.kind)).toEqual(['volume']);
    expect(loud(DEMO_DAYS.shares)[0]).toMatchObject({ kind: 'share', severity: 'alert' });
    expect(loud(DEMO_DAYS.combo).map((f) => f.kind)).toContain('combo');
    for (const day of [PLANTED.burst, DEMO_DAYS.missing, DEMO_DAYS.shares, DEMO_DAYS.combo]) expect(claimHolds(w.doc.publish!.hold, w.claims.get(day)!), day).toBe(true);
  });

  it('counts the check step’s rules, the ontology’s among them, as one segment of the history', () => {
    expect(w.base.checks).toBeUndefined();
    expect(w.base.rules.map((r) => r.name)).toEqual(['known_result', 'in_day', 'has_user', 'method_one_of', 'latency_ms_range', 'country_required']);
    expect(w.base.rules[1]!.check).toBe('substr(event_time, 1, 10) = :day');
  });
});
