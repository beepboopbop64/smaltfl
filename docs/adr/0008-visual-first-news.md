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
   has). A split states composition, not a reason: never "because" or "caused by".

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
   never printed equal to the limit it passed or missed.

5. **Words.** A head is at most six words and carries the number or the time ("Only Flex Fare records arrived", "Trips
   fall 95% at 13:00", "Vendor 1 sent almost nothing", "Normal for MLK Day"); a finding's title at most eight, with its
   measured number and value names ("Payment type Credit card: 0.2% (usually 75–80%)"); its detail at most one sentence
   of twenty words, shown only on tap. A share outside its range is printed with the decimals that keep it from reading
   as the range's edge. The method (the band, its weights, typical misses, the denominators) is written once, behind
   (i). Banned at a glance: "because", "caused by", "feed stopped", "disappeared", "The band". Budgets: an incident day
   60 words at a glance, an unusual one 45, a calm one 16.

6. **One cause card.** The head, one chip (the episode's day, "Day 2 · since Thu 13:00", or "Back to normal"'s "after
   Thu–Sun", or the weather that names its day), the day's count on a line with its usual range (the amount line, under
   the head on every day), one visual chosen by the cause (the part and the rest on one bar at one scale, today's ink
   over a dashed usual, so a part that held and a rest that stopped read at their real sizes; 24 hour bars over a ghost
   of a usual day; a strip of days each with its own range, four weeks on an amount day and the week on a calm one),
   the gate when it held, what it reaches ("3 outputs not published" or "Reaches 3 outputs"), the folded findings as
   counted rows ("+16 follow from this", "12 more this day") that open in place into compact rows with micro visuals,
   and one verb with the others behind ⋯. Then a health row of five cells (File, Amount, Hours, Values, Shape: ↳ where
   the cause explains it; "All 5 normal" on a calm day), at most two more stories, and counted rows for the rest and
   the notes. A tap opens a sheet that is visual too: a waterfall from a usual day to this one, the part's own days,
   its column's composition usual and today; the episode's hours; the checks rule by rule against their usual rows, and
   the outputs the held run didn't publish.

7. **Marks** carry severity by shape and fill first and colour third (the tokens' hues are too close in greyscale):
   something wrong is a filled hexagon with "!", unusual an outlined triangle on a wash, a note a small dot, ok no mark,
   held ‖, explained ↳, marked as expected ✓. Folded findings keep their shape in grey. Counts start at zero; shares sit
   on 0–100% or a printed zoom; each day draws its own range; usual is a light ghost behind today's ink.

8. **A share or a level is told only a typical miss past its range's edge** (counts from the edge), so a number hugging
   the edge isn't news. Over Jan 2023 to Jan 2024 the days are 6 something wrong (as before), 27 unusual (33 before),
   125 with notes only and 238 calm (and 2 back to normal).

9. **A change that has lasted** stays a note, and its first day is no longer said in words: the current rule judges the
   days before against today's range and claims starts that aren't ("Since Nov 3" for vendor 1, who stopped on Mon Nov
   14). Its chart shows when it began until that rule is done again.

## Consequences

- news.ts finds; story.ts tells. newsOf no longer folds findings ("Likely from …" is gone); its titles and details
  are short and carry their numbers; the hours finding keeps its hours for its bars; findings told together keep their
  members' numbers.
- src/app/viz.ts draws the visuals as SVG strings with role=img and an aria-label stating the finding with its
  numbers, tested in Node.
- The header says the day's head, not build statistics (they are on the Runs view and in the line's title); the
  status line carries `data-run` and `data-state` for tools. The flow's lede and legend sit behind "About this flow".
  The loads strip draws each day's trips against its own range, with its mark.
- Left for later, each its own decision: redoing `lasting()` (each past day against its own range) with a backtest;
  monthly joint counts of every coded column with the payment type and the vendor in the history, so Extras' changes
  can be tested against a split; per-borough counts, so a split can name a borough; a gate that holds outputs built
  from a day with an alert upstream (a plan change); "a share that has never been 0 alerts at 0"; storing a multi-day
  incident as one record entry; the Columns, History, Odd rows and Dropped tabs drawn the same way.
