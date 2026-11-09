/**
 * The taxi example as a notebook (ADR 0011 slice 3, examples/nyc-taxis-weather/): one notebook whose headings open the
 * stages, giving
 * the JSON example's fill and expect nodes, its outputs and its publish block, and the same rows on the XS fixtures.
 * The hold and donor vectors (test/hold-real.test.ts, test/fill-real.test.ts) read the history, not the steps, and
 * run on the JSON example: this file shows the two forms compute the same thing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { planKind } from '../src/core/manifest.js';
import { translate, type FlowPlan } from '../src/core/plan.js';
import { runFlow } from '../src/index.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { exampleDoc } from './helpers/example.js';
import { loadFlowDir } from './helpers/notebooks.js';

const taxiDir = new URL('../examples/nyc-taxis-weather/', import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/xs/${name}`, import.meta.url)));

/** A plan's nodes by origin, inputs named by origin too, so two plans compare whatever order their nodes came in. */
const byOrigin = (plan: FlowPlan) => Object.fromEntries(plan.nodes.map((n) => [n.origin, { ...n, inputs: n.inputs.map((i) => plan.nodes[i]!.origin) }]));

describe('the taxi example as notebooks (ADR 0011 §1, §5)', () => {
  it('is the JSON example, step for step: the same ids, inputs and outputs, the fill and the checks', async () => {
    const doc = await loadFlowDir(taxiDir);
    const json = exampleDoc();
    expect(doc.smaltfl).toBe(4);
    expect(validateDocument(doc)).toEqual([]);
    const shape = (d: FlowDocument) => d.steps.map((s) => [s.id, s.kind === 'expectations' || s.kind === 'fill' ? s.kind : 'query', s.inputs, !!s.dataset]);
    const sorted = (xs: unknown[][]) => [...xs].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(sorted(shape(doc))).toEqual(sorted(shape(json)));
    const plan = await translate(doc, { day: '2024-01-15' });
    const other = await translate(json, { day: '2024-01-15' });
    expect(plan.smaltflPlan).toBe(3);
    expect(planKind(plan)).toBe('plan/3');
    const [a, b] = [byOrigin(plan), byOrigin(other)];
    expect(a.trips_filled).toEqual(b.trips_filled);
    expect(a.trips_valid).toEqual(b.trips_valid);
    // A sql cell keeps its statement as written; the JSON example's is on one line.
    const squeeze = (n: { sql?: string }) => ({ ...n, sql: n.sql?.replace(/\s+/g, ' ').trim() });
    expect(squeeze(a.zone_list as { sql: string })).toEqual(squeeze(b.zone_list as { sql: string }));
    expect(plan.outputs.map((o) => o.name)).toEqual(other.outputs.map((o) => o.name));
    expect(plan.publish).toEqual(other.publish);
    // Everything but the steps and the format is the JSON example's; the steps share their ids, descriptions and
    // datasets, in the JSON's order.
    const { steps, notebooks: _n, smaltfl: _f, cells: _c, outline: _o, groups, ...rest } = doc;
    const { steps: jsteps, smaltfl: _jf, groups: jgroups, ...jrest } = json;
    expect(rest).toEqual(jrest);
    // The sections the JSON drew by hand are the notebook's headings here, with the same members.
    const sections = (gs: NonNullable<FlowDocument['groups']>) => gs.map((g) => [...g.steps].sort());
    expect(groups!.map((g) => g.name)).toEqual(['Clean', 'Places', 'Enrich', 'Demand', 'Weather']);
    expect(sections(groups!)).toEqual(sections(jgroups!));
    // The outline reads the notebook top to bottom: headings, prose, sources, steps and what is published.
    expect(doc.outline!.map((o) => o.path)).toEqual(['taxis.nb.ts']);
    const kinds = doc.outline![0]!.cells.map((c) => c.kind);
    expect(kinds.slice(0, 6)).toEqual(['params', 'heading', 'source', 'md', 'step', 'md']);
    expect(doc.outline![0]!.cells.filter((c) => c.kind === 'heading').map((c) => c.heading)).toEqual(['Clean', 'Places', 'Enrich', 'Demand', 'Weather']);
    expect(doc.outline![0]!.cells.at(-1)).toMatchObject({ kind: 'publish', publishes: ['zone_hour', 'borough_hour', 'zone_list', 'districts', 'weather_hourly', 'weather_effect'] });
    const facts = (xs: FlowDocument['steps']) => [...xs].sort((a, b) => a.id.localeCompare(b.id)).map((s) => [s.id, s.description, s.dataset]);
    expect(facts(steps)).toEqual(facts(jsteps));
  });

  it('runs to the same rows as the JSON example on the XS fixtures', async () => {
    const outputs = async (doc: FlowDocument) => {
      const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
      try {
        for (const s of EXAMPLE_SOURCES) {
          await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, fixture(s.file)]);
          await db.execAsync(s.ddl);
        }
        const { publish: _p, ...publishing } = doc;
        const r = await runFlow(db, publishing as FlowDocument, { smaltdb: SMALTDB, parameters: { day: '2024-01-15' } });
        const round = (v: unknown) => (typeof v === 'number' ? Number(v.toPrecision(9)) : typeof v === 'bigint' ? String(v) : v);
        const rows = (name: string) => db.query(`SELECT * FROM ${name}`).rows.map((row) => JSON.stringify(row.map(round))).sort();
        return { published: r.published.sort(), checks: r.manifest.nodes.find((n) => n.origin === 'trips_valid')!.expectations, rows: Object.fromEntries(r.published.map((n) => [n, rows(n)])) };
      } finally {
        db.close();
      }
    };
    const nb = await outputs(await loadFlowDir(taxiDir));
    const json = await outputs(exampleDoc());
    expect(nb.published).toEqual(['borough_hour', 'districts', 'weather_effect', 'weather_hourly', 'zone_hour', 'zone_list']);
    expect(nb.checks).toEqual(json.checks);
    for (const name of nb.published) {
      expect(nb.rows[name]!.length, name).toBeGreaterThan(0);
      expect(nb.rows[name], name).toEqual(json.rows[name]);
    }
  }, 120_000);
});
