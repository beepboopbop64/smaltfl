// The sign-ins, checked (ADR 0011): the first stage of the Sign-ins flow (flow.json), as a smaltnb notebook. The flow
// reads this notebook's exported cells as its steps; run on its own in a notebook page, each cell is what it says.
import { cell, md, param } from 'smaltnb';
import { check, publish, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ day: param.text('') });

cell('auth');
export const auth = source('auth');

cell('about', { lang: 'md' });
md`Sign-ins with a known result, on the day`;

cell('auth_valid');
export const auth_valid = check(auth, {
  rules: [
    { name: 'known_result', check: "result IN ('success', 'fail', 'locked')", onFail: 'drop' },
    { name: 'in_day', check: 'substr(event_time, 1, 10) = :day', onFail: 'drop' },
    { name: 'has_user', check: 'user IS NOT NULL', onFail: 'warn' },
  ],
  maxDropped: 0.05,
  ontology: { method_one_of: 'on', latency_ms_range: 'on', country_required: 'on' },
});

cell('published');
publish(auth_valid, { description: 'Checked sign-ins' });
