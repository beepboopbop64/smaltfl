/**
 * Verifying a run (ARCHITECTURE.md §6, ADR 0006 §5), at three levels:
 * - **stored:** the manifest still has its hash and agrees with the plan it names (coherent); the plan and the flow
 *   document it was translated from are stored and have their hashes, and the document translates to the plan
 *   (flow); every key recomputes (key); every version the run stored, snapshots included, still has its recorded
 *   content hash; each dataset name the run made current still shows that version, through the exact view the runtime
 *   writes (published); the run it chains to is there with that hash (previous); and rows in and out add up
 *   (accounting). Against accidents and naive edits only: whoever can write the whole store can rewrite it
 *   consistently.
 *   A run of a plan with a publish block (ADR 0009 §11) is also checked *held*: its stored holds are what its
 *   manifest's counts and its stored claims hold (each claim judged again against the manifest: its day, its
 *   history's file, the snapshot's rows), and every output it held that a name shows was released, by a release of
 *   this run, with this manifest and key and a decision's leaf, so a held output pointed by hand fails, under this
 *   run's number or under one that is no run, or a run that didn't make that version. A derived run (ADR 0009
 *   amendment 1 S4) is held by its fill and its donors too, computed again the same way; one released with a repair is
 *   checked *repair* (S11): its document is the repair of its held run's, it read the donor's file the repair names,
 *   and it read the held run's snapshot of the watched source.
 * - **rerun:** recomputing every stored node from the run's snapshots, with the same plan, gives the same content
 *   hashes and the same expectation counts. The recomputed rows go to temporary tables, which are dropped after.
 * - **rederive:** the source files the run read are still pinned with the hashes it recorded, each source is still the
 *   external table over its file, and decoding them again (the engine hashing the bytes it opens) gives the snapshots
 *   it read (file); then the rerun.
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import type { FlowDocument } from '../core/document.js';
import type { EmitContext } from '../core/emit.js';
import { createTable, emitSelect } from '../core/emit.js';
import { hex } from '../core/hash.js';
import { repairDocument } from '../core/fill.js';
import { carry, spare, factsFromClaims, heldOutputs, holdsOf, isClaim2, judgeClaims, judgeDonors, type FillHold, type RunRef } from '../core/hold.js';
import { measuresHash } from '../core/measures.js';
import { measureTable } from './measure.js';
import { nodeKey } from '../core/keys.js';
import type { ManifestNode, RunManifest } from '../core/manifest.js';
import { manifestHash, ontologyHash, planHash, policiesHash } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import type { FlowPlan } from '../core/plan.js';
import { flowHash, translate, validatePlan } from '../core/plan.js';
import type { VerifyCheck, VerifyLevel, VerifyOptions, VerifyResult } from '../core/protocol.js';
import type { ParamValue } from '../core/sqltext.js';
import { quoteIdent as q } from '../core/sqltext.js';
import { hashTable } from './dataset-hash.js';
import { PINNED_PREFIX, pinned, pinnedLocation, takeOpened } from './pinned.js';
import { donorRead } from './release.js';
import { aborted, countExpectations, engineVersion, RunError } from './runtime.js';
import { carriedFrom, readBefore, currentOf, datasetView, derivedOf, ensureStore, findVersion, holdsOfRun, measuresOfRun, releasesOf, repairsOf } from './store.js';

type Json = Parameters<typeof canonicalJSON>[0];
const same = (a: unknown, b: unknown) => canonicalJSON(a as Json) === canonicalJSON(b as Json);

export async function verifyRun(db: Database, runId: number, options: VerifyOptions, signal?: AbortSignal): Promise<VerifyResult> {
  ensureStore(db);
  const level: VerifyLevel = options.level ?? 'rerun';
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [runId]).rows[0];
  if (!row) throw new RunError(`no run ${runId} in this database`);
  const manifest = JSON.parse(String(row[0])) as RunManifest;
  const checks: VerifyCheck[] = [];
  const check = (c: VerifyCheck) => checks.push(c);
  // The engine that verifies, by its own word where it gives one, not the caller's.
  const running = engineVersion(db);
  const verified = running && running !== 'unknown' ? running : options.smaltdb;
  const result = (): VerifyResult => ({ ok: checks.every((c) => c.ok), run: runId, level, format: manifest.smaltflRun ?? 0, engine: { ran: manifest.engine.smaltdb, verified }, manifest: String(row[1]), checks });

  const mh = await manifestHash(manifest);
  check({ node: -1, origin: 'manifest', check: 'stored', ok: mh === row[1], expected: String(row[1]), actual: mh });
  if (options.manifest !== undefined && options.manifest !== row[1]) {
    check({ node: -1, origin: 'manifest', check: 'stored', ok: false, expected: options.manifest, actual: String(row[1]), note: `run ${runId} here is another run than the one asked about` });
  }
  const planRow = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [manifest.plan]).rows[0];
  if (!planRow) {
    check({ node: -1, origin: 'plan', check: 'stored', ok: false, expected: manifest.plan, actual: null, note: 'the plan is no longer stored' });
    return result();
  }
  const plan = JSON.parse(String(planRow[0])) as FlowPlan;
  validatePlan(plan);
  const ph = await planHash(plan);
  check({ node: -1, origin: 'plan', check: 'stored', ok: ph === manifest.plan, expected: manifest.plan, actual: ph });

  // Coherent: the manifest says what the plan says.
  const { needed, stored } = shapeOf(plan);
  const byNode = new Map<number, ManifestNode>(manifest.nodes.map((m) => [m.node, m]));
  const problems: string[] = [];
  if (manifest.flow.id !== plan.flow.id || manifest.flow.hash !== plan.flow.hash) problems.push("the flow isn't the plan's");
  if (!same(manifest.parameters, plan.parameters)) problems.push("the parameters aren't the plan's");
  if (!same(manifest.nodes.map((m) => m.node), needed)) problems.push("the nodes aren't the ones the plan needs, in its order");
  for (const m of manifest.nodes) {
    const n = plan.nodes[m.node];
    if (!n || n.op !== m.op || n.origin !== m.origin) problems.push(`node ${m.node} isn't the plan's`);
    if (stored.has(m.node) && (m.content === undefined || m.rows === undefined)) problems.push(`${m.origin} is stored but has no content`);
  }
  if (!same(Object.keys(manifest.outputs).sort(), plan.outputs.map((o) => o.name))) problems.push("the outputs aren't the plan's");
  for (const o of plan.outputs) {
    const r = byNode.get(o.node);
    const out = manifest.outputs[o.name];
    if (!r || !out || out.key !== r.key || out.content !== r.content || out.rows !== r.rows) problems.push(`output ${o.name} doesn't match its node`);
  }
  check({ node: -1, origin: 'manifest', check: 'coherent', ok: problems.length === 0, ...(problems.length ? { note: problems.slice(0, 3).join('; ') } : {}) });

  // Flow: the document it was translated from, by its hash.
  const docRow = db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [plan.flow.hash]).rows[0];
  if (docRow) {
    const doc = JSON.parse(String(docRow[0])) as FlowDocument;
    const fh = await flowHash(doc);
    const notes: string[] = [];
    if (fh !== plan.flow.hash) notes.push("the stored document doesn't hash to the plan's flow hash");
    if (manifest.flow.policies !== undefined && manifest.flow.policies !== (await policiesHash(doc.policies))) notes.push("the policies aren't the document's");
    if (manifest.flow.ontology !== undefined && manifest.flow.ontology !== (await ontologyHash(doc.ontology))) notes.push("the ontology isn't the document's");
    try {
      const again = await translate(doc, typedParameters(doc, plan.parameters));
      const strip = (p: FlowPlan) => ({ ...p, nodes: p.nodes.map(({ schema: _schema, ...rest }) => rest) });
      if (!same(strip(again), strip(plan))) notes.push("the document doesn't translate to the plan");
    } catch (e) {
      notes.push(`the document doesn't translate: ${(e as Error).message}`);
    }
    check({ node: -1, origin: 'flow', check: 'flow', ok: notes.length === 0, expected: plan.flow.hash, actual: fh, ...(notes.length ? { note: notes.join('; ') } : {}) });
  } else if (manifest.smaltflRun === 1 && manifest.flow.policies !== undefined) {
    check({ node: -1, origin: 'flow', check: 'flow', ok: false, expected: plan.flow.hash, actual: null, note: 'the flow document is no longer stored' });
  }

  // Previous: the run it chains to.
  if (manifest.previous !== null) {
    const prev = db.query('SELECT hash FROM _smaltfl_runs WHERE hash = ? AND flow = ? AND id < ?', [manifest.previous, plan.flow.id, runId]).rows[0];
    check({ node: -1, origin: 'previous', check: 'previous', ok: !!prev, expected: manifest.previous, actual: prev ? String(prev[0]) : null, ...(prev ? {} : { note: 'the run it chains to is not in this database' }) });
  }

  // Keys: each recomputes from the plan node, its inputs' keys and the engine, and a snapshot's from its content.
  let badKeys = 0;
  for (const m of manifest.nodes) {
    const n = plan.nodes[m.node];
    if (!n) continue;
    let key: string | null = null;
    try {
      key = n.op === 'table' ? (m.content ? await nodeKey(n, [], manifest.engine, m.content) : null) : await nodeKey(n, n.inputs.map((j) => byNode.get(j)?.key ?? ''), manifest.engine);
    } catch {
      key = null;
    }
    if (key !== m.key) (badKeys++, check({ node: m.node, origin: m.origin, check: 'key', ok: false, expected: m.key, actual: key }));
  }
  if (badKeys === 0) check({ node: -1, origin: 'keys', check: 'key', ok: true, note: `${manifest.nodes.length} keys recomputed` });

  // Stored: what is kept now still has the hash the run recorded.
  for (const m of manifest.nodes) {
    if (m.content === undefined) continue;
    aborted(signal);
    const v = findVersion(db, m.key);
    if (!v) {
      check({ node: m.node, origin: m.origin, check: 'stored', ok: false, expected: m.content, actual: null, note: 'this version is no longer stored' });
      continue;
    }
    const h = await hashTable(db, v.table);
    check({ node: m.node, origin: m.origin, check: 'stored', ok: h.content === m.content && h.rows === m.rows, expected: m.content, actual: h.content });
  }

  // Published: the names this run made current still show its versions, through the view the runtime writes.
  for (const o of plan.outputs) {
    const named = db.query('SELECT key, run FROM _smaltfl_datasets WHERE name = ?', [o.name]).rows[0];
    if (!named || Number(named[1]) !== runId) continue; // a later run made it current since
    const rec = manifest.outputs[o.name]!;
    const v = findVersion(db, rec.key);
    const view = db.query("SELECT sql FROM sqlite_schema WHERE type = 'view' AND lower(name) = lower(?)", [o.name]).rows[0];
    const notes: string[] = [];
    if (String(named[0]) !== rec.key) notes.push('the name points at another version');
    if (!v) notes.push('its version is no longer stored');
    else if (!view || String(view[0]) !== datasetView(o.name, v.table)) notes.push("the name's view isn't the one the runtime writes");
    check({ node: o.node, origin: o.name, check: 'published', ok: notes.length === 0, expected: rec.key, actual: String(named[0]), ...(notes.length ? { note: notes.join('; ') } : {}) });
  }

  // Held: what held the run, computed again from what was stored; and no held output shown without a release.
  const kept = holdsOfRun(db, runId);
  const derived = derivedOf(db, runId);
  if (plan.publish || kept) {
    const notes: string[] = [];
    let holds = kept?.holds ?? [];
    let fills: FillHold[] = derived?.holds ?? [];
    if (!plan.publish) notes.push("the run's plan doesn't hold, yet a record of what held it is stored");
    else if (!kept) notes.push("the run's plan says what holds it, and no record of what held it is stored");
    else {
      if (!same(kept.judged.map((j) => j.node), plan.publish.watch.map(([n]) => n))) notes.push("the sources it judged aren't the plan's watched sources");
      // Each claim again, against the manifest: the run checked the pinned history's hash as it ran.
      // A claim/2 against the measures the run stored, under the flow hash it was judged by (a derived run's held run's).
      const claims = kept.judged.flatMap((j) => ('claim' in j ? [j.claim] : []));
      const measuredBy = storedMeasuredOf(db, runId, derived?.from ?? null, plan, byNode);
      const again = judgeClaims(plan, claims, factsFromClaims(claims, { rows: (node) => byNode.get(node)?.rows, flow: measuredBy.flow ?? plan.flow.hash, measured: measuredBy.measured }));
      for (const j of kept.judged) {
        if (!('claim' in j)) continue;
        const k = again.find((x) => x.node === j.node);
        if (!k || 'unjudged' in k || !same(k.claim, j.claim)) notes.push(`its claim for ${plan.nodes[j.node]?.origin ?? j.node} doesn't match the run${k && 'unjudged' in k ? `: ${k.unjudged}` : ''}`);
      }
      holds = carry(spare(holdsOf(plan, manifest, kept.judged), (l, node) => readBefore(db, plan.flow.id, l, node, runId)), (l) => carriedFrom(db, plan.flow.id, l, runId));
      if (!same(holds, kept.holds)) notes.push("the holds stored with it aren't what its manifest and its claims hold");
      // A derived run: its donors judged again, and what holds it besides, computed again (amendment 1 S4, S11).
      if (derived) {
        const donorClaims = derived.donors.flatMap((j) => ('claim' in j ? [j.claim] : []));
        const againDonors = judgeDonors(plan, donorClaims, factsFromClaims(donorClaims, { rows: (node) => byNode.get(node)?.rows, flow: measuredBy.flow ?? plan.flow.hash, origin: (node) => plan.nodes[node]?.origin }));
        for (const j of derived.donors) {
          if (!('claim' in j)) continue;
          const k = againDonors.find((x) => x.node === j.node);
          if (!k || 'unjudged' in k || !same(k.claim, j.claim)) notes.push(`its donor's claim for ${plan.nodes[j.node]?.origin ?? j.node} doesn't match the run${k && 'unjudged' in k ? `: ${k.unjudged}` : ''}`);
        }
        fills = holdsOf(plan, manifest, kept.judged, { derived: true, donors: derived.donors }).filter((h): h is FillHold => h.by === 'derived' || h.by === 'donor');
        if (!same(fills, derived.holds)) notes.push("the holds stored with it as a derived run aren't what its plan and its donors hold");
      } else {
        const filling = plan.nodes.find((n) => n.op === 'fill' && n.missing !== null);
        if (filling) notes.push(`${filling.origin} fills a day, and the run isn't stored as a derived run`);
      }
    }
    const all = [...holds, ...fills];
    const said = all.length ? `held by ${all.map((x) => `${x.origin} (${x.by === 'checks' ? 'its checks' : x.by === 'story' || x.by === 'derived' || x.by === 'donor' ? x.said : 'not judged'})`).join(', ')}` : 'nothing held it';
    check({ node: -1, origin: 'holds', check: 'held', ok: notes.length === 0, note: notes.length ? notes.join('; ') : said });
    // Fail closed: the outputs that should have been held, from the holds computed again, and those stored.
    const held = new Set(plan.publish ? [...heldOutputs(plan, all), ...heldOutputs(plan, [...(kept?.holds ?? []), ...(derived?.holds ?? [])])] : []);
    const releases = releasesOf(db, runId).filter((x) => x.outcome === 'applied');
    for (const o of plan.outputs) {
      if (!held.has(o.name)) continue;
      const named = currentOf(db, o.name);
      const key = manifest.outputs[o.name]!.key;
      if (!named) continue; // still staged: nothing to check
      if (named.run !== runId) {
        if (named.key !== key) continue; // another version: still staged
        // The name shows this run's staged version under another run's number: only a run that made that same version
        // (a key the zones reuse, or the same day run again) may stand beside it, and verifying that run checks it. A
        // number that is no run, or a run that made another version, is a held output pointed by hand.
        const other = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [named.run]).rows[0];
        const made = other ? (JSON.parse(String(other[0])) as RunManifest).outputs[o.name]?.key === key : false;
        if (!made) check({ node: o.node, origin: o.name, check: 'held', ok: false, expected: key, actual: named.key, note: `run ${runId} held it, and its name shows it under run ${named.run}, ${other ? "which didn't make it" : 'which is no run in this database'}, with no release` });
        continue;
      }
      const rel = releases.find((x) => x.names[o.name] === key && x.manifest === String(row[1]) && /^[0-9a-f]{64}$/.test(x.decision ?? ''));
      check({ node: o.node, origin: o.name, check: 'held', ok: !!rel, expected: key, actual: named.key, note: rel ? `released by release ${rel.id}, citing the decision ${rel.decision!.slice(0, 16)}…` : `run ${runId} held it, and its name shows it with no release` });
    }
  }

  // Repair: each release of this derived run with a repair, against the held run it repairs (amendment 1 S11).
  for (const rep of repairsOf(db, runId)) {
    const notes: string[] = [];
    const from = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [rep.from.run]).rows[0];
    const fromManifest = from && String(from[1]) === rep.from.manifest ? (JSON.parse(String(from[0])) as RunManifest) : null;
    const fromPlan = fromManifest ? db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [fromManifest.plan]).rows[0] : undefined;
    const fromDoc = fromPlan ? db.query('SELECT doc FROM _smaltfl_flows WHERE hash = ?', [(JSON.parse(String(fromPlan[0])) as FlowPlan).flow.hash]).rows[0] : undefined;
    if (!fromManifest) notes.push(`the held run it repairs, run ${rep.from.run} (${rep.from.manifest.slice(0, 16)}…), isn't in this database`);
    else if (!fromDoc) notes.push(`run ${rep.from.run}'s flow document isn't stored, so the repair can't be rebuilt`);
    else {
      try {
        const rebuilt = repairDocument(JSON.parse(String(fromDoc[0])) as FlowDocument, rep.repair);
        if ((await flowHash(rebuilt)) !== plan.flow.hash) notes.push(`its document isn't run ${rep.from.run}'s repaired as its release says`);
      } catch (e) {
        notes.push(`the repair doesn't rebuild from run ${rep.from.run}'s document: ${(e as Error).message}`);
      }
      const source = (m: RunManifest) => m.nodes.find((n) => n.op === 'table' && n.origin.toLowerCase() === rep.repair.source.toLowerCase());
      if (source(manifest)?.content === undefined || source(manifest)?.content !== source(fromManifest)?.content) notes.push(`it read another snapshot of ${rep.repair.source} than run ${rep.from.run}`);
    }
    if (rep.repair.donor) {
      const fill = plan.nodes.findIndex((n) => n.op === 'fill' && n.origin === rep.repair.step);
      const donor = fill >= 0 && plan.nodes[fill]!.inputs.length === 2 ? plan.nodes[fill]!.inputs[1]! : -1;
      const read = donorRead(manifest, donor);
      if (!read || read.sha256 !== rep.repair.donor.file.sha256 || (read.bytes !== null && read.bytes !== rep.repair.donor.file.bytes)) notes.push(`its donor didn't read the ${rep.repair.donor.day} file the repair names`);
    }
    const what = rep.repair.donor ? `filled from ${rep.repair.donor.day}` : 'the part that arrived';
    check({ node: -1, origin: 'repair', check: 'repair', ok: notes.length === 0, note: notes.length ? notes.join('; ') : `release ${rep.release}: run ${rep.from.run} ${what}, rebuilt from its document and the repair` });
  }

  // Accounting: an expectation reads its input's rows, and a stored one keeps what it didn't drop.
  for (const m of manifest.nodes) {
    if (!m.expectations) continue;
    const e = m.expectations;
    const n = plan.nodes[m.node]!;
    const input = byNode.get(n.inputs[0]!);
    const notes: string[] = [];
    if (input?.rows !== undefined && input.rows !== e.rows) notes.push(`read ${e.rows} rows where its input has ${input.rows}`);
    if (m.rows !== undefined && m.rows !== e.rows - e.dropped) notes.push(`kept ${m.rows} rows where ${e.rows} less ${e.dropped} dropped is ${e.rows - e.dropped}`);
    if (e.rules.some((r) => r.failed < 0 || r.failed > e.rows) || e.dropped < 0 || e.dropped > e.rows) notes.push('a count is out of range');
    check({ node: m.node, origin: m.origin, check: 'accounting', ok: notes.length === 0, ...(notes.length ? { note: notes.join('; ') } : {}) });
  }

  const temps: string[] = [];
  const tag = hex(crypto.getRandomValues(new Uint8Array(4)));
  try {
    // File: the source files it read, decoded again.
    if (level === 'rederive') {
      for (const m of manifest.nodes) {
        const n = plan.nodes[m.node]!;
        if (n.op !== 'table') continue;
        aborted(signal);
        if (!m.file) {
          check({ node: m.node, origin: m.origin, check: 'file', ok: false, actual: null, note: manifest.smaltflRun === 1 ? 'it read no pinned file, so there are no bytes to decode again' : 'an older run, made before source files were recorded' });
          continue;
        }
        const p = m.file.location.startsWith(PINNED_PREFIX) ? pinned(m.file.location.slice(PINNED_PREFIX.length)) : undefined;
        if (!p || p.sha256 !== m.file.sha256) {
          check({ node: m.node, origin: m.origin, check: 'file', ok: false, expected: m.file.sha256, actual: p?.sha256 ?? null, note: p ? 'another file is pinned under that name now: load its day again to re-derive it' : 'the file is no longer pinned here' });
          continue;
        }
        // The table must still be the external table over that file, or what is decoded below isn't the file.
        let location: string | null;
        try {
          location = pinnedLocation(db, n.table);
        } catch (e) {
          check({ node: m.node, origin: m.origin, check: 'file', ok: false, expected: m.file.location, actual: null, note: (e as Error).message });
          continue;
        }
        if (location !== m.file.location) {
          check({ node: m.node, origin: m.origin, check: 'file', ok: false, expected: m.file.location, actual: location, note: `${n.table} reads ${location ?? 'no pinned file'} now, not the file the run read: decoding it would not decode the run's bytes` });
          continue;
        }
        const t = `_smaltfl_verify_${tag}_src${m.node}`;
        db.exec(createTable(t, n.schema!, { temp: true }));
        temps.push(t);
        try {
          takeOpened();
          await db.runAsync(`INSERT INTO ${q(t)} SELECT * FROM ${q(n.table)}`);
          // The bytes decoded are the ones the run read, as the engine hashed them when it opened them.
          const read = takeOpened().find((f) => f.location === m.file!.location);
          if (!read || read.sha256 !== m.file.sha256 || read.bytes !== m.file.bytes) {
            check({ node: m.node, origin: m.origin, check: 'file', ok: false, expected: m.file.sha256, actual: read?.sha256 ?? null, note: read ? 'decoding it again read other bytes than the run read' : `decoding it again didn't open ${m.file.location}` });
            continue;
          }
          const h = await hashTable(db, t);
          check({ node: m.node, origin: m.origin, check: 'file', ok: h.content === m.content, expected: m.content, actual: h.content, note: `${m.file.location}: ${m.file.bytes} bytes, sha256 ${m.file.sha256}` });
        } catch (e) {
          check({ node: m.node, origin: m.origin, check: 'file', ok: false, expected: m.content, actual: null, note: (e as Error).message });
        }
      }
    }
    if (level === 'stored') return result();

    // Rerun: recompute every stored node from the snapshots, the way the run did.
    const recomputed = new Map<number, string>();
    const ctx: EmitContext = { table: (i) => (stored.has(i) ? recomputed.get(i) : undefined), columns: (i) => plan.nodes[i]!.schema!.map(([name]) => name) };
    for (const m of manifest.nodes) {
      const n = plan.nodes[m.node]!;
      if (n.op === 'table') {
        const v = findVersion(db, m.key);
        if (v) recomputed.set(m.node, v.table);
        continue;
      }
      aborted(signal);
      if (n.inputs.some((j) => stored.has(j) && !recomputed.has(j))) {
        check({ node: m.node, origin: m.origin, check: m.expectations ? 'expectations' : 'rerun', ok: false, expected: m.content, actual: null, note: 'an input could not be recomputed' });
        continue;
      }
      if (m.expectations) {
        const counts = countExpectations(db, plan, m.node, ctx);
        check({ node: m.node, origin: m.origin, check: 'expectations', ok: same(counts, m.expectations), expected: canonicalJSON(m.expectations as unknown as Json), actual: canonicalJSON(counts as unknown as Json) });
      }
      if (!stored.has(m.node)) continue;
      const t = `_smaltfl_verify_${tag}_${m.node}`;
      db.exec(createTable(t, n.schema!, { temp: true }));
      temps.push(t);
      db.run(`INSERT INTO ${q(t)} ${emitSelect(plan, m.node, ctx)}`);
      recomputed.set(m.node, t);
      const h = await hashTable(db, t);
      check({ node: m.node, origin: m.origin, check: 'rerun', ok: h.content === m.content, expected: m.content, actual: h.content });
    }
    // Held, at the Recomputed level (ADR 0010 §6): each watched load measured again from its snapshot, with the settings
    // the run measured it by, gives the measures stored and the measures its claim was told from.
    for (const sm of measuresOfRun(db, runId)) {
      aborted(signal);
      const m = byNode.get(sm.node);
      const v = m ? findVersion(db, m.key) : null;
      const claim = kept?.judged.find((j) => j.node === sm.node);
      const told = claim && 'claim' in claim && isClaim2(claim.claim) ? claim.claim.measured : null;
      const notes: string[] = [];
      let again: string | null = null;
      if (!m || !v) notes.push('its snapshot is no longer stored');
      else {
        try {
          again = await measuresHash(await measureTable(db, v.table, sm.settings, m.file?.sha256 ?? null, m.content!));
        } catch (e) {
          notes.push(`it couldn't be measured again: ${(e as Error).message}`);
        }
      }
      if (again !== null && again !== sm.hash) notes.push('measured again, its snapshot gives other measures than the run stored');
      if (told !== null && told !== sm.hash) notes.push('its claim was told from other measures than the run stored');
      check({ node: sm.node, origin: plan.nodes[sm.node]?.origin ?? String(sm.node), check: 'held', ok: notes.length === 0, expected: sm.hash, actual: again, note: notes.length ? notes.join('; ') : `measured again: ${sm.slot}, ${sm.measures.rows.toLocaleString('en-US')} rows` });
    }
  } finally {
    for (const t of temps) db.exec(`DROP TABLE IF EXISTS ${q(t)}`);
  }
  return result();
}

/**
 * The measures a run's claim/2 were judged by (ADR 0010 §6), as stored: its own; or, for a derived run, those of the held
 * run it repairs, where it read the same snapshot, under that run's flow hash (C4).
 */
