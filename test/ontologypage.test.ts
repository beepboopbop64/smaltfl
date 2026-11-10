/**
 * The Ontology page as data (ADR 0015 amendment 1, piece a): a section a file the flow reads, the file's own rules
 * and each column's in plain words, from what the ontology and the gate cells say today. The control estate's
 * sections are asserted as the page shows them; the other examples and small documents cover what the estate
 * doesn't write (a gate cell's own rules, a check switched off, a file nothing watches, a column the viewer can't
 * read, a time that runs behind another).
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
    expect(tls.rules.map((r) => r.against)).toEqual([undefined, 'apps', undefined]);
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

  it('gives each column its rules from the ontology’s marks: known values, a bad value, a band, a due date', async () => {
    const { files } = await page();
    const tls = file(files, 'tls');
    expect(tls.columns!.map((c) => c.name)).toEqual(['app_id', 'hostname', 'protocol', 'cert_days_left', 'status']);
    expect(column(tls, 'status').rules).toEqual([
      { id: 'tls/status/values', kind: 'values', said: 'Holds Passing, Failing, Exception or Not assessed: a value never seen before is flagged as wrong', values: ['pass', 'fail', 'exception', 'not_assessed'], origin: { how: 'set', in: 'ontology' } },
      { id: 'tls/status/bad=fail', kind: 'bad', said: 'Failing is a bad value: a jump above its usual share is flagged as wrong', values: ['fail'], origin: { how: 'set', in: 'ontology' } },
      { id: 'tls/status/band=not_assessed', kind: 'band', said: 'Not assessed between 0% and 5% of apps', numbers: { low: 0, high: 0.05 }, values: ['not_assessed'], origin: { how: 'set', in: 'ontology' } },
    ]);
    expect(said(column(tls, 'protocol').rules)).toEqual(['Holds TLS 1.0, TLS 1.2 or TLS 1.3: a value never seen before is flagged as wrong']);
    expect(column(tls, 'cert_days_left')).toMatchObject({ title: 'Certificate days left', rules: [], property: { unit: 'days' } });
    expect(tls.count).toBe(7);
    // A due date, with its window: the status column and the value that is a miss by their title and meaning.
    expect(column(file(files, 'pentest'), 'next_due').rules).toEqual([{ id: 'pentest/next_due/due', kind: 'due', said: 'A due date: late when Status is still Failing the day after, checked against the usual late share', numbers: { days: 28 }, values: ['fail'], origin: { how: 'set', in: 'ontology' } }]);
    expect(files.filter((f) => f.columns!.some((c) => c.rules.some((r) => r.kind === 'due'))).map((f) => f.id)).toEqual(['pentest', 'key_rotation', 'dr_exercise', 'vuln_sla', 'access_review']);
    expect(said(column(file(files, 'waf'), 'mode').rules)).toEqual(['Holds Blocking, Monitor only or Off: a value never seen before is flagged as wrong', 'Off is a bad value: a jump above its usual share is flagged as wrong']);
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
      'Holds Signed in, Failed or Locked out: a value never seen before is flagged as wrong',
      'Failed is a bad value: a jump above its usual share is flagged as wrong',
      'Locked out is a bad value: a jump above its usual share is flagged as wrong',
    ]);
    expect(said(column(auth, 'country').rules)).toEqual(['A value never seen before is flagged as wrong']);
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
  const COLUMNS: Record<string, string[]> = { apps: ['app_id', 'internet_facing'], tls: ['APP_ID', 'status', 'code'], tickets: ['opened_at', 'closed_at', 'status', 'ref'] };
  const columns = (f: string) => COLUMNS[f];

  it('says a gate cell’s own rules, quoting a condition written for the engine, and names the notebook as where they are set', () => {
    const page = ontologyPage(doc({ gates: { tls: { layer: 'bronze', checks: {}, scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" }, reconcile: { key: ['app_id'], of: 'apps' }, needs: [{ when: { status: 'pass' }, then: { code: ['a', 'b'] } }, { from: 'apps', key: 'app_id', when: { internet_facing: 'no' }, then: { status: 'pass' } }] } } }), columns);
    expect(file(page.files, 'tls').rules.map((r) => [r.id, r.said, r.origin, r.against])).toEqual([
      ['tls/rows', 'One row an application', { how: 'set', in: 'ontology' }, undefined],
      ['tls/covers', "Covers the applications where internet_facing = 'yes', and no others", { how: 'set', in: 'notebook' }, 'apps'],
      ['tls/key', 'No Application blank or repeated', { how: 'set', in: 'notebook' }, undefined],
      ['tls/same', 'The same Application values as apps: none missing, none extra', { how: 'set', in: 'notebook' }, 'apps'],
      ['tls/needs#1', 'Where Status is Passing, Code must be A or B', { how: 'set', in: 'notebook' }, undefined],
      ['tls/needs#2', 'Where Internet-facing is No in apps, Status must be Passing', { how: 'set', in: 'notebook' }, 'apps'],
    ]);
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
    expect(column(tls, 'status').rules[2]).toMatchObject({ said: 'Failing between 0% and 12.5% of rows', numbers: { low: 0, high: 0.125 } });
    expect(column(tls, 'code').rules).toEqual([{ id: 'tls/code/values', kind: 'values', said: 'Holds one of 7 known values: a value never seen before is flagged as wrong', values: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], origin: { how: 'set', in: 'ontology' } }]);
    expect(column(file(page.files, 'tickets'), 'closed_at').rules).toEqual([{ id: 'tickets/closed_at/after', kind: 'after', said: 'About 30 minutes after Opened', numbers: { minutes: 30 }, origin: { how: 'set', in: 'ontology' } }]);
    // A column the ontology doesn't describe keeps its own name, and has no rule.
    expect(column(file(page.files, 'tickets'), 'ref')).toEqual({ name: 'ref', title: 'ref', values: [], rules: [] });
    // One file checked against the inventory; a file with no load read has no cards.
    expect(file(page.files, 'apps').inventory?.said).toBe('The list of applications: 1 other file is checked against it');
    expect(file(page.files, 'desks').columns).toBeNull();
  });

  it('lists a column only where the viewer’s load has it: a hidden column has no card and its rules aren’t counted', () => {
    const all = file(ontologyPage(doc(), columns).files, 'tls');
    const hidden = file(ontologyPage(doc(), (f) => COLUMNS[f]?.filter((c) => c !== 'status')).files, 'tls');
    expect(hidden.columns!.map((c) => c.name)).toEqual(['APP_ID', 'code']);
    expect([all.count, hidden.count]).toEqual([7, 4]);
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
