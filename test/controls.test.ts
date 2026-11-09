/**
 * The controls posture (ADR 0013, examples/controls/) through the engine: six controls, each its own daily file and its
 * own watch, and the posture across them a watched step, its claim told in the engine. Each watch's history is built
 * from the days before as the general builder builds it (a run of the flow a day for the posture), then the loads of
 * March 2024 arrive one a day, and each planted day is told by what went wrong, in the place that saw it:
 *
 * - a calm day publishes everything;
 * - the day the patching file is empty holds on patching (almost no rows) and on the posture (patching blank);
 * - the day the logging file lacks a column is refused by the engine, by the file's declared columns;
 * - the day MFA statuses read ERROR holds on MFA's checks and on its story (a value never seen), the posture seeing
 *   the dropped rows as blanks;
 * - the day backup failures all land on tested applications holds on backup alone, by the combination;
 * - the day every TLS failure passes encryption holds on the posture alone, by the combination across the two
 *   controls, each control's own watch quiet: the check nobody wrote.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../src/plugin/index.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { sha256Hex, utf8 } from '../src/core/hash.js';
import type { HistoryFile } from '../src/core/history.js';
import { loadClaim, tailPath, type Claim, type HistoryRef } from '../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, tailBefore, watchColumns, type Measures } from '../src/core/measures.js';
import type { RunResult } from '../src/core/protocol.js';
import { measureLoad, pinFile, runFlow, translate, verifyRun } from '../src/index.js';
import { pinnedDdl, type DataBindings } from '../examples/sources.js';
import { appRows, appsCsv, controlRows, CONTROLS, csvOf, PLANTED } from './fixtures/controls.js';
import { SMALTDB } from './helpers/engine.js';
import { loadFlowDir } from './helpers/notebooks.js';
import { plusDays } from '../src/core/calendar.js';

const dir = new URL('../examples/controls/', import.meta.url);
const WATCHES = [...CONTROLS, 'posture'] as const;
const BASE_FROM = '2024-01-01';
const BASE_TO = '2024-02-29';

let doc: FlowDocument;
let db: Database;
const apps = appRows();
const bases: Record<string, HistoryFile> = {};
const refs: Record<string, HistoryRef> = {};
const tails: Record<string, Measures[]> = Object.fromEntries(WATCHES.map((w) => [w, []]));
const results = new Map<string, RunResult | Error>();

/** A day's files pinned under the bindings' names. */
async function pinDay(day: string): Promise<void> {
  for (const c of CONTROLS) {
    const { columns, rows } = controlRows(c, day, apps);
    await pinFile(db, `${c}.csv`, utf8(csvOf(columns, rows)));
  }
}

/** A watch's measure settings for a day: from its base once there is one, else the builder's default columns. */
async function settingsOf(day: string, w: string) {
  const plan = await translate(doc, { day });
  const node = plan.nodes.findIndex((n) => n.origin === w);
  const s = settingsFor(plan, node, bases[w] ?? null, doc.steps)!;
  if (bases[w]) return { plan, s };
  const c = watchColumns(doc, w);
  return { plan, s: { ...s, counted: c.count, followed: c.follow, paired: c.pair } };
}

async function pinTail(w: string): Promise<void> {
  await pinFile(db, tailPath(w), utf8(canonicalJSON(tailBefore(tails[w]!, '9999') as unknown as Parameters<typeof canonicalJSON>[0])));
}

/** A load's arrival: each control measured and its claim told by the page, the posture's told in the engine. */
async function arrive(day: string): Promise<RunResult> {
  await pinDay(day);
  const claims: Claim[] = [];
  const measured: Record<string, Measures> = {};
  for (const c of CONTROLS) {
    const { plan, s } = await settingsOf(day, c);
    const m = await measureLoad(db, `${c}_file`, s);
    measured[c] = m;
    await pinTail(c);
    const told = await loadClaim({ doc, source: c, flow: plan.flow.hash, base: bases[c]!, baseRef: refs[c]!, tail: tails[c]!, measures: m, settings: s, skip: [], build: 'dev' });
    if (told) claims.push(told.claim);
  }
  await pinTail('posture');
  const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day }, claims, tell: { posture: { skip: [], levels: [] } } });
  for (const c of CONTROLS) tails[c]!.push(measured[c]!);
  const p = r.measures?.find((m) => m.source === 'posture');
  if (p) tails.posture!.push(p);
  return r;
}

