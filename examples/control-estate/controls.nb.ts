// The controls, checked: the first stage of the Control estate flow (flow.json). Each control arrives as its own file,
// one row an application it applies to, with its own columns; each is checked on its own, for a known status and an
// application id. The flow reads this notebook's exported cells as its steps.
import { cell, md, param } from 'smaltnb';
import { check, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ day: param.text('') });

cell('apps');
export const apps = source('apps');

cell('tls');
export const tls = source('tls');

cell('waf');
export const waf = source('waf');

cell('pentest');
export const pentest = source('pentest');

cell('encryption');
export const encryption = source('encryption');

cell('key_rotation');
export const key_rotation = source('key_rotation');

cell('backup');
export const backup = source('backup');

cell('dr_exercise');
export const dr_exercise = source('dr_exercise');

cell('vuln_sla');
export const vuln_sla = source('vuln_sla');

cell('mfa');
export const mfa = source('mfa');

cell('access_review');
export const access_review = source('access_review');

cell('logging');
export const logging = source('logging');

cell('privileged_access');
export const privileged_access = source('privileged_access');

cell('about_checks', { lang: 'md' });
md`Each control's rows, kept when the status is one we know (pass, fail, exception, not_assessed) and the application is named`;

cell('tls_checked');
export const tls_checked = check(tls, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('waf_checked');
export const waf_checked = check(waf, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('pentest_checked');
export const pentest_checked = check(pentest, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('encryption_checked');
export const encryption_checked = check(encryption, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('key_rotation_checked');
export const key_rotation_checked = check(key_rotation, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('backup_checked');
export const backup_checked = check(backup, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('dr_exercise_checked');
export const dr_exercise_checked = check(dr_exercise, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('vuln_sla_checked');
export const vuln_sla_checked = check(vuln_sla, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('mfa_checked');
export const mfa_checked = check(mfa, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('access_review_checked');
export const access_review_checked = check(access_review, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('logging_checked');
export const logging_checked = check(logging, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});

cell('privileged_access_checked');
export const privileged_access_checked = check(privileged_access, {
  rules: [
    { name: 'known_status', check: "status IN ('pass', 'fail', 'exception', 'not_assessed')", onFail: 'drop' },
    { name: 'has_app', check: 'app_id IS NOT NULL', onFail: 'drop' },
  ],
  maxDropped: 0.05,
});
