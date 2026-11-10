/**
 * The control estate through the engine (ADR 0014, the answer key), slice by slice. Each watch's history is built from
 * mid-December to the end of February, then March's loads arrive one a day, under the gates the notebooks write (TLS's
 * in full, the others their layer's defaults) and the ontology's marks (a band on not-assessed everywhere and on WAF's
 * failures; a due mark on next_due). What each planted day is told by is asserted here, and so is what this slice
 * still gets wrong against the key: those assertions are the next slices' vectors, and move when the slice lands, as
 * a decision, not a fix.
 *
 * Slice 1 (the gate, the defaults, the rule that written checks hold and learned ones warn unless the value is bad):
 * - the empty MFA file holds on the amount; the doubled TLS file and both scope days hold on the amount too (slice 3
 *   names scope); the refused logging file is a failed run (slice 7 makes it the schema check's hold);
 * - a learned finding that isn't a bad value publishes as unusual.
 * Slice 2 (bands and due marks):
 * - the WAF collapse and the backup outage hold on their bands, said with the band;
 * - the vulnerability and access-review clusters publish: the miss is the due check's, and the pass share's fall is
 *   unusual at most; Patch Tuesday's next_due filling in is no longer a finding;
 * Slice 3 (scope and dependency rules, upstream attribution):
 * - the contradiction holds on the posture's dependency; the scope days hold on the WAF's and TLS's scope rule;
 * - the posture no longer repeats a control's finding as its own: a column named for a source is the source's to judge,
 *   and a wrong source explains the step's day.
 * Slice 4 (the kept sample and the classifier):
 * - every watch has a sample of its last eight weeks beside its history; the classifier holds nothing, is quiet on the
 *   look-alike days and the calm days, and speaks as unusual where a day's rows are unlike the like days' (the
 *   vulnerability file on Patch Tuesday, when the month's findings land).
 * - still wrong against the key: the pentest cluster holds by the bad value and the DR problem by the new value,
 *   since with two and a half months of history neither control has had twenty due dates for the due check to
 *   learn from (the app's year of history judges both; the test's base is short for speed); the refused file is a
 *   failed run (slice 7); nothing is sealed (slice 5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument } from '../src/core/document.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { planKind } from '../src/core/manifest.js';
import { translate } from '../src/index.js';
import { ESTATE_PLANTED } from './fixtures/estate.js';
import { ESTATE_WATCHES, estateHolds, estateWorld, type EstateWorld } from './helpers/estate-world.js';

let w: EstateWorld;
beforeAll(async () => {
  w = await estateWorld({ baseFrom: '2023-12-15', baseTo: '2024-02-29', loadsTo: '2024-03-31' });
}, 900_000);
afterAll(() => w?.close());
const result = (day: string) => w.result(day);
const said = (day: string, origin: string) => result(day).holds.find((h) => h.origin === origin)?.said ?? null;
const claim = (day: string, source: string) => w.claims.get(day)?.[source] ?? null;

describe('the estate flow under its gates (ADR 0014 slice 1)', () => {
  it('is plan/4: TLS’s gate as written, every other watch its layer’s defaults, the outputs gold', async () => {
    expect(validateDocument(w.doc)).toEqual([]);
    expect(Object.keys(w.doc.publish!.watch!)).toEqual([...ESTATE_WATCHES]);
    expect(Object.keys(w.doc.gates!)).toEqual(['tls', 'waf', 'posture', 'by_unit', 'by_control', 'by_type']);
    expect(w.doc.gates!.tls).toEqual({ layer: 'bronze', checks: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', shares: 'warn', pairs: 'warn', forest: 'warn', classifier: 'off' }, scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" } });
    expect(w.doc.gates!.waf).toEqual({ layer: 'bronze', checks: {}, scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" } });
    expect(w.doc.gates!.posture).toEqual({ layer: 'silver', checks: {}, needs: [{ when: { key_rotation: 'pass' }, then: { encryption: ['pass', 'exception', 'not_assessed'] } }] });
    expect(w.doc.gates!.by_unit).toEqual({ layer: 'gold', checks: {} });
    const plan = await translate(w.doc, { day: '2024-03-04' });
    expect(planKind(plan)).toBe('plan/4');
    const checks = Object.fromEntries((plan.publish as { watch: [number, { checks: Record<string, string> }][] }).watch.map(([n, x]) => [plan.nodes[n]!.origin, x.checks]));
    expect(checks.tls).toEqual({ ...LAYER_DEFAULTS.bronze, classifier: 'off' });
    expect(checks.mfa).toEqual(LAYER_DEFAULTS.bronze);
    expect(checks.posture).toEqual(LAYER_DEFAULTS.silver);
  });

  it('publishes the calm days, every watch judged', () => {
    for (const day of ['2024-03-01', '2024-03-03', '2024-03-06', '2024-03-11', '2024-03-20', '2024-03-22', '2024-03-27', '2024-03-28']) {
      expect(estateHolds(result(day)), day).toEqual([]);
      expect(result(day).published, day).toEqual(['by_control', 'by_type', 'by_unit', 'posture']);
    }
  });

  it('holds the empty MFA file on the amount (bronze); the posture’s blank column is MFA’s to tell (slice 3)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.empty))).toEqual(['story:mfa']);
    expect(said(ESTATE_PLANTED.empty, 'mfa')).toMatch(/^Almost no apps: 0/);
    expect(result(ESTATE_PLANTED.empty).published).toEqual([]);
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.empty, 1)))).toEqual([]);
  });

  it('refuses the day the logging file lacks a column (a failed run until slice 7)', () => {
    const r = w.results.get(ESTATE_PLANTED.column);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/logging_file: the header has 4 fields but 5 columns are declared/);
  });

  it('holds the WAF collapse on its written band, said with the band (slice 2)', () => {
    expect(said(ESTATE_PLANTED.collapse, 'waf')).toBe('Status fail: 59.6% (band 0%–15%)');
    expect(claim(ESTATE_PLANTED.collapse, 'waf')).toMatchObject({ state: 'wrong' });
    // Patch Tuesday fills next_due in on almost every row: a due-marked column's blanks are nothing due, not a finding.
    expect(said(ESTATE_PLANTED.collapse, 'vuln_sla')).toBeNull();
    expect(said(ESTATE_PLANTED.vulnCluster, 'vuln_sla')).toBeNull();
  });

  it('holds the doubled TLS file on the amount, and the TLS file alone: the posture’s fan-out follows from it (slice 3)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.double))).toEqual(['story:tls']);
    expect(said(ESTATE_PLANTED.double, 'tls')).toMatch(/^More apps: 406 \(\+100%\)$/);
  });

  it('holds both scope days on the scope rule, said with the rows and the keys (slice 3)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.scopeCreep))).toEqual(['story:waf']);
    expect(said(ESTATE_PLANTED.scopeCreep, 'waf')).toBe('40 apps out of scope');
    expect(said(ESTATE_PLANTED.scopeLoss, 'tls')).toBe('50 in scope with no app');
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.scopeLoss, 1)))).toEqual([]);
  });

  it('holds the backup outage on the not-assessed band every control shares (slice 2)', () => {
    expect(said(ESTATE_PLANTED.outage, 'backup')).toBe('Status not_assessed: 47.9% (band 0%–5%)');
    expect(estateHolds(result(ESTATE_PLANTED.outage))).toContain('story:backup');
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.outage, 1)))).toEqual([]);
  });

  it('publishes a learned finding that isn’t a bad value as unusual: the gate’s rule', () => {
    // Blanks up on key rotation (its not-assessed rows, inside their band), and a day unlike any on privileged access:
    // told, not held.
    expect(claim('2024-03-02', 'key_rotation')).toMatchObject({ state: 'unusual' });
    expect(claim('2024-03-02', 'key_rotation')!.head).toMatch(/^Key_age_days blank: 3\.0%/);
    expect(claim('2024-03-02', 'privileged_access')).toMatchObject({ state: 'unusual' });
    expect(claim('2024-03-02', 'privileged_access')!.head).toMatch(/^Unlike any day/);
    expect(estateHolds(result('2024-03-02'))).toEqual([]);
    expect(claim('2024-03-10', 'pentest')).toMatchObject({ state: 'unusual' });
    expect(estateHolds(result('2024-03-10'))).toEqual([]);
  });

  it('publishes the vulnerability and access-review clusters: the miss is the due check’s, the pass share’s fall unusual at most (slice 2)', () => {
    for (const day of [plusDays(ESTATE_PLANTED.vulnCluster, 1), plusDays(ESTATE_PLANTED.vulnCluster, 2), plusDays(ESTATE_PLANTED.reviewCluster, 1), plusDays(ESTATE_PLANTED.reviewCluster, 2)]) {
      const source = day < '2024-03-20' ? 'vuln_sla' : 'access_review';
      expect(said(day, source), day).toBeNull();
      expect(claim(day, source), day).toMatchObject({ state: 'unusual' });
      expect(claim(day, source)!.head, day).toMatch(/^Status pass: 8\d% \(usually/);
    }
  });

  it('still holds the pentest cluster by the bad value and the DR problem by the new value: too few due dates in a short base for the due check (the app’s year learns them)', () => {
    expect(said(plusDays(ESTATE_PLANTED.pentestCluster, 1), 'pentest')).toMatch(/^Status fail: 9\.9%$/);
    expect(said(plusDays(ESTATE_PLANTED.drLate, 1), 'dr_exercise')).toMatch(/^New status: fail · 31 apps$/);
    expect(said(plusDays(ESTATE_PLANTED.drLate, 2), 'dr_exercise')).toMatch(/^Rto_met no: 2\d%$/);
    // What a control's file says is the control's to tell (slice 3): the posture holds on none of these days.
    for (const day of [plusDays(ESTATE_PLANTED.vulnCluster, 1), plusDays(ESTATE_PLANTED.pentestCluster, 1), plusDays(ESTATE_PLANTED.reviewCluster, 1), plusDays(ESTATE_PLANTED.drLate, 1)]) expect(said(day, 'posture'), day).toBeNull();
  });

  it('keeps a sample of every watch, and the classifier warns where a day’s rows are unlike the like days’ but never holds (slice 4)', () => {
    for (const id of ESTATE_WATCHES) {
      expect(w.samples[id]!.days.length, id).toBeGreaterThanOrEqual(50);
      expect(w.samples[id]!.rows.at(-1)!.length, id).toBeGreaterThan(0);
      expect(w.samples[id]!.rows.at(-1)!.length, id).toBeLessThanOrEqual(id === 'posture' ? 600 : 200);
    }
    for (let day = '2024-03-01'; day <= '2024-03-31'; day = plusDays(day, 1)) {
      const r = w.results.get(day);
      if (!r || r instanceof Error) continue;
      expect(r.holds.some((h) => h.said.startsWith('Rows unlike')), day).toBe(false);
    }
    // Patch Tuesday: the month's findings land, and the vulnerability file's rows are unlike the month before's.
    expect(claim(ESTATE_PLANTED.collapse, 'vuln_sla')).toMatchObject({ state: 'unusual' });
    expect(claim(ESTATE_PLANTED.collapse, 'vuln_sla')!.head).toMatch(/^Rows unlike earlier days: AUC 0\.[78]\d$/);
    // The look-alike days and the calm days: no word from it.
    for (const [day, source] of [[plusDays(ESTATE_PLANTED.vulnCluster, 1), 'vuln_sla'], [plusDays(ESTATE_PLANTED.pentestCluster, 1), 'pentest'], ['2024-03-06', 'tls'], ['2024-03-20', 'backup'], ['2024-03-28', 'posture']] as const) {
      const c = claim(day, source);
      expect(c?.head ?? '', `${source} ${day}`).not.toMatch(/^Rows unlike/);
    }
  });

  it('holds the contradiction day on the posture’s dependency rule alone, said with the rule (slice 3)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.contradiction))).toEqual(['story:posture']);
    expect(said(ESTATE_PLANTED.contradiction, 'posture')).toBe('41 apps: key_rotation pass needs encryption pass/exception/not_assessed');
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.contradiction, 1)))).toEqual([]);
  });
});
