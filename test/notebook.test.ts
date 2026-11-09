/**
 * Notebooks as the step surface (ADR 0011, slice 2): a format-4 document's steps derived from its smaltnb notebooks
 * (src/core/notebook.ts), the sign-ins example in that form (examples/security-signins/) against its JSON form, plan/3
 * and its vector, and what the translator refuses.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../src/plugin/index.js';
import { canonicalJSON } from '../src/core/canonical.js';
import { documentFormat, validateDocument, type FlowDocument, type StepDef } from '../src/core/document.js';
import { utf8 } from '../src/core/hash.js';
import { planHash, planKind } from '../src/core/manifest.js';
import { expandNotebooks, loadNotebooks, stepsOfNotebooks } from '../src/core/notebook.js';
import { flowHash, translate, validatePlan } from '../src/core/plan.js';
import { pinFile, runFlow } from '../src/index.js';
import { pinnedDdl, type DataBindings } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';
import { loadFlowDir, signinsDir, ts } from './helpers/notebooks.js';
import { csvOf, PLANTED, securityDays, securityRows } from './fixtures/security.js';

const jsonDoc = (): FlowDocument => JSON.parse(readFileSync(new URL('../examples/security-signins.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
const data = JSON.parse(readFileSync(new URL('../examples/security-signins.data.json', import.meta.url), 'utf8')) as DataBindings;

/** A format-4 document over one source, from the notebooks given by path. */
const flow = (notebooks: Record<string, string>, extra: Partial<FlowDocument> = {}): FlowDocument =>
  ({
    smaltfl: 4,
    id: 'nb',
    name: 'Notebooks',
    parameters: [{ name: 'day', type: 'text', default: '2024-01-02' }],
    sources: [{ id: 'auth', table: 'auth_file' }],
    notebooks: Object.entries(notebooks).map(([path, source]) => ({ path, source })),
    ...extra,
  }) as FlowDocument;

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, publish, source } from 'smaltfl/notebook';\n";

