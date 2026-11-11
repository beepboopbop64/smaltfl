/**
 * Deciding a held day, on screen (ADR 0009 §12): what readers would get under each option, drawn by the day's cause on
 * one scale, and every word the decision sheet, the cause card's pause row, the day after an episode and the Runs
 * view's ribbon show, so their budgets are tested here and the page shows only these strings. Pure.
 *
 * - The drawing (`decisionDrawing`): the cause picks it, as it picks the hero. A day that falls at an hour is 24 hour
 *   bars, a split is the part and the rest on one count bar, anything else a strip of the week's days. Publish as is
 *   gives readers the day's own rows, what it lacks against a usual day drawn absent; Don't publish keeps the day they
 *   see now, another day's rows, hatched; nothing published yet is absent. Every row is on one scale.
 * - The sheet's words (`sheetText`, `sheetWords`): at most 45 at a glance, whichever button label shows.
 * - The cause card's row (`pauseLines`): what paused the day (`pauseReasons`), what readers see, the outputs that wait
 *   by name, or what became of them, and its one verb; the checks as a paused card draws them (`pausedChecks`) and
 *   every word it shows (`pausedGlance`); and the held card's line (`heldLine`), what held a day with no story.
 * - The day line under the loads strip (`dayPausedLine`) and the head of a waiting output's News (`outputPausedLine`):
 *   the pause, readers' day, and the verb that opens the sheet, on the first screen.
 * - The status line after a run (`daySentence`), one sentence for every viewer of what they may see, and its title's
 *   figures (`runFigures`), a node closed to the viewer neither counted nor named.
 * - An episode's days once it is over, the day on screen first once it published, with Decide while one waits
 *   (`afterLine`), and the paused days by month (`ribbonOf`, `decidedLines`).
 * - The remedies (ADR 0009 amendment 1 S12): a fill from a donor (◧) and the part that arrived alone (◐) as rows of the
 *   same sheet, drawn on the same scale (every donor's rows inside it, so a swap never rescales), the donors as chips,
 *   one switch for later days, the button naming the result; their receipts, a withdrawal's (Q-61), and every line
 *   that says what readers got of the day; and a day's versions (`versionLines`).
 */
import { slotLabel, type Every } from './calendar.js';
import { dayMid, dayShort, KEPT_MARK, MARK, readersSee, type DayState, type KeptMark, type RemedyMark } from './days.js';
import type { FillCounts, Missing, Offer, Version } from './fill.js';
import type { HistoryRanges } from './history.js';
import { counted, type Noun } from './ontology.js';
import type { Hold } from './hold.js';
import type { DecisionOption } from './policy.js';
import { CONTEXT_TAG, gateLabels, wordsIn, type Gate, type Story } from './story.js';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** How long a standing decision stands, said one way everywhere (round 3, #19, #20): never "until a day passes", which
 * read as a day of time going by. */
export const UNTIL = 'until a later day publishes';
/** A count's axis end said short: "120k", "4.8k", "900". */
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(Math.round(n)));
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** What readers would get for a day under one option, as the day's cause draws it. */
export type ReaderRows =
  | { cause: 'hours'; hours: readonly number[] }
  | { cause: 'split'; part: number; rest: number }
  | { cause: 'amount'; days: readonly number[]; at?: number; donor?: number };
export type DrawCause = ReaderRows['cause'];

/** The sheet's drawing: each option's rows on one scale, what the day lacks, and the shared axis. */
export interface Drawing {
  cause: DrawCause;
  /** The most any row draws (an hour's trips, a day's), so every row shares one scale. */
  scale: number;
  /** Publish as is: the day's own rows. */
  asis: ReaderRows;
  /** Don't publish: the day readers keep (another day's rows), or null when nothing is published (absent). */
  dont: ReaderRows | null;
  /** The day's usual, against which what it lacks is drawn absent on its own rows. */
  usual: ReaderRows | null;
  /** The hours the trips fell short in, for a day that falls at an hour. */
  short: readonly [number, number] | null;
  /** The part, named with its trips today ("Vendor 1 · 2"), for a split. */
  part: string | null;
  /** The axis under the last row: [x in the drawing's units, label]. */
  ticks: readonly (readonly [number, string])[];
  /** The hour the trips fell, marked on the Publish row: [hour, "13h"]. */
  cut: readonly [number, string] | null;
  /** A fill from each donor, in the order given (amendment 1 S12): the day's own rows with the donor's inside them,
   * `filled` saying which (the hours, or the part or the rest of a split). Empty when nothing can be filled. */
  fills: readonly { day: string; rows: ReaderRows; filled: readonly [number, number] | 'part' | 'rest'; ticks?: readonly (readonly [number, string])[] }[];
  /** The part that arrived alone: the day's own rows, what it leaves out absent at its usual. */
  complete: { rows: ReaderRows; usual: ReaderRows; short: readonly [number, number] | null } | null;
  /** The day readers keep, when they have it filled (S12): which of its rows came from another day, stippled. */
  dontFilled?: readonly [number, number] | 'part' | 'rest' | null;
  /** The day readers keep, when it went out short (published as is, round 3 #3): its own usual, so what it lacks is drawn
   * absent on its hatched rows as on its own day's, and its short hours. Null for a day kept whole. */
  dontUsual?: ReaderRows | null;
  dontShort?: readonly [number, number] | null;
}

/** A day readers keep that went out short (round 3, #3): its trips' guess, and, for a day that fell at an hour, its
 * usual hours and the hours it fell short in. */
export interface KeptLacks {
  expected: number;
  hours?: { usual: readonly number[]; from: number; to: number } | null;
}

/** A day's trips by hour, and by a coded value, from the history file: null for a day it doesn't have. */
function historyDay(h: HistoryRanges | null, day: string): number {
  return h ? h.file.days.indexOf(day) : -1;
}

/**
 * What readers would get for a held day under each option (ADR 0009 §12), drawn by its cause: the hours, the split, or
 * a strip of the week. `rows` are the trips the runs counted (the held run's, and the run readers see), which the
 * history equals on every load; `readers` is the day readers see now, or null when nothing is published.
 */
export function decisionDrawing(h: HistoryRanges | null, story: Pick<Story, 'hero' | 'hours' | 'split'> | null, day: string, readers: string | null, rows: { day: number; readers: number | null }, remedy: { missing: Missing; donors: readonly string[] } | null = null, kept: { missing: Missing; donor: string | null } | null = null, lacks: KeptLacks | null = null): Drawing {
  const d = drawingOf(h, story, day, readers, rows, remedy, kept);
  // The day readers keep drawn as it went out (round 3, #3): published as is short, what it lacked absent on its own
  // hatched rows, as its own day drew it, never a whole day to fall back on. Within the drawing's one scale.
  if (!lacks || !d.dont || !readers || rows.readers === null || rows.readers >= lacks.expected) return d;
  if (d.cause === 'hours' && d.dont.cause === 'hours' && lacks.hours) {
    return { ...d, dontUsual: { cause: 'hours', hours: lacks.hours.usual }, dontShort: [lacks.hours.from, lacks.hours.to], scale: Math.max(d.scale, ...lacks.hours.usual) };
  }
  if (d.dont.cause === 'split') {
    const usual: ReaderRows = { cause: 'split', part: d.dont.part, rest: Math.max(d.dont.rest, lacks.expected - d.dont.part) };
    const scale = Math.max(d.scale, lacks.expected);
    return { ...d, dontUsual: usual, dontShort: null, scale, ticks: d.ticks.length ? [[0, '0'], [scale, compact(scale)]] : d.ticks };
  }
  if (d.dont.cause === 'amount') {
    const days = [...d.dont.days];
    const scale = Math.max(d.scale, lacks.expected);
    return { ...d, dontUsual: { cause: 'amount', days: [...days.slice(0, -1), lacks.expected] }, dontShort: null, scale };
  }
  return d;
}

