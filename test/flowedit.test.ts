/**
 * Names and labels, and edits that stay (ADR 0015 amendment 1; src/core/flowedit.ts): a label is shown only where it
 * says more than the thing it labels (`saysMore`); a column renamed in one file is that file's own, and what the plan
 * carries for any file stays as it was (`nameColumn`); an accepted band says what it did (`applyBand`); the edited
 * document is kept across a reload by the shipped document's flow hash, and dropped when that changes (`keptOf`,
 * `restoreKept`); the flow as shipped again (`asShipped`). The control estate is the document most of it is asserted
 * on; a run before and after a rename goes through the engine, and both verify.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument, withoutDisplay, type FlowDocument } from '../src/core/document.js';
import { applyBand, asShipped, keptOf, nameColumn, restoreKept, stepsPrint, type FlowEdit } from '../src/core/flowedit.js';
import { toggleCheck } from '../src/core/gatecell.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { marksOn, meaningBeyond, plainOf, propertyOf, saysMore, type Ontology, type PropertyType } from '../src/core/ontology.js';
import { ontologyPage } from '../src/core/ontologypage.js';
import { flowHash, translate } from '../src/core/plan.js';
import { runFlow, verifyRun } from '../src/index.js';
import { loadFixture, makeTrips, visualFlow } from './fixtures/taxi.js';
import { openEngine, SMALTDB } from './helpers/engine.js';
import { estateDir } from './helpers/estate-world.js';
import { loadFlowDir, ts } from './helpers/notebooks.js';

const estate = () => loadFlowDir(estateDir);
const props = (doc: FlowDocument, column: string) => (doc.ontology?.properties ?? []).filter((p) => p.column === column);
/** What a reload does to what the page keeps: written as JSON, read back. */
const reloaded = (kept: unknown): unknown => JSON.parse(JSON.stringify(kept));

describe('a label that only repeats the thing', () => {
  it('sets aside case, spaces, underscores, hyphens, other punctuation and accents', () => {
    expect(plainOf('Not assessed')).toBe('notassessed');
    expect(plainOf('not_assessed')).toBe('notassessed');
    expect(plainOf('Internet-facing')).toBe('internetfacing');
    expect(plainOf('TLS 1.0')).toBe(plainOf('TLS1.0'));
    expect(plainOf('Café, déjà')).toBe('cafedeja');
    expect(plainOf(' — ')).toBe('');
  });

  it('says more only when it is another word: the maintainer’s cases', () => {
    // "yes means yes, no means no": the same thing written again says nothing more.
    for (const [value, label] of [['yes', 'Yes'], ['no', 'No'], ['aws', 'AWS'], ['not_assessed', 'Not assessed'], ['Retail', 'Retail'], ['TLS1.2', 'TLS 1.2'], ['name', 'Name'], ['business_unit', 'Business unit'], ['internet_facing', 'Internet-facing']] as const) {
      expect(saysMore(label, value), `${label} for ${value}`).toBe(false);
    }
    for (const [value, label] of [['pci', 'Card data'], ['pass', 'Passing'], ['onprem', 'On premises'], ['mongo', 'MongoDB'], ['app_id', 'Application'], ['cert_days_left', 'Certificate days left'], ['1', 'Credit card']] as const) {
      expect(saysMore(label, value), `${label} for ${value}`).toBe(true);
    }
    // It reads both ways: a column's name as written beside its title, and a title beside the name.
    expect(saysMore('app_id', 'Application')).toBe(true);
    expect(saysMore('status', 'Status')).toBe(false);
    // No label, an empty one, or one with no letter or digit in it says nothing; a value that isn't text is read as text.
    expect(saysMore(undefined, 'x')).toBe(false);
    expect(saysMore(null, 'x')).toBe(false);
    expect(saysMore('', 'x')).toBe(false);
    expect(saysMore('—', 'x')).toBe(false);
    expect(saysMore('1', 1)).toBe(false);
    expect(saysMore('Credit card', 1)).toBe(true);
    expect(saysMore('None', null)).toBe(true);
  });

  it('gives a value’s meaning only where it says more than the value', async () => {
    const doc = await estate();
    const of = (column: string) => propertyOf(doc.ontology, 'apps', column);
    expect(meaningBeyond(of('data_class'), 'pci')).toBe('Card data');
    expect(meaningBeyond(of('data_class'), 'internal')).toBeUndefined();
    expect(meaningBeyond(of('internet_facing'), 'yes')).toBeUndefined();
    expect(meaningBeyond(of('hosting'), 'onprem')).toBe('On premises');
    expect(meaningBeyond(of('hosting'), 'elsewhere')).toBeUndefined();
    expect(meaningBeyond(undefined, 'yes')).toBeUndefined();
  });

  it('lists on a card only the values that stand for something else, and a name as written only beside another word', async () => {
    const { files } = ontologyPage(await estate(), (file) => ({ apps: ['app_id', 'name', 'business_unit', 'internet_facing', 'data_class', 'hosting'], tls: ['app_id', 'hostname', 'protocol', 'status'] })[file]);
    const card = (file: string, column: string) => files.find((f) => f.id === file)!.columns!.find((c) => c.name === column)!;
    // Six units named as themselves, yes and no: no list is offered. Two of the four data classes say more.
    expect(card('apps', 'business_unit').values).toHaveLength(6);
    expect(card('apps', 'business_unit').standFor).toEqual([]);
    expect(card('apps', 'internet_facing').standFor).toEqual([]);
    expect(card('apps', 'data_class').standFor).toEqual([['pci', 'Card data'], ['pii', 'Personal data']]);
    expect(card('apps', 'hosting').standFor).toEqual([['onprem', 'On premises']]);
    expect(card('tls', 'protocol').standFor).toEqual([]);
    expect(card('tls', 'status').standFor).toEqual([['pass', 'Passing'], ['fail', 'Failing']]);
    // "Name name" is one word; "Application app_id" keeps both, and so does "Host hostname".
    expect(files.flatMap((f) => (f.columns ?? []).map((c) => [f.id, c.title, c.asWritten]))).toEqual([
      ['apps', 'Application', 'app_id'], ['apps', 'Name', undefined], ['apps', 'Business unit', undefined], ['apps', 'Internet-facing', undefined], ['apps', 'Data class', undefined], ['apps', 'Hosting', undefined],
      ['tls', 'Application', 'app_id'], ['tls', 'Host', 'hostname'], ['tls', 'Protocol', undefined], ['tls', 'Status', undefined],
    ]);
  });
});

