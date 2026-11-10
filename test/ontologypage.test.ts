/**
 * The Ontology page as data (ADR 0015 amendment 1, piece a): a section a file the flow reads, the file's own rules
 * and each column's in plain words, from what the ontology and the gate cells say today. The control estate's
 * sections are asserted as the page shows them; the other examples and small documents cover what the estate
 * doesn't write (a gate cell's own rules, a check switched off, a file nothing watches, a column the viewer can't
 * read, a time that runs behind another, a band on a value a due date tells).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DataBindings } from '../examples/sources.js';
import type { FlowDocument } from '../src/core/document.js';
import type { GateDef } from '../src/core/gates.js';
import { ontologyPage, originSaid, typesShown, type FileSection, type Rule } from '../src/core/ontologypage.js';
import type { Ontology } from '../src/core/ontology.js';
import { loadFlowDir, signinsDir } from './helpers/notebooks.js';

const estateDir = new URL('../examples/control-estate/', import.meta.url);
const taxiDir = new URL('../examples/nyc-taxis-weather/', import.meta.url);
/** Each file's columns as an example's data list declares them: what a load of it has. */
const columnsIn = (dir: URL) => {
  const data = JSON.parse(readFileSync(new URL('data.json', dir), 'utf8')) as DataBindings;
  return (file: string) => data.sources[file]?.columns?.map(([name]) => name);
};
const said = (rules: readonly Rule[]) => rules.map((r) => r.said);
const file = (files: readonly FileSection[], id: string) => files.find((f) => f.id === id)!;
const column = (f: FileSection, name: string) => f.columns!.find((c) => c.name === name)!;

