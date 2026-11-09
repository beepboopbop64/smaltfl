# ADR 0007: The repository moves to stenhoor/smaltfl

- **Status:** accepted
- **Date:** 2026-11-06

## Context

ADR 0001 §1 kept the repository at `beepboopbop64/smaltfl` "for now" (Q-21). The family's repositories are under
`stenhoor`, and `stenhoor/smaltfl` now exists for smaltfl, with its maintainers as contributors.

## Decision

smaltfl's home is `stenhoor/smaltfl`. Its history comes across whole: the repository's first commit is joined to the
work so far by a merge, so neither history is rewritten and every commit keeps its hash. The data branch (`data`)
comes across as it is, so the data commits that runs and audit bags name (`Data-Commit`) still resolve. (Q-21)

## Consequences

- `package.json` and the data job's user agent name `stenhoor/smaltfl`. ADR 0001 stays as it was written; this record
  replaces its last sentence of §1.
- Work continues on `stenhoor/smaltfl`. `beepboopbop64/smaltfl` keeps the history up to the move and gets no new
  work.
- Audit bags made before the move name commits that are in both repositories, so an auditor checks them from a
  checkout of either.
- **The route (2026-11-09, ADR 0011 §9):** `beepboopbop64/smaltfl_fork`, a fork of `stenhoor/smaltfl`, carries the
  history: Steve's initial commit is its root, so the fork's `main` fast-forwarded to `5bdb1b4` with no merge, and the
  `data` branch went across as it was (`0ca4dd1`). The pull request to `stenhoor/smaltfl` is opened from the fork.
