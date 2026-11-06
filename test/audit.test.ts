/**
 * The record and the audit bag, end to end in Node (the record in memory, as in a browser without storage): a run's
 * manifest kept and named by the record, checkpoints signed, a bag built and checked as an auditor would, and each
 * kind of tampering caught: an entry changed, an entry removed from the end, a manifest swapped, a proof that doesn't
 * hold, and a record rewritten after a checkpoint the auditor kept.
 */
import { describe, expect, it } from 'vitest';
import { FlowRecord } from '../src/app/record.js';
import { auditBag } from '../src/core/audit.js';
import { buildBag, type BagFile } from '../src/core/bag.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { runFlow } from '../src/index.js';
import { loadFixture, makeTrips, visualFlow } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';
import { installFakeIndexedDB } from './helpers/fake-idb.js';

const enc = new TextEncoder();

/** A run in the record, as the app keeps it: its manifest and its plan by hash, and the run entry naming both. */
async function keepRun(rec: FlowRecord, db: ReturnType<typeof openEngine>, manifest: { plan: string }, hash: string, run: number) {
  const blob = await rec.keep('manifest', manifest);
  const row = db.query('SELECT plan FROM _smaltfl_plans WHERE hash = ?', [manifest.plan]).rows[0];
  const plan = row ? await rec.keep('plan', JSON.parse(String(row[0]))) : null;
  return rec.append('run', 'owner', { run, manifest: hash, blob, plan, load: null, outcome: 'ok', files: [] });
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
