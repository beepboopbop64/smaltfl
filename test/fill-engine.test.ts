/**
 * Filling a paused day through the engine (ADR 0009 amendment 1 S1, S4, S10, S11; Q-61): a flow with a fill step marks
 * every row it reaches; a derived document runs staged, held whatever else holds, its donor judged by its claim; a
 * release of a fill, or of the part that arrived, is checked against the held run it repairs; a better donor replaces
 * a fill; a withdrawal sends readers back to what they had; and verify's repair check rebuilds the derived run from
 * its held run and the repair. On the in-process engine with the plugin and the taxi fixture.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { plusDays, daysBetween } from '../src/core/calendar.js';
import { repairDocument, type Repair } from '../src/core/fill.js';
import { sha256Hex } from '../src/core/hash.js';
import { insertAfter, pinFile, releaseRun, runFlow, verifyRun, type FlowDocument, type ReleaseInput, type RunResult, type StoryClaim } from '../src/index.js';
import { findVersion } from '../src/plugin/store.js';
import { makeTrips, TRIP_COLUMNS, ZONES, type Trip } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const HELD = '2024-01-11'; // a Thursday: its trips stop at 13:00
const DONOR = '2024-01-04'; // the Thursday before
const NEAREST = '2024-01-10'; // the day before, published
const LEAF = 'd'.repeat(64);

/** `n` trips on one day: the fixture's trips moved to that day, their times of day kept. */
function tripsOn(day: string, n: number, seed: number, keep: (hour: number) => boolean = () => true): Trip[] {
  const move = (t: string, by: number) => `${plusDays(t.slice(0, 10), by)}${t.slice(10)}`;
  return makeTrips(n, seed).map((t): Trip => {
    const by = daysBetween(t[1].slice(0, 10), day);
    return [t[0], move(t[1], by), move(t[2], by), ...t.slice(3)] as Trip;
  }).filter((t) => keep(Number(t[1].slice(11, 13))));
}
const DAYS: Record<string, Trip[]> = {
  [NEAREST]: tripsOn(NEAREST, 1500, 10),
  [HELD]: tripsOn(HELD, 1500, 11, (h) => h < 13),
  [DONOR]: tripsOn(DONOR, 1500, 4),
  '2024-01-12': tripsOn('2024-01-12', 1500, 12),
};
const TYPES = 'VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL';

/** An engine with the zones, and a table for the day's trips and one for a donor's. */
function engine(): Database {
  const db = openEngine();
  db.exec('CREATE TABLE raw_zones(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT)');
  db.exec(`CREATE TABLE day_trips(${TYPES})`);
  db.exec(`CREATE TABLE day_trips_donor(${TYPES})`);
  const z = db.prepare('INSERT INTO raw_zones VALUES (?, ?, ?, ?)');
  for (const row of ZONES) z.run(row);
  return db;
}
/** Load a day's trips into a table, as the page pins a day's file. */
function load(db: Database, table: string, day: string): void {
  db.exec(`DELETE FROM ${table}`);
  db.exec('BEGIN');
  const t = db.prepare(`INSERT INTO ${table} VALUES (${TRIP_COLUMNS.map(() => '?').join(', ')})`);
  for (const row of DAYS[day]!) t.run(row);
  db.exec('COMMIT');
}
/** A day's trips that pass the flow's checks. */
const passing = (day: string) => DAYS[day]!.filter((t) => t[1].slice(0, 10) === day && t[8] >= 0).length;
const inHours = (day: string, a: number, b: number) => DAYS[day]!.filter((t) => Number(t[1].slice(11, 13)) >= a && Number(t[1].slice(11, 13)) <= b).length;

