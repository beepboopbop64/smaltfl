/**
 * Notebooks as the step surface (ADR 0011): a format-4 document's steps are the exported cells of its smaltnb
 * notebooks. This module reads the notebooks with smaltnb's own parser and graph and derives the steps the rest of
 * smaltfl already knows (document.ts): nothing downstream learns what a notebook is.
 *
 * What a cell means in a flow (ADR 0011 §1–§4; `smaltfl/notebook` is `src/notebook.ts`):
 * - `const auth = source('auth')` binds a name to a source of the document (no step);
 * - `const params = param({ day: param.text('') })` is the notebook's parameters (smaltnb); `${params.day}` in SQL is the
 *   flow's parameter `:day`, which the document declares;
 * - a `sql` cell, `[export] const name = sql`…``, is a step whose statement is the template, each `${x}` the source or
 *   step it reads (its `inputs`, in order of first mention);
 * - `const name = check(x, { rules, maxDropped })` is the `expectations` step over `x` (§3: smaltnb's parser refuses
 *   options it doesn't know, so the rules are a call, not a cell option);
 * - `const name = fill(x, { time, shift })` is the `fill` step over the watched source `x` (ADR 0009 amendment 1);
 * - `const name = gate(x, { layer, checks })` is the gate on the source or step `x` (ADR 0014 §1): no step, but the
 *   document's `gates[x]`, what `x` is judged by;
 * - a `df` cell is a step whose statement smaltdf gives (§4): translated by the `df` hook the caller supplies, since
 *   the frame has to be evaluated to be compiled; without the hook such a cell is refused, named;
 * - an `md` cell describes the step after it; one that starts with a heading (`# Clean`) heads a part of the notebook
 *   as it is read;
 * - `publish(name, { description, storage })`, a statement in a cell of its own (several allowed), makes that step a
 *   dataset (an output name); a step nothing publishes is an intermediate, exported or not: `export` is for other
 *   notebooks to import, `publish` for readers;
 * - `action()` cells never run in a flow run (§2) and are left out;
 * - a notebook imports another listed notebook's exports (`import { x } from './checks.nb.js'`).
 *
 * The cell's name is the step's id, so the names a flow publishes are the names the notebook exports. The derived
 * steps are kept on the document (`expandNotebooks`), and `validateDocument` and `translate` take it from there.
 */
import { buildGraph } from 'smaltnb/graph';
import { importSpecifiers, moduleOf, parseNotebook, type Cell, type Notebook, type TypeScriptKit } from 'smaltnb/format';
import { GROUP_COLORS, type CellRef, type ExpectationRule, type FlowDocument, type GroupDef, type Issue, type NotebookDef, type NotebookOutline, type OutlineCell, type StepDef } from './document.js';
import { gateProblems, layerOf, type GateDef } from './gates.js';
import { PlanError } from './plan.js';

/** The module a flow's notebook imports its markers from. */
export const NOTEBOOK_MODULE = 'smaltfl/notebook';
const SMALTNB = 'smaltnb';

/** A step with the cell it came from, for the canvas and for messages. */
export interface CellStep {
  step: StepDef;
  notebook: string;
  cell: string;
  lang: Cell['lang'];
  /** The cell's span in its notebook's source (offsets, and 1-based lines). */
  span: Cell['span'];
}

/**
 * Compiles a `df` cell to the SELECT the step runs (ADR 0011 §4): the cell's code (TypeScript, as written, from its
 * `cell()` line to the next), the name it defines, and the id (a source's or a step's) each name it reads stands for.
 * It returns the statement with the inputs named by their ids, as a SQL step names them.
 */
export type DfCompiler = (cell: { notebook: string; name: string; code: string; inputs: Record<string, string> }) => Promise<string>;

export interface ExpandOptions {
  df?: DfCompiler;
}

export interface Expanded {
  steps: StepDef[];
  cells: CellStep[];
  /** The gates (ADR 0014 §1), by the source or step each judges, with the cell each came from. */
  gates: Record<string, GateDef>;
  gateCells: Record<string, CellRef>;
  /** The canvas's sections: one a notebook, named by the file, folded into one box, holding its steps (its sources
   * stand on their own, as inputs do). Display only. */
  groups: GroupDef[];
  /** Each notebook's cells in order, for the notebook view. Display only. */
  outline: NotebookOutline[];
  issues: Issue[];
}

