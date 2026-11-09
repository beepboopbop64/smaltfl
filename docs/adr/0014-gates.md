# ADR 0014: Gates: bronze, silver and gold checks in the notebook, written bands and due dates in the ontology, a sealed gold

- **Status:** proposed, 2026-11-09. It records the maintainer's plan and answers of 2026-11-09 (Q-110 to Q-117,
  docs/OPEN_QUESTIONS.md), given after a survey of how layered data-quality checks are built and shown (§Sources).
  Nothing in it is built; the control estate (ADR 0013 §8) is its answer key.
- **Date:** 2026-11-09
- **Builds on:** [ADR 0009](0009-paused-not-published.md) (holds, claims, decisions, releases), [ADR 0010](0010-any-dataset.md)
  (watches, measures, histories, several loads), [ADR 0011](0011-notebooks-as-the-step-surface.md) (notebooks are the
  step surface), [ADR 0012](0012-visual-first-in-two-minutes.md) (the brief, the status line), [ADR 0013](0013-discovered-checks.md)
  (the combination and forest judges, a watched step, the control estate).
- **Amends:** ADR 0010 §10 (a watch's settings: they gain a gate), ADR 0013 §3 (the forest's place among the learned
  checks), ADR 0009 §3 (a refused file becomes a held day under the schema check, its slice 3).

## Context

The maintainer's words: *an enforced bronze, silver, gold set of checks*. The input card is the raw data as it comes
in, with no transform, checked for the obvious (a lot of records missing, a status whose mix shifted drastically, a
combination off) and then for the non-linear (some combination of columns odd, still inside the one dataset). Silver
is after the joins, the same two kinds of check over what the joins introduce. Gold is the dataset people read: the
same data, checked once more where there is a reason, then sealed, stamped, signed and hashed. Every check
configurable and tied to the ontology: if a pass rate is known to sit around a band, that band is in the ontology, and
a change to it is a recorded change. Beside the deterministic checks, two learned ones: an isolation forest for the
odd, and a classifier trained to tell today's rows from earlier days', which should fail unless something is
different about today.

What the survey found (§Sources):

- The layer split is settled practice: structure and contract at the landing card (schema, freshness, volume),
  record rules at the cleaned card, reconciliation and a learned band at the served card; dbt's advice is not to
  re-test at silver what bronze already caught, but what the joins and calculations introduce. Publishing is a gate
  everywhere (write-audit-publish, blue/green, branches), which the hold already is.
- Written and learned checks are shown apart in every tool (Soda's contracts versus monitors, Elementary's tests
  versus anomalies); a stage collapses to one worst state in three or four words with a one-line reason, the detail
  one tap away. Configuration that works has few knobs: on or off, warn or block, a sensitivity with a live band
  preview, and a feedback action with a reason that maps to one effect, applied forward and reversible. No tool
  records the accepted change as an auditable decision; this repository's record does.
- The classifier two-sample test (Lopez-Paz and Oquab 2017; Kim et al. 2021) is consistent for any classifier
  better than chance; libraries use a shallow tree model, held-out AUC against a binomial or permutation null,
  equal-size subsampling and permutation importance to explain. Shallow boosted stumps over one-hot columns run in
  tens of milliseconds in a browser. The known pitfall is ours: one-day windows "detect weekends" unless today is
  compared with like days; a legitimate change is a re-baseline, which the accept decision already is. It needs rows.
- Isolation forests are the row-level norm (a vendor needs a hundred rows a day); at day level, sayable features
  and path-based attribution (DIFFI) beat SHAP; the cut is calibrated from the reference's own scores; with k
  metrics expect about k·α chance trips, so attribute and group before alerting.
- Sealing in BI tools is a badge with who, when and a note, revoked on change; a signature proves who vouched and
  that nothing changed, not that the data is good. This repository signs manifests; what is missing is the badge and
  the evidence behind it.
- Nothing in the field names the SLA look-alike (many due dates landing together, the usual share late). The
  estate's files carry the due dates, so it can be said deterministically.

## Decisions

### 1. A gate is a cell in the notebook, and the app's toggles write that cell (Q-110)

