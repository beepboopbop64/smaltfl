// The posture: every application's standing on every control that applies to it, one row an application, joined
// from the checked controls. The flow watches this dataset as it watches a source: its history is built from the days
// before, and what two controls do together is judged from it. A blank is a control that doesn't apply to the
// application, or one whose file had no row for it that day: the two look alike here, and telling them apart is one of
// the questions this dataset is for.
import { cell, md, sql } from 'smaltnb';
import { publish } from 'smaltfl/notebook';
import { access_review_checked, apps, backup_checked, dr_exercise_checked, encryption_checked, key_rotation_checked, logging_checked, mfa_checked, pentest_checked, privileged_access_checked, tls_checked, vuln_sla_checked, waf_checked } from './controls.nb.js';

cell('about', { lang: 'md' });
md`Every application's standing on every control: a blank where the control doesn't apply, or its file had no row`;

cell('posture', { lang: 'sql' });
export const posture = sql`
  SELECT a.app_id, a.name, a.business_unit, a.criticality, a.internet_facing, a.data_class, a.datastore, a.hosting, a.lifecycle,
         t0.status AS tls, w1.status AS waf, p2.status AS pentest, e3.status AS encryption, k4.status AS key_rotation, b5.status AS backup, d6.status AS dr_exercise, v7.status AS vuln_sla, m8.status AS mfa, a9.status AS access_review, l10.status AS logging, p11.status AS privileged_access
  FROM ${apps} a
  LEFT JOIN ${tls_checked} t0 ON t0.app_id = a.app_id
  LEFT JOIN ${waf_checked} w1 ON w1.app_id = a.app_id
  LEFT JOIN ${pentest_checked} p2 ON p2.app_id = a.app_id
  LEFT JOIN ${encryption_checked} e3 ON e3.app_id = a.app_id
  LEFT JOIN ${key_rotation_checked} k4 ON k4.app_id = a.app_id
  LEFT JOIN ${backup_checked} b5 ON b5.app_id = a.app_id
  LEFT JOIN ${dr_exercise_checked} d6 ON d6.app_id = a.app_id
  LEFT JOIN ${vuln_sla_checked} v7 ON v7.app_id = a.app_id
  LEFT JOIN ${mfa_checked} m8 ON m8.app_id = a.app_id
  LEFT JOIN ${access_review_checked} a9 ON a9.app_id = a.app_id
  LEFT JOIN ${logging_checked} l10 ON l10.app_id = a.app_id
  LEFT JOIN ${privileged_access_checked} p11 ON p11.app_id = a.app_id`;

cell('published');
publish(posture, { description: 'Every application’s standing on every control that applies to it' });
