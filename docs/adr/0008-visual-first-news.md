# ADR 0008: The day's news, drawn

- **Status:** accepted
- **Date:** 2026-11-07
- **Builds on:** the news and normal ranges (src/core/news.ts, src/core/normal.ts; docs/SCENARIO.md §8), ADR 0006 §9
  (the integrity seal kept apart from the health marks)

## Context

The owner: "It feels just a little bit wordy … I want it to be immediately obvious to the user through visuals and not
like paragraphs of text. If we have to explain something by a paragraph of text, we're not doing a very good job
visually. The user should be able to understand things with a visual, maybe one or two sentences, and if they need
detailed explanation, that's when they'd have to interact with the site, like clicking something. And even in those
detailed sections, I really want to rely more on the visual."

Measured at phone size (390 px): the News tab for Fri Sep 22, 2023 was 3,217 words, 59 paragraphs over 25 words and
32 charts: one alert and 31 notes, each a card with a title, two or three sentences, a four-week sparkline, the same
40-word explanation of the band under every chart (37% of the words), and four to six buttons (148 on the screen). A
calm day was 558 words. Thu Sep 21's most important finding, the hour the trips fall, had no chart at all. Nov 15,
2022 led with "Extras $2.50 on 0.01% of trips" and never named Vendor 1 at the top.

Research (six angles, each checked against its sources: data-observability products, profiling tools, visualization
research, automated-insight interfaces, glanceable and mobile design, and a visual for each kind of finding), audits
of every screen at phone size, and a map of the code and the data led to a brief, three competing designs drawn as
phone mockups on the real days, and judges reading them in five seconds, with the words masked, and in detail.

The history also showed the incidents differently from how the news told them. On Fri Sep 22, 2023, 4,613 of the
4,633 trips were Flex Fare trips (payment type 0, five fields blank), and a Friday usually brings about that many: the
Flex Fare trips arrived as usual and every other trip almost stopped (20 where about 110,000 are usual). The checks
dropped 46% of the day's rows, past their 10% limit, but 2,116 rows is fewer than a usual Friday drops: the share
passed the limit because the kept rows were missing, not because bad rows came. On Nov 15, 2022 vendor 1 sent 3 trips
where about 35,000 are usual, and everything else held.

## Decision

1. **A day's news is a story** (src/core/story.ts, pure and tested): one cause, told as a population or a time, and
   every finding sorted by what the cause explains. The cause, in this order: a refused file; the hour the trips fall
   (hours); a split, the part of the trips with one coded value that held while everything else moved, or that
   vanished or surged while everything else held; an amount with no part to blame; a held gate; else the first finding
   that stands alone. The story is computed per viewer (the columns their policy removes are left out of findings,
   splits and predictions), and every summary reads it: the News tab, the canvas's health dots, the loads strip, the
   tab badge and the header.

