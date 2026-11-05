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
import type { FlowDocument, StepDef } from '../core/document.js';
import { validateDocument } from '../core/document.js';
import { emitSelect } from '../core/emit.js';
import type { Identity, ManifestNode, SignedManifest } from '../core/manifest.js';
import type { Edit } from '../core/ontology.js';
import { readView, wrapRead, type ReadView } from '../core/policy.js';
import { createIdentity, signManifest, verifyManifest } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import type { FlowPlan } from '../core/plan.js';
import type { RunResult, VerifyResult } from '../core/protocol.js';
import { literal, quoteIdent } from '../core/sqltext.js';
import { runFlow, verifyRun } from '../index.js';
import { connect, type Engine } from './engine.js';
import { placeSections } from './layout.js';

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

function cardLine(id: string): string {
  if (state.failed?.origin === id) return 'failed: tap for why';
  const view = access(id);
  if (view && !view.open) return `closed to ${personName(state.viewer)}`;
  const n = nodeOf(id);
  if (!n) return state.running ? 'running…' : (steps().get(id)?.description ?? state.doc.sources.find((src) => src.id === id)?.description ?? '');
  if (n.expectations) return `dropped ${fmtInt(n.expectations.dropped)} (${pct(n.expectations.dropped / Math.max(1, n.expectations.rows))})`;
  if (n.status === 'folded') return 'folded, no copy kept';
  return `${n.status} · ${fmtInt(n.rows ?? 0)} rows`;
}

// ------------------------------------------------------------------ the canvas

function renderCanvas(): void {
  const host = $('canvas');
  const width = Math.max(300, Math.floor(host.clientWidth || 360));
  const sections = placeSections(state.doc, state.collapsed);
  const pad = 10;
  const head = 30;
  const gapX = 10;
  const gapY = 24;
  const cardH = 62;
  const maxCols = Math.max(1, ...sections.map((sec) => sec.cols));
  const cardW = Math.min(232, (width - 2 * pad - gapX * (maxCols - 1)) / maxCols);
  const pos = new Map<string, { x: number; y: number }>();
  const frames: { sec: (typeof sections)[number]; y: number; h: number }[] = [];
  let y = 2;
  for (const sec of sections) {
    const rowsH = sec.rows * cardH + (sec.rows - 1) * gapY;
    const h = head + rowsH + pad;
    const offX = (width - (sec.collapsed ? cardW : sec.cols * cardW + (sec.cols - 1) * gapX)) / 2;
    if (sec.collapsed) for (const m of sec.members) pos.set(m, { x: offX, y: y + head });
    else for (const c of sec.cards) pos.set(c.id, { x: offX + c.col * (cardW + gapX), y: y + head + c.row * (cardH + gapY) });
    frames.push({ sec, y, h });
    y += h + 14;
  }
  const height = y;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': 'The flow in sections, from its sources down to its datasets' });
  const sectionOf = new Map(sections.flatMap((sec) => sec.members.map((m) => [m, sec] as const)));
  for (const f of frames) {
    const g = s('g', { class: 'section' });
    g.append(s('rect', { class: 'frame', x: 0.5, y: f.y, width: width - 1, height: f.h, rx: 12 }));
    const steps = f.sec.members.length;
    g.append(s('text', { class: 'label', x: 12, y: f.y + 19 }, `${f.sec.name.toUpperCase()} · ${steps} ${steps === 1 ? 'STEP' : 'STEPS'}`));
    g.append(s('text', { class: 'toggle', x: width - 12, y: f.y + 19, 'text-anchor': 'end' }, f.sec.collapsed ? 'open ▸' : 'fold ▾'));
    const hit = s('rect', { class: 'hit', x: 0, y: f.y, width, height: head, tabindex: 0, role: 'button', 'aria-label': `${f.sec.collapsed ? 'Open' : 'Fold'} the ${f.sec.name} section` });
    const toggle = () => {
      if (state.collapsed.has(f.sec.id)) state.collapsed.delete(f.sec.id);
      else state.collapsed.add(f.sec.id);
      renderCanvas();
    };
    hit.addEventListener('click', toggle);
    hit.addEventListener('keydown', (e) => ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') && (e.preventDefault(), toggle()));
    g.append(hit);
    svg.append(g);
  }
  const drawn = new Set<string>();
  for (const st of state.doc.steps) {
    for (const input of st.inputs) {
      const from = pos.get(input)!;
      const to = pos.get(st.id)!;
      if (from === to || (from.x === to.x && from.y === to.y)) continue;
      const key = `${from.x},${from.y}>${to.x},${to.y}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const x1 = from.x + cardW / 2;
      const y1 = from.y + cardH;
      const x2 = to.x + cardW / 2;
      const y2 = to.y;
      const mid = (y1 + y2) / 2;
      svg.append(s('path', { class: 'edge', d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2 - 4}` }));
      svg.append(s('circle', { class: 'edge-dot', cx: x2, cy: y2 - 3, r: 2.5 }));
    }
  }
  const chars = Math.max(8, Math.floor((cardW - 24) / 7.4));
  const fit = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
  const card = (id: string, x: number, yy: number, kind: string, name: string, line: string, classes: string[], onOpen: () => void) => {
    const g = s('g', { class: ['card', ...classes].join(' '), tabindex: 0, role: 'button', 'aria-label': `${name}: ${kind}. ${line}` });
    g.append(s('rect', { class: 'box', x, y: yy, width: cardW, height: cardH, rx: 9 }));
    g.append(s('text', { class: 'kind', x: x + 12, y: yy + 18 }, fit(kind, Math.floor(chars * 1.15))));
    g.append(s('text', { class: 'name', x: x + 12, y: yy + 36 }, fit(name, chars)));
    g.append(s('text', { class: 'what', x: x + 12, y: yy + 53 }, fit(line, Math.floor(chars * 1.12))));
    g.addEventListener('click', onOpen);
    g.addEventListener('keydown', (e) => ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') && (e.preventDefault(), onOpen()));
    svg.append(g);
    void id;
  };
  for (const f of frames) {
    if (f.sec.collapsed) {
      const p0 = pos.get(f.sec.members[0]!)!;
      const built = f.sec.members.filter((m) => nodeOf(m)?.status === 'built').length;
      card(f.sec.id, p0.x, p0.y, 'SECTION', f.sec.name, latest() ? `${f.sec.members.length} steps · ${built} built` : `${f.sec.members.length} steps`, ['summary'], () => {
        state.collapsed.delete(f.sec.id);
        renderCanvas();
      });
      continue;
    }
    for (const c of f.sec.cards) {
      const { x, y: yy } = pos.get(c.id)!;
      const n = nodeOf(c.id);
      const view = access(c.id);
      const classes = [sourceIds().has(c.id) ? 'source' : steps().get(c.id)?.dataset ? 'dataset' : 'step'];
      if (state.failed?.origin === c.id) classes.push('failed');
      else if (view && !view.open) classes.push('closed');
      else if (n) classes.push(n.status);
      if (state.selected === c.id) classes.push('selected');
      card(c.id, x, yy, kindLabel(c.id), c.id, cardLine(c.id), classes, () => select(c.id));
    }
  }
  void sectionOf;
  host.replaceChildren(svg);
}

