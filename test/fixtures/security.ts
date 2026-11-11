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
 *
 * Variant E (phase 4, ADR 0010 §7, `edr`): a second source, endpoint events (`edr`), loaded every 6 hours, its own
 * history kept by slot (`edrHistory`) and its slots as rows (`edrRows`). The collector's outage is then edr's, not the
 * sign-ins': down 06:00-10:00 on Tue Sep 10, 2024, a 2% trickle inside the 06-12 slot, the day's other slots calm, and
 * the sign-ins that day calm too (`securityDays({ edr: true })`). `twoSourceDoc` watches both: only the off file's slot
 * pauses (Q-55).
 */
import { plusDays } from '../../src/core/calendar.js';
import type { FlowDocument } from '../../src/core/document.js';
import type { HistoryFile, ValueHistory } from '../../src/core/history.js';
import { random } from '../../src/core/quality.js';

export const SECURITY_DAYS: string[] = [];
for (let d = '2022-10-01'; d <= '2024-12-31'; d = plusDays(d, 1)) SECURITY_DAYS.push(d);

export type Dist = Record<string, number>;
/** A segment of a day's rows: how many, in which hours, each coded column's shares. A `natural` segment is the day's
 * ordinary sign-ins, whose rows carry the structure people's sign-ins have (`securityRows`): a client by the method, a
 * latency by the method, a country by the user. A planted burst is not natural: its shares are what it is. */
export interface Segment { n: number; hours: number[]; dist: Record<string, Dist>; natural?: boolean }
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
  /** Variant E (phase 4): the collector's outage is the endpoint events', so the sign-ins have none. */
  edr?: boolean;
  /** Rows added on chosen days, as a planted incident's are: each its rows (times `scale`), its hours and every coded
   * column's shares. What a test plants on a day of its own (a burst on a first-year holiday, a new tool). */
  extra?: Record<string, { n: number; hours: number[]; dist: Record<string, Dist> }[]>;
  /** Days on which nothing arrived: a file with its header and no rows (the demo's missing day). */
  missing?: string[];
  /** A day's mix of one or more coded columns set outright (the demo's day with one column off, its amount as usual):
   * `{ '2024-03-18': { method: { sso: 0.5, … } } }`, normalised with the rest. */
  shares?: Record<string, Record<string, Dist>>;
  /** A day's values nudged: each named value's share multiplied (`{ '2024-03-14': { method: { sso: 1.1 } } }`), the rest
   * normalised. Small nudges on many values at once make a day no single number flags: what the forest is for. */
  nudges?: Record<string, Record<string, Dist>>;
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
  /** The day the migration's passkey share first crosses three times its usual: the day it pauses. */
  migrationHeld: '2024-06-09',
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
    if (o.missing?.includes(day)) {
      days.push({ day, segs: [] });
      continue;
    }
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
    for (const [c, d] of Object.entries(o.shares?.[day] ?? {})) dist[c] = { ...d };
    for (const [c, d] of Object.entries(o.nudges?.[day] ?? {})) for (const [v, x] of Object.entries(d)) if (dist[c]![v] !== undefined) dist[c]![v]! *= x;
    for (const c of CODED) {
      const d = dist[c]!;
      const t = Object.values(d).reduce((a, b) => a + b, 0);
      for (const v in d) d[v]! /= t;
    }
    // A drop takes those rows away, not shares them out.
    // A day whose client mix is set outright keeps it as set: its rows' clients aren't drawn by the method.
    const segs: Segment[] = [{ n: n * (mfaGone ? 0.75 : 1), hours: norm(HUMAN), dist, natural: !o.shares?.[day]?.ua_family }];
    if (inc && day === PLANTED.burst) segs.push({ n: 150_000 * scale, hours: onlyHours([2, 3, 4]), dist: { result: { fail: 0.97, locked: 0.03 }, method: { password: 1 }, country: { RU: 1 }, ua_family: { 'python-requests': 1 } } });
    if (inc && day === PLANTED.hydra) segs.push({ n: 40_000 * scale, hours: onlyHours([20, 21, 22]), dist: { result: { fail: 0.99, locked: 0.01 }, method: { password: 1 }, country: { BR: 1 }, ua_family: { hydra: 1 } } });
    for (const x of o.extra?.[day] ?? []) segs.push({ n: x.n * scale, hours: onlyHours(x.hours), dist: x.dist });
    days.push({ day, segs, outage: inc && !o.edr && day === PLANTED.outage ? [6, 7, 8, 9, 10, 11] : undefined });
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
        const id = Math.floor(rnd() * 4000);
        const user = rnd() < 0.004 ? null : `u${id}`;
        const method = pick(seg.dist.method!);
        // People's sign-ins have structure (`natural`): the client follows the method most of the time (a key from a
        // script, a push from the phone's app), the latency is the method's (a push waits for a person), and a user signs
        // in from their own country nine times in ten. The shares a day's plan gives are kept on the whole.
        const natural = seg.natural === true;
        const client = natural && rnd() < CLIENT_TIE ? pick(CLIENT_BY_METHOD[method] ?? seg.dist.ua_family!) : pick(seg.dist.ua_family!);
        const country = natural && rnd() < 0.9 ? homeCountry(id, seg.dist.country!) : pick(seg.dist.country!);
        const latency = Math.round((natural ? (LATENCY_BY_METHOD[method] ?? 180) : 180) * Math.exp(0.5 * gauss(rnd)));
        out.push([time, result, method, country, client, latency, user]);
      }
    }
  }
  return out.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
}

