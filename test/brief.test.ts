/**
 * The brief (ADR 0012 §1, §2): a day's facts in SBAR order with the point on top, from the sign-in log's planted days
 * (test/fixtures/security.ts): the burst of Tue Mar 12, 2024 paused and then decided, and a calm Monday.
 */
import { describe, expect, it } from 'vitest';
import { briefBanned, briefOf, briefText, briefWords, situationOf, statusOf, type BriefIn } from '../src/core/brief.js';
import { HistoryRanges } from '../src/core/history.js';
import { rangesFor } from '../src/core/hold.js';
import { flowNames, judgeOf, newsOf } from '../src/core/news.js';
import { storyOf, wordsIn, type Story } from '../src/core/story.js';
import { PLANTED, securityDoc, securityHistory } from './fixtures/security.js';

const doc = securityDoc();
const names = flowNames(doc, 'auth');
const judge = judgeOf(doc, 'auth');
const h = new HistoryRanges(securityHistory(), { ...rangesFor(doc, 'auth') });
const story = (day: string): Story => storyOf(h, day, newsOf(h, day, names, { judge }), { names, judge, step: 'auth_valid', limit: 0.05 });
const noun = (n: number) => (n === 1 ? 'sign-in' : 'sign-ins');
const outputs: BriefIn['outputs'] = [
  { name: 'auth_valid', fate: 'waits' },
  { name: 'signins_by_hour', fate: 'waits' },
  { name: 'failures_by_country', fate: 'waits' },
];
const options: BriefIn['options'] = [
  { option: 'asis', label: 'Publish as is', line: 'readers get the day as it came, marked', off: null },
  { option: 'dont', label: 'Keep Mon 11', line: 'readers keep Monday until a corrected file arrives', off: null },
];
const base = (day: string, over: Partial<BriefIn> = {}): BriefIn => ({
  day, flow: 'Sign-ins', noun, story: story(day),
  pause: { state: 'waiting', readers: '2024-03-11', deciders: 'Owner', may: true },
  outputs, objects: [], readers: ['Sam'], file: { name: 'auth_2024-03-12.csv', rows: 184_000, check: 'same' }, options, picked: null,
  ...over,
});

describe('the brief of a paused day (ADR 0012 §1)', () => {
  const b = briefOf(base(PLANTED.burst));

  it('leads with the head, says the situation in one sentence under 25 words, and names what is at stake', () => {
    expect(b.title).toBe(story(PLANTED.burst).head);
    expect(b.status).toBe('investigating');
    expect(wordsIn(b.situation)).toBeLessThanOrEqual(25);
    expect(b.situation).toMatch(/^Tue Mar 12: /);
    expect(b.situation).toMatch(/3 of 3 outputs wait, readers see Mon 11\.$/);
    expect(b.edited).toBe(false);
  });

  it('keeps the order what, impact, cause, fix, within the glance budget and without the banned words', () => {
    expect(b.impact[0]).toBe('3 of 3 published datasets wait: auth_valid, signins_by_hour, failures_by_country (readers see Mon 11)');
    expect(b.impact).toContain('Read by Sam');
    expect(b.cause.facts.some((f) => /fail/i.test(f))).toBe(true);
    expect(b.cause.facts.at(-1)).toBe('The file auth_2024-03-12.csv matches the source’s list (184k rows)');
    expect(b.cause.theories).toEqual([]);
    // Something wrong: keep the last good day is proposed, not publishing as is.
    expect(b.fix.proposed).toBe('dont');
    expect(b.fix.why).toMatch(/^Something is wrong/);
    expect(briefWords(b)).toBeLessThanOrEqual(90);
    expect(briefBanned(b)).toEqual([]);
  });

  it('reads as SBAR when copied, with the decision asked of whoever decides', () => {
    const text = briefText(b, { flow: 'Sign-ins', pause: base(PLANTED.burst).pause });
    expect(text.split('\n')[0]).toBe(`${b.title} · investigating`);
    expect(text).toMatch(/\nSituation: Tue Mar 12: /);
    expect(text).toMatch(/\nImpact: 3 of 3 published datasets wait/);
    expect(text).toMatch(/\nRecommendation: Keep Mon 11 \(readers keep Monday until a corrected file arrives\)\. Something is wrong.*Decision by Owner\./);
    expect(text.trim().endsWith('From smaltfl, Sign-ins, Tue Mar 12.')).toBe(true);
  });

  it('takes a person\'s own sentence as the situation, and keeps the generated one to go back to', () => {
    const e = briefOf(base(PLANTED.burst, { edited: 'A credential-stuffing burst from one country; the day waits on Sam.' }));
    expect(e.edited).toBe(true);
    expect(e.situation).toBe('A credential-stuffing burst from one country; the day waits on Sam.');
    expect(e.generated).toBe(b.situation);
  });

  it('follows the decision: published as is is expected, kept back is not published, a fill is fixed', () => {
    const asis = briefOf(base(PLANTED.burst, { pause: { state: 'asis', readers: null, deciders: 'Owner', may: true }, outputs: outputs.map((o) => ({ ...o, fate: 'published' })), picked: 'asis' }));
    expect(asis.status).toBe('expected');
    expect(asis.situation).toMatch(/published as is\.$/);
    expect(asis.fix.picked).toBe('asis');
    expect(asis.fix.why).toBeNull();
    const dont = briefOf(base(PLANTED.burst, { pause: { state: 'dont', readers: '2024-03-11', deciders: 'Owner', may: true }, outputs: outputs.map((o) => ({ ...o, fate: 'kept' })), picked: 'dont' }));
    expect(dont.status).toBe('not published');
    expect(dont.situation).toMatch(/not published, readers keep Mon 11\.$/);
    expect(dont.impact[0]).toBe('Readers keep an earlier day of auth_valid, signins_by_hour, failures_by_country');
    const fill = briefOf(base(PLANTED.burst, { pause: { state: 'fill', readers: null, deciders: 'Owner', may: true, remedy: 'Filled from Tue 5' }, picked: 'fill' }));
    expect(fill.status).toBe('fixed');
    expect(fill.situation).toMatch(/readers get it filled from Tue 5\.$/);
  });
});

describe('a calm day and a flow that does not hold', () => {
  it('needs no action, says the day went out, and proposes nothing', () => {
    const b = briefOf(base('2024-03-11', { pause: null, outputs: outputs.map((o) => ({ ...o, fate: 'published' })), options: [] }));
    expect(b.status).toBe('no action');
    expect(statusOf({ pause: null, story: story('2024-03-11') })).toBe('no action');
    expect(b.impact).toEqual(['All 3 published datasets went out', 'Read by Sam']);
    expect(b.fix.proposed).toBeNull();
    expect(b.fix.why).toBe('Nothing to decide.');
    expect(briefBanned(b)).toEqual([]);
  });

  it('leaves a clause out when its value is missing, never writing a blank', () => {
    const s = situationOf({ day: '2024-03-11', story: null, pause: null, outputs: [], noun });
    expect(s).toBe('Mon Mar 11: published.');
    const paused = situationOf({ day: '2024-03-11', story: null, pause: { state: 'waiting', readers: null, deciders: 'Owner', may: true }, outputs: [{ name: 'a', fate: 'waits' }], noun });
    expect(paused).toBe('Mon Mar 11: 1 of 1 outputs wait.');
  });
});
