/**
 * Slots (ADR 0010 §7): what one load of a watched source covers, a day or a part of it aligned to midnight; slot ids
 * that sort in time order; a slot's parts; format 3 and plan/2 saying a watch's slot; a load measured by its slot's
 * parts; a slot judged from its own series, the same slot of the day, as a day is from a day's; and its claim/2.
 */
import { describe, expect, it } from 'vitest';
import { dayOfSlot, isSlotOf, nextSlot, partsOf, sameSlotOn, slotId, slotLabel, slotOf, slotsOfDay, slotsPerDay } from '../src/core/calendar.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { HistoryRanges, slotSeries } from '../src/core/history.js';
import { flowStory, judgeClaims, loadClaim, rangesFor, type StoryClaim2 } from '../src/core/hold.js';
import { emptyHistory, settingsFor, type Measures } from '../src/core/measures.js';
import { hoursShort } from '../src/core/news.js';
import { translate, validatePlan, type PlanPublish2 } from '../src/core/plan.js';
import { EDR_COLUMNS, edrHistory, edrRows, edrSlots, twoSourceDoc } from './fixtures/security.js';
import { measureLoad } from '../src/index.js';
import { openEngine } from './helpers/engine.js';

describe('slots (ADR 0010 §7)', () => {
  it('names a slot by its day and first hour, so ids sort in time order', () => {
    expect(slotId('2024-09-10', 7, '6h')).toBe('2024-09-10T06');
    expect(slotId('2024-09-10', 23, '8h')).toBe('2024-09-10T16');
    expect(slotId('2024-09-10', 9, 'day')).toBe('2024-09-10');
    expect(slotsOfDay('2024-09-10', '6h')).toEqual(['2024-09-10T00', '2024-09-10T06', '2024-09-10T12', '2024-09-10T18']);
    expect(slotsOfDay('2024-09-10', 'day')).toEqual(['2024-09-10']);
    expect([...slotsOfDay('2024-09-11', '6h'), ...slotsOfDay('2024-09-10', '6h')].sort()[3]).toBe('2024-09-10T18');
    expect(slotsPerDay('1h')).toBe(24);
    expect(nextSlot('2024-09-10T18', '6h')).toBe('2024-09-11T00');
    expect(nextSlot('2024-12-31T12', '12h')).toBe('2025-01-01T00');
    expect(nextSlot('2024-02-28', 'day')).toBe('2024-02-29');
    expect(dayOfSlot('2024-09-10T06')).toBe('2024-09-10');
    expect(sameSlotOn('2024-09-10T06', '2024-09-03')).toBe('2024-09-03T06');
  });

  it('knows a slot of its length from any other text', () => {
    expect(isSlotOf('2024-09-10T06', '6h')).toBe(true);
    expect(isSlotOf('2024-09-10T07', '6h')).toBe(false);
    expect(isSlotOf('2024-09-10', '6h')).toBe(false);
    expect(isSlotOf('2024-09-10T06', 'day')).toBe(false);
    expect(isSlotOf('2024-02-30T00', '6h')).toBe(false);
    expect(isSlotOf('2024-09-10T21', '3h')).toBe(true);
  });

  it('counts a slot in its hours from 3 hours, in quarter hours under that, and says it by its hours', () => {
    expect(partsOf('2024-09-10', 'day')).toEqual({ start: 0, width: 60, count: 24 });
    expect(partsOf('2024-09-10T06', '6h')).toEqual({ start: 360, width: 60, count: 6 });
    expect(partsOf('2024-09-10T14', '2h')).toEqual({ start: 840, width: 15, count: 8 });
    expect(slotLabel('2024-09-10T06', '6h')).toBe('06–12');
    expect(slotLabel('2024-09-10T18', '6h')).toBe('18–24');
  });

  it('finds the slot a time falls in, as its text writes it or in a zone', () => {
    expect(slotOf('2024-09-10 07:59:00', '6h', null)).toBe('2024-09-10T06');
    expect(slotOf('2024-09-10T23:00:00Z', '6h', 'America/New_York')).toBe('2024-09-10T18');
    expect(slotOf('2024-09-11T02:00:00Z', '6h', 'America/New_York')).toBe('2024-09-10T18');
    expect(slotOf('not a time', '6h', null)).toBeNull();
  });
});

