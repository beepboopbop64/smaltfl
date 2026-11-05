# Open Questions

The first design interview for smaltfl. Each question records the decision needed, a proposal, and its status. The
answers become the first ADRs in [adr/](adr/), as in smaltdb. The research behind the proposals is in
[research/ecosystem-survey.md](research/ecosystem-survey.md).

**Who decides:** to be confirmed (Q-1).

## Product

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-1 | Who is the owner of record for smaltfl decisions (ADRs, brand picks), and does smaltfl join the family's issue and orchestrator workflow? | The smaltworks owner (stenhoor) approves the product, name and brand, since `@smaltworks` and `smalt*` names are reserved; day-to-day decisions by whoever owns this repository; same `CLAUDE.md` working rules as the other repos | open |
| Q-2 | Who is the first user? | Data engineers first: nodes are code (SQL first; smaltdf when it ships) with typed schemas, on a canvas an analyst can read and run with parameters. No-code tools come in a later phase (Q-9) | open |
| Q-3 | Which tools inspire it, and which is the centre of gravity? Each product credits one or two ("inspired by, not against") | Credit Alteryx (visual workflow), Databricks (workflows and declarative pipelines), Papermill (parameterized runs) and Palantir Foundry (ontology, lineage, ownership); centre of gravity: Foundry's model at the scale of one machine | open |
| Q-4 | Does smaltfl keep the family's small-data, browser-first stance? | Yes: pipelines over data that fits on the machine in front of you (smaltdb's ~1 GB design point), borrowing the platforms' ideas, not their scale | open |

## Where pipelines run

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-5 | Runtime targets: browser only, or also a headless runner for scheduled runs (cron, CI)? | v1 runs in the browser (the engine worker, while a tab is open), and the flow format and runtime stay host-neutral so a headless runner can follow. Follow smaltbi's precedent: anything that needs a server is "a plugin or a wrapper environment, never core" (its planned Host plugin kind). A Node CLI runner is feasible as tooling today, as smaltbi's publish CLI is (in-process engine, `MemoryVfs` or an app-supplied `Vfs`, `@smaltdb/external` Node paths), but making Node a supported target is the smaltdb owner's call (smaltdb Q-17 says tests only) | open |
| Q-6 | Scheduling and triggers in v1? | Manual runs with parameters, and "run when an input is stale" using smaltdb's freshness tracking, while the app is open. Time schedules after the runtime question (Q-5) is settled | open |

## The pipeline model

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-7 | Execution model: a task DAG (Alteryx, Databricks Jobs), declarative datasets (DLT, Foundry builds), or both? | Both, in one model: a flow is a DAG of typed transforms; nodes marked as datasets persist as smaltdb tables or materialized views, intermediate nodes compose into one query so the engine optimizes across them, and smaltdb's `is_fresh` drives "rebuild only what is stale" | open |
| Q-8 | Which node kinds in v1? | Inputs (external tables, files, existing tables), SQL, outputs (tables, materialized views, exports). smaltdf nodes when smaltdf ships: it is design-only until all of ADR 0014 lands. Inputs use the data-step vocabulary smaltui and smaltbi already share (`import`, `link`, `sql`, `sqlFile`, `data`, `connection`; smaltbi ADR 0003), and a flow's outputs can be opened as a smaltbi report's `data` or a smaltui environment. Later: built-in visual tools, sub-flows, TypeScript steps, smaltnb notebooks (Papermill-style) | open |
| Q-9 | How do visual (no-code) tools compile? The owner's rule for smaltdf is "No code in smaltdf generates, compiles to, or runs SQL"; smaltbi, an app, compiles its model to readable SQL and shows the exact SQL it runs | Follow smaltbi: each visual tool compiles to readable SQL that the node shows and lets you edit, so the canvas never hides the code. Revisit building plans directly (or through smaltdf) once the plan API and smaltdf exist. Confirm with the owner that the smaltdf rule is a language rule, not an app rule | open |
| Q-10 | Build before or after smaltdb's public plan API (ADR 0014 step 9, ADR 0015 step 8)? | Start now with the parts that don't need plans (flow format, canvas, ontology, run model, SQL nodes through the client), on smaltdb 0.9 with its plugins pinned through `packed.json` rather than the 0.8.3 the apps still use. Typed schemas come today from a small smaltfl engine plugin (`Statement.columnTypes`); column lineage and `origin` when the plan API lands | open |

