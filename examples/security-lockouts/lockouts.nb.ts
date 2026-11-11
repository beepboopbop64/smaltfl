// Lock-outs (ADR 0011): a second flow from the sign-in file the Sign-ins flow reads. Its meanings and rules are the
// file's shared ontology (examples/ontologies/auth.json): the check cell below enforces them, and lists them by name to
// switch each on or off, so a rule changed there reaches this flow and the Sign-ins flow alike.
import { cell, md, param, sql } from 'smaltnb';
import { check, publish, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ day: param.text('') });

cell('auth');
export const auth = source('auth');

cell('about', { lang: 'md' });
md`The day's sign-ins, by the sign-in file's shared rules`;

cell('signins_checked');
export const signins_checked = check(auth, {
  rules: [{ name: 'on_the_day', check: 'substr(event_time, 1, 10) = :day', onFail: 'drop' }],
  maxDropped: 0.05,
  ontology: { method_one_of: 'on', latency_ms_range: 'on', country_required: 'on' },
});

cell('by_user', { lang: 'md' });
md`The users locked out, and how many times`;

cell('locked_users', { lang: 'sql' });
export const locked_users = sql`
  SELECT user, count(*) AS lockouts
  FROM ${signins_checked}
  WHERE result = 'locked'
  GROUP BY 1`;

cell('by_method', { lang: 'md' });
md`Lock-outs by how the user signed in`;

cell('lockouts_by_method', { lang: 'sql' });
export const lockouts_by_method = sql`
  SELECT method, sum(CASE WHEN result = 'locked' THEN 1 ELSE 0 END) AS lockouts, count(*) AS attempts
  FROM ${signins_checked}
  GROUP BY 1`;

cell('published');
publish(locked_users, { description: 'Users locked out' });
publish(lockouts_by_method, { description: 'Lock-outs by method' });
