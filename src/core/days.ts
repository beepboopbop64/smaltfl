/**
 * What a day's own view shows (ADR 0008 §10). Loads arrive one a day, as a feed brings them, and the flow publishes
 * only a run that passes (src/plugin/runtime.ts): after a held or refused run its outputs keep the last day that
 * passed. A day's view shows its own run, or, when it has none that passed, the latest day before it that did, said as
 * such on every panel that shows those rows; never a day after it, whose rows weren't there yet.
 *
 * A flow that says what holds it (ADR 0009) pauses a day that is off instead: the held run's versions are staged,
 * readers keep the last day published, and the day waits until a person decides. Its views read its own staged run,
 * under a bar that says so (`stagedBar`); falling back to an earlier day stays only for a refused file.
 */

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const at = (day: string) => new Date(`${day}T12:00:00Z`);

/** "Thu 21". */
export const dayShort = (day: string) => `${WD[at(day).getUTCDay()]} ${at(day).getUTCDate()}`;
/** "Thu Sep 21". */
export const dayMid = (day: string) => `${WD[at(day).getUTCDay()]} ${MON[at(day).getUTCMonth()]} ${at(day).getUTCDate()}`;

/**
 * The run a viewed day shows, by place in `runs` (the runs that passed, newest first, each by its load's day; null or
 * undefined for a run on no load): the day's own newest run, else the newest run of the latest day before it, else -1.
 * A run on a later day is never shown. With no viewed day (a flow without daily loads) it is the newest run.
 */
export function shownRun(runs: readonly (string | null | undefined)[], viewed: string | null | undefined): number {
  if (!viewed) return runs.length ? 0 : -1;
  let best = -1;
  for (const [k, d] of runs.entries()) {
    if (!d) continue;
    if (d === viewed) return k;
    if (d < viewed && (best < 0 || d > runs[best]!)) best = k;
  }
  return best;
}

/** How a run that stopped on the viewed day is said in one line: what stopped it, and what the outputs keep. */
export interface StoppedLine {
  /** "Held at trips_valid", "File refused", "The run stopped". */
  lead: string;
  /** "outputs keep Thu 21", "outputs keep their last run", "nothing passed before". */
  tail: string;
}

export function stoppedLine(o: { refused: boolean; origin?: string | undefined; shown: string | null | undefined; viewed: string }): StoppedLine {
  const lead = o.refused ? 'File refused' : o.origin ? `Held at ${o.origin}` : 'The run stopped';
  const tail = !o.shown ? 'nothing passed before' : o.shown === o.viewed ? 'outputs keep their last run' : `outputs keep ${dayShort(o.shown)}`;
  return { lead, tail };
}

/**
 * The date bar over a panel whose rows are another day's (ADR 0008 §10): "Rows from Thu Sep 21 · the last day
 * published", after a refused file (ADR 0009 §12: a held day shows its own rows, staged). Null when the rows are the
 * viewed day's own.
 */
export function rowsFrom(shown: string | null | undefined, viewed: string | null | undefined): string | null {
  if (!shown || !viewed || shown === viewed) return null;
  return `Rows from ${dayMid(shown)} · the last day published`;
}

/**
 * The day readers see while a day waits (ADR 0009 §12), with its age once it is two days or more before the day held,
 * so a stale one reads stale: "readers see Wed 20", "readers see Mon 18 · 3 days old"; "nothing published yet".
 */
export function readersSee(published: string | null | undefined, day: string | null | undefined): string {
  if (!published) return 'nothing published yet';
  const age = day ? Math.round((at(day).getTime() - at(published).getTime()) / 864e5) : 0;
  return `readers see ${dayShort(published)}${age >= 2 ? ` · ${age} days old` : ''}`;
}

