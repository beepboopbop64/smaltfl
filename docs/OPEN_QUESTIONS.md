# Open Questions

The design interview for smaltfl. Each question records the decision needed, the decision or a proposal, and its status.
Decided questions are recorded in ADRs: round 1 in [adr/0001-initial-decisions.md](adr/0001-initial-decisions.md), round
2 in [adr/0002-second-round-decisions.md](adr/0002-second-round-decisions.md), round 3 in
[adr/0003-third-round-decisions.md](adr/0003-third-round-decisions.md), the flow plan in
[adr/0004-the-flow-plan.md](adr/0004-the-flow-plan.md), the licence in [adr/0005-licence.md](adr/0005-licence.md), pausing
a day that is off in [adr/0009-paused-not-published.md](adr/0009-paused-not-published.md) and filling one in its
amendment 1, the news and the pause for any dataset in [adr/0010-any-dataset.md](adr/0010-any-dataset.md), notebooks as
the step surface in [adr/0011-notebooks-as-the-step-surface.md](adr/0011-notebooks-as-the-step-surface.md), the brief, the
incident page, the drill and the phone canvas in [adr/0012-visual-first-in-two-minutes.md](adr/0012-visual-first-in-two-minutes.md), the
bronze layer in [adr/0015-the-bronze-layer.md](adr/0015-the-bronze-layer.md). The research
behind the proposals is in [research/ecosystem-survey.md](research/ecosystem-survey.md).

**Who decides:** the maintainers, together (ADR 0001 §1).

## Open