beforeAll(async () => {
  doc = await loadFlowDir(dir);
  const data = JSON.parse(readFileSync(new URL('data.json', dir), 'utf8')) as DataBindings;
  db = Database.openMemory({ plugins: [io, external, smaltfl] });
  await pinFile(db, 'apps.csv', utf8(appsCsv(apps)));
  for (const b of Object.values(data.sources)) await db.execAsync(pinnedDdl(b));
  // The histories, as the builder makes them: each control's file measured; the posture built by a run of the flow
  // without its publish block, then measured.
  const bare: FlowDocument = { ...doc };
  delete bare.publish;
  const periods: Record<string, Measures[]> = Object.fromEntries(WATCHES.map((w) => [w, []]));
  for (let day = BASE_FROM; day <= BASE_TO; day = plusDays(day, 1)) {
    await pinDay(day);
    for (const c of CONTROLS) periods[c]!.push(await measureLoad(db, `${c}_file`, (await settingsOf(day, c)).s));
    const r = await runFlow(db, bare, { smaltdb: SMALTDB, parameters: { day } });
    expect(r.published).toContain('posture');
    periods.posture!.push(await measureLoad(db, 'posture', (await settingsOf(day, 'posture')).s));
  }
  for (const w of WATCHES) {
    const ms = periods[w]!;
    const m0 = ms[0]!;
    const c = watchColumns(doc, w);
    bases[w] = appendPeriods(emptyHistory({ flow: doc.id, source: w, settings: { checks: m0.checks, counted: c.count, followed: c.follow, paired: c.pair, time: null, zone: null, sample: 2000 }, columns: m0.columns, types: m0.types, kinds: m0.kinds, warmup: 14 }), ms);
    const path = `history.${w}.json`;
    const bytes = utf8(JSON.stringify(bases[w]));
    refs[w] = { path, sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
    await pinFile(db, path, bytes, refs[w]!.sha256);
  }
  for (let day = '2024-03-01'; day <= '2024-03-22'; day = plusDays(day, 1)) {
    try {
      results.set(day, await arrive(day));
    } catch (e) {
      results.set(day, e as Error);
    }
  }
}, 600_000);

afterAll(() => db?.close());

const result = (day: string): RunResult => {
  const r = results.get(day);
  if (!r || r instanceof Error) throw new Error(`${day}: ${r ? r.message : 'not run'}`);
  return r;
};
const holdsOn = (r: RunResult) => r.holds.map((h) => `${h.by}:${h.origin}`).sort();

describe('the controls flow (ADR 0013)', () => {
  it('is a format-4 document that watches six sources and the posture step, and its histories keep pairs day by day', async () => {
    expect(validateDocument(doc)).toEqual([]);
    expect(Object.keys(doc.publish!.watch!)).toEqual([...WATCHES]);
    const plan = await translate(doc, { day: '2024-03-04' });
    expect(plan.smaltflPlan).toBe(3);
    expect(bases.posture!.columns).toEqual(['app_id', 'name', 'business_unit', 'environment', 'tier', 'tls', 'encryption', 'mfa', 'patching', 'logging', 'backup']);
    expect(Object.keys(bases.posture!.pairs)).toHaveLength(36);
    expect(bases.posture!.pairs['tls|encryption']!.counts).toHaveLength(60);
    expect(bases.backup!.pairs['status|restore_tested']!.counts).toHaveLength(60);
    expect(bases.tls!.step).toBe('tls_checked');
  });

  it('publishes a calm day, every watch judged, the posture’s claim told in the engine', () => {
    const r = result('2024-03-04');
    expect(r.holds).toEqual([]);
    expect(r.published).toEqual(['by_control', 'by_unit', 'posture']);
    expect(r.measures?.map((m) => `${m.source}:${m.rows}`)).toEqual([...CONTROLS.map((c) => `${c}:400`), 'posture:400']);
  });

  it('holds the day the patching file is empty on patching and on the posture, which sees the blanks', () => {
    const r = result(PLANTED.missing);
    expect(holdsOn(r)).toEqual(['story:patching', 'story:posture']);
    const patching = r.holds.find((h) => h.origin === 'patching')!;
    expect(patching.said).toMatch(/^Almost no apps: 0/);
    expect(patching.load).toMatchObject({ source: 'patching', slot: PLANTED.missing });
    const posture = r.holds.find((h) => h.origin === 'posture')!;
    expect(posture.said).toMatch(/^Patching blank: all/);
    expect(posture.claim).toMatchObject({ v: 2, source: 'posture', slot: PLANTED.missing, state: 'wrong', rows: 400 });
    expect(r.published).toEqual([]);
  });

  it('refuses the day the logging file lacks a column, by the file’s declared columns', () => {
    const r = results.get(PLANTED.column);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/logging_file: the header has 3 fields but 4 columns are declared/);
  });

  it('holds the day MFA statuses read ERROR on MFA’s checks and its story, a value never seen', () => {
    const r = result(PLANTED.odd);
    expect(holdsOn(r)).toEqual(expect.arrayContaining(['checks:mfa_checked', 'story:mfa']));
    expect(r.holds.find((h) => h.by === 'checks')!.said).toMatch(/^dropped 1\d\d of 400 rows \(\d+\.\d+%\), more than the 5% allowed$/);
    expect(r.holds.find((h) => h.origin === 'mfa')!.said).toMatch(/^New status: ERROR/);
    // The posture sees the dropped rows as blanks: told, on the posture, as what it is.
    expect(r.holds.find((h) => h.origin === 'posture')?.said).toMatch(/^Mfa blank: 40%/);
  });

  it('holds the day backup failures all land on tested applications on backup alone, by the combination', () => {
    const r = result(PLANTED.within);
    expect(holdsOn(r)).toEqual(['story:backup']);
    const h = r.holds[0]!;
    expect(h.said).toMatch(/^status fail with restore_tested yes: \d+$/);
    expect(h.load).toMatchObject({ source: 'backup', slot: PLANTED.within });
  });

  it('holds the day every TLS failure passes encryption on the posture alone, by the combination across the controls', async () => {
    const r = result(PLANTED.across);
    expect(holdsOn(r)).toEqual(['story:posture']);
    const h = r.holds[0]!;
    // The two cells that rose moved alike (every cell of a two-by-two table moves by the same amount): the rarer is named.
    expect(h.said).toMatch(/^tls (fail with encryption pass|pass with encryption fail): \d+$/);
    expect(h.claim).toMatchObject({ v: 2, source: 'posture', slot: PLANTED.across, state: 'wrong' });
    expect(h.load).toMatchObject({ source: 'posture', slot: PLANTED.across });
    // Each control's own share is as usual that day: no control holds, and nothing it builds from is off.
    const verified = await verifyRun(db, r.run, { smaltdb: SMALTDB, manifest: r.hash, level: 'rerun' });
    expect(verified.ok, JSON.stringify(verified.checks.filter((c) => !c.ok))).toBe(true);
  });

  it('publishes the other days of March', () => {
    for (let day = '2024-03-01'; day <= '2024-03-22'; day = plusDays(day, 1)) {
      if ((Object.values(PLANTED) as string[]).includes(day)) continue;
      const r = result(day);
      expect(holdsOn(r), day).toEqual([]);
    }
  });
});
