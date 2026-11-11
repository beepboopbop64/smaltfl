# Status

smaltfl is in early development and not published. This page says what is in, as of 2026-11-11. What is built in
detail, how to check it and what is left are in [where the work stands](../HANDOFF).

| Piece | What | State |
|---|---|---|
| Core and runtime | Flow documents, the flow plan and its keys, the smaltdb runtime plugin, signed run manifests, verify, the hash-chained record, audit bags ([ADR 0004](../adr/0004-the-flow-plan), [0006](../adr/0006-integrity)) | In |
| The day's news | One cause a day, drawn visual-first, with word budgets ([ADR 0008](../adr/0008-visual-first-news)) | In |
| Paused, not published | Holds, decisions, fills from another day, accepting a new level ([ADR 0009](../adr/0009-paused-not-published)) | In |
| Any dataset | Calendars, watches, a load's measures, several watched sources ([ADR 0010](../adr/0010-any-dataset)) | In |
| Notebooks | smaltnb notebooks as the step surface; the notebook read as a page with outputs, callouts, models and your own cells ([ADR 0011](../adr/0011-notebooks-as-the-step-surface)) | In |
| The brief | A held day told in SBAR order ([ADR 0012](../adr/0012-visual-first-in-two-minutes)) | In |
| Checks nobody wrote | Pair associations, the isolation forest, the classifier on a kept sample ([ADR 0013](../adr/0013-discovered-checks)) | In |
| Gates | Bronze, silver and gold checks, bands, due dates, scope, dependency and reconciliation rules, the seal ([ADR 0014](../adr/0014-gates)) | In |
| The bronze layer and the ontology | What a dataset's rows are, rules people set, shared ontologies, allowed fixes, the models' columns ([ADR 0015](../adr/0015-the-bronze-layer)) | In |
| SQL through smaltql | When smaltdb's public plan API lands, SQL steps are bound through smaltql | Waiting on smaltdb |
| Publishing to npm | `smaltfl` and `smaltfl/notebook` | After smaltdb 0.9.0 |

## Demos

- [The control estate](/app/){target="_self"}: 600 applications, twelve controls, a year of history and a planted
  March.
- [The sign-in log](/signins/){target="_self"}: a year of generated sign-ins, the shared ontology's rules and fixes, and
  two days only the models see.

## Depends on

smaltdb 0.9.0, pinned to a commit in `packed.json` until it is on npm; smaltnb and smaltkit (smaltty) for the
notebooks. A change smaltfl needs in another smalt repository is discussed with its owner first
([ADR 0001](../adr/0001-initial-decisions)).
