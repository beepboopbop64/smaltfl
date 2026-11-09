/**
 * Several watched sources, each with its own cadence, through the engine (ADR 0010 §7, B20; integration test I16): the
 * sign-ins loaded once a day and endpoint events every 6 hours (variant E), each run starting when a load arrives.
 *
 * - Only the off file's slot pauses (the owner, Q-55): with `together: false`, outputs that don't read the held load
 *   still publish, and the next slot publishes edr's outputs again.
 * - A daily load held at its 08:00 run is carried across later runs, citing the run that first held it, and decided
 *   once: each later run that carries it is released by the same decision.
 * - A release cites a decision for each load holding what it names; it never moves a name back past a later load.
 * - The 06–12 slot filled per load from the same slot of another day, released, and verified.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { FlowRecord } from '../src/app/record.js';
import { auditBag, type EngineHolds, type EngineName, type EngineRelease } from '../src/core/audit.js';
import { buildBag, type BagFile } from '../src/core/bag.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { withoutDisplay } from '../src/core/document.js';
import { heldOutputs, inputsOf, loadsOf, stagedKeys, type DecideAbout, type HeldAbout, type Load, type ReleaseAbout } from '../src/core/hold.js';
import { entryLeaf, type JSONValue } from '../src/core/log.js';
import { policiesHash, type RunManifest } from '../src/core/manifest.js';
import { flowHash, type FlowPlan } from '../src/core/plan.js';
import { repairDocument, type Repair } from '../src/core/fill.js';
import { sha256Hex, utf8 } from '../src/core/hash.js';
import { loadClaim, tailPath, type StoryClaim2 } from '../src/core/hold.js';
import { tailFromRecord } from '../src/core/retell.js';
import { tailRef } from '../src/core/measures.js';
import { installFakeIndexedDB } from './helpers/fake-idb.js';
import { settingsFor, tailBefore, type Measures } from '../src/core/measures.js';
import { measureLoad, pinFile, releaseRun, runFlow, translate, verifyRun, type FlowDocument, type ReleaseInput, type RunResult } from '../src/index.js';
import { EDR_COLUMNS, edrHistory, edrRows, edrSlots, securityDays, securityRows, SIGNIN_COLUMNS, twoSourceDoc } from './fixtures/security.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const EDR_SCALE = 0.05;
const AUTH_SCALE = 0.005;
const BASE_TO = '2024-09-08T18';
const LEAF = 'd'.repeat(64);
const edrPlans = new Map(edrSlots({ scale: EDR_SCALE }).filter((p) => p.slot > BASE_TO && p.slot < '2024-09-11').map((p) => [p.slot, p]));
const authPlans = new Map(securityDays({ edr: true }).filter((p) => p.day >= '2024-09-09' && p.day <= '2024-09-10').map((p) => [p.day, p]));

/** A day's sign-ins, a tenth of their results unknown when `broken` (the checks drop them: more than the 5% allowed). */
function authRows(day: string, broken: boolean): (string | number | null)[][] {
  const rows = securityRows(authPlans.get(day)!, AUTH_SCALE);
  return broken ? rows.map((r, i) => (i % 10 === 0 ? [r[0]!, 'unknown', ...r.slice(2)] : r)) : rows;
}

function fill(db: Database, table: string, columns: readonly string[], rows: readonly (readonly (string | number | null)[])[]): void {
  db.exec(`DELETE FROM ${table}`);
  db.exec('BEGIN');
  const t = db.prepare(`INSERT INTO ${table} VALUES (${columns.map(() => '?').join(', ')})`);
  for (const r of rows) t.run(r as (string | number | null)[]);
  db.exec('COMMIT');
}

interface World {
  db: Database;
  doc: FlowDocument;
  /** The flow's record, when the world keeps one (`record`): each run kept as the app keeps it. */
  rec: FlowRecord | null;
  /** Runs a load's arrival: the day's sign-ins and the slot's endpoint events, each claim told from its base and its
   * tail, the slots the record left out named. */
  arrive(day: string, slot: string, o?: { broken?: boolean; skip?: string[] }): Promise<RunResult & { claims: StoryClaim2[] }>;
  /** The donor slot loaded into the donor's table, and its claim/2. */
  donor(slot: string): Promise<StoryClaim2>;
}

