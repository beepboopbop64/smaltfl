# ADR 0011: Notebooks as the step surface

- **Status:** proposed, 2026-11-09. It records the maintainer's answers of 2026-11-09 (Q-87 to Q-95,
  docs/OPEN_QUESTIONS.md), asked through the question prompt after a survey of smaltnb, smaltdb, smaltdf and smaltts
  as they stand in their checkouts of that day. Nothing in it is built.
- **Date:** 2026-11-09
- **Builds on:** [ADR 0001](0001-initial-decisions.md) §4, §5, §12; [ADR 0004](0004-the-flow-plan.md) (the flow plan,
  which already names notebooks as a surface beside the builder and SQL); [ADR 0007](0007-repository-home.md) (the
  move); [ADR 0009](0009-paused-not-published.md) and [ADR 0010](0010-any-dataset.md) (what a run holds, how a day is
  judged: unchanged by this record).
- **Amends:** ADR 0001 §5 (the step kinds) and ADR 0004 §2 ("notebooks will be a surface beside the builder and SQL":
  they become the surface). ADR 0007 gets its route (§6 below).

## Context

smaltfl was built as its own thing: a flow document of visual steps and SQL steps, translated into the flow plan and
run by smaltfl's plugin in smaltdb's worker (ADR 0004). Meanwhile the family grew the pieces a pipeline product is made
of, in stenhoor's repositories:

- **smaltnb** (reactive notebooks for smaltdb, milestone 1 complete): a `.nb.ts` notebook is a TypeScript module that
  typechecks as written, cut into cells by `cell(name, options)`; `sql` cells build a query through smaltql, `df` cells
  a smaltdf frame, `md` cells text; the dependency graph comes from the names each cell defines and reads
  (`smaltnb/format`, `smaltnb/graph`); the runtime (`createRuntime`) runs headless in Node as well as in a worker; an
  unmarked write is held, and `action()` marks a cell that writes; `export` is a notebook's public API, and importing a
  notebook "evaluates only the needed exports and never runs actions" (its DESIGN decision 14). Planned there:
  `expect` cells, `smaltnb run`, imports between notebooks, `store: 'opfs'`.
- **smaltts** (typed plan and schema operations, a prototype pinned to an older engine): its design names smaltfl as
  "the pipeline product built on smaltts" and plans `flow()` of `migrate`, `load`, `refresh` and `check` steps
  (milestone 7, no code yet); schedules, dependencies, retries, lineage and their UI are left to smaltfl. Its Gate C is
  a conversation with smaltfl about where the seam is.
- **smaltdf** reads and transforms (one SQL statement a frame) and has no write path.
- **smaltdb** 0.9.0 (unreleased): plugin API v1 stable, the plan layer experimental, no hash functions, no change
  notifications. Each repository pins a different commit.

The maintainer's ask: keep what smaltfl does that nothing else in the family does (loads judged against their days, a
day that is off paused until someone decides, the visuals, hashes and the record), and write every step with the
family's pieces, notebooks first, so the pipeline angle is what smaltfl adds and the rest is Steve's.

## Decisions

1. **Notebooks are the only step surface.** (Q-88) A flow is its sources, watches, checks, calendar, ontology, policies
   and `publish` settings, plus the notebooks whose exported cells are its steps. The visual tools (`filter`, `select`,
   `formula`, `join`, `aggregate`) and the `sql` step go away as things a person writes; the examples are rewritten as
   notebooks. A document that names notebooks is **format 4**, and its plan **plan/3**, with its own test vector.
   Format 3 documents keep translating as they do, so every vector pinned so far (plan/1 E10, plan/2 E13, the hold and
   donor tables) stands unmoved; a build that reads format 4 reads format 3 too. The `fill` step and the `expectations`
   step keep their meaning, written as cells (below).
2. **smaltfl's runtime is the only writer in a run.** (Q-89) An exported cell is a read-only query over its inputs. The
   runtime creates each step's version as a typed table named by its key, hashes it, holds or points its name, as today.
   A notebook's `action()` cells never run in a flow run: that follows smaltnb's rule for imports, and a flow run is an
   import of the notebook's exports. What smaltfl cannot hash, hold and verify, it does not publish.
