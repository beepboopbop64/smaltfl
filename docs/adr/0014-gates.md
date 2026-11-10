# ADR 0014: Gates: bronze, silver and gold checks in the notebook, written bands and due dates in the ontology, a sealed gold

- **Status:** accepted, 2026-11-09; slices 1 to 4 built 2026-11-10 (§"As built"), slices 5 to 7 in order. It records the
  maintainer's plan and answers of 2026-11-09 (Q-110 to Q-117, docs/OPEN_QUESTIONS.md), given after a survey of how
  layered data-quality checks are built and shown (§Sources). The control estate (ADR 0013 §8) is its answer key.
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

## As built

### Slice 1 (2026-11-10): the gate cell, plan/4, the defaults, the rule, the Checks tab

- **The cell.** `gate(node, { layer?, checks? })` from `smaltfl/notebook` (`src/notebook.ts`), in a cell of its own
  beside the node; the node passes through it, so a later cell may read either name. `src/core/notebook.ts` reads it
  as it reads `check()`: the document gains `gates: { <node>: { layer, checks } }` (part of the flow hash, as the
  steps are), the outline a cell of kind `gate`, and `cells["gate:<node>"]` where it is written (display only). A gate
  names a source, or a step the flow publishes or watches; one a node; its layer written or the node's own (a source
  bronze, a watched step silver, a published step gold); a check or a mode outside the vocabulary is refused, as is
  a gate in a document without notebooks (`validateDocument`).
- **The vocabulary** (`src/core/gates.ts`): `CHECK_NAMES` as §2's table, `WRITTEN` the deterministic ones, `JUDGED`
  the ones this build tells (`schema`, `amount`, `blanks`, `values`, `rules`, `shares`, `shape`, `hours`, `pairs`,
  `forest`; `due`, `scope`, `needs`, `reconcile` and `classifier` are named, switchable, and said to be not judged
  yet), `LAYER_DEFAULTS` as the table. `checkOf` maps a finding's kind to its check: volume→amount, hours→hours,
  share and gone→shares, new→values, missing→blanks, shape→shape, dropped and rule→rules, schema and integrity→schema,
  pair and combo→pairs, unlike→forest; the calm day, a day not judged, the weather and a table's own facts belong to
  none.
- **plan/4.** A document with any gate translates to plan/4: plan/3's shape, each watch carrying `checks`, every check's
  mode filled in from its gate or its layer (`gateChecksOf`), in the vocabulary's order; `validatePlan` refuses a plan/4
  watch without them and a plan/3 watch with them. A document with no gate is judged and hashed as before (plan/0 to
  plan/3): the taxi, the sign-ins and the controls example are untouched, and so are their vectors. The defaults of §2
  reach only a flow that declares a gate, by that same rule.
- **The rule** (Q-114), in `newsOf` before the findings are told together: `JudgeSettings.checks` (from `judgeOf`,
  null without gates) and `gated(finding, checks)`: under `hold` the finding keeps its own severity; under `warn`
  something wrong is told as unusual, unless the finding is about a value the ontology marks bad (`Finding.bad`), which
  is always something wrong; under `off` it isn't told. Each finding carries its `check`. The story, the claim, the
  hold and the release read the capped findings and change nothing of their own.
- **On screen.** A gated node's card label ends with its layer (`INPUT · CSV · BRONZE`; `CELL · SQL · OUTPUT · GOLD`),
  the gate mark of §7 in its first form. The card's sheet gains a **Checks** tab (`checksTab`): one row a check, its
  name and what it says, written or learned, hold, warn or off, and today's result (the worst finding of that check, a
  tap to it in News; "as usual"; "off"; "not judged in this build"); below it the gate cell as written, or "No gate
  cell yet: the layer's defaults". Another watched source's own findings are told from its base and tail
  (`loadFindings`, `rangesForLoad`), so every control's card has its Checks. Read-only: toggles are slice 6.
