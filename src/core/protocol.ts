/**
 * What the app (or a test, or a server) and the runtime plugin say to each other through `callPlugin`. Plain data
 * only, so it crosses the worker protocol by structured clone.
 */
import type { Repair } from './fill.js';
import type { Claim, FillHold, Hold, RunRef } from './hold.js';
import type { RunManifest } from './manifest.js';
import type { Measures } from './measures.js';
import type { DecisionOption } from './policy.js';

/** The plugin's name, as `callPlugin` addresses it. */
export const PLUGIN_NAME = 'smaltfl';

export interface RunOptions {
  /** The smaltdb version the engine runs (keys depend on it): checked against the engine's own. */
  smaltdb: string;
  /**
   * What the run depended on that the plan does not say (ADR 0006): the flow document, which must hash to the plan's
   * flow hash and is stored with the run; and, as the caller's claims, the data branch commit and MANIFEST.json hash
   * it loaded from, and the head of its record before the run.
   */
  context?: RunContext;
  /**
   * A derived run (ADR 0009 amendment 1 S4): every output held whatever else holds, its versions staged as any held
   * run's are, until a decision releases them. A plan whose fill step fills a day runs only this way. `from` names the
   * held run it repairs, which its release is checked against (C4).
   */
  stage?: boolean;
  from?: RunRef;
}

export interface RunContext {
  doc?: unknown;
  data?: { commit: string; manifest: string } | null;
  log?: { origin: string; size: number; root: string } | null;
  /**
   * What the page's story says of each watched source's day (ADR 0009 §3), for a plan whose publish block watches
   * one. The plugin checks each claim against the run (its day, the pinned history, the snapshot's rows): a claim that
   * is missing or doesn't match leaves its source not judged, which holds. A claim can only add a hold. A derived run's
   * claims add each donor's (amendment 1 S3): the donor source's id, its day, the same pinned history.
   */
  claims?: Claim[];
}

/** How far verify goes (ADR 0006 §1): the stored hashes; then a recomputation; then decoding the source files again. */
export type VerifyLevel = 'stored' | 'rerun' | 'rederive';

export interface VerifyOptions extends RunOptions {
  level?: VerifyLevel;
  /**
   * The manifest hash the caller holds for the run (from its result, or its record): the run is checked to be that
   * one, so a run number that now names another manifest (a rewritten store, a new engine) fails rather than
   * verifies something else under its number.
   */
  manifest?: string;
}

export interface RunResult {
  /** The run's number in this database. */
  run: number;
  /** The manifest's hash. */
  hash: string;
  manifest: RunManifest;
  /**
   * What holds the run (ADR 0009 §3): none for a run that published, and always none for a plan without a publish
   * block. A held run is built, checked, hashed and stored like any other, but what it holds is not published: read
   * `published`, never the manifest's outputs, for what readers see.
   */
  holds: Hold[];
  /** The outputs whose names now show this run's versions: every output, unless something holds. */
  published: string[];
  /** The held outputs whose staged key isn't the one their name shows: what waits for a decision (§4). */
  waiting: string[];
  /** A derived run (amendment 1 S4): what holds it besides its day's holds (`derived`, and `donor` for a donor not
   * judged good), and the rows its fill took from another day (null for the part that arrived alone). */
  derived?: { holds: FillHold[]; filled: number | null };
  /** plan/2 (ADR 0010 §6): each watched load's measures, as the run measured its snapshot, which the page appends to
   * the source's tail (one a slot, C5) and keeps in the run's record entry. */
  measures?: Measures[];
}

/**
 * Publishing a held run's outputs, as a decision recorded first says (ADR 0009 §5). The plugin checks every field
 * against the run and its stored policies, and refuses rather than throws: a refusal is kept, as an applied release is.
 */
export interface ReleaseInput {
  /** The held run, by its number here, and its manifest's hash (the run's own, which may be a re-run's). */
  run: number;
  manifest: string;
  /** The outputs the decision names, with their keys: `{ name: key }`. */
  keys: Record<string, string>;
  /**
   * Publish as is releases a held run; a fill or the part that arrived releases the derived run its decision made
   * (amendment 1 S10); don't publish is a decision and nothing more, unless it withdraws a fill readers have (Q-61).
   */
  option: DecisionOption;
  /** The principal who decided. */
  actor: string;
  /** The person's reason: publish as is needs one. */
  reason: string | null;
  /** The decide entry's log/1 leaf (64 hex characters): the record's entry the release cites (for a `meanwhile`
   * release, the flow entry that set it). */
  decision: string;
  /** A fill or the part that arrived: the held run the derived run repairs, and the repair. */
  from?: RunRef;
  repair?: Repair;
  /** A release under the flow's `meanwhile` setting, rather than a person's decision (amendment 1 S5). */
  meanwhile?: boolean;
  /** A withdrawal (Q-61): the release of the fill it takes back, by its number here. `run`, `manifest` and `keys` are
   * that release's. */
  withdraws?: number;
}

export interface ReleaseResult {
  outcome: 'applied' | 'refused';
  /** Why it was refused; null when applied. */
  why: string | null;
  /** The release's number in this database (refusals are kept too). */
  release: number;
  /** The names that now show the run's versions (after a withdrawal, the versions they showed before): none when
   * refused. */
  published: string[];
  /** A derived run's release: the rows its fill took from another day (null for the part that arrived alone). */
  filled?: number | null;
}

export interface VerifyCheck {
  /** The plan node checked, or -1 for the manifest and the plan themselves. */
  node: number;
  origin: string;
  /**
   * stored: the data kept now still has its recorded hash; rerun: recomputing it from the snapshots gives it again;
   * expectations: recounting the checks gives the same counts; coherent: the manifest agrees with the plan it names;
   * key: the key recomputes; published: the dataset name shows the version the run made; previous: the run it chains
   * to is there with that hash; accounting: rows in and out add up; flow: the stored document hashes to the plan's
   * flow hash and translates to the plan; file: the source file the run read still has its hash and decodes to the
   * snapshot; held: what held the run computes again from its manifest and its stored claims, and every held output a
   * name shows was released by a decision (ADR 0009 §11); repair: a derived run released with a repair is that repair
   * of its held run, read the donor's file the repair names, and read the held run's snapshot (amendment 1 S11).
   */
  check: 'stored' | 'rerun' | 'expectations' | 'coherent' | 'key' | 'published' | 'previous' | 'accounting' | 'flow' | 'file' | 'held' | 'repair';
  ok: boolean;
  expected?: string;
  actual?: string | null;
  note?: string;
}

export interface VerifyResult {
  ok: boolean;
  run: number;
  /** How far it went, and the manifest's format (0: no source files recorded). */
  level: VerifyLevel;
  format: number;
  /** The engine the run used, and the one that verified it (the engine's own version, where it reports one). */
  engine: { ran: string; verified: string };
  /** The hash of the manifest that was verified, as stored with the run. */
  manifest: string;
  checks: VerifyCheck[];
}

/**
 * Anything that can call a plugin method: the smaltdb client `Database` in a page, the engine `Database` in Node.
 * A run writes, so through the client it holds the database's lock (`lock: true`), as `exec` does.
 */
export interface PluginCaller {
  callPlugin(plugin: string, method: string, args: unknown[], options?: { lock?: boolean; replay?: string; dropReplay?: boolean; signal?: AbortSignal }): Promise<unknown>;
}