const FILL = { id: 'trips_filled', kind: 'fill' as const, inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] };
/** A day's flow with a fill step on its watched trips: checks, trips by hour (marked), the day's total, and the zones. */
function flow(history: string, publish: Partial<NonNullable<FlowDocument['publish']>> = {}): FlowDocument {
  const doc: FlowDocument = {
    smaltfl: 2, id: 'day-taxis', name: 'Day taxis',
    parameters: [{ name: 'day', type: 'text', default: null }],
    sources: [{ id: 'trips', table: 'day_trips' }, { id: 'zones', table: 'raw_zones' }],
    steps: [
      { id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'on_day', check: 'substr(tpep_pickup_datetime, 1, 10) = :day', onFail: 'drop' }, { name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], maxDropped: 0.1 },
      { id: 'trip_hours', kind: 'aggregate', inputs: ['trips_valid'], groupBy: [{ name: 'hour', expr: 'CAST(substr(tpep_pickup_datetime, 12, 2) AS INTEGER)' }], measures: [{ name: 'trips', expr: 'count(*)' }, { name: 'filled_from', expr: 'max(filled_from)' }, { name: 'filled', expr: 'count(filled_from)' }], dataset: {} },
      { id: 'day_total', kind: 'aggregate', inputs: ['trip_hours'], groupBy: [], measures: [{ name: 'trips', expr: 'sum(trips)' }, { name: 'filled', expr: 'sum(filled)' }, { name: 'filled_from', expr: 'max(filled_from)' }], dataset: {} },
      { id: 'zone_list', kind: 'sql', inputs: ['zones'], sql: 'SELECT LocationID, Borough FROM zones', dataset: {} },
    ],
    policies: {
      principals: [{ id: 'owner', name: 'Owner', owner: true }, { id: 'ana', name: 'Ana' }, { id: 'dev', name: 'Dev' }],
      rules: [
        { id: 'leads', kind: 'action', name: 'Ana may decide not to publish', action: 'smaltfl:decide', for: ['ana'], may: ['dont'] },
        { id: 'stewards', kind: 'action', name: 'Dev may fill', action: 'smaltfl:decide', for: ['dev'], may: ['dont', 'fill', 'complete'] },
      ],
    },
    publish: { hold: ['checks', 'short'], watch: { trips: history }, period: 'day', ...publish },
  };
  return insertAfter(doc, 'trips', structuredClone(FILL));
}

/** A history pinned in the engine under a name of its own. */
async function pinHistory(db: Database) {
  const path = `history-${Math.random().toString(36).slice(2)}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify({ path }));
  const sha256 = await sha256Hex(bytes);
  await pinFile(db, path, bytes, sha256);
  return { path, sha256, bytes: bytes.byteLength };
}
const claimOf = (history: StoryClaim['history'], day: string, over: Partial<StoryClaim> = {}): StoryClaim => ({ by: 'story', source: 'trips', day, state: 'calm', below: false, head: 'A normal day', build: 'dev', history, rows: DAYS[day]?.length ?? 0, ...over });
const SHORT = { state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00' } as const;
const donorClaim = (history: StoryClaim['history'], day = DONOR, over: Partial<StoryClaim> = {}) => claimOf(history, day, { source: 'trips_donor', ...over });
const HOURS = { time: 'tpep_pickup_datetime', hours: [13, 23] as [number, number] };
const repairFrom = (day: string | null, file = { path: `loads/${day}.parquet`, sha256: '0'.repeat(64), bytes: 0 }): Repair => ({
  kind: day ? 'fill' : 'complete', step: 'trips_filled', source: 'trips', missing: HOURS,
  donor: day ? { rule: 'weekday', direction: 'before', day, file, claim: donorClaim({ path: 'h', sha256: '0'.repeat(64), bytes: 0 }, day) } : null,
});

const current = (db: Database, name: string) => db.query('SELECT key, run FROM _smaltfl_datasets WHERE name = ?', [name]).rows[0] ?? null;
const keysOf = (r: RunResult) => Object.fromEntries(Object.entries(r.manifest.outputs).map(([n, o]) => [n, o.key]));
const fails = (v: Awaited<ReturnType<typeof verifyRun>>) => v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}${c.note ? ` (${c.note})` : ''}`);
const total = (db: Database) => db.query('SELECT trips, filled, filled_from FROM day_total').rows[0];