- **The estate's notebooks** write TLS's gate in full (§1's example), the posture's silver, and a gold gate on each of
  the three summaries; the other eleven controls take bronze's defaults.
- **Against the answer key** (`test/estate-flow.test.ts`, the histories from mid-December, March's loads one a day):
  the empty MFA file holds on the amount ("Almost no apps: 0"); the doubled TLS file ("More apps: 406 (+100%)") and
  both scope days hold on the amount (slice 3 will name scope); the WAF collapse holds by the bad value's share
  ("status fail 17× usual"), the rule's exception; the backup outage holds by the blanks its not-assessed rows leave,
  told from the not-assessed share (slice 2's band will say it); the refused logging file is a failed run (slice 7); a
  learned finding that isn't a bad value publishes as unusual (not assessed up on key rotation, a day unlike any on
  privileged access). **Still wrong against the key**, as the next slices' vectors: the SLA look-alikes
  (vulnerabilities Fri 15, pentests Sat 16 to Mon 18, access reviews Sat 30) hold by the bad value `fail` rising, and
  the DR problem holds for the same reason, not by its late share (slice 2's due mark must absorb a bad value's rise
  on a day with the usual late share, and say the DR day by its share); Patch Tuesday fills `next_due` in on almost
  every row, so the blanks check holds the vulnerability file for three days ("Next_due blank: 6%, usually 43–89%";
  a due-marked column's blanks are not a finding, slice 2); the contradiction day publishes (slice 3's `needs`).

### Slice 2 (2026-11-10): written bands and due marks in the ontology, the `values` check on bands, the `due` check, Accept the new band

- **The marks** (`src/core/ontology.ts`): a property's `expect: [{ value, share: [low, high], datasets? }]`, a band
  on a value's share for the datasets it names (else wherever the column appears; a band naming the dataset wins over
  one naming none); a date column's `due: { status, miss, within? }` (the window four weeks by default). Both are a
  gate's written checks: `validateDocument` refuses them in a flow without gates, and plan/4's watch carries them
  (`expect: [column, value, low, high][]`, `due: [column, status, miss, within][]`; `marksOn`), so every plan before
  plan/4 is the plan it was.
- **The `values` check on a band** (`newsOf`): a value with a band is judged by the band alone: outside it, something
  wrong, a `band` finding ("Status fail: 59.6% (band 0%–15%)", the band in `Finding.band`), written (`check:
  values`), so it holds under the layer's defaults and leads the day after a bad value (`story.ts`, `bandLead`);
  inside it, nothing is said of the value, whatever its learned range would say. A bad value with a band is still
  never softened.
- **The `due` check.** The measures gain `due` counts where a watch has a due mark (`MeasureSettings.due`,
  `Measures.due`: the rows due on the slot's day, and the rows still missed by each past due date within ninety days;
  counted from the same scan; absent, and the record byte for byte what it was, where no mark is set), and the
  history keeps them day by day (`HistoryFile.due`, still smaltfl-history/3 with an optional block; `appendPeriods`,
  `periodOf`, `samePeriod`). The judge (`lateAt`, `lateUsual`, `history.ts`) takes **yesterday's cohort**: what was due
  the day before and how much of it is still missed today, against the usual share pooled over every earlier cohort
  seen at the same age, by a binomial test (three standard errors over the usual, and five rows or a twentieth of the
  dues over it): something wrong ("Late: 60 of 100 due (usually 10%)"), else a note ("Late: 10 of 100 due (usually
  10%)", with the window's counts in the detail). Not judged until twenty rows have been due. Where it is judged, the
  miss value's own rise, its first appearance and the date column's blanks are the due check's to tell: no bad-value
  finding, no new-value finding, no blanks finding for them. A `late` series (`{ of: 'late', column }`, the window's
  late share) is kept for the charts.
- **Why a cohort, not a window share.** A window's late share decays as late rows are fixed, so a day after a cluster
  (everything still late) against the pooled windows (half fixed) always read wrong; every cohort at the same age is
  the like-for-like the maintainer asked for (Q-113). The vulnerability file counts, on a due day, only the findings
  still open (a finding fixed early has left the file), so its cohorts read "78 of 81 late" every month, and as usual:
  the statistic is honest about what the file can say.
- **Accept the new band** (Q-111): a day held by a band finding offers "Accept the new band: 55–65%" (`fill.ts`
  `levelOf`, five points either side of the day's share); the decide entry's `level` carries `band: { column, value,
  share }` (`hold.ts`, `isLevel`), and when its release applies the app edits the ontology from it (`applyBand`, a
  dataset-named band on the property) and the next run records the document change as any edit is recorded.
- **The estate** marks `status` with a band on not-assessed everywhere (0–5%) and on WAF's failures (0–15%), and
  `next_due` as due (status, miss `fail`); its fixture's late rows carry the due date they missed in `next_due`, as a
  late obligation would.
- **Against the key** (`test/estate-flow.test.ts`, two and a half months of history): the WAF collapse holds on its
  band and the backup outage on its, each said with the band; the vulnerability and access-review clusters publish as
  unusual (the pass share's fall), their misses the due check's; Patch Tuesday's `next_due` filling in is no finding.
  **Still wrong against the key:** the pentest cluster holds by the bad value and the DR problem by the new value,
  because in the test's short base neither control has had twenty due dates for the due check to learn from (the
  app, built on a year, judges both: Mar 16 publishes, Mar 23 holds as "Late: 30 of 49 due"); the posture repeats each
  control's finding as its own (slice 3); the contradiction day publishes (slice 3).

### Slice 3 (2026-11-10): scope and dependency rules, counted in the engine; what the joins introduce is silver's own

- **The rules in the gate** (`gate()`, `src/notebook.ts`; `GateDef.scope`, `GateDef.needs`, `gates.ts`): `scope: { of: apps,
  key: 'app_id', where: "internet_facing = 'yes'", own? }`, the inventory named by its name in the notebook (a source of
  the flow: the notebook reader resolves the name, `NameRef`, and refuses a step), its key column, the condition a
  key in scope meets (SQL over the inventory, bound as any SQL is) and the node's own key column when it differs;
  `needs: { when: { key_rotation: 'pass' }, then: { encryption: ['pass', 'exception', 'not_assessed'] } }`, a row
  matching `when` must match `then` (a value may be a list; a blank never holds), within the row or, with `from` (a
  source) and `key`, with `when` read on that source's row with the same key. plan/4's watch carries them (`scope` by
  the inventory's table, `needs` with each dataset's table), validated.
- **Counted in the engine** beside every other measure (`emitScopeCounts`, `emitNeedsCounts` in `emit.ts`; the
  plugin's `measureTable`): the rows out of scope (a blank key among them), the keys in scope with no row, the keys in
  scope, and each rule's contradictions; `Measures.gate`, `HistoryFile.gate` (only where the gate writes a rule), the
  history builder and the test worlds keep them, and `scopeOut`, `scopeMissing` and `needs` are series. The judge
  (`newsOf`) says them in words ("40 apps out of scope"; "50 in scope with no app"; "41 apps: key_rotation pass needs
  encryption pass/exception/not_assessed"): something wrong at five rows or more past twice the usual high (or with no
  history), a note for a few, since an inventory lags; a broken rule leads the day after a bad value, a band and a due
  share (`story.ts`, `ruleLead`), so the scope creep reads as scope, not as more rows.
- **Upstream attribution** (§2, §7): a watched step's story is told with what each watched source it reads said of the
  day (`StoryOptions.upstream`; `loadClaim`'s `upstream`; the engine passes the page's claims to `tellClaim`, the app
  the other loads' claims, `upstreamFor`). A finding about a column that carries a source's name (the posture's
  `tls`, from the source `tls`) is that source's to tell, whatever its day said: it follows from the source (`tier:
  follows`, `because: upstream:tls`) and is never loud here. When a source upstream had something wrong and the
  step's rows moved, the step's whole day follows from it (its rows are its sources'), a written rule excepted. Only
  what the joins introduce is silver's own: a dependency, a pair across datasets, the forest.
- **The estate** writes a scope on TLS and the WAF (internet-facing applications of the inventory) and the dependency
  on the posture (key rotation passing needs encryption passing, excepted or not assessed).
- **Against the key** (`test/estate-flow.test.ts`): the contradiction day holds on the posture's `needs` ("41 apps:
  key_rotation pass needs encryption pass/exception/not_assessed"); the scope days hold on the WAF's and TLS's scope
  ("40 apps out of scope"; "50 in scope with no app"); the posture no longer repeats a control's finding as its own
  (the empty MFA file, the doubled TLS file, the look-alike clusters hold or publish by the controls alone).
  **Still wrong against the key:** the pentest cluster and the DR day, as in slice 2 (the short base); the refused
  file (slice 7); nothing is sealed (slice 5).

### Slice 4 (2026-11-10): the kept sample and the classifier

- **The kept sample** (`src/core/apart.ts`, `SampleFile`, smaltfl-sample/0): a few hundred rows a day per watched node
  (`SAMPLE_KEEP`, 200), stratified by the counted columns (`keepSample`: every stratum present gets at least one row,
  the rest in proportion, taken evenly through the rows as they came, so the same rows always give the same kept
  rows), the last eight weeks kept (`SAMPLE_WINDOW`, `appendSample` drops older days). The plugin's `sample` op
  (`src/plugin/sample.ts`, `sampleLoad`) takes them from a table: an even sample of at most four times the keep, then
  stratified. The history builder writes one beside each history (`--sample`), the app build ships it where the flow
  has gates (`samples` in loads.json, hashed in the data list, `sample.<watch>.json`), the app fetches and pins each,
  samples a source's load before its run, takes a step's kept rows from the run (`RunResult.kept`) and appends both
  (`keepDay`); the engine takes a watched step's kept rows itself when its sample is pinned. The sample is the one
  place raw rows leave the engine for a file: a flow with no gate keeps none.
- **The classifier** (`tellApart`): today's kept rows against the like days' rows of the sample (`likeDays`: the four
  weeks before under no pattern, the same weekday over eight weeks under the weekly one; the record's days left out),
  both subsampled to the smaller side (at least thirty), split in half by turns; fifty boosted stumps on the log loss
  (Newton leaves, learning rate 0.3) over the one-hot of the coded columns' twelve commonest values (plus "other"),
  the standardized measures and a missing flag; judged by the held-out AUC (`aucOf`) against chance (Hanley and
  McNeil's null variance, `z`) and against the AUCs three random labellings reach on the same rows (`floor`);
  explained by each column's share of the AUC lost when its values are shuffled in the held-out half. Twenty-five
  milliseconds on two hundred rows a side.
- **The finding** (`newsOf`, kind `apart`, check `classifier`): told at three standard errors over chance, an AUC of
  0.6 or more and over the floor ("Rows unlike earlier days: AUC 0.80"; "Status and exposed explain 88% of what tells
  today's rows from 27 earlier days' (200 a side; chance reaches 0.52)"); something wrong at four standard errors and
  0.7, which the layer's defaults make unusual (learned). Silent without a sample, or under a gate with the check off,
  or in a flow with no gate.
- **Like days by the pattern** (`likeDays`, as the ranges have them, ADR 0010 §3): the same weekday over eight weeks
  (`weekly`), the same day of the months before with a day either side (`monthly`), else the four weeks before. The
  vulnerability file's watch is monthly in the estate: its open findings land on Patch Tuesday and are fixed over the
  month, so against the four weeks before every day read as unlike (AUC 0.70–0.77), and against the month before only
  Patch Tuesday does (0.81). Dates written as text, times, ids (over fifty distinct values) and clocks (a number or a
  coded number whose day's median climbs with the day: a key's age, the days overdue) are left out of the features:
  each tells today from any earlier day by itself, which is no news.
- **Against the key** (`test/estate-flow.test.ts`): every watch has its sample; the classifier holds nothing, is quiet
  on the look-alike and calm days, and warns on Patch Tuesday for the vulnerability file, as the key allows ("told as
  unusual where they speak").

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
