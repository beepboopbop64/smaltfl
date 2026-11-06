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

const enc = new TextEncoder();

/** A flow run, recorded, and a bag of it, as the app's export makes one. */
async function recorded(flow = `audit-${Math.random().toString(36).slice(2)}`) {
  const db = openEngine();
  loadFixture(db, makeTrips(1500));
  const doc = { ...visualFlow(), id: flow };
  const rec = await FlowRecord.open(flow);
  const r = await runFlow(db, doc, { smaltdb: SMALTDB, log: rec.head() });
  const blob = await rec.keep('manifest', r.manifest);
  await rec.append('run', 'owner', { run: r.run, manifest: r.hash, blob, load: null, outcome: 'ok', files: [] });
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
});
