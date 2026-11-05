import { describe, expect, it } from 'vitest';
import { insertAfter, takeOut, validateDocument, type FlowDocument } from '../src/core/document.js';
import { renameIdentifier } from '../src/core/sqltext.js';
import { nodeKey } from '../src/core/keys.js';
import { shapeOf } from '../src/core/optimize.js';
import { flowHash, PlanError, translate, validatePlan, type FlowPlan } from '../src/core/plan.js';
import { visualFlow } from './fixtures/taxi.js';

const env = { smaltdb: '0.9.0', smaltfl: '0.0.0' };

/** Keys for every node of a plan, with made-up snapshot hashes for the sources. */
async function keysOf(plan: FlowPlan): Promise<string[]> {
  const keys: string[] = [];
  for (const n of plan.nodes) keys.push(await nodeKey(n, n.inputs.map((j) => keys[j]!), env, n.op === 'table' ? `content-of-${n.table}` : undefined));
  return keys;
}

describe('validating a flow document', () => {
  it('accepts the reference flow', () => {
    expect(validateDocument(visualFlow())).toEqual([]);
  });

  it('reports each problem with its path', () => {
    const doc = visualFlow() as unknown as { steps: Record<string, unknown>[] } & FlowDocument;
    doc.steps[1]!.inputs = ['nowhere'];
    doc.steps[2]!.how = 'outer';
    doc.steps.push({ id: 'Trips_Valid', kind: 'filter', inputs: ['trips'], where: 'x' });
    doc.steps.push({ id: 'bad', kind: 'pivot', inputs: ['trips'] });
    doc.steps.push({ id: 'loose', kind: 'filter', inputs: ['trips'], where: "'open" });
    expect(validateDocument(doc)).toEqual([
      { path: '$.steps[6].id', message: 'duplicate id Trips_Valid (ids are compared without case, as SQL names are)' },
      { path: '$.steps[1].inputs[0]', message: 'no source or step nowhere' },
      { path: '$.steps[2].how', message: 'inner or left' },
      { path: '$.steps[7].kind', message: 'one of sql, filter, formula, select, join, aggregate, expectations' },
      { path: '$.steps[8].where', message: 'unterminated string at 0' },
    ]);
  });

  it('finds cycles', () => {
    const doc = visualFlow();
    doc.steps[0]!.inputs = ['borough_hour'];
    expect(validateDocument(doc)).toEqual([{ path: '$.steps', message: 'the steps form a cycle: trips_valid → borough_hour → zone_hour → trips_enriched → trips_zoned → trips_dedup → trips_valid' }]);
  });

  it('checks the display fields: sections, their colours, and places on the canvas', () => {
    const ok = visualFlow();
    ok.groups = [{ id: 'clean', name: 'Clean', steps: ['trips', 'trips_valid'], color: 'amber' }, { id: 'later', name: 'Empty for now', steps: [] }];
    ok.layout = { trips: [0, -40], 'group:later': [600, 20] };
    expect(validateDocument(ok)).toEqual([]);
    const bad = visualFlow() as unknown as Record<string, unknown> & FlowDocument;
    bad.groups = [
      { id: 'a', name: 'A', steps: ['trips'], color: 'plaid' as never },
      { id: 'A', name: 'Again', steps: ['trips'] },
      { id: 'zones', name: 'Named like a source', steps: [] },
    ];
    bad.layout = { trips: [1, Number.NaN], zones: 'here' as never };
    expect(validateDocument(bad)).toEqual([
      { path: '$.layout.trips', message: '[x, y]' },
      { path: '$.layout.zones', message: '[x, y]' },
      { path: '$.groups[0].color', message: 'one of slate, smalt, teal, green, amber, rose, violet' },
      { path: '$.groups[1].id', message: 'A is already the id of a group, source or step' },
      { path: '$.groups[1].steps[0]', message: 'trips is in two groups' },
      { path: '$.groups[2].id', message: 'zones is already the id of a group, source or step' },
    ]);
  });
});

