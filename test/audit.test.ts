/**
 * The record and the audit bag, end to end in Node (the record in memory, as in a browser without storage): a run's
 * manifest kept and named by the record, checkpoints signed, a bag built and checked as an auditor would, and each
 * kind of tampering caught: an entry changed, an entry removed from the end, a manifest swapped, a proof that doesn't
 * hold, and a record rewritten after a checkpoint the auditor kept.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FlowRecord } from '../src/app/record.js';
import { auditBag, type EngineHolds, type EngineName, type EngineRelease, type EngineRepairs } from '../src/core/audit.js';
import { buildBag, type BagFile } from '../src/core/bag.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { withoutDisplay } from '../src/core/document.js';
import { heldOutputs, inputsOf, stagedKeys, type DecideAbout, type DerivedAbout, type HeldAbout, type ReleaseAbout, type StoryClaim } from '../src/core/hold.js';
import { repairDocument, type Repair } from '../src/core/fill.js';
import { entryLeaf, type JSONValue, type LogEntry } from '../src/core/log.js';
import { policiesHash, type RunManifest } from '../src/core/manifest.js';
import { flowHash, type FlowPlan } from '../src/core/plan.js';
import { sha256Hex } from '../src/core/hash.js';
import { zip } from '../src/core/zip.js';
import { findVersion, pointDataset } from '../src/plugin/store.js';
import { insertAfter, pinFile, releaseRun, runFlow, type FlowDocument, type PublishDef, type RunResult } from '../src/index.js';
import { loadFixture, makeTrips, visualFlow } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';
import { installFakeIndexedDB } from './helpers/fake-idb.js';

const enc = new TextEncoder();

/** A run in the record, as the app keeps it: its manifest and its plan by hash, and the run entry naming both. */
async function keepRun(rec: FlowRecord, db: ReturnType<typeof openEngine>, manifest: { plan: string }, hash: string, run: number, more: Record<string, JSONValue> = {}) {
  const blob = await rec.keep('manifest', manifest);
  const row = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [manifest.plan]).rows[0];
  const plan = row ? await rec.keep('plan', JSON.parse(String(row[0]))) : null;
  return rec.append('run', 'owner', { run, manifest: hash, blob, plan, load: null, outcome: 'ok', files: [], ...more });
}

/** A flow run, recorded, and a bag of it, as the app's export makes one. */
async function recorded(flow = `audit-${Math.random().toString(36).slice(2)}`) {
  const db = openEngine();
  loadFixture(db, makeTrips(1500));
  const doc = { ...visualFlow(), id: flow };
  const rec = await FlowRecord.open(flow);
  const r = await runFlow(db, doc, { smaltdb: SMALTDB, log: rec.head() });
  await keepRun(rec, db, r.manifest, r.hash, r.run);
  await rec.append('act', 'ana', { day: '2024-01-07', finding: 'volume', title: 'Fewer trips', act: 'expected', note: 'the snow' });
  return { db, doc, rec, r };
}

async function bagOf(rec: FlowRecord, r: Awaited<ReturnType<typeof recorded>>['r'], tweak: (payload: BagFile[]) => void = () => {}): Promise<BagFile[]> {
  const head = rec.head();
  const runEntry = rec.last('run')!;
  const payload: BagFile[] = [
    { path: 'record/entries.jsonl', bytes: enc.encode(rec.entries.map((e) => canonicalJSON(e as never)).join('\n') + '\n') },
    { path: 'record/checkpoints.jsonl', bytes: enc.encode(rec.checkpoints.map((c) => JSON.stringify(c)).join('\n') + '\n') },
    { path: 'record/card.json', bytes: enc.encode(JSON.stringify(rec.identity.card)) },
    ...(await rec.blobs()).map((b) => ({ path: `blobs/${b.kind}-${b.hash}.json`, bytes: enc.encode(b.json) })),
    ...Object.entries(r.manifest.outputs).map(([name, o]) => ({ path: `proofs/${name}.json`, bytes: enc.encode(JSON.stringify({ dataset: name, ...o, entry: runEntry, inclusion: rec.proofOf(runEntry.seq) })) })),
  ];
  tweak(payload);
  return buildBag({ name: 'smaltfl-audit-test', payload, info: [['External-Identifier', `${head.origin} ${head.size} ${head.root}`]], date: '2026-11-06' });
}

describe('the record', () => {
  it('appends, signs each head, and checks intact', async () => {
    const { rec } = await recorded();
    expect(rec.entries.map((e) => [e.seq, e.kind])).toEqual([[0, 'run'], [1, 'act']]);
    expect(rec.status).toMatchObject({ ok: true, size: 2, signed: 2, durable: false, firstBad: null });
    expect(rec.entries[1]!.by).toEqual({ card: rec.identity.card.fingerprint, as: 'ana' });
  });

  it('is consistent with an earlier checkpoint of itself, and not with one of a rewritten record', async () => {
    const { rec } = await recorded();
    const early = rec.latest()!;
    await rec.append('verify', 'owner', { run: 1, ok: true });
    expect(await rec.consistentWith(early)).toEqual({ ok: true, size: 2, reason: null });
    const other = await recorded(rec.flow);
    // Another record of the same flow, signed by another browser's key: a different log.
    expect((await rec.consistentWith(other.rec.latest())).ok).toBe(false);
  });

  it('keeps appends made close together each in its own place, in IndexedDB too', async () => {
    const uninstall = installFakeIndexedDB();
    try {
      const flow = `idb-${Math.random().toString(36).slice(2)}`;
      const rec = await FlowRecord.open(flow);
      expect(rec.durable).toBe(true);
      // As the app does for a refused file: the check is noted as it is made, and again as the load is refused.
      const check = { path: 'loads/a.parquet', class: 'corrupt' };
      await Promise.all([rec.append('file', 'owner', check), rec.append('file', 'owner', check), rec.append('run', 'owner', { outcome: 'failed' })]);
      expect(rec.entries.map((e) => e.seq)).toEqual([0, 1, 2]);
      expect(rec.status).toMatchObject({ ok: true, size: 3, signed: 3 });
      // The next visit reads the same record back from the store, intact.
      const again = await FlowRecord.open(flow);
      expect(again.entries.map((e) => [e.seq, e.kind])).toEqual([[0, 'file'], [1, 'file'], [2, 'run']]);
      expect(again.status).toMatchObject({ ok: true, size: 3, signed: 3 });
    } finally {
      uninstall();
    }
  });

  it('finds an entry changed after it was signed', async () => {
    const { rec } = await recorded();
    (rec.entries[1]!.about as { note: string }).note = 'something else';
    expect(await rec.check()).toMatchObject({ ok: false, firstBad: 1 });
  });
});