/** edr's base to Sep 8 (a twentieth of the fixture's volume), its tail measured slot by slot as each run would. */
async function world(record = false): Promise<World> {
  const db = openEngine();
  const doc = { ...twoSourceDoc(), ...(record ? { id: `signins-edr-${Math.random().toString(36).slice(2)}` } : {}) };
  const rec = record ? await FlowRecord.open(doc.id) : null;
  if (rec) await rec.append('flow', 'owner', { before: null, after: await flowHash(doc), doc: await rec.keep('flow', withoutDisplay(doc)) });
  db.exec(`CREATE TABLE auth_file(event_time TEXT, result TEXT, method TEXT, country TEXT, ua_family TEXT, latency_ms REAL, user TEXT)`);
  db.exec(`CREATE TABLE edr_file(${EDR_COLUMNS.map((c) => `${c} TEXT`).join(', ')})`);
  db.exec(`CREATE TABLE edr_file_donor(${EDR_COLUMNS.map((c) => `${c} TEXT`).join(', ')})`);
  const base = edrHistory({ scale: EDR_SCALE, to: BASE_TO });
  const bytes = utf8(JSON.stringify(base));
  const baseRef = { path: 'edr-history.json', sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
  await pinFile(db, baseRef.path, bytes, baseRef.sha256);
  const edrTail: Measures[] = [];
  const authTail: Measures[] = [];
  const params = (day: string, slot: string) => ({ day, slot });
  // Sep 9's four slots, measured as their runs would have measured them.
  for (const slot of [...edrPlans.keys()].filter((s) => s < '2024-09-10')) {
    fill(db, 'edr_file', EDR_COLUMNS, edrRows(edrPlans.get(slot)!));
    edrTail.push(await measureLoad(db, 'edr_file', settingsFor(await translate(doc, params('2024-09-09', slot)), 1, base, doc.steps)!));
  }
  const pinTails = async () => {
    for (const [source, t] of [['auth', authTail], ['edr', edrTail]] as const) await pinFile(db, tailPath(source), utf8(canonicalJSON(tailBefore(t, '9999') as unknown as Parameters<typeof canonicalJSON>[0])));
  };
  const arrive = async (day: string, slot: string, o: { broken?: boolean; skip?: string[] } = {}) => {
    fill(db, 'auth_file', SIGNIN_COLUMNS, authRows(day, !!o.broken));
    fill(db, 'edr_file', EDR_COLUMNS, edrRows(edrPlans.get(slot)!));
    const plan = await translate(doc, params(day, slot));
    const authSettings = settingsFor(plan, 0, null, doc.steps)!;
    const edrSettings = settingsFor(plan, 1, base, doc.steps)!;
    const authM = await measureLoad(db, 'auth_file', authSettings);
    const edrM = await measureLoad(db, 'edr_file', edrSettings);
    await pinTails();
    const a = await loadClaim({ doc, source: 'auth', flow: plan.flow.hash, base: null, baseRef: null, tail: authTail, measures: authM, settings: authSettings, skip: [], build: 'dev' });
    const e = await loadClaim({ doc, source: 'edr', flow: plan.flow.hash, base, baseRef, tail: edrTail, measures: edrM, settings: edrSettings, skip: o.skip ?? [], build: 'dev' });
    const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: params(day, slot), claims: [a!.claim, e!.claim], ...(rec ? { log: rec.head() } : {}) });
    if (rec) await keep(db, rec, plan, r);
    // What arrived joins each source's tail, once a slot (C5).
    if (!authTail.some((m) => m.slot === day)) authTail.push(authM);
    if (!edrTail.some((m) => m.slot === slot)) edrTail.push(edrM);
    return { ...r, claims: [a!.claim, e!.claim] };
  };
  const donor = async (slot: string) => {
    fill(db, 'edr_file_donor', EDR_COLUMNS, edrRows(edrPlans.get(slot)!));
    const plan = await translate(doc, params(slot.slice(0, 10), slot));
    const settings = settingsFor(plan, 1, base, doc.steps)!;
    const told = await loadClaim({ doc, source: 'edr', flow: plan.flow.hash, base, baseRef, tail: edrTail, measures: await measureLoad(db, 'edr_file_donor', settings), settings, skip: [], build: 'dev' });
    return { ...told!.claim, source: 'edr_donor' };
  };
  return { db, doc, rec, arrive, donor };
}

