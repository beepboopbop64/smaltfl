export const meta = {
  name: 'visual-first-retest-3',
  description: 'Judge the built app’s visual-first news on real days: five-second, masked, detail, reconstruction, false alarms, honesty, colour-blind, old vs new, an adversarial explorer; then a ranked fix list',
  phases: [
    { title: 'Judge', detail: 'agents read the real app’s screenshots, each with one task' },
    { title: 'Explore', detail: 'an adversarial tester drives the app itself' },
    { title: 'Grade', detail: 'answers against the key, and every issue ranked into fixes' },
  ],
}

// Judge a build of the app on real days (round 3 of 2026-11-08, with the answer key corrected after it).
// A Claude Code Workflow script (run with the Workflow tool; see docs/HANDOFF.md, "How the views were tested").
// Pass { scratch: '/abs/scratch/dir', previous: [...] } as args. Paths under the scratch directory (captures such as
// final-cap5/, builds such as app-vf13/, judge outputs) are the ones the 2026-11 session used; rename them to yours.

const S = args?.scratch ?? 'SET-ME' // a scratch directory holding the captures, builds and judge outputs
const C = `${S}/final-cap5`
const DAYS = [
  ['jan01', 'Mon Jan 1, 2024 (New Year’s Day)'], ['jan06', 'Sat Jan 6, 2024'], ['jan07', 'Sun Jan 7, 2024'], ['jan15', 'Mon Jan 15, 2024 (MLK Day)'],
  ['sep21', 'Thu Sep 21, 2023'], ['sep22', 'Fri Sep 22, 2023'], ['sep23', 'Sat Sep 23, 2023'], ['sep25', 'Mon Sep 25, 2023'],
  ['sep17-22', 'Sat Sep 17, 2022'], ['sep18-22', 'Sun Sep 18, 2022'], ['nov12-22', 'Sat Nov 12, 2022'], ['nov14-22', 'Mon Nov 14, 2022'], ['nov15-22', 'Tue Nov 15, 2022'],
]
const ABOUT = `The app is smaltfl, a phone-first data pipeline over NYC taxi trips. For each day's file of trips (a "load") it tells
the day's "News": what is out of the ordinary against normal ranges learned from two years of history. You are looking
at phone screenshots (390 px wide) of the News tab of the trips card.`

