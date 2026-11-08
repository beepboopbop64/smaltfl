import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentFormat, insertAfter, takeOut, validateDocument, type FlowDocument, type PublishDef, type WatchDef } from '../src/core/document.js';
import { renameIdentifier } from '../src/core/sqltext.js';
import { nodeKey } from '../src/core/keys.js';
import { shapeOf } from '../src/core/optimize.js';
import { flowHash, PlanError, translate, validatePlan, type FlowPlan } from '../src/core/plan.js';
import { planHash, planKind } from '../src/core/manifest.js';
import { canonicalJSON } from '../src/core/canonical.js';
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
    expect(() => validatePlan({ ...plan, smaltflPlan: 2 } as unknown as FlowPlan)).toThrow('format 2, expected 0 or 1');
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

/** The example as ADR 0009 found it: format 1, no `day` parameter, no publish block (whatever it gains later). */
function exampleBefore(): FlowDocument {
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
  const { publish: _publish, ...rest } = doc;
  return { ...rest, smaltfl: 1, parameters: (doc.parameters ?? []).filter((p) => p.name !== 'day') };
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
    expect(issues('all')).toEqual([{ path: '$.publish', message: '{ hold, watch, period, together }' }]);
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
    // A later slice's setting is refused, never ignored: this version wouldn't keep it.
    expect(issues({ ...PUBLISH, meanwhile: 'fill' })).toEqual([{ path: '$.publish.meanwhile', message: 'not a field this version reads (hold, watch, period, together): refused rather than ignored' }]);
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
    const later = 'not something this version can judge yet: refused rather than ignored';
    expect(issues({ every: '6h' })).toEqual([{ path: '$.publish.watch.trips.every', message: `6h: ${later}` }]);
    expect(issues({ every: 'week' })).toEqual([{ path: '$.publish.watch.trips.every', message: 'day' }]);
    expect(issues({ pattern: 'none' })).toEqual([{ path: '$.publish.watch.trips.pattern', message: `none: ${later}` }]);
    expect(issues({ pattern: 'monthly' })).toEqual([{ path: '$.publish.watch.trips.pattern', message: `monthly: ${later}` }]);
    expect(issues({ breaks: [] })).toEqual([{ path: '$.publish.watch.trips.breaks', message: 'not a field this version reads (history, period, every, pattern, donor, time, zone, calendar, scale, holds, count, follow): refused rather than ignored' }]);
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

  it('checks its calendar, refusing the days this build can’t judge yet', () => {
    expect(validateDocument(general({}, { calendar: { base: 'us', zone: 'Europe/London' } }))).toEqual([]);
    expect(validateDocument(general({}, { calendar: { base: 'uk' as never, days: [{ name: 'Patch Tuesday', weekday: 'tue', between: [8, 14] }] } }))).toEqual([
      { path: '$.calendar.base', message: 'one of none, us, us-nyc' },
      { path: '$.calendar.days', message: "a flow's own recurring days are not something this version can judge yet: refused rather than ignored" },
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
    // The example with the block of ADR 0009 §2.
    expect(await planHash(await translate(exampleHolding(), { month: '2023-09', day: '2023-09-21' }))).toBe('ccbc4d7bee92ae2e153ab8a345e6a3d807e201193ab9dade82a48362dc3cd8c8');
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
    expect(bad({ ...plan.publish, until: 'normal' })).toThrow("publish has until, which this version doesn't read");
  });
});
