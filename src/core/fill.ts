/**
 * Filling a paused day (ADR 0009 amendment 1): what is missing, from which day it is filled, the derived document that
 * says so, the numbers each option gives readers, the options a held day gets, and a day's versions. Pure: no DOM, no
 * engine. The page draws the options from these; the plugin runs the derived document held, and releases it only as a
 * recorded decision says (src/plugin/release.ts).
 *
 * - The missing part comes from the flow's verdict (`flowStory`, raw names): a fall to the day's end, a gap or a late
 *   start is those hours; a part that vanished is that part; a part that held while the rest vanished is the rest.
 *   Anything else (an amount, a share, a surge, the checks alone) has nothing to fill, and neither has a day whose rows
 *   aren't below their range: the part's rows were coded another way, and a fill would count them twice (S2).
 * - The donor is a good day near the held one: the same weekday or the nearest day, before or after, within four
 *   weeks, judged with nothing wrong of it, never a special day unless the held day is one, and a file in the data's
 *   list (S3). The flow's own rule comes first.
 */
import { isSpecial, plusDays } from './calendar.js';
import { dayShort } from './days.js';
import { fillStepOf, type DonorRule, type FillStep, type FlowDocument, type Missing } from './document.js';
import type { HistoryRanges } from './history.js';
import { dayClaim, type HistoryRef, type StoryClaim } from './hold.js';
import type { JSONValue, LogEntry } from './log.js';
import type { DecisionOption } from './policy.js';
import type { Story } from './story.js';

export type { DonorRule, Missing } from './document.js';

/** Before the held day (a forward fill) or after it (a backfill). */
export type Direction = 'before' | 'after';

/** The furthest a donor may be from the day it fills (S3). */
export const DONOR_WINDOW = 28;

/** A donor as the page found it: its day by a rule and a direction, the file the data's list gives for that day, and
 * the flow's verdict on it, told from the same pinned history as the held day's claim and named for the donor source
 * (`trips_donor`), as the derived run judges it. */
export interface DonorPick {
  rule: DonorRule;
  direction: Direction;
  day: string;
  file: HistoryRef;
  claim: StoryClaim;
}

/** Why no day qualifies: none within four weeks, or (after the day, in a live feed) none has arrived yet. */
export interface NoDonor {
  rule: DonorRule;
  direction: Direction;
  none: 'no good day within four weeks' | 'not arrived';
}

/**
 * A remedy as a decision names it (S9): a fill from a donor, or the complete part alone (donor null). With the flow
 * document and this, anyone can make the derived document again (repairDocument).
 */
export interface Repair {
  kind: 'fill' | 'complete';
  /** The fill step, and the watched source it fills. */
  step: string;
  source: string;
  missing: Missing;
  donor: { rule: DonorRule; direction: Direction; day: string; file: HistoryRef; claim: StoryClaim } | null;
}

// ------------------------------------------------------------------ what is missing

/** A coded value as the history keeps it (JSON text: `1`, `"N"`, `null`), as the data types it. */
function valueOf(json: string): string | number | boolean | null {
  try {
    const v = JSON.parse(json) as unknown;
    return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : json;
  } catch {
    return json;
  }
}

/**
 * The part of a held day a fill takes from another day (S2), from the flow's story: the hours the story's hours cause
 * names, by the fill step's `time`; the part that vanished; or the rest, where a part held while the rest vanished.
 * Null for any other cause, a part that surged among them: nothing is missing.
 */
export function missingOf(story: Pick<Story, 'hero' | 'hours' | 'split'>, time: string): Missing | null {
  if (story.hero === 'hours' && story.hours) return { time, hours: [story.hours.from, story.hours.to] };
  if (story.hero === 'split' && story.split) {
    const sp = story.split;
    if (sp.kind === 'vanished') return { column: sp.column, value: valueOf(sp.value) };
    if (sp.kind === 'held') return { column: sp.column, value: valueOf(sp.value), rest: true };
  }
  return null;
}

/**
 * Whether a held day can be filled, or published with only the part that arrived (S2): its claim says something wrong
 * and its rows are below their range, its story names a missing part, and it is the one source holding the day (a fill
 * of several sources at once is ADR 0010 §7's, per load).
 */