describe('a column renamed in one file', () => {
  it('is that file’s own: no other file’s name moves, and the plan carries the same marks for every file', async () => {
    const doc = await estate();
    const { doc: next, said } = nameColumn(doc, 'tls', 'status', { title: 'Result' });
    expect(said).toBe('Renamed status to Result in tls');
    expect(validateDocument(next)).toEqual([]);
    // The file's own entry, after the dictionary's, which stands as it was.
    expect(props(next, 'status').map((p) => [p.title, p.datasets])).toEqual([['Status', undefined], ['Result', ['tls']]]);
    expect(props(next, 'status')[0]).toBe(props(doc, 'status')[0]);
    expect(propertyOf(next.ontology, 'tls', 'status')!.title).toBe('Result');
    for (const other of ['waf', 'pentest', 'mfa', 'vuln_sla']) expect(propertyOf(next.ontology, other, 'status')!.title).toBe('Status');
    // Its meaning, its values and its marks came along; of the bands, only the ones that apply to this file (the
    // WAF's own band on Failing says nothing in TLS).
    const general = props(doc, 'status')[0]!;
    const own = propertyOf(next.ontology, 'tls', 'status')!;
    expect(own).toMatchObject({ column: 'status', description: general.description, values: general.values, bad: ['fail'], newValues: 'alert' });
    expect(general.expect).toEqual([{ value: 'not_assessed', share: [0, 0.05] }, { value: 'fail', share: [0, 0.15], datasets: ['waf'] }]);
    expect(own.expect).toEqual([{ value: 'not_assessed', share: [0, 0.05] }]);
    // What the plan carries for a file is what it was, for the file renamed and for every other.
    for (const s of doc.sources) expect(marksOn(next.ontology, s.id), s.id).toEqual(marksOn(doc.ontology, s.id));
    const [before, after] = [await translate(doc, { day: '2024-03-04' }), await translate(next, { day: '2024-03-04' })];
    expect(after.flow.hash).not.toBe(before.flow.hash);
    expect({ ...after, flow: null }).toEqual({ ...before, flow: null });
    // The page: the new name with the file's own beside it, in this file alone; its rules speak of it by the new name.
    const cols = () => ['app_id', 'status', 'next_due'];
    const card = (d: FlowDocument, file: string) => ontologyPage(d, cols).files.find((f) => f.id === file)!.columns!.find((c) => c.name === 'status')!;
    expect(card(next, 'tls')).toMatchObject({ name: 'status', title: 'Result', asWritten: 'status' });
    expect(card(next, 'waf')).toMatchObject({ name: 'status', title: 'Status' });
    expect(card(next, 'waf').asWritten).toBeUndefined();
    expect(card(next, 'tls').rules.map((r) => r.id)).toEqual(card(doc, 'tls').rules.map((r) => r.id));
    const due = (d: FlowDocument) => ontologyPage(d, cols).files.find((f) => f.id === 'pentest')!.columns!.find((c) => c.name === 'next_due')!.rules[0]!.said;
    expect(due(nameColumn(doc, 'pentest', 'status', { title: 'Result' }).doc)).toBe(due(doc).replace('its Status is', 'its Result is'));
  });

  it('edits the file’s own entry in place the second time, and takes a name away by leaving it empty', async () => {
    const doc = await estate();
    const once = nameColumn(doc, 'tls', 'status', { title: 'Result' }).doc;
    const twice = nameColumn(once, 'tls', 'status', { title: ' Outcome ', description: 'How the check came out' });
    expect(twice.said).toBe('Renamed status to Outcome and reworded what status means in tls');
    expect(props(twice.doc, 'status').map((p) => [p.title, p.description.slice(0, 22), p.datasets])).toEqual([['Status', 'Whether the applicatio', undefined], ['Outcome', 'How the check came out', ['tls']]]);
    expect(validateDocument(twice.doc)).toEqual([]);
    // Left empty, it is called as the file writes it: the file's own name never changes, and is never lost.
    const bare = nameColumn(twice.doc, 'tls', 'status', { title: '' });
    expect(bare.said).toBe('Renamed status to status in tls');
    expect(propertyOf(bare.doc.ontology, 'tls', 'status')).toMatchObject({ column: 'status', title: 'status' });
    // Nothing changed is no edit: the same document, and nothing to record.
    const same = nameColumn(once, 'tls', 'status', { title: 'Result', description: propertyOf(once.ontology, 'tls', 'status')!.description, values: { pass: 'Passing', fail: 'Failing', unseen: '' } });
    expect(same.said).toBeNull();
    expect(same.doc).toBe(once);
  });

  it('labels a value, takes a label away, and gives a column nothing describes its first entry', async () => {
    const doc = await estate();
    const labelled = nameColumn(doc, 'apps', 'data_class', { values: { internal: 'Staff only', pci: 'Card data', restricted: 'Board only' } });
    expect(labelled.said).toBe('Labelled data_class’s internal as Staff only and labelled data_class’s restricted as Board only in apps');
    expect(propertyOf(labelled.doc.ontology, 'apps', 'data_class')).toMatchObject({ datasets: ['apps'], values: { pci: 'Card data', pii: 'Personal data', internal: 'Staff only', public: 'Public', restricted: 'Board only' } });
    expect(validateDocument(labelled.doc)).toEqual([]);
    // A label taken off a listed value leaves the value itself, which is shown nowhere as a label; the list of values
    // stays what it was (a bad value must stay listed: `fail` here).
    const off = nameColumn(doc, 'tls', 'status', { values: { fail: '', pass: ' ' } });
    expect(off.said).toBe('Took the label off status’s fail and took the label off status’s pass in tls');
    const own = propertyOf(off.doc.ontology, 'tls', 'status')!;
    expect(own.values).toEqual({ pass: 'pass', fail: 'fail', exception: 'Exception', not_assessed: 'Not assessed' });
    expect(meaningBeyond(own, 'fail')).toBeUndefined();
    expect(validateDocument(off.doc)).toEqual([]);
    expect(marksOn(off.doc.ontology, 'tls')).toEqual(marksOn(doc.ontology, 'tls'));
    // A field left empty for a value whose label says no more than the value (the form shows none for it): no change.
    expect(nameColumn(doc, 'tls', 'status', { values: { exception: '', not_assessed: '' } })).toEqual({ doc, said: null });
    expect(nameColumn(doc, 'apps', 'internet_facing', { title: 'Internet-facing', values: { yes: '', no: '' } }).said).toBeNull();
    // A column the ontology doesn't describe: its first entry is this file's own, with what was typed.
    const first = nameColumn(doc, 'tls', 'checked_by', { title: 'Checked by', values: { ops: 'Operations' } });
    expect(first.said).toBe('Renamed checked_by to Checked by and labelled checked_by’s ops as Operations in tls');
    expect(props(first.doc, 'checked_by')).toEqual([{ column: 'checked_by', title: 'Checked by', description: '', values: { ops: 'Operations' }, datasets: ['tls'] }]);
    expect(validateDocument(first.doc)).toEqual([]);
  });

  it('takes the file out of an entry several files share, and writes an ontology where a flow had none', () => {
    const shared: PropertyType = { column: 'code', title: 'Code', description: 'A code', values: { a: 'Alpha' }, datasets: ['left', 'right'], expect: [{ value: 'a', share: [0, 0.5], datasets: ['right'] }] };
    const ontology: Ontology = { objectTypes: [], linkTypes: [], actionTypes: [], properties: [shared, { column: 'code', title: 'Any code', description: 'Elsewhere' }] };
    const doc = { smaltfl: 4, id: 'x', name: 'X', sources: [{ id: 'left', table: 'l' }, { id: 'right', table: 'r' }, { id: 'third', table: 't' }], steps: [], ontology } as unknown as FlowDocument;
    const { doc: next, said } = nameColumn(doc, 'Left', 'code', { title: 'Short code' });
    expect(said).toBe('Renamed code to Short code in Left');
    expect(next.ontology!.properties).toEqual([
      { ...shared, datasets: ['right'] },
      // The band for the other file alone doesn't come along.
      { column: 'code', title: 'Short code', description: 'A code', values: { a: 'Alpha' }, datasets: ['Left'] },
      { column: 'code', title: 'Any code', description: 'Elsewhere' },
    ]);
    expect(propertyOf(next.ontology, 'left', 'code')!.title).toBe('Short code');
    expect(propertyOf(next.ontology, 'right', 'code')!.title).toBe('Code');
    expect(propertyOf(next.ontology, 'third', 'code')!.title).toBe('Any code');
    const { ontology: _none, ...bare } = doc;
    const made = nameColumn(bare as FlowDocument, 'left', 'code', { title: 'Short code' });
    expect(made.doc.ontology).toEqual({ objectTypes: [], linkTypes: [], actionTypes: [], properties: [{ column: 'code', title: 'Short code', description: '', datasets: ['left'] }] });
  });
});

