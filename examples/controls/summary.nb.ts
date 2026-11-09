// The summaries (ADR 0013): the posture counted by business unit and by control, what leadership reads.
import { cell, md, sql } from 'smaltnb';
import { publish } from 'smaltfl/notebook';
import { posture } from './posture.nb.js';

cell('about_unit', { lang: 'md' });
md`Applications failing each control, by business unit`;

cell('by_unit', { lang: 'sql' });
export const by_unit = sql`
  SELECT business_unit, count(*) AS apps,
         sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS tls_failing,
         sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END) AS encryption_failing,
         sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END) AS mfa_failing,
         sum(CASE WHEN patching = 'fail' THEN 1 ELSE 0 END) AS patching_failing,
         sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END) AS logging_failing,
         sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END) AS backup_failing
  FROM ${posture}
  GROUP BY 1`;

cell('about_control', { lang: 'md' });
md`Applications failing, by control`;

cell('by_control', { lang: 'sql' });
export const by_control = sql`
  SELECT 'tls' AS control, sum(CASE WHEN tls = 'fail' THEN 1 ELSE 0 END) AS failing, count(tls) AS apps FROM ${posture}
  UNION ALL SELECT 'encryption', sum(CASE WHEN encryption = 'fail' THEN 1 ELSE 0 END), count(encryption) FROM ${posture}
  UNION ALL SELECT 'mfa', sum(CASE WHEN mfa = 'fail' THEN 1 ELSE 0 END), count(mfa) FROM ${posture}
  UNION ALL SELECT 'patching', sum(CASE WHEN patching = 'fail' THEN 1 ELSE 0 END), count(patching) FROM ${posture}
  UNION ALL SELECT 'logging', sum(CASE WHEN logging = 'fail' THEN 1 ELSE 0 END), count(logging) FROM ${posture}
  UNION ALL SELECT 'backup', sum(CASE WHEN backup = 'fail' THEN 1 ELSE 0 END), count(backup) FROM ${posture}`;

cell('published');
publish(by_unit, { description: 'Failing applications by business unit' });
publish(by_control, { description: 'Failing applications by control' });
