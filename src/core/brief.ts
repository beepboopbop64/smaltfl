/**
 * The brief (ADR 0012 §1, §2): what a person says to leadership about a day, in one screen, in SBAR order with the
 * point on top. Every fact comes from what the app already measured and judged (the day's story, what holds it, the
 * decision on offer and what readers get); this module only orders and words them. Deterministic: the same day
 * gives the same brief, so the two-minute test can grade it.
 *
 * Rules kept from ADR 0008 §5: the head stays the title (≤ 6 words), the sentence is ≤ 25 words, a clause whose value
 * is missing is left out (never "null", never "unknown"), and "because" is never written: facts are stated, a theory
 * is labelled as one.
 */
import { dayMid, dayShort, type DayState } from './days.js';
import type { DecisionOption } from './policy.js';
import type { Story } from './story.js';
import { changeLabel, compact, wordsIn } from './story.js';

/** The data-observability status words (Monte Carlo, Bigeye): what state the day's incident is in. */
export type BriefStatus = 'investigating' | 'expected' | 'fixed' | 'not published' | 'no action';

export interface BriefOutput {
  name: string;
  /** What readers get of it: it waits (the day held), it went out, or readers keep an earlier day's version. */
  fate: 'waits' | 'published' | 'kept' | 'not built';
}

export interface BriefOption {
  option: DecisionOption;
  /** "Publish as is", "Keep Wed 20", "Fill from Thu 14", "Before 13:00 only", "Accept the new level". */
  label: string;
  /** What it means for readers, one line. */
  line: string | null;
  /** Why it can't be taken now, when it can't. */
  off: string | null;
}

export interface BriefIn {
  day: string;
  flow: string;
  /** The source's noun: `noun(1)` "trip", `noun(2)` "trips". */
  noun: (n: number) => string;
  story: Pick<Story, 'state' | 'severity' | 'head' | 'amount' | 'split' | 'hours' | 'hoursLabels' | 'gate' | 'episode' | 'cause' | 'context'> | null;
  /** The day under the flow that holds: its state, the day readers see meanwhile, who decides. Null for a flow that
   * doesn't hold, or a day that wasn't held. */
  pause: { state: DayState; readers: string | null; deciders: string; may: boolean; who?: string | null; remedy?: string | null; level?: string | null } | null;
  outputs: BriefOutput[];
  /** The ontology's object types built on the outputs that wait or changed. */
  objects: string[];
  /** Who reads the outputs (people and groups), by name. */
  readers: string[];
  /** The day's file, as checked against the source's list. */
  file: { name: string; rows: number | null; check: 'same' | 'new' | 'republished' | 'corrupt' | 'missing' | 'unlisted' | 'list' | 'not-checked' | null } | null;
  /** The decision's options as the sheet words them; `picked`, the one taken, when one was. */
  options: BriefOption[];
  picked: DecisionOption | null;
  /** The sentence as a person edited it, when they did: shown in place of the generated one, never changed. */
  edited?: string | null;
  /** The option a person proposes instead of the app's pick, when they picked one that can go. */
  prefer?: DecisionOption | null;
}

export interface Brief {
  day: string;
  status: BriefStatus;
  /** ADR 0008's head: the title. */
  title: string;
  /** The situation, one sentence ≤ 25 words, ending in what is at stake. */
  situation: string;
  /** Whether `situation` is the person's own words. */
  edited: boolean;
  /** The generated sentence, for "back to the app's words". */
  generated: string;
  impact: string[];
  cause: { facts: string[]; theories: string[] };
  fix: { options: BriefOption[]; proposed: DecisionOption | null; picked: DecisionOption | null; why: string | null };
  /** Every string a reader sees at a glance: the title, the sentence, the impact and the facts. */
  glance: string[];
}

const BANNED = /\b(because|caused by|disappeared|feed stopped|null|unknown)\b/i;

