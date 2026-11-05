# Architecture

> Status: draft. Items marked **[Q-n]** depend on an open question in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md). The
> decisions it builds on are in [ADR 0001](adr/0001-initial-decisions.md); the example it is measured against is
> [SCENARIO.md](SCENARIO.md).

## 1. High-level picture

```
 ┌──────────────────────────────── Browser tab ─────────────────────────────────┐
 │  smaltfl app: canvas · step panels · previews · ontology · runs and lineage │
 │               · policies · sharing                                           │
 │        │ flow documents (JSON)                     ▲ results, manifests      │
 │        ▼                                           │                         │
 │  smaltfl core (no DOM): model · validation · compiler · hashes · lineage     │
 │               · policies · ontology · packages                               │
 │        │ statements and plugin calls, through the smaltdb client             │
 └────────┼─────────────────────────────────────────────────────────────────────┘
          ▼                       MessagePort
 ┌──────────────────────────── Engine worker ───────────────────────────────────┐
 │  smaltdb engine + @smaltdb/external, io, parquet                             │
 │  + the smaltfl runtime plugin: runs steps atomically · hashes data           │
 │    · snapshots inputs · applies policies · records runs and edits            │
 │    · builds encrypted packages                                               │
 └──────────────────────────────────────────────────────────────────────────────┘
   OPFS: the database file · smaltfl-blobs/ (input snapshots and packages, by hash)

 Later: a host runs the same core and runtime headless, on bigger data, and hands back
 aggregates or Parquet files the browser reads in place (section 9).
```

## 2. Components

