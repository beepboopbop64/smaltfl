/**
 * A day that is off is paused, not published (ADR 0009), on the in-process engine with the plugin: a plan with a
 * publish block holds instead of throwing, keeps what it held staged and points only what nothing holds; each watched
 * source is judged by the page's claim, against the run; a release publishes a held run as a decision says, or refuses
 * and says why; and verify's held check catches a held output shown without a release. Without a publish block,
 * runtime.test.ts and verify.test.ts show the runtime unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { pinFile, releaseRun, runFlow, verifyRun, type FlowDocument, type PublishDef, type ReleaseInput, type RunResult, type StoryClaim } from '../src/index.js';
import { sha256Hex } from '../src/core/hash.js';
import { pointDataset, findVersion } from '../src/plugin/store.js';
import { loadFixture, makeTrips, visualFlow } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const TRIPS = makeTrips(3000);
const LEAF = 'd'.repeat(64);

function fixture(): Database {
  const db = openEngine();
  loadFixture(db, TRIPS);
  return db;
}

/** The reference flow with a day parameter, the zones' own output, owner and steward, and a publish block. */
function holding(publish: PublishDef = { hold: ['checks'] }): FlowDocument {
  const doc = visualFlow();
  return {
    ...doc,
    smaltfl: 2,
    parameters: [...(doc.parameters ?? []), { name: 'day', type: 'text', default: null }],
    steps: [...doc.steps, { id: 'zone_list', kind: 'sql', inputs: ['zones'], sql: 'SELECT LocationID, Borough FROM zones', dataset: {} }],
    policies: {
      principals: [{ id: 'owner', name: 'Owner', owner: true }, { id: 'ana', name: 'Ana' }, { id: 'dev', name: 'Dev' }],
      rules: [{ id: 'stewards', kind: 'action', name: 'Ana may decide not to publish', action: 'smaltfl:decide', for: ['ana'], may: ['dont'] }],
    },
    publish,
  };
}

const run = (db: Database, doc: FlowDocument, parameters: Record<string, string> = {}, claims?: StoryClaim[]) => runFlow(db, doc, { smaltdb: SMALTDB, parameters, ...(claims ? { claims } : {}) });
const current = (db: Database, name: string) => db.query('SELECT key, run FROM _smaltfl_datasets WHERE name = ?', [name]).rows[0] ?? null;
const releases = (db: Database) => db.query('SELECT run, outcome, why FROM _smaltfl_releases ORDER BY id').rows;
const fails = (v: Awaited<ReturnType<typeof verifyRun>>) => v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}${c.note ? ` (${c.note})` : ''}`);
const keysOf = (r: RunResult, names = r.waiting) => Object.fromEntries(names.map((n) => [n, r.manifest.outputs[n]!.key]));
const asis = (r: RunResult, more: Partial<ReleaseInput> = {}): ReleaseInput => ({ run: r.run, manifest: r.hash, keys: keysOf(r), option: 'asis', actor: 'owner', reason: 'Real change', decision: LEAF, ...more });

/** A history file pinned in the engine under a name of its own (pins are shared by every engine in this process). */
async function pinHistory(db: Database) {
  const path = `history-${Math.random().toString(36).slice(2)}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify({ days: ['2024-01-11'], path }));
  const sha256 = await sha256Hex(bytes);
  await pinFile(db, path, bytes, sha256);
  return { path, sha256, bytes: bytes.byteLength };
}

const claimOf = (history: StoryClaim['history'], over: Partial<StoryClaim> = {}): StoryClaim => ({ by: 'story', source: 'trips', day: '2024-01-11', state: 'calm', below: false, head: 'A normal Thursday', build: 'dev', history, rows: TRIPS.length, ...over });
const SHORT: Partial<StoryClaim> = { state: 'wrong', below: true, head: 'Trips fall 95% from 13:00' };

