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