| Component | Where it runs | Responsibility |
| --- | --- | --- |
| **App** (`src/app/`) | Main thread | The UI: canvas, step configuration, data previews, ontology and action forms, run history and lineage, policy editor, "view as", sharing. Plain DOM, CSS and SVG, with smaltkit; colours and type from the brand tokens |
| **Core** (`src/core/`) | Anywhere: page, worker, Node | Pure TypeScript with no DOM or engine imports. The flow model and its validation, the step compilers, canonical JSON and hashing, lineage, the policy model and its compilation to SQL, the ontology model, the package format |
| **Runtime plugin** (`src/plugin/`) | The engine worker | A `SmaltPlugin` (API v1). Runs a segment of a flow in one transaction, hashes datasets while scanning them in the worker, stores input snapshots, applies actions, builds and opens packages. Data stays in the worker except what the app asks to show |
| **Worker entry** (`src/worker.ts`) | The engine worker | `serve({ plugins: [external, io, parquet, smaltfl] })`, the pattern every smaltdb app with plugins uses (smaltdb ADR 0012) |
| **Storage** | OPFS | The smaltdb database (datasets and smaltfl's own tables), and a content-addressed blob store for snapshots and packages |

The core talks to the engine through a small **runner** interface (`exec`, `query`, `prepare`, `callPlugin`, with an
`AbortSignal`). The smaltdb client implements it in the browser; the in-process engine (`smaltdb/engine`) implements
it in Node for tests, and later for the host. Nothing in the core knows which one it has.

## 3. Design principles

1. **One engine.** Every step runs in smaltdb. smaltfl orchestrates, compiles and checks; it never processes rows
   itself, except to hash, encrypt or import them.
2. **The canvas never hides the code.** Every step shows the exact statement it runs; a visual step can be turned
   into a SQL step.
3. **Hashes all the way through.** Every flow, step, input, dataset, edit and run has a content hash, and every rebuild
   decision is made from them.
4. **Policies on every path.** Reads, actions and shares go through the same policy model. There is no unchecked path,
   even for the owner, so the checks are always exercised.
5. **Readable files.** A flow is one JSON document that diffs in Git and can be written by hand. Credentials are
   never stored; connections name a credential provider, as in smaltdb.
6. **Static by default.** Everything runs in the browser. Anything that needs a server is added around the app, never
   required by it.
7. **Family-native.** smaltdb and smaltkit are the only runtime dependencies; cryptography is WebCrypto. The family's
   conventions for repositories, tests, docs and brand apply.

## 4. The flow document

`*.smaltfl.json`, versioned by its first key:

```json
{
  "smaltfl": 1,
  "id": "flw_…",
  "name": "NYC taxis and weather",
  "parameters": [{ "name": "month", "type": "text", "default": "2024-01" }],
  "sources": [{ "id": "trips", "link": "https://…/yellow_tripdata_{month}.parquet", "format": "parquet" }],
  "steps": [
    { "id": "trips_valid", "kind": "filter", "inputs": ["trips"], "config": { "where": "…" } },
    { "id": "zone_hour", "kind": "aggregate", "inputs": ["trips_enriched"], "config": { "…": "…" },
      "dataset": { "storage": "columnar", "owner": "…", "description": "…", "classification": [] } }
  ],
  "ontology": { "objectTypes": [], "linkTypes": [], "actionTypes": [] },
  "policies": { "principals": [], "rules": [] },
  "layout": { "trips_valid": [240, 80] }
}
```

- **Sources** use the data-step vocabulary smaltui and smaltbi share (`import`, `link`, `sql`, `connection`, …), so
  their definitions read the same way. smaltfl adds parameters and snapshots.
- **Steps** have a stable `id`, which is also the name later steps use for them. Kinds: `sql`, the visual tools
  (`filter`, `select`, `formula`, `join`, `union`, `aggregate`, `sort`, `dedupe`, `sample`), `expectations`, `export`,
  and `flow` (a sub-flow).
- **`dataset`** on a step persists its output, with its metadata: owner, description, classification, expectations.
- **`layout`** and other display-only fields are excluded from the code hash, so moving a box doesn't change a run.

A separate document (`docs/FORMAT.md`, to come) specifies it completely, as smaltbi's REPORT_FORMAT does.

## 5. Compiling and running

**Compiling.** Each step compiles to one `SELECT` over the names of its inputs. The visual tools generate readable SQL
today and plans once the public plan API exists (ADR 0001 §5). The steps between two datasets form a **segment**,
compiled to one statement with the intermediate steps as common table expressions, so the engine plans and fuses
across them.

**Typing.** Before anything runs, the runtime plugin prepares each segment and reads its static column types
(`Statement.columnTypes`), which gives every step on the canvas its schema. With the plan API, `bind()` replaces this.

**Keys.** A step's key is the hash of its kind, its canonical configuration, its inputs' keys, the parameter values it
uses, and the engine and plugin versions. A source's key is the hash of its snapshot. A dataset whose key already has a
stored version is not rebuilt: this is how "only what changed is rebuilt" works, and it covers external inputs.

**Running a segment.**
1. Snapshot any external input not yet stored: fetch it once, hash it, store it under its hash, and register it with
   `@smaltdb/external` as `file:<hash>`, so the run reads exactly those bytes.
2. Create the dataset's new version as a typed table named by its key (`smaltdb` has no `CREATE TABLE … AS SELECT`, so:
   `CREATE TABLE` from the static types, then `INSERT INTO … SELECT`), in one transaction.
3. Hash the new version while scanning it in the worker (section 6), and record it.
4. Point the dataset's name (a view) at the new version. A failure at any step leaves the previous version current.

**Runs** are recorded as manifests (section 6). Cancellation uses the client's `AbortSignal`; progress is reported per
step. Previews run a segment up to the chosen step, with a `LIMIT`.

## 6. Hashes and provenance

| What | Hash of | Notes |
| --- | --- | --- |
| Flow | The canonical JSON of the document, without display fields | Canonical JSON: sorted keys, no insignificant whitespace, numbers in shortest form |
| Step key | Kind, canonical configuration, input keys, parameter values used, engine and plugin versions | Merkle-style: a change upstream changes every key downstream |
| Snapshot | The source's bytes, in 1 MiB chunks, then the chunk hashes | Chunked so large files hash as they stream and parts can be checked alone |
| Dataset version | Its schema, then its rows in canonical order (by its declared key, else by every column), in a canonical binary encoding | Exact: `REAL` values hash by their IEEE-754 bits; `NULL` and each type are tagged |
| Edit | The edit and the previous edit's hash | A hash chain: the action history can't be rewritten unnoticed |
| Run manifest | The flow hash, parameters, versions, step keys, snapshot and dataset hashes, row counts, expectation results, the policy hash, the previous run | Signed when shared (section 7) |

