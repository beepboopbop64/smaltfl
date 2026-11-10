/**
 * Toggles that write the gate cell (ADR 0014 §1, slice 6): a check set on a node's gate rewrites the notebook's `gate()`
 * cell (the `checks` property alone, every other option as written), or makes a gate cell at the end of the notebook
 * that defines the node; the document's gates, cell refs and outline are derived again by hand, and smaltnb's parser
 * agrees with them: the written notebook, expanded, is the document the toggle made.
 */
import { describe, expect, it } from 'vitest';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { checksLiteral, rewriteGateCall, toggleCheck, toggledChecks, withGateImport } from '../src/core/gatecell.js';
import { expandNotebooks } from '../src/core/notebook.js';
import { flowHash } from '../src/core/plan.js';
import { estateDir } from './helpers/estate-world.js';
import { loadFlowDir, ts } from './helpers/notebooks.js';

const SETUP = "import { cell, md, param, sql } from 'smaltnb';\nimport { check, fill, gate, publish, source } from 'smaltfl/notebook';\n";
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
const flow = (nb: string): FlowDocument =>
  ({
    smaltfl: 4, id: 'gated', name: 'Gated',
    parameters: [{ name: 'day', type: 'text', default: '2024-01-02' }],
    sources: [{ id: 'auth', table: 'auth_file' }],
    notebooks: [{ path: 'a.nb.ts', source: nb }],
    publish: { hold: ['checks', 'wrong'], period: 'day', watch: { auth: { history: 'h.json', pattern: 'none' }, by_hour: { history: 'h2.json', pattern: 'none' } } },
  }) as unknown as FlowDocument;
const GATED = `${SETUP}${BODY}
cell('auth_gate');
export const auth_gate = gate(auth, { checks: { shares: 'hold', forest: 'off' } });
`;

/** What smaltnb derives from the written notebooks, against what the toggle derived by hand. */
async function agrees(doc: FlowDocument): Promise<void> {
  const again = await expandNotebooks(doc, ts);
  expect(again.gates).toEqual(doc.gates);
  expect(again.cells).toEqual(doc.cells);
  expect(again.outline).toEqual(doc.outline);
  expect(again.steps).toEqual(doc.steps);
  expect(validateDocument(doc)).toEqual([]);
}

describe('the checks literal and the call rewritten', () => {
  it('writes the checks in the vocabulary’s order, one of them set', () => {
    expect(checksLiteral({ forest: 'off', shares: 'hold' })).toBe("{ shares: 'hold', forest: 'off' }");
    expect(checksLiteral({})).toBe('{}');
    // A check written at the layer's default stays written: the toggle changes one property, and nothing else.
    expect(toggledChecks({ shares: 'hold', forest: 'off' }, 'forest', 'warn')).toEqual({ shares: 'hold', forest: 'warn' });
    expect(toggledChecks({}, 'needs', 'off')).toEqual({ needs: 'off' });
    expect(Object.keys(toggledChecks({ forest: 'off', schema: 'hold' }, 'amount', 'warn'))).toEqual(['schema', 'amount', 'forest']);
  });

  it('rewrites the checks property alone, inserts it after the layer, makes the options, or drops it', () => {
    const scoped = "export const tls_gate = gate(tls, { layer: 'bronze', checks: { schema: 'hold', amount: 'hold' }, scope: { of: apps, key: 'app_id', where: \"internet_facing = 'yes'\" } });";
    expect(rewriteGateCall(scoped, "{ classifier: 'warn' }")).toBe("export const tls_gate = gate(tls, { layer: 'bronze', checks: { classifier: 'warn' }, scope: { of: apps, key: 'app_id', where: \"internet_facing = 'yes'\" } });");
    expect(rewriteGateCall(scoped, null)).toBe("export const tls_gate = gate(tls, { layer: 'bronze', scope: { of: apps, key: 'app_id', where: \"internet_facing = 'yes'\" } });");
    expect(rewriteGateCall("gate(waf, { scope: { of: apps, key: 'app_id', where: 'x = \"{\"' } })", "{ forest: 'off' }")).toBe("gate(waf, { checks: { forest: 'off' }, scope: { of: apps, key: 'app_id', where: 'x = \"{\"' } })");
    expect(rewriteGateCall("gate(by_unit, { layer: 'gold' })", "{ reconcile: 'warn' }")).toBe("gate(by_unit, { layer: 'gold', checks: { reconcile: 'warn' } })");
    expect(rewriteGateCall('gate(auth)', "{ forest: 'off' }")).toBe("gate(auth, { checks: { forest: 'off' } })");
    expect(rewriteGateCall("gate(auth, { checks: { forest: 'off' } })", null)).toBe('gate(auth)');
    expect(rewriteGateCall("gate(auth, {\n  checks: { forest: 'off' },\n  layer: 'bronze',\n})", null)).toBe("gate(auth, {\n  layer: 'bronze',\n})");
    expect(() => rewriteGateCall("export const x = check(auth, {})", '{}')).toThrow(/no gate\(\) call/);
  });

  it('adds gate to the notebook’s import, or an import line', () => {
    expect(withGateImport("import { check, publish, source } from 'smaltfl/notebook';\nx")).toBe("import { check, gate, publish, source } from 'smaltfl/notebook';\nx");
    expect(withGateImport(GATED)).toBe(GATED);
    expect(withGateImport("import { cell } from 'smaltnb';\n\ncell('a');")).toBe("import { cell } from 'smaltnb';\nimport { gate } from 'smaltfl/notebook';\n\ncell('a');");
  });
});

