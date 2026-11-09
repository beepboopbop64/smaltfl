// The trips (ADR 0011): the first notebook of the NYC taxis and weather flow (flow.json). The day's trips come in,
// marked for filling, checked, deduplicated, placed in their zones and enriched, then counted per zone and hour and
// per borough and hour. Only the counts are exported: they are the datasets the flow publishes; everything before
// them is a step the engine folds into the counts' statements.
import { cell, md, param, sql } from 'smaltnb';
import { check, fill, source } from 'smaltfl/notebook';
import { zones } from './places.nb.js';

cell('params');
export const params = param({ month: param.text('2024-01'), day: param.text('') });

cell('trips');
export const trips = source('trips');

cell('about_filled', { lang: 'md' });
md`The trips as they arrived, each marked with the day it came from when a paused day is filled from another day`;

cell('trips_filled');
const trips_filled = fill(trips, { time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] });

cell('about_valid', { lang: 'md' });
md`Trips that pass the checks`;

cell('trips_valid');
const trips_valid = check(trips_filled, {
  rules: [
    { name: 'in_month', check: 'substr(tpep_pickup_datetime, 1, 7) = :month', onFail: 'drop' },
    { name: 'duration', check: 'unixepoch(tpep_dropoff_datetime) - unixepoch(tpep_pickup_datetime) BETWEEN 60 AND 10800', onFail: 'drop' },
    { name: 'distance', check: 'trip_distance > 0 AND trip_distance <= 100', onFail: 'drop' },
    { name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' },
    { name: 'known_zones', check: 'PULocationID NOT IN (264, 265) AND DOLocationID NOT IN (264, 265)', onFail: 'drop' },
    { name: 'passengers', check: 'passenger_count IS NOT NULL', onFail: 'warn' },
  ],
  maxDropped: 0.1,
});

cell('about_dedup', { lang: 'md' });
md`Exact duplicates removed`;

cell('trips_dedup', { lang: 'sql' });
const trips_dedup = sql`SELECT DISTINCT * FROM ${trips_valid}`;

cell('about_zoned', { lang: 'md' });
md`Each trip's pickup borough and zone`;

cell('trips_zoned', { lang: 'sql' });
const trips_zoned = sql`
  SELECT t.*, z.Borough AS pu_borough, z.Zone AS pu_zone
  FROM ${trips_dedup} AS t LEFT JOIN ${zones} AS z ON t.PULocationID = z.LocationID`;

cell('about_enriched', { lang: 'md' });
md`Duration, pickup hour, speed and card tip rate`;

cell('trips_enriched', { lang: 'sql' });
const trips_enriched = sql`
  SELECT *, trip_distance / (duration_min / 60.0) AS speed_mph
  FROM (
    SELECT *,
      (unixepoch(tpep_dropoff_datetime) - unixepoch(tpep_pickup_datetime)) / 60.0 AS duration_min,
      strftime('%Y-%m-%d %H:00', tpep_pickup_datetime) AS pu_hour,
      CASE WHEN payment_type = 1 AND fare_amount > 0 THEN tip_amount / fare_amount END AS card_tip_rate
    FROM ${trips_zoned}
  )`;

cell('about_zone_hour', { lang: 'md' });
md`Trips, duration, speed, fare and tip rate per pickup zone and hour`;

cell('zone_hour', { lang: 'sql' });
export const zone_hour = sql`
  SELECT pu_borough, pu_zone, pu_hour,
    count(*) AS trips, avg(duration_min) AS avg_duration_min, avg(speed_mph) AS avg_speed_mph, avg(fare_amount) AS avg_fare,
    avg(card_tip_rate) AS card_tip_rate, max(filled_from) AS filled_from, count(filled_from) AS filled
  FROM ${trips_enriched}
  GROUP BY 1, 2, 3`;

cell('about_borough_hour', { lang: 'md' });
md`Trips per borough and hour`;

cell('borough_hour', { lang: 'sql' });
export const borough_hour = sql`
  SELECT pu_borough, pu_hour, sum(trips) AS trips, max(filled_from) AS filled_from, sum(filled) AS filled
  FROM ${zone_hour}
  GROUP BY 1, 2`;
