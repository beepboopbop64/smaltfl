# Ecosystem survey: what smaltfl builds on

- **Status:** research, input to the first design interview ([../OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md))
- **Date:** 2026-11-05

smaltfl is a planned member of the smalt family: data pipelines for smaltdb, built visually and run in the browser,
with an ontology, lineage and ownership attached to the data they produce. Before deciding its architecture, this
survey records what the family already has, the conventions every smalt repository follows, and the gaps smaltfl
would be the first to fill.

## Sources

Every smalt repository by `stenhoor` (his twelfth, an Obsidian plugin, is unrelated), read at these commits (shallow
clones of each default branch, plus the branches named in the text):

| Repository | Branch | Commit | What it is |
| --- | --- | --- | --- |
| `smaltdb` | main | `21a8079` (2026-11-04) | The engine: embedded SQL database for browsers, 0.9.0 preview |
| `smaltql` | main | `dab39f5` (2026-11-04) | SQL as its own language package (README only so far) |
| `smaltdf` | claude/initial-design | `d43c146` (2026-11-03) | The dataframe language |
| `smaltui` | main | `53e4815` (2026-11-03) | The SQL console app |
| `smaltbi` | main | `3562ca6` (2026-11-03) | The BI app: model, report designer, static publishing |
| `smaltkit` | claude/charming-cannon-mcdkqh | `7365edb` (2026-11-03) | Shared UI code ("kits") for the apps |
| `smaltnb` | (empty) | — | Planned notebooks app |
| `smaltdb-io`, `-external`, `-parquet` | main | `8cc96af`, `e5473aa`, `0f74fdd` | The three plugins |
| `smalt-brand` | main | `8ba507c` (2026-11-04) | Brand book, decisions, tokens, logos, the smaltworks.dev site |

