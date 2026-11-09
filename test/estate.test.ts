/**
 * The control estate (test/fixtures/estate.ts): what the dataset is, asserted from the generator alone. No judge is
 * asserted here: what the flow says of these days is the next ADR's question. These tests hold the dataset to its
 * promises, so that question is asked of honest data:
 *
 * - the inventory is typed, and each control covers only the applications it applies to, by type;
 * - statuses are four words; exceptions stand; a few rows a day are not assessed;
 * - the dependency the contradiction day breaks (key rotation needs encryption at rest) holds on every other day;
 * - the SLA controls flip the day after their due dates cluster, by the usual share running late, in the history as
 *   in the loads; the DR day is the one where more than usual run late;
 * - each planted day holds the trouble it says, and nothing else is planted on it.
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { appliesTo, DEPENDS, ESTATE_CONTROLS, ESTATE_PLANTED, ESTATE_TROUBLE, estateApps, estateRows, patchTuesday, type EstateApp, type EstateControl } from './fixtures/estate.js';

const apps = estateApps();
const rows = (c: EstateControl, day: string, o = {}) => estateRows(c, day, apps, o);
const statuses = (c: EstateControl, day: string, o = {}) => {
  const { columns, rows: rs } = rows(c, day, o);
  const at = columns.indexOf('status');
  return new Map(rs.map((r) => [String(r[0]), String(r[at])]));
};
const failShare = (c: EstateControl, day: string) => {
  const st = [...statuses(c, day).values()];
  return st.filter((s) => s === 'fail').length / Math.max(1, st.length);
};
const planted = new Set<string>(Object.values(ESTATE_PLANTED));
const CALM = ['2024-02-13', '2024-02-20', '2024-02-27', '2024-03-05', '2024-03-11', '2024-03-18'];

describe('the inventory and what each control covers', () => {
  it('types six hundred applications, a third internet-facing, a sixth critical, two in five with regulated data', () => {
    expect(apps).toHaveLength(600);
    const share = (f: (a: EstateApp) => boolean) => apps.filter(f).length / apps.length;
    expect(share((a) => a.internet_facing === 'yes')).toBeGreaterThan(0.28);
    expect(share((a) => a.internet_facing === 'yes')).toBeLessThan(0.4);
    expect(share((a) => a.criticality === 'critical')).toBeGreaterThan(0.1);
    expect(share((a) => a.criticality === 'critical')).toBeLessThan(0.2);
    expect(share((a) => a.data_class === 'pii' || a.data_class === 'pci')).toBeGreaterThan(0.35);
    expect(share((a) => a.lifecycle === 'retiring')).toBeLessThan(0.15);
  });

  it('writes a row only for the applications a control applies to, by type, every day', () => {
    for (const day of CALM) {
      for (const c of ESTATE_CONTROLS) {
        const ids = [...statuses(c, day).keys()];
        expect(ids, `${c} ${day}`).toEqual(apps.filter((a) => appliesTo(c, a)).map((a) => a.app_id));
      }
    }
    expect(statuses('tls', CALM[0]!).size).toBeLessThan(statuses('mfa', CALM[0]!).size);
    expect(statuses('dr_exercise', CALM[0]!).size).toBe(apps.filter((a) => a.criticality === 'critical').length);
  });

  it('uses four status words, keeps exceptions standing, and leaves a few rows a day not assessed', () => {
    const words = new Set<string>();
    for (const c of ESTATE_CONTROLS) for (const s of statuses(c, CALM[1]!).values()) words.add(s);
    expect([...words].sort()).toEqual(['exception', 'fail', 'not_assessed', 'pass']);
    const a = statuses('encryption', CALM[0]!);
    const b = statuses('encryption', CALM[2]!);
    const exceptions = [...a].filter(([, s]) => s === 'exception').map(([id]) => id);
    expect(exceptions.length).toBeGreaterThan(5);
    for (const id of exceptions) expect(b.get(id)).toBe('exception');
    const na = [...a.values()].filter((s) => s === 'not_assessed').length;
    expect(na).toBeGreaterThan(0);
    expect(na).toBeLessThan(a.size * 0.03);
  });
});

describe('the dependency between controls', () => {
  const violations = (day: string) => {
    const e = statuses('encryption', day);
    const k = statuses('key_rotation', day);
    return [...k].filter(([id, s]) => s === 'pass' && e.get(id) === 'fail').length;
  };

  it('key rotation needs encryption at rest, and the rule holds every calm day', () => {
    expect(DEPENDS.key_rotation).toBe('encryption');
    for (const day of CALM) expect(violations(day), day).toBe(0);
  });

  it('breaks the rule on the contradiction day only, keeping key rotation’s own count of failures', () => {
    const before = [...statuses('key_rotation', plusDays(ESTATE_PLANTED.contradiction, -1)).values()].filter((s) => s === 'fail').length;
    const on = [...statuses('key_rotation', ESTATE_PLANTED.contradiction).values()].filter((s) => s === 'fail').length;
    expect(violations(ESTATE_PLANTED.contradiction)).toBeGreaterThan(25);
    expect(Math.abs(on - before)).toBeLessThan(10);
    expect(violations(plusDays(ESTATE_PLANTED.contradiction, 1))).toBe(0);
  });
});

describe('the SLA controls: a status from dates', () => {
  it('flips the day after a due date cluster, by the usual share running late, and settles again', () => {
    // Vulnerabilities due thirty days after February's Patch Tuesday: failures jump from a few percent to about one
    // in seven, then ease as the late ones are fixed.
    const due = plusDays(patchTuesday(2024, 2), 30);
    expect(due).toBe(ESTATE_PLANTED.vulnCluster);
    expect(failShare('vuln_sla', due)).toBeLessThan(0.05);
    expect(failShare('vuln_sla', plusDays(due, 1))).toBeGreaterThan(0.1);
    expect(failShare('vuln_sla', plusDays(due, 1))).toBeLessThan(0.25);
    expect(failShare('vuln_sla', plusDays(due, 14))).toBeLessThan(failShare('vuln_sla', plusDays(due, 1)));
    // Half the yearly pentests due the same day, one in five late: from none failing to about one in ten.
    expect(failShare('pentest', ESTATE_PLANTED.pentestCluster)).toBeLessThan(0.02);
    expect(failShare('pentest', plusDays(ESTATE_PLANTED.pentestCluster, 1))).toBeGreaterThan(0.06);
    expect(failShare('pentest', plusDays(ESTATE_PLANTED.pentestCluster, 1))).toBeLessThan(0.16);
    // Quarterly access reviews due at the quarter's end.
    expect(failShare('access_review', ESTATE_PLANTED.reviewCluster)).toBeLessThan(0.03);
    expect(failShare('access_review', plusDays(ESTATE_PLANTED.reviewCluster, 1))).toBeGreaterThan(0.05);
  });

  it('has the same clusters a year and a quarter earlier, so a history can learn them', () => {
    expect(failShare('pentest', '2023-03-14')).toBeLessThan(0.02);
    expect(failShare('pentest', '2023-03-20')).toBeGreaterThan(0.02);
    expect(failShare('access_review', '2023-06-30')).toBeLessThan(0.03);
    expect(failShare('access_review', '2023-07-01')).toBeGreaterThan(0.04);
    // The monthly sawtooth: low before each month's due date, high the week after.
    for (const [y, m] of [[2023, 9], [2023, 10], [2023, 11]] as const) {
      const due = plusDays(patchTuesday(y, m), 30);
      expect(failShare('vuln_sla', due), due).toBeLessThan(failShare('vuln_sla', plusDays(due, 2)));
    }
  });

  it('plants one SLA day that is a real problem: six in ten DR exercises late, against one in ten', () => {
    expect(failShare('dr_exercise', ESTATE_PLANTED.drLate)).toBeLessThan(0.03);
    expect(failShare('dr_exercise', plusDays(ESTATE_PLANTED.drLate, 1))).toBeGreaterThan(0.3);
    // The same cluster a year before ran late at the usual rate: a handful failed.
    expect(failShare('dr_exercise', '2023-03-23')).toBeLessThan(0.06);
  });

  it('carries the dates a reader needs: due dates and what is overdue', () => {
    const { columns, rows: rs } = rows('vuln_sla', plusDays(ESTATE_PLANTED.vulnCluster, 1));
    const st = columns.indexOf('status');
    const od = columns.indexOf('overdue');
    const nd = columns.indexOf('next_due');
    for (const r of rs) {
      if (r[st] === 'fail') expect(Number(r[od])).toBeGreaterThan(0);
      if (r[st] === 'pass') expect(Number(r[od] ?? 0)).toBe(0);
    }
    expect(rs.some((r) => r[nd] === plusDays(patchTuesday(2024, 3), 30))).toBe(true);
    const dr = rows('dr_exercise', '2024-03-20');
    expect(dr.rows.filter((r) => r[dr.columns.indexOf('next_due')] === ESTATE_PLANTED.drLate).length).toBeGreaterThan(40);
  });
});

describe('the planted days', () => {
  it('plants each kind where it says, and nothing on the other days', () => {
    const byDay = new Map<string, string[]>();
    for (const t of ESTATE_TROUBLE) byDay.set(t.day, [...(byDay.get(t.day) ?? []), `${t.kind}:${t.control}`]);
    expect([...byDay.keys()].sort()).toEqual([ESTATE_PLANTED.empty, ESTATE_PLANTED.column, ESTATE_PLANTED.contradiction, ESTATE_PLANTED.collapse, ESTATE_PLANTED.scopeCreep, ESTATE_PLANTED.outage, ESTATE_PLANTED.double, ESTATE_PLANTED.drLate, ESTATE_PLANTED.scopeLoss].sort());
    for (const list of byDay.values()) expect(list).toHaveLength(1);
  });

  it('the obvious: no rows, a column missing, a collapse, an outage, rows twice', () => {
    expect(rows('mfa', ESTATE_PLANTED.empty).rows).toEqual([]);
    expect(rows('logging', ESTATE_PLANTED.column).columns).toEqual(['app_id', 'sink', 'coverage_pct', 'status']);
    expect(failShare('waf', ESTATE_PLANTED.collapse)).toBeGreaterThan(0.5);
    expect(failShare('waf', plusDays(ESTATE_PLANTED.collapse, 1))).toBeLessThan(0.1);
    const na = [...statuses('backup', ESTATE_PLANTED.outage).values()].filter((s) => s === 'not_assessed').length;
    expect(na / statuses('backup', ESTATE_PLANTED.outage).size).toBeGreaterThan(0.4);
    expect(rows('tls', ESTATE_PLANTED.double).rows).toHaveLength(2 * statuses('tls', CALM[0]!).size);
  });

  it('the scope: rows for applications the control doesn’t apply to, and none for one business unit', () => {
    const creep = [...statuses('waf', ESTATE_PLANTED.scopeCreep).keys()].filter((id) => !appliesTo('waf', apps.find((a) => a.app_id === id)!));
    expect(creep).toHaveLength(40);
    const loss = statuses('tls', ESTATE_PLANTED.scopeLoss);
    expect([...loss.keys()].some((id) => apps.find((a) => a.app_id === id)!.business_unit === 'Payments')).toBe(false);
    expect(loss.size).toBeLessThan(statuses('tls', CALM[0]!).size);
  });

  it('plants nothing with incidents off, and keeps every column on every calm day', () => {
    expect(rows('mfa', ESTATE_PLANTED.empty, { incidents: false }).rows.length).toBe(600);
    for (const c of ESTATE_CONTROLS) for (const day of [...CALM, ...planted].filter((d) => !(c === 'logging' && d === ESTATE_PLANTED.column))) expect(rows(c, day).columns.length, `${c} ${day}`).toBe(rows(c, CALM[0]!).columns.length);
  });
});
