/**
 * A synthetic controls posture, the data the owner works with at work (ADR 0013): applications, each passing or failing
 * a set of security controls, one file a day per control, each control its own dataset with its own columns. Six
 * controls (transport encryption, encryption at rest, MFA, patching, central logging, backup) over 400 applications in
 * five business units and three tiers, drawn from a fixed seed: an application's standing on a control holds for a
 * fortnight at a time (each application's fortnights starting on its own day) and flips rarely besides (1% a day),
 * tier-1 applications fail half as often, and some controls go
 * together: an application failing TLS fails encryption at rest more often than its share says, and an application
 * whose restores are tested fails backup less often.
 *
 * Planted, one trouble a day in March 2024 (PLANTED), the kinds a reader should see told apart:
 * - Wed Mar 6: the patching file arrives with its header and no rows (data missing).
 * - Mon Mar 11: the logging file lacks its `coverage_pct` column (a column missing).
 * - Thu Mar 14: a third of the MFA statuses read `ERROR`, a value never seen (a column off).
 * - Tue Mar 19: backup failures all land on applications whose restores are tested, as many failures and as many
 *   tested as ever (two columns of one control off together).
 * - Fri Mar 22: every application failing TLS passes encryption at rest, and as many TLS passers fail it instead,
 *   each control's own shares as usual (two controls off together: only the posture across them shows it).
 *
 * `controlRows` draws a day's rows of a control, `appRows` the applications; scripts/data/controls.ts writes them out
 * as the example's files, and test/controls.test.ts asserts on what the flow (examples/controls/) says of each day.
 */
import { plusDays } from '../../src/core/calendar.js';

export const CONTROLS = ['tls', 'encryption', 'mfa', 'patching', 'logging', 'backup'] as const;
export type Control = (typeof CONTROLS)[number];

/** Each control's columns, as its CSV header has them: every one has `app_id` and `status`, the rest its own. */
export const CONTROL_COLUMNS: Record<Control, readonly string[]> = {
  tls: ['app_id', 'hostname', 'protocol', 'cert_days_left', 'status'],
  encryption: ['app_id', 'datastore', 'kms_managed', 'status'],
  mfa: ['app_id', 'idp', 'enforced', 'exceptions', 'status'],
  patching: ['app_id', 'critical_open', 'high_open', 'oldest_days', 'status'],
  logging: ['app_id', 'sink', 'coverage_pct', 'status'],
  backup: ['app_id', 'last_success_hours', 'restore_tested', 'status'],
};

/** Each control's column types, for a CSV binding. */
export const CONTROL_TYPES: Record<Control, readonly [string, string][]> = {
  tls: [['app_id', 'TEXT'], ['hostname', 'TEXT'], ['protocol', 'TEXT'], ['cert_days_left', 'INTEGER'], ['status', 'TEXT']],
  encryption: [['app_id', 'TEXT'], ['datastore', 'TEXT'], ['kms_managed', 'TEXT'], ['status', 'TEXT']],
  mfa: [['app_id', 'TEXT'], ['idp', 'TEXT'], ['enforced', 'TEXT'], ['exceptions', 'INTEGER'], ['status', 'TEXT']],
  patching: [['app_id', 'TEXT'], ['critical_open', 'INTEGER'], ['high_open', 'INTEGER'], ['oldest_days', 'INTEGER'], ['status', 'TEXT']],
  logging: [['app_id', 'TEXT'], ['sink', 'TEXT'], ['coverage_pct', 'REAL'], ['status', 'TEXT']],
  backup: [['app_id', 'TEXT'], ['last_success_hours', 'INTEGER'], ['restore_tested', 'TEXT'], ['status', 'TEXT']],
};

export const APP_COLUMNS = ['app_id', 'name', 'business_unit', 'environment', 'tier'] as const;
export const APP_TYPES: readonly [string, string][] = [['app_id', 'TEXT'], ['name', 'TEXT'], ['business_unit', 'TEXT'], ['environment', 'TEXT'], ['tier', 'INTEGER']];