Each stage's gate is written where its logic is: a `gate()` call from `smaltfl/notebook`, beside `source()`, the
join, or `publish()`, as `check()` is today:

```ts
cell('tls_gate');
export const tls_gate = gate(tls, { layer: 'bronze', checks: { schema: 'hold', amount: 'hold', values: 'hold', shares: 'warn', pairs: 'warn', forest: 'warn', classifier: 'off' } });
```

The flow derives a `GateDef` per node from it (`notebook.ts`), the plan carries it in the watch's settings (plan/4:
a watch gains `checks`; the flow hash covers it), and every judge reads it. A watched source without a gate has the
bronze defaults, a watched published step the silver defaults, a published output the gold defaults (§2). The app
offers each check as a toggle (on or off, warn or hold) on the card's Checks tab; a toggle **edits the notebook's
gate cell** (the options object rewritten, the notebook re-expanded, the document re-hashed) and records a `flow`
entry, as any document change does. A notebook without a gate cell gains one when a toggle is first used. The
notebook stays the one surface; the app is a way of writing it.

### 2. The vocabulary of checks, and what holds by default (Q-114)

Deterministic checks hold the day by default; learned ones warn, unless the ontology marks the value bad. A toggle
flips either. By layer:

| Check | What it says | Bronze | Silver | Gold |
|---|---|---|---|---|
| `schema` | the columns and types are the contract's (a refused file is this check's hold, not a failed run: ADR 0009 slice 3) | hold | hold | hold |
| `amount` | rows against a day like it, or the written band | hold | hold | off |
| `blanks` | a column blank beyond its range | hold | hold | off |
| `values` | a value never seen; a bad value up; a written band missed | hold | hold | off |
| `rules` | the step's `check()` rules, their drop share against its limit | hold | hold | hold |
| `scope` | rows for keys the inventory says are out of scope, keys in scope with no row (§4) | hold | hold | off |
| `needs` | a value this dataset's rule says another forbids (§4) | off | hold | off |
| `due` | what was due and what ran late, against the usual late share (§3) | hold | hold | off |
| `reconcile` | rows by key equal the step it reads; keys unique; no blank key (§6) | off | off | hold |
| `shares` | a value's share against its learned range | warn | warn | off |
| `shape`, `hours` | a measure's quantiles, a time's hours | warn | warn | off |
| `pairs` | two values together beyond what their shares explain (ADR 0013 §2) | warn | warn | off |
| `forest` | the day unlike the days before (ADR 0013 §3) | warn | warn | off |
| `classifier` | today's rows told apart from like days' rows (§5) | warn | warn | off |

A silver finding that repeats a bronze one (a column blank because a file was empty) is attributed to the bronze gate
and told as "because tls", never counted twice (§7); only what the joins introduce (scope, needs, pairs across
datasets) is silver's own.

### 3. Written bands and due dates live in the ontology; changes are recorded decisions (Q-111, Q-113)