/** How often a person's client follows their method, and which clients each method's sign-ins come from. */
const CLIENT_TIE = 0.6;
const CLIENT_BY_METHOD: Record<string, Dist> = {
  password: { chrome: 0.5, edge: 0.25, safari: 0.15, firefox: 0.1 },
  sso: { chrome: 0.45, edge: 0.3, safari: 0.2, firefox: 0.05 },
  mfa_push: { okhttp: 0.5, outlook: 0.4, safari: 0.1 },
  passkey: { safari: 0.5, chrome: 0.4, edge: 0.1 },
  api_key: { 'python-requests': 0.45, curl: 0.35, okhttp: 0.2 },
};
/** A method's typical latency in ms: a push waits for the person to tap it. */
const LATENCY_BY_METHOD: Record<string, number> = { password: 200, sso: 260, mfa_push: 1400, passkey: 120, api_key: 60 };
/** A user's own country, the same every day: by their number, in the day's country shares. */
function homeCountry(id: number, dist: Dist): string {
  let x = (((id * 2654435761) >>> 0) % 10_000) / 10_000;
  const t = Object.values(dist).reduce((a, b) => a + b, 0);
  for (const [v, p] of Object.entries(dist)) if ((x -= p / t) <= 0) return v;
  return Object.keys(dist).at(-1)!;
}

/**
 * The demo's loads (`scripts/data/security.mjs --demo`, ADR 0012), each a kind of trouble a reader, or a model, should
 * tell apart: nothing arrived (Fri Mar 15); one column's mix off, its amount as usual (Mon Mar 18); a combination off,
 * lock-outs through API keys (Wed Mar 20); and two days only the models see (ADR 0015 §6): every value nudged a little,
 * each inside its own range, so the day as a whole is unlike any before it (Thu Mar 14, the forest's); and a client
 * release that moves most people's sign-ins to the phone's app, which no count the history keeps sees (Tue Mar 19, the
 * classifier's: the rows look different).
 */
export const DEMO_DAYS = { forest: '2024-03-14', missing: '2024-03-15', shares: '2024-03-18', classifier: '2024-03-19', combo: '2024-03-20' } as const;
const BUSINESS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
export const SIGNIN_DEMO: SecurityOptions = {
  missing: [DEMO_DAYS.missing],
  shares: {
    [DEMO_DAYS.shares]: { method: { password: 0.25, sso: 0.5, mfa_push: 0.2, passkey: 0.03, api_key: 0.02 } },
    [DEMO_DAYS.classifier]: { ua_family: { okhttp: 0.55, chrome: 0.15, edge: 0.1, safari: 0.1, outlook: 0.05, firefox: 0.02, other: 0.02, 'python-requests': 0.005, curl: 0.005 } },
  },
  nudges: { [DEMO_DAYS.forest]: { result: { fail: 1.35, locked: 1.7 }, method: { password: 0.85, sso: 1.13, mfa_push: 1.13, passkey: 1.45, api_key: 0.75 } } },
  extra: { [DEMO_DAYS.combo]: [{ n: 8_000, hours: BUSINESS, dist: { result: { locked: 1 }, method: { api_key: 1 }, country: { US: 1 }, ua_family: { 'python-requests': 1 } } }] },
};

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
 * sign-ins, `result`'s failures and lockouts marked bad, and a country or a client never seen before something wrong
 * (the owner, Q-56: "(country, tool)").
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
        { column: 'ua_family', title: 'Client', description: 'The software that signed in', newValues: 'alert' },
      ],
    },
    publish: { hold: ['checks', 'wrong'], period: 'day', watch: { auth: { history: 'auth-history.json', time: 'event_time' } } },
  };
}

