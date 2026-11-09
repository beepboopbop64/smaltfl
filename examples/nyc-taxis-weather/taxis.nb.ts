// NYC taxis and weather (ADR 0011): the flow as one notebook, read top to bottom. Each heading opens a stage of the
// pipeline on the canvas; each cell is a step the flow runs, in the order written; the publish cells say which steps
// readers get. Run on its own in a notebook page, each cell is what it says.
import { cell, md, param, sql } from 'smaltnb';
import { check, fill, publish, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ month: param.text('2024-01'), day: param.text('') });

cell('clean', { lang: 'md' });
md`# Clean
The day's trips come in, marked for filling from another day, checked, and deduplicated.`;

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

cell('places', { lang: 'md' });
md`# Places
The taxi zone lookup: each zone in its district, and the districts themselves.`;

cell('zones');
export const zones = source('zones');

cell('about_zone_list', { lang: 'md' });
md`The taxi zones, each in its district`;

cell('zone_list', { lang: 'sql' });
export const zone_list = sql`
  SELECT LocationID AS location_id, Zone AS zone, Borough AS borough, service_zone
  FROM ${zones}
  WHERE Borough NOT IN ('Unknown', 'N/A')`;

cell('about_districts', { lang: 'md' });
md`The districts: the five boroughs and Newark airport`;

cell('districts', { lang: 'sql' });
export const districts = sql`SELECT borough, count(*) AS zones FROM ${zone_list} GROUP BY 1`;

cell('enrich', { lang: 'md' });
md`# Enrich
Each clean trip in its pickup zone and borough, with its duration, pickup hour, speed and card tip rate.`;

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

cell('demand', { lang: 'md' });
md`# Demand
The enriched trips counted per pickup zone and hour, and per borough and hour.`;

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

cell('weather_stage', { lang: 'md' });
md`# Weather
Each district's hours labelled by condition, joined to the trips per borough and hour, and weather's effect on
demand against dry hours at the same hour of day.`;

cell('weather');
export const weather = source('weather');

cell('about_hourly', { lang: 'md' });
md`Each district's hour, labelled dry, rain, heavy rain or snow`;

cell('weather_hourly', { lang: 'sql' });
export const weather_hourly = sql`
  SELECT *,
    strftime('%Y-%m-%d %H:00', "time", '-1 hour') AS hour,
    CASE WHEN snowfall > 0 THEN 'snow' WHEN precipitation >= 2.5 THEN 'heavy rain' WHEN precipitation > 0 THEN 'rain' ELSE 'dry' END AS condition
  FROM ${weather}`;

cell('about_with_weather', { lang: 'md' });
md`Each borough's hour, with its weather`;

cell('borough_hour_weather', { lang: 'sql' });
const borough_hour_weather = sql`
  SELECT b.*, w.condition, w.temperature_2m AS temp_c, w.precipitation AS precip_mm
  FROM ${borough_hour} AS b LEFT JOIN ${weather_hourly} AS w ON b.pu_borough = w.borough AND b.pu_hour = w.hour`;

cell('about_effect', { lang: 'md' });
md`Trips per hour in each condition, against dry hours at the same hour of day`;

cell('weather_effect', { lang: 'sql' });
const weather_effect = sql`
  WITH h AS (
    SELECT pu_borough, condition, CAST(strftime('%H', pu_hour) AS INTEGER) AS hour_of_day, trips, filled, filled_from
    FROM ${borough_hour_weather} WHERE condition IS NOT NULL
  ), dry AS (
    SELECT pu_borough, hour_of_day, avg(trips) AS dry_trips FROM h WHERE condition = 'dry' GROUP BY 1, 2
  )
  SELECT h.pu_borough AS borough, h.condition, count(*) AS hours, avg(h.trips) AS trips_per_hour,
    avg(h.trips / d.dry_trips) AS vs_dry, sum(h.filled) AS filled, max(h.filled_from) AS filled_from
  FROM h JOIN dry d ON d.pu_borough = h.pu_borough AND d.hour_of_day = h.hour_of_day
  GROUP BY 1, 2`;

cell('published');
publish(zone_hour, { description: 'Trips per pickup zone and hour' });
publish(borough_hour);
publish(zone_list, { description: 'Taxi zones' });
publish(districts, { description: 'Districts' });
publish(weather_hourly, { description: 'Hourly weather per district, with a condition' });
publish(weather_effect, { description: "Weather's effect on demand, per borough" });