- A property's value may carry an **expected band**: `expect: { share: [0.85, 0.95] }` on the value in the
  ontology, applying wherever the column appears (narrowed by `datasets` as today). The `values` check compares the
  share with the band first, the learned range second; the band is said in the finding ("Passing 71%, the band is
  85–95%"). A lasting change outside the band is told as such and offers **Accept the new band** (ADR 0009
  amendment 1's `accept`, with the band as the level): the decision is recorded, and the ontology's band is edited
  from it; the history and the verifier read the decision, as they read levels today.
- A date column may carry a **due mark**: `due: { status: 'status', miss: 'fail' }`, saying it is the day the row's
  obligation is due and which status is the miss. The `due` check counts, for the day, the rows whose due date fell
  on or before it and are still missed, against the rows that were due: the late share, with its own history. A day
  with many due dates and the usual late share is told as a note ("312 due, 9% late, as usual"); a day whose late
  share is beyond its range holds ("49 due, 61% late; usually 10%"). Nothing about dates is written in code.

### 4. Scope and dependency are written rules, judged against the inventory (Q-110)

- `scope`: a gate may name the inventory and the condition a row must meet to be in scope, `scope: { of: apps, key:
  'app_id', where: "internet_facing = 'yes'" }`; the check says how many rows are for keys out of scope and how many
  keys in scope have no row ("40 rows for applications that aren't internet-facing"; "41 internet-facing Payments
  applications have no row").
- `needs`: a gate may say what another dataset forbids, `needs: { from: encryption, key: 'app_id', when: { status:
  'fail' }, then: { status: 'fail' } }`: a row that passes while the other fails is a contradiction, counted and said
  ("41 applications pass key rotation while failing encryption at rest").

Both are deterministic, written in the notebook, and said in words with the keys to hand.

### 5. The classifier, and the sample it learns from (Q-112, Q-117)

A shallow boosted model (stumps of depth at most 2, at most 50 rounds) over the one-hot of the dataset's counted
and typed columns, trained to tell today's rows from a sample of like days' rows (the same slot, the weeks before,
subsampled to equal size), judged by held-out AUC on a 50/50 split against the binomial null, calibrated as
Evidently's small-data path does (against random labels' AUCs). Explained by permutation importance on the held-out
half ("status and internet_facing explain 70% of what tells today apart") and the top today-like rows. Told as
unusual; the accept decision adds today's rows to the reference.

The rows come from a **kept sample**: a few hundred rows a day per watched node, written by the history builder and
appended by each run, in a sidecar beside the history (`sample.<watch>.json`, hashed in the data list, pinned in the
engine). Sampled **stratified by the dataset's typed columns** (the ontology's coded columns, criticality, exposure,
data class) and status, so rare types are present, **plus every row a judge flagged** that day. The sample is the
one place raw rows leave the engine for a file, so the classifier is off where no sample is kept, and the gate says
so.

### 6. Gold: reconciliation, then the seal (Q-115)

Gold's own check is `reconcile`: the rows by key equal the silver step's (no fan-out, no loss), keys unique, no
blank key. A run whose gates all passed, or whose holds were all decided, is **sealed**: the signed manifest is the
seal. The output card shows a badge; a tap shows what was checked at each gate with its result, who signed, when,
and the content hash. A re-run or a later decision unseals it, recorded. The audit bag carries the gates' results
with the manifest, and verify re-derives them.

### 7. On screen (Q-116)

The canvas keeps its free layout. Each watched card carries its gate's worst state as its mark, with a one-line
reason, written and learned apart ("‖ schema: file has 3 of 4 columns"; "⚠ forest: unlike any day"). The card's
sheet gains a **Checks** tab: one row a check, name, kind (written or learned), on or off, warn or hold, today's
result against its band, the learned ones with the band drawn; a feedback action with a reason that maps to one
effect (expected once; the new level; not interesting), each a recorded decision. The status line and the brief name
the **furthest-upstream** gate that failed; downstream findings read "because tls".

## The answer key: the control estate's March

| Day | Planted | Gate | Check | Verdict |
|---|---|---|---|---|
| Mon 4 | MFA file has no rows | bronze mfa | amount | hold: "Almost no apps: 0" |
| Thu 7 | logging lacks retention_days | bronze logging | schema | hold: "file has 4 of 5 columns" (no failed run) |
| Fri 8 | key rotation passes where encryption fails | silver posture | needs | hold: "41 pass key rotation while failing encryption" |
| Tue 12 | WAF pass rate collapses | bronze waf | values (band) | hold: "Failing 60%, the band is 0–15%" |
| Wed 13 | WAF rows for apps not internet-facing | bronze waf | scope | hold: "40 rows for applications not in scope" |
| Thu 14, Fri 15 | vulnerability due dates cluster | bronze vuln_sla | due | note: "312 due, 9% late, as usual"; publishes |
| Fri 15, Sat 16 | half the pentests due | bronze pentest | due | note; publishes |
| Tue 19 | backup scanner outage | bronze backup | values (band on not_assessed) | hold: "Not assessed 45%, the band is 0–5%" |
| Thu 21 | TLS rows twice | bronze tls; gold | amount; reconcile | hold: "More apps: 406 (+100%)"; "2 rows an application" |
| Fri 22, Sat 23 | six in ten DR exercises late | bronze dr_exercise | due | hold: "49 due, 61% late; usually 10%" |
| Tue 26 | no TLS rows for Payments | bronze tls | scope | hold: "41 in-scope applications have no row" |
| Fri 29, Sat 30 | access reviews due | bronze access_review | due | note; publishes |
| every other day | | | | publishes and seals |

