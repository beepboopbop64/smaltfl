# ADR 0009: A day that is off is paused, not published

- **Status:** accepted for the principle and its defaults (the owner, 2026-11-08); Q-47, Q-51 and Q-52 open. Q-49 and
  Q-50 answered by the owner (2026-11-08), recorded in amendment 1.
- **Date:** 2026-11-08
- **Builds on:** [ADR 0004](0004-the-flow-plan.md) (the flow plan), [ADR 0006](0006-integrity.md) (run/1, the record,
  verify, the audit bag), [ADR 0008](0008-visual-first-news.md) (the story, the gate, a day shows that day). Answers
  Q-45, and records the owner's answers to Q-46 and Q-48.
- **Amends:** ADR 0008 §6 and §10 (§12 below).
- **Amended by** (both proposed, 2026-11-08):
  - [Amendment 1](#amendment-1-filling-a-paused-day-slice-2) below: filling a paused day, the complete part, Accept
    the new level, withdrawing a fill (§6–§12 and "Left for later").
  - [ADR 0010](0010-any-dataset.md): a watch says how its source is judged (§2), claim/2 (§3), holds and decisions
    about one load when several sources are watched (§5, §9, §10), and the donor's default from the pattern (§7).

## Context

Q-45 asked whether the flow should hold outputs built from a day with something wrong, not only a day its checks drop
too much of. The owner: "If something is off then let's not publish the data. Outside of the taxi example what I would
do is pause the data and then wait to get confirmation on what to do there. Probably should be many options for what
to do: the user can set up like impute the data if it's bad until it's good, just don't publish a change, then forward
or backfill, or anything else that would make sense."

Today one thing stops publication: an expectations step whose dropped share passes `maxDropped`, or a `fail` rule
that fails. The run throws. It leaves an error string and no manifest, so there is nothing to look at or decide on: the
outputs keep the last day that passed, and the next load moves on. The story (ADR 0008) finds the days with something
wrong, but it only tells. Thu Sep 21, 2023 (trips fall 95% from 13:00) and Mon–Tue Nov 14–15, 2022 (vendor 1 sent
almost nothing) each published three outputs from a badly short day.

Measured over the history (761 days, 2022 to January 2024), with the story told for the flow rather than for a viewer
(raw names, nothing hidden, nothing marked as expected; display names change no day's verdict):

- The story says something wrong on 28 days. On 22 of them the day's trips are also below their range, *short*, in 7
  episodes. 14 are the four feed incidents (Aug 10, Sep 17–18 and Nov 14–20, 2022; Sep 21–24, 2023). 8 look like real
  changes, not missing records (Jan 4–9, 2022; the Jan 29, 2022 blizzard; Dec 22, 2022).
- The other 6 are fare codes coming and going while the trips stay in their range (Nov 8 and Dec 19–21, 2022; Nov 7
  and Nov 14, 2023).
- The checks pass their limit on 4 days (Sep 18, 2022; Sep 22–24, 2023), all among the 22.
- In every one of the 57 loads, the history's rows for the day equal the rows of the day's file.

Three designs were drawn (the engine and integrity; the document and policies; the person on call) and judged on
correctness, fit, simplicity and the screens. This records their synthesis: the engine design's mechanism (stage,
don't point; a release that is its own act; the decision recorded before it; a real check in verify), the document
design's settings and remedies, and the on-call design's screens. It also fixes what the judges found in all three.
The app's engine lives in memory, so decisions must outlive it. A held run that is returned must never be read as
published. Cached check counts must still hold. And older builds must refuse what they can't hold.

## Decisions

1. **Off means held, and held means paused.** A flow says what holds it (§2). A held run is built, checked, hashed and
   recorded like every run, with its run/1 manifest, but nothing it made is published. Each dataset name stays on the
   version last published. The run's versions are kept, *staged*, until someone decides (§6). Publishing a held run
   is a separate, recorded act (§5). An engine error still rolls the run back, so "a failed run leaves the previous
   versions current" stays true. A flow that says nothing about holding runs as it does today, and its gate still
   throws.

2. **People say it in the document.** A `publish` block. The defaults:

   ```jsonc
   "publish": {
     "hold": ["checks", "wrong"],          // what pauses publication; "short" narrows it
     "watch": { "trips": "history.json" }, // a source judged against its history, a file in the data's list
     "period": "day",                      // the parameter that orders the days
     "together": true                      // nothing goes out while any output waits
   }
   ```

   - `checks`: a `fail` rule failed, or more rows were dropped than `maxDropped` allows. With `checks` in `hold` these
     hold instead of throwing; without it they throw, as they do without a `publish` block, so neither way publishes.
     Outside the taxi example, this is how a flow with no history holds: a `fail` rule over a count (`n >= 40000`, or
     one row per hour) is a fixed threshold.
   - `wrong`: any day the story says something wrong (the 28), the owner's "if something is off". `short`, which a
     flow may choose instead: the story says something wrong and the day's trips are below their range (the 22). A
     flow holds on one or the other, never both.
   - `watch` names each source judged against its history, by its id, with the history's file. It is there exactly
     when `short` or `wrong` is, and it needs a `period`: a claim names a day, and the run's day is that parameter's
     value (§3).
   - Every field of the block is one this build knows. A field it doesn't (a later slice's `meanwhile`) is refused,
     never ignored, so a build can't run a setting it would not keep.
   - A document with a `publish` block is format 2 (`"smaltfl": 2`). Format 1 documents read and hash as before. An
     older build refuses format 2, so it can't run a flow that holds and publish what that flow would hold (Q-47).
   - The translation copies the block into the plan as `publish`, with each watched source by its node. The flow hash
     and the plan hash cover it, and verify's *flow* check translates it again. Holding changes no node, so no key
     changes and nothing is rebuilt.

3. **Where a verdict comes from.**
   - `checks`: from the manifest's expectation counts and the plan (`holdsOf`), never from inside the counting. A check
     reused by key holds again on the same day.
   - `short` and `wrong`: the flow's verdict, not a viewer's. The story is told with raw names, no hidden columns, no
     findings marked as expected, and no incident days left out of the ranges, since those marks belong to one browser.
     `dayClaim` (core, pure) tells it from the history file that the page checked against the data's list (ADR 0006
     §2). The page pins that file in the engine, as it pins a load, and passes the verdict to the run as a *claim*.
     The claim gives the source, the day, the story's state and head, whether the trips are below their range, the
     build that judged it, the history's path, sha256 and size, and the history's rows for the day.
   - The plugin holds a watched source as *not judged* when there is no claim, or when the claim:
     - isn't the only one for its source, or isn't shaped as a claim;
     - names another day than the run's `period` parameter;
     - names a history file other than the one pinned under the flow's watch name;
     - or counts other rows than the snapshot holds.

     Not judged is held, never published. A page can add a hold; only a recorded decision releases one.
   - The story's verdict is the page's claim, evidence at the Intact level (ADR 0006 §1). Its inputs are hashed (the
     history's sha256, the day, the snapshot's rows, `build.smaltfl`), and the verdict is recorded (§9). Later, holds
     measured in the engine from the run's own rows replace the claim as what enforces the hold. They will be measured
     against a pinned reference recorded as a source file (E1). The claim stays, as a hold that can only add.
   - The story code changes often. The set of days that `wrong` (and `short`) holds on the history is a test vector: a
     change to the story that changes it fails the tests until it is accepted on purpose (Q-52). Over 2022-01-01 to
     2024-01-31, `short` holds 2022-01-04 to 01-09, 01-29, 08-10, 09-17, 09-18, 11-14 to 11-20 and 12-22, and
     2023-09-21 to 09-24; `wrong` adds 2022-11-08 and 12-19 to 12-21, and 2023-11-07 and 11-14.

4. **What waits.**
   - With `together` (the default), every output waits while any hold stands, so the outputs never show different
     days.
   - With `together: false`, a hold reaches the outputs that read any source the holding node reads (`reachOf`), and
     the rest publish.
   - An output is *waiting* when its staged key differs from its current one. On the taxi flow these are `zone_hour`,
     `borough_hour` and `weather_effect`; the zones and the weather reuse their keys.

5. **Publishing a held run is a release.** A plugin method, `release`, works in one transaction.
   - It checks that:
     - the run is the one the caller means (its manifest hash);
     - each output's staged key is the key the decision names. A day run again after a reload has a new manifest,
       because its `previous` and `log` differ, but the same keys;
     - each output is held by that run and not yet released;
     - the decision's actor may decide that option under the run's own policies (§8);
     - "publish as is" has a reason;
     - and no later day, by the `period` parameter, is current for the name (without a period, no later run).
   - It then points the names and writes `_smaltfl_releases`: the run, the manifest, the names, the option, the actor,
     the reason, the decision's record leaf, and the time. A refusal is kept too.
   - A later day never closes an earlier waiting one. A day that has been passed over waits until someone decides, and
     the decision sheet says why it can no longer be shown.

6. **The options.** What readers get for the day that is held:

   | Option | Readers get | How | Slice |
   |---|---|---|---|
   | ‖ **Wait** (the default) | the last published version, "as of Wed 20" | nothing: the run stays staged | 1 |
   | ⚑ **Publish as is** | the held run's versions, flagged | a release, with a required reason | 1 |
   | ✕ **Don't publish** | the last published version; the day is closed and never published | a decision only | 1 |
   | ◧ **Fill from before** | the part of the day that arrived, plus the missing part from the same weekday before | a derived document (§7), released flagged with the rows filled | 2 |
   | ◨ **Fill from after** | the same, filled from the same weekday after, once that day has arrived and passed; the day waits until then | as Fill from before | 2 |
   | ◐ **Publish the complete part** | only the part that arrived: the hours before the fall, or every vendor but the missing one | a derived document with a filter | 2 |
   | ↻ **Re-run when corrected** | the day run again when the data's list republishes its file (ADR 0006's amber "republished"); released if it passes, held again if not | a run | 3 |

   - A decision covers **this day**, or the days **until a day publishes** (`untilPass` in the record): it stands for
     each held day after it until a day publishes, and its receipt says so ("Not published until a day passes"). Nov
     14–20 takes one decision, not seven. Publish as is covers one day at a time (Q-50).
   - The *missing part* comes from the story's cause. An hours cause gives the hours from its fall; a split gives the
     part that vanished. A cause with no part to blame (an amount) has no missing part, so neither fill nor the complete
     part is offered.
   - **Standing settings** come with the remedies in slice 2:
     - `meanwhile`: what readers get while a day waits: `last` (the default), `fill` or `complete`;
     - `until`: `decision` (the default), or `normal`. With `normal`, the pause closes itself when a later day
       publishes, and the day keeps what `meanwhile` gave it.

     The owner's "impute the data if it's bad until it's good" is `"meanwhile": "fill", "until": "normal"`. A release
     made by a setting cites the record's entry for the flow change that set it: it was decided in advance, by whoever
     changed the flow.
   - There is no timeout. A day waits until a person decides, as the owner asked.

