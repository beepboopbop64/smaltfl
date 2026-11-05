# Open Questions

The design interview for smaltfl. Each question records the decision needed, the decision or a proposal, and its
status. Decided questions are recorded in ADRs: round 1 in [adr/0001-initial-decisions.md](adr/0001-initial-decisions.md).
The research behind the proposals is in [research/ecosystem-survey.md](research/ecosystem-survey.md).

**Who decides:** the maintainers, together (ADR 0001 §1).

## Round 2: open

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-31 | Identity: enforcement and sharing need to know who someone is. Without a server, how? | **Identity cards.** Each person's smaltfl creates a key pair in their browser (WebCrypto, kept in IndexedDB, never exported). Their card (name, public keys, a fingerprint) is a small file or link they send you; you add them as a principal and give them attributes, such as districts. Sign-in through GitHub or another provider arrives with the server and maps onto the same principals | open |
| Q-32 | What is a "district" in the reference scenario? | **The borough** (Manhattan, Brooklyn, Queens, the Bronx, Staten Island, plus Newark airport), from the TLC zone table. Policies can also name zones, so "airports only" works too. Community districts (59) would need a map overlay of the zones | open |
| Q-33 | Snapshots: recreating any run needs the exact input bytes. How much is kept? | Keep every input snapshot by hash, within a storage budget you set (oldest unpinned first); runs you share or pin keep theirs. A run whose snapshot is gone can still be verified against its hashes, but not recreated | open |
| Q-34 | Verified runs and speed: parallel execution can change a floating-point sum in its last digit | Verification is bit-exact: runs pin the engine settings that affect results (no parallel aggregation of floating-point values), and the cost is measured. Revisit if it is large | open |
| Q-35 | What is a share? | **One package file** (`.smaltfl`): the flow, its run manifests and signatures, and optionally the data, encrypted per policy partition. The recipient opens it in smaltfl. Hosted links come with the server | open |
| Q-36 | Which actions does the scenario need? | *Exclude trips* (a steward marks bad records; the clean step drops them), *set a zone service target* (a district lead, for their own district only), *annotate a weather event* (labels a period, used in analysis) | open |
| Q-37 | Which data for the scenario? | Yellow taxi trips for January 2024 (the default) and Q1 2024 (the limit test), Open-Meteo hourly weather per borough, the TLC zone table. Later, Q1 2025 against Q1 2024 for congestion pricing | open |
| Q-2 | Who is the first user? | Data engineers build; analysts use and extend. The canvas must stay readable for both | open |
| Q-15 | Lineage granularity in v1? | Dataset-level and run-level from the start; column-level when the plan API lands | open |
| Q-18 | Data quality in v1? | Row expectations (warn, drop, fail) and dataset checks (freshness, row count, uniqueness, schema) | open |

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
| Q-21 | Repository home | `beepboopbop64/smaltfl` for now | decided |
| Q-22 | UI | A visual UI, plain DOM, CSS and SVG, smaltdb and smaltkit only | decided |
| Q-23 | A canvas kit in smaltkit? | Not now: it stays in this repository | decided |
| Q-24 | Changes in other smalt repositories | Not for now; discussed with stenhoor first | decided |
| Q-25 | Name | `smaltfl`, said "smalt-flow" | decided |
| Q-26 | Tagline | Small. Alternative. Flow. | decided |
| Q-27 | Positioning | Data pipelines for smaltdb. | decided |
| Q-28 | Colour | Round 1 shows all three: cobalt teal `#00786F`, plum `#8A3F8F`, smalt only | in review |
| Q-29 | Mark | Round 1 shows Fork, Merge, Relay and Pipe-forward in each colour | in review |
| Q-30 | Brand work | Boards here; assets in smalt-brand once someone with push access (or a fork) is set up | blocked |
