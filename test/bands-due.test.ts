/**
 * Written bands and due marks (ADR 0014 §3, slice 2): a value's expected band in the ontology replaces its learned
 * range (the `values` check); a due mark on a date column counts what was due and what is still missed, and the `due`
 * check judges the late share against its own history, telling the miss value's rise through it. Both are a gate's
 * written checks: plan/4 carries them, and a document without gates may not have them.
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { HistoryRanges, lateAt, seriesOf } from '../src/core/history.js';
import { appendPeriods, emptyHistory, measuresOf, scanColumns, type MeasureSettings, type Measures } from '../src/core/measures.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { judgeOf, LEGACY_JUDGE, newsOf } from '../src/core/news.js';
import { marksOn, type Ontology, type PropertyType } from '../src/core/ontology.js';
import { translate } from '../src/core/plan.js';
import { levelOf } from '../src/core/fill.js';
import { storyOf } from '../src/core/story.js';
import { exampleDoc } from './helpers/example.js';
import { historyWith, vendorNames } from './helpers/history.js';
import { ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, gate, publish, source } from 'smaltfl/notebook';\n";
const NB = `${SETUP}
cell('params');
export const params = param({ day: param.text('') });
cell('sla');
export const sla = source('sla');
cell('sla_gate');
export const sla_gate = gate(sla);
cell('kept', { lang: 'sql' });
export const kept = sql\`SELECT * FROM \${sla}\`;
cell('published');
publish(kept);
`;
const ontology = (over: Partial<PropertyType>[]): Ontology => ({
  objectTypes: [], linkTypes: [], actionTypes: [],
  properties: [
    { column: 'status', title: 'Status', description: 'Met or missed', values: { pass: 'Met', fail: 'Missed' }, bad: ['fail'], ...(over[0] ?? {}) },
    { column: 'next_due', title: 'Next due', description: 'When it is due', ...(over[1] ?? {}) },
  ] as PropertyType[],
});
const flow = (o: Ontology, gated = true): FlowDocument =>
  ({
    smaltfl: 4, id: 'sla', name: 'SLA', steps: [],
    parameters: [{ name: 'day', type: 'text', default: '2024-03-01' }],
    sources: [{ id: 'sla', table: 'sla_file' }],
    notebooks: [{ path: 'a.nb.ts', source: gated ? NB : NB.replace(/cell\('sla_gate'\);\nexport const sla_gate = gate\(sla\);\n/, '') }],
    publish: { hold: ['wrong'], period: 'day', watch: { sla: { history: 'h.json', pattern: 'none' } } },
    ontology: o,
  }) as FlowDocument;

describe('the marks in the ontology', () => {
  it('reads a value’s band for the dataset (the one naming it over the general one) and a due mark, sorted', () => {
    const o = ontology([{ expect: [{ value: 'fail', share: [0, 0.1] }, { value: 'fail', share: [0, 0.3], datasets: ['other'] }, { value: 'pass', share: [0.8, 1] }] }, { due: { status: 'status', miss: 'fail', within: 14 } }]);
    expect(marksOn(o, 'sla').expect).toEqual([['status', 'fail', 0, 0.1], ['status', 'pass', 0.8, 1]]);
    expect(marksOn(o, 'other').expect).toEqual([['status', 'fail', 0, 0.3], ['status', 'pass', 0.8, 1]]);
    expect(marksOn(o, 'sla').due).toEqual([['next_due', 'status', 'fail', 14]]);
    expect(marksOn(ontology([{}, {}]), 'sla')).toMatchObject({ expect: [], due: [] });
  });

  it('is plan/4’s to carry: a gated flow’s watch has them, a flow without gates may not write them', async () => {
    const o = ontology([{ expect: [{ value: 'fail', share: [0, 0.1] }] }, { due: { status: 'status', miss: 'fail' } }]);
    const doc = await expandNotebooks(flow(o), ts);
    expect(validateDocument(doc)).toEqual([]);
    const plan = await translate(doc, { day: '2024-03-01' });
    expect(plan.smaltflPlan).toBe(4);
    const w = (plan.publish as unknown as { watch: [number, Record<string, unknown>][] }).watch[0]![1];
    expect(w.expect).toEqual([['status', 'fail', 0, 0.1]]);
    expect(w.due).toEqual([['next_due', 'status', 'fail', 28]]);
    expect(w.checks).toEqual(LAYER_DEFAULTS.bronze);
    const plain = await expandNotebooks(flow(o, false), ts);
    expect(validateDocument(plain).map((i) => i.message)).toEqual(['a band is a gate’s written check (ADR 0014): the flow has no gate', 'a due mark is a gate’s written check (ADR 0014): the flow has no gate']);
    const bad = await expandNotebooks(flow(ontology([{ expect: [{ value: 'fail', share: [0.5, 0.2] }] }, { due: { status: 'status', miss: 'fail', within: 0 } }])), ts);
    expect(validateDocument(bad).map((i) => i.message)).toEqual(['{ value, share: [low, high] }, each share 0 to 1, low at most high', '{ status: the status column, miss: the value that is a miss, within?: days (1 to 366) }']);
    // A flow with no gate carries neither in its plan, and its judge has none.
    expect(judgeOf(exampleDoc(), 'trips')).toMatchObject({ expect: new Map(), due: [] });
    expect(judgeOf(doc, 'sla').expect.get('status|fail')).toEqual([0, 0.1]);
    expect(judgeOf(doc, 'sla').due).toEqual([{ column: 'next_due', status: 'status', miss: 'fail', within: 28 }]);
  });
});

/**
 * A day's measures of an SLA file of two hundred rows: `due` rows due that day (next_due = day), `late` rows missed from
 * the day before (next_due = yesterday, status fail), `perDay` rows still missed from each of the six days before that,
 * the rest passing with a due date a month out. The scan's rows carry the scanned columns in their order (status,
 * next_due), as the engine returns them.
 */