describe('the control estate, file by file', () => {
  const page = async () => ontologyPage(await loadFlowDir(estateDir), columnsIn(estateDir));

  it('has a section a file the flow reads, in the flow’s order', async () => {
    const { files } = await page();
    expect(files.map((f) => f.id)).toEqual(['apps', 'tls', 'waf', 'pentest', 'encryption', 'key_rotation', 'backup', 'dr_exercise', 'vuln_sla', 'mfa', 'access_review', 'logging', 'privileged_access']);
    for (const f of files) {
      expect(f.discovered).toEqual([]);
      expect(f.count).toBe(f.rules.length + f.columns!.reduce((n, c) => n + c.rules.length, 0));
    }
    expect(file(files, 'tls')).toMatchObject({ summary: 'Transport encryption on internet-facing applications', noun: { one: 'app', many: 'apps' }, watched: true });
    expect(file(files, 'tls').description).toMatch(/^Transport encryption on internet-facing applications: the protocol offered/);
  });

  it('says a file’s own rules: what a row is, the objects it covers, its key', async () => {
    const { files } = await page();
    const tls = file(files, 'tls');
    expect(tls.rules.map((r) => [r.id, r.kind, r.said])).toEqual([
      ['tls/rows', 'rows', 'One row an application'],
      ['tls/covers', 'covers', 'Covers the applications where Internet-facing is Yes, and no others'],
      ['tls/key', 'key', 'No Application blank or repeated'],
    ]);
    expect(tls.rules.map((r) => r.origin)).toEqual([{ how: 'set', in: 'ontology' }, { how: 'set', in: 'ontology' }, { how: 'set', in: 'ontology' }]);
    expect(tls.rules.map((r) => [r.against, r.againstSaid])).toEqual([[undefined, undefined], ['apps', 'the list of applications (apps)'], [undefined, undefined]]);
    // The columns of the file a rule is about: the key, and the column held to the objects the file covers.
    expect(tls.rules.map((r) => r.columns)).toEqual([undefined, ['app_id'], ['app_id']]);
    expect(tls.rules.every((r) => r.unchecked === undefined)).toBe(true);
    // A condition of several columns, in the ontology's titles and the words for its values; no condition is every object.
    expect(said(file(files, 'pentest').rules)[1]).toBe('Covers the applications where Criticality is Critical or High and Internet-facing is Yes, and no others');
    expect(said(file(files, 'key_rotation').rules)[1]).toBe('Covers the applications where Data class is Card data or Personal data and Datastore is Yes, and no others');
    expect(said(file(files, 'mfa').rules)).toEqual(['One row an application', 'Covers every application, and no others', 'No Application blank or repeated']);
  });

  it('says the inventory is the list the other files are checked against, and gives it no rule it doesn’t have', async () => {
    const apps = file((await page()).files, 'apps');
    expect(apps.inventory).toEqual({ noun: { one: 'application', many: 'applications' }, files: ['tls', 'waf', 'pentest', 'encryption', 'key_rotation', 'backup', 'dr_exercise', 'vuln_sla', 'mfa', 'access_review', 'logging', 'privileged_access'], said: 'The list of applications: 12 other files are checked against it' });
    expect(apps).toMatchObject({ rules: [], count: 0, watched: false, summary: 'The application inventory' });
    expect(apps.columns!.map((c) => [c.name, c.title, c.rules.length])).toEqual([['app_id', 'Application', 0], ['name', 'Name', 0], ['business_unit', 'Business unit', 0], ['criticality', 'Criticality', 0], ['internet_facing', 'Internet-facing', 0], ['data_class', 'Data class', 0], ['datastore', 'Datastore', 0], ['hosting', 'Hosting', 0], ['lifecycle', 'Lifecycle', 0]]);
    expect(column(apps, 'data_class')).toMatchObject({ description: 'The most sensitive data the application holds', values: [['pci', 'Card data'], ['pii', 'Personal data'], ['internal', 'Internal'], ['public', 'Public']] });
    expect((await page()).files.filter((f) => f.inventory).map((f) => f.id)).toEqual(['apps']);
  });

  it('lists a file’s rule about a column on that column’s card too, said for the column and counted once', async () => {
    const { files } = await page();
    const tls = file(files, 'tls');
    const key = column(tls, 'app_id');
    // "The application has to be there" is the first rule anyone looks for under the column: the card has no rule
    // of its own, and says the file's two that name it.
    expect(key.rules).toEqual([]);
    expect(key.fileRules.map((x) => [x.rule.id, x.said])).toEqual([['tls/covers', 'Must be one of the applications this file covers'], ['tls/key', 'No Application blank or repeated']]);
    // The file's rule itself, not a copy: how it came to be and whether it is judged are said once.
    expect(key.fileRules.map((x) => x.rule)).toEqual([tls.rules[1], tls.rules[2]]);
    expect(key.fileRules[0]!.rule).toBe(tls.rules[1]);
    expect(tls.count).toBe(7);
    expect(tls.columns!.filter((c) => c.fileRules.length).map((c) => c.name)).toEqual(['app_id']);
    // In every file: a column a file's rule names lists that rule, so none of them says it has no rule.
    for (const f of files)
      for (const r of f.rules)
        for (const c of r.columns ?? []) expect(column(f, c).fileRules.map((x) => x.rule)).toContain(r);
    expect(files.filter((f) => f.id !== 'apps').every((f) => column(f, 'app_id').fileRules.length === 2)).toBe(true);
    expect(file(files, 'apps').columns!.every((c) => c.fileRules.length === 0)).toBe(true);
  });

  it('gives each column its rules from the ontology’s marks: a new value, a bad value, a band, a due date', async () => {
    const { files } = await page();
    const tls = file(files, 'tls');
    expect(tls.columns!.map((c) => c.name)).toEqual(['app_id', 'hostname', 'protocol', 'cert_days_left', 'status']);
    expect(column(tls, 'status').rules).toEqual([
      // What is checked is said: a value the file never held, not a closed list. The values described are the column's meaning.
      { id: 'tls/status/values', kind: 'values', said: 'A value never seen in this file before is flagged as wrong', values: ['pass', 'fail', 'exception', 'not_assessed'], origin: { how: 'set', in: 'ontology' } },
      { id: 'tls/status/bad=fail', kind: 'bad', said: 'Failing is a bad value: a jump above its usual share is flagged as wrong', values: ['fail'], origin: { how: 'set', in: 'ontology' } },
      { id: 'tls/status/band=not_assessed', kind: 'band', said: 'Not assessed between 0% and 5% of apps', numbers: { low: 0, high: 0.05 }, values: ['not_assessed'], origin: { how: 'set', in: 'ontology' } },
    ]);
    expect(said(column(tls, 'protocol').rules)).toEqual(['A value never seen in this file before is flagged as wrong']);
    expect(column(tls, 'protocol').values.map(([, meaning]) => meaning)).toEqual(['TLS 1.0', 'TLS 1.2', 'TLS 1.3']);
    expect(column(tls, 'cert_days_left')).toMatchObject({ title: 'Certificate days left', rules: [], property: { unit: 'days' } });
    expect(tls.count).toBe(7);
    // A due date, with its window: the status column and the value that is a miss by their title and meaning.
    expect(column(file(files, 'pentest'), 'next_due').rules).toEqual([{ id: 'pentest/next_due/due', kind: 'due', said: 'A due date: a row is late if its Status is still Failing the day after; flagged as wrong when more are late than usual', numbers: { days: 28 }, values: ['fail'], origin: { how: 'set', in: 'ontology' } }]);
    expect(files.filter((f) => f.columns!.some((c) => c.rules.some((r) => r.kind === 'due'))).map((f) => f.id)).toEqual(['pentest', 'key_rotation', 'dr_exercise', 'vuln_sla', 'access_review']);
    expect(said(column(file(files, 'waf'), 'mode').rules)).toEqual(['A value never seen in this file before is flagged as wrong', 'Off is a bad value: a jump above its usual share is flagged as wrong']);
  });

  it('says a bad value’s jump isn’t judged where the file’s due date tells it instead', async () => {
    const { files } = await page();
    // Once a due date is judged, its miss value's rise is told through it (news.ts `dueMiss`): on Fri Mar 15 the
    // vulnerability file's Failing is three times its usual share and the day is a normal Friday.
    const bad = (id: string) => column(file(files, id), 'status').rules.find((r) => r.id === `${id}/status/bad=fail`)!;
    for (const id of ['pentest', 'key_rotation', 'dr_exercise', 'vuln_sla', 'access_review']) expect(bad(id)).toMatchObject({ said: 'Failing is a bad value: a jump above its usual share is flagged as wrong', unchecked: 'this file’s due date is checked instead' });
    for (const id of ['tls', 'encryption', 'backup', 'mfa', 'logging', 'privileged_access']) expect(bad(id).unchecked).toBeUndefined();
    // The due date itself is judged, and so is every other rule of the column.
    const pentest = file(files, 'pentest');
    expect(column(pentest, 'next_due').rules[0]!.unchecked).toBeUndefined();
    expect(column(pentest, 'status').rules.filter((r) => r.unchecked).map((r) => r.id)).toEqual(['pentest/status/bad=fail']);
  });

  it('lists a band in each file it applies to as that file’s own, and one file’s band nowhere else', async () => {
    const { files } = await page();
    const bands = (id: string) => column(file(files, id), 'status').rules.filter((r) => r.kind === 'band').map((r) => [r.id, r.said]);
    expect(bands('waf')).toEqual([['waf/status/band=fail', 'Failing between 0% and 15% of apps'], ['waf/status/band=not_assessed', 'Not assessed between 0% and 5% of apps']]);
    for (const f of files.filter((x) => x.id !== 'apps' && x.id !== 'waf')) expect(bands(f.id)).toEqual([[`${f.id}/status/band=not_assessed`, 'Not assessed between 0% and 5% of apps']]);
    // A value with a band is judged by the band alone (ADR 0014 §3): in the WAF's file Failing's jump isn't, and says so.
    const bad = (id: string) => column(file(files, id), 'status').rules.find((r) => r.id === `${id}/status/bad=fail`)!;
    expect(bad('waf')).toMatchObject({ said: 'Failing is a bad value: a jump above its usual share is flagged as wrong', unchecked: 'this file’s band on Failing is checked instead' });
    expect(bad('tls').unchecked).toBeUndefined();
  });

  it('gives every rule an id of its own, and a sentence with no raw column or code where a title exists', async () => {
    const { files } = await page();
    const all = files.flatMap((f) => [...f.rules, ...f.columns!.flatMap((c) => c.rules)]);
    expect(all.length).toBe(files.reduce((n, f) => n + f.count, 0));
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
    expect(all.every((r) => r.origin.how === 'set')).toBe(true);
    for (const r of all) expect(r.said).not.toMatch(/app_id|internet_facing|data_class|not_assessed|next_due|\bfail\b|\bpci\b|\byes\b/);
  });

  it('draws no box for a type that only says what files’ rows are', async () => {
    const doc = await loadFlowDir(estateDir);
    expect(ontologyPage(doc).types).toEqual([]);
    expect(typesShown(doc.ontology)).toEqual([]);
    // Without a load read, a file has its own rules and no cards yet.
    const tls = file(ontologyPage(doc).files, 'tls');
    expect(tls.columns).toBeNull();
    expect(tls.count).toBe(3);
  });
});

