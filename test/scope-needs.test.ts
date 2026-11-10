/**
 * Scope and dependency rules (ADR 0014 §4, slice 3): a gate names the inventory and the condition a key must meet to
 * be in scope, and what another value forbids; the engine counts the rows out of scope, the keys in scope with no row
 * and each rule's contradictions beside every other measure; the history keeps them, and the judge says them in
 * words, holding at five or more past the usual. A silver finding that repeats a bronze one is told as following from
 * the source (§2): "because tls".
 */
import { describe, expect, it } from 'vitest';
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import { plusDays } from '../src/core/calendar.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { emitNeedsCounts, emitScopeCounts } from '../src/core/emit.js';
import { LAYER_DEFAULTS } from '../src/core/gates.js';
import { HistoryRanges } from '../src/core/history.js';
import { appendPeriods, emptyHistory, measuresOf, type MeasureSettings, type Measures } from '../src/core/measures.js';
import { expandNotebooks, stepsOfNotebooks } from '../src/core/notebook.js';
import { LEGACY_JUDGE, newsOf } from '../src/core/news.js';
import { translate } from '../src/core/plan.js';
import { storyOf } from '../src/core/story.js';
import { historyWith, vendorNames } from './helpers/history.js';
import { ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, gate, publish, source } from 'smaltfl/notebook';\n";
const NB = `${SETUP}
cell('params');
export const params = param({ day: param.text('') });
cell('apps');
export const apps = source('apps');
cell('tls');
export const tls = source('tls');
cell('tls_gate');
export const tls_gate = gate(tls, { scope: { of: apps, key: 'app_id', where: "internet_facing = 'yes'" } });
cell('posture', { lang: 'sql' });
export const posture = sql\`SELECT a.app_id, a.internet_facing, t.status AS tls, t.status AS encryption, t.status AS key_rotation FROM \${apps} a LEFT JOIN \${tls} t ON t.app_id = a.app_id\`;
cell('posture_gate');
export const posture_gate = gate(posture, { needs: [{ when: { key_rotation: 'pass' }, then: { encryption: ['pass', 'exception'] } }, { from: tls, key: 'app_id', when: { status: 'fail' }, then: { tls: 'fail' } }] });
cell('published');
publish(posture);
`;
const flow = (nb = NB): FlowDocument =>
  ({
    smaltfl: 4, id: 'scoped', name: 'Scoped', steps: [],
    parameters: [{ name: 'day', type: 'text', default: '2024-03-01' }],
    sources: [{ id: 'apps', table: 'apps_file' }, { id: 'tls', table: 'tls_file' }],
    notebooks: [{ path: 'a.nb.ts', source: nb }],
    publish: { hold: ['wrong'], period: 'day', watch: { tls: { history: 'h.json', pattern: 'none' }, posture: { history: 'p.json', pattern: 'none' } } },
  }) as FlowDocument;

