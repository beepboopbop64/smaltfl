# ADR 0012: Visual first, in two minutes: the brief, the incident page, the drill and the phone canvas

- **Status:** proposed, 2026-11-09. It records the maintainer's answers of 2026-11-09 (Q-96 to Q-103,
  docs/OPEN_QUESTIONS.md), given after a survey of how flow builders, data-observability tools and mobile analytics
  draw pipelines, incidents and drill-downs, and of what the smalt family already draws. Nothing in it is built.
- **Date:** 2026-11-09
- **Builds on:** [ADR 0008](0008-visual-first-news.md) (the story, one cause a day, word budgets, marks: all kept),
  [ADR 0009](0009-paused-not-published.md) (holds, decisions, the strip), [ADR 0010](0010-any-dataset.md) (judging any
  dataset, measures), [ADR 0011](0011-notebooks-as-the-step-surface.md) (a notebook is a box on the canvas).
- **Amends:** ADR 0008 §12 (the canvas on a phone stacks its sections two cards a row: replaced by §4 here) and
  ADR 0002 §4 (the builder's open grid canvas: kept on wide screens, read sideways on a phone).

## Context

The maintainer's measure of the app: *on my phone or wherever, I should be able to find a problem or explore the data
and within two minutes give leadership a clear, easy-to-digest explanation of a problem or a question, and a solution I
can implement.* Today the canvas on a phone is one long column of cards, hard to read as a flow; a notebook opens in a
tall sheet of code and counts, text first; "rows dropped" is a number with no next step; and nothing in the app
produces the explanation.

What the survey found (sources in §7):

- **No flow builder has a phone layout.** Alteryx, Foundry's Pipeline Builder, Dataiku, KNIME, dbt Explorer, Dagster:
  all draw left to right, encode the kind by shape and the step by a glyph, colour the graph by *one* dimension at a
  time with a legend (dbt's lenses, Dataiku's views, Foundry's node colours), put row counts on the edges (Alteryx's
  connection progress, KNIME's port dimensions) and status as a small mark under the node (KNIME's traffic light,
  Node-RED's status text under 20 characters), and fold groups into one node. On a phone they fall back to a list.
- **Incident pages share one order:** what (the metric with its expected band and the offending point), impact (the
  datasets and days downstream), likely cause (facts, then theories), decision needed; a status vocabulary that
  separates *wrong* from *unusual but expected*; a sample of the rows behind the number with the query for the rest;
  the actions sit on the chart and teach the model (Bigeye, Monte Carlo, Metaplane, Soda, Elementary).
- **Mobile analytics:** overview first, zoom and filter, details on demand (Shneiderman); the first screen carries the
  one point; tap, never hover; a bar tapped filters, with the filter named at the top and a way back; a sheet past
  half the screen should be a page (Material).
- **The leadership explanation** is one sentence that takes a position, says what is at stake and names the action
  (Knaflic's Big Idea; BLUF; SBAR: situation, background, assessment, recommendation), built from measured facts
  first and words second (Tableau Pulse, Power BI's smart narrative), with a missing value left out rather than
  written.
- **What the family has:** ADR 0008's story and marks, tested over three judging rounds; `src/app/viz.ts` with the
  hero visuals (split rows, part bar, hour bars, amount line, gate bars, rule rows, day strip, waterfall, composition,
  dumbbells, quantiles); smaltkit 0.6.0's charts (bar, column, line, area, combo, pie, donut, funnel, treemap,
  waterfall, gauge, KPI card, scatter, heatmap), its virtualised grid, controls and brand tokens, none of it used by
  the app yet; and gaps: no band or ghost vocabulary in smaltkit, no touch grid, no drill or selection model across
  charts, no DAG renderer, no sheet or page primitives.

## Decisions

1. **The brief is the goal, and it is one screen.** (Q-96) Every day that is wrong, unusual or paused gets a *brief*:
   one card the app fills in from what it already measured and judged, in SBAR order with the Big Idea on top:
   - **Situation:** one sentence, deterministic, from the story: *"Taxi trips on Thu Sep 21 fell 95% from 13:00: only
     Flex Fare records arrived after it; 4 of 6 published datasets wait."* Head ≤ 6 words stays the card's title (ADR
     0008 §5); the sentence ≤ 25 words, a clause left out when its value is missing, never "null" or "because".
   - **What changed:** the one visual the cause picks (ADR 0008 §6), the day against its usual band.
   - **Impact:** which published datasets and ontology objects changed or wait, by how much, and who reads them.
   - **Cause:** the facts (the file, the part that stopped, the hour), and a theory only when labelled as one.
   - **Fix:** the decision on offer with its receipt wording (publish as is, keep the last good day, fill from Wed 20,
     accept the new level, tell the source), and what happens to readers under each.
   - Editable words, then shared as an image, as text (the SBAR as a message) or as a link to the artifact's day.
   The brief is the held day's **incident page** (decision 2) folded to its first screen, so the two are one thing.
2. **A held or off day has an incident page in a fixed order.** (Q-103, first) What → impact → cause → decision, every
   time, with the data-observability status words: *investigating* (paused, undecided), *expected* (published as is,
   or accepted as the new level, which alone retrains the range), *fixed* (a corrected file or a fill), *no action*
   (calm). The decision sheet (ADR 0009 §12) and the News tab's cause card become sections of this page, not places
   of their own. It is a page, with a back control, not a bottom sheet (Material: past half the screen, a page).
3. **Drill-down is "which rows and why", aggregated, and the app picks the split.** (Q-98, Q-101) From any number that
   counts rows (dropped by a check, gone from a part, surplus in an hour), one tap opens the rows **by the dimension
   that explains most of the change**, chosen among the ontology's counted and followed columns (the vendor, the zone,
   the hour, the payment type) by how much of the difference its top value carries; the other dimensions are chips.
   Tapping a bar filters; the filter is named at the top with a way back; the sample rows sit at the bottom with the
   query behind them; the SQL and the cell are a further tap. Drawn with the family's bars and the dumbbell against
   usual, labelled numbers that add up (ADR 0008 §6), never a hover.
4. **The phone canvas reads sideways, like a flow.** (Q-97, Q-99) On a phone the flow is laid out left to right at
   readable size, two or three nodes a screen, swiped along, with a mini-map strip that says where you are; on wide
   screens the grid canvas stays. The nodes take the survey's grammar: shape for the kind (a square source, a round
   notebook, a diamond published dataset), a glyph inside for what it does (load, check, fill, join, count, publish),
   the name under, and a **status mark under the node with ≤ 20 characters** ("−6,942 rows", "paused", "ran 06:12");
   **row counts on the edges**, so the flow reads as a funnel and a vanishing is seen where it happens. A notebook is
   one node (ADR 0011 §6), its steps opened by a tap, never all drawn at once on a phone.