function select(id: string | null): void {
  state.selected = id;
  state.issues = [];
  renderCanvas();
  void renderSheet();
}

// ------------------------------------------------------------------ the sheet

async function renderSheet(): Promise<void> {
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
  sheet.replaceChildren(
    h('div', { class: 'sheet-head' }, h('div', { style: 'flex:1;min-width:0' }, h('p', { class: 'eyebrow' }, kindLabel(id)), h('h2', {}, id)), h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
    body,
  );
  sheet.hidden = false;
  const description = st?.description ?? source?.description;
  if (description) body.append(h('p', { class: 'lede' }, description));
  if (state.failed && (state.failed.origin === id || (!state.failed.origin && !n))) body.append(h('p', { class: 'status bad' }, state.failed.message));

  const facts = h('dl', { class: 'facts' });
  const fact = (k: string, v: Child) => facts.append(h('dt', {}, k), h('dd', {}, v));
  if (n) {
    fact('This run', n.status === 'folded' ? 'folded into the statement that reads it' : n.status);
    if (n.rows !== undefined) fact('Rows', fmtInt(n.rows));
    fact('Key', h('span', { class: 'hash' }, short(n.key)));
    if (n.content) fact('Content', h('span', { class: 'hash' }, short(n.content)));
  } else fact('This run', 'not run yet');
  if (source) fact('Reads', h('span', { class: 'mono' }, source.table));
  if (st) fact('Reads', h('span', { class: 'mono' }, st.inputs.join(', ')));
  body.append(facts);

  if (n?.expectations) {
    const e = n.expectations;
    const rows = e.rules.map((r) => h('tr', {}, h('td', {}, r.name), h('td', {}, r.onFail), h('td', { class: 'n' }, fmtInt(r.failed)), h('td', { class: 'n' }, pct(r.failed / Math.max(1, e.rows)))));
    body.append(
      h('div', {}, h('p', { class: 'eyebrow' }, `Checks · ${fmtInt(e.dropped)} of ${fmtInt(e.rows)} rows dropped (${pct(e.dropped / Math.max(1, e.rows))})`),
        h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Rule'), h('th', {}, 'On fail'), h('th', { class: 'n' }, 'Rows'), h('th', { class: 'n' }, 'Share'))), h('tbody', {}, ...rows)))),
    );
  }

  if (st) body.append(editor(st));

  const preview = h('div', {}, h('p', { class: 'eyebrow' }, 'Preview · first 20 rows'), h('p', { class: 'foot' }, n ? 'Loading…' : 'Run the flow to preview its rows.'));
  const explain = h('details', {}, h('summary', {}, 'What the engine runs'), h('pre', { class: 'code' }, n ? 'Loading…' : 'Run the flow first.'));
  body.append(preview, explain);
  if (!n || !state.engine) return;
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
    preview.lastElementChild!.replaceWith(h('div', {}, table(r.columns, r.rows), note));
  } catch (e) {
    preview.lastElementChild!.textContent = message(e);
  }
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
  const plan = await planFor(run);
  const i = plan.nodes.findIndex((n) => n.origin === id);
  if (i < 0 || !plan.nodes[i]!.schema) return null;
  const keys = run.result.manifest.nodes.filter((n) => n.content !== undefined).map((n) => literal(n.key, 'text'));
  const tables = new Map<string, string>();
  if (keys.length) for (const [key, tbl] of (await state.engine.query(`SELECT key, tbl FROM _smaltfl_versions WHERE key IN (${keys.join(', ')})`)).rows) tables.set(String(key), String(tbl));
  const tableOf = new Map<number, string>();
  for (const m of run.result.manifest.nodes) if (tables.has(m.key)) tableOf.set(m.node, tables.get(m.key)!);
  const { stored } = shapeOf(plan);
  if (tableOf.has(i)) return `SELECT * FROM ${quoteIdent(tableOf.get(i)!)}`;
  return emitSelect(plan, i, { table: (j) => (stored.has(j) ? tableOf.get(j) : undefined), columns: (j) => plan.nodes[j]!.schema!.map(([c]) => c) });
}

function table(columns: string[], rows: unknown[][]): HTMLElement {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return h('td', { class: 'null' }, 'null');
    if (typeof v === 'number') return h('td', { class: 'n' }, Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000));
    if (typeof v === 'bigint') return h('td', { class: 'n' }, v.toString());
    return h('td', {}, String(v));
  };
  return h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', {}, c)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map(cell))))));
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
  renderCanvas();
  if (state.selected) void renderSheet();
  const view = location.hash.slice(1);
  if (view === 'results') void renderResults();
  if (view === 'policies') void renderPolicies();
  if (view === 'ontology') void renderOntology();
  setStatus(id === 'owner' ? 'Viewing as the owner: every row and column.' : `Viewing as ${personName(id)}: every read below goes through their rules.`);
}

async function renderPolicies(): Promise<void> {
  const p = policies();
  if (!p) return;
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
  $('matrix').replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), ...outputs.map((o) => h('th', { class: 'n' }, o)))), h('tbody', {}, ...body)));
}

// ------------------------------------------------------------------ ontology

async function refreshEdits(): Promise<void> {
  if (!state.engine) return;
  state.edits = (await state.engine.callPlugin('smaltfl', 'edits', [])) as Edit[];
  state.chain = (await state.engine.callPlugin('smaltfl', 'verifyEdits', [])) as typeof state.chain;
}

async function renderOntology(): Promise<void> {
  const o = state.doc.ontology;
  const engine = state.engine;
  if (!o) return;
  const typeName = (id: string) => o.objectTypes.find((t) => t.id === id)?.name ?? id;
  const counts = new Map<string, number | null>();
  if (latest() && engine) {
    for (const t of o.objectTypes) {
      const sql = readDataset(t.dataset);
      counts.set(t.id, sql ? Number((await engine.query(`SELECT count(*) FROM (${sql})`)).rows[0]![0]) : null);
    }
  }
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
  if (state.selected) select(null);
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
  document.addEventListener('keydown', (e) => e.key === 'Escape' && state.selected && select(null));
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
