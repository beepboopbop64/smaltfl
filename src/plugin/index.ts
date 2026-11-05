/**
 * smaltfl's runtime plugin (smaltdb plugin API v1). It runs inside the engine, next to the data: in the browser in
 * the engine worker (`serve({ plugins: [smaltfl] })`), in Node with `Database.open…(…, { plugins: [smaltfl] })`.
 *
 * Methods, called with `callPlugin('smaltfl', name, args)` (or `runFlow` / `verifyRun` from the core):
 *   run [plan, { smaltdb }]           → RunResult     run a flow plan; only what changed is rebuilt
 *   verify [run, { smaltdb }]         → VerifyResult  check a run's hashes, then recompute it from its snapshots
 *   manifest [run]                    → RunManifest   a stored run's manifest
 *
 * Like every plugin, it imports nothing from the engine at run time, only types.
 */
import type { SmaltPlugin } from 'smaltdb/engine';
import type { RunManifest } from '../core/manifest.js';
import { PLUGIN_NAME, type RunOptions } from '../core/protocol.js';
import { RunError, runPlan } from './runtime.js';
import { ensureStore } from './store.js';
import { verifyRun } from './verify.js';

declare const __PLUGIN_VERSION__: string | undefined;
/** This build's version, which every key includes. */
export const VERSION = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '0.0.0';

const smaltfl: SmaltPlugin = {
  name: PLUGIN_NAME,
  version: VERSION,
  apiVersion: 1,
  setup(host) {
    host.addMethod('run', (ctx, [plan, options]) => runPlan(ctx.db, plan, options as RunOptions, VERSION, ctx.signal));
    host.addMethod('verify', (ctx, [run, options]) => verifyRun(ctx.db, Number(run), options as RunOptions, ctx.signal));
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
