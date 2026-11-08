/**
 * A filled day under plan/2 and claim/2 (ADR 0010 §6 and ADR 0009 amendment 1, C4; integration tests I1, I4, I13): the
 * held day's claim told from the base history and the tail, the derived run judged by the held run's claim (its flow
 * hash, its stored measures, the same snapshot), the donor's claim/2 told from its own day's measures, the release
 * passing the amendment's S10 checks, and verify's repair and held checks passing on the filled run. A tampered `from`,
 * another snapshot or a claim told under the derived document's flow each leave the source not judged.
 */
import { describe, expect, it } from 'vitest';
import type { Database } from 'smaltdb/engine';
import { daysBetween, plusDays } from '../src/core/calendar.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { repairDocument, type Repair } from '../src/core/fill.js';
import { sha256Hex, utf8 } from '../src/core/hash.js';
import type { HistoryRef, StoryClaim2 } from '../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, tailBefore, type MeasureSettings, type Measures } from '../src/core/measures.js';
import { insertAfter, loadClaim, measureLoad, pinFile, releaseRun, runFlow, tailPath, translate, verifyRun, type FlowDocument, type ReleaseInput, type RunResult } from '../src/index.js';
import { makeTrips, TRIP_COLUMNS, ZONES, type Trip } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';

const HELD = '2024-01-11'; // a Thursday: its trips stop at 13:00
const DONOR = '2024-01-04'; // the Thursday before
const BASE_TO = '2024-01-02'; // the base ends here; the tail runs from Jan 3 to the day before the held day
const FIRST = '2023-11-20';
const LEAF = 'd'.repeat(64);
const TYPES = 'VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL';

/** `n` trips on one day: the fixture's trips moved to that day, their times of day kept; past 13:00 only with `keep`. */
function tripsOn(day: string, n: number, seed: number, keep: (hour: number) => boolean = () => true): Trip[] {
  const move = (t: string, by: number) => `${plusDays(t.slice(0, 10), by)}${t.slice(10)}`;
  return makeTrips(n, seed).map((t): Trip => {
    const by = daysBetween(t[1].slice(0, 10), day);
    return [t[0], move(t[1], by), move(t[2], by), ...t.slice(3)] as Trip;
  }).filter((t) => keep(Number(t[1].slice(11, 13))));
}
/** Every day the same 1,200 trips at the same times, moved: a flat history, so a day that stops at 13:00 is far off. */
const dayTrips = (day: string) => (day === HELD ? tripsOn(day, 1200, 1, (h) => h < 13) : tripsOn(day, 1200, 1));

function load(db: Database, table: string, day: string): void {
  db.exec(`DELETE FROM ${table}`);
  db.exec('BEGIN');
  const t = db.prepare(`INSERT INTO ${table} VALUES (${TRIP_COLUMNS.map(() => '?').join(', ')})`);
  for (const row of dayTrips(day)) t.run(row);
  db.exec('COMMIT');
}

const FILL = { id: 'trips_filled', kind: 'fill' as const, inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] };
/** The day's flow in the general form (format 3, plan/2): no calendar (Q-58), its trips watched with their time. */
const flow = (): FlowDocument => insertAfter({
  smaltfl: 3, id: 'day-taxis', name: 'Day taxis',
  parameters: [{ name: 'day', type: 'text', default: null }],
  sources: [{ id: 'trips', table: 'day_trips' }, { id: 'zones', table: 'raw_zones' }],
  steps: [
    { id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'on_day', check: 'substr(tpep_pickup_datetime, 1, 10) = :day', onFail: 'drop' }, { name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], maxDropped: 0.1 },
    { id: 'trip_hours', kind: 'aggregate', inputs: ['trips_valid'], groupBy: [{ name: 'hour', expr: 'CAST(substr(tpep_pickup_datetime, 12, 2) AS INTEGER)' }], measures: [{ name: 'trips', expr: 'count(*)' }, { name: 'filled_from', expr: 'max(filled_from)' }, { name: 'filled', expr: 'count(filled_from)' }], dataset: {} },
    { id: 'zone_list', kind: 'sql', inputs: ['zones'], sql: 'SELECT LocationID, Borough FROM zones', dataset: {} },
  ],
  ontology: { objectTypes: [], linkTypes: [], actionTypes: [], nouns: { trips: { one: 'trip', many: 'trips' } } },
  publish: { hold: ['checks', 'short'], period: 'day', watch: { trips: { history: 'history.json', time: 'tpep_pickup_datetime' } } },
}, 'trips', structuredClone(FILL));

/** How the base was measured: the vendors and payments counted, the pickup zones followed. */
const BASE_SETTINGS: Pick<MeasureSettings, 'checks' | 'counted' | 'followed' | 'paired' | 'time' | 'zone' | 'sample'> = { checks: null, counted: ['VendorID', 'payment_type'], followed: ['PULocationID'], paired: [], time: 'tpep_pickup_datetime', zone: null, sample: 2000 };