describe('an accepted band', () => {
  it('is written for the source alone, and says what it did in the ontology’s words', async () => {
    const doc = await estate();
    const banded = applyBand(doc, 'waf', { column: 'status', value: 'fail', share: [0, 0.625] })!;
    expect(banded.said).toBe('Accepted a new band in waf: Status Failing between 0% and 62.5%');
    expect(props(banded.doc, 'status')[0]!.expect).toEqual([{ value: 'not_assessed', share: [0, 0.05] }, { value: 'fail', share: [0, 0.625], datasets: ['waf'] }]);
    // A value with no band for the source gets the source's own; the general band stays for the other files.
    const first = applyBand(doc, 'tls', { column: 'status', value: 'not_assessed', share: [0, 0.2] })!;
    expect(first.said).toBe('Accepted a new band in tls: Status Not assessed between 0% and 20%');
    expect(marksOn(first.doc.ontology, 'tls').expect).toEqual([['status', 'not_assessed', 0, 0.2]]);
    expect(marksOn(first.doc.ontology, 'mfa').expect).toEqual(marksOn(doc.ontology, 'mfa').expect);
    // On a file that has its own name for the column, the band goes on the file's own entry, said by that name.
    const named = nameColumn(doc, 'waf', 'status', { title: 'Result' }).doc;
    const own = applyBand(named, 'waf', { column: 'status', value: 'fail', share: [0, 0.3] })!;
    expect(own.said).toBe('Accepted a new band in waf: Result Failing between 0% and 30%');
    expect(marksOn(own.doc.ontology, 'waf').expect).toEqual([['status', 'fail', 0, 0.3], ['status', 'not_assessed', 0, 0.05]]);
    expect(marksOn(own.doc.ontology, 'tls').expect).toEqual(marksOn(doc.ontology, 'tls').expect);
    expect(validateDocument(own.doc)).toEqual([]);
    // No ontology, or a column it doesn't describe: nothing to write.
    expect(applyBand(doc, 'waf', { column: 'nowhere', value: 'x', share: [0, 1] })).toBeNull();
  });
});