/** The on-disk form of a format-4 document's notebooks: paths, or notebooks already loaded. */
export type NotebookRef = string | NotebookDef;

/**
 * Loads a document's notebooks: each path (relative to the document, as its `notebooks` list it) read with `read`, a
 * notebook already given with its source kept. The result is the document `validateDocument` and `expandNotebooks`
 * take.
 */
export async function loadNotebooks<D extends { notebooks?: NotebookRef[] }>(doc: D, read: (path: string) => Promise<string>): Promise<Omit<D, 'notebooks'> & { notebooks?: NotebookDef[] }> {
  if (!doc.notebooks) return doc as Omit<D, 'notebooks'> & { notebooks?: NotebookDef[] };
  const notebooks = await Promise.all(doc.notebooks.map(async (n) => (typeof n === 'string' ? { path: n, source: await read(n) } : n)));
  return { ...doc, notebooks };
}

/**
 * A format-4 document with its steps derived from its notebooks, each step's cell noted (`cells`, display only) and,
 * unless the document draws its own sections, one section a notebook (`groups`). Throws a PlanError naming the first
 * problem when a notebook isn't a flow's (its own diagnostics, a cell that isn't a step, a name nothing defines).
 */
export async function expandNotebooks(doc: FlowDocument, ts: TypeScriptKit, options: ExpandOptions = {}): Promise<FlowDocument> {
  const { steps, cells, gates, gateCells, groups, outline, issues } = await stepsOfNotebooks(doc, ts, options);
  if (issues.length > 0) throw new PlanError(`the notebooks have ${issues.length} problem${issues.length === 1 ? '' : 's'}: ${issues[0]!.path}: ${issues[0]!.message}`, issues);
  const refs: Record<string, CellRef> = {};
  for (const c of cells) refs[c.step.id] = { notebook: c.notebook, cell: c.cell, lang: c.lang, line: c.span.line, endLine: c.span.endLine };
  // A gate's cell is kept under the node it judges, prefixed, beside the steps' (display only).
  for (const [id, ref] of Object.entries(gateCells)) refs[`gate:${id}`] = ref;
  const { gates: _old, ...rest } = doc;
  return { ...rest, steps, ...(Object.keys(gates).length ? { gates } : {}), cells: refs, outline, ...(doc.groups === undefined ? { groups } : {}) };
}

/** A notebook's section on the canvas, named apart from any source or step (`weather.nb.ts` beside the source
 * `weather`): `nb-weather`. */
export function notebookSectionId(path: string): string {
  return `nb-${path.replace(/\.nb\.ts$|\.ts$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()}`;
}

/** A notebook's section name: its file's stem, as words (`clean.nb.ts` → "Clean", `by_hour.nb.ts` → "By hour"). */
export function notebookName(path: string): string {
  const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.nb\.ts$/, '').replace(/\.ts$/, '');
  const words = stem.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : stem;
}

/** What a top-level name of a notebook stands for. */
type Ref =
  | { kind: 'source'; id: string }
  | { kind: 'step'; id: string }
  | { kind: 'params' }
  | { kind: 'marker'; name: string }
  | { kind: 'import'; path: string; name: string }
  | { kind: 'other' }
  /** An import that didn't resolve: reported once, where it is declared, and silent where it is read. */
  | { kind: 'broken' };

type Tree = ReturnType<TypeScriptKit['parse']>;

interface Parsed {
  def: NotebookDef;
  at: string;
  nb: Notebook;
  tree: Tree;
  statements: number[];
  names: Map<string, Ref>;
  order: string[];
}

