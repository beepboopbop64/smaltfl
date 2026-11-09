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
| **Core** (`src/core/`) | Anywhere: page, worker, Node | Pure TypeScript with no DOM or engine imports. The flow model and its validation, the translation to the flow plan, the optimizer and the emitters, canonical JSON and hashing, lineage, the policy model and its compilation to SQL, the ontology model, the package format |
| **Runtime plugin** (`src/plugin/`) | The engine worker | A `SmaltPlugin` (API v1). Runs a segment of a flow in one transaction, hashes datasets while scanning them in the worker, stores input snapshots, applies actions, builds and opens packages. Data stays in the worker except what the app asks to show |
| **Worker entry** (`src/worker.ts`) | The engine worker | `serve({ plugins: [external, io, parquet, smaltfl] })`, the pattern every smaltdb app with plugins uses (smaltdb ADR 0012) |
| **Storage** | OPFS | The smaltdb database (datasets and smaltfl's own tables), and a content-addressed blob store for snapshots and packages |

The core talks to the engine through a small **runner** interface (`exec`, `query`, `prepare`, `callPlugin`, with an
`AbortSignal`). The smaltdb client implements it in the browser; the in-process engine (`smaltdb/engine`) implements
it in Node for tests, and later for the host. Nothing in the core knows which one it has.

## 3. Design principles

1. **One engine.** Every step runs in smaltdb. smaltfl orchestrates, compiles and checks; it never processes rows
   itself, except to hash, encrypt or import them.
2. **The canvas never hides the logic.** Every step shows what it computes as SQL, and a visual step can be turned
   into a SQL step. What the engine actually ran is one click away (Explain).
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
8. **People say what, the machine decides how** ([ADR 0004](adr/0004-the-flow-plan.md)). The document holds what a
   flow computes, readable by people; the flow plan decides how it runs, and may change freely as long as the
   output hashes don't.

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

## 5. From the document to the engine

[ADR 0004](adr/0004-the-flow-plan.md): the document is for people, the flow plan is for the machine.

```
flow document ── translate ──▶ flow plan ── type, key, optimize ──▶ segments ── emit ──▶ smaltdb
(canvas, SQL,                  (complete, canonical,                (stored or folded)    (SQL today,
 later notebooks)               hashed)                                                     plans later)
```

**Translating.** A pure, deterministic function in the core turns the document into the flow plan: each step becomes
one or more plan nodes, references by name become references to nodes, parameters are filled in, and display fields
are dropped. The nodes:
- `snapshot`: an input, pinned by its content hash when a run first reads it;
- `query`: a relational step over its inputs. Today it is a SQL statement, written in a SQL step or generated from a
  visual tool; with the public plan API it is a smaltdb plan;
- `expect`: row expectations (warn, drop, fail) and dataset checks, with the counts the run reports.

The flow's **outputs** name the nodes stored as datasets. Reads for a principal and shares add policy nodes
(section 7).

**Typing.** The runtime plugin prepares each query node in the engine and records its output columns and their static
types (`Statement.columnTypes`), so the plan is complete before anything runs and every step on the canvas has its
schema. The same check refuses a statement that writes, reads external data, names two columns alike, or reads a table
or view other than its inputs. That last check uses `EXPLAIN QUERY PLAN`, which in smaltdb 0.9 doesn't list tables read
inside subqueries in expressions, so for now it catches the common mistake rather than every case. With the plan API,
`bind()` replaces this, and the check becomes exact.

**Keys.** A node's key is the hash of its canonical form, with its inputs replaced by their keys, and the engine and
plugin versions. A snapshot's key is the hash of its content. Keys come from the flow plan, not the document: moving a
card or renaming a dataset changes no key, and two surfaces that produce the same plan share keys. A node whose key
already has a stored version is not rebuilt: this is how "only what changed is rebuilt" works, and it covers external
inputs.

**Optimizing** (smaltfl's part; the engine optimizes within each statement):
- **Reuse:** a node whose key has a stored version is read, not rebuilt.
- **Store or fold:** a node is stored if it is an output, read by more than one node, or pinned by the user. Every
  other node is folded into the statement of the node that reads it, as a common table expression. The nodes up to a
  stored one form a **segment**: one statement, which the engine plans and fuses as a whole. Expectations always run;
  their counts are recorded by the expectation's key, so their rows needn't be stored, and their filter folds into
  the statement that reads them. A check that nothing reads (a box of checks beside a step) doesn't count as a
  reader: storing a step for it would mean writing and hashing every row, where computing the step again inside the
  check's statement only reads it.
- **With the plan API:** columns nothing downstream reads are pruned, and filters, policy filters included, move
  toward the sources, so Parquet skips row groups.

**Emitting.** Only the emitter knows what the engine accepts: SQL today, plans later. The SQL it writes is for the
engine, not for people; the readable SQL of a visual step on the canvas is a separate rendering of the same node.

**Sources in the database.** A table source is snapshotted by copying its rows into a version table, keyed by their
content hash. Each source table has a **watch**: a materialized view of its row count, which the engine marks stale on
any committed write to the table, even one that keeps the count. While the watch is fresh, the last snapshot still
holds and a run doesn't read the table at all; the copy and the watch's refresh share one transaction, so no write can
fall between them. Views are not watched (their definition can change while their tables don't), so they are read
every run.

**Running a segment.**
1. Snapshot any external input not yet stored: fetch it once, hash it, store it under its hash, and register it with
   `@smaltdb/external` as `file:<hash>`, so the run reads exactly those bytes.
2. Create the dataset's new version as a typed table named by its key (`smaltdb` has no `CREATE TABLE … AS SELECT`, so:
   `CREATE TABLE` from the static types, then `INSERT INTO … SELECT`), in one transaction.
3. Hash the new version while scanning it in the worker (section 6), and record it.
4. Point the dataset's name (a view) at the new version, unless the flow holds it (below). A failure at any step
   leaves the previous version current.

**Holding a run** ([ADR 0009](adr/0009-paused-not-published.md)). A flow can say what pauses its publication, in a
`publish` block: `checks` (a `fail` rule failed, or more rows were dropped than `maxDropped` allows), `wrong` (the
day's story says something wrong) or `short` (wrong, and the day's trips below their range), each watched source
judged against a history file, by the parameter that orders the days. Such a document is format 2, and its plan
plan/1. Where its run would have thrown, it holds (`src/plugin/runtime.ts`, with `src/core/hold.ts`):
1. The checks count and are recorded without throwing. What they hold is read from the manifest's counts
   (`holdsOf`), so a check reused by key holds again on the same day.
2. Each watched source is judged by the page's *claim*: the day's story told for the flow, with raw names and nothing
   hidden or marked as expected, from the history file the page checked against the data's list and pinned in the
   engine (`dayClaim`). The plugin accepts a claim only for the run's day, the history pinned under the watch's name
   and the snapshot's row count. A source with no claim, or one that doesn't match, is held as *not judged*: never
   published.
3. With `together` (the default) every output waits while anything holds, so outputs never show different days;
   otherwise the outputs that read what held. An output *waits* when its staged key differs from its current one.
4. In the run's transaction, only the outputs nothing holds are pointed. A held run keeps its manifest and its
   versions, *staged*, and a `_smaltfl_holds` row says what held it and the claims it was judged by.

**Judging any dataset** ([ADR 0010](adr/0010-any-dataset.md), phase 1). A watch can be given as an object of its
settings (`history`, `period`, `every`, `pattern`, `donor`, `time`, `zone`, `calendar`, `scale`, `holds`, `relearn`,
`count`, `follow`), the flow can name its calendar (`calendar: { base: none | us | us-nyc, zone, days, windows, dates
}`), and the ontology can mark
the values that are always bad (`bad`), the columns whose new values alert (`newValues: "alert"`) and a time that runs
`after` another; it names a row (`nouns`), a part (`name: "Vendor {code}"`) and a sender (`role`), which are display.
A document that says how a day is judged is format 3, and its plan plan/2, with every setting filled in; a watch given
as a file name keeps the settings every flow had (the `us-nyc/1` calendar, fixed floors), so its verdicts don't move.
`judgeOf` (news.ts) reads the settings and `flowStory` judges by them. A day whose rows have nothing to compare
against is *not judged yet* (`unlearned`, ◌), published, marked, unless `hold` lists `unlearned`; a day under a tenth
of its last seven days' rows is something wrong, judged or not. A bad value above its range at twice its usual rows
is something wrong, never marked as expected; a serious column's new value too. Every count says the source's noun.
This build refuses any `every` but day (phase 4).

**Measuring a load, and judging it from its own run** (ADR 0010 phase 2). A watched load's numbers are its *measures*
(measures/0, `src/core/measures.ts`): its rows, what its checks drop, each column's values present, medians and
quantiles from the profile's sample, its rows by hour (in the watch's zone), the counted columns' values and pairs,
and the followed columns' values. The plugin measures them in the engine (`measure`, `src/plugin/measure.ts`, the
statements emit.ts writes); the history builder (`scripts/data/history.ts`) calls the same method, so a period built
offline and the same load measured by its own run are equal (`test/measures-real.test.ts` checks the data branch's
loads against history.json). A history is smaltfl-history/3 (/2 still reads): its base, as the data's list gives it,
plus the source's *tail*, the measures of the loads the base lacks, appended from their own runs in this browser, one
a slot, the first to arrive, never a derived run's (`appendPeriods`, `HistoryRanges.of`). The record keeps each run's
measures, and the page rebuilds the tail from it when it opens. Under plan/2 a watched source is judged by claim/2:
told from the base, the tail before the day (a Merkle tree, E12, named by its size and root) and the load's own
measures (`loadClaim`), leaving out the days the record held and didn't publish as is (`skipOf`, Q-80); the plugin
measures the snapshot, checks the claim's flow hash, slot, base, tail (pinned as `tail.<source>.json`, its root
computed again) and measures, and keeps the measures (`_smaltfl_measures`). A derived run's watched source is judged
against the held run it repairs (its flow hash and stored measures, the same snapshot), and each donor by its own day's
measures (C4). The checks' numbers are judged only from the periods counted with the rules in force (`checksStart`).

