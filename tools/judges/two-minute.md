# The two-minute test (ADR 0012 §7)

The maintainer's measure of the app: *on a phone, find a problem or explore the data and within two minutes give
leadership a clear, easy-to-digest explanation of it and a solution.* This test asks exactly that of a reader who has
only the app's screens.

## Protocol

1. **Capture.** Build the app on the data branch's loads (`npm run build:app`), then capture the input card's News
   tab for each test day at phone size with `tools/browser/tour.cjs` and a stop set like this:
   ```json
   [{ "name": "sep21-2023", "episode": "September 2023", "day": "Thu 21", "card": "trips_profile", "tab": "News", "full": true }]
   ```
   The days: Thu Sep 21, 2023 (the trips fall at 13:00, only Flex Fare after), Sat Sep 17, 2022 (the same at 15:00,
   nothing after), Tue Nov 15, 2022 (a week a quarter short, Vendor 1 missing), and a calm day (Tue Jan 9, 2024).
2. **Judge.** Two judges, each an agent given one screenshot at a time and nothing else, told they have two minutes
   and must write what they would send leadership: what happened (one sentence), its impact, its cause as far as the
   screen shows it, and the fix they propose. One judge is an on-call data engineer; the other a newcomer who has never
   seen the app. Each also says what they could not tell from the screen.
3. **Grade** each answer against the day's facts (`hour-fall-truth.md` for the hour-fall days; the history for the
   others) on five points, each 0 or 1: the day and what happened are right; the number or time is right; the impact
   (what waits, what readers see) is right; the proposed fix is one the app offers and fits; nothing false is stated.
   A calm day scores on saying nothing is wrong and proposing nothing.
4. **Record** the scores in docs/HANDOFF.md's table of rounds, with the build they were taken on, and open a fix list
   from what the judges could not tell.

## Why these rules

- The reader gets screens, not the data: the test is of the app's words and drawings (ADR 0008 §5's budgets, ADR 0012
  §1's one sentence), not of the reader's skill.
- Two readers, one expert and one new: the brief is for leadership, who are the newcomer.
- Facts first: a brief that reads well but states a false number fails (Knaflic's rule, and the honesty lens of the
  earlier rounds).
