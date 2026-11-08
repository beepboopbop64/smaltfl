/**
 * claim/2 through the engine (ADR 0010 §6, B12): under plan/2 a watched source is judged by a claim told from its base
 * and its tail, with the load's own measures; the plugin measures the snapshot, checks the claim's flow, slot, base,
 * tail and measures, and keeps the measures; verify measures again at the Recomputed level. Each way a claim can fail
 * leaves the source not judged, saying why. On the in-process engine with a small sign-in table.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../src/core/canonical.js';
import { plusDays } from '../src/core/calendar.js';
import { utf8 } from '../src/core/hash.js';
import { claimHolds, loadClaim, skipOf, tailPath, type StoryClaim2 } from '../src/core/hold.js';
import { measuresHash, settingsFor, tailRef, type Measures } from '../src/core/measures.js';
import { random } from '../src/core/quality.js';
import { measureLoad, pinFile, runFlow, translate, verifyRun, type FlowDocument } from '../src/index.js';
import { measuresOfRun } from '../src/plugin/store.js';
import { securityDoc } from './fixtures/security.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const DAY = '2024-03-11';
const COLUMNS = 'event_time TEXT, result TEXT, method TEXT, country TEXT, ua_family TEXT, latency_ms REAL, user TEXT';

/** `n` sign-ins on a day, seeded: mostly successes, a few failures, from a handful of countries. */
function signins(day: string, n: number, seed: number): unknown[][] {
  const rnd = random(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  return Array.from({ length: n }, (_, i) => {
    const h = Math.floor(rnd() * 24);
    const m = Math.floor(rnd() * 60);
    const r = rnd();
    return [`${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`, r < 0.04 ? 'fail' : r < 0.045 ? 'locked' : 'success', pick(['password', 'sso', 'mfa_push']), pick(['US', 'GB', 'DE']), pick(['chrome', 'edge']), 100 + Math.floor(rnd() * 200), `u${i % 40}`];
  });
}

function load(db: Database, rows: readonly unknown[][]): void {
  db.exec('DELETE FROM auth_file');
  for (const r of rows) db.run('INSERT INTO auth_file VALUES (?, ?, ?, ?, ?, ?, ?)', r as never);
}

/** A plan/2 sign-in flow with no base history: the tail and the day's own measures are all it is judged by. */
const doc: FlowDocument = securityDoc();

async function setup() {
  const db = openEngine();
  db.exec(`CREATE TABLE auth_file(${COLUMNS})`);
  const plan = await translate(doc, { day: DAY });
  const settingsOn = async (day: string) => settingsFor(await translate(doc, { day }), 0, null, doc.steps)!;
  // Three days before, each measured as its run would: the source's tail.
  const tail: Measures[] = [];
  for (const [k, d] of [plusDays(DAY, -3), plusDays(DAY, -2), plusDays(DAY, -1)].entries()) {
    load(db, signins(d, 300, k + 1));
    tail.push(await measureLoad(db, 'auth_file', await settingsOn(d)));
  }
  load(db, signins(DAY, 300, 9));
  const settings = await settingsOn(DAY);
  const measures = await measureLoad(db, 'auth_file', settings);
  await pinFile(db, tailPath('auth'), utf8(canonicalJSON(tail as unknown as Parameters<typeof canonicalJSON>[0])));
  const told = (await loadClaim({ doc, source: 'auth', flow: plan.flow.hash, base: null, baseRef: null, tail, measures, settings, skip: [], build: 'dev' }))!;
  return { db, plan, tail, measures, settings, told };
}

describe('claim/2 (ADR 0010 §6)', () => {
  it('measures from the doc\'s checks, its bad and serious columns, with no base', async () => {
    const plan = await translate(doc, { day: DAY });
    const s = settingsFor(plan, 0, null, doc.steps)!;
    expect(s).toMatchObject({ source: 'auth', slot: DAY, counted: ['result'], followed: ['country'], paired: [], time: 'event_time', zone: null, sample: 2000 });
    expect(s.checks!.rules.find((r) => r.name === 'in_day')!.check).toBe('substr(event_time, 1, 10) = :day');
    expect(s.counting![1]).toBe(`substr(event_time, 1, 10) = '${DAY}'`);
  });

  it('tells the claim from the tail before the day and the day\'s measures, and the run judges it by them', async () => {
    const { db, plan, tail, told } = await setup();
    try {
      const c = told.claim;
      expect(c).toMatchObject({ by: 'story', v: 2, source: 'auth', slot: DAY, every: 'day', flow: plan.flow.hash, history: { base: null, tail: tailRef(tail) }, rows: 300, skip: [], levels: [] });
      expect(told.tail).toHaveLength(3);
      expect(told.ranges.file.days).toEqual([plusDays(DAY, -3), plusDays(DAY, -2), plusDays(DAY, -1), DAY]);
      // Four days of history: nothing to compare against yet, published and marked (Q-53).
      expect(c.state).toBe('unlearned');
      const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: DAY }, claims: [c] });
      expect(r.holds).toEqual([]);
      expect(r.measures).toHaveLength(1);
      expect(await measuresHash(r.measures![0]!)).toBe(c.measured);
      const stored = measuresOfRun(db, r.run);
      expect(stored).toHaveLength(1);
      expect(stored[0]!.hash).toBe(c.measured);
      expect(claimHolds(['checks', 'wrong'], c)).toBe(false);
      // verify, at the Recomputed level: the claim judged again by the stored measures, and the snapshot measured again.
      const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun' });
      expect(v.checks.filter((x) => x.check === 'held').every((x) => x.ok)).toBe(true);
      expect(v.checks.some((x) => x.check === 'held' && x.node === 0 && /measured again/.test(x.note ?? ''))).toBe(true);
      expect(v.ok).toBe(true);
      // A tampered store: the measures no longer what the snapshot gives.
      db.run('UPDATE _smaltfl_measures SET hash = ? WHERE run = ?', ['0'.repeat(64), r.run]);
      const bad = await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun' });
      expect(bad.ok).toBe(false);
      expect(bad.checks.find((x) => x.check === 'held' && x.node === 0 && !x.ok)?.note).toMatch(/other measures than the run stored/);
    } finally {
      db.close();
    }
  });

  it('leaves the source not judged, saying why, for each way a claim can fail', async () => {
    const { db, plan, tail, told } = await setup();
    try {
      const run = async (claim: unknown) => (await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: DAY }, claims: [claim as StoryClaim2] })).holds.map((h) => [h.by, h.said]);
      const c = told.claim;
      expect(await run({ ...c, v: undefined, day: DAY, history: { path: 'auth-history.json', sha256: 'a'.repeat(64), bytes: 1 } })).toEqual([['unjudged', "the claim for auth isn't claim/2, which plan/2 needs"]]);
      expect(await run({ ...c, flow: 'f'.repeat(64) })).toEqual([['unjudged', "the claim was told under another flow than the run's"]]);
      expect(await run({ ...c, slot: plusDays(DAY, 1) })).toEqual([['unjudged', `the claim is of ${plusDays(DAY, 1)}, the run of ${DAY}`]]);
      expect(await run({ ...c, measured: 'e'.repeat(64) })).toEqual([['unjudged', "the claim was told from other measures of auth than its snapshot's"]]);
      expect(await run({ ...c, history: { base: null, tail: { size: 2, root: c.history.tail!.root } } })).toEqual([['unjudged', "the claim's tail isn't the one pinned for auth"]]);
      expect(await run({ ...c, history: { base: { path: 'auth-history.json', sha256: 'a'.repeat(64), bytes: 1 }, tail: c.history.tail } })).toEqual([['unjudged', "auth-history.json isn't pinned in the engine"]]);
      // A tail pinned out of order isn't a tail.
      await pinFile(db, tailPath('auth'), utf8(canonicalJSON([tail[1], tail[0]] as unknown as Parameters<typeof canonicalJSON>[0])));
      expect(await run(c)).toEqual([['unjudged', "the tail pinned for auth isn't in slot order, one record a slot"]]);
      await pinFile(db, tailPath('auth'), null);
      expect(await run(c)).toEqual([['unjudged', 'the claim names a tail of 3, and no tail is pinned for auth']]);
      // A base pinned under the watch's name, and a claim told without it.
      await pinFile(db, 'auth-history.json', utf8('{}'));
      expect(await run({ ...c, history: { base: null, tail: null } })).toEqual([['unjudged', 'the claim was told with no base history, and auth-history.json is pinned']]);
      expect(plan.smaltflPlan).toBe(2);
    } finally {
      db.close();
    }
  });

  it('refuses claim/2 under a plan/1', async () => {
    const db = openEngine();
    try {
      db.exec(`CREATE TABLE auth_file(${COLUMNS})`);
      load(db, signins(DAY, 50, 3));
      const legacy: FlowDocument = { ...doc, smaltfl: 2, calendar: undefined, publish: { hold: ['checks', 'wrong'], period: 'day', watch: { auth: 'auth-history.json' } }, ontology: { ...doc.ontology!, properties: [] } };
      const r = await runFlow(db, legacy, { smaltdb: SMALTDB, parameters: { day: DAY }, claims: [{ by: 'story', v: 2, source: 'auth' } as unknown as StoryClaim2] });
      expect(r.holds.map((h) => h.said)).toEqual(["the claim for auth is claim/2, which a plan/1 doesn't read"]);
      expect(r.measures).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

describe('what the record leaves out of learning (skipOf)', () => {
  it('names the days held and not published as is', () => {
    const inputs = (day: string) => ({ flow: 'f'.repeat(64), parameters: { day }, files: { auth: day } });
    const held = (seq: number, day: string) => ({ seq, kind: 'run', at: '', by: { as: 'owner' }, reason: null, amends: null, about: { run: seq, manifest: String(seq).repeat(64).slice(0, 64), outcome: 'held', day, inputs: inputs(day), holds: [], waiting: ['x'], keys: { x: 'k' } } });
    const decide = (seq: number, day: string, option: string) => ({ seq, kind: 'decide', at: '', by: { as: 'owner' }, reason: 'r', amends: null, about: { day, run: seq - 1, manifest: String(seq - 1).repeat(64).slice(0, 64), inputs: inputs(day), outputs: { x: 'k' }, option, scope: 'day', policies: 'p', rule: null, ...(option === 'fill' ? { repair: { kind: 'fill' } } : {}) } });
    const entries = [held(1, '2024-03-04'), decide(2, '2024-03-04', 'asis'), held(3, '2024-03-05'), decide(4, '2024-03-05', 'dont'), held(5, '2024-03-06'), held(7, '2024-03-07'), decide(8, '2024-03-07', 'fill')];
    expect(skipOf(entries as never, 'day')).toEqual(['2024-03-05', '2024-03-06', '2024-03-07']);
  });
});
