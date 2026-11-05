# ADR 0004: The flow plan: people say what, the machine decides how

- **Status:** accepted
- **Date:** 2026-11-05
- **Builds on:** [ADR 0001](0001-initial-decisions.md) §4, §5 and §8; [ADR 0003](0003-third-round-decisions.md)

## Context

A flow can be written in more than one way: with the builder now, with SQL steps, and later with notebooks (smaltnb,
whose repository is still empty) and dataframes (smaltdf). Each of these is for people: visual, readable,
explainable. Running a flow is a different job. It has to be repeatable, hashed exactly, and fast on smaltdb, and none
of that should depend on how a step was written.

smaltdb draws the same line one level down (its ADR 0014 and 0015). Every language compiles into one typed,
serializable plan, which the engine validates and then optimizes; in the owner's words, "smaltdb's job is execution
performance". At the time of writing, its steps 1 to 6 have landed (plans as plain data with a codec and a validator,
bound statements and `bind()`); step 8, the public plan API (`preparePlan`, `queryPlan`, also inside a plugin's
`MethodContext`), has not.

## Decisions

1. **Two layers.** What people write, the **flow document** (the canvas, SQL text, later notebook cells), is the
   source of truth and stays readable. What the machine runs is the **flow plan**: derived from the document by a
   deterministic translation, never edited by hand, and not designed to be read. An Explain view shows it to whoever
   wants to see it, as EXPLAIN does in a database.
2. **One flow plan, whatever wrote it.** Every surface translates into the same plan, so the runtime, the optimizer
   and any other automated client never depend on how a step was written. smaltfl's runtime talks to smaltdb
   directly, as a plugin in its worker; notebooks will be a surface beside the builder and SQL, not a path to the
   engine.
3. **What the flow plan is.** Complete (parameters filled in, inputs pinned by content hash, every column's type
   known), canonical (one encoding for each meaning, so equal plans have equal bytes and equal hashes), versioned and
   validated before it runs. Its query parts use smaltdb's plan format once that is public. Around them it adds what a
   flow needs: pinned inputs, expectations, what to store, policies and shares. Until the public plan API, a query
   part is SQL text with its static column types, which the runtime plugin reads from the engine.
4. **People say what, the machine decides how.** What a flow computes lives only in the document, where a person can
   read and review it. How it is computed (which steps are stored and which are folded into a later query, which
   columns are pruned, where filters are pushed, the order of the work, and later browser or server) lives in the
   flow plan and may change freely, as long as the output hashes do not.
5. **Two optimizers, two jobs.** smaltfl optimizes across steps: reuse by key, store or fold, pruning and pushdown.
   smaltdb optimizes within each query. smaltfl hands the engine large, clean queries and uses its strengths
   (memory-only intermediates, columnar tables, Parquet pushdown) rather than second-guessing its planner.
6. **Keys and manifests come from the flow plan.** A step's key is the hash of its plan node, its inputs' keys and the
   engine's version, so moving or renaming a card rebuilds nothing, and two surfaces that produce the same plan share
   a key. A run's manifest records the hash of the flow plan that ran, and the plan is stored with the run, so a
   re-run replays exactly what ran, even after smaltfl itself has changed.
7. **No agent in smaltfl for now.** An AI assistant that builds and tunes flows would be its own repository (smaltai,
   later) and would work through the flow plan like any other automated client. For now, the maintainers build flows
   with Claude Code.

## Consequences

- **The first code is the flow plan and its hashing,** since keys, reuse and manifests depend on them.
- **SQL steps are opaque until the public plan API.** Reuse and store-or-fold work for them now; pruning, pushdown
  through them and their column lineage arrive with plans, without changes to documents or screens.
- **Floating-point results.** A fold can change the order in which a `SUM` adds its values, and so its last digit
  (Q-34). The hash check catches this: such a rewrite is a new result, not a free one. Order-independent (correctly
  rounded) sums in smaltdb would make folds free for floating-point aggregates too. That is a question for stenhoor
  (ADR 0001 §12).
- **ADR 0001 §5 is refined, not replaced:** the visual tools still drive the engine with whatever it accepts, but they
  do it through the flow plan, never directly.
