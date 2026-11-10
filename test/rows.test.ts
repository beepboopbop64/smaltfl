/**
 * What a dataset's rows are (ADR 0015 §1): the ontology's `rows` says a dataset has one row an object of a type, for
 * the objects a condition selects. The declaration and its accessor; what the document refuses; the two written rules
 * a watched node with an entry is judged by (its scope and its key), the gate cell's own first, the same for the plan
 * that counts them and the judge that names them; the condition as the emitter writes it, counted in the engine; a
 * tied watched step run through the engine, its claim told there; and the story's lead where the amount and a rule,
 * or the two rules, say the same thing (the ADR's "What moves on the estate").
 */
import { describe, expect, it } from 'vitest';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { emitMatch, emitScopeCounts } from '../src/core/emit.js';
import { acceptable } from '../src/core/fill.js';
import { LAYER_DEFAULTS, writtenRules } from '../src/core/gates.js';
import { HistoryRanges } from '../src/core/history.js';
import { appendPeriods, emptyHistory, measuresOf, settingsFor, type MeasureSettings, type Measures } from '../src/core/measures.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { judgeOf, LEGACY_JUDGE, newsOf } from '../src/core/news.js';
import { conditionOf, nounOf, rowsOf, type Ontology, type RowsDef } from '../src/core/ontology.js';
import { translate, validatePlan } from '../src/core/plan.js';
import { storyOf } from '../src/core/story.js';
import { measureLoad, runFlow } from '../src/index.js';
import { openEngine, SMALTDB } from './helpers/engine.js';
import { vendorNames } from './helpers/history.js';
import { ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, gate, publish, source } from 'smaltfl/notebook';\n";
const TLS_GATE = "cell('tls_gate');\nexport const tls_gate = gate(tls, { layer: 'bronze' });\n";
const nb = (gates = TLS_GATE, after = '') => `${SETUP}
cell('params');
export const params = param({ day: param.text('') });
cell('apps');
export const apps = source('apps');
cell('tls');
export const tls = source('tls');
cell('mfa');
export const mfa = source('mfa');
${gates}
cell('posture', { lang: 'sql' });
export const posture = sql\`SELECT a.app_id, t.status AS tls FROM \${apps} a LEFT JOIN \${tls} t ON t.app_id = a.app_id\`;
${after}
cell('published');
publish(posture);
`;
/** A gate on the step that turns its key on: silver's default for it is off. */
const POSTURE_GATE = "cell('posture_gate');\nexport const posture_gate = gate(posture, { layer: 'silver', checks: { reconcile: 'hold' } });\n";
const APPLICATION = { id: 'application', name: 'Application', dataset: 'apps', key: ['app_id'], title: 'name' };
const ONTOLOGY: Ontology = {
  objectTypes: [APPLICATION],
  linkTypes: [],
  actionTypes: [],
  rows: [
    { dataset: 'tls', of: 'application', where: { internet_facing: 'yes' } },
    { dataset: 'mfa', of: 'application', key: 'application_id' },
  ],
};
const WATCH = { tls: { history: 'h.json', pattern: 'none' }, mfa: { history: 'm.json', pattern: 'none' }, posture: { history: 'p.json', pattern: 'none' } };
const flow = (o: { nb?: string; ontology?: Ontology; watch?: Partial<typeof WATCH> } = {}): FlowDocument =>
  ({
    smaltfl: 4, id: 'tied', name: 'Tied', steps: [],
    parameters: [{ name: 'day', type: 'text', default: '2024-03-01' }],
    sources: [{ id: 'apps', table: 'apps_file' }, { id: 'tls', table: 'tls_file' }, { id: 'mfa', table: 'mfa_file' }],
    notebooks: [{ path: 'a.nb.ts', source: o.nb ?? nb() }],
    ontology: o.ontology ?? ONTOLOGY,
    publish: { hold: ['wrong'], period: 'day', watch: o.watch ?? WATCH },
  }) as FlowDocument;
const doc = (o: Parameters<typeof flow>[0] = {}) => expandNotebooks(flow(o), ts);
const watches = async (d: FlowDocument) => {
  const plan = await translate(d, { day: '2024-03-01' });
  validatePlan(plan);
  return Object.fromEntries((plan.publish as unknown as { watch: [number, Record<string, unknown>][] }).watch.map(([n, w]) => [plan.nodes[n]!.origin, w]));
};

