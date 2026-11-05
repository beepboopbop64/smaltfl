/**
 * The smaltfl app, first version: the example flow on real data, run in this browser. The flow draws as a canvas of
 * cards; a card opens a sheet with the step's settings (editable: change one, run again, and only what depends on it
 * is rebuilt), its expectation counts, a preview of its rows and the statement the engine runs for it. Results show
 * weather's effect on demand; runs can be verified and signed.
 *
 * Plain DOM and SVG, as the family's apps are. Everything a person typed or a dataset holds is set with textContent.
 */
import { registerFile } from '@smaltdb/external/client';
import exampleDoc from '../../examples/nyc-taxis-weather.smaltfl.json';
import { EXAMPLE_SOURCES } from '../../examples/sources.js';
import { canonicalJSON } from '../core/canonical.js';
import type { FlowDocument, GroupDef, StepDef } from '../core/document.js';
import { GROUP_COLORS, validateDocument } from '../core/document.js';
import { emitExcept, emitRead, emitRuleFailures, emitUnmatched, sameColumns, type EmitContext } from '../core/emit.js';
import type { Identity, ManifestNode, SignedManifest } from '../core/manifest.js';
import type { Edit } from '../core/ontology.js';
import { readView, wrapRead, type ReadView } from '../core/policy.js';
import { createIdentity, signManifest, verifyManifest } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import type { FlowPlan, PlanNode } from '../core/plan.js';
import type { RunResult, VerifyResult } from '../core/protocol.js';
import { identifiers, literal, quoteIdent } from '../core/sqltext.js';
import { runFlow, verifyRun } from '../index.js';
import { connect, type Engine } from './engine.js';
import { frameAt, freeSlot, GRID, gridLayout, groupKey, pinLayout, type GridLayout } from './layout.js';

declare const __SMALTDB_VERSION__: string;
const SMALTDB = typeof __SMALTDB_VERSION__ === 'string' ? __SMALTDB_VERSION__ : '0.9.0';

interface RunRecord {
  result: RunResult;
  ms: number;
  at: Date;
  verified?: VerifyResult;
  signed?: SignedManifest;
  signatureOk?: boolean;
}

const state = {
  doc: structuredClone(exampleDoc) as FlowDocument,
  engine: null as Engine | null,
  runs: [] as RunRecord[],
  running: false,
  selected: null as string | null,
  identity: null as Identity | null,
  failed: null as { origin?: string; message: string } | null,
  plans: new Map<string, FlowPlan>(),
  issues: [] as string[],
  /** Who the app reads and acts as: every read goes through this person's policy. */
  viewer: 'owner',
  /** Canvas sections folded into one card. */
  collapsed: new Set<string>(),
  /** Arrange: cards and sections move at a touch, and sections can be made and edited. */
  arranging: false,
  /** The section whose sheet is open (a step's sheet uses `selected`). */
  section: null as string | null,
  /** What each step changed, for the latest run, as the viewer reads it. */
  changes: new Map<string, Change>(),
  /** Each node's output columns, from the latest run's typed plan. */
  columns: new Map<string, string[]>(),
  ontologyType: null as string | null,
  object: null as Record<string, unknown> | null,
  verdict: null as Edit | null,
  edits: [] as Edit[],
  chain: null as { ok: boolean; edits: number; broken?: number } | null,
};

const policies = () => state.doc.policies;
const personName = (id: string) => policies()?.principals.find((x) => x.id === id)?.name ?? id;
/** What the current viewer may read of a node, or null before the node has run. */
const access = (id: string): ReadView | null => {
  const cols = state.columns.get(id);
  return cols ? readView(policies(), state.viewer, cols) : null;
};
/** A stored dataset's rows as the viewer may read them, as a subquery, or null when closed. */
const readDataset = (name: string): string | null => {
  const view = access(name);
  return view ? wrapRead(view, `SELECT * FROM ${quoteIdent(name)}`) : null;
};

/** Keep each node's columns from the latest run's typed plan, so policies can be applied as the app reads. */
async function learnColumns(): Promise<void> {
  const run = latest();
  if (!run || !state.engine) return;
  const plan = await planFor(run);
  state.columns = new Map(plan.nodes.filter((n) => n.schema).map((n) => [n.origin, n.schema!.map(([c]) => c)]));
}

// ------------------------------------------------------------------ small DOM helpers

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | ((e: Event) => void)> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
const NS = 'http://www.w3.org/2000/svg';
function s(tag: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
const short = (hash?: string) => (hash ? `${hash.slice(0, 12)}…` : '—');
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
/** Short counts for cards: 9,555 · 12.3k · 456k · 1.2M. */
const fmtCompact = (n: number) => (Math.abs(n) < 10000 ? fmtInt(n) : Math.abs(n) < 1e6 ? `${(n / 1000).toFixed(Math.abs(n) < 1e5 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);

function setStatus(text: string, bad = false): void {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('bad', bad);
  syncHead();
}

/** The sheet opens below the header, whatever its height, so the tabs and Run stay in reach. */
function syncHead(): void {
  const bar = document.querySelector('header.bar');
  if (bar) document.documentElement.style.setProperty('--head', `${Math.ceil(bar.getBoundingClientRect().bottom)}px`);
}

// ------------------------------------------------------------------ the flow's facts

const steps = () => new Map(state.doc.steps.map((st) => [st.id, st]));
const sourceIds = () => new Set(state.doc.sources.map((src) => src.id));
const latest = () => state.runs[0];
const nodeOf = (id: string): ManifestNode | undefined => latest()?.result.manifest.nodes.find((n) => n.origin === id);

const KIND: Record<string, string> = { sql: 'SQL', filter: 'FILTER', formula: 'FORMULAS', select: 'SELECT', join: 'JOIN', aggregate: 'AGGREGATE', expectations: 'CHECKS' };

function kindLabel(id: string): string {
  if (sourceIds().has(id)) return 'SOURCE';
  const st = steps().get(id)!;
  return `${KIND[st.kind] ?? st.kind.toUpperCase()}${st.dataset ? ' · DATASET' : ''}`;
}

// ------------------------------------------------------------------ what each step changed

// After a run, each step's card says what it did to the data: the rows it left out, the columns it added, the rows a
// join found no match for. Everything is counted as the viewer reads it, through their policy, so a change never
// shows more than they could read themselves; for the owner the counts are the run's own.

/** What a step did to the rows and columns it read. */
interface Change {
  op: PlanNode['op'];
  /** The first input's rows (undefined for a source, which reads none) and the step's own; null when closed to the viewer. */
  rowsIn: number | null | undefined;
  rowsOut: number | null;
  columnsIn: number;
  columnsOut: number;
  /** Columns the step adds, removes, or computes again under a name it already had. */
  added: string[];
  removed: string[];
  replaced: string[];
  /** Whether its columns are its input's: then the rows it removed can be matched one to one with the rows it read. */
  same: boolean;
  /** A join: its left-hand rows that found no match (null when closed to the viewer), and whether it leaves them out. */
  unmatched?: number | null;
  inner?: boolean;
}

interface CardLine {
  text: string;
  tone: 'drop' | 'add' | 'same';
  badge?: string;
}

/** A run, ready to look into: its typed plan, where each stored node is, and each node's entry in the manifest. */
interface Inspection {
  plan: FlowPlan;
  ctx: EmitContext;
  index: Map<string, number>;
  manifest: Map<number, ManifestNode>;
}

const inspections = new Map<string, Promise<Inspection>>();

function inspect(run: RunRecord): Promise<Inspection> {
  const id = run.result.hash;
  let found = inspections.get(id);
  if (!found) {
    found = (async () => {
      const plan = await planFor(run);
      const keys = run.result.manifest.nodes.filter((n) => n.content !== undefined).map((n) => literal(n.key, 'text'));
      const tables = new Map<string, string>();
      if (keys.length) for (const [key, tbl] of (await state.engine!.query(`SELECT key, tbl FROM _smaltfl_versions WHERE key IN (${keys.join(', ')})`)).rows) tables.set(String(key), String(tbl));
      const tableOf = new Map<number, string>();
      for (const m of run.result.manifest.nodes) if (tables.has(m.key)) tableOf.set(m.node, tables.get(m.key)!);
      const { stored } = shapeOf(plan);
      const ctx: EmitContext = { table: (j) => (stored.has(j) ? tableOf.get(j) : undefined), columns: (j) => plan.nodes[j]!.schema!.map(([c]) => c) };
      return { plan, ctx, index: new Map(plan.nodes.map((n, i) => [n.origin, i])), manifest: new Map(run.result.manifest.nodes.map((m) => [m.node, m])) };
    })();
    found.catch(() => inspections.delete(id));
    inspections.set(id, found);
  }
  return found;
}

/** Counts by what they count. A node's key names its exact content, so a count kept under it never goes stale. */
const counts = new Map<string, Promise<number>>();

function countOnce(key: string, sql: string): Promise<number> {
  let found = counts.get(key);
  if (!found) {
    found = state.engine!.query(`SELECT count(*) FROM (\n${sql}\n)`).then((r) => Number(r.rows[0]![0]));
    found.catch(() => counts.delete(key));
    counts.set(key, found);
  }
  return found;
}

/** What the viewer may read of a node of this run. */
const viewIn = (insp: Inspection, i: number): ReadView => readView(policies(), state.viewer, insp.ctx.columns(i));

/** A node's rows as the viewer reads them, as a statement; null when closed to them. */
const readIn = (insp: Inspection, i: number, sql = emitRead(insp.plan, i, insp.ctx)): string | null => wrapRead(viewIn(insp, i), sql);

/** How many rows of a node the viewer reads, or null when it is closed to them. */
async function rowsAs(insp: Inspection, i: number): Promise<number | null> {
  const view = viewIn(insp, i);
  const m = insp.manifest.get(i);
  if (!view.open || !m) return null;
  const n = insp.plan.nodes[i]!;
  if (!view.where) {
    // No row rule applies to the viewer: the run's own numbers, where it has them.
    if (m.rows !== undefined) return m.rows;
    if (n.op === 'expect' && m.expectations) return m.expectations.rows - m.expectations.dropped;
    if (n.op === 'formula' || n.op === 'select') return rowsAs(insp, n.inputs[0]!);
  }
  return countOnce(`${m.key}|rows|${view.where ?? ''}`, readIn(insp, i)!);
}

/** The rows of node `a` that node `b` doesn't have, as the viewer reads both (they have the same columns). */
function exceptIn(insp: Inspection, a: number, b: number): string | null {
  const ra = readIn(insp, a);
  const rb = readIn(insp, b);
  return ra && rb ? emitExcept(ra, rb, viewIn(insp, a).columns) : null;
}

async function changeOf(insp: Inspection, i: number): Promise<Change> {
  const n = insp.plan.nodes[i]!;
  const input = n.op === 'table' ? undefined : n.inputs[0];
  const out = insp.ctx.columns(i);
  const inn = input === undefined ? [] : insp.ctx.columns(input);
  const lc = (c: string) => c.toLowerCase();
  const had = new Set(inn.map(lc));
  const has = new Set(out.map(lc));
  const bare = (e: string) => e.trim().replace(/^"(.*)"$/s, '$1').toLowerCase();
  const replaced =
    n.op === 'formula' ? n.set.map(([name]) => name).filter((c) => had.has(lc(c)))
    : n.op === 'select' ? n.project.filter(([name, e]) => had.has(lc(name)) && bare(e) !== lc(name)).map(([name]) => name)
    : [];
  const reshapes = n.op === 'aggregate' || n.op === 'table';
  const change: Change = {
    op: n.op,
    rowsIn: input === undefined ? undefined : await rowsAs(insp, input),
    rowsOut: await rowsAs(insp, i),
    columnsIn: inn.length,
    columnsOut: out.length,
    added: reshapes ? [] : out.filter((c) => !had.has(lc(c))),
    removed: reshapes ? [] : inn.filter((c) => !has.has(lc(c))),
    replaced,
    same: input !== undefined && sameColumns(inn, out),
  };
  if (n.op === 'join') {
    const view = viewIn(insp, n.inputs[0]!);
    change.inner = n.how !== 'left';
    change.unmatched = view.open ? await countOnce(`${insp.manifest.get(i)!.key}|unmatched|${view.where ?? ''}`, wrapRead(view, emitUnmatched(insp.plan, i, insp.ctx)!)!) : null;
  }
  return change;
}

let changesRun = 0;

/** Work out every step's change for the latest run, as the viewer reads it; each card updates as its own arrives. */
async function computeChanges(): Promise<void> {
  const run = latest();
  if (!run || !state.engine) return;
  const token = ++changesRun;
  state.changes = new Map();
  try {
    const insp = await inspect(run);
    for (const [i, n] of insp.plan.nodes.entries()) {
      if (!insp.manifest.has(i)) continue;
      const c = await changeOf(insp, i);
      if (token !== changesRun) return;
      state.changes.set(n.origin, c);
      requestCanvas();
    }
  } catch (e) {
    // A count that fails leaves its card saying what it said before; the sheet shows the error.
    console.warn(`smaltfl: couldn't work out what the steps changed: ${message(e)}`);
  }
}