describe('what the page keeps of an edited flow', () => {
  const edits: FlowEdit[] = [{ at: '2026-11-10T10:00:00.000Z', said: 'Set the classifier check on tls to warn (it was off), from the Checks tab' }, { at: '2026-11-10T10:01:00.000Z', said: 'Renamed status to Result in tls' }, { at: '2026-11-10T10:02:00.000Z', said: 'Accepted a new band in waf: Status Failing between 0% and 62.5%, by decision #9' }];

  /** A gate toggle, a rename and an accepted band on the estate: the three kinds of edit the page keeps. */
  async function edited(): Promise<{ shipped: FlowDocument; doc: FlowDocument; base: string }> {
    const shipped = await estate();
    const toggled = toggleCheck(shipped, 'tls', 'classifier', 'warn').doc;
    const named = nameColumn(toggled, 'tls', 'status', { title: 'Result' }).doc;
    const doc = applyBand(named, 'waf', { column: 'status', value: 'fail', share: [0, 0.625] })!.doc;
    return { shipped, doc, base: await flowHash(shipped) };
  }

  it('comes back after a reload as the document that was edited: the same flow hash, so the next run records no revert', async () => {
    const { shipped, doc, base } = await edited();
    const kept = keptOf(doc, base, edits);
    // The arrangement is kept apart (sections and places are the browser's own), and isn't in what is kept of the flow.
    expect(kept).toMatchObject({ v: 2, base, edits });
    expect(kept.doc.groups).toBeUndefined();
    expect(kept.doc.layout).toBeUndefined();
    const back = restoreKept(shipped, base, reloaded(kept));
    if (back.state !== 'kept') throw new Error(`not kept: ${back.state}`);
    expect(back.edits).toEqual(edits);
    expect(validateDocument(back.doc)).toEqual([]);
    // The record's last flow entry is the edited flow's hash: what is restored hashes to it, not to the shipped one.
    expect(await flowHash(back.doc)).toBe(await flowHash(doc));
    expect(await flowHash(back.doc)).not.toBe(base);
    expect(withoutDisplay(back.doc)).toEqual(withoutDisplay(doc));
    // The shipped document's sections are under it, for the browser's own arrangement to go on.
    expect(back.doc.groups).toEqual(shipped.groups);
    // Each edit is there: the gate, the file's own name, the band.
    expect(back.doc.gates!.tls!.checks.classifier).toBe('warn');
    expect(propertyOf(back.doc.ontology, 'tls', 'status')!.title).toBe('Result');
    expect(marksOn(back.doc.ontology, 'waf').expect).toContainEqual(['status', 'fail', 0, 0.625]);
  });

  it('keeps what a toggle needs: the restored document toggles again, and smaltnb derives the same from its notebooks', async () => {
    const { shipped, doc, base } = await edited();
    const back = restoreKept(shipped, base, reloaded(keptOf(doc, base, edits)));
    if (back.state !== 'kept') throw new Error(`not kept: ${back.state}`);
    expect(back.doc.cells).toEqual(doc.cells);
    expect(back.doc.outline).toEqual(doc.outline);
    // A node with no gate cell yet gets one made, from the outline; an existing cell is rewritten, from its cell ref.
    const again = toggleCheck(toggleCheck(back.doc, 'mfa', 'forest', 'off').doc, 'tls', 'classifier', 'off').doc;
    expect(again.gates!.mfa).toEqual({ layer: 'bronze', checks: { forest: 'off' } });
    expect(again.gates!.tls!.checks.classifier).toBe('off');
    const parsed = await expandNotebooks(again, ts);
    expect(parsed.gates).toEqual(again.gates);
    expect(parsed.cells).toEqual(again.cells);
    expect(parsed.outline).toEqual(again.outline);
    expect(validateDocument(again)).toEqual([]);
  });

  it('is dropped when the shipped document changed, with the edits that went with it', async () => {
    const { shipped, doc, base } = await edited();
    const kept = reloaded(keptOf(doc, base, edits));
    // A new build ships another flow (here: one description reworded): what was kept was made to another document.
    const shippedNow = { ...shipped, sources: shipped.sources.map((s, k) => (k === 0 ? { ...s, description: 'The inventory, reworded' } : s)) };
    const baseNow = await flowHash(shippedNow);
    expect(baseNow).not.toBe(base);
    expect(restoreKept(shippedNow, baseNow, kept)).toEqual({ state: 'dropped', edits, why: 'the flow as shipped changed' });
    // Another flow's, a form this version doesn't read, a document that isn't a flow: dropped too, never half used.
    expect(restoreKept({ ...shipped, id: 'another' }, base, kept)).toMatchObject({ state: 'dropped', why: 'what was kept isn’t this flow' });
    expect(restoreKept(shipped, base, { v: 3, base, doc })).toMatchObject({ state: 'dropped', edits: [] });
    expect(restoreKept(shipped, base, { v: 2, base, doc: { ...doc, sources: 'none' }, edits })).toEqual({ state: 'dropped', edits, why: 'what was kept isn’t a flow this version reads' });
    // Nothing kept is nothing to restore, and nothing dropped.
    expect(restoreKept(shipped, base, null)).toEqual({ state: 'none' });
    expect(restoreKept(shipped, base, 'steps')).toEqual({ state: 'none' });
  });

  it('still reads the first kept form, the steps alone, by the fingerprint it went by', async () => {
    const shipped = await estate();
    const base = await flowHash(shipped);
    const steps = shipped.steps.map((s, k) => (k === 0 ? { ...s, description: 'Edited before this version' } : s));
    const back = restoreKept(shipped, base, reloaded({ v: 1, base: stepsPrint(shipped.steps), steps }));
    if (back.state !== 'kept') throw new Error(`not kept: ${back.state}`);
    expect(back.doc.steps[0]!.description).toBe('Edited before this version');
    expect(back.doc.ontology).toBe(shipped.ontology);
    expect(back.edits).toEqual([]);
    expect(restoreKept(shipped, base, { v: 1, base: 'another', steps })).toMatchObject({ state: 'dropped', why: 'the flow as shipped changed' });
  });

  it('goes back to the flow as shipped: every edit gone, the arrangement left as it is', async () => {
    const { shipped, doc, base } = await edited();
    const arranged: FlowDocument = { ...doc, layout: { tls: [40, 80] }, groups: [...(doc.groups ?? []).map((g) => ({ ...g, collapsed: false })), { id: 'mine', name: 'Mine', steps: ['gone_step'] }], profiles: [{ id: 'tls_profile', of: 'tls' }, { id: 'lost_profile', of: 'gone_step' }] };
    const back = asShipped(arranged, shipped);
    expect(await flowHash(back)).toBe(base);
    expect(withoutDisplay(back)).toEqual(withoutDisplay(shipped));
    expect(back).not.toBe(shipped);
    expect(back.ontology).not.toBe(shipped.ontology);
    // The browser's own: its places, its sections (less a step the shipped flow doesn't have), its profile boxes.
    expect(back.layout).toEqual({ tls: [40, 80] });
    expect(back.groups!.map((g) => [g.id, g.collapsed])).toEqual([...(doc.groups ?? []).map((g) => [g.id, false]), ['mine', undefined]]);
    expect(back.groups!.at(-1)!.steps).toEqual([]);
    expect(back.profiles).toEqual([{ id: 'tls_profile', of: 'tls' }]);
    expect(validateDocument(back)).toEqual([]);
  });
});

