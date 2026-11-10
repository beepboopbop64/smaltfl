import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

// Tests run smaltdb from the source in its packed build (node_modules/smaltdb/src, installed by
// scripts/fetch-packed.mjs), so tests can also reach its internals as `smaltdb-src/...` (the worker protocol, the
// engine server) with one copy of every class.
const core = (path: string): string => fileURLToPath(new URL(`./node_modules/smaltdb/src/${path}`, import.meta.url));

/**
 * The tests too long for `npm test` (under a minute on four cores), run by `npm run test:slow` and by CI beside it: each
 * runs a month through the engine a day at a time, and no part of it can start before the day before has run.
 */
const SLOW = ['test/estate-flow.test.ts'];

/**
 * The files that take longest, started first in this order, so none of them is left to run alone at the end: a world of
 * engine runs built before its tests, or every day of two years judged. The others follow vitest's own order.
 */
const FIRST = ['controls-anyday', 'controls', 'security', 'security-years', 'slots', 'runtime', 'estate-flow'];
class LongestFirst extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const rank = (f: TestSpecification) => {
      const name = /([^/\\]+)\.test\.ts$/.exec(f.moduleId)?.[1] ?? '';
      const i = FIRST.indexOf(name);
      return i < 0 ? FIRST.length : i;
    };
    const rest = await super.sort(files);
    return [...rest].sort((a, b) => rank(a) - rank(b));
  }
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^smaltdb$/, replacement: core('client/index.ts') },
      { find: /^smaltdb\/engine$/, replacement: core('engine/index.ts') },
      { find: /^smaltdb\/worker-runtime$/, replacement: core('engine/worker-runtime.ts') },
      { find: /^smaltdb-src\/(.*)\.js$/, replacement: core('$1.ts') },
    ],
  },
  server: { deps: { inline: [/node_modules\/smaltdb\//] } },
  // `npm run bench` runs the scenario benchmarks in bench/ instead of the tests. A test that runs a flow through the
  // engine takes seconds on a busy runner (test/fill-general.test.ts passed vitest's five-second default on CI and
  // failed five pushes in a row): thirty seconds a test, the time docs/HANDOFF.md has always run them with.
  test: {
    include: process.env.SMALTFL_BENCH ? ['bench/**/*.bench.ts'] : process.env.SMALTFL_SLOW ? SLOW : ['test/**/*.test.ts'],
    exclude: process.env.SMALTFL_BENCH || process.env.SMALTFL_SLOW ? [] : SLOW,
    testTimeout: 30000,
    // The test files share each worker's loaded modules (the engine's source above all, which every engine test would
    // otherwise load again): the core keeps no state between calls but caches of pure results, so a file can't see
    // another's. `npm run test:isolated` runs every file in a fresh module graph, to rule that out.
    isolate: !!process.env.SMALTFL_ISOLATE,
    pool: 'threads',
    sequence: { sequencer: LongestFirst },
  },
});