/** The rows a step left out: what its card's badge counts, and a folded section's. */
function removedRows(c: Change): number {
  if (c.rowsIn === null || c.rowsIn === undefined || c.rowsOut === null) return 0;
  if (c.op === 'join') return c.inner ? (c.unmatched ?? 0) : 0;
  if (c.op === 'expect' || c.op === 'filter' || (c.op === 'sql' && c.columnsIn === c.columnsOut)) return Math.max(0, c.rowsIn - c.rowsOut);
  return 0;
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;
const cols = (n: number) => `${n} ${n === 1 ? 'col' : 'cols'}`;

/** A step's change in a few words, for its card: tinted when it leaves rows out or adds columns. */
function summarize(c: Change): CardLine | null {
  if (c.rowsOut === null) return null;
  const out = c.rowsOut;
  if (c.op === 'table') return { text: plural(out, 'row'), tone: 'same' };
  // What it read is closed to the viewer: only its own rows, as they read them.
  if (c.rowsIn === null || c.rowsIn === undefined) return { text: plural(out, 'row'), tone: 'same' };
  const inn = c.rowsIn;
  const lost = removedRows(c);
  switch (c.op) {
    case 'aggregate':
      return { text: `${fmtCompact(inn)} → ${fmtCompact(out)} rows`, tone: 'same' };
    case 'formula':
      return { text: [c.added.length ? `+${cols(c.added.length)}` : '', c.replaced.length ? `${cols(c.replaced.length)} recomputed` : ''].filter(Boolean).join(' · ') || 'no new columns', tone: 'add' };
    case 'select':
      return c.removed.length ? { text: `−${cols(c.removed.length)} · ${c.columnsOut} kept`, tone: 'drop', badge: `−${cols(c.removed.length)}` } : { text: `${c.columnsOut} columns`, tone: 'same' };
    case 'join': {
      const u = c.unmatched;
      const extra = out - (inn - (c.inner ? (u ?? 0) : 0));
      const text = [`+${cols(c.added.length)}`, u === null || u === undefined ? '' : u === 0 ? 'all matched' : `${fmtCompact(u)} unmatched`, extra > 0 ? `+${fmtCompact(extra)} rows` : ''].filter(Boolean).join(' · ');
      const badge = lost ? `−${fmtCompact(lost)} rows` : u ? `${fmtCompact(u)} no match` : extra > 0 ? `+${fmtCompact(extra)} rows` : undefined;
      return { text, tone: badge ? 'drop' : 'add', badge };
    }
    default:
      // Checks, filters and SQL. A SQL step that reshapes its rows (other columns, another count of them) isn't
      // dropping rows, so its card says how many go in and out instead.
      if (c.op === 'sql' && !c.same && c.columnsIn !== c.columnsOut) return { text: `${fmtCompact(inn)} → ${fmtCompact(out)} rows`, tone: 'same' };
      if (lost) return { text: `−${fmtInt(lost)} rows · ${pct(lost / Math.max(1, inn))}`, tone: 'drop', badge: `−${fmtCompact(lost)} rows` };
      if (out > inn) return { text: `+${fmtInt(out - inn)} rows`, tone: 'add' };
      return { text: 'no rows removed', tone: 'same' };
  }
}

function cardLine(id: string): CardLine {
  const plain = (text: string): CardLine => ({ text, tone: 'same' });
  if (state.failed?.origin === id) return plain('failed: tap for why');
  const view = access(id);
  if (view && !view.open) return plain(`closed to ${personName(state.viewer)}`);
  const n = nodeOf(id);
  if (!n) return plain(state.running ? 'running…' : (steps().get(id)?.description ?? state.doc.sources.find((src) => src.id === id)?.description ?? ''));
  const c = state.changes.get(id);
  const said = c ? summarize(c) : null;
  if (said) return said;
  if (n.status === 'folded') return plain('folded, no copy kept');
  // The run's row count is everyone's; a viewer whose rules filter this node sees their own once it is counted.
  return plain(view?.where ? n.status : `${n.status} · ${plural(n.rows ?? 0, 'row')}`);
}

// ------------------------------------------------------------------ the canvas

// The canvas is an open grid you move around: drag to pan, pinch or ctrl/⌘-scroll to zoom, tap a card to open it, hold
// a card to pick it up. In Arrange, cards and sections move at a touch, a step dropped on a section moves into it, and
// sections can be made, named, coloured and deleted. Fit shows everything; Tidy puts every card back where the
// automatic layout places it. The arrangement is display only, kept in this browser.
const view = { x: 16, y: 16, k: 1, ready: false };
const SNAP = 20;
/** Far enough out for Fit to show a long flow on a phone. */
const MIN_ZOOM = 0.08;
/** How long a press is held before it picks a card or a section up. */
const HOLD_MS = 420;

/**
 * What the last render drew. A drag moves these elements and redraws only the edges it touches: rebuilding the canvas
 * mid-drag would remove the element under the finger, and iOS then stops reporting that finger's moves.
 */
const drawn = {
  layout: null as GridLayout | null,
  /** Each drawn card by its key: a step's id, or a folded section's id for its card. */
  cards: new Map<string, SVGElement>(),
  at: new Map<string, { x: number; y: number }>(),
  frames: new Map<string, SVGElement>(),
  /** Each section's name bar, which takes taps and keyboard focus. */
  heads: new Map<string, SVGElement>(),
  edges: [] as { from: string; to: string; path: SVGElement; dot: SVGElement }[],
};
/** The card or section a finger is moving, and how far it has gone (in world units, snapped). */
let moving: { keys: string[]; card?: string; frame?: string; at: { x: number; y: number }; dx: number; dy: number; target?: string | null } | null = null;
let canvasFrame = 0;

function requestCanvas(): void {
  cancelAnimationFrame(canvasFrame);
  canvasFrame = requestAnimationFrame(renderCanvas);
}

function applyView(): void {
  const svg = document.querySelector<SVGSVGElement>('#canvas svg');
  if (!svg) return;
  svg.querySelector('#world')!.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  svg.querySelector('#dots')!.setAttribute('patternTransform', `translate(${view.x} ${view.y}) scale(${view.k})`);
}

function fitView(): void {
  const host = $('canvas');
  const { left, top, width, height } = gridLayout(state.doc, state.collapsed);
  const W = host.clientWidth || 360;
  const H = host.clientHeight || 420;
  view.k = Math.max(MIN_ZOOM, Math.min(1.2, (W - 32) / width, (H - 32) / height));
  view.x = (W - width * view.k) / 2 - left * view.k;
  view.y = (H - height * view.k) / 2 - top * view.k;
  applyView();
}

function zoomAt(factor: number, cx: number, cy: number): void {
  const k = Math.max(MIN_ZOOM, Math.min(2.5, view.k * factor));
  view.x = cx - ((cx - view.x) * k) / view.k;
  view.y = cy - ((cy - view.y) * k) / view.k;
  view.k = k;
  applyView();
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): { d: string; cx: number; cy: number } {
  const { cardW, cardH } = GRID;
  const x1 = from.x + cardW;
  const y1 = from.y + cardH / 2;
  const x2 = to.x;
  const y2 = to.y + cardH / 2;
  const bend = Math.max(36, Math.abs(x2 - x1) / 2);
  return { d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 5} ${y2}`, cx: x2 - 3, cy: y2 };
}

const HINT = {
  look: 'Drag to move around · pinch to zoom · hold a card to move it',
  arrange: 'Drag steps and sections · drop a step on a section to move it in · tap a section’s name to edit it',
};

function setHint(text?: string): void {
  const el = document.querySelector('#canvas .canvas-hint');
  if (el) el.textContent = text ?? (state.arranging ? HINT.arrange : HINT.look);
}

function renderTools(): void {
  const host = $('canvas');
  const tools = host.querySelector('.canvas-tools');
  if (!tools) return;
  const zoom = (f: number) => zoomAt(f, host.clientWidth / 2, host.clientHeight / 2);
  const b = (label: string, onclick: () => void, attrs: Record<string, string> = {}) => h('button', { type: 'button', onclick, ...attrs }, label);
  tools.replaceChildren(
    ...(state.arranging
      ? [b('Fit', fitView), b('+ Section', addSection), resetButton(), b('Done', () => setArranging(false), { class: 'primary' })]
      : [b('−', () => zoom(1 / 1.25), { 'aria-label': 'Zoom out' }), b('+', () => zoom(1.25), { 'aria-label': 'Zoom in' }), b('Fit', fitView), b('Tidy', tidy), b('Arrange', () => setArranging(true), { class: 'accent' })]),
  );
  host.classList.toggle('arranging', state.arranging);
  setHint();
}

/** Reset asks twice: it puts the example's sections back, and forgets this browser's arrangement. */
function resetButton(): HTMLButtonElement {
  const btn = h('button', { type: 'button' }, 'Reset');
  let armed = 0;
  btn.addEventListener('click', () => {
    if (!armed) {
      btn.textContent = 'Reset all?';
      armed = window.setTimeout(() => ((armed = 0), (btn.textContent = 'Reset')), 3000);
      return;
    }
    clearTimeout(armed);
    resetArrangement();
  });
  return btn;
}

function setArranging(on: boolean): void {
  state.arranging = on;
  if (state.selected || state.section) select(null);
  renderTools();
  renderCanvas();
}

function tidy(): void {
  state.doc = { ...state.doc, layout: {} };
  saveArrangement();
  renderCanvas();
  fitView();
}

function setUpCanvas(host: HTMLElement): SVGSVGElement {
  const svg = s('svg', { role: 'group', 'aria-label': 'The flow on an open grid: drag to move around, pinch to zoom' }) as SVGSVGElement;
  const defs = s('defs');
  const pattern = s('pattern', { id: 'dots', width: SNAP, height: SNAP, patternUnits: 'userSpaceOnUse' });
  pattern.append(s('circle', { class: 'dot', cx: 1, cy: 1, r: 1 }));
  defs.append(pattern);
  svg.append(defs, s('rect', { class: 'grid-bg', x: 0, y: 0, width: '100%', height: '100%', fill: 'url(#dots)' }), s('g', { id: 'world' }));
  host.replaceChildren(svg, h('div', { class: 'canvas-tools' }), h('p', { class: 'canvas-hint', 'aria-live': 'polite' }));
  renderTools();

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: 'none' | 'press' | 'pan' | 'drag' | 'pinch' = 'none';
  let lead = -1;
  let start = { x: 0, y: 0, vx: 0, vy: 0, k: 1, dist: 0, cx: 0, cy: 0 };
  let press: { card?: string; head?: string } = {};
  let hold = 0;
  const local = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  svg.addEventListener('pointerdown', (e) => {
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // The pointer can be gone already; its events still arrive while it is over the canvas.
    }
    pointers.set(e.pointerId, local(e));
    if (gesture === 'drag') return;
    clearTimeout(hold);
    if (pointers.size === 1) {
      const el = e.target as Element;
      const p = local(e);
      lead = e.pointerId;
      start = { ...start, x: p.x, y: p.y, vx: view.x, vy: view.y, k: view.k };
      press = { card: el.closest('[data-card]')?.getAttribute('data-card') ?? undefined, head: el.closest('[data-head]')?.getAttribute('data-head') ?? undefined };
      gesture = press.card || press.head ? 'press' : 'pan';
      // Outside Arrange a finger on a card pans, as on the background; holding it still picks the card up.
      if (gesture === 'press' && !state.arranging) hold = window.setTimeout(() => gesture === 'press' && beginMove(press) && (gesture = 'drag'), HOLD_MS);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      start = { ...start, dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, vx: view.x, vy: view.y, k: view.k };
      gesture = 'pinch';
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (gesture === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const k = Math.max(MIN_ZOOM, Math.min(2.5, (start.k * dist) / Math.max(1, start.dist)));
      view.x = start.cx - ((start.cx - start.vx) * k) / start.k;
      view.y = start.cy - ((start.cy - start.vy) * k) / start.k;
      view.k = k;
      applyView();
      return;
    }
    if (e.pointerId !== lead) return;
    const p = pointers.get(lead)!;
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (gesture === 'press' && Math.hypot(dx, dy) > 6) {
      clearTimeout(hold);
      gesture = state.arranging && beginMove(press) ? 'drag' : 'pan';
    }
    if (gesture === 'pan') {
      view.x = start.vx + dx;
      view.y = start.vy + dy;
      applyView();
    } else if (gesture === 'drag') moveTo(dx, dy);
  });
  const end = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (gesture === 'drag') {
      if (e.pointerId === lead) {
        endMove(e.type === 'pointerup');
        gesture = 'none';
      }
      return;
    }
    clearTimeout(hold);
    if (gesture === 'press' && e.pointerId === lead && e.type === 'pointerup') tap(press);
    gesture = 'none';
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  // Belt and braces for touch: the page must not scroll or zoom under the canvas, nor show a callout on a long press.
  svg.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
      else {
        view.x -= e.deltaX;
        view.y -= e.deltaY;
        applyView();
      }
    },
    { passive: false },
  );
  host.addEventListener('keydown', (e) => {
    const step = 60;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (view.x += step),
      ArrowRight: () => (view.x -= step),
      ArrowUp: () => (view.y += step),
      ArrowDown: () => (view.y -= step),
      '+': () => zoomAt(1.25, host.clientWidth / 2, host.clientHeight / 2),
      '-': () => zoomAt(1 / 1.25, host.clientWidth / 2, host.clientHeight / 2),
    };
    if (keys[e.key] && e.target === host) {
      e.preventDefault();
      keys[e.key]!();
      applyView();
    }
  });
  return svg;
}

/** A tap: a card opens its sheet (a folded section's card opens the section); a section's name folds it, or in Arrange edits it. */
function tap(press: { card?: string; head?: string }): void {
  if (press.card) {
    if (state.doc.groups?.some((g) => g.id === press.card)) setFolded(press.card, false);
    else select(press.card);
  } else if (press.head) {
    if (state.arranging) openSection(press.head);
    else setFolded(press.head, !state.collapsed.has(press.head));
  }
}

const sectionOf = (id: string): string | null => state.doc.groups?.find((g) => g.steps.includes(id))?.id ?? null;
const sectionName = (id: string): string => state.doc.groups?.find((g) => g.id === id)?.name ?? id;

/** Pick up what was pressed: a step's card, a folded section's card, or a section by its name. */
function beginMove(press: { card?: string; head?: string }): boolean {
  const l = drawn.layout;
  if (!l) return false;
  const frame = l.frames.find((f) => f.id === (press.head ?? press.card));
  if (press.card && !frame) {
    const at = drawn.at.get(press.card);
    if (!at) return false;
    moving = { keys: [press.card], card: press.card, at: { ...at }, dx: 0, dy: 0 };
  } else if (frame) {
    moving = { keys: frame.collapsed ? [frame.id] : [...frame.members], frame: frame.id, at: { x: frame.x, y: frame.y }, dx: 0, dy: 0 };
  } else return false;
  const lifted = new Set<Element>();
  for (const k of moving.keys) drawn.cards.get(k) && lifted.add(drawn.cards.get(k)!);
  if (moving.frame && drawn.frames.get(moving.frame)) lifted.add(drawn.frames.get(moving.frame)!);
  for (const el of lifted) el.classList.add('lifted');
  // On top of everything else, without taking the element under the finger out of the page: what is drawn after it
  // moves beneath it instead.
  const world = document.querySelector('#canvas #world');
  if (world) {
    const kids = Array.from(world.children);
    const first = kids.findIndex((k) => lifted.has(k));
    if (first >= 0) for (const k of kids.slice(first + 1)) if (!lifted.has(k)) world.insertBefore(k, kids[first]!);
  }
  setHint(moving.card ? 'Drop it on a section to move it in, or outside every section to take it out' : 'Drop the section where you want it');
  try {
    navigator.vibrate?.(8);
  } catch {
    // Not every browser lets a page buzz.
  }
  return true;
}

/** Follow the finger: move the drawn elements, redraw their edges, and light up the section a step would drop into. */
function moveTo(dx: number, dy: number): void {
  const m = moving;
  const l = drawn.layout;
  if (!m || !l) return;
  m.dx = Math.round((m.at.x + dx / view.k) / SNAP) * SNAP - m.at.x;
  m.dy = Math.round((m.at.y + dy / view.k) / SNAP) * SNAP - m.at.y;
  const t = `translate(${m.dx} ${m.dy})`;
  for (const k of m.keys) drawn.cards.get(k)?.setAttribute('transform', t);
  if (m.frame) drawn.frames.get(m.frame)?.setAttribute('transform', t);
  const moved = new Set(m.keys);
  const pos = (key: string) => {
    const p = drawn.at.get(key)!;
    return moved.has(key) ? { x: p.x + m.dx, y: p.y + m.dy } : p;
  };
  for (const e of drawn.edges) {
    if (!moved.has(e.from) && !moved.has(e.to)) continue;
    const { d, cx, cy } = edgePath(pos(e.from), pos(e.to));
    e.path.setAttribute('d', d);
    e.dot.setAttribute('cx', String(cx));
    e.dot.setAttribute('cy', String(cy));
  }
  if (!m.card) return;
  const p = pos(m.card);
  // A few pixels of slack on screen, whatever the zoom.
  const target = frameAt(l, p.x + GRID.cardW / 2, p.y + GRID.cardH / 2, Math.min(12 / view.k, 40))?.id ?? null;
  if (target === m.target) return;
  m.target = target;
  for (const [id, g] of drawn.frames) g.classList.toggle('drop', id === target);
  const from = sectionOf(m.card);
  setHint(target === from ? 'Drop it to place it' : target ? `Drop it to move it into ${sectionName(target)}` : `Drop it to take it out of ${sectionName(from!)}`);
}

/** Put it down: write every card's place (so nothing else moves), then this one's, and its new section. */
function endMove(commit: boolean): void {
  const m = moving;
  const before = drawn.layout;
  moving = null;
  if (m && before && commit) {
    const joins = m.card !== undefined && m.target !== undefined && m.target !== sectionOf(m.card);
    if (m.dx || m.dy || joins) {
      const layout = pinLayout(state.doc, state.collapsed);
      const shift = (key: string) => {
        const p = layout[key];
        if (p) layout[key] = [p[0] + m.dx, p[1] + m.dy];
      };
      let doc: FlowDocument = { ...state.doc, layout };
      if (m.card) {
        shift(m.card);
        if (joins) doc = intoSection(doc, m.card, m.target ?? null, before);
      } else if (m.frame) {
        for (const id of state.doc.groups?.find((g) => g.id === m.frame)?.steps ?? []) shift(id);
        shift(groupKey(m.frame));
      }
      state.doc = doc;
      saveArrangement();
    }
  }
  renderCanvas();
  setHint();
}

/** The document with a step moved into a section, or out of every section (null). A section it leaves empty stays put. */
function intoSection(doc: FlowDocument, id: string, target: string | null, before: GridLayout): FlowDocument {
  const layout = { ...(doc.layout ?? {}) };
  const groups = (doc.groups ?? []).map((g) => {
    if (!g.steps.includes(id)) return g.id === target ? { ...g, steps: [...g.steps, id] } : g;
    const f = before.frames.find((x) => x.id === g.id);
    if (g.steps.length === 1 && f) layout[groupKey(g.id)] = [f.x, f.y];
    return { ...g, steps: g.steps.filter((x) => x !== id) };
  });
  return { ...doc, groups, layout };
}

/** Arrange, from the keyboard: an arrow key moves the focused card one grid step. */
function nudge(key: string, dx: number, dy: number): void {
  const layout = pinLayout(state.doc, state.collapsed);
  const folded = state.doc.groups?.find((g) => g.id === key);
  for (const id of folded ? folded.steps : [key]) {
    const p = layout[id];
    if (p) layout[id] = [p[0] + dx, p[1] + dy];
  }
  state.doc = { ...state.doc, layout };
  saveArrangement();
  renderCanvas();
}

function setFolded(id: string, folded: boolean): void {
  if (folded) state.collapsed.add(id);
  else state.collapsed.delete(id);
  state.doc = { ...state.doc, groups: state.doc.groups?.map((g) => (g.id === id ? { ...g, collapsed: folded || undefined } : g)) };
  saveArrangement();
  renderCanvas();
  if (state.section === id) renderSectionSheet();
}

/** A new, empty section in the middle of what's on screen, opened so it can be named straight away. */
function addSection(): void {
  const groups = state.doc.groups ?? [];
  const { id, name } = newSection(state.doc);
  const host = $('canvas');
  const { cardW, cardH, pad, head } = GRID;
  const snap = (v: number) => Math.round(v / SNAP) * SNAP;
  const x = snap((host.clientWidth / 2 - view.x) / view.k - (cardW + 2 * pad) / 2);
  const y = snap((host.clientHeight / 2 - view.y) / view.k - (head + cardH + pad) / 2);
  const color = nextColor(groups);
  const layout = { ...pinLayout(state.doc, state.collapsed), [groupKey(id)]: [x, y] as [number, number] };
  state.doc = { ...state.doc, groups: [...groups, { id, name, steps: [], color }], layout };
  saveArrangement();
  openSection(id, true);
}

/** The next free section id, and the name a new section starts with. */
function newSection(doc: FlowDocument): { id: string; name: string } {
  const groups = doc.groups ?? [];
  const taken = new Set([...groups.map((g) => g.id), ...doc.sources.map((x) => x.id), ...doc.steps.map((x) => x.id)].map((x) => x.toLowerCase()));
  let n = groups.length + 1;
  while (taken.has(`section_${n}`)) n++;
  return { id: `section_${n}`, name: `Section ${n}` };
}

/** A colour no section has yet, slate (the canvas's own) last; then round the palette again. */
function nextColor(groups: readonly GroupDef[]): GroupDef['color'] {
  const used = new Set(groups.map((g) => g.color ?? 'slate'));
  const order = [...GROUP_COLORS.filter((c) => c !== 'slate'), 'slate' as const];
  return order.find((c) => !used.has(c)) ?? order[groups.length % order.length]!;
}

function removeSection(id: string): void {
  const layout = pinLayout(state.doc, state.collapsed);
  delete layout[groupKey(id)];
  state.collapsed.delete(id);
  state.doc = { ...state.doc, groups: (state.doc.groups ?? []).filter((g) => g.id !== id), layout };
  saveArrangement();
  select(null);
}

/** Move a step into a section from its sheet: it lands in the section's first free slot; a new section is drawn around it. */
function placeInSection(id: string, target: string): void {
  const before = gridLayout(state.doc, state.collapsed);
  const doc: FlowDocument = { ...state.doc, layout: pinLayout(state.doc, state.collapsed) };
  if (target === '+') {
    // A new section drawn around the step where it stands, named straight away.
    const fresh: GroupDef = { ...newSection(doc), steps: [], color: nextColor(doc.groups ?? []) };
    state.doc = intoSection({ ...doc, groups: [...(doc.groups ?? []), fresh] }, id, fresh.id, before);
    saveArrangement();
    openSection(fresh.id, true);
    return;
  }
  state.doc = intoSection(doc, id, target || null, before);
  const frame = before.frames.find((f) => f.id === target);
  if (frame) {
    const slot = freeSlot(before, frame, id);
    state.doc.layout![id] = [slot.x, slot.y];
  }
  saveArrangement();
  renderCanvas();
  void renderSheet();
}

// ------------------------------------------------------------------ the arrangement, kept in this browser

const arrangementKey = () => `smaltfl:arrangement:${state.doc.id}`;

/** Sections and places are display only, so they are kept per browser, never in the run's record. */
function saveArrangement(): void {
  try {
    localStorage.setItem(arrangementKey(), JSON.stringify({ v: 1, groups: state.doc.groups ?? [], layout: state.doc.layout ?? {} }));
  } catch {
    // Storage can be off (a private window, a blocked frame); the arrangement then lasts as long as the page.
  }
}

function loadArrangement(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(arrangementKey()) ?? 'null') as { v?: number; groups?: unknown; layout?: unknown } | null;
    if (!saved || saved.v !== 1) return;
    const next = { ...state.doc, groups: saved.groups, layout: saved.layout } as FlowDocument;
    if (validateDocument(next).length) return;
    state.doc = next;
  } catch {
    // Unreadable storage, or an arrangement from another version of the flow: keep the document's own.
  }
}

function resetArrangement(): void {
  state.doc = { ...state.doc, groups: structuredClone(exampleDoc.groups) as FlowDocument['groups'], layout: {} };
  state.collapsed = new Set();
  try {
    localStorage.removeItem(arrangementKey());
  } catch {
    // Nothing kept to forget.
  }
  select(null);
  fitView();
}

// ------------------------------------------------------------------ drawing the canvas

function renderCanvas(): void {
  // Mid-drag, wait: the drop draws everything once it lands.
  if (moving) return;
  const host = $('canvas');
  const svg = host.querySelector('svg') ?? setUpCanvas(host);
  const world = svg.querySelector('#world')!;
  const { cardW, cardH, head } = GRID;
  const layout = gridLayout(state.doc, state.collapsed);
  // Focus stays on the card or section it was on: the canvas redraws as counts arrive, under a keyboard user's feet.
  const active = document.activeElement;
  const focused = active && world.contains(active) ? { card: active.getAttribute('data-card'), head: active.getAttribute('data-head') } : null;
  drawn.layout = layout;
  drawn.cards.clear();
  drawn.at.clear();
  drawn.frames.clear();
  drawn.heads.clear();
  drawn.edges = [];
  const parts: SVGElement[] = [];
  const fit = (text: string, n: number) => (text.length > n ? `${text.slice(0, Math.max(1, n - 1))}…` : text);
  for (const f of layout.frames) {
    const n = f.members.length;
    const classes = ['section', `c-${f.color ?? 'slate'}`, n ? '' : 'empty', state.section === f.id ? 'selected' : ''].filter(Boolean);
    const g = s('g', { class: classes.join(' '), 'data-group': f.id });
    g.append(s('rect', { class: 'frame', x: f.x, y: f.y, width: f.w, height: f.h, rx: 12 }));
    const room = Math.floor((f.w - 76) / 7.4);
    const count = ` · ${n} ${n === 1 ? 'STEP' : 'STEPS'}`;
    const label = f.name.toUpperCase();
    g.append(s('text', { class: 'label', x: f.x + 12, y: f.y + 18 }, label.length + count.length <= room ? label + count : fit(label, room)));
    g.append(s('text', { class: 'toggle', x: f.x + f.w - 12, y: f.y + 18, 'text-anchor': 'end' }, state.arranging ? 'edit ✎' : n ? (f.collapsed ? 'open ▸' : 'fold ▾') : ''));
    if (!n) g.append(s('text', { class: 'empty-hint', x: f.x + f.w / 2, y: f.y + head + cardH / 2 + 4, 'text-anchor': 'middle' }, state.arranging ? 'Drop a step here' : 'Empty · Arrange to fill it'));
    const hit = s('rect', { class: 'hit', x: f.x, y: f.y, width: f.w, height: head, 'data-head': f.id, tabindex: 0, role: 'button', 'aria-label': `${f.name} section, ${n} ${n === 1 ? 'step' : 'steps'}: ${state.arranging ? 'edit it' : f.collapsed ? 'open it' : 'fold it'}` });
    hit.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') (e.preventDefault(), tap({ head: f.id }));
    });
    g.append(hit);
    parts.push(g);
    drawn.frames.set(f.id, g);
    drawn.heads.set(f.id, hit);
  }
  // A folded section's members all show as its card.
  const shownAs = new Map<string, string>();
  for (const f of layout.frames) if (f.collapsed) for (const m of f.members) shownAs.set(m, f.id);
  const shown = (id: string) => shownAs.get(id) ?? id;
  for (const [id, p] of layout.cards) drawn.at.set(shown(id), p);
  const seen = new Set<string>();
  for (const st of state.doc.steps) {
    for (const input of st.inputs) {
      const from = shown(input);
      const to = shown(st.id);
      if (from === to || seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      const { d, cx, cy } = edgePath(drawn.at.get(from)!, drawn.at.get(to)!);
      const path = s('path', { class: 'edge', d });
      const dot = s('circle', { class: 'edge-dot', cx, cy, r: 2.5 });
      parts.push(path, dot);
      drawn.edges.push({ from, to, path, dot });
    }
  }
  const chars = Math.floor((cardW - 24) / 7.2);
  const card = (key: string, kind: string, name: string, line: CardLine, classes: string[]) => {
    const { x, y } = drawn.at.get(key)!;
    if (line.tone !== 'same') classes.push(`tone-${line.tone}`);
    const g = s('g', { class: ['card', ...classes].join(' '), 'data-card': key, tabindex: 0, role: 'button', 'aria-label': `${name}: ${kind}. ${line.text}` });
    g.append(s('rect', { class: 'box', x, y, width: cardW, height: cardH, rx: 9 }));
    g.append(s('text', { class: 'kind', x: x + 12, y: y + 18 }, fit(kind, Math.floor(chars * 1.15))));
    g.append(s('text', { class: 'name', x: x + 12, y: y + 36 }, fit(name, chars)));
    g.append(s('text', { class: 'what', x: x + 12, y: y + 53 }, fit(line.text, Math.floor(chars * 1.12))));
    if (line.badge) {
      // A badge on the corner says, at any zoom, that this step changed the rows: how many it left out.
      const w = Math.round(line.badge.length * 6.4 + 14);
      g.append(s('rect', { class: 'badge', x: x + cardW - w + 8, y: y - 9, width: w, height: 18, rx: 9 }));
      g.append(s('text', { class: 'badge-text', x: x + cardW - w / 2 + 8, y: y + 4, 'text-anchor': 'middle' }, line.badge));
    }
    g.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] };
      if (k === 'Enter' || k === ' ') (e.preventDefault(), tap({ card: key }));
      else if (state.arranging && arrows[k]) (e.preventDefault(), e.stopPropagation(), nudge(key, ...arrows[k]!));
    });
    parts.push(g);
    drawn.cards.set(key, g);
  };
  for (const f of layout.frames) {
    if (!f.collapsed || !f.members.length) continue;
    const built = f.members.filter((m) => nodeOf(m)?.status === 'built').length;
    const lost = f.members.reduce((sum, m) => sum + (state.changes.get(m) ? removedRows(state.changes.get(m)!) : 0), 0);
    const text = latest() ? `${f.members.length} steps · ${built} built` : `${f.members.length} steps`;
    card(f.id, 'SECTION', f.name, { text, tone: lost ? 'drop' : 'same', badge: lost ? `−${fmtCompact(lost)} rows` : undefined }, ['summary', `c-${f.color ?? 'slate'}`]);
  }
  for (const id of layout.cards.keys()) {
    if (shownAs.has(id)) continue;
    const n = nodeOf(id);
    const readable = access(id);
    const classes = [sourceIds().has(id) ? 'source' : steps().get(id)?.dataset ? 'dataset' : 'step'];
    if (state.failed?.origin === id) classes.push('failed');
    else if (readable && !readable.open) classes.push('closed');
    else if (n) classes.push(n.status);
    if (state.selected === id) classes.push('selected');
    card(id, kindLabel(id), id, cardLine(id), classes);
  }
  world.replaceChildren(...parts);
  const refocus = focused?.card ? drawn.cards.get(focused.card) : focused?.head ? drawn.heads.get(focused.head) : undefined;
  (refocus as SVGElement | undefined)?.focus({ preventScroll: true });
  if (!view.ready && host.clientWidth > 0) {
    // Start at the beginning of the flow, at a size where the cards are easy to read.
    view.k = Math.max(0.55, Math.min(1, (host.clientHeight - 40) / layout.height));
    view.x = 16 - layout.left * view.k;
    view.y = Math.max(16, (host.clientHeight - layout.height * view.k) / 2) - layout.top * view.k;
    view.ready = true;
  }
  applyView();
}

function select(id: string | null): void {
  state.selected = id;
  state.section = null;
  state.issues = [];
  renderCanvas();
  void renderSheet();
}

function openSection(id: string, focusName = false): void {
  state.selected = null;
  state.section = id;
  renderCanvas();
  renderSectionSheet(focusName);
}

// ------------------------------------------------------------------ the sheet

async function renderSheet(): Promise<void> {
  if (state.section) return renderSectionSheet();
  const sheet = $('sheet');
  const id = state.selected;
  if (!id) {
    sheet.hidden = true;
    sheet.replaceChildren();
    return;
  }
  const st = steps().get(id);
  const source = state.doc.sources.find((src) => src.id === id);
  const n = nodeOf(id);
  const body = h('div', { class: 'sheet-body' });
  sheet.setAttribute('aria-label', 'Step details');
  sheet.replaceChildren(
    h('div', { class: 'sheet-head' }, h('div', { style: 'flex:1;min-width:0' }, h('p', { class: 'eyebrow' }, kindLabel(id)), h('h2', {}, id)), h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
    body,
  );
  sheet.hidden = false;
  const description = st?.description ?? source?.description;
  if (description) body.append(h('p', { class: 'lede' }, description));
  if (state.failed && (state.failed.origin === id || (!state.failed.origin && !n))) body.append(h('p', { class: 'status bad' }, state.failed.message));

  // What it changed comes first: it is what a person opening a step most often wants to know.
  const changed = h('div', { class: 'change' }, h('p', { class: 'eyebrow' }, 'What changed'), h('p', { class: 'foot' }, n ? 'Working it out…' : 'Run the flow to see what this step changes.'));
  body.append(changed);

  const facts = h('dl', { class: 'facts' });
  const fact = (k: string, v: Child) => facts.append(h('dt', {}, k), h('dd', {}, v));
  if (n) {
    fact('This run', n.status === 'folded' ? 'folded into the statement that reads it' : n.status);
    fact('Key', h('span', { class: 'hash' }, short(n.key)));
    if (n.content) fact('Content', h('span', { class: 'hash' }, short(n.content)));
  } else fact('This run', 'not run yet');
  if (source) fact('Reads', h('span', { class: 'mono' }, source.table));
  if (st) fact('Reads', h('span', { class: 'mono' }, st.inputs.join(', ')));
  const section = h('select', { id: 'section-of', 'aria-label': 'Section' });
  section.append(...(state.doc.groups ?? []).map((g) => h('option', { value: g.id }, g.name)), h('option', { value: '' }, 'No section'), h('option', { value: '+' }, 'A new section, around it'));
  section.value = sectionOf(id) ?? '';
  section.addEventListener('change', () => placeInSection(id, section.value));
  fact('Section', section);
  body.append(facts);

  if (st) body.append(editor(st));

  const preview = h('div', {}, h('p', { class: 'eyebrow' }, 'Preview · first 20 rows'), h('p', { class: 'foot' }, n ? 'Loading…' : 'Run the flow to preview its rows.'));
  const explain = h('details', {}, h('summary', {}, 'What the engine runs'), h('pre', { class: 'code' }, n ? 'Loading…' : 'Run the flow first.'));
  body.append(preview, explain);
  if (!n || !state.engine) return;
  let fresh: string[] = [];
  try {
    const panel = await changePanel(id);
    if (state.selected !== id) return;
    if (panel) {
      changed.replaceWith(panel.box);
      fresh = panel.fresh;
    }
  } catch (e) {
    changed.lastElementChild!.textContent = message(e);
  }
  try {
    const sql = await statementFor(id);
    if (state.selected !== id || !sql) return;
    const view = access(id);
    const read = view ? wrapRead(view, sql) : sql;
    explain.lastElementChild!.textContent = read && read !== sql ? `-- read as ${personName(state.viewer)}: ${view!.filters.join(', ') || 'no row rules'}${view!.removed.length ? `; removes ${view!.removed.map((r) => r.column).join(', ')}` : ''}\n${read}` : sql;
    if (!read) {
      preview.lastElementChild!.replaceWith(h('p', { class: 'status bad' }, `Closed to ${personName(state.viewer)}: ${view!.reason}.`));
      return;
    }
    const r = await state.engine.query(`SELECT * FROM (\n${read}\n) LIMIT 20`);
    if (state.selected !== id) return;
    const note = view && (view.filters.length || view.removed.length) ? h('p', { class: 'foot' }, `As ${personName(state.viewer)}: ${[view.filters.length ? `filtered by the ${view.filters.join(' and the ')}` : '', view.removed.length ? `without ${view.removed.map((x) => x.column).join(', ')}` : ''].filter(Boolean).join(', ')}.`) : null;
    const isNew = new Set(fresh.map((c) => c.toLowerCase()));
    preview.lastElementChild!.replaceWith(h('div', {}, table(r.columns, r.rows, (c) => (isNew.has(c.toLowerCase()) ? 'new' : undefined)), isNew.size ? h('p', { class: 'foot' }, 'Tinted: the columns this step adds.') : null, note));
  } catch (e) {
    preview.lastElementChild!.textContent = message(e);
  }
}

/** A bar of what was kept against what was left out, with both counts under it. */
function split(kept: number, lost: number, keptLabel: string, lostLabel: string): HTMLElement {
  const total = Math.max(1, kept + lost);
  return h('div', { class: 'split-wrap' },
    h('div', { class: 'split', role: 'img', 'aria-label': `${fmtInt(kept)} ${keptLabel}, ${fmtInt(lost)} ${lostLabel}` },
      h('span', { class: 'kept', style: `flex-grow:${kept / total}` }),
      lost ? h('span', { class: 'lost', style: `flex-grow:${lost / total}` }) : null),
    h('p', { class: 'split-key' }, h('span', { class: 'k' }, `${fmtInt(kept)} ${keptLabel}`), lost ? h('span', { class: 'l' }, `${fmtInt(lost)} ${lostLabel}`) : null));
}

/**
 * Up to 50 rows into a box, as the viewer reads them: the columns `first` names lead and are tinted (the columns a rule
 * reads, or a join matched on), so the reason a row is here is the first thing in it.
 */
async function showRows(into: HTMLElement, title: string, sql: string, first: ReadonlySet<string> = new Set()): Promise<void> {
  into.hidden = false;
  into.replaceChildren(h('p', { class: 'eyebrow' }, title), h('p', { class: 'foot' }, 'Loading…'));
  try {
    const r = await state.engine!.query(`SELECT * FROM (\n${sql}\n) LIMIT 50`);
    const lead = (k: number) => (first.has(r.columns[k]!.toLowerCase()) ? 0 : 1);
    const order = [...r.columns.keys()].sort((a, b) => lead(a) - lead(b));
    into.replaceChildren(
      h('div', { class: 'row' }, h('p', { class: 'eyebrow', style: 'flex:1' }, title), h('button', { class: 'btn', type: 'button', onclick: () => ((into.hidden = true), into.replaceChildren()) }, 'Hide')),
      table(order.map((k) => r.columns[k]!), r.rows.map((row) => order.map((k) => row[k])), (c) => (first.has(c.toLowerCase()) ? 'hit' : undefined)),
      h('p', { class: 'foot' }, r.rows.length === 50 ? 'The first 50.' : r.rows.length ? plural(r.rows.length, 'row') + '.' : 'None.'),
    );
  } catch (e) {
    into.replaceChildren(h('p', { class: 'status bad' }, message(e)));
  }
}

/** The sheet's account of what a step changed, as the viewer reads it, and the columns it adds (for the preview's tint). */
async function changePanel(id: string): Promise<{ box: HTMLElement; fresh: string[] } | null> {
  const run = latest();
  if (!run || !state.engine) return null;
  const insp = await inspect(run);
  const i = insp.index.get(id);
  if (i === undefined || !insp.manifest.has(i)) return null;
  const c = state.changes.get(id) ?? (await changeOf(insp, i));
  const n = insp.plan.nodes[i]!;
  const who = personName(state.viewer);
  const rows = h('div', { class: 'rows-box', hidden: true });
  const box = h('div', { class: 'change' }, h('p', { class: 'eyebrow' }, 'What changed'));
  const headline = (text: string, tone: CardLine['tone'] = 'same') => box.append(h('p', { class: `headline ${tone}` }, text));
  const say = (...text: Child[]) => box.append(h('p', { class: 'foot' }, ...text));
  const button = (label: string, title: string, sql: string | null, first?: ReadonlySet<string>) =>
    sql ? h('button', { class: 'btn show', type: 'button', onclick: () => void showRows(rows, title, sql, first) }, label) : null;
  const list = (names: readonly string[]) => names.join(', ');
  const done = () => {
    const view = access(id);
    if (state.viewer !== 'owner' && view?.open && (view.filters.length || view.removed.length)) {
      say(`As ${who} reads it: ${[view.filters.length ? `only the rows the ${view.filters.join(' and the ')} lets them read` : '', view.removed.length ? `without ${list(view.removed.map((r) => r.column))}` : ''].filter(Boolean).join(', ')}.`);
    }
    box.append(rows);
    return { box, fresh: c.added };
  };
  if (c.rowsOut === null) {
    headline(`Closed to ${who}`);
    say(`${access(id)?.reason ?? 'Their rules don’t open it'}.`);
    return done();
  }
  const out = c.rowsOut;
  const input = n.op === 'table' ? undefined : n.inputs[0];
  const inputName = input === undefined ? '' : insp.plan.nodes[input]!.origin;
  if (input !== undefined && c.rowsIn === null) {
    headline(plural(out, 'row'));
    say(`What it reads, ${inputName}, is closed to ${who}, so what it changed is closed to them too.`);
    return done();
  }
  const inn = c.rowsIn ?? 0;
  switch (n.op) {
    case 'table': {
      headline(`${plural(out, 'row')} from ${state.doc.sources.find((x) => x.id === id)?.table ?? 'its table'}`);
      say('A source is copied into a snapshot when the flow runs, and its hash goes into the run’s record, so the run can be checked against exactly these rows.');
      break;
    }
    case 'expect': {
      const lost = inn - out;
      headline(lost ? `Dropped ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : `Kept all ${plural(inn, 'row')}`, lost ? 'drop' : 'same');
      box.append(split(out, lost, 'kept', 'dropped'));
      box.append(await rulesTable(insp, i, rows));
      if (lost) box.append(h('div', { class: 'row' }, button(`Show the ${plural(lost, 'row')} it dropped`, `Dropped by ${id}`, exceptIn(insp, input!, i))));
      break;
    }
    case 'filter':
    case 'sql': {
      if (!c.same) {
        headline(`${plural(inn, 'row')} in, ${fmtInt(out)} out`, removedRows(c) ? 'drop' : 'same');
        if (c.added.length) say(`New columns: ${list(c.added)}.`);
        if (c.removed.length) say(`Columns it doesn’t keep: ${list(c.removed)}.`);
        say(`Its columns aren’t ${inputName}’s, so the rows it returns can’t be matched one to one with the rows it read.`);
        break;
      }
      const lost = Math.max(0, inn - out);
      const kept = Math.min(inn, out);
      headline(lost ? `Removed ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : out > inn ? `Added ${plural(out - inn, 'row')}` : `Kept all ${plural(inn, 'row')}`, lost ? 'drop' : 'same');
      box.append(split(kept, lost, 'kept', 'removed'));
      const removed = exceptIn(insp, input!, i);
      const key = insp.manifest.get(i)!.key;
      const where = viewIn(insp, i).where ?? '';
      // Rows it returns that it didn't read: a SQL step can rewrite values as well as drop rows.
      const changedSql = n.op === 'sql' ? exceptIn(insp, i, input!) : null;
      const [gone, fresh] = await Promise.all([removed ? countOnce(`${key}|removed|${where}`, removed) : 0, changedSql ? countOnce(`${key}|new|${where}`, changedSql) : 0]);
      if (gone) box.append(h('div', { class: 'row' }, button(`Show the ${plural(gone, 'row')} it removed`, `Removed by ${id}`, removed)));
      if (fresh) {
        say(`It also returns ${plural(fresh, 'row')} that ${inputName} doesn’t have: rows whose values it changed, or new ones.`);
        box.append(h('div', { class: 'row' }, button(`Show the ${plural(fresh, 'new or changed row')}`, `New or changed in ${id}`, changedSql)));
      }
      if (gone && !fresh && n.op === 'sql') say('It only removes rows: every row it returns is one it read, unchanged.');
      break;
    }
    case 'join': {
      const right = insp.plan.nodes[n.inputs[1]!]!.origin;
      headline(`Added ${plural(c.added.length, 'column')} from ${right}: ${list(c.added)}`, 'add');
      const u = c.unmatched;
      const keys = new Set(n.on.map(([l]) => l.toLowerCase()));
      const on = list(n.on.map(([l]) => l));
      if (u === null || u === undefined) say(`Which rows found a match is closed to ${who}: ${inputName} is closed to them.`);
      else {
        box.append(split(inn - u, u, 'matched', n.how === 'left' ? 'no match, kept with empty columns' : 'no match, left out'));
        if (u === 0) say(`Every row of ${inputName} found its ${on} in ${right}.`);
        else {
          say(n.how === 'left' ? `${plural(u, 'row')} found no ${on} in ${right}: they are kept, with ${list(c.added)} empty.` : `${plural(u, 'row')} found no ${on} in ${right}, so the join leaves them out.`);
          box.append(h('div', { class: 'row' }, button(`Show the ${plural(u, 'row')} with no match`, `No match in ${right}`, readIn(insp, input!, emitUnmatched(insp.plan, i, insp.ctx)!), keys)));
        }
        const extra = out - (inn - (n.how === 'left' ? 0 : u));
        if (extra > 0) say(`${right} has more than one row for some ${on}, so ${plural(extra, 'row')} came out more than once: ${fmtInt(inn)} in, ${fmtInt(out)} out.`);
      }
      break;
    }
    case 'formula': {
      headline(c.added.length ? `Added ${plural(c.added.length, 'column')}: ${list(c.added)}` : 'No new columns', 'add');
      if (c.replaced.length) say(`Computed again: ${list(c.replaced)}. Each keeps its name and gets its new value.`);
      say(`Every row is kept: ${plural(out, 'row')}, as many as it read.`);
      break;
    }
    case 'select': {
      headline(c.removed.length ? `Removed ${plural(c.removed.length, 'column')}: ${list(c.removed)}` : `Kept ${plural(c.columnsOut, 'column')}`, c.removed.length ? 'drop' : 'same');
      if (c.added.length) say(`New: ${list(c.added)}.`);
      if (c.replaced.length) say(`Computed again: ${list(c.replaced)}.`);
      say(`Every row is kept: ${plural(out, 'row')}.`);
      break;
    }
    case 'aggregate': {
      headline(`Grouped ${plural(inn, 'row')} into ${fmtInt(out)}`);
      const by = n.groupBy.map(([name]) => name);
      say(`${by.length ? `One row for each ${list(by)}` : 'One row for all of them'}, with ${list(n.measures.map(([name]) => name))}.`);
      break;
    }
  }
  return done();
}

/**
 * An expectation's rules: how many rows fail each, as the viewer reads them, and the rows themselves. A rule that
 * reads a column the viewer's policy removes stays closed, since its failures would tell them about that column.
 */
async function rulesTable(insp: Inspection, i: number, rows: HTMLElement): Promise<HTMLElement> {
  const n = insp.plan.nodes[i] as Extract<PlanNode, { op: 'expect' }>;
  const m = insp.manifest.get(i)!;
  const view = viewIn(insp, n.inputs[0]!);
  const hidden = new Set(view.removed.map((r) => r.column.toLowerCase()));
  const who = personName(state.viewer);
  const list = (names: readonly string[]) => names.join(', ');
  const rules = await Promise.all(
    n.rules.map(async ([name, check, onFail], k) => {
      const reads = new Set([...identifiers(check)].filter((x) => view.columns.some((c) => c.toLowerCase() === x) || hidden.has(x)));
      const secret = [...reads].filter((x) => hidden.has(x));
      const failed = secret.length ? null : !view.where ? m.expectations!.rules[k]!.failed : await countOnce(`${m.key}|rule${k}|${view.where}`, wrapRead(view, emitRuleFailures(insp.plan, i, k, insp.ctx))!);
      return { name, onFail, reads, secret, failed, sql: secret.length ? null : wrapRead(view, emitRuleFailures(insp.plan, i, k, insp.ctx)) };
    }),
  );
  const inn = (await rowsAs(insp, n.inputs[0]!)) ?? 0;
  const body = rules.map((r) =>
    h('tr', {},
      h('td', {}, r.name, r.onFail === 'warn' ? h('span', { class: 'warns' }, 'warns') : null),
      h('td', { class: 'n' }, r.failed === null ? 'closed' : fmtInt(r.failed)),
      h('td', { class: 'n' }, r.failed === null ? '' : pct(r.failed / Math.max(1, inn))),
      h('td', {}, r.failed && r.sql ? h('button', { class: 'btn small', type: 'button', onclick: () => void showRows(rows, `Rows that fail ${r.name}${r.onFail === 'warn' ? ' (kept, with a warning)' : ''}`, r.sql!, r.reads) }, 'Show') : null),
    ),
  );
  const closed = rules.filter((r) => r.secret.length);
  return h('div', {},
    h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Rule'), h('th', { class: 'n' }, 'Fails'), h('th', { class: 'n' }, 'Share'), h('th', {}, ''))), h('tbody', {}, ...body))),
    h('p', { class: 'foot' }, 'A row can fail more than one rule, so the rules can add up to more than the rows dropped. A rule that warns keeps its rows.'),
    closed.length ? h('p', { class: 'foot' }, `Closed to ${who}: ${closed.map((r) => `${r.name} reads ${list(r.secret)}`).join('; ')}, which their rules remove.`) : null,
  );
}

// ------------------------------------------------------------------ a section's sheet

function editSection(id: string, change: (g: GroupDef) => GroupDef): void {
  state.doc = { ...state.doc, groups: (state.doc.groups ?? []).map((g) => (g.id === id ? change(g) : g)) };
  saveArrangement();
  requestCanvas();
}

function renderSectionSheet(focusName = false): void {
  const sheet = $('sheet');
  const g = state.doc.groups?.find((x) => x.id === state.section);
  if (!g) {
    state.section = null;
    sheet.hidden = true;
    sheet.replaceChildren();
    return;
  }
  const title = h('h2', {}, g.name);
  const name = h('input', { id: 'section-name', type: 'text', maxlength: '40', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
  name.value = g.name;
  name.addEventListener('input', () => {
    const v = name.value.trim() || 'Untitled';
    title.textContent = v;
    editSection(g.id, (x) => ({ ...x, name: v }));
  });
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
  const color = g.color ?? 'slate';
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' },
    ...GROUP_COLORS.map((c) =>
      h('button', { type: 'button', class: `swatch-btn c-${c}`, role: 'radio', 'aria-checked': String(c === color), 'aria-label': c, title: c, onclick: () => (editSection(g.id, (x) => ({ ...x, color: c })), renderSectionSheet()) }),
    ));
  const members = g.steps.length
    ? h('div', { class: 'chips' }, ...g.steps.map((m) => h('button', { type: 'button', class: 'chip', onclick: () => select(m) }, m)))
    : h('p', { class: 'foot' }, 'No steps yet. In Arrange, drag a step onto it, or choose it under Section in a step’s sheet.');
  const folded = state.collapsed.has(g.id);
  const fold = h('button', { class: 'btn', type: 'button', disabled: g.steps.length === 0, onclick: () => setFolded(g.id, !folded) }, folded ? 'Open it' : 'Fold it');
  const del = h('button', { class: 'btn danger', type: 'button' }, 'Delete section');
  let armed = 0;
  del.addEventListener('click', () => {
    if (armed) return (clearTimeout(armed), removeSection(g.id));
    del.textContent = g.steps.length ? 'Delete it? Its steps stay' : 'Delete it?';
    armed = window.setTimeout(() => ((armed = 0), (del.textContent = 'Delete section')), 3000);
  });
  sheet.setAttribute('aria-label', 'Section details');
  sheet.replaceChildren(
    h('div', { class: 'sheet-head' }, h('div', { style: 'flex:1;min-width:0' }, h('p', { class: 'eyebrow' }, 'SECTION'), title), h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'field' }, h('label', { for: name.id }, 'Name'), name),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), swatches),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, `Steps · ${g.steps.length}`), members),
      h('div', { class: 'row' }, fold, del),
      h('p', { class: 'foot' }, 'Sections only change how the flow looks: never what it computes, or its hashes. This browser keeps your arrangement.'),
    ),
  );
  sheet.hidden = false;
  // A new section is named first: its name is selected, ready to type over.
  if (focusName) (name.focus(), name.select());
}

/** The step's settings, editable where they are text. "Apply and run" rebuilds the step and what depends on it. */
function editor(st: StepDef): HTMLElement {
  const wrap = h('div', { class: 'field-set' });
  const fields: { label: string; value: string; set: (step: StepDef, v: string) => void }[] = [];
  switch (st.kind) {
    case 'sql':
      fields.push({ label: 'SQL', value: st.sql, set: (x, v) => x.kind === 'sql' && (x.sql = v) });
      break;
    case 'filter':
      fields.push({ label: 'Keep rows where', value: st.where, set: (x, v) => x.kind === 'filter' && (x.where = v) });
      break;
    case 'formula':
      st.columns.forEach((c, k) => fields.push({ label: c.name, value: c.expr, set: (x, v) => x.kind === 'formula' && (x.columns[k]!.expr = v) }));
      break;
    case 'aggregate':
      st.measures.forEach((m, k) => fields.push({ label: m.name, value: m.expr, set: (x, v) => x.kind === 'aggregate' && (x.measures[k]!.expr = v) }));
      break;
    case 'expectations':
      st.rules.forEach((r, k) => fields.push({ label: `${r.name} · ${r.onFail}`, value: r.check, set: (x, v) => x.kind === 'expectations' && (x.rules[k]!.check = v) }));
      break;
    case 'select':
    case 'join':
      break;
  }
  if (st.kind === 'join') wrap.append(h('p', { class: 'foot' }, `${st.how === 'left' ? 'Left join' : 'Join'} ${st.inputs[1]} on ${st.on.map((p) => `${p.left} = ${p.right}`).join(' and ')}, adding ${st.columns.map((c) => (typeof c === 'string' ? c : `${c.column} as ${c.name}`)).join(', ')}.`));
  if (st.kind === 'aggregate') wrap.append(h('p', { class: 'foot' }, `Grouped by ${st.groupBy.map((g) => (typeof g === 'string' ? g : g.name)).join(', ')}.`));
  if (fields.length === 0) return wrap;
  wrap.prepend(h('p', { class: 'eyebrow' }, 'Settings'));
  const inputs = fields.map((f, k) => {
    const area = h('textarea', { id: `edit-${st.id}-${k}`, spellcheck: 'false', rows: String(Math.min(10, Math.max(2, f.value.split('\n').length + 1))) });
    area.value = f.value;
    wrap.append(h('div', { class: 'field' }, h('label', { for: area.id }, f.label), area));
    return area;
  });
  if (state.issues.length) wrap.append(h('ul', { class: 'issues' }, ...state.issues.map((i) => h('li', {}, i))));
  const apply = h('button', { class: 'run', type: 'button' }, 'Apply and run');
  apply.addEventListener('click', () => {
    const next = structuredClone(state.doc);
    const step = next.steps.find((x) => x.id === st.id)!;
    fields.forEach((f, k) => f.set(step, inputs[k]!.value));
    const issues = validateDocument(next);
    if (issues.length) {
      state.issues = issues.map((i) => `${i.path}: ${i.message}`);
      void renderSheet();
      return;
    }
    state.doc = next;
    state.issues = [];
    void run();
  });
  wrap.append(h('div', { class: 'row', style: 'margin-top:10px' }, apply, h('span', { class: 'foot' }, 'Only this step and what reads it run again.')));
  return wrap;
}

async function planFor(run: RunRecord): Promise<FlowPlan> {
  const hash = run.result.manifest.plan;
  let plan = state.plans.get(hash);
  if (!plan) {
    const r = await state.engine!.query(`SELECT plan FROM _smaltfl_plans WHERE hash = ${literal(hash, 'text')}`);
    plan = JSON.parse(String(r.rows[0]![0])) as FlowPlan;
    state.plans.set(hash, plan);
  }
  return plan;
}

/** The statement that computes a step from the latest run's stored versions: what a preview reads. */
async function statementFor(id: string): Promise<string | null> {
  const run = latest();
  if (!run || !state.engine) return null;
  const insp = await inspect(run);
  const i = insp.index.get(id);
  if (i === undefined || !insp.plan.nodes[i]!.schema) return null;
  return emitRead(insp.plan, i, insp.ctx);
}

/** A table of rows; `mark` can give a column a class (its header and cells), to tint the columns that matter. */
function table(columns: string[], rows: unknown[][], mark?: (column: string) => string | undefined): HTMLElement {
  const marks = columns.map((c) => mark?.(c));
  const cell = (v: unknown, k: number) => {
    const td =
      v === null || v === undefined ? h('td', { class: 'null' }, 'null')
      : typeof v === 'number' ? h('td', { class: 'n' }, Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000))
      : typeof v === 'bigint' ? h('td', { class: 'n' }, v.toString())
      : h('td', {}, String(v));
    if (marks[k]) td.classList.add(marks[k]!);
    return td;
  };
  return h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ...columns.map((c, k) => h('th', marks[k] ? { class: marks[k]! } : {}, c)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map(cell))))));
}

// ------------------------------------------------------------------ results

async function renderResults(): Promise<void> {
  const engine = state.engine;
  const run = latest();
  if (!engine || !run) return;
  const outputs = Object.entries(run.result.manifest.outputs);
  $('datasets').replaceChildren(
    h('ul', { class: 'runs' }, ...outputs.map(([name, d]) => h('li', {}, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => select(name) }, name), h('span', { class: 'foot num' }, `${fmtInt(d.rows)} rows`), h('span', { class: 'hash' }, short(d.content)))))),
  );
  const closed = (name: string) => h('p', { class: 'status bad' }, `Closed to ${personName(state.viewer)}: ${access(name)?.reason ?? 'not run yet'}.`);
  try {
    const zh = readDataset('zone_hour');
    if (zh) {
      const zones = await engine.query(
        `SELECT pu_zone AS zone, pu_borough AS borough, sum(trips) AS trips, round(sum(avg_duration_min * trips) / sum(trips), 1) AS minutes, round(sum(avg_speed_mph * trips) / sum(trips), 1) AS mph FROM (${zh}) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`,
      );
      $('zones-table').replaceChildren(table(zones.columns, zones.rows));
    } else $('zones-table').replaceChildren(closed('zone_hour'));
    const we = readDataset('weather_effect');
    if (!we) {
      $('effect-chart').replaceChildren(closed('weather_effect'));
      return;
    }
    const effect = await engine.query(`SELECT borough, condition, hours, trips_per_hour, vs_dry FROM (${we}) WHERE condition <> 'dry' ORDER BY borough, condition`);
    const dry = await engine.query(`SELECT borough, hours, trips_per_hour FROM (${we}) WHERE condition = 'dry'`);
    const width = Math.min(720, Math.max(300, $('effect-chart').clientWidth || 340));
    $('effect-chart').replaceChildren(effectChart(effect.rows as [string, string, number, number, number][], dry.rows as [string, number, number][], width));
  } catch (e) {
    $('effect-chart').replaceChildren(h('p', { class: 'foot' }, message(e)));
  }
}

/** Horizontal bars per borough and condition: trips per hour against dry hours at the same hour of day (1.0). */
function effectChart(rows: [string, string, number, number, number][], dry: [string, number, number][], width: number): HTMLElement {
  const busy = new Set(dry.filter(([, , perHour]) => perHour >= 3).map(([b]) => b));
  const shown = rows.filter(([b, , hours]) => busy.has(b) && hours >= 4);
  if (shown.length === 0) return h('p', { class: 'foot' }, 'Not enough trips per hour in the sample to compare.');
  // Drawn at the width it is shown, so its labels stay at their real size on a phone.
  const left = Math.max(118, Math.round(width * 0.3));
  const right = 48;
  const barH = 18;
  const gap = 8;
  const groupGap = 18;
  const max = Math.max(1.5, ...shown.map((r) => r[4])) * 1.05;
  const x = (v: number) => left + (v / max) * (width - left - right);
  const boroughs = [...new Set(shown.map((r) => r[0]))];
  let y = 26;
  const marks: SVGElement[] = [];
  for (const b of boroughs) {
    marks.push(s('text', { x: 0, y: y + 12, 'font-weight': 600 }, b));
    y += 20;
    for (const [, condition, hours, , vs] of shown.filter((r) => r[0] === b)) {
      const cls = condition === 'snow' ? 'snow' : condition === 'heavy rain' ? 'heavy' : 'rain';
      marks.push(s('text', { x: 12, y: y + 13 }, `${condition} · ${hours} h`));
      marks.push(s('rect', { class: `bar ${cls}`, x: left, y, width: Math.max(1, x(vs) - left), height: barH, rx: 3 }));
      const change = vs - 1;
      marks.push(s('text', { x: x(vs) + 6, y: y + 13, class: 'num' }, `${change >= 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(0)}%`));
      y += barH + gap;
    }
    y += groupGap - gap;
  }
  const height = y + 4;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Trips per hour in rain, heavy rain and snow, against dry hours at the same hour of day' });
  for (const t of [0, 0.5, 1, 1.5, 2].filter((v) => v <= max)) {
    svg.append(s('line', { class: t === 1 ? 'base' : 'grid', x1: x(t), x2: x(t), y1: 18, y2: height }));
    svg.append(s('text', { class: 'axis', x: x(t), y: 12, 'text-anchor': 'middle' }, t === 1 ? 'dry = 1' : String(t)));
  }
  svg.append(...marks);
  return h('div', {}, svg, h('p', { class: 'foot' }, 'A 100,000-trip sample is about 3% of the month, so only boroughs with at least 3 trips in a dry hour are shown. Weather by Open-Meteo.com (CC BY 4.0); trips from the NYC TLC.'));
}

// ------------------------------------------------------------------ policies

const ruleNames = (ids: readonly string[]) =>
  ids.map((id) => (id === '*' ? 'everyone' : (policies()?.groups?.find((g) => g.id === id)?.name ?? personName(id)))).join(', ');
const actionName = (id: string) => state.doc.ontology?.actionTypes.find((a) => a.id === id)?.name ?? id;

function setViewer(id: string): void {
  state.viewer = id;
  $<HTMLSelectElement>('viewer').value = id;
  state.object = null;
  state.verdict = null;
  void computeChanges();
  renderCanvas();
  if (state.selected) void renderSheet();
  const view = location.hash.slice(1);
  if (view === 'results') void renderResults();
  if (view === 'policies') void renderPolicies();
  if (view === 'ontology') void renderOntology();
  setStatus(id === 'owner' ? 'Viewing as the owner: every row and column.' : `Viewing as ${personName(id)}: every read below goes through their rules.`);
}

let policiesRender = 0;
async function renderPolicies(): Promise<void> {
  const p = policies();
  if (!p) return;
  const token = ++policiesRender;
  $('people').replaceChildren(
    ...p.principals.map((x) => {
      const attrs = x.owner ? 'sees everything' : Object.entries(x.attributes ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') || 'no row limits';
      const groups = (p.groups ?? []).filter((g) => g.members.includes(x.id)).map((g) => g.name);
      return h('li', {},
        h('div', { class: 'row' }, h('span', { class: 'who' }, x.name), h('span', { class: 'foot', style: 'margin:0' }, x.role ?? ''),
          h('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.viewer === x.id), onclick: () => setViewer(x.id) }, state.viewer === x.id ? 'Viewing as' : 'View as')),
        h('span', { class: 'foot', style: 'margin:0' }, attrs + (groups.length ? ` · ${groups.join(', ')}` : '')));
    }),
  );
  $('rules').replaceChildren(
    ...p.rules.map((r) => {
      const text = r.kind === 'row' ? `Keeps rows whose ${r.columns.join(' (or ') + (r.columns.length > 1 ? ')' : '')} is one of each person's ${r.attribute}. A dataset without it is closed to them.`
        : r.kind === 'column' ? `Removes ${r.remove.join(', ')}.`
        : `${actionName(r.action)}${r.scope ? `, only where ${r.scope.columns.join(' or ')} is one of their ${r.scope.attribute}` : ''}.`;
      return h('li', {}, h('span', { class: 'tag' }, `${r.kind} rule · for ${ruleNames(r.for)}`), h('span', { class: 'who' }, r.name), h('span', { class: 'foot', style: 'margin:0' }, text));
    }),
  );
  const run = latest();
  if (!run || !state.engine) return;
  const outputs = Object.keys(run.result.manifest.outputs);
  const body: HTMLElement[] = [];
  for (const x of p.principals) {
    const cells: HTMLElement[] = [];
    for (const o of outputs) {
      const cols = state.columns.get(o);
      const view = cols ? readView(p, x.id, cols) : null;
      const sql = view ? wrapRead(view, `SELECT * FROM ${quoteIdent(o)}`) : null;
      if (!sql) {
        cells.push(h('td', { class: 'n closed-cell', title: view?.reason ?? '' }, 'closed'));
        continue;
      }
      const r = await state.engine.query(`SELECT count(*) FROM (${sql})`);
      cells.push(h('td', { class: 'n' }, fmtInt(Number(r.rows[0]![0])) + (view!.removed.length ? ` · ${view!.removed.length} cols out` : '')));
    }
    body.push(h('tr', {}, h('td', { style: 'font-weight:600' }, x.name), ...cells));
  }
  if (token !== policiesRender) return;
  $('matrix').replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), ...outputs.map((o) => h('th', { class: 'n' }, o)))), h('tbody', {}, ...body)));
}

