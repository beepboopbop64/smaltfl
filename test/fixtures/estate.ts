/**
 * The control estate (the maintainer's request of 2026-11-09, on ADR 0013's controls): a richer, more honest stand-in
 * for the controls data they work with. An inventory of about 600 applications, each typed (internet-facing or not,
 * its criticality, its data classification, whether it has a datastore, where it is hosted, whether it is retiring);
 * twelve controls, each its own daily file with its own columns, each covering only the applications it applies to
 * (an application a control doesn't apply to is absent from its file, as scanners export); statuses in four words
 * (pass, fail, exception, not_assessed); and two kinds of control:
 *
 * - **scans** (TLS, WAF, encryption at rest, backup, MFA, central logging, privileged access): a standing that holds
 *   for a fortnight at a time and flips rarely, with rates by type;
 * - **SLAs** (penetration test and DR exercise yearly, key rotation yearly, access review quarterly, vulnerability
 *   remediation per finding, 30 days from Patch Tuesday): a status that comes from dates. An application passes while
 *   its last completion is within the period and fails from the due date until it completes; about one in ten
 *   completions runs late. Due dates cluster, as they do at work: pentests and DR exercises on fiscal dates, access
 *   reviews at quarter ends, vulnerabilities thirty days after each Patch Tuesday. So a big day-to-day flip in a
 *   control's pass rate can be a normal number of late completions on a day with many due dates, and the files carry
 *   what tells the two apart (due dates, counts of what is due and overdue), without saying which it is.
 *
 * Planted in March 2024 (ESTATE_TROUBLE), in three layers, none of it known to any judge:
 * - **obvious:** a file with no rows (MFA, Mon 4); a column missing (logging's retention_days, Thu 7); a pass rate that
 *   collapses for real (WAF: three in five rows fail, Tue 12); a scanner outage (backup: 45% not_assessed, Tue 19);
 *   rows twice (TLS, Thu 21);
 * - **contradictions and scope:** key rotation passing for applications failing encryption at rest, as many as fail
 *   it, every column's share as it was (Fri 8); WAF rows for 40 applications that aren't internet-facing (Wed 13); TLS
 *   rows missing for every internet-facing application of one business unit (Tue 26);
 * - **look-alikes, and one that isn't:** vulnerability due dates cluster thirty days after February's Patch Tuesday
 *   (Thu 14) and the usual one in ten run late, so failures double for a day; half the yearly pentests are due Fri 15
 *   with the usual one in ten late; quarterly access reviews are due Fri 29 with the usual lateness; and the DR
 *   exercises due Fri 22, where six in ten run late: the one SLA day that is a real problem.
 *
 * `estateApps` draws the inventory, `estateRows` a day's rows of a control, `appliesTo` says which applications a
 * control covers. scripts/data/estate.ts writes them out; examples/control-estate/ is the flow that reads them.
 * Nothing here is a judge: what the flow says of these days is for the next ADR.
 */
import { plusDays } from '../../src/core/calendar.js';

export const ESTATE_CONTROLS = ['tls', 'waf', 'pentest', 'encryption', 'key_rotation', 'backup', 'dr_exercise', 'vuln_sla', 'mfa', 'access_review', 'logging', 'privileged_access'] as const;
export type EstateControl = (typeof ESTATE_CONTROLS)[number];
export type Status = 'pass' | 'fail' | 'exception' | 'not_assessed';

export const APP_COLUMNS = ['app_id', 'name', 'business_unit', 'criticality', 'internet_facing', 'data_class', 'datastore', 'hosting', 'lifecycle'] as const;
export const APP_TYPES: readonly [string, string][] = APP_COLUMNS.map((c) => [c, 'TEXT']);

export interface EstateApp {
  app_id: string;
  name: string;
  business_unit: string;
  criticality: 'critical' | 'high' | 'standard';
  internet_facing: 'yes' | 'no';
  data_class: 'pci' | 'pii' | 'internal' | 'public';
  datastore: 'yes' | 'no';
  hosting: 'cloud' | 'onprem' | 'saas';
  lifecycle: 'active' | 'retiring';
}

