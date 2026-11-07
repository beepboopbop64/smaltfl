/**
 * The story on the real history (ADR 0008): the heads the incident days and the calm days should get. Runs when the
 * app has been built from the data branch (npm run build:app writes dist/app/data/history.json); skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { glanceStrings, storyOf, wordsIn } from '../src/core/story.js';

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
    expect(s.head).toBe('Trips fall 95% at 13:00');
    expect(s.split).toMatchObject({ kind: 'held', name: 'Flex Fare' });
  });

  it('tells Fri Sep 22, 2023 as the Flex Fare trips alone arriving, the run held with fewer rows dropped than usual', () => {
    const s = story('2023-09-22');
    expect(s.head).toBe('Only Flex Fare trips arrived');
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
    expect(s.head).toBe('Flex Fare trips 2.3× usual');
    expect(s.state).toBe('unusual');
  });

  it('tells calm days and the day after an episode calmly', () => {
    expect(story('2024-01-15')).toMatchObject({ state: 'calm', head: 'Normal for MLK Day' });
    expect(story('2023-09-25')).toMatchObject({ state: 'recovery', head: 'Back to normal', chip: 'after Thu–Sun' });
  });
});