**A flow's own days, patterns and levels** (ADR 0010 phase 3). The calendar's `days` recur by a day of the month
(negative from its end) or a weekday `between` two days, in some months or all, with days `around` them; one with a
single month is judged against last year's as a holiday is, any other by its *occurrences' guess* (its last six
occurrences' lift over their weeks, moving this day's weeks' guess; "Not judged yet · 2nd Patch Tuesday here" under
three).
`windows` are spans of the year, `dates` one-off days left out of learning. A watch's `pattern` is `weekly`, `none`
(the ordinary periods before, whatever the weekday) or `monthly` (those, the same day of the month, and last year).
The general form stops echoes (a share far from its weeks is not learned from), and with `relearn` re-learns a change
that lasted 14 days and never held a day (X7); the taxi example leaves it off (ADR 0010 §13). `rangesFor(doc, source)`
says what a flow's ranges are made with, and `flowStory` refuses others. The example is format 3, with Election Day
in its calendar, and holds 25 days under `wrong` (Q-54). *Accept the new level* (`accept`, the owner and roles whose
rule lists it, Q-57) publishes a held day as is and records a level (`{ source, from, metrics }`): `levelsOf` reads
the levels from the record, `HistoryRanges` learns from each as a break (the weeks since it, the miss under it), each
claim names them (`levels`), and a later day held by the story alone, off only on the level's metrics and the same
way, publishes under it (`levelFor`), recorded as a decision under the Accept.

