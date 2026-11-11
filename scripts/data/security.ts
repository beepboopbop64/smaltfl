/**
 * The security example's data (ADR 0010 phase 2): the synthetic sign-in log every phase's tests assert on
 * (test/fixtures/security.ts), written out as one CSV file a day, generated from its fixed seed rather than fetched. The
 * days up to the base's end are what the history is built from (scripts/data/history.ts, the general builder); the days
 * after are the loads the app steps through, the credential-stuffing burst of Tuesday March 12, 2024 among them.
 *
 *   node scripts/data/security.mjs OUT_DIR [--from 2023-03-01] [--base-to 2024-02-29] [--to 2024-03-21] [--scale 0.01] [--demo]
 *
 * More data over time is a wider span: `--from` reaches further back for a longer history (a year by default, so last
 * year's same day is there to guess from), `--to` further on for more loads. Every day is drawn from the fixture's
 * fixed seed, so a day's file is the same whichever span it is written in.
 *
 * `--demo` plants the demo's days among the loads (`SIGNIN_DEMO`, `DEMO_DAYS` in the fixture): a day on which nothing
 * arrived (Fri Mar 15), a day whose amount is fine but one column's mix is off (Mon Mar 18), a day on which a
 * combination is off (Wed Mar 20, lock-outs through API keys), and two days only the models see (ADR 0015 §6): every
 * value nudged a little, each inside its own range (Thu Mar 14, the forest's), and a client release that moves most
 * people's sign-ins to the phone's app, which no count the history keeps sees (Tue Mar 19, the classifier's). The
 * history is built from the days before them, so none is learned from. The examples build at `--scale 0.03` (about
 * 6,000 sign-ins a day), the scale test/models.test.ts checks the models at.
 *
 * Writes OUT_DIR/days/auth_<day>.csv, OUT_DIR/base.json (the history's loads, `[{ file, slot }]`) and OUT_DIR/loads.json
 * (the app's, the same shape). At the default scale a day holds about 2,000 sign-ins.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { csvOf, securityDays, securityRows, SIGNIN_DEMO, type SecurityOptions } from '../../test/fixtures/security.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1]! : fallback;
};
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!out) throw new Error('usage: node scripts/data/security.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--scale X]');
const from = flag('from', '2023-03-01');
const baseTo = flag('base-to', '2024-02-29');
const to = flag('to', '2024-03-21');
const scale = Number(flag('scale', '0.01'));
const options: SecurityOptions = args.includes('--demo') ? SIGNIN_DEMO : {};
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