describe('a toggle on the document', () => {
  it('rewrites an existing gate cell, and smaltnb derives the same gates, cells and outline from it', async () => {
    const doc = await expandNotebooks(flow(GATED), ts);
    const t = toggleCheck(doc, 'auth', 'forest', 'hold');
    expect(t.made).toBe(false);
    expect(t.gate).toEqual({ layer: 'bronze', checks: { shares: 'hold', forest: 'hold' } });
    expect(t.doc.gates).toEqual({ auth: { layer: 'bronze', checks: { shares: 'hold', forest: 'hold' } } });
    expect(t.doc.notebooks![0]!.source).toContain("export const auth_gate = gate(auth, { checks: { shares: 'hold', forest: 'hold' } });");
    expect(t.cell).toEqual(doc.cells!['gate:auth']);
    await agrees(t.doc);
    // The flow hash moves with the gate, and only the display fields stay the same otherwise.
    expect(await flowHash(t.doc)).not.toBe(await flowHash(doc));
    // Back to the layer's default: the check stays written, as the cell said it (the toggle changes one property).
    const back = toggleCheck(t.doc, 'auth', 'forest', 'warn');
    expect(back.doc.gates!.auth).toEqual({ layer: 'bronze', checks: { shares: 'hold', forest: 'warn' } });
    expect(back.doc.notebooks![0]!.source).toContain("gate(auth, { checks: { shares: 'hold', forest: 'warn' } });");
    await agrees(back.doc);
  });

  it('makes a gate cell for a node without one, at the end of the notebook that defines it, with its layer written out', async () => {
    const doc = await expandNotebooks(flow(GATED), ts);
    const t = toggleCheck(doc, 'by_hour', 'needs', 'off');
    expect(t.made).toBe(true);
    expect(t.gate).toEqual({ layer: 'silver', checks: { needs: 'off' } });
    expect(t.doc.notebooks![0]!.source.endsWith("\ncell('by_hour_gate');\nexport const by_hour_gate = gate(by_hour, { layer: 'silver', checks: { needs: 'off' } });\n")).toBe(true);
    expect(t.doc.cells!['gate:by_hour']).toEqual(t.cell);
    expect(t.doc.outline![0]!.cells.at(-1)).toMatchObject({ cell: 'by_hour_gate', kind: 'gate', gate: 'by_hour', line: t.cell.line, endLine: t.cell.endLine });
    await agrees(t.doc);
    // A notebook that doesn't import gate yet gains it; a flow with no gate at all becomes gated by its first toggle.
    const plain = await expandNotebooks(flow(`${SETUP.replace('gate, ', '')}${BODY}`), ts);
    expect(plain.gates).toBeUndefined();
    const first = toggleCheck(plain, 'auth', 'forest', 'off');
    expect(first.doc.notebooks![0]!.source).toContain("import { check, fill, gate, publish, source } from 'smaltfl/notebook';");
    expect(first.doc.gates).toEqual({ auth: { layer: 'bronze', checks: { forest: 'off' } } });
    // The name joined the import line: no cell moved.
    expect(first.doc.cells!.auth_valid!.line).toBe(plain.cells!.auth_valid!.line);
    await agrees(first.doc);
  });

  it('keeps the estate’s rules as written when a check of TLS’s long gate cell is toggled', async () => {
    const doc = await loadFlowDir(estateDir);
    const t = toggleCheck(doc, 'tls', 'classifier', 'warn');
    expect(t.doc.gates!.tls).toEqual({ ...doc.gates!.tls, checks: { ...doc.gates!.tls!.checks, classifier: 'warn' } });
    const nb = t.doc.notebooks!.find((n) => n.path === 'controls.nb.ts')!;
    expect(nb.source).toContain("gate(tls, { layer: 'bronze', checks: { schema: 'hold', amount: 'hold', blanks: 'hold', values: 'hold', rules: 'hold', shares: 'warn', pairs: 'warn', forest: 'warn', classifier: 'warn' }, scope: { of: apps, key: 'app_id', where: \"internet_facing = 'yes'\" } });");
    await agrees(t.doc);
    const silver = toggleCheck(t.doc, 'posture', 'pairs', 'hold');
    expect(silver.doc.gates!.posture!.checks).toEqual({ reconcile: 'hold', pairs: 'hold' });
    await agrees(silver.doc);
  });
});