/** Wed 10 published, Thu 11 held short; the donor's table loaded with `donor`'s trips. */
async function heldDay(donor = DONOR, publish: Partial<NonNullable<FlowDocument['publish']>> = {}) {
  const db = engine();
  const history = await pinHistory(db);
  const doc = flow(history.path, publish);
  load(db, 'day_trips', NEAREST);
  const wed = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: NEAREST }, claims: [claimOf(history, NEAREST)] });
  load(db, 'day_trips', HELD);
  const thu = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: HELD }, claims: [claimOf(history, HELD, SHORT)] });
  load(db, 'day_trips_donor', donor);
  return { db, history, doc, wed, thu };
}
/** The derived run of a repair of Thu 11, staged, with the day's claim and the donor's. */
async function derive(t: Awaited<ReturnType<typeof heldDay>>, repair: Repair, claims?: StoryClaim[], doc?: FlowDocument) {
  const d = doc ?? repairDocument(t.doc, repair);
  const c = claims ?? [claimOf(t.history, HELD, SHORT), ...(repair.donor ? [donorClaim(t.history, repair.donor.day)] : [])];
  return runFlow(t.db, d, { smaltdb: SMALTDB, parameters: { day: HELD }, claims: c, stage: true, from: { run: t.thu.run, manifest: t.thu.hash } });
}
/** The donor as the derived run read it: a table here, named by its snapshot's content, as a run's inputs name it. */
const noFile = { path: 'loads/none', sha256: '0'.repeat(64), bytes: 0 };
const asRead = (r: RunResult, repair: Repair): Repair => {
  const node = r.manifest.nodes.find((n) => n.origin === 'trips_donor')!;
  return repair.donor ? { ...repair, donor: { ...repair.donor, file: { path: 'day_trips_donor', sha256: node.content!, bytes: node.rows! } } } : repair;
};
const releaseOf = (t: { thu: RunResult }, r: RunResult, repair: Repair, more: Partial<ReleaseInput> = {}): ReleaseInput => ({
  run: r.run, manifest: r.hash, keys: keysOf(r), option: repair.kind, actor: 'owner', reason: null, decision: LEAF, from: { run: t.thu.run, manifest: t.thu.hash }, repair, ...more,
});

describe('a flow with a fill step (amendment 1 S1)', () => {
  it('marks every row it reaches with filled_from, null on a day nothing fills, and holds as before', async () => {
    const { db, wed, thu } = await heldDay();
    expect(wed).toMatchObject({ holds: [], published: ['day_total', 'trip_hours', 'zone_list'] });
    expect(wed.derived).toBeUndefined();
    expect(db.query('SELECT trips, filled, filled_from FROM day_total').rows).toEqual([[passing(NEAREST), 0, null]]);
    expect(thu.holds.map((h) => [h.by, h.origin])).toEqual([['story', 'trips']]);
    expect(thu.waiting).toEqual(['day_total', 'trip_hours']);
  });

  it('changes the keys downstream of the source once, and no other', async () => {
    const db = engine();
    load(db, 'day_trips', NEAREST);
    const { publish: _p, ...plain } = flow('h.json');
    const withFill = await runFlow(db, { ...plain, smaltfl: 1 }, { smaltdb: SMALTDB, parameters: { day: NEAREST } });
    // The same flow before it had a fill step: its aggregates without the mark.
    const steps = plain.steps.filter((s) => s.id !== 'trips_filled').map((s) => (s.id === 'trips_valid' ? { ...s, inputs: ['trips'] } : s.kind === 'aggregate' ? { ...s, measures: s.measures.filter((m) => !m.name.startsWith('filled')) } : s));
    const without = await runFlow(db, { ...plain, smaltfl: 1, steps }, { smaltdb: SMALTDB, parameters: { day: NEAREST } });
    expect(without.manifest.outputs.zone_list!.key).toBe(withFill.manifest.outputs.zone_list!.key);
    expect(without.manifest.outputs.trip_hours!.key).not.toBe(withFill.manifest.outputs.trip_hours!.key);
    expect(without.manifest.outputs.trip_hours!.content).not.toBe(withFill.manifest.outputs.trip_hours!.content);
  });

  it('refuses a run whose output drops the mark, naming it (Q-65)', async () => {
    const db = engine();
    load(db, 'day_trips', NEAREST);
    const doc: FlowDocument = { ...flow('h.json'), publish: { hold: ['checks'] } };
    const total = doc.steps.find((s) => s.id === 'day_total')!;
    if (total.kind === 'aggregate') total.measures = total.measures.filter((m) => m.name !== 'filled_from');
    await expect(runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: NEAREST } })).rejects.toThrow("day_total: day_total reads trips_filled and doesn't carry filled_from");
    expect(db.query('SELECT count(*) FROM _smaltfl_runs').rows[0]![0]).toBe(0);
  });

  it('runs a derived document only staged, naming the held run it repairs', async () => {
    const t = await heldDay();
    const d = repairDocument(t.doc, repairFrom(DONOR));
    const opts = { smaltdb: SMALTDB, parameters: { day: HELD }, claims: [claimOf(t.history, HELD, SHORT)] };
    await expect(runFlow(t.db, d, opts)).rejects.toThrow('trips_filled fills a day: a derived document runs staged, as the derived run of a decision');
    await expect(runFlow(t.db, d, { ...opts, stage: true })).rejects.toThrow('a derived run names the held run it repairs: from { run, manifest }');
    await expect(runFlow(t.db, t.doc, { ...opts, from: { run: t.thu.run, manifest: t.thu.hash } })).rejects.toThrow('from names the held run a derived run repairs: it goes with stage');
  });

  it('refuses a donor whose columns aren’t the source’s', async () => {
    const t = await heldDay();
    t.db.exec('DROP TABLE day_trips_donor');
    t.db.exec(`CREATE TABLE day_trips_donor(${TYPES.replace('fare_amount REAL', 'fare_amount TEXT')}, extra REAL)`);
    await expect(derive(t, repairFrom(DONOR))).rejects.toThrow('trips_filled: the donor trips_donor has other columns than trips: it has extra besides; fare_amount is text, not real');
  });
});

