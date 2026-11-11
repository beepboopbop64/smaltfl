/**
 * The classifier check and the kept sample (ADR 0014 §5, slice 4): a few hundred rows a day kept, stratified by the
 * counted columns, in a sample file beside the history that keeps eight weeks; today's rows against the like days'
 * rows, a shallow boosted model judged by its held-out AUC against chance and against random labels; explained by the
 * columns the held-out half loses most on when shuffled. Learned: it warns under the layer's defaults.
 */
import { describe, expect, it } from 'vitest';
import { apartEvidence, apartSpeaks, appendSample, aucOf, clockColumns, emptySample, keepSample, likeDays, sampleRows, tellApart } from '../src/core/apart.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { HistoryRanges } from '../src/core/history.js';
import { LEGACY_JUDGE, newsOf } from '../src/core/news.js';
import { plusDays } from '../src/core/calendar.js';
import { random } from '../src/core/quality.js';
import { historyWith, vendorNames } from './helpers/history.js';

/** Rows of a status, an exposure and an age: `shift` moves the failing share up. */
function rows(n: number, seed: number, shift = 0): unknown[][] {
  const rnd = random(seed);
  const out: unknown[][] = [];
  for (let i = 0; i < n; i++) out.push([rnd() < 0.1 + shift ? 'fail' : 'pass', rnd() < 0.3 ? 'yes' : 'no', Math.round(rnd() * 100)]);
  return out;
}
const COLUMNS = ['status', 'exposed', 'age'];
const KINDS = ['code', 'code', 'measure'] as const;