function drawingOf(h: HistoryRanges | null, story: Pick<Story, 'hero' | 'hours' | 'split'> | null, day: string, readers: string | null, rows: { day: number; readers: number | null }, remedy: { missing: Missing; donors: readonly string[] } | null, kept: { missing: Missing; donor: string | null } | null): Drawing {
  const k = historyDay(h, day);
  const kr = readers ? historyDay(h, readers) : -1;
  const file = h?.file;
  // A day that falls at an hour: 24 bars, the short hours' missing trips absent; the day kept, its own 24, hatched. A day
  // kept filled (S12) has its missing hours from its donor, stippled; kept with the part alone, those hours absent.
  const hr = story?.hero === 'hours' ? story.hours : null;
  const keptHours = kept && 'hours' in kept.missing ? kept.missing.hours : null;
  const donorHours = keptHours && kept!.donor ? file?.hours?.[historyDay(h, kept!.donor)] : undefined;
  const arrivedHours = kr >= 0 ? file!.hours?.[kr] : undefined;
  const theirs = arrivedHours && keptHours ? arrivedHours.map((v, i) => (i >= keptHours[0] && i <= keptHours[1] ? (kept!.donor ? (donorHours?.[i] ?? 0) : 0) : v)) : arrivedHours;
  const dontFilled = keptHours && kept!.donor ? keptHours : null;
  if (hr && (!readers || theirs)) {
    // A fill takes the missing hours from each donor's own; the part alone leaves them absent at their usual.
    const m = remedy && 'hours' in remedy.missing ? remedy.missing.hours : null;
    const inside = (i: number) => !!m && i >= m[0] && i <= m[1];
    const fills = m ? remedy!.donors.flatMap((d) => {
      const dh = file?.hours?.[historyDay(h, d)];
      return dh ? [{ day: d, rows: { cause: 'hours' as const, hours: hr.got.map((v, i) => (inside(i) ? (dh[i] ?? 0) : v)) }, filled: m }] : [];
    }) : [];
    const scale = Math.max(1, ...hr.usual, ...hr.got, ...(theirs ?? []), ...fills.flatMap((f) => f.rows.hours));
    return {
      cause: 'hours', scale, short: [hr.from, hr.to], part: null,
      asis: { cause: 'hours', hours: hr.got }, usual: { cause: 'hours', hours: hr.usual },
      dont: theirs ? { cause: 'hours', hours: theirs } : null, dontFilled,
      // The cut marked where the day falls, on its own row; the hours themselves need no axis under the day kept.
      ticks: [], cut: [hr.from, `${hr.from}h`],
      fills, complete: m ? { rows: { cause: 'hours', hours: hr.got.map((v, i) => (inside(i) ? 0 : v)) }, usual: { cause: 'hours', hours: hr.usual }, short: m } : null,
    };
  }
  // A split: the part and the rest on one count bar, each part's missing trips absent; the day kept, split the same way.
  const sp = story?.split;
  const vh = sp && file ? file.values?.[sp.column] : undefined;
  const at = vh ? vh.values.indexOf(sp!.value) : -1;
  // A day kept filled by its part (S12): the part as its donor had it, stippled; the rest as it arrived.
  const keptPart = !!kept && 'column' in kept.missing && kept.missing.column === sp?.column && !kept.missing.rest;
  const donorK = keptPart && kept!.donor ? historyDay(h, kept!.donor) : -1;
  const theirPart = keptPart && vh?.counts && at >= 0 ? (donorK >= 0 ? vh.counts[donorK]?.[at] : 0) : kr >= 0 && vh?.counts && at >= 0 ? vh.counts[kr]?.[at] : undefined;
  if (sp && (!readers || (theirPart !== undefined && rows.readers !== null))) {
    const dont = readers && theirPart !== undefined ? { cause: 'split' as const, part: theirPart, rest: Math.max(0, rows.readers! - theirPart) } : null;
    // A fill takes the part that vanished from each donor (or, where the part held, the rest); the part alone leaves
    // it absent at its usual.
    const m = remedy && 'column' in remedy.missing && remedy.missing.column === sp.column ? remedy.missing : null;
    const rest = !!m?.rest;
    const fills = m && at >= 0 && vh?.counts ? remedy!.donors.flatMap((d) => {
      const kd = historyDay(h, d);
      const dp = kd >= 0 ? vh.counts![kd]?.[at] : undefined;
      if (dp === undefined) return [];
      const r: ReaderRows = rest ? { cause: 'split', part: sp.part.today, rest: Math.max(0, file!.rows[kd]! - dp) } : { cause: 'split', part: dp, rest: sp.rest.today };
      return [{ day: d, rows: r, filled: rest ? ('rest' as const) : ('part' as const) }];
    }) : [];
    const scale = Math.max(1, Math.max(sp.part.today, sp.part.usual) + Math.max(sp.rest.today, sp.rest.usual), dont ? dont.part + dont.rest : 0, ...fills.map((f) => (f.rows.cause === 'split' ? f.rows.part + f.rows.rest : 0)));
    return {
      cause: 'split', scale, short: null, part: `${sp.name} · ${fmtInt(sp.part.today)}`,
      asis: { cause: 'split', part: sp.part.today, rest: sp.rest.today }, usual: { cause: 'split', part: sp.part.usual, rest: sp.rest.usual },
      dont, dontFilled: keptPart && kept!.donor ? 'part' : null, ticks: [[0, '0'], [scale, compact(scale)]], cut: null,
      fills,
      complete: m ? rest
        ? { rows: { cause: 'split', part: sp.part.today, rest: 0 }, usual: { cause: 'split', part: sp.part.today, rest: sp.rest.usual }, short: null }
        : { rows: { cause: 'split', part: 0, rest: sp.rest.today }, usual: { cause: 'split', part: sp.part.usual, rest: sp.rest.today }, short: null } : null,
    };
  }
  // Anything else: the week to the day, each its trips; the day's own last, what it lacks below its range absent, or the
  // day kept in its place, hatched. Without a history, the day alone.
  const trips = h?.of({ of: 'trips' }) ?? null;
  const before: string[] = [];
  if (k >= 0) for (let i = 6; i >= 1; i--) if (file!.days.includes(plusDays(day, -i))) before.push(plusDays(day, -i));
  const prev = before.map((d) => file!.rows[file!.days.indexOf(d)]!);
  const range = k >= 0 ? trips?.at(day) : undefined;
  const lacks = range && rows.day < range.low ? range.expected : rows.day;
  const days = [...before, day];
  // A day missing whole (its file came with no rows, fill.ts `missingOf`): a fill carries a donor's whole day in, its
  // rows as the history has them, drawn stippled as another day's.
  const whole = remedy && 'hours' in remedy.missing && remedy.missing.hours[0] === 0 && remedy.missing.hours[1] === 23 ? remedy.missing.hours : null;
  // The week before the day, the donor and the days between it and the day, in date order (a fill forward has its donor
  // before the day, a fill back after): the donor solid, the other days faded beside it as examples of what the days
  // around looked like, the day itself stippled with the donor's rows. Two weeks at most: further, the donor and the
  // day alone. Days the history doesn't have are left out.
  const fills = whole && file ? remedy!.donors.flatMap((d) => {
    const j = file.days.indexOf(d);
    if (j < 0) return [];
    // From a week before the day (or the donor, if further), to the day (or the donor, if after it).
    const weekBefore = plusDays(day, -6);
    const [from, to] = [d < weekBefore ? d : weekBefore, d > day ? d : day];
    const span: string[] = [];
    for (let x = from; x <= to && span.length <= 15; x = plusDays(x, 1)) span.push(x);
    const seq = (span.length > 15 ? (d < day ? [d, day] : [day, d]) : span).filter((x) => x === day || x === d || file.days.includes(x));
    const values = seq.map((x) => (x === day ? file.rows[j]! : (file.rows[file.days.indexOf(x)] ?? 0)));
    const at = seq.indexOf(day);
    const donor = seq.indexOf(d);
    return [{ day: d, rows: { cause: 'amount' as const, days: values, at, donor }, filled: whole, ticks: [[donor, dayShort(d)], [at, dayShort(day)]] as [number, string][] }];
  }) : [];
  const scale = Math.max(1, ...prev, rows.day, lacks, rows.readers ?? 0, ...fills.flatMap((f) => (f.rows.cause === 'amount' ? f.rows.days : [])));
  return {
    cause: 'amount', scale, short: null, part: null,
    asis: { cause: 'amount', days: [...prev, rows.day] }, usual: { cause: 'amount', days: [...prev, lacks] },
    dont: readers && rows.readers !== null ? { cause: 'amount', days: [...prev, rows.readers] } : null,
    ticks: days.length > 1 ? [[0, dayShort(days[0]!)], [days.length - 1, dayShort(day)]] : [], cut: null,
    fills, complete: null,
  };
}

/** How long a day has waited, "Waiting 2 h". */
export function waitedLabel(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const m = Math.max(0, minutes);
  return `Waiting ${m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`}`;
}

/** How long after a day was held it was decided, "26 min after". */
export function afterLabel(minutes: number): string {
  const m = Math.max(0, minutes);
  return `${m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`} after`;
}

/** What the sheet is told: the day, its rows and what readers keep, who may decide, and the hash of what goes out. */
export interface SheetIn {
  day: string | null;
  /** Minutes since the day was held. */
  waited: number | null;
  /** The clock time it was held, when that was today ("10:31"): said as "Paused today 10:31" (a bare clock time beside the
   * data's day read as that day's, round 3 #28), not as minutes waited. */
  since?: string | null;
  /** A decision for the day was made under another build. */
  otherBuild: boolean;
  /** The outputs that wait. */
  outputs: number;
  /** The day's trips (the held run's), as they arrived: what its drawing shows, as the card counts them. */
  rows: number;
  /** The day's trips that reach its outputs, past its checks: said under the drawing ("37,935 after checks"). Null
   * where there are no checks to pass. */
  reach: number | null;
  /** What readers see now, its trips as they arrived (what its hatched drawing shows), or null when nothing is
   * published. Where readers have the day's own fill (`withdraws`), the day they would see again. */
  /** The day readers keep, its rows as they have it (what its hatched drawing shows), and its mark when they have it
   * filled (◧), the part alone (◐) or as is (⚑); `reach`, its rows past its checks: what readers have of it (round 3,
   * #4), its number on the sheet. */
  readers: { day: string; rows: number; reach?: number | null; mark?: KeptMark } | null;
  /** The day's range (its trips' low and high, as they arrived): a day kept of another weekday outside it is flagged,
   * "busier than a Mon" (round 3, #33). */
  usual?: { low: number; high: number } | null;
  /** A later day readers see already: the day can no longer be shown (Q-51). */
  later: string | null;
  /** The checks held the day too: publishing as is overrides them, and the sheet says so with their share and limit. */
  checks: Pick<Gate, 'share' | 'limit'> | null;
  /** The drawing's own words: the part's label, the trips the short hours lack ("~77k fewer"), the hour the trips
   * fell ("13h", marked in the Publish row) and the axis under the last row. */
  part: string | null;
  missing?: string | null;
  cut?: string | null;
  ticks: readonly string[];
  /** A held source not judged (no history): its reason chip. */
  unjudged: boolean;
  /** The held run's manifest hash: in the receipt, and the button's title. */
  hash: string;
  may: boolean;
  deciders: string;
  /** The day's head, for the rows' accessible names. */
  head: string | null;
  /** What a row of the held source is called (ADR 0010 §8, C3): every count the sheet says carries it. */
  noun: Noun;
  /** The remedies the day gets (fill.ts offersOf, amendment 1 S5): a fill and the part that arrived alone, in C2's
   * order, each with why it is off when it is. None without a fill step or a missing part. */
  offers?: readonly Offer[];
  /** The donors the fill row offers, the flow's rule first, each with what it gives readers (fill.ts fillCounts). */
  donors?: readonly { day: string; counts: FillCounts }[];
  /** What the part that arrived alone gives readers. */
  partOnly?: FillCounts | null;
  /** The staged run of a remedy, once the engine made it (S4): whether its checks trip, and why it can't go (`why`). The
   * part alone is marked so before it is staged when the held run's checks tripped on it (Q-67). */
  staged?: { option: RemedyMark; donor: string | null; fails: boolean; why?: StagedFail | null; reach?: number | null } | null;
  /** Readers have this day's fill, or its part alone, now (Q-61): Keep takes it back, and readers see `readers` again. */
  withdraws?: RemedyMark | null;
  /** Leave the kept day's weekday flag out: it gave way to the 45 words (sheetText says it again without it). */
  noFlag?: boolean;
}

