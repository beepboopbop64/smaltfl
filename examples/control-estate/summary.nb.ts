// The summaries: the posture counted by business unit, by control and by application type, what leadership reads.
import { cell, md, sql } from 'smaltnb';
import { gate, publish } from 'smaltfl/notebook';
import { posture } from './posture.nb.js';
import { app_scores } from './scores.nb.js';

cell('about_unit', { lang: 'md' });
md`Applications failing each control, by business unit`;

cell('by_unit', { lang: 'sql' });
export const by_unit = sql`
  SELECT business_unit, count(*) AS apps,
         sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls_failing,
         sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf_failing,
         sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest_failing,
         sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption_failing,
         sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation_failing,
         sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup_failing,
         sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise_failing,
         sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla_failing,
         sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa_failing,
         sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review_failing,
         sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging_failing,
         sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access_failing
  FROM ${posture}
  GROUP BY 1`;

cell('about_control', { lang: 'md' });
md`Applications assessed and failing, by control`;

cell('by_control', { lang: 'sql' });
export const by_control = sql`
  SELECT 'tls' AS control, count(tls) AS assessed, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'waf' AS control, count(waf) AS assessed, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'pentest' AS control, count(pentest) AS assessed, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'encryption' AS control, count(encryption) AS assessed, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'key_rotation' AS control, count(key_rotation) AS assessed, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'backup' AS control, count(backup) AS assessed, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'dr_exercise' AS control, count(dr_exercise) AS assessed, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'vuln_sla' AS control, count(vuln_sla) AS assessed, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'mfa' AS control, count(mfa) AS assessed, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'access_review' AS control, count(access_review) AS assessed, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'logging' AS control, count(logging) AS assessed, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}
  UNION ALL SELECT 'privileged_access' AS control, count(privileged_access) AS assessed, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture}`;

cell('about_type', { lang: 'md' });
md`Applications failing each control, by type: internet-facing, critical, regulated data, or none of these`;

cell('by_type', { lang: 'sql' });
export const by_type = sql`
  SELECT CASE WHEN internet_facing = 'yes' THEN 'internet-facing' WHEN criticality = 'critical' THEN 'critical' WHEN data_class IN ('pci', 'pii') THEN 'regulated' ELSE 'other' END AS app_type,
         count(*) AS apps,
         sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls_failing,
         sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf_failing,
         sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest_failing,
         sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption_failing,
         sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation_failing,
         sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup_failing,
         sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise_failing,
         sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla_failing,
         sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa_failing,
         sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review_failing,
         sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging_failing,
         sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access_failing
  FROM ${posture}
  GROUP BY 1`;

cell('about_profile', { lang: 'md' });
md`Applications by where they run and how critical they are: the controls failed on average, how many pass every control that applies, how many fail one or two, and how many fail three or more`;

cell('by_profile', { lang: 'sql' });
export const by_profile = sql`
  SELECT hosting, criticality, count(*) AS apps,
         round(avg(failed), 2) AS failed_per_app,
         sum(CASE WHEN standing = 'passing' THEN 1 ELSE 0 END) AS all_passed,
         sum(CASE WHEN standing = 'unknown' THEN 1 ELSE 0 END) AS unsettled,
         sum(CASE WHEN standing = 'failing' THEN 1 ELSE 0 END) AS failing_some,
         sum(CASE WHEN standing = 'at_risk' THEN 1 ELSE 0 END) AS at_risk
  FROM ${app_scores}
  GROUP BY hosting, criticality`;

cell('about_control_type', { lang: 'md' });
md`Each control by where the application runs and how critical it is: the applications it applies to and how many fail it, so a control that fails one kind of application stands out`;