describe('an audit bag', () => {
  it('holds, as an auditor checks it', async () => {
    const { rec, r } = await recorded();
    const report = await auditBag(await bagOf(rec, r), rec.latest());
    expect(report.lines.filter((l) => !l.ok)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.lines.map((l) => l.what).join('\n')).toMatch(/run 1 \(#0\): manifest [0-9a-f]{16}… holds/);
    expect(report.lines.filter((l) => /proven in the record/.test(l.what))).toHaveLength(Object.keys(r.manifest.outputs).length);
  });

  it('fails when an entry was changed, even with the bag re-hashed to match', async () => {
    const { rec, r } = await recorded();
    const bag = await bagOf(rec, r, (payload) => {
      const f = payload.find((x) => x.path === 'record/entries.jsonl')!;
      f.bytes = enc.encode(new TextDecoder().decode(f.bytes).replace('the snow', 'a parade'));
    });
    const report = await auditBag(bag);
    expect(report.ok).toBe(false);
    expect(report.lines.find((l) => !l.ok)!.what).toMatch(/the record doesn't hold/);
  });

  it('fails when entries were removed from the end', async () => {
    const { rec, r } = await recorded();
    const bag = await bagOf(rec, r, (payload) => {
      const f = payload.find((x) => x.path === 'record/entries.jsonl')!;
      f.bytes = enc.encode(new TextDecoder().decode(f.bytes).split('\n')[0] + '\n');
    });
    expect((await auditBag(bag)).lines.find((l) => !l.ok)!.what).toMatch(/entries are missing from its end/);
  });

  it('fails when a manifest was swapped for another', async () => {
    const { rec, r } = await recorded();
    const bag = await bagOf(rec, r, (payload) => {
      const f = payload.find((x) => x.path.startsWith('blobs/manifest-'))!;
      f.bytes = enc.encode(new TextDecoder().decode(f.bytes).replace(/"rows":\d+/, '"rows":1'));
    });
    expect((await auditBag(bag)).lines.find((l) => !l.ok)!.what).toMatch(/its manifest hashes to [0-9a-f]{16}…, not the [0-9a-f]{16}… the record says/);
  });

  it('fails a file changed after the bag was made', async () => {
    const { rec, r } = await recorded();
    const bag = await bagOf(rec, r);
    const f = bag.find((x) => x.path.endsWith('record/card.json'))!;
    f.bytes = enc.encode(new TextDecoder().decode(f.bytes).replace('This browser', 'Somebody'));
    expect((await auditBag(bag)).lines[0]).toMatchObject({ ok: false });
  });

  it('fails against a checkpoint the auditor kept, when the record was rewritten after it', async () => {
    const { rec, r } = await recorded();
    const kept = rec.latest()!;
    // Rewrite the history behind the checkpoint: a new record of the same origin, signed with the same key.
    const forged = await recorded(rec.flow);
    void forged;
    (rec.entries[1]!.about as { note: string }).note = 'rewritten';
    rec.leaves[1] = (await import('../src/core/log.js')).entryLeaf(rec.entries[1]!);
    rec.checkpoints = [];
    await rec.sign();
    const report = await auditBag(await bagOf(rec, r), kept);
    expect(report.ok).toBe(false);
    expect(report.lines.at(-1)!.what).toMatch(/is NOT a continuation of your checkpoint at 2 entries/);
  });

  it('fails a proof whose dataset or content is not what its run made', async () => {
    const { rec, r } = await recorded();
    const [name] = Object.keys(r.manifest.outputs);
    const bag = await bagOf(rec, r, (payload) => {
      const f = payload.find((x) => x.path === `proofs/${name}.json`)!;
      const p = JSON.parse(new TextDecoder().decode(f.bytes)) as { content: string; rows: number };
      f.bytes = enc.encode(JSON.stringify({ ...p, content: 'f'.repeat(64), rows: 1 }));
      // A dataset the run never made, with a proof of a real run entry.
      payload.push({ path: 'proofs/invented.json', bytes: enc.encode(JSON.stringify({ ...p, dataset: 'invented' })) });
    });
    const report = await auditBag(bag);
    expect(report.ok).toBe(false);
    const failed = report.lines.filter((l) => !l.ok).map((l) => l.what);
    expect(failed.some((w) => w.startsWith(`${name}: content ffffffffffffffff…`) && /its run made it with content [0-9a-f]{16}…/.test(w))).toBe(true);
    expect(failed.some((w) => /^invented: .*its run made no dataset named invented/.test(w))).toBe(true);
  });

  it('fails a run that read files it can check against no data list, or against another one', async () => {
    const { rec } = await recorded();
    // A run that says it read a pinned file, under a data list the bag doesn't carry.
    const file = { location: 'smaltfl:trips.parquet', sha256: 'a'.repeat(64), bytes: 10 };
    const db = openEngine();
    loadFixture(db, makeTrips(200));
    const r = await runFlow(db, { ...visualFlow(), id: rec.flow }, { smaltdb: SMALTDB, data: { commit: 'c'.repeat(40), manifest: 'd'.repeat(64) }, log: rec.head() });
    const m = { ...r.manifest, nodes: r.manifest.nodes.map((n) => (n.origin === 'trips' ? { ...n, file } : n)) };
    const hash = await (await import('../src/core/manifest.js')).manifestHash(m);
    await keepRun(rec, db, m, hash, r.run);
    const none = await auditBag(await bagOf(rec, r));
    expect(none.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual([expect.stringMatching(/it read 1 file, and the bag has no data list to check it against/)]);
    const list = enc.encode(JSON.stringify({ files: [{ path: 'loads/x.parquet', sha256: file.sha256, bytes: file.bytes }] }));
    const other = await auditBag(await bagOf(rec, r, (payload) => payload.push({ path: 'data/MANIFEST.json', bytes: list })));
    expect(other.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual([expect.stringMatching(/it read its files under the data list dddddddddddddddd…, not the one in the bag/)]);
  });

  it('checks the signer and the data list against what the auditor brings', async () => {
    const { rec, r } = await recorded();
    const list = enc.encode(JSON.stringify({ files: [] }));
    const bag = await bagOf(rec, r, (payload) => payload.push({ path: 'data/MANIFEST.json', bytes: list }));
    const ok = await auditBag(bag, undefined, { signer: rec.identity.card.fingerprint, list });
    expect(ok.lines.filter((l) => !l.ok)).toEqual([]);
    const wrong = await auditBag(bag, undefined, { signer: 'e'.repeat(64), list: enc.encode('{"files":[1]}') });
    expect(wrong.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual([
      `the card in the bag is ${rec.identity.card.fingerprint}, not the signer you named (${'e'.repeat(64)})`,
      expect.stringMatching(/^the data's list in the bag is [0-9a-f]{64}, not the one you gave/),
    ]);
  });

  it('fails a data list that names a path twice, with two hashes', async () => {
    const { rec, r } = await recorded();
    const list = enc.encode(JSON.stringify({ files: [{ path: 'zones.csv', sha256: 'a'.repeat(64), bytes: 1 }, { path: 'zones.csv', sha256: 'b'.repeat(64), bytes: 1 }] }));
    const report = await auditBag(await bagOf(rec, r, (payload) => payload.push({ path: 'data/MANIFEST.json', bytes: list })));
    expect(report.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual(["the data's list names zones.csv twice, with two hashes"]);
  });

  it("fails a run whose record head isn't this record's before it", async () => {
    const { rec } = await recorded();
    const db = openEngine();
    loadFixture(db, makeTrips(200));
    const r = await runFlow(db, { ...visualFlow(), id: rec.flow }, { smaltdb: SMALTDB, log: { ...rec.head(), root: 'b'.repeat(64) } });
    await keepRun(rec, db, r.manifest, r.hash, r.run);
    const report = await auditBag(await bagOf(rec, r));
    expect(report.lines.filter((l) => !l.ok).map((l) => l.what)).toEqual([expect.stringMatching(/it says it ran after the record stood at 2 entries, root bbbbbbbbbbbbbbbb…, which isn't this record before it/)]);
  });
});

// ------------------------------------------------------------------ a day held, decided and released (ADR 0009 §11)

type Engine = ReturnType<typeof openEngine>;

/** The reference flow with a day parameter, the zones' own output, an owner and a steward, holding on its checks. */
function holdingFlow(id: string, publish: PublishDef = { hold: ['checks'] }): FlowDocument {
  const doc = visualFlow();
  return {
    ...doc,
    id,
    smaltfl: 2,
    parameters: [...(doc.parameters ?? []), { name: 'day', type: 'text', default: null }],
    steps: [...doc.steps, { id: 'zone_list', kind: 'sql', inputs: ['zones'], sql: 'SELECT LocationID, Borough FROM zones', dataset: {} }],
    policies: {
      principals: [{ id: 'owner', name: 'Owner', owner: true }, { id: 'ana', name: 'Ana' }],
      rules: [{ id: 'stewards', kind: 'action', name: 'Ana may decide not to publish', action: 'smaltfl:decide', for: ['ana'], may: ['dont'] }],
    },
    publish,
  };
}

/** A flow, its record, and its document kept by the record as the app keeps it. */
async function holdingRecord(publish?: PublishDef) {
  const flow = `paused-${Math.random().toString(36).slice(2)}`;
  const db = openEngine();
  loadFixture(db, makeTrips(1500));
  const doc = holdingFlow(flow, publish);
  const rec = await FlowRecord.open(flow);
  await rec.append('flow', 'owner', { before: null, after: await flowHash(doc), doc: await rec.keep('flow', withoutDisplay(doc)) });
  return { db, doc, rec };
}

/** Run a day: February's month holds (every row dropped), January's publishes. Recorded as the app records it. */
async function day(s: { db: Engine; doc: FlowDocument; rec: FlowRecord }, date: string, month: '2024-01' | '2024-02') {
  const r = await runFlow(s.db, s.doc, { smaltdb: SMALTDB, parameters: { month, day: date }, log: s.rec.head() });
  const inputs = inputsOf(r.manifest) as unknown as JSONValue;
  if (r.holds.length === 0) return { r, entry: await keepRun(s.rec, s.db, r.manifest, r.hash, r.run, { day: date, inputs }), keys: {} as Record<string, string> };
  const plan = JSON.parse(String(s.db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [r.manifest.plan]).rows[0]![0])) as FlowPlan;
  const keys = stagedKeys(r.manifest, heldOutputs(plan, r.holds));
  const held: Omit<HeldAbout, 'run' | 'manifest' | 'outcome'> = { day: date, inputs: inputsOf(r.manifest), holds: r.holds, waiting: r.waiting, keys };
  return { r, entry: await keepRun(s.rec, s.db, r.manifest, r.hash, r.run, { ...(held as unknown as Record<string, JSONValue>), outcome: 'held' }), keys };
}

/** A decision recorded first, as the app makes it. */
async function decide(s: { doc: FlowDocument; rec: FlowRecord }, r: RunResult, keys: Record<string, string>, as = 'owner', more: Partial<DecideAbout> = {}, reason: string | null = 'Real change', amends: number | null = null) {
  const date = String(r.manifest.parameters.day);
  const about: DecideAbout = { day: date, run: r.run, manifest: r.hash, inputs: inputsOf(r.manifest), outputs: keys, option: 'asis', scope: 'day', policies: await policiesHash(s.doc.policies), rule: null, ...more };
  return s.rec.append('decide', as, about as unknown as JSONValue, reason, amends);
}

/** The release of a decision: the plugin's, then its entry in the record. */
async function release(s: { db: Engine; rec: FlowRecord }, r: RunResult, decision: LogEntry, keys: Record<string, string>, about: Partial<ReleaseAbout> = {}) {
  const leaf = entryLeaf(decision);
  const out = await releaseRun(s.db, { run: r.run, manifest: r.hash, keys, option: 'asis', actor: 'owner', reason: 'Real change', decision: leaf });
  const entry: ReleaseAbout = { run: r.run, manifest: r.hash, outputs: keys, decision: decision.seq, leaf, outcome: out.outcome, why: out.why, ...about };
  return { out, entry: await s.rec.append('release', 'owner', entry as unknown as JSONValue) };
}

/**
 * A bag as the app's export makes one, with what the engine names: the record, the blobs, the engine's plans, flows,
 * runs, datasets and releases, and a proof for each dataset as published, by its run's entry or its release's.
 */
async function pausedBag(s: { db: Engine; rec: FlowRecord }, tweak: (payload: BagFile[]) => void = () => {}): Promise<BagFile[]> {
  const { db, rec } = s;
  const head = rec.head();
  const names = (await db.callPlugin('smaltfl', 'names', [])) as { datasets: EngineName[]; releases: EngineRelease[]; holds: EngineHolds[] };
  const payload: BagFile[] = [
    { path: 'record/entries.jsonl', bytes: enc.encode(rec.entries.map((e) => canonicalJSON(e as never)).join('\n') + '\n') },
    { path: 'record/checkpoints.jsonl', bytes: enc.encode(rec.checkpoints.map((c) => JSON.stringify(c)).join('\n') + '\n') },
    { path: 'record/card.json', bytes: enc.encode(JSON.stringify(rec.identity.card)) },
    ...(await rec.blobs()).map((b) => ({ path: `blobs/${b.kind}-${b.hash}.json`, bytes: enc.encode(b.json) })),
    ...db.query('SELECT hash, plan FROM _smaltfl_plans').rows.map(([h, p]) => ({ path: `engine/plans/${String(h)}.json`, bytes: enc.encode(String(p)) })),
    ...db.query('SELECT hash, doc FROM _smaltfl_flows').rows.map(([h, d]) => ({ path: `engine/flows/${String(h)}.json`, bytes: enc.encode(String(d)) })),
    ...db.query('SELECT id, hash, manifest FROM _smaltfl_runs').rows.map(([id, h, m]) => ({ path: `engine/runs/${String(id)}-${String(h)}.json`, bytes: enc.encode(String(m)) })),
    { path: 'engine/datasets.json', bytes: enc.encode(JSON.stringify(names.datasets)) },
    { path: 'engine/releases.json', bytes: enc.encode(JSON.stringify(names.releases)) },
    { path: 'engine/holds.json', bytes: enc.encode(JSON.stringify(names.holds)) },
  ];
  for (const d of names.datasets) {
    const runEntry = [...rec.entries].reverse().find((e) => e.kind === 'run' && (e.about as { manifest?: string }).manifest === d.manifest);
    const row = db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [d.run]).rows[0];
    // A name under a number that is no run, or a run the record doesn't have, has no proof: the app's export skips it.
    if (!runEntry || !row) continue;
    const m = JSON.parse(String(row[0])) as RunManifest;
    const releaseEntry = d.release === null ? undefined : [...rec.entries].reverse().find((e) => e.kind === 'release' && (e.about as unknown as ReleaseAbout).manifest === d.manifest && (e.about as unknown as ReleaseAbout).outputs[d.name] === d.key);
    const entry = releaseEntry ?? runEntry;
    payload.push({ path: `proofs/${d.name}.json`, bytes: enc.encode(JSON.stringify({ dataset: d.name, ...m.outputs[d.name], run: d.run, manifest: d.manifest, entry, inclusion: rec.proofOf(entry.seq, head.size) })) });
  }
  tweak(payload);
  return buildBag({ name: 'smaltfl-audit-paused', payload, info: [['External-Identifier', `${head.origin} ${head.size} ${head.root}`]], date: '2026-11-08' });
}

const failed = (r: Awaited<ReturnType<typeof auditBag>>) => r.lines.filter((l) => !l.ok).map((l) => l.what);

describe('an audit bag with a day held, decided and released (ADR 0009 §11)', () => {
  /** Wed published, Thu held on its checks, decided as is by the owner, released. */
  async function released() {
    const s = await holdingRecord();
    const wed = await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const decision = await decide(s, thu.r, thu.keys);
    const rel = await release(s, thu.r, decision, thu.keys);
    expect(rel.out.outcome).toBe('applied');
    return { ...s, wed, thu, decision, rel };
  }

  it('holds: the held run checked as an ok run is, its decision, its release, and proofs that cite the release', async () => {
    const s = await released();
    const report = await auditBag(await pausedBag(s), s.rec.latest());
    expect(failed(report)).toEqual([]);
    const lines = report.lines.map((l) => l.what);
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^run ${s.thu.r.run} \\(#${s.thu.entry.seq}\\): manifest [0-9a-f]{16}… holds, with its plan and flow document; read no files; held by trips_valid \\(its checks\\), 2 outputs waiting$`)));
    expect(lines).toContainEqual(`decision #${s.decision.seq}: publish as is for 2024-02-01, by owner, on run ${s.thu.r.run}'s keys`);
    expect(lines).toContainEqual(`release #${s.rel.entry.seq}: 3 outputs of run ${s.thu.r.run} released, citing decision #${s.decision.seq}`);
    expect(lines.filter((l) => l.endsWith(`in release entry #${s.rel.entry.seq} proven in the record, as the held run its release published made it`))).toHaveLength(3);
    expect(lines).toContainEqual("the engine's 3 dataset names show versions their runs in the record made, and no output a run held without a release");
  });

  it('checks the same bag with the auditor’s script, and fails it with the decide entry dropped', async () => {
    const s = await released();
    const dir = mkdtempSync(join(tmpdir(), 'smaltfl-audit-'));
    try {
      const write = (name: string, files: BagFile[]) => {
        const path = join(dir, name);
        writeFileSync(path, zip(files.map((f) => ({ path: f.path, bytes: f.bytes, date: new Date(Date.UTC(2026, 10, 8)) }))));
        return path;
      };
      const script = new URL('../scripts/audit.mjs', import.meta.url).pathname;
      const good = spawnSync(process.execPath, [script, 'check', write('good.zip', await pausedBag(s))], { encoding: 'utf8' });
      expect(good.stdout).toMatch(/^The bag holds: /m);
      expect(good.status).toBe(0);
      const dropped = await pausedBag(s, (payload) => {
        const f = payload.find((x) => x.path === 'record/entries.jsonl')!;
        f.bytes = enc.encode(new TextDecoder().decode(f.bytes).split('\n').filter((l) => !l.includes('"kind":"decide"')).join('\n'));
      });
      const bad = spawnSync(process.execPath, [script, 'check', write('bad.zip', dropped)], { encoding: 'utf8' });
      expect(bad.stdout).toMatch(/^FAIL the record doesn't hold/m);
      expect(bad.status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('fails a decision whose actor the policies don’t allow, and the release that cites it', async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    // A page that let Ana publish as is: the plugin was told the owner decided; the record says Ana did.
    const decision = await decide(s, thu.r, thu.keys, 'ana');
    const rel = await release(s, thu.r, decision, thu.keys);
    const f = failed(await auditBag(await pausedBag(s)));
    expect(f).toContain(`decision #${decision.seq}: publish as is for 2024-02-01, by ana: ana may not decide it: only Owner may publish a held day as is`);
    expect(f).toContain(`release #${rel.entry.seq}: 3 outputs of run ${thu.r.run} released, citing decision #${decision.seq}: its decision, #${decision.seq}, doesn't hold`);
  });

  it("fails a release that cites an entry that isn't an earlier decision", async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const decision = await decide(s, thu.r, thu.keys);
    // The release cites the held run's own entry, by its real leaf.
    const rel = await release(s, thu.r, decision, thu.keys, { decision: thu.entry.seq, leaf: entryLeaf(thu.entry) });
    expect(failed(await auditBag(await pausedBag(s)))).toContain(`release #${rel.entry.seq}: 3 outputs of run ${thu.r.run} released, citing decision #${thu.entry.seq}: it cites #${thu.entry.seq}, which isn't a decision before it`);
  });

  it("fails a release whose keys aren't the ones its run made", async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const forged = { ...thu.keys, zone_hour: 'f'.repeat(64) };
    const decision = await decide(s, thu.r, forged);
    // The plugin is given the run's real keys; the record says the forged ones were released.
    const rel = await release(s, thu.r, decision, thu.keys, { outputs: forged });
    const f = failed(await auditBag(await pausedBag(s)));
    expect(f).toContain(`decision #${decision.seq}: publish as is for 2024-02-01, by owner: the outputs it names aren't the held run's, with its keys`);
    expect(f).toContain(`release #${rel.entry.seq}: 3 outputs of run ${thu.r.run} released, citing decision #${decision.seq}: its decision, #${decision.seq}, doesn't hold; its keys aren't the ones run ${thu.r.run} made`);
    expect(f).toContain(`engine release ${rel.out.release} (run ${thu.r.run}): its names aren't decision #${decision.seq}'s, with its keys`);
  });

  it("fails a held run's output the engine shows with no release", async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const key = thu.r.manifest.outputs.zone_hour!.key;
    s.db.exec('BEGIN');
    pointDataset(s.db, 'zone_hour', key, findVersion(s.db, key)!.table, thu.r.run);
    s.db.exec('COMMIT');
    expect(failed(await auditBag(await pausedBag(s)))).toContain(`zone_hour (engine): it shows run ${thu.r.run}'s version, which the record holds as held, with no release citing a decision in the record`);
  });

  it('fails a decision applied under a standing one after a day published in between', async () => {
    const s = await holdingRecord();
    const fri = await day(s, '2024-01-12', '2024-02');
    const standing = await decide(s, fri.r, fri.keys, 'owner', { option: 'dont', scope: 'untilPass' }, null);
    await day(s, '2024-01-15', '2024-01');
    const tue = await day(s, '2024-01-16', '2024-02');
    const under = await decide(s, tue.r, tue.keys, 'owner', { option: 'dont', under: standing.seq }, null);
    const report = await auditBag(await pausedBag(s));
    expect(report.lines.find((l) => l.what.startsWith(`decision #${standing.seq}:`))).toMatchObject({ ok: true });
    expect(failed(report)).toEqual([`decision #${under.seq}: don't publish for 2024-01-16, by owner, under #${standing.seq}: it applies decision #${standing.seq}, which doesn't stand for 2024-01-16`]);
  });

  it('takes a decision applied under one that still stands', async () => {
    const s = await holdingRecord();
    const fri = await day(s, '2024-01-12', '2024-02');
    const standing = await decide(s, fri.r, fri.keys, 'ana', { option: 'dont', scope: 'untilPass', rule: 'stewards' }, null);
    const sat = await day(s, '2024-01-13', '2024-02');
    const under = await decide(s, sat.r, sat.keys, 'ana', { option: 'dont', under: standing.seq, rule: 'stewards' }, null);
    const report = await auditBag(await pausedBag(s));
    expect(failed(report)).toEqual([]);
    expect(report.lines.map((l) => l.what)).toContain(`decision #${under.seq}: don't publish for 2024-01-13, by ana, under #${standing.seq} (rule stewards), on run ${sat.r.run}'s keys`);
  });

  it('fails a run its checks held, recorded as published', async () => {
    const s = await holdingRecord();
    const r = await runFlow(s.db, s.doc, { smaltdb: SMALTDB, parameters: { month: '2024-02', day: '2024-02-01' }, log: s.rec.head() });
    expect(r.published).toEqual([]);
    const entry = await keepRun(s.rec, s.db, r.manifest, r.hash, r.run, { day: '2024-02-01', inputs: inputsOf(r.manifest) as unknown as JSONValue });
    expect(failed(await auditBag(await pausedBag(s)))).toEqual([`run ${r.run} (#${entry.seq}): it was recorded as published, and its manifest's counts hold it; it was recorded as published, and the engine held it (trips_valid)`]);
  });

  it("fails a held run whose manifest isn't in the bag", async () => {
    const s = await released();
    const blob = (s.thu.entry.about as { blob: string }).blob;
    const f = failed(await auditBag(await pausedBag(s, (payload) => payload.splice(payload.findIndex((x) => x.path === `blobs/manifest-${blob}.json`), 1))));
    expect(f).toContain(`run ${s.thu.r.run} (#${s.thu.entry.seq}): its manifest isn't in the bag`);
  });

  it('fails a held output pointed under a number that is no run, as verify does', async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const key = thu.r.manifest.outputs.zone_hour!.key;
    s.db.exec('BEGIN');
    pointDataset(s.db, 'zone_hour', key, findVersion(s.db, key)!.table, 999);
    s.db.exec('COMMIT');
    expect(failed(await auditBag(await pausedBag(s)))).toEqual(["zone_hour (engine): it shows run 999's version, and the engine has no run by that number"]);
  });

  it("takes a flow that doesn't hold its outputs together: what nothing held is published as it ran, proven by the held run's entry", async () => {
    const s = await holdingRecord({ hold: ['checks'], together: false });
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    expect(thu.r.published).toEqual(['zone_list']);
    expect(Object.keys(thu.keys)).toEqual(['borough_hour', 'zone_hour']);
    const held = await auditBag(await pausedBag(s));
    expect(failed(held)).toEqual([]);
    expect(held.lines.map((l) => l.what)).toContainEqual(expect.stringMatching(new RegExp(`^zone_list: content [0-9a-f]{16}…, in run entry #${thu.entry.seq} proven in the record, as its run made it$`)));
    // Released, it still holds; and a proof of a held output by the held run's entry, with no release, fails.
    const decision = await decide(s, thu.r, thu.keys);
    expect((await release(s, thu.r, decision, thu.keys)).out.outcome).toBe('applied');
    expect(failed(await auditBag(await pausedBag(s)))).toEqual([]);
    const forged = await pausedBag(s, (payload) => {
      const f = payload.find((x) => x.path === 'proofs/zone_hour.json')!;
      f.bytes = enc.encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(f.bytes)), entry: thu.entry, inclusion: s.rec.proofOf(thu.entry.seq, s.rec.head().size) }));
    });
    expect(failed(await auditBag(forged))).toContainEqual(expect.stringMatching(new RegExp(`^zone_hour: content [0-9a-f]{16}…, in run entry #${thu.entry.seq} : entry #${thu.entry.seq} is a held run, which held zone_hour: only a release publishes it$`)));
  });

  it('fails a run the engine held, recorded as published, and its output shown with no release', async () => {
    // Watched with no claim: the plugin holds the source as not judged, which the page's record can leave out.
    const s = await holdingRecord({ hold: ['checks', 'wrong'], watch: { trips: 'history-audit.json' }, period: 'day' });
    const bytes = enc.encode('{"days":[]}');
    await pinFile(s.db, 'history-audit.json', bytes, await sha256Hex(bytes));
    const r = await runFlow(s.db, s.doc, { smaltdb: SMALTDB, parameters: { month: '2024-01', day: '2024-01-31' }, log: s.rec.head() });
    expect(r.holds.map((x) => `${x.by}: ${x.said}`)).toEqual(['unjudged: no claim for trips']);
    const entry = await keepRun(s.rec, s.db, r.manifest, r.hash, r.run, { day: '2024-01-31', inputs: inputsOf(r.manifest) as unknown as JSONValue });
    const key = r.manifest.outputs.zone_hour!.key;
    s.db.exec('BEGIN');
    pointDataset(s.db, 'zone_hour', key, findVersion(s.db, key)!.table, r.run);
    s.db.exec('COMMIT');
    expect(failed(await auditBag(await pausedBag(s)))).toEqual([
      `run ${r.run} (#${entry.seq}): it was recorded as published, and the engine held it (trips)`,
      `zone_hour (engine): it shows run ${r.run}'s version, which the engine held, with no release citing a decision in the record`,
    ]);
  });

  it('fails a release whose decision was amended before it was released', async () => {
    const s = await holdingRecord();
    await day(s, '2024-01-31', '2024-01');
    const thu = await day(s, '2024-02-01', '2024-02');
    const first = await decide(s, thu.r, thu.keys);
    // Decided again while the first release was on its way: don't publish, amending it. The release lands after.
    const amended = await decide(s, thu.r, thu.keys, 'owner', { option: 'dont' }, null, first.seq);
    const rel = await release(s, thu.r, first, thu.keys);
    expect(failed(await auditBag(await pausedBag(s)))).toContain(`release #${rel.entry.seq}: 3 outputs of run ${thu.r.run} released, citing decision #${first.seq}: its decision, #${first.seq}, was amended by #${amended.seq} before it`);
  });
});

// ------------------------------------------------------------------ a day filled, and the fill withdrawn (ADR 0009 amendment 1 S11)

describe('an audit bag with a day filled (amendment 1 S11, Q-61)', () => {
  const TYPES = 'VendorID INTEGER, tpep_pickup_datetime TEXT, tpep_dropoff_datetime TEXT, passenger_count INTEGER, trip_distance REAL, PULocationID INTEGER, DOLocationID INTEGER, payment_type INTEGER, fare_amount REAL, tip_amount REAL, tolls_amount REAL, total_amount REAL';
  /** The fixture's trips moved to a day, keeping their hours; Thu 11's stop at 13:00. */
  const tripsOn = (day: string, seed: number, cut = 24) => makeTrips(800, seed).map((t) => [t[0], `${day}${t[1].slice(10)}`, `${day}${t[2].slice(10)}`, ...t.slice(3)]).filter((t) => Number(String(t[1]).slice(11, 13)) < cut);
  const DAYS: Record<string, unknown[][]> = { '2024-01-10': tripsOn('2024-01-10', 10), '2024-01-11': tripsOn('2024-01-11', 11, 13), '2024-01-04': tripsOn('2024-01-04', 4), '2024-01-12': tripsOn('2024-01-12', 12) };
  const load = (db: Engine, table: string, day: string) => {
    db.exec(`DELETE FROM ${table}`);
    db.exec('BEGIN');
    const st = db.prepare(`INSERT INTO ${table} VALUES (${'?, '.repeat(11)}?)`);
    for (const row of DAYS[day]!) st.run(row as never);
    db.exec('COMMIT');
  };
  const LEAF = (e: LogEntry) => entryLeaf(e);

  /** Wed 10 published, Thu 11 held short, filled from Thu 4 (decided, derived, released), all in the record. */
  async function filled() {
    const flow = `filled-${Math.random().toString(36).slice(2)}`;
    const db = openEngine();
    db.exec(`CREATE TABLE day_trips(${TYPES})`);
    db.exec(`CREATE TABLE day_trips_donor(${TYPES})`);
    const bytes = enc.encode(`{"history":"${flow}"}`);
    const history = { path: `history-${flow}.json`, sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
    await pinFile(db, history.path, bytes, history.sha256);
    const base: FlowDocument = {
      smaltfl: 2, id: flow, name: 'Filled', parameters: [{ name: 'day', type: 'text', default: null }], sources: [{ id: 'trips', table: 'day_trips' }],
      steps: [
        { id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }] },
        { id: 'trip_hours', kind: 'aggregate', inputs: ['trips_valid'], groupBy: [{ name: 'hour', expr: 'substr(tpep_pickup_datetime, 12, 2)' }], measures: [{ name: 'trips', expr: 'count(*)' }, { name: 'filled_from', expr: 'max(filled_from)' }], dataset: {} },
      ],
      policies: { principals: [{ id: 'owner', name: 'Owner', owner: true }], rules: [] },
      publish: { hold: ['short'], watch: { trips: history.path }, period: 'day' },
    };
    const doc = insertAfter(base, 'trips', { id: 'trips_filled', kind: 'fill', inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] });
    const rec = await FlowRecord.open(flow);
    await rec.append('flow', 'owner', { before: null, after: await flowHash(doc), doc: await rec.keep('flow', withoutDisplay(doc)) });
    const claim = (day: string, over: Partial<StoryClaim> = {}): StoryClaim => ({ by: 'story', source: 'trips', day, state: 'calm', below: false, head: 'A normal day', build: 'dev', history, rows: DAYS[day]!.length, ...over });
    const s = { db, doc, rec, history, claim };
    const runDay = async (day: string, c: StoryClaim) => {
      load(db, 'day_trips', day);
      const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day }, claims: [c], log: rec.head() });
      const inputs = inputsOf(r.manifest) as unknown as JSONValue;
      if (r.holds.length === 0) return { r, entry: await keepRun(rec, db, r.manifest, r.hash, r.run, { day, inputs }), keys: {} as Record<string, string> };
      const keys = stagedKeys(r.manifest, r.waiting.length ? Object.keys(r.manifest.outputs) : []);
      const held = { day, inputs: inputsOf(r.manifest), holds: r.holds, waiting: r.waiting, keys };
      return { r, entry: await keepRun(rec, db, r.manifest, r.hash, r.run, { ...(held as unknown as Record<string, JSONValue>), outcome: 'held' }), keys };
    };
    const wed = await runDay('2024-01-10', claim('2024-01-10'));
    const thu = await runDay('2024-01-11', claim('2024-01-11', { state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00' }));
    load(db, 'day_trips_donor', '2024-01-04');
    const donorClaim = claim('2024-01-04', { source: 'trips_donor' });
    const draft: Repair = { kind: 'fill', step: 'trips_filled', source: 'trips', missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, donor: { rule: 'weekday', direction: 'before', day: '2024-01-04', file: { path: 'day_trips_donor', sha256: '0'.repeat(64), bytes: 0 }, claim: donorClaim } };
    const derivedDoc = repairDocument(doc, draft);
    const r = await runFlow(db, derivedDoc, { smaltdb: SMALTDB, parameters: { day: '2024-01-11' }, claims: [claim('2024-01-11', { state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00' }), donorClaim], stage: true, from: { run: thu.r.run, manifest: thu.r.hash }, log: rec.head() });
    const donorNode = r.manifest.nodes.find((n) => n.origin === 'trips_donor')!;
    const repair: Repair = { ...draft, donor: { ...draft.donor!, file: { path: 'day_trips_donor', sha256: donorNode.content!, bytes: donorNode.rows! } } };
    const keys = stagedKeys(r.manifest, Object.keys(r.manifest.outputs));
    const derivedAbout: DerivedAbout = { run: r.run, manifest: r.hash, outcome: 'derived', day: '2024-01-11', inputs: inputsOf(r.manifest), holds: [...r.holds, ...r.derived!.holds], waiting: r.waiting, keys, from: { run: thu.r.run, manifest: thu.r.hash }, repair };
    const derived = await keepRun(rec, db, r.manifest, r.hash, r.run, { ...(derivedAbout as unknown as Record<string, JSONValue>), doc: await rec.keep('flow', withoutDisplay(derivedDoc)) });
    const decision = await decide(s, thu.r, thu.keys, 'owner', { option: 'fill', repair, derived: { run: r.run, manifest: r.hash, keys } }, null);
    const out = await releaseRun(db, { run: r.run, manifest: r.hash, keys, option: 'fill', actor: 'owner', reason: null, decision: LEAF(decision), from: { run: thu.r.run, manifest: thu.r.hash }, repair });
    expect(out).toMatchObject({ outcome: 'applied', why: null });
    const relAbout: ReleaseAbout = { run: r.run, manifest: r.hash, outputs: keys, decision: decision.seq, leaf: LEAF(decision), outcome: out.outcome, why: out.why, from: { run: thu.r.run, manifest: thu.r.hash }, repair, filled: out.filled ?? 0 };
    const rel = await rec.append('release', 'owner', relAbout as unknown as JSONValue);
    return { ...s, wed, thu, r, derived, decision, out, rel, keys, repair, runDay, derivedDoc, donorClaim };
  }
  /** The bag, with what the engine kept of the fills. */
  const fillBag = pausedBag;
  const withRepairs = async (s: { db: Engine; rec: FlowRecord }, change: (r: EngineRepairs) => void = () => {}, tweak: (payload: BagFile[]) => void = () => {}) => {
    const names = (await s.db.callPlugin('smaltfl', 'names', [])) as { repairs: EngineRepairs };
    change(names.repairs);
    return fillBag(s, (payload) => {
      payload.push({ path: 'engine/repairs.json', bytes: enc.encode(JSON.stringify(names.repairs)) });
      tweak(payload);
    });
  };

  it('holds: the derived run checked against its held run, its decision, its release, and the engine’s repairs', async () => {
    const s = await filled();
    const report = await auditBag(await withRepairs(s), s.rec.latest());
    expect(failed(report)).toEqual([]);
    const lines = report.lines.map((l) => l.what);
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^run ${s.r.run} \\(#${s.derived.seq}\\): manifest [0-9a-f]{16}… holds, with its plan and flow document; read no files; held by trips \\(Trips fall to trickle from 13:00\\), trips_filled \\(fills 13:00–23:59 from 2024-01-04\\), 1 output waiting; fills trips from 2024-01-04, repairing run ${s.thu.r.run}$`)));
    expect(lines).toContainEqual(`decision #${s.decision.seq}: fill from 2024-01-04 for 2024-01-11, by owner, on run ${s.thu.r.run}'s keys`);
    expect(lines).toContainEqual(`release #${s.rel.seq}: 1 output of run ${s.r.run} released, citing decision #${s.decision.seq}`);
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^trip_hours: content [0-9a-f]{16}…, in release entry #${s.rel.seq} proven in the record, as the held run its release published made it$`)));
  });

  it('holds once the fill is withdrawn, the names back on Wed 10; and fails a withdrawal that points elsewhere or amends nothing', async () => {
    const s = await filled();
    const withdraw = await decide(s, s.thu.r, s.thu.keys, 'owner', { option: 'dont' }, null, s.decision.seq);
    const out = await releaseRun(s.db, { run: s.r.run, manifest: s.r.hash, keys: s.keys, option: 'dont', actor: 'owner', reason: null, decision: LEAF(withdraw), withdraws: s.out.release });
    expect(out.outcome).toBe('applied');
    const back = { trip_hours: s.wed.r.manifest.outputs.trip_hours!.key };
    const about = (more: Partial<ReleaseAbout> = {}): ReleaseAbout => ({ run: s.r.run, manifest: s.r.hash, outputs: back, decision: withdraw.seq, leaf: LEAF(withdraw), outcome: 'applied', why: null, withdraws: s.rel.seq, ...more });
    const rel = await s.rec.append('release', 'owner', about() as unknown as JSONValue);
    const report = await auditBag(await withRepairs(s));
    expect(failed(report)).toEqual([]);
    expect(report.lines.map((l) => l.what)).toContain(`decision #${withdraw.seq}: don't publish (withdraws the fill) for 2024-01-11, by owner, on run ${s.thu.r.run}'s keys`);
    expect(report.lines.map((l) => l.what)).toContain(`release #${rel.seq}: release #${s.rel.seq} withdrawn: 1 output back, citing decision #${withdraw.seq}`);
    // A withdrawal recorded as pointing the names at the fill itself, and one whose decision amends nothing.
    const wrong = await s.rec.append('release', 'owner', about({ outputs: s.keys }) as unknown as JSONValue);
    const loose = await decide(s, s.thu.r, s.thu.keys, 'owner', { option: 'dont' }, null);
    const unamended = await s.rec.append('release', 'owner', about({ decision: loose.seq, leaf: LEAF(loose) }) as unknown as JSONValue);
    const f = failed(await auditBag(await withRepairs(s)));
    expect(f).toContain(`release #${wrong.seq}: release #${s.rel.seq} withdrawn: 1 output back, citing decision #${withdraw.seq}: it doesn't point trip_hours back to what it showed before the fill`);
    expect(f).toContain(`release #${unamended.seq}: release #${s.rel.seq} withdrawn: 1 output back, citing decision #${loose.seq}: its decision, #${loose.seq}, doesn't amend the fill's decision, #${s.decision.seq}`);
  });

  it('holds a fill applied again to its day run once more (a reload): the same inputs, the same keys (S9)', async () => {
    const s = await filled();
    // The day run again, and the decision's repair made again from that run: other runs, the same inputs and keys.
    const short = s.claim('2024-01-11', { state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00' });
    const thu = await s.runDay('2024-01-11', short);
    const r = await runFlow(s.db, s.derivedDoc, { smaltdb: SMALTDB, parameters: { day: '2024-01-11' }, claims: [short, s.donorClaim], stage: true, from: { run: thu.r.run, manifest: thu.r.hash }, log: s.rec.head() });
    expect(r.hash).not.toBe(s.r.hash);
    const about: DerivedAbout = { run: r.run, manifest: r.hash, outcome: 'derived', day: '2024-01-11', inputs: inputsOf(r.manifest), holds: [...r.holds, ...r.derived!.holds], waiting: r.waiting, keys: s.keys, from: { run: thu.r.run, manifest: thu.r.hash }, repair: s.repair };
    await keepRun(s.rec, s.db, r.manifest, r.hash, r.run, { ...(about as unknown as Record<string, JSONValue>), doc: await s.rec.keep('flow', withoutDisplay(s.derivedDoc)) });
    const again = await s.rec.append('release', 'owner', { run: r.run, manifest: r.hash, outputs: s.keys, decision: s.decision.seq, leaf: LEAF(s.decision), outcome: 'applied', why: null, from: { run: thu.r.run, manifest: thu.r.hash }, repair: s.repair, filled: s.out.filled ?? 0 } as unknown as JSONValue);
    const report = await auditBag(await withRepairs(s));
    expect(failed(report).filter((l) => l.startsWith(`release #${again.seq}`))).toEqual([]);
    expect(report.lines.map((l) => l.what)).toContain(`release #${again.seq}: 1 output of run ${r.run} released, citing decision #${s.decision.seq}`);
  });

  it('fails a derived run that isn’t its held run’s repair, a donor on a day its rule doesn’t allow, and a donor claim that says something wrong', async () => {
    const s = await filled();
    const forged = (change: (a: DerivedAbout) => void) => (payload: BagFile[]) => {
      const f = payload.find((x) => x.path === 'record/entries.jsonl')!;
      const lines = new TextDecoder().decode(f.bytes).split('\n');
      const k = lines.findIndex((l) => l.includes('"outcome":"derived"'));
      const e = JSON.parse(lines[k]!) as LogEntry;
      change(e.about as unknown as DerivedAbout);
      lines[k] = canonicalJSON(e as never);
      f.bytes = enc.encode(lines.join('\n'));
    };
    // Each forgery changes a signed entry: the record fails too, and the derived run's line says what is wrong.
    const line = (r: Awaited<ReturnType<typeof auditBag>>) => failed(r).find((l) => l.startsWith(`run ${s.r.run} (#${s.derived.seq})`)) ?? '';
    expect(line(await auditBag(await withRepairs(s, undefined, forged((a) => (a.repair.missing = { time: 'tpep_pickup_datetime', hours: [12, 23] })))))).toContain(`its document isn't run ${s.thu.r.run}'s repaired by its repair`);
    expect(line(await auditBag(await withRepairs(s, undefined, forged((a) => (a.repair.donor!.direction = 'after')))))).toContain("its donor, 2024-01-04, isn't the same weekday after it within four weeks");
    expect(line(await auditBag(await withRepairs(s, undefined, forged((a) => (a.from = { run: s.wed.r.run, manifest: s.wed.r.hash })))))).toContain(`it repairs run ${s.wed.r.run} (${s.wed.r.hash.slice(0, 16)}…), which the record doesn't hold before it`);
    const wrongDonor = failed(await auditBag(await withRepairs(s, (x) => {
      const j = x.derived[0]!.donors[0]!;
      if ('claim' in j) j.claim = { ...j.claim, state: 'wrong', head: 'Vendor 1 sent almost nothing' };
    })));
    expect(wrongDonor.join('\n')).toContain("its donor's claim says something wrong: Vendor 1 sent almost nothing");
    expect(wrongDonor.join('\n')).toContain("the engine's holds for it as a derived run aren't what its plan and its donors hold");
  });

  it('fails a release whose decision doesn’t name its keys, and one that moved the names back past a later day', async () => {
    const s = await filled();
    const forged = await decide(s, s.thu.r, s.thu.keys, 'owner', { option: 'fill', repair: s.repair, derived: { run: s.r.run, manifest: s.r.hash, keys: { trip_hours: 'f'.repeat(64) } } }, null, s.decision.seq);
    const rel = await s.rec.append('release', 'owner', { run: s.r.run, manifest: s.r.hash, outputs: s.keys, decision: forged.seq, leaf: LEAF(forged), outcome: 'applied', why: null } as unknown as JSONValue);
    expect(failed(await auditBag(await withRepairs(s)))).toContain(`release #${rel.seq}: 1 output of run ${s.r.run} released, citing decision #${forged.seq}: its keys aren't those of the derived run its decision names`);
    // Fri 12 published, then a refill of Thu 11 recorded as applied: it would move the names back.
    const t = await filled();
    load(t.db, 'day_trips', '2024-01-12');
    const fri = await runFlow(t.db, t.doc, { smaltdb: SMALTDB, parameters: { day: '2024-01-12' }, claims: [t.claim('2024-01-12')], log: t.rec.head() });
    await keepRun(t.rec, t.db, fri.manifest, fri.hash, fri.run, { day: '2024-01-12', inputs: inputsOf(fri.manifest) as unknown as JSONValue });
    const again = await decide(t, t.thu.r, t.thu.keys, 'owner', { option: 'fill', repair: t.repair, derived: { run: t.r.run, manifest: t.r.hash, keys: t.keys } }, null, t.decision.seq);
    const late = await t.rec.append('release', 'owner', { run: t.r.run, manifest: t.r.hash, outputs: t.keys, decision: again.seq, leaf: LEAF(again), outcome: 'applied', why: null, from: { run: t.thu.r.run, manifest: t.thu.r.hash }, repair: t.repair } as unknown as JSONValue);
    expect(failed(await auditBag(await withRepairs(t)))).toContain(`release #${late.seq}: 1 output of run ${t.r.run} released, citing decision #${again.seq}: it moved the names back past 2024-01-12, published before it`);
  });
});