describe('a derived run (amendment 1 S4)', () => {
  it('is held by its fill whatever else holds, its donor judged, and counts what it took', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    expect(r.holds.map((h) => [h.by, h.origin])).toEqual([['story', 'trips']]);
    expect(r.derived).toEqual({ holds: [{ by: 'derived', node: 3, origin: 'trips_filled', said: 'fills 13:00–23:59 from 2024-01-04', reaches: ['day_total', 'trip_hours', 'zone_list'] }], filled: inHours(DONOR, 13, 23) });
    expect(r.published).toEqual([]);
    expect(r.waiting).toEqual(['day_total', 'trip_hours']);
    // Its donor's claim, judged as a watched source's: the donor's day, the same history, the donor snapshot's rows.
    const stored = t.db.query('SELECT from_run, from_manifest, donors, filled FROM _smaltfl_derived WHERE run = ?', [r.run]).rows[0]!;
    expect(stored.slice(0, 2)).toEqual([t.thu.run, t.thu.hash]);
    expect(JSON.parse(String(stored[2]))).toEqual([{ node: 2, claim: donorClaim(t.history) }]);
    // Built and stored like any held run: the held run's versions are still there too.
    for (const o of Object.values(t.thu.manifest.outputs)) expect(findVersion(t.db, o.key)).not.toBeNull();
    expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, manifest: r.hash }))).toEqual([]);
  });

  it('is held by a donor not judged good, or with no claim', async () => {
    const t = await heldDay();
    const wrong = await derive(t, repairFrom(DONOR), [claimOf(t.history, HELD, SHORT), donorClaim(t.history, DONOR, { state: 'wrong', head: 'Vendor 1 sent almost nothing' })]);
    expect(wrong.derived!.holds.map((h) => [h.by, h.said])).toEqual([['donor', 'the donor day 2024-01-04: Vendor 1 sent almost nothing'], ['derived', 'fills 13:00–23:59 from 2024-01-04']]);
    const none = await derive(t, repairFrom(DONOR), [claimOf(t.history, HELD, SHORT)]);
    expect(none.derived!.holds.map((h) => [h.by, h.said])[0]).toEqual(['donor', 'no claim for trips_donor']);
    const other = await derive(t, repairFrom(DONOR), [claimOf(t.history, HELD, SHORT), donorClaim(t.history, '2024-01-03', { rows: DAYS[DONOR]!.length })]);
    expect(other.derived!.holds[0]!.said).toBe('the claim is of 2024-01-03, the run of 2024-01-04');
    for (const r of [wrong, none, other]) expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual([]);
  });
});

