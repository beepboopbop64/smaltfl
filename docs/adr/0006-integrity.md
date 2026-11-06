# ADR 0006: Integrity from source bytes to the record

- **Status:** accepted
- **Date:** 2026-11-06
- **Builds on:** [ADR 0001](0001-initial-decisions.md) §8 (hashes and provenance), [ADR 0002](0002-second-round-decisions.md)
  §1 (identity cards), [ADR 0004](0004-the-flow-plan.md) (the flow plan)

## Context

The owner asked for "the ability to hash all the way through", file integrity monitoring and data integrity for
audits: an auditor should be able to take any published number back to the exact bytes it came from, and see that
nothing in between, data or history, was changed unnoticed.

smaltfl already hashed a lot (ARCHITECTURE §6): the flow, the typed plan, every step's key (Merkle-style over its
inputs' keys), every stored dataset's rows as an exact, order-free multiset, an ontology edit chain, and a run
manifest that a run can be verified against, at two levels (the stored hashes, and a recomputation from the
snapshots). A review of the code (with probes on the in-process engine) found where the chain breaks:

- The bytes of each day's file were used without checking the sha256 the data branch publishes for them; the zone
  lookup, the weather and the history came with no hash at all. A source's "snapshot" is the hash of the rows a
  decoder made of the file, not of the file, and no run says which file it read.
- verify checked each stored table against the manifest, but not the manifest against its plan, nor the keys, nor
  the view a dataset name points at, nor the link to the previous run. Someone with access to the engine could
  rewrite a snapshot, its outputs, the manifest and its hash consistently, and verify passed.
- Flow edits were not recorded. The data log (actions on findings) was an untagged hash chain in localStorage that
  passed when cut short or rewritten, and its check was never shown. The ontology edit chain, the data log and the
  run chain referenced nothing of each other, and nothing was anchored outside the browser.
- An auditor had nothing to take away and check.

Research (file integrity monitoring as NIST SP 800-53 SI-7 and PCI DSS 11.5 describe it; audit trails under 21 CFR
Part 11 and ALCOA+; tamper-evident logs: RFC 9162 Certificate Transparency, Crosby and Wallach; provenance: SLSA,
in-toto, W3C PROV; content-addressed data: lakeFS, Dolt, Delta Lake, Iceberg; Palantir Foundry's lineage and audit
logs) points the same way: hash what was read and what was made at every step, keep one append-only record whose
growth can be proven (a Merkle tree, not just a chain), sign its head, keep a copy of the head somewhere the writer
cannot rewrite, and give the auditor a bundle they check with their own tools.

## Decisions