describe('the other examples', () => {
  it('keeps the taxi flow’s object types, which have links and actions, and gives its files no rule it doesn’t write', async () => {
    const doc = await loadFlowDir(taxiDir);
    const page = ontologyPage(doc, columnsIn(taxiDir));
    expect(page.types.map((t) => t.id)).toEqual(['District', 'Zone', 'ZoneHour', 'WeatherHour']);
    expect(page.files.map((f) => [f.id, f.summary, f.noun.many, f.watched, f.count])).toEqual([['trips', 'NYC TLC yellow taxi trip records', 'trips', true, 0], ['zones', 'The TLC taxi zone lookup', 'zones', false, 0], ['weather', 'Open-Meteo hourly weather, one point per district', 'weather hours', false, 0]]);
    // A parquet file declares no columns: no cards until a load is read.
    expect(file(page.files, 'trips').columns).toBeNull();
    expect(file(page.files, 'zones').columns!.map((c) => c.title)).toEqual(['Zone ID', 'Borough', 'Zone', 'Service zone']);
    // A column is found whatever its case in the file: the weather's `borough` is the ontology's Borough.
    expect(column(file(page.files, 'weather'), 'borough')).toMatchObject({ name: 'borough', title: 'Borough', rules: [] });
  });

  it('says the sign-in log’s marks in a flow with no gate: the bad results, the columns where a new value is wrong', async () => {
    const page = ontologyPage(await loadFlowDir(signinsDir), columnsIn(signinsDir));
    expect(page.types).toEqual([]);
    const auth = file(page.files, 'auth');
    expect(auth).toMatchObject({ noun: { one: 'sign-in', many: 'sign-ins' }, rules: [], watched: true, count: 5 });
    expect(said(column(auth, 'result').rules)).toEqual([
      'A value never seen in this file before is flagged as wrong',
      'Failed is a bad value: a jump above its usual share is flagged as wrong',
      'Locked out is a bad value: a jump above its usual share is flagged as wrong',
    ]);
    expect(said(column(auth, 'country').rules)).toEqual(['A value never seen in this file before is flagged as wrong']);
    // No file rule in a flow with no gate: no card lists one.
    expect(auth.columns!.every((c) => c.fileRules.length === 0)).toBe(true);
    expect(column(auth, 'method').rules).toEqual([]);
    expect(auth.columns!.flatMap((c) => c.rules).every((r) => r.unchecked === undefined)).toBe(true);
  });
});

