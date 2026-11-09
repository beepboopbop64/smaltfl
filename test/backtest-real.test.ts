/**
 * The backtests behind the taxi example's move to the general form (ADR 0010 §13), on the real history: each change
 * to how a day is judged, one at a time and together, with the days `wrong` and `short` hold over 2022-01-01 to
 * 2024-01-31 and the unusual days and notes. It prints each variant; it asserts only the vector the owner accepted
 * (Q-54: 25 days under wrong, the 22 under short) and the legacy form's 28. Re-learning on its own and floors that scale
 * come back as acceptances of their own: the first loses five real short days (Jan 5–9, 2022, an outage on top of the
 * Omicron dip it re-learned), so the example leaves it off.
 *
 * Seven passes over the history take about five minutes: it runs with `SMALTFL_REAL=all` and the app built from the
 * data branch (npm run build:app), and is skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FlowDocument } from '../src/core/document.js';
import { HistoryRanges, type HistoryFile, type RangeOptions } from '../src/core/history.js';
import { claimHolds, countedChecks, rangesFor } from '../src/core/hold.js';
import { flowNames, judgeOf, newsOf } from '../src/core/news.js';
import { storyOf, type Story } from '../src/core/story.js';
import { exampleDoc, exampleLegacy } from './helpers/example.js';

const DATA = new URL('../dist/app/data/', import.meta.url);
const has = existsSync(new URL('history.json', DATA)) && (JSON.parse(readFileSync(new URL('history.json', DATA), 'utf8')) as HistoryFile).days.length > 400;
const all = process.env.SMALTFL_REAL === 'all';

/** A day as the flow's verdict tells it, with ranges made as a variant says: what `flowStory` does, without refusing
 * ranges its document wouldn't make (each variant changes one setting the document doesn't say). */
function tell(h: HistoryRanges, day: string, doc: FlowDocument): { state: Story['state']; below: boolean } {
  const judge = judgeOf(doc, 'trips');
  const names = flowNames(doc, 'trips');
  const s = storyOf(h, day, newsOf(h, day, names, { checks: countedChecks(doc, h, 'trips'), judge }), { names, episode: false, judge });
  return { state: s.state, below: s.amount ? s.amount.value < s.amount.low : s.state === 'wrong' && s.hero === 'amount' && s.cause?.kind === 'volume' };
}

describe.skipIf(!has || !all)('the taxi example’s backtests (ADR 0010 §13; SMALTFL_REAL=all)', () => {
  const file = has ? (JSON.parse(readFileSync(new URL('history.json', DATA), 'utf8')) as HistoryFile) : null;
  const span = file ? file.days.filter((d) => d >= '2022-01-01' && d <= '2024-01-31') : [];
  const shipped = exampleDoc();
  const legacy = exampleLegacy();
  /** The legacy form with the shipped example's calendar: Election Day, judged as the legacy form judges. */
  const election: FlowDocument = { ...legacy, smaltfl: 3, calendar: shipped.calendar! };
  const watch = (w: Record<string, unknown>): FlowDocument => ({ ...shipped, publish: { ...shipped.publish!, watch: { trips: { ...(shipped.publish!.watch!.trips as object), ...w } as never } } });
  const run = (label: string, doc: FlowDocument, o: RangeOptions) => {
    const h = new HistoryRanges(file!, o);
    const days = span.map((d) => ({ d, c: tell(h, d, doc) }));
    const wrong = days.filter((x) => claimHolds(['checks', 'wrong'], x.c)).map((x) => x.d);
    const short = days.filter((x) => claimHolds(['checks', 'short'], x.c)).map((x) => x.d);
    const count = (s: Story['state']) => days.filter((x) => x.c.state === s).length;
    console.log(`${label}: wrong ${wrong.length}, short ${short.length}, unusual ${count('unusual')}, notes ${count('notes')}, not judged ${count('unlearned')}`);
    return { wrong, short };
  };

  it('prints each variant, and holds the 25 days the owner accepted (Q-54) where the legacy form holds 28', () => {
    const base = run('legacy form (us-nyc/1)', legacy, {});
    const e = run('Election Day as a calendar day', election, rangesFor(election, 'trips'));
    const echoes = run('shares far from their weeks not learned from (0.6 on the logit)', legacy, { echoes: true });
    const both = run('both, the legacy form otherwise', election, { ...rangesFor(election, 'trips'), echoes: true });
    const accepted = run('the example as it ships (general form: both, the relative rule, fixed floors)', shipped, rangesFor(shipped, 'trips'));
    const relearn = run('and re-learning on its own after 14 days', watch({ relearn: true }), rangesFor(watch({ relearn: true }), 'trips'));
    const volume = run('and floors that scale with volume', watch({ scale: 'volume' }), rangesFor(watch({ scale: 'volume' }), 'trips'));
    const gone = (a: string[], b: string[]) => a.filter((d) => !b.includes(d));
    expect(base.wrong).toHaveLength(28);
    expect(gone(base.wrong, e.wrong)).toEqual(['2022-11-08', '2023-11-07']);
    expect(gone(e.wrong, base.wrong)).toEqual(['2022-12-31']);
    expect(gone(base.wrong, echoes.wrong)).toEqual(['2023-11-14']);
    expect(gone(base.wrong, both.wrong)).toEqual(['2022-11-08', '2023-11-07', '2023-11-14']);
    expect(gone(both.wrong, base.wrong)).toEqual([]);
    expect(accepted).toEqual(both);
    expect([accepted.wrong.length, accepted.short.length]).toEqual([25, 22]);
    // Re-learning on its own takes Jan 5–9, 2022 out: the outage on top of the dip it re-learned. Not accepted.
    expect(gone(accepted.short, relearn.short)).toEqual(['2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09']);
    void volume;
  }, 900_000);
});
