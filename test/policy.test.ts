/**
 * Policies on real data (tier XS): every read through the same views, and actions checked and recorded in a hash
 * chain, refusals included.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../src/plugin/index.js';
import { checkAction, checkDecision, DECIDE, readView, runFlow, validateDocument, wrapRead, type Edit, type FlowDocument, type Policies } from '../src/index.js';
import { EXAMPLE_SOURCES } from '../examples/sources.js';
import { SMALTDB } from './helpers/engine.js';

const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
const p = doc.policies!;

async function ran(): Promise<Database> {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  for (const s of EXAMPLE_SOURCES) {
    await db.callPlugin('@smaltdb/external', 'registerFile', [s.file, new Uint8Array(readFileSync(new URL(`../fixtures/xs/${s.file}`, import.meta.url)))]);
    await db.execAsync(s.ddl);
  }
  await runFlow(db, doc, { smaltdb: SMALTDB });
  return db;
}

const columnsOf = (db: Database, name: string) => db.prepare(`SELECT * FROM "${name}"`).columns;
const readAs = (db: Database, viewer: string, name: string, select = 'count(*)', tail = '') => {
  const sql = wrapRead(readView(p, viewer, columnsOf(db, name)), `SELECT * FROM "${name}"`);
  return sql === null ? null : db.query(`SELECT ${select} FROM (${sql}) ${tail}`).rows;
};

describe('policies', () => {
  it('are part of a valid document', () => {
    expect(validateDocument(doc)).toEqual([]);
  });

  it('show each district lead only their districts, wherever a district column is', async () => {
    const db = await ran();
    expect(readAs(db, 'ana', 'zone_hour', 'DISTINCT pu_borough')).toEqual([['Manhattan']]);
    expect(readAs(db, 'ben', 'borough_hour', 'DISTINCT pu_borough', 'ORDER BY 1')).toEqual([['Brooklyn'], ['Queens']]);
    expect(readAs(db, 'ana', 'weather_effect', 'DISTINCT borough')).toEqual([['Manhattan']]);
    expect(readAs(db, 'owner', 'zone_hour')![0]![0]).toBe(db.query('SELECT count(*) FROM zone_hour').rows[0]![0]);
  });

  it("close a dataset whose rows a rule can't filter", () => {
    const v = readView(p, 'cara', ['pu_borough', 'pu_hour', 'trips']);
    expect(v.open).toBe(false);
    expect(v.reason).toBe("the Airports only filters on pu_zone or zone, which this dataset doesn't have, so its rows can't be filtered");
    expect(wrapRead(v, 'SELECT 1')).toBeNull();
  });

  it('show Cara only the airport zones, and Dev every row without fares', async () => {
    const db = await ran();
    expect(readAs(db, 'cara', 'zone_hour', 'DISTINCT pu_zone', 'ORDER BY 1')!.map((r) => r[0])).toEqual(expect.arrayContaining(['JFK Airport', 'LaGuardia Airport']));
    expect(readAs(db, 'cara', 'zone_hour', "count(*) FILTER (WHERE pu_zone NOT IN ('JFK Airport', 'LaGuardia Airport', 'Newark Airport'))")).toEqual([[0]]);
    expect(readAs(db, 'cara', 'borough_hour')).toBeNull();
    const dev = readView(p, 'dev', columnsOf(db, 'zone_hour'));
    expect(dev.columns).toEqual(['pu_borough', 'pu_zone', 'pu_hour', 'trips', 'avg_duration_min', 'avg_speed_mph']);
    expect(dev.removed.map((r) => r.column)).toEqual(['avg_fare', 'card_tip_rate']);
    expect(readAs(db, 'dev', 'zone_hour')).toEqual(readAs(db, 'owner', 'zone_hour'));
  });

  it("check an action's rule and its row scope", () => {
    expect(checkAction(p, 'set_zone_target', 'ana', { pu_borough: 'Manhattan' })).toMatchObject({ allowed: true });
    expect(checkAction(p, 'set_zone_target', 'ana', { pu_borough: 'Queens' })).toEqual({ allowed: false, reason: "Queens is outside Ana's districts", rule: 'targets' });
    expect(checkAction(p, 'set_zone_target', 'dev', { pu_borough: 'Manhattan' })).toEqual({ allowed: false, reason: 'only District leads may do this' });
    expect(checkAction(p, 'annotate_weather', 'cara', null)).toMatchObject({ allowed: true });
    expect(checkAction(p, 'set_zone_target', 'owner', { pu_borough: 'Queens' })).toMatchObject({ allowed: true });
  });
});

describe('actions', () => {
  const act = (db: Database, actor: string, key: Record<string, string>, target: number) =>
    db.callPlugin('smaltfl', 'act', [{ ontology: doc.ontology, policies: p, tables: { zone_hour: 'zone_hour', weather_hourly: 'weather_hourly' }, request: { action: 'set_zone_target', actor, key, params: { target_trips: target } } }]) as Promise<Edit>;

  it('record an allowed edit and a refusal, both in the hash chain, which verifies', async () => {
    const db = await ran();
    const [manhattan, queens] = ['Manhattan', 'Queens'].map((b) => {
      const [zone, hour] = db.query(`SELECT pu_zone, pu_hour FROM zone_hour WHERE pu_borough = '${b}' LIMIT 1`).rows[0]!;
      return { pu_zone: String(zone), pu_hour: String(hour) };
    });
    const ok = await act(db, 'ana', manhattan!, 40);
    expect(ok).toMatchObject({ seq: 1, outcome: 'applied', reason: "Manhattan is one of Ana's districts", prev: null, actor: 'ana', params: { target_trips: 40 } });
    const no = await act(db, 'ana', queens!, 40);
    expect(no).toMatchObject({ seq: 2, outcome: 'refused', reason: "Queens is outside Ana's districts", prev: ok.hash });
    await expect(act(db, 'ana', { pu_zone: 'Nowhere', pu_hour: '2024-01-01 00:00' }, 1)).resolves.toMatchObject({ outcome: 'refused', reason: 'no such object' });
    expect(await db.callPlugin('smaltfl', 'verifyEdits', [])).toEqual({ ok: true, edits: 3 });
    db.run("UPDATE _smaltfl_edits SET params = '{\"target_trips\":400}' WHERE seq = 1");
    expect(await db.callPlugin('smaltfl', 'verifyEdits', [])).toEqual({ ok: false, edits: 3, broken: 1 });
  });

  it('refuse parameters of the wrong kind before recording anything', async () => {
    const db = await ran();
    await expect(act(db, 'ana', { pu_zone: 'x', pu_hour: 'y' }, 1.5)).rejects.toThrow('Target trips in this hour needs a whole number');
    expect(db.query('SELECT count(*) FROM _smaltfl_edits').rows[0]![0]).toBe(0);
  });
});

describe('deciding a held day (smaltfl:decide, ADR 0009 §8)', () => {
  /** The example's people, with a decide rule for the district leads that lets them only not publish. */
  const withRule = (rule: Record<string, unknown>): Policies => ({ ...p, groups: [...(p.groups ?? []), { id: 'stewards', name: 'Stewards', members: ['dev'] }], rules: [...p.rules, rule as never] });
  const leads = { id: 'decide', kind: 'action', name: 'Leads decide', action: DECIDE, for: ['leads'], may: ['dont'] };

  it('lets the owner always decide, and anyone in a flow without policies', () => {
    expect(checkDecision(p, 'owner', 'asis')).toEqual({ allowed: true, reason: 'Owner owns the flow' });
    expect(checkDecision(undefined, 'anyone', 'asis')).toEqual({ allowed: true, reason: 'the flow has no policies' });
  });

  it('lets the people a rule covers take the options it lists, and keeps the rule that allowed it', () => {
    expect(checkDecision(withRule(leads), 'ana', 'dont')).toEqual({ allowed: true, reason: 'Leads decide allows Ana', rule: 'decide' });
    // A rule with no `may` allows every option.
    expect(checkDecision(withRule({ ...leads, may: undefined, for: ['stewards'] }), 'dev', 'asis')).toEqual({ allowed: true, reason: 'Leads decide allows Dev', rule: 'decide' });
  });

  it('refuses an option outside the rule, and everyone the rules leave out, naming who may', () => {
    expect(checkDecision(withRule(leads), 'ana', 'asis')).toEqual({ allowed: false, reason: 'only Owner may publish a held day as is' });
    expect(checkDecision(withRule(leads), 'cara', 'dont')).toEqual({ allowed: false, reason: 'only Owner and District leads may decide not to publish a held day' });
    expect(checkDecision(p, 'ana', 'dont')).toEqual({ allowed: false, reason: 'only Owner may decide not to publish a held day' });
    expect(checkDecision(p, 'zed', 'dont')).toEqual({ allowed: false, reason: "zed is not one of the flow's people" });
    expect(checkDecision(p, 'owner', 'fill' as never)).toEqual({ allowed: false, reason: 'fill is not an option for a held day' });
  });

  it('validates as smaltfl’s own action, with no ontology action type, and refuses any other', () => {
    const docWith = (rule: Record<string, unknown>) => ({ ...doc, policies: { ...p, rules: [...p.rules, { id: 'r', kind: 'action', name: 'R', for: ['owner'], ...rule }] } }) as FlowDocument;
    expect(validateDocument(docWith({ action: DECIDE, may: ['asis', 'dont'] }))).toEqual([]);
    expect(validateDocument(docWith({ action: DECIDE }))).toEqual([]);
    const at = `$.policies.rules[${p.rules.length}]`;
    expect(validateDocument(docWith({ action: 'smaltfl:release' }))).toEqual([{ path: `${at}.action`, message: "smaltfl:release is not one of smaltfl's actions (smaltfl:decide)" }]);
    expect(validateDocument(docWith({ action: DECIDE, may: ['fill'] }))).toEqual([{ path: `${at}.may`, message: 'a list of asis, dont, each once' }]);
    expect(validateDocument(docWith({ action: DECIDE, may: ['dont', 'dont'] }))).toEqual([{ path: `${at}.may`, message: 'a list of asis, dont, each once' }]);
    expect(validateDocument(docWith({ action: DECIDE, scope: { columns: ['pu_borough'], attribute: 'districts' } }))).toEqual([{ path: `${at}.scope`, message: 'smaltfl:decide has no rows to scope: its rule lists the options it allows in may' }]);
    expect(validateDocument(docWith({ action: 'annotate_weather', may: ['dont'] }))).toEqual([{ path: `${at}.may`, message: 'may is for smaltfl:decide' }]);
  });
});
