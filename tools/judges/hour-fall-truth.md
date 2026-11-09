# Hour-fall days: what is true (verified 2026-11-08 from the day files)

Counted from the loads' parquet (pickup hour × payment_type):

- **Thu Sep 21, 2023** (fall at 13:00): non-Flex trips by hour from 13:00: 633, 0, 0, 2, 2, 4, 7, 8, 3, 7, 4 — the 633
  were all picked up 13:00–13:06; 37 non-Flex trips from 14:00 to 24:00. Flex Fare (payment type 0) by hour from 13:00:
  109, 150, 206, 242, 313, 313, 272, 275, 390, 392, 347 (4,657 for the day, within its usual range, +19% on expected).
- **Sat Sep 17, 2022** (fall at 15:00): non-Flex trips after 15:00: 0 in every hour. Flex Fare from 15:00: 180, 196, 261,
  286, 335, 315, 228, 250, 342 (4,878 for the day).

So the true story of an hour-fall day here is **"everything but Flex Fare stopped at 13:00 (by 13:06); Flex Fare kept
arriving"** — the first day of the outage that Sep 22–24 tell as "Only Flex Fare records arrived". "Trips fell 95%" is
true of all trips but hides that the rest stopped outright.

Consequences:
1. **The answer key was wrong.** Readers who said "trips stopped / cut off after 13:00" were right about everything but
   Flex Fare. The false facts are only: "the file ends at 13:00", "no trips at all after 13:00", "every payment type
   stopped". Use this key from round 4 on.
2. **The head should say it:** when the rows after an hour fall are almost all (≥ 90–95%) one value of a split column,
   name it: "Only Flex Fare after 13:00" (5 words) — consistent with Sep 22's "Only Flex Fare records arrived" — and
   the split reads "Flex Fare kept arriving; everything else stopped at 13:00".
3. **The visual:** the tournament's "parts" design (stacked hour bars: the part that kept arriving as an unbroken
   coloured band from 0h to 24h, everything else stopping at the fall, the usual as a ghost), fixed per the honesty
   check: one usual (the app's usualHours) throughout so the card's numbers add up; non-zero hours never under 3 px; a
   band at least 5 px; the bracket for hours above usual before the fall (Sep 17: ~8.3k). Not the "zoom" winner, which
   hides the composition. Spec context: ${hourfall}/spec.md and the mocks in ./parts/.
4. **Data:** the history has hourly totals and daily value counts but not hour × value. The day's own rows have it:
   compute the hour × split-value counts for the viewed load (through the plan and emit.ts, e.g. lane B's measures),
   and, for the history's past days, add hour × value counts for the split columns to the history measure when the
   history format next changes.