/** The brief of a day. */
export function briefOf(o: BriefIn): Brief {
  const s = o.story;
  const status = statusOf(o);
  const title = s?.head ?? (o.pause ? 'Paused' : 'Published');
  const generated = situationOf(o);
  const situation = o.edited?.trim() ? o.edited.trim() : generated;
  const impact = impactOf(o);
  const cause = causeOf(o);
  const fix = fixOf(o, status);
  const glance = [title, situation, ...impact, ...cause.facts];
  return { day: o.day, status, title, situation, edited: !!o.edited?.trim(), generated, impact, cause, fix, glance };
}

/** The day's status in the incident vocabulary: paused and undecided is investigating; published as is or accepted is
 * expected (only an acceptance retrains the range, ADR 0010 §5); a fill or the part alone is fixed; a day kept back is
 * not published; a day with nothing wrong needs no action. */
export function statusOf(o: Pick<BriefIn, 'pause' | 'story'>): BriefStatus {
  const p = o.pause;
  if (!p) return o.story && (o.story.state === 'wrong' || o.story.state === 'unusual' || o.story.state === 'refused') ? 'investigating' : 'no action';
  switch (p.state) {
    case 'waiting': return 'investigating';
    case 'asis': case 'accepted': return 'expected';
    case 'fill': case 'complete': return 'fixed';
    case 'dont': return 'not published';
  }
}

/**
 * The one sentence: the day, the head, the count against its usual range where the count is off, and what is at stake
 * (what waits, or what readers got). "Thu Sep 21: only Flex Fare after 13:00; 41,939 trips against a usual 98k–115k;
 * 6 of 6 outputs wait, readers see Mon 18." ≤ 25 words, each clause left out when it has no value.
 */
export function situationOf(o: Pick<BriefIn, 'day' | 'story' | 'pause' | 'outputs' | 'noun'>): string {
  const s = o.story;
  const parts: string[] = [];
  if (s?.head) parts.push(s.head.replace(/^./, (c) => c.toLowerCase()));
  if (s?.amount && s.amount.change !== null) parts.push(`${compact(s.amount.value)} ${o.noun(s.amount.value)} against a usual ${compact(s.amount.low)}–${compact(s.amount.high)}`);
  const stake = stakeOf(o);
  if (stake) parts.push(stake);
  if (!parts.length) parts.push(o.pause ? 'paused' : 'published');
  let text = `${dayMid(o.day)}: ${parts.join('; ')}.`;
  // Over the budget, the range clause goes first, then the stake's second half.
  if (wordsIn(text) > 25 && parts.length > 2) text = `${dayMid(o.day)}: ${[parts[0], parts[2]].join('; ')}.`;
  return text;
}

/** What is at stake, for the sentence's end. */
function stakeOf(o: Pick<BriefIn, 'pause' | 'outputs'>): string | null {
  const waits = o.outputs.filter((x) => x.fate === 'waits').length;
  const kept = o.outputs.filter((x) => x.fate === 'kept').length;
  const total = o.outputs.length;
  const p = o.pause;
  if (!p) return null;
  if (p.state === 'waiting') return `${waits || total} of ${total} outputs wait${p.readers ? `, readers see ${dayShort(p.readers)}` : ''}`;
  if (p.state === 'asis') return 'published as is';
  if (p.state === 'accepted') return 'published as the new level';
  if (p.state === 'fill' || p.state === 'complete') return p.remedy ? `readers get it ${p.remedy.replace(/^./, (c) => c.toLowerCase())}` : 'readers get the repaired day';
  return `not published${p.readers ? `, readers keep ${dayShort(p.readers)}` : kept ? `, readers keep an earlier day` : ''}`;
}