7. **Remedies are derived documents.**
   - A fill or a complete part is `repairDocument(doc, repair)`. It adds the donor day's file as a second source,
     pinned by the sha256 the data's list gives it, so it can be derived again after a reload or a version upgrade. It
     puts a `sql` step after the watched source: `… WHERE NOT missing UNION ALL … donor WHERE missing`, with a
     `filled_from` column.
   - The derived document translates like any other and is stored with its run. verify's *flow* check holds unchanged,
     and anyone can rebuild the document from the flow and the decision.
   - Its nodes are new, so its keys differ from the bad day's: filled rows never share a key with real ones.
   - The donor is chosen from the data alone, never from what this browser happened to publish: the latest same
     weekday, within four weeks, that the history says nothing wrong of. Thu Sep 21, 2023 takes Thu Sep 14. Tue Nov 15,
     2022 takes Tue Nov 1, since Nov 8 had something wrong.
   - Timestamps move by whole weeks. The release says how many rows were filled, since an aggregate can drop the
     column.

8. **Who decides.**
   - Deciding is an action rule for smaltfl's own action, `smaltfl:decide`, with an optional `may` list of options:
     `{ "kind": "action", "action": "smaltfl:decide", "for": ["stewards"], "may": ["dont"] }`.
   - The owner may always decide. A flow without policies lets its one user decide. Otherwise only the people the rules
     name may decide, and only the options their rules list.
   - The plugin checks this at release, against the policies stored with the run, and the record keeps the rule that
     allowed it.
   - An older build's validator rejects the action, since it is not an ontology action type, so it refuses the
     document.
   - Until principals are bound to identity cards (ADR 0006 §8), this is a convenience, not a guard.
   - Policies → Rules lists it with the rules, "Decide paused days · for Owner" (and whoever a rule for it names), as a
     paused day says "Only Owner decides".

9. **The record.** Three kinds of log/1 entry. Kinds and `about` are data, so log/1 doesn't change.
   - `run`, with the outcome `held`. It carries the run, manifest, plan and files as an `ok` run does; the holds, each
     with its kind, its node and what it says (a story hold with its claim); the waiting outputs; and the staged key
     of every held output, waiting or not, which is what a decision names. The same day run again in an empty engine
     (after a reload) has every held output waiting, and the same keys, so its decision is still the same one. A held
     run with nothing waiting opens no pause.
   - `decide`. It carries:
     - the day, the run and the manifest;
     - the run's inputs: the flow hash, the parameters, and each source's file sha256;
     - the outputs it is about, as `{ name: key }`;
     - the option and its scope (`day` or `untilPass`);
     - the hash of the policies and the rule that allowed it;
     - the person's reason;
     - `amends` when it replaces an earlier decision, and `under` when it applies a standing one.
   - `release`. It carries the run, the manifest and the outputs, the decide entry it cites, and its outcome:
     `applied`, or `refused` with why.

   The decide entry is appended first, then the release carries its leaf to the plugin, then the `release` entry
   follows. If a crash comes in between, the decision is left without its release, and it is applied the next time the
   day runs.

10. **Decisions outlive the engine.** The app's engine lives in memory: a reload loses the runs, the staged versions
    and the names, and keeps the record.
    - A decision names its day's inputs, which find the day again, and its keys, which ensure that only what was
      decided is published.
    - When a day runs and is held, a decision for the same inputs with the same keys is applied again, and recorded as
      citing that decision.
    - A decision with other keys (made by another build) is shown, and applying it is one tap, recorded as an
      amendment.
    - Open pauses are read from the record, so a day held in an earlier visit still waits. Deciding it runs the day
      again first.

