# Open Questions

The design interview for smaltfl. Each question records the decision needed, the decision or a proposal, and its status.
Decided questions are recorded in ADRs: round 1 in [adr/0001-initial-decisions.md](adr/0001-initial-decisions.md), round
2 in [adr/0002-second-round-decisions.md](adr/0002-second-round-decisions.md), round 3 in
[adr/0003-third-round-decisions.md](adr/0003-third-round-decisions.md), the flow plan in
[adr/0004-the-flow-plan.md](adr/0004-the-flow-plan.md), the licence in [adr/0005-licence.md](adr/0005-licence.md), pausing
a day that is off in [adr/0009-paused-not-published.md](adr/0009-paused-not-published.md). The research behind the
proposals is in [research/ecosystem-survey.md](research/ecosystem-survey.md).

**Who decides:** the maintainers, together (ADR 0001 §1).

## Open

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-52 | Should the rule that judges a day (the story's verdict that `wrong` and `short` read) be frozen as a versioned copy, or tied to the build? The story code changes often (ADR 0009 §3) | **Tied to the build**, with the history as its test vector: over 2022 to January 2024 `wrong` holds 28 days and `short` 22, and a change to the story that moves one fails the tests until it is accepted on purpose. Each claim records the build that judged it | open |
| Q-51 | Should a passing run of a day earlier than the one published move the dataset names back, as it does now, or stay behind, as a release must (ADR 0009 §5)? | **Unchanged for now:** a passing run moves the names, a release never moves them past a later day, and the decision sheet says when a day has been passed over. Ordering runs by their period comes with outputs partitioned by day | open |
| Q-50 | Who decides what happens to a held day by default, the owner only or stewards? Is Publish as is owner-only, and may it stand for later days? | **The owner only**, as proposed: a `smaltfl:decide` action rule names others, and its `may` the options they may take (ADR 0009 §8). Publish as is covers one day at a time; Don't publish may stand until a day passes | open |
| Q-49 | Are filled rows allowed in published data, and how are they marked? Which donor day? Do filled and unpublished days feed the ranges later days are judged by? | **Allowed, marked twice:** a `filled_from` column on the rows and the count filled on the release. The donor is the latest same weekday within four weeks that the history says nothing wrong of (ADR 0009 §7). The ranges: to decide with slice 2 | open |
| Q-47 | plan/1 and document format 2, or optional fields under plan/0 and format 1? | **plan/1 and format 2** (ADR 0009, E10): an older build refuses a flow that holds, where optional fields would fail open and publish what the flow holds. Kept to two functions (`documentFormat`, `planKind`), so switching is two lines | open |
| Q-38 | The builder (design canvas "smaltfl app concepts"): does it match what data engineering needs? What is missing or in the way? | Liked; made open after feedback (A3): a grid canvas where steps go anywhere, groups that hold any number of steps and collapse, zoom, fit, tidy and a map; every step opens into sub-steps, settings, its SQL, a preview and its schema with column lineage | in review |
| Q-29 | The mark: round 3 leans into waves (M12–M18), all curved | Pick a wave, and whether teal is a small chip (M12–M15) or a whole wave (M16–M18). Round 3 goes to stenhoor first (ADR 0003 §3) | on hold |
| Q-40 | The runs and policies screens (A6, A7): the right shape? | **Runs:** each run with its status and verification; what ran and why (each step reused or rebuilt, and the reason); its checks; its signed manifest, to download, verify again, re-run or compare. **Policies:** people (identity cards) and groups; row, column and action rules, each showing what it reaches; who sees what, by district; a preview as one person, with their share and the policy checks | in review |
| Q-41 | How do row rules pass through aggregates? | An aggregated row is visible only when every row behind it is. A dataset whose rows mix what a viewer may and may not see is closed to that viewer, and the app says why and offers the fix (group it by the rule's column): A7 shows this for `airport_times`. v1 applies rules by column name and closes a dataset without the rule's column; exact inheritance waits for bound plans | open |
| Q-34 | Verified runs and speed: parallel execution can change a floating-point sum in its last digit | Verification is bit-exact: runs pin the engine settings that affect results (no parallel aggregation of floating-point values), and the cost is measured. Revisit if it is large. A fold that changes the order of a floating-point sum is a new result (ADR 0004); order-independent sums in smaltdb would make it free, to discuss with stenhoor | open |
| Q-35 | What is a share? | **One package file** (`.smaltfl`): the flow, its run manifests and signatures, and optionally the data, encrypted per policy partition. The recipient opens it in smaltfl. Hosted links come with the server | open |
| Q-37 | Which data for the scenario? | Yellow taxi trips for January 2024 (the default) and Q1 2024 (the limit test), Open-Meteo hourly weather per borough, the TLC zone table. Later, Q1 2025 against Q1 2024 for congestion pricing | open |
| Q-2 | Who is the first user? | Data engineers build; analysts use and extend. The canvas must stay readable for both | open |
| Q-15 | Lineage granularity in v1? | Dataset-level and run-level from the start; column-level when the plan API lands | open |
| Q-18 | Data quality in v1? | Row expectations (warn, drop, fail) and dataset checks (freshness, row count, uniqueness, schema) | open |

## Pausing a day that is off: decided (ADR 0009)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-48 | Does "forward or backfill" mean filling a held day's missing part from the days before and after, re-running a corrected file, or both? | The owner, 2026-11-08: "impute the data if it's bad until it's good, just don't publish a change, then forward or backfill". **Both:** fill the missing part from the same weekday before (forward) or after (backfill), publish only the complete part, or re-run the day when its file is corrected (slices 2 and 3); "impute until it's good" is the standing setting `"meanwhile": "fill", "until": "normal"` | decided |
| Q-46 | Which days should hold by default: those the story says something wrong of and whose trips are below their range (`short`, 22 days in 2022 to January 2024), or every day it says something wrong of (`wrong`, 28)? | The owner, 2026-11-08: "if something is off then let's not publish the data". **`wrong` by default** (`"hold": ["checks", "wrong"]`); a flow may narrow it to `short` | decided |
| Q-45 | Should the flow hold outputs built from a day with something wrong, not only a day its checks drop too much of? | The owner: "If something is off then let's not publish the data … pause the data and then wait to get confirmation on what to do there." **A day that is off is paused, not published:** a flow's `publish` block says what holds it; a held run is built, checked, hashed and recorded with its versions staged, nothing it made is published, and readers keep the last published day until a person decides (wait, publish as is, don't publish; later fill from before or after, publish the complete part, re-run when corrected) | decided |

## The licence: decided (ADR 0005)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-44 | Licence | MIT, `Copyright (c) 2026 smaltfl contributors`, as in the rest of the family | decided |

## The flow plan: decided (ADR 0004)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-42 | How does a flow reach the engine? | Through the flow plan: one machine layer that every surface (builder, SQL, later notebooks and dataframes) translates into, which is typed, keyed, optimized and emitted for smaltdb. People say what, the machine decides how | decided |
| Q-43 | An AI agent in smaltfl? | Not for now. An assistant that builds and tunes flows would be its own repository (smaltai, later), working through the flow plan; for now the maintainers build flows with Claude Code | decided |

## Round 3: decided (ADR 0003)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-39 | The ontology screens (A4, A5) | Good enough for now: types with their datasets, named links, actions on the types they edit, a details panel; objects browsed through the policies, with the action's permission check shown before submitting | decided |
| Q-36 | The scenario's actions | *Exclude trips* (stewards), *Set zone service target* (a district lead, for their own district only), *Annotate weather event* (anyone the flow is shared with) | decided |

## Round 2: decided (ADR 0002)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-31 | Identity without a server | Identity cards: a key pair created in each person's browser; the public card is shared to be added as a principal. Sign-in comes with the server | decided |
| Q-32 | What is a "district"? | The borough (five boroughs and Newark airport); policies can also name zones | decided |
| Q-33 | How much snapshot history is kept? | Every snapshot by hash, within a budget; oldest unpinned first; shared or pinned runs keep theirs | decided |
| Q-22 | The UI (clarified) | A visual builder for data engineering, in the spirit of Foundry's Pipeline Builder, built without a UI framework | decided |
| Q-28 | Colour | Cobalt teal: `#00786F`, text `#006861`, dark `#4FD1C5` | decided |
| Q-30 | Brand work | Through the fork `beepboopbop64/smalt-brand`, then a pull request to `stenhoor/smalt-brand` | decided |

## Round 1: decided (ADR 0001)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-1 | Who decides? | A shared project, approved by stenhoor, with no single owner; the maintainers decide together, in ADRs | decided |
| Q-3 | Which tools inspire it? | Alteryx (visual workflow), Databricks (workflows, declarative pipelines), Papermill (parameterized runs) and Palantir Foundry (ontology, lineage, ownership), credited by name | decided |
| Q-4 | Small data, browser-first? | Yes: real problems, relatively small data, an intuitive UI | decided |
| Q-5 | Where pipelines run | The browser now. Bigger jobs can be pushed to a server later and come back aggregated to browser size or streamed | decided |
| Q-6 | Scheduling | With the server, later. v1 runs on demand, with parameters | decided |
| Q-7 | Execution model | A DAG of typed steps; datasets persist; only what changed is rebuilt, decided by content hashes (ADR 0001, consequences) | decided |
| Q-8 | Steps in v1 | Inputs, SQL, visual tools, outputs; smaltdf steps when smaltdf ships | decided |
| Q-9 | How visual tools compile | They drive the engine with whatever it accepts: SQL today, plans when the public plan API exists | decided |
| Q-10 | Build before the plan API? | Yes, on smaltdb 0.9 with its plugins pinned through `packed.json` | decided |
| Q-11 | Ontology concepts | Object types, link types and action types, from the start | decided |
| Q-12 | One semantic layer for the family? | No: smaltfl's ontology is its own and does not change smaltbi's format | decided |
| Q-13 | Governance | Enforced from the start, on every path smaltfl controls; cryptographic for shared data | decided |
| Q-14 | Who is an owner? | Replaced by Q-31 | superseded |
| Q-16 | Where metadata lives | The flow's JSON document (source of truth) and the database | decided |
| Q-17 | Run history | Every run has a manifest with the hashes of its code, inputs and outputs (ADR 0001 §8) | decided |
| Q-19 | Versioning | Flows in Git; datasets versioned by content hash, with retention (Q-33) | decided |
| Q-20 | Collaboration | Single user; flows and data can be shared under policy | decided |
| Q-21 | Repository home | `stenhoor/smaltfl`, moved from `beepboopbop64/smaltfl` (ADR 0007) | decided |
| Q-23 | A canvas kit in smaltkit? | Not now: it stays in this repository | decided |
| Q-24 | Changes in other smalt repositories | Not for now; discussed with stenhoor first | decided |
| Q-25 | Name | `smaltfl`, said "smalt-flow" | decided |
| Q-26 | Tagline | Small. Alternative. Flow. | decided |
| Q-27 | Positioning | Data pipelines for smaltdb. | decided |