**Several watched sources, each with its own cadence** (ADR 0010 phase 4). A watch's `every` is a day or a slot of it
(12h down to 1h, aligned to midnight), its period parameter naming the slot (`2024-09-10T06`); a slot is counted in its
own hours (quarter hours under 3 hours) and judged from its own series, the same slot of each day, as a day is
(`slotSeries`). With more than one watched source, holds and decisions are about loads (a source's file for a slot):
each hold names its load, a load an earlier run held is carried, citing that run, and a pause is keyed by its load, so
a daily load held at 08:00 is decided once whatever slots of another source arrive after it. A release cites a decision
for each load holding what it names, and with `together: false` only the off file's slot pauses (Q-55). A load can be
filled from the same slot of another day.

**Releasing** (`src/plugin/release.ts`). A person decides what becomes of a held day: wait (nothing to do), publish
it as is, accept its new level (released as publishing as is, with a reason), or don't publish it, for that day or
until a day publishes (`smaltfl:decide`, a rule in the flow's policies;
the owner may always decide). The decision is recorded first, by the day's inputs and every held output's staged key.
Publishing as is is then a release, one transaction that checks the run against its manifest hash, the keys against
the decision's, the actor against the policies stored with the run, the reason, the decision's record leaf, and that
no later day is current for a name, then points the names and keeps the release in `_smaltfl_releases`. A refusal is
kept too, and returned, never thrown. The app's engine lives in memory: after a reload, a day held again with the
same inputs and keys is released again by the same decision, recorded as citing it, and a standing decision not to
publish closes each held day after it until one publishes. A flow without a `publish` block runs as before, and its
gate still throws.

**Filling a held day** ([ADR 0009 amendment 1](adr/0009-paused-not-published.md)). A flow that may be filled has a
`fill` step on its watched source (the example's `trips_filled`): on a day nothing fills it passes the rows through
with a `filled_from` column, null, and every output it reaches must carry the mark (`max(filled_from)`, and the rows
filled), or the run is refused. The checks and the history count the source through it (`sourceOf`). When a held day
is short and its story names a missing part (hours from a time, a part that vanished, the rest where a part held),
`src/core/fill.ts` offers two remedies: a fill from a good day near it (the watch's rule first, the same weekday or the
nearest day, before or after, within four weeks, judged with nothing wrong of it, never a day the flow's calendar
marks unless the held day is one, a file the data lists), or the part that arrived alone. A remedy is a derived
document (`repairDocument`: the fill step's `missing` and `from`, and the donor as a second input), run *staged*: every
output held, its versions kept and hashed, its donor's claim judged as a watched source's is. The app
(`src/app/fills.ts`) pins the donor's file only when a fill needs it, checked against the data's list, stages the
derived run when the option is picked, and records it as a derived run with its document. A decision to fill names
the repair and the derived run's keys; its release (`src/plugin/release.ts`) checks the derived run against the held
run it repairs (the same day and snapshot, the document that run's repaired, the donor's file and claim, nothing
holding it but its day's story and its being derived) and keeps what each name showed before it
(`_smaltfl_repairs`), so a better donor replaces a fill, and a withdrawal (Q-61) points each name back. A fill may
stand until a day passes (Q-64): each later held day is filled by the same rule from its own good day, decided under
it. After a reload the decision is applied again from its repair.

**Runs** are recorded as manifests (section 6), with the flow plan they ran stored by its hash. Cancellation uses the
client's `AbortSignal`; progress is reported per step. Previews run a segment up to the chosen step, with a `LIMIT`.

## 6. Hashes and provenance

| What | Hash of | Notes |
| --- | --- | --- |
| Flow | The canonical JSON of the document, without display fields | Canonical JSON: sorted keys, no insignificant whitespace, numbers in shortest form |
| Flow plan | The canonical JSON of the plan a run executed, tagged `plan/0`, `plan/1` when it carries a `publish` block (ADR 0009 E10), or `plan/2` when that block also says how its watched sources are judged (ADR 0010 E13) | Stored with the run, so a re-run replays exactly what ran. A plan without the block hashes as before, byte for byte, and a legacy watch's plan/1 too |
| Step key | Its plan node in canonical form, its inputs' keys, the engine and plugin versions | Merkle-style: a change upstream changes every key downstream. Names and display fields are not in it |
| Source file | The exact bytes the engine reads: plain SHA-256, so it equals `sha256sum` and the data branch's MANIFEST.json (ADR 0006 E1) | Checked by the page against the data's list, then hashed again in the engine as the plugin pins it (`smaltfl:<file>`); a run records the file each snapshot read |
| Snapshot | A source's rows, as a dataset version | Its key is its content, so the same rows from another file are the same snapshot |
| Dataset version | Its schema and the multiset of its rows: each row's canonical binary encoding is hashed, and the sorted row hashes are hashed in 1 MiB chunks | Exact: `REAL` values hash by their IEEE-754 bits; `NULL` and each type are tagged. The same rows in any order give the same hash, with no sort in the engine (`src/plugin/dataset-hash.ts`) |
| Edit | The edit and the previous edit's hash | A hash chain in the engine; each edit also goes into the record with the policies and ontology hashes in force |
| Measures (measures/0) | One load's numbers, canonical JSON tagged `measures/0` (ADR 0010 E11) | Kept with the run (`_smaltfl_measures`) and in its record entry; a claim/2 names the hash it was told from |
| Tail (tail/0) | A source's appended measures as an RFC 9162 tree, each leaf over the same bytes as the measures' hash (E12) | A claim/2 names it by its size and root; the plugin computes the root of the tail pinned with the run again |
| Run manifest (run/1) | The flow (with its policies and ontology hashes), the plan, parameters, engine and plugin versions and the code's commit, step keys, the source files read, snapshot and dataset hashes, row counts, expectation results, the data commit and list hash, the record's head, the previous run | The flow document is kept with it; run/0 manifests still verify. Signed when shared (section 7) |
| Record entry (log/1) | The entry's canonical JSON, as an RFC 9162 leaf; the record's root as the Merkle tree hash of its leaves | One append-only record per flow and browser (`src/core/log.ts`, `src/app/record.ts`): runs (`ok`, `failed`, `held` with what held them, what waits and the staged keys, or `derived` with the held run it repairs, the repair and its document), decisions on held days (with a remedy's repair and derived run), releases (with `from`, `repair`, `filled`, or `withdraws`), flow changes, file checks, actions on findings, edits, verifications, signatures, exports |
| Checkpoint | The record's origin, size and root, signed (ECDSA P-256) by this browser's identity | Downloaded and kept elsewhere, it anchors the record: a later record is checked against it with a consistency proof |
| Audit bag | BagIt 1.0: every file by SHA-256 in its manifests | The record, checkpoints, card, manifests, plans, flow documents, the data's list, what each dataset name shows and the engine's releases, and a proof per dataset as published (by its run's entry, or by the release that published it); checked with `sha256sum -c` and `node scripts/audit.mjs` |

- **Algorithm:** SHA-256 through WebCrypto, available in pages, workers and Node, with no dependency.
- **Verification** has three levels (ADR 0006): *stored* (the manifest agrees with its plan, the flow document
  translates to the plan, every key recomputes, every stored version has its hash, every dataset name shows the version
  its run made, the previous run is there, rows in and out add up), *rerun* (execute the plan again from its
  snapshots and compare every dataset hash and count) and *rederive* (decode the pinned source files again to the same
  snapshots, then rerun). Shown as Intact, Recomputed and Re-derived. Against someone who controls the browser, only a
  checkpoint kept elsewhere, or an audit bag checked offline, is evidence.
  A run of a flow that holds (ADR 0009) also gets a *held* check at every level: its stored holds must recompute from
  the manifest's counts and the stored claims, each claim judged again against the run's day, history file and
  snapshot rows; and every held output a dataset name shows needs an applied release of that run, with its manifest
  and key, citing a decision's record leaf, so a held output pointed by hand fails. *published* accepts a release.
  `audit.mjs check` checks held runs as it checks the others, and fails a decision whose actor the stored policies
  don't allow, or that came under a standing decision that no longer stood; a release that cites no earlier decision,
  or whose keys aren't its run's and its decision's; and a held output the engine shows with no release.
  A run released with a repair (ADR 0009 amendment 1 S11) gets a *repair* check: its stored derived document rebuilds
  from the held run's document and the repair, its donor node read the repair's file, and its watched source is the
  held run's snapshot; *held* accepts that release. The audit checks a derived run against its held run (document,
  snapshot, donor file, day and claim), its decision's repair and keys, its release (by the derived run's inputs, so a
  decision applied again in a new engine holds), a replacement that moved a name back past a later day, and a
  withdrawal, with what the engine kept (`engine/repairs.json` in the bag).
  A plan/2 run's *held* check judges its claim/2 again by the measures the run stored, and at the Recomputed level
  measures each watched snapshot (and each donor's) again with the settings it was measured by: the hash must be the
  stored one and the one its claim was told from.
  The audit checks an Accept (a reason, and a level that starts on its day) and each day released under it (an earlier
  Accept released, the same level, starting before the day, the day held by its story alone); `audit.mjs check
  --history` tells each claim/2 again from the levels the record accepted before it, which the claim must name.
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

**As built (v1, `src/core/policy.ts`).** A row rule names its column under each name it has (`pu_borough`, `borough`)
and applies to every dataset that has one; a dataset without it is closed to the people the rule is for, because its
rows can't be filtered. A column rule lists the columns it removes, the ones made from them included. Every read the
app makes (previews, results, objects, the who-sees-what counts) goes through the same compiled view, and "View as"
switches whose. Inheritance through lineage, with aggregates, replaces the column names when plans are bound
**[Q-41]**.

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
- **As built (v1):** the types live in the document's `ontology`; the runtime's `act` method reads the object's row
  itself, checks the action rule and its row scope (`checkAction`), and records the edit or the refusal in one hash
  chain (`_smaltfl_edits`), extended in a single synchronous transaction so it can't fork. The app's Ontology view
  lists the types with their objects as the viewer may see them, the latest edits applied, and an action form.
- **What the columns mean** (`ontology.properties`, shared property types): one per column name, for every dataset
  with a column of that name, or only for the ones its `datasets` lists where a name means something else there
  (`card_tip_rate` is a trip's rate in `trips_enriched`, an average in `zone_hour`). Each has a title, a description
  in its source's own words, a unit, the codes of a coded column and what each stands for, a `lookup` for a column of
  another dataset's keys (a zone number reads as the zone's name), a note on what the data itself shows that the
  source doesn't say, and the `references` it comes from (title, link, publisher, version). A column a step makes
  cites none: the step says how it is made. Meanings are for people: they are not in the flow plan, so no key
  changes with them (the flow hash, which covers the document, does). The example describes every column of every
  source and step, from the TLC's yellow trip data dictionary (March 18, 2025), its trip record and fare pages, the
  zone lookup, and Open-Meteo's Historical Weather API documentation, with notes measured on January 2024's records;
  a test checks that every column has a meaning and every code in the data is listed.

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
  core/       flow model, validation, compiler, hashes, lineage, policies, ontology, packages; data quality (profiles,
              odd rows, drift), the holiday calendar, each day's normal range, the news (a day's, a table's), what
              holds a run and what became of a held day (by load, with several watched sources), and filling one
              (fill.ts: what is missing, the donor, the derived document, a day's versions), a load's measures and a
              source's tail (measures.ts), slots of a day (calendar.ts)
  plugin/     the runtime plugin (engine worker): running and holding a plan, staging a derived run, releasing a
              held or derived run and withdrawing a fill, measuring a load, verifying
  worker.ts   the app's worker entry
  app/        the UI; fills.ts pins a donor and stages, decides and releases a fill; datalist.ts reads the data's list
              (loads.json, format 2: sources bound by id, histories by watch)
test/         vitest on the in-process engine and through the worker protocol; Playwright end-to-end tests with the app
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
- **The first version** (`src/app/`) runs the weather example on real data in the browser, with the engine and the
  runtime plugin in a worker. Its canvas is an open grid you pan, pinch-zoom, fit and tidy, and the flow runs left to
  right. Each card has a column: an input sits just before the step that first reads it, a side branch follows what
  it reads, so most edges join neighbouring columns. Sections take horizontal lanes (a chain of sections along one,
  a section beside them in the flow in the next), and inside a section no card sits on an edge that crosses its
  border; tests check that no edge in the example passes behind a card, folded or not. A card opens a sheet with the
  step's settings (text fields can be edited and run, which rebuilds only what depends on them), a preview of its rows
  (a folded step's statement runs over the stored versions) and the statement the engine runs. Runs can be verified
  and signed.
- **Inputs and outputs.** An input's card says so and what it reads (INPUT · PARQUET), with a port where data comes in;
  an output's card (a step that publishes a dataset) says OUTPUT, with a port where it leaves. Their sheets say where
  the rows come from (the file, its format, the table, the snapshot's hash) and where they go (the dataset, its hash,
  the ontology types built on it, the steps that read it next).
- **Who can see each step.** A small shield marks a card a rule limits: quiet for the owner, wherever a rule limits
  someone; marked, viewing as someone, wherever their rules limit them (a closed step is also greyed). Tapping it opens
  the step's sheet at Who can see this: the owner sees each person's access (all of it, some rows, some columns,
  closed) with the rules behind it and the rows they would read, and taps a person to see that step as they do, while
  the rest of the flow stays as it was; View all as switches the whole app. Anyone else sees only their own access.
- **What is closed to someone isn't shown to them.** Viewing as someone, a step closed to them is left out of the
  canvas with its edges (the flow is laid out again without it), as is a section with nothing left in it, and no
  sheet names it; Results, the Ontology and the Policies leave out the outputs, object types, rules, people and
  edits that aren't theirs, and Runs shows the run as far as they can see the flow, without its full record.
  Arranging the canvas stays with the owner.
- **Profile boxes.** What a table's rows hold has a box of its own on the canvas, beside it in its section, joined to
  it by a dashed edge: it only looks (the document's `profiles`, display fields, out of the plan, the flow hash and
  every key). The example has one on each input, the trips, the zones and the weather, so each load's story is in
  sight as it comes in; a step's About tab adds one. A profile box's sheet is its table's, with the news of all of it
  (for the trips, their checks' news too). Its card says the news at a glance: a normal day, something wrong, how many
  unusual things, or a note.
- **Daily loads.** The trips come a day at a time: a strip of day chips above the canvas, a week at a time with the
  weeks to turn through, each with what its checks dropped and a dot for its news (red for something wrong, amber for
  something unusual), and a word for it. Besides the month, the loads hold three real incidents in the TLC's records,
  each with a few ordinary days either side, chosen above the strip: the records stopping part way through Thursday
  21 September 2023 and holding almost nothing until Monday, the same on 17 and 18 September 2022, and a week in
  November 2022 a quarter short every day; each runs with its own month as the flow's `month` parameter. Next and Play
  step through them. A load is that day's file put in the engine as the trips source, and a run: a load run before
  runs again at no cost, its rows giving the same keys. A load whose trips are outside their normal range is marked
  (known before it runs). Each run records its load, and the Runs view names the day. Weather's effect needs dry hours
  at the same time of day on other days, which one day's load can't have: it is measured over every load run so far
  on the same flow, the weather_effect step's own SQL with its input bound to those loads' rows together
  (`emitSqlOver`, `emitUnionAll`).
- **Normal ranges.** Each day's numbers are judged against what a day like it would have (`src/core/normal.ts`), from
  the days before it alone, the way data-observability tools set an expected range for a daily metric and forecasting
  practice combines guesses rather than picking one. Two guesses. The weeks before: the same weekday over the six
  weeks before, holidays and the days around them left out, the latest counting most and each two places back half as
  much, so that no one day weighs more than a third: their weighted median, which no one odd day can make. Last year:
  the same weekday 52 weeks back and a week either side (their median, so one odd week last year doesn't make the
  guess), moved by how this year's days compared with last year's over the six weeks before (the median of their
  ratios, day by day). Each guess is weighted by how well it guessed the ordinary days of the six weeks before, in
  inverse proportion to its squared typical miss (Bates and Granger's combination), neither counting less than a fifth.
  The range is the guess give or take three typical misses of that combined guess over the same days (a typical miss:
  1.4826 times the median absolute miss, a standard deviation a few odd days don't inflate). A guess's typical miss is
  the larger of its miss over every day and over the same weekday's, and a guess that misses by more than three times
  the other's is left out: last year's, when a rule changed since (the TLC's surcharges in December 2022, after which
  last year's Saturdays had next to no $1 surcharge). A count far from its weekday's in the three weeks before it (half
  again, or a third less) is judged but not learned from, as observability tools leave the anomalies they find out of
  what they learn: a feed that stopped last September doesn't lower this September's range. Holidays, and the days in
  a window around one that are no ordinary days either (`src/core/calendar.ts`: the holiday season from December 23 to
  January 3, the week of July 4th, the day before Thanksgiving and its weekend, the weekends before Memorial Day and
  Labor Day, as Prophet gives a holiday a window), go by last year's own day alone: the same holiday, or the same day
  of the window on the same weekday, moved by the year's ratio and, for a holiday on a date that fell on another
  weekday, by how the two weekdays compare lately; give or take three of that guess's typical misses on the holidays
  of the year before; and not at all when last year's guess is broken, or the number has moved by half or more on its
  scale since last year (what a holiday had then, so moved, says little of what it has now). The weekday move is a
  count's alone: a holiday Monday has a Monday's trips, more or less, but no rush hour. Counts are guessed on a log
  scale, shares on a logit scale, medians as they are. The numbers come
  from the scenario's history (`history.json`, by `scripts/data/history.ts`: two years and a quarter of days, each
  measured as the app measures a load: the trip checks run on the runtime, the trips profiled with exact counts and a
  median and quantiles from an even sample of 2,000 rows, every row of the coded columns counted). A sheet's History
  tab has a band chart of the week shown and the seven before it, each day's range a band, its guess a dashed line,
  its number a dot (amber outside its range), holidays marked under it, and why a day's range is what it is: each
  guess, the days it came from, its weight and its typical miss, and for what the checks drop, each rule's share
  against its own range; and how the ranges held over the year before the month. A column's story gives its normal
  share filled and, for a measure or a time whose median varies from day to day, its normal median (a time's in the
  day). As the person may read it: only with the
  trips source open to them, and a range for what the checks drop only while the checks are the ones the history
  counted, reading the trips themselves.
- **The sheet: a table's story in tabs.** A card's sheet tells the story of its data in the same few tabs on every
  card, the news first (as Palantir's data health puts a dataset's checks first, and Alteryx's and Trifacta's profiles
  put a column's distribution and quality on top of it): News, what is out of the ordinary, each finding with its
  evidence, where to look for more, and what can be done; Data, its rows, each column's distribution and how full it
  is on top of it, as a spreadsheet's data explorer has them, a header opening the column; Columns, one to a line,
  each opening in place on its story (what it is, its shape, its normal share filled and median, the findings about
  it, the checks worth adding); Dropped, for a step that drops rows, what it dropped and why, each rule against a day
  like it; Odd rows, for a table big enough to have them; History, for the numbers the history follows, any of them
  day by day against its normal range (a finding's own a tap away); and About, what the step is, its settings, who can
  see it and what the engine runs. Above the tabs, what it reads and what reads it, a tap away, and the day's load, to
  step through without closing the sheet; the News tab carries a count of what to look at. A card keeps its tab and
  its place in each tab. On a phone the sheet takes the screen, its head staying in sight.
- **The news.** What is out of the ordinary about a load (`src/core/news.ts`), the kinds data-observability tools
  watch a table for, judged against each number's normal range: the amount of data (a normal amount for the day or
  not; all but blank; the trips stopping part way through the day or starting late, hour by hour against how a day
  like it shares out its trips; with where the change is, the coded value that accounts for most of it), the values
  (one usually there gone, one's share unusual, a value or a combination of two never seen in the history, as Monte
  Carlo's new-values monitor has it, on enough rows to matter), completeness (a column missing more values than it
  does), shape (a measure's or a time's quantiles moved), what the checks drop and each rule's share, the file's own
  columns changing from one month to the next, and the weather, as context. False alarms are kept down three ways: a
  number has to be outside its normal range; it has to matter (enough rows, a big enough change: `MATERIAL`, a share
  moving a fifth of its smaller side at least, and two points and four typical misses to be unusual rather than worth
  knowing); a change that has lasted (outside today's range on most of the week before, or the same weekday twice
  running; for the day's trips, most of the week before outside each day's own range) is told as a note from the day
  it began, not as news every day, until the range learns it or it is marked
  expected; and findings that are likely one thing seen through several columns (the same number of trips missing a
  passenger count, a rate code and a surcharge) are told once. A share or a level is told only a typical miss past its
  range's edge. Calibrated on the history's days from January 2023 to January 2024: 363 of 396 with nothing unusual,
  27 something unusual, 6 something wrong (from 141 alerts before).
- **The story, drawn** (ADR 0008). `src/core/story.ts` tells a day's news as one cause, a population or a time: the
  hour the trips fall, or a split (the part of the trips with one coded value that held while everything else moved,
  or vanished or surged while the rest held: on Fri Sep 22, 2023 the Flex Fare trips arrived as usual and every other
  trip almost stopped; or the population a value and the fields blank on its rows are, Mon Sep 18, 2023's Flex Fare
  trips at 5.3% of the day), or an amount, or a held gate drawn with the rows it dropped against a usual day's. Every finding
  is sorted by what the cause explains (absorbed, follows, same day, standalone; new values, pairs, schema and
  integrity never fold), with the episode it belongs to ("Day 2 · since Thu 13:00") and the words a screen shows, short
  enough to count. `src/app/viz.ts` draws it: split rows, hour bars over a usual day's, the gate, day strips, dumbbells,
  quantile strips, a waterfall, composition bars, the episode's hours, as SVG with aria-labels. The News tab is one
  cause card (a head that carries the number, one visual, the gate, what it reaches, what follows folded, one verb), a
  health row, at most two more stories and counted rows; a tap opens a detail that is visual too; the method is written
  once, behind (i). The story is computed per viewer, and the canvas, the loads strip, the badges and the header read
  it. A table the history doesn't follow (a lookup, a step) is told from its own rows on the
  day's run (`tableNewsOf`): a key a join reads it by repeating, rows a join finds no match for, placeholder values
  that stand for no value (a lookup's Unknown and N/A) with the steps that leave them out, and empty values in an
  input's columns or in the ones a step adds. Each finding is something wrong (alert), unusual (warn), worth knowing
  (note) or normal, says the published datasets built from its rows when it matters, and where its band comes from.
  A day with nothing to tell says so.
- **A day shows that day** (ADR 0008 §10). `src/core/days.ts` picks the run every view reads: the viewed day's own,
  else the latest day before it that passed (the flow publishes only a run that passes, so a held day's outputs keep
  that day), never a later day's, whatever order the visit ran the days in. A panel of another day's rows carries
  that day as a full-width bar, the held line says what the outputs keep, and nothing after the viewed day is drawn
  as known: the episode's hours and shortfall, History charts and the loads strip stop at it. The outputs of a day
  with something wrong say what they were built from ("Outputs built from a short day"), and the History calendar
  counts only days it has checked.
- **What a card adds around its cause** (ADR 0008 §11). The weather is a plain note after the day's visuals, never a
  cause's chip; the health row is headed once and the same on every day, each cell a tap from what it measured (the
  file check in words, the hours, every finding of its kinds); every finding sits in one tier, so the rows add up to
  what was found; an episode's chip draws its days so far; a told source is said and the verb moves on; "How it's
  judged" draws the points a day's range is learned from.
- **The other tabs and the canvas** (ADR 0008 §12). The checks' rules are one label and one order everywhere, a count
  past its range is marked past a notch, and the checks' (i) and sheet are about the rows dropped. Suggested checks
  lead with a plain sentence, never bound a documented code or a tail more than 1% of rows reach, and say what their
  rows cover. `src/core/effect.ts` reads a table that measures against a baseline (weather_effect's vs_dry), so its
  News says when there is nothing to measure. Columns, Odd rows, Dropped and History say their samples, renames,
  dropped rows' reasons and chips plainly (`quality.renamesOf`, `needOf`). On a phone the canvas stacks its sections
  (`layout.gridLayout`'s wrap).
- **What can be done about a finding.** Each finding offers what fits it, as Datadog's annotations, Anomalo's alerts
  and Monte Carlo's incidents do: mark it expected, with why (kept, but quiet, and the next person sees the note);
  open an incident, and resolve it with what it was, which leaves the day out of what the normal ranges learn from;
  tell whoever publishes the input, a note ready to send or copy; add a check that flags rows like these from now on,
  a warning rule in a watch box beside the table (made the first time); or set the rows aside in a dataset of their
  own, to review. The owner changes the flow; anyone may mark or note. What was done is kept in this browser as a
  hash-chained log (each entry's hash covers the one before), shown on the finding, and an incident on a day shows in
  the history's list of days something was wrong.
- **Integrity, all the way through (ADR 0006).** Every data file is checked before it is used: build-app reads the
  data branch at one commit and checks each file against its MANIFEST.json, and the app checks the list's hash and then
  every file it fetches against it, refusing one that doesn't match (fetched once more first, past any cache): the
  load doesn't run, the last good run stays on screen, and the sheet says so with both hashes and what can be done.
  The engine hashes each file again as the plugin pins it, and a run records the file each snapshot read. A card's
  seal says it is checked back to the bytes it was made from (an input whose file matched the list and was read by
  the engine; a step whose run was verified), or broken; it sits beside the news dot and is a different thing: data
  health is whether the numbers are usual, integrity whether they are what they say they are. Each card's Integrity
  tab traces it back through every step to the files, with each key, content hash and file hash in full (in groups of
  four, with Copy), and what verify found at each. The Runs view shows the record: intact or where it broke, its
  size, root and signer, a timeline of what happened in plain sentences, a checkpoint to download and keep elsewhere,
  a check of the record against one kept elsewhere, and the export for audit.
- **What the columns hold.** A profile box has a card for each column: how full it is, its distinct values, and a
  measure's or a time's shape (a histogram from its 1st to its 99th percentile, the median marked, the smallest,
  largest, mean and middle half) or a category's common values. Counts are exact, counted by the engine over every row
  the viewer reads; shapes come from an even sample of up to 2,000 of them. A folded step's rows are copied once into
  a temporary table for this, so the engine computes them once rather than once a question.
- **Odd rows.** An isolation forest (100 seeded trees over subsamples of 256) scores the sample's rows on the step's
  measures. The oddest come folded, with a tally (taken care of, flagged, checked, not checked yet), as cards a phone
  can read: how odd, what sets the row apart in its own units (the measures where it sits more than 3.5 robust
  standard deviations from the median, against where most rows lie), what already deals with it, and the whole row
  on demand. What deals with it comes from the checks that judge the step's rows as they are (`checksOver`): the
  rules of checks steps before it and after it, on a path of steps that keep their first input's rows and values
  (filters, checks, formulas, joins, projections, and SQL that only selects `*` from one input), as long as nothing on
  the way sets a column the rule reads. Each sampled row is evaluated against them in the same statement as the
  sample, so a card says "already taken care of after this step: trips_valid drops it", that a check before it looked
  and let it pass, or that nothing checks it yet. Only checks the person may read count: on a step open to them, on
  columns they see.
- **The isolation forest at play.** The sampled rows are drawn on their two principal components
  (`principalComponents`: each measure centred on its median and scaled by its robust spread, the directions found on
  values capped at six spreads so a few extreme rows don't choose them, every row then placed uncapped; the axes
  stretched with asinh so the bulk and the far rows both show, and named by the measures that weigh most). The odd
  rows are numbered as their cards are. Play has the forest pick them out one by one with its own trees (`growForest`
  keeps them; the scores are unchanged): for each row, a tree that takes a typical number of cuts for it, whose rows
  on the other side of each cut fall away (`isolationPath`) until it stands alone, each cut said in the measure's
  units. A row tapped on the map is cut out the same way, an ordinary one taking many more cuts.
- **What the columns mean, wherever they show.** A row card labels each column by its title over its name, an amount
  in dollars or its unit, a code with what it stands for, a zone number with the zone's name (read through the
  viewer's policy, so none from a lookup closed to them); a table's header gives the title and unit, with the
  description on hover. A column card says what the column is, decodes its common values, and adds the note. The
  Ontology view lists every column the viewer can read somewhere, grouped by the source it comes from or the steps
  that make it, with its codes, where it is, how a step makes it, and links to its sources.
- **Suggested checks, added as a filter box.** For the columns a step makes itself (an input's, an aggregate's or a SQL
  step's, the ones a formula, join or select adds), and that no check before or after it already judges: an upper
  bound for a far tail, `>= 0` for stray negatives or as a guard, `IS NOT NULL` for a few missing values (columns
  missing in the same rows get one), `IN (…)` for a small category's values today, or for a coded column, the codes its
  source documents (a catch if it holds one they don't list). Each is counted exactly over every row, as an
  expectation counts; the checks already judging the step are listed beside them, folded. One tap puts the chosen ones in a filter box between the step and what reads it: an
  expectations step whose rules drop the rows they flag, each rule keeping why it was suggested (the rule's
  `description`, which is for people: it is not in the plan, so no key changes with it). What read the step reads the
  box instead (a SQL step's text is rewired by token), so everything after it runs again without those rows; a step
  nothing reads gets the box as an output of its own. The box reads FILTER on its card, with the rows it dropped, and
  its sheet shows each dropped row leading with why: the values that failed, the rule, and its reason. A filter box
  can be taken out again, and what read it reads the step once more, its earlier versions reused. A check that only
  warns, and that nothing reads, doesn't make the step it reads stored. Edits to the flow are kept in this browser,
  and Reset (in Arrange) puts the example back.
- **Rows on a phone.** Previews and the rows a sheet shows come as cards, one row at a time to swipe or step
  through, each column a label and its value with the columns that matter first (the ones a rule reads, the ones a
  step adds); or as a table whose header and first column stay in place. Cards are the default on a narrow screen,
  and the choice is kept.
- **What each step changed.** After a run, each card says what its step did to the data: rows it left out (with a
  badge on the card), columns it added, rows in and out of an aggregate, rows a join found no match for. Its sheet
  leads with the same in full: a bar of rows kept against rows dropped, each expectation rule's failures, and the
  rows themselves on request, with the columns a rule reads first. The rows a step removed are found as a multiset
  (`emitExcept`), so a removed duplicate shows too, and a SQL step that keeps its columns also shows the rows it
  changed; a join's unmatched rows are found by their keys (`emitUnmatched`), not by empty columns. Everything is
  counted as the viewer reads it, through their policy, so it never shows more than they could read themselves; a
  rule that reads a column their policy removes stays closed to them.
- **Arranging.** Outside Arrange a finger pans, even on a card, and holding a card picks it up; in Arrange, cards and
  sections move at a touch, a step dropped on a section moves into it (or out, dropped outside every section), and
  sections can be made, named, coloured (seven colours from the family's palette, light and dark), folded and deleted.
  A step's sheet moves it between sections without dragging, and arrow keys move a focused card. A drag moves the
  drawn elements and never rebuilds the canvas under the finger, since iOS stops reporting a touch whose element
  leaves the page. Sections and places stay display only, out of every hash; this version keeps them in the browser
  (local storage), and once flows are saved they travel with the document's display fields.