export function fillable(claim: Pick<StoryClaim, 'state' | 'below'> | null, story: Pick<Story, 'hero' | 'hours' | 'split'>, time: string, holding = 1): boolean {
  return holding === 1 && !!claim && claim.state === 'wrong' && claim.below && missingOf(story, time) !== null;
}

// ------------------------------------------------------------------ the donor

/** What finding a donor needs: the flow's history and document, the held day, the watched source, and the rule. */
export interface DonorQuery {
  /** The flow's verdict's history: every day of it (flowStory refuses ranges that leave days out). */
  h: HistoryRanges;
  doc: Pick<FlowDocument, 'steps'>;
  day: string;
  source: string;
  rule: DonorRule;
  direction: Direction;
  /** The file the data's list gives for a day, checked against its sha256 and size, or null when it lists none. */
  listed: (day: string) => HistoryRef | null;
  /** The history file the claims are told from, as pinned in the engine, and the build that tells them. */
  history: HistoryRef;
  build: string;
  /** The days a donor is not taken from unless the held day is one: the flow's calendar (until ADR 0010's lands, the
   * built-in one). */
  special?: (day: string) => boolean;
}

/** A day's donor candidates by a rule and direction, nearest first: 7, 14, 21, 28 days away, or 1 to 28. */
function candidates(day: string, rule: DonorRule, direction: Direction): string[] {
  const step = rule === 'weekday' ? 7 : 1;
  const out: string[] = [];
  for (let n = step; n <= DONOR_WINDOW; n += step) out.push(plusDays(day, direction === 'before' ? -n : n));
  return out;
}

/**
 * The first good day by a rule and direction (S3), with its file and the flow's verdict on it: within four weeks;
 * judged, with nothing wrong of it (not wrong, not refused); not special unless the held day is; in the data's list. A
 * day the history doesn't have isn't judged, so isn't a donor; after the held day, a day past the history's end hasn't
 * arrived yet, and while one may still come the answer is `not arrived`.
 */
export function donorFor(q: DonorQuery): DonorPick | NoDonor {
  const special = q.special ?? ((d: string) => isSpecial(d));
  const heldSpecial = special(q.day);
  const days = q.h.file.days;
  const last = days.at(-1) ?? '';
  let waiting = false;
  for (const d of candidates(q.day, q.rule, q.direction)) {
    if (!days.includes(d)) {
      if (q.direction === 'after' && d > last) waiting = true;
      continue;
    }
    if (special(d) && !heldSpecial) continue;
    const file = q.listed(d);
    if (!file) continue;
    const claim = dayClaim(q.h, q.doc, q.history, d, q.source, q.build);
    if (!claim || claim.state === 'wrong' || claim.state === 'refused') continue;
    // The run judges it as the donor source's claim (judgeDonors): the flow's verdict on the day, named for the donor.
    return { rule: q.rule, direction: q.direction, day: d, file, claim: { ...claim, source: donorIdOf(q.source) } };
  }
  return { rule: q.rule, direction: q.direction, none: waiting ? 'not arrived' : 'no good day within four weeks' };
}

/**
 * The donors a held day's sheet offers (S3): the flow's rule before first, then the other rule before, the nearest day
 * after, and the same weekday after; each day once (the first rule that found it keeps it). Days no rule finds are
 * left out: `none` says why the flow's own rule before found nothing, when it didn't.
 */
export function donorChoices(q: Omit<DonorQuery, 'rule' | 'direction'>, rule: DonorRule): { picks: DonorPick[]; none: NoDonor | null } {
  const other: DonorRule = rule === 'weekday' ? 'nearest' : 'weekday';
  const order: [DonorRule, Direction][] = [[rule, 'before'], [other, 'before'], ['nearest', 'after'], ['weekday', 'after']];
  const picks: DonorPick[] = [];
  let none: NoDonor | null = null;
  for (const [r, direction] of order) {
    const found = donorFor({ ...q, rule: r, direction });
    if ('none' in found) {
      if (r === rule && direction === 'before') none = found;
      continue;
    }
    if (!picks.some((p) => p.day === found.day)) picks.push(found);
  }
  return { picks, none };
}

/** The flow's donor rule: its own setting, else the same weekday (until ADR 0010's patterns choose it, W1). */
export const donorRuleOf = (doc: Pick<FlowDocument, 'publish'>): DonorRule => doc.publish?.donor ?? 'weekday';

// ------------------------------------------------------------------ the derived document

