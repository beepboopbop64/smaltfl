// Demand (ADR 0011): the enriched trips counted per pickup zone and hour, and per borough and hour. Both are
// published; the weather stage reads the borough counts.
import { cell, md, sql } from 'smaltnb';
import { publish } from 'smaltfl/notebook';
import { trips_enriched } from './enrich.nb.js';

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

cell('published');
publish(zone_hour, { description: 'Trips per pickup zone and hour' });
publish(borough_hour);
