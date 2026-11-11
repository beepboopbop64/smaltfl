/**
 * The sign-ins (examples/security-signins/) through the engine, as the app runs them: the history and the kept sample
 * built from the generated days before the loads (each day's file measured and sampled by the plugin, as
 * scripts/data/history.ts does), then each load measured, sampled and judged with the days before it: its findings, as
 * the page tells them (`newsOf` with the kept sample, so the classifier runs), and its claim/2. The loads carry the
 * demo's planted days (`SIGNIN_DEMO`): what test/models.test.ts checks each model against.
 */
import { readFileSync } from 'node:fs';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../../src/plugin/index.js';
import { appendSample, emptySample, SAMPLE_KEEP, type SampleFile } from '../../src/core/apart.js';
import { plusDays } from '../../src/core/calendar.js';
import type { FlowDocument } from '../../src/core/document.js';
import { utf8 } from '../../src/core/hash.js';
import { HistoryRanges, type HistoryFile } from '../../src/core/history.js';
import { claimHolds, countedChecks, loadClaim, rangesFor, type StoryClaim2 } from '../../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, watchColumns, type Measures } from '../../src/core/measures.js';
import { flowNames, judgeOf, newsOf, type Finding } from '../../src/core/news.js';
import { measureLoad, pinFile, sampleLoad, translate } from '../../src/index.js';
import { pinnedDdl, type DataBindings } from '../../examples/sources.js';
import { csvOf, securityDays, securityRows, SIGNIN_DEMO, type SecurityOptions } from '../fixtures/security.js';
import { loadFlowDir, signinsDir } from './notebooks.js';

export interface SigninsWorld {
  doc: FlowDocument;
  base: HistoryFile;
  sample: SampleFile;
  /** Each load's findings as the page tells them, worst first, and its claim. */
  findings: Map<string, Finding[]>;
  claims: Map<string, StoryClaim2 | null>;
  /** Each load's measures and kept rows, and the ranges its day was judged with. */
  measures: Map<string, Measures>;
  kept: Map<string, unknown[][]>;
  ranges: Map<string, HistoryRanges>;
}

/** A world: the base from `baseFrom` to `baseTo`, the loads after it to `loadsTo`, at `scale` of the fixture's rows. */
export async function signinsWorld(o: { baseFrom: string; baseTo: string; loadsTo: string; scale?: number; options?: SecurityOptions }): Promise<SigninsWorld> {
  const doc = await loadFlowDir(signinsDir);
  const data = JSON.parse(readFileSync(new URL('data.json', signinsDir), 'utf8')) as DataBindings;
  const b = data.sources.auth!;
  const scale = o.scale ?? 0.01;
  const plans = new Map(securityDays(o.options ?? SIGNIN_DEMO).filter((p) => p.day >= o.baseFrom && p.day <= o.loadsTo).map((p) => [p.day, p]));
  const db = Database.openMemory({ plugins: [io, external, smaltfl] });
  const counted = watchColumns(doc, 'auth');
  try {
    let made = false;
    const measure = async (day: string, base: HistoryFile | null) => {
      await pinFile(db, b.file, utf8(csvOf(securityRows(plans.get(day)!, scale))));
      if (!made) await db.execAsync(pinnedDdl(b));
      made = true;
      const plan = await translate(doc, { day });
      const s = settingsFor(plan, plan.nodes.findIndex((n) => n.origin === 'auth'), base, doc.steps)!;
      const settings = base ? s : { ...s, counted: counted.count, followed: counted.follow, paired: counted.pair };
      const m = await measureLoad(db, b.table, settings);
      const kept = (await sampleLoad(db, b.table, { keep: SAMPLE_KEEP, strata: settings.counted })).rows;
      return { m, kept, settings, flow: plan.flow.hash };
    };
    const periods: Measures[] = [];
    let sample: SampleFile | null = null;
    for (let day = o.baseFrom; day <= o.baseTo; day = plusDays(day, 1)) {
      const { m, kept } = await measure(day, null);
      periods.push(m);
      sample = appendSample(sample ?? emptySample({ flow: doc.id, source: 'auth', columns: m.columns, kinds: m.kinds }), day, kept);
    }
    const m0 = periods[0]!;
    const base = appendPeriods(emptyHistory({ flow: doc.id, source: 'auth', settings: { checks: m0.checks, counted: counted.count, followed: counted.follow, paired: counted.pair, time: 'event_time', zone: null, sample: 2000 }, columns: m0.columns, types: m0.types, kinds: m0.kinds }), periods);
    const world: SigninsWorld = { doc, base, sample: sample!, findings: new Map(), claims: new Map(), measures: new Map(), kept: new Map(), ranges: new Map() };
    const tail: Measures[] = [];
    // A day that held is not learned from, as the page leaves out a day that didn't publish (its recorded skips).
    const skip: string[] = [];
    let kept = sample!;
    const names = flowNames(doc, 'auth');
    for (let day = plusDays(o.baseTo, 1); day <= o.loadsTo; day = plusDays(day, 1)) {
      const { m, kept: today, settings, flow } = await measure(day, base);
      const told = await loadClaim({ doc, source: 'auth', flow, base, baseRef: { path: 'history.json', sha256: 'a'.repeat(64), bytes: 1 }, tail, measures: m, settings, skip: [...skip], build: 'dev', sample: kept, kept: today });
      const h = told?.ranges ?? new HistoryRanges(appendPeriods(base, [...tail, m]), { ...rangesFor(doc, 'auth'), recorded: new Set(skip) });
      world.findings.set(day, newsOf(h, day, names, { checks: countedChecks(doc, h, 'auth'), judge: judgeOf(doc, 'auth'), apart: { sample: kept, today } }));
      world.claims.set(day, told?.claim ?? null);
      world.measures.set(day, m);
      world.kept.set(day, today);
      world.ranges.set(day, h);
      tail.push(m);
      if (told && claimHolds(doc.publish!.hold, told.claim)) skip.push(day);
      kept = appendSample(kept, day, today);
    }
    return world;
  } finally {
    db.close();
  }
}
