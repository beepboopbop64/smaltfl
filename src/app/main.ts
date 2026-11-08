/**
 * The smaltfl app, first version: the example flow on real data, run in this browser. The flow draws as a canvas of
 * cards; a card opens a sheet with the step's settings (editable: change one, run again, and only what depends on it
 * is rebuilt), its expectation counts, a preview of its rows and the statement the engine runs for it. Results show
 * weather's effect on demand; runs can be verified and signed.
 *
 * Plain DOM and SVG, as the family's apps are. Everything a person typed or a dataset holds is set with textContent.
 */
import exampleDoc from '../../examples/nyc-taxis-weather.smaltfl.json';
import { EXAMPLE_SOURCES, pinnedDdl } from '../../examples/sources.js';
import { holidayOf, seasonOf } from '../core/calendar.js';
import { canonicalJSON } from '../core/canonical.js';
import type { FlowDocument, GroupDef, ProfileDef, StepDef } from '../core/document.js';
import { GROUP_COLORS, insertAfter, takeOut, validateDocument, withoutDisplay } from '../core/document.js';
import { createTable, emitCheckCounts, emitColumnFacts, emitCopy, emitDistinct, emitDrop, emitDropped, emitExcept, emitFailures, emitLookup, emitRead, emitRuleFailures, emitSample, emitSqlOver, emitUnionAll, emitUnmatched, sameColumns, type EmitContext } from '../core/emit.js';
import { effectOf, type Effect } from '../core/effect.js';
import { daysFrom, HISTORY_FORMAT, HistoryRanges, metricKey, type HistoryFile, type Metric } from '../core/history.js';
import type { Identity, ManifestNode, SignedManifest } from '../core/manifest.js';
import type { Backtest, NormalRange, NormalRanges, Place } from '../core/normal.js';
import { isPlaceholder, newsOf, shareWords, tableNewsOf, usualHours, type Act, type Finding, type Names, type Severity, type TableFacts } from '../core/news.js';
import { calendarHead, lacked, noRowsBefore, reachLabel, rowsFrom, shortfall, shownRun, stoppedLine as stoppedWords, toldLine, type EpisodeDay } from '../core/days.js';
import { CELL_KINDS, CELL_NAMES, STRIP_KEY, approx, changeLabel, compact, countLabel, countRange, gateLabels, gateOf, partLabel, pastLimit, ruleOrder, ruleUsual, splitSentence, storyOf, type Cell, type Gate, type Story, type Told } from '../core/story.js';
import { amountLine, bulletTrack, chain, composition, contextBars, dayStrip, effectBars, learnStrip, episodeBars, heldLineage, partBar, reachIcon, DEFS as VIZ_DEFS, dumbbellRows, episodeLine, farStrip, gateBars, glyph, hourBars, lineage, microDot, quantileStrip, ruleRows, splitRows, stripBar, trendPips, waterfall, type Dumbbell, type Mark as VizMark, type StripDay } from './viz.js';
import { sha256Hex } from '../core/hash.js';
import { meaningOf, propertyOf, type Edit, type PropertyType } from '../core/ontology.js';
import { covers, readView, wrapRead, type Principal, type ReadView, type RowRule } from '../core/policy.js';
import { createIdentity, ontologyHash, policiesHash, signManifest, verifyManifest } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import { flowHash, type Column, type FlowPlan, type PlanNode } from '../core/plan.js';
import { checksOver, clockText, columnSql, fillGaps, growForest, isolationPath, madsOf, minuteOfDay, pathLength, principalComponents, profileColumn, quantile, scoreOf, suggestChecks, unusual, type Cut, type Drift, type Forest, type Judge, type Profile, type Suggestion, type Unusual } from '../core/quality.js';
import type { RunResult, VerifyLevel, VerifyResult } from '../core/protocol.js';
import { identifiers, literal, quoteIdent } from '../core/sqltext.js';
import { pinFile, runFlow, verifyRun } from '../index.js';
import { describe as describeFile, severityOf as fileSeverity, type FileCheck } from '../core/integrity.js';
import { fetchChecked, IntegrityError, type Expected } from './fetch-checked.js';
import { FlowRecord } from './record.js';
import { buildBag } from '../core/bag.js';
import { zip } from '../core/zip.js';
import { parseCheckpoint, type JSONValue } from '../core/log.js';
import { connect, type Engine } from './engine.js';
import { besideSlot, edgePath, frameAt, freeSlot, GRID, gridLayout, groupKey, pinLayout, type GridLayout } from './layout.js';

declare const __SMALTDB_VERSION__: string;
const SMALTDB = typeof __SMALTDB_VERSION__ === 'string' ? __SMALTDB_VERSION__ : '0.9.0';

interface RunRecord {
  result: RunResult;
  ms: number;
  at: Date;
  /** The daily load it ran on, by place in the list. */
  load?: number;
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
  failed: null as { origin?: string; message: string; file?: FileCheck } | null,
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
  /** Whom a step's sheet shows that step as, when not the viewer: View as, for one step. */
  previewAs: null as string | null,
  /** Where a sheet opens: at its start, or at who can see the step (from a card's shield). */
  sheetFocus: null as 'access' | null,
  /** Each node's output columns, from the latest run's typed plan. */
  columns: new Map<string, string[]>(),
  ontologyType: null as string | null,
  object: null as Record<string, unknown> | null,
  verdict: null as Edit | null,
  edits: [] as Edit[],
  chain: null as { ok: boolean; edits: number; broken?: number } | null,
};

const policies = () => state.doc.policies;
/** The flow's profile boxes, and the one with an id. */
const profiles = (): ProfileDef[] => state.doc.profiles ?? [];
const profileOf = (id: string) => profiles().find((p) => p.id === id);

/**
 * The flow as the canvas lays it out: a profile box of a step shown is a box reading that step, in its section, so
 * the automatic layout puts it beside the step. Only the canvas sees them so: the plan never does.
 */
function canvasDoc(doc: FlowDocument): FlowDocument {
  const shown = new Set([...doc.sources.map((x) => x.id), ...doc.steps.map((x) => x.id)]);
  const boxes = (doc.profiles ?? []).filter((p) => shown.has(p.of));
  if (!boxes.length) return doc;
  return {
    ...doc,
    steps: [...doc.steps, ...boxes.map((p): StepDef => ({ id: p.id, kind: 'sql', inputs: [p.of], sql: 'SELECT 1', description: p.description }))],
    groups: doc.groups?.map((g) => ({ ...g, steps: [...g.steps, ...boxes.filter((p) => g.steps.includes(p.of)).map((p) => p.id)] })),
  };
}
const personName = (id: string) => policies()?.principals.find((x) => x.id === id)?.name ?? id;
/** What the current viewer may read of a node, or null before the node has run. */
const access = (id: string, who = state.viewer): ReadView | null => {
  const cols = state.columns.get(id);
  return cols ? readView(policies(), who, cols) : null;
};
/** Whether a person owns the flow (with no policies, everyone does). */
const isOwner = (who = state.viewer) => {
  const p = policies();
  return !p || !!p.principals.find((x) => x.id === who)?.owner;
};
/** Whether the viewer may see a source or step at all: not when it is closed to them. Before a run, everything shows. */
const visible = (id: string) => access(id)?.open !== false;
/**
 * The flow as the viewer sees it. What is closed to them is left out, with the edges to it, and so is a section that
 * has nothing left in it: they see the flow they can read, not a map of what they can't. The owner sees all of it.
 */
function viewDoc(): FlowDocument {
  const d = state.doc;
  if (isOwner()) return d;
  return {
    ...d,
    sources: d.sources.filter((x) => visible(x.id)),
    steps: d.steps.filter((x) => visible(x.id)).map((st) => ({ ...st, inputs: st.inputs.filter(visible) })) as StepDef[],
    groups: d.groups?.map((g) => ({ ...g, steps: g.steps.filter(visible) })).filter((g) => g.steps.length > 0),
  };
}

/**
 * A published dataset's rows as the viewer may read them, from the run on screen (on a held day, the last day before
 * it that passed, not whatever ran last), as a subquery, or null when closed.
 */
async function readOutput(name: string): Promise<string | null> {
  const run = latest();
  if (!run || !state.engine) return null;
  const insp = await inspect(run);
  const o = insp.plan.outputs.find((x) => x.name === name);
  return o ? readIn(insp, o.node) : readDataset(name);
}

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
/** A share to a tenth of a point; a share that isn't nothing never reads as 0.0% (<0.1%), nor one short of all as
 * 100.0% (>99.9%). */
const pct = (x: number) => (x > 0 && x < 0.0005 ? '<0.1%' : x < 1 && x >= 0.9995 ? '>99.9%' : `${(x * 100).toFixed(1)}%`);
/** Short counts for cards: 9,555 · 12.3k · 456k · 1.2M. */
const fmtCompact = (n: number) => (Math.abs(n) < 10000 ? fmtInt(n) : Math.abs(n) < 1e6 ? `${(n / 1000).toFixed(Math.abs(n) < 1e5 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);

function setStatus(text: string, bad = false, run?: { n: number; state: 'done' | 'failed' | 'refused' }): void {
  const el = $('status');
  el.textContent = text;
  // A line about a run on a day takes that day's severity, held or published alike: one rule for every alert day.
  const day = run && loads.list.length > 1 ? loads.list[loads.at]?.day : undefined;
  const sev = day ? verdictOf(day)?.severity : undefined;
  el.classList.toggle('bad', bad || sev === 'alert');
  el.classList.toggle('warn', !bad && sev === 'warn');
  // For tests and tools: which run the line is about, and how it ended, whatever its words.
  if (run) {
    el.dataset.run = String(run.n);
    el.dataset.state = run.state;
  }
  syncHead();
}

/** Runs started, done or not: the status line's data-run, so a tool sees each one end. */
let attempts = 0;

/** The header's line after a run on a day: the day and its head, as its story says it (ADR 0008). */
function dayStatus(k: number, fallback: string): string {
  const l = loads.list[k];
  const top = l ? verdictOf(l.day) : undefined;
  if (!l || !top) return fallback;
  return `${dayLabel(l.day).replace(/, \d{4}$/, '')}: ${top.title}`;
}

/** The sheet opens below the header, whatever its height, so the tabs and Run stay in reach. */
function syncHead(): void {
  const bar = document.querySelector('header.bar');
  if (bar) document.documentElement.style.setProperty('--head', `${Math.ceil(bar.getBoundingClientRect().bottom)}px`);
}

// ------------------------------------------------------------------ the flow's facts

const steps = () => new Map(state.doc.steps.map((st) => [st.id, st]));
const sourceIds = () => new Set(state.doc.sources.map((src) => src.id));
/**
 * The run on screen (ADR 0008 §10): the viewed day's own, or after a held or refused run the latest day before it that
 * passed, never a later day's. Every view reads its rows through this one.
 */
const latest = (): RunRecord | undefined => {
  const viewed = loads.list.length > 1 ? loads.list[loads.at]?.day : undefined;
  const k = shownRun(state.runs.map((r) => (r.load !== undefined ? loads.list[r.load]?.day : undefined)), viewed);
  return k < 0 ? undefined : state.runs[k];
};
/** The day of the run on screen, where runs are by day. */
const shownDay = (): string | undefined => {
  const r = latest();
  return r?.load !== undefined ? loads.list[r.load]?.day : undefined;
};
/** The day on screen: the load picked in the strip. */
const viewedDay = (): string | undefined => (loads.list.length > 1 ? loads.list[loads.at]?.day : undefined);
/** The date bar for rows on screen that are another day's, or null. */
const rowsFromBar = (): HTMLElement | null => {
  const text = rowsFrom(shownDay(), viewedDay());
  return text ? h('p', { class: 'rows-from', role: 'note' }, text) : null;
};
const nodeOf = (id: string): ManifestNode | undefined => latest()?.result.manifest.nodes.find((n) => n.origin === id);

const KIND: Record<string, string> = { sql: 'SQL', filter: 'FILTER', formula: 'FORMULAS', select: 'SELECT', join: 'JOIN', aggregate: 'AGGREGATE', expectations: 'CHECKS' };

/** The file an input reads, where the app knows it (the example's sources). */
const inputFile = (id: string) => {
  const src = state.doc.sources.find((x) => x.id === id);
  return src ? EXAMPLE_SOURCES.find((e) => e.table === src.table) : undefined;
};
const FORMATS: Record<string, string> = { parquet: 'Parquet', csv: 'CSV', json: 'JSON', ndjson: 'NDJSON', arrow: 'Arrow' };
/** A file's format, by its extension: Parquet, CSV… */
const formatOf = (file: string) => {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  return FORMATS[ext] ?? ext.toUpperCase();
};
/** A step that publishes a dataset: an output of the flow. */
const isOutput = (id: string) => !!steps().get(id)?.dataset;
/** What reads a source or step: steps, and the ontology's object types. */
const readersOf = (id: string) => state.doc.steps.filter((st) => st.inputs.includes(id)).map((st) => st.id);

function kindLabel(id: string): string {
  if (profileOf(id)) return 'PROFILE';
  if (sourceIds().has(id)) {
    const f = inputFile(id);
    return f ? `INPUT · ${formatOf(f.file).toUpperCase()}` : 'INPUT';
  }
  const st = steps().get(id)!;
  // Checks that only drop rows are a filter, with a reason for each rule.
  const kind = st.kind === 'expectations' && st.rules.every((r) => r.onFail === 'drop') ? 'FILTER' : (KIND[st.kind] ?? st.kind.toUpperCase());
  return `${kind}${st.dataset ? ' · OUTPUT' : ''}`;
}

// ------------------------------------------------------------------ who can see what, per step

type Access = 'all' | 'rows' | 'columns' | 'closed';

/** How much of a step a person sees: all of it, some rows, some columns, or none of it. */
const accessOf = (view: ReadView): Access => (!view.open ? 'closed' : view.filters.length ? 'rows' : view.removed.length ? 'columns' : 'all');
const ACCESS_LABEL: Record<Access, string> = { all: 'all of it', rows: 'some rows', columns: 'some columns', closed: 'closed' };

/** A person's access to a step, in a few words: which rows, which columns, or why it is closed to them. */
function accessText(p: Principal, view: ReadView, columns: readonly string[]): string {
  if (p.owner) return 'everything: they own the flow';
  const rules = policies()?.rules ?? [];
  if (!view.open) {
    const missing = rules.find((r): r is RowRule => r.kind === 'row' && covers(policies()!, r.for, p.id) && !columns.some((c) => r.columns.some((n) => n.toLowerCase() === c.toLowerCase())));
    return missing ? `no ${missing.columns.join(' or ')} here to filter on (${missing.name})` : (view.reason ?? 'closed');
  }
  const parts: string[] = [];
  for (const name of view.filters) {
    const rule = rules.find((r): r is RowRule => r.kind === 'row' && r.name === name);
    const values = rule ? (p.attributes?.[rule.attribute] ?? []) : [];
    parts.push(`only ${values.length ? values.join(', ') : 'nothing'} (${name})`);
  }
  if (view.removed.length) {
    const cols = view.removed.map((r) => r.column);
    parts.push(`without ${cols.length > 3 ? `${cols.slice(0, 3).join(', ')} and ${cols.length - 3} more` : cols.join(', ')} (${[...new Set(view.removed.map((r) => r.rule))].join(', ')})`);
  }
  return parts.join('; ') || 'everything';
}

/**
 * A card's shield, small and quiet: for the owner, on any step a rule limits for someone; viewing as someone, on the
 * steps their rules limit (the ones closed to them aren't shown at all). Tapping it opens who can see the step.
 */
function shieldOf(id: string): 'muted' | 'on' | null {
  const p = policies();
  const cols = state.columns.get(id);
  if (!p || !cols) return null;
  if (isOwner()) return p.principals.some((x) => !x.owner && accessOf(readView(p, x.id, cols)) !== 'all') ? 'muted' : null;
  return accessOf(readView(p, state.viewer, cols)) === 'all' ? null : 'on';
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
  /** A check: the rows its warning rules flag (and keep), each row once. */
  flagged?: number;
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

/** What a person (the viewer, unless another is named) may read of a node of this run. */
const viewIn = (insp: Inspection, i: number, who = state.viewer): ReadView => readView(policies(), who, insp.ctx.columns(i));

/** A node's rows as a person reads them, as a statement (its own, or `sql` over its columns); null when closed to them. */
const readIn = (insp: Inspection, i: number, who = state.viewer, sql = emitRead(insp.plan, i, insp.ctx)): string | null => wrapRead(viewIn(insp, i, who), sql);

/** How many rows of a node a person reads, or null when it is closed to them. */
async function rowsAs(insp: Inspection, i: number, who = state.viewer): Promise<number | null> {
  const view = viewIn(insp, i, who);
  const m = insp.manifest.get(i);
  if (!view.open || !m) return null;
  const n = insp.plan.nodes[i]!;
  if (!view.where) {
    // No row rule applies to the viewer: the run's own numbers, where it has them.
    if (m.rows !== undefined) return m.rows;
    if (n.op === 'expect' && m.expectations) return m.expectations.rows - m.expectations.dropped;
    if (n.op === 'formula' || n.op === 'select') return rowsAs(insp, n.inputs[0]!, who);
  }
  return countOnce(`${m.key}|rows|${view.where ?? ''}`, readIn(insp, i, who)!);
}

/** The rows of node `a` that node `b` doesn't have, as a person reads both (they have the same columns). */
function exceptIn(insp: Inspection, a: number, b: number, who = state.viewer): string | null {
  const ra = readIn(insp, a, who);
  const rb = readIn(insp, b, who);
  return ra && rb ? emitExcept(ra, rb, viewIn(insp, a, who).columns) : null;
}

async function changeOf(insp: Inspection, i: number, who = state.viewer): Promise<Change> {
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
    rowsIn: input === undefined ? undefined : await rowsAs(insp, input, who),
    rowsOut: await rowsAs(insp, i, who),
    columnsIn: inn.length,
    columnsOut: out.length,
    added: reshapes ? [] : out.filter((c) => !had.has(lc(c))),
    removed: reshapes ? [] : inn.filter((c) => !has.has(lc(c))),
    replaced,
    same: input !== undefined && sameColumns(inn, out),
  };
  if (n.op === 'join') {
    const view = viewIn(insp, n.inputs[0]!, who);
    change.inner = n.how !== 'left';
    change.unmatched = view.open ? await countOnce(`${insp.manifest.get(i)!.key}|unmatched|${view.where ?? ''}`, wrapRead(view, emitUnmatched(insp.plan, i, insp.ctx)!)!) : null;
  }
  if (n.op === 'expect') {
    // The rows its warnings flag, as the viewer reads them; not when a warning reads a column their rules remove.
    const view = viewIn(insp, n.inputs[0]!, who);
    const hidden = new Set(view.removed.map((r) => r.column.toLowerCase()));
    const warns = n.rules.map((r, k) => (r[2] === 'warn' ? k : -1)).filter((k) => k >= 0);
    const m = insp.manifest.get(i)!;
    if (view.open && warns.length && !warns.some((k) => [...identifiers(n.rules[k]![1])].some((x) => hidden.has(x)))) {
      change.flagged = warns.length === 1 && !view.where && m.expectations ? m.expectations.rules[warns[0]!]!.failed : await countOnce(`${m.key}|flagged|${view.where ?? ''}`, wrapRead(view, emitFailures(insp.plan, i, warns, insp.ctx))!);
    }
  }
  return change;
}

let changesRun = 0;
/** The run the steps' changes were worked out for: the run on screen, whose day may change without a run passing. */
let changesFor = '';

/** Work out every step's change for the latest run, as the viewer reads it; each card updates as its own arrives. */
async function computeChanges(): Promise<void> {
  const run = latest();
  if (!run || !state.engine) return;
  changesFor = run.result.hash;
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
    // The inputs' own news and the profiled tables', for their cards: what the history doesn't follow, from the rows.
    for (const id of new Set([...state.doc.sources.map((x) => x.id), ...profiles().map((p) => p.of)])) {
      if (historyOf(id) || !visible(id)) continue;
      await tableNewsFor(id, state.viewer);
      if (token !== changesRun) return;
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
      // A check that only warns keeps every row, and says how many it flags.
      if (c.op === 'expect' && c.flagged) return { text: `${plural(c.flagged, 'row')} flagged`, tone: 'drop', badge: `⚑ ${fmtCompact(c.flagged)}` };
      if (c.op === 'expect' && c.flagged === 0) return { text: 'every row passes', tone: 'same' };
      return { text: 'no rows removed', tone: 'same' };
  }
}

function cardLine(id: string): CardLine {
  const plain = (text: string): CardLine => ({ text, tone: 'same' });
  const fday = newsDay();
  const fstory = fday && state.failed?.origin === id && steps().get(id)?.kind === 'expectations' && !state.failed.file ? storyFor(fday) : null;
  if (fstory?.gate?.held) return { text: `held · ${fmtInt(fstory.gate.dropped)} of ${fmtInt(fstory.gate.rows)}`, tone: 'drop' };
  if (state.failed?.origin === id) return plain(steps().get(id)?.kind === 'expectations' && !state.failed.file ? 'held: tap for why' : 'failed: tap for why');
  // The trips and their checks say the day's story in a few words (ADR 0008).
  const sday = newsDay();
  const story = sday && (id === loadSource() || id === history?.file.step) ? storyFor(sday) : null;
  if (story && id === loadSource() && (story.severity === 'alert' || story.severity === 'warn')) return { text: shortHead(story), tone: 'drop' };
  if (story?.gate?.held && id === history?.file.step) return { text: `held · ${fmtInt(story.gate.dropped)} of ${fmtInt(story.gate.rows)}`, tone: 'drop' };
  // An output the held run didn't build, or one built from a day with something wrong upstream (ADR 0008).
  const out = outputState(id);
  if (out === 'stale') return plain('not published');
  if (out === 'alert') return plain(`built ${lacked(storyFor(newsDay()!)!)?.short ?? 'from an alert'}`);
  if (notBuilt(id)) return plain('not built today');
  const view = access(id);
  if (view && !view.open) return plain(`closed to ${personName(state.viewer)}`);
  const n = nodeOf(id);
  if (!n) return plain(state.running ? 'running…' : (steps().get(id)?.description ?? state.doc.sources.find((src) => src.id === id)?.description ?? ''));
  // The day's trips on a day the checks held or a file was refused: today's count, not the last run's.
  const today = loads.list[loads.at];
  if (state.failed && id === loadSource() && today) return plain(`${fmtInt(today.rows)} rows today`);
  const c = state.changes.get(id);
  const said = c ? summarize(c) : null;
  if (said) return said;
  if (n.status === 'folded') return plain('folded, no copy kept');
  // The run's row count is everyone's; a viewer whose rules filter this node sees their own once it is counted.
  return plain(view?.where ? n.status : `${n.status} · ${plural(n.rows ?? 0, 'row')}`);
}

/** A story's head in four words or fewer, for a card. */
function shortHead(story: Story): string {
  const sp = story.split;
  if (story.hero === 'split' && sp) {
    const r = sp.part.today / Math.max(1, sp.part.usual);
    return sp.kind === 'held' ? `Only ${sp.name} arrived` : sp.kind === 'vanished' ? `${sp.name} almost gone` : `${sp.name} ${r.toFixed(1).replace(/\.0$/, '')}× usual`;
  }
  if (story.hero === 'hours' && story.hours) return `Falls at ${clockText(story.hours.from * 60)}`;
  if (story.hero === 'gate' && story.gate) return `held · ${fmtInt(story.gate.dropped)} of ${fmtInt(story.gate.rows)}`;
  return story.head.split(/\s+/).length <= 4 ? story.head : story.head.split(/\s+/).slice(0, 4).join(' ');
}

/**
 * A step after the one that held, or after a refused file: nothing of it was built from the day's load, so its card
 * says so instead of another day's counts (ADR 0008 §10).
 */
const notBuilt = (id: string): boolean => !!state.failed?.origin && state.failed.origin !== id && downstreamOf(state.failed.origin).includes(id);

/** An output on the day: not published (its run was held or refused upstream), built from a day with something wrong
 * upstream, or neither. */
function outputState(id: string): 'stale' | 'alert' | null {
  if (!isOutput(id) || !latest()) return null;
  const src = loadSource();
  if (!src || !downstreamOf(src).includes(id)) return null;
  if (state.failed) return 'stale';
  const day = newsDay();
  return day && storyFor(day)?.severity === 'alert' ? 'alert' : null;
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
  const { left, top, width, height } = gridLayout(canvasDoc(viewDoc()), state.collapsed);
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

const HINT = {
  look: 'Drag to move around · pinch to zoom · hold a card to move it',
  arrange: 'Drag steps and sections · drop a step on a section to move it in · tap a section’s name to edit it',
};

function setHint(text?: string): void {
  const el = document.querySelector('#canvas .canvas-hint');
  if (el) el.textContent = text ?? (state.arranging ? HINT.arrange : isOwner() ? HINT.look : `As ${personName(state.viewer)} sees it: what is closed to them is left out · drag to move around · pinch to zoom`);
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
      : [b('−', () => zoom(1 / 1.25), { 'aria-label': 'Zoom out' }), b('+', () => zoom(1.25), { 'aria-label': 'Zoom in' }), b('Fit', fitView), ...(isOwner() ? [b('Tidy', tidy), b('Arrange', () => setArranging(true), { class: 'accent' })] : [])]),
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
  startView(gridLayout(canvasDoc(viewDoc()), state.collapsed));
}

/** The beginning of the flow, at a size where its cards are easy to read: on a phone, two columns and a bit. */
function startView(layout: GridLayout): void {
  const host = $('canvas');
  view.k = Math.max(0.55, Math.min(1, (host.clientHeight - 40) / layout.height, (host.clientWidth - 16) / (2.2 * (GRID.cardW + GRID.gapX))));
  view.x = 16 - layout.left * view.k;
  view.y = Math.max(16, (host.clientHeight - layout.height * view.k) / 2) - layout.top * view.k;
  view.ready = true;
  applyView();
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
  let press: { card?: string; head?: string; shield?: boolean } = {};
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
      press = { card: el.closest('[data-card]')?.getAttribute('data-card') ?? undefined, head: el.closest('[data-head]')?.getAttribute('data-head') ?? undefined, shield: !!el.closest('[data-shield]') };
      gesture = press.card || press.head ? 'press' : 'pan';
      // Outside Arrange a finger on a card pans, as on the background; holding it still picks the card up.
      if (gesture === 'press' && !state.arranging && isOwner()) hold = window.setTimeout(() => gesture === 'press' && beginMove(press) && (gesture = 'drag'), HOLD_MS);
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

/**
 * A tap: a card opens its sheet (its shield, at who can see it; a folded section's card opens the section); a section's
 * name folds it, or in Arrange edits it.
 */
function tap(press: { card?: string; head?: string; shield?: boolean }): void {
  if (press.card) {
    if (state.doc.groups?.some((g) => g.id === press.card)) setFolded(press.card, false);
    else {
      state.sheetFocus = press.shield ? 'access' : null;
      select(press.card);
    }
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
      const layout = pinLayout(canvasDoc(state.doc), state.collapsed);
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
  // A profile box stays in the section of the step it looks at.
  if (profileOf(id)) return doc;
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
  const layout = pinLayout(canvasDoc(state.doc), state.collapsed);
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
  const layout = { ...pinLayout(canvasDoc(state.doc), state.collapsed), [groupKey(id)]: [x, y] as [number, number] };
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
  const layout = pinLayout(canvasDoc(state.doc), state.collapsed);
  delete layout[groupKey(id)];
  state.collapsed.delete(id);
  state.doc = { ...state.doc, groups: (state.doc.groups ?? []).filter((g) => g.id !== id), layout };
  saveArrangement();
  select(null);
}

/** Move a step into a section from its sheet: it lands in the section's first free slot; a new section is drawn around it. */
function placeInSection(id: string, target: string): void {
  const before = gridLayout(canvasDoc(state.doc), state.collapsed);
  const doc: FlowDocument = { ...state.doc, layout: pinLayout(canvasDoc(state.doc), state.collapsed) };
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
/**
 * The arrangement's version. 2: the automatic layout gives each card a column and each section a lane; places kept
 * under version 1's layout of blocks are dropped (the sections themselves are kept), so the new layout shows.
 */
const ARRANGEMENT = 2;

function saveArrangement(): void {
  try {
    localStorage.setItem(arrangementKey(), JSON.stringify({ v: ARRANGEMENT, groups: state.doc.groups ?? [], layout: state.doc.layout ?? {} }));
  } catch {
    // Storage can be off (a private window, a blocked frame); the arrangement then lasts as long as the page.
  }
}

function loadArrangement(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(arrangementKey()) ?? 'null') as { v?: number; groups?: unknown; layout?: unknown } | null;
    if (!saved || (saved.v !== 1 && saved.v !== ARRANGEMENT)) return;
    // A step the flow no longer has (a check box taken out, edits forgotten) just leaves its section.
    const known = new Set([...state.doc.sources, ...state.doc.steps].map((x) => x.id));
    const groups = Array.isArray(saved.groups) ? (saved.groups as GroupDef[]).map((g) => (g && Array.isArray(g.steps) ? { ...g, steps: g.steps.filter((x) => known.has(x)) } : g)) : saved.groups;
    const next = { ...state.doc, groups, layout: saved.v === ARRANGEMENT ? saved.layout : {} } as FlowDocument;
    if (validateDocument(next).length) return;
    state.doc = next;
  } catch {
    // Unreadable storage, or an arrangement from another version of the flow: keep the document's own.
  }
}

function resetArrangement(): void {
  const edited = canonicalJSON(state.doc.steps as unknown as Parameters<typeof canonicalJSON>[0]) !== canonicalJSON(exampleDoc.steps as unknown as Parameters<typeof canonicalJSON>[0]);
  state.doc = { ...state.doc, steps: structuredClone(exampleDoc.steps) as StepDef[], groups: structuredClone(exampleDoc.groups) as FlowDocument['groups'], layout: {} };
  state.collapsed = new Set();
  try {
    localStorage.removeItem(arrangementKey());
    localStorage.removeItem(flowKey());
  } catch {
    // Nothing kept to forget.
  }
  select(null);
  startView(gridLayout(canvasDoc(viewDoc()), state.collapsed));
  if (edited) void run();
}

// ------------------------------------------------------------------ drawing the canvas

function renderCanvas(): void {
  // Mid-drag, wait: the drop draws everything once it lands.
  if (moving) return;
  const host = $('canvas');
  const svg = host.querySelector('svg') ?? setUpCanvas(host);
  const world = svg.querySelector('#world')!;
  const { cardW, cardH, head } = GRID;
  const doc = canvasDoc(viewDoc());
  const layout = gridLayout(doc, state.collapsed);
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
    const n = f.members.filter((m) => !profileOf(m)).length;
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
  // The day's trail (ADR 0008): from the trips along every step built from them, tinted on a day with something wrong;
  // dashed past a gate that held.
  const trailDay = newsDay();
  const trailSrc = loadSource();
  const trail = trailDay && trailSrc && storyFor(trailDay)?.severity === 'alert' ? new Set([trailSrc, ...downstreamOf(trailSrc)]) : new Set<string>();
  const heldAt = state.failed && !state.failed.file ? state.failed.origin : undefined;
  const pastGate = heldAt ? new Set(downstreamOf(heldAt)) : new Set<string>();
  for (const st of doc.steps) {
    for (const input of st.inputs) {
      const from = shown(input);
      const to = shown(st.id);
      if (from === to || seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      const { d, cx, cy } = edgePath(drawn.at.get(from)!, drawn.at.get(to)!);
      // A profile box only looks: its edge is a light solid line (dashes mean absent, and nothing else).
      const tinted = !profileOf(st.id) && trail.has(input) && trail.has(st.id);
      const path = s('path', { class: `${profileOf(st.id) ? 'edge look' : 'edge'}${tinted ? ` trail${pastGate.has(st.id) ? ' unbuilt' : ''}` : ''}`, d });
      const dot = s('circle', { class: 'edge-dot', cx, cy, r: 2.5 });
      parts.push(path, dot);
      drawn.edges.push({ from, to, path, dot });
    }
  }
  const chars = Math.floor((cardW - 24) / 7.2);
  const card = (key: string, kind: string, name: string, line: CardLine, classes: string[], extra: { port?: 'in' | 'out'; end?: boolean; shield?: ReturnType<typeof shieldOf>; health?: Severity; seal?: 'ok' | 'bad' | 'amber' | null } = {}) => {
    const { x, y } = drawn.at.get(key)!;
    if (line.tone !== 'same') classes.push(`tone-${line.tone}`);
    // One colour rule (ADR 0008 §10): a card's line and its badge take the card's own severity, and nothing else does;
    // a routine count is in neutral ink, whatever it counts.
    if (extra.health === 'alert' || extra.health === 'warn') classes.push(`sev-${extra.health}`);
    const guard = extra.shield ? ` ${extra.shield === 'muted' ? 'Rules limit who sees it' : `${personName(state.viewer)} sees part of it`}.` : '';
    const told = (extra.health === 'alert' || extra.health === 'warn' ? ` News: ${SEV_LABEL[extra.health].toLowerCase()}.` : '') + (extra.seal === 'ok' ? ' Sealed: checked back to the bytes.' : extra.seal === 'bad' ? ' Integrity: broken.' : '');
    const g = s('g', { class: ['card', ...classes].join(' '), 'data-card': key, tabindex: 0, role: 'button', 'aria-label': `${name}: ${kind}. ${line.text}.${guard}${told}` });
    g.append(s('rect', { class: 'box', x, y, width: cardW, height: cardH, rx: 9 }));
    // Its seal: checked back to the bytes (a tick), or broken (a cross); beside the news dot.
    if (extra.seal) {
      const sx = x + cardW - (extra.health === 'alert' || extra.health === 'warn' ? 30 : 14);
      const sy = y + 15;
      const seal = s('g', { class: `seal ${extra.seal}` });
      seal.append(s('circle', { cx: sx, cy: sy, r: 6 }), s('path', { d: extra.seal === 'bad' ? `M ${sx - 2.4} ${sy - 2.4} L ${sx + 2.4} ${sy + 2.4} M ${sx + 2.4} ${sy - 2.4} L ${sx - 2.4} ${sy + 2.4}` : `M ${sx - 2.8} ${sy} L ${sx - 0.8} ${sy + 2.2} L ${sx + 3} ${sy - 2.4}` }));
      g.append(seal);
    }
    // Its news at a glance: a dot by the name, red for something wrong, amber for something unusual; a note, none.
    // The card's mark by shape (ADR 0008): a filled hexagon for something wrong, an outlined triangle for unusual. The
    // class stays health-dot so tests and tools find it.
    if (extra.health === 'alert' || extra.health === 'warn') {
      const cx = x + cardW - 14;
      const cy = y + 15;
      g.append(extra.health === 'alert'
        ? s('path', { class: 'health-dot alert', d: `M${cx} ${cy - 6.5}l5.6 3.25v6.5L${cx} ${cy + 6.5}l-5.6 -3.25v-6.5z` })
        : s('path', { class: 'health-dot warn', d: `M${cx} ${cy - 6}l6 10.5h-12z` }));
    }
    g.append(s('text', { class: 'kind', x: x + 12, y: y + 18 }, fit(kind, Math.floor(chars * 1.15))));
    g.append(s('text', { class: 'name', x: x + 12, y: y + 36 }, fit(name, chars)));
    g.append(s('text', { class: 'what', x: x + 12, y: y + 53 }, fit(line.text, Math.floor(chars * 1.12) - (extra.shield ? 1 : 0))));
    // Ports: data comes into an input from outside the flow, and leaves an output as a published dataset.
    const cy = y + cardH / 2;
    if (extra.port === 'in') {
      g.append(s('path', { class: 'stub in', d: `M ${x - 22} ${cy} H ${x - 6}` }));
      g.append(s('circle', { class: 'port in', cx: x, cy, r: 7 }));
      g.append(s('path', { class: 'port-arrow', d: `M ${x - 2.5} ${cy - 3.5} L ${x + 3} ${cy} L ${x - 2.5} ${cy + 3.5} Z` }));
    } else if (extra.port === 'out') {
      if (extra.end) g.append(s('path', { class: 'stub out', d: `M ${x + cardW + 6} ${cy} H ${x + cardW + 22}` }));
      g.append(s('circle', { class: 'port out', cx: x + cardW, cy, r: 7 }));
      g.append(s('path', { class: 'port-arrow', d: `M ${x + cardW - 2.5} ${cy - 3.5} L ${x + cardW + 3} ${cy} L ${x + cardW - 2.5} ${cy + 3.5} Z` }));
    }
    if (extra.shield) {
      const sx = x + cardW - 22;
      const sy = y + cardH - 23;
      const shield = s('g', { class: `shield ${extra.shield}`, 'data-shield': key });
      shield.append(s('rect', { class: 'shield-hit', x: sx - 9, y: sy - 8, width: 30, height: 30 }));
      shield.append(s('path', { d: `M ${sx + 6} ${sy} L ${sx + 12} ${sy + 2.5} V ${sy + 7} C ${sx + 12} ${sy + 10.5} ${sx + 9.5} ${sy + 13} ${sx + 6} ${sy + 14} C ${sx + 2.5} ${sy + 13} ${sx} ${sy + 10.5} ${sx} ${sy + 7} V ${sy + 2.5} Z` }));
      g.append(shield);
    }
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
    const box = profileOf(id);
    if (box) {
      card(id, 'PROFILE', id, profileLine(box), ['profile', ...(state.selected === id ? ['selected'] : [])], { shield: shieldOf(box.of), health: healthOf(id), seal: sealOf(id) });
      continue;
    }
    const n = nodeOf(id);
    const readable = access(id);
    const classes = [sourceIds().has(id) ? 'source' : steps().get(id)?.dataset ? 'dataset' : 'step'];
    if (state.failed?.origin === id) classes.push('failed', ...(steps().get(id)?.kind === 'expectations' && !state.failed.file ? ['held'] : []));
    const cday = newsDay();
    if (cday && id === loadSource() && storyFor(cday)?.severity === 'alert') classes.push('cause');
    const os = outputState(id);
    if (os) classes.push(os === 'stale' ? 'not-published' : 'from-alert');
    else if (notBuilt(id)) classes.push('not-published');
    else if (readable && !readable.open) classes.push('closed');
    else if (n) classes.push(n.status);
    if (state.selected === id) classes.push('selected');
    card(id, kindLabel(id), id, cardLine(id), classes, { port: sourceIds().has(id) ? 'in' : isOutput(id) ? 'out' : undefined, end: readersOf(id).length === 0, shield: shieldOf(id), health: healthOf(id), seal: sealOf(id) });
  }
  world.replaceChildren(...parts);
  const refocus = focused?.card ? drawn.cards.get(focused.card) : focused?.head ? drawn.heads.get(focused.head) : undefined;
  (refocus as SVGElement | undefined)?.focus({ preventScroll: true });
  if (!view.ready && host.clientWidth > 0) startView(layout);
  applyView();
}

function select(id: string | null): void {
  if (id !== state.selected) state.previewAs = null;
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

// ------------------------------------------------------------------ data quality: columns, odd rows, drift, checks

// A step's sheet says what its columns hold (exact counts from the engine, shapes from an even sample), which rows an
// isolation forest finds odd, how each column moved since the last run with other rows there, and the checks worth
// adding; one tap adds them as a box beside the step. All of it as the viewer reads it, through their policy.

interface Quality {
  /** Rows the person reads. */
  rows: number;
  columns: string[];
  sample: unknown[][];
  profiles: Profile[];
  /** The measures the isolation forest scored the sample on, and its oddest rows (by place in the sample). */
  measures: string[];
  odd: { at: number; score: number; why: Unusual[] }[];
  suggestions: (Suggestion & { failing: number })[];
  /** The checks in the flow that judge these rows (the person may read them all), and which each sampled row fails. */
  judges: (Judge & { origin: string; description?: string })[];
  /** For each sampled row, a 1 for each judge it fails. */
  verdicts: number[][];
  /** The measures the forest grew on, a row of numbers per sampled row (gaps filled), its trees, and each row's score. */
  matrix: number[][];
  forest: Forest | null;
  scores: number[];
}

/** The sample's size: enough for a column's shape, small enough to read in a moment on a phone. */
const SAMPLE = 2000;
const qualities = new Map<string, Promise<Quality | null>>();

/** A step's quality as a person reads it, kept under its key and their view: a key names exact content. */
function qualityOf(insp: Inspection, i: number, who = state.viewer): Promise<Quality | null> {
  const view = viewIn(insp, i, who);
  const m = insp.manifest.get(i);
  if (!view.open || !m) return Promise.resolve(null);
  const key = `${m.key}|${who}|${view.where ?? ''}|${view.columns.join(',')}`;
  let found = qualities.get(key);
  if (!found) {
    found = measureQuality(insp, i, who);
    found.catch(() => qualities.delete(key));
    qualities.set(key, found);
    // The last dozen looks are kept: each holds a sample of rows.
    for (const old of [...qualities.keys()].slice(0, Math.max(0, qualities.size - 12))) qualities.delete(old);
  } else {
    qualities.delete(key);
    qualities.set(key, found);
  }
  return found;
}

/**
 * The columns a step makes itself, lowercased, where its checks belong: all of an input's, an aggregate's or a SQL
 * step's; the ones a formula sets, a join adds or a select computes. A filter or a check makes none of its own.
 */
function ownColumns(insp: Inspection, i: number): Set<string> | undefined {
  const n = insp.plan.nodes[i]!;
  const lc = (c: string) => c.toLowerCase();
  switch (n.op) {
    case 'table':
    case 'aggregate':
    case 'sql':
      return new Set(insp.ctx.columns(i).map(lc));
    case 'formula':
      return new Set(n.set.map(([c]) => lc(c)));
    case 'join':
      return new Set(n.take.map(([c]) => lc(c)));
    case 'select': {
      const had = new Set(insp.ctx.columns(n.inputs[0]!).map(lc));
      return new Set(n.project.filter(([name, e]) => !had.has(lc(name)) || e.trim().replace(/^"(.*)"$/s, '$1').toLowerCase() !== lc(name)).map(([c]) => lc(c)));
    }
    default:
      return undefined;
  }
}

/** Columns an expectation already checks: one upstream of the step, the step itself, or a check box that reads it. */
function coveredColumns(insp: Inspection, i: number): Set<string> {
  const out = new Set<string>();
  const seen = new Set<number>();
  const visit = (j: number) => {
    if (seen.has(j)) return;
    seen.add(j);
    const n = insp.plan.nodes[j]!;
    if (n.op === 'expect') for (const [, check] of n.rules) for (const x of identifiers(check)) out.add(x);
    for (const k of n.inputs) visit(k);
  };
  visit(i);
  insp.plan.nodes.forEach((n, j) => n.op === 'expect' && n.inputs[0] === i && visit(j));
  return out;
}

let qualityTables = 0;

async function measureQuality(insp: Inspection, i: number, who: string): Promise<Quality | null> {
  const engine = state.engine!;
  const rowsOf = readIn(insp, i, who);
  if (!rowsOf) return null;
  const columns = viewIn(insp, i, who).columns;
  const types = new Map(insp.plan.nodes[i]!.schema!.map(([c, t]) => [c.toLowerCase(), t]));
  const typeOf = (c: string) => types.get(c.toLowerCase()) ?? 'any';
  // A stored step's table is quick to read again and again. A folded step's rows, as the person reads them, are copied
  // once into a table of their own, so they are computed once for all the questions asked of them, not once a question.
  if (insp.ctx.table(i) !== undefined) return lookInto(insp, i, rowsOf, columns, typeOf, who);
  const tmp = `_smaltfl_look_${++qualityTables}`;
  await engine.exec(createTable(tmp, columns.map((c) => [c, typeOf(c)] as Column), { temp: true }));
  try {
    await engine.exec(emitCopy(tmp, columns, rowsOf));
    return await lookInto(insp, i, `SELECT * FROM ${quoteIdent(tmp)}`, columns, typeOf, who);
  } finally {
    await engine.exec(emitDrop(tmp)).catch(() => undefined);
  }
}

async function lookInto(insp: Inspection, i: number, read: string, columns: string[], typeOf: (c: string) => string, who: string): Promise<Quality> {
  const engine = state.engine!;
  const f = (await engine.query(emitColumnFacts(read, columns.map((name) => ({ name, numeric: ['int', 'real', 'num'].includes(typeOf(name)) }))))).rows[0]!;
  const rows = Number(f[0]);
  // The checks in the flow that judge these rows, before the step or after it, as far as the person may read them: on
  // a step open to them, on columns they see. Each sampled row says which of them it fails.
  const shown = new Set(columns.map((c) => c.toLowerCase()));
  const judges: Quality['judges'] = checksOver(insp.plan, i, (j) => insp.ctx.columns(j))
    .map((jd) => ({ ...jd, origin: insp.plan.nodes[jd.node]!.origin }))
    .filter((jd) => jd.reads.every((x) => shown.has(x)) && access(jd.origin, who)?.open !== false)
    .map((jd) => ({ ...jd, description: ruleReasons(jd.origin).get(jd.name) }));
  let sample: unknown[][] = [];
  let verdicts: number[][] = [];
  if (rows) {
    const every = Math.ceil(rows / SAMPLE);
    try {
      const got = (await engine.query(emitSample(read, columns, every, judges.map((jd) => jd.check)))).rows;
      sample = got.map((r) => r.slice(0, columns.length));
      verdicts = got.map((r) => r.slice(columns.length).map(Number));
    } catch {
      // A check that reads something only its own step has: the sample without verdicts.
      judges.splice(0);
      sample = (await engine.query(emitSample(read, columns, every))).rows;
      verdicts = sample.map(() => []);
    }
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const profiles = columns.map((name, k) => profileColumn(name, typeOf(name), { rows, present: Number(f[1 + 5 * k]), distinct: Number(f[2 + 5 * k]), min: f[3 + 5 * k], max: f[4 + 5 * k], mean: num(f[5 + 5 * k]) }, sample.map((r) => r[k])));
  const covered = new Set([...coveredColumns(insp, i), ...judges.flatMap((jd) => jd.reads)]);
  const only = ownColumns(insp, i);
  // The codes the ontology documents, to check a coded column against.
  const meanings = meaningsOf(insp.plan.nodes[i]!.origin);
  const documented = new Map<string, string[]>();
  for (const p of profiles) {
    const codes = meanings(p.name)?.values;
    if (codes) documented.set(p.name, Object.keys(codes));
  }
  // A small category's values, exactly, for the ones a check could be suggested on; a documented column's whatever
  // its kind (a weather code is a number).
  const values = new Map<string, string[]>();
  for (const p of profiles) {
    const mine = !covered.has(p.name.toLowerCase()) && (!only || only.has(p.name.toLowerCase()));
    const most = documented.has(p.name) ? 40 : 12;
    if (mine && (p.kind === 'category' || p.kind === 'code' || (documented.has(p.name) && p.kind === 'measure')) && p.facts.distinct <= most) {
      values.set(p.name, (await engine.query(emitDistinct(read, p.name, most + 1))).rows.map((r) => r[0]).filter((v) => v !== null && v !== undefined).map(String));
    }
  }
  const id = insp.plan.nodes[i]!.origin;
  const raw = suggestChecks(profiles, { covered, only, values, documented, span: spanOf(id), meaning: (c, v) => meanings(c)?.values?.[v] });
  const counted = raw.length ? (await engine.query(emitCheckCounts(read, raw.map((x) => x.check)))).rows[0]!.map(Number) : [];
  // Counted over every row: a bound that would flag more than 1% of them (the sample guessed its tail short) cuts
  // ordinary rows, and is not suggested.
  const kept = raw.map((x, k) => ({ ...x, failing: counted[k] ?? 0 })).filter((x) => x.kind !== 'range' || x.failing <= rows * 0.01);
  const measures = profiles.filter((p) => p.kind === 'measure').map((p) => p.name);
  let odd: Quality['odd'] = [];
  let matrix: number[][] = [];
  let forest: Forest | null = null;
  let scores: number[] = [];
  if (measures.length && sample.length >= 20) {
    const at = measures.map((c) => columns.indexOf(c));
    matrix = fillGaps(at.map((k) => sample.map((r) => (typeof r[k] === 'number' ? (r[k] as number) : null))));
    const grown = growForest(matrix);
    forest = grown;
    scores = grown ? matrix.map((x) => scoreOf(grown, x)) : matrix.map(() => 0.5);
    const records = sample.map((r) => Object.fromEntries(columns.map((c, k) => [c, r[k]])));
    const mads = madsOf(profiles, records);
    odd = scores
      .map((score, n) => ({ at: n, score }))
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => ({ ...x, why: unusual(profiles, records[x.at]!, mads) }));
  }
  return { rows, columns, sample, profiles, measures, odd, suggestions: kept, judges, verdicts, matrix, forest, scores };
}

/** A measure's value for people: about three significant digits. */
const fmtNum = (v: number) => (Math.abs(v) >= 1000 ? fmtInt(v) : Math.abs(v) >= 100 ? String(Math.round(v)) : Math.abs(v) >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100));
const fmtTime = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const fmtOf = (p: Profile) => (p.kind === 'time' ? fmtTime : fmtNum);

/** A histogram of the sample from its 1st to its 99th percentile, with the median marked. */
function histogram(p: Profile): HTMLElement | null {
  const hist = p.hist;
  const q = p.quantiles;
  if (!hist || !q) return null;
  const fmt = fmtOf(p);
  const W = 240;
  const H = 44;
  const max = Math.max(1, ...hist.counts);
  const bw = W / hist.counts.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + 14}`, class: 'hist', role: 'img', 'aria-label': `Most values from ${fmt(hist.lo)} to ${fmt(hist.hi)}, the median ${fmt(q.p50)}` });
  hist.counts.forEach((c, k) => svg.append(s('rect', { class: 'b', x: k * bw + 0.5, y: H - (c / max) * H, width: Math.max(1, bw - 1), height: Math.max(c ? 1 : 0, (c / max) * H) })));
  const mx = ((q.p50 - hist.lo) / (hist.hi - hist.lo || 1)) * W;
  svg.append(s('line', { class: 'med', x1: mx, x2: mx, y1: 0, y2: H }));
  svg.append(s('text', { class: 'ax', x: 0, y: H + 12 }, fmt(hist.lo)), s('text', { class: 'ax', x: W, y: H + 12, 'text-anchor': 'end' }, fmt(hist.hi)));
  return h('div', { class: 'histwrap' }, svg);
}

/** A column as a card: how full it is, its shape or its common values, how it moved, and what a check would flag. */
function columnCard(p: Profile, type: string, moved: Drift | undefined, since: string | undefined, flags: string[], meaning?: PropertyType, normal?: ColumnNormal): HTMLElement {
  const f = p.facts;
  const gaps = f.rows - f.present;
  const plain = fmtOf(p);
  // A measure in its unit; a time as it is.
  const fmt = (v: number) => (p.kind === 'time' ? plain(v) : inUnit(plain(v), v, meaning));
  const card = h('article', { class: 'record colcard' },
    h('div', { class: 'colhead' }, h('h3', {}, ...(meaning ? [meaning.title] : breakable(p.name))), h('span', { class: 'tag' }, `${p.kind} · ${type}`)),
    meaning ? h('p', { class: 'colname' }, h('code', {}, ...breakable(p.name)), meaning.unit ? ` · in ${meaning.unit}` : '') : null,
    meaning ? h('p', { class: 'means-text' }, meaning.description) : null,
    h('p', { class: 'colline' }, `${pct(f.present / Math.max(1, f.rows))} filled · ${fmtInt(f.distinct)} distinct${gaps ? ` · ${fmtInt(gaps)} empty` : ''}`));
  const shape = histogram(p);
  if (shape && p.quantiles) {
    const q = p.quantiles;
    const edge = (v: unknown) => (typeof v === 'number' ? fmt(v) : String(v ?? '—').slice(0, 16));
    const stat = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v)];
    card.append(shape, h('dl', { class: 'stats' },
      ...stat('smallest', edge(f.min)),
      ...stat('median', fmt(q.p50)),
      ...stat('largest', edge(f.max)),
      ...(p.kind === 'measure' && f.mean !== null ? stat('mean', fmt(f.mean)) : []),
      ...stat('middle half', `${fmt(q.p25)} – ${fmt(q.p75)}`)));
  } else if (p.top?.length) {
    card.append(h('div', { class: 'tops' },
      ...p.top.map((t) => {
        const means = meaningFor(meaning, t.value);
        return h('div', { class: 'top' }, h('span', { class: 'v' }, t.value, means ? h('span', { class: 'means' }, means) : null), h('span', { class: 'bar' }, h('span', { style: `width:${Math.max(1, t.share * 100).toFixed(1)}%` })), h('span', { class: 'n' }, pct(t.share)));
      })));
    if (f.distinct > p.top.length) card.append(h('p', { class: 'foot', style: 'margin:0' }, `and ${fmtInt(f.distinct - p.top.length)} more values`));
  }
  if (moved && since !== undefined) card.append(h('p', { class: 'drift' }, h('span', { class: `level-chip ${moved.level}` }, moved.level), ` since ${since}${moved.note ? `: ${moved.note}` : ''} · PSI ${moved.psi.toFixed(2)}`));
  if (normal) {
    const chip = (place: Place, words: Record<'above' | 'below', string>) => (place === 'within' ? null : h('span', { class: 'range-chip' }, words[place]));
    const parts: Child[] = [];
    // Its values present: the history keeps the share missing, the card says the share filled.
    const m = normal.missing;
    // A column never missing a value, and not missing one now: nothing to say.
    if (m && !(m.range.high === 0 && m.place === 'within')) parts.push(h('span', {}, `${pct(1 - m.range.high)} to ${pct(1 - m.range.low)} filled`, chip(m.place, { above: 'fewer filled', below: 'more filled' })));
    const md = normal.median;
    // A measure never below zero has a range that isn't either.
    const floor = typeof f.min === 'number' && f.min >= 0 ? 0 : -Infinity;
    const at = (v: number) => (p.kind === 'time' ? clockText(v) : fmt(Math.max(floor, v)));
    if (md) parts.push(h('span', {}, `median ${at(md.range.low)} to ${at(md.range.high)}${p.kind === 'time' ? ' in the day' : ''}`, chip(md.place, { above: 'higher', below: 'lower' })));
    if (parts.length) card.append(h('p', { class: 'normal-line' }, h('span', { class: 'nl-label' }, 'Normal for the day'), ...parts));
  }
  if (meaning?.note) card.append(h('p', { class: 'note' }, meaning.note));
  for (const flag of flags) card.append(h('p', { class: 'colflag' }, flag));
  return card;
}

/** A column of the day's trips against its normal ranges: its share missing, and its median (a time's in the day). */
interface ColumnNormal {
  missing: Judged | null;
  median: Judged | null;
}

function columnNormal(p: Profile, q: Quality, day: string): ColumnNormal | undefined {
  const missing = judgeDay({ of: 'missing', column: p.name }, day, 1 - p.facts.present / Math.max(1, p.facts.rows));
  let mid: number | undefined;
  if (p.kind === 'measure') mid = p.quantiles?.p50;
  else if (p.kind === 'time') {
    // As the history takes a time's median: the sample's minutes of the day.
    const k = q.columns.indexOf(p.name);
    const xs = q.sample.map((r) => minuteOfDay(r[k])).filter((x): x is number => x !== null).sort((a, b) => a - b);
    mid = xs.length ? quantile(xs, 0.5) : undefined;
  }
  // A median that takes only a few amounts from day to day (a surcharge's, a toll's) has no range worth giving.
  const median = mid === undefined || (history?.medians(p.name) ?? 0) < 20 ? null : judgeDay({ of: 'median', column: p.name }, day, mid);
  return missing || median ? { missing, median } : undefined;
}

/** Where a check runs, seen from the step being looked at. */
const whereText = (at: Judge['at']) => (at === 'before' ? 'before this step' : at === 'after' ? 'after this step' : 'in this step');

/** A part of the sheet that folds: its summary always shows; what it holds, once opened. Open ones stay open. */
const foldsOpen = new Map<string, boolean>();
function fold(name: string, summary: Child[], ...body: Child[]): HTMLElement {
  const d = h('details', { class: 'fold' }, h('summary', {}, ...summary), h('div', { class: 'fold-body' }, ...body));
  d.open = foldsOpen.get(name) ?? false;
  d.addEventListener('toggle', () => foldsOpen.set(name, d.open));
  return d;
}

type Tone = 'done' | 'flag' | 'allowed' | 'open';
const TONES: Record<Tone, string> = { done: 'taken care of', flag: 'flagged', allowed: 'checked', open: 'not checked yet' };

/**
 * How an odd row stands with the flow's checks: one that drops it or warns on it has already taken care of it; one
 * that reads what makes it odd and lets it pass has looked at it; otherwise nothing checks it yet.
 */
function standing(q: Quality, at: number, odd: ReadonlySet<string>, meanings: Meanings): { tone: Tone; lines: { tone: Tone; body: Child[] }[] } {
  const verdict = q.verdicts[at] ?? [];
  const named = (c: string) => meanings(c)?.title ?? q.columns.find((x) => x.toLowerCase() === c) ?? c;
  const rule = (jd: Quality['judges'][number]) => [h('b', {}, jd.origin), ` ${jd.onFail === 'drop' ? 'drops it' : jd.onFail === 'warn' ? 'warns on it' : 'stops the run on it'}: `, h('i', {}, jd.name), jd.description ? `, ${jd.description}` : '', h('code', {}, jd.check)];
  const lines: { tone: Tone; body: Child[] }[] = [];
  for (const [k, jd] of q.judges.entries()) {
    if (verdict[k] !== 1) continue;
    const tone: Tone = jd.onFail === 'warn' ? 'flag' : 'done';
    lines.push({ tone, body: [`${tone === 'done' ? 'Already taken care of' : 'Already flagged'} ${whereText(jd.at)}: `, ...rule(jd)] });
  }
  if (!lines.length) {
    for (const [k, jd] of q.judges.entries()) {
      if (verdict[k] === 1 || !jd.reads.some((c) => odd.has(c))) continue;
      lines.push({ tone: 'allowed', body: [`Checked ${whereText(jd.at)}, and it passes: `, h('b', {}, jd.origin), '’s ', h('i', {}, jd.name), h('code', {}, jd.check)] });
    }
  }
  if (!lines.length) lines.push({ tone: 'open', body: [`Nothing in the flow checks ${[...odd].map(named).join(', ')} yet. A suggested check below may.`] });
  const tone = lines.some((l) => l.tone === 'done') ? 'done' : lines.some((l) => l.tone === 'flag') ? 'flag' : lines[0]!.tone;
  return { tone, lines };
}

/** One odd row as a card: how odd, what sets it apart in its own units, what already deals with it, and the whole row on demand. */
function oddCard(q: Quality, o: Quality['odd'][number], meanings: Meanings): HTMLElement {
  const row = q.sample[o.at]!;
  const odd = new Set((o.why.length ? o.why.map((u) => u.column) : q.measures).map((c) => c.toLowerCase()));
  const { tone, lines } = standing(q, o.at, odd, meanings);
  const apart = o.why.length
    ? h('ul', { class: 'unusual' },
        ...o.why.slice(0, 4).map((u) => {
          const p = meanings(u.column);
          const v = (x: number) => inUnit(fmtNum(x), x, p);
          return h('li', {}, h('span', { class: 'u-what' }, p?.title ?? u.column), h('b', {}, v(u.value)), p ? h('code', {}, u.column) : null, h('span', { class: 'u-usual' }, `Most rows: ${v(u.usual[0])} to ${v(u.usual[1])}`));
        }))
    : h('p', { class: 'foot', style: 'margin:0' }, 'No one value is far out: the mix of its values is what’s unusual.');
  const marks = q.columns.map((c) => (odd.has(c.toLowerCase()) ? 'hit' : undefined));
  return h('article', { class: 'record oddcard' },
    h('div', { class: 'oddhead' }, h('span', { class: `chip ${tone}` }, TONES[tone]), h('span', { class: 'oddness' }, `oddness ${o.score.toFixed(2)}`)),
    apart,
    h('ul', { class: 'standing' }, ...lines.map((l) => h('li', { class: l.tone }, ...l.body))),
    h('details', { class: 'whole' }, h('summary', {}, 'The whole row'), record(q.columns, row, marks, meanings)));
}

function oddRows(q: Quality, meanings: Meanings): HTMLElement {
  const head = (text: string) => [h('span', { class: 'eyebrow' }, `Odd rows · ${q.odd.length}`), h('span', { class: 'fold-sum' }, text)];
  if (!q.measures.length) return h('div', { class: 'quality-part' }, fold('odd', head('none to look for'), h('p', { class: 'foot' }, 'Odd rows are found among measures, numbers that vary, and this step has none.')));
  const tones = q.odd.map((o) => standing(q, o.at, new Set((o.why.length ? o.why.map((u) => u.column) : q.measures).map((c) => c.toLowerCase())), meanings).tone);
  const tally = (Object.keys(TONES) as Tone[]).map((t) => [t, tones.filter((x) => x === t).length] as const).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${TONES[t]}`);
  const titled = q.measures.map((c) => meanings(c)?.title ?? c);
  return h('div', { class: 'quality-part' },
    fold('odd', head(q.odd.length ? tally.join(' · ') : 'none stands out'),
      h('p', { class: 'foot' }, `An isolation forest of 100 trees scored ${fmtInt(q.sample.length)} sampled rows on ${titled.length === 1 ? titled[0] : `${titled.slice(0, -1).join(', ')} and ${titled.at(-1)}`}: the fewer random splits it takes to set a row apart, the odder it is, up to 1. Each card says what sets the row apart, and whether a check in the flow already deals with it.`),
      q.odd.length ? carousel(q.odd.map((o) => oddCard(q, o, meanings)), 'odd row') : null));
}

/** The checks already judging a step's rows, before it or after it: the reason a column gets no suggestion. */
function alreadyChecked(q: Quality, meanings: Meanings): HTMLElement | null {
  if (!q.judges.length) return null;
  const named = (c: string) => meanings(c)?.title ?? q.columns.find((x) => x.toLowerCase() === c) ?? c;
  return fold('checked', [h('span', { class: 'eyebrow' }, `Already checked · ${q.judges.length}`), h('span', { class: 'fold-sum' }, [...new Set(q.judges.map((jd) => jd.origin))].join(', '))],
    h('p', { class: 'foot' }, 'Rules in the flow that judge these rows as they are here: their columns get no suggestion.'),
    h('ul', { class: 'checked-list' },
      ...q.judges.map((jd) => h('li', {},
        h('span', { class: 'ck-head' }, h('b', {}, jd.origin), ` ${whereText(jd.at)} · `, h('i', {}, jd.name), ` · ${jd.onFail === 'drop' ? 'drops' : jd.onFail === 'warn' ? 'warns' : 'stops the run'}`),
        h('span', { class: 'ck-cols' }, jd.reads.map(named).join(', ')),
        h('code', {}, jd.check)))));
}

/** What a suggested check flags, in plain words before its SQL: "Flags rows with Wind speed over 50 km/h." */
function plainCheck(x: Suggestion, m: PropertyType | undefined): string {
  const what = m?.title ?? x.column;
  const unit = m?.unit ? ` ${m.unit}` : '';
  switch (x.kind) {
    case 'range': return `Flags rows with ${what} over ${fmtNum(x.bound ?? 0)}${unit}.`;
    case 'negative': return `Flags rows with ${what} below 0.`;
    case 'present': return `Flags rows with no ${what}.`;
    case 'known': return `Flags a ${what} value it hasn’t had before.`;
    case 'documented': return x.guard ? 'Flags a code its source doesn’t list.' : 'Flags the codes its source doesn’t list.';
  }
}

function suggestedChecks(id: string, q: Quality, meanings: Meanings): HTMLElement {
  const box = h('div', { class: 'quality-part' }, h('p', { class: 'eyebrow' }, `Suggested checks · ${q.suggestions.length}`));
  if (!q.suggestions.length) {
    box.append(h('p', { class: 'foot' }, 'Nothing to suggest for the columns this step makes: they are checked already, or hold nothing a simple check would catch.'), alreadyChecked(q, meanings) ?? '');
    return box;
  }
  const after = readersOf(id).filter(visible);
  const span = spanOf(id);
  box.append(h('p', { class: 'foot' }, `Each counted over every row; picked ones become a filter box after ${id}.`));
  void after;
  const picks: { s: Suggestion; input: HTMLInputElement }[] = [];
  const catches = q.suggestions.some((x) => x.failing > 0);
  const list = h('div', { class: 'suggestions' });
  for (const x of q.suggestions) {
    const input = h('input', { type: 'checkbox', id: `suggest-${x.name}` });
    // None ticked to begin with: a check that would drop real trips (an airport surcharge, a long fare) is a choice.
    input.checked = false;
    void catches;
    picks.push({ s: x, input });
    // A plain sentence of what it flags first, how many rows it flags, why; its SQL folded under it.
    const m = meanings(x.column);
    list.append(h('div', { class: 'suggestion' }, input,
      h('div', { class: 'sg-body' },
        h('label', { for: input.id, class: 'sg-label' },
          h('span', { class: 'sg-col' }, m?.title ?? x.column, m ? h('code', {}, ` · ${x.column}`) : null),
          h('span', { class: 'sg-plain' }, plainCheck(x, m)),
          h('span', { class: `pill ${x.failing ? 'warn' : 'ok'}` }, x.failing ? `flags ${plural(x.failing, 'row')} ${span} (${pct(x.failing / Math.max(1, q.rows))})` : `passes ${span}`),
          h('span', { class: 'sg-why' }, x.why)),
        h('details', { class: 'sg-sql' }, h('summary', {}, 'SQL'), h('code', {}, x.check)))));
  }
  box.append(list);
  if (isOwner()) {
    const add = h('button', { class: 'run', type: 'button' }, '');
    const label = () => {
      const n = picks.filter((p) => p.input.checked).length;
      add.textContent = n ? `Drop the rows ${n === 1 ? 'it flags' : `these ${n} flag`}, in a filter box` : 'Pick a check to add';
      add.disabled = n === 0;
    };
    for (const p of picks) p.input.addEventListener('change', label);
    label();
    add.addEventListener('click', () => addFilterBox(id, picks.filter((p) => p.input.checked).map((p) => p.s)));
    box.append(h('div', { class: 'row' }, add));
  }
  const checked = alreadyChecked(q, meanings);
  if (checked) box.append(checked);
  return box;
}

// ------------------------------------------------------------------ the isolation forest at play

/** Numbers along a list, said: "a, b and c". */
const listed = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * The isolation forest at play, on a map of the sampled rows: each placed by its two principal components (the
 * directions the measures vary most; the axes stretch near the middle and squeeze far out, so the bulk and the far
 * rows both show), the odd ones marked and numbered as their cards are. Play has the forest pick them out one by
 * one: one of its trees (one that takes a typical number of cuts for that row, not its luckiest) cuts at random, and
 * the tree's rows on the other side of each cut fall away until the row stands alone. A row tapped on the map is cut
 * out the same way: an ordinary one takes many more cuts.
 */
function isoMap(q: Quality, meanings: Meanings, openOdd: (k: number) => void): HTMLElement | null {
  const forest = q.forest;
  const pca = forest ? principalComponents(q.matrix) : null;
  if (!forest || !pca) return null;
  const W = 340;
  const H = 240;
  const pad = 16;
  const xs = pca.points.map(([x]) => Math.asinh(x));
  const ys = pca.points.map(([, y]) => Math.asinh(y));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad);
  const Y = (v: number) => H - pad - ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'isomap', role: 'img', 'aria-label': `The ${fmtInt(q.sample.length)} sampled rows on their two principal components, the ${q.odd.length} odd ones numbered` }) as SVGSVGElement;
  svg.append(s('line', { class: 'axis', x1: X(0), x2: X(0), y1: 4, y2: H - 4 }), s('line', { class: 'axis', x1: 4, x2: W - 4, y1: Y(0), y2: Y(0) }));
  const oddAt = new Map(q.odd.map((o, k) => [o.at, k]));
  const dots = pca.points.map((_, n) => s('circle', { class: oddAt.has(n) ? 'dot odd' : 'dot', cx: X(xs[n]!).toFixed(1), cy: Y(ys[n]!).toFixed(1), r: oddAt.has(n) ? 4 : 2.2 }));
  // The odd ones on top, numbered.
  const layer = s('g', {});
  dots.forEach((d, n) => !oddAt.has(n) && layer.append(d));
  for (const at of oddAt.keys()) layer.append(dots[at]!);
  svg.append(layer);
  // Numbers that would sit on each other move down a line.
  const placed: [number, number][] = [];
  for (const [at, k] of oddAt) {
    const x = Math.min(W - 8, X(xs[at]!) + 6);
    let y = Y(ys[at]!) - 6;
    while (placed.some(([px, py]) => Math.abs(px - x) < 12 && Math.abs(py - y) < 10)) y += 10;
    placed.push([x, y]);
    svg.append(s('text', { class: 'oddnum', x: x.toFixed(1), y: y.toFixed(1) }, String(k + 1)));
  }
  const names = q.measures.map((c) => meanings(c)?.title ?? c);
  const words = (w: readonly number[]) => {
    const top = w.map((x, k) => [x, k] as const).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 3).filter(([x]) => Math.abs(x) >= 0.2);
    const more = top.filter(([x]) => x > 0).map(([, k]) => names[k]!);
    const less = top.filter(([x]) => x < 0).map(([, k]) => names[k]!);
    return [more.length ? `more ${listed(more)}` : '', less.length ? `less ${listed(less)}` : ''].filter(Boolean).join(', ') || 'a mix of the measures';
  };
  const axes = h('p', { class: 'foot iso-axes' }, `→ ${words(pca.components[0])} (${pct(pca.explained[0])} of the spread) · ↑ ${words(pca.components[1])} (${pct(pca.explained[1])})`);
  const status = h('p', { class: 'iso-status', 'aria-live': 'polite' }, `Each dot is one of ${fmtInt(q.sample.length)} sampled rows. Play to watch the forest pick out the odd ones, or tap a dot to watch it cut that row out.`);
  const picked = h('ol', { class: 'iso-picked' });
  // How many cuts a row takes, on average over the forest: the number its score comes from.
  const cutsOf = (at: number) => forest.trees.reduce((t, tree) => t + pathLength(tree.root, q.matrix[at]!), 0) / forest.trees.length;
  const typicalRow = q.scores.map((x, n) => [x, n] as const).sort((a, b) => a[0] - b[0])[Math.floor(q.scores.length / 2)]![1];
  const ordinary = cutsOf(typicalRow);
  let token = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms: number, t: number) => new Promise<boolean>((done) => window.setTimeout(() => done(t === token && svg.isConnected), reduce ? 0 : ms));
  const resetDots = () => dots.forEach((d, n) => d.setAttribute('class', oddAt.has(n) ? 'dot odd' : 'dot'));
  const cutText = (c: Cut) => {
    const name = q.measures[c.feature]!;
    const p = meanings(name);
    return `${p?.title ?? name} ${c.side === 'below' ? 'under' : 'at least'} ${inUnit(fmtNum(c.split), c.split, p)}`;
  };
  const isolate = async (at: number, t: number): Promise<boolean> => {
    // A tree that takes a typical number of cuts for this row: the median of the forest's.
    const lengths = forest.trees.map((_, k) => [k, isolationPath(forest, k, q.matrix, q.matrix[at]!).length] as const).sort((a, b) => a[1] - b[1]);
    const tree = lengths[Math.floor(lengths.length / 2)]![0];
    const members = new Set(forest.trees[tree]!.members);
    const cuts = isolationPath(forest, tree, q.matrix, q.matrix[at]!);
    dots.forEach((d, n) => d.setAttribute('class', n === at ? 'dot target' : members.has(n) ? 'dot member' : 'dot away'));
    status.textContent = `Tree ${tree + 1} of ${forest.trees.length} looks at ${members.size} rows picked at random${members.has(at) ? ', this one among them' : ''}, and cuts at random.`;
    if (!(await wait(900, t))) return false;
    for (const [k, c] of cuts.entries()) {
      const left = new Set(c.left);
      for (const n of members) if (n !== at && !left.has(n)) dots[n]!.setAttribute('class', 'dot away');
      const others = c.left.filter((n) => n !== at).length;
      status.textContent = `Cut ${k + 1}: ${cutText(c)}. ${others ? `${plural(others, 'row')} still with it.` : 'It stands alone.'}`;
      if (!(await wait(700, t))) return false;
    }
    const others = (cuts.at(-1)?.left ?? [...members]).filter((n) => n !== at).length;
    // Odd or ordinary by its score over the whole forest, not by this one tree.
    const verdict = (q.scores[at] ?? 0) >= 0.6 ? `odd: about ${cutsOf(at).toFixed(1)} cuts across the forest, where an ordinary row takes ${ordinary.toFixed(1)}` : `an ordinary row: about ${cutsOf(at).toFixed(1)} cuts across the forest`;
    status.textContent = others ? `After ${plural(cuts.length, 'cut')} it shares the tree's last leaf with ${plural(others, 'row')}; ${verdict}.` : `Alone after ${plural(cuts.length, 'cut')}; ${verdict}.`;
    return true;
  };
  const describe = (o: Quality['odd'][number]) => {
    const why = o.why.slice(0, 2).map((u) => `${meanings(u.column)?.title ?? u.column} ${inUnit(fmtNum(u.value), u.value, meanings(u.column))}`);
    return why.length ? why.join(', ') : 'an unusual mix of values';
  };
  const play = h('button', { type: 'button', class: 'run' }, q.odd.length ? 'Play: pick out the odd rows' : 'Play');
  const stop = () => {
    token++;
    resetDots();
    play.textContent = 'Play again';
  };
  play.addEventListener('click', async () => {
    if (play.dataset.on) return (delete play.dataset.on, stop());
    const t = ++token;
    play.dataset.on = '1';
    play.textContent = 'Stop';
    picked.replaceChildren();
    for (const [k, o] of q.odd.entries()) {
      if (!(await isolate(o.at, t))) return;
      picked.append(h('li', {}, h('button', { type: 'button', class: 'pick', onclick: () => openOdd(k) }, h('b', {}, String(k + 1)), ` ${describe(o)}`, h('span', { class: 'pick-n' }, `${cutsOf(o.at).toFixed(1)} cuts`))));
      if (!(await wait(500, t))) return;
    }
    delete play.dataset.on;
    resetDots();
    play.textContent = 'Play again';
    const avg = q.odd.length ? q.odd.reduce((a, o) => a + cutsOf(o.at), 0) / q.odd.length : 0;
    status.textContent = q.odd.length
      ? `Picked out ${plural(q.odd.length, 'row')}: alone after about ${avg.toFixed(1)} cuts on average, where an ordinary row takes ${ordinary.toFixed(1)}. Tap one to open its card.`
      : `None stands out: every row takes about as many cuts as an ordinary one (${ordinary.toFixed(1)}).`;
  });
  svg.addEventListener('click', (e) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const pt = svg.createSVGPoint();
    pt.x = (e as MouseEvent).clientX;
    pt.y = (e as MouseEvent).clientY;
    const at = pt.matrixTransform(m.inverse());
    let best = -1;
    let near = 16 ** 2;
    pca.points.forEach((_, n) => {
      const d = (X(xs[n]!) - at.x) ** 2 + (Y(ys[n]!) - at.y) ** 2;
      if (d < near) [near, best] = [d, n];
    });
    if (best < 0) return;
    delete play.dataset.on;
    play.textContent = 'Play';
    void isolate(best, ++token);
  });
  return h('div', { class: 'quality-part iso' },
    h('p', { class: 'eyebrow' }, 'Isolation forest'),
    h('p', { class: 'foot' }, `100 trees, each cutting ${forest.size} rows picked at random on random measures at random points. An odd row stands alone after few cuts; an ordinary one takes about ${ordinary.toFixed(1)}. Rows are drawn on their two principal components, from ${listed(names)}.`),
    h('div', { class: 'isowrap' }, svg),
    axes,
    status,
    h('div', { class: 'row' }, play),
    picked);
}

function addFilterBox(stepId: string, picked: readonly Suggestion[]): void {
  if (!picked.length || !isOwner()) return;
  const doc = state.doc;
  const taken = new Set([...doc.sources, ...doc.steps].map((x) => x.id.toLowerCase()));
  const base = `${stepId.slice(0, 54)}_filtered`;
  let id = base;
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}_${n}`;
  const read = readersOf(stepId).length > 0;
  const box: StepDef = {
    id,
    kind: 'expectations',
    inputs: [stepId],
    description: `${stepId} without the rows these checks drop`,
    rules: picked.map((x) => ({ name: x.name, check: x.check, onFail: 'drop', description: x.why })),
    ...(read ? {} : { dataset: { description: `${stepId}, filtered by its checks` } }),
  };
  const next = insertAfter(doc, stepId, box);
  // Arranged by hand: it sits beside the step rather than wherever the automatic layout would put it.
  if (Object.keys(doc.layout ?? {}).length) {
    const before = gridLayout(canvasDoc(doc), state.collapsed);
    const slot = besideSlot(before, before.cards.get(stepId)!, id);
    next.layout = { ...pinLayout(canvasDoc(doc), state.collapsed), [id]: [slot.x, slot.y] };
  }
  const issues = validateDocument(next);
  if (issues.length) {
    setStatus(`The filter couldn't be added: ${issues[0]!.path}: ${issues[0]!.message}.`, true);
    return;
  }
  state.doc = next;
  saveFlow();
  saveArrangement();
  select(null);
  void run().then(() => select(id));
}

/** Take a step out (a filter box, or a step nothing reads): what read it reads its input again, and the flow runs. */
function removeStep(id: string): void {
  if (!isOwner()) return;
  const next = takeOut(state.doc, id);
  if (!next) return;
  const issues = validateDocument(next);
  if (issues.length) {
    setStatus(`${id} can’t be taken out: ${issues[0]!.message}.`, true);
    return;
  }
  state.doc = next;
  saveFlow();
  saveArrangement();
  select(null);
  void run();
}

// ------------------------------------------------------------------ the flow's edits, kept in this browser

const flowKey = () => `smaltfl:flow:${state.doc.id}`;
/** A fingerprint of the example's own steps: edits kept against another version of them aren't used. */
const FLOW_BASE = (() => {
  let hash = 0x811c9dc5;
  for (const ch of canonicalJSON(exampleDoc.steps as unknown as Parameters<typeof canonicalJSON>[0])) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
})();

/** The flow's steps as edited here (settings applied, check boxes added or taken out), kept in this browser. */
function saveFlow(): void {
  try {
    localStorage.setItem(flowKey(), JSON.stringify({ v: 1, base: FLOW_BASE, steps: state.doc.steps }));
  } catch {
    // Storage can be off: the edits then last as long as the page.
  }
}

function loadFlow(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(flowKey()) ?? 'null') as { v?: number; base?: string; steps?: unknown } | null;
    if (!saved || saved.v !== 1 || saved.base !== FLOW_BASE || !Array.isArray(saved.steps)) return;
    const next = { ...state.doc, steps: saved.steps } as FlowDocument;
    if (validateDocument(next).length === 0) state.doc = next;
  } catch {
    // Unreadable storage: the example's own steps.
  }
}

// ------------------------------------------------------------------ the drill-down

// A card's sheet tells the story of its data in tabs, the same few on every card, the news first: what is out of the
// ordinary today, each finding with its evidence and what can be done about it. Then its rows, each column's
// distribution on top of it; its columns, one to a line, opening in place; what it dropped and why; the rows that look
// odd and why; its history; and about the step itself (what it does, its settings, who can see it, what the engine
// runs). Above the tabs: what it reads and what reads it, a tap away, and the day's load, to step through without
// closing it. A card keeps its tab and its place in each tab.

type Tab = 'news' | 'data' | 'columns' | 'dropped' | 'odd' | 'history' | 'integrity' | 'about';
const TAB_LABEL: Record<Tab, string> = { news: 'News', data: 'Data', columns: 'Columns', dropped: 'Dropped', odd: 'Odd rows', history: 'History', integrity: 'Integrity', about: 'About' };
const drill = {
  tab: new Map<string, Tab>(),
  scroll: new Map<string, number>(),
  /** The column a card's Columns tab has open. */
  column: new Map<string, string>(),
  /** Cards whose Data tab shows only the rows with a blank. */
  blanks: new Map<string, boolean>(),
  token: 0,
};

/** The data a card's sheet is about: a profile box's step, or the card's own. */
const dataOf = (card: string) => profileOf(card)?.of ?? card;
/** The weather input: the source the example reads the weather file into. */
const weatherSource = (): string | undefined => {
  const table = EXAMPLE_SOURCES.find((x) => x.file === 'weather.csv')?.table;
  return state.doc.sources.find((x) => x.table === table)?.id;
};
/** The steps whose numbers the history keeps, day by day: the trips, their checks, and the weather. */
const historyOf = (id: string): 'trips' | 'checks' | 'weather' | null =>
  !history ? null : id === loadSource() ? 'trips' : id === history.file.step && checksAsCounted() ? 'checks' : id === weatherSource() && history.file.weather ? 'weather' : null;

/** The tabs a card has: the news, its rows and columns, and what its kind calls for. */
function tabsOf(card: string): Tab[] {
  const id = dataOf(card);
  const st = steps().get(id);
  const c = state.changes.get(id);
  const out: Tab[] = ['news', 'data', 'columns'];
  const removes = c !== undefined && c.same && c.rowsIn != null && c.rowsOut != null && c.rowsIn > c.rowsOut;
  if (st && (st.kind === 'expectations' || st.kind === 'filter' || removes || (st.kind === 'join' && !!c?.unmatched))) out.push('dropped');
  // Odd rows where there are enough rows to stand out from: not in a small lookup or a summary.
  const rows = c?.rowsOut ?? nodeOf(id)?.rows ?? 0;
  if (rows >= 1000 && st?.kind !== 'aggregate') out.push('odd');
  if (historyOf(id)) out.push('history');
  out.push('integrity', 'about');
  return out;
}

const TABS: Record<Tab, (card: string, id: string, who: string) => Promise<HTMLElement>> = {
  news: newsTab,
  data: dataTab,
  columns: columnsTab,
  dropped: droppedTab,
  odd: oddTab,
  history: historyTab,
  integrity: integrityTab,
  about: aboutTab,
};

/** Open a card's tab, at a column or not. */
function openTab(card: string, tab: Tab, column?: string): void {
  drill.tab.set(card, tab);
  if (column) drill.column.set(card, column);
  if (state.selected !== card) select(card);
  else void renderSheet();
}

async function renderDrill(card: string): Promise<void> {
  const sheet = $('sheet');
  const id = dataOf(card);
  const tabs = tabsOf(card);
  // A shield tapped, or a person chosen to view as: who can see it, in About.
  if (state.sheetFocus === 'access') drill.tab.set(card, 'about');
  let tab = drill.tab.get(card) ?? 'news';
  if (!tabs.includes(tab)) tab = 'news';
  const who = state.previewAs ?? state.viewer;
  const token = ++drill.token;
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'drill-panel', 'aria-labelledby': `drill-tab-${tab}`, 'aria-busy': 'true' },
    h('div', { class: 'skeleton', 'aria-hidden': 'true' }), h('div', { class: 'skeleton short', 'aria-hidden': 'true' }), h('div', { class: 'skeleton', 'aria-hidden': 'true' }));
  sheet.classList.add('drill');
  sheet.setAttribute('aria-label', `${card}, ${TAB_LABEL[tab]}`);
  sheet.replaceChildren(drillHead(card, tabs, tab), panel);
  sheet.hidden = false;
  sheet.scrollTop = 0;
  await useLookups(who);
  if (token !== drill.token) return;
  try {
    // A held day with no day before it that passed in this visit has no rows to show: its news still says the day.
    const viewed = viewedDay();
    const none = !latest() && state.runs.length && viewed ? noRowsBefore(viewed) : 'Run the flow to see its data.';
    const content = state.engine && (latest() || (tab === 'news' && state.failed)) ? await TABS[tab](card, id, who) : h('p', { class: 'foot' }, none);
    if (token !== drill.token) return;
    // Rows of another day carry that day, full width, over the whole panel (ADR 0008 §10).
    const bar = showsRunRows(card, tab) ? rowsFromBar() : null;
    panel.replaceChildren(...(bar ? [bar] : []), content);
    panel.removeAttribute('aria-busy');
    // The news is known now for a table measured on opening it: its badge on the tab.
    sheet.querySelector('.drill-head')?.replaceWith(drillHead(card, tabs, tab));
    const at = drill.scroll.get(`${card}|${tab}`) ?? 0;
    if (state.sheetFocus === 'access' && tab === 'about') {
      state.sheetFocus = null;
      requestAnimationFrame(() => document.getElementById('access')?.scrollIntoView({ block: 'start' }));
    } else if (at) requestAnimationFrame(() => (sheet.scrollTop = at));
  } catch (e) {
    if (token === drill.token) panel.replaceChildren(h('p', { class: 'status bad' }, message(e)));
  }
}

/**
 * Whether a tab shows the rows of the run on screen, all of it, rather than the history's figures for the day: those
 * carry the date bar when the run is another day's. Only what the daily load reaches changes from day to day (the
 * weather and the zones are the same rows on every run). News and Dropped place their own bar, under the day's own
 * figures.
 */
function showsRunRows(card: string, tab: Tab): boolean {
  const id = dataOf(card);
  const src = loadSource();
  if (!src || (id !== src && !downstreamOf(src).includes(id))) return false;
  return tab !== 'news' && tab !== 'dropped' && tab !== 'history';
}

/** The sheet's head: the card, where it sits in the flow, the day, and the tabs. */
function drillHead(card: string, tabs: Tab[], tab: Tab): HTMLElement {
  const id = dataOf(card);
  const ups = (profileOf(card) ? [id] : (steps().get(id)?.inputs ?? [])).filter(visible);
  const downs = [...readersOf(id), ...profiles().filter((p) => p.of === id).map((p) => p.id)].filter((x) => x !== card && visible(profileOf(x)?.of ?? x));
  const chip = (x: string, up: boolean) => h('button', { type: 'button', class: `nav-chip ${up ? 'up' : 'down'}`, title: x, 'aria-label': `${up ? 'What it reads' : 'What reads it'}: ${x}`, onclick: () => select(x) }, up ? `‹ ${x}` : `${x} ›`);
  // Two or more on a side fold into one chip that opens their list ("‹ 2 inputs"), so the row fits a phone.
  const side = (xs: string[], up: boolean): Child => {
    if (xs.length < 2) return xs[0] ? chip(xs[0], up) : '';
    const noun = up ? `${xs.length} inputs` : `${xs.length} readers`;
    return h('details', { class: `nav-fold ${up ? 'up' : 'down'}` }, h('summary', { class: 'nav-chip', 'aria-label': `${up ? 'What it reads' : 'What reads it'}: ${xs.join(', ')}` }, up ? `‹ ${noun}` : `${noun} ›`),
      h('div', { class: 'nav-list' }, ...xs.map((x) => chip(x, up))));
  };
  const news = cardNews(card);
  const kind = historyOf(profileOf(card)?.of ?? id);
  const day = newsDay();
  const story = day && kind === 'trips' ? storyFor(day) : null;
  const worst = story ? story.severity : news[0]?.severity;
  const count = story ? (story.severity === 'alert' || story.severity === 'warn' ? 1 : 0) + story.stories.length + story.more.length : news.filter((f) => f.severity === 'alert' || f.severity === 'warn').length;
  return h('div', { class: 'drill-head' },
    h('div', { class: 'drill-title' },
      h('div', { style: 'flex:1;min-width:0' }, h('p', { class: 'eyebrow' }, profileOf(card) ? `PROFILE · OF ${id.toUpperCase()}` : kindLabel(id)), h('h2', {}, card)),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
    // The day on its own row, then what it reads and what reads it, each chip cut short to fit (ADR 0008).
    dayPicker() ?? '',
    ups.length || downs.length ? h('div', { class: 'drill-nav', role: 'group', 'aria-label': 'Next to it in the flow' }, side(ups, true), h('span', { class: 'nav-gap' }), side(downs, false)) : '',
    stoppedLine(card, tab),
    fitTabs(h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'What to look at' },
      ...tabs.map((t) => h('button', { type: 'button', role: 'tab', id: `drill-tab-${t}`, 'aria-selected': String(t === tab), 'aria-controls': 'drill-panel', onclick: () => openTab(card, t) },
        TAB_LABEL[t], t === 'news' && worst && (worst === 'alert' || worst === 'warn') && count ? h('span', { class: 'tab-mark', 'aria-label': worst === 'alert' ? 'something’s wrong' : 'unusual' }, glyphEl(worst, 14)) : null)))));
}

/** A strip of tabs wider than the screen: the chosen one scrolled into view, and each edge faded while tabs lie past
 * it, so a tab off screen reads as there. */
function fitTabs(strip: HTMLElement): HTMLElement {
  const edges = () => {
    strip.classList.toggle('fade-l', strip.scrollLeft > 2);
    strip.classList.toggle('fade-r', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2);
  };
  strip.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(() => {
    const on = strip.querySelector<HTMLElement>('[aria-selected="true"]');
    if (on && (on.offsetLeft < strip.scrollLeft || on.offsetLeft + on.offsetWidth > strip.scrollLeft + strip.clientWidth)) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    edges();
  });
  return strip;
}

/** A run that stopped on this load, said from any tab: what stopped it, and whose rows are on screen. */
function stoppedLine(card: string, tab: Tab): HTMLElement | null {
  if (!state.failed) return null;
  const now = loads.list[loads.at]?.day;
  // One line: what stopped it, and what the outputs keep (ADR 0008: a state, said short; the panels showing those rows
  // carry their own day).
  const said = stoppedWords({ refused: !!state.failed.file, origin: state.failed.origin, shown: shownDay(), viewed: now ?? '' });
  return h('p', { class: 'stopped-line', role: 'status' },
    state.failed.file ? '' : glyphEl('held', 13),
    h('b', {}, said.lead),
    now ? ` · ${said.tail}` : '',
    tab !== 'news' ? h('button', { type: 'button', class: 'linkish', onclick: () => openTab(card, 'news') }, ' Why ›') : null);
}

/** What stopped the run, said from the gate's own figures when a gate held ("Held at trips_valid: 10.45% of arrived rows
 * dropped · limit 10%", as its bars say it), else the run's message. */
function failedSaid(): string {
  const f = state.failed;
  if (!f) return '';
  const day = viewedDay() ?? newsDay();
  const g = day && f.origin && !f.file ? storyFor(day)?.gate : null;
  if (!g?.held || g.step !== f.origin) return f.message;
  const l = gateLabels(g);
  return `Held at ${g.step}: ${l.share}${l.limit ? ` · ${l.limit}` : ''}`;
}

/** The day's load, to step through from inside a sheet. */
function dayPicker(): HTMLElement | null {
  const l = loads.list[loads.at];
  const list = shownLoads();
  if (!l || list.length < 2) return null;
  const k = list.indexOf(loads.at);
  const busy = state.running || loads.playing || !state.engine;
  // No day before the first load or after the last: no arrow there (a greyed one reads as broken), its place kept.
  const first = k <= 0;
  const last = k < 0 || k >= list.length - 1;
  return h('div', { class: 'day-pick', role: 'group', 'aria-label': 'The day' },
    h('button', { type: 'button', class: `btn small${first ? ' gone' : ''}`, 'aria-label': 'The day before', 'aria-hidden': first ? 'true' : 'false', tabindex: first ? '-1' : '0', disabled: busy || first, onclick: () => void useLoad(list[k - 1]!) }, '‹'),
    h('span', { class: 'day-at', 'aria-live': 'polite' }, `${dayLabel(l.day)}${l.note ? ` · ${l.note}` : ''}`),
    h('button', { type: 'button', class: `btn small${last ? ' gone' : ''}`, 'aria-label': 'The day after', 'aria-hidden': last ? 'true' : 'false', tabindex: last ? '-1' : '0', disabled: busy || last, onclick: () => void useLoad(list[k + 1]!) }, '›'));
}

// ------------------------------------------------------------------ tabs: about

async function aboutTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const box = h('div', { class: 'about' });
  const st = steps().get(id);
  const source = state.doc.sources.find((src) => src.id === id);
  const description = profileOf(card)?.description ?? st?.description ?? source?.description;
  if (description) box.append(h('p', { class: 'lede' }, description));
  if (state.failed && (state.failed.origin === id || (!state.failed.origin && !nodeOf(id)))) box.append(h('p', { class: 'status bad' }, failedSaid()));
  const io = inOut(id);
  if (io) box.append(io);
  const n = nodeOf(id);
  const facts = h('dl', { class: 'facts' });
  const fact = (k: string, v: Child) => facts.append(h('dt', {}, k), h('dd', {}, v));
  if (n) {
    fact('This run', n.status === 'folded' ? 'folded into the statement that reads it' : n.status);
    fact('Key', h('span', { class: 'hash' }, short(n.key)));
    if (n.content) fact('Content', h('span', { class: 'hash' }, short(n.content)));
  } else fact('This run', 'not run yet');
  const reads = st?.inputs.filter(visible) ?? [];
  if (reads.length) fact('Reads', h('span', { class: 'mono' }, reads.join(', ')));
  const next = readersOf(id).filter(visible);
  if (next.length) fact('Read by', h('span', { class: 'mono' }, next.join(', ')));
  if (isOwner() && !profileOf(card)) {
    const section = h('select', { id: 'section-of', 'aria-label': 'Section' });
    section.append(...(state.doc.groups ?? []).map((g) => h('option', { value: g.id }, g.name)), h('option', { value: '' }, 'No section'), h('option', { value: '+' }, 'A new section, around it'));
    section.value = sectionOf(id) ?? '';
    section.addEventListener('change', () => placeInSection(id, section.value));
    fact('Section', section);
  }
  box.append(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'This run'), facts));
  if (st && !profileOf(card)) box.append(editor(st));
  const danger: HTMLElement[] = [];
  if (st && isOwner() && !profileOf(card) && takeOut(state.doc, id)) {
    const out = h('button', { class: 'btn danger', type: 'button' }, 'Take this step out');
    const readers = readersOf(id);
    let armed = 0;
    out.addEventListener('click', () => {
      if (armed) return (clearTimeout(armed), removeStep(id));
      out.textContent = readers.length ? `Take it out? ${readers.join(', ')} will read ${st.inputs[0]} again` : 'Take it out? Nothing reads it';
      armed = window.setTimeout(() => ((armed = 0), (out.textContent = 'Take this step out')), 3000);
    });
    danger.push(out);
  }
  if (profileOf(card) && isOwner()) danger.push(h('button', { class: 'btn danger', type: 'button', onclick: () => removeProfile(card) }, 'Take this box out'));
  // A profile box beside it, to keep its story on the canvas: one a table.
  if (isOwner() && !profileOf(card) && !profiles().some((p) => p.of === id)) box.append(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'On the canvas'),
    h('p', { class: 'foot' }, 'A profile box beside it tells its news at a glance, and opens on its story. It only looks: no data changes.'),
    h('button', { class: 'btn small', type: 'button', onclick: () => addProfile(id) }, 'Add a profile box')));
  const seenBy = accessPanel(id);
  if (seenBy) {
    box.append(seenBy.box);
    seenBy.count();
  }
  const explain = h('details', { class: 'fold' }, h('summary', {}, 'What the engine runs'), h('pre', { class: 'code' }, 'Loading…'));
  box.append(explain);
  if (danger.length) box.append(h('div', { class: 'part danger-zone' }, h('p', { class: 'eyebrow' }, 'Remove'), h('div', { class: 'row' }, ...danger)));
  void (async () => {
    const sql = await statementFor(id).catch(() => null);
    const view = access(id, who);
    const read = sql && view ? wrapRead(view, sql) : sql;
    explain.lastElementChild!.textContent = !sql ? 'Run the flow first.' : read && read !== sql ? `-- read as ${personName(who)}: ${view!.filters.join(', ') || 'no row rules'}${view!.removed.length ? `; removes ${view!.removed.map((r) => r.column).join(', ')}` : ''}\n${read}` : sql;
  })();
  return box;
}

// ------------------------------------------------------------------ tabs: data, with each column's distribution on top

/** A node of the latest run, as a person reads it: its inspection, place, columns and rows, or why not. */
async function nodeView(id: string, who: string): Promise<{ insp: Inspection; i: number; read: string; columns: string[] } | string> {
  const run = latest();
  if (!run) return 'Run the flow to see its rows.';
  const insp = await inspect(run);
  const i = insp.index.get(id);
  if (i === undefined || !insp.manifest.has(i)) return 'Not run yet.';
  const view = viewIn(insp, i, who);
  const read = readIn(insp, i, who);
  if (!view.open || !read) return `Closed to ${personName(who)}: ${view.reason ?? 'their rules don’t open it'}.`;
  return { insp, i, read, columns: view.columns };
}

/** A column's distribution, small enough for a column's head: bars for a measure or a time, the common values for the rest. */
function miniDist(p: Profile, meaning?: PropertyType): SVGSVGElement | HTMLElement | null {
  const W = 104;
  const H = 22;
  if (p.hist) {
    const max = Math.max(1, ...p.hist.counts);
    const bw = W / p.hist.counts.length;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mini', 'aria-hidden': 'true' }) as SVGSVGElement;
    p.hist.counts.forEach((c, k) => svg.append(s('rect', { x: (k * bw + 0.3).toFixed(1), y: (H - (c / max) * H).toFixed(1), width: Math.max(0.8, bw - 0.6).toFixed(1), height: Math.max(c ? 1 : 0, (c / max) * H).toFixed(1) })));
    return svg;
  }
  // A key: every value different, nothing to draw.
  if (p.facts.distinct >= p.facts.present && p.facts.present > 20) return h('span', { class: 'mini-none' }, 'every value different');
  if (p.top?.length) {
    const top = p.top.slice(0, 3);
    let x = 0;
    const svg = s('svg', { viewBox: `0 0 ${W} 8`, class: 'mini tops', 'aria-hidden': 'true' }) as SVGSVGElement;
    top.forEach((t, k) => {
      const w = Math.max(1, t.share * W);
      svg.append(s('rect', { class: `v${k}`, x: x.toFixed(1), y: 0, width: (w - 0.6).toFixed(1), height: 8 }));
      x += w;
    });
    // The top value only, said short: its meaning when that is a word or two, else its code (the rest is a tap away).
    const name = (t: { value: unknown }) => {
      const m = meaningFor(meaning, t.value);
      return m && m.split(/\s+/).length <= 2 ? m : String(t.value);
    };
    // A tie is said as one, never as one value's lead: "all equal", or "3 tie · 17%".
    const tie = tieOf(p);
    const said = tie === 'all' ? 'all equal' : tie > 1 ? `${tie === p.top.length && p.facts.distinct > tie ? `${tie}+` : tie} tie · ${Math.round(p.top[0]!.share * 100)}%` : `${name(top[0]!)} ${Math.round(top[0]!.share * 100)}%`;
    return h('span', { class: 'mini-tops' }, svg, h('span', { class: 'mini-label' }, said));
  }
  return null;
}

/** How many of a column's most common values share the top count: every value ('all', each 1/distinct of the rows
 * present, the six boroughs of a day's weather_effect) or how many (1: a value leads). */
function tieOf(p: Profile): 'all' | number {
  const t = p.top ?? [];
  if (t.length < 2) return 1;
  const n = t.filter((x) => Math.abs(x.share - t[0]!.share) < 1e-9).length;
  return n === t.length && Math.abs(t[0]!.share * p.facts.distinct - 1) < 1e-6 ? 'all' : n;
}

/** A scroll box's edges fade while there is more past them (the tabs, a wide grid of rows). */
function fadeEdges(el: HTMLElement): HTMLElement {
  const edges = () => {
    el.classList.toggle('fade-l', el.scrollLeft > 2);
    el.classList.toggle('fade-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  el.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(edges);
  return el;
}

async function dataTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const nv = await nodeView(id, who);
  if (typeof nv === 'string') return h('p', { class: 'foot' }, nv);
  const { insp, i, read, columns } = nv;
  const meanings = meaningsOf(id);
  // All rows, or only those with a blank (ADR 0008: the rows that matter a tap away, not a paragraph about them).
  const blanks = drill.blanks.get(card) === true;
  const where = blanks && columns.length ? ` WHERE ${columns.map((c) => `${columnSql(c)} IS NULL`).join(' OR ')}` : '';
  const r = await state.engine!.query(`SELECT * FROM (\n${read}\n)${where} LIMIT 50`);
  const total = (await rowsAs(insp, i, who)) ?? 0;
  const fresh = new Set((state.changes.get(id)?.added ?? []).map((c) => c.toLowerCase()));
  const heads = new Map<string, HTMLElement>();
  const head = (c: string) => {
    const p = meanings(c);
    const th = h('th', { class: fresh.has(c.toLowerCase()) ? 'new' : '', scope: 'col' },
      h('button', { type: 'button', class: 'th-open', 'aria-label': `${p?.title ?? c}: its distribution and values`, onclick: () => openTab(card, 'columns', c) },
        h('span', { class: 'th-name' }, p?.title ?? c), p ? h('span', { class: 'th-code' }, c) : null,
        h('span', { class: 'th-dist' }, h('span', { class: 'mini-wait' }))));
    heads.set(c, th);
    return th;
  };
  const cell = (v: unknown, c: string) => {
    const { text, cls } = cellOf(v);
    const p = meanings(c);
    const means = meaningFor(p, v);
    return h('td', { class: cls }, typeof v === 'number' && p?.unit === 'USD' ? inUnit(text, v, p) : text, means ? h('span', { class: 'means' }, means) : null);
  };
  const grid = fadeEdges(h('div', { class: 'grid-wrap' }, h('table', { class: 'data grid' },
    h('thead', {}, h('tr', {}, h('th', { class: 'rownum', scope: 'col' }, '#'), ...r.columns.map(head))),
    h('tbody', {}, ...r.rows.map((row, k) => h('tr', {}, h('th', { class: 'rownum', scope: 'row' }, String(k + 1)), ...row.map((v, j) => cell(v, r.columns[j]!))))))));
  const lead = h('div', { class: 'vf-pick', role: 'group', 'aria-label': 'Which rows' },
    h('button', { type: 'button', class: 'vf-pick-chip', 'aria-pressed': String(!blanks), onclick: () => (drill.blanks.delete(card), void renderSheet()) }, `First ${fmtInt(r.rows.length)} of ${fmtInt(total)}`),
    h('button', { type: 'button', class: 'vf-pick-chip', 'aria-pressed': String(blanks), onclick: () => (drill.blanks.set(card, true), void renderSheet()) }, 'With blanks'));
  // The distributions arrive once the rows have been looked into: the grid shows straight away.
  void qualityOf(insp, i, who).then((q) => {
    if (!q) return;
    for (const p of q.profiles) {
      const th = heads.get(p.name);
      if (!th) continue;
      const filled = p.facts.present / Math.max(1, p.facts.rows);
      const dist = th.querySelector('.th-dist')!;
      dist.replaceChildren(
        miniDist(p, meanings(p.name)) ?? h('span', { class: 'mini-none' }, `${fmtInt(p.facts.distinct)} distinct`),
        h('span', { class: 'th-fill', title: `${pct(filled)} filled` }, h('i', { style: `width:${(filled * 100).toFixed(1)}%` })),
        h('span', { class: 'th-stat' }, filled < 1 ? `${pct(1 - filled)} empty` : `${fmtCompact(p.facts.distinct)} distinct`));
      const flag = columnFlag(id, p);
      if (flag) th.querySelector('.th-name')!.append(h('span', { class: `th-flag ${flag.severity}`, title: flag.title, 'aria-label': flag.title }, '●'));
    }
  }).catch(() => undefined);
  return h('div', { class: 'data-tab' }, lead, grid);
}

/** The finding about a column today, if the day's news has one: its severity and what it says. */
/** A column's mark on its row: the news about it (its glyph and the number that moved; ↳ in grey when the day's cause
 * explains it), or a ring when a number of it is outside its range without being news. */
function colMark(id: string, p: Profile, out: readonly Judged[]): HTMLElement | null {
  // The day's marks, never beside another day's rows (ADR 0008 §10).
  if (rowsFrom(shownDay(), viewedDay())) return null;
  // The hours the trips fall are the pickup times': that column carries the day's cause.
  const day = newsDay();
  const story = day && historyOf(id) === 'trips' ? storyFor(day) : null;
  if (story?.hero === 'hours' && story.hours && /pickup/i.test(p.name) && p.kind === 'time') {
    const m = sevMark(story.severity);
    return h('span', { class: `cr-mark ${story.severity}`, 'aria-label': story.head }, m ? glyphEl(m, 13) : null, h('span', {}, clockText(story.hours.from * 60)));
  }
  const f = idNews(id).find((x) => x.columns?.includes(p.name) && x.severity !== 'ok') as Told | undefined;
  if (f) {
    const folded = f.tier === 'absorbed' || f.tier === 'follows' || f.tier === 'sameDay';
    const said = f.value !== undefined && f.range && (f.kind === 'share' || f.kind === 'missing' || f.kind === 'gone') ? (f.value === 0 ? 'none' : shareWords(f.value, f.range.low, f.range.high).value) : '';
    const dir = f.value !== undefined && f.range ? (f.value > f.range.high ? '▲' : f.value < f.range.low ? '▼' : '') : '';
    const m: VizMark = folded ? 'explained' : f.severity === 'alert' ? 'alert' : f.severity === 'warn' ? 'warn' : 'note';
    return h('span', { class: `cr-mark ${folded ? 'explained' : f.severity}`, 'aria-label': f.title }, glyphEl(m, 13), dir || said ? h('span', {}, `${dir}${said}`) : null);
  }
  return out.length ? h('span', { class: 'cr-mark ring', 'aria-label': 'outside its range, not news' }, h('i', {})) : null;
}

function columnFlag(id: string, p: Profile): { severity: Severity; title: string } | null {
  // Never beside another day's rows (ADR 0008 §10).
  if (rowsFrom(shownDay(), viewedDay())) return null;
  const f = idNews(id).find((x) => x.columns?.includes(p.name) && x.severity !== 'ok');
  return f ? { severity: f.severity, title: f.title } : null;
}

// ------------------------------------------------------------------ tabs: columns, one to a line

async function columnsTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const nv = await nodeView(id, who);
  if (typeof nv === 'string') return h('p', { class: 'foot' }, nv);
  const { insp, i } = nv;
  const q = await qualityOf(insp, i, who);
  if (!q) return h('p', { class: 'foot' }, 'Closed.');
  const meanings = meaningsOf(id);
  const types = new Map(insp.plan.nodes[i]!.schema!.map(([c, t]) => [c, t as string]));
  // Rows of another day (a held day's last day that passed) are told as they are, under their date bar: the day's own
  // marks and badges aren't put beside them (ADR 0008 §10: never two days in one panel).
  const stale = !!rowsFrom(shownDay(), viewedDay());
  const day = stale ? undefined : newsDay();
  const normalDay = day && historyOf(id) === 'trips' ? day : undefined;
  const open = drill.column.get(card);
  const flags = (column: string) => q.suggestions.filter((x) => x.column === column && x.failing > 0).map((x) => `${x.check} flags ${plural(x.failing, 'row')}`);
  const list = h('div', { class: 'col-list' });
  let opened: HTMLElement | null = null;
  // The columns the day's news is about first: something wrong or unusual, then what the cause explains, then the rest.
  const story = day && historyOf(id) === 'trips' ? storyFor(day) : null;
  const rank = (p: Profile) => {
    if (story?.hero === 'hours' && /pickup/i.test(p.name) && p.kind === 'time') return -1;
    const f = stale ? undefined : (idNews(id).find((x) => x.columns?.includes(p.name) && x.severity !== 'ok') as Told | undefined);
    return !f ? 3 : f.tier === 'cause' || f.tier === 'standalone' ? SEV_RANK[f.severity] : 2.5;
  };
  const ordered = [...q.profiles].map((p, k) => ({ p, k, r: rank(p) })).sort((a, b) => a.r - b.r || a.k - b.k).map((x) => x.p);
  for (const p of ordered) {
    const m = meanings(p.name);
    const filled = p.facts.present / Math.max(1, p.facts.rows);
    const normal = normalDay ? columnNormal(p, q, normalDay) : undefined;
    const flag = columnFlag(id, p);
    const out = [normal?.missing, normal?.median].filter((j): j is Judged => !!j && j.place !== 'within');
    const detail = h('div', { class: 'col-detail', hidden: true });
    const row = h('button', { type: 'button', class: `col-row${flag ? ` ${flag.severity}` : ''}`, 'aria-expanded': 'false' },
      h('span', { class: 'cr-name' }, h('b', {}, m?.title ?? p.name), m ? h('span', { class: 'cr-code' }, p.name) : null),
      h('span', { class: 'cr-dist' }, miniDist(p, m) ?? h('span', { class: 'mini-none' }, p.kind)),
      h('span', { class: 'cr-stat' }, filled < 1 ? `${pct(filled)} filled` : 'all filled'),
      colMark(id, p, out));
    const toggle = (show: boolean) => {
      row.setAttribute('aria-expanded', String(show));
      detail.hidden = !show;
      if (show && !detail.firstChild) detail.append(...columnStory(card, id, p, q, types.get(p.name) ?? 'any', m, normal, flags(p.name)).filter((x): x is Node | string => x !== null && x !== undefined && x !== false));
      if (show) drill.column.set(card, p.name);
      else if (drill.column.get(card) === p.name) drill.column.delete(card);
    };
    row.addEventListener('click', () => toggle(detail.hidden));
    list.append(h('div', { class: 'col-item' }, row, detail));
    if (open === p.name) {
      toggle(true);
      opened = row;
    }
  }
  const gappy = q.profiles.filter((p) => p.facts.present < p.facts.rows).length;
  const lead = h('p', { class: 'foot' }, `${plural(q.profiles.length, 'column')}${gappy ? ` · ${gappy} with blanks` : ''} · shapes from ${fmtInt(q.sample.length)} rows`);
  if (opened) requestAnimationFrame(() => opened!.scrollIntoView({ block: 'start' }));
  return h('div', { class: 'columns-tab' }, lead, list);
}

/** A column's story, in order: what it is, how full, its shape or values, what is normal for it, what is new, and what to do. */
function columnStory(card: string, id: string, p: Profile, q: Quality, type: string, m: PropertyType | undefined, normal: ColumnNormal | undefined, flags: string[]): Child[] {
  const out: Child[] = [columnCard(p, type, undefined, undefined, flags, m, normal)];
  // The day's news about it, with what can be done: only beside the day's own rows.
  if (!rowsFrom(shownDay(), viewedDay())) for (const f of idNews(id).filter((x) => x.columns?.includes(p.name) && x.severity !== 'ok')) out.push(findingCard(f, card));
  // Its history, where the history keeps it: its share missing, and its median.
  if (history && historyOf(id) === 'trips') {
    const metrics: { m: Metric; label: string; fmt: (v: number) => string }[] = [];
    if (history.file.columns.includes(p.name)) {
      if (p.facts.present < p.facts.rows || (history.of({ of: 'missing', column: p.name })?.value(history.to) ?? 0) > 0) metrics.push({ m: { of: 'missing', column: p.name }, label: 'Share missing', fmt: pct });
      if ((p.kind === 'measure' || p.kind === 'time') && history.medians(p.name) >= 20) metrics.push({ m: { of: 'median', column: p.name }, label: 'Median', fmt: p.kind === 'time' ? clockText : (v) => inUnit(fmtNum(v), v, m) });
    }
    for (const x of metrics) out.push(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, `${x.label}, day by day`), sparkBand(x.m, x.fmt) ?? h('p', { class: 'foot' }, 'Not enough history.')));
    const values = valuesStory(p.name, m);
    if (values) out.push(values);
  }
  void q;
  return out;
}

// ------------------------------------------------------------------ tabs: news

const SEV_LABEL: Record<Severity, string> = { alert: 'Something’s wrong', warn: 'Unusual', note: 'Worth knowing', ok: 'Normal' };

/** How the news says a column and a value: the column's title, a code with what it stands for. */
const NEWS_NAMES = {
  column: (c: string) => (loadSource() ? meaningsOf(loadSource()!)(c)?.title ?? c : c),
  value: (c: string, v: unknown) => {
    if (v === null || v === undefined) return 'none';
    const p = loadSource() ? meaningsOf(loadSource()!)(c) : undefined;
    const means = meaningFor(p, v);
    const text = typeof v === 'number' && p?.unit === 'USD' ? inUnit(String(v), v, p) : String(v);
    return means ? `${text} (${means})` : text;
  },
  /** A value said on its own, for short titles: what a code stands for, or an amount in its unit. */
  label: (c: string, v: unknown) => {
    if (v === null || v === undefined) return 'none';
    const p = loadSource() ? meaningsOf(loadSource()!)(c) : undefined;
    return meaningFor(p, v) ?? (typeof v === 'number' && p?.unit === 'USD' ? inUnit(String(v), v, p) : String(v));
  },
};

const storyCache = new Map<string, Story>();

/** The columns of the trips the person's policy removes: no finding is told from them (ADR 0008). */
function hiddenTripColumns(): Set<string> {
  const src = loadSource();
  const view = src ? access(src, state.previewAs ?? state.viewer) : null;
  return new Set((view?.removed ?? []).map((r) => r.column.toLowerCase()));
}

/** The checks the history counts, and the most they may drop: the day's gate. */
function gateStep(): { step: string; limit: number | null } | null {
  const st = history ? state.doc.steps.find((x) => x.id === history!.file.step) : undefined;
  return st?.kind === 'expectations' && checksAsCounted() ? { step: st.id, limit: st.maxDropped ?? null } : null;
}

/**
 * A day's story (src/core/story.ts): its cause, its gate, and every finding sorted by what the cause explains, as the
 * person may read it, with what has been done about each finding (the log). One computation for every summary: the
 * News tab, the health dots, the loads strip and the badges all read it.
 */
function storyFor(day: string): Story | null {
  if (!history || !historyOpen()) return null;
  const hidden = hiddenTripColumns();
  const gate = gateStep();
  const loaded = loads.list[loads.at]?.day === day;
  const held = loaded && state.failed && !state.failed.file && gate && state.failed.origin === gate.step ? true : undefined;
  const refused = loaded && !!state.failed?.file;
  const key = `${day}|${checksAsCounted()}|${dataLog.version}|${[...hidden].sort().join(',')}|${held ?? ''}|${refused}`;
  let told = storyCache.get(key);
  if (!told) {
    const found = newsOf(history, day, NEWS_NAMES, { checks: checksAsCounted() });
    const acknowledged = new Set(found.filter((f) => logOf(day, f.key).some((e) => e.act === 'expected')).map((f) => f.key));
    told = storyOf(history, day, found, { names: NEWS_NAMES, step: gate?.step, limit: gate?.limit ?? null, held, refused, acknowledged, hidden });
    storyCache.set(key, told);
    for (const old of [...storyCache.keys()].slice(0, Math.max(0, storyCache.size - 60))) storyCache.delete(old);
  }
  return told;
}

/** A day's news from the history, as its story tells it: each finding with its severity as told, most important first. */
function dayNews(day: string): Finding[] {
  return storyFor(day)?.findings ?? [];
}
const SEV_RANK: Record<Severity, number> = { alert: 0, warn: 1, note: 2, ok: 3 };

/** The day of the load on the canvas, when it is one the history has. */
const newsDay = (): string | undefined => {
  const l = loads.list[loads.at];
  return l && history && history.file.days.includes(l.day) ? l.day : undefined;
};

/** The news a step's sheet tells: the trips', their checks', the weather's. */
function idNews(id: string): Finding[] {
  const kind = historyOf(id);
  const day = newsDay();
  if (!kind || !day) return [];
  const all = dayNews(day);
  const mine = all.filter((f) => (kind === 'checks' ? f.kind === 'dropped' || f.kind === 'rule' : kind === 'weather' ? f.kind === 'weather' : f.kind !== 'dropped' && f.kind !== 'rule' && f.kind !== 'weather'));
  return mine.length ? mine : all.filter((f) => f.kind === 'calm');
}

/** A card's news: a profile box tells all of its step's, the trips' and their checks'; a table the history doesn't
 * follow, its own rows' (once measured on the day's run). */
function cardNews(card: string): Finding[] {
  const fileNews = integrityNews(dataOf(card));
  if (fileNews.length) return [...fileNews, ...cardNewsOf(card)];
  return cardNewsOf(card);
}

function cardNewsOf(card: string): Finding[] {
  const p = profileOf(card);
  if (p && historyOf(p.of) === 'trips') {
    const day = newsDay();
    return day ? dayNews(day) : [];
  }
  const id = dataOf(card);
  if (historyOf(id)) return idNews(id);
  const found = tableNews.known.get(`${id}|${state.previewAs ?? state.viewer}`) ?? [];
  // Marked as expected: kept, but quiet. A table's marks hold on every day: it is the same table until it changes.
  return found.map((f) => (findingLog(f).some((e) => e.act === 'expected') ? { ...f, severity: 'ok' as Severity, score: -1 } : f))
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.score - a.score);
}

/** How a table's news says a column and a value: its meaning's title, and what a code stands for. */
const namesFor = (id: string): Names => ({
  column: (c) => meaningsOf(id)(c)?.title ?? c,
  value: (c, v) => {
    if (v === null || v === undefined) return 'none';
    const means = meaningFor(meaningsOf(id)(c), v);
    return means ? `${String(v)} (${means})` : String(v);
  },
});

/** The steps that read a table, near or far. */
function downstreamOf(id: string): string[] {
  const out: string[] = [];
  const next = [id];
  while (next.length) for (const r of readersOf(next.pop()!)) if (!out.includes(r)) out.push(r), next.push(r);
  return out;
}

/** What its rows are called: the ontology's object for it or for what reads it ("zones"), or rows. */
function nounOf(id: string): string {
  const types = state.doc.ontology?.objectTypes ?? [];
  const t = types.find((x) => x.dataset === id) ?? (state.doc.sources.some((x) => x.id === id) ? types.find((x) => readersOf(id).includes(x.dataset)) : undefined);
  return t ? `${t.name.toLowerCase()}s` : 'rows';
}

/** A table's own news, from its rows on the day's run, kept under its content's key and the viewer. */
const tableNews = { known: new Map<string, Finding[]>(), byKey: new Map<string, Promise<Finding[]>>() };

/** A table's effect against its baseline, from all its rows (the sample, when it holds them all); null otherwise. */
async function effectFor(id: string, who: string): Promise<Effect | null> {
  const nv = await nodeView(id, who);
  if (typeof nv === 'string') return null;
  const q = await qualityOf(nv.insp, nv.i, who).catch(() => null);
  if (!q || q.sample.length !== q.rows) return null;
  return effectOf(q.columns, q.sample);
}

/** An effect drawn: each value's ratio to the baseline by group, the baseline's 1× a tick ("dry = 1×"). */
function effectVisual(id: string, e: Effect): HTMLElement {
  const m = meaningsOf(id);
  const values = [...new Set(e.rows.map((r) => r.value))].slice(0, 3);
  const groups = values.map((v) => ({ head: v.replace(/^./, (c) => c.toUpperCase()), rows: e.rows.filter((r) => r.value === v).sort((a, b) => a.group < b.group ? -1 : 1).map((r) => ({ name: r.group, ratio: r.ratio })) }));
  const title = m(e.ratio)?.title ?? e.ratio;
  return block(`${title}, by ${(e.group ? m(e.group)?.title ?? e.group : 'row').toLowerCase()}`, svgNode(effectBars({ groups, baseline: e.baseline,
    aria: `${title} against ${e.baseline} hours: ${e.rows.map((r) => `${r.value} ${r.group} ${r.ratio.toFixed(2)} times`).join(', ')}.` })));
}

async function tableNewsFor(id: string, who: string): Promise<Finding[]> {
  if (historyOf(id)) return [];
  const nv = await nodeView(id, who);
  if (typeof nv === 'string') return [];
  const { insp, i } = nv;
  const key = `${insp.manifest.get(i)!.key}|${who}`;
  let found = tableNews.byKey.get(key);
  if (!found) {
    found = measureTableNews(insp, i, id, who).catch(() => []);
    tableNews.byKey.set(key, found);
  }
  const news = await found;
  tableNews.known.set(`${id}|${who}`, news);
  return news;
}

async function measureTableNews(insp: Inspection, i: number, id: string, who: string): Promise<Finding[]> {
  const q = await qualityOf(insp, i, who);
  if (!q) return [];
  const c = (who === state.viewer ? state.changes.get(id) : undefined) ?? (await changeOf(insp, i, who));
  const input = state.doc.sources.some((x) => x.id === id);
  const added = new Set(c.added.map((x) => x.toLowerCase()));
  const keys: TableFacts['keys'] = [];
  const unmatched: TableFacts['unmatched'] = [];
  const changeFor = async (step: string) => {
    const j = insp.index.get(step);
    if (j === undefined || !insp.manifest.has(j)) return undefined;
    return (who === state.viewer ? state.changes.get(step) : undefined) ?? (await changeOf(insp, j, who));
  };
  const read = readIn(insp, i, who);
  for (const st of state.doc.steps) {
    if (st.kind !== 'join' || st.inputs[1] !== id || !visible(st.id)) continue;
    const columns = st.on.map((o) => o.right);
    const ps = columns.map((c) => q.profiles.find((p) => p.name.toLowerCase() === c.toLowerCase()));
    if (ps.some((p) => !p) || !read) continue;
    if (columns.length === 1) keys.push({ columns, by: st.id, present: ps[0]!.facts.present, distinct: ps[0]!.facts.distinct });
    else {
      // Together: the rows with them all, and their different combinations, counted by the engine.
      const all = columns.map((c) => `${columnSql(c)} IS NOT NULL`).join(' AND ');
      const m = insp.manifest.get(i)!.key;
      const present = await countOnce(`${m}|${who}|keyrows|${columns.join(',')}`, `SELECT 1 FROM (\n${read}\n) WHERE ${all}`);
      const distinct = await countOnce(`${m}|${who}|keys|${columns.join(',')}`, `SELECT DISTINCT ${columns.map(columnSql).join(', ')} FROM (\n${read}\n) WHERE ${all}`);
      keys.push({ columns, by: st.id, present, distinct });
    }
    const jc = await changeFor(st.id);
    if (jc?.unmatched != null && jc.rowsIn != null) unmatched.push({ by: st.id, column: st.on[0]!.left, rows: jc.unmatched, of: jc.rowsIn });
  }
  const own = steps().get(id);
  if (own?.kind === 'join' && c.unmatched != null && c.rowsIn != null) unmatched.push({ by: id, column: own.on[0]!.left, rows: c.unmatched, of: c.rowsIn, own: own.inputs[1]! });
  // Placeholders: in an input's text, from the sample (every row of a small table).
  const placeholders: TableFacts['placeholders'] = [];
  let placeholderRows = 0;
  if (input) {
    const text = q.profiles.map((p, k) => (p.kind === 'text' || p.kind === 'category' || p.kind === 'code' ? k : -1)).filter((k) => k >= 0);
    const counts = new Map<string, number>();
    for (const row of q.sample) {
      let any = false;
      for (const k of text) {
        const v = row[k];
        if (!isPlaceholder(v)) continue;
        any = true;
        const at = `${q.columns[k]}\u0000${String(v)}`;
        counts.set(at, (counts.get(at) ?? 0) + 1);
      }
      if (any) placeholderRows++;
    }
    const scale = q.sample.length ? q.rows / q.sample.length : 1;
    for (const [at, n] of counts) {
      const [column, value] = at.split('\u0000') as [string, string];
      placeholders.push({ column, value, rows: Math.round(n * scale) });
    }
    placeholderRows = Math.round(placeholderRows * scale);
  }
  const values = [...new Set(placeholders.map((p) => p.value))];
  const handledBy = values.length ? downstreamOf(id).filter((st) => { const text = JSON.stringify(steps().get(st) ?? {}); return values.some((v) => text.includes(`'${v}'`)); }) : [];
  const told = tableNewsOf({
    noun: nounOf(id),
    rows: q.rows,
    columns: q.profiles.map((p) => ({ name: p.name, present: p.facts.present, distinct: p.facts.distinct, added: added.has(p.name.toLowerCase()) })),
    keys, unmatched, placeholders, placeholderRows, exact: q.sample.length >= q.rows, handledBy, input,
  }, namesFor(id));
  return told.map((f) => ({ ...f, key: `${id}:${f.key}`, table: id }));
}

// ------------------------------------------------------------------ news, drawn (ADR 0008)
//
// A day's news as its story (src/core/story.ts) draws it: one cause card (a head that carries the number, one visual
// chosen by the cause, the gate when it held, what it reaches, what follows from it folded, one verb), a health row, at
// most two more stories, and counted rows that open in place. Words sit on the marks; a tap opens a detail that is a
// visual too; the method lives once, behind (i).

const svgNode = (markup: string): Element => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild!;
};
const glyphEl = (k: VizMark, size = 16) => svgNode(glyph(k, size));
const sevMark = (s: Severity): VizMark | null => (s === 'alert' ? 'alert' : s === 'warn' ? 'warn' : s === 'note' ? 'note' : null);
const RULE_TITLE = (name: string) => name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The finding the story's verbs act on: its cause, else what it absorbed, else its first story. */
function anchorOf(story: Story): Finding | null {
  const f = story.cause ?? story.absorbed.find((x) => x.kind === 'volume') ?? story.absorbed[0] ?? story.follows[0] ?? story.stories[0] ?? null;
  return f ? { ...f, title: story.head, detail: [story.chip, ...story.labels.hero].filter(Boolean).join(' · ') } : null;
}

/** A metric day by day, with each day's own range, ending on the day: for strips. A coded value's count takes the
 * range its split is judged on where its own has none (story.countRange). The day's tick carries the severity given
 * only when it is outside its own range: a part that held is drawn plain on the day the rest of the trips fell. */
function stripOf(m: Metric, day: string, n = 28, sevToday?: Severity): StripDay[] {
  const ranges = rangesOf(m);
  if (!ranges || !history) return [];
  return daysFrom(dayPlus(day, -(n - 1)), day).map((d) => {
    const r = m.of === 'count' ? countRange(history!, m.column, m.value, d) : ranges.at(d);
    const v = ranges.value(d);
    const outside = v !== null && (!r || v < r.low || v > r.high);
    return { day: d, v, low: r?.low ?? null, high: r?.high ?? null, sev: d === day && outside && (sevToday === 'alert' || sevToday === 'warn') ? sevToday : null };
  });
}
const stripLabels = (days: readonly StripDay[]): [number, string, string?][] => (days.length ? [[0, shortDay(days[0]!.day), 'start'], [days.length - 1, shortDay(days.at(-1)!.day), 'end']] : []);

/** The split on one count scale: the named part and everything else, the moved one with its mark. */
function splitVisual(story: Story): Element | null {
  const sp = story.split;
  if (!sp) return null;
  const sev = story.severity === 'alert' || story.severity === 'warn' ? story.severity : 'warn';
  const partMoved = sp.kind !== 'held';
  return svgNode(partBar({
    left: { name: partLabel(sp), today: sp.part.today, usual: sp.part.usual, label: countLabel(sp.part), sev: partMoved ? sev : null },
    right: { name: 'Everything else', today: sp.rest.today, usual: sp.rest.usual, label: countLabel(sp.rest), sev: partMoved ? null : sev },
    aria: `${partLabel(sp)} records: ${fmtInt(sp.part.today)}, where about ${fmtInt(sp.part.usual)} is usual. Everything else: ${fmtInt(sp.rest.today)}, where about ${fmtInt(sp.rest.usual)} is usual.`,
  }));
}

/** The day's count on its track from 0, every day: the first numbers on the screen are drawn. */
function amountVisual(story: Story): Element | null {
  const a = story.amount;
  if (!a) return null;
  const wd = WEEKDAY_NAMES[dateOf(story.day).getUTCDay()]!;
  const volume = story.findings.find((f) => f.kind === 'volume');
  const sev = volume && (volume.was === 'alert' || volume.was === 'warn') ? volume.was : null;
  // The day's own change, when the story puts it on the line (outside its range, and not already in the head).
  const change = story.labels.amount.find((l) => /^[+−]\d+%$/.test(l));
  return svgNode(amountLine({ value: a.value, low: a.low, high: a.high, valueLabel: fmtInt(a.value), bandLabel: `usual ${compact(a.low)}–${compact(a.high)}`, changeLabel: change, sev, aria: `${fmtInt(a.value)} trips on ${dayLabel(story.day)}${change ? `, ${change} against a usual ${wd}` : ''}, where a usual ${wd} has ${fmtInt(a.low)} to ${fmtInt(a.high)}.` }));
}

/** The hero of a story's cause card: the one visual its cause calls for. */
function heroOf(story: Story): Element | null {
  const day = story.day;
  const wd = WEEKDAY_NAMES[dateOf(day).getUTCDay()]!;
  if (story.hero === 'split') return splitVisual(story);
  if (story.hero === 'hours' && story.hours && story.hoursLabels) {
    const hr = story.hours;
    const l = story.hoursLabels;
    const had = hr.got.slice(hr.from, hr.to + 1).reduce((a, b) => a + b, 0);
    const want = hr.usual.slice(hr.from, hr.to + 1).reduce((a, b) => a + b, 0);
    const fall = Math.round((1 - had / Math.max(1, want)) * 100);
    return svgNode(hourBars({
      got: hr.got, usual: hr.usual, cut: hr.from, to: hr.to, cutLabel: l.cut, floorLabel: l.floor, missingLabel: l.missing, ghostLabel: l.ghost,
      aria: `Trips by hour, ${dayLabel(day)}, against a usual ${wd}: from ${clockText(hr.from * 60)} they fall ${fall}% but don't stop, ${fmtInt(had)} trips where about ${fmtInt(want)} is usual, ${l.floor.replace('/h', ' an hour')}.`,
    }));
  }
  if ((story.hero === 'amount' || story.hero === 'finding') && story.cause?.kind === 'volume') {
    const days = stripOf({ of: 'trips' }, day, 28, story.severity);
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, key: STRIP_KEY, aria: `Trips day by day for four weeks to ${dayLabel(day)}, each against its own usual range.` })) : null;
  }
  if (story.hero === 'gate' && story.gate) return gateVisual(story.gate, true, gateScale(story));
  // A population seen through its blanks: its share on its own row, zoomed to where it and its range are.
  const pop = story.split?.via === 'blanks' ? story.cause?.members?.find((m) => m.value !== 'null') : undefined;
  if (story.hero === 'finding' && pop && story.split) {
    const w = shareWords(pop.share, pop.range.low, pop.range.high);
    const sev = story.severity === 'alert' || story.severity === 'warn' ? story.severity : null;
    return svgNode(dumbbellRows({ rows: [{ label: story.split.name, today: pop.share, low: pop.range.low, high: pop.range.high, todayLabel: w.value, usualLabel: `usually ${w.range}`, sev }], aria: `${story.split.name} trips: ${w.value} of the day's trips, where ${w.range} is usual.` }));
  }
  if (story.hero === 'finding' && story.cause) return findingVisual(story.cause);
  if (story.hero === 'calm') {
    // After an episode, its days carry their marks: held at the checks, or published with something wrong.
    const rec = story.recovery;
    const days = stripOf({ of: 'trips' }, day, 7).map((d) => (rec && d.day >= rec.from && d.day <= rec.to ? { ...d, sev: 'alert' as const, mark: (rec.held.includes(d.day) ? 'held' : 'alert') as VizMark } : d));
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, key: STRIP_KEY, aria: `Trips the seven days to ${dayLabel(day)}, each against its own usual range${rec ? `; ${rec.held.length ? `${rec.held.length} held at the checks` : ''}${rec.held.length && rec.published.length ? ', ' : ''}${rec.published.length ? `${rec.published.length} published with something wrong` : ''}` : ''}.` })) : null;
  }
  return null;
}

/** One count scale for the checks over an incident's days so far: the most any of them dropped or usually drops. */
function gateScale(story: Story): number | undefined {
  const g = gateStep();
  if (!history || !g || !story.episode) return undefined;
  let most = 0;
  for (const d of daysFrom(story.episode.since, story.day)) {
    const x = gateOf(history, d, g.step, g.limit);
    if (x) most = Math.max(most, x.dropped, x.usual?.high ?? 0);
  }
  return most || undefined;
}

/** The checks: the share of the arrived rows they dropped against their limit, zoomed within two points of it, and the
 * rows they dropped against a day like it, each bar saying what it counts (story.gateLabels). */
function gateVisual(g: Gate, big = false, countMax?: number): Element {
  const share = g.rows ? g.dropped / g.rows : 0;
  const pastLimit = g.limit !== null && share > g.limit;
  const l = gateLabels(g);
  return svgNode(gateBars({
    rows: g.rows, dropped: g.dropped, limit: g.limit, usual: g.usual ? { low: g.usual.low, high: g.usual.high } : null, big, countMax,
    shareLabel: l.share, limitLabel: l.limit, marginLabel: l.margin, zoom: l.margin !== null,
    countLabel: [l.rows, l.usual ?? ''],
    aria: `${g.held ? `Held at ${g.step}` : `The checks at ${g.step}`}: ${l.share}${g.limit !== null ? ` against a ${Math.round(g.limit * 100)}% limit` : ''}${l.margin ? `, ${l.margin.replace('pt', 'points')}` : ''}${pastLimit && !g.held ? ', past it' : ''}; ${l.rows} of ${fmtInt(g.rows)}${g.usual ? `, where a day like it drops ${fmtInt(g.usual.low)} to ${fmtInt(g.usual.high)}` : ''}.`,
  }));
}

/** A finding's own visual, chosen by its kind. */
function findingVisual(f: Finding): Element | null {
  const day = newsDay();
  if (!day) return null;
  const sev = f.severity === 'alert' || f.severity === 'warn' ? f.severity : null;
  if (f.kind === 'volume') {
    const days = stripOf({ of: 'trips' }, day, 28, f.severity);
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), aria: `Trips day by day: ${f.title}` })) : null;
  }
  if (f.kind === 'hours' && f.hours) return svgNode(hourBars({ got: f.hours.got, usual: f.hours.usual, cut: f.hours.from, cutLabel: clockText(f.hours.from * 60), aria: `Trips by hour: ${f.title}` }));
  if ((f.kind === 'share' || f.kind === 'gone' || f.kind === 'missing') && (f.members?.length || f.range)) {
    const rows: Dumbbell[] = (f.members ?? [{ column: f.columns?.[0] ?? '', value: f.values?.[0] ?? 'null', label: '', share: f.value ?? 0, range: f.range!, rows: f.rows ?? 0 }]).map((m) => {
      const w = shareWords(m.share, m.range.low, m.range.high);
      const label = `${NEWS_NAMES.column(m.column)} ${m.value === 'null' ? 'blank' : m.label || NEWS_NAMES.label(m.column, JSON.parse(m.value))}`;
      return { label, today: m.share, low: m.range.low, high: m.range.high, todayLabel: m.share === 0 ? 'none' : w.value, usualLabel: `usually ${w.range}`, sev, gone: m.share === 0 };
    }).slice(0, 6);
    return svgNode(dumbbellRows({ rows, aria: `${f.title}` }));
  }
  if (f.kind === 'shape' && f.metric?.of === 'quantile' && history) {
    const c = f.metric.column;
    const k = history.file.days.indexOf(day);
    const j = history.file.columns.indexOf(c);
    const today = history.file.quantiles?.[k]?.[j];
    if (!today) return null;
    const time = history.file.kinds[j] === 'time';
    const qs = [1, 2, 3, 4, 5];
    const fmt = time ? clockText : (v: number) => inUnit(fmtNum(v), v, loadSource() ? meaningsOf(loadSource()!)(c) : undefined);
    return svgNode(quantileStrip({
      today: qs.map((q) => today[q]!), usual: qs.map((q) => rangesOf({ of: 'quantile', column: c, q })?.at(day) ?? null),
      moved: qs.indexOf(f.metric.q), sev, fmt, ends: time ? ['early', 'late'] : ['low', 'high'], aria: f.title,
    }));
  }
  if ((f.kind === 'dropped' || f.kind === 'rule') && history) {
    const g = gateStep();
    const gate = g ? gateOf(history, day, g.step, g.limit) : null;
    return gate ? gateVisual(gate) : null;
  }
  return null;
}

/** A row of chips for the values a finding names: new values, a new pair, a schema change. */
function chipsOf(f: Finding): HTMLElement | null {
  if (f.kind === 'new' && f.values?.length) return h('div', { class: 'vf-chips' }, ...f.values.slice(0, 3).map((v) => h('span', { class: 'vf-chip new' }, NEWS_NAMES.label(f.columns?.[0] ?? '', JSON.parse(v)))), f.values.length > 3 ? h('span', { class: 'vf-chip' }, `+${f.values.length - 3}`) : null);
  return null;
}

/** The detail sheet over the tab: a title, the visuals, at most one sentence, its verbs; it keeps the day and the card. */
function openDetail(title: string, sev: Severity, body: (Node | null)[], f?: Finding | null, card?: string, primary?: Act | null): void {
  document.querySelector('.vf-detail-wrap')?.remove();
  const close = () => wrap.remove();
  const sheet = h('div', { class: 'vf-detail', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, ...(f ? { id: `finding-${f.key}` } : {}) },
    h('div', { class: 'vf-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'vf-dhead' }, h('h3', {}, sevMark(sev) ? glyphEl(sevMark(sev)!, 16) : '', title), h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: close }, '×')),
    ...body.filter((x): x is Node => !!x),
    f && card ? actionsOf(f, card, primary !== undefined ? primary : (f.acts[0] ?? null)) : null);
  const wrap: HTMLElement = h('div', { class: 'vf-detail-wrap', onclick: (e: Event) => e.target === wrap && close() }, sheet);
  wrap.addEventListener('keydown', (e: Event) => (e as KeyboardEvent).key === 'Escape' && close());
  ($('sheet') ?? document.body).append(wrap);
  (sheet.querySelector('button.close') as HTMLElement | null)?.focus();
}
const block = (head: string, ...children: (Node | null)[]) => h('div', { class: 'vf-block' }, h('p', { class: 'vf-bh' }, head), ...children.filter((x): x is Node => !!x));
const oneLine = (text: string | null | undefined) => (text ? h('p', { class: 'vf-one' }, text) : null);

/** What a tap on the cause opens: the cause told in more visuals. */
function causeDetail(story: Story, card: string): void {
  const day = story.day;
  const body: (Node | null)[] = [];
  const sp = story.split;
  if (sp && story.amount) {
    const moved = sp.kind === 'held' ? sp.rest.today - sp.rest.usual : sp.part.today - sp.part.usual;
    const other = sp.kind === 'held' ? sp.part.today - sp.part.usual : sp.rest.today - sp.rest.usual;
    const [movedName, otherName] = sp.kind === 'held' ? ['Everything else', sp.name] : [sp.name, 'Everything else'];
    const usual = sp.part.usual + sp.rest.usual;
    body.push(block('From a usual day to this one', svgNode(waterfall({
      steps: [
        { name: 'Usual', label: approx(usual), value: usual, total: true, kind: 'total' },
        { name: movedName, label: `${moved >= 0 ? '+' : '−'}${approx(Math.abs(moved))}`, value: moved, kind: moved >= 0 ? 'up' : 'down', sev: story.severity === 'alert' || story.severity === 'warn' ? story.severity : undefined },
        { name: otherName, label: `${other >= 0 ? '+' : '−'}${approx(Math.abs(other))}`, value: other, kind: other >= 0 ? 'up' : 'down' },
        { name: 'Today', label: approx(story.amount.value), value: story.amount.value, total: true, kind: 'total' },
      ],
      aria: `From a usual day's ${fmtInt(usual)} trips to ${fmtInt(story.amount.value)}: ${movedName} ${moved >= 0 ? '+' : '−'}${fmtInt(Math.abs(moved))}, ${otherName} ${other >= 0 ? '+' : '−'}${fmtInt(Math.abs(other))}.`,
    }))));
    const part = stripOf({ of: 'count', column: sp.column, value: sp.value }, day, 28, story.severity);
    const at = part.at(-1);
    if (part.length) body.push(block(`${sp.name}, day by day`, svgNode(dayStrip({ days: part, h: 88, labels: stripLabels(part), key: STRIP_KEY, unit: '/day', aria: `${sp.name} records day by day for four weeks to ${dayLabel(day)}, each against its own usual range${at?.v !== null && at?.v !== undefined ? `: ${fmtInt(at.v)} on ${dayLabel(day)}${at.low !== null && at.high !== null ? `, where ${fmtInt(at.low)} to ${fmtInt(at.high)} is usual` : ''}` : ''}.` }))));
    const comp = compositionOf(sp.column, day, sp.value, [partLabel(sp), sp.name]);
    if (comp) body.push(block(`${NEWS_NAMES.column(sp.column)}, usual and today`, comp));
    body.push(oneLine(splitSentence(story)));
    if (sp.blank.length) body.push(h('div', { class: 'vf-chips' }, h('span', { class: 'vf-chip' }, `${sp.blank.length} fields blank on these trips`)));
  }
  if (story.hours || story.episode) body.push(hoursDetail(story));
  if (story.hero === 'amount' || story.hero === 'calm') {
    const days = stripOf({ of: 'trips' }, day, 56, story.severity);
    if (days.length) body.push(block('Trips, eight weeks', svgNode(dayStrip({ days, h: 90, labels: stripLabels(days), key: STRIP_KEY, unit: '/day', aria: `Trips day by day for eight weeks to ${dayLabel(day)}.` }))));
    // The weather the card notes, under the same days, drawn and not said: context beside the trips, never a reason.
    const wx = story.labels.context && days.length ? weatherBars(story, days.map((d) => d.day)) : null;
    if (wx) body.push(wx);
  }
  // A population's own rows (the value and each field blank on it, all at one share) would say the split again.
  if (story.hero === 'finding' && story.cause && story.split?.via !== 'blanks') body.push(findingVisual(story.cause), oneLine(story.cause.detail));
  openDetail(story.head, story.severity, body, anchorOf(story), card, story.primary);
}

/** The snow a card notes, as bars under its strip of days (each day's column where the strip has it), the days the
 * card names said at its corner in the order their bars stand ("Sat 7.2 cm · Sun 1.5 cm"). A block of context: no band,
 * no mark, no sentence. */
function weatherBars(story: Story, days: readonly string[]): HTMLElement | null {
  const w = history?.file.weather;
  if (!w || !history) return null;
  const of = (d: string) => { const k = history!.file.days.indexOf(d); return k < 0 ? 0 : (w.snow[k] ?? 0); };
  const values = days.map(of);
  if (!values.some((v) => v > 0)) return null;
  const fmt = (v: number) => `${v.toFixed(1)} cm`;
  const ddd = (d: string) => WEEKDAY_NAMES[dateOf(d).getUTCDay()]!.slice(0, 3);
  // The days the card's note names: today's, and the day before's when the day's trips are the news.
  const named = [dayPlus(story.day, -1), story.day].filter((d) => of(d) >= 1 && (d === story.day || story.hero === 'amount'));
  const snowy = days.filter((d) => of(d) >= 1);
  return block('Snow, for context', svgNode(contextBars({
    values, label: fmt, kind: 'snow', gx: 12, note: named.map((d) => `${ddd(d)} ${fmt(of(d))}`).join(' · '),
    aria: `Snow in Manhattan each day of the same weeks, for context: ${snowy.slice(-4).map((d) => `${fmt(of(d))} on ${dayLabel(d)}`).join(', ') || 'under a centimetre a day'}.`,
  })));
}

/** The episode's hours (ADR 0008): every hour from its first day to the day after its last, each over the usual hour,
 * the shortfall bracketed and scoped, each day's marks under it, and a readout that follows a tap. */
function hoursDetail(story: Story): HTMLElement | null {
  if (!history) return null;
  const file = history.file;
  const bad = (d: string) => storyFor(d)?.severity === 'alert';
  const first = story.episode?.since ?? story.day;
  // The hour the trips fell: today's, or the episode's first day's.
  const cutDay = story.hours ? story.day : first;
  const hrs = story.hours ?? storyFor(first)?.hours ?? null;
  if (!hrs) return null;
  // The episode's days so far, and no further (ADR 0008 §10): the viewed day is the last a feed has brought.
  const last = story.day;
  const span = daysFrom(first, last).slice(-7);
  const ddd = (d: string) => WEEKDAY_NAMES[dateOf(d).getUTCDay()]!.slice(0, 3);
  // The shortfall: an estimate against a usual day, and a bound against the low end of usual (ADR 0008: a bound is
  // never printed as if it were the estimate), over those days only.
  const ep: EpisodeDay[] = [];
  let floor = 0;
  const blank: string[] = [];
  const days = span.map((d) => {
    const k = file.days.indexOf(d);
    const r = rangesOf({ of: 'trips' })?.at(d);
    const raw = k >= 0 && r ? usualHours(history!, k, r.expected) : null;
    if (k < 0 || !file.hours?.[k] || !raw || !r) return null;
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const usual = raw.map((x) => (x / sum) * r.expected);
    const got = file.hours[k]!;
    const st = storyFor(d);
    ep.push({ day: d, got, low: r.low, expected: r.expected, alert: st?.severity === 'alert' });
    if (d !== cutDay && st?.severity === 'alert') (blank.push(d), (floor = Math.max(floor, ...got)));
    return { label: ddd(d), got, usual, mark: st?.severity === 'alert' ? `alert${st.gate?.held ? ' held' : ''}` : st?.severity === 'warn' ? 'warn' : '' };
  }).filter((x): x is { label: string; got: number[]; usual: number[]; mark: string } => !!x);
  if (!days.length) return null;
  const { estimate: est, bound: short } = shortfall(ep, { day: cutDay, ...hrs }, story.day);
  const firstIdx = span.indexOf(cutDay) >= 0 ? span.indexOf(cutDay) : 0;
  const cut = firstIdx * 24 + hrs.from;
  const lastBad = span.indexOf(last);
  const sig = (n: number) => { const mag = 10 ** (Math.floor(Math.log10(Math.max(1, n))) - 1); return Math.floor(n / mag) * mag; };
  const bound = short >= 1000 ? compact(sig(short)) : fmtInt(short);
  const shortLabel = `~${compact(est)} fewer (≥${bound})`;
  const floorLabel = blank.length ? `under ${Math.ceil(floor / 100) * 100}/h ${blank.length > 1 ? `${ddd(blank[0]!)}–${ddd(blank.at(-1)!)}` : ddd(blank[0]!)}` : undefined;
  const svg = svgNode(episodeBars({
    days, cut, cutLabel: clockText(hrs.from * 60), floorLabel, at: span.indexOf(story.day),
    floorAt: blank.length ? ((span.indexOf(blank[0]!) + span.indexOf(blank.at(-1)!) + 1) * 24) / 2 : undefined,
    bracket: { from: cut, to: (lastBad + 1) * 24, label: shortLabel },
    aria: `Trips by hour, ${dayLabel(span[0]!)} to ${dayLabel(span.at(-1)!)}: a fall at ${clockText(hrs.from * 60)} ${ddd(cutDay)}, about ${fmtInt(est)} fewer than usual through ${ddd(last)}, at least ${fmtInt(sig(short))} against the low end of usual${floorLabel ? `, ${floorLabel.replace('/h', ' an hour')}` : ''}.`,
  }));
  const readout = h('p', { class: 'vf-readout', 'aria-live': 'polite' });
  // First the viewed day as its head says it: the fall over its hours on the day it began (Thu from 13:00: 3,679 trips
  // · usual ~80k, −95%), else the day's own trips against a usual day (Fri: 4,633 trips · usual ~110k, −96%). A tap
  // then reads one hour.
  const had = hrs.got.slice(hrs.from, hrs.to + 1).reduce((a, b) => a + b, 0);
  const want = hrs.usual.slice(hrs.from, hrs.to + 1).reduce((a, b) => a + b, 0);
  const amt = story.amount;
  readout.textContent = story.day === cutDay || !amt
    ? `${ddd(cutDay)} ${hrs.to === 23 ? `from ${clockText(hrs.from * 60)}` : `${clockText(hrs.from * 60)}–${clockText((hrs.to + 1) * 60)}`}: ${fmtInt(had)} trips · usual ~${compact(want)} (−${Math.round((1 - had / Math.max(1, want)) * 100)}%)`
    : `${ddd(story.day)}: ${fmtInt(amt.value)} trips · usual ~${compact(amt.expected)} (${changeLabel(amt.value / Math.max(1, amt.expected) - 1)})`;
  const at = (i: number) => {
    const d = days[Math.floor(i / 24)];
    if (!d) return;
    const hr = i % 24;
    readout.textContent = `${d.label} ${clockText(hr * 60)} · ${fmtInt(d.got[hr]!)} trips · usual ~${compact(d.usual[hr]!)}`;
  };
  svg.addEventListener('click', (e) => {
    const box = (svg as SVGSVGElement).getBoundingClientRect();
    const i = Math.floor(((e as MouseEvent).clientX - box.left) / Math.max(1, box.width) * days.length * 24);
    at(Math.max(0, Math.min(days.length * 24 - 1, i)));
  });
  const title = days.length > 1 ? `${days[0]!.label} to ${days.at(-1)!.label}, trips by hour` : `${days[0]!.label}, trips by hour`;
  return block(title, svg, readout);
}

/** The checks' rules as rows, drawn one way wherever they show (the card, its sheet, the Dropped tab): one order
 * (story.ruleOrder), one label (story.ruleUsual: "never fails", no dangling "·"), a rule told as a finding in its
 * severity, and rows past their usual range marked past a notch. */
function rulesVisual(g: Gate, findings: readonly Finding[] = [], day?: string): Element {
  const rules = ruleOrder(g.rules);
  const sevOf = (name: string) => findings.find((f) => f.kind === 'rule' && f.metric?.of === 'rule' && f.metric.name === name && (f.severity === 'alert' || f.severity === 'warn'))?.severity as 'alert' | 'warn' | undefined;
  return svgNode(ruleRows({
    rules: rules.map((r) => ({ label: RULE_TITLE(r.name), warns: r.warns, rows: r.rows, low: r.usual?.low ?? null, high: r.usual?.high ?? null, usualLabel: ruleUsual(r), sev: sevOf(r.name) ?? null })),
    aria: `Rows each rule failed${day ? ` on ${dayLabel(day)}` : ''}, against a day like it: ${rules.map((r) => `${RULE_TITLE(r.name)} ${fmtInt(r.rows)}${r.usual && r.usual.high >= 1 && r.rows > r.usual.high ? ' (past its usual range)' : ''}`).join(', ')}.`,
  }));
}

/** What a held run didn't build: the plan's own chain after the checks, unbuilt steps as pills, outputs hatched. */
function lineageVisual(g: Gate): Element | null {
  const down = new Set(downstreamOf(g.step));
  const order = state.doc.steps.map((x) => x.id).filter((x) => down.has(x) && visible(x));
  const chain: { kind: 'steps' | 'output'; label: string }[] = [];
  let run = 0;
  for (const x of order) {
    if (isOutput(x)) {
      if (run) chain.push({ kind: 'steps', label: `${run} step${run === 1 ? '' : 's'} not built` });
      run = 0;
      chain.push({ kind: 'output', label: x });
    } else run++;
  }
  if (!chain.length) return null;
  const src = loadSource() ?? 'trips';
  const today = loads.list[loads.at];
  return svgNode(heldLineage({ source: src, rows: `${fmtInt(today?.rows ?? g.rows)} rows`, step: g.step, chain, aria: `Held at ${g.step}: ${chain.filter((c) => c.kind === 'output').map((c) => c.label).join(', ')} not published from this load.` }));
}

/** The gate, told in visuals: the share against the limit and the rows against a day like it, each rule, what it held. */
function gateBlocks(g: Gate, day: string, countMax?: number, findings: readonly Finding[] = []): (Node | null)[] {
  const wd = WEEKDAY_NAMES[dateOf(day).getUTCDay()]!;
  // What the outputs keep: said only of the day on screen, whose held run left them so.
  const keep = day === viewedDay() ? stoppedWords({ refused: false, origin: g.step, shown: shownDay(), viewed: day }).tail : null;
  // Said from the figures: "most rows were missing" only when under half the rows a day like it has arrived.
  const trips = rangesOf({ of: 'trips' })?.at(day);
  const arrived = trips ? g.rows / Math.max(1, trips.expected) : null;
  const why = arrived === null ? null : arrived < 0.5 ? 'most rows were missing' : g.rows < trips!.low ? 'fewer rows than usual arrived' : null;
  return [
    g.held && g.usual && g.dropped < g.usual.low && why ? oneLine(`Fewer rows dropped than on a usual ${wd}; ${why}.`) : null,
    block('Dropped, and the limit', gateVisual(g, true, countMax)),
    block('Rows each rule failed', rulesVisual(g, findings, day)),
    g.held ? block('What it held back', lineageVisual(g), keep ? h('p', { class: 'vf-sub' }, keep.replace(/^./, (c) => c.toUpperCase())) : null) : null,
  ];
}

/** What a tap on the gate opens. */
function gateSheet(story: Story, card: string): void {
  const g = story.gate;
  if (!g) return;
  const said = pastLimit(g.rows ? g.dropped / g.rows : 0, g.limit);
  const anchor = anchorOf(story);
  openDetail(g.held ? `Held at ${g.step}: ${said} dropped` : `${g.step}: ${said} dropped`, g.held ? 'alert' : 'warn', gateBlocks(g, story.day, gateScale(story), story.findings), anchor, card, g.held ? 'notify' : story.primary);
}

/** What a tap on the checks' card opens: what the card above doesn't show. The rows dropped day by day, each day
 * against its own usual range (the card has today only), what a held run kept back, and the rows themselves a tap
 * away on Dropped. */
function checksDetail(g: Gate, story: Story, card: string, sev: Severity): (Node | null)[] {
  const day = story.day;
  // Today's tick takes the card's own severity only when more rows were dropped than a day like it drops: fewer (the
  // kept rows went missing, Fri Sep 22, 2023) is drawn plain under its band.
  const days = stripOf({ of: 'droppedRows' }, day, 28, g.usual && g.dropped > g.usual.high ? sev : undefined);
  const keep = g.held && day === viewedDay() ? stoppedWords({ refused: false, origin: g.step, shown: shownDay(), viewed: day }).tail : null;
  return [
    days.length ? block('Rows dropped, day by day', svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, unit: ' rows/day', key: STRIP_KEY, aria: `Rows the checks dropped day by day for four weeks to ${dayLabel(day)}, each against its own usual range: today ${fmtInt(g.dropped)}${g.usual ? `, usual ${fmtInt(g.usual.low)} to ${fmtInt(g.usual.high)}` : ''}.` }))) : null,
    g.held ? block('What it held back', lineageVisual(g), keep ? h('p', { class: 'vf-sub' }, keep.replace(/^./, (c) => c.toUpperCase())) : null) : null,
    h('button', { type: 'button', class: 'linkish vf-to', onclick: () => { document.querySelector('.vf-detail-wrap')?.remove(); openTab(card, 'dropped'); } }, 'The rows it dropped ›'),
  ];
}

/** A share as a bar's label says it: none, under 0.1%, or to a tenth of a point. */
const shareSaid = (x: number) => (x === 0 ? '0%' : x < 0.001 ? '<0.1%' : pct(x));

/** A coded column's values as two 100% bars, usual and today, the moved value dark and labelled by `names` (in the
 * usual bar, then today's: "Vendor 1 · Creative Mobile 29.3%", "Vendor 1 <0.1%"). */
function compositionOf(column: string, day: string, moved?: string, names?: [string, string]): Element | null {
  const vh = history?.file.values?.[column];
  if (!vh?.counts || !history) return null;
  const k = history.file.days.indexOf(day);
  const n = history.file.rows[k] ?? 0;
  if (k < 0 || !n) return null;
  const parts = vh.values.map((v, i) => ({ v, today: (vh.counts![k]![i] ?? 0) / n, usual: rangesOf({ of: 'value', column, value: v })?.at(day)?.expected ?? 0 }))
    .filter((p) => p.today > 0.001 || p.usual > 0.001 || p.v === moved).sort((a, b) => b.usual - a.usual).slice(0, 7);
  const name = (v: string) => (v === 'null' ? 'blank' : NEWS_NAMES.label(column, JSON.parse(v)));
  const [first, again] = names ?? (moved !== undefined ? [name(moved), name(moved)] : ['', '']);
  return svgNode(composition({
    bars: [
      { label: 'usual', parts: parts.map((p) => ({ name: p.v, share: p.usual, text: name(p.v), ...(p.v === moved ? { callout: `${first} ${shareSaid(p.usual)}` } : {}) })) },
      { label: 'today', parts: parts.map((p) => ({ name: p.v, share: p.today, text: name(p.v), gone: p.today === 0 && p.usual > 0.002, ...(p.v === moved ? { callout: `${again} ${shareSaid(p.today)}` } : {}) })) },
    ],
    moved, aria: `${NEWS_NAMES.column(column)}: ${parts.map((p) => `${name(p.v)} ${shareSaid(p.today)} today, usually ${shareSaid(p.usual)}`).join('; ')}.`,
  }));
}

/** What a tap on a finding opens: its visual, its day by day, one sentence, its verbs. */
function findingDetail(f: Finding, card: string): void {
  const day = newsDay();
  const body: (Node | null)[] = [findingVisual(f), chipsOf(f)];
  if (day && f.metric && f.kind !== 'volume') {
    const days = stripOf(f.metric, day, 28, f.severity);
    if (days.length) body.push(block('Day by day', svgNode(dayStrip({ days, labels: stripLabels(days), key: STRIP_KEY, aria: `${f.title}, day by day for four weeks.` }))));
  }
  if (day && f.columns?.[0] && (f.kind === 'share' || f.kind === 'gone' || f.kind === 'new') && history?.file.values?.[f.columns[0]]?.counts) body.push(block(`${NEWS_NAMES.column(f.columns[0])}, usual and today`, compositionOf(f.columns[0], day, f.values?.[0])));
  body.push(oneLine(f.detail));
  openDetail(f.title, f.severity, body, f, card);
}

/** The method, once: how a day is judged (the brief's 'How it's judged'), drawn from the day's own trips: the points
 * its range is learned from, named, and two sentences; the rest of the method one tap further. */
function judgedDetail(story: Story | null, of: 'trips' | 'dropped' = 'trips'): void {
  const day = story?.day ?? newsDay();
  // The metric in view: the day's trips, or the rows its checks dropped (the checks' card), each with today's value.
  const r = day ? rangesOf(of === 'dropped' ? { of: 'droppedRows' } : { of: 'trips' })?.at(day) : null;
  const value = of === 'dropped' ? (story?.gate?.dropped ?? null) : (story?.amount?.value ?? null);
  const what = of === 'dropped' ? 'rows dropped' : 'trips';
  const body: (Node | null)[] = [];
  const band = r ? `usual ${compact(r.low)}–${compact(r.high)}` : '';
  const wd = day ? WEEKDAY_NAMES[dateOf(day).getUTCDay()]! : '';
  if (r && day) {
    const weeks = r.guesses.find((g) => g.by === 'weeks');
    const year = r.guesses.find((g) => g.by === 'year');
    const yd = year?.from.map((x) => x.day) ?? [];
    // Last year's days as they were, and their date: the guess moves them by how this year has compared lately.
    const span = (a: string, b: string) => (a === b ? shortDay(a) : a.slice(0, 7) === b.slice(0, 7) ? `${shortDay(a)}–${Number(b.slice(8))}` : `${shortDay(a)}–${shortDay(b)}`);
    const yearLabel: [string, string] = ['last year', yd.length ? span(yd[0]!, yd.at(-1)!) : ''];
    const outside = value !== null && (value < r.low || value > r.high);
    // Coloured only outside its range; rows dropped only when more than usual (fewer is the kept rows gone missing).
    const sev = of === 'dropped' ? (story?.gate?.held && value !== null && value > r.high ? 'alert' : null) : story?.severity === 'alert' || story?.severity === 'warn' ? story.severity : null;
    body.push(svgNode(learnStrip({
      weeks: weeks?.from.map((x) => x.value) ?? [], weeksLabel: weeks ? `${weeks.from.length} ${wd}s before` : '',
      year: year?.from.map((x) => x.value) ?? [], yearLabel,
      today: { v: value, low: r.low, high: r.high, sev: outside ? sev : null },
      bandLabel: band,
      aria: `${what === 'trips' ? 'Trips' : 'Rows dropped'}: ${weeks ? `the ${weeks.from.length} ${wd}s before (${weeks.from.map((x) => `${shortDay(x.day)} ${fmtInt(x.value)}`).join(', ')})` : ''}${weeks && year ? ' and ' : ''}${year ? `the day last year (${year.from.map((x) => `${shortDay(x.day)} ${fmtInt(x.value)}`).join(', ')})` : ''}: today's range from them, ${fmtInt(r.low)} to ${fmtInt(r.high)}${value !== null ? `; today ${fmtInt(value)}` : ''}.`,
    })));
  }
  // Two sentences, as the picture has it; the rules for shares, levels and quantiles are a tap further.
  body.push(
    oneLine(r?.special
      ? `A holiday is judged against itself last year, moved by how this year has compared with last year lately.`
      : `A day is judged against the same weekday in the six weeks before and the day last year, weighted by how well each guesses.`),
    oneLine(r ? `The band is that guess give or take its typical misses: ${band.replace(/^usual /, '')} for this ${r.special ? 'day' : wd}.` : 'The band is that guess give or take its typical misses.'),
    h('details', { class: 'fold vf-more-method' }, h('summary', {}, 'More on the method'),
      h('p', { class: 'vf-sub' }, 'A share or a level is told only a typical miss past its band’s edge. Shares are over all trips, blanks included; quantiles come from a 2,000-row sample; hours count trips before the checks.')));
  openDetail(of === 'dropped' ? 'How the rows dropped are judged' : 'How it’s judged', 'ok', body);
}

/** One verb, and the others behind ⋯. */
function actionsOf(f: Finding, card: string, primary: Act | null): HTMLElement {
  const main = primary ? actButton(primary, f, card) : null;
  main?.classList.add('vf-primary');
  main?.classList.remove('small', 'quiet');
  const others = [...new Set([...f.acts, 'export' as Act])].filter((a) => a !== primary);
  const menu = h('div', { class: 'vf-menu', hidden: true }, ...others.map((a) => actButton(a, f, card)).filter((x): x is HTMLElement => !!x));
  const more = menu.childElementCount ? h('button', { type: 'button', class: 'vf-more', 'aria-label': `More actions: ${Array.from(menu.children).map((b) => b.textContent).join(', ')}`, title: Array.from(menu.children).map((b) => b.textContent).join(' · '), 'aria-expanded': 'false', onclick: (e: Event) => { menu.hidden = !menu.hidden; (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!menu.hidden)); } }, glyphEl('more', 16)) : null;
  const done = findingLog(f);
  return h('div', { class: 'vf-acts' }, main, more, menu, done.length ? h('ul', { class: 'f-log' }, ...done.map((e) => h('li', {}, logText(e)))) : null);
}

/**
 * A counted row that opens in place into compact rows, each a tap from its detail: a column's rows together, three
 * shown and the rest behind "Show all". `kinds` say in words what the rows are ("shares · times · checks"); an
 * explained row carries ↳.
 */
function foldRow(label: string, kinds: readonly string[], items: readonly Told[], card: string, open = false, explained = false, mark?: VizMark): HTMLElement {
  const list = h('div', { class: 'vf-group', hidden: !open }, ...shownRows(items, card, 3));
  const btn = h('button', { type: 'button', class: 'vf-fold', 'aria-expanded': String(open), onclick: () => { list.hidden = !list.hidden; btn.setAttribute('aria-expanded', String(!list.hidden)); } },
    explained ? glyphEl('explained', 14) : mark ? glyphEl(mark, 14) : h('span', { class: 'g-slot' }),
    h('span', { class: 'vf-fold-t' }, label, kinds.length ? h('span', { class: 'vf-kinds' }, kinds.join(' · ')) : null),
    h('span', { class: 'vf-chev' }, glyphEl('chev', 14)));
  return h('div', { class: 'vf-foldwrap' }, btn, list);
}

/** Findings as compact rows, a column's side by side (Passengers 1 to 5 together) in the order the column first comes,
 * the first `n` shown and the rest behind "Show all". */
function shownRows(items: readonly Told[], card: string, n: number, bySeverity = false): HTMLElement[] {
  // With `bySeverity`, a column's rows go together within each severity as found, the worst first.
  const band = (f: Told) => (bySeverity ? SEV_RANK[f.was] : 0);
  const group = (f: Told) => `${band(f)}|${f.columns?.[0] ?? f.key}`;
  const firstAt = new Map<string, number>();
  items.forEach((f, i) => { if (!firstAt.has(group(f))) firstAt.set(group(f), i); });
  const sorted = items.map((f, i) => ({ f, i })).sort((a, b) => band(a.f) - band(b.f) || firstAt.get(group(a.f))! - firstAt.get(group(b.f))! || a.i - b.i).map((x) => x.f);
  const rows = sorted.map((f) => compactRow(f, card));
  const rest = rows.slice(n);
  rest.forEach((r) => (r.hidden = true));
  const all: HTMLElement | null = rest.length ? h('button', { type: 'button', class: 'vf-all', onclick: () => { rest.forEach((r) => (r.hidden = false)); all!.remove(); } }, `Show all ${rows.length}`) : null;
  return all ? [...rows, all] : rows;
}

/** A finding's title split into what, today and usual: "Passengers 1: 0.2% (usually 70–75%)", "Checks dropped 46%
 * (usually 4.4–7.2%)". Null when it has no usual to show. */
function todayUsual(title: string): { name: string; today: string; usual: string } | null {
  const m = /^(.*?):\s*(.+?)\s*\(usually (.+)\)$/.exec(title) ?? /^(.*?)\s(\S+%)\s\(usually (.+)\)$/.exec(title);
  return m ? { name: m[1]!, today: m[2]!, usual: m[3]! } : null;
}

/** A finding in a folded group: its mark as it was (grey: the cause explains it), its name, today against its usual
 * (a micro visual for a share, both numbers in words), no buttons; a tap opens it. */
function compactRow(f: Told, card: string): HTMLElement {
  const m = sevMark(f.was === 'ok' ? 'note' : f.was);
  const share = (f.kind === 'share' || f.kind === 'gone' || f.kind === 'missing') && f.range && f.value !== undefined;
  const w = share ? shareWords(f.value!, f.range!.low, f.range!.high) : null;
  const parts = share ? { name: f.title.replace(/:.*$/, ''), today: f.value === 0 ? 'none' : w!.value, usual: w!.range } : todayUsual(f.title);
  return h('button', { type: 'button', class: `vf-row${f.tier === 'cause' || f.tier === 'standalone' ? '' : ' explained'}`, id: `finding-${f.key}`, 'aria-label': f.title, onclick: () => findingDetail(f, card) },
    m ? glyphEl(m === 'note' ? 'note' : m, 13) : h('span', { class: 'g-slot' }), h('span', { class: 'vf-row-t' }, parts?.name ?? f.title),
    share ? svgNode(microDot({ today: f.value!, low: f.range!.low, high: f.range!.high, gone: f.value === 0 })) : null,
    parts ? h('span', { class: 'vf-row-v' }, h('b', {}, parts.today), h('span', { class: 'vf-row-u' }, `usual ${parts.usual}`)) : null,
    f.acknowledged ? glyphEl('ack', 13) : null, h('span', { class: 'vf-chev' }, glyphEl('chev', 12)));
}

/** The day's cause as one card (ADR 0008): head, chip, the amount line, the hero, the gate, the reach, folds, one verb. */
function causeCard(story: Story, card: string): HTMLElement {
  const anchor = anchorOf(story);
  const m = sevMark(story.severity);
  const calm = story.state === 'calm' || story.state === 'notes' || story.state === 'recovery';
  const src = loadSource();
  const outs = src ? downstreamOf(src).filter((x) => isOutput(x) && visible(x)) : [];
  const g = story.gate;
  const held = !!g?.held;
  const hero = heroOf(story);
  const amount = amountVisual(story);
  const info = h('button', { type: 'button', class: 'vf-info', 'aria-label': 'How it’s judged', onclick: () => judgedDetail(story) }, glyphEl('info', 16));
  // Once the source has been told on a day of the episode, the card says so and its verb moves on (ADR 0008 §6).
  const told = toldOf(story);
  const primary = told && story.primary === 'notify' ? 'incident' : story.primary;
  const ep = story.episode;
  return h('section', { class: `vf-card ${story.state}`, ...(anchor ? { id: `finding-${anchor.key}` } : {}) },
    h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head', role: 'status', 'aria-live': 'polite' }, m && !calm ? glyphEl(m, 18) : '', story.head)),
    // An episode's chip draws its days so far, each its trips against a usual day, so day 3 reads apart from day 2.
    story.chip ? h('button', { type: 'button', class: 'vf-chip-btn', 'aria-label': `${story.chip}${ep ? `: ${ep.trend.map((d) => `${WEEKDAY_NAMES[dateOf(d.day).getUTCDay()]!.slice(0, 3)} ${Math.round((d.trips / Math.max(1, d.expected)) * 100)}% of a usual day`).join(', ')}${ep.short ? `; about ${fmtInt(ep.short.estimate)} trips short so far` : ''}` : ''}. Open.`, onclick: () => causeDetail(story, card) },
      ep && ep.trend.length > 1 ? svgNode(trendPips({ days: ep.trend })) : '', story.chip, glyphEl('chev', 13)) : null,
    told ? h('p', { class: 'vf-told' }, glyphEl('ack', 14), told) : null,
    story.labels.after ? h('p', { class: 'vf-after' }, story.labels.after) : null,
    amount ? h('div', { class: 'vf-amount' }, h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.head}: open`, onclick: () => causeDetail(story, card) }, amount), info) : info,
    hero ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.head}: open`, onclick: () => causeDetail(story, card) }, hero) : null,
    story.hero === 'hours' && story.split ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.split.name} and everything else: open`, onclick: () => causeDetail(story, card) }, splitVisual(story)) : null,
    // The weather after the numbers, as a plain note: context, never a cause, and nothing to tap (ADR 0008 §6).
    story.labels.context ? h('p', { class: 'vf-wx' }, story.labels.context) : null,
    // The five health cells, under the day's visuals so they stay in the first screen on a day with something wrong.
    healthRow(story, card),
    // The checks on every day with something wrong, passed or held, and on a near miss (ADR 0008 §10).
    g && (held || g.near || (story.severity === 'alert' && !calm)) && story.hero !== 'gate' ? h('button', { type: 'button', class: 'vf-sec', id: 'vf-gate', onclick: () => gateSheet(story, card) }, h('p', { class: 'vf-sec-h' }, held ? glyphEl('held', 14) : '', held ? 'Checks held' : g.near ? 'Checks near the limit' : 'Checks passed'), gateVisual(g, false, gateScale(story))) : null,
    // What the day's outputs are: never "published" alone, which reads as good news; a tap names them.
    story.severity === 'alert' && !calm && outs.length ? h('button', { type: 'button', class: 'vf-reach', 'aria-label': `${reachLabel(story, outs.length)}: ${outs.join(', ')}. Open the list.`, onclick: () => outputsDetail(story, outs) },
      svgNode(reachIcon({ n: outs.length, state: held ? 'held' : 'published' })), reachLabel(story, outs.length), h('span', { class: 'vf-chev' }, glyphEl('chev', 14))) : null,
    story.labels.follows ? foldRow(story.labels.follows, story.labels.kinds, story.follows, card, profileOf(card) !== undefined, true) : null,
    story.labels.sameDay ? foldRow(story.labels.sameDay, [], story.sameDay, card, profileOf(card) !== undefined, true) : null,
    anchor && primary ? actionsOf(anchor, card, primary) : null);
}

/** Whether the source was told on an earlier day of the episode a day is part of. */
function toldBefore(day: string): boolean {
  const since = storyFor(day)?.episode?.since;
  return !!since && dataLog.entries.some((e) => e.act === 'notify' && e.day >= since && e.day < day);
}

/** Whether the source was told on a day of the story's episode, today or before: "Source told on Fri". */
function toldOf(story: Story): string | null {
  // Said by the load's day, as the app's days are: the clock time is in the record's line under the verbs.
  return toldLine(dataLog.entries, story.episode?.since ?? story.day, story.day);
}

/**
 * The outputs a day's load reaches, named (ADR 0008 §10): each ticked when published from it, hatched when not, with
 * its rows, a tap from its own card; one line says what they were built from, or what they keep.
 */
function outputsDetail(story: Story, outs: string[]): void {
  const held = !!story.gate?.held;
  const l = lacked(story);
  const keep = held && story.day === viewedDay() ? stoppedWords({ refused: false, origin: story.gate!.step, shown: shownDay(), viewed: story.day }).tail : null;
  const list = h('ul', { class: 'vf-outlist' }, ...outs.map((o) => {
    const n = held ? undefined : nodeOf(o);
    return h('li', {}, h('button', { type: 'button', onclick: () => (document.querySelector('.vf-detail-wrap')?.remove(), select(o)) },
      h('span', { class: `o-box${held ? ' held' : ''}`, 'aria-hidden': 'true' }, held ? '' : glyphEl('ack', 14)),
      h('span', { class: 'o-name' }, o),
      h('span', { class: 'o-rows' }, held ? 'not published' : n?.rows !== undefined ? `${fmtInt(n.rows)} rows` : 'published'),
      glyphEl('chev', 13)));
  }));
  openDetail(reachLabel(story, outs.length), story.severity, [oneLine(held ? (keep ? keep.replace(/^./, (c) => c.toUpperCase()) : null) : (l?.long ?? null)), list]);
}

/**
 * The health row (ADR 0008 §6): its heading, and five cells, each the worst of its kinds, ↳ where the day's cause groups
 * them, no mark where nothing is out of the ordinary; the same row on every day. Each cell opens what it measured: its
 * check in words and visuals, and every finding of its kinds, the ones the cause absorbed too.
 */
function healthRow(story: Story, card: string): HTMLElement {
  return h('div', { class: 'vf-healthwrap' },
    h('p', { class: 'vf-health-h', 'aria-hidden': 'true' }, story.labels.health),
    h('nav', { class: 'vf-health', 'aria-label': `${story.labels.health}: five measures of the day’s trips` }, ...story.health.map((c) => {
      const m: VizMark | null = c.explained ? 'explained' : c.severity === 'alert' ? 'alert' : c.severity === 'warn' ? 'warn' : c.severity === 'note' ? 'note' : null;
      const said = c.explained ? `${c.follows} grouped under the day’s cause${c.sameDay ? `, ${c.sameDay} more came the same day` : ''}` : c.severity === 'alert' ? 'something’s wrong' : c.severity === 'warn' ? 'unusual' : c.severity === 'note' ? 'a note' : 'normal';
      return h('button', { type: 'button', class: `vf-cell ${c.explained ? 'explained' : c.severity ?? 'ok'}`, 'aria-label': `${CELL_NAMES[c.cell]}: ${said}. Open.`, onclick: () => healthDetail(story, c.cell, card) }, m ? glyphEl(m, 14) : '', h('span', { 'aria-hidden': 'true' }, CELL_NAMES[c.cell]));
    })));
}

/** What a health cell measures, in a line under its title. */
const CELL_WHAT: Record<Cell, string> = {
  file: 'The day’s file, against the data’s published list',
  amount: 'The day’s trips, against a day like it',
  hours: 'Trips each hour, against a usual day',
  values: 'Each coded value’s share of the trips',
  shape: 'Each measure’s spread, and the times of day',
};

/** A health cell, opened: what it measures, drawn, and each finding of its kinds a tap from its own detail. */
function healthDetail(story: Story, cell: Cell, card: string): void {
  const c = story.health.find((x) => x.cell === cell)!;
  const day = story.day;
  const k = history ? history.file.days.indexOf(day) : -1;
  const kinds = CELL_KINDS[cell];
  const rank = (f: Told) => (f.tier === 'cause' || f.tier === 'standalone' ? 0 : 1);
  const mine = story.findings.filter((f) => kinds.includes(f.kind) && f.was !== 'ok').sort((a, b) => rank(a) - rank(b) || SEV_RANK[a.was] - SEV_RANK[b.was] || b.score - a.score);
  const body: (Node | null)[] = [h('p', { class: 'vf-sub' }, CELL_WHAT[cell])];
  if (cell === 'file') {
    const load = loads.list.find((l) => l.day === day);
    const checked = !!(load && integrity.checks.get(load.file));
    body.push(svgNode(chain({ nodes: ['list', 'file', 'load'], broken: 99, aria: checked ? 'The day’s file hashes to what the data’s list publishes, and the load was read from it.' : 'The day’s file was read; no list was there to check it against.' })));
    if (k >= 0) body.push(oneLine(`${fmtInt(history!.file.rows[k]!)} trips in the day’s file${checked ? ', its bytes as published' : ''}.`));
  }
  if (cell === 'amount') {
    body.push(amountVisual(story));
    const days = stripOf({ of: 'trips' }, day, 28, story.severity);
    if (days.length) body.push(svgNode(dayStrip({ days, labels: stripLabels(days), key: STRIP_KEY, unit: '/day', aria: `Trips day by day for four weeks to ${dayLabel(day)}, each against its own usual range.` })));
  }
  if (cell === 'hours' && history && k >= 0) {
    const r = rangesOf({ of: 'trips' })?.at(day);
    const raw = r ? usualHours(history, k, r.expected) : null;
    const got = history.file.hours?.[k];
    if (r && raw && got) {
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      const usual = story.hours?.usual ?? raw.map((x) => (x / sum) * r.expected);
      const wd = WEEKDAY_NAMES[dateOf(day).getUTCDay()]!;
      body.push(svgNode(hourBars({ got, usual, ...(story.hours ? { cut: story.hours.from, to: story.hours.to, cutLabel: clockText(story.hours.from * 60) } : {}), ghostLabel: `usual ${wd}`, aria: `Trips by hour on ${dayLabel(day)}, against a usual ${wd}${story.hours ? `: short from ${clockText(story.hours.from * 60)}` : ''}.` })));
    }
  }
  if (mine.length) body.push(h('div', { class: 'vf-list' }, ...shownRows(mine, card, 6, true)));
  // Nothing found: said in words only where no visual above says it.
  else body.push(oneLine(cell === 'file' || cell === 'amount' ? null : { hours: 'Trips every hour.', values: 'Values as usual.', shape: 'Spreads and times as usual.' }[cell]));
  const sev: Severity = c.explained ? 'ok' : c.severity ?? 'ok';
  openDetail(CELL_NAMES[cell], sev, body);
}

/** A standalone finding as a card: its mark and title, its visual, one verb. */
const storyCard = (f: Told, card: string): HTMLElement => findingCard(f, card);

/** The day's news for the trips and their profile: the story, drawn. */
function storyNews(card: string, story: Story): HTMLElement[] {
  const out: HTMLElement[] = [causeCard(story, card)];
  for (const f of story.stories) out.push(storyCard(f, card));
  const rows: HTMLElement[] = [];
  // Each row carries the mark its findings carry in the health row, so a dot there is "a note" here, said once.
  if (story.labels.more) rows.push(foldRow(story.labels.more, [], story.more, card, false, false, story.more.some((f) => f.severity === 'alert') ? 'alert' : 'warn'));
  if (story.labels.notes) rows.push(foldRow(story.labels.notes, [], story.notes, card, false, false, 'note'));
  if (rows.length) out.push(h('div', { class: 'vf-rows' }, ...rows));
  return out;
}

/** The checks' news: held or passed, the gate, and the rules. */
function checksNews(card: string, story: Story): HTMLElement[] {
  const g = story.gate;
  if (!g) return [];
  const findings = story.findings.filter((f) => (f.kind === 'dropped' || f.kind === 'rule') && f.severity !== 'ok');
  const worst: Severity = g.held ? 'alert' : findings.reduce<Severity>((w, f) => (SEV_RANK[f.severity] < SEV_RANK[w] ? f.severity : w), 'ok');
  const m = sevMark(worst);
  // Said as its bar says it (8.6%, not 9% over a bar labelled 8.6%), never equal to the limit it passed or missed.
  const head = `${g.held ? 'Held' : 'Passed'}: ${gateLabels(g).said} dropped`;
  const anchor = findings[0] ? { ...findings[0], title: head } : null;
  return [h('section', { class: `vf-card ${g.held ? 'wrong' : worst === 'warn' ? 'unusual' : 'calm'}`, role: 'status', ...(anchor ? { id: `finding-${anchor.key}` } : {}) },
    h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head' }, m && worst !== 'note' ? glyphEl(g.held ? 'held' : m, 18) : '', head), h('button', { type: 'button', class: 'vf-info', 'aria-label': 'How the rows dropped are judged', onclick: () => judgedDetail(story, 'dropped') }, glyphEl('info', 16))),
    h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${head}: open`, onclick: () => openDetail(head, worst, checksDetail(g, story, card, worst)) }, gateVisual(g, true, gateScale(story))),
    rulesVisual(g, story.findings, story.day),
    anchor ? actionsOf(anchor, card, g.held ? 'notify' : anchor.acts[0] ?? null) : null)];
}

async function newsTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const box = h('div', { class: 'news-tab' });
  const kind = historyOf(id) ?? (profileOf(card) ? historyOf(profileOf(card)!.of) : null);
  // The trips and their checks tell the day's story, drawn (ADR 0008); a refused file still says so first.
  const storyDay = newsDay();
  // A refused file (ADR 0006, drawn as ADR 0008 has it): the chain with its broken link, both hash prefixes, one verb.
  if (state.failed?.file && (kind === 'trips' || sourceIds().has(id))) {
    const c = state.failed.file;
    const src = loadSource();
    const outs = src ? downstreamOf(src).filter((x) => isOutput(x) && visible(x)) : [];
    const f = integrityNews(src ?? dataOf(card))[0] ?? null;
    box.append(h('section', { class: 'vf-card wrong', role: 'status', ...(f ? { id: `finding-${f.key}` } : {}) },
      h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head' }, glyphEl('alert', 18), c.class === 'not-checked' ? 'File not fetched' : 'File refused: bytes don’t match'), h('button', { type: 'button', class: 'vf-info', 'aria-label': 'How files are checked', onclick: () => openTab(card, 'integrity') }, glyphEl('info', 16))),
      svgNode(chain({ nodes: ['list', 'file', 'load', 'outputs'], broken: 0, aria: `The day's file doesn't hash to what the data's list publishes: ${c.expected ? `listed ${c.expected.slice(0, 8)}` : ''}${c.actual ? `, got ${c.actual.slice(0, 8)}` : ''}. Nothing was built from it.` })),
      c.expected || c.actual ? h('p', { class: 'vf-hashes' }, h('span', {}, 'listed ', h('code', {}, (c.expected ?? '—').slice(0, 8))), h('span', { class: 'vf-ne' }, '≠'), h('span', {}, 'got ', h('code', {}, (c.actual ?? '—').slice(0, 8)))) : null,
      outs.length ? h('div', { class: 'vf-reach held' }, h('span', { class: 'vf-outs', 'aria-hidden': 'true' }, ...outs.slice(0, 3).map(() => h('i', {}))), `${outs.length} outputs not built`) : null,
      f ? actionsOf(f, card, 'refetch') : null));
    return box;
  }
  const story = storyDay && (kind === 'trips' || kind === 'checks') && !state.failed?.file ? storyFor(storyDay) : null;
  if (story) {
    // The checks' rows on screen may be another run's on a held day: their table is on the Dropped tab, labelled.
    box.append(...(kind === 'checks' ? checksNews(card, story) : storyNews(card, story)));
    return box;
  }
  // The run on this load stopped: a gate held (a check dropping more than it may), so nothing after it was built from
  // this load, and the rows below are the last day that passed, under their date bar (ADR 0008 §10).
  if (state.failed) {
    const now = viewedDay();
    const refused = state.failed.file;
    const origin = state.failed.origin;
    const after = !origin || downstreamOf(origin).includes(dataOf(card));
    const g = storyDay ? storyFor(storyDay)?.gate : null;
    const said = g?.held && g.step === origin ? gateLabels(g) : null;
    if (after) box.append(h('div', { class: 'verdict alert stopped' },
      h('p', { class: 'v-day' }, now ? dayLabel(now) : ''),
      h('h3', { class: 'v-head' }, glyphEl('held', 16), refused ? 'Not built: the file was refused' : origin ? `Not built: held at ${origin}` : 'The run stopped'),
      h('p', { class: 'v-line' }, refused ? describeFile(refused).title : said ? `${said.share}${said.limit ? ` · ${said.limit}` : ''}` : state.failed.message),
      origin && origin !== dataOf(card) ? h('button', { type: 'button', class: 'btn small', onclick: () => select(origin) }, `Open ${origin} ›`) : null));
    const bar = rowsFromBar();
    if (bar) box.append(bar);
  }
  // A step after the load, built from a day with something wrong, says what its load lacked above its own rows' news
  // (ADR 0008 §10): of the day its rows are, the viewed one or, on a held day, the last that passed (itself short, at
  // times: Thu Sep 21, 2023 under Fri 22).
  const src = loadSource();
  const rowsDay = shownDay() ?? newsDay();
  const fromStory = !kind && src && downstreamOf(src).includes(dataOf(card)) && rowsDay ? storyFor(rowsDay) : null;
  const short = fromStory && !fromStory.gate?.held ? lacked(fromStory) : null;
  if (short) box.append(h('div', { class: 'verdict alert' },
    h('p', { class: 'v-day' }, dayLabel(rowsDay!)),
    h('h3', { class: 'v-head' }, glyphEl('alert', 16), short.long),
    h('p', { class: 'v-line' }, `Its load: ${fromStory!.head}`),
    h('button', { type: 'button', class: 'btn small', onclick: () => select(src!) }, `Open ${src} ›`)));
  if (!kind) await tableNewsFor(id, who);
  // A table that measures an effect against a baseline (weather_effect, against dry hours): drawn, or said to have
  // nothing to measure on a day whose rows are all the baseline (ADR 0008 §12).
  const effect = !kind ? await effectFor(id, who) : null;
  const findings = cardNews(card);
  const day = newsDay();
  const telling = findings.filter((f) => f.severity !== 'ok');
  const top = telling[0] ?? findings[0];
  if (top) {
    const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
    const [alerts, warns, notes] = [count('alert'), count('warn'), count('note')];
    // A day the history follows is judged as a day; a table on its own, as what it holds now.
    const normal = kind ? 'A normal day' : short ? 'Nothing odd in its own rows' : 'Nothing out of the ordinary';
    const head = alerts ? 'Something’s wrong' : warns ? `${warns === 1 ? 'One thing' : `${warns} things`} to look at` : notes ? `${normal}, with ${notes === 1 ? 'a note' : `${notes} notes`}` : normal;
    const calm = findings.find((f) => f.severity === 'ok');
    const sev = alerts ? 'alert' : warns ? 'warn' : notes ? 'note' : 'ok';
    const idle = effect && !effect.measured && !alerts && !warns;
    box.append(h('div', { class: `verdict ${sev}` },
      h('p', { class: 'v-day' }, kind && day ? `${dayLabel(day)}${loads.list[loads.at]?.note ? ` · ${loads.list[loads.at]!.note}` : ''}` : kind ? '' : 'From its rows on this run'),
      h('h3', { class: 'v-head' }, idle ? `No effect to measure ${spanOf(id) === 'today' ? 'today' : 'here'}` : head),
      h('p', { class: 'v-line' }, idle ? `Its ${plural(effect.total, 'row')} ${effect.total === 1 ? 'is' : 'are all'} ${effect.baseline}: nothing to compare with.` : alerts || warns ? `${listed([alerts ? plural(alerts, 'alert') : '', warns ? plural(warns, 'unusual thing') : '', notes ? plural(notes, 'note') : ''].filter(Boolean))}. The first: ${top.title}.` : (calm ?? top).detail)));
    if (effect?.measured) box.append(effectVisual(id, effect));
    if (kind === 'trips' && day) box.append(healthStrip(card, day, findings));
    for (const f of telling) box.append(findingCard(f, card));
  }
  // What the step did with the rows: in, out, and how (an input's arrival is its File cell, not a panel).
  const panel = sourceIds().has(id) ? null : await changePanel(id, who);
  if (panel) box.append(h('div', { class: 'part did' }, panel.box));
  if (!top && !panel) box.append(h('p', { class: 'foot' }, 'Run the flow to see what this step does.'));
  return box;
}

/** The trips' health at a glance: arrived, amount, complete, values, shape; each a tap from what tells it. */
function healthStrip(card: string, day: string, findings: Finding[]): HTMLElement {
  const k = history!.file.days.indexOf(day);
  const worst = (kinds: Finding['kind'][]) => findings.filter((f) => kinds.includes(f.kind) && f.severity !== 'ok').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0];
  const rows: [string, Finding | undefined, string][] = [
    ['Arrived', findings.find((f) => f.kind === 'integrity'), k >= 0 ? `${fmtInt(history!.file.rows[k]!)} trips in the day’s file${integrity.checks.get(loads.list[loads.at]?.file ?? '') ? ', its bytes as published' : ''}` : 'no file'],
    ['Amount', worst(['volume']), 'a normal amount for the day'],
    ['Complete', worst(['hours']), 'trips every hour'],
    ['Values', worst(['gone', 'share', 'new', 'pair', 'missing']), 'values as usual'],
    ['Shape', worst(['shape', 'schema']), 'as usual'],
  ];
  return h('div', { class: 'health', role: 'list' }, ...rows.map(([name, f, calm]) =>
    h('button', { type: 'button', role: 'listitem', class: `hl ${f?.severity ?? 'ok'}`, disabled: !f, onclick: () => f && document.getElementById(`finding-${f.key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
      h('span', { class: 'hl-dot', 'aria-hidden': 'true' }), h('span', { class: 'hl-name' }, name), h('span', { class: 'hl-what' }, f ? f.title : calm))));
}

/** A finding as a card (ADR 0008): its mark and title, its visual (or, with none, its one sentence), one verb; a tap
 * opens its detail. */
function findingCard(f: Finding, card: string): HTMLElement {
  const m = sevMark(f.severity);
  const vis = findingVisual(f);
  return h('article', { class: `vf-story ${f.severity}`, id: `finding-${f.key}` },
    h('button', { type: 'button', class: 'vf-story-h', onclick: () => findingDetail(f, card) }, m ? glyphEl(m, 15) : '', h('span', {}, f.title), h('span', { class: 'vf-chev' }, glyphEl('chev', 13))),
    vis ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${f.title}: open`, onclick: () => findingDetail(f, card) }, vis) : (chipsOf(f) ?? oneLine(f.detail)),
    f.acts.length ? actionsOf(f, card, f.acts[0] ?? null) : null);
}

/** Where a normal range comes from, in a line: the band under a finding's chart. */
function rangeFrom(r: NormalRange): string {
  if (r.special) return `The band: ${r.special} last year, moved by how this year has compared with last year lately${r.scale === 'count' ? ' and to this year’s weekday' : ''}, give or take how far that guess has missed on holidays.`;
  const by = r.guesses.map((g) => `${g.by === 'weeks' ? 'the same weekday over the six weeks before' : 'its day last year'} (${Math.round(g.weight * 100)}%)`);
  return `The band: what a day like it has, from ${listed(by)}, weighted by how well each has been guessing; give or take three typical misses.`;
}

/** What a finding reaches: the published datasets built from its rows, for something wrong or unusual. */
function affects(f: Finding, card: string): HTMLElement | null {
  if (f.severity !== 'alert' && f.severity !== 'warn') return null;
  const from = f.table ?? (f.kind === 'dropped' || f.kind === 'rule' ? history?.file.step : f.kind === 'weather' ? weatherSource() : undefined) ?? dataOf(card);
  const out = downstreamOf(from).filter((x) => isOutput(x) && visible(x));
  if (!out.length) return null;
  const named = out.slice(0, 3).join(', ') + (out.length > 3 ? ` and ${out.length - 3} more` : '');
  return h('p', { class: 'f-affects' }, h('b', {}, 'Reaches: '), `${plural(out.length, 'published dataset')} built from these rows, ${named}.`);
}

/** How a metric's numbers are said. */
function metricFormat(m: Metric): (v: number) => string {
  if (m.of === 'trips') return fmtInt;
  if (m.of === 'median' || m.of === 'quantile') {
    const kind = history?.file.kinds[history.file.columns.indexOf(m.column)];
    const p = loadSource() ? meaningsOf(loadSource()!)(m.column) : undefined;
    return kind === 'time' ? clockText : (v) => inUnit(fmtNum(v), v, p);
  }
  return pct;
}

/** A metric's last four weeks and the day, against their normal ranges: small, for a finding or a column. */
function sparkBand(m: Metric, fmt: (v: number) => string): SVGSVGElement | null {
  const ranges = rangesOf(m);
  const day = newsDay();
  if (!ranges || !day) return null;
  const days = daysFrom(dayPlus(day, -27), day);
  const [W, H, P] = [300, 64, 3];
  const pts = days.map((d) => ({ d, v: ranges.value(d), r: ranges.at(d) }));
  const all = pts.flatMap((p) => [p.v, p.r?.low, p.r?.high]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (all.length < 2) return null;
  let [lo, hi] = [Math.min(...all), Math.max(...all)];
  if (hi === lo) [lo, hi] = [lo - 1, hi + 1];
  // Room on the right for the day's number, beside its dot.
  const R = 52;
  const X = (i: number) => P + (i * (W - R - 2 * P)) / (days.length - 1);
  const Y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img', 'aria-label': `The last four weeks and ${dayLabel(day)}: the band is each day's normal range` }) as SVGSVGElement;
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) svg.append(s('path', { class: 'band', d: `M${run.map((i) => `${X(i).toFixed(1)},${Y(pts[i]!.r!.high).toFixed(1)}`).join('L')}L${[...run].reverse().map((i) => `${X(i).toFixed(1)},${Y(pts[i]!.r!.low).toFixed(1)}`).join('L')}Z` }));
    run = [];
  };
  pts.forEach((p, i) => (p.r ? run.push(i) : flush()));
  flush();
  const line = pts.map((p, i) => (p.v === null ? null : `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`)).filter(Boolean);
  if (line.length > 1) svg.append(s('polyline', { class: 'line', points: line.join(' ') }));
  pts.forEach((p, i) => {
    if (p.v === null) return;
    const off = p.r && ranges.place(p.r, p.v) !== 'within';
    if (off || i === pts.length - 1) svg.append(s('circle', { class: `pt${off ? ' out' : ''}${i === pts.length - 1 ? ' focus' : ''}`, cx: X(i).toFixed(1), cy: Y(p.v).toFixed(1), r: i === pts.length - 1 ? 3.5 : 2.5 }));
  });
  const last = pts.at(-1)!;
  if (last.v !== null) svg.append(s('text', { class: 'tick spark-now', x: (X(pts.length - 1) + 7).toFixed(1), y: Math.min(H - 2, Math.max(10, Y(last.v) + 4)).toFixed(1) }, fmt(last.v)));
  return svg;
}

/** A coded column's values today, each against its share on a day like it, the new ones marked. */
function valuesStory(column: string, m: PropertyType | undefined): HTMLElement | null {
  const vh = history?.file.values?.[column];
  const day = newsDay();
  if (!vh?.counts || !day) return null;
  const k = history!.file.days.indexOf(day);
  const rows = history!.file.rows[k] ?? 0;
  const items = vh.values.map((key, i) => ({ key, i, n: vh.counts![k]![i] ?? 0 })).filter((x) => x.n > 0 || (vh.first[x.i]! <= k && vh.last[x.i]! >= k - 7));
  if (!items.length) return null;
  const said = (key: string) => NEWS_NAMES.value(column, JSON.parse(key));
  return h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'Its values today, against a day like it'),
    h('ul', { class: 'values' }, ...items.map(({ key, i, n }) => {
      const ranges = rangesOf({ of: 'value', column, value: key });
      const r = ranges?.at(day);
      const share = rows ? n / rows : 0;
      const place = r && ranges ? ranges.place(r, share) : null;
      const isNew = vh.first[i] === k && k >= history!.file.warmup;
      return h('li', { class: place && place !== 'within' ? 'off' : '' },
        h('span', { class: 'v-name' }, said(key), isNew ? h('span', { class: 'new-tag' }, 'new') : null),
        h('span', { class: 'v-share' }, `${pct(share)}`),
        h('span', { class: 'v-normal' }, r ? `usually ${pct(r.low)}–${pct(r.high)}` : isNew ? 'never seen before' : ''));
    })),
    h('p', { class: 'foot' }, `${plural(vh.values.length, 'value')} in ${plural(history!.file.days.length, 'day')} of history.`));
  void m;
}

// ------------------------------------------------------------------ tabs: dropped

async function droppedTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const box = h('div', { class: 'dropped-tab' });
  const day = newsDay();
  // The day's checks from the history: the share against the limit, the rows against a day like it, rule by rule.
  const story = day && historyOf(id) === 'checks' ? storyFor(day) : null;
  if (story?.gate) {
    const g = story.gate;
    box.append(gateVisual(g, true, gateScale(story)),
      rulesVisual(g, story.findings, day!));
    const reasons = ruleReasons(id);
    box.append(h('details', { class: 'vf-why' }, h('summary', {}, 'What each check tests'),
      h('ul', { class: 'rule-list' }, ...history!.file.rules.map((r) => h('li', {}, h('div', { class: 'rl-head' }, h('b', {}, RULE_TITLE(r.name)), r.onFail === 'warn' ? h('span', { class: 'warns' }, 'warns, keeps') : null), h('p', { class: 'rl-why' }, reasons.get(r.name) ?? r.check))))));
  }
  // The rows on screen: this load's run, or, when the checks held it, the last run that finished, labelled as such.
  const panel = await changePanel(id, who);
  if (panel) {
    // Rows of another day under a full-width date bar: the gate above is the day's own, never mixed with them.
    const bar = rowsFromBar();
    box.append(h('div', { class: `part did${bar ? ' stale' : ''}` }, bar, panel.box));
  }
  return box;
}

// ------------------------------------------------------------------ tabs: odd rows

async function oddTab(card: string, id: string, who: string): Promise<HTMLElement> {
  const nv = await nodeView(id, who);
  if (typeof nv === 'string') return h('p', { class: 'foot' }, nv);
  const q = await qualityOf(nv.insp, nv.i, who);
  if (!q) return h('p', { class: 'foot' }, 'Closed.');
  const meanings = meaningsOf(id);
  const box = h('div', { class: 'odd-tab' });
  // The extremes over every row, which a sample can miss: each measure's smallest and largest, where they are far out.
  // The impossible first (ADR 0008): values over every row far beyond the column's spread, drawn past a break.
  const far = q.profiles.filter((p) => p.kind === 'measure' && p.quantiles && typeof p.facts.max === 'number' && typeof p.facts.min === 'number').flatMap((p) => {
    const qn = p.quantiles!;
    const span = Math.max(1e-9, qn.p99 - qn.p01);
    const out: { title: string; svg: Element }[] = [];
    const m = meanings(p.name);
    const name = m?.title ?? p.name;
    const say = (v: number) => inUnit(fmtNum(v), v, m);
    if ((p.facts.max as number) > qn.p99 + 10 * span) out.push({ title: `${name}: ${say(p.facts.max as number)}`, svg: svgNode(farStrip({ lowLabel: say(qn.p01), highLabel: say(qn.p99), valueLabel: say(p.facts.max as number), aria: `${name} as high as ${say(p.facts.max as number)}, where nearly every row is between ${say(qn.p01)} and ${say(qn.p99)}.` })) });
    if ((p.facts.min as number) < qn.p01 - 10 * span) out.push({ title: `${name}: ${say(p.facts.min as number)}`, svg: svgNode(farStrip({ lowLabel: say(qn.p01), highLabel: say(qn.p99), valueLabel: say(p.facts.min as number), below: true, aria: `${name} as low as ${say(p.facts.min as number)}, where nearly every row is between ${say(qn.p01)} and ${say(qn.p99)}.` })) });
    return out;
  });
  if (far.length) box.append(h('section', { class: 'vf-card unusual' },
    h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head' }, glyphEl('warn', 18), far.length === 1 ? 'A value far beyond the rest' : `${far.length} values far beyond the rest`)),
    ...far.flatMap((x) => [h('p', { class: 'vf-sec-h' }, x.title), x.svg])));
  box.append(h('div', { class: 'verdict note' },
    h('h3', { class: 'v-head' }, q.odd.length ? `${plural(q.odd.length, 'row')} stand${q.odd.length === 1 ? 's' : ''} out of ${fmtInt(q.sample.length)} sampled` : 'No row stands out'),
    h('p', { class: 'v-line' }, `Scored on ${listed(q.measures.map((c) => meanings(c)?.title ?? c))} together.`)));
  const odd = oddRows(q, meanings);
  const openOdd = (k: number) => {
    const d = odd.querySelector('details.fold') as HTMLDetailsElement | null;
    if (d) d.open = true;
    const track = odd.querySelector('.records') as HTMLElement | null;
    const c = track?.children[k] as HTMLElement | undefined;
    if (track && c) track.scrollTo({ left: c.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    odd.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  box.append(odd);
  const map = isoMap(q, meanings, openOdd);
  if (map) box.append(h('details', { class: 'fold' }, h('summary', {}, 'How the isolation forest finds them'), map));
  box.append(suggestedChecks(id, q, meanings));
  return box;
}

// ------------------------------------------------------------------ tabs: history

async function historyTab(card: string, id: string, who: string): Promise<HTMLElement> {
  void who;
  const kind = historyOf(id);
  const day = newsDay();
  const box = h('div', { class: 'history-tab' });
  if (!history || !kind || !day) return h('p', { class: 'foot' }, 'No history for this step.');
  if (kind === 'weather') {
    box.append(weatherHistory(day));
    return box;
  }
  const choices: { key: string; label: string; m: Metric }[] = kind === 'checks'
    ? [{ key: 'dropped', label: 'Dropped', m: { of: 'dropped' } }, ...history.file.rules.map((r) => ({ key: `rule:${r.name}`, label: r.name, m: { of: 'rule', name: r.name } as Metric }))]
    : tripChoices();
  const picked = historyView.get(card) ?? choices[0]!.key;
  const choice = choices.find((c) => c.key === picked) ?? choices[0]!;
  const ranges = rangesOf(choice.m);
  // One chart at a time: chips for the day's own numbers, the rest a tap further (ADR 0008).
  if (choices.length > 1) {
    const set = (key: string) => {
      historyView.set(card, key);
      void renderSheet();
    };
    const top = choices.slice(0, kind === 'checks' ? choices.length : 5);
    const rest = choices.slice(top.length);
    const sel = rest.length ? h('select', { 'aria-label': 'More numbers', class: 'pick' }, h('option', { value: '' }, 'More…'), ...rest.map((c) => h('option', { value: c.key }, c.label))) : null;
    if (sel) {
      sel.value = rest.some((c) => c.key === choice.key) ? choice.key : '';
      sel.addEventListener('change', () => sel.value && set(sel.value));
    }
    box.append(h('div', { class: 'vf-pick', role: 'group', 'aria-label': 'The number to see' },
      ...top.map((c) => h('button', { type: 'button', class: 'vf-pick-chip', 'aria-pressed': String(c.key === choice.key), onclick: () => set(c.key) }, c.label.replace(/^In the news: /, '').replace(/:.*$/, ''))),
      sel));
  }
  if (ranges) {
    const monday = mondayOf(day);
    const days = daysFrom(dayPlus(monday, -49), dayPlus(monday, 6));
    // The days up to this one: those after it are drawn lighter, with no value (ADR 0008 §10).
    const seen = days.filter((d) => d <= day);
    const fmt = metricFormat(choice.m);
    const focus = historyFocus.get(card) && seen.includes(historyFocus.get(card)!) ? historyFocus.get(card)! : day;
    const pick = (d: string) => {
      historyFocus.set(card, d);
      void renderSheet();
    };
    const gate = gateStep();
    const limit = choice.m.of === 'dropped' && gate?.limit != null ? gate.limit : undefined;
    const bt = backtestLine(ranges, choice.m);
    box.append(bandChart(ranges, days, focus, choice.m.of === 'trips' ? (v) => fmtCompact(v).replace('.0k', 'k') : fmt, pick, limit, day) ?? '',
      h('div', { class: 'vf-key', 'aria-hidden': 'true' },
        h('span', {}, h('i', { class: 'k-band' }), 'usual'), h('span', {}, h('i', { class: 'k-exp' }), 'guess'), h('span', {}, h('i', { class: 'k-out' }), 'outside'),
        h('span', {}, h('i', { class: 'k-focus' }), 'this day'), h('span', {}, h('i', { class: 'k-hol' }), 'holiday'), limit !== undefined ? h('span', {}, h('i', { class: 'k-limit' }), 'limit') : null),
      h('details', { class: 'vf-why' }, h('summary', {}, 'How this day’s band is made', bt ? h('span', { class: 'vf-chip' }, bt.textContent!.match(/\(([\d.]+%)\)/)?.[1] ? `${bt.textContent!.match(/\(([\d.]+%)\)/)![1]} outside last year` : '') : null),
        rangeWhy(ranges, seen, focus, choice.m, fmt, pick, choice.label), bt ?? ''));
  }
  if (kind === 'trips') box.append(calendarView(), incidentsList() ?? '');
  return box;
}
const historyView = new Map<string, string>();
const historyFocus = new Map<string, string>();

/** The trips' numbers the history follows, to pick from: the trips, each column's share missing and middle value,
 * and each coded column's common values' shares. The day's news comes first: a finding's number a tap away. */
function tripChoices(): { key: string; label: string; m: Metric }[] {
  const file = history!.file;
  const col = (c: string) => NEWS_NAMES.column(c);
  const out: { key: string; label: string; m: Metric }[] = [{ key: 'trips', label: 'Trips', m: { of: 'trips' } }];
  const day = newsDay();
  for (const f of day ? dayNews(day) : []) if (f.metric && f.metric.of !== 'trips' && f.metric.of !== 'dropped' && f.metric.of !== 'rule') out.push({ key: metricKey(f.metric), label: `In the news: ${f.title}`, m: f.metric });
  file.columns.forEach((c, k) => {
    out.push({ key: metricKey({ of: 'missing', column: c }), label: `${col(c)}: share missing`, m: { of: 'missing', column: c } });
    if (file.kinds[k] === 'measure' || file.kinds[k] === 'time') out.push({ key: metricKey({ of: 'median', column: c }), label: `${col(c)}: median`, m: { of: 'median', column: c } });
  });
  for (const [c, vh] of Object.entries(file.values ?? {})) {
    if (!vh.counts) continue;
    vh.values.slice(0, 6).forEach((v) => {
      if (vh.rows[vh.values.indexOf(v)]! < 0.001 * file.rows.reduce((a, b) => a + b, 0)) return;
      out.push({ key: metricKey({ of: 'value', column: c, value: v }), label: `${col(c)} ${NEWS_NAMES.value(c, JSON.parse(v) as unknown)}: share of trips`, m: { of: 'value', column: c, value: v } });
    });
  }
  return out.filter((x, i) => out.findIndex((y) => y.key === x.key) === i);
}

/** The weather of the weeks around the day: rain and snow a day, and the hours on record. */
function weatherHistory(day: string): HTMLElement {
  const w = history!.file.weather!;
  const days = daysFrom(dayPlus(mondayOf(day), -49), dayPlus(mondayOf(day), 6));
  const at = days.map((d) => history!.file.days.indexOf(d));
  const [W, H, B] = [340, 120, 16];
  const max = Math.max(5, ...at.map((k) => (k < 0 ? 0 : (w.precip[k] ?? 0))));
  const step = W / days.length;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H + B}`, class: 'bandchart', role: 'img', 'aria-label': 'Rain and snow a day in Manhattan, the eight weeks to the day' }) as SVGSVGElement;
  at.forEach((k, i) => {
    if (k < 0) return;
    const rain = w.precip[k] ?? 0;
    const snow = w.snow[k] ?? 0;
    const hgt = (rain / max) * H;
    svg.append(s('rect', { class: `wx${snow >= 1 ? ' snow' : ''}${days[i] === day ? ' focus' : ''}`, x: (i * step + 0.5).toFixed(1), y: (H - hgt).toFixed(1), width: Math.max(1, step - 1).toFixed(1), height: Math.max(rain ? 1 : 0, hgt).toFixed(1) }));
  });
  // The day marked under the axis, and the days after it lighter: it is the day on screen, not the last one.
  const fi = days.indexOf(day);
  if (fi >= 0) svg.append(s('path', { class: 'wx-caret', d: `M${(fi * step + step / 2 - 4).toFixed(1)} ${H + 9}l4 -6 4 6z` }));
  days.forEach((d, i) => d > day && svg.append(s('rect', { class: 'wx-after', x: (i * step).toFixed(1), y: 0, width: step.toFixed(1), height: H })));
  svg.append(s('text', { class: 'tick', x: 2, y: 10 }, `${max.toFixed(0)} mm`), s('text', { class: 'tick', x: 2, y: H + B - 3 }, shortDay(days[0]!)), s('text', { class: 'tick', x: W - 2, y: H + B - 3, 'text-anchor': 'end' }, shortDay(days.at(-1)!)));
  const k = history!.file.days.indexOf(day);
  const short = w.boroughs.filter((_, b) => (w.hours[k]?.[b] ?? 0) < 24);
  return h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'Rain and snow, day by day'), svg,
    h('div', { class: 'vf-key', 'aria-hidden': 'true' }, h('span', {}, h('i', { class: 'k-rain' }), 'rain'), h('span', {}, h('i', { class: 'k-snow' }), 'snow'), h('span', {}, h('i', { class: 'k-caret' }), dayLabel(day).replace(/, \d{4}$/, ''))),
    h('p', { class: 'foot' }, `${(w.precip[k] ?? 0).toFixed(1)} mm${(w.snow[k] ?? 0) >= 0.1 ? ` · ${(w.snow[k] ?? 0).toFixed(1)} cm snow` : ''} · ${w.tmin[k]?.toFixed(0)} to ${w.tmax[k]?.toFixed(0)} °C${short.length ? ` · hours missing: ${listed(short)}` : ''}`));
}

/** The days in the history with something wrong, newest first: each a tap from its load when it has one. */
/** The days with an incident opened on them, open or resolved: the calendar above draws every day. */
function incidentsList(): HTMLElement | null {
  const opened = dataLog.entries.filter((e) => e.act === 'incident');
  const marked = [...new Set(opened.map((e) => e.day))].sort().reverse();
  if (!marked.length) return null;
  const shown = marked.map((day) => ({ day, title: verdictOf(day)?.title ?? dataLog.entries.find((e) => e.act === 'incident' && e.day === day)?.title ?? 'an incident opened' }));
  const items = shown.map(({ day, title }) => {
    const k = loads.list.findIndex((l) => l.day === day);
    const mine = opened.filter((e) => e.day === day);
    const resolved = dataLog.entries.some((e) => e.act === 'resolved' && e.day === day);
    return h('li', {},
      h('span', { class: 'inc-day' }, dayLabel(day)), h('span', { class: 'inc-what' }, title),
      mine.length ? h('span', { class: `inc-state ${resolved ? 'done' : 'open'}` }, resolved ? 'resolved' : 'incident open') : null,
      k >= 0 ? h('button', { type: 'button', class: 'btn small', disabled: state.running, onclick: () => void useLoad(k) }, 'Load it') : null);
  });
  return h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, `Incidents · ${marked.length}`), h('ul', { class: 'incidents' }, ...items));
}

/**
 * Every day of the history as its story tells it, in a calendar: a row a month, a cell a day; something wrong filled,
 * unusual outlined, the rest a light ghost. Worked out a few days at a time while the page is idle, then kept.
 */
const calendar = { sev: new Map<string, Severity>(), key: '', busy: false, picked: '' };
/**
 * A day's verdict for the calendar: the one its News tells (the same story, its findings marked as expected left as
 * such, a refused file first), so the calendar, its header and the News tab never disagree. The day on screen is its
 * News verdict as it stands, held run and all.
 */
function calendarSeverity(day: string): Severity {
  if (day === newsDay()) return verdictOf(day)?.severity ?? 'ok';
  const l = loads.list.find((x) => x.day === day);
  const c = l ? integrity.checks.get(l.file) : undefined;
  if (c && fileSeverity(c.class) !== 'ok') return fileSeverity(c.class);
  const found = newsOf(history!, day, NEWS_NAMES, { checks: checksAsCounted() });
  const acknowledged = new Set(found.filter((f) => logOf(day, f.key).some((e) => e.act === 'expected')).map((f) => f.key));
  const g = gateStep();
  return storyOf(history!, day, found, { names: NEWS_NAMES, step: g?.step, limit: g?.limit ?? null, hidden: hiddenTripColumns(), acknowledged, episode: false }).severity;
}
function calendarView(): HTMLElement {
  const file = history!.file;
  const key = `${checksAsCounted()}|${dataLog.version}|${[...hiddenTripColumns()].sort().join(',')}`;
  if (calendar.key !== key) (calendar.sev.clear(), (calendar.key = key), (calendar.busy = false));
  const days = file.days.slice(file.warmup);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].reverse();
  // The day on screen carries its News verdict at once, whatever is still being checked; the days after it haven't
  // arrived (ADR 0008 §10): drawn lighter, with no verdict, and not counted.
  const today = newsDay();
  if (today && days.includes(today)) calendar.sev.set(today, calendarSeverity(today));
  const upTo = today ? days.filter((d) => d <= today) : days;
  const counted = () => new Map(upTo.flatMap((d) => (calendar.sev.has(d) ? [[d, calendar.sev.get(d)!] as const] : [])));
  const box = h('div', { class: 'vf-cal part' });
  const draw = () => {
    const cell = 9;
    const gap = 2;
    const left = 44;
    const W = left + 31 * (cell + gap);
    const H = months.length * (cell + gap) + 4;
    const seen = counted();
    const v = [...seen.values()];
    let svg = `<svg class="viz cal" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every day of the history to ${today ? dayLabel(today) : 'its end'}, ${fmtInt(seen.size)} of ${fmtInt(upTo.length)} checked: ${v.filter((x) => x === 'alert').length} something wrong, ${v.filter((x) => x === 'warn').length} unusual.">`;
    let ring = '';
    months.forEach((m, r) => {
      const y = r * (cell + gap) + 2;
      // Newest first: each year's block starts at its December (or the top row), and says its year there.
      svg += `<text x="0" y="${y + cell - 1}" class="tick">${m.slice(5, 7) === '12' || r === 0 ? m : m.slice(5, 7)}</text>`;
      for (let d = 1; d <= 31; d++) {
        const day = `${m}-${String(d).padStart(2, '0')}`;
        if (!file.days.includes(day) || day < days[0]!) continue;
        const later = !!today && day > today;
        const sv = later ? undefined : calendar.sev.get(day);
        const x = left + (d - 1) * (cell + gap);
        const cls = later ? 'cal-after' : sv === 'alert' ? 'cal-alert' : sv === 'warn' ? 'cal-warn' : sv ? 'cal-ok' : 'cal-wait';
        svg += `<rect class="${cls}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" data-day="${day}"/>`;
        // The day on screen: a ring around its cell, apart from the cell's own verdict.
        if (day === today) ring = `<rect class="cal-now" x="${x - 1.5}" y="${y - 1.5}" width="${cell + 3}" height="${cell + 3}" rx="3"/>`;
      }
    });
    const el = svgNode(`${svg}${ring}</svg>`);
    el.addEventListener('click', (e) => {
      const day = (e.target as Element).getAttribute?.('data-day');
      if (!day || (today && day > today)) return;
      calendar.picked = day;
      const k = loads.list.findIndex((l) => l.day === day);
      const top = verdictOf(day);
      said.replaceChildren(top && (top.severity === 'alert' || top.severity === 'warn') ? glyphEl(top.severity, 13) : '', ` ${dayLabel(day)}: ${top?.title ?? ''} `, k >= 0 ? h('button', { type: 'button', class: 'btn small', disabled: state.running, onclick: () => void useLoad(k) }, 'Load it') : '');
    });
    return el;
  };
  const said = h('p', { class: 'vf-cal-said', 'aria-live': 'polite' });
  const bar = h('i', {});
  const progress = h('span', { class: 'cal-progress', 'aria-hidden': 'true' }, bar);
  const head = h('p', { class: 'eyebrow' });
  const sayHead = () => {
    const seen = counted();
    head.replaceChildren(calendarHead(seen, upTo.length, upTo.length < days.length ? today : undefined), seen.size < upTo.length ? progress : '');
    bar.style.width = `${((seen.size / Math.max(1, upTo.length)) * 100).toFixed(1)}%`;
  };
  sayHead();
  let chart = draw();
  // A key: what each cell is, as the cells draw it.
  const key2 = h('div', { class: 'vf-key cal-key', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'k-cal ok' }), 'normal'), h('span', {}, h('i', { class: 'k-cal warn' }), 'unusual'), h('span', {}, h('i', { class: 'k-cal alert' }), 'wrong'),
    h('span', {}, h('i', { class: 'k-cal wait' }), 'not checked yet'), today ? h('span', {}, h('i', { class: 'k-cal now' }), 'this day') : null,
    upTo.length < days.length ? h('span', {}, h('i', { class: 'k-cal after' }), 'after it') : null);
  box.append(head, chart, key2, said);
  // Every day is checked, a few at a time when the page is idle, newest first, and the checking goes on when the tab
  // closes, so the header only ever counts days that were checked.
  const todo = [...upTo].reverse();
  const redraw = () => {
    if (!box.isConnected) return;
    const next = draw();
    chart.replaceWith(next);
    chart = next;
    sayHead();
  };
  // The latest calendar drawn says what is left to check and where to draw it, so the checking that goes on after
  // its tab was redrawn (or another day was picked) carries on for it.
  calendarRedraw = redraw;
  calendarNext = () => todo.find((d) => !calendar.sev.has(d));
  if (calendarNext() && !calendar.busy) {
    calendar.busy = true;
    const mine = calendar.key;
    const step = () => {
      if (calendar.key !== mine) return;
      const t0 = performance.now();
      for (let day = calendarNext(); day && performance.now() - t0 < 24; day = calendarNext()) calendar.sev.set(day, calendarSeverity(day));
      calendarRedraw();
      if (calendarNext()) idle(step);
      else calendar.busy = false;
    };
    idle(step);
  }
  return box;
}
let calendarRedraw: () => void = () => undefined;
let calendarNext: () => string | undefined = () => undefined;
/** When the page is idle, or soon. */
const idle = (f: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 400 });
  else setTimeout(f, 16);
};

let alerts: { day: string; title: string }[] | null = null;
/** Every day of the history with an alert, newest first, worked out once (a few seconds), then kept. */
function alertDays(): { day: string; title: string }[] {
  if (!alerts && history) {
    alerts = [];
    const file = history.file;
    for (let k = file.days.length - 1; k >= file.warmup; k--) {
      const day = file.days[k]!;
      const top = newsOf(history, day, NEWS_NAMES, { checks: checksAsCounted() })[0];
      if (top?.severity === 'alert') alerts.push({ day, title: top.title });
    }
  }
  return alerts ?? [];
}

// ------------------------------------------------------------------ the data log: what was done about the news

// Every action on a finding joins the flow's data log, kept in this browser and hash-chained as the edits are: marked
// as expected (the finding goes quiet, and the day stays in what a normal day is learned from); an incident opened
// (the day is left out of what is learned, so an outage doesn't widen the next days' ranges) and resolved; the
// source's owner told (a note drafted, to send); a check added (a box beside the trips that flags rows like these on
// every load from now on); rows set aside for review (a dataset of them, an output of the flow).

type LogAct = 'expected' | 'incident' | 'resolved' | 'notify' | 'rule' | 'quarantine';
/** An action on a finding, as the sheets show it: an act entry of the record, or one imported from the old data log. */
interface LogEntry {
  seq: number;
  day: string;
  finding: string;
  title: string;
  act: LogAct;
  note: string;
  actor: string;
  at: string;
}
const dataLog = { entries: [] as LogEntry[], version: 0 };
/** This flow's record in this browser (ADR 0006 §6): opened at start. */
let ledger: FlowRecord | null = null;
const recordHead = () => ledger?.head() ?? null;
const legacyKey = () => `smaltfl:data-log:${state.doc.id}`;

/** Open the record, import the old data log once, and read the actions from it. */
async function loadLog(): Promise<void> {
  try {
    ledger = await FlowRecord.open(state.doc.id);
  } catch (e) {
    console.warn(`smaltfl: the record couldn't open: ${message(e)}`);
    return;
  }
  await importLegacyLog();
  seenOf = (path) => {
    const e = ledger?.last('file', (x) => (x.about as { path?: string } | null)?.path === path && ['new', 'same', 'republished'].includes(String((x.about as { class?: string }).class)));
    return e ? String((e.about as { actual?: string }).actual) : undefined;
  };
  fromRecord();
}

/**
 * The old data log (an untagged hash chain in localStorage), read once: its entries go into the record verbatim, with
 * whether its chain held, and the old copy is retired.
 */
async function importLegacyLog(): Promise<void> {
  if (!ledger) return;
  let legacy: (LogEntry & { prev: string | null; hash: string })[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(legacyKey()) ?? '[]') as typeof legacy;
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  let prev: string | null = null;
  let chainOk = true;
  for (const e of legacy) {
    const { hash, ...rest } = e;
    if (rest.prev !== prev || (await sha256Hex(canonicalJSON(rest as unknown as Parameters<typeof canonicalJSON>[0]))) !== hash) chainOk = false;
    prev = hash;
  }
  // Once only: an import of this same chain is already in the record when the old copy couldn't be removed before.
  const already = ledger.last('import', (e) => (e.about as { legacyHash?: string | null; entries?: unknown[] } | null)?.legacyHash === prev && (e.about as { entries?: unknown[] }).entries?.length === legacy.length);
  if (!already) await ledger.append('import', state.viewer, { from: 'the data log (localStorage)', entries: legacy as unknown as JSONValue, legacyHash: prev, chainOk });
  // The old copy is retired only when the record keeps it for good: a record kept for this visit only would lose it.
  if (!ledger.durable) return;
  try {
    localStorage.removeItem(legacyKey());
  } catch {
    // It stays, and isn't imported twice: the check above finds it.
  }
}

/** The actions on findings, from the record. */
function fromRecord(): void {
  const out: LogEntry[] = [];
  for (const e of ledger?.entries ?? []) {
    const a = e.about as Record<string, unknown> | null;
    if (e.kind === 'import' && a && Array.isArray(a.entries)) for (const x of a.entries as LogEntry[]) out.push({ ...x, seq: out.length + 1 });
    if (e.kind === 'act' && a) out.push({ seq: e.seq, day: String(a.day), finding: String(a.finding), title: String(a.title), act: a.act as LogAct, note: String(a.note ?? ''), actor: e.by.as, at: e.at });
  }
  dataLog.entries = out;
  dataLog.version++;
}

async function logRecord(day: string, f: Finding, act: LogAct, note: string): Promise<void> {
  if (ledger) {
    // What the finding rested on, as the record keeps it: the run and the history file behind its numbers.
    const evidence = { metric: f.metric ?? null, value: f.value ?? null, low: f.range?.low ?? null, high: f.range?.high ?? null, history: integrity.files.history?.sha256 ?? null, run: latest()?.result.hash ?? null };
    await ledger.append('act', state.viewer, { day, finding: f.key, title: f.title, act, note, evidence: evidence as unknown as JSONValue });
    fromRecord();
  } else {
    dataLog.entries.push({ seq: dataLog.entries.length + 1, day, finding: f.key, title: f.title, act, note, actor: state.viewer, at: new Date().toISOString() });
    dataLog.version++;
  }
  // An incident's day, or a resolved one, changes what the ranges learn from.
  if (act === 'incident' || act === 'resolved') relearn();
}

const logOf = (day: string, key: string) => dataLog.entries.filter((e) => e.day === day && e.finding === key);
/** The day a finding's actions are logged under: the day's load (a table's news is told from it too). */
const actDay = (f: Finding) => (f.table ? loads.list[loads.at]?.day ?? newsDay() : newsDay());
/** What has been done about a finding: on its day, or for a table's, on any day. */
const findingLog = (f: Finding) => (f.table ? dataLog.entries.filter((e) => e.finding === f.key) : (() => { const day = newsDay(); return day ? logOf(day, f.key) : []; })());
const ACT_DONE: Record<LogAct, string> = { expected: 'marked it expected', incident: 'opened an incident', resolved: 'resolved the incident', notify: 'told the source', rule: 'added a check', quarantine: 'set the rows aside for review' };
const logText = (e: LogEntry) => `${personName(e.actor)} ${ACT_DONE[e.act]}, ${new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${e.note ? `: ${e.note}` : ''}`;

/** The days left out of what a normal day is learned from: those with an incident open, not resolved. */
function incidentDays(): Set<string> {
  const out = new Set<string>();
  for (const e of dataLog.entries) {
    if (e.act === 'incident') out.add(e.day);
    if (e.act === 'resolved') out.delete(e.day);
  }
  return out;
}

/** The ranges learn again, without the incidents' days. */
function relearn(): void {
  if (!history) return;
  history = new HistoryRanges(history.file, { skip: incidentDays() });
  storyCache.clear();
  alerts = null;
  backtests.clear();
}

const ACT_LABEL: Record<Act, string> = { expected: 'OK this day', incident: 'Open an incident', notify: 'Tell the source', rule: 'Add a check', quarantine: 'Set aside for review', refetch: 'Fetch it again', export: 'Export for audit' };

/** What each verb does, said in its accessible name and its title after the words on it (ADR 0008 §6). */
const actDoes = (a: Act | 'resolved', f: Finding): string => ({
  expected: 'mark it as expected on this day, with a note; it is told as a note from then on',
  incident: 'open an incident with a note; its days are left out of what a usual day is learned from',
  resolved: 'resolve the incident with a note; its days count again in what a usual day is learned from',
  notify: `draft a note to whoever publishes ${publisherOf(f)}, to send from your phone or copy`,
  rule: 'add a check beside the table that flags rows like these from now on',
  quarantine: 'set rows like these aside for review in a box beside the table',
  refetch: 'fetch the day’s file again, check it against the list, and run on it',
  export: 'export the record, its runs and files for an auditor to check offline',
})[a];
const actAttrs = (a: Act | 'resolved', label: string, f: Finding) => ({ 'aria-label': `${label}: ${actDoes(a, f)}`, title: actDoes(a, f).replace(/^./, (c) => c.toUpperCase()) });

function actButton(a: Act, f: Finding, card: string): HTMLElement | null {
  const day = actDay(f);
  if (!day) return null;
  const done = findingLog(f);
  // The owner acts on the flow; anyone may note what they know.
  if ((a === 'rule' || a === 'quarantine') && !isOwner()) return null;
  if (a === 'rule' && !ruleFor(f)) return null;
  if (a === 'quarantine' && !quarantineFor(f)) return null;
  const open = done.some((e) => e.act === 'incident') && !done.some((e) => e.act === 'resolved');
  if (a === 'incident' && open) return h('button', { type: 'button', class: 'btn small', ...actAttrs('resolved', 'Resolve the incident', f), onclick: () => void ask(f, card, 'resolved') }, 'Resolve the incident');
  // Fetching a refused file again, and exporting, are done, not noted.
  if (a === 'refetch') return h('button', { type: 'button', class: 'btn small', ...actAttrs(a, ACT_LABEL[a], f), disabled: state.running, onclick: () => void refetch() }, ACT_LABEL[a]);
  if (a === 'export') return ledger ? h('button', { type: 'button', class: 'btn small quiet', ...actAttrs(a, ACT_LABEL[a], f), onclick: () => void exportAudit() }, ACT_LABEL[a]) : null;
  // Told the source already in this episode: the verb stays, behind ⋯, said as again.
  const again = a === 'notify' && !done.some((e) => e.act === a) && toldBefore(day);
  if (done.some((e) => e.act === a)) return null;
  const label = again ? 'Tell the source again' : ACT_LABEL[a];
  return h('button', { type: 'button', class: `btn small${a === 'expected' || a === 'incident' ? '' : ' quiet'}`, ...actAttrs(a, label, f), onclick: () => void ask(f, card, a) }, label);
}

/** The day's file, fetched again past any cache, checked, and run on if it matches now. */
async function refetch(): Promise<void> {
  const k = loads.at;
  if (k < 0 || state.running) return;
  loads.bytes.delete(k);
  state.failed = null;
  await runLoad(k);
}

/** Ask for a note where one helps, then act. */
async function ask(f: Finding, card: string, act: LogAct): Promise<void> {
  const day = actDay(f);
  if (!day) return;
  const el = document.getElementById(`finding-${f.key}`);
  if (act === 'notify') return void tellSource(f, day, el);
  if (act === 'rule') return addWatch(f, day);
  if (act === 'quarantine') return setAside(f, day);
  const prompts: Partial<Record<LogAct, string>> = { expected: 'Why it is expected (it helps the next person)', incident: 'What is known so far', resolved: 'What it was, and what was done' };
  const input = h('input', { type: 'text', class: 'note-in', placeholder: prompts[act] ?? 'A note', 'aria-label': prompts[act] ?? 'A note' });
  const form = h('form', { class: 'f-form' }, input, h('button', { type: 'submit', class: 'btn small' }, act === 'expected' ? 'Mark it' : act === 'incident' ? 'Open it' : 'Resolve it'), h('button', { type: 'button', class: 'btn small quiet', onclick: () => form.remove() }, 'Cancel'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void logRecord(day, f, act, input.value.trim()).then(() => {
      setStatus(`${SEV_LABEL[f.severity]}: ${f.title}: ${ACT_DONE[act]}.`);
      renderLoads();
      renderCanvas();
      void renderSheet();
    });
  });
  if (el) {
    el.querySelector('.f-form')?.remove();
    el.append(form);
    input.focus();
  } else await logRecord(day, f, act, '');
  void card;
}

/** Who a finding's note goes to: the input its table comes from, as the flow describes it. */
function publisherOf(f: Finding): string {
  const from = f.table ? [f.table, ...upstreamOf(f.table)].find((x) => state.doc.sources.some((src) => src.id === x)) : loadSource();
  const source = state.doc.sources.find((src) => src.id === from);
  // Lower-cased to sit in a sentence, unless it starts with an acronym ("NYC TLC yellow taxi trip records").
  const d = source?.description;
  return d ? `the ${/^\p{Lu}{2}/u.test(d) ? d : `${d.charAt(0).toLowerCase()}${d.slice(1)}`}` : from ?? 'the data';
}

/** The tables a table reads, near or far. */
function upstreamOf(id: string): string[] {
  const out: string[] = [];
  const next = [id];
  while (next.length) for (const r of steps().get(next.pop()!)?.inputs ?? []) if (!out.includes(r)) out.push(r), next.push(r);
  return out;
}

/** A note to the source's owner, ready to send: the finding, its numbers, and the day. */
function tellSource(f: Finding, day: string, el: HTMLElement | null): void {
  const subject = `Data check: ${f.title} (${day})`;
  const body = `${f.title}\n\n${f.detail}\n\nSeen in the ${state.doc.name} flow's load of ${dayLabel(day)}, ${day}.`;
  const share = async () => {
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
      if (nav.share) await nav.share({ title: subject, text: body });
      else await nav.clipboard.writeText(`${subject}\n\n${body}`);
    } catch {
      return;
    }
    await logRecord(day, f, 'notify', 'a note drafted');
    void renderSheet();
  };
  const panel = h('div', { class: 'f-form tell' },
    h('p', { class: 'foot' }, `A note to whoever publishes ${publisherOf(f)}: send it from your phone, or copy it.`),
    h('pre', { class: 'code' }, `${subject}\n\n${body}`),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => void share() }, 'share' in navigator ? 'Send it…' : 'Copy it'),
      h('a', { class: 'btn small quiet', href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, onclick: () => void logRecord(day, f, 'notify', 'an email drafted').then(() => renderSheet()) }, 'Email it'),
      h('button', { type: 'button', class: 'btn small quiet', onclick: () => panel.remove() }, 'Cancel')));
  el?.querySelector('.f-form')?.remove();
  el?.append(panel);
}

/** A check that flags rows like a finding's from now on: a rule for a box beside the table (the trips, for the
 * history's news) that only warns. */
function ruleFor(f: Finding): { table: string; name: string; check: string; why: string } | null {
  const c = f.columns?.[0];
  const q = (x: string) => columnSql(x);
  const lit = (key: string) => {
    const v = JSON.parse(key) as unknown;
    return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v === null ? 'NULL' : String(v);
  };
  if (!c) return null;
  if (f.table) {
    const names = namesFor(f.table);
    if ((f.kind === 'key' || f.kind === 'empty') && f.values?.[0] === 'null') return { table: f.table, name: `${c}_present`.toLowerCase(), check: `${q(c)} IS NOT NULL`, why: `${names.column(c)} missing is flagged.` };
    if (f.kind === 'unmatched') {
      const by = f.key.slice(f.key.indexOf('unmatched:') + 'unmatched:'.length);
      const join = steps().get(by);
      const first = join?.kind === 'join' ? join.columns[0] : undefined;
      const looked = typeof first === 'string' ? first : first?.name;
      if (!join || join.kind !== 'join' || !looked) return null;
      return { table: by, name: `${looked}_found`.toLowerCase(), check: `${q(looked)} IS NOT NULL`, why: `A row that finds no match in ${join.inputs[1]} (its ${names.column(c)} not there) is flagged.` };
    }
    if (f.kind === 'placeholder' && f.values?.length) {
      const vals = [...new Set(f.values)].map(lit).join(', ');
      return { table: f.table, name: 'real_values', check: f.columns!.map((x) => `(${q(x)} IS NULL OR ${q(x)} NOT IN (${vals}))`).join(' AND '), why: `A row with a placeholder (${[...new Set(f.values.map((v) => JSON.parse(v) as string))].join(', ')}) is flagged.` };
    }
    return null;
  }
  const src = loadSource();
  if (!src) return null;
  const vh = history?.file.values?.[c];
  if (f.kind === 'new' && vh) {
    const known = vh.values.filter((key, i) => !f.values?.includes(key) && JSON.parse(key) !== null && vh.days[i]! >= 1);
    return { table: src, name: `${c}_known`.toLowerCase(), check: `${q(c)} IS NULL OR ${q(c)} IN (${known.map(lit).join(', ')})`, why: `${NEWS_NAMES.column(c)} as the history has it: a value never seen before is flagged.` };
  }
  if (f.kind === 'pair' && f.columns?.length === 2 && f.values?.length) {
    const [a, b] = f.columns as [string, string];
    const not = f.values.map((key) => {
      const [x, y] = JSON.parse(key) as [unknown, unknown];
      const eq = (col: string, v: unknown) => (v === null ? `${q(col)} IS NULL` : `${q(col)} = ${lit(JSON.stringify(v))}`);
      return `(${eq(a, x)} AND ${eq(b, y)})`;
    });
    return { table: src, name: `${a}_${b}_seen`.toLowerCase(), check: `NOT (${not.join(' OR ')})`, why: `${NEWS_NAMES.column(a)} with ${NEWS_NAMES.column(b)} as the history has them: a combination never seen before is flagged.` };
  }
  if (f.kind === 'missing' || (f.kind === 'share' && f.values?.[0] === 'null')) return { table: src, name: `${c}_present`.toLowerCase(), check: `${q(c)} IS NOT NULL`, why: `${NEWS_NAMES.column(c)} missing is flagged.` };
  return null;
}

/** The rows a finding is about, as a condition on its table (the trips, for the history's news): to set aside for review. */
function quarantineFor(f: Finding): { table: string; name: string; where: string } | null {
  const step = state.doc.steps.find((x) => x.id === history?.file.step);
  const src = loadSource();
  if (f.kind === 'dropped' && step?.kind === 'expectations' && src) return { table: src, name: 'dropped', where: `NOT (${step.rules.filter((r) => r.onFail === 'drop').map((r) => `COALESCE((${r.check}), FALSE)`).join(' AND ')})` };
  const rule = ruleFor(f);
  return rule ? { table: rule.table, name: rule.name.replace(/_(known|seen|present|found)$/, '').replace(/^real_values$/, 'placeholders'), where: `NOT COALESCE((${rule.check}), FALSE)` } : null;
}

/** Add the finding's check to the watch box beside its table (made the first time): it warns, and keeps every row. */
function addWatch(f: Finding, day: string): void {
  const rule = ruleFor(f);
  if (!rule || !isOwner()) return;
  const src = rule.table;
  const id = `${src}_watch`;
  const doc = state.doc;
  const box = doc.steps.find((x) => x.id === id);
  const named = (taken: string[]) => {
    let name = rule.name;
    for (let n = 2; taken.includes(name); n++) name = `${rule.name}_${n}`;
    return name;
  };
  let next: FlowDocument;
  if (box && box.kind === 'expectations') {
    next = { ...doc, steps: doc.steps.map((x) => (x.id === id && x.kind === 'expectations' ? { ...x, rules: [...x.rules, { name: named(x.rules.map((r) => r.name)), check: rule.check, onFail: 'warn', description: rule.why }] } : x)) };
  } else {
    const watch: StepDef = { id, kind: 'expectations', inputs: [src], description: `Checks on ${src} that only warn: rows like ones the news found, flagged on every load`, rules: [{ name: rule.name, check: rule.check, onFail: 'warn', description: rule.why }], dataset: { description: `${src}, with what the watch flags` } };
    next = { ...doc, steps: [...doc.steps, watch] };
  }
  const issues = validateDocument(next);
  if (issues.length) {
    setStatus(`The check couldn't be added: ${issues[0]!.path}: ${issues[0]!.message}.`, true);
    return;
  }
  state.doc = next;
  saveFlow();
  void logRecord(day, f, 'rule', `${rule.name}: ${rule.check}`).then(() => run()).then(() => setStatus(`Added to ${id}: ${rule.name}, which flags rows like these on every load.`));
}

/** Set the finding's rows aside: a dataset of them beside its table, to review. */
function setAside(f: Finding, day: string): void {
  const rows = quarantineFor(f);
  if (!rows || !isOwner()) return;
  const src = rows.table;
  const doc = state.doc;
  const taken = new Set([...doc.sources, ...doc.steps].map((x) => x.id.toLowerCase()));
  let id = `${src}_review_${rows.name}`.toLowerCase().slice(0, 60);
  for (let n = 2; taken.has(id); n++) id = `${src}_review_${rows.name}_${n}`.toLowerCase().slice(0, 60);
  const step: StepDef = { id, kind: 'sql', inputs: [src], sql: `SELECT * FROM ${src} WHERE ${rows.where}`, description: `${f.title}: the rows, set aside to review`, dataset: { description: `Rows set aside for review: ${f.title}` } };
  const next = { ...doc, steps: [...doc.steps, step] };
  const issues = validateDocument(next);
  if (issues.length) {
    setStatus(`The rows couldn't be set aside: ${issues[0]!.path}: ${issues[0]!.message}.`, true);
    return;
  }
  state.doc = next;
  saveFlow();
  void logRecord(day, f, 'quarantine', id).then(() => run()).then(() => {
    setStatus(`Set aside in ${id}: open it to review them.`);
    select(id);
  });
}

// ------------------------------------------------------------------ the sheet

async function renderSheet(): Promise<void> {
  if (state.section) return renderSectionSheet();
  const sheet = $('sheet');
  const id = state.selected;
  if (!id) {
    drill.token++;
    sheet.hidden = true;
    sheet.classList.remove('drill');
    sheet.replaceChildren();
    return;
  }
  return renderDrill(id);
}

function addProfile(of: string): void {
  if (!isOwner()) return;
  const doc = state.doc;
  const taken = new Set([...doc.sources, ...doc.steps, ...profiles(), ...(doc.groups ?? [])].map((x) => x.id.toLowerCase()));
  const base = `${of.slice(0, 54)}_profile`;
  let id = base;
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}_${n}`;
  const next: FlowDocument = { ...doc, profiles: [...profiles(), { id, of, description: `What ${of}'s rows hold: its news, each column's distribution, and the rows that look odd and why. It only looks: no data changes here.` }] };
  if (Object.keys(doc.layout ?? {}).length) {
    const before = gridLayout(canvasDoc(doc), state.collapsed);
    const slot = besideSlot(before, before.cards.get(of)!, id);
    next.layout = { ...pinLayout(canvasDoc(doc), state.collapsed), [id]: [slot.x, slot.y] };
  }
  const issues = validateDocument(next);
  if (issues.length) return setStatus(`The profile couldn't be added: ${issues[0]!.path}: ${issues[0]!.message}.`, true);
  state.doc = next;
  saveFlow();
  saveArrangement();
  select(id);
}

function removeProfile(id: string): void {
  if (!isOwner()) return;
  const { [id]: _gone, ...layout } = state.doc.layout ?? {};
  state.doc = { ...state.doc, profiles: profiles().filter((p) => p.id !== id), layout };
  saveFlow();
  saveArrangement();
  select(null);
}

/** Where an input's rows come from, or where an output's go: the flow's two ends, said plainly. */
function inOut(id: string): HTMLElement | null {
  const n = nodeOf(id);
  const readers = readersOf(id).filter(visible);
  const box = (kind: 'in' | 'out', label: string, ...kids: Child[]) => h('div', { class: `io ${kind}` }, h('p', { class: 'eyebrow' }, label), ...kids);
  const src = state.doc.sources.find((x) => x.id === id);
  if (src) {
    const f = inputFile(id);
    return box('in', 'Input · data the flow reads',
      h('p', { class: 'io-line' }, f ? `From ${f.file}, a ${formatOf(f.file)} file, through the table ${src.table}.` : `From the table ${src.table}.`),
      h('p', { class: 'foot' }, n?.content ? `This run read a snapshot of it, content ${short(n.content)}: the run can be checked against exactly these rows.` : 'Each run reads a snapshot of it and records its hash.'),
      readers.length ? h('p', { class: 'foot' }, `Read next by ${readers.join(', ')}.`) : null);
  }
  const st = steps().get(id);
  if (!st?.dataset) return null;
  const objects = state.doc.ontology?.objectTypes.filter((t) => t.dataset === id).map((t) => t.name) ?? [];
  return box('out', 'Output · a dataset the flow publishes',
    h('p', { class: 'io-line' }, `Published as ${id}${st.dataset.description ? `: ${st.dataset.description}` : ''}.`),
    h('p', { class: 'foot' }, n?.content ? `Stored by this run, content ${short(n.content)}, under the policies below.` : 'Stored, named and hashed when the flow runs, under the policies below.'),
    objects.length ? h('p', { class: 'foot' }, `The ontology’s ${objects.join(', ')} ${objects.length === 1 ? 'is' : 'are'} built on it.`) : null,
    readers.length ? h('p', { class: 'foot' }, `Read next by ${readers.join(', ')}.`) : null);
}

/**
 * Who can see a step. The owner sees everyone's access, as their rules give it, with the rows each would read, and
 * taps a person to see the step as they do, here only, or the whole flow a tap further. Anyone else sees their own.
 */
function accessPanel(id: string): { box: HTMLElement; count: () => void } | null {
  const p = policies();
  if (!p) return null;
  const box = h('div', { class: 'access', id: 'access' }, h('p', { class: 'eyebrow' }, 'Who can see this'));
  const cols = state.columns.get(id);
  // Each person's rows are counted when asked: after the columns, unless the sheet opened here.
  const counts: (() => void)[] = [];
  const count = () => counts.splice(0).forEach((f) => f());
  if (!cols) {
    box.append(h('p', { class: 'foot' }, 'Run the flow to see who can see it.'));
    return { box, count };
  }
  const owner = !!p.principals.find((x) => x.id === state.viewer)?.owner;
  const shown = state.previewAs ?? state.viewer;
  const people = owner ? p.principals : p.principals.filter((x) => x.id === state.viewer);
  const list = h('div', { class: 'people', role: owner ? 'radiogroup' : 'list', 'aria-label': owner ? 'Show this step as' : 'Your access' });
  const run = latest();
  for (const x of people) {
    const view = readView(p, x.id, cols);
    const a = accessOf(view);
    const rows = h('span', { class: 'count' }, '');
    const parts = [h('span', { class: 'who' }, x.name), h('span', { class: `level to-${a}` }, ACCESS_LABEL[a]), rows, h('span', { class: 'how' }, accessText(x, view, cols))];
    list.append(owner ? h('button', { type: 'button', class: `person to-${a}`, role: 'radio', 'aria-checked': String(x.id === shown), onclick: () => showAs(x.id) }, ...parts) : h('div', { class: `person to-${a}`, role: 'listitem' }, ...parts));
    if (run && a !== 'closed') {
      counts.push(() =>
        void inspect(run)
          .then((insp) => (insp.index.has(id) ? rowsAs(insp, insp.index.get(id)!, x.id) : null))
          .then((n) => (rows.textContent = n === null ? '' : plural(n, 'row')))
          .catch(() => (rows.textContent = '')),
      );
    }
  }
  box.append(list);
  if (!owner) box.append(h('p', { class: 'foot' }, 'Only the flow’s owner sees everyone’s access.'));
  else if (state.previewAs && state.previewAs !== state.viewer) {
    box.append(h('div', { class: 'row' }, h('span', { class: 'foot', style: 'flex:1;margin:0' }, `This step shows as ${personName(state.previewAs)} sees it; the rest of the flow, as ${personName(state.viewer)}.`), h('button', { class: 'btn', type: 'button', onclick: () => setViewer(state.previewAs!) }, `View all as ${personName(state.previewAs)}`)));
  } else box.append(h('p', { class: 'foot' }, 'Tap someone to see this step as they do.'));
  return { box, count };
}

/** Show the open step as someone, in its sheet only. */
function showAs(id: string): void {
  state.previewAs = id === state.viewer ? null : id;
  state.sheetFocus = 'access';
  void renderSheet();
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
async function showRows(into: HTMLElement, title: string, sql: string, first: ReadonlySet<string> = new Set(), meanings: Meanings = noMeanings): Promise<void> {
  into.hidden = false;
  into.replaceChildren(h('p', { class: 'eyebrow' }, title), h('p', { class: 'foot' }, 'Loading…'));
  try {
    const r = await state.engine!.query(`SELECT * FROM (\n${sql}\n) LIMIT 50`);
    const lead = (k: number) => (first.has(r.columns[k]!.toLowerCase()) ? 0 : 1);
    const order = [...r.columns.keys()].sort((a, b) => lead(a) - lead(b));
    into.replaceChildren(
      h('div', { class: 'row' }, h('p', { class: 'eyebrow', style: 'flex:1' }, title), h('button', { class: 'btn', type: 'button', onclick: () => ((into.hidden = true), into.replaceChildren()) }, 'Hide')),
      rowsView(order.map((k) => r.columns[k]!), r.rows.map((row) => order.map((k) => row[k])), (c) => (first.has(c.toLowerCase()) ? 'hit' : undefined), meanings),
      h('p', { class: 'foot' }, r.rows.length === 50 ? 'The first 50.' : r.rows.length ? plural(r.rows.length, 'row') + '.' : 'None.'),
    );
  } catch (e) {
    into.replaceChildren(h('p', { class: 'status bad' }, message(e)));
  }
}

/** The reasons a checks step gives its rules, by rule name: why each is there. */
function ruleReasons(id: string): Map<string, string | undefined> {
  const st = steps().get(id);
  return new Map(st?.kind === 'expectations' ? st.rules.map((r) => [r.name, r.description]) : []);
}

/**
 * Up to 50 rows a step dropped, each leading with why: the rules it failed and their reasons. `rules` are the ones the
 * person may read (none on a column their policy removes), each with a flag column the statement computed.
 */
async function showDropped(into: HTMLElement, title: string, sql: string, rules: readonly { k: number; name: string; description?: string; reads: ReadonlySet<string> }[], meanings: Meanings = noMeanings): Promise<void> {
  into.hidden = false;
  into.replaceChildren(h('p', { class: 'eyebrow' }, title), h('p', { class: 'foot' }, 'Loading…'));
  try {
    const r = await state.engine!.query(`SELECT * FROM (\n${sql}\n) LIMIT 50`);
    const flagAt = new Map(rules.map((x) => [x, r.columns.indexOf(`_smaltfl_fail_${x.k}`)]));
    const keep = [...r.columns.keys()].filter((k) => !r.columns[k]!.startsWith('_smaltfl_fail_'));
    const failed = r.rows.map((row) => rules.filter((x) => Number(row[flagAt.get(x)!]) === 1));
    // Why, in the row's own values first: "speed_mph 46.1 fails speed_mph_range: …" and the reason the rule has.
    const valueOf = (row: unknown[], c: string) => {
      const k = keep.find((j) => r.columns[j]!.toLowerCase() === c);
      return k === undefined ? null : `${r.columns[k]} ${typeof row[k] === 'number' ? fmtNum(row[k] as number) : cellOf(row[k]).text}`;
    };
    const why = failed.map((fs, n) =>
      fs.length
        ? fs.map((x) => {
            const values = [...x.reads].map((c) => valueOf(r.rows[n]!, c)).filter((v): v is string => v !== null);
            return `${values.length ? `${values.join(', ')} ${values.length === 1 ? 'fails' : 'fail'} ` : ''}${x.name}${x.description ? `: ${x.description}` : ''}`;
          }).join(' · ')
        : 'a rule on a column hidden from you');
    const columns = ['why', ...keep.map((k) => r.columns[k]!)];
    const rows = r.rows.map((row, n) => [why[n], ...keep.map((k) => row[k])]);
    into.replaceChildren(
      h('div', { class: 'row' }, h('p', { class: 'eyebrow', style: 'flex:1' }, title), h('button', { class: 'btn', type: 'button', onclick: () => ((into.hidden = true), into.replaceChildren()) }, 'Hide')),
      rowsView(columns, rows, (c, n) => (c === 'why' ? 'hit' : n !== undefined && failed[n]!.some((x) => x.reads.has(c.toLowerCase())) ? 'hit' : undefined), meanings),
      h('p', { class: 'foot' }, r.rows.length === 50 ? 'The first 50.' : r.rows.length ? plural(r.rows.length, 'row') + '.' : 'None.'),
    );
  } catch (e) {
    into.replaceChildren(h('p', { class: 'status bad' }, message(e)));
  }
}

/** The sheet's account of what a step changed, as the viewer reads it, and the columns it adds (for the preview's tint). */
async function changePanel(id: string, who = state.viewer): Promise<{ box: HTMLElement; fresh: string[] } | null> {
  const run = latest();
  if (!run || !state.engine) return null;
  const insp = await inspect(run);
  const i = insp.index.get(id);
  if (i === undefined || !insp.manifest.has(i)) return null;
  const c = (who === state.viewer ? state.changes.get(id) : undefined) ?? (await changeOf(insp, i, who));
  const n = insp.plan.nodes[i]!;
  const name = personName(who);
  const rows = h('div', { class: 'rows-box', hidden: true });
  const box = h('div', { class: 'change' }, h('p', { class: 'eyebrow' }, 'What changed'));
  const headline = (text: string, tone: CardLine['tone'] = 'same') => box.append(h('p', { class: `headline ${tone}` }, text));
  const say = (...text: Child[]) => box.append(h('p', { class: 'foot' }, ...text));
  const button = (label: string, title: string, sql: string | null, first?: ReadonlySet<string>) =>
    sql ? h('button', { class: 'btn show', type: 'button', onclick: () => void showRows(rows, title, sql, first, meaningsOf(id)) }, label) : null;
  const list = (names: readonly string[]) => names.join(', ');
  const done = () => {
    const view = access(id, who);
    if (view?.open && (view.filters.length || view.removed.length)) {
      say(`As ${name} reads it: ${[view.filters.length ? `only the rows the ${view.filters.join(' and the ')} lets them read` : '', view.removed.length ? `without ${list(view.removed.map((r) => r.column))}` : ''].filter(Boolean).join(', ')}.`);
    }
    box.append(rows);
    return { box, fresh: c.added };
  };
  if (c.rowsOut === null) {
    headline(`Closed to ${name}`);
    say(`${access(id, who)?.reason ?? 'Their rules don’t open it'}.`);
    return done();
  }
  const out = c.rowsOut;
  const input = n.op === 'table' ? undefined : n.inputs[0];
  // A step the viewer can't see isn't named, here or anywhere.
  const named = (origin: string, otherwise: string) => (visible(origin) ? origin : otherwise);
  if (input !== undefined && c.rowsIn === null) {
    headline(plural(out, 'row'));
    say(`What it reads is closed to ${name}, so what it changed is closed to them too.`);
    return done();
  }
  const inn = c.rowsIn ?? 0;
  switch (n.op) {
    case 'table': {
      headline(`Brings ${plural(out, 'row')} into the flow`);
      break;
    }
    case 'expect': {
      const lost = inn - out;
      headline(lost ? `Dropped ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : `Kept all ${plural(inn, 'row')}`, lost ? 'drop' : 'same');
      box.append(split(out, lost, 'kept', 'dropped'));
      box.append(await rulesTable(insp, i, rows, who));
      if (lost) {
        // Each dropped row with why it went: the rules it fails that the person can read, and their reasons.
        const view = viewIn(insp, input!, who);
        const hidden = new Set(view.removed.map((r) => r.column.toLowerCase()));
        const visibleCols = new Set(view.columns.map((x) => x.toLowerCase()));
        const reasons = ruleReasons(id);
        const flagged = n.rules.flatMap(([rule, check], k) => {
          const reads = [...identifiers(check)];
          return reads.some((x) => hidden.has(x)) ? [] : [{ k, name: rule, description: reasons.get(rule), reads: new Set(reads.filter((x) => visibleCols.has(x))) }];
        });
        const sql = wrapRead(view, emitDropped(insp.plan, i, flagged.map((f) => f.k), insp.ctx), flagged.map((f) => `_smaltfl_fail_${f.k}`));
        if (sql) box.append(h('div', { class: 'row' }, h('button', { class: 'btn show', type: 'button', onclick: () => void showDropped(rows, `Dropped by ${id}, and why`, sql, flagged, meaningsOf(id)) }, `Show the ${plural(lost, 'row')} it dropped, and why`)));
      }
      if (c.flagged) {
        const warns = n.rules.map((r, k) => (r[2] === 'warn' ? k : -1)).filter((k) => k >= 0);
        say(`Its warnings flag ${plural(c.flagged, 'row')}, and keep them: a warning reports a row rather than dropping it.`);
        box.append(h('div', { class: 'row' }, button(`Show the ${plural(c.flagged, 'row')} it flags`, `Flagged by ${id}`, readIn(insp, input!, who, emitFailures(insp.plan, i, warns, insp.ctx)))));
      }
      break;
    }
    case 'filter':
    case 'sql': {
      if (!c.same) {
        headline(`${plural(inn, 'row')} in, ${fmtInt(out)} out`, removedRows(c) ? 'drop' : 'same');
        if (c.added.length) say(`New columns: ${list(c.added)}.`);
        if (c.removed.length) say(`Columns it doesn’t keep: ${list(c.removed)}.`);
        say(`Its columns aren’t the ones it reads, so the rows it returns can’t be matched one to one with the rows it read.`);
        break;
      }
      const lost = Math.max(0, inn - out);
      const kept = Math.min(inn, out);
      headline(lost ? `Removed ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : out > inn ? `Added ${plural(out - inn, 'row')}` : `Kept all ${plural(inn, 'row')}`, lost ? 'drop' : 'same');
      box.append(split(kept, lost, 'kept', 'removed'));
      const removed = exceptIn(insp, input!, i, who);
      const key = insp.manifest.get(i)!.key;
      const where = viewIn(insp, i, who).where ?? '';
      // Rows it returns that it didn't read: a SQL step can rewrite values as well as drop rows.
      const changedSql = n.op === 'sql' ? exceptIn(insp, i, input!, who) : null;
      const [gone, fresh] = await Promise.all([removed ? countOnce(`${key}|removed|${where}`, removed) : 0, changedSql ? countOnce(`${key}|new|${where}`, changedSql) : 0]);
      if (gone) box.append(h('div', { class: 'row' }, button(`Show the ${plural(gone, 'row')} it removed`, `Removed by ${id}`, removed)));
      if (fresh) {
        say(`It also returns ${plural(fresh, 'row')} that it didn’t read: rows whose values it changed, or new ones.`);
        box.append(h('div', { class: 'row' }, button(`Show the ${plural(fresh, 'new or changed row')}`, `New or changed in ${id}`, changedSql)));
      }
      if (gone && !fresh && n.op === 'sql') say('It only removes rows: every row it returns is one it read, unchanged.');
      break;
    }
    case 'join': {
      const right = named(insp.plan.nodes[n.inputs[1]!]!.origin, 'the lookup');
      headline(`Added ${plural(c.added.length, 'column')} from ${right}: ${list(c.added)}`, 'add');
      const u = c.unmatched;
      const keys = new Set(n.on.map(([l]) => l.toLowerCase()));
      const on = list(n.on.map(([l]) => l));
      if (u === null || u === undefined) say(`Which rows found a match is closed to ${name}: what it reads is closed to them.`);
      else {
        box.append(split(inn - u, u, 'matched', n.how === 'left' ? 'no match, kept with empty columns' : 'no match, left out'));
        if (u === 0) say(`Every row found its ${on} in ${right}.`);
        else {
          say(n.how === 'left' ? `${plural(u, 'row')} found no ${on} in ${right}: they are kept, with ${list(c.added)} empty.` : `${plural(u, 'row')} found no ${on} in ${right}, so the join leaves them out.`);
          box.append(h('div', { class: 'row' }, button(`Show the ${plural(u, 'row')} with no match`, `No match in ${right}`, readIn(insp, input!, who, emitUnmatched(insp.plan, i, insp.ctx)!), keys)));
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
async function rulesTable(insp: Inspection, i: number, rows: HTMLElement, who = state.viewer): Promise<HTMLElement> {
  const n = insp.plan.nodes[i] as Extract<PlanNode, { op: 'expect' }>;
  const m = insp.manifest.get(i)!;
  const view = viewIn(insp, n.inputs[0]!, who);
  const hidden = new Set(view.removed.map((r) => r.column.toLowerCase()));
  const name = personName(who);
  const list = (names: readonly string[]) => names.join(', ');
  const rules = await Promise.all(
    n.rules.map(async ([name, check, onFail], k) => {
      const reads = new Set([...identifiers(check)].filter((x) => view.columns.some((c) => c.toLowerCase() === x) || hidden.has(x)));
      const secret = [...reads].filter((x) => hidden.has(x));
      const failed = secret.length ? null : !view.where ? m.expectations!.rules[k]!.failed : await countOnce(`${m.key}|rule${k}|${view.where}`, wrapRead(view, emitRuleFailures(insp.plan, i, k, insp.ctx))!);
      return { name, onFail, reads, secret, failed, sql: secret.length ? null : wrapRead(view, emitRuleFailures(insp.plan, i, k, insp.ctx)) };
    }),
  );
  const inn = (await rowsAs(insp, n.inputs[0]!, who)) ?? 0;
  const reasons = ruleReasons(insp.plan.nodes[i]!.origin);
  // In the order the checks' card draws them (story.ruleOrder): the most rows first, the rules that only warn last.
  const body = ruleOrder(rules.map((r) => ({ ...r, warns: r.onFail === 'warn', rows: r.failed ?? -1 }))).map((r) =>
    h('tr', {},
      h('td', {}, RULE_TITLE(r.name), r.onFail === 'warn' ? h('span', { class: 'warns' }, 'warns') : null, reasons.get(r.name) ? h('span', { class: 'rule-why' }, reasons.get(r.name)!) : null),
      h('td', { class: 'n' }, r.failed === null ? 'closed' : fmtInt(r.failed)),
      h('td', { class: 'n' }, r.failed === null ? '' : pct(r.failed / Math.max(1, inn))),
      h('td', {}, r.failed && r.sql ? h('button', { class: 'btn small', type: 'button', onclick: () => void showRows(rows, `Rows that fail ${r.name}${r.onFail === 'warn' ? ' (kept, with a warning)' : ''}`, r.sql!, r.reads, meaningsOf(insp.plan.nodes[i]!.origin)) }, 'Show') : null),
    ),
  );
  const closed = rules.filter((r) => r.secret.length);
  return h('div', {},
    h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Rule'), h('th', { class: 'n' }, 'Fails'), h('th', { class: 'n' }, 'Share'), h('th', {}, ''))), h('tbody', {}, ...body))),
    h('p', { class: 'foot' }, 'A row can fail more than one rule, so the rules can add up to more than the rows dropped. A rule that warns keeps its rows.'),
    closed.length ? h('p', { class: 'foot' }, `Closed to ${name}: ${closed.map((r) => `${r.name} reads ${list(r.secret)}`).join('; ')}, which their rules remove.`) : null,
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
      fields.push({ label: 'most it may drop, as a share (0.1 is 10%; empty for no limit)', value: st.maxDropped === undefined ? '' : String(st.maxDropped), set: (x, v) => x.kind === 'expectations' && (v.trim() === '' ? delete x.maxDropped : (x.maxDropped = Number(v.trim()))) });
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
    saveFlow();
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

// ------------------------------------------------------------------ what the columns mean

/** What a dataset's columns mean, from the ontology, column by column. */
type Meanings = (column: string) => PropertyType | undefined;
const noMeanings: Meanings = () => undefined;
const meaningsOf = (dataset: string): Meanings => (column) => propertyOf(state.doc.ontology, dataset, column);

/** A number in its unit: $12.80 for dollars, 1.2 miles, 2.5 °C; `text` is the number as already written. */
const inUnit = (text: string, v: number, p: PropertyType | undefined) => (p?.unit === 'USD' ? `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}` : p?.unit ? `${text} ${p.unit}` : text);

/**
 * The names behind a column of another dataset's keys (a zone's name for its LocationID), as the person reads that
 * dataset: none from one closed to them. Loaded once a run and person, before a sheet, the Ontology or the Results
 * show rows.
 */
let lookups = new Map<string, Map<string, string>>();
let lookupsAre = '';
const lookupsLoading = new Map<string, Promise<Map<string, Map<string, string>>>>();
const lookupKey = (p: PropertyType) => `${p.column}|${(p.datasets ?? []).join(',')}`.toLowerCase();
async function useLookups(who: string): Promise<void> {
  const run = latest();
  if (!run || !state.engine) return;
  const at = `${run.result.run}|${who}`;
  if (lookupsAre === at) return;
  let loading = lookupsLoading.get(at);
  if (!loading) {
    loading = loadLookups(run, who);
    for (const k of [...lookupsLoading.keys()]) if (!k.startsWith(`${run.result.run}|`)) lookupsLoading.delete(k);
    lookupsLoading.set(at, loading);
  }
  const got = await loading;
  if (latest() === run) [lookups, lookupsAre] = [got, at];
}
async function loadLookups(run: RunRecord, who: string): Promise<Map<string, Map<string, string>>> {
  const out = new Map<string, Map<string, string>>();
  const insp = await inspect(run);
  for (const p of state.doc.ontology?.properties ?? []) {
    const i = p.lookup ? insp.index.get(p.lookup.dataset) : undefined;
    const sql = i === undefined ? null : readIn(insp, i, who);
    if (!p.lookup || !sql) continue;
    try {
      const r = await state.engine!.query(emitLookup(sql, p.lookup.key, p.lookup.label));
      out.set(lookupKey(p), new Map(r.rows.map(([k, v]) => [String(k), String(v)])));
    } catch {
      // A lookup the person reads without its key or label: its values show as they are.
    }
  }
  return out;
}

/** What a value stands for: its code's meaning, or the name its key has in the lookup. */
const meaningFor = (p: PropertyType | undefined, v: unknown): string | undefined => meaningOf(p, v) ?? (p?.lookup && v !== null && v !== undefined ? lookups.get(lookupKey(p))?.get(String(v)) : undefined);

/** A value as people read it: in its unit, and for a code, with what it stands for (`means`). */
function readValue(v: unknown, p: PropertyType | undefined): { text: string; cls: string; means?: string } {
  const c = cellOf(v);
  const means = meaningFor(p, v);
  if (means !== undefined) return { ...c, means };
  return typeof v === 'number' ? { ...c, text: inUnit(c.text, v, p) } : c;
}

/** A column's label: what people call it, over its name in the data; just the name where the ontology says nothing. */
const columnLabel = (column: string, p: PropertyType | undefined): Child[] => (p ? [h('span', { class: 'col-title' }, p.title), h('span', { class: 'col-name' }, ...breakable(column))] : breakable(column));

/** How a value reads: numbers rounded and right-aligned, a missing value as a muted null. */
function cellOf(v: unknown): { text: string; cls: string } {
  if (v === null || v === undefined) return { text: 'null', cls: 'null' };
  if (typeof v === 'number') return { text: Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000), cls: 'n' };
  if (typeof v === 'bigint') return { text: v.toString(), cls: 'n' };
  return { text: String(v), cls: '' };
}

/**
 * A table of rows, its header and first column staying in place as it scrolls; `mark` can give a column a class (its
 * header and cells), to tint the columns that matter.
 */
/** A class for a column (its header) or one of its cells (`row` given): the tint that says this value matters. */
type Mark = (column: string, row?: number) => string | undefined;

function table(columns: string[], rows: unknown[][], mark?: Mark, tall = false, meanings: Meanings = noMeanings): HTMLElement {
  const marks = columns.map((c) => mark?.(c));
  const props = columns.map((c) => meanings(c));
  // A code shows what it stands for under it; the header, what the column is called and its unit.
  const cell = (v: unknown, k: number, r: number) => {
    const { text, cls } = cellOf(v);
    const means = meaningFor(props[k], v);
    return h('td', { class: [cls, mark?.(columns[k]!, r) ?? ''].filter(Boolean).join(' ') }, text, means ? h('span', { class: 'means' }, means) : null);
  };
  const head = (c: string, k: number) => {
    const p = props[k];
    const attrs: Record<string, string> = marks[k] ? { class: marks[k]! } : {};
    if (p) attrs.title = `${p.title}: ${p.description}`;
    return h('th', attrs, c, p ? h('span', { class: 'th-title' }, p.unit ? `${p.title} · ${p.unit}` : p.title) : null);
  };
  return h('div', { class: `scroll${tall ? ' tall' : ''}` }, h('table', { class: 'data' }, h('thead', {}, h('tr', {}, ...columns.map(head))), h('tbody', {}, ...rows.map((row, r) => h('tr', {}, ...row.map((v, k) => cell(v, k, r)))))));
}

/** Cards in a row, to swipe or step through, with where you are: "Row 3 of 50". */
function carousel(items: HTMLElement[], noun: string): HTMLElement {
  const Noun = noun[0]!.toUpperCase() + noun.slice(1);
  const track = h('div', { class: 'records', tabindex: '0', role: 'list', 'aria-label': `${plural(items.length, noun)}, one at a time` }, ...items);
  items.forEach((it, i) => (it.setAttribute('role', 'listitem'), it.setAttribute('aria-label', `${Noun} ${i + 1} of ${items.length}`)));
  const at = h('span', { class: 'records-at', 'aria-live': 'polite' }, `${Noun} 1 of ${items.length}`);
  const width = () => (track.firstElementChild as HTMLElement).offsetWidth + 10;
  const step = (d: number) => track.scrollBy({ left: d * width(), behavior: 'smooth' });
  track.addEventListener('scroll', () => (at.textContent = `${Noun} ${Math.min(items.length, Math.round(track.scrollLeft / width()) + 1)} of ${items.length}`), { passive: true });
  return h('div', { class: 'records-wrap' },
    h('div', { class: 'records-bar' },
      h('button', { type: 'button', class: 'btn small', 'aria-label': `Previous ${noun}`, onclick: () => step(-1) }, '‹'),
      at,
      h('button', { type: 'button', class: 'btn small', 'aria-label': `Next ${noun}`, onclick: () => step(1) }, '›')),
    track);
}

/** Rows one at a time, as cards to swipe or step through: each column a label and its value, the marked ones first. */
function cards(columns: string[], rows: unknown[][], mark?: Mark, meanings: Meanings = noMeanings): HTMLElement {
  if (!rows.length) return h('p', { class: 'foot' }, 'No rows.');
  return carousel(
    rows.map((r, i) => {
      // Each card leads with the values that matter for its own row.
      const marks = columns.map((c) => mark?.(c, i));
      return h('article', { class: 'record' }, record(columns, r, marks, meanings));
    }),
    'row',
  );
}

/** One row as a list: each column by what it's called, its value in its unit, a code with its meaning; marked ones first. */
function record(columns: readonly string[], row: readonly unknown[], marks: readonly (string | undefined)[], meanings: Meanings): HTMLDListElement {
  const order = [...columns.keys()].sort((a, b) => Number(!marks[a]) - Number(!marks[b]));
  const dl = h('dl', {});
  for (const k of order) {
    const p = meanings(columns[k]!);
    const { text, cls, means } = readValue(row[k], p);
    const at: Record<string, string> = marks[k] ? { class: marks[k]! } : {};
    if (p) at.title = p.description;
    dl.append(h('dt', at, ...columnLabel(columns[k]!, p)), h('dd', { class: [cls, marks[k] ?? ''].filter(Boolean).join(' ') }, text, means ? h('span', { class: 'means' }, means) : null));
  }
  return dl;
}

/** A column's name that wraps after its underscores rather than mid-word: tpep_pickup_ / datetime. */
function breakable(name: string): Child[] {
  return name.split('_').flatMap((part, i, all) => (i < all.length - 1 ? [`${part}_`, document.createElement('wbr')] : [part]));
}

/** How rows show: as cards on a phone, as a table on a wide screen, until someone picks; the pick is kept here. */
let rowsMode: 'cards' | 'table' = (() => {
  try {
    const m = localStorage.getItem('smaltfl:rows');
    if (m === 'cards' || m === 'table') return m;
  } catch {
    // Storage can be off; the screen's width decides.
  }
  return window.matchMedia('(max-width: 640px)').matches ? 'cards' : 'table';
})();
const rowsViews = new Set<{ el: HTMLElement; draw: () => void }>();

/** Rows a person can read on any screen: cards or a table, with a switch between them that applies everywhere. */
function rowsView(columns: string[], rows: unknown[][], mark?: Mark, meanings: Meanings = noMeanings): HTMLElement {
  const el = h('div', { class: 'rows-view' });
  const pick = (m: 'cards' | 'table') => {
    rowsMode = m;
    try {
      localStorage.setItem('smaltfl:rows', m);
    } catch {
      // Kept for this page only.
    }
    for (const v of [...rowsViews]) v.el.isConnected ? v.draw() : rowsViews.delete(v);
  };
  const draw = () => {
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show rows as' },
      h('button', { type: 'button', 'aria-pressed': String(rowsMode === 'cards'), onclick: () => pick('cards') }, 'Cards'),
      h('button', { type: 'button', 'aria-pressed': String(rowsMode === 'table'), onclick: () => pick('table') }, 'Table'));
    el.replaceChildren(seg, rowsMode === 'cards' ? cards(columns, rows, mark, meanings) : table(columns, rows, mark, true, meanings));
  };
  rowsViews.add({ el, draw });
  draw();
  return el;
}

// ------------------------------------------------------------------ results

async function renderResults(): Promise<void> {
  const engine = state.engine;
  const run = latest();
  if (!engine || !run) return;
  await useLookups(state.viewer);
  // Only what the viewer can read: an output closed to them isn't listed, and a result built on one isn't shown.
  const outputs = Object.entries(run.result.manifest.outputs).filter(([name]) => visible(name));
  const owner = isOwner();
  // On a held day the outputs keep the last day before it that passed: said over them (ADR 0008 §10).
  $('datasets').replaceChildren(
    rowsFromBar() ?? '',
    outputs.length
      ? h('ul', { class: 'runs' }, ...outputs.map(([name, d]) => h('li', {}, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => select(name) }, name), owner ? h('span', { class: 'foot num' }, `${fmtInt(d.rows)} rows`) : null, h('span', { class: 'hash' }, short(d.content))))))
      : h('p', { class: 'foot' }, `No output is open to ${personName(state.viewer)}.`),
  );
  try {
    const zh = await readOutput('zone_hour');
    $('zones-panel').hidden = !zh;
    if (zh) {
      const zones = await engine.query(
        `SELECT pu_zone AS zone, pu_borough AS borough, sum(trips) AS trips, round(sum(avg_duration_min * trips) / sum(trips), 1) AS minutes, round(sum(avg_speed_mph * trips) / sum(trips), 1) AS mph FROM (${zh}) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`,
      );
      $('zones-table').replaceChildren(rowsFromBar() ?? '', table(zones.columns, zones.rows, undefined, false, meaningsOf('zone_hour')));
    }
    const we = await readOutput('weather_effect');
    $('effect-panel').hidden = !we;
    if (!we) return;
    // A day's load has each hour once: a wet hour has no dry one at its time of day to set against. With daily
    // loads, weather's effect is measured over every load run so far, the step's own SQL over their rows together.
    let from = we;
    let empty = 'Not enough wet or snowy hours, with trips, to compare with dry ones.';
    const sub = $('effect-sub');
    sub.textContent = 'Trips per hour in each kind of weather, against dry hours at the same hour of day.';
    if (loads.list.length > 1) {
      const across = await effectAcrossLoads(state.viewer);
      const view = access('weather_effect');
      const read = across && view ? wrapRead(view, across.sql) : null;
      if (read && across) {
        from = read;
        const span = across.days.length === 1 ? dayLabel(across.days[0]!) : `${dayLabel(across.days[0]!)} to ${dayLabel(across.days.at(-1)!)}`;
        sub.textContent = `Over the ${plural(across.days.length, 'load')} run so far (${span}): trips per hour in each kind of weather, against dry hours at the same hour of day on the other days.`;
        empty = across.days.length < 2
          ? 'A day’s load has each hour once, so a wet hour has no dry one at its time of day to set against. Run more loads: each brings other days’ hours.'
          : `These ${across.days.length} days have too few wet or snowy hours, with enough trips, to compare: the week’s storm comes on Saturday and Sunday.`;
      }
    }
    const effect = await engine.query(`SELECT borough, condition, hours, trips_per_hour, vs_dry FROM (${from}) WHERE condition <> 'dry' ORDER BY borough, condition`);
    const dry = await engine.query(`SELECT borough, hours, trips_per_hour FROM (${from}) WHERE condition = 'dry'`);
    const width = Math.min(720, Math.max(300, $('effect-chart').clientWidth || 340));
    $('effect-chart').replaceChildren(effectChart(effect.rows as [string, string, number, number, number][], dry.rows as [string, number, number][], width, empty));
  } catch (e) {
    $('effect-chart').replaceChildren(h('p', { class: 'foot' }, message(e)));
  }
}

/**
 * Weather's effect over every load run so far, as a person reads it: weather_effect's own SQL (from the latest plan,
 * parameters filled in) with its input bound to the rows of that input from each load run on the same flow, together.
 */
async function effectAcrossLoads(who: string): Promise<{ sql: string; days: string[] } | null> {
  const run = latest();
  if (!run) return null;
  const insp = await inspect(run);
  const at = insp.index.get('weather_effect');
  const node = at === undefined ? undefined : insp.plan.nodes[at];
  if (!node || node.op !== 'sql' || node.names.length !== 1) return null;
  const input = node.names[0]!;
  const parts: string[] = [];
  const days: string[] = [];
  // Only loads run on this same flow: their rows mean the same.
  for (const [k, l] of loads.list.entries()) {
    const r = l.episode === loads.episode ? runOfLoad(k) : undefined;
    if (!r || r.result.manifest.flow.hash !== run.result.manifest.flow.hash) continue;
    const ri = await inspect(r);
    const i = ri.index.get(input);
    const read = i === undefined ? null : readIn(ri, i, who);
    if (!read) continue;
    parts.push(read);
    days.push(l.day);
  }
  return parts.length ? { sql: emitSqlOver(node.sql, [[input, emitUnionAll(parts)]]), days } : null;
}

/** Horizontal bars per borough and condition: trips per hour against dry hours at the same hour of day (1.0). */
function effectChart(rows: [string, string, number, number, number][], dry: [string, number, number][], width: number, empty: string): HTMLElement {
  const busy = new Set(dry.filter(([, , perHour]) => perHour >= 3).map(([b]) => b));
  const shown = rows.filter(([b, , hours]) => busy.has(b) && hours >= 4);
  if (shown.length === 0) return h('p', { class: 'foot effect-empty' }, empty);
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
  return h('div', {}, svg, h('p', { class: 'foot' }, 'Only boroughs with at least 3 trips in a dry hour are shown, and conditions with 4 hours or more. Weather by Open-Meteo.com (CC BY 4.0); trips from the NYC TLC.'));
}

// ------------------------------------------------------------------ policies

const ruleNames = (ids: readonly string[]) =>
  ids.map((id) => (id === '*' ? 'everyone' : (policies()?.groups?.find((g) => g.id === id)?.name ?? personName(id)))).join(', ');
const actionName = (id: string) => state.doc.ontology?.actionTypes.find((a) => a.id === id)?.name ?? id;

function setViewer(id: string): void {
  state.viewer = id;
  state.previewAs = null;
  $<HTMLSelectElement>('viewer').value = id;
  state.object = null;
  state.verdict = null;
  if (!isOwner()) state.arranging = false;
  void computeChanges();
  // Their flow is laid out without what they can't see: start at its beginning.
  view.ready = false;
  renderTools();
  if ((state.selected && !visible(state.selected)) || (state.section && !isOwner())) select(null);
  else {
    renderCanvas();
    if (state.selected) void renderSheet();
  }
  const where = location.hash.slice(1);
  if (where === 'results') void renderResults();
  if (where === 'policies') void renderPolicies();
  if (where === 'ontology') void renderOntology();
  renderRuns();
  renderLoads();
  setStatus(isOwner(id) ? 'Viewing as the owner: every row and column.' : `Viewing as ${personName(id)}: every read goes through their rules, and what is closed to them is left out.`);
}

let policiesRender = 0;
async function renderPolicies(): Promise<void> {
  const p = policies();
  if (!p) return;
  const token = ++policiesRender;
  // Anyone but the owner sees their own access, the rules that apply to them, and only datasets open to them.
  const owner = isOwner();
  const people = owner ? p.principals : p.principals.filter((x) => x.id === state.viewer);
  $('matrix-sub').textContent = owner
    ? 'Rows each person can read in each output, from this run. Closed means none: a rule applies but can’t filter that output’s rows.'
    : `The rows ${personName(state.viewer)} can read in each output open to them, from this run.`;
  $('people').replaceChildren(
    ...people.map((x) => {
      const attrs = x.owner ? 'sees everything' : Object.entries(x.attributes ?? {}).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ') || 'no row limits';
      const groups = (p.groups ?? []).filter((g) => g.members.includes(x.id)).map((g) => g.name);
      return h('li', {},
        h('div', { class: 'row' }, h('span', { class: 'who' }, x.name), h('span', { class: 'foot', style: 'margin:0' }, x.role ?? ''),
          h('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.viewer === x.id), onclick: () => setViewer(x.id) }, state.viewer === x.id ? 'Viewing as' : 'View as')),
        h('span', { class: 'foot', style: 'margin:0' }, attrs + (groups.length ? ` · ${groups.join(', ')}` : '')));
    }),
  );
  $('rules').replaceChildren(
    ...p.rules.filter((r) => owner || covers(p, r.for, state.viewer)).map((r) => {
      const text = r.kind === 'row' ? `Keeps rows whose ${r.columns.join(' (or ') + (r.columns.length > 1 ? ')' : '')} is one of each person's ${r.attribute}. A dataset without it is closed to them.`
        : r.kind === 'column' ? `Removes ${r.remove.join(', ')}.`
        : `${actionName(r.action)}${r.scope ? `, only where ${r.scope.columns.join(' or ')} is one of their ${r.scope.attribute}` : ''}.`;
      return h('li', {}, h('span', { class: 'tag' }, `${r.kind} rule · for ${ruleNames(r.for)}`), h('span', { class: 'who' }, r.name), h('span', { class: 'foot', style: 'margin:0' }, text));
    }),
  );
  const run = latest();
  if (!run || !state.engine) return;
  const outputs = Object.keys(run.result.manifest.outputs).filter((o) => owner || visible(o));
  const body: HTMLElement[] = [];
  for (const x of people) {
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
  $('matrix').replaceChildren(h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, 'Person'), ...outputs.map((o) => h('th', { class: 'n' }, o)))), h('tbody', {}, ...body)));
}

// ------------------------------------------------------------------ ontology

async function refreshEdits(): Promise<void> {
  if (!state.engine) return;
  state.edits = (await state.engine.callPlugin('smaltfl', 'edits', [])) as Edit[];
  state.chain = (await state.engine.callPlugin('smaltfl', 'verifyEdits', [])) as typeof state.chain;
}

/** How a step makes a column: the expression, the column it takes, or its SQL. */
function makes(st: StepDef, column: string): Child[] | null {
  const c = column.toLowerCase();
  const named = (x: string | { name: string }) => (typeof x === 'string' ? x : x.name).toLowerCase() === c;
  switch (st.kind) {
    case 'formula':
    case 'select': {
      const x = (st.columns as (string | { name: string; expr: string })[]).find(named);
      return x && typeof x !== 'string' ? [h('code', {}, x.expr)] : null;
    }
    case 'aggregate': {
      const m = st.measures.find(named);
      return m ? [h('code', {}, m.expr)] : null;
    }
    case 'join': {
      const x = st.columns?.find(named);
      return x ? [`${typeof x === 'string' ? x : x.column} of `, h('b', {}, st.inputs[1]!)] : null;
    }
    case 'sql': {
      const had = st.inputs.some((i) => (state.columns.get(i) ?? []).some((x) => x.toLowerCase() === c));
      return !had && (state.columns.get(st.id) ?? []).some((x) => x.toLowerCase() === c) ? ['its SQL'] : null;
    }
    default:
      return null;
  }
}

/**
 * What the columns mean, from the ontology: grouped by the source a column comes from, or the steps that make it,
 * each with its codes, what the data shows, where it is and where its meaning comes from. Only columns the viewer can
 * read somewhere are listed.
 */
function propertiesPanel(): HTMLElement | null {
  const o = state.doc.ontology;
  const props = o?.properties ?? [];
  if (!o || !props.length) return null;
  const ids = [...state.doc.sources.map((x) => x.id), ...state.doc.steps.map((x) => x.id)];
  const where = new Map<PropertyType, string[]>();
  const order = new Map<PropertyType, number>();
  ids.forEach((d, n) => {
    const view = access(d);
    if (!view?.open) return;
    view.columns.forEach((c, k) => {
      const p = propertyOf(o, d, c);
      if (!p) return;
      where.set(p, [...(where.get(p) ?? []), d]);
      if (!order.has(p)) order.set(p, n * 1000 + k);
    });
  });
  const head = h('h2', {}, 'What the columns mean');
  if (!where.size) return h('div', {}, head, h('p', { class: 'foot' }, latest() ? `None of the columns described is open to ${personName(state.viewer)}.` : 'Run the flow to see what its columns mean.'));
  const sources = state.doc.sources.filter((x) => where.size && visible(x.id));
  const groupOf = (p: PropertyType) => sources.find((x) => where.get(p)!.includes(x.id))?.id ?? '';
  const refs = new Map((o.references ?? []).map((r) => [r.id, r]));
  const used = new Set<string>();
  const few = (list: readonly string[]) => (list.length <= 4 ? list.join(', ') : `${list.slice(0, 3).join(', ')} and ${list.length - 3} more`);
  const card = (p: PropertyType) => {
    const cited = (p.sources ?? []).map((r) => refs.get(r)).filter((r) => r !== undefined);
    for (const r of cited) used.add(r.id);
    const codes = Object.entries(p.values ?? {});
    const list = codes.length ? h('dl', { class: 'codes' }, ...codes.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null;
    const maker = cited.length ? null : where.get(p)!.map((d) => steps().get(d)).find((st) => st && makes(st, p.column));
    return h('article', { class: 'prop' },
      h('div', { class: 'prop-head' }, h('h3', {}, p.title), h('code', {}, p.column), p.unit ? h('span', { class: 'unit' }, p.unit) : null),
      h('p', {}, p.description),
      list && codes.length > 8 ? h('details', { class: 'whole' }, h('summary', {}, `What its ${codes.length} codes stand for`), list) : list,
      p.note ? h('p', { class: 'note' }, p.note) : null,
      maker ? h('p', { class: 'made' }, 'Made in ', h('b', {}, maker.id), ': ', ...makes(maker, p.column)!) : null,
      p.lookup && visible(p.lookup.dataset) ? h('p', { class: 'made' }, 'Reads as its ', h('b', {}, p.lookup.label), ' in ', h('b', {}, p.lookup.dataset)) : null,
      h('p', { class: 'where' }, `In ${few(where.get(p)!)}`, ...(cited.length ? [' · from ', ...cited.flatMap((r, k) => [k ? ', ' : '', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title)])] : [])));
  };
  const groups = [...sources.map((x) => ({ id: x.id, title: x.description ?? x.id })), { id: '', title: 'Made by the flow’s steps' }]
    .map((g) => ({ ...g, props: props.filter((p) => where.has(p) && groupOf(p) === g.id).sort((a, b) => order.get(a)! - order.get(b)!) }))
    .filter((g) => g.props.length);
  if (!foldsOpen.has(`props:${groups[0]!.id}`)) foldsOpen.set(`props:${groups[0]!.id}`, true);
  const body = groups.map((g) => fold(`props:${g.id}`, [h('span', { class: 'eyebrow' }, g.title), h('span', { class: 'fold-sum' }, plural(g.props.length, 'column'))], h('div', { class: 'props' }, ...g.props.map(card))));
  const cited = [...used].map((r) => refs.get(r)!);
  return h('div', {}, head,
    h('p', { class: 'sub' }, 'Each column once, by what people call it, with what it holds in its source’s own words, what the data itself shows, and where it is. A step’s sheet shows the same on each column, and a code’s meaning wherever its rows are shown.'),
    ...body,
    cited.length ? h('div', { class: 'refs' }, h('p', { class: 'eyebrow' }, 'Where the meanings come from'),
      h('ul', {}, ...cited.map((r) => h('li', {}, h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title), [r.publisher, r.version].filter(Boolean).length ? ` · ${[r.publisher, r.version].filter(Boolean).join(', ')}` : '')))) : null);
}

let ontologyRender = 0;
async function renderOntology(): Promise<void> {
  const o = state.doc.ontology;
  const engine = state.engine;
  if (!o) return;
  // A newer render (the viewer changed, an object was chosen) wins over one still waiting on the engine.
  const token = ++ontologyRender;
  const stale = () => token !== ontologyRender;
  await useLookups(state.viewer);
  const typeName = (id: string) => o.objectTypes.find((t) => t.id === id)?.name ?? id;
  // An object type on a dataset closed to the viewer isn't shown, nor are its links and actions.
  const types = o.objectTypes.filter((t) => visible(t.dataset));
  const shownType = new Set(types.map((t) => t.id));
  if (state.ontologyType && !shownType.has(state.ontologyType)) state.ontologyType = null;
  const counts = new Map<string, number | null>();
  if (latest() && engine) {
    for (const t of types) {
      const sql = await readOutput(t.dataset);
      counts.set(t.id, sql ? Number((await engine.query(`SELECT count(*) FROM (${sql})`)).rows[0]![0]) : null);
    }
  }
  if (stale()) return;
  $('properties').replaceChildren(propertiesPanel() ?? '');
  $('properties').hidden = !o.properties?.length;
  $('ontology-map').replaceChildren(
    h('div', { class: 'types' },
      ...types.map((t) => {
        const c = counts.get(t.id);
        const links = o.linkTypes.filter((l) => (l.from === t.id || l.to === t.id) && shownType.has(l.from) && shownType.has(l.to)).map((l) => (l.from === t.id ? `${l.name} ${typeName(l.to)}` : `${typeName(l.from)} ${l.name} it`));
        const acts = o.actionTypes.filter((a) => a.on === t.id).map((a) => a.name);
        return h('button', { class: 'type', type: 'button', 'aria-pressed': String(state.ontologyType === t.id), onclick: () => ((state.ontologyType = t.id), (state.object = null), (state.verdict = null), void renderOntology()) },
          h('span', { class: 'tag' }, 'Object type'),
          h('span', { class: 'name' }, t.name),
          h('span', { class: 'meta' }, `${c === undefined || c === null ? '' : `${fmtInt(c)} objects · `}from ${t.dataset}, keyed by ${t.key.join(' + ')}`),
          links.length ? h('span', { class: 'links' }, `Links: ${links.join(' · ')}`) : null,
          acts.length ? h('span', { class: 'links' }, `Actions: ${acts.join(', ')}`) : null);
      })),
  );
  const t = types.find((x) => x.id === state.ontologyType);
  const objects = $('objects');
  if (!t || !engine || !latest()) {
    objects.replaceChildren(h('p', { class: 'foot' }, latest() ? 'Choose an object type to see its objects.' : 'Run the flow to see the objects.'));
  } else {
    const sql = await readOutput(t.dataset);
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
  // The owner sees every record; anyone else, their own.
  const owner = isOwner();
  const edits = owner ? state.edits : state.edits.filter((e) => e.actor === state.viewer);
  $('edits').replaceChildren(
    h('h2', {}, 'Edits'),
    h('p', { class: 'sub' }, owner ? 'Every action, allowed or refused, in one hash chain: each record hashes itself and the record before it.' : `${personName(state.viewer)}’s actions, allowed or refused, in the flow’s hash chain: each record hashes itself and the record before it.`),
    chain ? h('div', { class: 'row' }, h('span', { class: `pill ${chain.ok ? 'ok' : 'bad'}` }, chain.ok ? 'chain verified' : `chain broken at #${chain.broken}`), owner ? h('span', { class: 'foot', style: 'margin:0' }, `${chain.edits} record${chain.edits === 1 ? '' : 's'}`) : null) : '',
    edits.length
      ? h('ul', { class: 'checks' }, ...[...edits].reverse().slice(0, 12).map((e) => h('li', {}, h('span', { class: e.outcome === 'applied' ? 'ok' : 'bad' }, e.outcome), h('span', {}, `#${e.seq} ${actionName(e.action)} by ${personName(e.actor)}: ${e.reason}. `, h('span', { class: 'hash' }, short(e.hash))))))
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
    // The record keeps the edit with what allowed it: the policies and the ontology in force (E5).
    if (ledger) await ledger.append('edit', state.viewer, { edit: state.verdict as unknown as JSONValue, policies: await policiesHash(policies() ?? null), ontology: await ontologyHash(o) });
    setStatus(`${actionName(action)}: ${state.verdict.outcome} for ${personName(state.viewer)}.`, state.verdict.outcome !== 'applied');
  } catch (e) {
    setStatus(message(e), true);
  }
  await refreshEdits();
  await renderOntology();
}

// ------------------------------------------------------------------ runs

// ------------------------------------------------------------------ daily loads

// The trips come a day at a time, as a feed brings them: the month, and a few real incidents in the TLC's records,
// each an episode of days to step through. A day's file is the trips source for one run: the same rows give the same
// keys, so a day run before runs again at no cost. A day's chip says how its news reads before it runs (the news comes
// from the history: src/core/news.ts): a normal day, something unusual, something wrong. Its sheet says why, and what
// can be done.

interface Load {
  day: string;
  file: string;
  rows: number;
  sha256: string;
  bytes?: number;
  note?: string;
  /** The episode it belongs to: the month, or an incident. */
  episode: string;
}
interface Episode {
  name: string;
  about?: string;
}
const loads = {
  list: [] as Load[],
  episodes: [] as Episode[],
  /** The episode the strip shows and a sheet steps through. */
  episode: '',
  /** The load shown, by place in the list: the one the flow ran on last, or one whose file was refused. */
  at: -1,
  /** The load whose file is pinned in the engine as the trips source: what a run reads, whatever is shown. */
  pinned: -1,
  bytes: new Map<number, Uint8Array>(),
  playing: false,
  /** The week the strip of days shows, by its Monday. */
  week: '',
};
/**
 * Integrity (ADR 0006): the data branch commit and the hash of its list (MANIFEST.json) the app was built with, the
 * other files' expected hashes, and the last check of every file read, by path.
 */
const integrity = {
  data: null as { commit: string; manifest: string; bytes?: number } | null,
  /** The data's list as fetched and checked, for an export. */
  manifestBytes: null as Uint8Array<ArrayBuffer> | null,
  files: {} as Record<string, Expected & { path: string }>,
  checks: new Map<string, FileCheck>(),
};
const noteCheck = (c: FileCheck) => {
  integrity.checks.set(c.path, c);
  // The record keeps every file it hadn't seen, and every one that wasn't as expected; a file seen before, the same,
  // is routine, and the run's manifest records it anyway.
  if (ledger && c.class !== 'same') void ledger.append('file', state.viewer, c as unknown as JSONValue).then(() => renderRecord(), () => renderRecord());
};
/** A data file, fetched and checked against the list; the record's last sight of it makes it same or republished. */
const checked = (path: string, expected: Expected | undefined) => fetchChecked(path, expected, { commit: integrity.data?.commit ?? null, onCheck: noteCheck, ...(seenOf(path) ? { seen: seenOf(path)! } : {}) });
/** The sha256 this browser last read for a file, from the record (none yet: every file is new). */
let seenOf = (_path: string): string | undefined => undefined;

/** What a step's rows cover, as its words say it: a day's load ("today") when the day's file feeds it, else the
 * whole file it reads, many days of it ("in this file"; the weather covers the loads' weeks). */
const spanOf = (id: string): string => {
  const src = loadSource();
  return loads.list.length && src && (id === src || downstreamOf(src).includes(id)) ? 'today' : 'in this file';
};
/** The source the loads feed: the one the example reads trips.parquet into. */
const loadSource = (): string | undefined => {
  const table = EXAMPLE_SOURCES.find((x) => x.file === 'trips.parquet')?.table;
  return state.doc.sources.find((x) => x.table === table)?.id;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dateOf = (day: string) => new Date(`${day}T12:00:00Z`);
const weekday = (day: string) => WEEKDAYS[dateOf(day).getUTCDay()]!;
/** "Mon Jan 8", with its year when it isn't the month's. */
const dayLabel = (day: string) => {
  const main = loads.list[0]?.day.slice(0, 4);
  return `${weekday(day)} ${dateOf(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}${main && day.slice(0, 4) !== main ? `, ${day.slice(0, 4)}` : ''}`;
};
/** The latest run on a load. */
const runOfLoad = (k: number) => state.runs.find((r) => r.load === k);
const dayPlus = (day: string, n: number) => new Date(dateOf(day).getTime() + n * 864e5).toISOString().slice(0, 10);
/** A day's week, by its Monday. */
const mondayOf = (day: string) => dayPlus(day, -((dateOf(day).getUTCDay() + 6) % 7));
/** The loads a sheet and the strip step through, by place in the list: those of the episode on show. */
const shownLoads = (): number[] => loads.list.flatMap((l, k) => (l.episode === loads.episode ? [k] : []));
const mainLoads = shownLoads;
/** The episode's weeks, each its Monday and its loads, in order. */
const weeksOf = (): { monday: string; days: number[] }[] => {
  const out: { monday: string; days: number[] }[] = [];
  for (const k of shownLoads()) {
    const m = mondayOf(loads.list[k]!.day);
    if (out.at(-1)?.monday !== m) out.push({ monday: m, days: [] });
    out.at(-1)!.days.push(k);
  }
  return out;
};
/** "Jan 8 to 14": a week's span, said. */
const weekSpan = (days: readonly number[]) => {
  const [a, b] = [loads.list[days[0]!]!.day, loads.list[days.at(-1)!]!.day];
  const month = (d: string) => dateOf(d).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month(a)} ${dateOf(a).getUTCDate()}${a === b ? '' : ` to ${month(b) === month(a) ? '' : `${month(b)} `}${dateOf(b).getUTCDate()}`}`;
};

/** What a load's run says of it: its trips, and the share of them its first checks dropped. */
function loadStats(r: RunRecord): { rows: number; dropped: number | null } | null {
  const src = loadSource();
  const m = r.result.manifest;
  const input = m.nodes.find((n) => n.origin === src);
  if (!src || !input) return null;
  const checker = state.doc.steps.find((x) => x.kind === 'expectations' && x.inputs.includes(src));
  const e = checker ? m.nodes.find((n) => n.origin === checker.id)?.expectations : undefined;
  return { rows: Number(input.rows ?? 0), dropped: e && e.rows ? e.dropped / e.rows : null };
}

/** A day's verdict from its news: its worst finding, or none without a history. */
/** A day's verdict: a file refused or republished first, else its news. */
function verdictOf(day: string): Finding | undefined {
  const l = loads.list.find((x) => x.day === day);
  const c = l ? integrity.checks.get(l.file) : undefined;
  if (c && fileSeverity(c.class) !== 'ok') {
    const said = describeFile(c);
    return { key: `integrity:${c.path}`, kind: 'integrity', severity: fileSeverity(c.class), score: 100, title: said.title, detail: said.detail, look: 'integrity', acts: [] };
  }
  // The day as its story tells it: one head, one severity, for the strip, the history and the header alike.
  const story = history && historyOpen() && history.file.days.includes(day) ? storyFor(day) : null;
  return story ? { key: `story:${day}`, kind: story.cause?.kind ?? 'calm', severity: story.severity, score: 100, title: story.head, detail: story.chip ?? '', look: 'news', acts: [] } : undefined;
}
const VERDICT_WORD: Record<Severity, string> = { alert: 'something’s wrong', warn: 'unusual', note: 'a normal day', ok: 'a normal day' };

/** The load now, in a sentence: its day, its trips, its verdict and the first thing to know. */
function loadSummary(): string {
  const k = loads.at;
  const l = loads.list[k];
  if (!l) return '';
  const list = shownLoads();
  const r = runOfLoad(k);
  const st = r ? loadStats(r) : null;
  const top = verdictOf(l.day);
  // The day's head, as its story says it: the strip above draws the rest.
  void list;
  void st;
  return top ? `${dayLabel(l.day).replace(/, \d{4}$/, '')}: ${top.title}` : `${dayLabel(l.day)}: ${fmtInt(l.rows)} trips`;
}

function renderLoads(): void {
  const box = $('loads');
  const list = shownLoads();
  if (loads.list.length < 2) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const busy = state.running || !state.engine;
  const weeks = weeksOf();
  const now = loads.list[loads.at];
  if (!weeks.some((w) => w.monday === loads.week)) loads.week = now && now.episode === loads.episode ? mondayOf(now.day) : weeks[0]!.monday;
  const wi = weeks.findIndex((w) => w.monday === loads.week);
  const shown = weeks[wi]!;
  const turn = (d: number) => {
    loads.week = weeks[wi + d]!.monday;
    renderLoads();
  };
  // Each day a micro bar of its trips against its own usual range, on one scale for the week, and its mark: a filled
  // hexagon for something wrong, an outlined triangle for unusual, ‖ where the checks held the run (ADR 0008).
  const tripsRanges = history && historyOpen() ? rangesOf({ of: 'trips' }) : null;
  const ymax = Math.max(1, ...list.flatMap((k) => [loads.list[k]!.day > (now?.day ?? '9') ? 0 : loads.list[k]!.rows, tripsRanges?.at(loads.list[k]!.day)?.high ?? 0]));
  // One scrolling row for the whole episode (ADR 0008), the loaded day in view.
  // A day after the one on screen hasn't arrived yet, as a feed brings them (ADR 0008 §10): lighter, its usual range
  // (made from the days before) but no count and no mark, whatever this visit ran.
  const viewed = now?.day;
  const chips = list.map((k) => {
    const l = loads.list[k]!;
    const later = !!viewed && l.day > viewed;
    const r = later ? undefined : runOfLoad(k);
    const top = later ? undefined : verdictOf(l.day);
    const sev = top ? (top.severity === 'note' ? 'ok' : top.severity) : 'none';
    const held = !later && !!(history && historyOpen() && storyFor(l.day)?.gate?.held);
    const range = tripsRanges?.at(l.day);
    const label = later ? `${dayLabel(l.day)}${l.note ? `, ${l.note}` : ''}: after this day` : `${dayLabel(l.day)}${l.note ? `, ${l.note}` : ''}: ${fmtInt(l.rows)} trips${top ? `, ${VERDICT_WORD[top.severity]}${top.severity === 'alert' || top.severity === 'warn' ? `: ${top.title}` : ''}` : ''}${held ? ', held' : ''}${r ? '' : ', not run yet'}`;
    return h('button', { type: 'button', class: ['load', `sev-${sev}`, k === loads.at ? 'at' : '', r ? 'ran' : '', later ? 'later' : '', holidayOf(l.day) ? 'holiday' : l.note ? 'holiday season' : ''].filter(Boolean).join(' '), 'aria-pressed': String(k === loads.at), 'aria-label': label, title: label, disabled: busy || loads.playing, onclick: () => void useLoad(k) },
      h('span', { class: 'ld-day' }, weekday(l.day)),
      h('span', { class: 'ld-date' }, String(dateOf(l.day).getUTCDate())),
      svgNode(stripBar({ v: later ? 0 : l.rows, low: range?.low ?? null, high: range?.high ?? null, ymax, sev: sev === 'alert' || sev === 'warn' ? sev : null })),
      h('span', { class: 'ld-marks', 'aria-hidden': 'true' }, sev === 'alert' || sev === 'warn' ? glyphEl(sev, 14) : '', held ? glyphEl('held', 14) : ''));
  });
  const at = list.indexOf(loads.at);
  const last = at >= list.length - 1;
  const play = h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(loads.playing), disabled: busy && !loads.playing, onclick: () => void playLoads() }, loads.playing ? 'Pause' : last || at < 0 ? 'Play ▶' : 'Play the rest ▶');
  const next = h('button', { type: 'button', class: 'btn small', disabled: busy || loads.playing || last || at < 0, onclick: () => void useLoad(list[at + 1]!) }, 'Next ›');
  const ep = loads.episodes.find((e) => e.name === loads.episode);
  const episodes = loads.episodes.length > 1
    ? h('div', { class: 'episodes', role: 'group', 'aria-label': 'Which days' },
        ...loads.episodes.map((e, i) => h('button', { type: 'button', class: 'nav-chip', 'aria-pressed': String(e.name === loads.episode), disabled: busy || loads.playing, onclick: () => setEpisode(e.name) }, i === 0 ? e.name : `${e.name} ⚠`)))
    : null;
  const weekNav = h('div', { class: 'week-nav' },
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The week before', disabled: wi === 0, onclick: () => turn(-1) }, '‹'),
    h('span', { class: 'week-at', 'aria-live': 'polite' }, `Week ${wi + 1} of ${weeks.length} · ${weekSpan(shown.days)}`),
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The week after', disabled: wi === weeks.length - 1, onclick: () => turn(1) }, '›'));
  const src = loadSource();
  const lens = profiles().find((p) => p.of === src)?.id ?? src;
  const top = now ? verdictOf(now.day) : undefined;
  box.replaceChildren(
    h('div', { class: 'loads-head' }, h('p', { class: 'eyebrow' }, `Daily loads · ${loads.episode}`), h('div', { class: 'loads-act' }, play, next)),
    episodes ?? '',
    h('div', { class: 'loads-row scroll', role: 'group', 'aria-label': `Daily loads, ${weekSpan(list)}: tap one to run the flow on it` }, ...chips),
    h('div', { class: `loads-now${top ? ` sev-${top.severity}` : ''}` },
      h('p', { 'aria-live': 'polite' }, top && (top.severity === 'alert' || top.severity === 'warn') ? glyphEl(top.severity, 14) : '', ' ', loadSummary()),
      lens && top && visible(src!) ? h('button', { type: 'button', class: 'btn small', onclick: () => openTab(lens, 'news') }, 'The news ›') : null));
  // The loaded day in view in the scrolling row.
  requestAnimationFrame(() => {
    const row = box.querySelector('.loads-row') as HTMLElement | null;
    const at = row?.querySelector('[aria-pressed="true"]') as HTMLElement | null;
    if (row && at) row.scrollLeft = Math.max(0, at.offsetLeft - row.offsetLeft - row.clientWidth / 2 + at.clientWidth / 2);
  });
  void weekNav;
}

/** Run the flow on a load. */
async function useLoad(k: number): Promise<void> {
  const l = loads.list[k];
  if (!l) return;
  if (l.episode !== loads.episode) loads.episode = l.episode;
  await runLoad(k);
}

/** Show another episode's days, and run its first. */
function setEpisode(name: string): void {
  if (name === loads.episode || state.running) return;
  loads.episode = name;
  loads.week = '';
  const first = shownLoads()[0];
  if (first !== undefined) void useLoad(first);
  else renderLoads();
}

/** Put a load in the engine as the trips source and run the flow on it. Only the last few loads' bytes are kept. */
async function runLoad(k: number): Promise<void> {
  const engine = state.engine;
  const l = loads.list[k];
  if (!engine || !l || state.running) return;
  let bytes = loads.bytes.get(k);
  try {
    if (!bytes) {
      setStatus(`Fetching ${dayLabel(l.day)}: ${fmtInt(l.rows)} trips, checked against the data's list…`);
      bytes = await checked(l.file, { sha256: l.sha256, bytes: l.bytes ?? -1, from: l.file });
      loads.bytes.set(k, bytes);
      for (const old of [...loads.bytes.keys()].slice(0, Math.max(0, loads.bytes.size - 3))) loads.bytes.delete(old);
    }
    // The engine hashes the bytes again as it pins them, kept ones included, and refuses them if they don't match.
    await pinFile(engine, 'trips.parquet', bytes, l.sha256);
  } catch (e) {
    loads.bytes.delete(k);
    refuse(k, e);
    return;
  }
  loads.pinned = k;
  loads.at = k;
  loads.week = mondayOf(l.day);
  normalView.focus = '';
  historyFocus.clear();
  renderLoads();
  await run();
  renderLoads();
}

/** When the run on screen changed without a run passing (a held or refused day), its columns and changes follow it. */
function syncShown(): void {
  const r = latest();
  if (!r || r.result.hash === changesFor) return;
  void learnColumns().then(() => computeChanges());
}

/** A load whose file was refused: it doesn't run, the last good run stays on screen, and every sheet says why. */
function refuse(k: number, e: unknown): void {
  const l = loads.list[k]!;
  // A check the fetch made is in the record already; one the engine made (it refused the bytes as it pinned them) isn't.
  const check: FileCheck = e instanceof IntegrityError ? e.check : { path: l.file, class: 'corrupt', expected: l.sha256, actual: null, commit: integrity.data?.commit ?? null, at: new Date().toISOString() };
  if (!(e instanceof IntegrityError)) noteCheck(check);
  const said = describeFile(check);
  loads.at = k;
  loads.week = mondayOf(l.day);
  state.failed = { origin: loadSource(), message: `${said.title}. ${said.detail}`, file: check };
  attempts++;
  setStatus(`${dayLabel(l.day)}: ${said.title}.`, check.class !== 'not-checked', { n: attempts, state: 'refused' });
  syncShown();
  renderLoads();
  renderCanvas();
  if (state.selected) void renderSheet();
}

/** Play the episode's loads one after another; tap again to pause. */
async function playLoads(): Promise<void> {
  if (loads.playing) {
    loads.playing = false;
    renderLoads();
    return;
  }
  loads.playing = true;
  const list = shownLoads();
  const at = list.indexOf(loads.at);
  const from = at < 0 || at >= list.length - 1 ? 0 : at + 1;
  renderLoads();
  for (const k of list.slice(from)) {
    if (!loads.playing) break;
    await useLoad(k);
    if (state.failed) break;
  }
  loads.playing = false;
  renderLoads();
}

/** A profile box's card: its step's news for the day, in a few words. */
function profileLine(p: ProfileDef): CardLine {
  if (!nodeOf(p.of)) return { text: state.running ? 'running…' : 'the data’s story', tone: 'same' };
  // The trips' profile says the day's head, as its story tells it (ADR 0008): one line, no count of findings.
  const sday = historyOf(p.of) === 'trips' ? newsDay() : undefined;
  const story = sday ? storyFor(sday) : null;
  if (story) return story.severity === 'alert' || story.severity === 'warn' ? { text: `↳ grouped under ${p.of}`, tone: 'same' } : { text: story.head.length > 30 ? `${story.head.slice(0, 28)}…` : story.head, tone: 'same' };
  const all = cardNews(p.id);
  const news = all.filter((f) => f.severity !== 'ok');
  const top = news[0];
  const day = !!historyOf(p.of);
  if (!all.length) return { text: day ? 'a normal day' : 'its news, columns, odd rows', tone: 'same' };
  if (!top) return { text: day ? 'a normal day' : 'nothing out of the ordinary', tone: 'same' };
  const n = news.filter((f) => f.severity === 'alert' || f.severity === 'warn').length;
  if (top.severity === 'alert') return { text: 'something’s wrong', tone: 'drop', badge: 'alert' };
  if (top.severity === 'warn') return { text: `${n} unusual`, tone: 'drop', badge: 'unusual' };
  return { text: day ? 'a normal day, with a note' : plural(news.length, 'note'), tone: 'same' };
}

/** A card's news at its worst, once known: for its dot on the canvas. */
function healthOf(card: string): Severity | undefined {
  if (!latest()) return undefined;
  // The trips and their profile show the day's story; the checks, their gate.
  const kind = historyOf(profileOf(card)?.of ?? dataOf(card));
  const day = newsDay();
  const story = day && (kind === 'trips' || kind === 'checks') ? storyFor(day) : null;
  // The trips' card carries the day's mark; their profile is grouped under it, without a mark of its own.
  if (story && kind === 'trips') return profileOf(card) ? undefined : story.severity;
  if (story?.gate?.held && kind === 'checks') return 'alert';
  // Nothing of it was built from the day: no dot from another day's rows.
  if (notBuilt(dataOf(card))) return undefined;
  const news = cardNews(card);
  return news.length ? news.reduce((w, f) => (SEV_RANK[f.severity] < SEV_RANK[w] ? f.severity : w), 'ok' as Severity) : undefined;
}

// ------------------------------------------------------------------ normal ranges

// Each day's numbers against its normal range (src/core/normal.ts): what a day like it would have, from the same
// weekday in the weeks before and its day last year, each weighted by how well it has been guessing, give or take three
// typical misses. From the scenario's history (history.json: two years and a quarter of days, each measured as the app
// measures a load), as the person may read it: only with the trips source open to them, and what the checks drop only
// while the checks are the ones the history counted.

let history: HistoryRanges | null = null;

/** Whether the person may read the history: the trips source is open to them. */
function historyOpen(): boolean {
  const src = loadSource();
  return !!history && !!src && visible(src);
}

/**
 * Whether the trips' checks are still the ones the history counted: the same rules, reading the trips themselves (a
 * box put in front of them would leave them other rows to count).
 */
function checksAsCounted(): boolean {
  const step = history ? state.doc.steps.find((x) => x.id === history!.file.step) : undefined;
  return !!history && step?.kind === 'expectations' && step.inputs.length === 1 && step.inputs[0] === loadSource()
    && history.sameChecks(step.rules.map((r) => ({ name: r.name, check: r.check, onFail: r.onFail })));
}

interface Judged {
  range: NormalRange;
  place: Place;
  value: number;
}

/** A number's normal ranges, as the person may read them. */
function rangesOf(m: Metric): NormalRanges | null {
  if (!history || !historyOpen()) return null;
  if ((m.of === 'dropped' || m.of === 'rule') && !checksAsCounted()) return null;
  return history.of(m);
}

/** A day's number against its normal range; none without one. */
function judgeDay(m: Metric, day: string, value: number | null | undefined): Judged | null {
  const ranges = rangesOf(m);
  if (!ranges || value === null || value === undefined || !Number.isFinite(value)) return null;
  const range = ranges.at(day);
  return range ? { range, place: ranges.place(range, value), value } : null;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Dec 18". */
const shortDay = (day: string) => dateOf(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
/** A day in a holiday's window, said: "the day before Thanksgiving", "a day of the holiday season". */
const seasonPhrase = (name: string) => (/^Day before /.test(name) ? `the d${name.slice(1)}` : name === 'Holiday season' ? 'a day of the holiday season' : `a day of ${name}`);
/** A day's year, said where a list of short days needs it. */
const x0 = (day: string) => day.slice(0, 4);

/** A typical miss, said: a count's or a share's as a percentage of it, a level's in its own units. */
const missText = (scale: NormalRange['scale'], miss: number, fmt: (v: number) => string) => (scale === 'level' ? fmt(miss) : `${(Math.expm1(miss) * 100).toFixed(1)}%`);

/** Three or so round levels between two numbers. */
function niceTicks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo) / n;
  if (!(raw > 0)) return [lo];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw)!;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(Number(t.toPrecision(12)));
  return out;
}

/** The panel's number, and the day it explains: one tapped on the chart, else the load on the canvas. */
const normalView = { metric: 'trips' as 'trips' | 'dropped', focus: '' };
const backtests = new Map<string, Backtest>();

/** Days as a band chart: the normal range a band, the guess a lighter solid line, the number a dot. Tap for a day. */
function bandChart(ranges: NormalRanges, days: readonly string[], focus: string, fmt: (v: number) => string, pick: (day: string) => void, limit?: number, today?: string): SVGSVGElement | null {
  const [W, H, L, R, T, B] = [340, 172, 38, 6, 8, 26];
  // A day after the one on screen has its band (made from the days before it) but no value: it hasn't arrived.
  const pts = days.map((d) => ({ d, v: today && d > today ? null : ranges.value(d), r: ranges.at(d) }));
  const all = [...pts.flatMap((p) => [p.v, p.r?.low, p.r?.high]), limit].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!all.length) return null;
  let [lo, hi] = [Math.min(...all), Math.max(...all)];
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  lo = ranges.scale === 'level' ? lo - pad : Math.max(0, lo - pad);
  hi += pad;
  const step = (W - L - R) / pts.length;
  const X = (i: number) => L + (i + 0.5) * step;
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const out = pts.filter((p) => p.v !== null && p.r && ranges.place(p.r, p.v) !== 'within');
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bandchart', role: 'img', 'aria-label': `${shortDay(days[0]!)} to ${shortDay(days.at(-1)!)}, each day's number against its normal range: ${out.length ? `${plural(out.length, 'day')} outside it, ${listed(out.map((p) => shortDay(p.d)))}` : 'every day with one within it'}` }) as SVGSVGElement;
  for (const t of niceTicks(lo, hi, 4)) {
    svg.append(s('line', { class: 'grid', x1: L, x2: W - R, y1: Y(t).toFixed(1), y2: Y(t).toFixed(1) }), s('text', { class: 'tick', x: L - 4, y: (Y(t) + 3).toFixed(1), 'text-anchor': 'end' }, fmt(t)));
  }
  // Weeks: a line before each Monday, every other one named.
  let named = 0;
  pts.forEach((p, i) => {
    if (dateOf(p.d).getUTCDay() !== 1) return;
    const x = (X(i) - step / 2).toFixed(1);
    svg.append(s('line', { class: 'week', x1: x, x2: x, y1: T, y2: H - B }));
    if (named++ % 2 === 0) svg.append(s('text', { class: 'tick', x: (X(i) - step / 2 + 2).toFixed(1), y: H - B + 13 }, shortDay(p.d)));
  });
  // The bands, a stretch at a time where days have one; a lone day's as a bar.
  let stretch: number[] = [];
  const flush = () => {
    if (stretch.length === 1) {
      const r = pts[stretch[0]!]!.r!;
      svg.append(s('rect', { class: 'band', x: (X(stretch[0]!) - step * 0.35).toFixed(1), width: (step * 0.7).toFixed(1), y: Y(r.high).toFixed(1), height: Math.max(1, Y(r.low) - Y(r.high)).toFixed(1) }));
    } else if (stretch.length > 1) {
      const at = (i: number, v: number) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      svg.append(
        s('path', { class: 'band', d: `M${stretch.map((i) => at(i, pts[i]!.r!.high)).join('L')}L${[...stretch].reverse().map((i) => at(i, pts[i]!.r!.low)).join('L')}Z` }),
        s('path', { class: 'expected', d: `M${stretch.map((i) => at(i, pts[i]!.r!.expected)).join('L')}` }));
    }
    stretch = [];
  };
  pts.forEach((p, i) => (p.r ? stretch.push(i) : flush()));
  flush();
  // Holidays marked under the plot, and the days around them lighter.
  pts.forEach((p, i) => {
    if (holidayOf(p.d)) svg.append(s('rect', { class: 'hol', x: (X(i) - step * 0.4).toFixed(1), y: H - B + 2, width: (step * 0.8).toFixed(1), height: 3 }));
    else if (seasonOf(p.d)) svg.append(s('rect', { class: 'hol season', x: (X(i) - step * 0.4).toFixed(1), y: H - B + 2.5, width: (step * 0.8).toFixed(1), height: 2 }));
  });
  // The checks' limit, drawn where it applies: the line a share past it crosses.
  if (limit !== undefined) svg.append(s('line', { class: 'limit-line', x1: L, x2: W - R, y1: Y(limit).toFixed(1), y2: Y(limit).toFixed(1) }), s('text', { class: 'tick limit-t', x: W - R, y: (Y(limit) - 3).toFixed(1), 'text-anchor': 'end' }, `limit ${fmt(limit)}`));
  pts.forEach((p, i) => {
    if (p.v === null) return;
    const off = p.r ? ranges.place(p.r, p.v) !== 'within' : false;
    svg.append(s('circle', { class: ['pt', off ? 'out' : '', p.r ? '' : 'bare', p.d === focus ? 'focus' : ''].filter(Boolean).join(' '), cx: X(i).toFixed(1), cy: Y(p.v).toFixed(1), r: p.d === focus ? 4 : off ? 3.4 : 2.3 }));
  });
  // The days after the one on screen lighter, as the weather's are: it is the day on screen, not the last one.
  const after = today ? days.findIndex((d) => d > today) : -1;
  if (after >= 0) svg.append(s('rect', { class: 'wx-after', x: (X(after) - step / 2).toFixed(1), y: 0, width: (W - R - (X(after) - step / 2)).toFixed(1), height: H - B }));
  // A tap anywhere picks the nearest day up to the one on screen: a day's column is narrower than a finger.
  const last = after >= 0 ? after - 1 : days.length - 1;
  svg.addEventListener('click', (e) => {
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / Math.max(1, box.width)) * W;
    pick(days[Math.max(0, Math.min(last, Math.floor((x - L) / step)))]!);
  });
  return svg;
}

/** Why a day's range is what it is: its guesses, what each was made from, its weight, and the typical miss. */
function rangeWhy(ranges: NormalRanges, days: readonly string[], day: string, m: Metric, fmt: (v: number) => string, pick: (day: string) => void, label?: string): HTMLElement {
  const r = ranges.at(day);
  const v = ranges.value(day);
  const what = (x: number) => (m.of === 'trips' ? `${fmt(x)} trips` : m.of === 'dropped' ? `${fmt(x)} of its trips dropped by the checks` : `${label?.replace(/^In the news: /, '') ?? 'It'}: ${fmt(x)}`);
  const note = holidayOf(day) ?? seasonOf(day);
  const k = days.indexOf(day);
  const nav = h('div', { class: 'why-nav' },
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The day before', disabled: k <= 0, onclick: () => pick(days[k - 1]!) }, '‹'),
    h('span', { class: 'why-day' }, `${dayLabel(day)}${note ? `, ${note}` : ''}`),
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The day after', disabled: k >= days.length - 1, onclick: () => pick(days[k + 1]!) }, '›'));
  const box = h('div', { class: 'range-why', 'aria-live': 'polite' }, nav);
  if (!r) {
    box.append(h('p', {}, `${v === null ? 'Not measured' : what(v)}. No normal range: the history doesn’t reach back far enough for one${note ? ', or had no such holiday the year before' : ''}.`));
    return box;
  }
  const place = v === null ? null : ranges.place(r, v);
  box.append(h('p', {},
    h('b', {}, v === null ? 'Not measured' : what(v)),
    place === null ? ': its normal range is ' : place === 'within' ? ', within its normal range: ' : h('b', { class: 'off' }, `, ${place} its normal range: `),
    `${fmt(r.low)} to ${fmt(r.high)}, around ${fmt(r.expected)}${r.guesses.length > 1 ? ', from two guesses' : r.special ? (holidayOf(day) ? ', from last year’s holiday alone' : `, from last year’s alone: ${seasonPhrase(r.special)}`) : ''}.`));
  const share = (g: NormalRange['guesses'][number]) => (r.guesses.length > 1 ? ` It counts ${pct0(g.weight)}${g.miss !== null ? `: it missed by ${missText(r.scale, g.miss, fmt)} on a typical day of the six weeks before` : ''}.` : '');
  const items = r.guesses.map((g) => {
    if (g.by === 'weeks') return h('li', {}, h('b', {}, fmt(g.value)), ` from the same weekday in the weeks before: the weighted median of ${listed(g.from.map((f) => shortDay(f.day)))}, the latest counting ${pct0(g.from[0]!.weight)}.${share(g)}`);
    const f = g.from[0]!;
    const fNote = holidayOf(f.day) ?? seasonOf(f.day);
    // A share moves by points, a count by a ratio, anything else in its own units.
    const signed = (x: number) => `${x >= 0 ? '+' : '−'}${r.scale === 'share' ? `${(Math.abs(x) * 100).toFixed(1)} points` : fmt(Math.abs(x))}`;
    const moves = [
      g.ratio !== undefined ? `× ${g.ratio.toFixed(2)} as this year’s days compare with last year’s lately` : g.shift !== undefined ? `${signed(g.shift)} as this year’s days compare with last year’s lately` : '',
      g.weekday ? `${r.scale === 'count' ? `× ${g.weekday.by.toFixed(2)}` : signed(g.weekday.by)} for a ${WEEKDAY_NAMES[g.weekday.to]} against a ${WEEKDAY_NAMES[g.weekday.from]}` : '',
    ].filter(Boolean);
    // One day last year, or the same weekday a week either side of it too: their median.
    const oneYear = g.from.every((x) => x0(x.day) === x0(f.day));
    const from = g.from.length > 1
      ? ` from the same weekday last year, ${listed(g.from.map((x) => `${shortDay(x.day)}${oneYear ? '' : `, ${x0(x.day)}`} (${fmt(x.value)})`))}${oneYear ? `, ${x0(f.day)}` : ''}: their median ${fmt(g.base ?? f.value)}`
      : ` from its day last year, ${dayLabel(f.day)}${fNote ? `, ${fNote}` : ''}: ${fmt(f.value)}`;
    return h('li', {}, h('b', {}, fmt(g.value)), `${from}${moves.length ? `, ${moves.join(', ')}` : ''}.${share(g)}`);
  });
  box.append(h('ul', {}, ...items));
  const over = r.spreadFrom === 'weeks' ? `over the ${r.over} ordinary days of the six weeks before`
    : r.spreadFrom === 'holidays' ? `last year’s guess on the ${r.over} holidays of the year before`
    : `last year’s guess on the ${r.over} ordinary days of the six weeks before, for want of holidays: a rough range`;
  box.append(h('p', { class: 'foot' }, `The range: the guess give or take three typical misses, a typical miss being ${missText(r.scale, r.spread, fmt)}, ${over}.`));
  // What the checks drop, rule by rule: each rule's failures against its own range for the day.
  if (m.of === 'dropped' && history) {
    const rows = history.file.rules.flatMap((rule) => {
      const rs = rangesOf({ of: 'rule', name: rule.name });
      const rr = rs?.at(day);
      const rv = rs?.value(day) ?? null;
      // A rule nothing fails, now or on the days before: nothing to say.
      if (!rs || !rr || rv === null || (rr.high === 0 && rv === 0)) return [];
      const at = rs.place(rr, rv);
      return [h('li', {}, h('code', {}, rule.name), `${rule.onFail === 'warn' ? ' (warns)' : ''}: ${pct(rv)}, `, at === 'within' ? 'within' : h('b', { class: 'off' }, at), ` ${pct(rr.low)} to ${pct(rr.high)}`)];
    });
    if (rows.length) box.append(h('p', { class: 'foot' }, 'Each rule’s share of the trips it fails, against its own normal range:'), h('ul', { class: 'rule-ranges' }, ...rows));
  }
  return box;
}

/** How the ranges held over the year before the month's loads: each day against its own range. */
function backtestLine(ranges: NormalRanges, m: Metric): HTMLElement | null {
  const first = loads.list[mainLoads()[0] ?? -1]?.day;
  if (!first) return null;
  const [from, to] = [dayPlus(first, -365), dayPlus(first, -1)];
  const key = `${metricKey(m)}|${from}`;
  let b = backtests.get(key);
  if (!b) backtests.set(key, (b = ranges.backtest(from, to)));
  if (!b.ordinary.days) return null;
  const holidays = b.outside.filter((o) => o.range.special).map((o) => `${o.range.special === 'Christmas week' ? shortDay(o.day) : o.range.special} (${o.place})`);
  return h('p', { class: 'foot' }, `Over the year before, ${shortDay(from)}, ${from.slice(0, 4)} to ${shortDay(to)}, ${to.slice(0, 4)}: ${plural(b.ordinary.outside, 'ordinary day')} of ${fmtInt(b.ordinary.days)} (${pct(b.ordinary.outside / b.ordinary.days)}) fell outside their range, and ${b.special.outside} of ${plural(b.special.days, 'holiday')}${holidays.length ? `: ${listed(holidays.slice(0, 4))}${holidays.length > 4 ? ` and ${holidays.length - 4} more` : ''}` : ''}.`);
}

function renderRuns(): void {
  renderRecord();
  const list = $('runs-list');
  if (state.runs.length === 0) {
    list.replaceChildren(h('li', { class: 'panel' }, h('p', { class: 'foot' }, state.failed ? state.failed.message : 'The first run starts as soon as the data is loaded.')));
    return;
  }
  list.replaceChildren(
    ...state.runs.map((r) => {
      const m = r.result.manifest;
      // Anyone but the owner sees the run as far as they can see the flow: no steps closed to them, no full record.
      const owner = isOwner();
      const nodes = m.nodes.filter((n) => owner || visible(n.origin));
      const count = (status: string) => nodes.filter((n) => n.status === status).length;
      const li = h('li', { class: 'panel' });
      li.append(
        h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `Run ${r.result.run}`), r.load !== undefined && loads.list[r.load] ? h('span', { class: 'pill load-pill' }, dayLabel(loads.list[r.load]!.day)) : null, h('span', { class: 'pill' }, `${count('built')} built`), h('span', { class: 'pill' }, `${count('reused')} reused`), h('span', { class: 'pill' }, `${count('folded')} folded`), h('span', { class: 'foot num' }, `${fmtMs(r.ms)} · ${r.at.toLocaleTimeString()}`)),
        h('p', { class: 'rec-root' }, 'Manifest: ', hash4(r.result.hash, 'manifest hash')),
        runFiles(r) ?? '',
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: () => void verify(r, 'rerun') }, 'Verify'),
          h('button', { class: 'btn quiet', type: 'button', onclick: () => void verify(r, 'rederive') }, 'Re-derive from the files'),
          owner ? h('button', { class: 'btn quiet', type: 'button', onclick: () => void sign(r) }, r.signed ? 'Signed' : 'Sign') : null),
      );
      if (r.verified) {
        const checks = r.verified.checks.filter((c) => owner || visible(c.origin));
        const failed = checks.filter((c) => !c.ok);
        li.append(
          levelPills(r),
          h('div', { class: 'row' }, h('span', { class: `pill ${r.verified.ok ? 'ok' : 'bad'}` }, r.verified.ok ? 'verified' : 'verification failed'), h('span', { class: 'foot' }, `${checks.length} checks: ${LEVEL_SAYS[r.verified.level]}`)),
          h('ul', { class: 'checks' }, ...(failed.length ? failed : checks).slice(0, 12).map((c) => h('li', {}, h('span', { class: c.ok ? 'ok' : 'bad' }, c.ok ? 'ok' : 'failed'), h('span', {}, `${c.origin} · ${c.check}${c.note ? ` · ${c.note}` : ''}`)))),
        );
      }
      if (r.signed && owner) li.append(h('div', { class: 'row' }, h('span', { class: `pill ${r.signatureOk ? 'ok' : 'bad'}` }, r.signatureOk ? 'signature valid' : 'signature invalid'), h('span', { class: 'hash' }, `${r.signed.signer.name} · ${short(r.signed.signer.fingerprint)}`)));
      if (owner) li.append(h('details', {}, h('summary', {}, 'The manifest'), h('pre', { class: 'code' }, JSON.stringify(JSON.parse(canonicalJSON(m)), null, 2))));
      return li;
    }),
  );
}

const LEVEL_SAYS: Record<VerifyLevel, string> = {
  stored: 'the hashes, keys, links and counts as stored',
  rerun: 'the hashes, keys, links and counts as stored, then a recomputation from the snapshots',
  rederive: 'the source files decoded again, the hashes, keys, links and counts, then a recomputation',
};

/** What a run is proven to be, level by level (ADR 0006 §1): what was checked lights up. */
function levelPills(r: RunRecord): HTMLElement {
  const reached = levelOf(r);
  const pill = (n: number, label: string, title: string) => h('span', { class: `pill ${reached >= n ? 'ok' : 'off'}`, title }, label);
  return h('div', { class: 'levels', 'aria-label': 'What has been checked' },
    pill(1, 'Intact', 'Its hashes, keys, links and counts check: against accidents and naive edits'),
    pill(2, 'Recomputed', 'Recomputed from its snapshots in this session: the same datasets'),
    pill(3, 'Re-derived', 'Its source files decoded again to the same snapshots, then recomputed'));
}

/** The files a run read, as the engine saw their bytes, and the data's list they came from. */
function runFiles(r: RunRecord): HTMLElement | null {
  const m = r.result.manifest;
  const files = m.nodes.filter((n) => n.file);
  if (!files.length && !m.data) return null;
  return h('div', { class: 'part' },
    h('p', { class: 'eyebrow' }, 'Read, by hash'),
    h('ul', { class: 'chain' }, ...files.map((n) => h('li', {},
      h('p', { class: 'c-what' }, `${n.origin}: ${n.file!.location.replace(PINNED_PREFIX_APP, '')}, ${fmtInt(n.file!.bytes)} bytes`),
      h('p', { class: 'c-line' }, 'sha256 ', hash4(n.file!.sha256, `${n.origin} file hash`)),
      h('p', { class: 'c-line' }, `→ ${fmtInt(n.rows ?? 0)} rows, content ${short(n.content ?? '')}`)))),
    m.data ? h('p', { class: 'foot' }, `Checked against the data's list at commit ${m.data.commit.slice(0, 12)} (MANIFEST.json ${m.data.manifest.slice(0, 12)}…); built from smaltfl ${m.build?.smaltfl.slice(0, 12) ?? 'dev'}.`) : null);
}
const PINNED_PREFIX_APP = 'smaltfl:';

async function verify(r: RunRecord, level: VerifyLevel = 'rerun'): Promise<void> {
  if (!state.engine) return;
  setStatus(`Verifying run ${r.result.run}${level === 'rederive' ? ', decoding its files again' : ''}…`);
  // A run re-derives from its own bytes: when another day is pinned now, the run's day is fetched, checked and pinned
  // again for it, and the day pinned now is put back after.
  const trips = r.result.manifest.nodes.find((n) => n.file?.location === 'smaltfl:trips.parquet')?.file;
  const runDay = trips ? loads.list.findIndex((l) => l.sha256 === trips.sha256) : -1;
  const swap = level === 'rederive' && runDay >= 0 && runDay !== loads.pinned;
  try {
    if (swap) await pinFile(state.engine, 'trips.parquet', loads.bytes.get(runDay) ?? (await checked(loads.list[runDay]!.file, { sha256: loads.list[runDay]!.sha256, bytes: loads.list[runDay]!.bytes ?? -1 })), loads.list[runDay]!.sha256);
    r.verified = await verifyRun(state.engine, r.result.run, { smaltdb: SMALTDB, level, manifest: r.result.hash });
    if (swap && loads.pinned >= 0) {
      const now = loads.list[loads.pinned]!;
      await pinFile(state.engine, 'trips.parquet', loads.bytes.get(loads.pinned) ?? (await checked(now.file, { sha256: now.sha256, bytes: now.bytes ?? -1 })), now.sha256);
    }
    const failed = r.verified.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`);
    if (ledger) await ledger.append('verify', state.viewer, { run: r.result.run, manifest: r.result.hash, level, ok: r.verified.ok, failed, smaltdb: SMALTDB });
    setStatus(r.verified.ok ? `Run ${r.result.run} ${LEVEL_DONE[level]}.` : `Run ${r.result.run} failed verification: ${failed.slice(0, 3).join(', ')}.`, !r.verified.ok);
  } catch (e) {
    setStatus(message(e), true);
  }
  renderRuns();
  renderCanvas();
  if (state.selected) void renderSheet();
}
const LEVEL_DONE: Record<VerifyLevel, string> = {
  stored: 'is intact: every hash, key and link checks',
  rerun: 'recomputed: every hash, key and link checks, and recomputing it from its snapshots gave the same datasets',
  rederive: 're-derived: its source files decode to the same snapshots, and recomputing them gave the same datasets',
};

async function sign(r: RunRecord): Promise<void> {
  state.identity ??= ledger?.identity ?? (await createIdentity('This browser'));
  r.signed = await signManifest(r.result.manifest, state.identity);
  r.signatureOk = (await verifyManifest(r.signed, state.identity.card)).ok;
  if (ledger) await ledger.append('sign', state.viewer, { run: r.result.run, manifest: r.result.hash, signature: r.signed.signature });
  renderRuns();
}

// ------------------------------------------------------------------ running

async function run(): Promise<void> {
  const engine = state.engine;
  if (!engine || state.running) return;
  state.running = true;
  attempts++;
  state.failed = null;
  $<HTMLButtonElement>('run').disabled = true;
  setStatus(state.runs.length ? 'Running: only what changed is rebuilt…' : 'Running the flow…');
  renderCanvas();
  const t = performance.now();
  try {
    // A load's own month, for the checks that ask which month a trip is in: last year's loads are a year back.
    const loadDay = loads.list.length > 1 ? loads.list[loads.pinned]?.day : undefined;
    const month: Record<string, string> = state.doc.parameters?.some((x) => x.name === 'month') && loadDay ? { month: loadDay.slice(0, 7) } : {};
    const data = integrity.data ? { commit: integrity.data.commit, manifest: integrity.data.manifest } : null;
    const result = await runFlow(engine, state.doc, { smaltdb: SMALTDB, parameters: month, data, log: recordHead() });
    const ms = performance.now() - t;
    state.runs.unshift({ result, ms, at: new Date(), ...(loads.pinned >= 0 && loads.list.length > 1 ? { load: loads.pinned } : {}) });
    // What is shown is what ran: after a refused day, a run on the day still pinned shows that day.
    if (loads.pinned >= 0) loads.at = loads.pinned;
    await recordRun(result, null);
    await learnColumns();
    const count = (status: string) => result.manifest.nodes.filter((n) => n.status === status && (isOwner() || visible(n.origin))).length;
    void computeChanges();
    await refreshEdits();
    const day = loads.list.length > 1 && loads.list[loads.pinned] ? `${dayLabel(loads.list[loads.pinned]!.day)}: ` : '';
    const stats = `${day}Run ${result.run} took ${fmtMs(ms)}: ${count('built')} built, ${count('reused')} reused, ${count('folded')} folded${engine.mode === 'page' ? ' (the engine runs in the page here)' : ''}.`;
    setStatus(loads.list.length > 1 && loads.pinned >= 0 ? dayStatus(loads.pinned, stats) : stats, false, { n: attempts, state: 'done' });
    $('status').title = stats;
  } catch (e) {
    const msg = message(e);
    const origin = /^([A-Za-z][A-Za-z0-9_]*): /.exec(msg)?.[1];
    state.failed = { origin: origin && (steps().has(origin) || sourceIds().has(origin)) ? origin : undefined, message: msg };
    // A gate that held, or a refused file, is said as the day's state; any other failure with its message.
    const held = state.failed.origin && steps().get(state.failed.origin)?.kind === 'expectations';
    const k = loads.pinned >= 0 ? loads.pinned : loads.at;
    const l = loads.list[k];
    setStatus(held && l ? dayStatus(k, `${dayLabel(l.day).replace(/, \d{4}$/, '')}: Held at ${state.failed.origin}`) : `The run failed, and the previous results stay current. ${msg}`, true, { n: attempts, state: 'failed' });
    $('status').title = msg;
    await recordRun(null, msg);
  } finally {
    state.running = false;
    $<HTMLButtonElement>('run').disabled = false;
    // A held run leaves on screen the last day before it that passed, which may not be the run counted last.
    syncShown();
    renderCanvas();
    renderRuns();
    if (state.selected) void renderSheet();
    if (location.hash === '#results') void renderResults();
    if (location.hash === '#policies') void renderPolicies();
    if (location.hash === '#ontology') void renderOntology();
  }
}

/**
 * A run in the record: its manifest kept by hash, the files it read, and the load; a failed one with why. Before it,
 * the flow, when it changed since the record last saw it, whatever changed it.
 */
async function recordRun(result: RunResult | null, error: string | null): Promise<void> {
  if (!ledger) return;
  try {
    const fh = await flowHash(state.doc);
    const last = ledger.last('flow');
    const before = (last?.about as { after?: string } | null)?.after ?? null;
    if (before !== fh) {
      const doc = await ledger.keep('flow', withoutDisplay(state.doc));
      await ledger.append('flow', state.viewer, { before, after: fh, doc });
    }
    // The day whose file the engine had pinned: what the run read, whatever day is on screen.
    const load = loads.list[loads.pinned]?.day ?? null;
    if (result) {
      const blob = await ledger.keep('manifest', result.manifest);
      // The plan it ran, kept by the record too: a run from an earlier visit still carries it when exported.
      const planRow = state.engine ? (await state.engine.query(`SELECT plan FROM _smaltfl_plans WHERE hash = '${result.manifest.plan.replace(/[^0-9a-f]/g, '')}'`)).rows[0] : undefined;
      const plan = planRow ? await ledger.keep('plan', JSON.parse(String(planRow[0]))) : null;
      const files = result.manifest.nodes.filter((n) => n.file).map((n) => ({ source: n.origin, ...n.file! }));
      await ledger.append('run', state.viewer, { run: result.run, manifest: result.hash, blob, plan, load, outcome: 'ok', files: files as unknown as JSONValue, data: result.manifest.data ?? null });
    } else await ledger.append('run', state.viewer, { run: null, load, outcome: 'failed', error });
  } catch (e) {
    console.warn(`smaltfl: couldn't record the run: ${message(e)}`);
  }
}

// ------------------------------------------------------------------ integrity, card by card

/** The file a source reads now: the day's load for the trips, else the one the data's list names for it. */
function fileOf(source: string): string | undefined {
  const src = state.doc.sources.find((x) => x.id === source);
  const ex = src && EXAMPLE_SOURCES.find((e) => e.table === src.table);
  if (!ex) return undefined;
  if (ex.file === 'trips.parquet') return loads.list[loads.at]?.file ?? integrity.files.trips?.path;
  return integrity.files[ex.file.split('.')[0]!]?.path;
}

/** A source's file check, as news: refused bytes first of all, a republished file worth knowing. */
function integrityNews(id: string): Finding[] {
  const path = sourceIds().has(id) ? fileOf(id) : undefined;
  const c = path ? integrity.checks.get(path) : undefined;
  const list = integrity.checks.get('MANIFEST.json');
  const check = list && fileSeverity(list.class) === 'alert' ? list : c;
  if (!check) return [];
  const sev = fileSeverity(check.class);
  if (sev === 'ok') return [];
  const said = describeFile(check);
  return [{ key: `integrity:${check.path}`, kind: 'integrity', severity: sev, score: 100, title: said.title, detail: said.detail, look: 'integrity', table: id, acts: sev === 'alert' ? ['refetch', 'notify', 'export'] : ['expected', 'export'] }];
}

/** The check of the file a run read: the one whose bytes hashed to what the run's engine recorded. */
function checkOfRead(sha256: string | undefined): FileCheck | undefined {
  if (!sha256) return undefined;
  for (const c of integrity.checks.values()) if (c.actual === sha256 && fileSeverity(c.class) !== 'alert') return c;
  return undefined;
}

/** How far a run is proven (ADR 0006 §1), each level by its own checks: 0 none, 1 Intact, 2 Recomputed, 3 Re-derived. */
function levelOf(r: RunRecord | undefined): number {
  const v = r?.verified;
  if (!v) return 0;
  const ok = (kinds: string[]) => v.checks.filter((c) => kinds.includes(c.check)).every((c) => c.ok);
  const stored = ok(['stored', 'coherent', 'key', 'published', 'previous', 'accounting', 'flow']);
  if (!stored) return 0;
  if (v.level === 'stored') return 1;
  if (!ok(['rerun', 'expectations'])) return 1;
  if (v.level === 'rerun') return 2;
  return ok(['file']) ? 3 : 2;
}

/**
 * A card's seal (ADR 0006 §9), apart from its news dot. An input is sealed when the file the latest run read is one
 * the data's list publishes (its check passed) and the engine recorded reading it; a step, when the latest run was
 * re-derived from its files and every check of that step passed. A refused file, a failed check of the step, or a
 * failed check of the whole run breaks the seal. Nothing is sealed when the flow changed since the run, and the seal is
 * amber where the engine runs in the page (its hashes are then the page's own).
 */
function sealOf(card: string): 'ok' | 'bad' | 'amber' | null {
  const id = dataOf(card);
  // No tick from another day's run: on a held or refused day, what the load reaches has no run of its own to seal.
  const src = loadSource();
  if (rowsFrom(shownDay(), viewedDay()) && src && (id === src || downstreamOf(src).includes(id))) return null;
  const r = latest();
  const v = r?.verified;
  if (v && !v.ok && v.checks.some((c) => !c.ok && c.node === -1)) return 'bad';
  if (sourceIds().has(id)) {
    const n = integrityNews(id)[0];
    if (n) return n.severity === 'alert' ? 'bad' : 'amber';
    if (v?.checks.some((c) => c.origin === id && !c.ok)) return 'bad';
    const node = r?.result.manifest.nodes.find((x) => x.origin === id);
    if (!node?.file || !checkOfRead(node.file.sha256)) return null;
    return state.engine?.mode === 'page' ? 'amber' : 'ok';
  }
  if (!r || !v || flowChanged(r)) return null;
  const node = r.result.manifest.nodes.find((x) => x.origin === id);
  if (!node) return null;
  const mine = v.checks.filter((c) => c.origin === id);
  if (mine.some((c) => !c.ok)) return 'bad';
  return levelOf(r) === 3 ? (state.engine?.mode === 'page' ? 'amber' : 'ok') : null;
}

/** Whether the flow on screen is no longer the one the run ran. */
const flowHashNow = { doc: null as FlowDocument | null, hash: '' };
function flowChanged(r: RunRecord): boolean {
  if (flowHashNow.doc !== state.doc) {
    flowHashNow.doc = state.doc;
    flowHashNow.hash = '';
    void flowHash(state.doc).then((h) => {
      flowHashNow.hash = h;
      requestCanvas();
    });
  }
  return flowHashNow.hash !== '' && flowHashNow.hash !== r.result.manifest.flow.hash;
}

async function integrityTab(card: string, id: string, who: string): Promise<HTMLElement> {
  void who;
  const box = h('div', { class: 'integrity-tab' });
  const r = latest();
  if (!r) return h('p', { class: 'foot' }, 'Run the flow to see what it read and made, by hash.');
  const m = r.result.manifest;
  const seal = sealOf(card);
  const want = new Set([id, ...upstreamOf(id)].map((x) => x.toLowerCase()));
  const chainNodes = m.nodes.filter((n) => want.has(n.origin.toLowerCase()));
  const v = r.verified;
  const checksOf = (origin: string) => v?.checks.filter((c) => c.origin === origin) ?? [];
  // Green only once sealed: a run recorded but not yet verified is said in grey (ADR 0008).
  box.append(h('div', { class: `verdict ${seal === 'bad' ? 'alert' : seal === 'amber' ? 'warn' : seal === 'ok' || levelOf(r) > 0 ? 'ok' : 'note'}` },
    h('p', { class: 'v-day' }, `Run ${r.result.run}${r.load !== undefined && loads.list[r.load] ? ` · ${dayLabel(loads.list[r.load]!.day)}` : ''}`),
    h('h3', { class: 'v-head' }, seal === 'bad' ? 'The chain is broken'
      : sourceIds().has(id) ? (seal === 'ok' ? 'Sealed: the bytes published' : seal === 'amber' ? 'Read, with a note' : 'Recorded, not yet matched to the list')
      : ['Recorded, not yet verified', 'Intact: every hash, key and link checks', 'Recomputed: the same datasets from the snapshots', 'Sealed: re-derived from the files’ bytes'][levelOf(r)]!),
    h('p', { class: 'v-line' }, sourceIds().has(id)
      ? (seal === 'ok' ? 'Its bytes, hashed by the engine, are the ones the data’s list publishes.' : state.engine?.mode === 'page' ? 'The engine runs in this page: an audit outside the browser vouches for its hashes.' : 'The file the run read, against the data’s list.')
      : 'Every step back to the files’ bytes, each with its hash. Re-deriving seals it.')),
    levelPills(r),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => void verify(r, 'rerun') }, 'Verify the run'),
      h('button', { type: 'button', class: 'btn small quiet', onclick: () => void verify(r, 'rederive') }, 'Re-derive from the files'),
      ledger ? h('button', { type: 'button', class: 'btn small quiet', onclick: () => void exportAudit() }, 'Export for audit') : null));
  const items = chainNodes.slice().reverse().map((n) => {
    const bad = checksOf(n.origin).some((c) => !c.ok);
    const fileCheck = n.file ? checkOfRead(n.file.sha256) : undefined;
    const lines: Child[] = [];
    if (n.file) {
      lines.push(h('p', { class: 'c-line' }, `Read ${n.file.location.replace('smaltfl:', '')} (${fmtInt(n.file.bytes)} bytes), hashed by the engine:`), h('p', { class: 'c-line' }, 'sha256 ', hash4(n.file.sha256, `${n.origin} file hash`)));
      lines.push(h('p', { class: `c-line ${fileCheck ? '' : 'bad'}` }, fileCheck ? `${describeFile(fileCheck).title}${fileCheck.commit ? `, data commit ${fileCheck.commit.slice(0, 12)}` : ''}.` : 'Not matched to the data’s list in this visit.'));
    } else if (n.op === 'table') lines.push(h('p', { class: 'c-line' }, 'A table in the database, snapshotted by its rows: no file.'));
    if (n.content) lines.push(h('p', { class: 'c-line' }, `${fmtInt(n.rows ?? 0)} rows, content `, hash4(n.content, `${n.origin} content hash`)));
    else lines.push(h('p', { class: 'c-line muted' }, 'folded into the step that reads it'));
    lines.push(h('p', { class: 'c-line' }, 'key ', h('span', { class: 'hash' }, short(n.key)), ` · ${n.status}`));
    for (const c of checksOf(n.origin)) lines.push(h('p', { class: `c-line ${c.ok ? '' : 'bad'}` }, `${c.ok ? '✓' : '✗'} ${c.check}${c.note ? `: ${c.note}` : ''}`));
    return h('li', { class: bad ? 'bad' : v ? '' : 'unchecked' }, h('p', { class: 'c-what' }, `${n.origin} · ${n.op}`), ...lines);
  });
  box.append(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'From this card back to the bytes'), h('ul', { class: 'chain' }, ...items)));
  box.append(h('p', { class: 'foot' }, `Manifest `, hash4(r.result.hash, 'manifest hash'), `. Kept in this browser’s record${ledger ? ` (#${ledger.last('run', (e) => (e.about as { manifest?: string }).manifest === r.result.hash)?.seq ?? '?'})` : ''}, with the flow and plan it ran.`));
  return box;
}

// ------------------------------------------------------------------ the record, on screen

declare const __SMALTFL_COMMIT__: string | undefined;
declare const __SMALTFL_DATA__: { commit: string; manifest: string; bytes: number } | null | undefined;
/** The data branch commit and list this page was built with, or null for a build from the fixtures. */
const BUILT_DATA = typeof __SMALTFL_DATA__ === 'object' ? __SMALTFL_DATA__ : null;
/** The commit this page was built from (or dev), as a run's manifest records it. */
const BUILD_COMMIT = typeof __SMALTFL_COMMIT__ === 'string' && __SMALTFL_COMMIT__ !== '' ? __SMALTFL_COMMIT__ : 'dev';

/** A full hash in groups of four, with a button to copy it: long enough to compare with a copy kept elsewhere. */
/** A hash, its first eight characters at a glance; a tap shows all of it, grouped, with Copy (ADR 0008). */
function hash4(hash: string, label = 'hash'): HTMLElement {
  const groups = hash.match(/.{1,4}/g)?.join(' ') ?? hash;
  const full = h('span', { class: 'hash4-full', hidden: true }, groups, ' ', h('button', { type: 'button', class: 'btn small quiet', 'aria-label': `Copy the ${label}`, onclick: () => void navigator.clipboard?.writeText(hash).then(() => setStatus(`Copied the ${label}.`)).catch(() => setStatus(`The ${label}: ${hash}`)) }, 'Copy'));
  const short8 = h('button', { type: 'button', class: 'hash4-short', 'aria-label': `The ${label}: show all of it`, onclick: () => ((full.hidden = !full.hidden), (short8.textContent = full.hidden ? `${hash.slice(0, 8)}…` : 'hide')) }, `${hash.slice(0, 8)}…`);
  return h('span', { class: 'hash4' }, short8, full);
}

/** A file to save: downloaded where the browser allows it, else shared. */
async function saveFile(name: string, bytes: Uint8Array<ArrayBuffer> | string, type: string): Promise<void> {
  const blob = new Blob([bytes], { type });
  try {
    const a = h('a', { href: URL.createObjectURL(blob), download: name }) as HTMLAnchorElement;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    const nav = navigator as Navigator & { share?: (d: { files: File[] }) => Promise<void> };
    await nav.share?.({ files: [new File([blob], name, { type })] });
  }
}

const KIND_WORD: Record<string, (e: { about: Record<string, unknown>; by: { as: string } }) => string> = {
  run: ({ about: a }) => (a.outcome === 'ok' ? `Ran the flow${a.load ? ` on ${dayLabel(String(a.load))}` : ''}: run ${String(a.run)}, manifest ${String(a.manifest).slice(0, 12)}…, ${Array.isArray(a.files) ? `${a.files.length} file${a.files.length === 1 ? '' : 's'} read by their hashes` : ''}` : `A run${a.load ? ` on ${dayLabel(String(a.load))}` : ''} stopped: ${String(a.error ?? '')}`),
  flow: ({ about: a }) => (a.before ? `The flow changed: ${String(a.before).slice(0, 12)}… to ${String(a.after).slice(0, 12)}…` : `The flow as it first ran here: ${String(a.after).slice(0, 12)}…`),
  file: ({ about: a }) => describeFile(a as unknown as FileCheck).title,
  act: ({ about: a, by }) => `${personName(by.as)} ${ACT_DONE[a.act as LogAct] ?? String(a.act)}: ${String(a.title)}`,
  verify: ({ about: a }) => (a.ok ? `Run ${String(a.run)} ${LEVEL_DONE[a.level as VerifyLevel] ?? 'verified'}` : `Run ${String(a.run)} failed verification: ${(a.failed as string[]).slice(0, 3).join(', ')}`),
  sign: ({ about: a }) => `Signed run ${String(a.run)}'s manifest`,
  edit: ({ about: a }) => {
    const e = a.edit as { action?: string; objectType?: string; outcome?: string } | null;
    return `${e?.action ?? 'An action'} on a ${e?.objectType ?? 'object'}: ${e?.outcome ?? ''}`;
  },
  import: ({ about: a }) => `Imported ${Array.isArray(a.entries) ? a.entries.length : 0} entries from the old data log (its chain ${a.chainOk ? 'held' : 'was broken'})`,
  export: ({ about: a }) => `Exported for audit at ${String(a.size)} entries`,
  check: ({ about: a }) => (a.ok ? `Checked against a checkpoint kept elsewhere, at ${String(a.size)} entries: consistent` : `Checked against a checkpoint kept elsewhere: ${String(a.reason)}`),
};
const ROUTINE = new Set(['file', 'sign']);

function renderRecord(): void {
  const box = document.getElementById('record');
  if (!box) return;
  if (!ledger) {
    box.replaceChildren(h('p', { class: 'foot' }, 'The record is opening…'));
    return;
  }
  const st = ledger.status!;
  const pill = st.ok ? h('span', { class: 'pill ok' }, 'record intact') : h('span', { class: 'pill bad' }, st.firstBad !== null ? `record broken at #${st.firstBad}` : 'record broken');
  const where = ledger.durable ? 'kept in this browser' : 'kept for this visit only: this browser has no storage for it';
  const card = ledger.identity.card;
  const recent = [...ledger.entries].reverse();
  const shown = recent.filter((e) => !ROUTINE.has(e.kind)).slice(0, 15);
  const routine = recent.filter((e) => ROUTINE.has(e.kind)).length;
  const line = (e: (typeof recent)[number]) => {
    const say = KIND_WORD[e.kind];
    return h('li', {}, h('span', { class: 'seq' }, `#${e.seq}`), h('span', {}, say ? say(e as never) : e.kind), h('span', { class: 'when' }, `${new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${personName(e.by.as)}`));
  };
  const pick = h('input', { type: 'file', accept: '.json,application/json', hidden: true }) as HTMLInputElement;
  pick.addEventListener('change', () => void checkAgainst(pick.files?.[0]));
  box.replaceChildren(
    h('h2', {}, 'The record'),
    h('div', { class: 'rec-head' }, pill, h('span', {}, `${st.size === 1 ? '1 entry' : `${fmtInt(st.size)} entries`} · signed${st.signed === st.size ? '' : ` to #${st.signed}`} by ${card.name} · ${where}`)),
    st.reason ? h('p', { class: 'status bad' }, st.reason) : '',
    ledger.lost ? h('p', { class: 'status bad' }, `${ledger.lost === 1 ? 'An entry' : `${ledger.lost} entries`} couldn’t be kept: the browser’s storage refused ${ledger.lost === 1 ? 'it' : 'them'}, so the record is missing what ${ledger.lost === 1 ? 'it' : 'they'} said.`) : '',
    h('p', { class: 'rec-root' }, 'Root: ', hash4(st.root, 'record root'), h('br'), 'Signer: ', hash4(card.fingerprint, 'signer fingerprint')),
    h('p', { class: 'foot' }, 'Only a checkpoint kept outside this browser proves the record wasn’t rewritten: download one now and then, and keep it somewhere else. An auditor’s export carries the record, every manifest it names, and a proof for each dataset.'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn', onclick: () => void exportAudit() }, 'Export for audit'),
      h('button', { type: 'button', class: 'btn quiet', onclick: () => void downloadCheckpoint() }, 'Download a checkpoint'),
      h('button', { type: 'button', class: 'btn quiet', onclick: () => pick.click() }, 'Check against a checkpoint'), pick),
    h('ul', { class: 'timeline' }, ...shown.map(line)),
    routine ? h('details', { class: 'fold' }, h('summary', {}, `${routine === 1 ? '1 routine entry' : `${fmtInt(routine)} routine entries`}: files first read, signatures`), h('ul', { class: 'timeline' }, ...recent.filter((e) => ROUTINE.has(e.kind)).slice(0, 40).map(line))) : '',
  );
}

async function downloadCheckpoint(): Promise<void> {
  if (!ledger) return;
  const cp = ledger.latest() ?? (await ledger.sign());
  const size = ledger.head().size;
  await saveFile(`smaltfl-checkpoint-${state.doc.id}-${size}.json`, JSON.stringify(cp, null, 2) + '\n', 'application/json');
  setStatus(`A checkpoint of the record at ${fmtInt(size)} entries: keep it somewhere other than this browser.`);
}

async function checkAgainst(file: File | undefined): Promise<void> {
  if (!ledger || !file) return;
  let envelope: unknown;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    setStatus(`${file.name} isn't a checkpoint.`, true);
    return;
  }
  const r = await ledger.consistentWith(envelope);
  await ledger.append('check', state.viewer, { ok: r.ok, size: r.size, reason: r.reason, file: file.name });
  setStatus(r.ok ? `The record is consistent with the checkpoint at ${fmtInt(r.size)} entries: nothing before it was changed, removed or put in.` : `The record doesn't match the checkpoint: ${r.reason}.`, !r.ok);
  renderRecord();
}

/**
 * The audit bag (E9): the record and its checkpoints, the signer's card, every manifest, plan and flow document the
 * record names, the data's list, a proof for each dataset of the latest run, and a readable account. The source files
 * are left out: an auditor gets each from the data branch by its sha256.
 */
async function exportAudit(): Promise<void> {
  if (!ledger) return;
  const r = latest();
  if (r && !r.verified && state.engine) {
    setStatus('Checking the latest run before the export: recomputing it…');
    await verify(r, 'rerun');
  }
  await ledger.append('export', state.viewer, { size: ledger.entries.length, root: ledger.head().root });
  // The record as the bag names it, taken once: every proof below is against this head, whatever is appended after.
  const head = ledger.head();
  const entries = ledger.entries.slice(0, head.size);
  const checkpoints = [...ledger.checkpoints];
  const enc = new TextEncoder();
  const json = (v: unknown) => enc.encode(JSON.stringify(v, null, 2) + '\n');
  const payload: { path: string; bytes: Uint8Array }[] = [
    { path: 'record/entries.jsonl', bytes: enc.encode(entries.map((e) => canonicalJSON(e as unknown as Parameters<typeof canonicalJSON>[0])).join('\n') + '\n') },
    { path: 'record/checkpoints.jsonl', bytes: enc.encode(checkpoints.filter((c) => parseCheckpoint(c.checkpoint).size <= head.size).map((c) => JSON.stringify(c)).join('\n') + '\n') },
    { path: 'record/card.json', bytes: json(ledger.identity.card) },
  ];
  for (const b of await ledger.blobs()) payload.push({ path: `blobs/${b.kind}-${b.hash}.json`, bytes: enc.encode(b.json + '\n') });
  // What the engine holds of this visit's runs, when it is running (a refused start-up leaves it without one).
  if (state.engine) {
    for (const [hash, plan] of (await state.engine.query('SELECT hash, plan FROM _smaltfl_plans')).rows) payload.push({ path: `engine/plans/${String(hash)}.json`, bytes: enc.encode(String(plan) + '\n') });
    for (const [hash, doc] of (await state.engine.query('SELECT hash, doc FROM _smaltfl_flows')).rows) payload.push({ path: `engine/flows/${String(hash)}.json`, bytes: enc.encode(String(doc) + '\n') });
    for (const [id, hash, manifest] of (await state.engine.query('SELECT id, hash, manifest FROM _smaltfl_runs')).rows) payload.push({ path: `engine/runs/${String(id)}-${String(hash)}.json`, bytes: enc.encode(String(manifest) + '\n') });
  }
  if (integrity.manifestBytes) payload.push({ path: 'data/MANIFEST.json', bytes: integrity.manifestBytes });
  if (integrity.data) payload.push({ path: 'data/commit.txt', bytes: enc.encode(`${integrity.data.commit}\n`) });
  // A proof for each dataset of the latest run: its run entry is in the record whose root the bag names.
  const runEntry = r ? [...entries].reverse().find((e) => e.kind === 'run' && (e.about as { manifest?: string }).manifest === r.result.hash) : undefined;
  if (r && runEntry) {
    for (const [name, rec] of Object.entries(r.result.manifest.outputs)) payload.push({ path: `proofs/${name}.json`, bytes: json({ dataset: name, ...rec, run: r.result.run, manifest: r.result.hash, entry: runEntry, inclusion: ledger.proofOf(runEntry.seq, head.size) }) });
  }
  payload.push({ path: 'README.html', bytes: enc.encode(auditReadme(head, r)) });
  const name = `smaltfl-audit-${state.doc.id}-${head.size}`;
  const files = await buildBag({
    name,
    payload,
    info: [
      ['Source-Organization', 'smaltfl'],
      ['External-Identifier', `${head.origin} ${head.size} ${head.root}`],
      ['Signer-Fingerprint', ledger.identity.card.fingerprint],
      ['Smaltfl-Commit', BUILD_COMMIT],
      ['Data-Commit', integrity.data?.commit ?? 'none: fixtures'],
      ['Data-Manifest-SHA256', integrity.data?.manifest ?? 'none'],
      ['Internal-Sender-Description', 'Everything this browser holds of the flow: an auditor checks it with sha256sum -c and node scripts/audit.mjs, without trusting the browser that made it.'],
    ],
    date: new Date().toISOString(),
  });
  const bytes = zip(files.map((f) => ({ path: f.path, bytes: f.bytes, date: new Date() })));
  await saveFile(`${name}.zip`, bytes, 'application/zip');
  setStatus(`Exported ${plural(files.length, 'file')} for audit: the record at ${fmtInt(head.size)} entries, root ${head.root.slice(0, 16)}….`);
  renderRecord();
}

function auditReadme(head: { origin: string; size: number; root: string }, r: RunRecord | undefined): string {
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const files = r?.result.manifest.nodes.filter((n) => n.file).map((n) => `<li>${esc(n.origin)}: ${esc(n.file!.location)}, ${n.file!.bytes} bytes, sha256 <code>${n.file!.sha256}</code></li>`).join('') ?? '';
  return `<!doctype html><meta charset="utf-8"><title>smaltfl audit: ${esc(state.doc.name)}</title>
<h1>${esc(state.doc.name)}: an audit bag</h1>
<p>Rendered from the record <code>${esc(head.origin)}</code> at ${head.size} entries, root <code>${head.root}</code>.</p>
<h2>How to check it</h2>
<ol><li><code>sha256sum -c tagmanifest-sha256.txt manifest-sha256.txt</code>: every file is what the bag says.</li>
<li><code>node scripts/audit.mjs check this-bag.zip</code>, from your own checkout of smaltfl at the commit in bag-info.txt: the record's entries hash to its root, every checkpoint is signed by the card in record/card.json, every run's manifest is here and hashes to what the record says, and each dataset's proof holds.</li>
<li><code>git show &lt;Data-Commit&gt;:MANIFEST.json | sha256sum</code>: the data's list is the one the app read; each source file below is in it, by its sha256.</li>
<li><code>node scripts/audit.mjs consistent your-checkpoint.json this-bag.zip</code>: the record is a continuation of a checkpoint you kept, so nothing before it was rewritten.</li></ol>
<h2>The latest run</h2>
${r ? `<p>Run ${r.result.run}, manifest <code>${r.result.hash}</code>${r.verified ? `, ${r.verified.ok ? 'verified' : 'failed verification'} at the ${r.verified.level} level` : ''}. It read:</p><ul>${files}</ul>` : '<p>No run yet.</p>'}
<h2>What this proves, and what it doesn't</h2>
<p>Hashes and signatures prove that nothing in the bag changed after it was made, and that the record grew only by appending. Against someone who controls the browser that made it, only a checkpoint you kept elsewhere proves the record wasn't rewritten. Numbers the app computes on screen (profiles, odd rows, the news) are not in the bag; the stored datasets and the checks' counts are, by hash.</p>
`;
}

// ------------------------------------------------------------------ views and start

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
  // The hatch the 'not today's run' marks use, once for the page.
  if (!document.getElementById('viz-defs')) document.body.insertAdjacentHTML('beforeend', VIZ_DEFS.replace('<svg ', '<svg id="viz-defs" '));
  loadFlow();
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
  // Each card's tab keeps its place.
  $('sheet').addEventListener('scroll', () => {
    const card = state.selected;
    if (card && $('sheet').classList.contains('drill')) drill.scroll.set(`${card}|${drill.tab.get(card) ?? 'news'}`, $('sheet').scrollTop);
  }, { passive: true });
  $('run').addEventListener('click', () => void run());
  showView();
  renderRuns();
  try {
    setStatus('Opening this flow’s record, and starting the engine…');
    await loadLog();
    const engine = await connect();
    // The daily loads the data has, if any: the flow starts on the first.
    type Listed = Omit<Load, 'episode' | 'note'> & { note?: string };
    type Files = Record<string, Expected & { path: string }>;
    const index = (await fetch('data/loads.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { month?: string; data?: typeof integrity.data; files?: Files; loads?: Listed[]; episodes?: { name: string; about?: string; loads: Listed[] }[]; history?: string } | null;
    integrity.data = index?.data ?? null;
    integrity.files = index?.files ?? {};
    // The list this app was built with: loads.json must name it. Only an auditor's check against the data branch
    // proves it is the data branch's; this stops a list, its files and loads.json being swapped together.
    if (BUILT_DATA && (index?.data?.commit !== BUILT_DATA.commit || index.data.manifest !== BUILT_DATA.manifest)) {
      throw new IntegrityError({ path: 'MANIFEST.json', class: 'list', expected: BUILT_DATA.manifest, actual: index?.data?.manifest ?? null, commit: BUILT_DATA.commit, at: new Date().toISOString() });
    }
    // The month, then each incident: an episode of days each. The app names the holidays itself.
    const month = index?.month ? dateOf(`${index.month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'The loads';
    const tag = (ls: readonly Listed[], episode: string): Load[] => ls.map(({ note: _, ...l }) => {
      const note = holidayOf(l.day) ?? seasonOf(l.day);
      return { ...l, episode, ...(note ? { note } : {}) };
    });
    loads.list = [...tag(index?.loads ?? [], month), ...(index?.episodes ?? []).flatMap((e) => tag(e.loads, e.name))];
    loads.episodes = [{ name: month }, ...(index?.episodes ?? []).map((e) => ({ name: e.name, about: e.about }))];
    loads.episode = month;
    // The data's list first: it must be the one this app was built with, and say what loads.json says of each file.
    if (integrity.data) await checkList(index!);
    // Each day's numbers for two years and a quarter, for each load's normal range, when the data has them.
    const hf = integrity.files.history;
    const past = index?.history && hf ? (JSON.parse(new TextDecoder().decode(await checked(hf.path, hf))) as HistoryFile) : null;
    if (past?.format === HISTORY_FORMAT && past.days.length) history = new HistoryRanges(past);
    const first = loads.list[0];
    setStatus(first ? `Loading ${dayLabel(first.day)}: ${fmtInt(first.rows)} trips, the zones and the weather, each checked against the data's list…` : 'Loading the trips, the zones and the weather…');
    // Each source's file, checked here and pinned in the engine, which hashes it again and reads it as smaltfl:<file>.
    for (const src of EXAMPLE_SOURCES) {
      const key = src.file.split('.')[0]!;
      const want: (Expected & { path: string }) | undefined = src.file === 'trips.parquet' && first ? { path: first.file, sha256: first.sha256, bytes: first.bytes ?? -1, from: first.file } : integrity.files[key];
      if (!want) throw new Error(`no hash for ${src.file} in the data's list: it can't be checked, so it isn't used`);
      const bytes = await checked(want.path, want);
      await pinFile(engine, src.file, bytes, want.sha256);
      await engine.exec(pinnedDdl(src));
      if (src.file === 'trips.parquet' && first) loads.bytes.set(0, bytes);
    }
    if (first) loads.pinned = 0;
    if (first) loads.at = 0;
    state.engine = engine;
    renderLoads();
    await run();
    renderLoads();
  } catch (e) {
    if (e instanceof IntegrityError) {
      const said = describeFile(e.check);
      state.failed = { message: `${said.title}. ${said.detail}`, file: e.check };
    } else state.failed = { message: `The engine couldn't start: ${message(e)}` };
    setStatus(state.failed.message, true);
    renderRuns();
    renderCanvas();
  }
}

/**
 * The data's list (MANIFEST.json), checked: its bytes hash to what loads.json says, and every file loads.json names is
 * in it with the same sha256 and size. Anything else refuses every file, since none could be checked.
 */
async function checkList(index: { loads?: { file: string; sha256: string; bytes?: number }[]; episodes?: { loads: { file: string; sha256: string; bytes?: number }[] }[] }): Promise<void> {
  const d = integrity.data!;
  const bytes = await fetchChecked('MANIFEST.json', { sha256: d.manifest, bytes: d.bytes ?? -1 }, { commit: d.commit, onCheck: (c) => noteCheck(c.class === 'corrupt' ? { ...c, class: 'list' } : c) }).catch((e: unknown) => {
    if (e instanceof IntegrityError && e.check.class === 'corrupt') throw new IntegrityError({ ...e.check, class: 'list' });
    throw e;
  });
  integrity.manifestBytes = bytes;
  const list = JSON.parse(new TextDecoder().decode(bytes)) as { files: { path: string; sha256: string; bytes: number }[] };
  const byPath = new Map(list.files.map((f) => [f.path, f]));
  const named = [
    ...Object.values(integrity.files).map((f) => ({ path: f.from ?? f.path, sha256: f.sha256, bytes: f.bytes })),
    ...[...(index.loads ?? []), ...(index.episodes ?? []).flatMap((e) => e.loads)].map((l) => ({ path: l.file, sha256: l.sha256, bytes: l.bytes ?? -1 })),
  ];
  const off = named.find((f) => byPath.get(f.path)?.sha256 !== f.sha256 || byPath.get(f.path)?.bytes !== f.bytes);
  if (off) {
    const check: FileCheck = { path: off.path, class: 'list', expected: off.sha256, actual: byPath.get(off.path)?.sha256 ?? null, commit: d.commit, at: new Date().toISOString() };
    noteCheck(check);
    throw new IntegrityError(check);
  }
}

void start();
