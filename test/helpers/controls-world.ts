/**
 * The controls flow (examples/controls/) through the engine, as the app runs it (ADR 0013): every watch's history
 * built from the days before (each control's file measured; the posture built by a run of the flow without its publish
 * block, then measured), then each day's loads arriving one a day, the controls' claims told by the page and the
 * posture's told in the engine. Shared by test/controls.test.ts (the demo's planted days) and
 * test/controls-anyday.test.ts (other trouble, other days, another seed: the judges know no date).
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
import type { HistoryFile } from '../../src/core/history.js';
import { loadClaim, tailPath, type Claim, type HistoryRef } from '../../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, tailBefore, watchColumns, type Measures } from '../../src/core/measures.js';
import type { RunResult } from '../../src/core/protocol.js';
import { measureLoad, pinFile, runFlow, translate } from '../../src/index.js';
import { pinnedDdl, type DataBindings } from '../../examples/sources.js';
import { appRows, appsCsv, controlRows, CONTROLS, csvOf, type App, type ControlsOptions } from '../fixtures/controls.js';
import { SMALTDB } from './engine.js';
import { loadFlowDir } from './notebooks.js';

export const controlsDir = new URL('../../examples/controls/', import.meta.url);
export const WATCHES = [...CONTROLS, 'posture'] as const;

export interface ControlsWorld {
  doc: FlowDocument;
  db: Database;
  apps: App[];
  bases: Record<string, HistoryFile>;
  /** Each day's run, or the error that stopped it (a file the engine refused). */
  results: Map<string, RunResult | Error>;
  result(day: string): RunResult;
  close(): void;
}

/**
 * A world: the histories from `baseFrom` to `baseTo`, then every day from the day after `baseTo` to `loadsTo` run as it
 * arrives. The fixture's options choose the seed, the applications and the trouble planted.
 */
export async function controlsWorld(o: ControlsOptions & { baseFrom: string; baseTo: string; loadsTo: string; warmup?: number }): Promise<ControlsWorld> {
  const doc = await loadFlowDir(controlsDir);
  const data = JSON.parse(readFileSync(new URL('data.json', controlsDir), 'utf8')) as DataBindings;
  const apps = appRows(o);
  /** An engine with the inventory and every control's table declared. The base's days each run in one of their own,
   * dropped after: each run stores its snapshots, and an engine whose catalog keeps growing slows every later run. */
  const open = async (): Promise<Database> => {
    const d = Database.openMemory({ plugins: [io, external, smaltfl] });
    await pinFile(d, 'apps.csv', utf8(appsCsv(apps)));
    for (const b of Object.values(data.sources)) await d.execAsync(pinnedDdl(b));
    return d;
  };
  let db!: Database;
  const bases: Record<string, HistoryFile> = {};
  const refs: Record<string, HistoryRef> = {};
  const tails: Record<string, Measures[]> = Object.fromEntries(WATCHES.map((w) => [w, []]));
  const results = new Map<string, RunResult | Error>();

  const pinDay = async (day: string, d: Database = db) => {
    for (const c of CONTROLS) {
      const { columns, rows } = controlRows(c, day, apps, o);
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
  };

  const bare: FlowDocument = { ...doc };
  delete bare.publish;
  const periods: Record<string, Measures[]> = Object.fromEntries(WATCHES.map((w) => [w, []]));
  for (let day = o.baseFrom; day <= o.baseTo; day = plusDays(day, 1)) {
    const d = await open();
    await pinDay(day, d);
    for (const c of CONTROLS) periods[c]!.push(await measureLoad(d, `${c}_file`, (await settingsOf(day, c)).s));
    const r = await runFlow(d, bare, { smaltdb: SMALTDB, parameters: { day } });
    if (!r.published.includes('posture')) throw new Error(`${day}: the bare run didn't publish the posture`);
    periods.posture!.push(await measureLoad(d, 'posture', (await settingsOf(day, 'posture')).s));
    d.close();
  }
  db = await open();
  for (const w of WATCHES) {
    const ms = periods[w]!;
    const m0 = ms[0]!;
    const c = watchColumns(doc, w);
    // The marks and the gate's rules the history keeps counts for (ADR 0014): as the plan's watch carries them.
    const rules = (await settingsOf(o.baseTo, w)).s;
    bases[w] = appendPeriods(emptyHistory({ flow: doc.id, source: w, settings: { checks: m0.checks, counted: c.count, followed: c.follow, paired: c.pair, time: null, zone: null, sample: 2000, ...(rules.due ? { due: rules.due } : {}), ...(rules.scope ? { scope: rules.scope } : {}), ...(rules.needs ? { needs: rules.needs } : {}) }, columns: m0.columns, types: m0.types, kinds: m0.kinds, warmup: o.warmup ?? 14 }), ms);
    const path = `history.${w}.json`;
    const bytes = utf8(JSON.stringify(bases[w]));
    refs[w] = { path, sha256: await sha256Hex(bytes), bytes: bytes.byteLength };
    await pinFile(db, path, bytes, refs[w]!.sha256);
  }
  for (let day = plusDays(o.baseTo, 1); day <= o.loadsTo; day = plusDays(day, 1)) {
    try {
      results.set(day, await arrive(day));
    } catch (e) {
      results.set(day, e as Error);
    }
  }
  return {
    doc, db, apps, bases, results,
    result(day) {
      const r = results.get(day);
      if (!r || r instanceof Error) throw new Error(`${day}: ${r ? r.message : 'not run'}`);
      return r;
    },
    close: () => db.close(),
  };
}

/** A run's holds, as `by:origin`, sorted. */
export const holdsOn = (r: RunResult): string[] => r.holds.map((h) => `${h.by}:${h.origin}`).sort();