5. **One lens at a time, "today against usual" first.** (Q-100) The canvas is coloured by one dimension with a legend:
   the day's story (wrong, unusual, calm, paused and hatched, not judged ◌, the marks of ADR 0008 §7) by default;
   checks (the worst result and the share dropped), rows in and out, freshness and who sees what a tap away. Colour
   never alone: every state keeps its shape or glyph twin.
6. **The notebook is behind the visuals.** (Q-102) Every chart, count and sentence shows the cell it came from on
   request, and the notebook is where the logic is changed, not where a reader looks first. The notebook sheet of
   ADR 0011 §6 becomes a page (decision 2's rule), each cell a collapsed card with its finding sentence first, its
   rows in and out as a bar, the sample rows behind a tap and the SQL behind a second.
7. **The judging rounds judge this too.** The lenses of docs/HANDOFF.md (five-second glance, masked text, detail,
   reconstruction, false alarms, honesty, colour, decision sheet, an adversarial explorer) add one: **the two-minute
   test**, an agent given a day and asked to produce the leadership explanation from the app alone, timed, its
   answer graded against the day's facts. The open round-3 findings (colour-only severity, missing keys and scales,
   rounding, calm days that look flagged) are fixed inside this work, not after it.

## As built

- **The brief, first pass (2026-11-09).** `src/core/brief.ts` (pure, tested on the sign-in log's planted days in
  `test/brief.test.ts`): `briefOf` orders the day's facts as §1 says (the status word; the head as the title; the
  situation in one sentence ≤ 25 words, a clause left out when its value is missing; impact; cause as facts, a
  theory labelled; the fix with the option proposed: a remedy that can go, else keep the last good day while
  something is wrong, else publish as is), `briefText` writes it as SBAR, `briefWords` and `briefBanned` hold it to
  the glance budget (90 words) and ADR 0008's banned words. In the app (`briefPage`), a *Brief ›* button on the day
  line of a day with something to say opens it over the page: the status pill and day, the sentence (editable, the
  person's words kept in this browser until the record's `note` entry is specified), the cause's own visual, the
  impact, the cause, the fix's options with the proposed or decided one marked and *Decide ›* while the day waits,
  and *Copy as text*. Not yet: the incident page's full order for the News tab (§2), sharing as an image or link, the
  two-minute test (§7).