/** Each control's columns, as its CSV header has them: `app_id` first, `status` last, its own between. */
export const ESTATE_COLUMNS: Record<EstateControl, readonly [string, string][]> = {
  tls: [['app_id', 'TEXT'], ['hostname', 'TEXT'], ['protocol', 'TEXT'], ['cert_days_left', 'INTEGER'], ['status', 'TEXT']],
  waf: [['app_id', 'TEXT'], ['provider', 'TEXT'], ['mode', 'TEXT'], ['ruleset_age_days', 'INTEGER'], ['status', 'TEXT']],
  pentest: [['app_id', 'TEXT'], ['last_test', 'TEXT'], ['next_due', 'TEXT'], ['open_highs', 'INTEGER'], ['status', 'TEXT']],
  encryption: [['app_id', 'TEXT'], ['store_type', 'TEXT'], ['kms_managed', 'TEXT'], ['status', 'TEXT']],
  key_rotation: [['app_id', 'TEXT'], ['last_rotated', 'TEXT'], ['next_due', 'TEXT'], ['key_age_days', 'INTEGER'], ['status', 'TEXT']],
  backup: [['app_id', 'TEXT'], ['last_success_hours', 'INTEGER'], ['rpo_hours', 'INTEGER'], ['status', 'TEXT']],
  dr_exercise: [['app_id', 'TEXT'], ['last_exercise', 'TEXT'], ['next_due', 'TEXT'], ['rto_met', 'TEXT'], ['status', 'TEXT']],
  vuln_sla: [['app_id', 'TEXT'], ['open_critical', 'INTEGER'], ['open_high', 'INTEGER'], ['overdue', 'INTEGER'], ['next_due', 'TEXT'], ['oldest_overdue_days', 'INTEGER'], ['status', 'TEXT']],
  mfa: [['app_id', 'TEXT'], ['idp', 'TEXT'], ['enforced', 'TEXT'], ['exceptions', 'INTEGER'], ['status', 'TEXT']],
  access_review: [['app_id', 'TEXT'], ['last_review', 'TEXT'], ['next_due', 'TEXT'], ['reviewers', 'INTEGER'], ['status', 'TEXT']],
  logging: [['app_id', 'TEXT'], ['sink', 'TEXT'], ['coverage_pct', 'REAL'], ['retention_days', 'INTEGER'], ['status', 'TEXT']],
  privileged_access: [['app_id', 'TEXT'], ['vault', 'TEXT'], ['accounts', 'INTEGER'], ['unvaulted', 'INTEGER'], ['status', 'TEXT']],
};

/** Which applications a control covers: by the inventory's attributes, never by name. */
export function appliesTo(control: EstateControl, a: EstateApp): boolean {
  switch (control) {
    case 'tls': case 'waf': return a.internet_facing === 'yes';
    case 'pentest': return a.internet_facing === 'yes' && a.criticality !== 'standard';
    case 'encryption': case 'backup': return a.datastore === 'yes';
    case 'key_rotation': return a.datastore === 'yes' && (a.data_class === 'pii' || a.data_class === 'pci');
    case 'dr_exercise': return a.criticality === 'critical';
    case 'access_review': return a.data_class === 'pii' || a.data_class === 'pci';
    case 'privileged_access': return a.criticality !== 'standard';
    case 'vuln_sla': case 'mfa': case 'logging': return a.lifecycle === 'active' || control === 'mfa';
  }
}

/** A control whose pass needs another's: key rotation needs encryption at rest (there is no managed key otherwise). */
export const DEPENDS: Partial<Record<EstateControl, EstateControl>> = { key_rotation: 'encryption' };

/** The scans (a standing) and the SLAs (a status from dates). */
export const SLA_CONTROLS: readonly EstateControl[] = ['pentest', 'key_rotation', 'dr_exercise', 'vuln_sla', 'access_review'];
export const isSla = (c: EstateControl): boolean => SLA_CONTROLS.includes(c);