const KEY = `ANSWER KEY (fixed before judging; semantically equivalent answers count; false facts count as wrong). Since the
last round, a day that is off is PAUSED (the owner's decision, ADR 0009): its outputs are built and checked but not
published; readers keep the last published day until someone decides (publish as is, or don't publish).
- jan01: unusual, nothing broken. Flex Fare records 2.3x usual on New Year's Day; the day's total trips normal (81,013 in 49k-108k). Act: no (or mark OK). Shape: a surge of one part.
- jan06: normal Saturday (notes only); snow 7.2 cm that day as context. Act: no. Shape: calm.
- jan07: unusual. Fewer trips: 67,543 (-30%), the Sunday after a snowy Saturday (snow is context, not a proven reason). Act: no or OK. Shape: amount low.
- jan15: normal (MLK Day). Act: no. Shape: calm.
- sep21: something wrong. From 13:00 (by 13:06) every trip but Flex Fare stopped; Flex Fare (payment type 0) kept arriving, ~150-390 an hour (37 other trips in the rest of the day). Whole day 41,939 (-65%). Paused: 3 outputs waiting for a decision, not published; readers still see an earlier day. Act: yes (decide). Shape: trips fall at an hour. (Corrected 2026-11-09: "the rest stopped / cut off at 13:00" is TRUE for everything but Flex Fare; see tools/judges/hour-fall-truth.md.)
- sep22: something wrong. Only Flex Fare records arrived (4,613 of ~4.7k); everything else 20 of ~110k. The checks held too: 46% dropped vs a 10% limit, though fewer rows were dropped than on a usual Friday. Paused, 3 outputs waiting. Day 2, since Thu 13:00. Act: yes (decide / tell the source). Shape: one part held, the rest stopped; run held.
- sep23: as sep22, day 3 (5,714 Flex Fare records; checks held at 40%); paused.
- sep25: back to normal, after Thu-Sun; the earlier days it lists (Thu-Sat in these captures) are still waiting for a decision. Act on the day itself: no; deciding the waiting days is a correct "yes" too. Shape: calm.
- sep17-22: something wrong. From 15:00 nothing but Flex Fare arrived (0 other trips), Flex Fare ~180-340 an hour; paused, outputs waiting. Act: yes. Shape: trips fall at an hour.
- sep18-22: something wrong. Only Flex Fare records arrived; checks held at 10.45%, just over the 10% limit; day 2 since Sat 15:00; paused. Act: yes. Shape: one part held, the rest stopped; run held.
- nov12-22: normal Saturday. Act: no. Shape: calm.
- nov14-22: something wrong. Vendor 1 sent almost nothing (2 trips vs ~34k); everything else held; paused, outputs waiting. Act: yes (decide / tell the source). Shape: one part vanished, the rest held.
- nov15-22: as nov14, day 2 since Mon (3 trips vs ~36k); paused.
- Decision sheet (sep21-decide, nov14-decide): two options drawn as what readers would get: "Publish as is" (today's short day, the missing part dashed) and "Don't publish" (an earlier day's rows, hatched: readers keep that day). A reason chip is needed before publishing as is; the scope "Until a day publishes" makes don't-publish cover later held days too.
False facts: "the file ends at 13:00 / no trips at all after 13:00", "every payment type / every vendor stopped", "caused by rain/snow", "more bad rows than usual on Sep 22", "the outputs were published on Sep 21 / Nov 14" (they are paused).`

const GLANCE = {
  type: 'object',
  properties: { answers: { type: 'array', items: { type: 'object', properties: {
    day: { type: 'string' }, state: { type: 'string', enum: ['normal', 'unusual', 'something wrong'] }, what: { type: 'string' },
    where: { type: 'string', enum: ['the incoming file', 'the checks', 'an output', 'nowhere', 'can’t tell'] }, actNow: { type: 'string', enum: ['yes', 'no', 'can’t tell'] },
    firstSeen: { type: 'string' }, confusing: { type: 'string' },
  }, required: ['day', 'state', 'what', 'where', 'actNow', 'firstSeen', 'confusing'] } } },
  required: ['answers'],
}
const glance = (persona) => `${ABOUT}
You are ${persona}, seeing this app for the first time. For each screenshot, act as if you had five seconds: look once and
answer from that first impression. Do not open any file but these images.
${DAYS.map(([k, label]) => `- ${k} (${label}): ${C}/${k}-news.png`).join('\n')}
For each: normal, unusual or something wrong; what is going on in 6 words or fewer; where in the pipeline; whether you'd
act now; what you saw first; what, if anything, confused you.`

const MASK = {
  type: 'object',
  properties: { answers: { type: 'array', items: { type: 'object', properties: {
    image: { type: 'string' }, state: { type: 'string', enum: ['normal', 'unusual', 'something wrong', 'can’t tell'] },
    shape: { type: 'string', enum: ['one part held, the rest stopped', 'trips fall at an hour of the day', 'one part vanished, the rest held', 'a surge of one part', 'the amount is low', 'the run was held by a check', 'calm, nothing', 'can’t tell'] },
    cue: { type: 'string' },
  }, required: ['image', 'state', 'shape', 'cue'] } } },
  required: ['answers'],
}
const masked = `${ABOUT}
These screenshots have their text masked: letters are dots ("letters" images keep digits and punctuation; "all" images
mask everything). From the visuals alone, say if the day looks normal, unusual or wrong, and which shape of problem the
picture shows; name the mark you read it from. Open only these images.
${DAYS.map(([k]) => `- ${C}/${k}-news-mask-all.png\n- ${C}/${k}-news-mask-letters.png`).join('\n')}`

