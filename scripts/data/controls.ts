/**
 * The controls example's data (ADR 0013): the synthetic controls posture every test of it asserts on
 * (test/fixtures/controls.ts), written out as one CSV file a day per control, plus the application inventory, all from
 * the fixture's seed. The days up to the base's end are what each watch's history is built from (scripts/data/history.ts,
 * one history a watch: each control's, and the posture's, built by running the flow on each day's files); the days
 * after are the loads the app steps through, the five planted days among them.
 *
 *   node scripts/data/controls.mjs OUT_DIR [--from 2023-09-01] [--base-to 2024-02-29] [--to 2024-03-28] [--calm]
 *
 * Writes OUT_DIR/apps.csv, OUT_DIR/days/<control>_<day>.csv, OUT_DIR/base.<watch>.json for each control (`[{ file,
 * slot }]`) and for the posture (`[{ slot, files: { apps, tls, … } }]`), and OUT_DIR/loads.json: the app's loads,
 * `[{ slot, files: { <control>: { file, rows } } }]`, with `fixed: { apps: path }` for the inventory.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appRows, appsCsv, controlRows, controlsDays, CONTROLS, csvOf, HISTORY_FROM, LOADS_FROM, LOADS_TO } from '../../test/fixtures/controls.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1]! : fallback;
};
const out = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--') && !['--calm'].includes(args[i - 1] ?? ''));
if (!out) throw new Error('usage: node scripts/data/controls.mjs OUT_DIR [--from DAY] [--base-to DAY] [--to DAY] [--calm]');
const from = flag('from', HISTORY_FROM);
const baseTo = flag('base-to', '2024-02-29');
const to = flag('to', LOADS_TO);
const options = { incidents: !args.includes('--calm') };
if (from > baseTo || baseTo >= LOADS_FROM && LOADS_FROM > to) throw new Error('--from ≤ --base-to < the loads ≤ --to');

mkdirSync(join(out, 'days'), { recursive: true });
const apps = appRows(options);
const appsPath = resolve(out, 'apps.csv');
writeFileSync(appsPath, appsCsv(apps));
const base: Record<string, { file?: string; slot: string; files?: Record<string, string> }[]> = Object.fromEntries([...CONTROLS, 'posture'].map((w) => [w, []]));
const loads: { slot: string; files: Record<string, { file: string; rows: number }> }[] = [];
let days = 0;
for (const day of controlsDays()) {
  if (day < from || day > to) continue;
  days++;
  const files: Record<string, string> = { apps: appsPath };
  const load: Record<string, { file: string; rows: number }> = {};
  for (const c of CONTROLS) {
    const { columns, rows } = controlRows(c, day, apps, options);
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
console.log(`${out}: ${apps.length} applications, ${CONTROLS.length} controls over ${days} days (${from} to ${to}); ${base.posture!.length} days for the histories (to ${baseTo}), ${loads.length} loads${options.incidents ? '' : ', calm'}`);
