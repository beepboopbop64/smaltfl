/**
 * A starting file's shared ontology (src/core/shared.ts, Q-148): the sign-in file's meanings and rules in
 * examples/ontologies/auth.json, imported by the two flows that read the file (Sign-ins and Lock-outs). A change to it
 * reaches both: their plans enforce it and their check cells list it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { syncRuleCells } from '../src/core/gatecell.js';
import { expandNotebooks, loadNotebooks } from '../src/core/notebook.js';
import { rulesOf } from '../src/core/rules.js';
import { asShared, importOntologies, sharedOf, SharedOntologyError, type SharedOntology } from '../src/core/shared.js';
import { translate } from '../src/index.js';
import { ts } from './helpers/notebooks.js';

const examples = new URL('../examples/', import.meta.url);
const AUTH = JSON.parse(readFileSync(new URL('ontologies/auth.json', examples), 'utf8')) as SharedOntology;
const FLOWS = { signins: { dir: 'security-signins/', check: 'auth_valid' }, lockouts: { dir: 'security-lockouts/', check: 'signins_checked' } } as const;

/** A flow folder read as readFlow reads it, with the shared file given (the one on disk, or one changed). */
async function flow(name: keyof typeof FLOWS, shared: SharedOntology = AUTH): Promise<FlowDocument> {
  const dir = new URL(FLOWS[name].dir, examples);
  const raw = await importOntologies(JSON.parse(readFileSync(new URL('flow.json', dir), 'utf8')) as FlowDocument, async (p) => (p === '../ontologies/auth.json' ? structuredClone(shared) : JSON.parse(readFileSync(new URL(p, dir), 'utf8'))));
  const loaded = await loadNotebooks(raw, async (p) => readFileSync(new URL(p, dir), 'utf8'));
  return syncRuleCells(await expandNotebooks(loaded as FlowDocument, ts));
}
/** The ontology's rules a flow's check step enforces on the day, by name, as the plan carries them. */
async function enforced(doc: FlowDocument, step: string): Promise<string[]> {
  const n = (await translate(doc, { day: '2024-03-11' })).nodes.find((x) => x.origin === step);
  const own = doc.steps.find((s) => s.id === step);
  return n?.op === 'expect' && own?.kind === 'expectations' ? n.rules.slice(own.rules.length).map(([name]) => name) : [];
}
const cellOf = (doc: FlowDocument, step: string) => {
  const ref = doc.cells![step]!;
  return doc.notebooks!.find((n) => n.path === ref.notebook)!.source.split('\n').slice(ref.line - 1, ref.endLine).join('\n');
};

