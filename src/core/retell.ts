/**
 * Telling a flow's verdicts again from the record (ADR 0010 §6, `audit.mjs check --history`): for each run whose watched
 * source was judged by a claim/2, the tail rebuilt from the record's run entries before it (their `measures`, one a
 * slot, the first to arrive, never a derived run's), the days the record left out of learning before it (`skipOf`),
 * the load's own measures as its entry keeps them, and the base history the auditor brings; the claim must name that
 * base, that tail, those measures and those days, and the flow's story told again from them must say what the claim
 * said. Pure: no engine, no DOM.
 */
import type { FlowDocument } from './document.js';
import { HistoryRanges, type HistoryFile } from './history.js';
import { flowStory, rangesFor, isClaim2, skipOf, type Claim, type StoryClaim2 } from './hold.js';
import type { LogEntry } from './log.js';
import { appendPeriods, emptyHistory, measuresHash, samePeriod, settingsFor, tailBefore, tailRef, type Measures } from './measures.js';
import { translate } from './plan.js';

/** A run whose claim is told again: its record entry's seq, its claim, and the flow document it ran. */
export interface Retold {
  seq: number;
  claim: Claim;
  doc: FlowDocument | null;
}

type EntryLike = Pick<LogEntry, 'seq' | 'kind' | 'at' | 'by' | 'about' | 'reason' | 'amends'>;

/** A source's tail as the record has it before entry `seq`: each run's measures, one a slot, the first to arrive. */
export function tailFromRecord(entries: readonly EntryLike[], seq: number, source: string, base: HistoryFile | null): Measures[] {
  const out: Measures[] = [];
  for (const e of entries) {
    if (e.seq >= seq) break;
    const a = e.about as { outcome?: string; measures?: Measures[] } | null;
    if (e.kind !== 'run' || (a?.outcome !== 'ok' && a?.outcome !== 'held') || !Array.isArray(a.measures)) continue;
    for (const m of a.measures) if (m.source === source && !base?.days.includes(m.slot) && !out.some((x) => x.slot === m.slot)) out.push(m);
  }
  return out;
}

/** What is wrong with each claim/2 told again, one line a run: an empty `problems` when it holds. */
export async function retellClaims(entries: readonly EntryLike[], runs: readonly Retold[], base: { file: HistoryFile; sha256: string } | null, period: string | null): Promise<{ seq: number; slot: string; problems: string[] }[]> {
  const out: { seq: number; slot: string; problems: string[] }[] = [];
  for (const r of runs) {
    if (!isClaim2(r.claim)) continue;
    const c: StoryClaim2 = r.claim;
    const problems: string[] = [];
    const entry = entries.find((e) => e.seq === r.seq);
    const own = ((entry?.about as { measures?: Measures[] } | null)?.measures ?? []).find((m) => m.source === c.source);
    if (!own) problems.push(`its entry keeps no measures of ${c.source}`);
    else if ((await measuresHash(own)) !== c.measured) problems.push(`its claim was told from other measures of ${c.source} than its entry keeps`);
    if ((c.history.base?.sha256 ?? null) !== (base?.sha256 ?? null)) problems.push(c.history.base ? `its claim was told from another base history (${c.history.base.sha256.slice(0, 16)}…) than the one given` : 'its claim was told with no base history, and one was given');
    const tail = tailBefore(tailFromRecord(entries, r.seq, c.source, base?.file ?? null), c.slot);
    const ref = tailRef(tail);
    if ((ref?.size ?? 0) !== (c.history.tail?.size ?? 0) || (ref?.root ?? null) !== (c.history.tail?.root ?? null)) problems.push(`its claim names a tail of ${c.history.tail?.size ?? 0}, and the record's before it is ${ref?.size ?? 0}${ref && c.history.tail && ref.size === c.history.tail.size ? ' with another root' : ''}`);
    const skips = skipOf(entries.filter((e) => e.seq < r.seq), period).filter((d) => d < c.slot);
    if (JSON.stringify(skips) !== JSON.stringify(c.skip)) problems.push(`its claim leaves out ${c.skip.join(', ') || 'no days'}, and the record before it ${skips.join(', ') || 'none'}`);
    if (!r.doc) problems.push("its flow document isn't in the bag, so its verdict can't be told again");
    if (own && r.doc && !problems.length) {
      try {
        const k = base ? base.file.days.indexOf(c.slot) : -1;
        let file: HistoryFile;
        if (base && k >= 0) {
          const why = samePeriod(base.file, k, own);
          if (why) throw new Error(`its load isn't the base's ${c.slot}: ${why}`);
          file = base.file;
        } else if (base) file = appendPeriods(base.file, [...tail, own]);
        else {
          // No base: the history its page started from, empty, measuring what settingsFor measures with none.
          const plan = await translate(r.doc, period ? { [period]: c.slot } : {});
          const s = settingsFor(plan, plan.nodes.findIndex((n) => n.op === 'table' && n.origin === c.source), null, r.doc.steps);
          if (!s) throw new Error(`the flow doesn't watch ${c.source} by a period`);
          file = appendPeriods(emptyHistory({ flow: r.doc.id, source: c.source, settings: s, columns: own.columns, types: own.types, kinds: own.kinds }), [...tail, own]);
        }
        // The levels the claim names (C6) are learned anew from their days, as the page told it.
        const story = flowStory(new HistoryRanges(file, { ...rangesFor(r.doc, c.source), recorded: new Set(c.skip), levels: c.levels }), c.slot, r.doc, c.source);
        const below = story.amount ? story.amount.value < story.amount.low : story.state === 'wrong' && story.hero === 'amount' && story.cause?.kind === 'volume';
        if (story.state !== c.state || story.head !== c.head || below !== c.below) problems.push(`told again, its story says ${story.state} "${story.head}", and the claim ${c.state} "${c.head}"`);
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    out.push({ seq: r.seq, slot: c.slot, problems });
  }
  return out;
}