describe('the sign-ins example as notebooks (ADR 0011 §1, §5)', () => {
  it('derives the JSON example\'s steps from its two notebooks, the exports as datasets', async () => {
    const doc = await loadFlowDir(signinsDir);
    expect(doc.smaltfl).toBe(4);
    expect(documentFormat(doc)).toBe(4);
    expect(validateDocument(doc)).toEqual([]);
    const brief = doc.steps.map((s) => [s.id, s.kind, s.inputs, s.dataset?.description]);
    expect(doc.steps.map((s) => s.description)).toEqual(['Sign-ins with a known result, on the day', 'Sign-ins by hour and result', 'Failed and locked-out sign-ins by country and client']);
    expect(brief).toEqual([
      ['auth_valid', 'expectations', ['auth'], 'Checked sign-ins'],
      ['signins_by_hour', 'sql', ['auth_valid'], 'Sign-ins by hour'],
      ['failures_by_country', 'sql', ['auth_valid'], 'Failures by country'],
    ]);
    const json = jsonDoc();
    const checks = json.steps[0] as Extract<StepDef, { kind: 'expectations' }>;
    expect(doc.steps[0]).toMatchObject({ rules: checks.rules, maxDropped: checks.maxDropped });
    // Everything but the format is the JSON example's: the steps too, where the JSON's visual steps are SQL here.
    const { notebooks: _n, smaltfl: _f, ...rest } = doc;
    const { smaltfl: _jf, ...jrest } = json;
    expect({ ...rest, steps: rest.steps.map((s) => (s.kind === 'sql' ? { ...s, sql: '' } : s)) }).toEqual({ ...jrest, steps: jrest.steps.map((s) => (s.kind === 'aggregate' ? { kind: 'sql', id: s.id, inputs: s.inputs, sql: '', description: s.description, dataset: s.dataset } : s)) });
  });

  it('translates to plan/3: the expect node and the publish block the JSON example has, the aggregates as SQL', async () => {
    const doc = await loadFlowDir(signinsDir);
    const plan = await translate(doc, { day: PLANTED.burst });
    const other = await translate(jsonDoc(), { day: PLANTED.burst });
    expect(plan.smaltflPlan).toBe(3);
    expect(planKind(plan)).toBe('plan/3');
    expect(() => validatePlan(plan)).not.toThrow();
    expect(plan.nodes[1]).toEqual(other.nodes[1]);
    expect(plan.nodes.slice(2).map((n) => n.op)).toEqual(['sql', 'sql']);
    expect(plan.publish).toEqual(other.publish);
    expect(plan.outputs.map((o) => o.name)).toEqual(other.outputs.map((o) => o.name));
    // A plan/3 hash is not a plan/2 hash of the same bytes.
    expect(await planHash(plan)).not.toBe(await planHash({ ...plan, smaltflPlan: 2 }));
  });

  it('runs to the same rows as the JSON example on a generated day', async () => {
    const day = securityDays().find((p) => p.day === '2024-03-11')!;
    const outputs = async (doc: FlowDocument) => {
      const db = Database.openMemory({ plugins: [io, external, smaltfl] });
      try {
        const b = data.sources.auth!;
        await pinFile(db, b.file, utf8(csvOf(securityRows(day, 0.01))));
        await db.execAsync(pinnedDdl(b));
        const { publish: _p, ...publishing } = doc;
        const result = await runFlow(db, publishing as FlowDocument, { smaltdb: SMALTDB, parameters: { day: day.day } });
        expect(result.published.sort()).toEqual(['auth_valid', 'failures_by_country', 'signins_by_hour']);
        const rows = (name: string) => db.query(`SELECT * FROM ${name}`).rows.map((r) => JSON.stringify(r)).sort();
        return { valid: rows('auth_valid'), hour: rows('signins_by_hour'), country: rows('failures_by_country'), checks: result.manifest.nodes.map((n) => n.expectations ?? null) };
      } finally {
        db.close();
      }
    };
    const [nb, json] = await Promise.all([outputs(await loadFlowDir(signinsDir)), outputs(jsonDoc())]);
    expect(nb.valid.length).toBeGreaterThan(100);
    expect(nb.valid).toEqual(json.valid);
    expect(nb.hour).toEqual(json.hour);
    expect(nb.country).toEqual(json.country);
    expect(nb.checks).toEqual(json.checks);
  }, 60_000);
});

