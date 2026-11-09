export const meta = {
  name: 'visual-first-fixes-round-3',
  description: 'Fix the round-3 judges’ 37 findings in five clusters after the fills and any-dataset build, tell hour-fall days as they were (everything but Flex Fare stopped), loop them past fresh five-second judges, then review and fix',
  phases: [
    { title: 'Implement', detail: 'hour-fall truth, the pause everywhere, privacy and record, honest cards, calm and keys' },
    { title: 'Glance loop', detail: 'fresh five-second judges on Sep 21 and Sep 17 2022 until every reading is true' },
    { title: 'Review', detail: 'adversarial review of the combined diff, then a fixer' },
  ],
}

// Fix a judge round's ranked findings in clusters, one implementer at a time (round 3 of 2026-11-09; stopped after three clusters).
// A Claude Code Workflow script (run with the Workflow tool; see docs/HANDOFF.md, "How the views were tested").
// Pass { scratch: '/abs/scratch/dir', previous: [...] } as args. Paths under the scratch directory (captures such as
// final-cap5/, builds such as app-vf13/, judge outputs) are the ones the 2026-11 session used; rename them to yours.

const S = args?.scratch ?? 'SET-ME' // a scratch directory holding the captures, builds and judge outputs
const BASE = args?.base ?? 'HEAD'
const TRAILERS = `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011MqhLCCZLuGpkZ9iVeAkuV`

const COMMON = `You are fixing the smaltfl app (repo /home/user/smaltfl, branch claude/elegant-knuth-r8364a; you are on it).
The owner asked for the "what's wrong" views to be visual-first: "immediately obvious to the user through visuals and not
paragraphs of text … understand things with a visual, maybe one or two sentences, and if they need detailed explanation,
that's when they'd have to interact." They also decided that a day that is off is paused, not published, and waits for
a decision (ADR 0009). Read docs/adr/0008-visual-first-news.md and docs/adr/0009-paused-not-published.md first. Code:
src/core/story.ts, news.ts, days.ts, hold.ts, decision.ts (pure, tested), src/app/viz.ts (SVG), src/app/main.ts (the
app), src/app/page.html (CSS), src/plugin/ (runtime, release, verify), src/core/audit.ts.

This is the third round of judging. The judges' reports and the grader's ranked list: ${S}/final-result3.json
(grade.fixes is the list, fix #1 is grade.fixes[0]; grade.previous says which of last round's fixes held; raw.* holds
each judge's full report: raw.ex the adversarial explorer, raw.dec the decision-sheet judge, raw.hon honesty, raw.cv
colour, raw.g1/g2 the five-second judges, raw.fa false alarms, raw.abr old vs new). The screens they judged:
${S}/final-cap5 (<day>-news.png, -news-full.png, -detail.png, -news-dark.png, masks, canvases, tabs),
decision sheets, receipts, Runs, restricted viewers, all in final-cap5) and the explorer's ${S}/final-explore3.
Since those screens were taken, a large build landed: fills (ADR 0009 amendment 1) and any dataset (ADR 0010); read
both ADRs and \`git log\` first, and check each finding against the current code — some may be gone or moved. Read your items in full there, with their sources, before changing anything.

Rules:
- Verify each claim in code and data first. If a claim is wrong (for example, a suggested rename that confuses two
  different tabs), say so and skip it.
- Prefer a visual fix to more words. Words added must fit the budgets the tests enforce (incident day 60 at a glance,
  unusual 45, calm 16, recovery 24; heads ≤6 words, titles ≤8, details ≤20; decision sheet ≤45 at a glance). Never add
  a paragraph; remove words a visual already says.
- Honesty (ADR 0008/0009): counts start at zero; shares on 0–100% or a labelled zoom; dashed means absent only; hatched
  means another day's rows; a split states composition, never a reason; every printed number is the value it shows; no
  later days in a day's own view; nothing reaches readers from a held day without a recorded decision; a viewer never
  sees what their policy closes to them (names included).
- CLAUDE.md applies (only emit.ts knows engine SQL; hashes and encodings only through an ADR with vectors; no Prettier;
  no probe tests committed; correctness before speed).
- Tests: add or adjust vitest tests for what you change; \`npm run check\` must pass before each commit.
- See it: \`cd /home/user/smaltfl && npm run build:app\` (2 s), \`cp -r dist/app ${S}/app-r2-<cluster>-<n>\` (a new
  directory each time; never delete directories), then \`cd ${S}/harness && node tour.cjs ${S}/app-r2-<cluster>-<n>
  ${S}/shots-r2-<cluster>-<n> <stops.json>\`. The stop format (with clicks, select, view, reload, expect) is at the top
  of tour.cjs; ${S}/harness/stops-final3.json and ${S}/harness/stops-pause-checks.json hold the judges' stops. Put your
  own stops files under ${S}/work-r2-<cluster>/. Read the PNGs; check light and dark. metrics.json lists problems.
- Keep the browser suites passing: \`node ${S}/suites/episode.cjs <appDir> <outDir>\` and \`node
  ${S}/suites/integrity.cjs <appDir> <outDir>\` (update a suite's expectation only when the app's new behaviour is the
  intended one, and say so), and \`node tour.cjs … ${S}/harness/stops-pause-checks.json\` must report no problems.
- Write files with Write/Edit; no heredocs containing rm; never rm -rf.
- Commit with clear messages that say what they fix, ending with exactly:
${TRAILERS}
  Don't push.
- Stay inside your items; other clusters handle the rest (listed below).

Return a report: for each item, done / partly / skipped (and why), what changed, how you verified it (test names,
screenshot paths), and what a later cluster must know.`

