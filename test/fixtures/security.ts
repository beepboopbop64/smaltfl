/**
 * A synthetic sign-in log, the security data the owner works with (ADR 0010): one file a day of authentication events,
 * as the history a flow judges it by (smaltfl-history/2), and the flow document that watches it in the general form
 * (format 3). Ported from the generality audit's generator with a fixed seed, and Poisson noise on every count (the
 * audit's had none, which made small volumes look too good).
 *
 * Columns: event_time (time), result, method, country and ua_family (codes), latency_ms (measure), user (many values).
 * Around the clock: machine sign-ins flat, people's in business hours (UTC); weekends a little lower (or flat, `flat`).
 * Incidents planted on chosen days, unless `incidents: false`:
 * - Tue Mar 12, 2024: credential stuffing, 02:00-05:00, 150k failed password sign-ins from one country by a script; real
 *   users locked out at 2% the rest of the day.
 * - Wed-Thu May 15-16, 2024: a logging agent drops MFA push, a quarter of the rows; and Mon Dec 26, 2022 (Christmas
 *   observed, a holiday in the feed's first year) the same.
 * - From Mon Jun 3, 2024: the migration from password to passkey over a month, then it stays.
 * - Tue Sep 10, 2024: the collector down 06:00-12:00, a 2% trickle.
 * - Fri Nov 29, 2024: a smaller burst, 20:00-23:00, with a tool never seen before (hydra).
 *
 * Variant M (phase 3, `monthEnd`, `patchTuesday`): a batch on each month's last day, and Patch Tuesday's rows (the second
 * Tuesday), each as a multiple of the day's rows, with the same mix: what a flow's own recurring days are for. And a
 * step in rows that stays (`step`): what Accept the new level is for.
 */
import { plusDays } from '../../src/core/calendar.js';
import type { FlowDocument } from '../../src/core/document.js';
import type { HistoryFile, ValueHistory } from '../../src/core/history.js';
import { random } from '../../src/core/quality.js';

export const SECURITY_DAYS: string[] = [];
for (let d = '2022-10-01'; d <= '2024-12-31'; d = plusDays(d, 1)) SECURITY_DAYS.push(d);

export type Dist = Record<string, number>;
export interface Segment { n: number; hours: number[]; dist: Record<string, Dist> }
const CODED = ['result', 'method', 'country', 'ua_family'] as const;

const BASE: Record<string, Dist> = {
  result: { success: 0.95, fail: 0.045, locked: 0.005 },
  method: { password: 0.4, sso: 0.3, mfa_push: 0.25, passkey: 0.03, api_key: 0.02 },
  country: { US: 0.55, IN: 0.12, GB: 0.1, DE: 0.08, BR: 0.05, NL: 0.04, other: 0.04, CN: 0.015, RU: 0.005 },
  ua_family: { chrome: 0.45, edge: 0.2, safari: 0.15, outlook: 0.08, firefox: 0.05, okhttp: 0.04, other: 0.02, 'python-requests': 0.005, curl: 0.005 },
};
const HUMAN = Array.from({ length: 24 }, (_, h) => 0.6 + 0.8 * Math.max(0, Math.sin(((h - 6) / 13) * Math.PI)));
const norm = (xs: number[]) => {
  const t = xs.reduce((a, b) => a + b, 0);
  return xs.map((x) => x / t);
};
const onlyHours = (hs: number[]) => Array.from({ length: 24 }, (_, h) => (hs.includes(h) ? 1 / hs.length : 0));
const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/** A Poisson count of mean `m`: Knuth's method under 30, the normal approximation above it. */
function poisson(m: number, rnd: () => number): number {
  if (m <= 0) return 0;
  if (m >= 30) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss(rnd)));
  const limit = Math.exp(-m);
  let k = 0;
  for (let p = rnd(); p > limit; p *= rnd()) k++;
  return k;
}

export interface SecurityOptions {
  /** No weekday effect (variant B). */
  flat?: boolean;
  seed?: number;
  /** The planted incidents (default true; false is variant C, the false alarm rate). */
  incidents?: boolean;
  /** Rows a day, as a share of 200,000. */
  scale?: number;
  /** Variant M: each month's last day's rows times this (a month-end batch), and Patch Tuesday's (ADR 0010 §2). */
  monthEnd?: number;
  patchTuesday?: number;
  /** A step in rows that stays (phase 3, ADR 0010 §5): from a day on, every day's rows times `by`, the same mix. */
  step?: { from: string; by: number };
}

/** Whether a day is its month's last, and whether it is Patch Tuesday (the Tuesday between the 8th and the 14th). */
export const isMonthEnd = (day: string): boolean => plusDays(day, 1).endsWith('-01');
export const isPatchTuesday = (day: string): boolean => new Date(`${day}T12:00:00Z`).getUTCDay() === 2 && Number(day.slice(8)) >= 8 && Number(day.slice(8)) <= 14;

