# ADR 0002: Identity, districts, snapshots, the builder, the colour

- **Status:** accepted
- **Date:** 2026-11-05
- **Builds on:** [ADR 0001](0001-initial-decisions.md)

## Context

The second round of the design interview ([../OPEN_QUESTIONS.md](../OPEN_QUESTIONS.md), round 2), the first brand
round, and a clarification about the UI.

## Decisions

1. **Identity cards, for now.** Each person's smaltfl creates a key pair in their browser (WebCrypto, kept in
   IndexedDB, never exported). Their card (name, public keys, a fingerprint) is a small file or link they send to
   whoever shares with them, who adds them as a principal and gives them attributes. Sign-in through GitHub or another
   provider arrives with the server and maps onto the same principals. (Q-31)
2. **A district is a borough.** Manhattan, Brooklyn, Queens, the Bronx, Staten Island, and Newark airport, from the
   TLC zone table. Policies can also name zones, so "airports only" works. (Q-32)
3. **Snapshots within a budget.** Every input snapshot is kept by hash, within a storage budget the user sets; the
   oldest unpinned snapshots go first, and runs that were shared or pinned keep theirs. A run whose snapshot is gone
   can still be verified against its hashes, but not recreated. (Q-33)
4. **A visual builder for data engineering.** The heart of the UI is a flow builder in the spirit of Palantir
   Foundry's Pipeline Builder (credited, not copied): a graph of typed steps set up visually, where every step opens
   into its sub-steps, their settings, the SQL it runs, a preview of its data, and its output schema with column
   lineage and the policies that apply. "No UI framework" in ADR 0001 §11 means the UI is built without a library
   such as React, as smaltbi's designer is; it does not mean less UI. The first concepts are on the design canvas
   "smaltfl app concepts" (the builder, and a step opened). (Q-22, clarified)
   *Amended after the first concepts:* the canvas is open, a grid where steps go anywhere and groups hold any number
   of them, rather than fixed lanes with one box per section (concept A3).
5. **The colour is cobalt teal** (`#00786F` fill, `#006861` text, `#4FD1C5` on dark), picked in brand round 1. It is
   closer to smaltui's cerulean (CIE76 36 / 34) than the teal judged too close by eye in smaltdf's round (38), so the
   pick goes to stenhoor with that note. (Q-28)
6. **No mark yet.** None of round 1's marks felt like a flow; the bars (Stages) came closest. Round 2 explores marks
   that read as flow, in cobalt teal, including one that needs a curve. (Q-29)
7. **Brand work goes through a fork.** `beepboopbop64/smalt-brand` holds the `brand/smaltfl` change, offered to
   `stenhoor/smalt-brand` as a pull request once the mark is picked. (Q-30)

## Consequences

- **Identity is cryptographic from the first version.** Sharing needs an identity card from each recipient; the UI
  must make creating, sending and adding cards simple, since that is the one step a recipient has to do.
- **The scenario's policies are by borough** (SCENARIO.md §5): Ana, Manhattan; Ben, Brooklyn and Queens; Cara, the
  airport zones; Dev, every district without fare columns.
- **Storage use is visible.** The app shows what snapshots take and lets the user pin, unpin and set the budget.
- **The builder sets the order of work for the UI:** the graph and the step view come first, then ontology, runs and
  policies, which the builder's top navigation already names.