/** The share of applications failing each control on an ordinary day, for a tier-2 production application. */
const BASE_FAIL: Record<Control, number> = { tls: 0.1, encryption: 0.2, mfa: 0.08, patching: 0.25, logging: 0.12, backup: 0.15 };
const UNITS = ['Retail', 'Payments', 'Corporate', 'Platform', 'Data'];
const WORDS = ['ledger', 'atlas', 'orbit', 'harbor', 'beacon', 'quartz', 'meadow', 'summit', 'ember', 'delta', 'cobalt', 'willow', 'falcon', 'granite', 'lantern', 'maple'];

/** The planted days, as the tests name them. */
export const PLANTED = {
  missing: '2024-03-06',
  column: '2024-03-11',
  odd: '2024-03-14',
  within: '2024-03-19',
  across: '2024-03-22',
} as const;

/** The first day the history is drawn from, and the first and last of the loads the app steps through. */
export const HISTORY_FROM = '2023-09-01';
export const LOADS_FROM = '2024-03-01';
export const LOADS_TO = '2024-03-28';

/**
 * A trouble planted on a day, in the kinds a feed goes wrong (each one check the flow must find from the data alone):
 * - `missing`: the control's file arrives with its header and no rows;
 * - `column`: the file lacks a column (the engine refuses it against its declared columns);
 * - `odd`: a share of the statuses read a value never seen (`value`, default `ERROR`; `share`, default 0.35);
 * - `flip`: the control's failures multiply by `by` (default 3): one column's share moves on its own;
 * - `double`: every row twice (the amount doubles, the shares as they were);
 * - `within`: every failure lands on applications with `value` (default `yes`) in `column` (a yes/no column of the
 *   control), as many failures and as many with the value as ever: two columns of one control off together;
 * - `across`: every application failing `other` passes this control, and as many passers of `other` that passed it
 *   fail it instead, every column's own share as it was: two controls off together, seen only where they meet.
 */
export type Trouble =
  | { day: string; control: Control; kind: 'missing' | 'double' }
  | { day: string; control: Control; kind: 'column'; column: string }
  | { day: string; control: Control; kind: 'odd'; value?: string; share?: number }
  | { day: string; control: Control; kind: 'flip'; by?: number }
  | { day: string; control: Control; kind: 'within'; column: string; value?: string }
  | { day: string; control: Control; kind: 'across'; other: Control };

/** The demo's five days (PLANTED), as trouble. */
export const DEMO_TROUBLE: readonly Trouble[] = [
  { day: PLANTED.missing, control: 'patching', kind: 'missing' },
  { day: PLANTED.column, control: 'logging', kind: 'column', column: 'coverage_pct' },
  { day: PLANTED.odd, control: 'mfa', kind: 'odd' },
  { day: PLANTED.within, control: 'backup', kind: 'within', column: 'restore_tested' },
  { day: PLANTED.across, control: 'encryption', kind: 'across', other: 'tls' },
];

export interface ControlsOptions {
  seed?: number;
  /** How many applications (default 400). */
  apps?: number;
  /** The planted days (default true; false is the calm variant). */
  incidents?: boolean;
  /** The trouble planted, by day and control (default DEMO_TROUBLE when `incidents` is on). */
  trouble?: readonly Trouble[];
}

export interface App {
  app_id: string;
  name: string;
  business_unit: string;
  environment: 'prod' | 'nonprod';
  tier: 1 | 2 | 3;
}