/** A donor as the fill row offers it: its chip ("Wed 20"), and the row's label, number, line and button with it. */
export interface SheetDonor {
  day: string;
  chip: string;
  label: string;
  number: string;
  sub: string;
  aria: string;
  go: string;
  preparing: string;
  /** Its staged run's checks tripped (or it can't go for another reason): it can't go, and `failed` says why. */
  fails: boolean;
  failed?: string | null;
}

export interface SheetOption {
  option: DecisionOption;
  /** At most four words: "Publish as is", "Keep Wed 20" (the day readers keep, beside its hatched swatch), "Fill from
   * Thu 14", "Before 13:00 only". */
  label: string;
  /** What its drawing shows, with its unit: "41,939 trips". */
  number: string;
  /** The one line under it once it is picked: "37,935 after checks", "3 days old", "3,679 set aside", "fails its
   * checks". */
  sub: string | null;
  /** What choosing it overrides, said under Publish as is before anything is picked: "Overrides checks: 46% dropped
   * (limit 10%)"; once picked, its figures alone (`warnPicked`), since the button says "over the checks". */
  warn: string | null;
  warnPicked?: string | null;
  /** Said under it before anything is picked, as a fact, not a warning: Publish as is's rows as they arrived ("of 41,939
   * arrived", the drawing's count and the card's, round 3 #4); a day kept of another weekday outside the day's range
   * ("busier than a Mon", round 3 #33), the first to give way to the sheet's 45 words. */
  note?: string | null;
  off: boolean;
  aria: string;
  /** A fill's donors, the one the flow's rule found first: picking another redraws the row and relabels it. */
  donors?: readonly SheetDonor[];
  /** The remedy's staged run failed its checks (or, for the part alone, the held run's did on it): it can't go, and
   * `sub` says why (failLine). */
  fails?: boolean;
  /** Don't publish takes back a fill readers have (Q-61). */
  withdraws?: boolean;
}

/** Every string the decision sheet shows (the accessible names apart); which show at once depends on what is picked
 * (`sheetShown`). */
export interface SheetText {
  title: string;
  /** For someone who may decide: how long the day has waited (gone once an option is picked). */
  status: string | null;
  /** For someone who may not: what readers see until whoever decides does, and a way to ask them. */
  waitsOn: string | null;
  ask: string | null;
  options: readonly SheetOption[];
  part: string | null;
  missing: string | null;
  cut: string | null;
  ticks: readonly string[];
  /** Above the reasons for the option picked: whether a reason is needed (only Publish as is says so). */
  why: Record<DecisionOption, string>;
  /** The reasons that fit each option, one tap each: none for a remedy, whose cause is its reason. */
  chips: Record<DecisionOption, readonly string[]>;
  /** The one switch for a decision that may stand for the days after it until one passes (don't publish, a fill, the
   * part alone), "Later days too". Null without a day, once readers see a later day (it would stand already ended),
   * and for a withdrawal. */
  switch: string | null;
  /** The button: what is missing while it can't go (an option, a reason), else the result it names. */
  go: { rest: string; reason: string; asis: string; dont: string; until: string; complete: string; withdraw: string; fails: string; accept: string };
  /** The first 8 hex of the manifest, in two groups of four. */
  hash: string;
}

/** What is picked on the sheet: the option, its scope, its reason, the fill's donor (by its place in the row's
 * donors), and whether its staged run is still being made. */
export interface SheetPick {
  option: DecisionOption | null;
  scope: 'day' | 'untilPass';
  reason: string | null;
  donor?: number;
  preparing?: boolean;
}

/**
 * Why a remedy's staged run can't go (amendment 1 S10), from what holds it besides its day's story and its being
 * derived: its checks tripped (their share against their limit, or a `fail` rule by name), a watched source of it not
 * judged (no claim it could be judged by), or its donor not judged good. Each is said apart: a run held for not being
 * judged never reads as one whose checks failed.
 */
export type StagedFail = { by: 'checks'; gate: Pick<Gate, 'share' | 'limit'> | null; rule: string | null } | { by: 'unjudged' } | { by: 'donor'; day: string | null };

/** The one line a remedy's row says when it can't go: "fails its checks: 12.3% dropped (limit 10%)", "fails its
 * checks: fare failed", "not judged: can’t go", "Thu 14 isn’t judged good". */
export function failLine(why: StagedFail | null | undefined): string {
  if (!why) return 'fails its checks';
  if (why.by === 'unjudged') return 'not judged: can’t go';
  if (why.by === 'donor') return `${why.day ? dayShort(why.day) : 'its donor'} isn’t judged good`;
  if (why.gate && (why.gate.limit === null || why.gate.share > why.gate.limit)) return `fails its checks: ${checksSaid(why.gate)}`;
  return why.rule ? `fails its checks: ${why.rule} failed` : 'fails its checks';
}

/** The button while the remedy picked can't go: "Fails its checks", "Not judged", "Donor not good". */
const failGo = (why: StagedFail | null | undefined): string => (why?.by === 'unjudged' ? 'Not judged' : why?.by === 'donor' ? 'Donor not good' : 'Fails its checks');

/** A part's label as a sentence goes on: "before 13:00 only", "without Vendor 1"; a name keeps its capital. */
const lowerLead = (part: string) => part.replace(/^(Before|Without|From) /, (m) => m.toLowerCase());

/**
 * The button, naming the result: "Publish as is · 3 outputs", "Publish over the checks · 3 outputs" (when the checks
 * held the day too), "Don’t publish Thu 21", "Don’t publish from Thu 21", "Fill from Thu 14", "Publish before 13:00
 * only", "Withdraw the fill", "Accept from Mon 14".
 */
export function goLabel(option: DecisionOption | null, scope: 'day' | 'untilPass', outputs: number, day: string | null, checks = false, remedy: { donor?: string | null; part?: string | null; withdraws?: RemedyMark | null } = {}): string {
  if (option === 'asis') return `${checks ? 'Publish over the checks' : 'Publish as is'} · ${outputs} output${outputs === 1 ? '' : 's'}`;
  if (option === 'dont' && remedy.withdraws) return `Withdraw the ${remedy.withdraws === 'fill' ? 'fill' : 'part'}`;
  if (option === 'dont') return `Don’t publish ${scope === 'untilPass' && day ? 'from ' : ''}${day ? dayShort(day) : 'this run'}`;
  if (option === 'fill') return remedy.donor ? `Fill from ${dayShort(remedy.donor)}` : 'Fill';
  if (option === 'complete') return remedy.part ? `Publish ${lowerLead(remedy.part)}` : 'Publish the part that arrived';
  if (option === 'accept') return day ? `Accept from ${dayShort(day)}` : 'Accept the new band or level';
  return 'Pick an option';
}

/** A share as the checks' bars say it, and their limit: "46% dropped (limit 10%)". */
function checksSaid(c: Pick<Gate, 'share' | 'limit'>): string {
  const l = gateLabels({ ...c, step: '', rows: 0, dropped: 0, held: true, near: false, usual: null, rules: [] });
  return `${l.said} dropped${l.limit ? ` (${l.limit})` : ''}`;
}

/**
 * The decision sheet's words (ADR 0009 §12, amendment 1 S12): its title; how long the day has waited, or for someone
 * who may not decide what readers see until whoever does decides, and Ask; each option's label (Keep names the day
 * readers keep, a fill its donor), what its drawing shows with its unit, and the one line under it once picked (the
 * trips past the checks, the age of a stale day, the rows filled or set aside, "fails its checks"); what publishing
 * overrides when the checks held the day too; the reasons that fit Publish as is under "Why? (needed)", and Don't
 * publish's optional ones; the switch for later days; and the button, which says what is missing until it can go.
 */