describe('the declaration', () => {
  it('gives a dataset’s entry with its object type resolved: the key on both sides and the condition in order', () => {
    const tls = rowsOf(ONTOLOGY, 'TLS')!;
    expect(tls.type).toEqual(APPLICATION);
    expect(tls).toMatchObject({ key: 'app_id', own: 'app_id', where: [['internet_facing', ['yes']]] });
    // The dataset's own name for the key, and no condition: every object.
    expect(rowsOf(ONTOLOGY, 'mfa')).toMatchObject({ key: 'app_id', own: 'application_id', where: [] });
    // No entry, no ontology, an entry naming a type that isn't there: nothing.
    expect(rowsOf(ONTOLOGY, 'posture')).toBeUndefined();
    expect(rowsOf(undefined, 'tls')).toBeUndefined();
    expect(rowsOf({ ...ONTOLOGY, objectTypes: [] }, 'tls')).toBeUndefined();
    // A type whose key is several columns has no one key column to count by.
    expect(rowsOf({ ...ONTOLOGY, objectTypes: [{ ...APPLICATION, key: ['app_id', 'region'] }] }, 'tls')).toMatchObject({ key: null, own: null });
  });

  it('keeps a condition in one order however it is written: by column, each column’s values sorted, each once', () => {
    expect(conditionOf({ internet_facing: 'yes', criticality: ['high', 'critical', 'high'] })).toEqual([['criticality', ['critical', 'high']], ['internet_facing', ['yes']]]);
    expect(conditionOf(undefined)).toEqual([]);
  });

  it('names an object type’s own dataset by the type, as before; a dataset tied to it keeps its own noun', () => {
    expect(nounOf(ONTOLOGY, 'apps')).toEqual({ one: 'application', many: 'applications' });
    expect(nounOf(ONTOLOGY, 'tls')).toEqual({ one: 'row', many: 'rows' });
  });
});

describe('what the document refuses', () => {
  const problems = async (ontology: unknown, notebook?: string) => validateDocument(await doc({ ontology: ontology as Ontology, ...(notebook ? { nb: notebook } : {}) }));
  const withRows = (rows: unknown) => ({ ...ONTOLOGY, rows });

  it('takes an entry that names a dataset of the flow and an object type that exists', async () => {
    expect(await problems(ONTOLOGY)).toEqual([]);
    // A step may be tied too: its rows are one each of the type as a file's are.
    expect(await problems(withRows([{ dataset: 'posture', of: 'application' }]))).toEqual([]);
  });

  it('takes an entry on a dataset nothing watches, and gives it no rule: only a watched node’s reach the plan', async () => {
    // The inventory itself, which no watch judges: what its rows are is said, and nothing counts them.
    const rows = [...ONTOLOGY.rows!, { dataset: 'apps', of: 'application' }];
    expect(await problems(withRows(rows))).toEqual([]);
    const w = await watches(await doc({ ontology: { ...ONTOLOGY, rows } }));
    expect(Object.keys(w).sort()).toEqual(['mfa', 'posture', 'tls']);
    expect(w).toEqual(await watches(await doc()));
    // A flow run with no publish block (as a step's history is built) keeps its entries, and is still a valid document.
    const bare = await doc();
    delete bare.publish;
    expect(validateDocument(bare)).toEqual([]);
  });

  it('refuses a dataset or a type that isn’t there, a dataset tied twice, and a type whose objects are a step', async () => {
    expect(await problems(withRows([{ dataset: 'dns', of: 'application' }]))).toEqual([{ path: '$.ontology.rows[0].dataset', message: 'no source or step dns' }]);
    expect(await problems(withRows([{ dataset: 'tls', of: 'server' }]))).toEqual([{ path: '$.ontology.rows[0].of', message: 'no object type server' }]);
    expect(await problems(withRows([{ dataset: 'tls', of: 'application' }, { dataset: 'TLS', of: 'application' }]))).toEqual([{ path: '$.ontology.rows[1].dataset', message: 'TLS has two entries (ids are compared without case): a dataset’s rows are one thing' }]);
    expect(await problems({ ...ONTOLOGY, objectTypes: [{ ...APPLICATION, dataset: 'posture' }] })).toEqual([
      { path: '$.ontology.rows[0].of', message: "application's objects are posture, a step: a dataset’s rows are counted against a type whose objects are a source, which is there before the run" },
      { path: '$.ontology.rows[1].of', message: "application's objects are posture, a step: a dataset’s rows are counted against a type whose objects are a source, which is there before the run" },
    ]);
  });

  it('refuses an unknown key by name, and a condition that isn’t { column: value | values }', async () => {
    expect(await problems(withRows([{ dataset: 'tls', of: 'application', only: { internet_facing: 'yes' } }]))).toEqual([{ path: '$.ontology.rows[0].only', message: "only isn't a rows entry's setting (dataset, of, key, where): refused rather than ignored" }]);
    const where = '{ column: value | values } over the type’s dataset: every column to hold, a list any of its values (each once); left out, every object';
    for (const bad of [{}, "internet_facing = 'yes'", ['internet_facing'], { internet_facing: true }, { internet_facing: [] }, { internet_facing: ['yes', 'yes'] }, { criticality: ['high', 3] }, { internet_facing: '' }])
      expect(await problems(withRows([{ dataset: 'tls', of: 'application', where: bad }])), JSON.stringify(bad)).toEqual([{ path: '$.ontology.rows[0].where', message: where }]);
    expect(await problems(withRows([{ dataset: 'tls', of: 'application', key: '' }]))).toEqual([{ path: '$.ontology.rows[0].key', message: 'this dataset’s own name for the type’s key column' }]);
    expect(await problems(withRows([{ dataset: 'tls' }]))).toEqual([{ path: '$.ontology.rows[0]', message: '{ dataset, of, key?, where? }: a source or step, the object type its rows are one each of, its own name for the type’s key, and the condition an object meets' }]);
    expect(await problems(withRows({ tls: { of: 'application' } }))).toEqual([{ path: '$.ontology.rows', message: 'a list of { dataset, of, key?, where? }: what each dataset’s rows are' }]);
  });

  it('refuses a type whose key isn’t column names, an own name for a key of several columns, and one column said twice', async () => {
    // The plan would carry a key the engine can't read ([5]), or an empty name (['']).
    for (const key of [[5], [''], [], ['app_id', 7]])
      expect(await problems({ ...ONTOLOGY, objectTypes: [{ ...APPLICATION, key }], rows: [{ dataset: 'tls', of: 'application' }] }), JSON.stringify(key)).toEqual([{ path: '$.ontology.rows[0].of', message: 'application’s key isn’t a list of column names: a dataset’s rows are counted by the type’s key column' }]);
    // A key of several columns gives no rule yet: the entry is taken, its own name for the key is not (it would go unused).
    expect(await problems({ ...ONTOLOGY, objectTypes: [{ ...APPLICATION, key: ['app_id', 'region'] }] })).toEqual([{ path: '$.ontology.rows[1].key', message: 'application’s key is several columns (app_id, region), which gives no rule yet: a name for it here would go unused' }]);
    // The engine reads a column's name without case, so these two ask one column to be yes and no: nothing would be in scope.
    expect(await problems(withRows([{ dataset: 'tls', of: 'application', where: { Internet_Facing: 'yes', internet_facing: 'no' } }]))).toEqual([{ path: '$.ontology.rows[0].where', message: 'Internet_Facing and internet_facing are one column (columns are compared without case): a column’s values are said once' }]);
  });

  it('refuses it in a flow with no gate, as a band or a due mark is: it is a gate’s written check', async () => {
    expect(await problems(ONTOLOGY, nb(''))).toEqual([{ path: '$.ontology.rows', message: 'what a dataset’s rows are is a gate’s written check (ADR 0015): the flow has no gate' }]);
  });
});

