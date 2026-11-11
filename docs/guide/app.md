# Working in the app

The app is one page that runs a flow in your browser. Everything here works on the demos; on your own flow the same
screens follow its ontology and its notebooks.

## The screen

- **The strip of days** at the top: each day's load and its state (published, held, not run). **Play the rest** runs
  the days in order; **Next ›** runs one. A day's state is also in the status line and the page's title (‖ while held).
- **Viewing as** chooses whose eyes you see with. The flow's policies decide what each person may open, what columns
  are masked, and who may decide a held day.
- **Flow**, **Ontology**, **Policies**, **Results** and **Runs** are the views.

## The canvas

A card is a source or a step; a box is a notebook. A card's line says its day in a few words, and a mark says its
news (an alert, a warning, a fill). Drag to move around, pinch to zoom, hold a card to move it. Tap a box to read the
notebook; **Show its steps on the canvas** unfolds it.

## A card's sheet

Tapping a card opens its sheet, the same tabs on every card, the news first:

- **News**: the day's story about the card: one cause, the picture against what is usual, what it reaches, the fix.
- **Data**: its rows, each column's shape on top; a small output opens with its heat table at a glance.
- **Columns**: one column a line, opening into its values and its history.
- **Checks** (a gated card): each check, written or learned, holding, warning or off; toggling one writes the gate
  cell in the notebook.
- **Rules** (a source): the ontology's rules for the file, each switched on or off for this flow.
- **Models** (a watched card): the isolation forest and the classifier, with their records.
- **Dropped** and **Odd rows**: what a check removed, and rows unlike the rest.
- **History**: the day's numbers against the days before.
- **Integrity**: the file against its list, the run's hashes.

## The notebook page

Tap a notebook's box. Each cell reads top to bottom:

- the notebook's text cells as prose, its SQL a tap away;
- under each step, **callouts** for what a written rule caught and for the day's news about it, each opening the
  card's tab where it is told in full;
- the step's **Output**: its first rows (a summary's open from the start, with its heat table);
- on a watched step, **Models**: the forest and the classifier, opened in place.

**Your cells**, at the bottom, are yours: **+ SQL cell** runs SQL over any dataset of the flow by its name, today's
version (`SELECT … FROM app_scores`), with its result and, where it makes a grid, a picture; **+ Note** keeps a note.
They are kept in your browser and are never part of the notebook, the plan or a hash.

## A held day

A held day's card says why. Its News leads with the cause; the decision sheet offers what the file allows (set in the
ontology's `fixes`):

- **Publish as is**: readers get the day as it came, marked.
- **Don't publish**: readers keep the last good day.
- **Fill**: the missing part from another day (carried forward or back, or a like day), every filled row marked with
  `filled_from` and drawn stippled.
- **The part that arrived**, or **Accept the new level** where the day's change is the new normal.
- **Replace the file**, where allowed.

Each choice is a recorded decision. One is recommended, with its reason; publishing is never preselected.

## The ontology

The **Ontology** view is laid out by file: what the file is, the rules about it as a whole, and a card a column, with
its meaning, its values and the rules about it. The owner can rename a column, reword its meaning, label its values,
and add, change or remove a rule. A file read by several flows can share one ontology
(`examples/ontologies/auth.json`): change it once, and every flow that reads the file has the change.

Edits are kept across a reload and listed with **Back to the flow as shipped**.

## Runs, verify and the record

**Runs** lists every run with its manifest. **Verify** checks a run at three levels, up to rerunning it from its
inputs. Decisions go into a hash-chained record (RFC 9162). **Download the audit bag** for an offline check.