describe('a plan that holds on its checks (ADR 0009 §1, §3)', () => {
  it('holds instead of throwing, keeps its versions staged by key, and points no name', async () => {
    const db = fixture();
    // The fixture has no February trips: every row is dropped, past the 5% the checks allow.
    const r = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    expect(r.holds).toEqual([{ by: 'checks', node: 2, origin: 'trips_valid', said: 'dropped 3,000 of 3,000 rows (100%), more than the 5% allowed', reaches: ['borough_hour', 'zone_hour'] }]);
    expect(r.published).toEqual([]);
    expect(r.waiting).toEqual(['borough_hour', 'zone_hour', 'zone_list']);
    // Built, checked, hashed and recorded like any run: its manifest is stored, and every version by its key.
    expect(db.query('SELECT hash FROM _smaltfl_runs WHERE id = ?', [r.run]).rows[0]![0]).toBe(r.hash);
    for (const o of Object.values(r.manifest.outputs)) expect(findVersion(db, o.key)).toMatchObject({ content: o.content, rows: o.rows });
    expect(db.query("SELECT count(*) FROM sqlite_schema WHERE name IN ('zone_hour', 'borough_hour', 'zone_list')").rows[0]![0]).toBe(0);
    expect(db.query('SELECT count(*) FROM _smaltfl_datasets').rows[0]![0]).toBe(0);
    expect(JSON.parse(String(db.query('SELECT holds FROM _smaltfl_holds WHERE run = ?', [r.run]).rows[0]![0]))).toEqual(r.holds);
  });

  it('holds the same day again when it runs again: the check is reused by key, and read from the manifest', async () => {
    const db = fixture();
    const first = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    const again = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    const valid = again.manifest.nodes.find((n) => n.origin === 'trips_valid')!;
    expect(valid.expectations).toEqual(first.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations);
    expect(again.manifest.nodes.filter((n) => n.status === 'built')).toEqual([]);
    expect(again.holds).toEqual(first.holds);
    expect(again.published).toEqual([]);
  });

  it('holds on a fail rule that failed', async () => {
    const doc = holding();
    const valid = doc.steps[0]!;
    if (valid.kind === 'expectations') valid.rules.push({ name: 'no_refunds', check: 'fare_amount >= 0', onFail: 'fail' });
    const r = await run(fixture(), doc);
    expect(r.holds.map((h) => [h.by, h.origin, h.said])).toEqual([['checks', 'trips_valid', expect.stringMatching(/^expectations failed: no_refunds \(\d+ rows\)$/)]]);
    expect(r.published).toEqual([]);
  });

  it('still throws on its checks when they are not among what holds it: neither way publishes', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const doc = holding({ hold: ['short'], watch: { trips: history.path }, period: 'day' });
    await expect(run(db, doc, { month: '2024-02', day: '2024-01-11' }, [claimOf(history)])).rejects.toThrow('trips_valid: dropped 3,000 of 3,000 rows (100%), more than the 5% allowed');
    expect(db.query('SELECT count(*) FROM _smaltfl_runs').rows[0]![0]).toBe(0);
  });

  it("never lets a flow that doesn't hold publish a day whose tripping counts a holding flow recorded", async () => {
    const db = fixture();
    await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    // The same checks over the same rows have the same key: the counts are reused, and they still throw.
    await expect(run(db, visualFlow(), { month: '2024-02' })).rejects.toThrow('trips_valid: dropped 3,000 of 3,000 rows (100%), more than the 5% allowed');
    expect(db.query('SELECT count(*) FROM _smaltfl_datasets').rows[0]![0]).toBe(0);
  });

  it('keeps the names on the day last published, and verifies the held run, held check included', async () => {
    const db = fixture();
    const jan = await run(db, holding(), { month: '2024-01', day: '2024-01-31' });
    expect(jan).toMatchObject({ holds: [], published: ['borough_hour', 'zone_hour', 'zone_list'], waiting: [] });
    const feb = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    // zone_list reads the zones alone: its staged key is the one published, so it doesn't wait.
    expect(feb.waiting).toEqual(['borough_hour', 'zone_hour']);
    for (const name of ['borough_hour', 'zone_hour', 'zone_list']) expect(current(db, name)).toEqual([jan.manifest.outputs[name]!.key, jan.run]);
    for (const level of ['stored', 'rerun'] as const) {
      const v = await verifyRun(db, feb.run, { smaltdb: SMALTDB, level, manifest: feb.hash });
      expect(fails(v), level).toEqual([]);
      expect(v.checks.filter((c) => c.check === 'held')).toEqual([{ node: -1, origin: 'holds', check: 'held', ok: true, note: 'held by trips_valid (its checks)' }]);
    }
    // The run that published: held checked too, and nothing held it.
    const v = await verifyRun(db, jan.run, { smaltdb: SMALTDB });
    expect(fails(v)).toEqual([]);
    expect(v.checks.find((c) => c.check === 'held')).toMatchObject({ ok: true, note: 'nothing held it' });
  });

  it('rolls back an engine error as before: no run, nothing held, nothing staged as a run', async () => {
    const db = fixture();
    const doc = holding();
    const formula = doc.steps.find((s) => s.id === 'trips_enriched')!;
    if (formula.kind === 'formula') formula.columns[0]!.expr = 'no_such_column / 60.0';
    await expect(run(db, doc, { month: '2024-02', day: '2024-02-01' })).rejects.toThrow(/^trips_enriched: .*no_such_column/);
    expect(db.query('SELECT count(*) FROM _smaltfl_runs').rows[0]![0]).toBe(0);
    expect(db.query('SELECT count(*) FROM _smaltfl_holds').rows[0]![0]).toBe(0);
  });
});

