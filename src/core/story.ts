/**
 * A day's story (ADR 0008): the day's news told as one cause and what follows from it, so a screen can draw it instead
 * of listing it. newsOf (news.ts) finds what is out of the ordinary; storyOf says what it adds up to:
 *
 * - the cause, as a population or a time: the part of the trips that held and the part that moved (a split: on Fri Sep
 *   22, 2023 the Flex Fare trips arrived as usual and every other trip almost stopped), the hour the trips fall, or an
 *   amount with no part to blame;
 * - the gate: whether the flow's checks would hold the run, with the rows they drop against the rows a day like it drops
 *   (a share past its limit because the kept rows are missing reads differently from one past it because bad rows came);
 * - every finding sorted by what the cause explains: absorbed (it restates the cause), follows (the cause predicts its
 *   count), same day (untested, or the prediction missed, but no bigger than what the cause moved), standalone. New
 *   values, new pairs, schema changes and integrity never fold;
 * - the episode it is part of (day 2 since Thu 13:00), or the recovery after one;
 * - its head, chips and labels, short enough to count: the screen's words come from here.
 *
 * Severity is carried through: a folded finding is told as a note, with what it was kept. No DOM, no engine.
 */
import { holidayOf, plusDays, recurringOf, seasonOf, shortName } from './calendar.js';
import { QUANTILES, type HistoryRanges } from './history.js';
import { shortfall, type EpisodeDay } from './days.js';
import { coverageOf, LEGACY_JUDGE, MATERIAL, hoursShort, materialFor, notJudgedChip, nounFor, partTemplate, shareWords, type Act, type Coverage, type Finding, type JudgeSettings, type Names, type Severity } from './news.js';

/** Rows today against the rows a day like it has: `usual` is the guess; `low` and `high` its range, when it has one. */
export interface Count {
  today: number;
  usual: number;
  low: number | null;
  high: number | null;
}

/** The part of the day's trips with one coded value, against everything else, when one held and the other moved. */
export interface Split {
  column: string;
  value: string;
  /** What the part is called: "Flex Fare", "Vendor 1", "Extras $0.50"; `trips` when it reads as a kind of trip. */
  name: string;
  trips: boolean;
  /** Who a code names, when its name is only the column and the code: "Creative Mobile" for "Vendor 1". */
  who?: string;
  /** What the named part did: kept to its usual count while the rest moved, or fell away, or surged, while the rest held. */
  kind: 'held' | 'vanished' | 'surged';
  /** Its column names who sent the rows (the ontology's `role: "sender"`): a part that stopped "sent almost nothing". */
  sender?: boolean;
  /** Its value is one the ontology marks bad (ADR 0010 §4): a surge in it is something wrong, told by its name. */
  bad?: boolean;
  part: Count;
  rest: Count;
  /** Columns blank on the part's rows (its count of blanks is the part's count): the same trips, said once. */
  blank: string[];
  /** Found through its blanks (a value and the fields blank on its rows, moving together), not by the split's own
   * test: the population a finding of that value is about, told as the day's cause by its share. */
  via?: 'blanks';
}

/** The flow's checks on the day: the share they drop against their limit, and the rows against a day like it. */
export interface Gate {
  step: string;
  rows: number;
  dropped: number;
  share: number;
  limit: number | null;
  held: boolean;
  /** Not held, but within a point of its limit: shown, as a near miss is worth seeing. */
  near: boolean;
  usual: { expected: number; low: number; high: number } | null;
  /** Each rule's failing rows today against a day like it; `never` when no day of the history to this one failed it. */
  rules: { name: string; warns: boolean; rows: number; share: number; usual: { low: number; high: number } | null; never: boolean }[];
}

export type Tier = 'cause' | 'absorbed' | 'follows' | 'sameDay' | 'standalone' | 'note';

/** A finding as the story tells it: its tier, its severity as told, and what it was before it was folded. */
export interface Told extends Finding {
  tier: Tier;
  was: Severity;
  /** Marked as expected on this day by a person: told among the notes, never as calm. */
  acknowledged?: boolean;
  /** For a folded value finding: the count the cause predicts, when it could be tested. */
  predicted?: number;
}

export type Hero = 'split' | 'hours' | 'amount' | 'gate' | 'finding' | 'calm' | 'refused';
export type Cell = 'file' | 'amount' | 'hours' | 'values' | 'shape';

export interface Story {
  day: string;
  /** `unlearned`: the day's rows have no range to be judged by, so nothing about them is told (ADR 0010 §1). */
  state: 'calm' | 'notes' | 'unusual' | 'wrong' | 'refused' | 'recovery' | 'unlearned';
  severity: Severity;
  head: string;
  chip: string | null;
  hero: Hero;
  /** The day's count and its usual range; `change`, how far it is from the guess when it is outside that range. */
  amount: { value: number; low: number; high: number; expected: number; change: number | null } | null;
  split: Split | null;
  hours: Finding['hours'] | null;
  /** The hour chart's words: the first short hour, the trips an hour after it, how many fewer came than a usual day
   * ("~77k fewer"; `missing` names the wash that draws them), the ghost's day; and, when the hours before the fall ran
   * well off a usual day's, by how much ("~8k above usual"), so the trips missing from the fall and the whole day's
   * change can both be read true (Sat Sep 17, 2022: ~52k fewer, the day −42%). */
  /** The hour chart's words; `floor` the short hours' rate ("still ~330/h"), empty when no trips came in them; `kept`
   * and `rest` name the two parts its bars stack when one part kept arriving after the fall ("Flex Fare", "everything
   * else"), else null. */
  hoursLabels: { cut: string; floor: string; missing: string; ghost: string; before: string | null; kept: string | null; rest: string | null } | null;
  /** The part that kept arriving after an hour fall while everything else stopped (`keptOf`): its rows by hour and the
   * rest's, from the load's own rows. Null on any other day, and where the load's rows by hour aren't known. */
  kept: Kept | null;
  gate: Gate | null;
  /** The finding the head is about, when there is one. */
  cause: Told | null;
  /** Up to two standalone findings that are something wrong or unusual, after the cause; `more`, the rest of them. */
  stories: Told[];
  more: Told[];
  follows: Told[];
  sameDay: Told[];
  absorbed: Told[];
  notes: Told[];
  /** Weather worth knowing on the day: context, never a reason. */
  context: Told | null;
  /** The episode a day with something wrong is part of: its days so far (each day's trips against its guess, the
   * viewed day last, none after it), and the trips short over them (days.shortfall: an estimate and its bound; with no
   * hour the trips fell, each day's guess less its trips, as its amount line says it). */
  episode: { days: number; since: string; hour: number | null; trend: { day: string; trips: number; expected: number }[]; short: { estimate: number; bound: number } | null } | null;
  /** The episode a calm day comes after: its days, the hour its first day fell from (null for a whole day), those the
   * checks held (never published) and the rest (published short), and what it was. */
  recovery: { from: string; to: string; hour: number | null; held: string[]; published: string[]; name: string | null } | null;
  /** Each cell, and how many of its numbers had no range that day (`unjudged`: ◌ with a count, ADR 0010 §1). */
  health: { cell: Cell; severity: Severity | null; explained: boolean; follows: number; sameDay: number; unjudged: number }[];
  /** What the day's news could judge (news.ts `coverageOf`). */
  coverage: Coverage;
  primary: Act | null;
  /** Labels the screen shows at a glance, so their words can be counted: rows, chips, the hero's marks. */
  labels: {
    amount: string[]; hero: string[]; gate: string[];
    /** The changes it explains and the ones the same day, as one row at a glance: its first named, the rest counted
     * ("Passengers 1 share + 27 more"); `follows` and `sameDay` head their groups once it opens, `kinds` beside them. */
    folded: string | null; follows: string | null; sameDay: string | null; notes: string | null; more: string | null; primary: string | null; kinds: string[]; after: string | null;
    /** Under an unusual head whose day's total is in its range and whose verb is only marking it: whether to act. */
    settle: string | null;
    key: string[]; context: string | null; health: string;
  };
  findings: Told[];
}

export interface StoryOptions {
  names: Names;
  /** The checks: their step, and the most they may drop (a share), when the flow has a limit. */
  step?: string;
  limit?: number | null;
  /** The run on this load stopped at the gate, when the app knows (else judged from the history and the limit). */
  held?: boolean;
  /** The day's file was refused: its bytes don't match the published list. */
  refused?: boolean;
  /** Findings marked as expected on this day, by key. */
  acknowledged?: ReadonlySet<string>;
  /** Columns the viewer's policy removes: no finding, split or prediction is told from them. */
  hidden?: ReadonlySet<string>;
  /**
   * The watched sources upstream of this node, each with what its own day said (ADR 0014 §2, §7): a finding about a
   * column that carries a source's name (the posture's `tls`, from the source `tls`) is that source's to tell, whatever
   * its own day said: that source's gate judges the column, so it is told here as following from it ("because tls"),
   * never counted twice; and when a source upstream had something wrong and the step's rows moved, the step's amount
   * and what moved with it follow from the source. Only what the joins introduce is the step's own. Read only under a
   * gate (`judge.checks`): a flow with no gate is judged as it always was (ADR 0013's controls example).
   */
  upstream?: readonly { source: string; state: string; head: string }[];
  /** Whether to look at the days before for an episode or a recovery (default true; a calendar of every day skips it). */
  episode?: boolean;
  /** How the source is judged (ADR 0010 §4, §8): the legacy form by default. */
  judge?: JudgeSettings;
  /** The viewed load's own rows by hour and by each value of one column (the split's), counted from its rows through
   * the plan and emit.ts (`emitHourValues`): what tells an hour fall where one part kept arriving (`keptOf`). The
   * history keeps no hour × value counts, so a day without its load's rows is told without it. */
  byHour?: HourValues;
}

/** A load's rows in each hour of its day, by each value of one column (values as the history writes them, JSON). */
export interface HourValues {
  column: string;
  values: Record<string, readonly number[]>;
}

/** The part that kept arriving after an hour fall: its column, value and name, and its rows and the rest's by hour. */
export interface Kept {
  column: string;
  value: string;
  name: string;
  got: number[];
  rest: number[];
}

/** After an hour fall, the rows of the hours after the fall's own that must be one value for it to be told as the part
 * that kept arriving (Thu Sep 21, 2023: 2,900 of 2,937 Flex Fare from 14:00, 98.7%; Sat Sep 17, 2022: all of them). */
export const KEPT_SHARE = 0.95;

