# ADR 0009: A day that is off is paused, not published

- **Status:** accepted for the principle and its defaults (the owner, 2026-11-08); Q-47 and Q-49–Q-52 open
- **Date:** 2026-11-08
- **Builds on:** [ADR 0004](0004-the-flow-plan.md) (the flow plan), [ADR 0006](0006-integrity.md) (run/1, the record,
  verify, the audit bag), [ADR 0008](0008-visual-first-news.md) (the story, the gate, a day shows that day). Answers
  Q-45, and records the owner's answers to Q-46 and Q-48.
- **Amends:** ADR 0008 §6 and §10 (§12 below).

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

   - A decision covers **this day**, or the days **until a day passes**: it stands for each held day after it until a
     day publishes. Nov 14–20 takes one decision, not seven. Publish as is covers one day at a time (Q-50).
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
      card), and once decided "⚑ as is · Thu 21" or "✕ unpublished · Wed 20".
    - **The cause card** keeps its head and its visual. Its reach row reads "‖ Paused · 3 outputs waiting", and its one
      verb is **Decide**; "Tell the source" moves behind ⋯. Someone who may not decide sees "Paused · waiting on Owner"
      in the row itself, with no verb: a line of its own would take Sat Sep 18, 2022 to 61 words at a glance. A tap on
      the row lists the waiting outputs, and then "What readers get ›" opens the decision sheet read only: its rows
      greyed and "Only Owner decides" in place of the button. Once
      decided, the row becomes the receipt, the day's mark before it ("⚑ Published as is · Owner · 09:40", "✕ Not
      published · under Fri's decision"), and the story's verbs stay behind ⋯. The day after an episode says what
      became of its days, what still waits first ("Thu as is · Fri–Sun not published"), and its strip marks them.
    - **The decision sheet** draws each option as what readers would get, all on one scale. The cause picks the
      drawing, as it picks the hero: 24 hour bars for a day that falls at an hour, the part bar for a split, a strip of
      days for an amount. Another day's rows are hatched (ADR 0008 §10), and absent ones dashed.
      - Each option is one row: its mark, at most four words, the drawing and one number.
      - Only the options the cause allows appear.
      - A reason is one tap on a chip.
      - The button names the result ("Publish as is · 3 outputs") beside the hash of what goes out.
      - A receipt follows ("⚑ Published as is · Owner · 09:40").
      - At most 45 words at a glance, and the paused card within its 60, in every state, on all 28 days `wrong` holds
        (src/core/decision.ts gives every word; test/story-real.test.ts counts them).
    - **The record of decisions.** The Runs view opens on a ribbon of paused days with their marks. Tapping a day
      opens its hold, decision and release, with the hashes and the record entry one tap further.
    - **ADR 0008 changes:**
      - §6's "Nothing to do · held" and "Outputs not published" become "waiting" until someone decides.
      - §10's "outputs keep the last day that passed" becomes the last day published.
      - A held day now has its own rows, staged. Every view reads the viewed day's own run, published or staged, and a
        staged one sits under a full-width hatched bar ("Staged Thu 21 · readers see Wed 20"). Falling back to an
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
- **Q-49** Are filled rows allowed in published data? Should they be marked by a column, by the release, or both? Which
  donor rule? Do filled days and unpublished days feed the ranges that later days are judged by?
- **Q-50** Who decides by default: the owner only, as proposed, or stewards? Is Publish as is owner-only, and may it
  stand for later days?
- **Q-51** Should a passing run of a day earlier than the one published move the names back, as it does now, or stay
  behind, as a release must?
- **Q-52** Should the verdict's rule be frozen as a versioned copy, or tied to the build with the history test as its
  vector (as proposed)?
