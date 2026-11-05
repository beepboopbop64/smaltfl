/**
 * The reference flow computed independently, in plain JavaScript over the fixture's rows, to check the engine's
 * results against (docs/SCENARIO.md §6: gold datasets match reference results computed independently).
 */
import { ZONES, type Trip } from './taxi.js';

const unix = (s: string) => Date.parse(`${s.replace(' ', 'T')}Z`) / 1000;

export interface ZoneHour {
  trips: number;
  avgDuration: number;
  avgSpeed: number;
  avgFare: number;
  tipRate: number | null;
}

export function reference(trips: readonly Trip[], month = '2024-01') {
  const rules: Record<string, (t: Trip) => boolean> = {
    in_month: (t) => t[1].slice(0, 7) === month,
    duration: (t) => {
      const d = unix(t[2]) - unix(t[1]);
      return d >= 60 && d <= 10800;
    },
    distance: (t) => t[4] > 0 && t[4] <= 100,
    fare: (t) => t[8] >= 0,
    known_zones: (t) => ![264, 265].includes(t[5]) && ![264, 265].includes(t[6]),
    passengers: (t) => t[3] !== null,
  };
  const drops = ['in_month', 'duration', 'distance', 'fare', 'known_zones'];
  const failed = Object.fromEntries(Object.entries(rules).map(([name, ok]) => [name, trips.filter((t) => !ok(t)).length]));
  const valid = trips.filter((t) => drops.every((name) => rules[name]!(t)));
  const seen = new Set<string>();
  const unique = valid.filter((t) => {
    const k = JSON.stringify(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const zone = new Map(ZONES.map(([id, borough, name]) => [id, [borough, name] as const]));
  const groups = new Map<string, { n: number; dur: number; speed: number; fare: number; tip: number; tipN: number }>();
  for (const t of unique) {
    const [borough, name] = zone.get(t[5])!;
    const key = `${borough}|${name}|${t[1].slice(0, 13)}:00`;
    const g = groups.get(key) ?? { n: 0, dur: 0, speed: 0, fare: 0, tip: 0, tipN: 0 };
    const minutes = (unix(t[2]) - unix(t[1])) / 60;
    g.n++;
    g.dur += minutes;
    g.speed += t[4] / (minutes / 60);
    g.fare += t[8];
    if (t[7] === 1 && t[8] > 0) {
      g.tip += t[9] / t[8];
      g.tipN++;
    }
    groups.set(key, g);
  }
  const zoneHour = new Map<string, ZoneHour>();
  const boroughHour = new Map<string, number>();
  for (const [key, g] of groups) {
    zoneHour.set(key, { trips: g.n, avgDuration: g.dur / g.n, avgSpeed: g.speed / g.n, avgFare: g.fare / g.n, tipRate: g.tipN ? g.tip / g.tipN : null });
    const [borough, , hour] = key.split('|');
    boroughHour.set(`${borough}|${hour}`, (boroughHour.get(`${borough}|${hour}`) ?? 0) + g.n);
  }
  return { rows: trips.length, failed, dropped: trips.length - valid.length, unique: unique.length, zoneHour, boroughHour };
}