/** The id a source's donor takes in a derived document. */
export const donorIdOf = (source: string): string => `${source}_donor`;
/** The id a source's donor takes in a derived document, and the table it reads (S3: until loads.json format 2). */
export const donorSourceOf = (source: { id: string; table: string }) => ({ id: donorIdOf(source.id), table: `${source.table}_donor` });

/**
 * The derived document a remedy makes (S4): the fill step gets the missing part, and either the donor's day with the
 * donor source as its second input (a fill), or no day (the complete part). Nothing else changes, so the derived
 * document is the flow document and the decision, and anyone can make it again. Throws when the document has no such
 * fill step for that source, or already has a source named as the donor would be.
 */
export function repairDocument(doc: FlowDocument, repair: Repair): FlowDocument {
  const step = fillStepOf(doc, repair.source);
  if (!step || step.id !== repair.step) throw new Error(`the flow has no fill step ${repair.step} on ${repair.source}`);
  if (step.missing !== undefined) throw new Error(`${step.id} fills already: a derived document is made from the flow's own`);
  const source = doc.sources.find((s) => s.id.toLowerCase() === repair.source.toLowerCase());
  if (!source) throw new Error(`the flow has no source ${repair.source}`);
  if ((repair.kind === 'fill') !== (repair.donor !== null)) throw new Error(repair.kind === 'fill' ? 'a fill needs its donor' : 'the complete part has no donor');
  const donor = donorSourceOf(source);
  if (repair.donor && doc.sources.some((s) => s.id.toLowerCase() === donor.id.toLowerCase())) throw new Error(`the flow has a source ${donor.id} already`);
  const filled: FillStep = repair.donor
    ? { ...step, inputs: [step.inputs[0]!, donor.id], missing: structuredClone(repair.missing), from: repair.donor.day }
    : { ...step, inputs: [step.inputs[0]!], missing: structuredClone(repair.missing), from: null };
  return {
    ...doc,
    sources: repair.donor ? [...doc.sources, { id: donor.id, table: donor.table, description: `${source.id} of ${repair.donor.day}, filling ${repair.missing && 'hours' in repair.missing ? 'its hours' : 'its part'}` }] : doc.sources,
    steps: doc.steps.map((s) => (s.id === step.id ? filled : s)),
  };
}

// ------------------------------------------------------------------ the numbers readers would get

/** What each remedy gives readers, at the source (S12's numbers): the rows that arrived, those of the missing part set
 * aside, those the donor gives, and the day's rows in all. */
export interface FillCounts {
  arrived: number;
  setAside: number;
  taken: number;
  total: number;
}

/** A day's rows inside a missing part, from the history's hours or value counts; null when it can't count them. */
export function partRows(h: HistoryRanges, day: string, missing: Missing): number | null {
  const f = h.file;
  const k = f.days.indexOf(day);
  if (k < 0) return null;
  if ('hours' in missing) {
    const hours = f.hours?.[k];
    return hours ? hours.slice(missing.hours[0], missing.hours[1] + 1).reduce((a, b) => a + b, 0) : null;
  }
  const vh = f.values?.[missing.column];
  const at = vh ? vh.values.indexOf(JSON.stringify(missing.value)) : -1;
  if (!vh?.counts) return null;
  const n = at < 0 ? 0 : (vh.counts[k]?.[at] ?? 0);
  return missing.rest ? f.rows[k]! - n : n;
}

/**
 * The sheet's numbers for a remedy (S4: the drawing's count and the derived run's are the same number): with a donor,
 * a fill; without, the complete part. Null when the history can't count the part on either day.
 */
export function fillCounts(h: HistoryRanges, day: string, missing: Missing, donor: string | null): FillCounts | null {
  const k = h.file.days.indexOf(day);
  const setAside = partRows(h, day, missing);
  const taken = donor === null ? 0 : partRows(h, donor, missing);
  if (k < 0 || setAside === null || taken === null) return null;
  const arrived = h.file.rows[k]!;
  return { arrived, setAside, taken, total: arrived - setAside + taken };
}

// ------------------------------------------------------------------ the options a held day gets

/** "13:00". */
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * What the complete part is called (S12): "Before 13:00 only" (hours that fell to the day's end), "From 07:00 only" (a
 * late start), "Without 06:00–16:00" (a gap); "Without Vendor 1" (a part that vanished); "Flex Fare only" (the part that
 * held). `name` is the split's part as the story names it.
 */