export function sheetText(o: SheetIn): SheetText {
  const name = o.day ? dayMid(o.day) : 'This run';
  const trips = (n: number) => counted(n, o.noun);
  // A noun of two words is said once, on the first row, and the numbers after it are bare (Q-78), so the sheet keeps
  // its 45 words with "endpoint events".
  // Every number after the first is bare (round 3, #4): the column is one count of one noun, said once.
  const bare = (n: number) => fmtInt(n);
  // Each row leads with what readers would get, the rows past the checks (round 3, #4); Publish as is says under it
  // the rows that arrived (what its drawing shows, and what the card counts), with the checks' figures when they held
  // it too, so readers' count and the check that drops the rest read as one line, never as a contradiction.
  const gets = o.reach ?? o.rows;
  const arrived = o.reach !== null && o.reach !== o.rows ? `of ${fmtInt(o.rows)} arrived` : null;
  const past = arrived;
  const age = o.readers && o.day ? Math.round((Date.parse(`${o.day}T12:00:00Z`) - Date.parse(`${o.readers.day}T12:00:00Z`)) / 864e5) : 0;
  const see = o.readers ? readersSee(o.readers.day, null, false, o.readers.mark) : 'nothing published yet';
  const keptMark = o.readers?.mark ? ` ${KEPT_MARK[o.readers.mark]}` : '';
  const figures = o.checks ? checksSaid(o.checks) : null;
  const withdraws = o.withdraws ?? null;
  // A day kept of another weekday, its trips outside the day's own range (round 3, #33): a Saturday standing in for a
  // Monday is busier than any usual Monday, and says so. Not for a day that went out short as is (⚑): its own missing
  // part is drawn. It gives way first to the sheet's 45 words (below).
  const wd = (d: string) => dayShort(d).split(' ')[0]!;
  const unlike = !o.noFlag && o.readers && o.day && o.usual && o.readers.mark !== 'asis' && wd(o.readers.day) !== wd(o.day) && (o.readers.rows > o.usual.high || o.readers.rows < o.usual.low)
    ? `${o.readers.rows > o.usual.high ? 'busier' : 'quieter'} than a ${wd(o.day)}` : null;
  const options: SheetOption[] = [
    {
      // Once a later day is out, it can't be picked: said with its reason, beside a lock (round 3, #19).
      option: 'asis', label: 'Publish as is', number: o.later ? `${dayShort(o.later)} already out` : trips(gets), sub: o.later ? null : past, warn: o.later || !figures ? null : `${arrived ?? `of ${fmtInt(o.rows)} arrived`}: ${figures}`, warnPicked: o.later ? null : figures, note: o.later ? null : arrived, off: !!o.later,
      aria: o.later ? `Publish as is: not possible, ${dayMid(o.later)} is already out to readers` : `Publish as is: readers get ${name} as it came past its checks, ${trips(gets)}${arrived ? ` of ${fmtInt(o.rows)} that arrived` : ''}${o.head ? `, ${o.head}` : ''}${o.checks ? `; this publishes past its checks, which held it: ${figures}` : ''}`,
    },
    {
      option: 'dont', label: o.readers ? `Keep ${dayShort(o.readers.day)}${keptMark}` : 'Don’t publish', number: o.readers ? bare(o.readers.reach ?? o.readers.rows) : 'nothing shown', sub: age >= 2 ? `${age} days old` : null, warn: null, note: unlike, off: false, ...(withdraws ? { withdraws: true } : {}),
      aria: withdraws
        ? `Withdraw the ${withdraws === 'fill' ? 'fill' : 'part'}: readers ${o.later && o.readers ? `keep ${dayMid(o.readers.day)}, ${trips(o.readers.rows)}` : `see ${o.readers ? `${dayMid(o.readers.day)} again, ${trips(o.readers.rows)}` : 'nothing'}`}, and this day is not published`
        : o.readers ? `Don’t publish: readers keep ${dayMid(o.readers.day)}, ${trips(o.readers.rows)}${age >= 2 ? `, ${age} days old` : ''}, and this day is never published` : 'Don’t publish: readers get nothing, nothing is published yet',
    },
  ];
  // The remedies, as fill.ts offers them: a fill named by its donor, the flow's rule's first; the part alone by what it
  // keeps. Each draws first from the history's counts; the staged run, once made, says whether it passes its checks.
  const offers = o.offers ?? [];
  const fill = offers.find((x) => x.option === 'fill');
  const part = offers.find((x) => x.option === 'complete');
  const staged = o.staged ?? null;
  if (fill) {
    const donors: SheetDonor[] = fill.off ? [] : (o.donors ?? []).map((d) => {
      const short = dayShort(d.day);
      return {
        // Once staged, its rows past its checks (what readers would get, round 3 #4); before, its rows from the history.
        day: d.day, chip: short, label: `Fill from ${short}`, number: bare(staged && staged.option === 'fill' && staged.donor === d.day && staged.reach != null ? staged.reach : d.counts.total), sub: `${fmtInt(d.counts.taken)} filled`,
        aria: `Fill from ${short}: readers get ${trips(d.counts.total)}, ${fmtInt(d.counts.taken)} of them from ${dayMid(d.day)}${d.counts.setAside ? `, in place of the ${fmtInt(d.counts.setAside)} that arrived of that part` : ''}`,
        go: goLabel('fill', 'day', o.outputs, o.day, false, { donor: d.day }), preparing: `Preparing ${short}`,
        fails: !!staged && staged.option === 'fill' && staged.donor === d.day && staged.fails,
        failed: staged && staged.option === 'fill' && staged.donor === d.day && staged.fails ? failLine(staged.why) : null,
      };
    });
    const first = donors[0];
    options.push(first
      ? { option: 'fill', label: first.label, number: first.number, sub: first.fails ? (first.failed ?? failLine(null)) : first.sub, warn: null, off: false, aria: first.aria, donors, fails: first.fails }
      : { option: 'fill', label: fill.label, number: fill.off ?? 'no good day near', sub: null, warn: null, off: true, aria: `Fill: not possible, ${(fill.off ?? 'no good day near').replace(/^./, (c) => c.toLowerCase())}` });
  }
  if (part) {
    const n = o.partOnly ?? null;
    const ran = !!staged && staged.option === 'complete';
    const fails = ran ? staged!.fails : !!part.note;
    // Once staged, why it can't go from its own run (its checks' figures); before, the held run's checks tripped on it.
    const failed = fails ? (ran ? failLine(staged!.why) : failLine(null)) : null;
    options.push({
      option: 'complete', label: part.label, number: part.off ?? (ran && staged!.reach != null ? bare(staged!.reach) : n ? bare(n.total) : ''), sub: part.off ? null : failed ?? (n ? `${fmtInt(n.setAside)} set aside` : null), warn: null, off: !!part.off, fails,
      aria: part.off ? `${part.label}: not possible, ${part.off}` : `${part.label}: readers get ${name} with only the part that arrived${n ? `, ${trips(n.total)}, ${fmtInt(n.setAside)} set aside` : ''}${failed ? `; it can’t be published: ${failed}` : ''}`,
    });
  }
  // Accept the new level (amendment 1 S6, X6): readers get the day as it came, and normal is learned from it on. Its
  // number is Publish as is's, said once that row is picked; its line, once picked, from when it learns.
  const accept = offers.find((x) => x.option === 'accept');
  if (accept) {
    options.push({
      option: 'accept', label: accept.label, number: accept.off ?? '', sub: accept.off || !o.day ? null : `learns from ${dayShort(o.day)}`, warn: null, off: !!accept.off,
      aria: accept.off ? `Accept the new level: not possible, ${accept.off}` : `Accept the new level: readers get ${name} as it came, ${trips(o.rows)}, and what is usual is learned from ${o.day ? dayMid(o.day) : 'it'} on`,
    });
  }
  const t: SheetText = {
    title: `${o.day ? `${dayMid(o.day)} · w` : 'W'}hat readers get`,
    status: o.may ? (o.otherBuild ? 'Other build’s decision' : o.since && o.waited !== null ? `Paused today ${o.since}` : waitedLabel(o.waited)) : null,
    waitsOn: o.may ? null : `${see.replace(/^./, (c) => c.toUpperCase())} until ${o.deciders} decides`,
    ask: o.may ? null : 'Ask ›',
    options,
    part: o.part,
    missing: o.missing ?? null,
    cut: o.cut ?? null,
    // With five rows (a fill, the part alone and Accept, amendment 1 S12's order of what gives way), the axis keeps its
    // zero and loses its end: the rows still share one scale.
    ticks: options.length >= 5 ? o.ticks.slice(0, 1) : o.ticks,
    // Only Publish as is needs a reason; Don't publish keeps its optional chips without a heading; a remedy's reason
    // is its cause, which the record keeps with the claim's head.
    why: { asis: 'Why? (needed)', dont: '', fill: '', complete: '', accept: 'Why? (needed)' },
    chips: { asis: [...(o.unjudged ? ['No history'] : []), 'Real change', 'Source confirmed'], dont: withdraws ? [] : ['Known outage', 'Re-send expected'], fill: [], complete: [], accept: ['Planned change', 'Source confirmed'] },
    // Once readers see a later day, one has passed: "until a later day passes" would stand already ended, and close the
    // days between on their next run while they still say they wait. Only this day is offered.
    switch: o.day && !o.later && !withdraws ? 'Later days too' : null,
    go: {
      rest: goLabel(null, 'day', o.outputs, o.day), reason: 'Pick a reason', asis: goLabel('asis', 'day', o.outputs, o.day, !!o.checks), dont: goLabel('dont', 'day', o.outputs, o.day), until: goLabel('dont', 'untilPass', o.outputs, o.day),
      complete: goLabel('complete', 'day', o.outputs, o.day, false, { part: part?.label ?? null }), withdraw: goLabel('dont', 'day', o.outputs, o.day, false, { withdraws: withdraws ?? 'fill' }), fails: failGo(staged?.fails ? staged.why : null),
      accept: goLabel('accept', 'day', o.outputs, o.day),
    },
    hash: `${o.hash.slice(0, 4)} ${o.hash.slice(4, 8)}`,
  };
  // The kept day's weekday flag is the first to give way to the 45 words (round 3, #33).
  return unlike && sheetWords(t) > 45 ? sheetText({ ...o, noFlag: true }) : t;
}

