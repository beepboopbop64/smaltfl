/**
 * The security example's data (ADR 0010 phase 2): the synthetic sign-in log every phase's tests assert on
 * (test/fixtures/security.ts), written out as one CSV file a day, generated from its fixed seed rather than fetched. The
 * days up to the base's end are what the history is built from (scripts/data/history.ts, the general builder); the days
 * after are the loads the app steps through, the credential-stuffing burst of Tuesday March 12, 2024 among them.
 *
 *   node scripts/data/security.mjs OUT_DIR [--from 2023-10-02] [--base-to 2024-02-29] [--to 2024-03-21] [--scale 0.01] [--demo]
 *
 * `--demo` plants three more days among the loads, the kinds of trouble a reader should see told apart (ADR 0012): a day
 * on which nothing arrived (Fri Mar 15: the file has its header and no rows), a day whose amount is fine but one
 * column's mix is off (Mon Mar 18: half the sign-ins through single sign-on, usually three in ten), and a day on which a
 * combination is off (Wed Mar 20: lock-outs through API keys, a pair never seen at that share). The history is built
 * from the days before them, so none of the three is learned from.
 *
 * Writes OUT_DIR/days/auth_<day>.csv, OUT_DIR/base.json (the history's loads, `[{ file, slot }]`) and OUT_DIR/loads.json
 * (the app's, the same shape). At the default scale a day holds about 2,000 sign-ins.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { csvOf, securityDays, securityRows, type SecurityOptions } from '../../test/fixtures/security.js';

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
const business = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
/** The demo's three days (above): missing, one column off, one combination off. Rows are the fixture's, times `scale`. */
const DEMO: SecurityOptions = {
  missing: ['2024-03-15'],
  // Mon Mar 18: as many sign-ins as usual, but half of them through single sign-on (usually three in ten).
  shares: { '2024-03-18': { method: { password: 0.25, sso: 0.5, mfa_push: 0.2, passkey: 0.03, api_key: 0.02 } } },
  // Wed Mar 20: lock-outs through API keys, in business hours, a combination never seen at that share.
  extra: { '2024-03-20': [{ n: 8_000, hours: business, dist: { result: { locked: 1 }, method: { api_key: 1 }, country: { US: 1 }, ua_family: { 'python-requests': 1 } } }] },
};
const options: SecurityOptions = args.includes('--demo') ? DEMO : {};
mkdirSync(join(out, 'days'), { recursive: true });
const base: { file: string; slot: string }[] = [];
const loads: { file: string; slot: string; rows: number }[] = [];
for (const plan of securityDays(options)) {
  if (plan.day < from || plan.day > to) continue;
  const rows = securityRows(plan, scale);
  const file = resolve(out, 'days', `auth_${plan.day}.csv`);
  writeFileSync(file, csvOf(rows));
  (plan.day <= baseTo ? base : loads).push({ file, slot: plan.day, rows: rows.length } as never);
}
writeFileSync(join(out, 'base.json'), JSON.stringify(base));
writeFileSync(join(out, 'loads.json'), JSON.stringify(loads));
console.log(`${out}: ${base.length} days for the history (${from} to ${baseTo}), ${loads.length} loads (to ${to}), at ${scale} of the fixture's rows`);