2. **A split** is told when one side is within two thirds to one and a half of its usual count and the other is off by
   twice or more, the moved side carries at least 40% of the day's change and 200 trips, and the named side is the
   smaller one and not a blank, so the head names a population ("Flex Fare", "Vendor 1"), never its symptom ("Stored
   and forwarded N"). It is considered on days with a volume finding or two findings of something wrong or unusual
   among the values. Its usual count is the one it was judged on (the value's usual share of the trips a day like it
   has). A split states composition, not a reason: never "because" or "caused by". A value told together with the
   fields blank on its rows (payment type 0 with five fields blank: the Flex Fare trips) is that population: when
   nothing else is the cause and everything else kept to its usual count, it is the day's cause, headed by its share
   ("More Flex Fare trips: 5.3%", its range on the visual), and what it predicts follows from it (Mon Sep 18, 2023's
   "Stored and forwarded N: 94%" is those trips going blank). The split's twice-apart test isn't asked again: the
   finding's own range has judged the part.

3. **Four tiers.** Absorbed: it restates the cause (the amount, the split's own column, the fields blank on its rows).
   Follows: the cause predicts its count (the held part at its usual mix, the rest scaled to what arrived, by the
   history's long-run counts of the two values together, within three sampling errors and a typical miss); a time's
   quantile the day's trips by hour predict; the rows the checks dropped, at no more than a day like it drops. Same
   day: it can't be tested or the prediction missed, but it is no bigger than what the cause moved. Standalone:
   anything else. New values, new pairs, schema changes, integrity and the gate never fold. A folded finding is told
   as a note, with its severity before folding kept.

4. **The gate** is drawn as the share the checks dropped against their limit, and under it the rows they dropped
   against the rows a day like it drops, so a share past its limit because the kept rows went missing reads
   differently from one past it because bad rows came. On such a day the verb is "Tell the source", not "Add a check".
   New count metrics (`count`, `droppedRows`, `ruleRows`, scale `count`) give those rows their usual ranges; metrics are
   not hashed, so no encoding changes. A gate within one point below its limit is drawn too ("near"), and a share is
   never printed equal to the limit it passed or missed. Each bar says what it counts ("46% of arrived rows dropped",
   "2,116 rows dropped"); the limit is a tall solid tick and the share's end a pointer (‖ only ever means held). Within
   two points of the limit the share is drawn again on a printed zoom (0–20% for a 10% limit) and its margin said to
   the share's own decimals ("10.45% … 0.45 pt over"); on the full bar its end sits 3 px clear of the tick on its side.

5. **Words.** A head is at most six words and carries the number or the time ("Only Flex Fare records arrived", "Trips
   fall 95% from 13:00", "Vendor 1 sent almost nothing", "Normal for MLK Day"); a finding's title at most eight, with
   its measured number and value names ("Payment type Credit card: 0.2% (usually 75–80%)"), and as a head it leaves its
   "(usually …)" to the visual under it when six words won't hold it; its detail at most one sentence of twenty words,
   shown only on tap, every word of it from the figures with a tolerance ("as usual" only within 5% of usual and inside
   its range, "within its usual range" further off, "almost stopped" only under a twentieth of usual on a day with no
   hour the trips fall, which is said as a fall from its hour). A share outside its range is printed with the decimals that keep it from reading
   as the range's edge. The method (the band, its weights, typical misses, the denominators) is written once, behind
   (i). Banned at a glance: "because", "caused by", "feed stopped", "disappeared", "The band". Budgets: an incident day
   60 words at a glance, an unusual one 45, a calm one 16, a day back to normal 24.

6. **One cause card.** The head, one chip (the episode's day, "Day 2 · since Thu 13:00", or "Back to normal"'s "after
   Thu–Sun · only Flex Fare", which names the episode, with one line under it saying whether anything is left to do:
   "Nothing to do · Thu published short, Fri–Sun held", a held load being never published and nothing waiting on a
   person to release it; never the weather, §11), the day's count on a line with its usual range (the
   amount line, under the head on every day, carrying the day's own change, "−65%", when the count is outside its
   range and the head doesn't say it), one visual chosen by the cause (the part and the rest on one bar at one scale,
   today's ink over a dashed usual, so a part that held and a rest that stopped read at their real sizes, each labelled
   "10,518 · usual ~4.5k" so it can't read as a fraction, trips beyond usual an outlined box past a notch; 24 hour bars
   over a ghost of a usual day, the short hours' trips dark and never under 3 px so a trickle reads as present and low,
   the trips missing one wash with a dashed edge, labelled "still ~330/h" and "~77k missing"; a strip of days each with
   its own range, four weeks on an amount day and the week on a calm one, an episode's days marked), the gate when it
   held, came near, or the day had something wrong, what it reaches ("Outputs not published", "Outputs built from a short day", never "published" alone; §10), the folded findings as counted rows ("16
   changes this explains", with what they are in words: "shares · values gone · times"; "12 more this day" under it,
   "12 more changes this day" alone) that open in place into compact rows, a column's together, three and then "Show
   all", each today against its usual, and one verb with the others behind ⋯. The health row (§11) sits in the card,
   after its visuals and before the gate. Then at most two more stories, and counted rows for the rest and the notes,
   each row carrying the mark its findings carry in the health row. A tap opens a sheet that is visual too: a waterfall from a usual day to this one (a long name wraps), the
   part's own days (its axis printed, each day's tick coloured only when outside that day's range, and, where its count
   has no range of its own, the range its split is judged on: New Year's Day 2024's Flex Fare at 2.3k–8.6k), its
   column's composition usual and today (the part labelled, over the bar when it's narrow, a vendor named beside its
   code, "Vendor 1 · Creative Mobile", as the hero bar names it too; a value gone today takes no width and is named
   under its bar), the split in one sentence; the episode's hours, its readout first saying
   the fall as the head does ("Thu from 13:00: 3,679 trips · usual ~80k (−95%)") and its shortfall an estimate with
   its bound ("~375k fewer (≥270k)"), never the bound alone; the checks rule by rule against their usual rows, on one
   count scale over an incident's days so far, and the outputs the held run didn't publish. Numbers that sit beside a
   difference are rounded finely enough to subtract ("~68.5k" beside "+2k"); a waterfall's labels share one place,
   the coarsest at which they add up as read and each is within 5% of its count ("119k −77k −26 → 42k"), else whole
   numbers ("114,913 −110,137 −143 → 4,633").

7. **Marks** carry severity by shape and fill first and colour third (the tokens' hues are too close in greyscale):
   something wrong is a filled hexagon with "!", unusual an outlined triangle on a wash, a note a small dot, ok no mark,
   held ‖, explained ↳, marked as expected ✓. Folded findings keep their shape in grey. Counts start at zero; shares sit
   on 0–100% or a printed zoom; each day draws its own range; usual is a light ghost behind today's ink, its edge 3:1
   against the card in both themes (tracks and control borders too; hairlines 1.8:1), never thinner than today's mark
   and 4 px more, grown away from a value outside it so the gap stays true. A strip of days carries a one-line key
   where it is first shown ("usual", "actual"; counted in the glance budget). Dashes mean absent and nothing else: a
   limit is a solid tick, a guess a lighter solid line, a grouped card a tinted border, a link a solid hairline. Marks in
   tabs and strips are 14 px; a mark for a number that isn't zero is never under 3 px.

8. **A share or a level is told only a typical miss past its range's edge** (counts from the edge), so a number hugging
   the edge isn't news. Over Jan 2023 to Jan 2024 the days are 6 something wrong (as before), 27 unusual (33 before),
   125 with notes only and 238 calm (and 2 back to normal).

9. **A change that has lasted** stays a note, and its first day is no longer said in words: the current rule judges the
   days before against today's range and claims starts that aren't ("Since Nov 3" for vendor 1, who stopped on Mon Nov
   14). Its chart shows when it began until that rule is done again. The day's trips are judged the right way: a rise or
   fall is told as a note, unless it is something wrong, when four of the seven days before were outside their own
   ranges the same way, and the day is headed "Busier than usual for days" (or "Quieter"), never "A normal Wednesday"
   beside a count outside its range. The weeks after Labor Day 2022 were the case (no last year in the history to learn
   the season from: Sep 7–16 all 11–21% above weeks of August; Sep 14–16 2023, with last year to go by, were inside
   their ranges): Sep 11–16, 2022 become notes, Sep 7–10 stay unusual. Over Jan 2023 to Jan 2024 no day changes; over
   2022 to Jan 2024, 8 days go from unusual to notes (those six and Jan 10 and 13, 2022, weeks of fewer trips).

10. **A day shows that day** (src/core/days.ts). Loads arrive one a day, as a feed brings them, and the flow publishes
    only a run that passes, so after a held or refused run its outputs keep the last day that passed. Every view reads
    one run: the viewed day's own, else the newest run of the latest day before it that passed in this visit, never a
    later day's (stepping to Tue 26 and back to Sat 23 shows Thu 21's rows, not Tue 26's; a day reached straight from
    the episode's first shows that first day, said so). The held line says what stopped the run and what the outputs
    keep ("‖ Held at trips_valid · outputs keep Thu 21"); a panel whose rows are another day's carries that day as a
    full-width hatched bar ("Rows from Thu Sep 21 · the last day that passed"), under the day's own figures where a
    panel has both (the gate, then the last day's dropped rows), and the day's marks and badges are never put beside
    those rows. A step after the one that held says "not built today", hatched, with no dot or seal from another day.
    Nothing after the viewed day is drawn as known: the episode's hours run from its first day to the viewed one (Sep 21
    shows Thu, Sep 22 Thu–Fri, the viewed day framed and its readout first: "Fri: 4,633 trips · usual ~115k (−96%)"),
    its shortfall counts those days only, the day it began as its head counts it (Sep 21: "~77k fewer", as its hour
    chart's "~77k missing"); a History chart draws the days after it lighter, their bands (made from days before) but no
    value, and a tap picks no later day; the loads strip leaves them unmarked, a band and no count, whatever the visit
    ran. The episode chips keep their ⚠: they are how to get to the incidents. The History calendar gives each day the
    verdict its News tells (the same story, findings marked as expected left so, a refused file first), the viewed
    day's at once, ringed apart from its own colour; it checks the days to the viewed one a few at a time while the page
    is idle, on after its tab closes, and says "Checking every day · 276 of 693" with a bar until every one is checked,
    never a count of wrong days before then ("693 days to Thu Sep 21 · 23 wrong · 36 unusual" after). Days after the
    viewed one are lighter and not counted. A key says what each cell is, and each year's block names its year on its
    first row. The band's "outside last year" is another measure (days outside their range), said as such. A day with
    something wrong shows its checks whether they held, came near or passed ("Checks passed", Sat Sep 17, 2022), their
    sheet titled with the share their bars say and marked as the checks are (wrong when held, unusual when near the
    limit or their own findings are, no mark when they passed as usual), and says what its outputs are: "Outputs not published" when held, else what they were built from, "Outputs built from
    a short day", "Outputs built without Vendor 1" (under a tenth of its usual count came, as its head's "almost
    nothing") or "with Vendor 1 short" (Aug 10, 2022: 85% short), published ones ticked in their icon, not drawn in a
    severity colour; its boxes carry up to three outputs, so their number is said only past three. A tap lists them,
    each with its rows and a tap to its card. An output (or a step after the load) built from such a day says what its
    load lacked above its own rows' news, with its head's figures ("Built from a load 95% short from 13:00", "Its load:
    Trips fall 95% from 13:00"; hours are short, never missing, as trips still came in them), for the day its rows are:
    on a held day the last day that passed, itself short at times. Holding such outputs, and
    never keeping a day that was itself wrong, change what the flow publishes: an open question (Q-45). One colour
    rule: a canvas card's line and its badge take the card's own severity and nothing else does (a routine count, such
    as Nov 15, 2022's ordinary 4.6% dropped, is neutral ink); the status line after a run takes its day's verdict,
    held or published alike; and no tick (seal) shows on what the load reaches when the day has no run of its own.

11. **The card's context, its health row, and the sheet's chrome.** The weather is context and never takes the chip a
    cause takes: on a day that isn't wrong, today's snow (and the day before's when the day's trips are the news) is a
    plain note after the day's visuals, "❄ 1.5 cm today · 7.2 cm Sat" (Sun Jan 7, 2024; Sat Jan 6 says "❄ 7.2 cm
    today" under "A normal Saturday"), nothing to tap, counted at a glance; not on a day with something wrong (its cause
    is told) nor on the day after an episode (it says what is left of it): their weather is on the weather's card. The
    detail draws it under the eight weeks of trips, in their columns, headed "Snow, for context", with no sentence. The
    health row is headed once ("Health", counted) and is the same on every day: five cells (File, Amount, Hours, Values,
    Shape), no mark where nothing is out of the ordinary, ↳ where the cause groups them, and each a tap from what it
    measured: the file check in words over the list → file → load chain ("5,732 trips in the day's file, its bytes as
    published"), the amount line and four weeks, the day's hours over a usual day's, and every finding of its kinds,
    the ones the cause absorbed too, worst first; a dot in it is the dot on "7 notes" under it. It sits in the cause
    card after the visuals, so a day with something wrong keeps it in the first screen. Every finding is in one tier,
    and the rows on screen add up to what was found (Thu Sep 21, 2023: 1 cause, 2 absorbed, 6 explained, 8 the same
    day: 17); what the cause absorbed is one tap away in its health cell. An episode's chip draws its days so far, each
    its trips against its guess, the viewed day darker, so day 3 reads apart from day 2 (Thu 35%, Fri 4%, Sat 5% of a
    usual day: more of the same); its shortfall so far (days.shortfall, as its hours count it) is in the chip's
    accessible name and the detail. Once the source is told on a day of the episode the card says "Source told on Fri"
    and its verb moves to "Open an incident", "Tell the source again" behind ⋯; each verb's accessible name and title
    say what it does and whom it reaches. "How it's judged" draws what the day's range is learned from, inside its
    frame: the six weekdays before as dots, the day last year as a diamond with its date, each group named, and today's
    band and value; two sentences, the rest of the method behind "More on the method"; "About this flow" says the same.
    The sheet's head fits 390 px: the day on its own row, no arrow past the first or last load; what it reads and what
    reads it under it, each chip cut short and two or more folded into one ("‹ 2 inputs"); the tabs scrolled to the one
    chosen, their edges faded while tabs lie past them. A held gate is said from its figures wherever its message would
    show ("Held at trips_valid: 10.45% of arrived rows dropped · limit 10%"), and the runtime prints its counts with
    thousands separators. A part's mark sits against its own name on the bar's outer side.

12. **The other tabs and the canvas, drawn the same way.** The checks' rules are one label and one order wherever
    they are drawn (story.ruleUsual, ruleOrder: the most rows first, warn-only rules last): "never fails" for a rule no
    day to this one failed (in_month, whose band of half a row printed "usual 1–1"), one number when both ends round
    to it, and nothing after a count with no range. A count past its usual range runs on past a notch as an outlined
    box, as trips beyond usual do (Jan 1, 2024: 6,942 rows dropped, Distance 4,305, Duration 1,553), on the rules and
    the gate's count bar. The checks' head says its share as its bar does ("Passed: 8.6% dropped"); its (i) shows how
    the rows dropped are judged; its sheet adds what the card lacks (the rows dropped day by day, what a held run kept
    back, the rows a tap away). A share that isn't nothing never prints "0.0%" ("<0.1%"). A suggested check leads with
    a plain sentence, its count and its reason, the SQL folded under it; a documented code column gets its documented
    codes, never a bound (weather codes over 12 are rain and snow, said so), and a bound is suggested only for a tail
    fewer than 1% of the rows reach, counted over every row; a file of many days says "in this file", not "today". A
    table that measures an effect against a baseline (a `vs_<baseline>` column, weather_effect's vs_dry; core/effect.ts)
    says "No effect to measure today" when its rows are all the baseline, and draws each ratio against the baseline's
    1× otherwise. A column whose values tie says "all equal"; a column's top value is its name and share apart ("Curb
    Mobility · 75%", "$0.50 · 96%"); the Columns tab keys its marks (↳ ▲▼ ○) and every sample says its size ("1,976 of
    81,013 rows"); a rename is said as one ("Renamed LocationID → location_id"); a dropped row's why is said from its
    values and what its rule needs ("Duration 19 s (needs 1 min–3 h)"); History's chips are named by the number each
    draws ("Extras $2.50 share"), its picker a neutral control. On a phone the canvas stacks its sections one under the
    next, two cards a row, from the top (an arrangement is never stacked; an edge into a lower row runs down the gap
    above it); a card's line fits it ("−30% trips", "Flex Fare trips: 5.3%"), a step's badge counts the rows it left
    out and its line their share, and the loads strip keys its holiday line.

## Consequences

- news.ts finds; story.ts tells. newsOf no longer folds findings ("Likely from …" is gone); its titles and details
  are short and carry their numbers; the hours finding keeps its hours for its bars; findings told together keep their
  members' numbers and are told by the value that names them, with its own numbers, never "N values move together · N
  trips fewer". A share's detail counts its trips today against its usual share of the same trips ("9 of today’s trips
  with it; about 3,360 at its usual share"), never "N fewer than a day like it": a share can fall while its trips rise
  (New Year's Day 2024's credit cards), and on a short day a day like it's count is mostly the day's own shortfall.
- The population rule and the lasting trips (§2, §9) leave the days of §8 as they were: 6 something wrong, 27 unusual,
  363 with nothing unusual to tell.
- src/app/viz.ts draws the visuals as SVG strings with role=img and an aria-label stating the finding with its
  numbers, tested in Node.
- The header says the day's head, not build statistics (they are on the Runs view and in the line's title); the
  status line carries `data-run` and `data-state` for tools. The flow's lede and legend sit behind "About this flow".
  The loads strip draws each day's trips against its own range, with its mark.
- Left for later, each its own decision: redoing `lasting()` (each past day against its own range) with a backtest;
  monthly joint counts of every coded column with the payment type and the vendor in the history, so Extras' changes
  can be tested against a split; per-borough counts, so a split can name a borough; a gate that holds outputs built
  from a day with an alert upstream (a plan change); "a share that has never been 0 alerts at 0"; storing a multi-day
  incident as one record entry; the Columns, History, Odd rows and Dropped tabs drawn as fully as the News (§12 made
  them plainer); a weather_effect whose baseline is the history's dry hours (on a one-day load its join
  to dry hours at the same hour of day keeps no wet hour, so it never measures anything: a change to the document).