describe('a watch of slots in format 3 and plan/2', () => {
  const doc = twoSourceDoc();
  it('validates a watch loaded every 6 hours, and refuses one without its time or of a length it can\'t judge', () => {
    expect(validateDocument(doc)).toEqual([]);
    const without = structuredClone(doc) as FlowDocument;
    delete (without.publish!.watch!.edr as { time?: string }).time;
    expect(validateDocument(without).map((e) => e.message)).toContainEqual(expect.stringMatching(/^a load of 6h is counted by its time column/));
    const odd = structuredClone(doc) as FlowDocument;
    (odd.publish!.watch!.edr as { every: string }).every = '5h';
    expect(validateDocument(odd).map((e) => e.path)).toContain('$.publish.watch.edr.every');
  });

  it('carries the slot\'s length in the plan, and refuses a period that isn\'t a slot of it', async () => {
    const plan = await translate(doc, { day: '2024-09-10', slot: '2024-09-10T06' });
    const pub = plan.publish as PlanPublish2;
    expect(pub.watch.map(([, w]) => [w.history, w.period, w.every, w.calendar])).toEqual([['auth-history.json', 'day', 'day', true], ['edr-history.json', 'slot', '6h', false]]);
    expect(() => validatePlan(plan)).not.toThrow();
    const bad = { ...plan, parameters: { ...plan.parameters, slot: '2024-09-10T07' } };
    expect(() => validatePlan(bad)).toThrow(/slot is 2024-09-10T07, not a slot of 6h/);
    // Measured as a load of its slot: the settings name it.
    expect(settingsFor(plan, pub.watch[1]![0], null)).toMatchObject({ source: 'edr', slot: '2024-09-10T06', every: '6h', time: 'event_time' });
  });
});

/** The outage slot and the one before it, the fixture's plans at a twentieth of the volume. */
const SCALE = 0.05;
const plans = edrSlots({ scale: SCALE }).filter((p) => p.slot >= '2024-09-10T00' && p.slot <= '2024-09-10T06');

describe('a load of a slot measured in the engine', () => {
  it('counts its rows in the slot\'s hours, a row outside the slot in none', async () => {
    const db = openEngine();
    try {
      const plan = plans.find((p) => p.slot === '2024-09-10T06')!;
      const rows = [...edrRows(plan), ['2024-09-10 13:05:00', 'h1', 'process', 'info']];
      db.exec(`CREATE TABLE edr_file(${EDR_COLUMNS.map((c) => `${c} TEXT`).join(', ')})`);
      const t = db.prepare('INSERT INTO edr_file VALUES (?, ?, ?, ?)');
      for (const r of rows) t.run(r);
      const m = await measureLoad(db, 'edr_file', { source: 'edr', slot: '2024-09-10T06', every: '6h', checks: null, counting: null, counted: ['action', 'severity'], followed: [], paired: [], time: 'event_time', zone: null, sample: 2000 });
      expect(m).toMatchObject({ slot: '2024-09-10T06', every: '6h', rows: rows.length });
      expect(m.parts).toHaveLength(6);
      // The collector down 06:00–10:00: a trickle in four hours, the slot's last two as usual; the 13:05 row in no part.
      expect(m.parts.reduce((a, b) => a + b, 0)).toBe(rows.length - 1);
      expect(m.parts.slice(0, 4).every((n, j) => n < 0.1 * m.parts[4 + (j % 2)]!)).toBe(true);
    } finally {
      db.close();
    }
  });
});