describe('releasing a fill (amendment 1 S10)', () => {
  it('points the names at the filled versions, marked, and verifies with its repair', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    const repair = asRead(r, repairFrom(DONOR));
    const out = await releaseRun(t.db, releaseOf(t, r, repair));
    expect(out).toMatchObject({ outcome: 'applied', why: null, published: ['day_total', 'trip_hours', 'zone_list'], filled: inHours(DONOR, 13, 23) });
    const arrived = DAYS[HELD]!.length;
    const [trips, filled, from] = total(t.db)!;
    // The checks drop some rows; what is left is what arrived and what the donor gave, each past the checks.
    expect(Number(trips)).toBeLessThanOrEqual(arrived + inHours(DONOR, 13, 23));
    expect(Number(filled)).toBeGreaterThan(0);
    expect(Number(filled)).toBeLessThanOrEqual(inHours(DONOR, 13, 23));
    expect(from).toBe(DONOR);
    // Every filled row is moved to the held day, and only the hours that were missing are filled.
    expect(t.db.query('SELECT min(hour), max(hour) FROM trip_hours WHERE filled > 0').rows).toEqual([[13, 23]]);
    expect(t.db.query('SELECT count(*) FROM trip_hours WHERE filled > 0 AND filled <> trips').rows).toEqual([[0]]);
    const v = await verifyRun(t.db, r.run, { smaltdb: SMALTDB, manifest: r.hash });
    expect(fails(v)).toEqual([]);
    expect(v.checks.find((c) => c.check === 'repair')).toMatchObject({ ok: true, note: `release ${out.release}: run ${t.thu.run} filled from 2024-01-04, rebuilt from its document and the repair` });
    expect(v.checks.filter((c) => c.check === 'held').map((c) => c.origin)).toEqual(['holds', 'day_total', 'trip_hours', 'zone_list']);
    // The held run verifies too, its versions still staged.
    expect(fails(await verifyRun(t.db, t.thu.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual([]);
    expect(t.db.query('SELECT repair FROM _smaltfl_repairs WHERE release = ?', [out.release]).rows[0]![0]).toBe(JSON.stringify(repair));
  });

  it('publishes the part that arrived alone, with no donor', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(null));
    expect(r.derived).toEqual({ holds: [expect.objectContaining({ by: 'derived', said: 'keeps all but 13:00–23:59' })], filled: null });
    const out = await releaseRun(t.db, releaseOf(t, r, repairFrom(null)));
    expect(out).toMatchObject({ outcome: 'applied', filled: null });
    expect(total(t.db)!.slice(1)).toEqual([0, null]);
    expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB }))).toEqual([]);
  });

  it('refuses a release that isn’t the repair of its held run, or that something else holds', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    const repair = asRead(r, repairFrom(DONOR));
    const why = async (input: ReleaseInput) => {
      const out = await releaseRun(t.db, input);
      expect(out).toMatchObject({ outcome: 'refused', published: [] });
      return out.why;
    };
    expect(await why(releaseOf(t, r, { ...repair, missing: { time: 'tpep_pickup_datetime', hours: [12, 23] } }))).toBe(`run ${r.run}'s document isn't run ${t.thu.run}'s repaired as the decision says`);
    expect(await why(releaseOf(t, r, repair, { option: 'complete' }))).toBe('the repair is a fill, and the decision says complete');
    expect(await why(releaseOf(t, r, repair, { from: { run: t.wed.run, manifest: t.wed.hash } }))).toBe(`run ${r.run} repairs run ${t.thu.run} (${t.thu.hash.slice(0, 16)}…), not the run ${t.wed.run} the decision names`);
    expect(await why(releaseOf(t, r, { ...repair, donor: { ...repair.donor!, file: { ...noFile, sha256: 'e'.repeat(64) } } }))).toBe(`run ${r.run}'s donor read ${r.manifest.nodes.find((n) => n.origin === 'trips_donor')!.content!.slice(0, 16)}…, not the 2024-01-04 file the repair names`);
    expect(await why(releaseOf(t, r, repair, { keys: { ...keysOf(r), trip_hours: t.thu.manifest.outputs.trip_hours!.key } }))).toBe(`trip_hours's staged key is ${r.manifest.outputs.trip_hours!.key.slice(0, 16)}…, not the ${t.thu.manifest.outputs.trip_hours!.key.slice(0, 16)}… the decision names`);
    expect(await why(releaseOf(t, r, repair, { actor: 'ana' }))).toBe('only Owner and Dev may fill a held day from another day');
    expect(await why(releaseOf(t, r, repair, { meanwhile: true }))).toBe(`run ${t.thu.run}'s flow doesn't set meanwhile to fill`);
    expect(await why(releaseOf(t, r, repair, { option: 'asis', reason: 'Real change' }))).toBe(`run ${r.run} is a derived run: it is released as the fill or the part its decision names`);
    expect(await why(releaseOf(t, t.thu, repair, { keys: keysOf(t.thu) }))).toBe(`run ${t.thu.run} isn't a derived run: a fill releases the run its decision derived`);
    expect(await why({ ...releaseOf(t, r, repair), repair: undefined } as unknown as ReleaseInput)).toBe('fill releases a derived run: it names the held run it repairs (from) and the repair');
    // Held by a donor not judged good: not released.
    const wrong = await derive(t, repairFrom(DONOR), [claimOf(t.history, HELD, SHORT), donorClaim(t.history, DONOR, { state: 'wrong', head: 'Vendor 1 sent almost nothing' })]);
    expect(await why(releaseOf(t, wrong, asRead(wrong, repairFrom(DONOR))))).toBe("its donor, 2024-01-04, wasn't judged good");
    // Allowed to a steward whose rule lists fill; and once applied, not again.
    expect((await releaseRun(t.db, releaseOf(t, r, repair, { actor: 'dev' }))).outcome).toBe('applied');
    expect(await why(releaseOf(t, r, repair))).toMatch(/^day_total was already released, by release \d+$/);
  });

  it('refuses a filled day whose checks trip', async () => {
    const t = await heldDay();
    // A donor whose fares are all negative: its rows fail the checks, past the 10% they allow.
    t.db.exec('UPDATE day_trips_donor SET fare_amount = -1');
    const r = await derive(t, repairFrom(DONOR));
    expect(r.holds.map((h) => h.by)).toEqual(['checks', 'story']);
    expect((await releaseRun(t.db, releaseOf(t, r, asRead(r, repairFrom(DONOR))))).why).toMatch(/^the filled day fails its checks: dropped [\d,]+ of [\d,]+ rows \([\d.]+%\), more than the 10% allowed$/);
  });

  it('never moves a name back past a later day', async () => {
    const t = await heldDay();
    load(t.db, 'day_trips', '2024-01-12');
    const fri = await runFlow(t.db, t.doc, { smaltdb: SMALTDB, parameters: { day: '2024-01-12' }, claims: [claimOf(t.history, '2024-01-12')] });
    expect(fri.published).toEqual(['day_total', 'trip_hours', 'zone_list']);
    load(t.db, 'day_trips', HELD);
    const r = await derive(t, repairFrom(DONOR));
    expect((await releaseRun(t.db, releaseOf(t, r, asRead(r, repairFrom(DONOR))))).why).toBe(`2024-01-12 is current for day_total (run ${fri.run}): a release never moves a name back to an earlier day`);
  });
});