describe('a watched source, judged by its claim (ADR 0009 §3)', () => {
  const watched = (path: string, hold: PublishDef['hold'] = ['checks', 'short'], together = true): FlowDocument => holding({ hold, watch: { trips: path }, period: 'day', together });
  const day = { month: '2024-01', day: '2024-01-11' };

  it('publishes on a calm claim, and holds on a short one', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const calm = await run(db, watched(history.path), day, [claimOf(history)]);
    expect(calm).toMatchObject({ holds: [], published: ['borough_hour', 'zone_hour', 'zone_list'] });
    const short = await run(fixture(), watched(history.path), day, [claimOf(history, SHORT)]);
    expect(short.holds).toEqual([{ by: 'story', node: 0, origin: 'trips', said: 'Trips fall 95% from 13:00', reaches: ['borough_hour', 'zone_hour'], claim: claimOf(history, SHORT) }]);
    expect(short.published).toEqual([]);
    // Wrong but in range holds under wrong only.
    const inRange = claimOf(history, { state: 'wrong', below: false, head: 'Fare code 5 gone' });
    expect((await run(fixture(), watched(history.path), day, [inRange])).holds).toEqual([]);
    expect((await run(fixture(), watched(history.path, ['checks', 'wrong']), day, [inRange])).holds.map((h) => h.by)).toEqual(['story']);
  });

  it('holds the source as not judged when the claim is missing, or doesn’t match the run', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const said = async (claims: StoryClaim[] | undefined) => {
      const r = await run(db, watched(history.path), day, claims);
      expect(r.published).toEqual([]);
      return r.holds.map((h) => `${h.by}: ${h.said}`);
    };
    expect(await said(undefined)).toEqual(['unjudged: no claim for trips']);
    expect(await said([claimOf(history, { rows: TRIPS.length - 1 })])).toEqual([`unjudged: the claim counts 2,999 rows of trips, the snapshot holds 3,000`]);
    expect(await said([claimOf(history, { day: '2024-01-12' })])).toEqual(['unjudged: the claim is of 2024-01-12, the run of 2024-01-11']);
    expect(await said([claimOf({ ...history, sha256: 'e'.repeat(64) })])).toEqual([`unjudged: the claim's ${history.path} isn't the one pinned in the engine`]);
    expect(await said([claimOf({ ...history, path: 'unpinned.json' })])).toEqual([`unjudged: the claim was told from unpinned.json, not ${history.path}`]);
  });

  it('keeps back with together: false only what the hold reaches; what reads the zones alone publishes', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const r = await run(db, watched(history.path, ['checks', 'short'], false), day, [claimOf(history, SHORT)]);
    expect(r.published).toEqual(['zone_list']);
    expect(r.waiting).toEqual(['borough_hour', 'zone_hour']);
    expect(current(db, 'zone_list')).toEqual([r.manifest.outputs.zone_list!.key, r.run]);
    expect(current(db, 'zone_hour')).toBeNull();
    const v = await verifyRun(db, r.run, { smaltdb: SMALTDB });
    expect(fails(v)).toEqual([]);
  });

  it('verifies the claims it kept against the manifest, and fails holds or claims edited after the run', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const r = await run(db, watched(history.path), day, [claimOf(history, SHORT)]);
    expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual([]);
    // Someone empties the holds: the manifest and the claim still hold the run.
    db.run("UPDATE _smaltfl_holds SET holds = '[]' WHERE run = ?", [r.run]);
    expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(["holds:held (the holds stored with it aren't what its manifest and its claims hold)"]);
    // Someone rewrites the claim as calm, with the holds to match: the claim's rows still have to be the snapshot's.
    const calm = { node: 0, claim: claimOf(history, { rows: 12 }) };
    db.run('UPDATE _smaltfl_holds SET claims = ? WHERE run = ?', [JSON.stringify([calm]), r.run]);
    expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(["holds:held (its claim for trips doesn't match the run: the claim counts 12 rows of trips, the snapshot holds 3,000)"]);
    // And a held run with its record of holds gone.
    db.run('DELETE FROM _smaltfl_holds WHERE run = ?', [r.run]);
    expect(fails(await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(["holds:held (the run's plan says what holds it, and no record of what held it is stored)"]);
  });
});

