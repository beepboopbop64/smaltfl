# ADR 0015: The bronze layer: checks driven by the ontology, a mode a column, the card read as a notebook

- **Status:** proposed, 2026-11-10. It records the maintainer's request of 2026-11-10 for the bronze layer and the
  answers Q-120 to Q-131 (docs/OPEN_QUESTIONS.md), after the review of the tip (docs/HANDOFF.md, "The review of
  2026-11-10") and five maps of the code it changes. The choices made on the way are Q-134 to Q-139, each with the
  default built, for the maintainers to confirm or change.
- **Date:** 2026-11-10
- **Builds on:** [ADR 0014](0014-gates.md) (gates, the vocabulary of checks, bands and due marks, scope, the kept
  sample and the classifier, toggles), [ADR 0013](0013-discovered-checks.md) (the forest and the pairs),
  [ADR 0011](0011-notebooks-as-the-step-surface.md) (the notebook is the step surface), [ADR 0010](0010-any-dataset.md)
  (measures, histories, the ontology's marks), [ADR 0008](0008-visual-first-news.md) (drawings and their rules).
- **Amends:** ADR 0014 §1 (a gate's checks gain a mode a column), §2 (bronze's default for the key), §4 (a scope may
  come from the ontology), §7 (the Checks tab), and two rows of its answer key (§9 here).

## Context

The maintainer's words, condensed: *inside the bronze layer, the deterministic checks are tied to the ontology. The
rows are tied to an ontology, which says what is expected (a pass rate), which types of application a dataset applies
to, later which combinations have been found odd. The bronze layer is a notebook that grabs the data and runs those
checks. The card has toggles that turn each check on and off for each column, and a toggle updates the notebook. Each
step shows the data explored (a distribution for each column, at the top), then the news (everything looks good, or a
few things look odd), then the output that goes on to the next box. After the deterministic checks come the advanced
ones, the classifier that tries to tell today from earlier days and the isolation forest, each a toggle, each with a
view that explains its output. Use UI best practice, and make it work for any dataset.*

What the review and the maps found, as far as it decides the design:

- A gate's grain is one mode a check for the whole node. Nothing in the gate, the plan, the judge or the rewrite knows
  a column. A mode acts in one place, `gated()`, on findings that at that point carry one column and one value.
- The ontology can say a column's meaning, codes, bad values, bands and due marks. It cannot say what a dataset's rows
  are, or which objects it applies to: in the estate two of twelve scopes are written, in gate cells, and ten exist
  only as prose in the sources' descriptions.
- The Checks tab is fifteen rows of words. It prints "as usual" for a check that had nothing to judge. A bronze source
  is not the dataset the page follows, so its findings reach no drawing and its News says "Nothing out of the
  ordinary" under its own hold. The model checks have no view, and their evidence is thrown away unless they speak.
- A toggle is lost on reload, and the rewrite of the gate cell assumes a one-line cell.

## Decisions

### 1. The ontology says what a dataset's rows are

The ontology gains `rows`, a list: `{ dataset, of, key?, where? }`. Each says that a dataset has **one row an object**
of an object type (`of`, the type's id), by the type's key column (or `key`, this dataset's own name for it), **for the
objects that meet a condition** (`where`: `{ column: value | values }` over the type's own dataset, every column to
hold, a list any of its values; absent, every object). The estate declares the type `application` (the inventory
`apps`, key `app_id`) and one entry a control: TLS's rows are the applications where `internet_facing` is `yes`, MFA's
are every application.

A watched node with such an entry and no rule of its own in its gate cell is judged by two written rules derived from
it, counted in the engine as ADR 0014 §4 and §6 count them:

- **scope**: rows for objects outside the condition, and objects inside it with no row;
- **key** (the `reconcile` check, by its key alone): an object on more than one row, a row with no key.

A rule written in the gate cell wins over the ontology's. The condition is data, not SQL: `emit.ts` writes it for the
engine, and the page says it in the ontology's own titles ("Internet-facing: Yes"). A type with a key of several
columns gives no derived rule yet, and the page says so. Bands (`expect`) and due marks stay as ADR 0014 §3 has them.
Combinations found odd, kept in the ontology, are left for later.

### 2. A node's checks are lines, each from somewhere

The vocabulary stays ADR 0014 §2's fifteen checks. What a card shows is the **lines** a node has: one a check for the
dataset, one a check a column where the check is about a column, one a value where the ontology gives a value a band.
Each line says where its expectation comes from, and the page groups by it:

| From | Lines | Check |
|---|---|---|
| the ontology | the columns as declared; one row an object; the objects it applies to | `schema`, `reconcile`, `scope` |
| the ontology, a column | its known values (a new one alerts); a band on a value's share; a due date | `values`, `due` |
| the notebook | a gate cell's own scope, dependency or reconciliation; the next cell's `check()` rules | `scope`, `needs`, `reconcile`, `rules` |
| its own history | the amount; a column's blanks; a value's share; a measure's shape; the hours; two values together | `amount`, `blanks`, `shares`, `shape`, `hours`, `pairs` |
| a model | the day unlike the days before; today's rows told from like days' | `forest`, `classifier` |

A line that cannot be judged says why ("no history yet", "no kept sample", "nothing declared", "too few rows"), and
never "as usual". The modes and what holds stay Q-114's: what is written holds, what is learned warns.

### 3. A mode a column, written in the gate cell

A gate gains `columns`: `{ '<column>': { <check>: mode }, '<column>=<value>': { <check>: mode } }`, for the checks
that are about a column (`blanks`, `values`, `shares`, `shape`, `hours`, `due`), a value's entry for `values` and
`shares`. A finding's mode is its value's, else its column's, else the node's (`checks`), else the layer's. The cell is
written a line a column:

```ts
cell('tls_gate');
export const tls_gate = gate(tls, {
  layer: 'bronze',
  checks: { classifier: 'off' },
  columns: {
    protocol: { blanks: 'off' },
    'status=not_assessed': { values: 'warn' },
  },
});
```

A check that is off is **written as off**, not commented out: a comment is in nothing the flow hashes or records, so
the record could not tell a check switched off from one never written. The notebook view draws an off line struck
through, as a commented line reads (Q-135).

- The plan carries `columns` in every plan/4 watch, sorted. plan/4 keeps its tag: it is in no release and had no
  pinned vector (as Q-82 kept plan/2); its first vector is pinned with this change (E15, Q-134).
- A band switched off no longer blinds its value: the value is judged by its learned range again.
- An entry for a column or a check the node doesn't have is refused by name, not ignored.

### 4. A toggle writes the cell, is kept, and can be taken away

- `gatecell.ts` writes `checks` and `columns` in the form above, whatever the cell's lines were, and brings the
  document's derived fields along as before (`test/gate-toggle.test.ts` holds it to smaltnb's parser, now on cells of
  several lines and with comments).
- The page keeps the edited document (notebooks, gates, the ontology) across a reload, by the hash of the document it
  was shipped with, and offers the edited notebook as a file. A change is recorded at once with its reason, a band
  accepted included.
- A toggle moves the flow's hash. Where a day waits for a decision, the page says the day will be judged again by the
  next run.

### 5. The card reads as a notebook, top to bottom

A gated card's **Checks** tab becomes the gate's page, in the order the flow works:

1. **The verdict**, one line: "Everything looks good", or what holds the day and how many things look odd.
2. **Loaded**: the rows that arrived, against a day like it, and the file's integrity.
3. **The dataset's lines** (§2): each with what it expects, today's number drawn against it, and its switch.
4. **The columns**, one card a column: its distribution today (coded values as bars, a number as its quantiles)
   against its usual where a history has it, then that column's lines, each with its switch.
5. **The models**: the forest and the classifier, each with its switch and its view (§6).
6. **The news**: the findings, worst first, as every News tab tells them.
7. **What goes on**: the rows handed to the next box, by name, or that nothing goes on while the day waits.
8. **The cell**, behind a tap: the gate as written, and the notebook as a file.

A line's control is a switch (on at its mode, or off) of 44 px; hold or warn is chosen in the line's detail, which
also says where the expectation is written and draws the last four weeks. The tab keeps its name. News stays the
card's first tab (ADR 0008), and for a node the page doesn't follow it tells the node's own gate's findings, never
"Nothing out of the ordinary" under a hold. The notebook's sheet draws a gate cell as a line with its node's verdict.

### 6. The models have views of their own

Each model returns its evidence whether or not it speaks, and says why when it can't run.

- **The classifier** ("Can today's rows be told from earlier days'?"): the AUC on a track from 0.5 to 1 with what
  chance reaches shaded; the columns that tell today apart as ranked bars, by the AUC each loses when shuffled (not
  shares that add to 100% of nothing); the rows most like today, behind a tap; the like days it compared with, in words.
- **The forest** ("Is the day unlike the days before?"): each learned day's score as a tick, the cut as a line, today
  marked; the measures that moved most, as numbers against their usual.

The thresholds that make each speak don't move.

### 7. For any dataset

Nothing on these surfaces names the estate: the lines come from the document's ontology, the node's measures and
history, and the gate. A dataset with nothing declared still has its columns explored, its history's lines and the
classifier. Two things it lacks are left for the next slice (Q-139): columns to count are taken only from the
ontology's listed values, so the forest and the pairs have nothing to read; and the ontology has to be written by
hand. The slice proposes declarations from the data (a column's values, a band from its usual range, the key), each
accepted as a recorded change, and counts a coded column without being told.

## What moves on the estate

Every control gains its scope from the ontology (ten had none), and every control's file is held to one row an
application. On calm days nothing changes: each control writes exactly one row for each application it applies to.
Two rows of ADR 0014's answer key change, on purpose:

| Day | Planted | Was | Is |
|---|---|---|---|
| Mon 4 | the MFA file has no rows | amount: "Almost no apps: 0" | the same head: an amount that is almost none leads, and the scope's "600 in scope with no app" follows from it |
| Thu 21 | the TLS file's rows twice | amount: "More apps: 406 (+100%)" | key: "203 apps repeat a key" leads, and the amount follows from it |

## Consequences

- **Order of work:** (1) the ontology's `rows`, the derived rules and the estate; (2) a mode a column: the gate, the
  judge, the notebook, the plan and its vector, the rewrite; (3) the models' evidence; (4) the lines as a model the
  page reads (`src/core/gateview.ts`), with its drawings in `viz.ts`; (5) the page: the gate's tab, the switches, the
  News of any watched node, what is kept across a reload; (6) a judging round on the estate's bronze screens.
- **What is reused:** every judge, measure, history and count of ADRs 0008 to 0014. Nothing new is measured in the
  engine but the scope and key of ten more controls.
- **Hashes:** plan/4 gains `columns` under its tag, with its first vector (E15). The ontology's `rows` is in the flow
  hash as the whole ontology is, and reaches plan/4 only as the `scope` and `reconcile` it already carries.
- **Risks:** a toggle moves the flow hash, by which a waiting day is found (§4 says so on screen; ADR 0009's matching
  by inputs is not changed here); a rule that appears after a base history was built is not judged until the base is
  rebuilt (the build rebuilds the estate's); `main.ts` has no test cover, so what can be is moved to pure modules.
- **Not in this ADR:** the stage rail (Q-125), the seal (Q-127), options with their gain and cost (Q-124), proposals
  (Q-128, Q-132), the question cells and the builder (Q-122).

## Amendment 1 (2026-11-10): the Ontology page is the files, and its rules are the toggles

The maintainer, after exploring slice 1 in the published app: the Ontology page was not what they expected. Their
words, condensed: *a section for each of the files that gets uploaded, that explains what the columns are and has
some data visualization of those columns (borrow from the import card); underneath each column, its rules: the
application's id has to exist, the pass rate is generally between X and Y, derived from the past 90 days, this
combination has to mean something else; rules that are hard-coded as well as ones that are discovered (create the
discovered section, leave it alone for now). Once those rules are set, they are the toggles on the data import card,
which write to the notebook.* Their answers are Q-140 to Q-143.

1. **The Ontology page leads with one section a file the flow reads.** What the file is; the file's own rules (what
   its rows are, which objects it covers); then a card a column: its meaning, its values drawn from the load on
   screen, and its rules; then what was discovered, empty until the models write there. Object types, links and
   actions, where a flow has them, come after.
2. **Rules belong to a file** (Q-140). Nothing is shared between files. A column's meaning (its title, its
   description, the words for its values) stays the flow's dictionary.
3. **A rule runs once it is set** (Q-141). The import card's toggle switches it off, written in the gate cell by the
   rule, not by check and column: §3's `columns` is replaced when this is built.
4. **A range says how it is kept** (Q-142): fixed once set, or rolling over a number of days the rule gives. Other
   ways may follow.
5. **Rules are added, changed and removed in the app** (Q-143), each a recorded change, kept across a reload (§4).

**Order of work**, one piece at a time, each published in the app for the maintainer to look at before the next:
(a) the page by file, showing the rules the ontology has today, nothing edited and no hash moved; (b) rules as each
file's own, with their forms and the two ways a range is kept; (c) the card's toggles from those rules, writing the
notebook; then §5 and §6 as written. Slice 1 stands: its scope and key become the file's own rules on the page.

## As built

### Slice 1 (2026-11-10): the ontology's `rows`, the two rules it gives, bronze's key, the estate

- **The declaration** (`RowsDef`, `Condition`, `Ontology.rows`, `ontology.ts`): `{ dataset, of, key?, where? }`.
  `rowsOf(ontology, dataset)` gives a dataset's entry with its object type resolved: the type's key column, the
  dataset's own name for it, and the condition in one order (`conditionOf`: by column, each column's values sorted,
  each once). `validateDocument` takes an entry that names a source or step of the flow and an object type that
  exists, whose objects are a source (the inventory is there before the run, as a gate's is). It refuses a dataset
  with two entries, a `key` that isn't text (a source declares no columns, so that it names one can't be checked
  before the run), a `where` that isn't `{ column: value | values }` with text values (an empty one too: every object
  is said by leaving `where` out, so there is one way to write it), any other key by name ("only isn't a rows entry's
  setting (dataset, of, key, where): refused rather than ignored"), and the whole list in a flow with no gate.
- **One function for a node's written rules** (`writtenRules(doc, node)`, `gates.ts`): the gate cell's own first, each
  kind on its own (a cell that writes a scope still gets the ontology's key, and the other way round); else, from the
  ontology's entry, the scope (the type's dataset as the inventory, its key, the dataset's own key column, the
  condition) and the key (a reconciliation by that one column against no other node). Each says where it is written
  (`from: 'gate' | 'ontology'`), for the page. A type whose key is several columns gives neither. Dependencies are
  only the gate cell's. The plan's `rulesOf` and the judge's `judgeOf` both read it, so a count is said with the
  column the engine counted ("406 rows for 203 app_id values"). Only a watched node's rules reach the plan; a
  published node nothing watches is counted by its gate cell alone, as before.
- **The condition is data, and the plan's scope is what it was.** Of the two ways the slice could go, `ScopePlan`
  keeps its four fields (`table`, `key`, `own`, `where`), and a derived scope's `where` is the text `emitMatch`
  (`emit.ts`) writes from the condition: `"criticality" IN ('critical', 'high') AND "internet_facing" IN ('yes')`,
  values as text literals, a blank never in scope, `1 = 1` for every object. `validatePlan`'s exact key sets, the
  measure settings, the plugin and `emitScopeCounts` did not change, and plan/4's encoding did not move.
  `emitNeedsCounts` writes its `when` through the same function. `plan.ts` now imports `emit.ts`, which imports
  `optimize.ts`, which imports `plan.ts`: a cycle of functions, none called while the modules load.
- **Bronze holds on its key by default** (`LAYER_DEFAULTS.bronze.reconcile`: `off` → `hold`). Every bronze watch's
  plan/4 `checks` says so, so every gated flow's plan hash moved; plan/4 has no pinned vector yet (slice 2 pins its
  first, E15). A node with no key written counts nothing and is told nothing. Silver and gold are as they were.
- **The story's lead** (`storyOf`, `story.ts`): where the amount is almost none (under a tenth of a day like it, or
  the floor that needs no range) and is the node's own to tell, the scope's keys with no row are no lead: they follow
  from the amount (`tier: follows`, `because: volume`). Rows out of scope on such a day still lead, a step whose
  amount follows from a source wrong upstream keeps its rule as its own, and an amount marked as expected hands the
  day back to the scope. Where a key on more than one row leads and the amount is above its range, the amount
  follows from the key (`because: reconcile:repeats`); a repeated key explains no fall. (Narrowed after the review,
  below: only where the repeats account for the rise.)
