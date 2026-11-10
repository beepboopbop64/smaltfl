// A panel of judges over a capture of tools/browser/stops/estate.json: the control estate's screens read against the
// maintainer's goal for the leadership work (docs/OPEN_QUESTIONS.md, Q-120 to Q-131). Run with Claude Code's Workflow
// tool:
//
//   node tools/browser/tour.cjs <dist/app-estate copy> <captureDir> $PWD/tools/browser/stops/estate.json
//   Workflow({ scriptPath: 'tools/judges/estate-panel.workflow.js', args: { metrics: '<captureDir>/metrics.json' } })
//
// Six lenses read the screens (a leader's ten-second glance, the layers as a flow, ten leadership questions, the
// options and their trade-offs, honesty against the answer key, and the two-minute brief), and a grader marks the
// briefs against ADR 0014's answer key. Only the honesty judge and the grader are given the key. First run on
// 2026-11-10 at b37762a: the two-minute test scored 29 of 35 (docs/HANDOFF.md, "The review of 2026-11-10").
export const meta = {
  name: 'smaltfl-estate-panel',
  description: 'A panel reads the control estate\'s captured screens against the leadership goal, and grades a two-minute brief against the answer key',
  phases: [
    { title: 'Judge', detail: 'six lenses read the screenshots' },
    { title: 'Grade', detail: 'the two-minute briefs graded against the answer key' },
  ],
}

if (!args || !args.metrics) throw new Error('args.metrics: the absolute path of the capture\'s metrics.json')
const METRICS = args.metrics

const BASE = `You are one judge on a panel reviewing screenshots of a web app called smaltfl: a data-pipeline tool that runs in the browser, checks each day's data at three layers (bronze = files as they arrive, silver = after joins, gold = what people read) and pauses a day that is off until someone decides. The screenshots were taken from the built app at phone size (390 px wide).
${METRICS} is JSON: { metrics: [...] }. Each entry has: name, what (which day and screen it is), screenshot (the absolute path of a PNG: open it with the Read tool), status (the app's status line), state, words, charts (the number of drawings on that screen) and text (the screen's text: a tall screenshot's small type can be hard to read, so use it). The app is the "Control estate": 600 applications and twelve security controls, each control arriving as its own daily file, joined into a posture and summarised by unit, control and type; March 2024, with problems planted on some days.
The product owner's goal, in their words: "a visual first flow that checks quality and can easily answer any data question for leadership quickly and correctly with visuals and next potential steps with the drawbacks and benefits clearly described". Their measure: "on my phone or wherever, I should be able to find a problem or explore the data and within two minutes give leadership a clear, easy-to-digest explanation of a problem or a question, and a solution I can implement."
RULES: Judge only what the screens show. Read the metrics first, then LOOK at the screenshots your lens needs. Do not read the app's source code or documentation, do not run anything, do not modify files. Name the screen (its name) and quote the words you are judging. Say what works in one line and spend your words on what does not. Your structured output is data for an orchestrator.`

const JUDGE = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'At most 200 words: the verdict of your lens.' },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          screen: { type: 'string' },
          finding: { type: 'string', description: 'What you saw and why it matters, at most 70 words, quoting the screen.' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'works'] },
        },
        required: ['screen', 'finding', 'severity'],
      },
    },
    answers: {
      type: 'array',
      description: 'Only for lenses asked questions or asked to write briefs: one entry a question or a day.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          where: { type: 'string' },
          taps: { type: 'string', description: 'your estimate of taps from opening the app, or "could not"' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low', 'could_not_answer'] },
          missing: { type: 'string' },
        },
        required: ['question', 'answer', 'where', 'taps', 'confidence', 'missing'],
      },
    },
    proposals: {
      type: 'array',
      description: 'Concrete changes, most valuable first, at most 8.',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' }, benefit: { type: 'string' }, drawback: { type: 'string' } },
        required: ['title', 'detail', 'benefit', 'drawback'],
      },
    },
  },
  required: ['summary', 'observations', 'proposals'],
}

