/**
 * Integration tests across the fills and any dataset (docs: the parallel plan's §9) that no other file covers, on the
 * sign-in log every phase asserts on (test/fixtures/security.ts):
 *
 * - I8: a day held by a value marked bad is never offered "Mark as expected", nor Accept the new level; a fill is
 *   offered only on a short day with a missing part.
 * - I9: the fills' sheet says the source's noun: within 45 words with "sign-ins" and with "endpoint events", and no word
 *   of it says trips.
 */
import { describe, expect, it } from 'vitest';
import { decisionDrawing, sheetText, sheetWords } from '../src/core/decision.js';
import { acceptable, donorChoices, fillCounts, missingOf, offersOf } from '../src/core/fill.js';
import { HistoryRanges } from '../src/core/history.js';
import { dayClaim, flowStory, rangesFor, type HistoryRef } from '../src/core/hold.js';
import { plusDays } from '../src/core/calendar.js';
import { glanceStrings } from '../src/core/story.js';
import { PLANTED, securityDoc, securityHistory } from './fixtures/security.js';

const doc = securityDoc();
const h = new HistoryRanges(securityHistory(), rangesFor(doc, 'auth'));
const ref: HistoryRef = { path: 'auth-history.json', sha256: '0'.repeat(64), bytes: 0 };
const listed = (d: string) => ({ path: d, sha256: '0'.repeat(64), bytes: 0 });
const rows = (d: string) => h.file.rows[h.file.days.indexOf(d)]!;
const TIME = 'event_time';

/** A held day as the sheet would offer it: the flow's story, its claim, the donors and the remedies. */
function held(day: string) {
  const s = flowStory(h, day, doc, 'auth');
  const claim = dayClaim(h, doc, ref, day, 'auth', 'dev')!;
  const { picks } = donorChoices({ h, doc, day, source: 'auth', listed, history: ref, build: 'dev' }, 'weekday');
  const offers = offersOf({ story: s, claim, fill: { time: TIME }, donors: picks, told: s, holds: [{ by: 'story' }] });
  return { s, claim, picks, offers };
}

describe('a day held by a value marked bad (I8, C9, X6)', () => {
  it('offers no fill, no Accept and no "Mark as expected" on the credential stuffing and the second burst', () => {
    for (const day of [PLANTED.burst, PLANTED.hydra]) {
      const { s, claim, offers } = held(day);
      expect(claim).toMatchObject({ state: 'wrong', below: false });
      expect(offers, day).toEqual([]);
      expect(acceptable(s, claim, [{ by: 'story' }]), day).toBe(false);
      expect(s.findings.filter((f) => f.bad).flatMap((f) => f.acts), day).not.toContain('expected');
      expect(glanceStrings(s).join(' '), day).not.toMatch(/Mark as expected/);
    }
  });

  it('offers a fill only on a short day with a missing part: the collector\'s outage, and MFA push dropped', () => {
    const outage = held(PLANTED.outage);
    expect(outage.claim).toMatchObject({ state: 'wrong', below: true });
    expect(missingOf(outage.s, TIME)).toEqual({ time: TIME, hours: [6, 11] });
    expect(outage.offers.map((o) => o.option)).toEqual(['fill', 'complete']);
    const mfa = held(PLANTED.mfa[0]);
    expect(missingOf(mfa.s, TIME)).toEqual({ column: 'method', value: 'mfa_push' });
    expect(mfa.offers.map((o) => o.option).slice(0, 2)).toEqual(['fill', 'complete']);
  });
});

describe('the fills\' sheet in the source\'s noun (I9, C3, Q-78)', () => {
  it('says sign-ins, or endpoint events, within 45 words on every pick, and never trips', () => {
    for (const day of [PLANTED.outage, PLANTED.mfa[0]]) {
      const { s, picks, offers } = held(day);
      const missing = missingOf(s, TIME)!;
      const before = plusDays(day, -1);
      const draw = decisionDrawing(h, s, day, before, { day: rows(day), readers: rows(before) }, { missing, donors: picks.map((p) => p.day) });
      const donors = picks.flatMap((p) => {
        const c = fillCounts(h, day, missing, p.day);
        return c ? [{ day: p.day, counts: c }] : [];
      });
      expect(donors.length, day).toBeGreaterThan(0);
      for (const noun of [{ one: 'sign-in', many: 'sign-ins' }, { one: 'endpoint event', many: 'endpoint events' }]) {
        for (const staged of [null, { option: 'fill' as const, donor: picks[0]!.day, fails: false }]) {
          const t = sheetText({
            day, waited: 30, otherBuild: false, outputs: 1, rows: rows(day), reach: rows(day) - h.file.dropped[h.file.days.indexOf(day)]!, readers: { day: before, rows: rows(before) }, later: null, checks: null,
            part: draw.part, missing: draw.cause === 'hours' ? s.hoursLabels?.missing ?? null : null, cut: draw.cut?.[1] ?? null, ticks: draw.ticks.map(([, x]) => x), unjudged: false, hash: 'a'.repeat(64), may: true, deciders: 'Owner', head: s.head, noun,
            offers, donors, partOnly: fillCounts(h, day, missing, null), staged, withdraws: null,
          });
          const text = JSON.stringify(t);
          expect(sheetWords(t), `${day} ${noun.many}: ${text}`).toBeLessThanOrEqual(45);
          expect(text, day).not.toMatch(/trip/i);
          expect(text, day).toContain(noun.many);
        }
      }
    }
  });
});