/** Impact: which published datasets wait or changed, the objects built on them, and who reads them. ≤ 3 lines. */
export function impactOf(o: Pick<BriefIn, 'outputs' | 'objects' | 'readers' | 'pause'>): string[] {
  const lines: string[] = [];
  const waits = o.outputs.filter((x) => x.fate === 'waits').map((x) => x.name);
  const kept = o.outputs.filter((x) => x.fate === 'kept').map((x) => x.name);
  const out = o.outputs.filter((x) => x.fate === 'published').map((x) => x.name);
  const named = (xs: string[]) => (xs.length <= 3 ? xs.join(', ') : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`);
  // The day readers see is in the sentence already (stakeOf): said once.
  if (waits.length) lines.push(`${waits.length} of ${o.outputs.length} published datasets wait: ${named(waits)}`);
  if (kept.length) lines.push(`Readers keep an earlier day of ${named(kept)}`);
  if (out.length && (waits.length || kept.length)) lines.push(`Up to date: ${named(out)}`);
  if (!waits.length && !kept.length && out.length) lines.push(`All ${o.outputs.length} published datasets went out`);
  // The objects built on them and who reads them, one line, so the first screen keeps its budget.
  if (o.objects.length && o.readers.length) lines.push(`Built on them: ${named(o.objects)}; read by ${named(o.readers)}`);
  else if (o.objects.length) lines.push(`Built on them: ${named(o.objects)}`);
  else if (o.readers.length) lines.push(`Read by ${named(o.readers)}`);
  return lines.slice(0, 3);
}

/** Cause: the facts the day's own rows and file show, then a theory only when the story links a finding to one. */
export function causeOf(o: Pick<BriefIn, 'story' | 'file' | 'noun'>): { facts: string[]; theories: string[] } {
  const facts: string[] = [];
  const theories: string[] = [];
  const s = o.story;
  const sp = s?.split ?? null;
  const range = sp && sp.part.low !== null && sp.part.high !== null ? `${compact(sp.part.today)} today, usually ${compact(sp.part.low)}–${compact(sp.part.high)}` : sp ? `${compact(sp.part.today)} today` : '';
  if (s?.hours && s.hoursLabels) {
    const l = s.hoursLabels;
    // An hour fall with a part that kept arriving (hour-fall-truth.md): everything else stopped, the part went on; the
    // part is the survivor, never the cause, so it is said in the same fact and not again under its own.
    if (l.kept && sp?.kind === 'held') facts.push(`Everything but ${l.kept} stopped at ${l.cut}${l.missing ? ` (${l.missing})` : ''}; ${l.kept} kept arriving${range ? ` (${range})` : ''}`);
    else facts.push(`${o.noun(2).replace(/^./, (c) => c.toUpperCase())} fell ${Math.round(s.hours.fall)}% from ${l.cut}${l.missing ? ` (${l.missing})` : ''}`);
  }
  if (sp && !(s?.hours && s.hoursLabels?.kept && sp.kind === 'held')) {
    const verb = sp.kind === 'held' ? 'held to its usual count while the rest moved' : sp.kind === 'vanished' ? 'all but vanished' : 'surged';
    facts.push(`${sp.name}${sp.who ? ` (${sp.who})` : ''} ${verb}${range ? ` (${range})` : ''}`);
  }
  if (s?.amount && s.amount.change !== null && !s.hours) facts.push(`${compact(s.amount.value)} ${o.noun(s.amount.value)}, ${changeLabel(s.amount.change)} against a usual day`);
  if (s?.gate) {
    const g = s.gate;
    // Said as the checks' own line says it (9.55%, not 10% beside a 10% limit; round 3 #29).
    const pct = (x: number) => `${Number((x * 100).toFixed(2))}%`;
    facts.push(`The checks (${g.step}) dropped ${pct(g.share)} of rows${g.limit !== null ? ` (limit ${pct(g.limit)})` : ''}${g.held ? ', which held the day' : ''}`);
  }
  if (s?.episode && s.episode.days > 1) facts.push(`Day ${s.episode.days} of an episode since ${dayShort(s.episode.since)}`);
  if (o.file) {
    const c = o.file.check;
    const said = c === 'same' || c === 'new' ? 'matches the source’s list' : c === 'republished' ? 'was republished since this browser last read it' : c === 'corrupt' ? 'does not match the source’s list' : c === 'missing' ? 'is missing' : c === 'unlisted' ? 'is not in the source’s list' : c === 'list' ? 'cannot be checked: the lists disagree' : null;
    if (said) facts.push(`The file ${o.file.name} ${said}${o.file.rows !== null && o.file.rows !== undefined ? ` (${compact(o.file.rows)} rows)` : ''}`);
  }
  if (s?.cause?.because) theories.push(`Possibly follows from ${s.cause.because}`);
  if (s?.context) theories.push(`Context, not a cause: ${s.context.title}`);
  return { facts: facts.slice(0, 5), theories };
}

/** The fix: the options on offer, the one proposed (a remedy that can go; else keep the last good day while something
 * is wrong; else publish as is), and the one picked once a decision was taken. */
export function fixOf(o: Pick<BriefIn, 'options' | 'picked' | 'story' | 'pause' | 'prefer'>, status: BriefStatus): Brief['fix'] {
  const open = o.options.filter((x) => !x.off);
  // Something wrong: a remedy first. A sender that stopped, for the second day running, is an outage in progress: the
  // part that arrived goes out as it is (two-minute test, round 1), where a single short day is filled from a good one.
  const outage = o.story?.split?.kind === 'vanished' && (o.story.episode?.days ?? 1) > 1;
  const prefer: DecisionOption[] = o.story?.state === 'wrong' || o.story?.state === 'refused' ? (outage ? ['complete', 'fill', 'dont', 'accept', 'asis'] : ['fill', 'complete', 'dont', 'accept', 'asis']) : ['asis', 'accept', 'fill', 'complete', 'dont'];
  // A person's own proposal first, when it can go; else the app's.
  const own = o.prefer && open.some((x) => x.option === o.prefer) ? o.prefer : null;
  const proposed = o.picked ?? own ?? prefer.find((p) => open.some((x) => x.option === p)) ?? null;
  const why = o.picked ? null : own ? 'Your proposal.' : proposed === 'fill' ? 'A good day near it fills what is missing; readers get a whole day, marked.' : proposed === 'complete' ? (outage ? 'The outage is still running: what arrived goes out, marked as partial, rather than another day’s rows.' : 'The part that arrived goes out alone, marked as partial.') : proposed === 'dont' ? 'Something is wrong in the rows: readers keep the last good day until a corrected file arrives.' : proposed === 'accept' ? 'The change has lasted: accept it, and later days are judged at the new level.' : proposed === 'asis' ? 'Unusual, not wrong: publish it, marked.' : status === 'no action' ? 'Nothing to decide.' : null;
  return { options: o.options, proposed, picked: o.picked, why };
}

/** The brief as text, in SBAR order, to paste into a message. */
export function briefText(b: Brief, o: Pick<BriefIn, 'flow' | 'pause'>): string {
  const lines: string[] = [];
  lines.push(`${b.title} · ${b.status}`);
  lines.push('');
  lines.push(`Situation: ${b.situation}`);
  const background = [...b.cause.facts.filter((f) => /usual|list|episode/i.test(f))];
  if (background.length) lines.push(`Background: ${background.join('. ')}.`);
  const assessment = b.cause.facts.filter((f) => !background.includes(f));
  if (assessment.length || b.cause.theories.length) lines.push(`Assessment: ${[...assessment, ...b.cause.theories].join('. ')}.`);
  if (b.impact.length) lines.push(`Impact: ${b.impact.join('. ')}.`);
  const pick = b.fix.options.find((x) => x.option === (b.fix.picked ?? b.fix.proposed));
  if (pick) lines.push(`Recommendation: ${b.fix.picked ? 'Decided: ' : ''}${pick.label}${pick.line ? ` (${pick.line})` : ''}${b.fix.why ? `. ${b.fix.why}` : ''}${o.pause && o.pause.state === 'waiting' ? ` Decision by ${o.pause.deciders}.` : ''}`);
  lines.push('');
  lines.push(`From smaltfl, ${o.flow}, ${dayMid(b.day)}.`);
  return lines.join('\n');
}

/** The words a brief's first screen shows: the title, the sentence, the impact and the facts. Budget: 90. */
export const briefWords = (b: Brief): number => b.glance.reduce((n, s) => n + wordsIn(s), 0);

/** Words the brief never writes (ADR 0008 §5). */
export const briefBanned = (b: Brief): string[] => b.glance.filter((s) => BANNED.test(s));