/** A uniform number in [0, 1) from a few names: the same names, the same number, whatever the order days are drawn in. */
function uniform(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (const ch of `${part}|`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  // Two more rounds, so close names don't give close numbers.
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The applications: ids, names, units, environments and tiers, from the seed. */
export function appRows(o: ControlsOptions = {}): App[] {
  const seed = o.seed ?? 3;
  const n = o.apps ?? 400;
  const out: App[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `APP-${String(i).padStart(4, '0')}`;
    const u = (k: string) => uniform(seed, id, k);
    const tier = u('tier') < 0.15 ? 1 : u('tier') < 0.55 ? 2 : 3;
    out.push({ app_id: id, name: `${WORDS[Math.floor(u('w1') * WORDS.length)]}-${WORDS[Math.floor(u('w2') * WORDS.length)]}-${i % 97}`, business_unit: UNITS[Math.floor(u('unit') * UNITS.length)]!, environment: u('env') < 0.7 ? 'prod' : 'nonprod', tier });
  }
  return out;
}

/** The days from HISTORY_FROM to LOADS_TO. */
export function controlsDays(): string[] {
  const out: string[] = [];
  for (let d = HISTORY_FROM; d <= LOADS_TO; d = plusDays(d, 1)) out.push(d);
  return out;
}

const dayIndex = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${HISTORY_FROM}T00:00:00Z`)) / 864e5);

/** Whether an application fails a control on a day, before any planted trouble: a fortnight's standing, a rare flip. */
function fails(app: App, control: Control, day: string, seed: number): boolean {
  const rate = BASE_FAIL[control] * (app.tier === 1 ? 0.5 : app.tier === 3 ? 1.3 : 1) * (app.environment === 'nonprod' ? 1.2 : 1) * (control === 'backup' ? (restoreTested(app, seed) ? 0.5 : 1.75) : 1);
  // A fortnight's standing, each application's fortnights starting on its own day, so about a fourteenth of them are
  // drawn afresh each day and the posture drifts rather than steps.
  const block = (c: Control) => Math.floor((dayIndex(day) + Math.floor(uniform(seed, app.app_id, c, 'offset') * 14)) / 14);
  const own = uniform(seed, app.app_id, control, 'block', block(control));
  // Encryption at rest goes with TLS: an application failing TLS (a low draw) fails encryption more often.
  const u = control === 'encryption' ? 0.5 * uniform(seed, app.app_id, 'tls', 'block', block('tls')) + 0.5 * own : own;
  const failing = u < rate;
  return uniform(seed, app.app_id, control, 'flip', day) < 0.01 ? !failing : failing;
}

const restoreTested = (app: App, seed: number) => uniform(seed, app.app_id, 'restore_tested') < 0.6;
const pick = <T>(xs: readonly T[], u: number): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))]!;
const int = (lo: number, hi: number, u: number) => lo + Math.floor(u * (hi - lo + 1));

/** One application's row of a control, given its status: the control's own columns drawn to fit the status. */
function rowOf(control: Control, app: App, day: string, status: string, seed: number): (string | number | null)[] {
  const u = (k: string) => uniform(seed, app.app_id, control, day, k);
  const fail = status === 'fail';
  switch (control) {
    case 'tls': {
      const protocol = fail ? (u('p') < 0.7 ? 'TLS1.0' : 'TLS1.2') : u('p') < 0.6 ? 'TLS1.3' : 'TLS1.2';
      const days = fail && protocol !== 'TLS1.0' ? int(-20, 0, u('d')) : int(30, 400, u('d'));
      return [app.app_id, `${app.name.split('-')[0]}.${app.environment === 'prod' ? 'example.com' : 'np.example.com'}`, protocol, days, status];
    }
    case 'encryption':
      return [app.app_id, pick(['postgres', 's3', 'mysql', 'mongo', 'files'], uniform(seed, app.app_id, 'datastore')), fail ? (u('k') < 0.8 ? 'no' : 'yes') : u('k') < 0.9 ? 'yes' : 'no', status];
    case 'mfa':
      return [app.app_id, pick(['okta', 'azuread', 'local'], uniform(seed, app.app_id, 'idp')), fail ? (u('e') < 0.85 ? 'no' : 'yes') : 'yes', fail ? int(1, 3, u('x')) : u('x') < 0.9 ? 0 : 1, status];
    case 'patching':
      return [app.app_id, fail ? int(1, 5, u('c')) : 0, int(0, fail ? 12 : 4, u('h')), fail ? int(45, 180, u('o')) : int(0, 40, u('o')), status];
    case 'logging':
      return [app.app_id, fail && u('s') < 0.6 ? 'none' : pick(['splunk', 'cloudwatch'], uniform(seed, app.app_id, 'sink')), fail ? Math.round(u('c') * 60 * 10) / 10 : Math.round((90 + u('c') * 10) * 10) / 10, status];
    case 'backup':
      return [app.app_id, fail ? int(48, 400, u('l')) : int(1, 24, u('l')), restoreTested(app, seed) ? 'yes' : 'no', status];
  }
}

/**
 * A day's rows of a control, one an application, in application order: each row's status and the control's own
 * columns, with the day's planted trouble (`Trouble`) applied when `incidents` is on (the default): the demo's five
 * days unless `trouble` names others. Nothing here knows a date: a trouble is a day, a control and a kind.
 */
export function controlRows(control: Control, day: string, apps: readonly App[], o: ControlsOptions = {}): { columns: string[]; rows: (string | number | null)[][] } {
  const seed = o.seed ?? 3;
  const planted = o.incidents === false ? [] : (o.trouble ?? DEMO_TROUBLE).filter((t) => t.day === day && t.control === control);
  const columns = [...CONTROL_COLUMNS[control]];
  if (planted.some((t) => t.kind === 'missing')) return { columns, rows: [] };
  const status = new Map(apps.map((a) => [a.app_id, fails(a, control, day, seed) ? 'fail' : 'pass']));
  const yesNo = (a: App, column: string): string => String(rowOf(control, a, day, 'pass', seed)[CONTROL_COLUMNS[control].indexOf(column)]);
  for (const t of planted) {
    if (t.kind === 'flip') {
      // The failures multiply: the passers most likely to fail (the lowest draws) fail too.
      const n = [...status.values()].filter((s) => s === 'fail').length;
      const more = Math.min(apps.length, Math.round(n * (t.by ?? 3))) - n;
      const passers = apps.filter((a) => status.get(a.app_id) === 'pass').sort((x, y) => uniform(seed, x.app_id, control, 'flip', day) - uniform(seed, y.app_id, control, 'flip', day));
      for (const a of passers.slice(0, Math.max(0, more))) status.set(a.app_id, 'fail');
    }
    if (t.kind === 'within') {
      // As many failures as drawn, all of them on applications with the value in the column.
      const n = [...status.values()].filter((s) => s === 'fail').length;
      const withValue = apps.filter((a) => yesNo(a, t.column) === (t.value ?? 'yes'));
      for (const a of apps) status.set(a.app_id, 'pass');
      for (const a of withValue.slice(0, n)) status.set(a.app_id, 'fail');
    }
    if (t.kind === 'across') {
      // Every application failing the other control passes this one; as many of the other's passers that passed
      // this one fail it instead.
      const otherFail = new Set(apps.filter((a) => fails(a, t.other, day, seed)).map((a) => a.app_id));
      let moved = 0;
      for (const a of apps) if (otherFail.has(a.app_id) && status.get(a.app_id) === 'fail') (status.set(a.app_id, 'pass'), moved++);
      for (const a of apps) {
        if (moved === 0) break;
        if (!otherFail.has(a.app_id) && status.get(a.app_id) === 'pass') (status.set(a.app_id, 'fail'), moved--);
      }
    }
  }
  let rows = apps.map((a) => rowOf(control, a, day, status.get(a.app_id)!, seed));
  for (const t of planted) {
    if (t.kind === 'odd') for (const r of rows) if (uniform(seed, String(r[0]), 'odd', day) < (t.share ?? 0.35)) r[columns.length - 1] = t.value ?? 'ERROR';
    if (t.kind === 'double') rows = [...rows, ...rows.map((r) => [...r])];
    if (t.kind === 'column') {
      const at = columns.indexOf(t.column);
      if (at < 0) throw new Error(`${control} has no column ${t.column}`);
      columns.splice(at, 1);
      for (const r of rows) r.splice(at, 1);
    }
  }
  return { columns, rows };
}

/** Rows as a CSV file with a header. */
export function csvOf(columns: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => (v === null ? '' : typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${columns.join(',')}\n${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

/** The applications as a CSV file. */
export const appsCsv = (apps: readonly App[]): string => csvOf(APP_COLUMNS, apps.map((a) => [a.app_id, a.name, a.business_unit, a.environment, a.tier]));