const CLUSTERS = [
  { key: 'truth', items: [1, 10, 15, 23], brief: `Cluster "truth": tell hour-fall days as they were. Read ${S}/hourfall/truth.md first: on Sep 21 2023
everything but Flex Fare stopped by 13:06 (37 stragglers in the rest of the day) while Flex Fare kept arriving, and on
Sep 17 2022 nothing but Flex Fare arrived after 15:00. The judges' "stopped / cut off" readings were mostly right; the
old answer key was wrong. So:
- #1: when the rows after an hour fall are almost all one value of a split column, the head names it ("Only Flex Fare
  after 13:00", ≤6 words, consistent with Sep 22's "Only Flex Fare records arrived"); the hour chart is the tournament's
  "parts" design (${S}/hourfall/parts/ and spec context ${S}/hourfall/spec.md; fix what its honesty check found: one
  usual throughout, non-zero hours ≥3 px, the band ≥5 px, the bracket before the fall). The hour × value counts come
  from the viewed load's rows through the plan and emit.ts (lane B's measures if they fit); past days without them keep
  today's chart. A day where the rest fell but didn't stop keeps "Trips fall to a trickle…". Update the real-history
  tests' heads; keep every printed number the value it shows.
- #10: "one part held, the rest stopped" must look different from "one part vanished" (masked judges confused them), and
  a check hold must be visible in the head's picture.
- #15: consecutive days visibly differ and the episode chip's arithmetic reads plainly.
- #23: day-by-day charts get a scale and agree with their notes.` },
  { key: 'pause-everywhere', items: [2, 9, 12, 20, 28, 3, 4, 19, 33], brief: `Cluster "pause-everywhere": the pause and the decision carried through every view.
- #2: Results, Data and About never show a held day as published ("Published as zone_hour" on a held run, held rows as
  if readers had them): they show what readers have, or the staged rows under the staged bar.
- #9/#28: after a decision the page stops saying Paused; receipts carry the reason and "Change decision".
- #12/#20: the pause stated at the top, "readers see Mon 18" explained (why that day, how old), one name per state.
- #3: the Keep option draws the kept day as it was (if it was itself broken or short, show it so), not as a clean day.
- #4: the decision sheet counts what readers would get (trips after checks), labelled, and matches the card.
- #19: each option says what it will ask or do before it is picked.
- #33: a kept day of a different weekday is flagged.
- Found by the session owner in a snapshot (${S}/snap2/sep21-pick-fill.png): on Sep 21 "Fill from Thu 14" (121,931
  trips) says "fails its checks" and the go button is disabled, though Thu 14 is a normal day. Find out why (the derived
  run's checks, the month rule, the claim under claim/2, the donor's own checks) and fix it if it's a defect; if the filled
  day really fails its checks, the sheet says which check and why in a few words.` },
  { key: 'privacy-record', items: [6, 7, 21], brief: `Cluster "privacy-record".
- #6: closed trips data reaches people it is closed to (the Runs view's file sizes and row counts for a closed source;
  any other place you find): close every path, with tests.
- #7: the record must never name someone who may not decide as the publisher; a viewer who may not decide can't Run,
  step days into a release, or publish.
- #21: symptoms don't get their own primary actions; one severity rule across screens.` },
  { key: 'honest-cards', items: [5, 24, 8, 11, 13, 25, 26, 29, 30, 32], brief: `Cluster "honest-cards".
- #5/#24: the Results weather card states false findings and doesn't match its own text (14 °C vs 13 °C, the °C line on
  the rain axis, rain bars on a 0.0 mm day): fix the numbers and the axes.
- #8: snow still reads as the cause on Jan 7, and amber days are unclear about whether to act (a filled "Mark as expected"
  button invites action): make doing nothing the plain default.
- #11: the gate row invites "more bad rows than usual" and hides how close passing checks came.
- #13: extra above usual is drawn in ghost grey: draw it as real trips.
- #25: very wide bands say so.
- #26: suggested checks must not be computed from a broken day.
- #29/#30/#32: numbers agree inside cards, one rounding; every chart has a scale or a zoom marker; side figures that pull
  the eye are quieted or explained.` },
  { key: 'accept-strict', items: [], brief: `Cluster "accept-strict": the owner's answer of 2026-11-09 (end of
${S}/pause-design/owner-answers-2.md): a deliberate (lasting) change nobody accepts KEEPS PAUSING UNTIL ACCEPTED — every
following day at the new level pauses until someone accepts it. The last pass built a narrower reading of its finding
F17 ("pause once, then notes"; see ADR 0010 §15 and the F17 notes in the code and tests); replace it with the strict
reading. The owner was told the taxi example then pauses about 29–31 days instead of 25: measure the new set on the real
history, update the hold vector (test/hold-real.test.ts, the backtest, ADR 0010's tables and §15, docs/OPEN_QUESTIONS.md
with the owner's words, ARCHITECTURE/SCENARIO calibration text) and the security fixture's expectations (the migration
pauses every day until accepted; after an Accept, the covered days publish). Keep Accept covering the following days at
the new level (Q-57b). Make the paused days of an unaccepted change show what to do (Accept the new level, or decide
otherwise) without adding words over budget.` },
  { key: 'calm-keys', items: [14, 16, 17, 18, 22, 31, 34, 35, 36, 27], brief: `Cluster "calm-keys".
- #14: severity never by colour alone; bands visible in greyscale, deuteranopia and dark mode (≥3:1).
- #16: "not run" days don't read as failures or outages.
- #17/#18: calm days don't look flagged (hollow circles, "N notes", a HEALTH label that comes and goes); the follow-on row
  and notes say what they hold.
- #22: Flex Fare, Vendor 1 and output names explained once where they appear (from the ontology).
- #31: keys for ‖, ⚑, ☒, ✓ and later tiles where they are drawn.
- #34/#35: rough wording and layout at 390 px.
- #36: the History calendar fills faster (or says how far it has got).
- #27: what the old view had (its bytes as published, exact ranges, finding counts, method sentences) one tap away.` },
]

