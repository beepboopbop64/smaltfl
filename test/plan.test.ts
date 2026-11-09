import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentFormat, fillStepOf, insertAfter, sourceOf, takeOut, validateDocument, type FillStep, type FlowDocument, type PublishDef, type WatchDef } from '../src/core/document.js';
import { renameIdentifier } from '../src/core/sqltext.js';
import { nodeKey } from '../src/core/keys.js';
import { shapeOf } from '../src/core/optimize.js';
import { flowHash, planPeriod, PlanError, translate, validatePlan, watchesOf, type Column, type FlowPlan, type PlanPublish2 } from '../src/core/plan.js';
import { missingSql, nodeSelect, shiftSql } from '../src/core/emit.js';
import { planHash, planKind } from '../src/core/manifest.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { visualFlow } from './fixtures/taxi.js';
import { exampleDoc, exampleFilled, exampleLegacy, exampleUnfilled } from './helpers/example.js';

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
      { path: '$.steps[7].kind', message: 'one of sql, filter, formula, select, join, aggregate, expectations, fill' },
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
    expect(() => validatePlan({ ...plan, smaltflPlan: 3 } as unknown as FlowPlan)).toThrow('format 3, expected 0 or 1 or 2');
    expect(() => validatePlan({ ...plan, smaltflPlan: 2 } as unknown as FlowPlan)).toThrow('a format-2 plan says what holds it');
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

// ------------------------------------------------------------------ what holds publication (ADR 0009)

/**
 * The example as ADR 0009 found it: format 1, no `day` parameter, no publish block, and none of ADR 0010's display marks
 * (its nouns, a part's name and role), whatever it gains later.
 */
function exampleBefore(): FlowDocument {
  const doc = exampleUnfilled();
  const { publish: _publish, ...rest } = doc;
  const { nouns: _nouns, ...ontology } = doc.ontology!;
  const properties = ontology.properties?.map(({ name: _name, role: _role, ...p }) => p);
  return { ...rest, smaltfl: 1, parameters: (doc.parameters ?? []).filter((p) => p.name !== 'day'), ontology: { ...ontology, properties } };
}
const PUBLISH: PublishDef = { hold: ['checks', 'wrong'], watch: { trips: 'history.json' }, period: 'day', together: true };
const DAY = { name: 'day', type: 'text' as const, default: null, description: 'The day the trips are from' };
/** The example with a day parameter and the publish block of ADR 0009 §2. */
const exampleHolding = (publish: PublishDef = PUBLISH): FlowDocument => {
  const doc = exampleBefore();
  return { ...doc, smaltfl: 2, parameters: [...(doc.parameters ?? []), DAY], publish };
};
/** The reference flow with a day parameter and a publish block. */
const holding = (publish: unknown): FlowDocument => {
  const doc = visualFlow();
  return { ...doc, smaltfl: 2, parameters: [...(doc.parameters ?? []), DAY], publish: publish as PublishDef };
};

describe('a document that says what holds its publication (ADR 0009 §2)', () => {
  it('is format 2, and format 2 is only for it', () => {
    expect(validateDocument(holding(PUBLISH))).toEqual([]);
    expect(documentFormat(holding(PUBLISH))).toBe(2);
    expect(documentFormat(visualFlow())).toBe(1);
    expect(validateDocument({ ...holding(PUBLISH), smaltfl: 1 })).toEqual([{ path: '$.smaltfl', message: 'expected 2: a document with a publish block is format 2' }]);
    expect(validateDocument({ ...visualFlow(), smaltfl: 2 })).toEqual([{ path: '$.smaltfl', message: 'expected 1: format 2 is for a document with a publish block' }]);
    expect(validateDocument({ ...visualFlow(), smaltfl: 4 as never })).toEqual([{ path: '$.smaltfl', message: 'expected 1, 2, 3, the formats this version reads' }]);
  });

  it('says each problem with its block', () => {
    const issues = (publish: unknown) => validateDocument(holding(publish));
    expect(issues('all')).toEqual([{ path: '$.publish', message: '{ hold, watch, period, together, donor, meanwhile, until }' }]);
    expect(issues({ hold: [] })).toEqual([{ path: '$.publish.hold', message: 'a list of what holds: checks, short, unlearned, wrong' }]);
    expect(issues({ hold: ['checks', 'late', 'checks'] })).toEqual([
      { path: '$.publish.hold[1]', message: 'one of checks, short, unlearned, wrong' },
      { path: '$.publish.hold[2]', message: 'checks is listed twice' },
    ]);
    expect(issues({ ...PUBLISH, hold: ['short', 'wrong'] })).toEqual([{ path: '$.publish.hold', message: 'short or wrong, not both: wrong holds every day short does' }]);
    expect(issues({ hold: ['short'] })).toEqual([{ path: '$.publish.watch', message: 'short judges a source against its history: watch names it' }]);
    expect(issues({ hold: ['wrong'], watch: {} })).toEqual([{ path: '$.publish.watch', message: 'wrong judges a source against its history: watch names it' }]);
    expect(issues({ hold: ['checks'], watch: { trips: 'history.json' }, period: 'day' })).toEqual([{ path: '$.publish.watch', message: 'a watch is judged only for short or wrong, and hold has neither' }]);
    expect(issues({ ...PUBLISH, watch: { trips_valid: 'history.json', trips: '' } })).toEqual([
      { path: '$.publish.watch.trips_valid', message: 'no source trips_valid: a watch judges a source' },
      { path: '$.publish.watch.trips', message: "the history's file, a file in the data's list" },
    ]);
    expect(issues({ ...PUBLISH, period: undefined })).toEqual([{ path: '$.publish.period', message: 'a watch needs a period: the parameter whose value is the day a claim names' }]);
    expect(issues({ ...PUBLISH, period: 'week' })).toEqual([{ path: '$.publish.period', message: 'no parameter week' }]);
    const counted = holding({ ...PUBLISH, period: 'n' });
    counted.parameters!.push({ name: 'n', type: 'integer', default: 1 });
    expect(validateDocument(counted)).toEqual([{ path: '$.publish.period', message: 'n is an integer: the period is a text parameter, such as a day' }]);
    expect(issues({ ...PUBLISH, watch: { trips: 'history.json', TRIPS: 'other.json' } })).toEqual([{ path: '$.publish.watch.TRIPS', message: 'trips is watched twice (ids are compared without case)' }]);
    expect(issues({ ...PUBLISH, together: 'yes' })).toEqual([{ path: '$.publish.together', message: 'true or false' }]);
    // A setting this version doesn't know is refused, never ignored: this version wouldn't keep it.
    expect(issues({ ...PUBLISH, calendar: 'us' })).toEqual([{ path: '$.publish.calendar', message: 'not a field this version reads (hold, watch, period, together, donor, meanwhile, until): refused rather than ignored' }]);
    // checks alone needs neither a watch nor a period: a fail rule over a count is a fixed threshold.
    expect(issues({ hold: ['checks'] })).toEqual([]);
  });

  it('reaches the flow hash, which display fields still do not', async () => {
    const a = holding(PUBLISH);
    expect(await flowHash(a)).not.toBe(await flowHash({ ...a, publish: { ...PUBLISH, together: false } }));
    expect(await flowHash({ ...a, layout: { zone_hour: [5, 5] } })).toBe(await flowHash(a));
  });
});

/** The reference flow in the general form (format 3): a publish block whose watch is an object, and what else is given. */
const general = (watch: Partial<WatchDef> | string = {}, extra: Partial<FlowDocument> = {}): FlowDocument => {
  const doc = holding({ hold: ['checks', 'wrong'], period: 'day', watch: { trips: typeof watch === 'string' ? watch : { history: 'history.json', ...watch } } });
  return { ...doc, smaltfl: 3, ...extra };
};
/** A property that marks a column's bad codes, as a sign-in flow's result would. */
const BAD_RESULT = { column: 'payment_type', title: 'Payment type', description: 'How the trip was paid: one of these codes.', values: { '1': 'Credit card', '2': 'Cash', '4': 'Dispute' }, bad: ['4'] };
const withOntology = (doc: FlowDocument, properties: unknown[], nouns?: unknown): FlowDocument => ({ ...doc, ontology: { objectTypes: [], linkTypes: [], actionTypes: [], properties: properties as never, ...(nouns ? { nouns: nouns as never } : {}) } });

