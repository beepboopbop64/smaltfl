// The controls, checked (ADR 0013): the first stage of the Controls posture flow (flow.json), as a smaltnb notebook.
// Each control arrives as its own file, one row an application, with its own columns; each is checked on its own, for
// a known status and an application id. The flow reads this notebook's exported cells as its steps.
import { cell, md, param } from 'smaltnb';
import { check, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ day: param.text('') });

cell('apps');
export const apps = source('apps');

cell('tls');
export const tls = source('tls');

cell('encryption');
export const encryption = source('encryption');

cell('mfa');
export const mfa = source('mfa');

cell('patching');
export const patching = source('patching');

cell('logging');
export const logging = source('logging');

cell('backup');
export const backup = source('backup');

cell('about_checks', { lang: 'md' });
md`Each control's rows, kept when the status is one we know and the application is named (the same two rules for each)`;

cell('tls_checked');
export const tls_checked = check(tls, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('encryption_checked');
export const encryption_checked = check(encryption, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('mfa_checked');
export const mfa_checked = check(mfa, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('patching_checked');
export const patching_checked = check(patching, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('logging_checked');
export const logging_checked = check(logging, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('backup_checked');
export const backup_checked = check(backup, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});