describe('the kept sample', () => {
  it('keeps every stratum present, in proportion, evenly through the rows, and never more than asked', () => {
    const all = rows(1000, 1);
    const kept = keepSample(all, [0, 1], 50);
    expect(kept).toHaveLength(50);
    const strata = new Map<string, number>();
    for (const r of kept) strata.set(`${r[0]}|${r[1]}`, (strata.get(`${r[0]}|${r[1]}`) ?? 0) + 1);
    expect(strata.size).toBe(4);
    // Pass and not exposed is about 63% of the rows: about 63% of the kept.
    expect(strata.get('pass|no')!).toBeGreaterThan(25);
    expect(strata.get('fail|yes')!).toBeGreaterThanOrEqual(1);
    // Fewer rows than asked: all of them, as they came.
    expect(keepSample(all.slice(0, 20), [0], 50)).toEqual(all.slice(0, 20));
    // A flagged row is kept whatever its stratum.
    expect(keepSample(all, [0, 1], 50, new Set([999]))).toContainEqual(all[999]);
    // The same rows, the same kept rows.
    expect(keepSample(all, [0, 1], 50)).toEqual(kept);
  });

  it('appends a day after the last, keeps eight weeks, and picks the like days by the pattern', () => {
    let file = emptySample({ flow: 'f', source: 's', columns: COLUMNS, kinds: [...KINDS] });
    for (let i = 0; i < 70; i++) file = appendSample(file, plusDays('2024-01-01', i), rows(10, i));
    expect(file.days).toHaveLength(56);
    expect(file.days[0]).toBe('2024-01-15');
    expect(file.days.at(-1)).toBe('2024-03-10');
    expect(() => appendSample(file, '2024-03-10', [])).toThrow(/isn't after/);
    expect(sampleRows(file, ['2024-03-10', '2024-03-09'])).toHaveLength(20);
    // Like days: the four weeks before under no pattern, the same weekday over eight weeks under the weekly one.
    // The four weeks before the day: twenty-seven days, the day itself left out.
    expect(likeDays(file, '2024-03-11', 'none')).toHaveLength(27);
    expect(likeDays(file, '2024-03-11', 'none').at(-1)).toBe('2024-03-10');
    expect(likeDays(file, '2024-03-11', 'weekly')).toEqual(['2024-01-15', '2024-01-22', '2024-01-29', '2024-02-05', '2024-02-12', '2024-02-19', '2024-02-26', '2024-03-04']);
    expect(likeDays(file, '2024-03-11', 'none', (d) => d === '2024-03-10')).toHaveLength(26);
    // Monthly: the same day of the months before, a day either side, as far back as the sample goes.
    expect(likeDays(file, '2024-03-11', 'monthly')).toEqual(['2024-02-10', '2024-02-11', '2024-02-12']);
    expect(likeDays(file, '2024-03-31', 'monthly')).toEqual(['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-28', '2024-02-29', '2024-03-01']);
    // Days after the day, or the day itself, are never its like days.
    expect(likeDays(file, '2024-03-01', 'none').every((d) => d < '2024-03-01')).toBe(true);
  });
});

describe('telling today apart', () => {
  it('leaves a clock out: a measure whose day’s median climbs with the day', () => {
    let file = emptySample({ flow: 'f', source: 's', columns: ['status', 'age', 'size'], kinds: ['code', 'measure', 'measure'] });
    for (let i = 0; i < 20; i++) file = appendSample(file, plusDays('2024-01-01', i), rows(40, i).map((r, j) => [r[0], 100 + i + (j % 3), r[2]]));
    expect(clockColumns(file, file.days)).toEqual([1]);
    // Left out, the clock tells nothing; in, it tells today from any earlier day.
    const today = rows(40, 99).map((r, j) => [r[0], 130 + (j % 3), r[2]]);
    const reference = sampleRows(file, file.days);
    expect(tellApart(today, reference, file.columns, file.kinds, { leaveOut: new Set([1]) })!.auc).toBeLessThan(0.6);
    expect(tellApart(today, reference, file.columns, file.kinds)!.auc).toBeGreaterThan(0.9);
  });

  it('ranks by the area under the curve, ties at half', () => {
    expect(aucOf([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBe(0.75);
    expect(aucOf([1, 1, 1, 1], [0, 1, 0, 1])).toBe(0.5);
    expect(aucOf([0, 0, 1, 1], [0, 0, 1, 1])).toBe(1);
  });

  it('finds nothing between two draws of the same rows, and the shifted column when the share moved', () => {
    const reference = rows(1000, 11);
    const same = tellApart(rows(200, 12), reference, COLUMNS, [...KINDS])!;
    expect(same.n).toBe(200);
    expect(same.auc).toBeLessThan(0.58);
    expect(same.z).toBeLessThan(3);
    const shifted = tellApart(rows(200, 13, 0.5), reference, COLUMNS, [...KINDS])!;
    expect(shifted.auc).toBeGreaterThan(0.7);
    expect(shifted.z).toBeGreaterThan(4);
    expect(shifted.auc).toBeGreaterThan(shifted.floor + 0.1);
    expect(shifted.columns[0]!.column).toBe('status');
    expect(shifted.columns[0]!.share).toBeGreaterThan(0.6);
    // Too few rows a side, or no columns to learn from: nothing. A date written as text, a time or an id is no feature:
    // a date tells today from any earlier day by itself.
    expect(tellApart(rows(20, 1), reference, COLUMNS, [...KINDS])).toBeNull();
    expect(tellApart(rows(200, 1), reference, COLUMNS, ['empty', 'empty', 'empty'])).toBeNull();
    const dated = (n: number, day: string, seed: number) => rows(n, seed).map((r, i) => [day, `id-${i}`, r[0]]);
    const byDate = tellApart(dated(200, '2024-03-02', 3), dated(1000, '2024-02-01', 4), ['due', 'app', 'status'], ['code', 'code', 'code'])!;
    expect(byDate.auc).toBeLessThan(0.58);
    expect(byDate.columns.map((c) => c.column)).not.toContain('due');
    expect(byDate.columns.map((c) => c.column)).not.toContain('app');
    // Seeded: the same rows, the same verdict.
    expect(tellApart(rows(200, 13, 0.5), reference, COLUMNS, [...KINDS])).toEqual(shifted);
  });

  it('is a finding of the classifier check, unusual under the layer’s defaults, and silent with the check off or no sample', () => {
    const h = new HistoryRanges(historyWith());
    let sample = emptySample({ flow: 'f', source: 's', columns: COLUMNS, kinds: [...KINDS] });
    for (let i = 1; i <= 28; i++) sample = appendSample(sample, `2023-09-${String(i).padStart(2, '0')}`, rows(60, i));
    for (let i = 1; i <= 10; i++) sample = appendSample(sample, `2023-10-${String(i).padStart(2, '0')}`, rows(60, 100 + i));
    const bronze = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.bronze, pattern: 'none' as const };
    const shifted = newsOf(h, '2023-10-11', vendorNames, { judge: bronze, apart: { sample, today: rows(200, 500, 0.5) } });
    const f = shifted.find((x) => x.kind === 'apart')!;
    expect(f).toMatchObject({ severity: 'warn', check: 'classifier' });
    expect(f.columns![0]).toBe('status');
    expect(f.title).toMatch(/^Rows unlike earlier days: AUC 0\.\d\d$/);
    expect(f.detail).toMatch(/^Status( and \w+)? explain \d+% of what tells today’s trips from 2\d earlier days’ \(200 a side; chance reaches 0\.\d\d\)\.$/);
    // The four weeks before, less the days the history leaves out of learning.
    expect(f.apart!.days).toBeGreaterThanOrEqual(25);
    const same = newsOf(h, '2023-10-11', vendorNames, { judge: bronze, apart: { sample, today: rows(200, 501) } });
    expect(same.some((x) => x.kind === 'apart')).toBe(false);
    expect(newsOf(h, '2023-10-11', vendorNames, { judge: { ...bronze, checks: { ...LAYER_DEFAULTS.bronze, classifier: 'off' } }, apart: { sample, today: rows(200, 500, 0.5) } }).some((x) => x.kind === 'apart')).toBe(false);
    expect(newsOf(h, '2023-10-11', vendorNames, { judge: bronze }).some((x) => x.kind === 'apart')).toBe(false);
    // Without a gate, the classifier runs where a sample is kept (ADR 0015 §6), and warns at most: a model doesn't hold.
    // Without a sample there is nothing to run it on, and a flow is judged as it always was.
    const ungated = newsOf(h, '2023-10-11', vendorNames, { apart: { sample, today: rows(200, 500, 0.5) } }).find((x) => x.kind === 'apart');
    expect(ungated?.severity).toBe('warn');
    expect(newsOf(h, '2023-10-11', vendorNames, {}).some((x) => x.kind === 'apart')).toBe(false);
  });

  it('gives its evidence whether or not it speaks, and why when it can’t run (ADR 0015 §6)', () => {
    let sample = emptySample({ flow: 'f', source: 's', columns: COLUMNS, kinds: [...KINDS] });
    for (let i = 1; i <= 28; i++) sample = appendSample(sample, `2023-09-${String(i).padStart(2, '0')}`, rows(60, i));
    const shifted = apartEvidence(sample, rows(200, 500, 0.5), '2023-10-11', 'none');
    const same = apartEvidence(sample, rows(200, 501), '2023-10-11', 'none');
    if ('why' in shifted || 'why' in same) throw new Error('both run');
    expect(shifted.speaks).toBe(true);
    expect(apartSpeaks(shifted.found)).toBe(true);
    expect(same.speaks).toBe(false);
    expect(same.found.auc).toBeLessThan(0.7);
    expect(shifted.days.length).toBeGreaterThanOrEqual(10);
    // Days the history doesn't learn from aren't like days.
    const fewer = apartEvidence(sample, rows(200, 501), '2023-10-11', 'none', (d) => d > '2023-09-20');
    expect('days' in fewer ? fewer.days.every((d) => d > '2023-09-20') && fewer.days.length > 0 : false).toBe(true);
    expect(apartEvidence(emptySample({ flow: 'f', source: 's', columns: COLUMNS, kinds: [...KINDS] }), rows(200, 1), '2023-10-11', 'none')).toEqual({ why: 'no like days kept in the sample yet' });
    expect(apartEvidence(sample, rows(10, 1), '2023-10-11', 'none')).toEqual({ why: 'too few rows a side to learn from' });
  });
});