describe('the rules in the notebook and the plan', () => {
  it('reads scope and needs from the gate cell, their datasets named by the notebook’s names, and carries them in plan/4', async () => {
    const doc = await expandNotebooks(flow(), ts);
    expect(validateDocument(doc)).toEqual([]);
    expect(doc.gates!.tls).toEqual({ layer: 'bronze', checks: {}, scope: { of: 'apps', key: 'app_id', where: "internet_facing = 'yes'" } });
    expect(doc.gates!.posture!.needs).toEqual([{ when: { key_rotation: 'pass' }, then: { encryption: ['pass', 'exception'] } }, { from: 'tls', key: 'app_id', when: { status: 'fail' }, then: { tls: 'fail' } }]);
    const plan = await translate(doc, { day: '2024-03-01' });
    const watch = Object.fromEntries((plan.publish as unknown as { watch: [number, Record<string, unknown>][] }).watch.map(([n, w]) => [plan.nodes[n]!.origin, w]));
    expect(watch.tls!.scope).toEqual({ table: 'apps_file', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes'" });
    expect(watch.tls!.needs).toEqual([]);
    expect(watch.posture!.scope).toBeNull();
    expect(watch.posture!.needs).toEqual([{ table: null, key: null, when: [['key_rotation', ['pass']]], then: [['encryption', ['exception', 'pass']]] }, { table: 'tls_file', key: 'app_id', when: [['status', ['fail']]], then: [['tls', ['fail']]] }]);
  });

  it('refuses a rule on a name that isn’t a source, and a rule that isn’t shaped as one', async () => {
    const issues = async (cells: string) => (await stepsOfNotebooks(flow(NB.replace(/cell\('tls_gate'\);[\s\S]*?\n\n?cell\('posture'/, `${cells}\ncell('posture'`)), ts)).issues.map((i) => i.message);
    // A step named as the inventory: smaltnb says it is read before it is defined, and the gate says it isn't a source.
    expect(await issues("cell('tls_gate');\nexport const tls_gate = gate(tls, { scope: { of: posture, key: 'app_id', where: 'x' } });\n")).toEqual(['defined-later: "posture" is defined further down, in cell "posture". A notebook reads top to bottom: move this cell below it.', "gate(tls, …): scope.of names a source of the flow; posture isn't one"]);
    expect(await issues("cell('tls_gate');\nexport const tls_gate = gate(tls, { scope: { of: nobody, key: 'app_id', where: 'x' } });\n")).toEqual(["gate(tls, …): scope.of names a source of the flow; nobody isn't one"]);
    expect(await issues("cell('tls_gate');\nexport const tls_gate = gate(tls, { scope: { of: apps, where: 'x' } });\n")).toEqual(['gate(tls, …): scope is { of: a source, key, where, own? }: the inventory, its key column, the condition a key in scope meets, and the node’s own key column when it differs']);
    expect(await issues("cell('tls_gate');\nexport const tls_gate = gate(tls, { needs: { when: { a: 'x' } } });\n")).toEqual(['gate(tls, …): needs is { when: { column: value }, then: { column: value }, from?: a source, key? }: a row matching when must match then (a value may be a list), within the row or, with from and key, against the other dataset’s row with the same key']);
  });
});

describe('the counts in the engine', () => {
  it('counts rows out of scope, keys in scope with no row, and contradictions, within the row and across a key', async () => {
    const db = Database.openMemory({ plugins: [io] });
    try {
      db.exec("CREATE TABLE apps_file(app_id TEXT, internet_facing TEXT); INSERT INTO apps_file VALUES ('a1','yes'),('a2','yes'),('a3','no'),('a4','yes'),(NULL,'yes')");
      db.exec("CREATE TABLE tls_file(app_id TEXT, status TEXT, protocol TEXT); INSERT INTO tls_file VALUES ('a1','pass','TLS1.3'),('a2','fail','TLS1.0'),('a3','pass','TLS1.2'),('zz','pass','TLS1.2'),(NULL,'pass','TLS1.2')");
      const read = 'SELECT * FROM tls_file';
      const scope = (await db.queryAsync(emitScopeCounts(read, { table: 'apps_file', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes'" }))).rows[0]!;
      // a3 isn't internet-facing, zz isn't in the inventory, the blank key is nowhere: three out of scope; a4 has no row.
      expect(scope.map(Number)).toEqual([3, 1, 3]);
      const needs = (await db.queryAsync(emitNeedsCounts(read, [
        { table: null, key: null, when: [['protocol', ['TLS1.0', 'TLS1.2']]], then: [['status', ['fail']]] },
        { table: 'apps_file', key: 'app_id', when: [['internet_facing', ['no']]], then: [['status', ['fail', 'exception']]] },
      ]))).rows[0]!;
      // Old protocols must fail: a3 and zz and the blank pass on TLS1.2 (three). An app not internet-facing must not pass: a3 (one).
      expect(needs.map(Number)).toEqual([3, 1]);
    } finally {
      db.close();
    }
  });
});

/** A day's measures of a two-column file with the rules' counts as given. */
function ruled(day: string, o: { out: number; missing: number; inScope: number; needs: number[] }, settings = true): Measures {
  const s: MeasureSettings = { source: 'tls', slot: day, every: 'day', checks: null, counting: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, ...(settings ? { scope: { table: 'apps_file', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes'" }, needs: [{ table: null, key: null, when: [['key_rotation', ['pass']]], then: [['encryption', ['pass']]] }] } : {}) };
  const scan: unknown[][] = [];
  for (let i = 0; i < 200; i++) scan.push([i % 20 === 0 ? 'fail' : 'pass']);
  const facts: unknown[] = [200, 200, 200, null, null, null, 200, 2, null, null, null];
  return measuresOf(s, { file: null, snapshot: 'x', schema: [['app_id', 'text'], ['status', 'text']], facts, sample: [], scan, checks: null, scope: settings ? [o.out, o.missing, o.inScope] : null, needs: settings ? o.needs : null });
}

describe('the counts in the history, and the judge', () => {
  it('keeps the counts only where the gate writes a rule, and the record without them is the record it was', () => {
    const m = ruled('2024-03-01', { out: 2, missing: 0, inScope: 198, needs: [0] });
    expect(m.gate).toEqual({ scope: { out: 2, missing: 0, inScope: 198 }, needs: [0] });
    const { gate: _g, ...rest } = m;
    expect(rest).toEqual(ruled('2024-03-01', { out: 2, missing: 0, inScope: 198, needs: [0] }, false));
    expect(ruled('2024-03-01', { out: 2, missing: 0, inScope: 198, needs: [0] }, false).gate).toBeUndefined();
  });

  it('holds at five rows or more past twice the usual, and says a few as a note; the rule leads the day', () => {
    const first = ruled('2024-01-01', { out: 2, missing: 0, inScope: 198, needs: [0] });
    const start = emptyHistory({ flow: 'scoped', source: 'tls', settings: { checks: null, counted: ['status'], followed: [], paired: [], time: null, zone: null, sample: 2000, scope: { table: 'apps_file', key: 'app_id', own: 'app_id', where: "internet_facing = 'yes'" }, needs: [{ table: null, key: null, when: [['key_rotation', ['pass']]], then: [['encryption', ['pass']]] }] }, columns: first.columns, types: first.types, kinds: first.kinds, warmup: 3 });
    const ms: Measures[] = [];
    for (let i = 0; i < 40; i++) ms.push(ruled(plusDays('2024-01-01', i), { out: i % 3 === 0 ? 2 : 1, missing: 0, inScope: 198, needs: [0] }));
    const creep = plusDays('2024-01-01', 40);
    ms.push(ruled(creep, { out: 40, missing: 0, inScope: 198, needs: [0] }));
    ms.push(ruled(plusDays(creep, 1), { out: 1, missing: 41, inScope: 198, needs: [0] }));
    ms.push(ruled(plusDays(creep, 2), { out: 1, missing: 0, inScope: 198, needs: [41] }));
    const h = new HistoryRanges(appendPeriods(start, ms), { pattern: 'none' });
    const judge = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.bronze, pattern: 'none' as const, legacy: false, needs: [{ when: { key_rotation: 'pass' }, then: { encryption: 'pass' } }] };
    const names = { ...vendorNames, noun: (n?: number) => (n === 1 ? 'app' : 'apps') };
    const calm = newsOf(h, plusDays('2024-01-01', 39), names, { judge });
    expect(calm.find((f) => f.kind === 'scope')).toMatchObject({ severity: 'note', title: '2 apps out of scope', check: 'scope' });
    const out = newsOf(h, creep, names, { judge });
    expect(out.find((f) => f.key === 'scope:out')).toMatchObject({ severity: 'alert', title: '40 apps out of scope', check: 'scope', rows: 40 });
    expect(out.find((f) => f.key === 'scope:out')!.detail).toMatch(/^Rows whose key the inventory doesn’t list in scope, beside 198 keys in scope\. A day like it has \d–\d\.$/);
    expect(storyOf(h, creep, out, { names, judge }).head).toBe('40 apps out of scope');
    const missing = newsOf(h, plusDays(creep, 1), names, { judge });
    expect(missing.find((f) => f.key === 'scope:missing')).toMatchObject({ severity: 'alert', title: '41 in scope with no app', check: 'scope' });
    // A dependency is silver's check (bronze's default is off): under silver's defaults it holds, under bronze's nothing is said.
    const silver = { ...judge, checks: LAYER_DEFAULTS.silver };
    const needs = newsOf(h, plusDays(creep, 2), names, { judge: silver });
    expect(needs.find((f) => f.kind === 'needs')).toMatchObject({ severity: 'alert', title: '41 apps: key_rotation pass needs encryption pass', check: 'needs' });
    expect(storyOf(h, plusDays(creep, 2), needs, { names, judge: silver }).state).toBe('wrong');
    expect(newsOf(h, plusDays(creep, 2), names, { judge }).some((f) => f.kind === 'needs')).toBe(false);
  });
});

describe('a finding explained upstream (ADR 0014 §2)', () => {
  it('tells a step’s finding about a column named for a source as following from that source, whatever its day said, and the day isn’t held by it', () => {
    // The taxi history's vendor column stands in for a step's column named for a source "VendorID".
    const h = new HistoryRanges(historyWith({ '2023-10-11': { vendorGone: true } }));
    const judge = { ...LEGACY_JUDGE, checks: LAYER_DEFAULTS.silver };
    const found = newsOf(h, '2023-10-11', vendorNames, { judge });
    const own = storyOf(h, '2023-10-11', found, { names: vendorNames, judge });
    expect(own.state).toBe('wrong');
    const explained = storyOf(h, '2023-10-11', found, { names: vendorNames, judge, upstream: [{ source: 'VendorID', state: 'wrong', head: 'Almost no apps: 0' }] });
    const gone = explained.findings.find((f) => f.key === 'gone:VendorID=1')!;
    expect(gone.tier).toBe('follows');
    expect(gone.because).toBe('upstream:VendorID');
    // The step's rows are its sources': with a source wrong upstream, its amount follows from it too.
    expect(explained.findings.find((f) => f.kind === 'volume')).toMatchObject({ tier: 'follows', because: 'upstream:VendorID' });
    expect(explained.state).not.toBe('wrong');
    // A source merely unusual upstream explains the column it names, not the amount.
    const unusual = storyOf(h, '2023-10-11', found, { names: vendorNames, judge, upstream: [{ source: 'VendorID', state: 'unusual', head: 'Vendor 1 fewer' }] });
    expect(unusual.findings.find((f) => f.key === 'gone:VendorID=1')!.tier).toBe('follows');
    expect(unusual.findings.find((f) => f.kind === 'volume')!.tier).not.toBe('follows');
    // A calm source upstream still owns its column: the source's gate judges it, and says it is as usual.
    const calm = storyOf(h, '2023-10-11', found, { names: vendorNames, judge, upstream: [{ source: 'VendorID', state: 'calm', head: 'A normal day' }] });
    expect(calm.findings.find((f) => f.key === 'gone:VendorID=1')).toMatchObject({ tier: 'follows', because: 'upstream:VendorID' });
    expect(calm.findings.find((f) => f.kind === 'volume')!.tier).not.toBe('follows');
    // A source nothing names explains nothing while its own day is fine; one with something wrong explains the step's
    // whole day, since the step's rows are its sources'.
    const other = storyOf(h, '2023-10-11', found, { names: vendorNames, judge, upstream: [{ source: 'weather', state: 'notes', head: 'x' }] });
    expect(other.findings.find((f) => f.key === 'gone:VendorID=1')!.tier).not.toBe('follows');
    const wrongOther = storyOf(h, '2023-10-11', found, { names: vendorNames, judge, upstream: [{ source: 'weather', state: 'wrong', head: 'x' }] });
    expect(wrongOther.findings.find((f) => f.key === 'gone:VendorID=1')).toMatchObject({ tier: 'follows', because: 'upstream:weather' });
    expect(wrongOther.state).not.toBe('wrong');
    // Without a gate, a flow is judged as it always was (ADR 0013's controls): nothing upstream is read.
    const ungated = storyOf(h, '2023-10-11', newsOf(h, '2023-10-11', vendorNames), { names: vendorNames, upstream: [{ source: 'VendorID', state: 'wrong', head: 'x' }] });
    expect(ungated.state).toBe('wrong');
  });
});
