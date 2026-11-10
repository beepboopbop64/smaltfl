/**
 * Gates (ADR 0014, slice 1): a `gate()` cell in the notebook becomes the document's gate on a source or step; a flow
 * with any gate is plan/4, each watch carrying every check's mode, filled in from its layer; the judges read the gate:
 * under a check that warns, something wrong is unusual at most (a value marked bad excepted), under one that is off,
 * nothing is told; a flow with no gate is judged as it always was.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { CHECK_NAMES, checkOf, gateChecksOf, gated, LAYER_DEFAULTS, resolveGate } from '../src/core/gates.js';
import { HistoryRanges } from '../src/core/history.js';
import { planKind } from '../src/core/manifest.js';
import { expandNotebooks, stepsOfNotebooks } from '../src/core/notebook.js';
import { judgeOf, LEGACY_JUDGE, newsOf } from '../src/core/news.js';
import { translate, validatePlan } from '../src/core/plan.js';
import { exampleDoc } from './helpers/example.js';
import { historyWith, vendorNames } from './helpers/history.js';
import { ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, gate, publish, source } from 'smaltfl/notebook';\n";

/** A format-4 flow over one watched source and one watched, published step, from the notebook given. */
const flow = (nb: string, extra: Partial<FlowDocument> = {}): FlowDocument =>
  ({
    smaltfl: 4,
    id: 'gated',
    name: 'Gated',
    parameters: [{ name: 'day', type: 'text', default: '2024-01-02' }],
    sources: [{ id: 'auth', table: 'auth_file' }],
    notebooks: [{ path: 'a.nb.ts', source: nb }],
    publish: { hold: ['checks', 'wrong'], period: 'day', watch: { auth: { history: 'h.json', pattern: 'none' }, by_hour: { history: 'h2.json', pattern: 'none' } } },
    ...extra,
  }) as FlowDocument;

const BODY = `
cell('params');
export const params = param({ day: param.text('') });

cell('auth');
export const auth = source('auth');

cell('auth_valid');
export const auth_valid = check(auth, { rules: [{ name: 'ok', check: 'result IS NOT NULL', onFail: 'drop' }], maxDropped: 0.1 });

cell('by_hour', { lang: 'sql' });
export const by_hour = sql\`SELECT substr(time, 12, 2) AS hour, count(*) AS n FROM \${auth_valid} GROUP BY 1\`;

cell('published');
publish(by_hour, { description: 'By hour' });
`;

describe('a gate cell in the notebook (ADR 0014 §1)', () => {
  it('becomes the document’s gate on the node it names, its layer the node’s own unless written', async () => {
    const nb = `${SETUP}${BODY}
cell('auth_gate');
export const auth_gate = gate(auth, { checks: { shares: 'hold', forest: 'off' } });

cell('by_hour_gate');
export const by_hour_gate = gate(by_hour, { layer: 'silver', checks: { needs: 'off' } });
`;
    const doc = await expandNotebooks(flow(nb), ts);
    expect(validateDocument(doc)).toEqual([]);
    expect(doc.gates).toEqual({ auth: { layer: 'bronze', checks: { shares: 'hold', forest: 'off' } }, by_hour: { layer: 'silver', checks: { needs: 'off' } } });
    // The steps are the same: a gate is no step.
    expect(doc.steps.map((s) => s.id)).toEqual(['auth_valid', 'by_hour']);
    // Display: the outline names the cell as a gate on its node, and the cell is kept under `gate:<node>`.
    const outline = doc.outline!.find((o) => o.path === 'a.nb.ts')!.cells;
    expect(outline.filter((c) => c.kind === 'gate').map((c) => [c.cell, c.gate])).toEqual([['auth_gate', 'auth'], ['by_hour_gate', 'by_hour']]);
    expect(doc.cells!['gate:auth']).toMatchObject({ notebook: 'a.nb.ts', cell: 'auth_gate', lang: 'ts' });
    // The gate's name passes its node through: a cell after it may read either.
    const through = `${SETUP}${BODY}
cell('auth_gate');
export const auth_gate = gate(auth);

cell('late', { lang: 'sql' });
export const late = sql\`SELECT count(*) AS n FROM \${auth_gate}\`;
`;
    const t = await stepsOfNotebooks(flow(through), ts);
    expect(t.issues).toEqual([]);
    expect(t.gates).toEqual({ auth: { layer: 'bronze', checks: {} } });
    expect(t.steps.find((s) => s.id === 'late')).toMatchObject({ kind: 'sql', inputs: ['auth'], sql: 'SELECT count(*) AS n FROM auth' });
  });

  it('refuses a gate on nothing, on a step nothing publishes or watches, a check or a mode outside the vocabulary, two gates on one node', async () => {
    const issues = async (cells: string) => (await stepsOfNotebooks(flow(`${SETUP}${BODY}${cells}`), ts)).issues.map((i) => i.message);
    expect(await issues("cell('g');\nexport const g = gate(nobody);\n")).toEqual(['gate() judges a source or step by its name; nothing defines nobody as one']);
    expect(await issues("cell('g');\nexport const g = gate(auth_valid);\n")).toEqual(['gate(auth_valid, …): auth_valid is a step nothing publishes or watches; a gate judges what the flow judges or lets out']);
    expect(await issues("cell('g');\nexport const g = gate(auth, { checks: { smell: 'hold' } });\n")).toEqual(["gate(auth, …): smell isn't a check (schema, amount, blanks, values, rules, scope, needs, due, reconcile, shares, shape, hours, pairs, forest, classifier)"]);
    expect(await issues("cell('g');\nexport const g = gate(auth, { checks: { shares: 'loud' } });\n")).toEqual(['gate(auth, …): checks.shares is one of hold, warn, off']);
    expect(await issues("cell('g');\nexport const g = gate(auth, { layer: 'platinum' });\n")).toEqual(['gate(auth, …): layer is one of bronze, silver, gold']);
    expect(await issues("cell('g');\nexport const g = gate(auth, { strict: true });\n")).toEqual(["gate(auth, …): strict isn't a gate's setting (layer, checks, scope, needs, reconcile): refused rather than ignored"]);
    expect(await issues("cell('g');\nexport const g = gate(auth);\ncell('g2');\nexport const g2 = gate(auth);\n")).toEqual(['auth has two gates']);
    expect(await issues("cell('g');\nexport const g = gate(auth, 'bronze');\n")).toEqual(['gate() takes its settings as an object literal: { layer, checks }']);
  });

  it('is refused in a document without notebooks: a gate is written in a notebook', () => {
    const doc = { ...exampleDoc(), gates: { trips: { layer: 'bronze', checks: {} } } } as FlowDocument;
    expect(validateDocument(doc).map((i) => `${i.path}: ${i.message}`)).toEqual(['$.gates: a gate is written in a notebook, as a gate() cell beside the node it judges: a document without notebooks has none']);
  });
});

