// The trips, cleaned (ADR 0011): the first stage of the NYC taxis and weather flow (flow.json). The day's trips come
// in, marked for filling from another day, checked, and deduplicated. Nothing here is published: the next stages
// import the clean trips, and the engine folds these steps into theirs.
import { cell, md, param, sql } from 'smaltnb';
import { check, fill, source } from 'smaltfl/notebook';

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
export const trips_dedup = sql`SELECT DISTINCT * FROM ${trips_valid}`;