/** The donor picked on a fill row (by its place, the first by default), or null for any other row. */
export function donorPicked(x: SheetOption, pick: Pick<SheetPick, 'donor'>): SheetDonor | null {
  return x.option === 'fill' && x.donors?.length ? x.donors[Math.min(Math.max(0, pick.donor ?? 0), x.donors.length - 1)]! : null;
}

/** Whether the option picked can't go: its staged run (or, for the part alone, the held run's checks on it) fails its
 * checks. */
export function pickFails(t: SheetText, pick: Pick<SheetPick, 'option' | 'donor'>): boolean {
  const x = t.options.find((o) => o.option === pick.option);
  if (!x) return false;
  const d = donorPicked(x, pick);
  return d ? d.fails : !!x.fails;
}

/** The button's words for what is picked (sheetShown's last string). */
export function goShown(t: SheetText, pick: SheetPick): string {
  if (!pick.option) return t.go.rest;
  if (pick.option === 'asis') return pick.reason ? t.go.asis : t.go.reason;
  if (pick.option === 'accept') return pick.reason ? t.go.accept : t.go.reason;
  const withdraws = !!t.options.find((o) => o.option === 'dont')?.withdraws;
  if (pick.option === 'dont') return withdraws ? t.go.withdraw : pick.scope === 'untilPass' && t.switch ? t.go.until : t.go.dont;
  if (pickFails(t, pick)) return t.go.fails;
  if (pick.option === 'fill') {
    const d = donorPicked(t.options.find((o) => o.option === 'fill')!, pick);
    return d ? (pick.preparing ? d.preparing : d.go) : 'Fill';
  }
  return t.go.complete;
}

/**
 * The strings the sheet shows at once for what is picked (amendment 1 S12): the title; the status until something is
 * picked, or for someone who may not decide what readers see until whoever decides does, and Ask; each option's label
 * and drawing's words; before a pick, every row's number and Publish as is's override alone under it; once one is
 * picked, only that row's number and the one line under it (a fill's other donors as chips), the others keeping their
 * label and drawing; then, for someone who may decide, the reasons that fit the option picked, the switch for later
 * days, and the button. Read only, no row says what publishing would override: there is nothing to pick.
 */
export function sheetShown(t: SheetText, pick: SheetPick): string[] {
  const out = [t.title, pick.option ? '' : (t.status ?? ''), t.waitsOn ?? '', t.ask ?? ''];
  for (const x of t.options) {
    const d = donorPicked(x, pick.option === 'fill' ? pick : {});
    out.push(d?.label ?? x.label);
    // What publishing overrides is said to someone who may publish; read only, the rows are what readers would get.
    if (!pick.option) {
      out.push(d?.number ?? x.number, t.waitsOn ? (x.note ?? '') : (x.warn ?? x.note ?? ''));
      continue;
    }
    if (pick.option !== x.option) continue;
    // Accept's number is the day as it came: Publish as is's, said here once Accept is picked.
    const number = x.option === 'accept' && !x.off ? (t.options.find((y) => y.option === 'asis')?.number ?? '') : (d?.number ?? x.number);
    out.push(number, x.option === 'asis' ? (x.warnPicked ?? x.sub ?? '') : d ? (d.fails ? (d.failed ?? failLine(null)) : d.sub) : (x.sub ?? ''));
    if (d) out.push(...x.donors!.filter((y) => y !== d).map((y) => y.chip));
  }
  out.push(t.part ?? '', t.missing ?? '', t.cut ?? '', ...t.ticks);
  if (t.waitsOn) return out.filter(Boolean);
  if (pick.option) out.push(t.why[pick.option], ...t.chips[pick.option]);
  // The switch is for a decision that stands until a day passes; an Accept stands by its level (Q-57b), publish as is
  // for one day.
  if (pick.option && pick.option !== 'asis' && pick.option !== 'accept' && t.switch) out.push(t.switch);
  out.push(goShown(t, pick));
  return out.filter(Boolean);
}

/** The most words the sheet shows at once, whatever is picked: every option, scope, reason and donor, while the staged
 * run is made and after (its budget is 45). */
export function sheetWords(t: SheetText): number {
  const picks: SheetPick[] = [{ option: null, scope: 'day', reason: null }];
  for (const x of t.options) {
    if (x.off) continue;
    for (const scope of ['day', 'untilPass'] as const) for (const reason of [null, 'x']) for (let donor = 0; donor < Math.max(1, x.donors?.length ?? 0); donor++) for (const preparing of [false, true]) picks.push({ option: x.option, scope, reason, donor, preparing });
  }
  return Math.max(...picks.map((p) => sheetShown(t, p).reduce((n, x) => n + wordsIn(x), 0)));
}

/** What readers got of a day from a remedy, as a line says it (amendment 1 S12): a fill's donor, or the part's label
 * ("Before 13:00 only"). */
export interface RemedySaid {
  option: RemedyMark;
  donor: string | null;
  part: string | null;
}

/** "Filled from Thu 14", "Before 13:00 only". */
export const remedyHead = (r: RemedySaid): string => (r.option === 'fill' ? `Filled from ${r.donor ? dayShort(r.donor) : 'another day'}` : (r.part ?? 'Part only'));
/** The same, after "Published": "filled from Thu 14", "published before 13:00 only", "published Flex Fare only". */
const remedySaid = (r: RemedySaid): string => (r.option === 'fill' ? remedyHead(r).replace(/^F/, 'f') : `published ${lowerLead(r.part ?? 'the part that arrived only')}`);

/**
 * The sheet once decided, collapsed to a receipt, and the same line on the canvas (ADR 0009 §12): what readers now see
 * ("Published as is · readers now see Thu 21"; "Not published · readers keep Wed 20 until a later day publishes"; "Filled from
 * Thu 14 · readers now see Thu 21"; "Fill withdrawn · readers see Wed 20 again"), then what it took or set aside, the
 * outputs released, who and when (or the standing decision it came under) and the record's entry; whether the decision
 * can still be changed (a day not published can be published later, a fill replaced or withdrawn; one published as is
 * can't be taken back); and, for a remedy, that the day's versions are a tap away.
 */
export function receiptLines(o: { state: DayState; day: string | null; readers: string | null; past?: boolean; released: number; who: string | null; at: string | null; seq: number | null; under: string | null; standing: boolean; remedy?: (RemedySaid & { filled: number | null; setAside: number | null }) | null; withdrawn?: RemedyMark | null; level?: string | null; reason?: string | null }): { head: string; sub: string; change: string | null; versions?: true; note?: string } {
  // The reason the decision recorded, said where it was given (round 3, #28): "Why: Real change".
  const why = o.reason && !o.under ? `Why: ${o.reason}` : null;
  const by = o.under ? `Under ${o.under}’s decision` : o.who ? `${o.who}${o.at ? ` · ${o.at}` : ''}` : null;
  const rec = o.seq !== null ? `record #${o.seq}` : null;
  const released = o.released ? `${o.released} output${o.released === 1 ? '' : 's'} released` : null;
  // Once a later day has published, the day readers kept then (days.readersOf), never the later day.
  const keep = o.past ? (o.readers ? `readers kept ${dayShort(o.readers)}` : '') : o.readers ? `readers keep ${dayShort(o.readers)}` : 'nothing published yet';
  // Published as is can't be taken back (§12): said where Change decision would be, so its absence reads as meant.
  if (o.state === 'asis') return { head: `Published as is${o.day ? ` · readers now see ${dayShort(o.day)}` : ''}`, sub: [why, released, by, rec].filter(Boolean).join(' · '), change: null, note: 'Can’t be recalled' };
  // Accept (amendment 1 S6, X6): the new level's first day, what it learns from, and its decision, never undone. A day
  // published under a standing level names the Accept it came under.
  if (o.state === 'accepted') {
    const from = o.level ?? o.day;
    return {
      head: `${o.under ? `By ${o.under}’s new level` : `New level from ${from ? dayShort(from) : 'this day'}`}${o.day && !o.past ? ` · readers now see ${dayShort(o.day)}` : ''}`,
      sub: [from && !o.under ? `learns from ${dayShort(from)}` : null, why, released, o.under ? null : by, rec].filter(Boolean).join(' · '), change: null, note: 'Can’t be recalled',
    };
  }
  if ((o.state === 'fill' || o.state === 'complete') && o.remedy) {
    const r = o.remedy;
    const head = r.option === 'fill' ? remedyHead(r) : `Published ${lowerLead(r.part ?? 'the part that arrived only')}`;
    const took = r.option === 'fill' ? (r.filled !== null ? `${fmtInt(r.filled)} filled` : null) : r.setAside !== null ? `${fmtInt(r.setAside)} set aside` : null;
    return {
      head: `${head}${o.day && !o.past ? ` · readers now see ${dayShort(o.day)}` : ''}`,
      sub: [took, released, o.standing && !o.under ? `later days too, ${UNTIL}` : null, by, rec].filter(Boolean).join(' · '),
      change: 'Change decision', versions: true,
    };
  }
  if (o.state === 'dont' && o.withdrawn) {
    const back = o.past ? (o.readers ? `readers kept ${dayShort(o.readers)}` : '') : o.readers ? `readers see ${dayShort(o.readers)} again` : 'nothing published';
    return { head: `${o.withdrawn === 'fill' ? 'Fill' : 'Part'} withdrawn${back ? ` · ${back}` : ''}`, sub: [by, rec].filter(Boolean).join(' · '), change: 'Change decision', versions: true };
  }
  if (o.state === 'dont') return { head: `Not published${keep ? ` · ${keep}` : ''}${o.standing && !o.under ? ` ${UNTIL}` : ''}`, sub: [why, by, rec].filter(Boolean).join(' · '), change: 'Change decision' };
  return { head: 'Decided, not yet published', sub: [by, rec].filter(Boolean).join(' · '), change: null };
}

