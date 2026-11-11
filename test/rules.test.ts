/**
 * Rules set on a file's columns (src/core/rules.ts, ADR 0015 amendment 1 piece b): kept in the ontology, each a file's
 * own, enforced by the check step that reads the file. The sign-in log ships three (Method one of its five values, else
 * the day holds; Latency from 0 to 30,000 ms and Country never blank, else the row is flagged). Here: what the document
 * accepts, what the plan carries, the edits the page makes, and runs through the engine that count, hold and verify.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import smaltfl from '../src/plugin/index.js';
import { validateDocument } from '../src/core/document.js';
import { emitRuleCheck } from '../src/core/emit.js';
import { removeRule, setRule, switchRule } from '../src/core/flowedit.js';
import { rewriteCheckCall, syncRuleCells } from '../src/core/gatecell.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { utf8 } from '../src/core/hash.js';
import { checkStepOf, newRuleId, ruleSaid, rulesOf, type OntologyRule } from '../src/core/rules.js';
import { pinFile, runFlow, translate, verifyRun, type FlowDocument } from '../src/index.js';
import { pinnedDdl, type DataBindings } from '../examples/sources.js';
import { csvOf, securityDays, securityRows } from './fixtures/security.js';
import { SMALTDB } from './helpers/engine.js';
import { loadFlowDir, signinsDir, ts } from './helpers/notebooks.js';

const data = JSON.parse(readFileSync(new URL('../examples/security-signins.data.json', import.meta.url), 'utf8')) as DataBindings;
const signins = () => loadFlowDir(signinsDir);
const issues = (doc: FlowDocument) => validateDocument(doc).filter((i) => i.path.startsWith('$.ontology.rules')).map((i) => `${i.path}: ${i.message}`);
const withRules = (doc: FlowDocument, rules: unknown[]): FlowDocument => ({ ...doc, ontology: { ...doc.ontology!, rules: rules as OntologyRule[] } });

describe('the sign-in log’s rules', () => {
  it('ships three on auth, enforced by auth_valid, each said in the ontology’s words', async () => {
    const doc = await signins();
    expect(validateDocument(doc)).toEqual([]);
    expect(rulesOf(doc.ontology, 'auth').map((r) => [r.id, r.action])).toEqual([['method_one_of', 'hold'], ['latency_ms_range', 'flag'], ['country_required', 'flag']]);
    expect(checkStepOf(doc, 'auth')?.id).toBe('auth_valid');
    expect(rulesOf(doc.ontology, 'auth').map((r) => ruleSaid(doc.ontology, r))).toEqual([
      'Method is Password, Single sign-on, MFA push, Passkey or API key',
      'Latency is from 0 to 30,000 ms',
      'Country is never blank',
    ]);
  });

  it('adds them to the check step’s rules in the plan, after its own, by name, with what a broken row does', async () => {
    const plan = await translate(await signins(), { day: '2024-03-11' });
    const expect_ = plan.nodes.find((n) => n.origin === 'auth_valid');
    expect(expect_?.op).toBe('expect');
    if (expect_?.op !== 'expect') return;
    expect(expect_.rules.map(([name, , onFail]) => [name, onFail])).toEqual([
      ['known_result', 'drop'], ['in_day', 'drop'], ['has_user', 'warn'],
      ['method_one_of', 'fail'], ['latency_ms_range', 'warn'], ['country_required', 'warn'],
    ]);
    expect(expect_.rules[3]![1]).toBe(`"method" IS NULL OR CAST("method" AS TEXT) IN ('password', 'sso', 'mfa_push', 'passkey', 'api_key')`);
  });

  it('leaves a rule switched off out of the plan, and the plan as it was without rules when none is on', async () => {
    const doc = await signins();
    const off = (doc.ontology!.rules ?? []).reduce((d, r) => switchRule(d, 'auth', r.id, false)!.doc, doc);
    const { rules: _r, ...bare } = doc.ontology!;
    const none: FlowDocument = { ...doc, ontology: bare };
    const rulesIn = async (d: FlowDocument) => {
      const n = (await translate(d, { day: '2024-03-11' })).nodes.find((x) => x.origin === 'auth_valid');
      return n?.op === 'expect' ? n.rules.map(([name]) => name) : [];
    };
    expect(await rulesIn(off)).toEqual(['known_result', 'in_day', 'has_user']);
    // The node a rule never reached is the node as written: the same key whatever the ontology's rules say.
    const nodeOf = async (d: FlowDocument) => (await translate(d, { day: '2024-03-11' })).nodes.find((x) => x.origin === 'auth_valid');
    expect(await nodeOf(off)).toEqual(await nodeOf(none));
  });
});

describe('what the document accepts', () => {
  const rule = (x: Record<string, unknown>) => ({ id: 'r', file: 'auth', column: 'method', kind: 'required', action: 'flag', ...x });

  it('refuses a rule that isn’t one, by name', async () => {
    const doc = await signins();
    expect(issues(withRules(doc, [rule({ kind: 'nope' })]))).toEqual(['$.ontology.rules[0].kind: required, oneOf, range, when']);
    expect(issues(withRules(doc, [rule({ file: 'nowhere' })]))).toEqual(['$.ontology.rules[0].file: no source nowhere: a rule is a file’s own']);
    expect(issues(withRules(doc, [rule({ action: 'shout' })]))).toEqual(['$.ontology.rules[0].action: flag, drop, hold: what a row that breaks it does']);
    expect(issues(withRules(doc, [rule({ colour: 'red' })]))).toEqual(["$.ontology.rules[0].colour: colour isn't a rule's setting (id, file, column, kind, values, min, max, when, action): refused rather than ignored"]);
    expect(issues(withRules(doc, [rule({ id: '1st' })]))).toEqual(['$.ontology.rules[0].id: a name of letters, digits and underscores, starting with a letter']);
    expect(issues(withRules(doc, [rule({ off: true })]))).toEqual(["$.ontology.rules[0].off: a rule is switched in the check cell that enforces its file (ontology: { name: 'off' }), not in the ontology"]);
  });

  it('asks each kind for what it needs and nothing else', async () => {
    const doc = await signins();
    expect(issues(withRules(doc, [rule({ kind: 'oneOf' })]))).toEqual(['$.ontology.rules[0].values: the values the column may hold, each once']);
    expect(issues(withRules(doc, [rule({ kind: 'oneOf', values: ['a', 'a'] })]))).toEqual(['$.ontology.rules[0].values: the values the column may hold, each once']);
    expect(issues(withRules(doc, [rule({ values: ['a'] })]))).toEqual(['$.ontology.rules[0].values: a required rule has no values']);
    expect(issues(withRules(doc, [rule({ kind: 'range' })]))).toEqual(['$.ontology.rules[0]: a range needs a lowest (min), a highest (max) or both']);
    expect(issues(withRules(doc, [rule({ kind: 'range', min: 5, max: 1 })]))).toEqual(['$.ontology.rules[0].max: 1 is below the lowest, 5']);
    expect(issues(withRules(doc, [rule({ kind: 'range', min: '5' })]))).toEqual(['$.ontology.rules[0].min: a number']);
    expect(issues(withRules(doc, [rule({ kind: 'when', values: ['sso'] })]))).toEqual(['$.ontology.rules[0].when: { column, values }: the rows it is about, by another column’s values']);
    expect(issues(withRules(doc, [rule({ kind: 'when', values: ['sso'], when: { column: 'method', values: ['x'] } })]))).toEqual(['$.ontology.rules[0].when.column: another column than the one the rule asks something of']);
    expect(issues(withRules(doc, [rule({ kind: 'when', values: ['sso'], when: { column: 'result', values: ['success'] } })]))).toEqual([]);
  });

  it('keeps a name once in a file, and off the check step’s own rules', async () => {
    const doc = await signins();
    expect(issues(withRules(doc, [rule({}), rule({ id: 'R' })]))).toEqual(['$.ontology.rules[1].id: auth has two rules named R (names are compared without case)']);
    expect(issues(withRules(doc, [rule({ id: 'has_user' })]))).toEqual(["$.ontology.rules[0].id: auth_valid, the check step that enforces auth's rules, has a rule of its own named has_user"]);
    // A new rule's name is free of both.
    expect(newRuleId(doc, 'auth', 'user', 'required')).toBe('user_required');
    expect(newRuleId(withRules(doc, [rule({ id: 'user_required' })]), 'auth', 'user', 'required')).toBe('user_required_2');
    expect(newRuleId(doc, 'auth', 'Country Code', 'oneOf')).toBe('country_code_one_of');
  });
});

describe('the engine’s reading of each kind', () => {
  it('passes a blank but for required, compares values as text, and a range as a number', () => {
    expect(emitRuleCheck({ column: 'user', kind: 'required' })).toBe(`"user" IS NOT NULL AND trim(CAST("user" AS TEXT)) <> ''`);
    expect(emitRuleCheck({ column: 'n', kind: 'range', min: 0 })).toBe('"n" IS NULL OR (CAST("n" AS REAL) >= 0)');
    expect(emitRuleCheck({ column: 'n', kind: 'range', max: 2.5 })).toBe('"n" IS NULL OR (CAST("n" AS REAL) <= 2.5)');
    expect(emitRuleCheck({ column: 'code', kind: 'oneOf', values: ["it's"] })).toBe(`"code" IS NULL OR CAST("code" AS TEXT) IN ('it''s')`);
    expect(emitRuleCheck({ column: 'method', kind: 'when', values: ['password'], when: { column: 'result', values: ['locked'] } })).toBe(`"result" IS NULL OR NOT (CAST("result" AS TEXT) IN ('locked')) OR ("method" IS NOT NULL AND CAST("method" AS TEXT) IN ('password'))`);
  });
});

describe('the edits the page makes', () => {
  it('adds a rule with a free name, on at once, and says it', async () => {
    const doc = await signins();
    const r = setRule(doc, { file: 'auth', column: 'user', kind: 'required', action: 'drop' });
    expect('doc' in r).toBe(true);
    if (!('doc' in r)) return;
    expect(r.said).toBe('Added a rule to auth: User is never blank, else leave the row out');
    expect(rulesOf(r.doc.ontology, 'auth').at(-1)).toEqual({ id: 'user_required', file: 'auth', column: 'user', kind: 'required', action: 'drop' });
    expect(validateDocument(r.doc)).toEqual([]);
  });

  it('changes a rule by its name, keeping its switch in the cell, and keeps only what its kind has', async () => {
    const doc = switchRule(await signins(), 'auth', 'latency_ms_range', false)!.doc;
    const r = setRule(doc, { id: 'latency_ms_range', file: 'auth', column: 'latency_ms', kind: 'range', min: 0, max: 5000, values: ['stray'], action: 'hold' });
    if (!('doc' in r)) throw new Error(r.problem);
    expect(rulesOf(r.doc.ontology, 'auth').find((x) => x.id === 'latency_ms_range')).toEqual({ id: 'latency_ms_range', file: 'auth', column: 'latency_ms', kind: 'range', min: 0, max: 5000, action: 'hold' });
    expect(checkStepOf(r.doc, 'auth')).toMatchObject({ ontology: { latency_ms_range: 'off' } });
    expect(r.said).toBe('Changed a rule in auth: Latency is from 0 to 5,000 ms, else hold the day (it was: Latency is from 0 to 30,000 ms, else flag the row and keep it)');
  });

  it('refuses a rule the document wouldn’t keep, with the reason', async () => {
    expect(setRule(await signins(), { file: 'auth', column: 'method', kind: 'oneOf', values: [], action: 'flag' })).toEqual({ problem: 'the values the column may hold, each once' });
    expect(setRule(await signins(), { id: 'nope', file: 'auth', column: 'method', kind: 'required', action: 'flag' })).toEqual({ problem: 'auth has no rule nope' });
  });

  it('switches a rule off and on, and removes one', async () => {
    const doc = await signins();
    const off = switchRule(doc, 'auth', 'country_required', false)!;
    expect(off.said).toBe('Switched off a rule of auth: Country is never blank, in auth_valid');
    // The ontology's definition is untouched: the switch is the check cell's.
    expect(off.doc.ontology).toEqual(doc.ontology);
    expect(switchRule(off.doc, 'auth', 'country_required', false)).toBeNull();
    const on = switchRule(off.doc, 'auth', 'country_required', true)!;
    expect(rulesOf(on.doc.ontology, 'auth')).toEqual(rulesOf(doc.ontology, 'auth'));
    const gone = removeRule(doc, 'auth', 'country_required')!;
    expect(gone.said).toBe('Removed a rule from auth: Country is never blank');
    expect(rulesOf(gone.doc.ontology, 'auth').map((r) => r.id)).toEqual(['method_one_of', 'latency_ms_range']);
    // The last rule taken away takes the list with it: the ontology as it was before any rule.
    const empty = ['method_one_of', 'latency_ms_range'].reduce((d, id) => removeRule(d, 'auth', id)!.doc, gone.doc);
    expect(empty.ontology).not.toHaveProperty('rules');
  });
});

describe('the check cell that runs them (Q-148)', () => {
  /** What smaltnb derives from the notebooks as written, against what the edit derived by hand. */
  const agrees = async (doc: FlowDocument) => {
    const again = await expandNotebooks(doc, ts);
    expect(again.steps).toEqual(doc.steps);
    expect(again.cells).toEqual(doc.cells);
    expect(validateDocument(doc)).toEqual([]);
  };
  const cellOf = (doc: FlowDocument, step: string) => {
    const ref = doc.cells![step]!;
    return doc.notebooks!.find((n) => n.path === ref.notebook)!.source.split('\n').slice(ref.line - 1, ref.endLine).join('\n');
  };

  it('lists the file’s rules in the cell, each on, as the sign-in log ships', async () => {
    const doc = await signins();
    expect(cellOf(doc, 'auth_valid')).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'on', country_required: 'on' },");
    expect(checkStepOf(doc, 'auth')).toMatchObject({ ontology: { method_one_of: 'on', latency_ms_range: 'on', country_required: 'on' } });
  });

  it('writes a switch into the cell, which smaltnb reads back as the step the edit derived', async () => {
    const off = switchRule(await signins(), 'auth', 'latency_ms_range', false)!;
    expect(off.step).toBe('auth_valid');
    expect(cellOf(off.doc, 'auth_valid')).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'off', country_required: 'on' },");
    await agrees(off.doc);
    await agrees(switchRule(off.doc, 'auth', 'latency_ms_range', true)!.doc);
  });

  it('follows the ontology: a rule added is on in the cell, one removed is gone from it, one changed keeps its switch', async () => {
    const doc = switchRule(await signins(), 'auth', 'country_required', false)!.doc;
    const added = setRule(doc, { file: 'auth', column: 'user', kind: 'required', action: 'flag' });
    if (!('doc' in added)) throw new Error(added.problem);
    expect(cellOf(added.doc, 'auth_valid')).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'on', country_required: 'off', user_required: 'on' },");
    await agrees(added.doc);
    const gone = removeRule(added.doc, 'auth', 'method_one_of')!;
    expect(cellOf(gone.doc, 'auth_valid')).toContain("ontology: { latency_ms_range: 'on', country_required: 'off', user_required: 'on' },");
    await agrees(gone.doc);
    // Every rule taken away: the cell says nothing of the ontology.
    const none = ['latency_ms_range', 'country_required', 'user_required'].reduce((d, id) => removeRule(d, 'auth', id)!.doc, gone.doc);
    expect(cellOf(none, 'auth_valid')).not.toContain('ontology');
    await agrees(none);
  });

  it('brings every check cell in step with an ontology changed elsewhere, and leaves cells in step as written', async () => {
    const doc = await signins();
    expect(syncRuleCells(doc)).toBe(doc);
    // The ontology edited by hand: a rule more, one fewer. Until the cells are written, the new rule is on and the old
    // entry says nothing; then the cell lists what the ontology has.
    const rules = [...doc.ontology!.rules!.filter((r) => r.id !== 'country_required'), { id: 'user_required', file: 'auth', column: 'user', kind: 'required', action: 'flag' } as OntologyRule];
    const edited = withRules(doc, rules);
    expect(validateDocument(edited)).toEqual([]);
    const names = async (d: FlowDocument) => {
      const n = (await translate(d, { day: '2024-03-11' })).nodes.find((x) => x.origin === 'auth_valid');
      return n?.op === 'expect' ? n.rules.map(([name]) => name).slice(3) : [];
    };
    expect(await names(edited)).toEqual(['method_one_of', 'latency_ms_range', 'user_required']);
    const synced = syncRuleCells(edited);
    expect(cellOf(synced, 'auth_valid')).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'on', user_required: 'on' },");
    expect(await names(synced)).toEqual(await names(edited));
    await agrees(synced);
  });

  it('rewrites the call’s ontology property wherever the cell writes it', () => {
    const lit = "{ a: 'on' }";
    expect(rewriteCheckCall("const v = check(x, { rules: [], maxDropped: 0.1 });", lit)).toBe("const v = check(x, { rules: [], maxDropped: 0.1, ontology: { a: 'on' } });");
    expect(rewriteCheckCall("const v = check(x, {\n  rules: [],\n  maxDropped: 0.1,\n});", lit)).toBe("const v = check(x, {\n  rules: [],\n  maxDropped: 0.1,\n  ontology: { a: 'on' },\n});");
    expect(rewriteCheckCall("const v = check(x, {\n    rules: []\n});", lit)).toBe("const v = check(x, {\n    rules: [],\n    ontology: { a: 'on' }\n});");
    expect(rewriteCheckCall("check(x, { rules: [], ontology: { a: 'off' } })", lit)).toBe("check(x, { rules: [], ontology: { a: 'on' } })");
    expect(rewriteCheckCall("check(x, { rules: [], ontology: { a: 'off' } })", null)).toBe('check(x, { rules: [] })');
    expect(rewriteCheckCall("check(x, {\n  rules: [],\n  ontology: { a: 'off' },\n})", null)).toBe('check(x, {\n  rules: [],\n})');
    expect(() => rewriteCheckCall('const v = sql`SELECT 1`;', lit)).toThrow(/no check/);
  });
});

