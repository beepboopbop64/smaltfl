// The trips, placed and enriched (ADR 0011): each clean trip in its pickup zone and borough, with its duration,
// pickup hour, speed and card tip rate. Exported for the demand stage; not published.
import { cell, md, sql } from 'smaltnb';
import { trips_dedup } from './clean.nb.js';
import { zones } from './places.nb.js';

cell('about_zoned', { lang: 'md' });
md`Each trip's pickup borough and zone`;

cell('trips_zoned', { lang: 'sql' });
const trips_zoned = sql`
  SELECT t.*, z.Borough AS pu_borough, z.Zone AS pu_zone
  FROM ${trips_dedup} AS t LEFT JOIN ${zones} AS z ON t.PULocationID = z.LocationID`;

cell('about_enriched', { lang: 'md' });
md`Duration, pickup hour, speed and card tip rate`;

cell('trips_enriched', { lang: 'sql' });
export const trips_enriched = sql`
  SELECT *, trip_distance / (duration_min / 60.0) AS speed_mph
  FROM (
    SELECT *,
      (unixepoch(tpep_dropoff_datetime) - unixepoch(tpep_pickup_datetime)) / 60.0 AS duration_min,
      strftime('%Y-%m-%d %H:00', tpep_pickup_datetime) AS pu_hour,
      CASE WHEN payment_type = 1 AND fare_amount > 0 THEN tip_amount / fare_amount END AS card_tip_rate
    FROM ${trips_zoned}
  )`;