describe('a document that says how its days are judged (format 3, ADR 0010 §10)', () => {
  it('is format 3 with a calendar, a watch given as an object, or a mark that changes verdicts; and only then', () => {
    expect(documentFormat(general())).toBe(3);
    expect(validateDocument(general())).toEqual([]);
    expect(documentFormat({ ...holding(PUBLISH), calendar: { base: 'none' } })).toBe(3);
    expect(documentFormat({ ...visualFlow(), calendar: { base: 'us' } })).toBe(3);
    expect(documentFormat(withOntology(visualFlow(), [BAD_RESULT]))).toBe(3);
    expect(documentFormat(withOntology(visualFlow(), [{ column: 'country', title: 'Country', description: 'Where from', newValues: 'alert' }]))).toBe(3);
    expect(documentFormat(withOntology(visualFlow(), [{ column: 'tpep_dropoff_datetime', title: 'Drop-off', description: 'When', after: { of: 'tpep_pickup_datetime', minutes: 15 } }]))).toBe(3);
    // Nouns, a part's name and a sender's role are display: they change no verdict, so the format stays.
    const display = withOntology(holding(PUBLISH), [{ column: 'VendorID', title: 'Vendor', description: 'Who sent it', values: { '1': 'Creative Mobile' }, name: 'Vendor {code}', role: 'sender' }], { trips: { one: 'trip', many: 'trips' } });
    expect(documentFormat(display)).toBe(2);
    expect(validateDocument(display)).toEqual([]);
    // A legacy watch stays legal in format 3, meaning the settings every flow had before.
    expect(validateDocument({ ...general('history.json'), calendar: { base: 'us-nyc' } })).toEqual([]);
    const three = 'a calendar, a watch given as an object, or a mark that changes verdicts (bad, newValues, after)';
    expect(validateDocument({ ...general(), smaltfl: 2 })).toEqual([{ path: '$.smaltfl', message: `expected 3: a document with ${three} is format 3` }]);
    expect(validateDocument({ ...holding(PUBLISH), smaltfl: 3 })).toEqual([{ path: '$.smaltfl', message: `expected 2: format 3 is for a document with ${three}` }]);
    expect(validateDocument({ ...visualFlow(), smaltfl: 3 })).toEqual([{ path: '$.smaltfl', message: `expected 1: format 3 is for a document with ${three}` }]);
  });

  it('refuses a watch setting it can’t judge yet, and any field it doesn’t know', () => {
    const issues = (w: Record<string, unknown>) => validateDocument(general(w as Partial<WatchDef>));
    // A slot of a day is judged from phase 4 (ADR 0010 §7), counted by the time column it names; any other length is refused.
    expect(issues({ every: '6h' })).toEqual([{ path: '$.publish.watch.trips.time', message: 'a load of 6h is counted by its time column, which falls in its slot: name it' }]);
    expect(issues({ every: '6h', time: 'tpep_pickup_datetime' })).toEqual([]);
    expect(issues({ every: 'week' })).toEqual([{ path: '$.publish.watch.trips.every', message: 'one of day, 12h, 8h, 6h, 4h, 3h, 2h, 1h' }]);
    // The patterns none and monthly are judged from phase 3 (ADR 0010 §3); any other is refused.
    expect(issues({ pattern: 'none' })).toEqual([]);
    expect(issues({ pattern: 'monthly' })).toEqual([]);
    expect(issues({ pattern: 'daily' })).toEqual([{ path: '$.publish.watch.trips.pattern', message: 'weekly, none or monthly' }]);
    expect(issues({ breaks: [] })).toEqual([{ path: '$.publish.watch.trips.breaks', message: 'not a field this version reads (history, period, every, pattern, donor, time, zone, calendar, scale, holds, relearn, count, follow): refused rather than ignored' }]);
    expect(issues({ history: '' })).toEqual([{ path: '$.publish.watch.trips.history', message: "the history's file, a file in the data's list" }]);
    expect(issues({ donor: 'previous', zone: 'Nowhere/Else', calendar: 'yes', scale: 'log', holds: 1, count: ['a', 'a'], follow: 'user' })).toEqual([
      { path: '$.publish.watch.trips.donor', message: 'weekday or nearest' },
      { path: '$.publish.watch.trips.zone', message: 'a time zone, such as UTC or America/New_York' },
      { path: '$.publish.watch.trips.calendar', message: 'true or false' },
      { path: '$.publish.watch.trips.holds', message: 'true or false' },
      { path: '$.publish.watch.trips.scale', message: 'fixed or volume' },
      { path: '$.publish.watch.trips.count', message: 'a list of columns, each once' },
      { path: '$.publish.watch.trips.follow', message: 'a list of columns, each once' },
    ]);
    expect(issues({ every: 'day', pattern: 'weekly', donor: 'nearest', time: 'tpep_pickup_datetime', zone: 'America/New_York', calendar: false, scale: 'fixed', holds: true, count: ['VendorID'], follow: ['PULocationID'] })).toEqual([]);
    expect(issues({ period: 'month' })).toEqual([]);
    expect(issues({ period: 'week' })).toEqual([{ path: '$.publish.watch.trips.period', message: 'no parameter week' }]);
  });

  it('lets each watch name its period, and a watch that never holds be told without a judging hold kind', () => {
    const own = general({ period: 'day' });
    const { period: _p, ...pub } = own.publish!;
    expect(validateDocument({ ...own, publish: pub })).toEqual([]);
    expect(validateDocument({ ...general(), publish: { ...general().publish!, period: undefined } })).toEqual([{ path: '$.publish.period', message: 'a watch needs a period: the parameter whose value is the day a claim names' }]);
    const told = general({ holds: false });
    expect(validateDocument({ ...told, publish: { ...told.publish!, hold: ['checks'] } })).toEqual([]);
    expect(validateDocument(told)).toEqual([{ path: '$.publish.watch', message: 'wrong judges a source against its history: watch names it, and every watch says holds: false' }]);
  });

  it('may hold a day not judged yet, beside short or wrong (ADR 0010 §1)', () => {
    expect(validateDocument(holding({ ...PUBLISH, hold: ['checks', 'wrong', 'unlearned'] }))).toEqual([]);
    expect(validateDocument(holding({ hold: ['checks', 'unlearned'], watch: { trips: 'history.json' }, period: 'day' }))).toEqual([
      { path: '$.publish.hold', message: 'unlearned holds beside short or wrong: a day not judged is only a reason to hold for a flow that holds on its story' },
      { path: '$.publish.watch', message: 'a watch is judged only for short or wrong, and hold has neither' },
    ]);
  });

  it('checks its calendar: its base, and its own days written as ADR 0010 §2 has them', () => {
    expect(validateDocument(general({}, { calendar: { base: 'us', zone: 'Europe/London' } }))).toEqual([]);
    expect(validateDocument(general({}, { calendar: { base: 'us', days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }] } }))).toEqual([]);
    expect(validateDocument(general({}, { calendar: { base: 'uk' as never, days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 16] }] } }))).toEqual([
      { path: '$.calendar.base', message: 'one of none, us, us-nyc' },
      { path: '$.calendar.days[0].between', message: 'two days of the month, at most six apart, so one weekday falls between them: [8, 14]' },
    ]);
  });

  it('checks the ontology’s new marks and nouns', () => {
    const doc = (props: unknown[], nouns?: unknown) => validateDocument({ ...withOntology(general(), props, nouns), smaltfl: 3 });
    expect(doc([BAD_RESULT], { trips: { one: 'trip', many: 'trips' }, trips_valid: { one: 'valid trip', many: 'valid trips' } })).toEqual([]);
    expect(doc([{ ...BAD_RESULT, bad: ['4', '9'] }])).toEqual([{ path: '$.ontology.properties[0].bad[1]', message: "9 is not one of the column's values (1, 2, 4)" }]);
    expect(doc([{ ...BAD_RESULT, bad: [] }])).toEqual([{ path: '$.ontology.properties[0].bad', message: 'a list of codes, each once' }]);
    expect(doc([{ column: 'c', title: 'C', description: 'D', newValues: 'warn', name: 'Vendor', role: 'source', after: { of: 'x' } }])).toEqual([
      { path: '$.ontology.properties[0].newValues', message: 'alert: a value never seen before is something wrong' },
      { path: '$.ontology.properties[0].name', message: 'how a part is named, with {code} for its code: "Vendor {code}"' },
      { path: '$.ontology.properties[0].role', message: 'sender: the column names who sent the rows' },
      { path: '$.ontology.properties[0].after', message: '{ of: a time column, minutes }' },
    ]);
    expect(doc([BAD_RESULT], { nowhere: { one: 'x', many: 'xs' }, trips: { one: 'trip', many: 'the many trips' } })).toEqual([
      { path: '$.ontology.nouns.nowhere', message: 'no source or step nowhere' },
      { path: '$.ontology.nouns.trips', message: '{ one, many }: one or two words each, "sign-in" and "sign-ins"' },
    ]);
  });
});

