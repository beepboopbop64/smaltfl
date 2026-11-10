# tools

Checks and judging tools used to build and test the app's views (see [docs/HANDOFF.md](../docs/HANDOFF.md)). They
are not part of the package, the tests or the build.

## browser/

They need Playwright with Chromium (`require('playwright')`), and Python 3 with Pillow for the two image scripts.
Build the app first (`npm run build:app`) and copy `dist/app` somewhere, because `npm run build` wipes `dist/`. Pass
**absolute** paths.

| Command | What it does |
|---|---|
| `node tools/browser/tour.cjs <appDir> <outDir> <stops.json>` | Serves the built app, drives it at phone size (390×844; `TOUR_SCALE=2` for screenshots a person will look at) through the stops, saves `<name>.png` for each and writes `metrics.json`: the status line, the visible text, word counts, charts, words before the first chart, and every failed `expect` as a problem. The stop format and the `expect` checks are documented at the top of the file. |
| `node tools/browser/episode.cjs <appDir> <outDir>` | The September 2023 episode: the strip's marks, the paused Thursday, an incident opened and listed in History, Friday paused and held at the checks. Expect `20/20 passed`. |
| `node tools/browser/integrity.cjs <appDir> <outDir>` | Seals, verify and re-derive, the record, an audit bag and a checkpoint downloaded, a tampered day refused. Expect `13/13 passed`. |
| `python3 -I tools/browser/cvd.py <outDir> <png>…` | Greyscale and deuteranopia versions of screenshots (Machado et al. 2009), for the colour check. |
| `python3 -I tools/browser/slices.py <in.png> <out.png> [height] [strips] [start]` | Slices a tall screenshot into side-by-side strips you can read in one image. |

**Stop sets** (`browser/stops/`). The stops in a file run in one session, in order, and later stops depend on what earlier ones ran (which day readers keep, what was decided): run a whole file, not a few stops out of it.
- `pause-checks.json` (and `-xs.json` for the fixtures build): the pause and decision flows, with expectations. It
  must report `problems: none`.
- `judges.json`: the 104 screens a judge round reads: 13 real days in light, dark and masked, details, tabs,
  canvases, decision sheets and restricted viewers.
- `judges-decide.json`: the decision sequence, captured in a fresh session before Mon 25 runs. Once a later day is
  published, releasing an earlier one is refused by design.
- `estate.json`: the control estate's screens (`npm run build:app -- --flow examples/control-estate/flow.json --out
  dist/app-estate`): a calm day, the held days of ADR 0014's answer key, and bronze, silver and gold cards with their
  News, Checks and Data, each stop with a `what` a judge reads. Its days run in order, since a day's due check reads
  the day before. It has no expectations yet: they come with the fixes of docs/HANDOFF.md's review.
- `fills.json` and `fills-nov.json`: the fill flows, as designed. Some selectors may have moved since; update them
  when a stop reports "nothing to click".

## judges/

Claude Code Workflow scripts (run with the Workflow tool, `args: { scratch: '/abs/dir', … }`):

- `judge-round.workflow.js`: a judge round over a capture of `judges.json`. It runs five-second, masked, detail,
  reconstruction, false-alarm, honesty, colour, old-versus-new and decision-sheet judges, plus an adversarial explorer,
  then grades them against its answer key and ranks the fixes. Its key has the hour-fall correction.
- `fix-round.workflow.js`: works through a ranked list in clusters, one implementer at a time on the branch. It then
  loops the hour-fall days past fresh five-second readers, and finishes with a two-sided review and a fixer.
- `estate-panel.workflow.js`: a panel over a capture of `estate.json` (`args: { metrics: '/abs/capture/metrics.json' }`):
  a leader's ten-second glance, the layers as a flow, ten leadership questions, the options and their trade-offs,
  honesty against ADR 0014's answer key, and the two-minute brief with its grader. First run on 2026-11-10: 29 of 35.
- `hour-fall-truth.md`: what the day files show on Sep 21, 2023 and Sep 17, 2022.

The scripts name the folders the 2026-11 session used inside the scratch directory: captures such as `final-cap5/`,
builds such as `app-vf13/`, and the grader's results `final-result3.json`. Rename them to yours.