export const ACT_VERB: Record<Act, string> = {
  // Marking a day as expected publishes nothing and is never required (ADR 0008 §6): said so on it.
  expected: 'Mark as expected (optional)',
  incident: 'Open an incident',
  notify: 'Tell the source',
  rule: 'Add a check',
  quarantine: 'Set aside',
  refetch: 'Fetch again',
  export: 'Export for audit',
};

/** The health row's cells (ADR 0008 §6), in order, each with the kinds of finding it holds and its name on screen. */
export const CELL_KINDS: Record<Cell, readonly Finding['kind'][]> = { file: ['integrity', 'schema'], amount: ['volume'], hours: ['hours'], values: ['gone', 'share', 'band', 'due', 'scope', 'needs', 'new', 'pair', 'combo', 'unlike', 'missing'], shape: ['shape'] };
export const CELL_NAMES: Record<Cell, string> = { file: 'File', amount: 'Amount', hours: 'Hours', values: 'Values', shape: 'Shape' };
/** The health row's heading: what the five cells are, said once and counted at a glance. */
export const HEALTH_HEAD = 'Health';
/** The tag before the weather a card notes (ADR 0008 §11): context, never a cause; counted at a glance. */
export const CONTEXT_TAG = 'Context';
/** Under an unusual head whose day's total is in its range, with nothing to decide: the day's trips all came. */
export const SETTLE_LINE = 'Total in range · nothing to do';

