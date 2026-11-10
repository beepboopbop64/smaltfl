/**
 * Discovered checks (ADR 0013): a combination that moved while each column's share stayed as usual is found from the
 * history alone (`comboNews`), told by the cell that moved and held as something wrong; a day unlike every day before
 * it is found by the isolation forest (`unlikeNews`) with the numbers that set it apart; calm days raise neither; and
 * a history keeps a pair's cells day by day only while they are few.
 */
import { describe, expect, it } from 'vitest';
import { comboNews, dayFeatures, unlikeNews } from '../src/core/combos.js';
import { plusDays } from '../src/core/calendar.js';
import { HistoryRanges, comboPlaces, seriesOf } from '../src/core/history.js';
import { appendPeriods, emptyHistory, PAIR_CELLS, type Measures } from '../src/core/measures.js';
import { MATERIAL, materialFor, newsOf, type Names } from '../src/core/news.js';
import { random } from '../src/core/quality.js';
import { storyOf } from '../src/core/story.js';

/**
 * Applications and two controls, a day at a time: `apps` rows, each passing or failing TLS and encryption. On an
 * ordinary day a tenth fail TLS and a fifth fail encryption, and the two go together (half of the TLS failures also
 * fail encryption, twice the rate of the rest). On a `swap` day the association flips while both shares stay: every app
 * failing TLS passes encryption, and as many TLS passers fail encryption instead. On a `tilt` day TLS failures double
 * and encryption failures halve, each column moving on its own, the association as usual.
 */
function controlsDay(day: string, apps: number, kind: 'calm' | 'swap' | 'tilt' | 'empty', rnd: () => number): Measures {
  const tlsFail = kind === 'tilt' ? 0.2 : 0.1;
  const encFail = kind === 'tilt' ? 0.1 : 0.2;
  // Among TLS failures, the encryption failure rate; among passers, what keeps the encryption share.
  const withinFail = kind === 'swap' ? 0 : Math.min(1, encFail * 2.5);
  const withinPass = (encFail - tlsFail * withinFail) / (1 - tlsFail);
  const cells = { ff: 0, fp: 0, pf: 0, pp: 0 };
  const n = kind === 'empty' ? 0 : apps;
  for (let i = 0; i < n; i++) {
    const f = rnd() < tlsFail;
    const e = rnd() < (f ? withinFail : withinPass);
    cells[f ? (e ? 'ff' : 'fp') : e ? 'pf' : 'pp']++;
  }
  const tls = ([['"fail"', cells.ff + cells.fp], ['"pass"', cells.pf + cells.pp]] as [string, number][]).filter(([, x]) => x > 0);
  const enc = ([['"fail"', cells.ff + cells.pf], ['"pass"', cells.fp + cells.pp]] as [string, number][]).filter(([, x]) => x > 0);
  const pair: [string, number][] = ([['["fail","fail"]', cells.ff], ['["fail","pass"]', cells.fp], ['["pass","fail"]', cells.pf], ['["pass","pass"]', cells.pp]] as [string, number][]).filter(([, x]) => x > 0);
  return {
    smaltflMeasures: 0, source: 'posture', slot: day, every: 'day', file: null, snapshot: 'c'.repeat(64), checks: null,
    columns: ['app_id', 'tls', 'encryption'], types: ['text', 'text', 'text'], kinds: ['category', 'code', 'code'],
    rows: n, dropped: 0, failed: [], present: [n, n, n], p50: [null, null, null], quantiles: [null, null, null], sample: 2000, parts: [],
    values: { tls, encryption: enc }, pairs: { 'tls|encryption': pair },
  };
}

const SETTINGS = { checks: null, counted: ['tls', 'encryption'], followed: [], paired: ['tls', 'encryption'], time: null, zone: null, sample: 2000 };
const names: Names = { column: (c) => (c === 'tls' ? 'TLS' : c === 'encryption' ? 'Encryption' : c), value: (_c, v) => String(v), label: (_c, v) => (v === 'fail' ? 'Fail' : v === 'pass' ? 'Pass' : String(v)), noun: (n) => (n === 1 ? 'app' : 'apps') };