interface World {
  db: Database;
  doc: FlowDocument;
  base: ReturnType<typeof emptyHistory>;
  baseRef: HistoryRef;
  tail: Measures[];
  wed: RunResult;
  thu: RunResult;
  claimOf(day: string, table?: string): Promise<StoryClaim2>;
}

/** Seven weeks measured into a base (to Jan 2), a tail from Jan 3 to Wed 10 measured as their runs would, Wed 10 run,
 * Thu 11 held short; the donor's table loaded with Thu 4. */
async function world(): Promise<World> {
  const db = openEngine();
  db.exec('CREATE TABLE raw_zones(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT)');
  db.exec(`CREATE TABLE day_trips(${TYPES})`);
  db.exec(`CREATE TABLE day_trips_donor(${TYPES})`);
  const z = db.prepare('INSERT INTO raw_zones VALUES (?, ?, ?, ?)');
  for (const row of ZONES) z.run(row);
  const doc = flow();
  const settingsOn = async (day: string, header: Parameters<typeof settingsFor>[2]) => settingsFor(await translate(doc, { day }), 0, header, doc.steps)!;
  // The base, built as the history builder builds one: each day measured, folded in order.
  const baseMeasures: Measures[] = [];
  for (let d = FIRST; d <= BASE_TO; d = plusDays(d, 1)) {
    load(db, 'day_trips', d);
    baseMeasures.push(await measureLoad(db, 'day_trips', { ...(await settingsOn(d, null)), ...BASE_SETTINGS, checks: (await settingsOn(d, null)).checks, counting: (await settingsOn(d, null)).counting }));
  }
  const m0 = baseMeasures[0]!;
  const base = appendPeriods(emptyHistory({ flow: doc.id, source: 'trips', settings: { ...BASE_SETTINGS, checks: m0.checks }, columns: m0.columns, types: m0.types, kinds: m0.kinds }), baseMeasures);
  const bytes = utf8(JSON.stringify(base));
  const baseRef = { path: 'history.json', sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
  await pinFile(db, 'history.json', bytes, baseRef.sha256);
  // The tail: every day after the base, measured with the settings the base gives, as each day's run would.
  const tail: Measures[] = [];
  for (let d = plusDays(BASE_TO, 1); d < HELD; d = plusDays(d, 1)) {
    load(db, 'day_trips', d);
    tail.push(await measureLoad(db, 'day_trips', await settingsOn(d, base)));
  }
  await pinFile(db, tailPath('trips'), utf8(canonicalJSON(tailBefore(tail, HELD) as unknown as Parameters<typeof canonicalJSON>[0])));
  const claimOf = async (day: string, table = 'day_trips'): Promise<StoryClaim2> => {
    const settings = await settingsOn(day, base);
    const told = await loadClaim({ doc, source: 'trips', flow: (await translate(doc, { day })).flow.hash, base, baseRef, tail, measures: await measureLoad(db, table, settings), settings, skip: [], build: 'dev' });
    return told!.claim;
  };
  load(db, 'day_trips', '2024-01-10');
  const wed = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: '2024-01-10' }, claims: [await claimOf('2024-01-10')] });
  load(db, 'day_trips', HELD);
  const thu = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: HELD }, claims: [await claimOf(HELD)] });
  load(db, 'day_trips_donor', DONOR);
  return { db, doc, base, baseRef, tail, wed, thu, claimOf };
}