Also read: the open issues on smaltdb (#36 plugins and 0.9.0, #46 the plan layer, #81 a performance backlog item).

## 1. The family at a glance

The family is one stack (smaltworks.dev, "How it fits together"): sources at the bottom, one engine, two languages on
it, kits above them, apps on top.

| Layer | Repositories | Who uses it |
| --- | --- | --- |
| Sources and plugins | `smaltdb-io` (CSV/TSV/JSON), `smaltdb-external` (HTTP, S3, Azure, registered files), `smaltdb-parquet` | The engine, loaded through an app-written worker entry |
| Engine | `smaltdb` | Language developers, and apps that use the engine directly |
| Languages | `smaltql` (SQL), `smaltdf` (dataframes) | Developers building their own apps |
| Kits | `smaltkit` | The apps: shared UI code drawn from the brand tokens |
| Applications | `smaltui`, `smaltbi`, `smaltnb` | People who want a complete browser experience |
| Brand | `smalt-brand` | Every repository: assets, tokens, voice |

smaltfl belongs in the applications layer. It would be the first app whose job is to *produce* data for the others
(smaltbi reports, smaltnb notebooks, smaltui queries) instead of only reading it.

## 2. The engine: what smaltdb gives a pipeline app today

smaltdb is TypeScript with no WASM and no runtime dependencies. The engine runs in a dedicated Web Worker, stores data
in OPFS through a write-ahead log, and follows SQLite's dialect. Minimum browsers: Chrome/Edge 108, Firefox 111,
Safari 17. Databases are designed for up to about 1 GB (about 10M rows). Node runs the in-process engine for tests and
tools, but is not a supported target (smaltdb Q-17).

Already built, and directly useful to pipelines:

| Capability | Where | Why it matters for smaltfl |
| --- | --- | --- |
| Materialized views with atomic full refresh | `docs/guide/views-and-materialized-views.md` | A failed refresh keeps the old rows: an output dataset is never half-written |
| Transitive freshness: a write to any table a view reads (directly or through views) marks it stale | `information_schema.materialized_views` (`is_fresh`, `last_refresh`, `last_refresh_error`) | "Rebuild only what is stale", the core of a declarative build, is already tracked by the engine |
| `REFRESH … IF CHANGED`, also revalidating external sources by ETag / Last-Modified | ADR 0011 §3, M8.1 | Incremental runs over files and buckets without re-reading unchanged sources |
| Refresh policies: `refresh_every = <seconds>`, `refresh_on_reconnect = true` | engine worker, checked every second | A seed of scheduling, but only while a tab has the database open; nothing runs on a timer in-process |
| Strict typing: a refresh whose values don't fit a column fails and keeps the old rows | MV guide | Output schemas act as contracts |
| Columnar tables and MVs, spill to OPFS, parallel readers (Chromium) | ADR 0008, 0010 | Analytical transforms at small-data scale |
| `location = 'memory'` objects inside an OPFS database | ADR 0010 | Cheap intermediate datasets that don't wear storage |
| External tables and connections over CSV, JSON, Parquet on HTTP, S3, Azure | ADR 0011 | Pipeline inputs read in place; `read_csv()`, `read_parquet()` |
| Credential providers registered at runtime, bound to endpoint patterns; never in SQL, catalog or file | ADR 0011 §6 | Connections can be shared in a flow file without leaking secrets |
| Multi-tab access through Web Locks leader election | WORKER_MODEL.md | A pipeline running in one tab and smaltbi reading in another can share one database |
| Plugin API v1 (stable): sources, formats, connection types, table functions, methods, asks | ADR 0012, 0013 | New connectors (and possibly smaltfl's own steps) can be plugins |

In progress, and central to smaltfl:

- **The plan layer** (ADR 0014; issue #46). One typed, positional plan of relational operations (`scan`, `filter`,
  `project`, `join`, `aggregate`, `window`, `sort`, `append`, `update`, `delete`, …) that every language targets.
  Steps 1–8 have landed: every SELECT and write goes SQL → plan → physical planner. Step 9, the **public** plan API
  (`db.preparePlan`, `db.queryPlan`, over the worker protocol and in `MethodContext`), has not: at `21a8079` the plan
  types live in `src/engine/plan/` with `PLAN_FORMAT_VERSION = 0`, are not exported from `smaltdb/engine`, and have
  no `origin` field yet. ADR 0015's own steps are moving quickly: 1–4 all merged on 2026-11-04 (the ADR, #77/#78;
  compile from plans, #80; the planner takes plans only, #82; one expression compiler, #83). Next are 5 (plan
  serialization and the validator), 6 (`bind()` and bound statements), 7 (language-neutral catalog storage) and 8
  (the public plan API).
- **The language API** (ADR 0015). SQL moves out to `smaltql`; each language implements
  `SmaltLanguage.bind(source, ctx) → BoundStatement[]`, where a bound query carries its plan and its result columns
  (name, type, declared type, collation). Plan nodes gain an optional `origin` that each language defines (a SQL text
  span, a smaltdf call site) and errors carry. Packages are renamed `@smaltworks/<repository>` just before the first
  publish.
- **Language-neutral catalog storage** (ADR 0015 §6, step 7): a versioned definition per table, index, connection,
  external table and materialized view, as one file format change.

Not built yet, and needed by some pipeline features:

- **No metadata on objects.** No `COMMENT ON`, no tags, no owner. `CREATE TABLE … WITH (…)` accepts only `storage`.
- **No change capture or notifications.** `track_changes`, a hybrid logical clock and `uuid7()` / `ulid()` are
  planned as "sync groundwork" (ADR 0011 §9), with no code yet. Live queries and change notifications are deferred
  (smaltdb Q-15).
- **No incremental view maintenance.** Refresh is a full recomputation (`refresh = 'incremental'` fails).
- **No time travel or dataset versions.** Snapshot isolation exists for readers, but old versions are not kept.
- **No JS user-defined functions** (deferred, smaltdb Q-13; plugin API v1 leaves room for them).

What this means for smaltfl:

- **Column-level lineage comes almost for free once the public plan API lands.** Plan expressions reference input
  columns by position, so walking a bound plan says exactly which input columns each output column depends on. The
  `origin` field can carry a smaltfl node id, so an engine error points back to a node on the canvas.
- **Schema inference at design time** comes from `bind()`: every node's output columns and types are known before
  anything runs, which is what makes a typed visual canvas possible. Until then, a small smaltfl engine plugin can
  read static column types from a prepared statement (section 4).
- **Metadata "attached to the data itself" needs an engine change.** The cheapest moment is ADR 0015 step 7, which
  changes the catalog format anyway. Adding owner, description and tag fields later would be a second format change.

## 3. The applications: smaltui, smaltbi, smaltkit

**How they are built.** No UI framework, chart library or CSS framework: plain DOM, CSS and hand-written SVG, in
strict TypeScript 5.9 built with esbuild. Runtime dependencies are only smaltdb and smaltkit; smaltbi's VISION says
anything else is "first evaluated as a plugin". Colours come from the brand tokens as CSS variables (copied from
smalt-brand; smaltui checks its copy in CI with `sync-brand --check`), with light, dark and auto through
`data-theme`, and each app has its own class prefix (`sbd-`, `sbv-`, `sb-`; smaltkit `sk-`). Icons are inline SVG in
the Chevron style (smaltbi) or Unicode glyphs (smaltui). Both apps deploy to GitHub Pages through Actions, with a
smoke test against the live site.

| | smaltui | smaltbi | smaltkit |
| --- | --- | --- | --- |
| What | SQL console: object explorer, tabbed editors with completion and bind variables, virtualized grid, import, history | Report designer and viewer: data steps, a SQL semantic model, drag-and-drop canvas, themes, static publishing (ZIP, or a CLI) | Shared framework-free code: engine loader, OPFS database list, URL helpers; on `main` also `dom`, `charts` (14 SVG chart types), `table`, `format`, `svg`, `ui.css` |
| Build | No bundling: each `.ts` compiled beside itself, loaded directly | Bundled (`dist/designer.js`, `dist/viewer.js`), smaltdb external | `tsc` to `dist/` with `.d.ts`; output must load without a bundler |
| Tests | Playwright end-to-end only (`test/e2e.mjs`), plus a live-site smoke test | `node --test` unit tests against the real in-process engine, Playwright e2e (also with 4× CPU throttling), a WCAG contrast test | `node --test` |
| Docs | README, CLAUDE.md | README, CLAUDE.md, `docs/` VISION, ARCHITECTURE, REPORT_FORMAT, THEMES, PLUGINS, ROADMAP, OPEN_QUESTIONS, ADRs 0001–0005 | README, CLAUDE.md |

**smaltdb integration.** Both apps pin `smaltdb ^0.8.3` and use the stock worker, vendored at install
(`vendor-smaltdb.mjs`, with `?engine=vendor|npm|<url>` to switch). Neither uses an app worker entry with
`serve({ plugins })`, the plan layer, smaltql or smaltdf yet. smaltui reads `rowMode: 'array'` with streaming and
"fetch more"; smaltbi reads `rowMode: 'columnar'`, inlines values as literals so the SQL shown is the SQL run, and
caches results by SQL text. The dev server (`serve.mjs`) sends COOP/COEP and answers Range requests; GitHub Pages
can't send those headers, so the live sites run without parallel readers or interrupts.

**Documents.** Each app has one human-readable JSON document with a version key: smaltui's environment manifest
(`{ smaltui: 1, database, init, steps, queries, open }`) and smaltbi's report (`*.smaltbi.json`: `{ smaltbi: 1, data,
model, theme, filters, pages, bookmarks }`). Both share one **data-step vocabulary** (smaltbi ADR 0003), so either app
opens the other's data definitions:

```ts
// smaltbi src/core/types.ts
export type DataStep =
  | { sql: string }
  | { sqlFile: string }
  | { import: string; table: string; format?: FileFormat; options?: Record<string, unknown> }
  | { link: string; table: string; format?: FileFormat; options?: Record<string, unknown>; connectionName?: string }
  | { table: string; data: Record<string, unknown>[] }
  | { connection: string; url: string };