describe('the rules an entry gives a watched node', () => {
  it('derives the scope and the key from the ontology where the gate cell writes none, and carries them in plan/4 as it always carried them', async () => {
    const d = await doc();
    expect(validateDocument(d)).toEqual([]);
    expect(d.gates).toEqual({ tls: { layer: 'bronze', checks: {} } });
    expect(writtenRules(d, 'tls')).toEqual({
      scope: { from: 'ontology', of: 'apps', key: 'app_id', own: 'app_id', match: [['internet_facing', ['yes']]], type: 'application' },
      needs: [],
      reconcile: { key: ['app_id'], from: 'ontology' },
    });
    const w = await watches(d);
    // The plan's scope is the four fields it was: the condition is the text the emitter wrote for it.
    expect(w.tls!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: `"internet_facing" IN ('yes')` });
    expect(w.tls!.reconcile).toEqual({ key: ['app_id'], table: null });
    // No condition is every object; the dataset's own name for the key is the one counted on its side.
    expect(w.mfa!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'application_id', where: '1 = 1' });
    expect(w.mfa!.reconcile).toEqual({ key: ['application_id'], table: null });
    // A node with no entry and no rule counts nothing, as before.
    expect(w.posture!.scope).toBeNull();
    expect(w.posture!.reconcile).toBeNull();
    expect(writtenRules(d, 'posture')).toEqual({ scope: null, needs: [], reconcile: null });
  });

  it('holds a bronze file to its key by default; silver’s default is as it was', async () => {
    expect(LAYER_DEFAULTS.bronze.reconcile).toBe('hold');
    expect(LAYER_DEFAULTS.silver.reconcile).toBe('off');
    expect(LAYER_DEFAULTS.gold.reconcile).toBe('hold');
    const w = await watches(await doc());
    expect((w.tls!.checks as Record<string, string>).reconcile).toBe('hold');
    expect((w.mfa!.checks as Record<string, string>).reconcile).toBe('hold');
    expect((w.posture!.checks as Record<string, string>).reconcile).toBe('off');
  });

  it('lets a rule written in the gate cell win, each kind on its own', async () => {
    const scoped = await doc({ nb: nb("cell('tls_gate');\nexport const tls_gate = gate(tls, { scope: { of: apps, key: 'app_id', where: \"internet_facing = 'yes' AND lifecycle = 'active'\" } });\n") });
    expect(writtenRules(scoped, 'tls').scope).toEqual({ from: 'gate', of: 'apps', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes' AND lifecycle = 'active'" });
    const w = await watches(scoped);
    expect(w.tls!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes' AND lifecycle = 'active'" });
    // The cell wrote no key: the ontology's still holds the file to one row an object.
    expect(w.tls!.reconcile).toEqual({ key: ['app_id'], table: null });
    const keyed = await doc({ nb: nb("cell('tls_gate');\nexport const tls_gate = gate(tls, { reconcile: { key: ['app_id', 'hostname'], of: apps } });\n") });
    expect(writtenRules(keyed, 'tls').reconcile).toEqual({ key: ['app_id', 'hostname'], of: 'apps', from: 'gate' });
    const k = await watches(keyed);
    expect(k.tls!.reconcile).toEqual({ key: ['app_id', 'hostname'], table: 'apps_file' });
    expect(k.tls!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: `"internet_facing" IN ('yes')` });
  });

  it('gives no rule for a type whose key is several columns', async () => {
    // Moved on purpose with the review of slice 1: this document carried MFA's own name for the key
    // (`key: 'application_id'`) and was valid; such a name is refused now (above), so the entries here have none.
    const d = await doc({ ontology: { ...ONTOLOGY, objectTypes: [{ ...APPLICATION, key: ['app_id', 'region'] }], rows: [{ dataset: 'tls', of: 'application', where: { internet_facing: 'yes' } }, { dataset: 'mfa', of: 'application' }] } });
    expect(validateDocument(d)).toEqual([]);
    expect(writtenRules(d, 'tls')).toEqual({ scope: null, needs: [], reconcile: null });
    const w = await watches(d);
    expect(w.tls!.scope).toBeNull();
    expect(w.tls!.reconcile).toBeNull();
  });

  it('writes the same plan for the same condition however it is ordered', async () => {
    const a = await watches(await doc({ ontology: { ...ONTOLOGY, rows: [{ dataset: 'tls', of: 'application', where: { internet_facing: 'yes', criticality: ['critical', 'high'] } }] } }));
    const b = await watches(await doc({ ontology: { ...ONTOLOGY, rows: [{ dataset: 'tls', of: 'application', where: { criticality: ['high', 'critical'], internet_facing: 'yes' } }] } }));
    expect(a.tls!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: `"criticality" IN ('critical', 'high') AND "internet_facing" IN ('yes')` });
    expect(b.tls!.scope).toEqual(a.tls!.scope);
  });

  it('gives the judge the key the plan counts, so a count is said with its column', async () => {
    const d = await doc();
    expect(judgeOf(d, 'tls').reconcile).toEqual({ key: ['app_id'] });
    expect(judgeOf(d, 'mfa').reconcile).toEqual({ key: ['application_id'] });
    expect(judgeOf(d, 'posture').reconcile).toBeNull();
    expect(judgeOf(d, 'tls').checks).toEqual(LAYER_DEFAULTS.bronze);
    // The scope's own key column too: with the key's it says whether the two rules read one column.
    expect(judgeOf(d, 'tls').scopeKey).toBe('app_id');
    expect(judgeOf(d, 'mfa').scopeKey).toBe('application_id');
    expect(judgeOf(d, 'posture').scopeKey).toBeNull();
  });

  it('gives a tied watched step the same two rules: its scope holds at silver, its key is counted and off unless its gate says', async () => {
    const tied = { ...ONTOLOGY, rows: [...ONTOLOGY.rows!, { dataset: 'posture', of: 'application', where: { internet_facing: 'yes' } }] };
    const d = await doc({ ontology: tied });
    expect(writtenRules(d, 'posture')).toEqual({
      scope: { from: 'ontology', of: 'apps', key: 'app_id', own: 'app_id', match: [['internet_facing', ['yes']]], type: 'application' },
      needs: [],
      reconcile: { key: ['app_id'], from: 'ontology' },
    });
    const w = await watches(d);
    expect(w.posture!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: `"internet_facing" IN ('yes')` });
    expect(w.posture!.reconcile).toEqual({ key: ['app_id'], table: null });
    expect(w.posture!.checks).toMatchObject({ scope: 'hold', reconcile: 'off' });
    expect(judgeOf(d, 'posture')).toMatchObject({ reconcile: { key: ['app_id'] }, scopeKey: 'app_id' });
    // Its gate cell turns the key on, as any check.
    const keyed = await doc({ ontology: tied, nb: nb(TLS_GATE, POSTURE_GATE) });
    expect((await watches(keyed)).posture!.checks).toMatchObject({ scope: 'hold', reconcile: 'hold' });
  });

  it('keeps a dependency’s conditions in the same one order: by column, each column’s values sorted, each once', async () => {
    const needy = await doc({ nb: nb(TLS_GATE, "cell('posture_gate');\nexport const posture_gate = gate(posture, { layer: 'silver', needs: [{ when: { tls: ['pass', 'fail', 'pass'], app_id: 'a1' }, then: { tls: 'pass' } }] });\n") });
    expect((await watches(needy)).posture!.needs).toEqual([{ table: null, key: null, when: [['app_id', ['a1']], ['tls', ['fail', 'pass']]], then: [['tls', ['pass']]] }]);
  });
});