const DETAIL = { type: 'object', properties: { answers: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, answer: { type: 'string' }, readFrom: { type: 'string' }, seconds: { type: 'string' } }, required: ['q', 'answer', 'readFrom', 'seconds'] } } }, required: ['answers'] }
const QUESTIONS = [
  'Sep 21 2023: at what hour do trips fall, and to about how many an hour?',
  'Sep 21 2023: were the outputs published, and what do readers see meanwhile?',
  'Sep 22 2023: which records still arrived, and how many against usual?',
  'Sep 22 2023: how far past its limit were the checks, and were more rows dropped than on a usual Friday?',
  'Sep 22 2023: which outputs were not published, and since when has this been going on?',
  'Nov 15 2022: which part vanished, how many trips did it send against usual, and did everything else hold?',
  'Jan 1 2024: what surged, and was the day’s total normal?',
  'Jan 7 2024: what is unusual, and what context does the screen give?',
  'Sep 18 2022: how far past the limit were the checks?',
  'Sep 25 2023: what is the state of the day?',
]
const detail = `${ABOUT}
Here are full News tabs and the detail sheets a tap on each day's main chart opens. Tall images: slice them to read, e.g.
python3 -I ${S}/harness/slices.py <in.png> ${S}/judge-final-<n>.png 1700 4 0 then Read the slice. Answer each question
from the screens, say what you read it from (a chart's mark or label, or a sentence) and how long it took; "not shown"
if it isn't. Open only these images and your slices.
${['sep21', 'sep22', 'nov15-22', 'jan01', 'jan07', 'sep18-22', 'sep25'].flatMap((k) => [`- ${C}/${k}-news-full.png`, ...(['sep21', 'sep22', 'nov15-22', 'jan01', 'jan07', 'sep18-22'].includes(k) ? [`- ${C}/${k}-detail.png`] : [])]).join('\n')}
Questions:
${QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n')}`

const reconstruct = `${ABOUT}
For each incident episode below, look only at its screenshots (News first screens and full pages, and detail sheets),
then write what happened in 60 words or fewer, as you'd tell a colleague. Don't guess beyond what the screens show.
Slice tall images with python3 -I ${S}/harness/slices.py <in> ${S}/judge-final-r-<n>.png 1700 4 0.
- September 2023: ${['sep21', 'sep22', 'sep23', 'sep25'].map((k) => `${C}/${k}-news-full.png`).join(', ')}, ${C}/sep22-detail.png
- November 2022: ${['nov14-22', 'nov15-22'].map((k) => `${C}/${k}-news-full.png`).join(', ')}, ${C}/nov15-22-detail.png
- September 2022: ${['sep17-22', 'sep18-22'].map((k) => `${C}/${k}-news-full.png`).join(', ')}, ${C}/sep18-22-detail.png
Return the three accounts.`

const falseAlarm = `${ABOUT}
These are calm or nearly calm days. For each, list everything the screen asks you to worry about or do. Be literal: a
mark, a colour, a word that suggests trouble. Open only these images.
${['jan06', 'jan15', 'sep25', 'nov12-22'].map((k) => `- ${C}/${k}-news.png and ${C}/${k}-news-full.png`).join('\n')}`

const honesty = `${ABOUT}
You are a skeptical data engineer checking that the visuals don't mislead. Look at every image in ${C} (News, details,
dark mode, canvas, other tabs; slice tall ones with python3 -I ${S}/harness/slices.py). The numbers behind them are in
${S}/mockdata/days.json (shares are fractions) and ${S}/app-vf13/data/history.json. Checklist: count charts start at
zero; shares on 0-100% or a labelled zoom; a band never reads as a hard limit; no reason words for a split ("because",
"caused by"); a gate never shown as a share without its count; stale panels carry their day; no two verdicts disagree;
numbers agree between labels, the head and the detail sheets; no false facts (see the key); dashed means absent only;
severity marks still distinct in greyscale (make greyscale versions with python3 -I and PIL). List every issue with the
image, the element and what it should be, ranked by how misleading it is. Write only under ${S}/final-honesty3/.

${KEY}`

