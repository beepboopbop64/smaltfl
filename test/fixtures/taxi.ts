/**
 * A small, seeded stand-in for the reference scenario (docs/SCENARIO.md) until the real TLC and Open-Meteo files can
 * be downloaded: trips shaped like the TLC yellow-taxi records, with the real data's kinds of defects, and a subset of
 * the TLC zone lookup. Every number is reproducible from the seed.
 */
import type { Database } from 'smaltdb/engine';
import type { FlowDocument } from '../../src/index.js';

/** [LocationID, Borough, Zone, service_zone]: a subset of the TLC zone lookup. */
export const ZONES: [number, string, string, string][] = [
  [1, 'EWR', 'Newark Airport', 'EWR'],
  [7, 'Queens', 'Astoria', 'Boro Zone'],
  [61, 'Brooklyn', 'Crown Heights North', 'Boro Zone'],
  [79, 'Manhattan', 'East Village', 'Yellow Zone'],
  [132, 'Queens', 'JFK Airport', 'Airports'],
  [138, 'Queens', 'LaGuardia Airport', 'Airports'],
  [161, 'Manhattan', 'Midtown Center', 'Yellow Zone'],
  [168, 'Bronx', 'Mott Haven/Port Morris', 'Boro Zone'],
  [181, 'Brooklyn', 'Park Slope', 'Boro Zone'],
  [206, 'Staten Island', 'Saint George/New Brighton', 'Boro Zone'],
  [230, 'Manhattan', 'Times Sq/Theatre District', 'Yellow Zone'],
  [236, 'Manhattan', 'Upper East Side North', 'Yellow Zone'],
  [264, 'Unknown', 'N/A', 'N/A'],
  [265, 'N/A', 'Outside of NYC', 'N/A'],
];

/** Pickup zones, weighted as the real data is: mostly Manhattan, a few airports, very little Staten Island. */
const PICKUP_WEIGHTS: [number, number][] = [
  [161, 22], [230, 20], [236, 18], [79, 14], [132, 6], [138, 5], [7, 4], [181, 3], [61, 3], [168, 2], [1, 1], [206, 1], [264, 0.4], [265, 0.3],
];

export const TRIP_COLUMNS = [
  'VendorID', 'tpep_pickup_datetime', 'tpep_dropoff_datetime', 'passenger_count', 'trip_distance', 'PULocationID',
  'DOLocationID', 'payment_type', 'fare_amount', 'tip_amount', 'tolls_amount', 'total_amount',
] as const;

export type Trip = [number, string, string, number | null, number, number, number, number, number, number, number, number];

/** mulberry32: a small, well-mixed 32-bit generator, so the fixture is the same on every machine. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (x: number) => Math.round(x * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

/** `n` trips in January 2024, with defects at roughly the real data's rates and about 0.5% exact duplicates. */
export function makeTrips(n: number, seed = 2024): Trip[] {
  const rnd = random(seed);
  const pick = (weights: [number, number][]) => {
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let x = rnd() * total;
    for (const [v, w] of weights) if ((x -= w) < 0) return v;
    return weights[weights.length - 1]![0];
  };
  const jan = Date.UTC(2024, 0, 1);
  const out: Trip[] = [];
  while (out.length < n) {
    if (out.length > 10 && rnd() < 0.005) {
      out.push([...out[Math.floor(rnd() * out.length)]!] as Trip);
      continue;
    }
    const outside = rnd() < 0.01;
    const pickup = outside ? jan - Math.floor(rnd() * 3 * 86400) * 1000 - 1000 : jan + Math.floor(rnd() * 31 * 86400) * 1000;
    const r = rnd();
    const minutes = r < 0.005 ? 0.5 : r < 0.008 ? 200 + rnd() * 100 : 3 + rnd() * 45;
    const dropoff = pickup + Math.round(minutes * 60) * 1000;
    const distance = rnd() < 0.005 ? 0 : cents(0.3 + rnd() * 18);
    const pu = pick(PICKUP_WEIGHTS);
    const doZone = pick(PICKUP_WEIGHTS);
    const card = rnd() < 0.7;
    const refund = rnd() < 0.003;
    const fare = cents((3 + 2.5 * distance + 0.5 * minutes) * (refund ? -1 : 1));
    const tip = card && fare > 0 ? cents(fare * (0.15 + rnd() * 0.1)) : 0;
    const tolls = pu === 132 || pu === 138 || doZone === 132 || doZone === 138 ? 6.94 : 0;
    const passengers = rnd() < 0.02 ? null : 1 + Math.floor(rnd() * 4);
    out.push([rnd() < 0.5 ? 1 : 2, stamp(pickup), stamp(dropoff), passengers, distance, pu, doZone, card ? 1 : 2, fare, tip, tolls, cents(fare + tip + tolls)]);
  }
  return out;
}

