// The posture (ADR 0013): every application's standing on every control, one row an application, joined from the
// checked controls. The flow watches this dataset as it watches a source: its history is built from the days before,
// and what two controls do together is judged from it, with no rule naming the pair.
import { cell, md, sql } from 'smaltnb';
import { publish } from 'smaltfl/notebook';
import { apps, backup_checked, encryption_checked, logging_checked, mfa_checked, patching_checked, tls_checked } from './controls.nb.js';

cell('about', { lang: 'md' });
md`Every application's standing on every control: a blank where a control's file had no row for it`;

cell('posture', { lang: 'sql' });
export const posture = sql`
  SELECT a.app_id, a.name, a.business_unit, a.environment, a.tier,
         t.status AS tls, e.status AS encryption, m.status AS mfa, p.status AS patching, l.status AS logging, b.status AS backup
  FROM ${apps} a
  LEFT JOIN ${tls_checked} t ON t.app_id = a.app_id
  LEFT JOIN ${encryption_checked} e ON e.app_id = a.app_id
  LEFT JOIN ${mfa_checked} m ON m.app_id = a.app_id
  LEFT JOIN ${patching_checked} p ON p.app_id = a.app_id
  LEFT JOIN ${logging_checked} l ON l.app_id = a.app_id
  LEFT JOIN ${backup_checked} b ON b.app_id = a.app_id`;

cell('published');
publish(posture, { description: 'Every application’s standing on every control' });