const all = CLUSTERS.map((c) => `${c.key}: #${c.items.join(', #')}`).join('; ')

phase('Implement')
const reports = []
for (const c of CLUSTERS) {
  const r = await agent(`${COMMON}

All clusters: ${all}.

${c.brief}

Reports from the clusters before you (build on them; don't undo them):
${reports.map((x, i) => `--- ${CLUSTERS[i].key} ---\n${x}`).join('\n') || '(none: you are first)'}`, { label: `implement:${c.key}`, phase: 'Implement' })
  reports.push(r ?? '(no report)')
  log(`${c.key} done`)
}

phase('Glance loop')
const GLANCE = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { image: { type: 'string' }, state: { type: 'string' }, what: { type: 'string', description: 'what is going on, 6 words or fewer' }, firstSeen: { type: 'string' }, actNow: { type: 'string' }, still: { type: 'string', description: 'after the change, do any trips still arrive, and which?' } }, required: ['image', 'state', 'what', 'firstSeen', 'actNow', 'still'] } } }, required: ['answers'] }
const FALSE = /no trips at all|nothing (at all )?(arrived|after)|(file|data) (ends|ended)|zero trips|all trips stopped|every (payment|vendor|trip)[^.]* stopped/i
const loop = []
let prev = null
for (let round = 0; round < 3; round++) {
  const dir = `${S}/glance-r2-${round}`
  const cap = await agent(`${COMMON}

${round === 0 ? 'Capture only (do not change code):' : `Some five-second readings were false or missed what kept arriving. Their answers: ${JSON.stringify(prev)}.
The truth (${S}/hourfall/truth.md): everything but Flex Fare stopped at 13:00 (Sep 21) / 15:00 (Sep 17 2022), and Flex
Fare kept arriving. Change the head and/or the hour chart so a first-time viewer reads exactly that. Keep every number
honest and the budgets. Commit with the trailers. Then capture:`}
build the app (npm run build:app), copy dist/app to a new directory ${S}/app-glance-r2-${round}, and capture these two
stops into ${dir}: Thu Sep 21 2023 (episode "September 2023", day "Thu 21") and Sat Sep 17 2022 (episode "September 2022",
day "Sat 17"), each the trips card's News tab, first screen only, named sep21-news and sep17-22-news. Return the two PNG
paths and, if you changed code, what you changed.`, { label: `glance-capture:${round}`, phase: 'Glance loop' })
  const judges = await parallel(['an on-call data engineer', 'a business analyst new to data pipelines', 'a product manager who owns a dashboard built on this data'].map((persona, k) => () => agent(`The app is a phone-first data pipeline over NYC taxi trips. For each day's file of trips it shows the day's "News":
what is out of the ordinary against normal ranges learned from history. You are ${persona}, seeing this app for the
first time. Look at each image once, as if you had five seconds, and answer from that first impression. Open only these
two images: ${dir}/sep21-news.png and ${dir}/sep17-22-news.png. For each: normal, unusual or something wrong; what is
going on in 6 words or fewer; what you saw first; whether you'd act now; and after the change, whether any trips still
arrive and which.`, { label: `glance:${round}:${k}`, phase: 'Glance loop', schema: GLANCE })))
  const answers = judges.filter(Boolean).flatMap((j) => j.answers)
  const bad = answers.filter((a) => FALSE.test(`${a.what} ${a.firstSeen} ${a.still}`) || /^\s*no\b/i.test(a.still) || !/flex/i.test(a.still))
  loop.push({ round, capture: cap, answers, cutOff: bad.length })
  log(`glance round ${round}: ${bad.length} of ${answers.length} answers false or missing what kept arriving`)
  if (!bad.length) break
  prev = answers
}