const RANK: Record<Severity, number> = { alert: 0, warn: 1, note: 2, ok: 3 };
const VALUE_KINDS = new Set<Finding['kind']>(['gone', 'share', 'missing']);
const NEVER_FOLD = new Set<Finding['kind']>(['new', 'pair', 'combo', 'unlike', 'band', 'due', 'scope', 'needs', 'schema', 'integrity', 'weather', 'calm', 'unlearned']);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const worst = (xs: readonly Severity[]): Severity => xs.reduce<Severity>((a, b) => (RANK[b] < RANK[a] ? b : a), 'ok');
const weekdayOf = (day: string) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
const clock = (h: number) => `${String(h).padStart(2, '0')}:00`;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A day's change against its guess, as the amount line says it: "−65%", "+29%". */
export const changeLabel = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`;

/** A count said short: 20, 4,613, 4.8k, 110k, 1.2M. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (a < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A count said short but fine enough to subtract from another: 68.5k (not 68k beside a +2k), 4.8k, 110k. */
export function approx(n: number): string {
  const a = Math.abs(n);
  return a >= 10_000 && a < 100_000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : compact(n);
}

/** A part's count against its usual one, so it can't read as a fraction of it: "10,518 · usual ~4.5k". */
export const countLabel = (c: Count) => `${fmtInt(c.today)} · usual ~${approx(c.usual)}`;

/** The trips a part that surged has beyond its usual count, said under them on its bar ("+6k over usual"); null for
 * any other split (a part that held a little above its usual is within its range, and isn't news). */
export const overLabel = (sp: Pick<Split, 'kind' | 'part'>) => (sp.kind === 'surged' && sp.part.today > sp.part.usual ? `+${compact(sp.part.today - sp.part.usual)} over usual` : null);

/**
 * A finding named short, as a row of changes names its first one (ADR 0008 §6): its title up to its figures, with what
 * a share is ("Passengers 1 share", "Extras 2.5 gone", "Duration rule", "Checks dropped"); a title still over four words
 * is said by its column (`column`), when it has one.
 */
export function rowName(f: Pick<Finding, 'title' | 'kind'>, column?: string | null): string {
  const base = f.title.replace(/\s*\(usually [^)]*\)\s*$/, '').replace(/:.*$/, '').replace(/\s+[−+-]?[\d.,]+[%×](\s.*)?$/, '').trim() || f.title;
  const what = f.kind === 'share' ? ' share' : f.kind === 'gone' ? ' gone' : f.kind === 'missing' ? ' blank' : '';
  const named = wordsIn(base) > 4 && column ? column : base;
  return `${named}${what}`;
}

/** The split's part as its visuals name it: its name, and who a code names beside it ("Vendor 1 · Creative Mobile"). */
export const partLabel = (sp: Pick<Split, 'name' | 'who'>) => (sp.who ? `${sp.name} · ${sp.who}` : sp.name);

/**
 * A rule's usual failing rows, said one way wherever its row is drawn: "never fails" when no day to this one failed it,
 * "usual 0" when a day like it fails less than one row, one number when both ends round to it ("usual 1"), else the
 * range; nothing when it has no range (and its row then ends on its count, no dangling "·").
 */
export function ruleUsual(r: Pick<Gate['rules'][number], 'usual' | 'never' | 'rows'>): string {
  if (r.never && r.rows === 0) return 'never fails';
  if (!r.usual) return '';
  if (r.usual.high < 1) return 'usual 0';
  const lo = compact(r.usual.low);
  const hi = compact(r.usual.high);
  return lo === hi ? `usual ${hi}` : `usual ${lo}–${hi}`;
}

/** The checks' rules in one order wherever they are drawn: the rules that drop by rows today, the most first; the
 * rules that only warn last. */
export const ruleOrder = <R extends Pick<Gate['rules'][number], 'warns' | 'rows' | 'name'>>(rules: readonly R[]): R[] =>
  [...rules].sort((a, b) => Number(a.warns) - Number(b.warns) || b.rows - a.rows || a.name.localeCompare(b.name));

/** Words a cut head never starts or ends on. */
const SMALL = /^(and|or|of|the|a|an|for|to|in|on|at|with|than)$/i;

/** A head cut to what a canvas card's line holds (`room` characters) without cutting a word or its number: a
 * "(usually …)" first, then the words before a colon from the front ("Flex Fare trips: 5.3%"), else words from the end. */
export function cardWords(head: string, room: number): string {
  const text = head.replace(/\s*\([^)]*\)\s*$/, '');
  if (text.length <= room) return text;
  // A combination's head ("TLS Passing with Encryption at rest Failing: 47", ADR 0013) keeps its start: the pair is
  // the point, the count is on the card's sheet.
  if (/ with /.test(text)) {
    const words = text.split(/\s+/);
    while (words.length > 1 && words.join(' ').length + 1 > room) words.pop();
    return `${words.join(' ')}…`;
  }
  const at = text.indexOf(': ');
  if (at > 0) {
    const tail = text.slice(at);
    const words = text.slice(0, at).split(/\s+/);
    while (words.length > 1 && (words.join(' ').length + tail.length > room || SMALL.test(words[0]!))) words.shift();
    if (words.join(' ').length + tail.length <= room) return words.join(' ') + tail;
  }
  const words = text.split(/\s+/);
  while (words.length > 1 && (words.join(' ').length > room || SMALL.test(words.at(-1)!))) words.pop();
  return words.join(' ');
}

/** A strip of days' key, where it is first shown: each day's usual range as a box, and what it had as a tick. */
export const STRIP_KEY = ['usual', 'actual'] as const;

/** A share as a percentage that keeps the decimals showing which side of the limit it is on: "10.45%" against 10%. */
export function pastLimit(x: number, limit: number | null): string {
  if (limit === null) return `${Math.round(x * 100)}%`;
  for (let d = 0; d <= 3; d++) {
    const shown = Number((x * 100).toFixed(d));
    if ((x > limit) === (shown > limit * 100) && shown !== limit * 100) return `${(x * 100).toFixed(d)}%`;
  }
  return `${(x * 100).toFixed(3)}%`;
}

/** How close to its limit a share has to be for the gate to be drawn zoomed, with its margin said (two points). */
export const NEAR_LIMIT = 0.02;

/**
 * The checks' words (ADR 0008), one per bar so neither reads as the other: the share of the rows that arrived that they
 * dropped ("46% of arrived rows dropped"), the limit, how far from it within two points ("0.45 pt over"), and the rows
 * they dropped against the rows a day like it drops ("2,116 rows dropped", "usual 3.2k–7.7k"). `said` is the share alone,
 * for a head over those bars ("Passed: 8.6% dropped", never 9% over a bar that says 8.6%).
 */
export function gateLabels(g: Gate): { said: string; share: string; limit: string | null; margin: string | null; zoom: boolean; rows: string; usual: string | null } {
  const off = g.limit === null ? null : g.share - g.limit;
  const pts = off === null ? 0 : Math.abs(off) * 100;
  // One rule wherever a share of the checks is printed: one decimal, two within a point of the limit, more only when it
  // would read as the limit itself; and the gap to the limit always, to the same decimals, so one is the other less the
  // limit ("45.7% … 35.7 pt over", "9.55% … 0.45 pt under", "4.6% … 5.4 pt under").
  // The share is rounded once and the gap worked out from the share as printed, so the two always subtract to the limit
  // (11.25% printed "11.3%" is "1.3 pt over", never "1.2").
  const lim = g.limit === null ? null : Math.round(g.limit * 1e6) / 1e4;
  const shown = (d: number) => Number((g.share * 100).toFixed(d));
  let dec = off !== null && Math.abs(off) <= 0.01 ? 2 : 1;
  while (off !== null && off !== 0 && shown(dec) === lim && dec < 4) dec++;
  const gap = lim === null ? 0 : Math.abs(shown(dec) - lim);
  // A share that isn't nothing never prints as 0.0% (ADR 0008 §12).
  const share = g.share > 0 && shown(dec) === 0 ? '<0.1%' : `${(g.share * 100).toFixed(dec)}%`;
  return {
    said: share,
    share: `${share} of arrived rows dropped`,
    limit: g.limit !== null ? `limit ${Math.round(g.limit * 100)}%` : null,
    margin: off !== null && off !== 0 ? `${gap.toFixed(dec)} pt ${off > 0 ? 'over' : 'under'}` : null,
    // Within two points of the limit the share is drawn again on a zoom, its margin said there.
    zoom: off !== null && off !== 0 && Math.abs(off) <= NEAR_LIMIT,
    rows: `${fmtInt(g.dropped)} rows dropped`,
    usual: g.usual ? `usual ${compact(g.usual.low)}–${compact(g.usual.high)}` : null,
  };
}

/** The gate as a head or a sheet's title, its share said as its bars say it: "Held at trips_valid: 10.45% dropped". */
export const gateHead = (g: Gate) => `${g.held ? 'Held at ' : ''}${g.step}: ${gateLabels(g).said} dropped`;

/** A company's name said short, legal form and all but its first two words left off: "Creative Mobile". */
export function shortWho(name: string): string {
  return name.replace(/,?\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|Corp\.?|Co\.?|Company)$/i, '').split(/\s+/).slice(0, 2).join(' ');
}

/** Words as the screen's budgets count them: whitespace tokens with a letter or a digit in them. */
export function wordsIn(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * What a coded value's part is called in a head, and whether it reads as a kind of trip: a code's short meaning is one
 * ("Flex Fare" trips, "Cash" trips); anything else is said with its column ("Extras $0.50", "Vendor 1"). A column whose
 * property names its parts ("Vendor {code}", ADR 0010 §8) is said by its code and named beside it; and its `role`
 * says whether a part that stopped sent almost nothing. The legacy form names a vendor so when the ontology doesn't.
 */
function partName(column: string, value: string, names: Names, judge: JudgeSettings): { name: string; trips: boolean; who?: string; sender: boolean } {
  const parsed = (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })();
  const part = names.part?.(column);
  const named = partTemplate(names, column, parsed) ?? (judge.legacy && !part && /vendor/i.test(column) ? `Vendor ${String(parsed)}` : undefined);
  const sender = part ? part.role === 'sender' : judge.legacy && /vendor/i.test(column);
  if (named) {
    // A part said by its code, as the files say it, and named beside it: "Vendor 1 · Creative Mobile".
    const meant = names.label?.(column, parsed);
    return { name: named, trips: true, sender, ...(meant && meant !== String(parsed) ? { who: shortWho(meant) } : {}) };
  }
  const label = (names.label ?? names.value)(column, parsed).replace(/\s+trips?$/i, '');
  const meaning = label !== String(parsed) && !/^\$?-?[\d.,]+$/.test(label);
  return meaning && wordsIn(label) <= 3 ? { name: label, trips: true, sender } : { name: `${names.column(column)} ${label.length <= 8 ? label : String(parsed)}`, trips: false, sender };
}

/**
 * The part that kept arriving after an hour fall (ADR 0008 §6): with the load's own rows by hour and value (`byHour`),
 * when they add up to the day's hours in every hour (the rows the history counted, or nothing is told from them), the
 * fall runs to the day's end, and the rows in the hours after the fall's own are almost all one value (`KEPT_SHARE`):
 * Thu Sep 21, 2023's Flex Fare, every other payment having stopped by 13:06; Sat Sep 17, 2022's from 15:00. A day where
 * the rest fell but didn't stop has none (it keeps its trickle), nor does a blank, nor a column the viewer may not read.
 */
export function keptOf(hours: Finding['hours'] | null | undefined, by: HourValues | undefined, names: Names, judge: JudgeSettings = LEGACY_JUDGE, hidden: ReadonlySet<string> = new Set()): Kept | null {
  if (!hours || !by || hidden.has(by.column.toLowerCase())) return null;
  const { got, from, to } = hours;
  if (got.length !== 24 || to !== 23 || from >= 23) return null;
  const values = Object.entries(by.values);
  for (let i = 0; i < 24; i++) if (values.reduce((t, [, xs]) => t + (xs[i] ?? 0), 0) !== got[i]) return null;
  const tail = (xs: readonly number[]) => xs.slice(from + 1, 24).reduce((a, b) => a + (b ?? 0), 0);
  const after = tail(got);
  if (after <= 0) return null;
  const best = values.map(([value, xs]) => ({ value, xs, n: tail(xs) })).sort((a, b) => b.n - a.n)[0];
  if (!best || best.value === 'null' || best.n < KEPT_SHARE * after) return null;
  const part = Array.from({ length: 24 }, (_, i) => best.xs[i] ?? 0);
  return { column: by.column, value: best.value, name: partName(by.column, best.value, names, judge).name, got: part, rest: got.map((n, i) => n - part[i]!) };
}

/**
 * The part that held and the part that moved, when one coded value's trips and everything else's went different ways:
 * one side within two thirds to one and a half of its usual count, the other off by twice or more, the moved side
 * carrying at least 40% of the day's change and 200 trips. The named side is the smaller one, and never a blank, so a
 * head names a population ("Flex Fare") and not its symptom ("Stored and forwarded N"). Null when nothing stands out.
 */
export function splitOf(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string> = new Set(), judge: JudgeSettings = LEGACY_JUDGE): Split | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  const range = h.of({ of: 'trips' })?.at(day);
  if (k < 0 || !range) return null;
  const n = file.rows[k]!;
  const E = range.expected;
  const floor = materialFor(E, judge.scale).split;
  const change = n - E;
  const steady = (r: number) => r >= 2 / 3 && r <= 1.5;
  let best: { column: string; value: string; kind: Split['kind']; nv: number; Ev: number; score: number; bad: boolean } | null = null;
  for (const [column, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts || hidden.has(column.toLowerCase())) continue;
    const badCodes = judge.bad.get(column.toLowerCase());
    vh.values.forEach((value, i) => {
      if (value === 'null') return;
      const share = h.of({ of: 'value', column, value })?.at(day)?.expected;
      if (share === undefined) return;
      const Ev = share * E;
      if (Ev < floor || Ev > E - Ev) return;
      const nv = vh.counts![k]![i] ?? 0;
      const rs = nv / Ev;
      const rr = (n - nv) / Math.max(1, E - Ev);
      const apart = Math.abs(Math.log((rs + 1e-4) / (rr + 1e-4))) >= Math.log(2);
      if (!apart) return;
      const dv = nv - Ev;
      const dr = n - nv - (E - Ev);
      let kind: Split['kind'] | null = null;
      if (steady(rr) && Math.abs(dv) >= 0.4 * Math.abs(change) && Math.abs(dv) >= floor) kind = rs < rr ? 'vanished' : 'surged';
      else if (steady(rs) && Math.abs(dr) >= 0.4 * Math.abs(change) && Math.abs(dr) >= floor) kind = 'held';
      if (!kind) return;
      const score = Math.abs(Math.log((rs + 1e-4) / (rr + 1e-4)));
      // A value marked bad that surged or vanished is the day's cause before any other part (ADR 0010 §4): a burst of
      // failed sign-ins is told by its failures, not by the country it came from. One that held while the rest moved is
      // no cause of its own, and comes first of nothing.
      let bad = false;
      try {
        bad = kind !== 'held' && !!badCodes?.has(String(JSON.parse(value)));
      } catch {
        bad = false;
      }
      if (!best || (bad && !best.bad) || (bad === best.bad && score > best.score)) best = { column, value, kind, nv, Ev, score, bad };
    });
  }
  const b = best as { column: string; value: string; kind: Split['kind']; nv: number; Ev: number } | null;
  return b ? splitWith(h, day, names, hidden, b, judge) : null;
}

/** The split for one coded value, its kind and counts decided. */
function splitWith(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string>, b: { column: string; value: string; kind: Split['kind']; nv: number; Ev: number }, judge: JudgeSettings): Split {
  const file = h.file;
  const k = file.days.indexOf(day);
  const n = file.rows[k]!;
  const E = h.of({ of: 'trips' })!.at(day)!.expected;
  // Its usual count is the one the split was judged on (its usual share of the trips a day like it has); its count's
  // own range is drawn when that range is about the same day (a new tariff's count has no usual yet).
  const counted = h.of({ of: 'count', column: b.column, value: b.value })?.at(day);
  const usual = b.Ev;
  const near = counted && counted.expected > usual / 2 && counted.expected < usual * 2;
  // Columns blank on the part's rows: their blanks number the part's rows, give or take a fiftieth of the day.
  const blank: string[] = [];
  if (b.kind !== 'vanished' && b.nv > 0) {
    for (const [column, vh] of Object.entries(file.values ?? {})) {
      const at = vh.values.indexOf('null');
      if (column === b.column || at < 0 || !vh.counts || hidden.has(column.toLowerCase())) continue;
      if (Math.abs((vh.counts[k]![at] ?? 0) - b.nv) <= 0.02 * n) blank.push(names.column(column));
    }
  }
  const named = partName(b.column, b.value, names, judge);
  const isBad = (() => {
    try {
      return judge.bad.get(b.column.toLowerCase())?.has(String(JSON.parse(b.value))) ?? false;
    } catch {
      return false;
    }
  })();
  return {
    column: b.column,
    value: b.value,
    name: named.name,
    trips: named.trips,
    ...(named.who ? { who: named.who } : {}),
    kind: b.kind,
    ...(named.sender ? { sender: true } : {}),
    ...(isBad ? { bad: true } : {}),
    part: { today: b.nv, usual, low: near ? counted!.low : null, high: near ? counted!.high : null },
    rest: { today: n - b.nv, usual: Math.max(0, E - usual), low: null, high: null },
    blank,
  };
}

/**
 * A coded value's count on a day like it: its count's own range, or, where that has none (a holiday whose count moved
 * too far since last year to be judged by it: New Year's Day 2024's Flex Fare trips), its share's range of the trips a
 * day like it has, which is the count a split is judged on (ADR 0008 §2). Null when neither has a range.
 */
export function countRange(h: HistoryRanges, column: string, value: string, day: string): { low: number; high: number; expected: number } | null {
  const own = h.of({ of: 'count', column, value })?.at(day);
  if (own) return { low: own.low, high: own.high, expected: own.expected };
  const share = h.of({ of: 'value', column, value })?.at(day);
  const trips = h.of({ of: 'trips' })?.at(day);
  return share && trips ? { low: share.low * trips.expected, high: share.high * trips.expected, expected: share.expected * trips.expected } : null;
}

/**
 * The population a value and the fields blank on its rows are (a finding told together: payment type 0 with five
 * fields blank, Mon Sep 18, 2023's Flex Fare trips at 5.3% of the day where 2.1–4.6% is usual), as a split: its trips
 * against everything else's, when everything else kept to its usual count and the part moved by 200 trips or more.
 * That finding has already judged the part out of the ordinary, so the split's own test of twice apart isn't asked
 * again. Null when it doesn't hold.
 */
export function populationOf(h: HistoryRanges, day: string, names: Names, f: Finding, hidden: ReadonlySet<string> = new Set(), judge: JudgeSettings = LEGACY_JUDGE): Split | null {
  const ms = f.members ?? [];
  const coded = ms.filter((m) => m.value !== 'null');
  if (ms.length < 2 || coded.length !== 1) return null;
  const { column, value } = coded[0]!;
  const file = h.file;
  const k = file.days.indexOf(day);
  const range = h.of({ of: 'trips' })?.at(day);
  const vh = file.values?.[column];
  const share = h.of({ of: 'value', column, value })?.at(day)?.expected;
  if (k < 0 || !range || !vh?.counts || share === undefined || hidden.has(column.toLowerCase())) return null;
  const at = vh.values.indexOf(value);
  if (at < 0) return null;
  const n = file.rows[k]!;
  const E = range.expected;
  const Ev = share * E;
  const nv = vh.counts[k]![at] ?? 0;
  const rr = (n - nv) / Math.max(1, E - Ev);
  if (Ev < 1 || Ev > E - Ev || rr < 2 / 3 || rr > 1.5 || Math.abs(nv - Ev) < materialFor(E, judge.scale).split) return null;
  return { ...splitWith(h, day, names, hidden, { column, value, kind: nv > Ev ? 'surged' : 'vanished', nv, Ev }, judge), via: 'blanks' };
}

/** The checks on the day, from the history: the share and the rows they drop, by rule, against a day like it. */
export function gateOf(h: HistoryRanges, day: string, step: string, limit: number | null): Gate | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  if (k < 0) return null;
  const rows = file.rows[k]!;
  const dropped = file.dropped[k]!;
  const share = rows ? dropped / rows : 0;
  const usual = h.of({ of: 'droppedRows' })?.at(day);
  return {
    step, rows, dropped, share, limit,
    held: limit !== null && share > limit,
    near: limit !== null && share <= limit && share >= limit - 0.01,
    usual: usual ? { expected: usual.expected, low: usual.low, high: usual.high } : null,
    rules: file.rules.map((r, i) => {
      const u = h.of({ of: 'ruleRows', name: r.name })?.at(day);
      const n = file.failed[k]![i] ?? 0;
      let never = true;
      for (let j = 0; j <= k && never; j++) if ((file.failed[j]?.[i] ?? 0) > 0) never = false;
      return { name: r.name, warns: r.onFail === 'warn', rows: n, share: rows ? n / rows : 0, usual: u ? { low: u.low, high: u.high } : null, never };
    }),
  };
}

/** P(a column's value | the split's value), from the history's long-run counts of the two together; null untested. */
function conditional(h: HistoryRanges, column: string, of: string, value: string): Map<string, number> | null {
  const pairs = h.file.pairs ?? {};
  const key = pairs[`${column}|${of}`] ? `${column}|${of}` : pairs[`${of}|${column}`] ? `${of}|${column}` : null;
  if (!key) return null;
  const p = pairs[key]!;
  const ofFirst = key.startsWith(`${of}|`);
  const out = new Map<string, number>();
  let total = 0;
  p.values.forEach((vj, i) => {
    const [a, b] = JSON.parse(vj) as [unknown, unknown];
    const s = ofFirst ? a : b;
    const v = ofFirst ? b : a;
    if (JSON.stringify(s) !== value) return;
    out.set(JSON.stringify(v), (out.get(JSON.stringify(v)) ?? 0) + p.rows[i]!);
    total += p.rows[i]!;
  });
  if (!total) return null;
  for (const [v, n] of out) out.set(v, n / total);
  return out;
}

/** The minute of the day by which a share of the day's trips have been picked up, from its trips by hour. */
function minuteAt(hours: readonly number[], q: number): number {
  const total = hours.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let x = 0; x < 24; x++) {
    if (hours[x]! > 0 && acc + hours[x]! >= q * total) return x * 60 + (60 * (q * total - acc)) / hours[x]!;
    acc += hours[x]!;
  }
  return 1440;
}

/**
 * Whether a day had a cause of something wrong (almost no trips, trips that stop, or a part that vanished or held),
 * and what it was, in at most three words: "trips fell", "only Flex Fare", "Vendor 1 missing".
 */
function badDay(h: HistoryRanges, day: string, names: Names, hidden: ReadonlySet<string>, judge: JudgeSettings): { hour: number | null; name: string | null } | null {
  const file = h.file;
  const k = file.days.indexOf(day);
  const r = h.of({ of: 'trips' })?.at(day);
  if (k < 0 || !r) return null;
  const n = file.rows[k]!;
  const hours = hoursShort(h, k, r.expected);
  const noun = nounFor(names);
  if (hours && n >= MATERIAL.blank * r.expected) return { hour: hours.hours && hours.hours.to === 23 ? hours.hours.from : null, name: hours.hours && hours.hours.from === 0 && hours.hours.start === undefined ? 'late start' : `${noun} fell` };
  const s = n >= r.low && n <= r.high ? null : splitOf(h, day, names, hidden, judge);
  const said = (x: string) => (wordsIn(x) <= 3 ? x : null);
  if (s && s.kind === 'held') return { hour: null, name: s.rest.today < 0.1 * s.rest.usual ? said(`only ${s.name}`) : said(`${noun} short`) };
  if (s && s.kind === 'vanished') return { hour: null, name: said(`${s.name} ${s.part.today < 0.1 * s.part.usual ? 'missing' : 'short'}`) };
  if (n < MATERIAL.blank * r.expected) return { hour: null, name: said(`almost no ${noun}`) };
  return null;
}

/** The day's story, from its findings (newsOf, with the app's integrity findings when it has them). */
export function storyOf(h: HistoryRanges, day: string, findings: readonly Finding[], o: StoryOptions): Story {
  const file = h.file;
  const k = file.days.indexOf(day);
  const names = o.names;
  const judge = o.judge ?? LEGACY_JUDGE;
  const noun = (n?: number) => nounFor(names, n);
  const Noun = (n?: number) => noun(n).charAt(0).toUpperCase() + noun(n).slice(1);
  const ack = o.acknowledged ?? new Set<string>();
  const hidden = new Set([...(o.hidden ?? [])].map((c) => c.toLowerCase()));
  const shown = (f: Finding) => !(f.columns ?? []).some((c) => hidden.has(c.toLowerCase())) && !(f.members ?? []).some((m) => hidden.has(m.column.toLowerCase()));
  const tripsRange = k >= 0 ? h.of({ of: 'trips' })?.at(day) : null;
  const amount = tripsRange && k >= 0 ? { value: file.rows[k]!, low: tripsRange.low, high: tripsRange.high, expected: tripsRange.expected, change: file.rows[k]! < tripsRange.low || file.rows[k]! > tripsRange.high ? file.rows[k]! / tripsRange.expected - 1 : null } : null;
  const live = findings.filter((f) => f.kind !== 'calm' && f.kind !== 'unlearned' && shown(f));
  const volume = live.find((f) => f.kind === 'volume') ?? null;
  const hoursF = live.find((f) => f.kind === 'hours') ?? null;
  // Explained upstream (ADR 0014 §2): a finding about a column carrying a watched source's name on a day that source's
  // own story wasn't calm is never loud here; it follows from the source.
  const upstream = o.judge?.checks ? o.upstream : undefined;
  const explained = (f: Finding): boolean => !!upstream?.length && f.kind !== 'needs' && f.kind !== 'scope'
    && upstream.some((x) => [...(f.columns ?? []), ...(f.members ?? []).map((m) => m.column)].some((c) => c.toLowerCase() === x.source.toLowerCase() || c.toLowerCase().startsWith(`${x.source.toLowerCase()}_`)));
  const loudRaw = (f: Finding) => (f.severity === 'alert' || f.severity === 'warn') && !ack.has(f.key);
  const loud = (f: Finding) => loudRaw(f) && !explained(f);
  const valueStories = live.filter((f) => VALUE_KINDS.has(f.kind) && loud(f)).length;
  // A value marked bad that is something wrong leads the day (ADR 0010 §4, the owner: always alert, an incident): told
  // by its own finding unless a split leads with that value surging or vanishing.
  const badLead = live.filter((f) => f.bad && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  // A column gone blank beyond what a day like it has leads too (ADR 0013: a control's file with no rows, or rows its
  // checks dropped, leaves blanks in its column of the posture): its values' shares falling away are what the blanks
  // are, not a part that vanished.
  const blankLead = live.filter((f) => f.kind === 'missing' && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  // A value never seen in a column where that is something wrong (ADR 0010 §4) leads the day too: what the checks drop
  // and the shares that fell follow from it.
  const newLead = live.filter((f) => f.kind === 'new' && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  // A written band missed (ADR 0014 §3) leads after a bad value: the contract comes before what is learned.
  const bandLead = live.filter((f) => f.kind === 'band' && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  // A due mark's late share beyond its usual (ADR 0014 §3) leads too: the lateness is the cause of the misses.
  const dueLead = live.filter((f) => f.kind === 'due' && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  // A written rule broken (ADR 0014 §4) leads too: rows out of scope, or a contradiction, say more than the amount.
  const ruleLead = live.filter((f) => (f.kind === 'scope' || f.kind === 'needs') && f.severity === 'alert' && loud(f)).sort((a, b) => b.score - a.score)[0] ?? null;
  const lead = (badLead && badLead.kind !== 'band' ? badLead : null) ?? bandLead ?? dueLead ?? ruleLead ?? newLead ?? blankLead;
  const splitFound = k >= 0 && (volume || valueStories >= 2) ? splitOf(h, day, names, hidden, judge) : null;
  const split = splitFound && (!lead || (splitFound.bad && splitFound.kind !== 'held' && !blankLead)) ? splitFound : null;
  const gate = k >= 0 && o.step ? gateOf(h, day, o.step, o.limit ?? null) : null;
  if (gate && o.held !== undefined) (gate.held = o.held), gate.held && (gate.near = false);
  const blankDay = !!volume && volume.value !== undefined && !!volume.range && volume.value < MATERIAL.blank * volume.range.expected;
  // A population seen through its blanks (a value and the fields blank on its rows, told together): the day's cause
  // when nothing else is, named by the value and not by a blank or a symptom (Mon Sep 18, 2023's Flex Fare trips).
  const popFinding = k >= 0 && !o.refused && !split && !lead && !hoursF && !(volume && loud(volume)) && !gate?.held
    ? (live.filter((f) => f.members && loud(f)).sort((a, b) => b.score - a.score).find((f) => populationOf(h, day, names, f, hidden, judge)) ?? null)
    : null;
  const population = popFinding ? populationOf(h, day, names, popFinding, hidden, judge) : null;
  // What the findings are tested against: the split, or the population.
  const basis = split ?? population;

  // The rows the cause moved: what a finding folded as "same day" may be no bigger than.
  const size = basis ? Math.max(Math.abs(basis.part.today - basis.part.usual), Math.abs(basis.rest.today - basis.rest.usual))
    : hoursF ? (hoursF.rows ?? 0)
    : volume && volume.range && volume.value !== undefined ? Math.abs(volume.value - volume.range.expected) : 0;
  const caused = !!(basis || hoursF || (volume && loud(volume)));
  // A step's rows are its sources' (ADR 0014 §2): when a source upstream had something wrong on the day, the step's
  // amount, and a bad value whose share is as usual but whose rows moved with the amount, follow from it.
  const wrongUpstream = upstream?.find((u) => u.state === 'wrong' || u.state === 'refused') ?? null;
  const viaRows = (f: Finding): string | null => {
    if (!wrongUpstream || !volume || !loudRaw(volume)) return null;
    if (f.kind === 'needs' || f.kind === 'scope') return null;
    return `upstream:${wrongUpstream.source}`;
  };
  const hero: Hero = o.refused ? 'refused' : hoursF ? 'hours' : split ? 'split' : lead ? 'finding' : volume && loud(volume) && !viaRows(volume) ? 'amount' : gate?.held ? 'gate' : 'finding';

  // Tier each finding.
  const n = k >= 0 ? file.rows[k]! : 0;
  const scale = basis ? basis.rest.today / Math.max(1, basis.rest.usual) : 1;
  const conditionals = new Map<string, Map<string, number> | null>();
  const predict = (column: string, value: string): { pred: number; ok: boolean } | null => {
    const split = basis;
    if (!split || k < 0) return null;
    const vh = file.values?.[column];
    const r = h.of({ of: 'value', column, value })?.at(day);
    if (!vh?.counts || !r || !tripsRange) return null;
    const at = vh.values.indexOf(value);
    if (at < 0) return null;
    let pS: number | null;
    if (column === split.column) pS = value === split.value ? 1 : 0;
    else if (hidden.has(column.toLowerCase())) return null;
    else {
      if (!conditionals.has(column)) conditionals.set(column, conditional(h, column, split.column, split.value));
      const c = conditionals.get(column)!;
      pS = c ? (c.get(value) ?? 0) : null;
    }
    if (pS === null) return null;
    const Ev = r.expected * tripsRange.expected;
    const pred = split.part.today * pS + scale * Math.max(0, Ev - split.part.usual * pS);
    const obs = vh.counts[k]![at] ?? 0;
    const tol = 3 * Math.sqrt(Math.max(1, pred)) + ((r.high - r.low) / 6) * n;
    const resid = Math.abs(obs - pred);
    return { pred, ok: resid <= tol || resid < MATERIAL.rows || resid / Math.max(1, n) < MATERIAL.share };
  };
  const members = (f: Finding): { column: string; value: string }[] =>
    f.members?.map((m) => ({ column: m.column, value: m.value })) ?? (f.columns ?? []).map((c, i) => ({ column: c, value: f.values?.[i] ?? 'null' }));
  const blankCols = new Set(basis?.blank ?? []);
  // What an upstream source's own day explains (ADR 0014 §2): a finding about a column named for it, when its story
  // said something that day. Its key is the finding's `because`.
  const upstreamOf = (f: Finding): string | null => {
    if (!upstream?.length || f.kind === 'needs' || f.kind === 'scope') return null;
    const columns = [...(f.columns ?? []), ...(f.members ?? []).map((m) => m.column)].map((c) => c.toLowerCase());
    const u = upstream.find((x) => columns.some((c) => c === x.source.toLowerCase() || c.startsWith(`${x.source.toLowerCase()}_`)));
    return u ? `upstream:${u.source}` : null;
  };
  const tierOf = (f: Finding): { tier: Tier; predicted?: number } => {
    if (ack.has(f.key)) return { tier: 'note' };
    if (upstreamOf(f) || viaRows(f)) return { tier: 'follows' };
    // A column gone blank: its values' shares falling away, and anything about its values, are the blanks (ADR 0013).
    if (blankLead && f !== blankLead && (f.columns ?? []).some((c) => blankLead.columns?.includes(c)) && f.kind !== 'new') return { tier: 'absorbed' };
    if (f === popFinding && population) return { tier: 'cause' };
    if (f === hoursF && hero === 'hours') return { tier: 'cause' };
    if (f === volume) return hero === 'amount' ? { tier: 'cause' } : caused ? { tier: 'absorbed' } : { tier: loud(f) ? 'standalone' : 'note' };
    // A value marked bad is told at its own severity, never as part of a cause (ADR 0010 §4).
    if (NEVER_FOLD.has(f.kind) || f.bad || f.severity === 'ok') return { tier: loud(f) ? 'standalone' : 'note' };
    if (f.kind === 'dropped' && gate?.held && hero === 'gate') return { tier: 'absorbed' };
    if (!caused) return { tier: loud(f) ? 'standalone' : 'note' };
    const within = (f.rows ?? 0) <= size;
    if (VALUE_KINDS.has(f.kind)) {
      const ms = members(f);
      if (basis && ms.every((m) => m.column === basis.column || (m.value === 'null' && blankCols.has(names.column(m.column))))) return { tier: 'absorbed' };
      if (basis) {
        const tests = ms.map((m) => predict(m.column, m.value));
        if (tests.every((t) => t?.ok)) return { tier: 'follows', predicted: ms.length === 1 ? tests[0]!.pred : undefined };
      }
      return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
    }
    if (f.kind === 'shape') {
      const c = f.columns?.[0];
      const time = c !== undefined && file.kinds[file.columns.indexOf(c)] === 'time';
      if (time && f.metric?.of === 'quantile' && f.value !== undefined && file.hours?.[k]) {
        // A time that runs behind the hours' own (a drop-off after its pickup): by the ontology's `after` mark, or in the
        // legacy form by a column named like a drop-off, 15 minutes (ADR 0010 §8).
        const off = judge.after.get(c!.toLowerCase())?.minutes ?? (judge.legacy && /drop/i.test(c!) ? 15 : 0);
        if (Math.abs(f.value - minuteAt(file.hours[k]!, QUANTILES[f.metric.q]!) - off) <= 75) return { tier: 'follows' };
      }
      return { tier: 'sameDay' };
    }
    if (f.kind === 'dropped' || f.kind === 'rule') {
      const u = f.kind === 'dropped' ? h.of({ of: 'droppedRows' })?.at(day) : f.metric?.of === 'rule' ? h.of({ of: 'ruleRows', name: f.metric.name })?.at(day) : null;
      const today = f.kind === 'dropped' ? (gate?.dropped ?? 0) : f.metric?.of === 'rule' ? (file.failed[k]?.[file.rules.findIndex((r) => r.name === (f.metric as { name: string }).name)] ?? 0) : 0;
      if (u && today <= u.high * 1.1) return { tier: 'follows' };
      return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
    }
    return { tier: within ? 'sameDay' : loud(f) ? 'standalone' : 'note' };
  };
  const told: Told[] = live.map((f) => {
    const t = tierOf(f);
    const severity: Severity = t.tier === 'cause' || t.tier === 'standalone' ? f.severity : f.severity === 'ok' ? 'ok' : 'note';
    const up = upstreamOf(f) ?? viaRows(f);
    return { ...f, severity, was: f.severity, tier: t.tier, ...(ack.has(f.key) ? { acknowledged: true } : {}), ...(t.predicted !== undefined ? { predicted: t.predicted } : {}), ...(up ? { because: up } : t.tier === 'absorbed' || t.tier === 'follows' || t.tier === 'sameDay' ? { because: (hoursF ?? popFinding ?? volume)?.key ?? 'split' } : {}) };
  });
  const byRank = (a: Told, b: Told) => RANK[a.severity] - RANK[b.severity] || b.score - a.score;
  const standalone = told.filter((f) => f.tier === 'standalone').sort(byRank);
  // The finding the head is about: the cause, or with none, the first standalone one.
  const cause = told.find((f) => f.tier === 'cause') ?? (hero === 'finding' ? (standalone.find((f) => f.key === lead?.key) ?? standalone[0] ?? null) : null);
  const absorbed = told.filter((f) => f.tier === 'absorbed');
  const follows = told.filter((f) => f.tier === 'follows').sort((a, b) => RANK[a.was] - RANK[b.was] || b.score - a.score);
  const sameDay = told.filter((f) => f.tier === 'sameDay').sort((a, b) => RANK[a.was] - RANK[b.was] || b.score - a.score);
  const weather = told.find((f) => f.kind === 'weather' && f.severity === 'note' && f.key === 'weather') ?? null;
  const notes = told.filter((f) => f.tier === 'note' && f.severity !== 'ok' && f !== weather).sort(byRank);

  // How bad the day is: its cause with what it absorbed (a split with nothing worse is unusual), a held gate, its stories.
  let causeSeverity: Severity = cause && cause.tier === 'cause' ? cause.was : 'ok';
  causeSeverity = worst([causeSeverity, ...absorbed.map((f) => f.was)]);
  if (split && RANK[causeSeverity] > RANK.warn) causeSeverity = 'warn';
  if (gate?.held) causeSeverity = 'alert';
  const severity: Severity = o.refused ? 'alert' : worst([causeSeverity, ...standalone.map((f) => f.severity), notes.length ? 'note' : 'ok']);
  // What could be judged (ADR 0010 §1): with no range for the day's rows, it isn't judged, unless something wrong or
  // unusual was found anyway (a value marked bad, a serious column's new value, the floor).
  const coverage = coverageOf(h, day, { checks: !!o.step });
  const unlearned = k >= 0 && !o.refused && !tripsRange && severity !== 'alert' && severity !== 'warn';

  // The episode: the days before with a cause of something wrong, back to its first.
  let episode: Story['episode'] = null;
  const badToday = k >= 0 && severity === 'alert' && caused && o.episode !== false;
  const before = (from: string) => {
    let first = from;
    let hour: number | null = null;
    let days = 0;
    for (let i = 1; i <= 14; i++) {
      const d = plusDays(from, -i);
      const b = badDay(h, d, names, hidden, judge);
      if (!b) break;
      first = d;
      hour = b.hour;
      days++;
    }
    return { days, first, hour };
  };
  let recovery: Story['recovery'] = null;
  if (badToday) {
    const b = before(day);
    if (b.days > 0) {
      // Its days so far, each its trips against its guess (the chip draws them, so day 3 reads apart from day 2), and
      // the trips short over them as the episode's hours count them (days.shortfall), to the viewed day and no further.
      const trips = h.of({ of: 'trips' });
      const trend: { day: string; trips: number; expected: number }[] = [];
      const ep: EpisodeDay[] = [];
      for (let d = b.first; d <= day; d = plusDays(d, 1)) {
        const j = file.days.indexOf(d);
        const r = trips?.at(d);
        if (j < 0 || !r) continue;
        trend.push({ day: d, trips: file.rows[j]!, expected: r.expected });
        if (file.hours?.[j]) ep.push({ day: d, got: file.hours[j]!, low: r.low, expected: r.expected, alert: true });
      }
      const j0 = file.days.indexOf(b.first);
      const r0 = trips?.at(b.first);
      const fall = hoursF?.hours ? { day, ...hoursF.hours } : j0 >= 0 && r0 ? (() => { const f = hoursShort(h, j0, r0.expected)?.hours; return f ? { day: b.first, ...f } : null; })() : null;
      // With no hour the trips fell (a part that vanished, a day short throughout), each day counts whole, its guess
      // less its trips, as its amount line's change says it.
      const whole = (xs: readonly EpisodeDay[]) => xs.reduce((t, d) => {
        const got = d.got.reduce((a, b) => a + b, 0);
        return { estimate: t.estimate + Math.max(0, d.expected - got), bound: t.bound + Math.max(0, d.low - got) };
      }, { estimate: 0, bound: 0 });
      episode = { days: b.days + 1, since: b.first, hour: b.hour, trend, short: fall ? shortfall(ep, fall, day) : ep.length ? whole(ep) : null };
    }
  } else if (k >= 0 && !o.refused && severity !== 'alert' && severity !== 'warn' && o.episode !== false) {
    const yesterday = plusDays(day, -1);
    const last = badDay(h, yesterday, names, hidden, judge);
    if (last) {
      const b = before(yesterday);
      const from = b.days ? b.first : yesterday;
      // Which of its days the checks held (never published) and which went out short, as the history judges them.
      const days: string[] = [];
      for (let d = from; d <= yesterday; d = plusDays(d, 1)) days.push(d);
      const held = o.step ? days.filter((d) => gateOf(h, d, o.step!, o.limit ?? null)?.held) : [];
      recovery = { from, to: yesterday, hour: b.days ? b.hour : last.hour, held, published: o.step ? days.filter((d) => !held.includes(d)) : [], name: last.name };
    }
  }

  // The population's share, as its finding judged it.
  const popMember = popFinding?.members?.find((m) => m.value !== 'null') ?? null;
  const popShare = popMember ? shareWords(popMember.share, popMember.range.low, popMember.range.high) : null;

  // The head: the cause as a population or a time, in at most six words.
  const holiday = holidayOf(day, h.calendar);
  const season = seasonOf(day, h.calendar);
  const recurring = holiday || season ? undefined : recurringOf(day, h.calendar)?.name;
  const calmHead = holiday ? `Normal for ${shortName(holiday, h.calendar)}` : season ? `Normal for ${shortName(season, h.calendar).replace(/^Holiday season$/, 'the holidays')}` : recurring ? `Normal for ${shortName(recurring, h.calendar)}` : `A normal ${weekdayOf(day)}`;
  const pctShort = (x: number) => `${Math.round(x * 100)}%`;
  // The trips an hour after a fall that runs to the day's end: they fall to a trickle and don't stop (Thu Sep 21, 2023
  // kept ~330 an hour), which the chart's zoom says ("still ~330/h").
  const perHour = hoursF?.hours ? (() => {
    const { got, from, to } = hoursF.hours;
    const per = got.slice(from, to + 1).reduce((a, b) => a + b, 0) / Math.max(1, to - from + 1);
    return per >= 100 ? Number(per.toPrecision(2)) : Math.round(per);
  })() : null;
  // A trickle: trips came in every one of those hours, and under a tenth of a usual day's (Sep 21: 3,679 of ~80k). The
  // head says it in a word, so the fall reads as most trips falling away and the rest still coming, never as the file
  // cut off (with the rate in the head, "Trips fall to ~330/h", the cliff still read as the file cut off); the rate
  // itself is on the zoom. A fall to more than that is headed by its rate.
  const trickle = hoursF?.hours ? (() => {
    const { got, usual, from, to } = hoursF.hours;
    const hours = got.slice(from, to + 1);
    return hours.every((n) => n > 0) && hours.reduce((a, b) => a + b, 0) < 0.1 * usual.slice(from, to + 1).reduce((a, b) => a + b, 0);
  })() : false;
  // No trips at all in those hours is no trickle and no rate: the fall is headed as it was found ("Trips fall 100% from
  // 13:00"), never as trips still coming at ~0 an hour.
  const none = !!hoursF?.hours && hoursF.hours.got.slice(hoursF.hours.from, hoursF.hours.to + 1).every((n) => n === 0);
  // One part kept arriving and everything else stopped (keptOf): headed by the part, as the day after says it ("Only
  // Flex Fare after 13:00", beside Fri's "Only Flex Fare records arrived"), never as a trickle of every kind of trip.
  const kept = hero === 'hours' ? keptOf(hoursF?.hours, o.byHour, names, judge, hidden) : null;
  let head: string;
  if (o.refused) head = 'File refused: bytes don’t match';
  else if (hero === 'hours' && hoursF && kept) head = `Only ${kept.name} after ${clock(hoursF.hours!.from)}`;
  else if (hero === 'hours' && hoursF) head = hoursF.hours && hoursF.hours.to === 23 && perHour !== null && !none ? (trickle ? `${Noun()} fall to trickle from ${clock(hoursF.hours.from)}` : `${Noun()} fall to ~${fmtInt(perHour)}/h from ${clock(hoursF.hours.from)}`) : hoursF.title;
  else if (hero === 'split' && split) {
    const restRatio = split.rest.today / Math.max(1, split.rest.usual);
    const partRatio = split.part.today / Math.max(1, split.part.usual);
    const part = split.trips ? `${split.name} records` : split.name;
    // A bad value that surged takes its own name as the head: "Failed 4.5× usual" (ADR 0010 §4).
    const surged = split.bad ? split.name : part;
    // A part that held while the rest rose is never said as a shortfall: the rest is what moved.
    const rose = restRatio >= 1.95 ? `${Noun()} ${restRatio.toFixed(1).replace(/\.0$/, '')}× usual` : `${Noun()} up ${pctShort(restRatio - 1)}`;
    head = split.kind === 'held'
      ? restRatio < 0.1 ? `Only ${part} arrived` : restRatio > 1 ? `${rose}; ${split.name} held` : `${Noun()} ${pctShort(1 - restRatio)} short; ${split.name} held`
      : split.kind === 'vanished'
        ? partRatio < 0.1 ? (split.sender ? `${split.name} sent almost nothing` : `${part} almost gone`) : `${part} ${pctShort(1 - partRatio)} short`
        : partRatio >= 1.95 ? `${surged} ${partRatio.toFixed(1).replace(/\.0$/, '')}× usual` : `${surged} up ${pctShort(partRatio - 1)}`;
  } else if (hero === 'finding' && badLead && cause?.key === badLead.key && cause.kind !== 'band' && cause.metric?.of === 'value' && cause.value !== undefined && k >= 0) {
    // A bad value that leads with no clean split: its own name and how many times its usual rows ("Failed 14× usual").
    const usualRows = cause.range ? cause.range.expected * (tripsRange?.expected ?? file.rows[k]!) : cause.value * file.rows[k]! - (cause.rows ?? 0);
    const times = usualRows > 0 ? (cause.value * file.rows[k]!) / usualRows : Infinity;
    const name = partName(cause.metric.column, cause.metric.value, names, judge).name;
    head = Number.isFinite(times) && times >= 1.95 ? `${name} ${times.toFixed(1).replace(/\.0$/, '')}× usual` : cause.title.replace(/\s*\(usually [^)]*\)$/, '');
  } else if (hero === 'amount' && volume) head = volume.title;
  else if (hero === 'gate' && gate) head = gateHead(gate);
  else if (population && popShare) {
    // "More Flex Fare trips: 5.3%": the population, which way, and its share; its usual range is on the visual under it.
    const way = population.kind === 'surged' ? 'More' : 'Fewer';
    const full = `${way} ${population.name}${population.trips ? ` ${noun()}` : ''}: ${popShare.value}`;
    head = wordsIn(full) <= 6 ? full : `${way} ${population.name}: ${popShare.value}`;
  } else if ((hero === 'finding' && cause) || standalone[0]) {
    // A finding's title as a head, in six words: its usual range left to the visual under it when it doesn't fit.
    const t = ((hero === 'finding' && cause) || standalone[0])!.title;
    head = wordsIn(t) > 6 ? t.replace(/\s*\(usually [^)]*\)$/, '') : t;
  }
  else if (recovery) head = 'Back to normal';
  // A rise or fall in trips that has lasted is a note, but never "a normal day" beside a count outside its range.
  else if (volume?.lasting && volume.severity === 'note' && volume.value !== undefined && volume.range) head = `${volume.value > volume.range.expected ? 'Busier' : 'Quieter'} than usual for days`;
  else head = calmHead;

  // The weather, as context after the day's numbers and never in the chip a cause takes (ADR 0008 §6): today's snow,
  // and the day before's when today's trips are the news ("❄ 1.5 cm today · 7.2 cm Sat"). Not on a day with something
  // wrong, whose cause is told, nor on the day after an episode, which says what is left of it: their weather is on
  // the weather's own card.
  const snowOf = (d: string) => {
    const j = file.days.indexOf(d);
    return j >= 0 ? (file.weather?.snow[j] ?? 0) : 0;
  };
  const cm = (x: number) => `${x.toFixed(1)} cm`;
  const contextLabel = (() => {
    if (k < 0 || severity === 'alert' || o.refused) return null;
    const today = snowOf(day);
    const before = hero === 'amount' ? snowOf(plusDays(day, -1)) : 0;
    const parts = [today >= 1 ? `${cm(today)} today` : '', before >= 1 ? `${cm(before)} ${weekdayOf(plusDays(day, -1)).slice(0, 3)}` : ''].filter(Boolean);
    return parts.length ? `❄ ${parts.join(' · ')}` : null;
  })();
  const span = (a: string, b: string) => (a === b ? weekdayOf(a).slice(0, 3) : `${weekdayOf(a).slice(0, 3)}–${weekdayOf(b).slice(0, 3)}`);
  // Days said as runs: "Fri–Sun", "Mon, Wed".
  const spans = (ds: readonly string[]) => {
    const runs: [string, string][] = [];
    for (const d of ds) {
      const r = runs.at(-1);
      if (r && plusDays(r[1], 1) === d) r[1] = d;
      else runs.push([d, d]);
    }
    return runs.map(([a, b]) => span(a, b)).join(', ');
  };
  // After an episode, the chip names its days from the hour its first day fell ("after Thu 13:00–Sun"): never what its
  // last day was, which its first may not have been (Thu Sep 21, 2023 lost its trips from 13:00, not all but Flex Fare).
  // What it was is a tap away, in the episode's sheet.
  const ddd = (d: string) => weekdayOf(d).slice(0, 3);
  const afterChip = recovery ? `after ${ddd(recovery.from)}${recovery.hour !== null ? ` ${clock(recovery.hour)}` : ''}${recovery.to === recovery.from ? '' : `–${ddd(recovery.to)}`}` : null;
  // An episode's day, and the trips short so far: day 3 reads apart from day 2 ("Day 3 · ~290k short").
  const chip = episode
    ? episode.short && episode.short.estimate >= 1
      ? `Day ${episode.days} · ~${compact(episode.short.estimate)} short`
      : `Day ${episode.days} · since ${ddd(episode.since)}${episode.hour !== null ? ` ${clock(episode.hour)}` : ''}`
    : afterChip;
  const whyChip = coverage.why ? notJudgedChip(coverage.why, (n) => shortName(n, h.calendar), h.to) : null;
  // And whether anything is left to do: a held load is never published, and nothing waits on a person to release it.
  const after = recovery && o.step ? `Nothing to do · ${[recovery.published.length ? `${spans(recovery.published)} published short` : '', recovery.held.length ? `${spans(recovery.held)} held` : ''].filter(Boolean).join(', ')}` : null;

  // Nothing to judge the day's rows by (ADR 0010 §1): not judged yet, whatever the notes say; something wrong or unusual
  // found anyway (a value marked bad, a serious column's new value, the floor) is told as it is.
  const state: Story['state'] = o.refused ? 'refused' : severity === 'alert' ? 'wrong' : severity === 'warn' ? 'unusual' : unlearned ? 'unlearned' : recovery ? 'recovery' : notes.length ? 'notes' : 'calm';
  if (state === 'unlearned') {
    head = 'Not judged yet';
    recovery = null;
  }
  const shownHero: Hero = state === 'calm' || state === 'notes' || state === 'recovery' || state === 'unlearned' ? 'calm' : hero;

  // One verb: what can be done about the cause.
  const primary: Act | null = o.refused ? 'refetch'
    : state === 'calm' || state === 'notes' || state === 'recovery' || state === 'unlearned' ? null
    : hero === 'hours' ? 'incident'
    : hero === 'split' && split ? (split.kind === 'surged' ? (split.bad ? 'incident' : 'expected') : 'notify')
    : hero === 'gate' ? 'notify'
    : cause?.acts[0] ?? standalone[0]?.acts[0] ?? null;

  // The health row: each cell the worst of its kinds as told, and whether the cause explains it.
  const unjudgedIn: Record<Cell, number> = { file: 0, amount: coverage.rows || k < 0 ? 0 : 1, hours: 0, values: coverage.values[1] - coverage.values[0], shape: coverage.quantiles[1] - coverage.quantiles[0] };
  const health = (Object.entries(CELL_KINDS) as [Cell, readonly Finding['kind'][]][]).map(([cell, kinds]) => {
    const mine = told.filter((f) => kinds.includes(f.kind) && f.severity !== 'ok');
    const loudOnes = mine.filter((f) => f.tier === 'cause' || f.tier === 'standalone');
    const folded = mine.filter((f) => f.tier === 'absorbed' || f.tier === 'follows' || f.tier === 'sameDay');
    // The cell holding the cause's own measure carries the cause's mark: the amount on a split day with a volume
    // finding, the hours on a day they fall, the values on a surge with no volume finding.
    const causeCell = hero === 'hours' ? 'hours' : hero === 'split' ? (volume ? 'amount' : 'values') : hero === 'amount' ? 'amount' : null;
    if (cell === causeCell && (causeSeverity === 'alert' || causeSeverity === 'warn')) return { cell, severity: causeSeverity, explained: false, follows: mine.filter((f) => f.tier === 'follows' || f.tier === 'absorbed').length, sameDay: mine.filter((f) => f.tier === 'sameDay').length, unjudged: unjudgedIn[cell] };
    const explained = (folded.length > 0 && loudOnes.length === 0) || (cell === 'hours' && blankDay);
    return { cell, severity: loudOnes.length ? worst(loudOnes.map((f) => f.severity)) : mine.length && !explained ? 'note' as Severity : null, explained, follows: mine.filter((f) => f.tier === 'follows' || f.tier === 'absorbed').length, sameDay: mine.filter((f) => f.tier === 'sameDay').length, unjudged: unjudgedIn[cell] };
  });
  const notJudged = health.reduce((t, c) => t + c.unjudged, 0);

  // The labels at a glance.
  const heroLabels: string[] = [];
  if (shownHero === 'split' && split) heroLabels.push(partLabel(split), countLabel(split.part), 'Everything else', countLabel(split.rest), ...(overLabel(split) ? [overLabel(split)!] : []));
  if (shownHero === 'finding' && population && popShare) heroLabels.push(population.name, popShare.value, `usually ${popShare.range}`);
  // The hour chart: the hour they fall, what still came an hour after it (they don't stop: Sep 21, 2023 kept ~330 an
  // hour), how many fewer came than on a usual day ("~77k fewer": the hours are short, never missing, as trips still
  // came in them; "missing" read as the file cut off), and which day that is.
  // The hours before a fall that runs to the day's end are said only when they ran a twentieth of the day or more off a
  // usual day's: then the trips missing from the fall and the whole day's change differ by them, and the chart says so.
  const hoursLabels = hoursF?.hours ? (() => {
    const { got, usual, from, to } = hoursF.hours;
    const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
    const had = sum(got.slice(from, to + 1));
    const want = sum(usual.slice(from, to + 1));
    // What the hours before the fall add to the day's change, as the detail's waterfall counts them (fallSteps).
    const off = amount ? fallParts(hoursF.hours, amount)?.before ?? 0 : 0;
    const before = amount && Math.abs(off) >= 0.05 * amount.expected ? `~${compact(Math.abs(off))} ${off > 0 ? 'above' : 'below'} usual` : null;
    // No trips in the short hours: no rate to bracket and nothing "still" coming (the chart draws no ribbon there).
    return { cut: clock(from), floor: had === 0 ? '' : `${to === 23 ? 'still ' : ''}~${fmtInt(perHour ?? 0)}/h`, missing: `~${compact(Math.max(0, want - had))} fewer`, ghost: `usual ${weekdayOf(day)}`, before, kept: kept?.name ?? null, rest: kept ? 'everything else' : null };
  })() : null;
  // With a part that kept arriving, its bars stack the two parts and their key names them; the rate the trickle's zoom
  // said is the band's own height now, and isn't said (the head and the key say what kept coming).
  if (shownHero === 'hours' && hoursLabels) heroLabels.push(hoursLabels.cut, ...(hoursLabels.kept ? [] : [hoursLabels.floor]), hoursLabels.missing, hoursLabels.ghost, ...(hoursLabels.kept && hoursLabels.rest ? [hoursLabels.kept, hoursLabels.rest] : []), ...(hoursLabels.before ? [hoursLabels.before] : []));
  // Beside the hours, the part and the rest only when the part moved too (a part that held is told in the detail).
  if (shownHero === 'hours' && split && split.kind !== 'held') heroLabels.push(partLabel(split), countLabel(split.part), 'Everything else', countLabel(split.rest));
  // The amount line carries the day's count and its usual range on every day; a strip of days adds no words.
  // The checks show on every day with something wrong, passed or not (ADR 0008 §10), and on a near miss.
  // Its words close the hero's labels (`labels.gate` repeats them), so a paused card can draw the checks its own way.
  const gateWords: string[] = [];
  if (gate && (gate.held || gate.near || severity === 'alert')) {
    const g = gateLabels(gate);
    // The gap to the limit on the card where the checks held or came near it; one that passed far under it is drawn
    // so, and its gap is said in its sheet.
    gateWords.push(gate.held ? 'Checks held' : gate.near ? 'Checks near the limit' : 'Checks passed', g.share, ...(g.limit ? [g.limit] : []), ...(g.margin && (gate.held || g.zoom) ? [g.margin] : []), g.rows, ...(g.usual ? [g.usual] : []));
    heroLabels.push(...gateWords);
  }
  // What the explained changes are, in words a newcomer has: "shares, times, checks", most first, three at most.
  const kindWord: Partial<Record<Finding['kind'], string>> = { share: 'shares', gone: 'values gone', missing: 'blanks', shape: 'spreads', dropped: 'checks', rule: 'checks', new: 'new values', pair: 'new pairs' };
  const wordOf = (f: Finding) => (f.kind === 'shape' && f.columns?.[0] && file.kinds[file.columns.indexOf(f.columns[0])] === 'time' ? 'times' : (kindWord[f.kind] ?? 'other'));
  const kinds = new Map<string, number>();
  for (const f of follows) kinds.set(wordOf(f), (kinds.get(wordOf(f)) ?? 0) + 1);
  const shownKinds = [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);
  // The changes it explains, then the ones the same day: one row at a glance.
  const folded = [...follows, ...sameDay];
  const stories = standalone.filter((f) => f !== cause).slice(0, 2);
  const more = standalone.filter((f) => f !== cause && !stories.includes(f));

  return {
    day, state, severity, head, chip: state === 'unlearned' ? whyChip : chip, hero: shownHero, amount, split: shownHero === 'calm' ? null : basis, hours: hoursF?.hours ?? null, hoursLabels, kept: shownHero === 'hours' ? kept : null, gate, coverage,
    cause, stories, more, follows, sameDay, absorbed, notes, context: weather,
    episode, recovery, health, primary,
    labels: {
      // The day's own change sits on the amount line when its count is outside its range and the head doesn't say it;
      // beside a head about the hours from a fall, it says its window ("whole day −65%"), so it can't fight the head.
      amount: amount ? [`${fmtInt(amount.value)} ${noun(amount.value)}`, ...(amount.change !== null && hero !== 'amount' && cause?.kind !== 'volume' ? [`${hero === 'hours' ? 'whole day ' : ''}${changeLabel(amount.change)}`] : []), `usual ${compact(amount.low)}–${compact(amount.high)}`]
        // A count with no range to judge it by: its count alone; the head and its chip say why (ADR 0010 §1, 16 words).
        : state === 'unlearned' ? [`${fmtInt(file.rows[k]!)} ${noun(file.rows[k]!)}`] : [],
      hero: heroLabels,
      gate: gateWords,
      // At a glance one row for both: its first change named, the rest counted ("Passengers 1 share + 27 more").
      folded: folded.length ? `${rowName(folded[0]!, folded[0]!.columns?.[0] ? o.names.column(folded[0]!.columns[0]) : null)}${folded.length > 1 ? ` + ${folded.length - 1} more` : ''}` : null,
      follows: follows.length ? `${follows.length} ${follows.length === 1 ? 'change' : 'changes'} this explains` : null,
      // Under the row of changes it explains, "12 more this day" says the noun once; alone, it says it.
      sameDay: sameDay.length ? `${sameDay.length} more ${follows.length ? '' : `${sameDay.length === 1 ? 'change' : 'changes'} `}this day` : null,
      notes: notes.length ? `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}` : null,
      more: more.length ? `${more.length} more unusual` : null,
      primary: primary ? ACT_VERB[primary] : null,
      kinds: shownKinds,
      after,
      // An unusual day whose trips all came (its total within its range, every hour) and whose one verb is marking it,
      // which is never required: it says there is nothing to do, so its amber can't read as a broken feed to act on.
      settle: state === 'unusual' && amount && amount.value >= amount.low && amount.value <= amount.high && !hoursF && (primary === 'expected' || primary === null) ? SETTLE_LINE : null,
      // A strip of days at a glance (a calm day's week, an amount day's four weeks) carries its one-line key.
      // Four weeks of days say too what their darker bands are: the viewed day's weekday ("Sundays").
      // The day after an episode keys its days' ! too ("wrong"); its line keys ‖ ⚑ ✕.
      key: shownHero === 'calm' ? [...STRIP_KEY, ...(state === 'recovery' ? ['wrong'] : [])] : (shownHero === 'amount' || shownHero === 'finding') && cause?.kind === 'volume' ? [...STRIP_KEY, `${weekdayOf(day)}s`] : [],
      context: state === 'recovery' ? null : contextLabel,
      // A calm day's cells, none marked, say so: a blank cell can't be told from one not checked.
      // Some of its numbers had no range: never "all normal" (ADR 0010 §1).
      health: notJudged > 0 ? `${HEALTH_HEAD} · ${notJudged} not judged` : state === 'calm' && health.every((c) => !c.severity && !c.explained) ? `${HEALTH_HEAD} · all normal` : HEALTH_HEAD,
    },
    findings: [...told].sort(byRank),
  };
}

/**
 * A waterfall's labels: every one a whole count with its thousands separated, so they add up exactly as read, the day's
 * total is the number its card's head and amount line print (5,732, never "6k" beside it), and every day's waterfall
 * reads in the one format ("114,913 −110,137 −143 → 4,633"; never "123k" one day and "134,617" the next).
 */
export function stepLabels(start: number, steps: readonly number[], end: number): { start: string; steps: string[]; end: string } {
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`;
  return { start: fmtInt(start), steps: steps.map(signed), end: fmtInt(end) };
}

