# Handoff: where smaltfl stands (2026-11-09)

This is the state of the work when the project moved to a new repository. Read it with [CLAUDE.md](../CLAUDE.md) (layout
and rules), [docs/adr/](adr/README.md) (the decisions) and [docs/OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) (the owner's
answers and what is still open).

## Where everything is

| What | Where |
|---|---|
| The code | `beepboopbop64/smaltfl`, branch `claude/elegant-knuth-r8364a` (the repository's default branch), all pushed. No PR is open. |
| stenhoor's initial commit | merged in (remote `stenhoor/main`); the move to `stenhoor/smaltfl` (ADR 0007) was blocked by GitHub access, see "Moving the repository" |
| The data | the `data` branch: tip `0ca4dd1` (history format `smaltfl-history/3`, 31 days of January 2024, three incident episodes, 11 donor days), on top of `6e387dd`; built by `.github/workflows/data.yml` |
| The app, published | a private claude.ai artifact (version 22, built from `6be5755`): it doesn't have the last three commits (round 3 below). The notebook form (ADR 0011, slice 4) is published separately: https://claude.ai/artifact/3xkiHJnRGK4viZkT4y5k6u, built from the fork's `claude/gallant-mendel-uckiwr` on the data branch's loads; the sign-ins with the demo's three days (ADR 0012) as a second artifact (https://claude.ai/artifact/YNfh3yNapW9pv4HCtoWdCu), built with `--flow examples/security-signins/flow.json --out dist/app-signins`; the controls posture (ADR 0013) as a third, https://claude.ai/artifact/EaLvZcxsnu5ZNP5kNNCahH, built with `--flow examples/controls/flow.json --out dist/app-controls` |
| Browser checks and judging tools | [tools/](../tools/README.md) (added for this handoff; they lived in a session scratch folder before) |

## What is built

Each piece has its ADR, tests, and a line in CLAUDE.md's layout.

- **The core, the runtime and integrity** (ADR 0004, 0006): flow documents and plans, keys, reuse, expectations, signed
  run/1 manifests, verify's levels, the hash-chained record (RFC 9162), audit bags and their offline check.
- **The day's news, drawn** (ADR 0008): one cause per day, told with a head of six words or fewer, one visual and word
  budgets enforced by tests. At phone size the Sep 22, 2023 News tab went from 3,217 words to about 60.
- **A day that is off is paused, not published** (ADR 0009): the `publish` block (format 2, plan/1), holds from the
  checks and the story's claim, the decision sheet (publish as is, keep the last good day, don't publish, until a day
  publishes), releases, verify's *held* check, the audit.
- **Filling a paused day** (ADR 0009 amendment 1): the `fill` step and `filled_from`, donors (same weekday or the
  nearest good day before or after), the part that arrived, withdrawing a fill (the owner, Q-61), versions of a day,
  all recorded and audited.
- **Any dataset** (ADR 0010, phases 1–4):
  - format 3 and plan/2;
  - calendars per flow;
  - patterns (weekly, none, monthly);
  - nouns and marks from the ontology;
  - "Not judged yet";
  - bad values that always alert;
  - a general history builder, and claim/2 from each load's own measures;
  - the app running any flow, with a generated sign-in log as the second example;
  - several sources and slots;
  - Accept the new level.

  The taxi example is format 3 with 25 held days (Q-54).
- **Checks nobody wrote** (ADR 0013, 2026-11-09): a history keeps each pair's cells day by day; the combination
  judge (a pair's log odds ratio against its own history, one finding a pair) and the forest judge (the day against
  the days before, by the isolation forest); a watch on a published step, its claim told in the engine; the history
  builder's step mode; the app on several daily sources, following the dataset the list names; the controls example
  (six controls over 400 applications, five planted days) through the engine (`test/controls.test.ts`) and in the
  app. What the planted days read as is ADR 0013 §6's table. Open: Q-104 to Q-109.
- **Round-3 fixes, partly done** (the last three commits, `f76107b`, `791d07b` and `e42d9ec`):
  - Hour-fall days are told as they were (below).
  - The pause is carried through every view.
  - Closed data is kept from viewers who can't read it, and only someone who may decide can run or publish.

## How to check it

```sh
npm ci && npm run deps                      # then the smaltdb build pinned in packed.json
git fetch origin data --depth 1             # the real data; without it the app builds on the XS fixtures
npm run check                               # typecheck + 813 tests (1 skipped)
npm run build                               # declarations; NOTE: wipes dist/, so build the app again after it
npm run build:app                           # dist/app from the data branch; the bundles are named by content (app.<hash>.js), so a
                                            # browser never serves a stale build under the old name (bundles.json says which)
```

Results on 2026-11-09, at `e42d9ec` on data `0ca4dd1`:
- **Tests:** 772 passed and 1 skipped with `npx vitest run --testTimeout=30000`.
- **The 5-second default:** under a busy machine, `test/fill-general.test.ts` (and a few others) can time out. They pass
  alone or with the longer timeout; they aren't wrong results.
- **Browser suites:** episode 20/20, integrity 13/13, and the pause stops report no problems (see [tools/](../tools/README.md)).
- **Real-history tests** (`hold-real`, `story-real`, `fill-real`, `backtest-real`) need `dist/app/data/history.json`.
  They skip without it.

## What is not done

Parked behind the notebook surface by the maintainer's decision of 2026-11-09 (Q-87, ADR 0011 §9). In priority order:

1. **The owner's answer of 2026-11-09 isn't built yet** (Q-86): a deliberate (lasting) change that nobody accepts must
   **keep pausing until accepted**.
   - **Today's code** pauses only its first day, then tells it as notes (ADR 0010 §15, "A deliberate change pauses once").
   - **Where to change it:** `fill.ts` (`acceptable`, `levelMetrics`), the lowering in `news.ts` (`quiet`/`lasting`) and
     `hold.ts` (`levelsOf`, `levelFor`).
   - **Expected result:** the taxi hold vector grows from 25 to about 29–31 days. The owner was told this and accepted it.
     Re-measure it, and move `test/hold-real.test.ts`, ADR 0010 §13/§15 and the security fixture's migration on purpose.
2. **The rest of the round-3 findings.** The judges ranked 37; these are left:
   - **Cards that state numbers:**
     - the Results weather card states false findings, and its °C line is drawn on the rain axis (#5, #24);
     - Jan 7's snow still reads as the cause, and its filled "Mark as expected" button invites action (#8);
     - the gate row invites "more bad rows than usual" and hides how close passing checks came (#11);
     - extra trips above usual are drawn in ghost grey (#13);
     - very wide bands aren't said (#25);
     - suggested checks are computed from a broken day (#26);
     - numbers disagree inside cards, and rounding varies (#29);
     - some charts have no scale (#30);
     - side figures pull the eye (#32).
   - **Calm days and keys:**
     - severity is shown by colour alone, and bands are faint in greyscale, deuteranopia and dark mode (#14);
     - "not run" days read as outages (#16);
     - calm days look flagged by hollow circles, "N notes" and a HEALTH label that comes and goes (#17, #18);
     - Flex Fare, Vendor 1 and output names aren't explained (#22);
     - ‖ ⚑ ☒ ✓ and later tiles have no keys (#31);
     - wording and 390-px layout are rough (#34, #35);
     - History fills in slowly (#36);
     - what the old view had is one tap away at most (#27).
   - **Partly done in round 3:**
     - the owner's "Held | Published" toggle and the About facts of a held run (#2, #4);
     - two words skipped for the word budget (#10, #15);
     - #12, #19 and #20 are partial;
     - the privacy commit (`e42d9ec`, #6, #7, #21) was made, but its report wasn't collected: check those three against it.
3. **Re-test.**
   - **What:** after the fixes, run a judge round (round 4) with the corrected answer key (see "How the views were
     tested"). It never ran on the last three commits.
   - **The controls example** (ADR 0013) hasn't had a two-minute round: its five planted days
     (`tools/judges/two-minute.md`, with the controls app) are the next answer key. Known rough edges to judge: the
     posture cell's amount line (400 apps against 400–400, a 10k scale) says nothing and should give way; the canvas
     places the inventory above the controls and the notebook boxes off screen on a phone (Fit brings them in); a
     control's News on a held day shows the engine's verdict over "Nothing out of the ordinary" from its own rows.
     Fixed on the maintainer's first look (2026-11-09): the strip's mark word spilt into the next day's cell (it now
     drops to its own line), and the day's headline led with the posture's symptom ("Patching blank") while the cause
     was the patching file upstream: a held load upstream of the judged dataset now leads the status line and the
     brief, and its card is drawn as the cause with the wrong mark.
   - **The sign-ins' pair.** Its shipped history predates the pair counts: rebuild the sign-ins app and check that
     Wed Mar 20, 2024 now names "result locked with method api_key" (ADR 0012's open point).
   - **Hour-fall days:** check them with fresh five-second readers. The new head ("Only Flex Fare after 13:00") and the
     parts chart replaced the trickle chart, and haven't been judged yet.
4. **Not built, by decision or left for later** (each recorded in its ADR):
   - the hours finding doesn't find surges, only shortfalls (ADR 0010 §8, §15);
   - slice 3 of the pause: re-run when a corrected file arrives, a corrected file replacing a fill on its own (Q-62),
     and a refused file as a pause;
   - holds measured in the engine rather than claimed by the page (ADR 0009, "left for later");
   - a durable engine, notifications, and decisions by more than one person;
   - Accept on slots shorter than a day (Q-84).
5. **Maintainers' open questions:** Q-47 to Q-52, Q-59, Q-65, Q-68 to Q-85, each with the default the code is built on.

## The decisions, and where they are written

- **The owner's answers:** the owner (beepboopbop64) answered a series of questions on 2026-11-08 and 2026-11-09, through
  the question prompt. Each is in `docs/OPEN_QUESTIONS.md` in their words, with the ADR that builds it.
- **Where they changed the design:**
  - a published fill may be withdrawn (Q-61);
  - a day with nothing to compare against publishes, marked (Q-53);
  - new flows start with no calendar (Q-58);
  - the taxi example holds 25 days (Q-54);
  - deliberate changes pause until accepted (Q-57; Q-86 is the strict reading, not built yet).
- **Hashes and encodings** have ADRs and test vectors: plan/1 (ADR 0009 E10), plan/2 (ADR 0010 E13), measures/0,
  tail/0. A change to any of them needs a new tag version and an ADR (CLAUDE.md).

### The two-minute test, round 1 (2026-11-09)

Both readers got every day right from the screen alone (tools/judges/two-minute.md; the readers' reports in the session
of that day). What they could not tell, or found confusing, in the order it should be fixed:

1. "trips_valid dropped 10% of rows (limit 10%)" beside "Checks passed: 9.55% dropped": the brief rounded where the
   checks' line didn't (round 3, #29). **Fixed the same day:** the brief says the checks' figure.
2. "Flex Fare held to its usual count" under Cause read as blaming the part that survived. **Fixed:** on an hour-fall
   day with a kept part the fact is "Everything but Flex Fare stopped at 13:00; Flex Fare kept arriving (4.7k today,
   usually 2.8k–5.4k)", and the part gets no fact of its own; the trickle rate ("still ~330/h") stays on the chart.
3. The app proposed *Fill from Tue 1* on day 2 of Vendor 1's outage; the engineer wanted *Without Vendor 1*. **Fixed:**
   a sender that stopped, for the second day running, proposes the part that arrived first.
4. "Paused by trips" (what paused what?), and "Day 2 · ~65k short" beside "−25%" (short over the episode, the day's
   own change): the pause row's and the episode chip's words (ADR 0009 §12, ADR 0008 §6) need a reader who knows them.
5. Who "Flex Fare" is: the gloss is a tap on the head, which a screenshot can't show; the brief's fact could carry the
   ontology's meaning once.
6. The day picker shows no year; the week strip's "not run" days (the days this browser hasn't run) read as outages
   on a calm day (round 3, #16); "8 notes" on a calm day (#17).
7. The Amount health cell not flagged on a day 65% short (the hours are the cause; the amount follows): say so, or
   mark it.
8. The folded value changes ("Extras $2.50 0.01%, usual 12–13%") read as a second problem to both readers: they are
   the arithmetic of the cutoff, and the fold's head should say so.
9. What "marked" means for readers, and whether a decision runs on tapping Decide: a line in the fix's option.

## A correction worth knowing: hour-fall days

On Thu Sep 21, 2023 and Sat Sep 17, 2022 the trips by hour fall about 95% at 13:00 and 15:00. Three rounds of judges read
the chart as "the feed was cut off", which the answer key called a false fact.

The day files show the judges were mostly right:
- **Sep 21:** every trip but Flex Fare (payment type 0) stopped by 13:06; 37 others came in the rest of the day.
- **Sep 17, 2022:** none came after 15:00.
- **Flex Fare** kept arriving, about 150–390 an hour.

The counts are in [tools/judges/hour-fall-truth.md](../tools/judges/hour-fall-truth.md). The story now names the part
that kept arriving, and the answer key in `tools/judges/judge-round.workflow.js` is corrected.

## How the views were tested

The visual-first views were judged in rounds by agents reading phone-size screenshots of the built app on real days:
- **Five-second glances:** an on-call engineer and a newcomer.
- **Masked text:** state and shape read from the visuals alone.
- **Detail:** ten questions.
- **Reconstruction:** each episode told back.
- **False alarms:** the calm days.
- **Honesty:** numbers against the data.
- **Colour:** greyscale and deuteranopia.
- **Old versus new.**
- **The decision sheet.**
- **An adversarial explorer:** drives the app itself.

A grader merged the reports into a ranked fix list, and a fix workflow worked through it in clusters.

| Round (build) | Glance | Masked | Detail | False alarms | Fixes ranked |
|---|---|---|---|---|---|
| 1 (2026-11-08) | 21/26 | 24/24 | 10/10 | — | 32 |
| 2 (pause added) | 19/26 | 25/26 | 9/10 | 2/4 | 43 |
| 3 | 21/26 | state 26/26, shape 19/26 | 10/10 | 4/4 | 37 |
| Two-minute test 1 (ADR 0012 §7, build `00a29d6`): the brief in the input's News, four days, two readers (an on-call engineer, a newcomer), graded on the day and what happened, the number or time, the impact, a fix the app offers, nothing false | 40/40 | | | | 9 below |

In round 3, all five glance misses were hour-fall readings (corrected above) or Jan 7's snow read as the cause.

The tools are in [tools/](../tools/README.md):
- **Browser tools:** `tour.cjs` captures screens and checks expectations; there are the two suites and the stop sets.
- **Workflow scripts:** the judge round and the fix round, run with Claude Code's Workflow tool.

## Moving the repository

> **Done on 2026-11-09** (ADR 0011 §9): `beepboopbop64/smaltfl_fork`, a fork of `stenhoor/smaltfl`, has the code on
> `main` (a fast-forward to `5bdb1b4`: Steve's initial commit is the history's root) and the `data` branch at `0ca4dd1`.
> The pull request to `stenhoor/smaltfl` is opened from the fork. What follows is the account as it was written.

- **What has to move:**
  - **The code branch:** `claude/elegant-knuth-r8364a` has the full history.
  - **The data branch with its history:** runs and audit bags name the data commit they read, so the branch's commits
    must stay fetchable. `data.yml` now adds each build on top of the last, with no force push.
- **The workflow** needs `contents: write`. It runs on any push that touches `scripts/data/**` or the workflow itself.
  Add `[skip ci]` to a commit message to skip it.
- **Two older data commits** were dropped by force pushes before that change:
  - `b7da163` is the one runs and audit bags of 2026-11-06/07 name;
  - `f2c12f85` is older.

  GitHub may still serve them by hash. To keep `b7da163`, push a tag for it from a machine with push rights:
  `git push origin b7da16355b12bbbbd07d37de2de295ee60fed34a:refs/tags/data-b7da163`. A session's permission check
  blocked this.
- **ADR 0007** recorded a move to `stenhoor/smaltfl`. A push there failed with 403 because the Claude GitHub App wasn't
  installed on that repository. If the new home is different, amend ADR 0007.
- **Cloud sessions** can't reach the TLC or Open-Meteo hosts, so the data is only ever built by the workflow on a
  GitHub runner.
