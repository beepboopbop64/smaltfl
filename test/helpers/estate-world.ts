/**
 * The control estate (examples/control-estate/) through the engine, as the app runs it (ADR 0013 §8, ADR 0014): every
 * watch's history built from the days before (each control's file measured; the posture built by a run of the flow
 * without its publish block, then measured), then each day's loads arriving one a day, the controls' claims told by
 * the page and the posture's told in the engine. The claims told are kept, so a test can ask what a watch said of a
 * day that published (unusual, a note) as well as what held it. test/estate-flow.test.ts judges March against ADR
 * 0014's answer key, slice by slice.
 */
import { readFileSync } from 'node:fs';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../../src/plugin/index.js';
import { plusDays } from '../../src/core/calendar.js';
import { canonicalJSON } from '../../src/core/canonical.js';
import type { FlowDocument } from '../../src/core/document.js';
import { sha256Hex, utf8 } from '../../src/core/hash.js';
import type { HistoryFile, HistoryRanges } from '../../src/core/history.js';
import { loadClaim, tailPath, type Claim, type HistoryRef, type StoryClaim2 } from '../../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, tailBefore, watchColumns, type Measures } from '../../src/core/measures.js';
import type { RunResult } from '../../src/core/protocol.js';
import { measureLoad, pinFile, runFlow, sampleLoad, translate } from '../../src/index.js';
import { appendSample, emptySample, SAMPLE_KEEP, samplePath, type SampleFile } from '../../src/core/apart.js';
import { pinnedDdl, type DataBindings } from '../../examples/sources.js';
import { appsCsv, csvOf, ESTATE_CONTROLS, estateApps, estateRows, type EstateApp, type EstateOptions } from '../fixtures/estate.js';
import { SMALTDB } from './engine.js';
import { loadFlowDir } from './notebooks.js';

export const estateDir = new URL('../../examples/control-estate/', import.meta.url);
export const ESTATE_WATCHES = [...ESTATE_CONTROLS, 'posture'] as const;

export interface EstateWorld {
  doc: FlowDocument;
  db: Database;
  apps: EstateApp[];
  bases: Record<string, HistoryFile>;
  /** Each watch's kept sample (ADR 0014 §5): the base's days, with each load's kept rows appended as it arrives. */
  samples: Record<string, SampleFile>;
  /** Each day's run, or the error that stopped it (a file the engine refused). */
  results: Map<string, RunResult | Error>;
  /** Each day's claims as the page told them for the controls, by source. */
  claims: Map<string, Record<string, StoryClaim2 | null>>;
  /** Each day's measures of the controls as the page took them, and the ranges each claim was told from (the history
   * with the day as its last), by source: what a test reads a day's counts and its story's findings from. */
  measures: Map<string, Record<string, Measures>>;
  ranges: Map<string, Record<string, HistoryRanges>>;
  result(day: string): RunResult;
  close(): void;
}

/**
 * A world: the histories from `baseFrom` to `baseTo`, then every day from the day after `baseTo` to `loadsTo` run as it
 * arrives. The fixture's options choose the seed, the applications and the trouble planted.
 */
