/**
 * The controls posture (ADR 0013, examples/controls/) through the engine: six controls, each its own daily file and its
 * own watch, and the posture across them a watched step, its claim told in the engine. Each watch's history is built
 * from the days before as the general builder builds it (a run of the flow a day for the posture), then the loads of
 * March 2024 arrive one a day, and each planted day is told by what went wrong, in the place that saw it:
 *
 * - a calm day publishes everything;
 * - the day the patching file is empty holds on patching (almost no rows) and on the posture (patching blank);
 * - the day the logging file lacks a column is refused by the engine, by the file's declared columns;
 * - the day MFA statuses read ERROR holds on MFA's checks and on its story (a value never seen), the posture seeing
 *   the dropped rows as blanks;
 * - the day backup failures all land on tested applications holds on backup alone, by the combination;
 * - the day every TLS failure passes encryption holds on the posture alone, by the combination across the two
 *   controls, each control's own watch quiet: the check nobody wrote.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument } from '../src/core/document.js';
import { translate, verifyRun } from '../src/index.js';
import { CONTROLS, PLANTED } from './fixtures/controls.js';
import { controlsWorld, holdsOn, WATCHES, type ControlsWorld } from './helpers/controls-world.js';
import { SMALTDB } from './helpers/engine.js';

let w: ControlsWorld;
beforeAll(async () => {
  w = await controlsWorld({ baseFrom: '2024-01-01', baseTo: '2024-02-29', loadsTo: '2024-03-22' });
}, 600_000);
afterAll(() => w?.close());
const result = (day: string) => w.result(day);

describe('the controls flow (ADR 0013)', () => {
  it('is a format-4 document that watches six sources and the posture step, and its histories keep pairs day by day', async () => {
    expect(validateDocument(w.doc)).toEqual([]);
    expect(Object.keys(w.doc.publish!.watch!)).toEqual([...WATCHES]);
    const plan = await translate(w.doc, { day: '2024-03-04' });
    expect(plan.smaltflPlan).toBe(3);
    expect(w.bases.posture!.columns).toEqual(['app_id', 'name', 'business_unit', 'environment', 'tier', 'tls', 'encryption', 'mfa', 'patching', 'logging', 'backup']);
    expect(Object.keys(w.bases.posture!.pairs)).toHaveLength(36);
    expect(w.bases.posture!.pairs['tls|encryption']!.counts).toHaveLength(60);
    expect(w.bases.backup!.pairs['status|restore_tested']!.counts).toHaveLength(60);
    expect(w.bases.tls!.step).toBe('tls_checked');
  });

  it('publishes a calm day, every watch judged, the posture’s claim told in the engine', () => {
    const r = result('2024-03-04');
    expect(r.holds).toEqual([]);
    expect(r.published).toEqual(['by_control', 'by_unit', 'posture']);
    expect(r.measures?.map((m) => `${m.source}:${m.rows}`)).toEqual([...CONTROLS.map((c) => `${c}:400`), 'posture:400']);
  });

  it('holds the day the patching file is empty on patching and on the posture, which sees the blanks', () => {
    const r = result(PLANTED.missing);
    expect(holdsOn(r)).toEqual(['story:patching', 'story:posture']);
    const patching = r.holds.find((h) => h.origin === 'patching')!;
    expect(patching.said).toMatch(/^Almost no apps: 0/);
    expect(patching.load).toMatchObject({ source: 'patching', slot: PLANTED.missing });
    const posture = r.holds.find((h) => h.origin === 'posture')!;
    expect(posture.said).toMatch(/^Patching blank: all/);
    expect(posture.claim).toMatchObject({ v: 2, source: 'posture', slot: PLANTED.missing, state: 'wrong', rows: 400 });
    expect(r.published).toEqual([]);
  });

  it('refuses the day the logging file lacks a column, by the file’s declared columns', () => {
    const r = w.results.get(PLANTED.column);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/logging_file: the header has 3 fields but 4 columns are declared/);
  });

  it('holds the day MFA statuses read ERROR on MFA’s checks and its story, a value never seen', () => {
    const r = result(PLANTED.odd);
    expect(holdsOn(r)).toEqual(expect.arrayContaining(['checks:mfa_checked', 'story:mfa']));
    expect(r.holds.find((h) => h.by === 'checks')!.said).toMatch(/^dropped 1\d\d of 400 rows \(\d+\.\d+%\), more than the 5% allowed$/);
    expect(r.holds.find((h) => h.origin === 'mfa')!.said).toMatch(/^New status: ERROR/);
    // The posture sees the dropped rows as blanks: told, on the posture, as what it is.
    expect(r.holds.find((h) => h.origin === 'posture')?.said).toMatch(/^Mfa blank: \d\d% \(never before\)$/);
  });

  it('holds the day backup failures all land on tested applications on backup alone, by the combination', () => {
    const r = result(PLANTED.within);
    expect(holdsOn(r)).toEqual(['story:backup']);
    const h = r.holds[0]!;
    expect(h.said).toMatch(/^status fail with restore_tested yes: \d+$/);
    expect(h.load).toMatchObject({ source: 'backup', slot: PLANTED.within });
  });

  it('holds the day every TLS failure passes encryption on the posture alone, by the combination across the controls', async () => {
    const r = result(PLANTED.across);
    expect(holdsOn(r)).toEqual(['story:posture']);
    const h = r.holds[0]!;
    // The two cells that rose moved alike (every cell of a two-by-two table moves by the same amount): the rarer is named.
    expect(h.said).toMatch(/^tls (fail with encryption pass|pass with encryption fail): \d+$/);
    expect(h.claim).toMatchObject({ v: 2, source: 'posture', slot: PLANTED.across, state: 'wrong' });
    expect(h.load).toMatchObject({ source: 'posture', slot: PLANTED.across });
    // Each control's own share is as usual that day: no control holds, and nothing it builds from is off.
    const verified = await verifyRun(w.db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'rerun' });
    expect(verified.ok, JSON.stringify(verified.checks.filter((c) => !c.ok))).toBe(true);
  });

  it('publishes the other days of March', () => {
    for (let day = '2024-03-01'; day <= '2024-03-22'; day = plusDays(day, 1)) {
      if ((Object.values(PLANTED) as string[]).includes(day)) continue;
      const r = result(day);
      expect(holdsOn(r), day).toEqual([]);
    }
  });
});