## Ontology, lineage and ownership

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-11 | Which ontology concepts in v1? | Object types (backed by a dataset, with a key, title and typed properties) and link types (with cardinality). Action types (validated writebacks) and interfaces later | open |
| Q-12 | One semantic layer for the family? smaltbi's model already has relationships (many-to-one), composable SQL measures, calculated columns, hierarchies, labels and descriptions | Grow smaltbi's model format into the family's shared semantic layer instead of starting a second one: object types extend its tables, link types its relationships, and smaltbi keeps reading it unchanged. Agree the format with smaltbi before building | open |
| Q-13 | Governance: declared and propagated, or enforced? | Declared and propagated in v1: owners, stewards, classifications (for example PII) and tags flow downstream through lineage and are checked before a run publishes. Enforcement needs a server or sync, later | open |
| Q-14 | Who is an owner? | A principal string (a GitHub handle or team) in the metadata; no sign-in in v1 | open |
| Q-15 | Lineage granularity in v1? | Dataset-level and run-level from the start; column-level when the plan API lands (Q-10) | open |
| Q-16 | Where does metadata live? | Plain files in Git are the source of truth for flows and the ontology (reviewable in PRs); run history and a queryable copy of the metadata live in the database. Ask smaltdb for owner / description / tag fields on catalog records in ADR 0015 step 7, so the data carries them itself | open |

## Runs, versions and collaboration

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-17 | Run history: what is recorded? | Each run records its parameters, input versions (ETags, freshness), outputs with row counts, durations, data-quality results and errors, in the database and exportable as a run report | open |
| Q-18 | Data quality in v1? | Row expectations (warn, drop, fail) and dataset checks (freshness, row count, uniqueness, schema) | open |
| Q-19 | Versioning: flows only, or data too? | Flows versioned in Git (branches and PRs). No dataset versions in v1: smaltdb keeps no old versions | open |
| Q-20 | Single user or collaborative? | Single user, local-first; share flows through Git and results through files or static publishing (as smaltbi publishes reports). Multi-user waits for `smaltdb-sync` or a server | open |

## Repository and code

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-21 | Repository home and package name | Stays `beepboopbop64/smaltfl` for now; moves to stenhoor (or a smaltworks organization) before publishing, as `@smaltworks/smaltfl` | open |
| Q-22 | UI approach for the canvas: the family uses no UI framework, chart or diagram library (plain DOM, CSS and SVG; runtime dependencies are smaltdb and smaltkit only) | Follow the family: a framework-free canvas, generalized from smaltbi's model view (HTML cards, one SVG overlay of connectors, pointer dragging, `autoLayout`) | open |
| Q-23 | Shared UI: a graph canvas kit in smaltkit, or local to smaltfl first? | Build it as a kit with few options from the start, so smaltnb (cell graphs) and smaltbi (model diagrams) can reuse it; contribute it to smaltkit once it settles | open |
| Q-24 | Can smaltfl propose changes in smaltdb (object metadata, plan inspection, Node support), or only consume published APIs? | Propose ADRs and PRs there through the owner's issue workflow | open |

## Brand

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-25 | Name and pronunciation | `smaltfl`, one lowercase word, sm**alt**fl, said "smalt-flow" | open |
| Q-26 | Tagline | "Small. Alternative. Flow." | open |
| Q-27 | Positioning line | "Data pipelines for smaltdb." | open |
| Q-28 | Product colour: the wheel is nearly full (see the survey, §6) | Show three on one board: cobalt teal `#00786F`, plum `#8A3F8F`, smalt only | open |
| Q-29 | Mark directions for round 1 | Fork (a trunk and one 45° branch), Merge (two arms joining one stem), Relay (two nodes and a link), Pipe-forward (`\|>`); avoid L-shapes (Together), `>` (Chevron) and grains on a line (Scatter) | open |
| Q-30 | Where the brand work happens | Exploration boards and picks recorded here first; the assets land in `smalt-brand` as one `brand/smaltfl` PR (needs access to that repository) | open |