/** A step from a usual day to this one: its name, its count, its label, and whether it stayed within its own usual
 * range (drawn neutral, never as trips missing: ADR 0008 §6). */
export interface DayStep { name: string; value: number; label: string; usual?: boolean }

/** Whether a count stayed within its usual range: inside it where it has one, else within a tenth of its usual. */
const inRange = (c: Count) => (c.low !== null && c.high !== null ? c.today >= c.low && c.today <= c.high : Math.abs(c.today / Math.max(1, c.usual) - 1) <= 0.1);

/**
 * The split as steps from a usual day to this one: the usual count, the side that moved, the other side, and today's
 * count (which the steps come to), each labelled at one precision (stepLabels). A side within its own usual range is
 * marked so (it is drawn neutral). Null without a split.
 */
export function splitSteps(s: Pick<Story, 'split' | 'amount'>): DayStep[] | null {
  const sp = s.split;
  if (!sp || !s.amount) return null;
  const held = sp.kind === 'held';
  // Whole trips throughout, so the steps come to today's count exactly.
  const [part, rest] = [Math.round(sp.part.usual), Math.round(sp.rest.usual)];
  const moved = held ? sp.rest.today - rest : sp.part.today - part;
  const other = held ? sp.part.today - part : sp.rest.today - rest;
  const usual = part + rest;
  const l = stepLabels(usual, [moved, other], s.amount.value);
  const kept = held ? sp.part : sp.rest;
  return [
    { name: 'Usual', value: usual, label: l.start },
    { name: held ? 'Everything else' : sp.name, value: moved, label: l.steps[0]! },
    { name: held ? sp.name : 'Everything else', value: other, label: l.steps[1]!, ...(inRange(kept) ? { usual: true } : {}) },
    { name: 'Today', value: s.amount.value, label: l.end },
  ];
}