describe('the sign-in file’s shared ontology', () => {
  it('is brought into both flows that read the file: the same meanings, the same rules, enforced by each one’s check cell', async () => {
    for (const name of ['signins', 'lockouts'] as const) {
      const doc = await flow(name);
      expect(validateDocument(doc), name).toEqual([]);
      expect(doc.ontology?.shared, name).toEqual([{ file: 'auth', path: '../ontologies/auth.json', columns: ['event_time', 'result', 'method', 'country', 'ua_family', 'latency_ms', 'user'] }]);
      expect(rulesOf(doc.ontology, 'auth').map((r) => r.id), name).toEqual(['method_one_of', 'latency_ms_range', 'country_required']);
      expect(doc.ontology?.properties?.find((p) => p.column === 'result')?.values, name).toEqual({ success: 'Signed in', fail: 'Failed', locked: 'Locked out' });
      expect(doc.ontology?.nouns?.auth, name).toEqual({ one: 'sign-in', many: 'sign-ins' });
      expect(await enforced(doc, FLOWS[name].check), name).toEqual(['method_one_of', 'latency_ms_range', 'country_required']);
    }
  });

  it('carries a change to the shared file into both: a rule added and one taken away, in their plans and their cells', async () => {
    const changed: SharedOntology = { ...AUTH, rules: [...AUTH.rules!.filter((r) => r.id !== 'country_required'), { id: 'user_required', column: 'user', kind: 'required', action: 'drop' }] };
    for (const name of ['signins', 'lockouts'] as const) {
      const doc = await flow(name, changed);
      expect(validateDocument(doc), name).toEqual([]);
      expect(await enforced(doc, FLOWS[name].check), name).toEqual(['method_one_of', 'latency_ms_range', 'user_required']);
      expect(cellOf(doc, FLOWS[name].check), name).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'on', user_required: 'on' },");
    }
  });

  it('keeps each flow’s own switches when the shared file changes', async () => {
    // A cell that switched Latency off keeps it off when another rule joins.
    const dir = new URL(FLOWS.lockouts.dir, examples);
    const nb = readFileSync(new URL('lockouts.nb.ts', dir), 'utf8').replace("latency_ms_range: 'on'", "latency_ms_range: 'off'");
    const changed: SharedOntology = { ...AUTH, rules: [...AUTH.rules!, { id: 'user_required', column: 'user', kind: 'required', action: 'flag' }] };
    const raw = await importOntologies(JSON.parse(readFileSync(new URL('flow.json', dir), 'utf8')) as FlowDocument, async () => structuredClone(changed));
    const doc = syncRuleCells(await expandNotebooks((await loadNotebooks(raw, async () => nb)) as FlowDocument, ts));
    expect(cellOf(doc, 'signins_checked')).toContain("ontology: { method_one_of: 'on', latency_ms_range: 'off', country_required: 'on', user_required: 'on' },");
    expect(await enforced(doc, 'signins_checked')).toEqual(['method_one_of', 'country_required', 'user_required']);
  });

  it('is written back as it was read, and with a flow’s edits', async () => {
    const doc = await flow('lockouts');
    expect(sharedOf(doc, 'auth')).toEqual(AUTH);
    const edited: FlowDocument = { ...doc, ontology: { ...doc.ontology!, rules: [...doc.ontology!.rules!, { id: 'user_required', file: 'auth', column: 'user', kind: 'required', action: 'flag' }] } };
    expect(sharedOf(edited, 'auth').rules?.at(-1)).toEqual({ id: 'user_required', column: 'user', kind: 'required', action: 'flag' });
  });

  it('says a meaning in one place: a flow describing the shared file’s column again, or naming a rule as a shared one is named, is refused', async () => {
    const doc = await flow('lockouts');
    const twice: FlowDocument = { ...doc, ontology: { ...doc.ontology!, properties: [...doc.ontology!.properties!, { column: 'result', title: 'Outcome', description: 'x' }] } };
    expect(validateDocument(twice).map((i) => i.message)).toContain('result is described twice');
    const again: FlowDocument = { ...doc, ontology: { ...doc.ontology!, rules: [...doc.ontology!.rules!, { id: 'method_one_of', file: 'auth', column: 'method', kind: 'required', action: 'flag' }] } };
    expect(validateDocument(again).map((i) => i.message)).toContain('auth has two rules named method_one_of (names are compared without case)');
  });

  it('refuses what isn’t a shared ontology, one about a file the flow doesn’t read, and a flow never read with its imports', async () => {
    expect(() => asShared({ file: 'auth' }, 'x.json')).toThrow(SharedOntologyError);
    expect(() => asShared({ smaltflOntology: 1, file: 'auth', colour: 'red' }, 'x.json')).toThrow(/colour isn't/);
    expect(() => asShared({ smaltflOntology: 1, file: 'auth', rules: [{ id: 'a', file: 'auth' }] }, 'x.json')).toThrow(/names none/);
    const raw = JSON.parse(readFileSync(new URL('security-lockouts/flow.json', examples), 'utf8')) as FlowDocument;
    await expect(importOntologies(raw, async () => ({ ...AUTH, file: 'trips' }))).rejects.toThrow(/which this flow doesn't read/);
    expect(validateDocument(raw).map((i) => i.path)).toContain('$.ontology.import');
  });
});