function storedMeasuredOf(db: Database, runId: number, from: RunRef | null, plan: FlowPlan, byNode: ReadonlyMap<number, ManifestNode>): { flow: string | null; measured: (node: number) => string | undefined } {
  if (!from) {
    const own = measuresOfRun(db, runId);
    return { flow: null, measured: (node) => own.find((m) => m.node === node)?.hash };
  }
  const row = db.query('SELECT manifest, hash FROM _smaltfl_runs WHERE id = ?', [from.run]).rows[0];
  const held = row && String(row[1]) === from.manifest ? (JSON.parse(String(row[0])) as RunManifest) : null;
  const stored = held ? measuresOfRun(db, from.run) : [];
  return {
    flow: held?.flow.hash ?? null,
    measured: (node) => {
      const heldNode = held?.nodes.find((n) => n.op === 'table' && n.origin === plan.nodes[node]?.origin)?.node;
      const m = stored.find((x) => x.node === heldNode);
      return m && m.measures.snapshot === byNode.get(node)?.content ? m.hash : undefined;
    },
  };
}

/** The plan's parameter values as the document types them: an integer is recorded as text, to keep its digits. */
function typedParameters(doc: FlowDocument, values: Readonly<Record<string, string | number | null>>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const d of doc.parameters ?? []) {
    if (!Object.hasOwn(values, d.name)) continue;
    const v = values[d.name]!;
    out[d.name] = d.type === 'integer' && typeof v === 'string' && /^-?\d+$/.test(v) ? BigInt(v) : v;
  }
  return out;
}