/**
 * A fall that runs to the day's end, as two parts of the day's change against its guess: the trips missing from the
 * hour it fell (the hour chart's "~52k fewer": today's trips from that hour less a usual day's), and the rest of the
 * change, which the hours before it make (Sat Sep 17, 2022: +8.3k, a morning busier than usual). They add up to the
 * day's change exactly. Null when the fall stops before the day ends.
 */
export function fallParts(hours: NonNullable<Finding['hours']>, amount: { value: number; expected: number }): { before: number; after: number } | null {
  const { got, usual, from, to } = hours;
  if (to !== 23) return null;
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const after = Math.round(sum(got.slice(from)) - sum(usual.slice(from)));
  return { after, before: amount.value - Math.round(amount.expected) - after };
}

/**
 * A day told by the hour its trips fell, as steps from a usual day to this one: the usual count, the hours before the
 * fall, the hours from it, and today's count, labelled at one precision (stepLabels), so the waterfall says the same
 * windows as the hour chart and the amount line ("~52k fewer" from 15:00, "~8.3k above usual" before it, the whole
 * day −42%). The hours before are context, drawn neutral. Null on a day not told so.
 */
export function fallSteps(s: Pick<Story, 'hours' | 'amount'>): DayStep[] | null {
  if (!s.hours || !s.amount) return null;
  const p = fallParts(s.hours, s.amount);
  if (!p) return null;
  const usual = Math.round(s.amount.expected);
  const l = stepLabels(usual, [p.before, p.after], s.amount.value);
  const at = clock(s.hours.from);
  return [
    { name: 'Usual', value: usual, label: l.start },
    { name: `before ${at}`, value: p.before, label: l.steps[0]!, usual: true },
    { name: `from ${at}`, value: p.after, label: l.steps[1]! },
    { name: 'Today', value: s.amount.value, label: l.end },
  ];
}