/**
 * The bar over a panel whose rows are a held day's own, staged and not published (ADR 0009 §12): "Staged Thu 21 ·
 * readers see Wed 20", "… · readers see Mon 18 · 3 days old", or "… · nothing published yet". Null when the day is the
 * one published. A day a later one has passed since is no longer staged for readers: "Not published · superseded by Tue
 * 26" (a later day can't close it, ADR 0009 §5, but it can no longer be what readers see).
 */
export function stagedBar(day: string, published: string | null | undefined): string | null {
  if (published === day) return null;
  if (published && published > day) return `Not published · superseded by ${dayShort(published)}`;
  return `Staged ${dayShort(day)} · ${readersSee(published, day)}`;
}

/** A panel with no rows to show for the viewed day: no day before it passed in this visit. */
export const noRowsBefore = (viewed: string) => `No rows: no day before ${dayShort(viewed)} passed in this visit`;

/** A day of an episode, for its shortfall: its trips by hour, a usual day's, and its range. */
export interface EpisodeDay {
  day: string;
  got: readonly number[];
  /** Its range's low and its guess, for the day's trips. */
  low: number;
  expected: number;
  /** Whether the day had something wrong. */
  alert: boolean;
}

/**
 * An episode's shortfall so far (ADR 0008 §6, §10): an estimate against a usual day and a bound against the low end of
 * usual, over its days up to the viewed one and none after. The day the trips fell counts the hours of its fall as its
 * head does (the finding's own usual hours), so the two say one number; a later day with something wrong counts whole.
 */
export function shortfall(days: readonly EpisodeDay[], fall: { day: string; from: number; to: number; got: readonly number[]; usual: readonly number[] }, viewed: string): { estimate: number; bound: number } {
  let estimate = 0;
  let bound = 0;
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  for (const d of days) {
    if (d.day > viewed) continue;
    if (d.day === fall.day) {
      const want = sum(fall.usual.slice(fall.from, fall.to + 1));
      const had = sum(fall.got.slice(fall.from, fall.to + 1));
      estimate += Math.max(0, want - had);
      bound += Math.max(0, want * (d.low / Math.max(1, d.expected)) - had);
    } else if (d.alert && d.day > fall.day) {
      estimate += Math.max(0, d.expected - sum(d.got));
      bound += Math.max(0, d.low - sum(d.got));
    }
  }
  return { estimate, bound };
}

/**
 * The History calendar's header (ADR 0008 §10): the days checked so far until every one is, never a count of wrong
 * days while some are unchecked; then how many were wrong and unusual. One map feeds it and the cells.
 */
export function calendarHead(verdicts: ReadonlyMap<string, string>, total: number, to?: string): string {
  const n = (x: number) => x.toLocaleString('en-US');
  if (verdicts.size < total) return `Checking every day · ${n(verdicts.size)} of ${n(total)}`;
  const v = [...verdicts.values()];
  return `${n(total)} days${to ? ` to ${dayMid(to)}` : ''} · ${v.filter((x) => x === 'alert').length} wrong · ${v.filter((x) => x === 'warn').length} unusual`;
}

/**
 * Whether the source was told on a day of an episode, its first day to the viewed one and none after (ADR 0008 §11):
 * "Source told today", "Source told on Fri", by the load's day as the app's days are. Null when it wasn't.
 */
export function toldLine(entries: readonly { day: string; act: string }[], since: string, viewed: string): string | null {
  const e = entries.filter((x) => x.act === 'notify' && x.day >= since && x.day <= viewed).at(-1);
  return e ? `Source told ${e.day === viewed ? 'today' : `on ${WD[at(e.day).getUTCDay()]}`}` : null;
}

