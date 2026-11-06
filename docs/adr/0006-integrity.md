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
   - **Intact:** the hashes and signatures check. Against accidents and naive edits only: whoever can rewrite the
     whole store can rewrite it consistently.
   - **Recomputed:** every stored dataset was recomputed from the run's snapshots in this session and gave the same
     hashes.
   - **Re-derived:** the source files' bytes were decoded again and the result matched the snapshots, then
     recomputed.
   - **Anchored:** the record is consistent with a checkpoint held outside this browser (a downloaded checkpoint, an
     auditor's copy). Only this level is evidence against someone who controls the browser.
   Numbers computed live in the page (profiles, odd rows, the news) are not hashed; the stored datasets and the
   expectation counts are. A finding records the evidence it rests on.
2. **The first hop is a gate (FIM).** Every data file the app reads (each day's trips, the zones, the weather, the
   history) is checked against the sha256 the data branch's MANIFEST.json gives for it, and MANIFEST.json itself
   against the hash `loads.json` carries, before it is used. A file that does not match is refused: the load does not
   run, the last intact run stays on screen, and the card says why, with what can be done (fetch again, leave the day
   out, tell the data owner, export for audit, or, the owner only, accept it with a reason). A network error is "not
   checked", never an alarm. What this record has seen before is the second baseline: a file that changed since this
   browser last read it, under a list that changed too, is "republished" (amber), not "corrupt" (red).
3. **The engine observes the bytes.** The runtime plugin pins each source file inside the engine (`pin`): it hashes
   the bytes there, refuses a mismatch with the expected hash, and serves them through its own source (`smaltfl:`).
   The run records, for each source node, the file it read: location, sha256 and size, as observed by the engine,
   not as claimed by the page.
4. **A run says everything it depended on (run/1).** The manifest adds the flow's policies and ontology hashes, the
   plugins and versions that decoded and ran it (the engine version checked against the engine itself), each source's
   file, the data branch commit and MANIFEST hash the page loaded from, and the record's head before the run (the
   last two labelled as the page's claims). The flow document is stored with the run, and the plugin refuses a run
   whose document does not hash to the plan's flow hash.
5. **verify checks the whole run.** Besides the stored hashes and the recomputation: *coherent* (the manifest agrees
   with the plan it names), *key* (every key recomputes), *published* (each dataset name points at the version the
   run made, through the exact view the runtime writes), *previous* (the run it chains to exists with that hash),
   *accounting* (rows in and out add up), *flow* (the stored document hashes to the plan's flow hash), and, at the
   Re-derived level, *file* (the pinned bytes still hash to what the run recorded, and decode to the snapshot).
6. **One record (log/1).** Runs, verifications, flow edits, profile boxes, ontology edits, actions on findings,
   integrity events, acceptances, exports and imports go into one append-only record per flow and browser: an RFC
   9162 Merkle tree, kept in IndexedDB. A correction is a new entry that amends an old one; nothing is edited or
   deleted. Its head is signed as a checkpoint by this browser's identity (a non-extractable key kept in IndexedDB,
   per ADR 0002 §1). The record replaces the old data log, whose entries are imported once, verbatim, with their old
   hashes.
7. **Anchoring is the auditor's.** A checkpoint can be downloaded and kept elsewhere; a later record is checked for
   consistency against it (an RFC 9162 consistency proof). A server, a record branch or a public transparency log can
   witness checkpoints later.
8. **The audit bag.** An export is a BagIt 1.0 bag in a ZIP (no compression, no dependency): the record and its
   checkpoints, the identity card, every manifest, plan and flow document it names, the data branch's MANIFEST.json,
   an inclusion proof for each published dataset, and a readable account. The source files are left out by default
   (an auditor gets each from the data branch by its sha256) and included on request. An auditor checks it with
   `sha256sum -c` and `node scripts/audit.mjs`, from their own checkout, without trusting the browser that made it.
   It holds everything this browser holds: "owner only" is a convenience until principals are authenticated.
9. **On the canvas.** Integrity is shown apart from data health: a seal on a card (intact, recomputed, re-derived,
   or broken) beside its news dot, a chain from each output back to its source bytes, full hashes in groups of four
   with a copy button, and the record's head on the Runs view.

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
- Left for later, each with its own decision: the data job's own provenance (upstream fetch records with ETags and
  hashes for every month read, a deterministic history file, MANIFEST chained to the previous build, a signed
  attestation, the workflow restricted to the main branch, data branch history kept rather than force-pushed); a
  durable engine (OPFS); row proofs and diffs between loads from kept chunk digests; external witnesses (RFC 3161
  timestamps, a transparency log); review and release; redacted bags for non-owners.