/**
 * What held a run, said for a person, as the held card's line says it ("trips: no history to judge it by"): a source
 * the page made no claim for is one it had no history to judge by, or whose history doesn't have the day. The
 * plugin's own words ("no claim for trips") stay in the record and in verify's line, where they are evidence.
 */
export function heldLine(x: Pick<Hold, 'by' | 'origin' | 'said'>, history: boolean): string {
  if (x.by === 'unjudged' && /^no claim for /.test(x.said)) return `${x.origin}: ${history ? 'the history doesn’t have this day' : 'no history to judge it by'}`;
  return `${x.origin}: ${x.said}`;
}

/**
 * What paused a day, said for the pause row (ADR 0009 §12): the source its story held ("trips"), its checks ("checks"),
 * a source not judged ("trips not judged"), each once, and only what the viewer may see (`open`, by the holding node):
 * a node closed to them is neither named nor counted. With several watched sources (ADR 0010 §7), each by its load: a
 * slot of a day by its hours ("edr 06–12", its length from `every`), a check by its source ("auth checks").
 */
export function pauseReasons(holds: readonly Pick<Hold, 'by' | 'origin' | 'load'>[], open: (origin: string) => boolean = () => true, every: (source: string) => Every = () => 'day'): string[] {
  // The source first, then its checks, whatever order the plugin held them in.
  const order = { story: 0, unjudged: 1, checks: 2 } as const;
  const slot = (x: Pick<Hold, 'load'>) => (x.load && x.load.slot.length > 10 ? ` ${slotLabel(x.load.slot, every(x.load.source))}` : '');
  const said = holds.filter((x) => open(x.origin)).sort((a, b) => order[a.by] - order[b.by]).map((x) => {
    const of = x.load?.source ?? x.origin;
    if (x.by === 'checks') return x.load ? `${x.load.source} checks` : 'checks';
    return x.by === 'unjudged' ? `${of}${slot(x)} not judged` : `${of}${slot(x)}`;
  });
  return [...new Set(said)];
}

/** The cause card's pause row: its first line, what readers see, the outputs it is about, and its one verb. */
export interface PauseRow {
  /** What paused the day while it waits ("Paused by trips, checks"), or the receipt once decided. */
  reach: string;
  /** What readers see meanwhile ("readers see Wed 20"), or null where the day itself is published. */
  see: string | null;
  /** The outputs it is about, by name: those that wait, or waited. */
  names: readonly string[];
  verb: string | null;
  /** In the verb's place for someone who may not decide: who does ("Owner decides"). */
  waits: string | null;
  /** Once decided, for someone who may decide, the decision a tap from changing where it still can change (a day not
   * published, a fill or the part alone): "Change decision", in the row, as the canvas's receipt has it (round 3, #28). */
  change?: string | null;
}

/**
 * The cause card's pause row (ADR 0009 §12): while the day waits, what paused it ("Paused by trips, checks"), what
 * readers see meanwhile ("readers see Wed 20"), and the outputs that wait, named, with its one verb, Decide; for
 * someone who may not decide, who does in the verb's place ("Owner decides"); once decided, the receipt (who decided
 * and when, or the standing decision it came under) and what readers see (`past`: what they kept then, once a later
 * day has published, naming no later day; days.readersOf). Its words count in the card's 60 at a
 * glance, so readers' day goes without its age here: the day line under the strip, the staged bar and the list of
 * outputs a tap away carry it.
 */
export function pauseLines(o: { state: DayState; names: readonly string[]; by?: readonly string[]; readers?: string | null; past?: boolean; who: string | null; at: string | null; under: string | null; may: boolean; deciders: string; standing?: boolean; remedy?: RemedySaid | null; withdrawn?: RemedyMark | null; readersMark?: KeptMark | null; top?: boolean }): PauseRow {
  const by = o.who ? ` · ${o.who}${o.at ? ` · ${o.at}` : ''}` : '';
  const reasons = o.by ?? [];
  // Once a later day has published, readers' day as it stood then (days.readersOf): "readers kept Mon 18".
  const see = o.readers === undefined ? null : readersSee(o.readers, null, o.past, o.readersMark) || null;
  if (o.state === 'waiting') {
    // With the pause said at the top of the News (`top`, round 3 #12: dayPausedLine, readers' day, its age and Decide),
    // the card's row says only what paused it and what waits, never the same words twice on one screen.
    if (o.top) return { reach: reasons.length ? `Paused by ${reasons.join(', ')}` : 'Paused', see: null, names: o.names, verb: null, waits: null };
    return { reach: reasons.length ? `Paused by ${reasons.join(', ')}` : 'Paused', see, names: o.names, verb: o.may ? 'Decide' : null, waits: o.may ? null : `${o.deciders} decides` };
  }
  if (o.state === 'asis') return { reach: `Published as is${by}`, see: null, names: o.names, verb: null, waits: null };
  if (o.state === 'accepted') return { reach: `${o.under ? `By ${o.under}’s new level` : 'New level'}${o.under ? '' : by}`, see: null, names: o.names, verb: null, waits: null };
  // What can still change (a day not published, a fill, the part alone) says so in the row, a tap from its sheet.
  const change = o.may ? 'Change decision' : null;
  // A remedy readers have (amendment 1 S12): "Filled from Thu 14 · Owner · 09:40", "Filled from Tue 1 · under Mon’s
  // decision"; the day itself is what readers see.
  if ((o.state === 'fill' || o.state === 'complete') && o.remedy) return { reach: `${remedyHead(o.remedy)}${o.under ? ` · under ${o.under}’s decision` : by}`, see: null, names: o.names, verb: null, waits: null, change };
  if (o.state === 'dont' && o.withdrawn) return { reach: `${o.withdrawn === 'fill' ? 'Fill' : 'Part'} withdrawn${by}`, see: see && keeps(see), names: o.names, verb: null, waits: null, change };
  // A decision that stands says so, by its effect, in the sheet's own words for it: the days after it are closed too
  // ("later days too", the switch it was picked by; the receipt says until when). Readers keep the day they had. The
  // time it was taken is the receipt's and the record's: the row keeps who, and room for Change decision.
  return { reach: o.under ? `Not published · under ${o.under}’s decision` : o.standing ? 'Not published · later days too' : `Not published${o.who ? ` · ${o.who}` : ''}`, see: see && keeps(see), names: o.names, verb: null, waits: null, change };
}

/** What readers see said of a day not published: they keep it ("readers keep Wed 20"; "readers kept Mon 18" as it
 * stood then). */
const keeps = (see: string) => see.replace(/^readers see /, 'readers keep ');

/** Every word a pause row shows at a glance. */
export function pauseWords(l: PauseRow): number {
  return [l.reach, l.see ?? '', ...l.names, l.verb ?? '', l.waits ?? '', l.change ?? ''].reduce((n, x) => n + wordsIn(x), 0);
}

/**
 * The checks on a paused card (ADR 0009 §12). Checks that held the day too are drawn in full, headed "Checks held"
 * (`head`) every day they hold, waiting or decided: a ‖ alone under the health row went unread, and the day's two
 * problems read as one (round 3, #16). Checks that passed, near their limit or not, are one line a tap from their
 * sheet, "Checks passed: 9.55% dropped": not a second problem under a paused card, nor a contradiction of it.
 */
export function pausedChecks(g: Pick<Gate, 'held' | 'near' | 'share' | 'limit' | 'step' | 'dropped' | 'rows' | 'usual'> | null, _decided = false): { full: boolean; line: string | null; head: string | null } {
  if (!g) return { full: false, line: null, head: null };
  if (g.held) return { full: true, line: null, head: 'Checks held' };
  return { full: false, line: `Checks passed: ${gateLabels(g as Gate).said} dropped`, head: null };
}

/**
 * Every string a paused card shows at a glance (ADR 0009 §12), for its budget of 60: the story's, its verb behind ⋯;
 * the checks as `pausedChecks` draws them (held: their bars' words, headed in words once `decided`; passed: one line); the rows of
 * changes without the kinds under them (their rows say what they are when opened); the health cells without their
 * head (the pause row and the checks sit on either side of them, each named); and the pause row with its verb.
 */
export function pausedGlance(s: Story, row: PauseRow, decided = false): string[] {
  const l = s.labels;
  const checks = pausedChecks(s.gate, decided);
  const gate = l.gate.length ? (checks.full ? [checks.head ?? '', ...l.gate.slice(1)] : checks.line ? [checks.line] : []) : [];
  return [s.head, s.chip ?? '', ...l.amount, ...l.hero.slice(0, l.hero.length - l.gate.length), ...gate, ...l.key, l.context ? `${CONTEXT_TAG} ${l.context}` : '', l.folded ?? '', l.more ?? '', l.notes ?? '', ...s.stories.map((f) => f.title), row.reach, row.see ?? '', ...row.names, row.verb ?? '', row.waits ?? '', row.change ?? ''].filter(Boolean);
}

/**
 * The day line under the loads strip on a held day (ADR 0009 §12), on the canvas's first screen: the pause and the day
 * readers see meanwhile, its age when it is stale ("readers see Mon 18 · 3 days old", `day` being the day held), with
 * Decide for someone who may decide; once decided, what became of the day.
 */
