/**
 * The control estate through the engine (ADR 0014, the answer key), slice by slice. Each watch's history is built from
 * mid-December to the end of February, then March's loads arrive one a day, under the gates the notebooks write (TLS's
 * in full, the others their layer's defaults). What each planted day is told by is asserted here, and so is what this
 * slice still gets wrong against the key: those assertions are the next slices' vectors, and move when the slice
 * lands, as a decision, not a fix.
 *
 * Slice 1 (the gate, the defaults, the rule that written checks hold and learned ones warn unless the value is bad):
 * - the empty MFA file holds on the amount; the doubled TLS file and both scope days hold on the amount too (slice 3
 *   names scope); the WAF collapse holds by the bad value's share; the backup outage holds by the blanks its
 *   not-assessed rows leave; the refused logging file is a failed run (slice 7 makes it the schema check's hold);
 * - a learned finding that isn't a bad value publishes as unusual (not assessed up on key rotation, a day unlike any);
 * - still wrong against the key: the SLA look-alikes (vulnerabilities, pentests, access reviews) hold by the bad
 *   value `fail` rising, the DR problem holds for the same reason, and Patch Tuesday's `next_due` filling in holds
 *   the vulnerability file on its blanks; the contradiction day publishes (slice 2: due marks and bands; slice 3:
 *   needs and scope).
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
    expect(Object.keys(w.doc.gates!)).toEqual(['tls', 'posture', 'by_unit', 'by_control', 'by_type']);
    expect(w.doc.gates!.tls).toEqual({ layer: 'bronze', checks: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', shares: 'warn', pairs: 'warn', forest: 'warn', classifier: 'off' } });
    expect(w.doc.gates!.posture).toEqual({ layer: 'silver', checks: {} });
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

  it('holds the empty MFA file on the amount (bronze), and the posture on the blanks it leaves (silver, slice 3 attributes it)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.empty))).toEqual(['story:mfa', 'story:posture']);
    expect(said(ESTATE_PLANTED.empty, 'mfa')).toMatch(/^Almost no apps: 0/);
    expect(said(ESTATE_PLANTED.empty, 'posture')).toMatch(/^Mfa blank: all/);
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.empty, 1)))).toEqual([]);
  });

  it('refuses the day the logging file lacks a column (a failed run until slice 7)', () => {
    const r = w.results.get(ESTATE_PLANTED.column);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/logging_file: the header has 4 fields but 5 columns are declared/);
  });

  it('holds the WAF collapse by the bad value’s share, whatever the shares check does: a bad value is never softened', () => {
    expect(said(ESTATE_PLANTED.collapse, 'waf')).toMatch(/^status fail 1\d(\.\d)?× usual$/);
    expect(claim(ESTATE_PLANTED.collapse, 'waf')).toMatchObject({ state: 'wrong' });
  });

  it('holds the doubled TLS file and both scope days on the amount (slice 3 says scope)', () => {
    expect(said(ESTATE_PLANTED.double, 'tls')).toMatch(/^More apps: 406 \(\+100%\)$/);
    expect(said(ESTATE_PLANTED.scopeCreep, 'waf')).toMatch(/^More apps: 243 \(\+20%\)$/);
    expect(said(ESTATE_PLANTED.scopeLoss, 'tls')).toMatch(/^Fewer apps: 153 \(−25%\)$/);
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.scopeLoss, 1)))).toEqual([]);
  });

  it('holds the backup outage by the blanks its not-assessed rows leave, told from the not-assessed share (slice 2 says the band)', () => {
    expect(said(ESTATE_PLANTED.outage, 'backup')).toMatch(/^Status not_assessed: 4\d% \(usually/);
    expect(estateHolds(result(ESTATE_PLANTED.outage))).toContain('story:backup');
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.outage, 1)))).toEqual([]);
  });

  it('publishes a learned finding that isn’t a bad value as unusual: the gate’s rule', () => {
    // Not assessed up on key rotation, and a day unlike any on privileged access: told, not held.
    expect(claim('2024-03-02', 'key_rotation')).toMatchObject({ state: 'unusual' });
    expect(claim('2024-03-02', 'key_rotation')!.head).toMatch(/^Status not_assessed: 3\.0%/);
    expect(claim('2024-03-02', 'privileged_access')).toMatchObject({ state: 'unusual' });
    expect(claim('2024-03-02', 'privileged_access')!.head).toMatch(/^Unlike any day/);
    expect(estateHolds(result('2024-03-02'))).toEqual([]);
    expect(claim('2024-03-10', 'pentest')).toMatchObject({ state: 'unusual' });
    expect(estateHolds(result('2024-03-10'))).toEqual([]);
  });

  it('still holds the SLA look-alikes and the DR problem alike, by the bad value rising: slice 2’s vector (due marks)', () => {
    // The vulnerability due dates (Thu 14) and the pentests (Fri 15): the usual share late, told as something wrong.
    expect(said(plusDays(ESTATE_PLANTED.vulnCluster, 1), 'vuln_sla')).toMatch(/^status fail 4\.\d× usual$/);
    expect(said(plusDays(ESTATE_PLANTED.pentestCluster, 1), 'pentest')).toMatch(/^Status fail: 9\.9%$/);
    expect(said(plusDays(ESTATE_PLANTED.reviewCluster, 1), 'access_review')).toMatch(/^status fail 12\.5× usual$/);
    // The DR exercises (Fri 22): six in ten late, a real problem, held for the same reason as the look-alikes.
    expect(said(plusDays(ESTATE_PLANTED.drLate, 1), 'dr_exercise')).toMatch(/^New status: fail · 31 apps$/);
    expect(said(plusDays(ESTATE_PLANTED.drLate, 2), 'dr_exercise')).toMatch(/^Status fail: 3\d%$/);
    // Patch Tuesday fills next_due in on almost every row: the blanks check holds the file for three days.
    expect(said(ESTATE_PLANTED.collapse, 'vuln_sla')).toMatch(/^Next_due blank: 6\.\d% \(usually 43–89%\)$/);
    expect(said(ESTATE_PLANTED.vulnCluster, 'vuln_sla')).toMatch(/^Next_due blank: 6\.\d%/);
  });

  it('publishes the contradiction day: slice 3’s vector (needs)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.contradiction))).toEqual([]);
  });
});