// ------------------------------------------------------------------ ontology

async function refreshEdits(): Promise<void> {
  if (!state.engine) return;
  state.edits = (await state.engine.callPlugin('smaltfl', 'edits', [])) as Edit[];
  state.chain = (await state.engine.callPlugin('smaltfl', 'verifyEdits', [])) as typeof state.chain;
}

let ontologyRender = 0;
async function renderOntology(): Promise<void> {
  const o = state.doc.ontology;
  const engine = state.engine;
  if (!o) return;
  // A newer render (the viewer changed, an object was chosen) wins over one still waiting on the engine.
  const token = ++ontologyRender;
  const stale = () => token !== ontologyRender;
  const typeName = (id: string) => o.objectTypes.find((t) => t.id === id)?.name ?? id;
  const counts = new Map<string, number | null>();
  if (latest() && engine) {
    for (const t of o.objectTypes) {
      const sql = readDataset(t.dataset);
      counts.set(t.id, sql ? Number((await engine.query(`SELECT count(*) FROM (${sql})`)).rows[0]![0]) : null);
    }
  }
  if (stale()) return;
  $('ontology-map').replaceChildren(
    h('div', { class: 'types' },
      ...o.objectTypes.map((t) => {
        const c = counts.get(t.id);
        const links = o.linkTypes.filter((l) => l.from === t.id || l.to === t.id).map((l) => (l.from === t.id ? `${l.name} ${typeName(l.to)}` : `${typeName(l.from)} ${l.name} it`));
        const acts = o.actionTypes.filter((a) => a.on === t.id).map((a) => a.name);
        return h('button', { class: 'type', type: 'button', 'aria-pressed': String(state.ontologyType === t.id), onclick: () => ((state.ontologyType = t.id), (state.object = null), (state.verdict = null), void renderOntology()) },
          h('span', { class: 'tag' }, 'Object type'),
          h('span', { class: 'name' }, t.name),
          h('span', { class: 'meta' }, `${c === undefined ? '' : c === null ? `closed to ${personName(state.viewer)} · ` : `${fmtInt(c)} objects · `}from ${t.dataset}, keyed by ${t.key.join(' + ')}`),
          links.length ? h('span', { class: 'links' }, `Links: ${links.join(' · ')}`) : null,
          acts.length ? h('span', { class: 'links' }, `Actions: ${acts.join(', ')}`) : null);
      })),
  );
  const t = o.objectTypes.find((x) => x.id === state.ontologyType);
  const objects = $('objects');
  if (!t || !engine || !latest()) {
    objects.replaceChildren(h('p', { class: 'foot' }, latest() ? 'Choose an object type to see its objects.' : 'Run the flow to see the objects.'));
  } else {
    const sql = readDataset(t.dataset);
    const head = h('div', {}, h('h2', {}, t.name), h('p', { class: 'sub' }, `${t.description ?? ''} Read as ${personName(state.viewer)}.`));
    if (!sql) {
      objects.replaceChildren(head, h('p', { class: 'status bad' }, `Closed to ${personName(state.viewer)}: ${access(t.dataset)?.reason}.`));
    } else {
      const cols = state.columns.get(t.dataset) ?? [];
      const order = cols.includes('trips') ? '"trips" DESC' : quoteIdent(t.title);
      const r = await engine.query(`SELECT * FROM (${sql}) ORDER BY ${order} LIMIT 30`);
      if (stale()) return;
      const keyOf = (row: Record<string, unknown>) => canonicalJSON(Object.fromEntries(t.key.map((k) => [k, row[k] ?? null])));
      const latestEdit = new Map<string, Edit>();
      for (const e of state.edits) if (e.objectType === t.id && e.outcome === 'applied') latestEdit.set(`${e.action}|${e.object}`, e);
      const rows = r.rows.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])));
      const list = h('ul', { class: 'objects' },
        ...rows.map((row) => {
          const edits = o.actionTypes.filter((a) => a.on === t.id).map((a) => latestEdit.get(`${a.id}|${keyOf(row)}`)).filter((e): e is Edit => !!e);
          const detail = t.key.filter((k) => k !== t.title).map((k) => String(row[k])).join(' · ');
          const extra = 'trips' in row ? ` · ${fmtInt(Number(row.trips))} trips` : 'zones' in row ? ` · ${fmtInt(Number(row.zones))} zones` : 'condition' in row ? ` · ${String(row.condition)}` : '';
          const selected = state.object !== null && keyOf(state.object) === keyOf(row);
          return h('li', {}, h('button', { class: 'object', type: 'button', 'aria-pressed': String(selected), onclick: () => ((state.object = row), (state.verdict = null), void renderOntology()) },
            h('span', { class: 't' }, String(row[t.title])),
            h('span', { class: 'd' }, detail + extra),
            ...edits.map((e) => h('span', { class: 'pill ok' }, `${Object.entries(e.params).map(([k, v]) => `${k.replace(/_/g, ' ')} ${String(v)}`).join(', ')} · ${personName(e.actor)}`))));
        }));
      const forms = state.object ? actionForms(t.id) : null;
      objects.replaceChildren(head, list, forms ?? h('p', { class: 'foot' }, o.actionTypes.some((a) => a.on === t.id) ? 'Choose an object to act on it.' : 'No actions on this type.'));
    }
  }
  const chain = state.chain;
  $('edits').replaceChildren(
    h('h2', {}, 'Edits'),
    h('p', { class: 'sub' }, 'Every action, allowed or refused, in one hash chain: each record hashes itself and the record before it.'),
    chain ? h('div', { class: 'row' }, h('span', { class: `pill ${chain.ok ? 'ok' : 'bad'}` }, chain.ok ? 'chain verified' : `chain broken at #${chain.broken}`), h('span', { class: 'foot', style: 'margin:0' }, `${chain.edits} record${chain.edits === 1 ? '' : 's'}`)) : '',
    state.edits.length
      ? h('ul', { class: 'checks' }, ...[...state.edits].reverse().slice(0, 12).map((e) => h('li', {}, h('span', { class: e.outcome === 'applied' ? 'ok' : 'bad' }, e.outcome), h('span', {}, `#${e.seq} ${actionName(e.action)} by ${personName(e.actor)}: ${e.reason}. `, h('span', { class: 'hash' }, short(e.hash))))))
      : h('p', { class: 'foot' }, 'No edits yet.'),
  );
}