// ADR 0014's answer key (docs/adr/0014-gates.md, "The answer key"), in the words a judge needs, Mon 4 and Thu 21 as
// ADR 0015 amends them ("What moves on the estate").
const KEY = `THE ANSWER KEY for the estate's March 2024 (what was planted, and what the app is meant to say):
- Mon 4: the MFA file has no rows -> bronze mfa, amount, hold: "Almost no apps: 0"; the scope's "600 in scope with no app" follows from the amount and never leads it.
- Thu 7: the logging file lacks its retention_days column -> bronze logging, schema, hold: "file has 4 of 5 columns" (a held day, not a failed run).
- Fri 8: key rotation passes where encryption at rest fails -> silver posture, needs, hold: "41 pass key rotation while failing encryption".
- Tue 12: the WAF pass rate collapses -> bronze waf, values on a written band, hold: "Failing 60%, the band is 0-15%". A real problem: the right fix is NOT to publish as is.
- Wed 13: WAF rows for applications that are not internet-facing -> bronze waf, scope, hold.
- Thu 14, Fri 15: vulnerability due dates cluster (Patch Tuesday) -> a look-alike, NOT a problem: a note ("312 due, 9% late, as usual"); publishes.
- Fri 15, Sat 16: half the pentests due -> a note; publishes.
- Tue 19: backup scanner outage -> bronze backup, the band on not_assessed, hold.
- Thu 21: the TLS file's rows arrive twice -> bronze tls, its key (reconcile), hold: "203 apps repeat a key"; the amount ("More apps: 406 (+100%)") follows from the key; and the posture's reconcile says the same (203 apps repeat a key).
- Fri 22, Sat 23: six in ten DR exercises late -> bronze dr_exercise, due, hold: "49 due, 61% late; usually 10%". A real SLA problem. The due check reads yesterday's cohort: a capture that skips Fri 22 cannot show it on Sat 23.
- Tue 26: no TLS rows for the Payments unit -> bronze tls, scope, hold.
- Fri 29, Sat 30: access reviews due -> a note; publishes.
- Every other day (Wed 6): publishes and seals.
Facts: 600 applications in the inventory; the WAF and TLS files cover about 203 internet-facing applications; every control's file and the posture have one row an application.`

const LENSES = [
  {
    key: 'leader-glance',
    prompt: `${BASE}

YOUR LENS: you are a senior leader (a CISO or a VP) who has never seen this app and is handed a phone. You give each screen about ten seconds. You do not know what a gate, a hold, a manifest, a band or a notebook is, and you will not read code.
Read the Flow views, every News screen, the gold Data screens and the Results views, a held day first. For each give one observation: in your own words what it is telling you; whether you could say "the numbers are safe to use today" (yes, no, cannot tell); what you would do next; every word, abbreviation or symbol you did not understand; and whether the first thing your eye landed on was the most important thing. In the summary say what stops you getting a clear answer in ten seconds. In proposals, say what you, as the leader, would want this to look like.`,
  },
  {
    key: 'layers-flow',
    prompt: `${BASE}

YOUR LENS: does the pipeline read as a FLOW through three layers of quality checks (bronze, silver, gold), visually, at a glance? You are an information designer who knows flow builders and phone UI.
Look at every Flow view (folded, unfolded, dark, the held days), the notebook sheet and the Checks screens of a bronze, a silver and a gold card. Answer: (1) from the Flow view alone, can a newcomer tell there are three layers, which card is in which, and the order data moves? What carries the layer today? (2) On a day with a problem, can you see WHERE in the flow it stopped, what waits downstream, and what still went out? (3) On a calm day, can you see that gold is sealed, and what that rests on? (4) How much of the flow fits a phone screen, and what is hidden? (5) The Checks tab: is the difference between the three gates visible? Is written against learned clear? What would a non-engineer take from it? (6) Anything that reads as broken, cramped, cut off or misleading.
In proposals, give concrete visual designs (layout, marks, words, counts), each with its benefit and drawback.`,
  },
  {
    key: 'ask-questions',
    prompt: `${BASE}

YOUR LENS: you are the analyst who owns this app, and leadership has just asked the questions below. Using ONLY what the screens show, answer each as you would send it, one entry in "answers" a question, with the taps you estimate from opening the app, your confidence, and what was missing. If no screen answers it, say "could not" and what you looked for.
1. Which business unit has the most applications failing transport encryption (TLS), and how many?
2. Across the estate, which control has the most failing applications right now, and what share of the applications it applies to is that?
3. Is our web application firewall (WAF) pass rate getting better or worse over the last few weeks? Show me.
4. On Tuesday March 12, can I rely on the posture numbers I am about to present? Why or why not?
5. What exactly went wrong on March 12, how many applications does it touch, and which business units?
6. What are my options for March 12, and what does each one cost me or risk?
7. On Friday March 8, how many applications pass key rotation while failing encryption at rest, and which ones?
8. There was a jump in vulnerability failures around March 14. Is that a real problem or business as usual?
9. Which applications are critical, internet-facing and failing more than one control? (a question nobody prepared for)
10. How many days this month was the data held back, and what was decided each time?
In observations, say which kinds of leadership question the app can answer, which it cannot, and where you read a table or did arithmetic yourself. In proposals, describe the surface that would have let you answer each in under two minutes.`,
  },
  {
    key: 'options-tradeoffs',
    prompt: `${BASE}

YOUR LENS: "next potential steps with the drawbacks and benefits clearly described". Find every place a person is offered a next step: the Fix part of a brief, a decision sheet, the feedback part of a Checks tab, "Mark as expected", Decide, the hold, warn and off switches.
For each option record: its exact words; whether the screen states (a) what it does, (b) who is affected and what they will see, (c) its benefit, (d) its drawback or risk, (e) whether it can be undone and how, (f) who may take it, (g) the evidence it rests on, and (h) which option the app proposes and why. Say plainly where a proposed option looks wrong or unexplained. Say whether any step is about the PROBLEM the data shows (who to ask, what waiting costs), not only about the data.
In proposals: an option card for a phone that states gain and cost without becoming a wall of text (fields, word limits, layout), a held day's options rewritten in it from the screens' facts alone, and how two or three options are compared in one drawing.`,
  },
  {
    key: 'honesty-consistency',
    prompt: `${BASE}

YOUR LENS: honesty and consistency. You have the answer key below; the other judges do not. Check every screen for: statements false or misleading against the key; screens that contradict each other or themselves (a paused day titled as normal; "Nothing out of the ordinary" under a hold; a proposed fix that does not fit the finding; a cause that names the wrong file); numbers that disagree between screens or are rounded differently; a chart whose scale hides the point or that draws the wrong measure for the day's problem; a state shown by colour alone; symbols and words with no explanation on the screen (list each once); buttons that invite a wrong action; anything a leader could quote upward that would turn out untrue. Check the look-alike day and the calm day: does anything look alarming that should not?
${KEY}
Rank the observations by how badly each would mislead a leader. In proposals, the smallest changes that would make the held days' briefs true and consistent.`,
  },
]