function slaMeasures(day: string, o: { due: number; late: number; perDay?: number; measured?: boolean }): Measures {
  const perDay = o.perDay ?? 1;
  const scan: unknown[][] = [];
  for (let i = 0; i < o.late; i++) scan.push(['fail', plusDays(day, -1)]);
  for (let back = 2; back <= 7; back++) for (let i = 0; i < perDay; i++) scan.push(['fail', plusDays(day, -back)]);
  for (let i = 0; i < o.due; i++) scan.push(['pass', day]);
  while (scan.length < 200) scan.push(['pass', plusDays(day, 30)]);
  const rows = scan.length;
  const s: MeasureSettings = { source: 'sla', slot: day, every: 'day', checks: null, counting: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, ...(o.measured === false ? {} : { due: [['next_due', 'status', 'fail', 7]] }) };
  const facts: unknown[] = [rows];
  for (const k of [0, 1, 2]) facts.push(rows, k === 0 ? rows : 3, null, null, null);
  return measuresOf(s, { file: null, snapshot: 'x', schema: [['app_id', 'text'], ['next_due', 'text'], ['status', 'text']], facts, sample: [], scan, checks: null });
}

describe('the due counts in a load’s measures and the history', () => {
  it('counts the rows due on the day and the rows still missed by past due date, only where a mark is set', () => {
    const m = slaMeasures('2024-03-10', { due: 12, late: 3, perDay: 0 });
    expect(m.due).toEqual({ next_due: { on: 12, late: [['2024-03-09', 3]] } });
    expect(slaMeasures('2024-03-10', { due: 12, late: 3 }).due!.next_due!.late).toEqual([['2024-03-03', 1], ['2024-03-04', 1], ['2024-03-05', 1], ['2024-03-06', 1], ['2024-03-07', 1], ['2024-03-08', 1], ['2024-03-09', 3]]);
    expect(scanColumns({ counted: ['status'], followed: [], time: null, due: [['next_due', 'status', 'fail', 7]] }, ['app_id', 'next_due', 'status'])).toEqual(['status', 'next_due']);
    expect(slaMeasures('2024-03-10', { due: 12, late: 3, measured: false }).due).toBeUndefined();
    // The same rows measured without the mark are the record they always were: the mark adds a field, changes none.
    const { due: _d, ...rest } = m;
    expect(rest).toEqual(slaMeasures('2024-03-10', { due: 12, late: 3, perDay: 0, measured: false }));
  });

  it('keeps them day by day, and tells the late share over the window from them', () => {
    const first = slaMeasures('2024-01-01', { due: 10, late: 0 });
    let h = emptyHistory({ flow: 'sla', source: 'sla', settings: { checks: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, due: [['next_due', 'status', 'fail', 7]] }, columns: first.columns, types: first.types, kinds: first.kinds, warmup: 3 });
    const ms: Measures[] = [];
    for (let i = 0; i < 20; i++) ms.push(slaMeasures(plusDays('2024-01-01', i), { due: 10, late: 1 }));
    h = appendPeriods(h, ms);
    expect(h.due!.next_due).toMatchObject({ status: 'status', miss: 'fail', within: 7 });
    expect(h.due!.next_due.on).toHaveLength(20);
    expect(h.due!.next_due.late[5]!.at(-1)).toEqual(['2024-01-05', 1]);
    // Day 10: seven days before it were due (70), one missed from each: one in ten.
    expect(lateAt(h, 10, 'next_due')).toEqual({ due: 70, late: 7, share: 0.1, within: 7, cohort: { due: 10, late: 1 } });
    // Day 0 has no days before it: nothing due in the window, the late rows there not counted against nothing.
    expect(lateAt(h, 0, 'next_due')).toEqual({ due: 0, late: 7, share: null, within: 7, cohort: { due: 0, late: 1 } });
    expect(lateAt(h, 10, 'status')).toBeNull();
    const series = seriesOf(h, { of: 'late', column: 'next_due' })!;
    expect(series.values[10]).toBeCloseTo(0.1);
    expect(series.values[0]).toBeNull();
    expect(seriesOf(h, { of: 'late', column: 'nothing' })).toBeNull();
  });
});