describe('the condition in the engine', () => {
  it('is written by the emitter: each column one of its values, every column to hold, text as literals', () => {
    expect(emitMatch([['internet_facing', ['yes']]])).toBe(`"internet_facing" IN ('yes')`);
    expect(emitMatch([['criticality', ['critical', 'high']], ['internet_facing', ['yes']]])).toBe(`"criticality" IN ('critical', 'high') AND "internet_facing" IN ('yes')`);
    expect(emitMatch([['owner', ["O'Brien"]]], 'f')).toBe(`f."owner" IN ('O''Brien')`);
    expect(emitMatch([['a "b"', ['x']]])).toBe(`"a ""b""" IN ('x')`);
    expect(emitMatch([])).toBe('1 = 1');
  });

  it('counts rows out of scope and objects in scope with no row by it; a blank value is never in scope', () => {
    const db = openEngine();
    try {
      db.exec("CREATE TABLE apps_file(app_id TEXT, internet_facing TEXT, criticality TEXT, owner TEXT)");
      db.exec("INSERT INTO apps_file VALUES ('a1','yes','critical','O''Brien'),('a2','yes','high','Lee'),('a3','no','critical','Lee'),('a4','yes','standard','Lee'),('a5',NULL,'critical','Lee'),('a6','yes',NULL,'Lee')");
      db.exec("CREATE TABLE tls_file(app_id TEXT, status TEXT); INSERT INTO tls_file VALUES ('a1','pass'),('a2','fail'),('a3','pass'),('zz','pass')");
      const counts = (where: Parameters<typeof conditionOf>[0]) => db.query(emitScopeCounts('SELECT * FROM tls_file', { table: 'apps_file', key: 'app_id', own: 'app_id', where: emitMatch(conditionOf(where)) })).rows[0]!.map(Number);
      // Internet-facing: a1, a2, a4, a6. a3 and zz have rows and aren't in scope; a4 and a6 have none.
      expect(counts({ internet_facing: 'yes' })).toEqual([2, 2, 4]);
      // And critical or high: a1 and a2 (a6's criticality is blank, so it is never in scope).
      expect(counts({ internet_facing: 'yes', criticality: ['critical', 'high'] })).toEqual([2, 0, 2]);
      // Every object: only zz, which the inventory doesn't have, is out; a4, a5 and a6 have no row.
      expect(counts(undefined)).toEqual([1, 3, 6]);
      // A value with a quote in it is a literal, not SQL.
      expect(counts({ owner: "O'Brien" })).toEqual([3, 0, 1]);
      expect(counts({ owner: "x' OR '1'='1" })).toEqual([4, 0, 0]);
    } finally {
      db.close();
    }
  });

  it('measures a load by the rules the plan carries: the scope’s counts and the key’s, beside every other measure', async () => {
    const db = openEngine();
    try {
      db.exec("CREATE TABLE apps_file(app_id TEXT, internet_facing TEXT); INSERT INTO apps_file VALUES ('a1','yes'),('a2','yes'),('a3','no'),('a4','yes')");
      db.exec("CREATE TABLE tls_file(app_id TEXT, status TEXT); INSERT INTO tls_file VALUES ('a1','pass'),('a2','fail'),('a2','fail'),('a3','pass'),(NULL,'pass')");
      db.exec("CREATE TABLE mfa_file(application_id TEXT, status TEXT); INSERT INTO mfa_file VALUES ('a1','pass'),('a2','pass'),('a3','pass'),('a4','pass')");
      const d = await doc();
      const plan = await translate(d, { day: '2024-03-01' });
      const measure = (id: string) => measureLoad(db, `${id}_file`, settingsFor(plan, plan.nodes.findIndex((n) => n.origin === id), null, d.steps)!);
      // TLS: a3 isn't internet-facing and a blank key is nowhere (two out); a4 has no row; a2 is on two rows.
      expect((await measure('tls')).gate).toEqual({ scope: { out: 2, missing: 1, inScope: 3 }, reconcile: { rows: 5, keys: 3, blank: 1, missing: 0, extra: 0 } });
      // MFA, by its own name for the key, over every application: one row each.
      expect((await measure('mfa')).gate).toEqual({ scope: { out: 0, missing: 0, inScope: 4 }, reconcile: { rows: 4, keys: 4, blank: 0, missing: 0, extra: 0 } });
    } finally {
      db.close();
    }
  });
});