/** Load the fixture as the tables `raw_trips` and `raw_zones`, typed as a Parquet import would type them. */
export function loadFixture(db: Database, trips: readonly Trip[], zones = ZONES): void {
  db.exec('CREATE TABLE raw_zones(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT)');
  db.exec(
    'CREATE TABLE raw_trips(VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL)',
  );
  db.exec('BEGIN');
  const z = db.prepare('INSERT INTO raw_zones VALUES (?, ?, ?, ?)');
  for (const row of zones) z.run(row);
  const t = db.prepare(`INSERT INTO raw_trips VALUES (${TRIP_COLUMNS.map(() => '?').join(', ')})`);
  for (const row of trips) t.run(row);
  db.exec('COMMIT');
}

/** The reference flow, built with visual tools: clean (expectations, dedupe), enrich (join, formulas), aggregate. */
export function visualFlow(): FlowDocument {
  return {
    smaltfl: 1,
    id: 'nyc-taxis',
    name: 'NYC taxis',
    parameters: [{ name: 'month', type: 'text', default: '2024-01' }],
    sources: [
      { id: 'trips', table: 'raw_trips' },
      { id: 'zones', table: 'raw_zones' },
    ],
    steps: [
      {
        id: 'trips_valid',
        kind: 'expectations',
        inputs: ['trips'],
        rules: [
          { name: 'in_month', check: 'substr(tpep_pickup_datetime, 1, 7) = :month', onFail: 'drop' },
          { name: 'duration', check: 'unixepoch(tpep_dropoff_datetime) - unixepoch(tpep_pickup_datetime) BETWEEN 60 AND 10800', onFail: 'drop' },
          { name: 'distance', check: 'trip_distance > 0 AND trip_distance <= 100', onFail: 'drop' },
          { name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' },
          { name: 'known_zones', check: 'PULocationID NOT IN (264, 265) AND DOLocationID NOT IN (264, 265)', onFail: 'drop' },
          { name: 'passengers', check: 'passenger_count IS NOT NULL', onFail: 'warn' },
        ],
        maxDropped: 0.05,
      },
      { id: 'trips_dedup', kind: 'sql', inputs: ['trips_valid'], sql: 'SELECT DISTINCT * FROM trips_valid;' },
      {
        id: 'trips_zoned',
        kind: 'join',
        inputs: ['trips_dedup', 'zones'],
        how: 'left',
        on: [{ left: 'PULocationID', right: 'LocationID' }],
        columns: [
          { name: 'pu_borough', column: 'Borough' },
          { name: 'pu_zone', column: 'Zone' },
        ],
      },
      {
        id: 'trips_enriched',
        kind: 'formula',
        inputs: ['trips_zoned'],
        columns: [
          { name: 'duration_min', expr: '(unixepoch(tpep_dropoff_datetime) - unixepoch(tpep_pickup_datetime)) / 60.0' },
          { name: 'pu_hour', expr: "strftime('%Y-%m-%d %H:00', tpep_pickup_datetime)" },
          { name: 'speed_mph', expr: 'trip_distance / (duration_min / 60.0)' },
          { name: 'card_tip_rate', expr: 'CASE WHEN payment_type = 1 AND fare_amount > 0 THEN tip_amount / fare_amount END' },
        ],
      },
      {
        id: 'zone_hour',
        kind: 'aggregate',
        inputs: ['trips_enriched'],
        groupBy: ['pu_borough', 'pu_zone', 'pu_hour'],
        measures: [
          { name: 'trips', expr: 'count(*)' },
          { name: 'avg_duration_min', expr: 'avg(duration_min)' },
          { name: 'avg_speed_mph', expr: 'avg(speed_mph)' },
          { name: 'avg_fare', expr: 'avg(fare_amount)' },
          { name: 'card_tip_rate', expr: 'avg(card_tip_rate)' },
        ],
        dataset: { description: 'Trips per pickup zone and hour' },
      },
      {
        id: 'borough_hour',
        kind: 'aggregate',
        inputs: ['zone_hour'],
        groupBy: ['pu_borough', 'pu_hour'],
        measures: [{ name: 'trips', expr: 'sum(trips)' }],
        dataset: {},
      },
    ],
    layout: { trips_valid: [80, 40], zone_hour: [520, 40] },
  };
}

/** The same flow with zone_hour written as a SQL step instead of the aggregate tool. */
export function sqlFlow(): FlowDocument {
  const doc = visualFlow();
  doc.id = 'nyc-taxis-sql';
  const i = doc.steps.findIndex((s) => s.id === 'zone_hour');
  doc.steps[i] = {
    id: 'zone_hour',
    kind: 'sql',
    inputs: ['trips_enriched'],
    sql: `SELECT pu_borough, pu_zone, pu_hour, count(*) AS trips, avg(duration_min) AS avg_duration_min,
            avg(speed_mph) AS avg_speed_mph, avg(fare_amount) AS avg_fare, avg(card_tip_rate) AS card_tip_rate
          FROM trips_enriched
          GROUP BY pu_borough, pu_zone, pu_hour`,
    dataset: { description: 'Trips per pickup zone and hour' },
  };
  return doc;
}