describe('translating into the flow plan', () => {
  it('is deterministic, and fills parameters in as literals', async () => {
    const a = await translate(visualFlow());
    const b = await translate(visualFlow());
    expect(a).toEqual(b);
    const valid = a.nodes.find((n) => n.origin === 'trips_valid')!;
    expect(valid.op === 'expect' && valid.rules[0]).toEqual(['in_month', "substr(tpep_pickup_datetime, 1, 7) = '2024-01'", 'drop']);
    expect(a.parameters).toEqual({ month: '2024-01' });
    expect((await translate(visualFlow(), { month: '2024-02' })).parameters).toEqual({ month: '2024-02' });
  });

  it('puts inputs before the nodes that read them, and lists outputs by name', async () => {
    const plan = await translate(visualFlow());
    expect(plan.nodes.map((n) => [n.op, n.origin, n.inputs])).toEqual([
      ['table', 'trips', []],
      ['table', 'zones', []],
      ['expect', 'trips_valid', [0]],
      ['sql', 'trips_dedup', [2]],
      ['join', 'trips_zoned', [3, 1]],
      ['formula', 'trips_enriched', [4]],
      ['aggregate', 'zone_hour', [5]],
      ['aggregate', 'borough_hour', [6]],
    ]);
    expect(plan.outputs).toEqual([
      { name: 'borough_hour', node: 7 },
      { name: 'zone_hour', node: 6 },
    ]);
    expect(() => validatePlan(plan)).not.toThrow();
  });

  it('refuses missing, unknown and mistyped parameters', async () => {
    const doc = visualFlow();
    delete doc.parameters![0]!.default;
    await expect(translate(doc)).rejects.toThrow('parameter month needs a value (it has no default)');
    await expect(translate(visualFlow(), { year: 2024 })).rejects.toThrow('no parameter named year');
    await expect(translate(visualFlow(), { month: 1 })).rejects.toThrow("parameter month is a text; got 1");
  });

  it('refuses an invalid document, with every issue attached', async () => {
    const doc = visualFlow();
    doc.steps[1]!.inputs = ['nowhere'];
    const err = await translate(doc).catch((e: PlanError) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect((err as PlanError).issues).toHaveLength(1);
  });

  it("doesn't let display fields reach the flow hash", async () => {
    const doc = visualFlow();
    const moved = { ...visualFlow(), layout: { zone_hour: [999, 999] as [number, number] } };
    expect(await flowHash(moved)).toBe(await flowHash(doc));
    expect(await flowHash({ ...doc, name: 'Renamed' })).not.toBe(await flowHash(doc));
  });

  it('checks plans from elsewhere before trusting them', async () => {
    const plan = await translate(visualFlow());
    expect(() => validatePlan({ ...plan, smaltflPlan: 1 })).toThrow('format 1, expected 0');
    const forward = structuredClone(plan);
    forward.nodes[2]!.inputs = [5];
    expect(() => validatePlan(forward)).toThrow('node 2 reads a node that does not come before it');
    expect(() => validatePlan({ ...plan, outputs: [{ name: 'trips', node: 0 }] })).toThrow('output trips is a source');
  });
});

describe('putting a step between a step and what reads it', () => {
  const box = { id: 'trips_valid_filtered', kind: 'expectations' as const, inputs: ['trips_valid'], rules: [{ name: 'short', check: 'trip_distance < 50', onFail: 'drop' as const, description: 'Longer trips are rare.' }] };

  it('rewires what read the step, SQL included, and takes it out again exactly', () => {
    const doc = { ...visualFlow(), groups: [{ id: 'clean', name: 'Clean', steps: ['trips', 'trips_valid', 'trips_dedup'] }] };
    const next = insertAfter(doc, 'trips_valid', box);
    expect(validateDocument(next)).toEqual([]);
    const dedup = next.steps.find((s) => s.id === 'trips_dedup')!;
    expect(dedup.inputs).toEqual(['trips_valid_filtered']);
    expect(dedup.kind === 'sql' && dedup.sql).toBe('SELECT DISTINCT * FROM trips_valid_filtered;');
    expect(next.groups![0]!.steps).toEqual(['trips', 'trips_valid', 'trips_valid_filtered', 'trips_dedup']);
    expect(takeOut(next, 'trips_valid_filtered')).toEqual({ ...doc, layout: doc.layout });
    // A step that changes columns can't be taken out from under what reads it.
    expect(takeOut(doc, 'trips_enriched')).toBeUndefined();
  });

  it('renames a name in SQL, bare or quoted, but not in strings or comments', () => {
    expect(renameIdentifier(`SELECT a FROM Trips_Valid t JOIN "trips_valid" u ON 1 -- trips_valid\nWHERE x = 'trips_valid'`, 'trips_valid', 'tv2')).toBe(`SELECT a FROM tv2 t JOIN "tv2" u ON 1 -- trips_valid\nWHERE x = 'trips_valid'`);
  });

  it('keeps a rule’s reason out of the keys', async () => {
    const keys = async (description?: string) => keysOf(await translate(insertAfter(visualFlow(), 'trips_valid', { ...box, rules: [{ ...box.rules[0]!, description }] })));
    expect(await keys('Longer trips are rare.')).toEqual(await keys(undefined));
  });
});

describe('the run shape', () => {
  it('stores sources, outputs and nodes read twice, and folds the rest, expectations included', async () => {
    const plan = await translate(visualFlow());
    const { needed, stored } = shapeOf(plan);
    expect(needed).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...stored].sort()).toEqual([0, 1, 6, 7]);
  });

  it("leaves out steps nothing needs, but always runs expectations", async () => {
    const doc = visualFlow();
    doc.steps.push({ id: 'unused', kind: 'filter', inputs: ['trips_enriched'], where: 'trips > 1' });
    doc.steps.push({ id: 'checks', kind: 'expectations', inputs: ['borough_hour'], rules: [{ name: 'some', check: 'trips > 0', onFail: 'fail' }] });
    const plan = await translate(doc);
    const { needed, stored } = shapeOf(plan);
    const unused = plan.nodes.findIndex((n) => n.origin === 'unused');
    const checks = plan.nodes.findIndex((n) => n.origin === 'checks');
    expect(needed).not.toContain(unused);
    expect(needed).toContain(checks);
    expect(stored.has(checks)).toBe(false);
  });

  it("doesn't store a step for a check nothing reads: the check computes it in its own statement", async () => {
    const doc = visualFlow();
    doc.steps.push({ id: 'enriched_checks', kind: 'expectations', inputs: ['trips_enriched'], rules: [{ name: 'fast', check: 'speed_mph <= 40', onFail: 'warn' }] });
    const plan = await translate(doc);
    const enriched = plan.nodes.findIndex((n) => n.origin === 'trips_enriched');
    expect(shapeOf(plan).stored.has(enriched)).toBe(false);
    // Read by a second step that is read in turn, it is stored as before.
    doc.steps.push({ id: 'fast_trips', kind: 'filter', inputs: ['trips_enriched'], where: 'speed_mph > 40', dataset: {} });
    const again = await translate(doc);
    expect(shapeOf(again).stored.has(again.nodes.findIndex((n) => n.origin === 'trips_enriched'))).toBe(true);
  });
});