describe('a slot judged from its own series', () => {
  const doc = twoSourceDoc();
  const file = edrHistory();

  it('keeps the same slot of each day, named by its day, its parts placed in the day', () => {
    const sub = slotSeries(file, '2024-09-10T06');
    expect(sub.days.slice(0, 2)).toEqual(['2022-10-01', '2022-10-02']);
    expect(sub.days).toHaveLength(file.days.length / 4);
    expect(sub.parts).toEqual({ start: 360, width: 60 });
    expect(sub.hours[0]).toHaveLength(6);
    expect(sub.rows[1]).toBe(file.rows[5]);
    expect(sub.warmup).toBe(28);
    // A day's history is its own series.
    const day = emptyHistory({ flow: 'f', source: 's', settings: { checks: null, counted: [], followed: [], paired: [], time: null, zone: null, sample: 2000 }, columns: [], types: [], kinds: [] });
    expect(slotSeries(day, '2024-09-10')).toBe(day);
  });

  it('reads a value first seen in another slot of the day as seen before, not new', () => {
    const f = structuredClone(file);
    const vh = f.values.action!;
    // A value first seen in the 00–06 slot of the second day, and in its 06–12 slot after it.
    vh.values.push('"kernel"');
    vh.first.push(4);
    vh.last.push(5);
    vh.days.push(2);
    vh.rows.push(2);
    vh.counts = vh.counts!.map((r, k) => [...r, k === 4 || k === 5 ? 1 : 0]);
    vh.fresh.push([4, 1]);
    const sub = slotSeries(f, '2024-09-10T06');
    const i = sub.values.action!.values.indexOf('"kernel"');
    expect(sub.values.action!.first[i]).toBeLessThan(1);
    expect(sub.values.action!.first[i]).toBeGreaterThan(0);
    expect(sub.values.action!.last[i]).toBe(1);
    expect(sub.values.action!.fresh).toEqual([]);
    expect(slotSeries(f, '2024-09-10T00').values.action!.fresh).toContainEqual([1, 1]);
  });

  it('holds only the collector\'s outage over 2023 and 2024: a gap in the 06–12 slot, its hours named, the day\'s other slots calm', () => {
    const wrong: string[] = [];
    const outage: string[] = [];
    for (const at of ['T00', 'T06', 'T12', 'T18']) {
      const sub = slotSeries(file, `2024-01-01${at}`);
      const r = new HistoryRanges(sub, rangesFor(doc, 'edr'));
      for (const d of sub.days) {
        if (d < '2023-01-01') continue;
        const s = flowStory(r, d, doc, 'edr');
        if (s.state === 'wrong') wrong.push(`${d}${at} ${s.head}`);
        if (d === '2024-09-10') outage.push(`${at} ${s.state}`);
      }
    }
    expect(wrong).toEqual(['2024-09-10T06 Gap in endpoint events, 06:00–10:00']);
    expect(outage).toEqual(['T00 calm', 'T06 wrong', 'T12 calm', 'T18 calm']);
  }, 120_000);

  it('says the gap by the slot\'s hours, against what a slot like it has', () => {
    const sub = slotSeries(file, '2024-09-10T06');
    const r = new HistoryRanges(sub, rangesFor(doc, 'edr'));
    const k = sub.days.indexOf('2024-09-10');
    const f = hoursShort(r, k, r.of({ of: 'trips' })!.at('2024-09-10')!.expected, undefined, { noun: (n) => (n === 1 ? 'endpoint event' : 'endpoint events') })!;
    expect(f).toMatchObject({ title: 'Gap in endpoint events, 06:00–10:00', hours: { from: 0, to: 3, start: 360, width: 60 } });
    expect(f.detail).toMatch(/endpoint events from 06:00 to 10:00, where a slot like it has about [\d,]+\.$/);
  });

  it('tells a slot\'s claim/2 from its base, the slot of the load and its length, and judges it only as a load of that length', async () => {
    const base = edrHistory({ to: '2024-09-09T18' });
    const plan = await translate(doc, { day: '2024-09-10', slot: '2024-09-10T06' });
    const sub = slotSeries(file, '2024-09-10T06');
    const k = file.days.indexOf('2024-09-10T06');
    // The load as its measures would say it: the full history's period.
    const measures: Measures = {
      smaltflMeasures: 0, source: 'edr', slot: '2024-09-10T06', every: '6h', file: 'f'.repeat(64), snapshot: 'e'.repeat(64), checks: null,
      columns: file.columns, types: file.types, kinds: file.kinds, rows: file.rows[k]!, dropped: 0, failed: [], present: file.present[k]!, p50: file.p50[k]!, quantiles: file.quantiles[k]!, sample: 2000,
      parts: file.hours[k]!, values: Object.fromEntries(Object.entries(file.values).map(([c, vh]) => [c, vh.values.map((v, i): [string, number] => [v, vh.counts![k]![i]!]).filter(([, n]) => n > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1))])), pairs: {},
    };
    const settings = settingsFor(plan, 1, base)!;
    const ref = { path: 'edr-history.json', sha256: 'a'.repeat(64), bytes: 1 };
    const told = await loadClaim({ doc, source: 'edr', flow: plan.flow.hash, base, baseRef: ref, tail: [], measures, settings, skip: ['2024-09-09T06', '2024-09-09T12'], build: 'dev' });
    expect(told!.claim).toMatchObject({ v: 2, source: 'edr', slot: '2024-09-10T06', every: '6h', state: 'wrong', head: 'Gap in endpoint events, 06:00–10:00', below: true, skip: ['2024-09-09T06', '2024-09-09T12'] });
    // Told from the slot's own series, the day it left out the same slot's.
    expect(told!.ranges.file.parts).toEqual({ start: 360, width: 60 });
    expect(told!.ranges.recordedSkips).toEqual(['2024-09-09']);
    expect(sub.days.at(-1)).toBe('2024-12-31');
    // Judged by its watch: of a load of 6h, else not judged.
    const facts = { rows: () => measures.rows, pinned: () => ({ sha256: ref.sha256, bytes: ref.bytes }), measured: () => told!.claim.measured, flow: plan.flow.hash };
    const auth = { node: 0, unjudged: 'no claim for auth' };
    expect(judgeClaims(plan, [told!.claim], facts)).toEqual([auth, { node: 1, claim: told!.claim }]);
    const day: StoryClaim2 = { ...told!.claim, every: 'day' };
    expect(judgeClaims(plan, [day], facts)[1]).toEqual({ node: 1, unjudged: "the claim is of a load of day, and the watch's loads are of 6h" });
  });
});
