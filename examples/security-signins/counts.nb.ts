// The sign-ins counted (ADR 0011): the second stage of the Sign-ins flow, over the checked sign-ins the first stage
// exports. Each exported sql cell is a dataset the flow publishes, under the cell's name.
import { cell, md, sql } from 'smaltnb';
import { auth_valid } from './checks.nb.js';

cell('by_hour', { lang: 'md' });
md`Sign-ins by hour`;

cell('signins_by_hour', { lang: 'sql' });
export const signins_by_hour = sql`
  SELECT CAST(substr(event_time, 12, 2) AS INTEGER) AS hour, result, count(*) AS signins, count(DISTINCT user) AS users
  FROM ${auth_valid}
  GROUP BY 1, 2`;

cell('by_country', { lang: 'md' });
md`Failures by country`;

cell('failures_by_country', { lang: 'sql' });
export const failures_by_country = sql`
  SELECT country, ua_family, sum(CASE WHEN result IN ('fail', 'locked') THEN 1 ELSE 0 END) AS failures, count(*) AS signins
  FROM ${auth_valid}
  GROUP BY 1, 2`;