1. **What is proven, said plainly.** Four levels, never claimed beyond what was checked:
   - **Intact:** the hashes, keys, links and counts check. Against accidents and naive edits only: whoever can
     rewrite the whole store can rewrite it consistently.
   - **Recomputed:** every stored dataset was recomputed from the run's snapshots in this session and gave the same
     hashes and counts.
   - **Re-derived:** the source files' bytes, still pinned with the hashes the run recorded, were decoded again by the
     same external table and matched the snapshots, then recomputed. The same engine and decoders do it: it is not an
     independent decode (an auditor's own rerun is).
   - **Anchored:** the record is consistent with a checkpoint held outside this browser (a downloaded checkpoint, an
     auditor's copy). Only this level, or an audit bag checked offline, is evidence against someone who controls the
     browser.
   Numbers computed live in the page (profiles, odd rows, the news) are not hashed; the stored datasets and the
   expectation counts are. A finding records the evidence it rests on. Where the engine can't start a worker and runs
   in the page, the page and the engine share one realm: its hashes are then the page's own, and the app says so.
2. **The first hop is a gate (FIM).** Every data file the app reads (each day's trips, the zones, the weather, the
   history) is checked against the sha256 and size the data branch's MANIFEST.json gives for it, and MANIFEST.json
   itself against the hash `loads.json` carries, before it is used. A file that does not match is fetched once more,
   past any cache, then refused: the load does not run, the last intact run stays on screen, and the card says why,
   with both hashes and what can be done (fetch again, tell the data owner, export for audit). A network error is "not
   checked", never an alarm. What this record has seen before is the second baseline: a file that changed since this
   browser last read it, under a list that changed too, is "republished" (amber), not "corrupt" (red). The app is
   built knowing the list's commit, hash and size, and refuses a `loads.json` that names another: the list, its files
   and `loads.json` can't be swapped together without rebuilding the app. Only an auditor's check against the data
   branch proves the list is the data branch's.
3. **The engine observes the bytes.** The runtime plugin pins each source file inside the engine (`pin`): it hashes
   the bytes there, refuses a mismatch with the expected hash, and serves them through its own source (`smaltfl:`).
   A source that reads a pinned file must be the external table over it, one location and nothing else (not a view,
   not a query, not shadowed by a temporary object), so its rows are the file's: anything else is refused. The run
   records, for each such source, the file the engine opened for it: location, sha256 and size. A new engine worker
   gets the pinned files again, checked again.
4. **A run says everything it depended on (run/1).** The manifest adds the flow's policies and ontology hashes, the
   plugins and versions that decoded and ran it (the engine version checked against the engine itself), each source's
   file, the data branch commit and MANIFEST hash the page loaded from, and the record's head before the run (the
   last two labelled as the page's claims). The flow document is stored with the run, and the plugin refuses a run
   whose document does not hash to the plan's flow hash.
5. **verify checks the whole run.** Besides the stored hashes and the recomputation: *coherent* (the manifest agrees
   with the plan it names), *key* (every key recomputes), *published* (each dataset name points at the version the
   run made, through the exact view the runtime writes), *previous* (the run it chains to exists with that hash),
   *accounting* (rows in and out add up), *flow* (the stored document hashes to the plan's flow hash and translates
   to the plan), and, at the Re-derived level, *file* (the table still reads the pinned location, and the engine
   opened exactly the recorded bytes and decoded them to the snapshot). The caller says which manifest it means, and
   verify fails if the stored one isn't it. The app pins a run's own file again before re-deriving it.
6. **One record (log/1).** Runs (failed ones too), flow changes, file checks, actions on findings with the evidence
   they rest on, ontology edits with the policies and ontology in force, verifications, signatures, checks against a
   kept checkpoint, exports and imports go into one append-only record per flow and browser: an RFC 9162 Merkle tree,
   kept in IndexedDB, appended one entry at a time. Each run's manifest, plan and flow document are kept with it. A
   correction is a new entry that amends an old one; nothing is edited or deleted. Its head is signed as a checkpoint
   by this browser's identity (a non-extractable key kept in IndexedDB, per ADR 0002 §1). The record replaces the old
   data log, whose entries are imported once, verbatim, with whether their old chain held; the old copy is retired only
   once the record keeps them for good. An entry the store refuses is counted and shown. Where IndexedDB is missing,
   blocked or slow to answer, the record is kept for the visit only, and says so.
7. **Anchoring is the auditor's.** A checkpoint can be downloaded and kept elsewhere; a later record is checked for
   consistency against it (an RFC 9162 consistency proof), by the app or by `node scripts/audit.mjs consistent`. A
   server, a record branch or a public transparency log can witness checkpoints later.
8. **The audit bag.** An export is a BagIt 1.0 bag in a ZIP (no compression, no dependency): the record and its
   checkpoints, the identity card, every manifest, plan and flow document it names, what the engine holds of this
   visit's runs, the data branch's MANIFEST.json, an inclusion proof for each dataset of the latest run (against the
   head the bag names), and a readable account. The source files are left out (an auditor gets each from the data
   branch by its sha256). An auditor checks it with `sha256sum -c` and `node scripts/audit.mjs check`, from their own
   checkout, without trusting the browser that made it, bringing what the bag can't vouch for itself: the signer's
   fingerprint from its owner (`--signer`) and the data branch's list (`--list`, from `git show <Data-Commit>:MANIFEST.json`).
   It fails a proof for a dataset its run didn't make, a run whose files can't be checked against the list, a run
   whose plan is missing, and a run whose record head isn't the record's. It holds everything this browser holds:
   "owner only" is a convenience until principals are authenticated.
9. **On the canvas.** Integrity is shown apart from data health: a seal on a card beside its news dot. An input is
   sealed when the file the latest run read is one the data's list publishes; a step, when the latest run was
   re-derived from its files and every check of that step passed. A refused file or a failed check breaks the seal
   (a failed check of the whole run breaks every seal); nothing is sealed when the flow changed since the run; and the
   seal is amber where the engine runs in the page. Each card's Integrity tab traces it back to the files, full hashes
   in groups of four with a copy button; the Runs view shows the record and its head.

## Encodings

Unchanged: `key/0`, `plan/0`, `flow/1`, `dataset/0`, `edit/0`, `card-key/0`. Nothing is rebuilt.

- **E1 file digest.** Lowercase hex SHA-256 of the exact bytes the engine reads (the decoded Parquet, never the
  base64 text it travels as). Untagged on purpose, so it equals `sha256sum`, Python's `hashlib` and MANIFEST.json.
  It appears only in fields named `sha256`, beside `bytes`.
- **E2 run/1.** `hash = SHA-256(UTF-8("smaltfl/run/1\n" + JCS(m)))`, where `m` is
  `{ smaltflRun: 1, flow: { id, hash, policies, ontology }, plan, parameters, engine: { smaltdb, smaltfl },
  build: { smaltfl, plugins: [[name, version], …] sorted }, nodes, outputs, data, log, previous }`. `nodes` are as
  in run/0, and a source node read through a pinned file adds `file: { location, sha256, bytes }`. `data` is
  `{ commit, manifest }` or null, and `log` is `{ origin, size, root }` or null: the page's claims. `build.smaltfl`
  is the commit the code was built from, or `dev`. A signed share signs the same bytes. `manifestHash` reads the
  format from `smaltflRun`, so run/0 manifests still verify (shown as an older format, with no source files).
- **E3 log/1.** An entry is `{ smaltflLog: 1, origin, seq, kind, at, by: { card, as }, about, reason, amends,
  nonce }`: `seq` from 0, equal to its leaf index; `at` the device's clock; `by.card` the signer's fingerprint and
  `by.as` the principal the person acts as; `nonce` 128 random bits in hex, so a proof never reveals a guessable
  sibling. Leaf: `SHA-256(0x00 ‖ UTF-8("smaltfl/log/1\n" + JCS(entry)))`; node: `SHA-256(0x01 ‖ left ‖ right)`;
  the tree, inclusion and consistency proofs as RFC 9162 §2.1. Test vectors: RFC 6962's (size 1
  `6e340b9c…`, size 8 `5dc9da79…`).
- **E4 checkpoint/0.** Body: `<origin>\n<size>\n<base64 of the root>\n`, with origin
  `smaltfl/log/<flow id, percent-encoded>/<first 16 hex of the card fingerprint>`. Signed with ECDSA P-256 and
  SHA-256 over `UTF-8("smaltfl/checkpoint/0\n" + body)`, the signature as IEEE P1363 hex. Envelope:
  `{ checkpoint, signer: IdentityCard, signature }`.
- **E5 policies/0, ontology/0.** `hashOf("policies/0", doc.policies ?? null)` and `hashOf("ontology/0",
  doc.ontology ?? null)`.
- **E9 audit bag.** BagIt 1.0 (RFC 8493): `bagit.txt`, `bag-info.txt` (with the record's origin, size and root, the
  signer's full fingerprint, the smaltfl commit, the data commit, Payload-Oxum), `manifest-sha256.txt` and
  `tagmanifest-sha256.txt` as `<hex>  <path>` lines, the payload under `data/`, in a STORE ZIP.

Retired: the data log's untagged `sha256Hex(JCS(entry))`, read once by the importer and never written again.

## Consequences

- The app refuses data it cannot vouch for, and says so in plain words, with an action for each case.
- A run says, and the engine observed, which bytes it read; verify can catch a swapped view, an edited key, a missing
  previous run, a tampered count and a claimed engine version, all of which passed before.
- The record shows growth that can be proven, and a checkpoint kept elsewhere makes rewriting it detectable. Within
  one browser, it is still a record of one device: a team's shared record waits for a server.
- Left for later, each with its own decision: leaving a refused day out and an owner's acceptance of a file with a
  reason; recording profile boxes and policy changes as entries; source files in the bag on request; marking a run
  made by the in-page engine in its manifest; the data job's own provenance (upstream fetch records with ETags and
  hashes for every month read, a deterministic history file, MANIFEST chained to the previous build, a signed
  attestation, the workflow restricted to the main branch, data branch history kept rather than force-pushed); a
  durable engine (OPFS); row proofs and diffs between loads from kept chunk digests; external witnesses (RFC 3161
  timestamps, a transparency log); review and release; redacted bags for non-owners.