describe('keys', () => {
  it('change downstream of a change, and nowhere else', async () => {
    const before = await keysOf(await translate(visualFlow()));
    const doc = visualFlow();
    const formula = doc.steps.find((s) => s.id === 'trips_enriched')!;
    if (formula.kind === 'formula') formula.columns[2]!.expr = 'trip_distance / (duration_min / 60)';
    const after = await keysOf(await translate(doc));
    expect(after.map((k, i) => k === before[i])).toEqual([true, true, true, true, true, false, false, false]);
  });

  it("don't change when cards move, names change or descriptions change", async () => {
    const before = await keysOf(await translate(visualFlow()));
    const doc = visualFlow();
    doc.layout = { zone_hour: [1, 2] };
    doc.name = 'Another name';
    doc.steps[0]!.description = 'Checked trips';
    const after = await keysOf(await translate(doc));
    expect(after).toEqual(before);
  });

  it('change with a parameter only where it is used', async () => {
    const before = await keysOf(await translate(visualFlow()));
    const after = await keysOf(await translate(visualFlow(), { month: '2024-02' }));
    expect(after.map((k, i) => k === before[i])).toEqual([true, true, false, false, false, false, false, false]);
  });

  it('depend on the engine version and on snapshot content, not on the source table name', async () => {
    const plan = await translate(visualFlow());
    const n = plan.nodes[0]!;
    expect(await nodeKey(n, [], env, 'abc')).toBe(await nodeKey({ ...n, table: 'elsewhere' } as typeof n, [], env, 'abc'));
    expect(await nodeKey(n, [], env, 'abc')).not.toBe(await nodeKey(n, [], env, 'abd'));
    expect(await nodeKey(n, [], env, 'abc')).not.toBe(await nodeKey(n, [], { ...env, smaltdb: '0.9.1' }, 'abc'));
  });
});
