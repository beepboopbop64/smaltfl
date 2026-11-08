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
import { auditBag, type EngineName, type EngineRelease } from '../src/core/audit.js';
import { buildBag, type BagFile } from '../src/core/bag.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { withoutDisplay } from '../src/core/document.js';
import { heldOutputs, inputsOf, stagedKeys, type DecideAbout, type HeldAbout, type ReleaseAbout } from '../src/core/hold.js';
import { entryLeaf, type JSONValue, type LogEntry } from '../src/core/log.js';
import { policiesHash, type RunManifest } from '../src/core/manifest.js';
import { flowHash, type FlowPlan } from '../src/core/plan.js';
import { zip } from '../src/core/zip.js';
import { findVersion, pointDataset } from '../src/plugin/store.js';
import { releaseRun, runFlow, type FlowDocument, type RunResult } from '../src/index.js';
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
function holdingFlow(id: string): FlowDocument {
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
    publish: { hold: ['checks'] },
  };
}

/** A flow, its record, and its document kept by the record as the app keeps it. */
async function holdingRecord() {
  const flow = `paused-${Math.random().toString(36).slice(2)}`;
  const db = openEngine();
  loadFixture(db, makeTrips(1500));
  const doc = holdingFlow(flow);
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
  const names = (await db.callPlugin('smaltfl', 'names', [])) as { datasets: EngineName[]; releases: EngineRelease[] };
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
  ];
  for (const d of names.datasets) {
    const runEntry = [...rec.entries].reverse().find((e) => e.kind === 'run' && (e.about as { manifest?: string }).manifest === d.manifest)!;
    const m = JSON.parse(String(db.query('SELECT manifest FROM _smaltfl_runs WHERE id = ?', [d.run]).rows[0]![0])) as RunManifest;
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
    expect(lines).toContainEqual("the engine's 3 dataset names show versions their runs made, and no held run's output without a release");
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
    expect(failed(await auditBag(await pausedBag(s)))).toEqual([`run ${r.run} (#${entry.seq}): it was recorded as published, and its manifest's counts hold it`]);
  });

  it("fails a held run whose manifest isn't in the bag", async () => {
    const s = await released();
    const blob = (s.thu.entry.about as { blob: string }).blob;
    const f = failed(await auditBag(await pausedBag(s, (payload) => payload.splice(payload.findIndex((x) => x.path === `blobs/manifest-${blob}.json`), 1))));
    expect(f).toContain(`run ${s.thu.r.run} (#${s.thu.entry.seq}): its manifest isn't in the bag`);
  });
});