export function partLabel(missing: Missing, name?: string): string {
  if ('hours' in missing) {
    const [a, b] = missing.hours;
    if (b === 23 && a > 0) return `Before ${clock(a)} only`;
    if (a === 0 && b < 23) return `From ${clock(b + 1)} only`;
    return `Without ${clock(a)}–${clock((b + 1) % 24)}`;
  }
  const part = name ?? `${missing.column} ${String(missing.value)}`;
  return missing.rest ? `${part} only` : `Without ${part}`;
}

/** An option for a held day as the sheet offers it: its label, and why it is off when it is (S5). */
export interface Offer {
  option: DecisionOption;
  label: string;
  /** Why it can't be taken now: "No good day near", "Mon 25 is published". */
  off?: string;
  /** Said with it, not stopping it (Q-67): "fails its checks". */
  note?: string;
  /** A don't publish that takes back a fill readers have (Q-61): "Withdraw the fill". */
  withdraws?: true;
}

export interface OfferInput {
  /** The flow's story of the day, and the claim the run was held on. */
  story: Pick<Story, 'hero' | 'hours' | 'split'>;
  claim: Pick<StoryClaim, 'state' | 'below'> | null;
  /** The watched source's fill step, if the flow has one. */
  fill: Pick<FillStep, 'time'> | undefined;
  /** The donors the sheet offers, the flow's rule first (donorChoices). */
  donors: readonly Pick<DonorPick, 'day'>[];
  /** Watched sources holding the day (fills are for one at a time). */
  holding?: number;
  /** A later day readers have now: a fill or the part that arrived would move the names back past it. */
  later?: string | null;
  /** The part that arrived fails the checks (its derived run's checks tripped, or the held run's did on it). */
  partFails?: boolean;
  /** What readers have of this day now, from a release of it. */
  readers?: 'fill' | 'complete' | null;
}

/**
 * The remedies a held day gets (S5), in C2's order: a fill (off with "No good day near" when no donor qualifies), the
 * part that arrived alone (marked "fails its checks" when it does, Q-67), each off while a later day is current; and,
 * once readers have a fill or the part alone, its withdrawal (Q-61). None when the source has no fill step or nothing
 * is missing. Publish as is and don't publish are the sheet's own, as in slice 1.
 */
export function offersOf(o: OfferInput): Offer[] {
  const out: Offer[] = [];
  if (o.fill && fillable(o.claim, o.story, o.fill.time, o.holding ?? 1)) {
    const missing = missingOf(o.story, o.fill.time)!;
    const later = o.later ? `${dayShort(o.later)} is published` : undefined;
    const donor = o.donors[0];
    out.push({ option: 'fill', label: donor ? `Fill from ${dayShort(donor.day)}` : 'Fill', ...(later ? { off: later } : !donor ? { off: 'No good day near' } : {}) });
    out.push({ option: 'complete', label: partLabel(missing, o.story.split?.name), ...(later ? { off: later } : {}), ...(o.partFails ? { note: 'fails its checks' } : {}) });
  }
  if (o.readers === 'fill' || o.readers === 'complete') out.push({ option: 'dont', label: o.readers === 'fill' ? 'Withdraw the fill' : 'Withdraw the part', withdraws: true });
  return out;
}

// ------------------------------------------------------------------ a day's versions

/** A version of a day (S7): a run of it, in the record's order, and whether readers had it. */
export interface Version {
  /** The run entry's seq, the run's number and its manifest. */
  seq: number;
  run: number;
  manifest: string;
  /** What arrived (the first run of the day), a fill or the part alone (a derived run), or a re-run of another file. */
  kind: 'arrived' | 'filled' | 'complete' | 'rerun';
  /** A fill's donor day. */
  donor?: string;
  /** Rows at the fill step (a derived run's), or at the source, where the entry says. */
  rows?: number;
  /** Readers have it now; had it before (a later publication replaced it); or never had it. */
  shown: 'now' | 'before' | null;
}

type EntryLike = Pick<LogEntry, 'seq' | 'kind' | 'about'>;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The day an entry is about: its `day`, else its inputs' period value. */
function entryDay(a: Record<string, unknown>, period: string | null | undefined): string | null {
  if (typeof a.day === 'string') return a.day;
  const inputs = a.inputs;
  const v = period && isRecord(inputs) && isRecord(inputs.parameters) ? inputs.parameters[period] : undefined;
  return typeof v === 'string' ? v : null;
}

