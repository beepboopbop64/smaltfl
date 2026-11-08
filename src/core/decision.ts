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
 */
import { dayMid, dayShort, readersSee, type PauseState } from './days.js';
import type { HistoryRanges } from './history.js';
import { counted, type Noun } from './ontology.js';
import type { Hold } from './hold.js';
import type { DecideOption } from './policy.js';
import { CONTEXT_TAG, gateLabels, wordsIn, type Gate, type Story } from './story.js';

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A count's axis end said short: "120k", "4.8k", "900". */
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(Math.round(n)));
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** What readers would get for a day under one option, as the day's cause draws it. */
export type ReaderRows =
  | { cause: 'hours'; hours: readonly number[] }
  | { cause: 'split'; part: number; rest: number }
  | { cause: 'amount'; days: readonly number[] };
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
export function decisionDrawing(h: HistoryRanges | null, story: Pick<Story, 'hero' | 'hours' | 'split'> | null, day: string, readers: string | null, rows: { day: number; readers: number | null }): Drawing {
  const k = historyDay(h, day);
  const kr = readers ? historyDay(h, readers) : -1;
  const file = h?.file;
  // A day that falls at an hour: 24 bars, the short hours' missing trips absent; the day kept, its own 24, hatched.
  const hr = story?.hero === 'hours' ? story.hours : null;
  const theirs = kr >= 0 ? file!.hours?.[kr] : undefined;
  if (hr && (!readers || theirs)) {
    const scale = Math.max(1, ...hr.usual, ...hr.got, ...(theirs ?? []));
    return {
      cause: 'hours', scale, short: [hr.from, hr.to], part: null,
      asis: { cause: 'hours', hours: hr.got }, usual: { cause: 'hours', hours: hr.usual },
      dont: theirs ? { cause: 'hours', hours: theirs } : null,
      // The cut marked where the day falls, on its own row; the hours themselves need no axis under the day kept.
      ticks: [], cut: [hr.from, `${hr.from}h`],
    };
  }
  // A split: the part and the rest on one count bar, each part's missing trips absent; the day kept, split the same way.
  const sp = story?.split;
  const vh = sp && file ? file.values?.[sp.column] : undefined;
  const at = vh ? vh.values.indexOf(sp!.value) : -1;
  const theirPart = kr >= 0 && vh?.counts && at >= 0 ? vh.counts[kr]?.[at] : undefined;
  if (sp && (!readers || (theirPart !== undefined && rows.readers !== null))) {
    const dont = readers && theirPart !== undefined ? { cause: 'split' as const, part: theirPart, rest: Math.max(0, rows.readers! - theirPart) } : null;
    const scale = Math.max(1, Math.max(sp.part.today, sp.part.usual) + Math.max(sp.rest.today, sp.rest.usual), dont ? dont.part + dont.rest : 0);
    return {
      cause: 'split', scale, short: null, part: `${sp.name} · ${fmtInt(sp.part.today)}`,
      asis: { cause: 'split', part: sp.part.today, rest: sp.rest.today }, usual: { cause: 'split', part: sp.part.usual, rest: sp.rest.usual },
      dont, ticks: [[0, '0'], [scale, compact(scale)]], cut: null,
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
  const scale = Math.max(1, ...prev, rows.day, lacks, rows.readers ?? 0);
  return {
    cause: 'amount', scale, short: null, part: null,
    asis: { cause: 'amount', days: [...prev, rows.day] }, usual: { cause: 'amount', days: [...prev, lacks] },
    dont: readers && rows.readers !== null ? { cause: 'amount', days: [...prev, rows.readers] } : null,
    ticks: days.length > 1 ? [[0, dayShort(days[0]!)], [days.length - 1, dayShort(day)]] : [], cut: null,
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
  /** The clock time it was held, when that was today ("10:31"): said as "Paused since 10:31", not as minutes waited. */
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
   * published. */
  readers: { day: string; rows: number } | null;
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
}

export interface SheetOption {
  option: DecideOption;
  /** At most four words: "Publish as is", "Keep Wed 20" (the day readers keep, beside its hatched swatch). */
  label: string;
  /** What its drawing shows, with its unit: "41,939 trips". */
  number: string;
  /** Under it, on the row chosen (or every row before one is): "37,935 after checks", "3 days old". */
  sub: string | null;
  /** What choosing it overrides, on the row chosen (or every row before one is): "Overrides checks: 46% dropped
   * (limit 10%)". */
  warn: string | null;
  off: boolean;
  aria: string;
}

/** Every string the decision sheet shows (the accessible names apart); which show at once depends on what is picked
 * (`sheetShown`). */
export interface SheetText {
  title: string;
  /** For someone who may decide: how long the day has waited. */
  status: string | null;
  /** For someone who may not: what readers see until whoever decides does, and a way to ask them. */
  waitsOn: string | null;
  ask: string | null;
  options: readonly SheetOption[];
  part: string | null;
  missing: string | null;
  cut: string | null;
  ticks: readonly string[];
  /** Above the reasons for the option picked: whether a reason is needed. */
  why: Record<DecideOption, string>;
  /** The reasons that fit each option, one tap each. */
  chips: Record<DecideOption, readonly string[]>;
  /** What a decision not to publish covers, shown under it once it is picked: the day alone, or the days after it
   * too until one passes. Null without a day, and once readers see a later day (it would stand already ended). */
  scopes: readonly [string, string] | null;
  /** The button: what is missing while it can't go (an option, a reason), else the result it names. */
  go: { rest: string; reason: string; asis: string; dont: string; until: string };
  /** The first 8 hex of the manifest, in two groups of four. */
  hash: string;
}

/** What is picked on the sheet. */
export interface SheetPick {
  option: DecideOption | null;
  scope: 'day' | 'untilPass';
  reason: string | null;
}

/**
 * The button, naming the result: "Publish as is · 3 outputs", "Publish over the checks · 3 outputs" (when the checks
 * held the day too), "Don’t publish Thu 21", "Don’t publish from Thu 21".
 */
export function goLabel(option: DecideOption | null, scope: 'day' | 'untilPass', outputs: number, day: string | null, checks = false): string {
  if (option === 'asis') return `${checks ? 'Publish over the checks' : 'Publish as is'} · ${outputs} output${outputs === 1 ? '' : 's'}`;
  if (option === 'dont') return `Don’t publish ${scope === 'untilPass' && day ? 'from ' : ''}${day ? dayShort(day) : 'this run'}`;
  return 'Pick an option';
}

/** A share as the checks' bars say it, and their limit: "46% dropped (limit 10%)". */
function checksSaid(c: Pick<Gate, 'share' | 'limit'>): string {
  const l = gateLabels({ ...c, step: '', rows: 0, dropped: 0, held: true, near: false, usual: null, rules: [] });
  return `${l.said} dropped${l.limit ? ` (${l.limit})` : ''}`;
}

/**
 * The decision sheet's words (ADR 0009 §12): its title; how long the day has waited, or for someone who may not decide
 * what readers see until whoever does decides, and Ask; each option's label (Keep names the day readers keep), what
 * its drawing shows with its unit, and under it the trips past the checks, the age of a stale day, and what publishing
 * overrides when the checks held the day too; the reasons that fit each option under "Why?"; the scope, for Don't
 * publish; and the button, which says what is missing until it can go.
 */
export function sheetText(o: SheetIn): SheetText {
  const name = o.day ? dayMid(o.day) : 'This run';
  const trips = (n: number) => counted(n, o.noun);
  // A noun of two words is said once, on the first row, and the numbers after it are bare (Q-78), so the sheet keeps
  // its 45 words with "endpoint events".
  const bare = (n: number) => (wordsIn(o.noun.many) > 1 ? fmtInt(n) : trips(n));
  const past = o.reach !== null && o.reach !== o.rows ? `${fmtInt(o.reach)} after checks` : null;
  const age = o.readers && o.day ? Math.round((Date.parse(`${o.day}T12:00:00Z`) - Date.parse(`${o.readers.day}T12:00:00Z`)) / 864e5) : 0;
  const see = o.readers ? readersSee(o.readers.day, null) : 'nothing published yet';
  const checks = o.checks ? `Overrides checks: ${checksSaid(o.checks)}` : null;
  return {
    title: `${o.day ? `${dayMid(o.day)} · w` : 'W'}hat readers get`,
    status: o.may ? (o.otherBuild ? 'Other build’s decision' : o.since && o.waited !== null ? `Paused since ${o.since}` : waitedLabel(o.waited)) : null,
    waitsOn: o.may ? null : `${see.replace(/^./, (c) => c.toUpperCase())} until ${o.deciders} decides`,
    ask: o.may ? null : 'Ask ›',
    options: [
      {
        option: 'asis', label: 'Publish as is', number: o.later ? `${dayShort(o.later)} is published` : trips(o.rows), sub: o.later ? null : past, warn: o.later ? null : checks, off: !!o.later,
        aria: o.later ? `Publish as is: not possible, ${dayMid(o.later)} is what readers see now` : `Publish as is: readers get ${name} as it came, ${trips(o.rows)}${past ? `, ${fmtInt(o.reach!)} of them past its checks` : ''}${o.head ? `, ${o.head}` : ''}${o.checks ? `; this overrides its checks, which held it: ${checksSaid(o.checks)}` : ''}`,
      },
      {
        option: 'dont', label: o.readers ? `Keep ${dayShort(o.readers.day)}` : 'Don’t publish', number: o.readers ? bare(o.readers.rows) : 'nothing shown', sub: age >= 2 ? `${age} days old` : null, warn: null, off: false,
        aria: o.readers ? `Don’t publish: readers keep ${dayMid(o.readers.day)}, ${trips(o.readers.rows)}${age >= 2 ? `, ${age} days old` : ''}, and this day is never published` : 'Don’t publish: readers get nothing, nothing is published yet',
      },
    ],
    part: o.part,
    missing: o.missing ?? null,
    cut: o.cut ?? null,
    ticks: o.ticks,
    why: { asis: 'Why? (needed)', dont: 'Why?' },
    chips: { asis: [...(o.unjudged ? ['No history'] : []), 'Real change', 'Source confirmed'], dont: ['Known outage', 'Re-send expected'] },
    // Once readers see a later day, one has passed: "until a later day passes" would stand already ended, and close the
    // days between on their next run while they still say they wait. Only this day is offered.
    scopes: o.day && !o.later ? [`Just ${dayShort(o.day)}`, 'Until a later day passes'] : null,
    go: { rest: goLabel(null, 'day', o.outputs, o.day), reason: 'Pick a reason', asis: goLabel('asis', 'day', o.outputs, o.day, !!o.checks), dont: goLabel('dont', 'day', o.outputs, o.day), until: goLabel('dont', 'untilPass', o.outputs, o.day) },
    hash: `${o.hash.slice(0, 4)} ${o.hash.slice(4, 8)}`,
  };
}

/**
 * The strings the sheet shows at once for what is picked: the title; the status, or for someone who may not decide
 * what readers see until whoever decides does, and Ask; each option's label, number and drawing's words, and, on the
 * option picked (on every option before one is), what is under its number; then, for someone who may decide, the
 * reasons that fit the option picked under "Why?", the scope under Don't publish, and the button.
 */
export function sheetShown(t: SheetText, pick: SheetPick): string[] {
  const out = [t.title, t.status ?? '', t.waitsOn ?? '', t.ask ?? ''];
  for (const x of t.options) {
    out.push(x.label, x.number);
    if (!pick.option || pick.option === x.option) out.push(x.sub ?? '', x.warn ?? '');
  }
  out.push(t.part ?? '', t.missing ?? '', t.cut ?? '', ...t.ticks);
  if (t.waitsOn) return out.filter(Boolean);
  if (pick.option) out.push(t.why[pick.option], ...t.chips[pick.option]);
  if (pick.option === 'dont' && t.scopes) out.push(...t.scopes);
  out.push(!pick.option ? t.go.rest : pick.option === 'asis' ? (pick.reason ? t.go.asis : t.go.reason) : pick.scope === 'untilPass' && t.scopes ? t.go.until : t.go.dont);
  return out.filter(Boolean);
}

/** The most words the sheet shows at once, whatever is picked (its budget is 45). */
export function sheetWords(t: SheetText): number {
  const picks: SheetPick[] = [{ option: null, scope: 'day', reason: null }];
  for (const option of ['asis', 'dont'] as const) for (const scope of ['day', 'untilPass'] as const) for (const reason of [null, 'x']) picks.push({ option, scope, reason });
  return Math.max(...picks.map((p) => sheetShown(t, p).reduce((n, x) => n + wordsIn(x), 0)));
}

/**
 * The sheet once decided, collapsed to a receipt, and the same line on the canvas (ADR 0009 §12): what readers now see
 * ("Published as is · readers now see Thu 21"; "Not published · readers keep Wed 20 until a day passes"), then the
 * outputs released, who and when (or the standing decision it came under) and the record's entry; and whether the
 * decision can still be changed (a day not published can be published later; one published as is can't be taken back).
 */
export function receiptLines(o: { state: PauseState; day: string | null; readers: string | null; past?: boolean; released: number; who: string | null; at: string | null; seq: number | null; under: string | null; standing: boolean }): { head: string; sub: string; change: string | null } {
  const by = o.under ? `Under ${o.under}’s decision` : o.who ? `${o.who}${o.at ? ` · ${o.at}` : ''}` : null;
  const rec = o.seq !== null ? `record #${o.seq}` : null;
  // Once a later day has published, the day readers kept then (days.readersOf), never the later day.
  const keep = o.past ? (o.readers ? `readers kept ${dayShort(o.readers)}` : '') : o.readers ? `readers keep ${dayShort(o.readers)}` : 'nothing published yet';
  if (o.state === 'asis') return { head: `Published as is${o.day ? ` · readers now see ${dayShort(o.day)}` : ''}`, sub: [o.released ? `${o.released} output${o.released === 1 ? '' : 's'} released` : null, by, rec].filter(Boolean).join(' · '), change: null };
  if (o.state === 'dont') return { head: `Not published${keep ? ` · ${keep}` : ''}${o.standing && !o.under ? ' until a day passes' : ''}`, sub: [by, rec].filter(Boolean).join(' · '), change: 'Change decision' };
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
 * a node closed to them is neither named nor counted.
 */
export function pauseReasons(holds: readonly Pick<Hold, 'by' | 'origin'>[], open: (origin: string) => boolean = () => true): string[] {
  // The source first, then its checks, whatever order the plugin held them in.
  const order = { story: 0, unjudged: 1, checks: 2 } as const;
  const said = holds.filter((x) => open(x.origin)).sort((a, b) => order[a.by] - order[b.by]).map((x) => (x.by === 'checks' ? 'checks' : x.by === 'unjudged' ? `${x.origin} not judged` : x.origin));
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
export function pauseLines(o: { state: PauseState; names: readonly string[]; by?: readonly string[]; readers?: string | null; past?: boolean; who: string | null; at: string | null; under: string | null; may: boolean; deciders: string; standing?: boolean }): PauseRow {
  const by = o.who ? ` · ${o.who}${o.at ? ` · ${o.at}` : ''}` : '';
  const reasons = o.by ?? [];
  // Once a later day has published, readers' day as it stood then (days.readersOf): "readers kept Mon 18".
  const see = o.readers === undefined ? null : readersSee(o.readers, null, o.past) || null;
  if (o.state === 'waiting') {
    return { reach: reasons.length ? `Paused by ${reasons.join(', ')}` : 'Paused', see, names: o.names, verb: o.may ? 'Decide' : null, waits: o.may ? null : `${o.deciders} decides` };
  }
  if (o.state === 'asis') return { reach: `Published as is${by}`, see: null, names: o.names, verb: null, waits: null };
  // A decision that stands says so, by its effect: the days after it are closed too, until one passes. Readers keep
  // the day they had.
  return { reach: o.under ? `Not published · under ${o.under}’s decision` : o.standing ? 'Not published until a day passes' : `Not published${by}`, see: see && keeps(see), names: o.names, verb: null, waits: null };
}

/** What readers see said of a day not published: they keep it ("readers keep Wed 20"; "readers kept Mon 18" as it
 * stood then). */
const keeps = (see: string) => see.replace(/^readers see /, 'readers keep ');

/** Every word a pause row shows at a glance. */
export function pauseWords(l: PauseRow): number {
  return [l.reach, l.see ?? '', ...l.names, l.verb ?? '', l.waits ?? ''].reduce((n, x) => n + wordsIn(x), 0);
}

/**
 * The checks on a paused card (ADR 0009 §12). Checks that held the day too are drawn in full, headed by their ‖ alone
 * while the day waits (the pause row has named them among what paused it), and once it is decided by words, "Checks
 * held" (`head`), so no ‖ is left under a day marked ✕ or ⚑. Checks that passed, near their limit or not, are one line
 * a tap from their sheet, "Checks passed: 9.55% dropped": not a second problem under a paused card, nor a contradiction
 * of it.
 */
export function pausedChecks(g: Pick<Gate, 'held' | 'near' | 'share' | 'limit' | 'step' | 'dropped' | 'rows' | 'usual'> | null, decided = false): { full: boolean; line: string | null; head: string | null } {
  if (!g) return { full: false, line: null, head: null };
  if (g.held) return { full: true, line: null, head: decided ? 'Checks held' : null };
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
  return [s.head, s.chip ?? '', ...l.amount, ...l.hero.slice(0, l.hero.length - l.gate.length), ...gate, ...l.key, l.context ? `${CONTEXT_TAG} ${l.context}` : '', l.folded ?? '', l.more ?? '', l.notes ?? '', ...s.stories.map((f) => f.title), row.reach, row.see ?? '', ...row.names, row.verb ?? '', row.waits ?? ''].filter(Boolean);
}

/**
 * The day line under the loads strip on a held day (ADR 0009 §12), on the canvas's first screen: the pause and the day
 * readers see meanwhile, its age when it is stale ("readers see Mon 18 · 3 days old", `day` being the day held), with
 * Decide for someone who may decide; once decided, what became of the day.
 */
export function dayPausedLine(o: { state: PauseState; readers: string | null; past?: boolean; may: boolean; standing: boolean; day?: string | null }): { text: string; verb: string | null } {
  // Its age while it waits, when what readers see is stale (two days or more before it); once decided, the line keeps
  // to its ten words. Once a later day has published, the day readers kept then, naming no later day.
  const see = readersSee(o.readers, o.state === 'waiting' ? o.day : null, o.past);
  if (o.state === 'waiting') return { text: see ? `Paused · ${see}` : 'Paused', verb: o.may ? 'Decide' : null };
  if (o.state === 'asis') return { text: 'Published as is', verb: null };
  return { text: `Not published${o.standing ? ' until a day passes' : ''}${see ? ` · ${keeps(see)}` : ''}`, verb: null };
}

/**
 * The status line after a run on a day (ADR 0008 §10, ADR 0009 §12): one sentence for every viewer, of what their policy
 * lets them see. The day's head where its story is theirs to read ("Thu Sep 21: Trips fall 95% from 13:00"); else what
 * became of the day, which names no source and tells no story: "Thu Sep 21: paused · readers see Wed 20 · waits on
 * Owner", "Mon Sep 18: published". A day held for what the viewer's own story doesn't tell (`wrong` false: a column
 * closed to them) is said by its pause too, never by a calm head beside its mark. The run's own figures go to the
 * line's title (`runFigures`).
 */
export function daySentence(o: { day: string; head: string | null; wrong: boolean; pause: { state: PauseState; readers: string | null; past?: boolean; standing: boolean; may: boolean; deciders: string } | null }): string {
  const d = dayMid(o.day);
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
 * The head of a waiting output's News on a held day (ADR 0009 §12), over the staged bar that says which day readers see:
 * that it waits, with Decide for someone who may decide, or whom it waits on; once decided, what became of it.
 */
export function outputPausedLine(o: { state: PauseState; may: boolean; deciders: string; standing: boolean }): { text: string; verb: string | null } {
  if (o.state === 'waiting') return o.may ? { text: 'Waits for a decision', verb: 'Decide' } : { text: `Waits on ${o.deciders}`, verb: null };
  if (o.state === 'asis') return { text: 'Published as is', verb: null };
  return { text: o.standing ? 'Not published until a day passes' : 'Not published', verb: null };
}

/** Days said as runs of weekdays: "Fri–Sun", "Mon, Wed". */
function spans(days: readonly string[]): string {
  const wd = (d: string) => dayShort(d).split(' ')[0]!;
  const runs: [string, string][] = [];
  for (const d of [...days].sort()) {
    const r = runs.at(-1);
    if (r && plusDays(r[1], 1) === d) r[1] = d;
    else runs.push([d, d]);
  }
  return runs.map(([a, b]) => (a === b ? wd(a) : `${wd(a)}–${wd(b)}`)).join(', ');
}

/**
 * What became of an episode's days, said the day after it under a flow that holds (ADR 0009 §12), with the day on
 * screen first once it published (readers now see it): "Mon 25 published · Thu–Sat still wait" with Decide while any
 * waits (the days decided are left to the strip's marks), else "Mon 25 published · Thu as is · Fri–Sun unpublished".
 * Days not run here are left out (the strip draws them not run); null when nothing is known.
 */
export function afterLine(days: readonly { day: string; state: PauseState | 'published' | null }[], o: { today?: { day: string; state: PauseState | 'published' | null } | null; may?: boolean } = {}): { text: string; verb: string | null; parts: AfterPart[] } | null {
  const known = days.filter((d): d is { day: string; state: PauseState | 'published' } => d.state !== null);
  const lead: AfterPart | null = o.today?.state === 'published' ? { state: 'published', text: `${dayShort(o.today.day)} published` } : null;
  // Each part with its state, so the screen draws its mark beside its words (‖ still wait, ⚑ as is, ✕ unpublished):
  // the line keys the strip's marks above it, at no cost in words.
  const line = (parts: (AfterPart | null)[], verb: string | null) => {
    const ps = parts.filter((p): p is AfterPart => !!p);
    return { text: ps.map((p) => p.text).join(' · '), verb, parts: ps };
  };
  if (!known.length) return lead ? line([lead], null) : null;
  const of = (s: PauseState | 'published') => known.filter((d) => d.state === s).map((d) => d.day);
  const waiting = of('waiting');
  if (waiting.length) return line([lead, { state: 'waiting', text: `${spans(waiting)} still wait${waiting.length === 1 ? 's' : ''}` }], o.may === false ? null : 'Decide');
  const words: [PauseState | 'published', string][] = [['asis', 'as is'], ['dont', 'unpublished'], ['published', 'published']];
  return line([lead, ...words.map(([s, w]) => [s, of(s), w] as const).filter(([, ds]) => ds.length).map(([s, ds, w]) => ({ state: s, text: `${spans(ds)} ${w}` }))], null);
}

/** A part of the line under the day after an episode: some of its days, what became of them, in words. */
export interface AfterPart { state: PauseState | 'published'; text: string }

/** The Runs view's ribbon (ADR 0009 §12): the paused days by month, each its date and what became of it. */
export function ribbonOf(days: readonly { day: string; state: PauseState }[]): { month: string; days: { day: string; date: string; state: PauseState }[] }[] {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const out: { month: string; days: { day: string; date: string; state: PauseState }[] }[] = [];
  for (const d of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const month = `${MON[Number(d.day.slice(5, 7)) - 1]} ${d.day.slice(0, 4)}`;
    let g = out.at(-1);
    if (!g || g.month !== month) out.push((g = { month, days: [] }));
    if (!g.days.some((x) => x.day === d.day)) g.days.push({ day: d.day, date: String(Number(d.day.slice(8, 10))), state: d.state });
  }
  return out;
}

const STATE_SAID: Record<PauseState, string> = { waiting: 'waiting', asis: 'published as is', dont: 'not published' };

/**
 * A paused day's card in the Runs view: its head, who decided how long after it was held and why (a day closed under a
 * standing decision, by that decision's rule), and where it is in the record: the run released and the release's entry
 * ("Released run #13 · record #21 ✓"), the decision's entry for a day not published, the run for a day waiting. `run`
 * is the run as the Runs view names it ("#13").
 */
export function decidedLines(o: { day: string; state: PauseState; who: string | null; minutes: number | null; reason: string | null; run: string | null; seq: number | null; release?: number | null; under: string | null }): { head: string; who: string | null; where: string | null } {
  const who = o.state === 'waiting' ? waitedLabel(o.minutes) : o.under ? `Under ${o.under}’s decision` : o.who ? [o.who, o.minutes !== null ? afterLabel(o.minutes) : null, o.reason].filter(Boolean).join(' · ') : null;
  const rec = o.state === 'asis' && o.release != null ? o.release : o.seq;
  const run = o.run === null ? null : o.state === 'asis' && o.release != null ? `Released run ${o.run}` : o.state === 'waiting' ? `Run ${o.run}` : null;
  const where = [run, rec !== null && rec !== undefined ? `record #${rec} ✓` : null].filter(Boolean).join(' · ') || null;
  return { head: `${dayMid(o.day)} · ${STATE_SAID[o.state]}`, who, where };
}

/**
 * The record's line for a day that passed after days were held (ADR 0009 §12): it published, so readers now see it,
 * and a standing decision not to publish ends with it: "Mon Sep 25 passed: published; readers now see Mon 25 · ends
 * #26". A day that passed with nothing held before it is a plain run.
 */
export function passedLine(day: string, ends: number | null): string {
  return `${dayMid(day)} passed: published; readers now see ${dayShort(day)}${ends !== null ? ` · ends #${ends}` : ''}`;
}