// ------------------------------------------------------------------ variant E: endpoint events every 6 hours (phase 4)

/** The columns of an endpoint events file, as its CSV header has them. */
export const EDR_COLUMNS = ['event_time', 'host', 'action', 'severity'] as const;
/** How often edr is loaded, and the hours its collector was down on the outage day (inside the 06-12 slot). */
export const EDR_EVERY = '6h';
export const EDR_OUTAGE = [6, 7, 8, 9];
const EDR_BASE: Record<'action' | 'severity', Dist> = {
  action: { process: 0.5, network: 0.3, file: 0.18, registry: 0.02 },
  severity: { info: 0.9, low: 0.08, high: 0.02 },
};
/** Machines log around the clock, a little more in working hours; a little less at weekends. */
const EDR_HOURS = norm(Array.from({ length: 24 }, (_, h) => 0.8 + 0.4 * Math.max(0, Math.sin(((h - 7) / 12) * Math.PI))));
const EDR_WD = [0.92, 1, 1, 1, 1, 1, 0.92];

/** One edr slot's plan: its id (`2024-09-10T06`), the rows expected in each of its hours, and its values' shares. */
export interface EdrSlot {
  slot: string;
  hours: number[];
  dist: Record<'action' | 'severity', Dist>;
}

/** Every edr slot's plan, from the seed, over the sign-ins' days: 40,000 events a day at scale 1. */
export function edrSlots(o: { seed?: number; scale?: number; incidents?: boolean } = {}): EdrSlot[] {
  const rnd = random((o.seed ?? 7) + 1000);
  const scale = o.scale ?? 1;
  const out: EdrSlot[] = [];
  for (const [k, day] of SECURITY_DAYS.entries()) {
    const n = 40_000 * scale * EDR_WD[new Date(`${day}T12:00:00Z`).getUTCDay()]! * (1 + 0.05 * (k / 365)) * Math.exp(0.03 * gauss(rnd));
    for (let s = 0; s < 24; s += 6) {
      const dist = Object.fromEntries((['action', 'severity'] as const).map((c) => {
        const d: Dist = {};
        for (const [v, p] of Object.entries(EDR_BASE[c])) d[v] = p * Math.exp(0.03 * gauss(rnd));
        const t = Object.values(d).reduce((a, b) => a + b, 0);
        for (const v in d) d[v]! /= t;
        return [c, d];
      })) as EdrSlot['dist'];
      const down = o.incidents !== false && day === PLANTED.outage;
      const hours = Array.from({ length: 6 }, (_, j) => n * EDR_HOURS[s + j]! * (down && EDR_OUTAGE.includes(s + j) ? 0.02 : 1));
      out.push({ slot: `${day}T${String(s).padStart(2, '0')}`, hours, dist });
    }
  }
  return out;
}

/**
 * edr's history kept by slot (smaltfl-history/3, `every: 6h`): each slot's rows, its six hours, each action's and
 * severity's rows, the time's quantiles in minutes of the day, as the general builder would measure them. No checks
 * read edr alone. Up to `to` (a slot id) when given: a base that ends before the slots a test runs.
 */
export function edrHistory(o: { seed?: number; scale?: number; incidents?: boolean; to?: string } = {}): HistoryFile {
  const rnd = random((o.seed ?? 7) + 2000);
  const slots = edrSlots(o).filter((p) => o.to === undefined || p.slot <= o.to);
  const rows: number[] = [];
  const hours: number[][] = [];
  const present: number[][] = [];
  const p50: (number | null)[][] = [];
  const quantiles: (number[] | null)[][] = [];
  const singles: Record<string, [string, number][][]> = { action: [], severity: [] };
  for (const p of slots) {
    const hr = p.hours.map((m) => poisson(m, rnd));
    const n = hr.reduce((a, b) => a + b, 0);
    rows.push(n);
    hours.push(hr);
    present.push([n, n, n, n]);
    for (const c of ['action', 'severity'] as const) singles[c]!.push(Object.entries(p.dist[c]).map(([v, sh]): [string, number] => [JSON.stringify(v), poisson(n * sh, rnd)]).filter(([, x]) => x > 0));
    const start = Number(p.slot.slice(11, 13)) * 60;
    const minuteAt = (q: number) => {
      let acc = 0;
      for (let x = 0; x < 6; x++) {
        if (hr[x]! > 0 && acc + hr[x]! >= q * n) return start + x * 60 + (60 * (q * n - acc)) / hr[x]!;
        acc += hr[x]!;
      }
      return start + 360;
    };
    const tq = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99].map((q) => Number(minuteAt(q).toPrecision(6)));
    quantiles.push([tq, null, null, null]);
    p50.push([tq[3]!, null, null, null]);
  }
  return {
    format: 'smaltfl-history/3', built: '2025-01-01T00:00:00Z', flow: 'signins', source: 'edr', every: EDR_EVERY, time: 'event_time', zone: null, skipped: [],
    step: '', rules: [], columns: [...EDR_COLUMNS], types: ['text', 'text', 'text', 'text'], kinds: ['time', 'category', 'code', 'code'], sample: 2000,
    days: slots.map((p) => p.slot), rows, dropped: rows.map(() => 0), failed: rows.map(() => []), present, p50, missing: [], quantiles, hours, warmup: 28 * 4,
    values: { action: followed(singles.action!, true, 28 * 4), severity: followed(singles.severity!, true, 28 * 4) }, pairs: {},
  };
}