- **The estate** (`examples/control-estate/`): the object type `application` (the inventory `apps`, key `app_id`,
  title `name`) and one `rows` entry a control, each condition copied from the fixture's `appliesTo` and held to it by
  `test/estate.test.ts` on three inventories. TLS's and the WAF's gate cells write no scope now (the WAF's is its
  layer alone), and the notebook's note says the ontology has it. The inventory's rows are called applications, from
  the type (`nounOf`), where they were rows. `npm run build:app -- --flow examples/control-estate/flow.json` builds a
  year of every control's history with its scope and key counted: nothing out of scope, no key twice.
- **What moved, on purpose**, each said where it is asserted:
  - `test/estate-flow.test.ts`, Thu 21, TLS: was `/^More apps: 406 \(\+100%\)$/`, is `'203 apps repeat a key'`; the
    amount is told as following from it. The posture's hold that day reads the same words, by its own rule.
  - `test/estate-flow.test.ts`, Mon 4, MFA: the head is the same, `Almost no apps: 0`; the day gains "600 in scope
    with no app", told as following from the amount.
  - `test/estate-flow.test.ts`, the gates: `tls` and `waf` lost `scope: { of: 'apps', key: 'app_id', where:
    "internet_facing = 'yes'" }`; the plan's scope for both is `"internet_facing" IN ('yes')` over `apps_file`.
  - `test/gate-toggle.test.ts`: the text of TLS's gate cell after a toggle no longer ends with its scope.
  - ADR 0014: the two answer-key rows and the `reconcile` row of its defaults table are marked as amended here;
    `tools/judges/estate-panel.workflow.js` gives its judges the two rows as they now read.