const cvd = `${ABOUT}
Accessibility check. Greyscale and deuteranopia versions of the first screens are in ${S}/final-cvd5 (*-grey.png,
*-deut.png); dark-mode screens are ${C}/*-news-dark.png. For each greyscale and deuteranopia image, classify every
severity mark you see (something wrong: filled hexagon; unusual: outlined triangle; held: ‖; grouped: ↳) and say whether
any mark, bar or label becomes hard to tell apart or to read. In dark mode, report any low-contrast element (a band, a
ghost, a label). List issues with image and element. Open only those images.`

const ab = `${ABOUT}
Old versus new. For each day, A is the old app's first screen and B the new one's. Which tells you what's wrong (or that
nothing is) faster, and why? List any fact you can see in A that you can't reach in B within one tap (B's detail sheet is
given where there is one). Open only these images.
- Sep 21: A ${S}/baseline/sep21-trips-news.png  B ${C}/sep21-news.png (detail ${C}/sep21-detail.png)
- Sep 22: A ${S}/baseline/sep22-trips-news.png  B ${C}/sep22-news.png (detail ${C}/sep22-detail.png)
- Nov 15 2022: A ${S}/baseline/nov15-trips-news.png  B ${C}/nov15-22-news.png (detail ${C}/nov15-22-detail.png)
- Jan 1: A ${S}/baseline/jan01-trips-news.png  B ${C}/jan01-news.png (detail ${C}/jan01-detail.png)
- Jan 15: A ${S}/baseline-jan15/jan15-trips-news.png  B ${C}/jan15-news.png`

const explore = `${ABOUT}
You are an adversarial tester. The built app is in ${S}/app-vf13. A harness drives it at phone size:
  cd ${S}/harness && node tour.cjs ${S}/app-vf13 ${S}/final-explore3/<run> <stops.json>
(read the top of ${S}/harness/tour.cjs for the stop format: episode, day, card, tab, click a selector, full, scheme,
mask, clicks, reload, download, expect). Paused days have a Decide flow (ADR 0009): try deciding, reloading, and
viewing as someone who may not decide. Write your stops files under ${S}/final-explore3/. Explore what the screenshots above don't cover: other days (all
of January, the Sep 2022 and Nov 2022 episodes), other cards (trips_valid, trips_profile, zones, weather, zone_hour,
the outputs), every tab (Data, Columns, Odd rows, History, Dropped, Integrity), the detail sheets (click
'#sheet section.vf-card .vf-hero', '#vf-gate', '#sheet .vf-fold', '#sheet .vf-chip-btn', '#sheet .vf-info'), dark mode.
Look at every screenshot. Find what is broken, clipped, overlapping, contradictory, misleading, wordy, or confusing to a
newcomer, and what is missing a visual. Do not change the repository (/home/user/smaltfl). Report each issue with the
screenshot path, the element, what is wrong, and a concrete fix, most serious first.`

const decideTask = `${ABOUT}
A day that is off is paused: its outputs wait for someone to decide (ADR 0009). Look at these screens of paused days and
the decision sheet, in this order of the session (Read the PNGs; slice tall ones with python3 -I ${S}/harness/slices.py):
- ${C}/sep21-news-full.png, ${C}/sep21-canvas.png (a paused day, News and canvas), ${C}/sep22-news-full.png (paused and held by the checks)
- ${C}/sep21-decide.png, ${C}/sep21-decide-dark.png, ${C}/sep21-decide-mask-letters.png (the decision sheet; masked = letters hidden)
- ${C}/sep22-decide.png (a checks-held day's sheet), ${C}/nov14-decide.png, ${C}/nov14-decide-dark.png (a split day's sheet)
- ${C}/sep25-before.png (the day after, nothing decided yet)
- ${C}/sep21-asis.png (after publishing Thu as is), ${C}/sep22-dont.png (after don't publish, Fri and later), ${C}/sep23-after.png, ${C}/sep25-after.png, ${C}/sep25-after-canvas.png, ${C}/sep-runs.png
- ${C}/nov14-dev-news.png (someone who may not decide), ${C}/sep21-ana-canvas.png, ${C}/sep21-ana-zone_hour-news.png (a viewer trips is closed to)
Answer as an on-call engineer seeing it for the first time: within five seconds, is it obvious the day is paused, why,
and what readers see meanwhile? What would each option publish, read from the drawings alone (then check against the
words)? Is it said that publishing as is overrides a failed check, and that a reason is needed? How many taps to decide?
After deciding, is it clear what readers now see and that it was recorded? Does the restricted viewer see anything their
policy closes? Is anything wordy, confusing, contradicting a number, or misleading? List issues with the image, the
element and a fix.`
const ISSUES = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { where: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['where', 'what', 'fix', 'severity'] } } }, required: ['issues'] }

