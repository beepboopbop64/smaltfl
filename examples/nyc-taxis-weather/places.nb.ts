// The places (ADR 0011): the taxi zone lookup, each zone in its district, and the districts themselves.
import { cell, md, sql } from 'smaltnb';
import { publish, source } from 'smaltfl/notebook';

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

cell('published');
publish(zone_list, { description: 'Taxi zones' });
publish(districts, { description: 'Districts' });