/** A history of `days` days from Jan 2, 2024, calm but for the days named. */
function postureHistory(days: number, planted: Record<string, 'swap' | 'tilt' | 'empty'> = {}) {
  const rnd = random(5);
  const ms: Measures[] = [];
  for (let d = '2024-01-02', i = 0; i < days; d = plusDays(d, 1), i++) ms.push(controlsDay(d, 400, planted[d] ?? 'calm', rnd));
  const base = emptyHistory({ flow: 'controls', source: 'posture', settings: SETTINGS, columns: ms[0]!.columns, types: ms[0]!.types, kinds: ms[0]!.kinds, warmup: 14 });
  return appendPeriods(base, ms);
}

const ranges = (file: ReturnType<typeof postureHistory>) => new HistoryRanges(file, { pattern: 'none', echoes: true });
const M = materialFor(400, 'volume');
const opts = { names, M, label: (c: string, key: string) => names.label!(c, JSON.parse(key)), noun: names.noun! };

describe('a history keeps a pair’s cells day by day (ADR 0013 §1)', () => {
  it('counts each cell each period, and the combo series is the cell’s log odds ratio', () => {
    const file = postureHistory(40);
    expect(file.pairs['tls|encryption']!.counts).toHaveLength(40);
    const places = comboPlaces(file, 'tls|encryption', '["fail","fail"]')!;
    expect(places).not.toBeNull();
    const s = seriesOf(file, { of: 'combo', pair: 'tls|encryption', value: '["fail","fail"]' })!;
    // Half of the TLS failures also fail encryption, a sixth of the passers: odds of about five to one, as a log.
    const mid = s.values.filter((v): v is number => v !== null);
    expect(mid.length).toBe(40);
    const mean = mid.reduce((a, b) => a + b, 0) / mid.length;
    expect(mean).toBeGreaterThan(Math.log(3));
    expect(mean).toBeLessThan(Math.log(9));
  });

  it('stops keeping a pair’s cells past PAIR_CELLS combinations, for good', () => {
    const base = emptyHistory({ flow: 'f', source: 's', settings: { ...SETTINGS, counted: ['a', 'b'], paired: ['a', 'b'] }, columns: ['a', 'b'], types: ['int', 'int'], kinds: ['code', 'code'] });
    const wide = (day: string, n: number): Measures => ({
      smaltflMeasures: 0, source: 's', slot: day, every: 'day', file: null, snapshot: 'd'.repeat(64), checks: null, columns: ['a', 'b'], types: ['int', 'int'], kinds: ['code', 'code'],
      rows: n, dropped: 0, failed: [], present: [n, n], p50: [null, null], quantiles: [null, null], sample: 2000, parts: [],
      values: { a: Array.from({ length: Math.ceil(Math.sqrt(n)) }, (_, i): [string, number] => [String(i), 1]), b: [['0', n]] },
      pairs: { 'a|b': Array.from({ length: n }, (_, i): [string, number] => [`[${i},0]`, 1]) },
    });
    const few = appendPeriods(base, [wide('2024-01-01', PAIR_CELLS)]);
    expect(few.pairs['a|b']!.counts).toHaveLength(1);
    const many = appendPeriods(few, [wide('2024-01-02', PAIR_CELLS + 1)]);
    expect(many.pairs['a|b']!.counts).toBeUndefined();
    expect(many.pairs['a|b']!.values).toHaveLength(PAIR_CELLS + 1);
    expect(appendPeriods(many, [wide('2024-01-03', 3)]).pairs['a|b']!.counts).toBeUndefined();
  });
});

