/**
 * The story on the real history (ADR 0008): the heads the incident days and the calm days should get. Runs when the
 * app has been built from the data branch (npm run build:app writes dist/app/data/history.json); skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { glanceStrings, splitSentence, storyOf, wordsIn } from '../src/core/story.js';

const HISTORY = new URL('../dist/app/data/history.json', import.meta.url);
const has = existsSync(HISTORY) && (JSON.parse(readFileSync(HISTORY, 'utf8')) as HistoryFile).days.length > 400;

describe.skipIf(!has)('the story on the real history', () => {
  const file = has ? (JSON.parse(readFileSync(HISTORY, 'utf8')) as HistoryFile) : null;
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8'));
  const prop = (c: string) => propertyOf(doc.ontology, 'trips', c);
  const names: Names = {
    column: (c) => prop(c)?.title ?? c,
    value: (c, v) => {
      const m = meaningOf(prop(c), v);
      return m ? `${String(v)} (${m})` : String(v);
    },
    label: (c, v) => meaningOf(prop(c), v) ?? String(v),
  };
  const h = file ? new HistoryRanges(file) : null;
  const story = (day: string) => storyOf(h!, day, newsOf(h!, day, names), { names, step: 'trips_valid', limit: 0.1 });

  it('tells Thu Sep 21, 2023 as the hour the trips fall', () => {
    const s = story('2023-09-21');
    expect(s.head).toBe('Trips fall 95% from 13:00');
    expect(s.split).toMatchObject({ kind: 'held', name: 'Flex Fare' });
    // The trips go on after the fall (~330 an hour), the missing trips are counted, and the day's own change is on
    // the amount line; the detail's sentence says the others fell from 13:00, never that they almost stopped.
    expect(s.hoursLabels).toEqual({ cut: '13:00', floor: 'still ~330/h', missing: '~77k missing', ghost: 'usual Thursday' });
    expect(s.labels.amount).toEqual(['41,939 trips', '−65%', 'usual 89k–160k']);
    expect(splitSentence(s)).toBe('Flex Fare as usual (4,657; usual 2.8k–5.4k); everything else fell from 13:00 (37,282; usual ~115k).');
  });

  it('says each split day’s sentence from its own figures', () => {
    expect(splitSentence(story('2023-09-22'))).toBe('Flex Fare as usual (4,613; usual 2.6k–5.5k); everything else almost stopped (20; usual ~110k).');
    // Inside its range but 44% above the usual count: not "as usual".
    expect(splitSentence(story('2022-09-18'))).toBe('Flex Fare within its usual range (4,169; usual 1.6k–4.8k); everything else almost stopped (60; usual ~85k).');
    expect(splitSentence(story('2022-09-17'))).toMatch(/^Flex Fare within its usual range \(4,878; .*everything else fell from 15:00 \(54,623; /);
    expect(splitSentence(story('2022-11-19'))).toMatch(/^Vendor 1 almost stopped \(82; usual .*\); everything else as usual \(94,850; usual ~97.2k\)\.$/);
    expect(splitSentence(story('2024-01-01'))).toBe('Flex Fare 2.3× usual (10,518; usual ~4.5k); everything else as usual (70,495; usual ~68.5k).');
  });

  it('heads Mon Sep 18, 2023 with the population, not its symptom, and folds the symptom under it', () => {
    const s = story('2023-09-18');
    expect(s.head).toBe('More Flex Fare trips: 5.3%');
    // Its usual range is on the visual, labelled: the share against 2.1–4.6%.
    expect(s.labels.hero).toEqual(['Flex Fare', '5.3%', 'usually 2.1–4.6%']);
    expect(s.state).toBe('unusual');
    expect(s.split).toMatchObject({ via: 'blanks', name: 'Flex Fare', kind: 'surged' });
    // Stored and forwarded N's drop is the same trips going blank: it follows, told as a note.
    expect(s.findings.find((f) => f.key === 'share:store_and_fwd_flag="N"')).toMatchObject({ tier: 'follows', severity: 'note', was: 'warn' });
    expect(s.stories).toEqual([]);
    expect(wordsIn(s.head)).toBeLessThanOrEqual(6);
  });

  it('counts together findings’ trips with the sign of their trips, not of their share', () => {
    // New Year's Day 2024: more trips than usual, credit cards a smaller share of them. No "N trips fewer".
    for (const day of ['2024-01-01', '2023-09-22']) {
      for (const f of story(day).findings) {
        expect(f.title, f.title).not.toMatch(/move together|trips (fewer|more)$/);
        expect(f.detail, f.detail).not.toMatch(/trips (fewer|more) than a day like it/);
      }
    }
    const cards = story('2024-01-01').findings.find((f) => f.key === 'together:share:RatecodeID=1,share:payment_type=1')!;
    expect(cards.title).toBe('Rate code Standard rate: 80% (usually 82–90%)');
  });

  it('tells the weeks after Labor Day 2022 as a lasting rise, not as news every day (no last year to learn them from)', () => {
    // Wed Sep 7 to Sat Sep 10 are unusual; from Sun Sep 11 most of the week before was above its own range too.
    expect(story('2022-09-07').state).toBe('unusual');
    for (const day of ['2022-09-14', '2022-09-15', '2022-09-16']) {
      const s = story(day);
      expect(s.state, day).toBe('notes');
      expect(s.head, day).toBe('Busier than usual for days');
      expect(s.findings.find((f) => f.kind === 'volume'), day).toMatchObject({ severity: 'note', lasting: '2022-09-07' });
      // The amount line still says how far: +15% and more, outside its range.
      expect(s.labels.amount[1], day).toMatch(/^\+1\d%$/);
    }
    // The incident after them is told as before.
    expect(story('2022-09-17').head).toBe('Trips fall 96% from 15:00');
  });

  it('names the episode a calm day comes after, and says nothing is left to do', () => {
    const s = story('2023-09-25');
    expect(s.chip).toBe('after Thu–Sun · only Flex Fare');
    expect(s.labels.after).toBe('Nothing to do · Thu published short, Fri–Sun held');
    expect(s.recovery).toMatchObject({ held: ['2023-09-22', '2023-09-23', '2023-09-24'], published: ['2023-09-21'] });
  });

  it('tells Fri Sep 22, 2023 as the Flex Fare trips alone arriving, the run held with fewer rows dropped than usual', () => {
    const s = story('2023-09-22');
    expect(s.head).toBe('Only Flex Fare records arrived');
    expect(s.chip).toBe('Day 2 · since Thu 13:00');
    expect(s.split!.part.today).toBe(4613);
    expect(s.split!.rest.today).toBe(20);
    expect(s.gate).toMatchObject({ held: true, dropped: 2116 });
    expect(s.gate!.dropped).toBeLessThan(s.gate!.usual!.low);
    expect(s.stories).toEqual([]);
    expect(s.follows.length + s.sameDay.length + s.absorbed.length).toBeGreaterThanOrEqual(25);
    expect(glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(60);
  });

  it('tells Nov 14 and 15, 2022 as vendor 1 sending almost nothing, the second as day 2', () => {
    expect(story('2022-11-14').head).toBe('Vendor 1 sent almost nothing');
    const s = story('2022-11-15');
    expect(s.head).toBe('Vendor 1 sent almost nothing');
    expect(s.chip).toBe('Day 2 · since Mon');
    expect(s.split!.part.today).toBe(3);
  });

  it('tells New Year’s Day 2024 as a Flex Fare surge, unusual and nothing more', () => {
    const s = story('2024-01-01');
    expect(s.head).toBe('Flex Fare records 2.3× usual');
    expect(s.state).toBe('unusual');
  });

  it('prints every number on a label as the value it shows: rounded, or within 5% after a ~', () => {
    // Each number in a label, in order, against the value it claims to show.
    const said = (label: string, ...values: number[]) => {
      const text = label.replace(/,/g, '');
      [...text.matchAll(/(\d+(?:\.\d+)?)(k?)/g)].forEach((m, i) => {
        const v = values[i];
        if (v === undefined) return;
        const dec = (m[1]!.split('.')[1] ?? '').length;
        const unit = 10 ** -dec * (m[2] ? 1000 : 1);
        const shown = Number(m[1]) * (m[2] ? 1000 : 1);
        const loose = /~$/.test(text.slice(0, m.index));
        expect(Math.abs(shown - v), `${label}: ${shown} for ${v}`).toBeLessThanOrEqual(Math.max(unit / 2, loose ? 0.05 * v : 0) + 1e-9);
      });
    };
    for (const day of ['2023-09-22', '2022-11-15', '2024-01-01', '2023-09-21']) {
      const s = story(day);
      const [part, partNum, , restNum] = s.split ? s.labels.hero : [];
      if (s.split && s.hero === 'split') {
        expect(part).toBe(s.split.name);
        said(partNum!, s.split.part.today, s.split.part.usual);
        said(restNum!, s.split.rest.today, s.split.rest.usual);
      }
      said(s.labels.amount[0]!, s.amount!.value);
      said(s.labels.amount.at(-1)!, s.amount!.low, s.amount!.high);
      // The day's change, when the amount line carries it: against the guess, rounded.
      const change = s.labels.amount.find((l) => /^[+−]\d+%$/.test(l));
      if (change) said(change, Math.abs(s.amount!.value / s.amount!.expected - 1) * 100);
      if (s.hoursLabels && s.hours) {
        const { got, usual, from, to } = s.hours;
        const had = got.slice(from, to + 1).reduce((a, b) => a + b, 0);
        said(s.hoursLabels.floor, had / (to - from + 1));
        said(s.hoursLabels.missing, usual.slice(from, to + 1).reduce((a, b) => a + b, 0) - had);
      }
      if (s.gate?.held) {
        const at = s.labels.hero.indexOf('Checks held');
        said(s.labels.hero[at + 1]!, s.gate.share * 100);
        said(s.labels.hero[at + 3]!, s.gate.dropped);
        said(s.labels.hero[at + 4]!, s.gate.usual!.low, s.gate.usual!.high);
      }
    }
  });

  it('draws count bands only where they hold: 90% of ordinary days inside, for the counts the visuals draw', async () => {
    const { isSpecial } = await import('../src/core/calendar.js');
    for (const m of [{ of: 'count', column: 'payment_type', value: '0' }, { of: 'count', column: 'VendorID', value: '1' }, { of: 'droppedRows' }, { of: 'ruleRows', name: 'distance' }] as const) {
      const r = h!.of(m)!;
      let n = 0;
      let inside = 0;
      for (const day of file!.days) {
        if (day < '2023-01-01' || isSpecial(day)) continue;
        const at = r.at(day);
        const v = r.value(day);
        if (!at || v === null) continue;
        n++;
        if (r.place(at, v) === 'within') inside++;
      }
      expect(inside / n, JSON.stringify(m)).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('tells calm days and the day after an episode calmly', () => {
    expect(story('2024-01-15')).toMatchObject({ state: 'calm', head: 'Normal for MLK Day' });
    expect(story('2023-09-25')).toMatchObject({ state: 'recovery', head: 'Back to normal', chip: 'after Thu–Sun · only Flex Fare' });
  });
});
