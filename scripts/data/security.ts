/**
 * The security example's data (ADR 0010 phase 2): the synthetic sign-in log every phase's tests assert on
 * (test/fixtures/security.ts), written out as one CSV file a day, generated from its fixed seed rather than fetched. The
 * days up to the base's end are what the history is built from (scripts/data/history.ts, the general builder); the days
 * after are the loads the app steps through, the credential-stuffing burst of Tuesday March 12, 2024 among them.
 *
 *   node scripts/data/security.mjs OUT_DIR [--from 2023-10-02] [--base-to 2024-02-29] [--to 2024-03-21] [--scale 0.01]
 *
 * Writes OUT_DIR/days/auth_<day>.csv, OUT_DIR/base.json (the history's loads, `[{ file, slot }]`) and OUT_DIR/loads.json
 * (the app's, the same shape). At the default scale a day holds about 2,000 sign-ins.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { csvOf, securityDays, securityRows } from '../../test/fixtures/security.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1]! : fallback;
};
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!out) throw new Error('usage: node scripts/data/security.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--scale X]');
const from = flag('from', '2023-10-02');
const baseTo = flag('base-to', '2024-02-29');
const to = flag('to', '2024-03-21');
const scale = Number(flag('scale', '0.01'));
mkdirSync(join(out, 'days'), { recursive: true });
const base: { file: string; slot: string }[] = [];
const loads: { file: string; slot: string; rows: number }[] = [];
for (const plan of securityDays()) {
  if (plan.day < from || plan.day > to) continue;
  const rows = securityRows(plan, scale);
  const file = resolve(out, 'days', `auth_${plan.day}.csv`);
  writeFileSync(file, csvOf(rows));
  (plan.day <= baseTo ? base : loads).push({ file, slot: plan.day, rows: rows.length } as never);
}
writeFileSync(join(out, 'base.json'), JSON.stringify(base));
writeFileSync(join(out, 'loads.json'), JSON.stringify(loads));
console.log(`${out}: ${base.length} days for the history (${from} to ${baseTo}), ${loads.length} loads (to ${to}), at ${scale} of the fixture's rows`);