/** The planted days, as the tests name them. */
export const PLANTED = {
  burst: '2024-03-12',
  mfa: ['2024-05-15', '2024-05-16'],
  firstHoliday: '2022-12-26',
  migration: '2024-06-03',
  outage: '2024-09-10',
  hydra: '2024-11-29',
} as const;

/** One day's plan: its segments (each with its rows, its hours and its values' shares) and the hours a collector was down. */
export interface SecurityDay {
  day: string;
  segs: Segment[];
  outage?: number[];
}

/** Every day's plan, from the seed: the history and the rows (`securityRows`) are both drawn from it. */
export function securityDays(o: SecurityOptions = {}): SecurityDay[] {
  return planDays(o, random(o.seed ?? 7));
}

function planDays(o: SecurityOptions, rnd: () => number): SecurityDay[] {
  const WD = o.flat ? [1, 1, 1, 1, 1, 1, 1] : [0.8, 1.02, 1.03, 1.03, 1.02, 0.97, 0.8];
  const inc = o.incidents !== false;
  const scale = o.scale ?? 1;
  const days: SecurityDay[] = [];
  for (const [k, day] of SECURITY_DAYS.entries()) {
    const wd = WD[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
    const batch = (o.monthEnd && isMonthEnd(day) ? o.monthEnd : 1) * (o.patchTuesday && isPatchTuesday(day) ? o.patchTuesday : 1) * (o.step && day >= o.step.from ? o.step.by : 1);
    const n = 200_000 * scale * wd * (1 + 0.1 * (k / 365)) * Math.exp(0.03 * gauss(rnd)) * batch;
    const dist: Record<string, Dist> = {};
    for (const c of CODED) {
      const d: Dist = {};
      for (const [v, p] of Object.entries(BASE[c]!)) d[v] = Math.max(0, p * Math.exp(0.04 * gauss(rnd)));
      dist[c] = d;
    }
    if (inc && day >= PLANTED.migration) {
      const t = Math.min(1, (Date.parse(day) - Date.parse(PLANTED.migration)) / (30 * 864e5));
      dist.method!.password = 0.4 - 0.3 * t;
      dist.method!.passkey = 0.03 + 0.3 * t;
    }
    const mfaGone = inc && ((PLANTED.mfa as readonly string[]).includes(day) || day === PLANTED.firstHoliday);
    if (mfaGone) dist.method!.mfa_push = 0;
    if (inc && day === PLANTED.burst) dist.result!.locked = 0.02;
    for (const c of CODED) {
      const d = dist[c]!;
      const t = Object.values(d).reduce((a, b) => a + b, 0);
      for (const v in d) d[v]! /= t;
    }
    // A drop takes those rows away, not shares them out.
    const segs: Segment[] = [{ n: n * (mfaGone ? 0.75 : 1), hours: norm(HUMAN), dist }];
    if (inc && day === PLANTED.burst) segs.push({ n: 150_000 * scale, hours: onlyHours([2, 3, 4]), dist: { result: { fail: 0.97, locked: 0.03 }, method: { password: 1 }, country: { RU: 1 }, ua_family: { 'python-requests': 1 } } });
    if (inc && day === PLANTED.hydra) segs.push({ n: 40_000 * scale, hours: onlyHours([20, 21, 22]), dist: { result: { fail: 0.99, locked: 0.01 }, method: { password: 1 }, country: { BR: 1 }, ua_family: { hydra: 1 } } });
    days.push({ day, segs, outage: inc && day === PLANTED.outage ? [6, 7, 8, 9, 10, 11] : undefined });
  }
  return days;
}

export function securityHistory(o: SecurityOptions = {}): HistoryFile {
  const rnd = random(o.seed ?? 7);
  const days = planDays(o, rnd);
  const rows: number[] = [];
  const hours: number[][] = [];
  const dropped: number[] = [];
  const failed: number[][] = [];
  const present: number[][] = [];
  const p50: (number | null)[][] = [];
  const quantiles: (number[] | null)[][] = [];
  const singles: Record<string, [string, number][][]> = Object.fromEntries(CODED.map((c) => [c, []]));
  const pairNames: string[] = [];
  for (let a = 0; a < CODED.length; a++) for (let b = a + 1; b < CODED.length; b++) pairNames.push(`${CODED[a]}|${CODED[b]}`);
  const pairs: Record<string, [string, number][][]> = Object.fromEntries(pairNames.map((p) => [p, []]));
  for (const { segs, outage } of days) {
    const scaled = segs.map((s) => {
      const hs = s.hours.map((x, h) => s.n * x * (outage?.includes(h) ? 0.02 : 1));
      return { ...s, hs, n: hs.reduce((a, b) => a + b, 0) };
    });
    const hr = Array.from({ length: 24 }, (_, h) => poisson(scaled.reduce((t, s) => t + s.hs[h]!, 0), rnd));
    const n = hr.reduce((a, b) => a + b, 0);
    rows.push(n);
    hours.push(hr);
    const d1 = poisson(n * 0.002, rnd);
    const d2 = poisson(n * 0.001, rnd);
    const w = poisson(n * 0.004, rnd);
    dropped.push(d1 + d2);
    failed.push([d1, d2, w]);
    present.push([n, n, n, n, n, n, n - w]);
    // Each value's rows: its segments' expected rows, drawn as a Poisson count, scaled to the day's rows.
    for (const c of CODED) {
      const m = new Map<string, number>();
      for (const s of scaled) for (const [v, p] of Object.entries(s.dist[c]!)) if (p > 0) m.set(JSON.stringify(v), (m.get(JSON.stringify(v)) ?? 0) + s.n * p);
      singles[c]!.push([...m].map(([key, mean]): [string, number] => [key, poisson(mean, rnd)]).filter(([, x]) => x > 0));
    }
    for (const p of pairNames) {
      const [a, b] = p.split('|') as [string, string];
      const m = new Map<string, number>();
      for (const s of scaled)
        for (const [va, pa] of Object.entries(s.dist[a]!))
          for (const [vb, pb] of Object.entries(s.dist[b]!)) {
            const x = s.n * pa * pb;
            if (x >= 0.5) {
              const key = `[${JSON.stringify(va)},${JSON.stringify(vb)}]`;
              m.set(key, (m.get(key) ?? 0) + x);
            }
          }
      pairs[p]!.push([...m].map(([key, mean]): [string, number] => [key, Math.round(mean)]).filter(([, x]) => x > 0));
    }
    // event_time's quantiles in minutes, from its hours; latency's from a lognormal around 180 ms.
    const minuteAt = (q: number) => {
      let acc = 0;
      for (let x = 0; x < 24; x++) {
        if (hr[x]! > 0 && acc + hr[x]! >= q * n) return x * 60 + (60 * (q * n - acc)) / hr[x]!;
        acc += hr[x]!;
      }
      return 1440;
    };
    const QS = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
    const tq = QS.map((q) => Number(minuteAt(q).toPrecision(6)));
    const z = [-2.326, -1.2816, -0.6745, 0, 0.6745, 1.2816, 2.326];
    const lq = z.map((x) => Number((180 * Math.exp(0.5 * x) * Math.exp(0.02 * gauss(rnd))).toPrecision(6)));
    quantiles.push([tq, null, null, null, null, lq, null]);
    p50.push([tq[3]!, null, null, null, null, lq[3]!, null]);
  }
  const values: Record<string, ValueHistory> = {};
  for (const c of CODED) values[c] = followed(singles[c]!, true, 28);
  const pairOut: Record<string, ValueHistory> = {};
  for (const p of pairNames) pairOut[p] = followed(pairs[p]!, false, 28);
  return {
    format: 'smaltfl-history/2', built: '2025-01-01T00:00:00Z', flow: 'signins', step: 'auth_valid',
    rules: SECURITY_RULES.map(({ name, check, onFail }) => ({ name, check, onFail })),
    columns: ['event_time', 'result', 'method', 'country', 'ua_family', 'latency_ms', 'user'],
    types: ['text', 'text', 'text', 'text', 'text', 'real', 'text'],
    kinds: ['time', 'code', 'code', 'code', 'code', 'measure', 'category'],
    sample: 2000, days: SECURITY_DAYS, rows, dropped, failed, present, p50, missing: [], quantiles, hours, warmup: 28, values, pairs: pairOut,
  };
}

/** scripts/data/history.ts's followed(): each value's first and last day, its days and rows, and the days it was new. */
function followed(days: readonly (readonly [string, number][])[], daily: boolean, warmup: number): ValueHistory {
  const at = new Map<string, number>();
  const first: number[] = [];
  const last: number[] = [];
  const seen: number[] = [];
  const total: number[] = [];
  const fresh: [number, number][] = [];
  days.forEach((entries, d) => {
    let novel = 0;
    for (const [key, n] of entries) {
      let k = at.get(key);
      if (k === undefined) {
        at.set(key, (k = first.length));
        first.push(d);
        last.push(d);
        seen.push(0);
        total.push(0);
        if (d >= warmup) novel += n;
      }
      last[k] = d;
      seen[k]!++;
      total[k]! += n;
    }
    if (novel) fresh.push([d, novel]);
  });
  const order = [...at.keys()].map((key) => [key, at.get(key)!] as const).sort((a, b) => total[b[1]]! - total[a[1]]!);
  const out: ValueHistory = { values: order.map(([key]) => key), first: order.map(([, k]) => first[k]!), last: order.map(([, k]) => last[k]!), days: order.map(([, k]) => seen[k]!), rows: order.map(([, k]) => total[k]!), fresh };
  if (daily) {
    const place = new Map(order.map(([key], i) => [key, i]));
    out.counts = days.map((entries) => {
      const row = new Array<number>(order.length).fill(0);
      for (const [key, n] of entries) row[place.get(key)!] = n;
      return row;
    });
  }
  return out;
}

/** The columns of a day's sign-in file, as its CSV header has them. */
export const SIGNIN_COLUMNS = ['event_time', 'result', 'method', 'country', 'ua_family', 'latency_ms', 'user'] as const;

/**
 * One day's sign-ins as rows (ADR 0010 phase 2: the files the security example's history and loads are made of), drawn
 * from the day's plan: each hour's rows a Poisson count of the plan's, each row's values by their shares, a time in its
 * hour, a latency around 180 ms, a user of a few thousand. A few rows fail the checks as the history's counts do: an
 * unknown result (0.2%), a time on another day (0.1%), no user (0.4%). Seeded by the day, so a day's file is always the
 * same.
 */
export function securityRows(plan: SecurityDay, scale = 1, seed = 7): (string | number | null)[][] {
  let h = seed;
  for (const ch of plan.day) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const rnd = random(h);
  const pick = (d: Dist) => {
    let x = rnd() * Object.values(d).reduce((a, b) => a + b, 0);
    for (const [v, p] of Object.entries(d)) if ((x -= p) <= 0) return v;
    return Object.keys(d).at(-1)!;
  };
  const two = (n: number) => String(n).padStart(2, '0');
  const out: (string | number | null)[][] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const seg of plan.segs) {
      const n = poisson(seg.n * scale * seg.hours[hour]! * (plan.outage?.includes(hour) ? 0.02 : 1), rnd);
      for (let i = 0; i < n; i++) {
        const r = rnd();
        const day = r < 0.001 ? plusDays(plan.day, 1) : plan.day;
        const time = `${day} ${two(hour)}:${two(Math.floor(rnd() * 60))}:${two(Math.floor(rnd() * 60))}`;
        const result = r > 0.998 ? 'unknown' : pick(seg.dist.result!);
        const latency = Math.round(180 * Math.exp(0.5 * gauss(rnd)));
        const user = rnd() < 0.004 ? null : `u${Math.floor(rnd() * 4000)}`;
        out.push([time, result, pick(seg.dist.method!), pick(seg.dist.country!), pick(seg.dist.ua_family!), latency, user]);
      }
    }
  }
  return out.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
}

