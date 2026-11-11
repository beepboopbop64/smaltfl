// Each application scored: how many of the controls that apply to it it passes and fails, which ones it fails, and its
// standing in one word. One row an application, from the posture; what the summaries count by type of application.
import { cell, md, sql } from 'smaltnb';
import { gate, publish } from 'smaltfl/notebook';
import { posture } from './posture.nb.js';

cell('about', { lang: 'md' });
md`Each application: the controls that apply, passing, failing and not settled, and its standing: passing with every control that applies passed or excepted, failing with one or two failed, at risk with three or more`;

cell('app_scores', { lang: 'sql' });
export const app_scores = sql`
  SELECT app_id, name,
         CASE WHEN failed >= 3 THEN 'at_risk' WHEN failed > 0 THEN 'failing' WHEN not_assessed > 0 THEN 'unknown' ELSE 'passing' END AS standing,
         failed, failed_controls, passed, excepted, not_assessed, applicable,
         business_unit, criticality, internet_facing, data_class, hosting, lifecycle
  FROM (
    SELECT app_id, name, business_unit, criticality, internet_facing, data_class, hosting, lifecycle,
           CASE WHEN tls IS NULL THEN 0 ELSE 1 END + CASE WHEN waf IS NULL THEN 0 ELSE 1 END + CASE WHEN pentest IS NULL THEN 0 ELSE 1 END + CASE WHEN encryption IS NULL THEN 0 ELSE 1 END + CASE WHEN key_rotation IS NULL THEN 0 ELSE 1 END + CASE WHEN backup IS NULL THEN 0 ELSE 1 END + CASE WHEN dr_exercise IS NULL THEN 0 ELSE 1 END + CASE WHEN vuln_sla IS NULL THEN 0 ELSE 1 END + CASE WHEN mfa IS NULL THEN 0 ELSE 1 END + CASE WHEN access_review IS NULL THEN 0 ELSE 1 END + CASE WHEN logging IS NULL THEN 0 ELSE 1 END + CASE WHEN privileged_access IS NULL THEN 0 ELSE 1 END AS applicable,
           CASE WHEN tls = 'pass' THEN 1 ELSE 0 END + CASE WHEN waf = 'pass' THEN 1 ELSE 0 END + CASE WHEN pentest = 'pass' THEN 1 ELSE 0 END + CASE WHEN encryption = 'pass' THEN 1 ELSE 0 END + CASE WHEN key_rotation = 'pass' THEN 1 ELSE 0 END + CASE WHEN backup = 'pass' THEN 1 ELSE 0 END + CASE WHEN dr_exercise = 'pass' THEN 1 ELSE 0 END + CASE WHEN vuln_sla = 'pass' THEN 1 ELSE 0 END + CASE WHEN mfa = 'pass' THEN 1 ELSE 0 END + CASE WHEN access_review = 'pass' THEN 1 ELSE 0 END + CASE WHEN logging = 'pass' THEN 1 ELSE 0 END + CASE WHEN privileged_access = 'pass' THEN 1 ELSE 0 END AS passed,
           CASE WHEN tls = 'fail' THEN 1 ELSE 0 END + CASE WHEN waf = 'fail' THEN 1 ELSE 0 END + CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END + CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END + CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END + CASE WHEN backup = 'fail' THEN 1 ELSE 0 END + CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END + CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END + CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END + CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END + CASE WHEN logging = 'fail' THEN 1 ELSE 0 END + CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END AS failed,
           CASE WHEN tls = 'exception' THEN 1 ELSE 0 END + CASE WHEN waf = 'exception' THEN 1 ELSE 0 END + CASE WHEN pentest = 'exception' THEN 1 ELSE 0 END + CASE WHEN encryption = 'exception' THEN 1 ELSE 0 END + CASE WHEN key_rotation = 'exception' THEN 1 ELSE 0 END + CASE WHEN backup = 'exception' THEN 1 ELSE 0 END + CASE WHEN dr_exercise = 'exception' THEN 1 ELSE 0 END + CASE WHEN vuln_sla = 'exception' THEN 1 ELSE 0 END + CASE WHEN mfa = 'exception' THEN 1 ELSE 0 END + CASE WHEN access_review = 'exception' THEN 1 ELSE 0 END + CASE WHEN logging = 'exception' THEN 1 ELSE 0 END + CASE WHEN privileged_access = 'exception' THEN 1 ELSE 0 END AS excepted,
           CASE WHEN tls = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN waf = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN pentest = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN encryption = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN key_rotation = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN backup = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN dr_exercise = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN vuln_sla = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN mfa = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN access_review = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN logging = 'not_assessed' THEN 1 ELSE 0 END + CASE WHEN privileged_access = 'not_assessed' THEN 1 ELSE 0 END AS not_assessed,
           trim(CASE WHEN tls = 'fail' THEN ' tls' ELSE '' END || CASE WHEN waf = 'fail' THEN ' waf' ELSE '' END || CASE WHEN pentest = 'fail' THEN ' pentest' ELSE '' END || CASE WHEN encryption = 'fail' THEN ' encryption' ELSE '' END || CASE WHEN key_rotation = 'fail' THEN ' key_rotation' ELSE '' END || CASE WHEN backup = 'fail' THEN ' backup' ELSE '' END || CASE WHEN dr_exercise = 'fail' THEN ' dr_exercise' ELSE '' END || CASE WHEN vuln_sla = 'fail' THEN ' vuln_sla' ELSE '' END || CASE WHEN mfa = 'fail' THEN ' mfa' ELSE '' END || CASE WHEN access_review = 'fail' THEN ' access_review' ELSE '' END || CASE WHEN logging = 'fail' THEN ' logging' ELSE '' END || CASE WHEN privileged_access = 'fail' THEN ' privileged_access' ELSE '' END) AS failed_controls
    FROM ${posture}
  ) s
  ORDER BY failed DESC, app_id`;

cell('about_gate', { lang: 'md' });
md`The silver gate: one row an application of the posture, every one once`;

cell('app_scores_gate');
export const app_scores_gate = gate(app_scores, { layer: 'silver', reconcile: { key: 'app_id', of: posture } });

cell('published');
publish(app_scores, { description: 'Each application’s controls passed and failed, and its standing' });