```

Documents are saved by download or kept in `localStorage` (smaltbi autosaves with JSON-snapshot undo, `DocStore`).
Credentials are memory-only and never written to a file. Two copies of the data-step code still diverge
(`smaltui/app/env.ts`, `smaltbi/src/data/sources.ts`); a shared module is planned for smaltkit.

**smaltbi's semantic model** has relationships (many-to-one, active or not), SQL measures that compose
(`[Revenue] - [Cost]`), calculated columns, hierarchies, labels, formats, descriptions, folders and a diagram layout.
It is the nearest thing in the family to an ontology.

**smaltbi's principles** (VISION.md), which every app so far shares:
- **Static by default.** "Anything that needs a server (scheduled refresh, shared workspaces, row-level security,
  sign-in) is a plugin or a wrapper environment, never core." PLUGINS.md plans a **Host** plugin kind for these.
- **Capability scales with the user.** Drag-and-drop never hides the SQL; every visual shows the exact SQL it runs.
- **Readable files.** One JSON file that diffs well in git and can be written by hand or by a program.
- **Independence.** smaltdb and shared code only.
- **A concept map** to the tools it is inspired by (Power BI / Tableau → smaltbi), in the VISION.

**Reusable for a canvas.** smaltbi's model view (`src/designer/modelview.ts`) is the only diagram code in the family:
absolutely positioned HTML cards with one SVG overlay of Bézier connectors, pointer dragging with snapping, drawing a
link by dragging between columns, zoom, fit, `autoLayout()`, positions saved as undoable changes. Its graph helpers
(`Model.edges`, `canReach`, `pathCounts`, `joins`, `tablesIn(sql)`) and smaltui's `Editor`, `Grid` and plan-tree
renderer are the other candidates. All are tied to their apps today and would need generalizing.

**Not built anywhere:** a node-and-port graph canvas, DAG execution (topological runs, per-node preview, partial
re-runs), jobs and schedules, lineage, a workspace holding several documents with metadata and ownership, document
coordination across tabs, first-class parameters (only smaltui's bind variables), and any app use of smaltdb 0.9's
plugin worker or the plan layer.

**Headless use of the engine exists as tooling.** smaltbi's publish CLI and its unit tests run the in-process engine
in Node. `smaltdb/engine` exports the `Vfs` interface with `MemoryVfs` and `OpfsVfs` (a file-system VFS exists only in
smaltdb's benchmarks), `@smaltdb/external` reads Node paths, and `@smaltdb/io` exports CSV and JSON. Nothing in the
family writes Parquet.

## 4. The languages and plugins: smaltdf, smaltql, smaltdb-io, -external, -parquet

**smaltdf is design-only today.** Its `main` (PR #6, merged 2026-11-03) removed all code; `src/index.ts` is
`export {};`. Its `CLAUDE.md` opens with "The rule that comes first: **No code in smaltdf generates, compiles to, or
runs SQL.** … This is the owner's explicit directive", and its status says the earlier SQL-compiling version "was
merged and then removed; don't restore any of it". The language arrives after all nine steps of ADR 0014 land. Its
design (`docs/DESIGN.md` on `main`): its own TypeScript DSL inspired by Polars, with its own spec; plans for the shared
layer, never SQL; semantics implemented as functions in the engine's registries; no visuals of its own ("smaltui and,
later, smaltnb are how people use it").

The superseded 0.1 (still the GitHub default branch, `claude/initial-design`) shows what the earlier API looked like:
immutable lazy frames (`scanTable`, `select`, `withColumns`, `filter`, `groupBy().agg()`, `sort`, `join` with seven
kinds, `unique`, `withRowIndex`) and expressions (`col`, `lit`, `when/then/otherwise`, `over`, `str.*`), `explain()`,
`collectSchema()` and `collect()`, with Polars differential tests.

**smaltql** is a README so far: "Small. Alternative. Familiar." The SQL you know, for smaltdb. Two promises: familiar
SQL always works (it may add syntax, never change what working SQL means), and it reaches the engine only through the
public plan API.

**The plugins** (all 0.9.0, API v1, still named `@smaltdb/*`; the `@smaltworks/*` rename comes just before the first
publish):

| | Registers | Client helpers | Dependencies |
| --- | --- | --- | --- |
| `@smaltdb/io` | formats `csv`, `tsv`, `json` (ndjson); `read_csv`, `read_json`; methods `importCSV`, `importJSON`, `exportCSV`, `exportJSON` | `@smaltdb/io/client` | none |
| `@smaltdb/external` | sources `file:`, `http`, `s3://`, `az://`, plain paths (Node); connection types `http`, `s3`, `azure`; methods `registerFile`, `registerCredentials`, `setFetch` | `@smaltdb/external/client` | none (SigV4 and Azure Shared Key on Web Crypto) |
| `@smaltdb/parquet` | format `parquet` with projection and row-group pushdown; `read_parquet` | none | `hyparquet` (exact pin); optional `hyparquet-compressors` |

Every source and format is **read-only**: no write path, no PUT. Exports return CSV or JSON text.

**What a pipeline app can call today, without the plan API:**
- SQL through the client `Database` (`query`, `exec`, `stream`, `prepare`, `transaction`), cancellable with
  `AbortSignal`, with columnar results. `prepare()` gives column names without running.
- **Its own engine plugin** (plugin API v1 is stable). An `addMethod` handler runs inside the worker with the engine
  `Database`: atomic multi-statement steps (as `@smaltdb/io`'s imports do, in one transaction or savepoint), and
  **static column types** (`ctx.query().columnTypes`, engine `Statement.columnTypes`), which the client API doesn't
  expose. `host.ask` can call back to the tab (built for credentials, 30 s timeout; untested for progress).
- Materialized views with refresh policies and `information_schema` as materialization and scheduling primitives.

**Only after ADR 0014 step 9 / ADR 0015:** `preparePlan` / `queryPlan` (in-process, worker protocol,
`MethodContext`), the plan validator, canonical plan JSON and hashing, output schemas per operation, `origin`
provenance, `bind()` and bound statements, `defineWorker({ languages, plugins })`, boolean and date/time types, and
smaltdf itself.

**Not provided anywhere:** progress events (only batches on the consumer side), change notifications or live
queries (post-1.0), write connectors, user-defined functions (post-1.0), and any lineage, DAG or scheduling model.

**The plan layer's shapes** (`src/engine/plan/`, internal, `PLAN_FORMAT_VERSION = 0`): operations keyed by `op`
(`scan`, `source`, `values`, `iterate`/`working`, `filter`, `project`, `limit`, `distinct`, `join`, `setop`, `sort`,
`aggregate`, `window`, `append`, `update`, `delete`), and typed expressions keyed by `k` (`col { input, index, depth,
type }`, `lit`, `param`, `call { fn }`, `cast`, `and`/`or`/`not`, `isNull`, `case`, `subquery`, `inSubquery`). Columns
are referenced by input and position, never by name, which is what makes column lineage a walk over the plan. There
are no node ids, no `origin`, no serialization and no validator yet.

**Conventions for a new library repo** (from smaltdf and the plugins, several files byte-identical across repos):
`.github/workflows/ci.yml` (push and pull_request; `npm ci`, the packed-pin cache, `fetch-packed.mjs`, typecheck, test,
build; a Playwright matrix where browsers matter), `CLAUDE.md` (working rules and issues copied verbatim from
smaltdb's), MIT `LICENSE`, `README.md` (lockup hero, tagline, positioning, status block, Development), `docs/DESIGN.md`
or ADRs, `package.json` (`type: module`, `sideEffects: false`, `engines.node >= 20`, an `exports` map with `types`,
smaltdb as an optional peer pinned to its minor), committed `package-lock.json`, `packed.json`,
`scripts/build.mjs` (esbuild, ESM, every dependency external), `scripts/fetch-packed.mjs`, `tsconfig.json`,
`vitest.config.ts`, `test/helpers/wait.ts`. No Prettier, ESLint or editorconfig. British spelling throughout. An app
follows smaltbi instead (bundled build, `node --test`, Playwright, Pages deploy) and depends on the repository
packages directly with explicit pins (ADR 0015).

## 5. Conventions every smalt repository follows

### Process

- **Design interview first.** Decisions start as numbered questions in `docs/OPEN_QUESTIONS.md` (Q-1, Q-2, …) with a
  proposal and a status. The owner's answers become Architecture Decision Records in `docs/adr/NNNN-title.md`
  (Context / Decision / Consequences, with an "Owner's decisions" section and the alternatives considered). Every
  significant later decision gets a new ADR.
- **Research behind decisions** lives in `docs/research/`, with benchmarks saved as data (`bench/results/*.json`).
- **The owner decides; an orchestrator coordinates.** The owner (`stenhoor`) assigns work through GitHub issues.
  Sessions comment with a plan and use the `in progress`, `needs input` and `blocked` labels. One task per branch and
  PR, `Refs #N` in descriptions, no closing keywords in commits, `Depends on: owner/repo#N` for cross-repo PRs. Every
  session comment ends with the Claude Code footer; the orchestrator's start with `**Orchestrator:**`.
- **A shared `CLAUDE.md`** in each repository: a commands table, working rules for sessions, issues and cross-repo
  impact (smaltdb and smaltui add a repo map; smaltdb adds lessons from CI failures). The four working rules are the
  same everywhere. smaltui dropped its Issues section when
  the owner stopped issue monitoring; smaltbi keeps it and adds: "Every change reaches `main` through a PR. Never
  merge PRs, force-push or change repository settings; the owner does those", and "After pushing, wait for CI on both
  runs (push and pull_request) and fix failures before reporting."
- **Git history:** one branch per session, PRs merged by the owner with merge commits; conflicts resolved by merging
  `main` into the branch, never by rebasing or force-pushing. Commit subjects are imperative and sentence case, with an
  optional scope prefix (`Docs:`, `Brand:`, `e2e:`); bodies explain why.
- **Performance is a feature.** Every engine change runs measured gates (benchmarks compared with saved results,
  performance invariants as tests); any slowdown is reported to the owner with numbers.

### Code and packaging

- TypeScript, ES modules, Node 20+ for development (CI runs Node 22), MIT licence.
- A dependency-free core; optional features in separately published packages, each in its own repository with its own
  licence, lockfile, tests and CI. No vendored third-party code in published bundles.
- Packages publish as `@smaltworks/<repository name>`, released together and pinned to the engine's minor version.
  Until the first publish, `packed.json` + `scripts/fetch-packed.mjs` (the same file in every repository) pin sibling
  packages to commits and install them with `npm install --no-save`.
- Apps load plugins through a worker entry they write (`serve({ plugins })`, and after ADR 0015,
  `defineWorker({ languages, plugins })`), with static imports so bundlers resolve and tree-shake them; no run-time
  module URLs, which break with bundlers and CSP. (The apps themselves load the engine client dynamically from a
  vendored copy, so `?engine=` can switch versions.)

### Testing

- Libraries (smaltdb): Vitest in Node against the in-memory VFS. Apps (smaltbi, smaltkit): `node --test`, with unit
  tests running real SQL on the in-process engine. Both: Playwright browser tests (smaltdb on Chromium, Firefox and
  WebKit, WebKit with a persistent profile for OPFS; smaltbi also under 4× CPU throttling), and apps smoke-test the
  live site after each deploy.
- Differential tests against a reference implementation (SQLite for SQL; Polars for smaltdf), property tests,
  golden corpora reviewed in PRs (plan shapes, generated code), crash injection for storage.
- **Docs examples are tests:** every SQL block in the docs runs, and a Markdown table after it is its expected result.
- **No fixed sleeps:** wait with `until()` / `pause()` helpers.

### Docs

- Libraries: VitePress with the family theme from `smalt-brand/themes/vitepress/` (smaltdb.dev for the engine,
  smaltworks.dev for the family). Apps: a static site on GitHub Pages with a landing page and a live demo.
- An app's README: the product lockup in a `<picture>` switched by colour scheme, the bold tagline, one paragraph on
  what it is, the "Powered by smaltdb" badge, demo links, then features, quick start, layout, brand and licence.
- An app's `docs/` (smaltbi's set): VISION (mandates, principles, 1.0 scope, a concept map to the tools that inspired
  it), ARCHITECTURE, a document-format spec, ROADMAP, OPEN_QUESTIONS and ADRs.

## 6. The brand rules smaltfl inherits

From `smalt-brand/BRAND.md` and `DECISIONS.md`:

- **Name:** lowercase, one word, `sm` + `alt` + suffix. In the wordmark `alt` is smalt (`primary`) and the suffix takes
  the product's text colour: sm**alt**fl. Never "SmaltFL" or "SmaltFlow" in prose (as "never SmaltDB").
- **Tagline:** "Small. Alternative. ___." Taken: Fast (db), Query (ui), Insight (bi), Frames (df), Notebooks (nb),
  Familiar (ql), Together (smaltworks).
- **Positioning line:** short, from the core principles, ending in "for smaltdb" or "powered by smaltdb".
- **Mark:** a smalt body plus one chip in the product colour, drawn in the Chevron style: solid bars of constant
  thickness, square-cut ends, angles of 0°, 45° and 90° only, one chip at most, the same drawing at every size, on a
  64-unit grid (`scripts/brand_assets.py`). Shapes already taken: Grain (db), Chevron `>_` (ui), Scatter (bi), Axes
  (df), Pencil (nb), Star `*` (ql), Together, two interlocking L-shapes (smaltworks).
- **Product colour:** one of smalt's sibling cobalt pigments, checked by CIELAB distance against every product and
  status colour, and by eye. Product colours never mean status.
- **Voice:** say what it is, never what it isn't; no comparisons or fights; no unsourced performance numbers; credit
  the tools that inspired it by name ("inspired by, not against").
- **Assets** (logos, badge, social card, tokens, product page) are generated in `smalt-brand` and copied into the
  product repository, never edited by hand. Each product so far arrived as one `brand/<product>` PR there.
- **The `@smaltworks` scope and names starting with `smalt` are reserved for smaltworks.**

### The colour wheel is nearly full

Measured with the same CIE76 distance as `DECISIONS.md` (this method reproduces its recorded values: smaltql to
`success` 28 / 38, smaltdf to `warning` 15, smaltnb to smaltbi 33 / 34). Distances the family has already accepted:
between two products' hues at least 33 (smaltbi–smaltnb, smaltdf–smaltql); between a product and a status colour as
little as 15 (smaltdf–`warning`). Cobalt teal was ruled out twice, at 38 from smaltui's cerulean, "too close by eye".

| Candidate | Light fill | Nearest (light) | Dark | Nearest (dark) | Fill on `bg` light / dark |
| --- | --- | --- | --- | --- | --- |
| Cobalt teal | `#00786F` | success 25 (smaltui 36) | `#4FD1C5` | success 26 (smaltui 34) | 5.0:1 / 9.6:1 |
| Cobalt teal, blue-leaning | `#006F80` | smaltui 20 | `#4CC9D9` | smaltui 18 | 5.4:1 / 9.1:1 |
| Cobalt teal, green-leaning | `#0A7A60` | success 16 | `#52D6B0` | success 13 | 4.9:1 / 9.9:1 |
| Plum (between violet and magenta) | `#8A3F8F` | smaltnb 23 | `#E09BE3` | smaltbi 17 | 6.1:1 / 8.5:1 |
| Crimson | `#C8102E` | accent 26 | `#FF8C9A` | danger 17 | 5.4:1 / 8.1:1 |

A sweep of the whole wheel at the family's chroma (C ≥ 40, fill ≥ 4.5:1 on `bg`) finds no hue more than about 35 from
every existing colour; the best gaps are a crimson (reads as `danger`) and a muted plum. So smaltfl's colour is an
owner's decision between a close teal, a muted plum, and smalt only (no product colour).

## 7. How the inspirations map onto the family

| Idea | Where it comes from | What the family already has | What smaltfl would add |
| --- | --- | --- | --- |
| Visual workflow of typed tools, data visible at every step | Alteryx Designer; Foundry Pipeline Builder; Databricks Lakeflow Designer | Static column types through an engine plugin today, `bind()` later; smaltbi's pattern of compiling a visual model to readable SQL | The canvas, the tool palette, per-node previews |
| Task DAGs with parameters, retries, schedules | Databricks Workflows (Jobs) | MV refresh policies while a tab is open | A run model: parameters, retries, schedules, run history |
| Declarative datasets the engine keeps fresh | Databricks DLT / Lakeflow Declarative Pipelines; Foundry builds | MVs, transitive `is_fresh`, `REFRESH … IF CHANGED` | Flows that compile to tables and views, and rebuild only what is stale |
| Data quality expectations | DLT expectations; Foundry health checks | Strict typing, constraints, `CHECK` | Row and dataset checks with warn / drop / fail |
| Parameterized notebooks; the executed notebook as the run's record | Papermill | Nothing yet (smaltnb is planned) | Notebook steps once smaltnb exists; a run report per run |
| Ontology: object types, link types, actions over datasets | Palantir Foundry | smaltbi's model (relationships, measures) | Object and link types backed by datasets; maybe a family-wide semantic layer |
| Lineage graph, impact analysis | Foundry Data Lineage; Unity Catalog | Plans with positional column references (internal today); `origin` planned in ADR 0015 | Dataset- and column-level lineage, from plans |
| Ownership, markings that propagate downstream | Foundry markings; Unity Catalog owners and tags | Nothing (no object metadata) | Owners, stewards, classifications and tags that flow through lineage |
| Branches for pipelines and data | Foundry branching; Git | Git for code; no dataset versions | Flows as files in Git; dataset versions per run, if wanted |

## 8. Gaps and tensions to resolve

1. **Browser-first vs scheduled runs.** The family's stance is "nothing to install and nothing to provision", and
   smaltdb's timers run only while a tab has the database open. Workflows and Papermill-style runs usually run on a
   server. A headless runner needs either Node as a supported smaltdb target (an owner's decision in smaltdb) or a
   headless browser. The family's answer so far, in smaltbi: anything that needs a server is "a plugin or a wrapper
   environment, never core".
2. **Small data vs the platforms that inspired it.** Databricks and Foundry are built for large, shared data. The
   family believes "small data deserves good tools". smaltfl can borrow their ideas (ontology, lineage, ownership,
   builds) at the scale of one machine.
3. **Local-first vs governance.** In a browser, the user owns their OPFS. Ownership and markings can be declared,
   propagated and checked, but not enforced, without a server or sync (`smaltdb-sync` is post-1.0).
4. **Timing.** The deepest integration (plans for lineage and schemas) waits for ADR 0014 step 9 / ADR 0015 step 8.
   The canvas, the flow format, the ontology and the run model don't.
5. **Where metadata lives.** In the engine's catalog (needs a smaltdb ADR, best combined with ADR 0015 step 7), in
   smaltfl-owned tables inside the database, or in plain files in Git ("files you can open"), or several of these.
6. **One semantic layer or two.** smaltbi already models relationships and measures; a smaltfl ontology overlaps it.
7. **Outputs beyond the database.** Every plugin source and format is read-only; exports are CSV or JSON text. Writing
   a pipeline's results to files or buckets (or as Parquet) needs a write path that doesn't exist yet.
8. **How visual tools compile.** smaltdf, the language that would build plans from frame operations, is design-only,
   and its first rule forbids SQL. smaltbi, an app, compiles its visual model to readable SQL. smaltfl needs the
   owner's view on which precedent applies to it.