export function dayPausedLine(o: { state: DayState; readers: string | null; past?: boolean; may: boolean; standing: boolean; day?: string | null; remedy?: RemedySaid | null; withdrawn?: RemedyMark | null; level?: string | null; under?: string | null; readersMark?: KeptMark | null }): { text: string; verb: string | null } {
  // Its age while it waits, when what readers see is stale (two days or more before it); once decided, the line keeps
  // to its ten words. Once a later day has published, the day readers kept then, naming no later day. A day readers
  // have filled is marked ◧ beside its date (◐ the part alone, S12).
  const see = readersSee(o.readers, o.state === 'waiting' ? o.day : null, o.past, o.readersMark);
  if (o.state === 'waiting') return { text: see ? `Paused · ${see}` : 'Paused', verb: o.may ? 'Decide' : null };
  if (o.state === 'asis') return { text: 'Published as is', verb: null };
  // The level's step mark is drawn beside it (viz glyph 'level', amendment 1 S6 as built), never ⚑, which is as is.
  if (o.state === 'accepted') return { text: o.under ? `By ${o.under}’s new level` : `New level from ${dayShort(o.level ?? o.day ?? '')}`.replace(/ from $/, ''), verb: null };
  if ((o.state === 'fill' || o.state === 'complete') && o.remedy) return { text: `${MARK[o.state]} ${remedyHead(o.remedy)}`, verb: null };
  if (o.withdrawn) return { text: `${o.withdrawn === 'fill' ? 'Fill' : 'Part'} withdrawn${see ? ` · ${keeps(see)}` : ''}`, verb: null };
  return { text: `Not published${o.standing ? ` ${UNTIL}` : ''}${see ? ` · ${keeps(see)}` : ''}`, verb: null };
}

/**
 * The status line after a run on a day (ADR 0008 §10, ADR 0009 §12): one sentence for every viewer, of what their policy
 * lets them see. The day's head where its story is theirs to read ("Thu Sep 21: Trips fall 95% from 13:00"); else what
 * became of the day, which names no source and tells no story: "Thu Sep 21: paused · readers see Wed 20 · waits on
 * Owner", "Mon Sep 18: published". A day held for what the viewer's own story doesn't tell (`wrong` false: a column
 * closed to them) is said by its pause too, never by a calm head beside its mark. The run's own figures go to the
 * line's title (`runFigures`).
 */
export function daySentence(o: { day: string; head: string | null; wrong: boolean; pause: { state: DayState; readers: string | null; past?: boolean; standing: boolean; may: boolean; deciders: string; remedy?: RemedySaid | null; withdrawn?: RemedyMark | null; level?: string | null; under?: string | null } | null }): string {
  const d = dayMid(o.day);
  // A day accepted as a new level, or published under one: said so, whoever reads it.
  if (o.pause?.state === 'accepted') return `${d}: ${o.pause.under ? `published by ${o.pause.under}’s new level` : `new level from ${dayShort(o.pause.level ?? o.day)}`}`;
  // A day readers got by a remedy is said by it, whoever reads it: "Thu Sep 21: filled from Thu 14".
  if (o.pause?.remedy && (o.pause.state === 'fill' || o.pause.state === 'complete')) return `${d}: ${remedySaid(o.pause.remedy)}`;
  const held = !!o.pause && o.pause.state !== 'asis';
  if (o.head && (!held || o.wrong)) return `${d}: ${o.head}`;
  if (!o.pause) return `${d}: published`;
  const l = dayPausedLine({ ...o.pause, day: o.day });
  const waits = o.pause.state === 'waiting' && !o.pause.may ? ` · waits on ${o.pause.deciders}` : '';
  return `${d}: ${l.text.replace(/^./, (c) => c.toLowerCase())}${waits}`;
}

/** What a viewer may read of a node: all of it, some of it (rows or columns closed to them), or nothing. */
export type Sight = 'all' | 'some' | 'closed';

/**
 * A run's figures, for the status line's title (ADR 0008: the header says the day, not build statistics): its number and
 * time, the steps built, reused and folded, and what held it, of what the viewer may see. A node closed to them is
 * neither counted nor named; what a hold says (the flow's story or its checks' counts, told over every row and column)
 * only to someone who reads all of its node. The run is named as the Runs view names it, by the record entry that
 * recorded it ("#34"), so one run has one number. "Thu Sep 21: Run #34 took 820 ms: 0 built, 8 reused, 3 folded; held".
 */
export function runFigures(o: { day: string | null; run: number | string; ms: string; nodes: readonly { origin: string; status: string }[]; holds: readonly Pick<Hold, 'origin' | 'said'>[]; sight: (origin: string) => Sight; page: boolean }): string {
  const count = (status: string) => o.nodes.filter((n) => n.status === status && o.sight(n.origin) !== 'closed').length;
  const named = o.holds.filter((x) => o.sight(x.origin) !== 'closed').map((x) => (o.sight(x.origin) === 'all' ? `${x.origin}, ${x.said}` : x.origin));
  const held = o.holds.length ? `; held${named.length ? `: ${named.join('; ')}` : ''}` : '';
  return `${o.day ? `${dayMid(o.day)}: ` : ''}Run ${o.run} took ${o.ms}: ${count('built')} built, ${count('reused')} reused, ${count('folded')} folded${held}${o.page ? ' (the engine runs in the page here)' : ''}.`;
}

/**
 * What a viewer may see of a run's parts, for the Runs view, the Integrity tab and the record (round 3, #6): `open`, a
 * node they may read at all; `counted`, one whose every row they read (its whole count, a file's size, what its checks
 * counted are theirs only then, ADR 0009 §12).
 */
export interface RunSight {
  open: (origin: string) => boolean;
  counted: (origin: string) => boolean;
}

/** A file a run read, as one viewer sees it: its size and rows null where they aren't theirs to see. */
export interface FileSeen {
  origin: string;
  location: string;
  sha256: string;
  content: string | null;
  bytes: number | null;
  rows: number | null;
}

/**
 * The files a run read, as a viewer may see them (round 3, #6): a source closed to them is left out, neither named nor
 * counted, and `left` says only that something was ("Closed parts left out", as the canvas says it); a source they read
 * part of keeps its name and hashes, which prove it and say nothing of it, but not its size or rows, which count all of
 * it. "trips: trips.parquet, 949,820 bytes → 41,939 rows" reached Ben, to whom the trips are closed.
 */
export function filesSeen(nodes: readonly { origin: string; rows?: number | undefined; content?: string | undefined; file?: { location: string; bytes: number; sha256: string } | undefined }[], sight: RunSight): { files: FileSeen[]; left: boolean } {
  const read = nodes.filter((n) => n.file);
  const files = read.filter((n) => sight.open(n.origin)).map((n): FileSeen => {
    const all = sight.counted(n.origin);
    return { origin: n.origin, location: n.file!.location, sha256: n.file!.sha256, content: n.content ?? null, bytes: all ? n.file!.bytes : null, rows: all ? (n.rows ?? null) : null };
  });
  return { files, left: files.length < read.length };
}

/**
 * A run's checks, as a viewer may see them (round 3, #6): a node's check only where the node is open to them, and what
 * it says only where they read all of it (a check's note counts rows, names a file, or tells the flow's verdict); the
 * run's own checks (its manifest, plan, flow, keys, holds) without their notes but to who reads every node, as they name
 * every node ("held by trips
 * (Trips fall to trickle from 13:00)", "11 keys recomputed"). `left` says whether a check was left out.
 */
export function checksSeen<C extends { origin: string; note?: string | undefined }>(checks: readonly C[], nodes: ReadonlySet<string>, sight: RunSight): { checks: C[]; left: boolean } {
  // The run's own checks say what they say only to someone who reads every node all through (the owner).
  const whole = [...nodes].every((n) => sight.counted(n));
  const shown = checks.filter((c) => !nodes.has(c.origin) || sight.open(c.origin)).map((c) => {
    if (c.note === undefined || (nodes.has(c.origin) ? sight.counted(c.origin) : whole)) return c;
    const { note: _note, ...rest } = c;
    void _note;
    return rest as C;
  });
  return { checks: shown, left: shown.length < checks.length };
}

/**
 * The dataset a finding the record kept is about (round 3, #6), so its title reaches only someone who reads all of it: a
 * table's finding is keyed by its node ("zone_hour:empty:avg_fare"); a file's check names no node (null, the title kept
 * from anyone but the owner); any other is the day's, of the watched source ("story:2023-09-21", "share:payment_type=3").
 */
export function findingOf(key: string, nodes: ReadonlySet<string>, source: string | null): string | null {
  const head = key.split(':')[0] ?? '';
  if (nodes.has(head) && key.includes(':')) return head;
  if (head === 'integrity') return null;
  return source;
}

/**
 * The head of a waiting output's News on a held day (ADR 0009 §12), over the staged bar that says which day readers see:
 * that it waits, with Decide for someone who may decide, or whom it waits on; once decided, what became of it.
 */
export function outputPausedLine(o: { state: DayState; may: boolean; deciders: string; standing: boolean; remedy?: RemedySaid | null; withdrawn?: RemedyMark | null }): { text: string; verb: string | null } {
  if (o.state === 'waiting') return o.may ? { text: 'Waits for a decision', verb: 'Decide' } : { text: `Waits on ${o.deciders}`, verb: null };
  if (o.state === 'asis') return { text: 'Published as is', verb: null };
  if (o.state === 'accepted') return { text: 'Published as a new level', verb: null };
  if ((o.state === 'fill' || o.state === 'complete') && o.remedy) return { text: remedySaid(o.remedy).replace(/^./, (c) => c.toUpperCase()), verb: null };
  if (o.withdrawn) return { text: `${o.withdrawn === 'fill' ? 'Fill' : 'Part'} withdrawn`, verb: null };
  return { text: o.standing ? `Not published ${UNTIL}` : 'Not published', verb: null };
}

