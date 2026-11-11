# UI for a day's news, model checks and remedies: research notes (2026-11-11)

Asked by the maintainer before the UI pass on the news story, the models' cards and the decision sheet. Gathered from
web search results (page snippets and summaries); several vendor sites could not be opened from the session's network,
so where a source didn't say something it isn't claimed here. Lines marked *(inference)* are the researcher's synthesis.

## Principles

1. **Lead with the conclusion, then detail in order of need** (inverted pyramid; NN/g). The news card's order: head,
   visual, cause, what it reaches, fix.
2. **A fixed SBAR order** (situation, background, assessment, recommendation): moderate evidence as a handoff
   structure (Müller et al., BMJ Open 2018); useful, not proven.
3. **Alert only on what is urgent, important, actionable and real; alert on symptoms, put causes inside the alert**
   (Ewaschuk, "My Philosophy on Alerting"; Prometheus alerting practices). A model's finding is a cause told in the
   day's story, not an alert of its own *(inference)*.
4. **Few alerts: fatigue is measured and large.** Clinical decision-support alerts are overridden 46–96% of the time
   (JMIR Med Inform 2020); tailoring by role helped most (AHRQ PSNet summary of Hussain et al. 2019).
5. **Always draw the expected band and say what it was learned from**: Elementary's grey expected range with the
   training period's points grey; Soda's learned *expected* range clipped to a person's *valid* range.
6. **Explain the cause as ranked explanations with evidence** (Anomalo ranks slices by how much of the bad rows they
   hold, "1.4% of good rows", with sample rows; Datadog Watchdog Explains splits an anomaly by tags).
7. **Blast radius on the incident** (Monte Carlo field-level lineage): lineage says where, not always why.
8. **One tap to say "this is normal", saying what it does to the model**: Bigeye's adapt or maintain thresholds,
   Metaplane's kinds of normal, Soda's "mark as expected" kept as an audit trail.
9. **Small, data-dense charts** (Tufte's sparklines; Few's bullet graph: a dot, not a bar, on an axis not from zero).
10. **Calibrate trust: say how well the model does, not only what it found** (Google PAIR, Explainability + Trust;
    Microsoft HAX guidelines, Amershi et al., CHI 2019).
11. **Uncertainty as counts of outcomes** (quantile dotplots, Kay et al. CHI 2016; Fernandes et al. CHI 2018; "1 in 10"
    reads better than "10%").
12. **A classifier check is "can today be told apart?", with the columns that give it away** (Evidently's
    domain-classifier drift: AUC against a random classifier's 95th percentile for small samples; Eurybia's framing,
    0.5 alike, 1 apart; "Failing Loudly", Rabanser et al. NeurIPS 2019: good for describing a shift).
13. **Rank drivers by impact, not drift alone** (Arize's drift × importance; PSI's caveats). Per-point forest
    explanations exist (DIFFI, arXiv 2007.11117; arXiv 2112.06858); no user study of presenting them was found.
14. **Prefer undo to confirmation; confirm only what can't be undone** (NN/g, Confirmation Dialogs).
15. **Never colour alone; contrast and target size** (WCAG 1.4.1, 1.4.11, 2.5.8 / 2.5.5 at 44×44; Carbon's status
    indicators: at least three of label, shape, colour, symbol).

For remedies: **flag every filled or imputed value with its method, and publish the share** (NCES standard 4-1; FAO);
**a recommendation is a default, so give its reason** (Jachimowicz et al. 2019 meta-analysis; forced active choice for
what publishes); **write, audit, publish** is a paused day's mental model (Monte Carlo circuit breakers; WAP).

## Layouts

**The news card** (SBAR): a status strip (shape, word and colour), a head of six words or fewer in plain words, one
full-width visual with today against the learned band labelled directly (history muted, today in the status colour),
the cause in one sentence with its evidence ratio and other explanations behind a tap, what it reaches (held outputs),
the proposed fix as one primary button with "Other choices", and "This is normal" with copy and share. Head, visual and
fix visible without scrolling *(inference)*.

**The model card**: the verdict in words, with the model's own record ("flagged 3 of the last 90 days"). The forest: a
strip of earlier days' scores with today marked, said as a count ("1 of 120 days scored higher"), then the columns that
pushed it. The classifier: an AUC track from 0.5 to 1 with its threshold, "can't tell apart" to "easy to tell apart",
today as a dot; the columns that give it away; sample rows behind a tap. Learned findings warn unless a written rule
agrees. Feedback ("expected", "a real problem") recorded with a reason.

**The remedy sheet**: a bottom sheet that doesn't cover what it acts on; a row a remedy, 48 px or more, its name, a
one-line consequence and three attributes: what is published, what it costs (stale or wrong), reversible or final. One
"Recommended" with its reason; nothing preselected for what publishes. Remedies the owner hasn't allowed are hidden or
shown disabled with why (no vendor example was found; a proposal). Reversible choices apply with undo; publishing as is
or not publishing get a summary step. Filled rows carry their mark and share wherever they are read.

## Anti-patterns

An alert a check; alerts with nothing to do; a bare score or AUC with no reference; model output with no rationale or
record; colour alone; a confirmation on every choice, or an irreversible publish in one tap; a preselected
recommendation with no reason; silent filling; full-screen sheets over the chart they decide on; drivers ranked by
drift alone; decoration over data; learning from the day being judged.

## Sources

NN/g: inverted pyramid, confirmation dialogs, bottom sheets, progressive disclosure (nngroup.com). SBAR: Müller et al.,
BMJ Open 2018 (pmc.ncbi.nlm.nih.gov/articles/PMC6112409); AHRQ PSNet. Ewaschuk, My Philosophy on Alerting; Prometheus
alerting practices (prometheus.io/docs/practices/alerting); Google SRE postmortem culture (sre.google). JMIR Med
Inform 2020 (medinform.jmir.org/2020/7/e15653). Elementary docs (automated volume, training period); Soda docs (metric
monitor page, custom monitors); Anomalo blog, root-causing data failures; Datadog docs, Watchdog Explains; Monte Carlo
field-level lineage and circuit breakers announcements; Bigeye autothresholds docs and triage blog; Metaplane docs (new
normal annotations, model feedback); Great Expectations result format; Sentry issue details. Tufte, sparkline theory
and practice; Few, bullet graph design specification. Evidently data drift algorithm; Eurybia (KDnuggets 2022);
Rabanser et al., Failing Loudly (arXiv 1810.11953); Arize glossary and drift templates; DIFFI (arXiv 2007.11117);
arXiv 2112.06858; Google PAIR guidebook; Microsoft HAX toolkit; Kay et al. 2016 and Fernandes et al. 2018 (MU
Collective, UW IDL). Jachimowicz et al. 2019, defaults meta-analysis; NCES standard 4-1; FAO imputation guidance;
Dataiku up/down fill. Carbon status indicator pattern; WCAG 2.2 (Deque); TetraLogical on target size.