/** One edr slot as rows, drawn from its plan, seeded by the slot: each hour's rows a Poisson count, a time in its hour,
 * a host of a few hundred. */
export function edrRows(plan: EdrSlot, seed = 7): string[][] {
  let h = seed;
  for (const ch of plan.slot) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const rnd = random(h);
  const pick = (d: Dist) => {
    let x = rnd();
    for (const [v, p] of Object.entries(d)) if ((x -= p) <= 0) return v;
    return Object.keys(d).at(-1)!;
  };
  const two = (n: number) => String(n).padStart(2, '0');
  const day = plan.slot.slice(0, 10);
  const start = Number(plan.slot.slice(11, 13));
  const out: string[][] = [];
  plan.hours.forEach((m, j) => {
    const n = poisson(m, rnd);
    for (let i = 0; i < n; i++) out.push([`${day} ${two(start + j)}:${two(Math.floor(rnd() * 60))}:${two(Math.floor(rnd() * 60))}`, `h${Math.floor(rnd() * 300)}`, pick(plan.dist.action), pick(plan.dist.severity)]);
  });
  return out.sort((a, b) => (a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0));
}

/**
 * The sign-in flow with endpoint events beside it (variant E, ADR 0010 §7): auth judged a day at a time, edr a 6-hour
 * slot at a time under its own period parameter (`slot`), each with its own history (machines keep no holidays: the
 * calendar is the sign-ins' alone); a check on the sign-ins; edr read through its fill step, its rows marked; one
 * output of each source and one that reads both; `together: false`, so a held load keeps back only what reads it.
 */
export function twoSourceDoc(): FlowDocument {
  const d = securityDoc();
  return {
    ...d,
    id: 'signins-edr', name: 'Sign-ins and endpoint events',
    parameters: [{ name: 'day', type: 'text', default: null }, { name: 'slot', type: 'text', default: null }],
    sources: [{ id: 'auth', table: 'auth_file' }, { id: 'edr', table: 'edr_file' }],
    steps: [
      ...d.steps,
      { id: 'auth_results', kind: 'aggregate', inputs: ['auth_valid'], groupBy: ['result'], measures: [{ name: 'signins', expr: 'count(*)' }], dataset: {} },
      { id: 'edr_filled', kind: 'fill', inputs: ['edr'], time: 'event_time', shift: ['event_time'] },
      { id: 'edr_actions', kind: 'aggregate', inputs: ['edr_filled'], groupBy: ['action'], measures: [{ name: 'events', expr: 'count(*)' }, { name: 'filled_from', expr: 'max(filled_from)' }], dataset: {} },
      { id: 'edr_hosts_signing_in', kind: 'sql', inputs: ['auth_results', 'edr_actions'], sql: 'SELECT (SELECT sum(signins) FROM auth_results) AS signins, (SELECT sum(events) FROM edr_actions) AS events, (SELECT max(filled_from) FROM edr_actions) AS filled_from', dataset: {} },
    ],
    ontology: { ...d.ontology!, nouns: { ...d.ontology!.nouns, edr: { one: 'endpoint event', many: 'endpoint events' } } },
    publish: {
      hold: ['checks', 'wrong'], period: 'day', together: false,
      watch: {
        auth: { history: 'auth-history.json', time: 'event_time' },
        edr: { history: 'edr-history.json', period: 'slot', every: EDR_EVERY, time: 'event_time', calendar: false },
      },
    },
  };
}