describe('a run before and after a rename', () => {
  it('builds nothing again, carries the new flow hash, and both runs verify', async () => {
    const db = openEngine();
    loadFixture(db, makeTrips(400));
    const doc = visualFlow();
    const before = await runFlow(db, doc, { smaltdb: SMALTDB });
    const { doc: next, said } = nameColumn(doc, 'trips', 'payment_type', { title: 'Paid by', values: { 1: 'Card' } });
    expect(said).toBe('Renamed payment_type to Paid by and labelled payment_type’s 1 as Card in trips');
    expect(validateDocument(next)).toEqual([]);
    const after = await runFlow(db, next, { smaltdb: SMALTDB });
    // A name is for people: it is in the flow hash, and in no key. Every dataset is the one already built.
    expect(after.manifest.flow.hash).not.toBe(before.manifest.flow.hash);
    expect(after.manifest.flow.ontology).not.toBe(before.manifest.flow.ontology);
    expect(after.manifest.nodes.map((n) => [n.origin, n.key])).toEqual(before.manifest.nodes.map((n) => [n.origin, n.key]));
    expect(before.manifest.nodes.some((n) => n.status === 'built')).toBe(true);
    expect(after.manifest.nodes.filter((n) => n.status === 'built')).toEqual([]);
    // Verify reads each run's own document, by its flow hash: the run before the rename and the one after both hold.
    for (const r of [before, after]) {
      const v = await verifyRun(db, r.run, { smaltdb: SMALTDB, manifest: r.hash });
      expect(v.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`), `run ${r.run}`).toEqual([]);
      expect(v.checks.some((c) => c.check === 'flow' && c.ok)).toBe(true);
    }
  });
});