describe('a tied watched step, run in the engine', () => {
  /** A run of the flow with the step alone watched and its key on by its gate cell, on a fresh engine. */
  const run = async (rows: RowsDef[], tls: string) => {
    const db = openEngine();
    try {
      db.exec("CREATE TABLE apps_file(app_id TEXT, internet_facing TEXT); INSERT INTO apps_file VALUES ('a1','yes'),('a2','yes'),('a3','no'),('a4','no'),('a5','no'),('a6','no'),('a7','no'),('a8','yes')");
      db.exec(`CREATE TABLE tls_file(app_id TEXT, status TEXT); INSERT INTO tls_file VALUES ${tls}`);
      db.exec('CREATE TABLE mfa_file(application_id TEXT, status TEXT)');
      const d = await doc({ ontology: { ...ONTOLOGY, rows }, nb: nb(TLS_GATE, POSTURE_GATE), watch: { posture: WATCH.posture } });
      expect(validateDocument(d)).toEqual([]);
      // The step's load exists only once the run has built it: the run measures it by the plan's rules and tells its
      // claim in the engine (src/plugin/tell.ts), from what the page says of the record.
      return await runFlow(db, d, { smaltdb: SMALTDB, parameters: { day: '2024-03-01' }, tell: { posture: { skip: [], levels: [] } } });
    } finally {
      db.close();
    }
  };
  const TLS = "('a1','pass'),('a2','fail'),('a8','pass')";

  it('publishes where the step has one row for each object in scope, and no other', async () => {
    const r = await run([{ dataset: 'posture', of: 'application' }], TLS);
    expect(r.holds).toEqual([]);
    expect(r.published).toEqual(['posture']);
  });

  it('holds on its rows out of scope, counted against the inventory over the dataset the run built', async () => {
    // The step has a row for each of the eight applications; five aren't internet-facing.
    const r = await run([{ dataset: 'posture', of: 'application', where: { internet_facing: 'yes' } }], TLS);
    expect(r.holds).toHaveLength(1);
    expect(r.holds[0]).toMatchObject({ by: 'story', origin: 'posture', said: '5 rows out of scope', reaches: ['posture'] });
    expect(r.published).toEqual([]);
    expect(r.waiting).toEqual(['posture']);
  });

  it('holds on its key where its gate cell turns the key on: a row of a source twice is an object on two rows', async () => {
    const r = await run([{ dataset: 'posture', of: 'application' }], `${TLS},('a1','pass')`);
    expect(r.holds).toHaveLength(1);
    expect(r.holds[0]).toMatchObject({ by: 'story', origin: 'posture', said: '1 row repeats a key' });
    expect(r.waiting).toEqual(['posture']);
  });
});