function actionForms(typeId: string): HTMLElement | null {
  const o = state.doc.ontology!;
  const acts = o.actionTypes.filter((a) => a.on === typeId);
  if (!acts.length || !state.object) return null;
  const wrap = h('div', {});
  for (const a of acts) {
    const inputs = a.params.map((p) => {
      const input = h('input', { id: `act-${a.id}-${p.name}`, type: p.type === 'text' ? 'text' : 'number', step: p.type === 'integer' ? '1' : 'any', inputmode: p.type === 'text' ? 'text' : 'numeric' });
      return { p, input };
    });
    const submit = h('button', { class: 'run', type: 'button' }, `${a.name} as ${personName(state.viewer)}`);
    submit.addEventListener('click', () => {
      const params = Object.fromEntries(inputs.map(({ p, input }) => [p.name, p.type === 'text' ? input.value : input.value === '' ? null : Number(input.value)]));
      void submitAction(a.id, params);
    });
    const v = state.verdict && state.verdict.action === a.id ? state.verdict : null;
    wrap.append(
      h('div', { class: 'form' },
        h('p', { class: 'eyebrow' }, `Action · ${a.name}`),
        a.description ? h('p', { class: 'foot', style: 'margin:0' }, a.description) : null,
        ...inputs.map(({ p, input }) => h('div', { class: 'field' }, h('label', { for: input.id }, p.label), input)),
        submit,
        v ? h('p', { class: `verdict ${v.outcome === 'applied' ? 'ok' : 'bad'}` }, `${v.outcome === 'applied' ? 'Applied' : 'Refused'}: ${v.reason}. Recorded as edit #${v.seq}.`) : null),
    );
  }
  return wrap;
}