- **Algorithm:** SHA-256 through WebCrypto, available in pages, workers and Node, with no dependency.
- **Verification** has two levels: *check* (signatures, and the hashes of whatever data was shipped) and *re-run*
  (execute the manifest again from its snapshots, with the same engine version, and compare every dataset hash).
  Re-running on an older engine needs that version's worker build; smaltkit's engine loader, which already loads a
  chosen smaltdb version, is the starting point.
- **Determinism:** results that can differ between runs of the same plan are pinned for verified runs: row order
  (canonical order when hashing), floating-point summation order under parallel execution **[Q-34]**, and the current
  time (`now` is a parameter, not a call).
- **Retention:** snapshots and dataset versions are kept within a budget; shared or pinned runs keep theirs **[Q-33]**.
- **In the app** (concept A6 on "smaltfl app concepts"): the Runs view lists the runs with their status, their
  verification, and whether they were shared or pinned. A run shows what ran and why (each step reused, with the same
  key or the same bytes, or rebuilt, with the reason), its expectation results, its verification, and its manifest,
  which can be downloaded, verified again, re-run from its snapshots, or compared with another run **[Q-40]**.

## 7. Enforcement: policies, actions and shares

**The model.**
- *Principals:* people and groups, each with attributes (for example `districts: ['Manhattan']`). Who a person is
  depends on **[Q-31]**.
- *Rules:* a row rule is a predicate over a dataset's columns and the principal's attributes (`pu_borough IN
  :districts`), and can reach its columns through the ontology's links (the District rule is set on `trips`, through
  Zone to District); a column rule allows, removes or masks columns, and removes every column made from them too,
  found through column lineage; an action rule says who may run an action, and on which rows.
- *Resources:* flows, datasets, columns, object types and action types. Rules attach to datasets and are inherited
  downstream through lineage, so a dataset derived from a restricted one is restricted too unless a rule says
  otherwise.
- *Through aggregates:* an aggregated row is visible only when every row behind it is **[Q-41]**. Grouping by a
  rule's column keeps a dataset open (`zone_hour`, by pickup zone, under the District rule); a dataset whose rows mix
  districts is closed to the district leads (`airport_times`), and the app says why and how to open it.

**Where rules are enforced.**

| Path | How |
| --- | --- |
| Reads in the app | Every read of a dataset goes through a policy view for the acting principal: the allowed columns, filtered by the row rules. The owner's view is the same mechanism with the owner's rules. "View as" shows exactly what someone else would see |
| Actions | The runtime checks the action rule and the row scope before writing, and records refusals as well as edits |
| Shares | Rows are split into partitions by the columns the rules use (district, airport zone), and columns into groups by the column rules. Each partition and column group is encrypted with its own key (AES-GCM). Each key is wrapped only for the recipients allowed to read it (ECDH P-256 and HKDF, in the style of HPKE). A recipient's smaltfl can decrypt only what their rules allow |
| A server, later | The same rules, applied by the host before it streams or aggregates |

**The limit, stated plainly.** Whoever holds data in their own browser can read it. Enforcement protects what is
shared and what a server serves, and the in-app checks make sure every flow is built to respect it.

**In the app** (concept A7): the Policies view lists the people, each with their identity card, and the groups; the
row, column and action rules, each showing who it applies to, where it is set and what it reaches; who sees what, by
district; and a preview as one person, with what their share would hold (the partitions and column groups whose
keys are wrapped for them) and the last run's policy checks **[Q-40]**.

## 8. Ontology and actions

- **Object types** are backed by a dataset: a key, a title, typed properties with descriptions and classifications.
- **Link types** connect object types by key, with a cardinality (one-to-many, or many-to-many through a dataset).
- **Action types** have parameters, validation rules, an action rule (section 7) and effects: create, update or
  delete objects, or set properties. Effects are written as rows of an append-only edits table (hash-chained, section
  6). An object is its backing row with its edits applied.
- **Edits are inputs.** A flow can read an action's edits like any dataset: the scenario's *Exclude trips* edits feed
  `trips_clean`.
- **Where they live:** the types in the flow document; the edits, refusals and audit log in the database.
- **In the app** (concepts A4 and A5 on "smaltfl app concepts"): the ontology map shows the object types, each with
  the dataset behind it; named links, each pointing from the many side to the one; and actions attached to the types
  they edit. A selected type shows its key, title, properties, links, actions and policy. Browsing a type's objects
  goes through the same policies, so "View as" shows exactly what a recipient would see. An action's form shows its
  permission check before anything is submitted.