export const HISTORY_FROM = '2023-03-01';
export const LOADS_FROM = '2024-03-01';
export const LOADS_TO = '2024-03-31';

/** The planted days, as the tests name them. */
export const ESTATE_PLANTED = {
  empty: '2024-03-04',
  column: '2024-03-07',
  contradiction: '2024-03-08',
  collapse: '2024-03-12',
  scopeCreep: '2024-03-13',
  vulnCluster: '2024-03-14',
  pentestCluster: '2024-03-15',
  outage: '2024-03-19',
  double: '2024-03-21',
  drLate: '2024-03-22',
  scopeLoss: '2024-03-26',
  reviewCluster: '2024-03-29',
} as const;

/** A trouble planted on a day: what, where, how. */
export type EstateTrouble =
  | { day: string; control: EstateControl; kind: 'empty' | 'double' }
  | { day: string; control: EstateControl; kind: 'column'; column: string }
  | { day: string; control: EstateControl; kind: 'collapse'; share: number }
  | { day: string; control: EstateControl; kind: 'not_assessed'; share: number }
  /** Rows of this control for `count` applications it doesn't apply to. */
  | { day: string; control: EstateControl; kind: 'scope_creep'; count: number }
  /** No rows of this control for the applications of one business unit. */
  | { day: string; control: EstateControl; kind: 'scope_loss'; business_unit: string }
  /** Every application failing `other` passes this control, and as many of the other's passers fail it instead. */
  | { day: string; control: EstateControl; kind: 'contradiction'; other: EstateControl }
  /** This SLA control's completions due on the day run late at this rate (the usual is 0.1). */
  | { day: string; control: EstateControl; kind: 'late'; rate: number };

export const ESTATE_TROUBLE: readonly EstateTrouble[] = [
  { day: ESTATE_PLANTED.empty, control: 'mfa', kind: 'empty' },
  { day: ESTATE_PLANTED.column, control: 'logging', kind: 'column', column: 'retention_days' },
  { day: ESTATE_PLANTED.contradiction, control: 'key_rotation', kind: 'contradiction', other: 'encryption' },
  { day: ESTATE_PLANTED.collapse, control: 'waf', kind: 'collapse', share: 0.6 },
  { day: ESTATE_PLANTED.scopeCreep, control: 'waf', kind: 'scope_creep', count: 40 },
  { day: ESTATE_PLANTED.outage, control: 'backup', kind: 'not_assessed', share: 0.45 },
  { day: ESTATE_PLANTED.double, control: 'tls', kind: 'double' },
  { day: ESTATE_PLANTED.drLate, control: 'dr_exercise', kind: 'late', rate: 0.6 },
  { day: ESTATE_PLANTED.scopeLoss, control: 'tls', kind: 'scope_loss', business_unit: 'Payments' },
];

export interface EstateOptions {
  seed?: number;
  /** How many applications (default 600). */
  apps?: number;
  /** The trouble planted (default ESTATE_TROUBLE; `incidents: false` plants none). */
  incidents?: boolean;
  trouble?: readonly EstateTrouble[];
}

// ------------------------------------------------------------------ the inventory

const UNITS = ['Retail', 'Payments', 'Corporate', 'Platform', 'Data', 'Claims'];
const WORDS = ['ledger', 'atlas', 'orbit', 'harbor', 'beacon', 'quartz', 'meadow', 'summit', 'ember', 'delta', 'cobalt', 'willow', 'falcon', 'granite', 'lantern', 'maple', 'tundra', 'sable', 'pike', 'osprey'];