describe('a better donor, and taking a fill back (amendment 1 S7, Q-61)', () => {
  it('replaces a fill with a refill, and withdraws each in turn back to what readers had', async () => {
    const t = await heldDay();
    const first = await derive(t, repairFrom(DONOR));
    const a = await releaseRun(t.db, releaseOf(t, first, asRead(first, repairFrom(DONOR))));
    expect(a.outcome).toBe('applied');
    // A better donor: Wed 10, the nearest day before.
    load(t.db, 'day_trips_donor', NEAREST);
    const second = await derive(t, { ...repairFrom(NEAREST), donor: { ...repairFrom(NEAREST).donor!, rule: 'nearest' } });
    const repair2 = asRead(second, { ...repairFrom(NEAREST), donor: { ...repairFrom(NEAREST).donor!, rule: 'nearest' } });
    const b = await releaseRun(t.db, releaseOf(t, second, repair2));
    expect(b).toMatchObject({ outcome: 'applied', filled: inHours(NEAREST, 13, 23) });
    expect(total(t.db)![2]).toBe(NEAREST);
    expect(current(t.db, 'trip_hours')).toEqual([second.manifest.outputs.trip_hours!.key, second.run]);
    // Withdraw the refill: readers have the first fill again.
    const back = (r: RunResult, release: number, more: Partial<ReleaseInput> = {}): ReleaseInput => ({ run: r.run, manifest: r.hash, keys: keysOf(r), option: 'dont', actor: 'owner', reason: null, decision: LEAF, withdraws: release, ...more });
    expect(await releaseRun(t.db, back(second, b.release))).toMatchObject({ outcome: 'applied', published: ['day_total', 'trip_hours', 'zone_list'] });
    expect(current(t.db, 'trip_hours')).toEqual([first.manifest.outputs.trip_hours!.key, first.run]);
    expect(total(t.db)![2]).toBe(DONOR);
    expect((await releaseRun(t.db, back(second, b.release))).why).toBe(`release ${b.release} was withdrawn already`);
    // Ana may not publish, but may withdraw: a decision not to publish.
    expect((await releaseRun(t.db, back(first, a.release, { actor: 'zed' }))).why).toBe("zed is not one of the flow's people");
    expect(await releaseRun(t.db, back(first, a.release, { actor: 'ana' }))).toMatchObject({ outcome: 'applied' });
    // Readers see Wed 10 again: its own versions, under its own run.
    expect(current(t.db, 'trip_hours')).toEqual([t.wed.manifest.outputs.trip_hours!.key, t.wed.run]);
    expect(total(t.db)).toEqual([passing(NEAREST), 0, null]);
    expect(t.db.query('SELECT release, withdraws FROM _smaltfl_withdrawals ORDER BY release').rows.map((x) => x[1])).toEqual([b.release, a.release]);
    for (const r of [first, second, t.wed]) expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, level: 'stored' })), String(r.run)).toEqual([]);
    // Applied again by a new decision: the withdrawn fill goes out again.
    expect(await releaseRun(t.db, releaseOf(t, first, asRead(first, repairFrom(DONOR))))).toMatchObject({ why: null, outcome: 'applied' });
    expect(total(t.db)![2]).toBe(DONOR);
  });

  it('refuses a withdrawal with a later day current, and one of nothing', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    const a = await releaseRun(t.db, releaseOf(t, r, asRead(r, repairFrom(DONOR))));
    load(t.db, 'day_trips', '2024-01-12');
    const fri = await runFlow(t.db, t.doc, { smaltdb: SMALTDB, parameters: { day: '2024-01-12' }, claims: [claimOf(t.history, '2024-01-12')] });
    const back: ReleaseInput = { run: r.run, manifest: r.hash, keys: keysOf(r), option: 'dont', actor: 'owner', reason: null, decision: LEAF, withdraws: a.release };
    expect((await releaseRun(t.db, back)).why).toBe(`2024-01-12 is current for day_total (run ${fri.run}): a withdrawal never moves a name back past a later day`);
    expect((await releaseRun(t.db, { ...back, withdraws: 999 })).why).toBe("release 999 isn't an applied release of a fill or a part here: there is nothing to withdraw");
    expect((await releaseRun(t.db, { ...back, option: 'fill' } as ReleaseInput)).why).toBe('a withdrawal is a decision not to publish, naming the release it takes back by its number');
  });
});