async function submitAction(action: string, params: Record<string, string | number | null>): Promise<void> {
  const engine = state.engine;
  const o = state.doc.ontology;
  const run = latest();
  const t = o?.objectTypes.find((x) => x.id === state.ontologyType);
  if (!engine || !o || !run || !t || !state.object) return;
  const key = Object.fromEntries(t.key.map((k) => [k, (state.object![k] ?? null) as string | number | null]));
  const tables = Object.fromEntries(Object.keys(run.result.manifest.outputs).map((n) => [n, n]));
  try {
    state.verdict = (await engine.callPlugin('smaltfl', 'act', [{ ontology: o, policies: policies(), tables, request: { action, actor: state.viewer, key, params } }], { lock: true })) as Edit;
    setStatus(`${actionName(action)}: ${state.verdict.outcome} for ${personName(state.viewer)}.`, state.verdict.outcome !== 'applied');
  } catch (e) {
    setStatus(message(e), true);
  }
  await refreshEdits();
  await renderOntology();
}

// ------------------------------------------------------------------ runs

function renderRuns(): void {
  const list = $('runs-list');
  if (state.runs.length === 0) {
    list.replaceChildren(h('li', { class: 'panel' }, h('p', { class: 'foot' }, state.failed ? state.failed.message : 'The first run starts as soon as the data is loaded.')));
    return;
  }
  list.replaceChildren(
    ...state.runs.map((r) => {
      const m = r.result.manifest;
      const count = (status: string) => m.nodes.filter((n) => n.status === status).length;
      const li = h('li', { class: 'panel' });
      li.append(
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `Run ${r.result.run}`), h('span', { class: 'pill' }, `${count('built')} built`), h('span', { class: 'pill' }, `${count('reused')} reused`), h('span', { class: 'pill' }, `${count('folded')} folded`), h('span', { class: 'foot num' }, `${fmtMs(r.ms)} · ${r.at.toLocaleTimeString()}`)),
        h('p', { class: 'hash' }, `manifest ${r.result.hash}`),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => void verify(r) }, 'Verify'), h('button', { class: 'btn', type: 'button', onclick: () => void sign(r) }, r.signed ? 'Signed' : 'Sign')),
      );
      if (r.verified) {
        const failed = r.verified.checks.filter((c) => !c.ok);
        li.append(
          h('div', { class: 'row' }, h('span', { class: `pill ${r.verified.ok ? 'ok' : 'bad'}` }, r.verified.ok ? 'verified' : 'verification failed'), h('span', { class: 'foot' }, `${r.verified.checks.length} checks: stored hashes, then a recomputation from the snapshots`)),
          h('ul', { class: 'checks' }, ...(failed.length ? failed : r.verified.checks).slice(0, 12).map((c) => h('li', {}, h('span', { class: c.ok ? 'ok' : 'bad' }, c.ok ? 'ok' : 'failed'), h('span', {}, `${c.origin} · ${c.check}${c.note ? ` · ${c.note}` : ''}`)))),
        );
      }
      if (r.signed) li.append(h('div', { class: 'row' }, h('span', { class: `pill ${r.signatureOk ? 'ok' : 'bad'}` }, r.signatureOk ? 'signature valid' : 'signature invalid'), h('span', { class: 'hash' }, `${r.signed.signer.name} · ${short(r.signed.signer.fingerprint)}`)));
      li.append(h('details', {}, h('summary', {}, 'The manifest'), h('pre', { class: 'code' }, JSON.stringify(JSON.parse(canonicalJSON(m)), null, 2))));
      return li;
    }),
  );
}

