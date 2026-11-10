// The summaries: the posture counted by business unit, by control and by application type, what leadership reads.
import { cell, md, sql } from 'smaltnb';
import { gate, publish } from 'smaltfl/notebook';
import { posture } from './posture.nb.js';

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

cell('about_gates', { lang: 'md' });
md`The gold gate on what leadership reads: the columns as declared, the rules, and the rows reconciled with the posture; sealed when every gate passed`;

cell('by_unit_gate');
export const by_unit_gate = gate(by_unit, { layer: 'gold' });

cell('by_control_gate');
export const by_control_gate = gate(by_control, { layer: 'gold' });

cell('by_type_gate');
export const by_type_gate = gate(by_type, { layer: 'gold' });

cell('published');
publish(by_unit, { description: 'Failing applications by business unit' });
publish(by_control, { description: 'Assessed and failing applications by control' });
publish(by_type, { description: 'Failing applications by application type' });