const HOURS = { time: 'tpep_pickup_datetime', hours: [13, 23] as [number, number] };
const keysOf = (r: RunResult) => Object.fromEntries(Object.entries(r.manifest.outputs).map(([n, o]) => [n, o.key]));
const fails = (v: Awaited<ReturnType<typeof verifyRun>>) => v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}${c.note ? ` (${c.note})` : ''}`);

describe('a filled day under plan/2 and claim/2 (I1, I4, I13)', () => {
  it('holds the day by its claim/2, judges the derived run by it, releases the fill and verifies it', async () => {
    const w = await world();
    const { db } = w;
    try {
      expect((await translate(w.doc, { day: HELD })).smaltflPlan).toBe(2);
      expect(w.wed.holds).toEqual([]);
      expect(w.thu.holds.map((h) => [h.by, h.said])).toEqual([['story', 'Trips fall 100% from 13:00']]);
      const heldClaim = w.thu.holds[0]!.claim as StoryClaim2;
      expect(heldClaim).toMatchObject({ state: 'wrong', below: true });
      expect(heldClaim).toMatchObject({ v: 2, slot: HELD, history: { base: w.baseRef, tail: { size: 8 } } });
      // The donor's claim/2: Thu 4 is in the tail, told from the base and the tail before it, and its own measures.
      const donor = { ...(await w.claimOf(DONOR, 'day_trips_donor')), source: 'trips_donor' };
      expect(donor).toMatchObject({ state: 'calm', slot: DONOR, history: { tail: { size: 1 } } });
      const repair: Repair = { kind: 'fill', step: 'trips_filled', source: 'trips', missing: HOURS, donor: { rule: 'weekday', direction: 'before', day: DONOR, file: { path: 'loads/none', sha256: '0'.repeat(64), bytes: 0 }, claim: donor as never } };
      const derived = repairDocument(w.doc, repair);
      expect((await translate(derived, { day: HELD })).smaltflPlan).toBe(2);
      const stage = (claims: unknown[], from = { run: w.thu.run, manifest: w.thu.hash }, doc = derived) => runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day: HELD }, claims: claims as StoryClaim2[], stage: true, from });
      const r = await stage([heldClaim, donor]);
      // Judged by the held run's claim, not "not judged": its flow hash and its stored measures (C4).
      expect(r.holds.map((h) => [h.by, h.said])).toEqual([['story', 'Trips fall 100% from 13:00']]);
      expect(r.derived!.holds.map((h) => [h.by, h.said])).toEqual([['derived', 'fills 13:00–23:59 from 2024-01-04']]);
      // The donor measured in the run, as a load of the trips on its own day.
      expect(r.measures!.map((m) => [m.source, m.slot])).toEqual([['trips', DONOR]]);
      const node = r.manifest.nodes.find((n) => n.origin === 'trips_donor')!;
      const asRead: Repair = { ...repair, donor: { ...repair.donor!, file: { path: 'day_trips_donor', sha256: node.content!, bytes: node.rows! } } };
      const input: ReleaseInput = { run: r.run, manifest: r.hash, keys: keysOf(r), option: 'fill', actor: 'owner', reason: null, decision: LEAF, from: { run: w.thu.run, manifest: w.thu.hash }, repair: asRead };
      const out = await releaseRun(db, input);
      expect(out).toMatchObject({ outcome: 'applied', why: null });
      expect(out.filled).toBeGreaterThan(0);
      // verify: the repair rebuilt, the claim judged again by the held run's measures, the donor measured again (I13).
      const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'rerun' });
      expect(fails(v)).toEqual([]);
      expect(v.checks.find((c) => c.check === 'repair')?.ok).toBe(true);
      expect(v.checks.filter((c) => c.check === 'held' && c.node >= 0 && /measured again/.test(c.note ?? ''))).toHaveLength(1);
      expect(fails(await verifyRun(db, w.thu.run, { smaltdb: SMALTDB, level: 'rerun' }))).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('leaves the derived run\'s source not judged for a tampered from, another snapshot, or a claim under its own flow', async () => {
    const w = await world();
    const { db } = w;
    try {
      const heldClaim = w.thu.holds[0]!.claim as StoryClaim2;
      const donor = { ...(await w.claimOf(DONOR, 'day_trips_donor')), source: 'trips_donor' };
      const repair: Repair = { kind: 'fill', step: 'trips_filled', source: 'trips', missing: HOURS, donor: { rule: 'weekday', direction: 'before', day: DONOR, file: { path: 'loads/none', sha256: '0'.repeat(64), bytes: 0 }, claim: donor as never } };
      const derived = repairDocument(w.doc, repair);
      const said = async (claims: unknown[], from = { run: w.thu.run, manifest: w.thu.hash }) =>
        (await runFlow(db, derived, { smaltdb: SMALTDB, parameters: { day: HELD }, claims: claims as StoryClaim2[], stage: true, from })).holds.map((h) => [h.by, h.said]);
      // From Wed's run: the same flow, and another snapshot than the one it measured.
      expect(await said([heldClaim, donor], { run: w.wed.run, manifest: w.wed.hash })).toEqual([['unjudged', `it read another trips than run ${w.wed.run}, which it repairs, measured`]]);
      // A run that isn't there with that manifest.
      expect(await said([heldClaim, donor], { run: w.thu.run, manifest: 'e'.repeat(64) })).toEqual([['unjudged', "the claim was told under another flow than the run's"]]);
      // The claim told again under the derived document's own flow.
      const own = (await translate(derived, { day: HELD })).flow.hash;
      expect(await said([{ ...heldClaim, flow: own }, donor])).toEqual([['unjudged', "the claim was told under another flow than the run's"]]);
      // Another day's file in the trips table: not the held run's snapshot (and its checks trip too, its rows of another day).
      load(db, 'day_trips', '2024-01-10');
      expect(await said([heldClaim, donor])).toContainEqual(['unjudged', `it read another trips than run ${w.thu.run}, which it repairs, measured`]);
    } finally {
      db.close();
    }
  });
});
