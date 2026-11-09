# ADR 0010: The news, the story and the pause, for any dataset

- **Status:** proposed, 2026-11-08. It records the owner's answers of 2026-11-08, the third set (Q-53 to Q-58, Q-66)
  included. Q-59 and the maintainers' questions Q-68 to Q-80 that touch it are open, each with the default the build
  starts on (docs/OPEN_QUESTIONS.md).
- **Date:** 2026-11-08
- **Builds on:** [ADR 0006](0006-integrity.md) (E1 file digests, run/1, the record, verify, the audit bag),
  [ADR 0008](0008-visual-first-news.md) (the story, marks, word budgets), [ADR 0009](0009-paused-not-published.md)
  (holds, claims, decisions, plan/1). Also the generality audit (workflow wf_01597c7b-705) and its ranked list of 21
  changes.
- **Amends:**
  - ADR 0009: §2 (a watch can say how its source is judged), §3 (claim/2), §5, §9 and §10 (with more than one watched
    source, a hold and a decision are about one load), §7 (the donor's default comes from the pattern). Accept the new
    level, which this design first placed in §6, is described once, in ADR 0009 amendment 1 S6; §5 here keeps only what
    a level does to normal (Q-76).
  - ADR 0008: §1–§3 (always-bad values, and days not judged), §5 (nouns), §7 (◌), §8 (the relative rule), §9
    (re-learning after a lasting change).
- **Works with:** ADR 0009 amendment 1 (filling a paused day), designed and built alongside. Where the two meet is
  written into the sections it touches, and listed once in §14.

## Context

The owner asked three things:
- Is the news "built for the taxi data on certain days or general"?
- Do callouts "fade once a trend stabilises"?
- Would it break on the security data at work?

The audit's answer: the range maths is general. Almost everything around it is built for the taxi data, and some gaps
mislead on any dataset, the taxi data included.

- **"Normal" with nothing to compare against.** 36 taxi days have no range and are told "Normal for Thanksgiving" and
  published. They are 2021-11-11, and every holiday and holiday window from 2021-11-24 to 2022-10-10, before the
  history had a last year. 21 of them fall in the hold vector's span. A first-year holiday cut to 5% of its rows is calm
  and publishes; the same cut on an ordinary day is wrong.
- **A history for one flow.** The history script knows only `trips_valid`, ten taxi columns, `tpep_pickup_datetime`
  (read by slicing its text) and files named `yellow_tripdata_*`. A day missing from the history holds every run as not
  judged until the file is rebuilt offline. Editing a check switches its findings off: 40 days lose them.
- **An app for one flow.** It finds sources by file name (`trips.parquet`, `weather.csv`), and keeps one history and one
  story.
- **One calendar and one pattern.**
  - The calendar is the US one plus New York's busy weeks, 35–36 days a year. Election Day is not in it.
  - Only weekly and yearly patterns are learned. A month-end batch is wrong 23 times in 24, and weekly loads get no
    ranges at all.
- **Rare, serious values.** They barely register: lockouts rising from 0.5% to 2.4% stay a note. A surge is offered
  "Mark as expected".
- **Lasting changes.** A change that lasts does fade: it is loud for about 4 days, a note until about day 19, and quiet
  from about day 20. But:
  - for 3–6 weeks afterwards the band is too wide to see a second change;
  - a +60% step in rows is wrong on 22 of its first 23 days;
  - last year's oddities come back. 2023-11-14 is wrong only because its last-year guess was made from 2022-11-08
    (Election Day) and 2022-11-15 (the vendor 1 outage).
- **Taxi words.** Every sentence says "trips". "Manhattan", "Vendor N", a column matching /drop/ (taken as a drop-off
  15 minutes after pickup) and money only in USD are wired in.

The owner's answers, 2026-11-08:
- **The fill donor:** "You need to offer both. Sometimes day will matter like taxi data set, sometimes it won't like
  for security issues I deal with up at work."
- **Filled rows:** "Marked in the data. We should always be able to get back to what was true, what was used later if
  anything, and we should be able to update what was used if we get better info later."
- **Who decides:** "Owner, and if the owner wants they can delegate to people as a role."
- **The data branch:** it may be rebuilt. The donor days are on it now, listed as `loads.donors`, and it keeps its
  history: each build adds a commit on top of the last (Q-63).
- **What comes next:** the fills and the generality, built in parallel.
- **The security data:** "Many different files once a day usually, with some files a few times a day."
- **Rare, serious values:** they always alert. Bad values are marked in the ontology. A surge in one is something
  wrong and suggests an incident, never "OK this day".
- **Deliberate changes:** they pause until someone accepts the new level.
- **The third set,** picked in the question prompt (docs/OPEN_QUESTIONS.md has each in full):
  - a day with nothing to compare against is published, marked "Not judged yet", and a day with under a tenth of its
    recent rows still pauses (Q-53);
  - the taxi example takes Election Day into its calendar and stops last year's oddities echoing: 25 paused days, the
    22 short days still among them (Q-54);
  - when one file of a source loaded several times a day is off, only that file's slot pauses (Q-55);
  - a column marked serious alerts on any value never seen before (Q-56);
  - the owner may accept a new level, and a role only if "accept" is listed for it; one acceptance covers the days
    after it while the numbers stay at the new level (Q-57);
  - a new flow's calendar is none unless chosen (Q-58);
  - the taxi example's disputes are not marked bad now (Q-66).

**Measured for this ADR.** On the real history (761 days, 2022-01-01 to 2024-01-31, the flow's verdict), using a copy
of the core changed one way at a time:

| Change | `wrong` (28 today) | `short` (22 today) | Unusual days (45 today) |
|---|---|---|---|
| Election Day as a calendar day | 27: loses 2022-11-08 and 2023-11-07; gains 2022-12-31 ("Extra 1: 24% (usually 2.3–16.4%)": one more well-guessed holiday narrows the holidays' typical miss) | 22 | 46 |
| Shares not learned from when far from the same weekday's three weeks before (0.4 or 0.6 on the logit, as counts already are at 1.5×) | 27: loses 2023-11-14, the echo. At 0.8 it loses 2023-11-07 instead | 22 | 50 |
| Both, at 0.6 | **25**: loses 2022-11-08, 2023-11-07 and 2023-11-14; gains nothing | **22** | 51 |

## Decisions

### 0. Taxi verdicts stay where they are unless the owner accepts a change

**The legacy form keeps today's behaviour exactly.** A watch given as a file name, as ADR 0009 has it
(`"watch": { "trips": "history.json" }`), means today's settings:
- the `us-nyc` calendar and the weekly pattern;
- a day per load, and fixed floors;
- the history format as built today.

Its plan stays plan/1, byte for byte, and its verdicts don't move.

**The general form says its settings.** It is a watch given as an object, a `calendar` block, or one of the ontology's
new marks.
- Its defaults assume nothing about taxis.
- A document that uses it is format 3, and its plan is plan/2 (§10, §11).

**The example moves with the owner's acceptance.** The owner accepted the move and its change to the hold vector on
2026-11-08 (Q-54): the example moves to the general form in phase 3, and `wrong` goes from 28 days to 25 (§13).

**Changes to how a day is judged.** A change to the judging itself (the echo fix, re-learning) changes the story, and
so moves the vector (Q-52):
- it applies to general-form watches from its first build;
- it reaches the legacy form only as an accepted change to the vector, which makes it the rule for every flow.
- Leaving recorded days out of learning (§5, `skip`) applies to both forms from the build that adds it (Q-80). The taxi
  vector has no decisions in it, so it doesn't move.

### 1. Not judged yet (a)

- **A number with no range is *not judged*, never "normal".**
  - `newsOf` records what it could judge on the day: `judged: { rows, values: [n, of], quantiles: [n, of], checks }`.
  - The story gets the state `unlearned` when the day's rows have no range. Nothing about the amount, the hours, a
    split or a part's count can be told then.
  - **Names (C9, Q-71).** In code the state, the hold kind and the claim's state are `unlearned`: nothing has been
    learned to judge the day by. `unjudged` keeps its meaning, the integrity hold (`Hold.by: 'unjudged'`,
    `Judged.unjudged`): a claim missing, or one that doesn't match the run. The screen says "Not judged yet" for an
    `unlearned` day. The words that keep it apart from a "not judged" hold (paused, ‖) are left to the build's word
    review.
- **The head** is "Not judged yet". Its chip says why in at most four words:
  - "First Thanksgiving here"
  - "Day 9 of 28"
  - "History ends Jan 31"
  - "Rules changed Tue" (for the checks)

  "Normal for …" is said only when the rows were judged against that day.
- **Rows judged, some values not.** For example, a holiday after a share has moved (`|ratio| > 0.5` in `normal.ts`):
  - the head stays;
  - the Values cell carries ◌ with a count;
  - the health line says "Health · 3 not judged", never "all normal".
- **A floor that needs no range.** If a source's rows fall under a tenth of the median of its last seven periods, any
  weekday, the head is "Almost no {noun}" and the day is something wrong. This applies on an unlearned day too, so a
  first-year holiday at 5% of its rows is caught, and pauses under `wrong`.
- **An unlearned day is published, marked (the owner, Q-53: "Publish, marked").**
  - It is published with ◌ on the day, the strip and the card, and its claim says `unlearned`.
  - A day with under a tenth of its recent rows still pauses (the floor above).
  - A flow that wants such days paused adds `"unlearned"` to `hold`. Without it, `claimHolds` never holds on
    `unlearned`.
  - This is about knowledge. A day not judged because the page didn't vouch for it (no claim, or a claim that doesn't
    match) is about integrity, and stays held as ADR 0009 §3 says.
  - An unlearned day is never a fill's donor (ADR 0009 amendment 1 S3).
- **Taxi:** 21 days in the vector's span go from calm to unlearned.
  - No hold moves.
  - No taxi day falls under the floor (the build checks this; 0 are expected).

### 2. The flow's calendar (b)

```jsonc
"calendar": {
  "base": "none",                   // none | us | us-nyc: the built-in days
  "zone": "America/New_York",       // the zone a day is a date in (default UTC)
  "days": [                         // recurring days, each judged against its own kind
    { "name": "Patch Tuesday", "weekday": "tue", "between": [8, 14], "around": [0, 1] },
    { "name": "Month-end", "day": -1 },
    { "name": "Quarter-end", "day": -1, "month": [3, 6, 9, 12] },
    { "name": "Election Day", "weekday": "tue", "between": [2, 8], "month": [11] }
  ],
  "windows": [{ "name": "Change freeze", "from": "12-15", "to": "01-02" }],
  "dates": [{ "name": "Data centre move", "on": "2024-06-15" }]
}
```

- **The built-in bases:**
  - `none`: no built-in days.
  - `us`: the federal holidays, each on the weekday it is observed.
  - `us-nyc`: today's calendar. That is `us`, plus Christmas Eve, New Year's Eve, the day after Thanksgiving and New
    York's windows.

  In the plan, a base carries a version (`us-nyc/1`). A build that adds a day to a built-in list makes `/2`, and a flow
  keeps the days it was judged by until its document says otherwise (Q-59). Other regions are data, added with their
  tests; each needs no ADR of its own.
- **How a recurring day is written.** By a day of the month (`day`; a negative number counts from the month's end), or
  by the weekday that falls `between` two days of the month. `month` limits it to some months; otherwise it recurs
  every month.
- **How a recurring day is judged.** It is never learned from as an ordinary day. It is judged against its own kind:
  - **Once a year** (one month listed): against last year's day, as a holiday is today.
  - **More often:** against its occurrences before, the *occurrences' guess*. That is the last six, weighted as the
    weeks are, and moved by how the weeks before them compare. This is what judges month-end and Patch Tuesday, where
    today they are wrong 23 times in 24.
  - **`around`** puts days before and after it in its window. Each is judged against the same day of the window the
    time before.
- **Windows and dates.**
  - Windows are spans of the year, as the holiday season is today.
  - One-off dates are left out of learning and named on the day. They are judged like any other day: a planned move
    still pauses if it is off, and the decision sheet names it.
- **In the code.** `calendar.ts` keeps its functions, but each takes a calendar instead of the fixed list:
  `holidayOf(day, cal)`, `seasonOf(day, cal)`, `isSpecial(day, cal)`, `dayLastYear(day, cal)`, and the new
  `occurrencesBefore(day, cal, n)`.
  - `NormalRanges` takes the calendar as an option.
  - News and story take each day's name from it, with an optional `short` name for heads ("MLK Day").
  - The fills' donor rule skips the flow's special days with the same `isSpecial(day, cal)` (ADR 0009 amendment 1 S3).
- **One calendar per flow.** A watch can turn it off (`"calendar": false`) for a source the days don't touch.
- **Defaults.** A document with no `calendar` block and legacy watches uses `us-nyc/1`, as today. A format-3 document
  with none has `none` (the owner, Q-58: "None unless chosen").
- **The taxi example** (Q-54): `us-nyc/1` plus Election Day, as written above, once it moves to the general form.

### 3. A pattern per watched source, and the donor's default (c)

- **The three patterns:**
  - `weekly` (today's): the same weekday over the six weeks before. It is the default, since on flat data it costs
    nothing: the same 2 of 329 days fell outside their range with and without a weekday effect.
  - `none`: the 6 to 14 ordinary periods before, whatever the weekday, the latest weighted most. It catches up with a
    change in 3–4 days, where weekly takes 14–21.
  - `monthly`: `none`'s guess plus a third guess, the same day of the month over the last six months. The last three
    days are counted from the month's end, so month-ends line up. The guesses are combined with Bates–Granger weights,
    as the weeks' guess and last year's are now.
- **Last year's guess** stays for every pattern once there is a year of history.
- **The donor's default follows the pattern** (the owner's "offer both"; this amends ADR 0009 §7):
  - `weekly`: the latest same weekday within four weeks that the history says nothing wrong of.
  - `none` and `monthly`: the nearest good period, before (a forward fill) or after (a backfill).
- **Where a flow chooses otherwise (C1, Q-70).**
  - In format 3, `donor` is a field of the watch, beside `pattern`: `"weekday"` or `"nearest"`. plan/2 fills it in
    from the pattern when the watch doesn't say.
  - In format 2, it is `publish.donor`, in the plan only when the document sets it (ADR 0009 amendment 1 S1), so every
    plan/1 hash holds. A watch given as a file name in a format-3 document takes the pattern's default, `weekday`.
  - The fills build the fill and its other choices (ADR 0009 amendment 1 S3). This ADR fixes the default and where the
    field lives.

  On 2023's taxi data the donor makes a difference for counts (a median 5.1% off from the same weekday, against 6.7%
  from the day before) but not for shares (0.80 against 0.78 points).

### 4. Values that are always bad, and floors that scale (d)

```jsonc
{ "column": "result", "title": "Result",
  "values": { "success": "Signed in", "fail": "Failed", "locked": "Locked out" },
  "bad": ["fail", "locked"] }
```

- **`bad`** lists the codes that mean something went wrong. A bad value is something wrong (alert) whenever it is:
  - above its range;
  - at least twice its usual rows;
  - and past its floor (below).

  How many points it moved doesn't matter: lockouts going from 0.5% to 2.4% (4.8×) are wrong, not a note.
- **How a bad value is told:**
  - A bad value below its range is a note: fewer failures is good news.
  - It never folds under a cause. It is told at its own severity, as new values are.
  - Its verbs are "Open an incident" first, then "Tell the source". The `expected` act is never offered for it,
    whatever its label ("Mark as expected (optional)" today), not even behind ⋯ (C9).
  - A split whose named part is a bad value that surged takes that value as its head ("Failed 4.5× usual") and "Open
    an incident" as its verb.
  - Someone who knows a surge was harmless (a test, say) publishes the day as is, with that reason. Accept the new
    level is never offered for a bad value (ADR 0009 amendment 1 S6).
- **Serious columns alert on new values (the owner, Q-56: "Alert on new values").** A column is serious when its
  property lists `bad` values or says `"newValues": "alert"` (a country, a tool: a column with no bad value to list). A
  value never seen before in a serious column is something wrong. In any other column a new value is told as today
  (unusual from 100 rows or 0.1% of the day, otherwise a note).
- **In the plan.** A watched source's verdict-changing marks (`bad`, the serious columns, `after`) are copied into its
  watch in the plan (§11). They decide holds, and an older build refuses them rather than ignore them. Any such mark on
  a watched source makes the document format 3 and its plan plan/2, even with a legacy watch (Q-79), so a plugin that
  can't judge it refuses the plan.
- **The relative rule.** Any counted value at three times its usual rows or more (or a third or less), outside its
  range and past its floor, is at least unusual. This sits beside the point gates, which miss 30% → 35% and
  0.5% → 0.9%. Unusual doesn't hold; bad values are something wrong by the rule above.
- **Floors scale with the period's expected rows E.** A floor f, as set for 100,000 rows a period, becomes
  f·√(E/100,000), kept between f/20 and 10f. It is √ because counting noise grows that way. The floors are:
  - 200 rows in an hour (the hours finding) and 200 for a split;
  - 50 rows for a share;
  - 10 and 100 rows for a new value.

  At the taxi's 40k–130k rows a day, the floors would move by −37% to +14%. So `scale` is `fixed` in the legacy form
  and `volume` in the general form, and the backtest decides whether the legacy form follows (Q-52, Q-59). A quiet feed
  of 2,000 rows a day gets an hours floor of 28 rows instead of 200.

### 5. What a level does to normal; re-learning; echoes (e)

- **Accept the new level is described once, in ADR 0009 amendment 1 S6** (Q-76): when it is offered, who may take it
  (the owner, and a role only if its rule lists `accept`: the owner, Q-57a), how long it stands (later periods while
  the same metrics stay at the new level: Q-57b), its record and its words. This section says what a *level* does to
  normal.
- **Where levels live (C6, Q-68).** In the record and the claims, never in the document.
  - An Accept's decide entry carries `level: { source, from, metrics }`, with `metrics` as `metricKey` names them
    (`trips`, `count:VendorID=1`).
  - `levelsOf(entries)` reads them. The claim names them (`levels`, claim/2), so the verdict can be told again.
  - The flow doesn't change: no `flow` entry, no `normal.breaks` block, and ADR 0009 §10's matching of decisions by
    their inputs is unchanged.
- **Re-learning from a level.** `NormalRanges` takes `breaks`, built from the levels: the period each level starts,
  per metric. After a break:
  - The weeks' guess uses only periods after it. Until three of the same weekday exist, it uses any weekday.
  - The typical miss is measured on periods after it. Until a quarter of the window is after it, it borrows the miss
    from before.
  - Last year's guess is moved by the step (the ratio of after to before), or left out while its window straddles the
    break.
  - The outlier rule no longer keeps the new level out.

  A +60% step accepted on its first day is judged against the new level from the next day. Today it is wrong for
  three weeks.
- **Lasting changes that aren't accepted** are those told as a note and not held. The same re-learning starts on its
  own once a change has lasted 14 days (`lasting()` says 4 of 7, or the same weekday twice running), from the change's
  first day.
  - This closes the 3–6 weeks of blindness. Today a −10 point change three weeks after a slow climb is never told.
  - The break is found from the history alone, so the flow's verdict can be computed again.
  - **Never for a metric whose change held a day that wasn't accepted** (X7, Q-74): the owner asked that deliberate
    changes pause until accepted. Tested on the +60% step: held, not accepted, never re-learned automatically.
- **Echoes stop, in three ways:**
  - A share or a level far from the same weekday's three weeks before (0.6 on the logit for a share) is not learned
    from, as counts already aren't.
  - Last year's guess doesn't straddle a break.
  - Periods the record shows held and not published as is (not published, filled, the complete part only, or still
    waiting) are left out of learning for the flow's verdict too. The claim names them (`skip`, §6), so the verdict can
    be told again. A day one browser marked as expected still isn't left out.
- **Skips in the flow's verdict (X8).** `flowStory` refuses ranges that leave days out today. It allows the skips that
  come from the record and that the claim names, and still refuses a viewer's (incident days one browser marked).
- **Taxi:** the first way moves `wrong` (§13), and the owner accepted it (Q-54). The second needs breaks, and the
  legacy form has none until a change is accepted. The third doesn't touch the vector, which has no decisions in it.

### 6. A general history, each period added from its own run (f)

- **The builder** (`scripts/data/history.ts`, made general):

  ```
  node scripts/data/history.mjs --flow DOC --watch SOURCE --files LIST.json OUT.json
  ```

  It takes everything from the document or the data's list:
  - **The source and its checks:** the watched source, and the expectations step that reads it alone, if there is one.
    It reads through a fill step (`sourceOf(doc, id)`, C7): once a flow has a fill step, its checks read the fill, and
    count what arrived on any day nothing is filled.
  - **The file format:** from the data's list (§9).
  - **Columns counted value by value:** those whose property lists `values`, or the watch's `count`. Without those, it
    profiles the first 28 periods: a column with at most 50 distinct values is counted; one with more is followed for
    new values only, as the zones are (or as the watch's `follow` says).
  - **Pairs:** among counted columns whose numbers of values multiply to 400 or fewer.
  - **The time column and zone:** from the watch. The hours are counted in the watch's `zone`, not sliced from the
    text, so this is a builder change (phase 2); `news.ts` only reads `file.hours`.
  - **The slot:** from `every` (§7).
  - **The files:** a list of `{ file, slot }`, not a file-name pattern.

  A column it can't count is written into the file (`skipped: [[column, why]]`). The app then says "Values not watched:
  user (2.1M values)" instead of going quiet.
- **One function measures a load.** The numbers of one load are its *measures*.
  - The plugin measures them in the engine (`measure`), from the run's snapshot of the watched source:
    - exact counts: the rows, each column's values present, each counted column's values and pairs, and the rows in
      each part of the slot;
    - the checks' counts, from the manifest;
    - a median and quantiles, from the same even sample the profile takes (every k-th row, in the snapshot's order).
  - The builder calls the same method on the runtime. So a period built offline and the same period measured by its
    own run are byte for byte equal. The test compares every field on the 57 loads.
  - Only `emit.ts` writes the SQL.
  - The plugin caches a file's measures by its sha256 and the watch's settings. The page asks for them before the run
    (to tell the claim), and the run reuses them.
- **The formats.**
  - **measures/0** (E11) is the canonical record of one load's numbers.
  - **smaltfl-history/3** is the builder's file. Its header holds the flow, source, `every`, zone, columns, types,
    kinds, sample, warmup and `skipped`; then come the periods' measures, by column as in /2.
  - /2 still reads: it is /3 with `every: day`.
  - A period taken out of a /3 file (`periodOf(file, k)`) is the measures/0 record its own run would make.
  - **The data branch keeps /2 until the app that reads /3 has merged (phase 2).** Today's app uses the history only
    when its format is `smaltfl-history/2`, and would go on without one, silently; the real-history tests read the same
    file, so they wouldn't catch it. From phase 2 the app reads both.
- **Each period is added from its own run.**
  - After a run, the measures of its watched loads are appended to each source's *tail*. They are kept in the record
    (the run's entry, `about.measures`; log/1 doesn't change) and in the engine (`_smaltfl_measures`).
  - **The tail keeps what arrived (C5, Q-72):** one leaf per (source, slot), the first time the slot runs. A derived
    run (a fill, a complete part), and a re-run of the same file (after a reload, or stepping back over a day), never
    add a leaf. A corrected file waits for slice 3.
  - A period is judged by the base file (pinned, E1) plus the tail before it.
  - The tail is a Merkle tree (E12 tail/0: RFC 9162, with its own leaf tag), so a claim names it by its size and root.
  - A day the base lacks is judged from its own run and the tail.
  - A day that neither has (not run in this browser) is a gap. Too many gaps give "Not judged yet", never a hold for
    want of a rebuilt file.
- **claim/2.** The claim's reference to the history changes, and it adds fields:
  - `history: { base: { path, sha256, bytes } | null, tail: { size, root } | null }`;
  - `flow`: the flow hash it was told under (the settings, the calendar and the marks);
  - `slot`, replacing `day`;
  - `measured`: the measures/0 hash of the load, as the page measured it;
  - `skip` and `levels`, from the record (§5).

  The plugin holds a source as not judged (`unjudged`, the integrity hold) when any of these fails:
  - the claim is claim/2, under a plan/2;
  - its `flow` is the plan's flow hash;
  - its `slot` is the value of the watch's period parameter;
  - its base is the file pinned;
  - its tail root is the root of the tail pinned with it (the page pins the tail as a file, `tail/<source>.json`, and
    the plugin computes the root again);
  - `measured` equals the plugin's own measures of the snapshot. ADR 0009 compared only the rows.

  One check per claim, `judgeClaim` in `hold.ts`, judges a watched source's claim and a donor's claim alike; claim/2
  changes it once (C4).
- **A derived run's claim (C4, Q-69).** A fill or a complete part runs a derived document (ADR 0009 amendment 1 S4),
  with its own flow hash, and its checks count the filled rows. So its watched source's claim is judged against the held
  run it repairs (`from`, which the run options carry):
  - the claim's `flow` must be `from`'s flow hash;
  - its `measured` must equal the measures stored for `from` (`_smaltfl_measures`), not a cache, which is empty after a
    reload;
  - the derived run's snapshot must have `from`'s content hash.

  Without this, every fill would be held as not judged under plan/2, and its release refused. It needs no new hash of
  the judging settings, so no new encoding.
- **A donor's claim** is claim/2 under plan/2: the base plus the tail, and `measured` of the donor's snapshot. It must
  say nothing wrong of the donor (ADR 0009 amendment 1 S3).
- **Evidence.** The claim stays evidence at the Intact level.
  - verify's *held* check measures the snapshot again, at the Recomputed level.
  - `audit.mjs check --history` rebuilds the tail from the bag's run entries and tells each verdict again (an item of
    ADR 0009 slice 3), `skip` and `levels` included, and checks that each donor was the first good day by its rule.
- **When the checks change.** Each measures record carries its checks' step and rules. The checks' numbers are judged
  only from periods counted with the rules now in force. After an edit, the checks' findings come back once enough
  periods have been counted with the new rules, and until then the card says "Checks not judged yet · rules changed
  Tue". Today 40 days lose these findings without a word.
- **What is learned from (C5).**
  - The tail keeps what arrived, never a fill. A filled period's measures are the load's own (what was true). The fill
    itself is marked in the data (ADR 0009 amendment 1 S1).
  - `skip` holds the periods that were held and not published as is: not published, waiting, filled, or the complete
    part only. They are left out of learning for later days.
  - A day published as is, or accepted, is learned from (Q-59's last part, the default the build starts on).

**Phase 2 as built** (2026-11-08). Where the build settled what the text above leaves open, or differs from it:
- **The tail's file in the engine** is pinned as `tail.<source>.json`: pinned names take no slashes. It holds the
  tail's measures records in slot order, one a slot; the plugin refuses anything else, saying why.
- **A claim names a prefix of the tail pinned.** A claim/2's `history.tail` is the first `size` leaves of the tail
  pinned with the run: a donor's claim, told before the held day, names a shorter tail than the held day's. The page
  pins the tail before the latest day it claims.
- **A load the base has** is told from the base only when the base's period is the load's (`samePeriod`: every number
  the base keeps of it, and for a followed column or a pair, the values first seen that day and their rows); a load the
  base lacks inside the base's span (a gap) can't be added after it. Either way no claim is told, and the run holds the
  source as not judged.
- **What /3 keeps of a period.** Each counted column's rows a period, as /2 does; a followed column and a pair keep
  each value's first and last period, its periods and rows, and the rows of values new each period. A load's measures
  keep all of them in full, so the tail folds them in exactly; a base period can't be taken back out into a full record
  (`periodOf` gives the numbers the file keeps).
- **How a load is measured** (`settingsFor`): the columns its base counts, follows and pairs; with no base, the watch's
  `count` and `follow`, else its bad columns counted and its serious columns followed, no pairs. The checks are named
  as the document writes them (a rule with a parameter is the same rule whatever its value) and counted with their
  parameters bound (`counting`). With no time column a load has no parts. A run of a plan/2 flow is given its document
  (as `runFlow` gives it), or its measures can't be told apart from the page's.
- **The builder's columns** come from `--count`, `--follow` and `--pair`, else the watch's, else the ontology's (values
  or bad codes counted, serious columns followed, counted columns of 20 values or fewer paired). Profiling the first 28
  periods is not built. The taxi's columns are named by `build.py`.
- **`_smaltfl_measures`** keeps the settings beside the measures, which verify measures the snapshot again by.
- **Days the record leaves out** reach claim/1 too (Q-80): a claim/1 names them in an optional `skip`, only when there
  are some, so every claim made before is unchanged.
- **loads.json format 2** is `{ format: 2, month, built, data, flow, sources: { <id>: { table, format, file, header?,
  columns?, context?, entry? | loads, donors } }, histories: { <id>: { path, sha256, bytes, from } }, episodes }`: a
  source's one file is its `entry`, a loaded source's days are `{ slot, file, sha256, bytes, rows }`, and `flow` names
  the document when it isn't the built example. Format 1 still reads (`src/app/datalist.ts`).
- **Not built in phase 2:** the screens of §9 beyond the first watched source (each card's own story, lanes in the strip:
  phase 4), `?flow=` and `?data=` in the address, the Columns tab's "Values not watched" line and the checks card's
  "Checks not judged yet · rules changed Tue" words (the core says when the rules changed: `checksFrom`), a fill's donor
  claim/2 told by the page (the plugin and the tests tell it; the app's flows under plan/2 have no fill step yet).
- **`audit.mjs check --history <history.json>`** tells each claim/2 in the bag again (`src/core/retell.ts`): the tail
  rebuilt from the record's run entries before it (one a slot, never a derived run's), the days the record left out
  before it, the load's measures its entry keeps and the base the auditor brings; the claim must name each, and the
  story told again must say what it said. Checking that each donor was the first good day by its rule is not built.

### 7. Several watched sources, each with its own cadence (g)

- **Slot:** what one load covers.
  - `every` is `day` (the default) or `12h`, `8h`, `6h`, `4h`, `3h`, `2h`, `1h`, aligned to midnight in the
    calendar's zone.
  - A slot's id is text that sorts in time order: `2024-03-12`, or `2024-03-12T06` (its first hour).
- **Load:** one file of one watched source for one slot.
  - The data's list names each file's source and slot.
  - A file that spans slots is not a load of a watched source. Its rows outside the slot (by the time column) are a
    finding.
  - **A later file of the same day (X5, Q-77).** A file of another slot is a new load, with its own hold and decision.
    A second file for the same slot is a re-run: a version of that load (ADR 0009 amendment 1 S7 keeps a day's
    versions per source and slot).
- **Day:** still the calendar's unit, and the screens'.
  - A slot of a special day is special.
  - The strip is still a strip of days. A source loaded four times a day draws each day's cell in four parts.
- **Bands per slot.** The series has a value per slot.
  - Each pattern compares the same slot of the day:
    - weekly: the same slot of the same weekday;
    - none: the same slot of the days before;
    - monthly: the same slot of the same day of the month.
  - Last year's guess is the same slot 52 weeks back.
  - Windows are still counted in days.
  - A day's hours become a slot's parts: hours for a slot of 3 hours or more, quarter hours under that.
  - Floors scale with the slot's own expected rows, so a quiet night slot isn't held to a busy afternoon's floors.
- **Runs.** A run starts when a load arrives.
  - Its parameters carry each watched source's current slot, under that watch's `period` parameter: for example,
    `"period": "day"` for the daily sources and `"period": "slot"` for one loaded four times a day.
  - A source with no new load since the last run is read again as it was: its snapshot and keys are reused.
- **With one watched source** (the taxi flow, and any other with one): a load is the run's day, and nothing changes
  from ADR 0009.
- **With more than one, holds and decisions are about loads.** This amends ADR 0009 §5, §9 and §10 for these flows.
  - A watched source holds when its *new* load is off (its claim, as in ADR 0009 §3).
  - **Only that load's slot pauses (the owner, Q-55: "That file's slot").** With `together: false`, a held load keeps
    back only the outputs that read it, and outputs that don't read it still publish.
  - A held load not yet decided keeps holding on every later run that still reads it. Those holds are *carried*: they
    cite the run that first held the load. So a daily source held at 08:00 isn't decided again at 14:00, when another
    source's slot arrives.
  - A decision names the load: its source, slot and file sha256. It does not name output keys, which change with every
    other source's load. `untilPass` stands until a load of the same source passes.
  - A release of a run cites a decision for each load that holds in it. The plugin checks:
    - each cited load is one the run read (the source node's file, and the slot parameter);
    - the option publishes.
  - A release never moves a name back past a run that published it later. Runs are compared parameter by parameter;
    each period only moves forward.
  - **Fills per load.** The missing part reads the load's parts. A fill decision names its load (`source`, `slot`,
    `sha256`) and its repair, and keeps the derived run's keys (`derived.keys`) as evidence. Fills stay off when two
    loads of the same slot hold (ADR 0009 amendment 1 S2).
- **Per source on screen.**
  - Each watched card tells its own story per load.
  - The day line names the sources that pause it ("Paused by auth, edr 06–12").
  - Each held load has its own Decide.
  - A decision about a load is one tap away from every run that carried it.
- **When it ships:** after §1–§6, first on a synthetic security fixture of several sources, one of them loaded four
  times a day.

### 8. Nouns, and the taxi shortcuts removed (h)

- **Nouns.** `ontology.nouns` names what a row is, by source or step id (Q-59):
  `{ "trips": { "one": "trip", "many": "trips" }, "auth": { "one": "sign-in", "many": "sign-ins" } }`.
  - Without one, it is the object type over the source ("zones"), else "rows".
  - `Names` gains `noun(n)`. Every "trips" in news.ts, story.ts, decision.ts, days.ts, viz.ts and main.ts becomes the
    source's noun ("Almost no sign-ins: 981", "Sign-ins fall to ~40/h from 06:00").
  - **Every new word on screen that counts rows goes through `names.noun(n)` (C3).** The decision sheet's and the
    pause line's inputs (`SheetIn` among them) carry `noun`. Until phase 1 is merged, `main.ts` passes `"trips"`. No new
    string writes "trips".
  - A noun is display only. It is kept out of the plan and out of the claim's verdict; the head carries it only as a
    word.
  - A noun is at most two words. Heads are counted again with the tests' longest noun ("endpoint events"). Where that
    would push a head past six words, "usual" is dropped first. In the 45-word decision sheet the noun is said once, in
    the title or the first row, and numbers are bare after it (Q-78).
- **The shortcuts become ontology fields.**
  - A property's `name` template says how a part is named ("Vendor {code}"). It replaces the /vendor/ match.
  - `role: "sender"` says the column names who sent the rows. A part then "sent almost nothing"; otherwise it is
    "{part} almost gone".
  - `after: { of: "tpep_pickup_datetime", minutes: 15 }` says one time column runs behind another. It replaces the
    /drop/ match.
  - A `unit` that is an ISO 4217 code is money, in any currency, not only USD.
  - The weather's place comes from the history's weather block (`place`, which build.py writes as "Manhattan"). There
    are weather findings only when the history has weather.
  - US holidays' short names come from the calendar (`short`).
- **Legacy watches keep the old rules.** A legacy watch keeps today's /vendor/ naming (when the ontology names no
  part) and today's 15 minutes for a column named like a drop-off, so its verdicts don't move. Only the general form
  drops them.
- **The example keeps its heads.** Its ontology declares the vendor's name and role (display, so it stays format 2).
  The drop-off's `after` mark joins it when the example moves to the general form (§13). No taxi head changes:
  "Vendor 1 sent almost nothing" stays in the tests.
- **The hours finding** reads the watch's `time` column in its `zone`, instead of slicing characters 11–13 of the
  text.
  - It finds surges as well as shortfalls ("Burst 02:00–05:00: 4.1× usual"). They are drawn as the 24 bars over their
    ghost, with the excess past a notch, the same way trips beyond usual are drawn (ADR 0008 §6).
  - An hours surge is unusual, or wrong when a bad value carries it.

### 9. The app runs any document (i)

- **What it opens.** The built example; or a document and its data list named in the address (`?flow=…&data=…`, same
  origin); or a document and data list opened from files.
- **The data list** (`loads.json`, format 2) binds each source to its files, each of them in MANIFEST.json as ADR 0006
  §2 requires:

  ```jsonc
  { "format": 2,
    "sources": {
      "trips": { "table": "trips_file", "format": "parquet",
                 "loads": [{ "slot": "2024-01-01", "file": "…", "sha256": "…", "bytes": 1, "rows": 1 }],
                 "donors": [{ "slot": "2023-09-14", "file": "…", "sha256": "…", "bytes": 1, "rows": 1 }] },
      "zones": { "table": "zones_file", "format": "csv", "file": "zones.csv", "columns": [["LocationID", "INTEGER"]] } },
    "histories": { "trips": "history.json" } }
  ```

  - `EXAMPLE_SOURCES` becomes the example's data list, and each table's DDL is made from its binding
    (`pinnedDdl(binding)`).
  - **Donors are listed per source (C8)**, and a donor's table is made from its source's binding: no fixed
    `trips_donor.parquet`. Donors are not loads: the strip doesn't step through them.
  - loads.json format 1 (today's, with its top-level `donors` from the base) still reads, so the app keeps working on
    the data branch as it is until format 2 is published there.
- **A fill step's `time`** must equal its source's watch `time` when the watch names one, and the fill's hours are
  counted in the watch's `zone`, as the measures count parts (C8).
- **Sources are found by id.**
  - `loadSource()` and `weatherSource()` go.
  - `historyOf(id)` returns which watch a card is, or the checks step that counts one (through a fill step, C7), or
    context.
  - `history`, `flowHistory` and `historyPin` become maps by watched source.
  - `claimsFor(day)` tells each watch's claim from that watch's own history.
  - `storyFor(source, slot)` replaces `storyFor(day)`.
- **Every watched card** has its own News, health dot, History tab and lane in the strip. Context sources, such as the
  weather, keep what they have.
- **The loads strip** has one lane per watched source, with days across and each day's cell cut into the source's
  slots. At 390 px three lanes show, and "+2 sources" opens the rest.
- **The header and the tab title** show the worst load's head. When more than one source is watched, the head names
  its source ("auth: Failed 4.5× usual").
- **A watched source with no history file** starts with an empty base. Every period is "Not judged yet · Day 3 of 28"
  until the tail has enough, and nothing holds for want of a history (§1, §6).

### 10. The document: format 3

A document with a `calendar` block, a watch given as an object, or a verdict-changing ontology mark (`bad`,
`newValues`, `after`) is format 3, so an older build refuses it rather than judge it differently. A sign-in flow at
work:

```jsonc
{
  "smaltfl": 3, "id": "signins", "name": "Sign-ins",
  "parameters": [{ "name": "day", "type": "text", "default": null }, { "name": "slot", "type": "text", "default": null }],
  "sources": [{ "id": "auth", "table": "auth_file" }, { "id": "edr", "table": "edr_file" }],
  "steps": [/* checks and outputs, as any flow */],
  "calendar": { "base": "none", "zone": "Europe/London",
                "days": [{ "name": "Patch Tuesday", "weekday": "tue", "between": [8, 14], "around": [0, 1] },
                         { "name": "Month-end", "day": -1 }] },
  "ontology": {
    "nouns": { "auth": { "one": "sign-in", "many": "sign-ins" }, "edr": { "one": "endpoint event", "many": "endpoint events" } },
    "properties": [{ "column": "result", "title": "Result", "description": "How the sign-in ended",
                     "values": { "success": "Signed in", "fail": "Failed", "locked": "Locked out" }, "bad": ["fail", "locked"] },
                   { "column": "country", "title": "Country", "description": "Where it came from", "newValues": "alert" }],
    "objectTypes": [], "linkTypes": [], "actionTypes": [] },
  "publish": {
    "hold": ["checks", "wrong"], "together": false,
    "watch": {
      "auth": { "history": "auth-history.json", "period": "day", "time": "event_time", "pattern": "weekly" },
      "edr":  { "history": "edr-history.json", "period": "slot", "every": "6h", "time": "ts", "pattern": "none", "donor": "nearest" }
    }
  }
}
```

- **A watch given as an object** has these fields, and only these (anything else is refused):
  - `history` (required);
  - `period` (default: `publish.period`);
  - `every` (default `day`);
  - `pattern` (default `weekly`);
  - `donor` (default: from the pattern, §3; C1);
  - `time` (default: no time column, so no hours finding);
  - `zone` (default: the calendar's);
  - `calendar` (default true);
  - `scale` (default `volume`);
  - `holds` (default true; false means told and recorded, but never holding);
  - `count` and `follow` (default: from the ontology, else from the profile).
- **`publish.period`** becomes optional when every watch names its own period.
- **`hold`** may add `unlearned` (§1).
- **`meanwhile` and `until`** stay in `publish` (ADR 0009 amendment 1 S5), flow-wide (C1).
- **A watch that holds** needs `short` or `wrong` in `hold`. A watch with `holds: false` doesn't.
- **A watch given as a file name** stays legal in format 3 and means the legacy settings (§0).
- **A derived document** (a fill's) keeps its original's format, and its plan its original's plan format.

### 11. The plan: plan/2

A plan whose `publish` holds a watch given as an object, or a calendar, or a watched source with a verdict-changing
mark (Q-79), is plan/2. It is hashed as `SHA-256(UTF-8("smaltfl/plan/2\n" + JCS(plan)))` (E13).
- **Its `publish`** is `{ hold, period, together, calendar, watch, meanwhile, until }`, every field filled in with its
  default (C1):
  - `calendar` is the resolved flow calendar, `{ base: "none" | "us/1" | "us-nyc/1", zone, days, windows, dates }`;
  - `watch` is `[[node, WatchPlan], …]`, sorted by node;
  - `meanwhile` (`"last"` by default) and `until` (`"decision"` by default), as ADR 0009 amendment 1 S5 defines them.
- **A `WatchPlan`** holds every judging setting, filled in:
  - `{ history, period, every, pattern, donor, time, zone, calendar, scale, holds, count, follow, bad, newValues, after }`;
  - `donor` is the watch's, or the pattern's default (§3);
  - `bad`, `newValues` and `after` are copied from the ontology's properties that apply to the source (`propertyOf`),
    each as a list of `[column, …]` sorted by column: `bad` as `[column, code, …]` (codes sorted), `newValues` as
    `[column, "alert"]` for each serious column (§4), `after` as `[column, of, minutes]`;
  - a watch given as a file name, in a plan/2, has the legacy settings filled in: `scale` `"fixed"`, `pattern`
    `"weekly"`, `donor` `"weekday"`; and a flow whose watches are all given so, with no calendar block, keeps
    `us-nyc/1` (§0). A flow with a general watch and no calendar block has `none` (Q-58).
- **What it changes.** The flow hash and the plan hash cover these settings; node keys don't, so nothing is rebuilt.
  verify's *flow* check translates the document again and must get the same plan.
- **What stays the same.**
  - A plan with a legacy watch, no calendar and no verdict-changing mark stays plan/1 byte for byte, its `donor`,
    `meanwhile` and `until` present only when the document sets them; a plan with no publish block stays plan/0.
  - An older plugin refuses `smaltflPlan: 2`.

### 12. On screen

ADR 0008's rules apply: shape first, colour third, words budgeted.

- **◌ Not judged yet:** a dashed ring, 14 px, in grey. Dashes mean absent, and here the judgement is what's absent.
  - It never takes a severity's colour.
  - In the strip, a day not judged is its count with no band. A day not run is the opposite: its band and no count
    (ADR 0009 §12). The two can't be confused.
  - **Budget:** an unlearned day, like a calm one, has 16 words at a glance ("Not judged yet · First Thanksgiving here ·
    41,939 trips · Health · 3 not judged").
- **A bad value that surged** is drawn with the part bar, its excess past the notch, under a filled hexagon "!". Its
  one verb is "Open an incident". It keeps the incident day's budget of 60 words.
- **Accept the new level** is a row of the decision sheet, worded and drawn as ADR 0009 amendment 1 S12 says (X6,
  Q-73): the owner's words, "Accept the new level"; the fills' drawings, picked by the cause; the reasons "Planned
  change" and "Source confirmed". Its receipt starts with this ADR's step mark, an SVG line that steps up or down, never
  in a severity colour, beside the fills' lines. The sheet stays within 45 words.
- **Several watched sources:**
  - One lane per source, each day's cell cut into the source's slots, its marks 14 px.
  - The day line has at most 10 words ("Paused by auth, edr 06–12 · readers see Mon 11").
  - Each card keeps ADR 0008's budgets: 60, 45, 16 and 24 words.
- **Values not watched** ("Values not watched: user (2.1M values)") is one line in the Columns tab, never in the
  News.

### 13. The taxi hold vector

| Change | The example as it is (legacy form) | The example in the general form, with its settings |
|---|---|---|
| Not judged (§1) | 21 days go from calm to unlearned; no hold moves (the owner, Q-53) | the same |
| The floor with no range (§1) | 0 days expected (checked in the build) | the same |
| The calendar (§2) | none: `us-nyc/1` | with Election Day: −2022-11-08, −2023-11-07, +2022-12-31 (measured) |
| Echoes: shares not learned from (§5) | not applied | −2023-11-14 (measured) |
| The calendar and echoes together | — | **25 days: −3, +0; `short` keeps its 22** (measured; the owner accepted it, Q-54) |
| Recorded days left out of learning (§5) | none (the vector has no decisions) | the same |
| Re-learning after 14 days (§5) | not applied until accepted | to backtest (the fare change of Dec 19, 2022 narrows January 2023's bands) |
| The relative rule; floors that scale (§4) | fixed | to backtest. Unusual days move; whether a wrong day moves is to measure |
| Bad values (§4) | none marked | none: payment type 4 (Dispute) is not marked bad now (the owner, Q-66) |
| Pattern (§3) | weekly | weekly |
| Nouns and shortcuts (§8) | no head changes (the example declares them) | the same |
| History /3 and measures (§6) | none (each period is byte-equal) | the same |

**What the owner accepted (Q-54, 2026-11-08: "Yes, 25 days"):** the example moves to the general form with `us-nyc/1`
plus Election Day, weekly, fixed floors, the echo fix, and its `donor` in the watch. `wrong` goes from 28 days to 25
and `short` keeps its 22. The fills' held days go 28 → 25 with it, and the days with nothing to fill 11 → 8; no donor
pick moves (Tue Nov 15, 2022 keeps Tue Nov 1, since Nov 8 becomes a calendar day). The backtests for re-learning and
for the floors come back as further, separate acceptances.

### 14. Where the fills and this ADR meet

The fills (ADR 0009 amendment 1) and this ADR are built in parallel. These contracts bind both, and each is written
into the sections it touches above and in the amendment. The same table is in ADR 0009 amendment 1, "Where the two
lanes meet"; a change to one is a change to both.

| # | Contract | Here |
|---|---|---|
| C1 | **Publish and watch fields.** plan/1's `publish` gains `donor`, `meanwhile` and `until` only when the document sets them. In format 3, `donor` is a field of the watch, filled in by plan/2 from the pattern (weekly → `weekday`; none, monthly → `nearest`); `meanwhile` and `until` stay in `publish`. plan/2's `publish` is `{ hold, period, together, calendar, watch, meanwhile, until }`, filled in. The plan/2 vector is computed on this shape before it is pinned (Q-70). | §3, §10, §11, E13 |
| C2 | **Decide options,** in this order: `asis`, `dont`, `fill`, `complete`, `accept`. The fills add `fill` and `complete`; `accept` comes with phase 3. | ADR 0009 amendment 1 S8 |
| C3 | **Nouns.** Every new word on screen that counts rows goes through `names.noun(n)`; `SheetIn` and the pause line's inputs carry `noun`. | §8 |
| C4 | **Claims.** `judgeClaim` is the one check per claim, called by `judgeClaims` and the fills' `judgeDonors`. A derived run's watched-source claim is judged against `from`: its flow hash, its stored measures, the same snapshot. Donor claims are claim/2 under plan/2. | §6 |
| C5 | **What normal is learned from.** One tail leaf per (source, slot), the first time the slot runs; derived runs and re-runs add none (Q-72). `skip` holds periods held and not published as is: not published, waiting, filled, the complete part only. A day published as is, or accepted, is learned from. | §5, §6 |
| C6 | **Accepted levels** live in the record and the claims, never in the document (Q-68): the decide entry's `level`, the claim's `levels`, `NormalRanges`' `breaks`. No `flow` entry, no `normal.breaks`. | §5 |
| C7 | **Through a fill step.** `sourceOf(doc, id)` (document.ts) resolves an input through a fill step; `countedChecks`, the history builder, the app's `historyOf(id)` and `insertAfter` use it. | §6, §9 |
| C8 | **Data and time.** The data branch is published by the session owner's pushes alone; lanes never push. loads.json format 2 lists donors per source, and a donor's table is made from its binding. A fill step's `time` equals its source's watch `time` when the watch names one, counted in the watch's `zone`. | §9 |
| C9 | **Names.** The story state and hold kind for "nothing to compare against" is `unlearned`; `unjudged` stays the integrity hold. The `expected` act is never offered for a bad value, whatever it is labelled (Q-71). | §1, §4 |
| C10 | **The record.** Its kinds stay `run`, `decide`, `release` and `flow`, and log/1 doesn't change. New `about` fields: the fills' run outcome `derived` with `from` and `repair`, decide `repair` and `derived`, release `from`, `repair`, `filled` and `under`; this ADR's run `measures`, decide `level`, and later decide `load`. New store tables: `_smaltfl_repairs` (fills) and `_smaltfl_measures` (here). | Encodings |

**The rulings** where the two designs disagreed (docs/OPEN_QUESTIONS.md has each as a maintainers' question with its
default): where a level is stored (X1, Q-68: the record); who may accept and for how long (X2: the owner answered,
Q-57); where `donor` goes in format 3 (X3, Q-70: the watch); how a derived run's claim is judged (X4, Q-69: against
`from`); what a later file of the same day is (X5, Q-77: its own load when its slot differs); Accept's words (X6, Q-73);
the 14-day re-learning against "pause until accepted" (X7, Q-74); skips from the record in the flow's verdict (X8,
Q-59); the questions' numbers (X9: this ADR keeps Q-53 to Q-59, the fills take Q-60 on); Accept described once (X10,
Q-76).

**The order they are built in.** This ADR's phase 1 merges first; then the fills; then phases 2, 3 (with Accept, built
once on both) and 4. The fills wait once, before their screens, for phase 1; phase 2 waits once, before its data and
app work, for the fills.

## Encodings

**Unchanged:** `key/0`, `plan/0`, `plan/1`, `flow/1`, `dataset/0`, `run/1`, `log/1`, `checkpoint/0`, `edit/0`,
`policies/0`, `ontology/0`, `card-key/0`. No node key changes, and nothing is rebuilt. The vectors below were computed
with the repository's `hashOf`, `canonicalJSON`, `leafHash` and `rootOf`, on the literal values shown. The values
measured from real files are pinned in `test/measures.test.ts` when they are built.

- **E11 measures/0.** One load's numbers: `hash = SHA-256(UTF-8("smaltfl/measures/0\n" + JCS(m)))`.
  - `m` is `{ smaltflMeasures: 0, source, slot, every, file, snapshot, checks: { step, rules }, columns, types, kinds,
    rows, dropped, failed, present, p50, quantiles, sample, parts, values, pairs }`.
  - `file` is the E1 sha256 of the load's bytes, and `snapshot` is its `dataset/0` content hash.
  - `values` and `pairs` map a column (or `a|b`) to `[[value as JSON, rows], …]`, sorted by value text.
  - `parts` are the rows in each part of the slot.
  - **Vectors (test/measures.test.ts):** the sign-in literal for `auth`, `every: day`, columns `event_time`, `result`,
    rows 1000 with 45 failed and 5 locked on 2024-03-10, 1200/50/6 on 03-11, and 1500/400/30 on 03-12 (as written out
    in the design's probe, `vectors.ts`) hash to `c695d293…c3ec`, `f26be0d3…c4c6` and `aa04377e…975e`. The first one's
    canonical JSON is 728 bytes.
- **E12 tail/0.** A source's appended measures, as a tree.
  - A leaf is `SHA-256(0x00 ‖ UTF-8("smaltfl/measures/0\n" + JCS(m)))`, and a node `SHA-256(0x01 ‖ left ‖ right)`. The
    tree and its proofs are as RFC 9162 §2.1 defines them, as for log/1.
  - A claim names a tail by `{ size, root }`.
  - **Vectors:** the three literals above have the leaves `cfd93490…76be`, `8ae8255a…2290` and `80fe7084…cde8`. The
    root of size 1 is the first leaf; the root of size 3 is
    `0844dac548759a1d6b29af766a8ba1b4dc56536034118a6944318669913ee3e6`.
- **E13 plan/2.** As in §11.
  - **Vector (test/plan.test.ts):** E10's document, written in the general form, is
    `"smaltfl": 3, "calendar": { "base": "none" }` with
    `"publish": { "hold": ["wrong","checks"], "period": "day", "watch": { "trips": { "history": "history.json", "donor": "nearest" } } }`,
    with `day` = `2023-09-21`. Its plan is E10's nodes, outputs and parameters with the `publish` of §11, filled in:
    `meanwhile` `"last"`, `until` `"decision"`, the watch's `pattern` `"weekly"`, `scale` `"volume"`, `donor`
    `"nearest"` as written, and `bad`, `newValues` and `after` `[]`:
    `"publish":{"calendar":{"base":"none","dates":[],"days":[],"windows":[],"zone":"UTC"},"hold":["checks","wrong"],"meanwhile":"last","period":"day","together":true,"until":"decision","watch":[[0,{"after":[],"bad":[],"calendar":true,"count":null,"donor":"nearest","every":"day","follow":null,"history":"history.json","holds":true,"newValues":[],"pattern":"weekly","period":"day","scale":"volume","time":null,"zone":null}]]},"smaltflPlan":2`.
    - Its flow hash is `bed47b2e3bece5da61233c8a069710f7cd5c8959d9a4926e99dadc8d9783b56a`.
    - Its plan/2 hash is `144ec790487930eb6d396769aa15e3e961de54e8133491af9e4d7742259d393f` (checked with `sha256sum` on
      `smaltfl/plan/2\n` and the plan's canonical JSON).
  - The first build of plan/2 refuses `pattern: "none"` (phase 1 judges the weekly pattern only), so the vector names its
    donor rather than taking it from that pattern. The design's draft values (flow `fdeda350…bd59`, plan/2
    `79671d10…f35f`) were computed on a `publish` without `meanwhile`, `until`, `donor` and `newValues`, and are not the
    vector.
  - The same document without the general form reproduces E10's plan/1 hash, `fc700fdf…8fd4`.
- **claim/2** is data in log/1 and `_smaltfl_holds`, not a hash encoding:
  `{ by: "story", v: 2, source, slot, every, state, below, head, build, flow, history: { base, tail }, measured, rows, skip, levels }`.
  - `state` adds `unlearned`. A claim/1 can say it too from phase 1, since a plugin of the same build reads it; it
    never holds unless `hold` lists `unlearned`.
  - An older plugin refuses `v: 2`, and the state `unlearned`, as not judged. That is safe, since not judged holds.
- **smaltfl-history/3** is a file format. Its digest is E1, unchanged.
- **Document format 3** is not a new hash: flow/1 hashes the document as before.
- **New store table** (not hashed): `_smaltfl_measures(run, node, slot, hash, measures, settings)`.
- **New record data** (log/1 doesn't change):
  - a decide entry's `level: { source, from, metrics }` (Accept, ADR 0009 amendment 1 S6);
  - with several watched sources, a decide entry's `load: { source, slot, sha256 }` in place of `outputs`;
  - a run entry's `measures`.

## Consequences

- A day with nothing to compare against says so, on any dataset. No taxi day is told "Normal for Thanksgiving" any
  more without being judged, and none pauses for it.
- A flow at work can watch several sources:
  - each with its own calendar days, pattern and cadence;
  - its bad values and serious columns marked;
  - without anyone rebuilding a history offline.

  A credential-stuffing burst is something wrong, and its verb is "Open an incident".
- A deliberate change pauses once. Accepting it re-learns from that day, where today it can stay wrong for three
  weeks.
- The claim checks the whole load's numbers, not just its row count. verify and the audit can tell every verdict
  again.
- The example's vector moves, as the owner accepted: from 28 days to 25, with `short` unchanged.
- **More to build and keep:**
  - Two forms of watch (legacy and general) live side by side.
  - The plugin measures each watched load in the engine (a cost the bench must show is small next to a run).
  - Decisions about loads are a second kind of decision, used only with more than one watched source.
- **Left for later, each with its own decision:**
  - a slow-drift finding (the last four weeks against 3 to 12 months ago);
  - columns of very many values (users, IPs) beyond being followed for new ones;
  - a holiday fallback for shares when last year can't judge (a holiday's mix differs from ordinary days', so it needs
    its own backtest);
  - loads that arrive irregularly, and loads that are due and missing;
  - outputs that accumulate across slots or days;
  - number formats for other locales;
  - more built-in regions.

## Open questions

Each is recorded in docs/OPEN_QUESTIONS.md.

**Answered by the owner** (2026-11-08, the question prompt):
- **Q-53:** a day with nothing to compare against is published, marked "Not judged yet"; a day with under a tenth of
  its recent rows still pauses (§1).
- **Q-54:** the taxi example moves to the general form, with Election Day and the echo fix: 25 paused days (§13).
- **Q-55:** when one file of a several-times-a-day source is off, only that file's slot pauses (§7).
- **Q-56:** a serious column alerts on any value never seen before (§4).
- **Q-57:** the owner may accept a new level, and a role only if its rule lists `accept`; one acceptance covers the
  following days while the numbers stay at the new level (ADR 0009 amendment 1 S6).
- **Q-58:** a new flow's calendar is none unless chosen (§2).
- **Q-66:** the taxi example's disputes are not marked bad now (§13).

**For the maintainers** (open, each with the default the build starts on):
- **Q-59:** nouns in `ontology.nouns`; built-in calendars versioned in the plan (`us-nyc/1`); the legacy floors scaled
  only by a separate acceptance after the backtest; Q-49's last part: a day published as is, or accepted, is learned
  from, and held days aren't.
- **Q-68** (levels in the record), **Q-69** (a derived run's claim), **Q-70** (`donor` in the watch; plan/2's shape),
  **Q-71** (`unlearned`; `derived`), **Q-72** (tail leaves), **Q-73** (Accept's words), **Q-74** (no automatic
  re-learning after an unaccepted hold), **Q-75** (who publishes the data branch), **Q-76** (Accept described once),
  **Q-77** (a later file of the same day), **Q-78** (two-word nouns in the sheet), **Q-79** (verdict-changing marks make
  plan/2), **Q-80** (legacy watches and `skip`).
