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
import { createIdentity, signManifest, verifyManifest } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import type { FlowPlan } from '../core/plan.js';
import type { RunResult, VerifyResult } from '../core/protocol.js';
import { literal, quoteIdent } from '../core/sqltext.js';
import { runFlow, verifyRun } from '../index.js';
import { connect, type Engine } from './engine.js';
import { placeCards } from './layout.js';

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
};

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
  const { cards, rows, cols } = placeCards(state.doc);
  const gapX = 12;
  const gapY = 30;
  const cardH = 64;
  const cardW = Math.min(240, (width - gapX * (cols - 1)) / cols);
  const offX = (width - (cols * cardW + (cols - 1) * gapX)) / 2;
  const height = rows * cardH + (rows - 1) * gapY + 8;
  const pos = new Map(cards.map((c) => [c.id, { x: offX + c.col * (cardW + gapX), y: 4 + c.row * (cardH + gapY) }]));
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': 'The flow, from its sources down to its datasets' });
  for (const st of state.doc.steps) {
    const to = pos.get(st.id)!;
    for (const input of st.inputs) {
      const from = pos.get(input)!;
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
  for (const c of cards) {
    const { x, y } = pos.get(c.id)!;
    const n = nodeOf(c.id);
    const classes = ['card', sourceIds().has(c.id) ? 'source' : steps().get(c.id)?.dataset ? 'dataset' : 'step'];
    if (state.failed?.origin === c.id) classes.push('failed');
    else if (n) classes.push(n.status);
    if (state.selected === c.id) classes.push('selected');
    const g = s('g', { class: classes.join(' '), tabindex: 0, role: 'button', 'aria-label': `${c.id}: ${kindLabel(c.id)}. ${cardLine(c.id)}` });
    g.append(s('rect', { class: 'box', x, y, width: cardW, height: cardH, rx: 9 }));
    g.append(s('text', { class: 'kind', x: x + 12, y: y + 18 }, fit(kindLabel(c.id), Math.floor(chars * 1.15))));
    g.append(s('text', { class: 'name', x: x + 12, y: y + 37 }, fit(c.id, chars)));
    g.append(s('text', { class: 'what', x: x + 12, y: y + 54 }, fit(cardLine(c.id), Math.floor(chars * 1.12))));
    g.addEventListener('click', () => select(c.id));
    g.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        select(c.id);
      }
    });
    svg.append(g);
  }
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
    explain.lastElementChild!.textContent = sql;
    const r = await state.engine.query(`SELECT * FROM (\n${sql}\n) LIMIT 20`);
    if (state.selected !== id) return;
    preview.lastElementChild!.replaceWith(table(r.columns, r.rows));
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
  try {
    const zones = await engine.query(
      'SELECT pu_zone AS zone, pu_borough AS borough, sum(trips) AS trips, round(sum(avg_duration_min * trips) / sum(trips), 1) AS minutes, round(sum(avg_speed_mph * trips) / sum(trips), 1) AS mph FROM zone_hour GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8',
    );
    $('zones-table').replaceChildren(table(zones.columns, zones.rows));
    const effect = await engine.query("SELECT borough, condition, hours, trips_per_hour, vs_dry FROM weather_effect WHERE condition <> 'dry' ORDER BY borough, condition");
    const dry = await engine.query("SELECT borough, hours, trips_per_hour FROM weather_effect WHERE condition = 'dry'");
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
  const view = ['flow', 'results', 'runs'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'flow';
  if (state.selected) select(null);
  for (const v of ['flow', 'results', 'runs']) {
    $(`view-${v}`).hidden = v !== view;
    const tab = $(`tab-${v}`);
    if (v === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (view === 'flow') renderCanvas();
  if (view === 'results') void renderResults();
}

async function start(): Promise<void> {
  $('flow-name').textContent = state.doc.name;
  window.addEventListener('hashchange', showView);
  let resize = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resize);
    resize = requestAnimationFrame(renderCanvas);
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