/** A day's measures of a two-column file: its rows, the scope's counts and the key's (`blank`: rows with no key). */
function load(day: string, o: { rows: number; keys?: number; blank?: number; out?: number; missing?: number; inScope?: number }): Measures {
  const s: MeasureSettings = { source: 'tls', slot: day, every: 'day', checks: null, counting: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, scope: { table: 'apps_file', key: 'app_id', own: 'app_id', where: `"internet_facing" IN ('yes')` }, reconcile: { key: ['app_id'], table: null } };
  const scan: unknown[][] = Array.from({ length: o.rows }, (_, i) => [i % 20 === 0 ? 'fail' : 'pass']);
  const facts: unknown[] = [o.rows, o.rows, o.keys ?? o.rows, null, null, null, o.rows, o.rows ? 2 : 0, null, null, null];
  return measuresOf(s, { file: null, snapshot: 'x', schema: [['app_id', 'text'], ['status', 'text']], facts, sample: [], scan, checks: null, scope: [o.out ?? 0, o.missing ?? 0, o.inScope ?? 200], reconcile: [o.rows, o.keys ?? o.rows, o.blank ?? 0, 0, 0] });
}

describe('the story’s lead where the amount and a rule say the same thing', () => {
  const names = { ...vendorNames, noun: (n?: number) => (n === 1 ? 'app' : 'apps') };
  // Bronze's defaults, the forest off: these made-up days are the same day forty times, which gives it nothing to tell
  // a day apart by.
  const judge = { ...LEGACY_JUDGE, legacy: false, scale: 'volume' as const, pattern: 'none' as const, checks: { ...LAYER_DEFAULTS.bronze, forest: 'off' as const }, reconcile: { key: ['app_id'] } };
  /** Forty calm days of 200 rows, one an object in scope, then the day given. */
  const history = (last: Parameters<typeof load>[1]) => {
    const first = load('2024-01-01', { rows: 200 });
    const start = emptyHistory({ flow: 'tied', source: 'tls', settings: { checks: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, scope: { table: 'apps_file', key: 'app_id', own: 'app_id', where: `"internet_facing" IN ('yes')` }, reconcile: { key: ['app_id'], table: null } }, columns: first.columns, types: first.types, kinds: first.kinds, warmup: 3 });
    const ms: Measures[] = [];
    for (let i = 0; i < 40; i++) ms.push(load(plusDays('2024-01-01', i), { rows: 200 }));
    const day = plusDays('2024-01-01', 40);
    ms.push(load(day, last));
    return { h: new HistoryRanges(appendPeriods(start, ms), { pattern: 'none' }), day };
  };

  it('says nothing of either rule on a calm day', () => {
    const { h, day } = history({ rows: 200 });
    const found = newsOf(h, day, names, { judge });
    expect(found.filter((f) => f.kind === 'scope' || f.kind === 'reconcile')).toEqual([]);
    expect(storyOf(h, day, found, { names, judge }).state).toBe('calm');
  });

  it('leads an all but empty file with the amount; the objects in scope with no row follow from it', () => {
    const { h, day } = history({ rows: 0, missing: 200 });
    const found = newsOf(h, day, names, { judge });
    expect(found.find((f) => f.key === 'scope:missing')).toMatchObject({ severity: 'alert', title: '200 in scope with no app', check: 'scope' });
    const s = storyOf(h, day, found, { names, judge });
    expect(s.head).toBe('Almost no apps: 0');
    expect(s.hero).toBe('amount');
    expect(s.state).toBe('wrong');
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'cause' });
    expect(s.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'follows', because: 'volume', was: 'alert' });
    // With the amount marked as expected the missing objects are the day's own news again.
    const acked = storyOf(h, day, found, { names, judge, acknowledged: new Set(['volume']) });
    expect(acked.head).toBe('200 in scope with no app');
    expect(acked.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'standalone' });
  });

  it('still leads with the scope where the file is short and not all but empty, and with rows out of scope on an empty day', () => {
    const short = history({ rows: 150, missing: 50 });
    const s = storyOf(short.h, short.day, newsOf(short.h, short.day, names, { judge }), { names, judge });
    expect(s.head).toBe('50 in scope with no app');
    expect(s.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'standalone' });
    // Ten rows, every one for an object out of scope: the amount doesn't explain those.
    const stray = history({ rows: 10, out: 10, missing: 200 });
    const t = storyOf(stray.h, stray.day, newsOf(stray.h, stray.day, names, { judge }), { names, judge });
    expect(t.head).toBe('10 apps out of scope');
    expect(t.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'follows', because: 'volume' });
  });

  it('keeps a step’s written rule its own where a source upstream explains its amount', () => {
    const { h, day } = history({ rows: 0, missing: 200 });
    const silver = { ...judge, checks: LAYER_DEFAULTS.silver };
    const s = storyOf(h, day, newsOf(h, day, names, { judge: silver }), { names, judge: silver, upstream: [{ source: 'apps', state: 'wrong', head: 'Almost no applications: 0' }] });
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'follows', because: 'upstream:apps' });
    expect(s.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'standalone' });
    expect(s.head).toBe('200 in scope with no app');
  });

  it('leads a file with its rows twice by the key; the amount follows from it', () => {
    const { h, day } = history({ rows: 400, keys: 200 });
    const found = newsOf(h, day, names, { judge });
    expect(found.find((f) => f.key === 'reconcile:repeats')).toMatchObject({ severity: 'alert', title: '200 apps repeat a key', check: 'reconcile' });
    expect(found.find((f) => f.key === 'reconcile:repeats')!.detail).toBe('400 rows for 200 app_id values: 2 rows a key, where one is expected.');
    expect(found.find((f) => f.kind === 'volume')).toMatchObject({ severity: 'alert', title: 'More apps: 400 (+100%)' });
    const s = storyOf(h, day, found, { names, judge });
    expect(s.head).toBe('200 apps repeat a key');
    expect(s.hero).toBe('finding');
    expect(s.state).toBe('wrong');
    expect(s.findings.find((f) => f.key === 'reconcile:repeats')).toMatchObject({ tier: 'standalone', severity: 'alert' });
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'follows', because: 'reconcile:repeats', was: 'alert' });
    // Moved with the lead, on purpose: a file with its rows twice is not a new level, so the day can't be accepted as
    // one. It could while the amount led (the same day with the key off, below).
    expect(acceptable(s, null, [{ by: 'story' }])).toBe(false);
    const off = { ...judge, checks: { ...judge.checks, reconcile: 'off' as const } };
    expect(acceptable(storyOf(h, day, newsOf(h, day, names, { judge: off }), { names, judge: off }), null, [{ by: 'story' }])).toBe(true);
  });

  it('lets a repeated key explain only the rise its rows are: a few in a file far over its range leave the amount as it was told', () => {
    // A thousand rows where two hundred are usual, five of them a key again: the key still leads (it is exact), and
    // the 795 rows it doesn't account for aren't told as following from it.
    const big = history({ rows: 1000, keys: 995 });
    const s = storyOf(big.h, big.day, newsOf(big.h, big.day, names, { judge }), { names, judge });
    expect(s.head).toBe('5 apps repeat a key');
    expect(s.findings.find((f) => f.kind === 'volume')).toMatchObject({ title: 'More apps: 1,000 (+400%)', tier: 'absorbed', because: 'volume', was: 'alert' });
    // One repeated row doesn't explain twenty-eight more, and one row "repeats".
    const one = history({ rows: 228, keys: 227 });
    const t = storyOf(one.h, one.day, newsOf(one.h, one.day, names, { judge }), { names, judge });
    expect(t.head).toBe('1 app repeats a key');
    expect(t.findings.find((f) => f.kind === 'volume')).toMatchObject({ title: 'More apps: 228 (+14%)', tier: 'absorbed', because: 'volume' });
    // Twenty-eight rows a second time, and nothing else: the rows left are the usual two hundred, so the key explains it.
    const part = history({ rows: 228, keys: 200 });
    const u = storyOf(part.h, part.day, newsOf(part.h, part.day, names, { judge }), { names, judge });
    expect(u.head).toBe('28 apps repeat a key');
    expect(u.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'follows', because: 'reconcile:repeats' });
  });

  it('leads rows with no key by the key, where the scope reads the same column: they are the rows out of scope, counted once', () => {
    // Ten rows lost their key: out of scope (no key is in no inventory), with no key, and their ten objects have no row.
    const tied = { ...judge, scopeKey: 'app_id' };
    const { h, day } = history({ rows: 200, keys: 190, blank: 10, out: 10, missing: 10 });
    const found = newsOf(h, day, names, { judge: tied });
    expect(found.find((f) => f.key === 'scope:out')).toMatchObject({ severity: 'alert', title: '10 apps out of scope' });
    expect(found.find((f) => f.key === 'reconcile:blank')).toMatchObject({ severity: 'alert', title: '10 apps with no app_id' });
    const s = storyOf(h, day, found, { names, judge: tied });
    expect(s.head).toBe('10 apps with no app_id');
    expect(s.findings.find((f) => f.key === 'reconcile:blank')).toMatchObject({ tier: 'standalone', severity: 'alert' });
    expect(s.findings.find((f) => f.key === 'scope:out')).toMatchObject({ tier: 'follows', because: 'reconcile:blank', was: 'alert' });
    // The objects left with no row are still said, after the key: as many, and the key's count is the exact one.
    expect(s.findings.find((f) => f.key === 'scope:missing')).toMatchObject({ tier: 'standalone', title: '10 in scope with no app' });
    // Two more rows for objects out of scope: the scope's count is more than the rows with no key, and leads.
    const more = history({ rows: 202, keys: 192, blank: 10, out: 12, missing: 10 });
    const t = storyOf(more.h, more.day, newsOf(more.h, more.day, names, { judge: tied }), { names, judge: tied });
    expect(t.head).toBe('12 apps out of scope');
    expect(t.findings.find((f) => f.key === 'scope:out')).toMatchObject({ tier: 'standalone' });
    // A scope that reads another column than the key (a gate cell's own): equal counts are two things, and both stand.
    const other = { ...judge, scopeKey: 'hostname' };
    const v = storyOf(h, day, newsOf(h, day, names, { judge: other }), { names, judge: other });
    expect(v.findings.find((f) => f.key === 'scope:out')).toMatchObject({ tier: 'standalone', severity: 'alert' });
  });

  it('doesn’t let a repeated key explain an amount that fell, and says nothing of the key where the gate turns it off', () => {
    const { h, day } = history({ rows: 100, keys: 90, missing: 110 });
    const s = storyOf(h, day, newsOf(h, day, names, { judge }), { names, judge });
    expect(s.findings.find((f) => f.kind === 'volume')!.because).not.toBe('reconcile:repeats');
    const doubled = history({ rows: 400, keys: 200 });
    const off = { ...judge, checks: { ...judge.checks, reconcile: 'off' as const } };
    const found = newsOf(doubled.h, doubled.day, names, { judge: off });
    expect(found.some((f) => f.kind === 'reconcile')).toBe(false);
    expect(storyOf(doubled.h, doubled.day, found, { names, judge: off }).head).toBe('More apps: 400 (+100%)');
  });
});