describe('the plan of a flow that holds (plan/1, ADR 0009 E10)', () => {
  it('carries the block with hold sorted, each watched source by its node, and the defaults filled in', async () => {
    const plan = await translate(holding({ hold: ['wrong', 'checks'], watch: { Trips: 'history.json' }, period: 'day' }), { day: '2024-01-15' });
    expect(plan.smaltflPlan).toBe(1);
    expect(plan.publish).toEqual({ hold: ['checks', 'wrong'], watch: [[plan.nodes.findIndex((n) => n.origin === 'trips'), 'history.json']], period: 'day', together: true });
    expect(plan.parameters).toEqual({ month: '2024-01', day: '2024-01-15' });
    const checks = await translate(holding({ hold: ['checks'], together: false }));
    expect(checks.publish).toEqual({ hold: ['checks'], watch: [], period: null, together: false });
    // Without the block the plan has no publish at all, not an empty one.
    expect('publish' in (await translate(visualFlow()))).toBe(false);
  });

  it('keeps every plan/0 hash: the example without the block hashes as it did before plan/1 (vector)', async () => {
    const plan = await translate(exampleBefore());
    expect(plan.smaltflPlan).toBe(0);
    expect(planKind(plan)).toBe('plan/0');
    expect(await planHash(plan)).toBe('292c423f3a56ab26bd853af571c23cf2c1d5e775c882da06cf9725e0b91d1947');
    expect(await planHash(await translate(visualFlow()))).toBe('f924f6c4f19c11b885da1b0a5d9bb22cea5139782920b3187a6618872c2d9346');
  });

  it('hashes as plan/1 (vectors)', async () => {
    // The ADR's own document, small enough to check with sha256sum.
    const v: FlowDocument = {
      smaltfl: 2, id: 'v', name: 'V', parameters: [{ name: 'day', type: 'text', default: null }], sources: [{ id: 'trips', table: 'trips_file' }],
      steps: [{ id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], maxDropped: 0.1, dataset: {} }],
      publish: { hold: ['wrong', 'checks'], watch: { trips: 'history.json' }, period: 'day' },
    };
    const plan = await translate(v, { day: '2023-09-21' });
    expect(plan.flow.hash).toBe('5dfc2a9cf8a41ad60ea41a2a379960e38beac21c59d022b848f1e5d59b9c2d00');
    expect(canonicalJSON(plan)).toBe('{"flow":{"hash":"5dfc2a9cf8a41ad60ea41a2a379960e38beac21c59d022b848f1e5d59b9c2d00","id":"v"},"nodes":[{"inputs":[],"op":"table","origin":"trips","table":"trips_file"},{"inputs":[0],"maxDropped":0.1,"op":"expect","origin":"trips_valid","rules":[["fare","fare_amount >= 0","drop"]]}],"outputs":[{"name":"trips_valid","node":1}],"parameters":{"day":"2023-09-21"},"publish":{"hold":["checks","wrong"],"period":"day","together":true,"watch":[[0,"history.json"]]},"smaltflPlan":1}');
    expect(planKind(plan)).toBe('plan/1');
    expect(await planHash(plan)).toBe('fc700fdf9d4dd95e71ee083cfee0ddca2ba46dd122b7a840e182234611668fd4');
    const { publish: _p, ...without } = v;
    expect(await planHash(await translate({ ...without, smaltfl: 1 }, { day: '2023-09-21' }))).toBe('32609b0f1de25bc72ea09219c0c38cd2cff347619e2db5c8506a7da144720f8e');
    // The example with the block of ADR 0009 §2, and its ontology's nouns and the vendor's name and role (ADR 0010 §8,
    // display: they move the flow hash and the plan hash, and no node key).
    const withMarks = (doc: FlowDocument): FlowDocument => ({ ...doc, ontology: exampleUnfilled().ontology });
    expect(await planHash(await translate(exampleHolding(), { month: '2023-09', day: '2023-09-21' }))).toBe('ccbc4d7bee92ae2e153ab8a345e6a3d807e201193ab9dade82a48362dc3cd8c8');
    expect(await planHash(await translate(withMarks(exampleHolding()), { month: '2023-09', day: '2023-09-21' }))).toBe('7d7236ead520908b210b879a16815f4d3a727b6320f620d2821d3f87195fd252');
  });

  it('changes no node: every key is the same with and without the block', async () => {
    const values = { month: '2023-09', day: '2023-09-21' };
    const doc = exampleHolding();
    const { publish: _p, ...without } = doc;
    const a = await translate(doc, values);
    const b = await translate({ ...without, smaltfl: 1 }, values);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.outputs).toEqual(b.outputs);
    expect(await keysOf(a)).toEqual(await keysOf(b));
    expect(await keysOf(await translate(exampleHolding({ hold: ['checks'] }), values))).toEqual(await keysOf(b));
  });

  it('is checked before it is trusted: format 0 never holds, format 1 always says what holds it', async () => {
    const plan = await translate(holding(PUBLISH), { day: '2024-01-15' });
    expect(() => validatePlan(plan)).not.toThrow();
    const without = await translate(visualFlow());
    expect(() => validatePlan({ ...without, publish: plan.publish })).toThrow('a format-0 plan has no publish block');
    expect(() => validatePlan({ ...without, smaltflPlan: 1 })).toThrow('a format-1 plan says what holds it');
    const bad = (publish: unknown) => () => validatePlan({ ...plan, publish } as FlowPlan);
    expect(bad({ ...plan.publish, hold: ['wrong', 'checks'] })).toThrow('publish.hold is sorted');
    expect(bad({ ...plan.publish, hold: ['short', 'wrong'] })).toThrow('one or the other');
    expect(bad({ ...plan.publish, hold: ['later'] })).toThrow('publish.hold is a list of checks, short, unlearned, wrong');
    const step = plan.nodes.findIndex((n) => n.op !== 'table');
    expect(bad({ ...plan.publish, watch: [[step, 'history.json']] })).toThrow(`publish.watch[0] watches node ${step}, which isn't a source`);
    expect(bad({ ...plan.publish, watch: [[0, 'history.json'], [0, 'again.json']] })).toThrow('publish.watch is sorted by node');
    expect(bad({ ...plan.publish, watch: [] })).toThrow('publish.watch names none');
    expect(bad({ ...plan.publish, hold: ['checks'] })).toThrow('publish.hold judges none');
    expect(bad({ ...plan.publish, period: 'week' })).toThrow("publish.period week is not one of the plan's parameters");
    expect(bad({ ...plan.publish, period: null })).toThrow('publish.watch needs a period');
    expect(bad({ ...plan.publish, together: 1 })).toThrow('publish.together is true or false');
    expect(bad({ ...plan.publish, calendar: 'us' })).toThrow("publish has calendar, which this version doesn't read");
  });
});

// ------------------------------------------------------------------ filling a paused day (ADR 0009 amendment 1)

