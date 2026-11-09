/**
 * The brief on the real history (ADR 0012 §1, the two-minute test's days): the words the app says of the taxi days
 * leadership was asked about, from the history alone. Skipped without the built data (dist/app/data/history.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { briefBanned, briefOf, briefWords, type BriefIn } from '../src/core/brief.js';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { newsOf, type Names } from '../src/core/news.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { storyOf, wordsIn } from '../src/core/story.js';

const HISTORY = new URL('../dist/app/data/history.json', import.meta.url);
const has = existsSync(HISTORY) && (JSON.parse(readFileSync(HISTORY, 'utf8')) as HistoryFile).days.length > 400;

describe.skipIf(!has)('the brief on the real history', () => {
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
    noun: (n) => (n === 1 ? 'trip' : 'trips'),
  };
  const h = file ? new HistoryRanges(file) : null;
  const story = (day: string) => storyOf(h!, day, newsOf(h!, day, names), { names, step: 'trips_valid', limit: 0.1 });
  const outputs: BriefIn['outputs'] = ['zone_hour', 'borough_hour', 'zone_list', 'districts', 'weather_hourly', 'weather_effect'].map((name) => ({ name, fate: 'waits' as const }));
  const options: BriefIn['options'] = [
    { option: 'asis', label: 'Publish as is', line: null, off: null },
    { option: 'dont', label: 'Keep the last day', line: null, off: null },
    { option: 'fill', label: 'Fill from a good day', line: null, off: null },
    { option: 'complete', label: 'The part that arrived', line: null, off: null },
  ];
  const input = (day: string, readers: string): BriefIn => ({
    day, flow: 'NYC taxis and weather', noun: (n: number) => (n === 1 ? 'trip' : 'trips'), story: story(day),
    pause: { state: 'waiting', readers, deciders: 'Owner', may: true }, outputs, objects: ['District', 'Zone'], readers: ['Ana', 'Ben'],
    file: { name: `yellow_tripdata_${day}.parquet`, rows: null, check: 'same' }, options, picked: null,
  });

  it('tells Thu Sep 21, 2023 as the hour the trips fell, with the day against its range and what waits', () => {
    const b = briefOf(input('2023-09-21', '2023-09-18'));
    expect(b.status).toBe('investigating');
    expect(wordsIn(b.situation)).toBeLessThanOrEqual(25);
    expect(b.situation).toMatch(/^Thu Sep 21: .*; 6 of 6 outputs wait, readers see Mon 18\.$/);
    expect(b.cause.facts[0]).toMatch(/^Trips fell \d+% from 13:00/);
    // The checks' figure as their own line says it, never rounded to the limit (two-minute test, round 1).
    expect(b.cause.facts.find((f) => f.startsWith('The checks'))).toMatch(/^The checks \(trips_valid\) dropped 9\.\d+% of rows \(limit 10%\)$/);
    expect(b.fix.proposed).toBe('fill');
    expect(briefWords(b)).toBeLessThanOrEqual(90);
    expect(briefBanned(b)).toEqual([]);
  });

  it('proposes the part that arrived, not a fill, on the second day of Vendor 1’s outage (Tue Nov 15, 2022)', () => {
    const b = briefOf(input('2022-11-15', '2022-11-12'));
    expect(b.title).toBe('Vendor 1 sent almost nothing');
    expect(b.cause.facts[0]).toMatch(/^Vendor 1 \(Creative Mobile\) all but vanished \(3 today, usually/);
    expect(b.cause.facts).toContain('Day 2 of an episode since Mon 14');
    expect(b.fix.proposed).toBe('complete');
    expect(b.fix.why).toMatch(/^The outage is still running/);
    // Its first day is a single short day: filled from a good one.
    expect(briefOf(input('2022-11-14', '2022-11-12')).fix.proposed).toBe('fill');
  });
});