/**
 * A day's versions (S7), from its flow's record: each held, passing or derived run of the day, in the order the record
 * has them. The same run made again (its manifest seen before, as after a reload) is one version. A version is shown
 * `now` when the last publication in the record (a passing run, or an applied release, a withdrawal included) points
 * the names at it; `before` when one did and a later one replaced it.
 */
export function dayVersions(entries: readonly EntryLike[], day: string, period?: string | null): Version[] {
  const out: Version[] = [];
  const byManifest = new Map<string, Version>();
  const decisions = new Map<number, Record<string, unknown>>();
  let showing: Version | null = null;
  const shownEver = new Set<Version>();
  const show = (v: Version | null) => {
    showing = v;
    if (v) shownEver.add(v);
  };
  // The version each release showed before it: what a withdrawal points back to.
  const before = new Map<number, Version | null>();
  for (const e of entries) {
    const a = e.about as JSONValue;
    if (!isRecord(a)) continue;
    if (e.kind === 'run' && (a.outcome === 'held' || a.outcome === 'ok' || a.outcome === 'derived') && typeof a.manifest === 'string' && Number.isInteger(a.run)) {
      const mine = entryDay(a, period) === day;
      if (!mine) {
        if (a.outcome === 'ok') show(null);
        continue;
      }
      let v = byManifest.get(a.manifest);
      if (!v) {
        const repair = isRecord(a.repair) ? a.repair : null;
        const kind: Version['kind'] = a.outcome === 'derived' ? (repair?.kind === 'complete' ? 'complete' : 'filled') : out.some((x) => x.kind === 'arrived' || x.kind === 'rerun') ? 'rerun' : 'arrived';
        const donor = repair && isRecord(repair.donor) && typeof repair.donor.day === 'string' ? repair.donor.day : undefined;
        v = { seq: e.seq, run: a.run as number, manifest: a.manifest, kind, ...(donor ? { donor } : {}), ...(Number.isInteger(a.rows) ? { rows: a.rows as number } : {}), shown: null };
        // A re-run of the same file isn't another version: the same inputs as a version before it.
        if (kind === 'rerun' && isRecord(a.inputs)) {
          const same = out.find((x) => x.kind !== 'filled' && x.kind !== 'complete' && sameFiles(entries, x.seq, a.inputs as Record<string, unknown>));
          if (same) {
            byManifest.set(a.manifest, same);
            if (a.outcome === 'ok') show(same);
            continue;
          }
        }
        out.push(v);
        byManifest.set(a.manifest, v);
      }
      if (a.outcome === 'ok') show(v);
    } else if (e.kind === 'decide') {
      decisions.set(e.seq, a);
    } else if (e.kind === 'release' && a.outcome === 'applied' && Number.isInteger(a.decision)) {
      const d = decisions.get(a.decision as number);
      const ofDay = d ? entryDay(d, period) === day : false;
      if (!ofDay) {
        show(null);
        continue;
      }
      before.set(e.seq, showing);
      if (Number.isInteger(a.withdraws)) {
        show(before.get(a.withdraws as number) ?? null);
        continue;
      }
      const from = isRecord(a.from) && typeof a.from.manifest === 'string' ? a.from.manifest : null;
      const derived = d && isRecord(d.derived) && typeof d.derived.manifest === 'string' ? d.derived.manifest : null;
      const released = typeof a.manifest === 'string' ? a.manifest : null;
      show(byManifest.get(released ?? '') ?? byManifest.get(derived ?? '') ?? byManifest.get(from ?? '') ?? null);
    }
  }
  const now = showing as Version | null;
  for (const v of out) v.shown = v === now ? 'now' : shownEver.has(v) ? 'before' : null;
  return out;
}

/** Whether the run entry at `seq` has the same files as these inputs. */
function sameFiles(entries: readonly EntryLike[], seq: number, inputs: Record<string, unknown>): boolean {
  const e = entries.find((x) => x.seq === seq);
  const a = e && isRecord(e.about) ? e.about : null;
  const files = (x: unknown) => (isRecord(x) && isRecord(x.files) ? JSON.stringify(Object.entries(x.files).sort()) : null);
  return !!a && files(a.inputs) !== null && files(a.inputs) === files(inputs);
}