phase('Review')
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' }, what: { type: 'string' }, scenario: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['file', 'what', 'scenario', 'fix', 'severity'] } } }, required: ['findings'] }
const reviews = await parallel([
  ['correctness', 'correctness and integrity: wrong numbers or labels on screen, logic errors in core, a paused day reaching readers without a recorded decision, a closed name shown to a viewer, record/verify/audit regressions, encodings changed without an ADR, tests that assert the bug, CLAUDE.md violations. Run npm run check and probes (delete them).'],
  ['screens', 'the owner on a phone: drive the built app with the harness (build, copy to a new directory under the scratchpad) on Sep 21–25 2023, Nov 14–15 2022 and Jan 1/7 2024, light and dark, as Owner and as a viewer who may not decide; anything wordy, contradictory, clipped, overlapping, or over a word budget; marks without a key; later days in a day\'s view.'],
].map(([key, lens]) => () => agent(`You review the smaltfl repo (/home/user/smaltfl): the diff \`git diff ${BASE}..HEAD\` (round-2 fixes to the
visual-first news and the pause; reports below). Review for ${lens} Report only defects you confirmed, each with a
concrete scenario. Don't edit the repository.

${reports.map((x, i) => `--- ${CLUSTERS[i].key} ---\n${x}`).join('\n')}
--- glance loop ---
${JSON.stringify(loop.map((l) => ({ round: l.round, cutOff: l.cutOff, capture: l.capture })))}`, { label: `review:${key}`, phase: 'Review', schema: FINDINGS })))
const findings = reviews.filter(Boolean).flatMap((r) => r.findings)
let fixed = '(no findings)'
if (findings.length) {
  fixed = await agent(`${COMMON}

You are the last pass. Reviewers confirmed these defects in the round-2 work (\`git diff ${BASE}..HEAD\`). Fix each (or
say why it is not a defect), keep npm run check, both suites and the pause stops green, look at the screens you touch,
and commit. Findings:
${JSON.stringify(findings, null, 1)}`, { label: 'fix-review', phase: 'Review' })
}
return { reports: CLUSTERS.map((c, i) => ({ cluster: c.key, report: reports[i] })), loop, findings, fixed }