async function verify(r: RunRecord): Promise<void> {
  if (!state.engine) return;
  setStatus(`Verifying run ${r.result.run}…`);
  try {
    r.verified = await verifyRun(state.engine, r.result.run, { smaltdb: SMALTDB });
    setStatus(r.verified.ok ? `Run ${r.result.run} verified: every hash matched, and recomputing it gave the same datasets.` : `Run ${r.result.run} failed verification.`, !r.verified.ok);
  } catch (e) {
    setStatus(message(e), true);
  }
  renderRuns();
}

async function sign(r: RunRecord): Promise<void> {
  state.identity ??= await createIdentity('This browser');
  r.signed = await signManifest(r.result.manifest, state.identity);
  r.signatureOk = (await verifyManifest(r.signed, state.identity.card)).ok;
  renderRuns();
}

// ------------------------------------------------------------------ running

async function run(): Promise<void> {
  const engine = state.engine;
  if (!engine || state.running) return;
  state.running = true;
  state.failed = null;
  $<HTMLButtonElement>('run').disabled = true;
  setStatus(state.runs.length ? 'Running: only what changed is rebuilt…' : 'Running the flow…');
  renderCanvas();
  const t = performance.now();
  try {
    const result = await runFlow(engine, state.doc, { smaltdb: SMALTDB });
    const ms = performance.now() - t;
    state.runs.unshift({ result, ms, at: new Date() });
    const count = (status: string) => result.manifest.nodes.filter((n) => n.status === status).length;
    await learnColumns();
    void computeChanges();
    await refreshEdits();
    setStatus(`Run ${result.run} took ${fmtMs(ms)}: ${count('built')} built, ${count('reused')} reused, ${count('folded')} folded${engine.mode === 'page' ? ' (the engine runs in the page here)' : ''}.`);
  } catch (e) {
    const msg = message(e);
    const origin = /^([A-Za-z][A-Za-z0-9_]*): /.exec(msg)?.[1];
    state.failed = { origin: origin && (steps().has(origin) || sourceIds().has(origin)) ? origin : undefined, message: msg };
    setStatus(`The run failed, and the previous results stay current. ${msg}`, true);
  } finally {
    state.running = false;
    $<HTMLButtonElement>('run').disabled = false;
    renderCanvas();
    renderRuns();
    if (state.selected) void renderSheet();
    if (location.hash === '#results') void renderResults();
    if (location.hash === '#policies') void renderPolicies();
    if (location.hash === '#ontology') void renderOntology();
  }
}