export async function estateWorld(o: EstateOptions & { baseFrom: string; baseTo: string; loadsTo: string; warmup?: number }): Promise<EstateWorld> {
  const doc = await loadFlowDir(estateDir);
  const data = JSON.parse(readFileSync(new URL('data.json', estateDir), 'utf8')) as DataBindings;
  /** An engine with the inventory and every control's table declared. The base's days each run in one of their own,
   * dropped after: each run stores its snapshots, and an engine whose catalog keeps growing slows every later run. */
  const apps = estateApps(o);
  let db!: Database;
  const open = async (): Promise<Database> => {
    const d = Database.openMemory({ plugins: [io, external, smaltfl] });
    await pinFile(d, 'apps.csv', utf8(appsCsv(apps)));
    for (const b of Object.values(data.sources)) await d.execAsync(pinnedDdl(b));
    return d;
  };
  const bases: Record<string, HistoryFile> = {};
  const samples: Record<string, SampleFile> = {};
  const refs: Record<string, HistoryRef> = {};
  const tails: Record<string, Measures[]> = Object.fromEntries(ESTATE_WATCHES.map((w) => [w, []]));
  const results = new Map<string, RunResult | Error>();
  const claimsTold = new Map<string, Record<string, StoryClaim2 | null>>();
  const measuresTaken = new Map<string, Record<string, Measures>>();
  const rangesTold = new Map<string, Record<string, HistoryRanges>>();

  const pinDay = async (day: string, d: Database = db) => {
    for (const c of ESTATE_CONTROLS) {
      const { columns, rows } = estateRows(c, day, apps, o);
      await pinFile(d, `${c}.csv`, utf8(csvOf(columns, rows)));
    }
  };
  /** A watch's measure settings for a day: from its base once there is one, else the builder's default columns. */
  // The day's plan, translated once for every watch that asks for it.
  const plans = new Map<string, ReturnType<typeof translate>>();
  const settingsOf = async (day: string, w: string) => {
    if (!plans.has(day)) plans.set(day, translate(doc, { day }));
    const plan = await plans.get(day)!;
    const node = plan.nodes.findIndex((n) => n.origin === w);
    const s = settingsFor(plan, node, bases[w] ?? null, doc.steps)!;
    if (bases[w]) return { plan, s };
    const c = watchColumns(doc, w);
    return { plan, s: { ...s, counted: c.count, followed: c.follow, paired: c.pair } };
  };
  const pinTail = (w: string) => pinFile(db, tailPath(w), utf8(canonicalJSON(tailBefore(tails[w]!, '9999') as unknown as Parameters<typeof canonicalJSON>[0])));
  /** A load's arrival: each control measured and its claim told by the page, the posture's told in the engine. */
  const arrive = async (day: string): Promise<RunResult> => {
    await pinDay(day);
    const claims: Claim[] = [];
    const told: Record<string, StoryClaim2 | null> = {};
    const measured: Record<string, Measures> = {};
    const kept: Record<string, unknown[][]> = {};
    const ranges: Record<string, HistoryRanges> = {};
    for (const c of ESTATE_CONTROLS) {
      const { plan, s } = await settingsOf(day, c);
      let m: Measures;
      try {
        m = await measureLoad(db, `${c}_file`, s);
      } catch {
        // The file can't be read as declared: no claim; the run holds on it (ADR 0014 §2, slice 7).
        told[c] = null;
        continue;
      }
      measured[c] = m;
      await pinTail(c);
      // The load's kept rows (ADR 0014 §5): the classifier's today, against the sample's like days.
      kept[c] = (await sampleLoad(db, `${c}_file`, { keep: SAMPLE_KEEP, strata: s.counted })).rows;
      const t = await loadClaim({ doc, source: c, flow: plan.flow.hash, base: bases[c]!, baseRef: refs[c]!, tail: tails[c]!, measures: m, settings: s, skip: [], build: 'dev', sample: samples[c]!, kept: kept[c] });
      told[c] = t?.claim ?? null;
      if (t) (claims.push(t.claim), (ranges[c] = t.ranges));
    }
    claimsTold.set(day, told);
    measuresTaken.set(day, measured);
    rangesTold.set(day, ranges);
    await pinTail('posture');
    await pinFile(db, samplePath('posture'), utf8(JSON.stringify(samples.posture)));
    const r = await runFlow(db, doc, { smaltdb: SMALTDB, parameters: { day }, claims, tell: { posture: { skip: [], levels: [] } } });
    for (const c of ESTATE_CONTROLS) {
      if (!measured[c]) continue;
      tails[c]!.push(measured[c]!);
      samples[c] = appendSample(samples[c]!, day, kept[c]!);
    }
    const p = r.measures?.find((m) => m.source === 'posture');
    if (p) tails.posture!.push(p);
    if (r.kept?.posture) samples.posture = appendSample(samples.posture!, day, r.kept.posture);
    return r;
  };

  const bare: FlowDocument = { ...doc };
  delete bare.publish;
  const periods: Record<string, Measures[]> = Object.fromEntries(ESTATE_WATCHES.map((w) => [w, []]));
  const keptDays: Record<string, [string, unknown[][]][]> = Object.fromEntries(ESTATE_WATCHES.map((w) => [w, []]));
  for (let day = o.baseFrom; day <= o.baseTo; day = plusDays(day, 1)) {
    const d = await open();
    await pinDay(day, d);
    for (const c of ESTATE_CONTROLS) {
      const s = (await settingsOf(day, c)).s;
      periods[c]!.push(await measureLoad(d, `${c}_file`, s));
      keptDays[c]!.push([day, (await sampleLoad(d, `${c}_file`, { keep: SAMPLE_KEEP, strata: s.counted })).rows]);
    }
    const r = await runFlow(d, bare, { smaltdb: SMALTDB, parameters: { day } });
    if (!r.published.includes('posture')) throw new Error(`${day}: the bare run didn't publish the posture`);
    const ps = (await settingsOf(day, 'posture')).s;
    periods.posture!.push(await measureLoad(d, 'posture', ps));
    keptDays.posture!.push([day, (await sampleLoad(d, 'posture', { keep: SAMPLE_KEEP, strata: ps.counted })).rows]);
    d.close();
  }
  db = await open();
  for (const w of ESTATE_WATCHES) {
    const ms = periods[w]!;
    const m0 = ms[0]!;
    const c = watchColumns(doc, w);
    // The marks and the gate's rules the history keeps counts for (ADR 0014): as the plan's watch carries them.
    const rules = (await settingsOf(o.baseTo, w)).s;
    bases[w] = appendPeriods(emptyHistory({ flow: doc.id, source: w, settings: { checks: m0.checks, counted: c.count, followed: c.follow, paired: c.pair, time: null, zone: null, sample: 2000, ...(rules.due ? { due: rules.due } : {}), ...(rules.scope ? { scope: rules.scope } : {}), ...(rules.needs ? { needs: rules.needs } : {}), ...(rules.reconcile ? { reconcile: rules.reconcile } : {}) }, columns: m0.columns, types: m0.types, kinds: m0.kinds, warmup: o.warmup ?? 14 }), ms);
    const path = `history.${w}.json`;
    const bytes = utf8(JSON.stringify(bases[w]));
    refs[w] = { path, sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
    await pinFile(db, path, bytes, refs[w]!.sha256);
    let sample = emptySample({ flow: doc.id, source: w, columns: m0.columns, kinds: m0.kinds });
    for (const [day, rows] of keptDays[w]!) sample = appendSample(sample, day, rows);
    samples[w] = sample;
  }
  for (let day = plusDays(o.baseTo, 1); day <= o.loadsTo; day = plusDays(day, 1)) {
    try {
      results.set(day, await arrive(day));
    } catch (e) {
      results.set(day, e as Error);
    }
  }
  return {
    doc, db, apps, bases, samples, results, claims: claimsTold, measures: measuresTaken, ranges: rangesTold,
    result(day) {
      const r = results.get(day);
      if (!r || r instanceof Error) throw new Error(`${day}: ${r ? r.message : 'not run'}`);
      return r;
    },
    close: () => db.close(),
  };
}

/** A run's holds, as `by:origin`, sorted. */
export const estateHolds = (r: RunResult): string[] => r.holds.map((h) => `${h.by}:${h.origin}`).sort();
