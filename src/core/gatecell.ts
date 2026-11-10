/**
 * Writing the gate cell (ADR 0014 §1, slice 6): the app's toggles edit the notebook's `gate()` cell, so the notebook
 * stays the one surface and the app is a way of writing it. Without smaltnb's parser in the page, the rewrite is of
 * one options object in one cell: the `checks` property is written anew (every check as written, one of them set), every
 * other option kept as written, and the
 * document's derived fields (`gates`, the gate's cell ref, the outline) are brought along by hand, exactly as
 * `expandNotebooks` would derive them (test/gate-toggle.test.ts holds the two together). A node without a gate cell
 * gains one at the end of the notebook that defines it, its layer written out.
 */
import type { CellRef, FlowDocument, NotebookDef, OutlineCell } from './document.js';
import { CHECK_NAMES, layerOf, type CheckMode, type CheckName, type GateDef } from './gates.js';

export const NOTEBOOK_IMPORT = 'smaltfl/notebook';

/** The checks a gate writes, as the cell's `checks` literal, in the vocabulary's order. */
export function checksLiteral(checks: Partial<Record<CheckName, CheckMode>>): string {
  const parts = CHECK_NAMES.filter((c) => checks[c] !== undefined).map((c) => `${c}: '${checks[c]}'`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

/** The checks a toggle leaves written: the gate's as written, with one check set; a check written at its layer's default
 * stays written (a gate that says so in full keeps saying so). */
export function toggledChecks(checks: Partial<Record<CheckName, CheckMode>>, check: CheckName, mode: CheckMode): Partial<Record<CheckName, CheckMode>> {
  const out: Partial<Record<CheckName, CheckMode>> = {};
  for (const c of CHECK_NAMES) {
    const m = c === check ? mode : checks[c];
    if (m !== undefined) out[c] = m;
  }
  return out;
}

/** The end of the balanced bracket opened at `open` in `text` (a `{` or `[`), string literals skipped; -1 when none. */
function closeOf(text: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const stack: string[] = [pairs[text[open]!]!];
  let quote: string | null = null;
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (pairs[ch]) stack.push(pairs[ch]!);
    else if (ch === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** A top-level property of an object literal's text (between its braces): where `name:` starts and its value ends. */
function propertyOf(inner: string, name: string): { start: number; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (depth === 0 && (i === 0 || /[\s,{]/.test(inner[i - 1]!)) && inner.startsWith(name, i) && /^\s*:/.test(inner.slice(i + name.length))) {
      const colon = inner.indexOf(':', i + name.length);
      let j = colon + 1;
      while (j < inner.length && /\s/.test(inner[j]!)) j++;
      let end: number;
      if (inner[j] === '{' || inner[j] === '[' || inner[j] === '(') end = closeOf(inner, j) + 1;
      else {
        // A scalar: to the next top-level comma or the end.
        end = j;
        let q: string | null = null;
        for (; end < inner.length; end++) {
          const c = inner[end]!;
          if (q) {
            if (c === '\\') end++;
            else if (c === q) q = null;
          } else if (c === "'" || c === '"' || c === '`') q = c;
          else if (c === ',') break;
        }
        while (end > j && /\s/.test(inner[end - 1]!)) end--;
      }
      return { start: i, end };
    }
  }
  return null;
}

/** The cell's text with its `gate(x, {...})` call carrying the checks given: the property rewritten, inserted after `layer`,
 * or the options object made; the property dropped when the checks are the layer's. */
export function rewriteGateCall(text: string, checks: string | null): string {
  const m = /gate\s*\(\s*([A-Za-z_$][\w$]*)\s*/.exec(text);
  if (!m) throw new Error('the cell has no gate() call');
  const after = m.index + m[0].length;
  const paren = text.lastIndexOf('(', after);
  const closeParen = closeOf(text, paren);
  if (closeParen < 0) throw new Error('the gate() call is unbalanced');
  const rest = text.slice(after, closeParen);
  const brace = rest.indexOf('{');
  if (!/^\s*,\s*\{/.test(rest) || brace < 0) {
    // No options: gate(x) or gate(x, …) with no literal.
    if (checks === null) return `${text.slice(0, after)}${text.slice(closeParen)}`;
    return `${text.slice(0, after)}, { checks: ${checks} }${text.slice(closeParen)}`;
  }
  const open = after + brace;
  const close = closeOf(text, open);
  const inner = text.slice(open + 1, close);
  const had = propertyOf(inner, 'checks');
  let next: string;
  if (had) {
    if (checks !== null) next = `${inner.slice(0, had.start)}checks: ${checks}${inner.slice(had.end)}`;
    else {
      // Drop the property and the comma beside it.
      const before = inner.slice(0, had.start).replace(/,\s*$/, '');
      const tail = inner.slice(had.end).replace(/^\s*,/, '');
      next = before.trim() && tail.trim() ? `${before}, ${tail.trimStart()}` : before.trim() ? before + tail : before + tail.trimStart();
    }
  } else if (checks === null) next = inner;
  else {
    const layer = propertyOf(inner, 'layer');
    next = layer ? `${inner.slice(0, layer.end)}, checks: ${checks}${inner.slice(layer.end)}` : inner.trim() ? ` checks: ${checks},${inner}` : ` checks: ${checks} `;
  }
  if (!next.trim()) return `${text.slice(0, after)}${text.slice(closeParen)}`;
  if (!/^\s/.test(next)) next = ` ${next}`;
  if (!/\s$/.test(next)) next = `${next} `;
  return `${text.slice(0, open + 1)}${next}${text.slice(close)}`;
}

/** The import line of a notebook with `gate` among what it takes from smaltfl/notebook (added when missing). */
export function withGateImport(source: string): string {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${NOTEBOOK_IMPORT}['"]\\s*;?`);
  const m = re.exec(source);
  if (m) {
    const names = m[1]!.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.includes('gate')) return source;
    const sorted = [...names, 'gate'].sort();
    return `${source.slice(0, m.index)}import { ${sorted.join(', ')} } from '${NOTEBOOK_IMPORT}';${source.slice(m.index + m[0].length)}`;
  }
  const lines = source.split('\n');
  let last = -1;
  lines.forEach((l, i) => /^import\s/.test(l) && (last = i));
  lines.splice(last + 1, 0, `import { gate } from '${NOTEBOOK_IMPORT}';`);
  return lines.join('\n');
}

export interface ToggleResult {
  doc: FlowDocument;
  /** The gate as written now. */
  gate: GateDef;
  /** The cell written: new when the node had no gate cell before. */
  cell: CellRef;
  made: boolean;
}

/**
 * One check of a node's gate set to a mode, written into the notebook (ADR 0014 §1): the gate cell's `checks` rewritten
 * (a check at the layer's default is left out), or a gate cell made at the end of the notebook that defines the node,
 * with its layer written out; the document's `gates`, cell refs and outline derived again by hand.
 */
export function toggleCheck(doc: FlowDocument, node: string, check: CheckName, mode: CheckMode): ToggleResult {
  const notebooks = doc.notebooks ?? [];
  if (!notebooks.length) throw new Error('a gate is written in a notebook: the document has none');
  const lower = node.toLowerCase();
  const id = Object.keys(doc.gates ?? {}).find((k) => k.toLowerCase() === lower) ?? node;
  const own = doc.gates?.[id];
  const source = (doc.sources ?? []).some((s) => s.id.toLowerCase() === lower);
  const watched = Object.keys(doc.publish?.watch ?? {}).some((w) => w.toLowerCase() === lower);
  const published = (doc.steps ?? []).some((s) => s.id.toLowerCase() === lower && s.dataset !== undefined);
  const layer = own?.layer ?? layerOf({ source, watched, published });
  const checks = toggledChecks(own?.checks ?? {}, check, mode);
  const gate: GateDef = { ...(own ?? { layer, checks: {} }), layer, checks };
  const literal = checksLiteral(checks);
  const refKey = Object.keys(doc.cells ?? {}).find((k) => k.toLowerCase() === `gate:${lower}`);
  const ref = refKey ? doc.cells![refKey] : undefined;
  if (ref) {
    const nb = notebooks.find((n) => n.path === ref.notebook);
    if (!nb) throw new Error(`the gate cell of ${id} is in ${ref.notebook}, which the document doesn't carry`);
    const lines = nb.source.split('\n');
    const cellText = lines.slice(ref.line - 1, ref.endLine).join('\n');
    const written = rewriteGateCall(cellText, literal);
    const newLines = written.split('\n');
    const delta = newLines.length - (ref.endLine - ref.line + 1);
    lines.splice(ref.line - 1, ref.endLine - ref.line + 1, ...newLines);
    const next = shifted(doc, nb, lines.join('\n'), ref.endLine, delta);
    const cell: CellRef = { ...ref, endLine: ref.endLine + delta };
    next.cells = { ...next.cells, [refKey!]: cell };
    next.gates = { ...(next.gates ?? {}), [id]: gate };
    return { doc: next, gate, cell, made: false };
  }
  // No gate cell yet: the cell that defines the node says where, and what the node is called there.
  const entry = (doc.outline ?? []).flatMap((o) => o.cells.map((c) => ({ path: o.path, c }))).find(({ c }) => (c.source ?? c.step)?.toLowerCase() === lower);
  if (!entry) throw new Error(`no notebook cell defines ${node}: a gate() cell is written beside the node it judges`);
  const nb = notebooks.find((n) => n.path === entry.path)!;
  const name = entry.c.cell;
  const cellName = `${name}_gate`;
  const withImport = withGateImport(nb.source);
  const importDelta = withImport.split('\n').length - nb.source.split('\n').length;
  const body = withImport.replace(/\s*$/, '');
  const lines = body.split('\n');
  const line = lines.length + 2;
  const text = `cell('${cellName}');\nexport const ${cellName} = gate(${name}, { layer: '${layer}'${literal ? `, checks: ${literal}` : ''} });`;
  const sourceOut = `${body}\n\n${text}\n`;
  const next = shifted(doc, nb, sourceOut, 0, importDelta);
  const cell: CellRef = { notebook: nb.path, cell: cellName, lang: 'ts', line, endLine: line + 1 };
  next.cells = { ...next.cells, [`gate:${id}`]: cell };
  next.gates = { ...(next.gates ?? {}), [id]: gate };
  const outlineCell: OutlineCell = { cell: cellName, lang: 'ts', line, endLine: line + 1, kind: 'gate', gate: id };
  next.outline = (next.outline ?? []).map((o) => (o.path === nb.path ? { ...o, cells: [...o.cells, outlineCell] } : o));
  return { doc: next, gate, cell, made: true };
}

/** The document with a notebook's source replaced, every cell ref and outline line after `fromLine` moved by `delta`. */
function shifted(doc: FlowDocument, nb: NotebookDef, source: string, fromLine: number, delta: number): FlowDocument {
  const move = <T extends { line: number; endLine: number }>(x: T): T => (delta && x.line > fromLine ? { ...x, line: x.line + delta, endLine: x.endLine + delta } : x);
  const cells = Object.fromEntries(Object.entries(doc.cells ?? {}).map(([k, r]) => [k, r.notebook === nb.path ? move(r) : r]));
  const outline = (doc.outline ?? []).map((o) => (o.path === nb.path ? { ...o, cells: o.cells.map(move) } : o));
  return { ...doc, notebooks: (doc.notebooks ?? []).map((n) => (n.path === nb.path ? { ...n, source } : n)), cells, outline };
}
