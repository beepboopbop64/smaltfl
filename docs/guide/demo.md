# A walk through the demo

**[Open the demo](/app/){target="_self"}** beside this page. It is the **control estate**: an inventory of 600
applications, each typed (internet-facing or not, critical, high or standard, the data it holds, where it runs:
cloud, on premises or SaaS), and twelve security controls, each its own daily file covering only the applications it
applies to. Five controls run on dates (a pentest or a DR exercise a year, access reviews a quarter, vulnerabilities
thirty days after Patch Tuesday), so a pass rate can flip for a day without anything being wrong.

The data is synthetic, from a fixed seed, with a year of history before March 2024 and trouble planted in March in
three layers: the obvious, contradictions and scope, and look-alikes beside one real problem. Nothing that judges the
days knows where it is planted.

## The flow

The canvas shows the flow as four notebooks:

- **controls**: the twelve control files and the inventory (`apps`), each checked at **bronze** (the file as it came:
  its columns, its amount, its key, the applications it should cover).
- **posture**: every application's standing on every control, one row an application, joined from the checked
  controls (**silver**). Key rotation needs encryption at rest: an application passing one while failing the other is
  counted as a contradiction.
- **scores**: each application scored: the controls that apply, passed, failed by name, excepted, not assessed, and a
  standing (passing, failing one or two, at risk with three or more).
- **summary**: what leadership reads (**gold**): failing applications by business unit, by control and by type of
  application; standings by hosting and criticality; each control's failures by hosting and criticality; the controls
  failed together.

Tap a notebook's box to read it as a page: each step's SQL, its output under it, what a rule caught, and the day's
news about it. At the bottom, **Your cells** lets you write SQL of your own over any dataset by name (today's
version). Your cells are kept in your browser and change nothing the flow computes.

## A calm day

Choose **Wed 6** in the strip. The status line says *A normal Wednesday*: every watched dataset is within what the
year taught it, and everything published.

Open the **summary** box, or tap the **control_by_type** card and its **Data** tab. **At a glance** is a heat table:
each control's failure rate by hosting and criticality, the darkest the worst, and the cells most out of line with
their row named in words: MFA fails on SaaS applications, backups and central logging on premises. **failed_together**
shows which controls fail together: of the applications failing key rotation, all fail encryption at rest.

**app_scores** lists the worst applications first, with the controls each fails.

## A held day

Choose **Mon 4**. The status line says the day is paused: the MFA file came with no rows. Tap the **mfa** card: its
**News** leads with what happened in one sentence, the picture against the learned band, what it reaches (the
posture, the scores and the summaries wait) and the fix. Readers keep Fri 1's version until someone decides.

The decision sheet opens the choices the file allows, each with what it publishes and whether it can be undone:
publish as is, keep it back, or fill from another day (a file with no rows is never offered a new level to accept).
One is recommended, with its reason. The sign-in
demo's ontology allows only carrying a day forward or back, or replacing the file: a choice it doesn't allow is not
offered.

## The other planted days

| Day | What happened | What holds it |
|---|---|---|
| Mon 4 | The MFA file has no rows | its amount (bronze) |
| Thu 7 | The logging file lacks a column | the schema check: the file is refused and nothing is built |
| Fri 8 | Key rotation passes for 41 applications failing encryption at rest | the posture's dependency rule (silver) |
| Tue 12 | Three in five WAF rows fail | the WAF's written band, 0–15% |
| Wed 13 | WAF rows for 40 applications that aren't internet-facing | the scope the ontology gives the file |
| Thu 14 | Vulnerability due dates cluster after Patch Tuesday | nothing: a look-alike, published |
| Fri 15 | Half the pentests are due, the usual one in ten late | nothing: a look-alike, published |
| Tue 19 | A scanner outage: 45% of backups not assessed | the not-assessed band every control shares |
| Thu 21 | The TLS file came twice | its key: 203 applications repeat it |
| Sat 23 on | Six in ten DR exercises due Fri 22 ran late | the DR file, day after day, until they complete |
| Tue 26 | No TLS rows for Payments' internet-facing applications | the scope rule: 50 applications with no row |
| Fri 29 | Quarterly access reviews due, the usual lateness | nothing of its own: a look-alike (the DR backlog still holds the day) |

The DR backlog is the one SLA day that is a real problem. Late exercises take weeks to complete, so the file stays
off and each day after it is held too: decide Sat 23 and see what the next days say.

## Checks

A card's **Checks** tab shows its gate: each check, written or learned, and whether it holds, warns or is off. A
written check holds a day; a learned one warns unless the value is one the ontology marks bad. On a gold card the
seal says the run's gates passed (or its holds were decided) and is signed by the owner.

## The ontology

The **Ontology** view lists each file with what its columns mean and the rules its rows are held to, each saying how
it came to be. The owner can rename a column, reword its meaning, label its values and add a rule (required, one of,
a range, when … then), with an action (flag, drop, hold). A source's **Rules** tab switches each rule on or off for
this flow, which writes the check cell in its notebook.

## Models

On a watched dataset, **Models** shows the two checks nobody wrote. The isolation forest scores the day against the
days it learned from (a tick a day, the cut, today), with what moved most. The classifier asks whether today's rows
can be told from like days' (an AUC from 0.5, can't tell apart, to 1), with the columns that give today away. Each
shows its record over the days it has run. Neither holds a day. Ids, keys and free text are left out by default.

## Runs and the record

**Runs** lists every run with its manifest's hash, and **verify** recomputes a run from its inputs. Every decision is
an entry in a hash-chained record; the audit bag downloads the run, the record and the files for an offline check
(`node scripts/audit.mjs check BAG.zip`).