// ------------------------------------------------------------------ views and start

/**
 * A data file published next to the page. The artifact host serves text but not Parquet, so a Parquet file is
 * published base64-encoded as `<name>.txt` and decoded here, back to its exact bytes.
 */
async function loadFile(name: string): Promise<Uint8Array> {
  const binary = name.endsWith('.parquet');
  const res = await fetch(`data/${name}${binary ? '.txt' : ''}`);
  if (!res.ok) throw new Error(`couldn't load data/${name} (${res.status})`);
  if (!binary) return new Uint8Array(await res.arrayBuffer());
  const text = atob((await res.text()).trim());
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function showView(): void {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'flow';
  if (state.selected || state.section) select(null);
  for (const v of VIEWS) {
    $(`view-${v}`).hidden = v !== view;
    const tab = $(`tab-${v}`);
    if (v === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (view === 'flow') renderCanvas();
  if (view === 'results') void renderResults();
  if (view === 'policies') void renderPolicies();
  if (view === 'ontology') void renderOntology();
}

const VIEWS = ['flow', 'ontology', 'policies', 'results', 'runs'];

async function start(): Promise<void> {
  loadArrangement();
  state.collapsed = new Set((state.doc.groups ?? []).filter((g) => g.collapsed).map((g) => g.id));
  $('flow-name').textContent = state.doc.name;
  const picker = $<HTMLSelectElement>('viewer');
  picker.replaceChildren(...(policies()?.principals ?? [{ id: 'owner', name: 'Owner' }]).map((x) => h('option', { value: x.id }, 'role' in x && x.role ? `${x.name} (${x.role})` : x.name)));
  picker.value = state.viewer;
  picker.addEventListener('change', () => setViewer(picker.value));
  window.addEventListener('hashchange', showView);
  let resize = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resize);
    resize = requestAnimationFrame(() => {
      syncHead();
      renderCanvas();
    });
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && (state.selected || state.section) && select(null));
  $('run').addEventListener('click', () => void run());
  showView();
  renderRuns();
  try {
    setStatus('Starting the engine…');
    const engine = await connect();
    setStatus('Loading 100,000 trips, the zones and the weather…');
    const files = await Promise.all(EXAMPLE_SOURCES.map(async (src) => [src, await loadFile(src.file)] as const));
    for (const [src, bytes] of files) {
      await registerFile(engine, src.file, bytes);
      await engine.exec(src.ddl);
    }
    state.engine = engine;
    await run();
  } catch (e) {
    state.failed = { message: `The engine couldn't start: ${message(e)}` };
    setStatus(state.failed.message, true);
    renderRuns();
  }
}

void start();
