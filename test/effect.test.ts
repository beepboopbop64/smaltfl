/**
 * An effect against a baseline, read from a table's rows (ADR 0008 §12): weather_effect's trips per hour in each
 * condition against dry hours. On a dry day every row is the baseline, and there is nothing to measure.
 */
import { describe, expect, it } from 'vitest';
import { effectOf } from '../src/core/effect.js';
import { effectBars } from '../src/app/viz.js';

const columns = ['borough', 'condition', 'hours', 'trips_per_hour', 'vs_dry'];
const boroughs = ['Manhattan', 'Queens', 'Brooklyn', 'Bronx', 'Staten Island', 'EWR'];

describe('an effect against its baseline', () => {
  it('has nothing to measure on a day whose rows are all the baseline (New Year’s Day 2024: all dry)', () => {
    const rows = boroughs.map((b) => [b, 'dry', 24, 120, 1]);
    const e = effectOf(columns, rows)!;
    expect(e).toMatchObject({ ratio: 'vs_dry', baseline: 'dry', by: 'condition', group: 'borough', total: 6, measured: false, rows: [] });
  });

  it('reads each other value’s ratio by group on a wet day', () => {
    const rows = [...boroughs.map((b) => [b, 'dry', 20, 120, 1]), ['Manhattan', 'rain', 4, 110, 0.92], ['Queens', 'rain', 4, 70, 1.08], ['Queens', 'snow', 2, 50, null]];
    const e = effectOf(columns, rows)!;
    expect(e.measured).toBe(true);
    // A ratio that couldn't be computed is left out, not drawn as 0.
    expect(e.rows).toEqual([{ group: 'Manhattan', value: 'rain', ratio: 0.92 }, { group: 'Queens', value: 'rain', ratio: 1.08 }]);
    const svg = effectBars({ groups: [{ head: 'Rain', rows: e.rows.map((r) => ({ name: r.group, ratio: r.ratio })) }], baseline: 'dry', aria: 'Trips against dry hours: rain Manhattan 0.92 times, Queens 1.08 times' });
    expect(svg).toMatch(/^<svg class="viz" [^>]*role="img"/);
    expect(svg).toContain('dry = 1×');
    expect(svg).toContain('0.92×');
    expect(svg).toContain('1.08×');
    // The baseline is a solid tick, counted from 0.
    expect(svg).toContain('class="limit"');
    expect(svg).toContain('>0</text>');
    expect(svg).not.toMatch(/NaN|undefined|dash/);
  });

  it('is no effect without a vs_ column, or without its baseline among the values', () => {
    expect(effectOf(['borough', 'trips'], [['Bronx', 3]])).toBeNull();
    expect(effectOf(columns, [['Bronx', 'rain', 3, 10, 0.9]])).toBeNull();
  });
});
