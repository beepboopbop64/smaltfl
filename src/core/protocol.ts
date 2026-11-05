/**
 * What the app (or a test, or a server) and the runtime plugin say to each other through `callPlugin`. Plain data
 * only, so it crosses the worker protocol by structured clone.
 */
import type { RunManifest } from './manifest.js';

/** The plugin's name, as `callPlugin` addresses it. */
export const PLUGIN_NAME = 'smaltfl';

export interface RunOptions {
  /** The smaltdb version the engine runs (keys depend on it). */
  smaltdb: string;
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
  /** stored: the data kept now still has its recorded hash; rerun: recomputing it from the snapshots gives it again. */
  check: 'stored' | 'rerun' | 'expectations';
  ok: boolean;
  expected?: string;
  actual?: string | null;
  note?: string;
}

export interface VerifyResult {
  ok: boolean;
  run: number;
  /** The engine the run used, and the one that verified it. */
  engine: { ran: string; verified: string };
  checks: VerifyCheck[];
}

/**
 * Anything that can call a plugin method: the smaltdb client `Database` in a page, the engine `Database` in Node.
 * A run writes, so through the client it holds the database's lock (`lock: true`), as `exec` does.
 */
export interface PluginCaller {
  callPlugin(plugin: string, method: string, args: unknown[], options?: { lock?: boolean; signal?: AbortSignal }): Promise<unknown>;
}