describe("verify's repair check (amendment 1 S11)", () => {
  it('fails a repair that doesn’t rebuild the derived run, and holds edited after the run', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    const repair = asRead(r, repairFrom(DONOR));
    const out = await releaseRun(t.db, releaseOf(t, r, repair));
    t.db.run('UPDATE _smaltfl_repairs SET repair = ? WHERE release = ?', [JSON.stringify({ ...repair, donor: { ...repair.donor!, day: '2024-01-03' } }), out.release]);
    expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual([`repair:repair (its document isn't run ${t.thu.run}'s repaired as its release says)`]);
    t.db.run("UPDATE _smaltfl_derived SET holds = '[]' WHERE run = ?", [r.run]);
    expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, level: 'stored' }))[0]).toBe("holds:held (the holds stored with it as a derived run aren't what its plan and its donors hold)");
  });

  it('fails a run that fills a day and isn’t stored as a derived run', async () => {
    const t = await heldDay();
    const r = await derive(t, repairFrom(DONOR));
    t.db.run('DELETE FROM _smaltfl_derived WHERE run = ?', [r.run]);
    expect(fails(await verifyRun(t.db, r.run, { smaltdb: SMALTDB, level: 'stored' }))).toEqual(["holds:held (trips_filled fills a day, and the run isn't stored as a derived run)"]);
  });
});

describe('a fill applied again in a new engine (amendment 1 S9)', () => {
  it('gives the same keys from the same files and decision', async () => {
    const one = await heldDay();
    const a = await derive(one, repairFrom(DONOR));
    const two = await heldDay();
    const b = await derive(two, repairFrom(DONOR));
    expect(keysOf(b)).toEqual(keysOf(a));
    expect(b.manifest.outputs).toEqual(a.manifest.outputs);
  });
});