## 9. Toward a server

The same core and runtime run headless: in Node with the in-process engine (smaltbi's publish CLI already runs
smaltdb this way), or in a host service. A flow is pushed to the host, scheduled there, run on a bigger tier, and
returns either:
- **aggregated:** a dataset small enough for the browser, delivered as a package; or
- **streamed:** Parquet files the host writes and the browser reads in place as external tables, with smaltdb's
  projection and row-group pushdown. No new protocol is needed.

The host enforces the same policies, and its runs produce the same manifests. Nothing in v1 depends on it.

## 10. Process and threading

- The engine worker owns the database (smaltdb's model: one engine worker per database, leader election across tabs).
  smaltfl's runtime plugin runs inside it, so runs, hashing and encryption happen next to the data.
- Hashing and encryption use WebCrypto inside the engine worker, never on the main thread. Large datasets are hashed
  in chunks as the cursor streams them (`Statement.cursor()`).
- The app never blocks on a run: it subscribes to per-step progress and can cancel.

## 11. Module layout

One repository, one package (`@smaltworks/smaltfl`, when it publishes), with subpath exports for the core and the
plugin, and the app built as a static site.

```
src/
  core/       flow model, validation, compiler, hashes, lineage, policies, ontology, packages
  plugin/     the runtime plugin (engine worker)
  worker.ts   the app's worker entry
  app/        the UI
test/         node --test unit tests on the in-process engine; Playwright end-to-end tests
bench/        scenario benchmarks (SCENARIO.md §7); results in bench/results/
fixtures/     tier XS data with its hashes
docs/         this file, SCENARIO, FORMAT, OPEN_QUESTIONS, adr/, research/, brand/
```

## 12. Key external constraints

| Constraint | Impact |
| --- | --- |
| smaltdb has no `CREATE TABLE … AS SELECT` | Dataset versions are created from their static types, then filled with `INSERT … SELECT` |
| SQL has no hash functions; the client API exposes no static types | Hashing and typing happen in the runtime plugin, inside the worker |
| The public plan API isn't there yet (smaltdb ADR 0015, step 8) | SQL today; column-level lineage and engine errors that point at a step (`origin`) come with it |
| Every plugin source and format is read-only | Exports and packages are written by smaltfl; the data inside a package is CSV or JSON until there is a binary format |
| Timers run only while a tab has the database open | No schedules in v1 (ADR 0001 §3) |
| WebCrypto keys can be kept non-extractable in IndexedDB | A person's private keys never leave their browser |

## 13. The builder

The app's main screen ([ADR 0002](adr/0002-second-round-decisions.md) §4), in the spirit of Foundry's Pipeline
Builder and drawn in the family's look. The first concepts are on the design canvas "smaltfl app concepts" **[Q-38]**.

- **An open canvas.** Steps are cards placed anywhere on a grid, joined by arrows from their inputs, with no fixed
  lanes: a flow grows in any direction. **Groups** hold any number of steps, can be named, resized and nested, and
  collapse into one card. A card shows its kind and its name; datasets take the product colour. Edits written by
  actions flow back into the flow as dashed arrows.
- **Moving around:** zoom, fit, tidy (automatic layout), and a map of the whole flow with the visible part outlined.
  Steps are added from the palette (anywhere, or into a group) or with + on a step.
- **The palette,** on the left: sources, the visual tools, SQL, expectations, outputs, and ontology types.
- **Properties,** on the right, for the selected step: its inputs, whether it is stored or runs inside a later
  step's query, the policy it inherits, its column lineage and its step key.
- **The data panel,** under the graph: preview, schema, SQL, lineage and runs for the selected step.
- **Opening a step** shows its sub-steps in order, the settings of the selected one, the SQL it runs ("Edit as SQL"
  turns it into a SQL step), the data after it, and the output schema with where each column came from.
- **The top bar:** parameters, "View as" (the flow as one principal's policies allow them to see it), Share, Run, and
  whether every dataset is fresh. Its views: Flow, Ontology (section 8), Runs (section 6) and Policies (section 7).
- **How it is built:** DOM, CSS and SVG. The graph generalises smaltbi's model view: cards placed on a board, with one
  SVG layer for the connectors.