cell('control_by_type', { lang: 'sql' });
export const control_by_type = sql`
  SELECT 'tls' AS control, hosting, criticality, count(tls) AS apps, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE tls IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'waf' AS control, hosting, criticality, count(waf) AS apps, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE waf IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'pentest' AS control, hosting, criticality, count(pentest) AS apps, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE pentest IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'encryption' AS control, hosting, criticality, count(encryption) AS apps, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE encryption IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'key_rotation' AS control, hosting, criticality, count(key_rotation) AS apps, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE key_rotation IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'backup' AS control, hosting, criticality, count(backup) AS apps, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE backup IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'dr_exercise' AS control, hosting, criticality, count(dr_exercise) AS apps, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE dr_exercise IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'vuln_sla' AS control, hosting, criticality, count(vuln_sla) AS apps, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE vuln_sla IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'mfa' AS control, hosting, criticality, count(mfa) AS apps, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE mfa IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'access_review' AS control, hosting, criticality, count(access_review) AS apps, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE access_review IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'logging' AS control, hosting, criticality, count(logging) AS apps, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE logging IS NOT NULL GROUP BY hosting, criticality UNION ALL 
  SELECT 'privileged_access' AS control, hosting, criticality, count(privileged_access) AS apps, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS failing FROM ${posture} WHERE privileged_access IS NOT NULL GROUP BY hosting, criticality`;

cell('about_together', { lang: 'md' });
md`The controls failed together: for the applications failing each control, how many fail each other control too`;

cell('failed_together', { lang: 'sql' });
export const failed_together = sql`
  SELECT 'tls' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE tls = 'fail' UNION ALL 
  SELECT 'waf' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE waf = 'fail' UNION ALL 
  SELECT 'pentest' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE pentest = 'fail' UNION ALL 
  SELECT 'encryption' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE encryption = 'fail' UNION ALL 
  SELECT 'key_rotation' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE key_rotation = 'fail' UNION ALL 
  SELECT 'backup' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE backup = 'fail' UNION ALL 
  SELECT 'dr_exercise' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE dr_exercise = 'fail' UNION ALL 
  SELECT 'vuln_sla' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE vuln_sla = 'fail' UNION ALL 
  SELECT 'mfa' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE mfa = 'fail' UNION ALL 
  SELECT 'access_review' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE access_review = 'fail' UNION ALL 
  SELECT 'logging' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE logging = 'fail' UNION ALL 
  SELECT 'privileged_access' AS control, count(*) AS failing, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls, sum(CASE WHEN waf = 'fail' THEN 1 ELSE 0 END) AS waf, sum(CASE WHEN pentest = 'fail' THEN 1 ELSE 0 END) AS pentest, sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption, sum(CASE WHEN key_rotation = 'fail' THEN 1 ELSE 0 END) AS key_rotation, sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup, sum(CASE WHEN dr_exercise = 'fail' THEN 1 ELSE 0 END) AS dr_exercise, sum(CASE WHEN vuln_sla = 'fail' THEN 1 ELSE 0 END) AS vuln_sla, sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa, sum(CASE WHEN access_review = 'fail' THEN 1 ELSE 0 END) AS access_review, sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging, sum(CASE WHEN privileged_access = 'fail' THEN 1 ELSE 0 END) AS privileged_access FROM ${posture} WHERE privileged_access = 'fail'`;

cell('about_gates', { lang: 'md' });
md`The gold gate on what leadership reads: the columns as declared, the rules, and the rows reconciled with the posture; sealed when every gate passed`;

cell('by_unit_gate');
export const by_unit_gate = gate(by_unit, { layer: 'gold', reconcile: { key: 'business_unit', of: posture } });

cell('by_control_gate');
export const by_control_gate = gate(by_control, { layer: 'gold', reconcile: { key: 'control' } });

cell('by_type_gate');
export const by_type_gate = gate(by_type, { layer: 'gold', reconcile: { key: 'app_type' } });

cell('by_profile_gate');
export const by_profile_gate = gate(by_profile, { layer: 'gold', reconcile: { key: ['hosting', 'criticality'] } });

cell('control_by_type_gate');
export const control_by_type_gate = gate(control_by_type, { layer: 'gold', reconcile: { key: ['control', 'hosting', 'criticality'] } });

cell('failed_together_gate');
export const failed_together_gate = gate(failed_together, { layer: 'gold', reconcile: { key: 'control' } });

cell('published');
publish(by_unit, { description: 'Failing applications by business unit' });
publish(by_control, { description: 'Assessed and failing applications by control' });
publish(by_type, { description: 'Failing applications by application type' });
publish(by_profile, { description: 'Applications passing, failing and at risk, by hosting and criticality' });
publish(control_by_type, { description: 'Each control’s failures by hosting and criticality' });
publish(failed_together, { description: 'The controls failed together' });