/** Rows as a CSV file with a header: what the example's loads are. */
export function csvOf(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (v: string | number | null) => (v === null ? '' : typeof v === 'number' ? String(v) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${SIGNIN_COLUMNS.join(',')}\n${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}

const SECURITY_RULES = [
  { name: 'known_result', check: "result IN ('success', 'fail', 'locked')", onFail: 'drop' as const },
  { name: 'in_day', check: 'substr(event_time, 1, 10) = :day', onFail: 'drop' as const },
  { name: 'has_user', check: 'user IS NOT NULL', onFail: 'warn' as const },
];

/**
 * The sign-in flow at work, in the general form (format 3): the US federal days as its calendar, its rows called
 * sign-ins, `result`'s failures and lockouts marked bad, and a country never seen before something wrong (Q-56).
 */
export function securityDoc(): FlowDocument {
  return {
    smaltfl: 3, id: 'signins', name: 'Sign-ins',
    parameters: [{ name: 'day', type: 'text', default: null }],
    sources: [{ id: 'auth', table: 'auth_file' }],
    steps: [{ id: 'auth_valid', kind: 'expectations', inputs: ['auth'], rules: SECURITY_RULES.map((r) => ({ ...r })), maxDropped: 0.05, dataset: {} }],
    calendar: { base: 'us' },
    ontology: {
      objectTypes: [], linkTypes: [], actionTypes: [],
      nouns: { auth: { one: 'sign-in', many: 'sign-ins' } },
      properties: [
        { column: 'result', title: 'Result', description: 'How the sign-in ended', values: { success: 'Signed in', fail: 'Failed', locked: 'Locked out' }, bad: ['fail', 'locked'] },
        { column: 'method', title: 'Method', description: 'How the user proved who they are', values: { password: 'Password', sso: 'Single sign-on', mfa_push: 'MFA push', passkey: 'Passkey', api_key: 'API key' } },
        { column: 'country', title: 'Country', description: 'Where the sign-in came from', newValues: 'alert' },
        { column: 'ua_family', title: 'Client', description: 'The software that signed in' },
      ],
    },
    publish: { hold: ['checks', 'wrong'], period: 'day', watch: { auth: { history: 'auth-history.json', time: 'event_time' } } },
  };
}