/**
 * The split in one sentence, every word of it from the figures with a tolerance (ADR 0008): "as usual" only within 5%
 * of the usual count and inside the part's own range when it has one; "within its usual range" inside it but further
 * off; "almost stopped" only under a twentieth of usual on a day with no hour the trips fall (a fall during the day is
 * said as one: "fell from 13:00"); else "up 44%", "2.3× usual", "down 30%". Each side's count and usual follow it.
 */
export function splitSentence(s: Story): string | null {
  const sp = s.split;
  if (!sp) return null;
  const fall = s.hours && s.hours.to === 23 ? s.hours.from : null;
  const how = (c: Count, moved: boolean) => {
    const r = c.today / Math.max(1, c.usual);
    const inside = c.low !== null && c.high !== null ? c.today >= c.low && c.today <= c.high : null;
    if (inside !== false && Math.abs(r - 1) <= 0.05) return 'as usual';
    if (inside) return 'within its usual range';
    if (moved && fall !== null && r < 1) return `fell from ${clock(fall)}`;
    if (r < 0.05) return 'almost stopped';
    if (r >= 1.95) return `${r.toFixed(1).replace(/\.0$/, '')}× usual`;
    return r > 1 ? `up ${Math.round((r - 1) * 100)}%` : `down ${Math.round((1 - r) * 100)}%`;
  };
  const said = (c: Count) => `${fmtInt(c.today)}; usual ${c.low !== null && c.high !== null ? `${compact(c.low)}–${compact(c.high)}` : `~${approx(c.usual)}`}`;
  const restMoved = sp.kind === 'held';
  // The part that kept arriving after the fall, and the rest that stopped (keptOf): said as the head and the bars say it.
  if (s.kept && s.hours && s.kept.column === sp.column && s.kept.value === sp.value) return `${sp.name} kept arriving (${said(sp.part)}); everything else stopped after ${clock(s.hours.from)} (${said(sp.rest)}).`;
  return `${sp.name} ${how(sp.part, !restMoved)} (${said(sp.part)}); everything else ${how(sp.rest, restMoved)} (${said(sp.rest)}).`;
}

