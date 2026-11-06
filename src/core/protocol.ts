/**
 * What the app (or a test, or a server) and the runtime plugin say to each other through `callPlugin`. Plain data
 * only, so it crosses the worker protocol by structured clone.
 */
import type { RunManifest } from './manifest.js';

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
}

export interface RunContext {
  doc?: unknown;
  data?: { commit: string; manifest: string } | null;
  log?: { origin: string; size: number; root: string } | null;
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
   * snapshot.
   */
  check: 'stored' | 'rerun' | 'expectations' | 'coherent' | 'key' | 'published' | 'previous' | 'accounting' | 'flow' | 'file';
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
