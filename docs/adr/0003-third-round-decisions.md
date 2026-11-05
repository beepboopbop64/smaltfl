# ADR 0003: The ontology screens, the scenario's actions, the mark on hold

- **Status:** accepted
- **Date:** 2026-11-05
- **Builds on:** [ADR 0001](0001-initial-decisions.md), [ADR 0002](0002-second-round-decisions.md)

## Context

The third round of the design interview ([../OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md), round 3): feedback on the
ontology concepts (A4 and A5 on the design canvas "smaltfl app concepts") and on brand round 3.

## Decisions

1. **The ontology screens are good enough for now.** The map (A4) shows the object types, each with the dataset
   behind it; named links, each pointing from the many side to the one; actions attached to the types they edit; and a
   details panel for the selected type with its key, properties, links, actions and policy. Browsing objects (A5) goes
   through the policies, so "View as" shows exactly what a recipient would see, and an action's form shows its
   permission check before anything is submitted. They are revisited once the code exists. (Q-39)
2. **The scenario has three actions,** as A4 and A5 show them: *Exclude trips* (stewards mark bad records, and
   `trips_clean` drops them on the next run), *Set zone service target* (a district lead, for zones in their own
   district only), and *Annotate weather event* (anyone the flow is shared with labels a period, used to split the
   analysis). (Q-36)
3. **The mark is on hold.** Round 3's wave marks go to stenhoor before one is picked. Cobalt teal stays (ADR 0002
   §5), and nothing goes to the `smalt-brand` fork until a mark is picked (ADR 0002 §7). (Q-29)

## Consequences

- **The ontology can move from concepts to code:** the types in the flow document, the edits, refusals and audit log
  in the database ([ARCHITECTURE.md](../ARCHITECTURE.md) §8).
- **Every action writes through the same path:** the action rule and the row scope are checked first, and the edit or
  the refusal is recorded, hash-chained, in both cases. Each of the three actions exercises a different part of that
  path: a filter that feeds a later step, a write limited to rows in scope, and a write open to every recipient.
- **The concepts now cover every view the builder's top bar names:** Flow (A3), Ontology (A4 and A5), Runs (A6) and
  Policies (A7), linked so they can be clicked through as one prototype. A6 and A7 are in review (Q-40), and A7 raises
  how row rules pass through aggregates (Q-41).
