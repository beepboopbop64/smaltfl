/**
 * The control estate's data (test/fixtures/estate.ts): the inventory and one CSV file a day per control, from the
 * fixture's seed. The days up to the base's end are what each watch's history is built from (scripts/data/history.ts,
 * one history a watch, the posture's by running the flow on each day's files); the days after are the loads the app
 * steps through, the planted days of March 2024 among them.
 *
 *   node scripts/data/estate.mjs OUT_DIR [--from 2023-03-01] [--base-to 2024-02-29] [--to 2024-03-31] [--calm]
 *
 * Writes OUT_DIR/apps.csv, OUT_DIR/days/<control>_<day>.csv, OUT_DIR/base.<watch>.json for each control (`[{ file,
 * slot }]`) and for the posture (`[{ slot, files: { apps, tls, … } }]`), and OUT_DIR/loads.json: the app's loads,
 * `{ fixed: { apps }, loads: [{ slot, files: { <control>: { file, rows } } }] }`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appsCsv, csvOf, ESTATE_CONTROLS, estateApps, estateDays, estateRows, HISTORY_FROM, LOADS_TO } from '../../test/fixtures/estate.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1]! : fallback;
};
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--') && args[i - 1] !== '--calm');
if (!out) throw new Error('usage: node scripts/data/estate.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--calm]');
const from = flag('from', HISTORY_FROM);
const baseTo = flag('base-to', '2024-02-29');
const to = flag('to', LOADS_TO);
const options = { incidents: !args.includes('--calm') };

mkdirSync(join(out, 'days'), { recursive: true });
const apps = estateApps(options);
const appsPath = resolve(out, 'apps.csv');
writeFileSync(appsPath, appsCsv(apps));
const base: Record<string, { file?: string; slot: string; files?: Record<string, string> }[]> = Object.fromEntries([...ESTATE_CONTROLS, 'posture'].map((w) => [w, []]));
const loads: { slot: string; files: Record<string, { file: string; rows: number }> }[] = [];
let days = 0;
const started = Date.now();
for (const day of estateDays()) {
  if (day < from || day > to) continue;
  days++;
  const files: Record<string, string> = { apps: appsPath };
  const load: Record<string, { file: string; rows: number }> = {};
  for (const c of ESTATE_CONTROLS) {
    const { columns, rows } = estateRows(c, day, apps, options);
    const file = resolve(out, 'days', `${c}_${day}.csv`);
    writeFileSync(file, csvOf(columns, rows));
    files[c] = file;
    load[c] = { file, rows: rows.length };
    if (day <= baseTo) base[c]!.push({ file, slot: day });
  }
  if (day <= baseTo) base.posture!.push({ slot: day, files });
  else loads.push({ slot: day, files: load });
}
for (const [w, list] of Object.entries(base)) writeFileSync(join(out, `base.${w}.json`), JSON.stringify(list));
writeFileSync(join(out, 'loads.json'), JSON.stringify({ fixed: { apps: appsPath }, loads }));
console.log(`${out}: ${apps.length} applications, ${ESTATE_CONTROLS.length} controls over ${days} days (${from} to ${to}); ${base.posture!.length} days for the histories (to ${baseTo}), ${loads.length} loads${options.incidents ? '' : ', calm'}, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
