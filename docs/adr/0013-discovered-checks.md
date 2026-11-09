# ADR 0013: Checks nobody wrote: combinations judged from the history, and a dataset the flow builds watched like a source

- **Status:** proposed, 2026-11-09, built the same day as described under "As built". It answers the maintainer's
  request of 2026-11-09 (Q-104 to Q-109, docs/OPEN_QUESTIONS.md): a dataset like the one they work with, applications
  passing or failing controls, each control its own daily file, with checks at the control level (data missing, a
  column missing, a column off, two columns off together) and across controls ("suddenly everyone failing TLS is now
  passing encryption"), found by something data-driven rather than a rule someone wrote.
- **Date:** 2026-11-09
- **Builds on:** [ADR 0008](0008-visual-first-news.md) (findings, the story, word budgets), [ADR 0009](0009-paused-not-published.md)
  (holds, claims, decisions), [ADR 0010](0010-any-dataset.md) (watches, measures, histories, several loads),
  [ADR 0011](0011-notebooks-as-the-step-surface.md) (a flow is a folder of notebooks), [ADR 0012](0012-visual-first-in-two-minutes.md)
  (the brief, the status line).
- **Amends:** ADR 0010 §6 (a history's pairs were followed for new combinations only: now kept day by day while they
  are few) and §10 (a watch judged a source: now a published step too); ADR 0009 §3 (the page tells every claim: the
  engine tells a watched step's).

## Context

The sign-in log (ADR 0010) and the taxi trips are one file a day each. The maintainer's data at work is a *set* of
daily files: one per security control, each with its own columns, each listing the same applications, and the
question is as often about what two controls do together as about one. ADR 0010 gave each watched source a history
of its own values' shares; its pairs were followed only for combinations never seen before, so a pair whose *mix*
changed (the same two values, together far more or less often than their own shares explain) said nothing. And a
watch judged a source: nothing judged a dataset the flow builds, which is the only place two sources' columns meet.

Three things were missing, and this ADR adds them without a rule naming any pair:

1. a history that keeps each pair's cells day by day;
2. two judges read from it: the combination judge (each pair's association against its own history) and the forest
   judge (the day as a whole against the days before, by the isolation forest the app already uses for odd rows);
3. a watch on a published step, so the posture across the controls is judged as a source is, its history built by
   running the flow on each day's files.

## Decisions

### 1. A history keeps a pair's cells day by day, while they are few

A history's `pairs` entry gains `counts` (one row a period, as a counted column's values have) while the pair's
combinations number `PAIR_CELLS` (64, eight values by eight) or fewer. Past that the counts go, for good, and the pair
is followed for new combinations only, as every pair was before. `emptyHistory` declares pairs counted;
`appendPeriods` folds each period's pair counts and drops `counts` the day a pair outgrows it; `periodOf` and
`samePeriod` compare pairs' counts as they compare values', so a run's own measures and the history's period still
agree to the cell. The measures record (measures/0) already carried every pair cell: nothing hashed changes. A history
built before this ADR has no pair counts and is judged as before.

### 2. The combination judge: how two values go together, beyond what their shares explain

For each pair kept day by day and each of its cells, the metric `combo` (history.ts) is the **log odds ratio** of
the cell's two-by-two table: the rows with both values times the rows with neither, over the rows with one alone times
the rows with the other alone, half a row added to each so none is empty. It is zero when the two values are
independent, positive when they go together, and *unmoved when a column's share changes on its own*: a day on which
TLS failures double while the association with encryption stays reads as a TLS day, not a combination day. The metric
has its own series and its own normal range (`HistoryRanges.of`, scale `level`), learned from the history as a share's
is, with the flow's pattern and calendar.

`comboNews` (combos.ts) judges every cell of every pair on the day:

- a value hardly there today, or nearly everything (fewer than the day's row floor `M.rows` with it, or without it),
  says nothing of how it goes with another: its cells are passed over, and its own finding speaks;
- a cell whose odds are outside their range is told by the rows it moved: the day's count against what the day's own
  two counts and the usual odds predict (`comboPredicted`, the two-by-two table with those margins and that odds
  ratio), as a share of the day's rows;
- four typical misses out, and either five points of the day's rows (`MATERIAL.comboWrong`) or the combination at
  twice (or half) what the columns predict by two points or more: something wrong. Two points
  (`MATERIAL.comboUnusual`): unusual. Else worth knowing;
- one finding a pair: a pair's cells move together (in a two-by-two table every cell moves by the same amount, one
  doubling while another halves), so the pair's severity is its worst cell's and the cell named is the combination
  seen more than usual, the rarer of them when two tie;
- a cell with a value new that day is left to the pair's "never together" finding (ADR 0010).

The finding's kind is `combo`, its title "TLS Fail with Encryption Pass: 60 (usually ~30)" (eight words), its detail
the rows together, the points beyond what the columns alone predict, and what a day like it keeps within. It belongs to
the story's *values* cell (CELL_KINDS), is never folded under a cause, and holds a day as any alert does.

### 3. The forest judge: a day unlike every day before it

`unlikeNews` (combos.ts) sees a day by its numbers: every counted value's share, each pair's eight largest cells' log
odds, and the share the checks dropped. An isolation forest (quality.ts, the one the app's Odd rows tab uses) of 100
trees is grown on the learned days before (those the record and the viewer don't leave out, past the warmup, at least
28), each tree on half of them. Each learned day is scored by the trees it was not grown on; today by all of them. Today
is *unlike any day before* when its score is past every learned day's and past 0.5 (the forest's own line for a point
no quicker to isolate than the rest). No number is written here: the line is the days' own. What set it apart is read
from the forest itself: for each tree, the splits on today's way down, each credited with the share of today's
companions it cut away; the three features with the most credit are named, the first in the title when it fits eight
words ("Unlike any day: TLS Pass with Encryption Fail"), each with its value against the learned days' median in
`Finding.unlike.numbers`. It is told as unusual (never something wrong on its own), and only when nothing loud is
already said of the columns it would name or of the day's amount or hours: what it adds is the day no single number
flags.

### 4. A watch on a published step

A flow's `publish.watch` may name a step the flow publishes (one with a dataset block) as well as a source. Its plan
is plan/2 or plan/3 as before (the watch's node is the step's); its history is a history like any (`source` is the
step's id); its claim is claim/2. Three things differ, all because the step's load exists only once the run has built
it:

- **The history builder** (`scripts/data/history.ts --watch <step>`) takes loads of the form `{ slot, files: { source:
  path, … } }`: every source's file for the day. It pins them, runs the flow *without its publish block* (nothing to
  hold while the history is being built) and measures the dataset the run built, by the same `measure` the run uses, so
  the history's period and the run's own measures agree.
- **The run measures the step after building it** (runtime step 4 has its table) and **tells its claim itself**
  (`src/plugin/tell.ts`): `loadClaim`, as the page would, from the base history pinned under the watch's file name,
  the tail pinned under the step's tail path, the measures just taken, this build, and what the page said of the record
  for the step in `RunContext.tell` (`{ skip, levels }`: the days it leaves out, the levels it accepted). A watched
  step the run was given no `tell` for is not judged, which holds, saying so. The claim then goes through `judgeClaims`
  with the page's claims; the hold it makes carries it, and the page keeps it in the run's record entry as it keeps
  its own.
- **The page** (`claimsForRun`) tells no claim for a step: it pins the step's tail before the run and passes `tell`.
  After the run, the step's measures come back in `RunResult.measures` and join its tail as any load's do.

Holds, decisions and releases are by load (ADR 0010 §7): the step's load is `{ source: <step>, slot, sha256: its
content hash }`. A hold on the step reaches the step and everything built from it; a hold on a control reaches what
reads that control. With `together: false` the outputs that read neither still publish.

### 5. The app: several daily sources, and the dataset the views follow

The data list (loads.json format 2) may list several sources with loads. The page reads them as **days**: one entry a
day, the first daily source's file at the top and every source's file for the day in `files`; each is checked against
the list and pinned under its binding's name when the day is stepped to; the strip and the episodes are by day as
before. The list may name the watched source or step the page's views follow (`judged`; the data list's `judged`): its
history is the strip's and the brief's, its card carries the day's story, and a watched step may be it. Every watch's
history is fetched, checked and pinned (a watched step's is read by the engine itself). When another watched load held
the day and the judged dataset's own day isn't wrong, that load's verdict leads the status line ("Tue Mar 19: backup:
status fail with restore_tested yes: 60"), its card's line and the brief's title and sentence; its own News tab says
what the engine judged it by, against its own history.

### 6. The controls example

`examples/controls/` is the flow the maintainer described, generated from a fixed seed (`test/fixtures/controls.ts`,
`scripts/data/controls.ts`): 400 applications in five business units and three tiers; six controls (TLS, encryption
at rest, MFA, patching, central logging, backup), each its own daily CSV with its own columns and a `status`; an
application's standing holds for a fortnight at a time (its fortnights starting on its own day) and flips rarely;
tier-1 applications fail half as often; applications failing TLS fail encryption more often than their share says, and
applications whose restores are tested fail backup less often. Three notebooks: `controls.nb.ts` (a source and a check a
control: a known status, an application id), `posture.nb.ts` (every application's standing on every control, a left
join, published and watched) and `summary.nb.ts` (by business unit, by control). Every control and the posture are
watched, pattern `none`, no calendar.

Five days are planted in March 2024, one trouble each, told apart from the files alone (`test/controls.test.ts`
through the engine, and the app):

| Day | Planted | Told |
|---|---|---|
| Wed 6 | the patching file arrives with its header and no rows | patching: "Almost no apps: 0", held; the posture: "Patching blank: all (never before)", held |
| Mon 11 | the logging file lacks `coverage_pct` | the engine refuses the file by its declared columns: the run fails and says so; nothing is published (a refused file as a pause is ADR 0009's slice 3, not built) |
| Thu 14 | a third of MFA statuses read `ERROR` | MFA's checks drop 40% (held) and its story: "New status: ERROR"; the posture: "MFA blank: 40% (never before)" |
| Tue 19 | backup failures all on tested applications, as many failures and as many tested as ever | backup alone, by the combination: "status fail with restore_tested yes: 60"; the posture unusual, not wrong |
| Fri 22 | every TLS failure passes encryption, as many passers fail it instead, each column's own shares as usual | the posture alone, by the combination across the controls: "TLS Passing with Encryption at rest Failing: 47"; no control's own watch speaks |

The other days of March publish.

### 7. Two readings the judges changed

- A **column gone blank** (a control's file with no rows, or rows its checks dropped) is told as blanks, as a `missing`
  finding ("Patching blank: all (never before)"), and leads the day: its values' shares falling away and anything
  else about its values are the blanks, folded under it. Ten points of a day blank where none ever was is something
  wrong; two is unusual. Before, the day read as "patching fail almost gone", a part that vanished.
- A **value never seen in a column where that is something wrong** (ADR 0010 §4) leads the day too, before the checks
  it tripped: "New status: ERROR · 159 apps", with "Checks dropped 40%" following from it. And a value first seen on
  a day is told as new, never also as a share against a history of none.

## As built (2026-11-09)

Everything above, in one day's work on the fork: `src/core/combos.ts` (both judges, read in `newsOf`), the `combo`
metric and the pair counts (`history.ts`, `measures.ts`), the step watch (`document.ts`, `plan.ts`, `runtime.ts`,
`tell.ts`, `protocol.ts`'s `tell`), the history builder's step mode and `watchColumns` (the builder's default columns,
shared), the data list's days and `judged`, the app's several daily files, histories and engine-told claims, the
controls fixture, generator, flow and tests (`test/combos.test.ts` on a synthetic two-control posture;
`test/controls.test.ts` through the engine, 60 days of history and the loads of March), the build
(`npm run build:app -- --flow examples/controls/flow.json --out dist/app-controls`), published as a third artifact.
The sign-ins' demo day (ADR 0012, Wed Mar 20) will name its pair once its history is rebuilt with pair counts: the
built history predates this ADR.

## Consequences

- **A check nobody wrote.** Every pair the history keeps is judged every day, with the day's own counts as the
  baseline, so a shift in how two columns go together is found whether or not anyone thought of the pair, and a shift
  in one column alone isn't told twice. The cost is in histories: a pair of up to 64 cells adds a row of counts a day
  (the posture's 36 pairs add 0.19 MB over 182 days).
- **The forest is a second opinion, not a verdict.** It is told as unusual, never holds on its own, and keeps quiet
  when a plainer finding already names its columns. Whether a day it alone flags should pause is Q-107.
- **The engine now tells some claims.** ADR 0009 kept every claim the page's, checked by the engine; a watched step's
  cannot be, so the engine tells it from what the page pins and says of the record. "Holds measured in the engine
  rather than claimed by the page" (ADR 0009, left for later) is thereby half built: the same path could tell every
  claim, a decision for the maintainers (Q-108).
- **A refused file is still a failed run.** The missing-column day shows the engine's refusal on the status line and
  publishes nothing; recording it as a pause with a decision (ADR 0009 slice 3) is unchanged work.
- **Open:** Q-104 to Q-109 in docs/OPEN_QUESTIONS.md.