/**
 * A share said for a chart's axis or caption, to the decimals that keep it apart from 0 (a strip of 0.07% shares tops
 * out at "0.08%", never "0.1%" nor "0%"): two significant figures, at most two decimals of a percent.
 */
export function axisShare(x: number): string {
  if (x <= 0) return '0%';
  const p = x * 100;
  const d = p >= 10 ? 0 : p >= 1 ? 1 : 2;
  return `${Number(p.toFixed(d))}%`;
}

/**
 * Where the days before ran, when today ran with them and its own band sits apart from them (round 3, #23): a finding's
 * day by day says so under its strip, so the chart and the note agree on what was usual lately ("14 days before:
 * 7.4–9.2%, as today"). Asked of the strip's days, the last today's: at least 7 of the 14 before it with a value, today
 * outside its band and within what they ran, and their middle outside today's band on today's side. Null otherwise.
 */
export function recentSpan(days: readonly { v: number | null; low: number | null; high: number | null }[], fmt: (v: number) => string): string | null {
  const today = days.at(-1);
  if (!today || today.v === null || today.low === null || today.high === null) return null;
  const before = days.slice(-15, -1).map((d) => d.v).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (before.length < 7) return null;
  const v = today.v;
  const lo = before[0]!;
  const hi = before.at(-1)!;
  const mid = before[before.length >> 1]!;
  const below = v < today.low;
  if (!(below || v > today.high) || v < lo || v > hi) return null;
  if (below ? mid >= today.low : mid <= today.high) return null;
  const said = fmt(lo) === fmt(hi) ? fmt(lo) : `${fmt(lo).replace(/%$/, '')}–${fmt(hi)}`;
  return `${before.length} days before: ${said}, as today`;
}