/** A run kept in the record as the app keeps one: its manifest and plan by hash, its loads, and, held, what held it. */
async function keep(db: Database, rec: FlowRecord, plan: FlowPlan, r: RunResult) {
  const blob = await rec.keep('manifest', r.manifest);
  const row = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [r.manifest.plan]).rows[0]!;
  const planBlob = await rec.keep('plan', JSON.parse(String(row[0])));
  const loads = [...loadsOf(plan, r.manifest).values()];
  const base = { run: r.run, manifest: r.hash, blob, plan: planBlob, load: null, files: [], day: String(r.manifest.parameters.day), inputs: inputsOf(r.manifest) as unknown as JSONValue, loads: loads as unknown as JSONValue, ...(r.measures ? { measures: r.measures as unknown as JSONValue } : {}) };
  if (r.holds.length === 0) return rec.append('run', 'owner', { ...base, outcome: 'ok' });
  const keys = stagedKeys(r.manifest, heldOutputs(JSON.parse(String(row[0])) as FlowPlan, r.holds));
  const held: Omit<HeldAbout, 'run' | 'manifest' | 'outcome' | 'day' | 'inputs' | 'loads'> = { holds: r.holds, waiting: r.waiting, keys };
  return rec.append('run', 'owner', { ...base, ...(held as unknown as Record<string, JSONValue>), outcome: 'held' });
}

const enc = new TextEncoder();
/** A bag as the app's export makes one: the record, its blobs, what the engine names, and each dataset's proof. */
async function bagOf(db: Database, rec: FlowRecord): Promise<BagFile[]> {
  const head = rec.head();
  const names = (await db.callPlugin('smaltfl', 'names', [])) as { datasets: EngineName[]; releases: EngineRelease[]; holds: EngineHolds[] };
  const lines = rec.entries.map((e) => canonicalJSON(e as never));
  const payload: BagFile[] = [
    { path: 'record/entries.jsonl', bytes: enc.encode(lines.join('\n') + '\n') },
    { path: 'record/checkpoints.jsonl', bytes: enc.encode(rec.checkpoints.map((c) => JSON.stringify(c)).join('\n') + '\n') },
    { path: 'record/card.json', bytes: enc.encode(JSON.stringify(rec.identity.card)) },
    ...(await rec.blobs()).map((b) => ({ path: `blobs/${b.kind}-${b.hash}.json`, bytes: enc.encode(b.json) })),
    ...db.query('SELECT hash, plan FROM _smaltfl_plans').rows.map(([h, p]) => ({ path: `engine/plans/${String(h)}.json`, bytes: enc.encode(String(p)) })),
    ...db.query('SELECT hash, doc FROM _smaltfl_flows').rows.map(([h, d]) => ({ path: `engine/flows/${String(h)}.json`, bytes: enc.encode(String(d)) })),
    ...db.query('SELECT id, hash, manifest FROM _smaltfl_runs').rows.map(([id, h, m]) => ({ path: `engine/runs/${String(id)}-${String(h)}.json`, bytes: enc.encode(String(m)) })),
    { path: 'engine/datasets.json', bytes: enc.encode(JSON.stringify(names.datasets)) },
    { path: 'engine/releases.json', bytes: enc.encode(JSON.stringify(names.releases)) },
    { path: 'engine/holds.json', bytes: enc.encode(JSON.stringify(names.holds)) },
  ];
  for (const d of names.datasets) {
    const runEntry = [...rec.entries].reverse().find((e) => e.kind === 'run' && (e.about as { manifest?: string }).manifest === d.manifest)!;
    const m = JSON.parse(String(db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [d.run]).rows[0]![0])) as RunManifest;
    const releaseEntry = d.release === null ? undefined : [...rec.entries].reverse().find((e) => e.kind === 'release' && (e.about as unknown as ReleaseAbout).manifest === d.manifest && (e.about as unknown as ReleaseAbout).outputs[d.name] === d.key);
    const entry = releaseEntry ?? runEntry;
    payload.push({ path: `proofs/${d.name}.json`, bytes: enc.encode(JSON.stringify({ dataset: d.name, ...m.outputs[d.name], run: d.run, manifest: d.manifest, entry, inclusion: rec.proofOf(entry.seq, head.size) })) });
  }
  return buildBag({ name: 'smaltfl-audit-loads', payload, info: [['External-Identifier', `${head.origin} ${head.size} ${head.root}`]], date: '2026-11-09' });
}