const BRIEFER = `${BASE}

YOUR LENS: the two-minute test. You are the engineer on call. For each day in the capture (group the screens by the day in their "what") you have two minutes and only that day's screens. Write, in "answers" (question = the day), exactly what you would send leadership: what happened in one sentence, its impact, its cause as far as the screens show, and the fix you propose with its main benefit and drawback. Use only what the screens say; do not guess. In "missing" say what you could not tell. In observations, note which screen gave you each fact fastest and where the screens sent you the wrong way.`

const GRADE = {
  type: 'object',
  properties: {
    grades: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string' },
          what_happened_right: { type: 'boolean' },
          number_right: { type: 'boolean' },
          impact_right: { type: 'boolean' },
          fix_fits: { type: 'boolean' },
          nothing_false: { type: 'boolean' },
          note: { type: 'string', description: 'What was wrong or missing, and whether the screen or the reader is to blame. At most 60 words.' },
        },
        required: ['day', 'what_happened_right', 'number_right', 'impact_right', 'fix_fits', 'nothing_false', 'note'],
      },
    },
    total: { type: 'string', description: 'points scored of points possible' },
    screen_faults: { type: 'array', items: { type: 'string' }, description: 'Faults of the screens, not of the reader, that cost points, most costly first.' },
  },
  required: ['grades', 'total', 'screen_faults'],
}

const judged = parallel(LENSES.map((l) => () => agent(l.prompt, { label: `judge:${l.key}`, phase: 'Judge', schema: JUDGE }).then((r) => ({ key: l.key, result: r }))))

const brief = agent(BRIEFER, { label: 'judge:two-minute-brief', phase: 'Judge', schema: JUDGE }).then(async (b) => {
  if (!b) return { result: null, grade: null }
  const grade = await agent(
    `You are grading a two-minute test of a data app (tools/judges/two-minute.md). A reader was given only the app's screens for several days and wrote what they would send leadership. Grade each day's answer against the answer key on five points, each true or false: the day and what happened are right; the number is right; the impact (what waits, what readers see) is right; the proposed fix fits the problem; nothing false is stated. A calm or look-alike day scores on saying nothing is wrong and proposing nothing drastic. Where an answer is wrong or thin, say whether the screens misled the reader (you may open the screenshots listed in ${METRICS} with the Read tool to check what a screen said) or the reader erred. Do not read source code. Do not modify files.

${KEY}

THE READER'S ANSWERS (JSON):
${JSON.stringify(b.answers ?? [], null, 1)}

THE READER'S OWN NOTES:
${JSON.stringify((b.observations ?? []).slice(0, 20), null, 1)}`,
    { label: 'grade:two-minute-brief', phase: 'Grade', schema: GRADE },
  )
  return { result: b, grade }
})

const [panel, briefed] = await Promise.all([judged, brief])
const out = {}
for (const p of panel.filter(Boolean)) out[p.key] = p.result
out['two-minute-brief'] = briefed
return out