describe('plan/4: each watch carries its checks', () => {
  const gatedNb = `${SETUP}${BODY}
cell('auth_gate');
export const auth_gate = gate(auth, { checks: { shares: 'hold', forest: 'off' } });
`;

  it('fills every check in from the layer’s defaults, the written ones over them; an ungated watch has its layer’s', async () => {
    const doc = await expandNotebooks(flow(gatedNb), ts);
    const plan = await translate(doc, { day: '2024-01-02' });
    expect(plan.smaltflPlan).toBe(4);
    expect(planKind(plan)).toBe('plan/4');
    expect(() => validatePlan(plan)).not.toThrow();
    const pub = plan.publish as unknown as { watch: [number, { checks: Record<string, string> }][] };
    const checks = Object.fromEntries(pub.watch.map(([node, w]) => [plan.nodes[node]!.origin, w.checks]));
    expect(Object.keys(checks.auth!)).toEqual([...CHECK_NAMES]);
    expect(checks.auth).toEqual({ ...LAYER_DEFAULTS.bronze, shares: 'hold', forest: 'off' });
    // The watched step has no gate of its own: silver's defaults.
    expect(checks.by_hour).toEqual(LAYER_DEFAULTS.silver);
    expect(checks.by_hour!.needs).toBe('hold');
    // The gate is in the flow hash: the same notebook without it hashes otherwise, and is plan/3.
    const plain = await translate(await expandNotebooks(flow(`${SETUP}${BODY}`), ts), { day: '2024-01-02' });
    expect(plain.smaltflPlan).toBe(3);
    expect(plain.flow.hash).not.toBe(plan.flow.hash);
    expect((plain.publish as unknown as { watch: [number, Record<string, unknown>][] }).watch.every(([, w]) => !('checks' in w))).toBe(true);
  });

  it('refuses a plan/4 watch without its checks, or with a check outside the vocabulary, and a plan/3 watch with checks', async () => {
    const doc = await expandNotebooks(flow(gatedNb), ts);
    const plan = await translate(doc, { day: '2024-01-02' });
    const pub = plan.publish as unknown as { watch: [number, Record<string, unknown>][] };
    const without = { ...plan, publish: { ...pub, watch: pub.watch.map(([n, w]) => [n, Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'checks'))]) } } as unknown as typeof plan;
    expect(() => validatePlan(without)).toThrow(/a watch has exactly .*checks/);
    const odd = { ...plan, publish: { ...pub, watch: pub.watch.map(([n, w]) => [n, { ...w, checks: { ...(w.checks as object), shares: 'loud' } }]) } } as unknown as typeof plan;
    expect(() => validatePlan(odd)).toThrow(/checks is every check/);
    const { gates: _gates, ...rest } = plan.publish as unknown as Record<string, unknown>;
    const three = { ...plan, smaltflPlan: 3, publish: rest } as unknown as typeof plan;
    expect(() => validatePlan(three)).toThrow(/a watch has exactly/);
    // A plan/3 publish block carries no gates: with them, it is refused as such.
    expect(() => validatePlan({ ...plan, smaltflPlan: 3 })).toThrow(/publish.gates is plan\/4/);
  });
});