describe('what the examples don’t write', () => {
  const ONTOLOGY: Ontology = {
    objectTypes: [
      { id: 'application', name: 'Application', dataset: 'apps', key: ['app_id'], title: 'name' },
      { id: 'unit', name: 'Unit', dataset: 'units', key: ['unit_id'], title: 'unit_id' },
      { id: 'seat', name: 'Seat', dataset: 'seats', key: ['room', 'seat'], title: 'seat' },
    ],
    linkTypes: [{ id: 'app_unit', name: 'of', from: 'application', to: 'unit', on: [['unit_id', 'unit_id']] }],
    actionTypes: [],
    properties: [
      { column: 'app_id', title: 'Application', description: 'The application’s id' },
      { column: 'internet_facing', title: 'Internet-facing', description: 'Reachable from the internet', values: { yes: 'Yes', no: 'No' } },
      { column: 'status', title: 'Status', description: 'Its standing', values: { pass: 'Passing', fail: 'Failing' }, bad: ['fail'], expect: [{ value: 'fail', share: [0, 0.125] }] },
      { column: 'code', title: 'Code', description: 'One of many', values: Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((v) => [v, v.toUpperCase()])), newValues: 'alert' },
      { column: 'closed_at', title: 'Closed', description: 'When it was closed', after: { of: 'opened_at', minutes: 30 } },
      { column: 'opened_at', title: 'Opened', description: 'When it was opened' },
      { column: 'due_on', title: 'Due', description: 'The day it is due', datasets: ['tickets'], due: { status: 'status', miss: 'fail', within: 14 } },
    ],
    rows: [{ dataset: 'tls', of: 'application', where: { internet_facing: 'yes' } }, { dataset: 'desks', of: 'seat' }, { dataset: 'units', of: 'unit' }],
  };
  const doc = (o: { gates?: Record<string, GateDef>; watch?: string[] } = {}): FlowDocument =>
    ({
      smaltfl: 4, id: 'small', name: 'Small', steps: [],
      sources: ['apps', 'units', 'tls', 'desks', 'tickets'].map((id) => ({ id, table: `${id}_file` })),
      ontology: ONTOLOGY,
      gates: o.gates ?? { tls: { layer: 'bronze', checks: {} } },
      publish: { hold: ['wrong'], watch: Object.fromEntries((o.watch ?? ['tls', 'desks', 'tickets']).map((w) => [w, { history: `${w}.json`, pattern: 'none' }])) },
    }) as unknown as FlowDocument;
  const COLUMNS: Record<string, string[]> = { apps: ['app_id', 'internet_facing'], tls: ['APP_ID', 'status', 'code'], tickets: ['opened_at', 'closed_at', 'status', 'ref', 'due_on'] };
  const columns = (f: string) => COLUMNS[f];

  it('says a gate cell’s own rules, quoting a condition written for the engine, and names the notebook as where they are set', () => {
    const page = ontologyPage(doc({ gates: { tls: { layer: 'bronze', checks: {}, scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" }, reconcile: { key: ['app_id'], of: 'apps' }, needs: [{ when: { status: 'pass' }, then: { code: ['a', 'b'] } }, { from: 'apps', key: 'app_id', when: { internet_facing: 'no' }, then: { status: 'pass' } }] } } }), columns);
    const tls = file(page.files, 'tls');
    expect(tls.rules.map((r) => [r.id, r.said, r.origin, r.against])).toEqual([
      ['tls/rows', 'One row an application', { how: 'set', in: 'ontology' }, undefined],
      ['tls/covers', "Covers the applications where internet_facing = 'yes', and no others", { how: 'set', in: 'notebook' }, 'apps'],
      ['tls/key', 'No Application blank or repeated', { how: 'set', in: 'notebook' }, undefined],
      ['tls/same', 'The same Application values as apps: none missing, none extra', { how: 'set', in: 'notebook' }, 'apps'],
      ['tls/needs#1', 'Where Status is Passing, Code must be A or B', { how: 'set', in: 'notebook' }, undefined],
      ['tls/needs#2', 'Where Internet-facing is No in apps, Status must be Passing', { how: 'set', in: 'notebook' }, 'apps'],
    ]);
    // The inventory a scope reads is said as a list of its objects; any other dataset by its name.
    expect(tls.rules.map((r) => r.againstSaid)).toEqual([undefined, 'the list of applications (apps)', undefined, 'apps', undefined, 'apps']);
    // Each rule on the cards of the file's columns it names, whatever their case in the load: the key's three on the
    // key; a combination on the column that must hold and on the condition's, where the condition is read in this file.
    expect(tls.rules.map((r) => r.columns)).toEqual([undefined, ['app_id'], ['app_id'], ['app_id'], ['status', 'code'], ['status']]);
    expect(tls.columns!.map((c) => [c.name, c.fileRules.map((x) => x.rule.id)])).toEqual([['APP_ID', ['tls/covers', 'tls/key', 'tls/same']], ['status', ['tls/needs#1', 'tls/needs#2']], ['code', ['tls/needs#1']]]);
    expect(column(tls, 'APP_ID').fileRules.map((x) => x.said)).toEqual(['Must be one of the applications this file covers', 'No Application blank or repeated', 'The same Application values as apps: none missing, none extra']);
    expect(column(tls, 'code').fileRules[0]!.said).toBe('Where Status is Passing, Code must be A or B');
    // Listed twice, counted once: six of the file's, four of its columns' own.
    expect(tls.count).toBe(10);
  });

  it('says why a rule isn’t judged: a check switched off, a file nothing watches, a key of several columns', () => {
    const off = ontologyPage(doc({ gates: { tls: { layer: 'bronze', checks: { scope: 'off', values: 'off' } } } }), columns);
    const tls = file(off.files, 'tls');
    expect(tls.rules.map((r) => [r.kind, r.unchecked])).toEqual([['rows', undefined], ['covers', 'switched off in the notebook'], ['key', undefined]]);
    expect(column(tls, 'status').rules.map((r) => [r.id, r.unchecked])).toEqual([['tls/status/values', 'switched off in the notebook'], ['tls/status/bad=fail', 'this file’s band on Failing is checked instead'], ['tls/status/band=fail', 'switched off in the notebook']]);
    const unwatched = file(ontologyPage(doc({ watch: ['tickets'] }), columns).files, 'tls');
    expect([...unwatched.rules, ...unwatched.columns!.flatMap((c) => c.rules)].map((r) => r.unchecked)).toEqual(Array(7).fill('nothing watches this file'));
    expect(unwatched.watched).toBe(false);
    // A type whose key is several columns gives no scope and no key (ADR 0015 §1): what a row is is said, as not checked.
    expect(file(off.files, 'desks').rules).toEqual([{ id: 'desks/rows', kind: 'rows', said: 'One row a seat', origin: { how: 'set', in: 'ontology' }, unchecked: 'a key of several columns isn’t checked yet' }]);
    // The file's reason comes first: watched by nothing, that is what its rules say, whatever else is so.
    expect(file(ontologyPage(doc({ watch: ['tickets'] }), columns).files, 'desks').rules[0]!.unchecked).toBe('nothing watches this file');
  });

  it('says a band’s share to a tenth of a point, many known values by their number, and a time that runs behind another', () => {
    const page = ontologyPage(doc(), columns);
    const tls = file(page.files, 'tls');
    // The column as the load writes it; the rule's id in lower case, so it stands whatever a load's case.
    expect(column(tls, 'APP_ID')).toMatchObject({ name: 'APP_ID', title: 'Application', rules: [] });
    expect(column(tls, 'APP_ID').fileRules.map((x) => x.rule.id)).toEqual(['tls/covers', 'tls/key']);
    expect(column(tls, 'status').rules[2]).toMatchObject({ said: 'Failing between 0% and 12.5% of rows', numbers: { low: 0, high: 0.125 } });
    expect(column(tls, 'code').rules).toEqual([{ id: 'tls/code/values', kind: 'values', said: 'A value never seen in this file before is flagged as wrong', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], origin: { how: 'set', in: 'ontology' } }]);
    expect(column(file(page.files, 'tickets'), 'closed_at').rules).toEqual([{ id: 'tickets/closed_at/after', kind: 'after', said: 'About 30 minutes after Opened', numbers: { minutes: 30 }, origin: { how: 'set', in: 'ontology' } }]);
    // A column the ontology doesn't describe keeps its own name, and has no rule.
    // Moved on purpose (ADR 0015 amendment 1, names and labels): a card gained `standFor`, the values whose meaning
    // says more than the value; it had `{ name, title, values, rules, fileRules }`.
    expect(column(file(page.files, 'tickets'), 'ref')).toEqual({ name: 'ref', title: 'ref', values: [], standFor: [], rules: [], fileRules: [] });
    // One file checked against the inventory; a file with no load read has no cards.
    expect(file(page.files, 'apps').inventory?.said).toBe('The list of applications: 1 other file is checked against it');
    expect(file(page.files, 'desks').columns).toBeNull();
  });

  it('says a value a due date tells isn’t judged by its jump or by a band, in the file with the due date alone', () => {
    const page = ontologyPage(doc(), columns);
    const rules = (f: string) => column(file(page.files, f), 'status').rules.map((r) => [r.id, r.unchecked]);
    // The tickets' Failing is the miss of their due date: the due check tells its rise, and neither rule on it is judged.
    expect(rules('tickets')).toEqual([['tickets/status/values', undefined], ['tickets/status/bad=fail', 'this file’s due date is checked instead'], ['tickets/status/band=fail', 'this file’s due date is checked instead']]);
    expect(column(file(page.files, 'tickets'), 'due_on').rules).toEqual([{ id: 'tickets/due_on/due', kind: 'due', said: 'A due date: a row is late if its Status is still Failing the day after; flagged as wrong when more are late than usual', numbers: { days: 14 }, values: ['fail'], origin: { how: 'set', in: 'ontology' } }]);
    // The same column in a file with no due date: its band is judged, and stands in for the jump.
    expect(rules('tls')).toEqual([['tls/status/values', undefined], ['tls/status/bad=fail', 'this file’s band on Failing is checked instead'], ['tls/status/band=fail', undefined]]);
  });

  it('lists a column only where the viewer’s load has it: a hidden column has no card and its rules aren’t counted', () => {
    const all = file(ontologyPage(doc(), columns).files, 'tls');
    const hidden = file(ontologyPage(doc(), (f) => COLUMNS[f]?.filter((c) => c !== 'status')).files, 'tls');
    expect(hidden.columns!.map((c) => c.name)).toEqual(['APP_ID', 'code']);
    expect([all.count, hidden.count]).toEqual([7, 4]);
    // A due date the viewer can't read still tells its miss value: the card they do read says its jump isn't judged,
    // from all the file's columns (`every`); without them, from the cards' own.
    const shown = (f: string) => COLUMNS[f]?.filter((c) => c !== 'due_on');
    const bad = (page: ReturnType<typeof ontologyPage>) => column(file(page.files, 'tickets'), 'status').rules.find((r) => r.kind === 'bad')!.unchecked;
    expect(file(ontologyPage(doc(), shown, columns).files, 'tickets').columns!.map((c) => c.name)).toEqual(['opened_at', 'closed_at', 'status', 'ref']);
    expect(bad(ontologyPage(doc(), shown, columns))).toBe('this file’s due date is checked instead');
    expect(bad(ontologyPage(doc(), shown))).toBe('this file’s band on Failing is checked instead');
  });

  it('keeps a type with a link, an action, or no file tied to it, and drops one that only says what rows are', () => {
    // `application` and `unit` are linked; `seat` only says what the desks' rows are.
    expect(typesShown(ONTOLOGY).map((t) => t.id)).toEqual(['application', 'unit']);
    expect(typesShown({ ...ONTOLOGY, linkTypes: [] }).map((t) => t.id)).toEqual([]);
    expect(typesShown({ ...ONTOLOGY, linkTypes: [], rows: [] }).map((t) => t.id)).toEqual(['application', 'unit', 'seat']);
    expect(typesShown({ ...ONTOLOGY, linkTypes: [], actionTypes: [{ id: 'move', name: 'Move', on: 'seat', params: [] }] }).map((t) => t.id)).toEqual(['seat']);
    expect(typesShown(undefined)).toEqual([]);
  });

  it('says how a rule came to be, with room for a range kept from the history and for what is discovered', () => {
    expect(originSaid({ how: 'set', in: 'ontology' })).toBe('Set by hand');
    expect(originSaid({ how: 'set', in: 'notebook' })).toBe('Set by hand');
    expect(originSaid({ how: 'derived', days: 90, kept: 'rolling' })).toBe('From the last 90 days, rolling');
    expect(originSaid({ how: 'derived', days: 1, kept: 'fixed' })).toBe('From the last 1 day, fixed');
    expect(originSaid({ how: 'discovered' })).toBe('Discovered in the data');
  });
});