/** What an output of a day says of its load: the story's parts it needs. */
type LoadStory = { severity: string; split: { kind: string; name: string; part: { today: number; usual: number } } | null; hours?: { from: number; to: number; fall: number } | null; amount: { value: number; low: number; expected: number } | null; gate: { held: boolean } | null };

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * What a load with something wrong lacked, as the outputs built from it say it (ADR 0008 §10), from the figures its
 * head says: short for the outputs row ("from a short day", "without Vendor 1"), long for an output's own news ("Built
 * from a load 95% short from 13:00"). A part is said to be missing ("without") only when under a tenth of its usual
 * count came, as the head's "almost gone"; else it was short ("with Vendor 1 short"). Hours are short, never missing:
 * the trips fall, they don't end. Null when the day had nothing wrong.
 */
export function lacked(s: LoadStory): { short: string; long: string } | null {
  if (s.severity !== 'alert') return null;
  const sp = s.split;
  if (sp?.kind === 'vanished') {
    const ratio = sp.part.today / Math.max(1, sp.part.usual);
    if (ratio < 0.1) return { short: `without ${sp.name}`, long: `Built without ${sp.name}’s trips` };
    return { short: `with ${sp.name} short`, long: `Built with ${sp.name}’s trips ${Math.round((1 - ratio) * 100)}% short` };
  }
  if (s.hours) {
    const { from, to, fall } = s.hours;
    const span = to === 23 ? `from ${hh(from)}` : from === 0 ? `until ${hh(to + 1)}` : `${hh(from)}–${hh(to + 1)}`;
    return { short: 'from a short day', long: `Built from a load ${fall}% short ${span}` };
  }
  if (s.amount && s.amount.value < s.amount.low) {
    const change = Math.round((1 - s.amount.value / Math.max(1, s.amount.expected)) * 100);
    return { short: 'from a short day', long: `Built from a short day (−${change}% trips)` };
  }
  return { short: 'from a day with an alert', long: 'Built from a day with something wrong' };
}

/**
 * What a held load lacked, said above an output's own rows to someone who can't read the day's story (its source closed
 * to them, or the column it is about): from the flow's own verdict, the claim the run was held on or its checks, and
 * never a source's name, a value or a figure (ADR 0009 §12). "Built from a short load", "Built from a load with
 * something wrong", "Built from a load its checks held", "Built from a load not yet judged". Null for a run nothing held.
 */
export function heldLoadLine(holds: readonly { by: 'checks' | 'story' | 'unjudged'; claim?: { state: string; below: boolean } | undefined }[]): string | null {
  const story = holds.find((x) => x.by === 'story')?.claim;
  if (story?.below) return 'Built from a short load';
  if (story) return 'Built from a load with something wrong';
  if (holds.some((x) => x.by === 'checks')) return 'Built from a load its checks held';
  if (holds.some((x) => x.by === 'unjudged')) return 'Built from a load not yet judged';
  return null;
}

/** What became of a paused day's outputs (ADR 0009): waiting for a decision, published as is, or not published. */
export type PauseState = 'waiting' | 'asis' | 'dont';

/**
 * The outputs row on a day with something wrong: never "published" alone, which reads as good news. Held: "Outputs
 * not published"; else what they were built from: "Outputs built from a short day", "Outputs built without Vendor 1",
 * "Outputs built with Vendor 1 short".
 * Its icon draws a box for each of up to three outputs, so their number is said only past three ("5 outputs …").
 *
 * On a day paused (ADR 0009 §12), `n` counts the outputs that wait and the row says what became of them: "Paused · 3
 * outputs waiting" until someone decides, then "Published as is" or "Not published".
 */
export function reachLabel(s: LoadStory, n: number, pause?: PauseState): string {
  if (pause === 'waiting') return `Paused · ${n} output${n === 1 ? '' : 's'} waiting`;
  if (pause === 'asis') return 'Published as is';
  if (pause === 'dont') return 'Not published';
  const outs = n > 3 ? `${n} outputs` : n === 1 ? 'Output' : 'Outputs';
  if (s.gate?.held) return `${outs} not published`;
  const l = lacked(s);
  return l ? `${outs} built ${l.short}` : `Reaches ${n > 3 ? outs : `${n} output${n === 1 ? '' : 's'}`}`;
}