3. **Check cells carry smaltfl's rules.** (Q-90) A check is a cell that calls `check(input, { rules, maxDropped })`
   from `smaltfl/notebook`: the `warn`, `drop` and `fail` rules and `maxDropped` the `expectations` step has today,
   counted by the engine as today, so the plan's expect node and what holds a run (ADR 0009) do not change. The
   maintainer asked for a cell option; smaltnb's parser refuses an option it doesn't know (`cell-options`), so the
   rules are a call it can run as plain TypeScript, read by smaltfl without running it. The shape is offered to
   smaltnb as its `expect` cell.
4. **`sql` and `df` cells from the first slice.** (Q-91) A `sql` cell's statement is the step's plan node, as a SQL
   step's is; a `df` cell's statement is what smaltdf's `explain()` gives for the frame, with the same static types the
   plugin reads from the engine. Both are opaque SQL in the plan until the plan API (ADR 0004 consequences); then both
   become plans without a change to the notebooks. The taxi example mixes the two to prove it.
5. **One folder a flow, several notebooks.** (Q-92) `examples/<flow>/flow.json` names its notebooks by path and the
   hash of their bytes; each notebook holds a stage (the checks, the enrichment, the aggregates), and a later notebook
   reads an earlier one's exports by import. The notebook's hash is in the flow hash (the document), and the cell's
   plan node in its key (the plan), so moving a cell between notebooks or renaming a notebook rebuilds nothing (ADR
   0004 §6).
6. **The app: the canvas stays; a cell opens in smaltnb's editor.** (Q-93) Each notebook is a group of cards on the
   canvas, one a cell, and a card's sheet shows the cell in smaltkit's editor with its preview and the statement the
   engine runs. The day strip, the news, the pause, the decision sheet, runs and policies stay as built (ADR 0008 to
   0010). smaltnb's own page is untouched.
7. **smaltts is the target for publishing; plans until it lands.** (Q-94) Publishing and smaltfl's own tables go
   through smaltdb plans and smaltfl's plugin today; the seam is drawn where smaltts's `flow()` will take over: a
   dataset's publish is a `load` with `swap`, a published name an interface view, the plugin's tables a spec with change
   sets. Gate C is raised with stenhoor before smaltts milestone 7, not after.
8. **Pins.** (Q-95) smaltnb (its format and graph) and smaltkit (smaltty, which the parser needs) are pinned in
   `packed.json` in the first notebook PR, said plainly in its description for stenhoor's review; smaltdb's pin moves
   to the commit smaltnb pins, so one engine serves both. Nothing of smaltnb's is copied into this repository.
9. **The move.** (Q-87) The fork `beepboopbop64/smaltfl_fork` of `stenhoor/smaltfl` is the route ADR 0007 needed:
   Steve's initial commit is the root of this history, so the fork's `main` fast-forwards to it with no merge and no
   hash changed, and the `data` branch goes across as it is. The pull request to `stenhoor/smaltfl` is opened from the
   fork by the maintainer. The handoff's unfinished work (Q-86, the round-3 findings, judge round 4) is parked, listed
   in docs/HANDOFF.md, and taken up after the notebook surface is in.

## Consequences

- **The translator gains a front end and loses none of its back.** `src/core/notebook.ts` parses a notebook with
  smaltnb's format and graph (smaltty passed in, never imported), takes the cells in graph order, and derives the
  steps the document already has (`sql`, `expectations`, `fill`): `expandNotebooks` keeps them on the document, so
  everything that reads steps (the translator, hold, fill, the news, the app) reads them as before, and a stored
  document is complete without a parser. The flow hash covers the notebooks' sources and the derived steps. Keys,
  snapshots, manifests, the record, verify and the audit do not learn what a notebook is: they see plan/3, which
  differs from plan/2 by how its query nodes were written down, not by what they are. A *notebooks* check that
  derives the steps again from the stored sources, with smaltty in the worker, is left for the verify slice.