## Consequences

- **Order of work** (Q-103): (a) the brief and the incident page, from the day's story, measures, holds and
  decisions the app already has, published on the artifact and judged by the two-minute test; (b) the drill-down by
  the biggest driver, from a check's rows and from a part that vanished, with the engine computing the splits over
  the day's snapshot; (c) the phone canvas read sideways with the node grammar, the status marks and the edge counts,
  and the lenses; (d) the notebook as a page behind the visuals. One PR each, each with its judging round.
- **What is reused:** the story, holds, decisions and measures (ADRs 0008 to 0010) supply every fact the brief
  states; `viz.ts` draws the hero and the comparisons; smaltkit's bar, column and KPI charts, grid and controls carry
  the drill and the sample rows where they fit the ADR 0008 rules (from 0, bands at 3:1, a 3 px minimum), else
  `viz.ts` grows. What the family lacks (a band and ghost vocabulary, a touch grid, a drill model, a DAG renderer)
  is built here first and offered to smaltkit as its own PR when it stands.
- **Nothing in the pipeline changes.** Documents, plans, keys, hashes, holds, releases and the record are untouched:
  this is the reading of what they already produce. The only new stored thing is a brief's edited words, kept in the
  record as a note on the day (log/1 gains no new kind: it is a flow-change-free entry of kind `note`, to be specified
  with the brief).
- **Needs from stenhoor's repositories**, asked, never changed from here: a chart palette and status marks for
  smaltkit (the brand has none yet), band and ghost tokens, a touch-first grid; whether smaltnb's planned chart cells
  (`chart.*`) take the same contract, so a cell's visual in smaltfl and in the notebook page are one drawing.

## Sources (the survey of 2026-11-09)

- Flow builders: Alteryx Designer (connection progress, tool containers, Tidy), Palantir Foundry Pipeline Builder and
  Data Lineage (node colour options, preview panel), Dataiku Flow (visual grammar, flow views, zones), KNIME (traffic
  light, port dimensions, components), dbt Explorer (lenses, refocus, selectors), Dagster (asset health, left to right,
  sidebar), Node-RED (`node.status`), Databricks Jobs (the run matrix), yWorks and Wu et al. on levels of detail.
- Observability: Monte Carlo (weekday-aware expected range, alert statuses, Incident IQ), Bigeye (issue page order,
  impact analysis), Soda (metric monitor page), Metaplane (the band that alerts, incident redesign), Elementary (expand
  a row to its graph and query), Great Expectations (result formats).
- Mobile analytics: Power BI phone layouts, Tableau automatic phone layouts, Looker mobile, ThoughtSpot Mobile (change
  analysis, tap-to-drill, revert and reset), Observable Framework's one-column grid, Shneiderman (1996), NN/g on
  deferring secondary content, Material's bottom-sheet rule, Tufte's sparklines.
- The explanation: Knaflic (the Big Idea, the three-minute story, action titles), BLUF and SCQA, Amazon's narrative,
  IHI's SBAR, Atlassian's incident communication templates, executive-briefing guidance, Power BI smart narrative,
  Tableau Pulse, ThoughtSpot SpotIQ, Narrative Science.
- Rules: WCAG 1.4.1 and 2.5.8, Apple and Material target sizes, Datawrapper on type and mobile charts, the NHS and
  Sprout number guides, Statuspage's 90-day strip.