/** The steps a document's notebooks say, with the cells they came from, and every problem found. */
export async function stepsOfNotebooks(doc: Pick<FlowDocument, 'notebooks' | 'sources' | 'parameters'> & Partial<Pick<FlowDocument, 'publish'>>, ts: TypeScriptKit, options: ExpandOptions = {}): Promise<Expanded> {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const notebooks = doc.notebooks ?? [];
  const sources = new Map((doc.sources ?? []).map((s) => [s.id.toLowerCase(), s.id]));
  const byPath = new Map<string, Parsed>();

  // 1. Parse: each notebook's cells and graph (smaltnb's), its tree, and what its setup imports.
  notebooks.forEach((def, i) => {
    const at = `$.notebooks[${i}]`;
    const nb = parseNotebook(def.source, ts, { fileName: def.path });
    const graph = buildGraph(nb);
    for (const d of graph.diagnostics) if (d.severity === 'error') add(`${at}${d.cell ? `#${d.cell}` : ''}`, `${d.code}: ${d.message}`);
    let tree: Tree;
    try {
      tree = ts.parse(def.source, { fileName: def.path });
    } catch (e) {
      add(at, `${def.path}: ${(e as Error).message}`);
      return;
    }
    const parsed: Parsed = { def, at, nb, tree, statements: tree.children(tree.root), names: new Map(), order: graph.order };
    byPath.set(def.path, parsed);
    for (const st of parsed.statements) {
      if (tree.kind[st] !== ts.K.ImportDeclaration) continue;
      const module = moduleOf(tree, ts, st);
      for (const spec of importSpecifiers(tree, ts, st)) {
        if (module === NOTEBOOK_MODULE) parsed.names.set(spec.local, { kind: 'marker', name: spec.imported });
        else if (module === SMALTNB) parsed.names.set(spec.local, { kind: 'marker', name: `smaltnb:${spec.imported}` });
        else if (/^\.\.?\//.test(module)) parsed.names.set(spec.local, { kind: 'import', path: resolvePath(def.path, module), name: spec.imported });
        else parsed.names.set(spec.local, { kind: 'other' });
      }
    }
  });

  // 2. Classify: what each cell defines, from its own syntax: a source binding, the parameters, or a step by its name.
  const classified = new Map<Parsed, Map<string, Classified>>();
  for (const parsed of byPath.values()) {
    const kinds = new Map<string, Classified>();
    classified.set(parsed, kinds);
    for (const cell of parsed.nb.cells) {
      if (cell.kind !== 'cell' || cell.lang === 'md') continue;
      const c = classify(parsed, cell, ts, sources, add);
      if (!c) continue;
      kinds.set(cell.id, c);
      if (c.kind === 'source') parsed.names.set(cell.id, { kind: 'source', id: c.id });
      else if (c.kind === 'params') parsed.names.set(cell.id, { kind: 'params' });
      // A gate's name stands for the node it judges (the node passes through it), once that is resolved (step 4).
      else if (c.kind === 'gate') parsed.names.set(cell.id, { kind: 'import', path: parsed.def.path, name: c.input });
      else parsed.names.set(cell.id, { kind: 'step', id: cell.id });
    }
  }

  // 3. Link: an imported name is what the other notebook's exported cell stands for. A notebook the document doesn't
  // list is said once; a name it doesn't export once per name.
  const unlisted = new Set<string>();
  const resolve = (parsed: Parsed, name: string): Ref | undefined => {
    const ref = parsed.names.get(name);
    if (ref?.kind !== 'import') return ref;
    const broken: Ref = { kind: 'broken' };
    // A gate's name: what the node it judges stands for, in the same notebook.
    if (ref.path === parsed.def.path) {
      const target = ref.name === name ? undefined : resolve(parsed, ref.name);
      const out: Ref = target && (target.kind === 'source' || target.kind === 'step') ? target : broken;
      parsed.names.set(name, out);
      return out;
    }
    const other = byPath.get(ref.path);
    if (!other) {
      const key = `${parsed.def.path}→${ref.path}`;
      if (!unlisted.has(key)) add(parsed.at, `${parsed.def.path} imports ${ref.name} from ${ref.path}, which the document doesn't list`);
      unlisted.add(key);
      parsed.names.set(name, broken);
      return broken;
    }
    const cell = other.nb.cells.find((c) => c.exports.includes(ref.name));
    const target = cell ? other.names.get(ref.name) : undefined;
    if (!target || (target.kind !== 'source' && target.kind !== 'step')) {
      add(parsed.at, `${parsed.def.path} imports ${ref.name} from ${ref.path}, which doesn't export it as a step or a source`);
      parsed.names.set(name, broken);
      return broken;
    }
    parsed.names.set(name, target);
    return target;
  };
  const idOf = (parsed: Parsed, name: string): string | null => {
    const ref = resolve(parsed, name);
    return ref?.kind === 'source' || ref?.kind === 'step' ? ref.id : null;
  };

  // 4. Build: each step from its cell, in the notebook's run order, with the md cell before it as its description;
  // then what the publish cells say, on the steps they name.
  const steps: StepDef[] = [];
  const cells: CellStep[] = [];
  const groups: GroupDef[] = [];
  const outline: NotebookOutline[] = [];
  const published: { parsed: Parsed; where: string; name: string; options: Record<string, unknown> }[] = [];
  const gatesFound: { parsed: Parsed; where: string; cell: Cell; input: string; options: Record<string, unknown> }[] = [];
  for (const parsed of byPath.values()) {
    const kinds = classified.get(parsed)!;
    const list: OutlineCell[] = [];
    outline.push({ path: parsed.def.path, cells: list });
    // Cells in file order for the outline; the notebook's run order for the steps (smaltnb reads top to bottom, so
    // the two agree unless a cell reads one below it).
    const at = (cell: Cell): Pick<OutlineCell, 'cell' | 'lang' | 'line' | 'endLine'> => ({ cell: cell.id, lang: cell.lang, line: cell.span.line, endLine: cell.span.endLine });
    // The notebook is a box on the canvas: its section, folded, with its steps inside.
    const group: GroupDef = { id: notebookSectionId(parsed.def.path), name: notebookName(parsed.def.path), steps: [], collapsed: true, color: GROUP_COLORS[(groups.length + 1) % GROUP_COLORS.length] };
    groups.push(group);
    const into = (id: string) => {
      if (!groups.some((g) => g.steps.includes(id))) group.steps.push(id);
    };
    let description: string | undefined;
    for (const cell of parsed.nb.cells) {
      if (cell.kind !== 'cell') continue;
      const where = `${parsed.at}#${cell.id}`;
      if (cell.lang === 'md') {
        const text = cell.sql?.kind === 'md' ? cell.sql.text.trim() : '';
        const m = /^#{1,6}\s+(.+?)\s*$/m.exec(text);
        if (m && text.startsWith('#')) {
          const heading = m[1]!;
          const body = text.slice(m[0].length).trim();
          list.push({ ...at(cell), kind: 'heading', heading, ...(body ? { text: body } : {}) });
          description = undefined;
        } else {
          description = text || undefined;
          list.push({ ...at(cell), kind: 'md', text });
        }
        continue;
      }
      const c = kinds.get(cell.id);
      const base = { id: cell.id, ...(description ? { description } : {}) };
      description = undefined;
      if (c?.kind === 'publish') {
        for (const p of c.names) published.push({ parsed, where, ...p });
        list.push({ ...at(cell), kind: 'publish', publishes: c.names.map((p) => p.name) });
        continue;
      }
      if (c?.kind === 'source') {
        list.push({ ...at(cell), kind: 'source', source: c.id });
        continue;
      }
      if (c?.kind === 'params') {
        list.push({ ...at(cell), kind: 'params' });
        continue;
      }
      if (c?.kind === 'gate') {
        gatesFound.push({ parsed, where, cell, input: c.input, options: c.options });
        list.push({ ...at(cell), kind: 'gate', gate: c.input });
        continue;
      }
      if (!c) {
        list.push({ ...at(cell), kind: 'other' });
        continue;
      }
      let step: StepDef | null = null;
      if (c.kind === 'sql') {
        const r = sqlOf(c.text, (n) => resolve(parsed, n), (m) => add(where, m));
        if (r) step = { kind: 'sql', inputs: r.inputs, sql: r.sql, ...base };
      } else if (c.kind === 'check' || c.kind === 'fill') {
        const input = idOf(parsed, c.input);
        if (!input) {
          if (resolve(parsed, c.input)?.kind !== 'broken') add(where, `${c.kind}() reads a source or step by its name; nothing defines ${c.input} as one`);
        }
        else if (c.kind === 'check') step = { kind: 'expectations', inputs: [input], rules: c.rules, ...(c.maxDropped !== undefined ? { maxDropped: c.maxDropped } : {}), ...(c.ontology !== undefined ? { ontology: c.ontology } : {}), ...base };
        else step = { kind: 'fill', inputs: [input], time: c.time, shift: c.shift, ...base };
      } else if (c.kind === 'df') {
        if (!options.df) add(where, 'a df cell needs a frame compiler (expandNotebooks options.df): this build has none');
        else {
          const inputs: Record<string, string> = {};
          for (const n of cell.reads) {
            const id = idOf(parsed, n);
            if (id) inputs[n] = id;
          }
          try {
            const sql = await options.df({ notebook: parsed.def.path, name: cell.id, code: parsed.def.source.slice(cell.span.start, cell.span.end), inputs });
            step = { kind: 'sql', inputs: [...new Set(Object.values(inputs))], sql, ...base };
          } catch (e) {
            add(where, `the df cell doesn't compile: ${(e as Error).message}`);
          }
        }
      }
      if (step) {
        steps.push(step);
        cells.push({ step, notebook: parsed.def.path, cell: cell.id, lang: cell.lang, span: cell.span });
        into(step.id);
        list.push({ ...at(cell), kind: 'step', step: step.id });
      }
    }
  }
  // Steps in run order, as the translator wants them, whatever order the cells were written in.
  const order = new Map<string, number>();
  for (const parsed of byPath.values()) for (const id of parsed.order) order.set(`${parsed.def.path}#${id}`, order.size);
  const rank = (c: CellStep) => order.get(`${c.notebook}#${c.cell}`) ?? 0;
  const sortedCells = [...cells].sort((a, b) => rank(a) - rank(b));
  steps.splice(0, steps.length, ...sortedCells.map((c) => c.step));
  cells.splice(0, cells.length, ...sortedCells);
  for (const p of published) {
    const id = idOf(p.parsed, p.name);
    const step = id === null ? undefined : steps.find((s) => s.id.toLowerCase() === id.toLowerCase());
    if (!step) {
      if (resolve(p.parsed, p.name)?.kind !== 'broken') add(p.where, `publish() names a step; ${p.name} isn't one${id ? ` (${id} is a source)` : ''}`);
      continue;
    }
    const { description, storage, ...rest } = p.options;
    if (Object.keys(rest).length) add(p.where, `publish(${p.name}, …): unknown setting ${Object.keys(rest).join(', ')} (description, storage)`);
    if (step.dataset) add(p.where, `${p.name} is published twice`);
    step.dataset = { ...(typeof description === 'string' ? { description } : {}), ...(storage !== undefined ? { storage: storage as 'row' | 'columnar' } : {}) };
  }
  // The gates (ADR 0014 §1): each on a source, or a step the flow publishes or watches, one a node, its layer the
  // node's own unless written; the outline names the node by its id.
  const gates: Record<string, GateDef> = {};
  const gateCells: Record<string, CellRef> = {};
  const watched = new Set(Object.keys(doc.publish?.watch ?? {}).map((k) => k.toLowerCase()));
  for (const g of gatesFound) {
    const id = idOf(g.parsed, g.input);
    if (id === null) {
      if (resolve(g.parsed, g.input)?.kind !== 'broken') add(g.where, `gate() judges a source or step by its name; nothing defines ${g.input} as one`);
      continue;
    }
    const source = sources.has(id.toLowerCase());
    const step = source ? undefined : steps.find((s) => s.id.toLowerCase() === id.toLowerCase());
    const published = !!step?.dataset;
    const isWatched = watched.has(id.toLowerCase());
    if (!source && !published && !isWatched) {
      add(g.where, `gate(${g.input}, …): ${id} is a step nothing publishes or watches; a gate judges what the flow judges or lets out`);
      continue;
    }
    const layer = g.options.layer ?? layerOf({ source, watched: isWatched, published });
    // The rules' names (scope.of, needs.from) stand for sources of the flow: resolved, and refused when they don't.
    let broken = false;
    const named = (v: unknown, what: string): unknown => {
      if (!isNameRef(v)) return v;
      const target = idOf(g.parsed, v.$name);
      if (target !== null && sources.has(target.toLowerCase())) return target;
      if (resolve(g.parsed, v.$name)?.kind !== 'broken') add(g.where, `gate(${g.input}, …): ${what} names a source of the flow; ${v.$name} isn't one`);
      broken = true;
      return v.$name;
    };
    const rules: Record<string, unknown> = {};
    if (g.options.reconcile !== undefined) {
      const rc = g.options.reconcile;
      const anyNode = (v: unknown): unknown => {
        if (!isNameRef(v)) return v;
        const target = idOf(g.parsed, v.$name);
        if (target !== null) return target;
        if (resolve(g.parsed, v.$name)?.kind !== 'broken') add(g.where, `gate(${g.input}, …): reconcile.of names a source or step of the flow; ${v.$name} isn't one`);
        broken = true;
        return v.$name;
      };
      rules.reconcile = isRecord(rc) ? { ...rc, ...(typeof rc.key === 'string' ? { key: [rc.key] } : {}), ...(rc.of !== undefined ? { of: anyNode(rc.of) } : {}) } : rc;
    }
    if (g.options.scope !== undefined) {
      const sc = g.options.scope;
      rules.scope = isRecord(sc) ? { ...sc, ...(sc.of !== undefined ? { of: named(sc.of, 'scope.of') } : {}) } : sc;
    }
    if (g.options.needs !== undefined) {
      const list = Array.isArray(g.options.needs) ? g.options.needs : [g.options.needs];
      rules.needs = list.map((n) => (isRecord(n) && n.from !== undefined ? { ...n, from: named(n.from, 'needs.from') } : n));
    }
    if (broken) continue;
    const def = { layer, checks: g.options.checks ?? {}, ...rules, ...Object.fromEntries(Object.entries(g.options).filter(([k]) => !['layer', 'checks', 'scope', 'needs', 'reconcile'].includes(k))) } as GateDef;
    const problems = gateProblems(def);
    if (problems.length) {
      for (const m of problems) add(g.where, `gate(${g.input}, …): ${m}`);
      continue;
    }
    const entry = outline.find((o) => o.path === g.parsed.def.path)?.cells.find((c) => c.cell === g.cell.id);
    if (entry) entry.gate = id;
    if (gates[id]) {
      add(g.where, `${id} has two gates`);
      continue;
    }
    gates[id] = { layer: def.layer, checks: def.checks, ...(def.scope ? { scope: def.scope } : {}), ...(def.needs ? { needs: def.needs } : {}), ...(def.reconcile ? { reconcile: def.reconcile } : {}) };
    gateCells[id] = { notebook: g.parsed.def.path, cell: g.cell.id, lang: g.cell.lang, line: g.cell.span.line, endLine: g.cell.span.endLine };
  }
  return { steps, cells, gates, gateCells, groups: groups.filter((g) => g.steps.length > 0), outline, issues };
}


type Classified =
  | { kind: 'publish'; names: { name: string; options: Record<string, unknown> }[] }
  | { kind: 'source'; id: string }
  | { kind: 'params' }
  | { kind: 'sql'; text: string }
  | { kind: 'check'; input: string; rules: ExpectationRule[]; maxDropped?: number; ontology?: Record<string, 'on' | 'off'> }
  | { kind: 'fill'; input: string; time: string; shift: string[] }
  | { kind: 'gate'; input: string; options: Record<string, unknown> }
  | { kind: 'df' };

/** What a cell is, from its own code; null (with an issue) when it isn't anything a flow runs. */
function classify(parsed: Parsed, cell: Cell, ts: TypeScriptKit, sources: Map<string, string>, add: (path: string, message: string) => void): Classified | null {
  const { tree } = parsed;
  const where = `${parsed.at}#${cell.id}`;
  if (cell.sql?.kind === 'query') return { kind: 'sql', text: cell.sql.text };
  const body = cell.body ? parsed.statements.filter((st) => tree.start[st]! >= cell.body!.start && tree.end[st]! <= cell.body!.end) : [];
  const published = publishesOf(tree, ts, body, parsed.names);
  if (published) {
    if (published.length === 0) {
      add(where, 'publish() names a step, with its settings as an object literal: publish(name, { description, storage })');
      return null;
    }
    return { kind: 'publish', names: published };
  }
  const decl = declarationOf(tree, ts, body, cell.id);
  const callee = decl?.callee ? parsed.names.get(decl.callee) : undefined;
  const marker = callee?.kind === 'marker' ? callee.name : null;
  if (marker === 'smaltnb:param') return { kind: 'params' };
  if (marker === 'source') {
    const id = decl!.args[0] !== undefined ? literalValue(tree, ts, decl!.args[0]) : undefined;
    if (typeof id !== 'string' || !sources.has(id.toLowerCase())) {
      add(where, `source() names a source of the document${typeof id === 'string' ? `, and ${id} isn't one` : ''}${sources.size ? ` (sources: ${[...sources.values()].join(', ')})` : ''}`);
      return null;
    }
    return { kind: 'source', id: sources.get(id.toLowerCase())! };
  }
  if (marker === 'gate') {
    const [first, second] = decl!.args;
    const input = first !== undefined && tree.kind[first] === ts.K.Identifier ? tree.textOf(first) : null;
    // A gate's rules name other nodes (scope.of, needs.from) by their names in the notebook: kept as references, resolved
    // in step 4.
    const opts = second === undefined ? {} : literalValue(tree, ts, second, true);
    if (!input) {
      add(where, 'gate() judges a source or step by its name');
      return null;
    }
    if (!isRecord(opts)) {
      add(where, 'gate() takes its settings as an object literal: { layer, checks }');
      return null;
    }
    return { kind: 'gate', input, options: opts };
  }
  if (marker === 'check' || marker === 'fill') {
    const [first, second] = decl!.args;
    const input = first !== undefined && tree.kind[first] === ts.K.Identifier ? tree.textOf(first) : null;
    const opts = second !== undefined ? literalValue(tree, ts, second) : undefined;
    if (!input) {
      add(where, `${marker}() reads a source or step by its name`);
      return null;
    }
    if (!isRecord(opts)) {
      add(where, `${marker}() takes its settings as an object literal`);
      return null;
    }
    if (marker === 'check') {
      if (!Array.isArray(opts.rules)) {
        add(where, 'check() needs rules: [{ name, check, onFail }]');
        return null;
      }
      return { kind: 'check', input, rules: opts.rules as ExpectationRule[], ...(opts.maxDropped !== undefined ? { maxDropped: opts.maxDropped as number } : {}), ...(opts.ontology !== undefined ? { ontology: opts.ontology as Record<string, 'on' | 'off'> } : {}) };
    }
    return { kind: 'fill', input, time: opts.time as string, shift: Array.isArray(opts.shift) ? (opts.shift as string[]) : [] };
  }
  if (cell.lang === 'df') return { kind: 'df' };
  add(where, `not a step a flow runs: a sql cell (const ${cell.id} = sql\`…\`), a df cell, source(), check(), fill(), gate(), publish() or param()`);
  return null;
}

const PLACEHOLDER = /\$\{\s*([A-Za-z_$][\w$]*)(?:\s*\.\s*([A-Za-z_$][\w$]*))?\s*\}/g;

/** A sql cell's statement with each `${x}` replaced by the id it reads, and `${params.x}` by `:x`. */
function sqlOf(text: string, resolve: (name: string) => Ref | undefined, problem: (message: string) => void): { sql: string; inputs: string[] } | null {
  const inputs: string[] = [];
  let bad: string | null = null;
  const sql = text.replace(PLACEHOLDER, (whole, name: string, prop: string | undefined) => {
    const ref = resolve(name);
    if (ref?.kind === 'params') {
      if (prop) return `:${prop}`;
      bad ??= `${whole}: a parameter is read as \${params.name}`;
      return whole;
    }
    if (prop) {
      bad ??= `${whole}: only \${params.name} reads a property; a source or step is read as \${name}`;
      return whole;
    }
    const id = ref?.kind === 'source' || ref?.kind === 'step' ? ref.id : null;
    if (!id) {
      // A broken import was reported where it is declared.
      bad ??= ref?.kind === 'broken' ? '' : `${whole}: ${ref ? `${name} isn't a source or a step` : `nothing defines ${name}`}`;
      return whole;
    }
    if (!inputs.includes(id)) inputs.push(id);
    return id;
  });
  if (bad === null && /\$\{/.test(text.replace(PLACEHOLDER, ''))) bad = '${…} in a flow\'s SQL is a name (a source or a step) or ${params.name}';
  if (bad !== null) {
    if (bad) problem(bad);
    return null;
  }
  return { sql, inputs };
}

/**
 * A publish cell: every statement `publish(name[, { … }])`, by the local name `publish` is imported under. Null when
 * the cell is anything else; empty when a statement names nothing or gives settings that aren't a literal.
 */
function publishesOf(tree: Tree, ts: TypeScriptKit, body: number[], names: Map<string, Ref>): { name: string; options: Record<string, unknown> }[] | null {
  const { K } = ts;
  if (body.length === 0) return null;
  const out: { name: string; options: Record<string, unknown> }[] = [];
  for (const st of body) {
    if (tree.kind[st] !== K.ExpressionStatement) return null;
    const call = tree.first[st]!;
    if (tree.kind[call] !== K.CallExpression) return null;
    const [callee, ...parts] = tree.children(call);
    if (callee === undefined || tree.kind[callee] !== K.Identifier) return null;
    const ref = names.get(tree.textOf(callee));
    if (ref?.kind !== 'marker' || ref.name !== 'publish') return null;
    const args = parts.filter((n) => !ts.isTypeNode(tree.kind[n]!));
    const [first, second] = args;
    if (first === undefined || tree.kind[first] !== K.Identifier) return [];
    const options = second === undefined ? {} : literalValue(tree, ts, second);
    if (!isRecord(options)) return [];
    out.push({ name: tree.textOf(first), options });
  }
  return out;
}

/** `[export] const <name> = <callee>(<args>)` as the cell's one statement (a trailing `name;` allowed), else null. */
function declarationOf(tree: Tree, ts: TypeScriptKit, body: number[], name: string): { callee: string | null; args: number[] } | null {
  const { K, F } = ts;
  const [decl, show, ...rest] = body;
  if (decl === undefined || rest.length || tree.kind[decl] !== K.VariableStatement) return null;
  if (show !== undefined && !(tree.kind[show] === K.ExpressionStatement && tree.textOf(show).replace(/;\s*$/, '').trim() === name)) return null;
  const list = tree.first[decl]!;
  if (!(tree.flags[list]! & F.Const)) return null;
  const decls = tree.children(list);
  if (decls.length !== 1) return null;
  const [nameNode, ...after] = tree.children(decls[0]!);
  if (nameNode === undefined || tree.kind[nameNode] !== K.Identifier || tree.textOf(nameNode) !== name) return null;
  const init = after.filter((n) => !ts.isTypeNode(tree.kind[n]!));
  if (init.length !== 1) return null;
  let call = init[0]!;
  while (tree.kind[call] === K.ParenthesizedExpression || tree.kind[call] === K.AsExpression) call = tree.first[call]!;
  if (tree.kind[call] !== K.CallExpression) return { callee: null, args: [] };
  const [callee, ...parts] = tree.children(call);
  const args = parts.filter((n) => !ts.isTypeNode(tree.kind[n]!));
  return { callee: callee !== undefined && tree.kind[callee] === K.Identifier ? tree.textOf(callee) : null, args };
}

/** A name a gate's rule gives in place of a value: the node it stands for is resolved once every cell is classified. */
export interface NameRef {
  $name: string;
}
const isNameRef = (v: unknown): v is NameRef => typeof v === 'object' && v !== null && typeof (v as NameRef).$name === 'string' && Object.keys(v as object).length === 1;

/** A literal's value: strings, numbers, booleans, null, arrays and object literals of literals; undefined otherwise.
 * With `names`, an identifier is kept as a reference (`NameRef`) for the caller to resolve. */
function literalValue(tree: Tree, ts: TypeScriptKit, n: number, names = false): unknown {
  const { K } = ts;
  const k = tree.kind[n];
  const text = tree.textOf(n);
  if (names && k === K.Identifier) return { $name: text } satisfies NameRef;
  if (k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral) return unquote(text);
  if (k === K.NumericLiteral) return Number(text);
  if (k === K.TrueKeyword) return true;
  if (k === K.FalseKeyword) return false;
  if (k === K.NullKeyword) return null;
  if (k === K.PrefixUnaryExpression && /^-\s*[\d.]/.test(text)) return -Number(text.slice(1).trim());
  if (k === K.ParenthesizedExpression || k === K.AsExpression) return literalValue(tree, ts, tree.first[n]!, names);
  if (k === K.ArrayLiteralExpression) return tree.children(n).map((c) => literalValue(tree, ts, c, names));
  if (k === K.ObjectLiteralExpression) {
    const out: Record<string, unknown> = {};
    for (const p of tree.children(n)) {
      if (tree.kind[p] !== K.PropertyAssignment) return undefined;
      const [key, value] = tree.children(p);
      if (key === undefined || value === undefined) return undefined;
      out[tree.kind[key] === K.Identifier ? tree.textOf(key) : unquote(tree.textOf(key))] = literalValue(tree, ts, value, names);
    }
    return out;
  }
  return undefined;
}

function unquote(text: string): string {
  if (text[0] === '"') {
    try {
      return JSON.parse(text) as string;
    } catch {
      return text.slice(1, -1);
    }
  }
  return text.slice(1, -1).replace(/\\(.)/g, (_m, c: string) => ({ n: '\n', t: '\t', r: '\r', '0': '\0' })[c] ?? c);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `./counts.nb.js` from `checks.nb.ts`: the listed notebook's path, with the compiled extension mapped back. */
function resolvePath(from: string, module: string): string {
  const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const out: string[] = [];
  for (const p of `${dir}${module}`.split('/')) {
    if (p === '.' || p === '') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/').replace(/\.js$/, '.ts');
}