const keysOf = (r: RunResult, names: readonly string[]) => Object.fromEntries(names.map((n) => [n, r.manifest.outputs[n]!.key]));
const said = (r: RunResult) => r.holds.map((h) => [h.by, h.origin, h.load ? `${h.load.source} ${h.load.slot}` : null, h.carried ?? null]);
const fails = (v: Awaited<ReturnType<typeof verifyRun>>) => v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}${c.note ? ` (${c.note})` : ''}`);
const loadOf = (r: RunResult, source: string) => r.holds.find((h) => h.load?.source === source)!.load!;

describe('two watched sources, each with its own cadence (I16, Q-55)', () => {
  it('pauses only the off slot, carries a held day across later runs, and decides it once', async () => {
    const { db, arrive } = await world();
    try {
      // 06:00: edr's 00–06 arrives, beside yesterday's sign-ins (not judged yet: they have no history, and publish).
      const a = await arrive('2024-09-09', '2024-09-10T00');
      expect(said(a)).toEqual([]);
      expect(a.published).toEqual(['auth_results', 'auth_valid', 'edr_actions', 'edr_hosts_signing_in']);
      // 08:00: today's sign-ins arrive, a tenth of them unknown: their checks hold their load, and only what reads them.
      const b = await arrive('2024-09-10', '2024-09-10T00', { broken: true });
      expect(said(b)).toEqual([['checks', 'auth_valid', 'auth 2024-09-10', null]]);
      expect(b.published).toEqual(['edr_actions']);
      expect(b.waiting).toEqual(['auth_results', 'auth_valid', 'edr_hosts_signing_in']);
      // 12:00: edr's 06–12, the collector down 06:00–10:00: its slot held; the sign-ins carried, citing the 08:00 run.
      const c = await arrive('2024-09-10', '2024-09-10T06', { broken: true });
      expect(said(c)).toEqual([['checks', 'auth_valid', 'auth 2024-09-10', b.run], ['story', 'edr', 'edr 2024-09-10T06', null]]);
      expect(c.holds.find((h) => h.by === 'story')!.said).toBe('Gap in endpoint events, 06:00–10:00');
      expect(c.published).toEqual([]);
      // 18:00: edr's 12–18 is calm and publishes edr's outputs: only the 06–12 slot paused.
      const d = await arrive('2024-09-10', '2024-09-10T12', { broken: true, skip: ['2024-09-10T06'] });
      expect(said(d)).toEqual([['checks', 'auth_valid', 'auth 2024-09-10', b.run]]);
      expect(d.published).toEqual(['edr_actions']);

      // The sign-ins decided once, published as is: the 18:00 run released by that decision.
      const auth = loadOf(d, 'auth');
      const decision = { load: auth, option: 'asis' as const, actor: 'owner', reason: 'Unknown results were a test client', decision: LEAF };
      const held = ['auth_results', 'auth_valid', 'edr_hosts_signing_in'];
      const release = (r: RunResult, names: string[], loads: ReleaseInput['loads']): Promise<Awaited<ReturnType<typeof releaseRun>>> =>
        releaseRun(db, { run: r.run, manifest: r.hash, keys: keysOf(r, names), option: loads![0]!.option, actor: loads![0]!.actor, reason: loads![0]!.reason, decision: loads![0]!.decision, loads });
      expect(await release(d, held, [decision])).toMatchObject({ outcome: 'applied', published: held });
      // 24:00: edr's 18–24; the sign-ins still carried, and released by the same decision.
      const e = await arrive('2024-09-10', '2024-09-10T18', { broken: true, skip: ['2024-09-10T06'] });
      expect(said(e)).toEqual([['checks', 'auth_valid', 'auth 2024-09-10', b.run]]);
      expect(await release(e, held, [decision])).toMatchObject({ outcome: 'applied', published: held });

      // The 06–12 slot published as is now would move edr's outputs back past the 12–18 and 18–24 slots: refused.
      const gap = loadOf(c, 'edr');
      expect((await release(c, ['edr_actions'], [{ load: gap, option: 'asis', actor: 'owner', reason: 'Collector restarted', decision: LEAF }])).why).toMatch(/^a later load is current for edr_actions \(run \d+\): a release never moves a name back$/);
      // A decision about a load the run didn't read; none at all; a name that waits for another load.
      expect((await release(e, held, [{ ...decision, load: gap }])).why).toBe(`run ${e.run} didn't read edr's 2024-09-10T06 load (${gap.sha256.slice(0, 16)}…): a decision is applied to a run that read its load`);
      expect((await releaseRun(db, { run: e.run, manifest: e.hash, keys: keysOf(e, held), option: 'asis', actor: 'owner', reason: 'x', decision: LEAF })).why).toBe(`run ${e.run} watches several sources: a release of it names the decisions it applies, one a load (loads)`);
      expect((await release(c, ['auth_results'], [{ load: gap, option: 'asis', actor: 'owner', reason: 'x', decision: LEAF }])).why).toBe('auth_results waits for auth_valid (its checks, its 2024-09-10 load), which no decision it cites is about');

      // verify computes each run's holds again, the carried ones citing the run that first held their load.
      for (const r of [b, c, e]) expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'rerun' }))).toEqual([]);
    } finally {
      db.close();
    }
  }, 120_000);

  it('fills the 06–12 slot per load from the same slot of another day, released and verified', async () => {
    const { db, doc, arrive, donor } = await world();
    try {
      await arrive('2024-09-09', '2024-09-10T00');
      await arrive('2024-09-10', '2024-09-10T00');
      const c = await arrive('2024-09-10', '2024-09-10T06');
      expect(said(c)).toEqual([['story', 'edr', 'edr 2024-09-10T06', null]]);
      // Only edr's outputs wait: the sign-ins' publish (Q-55).
      expect(c.published).toEqual(['auth_results', 'auth_valid']);
      const heldClaim = c.holds[0]!.claim as StoryClaim2;
      expect(heldClaim).toMatchObject({ v: 2, slot: '2024-09-10T06', every: '6h', state: 'wrong', below: true });
      // The donor: the same slot the day before (the nearest), told from the base and the tail before it.
      const d = await donor('2024-09-09T06');
      expect(d).toMatchObject({ slot: '2024-09-09T06', every: '6h', state: 'calm', history: { tail: { size: 1 } } });
      const repair: Repair = { kind: 'fill', step: 'edr_filled', source: 'edr', missing: { time: 'event_time', hours: [6, 9] }, donor: { rule: 'nearest', direction: 'before', day: '2024-09-09T06', file: { path: 'edr_file_donor', sha256: '0'.repeat(64), bytes: 0 }, claim: d as never } };
      const derived = repairDocument(doc, repair);
      const r = await runFlow(db, derived, { smaltdb: SMALTDB, parameters: { day: '2024-09-10', slot: '2024-09-10T06' }, claims: [c.claims[0]!, heldClaim, d], stage: true, from: { run: c.run, manifest: c.hash } });
      // Judged by the held run's claims (C4), the slot's load carried from it; held by its fill.
      expect(said(r)).toEqual([['story', 'edr', 'edr 2024-09-10T06', c.run]]);
      expect(r.derived!.holds.map((h) => [h.by, h.said])).toEqual([['derived', 'fills 06:00–09:59 from 2024-09-09T06']]);
      expect(r.measures!.map((m) => [m.source, m.slot])).toEqual([['edr', '2024-09-09T06']]);
      const node = r.manifest.nodes.find((n) => n.origin === 'edr_donor')!;
      const asRead: Repair = { ...repair, donor: { ...repair.donor!, file: { path: 'edr_file_donor', sha256: node.content!, bytes: node.rows! } } };
      const edrNames = ['edr_actions', 'edr_hosts_signing_in'];
      const load = loadOf(c, 'edr');
      const input: ReleaseInput = { run: r.run, manifest: r.hash, keys: keysOf(r, edrNames), option: 'fill', actor: 'owner', reason: null, decision: LEAF, from: { run: c.run, manifest: c.hash }, repair: asRead, loads: [{ load, option: 'fill', actor: 'owner', reason: null, decision: LEAF }] };
      const out = await releaseRun(db, input);
      expect(out).toMatchObject({ outcome: 'applied', why: null, published: edrNames });
      expect(out.filled).toBeGreaterThan(0);
      // The filled rows are the donor's hours 06:00–09:59, moved to the day, each marked.
      const rows = db.query("SELECT count(*), min(filled_from) FROM edr_actions").rows[0]!;
      expect(rows[1]).toBe('2024-09-09T06');
      expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'rerun' }))).toEqual([]);
    } finally {
      db.close();
    }
  }, 120_000);

  it('audits a bag of the two sources: decisions about loads, releases citing them, and carried holds told again (I12)', async () => {
    installFakeIndexedDB();
    const w = await world(true);
    const { db } = w;
    const rec = w.rec!;
    try {
      await w.arrive('2024-09-09', '2024-09-10T00');
      await w.arrive('2024-09-10', '2024-09-10T00', { broken: true });
      const d = await w.arrive('2024-09-10', '2024-09-10T12', { broken: true });
      const auth: Load = d.holds[0]!.load!;
      // The sign-ins decided once, by load, and the run released citing that decision.
      const about: DecideAbout = { day: auth.slot, run: d.run, manifest: d.hash, inputs: inputsOf(d.manifest), outputs: {}, option: 'asis', scope: 'day', policies: await policiesHash(w.doc.policies), rule: null, load: auth };
      const decided = await rec.append('decide', 'owner', about as unknown as JSONValue, 'Unknown results were a test client');
      const names = ['auth_results', 'auth_valid', 'edr_hosts_signing_in'];
      const keys = Object.fromEntries(names.map((n) => [n, d.manifest.outputs[n]!.key]));
      const leaf = entryLeaf(decided);
      const out = await releaseRun(db, { run: d.run, manifest: d.hash, keys, option: 'asis', actor: 'owner', reason: 'Unknown results were a test client', decision: leaf, loads: [{ load: auth, option: 'asis', actor: 'owner', reason: 'Unknown results were a test client', decision: leaf }] });
      expect(out.outcome).toBe('applied');
      const rel: ReleaseAbout = { run: d.run, manifest: d.hash, outputs: keys, decision: decided.seq, decisions: [decided.seq], leaf, outcome: 'applied', why: null };
      const relEntry = await rec.append('release', 'owner', rel as unknown as JSONValue);
      const report = await auditBag(await bagOf(db, rec), rec.latest());
      expect(report.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual([]);
      const lines = report.lines.map((l) => l.what);
      expect(lines).toContainEqual(`decision #${decided.seq}: publish as is for 2024-09-10, by owner, on run ${d.run}'s keys`);
      expect(lines).toContainEqual(`release #${relEntry.seq}: 3 outputs of run ${d.run} released, citing decision #${decided.seq}`);
      // A decision about a load that didn't hold the run it names fails, and so does a release citing it.
      const calm: Load = { source: 'edr', slot: '2024-09-10T12', sha256: d.manifest.nodes.find((n) => n.origin === 'edr')!.file?.sha256 ?? d.manifest.nodes.find((n) => n.origin === 'edr')!.content! };
      const wrong = await rec.append('decide', 'owner', { ...about, load: calm } as unknown as JSONValue, 'Collector restarted');
      await rec.append('release', 'owner', { ...rel, decision: wrong.seq, decisions: [wrong.seq], leaf: entryLeaf(wrong) } as unknown as JSONValue);
      const bad = (await auditBag(await bagOf(db, rec))).lines.filter((l) => !l.ok).map((l) => l.what);
      expect(bad).toContainEqual(`decision #${wrong.seq}: publish as is for 2024-09-10, by owner: the load it is about isn't one that held the run`);
      expect(bad).toContainEqual(expect.stringMatching(new RegExp(`^release #${wrong.seq + 1}: 3 outputs of run ${d.run} released, citing decision #${wrong.seq}: its decision, #${wrong.seq}, doesn't hold; its decision, #${wrong.seq}, is about edr's 2024-09-10T12 load, which didn't hold run ${d.run}`)));
      // A standing decision about edr's 06–12 load ends when its 12–18 load passes (run d read it and didn't hold it):
      // a decision about the 18–24 load applied under it fails, though no day (the sign-ins' period) passed between.
      const gap: Load = { ...calm, slot: '2024-09-10T06' };
      const standing = await rec.append('decide', 'owner', { ...about, day: gap.slot, option: 'dont', scope: 'untilPass', load: gap } as unknown as JSONValue, null);
      const late = await rec.append('decide', 'owner', { ...about, day: '2024-09-10T18', option: 'dont', scope: 'day', under: standing.seq, load: { ...calm, slot: '2024-09-10T18' } } as unknown as JSONValue, null);
      const ended = (await auditBag(await bagOf(db, rec))).lines.filter((l) => !l.ok).map((l) => l.what);
      expect(ended).toContainEqual(`decision #${late.seq}: don't publish for 2024-09-10T18, by owner, under #${standing.seq}: the load it is about isn't one that held the run; it applies decision #${standing.seq}, which doesn't stand for edr's 2024-09-10T18 load`);
    } finally {
      db.close();
    }
  }, 120_000);

  it('runs the same loads again in a new engine with the same keys, the fill too, and the tail one leaf a slot run (I2, C5)', async () => {
    installFakeIndexedDB();
    const one = await world(true);
    const two = await world();
    try {
      const fillFor = async (w: World, c: RunResult & { claims: StoryClaim2[] }) => {
        const d = await w.donor('2024-09-09T06');
        const repair: Repair = { kind: 'fill', step: 'edr_filled', source: 'edr', missing: { time: 'event_time', hours: [6, 9] }, donor: { rule: 'nearest', direction: 'before', day: '2024-09-09T06', file: { path: 'edr_file_donor', sha256: '0'.repeat(64), bytes: 0 }, claim: d as never } };
        return runFlow(w.db, repairDocument(w.doc, repair), { smaltdb: SMALTDB, parameters: { day: '2024-09-10', slot: '2024-09-10T06' }, claims: [c.claims[0]!, c.holds[0]!.claim!, d], stage: true, from: { run: c.run, manifest: c.hash } });
      };
      const runs = async (w: World) => {
        await w.arrive('2024-09-09', '2024-09-10T00');
        await w.arrive('2024-09-10', '2024-09-10T00');
        return w.arrive('2024-09-10', '2024-09-10T06');
      };
      const c1 = await runs(one);
      const f1 = await fillFor(one, c1);
      const rec = one.rec!;
      const before = tailFromRecord(rec.entries, rec.entries.length, 'edr', null);
      expect(before.map((m) => m.slot)).toEqual(['2024-09-10T00', '2024-09-10T06']);
      // The derived run, kept as the app keeps it, and the held slot run again: neither adds a leaf.
      await rec.append('run', 'owner', { run: f1.run, manifest: f1.hash, outcome: 'derived', measures: f1.measures as unknown as JSONValue });
      await one.arrive('2024-09-10', '2024-09-10T06');
      const after = tailFromRecord(rec.entries, rec.entries.length, 'edr', null);
      expect(tailRef(after)).toEqual(tailRef(before));
      // A new engine: the same files and documents give the same keys, the held slot's and its fill's.
      const c2 = await runs(two);
      expect(c2.manifest.outputs).toEqual(c1.manifest.outputs);
      expect(c2.holds.map((h) => h.load)).toEqual(c1.holds.map((h) => h.load));
      const f2 = await fillFor(two, c2);
      expect(f2.manifest.outputs).toEqual(f1.manifest.outputs);
    } finally {
      one.db.close();
      two.db.close();
    }
  }, 120_000);
});