/** Every string a story shows at a glance (head, chip, the hero's labels, rows, the verb), for its word budget. */
export function glanceStrings(s: Story): string[] {
  return [s.head, s.chip ?? '', s.labels.after ?? '', s.labels.settle ?? '', ...s.labels.amount, ...s.labels.hero, ...s.labels.key, s.labels.context ? `${CONTEXT_TAG} ${s.labels.context}` : '', s.labels.health, s.labels.folded ?? '', s.labels.more ?? '', s.labels.notes ?? '', s.labels.primary ?? '', ...s.stories.map((f) => f.title)].filter(Boolean);
}

/**
 * Whether a finding follows from the day's cause (round 3, #21): on a day held, or one whose story has something wrong,
 * any finding but the one the story is anchored on (`anchor`, its key: its cause, or the count or part it is told by) is an effect of it ("Card tip rate empty on 99.6% of
 * rows" when only Flex Fare arrived, "Passengers 1: 0.2%"), so it gets no primary verb of its own: the cause's card and
 * Decide are what to act on. A file refused is a cause in itself; a calm or merely unusual day has no effects to fold.
 */
export function followsCause(f: { key: string; kind: string }, day: { held: boolean; story: Pick<Story, 'severity'> | null; anchor: string | null }): boolean {
  if (f.kind === 'integrity') return false;
  if (!day.held && day.story?.severity !== 'alert') return false;
  return day.anchor === null || day.anchor !== f.key;
}

export { shareWords };