describe('a release (ADR 0009 §5)', () => {
  /** Jan published, then Feb held on its checks. */
  async function heldDay() {
    const db = fixture();
    const jan = await run(db, holding(), { month: '2024-01', day: '2024-01-31' });
    const feb = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    return { db, jan, feb };
  }

  it('points the names at the held run’s versions, keeps the release, and verifies', async () => {
    const { db, feb } = await heldDay();
    const out = await releaseRun(db, asis(feb));
    expect(out).toEqual({ outcome: 'applied', why: null, release: 1, published: ['borough_hour', 'zone_hour'] });
    for (const name of ['borough_hour', 'zone_hour']) expect(current(db, name)).toEqual([feb.manifest.outputs[name]!.key, feb.run]);
    expect(db.query('SELECT zone_hour.trips FROM zone_hour LIMIT 1').rows).toEqual([]);
    expect(db.query('SELECT run, manifest, names, option, actor, reason, decision, outcome, why FROM _smaltfl_releases').rows).toEqual([[feb.run, feb.hash, JSON.stringify(keysOf(feb)), 'asis', 'owner', 'Real change', LEAF, 'applied', null]]);
    const v = await verifyRun(db, feb.run, { smaltdb: SMALTDB, manifest: feb.hash });
    expect(fails(v)).toEqual([]);
    expect(v.checks.filter((c) => c.check === 'published' || c.check === 'held').map((c) => `${c.origin}:${c.check}`)).toEqual(['borough_hour:published', 'zone_hour:published', 'holds:held', 'borough_hour:held', 'zone_hour:held']);
    expect(v.checks.find((c) => c.origin === 'zone_hour' && c.check === 'held')!.note).toBe(`released by release 1, citing the decision ${LEAF.slice(0, 16)}…`);
  });

  it('accepts the held outputs that already show their version too, so a decision can name every held output', async () => {
    const { db, feb } = await heldDay();
    const out = await releaseRun(db, asis(feb, { keys: keysOf(feb, ['borough_hour', 'zone_hour', 'zone_list']) }));
    expect(out).toMatchObject({ outcome: 'applied', published: ['borough_hour', 'zone_hour', 'zone_list'] });
    expect(fails(await verifyRun(db, feb.run, { smaltdb: SMALTDB }))).toEqual([]);
  });

  it('releases a re-run of the same day by the keys its decision names: a new manifest, the same keys', async () => {
    const { db, feb } = await heldDay();
    const again = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    expect(again.hash).not.toBe(feb.hash);
    expect(keysOf(again)).toEqual(keysOf(feb));
    expect(await releaseRun(db, asis(again, { keys: keysOf(feb) }))).toMatchObject({ outcome: 'applied', published: ['borough_hour', 'zone_hour'] });
    expect(current(db, 'zone_hour')).toEqual([feb.manifest.outputs.zone_hour!.key, again.run]);
  });

  it('refuses, moving nothing and keeping the refusal, for each way a release can miss its run', async () => {
    const { db, jan, feb } = await heldDay();
    const why = async (input: unknown) => {
      const out = await releaseRun(db, input as ReleaseInput);
      expect(out.outcome).toBe('refused');
      expect(out.published).toEqual([]);
      expect(current(db, 'zone_hour')).toEqual([jan.manifest.outputs.zone_hour!.key, jan.run]);
      return out.why;
    };
    expect(await why({ ...asis(feb), manifest: jan.hash })).toBe(`run ${feb.run} here is the manifest ${feb.hash.slice(0, 16)}…, not the ${jan.hash.slice(0, 16)}… the decision names`);
    expect(await why({ ...asis(feb), run: 99 })).toBe('no run 99 in this database');
    expect(await why(asis(feb, { keys: { ...keysOf(feb), zone_hour: jan.manifest.outputs.zone_hour!.key } }))).toBe(`zone_hour's staged key is ${feb.manifest.outputs.zone_hour!.key.slice(0, 16)}…, not the ${jan.manifest.outputs.zone_hour!.key.slice(0, 16)}… the decision names`);
    expect(await why(asis(feb, { keys: { nowhere: 'a'.repeat(64) } }))).toBe(`nowhere isn't an output of run ${feb.run}`);
    expect(await why(asis(jan, { keys: keysOf(jan, jan.published) }))).toBe(`nothing held run ${jan.run}: its outputs were published as it ran`);
    expect(await why(asis(feb, { actor: 'ana' }))).toBe('only Owner may publish a held day as is');
    expect(await why(asis(feb, { actor: 'dev', option: 'dont' }))).toBe("only publish as is is released: don't publish is a decision, and publishes nothing");
    expect(await why(asis(feb, { reason: ' ' }))).toBe('publish as is needs a reason');
    expect(await why(asis(feb, { reason: null }))).toBe('publish as is needs a reason');
    expect(await why(asis(feb, { decision: 'not a leaf' }))).toBe("the decision isn't a record entry's leaf (64 hex characters)");
    expect(await why(asis(feb, { keys: keysOf(feb, ['zone_hour']) }))).toBe(`the decision leaves out borough_hour, which run ${feb.run} holds with another version than its name shows`);
    expect(await why('publish it')).toBe('a release names the run, its manifest, the keys, the option, the actor, the reason and the decision');
    // Each refusal is kept, as asked.
    expect(releases(db)).toHaveLength(12);
    expect(releases(db).every(([, outcome]) => outcome === 'refused')).toBe(true);
    // Applied once, refused the second time.
    expect((await releaseRun(db, asis(feb))).outcome).toBe('applied');
    expect((await releaseRun(db, asis(feb))).why).toBe('borough_hour was already released, by release 13');
  });

  it("refuses an output the run doesn't hold", async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const doc = holding({ hold: ['checks', 'short'], watch: { trips: history.path }, period: 'day', together: false });
    const r = await run(db, doc, { month: '2024-01', day: '2024-01-11' }, [claimOf(history, SHORT)]);
    expect((await releaseRun(db, asis(r, { keys: keysOf(r, ['zone_hour', 'borough_hour', 'zone_list']) }))).why).toBe(`run ${r.run} doesn't hold zone_list`);
  });

  it('never moves a name back: a held day passed over by a later one that published is refused', async () => {
    const db = fixture();
    const history = await pinHistory(db);
    const doc = holding({ hold: ['checks', 'short'], watch: { trips: history.path }, period: 'day' });
    const thu = await run(db, doc, { month: '2024-01', day: '2024-01-11' }, [claimOf(history, SHORT)]);
    const fri = await run(db, doc, { month: '2024-01', day: '2024-01-12' }, [claimOf(history, { day: '2024-01-12' })]);
    expect(fri.published).toEqual(['borough_hour', 'zone_hour', 'zone_list']);
    expect((await releaseRun(db, asis(thu))).why).toBe(`2024-01-12 is current for borough_hour (run ${fri.run}): a release never moves a name back to an earlier day`);
    expect(current(db, 'borough_hour')).toEqual([fri.manifest.outputs.borough_hour!.key, fri.run]);
  });

  it('refuses a run whose flow document, and so its policies, are not stored with it', async () => {
    const { db, feb } = await heldDay();
    db.exec('DELETE FROM _smaltfl_flows');
    expect((await releaseRun(db, asis(feb))).why).toBe(`run ${feb.run}'s flow document isn't stored with it, so who may decide can't be checked`);
  });
});

