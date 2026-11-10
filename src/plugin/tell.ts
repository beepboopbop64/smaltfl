/**
 * A watched step's claim, told in the engine (ADR 0013 §4). A watched source's load is a file the page has before the
 * run, so the page tells its claim and the run checks it (ADR 0009 §3, ADR 0010 §6). A watched step's load is the
 * dataset the run builds: it exists only inside the run, so the run tells the claim itself, the same way the page
 * would (core/hold.ts loadClaim), from the base history pinned under the watch's file name, the tail pinned under the
 * step's tail path, the measures it has just taken of the built dataset, and what the page said of the record
 * (RunContext.tell: the days left out, the levels accepted). The claim then goes through the same judge as any.
 */
import { isSample, samplePath, type SampleFile } from '../core/apart.js';
import type { FlowDocument } from '../core/document.js';
import { isHistory, type HistoryFile } from '../core/history.js';
import { loadClaim, tailPath, type StoryClaim2 } from '../core/hold.js';
import { measuresProblem, type MeasureSettings, type Measures } from '../core/measures.js';
import type { TellFor } from '../core/protocol.js';
import { pinned } from './pinned.js';

export interface TellInput {
  doc: FlowDocument;
  /** The watched step's id, and the history file its watch names. */
  source: string;
  history: string;
  /** The flow hash the claim is told under: the plan's. */
  flow: string;
  measures: Measures;
  settings: MeasureSettings;
  tell: TellFor;
  build: string;
  /** The claims the page told for the watched sources (ADR 0014 §2): what each said of the day. */
  upstream?: readonly { source: string; state: string; head: string }[];
  /** The load's kept rows (ADR 0014 §5), for the classifier, with the sample pinned under `samplePath(source)`. */
  kept?: readonly (readonly unknown[])[];
}

/** The pinned file's JSON, or undefined when none is pinned or it isn't JSON. */
function pinnedJSON(path: string): { value: unknown; sha256: string; bytes: number } | undefined {
  const p = pinned(path);
  if (!p) return undefined;
  try {
    return { value: JSON.parse(new TextDecoder().decode(p.bytes)) as unknown, sha256: p.sha256, bytes: p.bytes.byteLength };
  } catch {
    return undefined;
  }
}

/**
 * The step's claim/2, or null with why when it can't be told: a pinned history that isn't one, a pinned tail that
 * isn't measures, or a load the ranges can't take (loadClaim's own refusals).
 */
export async function tellClaim(o: TellInput): Promise<{ claim: StoryClaim2 } | { problem: string }> {
  const h = pinnedJSON(o.history);
  if (h && !isHistory(h.value)) return { problem: `${o.history} is pinned but isn't a history file` };
  const base: HistoryFile | null = h ? (h.value as HistoryFile) : null;
  const t = pinnedJSON(tailPath(o.source));
  let tail: Measures[] = [];
  if (t) {
    if (!Array.isArray(t.value)) return { problem: `${tailPath(o.source)} is pinned but isn't a tail` };
    for (const m of t.value) {
      const why = measuresProblem(m);
      if (why) return { problem: `${tailPath(o.source)} has a record that ${why}` };
    }
    tail = t.value as Measures[];
  }
  // The sample pinned beside the history (ADR 0014 §5): the classifier's reference, with the load's own kept rows.
  const sp = o.kept ? pinnedJSON(samplePath(o.source)) : undefined;
  if (sp && !isSample(sp.value)) return { problem: `${samplePath(o.source)} is pinned but isn't a sample file` };
  const told = await loadClaim({ doc: o.doc, source: o.source, flow: o.flow, base, baseRef: h ? { path: o.history, sha256: h.sha256, bytes: h.bytes } : null, tail, measures: o.measures, settings: o.settings, skip: o.tell.skip, levels: o.tell.levels, build: o.build, ...(o.upstream ? { upstream: o.upstream } : {}), ...(sp && o.kept ? { sample: sp.value as SampleFile, kept: o.kept } : {}) });
  return told ? { claim: told.claim } : { problem: `${o.source}'s load can't be judged against its history (its slot is in the base already, or before its last period, with other numbers)` };
}
