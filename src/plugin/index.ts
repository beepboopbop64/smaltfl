/**
 * smaltfl's runtime plugin (smaltdb plugin API v1). It runs inside the engine, next to the data: in the browser in
 * the engine worker (`serve({ plugins: [smaltfl] })`), in Node with `Database.open…(…, { plugins: [smaltfl] })`.
 *
 * Methods, called with `callPlugin('smaltfl', name, args)` (or `runFlow` / `verifyRun` from the core):
 *   run [plan, { smaltdb, context }]  → RunResult     run a flow plan; only what changed is rebuilt, and with a
 *                                                     publish block only what nothing holds is published (ADR 0009)
 *   release [ReleaseInput]            → ReleaseResult publish a held run's outputs as a recorded decision says, or
 *                                                     refuse, saying why; refusals are kept too (ADR 0009 §5)
 *   verify [run, { smaltdb, level }]  → VerifyResult  check a run's hashes, recompute it, decode its files again
 *   pin [name, bytes, sha256]         → { sha256 }    hash a source file in the engine, refuse a mismatch, serve it
 *                                                     as smaltfl:<name> (ADR 0006 §3); null bytes unpin it
 *   manifest [run]                    → RunManifest   a stored run's manifest
 *   names                             → { datasets, releases }  what each dataset name shows, by which run and
 *                                                     release, and every release: an audit bag's engine/ files
 *   act [ActInput]                    → Edit          check an action and record its edit or refusal
 *   edits / verifyEdits               → Edit[] / …    the hash chain of edits, and its check
 *
 * Like every plugin, it imports nothing from the engine at run time, only types.
 */
import type { SmaltPlugin } from 'smaltdb/engine';
import type { RunManifest } from '../core/manifest.js';
import { PLUGIN_NAME, type RunOptions, type VerifyOptions } from '../core/protocol.js';
import { act, listEdits, verifyEdits, type ActInput } from './actions.js';
import { pin, pinnedSource } from './pinned.js';
import { release } from './release.js';
import { RunError, runPlan } from './runtime.js';
import { engineNames, ensureStore } from './store.js';
import { verifyRun } from './verify.js';

declare const __PLUGIN_VERSION__: string | undefined;
declare const __SMALTFL_COMMIT__: string | undefined;
/** This build's version, which every key includes. */
export const VERSION = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '0.0.0';
/** The commit this build was made from, which every run records (or dev, for a build from a working tree). */
export const COMMIT = typeof __SMALTFL_COMMIT__ === 'string' && __SMALTFL_COMMIT__ !== '' ? __SMALTFL_COMMIT__ : 'dev';

const smaltfl: SmaltPlugin = {
  name: PLUGIN_NAME,
  version: VERSION,
  apiVersion: 1,
  setup(host) {
    host.addSource(pinnedSource);
    host.addMethod('run', (ctx, [plan, options]) => runPlan(ctx.db, plan, options as RunOptions, VERSION, ctx.signal, COMMIT));
    host.addMethod('release', (ctx, [input]) => release(ctx.db, input));
    host.addMethod('verify', (ctx, [run, options]) => verifyRun(ctx.db, Number(run), options as VerifyOptions, ctx.signal));
    host.addMethod('pin', (_ctx, [name, bytes, sha256]) => pin(name, bytes, sha256));
    host.addMethod('act', (ctx, [input]) => act(ctx.db, input as ActInput));
    host.addMethod('edits', (ctx) => listEdits(ctx.db));
    host.addMethod('verifyEdits', (ctx) => verifyEdits(ctx.db));
    host.addMethod('names', (ctx) => {
      ensureStore(ctx.db);
      return engineNames(ctx.db);
    });
    host.addMethod('manifest', (ctx, [run]) => {
      ensureStore(ctx.db);
      const row = ctx.db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [Number(run)]).rows[0];
      if (!row) throw new RunError(`no run ${String(run)} in this database`);
      return JSON.parse(String(row[0])) as RunManifest;
    });
  },
};

export default smaltfl;
export { RunError };
