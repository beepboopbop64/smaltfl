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

## As built

Nothing yet.
