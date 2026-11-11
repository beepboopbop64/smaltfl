/**
 * The forest's evidence (src/core/combos.ts `forestEvidence`, ADR 0015 §6) on the sign-in log's history: given whether
 * or not the forest speaks, agreeing with what it tells (`unlikeNews`), and saying why where it can't run.
 */
import { describe, expect, it } from 'vitest';
import { forestEvidence, unlikeNews } from '../src/core/combos.js';
import { HistoryRanges } from '../src/core/history.js';
import { rangesFor } from '../src/core/hold.js';
import { flowNames, labelOf } from '../src/core/news.js';
import { PLANTED, securityDoc, securityHistory } from './fixtures/security.js';

const doc = securityDoc();
const h = new HistoryRanges(securityHistory(), { ...rangesFor(doc, 'auth') });
const names = flowNames(doc, 'auth');
const o = { names, label: labelOf(names), noun: (n?: number) => (n === 1 ? 'sign-in' : 'sign-ins') };

describe('the forest’s evidence', () => {
  it('speaks where the forest tells the day as unlike any before it, and not on a calm day', () => {
    for (const day of [PLANTED.burst, '2024-03-11', '2024-03-13']) {
      const e = forestEvidence(h, day, o);
      if ('why' in e) throw new Error(e.why);
      expect(e.speaks, day).toBe(unlikeNews(h, day, o).length > 0);
      expect(e.cut).toBe(Math.max(0.5, e.highest));
      expect(e.highest).toBe(Math.max(...e.learned.map((x) => x.score)));
      expect(e.top.length, day).toBeGreaterThan(0);
    }
    const burst = forestEvidence(h, PLANTED.burst, o);
    if ('why' in burst) throw new Error(burst.why);
    expect(burst.speaks).toBe(true);
    expect(burst.score).toBeGreaterThan(burst.cut);
    expect(burst.learned.every((x) => x.day < PLANTED.burst)).toBe(true);
    expect(burst.top[0]!.words).toMatch(/usually/);
  });

  it('says why where it can’t run: too few days, or a day not in the history', () => {
    expect(forestEvidence(h, h.file.days[20]!, o)).toMatchObject({ why: expect.stringMatching(/^too few days to learn from \(\d+ of 28\)$/) });
    expect(forestEvidence(h, '2030-01-01', o)).toEqual({ why: 'the day isn’t in the history' });
  });
});
