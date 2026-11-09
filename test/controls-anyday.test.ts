/**
 * The judges know no date (ADR 0013): the same flow, histories and engine as test/controls.test.ts, on another seed,
 * fewer applications, with trouble planted on other days, on other controls, of seven kinds, each told from the data
 * alone by the check it calls for, and every other day published. Nothing in src/ names a day, a control or a column:
 * what is found here is found by the watches the flow document declares, the histories built from the days before,
 * and the ontology's marks (`status` fail is bad, a new status is something wrong).
 *
 * The kinds, and the check each one exercises:
 * - data missing (the file has no rows): the amount, against a day like it;
 * - a column missing: the engine refuses the file against its declared columns, and the run fails saying so;
 * - a value never seen in a serious column: the new-value finding (and the checks, which drop it);
 * - a share that moved on its own (failures tripled): the value's share against its range;
 * - the amount doubled (every row twice): the amount;
 * - two columns of one control off together: the combination judge on the control's own pairs;
 * - two controls off together, each column's share as usual: the combination judge on the posture across them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { controlsWorld, holdsOn, type ControlsWorld } from './helpers/controls-world.js';
import type { Trouble } from './fixtures/controls.js';

// Other days, other controls, another seed, fewer applications: the same code.
const T = {
  missing: '2024-03-08',
  column: '2024-03-13',
  odd: '2024-03-15',
  flip: '2024-03-18',
  double: '2024-03-21',
  across: '2024-03-25',
  within: '2024-03-27',
} as const;
const TROUBLE: Trouble[] = [
  { day: T.missing, control: 'mfa', kind: 'missing' },
  { day: T.column, control: 'tls', kind: 'column', column: 'protocol' },
  { day: T.odd, control: 'logging', kind: 'odd', value: 'UNKNOWN', share: 0.25 },
  { day: T.flip, control: 'patching', kind: 'flip', by: 3 },
  { day: T.double, control: 'encryption', kind: 'double' },
  { day: T.across, control: 'patching', kind: 'across', other: 'mfa' },
  { day: T.within, control: 'backup', kind: 'within', column: 'restore_tested', value: 'no' },
];

let w: ControlsWorld;
beforeAll(async () => {
  w = await controlsWorld({ seed: 11, apps: 300, trouble: TROUBLE, baseFrom: '2024-01-01', baseTo: '2024-02-29', loadsTo: '2024-03-28' });
}, 600_000);
afterAll(() => w?.close());

describe('the same judges on another seed, other days and other controls (ADR 0013)', () => {
  it('holds the day a control’s file has no rows, by the amount, on that control and on the posture', () => {
    const r = w.result(T.missing);
    expect(holdsOn(r)).toEqual(['story:mfa', 'story:posture']);
    expect(r.holds.find((h) => h.origin === 'mfa')!.said).toMatch(/^Almost no apps: 0/);
    expect(r.holds.find((h) => h.origin === 'posture')!.said).toMatch(/^Mfa blank: all/);
  });

  it('refuses the day a control’s file lacks a column, naming the file and the count', () => {
    const r = w.results.get(T.column);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/tls_file: the header has 4 fields but 5 columns are declared/);
  });

  it('holds the day a quarter of a control’s statuses read a value never seen, by the new value and the checks', () => {
    const r = w.result(T.odd);
    expect(holdsOn(r)).toEqual(expect.arrayContaining(['checks:logging_checked', 'story:logging']));
    expect(r.holds.find((h) => h.origin === 'logging')!.said).toMatch(/^New status: UNKNOWN/);
  });

  it('holds the day a control’s failures triple, by the share that moved, on that control and the posture', () => {
    const r = w.result(T.flip);
    expect(holdsOn(r)).toEqual(['story:patching', 'story:posture']);
    expect(r.holds.find((h) => h.origin === 'patching')!.said).toMatch(/^status fail [\d.]+× usual$/);
    expect(r.holds.find((h) => h.origin === 'posture')!.said).toMatch(/^patching fail [\d.]+× usual$/);
  });

  it('holds the day a control’s rows arrive twice, by the amount, on that control and on the posture it fans out through', () => {
    const r = w.result(T.double);
    expect(holdsOn(r)).toEqual(['story:encryption', 'story:posture']);
    expect(r.holds.find((h) => h.origin === 'encryption')!.said).toMatch(/^More apps: 600 \(\+100%\)$/);
    // The join has two rows an application: the posture's amount doubles too, and says so.
    expect(r.holds.find((h) => h.origin === 'posture')!.said).toMatch(/^More apps: 600/);
  });

  it('holds the day two controls go together differently on the posture alone, by the combination', () => {
    const r = w.result(T.across);
    expect(holdsOn(r)).toEqual(['story:posture']);
    expect(r.holds[0]!.said).toMatch(/^mfa (fail with patching pass|pass with patching fail): \d+$/);
  });

  it('holds the day a control’s failures all land on one value of its other column, on that control alone', () => {
    const r = w.result(T.within);
    expect(holdsOn(r)).toEqual(['story:backup']);
    expect(r.holds[0]!.said).toMatch(/^status fail with restore_tested no: \d+$/);
  });

  it('publishes every other day of March: no false alarm on a calm day', () => {
    const planted = new Set<string>(Object.values(T));
    for (let day = '2024-03-01'; day <= '2024-03-28'; day = plusDays(day, 1)) {
      if (planted.has(day)) continue;
      expect(holdsOn(w.result(day)), day).toEqual([]);
      expect(w.result(day).published, day).toEqual(['by_control', 'by_unit', 'posture']);
    }
  });
});
