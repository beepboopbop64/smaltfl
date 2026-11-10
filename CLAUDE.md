# CLAUDE.md

This repository is smaltfl, said "smalt-flow": data pipelines for [smaltdb](https://github.com/stenhoor/smaltdb),
built visually and run in the browser, with an ontology, actions, policies and content hashes attached to what they
produce. It is a shared project in the smalt family: the maintainers decide together, in ADRs ([docs/adr/](docs/adr/)),
from the design interview in [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md). Several Claude Code sessions may work on
the smalt repos in parallel and cannot see each other: this file is the shared starting point, and its working rules
match smaltdb's `CLAUDE.md`.

## Commands

| Command | What it does | When |
|---|---|---|
| `npm ci && npm run deps` | Installs dependencies, then the pinned smaltdb, smaltnb and smaltkit builds in `packed.json` | First, and again after every `npm ci` or `npm install` |
| `npm run check` | `npm run typecheck` then `npm test` (vitest, under a minute on four cores) | Before every commit |
| `npm run test:slow` | The month-long engine runs `npm test` leaves out (`SLOW` in `vitest.config.ts`: `test/estate-flow.test.ts`, about 90 s). CI runs it, and `npm run test:isolated` (every file in a fresh module graph), in a job beside `test` | Changes to the runtime, the gates or the estate |
| `npm run build` | `dist/`: the core (`index.js`), the runtime plugin (`plugin/index.js`) and their declarations | Packaging checks |
| `npm run bench` | The scenario benchmarks in `bench/`, written to `bench/results/node.json` | Changes that could affect speed |
| `npm run build:app` | The app in `dist/app` on `examples/nyc-taxis-weather/` (its notebooks expanded, shipped as `data/flow.json`), with the `data` branch's daily loads if fetched (else the XS fixtures); `-- --flow examples/security-signins/flow.json --out dist/app-signins` for the sign-ins (its generator's `--demo` days from the data list's `generateArgs`). Bundles are named by content (`bundles.json`) | Changes to `src/app` |

## Layout

- `src/core/`: pure TypeScript, no DOM or engine imports. `document.ts`: the flow document, what people write.
  `plan.ts`: its translation into the flow plan, what the machine runs. `optimize.ts`: what runs, and what is stored
  or folded. `emit.ts`: the flow plan as engine SQL, the only module that knows what the engine accepts. `keys.ts`,
  `canonical.ts`, `hash.ts`, `sha256.ts`, `sqltext.ts`; `manifest.ts`: run manifests, identity cards, signatures;
  `protocol.ts`: what the core and the plugin say to each other.
- `src/plugin/`: the runtime plugin (smaltdb plugin API v1). `runtime.ts` runs a plan, `verify.ts` verifies a run,
  `dataset-hash.ts` hashes datasets in the engine, `store.ts` keeps smaltfl's own tables.
- `src/index.ts`: the core's exports, and `runFlow` / `verifyRun`.
- `test/`: vitest on the in-process engine. `fixtures/taxi.ts` is the seeded stand-in for the scenario's data and the
  reference flow; `fixtures/reference.ts` computes the same flow in plain JavaScript to check results against;
  `worker-protocol.test.ts` runs through the smaltdb client and engine server, the path a page takes.
- `bench/`: the scenario benchmarks (docs/SCENARIO.md §7).
- `src/app/`: the app. `main.ts` (plain DOM and SVG), `engine.ts` (smaltdb in a worker, `worker.ts`, or in the page,
  `inline.ts`), `layout.ts` (where cards sit), `page.html` (the page's content). `npm run build:app` writes `dist/app`.
- `examples/`: flow documents and their sources; `fixtures/xs/`: real tier XS data for the tests.
- `scripts/data/build.py` and `.github/workflows/data.yml`: the scenario's data, fetched on a GitHub runner into the
  `data` branch (`git fetch origin data --depth 1`); `scripts/data/history.ts` measures the history's days there, on
  the runtime (`node scripts/data/history.mjs --flow DOC --watch SOURCE --files LIST.json OUT.json`, or `DAYS_DIR
  OUT.json` for the taxi example).
- The day's news (ADR 0008): `src/core/news.ts` finds what is out of the ordinary, `src/core/story.ts` tells it as one
  cause with what follows from it, `src/app/viz.ts` draws it (SVG strings, tested in Node). Words at a glance are
  budgeted (`glanceStrings`, `wordsIn`); a new kind of finding gets its visual there too.
- Integrity (ADR 0006): `src/core/integrity.ts` (a data file against the list), `src/app/fetch-checked.ts`,
  `src/plugin/pinned.ts` (files hashed and served in the engine), run/1 in `src/core/manifest.ts`, verify's levels in
  `src/plugin/verify.ts`, the record (`src/core/log.ts`, RFC 9162; `src/app/record.ts`, IndexedDB), the audit bag
  (`src/core/bag.ts`, `src/core/zip.ts`) and its offline check (`src/core/audit.ts`, `node scripts/audit.mjs check
  BAG.zip`). A new hash encoding goes in an ADR first, with test vectors.
- A day that is off is paused, not published (ADR 0009): the document's `publish` block (format 2, plan/1);
  `src/core/hold.ts` says what holds a run (its checks, the story's claim), what waits, and what the record decided;
  `src/plugin/runtime.ts` holds instead of throwing and `src/plugin/release.ts` publishes a held run as a recorded
  decision says; verify's *held* check and `src/core/audit.ts` check both; `src/core/decision.ts` and
  `src/app/viz.ts` `decisionRow` draw and word the decision. The days `wrong` and `short` hold on the history are a
  test vector (`test/hold-real.test.ts`): a story change that moves them is a decision, not a fix.
- Filling a paused day (ADR 0009 amendment 1): the `fill` step marks every row with `filled_from`; `src/core/fill.ts`
  says what is missing, the donor and the derived document; `src/app/fills.ts` pins a donor and stages the derived
  run; the plugin releases it (`stage`, `release.ts`) and withdraws it (Q-61). ◧ filled, ◐ the part alone, stipple for
  another day's rows inside the day (`viz.ts`). The donor table (`test/fill-real.test.ts`) is a test vector too.
- Any dataset (ADR 0010): `src/core/calendar.ts` takes the flow's calendar (`us-nyc/1`, `us/1`, `none`); format 3 and
  plan/2 say how a watched source is judged (`WatchDef`, `WatchPlan`); `judgeOf` and `flowNames` (news.ts) read the
  watch's settings, the ontology's marks (`bad`, `newValues`, `after`) and its nouns; a day with nothing to compare
  against is `unlearned` (◌, published, marked). `test/fixtures/security.ts` is the sign-in log every phase asserts on
  (`test/security.test.ts`). No new string on screen writes "trips": counts go through `names.noun`. Phase 2: a load's
  measures (`src/core/measures.ts`, the plugin's `measure`), smaltfl-history/3 with a tail appended from each run, and
  claim/2 under plan/2 (`loadClaim`); `scripts/data/history.ts` builds any flow's history (`--flow DOC --watch SOURCE
  --files LIST.json`); sources are bound by id (`examples/<flow>.data.json`, loads.json format 2, `src/app/datalist.ts`);
  `npm run build:app -- --flow examples/security-signins.smaltfl.json` builds the app on the generated sign-ins.
  Phase 3: the calendar's own `days`, `windows` and `dates` (`recurringOf`, `occurrencesBefore`; normal.ts's
  occurrences' guess), the patterns `none` and `monthly`, breaks from accepted levels, the echo fix and `relearn`
  (off unless a watch asks) in `normal.ts`; `rangesFor(doc, source)` (hold.ts) is what a flow's ranges are made with.
  The taxi example is format 3 (Election Day; 25 days under `wrong`; `exampleLegacy()` in `test/helpers/example.ts`
  is its legacy form, 28 days), and `test/backtest-real.test.ts` (`SMALTFL_REAL=all`) prints the variants. Accept the
  new level (`accept`, Q-57): `fill.ts` `acceptable`/`levelMetrics`/`levelWays`, `hold.ts` `levelsOf`/`levelFor`, a
  decide entry's `level`, a claim's `levels`, the step mark `g-level` in `viz.ts`. Phase 4: a watch's `every` (a slot of a
  day, `slotOf`, `partsOf` in calendar.ts; `slotSeries` in history.ts judges a slot from the same slot of each day);
  several watched sources hold, decide and release by load (`Load`, `loadsOf`, `carry`, `decisionForLoad`,
  `standingForLoad` in hold.ts; a release's `loads`); variant E of the sign-in log (`edrHistory`, `twoSourceDoc`) and
  `test/several.test.ts` through the engine.
- Notebooks as the step surface (ADR 0011): a format-4 document's steps are its smaltnb notebooks' cells.
  `src/core/notebook.ts` derives them (`loadNotebooks`, `expandNotebooks`, `stepsOfNotebooks`) with smaltnb's parser
  and graph on smaltty (`smaltkit/typescript`, passed in); `src/notebook.ts` is `smaltfl/notebook`, what a notebook
  imports (`source`, `check`, `fill`); its plan is plan/3 (E14, `test/notebook.test.ts`). A flow is a folder:
  `examples/security-signins/` and `examples/nyc-taxis-weather/` (`flow.json` and `*.nb.ts`, typechecked with the
  repository; `test/notebook-taxi.test.ts` holds them to the JSON forms, which the real-history tests still read).
  `scripts/flow.ts` reads either form from disk for the app build and the history builder. On the canvas a notebook
  is a box (a section folded, `notebookSectionId`), and tapping it opens the notebook read top to bottom
  (`renderNotebookSheet`, `notebookElements`), each cell a tap from its own sheet; `cells`, `groups` and `outline` are
  the display fields `expandNotebooks` fills for it. `packed.json` pins smaltnb and smaltkit beside smaltdb.
- The brief (ADR 0012 §1, §2): `src/core/brief.ts` orders a day's facts in SBAR order (`briefOf`, `briefText`, the
  glance budget `briefWords`, `briefBanned`); `briefSections` in `src/app/main.ts` puts it in the input card's News on
  a day with something to say (status, the sentence, impact, cause, the fix with a tap to propose another, copy as
  text, image or link; `#brief-YYYY-MM-DD` opens a day's). `tools/judges/two-minute.md` is the test it is judged by.
- Checks nobody wrote (ADR 0013): a history keeps each pair's cells day by day while they are few (`PAIR_CELLS`,
  `measures.ts`); `src/core/combos.ts` judges every pair's association against its own history (`comboNews`, the
  `combo` metric: a cell's log odds ratio, `history.ts`) and the day as a whole against the days before by the
  isolation forest (`unlikeNews`); kinds `combo` and `unlike` are findings of the values cell. A `publish.watch` may name
  a published step (its claim told in the engine from `RunContext.tell`, `src/plugin/tell.ts`; its history built by
  `scripts/data/history.ts --watch <step>` running the flow on each day's files). `examples/controls/` is the controls
  posture (six daily control sources, the posture joined and watched, five planted days; `test/fixtures/controls.ts`,
  `scripts/data/controls.ts`, `test/controls.test.ts`; `test/controls-anyday.test.ts` plants the fixture's `Trouble`
  on other days and another seed through `test/helpers/controls-world.ts`); `npm run build:app -- --flow examples/controls/flow.json --out
  dist/app-controls` builds it; loads.json may list several daily sources (read as days) and name the dataset the
  views follow (`judged`). `examples/control-estate/` is the richer dataset (ADR 0013 §8: a typed inventory, twelve
  controls by applicability, five on SLA dates, three layers of planted days; `test/fixtures/estate.ts`,
  `scripts/data/estate.ts`, `test/estate.test.ts` asserts the data's facts; `test/estate-flow.test.ts` runs its March
  through the engine, `test/helpers/estate-world.ts`, against ADR 0014's answer key).
- Gates (ADR 0014): `src/core/gates.ts` is the vocabulary (`CHECK_NAMES`, written or learned, `LAYER_DEFAULTS`),
  `gate()` in `src/notebook.ts` the cell (`notebook.ts` derives `doc.gates`, the cell kept as `cells["gate:<node>"]`,
  outline kind `gate`), plan/4 a watch's `checks` (every check's mode, filled in from its layer; only a flow that
  declares a gate is plan/4, every other plan hashes as before), `JudgeSettings.checks` what `newsOf` applies
  (`checkOf` maps a finding's kind to its check, `gated` caps a learned check at warn, drops an off one, never softens
  a bad value; `Finding.check`). The app: the layer on the card's label, a read-only **Checks** tab (`checksTab`,
  `loadFindings` tells another watched load's own news from its base and tail). Slice 2: the ontology's `expect`
  bands and `due` marks (`ontology.ts`, plan/4's watch `expect`/`due`), the `band` finding (a value with a band is
  judged by it alone), the due counts in measures and the history (`Measures.due`, `HistoryFile.due`, only with a
  mark), the `due` finding from yesterday's cohort against the pooled cohort share (`lateAt`, `lateUsual`), Accept
  the new band (`levelOf`'s `band`, `applyBand` in the app). Slice 3: a gate's `scope` and `needs` rules (`ScopeRule`,
  `NeedsRule`; the notebook resolves the datasets they name), counted in the engine (`emitScopeCounts`,
  `emitNeedsCounts`, `Measures.gate`, `HistoryFile.gate`), the `scope` and `needs` findings, and upstream attribution
  (`StoryOptions.upstream`: a step's finding about a source's column follows the source; a wrong source explains the
  step's day). Slice 4: the kept sample (`src/core/apart.ts` `SampleFile`, `keepSample`, `appendSample`; the plugin's
  `sample` op and `sampleLoad`; the builder's `--sample`, loads.json `samples`, the app's `samples`/`keptRows`;
  `RunResult.kept`) and the classifier (`tellApart`, `likeDays`, the `apart` finding, check `classifier`). Slice 5:
  the `reconcile` rule (`ReconcileRule`, `emitReconcileCounts`; a measure on a watched node, `Measures.gate.reconcile`;
  on a gold node plan/4's `publish.gates`, counted by the run into `ManifestNode.gate`, held by `holdsOf` with
  `reconcileSaid`, counted again by verify's `gate` check) and the seal (the app's `sealOfRun`/`sealIfReady`: the
  owner's signature on a run whose gates passed or whose holds were decided and published; `sealPart` on a gold
  card's Checks tab). Slice 6: toggles that write the gate cell (`src/core/gatecell.ts` `toggleCheck`,
  `rewriteGateCall`, `withGateImport`; the app's `setCheck`, `recordFlowChange`) and feedback reasons as decisions
  (`feedbackPart`). Slice 7: a refused file as the schema check's hold in a gated flow (`runPlan` records the source
  as `refused` and builds nothing; `holdsOf`/`refusedSaid`; verify and release know a run that built nothing).
- The bronze layer (ADR 0015): the ontology's `rows` says what a dataset's rows are (`RowsDef`, `rowsOf`,
  `conditionOf` in `ontology.ts`: one row an object of a type, for the objects a condition given as data selects;
  validated in `document.ts`, a gate's written check). `writtenRules` (`gates.ts`) gives a node's scope, dependencies
  and key, the gate cell's own first and the ontology's otherwise, read by the plan (`rulesOf`) and the judge
  (`judgeOf`); `emitMatch` (`emit.ts`) writes the condition, so plan/4's scope keeps its four fields. Bronze holds on
  `reconcile` by default; the story leads an all but empty file with the amount (the scope's missing keys follow) and
  a file with its rows twice with its key (the amount follows where the repeats account for the rise); rows with no
  key lead by the key where the scope reads the same column (`JudgeSettings.scopeKey`). An entry on a dataset nothing
  watches is taken and gives no rule. The estate declares `application` and one `rows` entry a control
  (`test/rows.test.ts`, with a tied watched step run through the engine; `test/estate.test.ts` holds the entries to
  the generator; `test/estate-flow.test.ts`, whose world keeps each day's `measures` and `ranges`); the Ontology page
  reads a type whose objects are a source from the run's file (`renderOntology`). Amendment 1, piece (a): the
  Ontology page is laid out by file, showing today's rules with nothing edited and no hash moved
  (`src/core/ontologypage.ts` `ontologyPage`: a section a source with its own rules, a card a column with its rules
  in words, each rule with an id, a kind and how it came to be, `discovered` empty; the app's `renderFiles` and
  `fileSection` draw a column with the Columns tab's `columnShape`; `test/ontologypage.test.ts`; `estate.json`'s
  ontology stops). A file's rule about a column is listed on that column's card too (`Rule.columns`,
  `ColumnCard.fileRules`), a rule nothing judges says why (`Rule.unchecked`: its check off, a band or a due date
  checked in its place), and a file the run read nothing of has the columns its data list declares (`fileView`). Names
  and labels (piece b, first stage): a label is shown only where it says more than the thing (`saysMore`,
  `meaningBeyond`; `ColumnCard.standFor`, `asWritten`; the app's `labelFor`, one label a bar); the owner renames a
  column, rewords its meaning and labels its values on its card (`columnForm`), written as the file's own property
  (`nameColumn`, `src/core/flowedit.ts`); the edited document is kept across a reload by the shipped flow's hash
  (`keptOf`, `restoreKept`; `saveFlow`, `loadFlow`), every edit recorded at once with its reason (`flowEdited`: a
  rename, a toggle, an accepted band via `applyBand`), listed above the files with **Back to the flow as shipped**
  (`asShipped`, `backToShipped`); `test/flowedit.test.ts`, `estate.json`'s `names-` stops.
- `tools/`: not part of the package or the tests. `tools/browser/` drives the built app at phone size (`tour.cjs`
  with stop sets and `expect` checks, the episode and integrity suites, colour-blind and slicing helpers);
  `tools/judges/` holds the Workflow scripts that judged the views in rounds (tools/README.md).
- **State of the work:** [docs/HANDOFF.md](docs/HANDOFF.md) says what is built, how to check it and what is left, in
  priority order. Read it before starting. **What comes next:** [ADR 0011](docs/adr/0011-notebooks-as-the-step-surface.md),
  notebooks (smaltnb's `.nb.ts`) as the only step surface, in slices; its §"The slices" is the order of work. Then
  [ADR 0012](docs/adr/0012-visual-first-in-two-minutes.md): the brief and the incident page first, then the drill by
  the biggest driver, then the phone canvas read sideways, then the notebook as a page behind the visuals.
  [ADR 0013](docs/adr/0013-discovered-checks.md) adds the combination and forest judges and the watched step, built on
  the controls example; its Q-104 to Q-109 are the maintainers' to confirm. **Now:** [ADR 0014](docs/adr/0014-gates.md),
  gates (bronze, silver, gold checks as a `gate()` cell in the notebook, written bands and due marks in the ontology,
  scope and dependency rules, the classifier on a kept sample, a sealed gold), in its seven slices, judged against the
  control estate's answer key (its §"The answer key"); all seven slices are built (its §"As built").

## Rules for this repository

- People say what, the machine decides how ([ADR 0004](docs/adr/0004-the-flow-plan.md)). The document is the readable
  source of truth; the flow plan is derived from it and never edited by hand. Keys hash the plan, not the document:
  names, origins and display fields stay out of keys.
- Only `emit.ts` knows the engine's language. Everything else reaches the engine through the flow plan.
- Hashes are exact: canonical JSON (RFC 8785) tagged by kind, and dataset content as `dataset-hash.ts` defines it.
  Changing an encoding changes every hash: change its tag's version and record it in an ADR.
- Correctness, enforcement and verification come before speed (docs/SCENARIO.md §7). A faster version that weakens a
  check is rejected.
- The plugin imports only types from `smaltdb/engine`. No runtime dependencies; cryptography is WebCrypto, plus
  `src/core/sha256.ts` for per-row hashes, which its tests check against WebCrypto.
- A change smaltfl needs in smaltdb or another smalt repository is discussed with stenhoor first (ADR 0001 §12).
- Don't reformat files with Prettier. No fixed sleeps in tests. Probe tests (`test/zz-*.test.ts`) are scratch files:
  delete them, never commit them.

## Before the first publish

smaltdb 0.9.0 is not on npm yet. `packed.json` pins it to a commit (the one its plugins are tested against);
`scripts/fetch-packed.mjs`, identical in all smalt repositories, builds that commit, packs it and installs the tarball
with `npm install --no-save`, so it never reaches `package.json` or the lockfile. To try an unmerged smaltdb change,
run `node scripts/fetch-packed.mjs --local smaltdb=../smaltdb`.

Tests run smaltdb from the source in its packed build (`node_modules/smaltdb/src`), and may import its internals as
`smaltdb-src/...` (the engine server and worker protocol). `npm run build` checks the declarations against smaltdb's
published types.

## Working rules for sessions

- One task per branch and PR. Do not add unrelated work to an open PR: it holds up everything else in it.
- Mark unfinished work clearly, and open a PR only when CI passes.
- Read review comments on your PR and answer them with commits that say what they address.
- When a PR depends on another repo's PR, add a line such as `Depends on: stenhoor/smaltdb#12`.

## Issues

The maintainers (`beepboopbop64` and `stenhoor`) assign work by opening issues on this repository. Sessions don't
monitor issues: a session works on an issue when a maintainer points it to one, and handles it in the issue itself:

- **Who wrote it:** every session comment ends with the footer `_Generated by [Claude Code](https://claude.ai/code)_`.
  A comment without the footer is a maintainer's.
- **Pick it up:** comment with the plan.
- **A decision only the maintainers can make:** ask once in the issue, and record the answer in
  docs/OPEN_QUESTIONS.md and an ADR.
- **Can't proceed** (missing access, waiting on another repo): say exactly what is blocking.
- **Work:** one task per PR, with `Refs #N` in its description and no closing keywords in commit messages. Comment on
  the issue with the PR link and what was and wasn't tested.
- **Close:** only after the fix is merged and verified, with the evidence.
- Issues from anyone else are reported to the maintainers, not acted on.

## Cross-repo impact

- smaltfl uses smaltdb's public or pinned APIs and its plugin API v1, and changes nothing in other smalt repositories
  without stenhoor (ADR 0001 §12).
- When smaltdb's public plan API lands (its ADR 0015, step 8), `emit.ts` gains a plan emitter and SQL steps are bound
  through smaltql; the document, the plan's other parts and the screens should not need to change (ADR 0004).
- Brand assets and voice come from `stenhoor/smalt-brand`, through the fork `beepboopbop64/smalt-brand` (ADR 0002 §7).