/** The ADR's test vector document (E10), small enough to check with sha256sum. */
const vectorDoc = (): FlowDocument => ({
  smaltfl: 2, id: 'v', name: 'V', parameters: [{ name: 'day', type: 'text', default: null }], sources: [{ id: 'trips', table: 'trips_file' }],
  steps: [{ id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], maxDropped: 0.1, dataset: {} }],
  publish: { hold: ['wrong', 'checks'], watch: { trips: 'history.json' }, period: 'day' },
});
const FILL = { id: 'trips_filled', kind: 'fill' as const, inputs: ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'] };
/** The vector document with a fill step on its watched source: what read the source reads the fill step. */
const withFill = (doc: FlowDocument = vectorDoc()): FlowDocument => insertAfter(doc, 'trips', structuredClone(FILL));
/** The same with a day filled: the derived document a fill decision makes (fill.ts repairDocument). */
const derived = (missing: FillStep['missing'], from: string | null): FlowDocument => {
  const doc = withFill();
  return {
    ...doc,
    sources: from === null ? doc.sources : [...doc.sources, { id: 'trips_donor', table: 'trips_file_donor' }],
    steps: doc.steps.map((s) => (s.id === 'trips_filled' ? { ...s, missing, from, inputs: from === null ? ['trips'] : ['trips', 'trips_donor'] } as FillStep : s)),
  };
};

describe('a fill step (ADR 0009 amendment 1 S1)', () => {
  it('reads its source, and what read the source reads it: insertAfter puts a box after it, not between', () => {
    const doc = withFill();
    expect(validateDocument(doc)).toEqual([]);
    // A step after a source goes first: before every step, since a source comes before them all.
    expect(doc.steps.map((s) => [s.id, s.inputs])).toEqual([['trips_filled', ['trips']], ['trips_valid', ['trips_filled']]]);
    expect(fillStepOf(doc, 'TRIPS')?.id).toBe('trips_filled');
    expect(fillStepOf(doc, 'trips_valid')).toBeUndefined();
    expect(sourceOf(doc, 'trips_filled')).toBe('trips');
    const box = { id: 'trips_checked', kind: 'expectations' as const, inputs: ['trips'], rules: [{ name: 'some', check: 'fare_amount < 1000', onFail: 'drop' as const }] };
    const boxed = insertAfter(doc, 'trips', box);
    expect(validateDocument(boxed)).toEqual([]);
    expect(boxed.steps.map((s) => [s.id, s.inputs])).toEqual([['trips_filled', ['trips']], ['trips_checked', ['trips_filled']], ['trips_valid', ['trips_checked']]]);
  });

  it('says each problem with its path', () => {
    const issues = (change: (doc: FlowDocument) => void) => {
      const doc = withFill();
      change(doc);
      return validateDocument(doc);
    };
    const fill = (doc: FlowDocument) => doc.steps.find((s) => s.id === 'trips_filled') as unknown as Record<string, unknown>;
    expect(issues((d) => (fill(d).time = 'pickup time'))).toEqual([{ path: '$.steps[0].time', message: 'the column an hours cause is of: a letter or _, then letters, digits or _' }]);
    expect(issues((d) => (fill(d).shift = ['a', 'A', 3]))).toEqual([
      { path: '$.steps[0].shift[1]', message: 'A is listed twice' },
      { path: '$.steps[0].shift[2]', message: 'a column: a letter or _, then letters, digits or _' },
    ]);
    expect(issues((d) => (fill(d).inputs = ['trips_valid']))).toEqual([
      { path: '$.steps', message: 'the steps form a cycle: trips_filled → trips_valid → trips_filled' },
      { path: '$.steps[0].inputs[0]', message: 'trips_valid is a step: a fill step reads a source directly' },
    ]);
    expect(issues((d) => d.steps.push({ id: 'again', kind: 'fill', inputs: ['trips'], time: 't', shift: [] }))).toEqual([
      { path: '$.steps[2].inputs[0]', message: 'trips has a fill step already: one fill step a source' },
      { path: '$.steps[2].inputs[0]', message: 'trips has a fill step, trips_filled: read that instead' },
    ]);
    expect(issues((d) => (d.steps[1]!.inputs = ['trips']))).toEqual([{ path: '$.steps[1].inputs[0]', message: 'trips has a fill step, trips_filled: read that instead' }]);
    expect(issues((d) => d.steps.push({ id: 'twice', kind: 'fill', inputs: ['trips_valid'], time: 't', shift: [] }))).toEqual([{ path: '$.steps[2].inputs[0]', message: 'trips_valid is a step: a fill step reads a source directly' }]);
    // The missing part and the donor's day, set together, with a donor input exactly when there is a day.
    expect(issues((d) => Object.assign(fill(d), { missing: { column: 'VendorID', value: 1 } }))).toEqual([{ path: '$.steps[0].from', message: 'a missing part needs from: the donor’s day, or null for the part that arrived alone' }]);
    expect(issues((d) => Object.assign(fill(d), { from: null }))).toEqual([{ path: '$.steps[0].missing', message: 'from needs the missing part it fills' }]);
    expect(issues((d) => Object.assign(fill(d), { missing: { column: 'VendorID', value: 1 }, from: '2022-11-07' }))).toEqual([{ path: '$.steps[0].inputs', message: 'a fill step that fills from another day reads its source and the donor' }]);
    expect(issues((d) => Object.assign(fill(d), { missing: { column: 'VendorID', value: 1 }, from: 'last week' }))).toEqual([
      { path: '$.steps[0].inputs', message: 'a fill step that fills from another day reads its source and the donor' },
      { path: '$.steps[0].from', message: 'the donor’s day, YYYY-MM-DD (or its slot, YYYY-MM-DDTHH, ADR 0010 §7), or null for the part that arrived alone' },
    ]);
    const missing = (m: unknown) => issues((d) => Object.assign(fill(d), { missing: m, from: null }));
    expect(missing({ time: 'tpep_pickup_datetime', hours: [13, 23] })).toEqual([]);
    expect(missing({ time: 'tpep_dropoff_datetime', hours: [13, 23] })).toEqual([{ path: '$.steps[0].missing', message: "the hours are of the step's time column, tpep_pickup_datetime" }]);
    expect(missing({ time: 'tpep_pickup_datetime', hours: [13, 24] })).toEqual([{ path: '$.steps[0].missing', message: 'hours are [from, to], whole hours with 0 ≤ from ≤ to ≤ 23' }]);
    expect(missing({ time: 'tpep_pickup_datetime', hours: [14, 13] })).toEqual([{ path: '$.steps[0].missing', message: 'hours are [from, to], whole hours with 0 ≤ from ≤ to ≤ 23' }]);
    expect(missing({ column: 'payment_type', value: 0, rest: true })).toEqual([]);
    expect(missing({ column: 'store_and_fwd_flag', value: null })).toEqual([]);
    expect(missing({ column: 'VendorID' })).toEqual([{ path: '$.steps[0].missing', message: 'a part names its value: text, a number, true, false or null' }]);
    expect(missing({ column: 'VendorID', value: 1, rest: 'yes' })).toEqual([{ path: '$.steps[0].missing', message: 'rest is true or false' }]);
    expect(missing({ column: 'VendorID', value: 1, also: 2 })).toEqual([{ path: '$.steps[0].missing', message: 'a part is { column, value, rest }, nothing else' }]);
    expect(missing('Vendor 1')).toEqual([{ path: '$.steps[0].missing', message: '{ time, hours: [from, to] } or { column, value, rest }' }]);
  });

  it('takes a donor that nothing else reads or watches, and fills from a day only with a period', () => {
    expect(validateDocument(derived({ column: 'VendorID', value: 1 }, '2022-11-07'))).toEqual([]);
    const read = derived({ column: 'VendorID', value: 1 }, '2022-11-07');
    read.steps.push({ id: 'peek', kind: 'filter', inputs: ['trips_donor'], where: 'true' });
    expect(validateDocument(read)).toEqual([{ path: '$.steps[2].inputs[0]', message: 'trips_donor is a donor of trips_filled: nothing else reads it' }]);
    const watched = derived({ column: 'VendorID', value: 1 }, '2022-11-07');
    watched.publish!.watch!.trips_donor = 'history.json';
    expect(validateDocument(watched)).toEqual([{ path: '$.publish.watch.trips_donor', message: 'trips_donor is a donor: a donor is judged by its own day\'s claim, not watched' }]);
    const itself = derived({ column: 'VendorID', value: 1 }, '2022-11-07');
    (itself.steps[0]!.inputs as string[])[1] = 'trips';
    expect(validateDocument(itself)).toEqual([
      { path: '$.steps[0].inputs', message: 'an input is listed twice' },
      { path: '$.steps[0].inputs[1]', message: 'a day is never its own donor' },
    ]);
    const noPeriod = derived({ column: 'VendorID', value: 1 }, '2022-11-07');
    noPeriod.publish = { hold: ['checks'] };
    expect(validateDocument(noPeriod)).toEqual([{ path: '$.steps[0].from', message: "a fill from another day needs trips's period (its watch's, or publish.period): the parameter whose value is the day its rows move to" }]);
  });

  it('checks the three settings: the donor rule, what readers get meanwhile, and what closes a pause', () => {
    const issues = (publish: Partial<PublishDef>) => validateDocument({ ...withFill(), publish: { ...vectorDoc().publish!, ...publish } });
    expect(issues({ donor: 'weekday', meanwhile: 'fill', until: 'normal' })).toEqual([]);
    expect(issues({ donor: 'nearest', meanwhile: 'complete', until: 'decision' })).toEqual([]);
    expect(issues({ donor: 'monday' as never, meanwhile: 'stale' as never, until: 'never' as never })).toEqual([
      { path: '$.publish.donor', message: 'one of weekday, nearest' },
      { path: '$.publish.meanwhile', message: 'one of last, fill, complete' },
      { path: '$.publish.until', message: 'one of decision, normal' },
    ]);
    // meanwhile fills a watched source: each needs its fill step, and the story that names what is missing.
    expect(validateDocument({ ...vectorDoc(), publish: { ...vectorDoc().publish!, meanwhile: 'fill' } })).toEqual([{ path: '$.publish.meanwhile', message: 'fill needs a fill step on every watched source, and trips has none' }]);
    expect(validateDocument({ ...vectorDoc(), publish: { ...vectorDoc().publish!, meanwhile: 'last' } })).toEqual([]);
    expect(validateDocument({ ...withFill(), publish: { hold: ['checks'], meanwhile: 'complete' } })).toEqual([{ path: '$.publish.meanwhile', message: "complete fills a watched source's missing part, which its story names: hold has neither short nor wrong" }]);
  });
});

describe('the fill node (ADR 0009 amendment 1 S1, S4)', () => {
  it('translates the step, the day it fills to taken from the period', async () => {
    const plan = await translate(derived({ column: 'VendorID', value: 1 }, '2022-11-07'), { day: '2022-11-14' });
    expect(plan.nodes.map((n) => [n.op, n.origin, n.inputs])).toEqual([['table', 'trips', []], ['table', 'trips_donor', []], ['fill', 'trips_filled', [0, 1]], ['expect', 'trips_valid', [2]]]);
    expect(plan.nodes[2]).toEqual({ op: 'fill', origin: 'trips_filled', inputs: [0, 1], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'], missing: { column: 'VendorID', value: 1 }, from: '2022-11-07', to: '2022-11-14' });
    expect(() => validatePlan(plan)).not.toThrow();
    const base = await translate(withFill(), { day: '2022-11-14' });
    expect(base.nodes[1]).toEqual({ op: 'fill', origin: 'trips_filled', inputs: [0], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'], missing: null, from: null, to: null });
    await expect(translate(derived({ column: 'VendorID', value: 1 }, '2022-11-07'))).rejects.toThrow("steps.trips_filled: a fill from 2022-11-07 moves its rows to the run's day, and day is not given");
    await expect(translate(derived({ column: 'VendorID', value: 1 }, '2022-11-07'), { day: 'Monday' })).rejects.toThrow("and day is 'Monday', not a day");
  });

  it('carries the settings in publish only when the document sets them, so plan/1 hashes hold', async () => {
    const plain = await translate(withFill(), { day: '2023-09-21' });
    expect(plain.publish).toEqual({ hold: ['checks', 'wrong'], watch: [[0, 'history.json']], period: 'day', together: true });
    const set = await translate({ ...withFill(), publish: { ...vectorDoc().publish!, donor: 'nearest', meanwhile: 'fill', until: 'normal' } }, { day: '2023-09-21' });
    expect(set.publish).toEqual({ hold: ['checks', 'wrong'], watch: [[0, 'history.json']], period: 'day', together: true, donor: 'nearest', meanwhile: 'fill', until: 'normal' });
    expect(() => validatePlan(set)).not.toThrow();
    expect(await planHash(set)).not.toBe(await planHash(plain));
    const bad = (publish: unknown) => () => validatePlan({ ...set, publish } as FlowPlan);
    expect(bad({ ...set.publish, donor: 'monday' })).toThrow('publish.donor is weekday or nearest');
    expect(bad({ ...set.publish, meanwhile: 'stale' })).toThrow('publish.meanwhile is last, fill, complete');
    expect(bad({ ...set.publish, until: 'never' })).toThrow('publish.until is decision or normal');
  });

  it('is checked before it is trusted: its arity, its days, its missing part, and that it reads sources', async () => {
    const plan = await translate(derived({ column: 'VendorID', value: 1 }, '2022-11-07'), { day: '2022-11-14' });
    const node = (change: Record<string, unknown>) => () => {
      const p = structuredClone(plan);
      Object.assign(p.nodes[2]!, change);
      validatePlan(p);
    };
    expect(node({ from: null })).toThrow('node 2 (fill) has 2 inputs');
    expect(node({ inputs: [0] })).toThrow('node 2 (fill) has 1 inputs');
    expect(node({ to: null })).toThrow('node 2 (fill) fills from a day to a day: from and to are YYYY-MM-DD');
    expect(node({ from: 'last week' })).toThrow('from and to are YYYY-MM-DD');
    expect(node({ missing: { column: 'VendorID' } })).toThrow('node 2 (fill): its missing part isn\'t one: a part names its value');
    expect(node({ missing: null })).toThrow('node 2 (fill) fills from 2022-11-07 with no missing part');
    expect(node({ shift: [1] })).toThrow('node 2 (fill) names its time and the columns it shifts');
    const complete = await translate(derived({ time: 'tpep_pickup_datetime', hours: [13, 23] }, null), { day: '2023-09-21' });
    const p = structuredClone(complete);
    Object.assign(p.nodes[1]!, { to: '2023-09-21' });
    expect(() => validatePlan(p)).toThrow('node 1 (fill) moves rows to 2023-09-21 from no day');
    const q = structuredClone(complete);
    q.nodes.push({ op: 'fill', origin: 'again', inputs: [2], time: 't', shift: [], missing: null, from: null, to: null });
    expect(() => validatePlan(q)).toThrow("node 3 (fill) reads a node that isn't a source");
  });

  it('is written by emit as the rows outside the missing part, and the donor’s inside it, moved and marked', async () => {
    const types: Column[] = [['VendorID', 'int'], ['tpep_pickup_datetime', 'text'], ['tpep_dropoff_datetime', 'text'], ['fare_amount', 'real']];
    const names = types.map(([c]) => c);
    const sql = async (doc: FlowDocument, day: string) => {
      const plan = await translate(doc, { day });
      const fill = plan.nodes.find((n) => n.op === 'fill')!;
      return nodeSelect(fill, fill.inputs.map((j) => `"t${j}"`), fill.inputs.map(() => names), fill.inputs.map(() => types));
    };
    expect(await sql(withFill(), '2022-11-14')).toBe('SELECT *, CAST(NULL AS TEXT) AS "filled_from" FROM "t0"');
    expect(await sql(derived({ column: 'VendorID', value: 1 }, '2022-11-07'), '2022-11-14')).toBe(
      'SELECT "VendorID", "tpep_pickup_datetime", "tpep_dropoff_datetime", "fare_amount", CAST(NULL AS TEXT) AS "filled_from" FROM "t0" WHERE CASE WHEN ("VendorID" IS 1) THEN 1 ELSE 0 END = 0\n' +
        'UNION ALL\n' +
        `SELECT CAST("VendorID" AS INTEGER) AS "VendorID", CAST((date(substr("tpep_pickup_datetime", 1, 10), '+7 days') || substr("tpep_pickup_datetime", 11)) AS TEXT) AS "tpep_pickup_datetime", CAST((date(substr("tpep_dropoff_datetime", 1, 10), '+7 days') || substr("tpep_dropoff_datetime", 11)) AS TEXT) AS "tpep_dropoff_datetime", CAST("fare_amount" AS REAL) AS "fare_amount", CAST('2022-11-07' AS TEXT) AS "filled_from" FROM "t1" WHERE CASE WHEN ("VendorID" IS 1) THEN 1 ELSE 0 END = 1`,
    );
    expect(await sql(derived({ time: 'tpep_pickup_datetime', hours: [13, 23] }, null), '2023-09-21')).toBe(
      'SELECT "VendorID", "tpep_pickup_datetime", "tpep_dropoff_datetime", "fare_amount", CAST(NULL AS TEXT) AS "filled_from" FROM "t0" WHERE CASE WHEN (CAST(substr("tpep_pickup_datetime", 12, 2) AS INTEGER) BETWEEN 13 AND 23) THEN 1 ELSE 0 END = 0',
    );
    expect(missingSql({ column: 'payment_type', value: 0, rest: true }, types)).toBe('"payment_type" IS NOT 0');
    expect(missingSql({ column: 'store_and_fwd_flag', value: 'N' }, types)).toBe(`"store_and_fwd_flag" IS 'N'`);
    expect(missingSql({ column: 'store_and_fwd_flag', value: null }, types)).toBe('"store_and_fwd_flag" IS NULL');
    expect(missingSql({ time: 'pickup', hours: [0, 5] }, [['pickup', 'real']])).toBe(`CAST(strftime('%H', "pickup") AS INTEGER) BETWEEN 0 AND 5`);
    expect(shiftSql('"t"', -3, 'text')).toBe(`(date(substr("t", 1, 10), '-3 days') || substr("t", 11))`);
    expect(shiftSql('"t"', 2, 'int')).toBe('("t" + 172800)');
    expect(shiftSql('"t"', 2, 'real')).toBe('("t" + 2)');
    expect(shiftSql('"t"', 0, 'text')).toBe('"t"');
    const untyped = (await translate(derived({ column: 'VendorID', value: 1 }, null), { day: '2022-11-14' })).nodes[1]!;
    expect(() => nodeSelect(untyped, ['"t0"'], [names])).toThrow("trips_filled: a fill is written for its source's types, and the plan isn't typed");
  });
});

describe('the fills’ content vectors (ADR 0009 amendment 1, Encodings)', () => {
  /** Snapshot hashes, fixed: the vectors' keys don't depend on any data. */
  const SNAP = { trips: 'a'.repeat(64), trips_donor: 'b'.repeat(64) };
  const fillKey = async (plan: FlowPlan) => {
    const keys: string[] = [];
    for (const n of plan.nodes) keys.push(await nodeKey(n, n.inputs.map((j) => keys[j]!), env, n.op === 'table' ? SNAP[n.origin as keyof typeof SNAP] : undefined));
    return keys[plan.nodes.findIndex((n) => n.op === 'fill')]!;
  };

  it('1: the vector document with a base fill step on trips', async () => {
    const plan = await translate(withFill(), { day: '2023-09-21' });
    expect(canonicalJSON(plan)).toBe('{"flow":{"hash":"e2dcc2b1c8d0660d34a5b99e1821d8d860ba17c166d4ee3b76695b48d3a3c93b","id":"v"},"nodes":[{"inputs":[],"op":"table","origin":"trips","table":"trips_file"},{"from":null,"inputs":[0],"missing":null,"op":"fill","origin":"trips_filled","shift":["tpep_pickup_datetime","tpep_dropoff_datetime"],"time":"tpep_pickup_datetime","to":null},{"inputs":[1],"maxDropped":0.1,"op":"expect","origin":"trips_valid","rules":[["fare","fare_amount >= 0","drop"]]}],"outputs":[{"name":"trips_valid","node":2}],"parameters":{"day":"2023-09-21"},"publish":{"hold":["checks","wrong"],"period":"day","together":true,"watch":[[0,"history.json"]]},"smaltflPlan":1}');
    expect(await planHash(plan)).toBe('4ec48299aa3e142ec5cbd81e2e1de68cd02a588a8dd47a974be6b8550f8d0257');
  });

  it('2: its derived document for Vendor 1 from 2022-11-07', async () => {
    const doc = derived({ column: 'VendorID', value: 1 }, '2022-11-07');
    const plan = await translate(doc, { day: '2022-11-14' });
    expect(await flowHash(doc)).toBe('d5b55a25319ecef87142400e04aa81899f9bcf975c2593acbed60740ab444bbe');
    expect(await planHash(plan)).toBe('05c117f88475414018e521253fe8647fbf4a7a8ecde4f93596fd474000abaab6');
    expect(await fillKey(plan)).toBe('597ca2cd775ae0063b35478e1f6d2806f57dbafa81f9c40aa6ae1fb737ac761b');
  });

  it('3: the same, for the part that arrived alone', async () => {
    const doc = derived({ column: 'VendorID', value: 1 }, null);
    const plan = await translate(doc, { day: '2022-11-14' });
    expect(await flowHash(doc)).toBe('34bb7cfbb4bfad9a86d0c587be865295c6d7e17de87604a36be21614455dce95');
    expect(await planHash(plan)).toBe('1f0dccb414035422fe9db464ce2167bf65d181ac0cecbfa32959a6818198869a');
    expect(await fillKey(plan)).toBe('8e220625656cb762a7731c4ba01d4bede329ee79a9722fa2ff5da57e51bf67d5');
  });

  it('4: the example with its fill step, for Thu Sep 21, 2023; its zones and weather keep their keys', async () => {
    const values = { month: '2023-09', day: '2023-09-21' };
    expect(validateDocument(exampleFilled())).toEqual([]);
    const plan = await translate(exampleFilled(), values);
    expect(plan.publish).toEqual({ hold: ['checks', 'wrong'], watch: [[0, 'history.json']], period: 'day', together: true, donor: 'weekday' });
    // On the example with its ontology's nouns and the vendor's name and role (ADR 0010 §8); d145cfde… without them.
    expect(await planHash(plan)).toBe('0749ab06d7d6e78fff14b5ff23d4f8641ac315b70764b16881b367ed13074170');
    // The example as it ships has its fill step (step A10): this vector. Taken out again (exampleUnfilled), the plan/1
    // vector it had before the fills (7d7236ea…, which is ccbc4d7b… with those marks).
    expect(await planHash(await translate(exampleLegacy(), values))).toBe('0749ab06d7d6e78fff14b5ff23d4f8641ac315b70764b16881b367ed13074170');
    const before = await translate(exampleUnfilled(), values);
    expect(await planHash(before)).toBe('7d7236ead520908b210b879a16815f4d3a727b6320f620d2821d3f87195fd252');
    const keyed = async (p: FlowPlan) => Object.fromEntries((await keysOf(p)).map((k, i) => [p.nodes[i]!.origin, k]));
    const [now, then] = [await keyed(plan), await keyed(before)];
    const same = Object.keys(now).filter((o) => then[o] === now[o]).sort();
    expect(same).toEqual(['districts', 'trips', 'weather', 'weather_hourly', 'zone_list', 'zones']);
    expect(Object.keys(now).filter((o) => !(o in then))).toEqual(['trips_filled']);
  });

  it('6: the example as it ships, in the general form (plan/2, ADR 0010 §13, Q-54), for Thu Sep 21, 2023', async () => {
    const values = { month: '2023-09', day: '2023-09-21' };
    const doc = exampleDoc();
    expect(validateDocument(doc)).toEqual([]);
    const plan = await translate(doc, values);
    expect(planKind(plan)).toBe('plan/2');
    const pub = plan.publish as PlanPublish2;
    expect(pub.calendar).toEqual({ base: 'us-nyc/1', zone: 'America/New_York', days: [{ name: 'Election Day', weekday: 'tue', between: [2, 8], month: [11] }], windows: [], dates: [] });
    expect(pub.watch[0]![1]).toMatchObject({ history: 'history.json', pattern: 'weekly', donor: 'weekday', scale: 'fixed', time: 'tpep_pickup_datetime', relearn: false, bad: [], newValues: [], after: [] });
    // Checked with sha256sum over its canonical JSON. No node changes: its keys are vector 4's.
    expect(await planHash(plan)).toBe('668856bd2ec35235a2882e3825a580d0905fa6de8531d89162b2d4d8130240c6');
    expect(await keysOf(plan)).toEqual(await keysOf(await translate(exampleLegacy(), values)));
  });

  it('5: the plans without a fill step hash as they did (fc700fdf…, 32609b0f…, 292c423f…)', async () => {
    expect(await planHash(await translate(vectorDoc(), { day: '2023-09-21' }))).toBe('fc700fdf9d4dd95e71ee083cfee0ddca2ba46dd122b7a840e182234611668fd4');
    const { publish: _p, ...without } = vectorDoc();
    expect(await planHash(await translate({ ...without, smaltfl: 1 }, { day: '2023-09-21' }))).toBe('32609b0f1de25bc72ea09219c0c38cd2cff347619e2db5c8506a7da144720f8e');
    expect(await planHash(await translate(exampleBefore()))).toBe('292c423f3a56ab26bd853af571c23cf2c1d5e775c882da06cf9725e0b91d1947');
  });
});

describe('the plan of a flow that says how its days are judged (plan/2, ADR 0010 E13)', () => {
  /** E10's document in the general form: its watch an object, and a calendar with no days. */
  const v2 = (watch: Record<string, unknown> = { history: 'history.json', donor: 'nearest' }): FlowDocument => ({
    smaltfl: 3, id: 'v', name: 'V', parameters: [{ name: 'day', type: 'text', default: null }], sources: [{ id: 'trips', table: 'trips_file' }],
    steps: [{ id: 'trips_valid', kind: 'expectations', inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' }], maxDropped: 0.1, dataset: {} }],
    calendar: { base: 'none' },
    publish: { hold: ['wrong', 'checks'], period: 'day', watch: { trips: watch as unknown as WatchDef } },
  });

  it('hashes as plan/2, every setting filled in (vector)', async () => {
    const plan = await translate(v2(), { day: '2023-09-21' });
    expect(plan.flow.hash).toBe('bed47b2e3bece5da61233c8a069710f7cd5c8959d9a4926e99dadc8d9783b56a');
    expect(canonicalJSON(plan)).toBe('{"flow":{"hash":"bed47b2e3bece5da61233c8a069710f7cd5c8959d9a4926e99dadc8d9783b56a","id":"v"},"nodes":[{"inputs":[],"op":"table","origin":"trips","table":"trips_file"},{"inputs":[0],"maxDropped":0.1,"op":"expect","origin":"trips_valid","rules":[["fare","fare_amount >= 0","drop"]]}],"outputs":[{"name":"trips_valid","node":1}],"parameters":{"day":"2023-09-21"},"publish":{"calendar":{"base":"none","dates":[],"days":[],"windows":[],"zone":"UTC"},"hold":["checks","wrong"],"meanwhile":"last","period":"day","together":true,"until":"decision","watch":[[0,{"after":[],"bad":[],"calendar":true,"count":null,"donor":"nearest","every":"day","follow":null,"history":"history.json","holds":true,"newValues":[],"pattern":"weekly","period":"day","relearn":false,"scale":"volume","time":null,"zone":null}]]},"smaltflPlan":2}');
    expect(planKind(plan)).toBe('plan/2');
    // Recomputed when the watch gained `relearn` (phase 3, ADR 0010 E13), checked with sha256sum.
    expect(await planHash(plan)).toBe('0c4d833a7aace2590b79d22431cd714063007d4f807f7e7a49b1f75cb2b19224');
    expect(() => validatePlan(plan)).not.toThrow();
    // The same document in the legacy form is E10's, plan/1, byte for byte.
    const { calendar: _c, ...legacy } = v2();
    expect(await planHash(await translate({ ...legacy, smaltfl: 2, publish: { ...legacy.publish!, watch: { trips: 'history.json' } } }, { day: '2023-09-21' }))).toBe('fc700fdf9d4dd95e71ee083cfee0ddca2ba46dd122b7a840e182234611668fd4');
    // The donor's default follows the pattern: weekly gives the same weekday.
    expect(((await translate(v2({ history: 'history.json' }), { day: '2023-09-21' })).publish as PlanPublish2).watch[0]![1].donor).toBe('weekday');
  });

  it('changes no node: the keys are plan/1’s, so nothing is rebuilt', async () => {
    const values = { day: '2023-09-21' };
    const { calendar: _c, ...legacy } = v2();
    const a = await translate(v2(), values);
    const b = await translate({ ...legacy, smaltfl: 2, publish: { ...legacy.publish!, watch: { trips: 'history.json' } } }, values);
    expect(a.nodes).toEqual(b.nodes);
    expect(await keysOf(a)).toEqual(await keysOf(b));
  });

  it('is plan/2 for a watched source with a mark that changes verdicts, with the legacy settings, and plan/1 otherwise (Q-79)', async () => {
    const marked = withOntology({ ...holding(PUBLISH), smaltfl: 3 }, [BAD_RESULT, { column: 'country', title: 'Country', description: 'Where from', newValues: 'alert', datasets: ['trips'] }, { column: 'tpep_dropoff_datetime', title: 'Drop-off', description: 'When', after: { of: 'tpep_pickup_datetime', minutes: 15 } }]);
    const plan = await translate(marked, { day: '2024-01-15' });
    expect(plan.smaltflPlan).toBe(2);
    const pub = plan.publish as PlanPublish2;
    // A watch given as a file name keeps today's calendar and fixed floors.
    expect(pub.calendar).toEqual({ base: 'us-nyc/1', zone: 'America/New_York', days: [], windows: [], dates: [] });
    expect(pub.watch[0]![1]).toMatchObject({ history: 'history.json', scale: 'fixed', donor: 'weekday', pattern: 'weekly', bad: [['payment_type', '4']], newValues: [['country', 'alert'], ['payment_type', 'alert']], after: [['tpep_dropoff_datetime', 'tpep_pickup_datetime', 15]] });
    expect(() => validatePlan(plan)).not.toThrow();
    // A mark on another dataset only: the document is format 3, and its plan stays plan/1.
    const elsewhere = withOntology({ ...holding(PUBLISH), smaltfl: 3 }, [{ ...BAD_RESULT, datasets: ['trips_enriched'] }]);
    expect((await translate(elsewhere, { day: '2024-01-15' })).smaltflPlan).toBe(1);
    // A general watch with no calendar block has none (Q-58), whatever the marks.
    expect(((await translate(general(), { day: '2024-01-15' })).publish as PlanPublish2).calendar.base).toBe('none');
    expect(((await translate(general({}, { calendar: { base: 'us' } }), { day: '2024-01-15' })).publish as PlanPublish2).calendar.base).toBe('us/1');
  });

  it('reads each watch the same way in either format', async () => {
    const one = await translate(holding(PUBLISH), { day: '2024-01-15' });
    const two = await translate(general({ holds: false, period: 'day' }, { publish: { hold: ['checks'], watch: { trips: { history: 'h.json', holds: false, period: 'day' } } } }), { day: '2024-01-15' });
    const node = one.nodes.findIndex((n) => n.origin === 'trips');
    expect(watchesOf(one.publish)).toEqual([{ node, history: 'history.json', period: 'day', holds: true, settings: null }]);
    expect(watchesOf(two.publish)).toMatchObject([{ node, history: 'h.json', period: 'day', holds: false }]);
    expect([planPeriod(one.publish), planPeriod(two.publish), planPeriod(undefined)]).toEqual(['day', 'day', null]);
    expect(watchesOf(undefined)).toEqual([]);
  });

  it('is checked before it is trusted, and refuses what this version can’t judge', async () => {
    const plan = await translate(v2(), { day: '2023-09-21' });
    const pub = plan.publish as PlanPublish2;
    const w = pub.watch[0]![1];
    const bad = (publish: unknown) => () => validatePlan({ ...plan, publish } as FlowPlan);
    expect(bad({ ...pub, breaks: [] })).toThrow("publish has breaks, which this version doesn't read");
    expect(bad({ ...pub, meanwhile: 'echo' })).toThrow('publish.meanwhile echo is not one this version reads (last, fill, complete)');
    expect(bad({ ...pub, until: 'later' })).toThrow('publish.until later is not one this version reads (decision, normal)');
    expect(() => validatePlan({ ...plan, publish: { ...pub, meanwhile: 'fill', until: 'normal' } } as FlowPlan)).not.toThrow();
    expect(bad({ ...pub, calendar: { ...pub.calendar, base: 'uk/1' } })).toThrow('publish.calendar is { base: none, us/1 or us-nyc/1, zone, days, windows, dates }');
    expect(bad({ ...pub, calendar: { ...pub.calendar, days: [{ name: 'Patch Tuesday' }] } })).toThrow('publish.calendar.days[0]: a day of the month (day) or a weekday between two days of it (weekday, between): one of them');
    expect(() => validatePlan({ ...plan, publish: { ...pub, calendar: { ...pub.calendar, days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }] } } } as FlowPlan)).not.toThrow();
    expect(bad({ ...pub, watch: [[0, { ...w, every: 'week' }]] })).toThrow('publish.watch[0].every week is not one this version can judge (day, 12h, 8h, 6h, 4h, 3h, 2h, 1h)');
    // A slot's period names a slot of its length, and its time column counts it (ADR 0010 §7).
    expect(bad({ ...pub, watch: [[0, { ...w, every: '6h' }]] })).toThrow('publish.watch[0]: day is 2023-09-21, not a slot of 6h (such as 2023-09-21T00)');
    expect(() => validatePlan({ ...plan, parameters: { ...plan.parameters, day: '2023-09-21T06' }, publish: { ...pub, watch: [[0, { ...w, every: '6h', time: null }]] } } as FlowPlan)).toThrow('publish.watch[0].time: a load of 6h is counted by its time column');
    expect(bad({ ...pub, watch: [[0, { ...w, pattern: 'yearly' }]] })).toThrow('publish.watch[0].pattern yearly is not one this version can judge (weekly, none, monthly)');
    expect(() => validatePlan({ ...plan, publish: { ...pub, watch: [[0, { ...w, pattern: 'none' }]] } } as FlowPlan)).not.toThrow();
    const { zone: _z, ...short } = w;
    expect(bad({ ...pub, watch: [[0, short]] })).toThrow('publish.watch[0] has after, bad, calendar, count, donor, every, follow, history, holds, newValues, pattern, period, relearn, scale, time; a watch has exactly');
    expect(bad({ ...pub, watch: [[1, w]] })).toThrow("publish.watch[0] watches node 1, which isn't a source");
    expect(bad({ ...pub, watch: [[0, { ...w, bad: [['result']] }]] })).toThrow('publish.watch[0].bad is a list of [column, …]');
    expect(bad({ ...pub, watch: [[0, { ...w, holds: false }]] })).toThrow('publish.hold judges a source (short or wrong), and no watch holds');
    expect(bad({ ...pub, hold: ['checks', 'unlearned'] })).toThrow('publish.hold has unlearned without short or wrong');
    // A plan/1 plugin reading plan/2's block refuses its fields by name; and the format must match the block.
    expect(() => validatePlan({ ...plan, smaltflPlan: 1 })).toThrow("publish has calendar, which this version doesn't read");
  });

  it('carries the fills’ settings for a document in the general form: the donor in each watch, meanwhile and until in publish (C1, I10)', async () => {
    const values = { day: '2023-09-21' };
    // A legacy document with a fill step stays plan/1, with the fills' settings only when set (vectors 1 and 4).
    expect((await translate(withFill(), values)).smaltflPlan).toBe(1);
    // In format 3 the fill step changes nothing of the format: plan/2, every setting filled in, the donor in the watch.
    const general = (watch: Record<string, unknown> = { history: 'history.json' }, publish: Partial<PublishDef> = {}): FlowDocument => {
      const d = withFill(v2(watch));
      return { ...d, publish: { ...d.publish!, ...publish } };
    };
    expect(validateDocument(general())).toEqual([]);
    const plan = await translate(general(), values);
    expect(plan.smaltflPlan).toBe(2);
    const pub = plan.publish as PlanPublish2;
    expect([pub.meanwhile, pub.until, pub.watch[0]![1].donor]).toEqual(['last', 'decision', 'weekday']);
    expect('donor' in pub).toBe(false);
    const set = (await translate(general({ history: 'history.json', donor: 'nearest' }, { meanwhile: 'fill', until: 'normal' }), values)).publish as PlanPublish2;
    expect([set.meanwhile, set.until, set.watch[0]![1].donor]).toEqual(['fill', 'normal', 'nearest']);
    expect(() => validatePlan({ ...plan, publish: set })).not.toThrow();
    // A flow-wide donor rule is plan/1's: format 3 refuses it, and a plan/2 plugin refuses it in the plan, by name.
    expect(validateDocument(general(undefined, { donor: 'nearest' }))).toEqual([{ path: '$.publish.donor', message: 'in format 3 each watch names its own donor (publish.watch.<source>.donor, a watch given as an object): refused rather than ignored' }]);
    expect(() => validatePlan({ ...plan, publish: { ...pub, donor: 'nearest' } } as FlowPlan)).toThrow("publish has donor, which this version doesn't read");
    // A derived document keeps its original's format: plan/2 stays plan/2, plan/1 stays plan/1.
    const repaired = (d: FlowDocument): FlowDocument => ({
      ...d,
      sources: [...d.sources, { id: 'trips_donor', table: 'trips_file_donor' }],
      steps: d.steps.map((st) => (st.id === 'trips_filled' ? ({ ...st, missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, from: '2023-09-14', inputs: ['trips', 'trips_donor'] } as FillStep) : st)),
    });
    expect(validateDocument(repaired(general()))).toEqual([]);
    const fixed = await translate(repaired(general()), values);
    expect(fixed.smaltflPlan).toBe(2);
    expect(watchesOf(fixed.publish).map((w) => fixed.nodes[w.node]!.origin)).toEqual(['trips']);
    expect((await translate(repaired(withFill()), values)).smaltflPlan).toBe(1);
  });

  it('moves a donor’s rows to the day its source’s watch names, when the flow names none (C1)', async () => {
    const d = withFill(v2({ history: 'history.json', period: 'day' }));
    const { period: _p, ...pub } = d.publish!;
    const own: FlowDocument = {
      ...d,
      publish: pub,
      sources: [...d.sources, { id: 'trips_donor', table: 'trips_file_donor' }],
      steps: d.steps.map((st) => (st.id === 'trips_filled' ? ({ ...st, missing: { column: 'VendorID', value: 1 }, from: '2022-11-07', inputs: ['trips', 'trips_donor'] } as FillStep) : st)),
    };
    expect(validateDocument(own)).toEqual([]);
    const plan = await translate(own, { day: '2022-11-14' });
    expect(plan.nodes.find((n) => n.op === 'fill')).toMatchObject({ from: '2022-11-07', to: '2022-11-14' });
    expect(planPeriod(plan.publish)).toBe('day');
    // With neither, the document says which period is missing.
    const none: FlowDocument = { ...own, publish: { ...pub, watch: { trips: { history: 'history.json' } }, hold: ['checks'] } };
    expect(validateDocument(none).filter((x) => x.path === '$.steps[0].from')).toEqual([{ path: '$.steps[0].from', message: "a fill from another day needs trips's period (its watch's, or publish.period): the parameter whose value is the day its rows move to" }]);
  });
});