- **Tests:** `test/rows.test.ts` (the declaration, what is refused, the derived rules in the plan and the judge, the
  condition counted in the engine with quotes and blanks, a load measured by the plan's rules, the story's lead);
  `test/estate.test.ts` (the entries against the generator); `test/estate-flow.test.ts` (every control's scope and
  key in the plan; every control every day of the history and of March counts nothing out of scope and no key twice,
  but the four planted days, each with its counts; Wed 13, Tue 26 and every other row of the key as before). Its
  world keeps each day's measures and the ranges each claim was told from.
- **Left for the next slices:** nothing on screen reads `rows` yet (the lines and the page, slices 4 and 5; the Checks
  tab still reads a gold node's key from its gate cell). A type with a key of several columns gives no rule. A
  reconciliation's own "keys of the other node with no row" still leads an empty file: only the scope's is folded
  under the amount, as the table above says. An app built before this slice has histories without the ten new
  scopes and the keys, and judges neither until it is rebuilt.

### Slice 1, after its review (2026-11-10)

- **The Ontology page reads a type whose objects are a source** (`renderOntology`, `src/app/main.ts`). The estate's
  `application` is the first object type in any example on a source, and the page knew only published datasets: on
  calm, published Wed Mar 6 it said "Nothing is published from apps yet: a day waits for a decision", and counted and
  listed nothing. A source's objects are now its file as the run on screen read it, through the viewer's policies,
  as its own card's Data tab reads it: 600 objects counted and listed, on a calm day and on a held one, with no "as
  published" note, since nothing of a file waits. A dataset the flow publishes reads as before.
  `tools/browser/stops/estate.json` has two stops with expectations for it (`mar06-ontology-type`,
  `mar12-ontology-type`), its first.
- **What validation refuses besides:** at an entry's `of`, a type whose key isn't a list of column names (`[5]`,
  `['']`, `[]`: the plan would carry a key the engine can't read); at its `key`, a name for the key under a type
  whose key is several columns (it gives no rule yet, so the name would go unused; the entry without it is taken);
  at its `where`, one column said twice in different case (the engine reads a column's name without case, so the two
  would ask one column for two things).
- **An entry on a dataset nothing watches is taken, and gives no rule** (the review left the choice open: refuse
  it, or say so on the page). Refusing it refuses the estate itself wherever a flow is run with no publish block,
  as it is while a step's history is built (`scripts/data/history.ts`, the estate's and the controls' test worlds):
  nothing is watched there. And the request is for every dataset's rows to be tied to the ontology, the inventory's
  and a gold table's too. So the declaration says what the rows are, and the watch is what judges them. **Slice 4
  owes the line:** a node with an entry and no watch says "not watched: nothing judges it", never a check that ran.
- **The story's lead, narrowed and completed** (`storyOf`):
  - A repeated key explains an amount above its range only when the rows left without the repeats are within the
    range (in whole rows, as it is shown). It folded any rise: 1,000 rows against a usual 200 with five keys twice
    was told as following from the key. Now the key still leads (its count is exact) and the amount is told as it
    was before the slice (absorbed in the day's cause). A file with its rows twice folds as before.
  - A row with no key is counted by both rules where they read one column (out of scope, and with no key). When
    every row out of scope is such a row, the key's finding leads ("10 apps with no app_id") and the scope's count
    follows from it (`because: reconcile:blank`). The judge carries the scope's own key column for this
    (`JudgeSettings.scopeKey`, from `writtenRules`); a scope on another column is never folded.
  - Among written rules that say as much (the same score, which is capped at 99), the key's finding leads: its
    count is exact. Before, the first told led, which was the scope's.
  - One row "repeats a key" (it read "1 app repeat a key"). `reconcileSaid`'s words for a gold node ("1 row repeat a
    key") are left: `audit.ts` compares a recorded hold's words with what it tells again, so that string is a
    recorded one and moves with a decision, not with a fix.
- **One of each:** `rulesOf` keeps a dependency's `when` and `then` with `conditionOf`, as a scope's condition is
  kept, so a value written twice in a list is in the plan once (it was kept twice; the counts are the same);
  `emit.ts` has one function for a text literal.
- **What moved, on purpose:**
  - Thu 21, TLS: the decision no longer offers **Accept the new level**. `acceptable` (`fill.ts`) takes an amount
    or a level as a cause, and the day's cause is now the key: a file with its rows twice is not a level. Pinned in
    `test/rows.test.ts` beside the lead.
  - `test/rows.test.ts`, "gives no rule for a type whose key is several columns": its document carried MFA's own
    name for the key and was valid; that name is refused now, so the document there has none.
- **Tests:** `test/rows.test.ts` gains the refusals above, an entry nothing watches, a tied watched step in the plan
  and the judge, three runs of one through the engine (`runFlow`, its claim told by `src/plugin/tell.ts`: published
  with one row an object, held on "5 rows out of scope", held on "1 row repeats a key" with its key turned on), and
  the story's cases above. The estate app was built into a scratch folder and `estate.json` run on it: no problems.

### Amendment 1, piece (a) (2026-11-10): the Ontology page by file, showing the rules the ontology has today

Nothing is edited and nothing is judged differently: no document, plan, hash, verdict or test vector moved.

- **The page as data** (`src/core/ontologypage.ts`, pure; `ontologyPage(doc, columns)`): one `FileSection` a source,
  in the flow's order: its id, its description and the description's opening for the list (up to its first colon or
  full stop), the noun for its rows (`nounOf`), whether a watch judges it, its own rules, a card a column, and
  `discovered`, an empty list with a place of its own. `columns(file)` gives the columns a load has (the app gives
  the ones the viewer may read); a file it gives nothing for has no cards yet. A card has the column's name as the
  file writes it, its title, its description, the words for its coded values, the ontology's entry (`propertyOf`,
  for its unit, note, lookup and references) and its rules.
- **Where the rules come from.** A file's own from `writtenRules` (slice 1), so the page lists what the plan counts:
  `rows` ("One row an application"), `covers` (the scope: "Covers the applications where Internet-facing is Yes, and
  no others"; no condition is "Covers every application, and no others"), `key` ("No Application blank or
  repeated"), and from a gate cell's own rules `same` ("The same Application values as apps: none missing, none
  extra") and `needs` ("Where Status is Passing, Code must be A or B"). A column's from `marksOn` for that file, so a
  band is the one the plan carries there: `values` ("A value never seen in this file before is flagged as wrong"),
  `bad` ("Failing is a bad value: a jump above its usual share is flagged as wrong"), `band` ("Failing between 0%
  and 15% of apps"), `due` ("A due date: a row is late if its Status is still Failing the day after; flagged as
  wrong when more are late than usual"), `after` ("About 30 minutes after Opened"). (The `values` and `due`
  sentences are as reworded after the review, below.) A sentence uses
  the ontology's titles and the words for its values; only a condition its author wrote for the engine in a gate
  cell is quoted as written. Nothing is shared in what is shown: the band on `not_assessed` that the ontology gives
  wherever `status` appears is listed in each of the twelve control files as that file's rule, and the WAF's band on
  `fail` in the WAF's alone.
- **A rule's shape** (`Rule`): an id that stands while the rule does (`tls/covers`, `waf/status/band=fail`,
  `pentest/next_due/due`: the column in lower case, so a load's case doesn't move it), its kind, its sentence, the
  numbers behind it (a band's ends, a window in days, a lag in minutes), the values it is about, the dataset it is
  checked against, and how it came to be (`RuleOrigin`): `set` by hand in the ontology or the notebook, which is
  every rule today; `derived` from the last N days, fixed or rolling (Q-142); `discovered`. The last two are in the
  type and in `originSaid` ("From the last 90 days, rolling") for pieces (b) and after; nothing produces them yet.
- **What isn't a rule.** A column's listed values with no mark are its meaning (the dictionary, amendment 1 point 2),
  not a rule. The inventory has none: its section says it is the list the other files are checked against
  (`FileSection.inventory`, from every file whose scope reads it).
- **A rule nothing judges says so** (`Rule.unchecked`): "nothing watches this file" (the line slice 1's review owed,
  said here for a file), "switched off in the notebook" (its check is `off` in the gate), "a key of several columns
  isn't checked yet", and for a bad value with a band in the same file "this file's band on Failing is checked
  instead" (ADR 0014 §3: a value with a band is judged by it alone, as the WAF's `fail` is). It is read from the
  document, not from a run.
- **The page** (`renderOntology`, `renderFiles`, `fileSection`, `src/app/main.ts`; CSS `.of-*`, `page.html`). It
  leads with **Files**: a row a file (its name, the description's opening, the rows of the load on screen through the
  viewer's policies, how many rules), none open on arrival so the first screen is the list; a tap opens a file's
  section in place and closes the one that was open, the tapped row brought under the header. A section, in order:
  what the file is; **This file's rules**; a card a column (its title and name, its values in the load on screen
  drawn, its meaning, its codes behind a tap, **Rules**); **Discovered**, which says nothing has been discovered yet
  and that rules the app finds will be listed there to accept. Each rule line says how it came to be ("Set by hand")
  and what it is checked against. A file closed to the viewer isn't listed, and a column closed to them has no card.
  A file the engine refused that day says so on its row and in place of its columns. The panel is drawn again only
  when the document, the run, the viewer or a file's columns changed: an object picked further down the page leaves
  an open section as it is.
- **The drawings are the import card's.** `columnShape` is taken out of the Columns tab's `columnCard` and both call
  it: a measure's or a time's histogram with its numbers, else its most common values as bars. It is computed when a
  section opens (`nodeView`, `qualityOf`, as the viewer), not for every file at once. A key (every value different)
  and free text draw nothing and say how many values they hold. Three small things changed in the shared drawing,
  so in the Columns tab too: a column of dates reads as days (it read "2024-03-14 00:00"), one more value is "1
  more value", and a meaning that is its code isn't printed under it ("Retail" over "Retail").
- **What left the page.** The box for an object type that only says what files' rows are (`typesShown`: a type
  stays with a link or an action, or when no `rows` entry names it): the estate's `application` is gone, and its
  count is the inventory's row ("600 applications"). The flat list "What the columns mean": a file's columns are in
  its section, with the references a meaning comes from on the column's card. Kept, after the files: the columns
  the flow's steps make, in one fold ("Columns the flow makes"), then the object types under **Objects**, their
  objects, action forms and the edits, as before. The objects and edits panels are hidden in a flow with no type
  to show and no action.
- **Tests:** `test/ontologypage.test.ts` (the estate's sections as the page shows them, the taxi example and the
  sign-in log, and small documents for a gate cell's own rules, a check switched off, a file nothing watches, a
  key of several columns, a hidden column, a time that runs behind another, the types still drawn, `originSaid`).
  `tools/browser/stops/estate.json`: the two object-type stops are replaced by six (`mar06-ontology`,
  `mar06-ontology-control`, `mar06-ontology-inventory`, `mar12-ontology-control`, `mar12-ontology-dark`,
  `mar12-ontology-control-dark`), each with expectations; `tour.cjs` gains `waitFor`, for what a tap draws once the
  engine answers. The taxi example and the sign-in log were built and driven with scratch stops: their files'
  sections, no page error, and on the taxi example the four object types, their objects, and an action typed,
  applied and recorded in the chain.
- **Choices made here, for the maintainers to confirm or change:**
  - No file is open on arrival (amendment 1 allowed the first open): with thirteen files, an open first section
    pushes the list off the first screen. One section is open at a time.
  - Each rule carries "Set by hand" under it, so the place where "From the last 90 days" will stand is on screen.
  - A column's codes are behind a tap ("What its 4 values stand for"): the drawing above already names the values
    the load has.
  - The columns the steps make stay on the page, folded, though the amendment speaks only of files: they were in
    the list this replaces, and are in no file's section.
  - The words: "flagged as wrong" for what a rule does when it is broken (whether that holds the day is the gate's
    mode, which the page doesn't say yet), "a bad value", "between 0% and 15% of apps" with the file's noun.
  - A file tied to an object type with no noun of its own is counted in "rows" (`nounOf` doesn't read `rows`).
- **Left for pieces (b) and (c):** nothing is edited here; the rules are still the ontology's marks, which a
  column's files share in the document, though the page lists them file by file; `discovered` is empty; a rule
  doesn't say whether it holds or warns, has no switch, and isn't drawn against today's number (§5).

### Amendment 1, piece (a), after its review (2026-11-10)

Still nothing edited: no document, plan, hash, verdict or test vector moved. What the page says changed.

- **A file's rule about a column is on that column's card too.** The maintainer's first example of a rule under a
  column was "the application value has to exist", and the Application card of each of the twelve control files
  said "No rules yet." under the two rules of the file that name it. A file's own rule now says which of the
  file's columns it is about (`Rule.columns`: the key's columns for `key` and `same`, the file's own key column
  for `covers`, for a dependency the columns that must hold and the condition's where it is read in this file),
  and a card lists them before its own (`ColumnCard.fileRules`, each `{ rule, said }`): "Must be one of the
  applications this file covers" and "No Application blank or repeated", each marked "one of this file's rules".
  It is the file's rule itself, listed twice and counted once: a row's "9 rules" is what it was. No card says it
  has no rule under a rule that names its column.
- **A bad value a due date tells says its jump isn't checked.** Once a due date is judged, its miss value's rise is
  told through the due check and not as a bad value (`dueMiss`, `news.ts`; ADR 0014 §3): on Fri Mar 15 the
  vulnerability file's Failing is 15.5% against 5.4% the week before and the day is a normal Friday. The page
  said that jump would be flagged, in the five files with a due date. `bad=fail` there now reads "Not checked:
  this file's due date is checked instead", as a band's does; so does a band on such a value (the judge skips it
  the same way). A due mark counts for a file only when the file has its column: the ontology gives `next_due`
  wherever it appears, and TLS has none. `ontologyPage` takes every column a file has beside the ones the viewer
  reads (`every`), so the line is right for a viewer the due date is hidden from. It is read from the document:
  in a flow's first weeks, before twenty rows have been due, the jump is still judged.
- **A `values` rule says what is checked.** "Holds Signed in, Failed or Locked out: a value never seen before is
  flagged as wrong" read as a closed list above a bar that showed a fourth value, unflagged. The check is against
  what the file has held before: "A value never seen in this file before is flagged as wrong". The values the
  ontology describes stay the column's meaning (the card's codes, the rule's `values`).
- **Words.** A due date: "a row is late if its Status is still Failing the day after; flagged as wrong when more
  are late than usual" (it said "checked against the usual late share", the judge's term). The inventory a scope
  reads is "the list of applications (apps)" (`Rule.againstSaid`; it said "checked against apps").
- **A refused file keeps its columns and rules.** On Thu Mar 7 the logging file's row said "file refused · 3
  rules" (8 on any other day) and its section had no card: a refused source's stored plan says no columns. A file
  the run read nothing of (refused that day, or no run yet) now has the columns its data list declares, through
  the viewer's policies (`fileColumns`, `fileView`, `src/app/main.ts`): the row counts its eight rules, the
  section says the day's file was refused and that these are the columns the flow expects, and each card says
  there is nothing to draw. A file whose columns nothing declares (a Parquet file before a run) has none, as
  before.
- **An open row drops its line.** The row said the description's opening and the section said it again under it.
  Open, the row keeps its name and counts, and the section says the whole description once.
- **A bar is named by what its value means** on this page (`columnShape`'s `lead`): "Failing" with `fail` small
  beside it, as the rules under it speak; the Columns tab still leads with the code, read beside the rows. Neither
  prints a meaning that differs from its code only in case ("yes", "Yes"). Meanings that are sentences (the taxi
  zones' service zone) sit over their bars.
- **Columns of a file closed to the viewer.** As Ana, whose trips file is closed, "Columns the flow makes" counted
  41, 19 of them the trips file's own, with no line saying where they come from and without their references.
  Whose a column is is now decided by the files' own columns, not by what the viewer may open: the steps' 22 are
  under "Columns the flow makes" for Ana as for the owner, and the 19 are in a fold of their own, "Columns from
  trips": "19 columns Ana reads in the flow's steps. The file itself is closed to Ana.", each with its references.
- **Targets and type.** A reference on a card is a row to tap, 44 px high (it was 16 to 33); on the Objects part
  kept from before, an object row, an action's input and its button are 44 px (40, 36, 40). "Rules" and "Set by
  hand" are 12 px (10.5, 11.5).
- **Not changed.** The estate's source descriptions end "One row an application it applies to (every
  application).", which the file's rules then say again. The description is the document's, and this piece edits
  no document: it goes when piece (b) makes the rules the file's own.
- **Tests:** `test/ontologypage.test.ts` gains a file's rules on its columns' cards (the estate's every file; a
  gate cell's key, `same` and both dependencies), the due date's stand-in in the five files and not the seven, a
  band on a value a due date tells, a due date hidden from the viewer, and the new sentences.
  `tools/browser/stops/estate.json`: the WAF stop counts the Application card's two lines and no "No rules yet."
  on it; two stops are new, `mar07-ontology-refused` (the logging file on the day it is refused: eight rules,
  five cards, nothing drawn) and `mar14-ontology-due` (the vulnerability file: the due date's rule, and Failing's
  jump said as not checked). The taxi example and the sign-in log were driven again on their earlier builds'
  data with the new bundle: no page error, every target on the page 44 px or more as each of the taxi example's
  five people, an action typed, applied and recorded.
- **Left, and a question for the maintainers before piece (b) (Q-144):** the page is by file, so the rules of a
  dataset the flow makes are nowhere on it: the estate's one combination rule (where Key rotation is Passing,
  Encryption at rest must be Passing, Exception or Not assessed), the posture's key against the inventory, and
  the bad value on each of its twelve status columns. They are on the posture card's Checks tab; the fold of
  made columns gives meanings only. The maintainer named "this combination has to mean something else" as a rule
  they expect to see. Where they go (a section of its own after the files for a dataset with rules, or a line
  under each file it reads) is theirs to say.

### Amendment 1, piece (b), first stage (2026-11-10): names and labels, and edits that stay

The maintainer, after looking at piece (a): *"you have weird stuff in there, like the name of the thing is the name of
the thing, so like yes means yes, no means no. The user should be able to update column names that aren't necessarily
always clear, but labeling everything as what it is is not very helpful."* (Their second point, rules called out
with no way to add one, is the next stage's.) No shipped document, plan, hash, verdict or test vector moved: what
the page says changed, and a document changes only when its owner edits it.

- **No label that only repeats the thing** (`plainOf`, `saysMore`, `meaningBeyond`, `ontology.ts`). Two texts are
  the same thing when they agree with case, spaces, underscores, hyphens, other punctuation and accents set aside:
  "yes" and "Yes", "aws" and "AWS", "not_assessed" and "Not assessed", "TLS1.2" and "TLS 1.2", "name" and "Name";
  "pci" and "Card data" are not, nor "app_id" and "Application". A label is shown beside or in place of a thing only
  when it says more.
  - A column's card (`ColumnCard`, `ontologypage.ts`): `standFor`, the values whose meaning says more, is what
    "What its N values stand for" lists and counts, and the list isn't offered when it is empty (the inventory's
    business units, yes and no; two of its four data classes are listed). `asWritten`, the column as the file
    writes it, is set only beside a title that is another word ("Application app_id"; "Name" alone). `values`
    stays every value the ontology lists: the edit form reads it.
  - The drawing (`columnShape`, `labelFor`, `src/app/main.ts`), shared by the Ontology page and the import card's
    Columns tab: a bar carries one label, the meaning where it says more, else the value as the file writes it.
    The `lead` choice of piece (a) (a meaning with its code small beside it, or the code with its meaning under
    it) is gone, with the code beside the label.
  - Everywhere else a value or a column is shown with its meaning: the Data tab's cells and heads, the Columns
    tab's rows and cards, a row read as a record or in a table, the "Columns the flow makes" cards, and the two
    places the viewer's news names a value in brackets (`NEWS_NAMES.value`, `namesFor`).
  - Not changed: a rule's sentence and a finding's title name a value by the ontology's word alone ("Not assessed
    between 0% and 5%"), which is one label and no repeat; and the flow's own verdict words (`flowNames`,
    `news.ts`) are recorded strings.
- **A file's description is said once.** The open row's opening line is taken out of the row (`hidden`), not only
  hidden by a style, so nothing reads it twice.
- **Names can be changed** (`nameColumn`, `src/core/flowedit.ts`; `columnForm`, `main.ts`). On a column's card the
  owner has a quiet **Edit**: a form in place of the card's body with the name, what it means, and a label for
  each value (the ones the ontology lists, then the ones the load on screen has; a field is empty where the value
  has no label that says more than itself), Save and Cancel. A reader sees no Edit, and a save waits for a run
  under way to end. By Q-140 the change is the file's own: the property that names only this file is edited in
  place; else a new one for this file alone is written after the one it stood under (the flow's dictionary, or one
  several files share, which then stops naming this file), with its unit, note, lookup and marks, and of its bands
  only those that apply to the file. What the plan carries for the file (`marksOn`) and for every other file is
  what it was: a rename moves the flow hash and no key, and builds nothing again. The file's own column name never
  changes, is said under the name field ("The file writes it as status. That stays."), and stays beside the new
  title. A name left empty is the name as written; a label taken off a listed value leaves the value itself for a
  label, which is shown nowhere, so the list of values (and a bad value's place in it) stays.
- **Edits stay** (`keptOf`, `restoreKept`, `asShipped`, `flowedit.ts`; `saveFlow`, `loadFlow`, `main.ts`). The page
  keeps the edited document in this browser (`localStorage`, `smaltfl:flow:<id>`): `{ v: 2, base, doc, edits }`,
  the whole document less its arrangement (kept apart, as before), so the notebooks, gates and ontology come back
  with the cell refs and outline a toggle needs. `base` is the flow hash of the document the page was shipped
  with; what was kept against another is dropped, and the page says how many changes went and why. The first form
  (`{ v: 1, base, steps }`) is still read. Where the browser has no storage for it the page says the changes last
  for the visit.
- **Every edit is recorded at once, with its reason in words** (`flowEdited`, `recordFlowChange`): a rename
  ("Renamed status to Result in tls"), a gate toggle ("Set the classifier check on tls to warn (it was off), from
  the Checks tab"), an accepted band ("Accepted a new band in waf: Status Failing between 0% and 62.5%, by
  decision #9"; `applyBand` moved to `flowedit.ts`, and no longer waits for the next run to be recorded with no
  reason), and the canvas's step edits, which had none. Flow entries are appended one at a time, each for the
  document as it was when asked, so an edit and the run that follows it never both record the change. The entry's
  shape is what it was (`{ before, after, doc }`, the document kept by hash without its display fields): the audit
  finds it by its flow hash and verify reads each run's own document, before and after an edit. After a reload
  the restored document hashes to the record's last flow entry, so the next run records no change back.
- **The changes are listed, and can be taken away** (`renderFlowEdits`, `backToShipped`). Above the files: how many
  changes, the last one, all of them behind a tap, that each takes effect from the next run, and for the owner
  **Back to the flow as shipped**, asked twice, recorded as one flow change. The arrangement and profile boxes
  stay: they are the browser's own. The canvas's Reset still puts the steps and sections back, and no longer
  forgets what else was kept.
- **A waiting day is judged again.** An edit moves the flow hash, by which a day waiting for a decision is found
  (§4's risk; ADR 0009's matching is not changed). Where a day waits, the form and the list of changes say "A day
  waiting for a decision is judged again when it next runs."
- **What moved, on purpose:**
  - `test/ontologypage.test.ts`: a card's exact shape gained `standFor` (`{ name, title, values, standFor, rules,
    fileRules }`), said there.
  - On screen, and in `tools/browser/stops/estate.json`: a bar's single label; the stand-for lists and their
    counts; names beside titles; the record's flow line, which leads with the reason ("The flow changed: Renamed
    status to Result in tls · 07df… to 9d2e…"; one with no reason reads "The flow changed · …"); a toggle's
    default reason (it read "tls: classifier off → warn, from the Checks tab"); the line after a band is accepted
    ("Recorded; the next run judges by it"; it read "The next run records the change").
- **Tests:** `test/flowedit.test.ts` (the comparison on the maintainer's cases; the estate's cards; a rename as
  the file's own with every file's marks and the whole plan but its flow hash unchanged; in place the second
  time; labels given and taken; a shared entry split; a flow with no ontology; the band; what is kept restored
  after a toggle, a rename and a band to the same flow hash, toggled again and held to smaltnb's parser; dropped
  when the shipped document changed; the first form; back to the flow as shipped; a run before and after a rename
  through the engine, nothing built again and both verified). `tools/browser/tour.cjs`: an entry of `clicks` may
  be `[selector, text]`, typed into a field. `estate.json` gains eleven stops (`names-form`, `names-rename`,
  `names-other-file`, `names-import-card`, `names-reload`, `names-reload-record`, `names-reader`, `names-back`,
  `names-back-record`, and two in dark) and expectations on the inventory's and the WAF's stops. The sign-in log
  and the taxi example were built and driven through a rename, a reload, a reader and the way back with scratch
  stops: no page error.
- **Choices made here, for the maintainers to confirm or change (Q-145 to Q-147):**
  - A bar whose meaning only repeats its value shows the value as the file writes it, so one drawing can read
    "Passing, Failing, exception". The other reading (the ontology's spelling as the one label) is a line in
    `labelFor`.
  - A file's own name stays in that file: a step that reads the file keeps the flow's dictionary name for the
    column. Following a column through the steps that only pass it on is not built.
  - A name is in the flow hash, as the whole ontology is, so a rename is a flow change that a waiting day is
    judged again under. Keeping names out of the hash would be an encoding change, with its own ADR.
- **Left for the next stages:** rules are still the ontology's marks, read-only on the page; a column's unit,
  note and references aren't in the form; a file's own description isn't edited (the estate's still end "One row
  an application it applies to…", which the rules under them say again); the edited notebook or document isn't
  offered as a file (§4).