- **What a cell means** (as built in slice 2, `src/core/notebook.ts`): `source('id')` binds a name to a source;
  `param({...})` is the notebook's parameters and `${params.day}` in SQL the flow's `:day`; a `sql` cell is a `sql`
  step whose `${x}` are its inputs, by id; `check(x, {...})` the `expectations` step; `fill(x, { time, shift })` the
  `fill` step; a `df` cell a `sql` step whose statement the caller's frame compiler gives (§4); an `md` cell the
  description of the step after it; an exported cell a dataset, an unexported one an intermediate; `action()` cells are
  left out; `import { x } from './other.nb.js'` reads another listed notebook's exports. On disk a flow is a folder:
  `flow.json` with `notebooks: ["checks.nb.ts", …]`, loaded by `loadNotebooks` and expanded by `expandNotebooks`.
- **E14, plan/3's vector** (`test/notebook.test.ts`): a format-4 document `v` with one source `auth` (`auth_file`) and
  one notebook `v.nb.ts` (`const auth = source('auth')`, `export const rows = sql\`SELECT * FROM ${auth}\``), no
  parameters: flow hash `314572a5…f36726`; plan
  `{"flow":{"hash":"314572a5…","id":"v"},"nodes":[{"inputs":[],"op":"table","origin":"auth","table":"auth_file"},{"inputs":[0],"names":["auth"],"op":"sql","origin":"rows","sql":"SELECT * FROM auth"}],"outputs":[{"name":"rows","node":1}],"parameters":{},"smaltflPlan":3}`;
  plan/3 hash `724148bc9b4ebafc71d5977ac2e878d94228acef66353c19e93576977b1caf3a`. The sign-ins example in both forms
  (`examples/security-signins.smaltfl.json`, `examples/security-signins/`) gives the same expect node, the same
  publish block and the same rows on a generated day.
- **The example's keys change; its verdicts do not.** An aggregate step rewritten as a `sql` cell is a different plan
  node, so the taxi example's keys and plan hash change with format 4; the days it holds come from the history and the
  story, which the surface does not touch. `test/hold-real.test.ts` and `test/fill-real.test.ts` must give the same
  tables on the format 4 example as on the format 3 one, and the format 3 example stays as the legacy vector, as
  `exampleLegacy()` keeps the format 2 one today.
- **A notebook's own runtime is not the flow's.** smaltnb's `createRuntime` collects results into TEMP tables and runs
  guards and modes; a flow run uses only the parse and the graph, and runs the cells' statements itself. The two agree
  on what a cell computes because both take the statement from the same cell. A later slice may run a notebook in
  smaltnb's runtime for previews, with the flow's inputs bound to the run's versions.
- **Needs from stenhoor's repositories** (ADR 0001 §12, asked, never changed from here): smaltnb's `expect` cell shape
  and a stable `check` option; one shared smaltdb pin; smaltts Gate C and its re-base on 0.9.0 (milestone 1) before
  anything is built on it; smaltdf's `explain()` as a stable way to a frame's statement, or a plan when it has one.
- **The slices**, one PR each in the fork, from `main`:
  1. this record, Q-87 to Q-95, format 4 and plan/3 named, the pins asked for (done with this record's PR, except the
     pins);
  2. `src/core/notebook.ts` and the pins: parse, graph order, exported cells to plan nodes, check cells, the notebook
     hash in the flow hash; plan/3's vector; the sign-ins example as notebooks (`test/notebook.test.ts` on both forms).
     Built 2026-11-09, the `df` hook in place and tested with a stub compiler. **The real compiler waits on a plan
     node:** the smaltdf smaltnb pins (`37555d8`) is the rebuild on plans, whose `frame.plan(db)` gives a smaltdb plan
     statement, not SQL, and smaltfl's plan carries SQL text per node until the plan API lands (ADR 0004). So a df
     cell is translated once the flow plan has a node that carries a smaltdb plan and the runtime appends from it
     (`queryPlan`), the step ADR 0004 already names; until then a df cell in a flow is refused, named. The older
     smaltdf that compiled to SQL (`explain()`) is not used: the notebook page runs the pinned one, and a flow and the
     page must take the statement from the same code;
  3. the taxi example as notebooks (`sql` and `df` cells, the fill step as a cell), the hold and donor tables unmoved;
  4. the app: notebook groups, the cell sheet with smaltkit's editor, everything else as it is;
  5. a headless run (`node scripts/run.mjs --flow DIR --day D`) on the in-process engine, ahead of `smaltnb run`;
  6. the smaltts seam, when its milestone 7 lands: publish through `flow()`, the plugin's tables through specs.