/** A uniform number in [0, 1) from a few names: the same names, the same number, whatever the order days are drawn in. */
function uniform(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (const ch of `${part}|`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[], u: number): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))]!;
const int = (lo: number, hi: number, u: number) => lo + Math.floor(u * (hi - lo + 1));
const dayIndex = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${HISTORY_FROM}T00:00:00Z`)) / 864e5);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** The inventory, from the seed: about a third internet-facing, a sixth critical, two in five with regulated data. */
export function estateApps(o: EstateOptions = {}): EstateApp[] {
  const seed = o.seed ?? 5;
  const n = o.apps ?? 600;
  const out: EstateApp[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `APP-${String(i).padStart(4, '0')}`;
    const u = (k: string) => uniform(seed, id, k);
    const business_unit = UNITS[Math.floor(u('unit') * UNITS.length)]!;
    const criticality = u('crit') < 0.15 ? 'critical' : u('crit') < 0.45 ? 'high' : 'standard';
    const internet_facing = u('net') < (business_unit === 'Retail' || business_unit === 'Payments' ? 0.5 : 0.25) ? 'yes' : 'no';
    const data_class = business_unit === 'Payments' && u('data') < 0.5 ? 'pci' : u('data') < 0.35 ? 'pii' : u('data') < 0.8 ? 'internal' : 'public';
    const datastore = u('store') < (data_class === 'public' ? 0.4 : 0.8) ? 'yes' : 'no';
    const hosting = u('host') < 0.55 ? 'cloud' : u('host') < 0.85 ? 'onprem' : 'saas';
    const lifecycle = u('life') < 0.08 ? 'retiring' : 'active';
    out.push({ app_id: id, name: `${pick(WORDS, u('w1'))}-${pick(WORDS, u('w2'))}-${i % 89}`, business_unit, criticality, internet_facing, data_class, datastore, hosting, lifecycle });
  }
  return out;
}

export function estateDays(): string[] {
  const out: string[] = [];
  for (let d = HISTORY_FROM; d <= LOADS_TO; d = plusDays(d, 1)) out.push(d);
  return out;
}

// ------------------------------------------------------------------ scans: a standing that holds

/** The share of applications failing a scan on an ordinary day, for a standard, internal, active, on-prem application. */
const SCAN_FAIL: Partial<Record<EstateControl, number>> = { tls: 0.1, waf: 0.12, encryption: 0.18, backup: 0.14, mfa: 0.07, logging: 0.12, privileged_access: 0.16 };

/** The multiplier an application's type puts on its failure rates: critical applications are better kept, retiring
 * ones worse, SaaS ones fail the controls their vendor runs less often, regulated data is watched more closely. */
function riskOf(a: EstateApp, control: EstateControl): number {
  let r = 1;
  if (a.criticality === 'critical') r *= 0.55;
  else if (a.criticality === 'high') r *= 0.8;
  if (a.lifecycle === 'retiring') r *= 2.2;
  if (a.hosting === 'saas') r *= control === 'tls' || control === 'waf' || control === 'backup' ? 0.5 : 1;
  if (a.data_class === 'pci' || a.data_class === 'pii') r *= 0.8;
  if (a.internet_facing === 'yes' && (control === 'mfa' || control === 'logging')) r *= 1.3;
  return r;
}

/** The applications a control takes an exception for (a standing exception, about 3%), and the day's unassessed (1%). */
const hasException = (a: EstateApp, control: EstateControl, seed: number) => uniform(seed, a.app_id, control, 'exception') < 0.03;
const unassessed = (a: EstateApp, control: EstateControl, day: string, seed: number) => uniform(seed, a.app_id, control, 'na', day) < 0.01;

/** A scan's status: a fortnight's standing (each application's fortnights starting on its own day), a rare daily flip;
 * encryption and backup share the datastore's health, so an application failing one fails the other more often. */
function scanFails(a: EstateApp, control: EstateControl, day: string, seed: number): boolean {
  const rate = (SCAN_FAIL[control] ?? 0.1) * riskOf(a, control);
  const block = (c: EstateControl) => Math.floor((dayIndex(day) + Math.floor(uniform(seed, a.app_id, c, 'offset') * 14)) / 14);
  const own = uniform(seed, a.app_id, control, 'block', block(control));
  const shared = control === 'backup' ? 0.5 * uniform(seed, a.app_id, 'encryption', 'block', block('encryption')) + 0.5 * own : control === 'waf' ? 0.4 * uniform(seed, a.app_id, 'tls', 'block', block('tls')) + 0.6 * own : own;
  const failing = shared < rate;
  return uniform(seed, a.app_id, control, 'flip', day) < 0.01 ? !failing : failing;
}

// ------------------------------------------------------------------ SLAs: a status from dates

/** An SLA control's period in days, and the dates its due dates cluster on (a share of the applications are due then). */
const SLA: Record<string, { period: number; cluster: { dates: string[]; share: number } | null }> = {
  pentest: { period: 365, cluster: { dates: ['2023-03-15', '2024-03-15'], share: 0.5 } },
  dr_exercise: { period: 365, cluster: { dates: ['2023-03-22', '2024-03-22'], share: 0.6 } },
  key_rotation: { period: 365, cluster: null },
  access_review: { period: 91, cluster: { dates: ['2023-03-31', '2023-06-30', '2023-09-29', '2023-12-29', '2024-03-29'], share: 0.7 } },
};
/** The share of completions that run late on an ordinary cycle: one in ten, pentests one in five. */
const USUAL_LATE: Record<string, number> = { pentest: 0.2, dr_exercise: 0.1, key_rotation: 0.1, access_review: 0.15, vuln_sla: 0.1 };

/** One cycle of an SLA for an application: its due date, and the day it was completed (before the due date, or late). */
interface Cycle {
  due: string;
  done: string;
}

/**
 * An application's cycles of an SLA control across the span: from the first due date (an anchor from the seed, or the
 * cluster's date for applications in the cluster) every `period` days. Each is completed early (5 to 40 days before)
 * or, at the late rate (the usual one in ten, or a planted day's), late by 3 to 45 days.
 */
const cycleCache = new Map<string, Cycle[]>();
const findingCache = new Map<string, Finding[]>();
/** What a late-rate rule depends on, for the caches: the planted late days it answers for. */
const lateKey = (f: (due: string) => number) => (f as { key?: string }).key ?? '';

function cycles(a: EstateApp, control: EstateControl, seed: number, lateRateOn: (due: string) => number): Cycle[] {
  const ck = `${seed}|${a.app_id}|${control}|${lateKey(lateRateOn)}`;
  const known = cycleCache.get(ck);
  if (known) return known;
  const out = cyclesOf(a, control, seed, lateRateOn);
  if (cycleCache.size > 50_000) cycleCache.clear();
  cycleCache.set(ck, out);
  return out;
}

function cyclesOf(a: EstateApp, control: EstateControl, seed: number, lateRateOn: (due: string) => number): Cycle[] {
  const s = SLA[control]!;
  const out: Cycle[] = [];
  const inCluster = s.cluster && uniform(seed, a.app_id, control, 'cluster') < s.cluster.share;
  let dues: string[];
  if (inCluster) dues = s.cluster!.dates.slice();
  else {
    const first = plusDays(HISTORY_FROM, -Math.floor(uniform(seed, a.app_id, control, 'anchor') * s.period));
    dues = [];
    for (let d = first; d <= plusDays(LOADS_TO, s.period); d = plusDays(d, s.period)) dues.push(d);
  }
  for (const due of dues) {
    const late = uniform(seed, a.app_id, control, 'late', due) < lateRateOn(due);
    const u = uniform(seed, a.app_id, control, 'when', due);
    out.push({ due, done: late ? plusDays(due, int(3, 45, u)) : plusDays(due, -int(5, 40, u)) });
  }
  return out;
}

/** An SLA's state on a day: the last completion on or before it, the next due date, and whether it is overdue (a due
 * date passed and its completion is still to come). */
function slaState(a: EstateApp, control: EstateControl, day: string, seed: number, lateRateOn: (due: string) => number): { last: string | null; nextDue: string | null; overdue: boolean } {
  const cs = cycles(a, control, seed, lateRateOn);
  let last: string | null = null;
  let overdue = false;
  let nextDue: string | null = null;
  let missed: string | null = null;
  for (const c of cs) {
    if (c.done <= day && (!last || c.done > last)) last = c.done;
    if (c.due < day && c.done > day) {
      overdue = true;
      if (!missed || c.due < missed) missed = c.due;
    }
    if (c.due >= day && (!nextDue || c.due < nextDue)) nextDue = c.due;
  }
  // The next due date is the cycle after the last completion when every listed due has passed.
  if (!nextDue && last) nextDue = plusDays(last, SLA[control]!.period);
  // A row that is late says so in its date: the due date it missed, which has passed, is what is due.
  return { last, nextDue: missed ?? nextDue, overdue };
}

/** Patch Tuesday: the second Tuesday of a month. */
export function patchTuesday(year: number, month: number): string {
  let d = `${year}-${String(month).padStart(2, '0')}-08`;
  while (weekday(d) !== 2) d = plusDays(d, 1);
  return d;
}

/** The months whose Patch Tuesday falls in the span, each with its date. */
const PATCH_DAYS: string[] = [];
for (let y = 2022; y <= 2024; y++) for (let m = 1; m <= 12; m++) PATCH_DAYS.push(patchTuesday(y, m));

/** A vulnerability finding on an application: found on a Patch Tuesday, due 30 days on, fixed early or late. */
interface Finding {
  severity: 'critical' | 'high';
  found: string;
  due: string;
  fixed: string;
}

function findings(a: EstateApp, seed: number, lateRateOn: (due: string) => number): Finding[] {
  const ck = `${seed}|${a.app_id}|${lateKey(lateRateOn)}`;
  const known = findingCache.get(ck);
  if (known) return known;
  const out = findingsOf(a, seed, lateRateOn);
  if (findingCache.size > 50_000) findingCache.clear();
  findingCache.set(ck, out);
  return out;
}

function findingsOf(a: EstateApp, seed: number, lateRateOn: (due: string) => number): Finding[] {
  const out: Finding[] = [];
  const mean = 1.2 * (a.internet_facing === 'yes' ? 1.6 : 1) * (a.hosting === 'saas' ? 0.3 : 1) * (a.lifecycle === 'retiring' ? 1.5 : 1);
  for (const found of PATCH_DAYS) {
    if (found < plusDays(HISTORY_FROM, -120) || found > LOADS_TO) continue;
    // A Poisson-ish count: the mean, rounded by a draw.
    const u = uniform(seed, a.app_id, 'vuln', found);
    const n = Math.floor(mean) + (u < mean - Math.floor(mean) ? 1 : 0) + (uniform(seed, a.app_id, 'vuln2', found) < 0.15 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const due = plusDays(found, 30);
      const late = uniform(seed, a.app_id, 'vlate', found, i) < lateRateOn(due);
      const w = uniform(seed, a.app_id, 'vwhen', found, i);
      out.push({ severity: uniform(seed, a.app_id, 'vsev', found, i) < 0.3 ? 'critical' : 'high', found, due, fixed: late ? plusDays(due, int(2, 40, w)) : plusDays(found, int(3, 29, w)) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ a day's rows

const dateCell = (d: string | null) => d ?? '';

/** One application's row of a control on a day, given the status chosen for it. */
function rowOf(control: EstateControl, a: EstateApp, day: string, status: Status, seed: number, lateRateOn: (due: string) => number): (string | number | null)[] {
  const u = (k: string) => uniform(seed, a.app_id, control, day, k);
  const fail = status === 'fail';
  const na = status === 'not_assessed';
  switch (control) {
    case 'tls': {
      const protocol = na ? null : fail ? (u('p') < 0.7 ? 'TLS1.0' : 'TLS1.2') : u('p') < 0.6 ? 'TLS1.3' : 'TLS1.2';
      return [a.app_id, `${a.name.split('-')[0]}.${a.business_unit.toLowerCase()}.example.com`, protocol, na ? null : fail && protocol !== 'TLS1.0' ? int(-20, 0, u('d')) : int(30, 400, u('d')), status];
    }
    case 'waf':
      return [a.app_id, pick(['akamai', 'cloudflare', 'f5', 'aws'], uniform(seed, a.app_id, 'wafp')), na ? null : fail ? (u('m') < 0.6 ? 'off' : 'monitor') : 'block', na ? null : fail ? int(60, 400, u('r')) : int(0, 45, u('r')), status];
    case 'encryption':
      return [a.app_id, pick(['postgres', 's3', 'mysql', 'mongo', 'files', 'oracle'], uniform(seed, a.app_id, 'store')), na ? null : fail ? (u('k') < 0.8 ? 'no' : 'yes') : u('k') < 0.9 ? 'yes' : 'no', status];
    case 'backup':
      return [a.app_id, na ? null : fail ? int(48, 400, u('l')) : int(1, 24, u('l')), a.criticality === 'critical' ? 4 : a.criticality === 'high' ? 24 : 72, status];
    case 'mfa':
      return [a.app_id, pick(['okta', 'entra', 'local'], uniform(seed, a.app_id, 'idp')), na ? null : fail ? (u('e') < 0.85 ? 'no' : 'yes') : 'yes', na ? null : fail ? int(1, 4, u('x')) : u('x') < 0.9 ? 0 : 1, status];
    case 'logging':
      return [a.app_id, na ? null : fail && u('s') < 0.6 ? 'none' : pick(['splunk', 'cloudwatch', 'sentinel'], uniform(seed, a.app_id, 'sink')), na ? null : fail ? Math.round(u('c') * 60 * 10) / 10 : Math.round((90 + u('c') * 10) * 10) / 10, na ? null : fail && u('s') >= 0.6 ? int(7, 60, u('rt')) : a.data_class === 'pci' ? 365 : int(90, 400, u('rt')), status];
    case 'privileged_access': {
      const accounts = int(2, 40, uniform(seed, a.app_id, 'accts'));
      return [a.app_id, pick(['cyberark', 'hashicorp', 'none'], uniform(seed, a.app_id, 'vault')), accounts, na ? null : fail ? int(1, Math.max(1, Math.floor(accounts / 2)), u('uv')) : 0, status];
    }
    case 'pentest': case 'dr_exercise': case 'key_rotation': case 'access_review': {
      const st = slaState(a, control, day, seed, lateRateOn);
      if (control === 'pentest') return [a.app_id, dateCell(st.last), dateCell(st.nextDue), na ? null : fail ? int(1, 6, u('h')) : u('h') < 0.8 ? 0 : 1, status];
      if (control === 'dr_exercise') return [a.app_id, dateCell(st.last), dateCell(st.nextDue), na ? null : fail ? (u('rto') < 0.5 ? 'no' : 'yes') : 'yes', status];
      if (control === 'key_rotation') return [a.app_id, dateCell(st.last), dateCell(st.nextDue), na || !st.last ? null : Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${st.last}T00:00:00Z`)) / 864e5), status];
      return [a.app_id, dateCell(st.last), dateCell(st.nextDue), na ? null : int(1, 4, u('rv')), status];
    }
    case 'vuln_sla': {
      const fs = findings(a, seed, lateRateOn).filter((f) => f.found <= day && f.fixed > day);
      const overdue = fs.filter((f) => f.due < day);
      // The earliest open finding's due date, passed or not: a row late on one says so in its date, as the SLA controls do.
      const nextDue = fs.map((f) => f.due).sort()[0] ?? null;
      const oldest = overdue.length ? Math.max(...overdue.map((f) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${f.due}T00:00:00Z`)) / 864e5))) : 0;
      return [a.app_id, na ? null : fs.filter((f) => f.severity === 'critical').length, na ? null : fs.filter((f) => f.severity === 'high').length, na ? null : overdue.length, dateCell(nextDue), na ? null : oldest, status];
    }
  }
}

/**
 * A day's rows of a control: one an application the control applies to, in application order, with the day's planted
 * trouble applied. The status is the scan's standing or the SLA's dates (fail while overdue), an exception for the
 * applications that hold one, not_assessed for the day's few the scanner didn't reach.
 */
export function estateRows(control: EstateControl, day: string, apps: readonly EstateApp[], o: EstateOptions = {}): { columns: string[]; rows: (string | number | null)[][] } {
  const seed = o.seed ?? 5;
  const trouble = o.incidents === false ? [] : (o.trouble ?? ESTATE_TROUBLE);
  const planted = trouble.filter((t) => t.day === day && t.control === control);
  const columns = ESTATE_COLUMNS[control].map(([c]) => c);
  if (planted.some((t) => t.kind === 'empty')) return { columns, rows: [] };
  // A planted late rate applies to the completions due on that day, for every day the cycle's status is read.
  const lateOn = (c: EstateControl) => {
    const f = (due: string) => {
      const t = trouble.find((x) => x.kind === 'late' && x.control === c && x.day === due);
      return t && t.kind === 'late' ? t.rate : USUAL_LATE[c] ?? 0.1;
    };
    (f as { key?: string }).key = `${c}:${trouble.filter((x) => x.kind === 'late' && x.control === c).map((x) => `${x.day}=${(x as { rate: number }).rate}`).join(',')}`;
    return f;
  };
  let covered = apps.filter((a) => appliesTo(control, a));
  for (const t of planted) {
    if (t.kind === 'scope_loss') covered = covered.filter((a) => a.business_unit !== t.business_unit);
    if (t.kind === 'scope_creep') covered = [...covered, ...apps.filter((a) => !appliesTo(control, a)).sort((x, y) => uniform(seed, x.app_id, 'creep', day) - uniform(seed, y.app_id, 'creep', day)).slice(0, t.count)].sort((x, y) => (x.app_id < y.app_id ? -1 : 1));
  }
  const statusOf = (a: EstateApp, c: EstateControl): Status => {
    if (hasException(a, c, seed)) return 'exception';
    if (unassessed(a, c, day, seed)) return 'not_assessed';
    // A control that depends on another (DEPENDS): where encryption at rest fails there is no managed key to rotate,
    // so key rotation fails too. The calm days keep this rule; the planted contradiction day breaks it.
    const on = DEPENDS[c];
    if (on && appliesTo(on, a) && scanFails(a, on, day, seed) && !hasException(a, on, seed)) return 'fail';
    if (isSla(c)) {
      if (c === 'vuln_sla') return findings(a, seed, lateOn(c)).some((f) => f.found <= day && f.fixed > day && f.due < day) ? 'fail' : 'pass';
      return slaState(a, c, day, seed, lateOn(c)).overdue ? 'fail' : 'pass';
    }
    return scanFails(a, c, day, seed) ? 'fail' : 'pass';
  };
  const status = new Map(covered.map((a) => [a.app_id, statusOf(a, control)]));
  for (const t of planted) {
    if (t.kind === 'collapse') for (const a of covered) if (uniform(seed, a.app_id, 'collapse', day) < t.share) status.set(a.app_id, 'fail');
    if (t.kind === 'not_assessed') for (const a of covered) if (uniform(seed, a.app_id, 'outage', day) < t.share) status.set(a.app_id, 'not_assessed');
    if (t.kind === 'contradiction') {
      // Every application failing the other control passes this one; as many of the other's passers fail it instead.
      const otherFail = new Set(covered.filter((a) => appliesTo(t.other, a) && statusOf(a, t.other) === 'fail').map((a) => a.app_id));
      let moved = 0;
      for (const a of covered) if (otherFail.has(a.app_id) && status.get(a.app_id) === 'fail') (status.set(a.app_id, 'pass'), moved++);
      for (const a of covered) {
        if (moved === 0) break;
        if (!otherFail.has(a.app_id) && status.get(a.app_id) === 'pass') (status.set(a.app_id, 'fail'), moved--);
      }
    }
  }
  let rows = covered.map((a) => rowOf(control, a, day, status.get(a.app_id)!, seed, lateOn(control)));
  for (const t of planted) {
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

export const appsCsv = (apps: readonly EstateApp[]): string => csvOf(APP_COLUMNS, apps.map((a) => APP_COLUMNS.map((c) => a[c])));