describe('the combination judge (ADR 0013 §2)', () => {
  const SWAP = '2024-03-20';
  const TILT = '2024-03-25';
  const file = postureHistory(90, { [SWAP]: 'swap', [TILT]: 'tilt' });
  const h = ranges(file);

  it('finds the day the association flipped while each column’s share stayed, names the cell and holds the day', () => {
    const found = comboNews(h, SWAP, opts);
    expect(found).toHaveLength(1);
    const f = found[0]!;
    expect(f.kind).toBe('combo');
    expect(f.severity).toBe('alert');
    expect(f.columns).toEqual(['tls', 'encryption']);
    // The combination seen more than usual: TLS failures now all passing encryption.
    expect(f.values).toEqual(['["fail","pass"]']);
    expect(f.title).toMatch(/^TLS Fail with Encryption Pass: \d+ \(usually ~\d+\)$/);
    expect(f.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(f.detail.split(/\s+/).length).toBeLessThanOrEqual(20);
    // Neither column's own share is out of range that day: only the combination says anything.
    const news = newsOf(h, SWAP, names, { judge: { legacy: false, calendar: h.calendar, scale: 'volume', bad: new Map(), serious: new Set(), after: new Map(), pattern: 'none', relearn: false, checks: null, expect: new Map(), due: [], needs: [], reconcile: null } });
    expect(news.filter((x) => x.kind === 'share' || x.kind === 'gone' || x.kind === 'volume')).toEqual([]);
    expect(news.find((x) => x.kind === 'combo')).toBeDefined();
    const story = storyOf(h, SWAP, news, { names, judge: { legacy: false, calendar: h.calendar, scale: 'volume', bad: new Map(), serious: new Set(), after: new Map(), pattern: 'none', relearn: false, checks: null, expect: new Map(), due: [], needs: [], reconcile: null } });
    expect(story.state).toBe('wrong');
    expect(story.head).toContain('TLS Fail with Encryption Pass');
  });

  it('says nothing of the combination when each column moved on its own, the association as usual', () => {
    expect(comboNews(h, TILT, opts).filter((f) => f.severity !== 'note')).toEqual([]);
    const news = newsOf(h, TILT, names, { judge: { legacy: false, calendar: h.calendar, scale: 'volume', bad: new Map(), serious: new Set(), after: new Map(), pattern: 'none', relearn: false, checks: null, expect: new Map(), due: [], needs: [], reconcile: null } });
    expect(news.filter((x) => x.kind === 'share').map((x) => x.columns![0])).toContain('tls');
  });

  it('raises nothing on the calm days around them', () => {
    for (const day of ['2024-03-18', '2024-03-19', '2024-03-21', '2024-03-22', '2024-03-27', '2024-03-29']) expect(comboNews(h, day, opts).filter((f) => f.severity !== 'note')).toEqual([]);
  });
});

describe('the forest day judge (ADR 0013 §3)', () => {
  const SWAP = '2024-03-20';
  const file = postureHistory(90, { [SWAP]: 'swap' });
  const h = ranges(file);

  it('reads a day by its values’ shares and its pairs’ larger cells’ excess', () => {
    const features = dayFeatures(h, opts);
    expect(features.map((f) => f.columns)).toEqual([['tls'], ['tls'], ['encryption'], ['encryption'], ['tls', 'encryption'], ['tls', 'encryption'], ['tls', 'encryption'], ['tls', 'encryption']]);
    const k = file.days.indexOf(SWAP);
    expect(features[0]!.at(k)).toBeCloseTo(0.9, 1);
  });

  it('sets the flipped day apart from every day before it, by the pair’s cells, and never a calm day', () => {
    const found = unlikeNews(h, SWAP, opts);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe('unlike');
    expect(found[0]!.severity).toBe('warn');
    expect(found[0]!.title).toMatch(/^Unlike any day: TLS (Fail|Pass) with Encryption (Fail|Pass)$/);
    expect(found[0]!.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(found[0]!.detail.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(found[0]!.columns).toEqual(['tls', 'encryption']);
    expect(found[0]!.unlike).toMatchObject({ days: 64 });
    expect(found[0]!.unlike!.score).toBeGreaterThan(found[0]!.unlike!.highest);
    expect(found[0]!.unlike!.numbers[0]).toMatch(/together (more|less) than usual \(odds [\d.]+×, usually [\d.]+×\)$/);
    for (const day of ['2024-03-15', '2024-03-18', '2024-03-19', '2024-03-21', '2024-03-26', '2024-03-31']) expect(unlikeNews(h, day, opts)).toEqual([]);
  });

  it('needs 28 learned days before it says anything', () => {
    const short = ranges(postureHistory(40, { '2024-02-09': 'swap' }));
    expect(unlikeNews(short, '2024-02-09', opts)).toEqual([]);
  });
});

describe('what the floors are', () => {
  it('names the combination floors', () => {
    expect(MATERIAL.comboUnusual).toBe(0.02);
    expect(MATERIAL.comboWrong).toBe(0.05);
  });
});
