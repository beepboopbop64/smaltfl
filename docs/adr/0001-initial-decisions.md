# ADR 0001: Initial decisions

- **Status:** accepted
- **Date:** 2026-11-05

## Context

These decisions come from the first design interview ([../OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md), round 1). The
research behind the questions is in [../research/ecosystem-survey.md](../research/ecosystem-survey.md). They fix the
scope of the first version and the baselines the architecture ([../ARCHITECTURE.md](../ARCHITECTURE.md)) builds on.

## Decisions

1. **The project.** smaltfl is part of the smalt family, with stenhoor's approval. It is a shared project with no
   single owner: its maintainers decide together and record significant decisions as ADRs. The repository stays at
   `beepboopbop64/smaltfl` for now. (Q-1, Q-21)
2. **The stance.** Small data, in the browser: flows that help solve real problems with data that fits on the machine
   in front of you, built in an intuitive visual UI. (Q-4)
3. **Where it runs.** v1 runs in the browser. The design must let bigger jobs be pushed to a server later, scheduled
   there, and brought back either aggregated to a size the browser can hold or streamed to the browser. (Q-5, Q-6)
4. **The pipeline model.** A flow is a DAG of typed steps. Steps marked as datasets persist in smaltdb; intermediate
   steps compose into one query so the engine optimizes across them; only what changed is rebuilt. (Q-7)
5. **Steps.** Inputs, SQL, visual (no-code) tools and outputs. Visual tools only need to drive the engine: they compile
   to whatever smaltdb accepts, which is SQL today and plans once the public plan API exists. smaltdf steps come when
   smaltdf ships. (Q-8, Q-9, Q-10)
6. **Ontology and actions from the start.** Object types, link types and action types (validated, permissioned edits)
   are part of the first version. The ontology lives in smaltfl and does not change smaltbi's model format. (Q-11,
   Q-12)
7. **Enforcement from the start.** Access policies are part of the core and enforced on every path smaltfl controls:
   reads, actions and everything shared. Data in a person's own browser is theirs to read; enforcement protects what
   is shared, and what a server will serve later, with the same policies. (Q-13)
8. **Hashes all the way through.** Code (flows and steps), data (inputs and outputs) and runs are content-hashed, so
   any run can be recreated and its output verified. (new)
9. **Metadata in both places.** In the flow's JSON document, which is the source of truth and diffs in Git, and in the
   database, where it can be queried alongside the data and where runs are recorded. (Q-16)
10. **Single user, shareable.** One person builds and runs a flow; flows (and, under policy, their data) can be shared
    with others. (Q-20)
11. **A visual UI** from the start, built the family's way: plain DOM, CSS and SVG, with smaltdb and smaltkit as the
    only runtime dependencies. (Q-22)
12. **No cross-repository changes for now.** smaltfl uses the published or pinned APIs of smaltdb, its plugins and
    smaltkit, and keeps shared-looking code (the canvas, data steps) in this repository. A change in another smalt
    repository is discussed with stenhoor first. (Q-23, Q-24)
13. **Words.** The name is `smaltfl`, one lowercase word, said "smalt-flow". Tagline: **Small. Alternative. Flow.**
    Positioning: **Data pipelines for smaltdb.** (Q-25, Q-26, Q-27)
14. **Colour and mark.** Round 1 shows every candidate colour (cobalt teal, plum, smalt only) with every mark
    direction (Fork, Merge, Relay, Pipe-forward); the picks follow feedback. (Q-28, Q-29)
15. **A reference scenario.** NYC taxi trips with weather, shared with people who may see only certain districts
    ([../SCENARIO.md](../SCENARIO.md)), is what smaltfl is built, tested and optimized against. (new)

## Consequences

- **Hashes change how rebuilds are decided.** "Only what changed is rebuilt" is keyed by content hashes, as in a build
  system: a step's key is the hash of its definition, its inputs' keys and the parameters it uses. This covers
  external inputs too, which smaltdb's `is_fresh` flag cannot. Materialized views remain a tool, not the mechanism.
- **Inputs are snapshotted.** Recreating a run needs the exact bytes it read, so external inputs are stored by content
  hash (Q-19 changes: datasets are versioned by hash, with a retention policy).
- **Verification needs determinism.** Anything that changes results between runs of the same plan (row order,
  floating-point summation order under parallel execution, `now()`) is pinned or excluded for verified runs.
- **Enforcement without a server means cryptography.** Shared data is encrypted per policy partition and its keys are
  wrapped for each permitted recipient, with WebCrypto (no dependencies). Recipients need an identity that holds a
  key pair (Q-31).
- **The ontology, actions and policies are smaltfl's own.** If smaltbi later reads them, that is an export from
  smaltfl or a decision for smaltbi, not a change made from here.
- **The server comes later, by design.** The core and the runtime are written so they can run headless; nothing in v1
  depends on a server.
- **Brand assets live in smalt-brand.** The picks become one `brand/smaltfl` change there, which needs push access to
  that repository or a fork (Q-30).
