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
 *   names scope); the refused logging file is a failed run until slice 7 makes it the schema check's hold;
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
 * Slice 5 (gold's reconciliation and the seal):
 * - the posture reconciles with the inventory (one row an application): the doubled TLS file holds the posture on its
 *   own rule beside TLS's amount, as the key has it, and nothing upstream explains a written rule away;
 * - each gold summary is reconciled by its key (by unit with the posture's units) on every run, kept in the manifest,
 *   clean on every day, and verify counts it again.
 * Slice 7 (a refused file as the schema check's hold):
 * - the day the logging file lacks a column is a held run, not a failed one: the file is recorded as refused, nothing
 *   is built, the hold says "file has 4 of 5 columns", verify finds the manifest coherent, and the next day publishes.
 * - still wrong against the key: the pentest cluster holds by the bad value and the DR problem by the new value,
 *   since with two and a half months of history neither control has had twenty due dates for the due check to
 *   learn from (the app's year of history judges both; the test's base is short for speed). The seal itself is the
 *   app's: the owner's signature on a run whose gates passed.
 * ADR 0015 §1 (the ontology says what a dataset's rows are):
 * - every control's rows are one an application, for the applications the ontology's `rows` selects: the scope of all
 *   twelve is counted (ten had none), and each file is held to its key. TLS's and the WAF's gate cells no longer write
 *   a scope. The calm days count nothing out of scope and no key twice, on every control.
 * - two rows of the answer key moved on purpose (the ADR's "What moves on the estate"): the empty MFA file keeps its
 *   head, the amount, and the scope's 600 applications with no row follow from it; the doubled TLS file is led by its
 *   key, "203 apps repeat a key" (it was the amount, "More apps: 406 (+100%)"), and the amount follows from the key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument } from '../src/core/document.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { planKind } from '../src/core/manifest.js';
import { flowStory, reconcileSaid } from '../src/core/hold.js';
import { translate, verifyRun } from '../src/index.js';
import { appliesTo, ESTATE_CONTROLS, ESTATE_PLANTED } from './fixtures/estate.js';
import { SMALTDB } from './helpers/engine.js';
import { ESTATE_WATCHES, estateHolds, estateWorld, type EstateWorld } from './helpers/estate-world.js';

let w: EstateWorld;
beforeAll(async () => {
  w = await estateWorld({ baseFrom: '2023-12-15', baseTo: '2024-02-29', loadsTo: '2024-03-31' });
}, 900_000);
afterAll(() => w?.close());
const result = (day: string) => w.result(day);
const said = (day: string, origin: string) => result(day).holds.find((h) => h.origin === origin)?.said ?? null;
const claim = (day: string, source: string) => w.claims.get(day)?.[source] ?? null;
/** A control's story of a day as the page told its claim: its findings, each with its tier and what it follows from. */
const story = (day: string, source: string) => flowStory(w.ranges.get(day)![source]!, day, w.doc, source);

describe('the estate flow under its gates (ADR 0014 slice 1)', () => {
  it('is plan/4: TLS’s gate as written, every other watch its layer’s defaults, the outputs gold', async () => {
    expect(validateDocument(w.doc)).toEqual([]);
    expect(Object.keys(w.doc.publish!.watch!)).toEqual([...ESTATE_WATCHES]);
    expect(Object.keys(w.doc.gates!)).toEqual(['tls', 'waf', 'posture', 'by_unit', 'by_control', 'by_type']);
    // Moved on purpose by ADR 0015 §1: both cells wrote scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" };
    // the ontology's rows say which applications a control covers now, so neither cell writes a scope.
    expect(w.doc.gates!.tls).toEqual({ layer: 'bronze', checks: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', shares: 'warn', pairs: 'warn', forest: 'warn', classifier: 'off' } });
    expect(w.doc.gates!.waf).toEqual({ layer: 'bronze', checks: {} });
    expect(w.doc.gates!.posture).toEqual({ layer: 'silver', checks: { reconcile: 'hold' }, needs: [{ when: { key_rotation: 'pass' }, then: { encryption: ['pass', 'exception', 'not_assessed'] } }], reconcile: { key: ['app_id'], of: 'apps' } });
    expect(w.doc.gates!.by_unit).toEqual({ layer: 'gold', checks: {}, reconcile: { key: ['business_unit'], of: 'posture' } });
    expect(w.doc.gates!.by_control).toEqual({ layer: 'gold', checks: {}, reconcile: { key: ['control'] } });
    const plan = await translate(w.doc, { day: '2024-03-04' });
    expect(planKind(plan)).toBe('plan/4');
    const checks = Object.fromEntries((plan.publish as { watch: [number, { checks: Record<string, string> }][] }).watch.map(([n, x]) => [plan.nodes[n]!.origin, x.checks]));
    expect(checks.tls).toEqual({ ...LAYER_DEFAULTS.bronze, classifier: 'off' });
    expect(checks.mfa).toEqual(LAYER_DEFAULTS.bronze);
    expect(checks.posture).toEqual({ ...LAYER_DEFAULTS.silver, reconcile: 'hold' });
  });

  it('ties every control’s rows to the application by the ontology: its scope and its key in the plan, the key held at bronze (ADR 0015 §1)', async () => {
    expect(w.doc.ontology!.objectTypes).toMatchObject([{ id: 'application', dataset: 'apps', key: ['app_id'] }]);
    expect(w.doc.ontology!.rows!.map((r) => r.dataset)).toEqual([...ESTATE_CONTROLS]);
    const plan = await translate(w.doc, { day: '2024-03-04' });
    const watch = Object.fromEntries((plan.publish as unknown as { watch: [number, { checks: Record<string, string>; scope: unknown; reconcile: unknown }][] }).watch.map(([n, x]) => [plan.nodes[n]!.origin, x]));
    const where: Record<string, string> = {
      tls: `"internet_facing" IN ('yes')`, waf: `"internet_facing" IN ('yes')`, pentest: `"criticality" IN ('critical', 'high') AND "internet_facing" IN ('yes')`,
      encryption: `"datastore" IN ('yes')`, key_rotation: `"data_class" IN ('pci', 'pii') AND "datastore" IN ('yes')`, backup: `"datastore" IN ('yes')`,
      dr_exercise: `"criticality" IN ('critical')`, vuln_sla: `"lifecycle" IN ('active')`, mfa: '1 = 1', access_review: `"data_class" IN ('pci', 'pii')`,
      logging: `"lifecycle" IN ('active')`, privileged_access: `"criticality" IN ('critical', 'high')`,
    };
    for (const c of ESTATE_CONTROLS) {
      expect(watch[c]!.scope, c).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: where[c] });
      expect(watch[c]!.reconcile, c).toEqual({ key: ['app_id'], table: null });
      expect(watch[c]!.checks.scope, c).toBe('hold');
      expect(watch[c]!.checks.reconcile, c).toBe('hold');
    }
    // The posture's rules are its gate cell's, as they were.
    expect(watch.posture!.scope).toBeNull();
    expect(watch.posture!.reconcile).toEqual({ key: ['app_id'], table: 'apps_file' });
  });

  it('counts nothing out of scope and no key twice on every control, every calm day: the history’s and March’s (ADR 0015)', () => {
    const inScope = Object.fromEntries(ESTATE_CONTROLS.map((c) => [c, w.apps.filter((a) => appliesTo(c, a)).length]));
    expect(inScope).toMatchObject({ tls: 203, waf: 203, mfa: 600 });
    for (const c of ESTATE_CONTROLS) {
      const n = inScope[c]!;
      const g = w.bases[c]!.gate!;
      expect(g.scope!.out.every((x) => x === 0) && g.scope!.missing.every((x) => x === 0) && g.scope!.inScope.every((x) => x === n), `${c}: the history's scope`).toBe(true);
      expect(g.reconcile!.every((r) => r.rows === n && r.keys === n && r.blank === 0 && r.missing === 0 && r.extra === 0), `${c}: the history's key`).toBe(true);
      expect(g.scope!.out).toHaveLength(w.bases[c]!.days.length);
    }
    // March: every control every day, but the four days planted on its scope or its rows (the day the logging file is
    // refused has no measures at all).
    const planted: Record<string, { scope: [number, number]; rows: number; keys: number }> = {
      [`${ESTATE_PLANTED.empty} mfa`]: { scope: [0, 600], rows: 0, keys: 0 },
      [`${ESTATE_PLANTED.scopeCreep} waf`]: { scope: [40, 0], rows: 243, keys: 243 },
      [`${ESTATE_PLANTED.double} tls`]: { scope: [0, 0], rows: 406, keys: 203 },
      [`${ESTATE_PLANTED.scopeLoss} tls`]: { scope: [0, 50], rows: 153, keys: 153 },
    };
    let measured = 0;
    for (let day = '2024-03-01'; day <= '2024-03-31'; day = plusDays(day, 1)) {
      for (const c of ESTATE_CONTROLS) {
        const m = w.measures.get(day)?.[c];
        if (!m) {
          expect(`${day} ${c}`).toBe(`${ESTATE_PLANTED.column} logging`);
          continue;
        }
        measured++;
        const n = inScope[c]!;
        const p = planted[`${day} ${c}`] ?? { scope: [0, 0], rows: n, keys: n };
        expect(m.gate, `${day} ${c}`).toEqual({ scope: { out: p.scope[0], missing: p.scope[1], inScope: n }, reconcile: { rows: p.rows, keys: p.keys, blank: 0, missing: 0, extra: 0 } });
      }
    }
    expect(measured).toBe(31 * 12 - 1);
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
    // Moved on purpose by ADR 0015 ("What moves on the estate"): MFA covers every application, so the empty file also
    // counts 600 in scope with no row. The head is the same: an amount that is almost none leads, and the scope's
    // missing applications follow from it (before, MFA had no scope and the day had the amount alone).
    const s = story(ESTATE_PLANTED.empty, 'mfa');
    expect(s.head).toBe(said(ESTATE_PLANTED.empty, 'mfa'));
    expect(s.hero).toBe('amount');
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'cause', severity: 'alert' });
    expect(s.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ title: '600 in scope with no app', tier: 'follows', because: 'volume', was: 'alert', check: 'scope' });
    expect(s.findings.some((f) => f.kind === 'reconcile')).toBe(false);
  });

  it('holds the day the logging file lacks a column under the schema check, nothing built, and verifies it (slice 7)', async () => {
    const r = result(ESTATE_PLANTED.column);
    expect(estateHolds(r)).toEqual(['checks:logging']);
    expect(said(ESTATE_PLANTED.column, 'logging')).toBe('file has 4 of 5 columns');
    expect(r.published).toEqual([]);
    expect(r.manifest.outputs).toEqual({});
    expect(r.manifest.nodes.find((n) => n.origin === 'logging')).toMatchObject({ status: 'refused', key: '' });
    expect(r.manifest.nodes.every((n) => n.op === 'table')).toBe(true);
    // No claim could be told of the file, and the posture wasn't built: neither is "not judged"; the refusal holds alone.
    expect(claim(ESTATE_PLANTED.column, 'logging')).toBeNull();
    const v = await verifyRun(w.db, r.run, { smaltdb: SMALTDB, level: 'rerun', manifest: r.hash });
    expect(v.ok).toBe(true);
    expect(v.checks.find((c) => c.check === 'held')!.note).toBe('held by logging (its checks)');
    // The next day reads the file again (it is the contradiction day, held by the posture's rule, not by the file).
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.column, 1)))).not.toContain('checks:logging');
    expect(result(plusDays(ESTATE_PLANTED.column, 1)).manifest.nodes.find((n) => n.origin === 'logging')!.status).toBe('built');
  }, 120_000);

  it('holds the WAF collapse on its written band, said with the band (slice 2)', () => {
    expect(said(ESTATE_PLANTED.collapse, 'waf')).toBe('Status fail: 59.6% (band 0%–15%)');
    expect(claim(ESTATE_PLANTED.collapse, 'waf')).toMatchObject({ state: 'wrong' });
    // Patch Tuesday fills next_due in on almost every row: a due-marked column's blanks are nothing due, not a finding.
    expect(said(ESTATE_PLANTED.collapse, 'vuln_sla')).toBeNull();
    expect(said(ESTATE_PLANTED.vulnCluster, 'vuln_sla')).toBeNull();
  });

  it('holds the doubled TLS file on its key, the amount following from it, and the posture on its reconciliation with the inventory (slices 3, 5; ADR 0015)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.double))).toEqual(['story:posture', 'story:tls']);
    // Moved on purpose by ADR 0015 ("What moves on the estate"): this was /^More apps: 406 \(\+100%\)$/, the amount.
    // TLS's rows are one an application, so the file is held to its key: the key leads and the amount follows from it.
    expect(said(ESTATE_PLANTED.double, 'tls')).toBe('203 apps repeat a key');
    const s = story(ESTATE_PLANTED.double, 'tls');
    expect(s.findings.find((f) => f.key === 'reconcile:repeats')).toMatchObject({ tier: 'standalone', severity: 'alert', check: 'reconcile', detail: '406 rows for 203 app_id values: 2 rows a key, where one is expected.' });
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ title: 'More apps: 406 (+100%)', tier: 'follows', because: 'reconcile:repeats', was: 'alert' });
    expect(s.findings.some((f) => f.kind === 'scope')).toBe(false);
    // The fan-out is the TLS file's doing, and the posture's own written rule says so too: a rule a wrong source can't explain away.
    expect(said(ESTATE_PLANTED.double, 'posture')).toBe('203 apps repeat a key');
    expect(claim(ESTATE_PLANTED.double, 'posture')).toBeNull();
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.double, 1)))).toEqual([]);
  });

  it('reconciles each gold summary by its key on every run, kept in the manifest, clean every day; verify counts it again (slice 5)', async () => {
    for (let day = '2024-03-01'; day <= '2024-03-31'; day = plusDays(day, 1)) {
      const r = w.results.get(day);
      // The day a file was refused built nothing: no gate to count (slice 7).
      if (!r || r instanceof Error || r.manifest.nodes.some((n) => n.status === 'refused')) continue;
      const gold = r.manifest.nodes.filter((n) => n.gate);
      expect(gold.map((n) => n.origin).sort(), day).toEqual(['by_control', 'by_type', 'by_unit']);
      for (const n of gold) {
        const g = w.doc.gates![n.origin]!.reconcile!;
        expect(reconcileSaid(n.gate!.reconcile, g.key, g.of ?? null), `${day} ${n.origin}`).toBeNull();
        expect(n.gate!.reconcile.rows, `${day} ${n.origin}`).toBeGreaterThan(0);
      }
      expect(r.holds.some((h) => h.by === 'checks'), day).toBe(false);
    }
    const calm = result('2024-03-06');
    const v = await verifyRun(w.db, calm.run, { smaltdb: SMALTDB, level: 'rerun', manifest: calm.hash });
    expect(v.ok).toBe(true);
    expect(v.checks.filter((c) => c.check === 'gate').map((c) => [c.origin, c.ok])).toEqual([['by_unit', true], ['by_control', true], ['by_type', true]]);
  }, 120_000);

  it('holds both scope days on the scope rule, said with the rows and the keys (slice 3), the scope now the ontology’s (ADR 0015)', () => {
    expect(estateHolds(result(ESTATE_PLANTED.scopeCreep))).toEqual(['story:waf']);
    expect(said(ESTATE_PLANTED.scopeCreep, 'waf')).toBe('40 apps out of scope');
    expect(said(ESTATE_PLANTED.scopeLoss, 'tls')).toBe('50 in scope with no app');
    expect(estateHolds(result(plusDays(ESTATE_PLANTED.scopeLoss, 1)))).toEqual([]);
    // A file short of a unit is not an amount that is almost none: the scope leads it, as before.
    expect(story(ESTATE_PLANTED.scopeLoss, 'tls').findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'standalone', severity: 'alert' });
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