11. **verify and the audit.**
    - verify gains a *held* check. The holds must recompute from the manifest and the stored claims. Every held output
      that a name shows must have a release of this run, with this key and a decision's leaf, so a held output pointed
      by hand fails, whatever run number is stored beside it: only a run that made the same version (a reused key, the
      same day run again) may stand there instead. *published* accepts a release.
    - The audit bag adds what the engine names (each dataset's key, run and release), its releases, and what held each
      of its runs (the plugin's `_smaltfl_holds`, engine/holds.json). It proves each dataset as published: a released
      one by its `release` entry, and one a held run didn't hold (`together: false`) by that run's entry.
    - `audit.mjs check` checks held runs as it checks `ok` ones (manifest, plan, files). It fails:
      - a release whose decision isn't in the record before it, or was amended or decided again before it;
      - a release whose actor the stored policies don't allow;
      - a release whose keys aren't the held run's, or aren't its decision's;
      - a decision applied under a standing one that doesn't stand for its day;
      - a held output that is current with no release, the outputs a run held read from the engine's holds as well as
        the record's, so a run the engine held and the page recorded as published fails too;
      - and a name that shows a version of a run the record doesn't have.
    - An older `audit.mjs` rejects a proof that cites a `release` entry ("not a run that made anything"), so old tools
      fail closed.

12. **On screen.** ADR 0008's rules apply: shape first, and words budgeted.
    - **The day.** A paused day carries ‖ in the loads strip, the header and the tab title. A day published as is
      carries ⚑, and a day not published ✕. Output cards that wait say "‖ waits · shows Wed 20" (four words that fit a
      card), and once decided "⚑ as is · Thu 21" or "✕ still shows Wed 20" (not "unpublished · Wed 20", which read as
      Wed 20 being the day not published).
    - **The first screen.** The day line under the strip carries the pause and the day readers see, "‖ Paused · readers
      see Wed 20", with **Decide ›**, which opens the decision sheet; once decided, the decision's receipt, as the sheet
      collapses to it (below). A waiting output's News leads with the staged bar and "‖ Waits for a decision ·
      Decide ›", and what it says of its rows is "From its rows not yet published", never the day's own verdict.
    - **What each viewer may see.** The status line after a run is one day sentence for every viewer, of what their
      policy lets them see: the day's head where its story is theirs to read, else what became of the day ("Thu Sep
      21: paused · readers see Wed 20 · waits on Owner"); the run's figures sit in its title, a node closed to the
      viewer neither counted nor named, and what a hold says only to someone who reads all of its node. An output of a
      held day never vouches for its staged rows in green: above them it says what its load lacked, from the story
      where the viewer may read it, else from the flow's verdict naming no source, value or figure ("Built from a
      short load"), and someone who may not decide gets "What readers get ›", read only (nothing of the trips when
      they are closed to them). The loads strip draws and says a day's trips only to someone the trips are open to.
    - **Days not run.** A day before the one on screen that this visit didn't run, its fate not in the record, is drawn
      not run: a dashed outline, its band and no count, no mark, and a key ("not run"); in the day after an episode's
      strip too, never as published with something wrong. The day readers see carries its age once it is two days or
      more before the day held ("readers see Mon 18 · 3 days old").
    - **The cause card** keeps its head and its visual. Its pause row says, while the day waits, what paused it, only
      as far as the viewer may see it ("Paused by trips", "Paused by trips, checks"), what readers see meanwhile
      ("readers see Wed 20"), and the outputs that wait by name, each a hatched box ("zone_hour · borough_hour ·
      weather_effect"); its one verb is **Decide**, under it, before the health cells and the checks, so they are on the
      first screen; "Tell the source" moves behind ⋯. Someone who may not decide sees who does in the verb's place
      ("Owner decides"). The day's mark sits by its date and on its News tab too. On a paused card the checks are drawn
      in full only when they held the day too, under their ‖ (the row has named them), headed "Checks held" every day
      they hold, waiting too (ADR 0008 amendment 1); checks that passed, near their
      limit or not, are one line, "Checks passed: 9.55% dropped", a tap from their sheet, never a second problem nor a
      contradiction of the pause. For the budget, a paused card leaves out the health cells' head (as does the day after
      an episode while a day of it waits) and the kinds under its rows of changes, and readers' day goes without its age there (the day line, the staged bar and the list carry it).
      A tap on the row lists the waiting outputs, the day's other outputs as up to date (the held run made the versions
      readers have: Thu Sep 21's zone_list, districts and weather_hourly), and then "What readers get ›" opens the
      decision sheet read only: its rows greyed, whom it waits on at its top, and no button. Once decided, the row
      becomes the receipt, the day's mark before it ("⚑ Published as is · Owner · 09:40", "✕ Not published · under
      Fri's decision", "✕ Not published until a day passes"), with the day readers keep ("readers keep Wed 20") and the
      outputs, and the story's verbs stay behind a labelled ⋯ ("More") at the end of the row, never alone in an empty
      row. While a day waits, "Mark as expected (optional)" is not among them (it would read as approving the day, and publishes
      nothing), and ⋯ holds only what the viewer may do (exporting the record is the owner's). A detail opened from a
      paused card leads with Decide too, the story's own verb ("Tell the source", "Open an incident") beside it.
    - **The day after an episode** says what became of its days, the day on screen first once it published: "Mon 25
      published · ‖ Thu–Sat still wait" with **Decide** (on the canvas too) while one waits, else "Mon 25 published · ⚑ Thu
      as is · ✕ Fri–Sun unpublished", each mark beside the days it marks, so the line keys the strip above it; its chip names the episode's days from the hour its first fell ("after Thu 13:00–Sun"),
      never what its last day was. A day held keeps its marks (! ‖, ! ⚑, ! ✕) in every later strip of days.
    - **The episode's chip** draws its days as a calendar page, the viewed day dark (never a battery, never ‖), and
      counts the trips short so far ("Day 3 · ~290k short", as its hours count them; a part that vanished counts each
      day whole, as its amount line does). It opens the episode's sheet: one bar a day so far, each day's marks, the
      trips short so far a segment a day, and Decide for each day still waiting. The episodes to pick from carry the mark
      of their worst day, never one by their place.
    - **The decision sheet** draws each option as what readers would get, all on one scale. The cause picks the
      drawing, as it picks the hero: 24 hour bars for a day that falls at an hour, the part bar for a split, a strip of
      days for an amount. Another day's rows are hatched (ADR 0008 §10), and absent ones dashed.
      - Each option is one row: its mark (publish, an arrow out of a tray; the day readers keep, the hatched swatch its
        rows are drawn in), at most four words ("Publish as is", "Keep Wed 20"), the drawing and what it shows, with its
        unit: the trips as they arrived ("41,939 trips"), as the card and the Runs view count them, so the number and
        the drawing are one count. Under the day's own, the trips that reach the outputs, past the checks ("37,935 after
        checks"); under a day kept that is stale, its age ("3 days old"). The drawing says what it lacks in its own wash
        ("~77k fewer") and marks the hour the day fell on its row ("13h"), so the wash can't read as what goes out.
      - When the checks held the day too, the Publish row says what publishing overrides ("Overrides checks: 46% dropped
        (limit 10%)") and the button names it ("Publish over the checks · 3 outputs").
      - Only the options the cause allows appear.
      - Picking an option shows the reasons that fit it under "Why?" ("Why? (needed)" for Publish as is: Real change,
        Source confirmed; Known outage, Re-send expected for not publishing), one tap each; the scope only under Don't
        publish ("Just Thu 21", "Until a later day passes"), and not once readers see a later day (one has passed: the
        decision would stand already ended). What is under each number shows on the row picked.
      - Its head says since when the day has waited, by the clock it was held at that day ("Paused since 10:31"), never
        "Waiting <1 min".
      - The button says what is missing while it can't go ("Pick an option", "Pick a reason"), then names the result in
        the primary fill ("Publish as is · 3 outputs", "Don't publish from Thu 21"); the hash of what goes out is its
        title and is in the receipt.
      - Once decided, the sheet collapses to a receipt: the option's drawing, what readers now see ("Published as is ·
        readers now see Thu 21"; "Not published · readers keep Wed 20 until a day passes"), the outputs released, who,
        when and the record's entry, the manifest, and "Change decision ›" for a day not published (one published as is
        can't be taken back). The canvas's day line shows the same receipt, and the sheet's head takes the day's mark.
      - Someone who may not decide sees it read only: at its top what readers see until whoever decides does ("Readers
        see Sat 12 until Owner decides") and "Ask ›", a note to send or copy; the rows greyed, no reasons, no scope, no
        button.
      - At most 45 words at once, whatever is picked (decision.ts sheetShown, sheetWords), and the paused card within its
        60, in every state, on all 28 days `wrong` holds (src/core/decision.ts gives every word;
        test/story-real.test.ts counts them).
    - **The record of decisions.** The Runs view opens, after one sentence, on a ribbon of paused days with their marks.
      Tapping a day opens its hold, decision and release, naming the run released and the release's entry ("Released
      run #13 · record #21"), with the hashes and the record entry one tap further. A run is named by the record entry
      that recorded it ("Run #13"), a number that keeps rising across visits where the engine's start again at 1. Of a
      held day's runs only the one that stands for it carries what became of it ("published as is · decision #20");
      one before it says "held, replaced by run #19", one after "same as run #19"; runs that built nothing and only
      repeat another fold into one line ("Runs #20–#22 · same as run #19, nothing built"), a tap opens them, and each
      run's files, manifest and checks are a tap away, listing only the files that changed since the run before. A
      release's line counts the outputs whose version it changed, as the button did; the same decision applied again in
      a new engine says so ("Applied decision #20 again in a new engine"); a day closed under a standing decision is
      that decision's rule at work ("Sat Sep 23 not published, by #26's rule", its actor "rule #26 (Owner)"); and the
      day that published after held days says what readers now see ("Mon Sep 25 passed: published; readers now see Mon
      25 · ends #26"). These are words for the record's existing entries: no entry kind or field changes. A day held
      again, or run again with nothing waiting, is a routine line, marked with what became of its day.
    - **Status words say the state.** A day not published that a later day has passed since says so in its own views,
      as it stood then and naming no later day (ADR 0008 §10): "Not published · readers kept Thu 21", never "Staged … ·
      readers see Tue 26" nor "superseded by Tue 26"; one that still waits, "Thu 21 built, not published · readers kept
      Mon 18" over its Decide, and its row, day line, cards and status line "readers kept Mon 18" (days.readersOf),
      never "Not published" before anyone decided; the checks' sheet says the steps
      after them were "built, not published" under a flow that holds, and which day the outputs keep ("Outputs keep Mon
      18"); a source file matched to the data's list is "Sealed: this file matches the source's list", not "the bytes
      published".
    - **ADR 0008 changes:**
      - §6's "Nothing to do · held" and "Outputs not published" become "waiting" until someone decides.
      - §10's "outputs keep the last day that passed" becomes the last day published.
      - A held day now has its own rows, staged. Every view reads the viewed day's own run, published or staged, and a
        staged one sits under a full-width hatched bar ("Thu 21 built, not published · readers see Wed 20"). Falling back to an
        earlier day stays only for a refused file.

## Encodings

Unchanged: `key/0`, `flow/1`, `dataset/0`, `run/1`, `log/1`, `checkpoint/0`, `edit/0`, `policies/0`, `ontology/0`. No
key changes and nothing is rebuilt. A held run's manifest is an ordinary run/1 manifest.

- **E10 plan/1** (Q-47 asks whether it stays a format of its own). A plan with a `publish` block is `smaltflPlan: 1`,
  hashed as `SHA-256(UTF-8("smaltfl/plan/1\n" + JCS(plan)))`.
  - Its `publish` is `{ hold, watch, period, together }`: `hold` is sorted; `watch` is `[[node, file], …]` sorted by
    node; `period` is a parameter's name or null; `together` is a boolean.
  - A plan without a `publish` block stays plan/0 byte for byte, so every existing plan hash holds. An older plugin
    refuses format 1 rather than publish what it would hold.
  - Test vectors (test/plan.test.ts), each a plan as `translate` makes it, before the runtime types it:
    - The document `{"smaltfl":2,"id":"v","name":"V","parameters":[{"name":"day","type":"text","default":null}],
      "sources":[{"id":"trips","table":"trips_file"}],"steps":[{"id":"trips_valid","kind":"expectations",
      "inputs":["trips"],"rules":[{"name":"fare","check":"fare_amount >= 0","onFail":"drop"}],"maxDropped":0.1,
      "dataset":{}}],"publish":{"hold":["wrong","checks"],"watch":{"trips":"history.json"},"period":"day"}}` with
      `day` = `2023-09-21` has the flow hash `5dfc2a9c…` and the plan `…,"publish":{"hold":["checks","wrong"],
      "period":"day","together":true,"watch":[[0,"history.json"]]},"smaltflPlan":1}`, whose plan/1 hash is
      `fc700fdf9d4dd95e71ee083cfee0ddca2ba46dd122b7a840e182234611668fd4`. The same document at format 1 without the
      block is plan/0 `32609b0f1de25bc72ea09219c0c38cd2cff347619e2db5c8506a7da144720f8e`.
    - The example as this ADR found it (format 1, no `day` parameter), with its defaults: plan/0
      `292c423f3a56ab26bd853af571c23cf2c1d5e775c882da06cf9725e0b91d1947`, the hash it had before plan/1 existed.
    - The example with a `day` parameter and the block of §2, for `2023-09` and `2023-09-21`: plan/1
      `ccbc4d7bee92ae2e153ab8a345e6a3d807e201193ab9dade82a48362dc3cd8c8`. Every node key is the same as without the
      block.
- Document format 2 is not a new hash: flow/1 hashes the document as before.
- New store tables, not hashed: `_smaltfl_holds(run, holds, claims)`, a row for every run of a plan with a `publish`
  block (holds `[]` when it published), its `claims` the watched sources as the run judged them, so verify can judge
  them again; and `_smaltfl_releases(id, run, manifest, names, option, actor, reason, decision, outcome, why, at)`,
  `names` the outputs with their keys and `why` a refusal's reason. `_smaltfl_datasets` is unchanged, so no migration
  is needed.

## Consequences

- A day that is off no longer reaches readers on its own. On the history, the 28 days that `wrong` holds wait for a
  person.
  8 of them are real changes that someone will publish as is: 4 false holds a year, at the 2022–2023 rate.
- A held day is evidence instead of an error string. Its manifest, staged rows and checks can be looked at, verified
  and exported before anyone decides.
- Readers can go stale while a day waits. "As of" is shown wherever published rows are, and without a server there is
  no push.
- Decisions live in one browser's record, like everything else, until there is a server. Two people can decide
  differently.
- Staged versions are kept while their day waits. Retention (Q-33), when it comes, must keep them.
- Left for later, each with its own decision:
  - holds measured in the engine against a pinned reference built from the history (a new file format, with
    vectors), and, where there is no history, against a flow's own released runs;
  - re-running a corrected file;
  - a refused file as a pause with no run behind it (fetch again, re-run when corrected, don't publish), and an owner's
    acceptance of a file (ADR 0006);
  - outputs that accumulate, partitioned by day, so that a skipped day is an explicit empty one and a late decision can
    still publish into its place;
  - filling at an aggregate (scaled to the usual, or between neighbouring days);
  - a durable engine, and replaying the record when the app opens;
  - timeouts, counted in loads;
  - notifications;
  - decisions by more than one person.

## Open questions

For the maintainers, each recorded in docs/OPEN_QUESTIONS.md:

- **Q-46** (answered by the owner, 2026-11-08: "if something is off then let's not publish the data") The default
  hold is `wrong`, every day the story says something wrong (28 in two years); a flow may narrow it to `short`.
- **Q-47** plan/1 and document format 2, or optional fields under plan/0 and format 1? Optional fields fail open on an
  older build.
- **Q-48** (answered by the owner, 2026-11-08: "impute the data if it's bad until it's good, just don't publish a
  change, then forward or backfill") Both: filling the missing part from the days before (forward) and after
  (backfill), §6, and re-running a corrected file.
- **Q-49** (answered by the owner, 2026-11-08: "Marked in the data. We should always be able to get back to what was
  true, what was used later if anything, and we should be able to update what was used if we get better info later";
  on the donor, "You need to offer both") Filled rows may be published, marked by a column on every row and counted on
  the release, and a fill can be replaced (amendment 1 S1, S7); both donor rules, chosen per flow (S3). Whether
  filled and unpublished days feed later days' ranges is the maintainers' Q-59 (default: they don't; a day published
  as is, or accepted, does).
- **Q-50** (answered by the owner, 2026-11-08: "Owner, and if the owner wants they can delegate to people as a role")
  The owner decides by default, and may delegate deciding to a role with a `smaltfl:decide` rule and its `may` list
  (amendment 1 S8).
- **Q-51** Should a passing run of a day earlier than the one published move the names back, as it does now, or stay
  behind, as a release must?
- **Q-52** Should the verdict's rule be frozen as a versioned copy, or tied to the build with the history test as its
  vector (as proposed)?

## Amendment 1: Filling a paused day (slice 2)

- **Status:** proposed, 2026-11-08. It records the owner's answers to Q-49 and Q-50, the parts of their second set
  that bear on a paused day (deliberate changes, security data, rare bad values), and their third set's answers to
  Q-57, Q-60 to Q-64 and Q-67. The maintainers' questions it raises (Q-65, Q-68 to Q-80) are open, each with the
  default the build starts on (docs/OPEN_QUESTIONS.md).
- **Amends:** §6 (the options), §7 (remedies), §8 (who decides), §9 (the record), §10 (decisions outlive the engine),
  §11 (verify and the audit), §12 (on screen) and "Left for later".
- **Works with:** [ADR 0010](0010-any-dataset.md) (any dataset), designed and built alongside. ADR 0010 owns how normal
  is learned: the calendar, the pattern, what an accepted level does to normal, bad values in the ontology, several
  watched sources. This amendment uses those. The contracts between the two (C1 to C10) are written into the sections
  they touch, and listed once in "Where the two lanes meet".
- **Encodings:** none new.

**Why an amendment, not a new ADR.** This ADR already decided the options and their slices (§6's table has a Slice
column), the mechanism (§7: remedies are derived documents) and the questions this answers (Q-49 and Q-50 are its
own). Slice 2 fills in what it left open. A separate ADR would make readers join three documents to follow one
decision sheet, and it changes no encoding. If the maintainers would rather leave ADR 0009 as it was accepted, this
text moves unchanged to ADR 0011, keeping its section numbers, S1 to S13 (Q-76).

### Context

The owner, on Q-49: "Marked in the data. We should always be able to get back to what was true, what was used later
if anything, and we should be able to update what was used if we get better info later." On the donor: "You need to
offer both. Sometimes day will matter like taxi data set, sometimes it won't like for security issues I deal with up
at work." On Q-50: "Owner, and if the owner wants they can delegate to people as a role." On the data branch: "Yes you
can rebuild." In their second set: both pieces in parallel (this and ADR 0010); security data comes as many files a
day, some several times a day; rare but serious values always alert, and a surge in one is never "OK this day";
deliberate changes pause until someone picks "Accept the new level", which publishes the day and re-learns normal from
it.

In their third set (the question prompt, 2026-11-08; docs/OPEN_QUESTIONS.md has each in full):
- **Q-60:** a day published with only the part that arrived says so in the release and on screen ("before 13:00
  only"); the data gets no extra column.
- **Q-61:** a published fill may be withdrawn: "Someone may take it back; readers see the previous day again." The
  designs had proposed "only replace"; this amendment follows the owner (S5).
- **Q-62:** a corrected file, or the real day, that passes replaces the fill on its own; the swap is recorded, and the
  fill stays one tap away.
- **Q-63:** the data branch keeps its history (done: `data.yml` adds a commit on top of the last, 0d41719).
- **Q-64:** one fill decision covers the following days until a day passes, each filled from its own good day.
- **Q-67:** where only part of a day arrived and that part fails the checks, "publish only that part" is still offered,
  marked "fails its checks".
- **Q-57:** the owner may accept a new level, and a role only if "accept" is listed for it; one acceptance covers the
  following days while the numbers stay at the new level.

The generality audit (wf_01597c7b-705) found that nothing of the fills is built (no `repairDocument`, no donor code).
On 2023's taxi days, a day's count filled from the same weekday a week before was a median 5.1% off, against 6.7% from
the day before. For a share it was 0.80 points against 0.78. It ranked three items for this slice: the donor rule per
flow (7), filled rows marked and replaceable (8), and "accept the new level" (16).

Measured for this amendment on the history (2022-01-01 to 2024-01-31, the flow's verdict, held under `wrong`):

- **17 of the 28 held days have a missing part on a short day.**
  - 3 are told by their hours: Jan 29, 2022 (a gap, 06:00–16:00), Sep 17, 2022 (from 15:00) and Sep 21, 2023 (from
    13:00).
  - 5 have one part that held while the rest vanished: Jan 4, 2022, Sep 18, 2022 and Sep 22–24, 2023.
  - 9 have a part that vanished: Aug 10, 2022 (Vendor 1, 85% short), Nov 14–20, 2022 (Vendor 1) and Dec 22, 2022 ($0.50
    extras).
- **On the 14 of these that are feed incidents, filling from the same weekday before lands closest.** (Jan 4, Jan 29
  and Dec 22, 2022 are left out: they are real changes.) Here is how far each filled day's trips land from the day's
  guess:

  | Donor | Median off | Within the day's range |
  |---|---|---|
  | Same weekday before | 2.2% | 12 of 14 |
  | Nearest good day before | 5.6% | 12 of 14 |
  | Nearest good day after | 5.3% | 13 of 14 |

  Over all 17 days the medians are 2.4%, 5.7% and 6.3%.
- **The other 11 days have nothing to fill.**
  - Jan 5–9, 2022 are an amount.
  - Nov 8 and Dec 19–21, 2022 and Nov 7, 2023 have a code that vanished or surged while the day's trips stayed in
    their range.
  - Nov 14, 2023 is a share.

  A fill there would add rows that weren't missing. Dec 19, 2022, filled with Dec 12's $0.50 extras, would have
  129,977 trips: 22% over its guess, and above its range. Once the example moves to the general form (ADR 0010 §13,
  Q-54), Nov 8, 2022, Nov 7, 2023 and Nov 14, 2023 no longer hold: 25 held days, 17 with something to fill and 8
  without.
- **A holiday is a poor donor.**
  - Fri Nov 18, 2022, filled from Fri Nov 11 (Veterans Day), lands 4.7% under its guess. Filled from Fri Nov 4, it
    lands 0.8% under.
  - Thu Nov 17's same weekday after is Thanksgiving: 16.8% under, against 3.1% from Thu Dec 1.
- **A fill takes the whole missing part from one day.** It sets aside what arrived of that part: the 3,679 trips after
  13:00 on Sep 21, 2023 (the trickle), 5,197 of Vendor 1's on Aug 10, 2022, and 2 to 222 a day on Nov 14–20, 2022.

### S1. A flow that may be filled says so, and its rows carry the mark every day

- **A new step kind, `fill`, one for each watched source that may be filled.** It reads the source directly, and
  whatever read the source reads it instead. As people write it:

  ```jsonc
  { "id": "trips_filled", "kind": "fill", "inputs": ["trips"],
    "time": "tpep_pickup_datetime",                             // the column an hours cause's hours are of
    "shift": ["tpep_pickup_datetime", "tpep_dropoff_datetime"] } // the columns a donor's rows are moved by whole days
  ```

  On a day nothing fills, it passes the source's rows through and adds one column, `filled_from`. On a filled day, the
  derived document (S4) gives it `missing`, `from` and the donor as a second input.
  - Its `time` must equal its source's watch `time` when the watch names one (ADR 0010 §10), and its hours are counted
    in the watch's `zone`, as the measures count parts (C8).
- **The mark: `filled_from`.** On a row that came from another day, it holds that day (the donor's period value,
  `"2023-09-14"`). On a row that arrived, it is null.
  - Every output the fill step reaches must carry `filled_from`. The runtime checks this when it types the plan, and
    refuses a run that doesn't, naming the output ("weather_effect reads trips_filled and doesn't carry
    filled_from"). Refusing, rather than running with the output named "not marked", is the default (Q-65): the owner
    asked for the mark in the data.
  - An aggregate carries the column as `max(filled_from)`, and may count what it holds of another day as
    `count(filled_from) AS filled`. An aggregate over an aggregate carries both on (`max`, `sum`).
  - The columns are there every day, so a reader's query runs the same on a normal day and a filled one.
    `filled_from IS NULL` keeps only what arrived, or, in an aggregate, the groups with nothing filled.
  - The release counts the rows filled (S10).
- **What stays as it was.**
  - The checks count the source's own rows. `countedChecks` and the history builder (`scripts/data/history.ts`) read
    through a fill step that fills nothing, with `sourceOf(doc, id)` (document.ts, C7).
  - A box put after a watched source (a suggested check) goes after its fill step (`insertAfter`).
  - Adding a fill step changes every key downstream of the source, once. On the example these are trips_valid through
    weather_effect; zone_list, districts and weather_hourly keep theirs. Filling a day changes no other key.
- **Three new settings (S5): `donor`, `meanwhile` and `until`** (C1).
  - `donor`: `"weekday"` or `"nearest"`, the flow's own donor rule (S3).
  - `meanwhile`: `"last"` (the default), `"fill"` or `"complete"`, what readers get while a day waits.
  - `until`: `"decision"` (the default) or `"normal"`, whether a person must close the pause.
  - **In format 2 (plan/1)** all three are fields of the `publish` block, in the plan only when the document sets them,
    so every plan/0 and plan/1 hash holds.
  - **In format 3 (plan/2, ADR 0010 §10–§11)** `donor` is a field of the watch, beside `pattern`, and plan/2 fills it
    in from the pattern; `meanwhile` and `until` stay in `publish`, filled in with their defaults.
- **Older builds refuse all of it, by name:** the step kind, the plan op and the new fields (see Encodings).

### S2. The missing part comes from the story's cause, and only on a short day

The flow's verdict (`flowStory`, raw names) names it, so it is the flow's, not a viewer's:

| The day's cause | Missing part |
|---|---|
| Hours (a fall to the day's end, a gap, a late start) | Those hours, by the fill step's `time`: `{ "time": "tpep_pickup_datetime", "hours": [13, 23] }` |
| A split whose part vanished | That part: `{ "column": "VendorID", "value": 1 }` |
| A split whose part held while the rest vanished | The rest: `{ "column": "payment_type", "value": 0, "rest": true }` |
| An amount, a share, a level, a surge, a refused file, a source not judged, a day not judged yet, the checks alone | None |

- **Only on a day whose rows are below their range** (the claim's `below`). Where they aren't, the part's rows weren't
  missing. They were coded another way (Dec 19–21, 2022's fare change), and a fill would count them twice.
- **When the cause has no missing part,** neither a fill nor the complete part is offered. A day not judged yet
  (ADR 0010 §1, `unlearned`) holds only when the flow lists `unlearned` in `hold`, and then offers neither a fill nor
  Accept: nothing is known to be missing.
- **Only one source at a time.** When two or more watched sources hold the same day, neither is offered in this slice:
  each would need its own drawing. Several sources, and fills per load, are ADR 0010 §7's: a fill decision names its
  load, and fills stay off when two loads of the same slot hold.

### S3. The donor: chosen from the data alone, offered three ways, the flow's way first

- **Rules and directions.**
  - Two rules: the same weekday (7, 14, 21 or 28 days away), or the nearest day (1 to 28 days away).
  - Two directions: before (a forward fill) and after (a backfill).
  - The sheet offers the same weekday before, the nearest good day before and the nearest good day after. The flow's
    rule, before, comes first and is picked. The same weekday after is offered too when its file is in the data's
    list. In the app's data that happens only for Mon Nov 14, 2022, where it is Mon 21, also the nearest day after.
  - **The flow's rule** is `donor` (S1). Without it, the rule comes from ADR 0010's pattern: weekly gives the same
    weekday, none and monthly the nearest day (ADR 0010 §3). Until ADR 0010's patterns are built, it is the same
    weekday.
- **A good day** must be all of these:
  - within four weeks of the held day;
  - judged, with the flow's verdict saying nothing wrong of it (not wrong, not refused). A day not judged yet
    (`unlearned`, ADR 0010 §1) isn't a donor;
  - not a day the flow's calendar marks special, unless the held day is one too (measured: Nov 18, 2022). The days come
    from the flow's calendar, `isSpecial(day, cal)` (ADR 0010 §2); until it is built, from `calendar.ts` as it is;
  - in the data's list (`loads`, or the donors), checked against its sha256 and size like any file (ADR 0006 §2), with
    the held day's columns and types;
  - for a backfill, a day whose file has arrived and been judged.
- **Pinned.**
  - The page pins the donor's file in the engine, and the derived document reads it through an external table over it,
    as ADR 0006 §3 requires of a source. Until loads.json format 2, that is `trips_file_donor` over
    `trips_donor.parquet`; from format 2, the donor's table is made from its source's binding (ADR 0010 §9, C8).
  - The run records the file the engine opened (location, sha256, bytes), as it does for every source.
- **Evidenced, as a watched source is.**
  - The page passes a claim for the donor's day (`dayClaim`, from the same pinned history).
  - The plugin judges it with the one check every claim goes through (`judgeClaim`, C4): it must name the fill node's
    `from`, come from the history file pinned under the source's watch, and count the donor snapshot's rows. Under
    plan/2 it is claim/2: the base plus the tail, and `measured` of the donor's snapshot (ADR 0010 §6).
  - Its state must be neither wrong nor refused. A donor that isn't judged good holds the derived run by `donor`, and
    no fill is released from it.
- **When no day qualifies.**
  - Before: the fill row is drawn off, with "No good day near".
  - After, while one may still come (a live feed): the decision can be taken now, and it waits ("Fills from the first
    good day after · waits"). It is released when such a day arrives and is judged good. If four weeks pass with none,
    the decision stands, unapplied, the day keeps waiting, and the receipt says so.
  - A standing fill with no donor (`meanwhile: "fill"`, or "until a day passes") leaves readers on the last day
    published and the day waiting.
  - A day is never published unfilled because its donor is missing.
- **In the app's data** (each day's donors in order: same weekday before, nearest before, nearest after; % = filled
  trips against the day's guess):

  | Held day | Same weekday before | Nearest before | Nearest after |
  |---|---|---|---|
  | Thu Sep 21, 2023 (hours from 13:00) | Thu 14, +2.1% | Wed 20, −7.2% | Mon 25, −17.9% |
  | Fri Sep 22, 2023 (only Flex Fare arrived) | Fri 15, +1.4% | Wed 20, −5.3% | Mon 25, −19.7% |
  | Sat Sep 23, 2023 | Sat 16, +2.5% | Wed 20, +0.8% | Mon 25, −14.3% |
  | Sun Sep 24, 2023 | Sun 17, +4.4% | Wed 20, +20.8% | Mon 25, +2.4% |
  | Sat Sep 17, 2022 (hours from 15:00) | Sat 10, +16.6% | Fri 16, +20.3% | Mon 19, +9.8% |
  | Sun Sep 18, 2022 (only payment type 0 arrived) | Sun 11, +14.8% | Fri 16, +42.5% | Mon 19, +21.2% |
  | Mon Nov 14, 2022 (Vendor 1 sent almost nothing) | Mon 7, −1.3% | Sun 13, −2.2% | Mon 21, −1.5% |
  | Tue Nov 15 | Tue 1, +1.8% (Nov 8 was off) | Sun 13, −0.6% | Mon 21, +0.1% |
  | Wed Nov 16 | Wed 9, −1.8% | Sun 13, −5.4% | Mon 21, −4.8% |
  | Thu Nov 17 | Thu 10, −2.4% | Sun 13, −6.9% | Mon 21, −6.3% |
  | Fri Nov 18 | Fri 4, −0.8% (Nov 11 is Veterans Day) | Sun 13, −5.7% | Mon 21, −5.1% |
  | Sat Nov 19 | Sat 12, −3.1% | Sun 13, −6.1% | Mon 21, −5.5% |
  | Sun Nov 20 | Sun 13, +1.3% (both rules) | | Mon 21, +2.1% |

  Sep 17, 2022 lands above its range whichever donor fills it: the hours before its fall ran about 8.3k above usual
  (ADR 0008 §6), and the fill adds a full evening to them. When the example moves to the general form (Q-54), no pick
  moves: Tue Nov 15 keeps Tue 1, since Nov 8 becomes a calendar day.

### S4. Remedies are derived documents, run held and released

- **`repairDocument(doc, repair)`** (core, pure).
  - A fill sets the fill step's `missing` and `from`, adds the donor source, and adds that source to the step's inputs.
  - The complete part sets `missing` and `from: null`, and keeps only the rows outside the missing part.
  - Nothing else changes, so anyone can rebuild the derived document from the flow and the decision (§7).
  - It replaces §7's hand-made `sql` step: only emit.ts knows the engine's language, so the document says *what* (a
    fill, its missing part, its donor) and emit.ts says how.
  - A derived document keeps its original's document format, and its plan the original's plan format.
- **How emit.ts writes it.** The arrived rows outside the missing part, plus the donor's rows inside it, with
  `filled_from` set to the donor's day.
  - The donor's `shift` columns move by whole days. For a time stored as text, only its date changes and the rest of
    the text stays as it was, so local times keep their hour.
  - The donor's columns are taken by name, with the arrived source's types. A donor whose columns differ is refused.
  - The complete part keeps only the arrived rows outside the missing part.
- **The derived run.**
  - The run option `stage` holds every output whatever else holds, its versions staged as any held run's are, and
    `from: { run, manifest }` names the held run it repairs (C4). A page may add a hold; it can't take one away.
  - The record keeps it as a run with the outcome `derived`, and its hold as `{ by: 'derived' }` (Q-71). "Staged"
    already names every held run's versions ("Thu 21 built, not published" on screen), so it isn't a second name for
    this run.
  - Its watched source is the held run's snapshot, and its claim is the held run's claim, judged against `from` (C4,
    Q-69). Under plan/1 that is the same claim: the day, the history, and the rows of the same snapshot. Under claim/2
    the claim's `flow` is `from`'s flow hash, its `measured` the measures stored for `from`, and the snapshot has
    `from`'s content hash. So the day is still held by its story, never as "not judged", and its release isn't refused
    for it.
  - Its checks count the filled rows. A filled day whose checks trip isn't released ("the filled day fails its checks:
    12% dropped (limit 10%)").
- **Keys.** Its nodes from the fill step down have new keys, so filled versions never share a key with real ones. The
  zones and the weather reuse theirs.
- **The sheet draws first, the engine confirms.**
  - The sheet draws each option at once from the history's counts.
  - The derived run is made when an option is picked, and gives the rows past the checks and the hash of what goes out
    (the button's title, then the receipt's).
  - The drawing's count and the derived run's are the same number (tested).

### S5. The options, and which a day gets

§6's table becomes:

| Mark | Option | Readers get | Offered when |
|---|---|---|---|
| ‖ | **Wait** (the default) | the last published version | always |
| ⚑ | **Publish as is** | the held run's versions | always (one day; a reason is needed) |
| ✕ | **Keep Wed 20** (don't publish) | the last published version; the day is never published | always; for a day whose fill readers have, it withdraws the fill |
| ◧ | **Fill from Thu 14** | the arrived rows outside the missing part, and the donor's missing part, marked | the source has a fill step, the day has a missing part (S2), and a good donor (S3) |
| ◐ | **Before 13:00 only**, **Without Vendor 1**, **Flex Fare only** | the arrived rows outside the missing part | the source has a fill step and the day has a missing part; marked "fails its checks" when that part does (Q-67) |
| ⚑ | **Accept the new level** | the held run's versions, and normal learned from this day on | S6 |
| ↻ | **Re-run when corrected** | slice 3 | |

- **On the history** (with the fills' list of causes for Accept):
  - A fill and the complete part are offered on 17 of the 28 held days, Accept on 20, and both on 9 (a part that
    vanished on a short day: Aug 10, Nov 14–20 and Dec 22, 2022).
  - Accept isn't offered on Jan 29, 2022, Sep 17, 2022 and Sep 21, 2023 (hours), nor on Jan 4, 2022, Sep 18, 2022 and
    Sep 22–24, 2023 (a part held while the rest vanished). Those 8 get the fill and the complete part only.
  - The other 11 get Accept but no fill and no complete part: the amount days, the codes that came and went, and the
    share.
  - Once the example moves (Q-54): 25 held days, a fill on 17, Accept on 17, both on 9.
- **A part that fails its checks (Q-67).** On Sep 18, 2022 and Sep 22–24, 2023 the part that arrived fails the checks
  (the checks held those days, and that part is almost all of their rows). The complete part is still offered there,
  marked "fails its checks", and its derived run can't be released.
- **Scope.**
  - A fill or a complete part may stand until a day passes, as Don't publish may (the owner, Q-64). Nov 14–20 is then
    one decision, each day with its own donor, by the same rule and direction.
  - Publish as is covers one day. Accept stands for later days while the level holds (S6).
- **Reasons.**
  - A fill or a complete part needs none: the day's cause is its reason, and the record keeps the claim's head.
  - Accept needs one ("Planned change", "Source confirmed"), as Publish as is does.
  - Don't publish keeps its optional chips, without the "Why?" heading.
- **Standing settings.** §6 named them; they are defined here.
  - `meanwhile: "fill"`: while a day waits, readers get its fill by the flow's donor rule, before.
  - `meanwhile: "complete"`: readers get the complete part.
  - With no missing part or no good donor, either falls back to `"last"`. Their release cites the record's `flow`
    entry that set them.
  - `until: "normal"`: the pause closes itself when a later day publishes, and the day keeps what `meanwhile` gave it.
  - `until: "decision"`: a person still decides, and may replace or withdraw what readers got (S7).
  - The owner's "impute the data if it's bad until it's good" is `"meanwhile": "fill", "until": "normal"`.
- **Withdrawing a fill (the owner, Q-61: "May withdraw it").** Once readers have a day's fill or complete part, someone
  who may take Don't publish may take it back.
  - It is a Don't publish decision that `amends` the fill's decision, recorded like any decision, and a release that
    points each name back to the version it showed before the fill was released: readers see the day before again.
  - A withdrawal that a standing fill covered ends its standing: later days wait for a person.
  - With a later day current, names aren't moved back past it (a release never is, §5): the withdrawal is recorded,
    the day becomes ✕ in the record and on screen, and readers keep the later day.
  - The withdrawn fill stays a version of its day (S7). A new decision may apply it again.
  - Publish as is still can't be taken back (§12); the owner was asked about fills only.
- **With a later day current,** the fill and the complete part are off, as Publish as is is ("Mon 25 is published"),
  until outputs keep their days.

### S6. Accept the new level

Accept is described here once; ADR 0010 §5 says what a level does to normal (Q-76).

- **What it does.** It publishes the held run as is (a release with the option `accept` and a reason), and records a
  *level* in its decide entry:

  ```jsonc
  "level": { "source": "trips", "from": "2022-11-14", "metrics": ["count:VendorID=1", "value:VendorID=1"] }
  ```

  `metrics` are the ones the cause moved, as `metricKey` names them: `trips` for an amount; the part's count and share
  for a split; the finding's own metric for a share, a level, or a new value that stayed.
- **Where it is kept: the record and the claims, never the document (C6, Q-68).**
  - `levelsOf(entries)` reads the levels from the record. Each claim names those that apply to its source (`levels`,
    claim/2), and `NormalRanges` takes `breaks` from them, so the audit can tell the verdict again.
  - The flow doesn't change: there is no `flow` entry for an Accept and no `normal.breaks` block. So no flow hash
    changes, and §10's finding of a decision by its inputs is unchanged. (The design's break in the document, and its
    matching of decisions by files and keys whatever the flow hash, are dropped.)
- **What it does to normal (ADR 0010 §5).** The flow's verdict learns those metrics from that day on: the expected
  value from the days since, the width borrowed from before, and last year's guess never straddling the level's start.
  - The days after are judged against the new level at once, never "not judged yet" for want of days. A lasting step
    no longer holds its first three weeks (the audit's +60%: 22 of its first 23 days).
  - The automatic re-learning after 14 days (ADR 0010 §5) never applies to a metric whose change held a day that
    wasn't accepted (X7, Q-74): the owner asked that deliberate changes pause until accepted.
- **How long it stands (the owner, Q-57b: "Covers later days").** For the source's later days, while the same metrics
  stay at the new level and nothing else is off. A later day held only because the band hasn't learned the level yet
  publishes under it, as a release that cites the Accept ("by #31's new level"). It is never undone; a later level
  replaces it.
- **When it is offered (X6, Q-73).** The cause is a change in a learned range: an amount (the rows), a split whose part
  vanished or surged, a share or a level, or a new value that stayed. Never:
  - an hours cause (a gap is not a level);
  - a part that held while the rest vanished;
  - a value the ontology marks bad (ADR 0010 §4, the owner's "always alert");
  - a refused file, a source not judged, a day not judged yet, or the checks alone.
- **Who (the owner, Q-57a: "You + roles named for it").** The owner, and a role only if its rule's `may` lists
  `accept`. Delegating deciding doesn't include it: a rule without `may` allows every option but `accept` (S8).
- **When it is built.** Once, on both lanes' work (the fills' sheet and ADR 0010's breaks). Until then Accept isn't
  offered.
- **Phase 3 as built** (2026-11-09). Where the build settled what the text above leaves open, or differs from it:
  - **Offered** (`fill.ts` `acceptable`) when the story and its claim say something wrong, only the story holds the
    day, and the cause is the amount, a split whose part vanished or surged, or a finding of a level's kind (a volume,
    a share, a part gone, blanks, a shape, new values). Never an hours, refused-file or checks hero, a part that held, or
    a bad value. It is off ("Fri 18 is published") while a later day is current, as Publish as is is. On the history:
    Accept on 20 of the legacy form's 28 held days, and on 17 of the example's 25.
  - **Its metrics** (`levelMetrics`) are the cause's, as above, and also those of the findings it absorbed, those
    that follow from it, and anything else wrong or unusual on the day: the day as it came becomes what is usual. This
    goes further than "the ones the cause moved". On Mon Nov 14, 2022, Vendor 1's absence moves the extras' mix too, and
    with the cause's metrics alone Tue 15 paused again. The rows (`trips`) are named whenever the amount is outside
    its range.
  - **A later day publishes under it** (`hold.ts` `levelFor`) when only the story holds it, and every metric off on it
    is one the level names, off the same way as on the level's own day (`levelWays`, up or down). So Tue Nov 15, 2022
    publishes under Mon 14's level, and Mon Nov 21 (Vendor 1 back) pauses again. The page records it as a decide entry
    `accept`, with `under` the Accept's seq and the Accept's `level`, and releases it. Its receipt and day line say
    "By Mon’s new level" (not "by #31's new level"). An Accept amended by a later decision of its day stands no more,
    and the latest level that starts before a day is the one that stands.
  - **The record.** `levelsOf(entries, source)` reads the root Accepts (no `under`) whose release applied and that were
    never amended. The day's state is `accepted` (`dayState`; `pauseState` reads it as published). `skipOf` learns from
    an accepted day. `release.ts` publishes an Accept as Publish as is, with its reason, and refuses one on a derived
    run. The audit checks a root Accept (a reason, a level whose `from` is its day) and one under it (an earlier root
    Accept released, the same level, starting before the day, the day held by the story alone). `audit.mjs check
    --history` checks that each claim/2 names the levels the record accepted before it.
  - **Words.** The row: "Accept the new level", no number before a pick, "learns from Mon 14" under it once picked
    (with the as-is number); the reasons "Planned change" and "Source confirmed", one needed before the button,
    "Accept from Mon 14", is enabled. No scope switch: it stands by itself. Receipt: the level glyph, "New level from
    Mon 14 · readers now see Mon 14", "learns from Mon 14 · 3 outputs released · Owner · 09:40 · record #24". The day
    line: "⚑ New level from Mon 14"; the outputs: "Published as a new level"; the status sentence: "Mon Nov 14: new
    level from Mon 14".
  - **The step mark** (`viz.ts`, `g-level`): a line that runs level, steps up and runs on, with a dot where it steps,
    in the second ink (`--ink-2`), never a severity's colour. The fills' drawings for the row are picked by the cause, as S12 says.
  - **Five rows in 45 words.** With five options the drawing's axis drops its end tick, and the picked Accept row shows
    the as-is number. `sheetWords` checks every held day of the history with Accept among the offers.

### S7. A day's versions: what was true, what was used, what replaced it

- **A day's versions are its runs, by the period parameter, in the record's order,** per source and slot (ADR 0010 §7:
  a file of another slot is a new load; a second file of the same slot is a re-run, a version of that load). Each is
  kept, hashed and recorded.
  - The arrived run, held.
  - The derived runs that repair it (fills, complete parts).
  - Re-runs: a corrected file, or the real day arriving late.
- **What was true: the arrived run.** Its manifest names the file by the sha256 the list gives it, and the snapshot's
  content hash.
  - Its derived versions stay in the engine, never pointed, after a fill is released.
  - After a reload they are rebuilt from the file and the document, and checked against the recorded keys and
    contents (the Re-derived level).
  - The file stays fetchable by its data commit: the data branch keeps its history (Q-63).
- **What was used: every version a dataset name showed, and from when.** That is an `ok` run's entry, or a `release`
  entry, with its time. A withdrawal (S5) is a release too: from it on, the name shows the day before again.
- **Replacing what was used.** A replacement is a release, so it never moves a name back past a later day (the rule
  releases already keep, Q-51).
  - **A better donor:** another fill decision, amending the last.
  - **A corrected file, or the real day:** a re-run of the day. Of a day that already has a published version, a
    re-run that passes replaces the fill on its own, by a release under the flow's rule, and the swap is recorded (the
    owner, Q-62: "On its own"); the fill stays one tap away. One that is held again opens a pause, which says what
    readers have now ("readers see Thu 21 ◧"). Slice 3 builds it.
  - **The other remedy:** a fill for a complete part, or a complete part for a fill.
  - **Taking it back:** a withdrawal (S5).
  - **While a later day is current,** the replacement becomes the day's latest version in the record, not shown, until
    outputs keep their days (left for later).
- **What readers see.**
  - Each dataset name shows the version applied last.
  - Each row says where it came from (`filled_from`).
  - The app lists a day's versions ("Versions ›"), each opening its rows: from this engine, or rebuilt.
- **What audits see.**
  - The bag holds every version's manifest, plan and document (derived documents too) and the entries that decided
    and released them.
  - `audit.mjs check` follows the chain (S11).
- **`dayVersions(entries, day, period)`** (core) lists them, and is what the screens and the audit read.

### S8. Who decides (records Q-50 and Q-57a)

- **The owner by default.** The owner may delegate deciding to a role, with a `smaltfl:decide` rule:
  `{ "kind": "action", "action": "smaltfl:decide", "for": ["stewards"], "may": ["dont", "fill", "complete"] }`.
- **The options,** in this order (C2): `asis`, `dont`, `fill`, `complete` and `accept`. A rule without `may` allows
  every option but `accept`; `accept` needs a rule that lists it (Q-57a). This changes `checkDecision`, which today
  lets a rule without `may` take every option.
- **Withdrawing a fill** is `dont`.
- **A standing setting** was decided by whoever changed the flow to set it: its `flow` entry is the decision.
- **This stays a convenience, not a guard,** until principals are bound to identity cards (ADR 0006 §8).

### S9. The record

The kinds are unchanged (`run`, `decide`, `release`, `flow`), and log/1 is unchanged. These are new fields of `about`,
which is data (C10).

- **`run`, outcome `derived`.** What an `ok` run carries (run, manifest, plan, files), plus:
  - the day, its holds (with `derived`, and `donor` when it applies) and its keys;
  - `from: { run, manifest }`, the held run it repairs;
  - `repair`;
  - the derived document, kept with it as the flow document is.

  `pausesOf` opens no pause for it: it belongs to its held run's pause.
- **`decide`.** `option` may now also be `fill`, `complete` or `accept`. It adds:
  - `repair` (for a fill or a complete part):
    `{ kind, step, source, missing, donor: { rule, direction, day, file: { path, sha256, bytes }, claim } | null }`;
  - `derived: { run, manifest, keys }`, the derived run whose versions go out. It is null for a backfill whose donor
    hasn't come yet;
  - `level` (for Accept, S6): `{ source, from, metrics }`.

  A replacement, and a withdrawal (a `dont` decision), `amends` the decision it replaces. The pause's own inputs and
  keys stay what they were (the held run's).
- **`release`.** It adds:
  - `from: { run, manifest }` when what it releases is a derived run;
  - `repair`, as resolved: the donor a backfill or a standing fill found;
  - `filled`: rows from another day, at the source;
  - `under`: the standing decision it applies (a standing fill, or an Accept's level), or the `flow` entry of a
    `meanwhile` setting;
  - `withdraws`: the release a withdrawal takes back.
- **Order.** Decide, then the derived run if it isn't made yet, then the release. After a reload, the day runs again.
  A decision with the same inputs and keys is applied again (§10, unchanged): its derived document is rebuilt, run and
  released. A derived run whose keys differ from the decision's `derived.keys` is shown, and applying it is one tap,
  recorded as an amendment, as for another build's decision (§10).

### S10. Releasing a derived run (the plugin)

- **What the release says.** `ReleaseInput` adds `from: { run, manifest }`, `repair` and `withdraws`, and `option`
  takes the new values.
- **What it checks**, for a fill or a complete part. Everything §5 checks of the run it releases (here, the derived
  run), and also:
  - `from` is a held run here, with that manifest, of the same period value;
  - the derived run's stored document is `repairDocument(from's stored document, repair)`, compared by flow hash;
  - its watched source is the held run's snapshot (the same content hash): the arrived part is what arrived;
  - its donor node read the file the repair names, and the donor's claim was judged good;
  - it holds by nothing but the held run's story holds, judged against `from` (C4), and `derived`: no checks tripped,
    no donor not judged;
  - the actor may take `fill` or `complete` under the held run's stored policies;
  - for a `meanwhile` release: the held run's plan sets `meanwhile` to this option, and the repair is the plan's donor
    rule, before.
- **Accept** is released as Publish as is, with the option `accept`, a reason and the decision's level. A later day
  released under a standing level cites the Accept as its `under`, as a release under a standing decision does.
- **A replacement** may move a name from an earlier version of the same day, or from the day before it. It never
  moves a name back past a later day.
- **A withdrawal** (option `dont`, with `withdraws`) checks that the release it names is applied and released a fill
  or a complete part of this day, that each name still shows that release's version, and that the actor may take
  `dont`. It then points each name back to the version it showed before that release. It is refused when a later day
  is current; the decision stays recorded.
- **What it keeps.** It points the names and keeps the release. Two new tables, so no migration:
  - `_smaltfl_repairs(release, run, from_run, from_manifest, repair, before)`: what was repaired, and `before`, the key
    each name showed before the release, which a withdrawal points back to;
  - `_smaltfl_withdrawals(release, withdraws)`.

### S11. verify and the audit

- **verify gains a `repair` check** for a run released with a repair:
  - the stored derived document rebuilds from the held run's document and the repair;
  - the donor node read the repair's file;
  - the watched source's snapshot is the held run's.

  Its *held* check accepts such a release, and a name a withdrawal pointed back shows a version its own run or
  release published. At the Re-derived level, the donor's file is decoded again like any source file.
- **The audit bag** adds engine/repairs.json (the repairs and the withdrawals), and every derived run's manifest, plan
  and document.
- **`audit.mjs check` checks a derived run as it checks a held one** (manifest, plan, files, holds). It fails:
  - a derived run whose document isn't the repair of its held run's document by the decision's repair;
  - a donor file that isn't in the list with that sha256, or whose day isn't the rule's direction within four weeks;
  - a donor claim that says something wrong, or was told from another history than the held run's claim;
  - a release of a derived run whose decision doesn't name its keys (`derived.keys`) or its repair;
  - a replacement that moved a name back past a later day;
  - a withdrawal that doesn't amend the fill's decision, or doesn't point each name back to the version before the
    fill;
  - an Accept without a reason or a level, and a release under a level that doesn't stand for its day.
- **What it can't check yet.** That a donor was the *first* good day by its rule needs the verdicts recomputed from the
  history: `audit.mjs check --history` (ADR 0010 §6). Until then, the audit checks the donor's own claim and its place.
- **Older tools fail closed.** An older `audit.mjs` fails a release of a `derived` run ("releases a run the record
  doesn't hold"), and an older plugin refuses the `fill` op.

### S12. On screen

ADR 0008's rules apply: shape first, words budgeted.

- **Marks.**
  - ‖ waits, ⚑ published as is (and accepted: readers got the day as is), ✕ not published (and withdrawn).
  - New: **◧ filled** and **◐ complete part**.
  - A new pattern for filled rows: **stipple**, the ink's dots on a 4 px grid, with a solid top edge in the ink, so the
    rows read as present. Each mark keeps one meaning:
    - hatch is another day's rows shown *instead* of the day;
    - dashes are rows that are absent;
    - stipple is another day's rows *inside* the day.
  - Stipple is 3:1 against the card in both themes, as bands are (ADR 0008 §7).
  - A day readers keep that was itself filled carries ◧ beside its date ("Keep Thu 21 ◧"). The mark is not a word.
- **The decision sheet draws each option as what readers would get, on one scale.** The cause picks the drawing, as
  in slice 1.
  - **Hours** (24 bars):
    - Publish as is: the day's own bars, with the wash of what is missing ("~77k fewer").
    - Keep: the kept day, hatched.
    - Fill: the hours before 13:00 solid, the donor's hours from 13:00 stippled, the cut marked ("13h").
    - Before 13:00 only: the same hours solid, the hours after it a dashed usual outline.
  - **A split** (one count bar):
    - Publish as is: the part's missing wash.
    - Keep: hatched.
    - Fill: the rest solid, the donor's part stippled.
    - The complete part: the rest only, the part a dashed outline at its usual.
    - Accept: the day's own bar, with its dashed usual moved to its end, so it reads "this is usual now".
  - **An amount** (the week's strip): Publish as is, Keep, and Accept (the band re-centred on the day from the day on).
- **Each row's words.**
  - Labels: "Fill from Thu 14" (the donor picked), "Before 13:00 only", "Without 06:00–16:00" (a gap), "From 07:00
    only" (a late start), "Without Vendor 1", "Flex Fare only", "Accept the new level".
  - Each row's number is the rows readers get, with the source's noun (`names.noun`, C3): "121,931 trips". The noun is
    said once in the sheet, and numbers are bare after it (Q-78).
  - Under it, once the row is picked: "83,671 filled", "3,679 set aside", "learns from Mon 14", "37,935 after checks",
    or "fails its checks" (Q-67).
  - Picking Fill shows the other good donors as chips ("Wed 20", "Mon 25"), and the label names the one picked.
    Tapping a chip swaps the donor and redraws the row. A day that isn't good is never a chip.
  - The complete part is said only in the release and on screen ("◐ Before 13:00 only"); the data gets no column for
    it (the owner, Q-60).
- **The sheet stays within its 45 words** on every held day, whatever is picked. To fit five rows, slice 1's sheet
  changes five ways:
  - before a pick, a row shows only its number, and only Publish as is's override is said under it;
  - after a pick, only the picked row shows its number and one line under it, and the others keep their label and
    drawing;
  - the wait status goes once an option is picked;
  - once Publish as is is picked, its override keeps only its figures ("45.7% dropped (limit 10%)"), because the
    button says "over the checks";
  - the scope is one switch, "Later days too", in place of the two chips. The receipt still says "until a day
    passes".

  `sheetWords` tests every case, with the tests' longest noun ("endpoint events") too.
- **The button** names the result: "Fill from Thu 14", "Publish before 13:00 only", "Publish Without Vendor 1",
  "Accept from Mon 14", "Withdraw the fill". While the derived run is being made it says "Preparing Thu 14". Its title
  is the hash of what goes out.
- **The receipt.**
  - "Filled from Thu 14 · readers now see Thu 21", then "83,671 filled · 3 outputs released · Owner · 09:40 · record
    #22".
  - Then "Versions ›", and "Change decision ›" for a fill or a complete part, which can be replaced or withdrawn: the
    sheet then offers the other donors, the other remedy, and Keep Wed 20.
  - Withdrawn: "✕ Fill withdrawn · readers see Wed 20 again".
  - Accept: ADR 0010's step mark, then "New level from Mon 14 · readers now see Mon 14", then "learns from Mon 14 ·
    decision #24".
- **The day everywhere else.**
  - Output cards: "◧ filled · Thu 21", "◐ part only · Thu 21", "⚑ new level · Mon 14" (four words at most).
  - The day line: "◧ Filled from Thu 14", "◐ Before 13:00 only". The status sentence: "Thu Sep 21: filled from Thu
    14".
  - The loads strip's aria: ", filled from Thu 14". The title and the tab carry the mark.
  - A waiting day under `meanwhile`: "Paused · readers see fill from Thu 14" with Decide.
- **Rows and News.**
  - An output's Rows tab shows `filled_from` and stipples the gutter of a row from another day. Its head: "◧ 1,203 of
    4,312 rows from Thu 14".
  - Its News says what its load was: "Its load: filled from Thu 14 after 13:00".
- **Versions** (from the receipt and the Runs view's day card): one line per version, the one readers have ticked:
  "Arrived · 41,939 trips · held · run #13", "Filled from Thu 14 · 121,931 trips · run #15 ✓", "Corrected file ·
  118,250 trips · run #31". At most 45 words with four versions.
- **The record's lines** (Runs view):
  - "Thu Sep 21 filled from Thu 14 · decision #22"
  - "Applied decision #22 again in a new engine"
  - "Thu Sep 21 refilled from Wed 20 · amends #22"
  - "Thu Sep 21 fill withdrawn · amends #22"
  - "Mon Nov 14: new level from Mon 14 · decision #24"
  - "Tue Nov 15 published by #24's new level"
  - "Tue Nov 15 filled from Tue 1, by #22's rule"

### S13. The data

- **The app ships the donors.** `scripts/build-app.mjs` reads `loads.donors` from the data branch's MANIFEST.json and
  checks each donor file against its entry. It writes them under `data/loads/`, and lists them in `loads.json` (format
  1) as `donors: [{ day, file, rows, sha256, bytes }]`. A data branch without donors gives `donors: []`.
  - Donors are not loads: the strip doesn't step through them.
  - The page checks them with the list (`checkList`) and pins one only when a fill needs it.
  - loads.json format 2 (ADR 0010 §9) lists them per source, `sources.<id>.donors: [{ slot, file, sha256, bytes,
    rows }]` (C8).
- **The donor days on the data branch.** `scripts/data/build.py`'s `DONORS` are the same weekday before each episode
  day that is off, skipping holidays unless the held day is one: 2022-11-04 in place of 2022-11-11 (Veterans Day). They
  are on the data branch since data commit 6e387dd, listed as `loads.donors`. The nearest good days before and after
  each episode day are already episode loads.
- **The data branch keeps its history (the owner, Q-63).** Each build adds a commit on top of the last (`data.yml`,
  0d41719), so every data commit a run or an audit bag names stays fetchable, and "what was true" with it.
- **Who publishes it.** The data workflow runs on any push that touches `scripts/data/**` or `data.yml`. Only the
  session owner pushes; the lanes that build this amendment and ADR 0010 never push. So the restriction the plan
  proposed (`data` published only from the default branch, `data-<branch>` otherwise) isn't built (Q-75). If lanes
  ever push, it comes first.

### S14. As built in the last pass (the review of 2026-11-09)

- **A withdrawn decision stays withdrawn (S5, Q-61).** The plugin refuses a release that cites a decision whose applied
  release a withdrawal took back: only a new decision applies the fill again. The audit fails an engine release that
  applies a decision again after an engine withdrawal took it back, and any engine release citing a decision more often
  than the record keeps applied releases citing it.
- **Publish as is can't be taken back (§12, S5).** The plugin refuses a fill or the part alone of a held run whose day an
  applied release published as is or at its new level (that run, or a run of the same inputs). The audit fails a remedy
  decision, and its release, made after the day went out so.
- **A withdrawal once a later day is current** is recorded with no engine release: no name moves back, and `pausesOf`
  reads a decision not to publish made after the fill went out as its withdrawal (`withdrawn` is the decision's seq), so
  the day is ✕ and readers keep the later day. The page finds the day's released fill from its derived runs, not from
  what the names show.
- **On a filled day, Change decision** offers the other donors, never the one readers have (S7). A refused release
  never hides the one that applied before it, and the receipt cites the decision whose release applied.
- **What readers keep (S12):** a filled day's Keep row gives its rows as filled (what its checks were given past the
  fill) and draws its donor's hours or part stippled when the causes match; the Keep label, the day line and the pause
  row mark it ◧ (◐) beside its date (`readersSee`'s mark).
- **A backfill donor is a day that has arrived here (S3):** run and judged in the visit or the record (`DonorQuery.arrived`);
  a later day not loaded yet is "not arrived", never offered or drawn.
- **Accept (S6):** an accepted day is marked by the level's step, never ⚑, in the strip, the receipt, the sheet's header
  and the day line; the strip's key names every mark it draws (new level, filled, part only). The level names the notes
  outside their range the accepted day's news shows too; a level naming a value's share applies to its column's whole
  mix; and a later day's metric gone back less than a quarter of the way to its old level is still at the new level
  (`levelWays(story, then)`). On the real history, Mon Nov 14, 2022 accepted covers Tue 15 to Sun 20, and Mon 21, the
  vendor back, pauses (hold-real).

### Encodings (amendment 1)

**Unchanged:** `key/0`, `flow/1`, `plan/0`, `plan/1` (E10), `dataset/0`, `run/1`, `log/1`, `checkpoint/0`, `edit/0`,
`policies/0`, `ontology/0`, E9.

- **The plan.** A `fill` node is new plan content, hashed as plan content is. Its key covers `time`, `shift`,
  `missing` and `from`, and its inputs' keys (the donor's snapshot among them).
  - Under plan/1 the publish block's new fields are present only when set, so every existing plan/0 and plan/1 hash
    holds byte for byte (this ADR's three vectors among them). Under plan/2 they are filled in (C1, ADR 0010 §11).
  - An older plugin refuses the op ("node N has no known op") and the fields ("publish has donor, which this version
    doesn't read"). An older build refuses the step kind. So, as §2 asks, a build can't run a flow it would fill
    wrongly, and no format number changes (Q-47 unaffected).
- **A derived document** is a flow document, hashed by flow/1. **A filled version** is a dataset, hashed by
  dataset/0; `filled_from` is a column like any other.
- **The record.** New `about` fields and option values are data.
- **The store.** Its tables are not hashed. `_smaltfl_repairs` (each release of a remedy: its run, the held run it
  repairs, the repair, and `before`, the key and run each name showed before it), `_smaltfl_withdrawals` (each
  withdrawal and the release it takes back) and `_smaltfl_derived` (each derived run: the held run, its holds, its
  donors as judged, the rows filled) are new; `_smaltfl_holds` gains the hold kinds `derived` and `donor`.
- **The fill node** carries `to`, the run's day (the period parameter's value, or the watch's own period's), so the
  day a donor's rows are shifted to is part of the node's key: a fill of another day never shares a key.
- **The options.** `DecisionOption` is the full list (`asis`, `dont`, `fill`, `complete`; `accept` with Accept);
  `DecideOption` stays slice 1's two, for the code that takes only those.
- **A withdrawal (Q-61)** is a `decide` entry with option `dont` that amends the fill's decision, then a `release`
  entry citing it with `withdraws` (the seq of the fill's release) and `outputs` the names as they now show; the
  plugin's input names the fill's derived run, its keys and its engine release by number. It is refused when a later
  day is current, and when nothing was published before the fill. A refill readers have isn't withdrawn in this slice
  (the plugin would bring the earlier fill back): the sheet offers Keep only over a first fill.
- **Applied again.** After a reload a remedy's decision is applied again from its repair: the derived run made again
  in the new engine has the same inputs and keys as the one the decision names, and its release cites the same
  decision. The audit checks it by those inputs, as it checks a day published as is again (§10).
- **Content vectors, pinned by the first implementation commit** (test/plan.test.ts), as this ADR's were:
  1. This ADR's test vector document with a base fill step on `trips`: the plan as `translate` makes it, and its
     plan/1 hash.
  2. Its derived document for `{ "column": "VendorID", "value": 1 }` from `2022-11-07`: the flow/1 and plan/1 hashes,
     and the fill node's key with fixed snapshot hashes.
  3. The same, for the complete part (`from: null`).
  4. The example with its fill step, for `2023-09-21`: the plan/1 hash, which replaces `ccbc4d7b…` as the example's
     vector. The keys of zone_list, districts and weather_hourly equal the old ones; every key from trips_filled down
     differs. When the example moves to the general form (ADR 0010 §13), its plan/2 vector replaces this one.
  5. This ADR's `fc700fdf…`, `32609b0f…` and `292c423f…`, unchanged.
  6. The example as it ships in the general form (phase 3, ADR 0010 §13, Q-54), for `2023-09-21`: its plan/2 hash. Its
     node keys are vector 4's. The legacy form (test/helpers/example.ts `exampleLegacy`) keeps vector 4.

  The values pinned (test/plan.test.ts):

  | # | Vector | Value |
  |---|---|---|
  | 1 | plan/1 hash | `4ec48299…` |
  | 2 | flow/1, plan/1, fill node key | `d5b55a25…`, `05c117f8…`, `597ca2cd…` |
  | 3 | flow/1, plan/1, fill node key | `34bb7cfb…`, `1f0dccb4…`, `8e220625…` |
  | 4 | the example as it ships (step A10), with ADR 0010's nouns and Vendor's name and role | `0749ab06d7d6e78fff14b5ff23d4f8641ac315b70764b16881b367ed13074170` (`d145cfde…` without them) |
  | 5 | unchanged | `fc700fdf…`, `32609b0f…`, `292c423f…` |
  | 6 | the example in the general form: Election Day, the watch an object (plan/2) | `668856bd2ec35235a2882e3825a580d0905fa6de8531d89162b2d4d8130240c6` |

  The example taken back out of its fill step (test/helpers/example.ts `exampleUnfilled`) keeps `7d7236ea…`, which
  shows the step added nothing else.

### Consequences (amendment 1)

- **A feed incident no longer has to choose between a stale day and a short one.** On the history, 17 of the 28 held
  days can be filled. On the 14 feed incidents among them, the same weekday before lands a median 2.2% from the day's
  guess.
- **Filled rows are marked in the data, every day.** A reader can always keep only what arrived. The cost is one
  rebuild when a flow adds its fill step, and a rule that every output reached carries the mark. A SQL step must carry
  it on by hand, and the runtime refuses a run until it does.
- **What arrived is never lost to a fill.** It stays the day's first version, kept, hashed and rebuildable, and its
  file stays fetchable from the data branch's history. A fill can be replaced by a better donor or a corrected file,
  or withdrawn, and each step is recorded.
- **With outputs that hold one day at a time, a replacement or a withdrawal shows only while its day is the latest.**
  After that it is the day's version in the record and for audits, not for readers, until outputs keep their days.
- **Accept ends the three-week pause after a deliberate change** without changing the flow. It needs ADR 0010's
  re-learning, so it is built after both lanes.
- **The decision sheet has up to five rows.** To keep within 45 words, numbers show less before a pick: the drawings
  carry the comparison.

### Where the two lanes meet

This amendment and ADR 0010 are built in parallel. These contracts bind both; the same table is in ADR 0010 §14, and
a change to one is a change to both.

| # | Contract | Here |
|---|---|---|
| C1 | **Publish and watch fields.** plan/1's `publish` gains `donor`, `meanwhile` and `until` only when the document sets them. In format 3, `donor` is a field of the watch, filled in by plan/2 from the pattern (weekly → `weekday`; none, monthly → `nearest`); `meanwhile` and `until` stay in `publish`. plan/2's `publish` is `{ hold, period, together, calendar, watch, meanwhile, until }`, filled in. The plan/2 vector is computed on this shape before it is pinned (Q-70). | S1, Encodings |
| C2 | **Decide options,** in this order: `asis`, `dont`, `fill`, `complete`, `accept`. The fills add `fill` and `complete`; `accept` comes with ADR 0010's phase 3. | S8 |
| C3 | **Nouns.** Every new word on screen that counts rows goes through `names.noun(n)`; `SheetIn` and the pause line's inputs carry `noun`. Until ADR 0010's phase 1 is merged, `main.ts` passes `"trips"`. No new string writes "trips". | S12 |
| C4 | **Claims.** `judgeClaim` is the one check per claim, called by `judgeClaims` and `judgeDonors`. A derived run's watched-source claim is judged against `from`: its flow hash, its stored measures, the same snapshot; so `RunOptions` carries `from` with `stage` (Q-69). Donor claims are claim/2 under plan/2. | S3, S4, S10 |
| C5 | **What normal is learned from.** One tail leaf per (source, slot), the first time the slot runs; derived runs and re-runs add none (Q-72). `skip` holds periods held and not published as is: not published, waiting, filled, the complete part only. A day published as is, or accepted, is learned from. | ADR 0010 §5–§6 |
| C6 | **Accepted levels** live in the record and the claims, never in the document (Q-68): the decide entry's `level`, the claim's `levels`, `NormalRanges`' `breaks`. No `flow` entry, no `normal.breaks`, no matching of decisions whatever the flow hash. | S6, S9 |
| C7 | **Through a fill step.** `sourceOf(doc, id)` (document.ts) resolves an input through a fill step; `countedChecks`, the history builder, the app's `historyOf(id)` and `insertAfter` use it. | S1 |
| C8 | **Data and time.** The data branch is published by the session owner's pushes alone; lanes never push. loads.json format 2 lists donors per source, and a donor's table is made from its binding. A fill step's `time` equals its source's watch `time` when the watch names one, counted in the watch's `zone`. | S1, S3, S13 |
| C9 | **Names.** The story state and hold kind for "nothing to compare against" is `unlearned`; `unjudged` stays the integrity hold. The `expected` act is never offered for a bad value, whatever it is labelled (Q-71). | S2, S3, S6 |
| C10 | **The record.** Its kinds stay `run`, `decide`, `release` and `flow`, and log/1 doesn't change. New `about` fields: here, run outcome `derived` with `from` and `repair`, decide `repair` and `derived`, release `from`, `repair`, `filled`, `under` and `withdraws`; ADR 0010's run `measures`, decide `level`, and later decide `load`. New store tables: `_smaltfl_repairs` and `_smaltfl_withdrawals` (here), `_smaltfl_measures` (ADR 0010). | S9, S10 |

The rulings where the two designs disagreed are listed in ADR 0010 §14, each a maintainers' question with its default
(Q-59, Q-68 to Q-80). The order: ADR 0010's phase 1 merges first, then this amendment's build, then ADR 0010's phases 2
to 4, Accept built once in phase 3.

### Left for later (amendment 1)

- Outputs partitioned by day, so a late replacement, withdrawal or decision can be published into its place (this
  ADR's list).
- Filling at an aggregate (scaled to usual, or between neighbouring days), and filling several sources on one day
  (ADR 0010 §7 fills per load).
- Re-running a corrected file (slice 3), which S7's versions are shaped for.
- `audit.mjs check --history`, which checks that each donor was the first good day by its rule (ADR 0010 §6).
- Withdrawing a day published as is, which the owner wasn't asked.

### Open questions (amendment 1)

**Answered by the owner** (2026-11-08), each recorded in docs/OPEN_QUESTIONS.md: Q-49 (filled rows, both donor
rules), Q-50 (who decides), Q-57 (who accepts, and for how long), Q-60 (the complete part said in the release and on
screen), Q-61 (a fill may be withdrawn), Q-62 (a corrected file replaces a fill on its own), Q-63 (the data branch
keeps its history), Q-64 (a fill stands until a day passes), Q-67 (a part that fails its checks is offered, marked).

**For the maintainers** (open, each with its default): Q-65 (a SQL step that drops `filled_from`: refuse), Q-68 to
Q-80 (the rulings between the two lanes; ADR 0010 §14).