describe('the judges read the gate (Q-114)', () => {
  it('is null for a flow with no gate, and the node’s checks for one with any', async () => {
    expect(judgeOf(exampleDoc(), 'trips').checks).toBeNull();
    const doc = await expandNotebooks(flow(`${SETUP}${BODY}\ncell('g');\nexport const g = gate(by_hour, { checks: { pairs: 'off' } });\n`), ts);
    expect(judgeOf(doc, 'auth').checks).toEqual(LAYER_DEFAULTS.bronze);
    expect(judgeOf(doc, 'by_hour').checks).toEqual({ ...LAYER_DEFAULTS.silver, pairs: 'off' });
    expect(gateChecksOf(doc, 'BY_HOUR')).toEqual(judgeOf(doc, 'by_hour').checks);
    expect(resolveGate({ layer: 'gold', checks: {} })).toEqual(LAYER_DEFAULTS.gold);
  });

  it('maps each finding to its check, and leaves the calm day, a day not judged and the weather alone', () => {
    expect(checkOf('volume')).toBe('amount');
    expect(checkOf('gone')).toBe('shares');
    expect(checkOf('missing')).toBe('blanks');
    expect(checkOf('new')).toBe('values');
    expect(checkOf('combo')).toBe('pairs');
    expect(checkOf('unlike')).toBe('forest');
    expect(checkOf('dropped')).toBe('rules');
    expect(checkOf('integrity')).toBe('schema');
    for (const k of ['calm', 'unlearned', 'weather', 'key', 'unmatched', 'placeholder', 'empty'] as const) expect(checkOf(k)).toBeNull();
  });

  it('caps a learned check’s finding at unusual under warn, drops it under off, keeps a written one’s, and never softens a value marked bad', () => {
    const h = new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } }));
    const plain = newsOf(h, '2023-10-11', vendorNames);
    expect(plain.find((f) => f.kind === 'gone')!.severity).toBe('alert');
    expect(plain.find((f) => f.kind === 'volume')!.severity).toBe('alert');
    expect(plain.every((f) => f.check === undefined)).toBe(true);
    const bronze = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.bronze };
    const gatedNews = newsOf(h, '2023-10-11', vendorNames, { judge: bronze });
    const gone = gatedNews.find((f) => f.kind === 'gone')!;
    expect(gone.severity).toBe('warn');
    expect(gone.check).toBe('shares');
    expect(gatedNews.find((f) => f.kind === 'volume')).toMatchObject({ severity: 'alert', check: 'amount' });
    // Off: not told at all; the rest unchanged.
    const off = newsOf(h, '2023-10-11', vendorNames, { judge: { ...bronze, checks: { ...LAYER_DEFAULTS.bronze, shares: 'off', amount: 'off' } } });
    expect(off.some((f) => f.kind === 'gone' || f.kind === 'share' || f.kind === 'volume')).toBe(false);
    // A value the ontology marks bad is always something wrong, whatever the check's mode: vendor 1 marked bad and up
    // to 90% of the day holds under shares: warn, while vendor 2's own fall is unusual at most.
    const up = new HistoryRanges(historyWith({ '2023-10-11': { vendorShare: 0.9 } }));
    const bad = newsOf(up, '2023-10-11', vendorNames, { judge: { ...bronze, bad: new Map([['vendorid', new Set(['1'])]]) } });
    expect(bad.find((f) => f.key === 'share:VendorID=1')).toMatchObject({ severity: 'alert', bad: true, check: 'shares' });
    expect(bad.find((f) => f.key === 'share:VendorID=2')).toMatchObject({ severity: 'warn', check: 'shares' });
    // The rule on one finding, by itself.
    expect(gated({ key: 'x', kind: 'share', severity: 'alert', score: 1, title: '', detail: '', look: 'columns', acts: [] }, LAYER_DEFAULTS.silver)).toMatchObject({ severity: 'warn', check: 'shares' });
    expect(gated({ key: 'x', kind: 'calm', severity: 'ok', score: 0, title: '', detail: '', look: 'history', acts: [] }, LAYER_DEFAULTS.gold)).toMatchObject({ severity: 'ok' });
    expect(gated({ key: 'x', kind: 'share', severity: 'alert', score: 1, title: '', detail: '', look: 'columns', acts: [] }, LAYER_DEFAULTS.gold)).toBeNull();
  });
});
