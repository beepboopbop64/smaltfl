/**
 * The security example (examples/security-signins.smaltfl.json, ADR 0010 phase 2): its daily sign-in files generated
 * from the fixture's seed (scripts/data/security.ts writes the same rows), read through its data list's binding, each
 * day measured by the plugin and folded into a history as the general builder folds one. The burst of Tuesday March 12,
 * 2024 is something wrong, its head on the failed sign-ins (the result's `fail`), and pauses the day; the Monday before is
 * calm.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../src/plugin/index.js';
import { utf8 } from '../src/core/hash.js';
import { claimHolds, loadClaim } from '../src/core/hold.js';
import { appendPeriods, emptyHistory, settingsFor, type Measures } from '../src/core/measures.js';
import { measureLoad, pinFile, translate, type FlowDocument } from '../src/index.js';
import { pinnedDdl, type DataBindings } from '../examples/sources.js';
import { csvOf, PLANTED, securityDays, securityRows } from './fixtures/security.js';

const doc = JSON.parse(readFileSync(new URL('../examples/security-signins.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
const data = JSON.parse(readFileSync(new URL('../examples/security-signins.data.json', import.meta.url), 'utf8')) as DataBindings;

describe('the security example', () => {
  it('is format 3, watched in the general form, and its plan is plan/2', async () => {
    expect(doc.smaltfl).toBe(3);
    expect(doc.publish?.watch?.auth).toEqual({ history: 'history.json', time: 'event_time' });
    expect((await translate(doc, { day: PLANTED.burst })).smaltflPlan).toBe(2);
    expect(data.sources.auth).toMatchObject({ table: 'auth_file', format: 'csv' });
  });

  it('tells the burst as something wrong from its generated files, and the day before as calm', async () => {
    const b = data.sources.auth!;
    const db = Database.openMemory({ plugins: [io, external, smaltfl] });
    try {
      let made = false;
      const measured: Measures[] = [];
      const plans = securityDays().filter((p) => p.day >= '2024-01-01' && p.day <= PLANTED.burst);
      for (const plan of plans) {
        await pinFile(db, b.file, utf8(csvOf(securityRows(plan, 0.01))));
        if (!made) await db.execAsync(pinnedDdl(b));
        made = true;
        // The history's days measured as the general builder measures them: the ontology's counted and serious columns.
        const s = settingsFor(await translate(doc, { day: plan.day }), 0, null, doc.steps)!;
        measured.push(await measureLoad(db, b.table, { ...s, counted: ['result', 'method'], followed: ['country'], paired: ['result', 'method'] }));
      }
      const [base, tail] = [measured.slice(0, -2), measured.slice(-2)];
      const m0 = base[0]!;
      const history = appendPeriods(emptyHistory({ flow: doc.id, source: 'auth', settings: { checks: m0.checks, counted: ['result', 'method'], followed: ['country'], paired: ['result', 'method'], time: 'event_time', zone: null, sample: 2000 }, columns: m0.columns, types: m0.types, kinds: m0.kinds }), base);
      const tell = async (k: number) => {
        const m = tail[k]!;
        const settings = settingsFor(await translate(doc, { day: m.slot }), 0, history, doc.steps)!;
        return (await loadClaim({ doc, source: 'auth', flow: (await translate(doc, { day: m.slot })).flow.hash, base: history, baseRef: { path: 'history.json', sha256: 'a'.repeat(64), bytes: 1 }, tail: tail.slice(0, k), measures: m, settings, skip: [], build: 'dev' }))!.claim;
      };
      const monday = await tell(0);
      expect(monday).toMatchObject({ slot: '2024-03-11', state: 'calm' });
      const burst = await tell(1);
      expect(burst).toMatchObject({ slot: PLANTED.burst, state: 'wrong' });
      // The flow's verdict names parts raw, as its claims always have (the viewer's story says "Failed").
      expect(burst.head).toMatch(/^result fail [\d.]+× usual$/);
      expect(claimHolds(doc.publish!.hold, burst)).toBe(true);
      expect(burst.history.tail).toMatchObject({ size: 1 });
    } finally {
      db.close();
    }
  }, 120_000);
});