describe('a load with rows that break them, through the engine', () => {
  const day = securityDays().find((p) => p.day === '2024-03-11')!;
  /** The day's rows, with `extra` rows: [time, result, method, country, client, latency, user]. */
  const run = async (doc: FlowDocument, extra: (string | number | null)[][], publish = false) => {
    const db = Database.openMemory({ plugins: [io, external, smaltfl] });
    const b = data.sources.auth!;
    await pinFile(db, b.file, utf8(csvOf([...securityRows(day, 0.01), ...extra])));
    await db.execAsync(pinnedDdl(b));
    const { publish: _p, ...bare } = doc;
    return { db, run: () => runFlow(db, (publish ? doc : bare) as FlowDocument, { smaltdb: SMALTDB, parameters: { day: day.day } }) };
  };
  const at = `${day.day} 10:00:00`;
  const counts = (r: Awaited<ReturnType<typeof runFlow>>) => Object.fromEntries((r.manifest.nodes.find((n) => n.origin === 'auth_valid')?.expectations?.rules ?? []).map((x) => [x.name, x.failed]));

  it('counts a flagged row, keeps it, and verifies', async () => {
    const doc = await signins();
    const { db, run: go } = await run(doc, [[at, 'success', 'sso', 'US', 'chrome', 99_999, 'planted_1'], [at, 'success', 'sso', null, 'chrome', 120, 'planted_2']]);
    try {
      const r = await go();
      expect(counts(r)).toMatchObject({ method_one_of: 0, latency_ms_range: 1, country_required: 1 });
      // Flagged rows are kept: both are among the checked sign-ins.
      expect(db.query(`SELECT count(*) FROM auth_valid WHERE "user" IN ('planted_1', 'planted_2')`).rows[0]![0]).toBe(2);
      expect((await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun' })).ok).toBe(true);
    } finally {
      db.close();
    }
  }, 60_000);

  it('stops a run on a row that breaks a hold rule, and holds the day where the flow publishes', async () => {
    const doc = await signins();
    const broken = [[at, 'success', 'carrier_pigeon', 'US', 'chrome', 120, 'u3']];
    const bare = await run(doc, broken);
    try {
      await expect(bare.run()).rejects.toThrow(/method_one_of/);
    } finally {
      bare.db.close();
    }
    const held = await run(doc, broken, true);
    try {
      const r = await held.run();
      expect(r.holds.filter((x) => x.by === 'checks').map((x) => x.origin)).toEqual(['auth_valid']);
      expect(counts(r)).toMatchObject({ method_one_of: 1 });
    } finally {
      held.db.close();
    }
  }, 60_000);

  it('lets the same row through once the rule is switched off on the import card', async () => {
    const doc = switchRule(await signins(), 'auth', 'method_one_of', false)!.doc;
    const { db, run: go } = await run(doc, [[at, 'success', 'carrier_pigeon', 'US', 'chrome', 120, 'u3']]);
    try {
      const r = await go();
      expect(counts(r)).not.toHaveProperty('method_one_of');
      expect((await verifyRun(db, r.run, { smaltdb: SMALTDB, level: 'rerun' })).ok).toBe(true);
    } finally {
      db.close();
    }
  }, 60_000);
});