describe('what a cell means in a flow (ADR 0011 §1–§4)', () => {
  it('reads sources, parameters, sql cells and checks; md cells describe the step after them', async () => {
    const nb = `${SETUP}
cell('params');
const params = param({ day: param.text('') });
cell('auth');
const auth = source('auth');
cell('note', { lang: 'md' });
md\`Only the day's rows\`;
cell('today', { lang: 'sql' });
const today = sql\`SELECT * FROM \${auth} WHERE substr(event_time, 1, 10) = \${params.day}\`;
cell('valid');
export const valid = check(today, { rules: [{ name: 'has_user', check: 'user IS NOT NULL', onFail: 'drop' }] });
cell('count', { lang: 'sql' });
export const count = sql\`SELECT count(*) AS n FROM \${valid}\`;
count;
cell('published');
publish(valid);
publish(count, { description: 'How many', storage: 'columnar' });
`;
    const { steps, cells, issues } = await stepsOfNotebooks(flow({ 'a.nb.ts': nb }), ts);
    expect(issues).toEqual([]);
    expect(steps).toEqual([
      { kind: 'sql', id: 'today', inputs: ['auth'], sql: "SELECT * FROM auth WHERE substr(event_time, 1, 10) = :day", description: "Only the day's rows" },
      { kind: 'expectations', id: 'valid', inputs: ['today'], rules: [{ name: 'has_user', check: 'user IS NOT NULL', onFail: 'drop' }], dataset: {} },
      { kind: 'sql', id: 'count', inputs: ['valid'], sql: 'SELECT count(*) AS n FROM valid', dataset: { description: 'How many', storage: 'columnar' } },
    ]);
    expect(cells.map((c) => [c.cell, c.lang, c.span.line])).toEqual([['today', 'sql', 10], ['valid', 'ts', 12], ['count', 'sql', 14]]);
    const doc = await expandNotebooks(flow({ 'a.nb.ts': nb }), ts);
    expect(validateDocument(doc)).toEqual([]);
    const plan = await translate(doc);
    expect(plan.smaltflPlan).toBe(3);
    expect(plan.publish).toBeUndefined();
    expect(plan.nodes.map((n) => n.op)).toEqual(['table', 'sql', 'expect', 'sql']);
    expect(plan.outputs.map((o) => o.name)).toEqual(['count', 'valid']);
  });

  it('is plan/3 (vector E14): the canonical plan and its hash', async () => {
    const nb = `${SETUP}
cell('auth');
const auth = source('auth');
cell('rows', { lang: 'sql' });
export const rows = sql\`SELECT * FROM \${auth}\`;
cell('published');
publish(rows);
`;
    const doc = await expandNotebooks(flow({ 'v.nb.ts': nb }, { id: 'v', name: 'v', parameters: [] }), ts);
    // The flow hash covers the notebook's source and the derived steps (ADR 0011, "The derived steps are kept").
    expect(await flowHash(doc)).toBe('4082850eb0bcd8c11a7531782fd3f95179a7a26b1c908512925d5ec40fe48a71');
    const plan = await translate(doc);
    expect(canonicalJSON(plan)).toBe(
      '{"flow":{"hash":"4082850eb0bcd8c11a7531782fd3f95179a7a26b1c908512925d5ec40fe48a71","id":"v"},"nodes":[{"inputs":[],"op":"table","origin":"auth","table":"auth_file"},{"inputs":[0],"names":["auth"],"op":"sql","origin":"rows","sql":"SELECT * FROM auth"}],"outputs":[{"name":"rows","node":1}],"parameters":{},"smaltflPlan":3}',
    );
    expect(await planHash(plan)).toBe('aa56689e4d8a1cdc2a5781259cb6256d4a35aed09ecd723feb9bb5b2eddf5e29');
    // The same bytes tagged plan/2 would be another hash: an older build refuses plan/3 rather than verify it (§1).
    expect(await planHash({ ...plan, smaltflPlan: 2 })).not.toBe('aa56689e4d8a1cdc2a5781259cb6256d4a35aed09ecd723feb9bb5b2eddf5e29');
  });

  it('imports another listed notebook\'s exports, steps and sources alike', async () => {
    const a = `${SETUP}
cell('auth');
export const auth = source('auth');
cell('valid');
export const valid = check(auth, { rules: [{ name: 'has_user', check: 'user IS NOT NULL', onFail: 'warn' }], maxDropped: 0.1 });
`;
    const b = `import { cell, sql } from 'smaltnb';
import { auth, valid } from './a.nb.js';
cell('both', { lang: 'sql' });
export const both = sql\`SELECT (SELECT count(*) FROM \${auth}) AS raw, count(*) AS kept FROM \${valid}\`;
`;
    const { steps, issues } = await stepsOfNotebooks(flow({ 'a.nb.ts': a, 'sub/b.nb.ts': b.replace("'./a.nb.js'", "'../a.nb.js'") }), ts);
    expect(issues).toEqual([]);
    expect(steps.map((s) => [s.id, s.inputs])).toEqual([['valid', ['auth']], ['both', ['auth', 'valid']]]);
    expect((steps[1] as Extract<StepDef, { kind: 'sql' }>).sql).toBe('SELECT (SELECT count(*) FROM auth) AS raw, count(*) AS kept FROM valid');
    const missing = await stepsOfNotebooks(flow({ 'sub/b.nb.ts': b }), ts);
    expect(missing.issues.map((i) => i.message)).toEqual(["sub/b.nb.ts imports auth from sub/a.nb.ts, which the document doesn't list"]);
  });

  it('leaves actions out, and refuses what isn\'t a step, a name nothing defines, and a source the document lacks', async () => {
    const nb = `${SETUP}
cell('auth');
const auth = source('users');
cell('n');
const n = 3;
cell('rows', { lang: 'sql' });
export const rows = sql\`SELECT * FROM \${nothing} LIMIT \${n}\`;
cell('frame', { lang: 'df' });
export const frame = auth;
action('save');
await exec\`DELETE FROM t\`;
`;
    const { steps, issues } = await stepsOfNotebooks(flow({ 'a.nb.ts': nb.replace("import { cell, md, param, sql }", "import { action, cell, exec, md, param, sql }") }), ts);
    expect(steps).toEqual([]);
    expect(issues).toEqual([
      { path: '$.notebooks[0]#auth', message: "source() names a source of the document, and users isn't one (sources: auth)" },
      { path: '$.notebooks[0]#n', message: 'not a step a flow runs: a sql cell (const n = sql`…`), a df cell, source(), check(), fill(), publish() or param()' },
      { path: '$.notebooks[0]#rows', message: '${nothing}: nothing defines nothing' },
      { path: '$.notebooks[0]#frame', message: 'a df cell needs a frame compiler (expandNotebooks options.df): this build has none' },
    ]);
    await expect(expandNotebooks(flow({ 'a.nb.ts': nb }), ts)).rejects.toThrow('the notebooks have');
    const pub = `${SETUP}
cell('auth');
const auth = source('auth');
cell('rows', { lang: 'sql' });
const rows = sql\`SELECT * FROM \${auth}\`;
cell('published');
publish(auth);
publish(rows, { owner: 'me' });
publish(rows);
cell('again');
publish(nothing);
`;
    const p = await stepsOfNotebooks(flow({ 'a.nb.ts': pub }), ts);
    expect(p.issues.map((i) => i.message)).toEqual([
      "publish() names a step; auth isn't one (auth is a source)",
      'publish(rows, …): unknown setting owner (description, storage)',
      'rows is published twice',
      "publish() names a step; nothing isn't one",
    ]);
  });

  it('takes a df cell through the frame compiler, its reads as the inputs', async () => {
    const nb = `import { cell } from 'smaltnb';
import { source } from 'smaltfl/notebook';
import { col, table } from '@smaltdb/df';
cell('auth');
const auth = source('auth');
cell('failed', { lang: 'df' });
export const failed = table(auth).filter(col('result').eq('fail'));
`;
    const seen: unknown[] = [];
    const { steps, issues } = await stepsOfNotebooks(flow({ 'a.nb.ts': nb }), ts, {
      df: async (c) => {
        seen.push(c);
        return `SELECT * FROM ${c.inputs.auth} WHERE result = 'fail'`;
      },
    });
    expect(issues).toEqual([]);
    expect(seen).toEqual([{ notebook: 'a.nb.ts', name: 'failed', code: expect.stringContaining("table(auth).filter(col('result').eq('fail'))"), inputs: { auth: 'auth' } }]);
    expect(steps).toEqual([{ kind: 'sql', id: 'failed', inputs: ['auth'], sql: "SELECT * FROM auth WHERE result = 'fail'" }]);
  });

  it('is format 4 by its notebooks, which validateDocument reads before the steps are derived', async () => {
    const raw = { smaltfl: 4, id: 'x', name: 'x', sources: [], notebooks: ['a.nb.ts'] };
    const loaded = await loadNotebooks(raw, async (path) => `// ${path}\n`);
    expect(loaded.notebooks).toEqual([{ path: 'a.nb.ts', source: '// a.nb.ts\n' }]);
    expect(validateDocument(loaded)).toEqual([{ path: '$.steps', message: "a format-4 document's steps are derived from its notebooks: expand them first (expandNotebooks)" }]);
    expect(validateDocument({ ...loaded, smaltfl: 3, steps: [] })).toEqual([{ path: '$.smaltfl', message: 'expected 4: a document with notebooks is format 4' }]);
    expect(validateDocument({ smaltfl: 4, id: 'x', name: 'x', sources: [], steps: [] })).toEqual([{ path: '$.smaltfl', message: 'expected 1: format 4 is for a document with notebooks' }]);
    expect(validateDocument({ ...loaded, notebooks: [], steps: [] })).toEqual([{ path: '$.notebooks', message: 'a non-empty array of notebooks, each { path, source }' }]);
  });
});