/**
 * Days said as runs of weekdays: "Fri–Sun", "Mon, Wed". A run of a week or more, or one whose weekday the line says of
 * another day already (`taken`: "Mon 21 published · Mon–Sun still wait"), is said by its dates instead, so no weekday
 * stands for two (round 3, #12): "Nov 14–20".
 */
function spans(days: readonly string[], taken: readonly string[] = []): string {
  const wd = (d: string) => dayShort(d).split(' ')[0]!;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const md = (d: string) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  const runs: [string, string][] = [];
  for (const d of [...days].sort()) {
    const r = runs.at(-1);
    if (r && plusDays(r[1], 1) === d) r[1] = d;
    else runs.push([d, d]);
  }
  const clash = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5 >= 6 || taken.includes(wd(a)) || taken.includes(wd(b));
  return runs.map(([a, b]) => {
    if (!clash(a, b)) return a === b ? wd(a) : `${wd(a)}–${wd(b)}`;
    if (a === b) return md(a);
    return a.slice(0, 7) === b.slice(0, 7) ? `${md(a)}–${Number(b.slice(8, 10))}` : `${md(a)}–${md(b)}`;
  }).join(', ');
}

/**
 * Why readers see the day they do while a day waits (round 3, #12): what became of each day between it and the day held,
 * "Tue–Wed not run", "Sun not run · Mon paused". Days published as is or by a remedy aren't between: readers would see
 * them. Null when there is no day between.
 */
export function betweenLine(days: readonly { day: string; state: DayState | 'published' | null }[]): string | null {
  const said: [DayState | 'published' | null, string][] = [[null, 'not run'], ['waiting', 'paused'], ['dont', 'not published']];
  const parts = said.map(([st, w]) => [days.filter((d) => d.state === st).map((d) => d.day), w] as const).filter(([ds]) => ds.length).map(([ds, w]) => `${spans(ds)} ${w}`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * What became of an episode's days, said the day after it under a flow that holds (ADR 0009 §12), with the day on
 * screen first once it published (readers now see it): "Mon 25 published · Thu–Sat still wait" with Decide while any
 * waits (the days decided are left to the strip's marks), else "Mon 25 published · Thu as is · Fri–Sun unpublished".
 * Days not run here are left out (the strip draws them not run); null when nothing is known.
 */
export function afterLine(days: readonly { day: string; state: DayState | 'published' | null }[], o: { today?: { day: string; state: DayState | 'published' | null } | null; may?: boolean } = {}): { text: string; verb: string | null; parts: AfterPart[] } | null {
  const known = days.filter((d): d is { day: string; state: DayState | 'published' } => d.state !== null);
  const lead: AfterPart | null = o.today?.state === 'published' ? { state: 'published', text: `${dayShort(o.today.day)} published` } : null;
  // Each part with its state, so the screen draws its mark beside its words (‖ still wait, ⚑ as is, ✕ unpublished):
  // the line keys the strip's marks above it, at no cost in words.
  const line = (parts: (AfterPart | null)[], verb: string | null) => {
    const ps = parts.filter((p): p is AfterPart => !!p);
    return { text: ps.map((p) => p.text).join(' · '), verb, parts: ps };
  };
  if (!known.length) return lead ? line([lead], null) : null;
  const of = (s: DayState | 'published') => known.filter((d) => d.state === s).map((d) => d.day);
  const waiting = of('waiting');
  const taken = lead && o.today ? [dayShort(o.today.day).split(' ')[0]!] : [];
  // Decide names the day it opens, the first still waiting (round 3, #19): with three waiting, "Decide" alone didn't say.
  // Where the line says them by their dates ("Nov 14–19 still wait"), it starts at that day already.
  const first = [...waiting].sort()[0]!;
  const said = spans(waiting, taken);
  if (waiting.length) return line([lead, { state: 'waiting', text: `${said} still wait${waiting.length === 1 ? 's' : ''}` }], o.may === false ? null : waiting.length > 1 && !/^[A-Z][a-z]{2} \d/.test(said) ? `Decide ${dayShort(first)}` : 'Decide');
  // "not published", never "unpublished", which read as published and then taken back (round 3, #20).
  const words: [DayState | 'published', string][] = [['asis', 'as is'], ['accepted', 'new level'], ['fill', 'filled'], ['complete', 'part only'], ['dont', 'not published'], ['published', 'published']];
  return line([lead, ...words.map(([s, w]) => [s, of(s), w] as const).filter(([, ds]) => ds.length).map(([s, ds, w]) => ({ state: s, text: `${spans(ds, taken)} ${w}` }))], null);
}

/** A part of the line under the day after an episode: some of its days, what became of them, in words. */
export interface AfterPart { state: DayState | 'published'; text: string }

/** The Runs view's ribbon (ADR 0009 §12): the paused days by month, each its date and what became of it. */
export function ribbonOf(days: readonly { day: string; state: DayState }[]): { month: string; days: { day: string; date: string; state: DayState }[] }[] {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out: { month: string; days: { day: string; date: string; state: DayState }[] }[] = [];
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const month = `${MON[Number(d.day.slice(5, 7)) - 1]} ${d.day.slice(0, 4)}`;
    let g = out.at(-1);
    if (!g || g.month !== month) out.push((g = { month, days: [] }));
    if (!g.days.some((x) => x.day === d.day)) g.days.push({ day: d.day, date: String(Number(d.day.slice(8, 10))), state: d.state });
  }
  return out;
}

const STATE_SAID: Record<DayState, string> = { waiting: 'waiting', asis: 'published as is', dont: 'not published', fill: 'filled', complete: 'part only', accepted: 'new level' };

/**
 * A paused day's card in the Runs view: its head, who decided how long after it was held and why (a day closed under a
 * standing decision, by that decision's rule), and where it is in the record: the run released and the release's entry
 * ("Released run #13 · record #21 ✓"), the decision's entry for a day not published, the run for a day waiting. `run`
 * is the run as the Runs view names it ("#13").
 */
export function decidedLines(o: { day: string; state: DayState; who: string | null; minutes: number | null; reason: string | null; run: string | null; seq: number | null; release?: number | null; under: string | null; remedy?: RemedySaid | null }): { head: string; who: string | null; where: string | null } {
  const who = o.state === 'waiting' ? waitedLabel(o.minutes) : o.under ? `Under ${o.under}’s decision` : o.who ? [o.who, o.minutes !== null ? afterLabel(o.minutes) : null, o.reason].filter(Boolean).join(' · ') : null;
  // A day readers got (as is, or by a remedy: its derived run) names the run released and the release's entry.
  const out = o.state === 'asis' || o.state === 'accepted' || o.state === 'fill' || o.state === 'complete';
  const rec = out && o.release != null ? o.release : o.seq;
  const run = o.run === null ? null : out && o.release != null ? `Released run ${o.run}` : o.state === 'waiting' ? `Run ${o.run}` : null;
  const where = [run, rec !== null && rec !== undefined ? `record #${rec} ✓` : null].filter(Boolean).join(' · ') || null;
  return { head: `${dayMid(o.day)} · ${o.remedy && (o.state === 'fill' || o.state === 'complete') ? remedySaid(o.remedy) : STATE_SAID[o.state]}`, who, where };
}

/**
 * The record's line for a day that passed after days were held (ADR 0009 §12): it published, so readers now see it,
 * and a standing decision not to publish ends with it: "Mon Sep 25 passed: published; readers now see Mon 25 · ends
 * #26". A day that passed with nothing held before it is a plain run.
 */
export function passedLine(day: string, ends: number | null): string {
  return `${dayMid(day)} passed: published; readers now see ${dayShort(day)}${ends !== null ? ` · ends #${ends}` : ''}`;
}

/**
 * A day's versions, one line each (amendment 1 S7, S12), within the sheet's 45 words with four: what arrived, each fill
 * and the part alone, a re-run of another file, with what readers got at the source and the run as the Runs view names
 * it, the one readers have ticked: "Arrived · 41,939 trips · held · run #13", "Filled from Thu 14 · 121,931 trips · run
 * #15 ✓", "Refilled from Wed 20 · 110,842 trips · run #18". `rows` is a version's rows at the source, where known.
 */
export function versionLines(versions: readonly Version[], o: { day: string; noun: Noun; name: (v: Version) => string; rows: (v: Version) => number | null; part?: string | null }): { title: string; lines: { text: string; shown: boolean; seq: number }[] } {
  let fills = 0;
  const lines = versions.map((v) => {
    const what = v.kind === 'arrived' ? 'Arrived' : v.kind === 'rerun' ? 'Corrected file' : v.kind === 'complete' ? (o.part ?? 'Part only') : `${fills++ ? 'Refilled' : 'Filled'} from ${v.donor ? dayShort(v.donor) : 'another day'}`;
    const n = o.rows(v);
    const held = v.kind === 'arrived' && v.shown === null ? 'held' : null;
    return { text: [what, n !== null ? counted(n, o.noun) : null, held, `run ${o.name(v)}${v.shown === 'now' ? ' ✓' : ''}`].filter(Boolean).join(' · '), shown: v.shown === 'now', seq: v.seq };
  });
  return { title: `${dayMid(o.day)} · versions`, lines };
}
