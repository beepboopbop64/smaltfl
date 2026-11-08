/**
 * What a day's own view shows (ADR 0008 §10). Loads arrive one a day, as a feed brings them, and the flow publishes
 * only a run that passes (src/plugin/runtime.ts): after a held or refused run its outputs keep the last day that
 * passed. A day's view shows its own run, or, when it has none that passed, the latest day before it that did, said as
 * such on every panel that shows those rows; never a day after it, whose rows weren't there yet.
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
  /** "outputs keep Thu 21", "outputs keep its last run", "nothing passed before". */
  tail: string;
}

export function stoppedLine(o: { refused: boolean; origin?: string | undefined; shown: string | null | undefined; viewed: string }): StoppedLine {
  const lead = o.refused ? 'File refused' : o.origin ? `Held at ${o.origin}` : 'The run stopped';
  const tail = !o.shown ? 'nothing passed before' : o.shown === o.viewed ? 'outputs keep its last run' : `outputs keep ${dayShort(o.shown)}`;
  return { lead, tail };
}

/**
 * The date bar over a panel whose rows are another day's (ADR 0008 §10): "Rows from Thu Sep 21 · the last day that
 * passed". Null when the rows are the viewed day's own.
 */
export function rowsFrom(shown: string | null | undefined, viewed: string | null | undefined): string | null {
  if (!shown || !viewed || shown === viewed) return null;
  return `Rows from ${dayMid(shown)} · the last day that passed`;
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
