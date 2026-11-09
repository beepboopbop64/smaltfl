// The weather (ADR 0011): each district's hours labelled by condition, joined to the trips per borough and hour, and
// weather's effect on demand against dry hours at the same hour of day.
import { cell, md, sql } from 'smaltnb';
import { publish, source } from 'smaltfl/notebook';
import { borough_hour } from './demand.nb.js';

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
publish(weather_hourly, { description: 'Hourly weather per district, with a condition' });
publish(weather_effect, { description: "Weather's effect on demand, per borough" });