phase('Judge')
// The explorer drives the browser and takes longest: it starts first, beside the judges.
const [ex, g1, g2, m, d, r, fa, hon, cv, abr, dec] = await parallel([
  () => agent(explore, { label: 'explore', phase: 'Explore', schema: ISSUES }),
  () => agent(glance('an on-call data engineer'), { label: 'glance:oncall', phase: 'Judge', schema: GLANCE }),
  () => agent(glance('a business analyst new to data pipelines'), { label: 'glance:newcomer', phase: 'Judge', schema: GLANCE }),
  () => agent(masked, { label: 'masked', phase: 'Judge', schema: MASK }),
  () => agent(detail, { label: 'detail', phase: 'Judge', schema: DETAIL }),
  () => agent(reconstruct, { label: 'reconstruct', phase: 'Judge' }),
  () => agent(falseAlarm, { label: 'false-alarm', phase: 'Judge' }),
  () => agent(honesty, { label: 'honesty', phase: 'Judge', schema: ISSUES }),
  () => agent(cvd, { label: 'colour', phase: 'Judge', schema: ISSUES }),
  () => agent(ab, { label: 'old-vs-new', phase: 'Judge' }),
  () => agent(decideTask, { label: 'decide', phase: 'Judge', schema: ISSUES }),
])

phase('Grade')
const FIX = {
  type: 'object',
  properties: {
    scores: { type: 'string', description: 'per task: correct/total, with the misses named' },
    previous: { type: 'string', description: 'for each of last round’s fixes: fixed / partly / not fixed, with evidence' },
    falseFacts: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, where: { type: 'string' }, what: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, sources: { type: 'array', items: { type: 'string' } } }, required: ['title', 'where', 'what', 'fix', 'severity', 'sources'] } },
    verdict: { type: 'string', description: 'is it visual-first, with one or two sentences, and honest? what is the biggest remaining gap?' },
  },
  required: ['scores', 'previous', 'falseFacts', 'fixes', 'verdict'],
}
const grade = await agent(`${ABOUT}
Grade the judges against the key, then merge every reported issue (deduplicated, each with its sources) into one fix
list ranked by severity: what misleads first, then what confuses, then what is wordy or merely rough. Be strict. Don't
open files unless you must check a disputed claim (images are in ${C}).

${KEY}

Last round's ranked fixes (titles; say for each whether it is now fixed, partly fixed or not fixed, from the evidence
above): ${JSON.stringify(args?.previous ?? [])}

Glance (on-call): ${JSON.stringify(g1)}
Glance (newcomer): ${JSON.stringify(g2)}
Masked: ${JSON.stringify(m)}
Detail: ${JSON.stringify(d)}
Reconstruction: ${r}
False alarms: ${fa}
Honesty: ${JSON.stringify(hon)}
Colour: ${JSON.stringify(cv)}
Old vs new: ${abr}
Explorer: ${JSON.stringify(ex)}
Decision sheet: ${JSON.stringify(dec)}`, { label: 'grade', phase: 'Grade', schema: FIX })

return { grade, raw: { g1, g2, m, d, r, fa, hon, cv, abr, ex, dec } }