describe("verify's held check (ADR 0009 §11)", () => {
  it('fails a held output pointed by hand, with no release', async () => {
    const db = fixture();
    await run(db, holding(), { month: '2024-01', day: '2024-01-31' });
    const feb = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    const key = feb.manifest.outputs.zone_hour!.key;
    db.exec('BEGIN');
    pointDataset(db, 'zone_hour', key, findVersion(db, key)!.table, feb.run);
    db.exec('COMMIT');
    const v = await verifyRun(db, feb.run, { smaltdb: SMALTDB });
    // published sees the name show the run's own version; held sees that nothing released it.
    expect(fails(v)).toEqual([`zone_hour:held (run ${feb.run} held it, and its name shows it with no release)`]);
  });

  it('fails a refused release as no release at all', async () => {
    const db = fixture();
    const feb = await run(db, holding(), { month: '2024-02', day: '2024-02-01' });
    expect((await releaseRun(db, asis(feb, { actor: 'ana' }))).outcome).toBe('refused');
    const key = feb.manifest.outputs.zone_hour!.key;
    db.exec('BEGIN');
    pointDataset(db, 'zone_hour', key, findVersion(db, key)!.table, feb.run);
    db.exec('COMMIT');
    expect(fails(await verifyRun(db, feb.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual([`zone_hour:held (run ${feb.run} held it, and its name shows it with no release)`]);
  });
});