The forest and the classifier are told as unusual where they speak; the key asserts they are quiet on the calm days
and that no silver finding repeats a bronze cause.

## Consequences

- **Order of work**, one PR each, each judged against the key:
  1. `gate()` in the notebook, `GateDef`, plan/4, the defaults, the Checks tab read-only, the gate mark on cards;
  2. the ontology's `expect` bands and `due` marks, the `values` check on bands, the `due` check, Accept the new band
     as a recorded decision that edits the ontology;
  3. `scope` and `needs`, and upstream attribution ("because tls");
  4. the kept sample and the classifier;
  5. gold's `reconcile` and the seal badge with its evidence; verify and the audit bag carry the gates;
  6. toggles that write the gate cell, and feedback reasons as decisions;
  7. a refused file as the schema check's hold (ADR 0009 slice 3).
- **What is reused:** every judge of ADRs 0008 to 0013, the history, measures, claims, holds, decisions, releases,
  the record, the signed manifest and verify. The gate is a way of naming and switching what exists, plus four new
  checks (`due`, `scope`, `needs`, `reconcile`, `classifier`) and one new stored thing, the sample.
- **Hashes:** plan/4 for a watch with `checks`; the sample file has its own tag (`sample/0`) and vectors; nothing
  else changes encoding.
- **Risks:** the sample's size and privacy (a few hundred rows a day, opt-in, pinned and hashed like a history);
  the classifier's false alarms on small days (the binomial null and like-day references are the guard, and it only
  warns); toggles that rewrite notebook text (the rewrite is of one options object in one cell, and is a recorded
  flow change like any edit).
- **Open:** Q-118 (the gold reconcile's key: declared in the gate, or taken from the ontology's `lookup`), Q-119
  (whether a silver `needs` rule should be derivable from the ontology rather than written per gate).

## Sources (the survey of 2026-11-09)

- Layers and publishing: Databricks medallion (docs.databricks.com/aws/en/lakehouse/medallion.html); dbt, "Test
  smarter: where tests should go" (docs.getdbt.com/blog/test-smarter-where-tests-should-go); Netflix WAP (Ufford
  2017); Iceberg branching WAP (iceberg.apache.org/docs/1.6.1/branching/); lakeFS hooks; Databricks expectations
  (expect, expect_or_drop, expect_or_fail); the Open Data Contract Standard (bitol-io).
- Presentation and configuration: dbt Explorer health signals and test-status lens; Dagster asset checks (WARN/ERROR,
  blocking); Foundry health checks; Databricks quality indicators; Soda metric monitors (expected range versus valid
  range, Mark as expected); Elementary feedback reasons; Monte Carlo and Bigeye autothresholds; Power BI, Tableau and
  Looker certification; WCAG 1.4.1 and Apple's "differentiate without colour alone".
- Classifier tests: Lopez-Paz and Oquab, ICLR 2017 (arxiv.org/abs/1610.06545); Kim, Ramdas, Singh and Wasserman,
  Ann. Stat. 2021; Kaggle adversarial validation (Zając 2016); Alibi Detect ClassifierDrift; NannyML domain
  classifier; Deepchecks MultivariateDrift; Evidently's domain classifier and small-data calibration; the ESANN
  2025 note that one-day windows detect weekends (arxiv.org/abs/2411.16591).
- Anomaly detection: Liu, Ting and Zhou 2008; Extended Isolation Forest (Hariri et al.); isotree's categorical
  splits; DIFFI (arxiv.org/abs/2007.11117); Kartha et al. 2021; Anomalo's segment explanations; Das and Schneider
  (KDD 2008); CompreX (Akoglu et al. 2012); SPOT/DSPOT (Siffer et al., KDD 2017); Datadog, Monte Carlo, SYNQ,
  Metaplane and Sifflet feedback semantics.