| ID | Question | Proposal | Status |
| --- | --- | --- | --- |
| Q-85 | A run of several watched sources is released citing one decision a load (ADR 0010 §7). The plugin keeps the release's first decision's leaf (`_smaltfl_releases.decision`); the record's release names them all (`decisions`). Keep one leaf in the engine, or every one? | **One in the engine, all in the record:** the audit matches the engine's release to the record's release that names the same names and cites that decision (ADR 0010 §7 "Phase 4 as built") | open |
| Q-84 | A slot of a day (`every` 12h to 1h) gets no Accept the new level, since a level starts on a day (`level.from` is a day), and a slot under 3 hours gets no fill, since its parts are quarter hours and a fill names whole hours (ADR 0010 §7). Extend levels and fills to slots? | **Not yet:** both are offered for a day's loads, in a flow of several sources too; a slot's are left for a decision of their own | open |
| Q-83 | A slot is judged from its own series: the same slot of each day, as a day's history (ADR 0010 §7), rather than the design's `PeriodSeries` with lags of 7·per slots. Keep it? | **Keep it:** it gives each pattern's same slot of the day, last year's same slot, windows in days, special days in every slot and floors per slot with no change to normal.ts; a value is new only when no slot had it (ADR 0010 §7 "Phase 4 as built") | open |
| Q-82 | plan/2's `WatchPlan` gained a field, `relearn`, after its vector was pinned (ADR 0010 E13). Keep the tag plan/2, or make it plan/3? | **Keep plan/2 while it is in no release:** E13 recomputed (`0c4d833a…`, was `144ec790…`), the example's plan/2 is vector 6 (`668856bd…`). A field added after smaltfl's first publish makes a new tag (ADR 0010 E13) | open |
| Q-81 | Should re-learning on its own once a change has lasted 14 days (ADR 0010 §5) be on for every general-form watch, as §5 first said? | **Off unless the watch asks (`relearn: true`).** On the taxi history it re-learned the Omicron dip of January 2022, and the outage of Jan 5–9 on top of it stopped pausing: wrong 25 → 20, short 22 → 17 (ADR 0010 §5 "Phase 3 as built", §13) | open |
| Q-80 | Do legacy watches (a watch given as a file name) leave recorded days (not published, filled, the complete part only, waiting) out of learning, as general-form watches do (ADR 0010 §0, §5)? | **Yes, from the build that adds `skip`.** The taxi vector has no decisions in it, so it doesn't move. Recorded with Q-52 | open |
| Q-79 | Should any verdict-changing ontology mark on a watched source (`bad`, a serious column, `after`) make the plan plan/2, not only the document format 3 (ADR 0010 §4, §11)? A legacy watch over a column marked `bad` would otherwise stay plan/1, and an older plugin wouldn't refuse it | **Yes**, so a plugin that can't judge the mark refuses the plan | open |
| Q-78 | How do two-word nouns ("endpoint events") fit the 45-word decision sheet (ADR 0010 §8)? | **The noun is said once**, in the title or the first row, and numbers are bare after it | open |
| Q-77 | A later file of the same day: a version of the day, or its own load (ADR 0010 §7; the designs disagreed, X5)? | **Its own load when its slot differs,** with its own hold and decision; a re-run, a version of that load, when the slot is the same. A day's versions are kept per source and slot (ADR 0009 amendment 1 S7) | open |
| Q-76 | The fills as ADR 0009 amendment 1, or as ADR 0011? Where is Accept the new level described (X10)? | **Amendment 1 of ADR 0009,** with Accept described once, in its S6; ADR 0010 §5 keeps only what a level does to normal | open |
| Q-75 | Should `data.yml` publish `data` only from the default branch, and `data-<branch>` from any other, so one lane's push can't replace the data another lane tests against? | **Not built:** the lanes never push. Only the session owner pushes, so one `data` branch is enough, and it keeps its history (Q-63). If lanes ever push, this comes first (ADR 0009 amendment 1 S13) | open |
| Q-74 | ADR 0010's automatic re-learning once a change has lasted 14 days, against the owner's "deliberate changes pause until accepted" (X7) | **Never for a metric whose change held a day that wasn't accepted.** Tested on the +60% step: held, not accepted, never re-learned automatically (ADR 0010 §5). Built so in phase 3, and only for a watch that asks for re-learning at all (Q-81) | open |
| Q-73 | Accept the new level: its label, reasons, drawings, receipt and the causes it is offered for (the designs disagreed, X6) | **The owner's words, "Accept the new level";** reasons Planned change and Source confirmed; the fills' drawings picked by the cause, with ADR 0010's step mark on the receipt; offered for an amount, a split whose part vanished or surged, a share or a level, or a new value that stayed, and never on hours, a part that held while the rest vanished, a bad value, a refused file, a source not judged or the checks alone (ADR 0009 amendment 1 S6, S12). Built so in phase 3; the level names the cause's metrics and those of whatever else is off on the day (what it absorbed, what follows from it, anything wrong or unusual), so the day as it came becomes usual (S6, "Phase 3 as built") | open |
| Q-72 | What does a source's tail of measures keep (ADR 0010 §6)? | **One leaf per (source, slot), the first time the slot runs.** Derived runs (fills, complete parts) and re-runs of the same file never add one; a corrected file waits for slice 3 | open |
| Q-71 | Names: `unjudged` already names the integrity hold, and "staged" every held run's versions. What do "nothing to compare against" and a fill's run take? | **Both renamed:** the story state, hold kind and claim state `unlearned` (ADR 0010 §1); the fill's run outcome and hold `derived` (ADR 0009 amendment 1 S4). The screen words that keep "Not judged yet" (published) apart from a "not judged" hold (paused) are left to the build's word review | open |
| Q-70 | Where do `donor`, `meanwhile` and `until` go in format 3, and what is plan/2's `publish` (the designs disagreed, X3)? | **`donor` in the watch,** filled in by plan/2 from the pattern (weekly gives `weekday`, none and monthly `nearest`); `meanwhile` and `until` in `publish`. plan/2's `publish` is `{ hold, period, together, calendar, watch, meanwhile, until }`, filled in, and its vector is computed on this shape before it is pinned (ADR 0010 §11, E13) | open |
| Q-69 | How is a derived (filled) run's claim judged under claim/2? It has its own flow hash, and its checks count the filled rows, so it would fail the `flow` and `measured` checks (X4) | **Against the held run it repairs (`from`):** the claim's `flow` is `from`'s flow hash, its `measured` the measures stored for `from`, and the snapshot is `from`'s (ADR 0010 §6). Not a new hash of the judging settings, which would need a new encoding | open |
| Q-68 | Where is an accepted level stored: a break in the document, recorded as a flow change, or the record (the designs disagreed, X1)? | **In the record and the claims** (the decide entry's `level`, the claim's `levels`), never in the document: no flow change, so ADR 0009 §10's matching of decisions by their inputs isn't weakened, and the audit can tell the verdict again (ADR 0009 amendment 1 S6, ADR 0010 §5) | open |
| Q-65 | A SQL step that drops `filled_from` from an output a fill step reaches: refuse the run, or run it with that output named "not marked" (ADR 0009 amendment 1 S1)? | **Refuse,** naming the output: the owner asked for the mark in the data | open |
| Q-59 | ADR 0010's own: should nouns sit in `ontology.nouns`, or be an optional key on object types? Should built-in calendars be versioned in the plan, or tied to the build? Should the legacy form's floors scale once the backtest is in? And Q-49's last part: do days published as is, or accepted, feed later days' ranges, and held ones not? | **`ontology.nouns`;** versioned in the plan (`us-nyc/1`); the legacy floors scale only by a separate acceptance after the backtest; a day published as is, or accepted, is learned from, and a day held and not published as is (not published, filled, the complete part only, waiting) isn't (ADR 0010 §5, §6) | open |
| Q-52 | Should the rule that judges a day (the story's verdict that `wrong` and `short` read) be frozen as a versioned copy, or tied to the build? The story code changes often (ADR 0009 §3) | **Tied to the build**, with the history as its test vector: over 2022 to January 2024 `wrong` holds 28 days (25 since the example's move, Q-54) and `short` 22, and a change to the story that moves one fails the tests until it is accepted on purpose. Each claim records the build that judged it | open |
| Q-51 | Should a passing run of a day earlier than the one published move the dataset names back, as it does now, or stay behind, as a release must (ADR 0009 §5)? | **Unchanged for now:** a passing run moves the names, a release never moves them past a later day, and the decision sheet says when a day has been passed over. Ordering runs by their period comes with outputs partitioned by day | open |
| Q-47 | plan/1 and document format 2, or optional fields under plan/0 and format 1? | **plan/1 and format 2** (ADR 0009, E10): an older build refuses a flow that holds, where optional fields would fail open and publish what the flow holds. Kept to two functions (`documentFormat`, `planKind`), so switching is two lines | open |
| Q-38 | The builder (design canvas "smaltfl app concepts"): does it match what data engineering needs? What is missing or in the way? | Liked; made open after feedback (A3): a grid canvas where steps go anywhere, groups that hold any number of steps and collapse, zoom, fit, tidy and a map; every step opens into sub-steps, settings, its SQL, a preview and its schema with column lineage | in review |
| Q-29 | The mark: round 3 leans into waves (M12–M18), all curved | Pick a wave, and whether teal is a small chip (M12–M15) or a whole wave (M16–M18). Round 3 goes to stenhoor first (ADR 0003 §3) | on hold |
| Q-40 | The runs and policies screens (A6, A7): the right shape? | **Runs:** each run with its status and verification; what ran and why (each step reused or rebuilt, and the reason); its checks; its signed manifest, to download, verify again, re-run or compare. **Policies:** people (identity cards) and groups; row, column and action rules, each showing what it reaches; who sees what, by district; a preview as one person, with their share and the policy checks | in review |
| Q-41 | How do row rules pass through aggregates? | An aggregated row is visible only when every row behind it is. A dataset whose rows mix what a viewer may and may not see is closed to that viewer, and the app says why and offers the fix (group it by the rule's column): A7 shows this for `airport_times`. v1 applies rules by column name and closes a dataset without the rule's column; exact inheritance waits for bound plans | open |
| Q-34 | Verified runs and speed: parallel execution can change a floating-point sum in its last digit | Verification is bit-exact: runs pin the engine settings that affect results (no parallel aggregation of floating-point values), and the cost is measured. Revisit if it is large. A fold that changes the order of a floating-point sum is a new result (ADR 0004); order-independent sums in smaltdb would make it free, to discuss with stenhoor | open |
| Q-35 | What is a share? | **One package file** (`.smaltfl`): the flow, its run manifests and signatures, and optionally the data, encrypted per policy partition. The recipient opens it in smaltfl. Hosted links come with the server | open |
| Q-37 | Which data for the scenario? | Yellow taxi trips for January 2024 (the default) and Q1 2024 (the limit test), Open-Meteo hourly weather per borough, the TLC zone table. Later, Q1 2025 against Q1 2024 for congestion pricing | open |
| Q-2 | Who is the first user? | Data engineers build; analysts use and extend. The canvas must stay readable for both | open |
| Q-15 | Lineage granularity in v1? | Dataset-level and run-level from the start; column-level when the plan API lands | open |
| Q-18 | Data quality in v1? | Row expectations (warn, drop, fail) and dataset checks (freshness, row count, uniqueness, schema) | open |

## The next phase: the maintainer's answers (2026-11-10)

Asked through the question prompt on 2026-11-10, after a review of the tip (`b37762a`): the estate, taxi and sign-ins
apps built and captured at phone and desktop size, a panel of judges reading the estate's screens as leadership would,
an audit of ADR 0014 as built, and a survey of the family and of how tools answer leadership's questions
(docs/HANDOFF.md, "The review of 2026-11-10"). The maintainer's goal for the phase, in their words: *a visual first
flow that checks quality and can easily answer any data question for leadership quickly and correctly with visuals and
next potential steps with the draw backs and benefits clearly described*. No ADR records these answers yet: the next
one (0015) is to be written from them. Nothing here is built.

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-120 | Who holds the phone when leadership gets an answer: the maintainer briefing them, leadership opening the app themselves, or both from the start? | The maintainer: "I brief them": the owner uses the app and sends a one-screen card (image, text or link) that carries its own proof line; a reader's page can follow later from the card's link | decided |
| Q-121 | How is a data question asked: prepared cards then a builder, prepared cards only, a builder first, or typed words through a model? | The maintainer, in their words: "Eventually we will put in a model by for me we can log with the questions mainly will be about data quality ad data questions notebooks should help with the questions the news and data checks with data quality". The session's reading: a model comes later (Q-43 stands until then); for now there are two kinds of question, data quality (answered by the news and the checks) and the data itself (answered with notebooks). Asked again as Q-122 | decided |
| Q-122 | The data questions' side, now: question cells in notebooks, cells plus a log of the questions nobody could ask, or cells plus a builder? | "Cells plus a builder": each prepared question is a cell in a notebook with its chart and an answer key, shown as a card on the gold dataset; and a question built by taps (a number, a split, a period) for what nobody prepared | decided |
| Q-123 | Which kinds of leadership question must the first version answer well? | All four offered: where do we stand (rankings and shares as of the last sealed day); what changed and why (a trend against usual and the biggest driver); who is affected (the applications and units behind a number, as a list); what should we do (two or three options, each with its gain, its cost and whether it can be undone) | decided |
| Q-124 | What do "next potential steps with drawbacks and benefits" cover: the data's options with computed rows, also playbooks about the problem the data shows, also actions on objects? | "Data steps, computed": each existing option (publish as is, keep the last good day, a fill, the part that arrived, accept) gains fixed rows filled from facts: what readers see, the gain, the cost, whether it can be undone, who may take it. Playbooks and actions on objects were offered and not picked | decided |
| Q-125 | How do bronze, silver and gold read on screen? Today the layer is a word in a card's label, and Q-116 was "keep the free layout; gate marks only" | "Stage rail above": three stops above the canvas with each layer's state for the day ("Bronze 12 of 13 passed · Silver waits · Gold shows Wed 6"), a tap from a stop to its gates. The canvas keeps its free layout: Q-116 stands | decided |
| Q-126 | What comes first: making the estate's screens right, the question cards, or ADR 0012's queue (the drill, the phone canvas, the notebook as a page)? | "Make it right first": CI green, a brief that follows what holds the day (its head, cause, drawing and proposal), a drawing for each gate finding, the options on the card that holds, then a judging round on the estate. The question surface comes after | decided |
| Q-127 | What does SEALED promise on a gold dataset? As built: no undecided hold, signed by this browser, the same word for a clean pass and for a day published over a failed check | "Passed vs decided": sealed only when every enabled check ran and passed; a day someone published over a failed check reads "Published by decision", with who and why; both stored and checkable offline. Per-check results in the manifest are a new encoding: its ADR and vectors come first. Amends Q-115 | decided |
| Q-128 | Should the app mark one option as proposed: only with a named rule, always, or never? | The maintainer, in their words: "Named rules should be an option but also if something very obvious is happening in a quality check like all intent facing apps all started failing a control that has never applied to them that wouldn’t normally trip a deteninistiv check should have some sort of recommendation as well". The session's reading: a proposal when a written rule supports it, with the rule named; and also when a learned check sees something overwhelming that no written check trips. What counts as overwhelming, and whether such a day pauses, is Q-132 | decided; Q-132 open |
| Q-129 | Which dataset is the leadership work proven on first: the control estate, the taxi example, or a twin of the maintainer's real data? | "Control estate" | decided |
| Q-130 | When does smaltfl move its smaltdb pin to the engine with the plan API (ADR 0011's slice 0b)? It needs a smaltql pin, which is stenhoor's to agree, and may move hashed vectors | "Before the builder": after the work of Q-126 and before the question builder, so the builder is written once, on plans | decided |
| Q-131 | Only the estate declares gates. Should every flow get bronze, silver and gold? | "Convert one by one": each example gains its gates as its own recorded decision, with its pinned hold days measured again | decided |
| Q-132 | An overwhelming learned finding (Q-128): does it pause the day and carry a proposal, or publish with a recommendation beside it? What makes it overwhelming? | Not answered yet. The session's proposal: it pauses the day and proposes "Keep the last good day", naming the finding it rests on, and ordinary learned findings keep warning (Q-114) | open |
| Q-133 | At the tip, on the fork's data (`618e81a`), `test/hold-real.test.ts` and `test/story-real.test.ts` fail six tests: the taxi example holds 41 days under `wrong` where its vector says 25 (the legacy form 43 for 28), and three word budgets are passed. CI skips these tests, which need `dist/app/data/history.json`. Bring the vector back to 25, or accept the days added? | Not asked yet: the days added, and the judge that holds them, are to be found first | open |

## The bronze layer: the maintainer's request, and what is open (ADR 0015)

The maintainer, 2026-11-10: *start with the bronze layer*: deterministic checks tied to the ontology (what is expected
of a column, which types of application a dataset applies to, later which combinations are odd), a notebook that grabs
the data and runs them, toggles on the card that switch each check on and off for each column and update the notebook,
each step with its data explored (a distribution a column), its news and its output, then the classifier and the
isolation forest as toggles with views of their own; "UI best practice", and for any dataset. ADR 0015 is the design.
These are the choices made on the way, for the maintainers to confirm or change.

| ID | Question | Default built | Status |
| --- | --- | --- | --- |
| Q-134 | plan/4's watch gains `columns` (a mode a column) after plan/4 was introduced. Keep the tag, or make it plan/5? | Keep plan/4: it is in no release and had no pinned vector; its first vector is pinned with the change (ADR 0015 §3, E15), as Q-82 kept plan/2 | default |
| Q-135 | The maintainer's words were "comment or leave open the notebook to run those checks for each of those columns". Is a check switched off a commented line, or written as off? | Written as off, in the gate cell's `columns` (`protocol: { blanks: 'off' }`): a comment is in nothing the flow hashes or records, so the record could not tell off from never written. The notebook view draws it struck through, as a commented line reads (ADR 0015 §3) | default |
| Q-136 | Where is "which objects a dataset applies to" written: the ontology, or each gate cell's SQL `where` (ADR 0014 §4)? | The ontology's `rows`: one row an object of a type, for the objects a condition selects, the condition as data (`{ internet_facing: 'yes' }`), written for the engine by `emit.ts`. A scope written in a gate cell still wins. A `needs` rule stays in the gate cell (Q-119 is not decided by this) (ADR 0015 §1) | default |
| Q-137 | Should a bronze file be held to one row an object wherever the ontology ties its rows to a type? Two rows of ADR 0014's answer key change with it | Yes, by default (`reconcile` holds at bronze, by its key alone). Mon 4 keeps its head (an amount that is almost none leads; the scope's missing keys follow from it); Thu 21 is led by "203 apps repeat a key", and the amount follows (ADR 0015, "What moves on the estate") | default |
| Q-138 | Where does a card's bronze reading live? | The card's Checks tab, rebuilt as the gate's page in the flow's order: the verdict, what loaded, the dataset's lines, a card a column with its distribution and its lines, the models, the news, what goes on, the cell. The tab keeps its name and News stays first (ADR 0015 §5) | default |
| Q-139 | A dataset with nothing declared: should the page propose declarations from the data (a column's values, a band from its usual range, the key), and count a coded column without being told? | Not built: the next slice (ADR 0015 §7). Until then such a dataset has its columns explored, its history's lines and the classifier, and nothing for the forest and the pairs to read | open |
| Q-140 | The same column is in many files (the status is in all twelve control files). Is a rule on it set once and inherited, with a file's own version where it differs, or does each file have its own rules? | The maintainer, 2026-11-10, after looking at slice 1 in the app: "Each file on its own": every file's section of the Ontology page has its own rules, and nothing is shared between files (ADR 0015, amendment 1) | decided |
| Q-141 | When a rule is set in the ontology, does it run at once on that file's import card, or wait for its toggle? | "On as soon as it is set": a rule runs for its file once set; the card's toggle can switch it off, written in the notebook (ADR 0015, amendment 1) | decided |
| Q-142 | "The pass rate is generally between X and Y, derived from the past 90 days": once derived, does the range stay put or keep moving? | The maintainer, in their words: "Let’s make this configurable so it’s either set it and forget it or rolling updated based on desired number of days or something else". A range says how it is kept: fixed once set, or rolling over a number of days the rule gives; other ways may follow (ADR 0015, amendment 1) | decided |
| Q-143 | How much of setting rules works in the app in the first version: accepting and adjusting proposals, full editing, or a read-only page? | "Full editing in the app": rules are added, changed and removed on the Ontology page with forms (ADR 0015, amendment 1) | decided |
| Q-144 | The Ontology page is laid out by file (amendment 1). Where do the rules of a dataset the flow makes go: the estate's combination rule (where Key rotation is Passing, Encryption at rest must be Passing, Exception or Not assessed), the posture's key against the inventory, the bad value on each of its status columns? The maintainer named "this combination has to mean something else" as a rule they expect on the page | Not asked yet. Today they are on the posture card's Checks tab and nowhere on the Ontology page (ADR 0015, amendment 1, piece (a) after its review). Proposal: a section of its own after the files for each dataset the flow makes that has rules, laid out as a file's, with a line under each file it reads that names it | open |

## Gates: the maintainer's answers (ADR 0014)

Asked through the question prompt on 2026-11-09, after a survey of layered data-quality checks, classifier two-sample
tests, isolation forests and how tools show checks. The ADR that records them is proposed; nothing in it is built.

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-110 | Where is a stage's gate (its checks, each on/off and warn/hold) written? | The maintainer: in the notebooks, "but easy to configure as toggles that just add steps to the notebook": a `gate()` cell beside the step; the app's toggles edit that cell and record the change (ADR 0014 §1) | decided |
| Q-111 | Where is an expected band (a pass rate around 85–95%) written, and how does it change? | In the ontology, per property value (`expect`), applying wherever the column appears; a lasting change offers Accept the new band, a recorded decision that edits the ontology (ADR 0014 §3) | decided |
| Q-112 | The classifier needs rows from earlier days: where from? | The maintainer: "small holdout but sample smartly": a kept sample of a few hundred rows a day beside the history, stratified (Q-117) (ADR 0014 §5) | decided |
| Q-113 | How are SLA look-alike days (many due dates together, usual lateness) told from a wave of lateness? | A `due` mark on the date column in the ontology, judged deterministically: what was due, what ran late, the late share against its history (ADR 0014 §3) | decided |
| Q-114 | Which checks hold and which warn by default, at each layer? | Deterministic checks hold, learned ones warn, at every layer, unless the ontology marks the value bad; a toggle flips either (ADR 0014 §2) | decided |
| Q-115 | What seals a gold dataset, and how does the seal show? | Automatic when every gate passed or every hold was decided: the signed manifest is the seal; a badge on the card, with what was checked, who signed, when and the hash behind a tap; unsealed by a re-run or a later decision (ADR 0014 §6) | decided |
| Q-116 | How do the layers read on the canvas, and where do the checks live? | The maintainer: "keep the free layout; gate marks only": each card carries its gate's worst state and reason; the checks on a Checks tab of the card's sheet (ADR 0014 §7) | decided |
| Q-117 | What does "sample smartly" mean for the kept rows? | Stratified by the dataset's typed columns and status, plus every row a judge flagged (ADR 0014 §5) | decided |
| Q-118 | The gold reconcile check's key: declared in the gate, or the ontology's `lookup`? | Not asked yet; built as declared in the gate (`reconcile: { key, of }`, ADR 0014 §"As built" slice 5) until decided | open |
| Q-119 | Should a silver `needs` rule be derivable from the ontology rather than written per gate? | Not asked yet | open |

## Checks nobody wrote: the maintainer's request, and what is open (ADR 0013)

The maintainer, 2026-11-09: a dataset like the one they work with, a list of applications passing or failing
controls, every control its own starting dataset; checks at the control level (data missing, columns missing, odd
columns, combinations of columns) and across the datasets ("suddenly everyone failing TLS is now passing
encryption"), not hard-coded: "an isolation forest or some data-driven check to discover it". Built as ADR 0013 says;
these are the choices made on the way that the maintainers should confirm or change.

| ID | Question | Default built | Status |
| --- | --- | --- | --- |
| Q-104 | How is a combination judged: by the cell's share of rows, or by how the two values go together beyond their own shares? | The log odds ratio of the cell's two-by-two table, with its own normal range; the rows it moved said against what the day's own counts and the usual odds predict (ADR 0013 §2). A column moving on its own is never told twice | default |
| Q-105 | What holds a day for a combination? | Four typical misses out and either five points of the day's rows, or twice (or half) what the columns predict by two points or more (ADR 0013 §2). Two points: unusual | default |
| Q-106 | How many cells may a pair have before its day-by-day counts stop? | 64 (eight values by eight); past it, new combinations only (ADR 0013 §1) | default |
| Q-107 | Should the isolation forest's "unlike any day before" pause a day on its own? | No: it is told as unusual, and only when nothing plainer names its columns (ADR 0013 §3). The maintainer may want it to hold | default |
| Q-108 | Who tells a watched step's claim, and should the engine tell every claim the same way? | The engine tells a watched step's, from what the page pins and says of the record (`tell`); the page still tells a source's (ADR 0013 §4). Telling every claim in the engine would retire the page's judge (ADR 0009's "left for later") | default |
| Q-109 | A daily file whose columns don't match its declared ones: refused as now, or paused with a decision? | Refused: the run fails and the status line says which file and why; nothing publishes (ADR 0013 §6, Mon Mar 11). A pause with a decision is ADR 0009's slice 3 | default |

## Visual first, in two minutes: the maintainer's answers (ADR 0012)

Asked through the question prompt on 2026-11-09, after the survey ADR 0012 cites. The ADR that records them is
proposed; nothing in it is built.

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-96 | What does the app produce for leadership at the end of the two minutes: a one-screen brief card, a short narrative with charts, or only the evidence? | The maintainer: "A one-screen brief card": situation, what changed (one chart), impact, cause, the fix proposed, filled in from the day's findings, the words editable, shared as an image or link (ADR 0012 §1) | decided |
| Q-97 | How should the pipeline read on a phone: a horizontal Alteryx-style flow, a stage stepper, or a zoomed-out map? | The maintainer: "Horizontal flow, Alteryx-style" (ADR 0012 §4) | decided |
| Q-98 | Which drill-down matters most: which rows and why, what it did downstream, how it compares to before, where the data came from? | The maintainer: all matter; first "which rows and why, but more aggregated for leadership" (ADR 0012 §3) | decided |
| Q-99 | Should the whole flow fit one screen as glyph nodes with a tap into a stage, or scroll sideways at readable size? | The maintainer: "Readable nodes, scroll sideways", with a mini-map (ADR 0012 §4) | decided |
| Q-100 | Which lens colours the canvas first: today against usual, the checks, or rows in and out? | The maintainer: "Today against usual", the others a tap away (ADR 0012 §5) | decided |
| Q-101 | Who picks the dimension the dropped rows are broken down by: the app (the biggest driver), the person from a fixed set, or one configured per check? | The maintainer: "The app picks the biggest driver", the others as chips (ADR 0012 §3) | decided |
| Q-102 | What role does the notebook play when exploring: behind the visuals, side by side, or its own page? | The maintainer: "Behind the visuals": every visual shows its cell on request; the notebook is where the logic is changed (ADR 0012 §6) | decided |
| Q-103 | Which comes first: the brief and incident page, the canvas, or the drill-down? | The maintainer: "Brief and incident page first" (ADR 0012, Consequences) | decided |

## Notebooks as the step surface: the maintainer's answers (ADR 0011)

Asked through the question prompt on 2026-11-09, after a survey of smaltnb, smaltdb, smaltdf and smaltts as checked
out that day. The ADR that records them is proposed; nothing in it is built.

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-87 | How does the work reach `stenhoor/smaltfl` (ADR 0007), and does the handoff's unfinished work (Q-86, the round-3 findings, judge round 4) come before or after the notebook surface? | The maintainer: through the fork `beepboopbop64/smaltfl_fork`, whose `main` fast-forwards to the history (Steve's initial commit is its root); the pull request upstream is opened from the fork by the maintainer. "Move, then notebooks; park the leftovers": Q-86 and the view findings stay listed in docs/HANDOFF.md as later PRs (ADR 0011 §9) | decided |
| Q-88 | What is a notebook in a flow: the only step surface, a step kind beside the visual tools and SQL steps, or an editor whose save writes today's document? | The maintainer: "The only step surface": every transform is an exported cell; the visual tools and SQL steps go; the examples are rewritten; format 4 and plan/3, with format 3 and every pinned vector unmoved (ADR 0011 §1) | decided |
| Q-89 | Who writes during a run: smaltfl's runtime (versions by key, hashed, held or pointed), a notebook's `action()` cells, or both by step? | The maintainer: "smaltfl's runtime only": exported cells are read-only queries; action cells never run in a flow run, as smaltnb's imports never run them (ADR 0011 §2) | decided |
| Q-90 | How is a check written: a cell carrying smaltfl's warn/drop/fail rules and `maxDropped`, a plain cell that must be empty or in bounds (smaltts's shape), or checks kept in the flow document? | The maintainer: "Check cells with smaltfl's rules": a `check` cell option, the plan's expect node unchanged, the shape offered to smaltnb as its `expect` cell (ADR 0011 §3) | decided |
| Q-91 | `df` cells in the first slice, after `sql` cells, or never? smaltdf has no write path | The maintainer: "Both from the start": a `df` cell's statement comes from smaltdf's `explain()`; the runtime materialises it as any step; the taxi example mixes the two (ADR 0011 §4) | decided |
| Q-92 | Notebooks and flows on disk: one folder a flow with several notebooks, one notebook a flow, or the notebook as the flow (no JSON)? | The maintainer: "One folder per flow, several notebooks": `examples/<flow>/flow.json` names them by path and hash, each a stage, later ones importing earlier ones' exports (ADR 0011 §5) | decided |
| Q-93 | What does the app become: the canvas with a cell opening in smaltnb's editor, two apps linked, or a pipeline view inside smaltnb's page? | The maintainer: "Canvas stays; a cell opens in smaltnb's editor": a notebook is a group of cards, a card's sheet is smaltkit's editor with the preview and statement; strip, news, pause and decisions as built (ADR 0011 §6) | decided |
| Q-94 | smaltts names smaltfl as the pipeline product built on it and plans `flow()` (no code yet, its prototype off the current engine). Target it and build on plans now, build on it now, or ignore it? | The maintainer: "Target it, build on plans now": publish and bookkeeping through plans and the plugin today, an ADR drawing the seam (`load` with `swap`, interface views, change sets), Gate C raised with stenhoor (ADR 0011 §7) | decided |
| Q-95 | Pinning smaltnb and smaltkit (for smaltty) in `packed.json`, which the family rule says to ask the owner about first: ask first behind an interface, pin now and say so in the PR, or copy the parser in? | The maintainer: "Pin now, tell him in the PR": the pins land in the first notebook PR, said plainly in its description; smaltdb's pin moves to smaltnb's (ADR 0011 §8) | decided |

## Filling a paused day and any dataset: the owner's answers (ADR 0009 amendment 1, ADR 0010)

Asked through the question prompt on 2026-11-08, each with the option the owner picked in their words. The ADRs that
record them are proposed; where an answer differs from what the designs proposed, it says so.

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-86 | A deliberate (lasting) change that nobody accepts: does it pause once and then go back to notes (as the last pass built it, keeping the taxi vector at 25 days), keep pausing every day until someone accepts it (the taxi example then pauses about 29–31 days), or pause for up to a week? | The owner, 2026-11-09: "Keep pausing until accepted": every following day at the new level pauses until someone accepts it; the owner was told the taxi example then pauses about 29–31 days. **Not built yet** (docs/HANDOFF.md, "What is not done" 1): the code still pauses the change's first day only (ADR 0010 §15) | decided, not built |
| Q-67 | On some days only part of the data arrived and that part fails the checks (Sep 18, 2022; Sep 22–24, 2023). Should "publish only the part that arrived" still be offered there? | The owner: "Show it, marked": shown with "fails its checks", so it's clear why it can't go (ADR 0009 amendment 1 S5) | decided |
| Q-66 | Should the taxi example mark payment type 4 (Dispute) as a bad value, so a surge in disputes always alerts? | The owner: "Not now": the paused days stay as they are; it can be added later, with its own backtest (ADR 0010 §13) | decided |
| Q-64 | During an outage of several days (Nov 14–20, 2022), can one fill decision cover the following days, each filled from its own good day? | The owner: "Yes, until a day passes": one decision, stopping at the first normal day, the way Don't publish can stand (ADR 0009 amendment 1 S5) | decided |
| Q-63 | To always get back to what was true, the original files must stay fetchable: keep the data branch's history, put the files in the audit export, or both? | The owner: "Keep branch history": every past file stays fetchable. Done: `data.yml` adds each build as a commit on top of the last (0d41719) (ADR 0009 amendment 1 S13) | decided |
| Q-62 | When a corrected file, or the real day, arrives later and passes its checks, should it replace the fill on its own? | The owner: "On its own": it's the real data and it passed; the swap is recorded, and the fill stays one tap away (ADR 0009 amendment 1 S7; built in slice 3) | decided |
| Q-61 | Once readers have a filled day, may someone take it back to "not published", so readers go back to the day before? | The owner: "May withdraw it": someone may take it back, and readers see the previous day again. Recorded like any decision: a Don't publish decision amending the fill's, and a release that points the names back (ADR 0009 amendment 1 S5, S10). The designs had proposed "only replace" | decided |
| Q-60 | Publishing only the part of a day that arrived (say, trips before 13:00) adds no filled rows to mark. Where should it say the day is partial? | The owner: "Release and screens": they say "before 13:00 only", and the data gets no extra column (ADR 0009 amendment 1 S12) | decided |
| Q-58 | Which calendar should a new flow start with? | The owner: "None unless chosen": no holidays assumed; you add the days that matter, like Patch Tuesday or month-end. A legacy document keeps `us-nyc/1` (ADR 0010 §2) | decided |
| Q-57 | "Accept the new level" publishes the day and changes how later days are judged. Who may pick it? Does one acceptance cover the days after it, while the numbers stay at the new level? | The owner: "You + roles named for it": the owner, and a role only if "accept" is listed for it; giving a role the right to decide doesn't include it. And "Covers later days": the change pauses once, and later days at the same level publish under that acceptance until normal has caught up (ADR 0009 amendment 1 S6, S8). Built in phase 3: a later day publishes under it when only the story holds it and every metric off on it is one the level names, off the same way; Mon Nov 21, 2022 (Vendor 1 back) pauses again | decided |
| Q-56 | For a column marked serious (country, tool), should a value never seen before always alert? | The owner: "Alert on new values": a new country or tool in that column is treated as something wrong. A column is serious when it lists bad values or says `"newValues": "alert"` (ADR 0010 §4) | decided |
| Q-55 | A source sends several files a day and one of them is off. What should pause? | The owner: "That file's slot": only that part of the day waits; outputs that don't read it still publish (ADR 0010 §7) | decided |
| Q-54 | The taxi example pauses 28 days between 2022 and January 2024. Add Election Day to its calendar and stop last year's oddities echoing into this year? | The owner: "Yes, 25 days": Nov 8, 2022, Nov 7, 2023 and Nov 14, 2023 stop pausing; the 22 short days still pause. Built when the example moves to the general form, with the hold vector moved on purpose (Q-52; ADR 0010 §13) | decided |
| Q-53 | Some days have nothing to compare against yet: a holiday in a feed's first year, or a new feed's first weeks. Today they're called "Normal" and published. What should happen to them? | The owner: "Publish, marked": published with a "Not judged yet" mark, and a day with under a tenth of its recent rows still pauses. No taxi pause changes; 21 taxi days in 2022 get the mark (ADR 0010 §1) | decided |

## Pausing a day that is off: decided (ADR 0009)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-50 | Who decides what happens to a held day by default, the owner only or stewards? Is Publish as is owner-only, and may it stand for later days? | The owner, 2026-11-08: "Owner, and if the owner wants they can delegate to people as a role." **The owner by default;** a `smaltfl:decide` action rule delegates deciding to a role, its `may` the options it may take, and a rule without `may` takes every option but Accept the new level (Q-57). Publish as is covers one day; Don't publish, a fill and the complete part may stand until a day passes (ADR 0009 §8, amendment 1 S8) | decided |
| Q-49 | Are filled rows allowed in published data, and how are they marked? Which donor day? Do filled and unpublished days feed the ranges later days are judged by? | The owner, 2026-11-08: "Marked in the data. We should always be able to get back to what was true, what was used later if anything, and we should be able to update what was used if we get better info later." On the donor: "You need to offer both. Sometimes day will matter like taxi data set, sometimes it won't like for security issues I deal with up at work." **Filled rows may be published,** marked by a `filled_from` column on every row and counted on the release; what arrived, what was published and what replaced it are all kept and traceable, and a fill can be replaced or withdrawn (Q-61). **Both donor rules,** chosen per flow: the same weekday, or the nearest good day, before or after (ADR 0009 amendment 1 S1, S3, S7). The ranges part is the maintainers' Q-59 | decided |
| Q-48 | Does "forward or backfill" mean filling a held day's missing part from the days before and after, re-running a corrected file, or both? | The owner, 2026-11-08: "impute the data if it's bad until it's good, just don't publish a change, then forward or backfill". **Both:** fill the missing part from the same weekday before (forward) or after (backfill), publish only the complete part, or re-run the day when its file is corrected (slices 2 and 3); "impute until it's good" is the standing setting `"meanwhile": "fill", "until": "normal"` | decided |
| Q-46 | Which days should hold by default: those the story says something wrong of and whose trips are below their range (`short`, 22 days in 2022 to January 2024), or every day it says something wrong of (`wrong`, 28)? | The owner, 2026-11-08: "if something is off then let's not publish the data". **`wrong` by default** (`"hold": ["checks", "wrong"]`); a flow may narrow it to `short` | decided |
| Q-45 | Should the flow hold outputs built from a day with something wrong, not only a day its checks drop too much of? | The owner: "If something is off then let's not publish the data … pause the data and then wait to get confirmation on what to do there." **A day that is off is paused, not published:** a flow's `publish` block says what holds it; a held run is built, checked, hashed and recorded with its versions staged, nothing it made is published, and readers keep the last published day until a person decides (wait, publish as is, don't publish; later fill from before or after, publish the complete part, re-run when corrected) | decided |

## The licence: decided (ADR 0005)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-44 | Licence | MIT, `Copyright (c) 2026 smaltfl contributors`, as in the rest of the family | decided |

## The flow plan: decided (ADR 0004)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-42 | How does a flow reach the engine? | Through the flow plan: one machine layer that every surface (builder, SQL, later notebooks and dataframes) translates into, which is typed, keyed, optimized and emitted for smaltdb. People say what, the machine decides how | decided |
| Q-43 | An AI agent in smaltfl? | Not for now. An assistant that builds and tunes flows would be its own repository (smaltai, later), working through the flow plan; for now the maintainers build flows with Claude Code | decided |

## Round 3: decided (ADR 0003)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-39 | The ontology screens (A4, A5) | Good enough for now: types with their datasets, named links, actions on the types they edit, a details panel; objects browsed through the policies, with the action's permission check shown before submitting | decided |
| Q-36 | The scenario's actions | *Exclude trips* (stewards), *Set zone service target* (a district lead, for their own district only), *Annotate weather event* (anyone the flow is shared with) | decided |

## Round 2: decided (ADR 0002)

| ID | Question | Decision | Status |
| --- | --- | --- | --- |
| Q-31 | Identity without a server | Identity cards: a key pair created in each person's browser; the public card is shared to be added as a principal. Sign-in comes with the server | decided |
| Q-32 | What is a "district"? | The borough (five boroughs and Newark airport); policies can also name zones | decided |
| Q-33 | How much snapshot history is kept? | Every snapshot by hash, within a budget; oldest unpinned first; shared or pinned runs keep theirs | decided |
| Q-22 | The UI (clarified) | A visual builder for data engineering, in the spirit of Foundry's Pipeline Builder, built without a UI framework | decided |
| Q-28 | Colour | Cobalt teal: `#00786F`, text `#006861`, dark `#4FD1C5` | decided |
| Q-30 | Brand work | Through the fork `beepboopbop64/smalt-brand`, then a pull request to `stenhoor/smalt-brand` | decided |

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
| Q-21 | Repository home | `stenhoor/smaltfl`, moved from `beepboopbop64/smaltfl` (ADR 0007) | decided |
| Q-23 | A canvas kit in smaltkit? | Not now: it stays in this repository | decided |
| Q-24 | Changes in other smalt repositories | Not for now; discussed with stenhoor first | decided |
| Q-25 | Name | `smaltfl`, said "smalt-flow" | decided |
| Q-26 | Tagline | Small. Alternative. Flow. | decided |
| Q-27 | Positioning | Data pipelines for smaltdb. | decided |