describe('the judges (Q-114, ADR 0014 §3)', () => {
  it('judges a value with a band by the band alone: outside it something wrong, inside it nothing', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-11': { vendorShare: 0.15 } }));
    const gated = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.bronze };
    // Without a band, vendor 1 at 15% against its usual 30% is a share finding (unusual, under the bronze gate).
    const plain = newsOf(h, '2023-10-11', vendorNames, { judge: gated });
    expect(plain.find((f) => f.key === 'share:VendorID=1')).toMatchObject({ kind: 'share', check: 'shares' });
    // A band of 25–35%: the day misses it, something wrong, said with the band; the learned range isn't told.
    const banded = newsOf(h, '2023-10-11', vendorNames, { judge: { ...gated, expect: new Map([['vendorid|1', [0.25, 0.35]]]) } });
    const band = banded.find((f) => f.kind === 'band')!;
    expect(band).toMatchObject({ key: 'band:VendorID=1', severity: 'alert', check: 'values', band: [0.25, 0.35], columns: ['VendorID'], values: ['1'] });
    expect(band.title).toMatch(/^Vendor 1: 1\d(\.\d)?% \(band 25%–35%\)$/);
    expect(band.detail).toMatch(/the ontology expects 25% to 35% of trips\.$/);
    expect(banded.some((f) => f.key === 'share:VendorID=1')).toBe(false);
    // A wide band the day sits in: nothing said of the value at all.
    const inside = newsOf(h, '2023-10-11', vendorNames, { judge: { ...gated, expect: new Map([['vendorid|1', [0.1, 0.4]]]) } });
    expect(inside.some((f) => f.kind === 'band' || f.key === 'share:VendorID=1')).toBe(false);
    // The story leads with it, and the Accept it offers is of a new band around the day's share.
    const story = storyOf(h, '2023-10-11', banded, { names: vendorNames, judge: gated });
    expect(story.state).toBe('wrong');
    expect(story.cause?.kind).toBe('band');
    const level = levelOf(story, { state: 'wrong' }, [{ by: 'story' }], '2023-10-11', 'trips');
    expect(level?.band).toMatchObject({ column: 'VendorID', value: '1' });
    expect(level!.band!.share[0]).toBeCloseTo(level!.band!.share[1] - 0.1, 5);
  });

  it('tells a cluster of due dates with the usual share late as a note, and more than usual late as something wrong, in place of the bad value', () => {
    const judge = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.bronze, bad: new Map([['status', new Set(['fail'])]]), pattern: 'none' as const, legacy: false, due: [{ column: 'next_due', status: 'status', miss: 'fail', within: 7 }], needs: [] };
    const first = slaMeasures('2024-01-01', { due: 10, late: 0 });
    const start = emptyHistory({ flow: 'sla', source: 'sla', settings: { checks: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, due: [['next_due', 'status', 'fail', 7]] }, columns: first.columns, types: first.types, kinds: first.kinds, warmup: 3 });
    // Sixty days of ten due a day, one in ten late; then a day with a hundred due, and the day after it with ten of
    // them late (the usual share), and another with sixty of them late.
    const ms: Measures[] = [];
    for (let i = 0; i < 60; i++) ms.push(slaMeasures(plusDays('2024-01-01', i), { due: 10, late: 1 }));
    const cluster = plusDays('2024-01-01', 60);
    ms.push(slaMeasures(cluster, { due: 100, late: 1 }));
    ms.push(slaMeasures(plusDays(cluster, 1), { due: 10, late: 10 }));
    const h = new HistoryRanges(appendPeriods(start, ms), { pattern: 'none' });
    const usual = newsOf(h, plusDays(cluster, 1), vendorNames, { judge });
    const due = usual.find((f) => f.kind === 'due')!;
    // Yesterday's cohort: a hundred due, ten still missed, as every cohort before it (one in ten, pooled).
    expect(due).toMatchObject({ severity: 'note', check: 'due', value: 0.1, due: { late: 10, due: 100, within: 7, usual: 0.1 } });
    expect(due.title).toBe('Late: 10 of 100 due (usually 10%)');
    expect(due.detail).toBe('10% of what was due yesterday is still fail, as usual (10% over 600 due). Last 7 days: 160 due, 16 late.');
    // The bad value's rise (fail from 1% to 9%) is the due check's to tell: no share finding, nothing wrong.
    expect(usual.some((f) => f.kind === 'share' && f.values?.[0] === '"fail"')).toBe(false);
    expect(usual.some((f) => f.severity === 'alert')).toBe(false);
    // Sixty late of a hundred due: something wrong, by the due check.
    const bad = new HistoryRanges(appendPeriods(start, [...ms.slice(0, 61), slaMeasures(plusDays(cluster, 1), { due: 10, late: 60 })]), { pattern: 'none' });
    const wrong = newsOf(bad, plusDays(cluster, 1), vendorNames, { judge });
    expect(wrong.find((f) => f.kind === 'due')).toMatchObject({ severity: 'alert', check: 'due' });
    expect(wrong.find((f) => f.kind === 'due')!.title).toBe('Late: 60 of 100 due (usually 10%)');
    expect(wrong.find((f) => f.kind === 'due')!.detail).toBe('60% of what was due yesterday is still fail; usually 10% the day after. Last 7 days: 160 due, 66 late.');
    // The story leads with it.
    const story = storyOf(bad, plusDays(cluster, 1), wrong, { names: vendorNames, judge });
    expect(story.state).toBe('wrong');
    expect(story.head).toBe('Late: 60 of 100 due');
    // Without the mark, the same day is a bad value up, as before.
    const unmarked = newsOf(bad, plusDays(cluster, 1), vendorNames, { judge: { ...judge, due: [] } });
    expect(unmarked.find((f) => f.kind === 'share' && f.values?.[0] === '"fail"')).toMatchObject({ severity: 'alert', bad: true });
    expect(unmarked.some((f) => f.kind === 'due')).toBe(false);
  });
});
