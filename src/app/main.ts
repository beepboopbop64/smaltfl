/**
 * The smaltfl app, first version: the example flow on real data, run in this browser. The flow draws as a canvas of
 * cards; a card opens a sheet with the step's settings (editable: change one, run again, and only what depends on it
 * is rebuilt), its expectation counts, a preview of its rows and the statement the engine runs for it. Results show
 * weather's effect on demand; runs can be verified and signed.
 *
 * Plain DOM and SVG, as the family's apps are. Everything a person typed or a dataset holds is set with textContent.
 */
import exampleDoc from '../../examples/nyc-taxis-weather.smaltfl.json';
import { donorBinding, EXAMPLE_DATA, EXAMPLE_SOURCES, pinnedDdl, type Binding } from '../../examples/sources.js';
import { namedFiles, readDataList, type DataList } from './datalist.js';
import { holidayOf, seasonOf, US_NYC_1, type Calendar } from '../core/calendar.js';

/** The calendar the watched source is judged by (ADR 0010 §2): its days marked on the strips and charts, Election Day
 * among the taxi example's. */
const calendarNow = (): Calendar => history?.calendar ?? US_NYC_1;
import { canonicalJSON } from '../core/canonical.js';
import type { FlowDocument, GroupDef, NotebookOutline, ProfileDef, StepDef } from '../core/document.js';
import { GROUP_COLORS, insertAfter, periodOf, sourceOf, takeOut, validateDocument, watchHistory, withoutDisplay, type CellRef } from '../core/document.js';
import { notebookSectionId } from '../core/notebook.js';
import { briefOf, briefText, type BriefIn, type BriefOption } from '../core/brief.js';
import { createTable, emitCheckCounts, emitColumnFacts, emitCopy, emitDayHours, emitDistinct, emitHourValues, emitDrop, emitDropped, emitExcept, emitFailures, emitLookup, emitRead, emitRuleFailures, emitSample, emitSqlOver, emitUnionAll, emitUnmatched, sameColumns, stampShift, type EmitContext } from '../core/emit.js';
import { effectOf, type Effect } from '../core/effect.js';
import { daysFrom, HistoryRanges, isHistory, metricKey, QUANTILES, timeOf, type HistoryFile, type Metric } from '../core/history.js';
import type { Identity, ManifestNode, SignedManifest } from '../core/manifest.js';
import type { Backtest, NormalRange, NormalRanges, Place } from '../core/normal.js';
import { flowNames, isPlaceholder, judgeOf, newsOf, shareWords, tableNewsOf, usualHours, type Act, type Finding, type Names, type Severity, type TableFacts } from '../core/news.js';
import { CHECK_NAMES, CHECK_SAID, gateChecksOf, gateLayerOf, JUDGED, LAYER_SAID, WRITTEN, type GateChecks } from '../core/gates.js';
import { calendarHead, heldLoadLine, dayMid, dayShort, guessWords, judgedWords, lacked, MARK as REMEDY_MARK, noRowsBefore, reachLabel, readersOf as readersHad, readersSee, rowsFrom, shortfall, shownRun, stagedBar, stoppedLine as stoppedWords, toldLine, type DayState, type EpisodeDay, type KeptMark, type PauseState, type RemedyMark } from '../core/days.js';
import { UNTIL, afterLine, betweenLine, dayPausedLine, daySentence, decidedLines, decisionDrawing, donorPicked, failLine, goShown, heldLine, outputPausedLine, passedLine, pausedChecks, pauseLines, pauseReasons, pickFails, receiptLines, remedyHead, ribbonOf, runFigures, sheetText, versionLines, checksSeen, filesSeen, findingOf, type RunSight, type AfterPart, type KeptLacks, type RemedySaid, type SheetIn, type SheetPick, type SheetText, type Sight } from '../core/decision.js';
import { countedChecks, rangesFor, dayClaim, dayState, flowStory, levelFor, levelsOf, loadClaim, skipOf, tailPath, type Claim, decisionFor, heldOutputs, inputsKey, inputsOf, pausesOf, pauseState, lastPublished, sameKeys, stagedKeys, standingEnds, standingFor, type DecideAbout, type Decided, type HistoryRef, type Hold, type Inputs, type Pause, type ReleaseAbout, type StoryClaim } from '../core/hold.js';
import { dayVersions, donorIdOf, fillCounts, levelOf as acceptedLevel, levelWays, partLabel as remedyPart, type Offer, type Repair, type Version } from '../core/fill.js';
import { derivedAbout, derivedFails, derivedKeys, derivedWhy, donorsOf, filledRows, pinDonor, repairOf, stageRepair, type Listed, type Remedies } from './fills.js';
import { followsCause as followsFrom, ACT_VERB, CELL_KINDS, CELL_NAMES, CONTEXT_TAG, HEALTH_HEAD, STRIP_KEY, approx, axisShare, recentSpan, cardWords, changeLabel, compact, countLabel, countRange, fallSteps, gateHead, overLabel, gateLabels, gateOf, partLabel, ruleOrder, ruleUsual, shortWho, splitSentence, splitSteps, storyOf, type Cell, type DayStep, type Gate, type HourValues, type Story, type Told } from '../core/story.js';
import { amountLine, bulletTrack, degrees, weatherHours, chain, composition, contextBars, dayStrip, decisionRow, effectBars, learnStrip, episodeBars, episodeChip, episodeDays, episodeIcon, heldLineage, partBar, reachIcon, DEFS as VIZ_DEFS, dumbbellRows, episodeLine, farStrip, gateBars, glyph, hourBars, lineage, microDot, quantileStrip, ruleRows, splitRows, stripBar, trendPips, waterfall, type Dumbbell, type Mark as VizMark, type StripDay } from './viz.js';
import { sha256Hex } from '../core/hash.js';
import { glossOf, meaningOf, nounOf as ontologyNoun, propertyOf, type Edit, type Noun, type PropertyType } from '../core/ontology.js';
import { DECIDE, DECIDE_OPTIONS, checkDecision, checkRun, covers, readView, wrapRead, type DecideOption, type DecisionOption, type Principal, type ReadView, type RowRule } from '../core/policy.js';
import { createIdentity, ontologyHash, policiesHash, signManifest, verifyManifest } from '../core/manifest.js';
import { shapeOf } from '../core/optimize.js';
import { flowHash, isPublish2, planPeriod, translate, type Column, type FlowPlan, type PlanNode } from '../core/plan.js';
import { checksOver, clockText, columnSql, fillGaps, growForest, isolationPath, madsOf, minuteOfDay, needOf, needWords, pathLength, principalComponents, profileColumn, quantile, renamesOf, scoreOf, secondsText, suggestChecks, unusual, type Cut, type Drift, type Forest, type Judge, type Profile, type Suggestion, type Unusual } from '../core/quality.js';
import type { ReleaseResult, RunResult, TellFor, VerifyLevel, VerifyResult } from '../core/protocol.js';
import { identifiers, literal, quoteIdent } from '../core/sqltext.js';
import { measureLoad, pinFile, releaseRun, runFlow, sampleLoad, verifyRun } from '../index.js';
import { appendSample, isSample, SAMPLE_KEEP, samplePath, type SampleFile } from '../core/apart.js';
import { appendPeriods, hourValuesOf, settingsFor, tailBefore, type Measures } from '../core/measures.js';
import { utf8 } from '../core/hash.js';
import { describe as describeFile, severityOf as fileSeverity, type FileCheck } from '../core/integrity.js';
import { fetchChecked, IntegrityError, type Expected } from './fetch-checked.js';
import { FlowRecord } from './record.js';
import { buildBag } from '../core/bag.js';
import { zip } from '../core/zip.js';
import { entryLeaf, parseCheckpoint, type JSONValue, type LogEntry as RecordEntry } from '../core/log.js';
import { connect, type Engine } from './engine.js';
import { besideSlot, edgePath, frameAt, freeSlot, GRID, gridLayout, groupKey, pinLayout, routeVia, type GridLayout } from './layout.js';

declare const __SMALTDB_VERSION__: string;
const SMALTDB = typeof __SMALTDB_VERSION__ === 'string' ? __SMALTDB_VERSION__ : '0.9.0';

interface RunRecord {
  result: RunResult;
  ms: number;
  at: Date;
  /** The daily load it ran on, by place in the list. */
  load?: number;
  /** Its inputs as one text (core/hold.ts inputsKey): what finds its day's pause in the record (ADR 0009 §10). */
  inputs: string;
  /** A held run's release, once a decision to publish it as is was applied (or refused) in this engine. */
  release?: ReleaseResult;
  /** The claims it was judged by (ADR 0010 §6): kept in its record entry, held or not, so an audit tells each again. */
  claims?: Claim[];
  /**
   * A derived run (ADR 0009 amendment 1 S4): the held run it repairs, the repair, its document, and its release once a
   * decision released it here. Its `inputs` are its held run's, so it finds the same pause; it is never one of
   * `state.runs`, and the day's views show it only while readers have its versions (`filledOf`).
   */
  derived?: { from: RunRecord; repair: Repair; doc: FlowDocument; seq: number | null; release?: ReleaseResult; releaseSeq?: number; refused?: ReleaseResult; withdrawn?: boolean };
  verified?: VerifyResult;
  signed?: SignedManifest;
  signatureOk?: boolean;
}

/**
 * The flow the page runs as shipped: the built example, or the document its data list names (ADR 0010 §9, a build's
 * `--flow`), read before anything else.
 */
let shippedDoc = exampleDoc as unknown as FlowDocument;
/** The data list the page opened (loads.json, either format): each source's binding and files, each watch's history. */
let dataList: DataList | null = null;

const state = {
  doc: structuredClone(exampleDoc) as unknown as FlowDocument,
  engine: null as Engine | null,
  runs: [] as RunRecord[],
  running: false,
  /** A decision on its way, from its record entry to its release's: no other is taken meanwhile (ADR 0009 §9). */
  deciding: false,
  selected: null as string | null,
  identity: null as Identity | null,
  failed: null as { origin?: string; message: string; file?: FileCheck } | null,
  /**
   * Each dataset name and the run whose version it shows (ADR 0009): what readers get. A held run's versions are
   * staged, and a name shows them only once a decision releases them.
   */
  names: new Map<string, RunRecord>(),
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
  // Someone who may not decide reads an output kept back on a held day as readers have it (round 3, #2).
  const run = asReaders(name, state.viewer) ? state.names.get(name) : latest();
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

/** A dataset as readers get it, the version its name shows (ADR 0009), as the viewer may read it; null when closed to
 * them, or when nothing is published under the name yet. */
const readPublished = (name: string): string | null => (state.names.has(name) ? readDataset(name) : null);

/**
 * What a view of the published names says on a day whose own rows readers don't get (ADR 0009 §12): "As published ·
 * Wed 20", or "Nothing published yet". Null when readers get the day on screen.
 */
function asPublished(): string | null {
  const r = onScreen();
  if (!r || isPublished(r)) return null;
  const day = readersDay(r);
  return day ? `As published · ${dayShort(day)}` : 'Nothing published yet';
}

/** After a count read from what readers get, on a held day, for an output that waits: " · as published · Mon 18". */
function publishedNote(dataset: string): string {
  if (!stagedOutput(dataset)) return '';
  const day = showsDay(dataset);
  return day ? ` · as published · ${dayShort(day)}` : '';
}

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

/** A held day's mark (ADR 0009 §12, amendment 1 S12): ‖ paused, ⚑ published as is, the level's step for a day accepted
 * as a new level (S6), ✕ not published, ◧ filled, ◐ the part that arrived alone. */
const PAUSE_MARK: Record<DayState, VizMark> = { waiting: 'held', asis: 'flag', dont: 'closed', fill: 'fill', complete: 'part', accepted: 'level' };
/** What a held day's mark says, for its accessible name. */
const PAUSE_WORD: Record<DayState, string> = { waiting: 'paused', asis: 'published as is', dont: 'not published', fill: 'filled', complete: 'part only', accepted: 'new level' };
/** What a card's mark says to a screen reader, before its line. */
const CARD_SAID: Record<DayState, string> = { waiting: 'Paused, ', asis: 'Published as is, ', dont: 'Not published, ', fill: 'Filled, ', complete: 'Part only, ', accepted: 'New level, ' };

function setStatus(text: string, bad = false, run?: { n: number; state: 'done' | 'held' | 'failed' | 'refused'; mark?: DayState | null }): void {
  const el = $('status');
  el.textContent = text;
  // The day's mark before its line, a shape hidden from screen readers and from the line's text, which says the day as
  // before (ADR 0009 §12).
  // A line about a run on a day takes that day's severity, held or published alike: one rule for every alert day.
  const day = run && loads.list.length > 1 ? loads.list[loads.at]?.day : undefined;
  const sev = day ? verdictOf(day)?.severity : undefined;
  if (run?.mark) el.prepend(glyphEl(PAUSE_MARK[run.mark], 14));
  // A day not judged yet, published, marked: ◌ before its line (ADR 0010 §12).
  else if (run && day && verdictOf(day)?.kind === 'unlearned') el.prepend(glyphEl('unlearned', 14));
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

/** What the viewer may read of a node, for what the status line's title names (core/decision.ts runFigures). */
const sightOf = (id: string): Sight => {
  if (isOwner()) return 'all';
  const a = access(id);
  return !a ? 'some' : accessOf(a) === 'closed' ? 'closed' : accessOf(a) === 'all' ? 'all' : 'some';
};

/**
 * What the viewer may see of a run's parts in the Runs view, the Integrity tab and the record (round 3, #6, core/
 * decision.ts RunSight): a node open to them (never one whose columns aren't known yet), and its whole count, a file's
 * size and what its checks say only where every row of it is theirs.
 */
const runSight = (): RunSight => ({ open: (id) => isOwner() || access(id)?.open === true, counted: (id) => rowsOpen(id) });
/** Whether the viewer may run the flow (round 3, #7): only someone who may decide, since a day that passes publishes. */
const mayRun = (): boolean => checkRun(policies(), state.viewer).allowed;

/**
 * Say a run on the status line, for the viewer now (ADR 0008 §10, ADR 0009 §12): its day in one sentence of what they
 * may see, the day's head where its story is theirs, else what became of the day; its figures in the line's title, a
 * node closed to them neither counted nor named. Again when the viewer changes, so no one reads another's line.
 */
function sayRun(r: RunRecord): void {
  const day = dayOfRun(r);
  const pause = pauseOf(r);
  const result = r.result;
  const figures = runFigures({ day: day ?? null, run: runName(r), ms: fmtMs(r.ms), nodes: result.manifest.nodes, holds: pause ? result.holds : [], sight: sightOf, page: state.engine?.mode === 'page' });
  const top = day ? verdictOf(day) : undefined;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const other = pause ? heldElsewhere(r) : null;
  const said = day
    ? daySentence({ day, head: other ? `${other.origin}: ${other.said}` : top?.title ?? null, wrong: top?.severity === 'alert' || !!other, pause: pause ? { state: pause.state, readers: readersAsOf(r).day, past: readersAsOf(r).past, standing: standsOn(pause.pause?.decision), may, deciders: deciders(), remedy: pause.remedy, withdrawn: pause.withdrawn, level: pause.pause?.decision?.about.level?.from ?? null, under: levelUnder(pause.pause?.decision) } : null })
    : pause ? `Held${result.holds.every((x) => sightOf(x.origin) === 'all') ? `: ${result.holds[0]!.said}` : ''}` : figures;
  setStatus(said, false, { n: attempts, state: pause && !isOut(pause.state) ? 'held' : 'done', mark: pause?.state ?? null });
  $('status').title = figures;
}

/**
 * The node a failed run's message names: a step or source by id ("trips_valid: …"), or a source by its table
 * ("logging_file: the header has 3 fields but 4 columns are declared": the engine refused the file the source reads).
 */
function failedOrigin(msg: string): string | undefined {
  const token = /^([A-Za-z][A-Za-z0-9_]*): /.exec(msg)?.[1];
  if (!token) return undefined;
  if (steps().has(token) || sourceIds().has(token)) return token;
  return state.doc.sources.find((x) => x.table.toLowerCase() === token.toLowerCase())?.id;
}

/** A failed run's head for the strip and the day line, in a few words: what was refused, and how, when the engine's
 * message is one we know ("logging: file has 3 of 4 columns"); else which node stopped it. */
function failedHead(): string {
  const f = state.failed;
  if (!f) return 'Run failed';
  const cols = /the header has (\d+) fields but (\d+) columns are declared/.exec(f.message);
  if (cols) return `${f.origin ?? 'file'}: file has ${cols[1]} of ${cols[2]} columns`;
  return f.origin ? `${f.origin}: run failed` : 'Run failed';
}

/**
 * Say a run that stopped (an engine error, or a gate that held under a flow that doesn't say what holds it): a gate as
 * the day's state, any other failure with its message; to someone the step that stopped it is closed to, neither its name
 * nor the engine's message, which names what it read.
 */
function sayFailed(): void {
  const f = state.failed;
  if (!f || f.file) return;
  const open = !f.origin || isOwner() || visible(f.origin);
  const held = f.origin && steps().get(f.origin)?.kind === 'expectations';
  const k = loads.pinned >= 0 ? loads.pinned : loads.at;
  const l = loads.list[k];
  const day = l ? dayLabel(l.day).replace(/, \d{4}$/, '') : '';
  const said = held && l ? dayStatus(k, open ? `${day}: Held at ${f.origin}` : `${day}: held`) : `The run failed, and the previous results stay current.${open ? ` ${f.message}` : ''}`;
  setStatus(said, true, { n: attempts, state: 'failed' });
  $('status').title = open ? f.message : '';
}

/** The sheet opens below the header, whatever its height, so the tabs and Run stay in reach. */
function syncHead(): void {
  const bar = document.querySelector('header.bar');
  if (bar) document.documentElement.style.setProperty('--head', `${Math.ceil(bar.getBoundingClientRect().bottom)}px`);
}

// ------------------------------------------------------------------ the flow's facts

const steps = () => new Map(state.doc.steps.map((st) => [st.id, st]));
const sourceIds = () => new Set(state.doc.sources.map((src) => src.id));
/** The day a run ran on: its load's. */
const dayOfRun = (r: RunRecord | undefined): string | undefined => (r?.load !== undefined ? loads.list[r.load]?.day : undefined);
/**
 * The run on screen (ADR 0008 §10, ADR 0009 §12): the viewed day's own, published or staged; after a run that stopped
 * (a refused file, an engine error) the latest day before it that was published, never a later day's. Every view reads
 * its rows through this one.
 */
const latest = (): RunRecord | undefined => {
  const viewed = viewedDay();
  const k = shownRun(state.runs.map((r) => {
    const d = dayOfRun(r);
    return d && (d === viewed || isPublished(r)) ? d : null;
  }), viewed);
  const r = k < 0 ? undefined : state.runs[k];
  return r ? (filledOf(r) ?? r) : undefined;
};
/**
 * The derived runs made in this engine (ADR 0009 amendment 1 S4): a fill or the part alone of a held run, staged when
 * the option was picked, or applied again after a reload; by their manifest.
 */
const derivedRuns = new Map<string, RunRecord>();
/** On a day readers have a fill (or the part alone) of, the derived run whose versions they have: what the day's views
 * show (S7, "what was used"). */
function filledOf(r: RunRecord): RunRecord | undefined {
  if (r.derived) return undefined;
  const shown = new Set(state.names.values());
  for (const x of derivedRuns.values()) if (x.derived!.from.inputs === r.inputs && x.load === r.load && shown.has(x)) return x;
  return undefined;
}
/** On a day whose fill (or part alone) was released in this engine and not withdrawn, its derived run, whatever the
 * names show now (a later day current): what a withdrawal takes back (Q-61). */
function releasedFillOf(r: RunRecord): RunRecord | undefined {
  if (r.derived) return undefined;
  let found: RunRecord | undefined;
  for (const x of derivedRuns.values()) if (x.derived!.from.inputs === r.inputs && x.load === r.load && x.derived!.release?.outcome === 'applied' && !x.derived!.withdrawn) found = x;
  return found;
}
/** The day of the run on screen, where runs are by day. */
const shownDay = (): string | undefined => dayOfRun(latest());
/** The day the outputs keep while the day on screen is held: under a flow that holds, the day readers see (the held
 * day's own run is on screen, staged); otherwise the run on screen's. */
const keptDay = (): string | null | undefined => {
  const own = onScreen();
  return own && pauseOf(own) ? readersDay(own) : shownDay();
};
/** The day on screen: the load picked in the strip. */
const viewedDay = (): string | undefined => (loads.list.length > 1 ? loads.list[loads.at]?.day : undefined);
/** The run on screen when it is the viewed day's own (always, without daily loads), not another day's. */
const onScreen = (): RunRecord | undefined => {
  const r = latest();
  return r && dayOfRun(r) === viewedDay() ? r : undefined;
};
/**
 * What held a run besides the judged dataset's own story (ADR 0013 §5): with several watched loads, the first other
 * load's verdict ("backup: status fail with restore_tested yes: 55"), or why it wasn't judged, when the viewer may read
 * that node. Null when the judged dataset's own day is what's wrong, or nothing else held.
 */
function heldElsewhere(r: RunRecord | undefined): { origin: string; said: string } | null {
  if (!r) return null;
  const judged = loadSource();
  const day = dayOfRun(r);
  // The judged dataset's own story (not verdictOf, which asks this function): is its day wrong on its own?
  const own = day && history && historyOpen() && history.file.days.includes(day) ? storyFor(day) : null;
  const holds = r.result.holds.filter((x) => (x.by === 'story' || x.by === 'unjudged') && x.origin !== judged && (isOwner() || visible(x.origin)));
  // The cause before the symptom: a load upstream of the judged dataset that held (a control's file with no rows) is
  // what went wrong; the judged dataset's own verdict (its column blank) follows from it. Another load, unrelated,
  // leads only when the judged dataset's own day isn't wrong.
  const above = judged ? new Set(upstreamOf(judged)) : new Set<string>();
  const cause = holds.find((x) => above.has(x.origin));
  const h = cause ?? (own?.severity === 'alert' ? undefined : holds[0]);
  return h ? { origin: h.origin, said: h.said } : null;
}
/** Whether the run on screen holds a load of this node by its own story, or as not judged (ADR 0013 §5). */
const ownHoldOf = (id: string): Hold | undefined => (!state.failed && id !== loadSource() ? onScreen()?.result.holds.find((x) => x.origin === id && (x.by === 'story' || x.by === 'unjudged')) : undefined);
/**
 * The bar over rows on screen that aren't what readers get: another day's, after a refused file ("Rows from Thu Sep 21
 * · the last day published"); or the viewed day's own, staged while it waits or after it was not published ("Thu 21
 * built, not published · readers see Wed 20"). Null for rows readers get.
 */
const rowsFromBar = (): HTMLElement | null => {
  const text = rowsFrom(shownDay(), viewedDay());
  if (text) return h('p', { class: 'rows-from', role: 'note' }, text);
  const r = latest();
  const day = dayOfRun(r);
  const staged = r && day && !isPublished(r) ? stagedBar(day, readersDay(r), keptThen(day), pauseOf(r)?.state === 'waiting', readersMarkOf(r)) : null;
  return staged ? h('p', { class: 'rows-from staged', role: 'note' }, ...unbroken(staged)) : null;
};

/** A line of parts joined by " · ", each kept whole when it wraps (round 3: "readers see Mon 18 · 4 / days old" split a
 * number from its unit). */
const unbroken = (text: string): (Node | string)[] => text.split(' · ').flatMap((part, i) => [i ? ' · ' : '', h('span', { class: 'nowrap' }, part)]);

// ------------------------------------------------------------------ what readers get (ADR 0009)

/** The record's pauses, by their inputs (core/hold.ts pausesOf), read again as the record grows. */
const pauseCache = { size: -1, list: [] as Pause[], byKey: new Map<string, Pause>() };
function pauses(): Pause[] {
  const entries = ledger?.entries ?? [];
  if (pauseCache.size !== entries.length) {
    pauseCache.list = pausesOf(entries, periodOfFlow());
    pauseCache.byKey = new Map(pauseCache.list.map((p) => [p.key, p]));
    pauseCache.size = entries.length;
  }
  return pauseCache.list;
}
const pauseByInputs = (key: string): Pause | null => (pauses(), pauseCache.byKey.get(key) ?? null);

/** What became of a held run's day, and the pause the record keeps for it; for a day readers got by a remedy, what it
 * was (amendment 1 S12), and for a fill taken back, which (Q-61). */
interface PauseNow {
  state: DayState;
  pause: Pause | null;
  remedy: RemedySaid | null;
  withdrawn: RemedyMark | null;
}

/** What a remedy readers have is said by: its donor, or the part's label. */
function remedyOf(p: Pause | null): RemedySaid | null {
  const r = p?.repaired;
  if (!r) return null;
  const d = r.decision !== undefined ? ledger?.entries[r.decision]?.about as Partial<DecideAbout> | undefined : undefined;
  const repair = (d?.repair ?? (ledger?.entries[r.release]?.about as { repair?: Repair } | undefined)?.repair) ?? null;
  const day = p?.day ?? null;
  // The part names the source's column and value ("Without VendorID 1"): only to someone the source is open to (#6).
  return { option: r.option, donor: r.donor, part: repair && sourceOpen() ? remedyPart(repair.missing, day ? storyFor(day)?.split?.name : undefined) : null };
}

/** The remedy a withdrawal took back (Q-61): what the decision it amends chose. */
function withdrawnOf(p: Pause | null): RemedyMark | null {
  if (!p || p.withdrawn === null || p.decision?.about.option !== 'dont' || p.decision.amends === null) return null;
  const was = ledger?.entries[p.decision.amends]?.about as Partial<DecideAbout> | undefined;
  return was?.option === 'fill' || was?.option === 'complete' ? was.option : null;
}

/** Whether readers got a day: as is, filled, or with the part that arrived. */
/** The day word of the Accept a day was published under (a standing level, Q-57b), for "By Mon’s new level". */
function levelUnder(d: Decided | null | undefined): string | null {
  if (!d || d.about.option !== 'accept' || d.about.under === undefined) return null;
  const day = (ledger?.entries[d.about.under]?.about as { day?: string } | undefined)?.day;
  return day ? dayShort(day).split(' ')[0]! : null;
}
const isOut = (s: DayState | null | undefined): boolean => s === 'asis' || s === 'fill' || s === 'complete' || s === 'accepted';

/**
 * What became of a held run's day (ADR 0009 §6): waiting for a decision, published as is (released here, or every held
 * output already showing its versions), or not published. Null for a run that published, and for a held run with
 * nothing waiting and nothing decided (each name shows its versions already: there is nothing to decide).
 */
function pauseOf(r: RunRecord | undefined): PauseNow | null {
  if (!r || !r.result.holds?.length) return null;
  const p = pauseByInputs(r.inputs);
  const now = dayState({ holds: r.result.holds.length, waiting: r.result.waiting.length, released: !r.derived && r.release?.outcome === 'applied' }, p);
  return now ? { state: now, pause: p, remedy: now === 'fill' || now === 'complete' ? remedyOf(p) : null, withdrawn: now === 'dont' ? withdrawnOf(p) : null } : null;
}

/** Whether readers got a run's versions: it published, a decision published it as is, or it is the fill (or the part
 * alone) readers have of its day. */
const isPublished = (r: RunRecord): boolean => {
  const p = pauseOf(r);
  return !p || p.state === 'asis' || (!!r.derived && (p.state === 'fill' || p.state === 'complete'));
};

/** The day of the version a name shows readers now, or null when nothing is published under it. */
const showsDay = (name: string): string | null => dayOfRun(state.names.get(name)) ?? null;

/** The last day before `day` whose run was published in this visit: what readers kept while `day` waited, as it stood
 * then, for a day a later one has passed since (days.stagedBar). */
function keptThen(day: string): string | null {
  // From the record, as readersAsOf reads a decision's: the last day published before the day's first held run, which a
  // reload keeps (the runs of this visit alone would fall back to the first day the page ran).
  const held = ledger?.entries.find((e) => e.kind === 'run' && (e.about as { outcome?: string; day?: string } | null)?.outcome === 'held' && (e.about as { day?: string }).day === day);
  if (held && ledger) {
    const then = lastPublished(ledger.entries.slice(0, held.seq), periodOfFlow());
    if (then && then < day) return then;
  }
  let best: string | null = null;
  for (const x of state.runs) {
    const d = dayOfRun(x);
    if (d && d < day && (isPublished(x) || isOut(pauseOf(x)?.state)) && (!best || d > best)) best = d;
  }
  return best;
}

/** How readers have the day they see in place of a run's (S12): filled (◧) or the part alone (◐); published as is (⚑,
 * round 3 #3), so a fallback day that went out short is marked where it is named; else as it came. */
function readersMarkOf(r: RunRecord): KeptMark | null {
  const name = r.result.waiting[0] ?? Object.keys(r.result.manifest.outputs)[0];
  const theirs = name ? state.names.get(name) : undefined;
  return theirs?.derived?.repair.kind ?? (theirs && pauseOf(theirs)?.state === 'asis' ? 'asis' : null);
}

/** The day readers see in place of a run's: what the first output it holds back shows. */
function readersDay(r: RunRecord): string | null {
  const name = r.result.waiting[0] ?? Object.keys(r.result.manifest.outputs)[0];
  return name ? showsDay(name) : null;
}

/**
 * The day readers have as a held day's own views say it (ADR 0008 §10, ADR 0009 §12; core/days.ts readersOf): the day
 * they see now, unless a later day has published since, when it is the day they kept then (keptThen), said in the past
 * tense, naming no later day.
 */
function readersAsOf(r: RunRecord): { day: string | null; past: boolean } {
  const day = dayOfRun(r) ?? null;
  const had = readersHad(readersDay(r), day, day ? keptThen(day) : null);
  // A day not published keeps what readers had when its decision was made (the last day published before it), said in
  // the past tense; a decision made once a later day had published kept that later day, which the day's own views don't
  // name: they say what became of the day alone ("Not published"), never a day it didn't keep.
  const now = had.past ? pauseOf(r) : null;
  const d = now?.state === 'dont' ? now.pause?.decision : null;
  if (d && day && ledger) {
    const then = lastPublished(ledger.entries.slice(0, d.seq), periodOfFlow());
    return { day: then && then < day ? then : null, past: true };
  }
  return had;
}

/** Note what a run's or a release's names now show. */
function noteShown(r: RunRecord, names: readonly string[]): void {
  for (const n of names) state.names.set(n, r);
}

/**
 * The tab's title (ADR 0009 §12): ‖ before it while any day of the flow on screen waits for a decision, in this visit or
 * an earlier one, each day by what it shows now (its newest run, else the record's latest pause of it under this
 * flow), as the strip and the Runs view's ribbon read it. A pause under an earlier flow, or under a file since
 * republished, that nothing can run again doesn't keep it.
 */
let baseTitle = '';
function syncTitle(): void {
  baseTitle ||= document.title.replace(/^[‖◌◧◐] /, '');
  const now = pauseOf(latest())?.state;
  const waits = now === 'waiting' || pausedDays().some((d) => d.state === 'waiting');
  // With nothing waiting, the day on screen filled, or published with the part that arrived, carries its mark
  // (amendment 1 S12); else a day not judged yet puts ◌ before it (ADR 0010 §12).
  const viewed = loads.list[loads.at]?.day;
  const remedy = !waits && (now === 'fill' || now === 'complete') ? `${REMEDY_MARK[now]} ` : '';
  const unlearned = !waits && !remedy && !!viewed && verdictOf(viewed)?.kind === 'unlearned';
  document.title = `${waits ? '‖ ' : remedy || (unlearned ? '◌ ' : '')}${baseTitle}`;
}
const nodeOf = (id: string): ManifestNode | undefined => latest()?.result.manifest.nodes.find((n) => n.origin === id);

const KIND: Record<string, string> = { sql: 'SQL', filter: 'FILTER', formula: 'FORMULAS', select: 'SELECT', join: 'JOIN', aggregate: 'AGGREGATE', expectations: 'CHECKS' };

/** A source's binding (ADR 0010 §9): from the data list the page opened, else the example's. */
const bindingOf = (id: string): Binding | undefined => {
  const src = state.doc.sources.find((x) => x.id === id);
  if (!src) return undefined;
  const all = dataList?.sources ?? EXAMPLE_DATA.sources;
  return all[src.id] ?? Object.values(all).find((b) => b.table === src.table);
};
/** The file an input reads, where the app knows it: its binding's. */
const inputFile = (id: string) => bindingOf(id);
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
    return `${f ? `INPUT · ${formatOf(f.file).toUpperCase()}` : 'INPUT'}${layerMark(id)}`;
  }
  const st = steps().get(id)!;
  // Checks that only drop rows are a filter, with a reason for each rule.
  const kind = st.kind === 'expectations' && st.rules.every((r) => r.onFail === 'drop') ? 'FILTER' : (KIND[st.kind] ?? st.kind.toUpperCase());
  // A step written as a notebook cell says so (ADR 0011): the cell is what a person reads and edits.
  return `${notebookCellOf(id) ? 'CELL · ' : ''}${kind}${st.dataset ? ' · OUTPUT' : ''}${layerMark(id)}`;
}

/** The gate's layer on a card's label (ADR 0014 §7): the gate mark, in a flow with gates. */
const layerMark = (id: string): string => {
  const layer = gateLayerOf(state.doc, id);
  return layer ? ` · ${layer.toUpperCase()}` : '';
};

/** The notebook cell a step came from, in a format-4 flow (ADR 0011). */
const notebookCellOf = (id: string): CellRef | undefined => state.doc.cells?.[id];

/**
 * A step's cell, as written (ADR 0011 §6): its notebook and lines, and its code. What the flow runs is derived from
 * it, so the step's settings aren't edited here: the notebook is. The Statement tab shows what the engine runs.
 */
function cellView(id: string): HTMLElement | null {
  const ref = notebookCellOf(id);
  const nb = ref ? state.doc.notebooks?.find((n) => n.path === ref.notebook) : undefined;
  if (!ref || !nb) return null;
  const lines = nb.source.split('\n').slice(ref.line - 1, ref.endLine);
  // The cell's own lines, their common indent gone, the trailing blank lines too.
  while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop();
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  const code = lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
  return h('div', { class: 'part cell-part' },
    h('p', { class: 'eyebrow' }, `Cell · ${ref.notebook} · lines ${ref.line}–${ref.endLine}`),
    h('pre', { class: 'cell-code', tabindex: '0', 'aria-label': `The cell ${ref.cell} in ${ref.notebook}` }, h('code', {}, code)),
    h('p', { class: 'foot' }, `The flow reads this cell as written${ref.lang === 'sql' ? ': its SQL is the step, each \${name} what it reads' : ''}. To change the step, change the notebook; the Statement tab shows what the engine runs.`));
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
  /** A held day's mark before the line, 14 px (ADR 0009 §12): ‖ waiting, ⚑ published as is, ✕ not published, ◧ filled,
   * ◐ the part alone. */
  mark?: DayState;
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

/** The share a check dropped, as story.gateLabels prints it against the step's own limit (its maxDropped). */
function checkShare(id: string | undefined, dropped: number, rows: number): string {
  const st = id ? steps().get(id) : undefined;
  const limit = st && 'maxDropped' in st && typeof st.maxDropped === 'number' ? st.maxDropped : null;
  const share = dropped / Math.max(1, rows);
  return gateLabels({ step: id ?? '', rows, dropped, share, limit, held: limit !== null && share > limit, near: false, usual: null, rules: [] }).said;
}
const cols = (n: number) => `${n} ${n === 1 ? 'col' : 'cols'}`;

/** A step's change in a few words, for its card: tinted when it leaves rows out or adds columns. */
function summarize(c: Change, id?: string): CardLine | null {
  if (c.rowsOut === null) return null;
  const out = c.rowsOut;
  if (c.op === 'table') return { text: plural(out, 'row'), tone: 'same' };
  // What it read is closed to the viewer: only its own rows, as they read them.
  if (c.rowsIn === null || c.rowsIn === undefined) return { text: plural(out, 'row'), tone: 'same' };
  const inn = c.rowsIn;
  const lost = removedRows(c);
  switch (c.op) {
    case 'aggregate':
      return { text: `${fmtCompact(inn)} → ${fmtCompact(out)} ${out === 1 ? 'row' : 'rows'}`, tone: 'same' };
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
      if (c.op === 'sql' && !c.same && c.columnsIn !== c.columnsOut) return { text: `${fmtCompact(inn)} → ${fmtCompact(out)} ${out === 1 ? 'row' : 'rows'}`, tone: 'same' };
      // The badge counts the rows, the line their share: one number each, never the same twice.
      // A check's share by the one rule its bars and News use (story.gateLabels: two decimals within a point of its limit).
      if (lost) return { text: `${c.op === 'expect' ? checkShare(id, lost, inn) : pct(lost / Math.max(1, inn))} of rows ${c.op === 'expect' ? 'dropped' : 'left out'}`, tone: 'drop', badge: `−${fmtCompact(lost)} rows` };
      if (out > inn) return { text: `+${fmtInt(out - inn)} rows`, tone: 'add' };
      // A check that only warns keeps every row, and says how many it flags.
      if (c.op === 'expect' && c.flagged) return { text: `${plural(c.flagged, 'row')} flagged`, tone: 'drop', badge: `⚑ ${fmtCompact(c.flagged)}` };
      if (c.op === 'expect' && c.flagged === 0) return { text: 'every row passes', tone: 'same' };
      return { text: 'no rows removed', tone: 'same' };
  }
}

/**
 * A held check's card line (ADR 0008 §12): its line the share it dropped, as its bars and its News say it (one rule,
 * story.gateLabels: "held · 45.7% dropped"), and its badge the rows ("−2.1k rows").
 */
const heldCardLine = (g: Gate): CardLine => ({ text: `${state.doc.publish ? 'paused' : 'held'} · ${gateLabels(g).said} dropped`, tone: 'drop', badge: `−${fmtCompact(g.dropped)} rows` });

function cardLine(id: string): CardLine {
  const plain = (text: string): CardLine => ({ text, tone: 'same' });
  const fday = newsDay();
  const fstory = fday && state.failed?.origin === id && steps().get(id)?.kind === 'expectations' && !state.failed.file ? storyFor(fday) : null;
  if (fstory?.gate?.held) return heldCardLine(fstory.gate);
  if (state.failed?.origin === id) return plain(steps().get(id)?.kind === 'expectations' && !state.failed.file ? 'held: tap for why' : 'failed: tap for why');
  // The trips and their checks say the day's story in a few words (ADR 0008).
  const sday = newsDay();
  const story = sday && (id === loadSource() || id === history?.file.step) ? storyFor(sday) : null;
  if (story && id === loadSource() && (story.severity === 'alert' || story.severity === 'warn')) return { text: shortHead(story), tone: 'drop' };
  if (story?.gate?.held && id === history?.file.step) return heldCardLine(story.gate);
  // Another watched load's own verdict, on its card (ADR 0013 §5): what the engine judged it by, in a few words.
  const ownHold = ownHoldOf(id);
  if (ownHold) return { text: ownHold.said.replace(/\s*\((usually|never)[^)]*\)$/, ''), tone: 'drop' };
  // An output the held run didn't build, or one built from a day with something wrong upstream (ADR 0008); on a day
  // paused, an output that waits says what readers see meanwhile, and after a decision what became of it (ADR 0009).
  const out = outputState(id);
  if (out === 'stale') return plain('not published');
  // The day's mark, drawn, then words that fit the card (ADR 0008 §12): "‖ shows Wed 20", "✕ still shows Thu 21" (the
  // output wasn't updated from the day; readers keep the day it shows). The mark says the state, as the legend keys it
  // ("‖ paused"), and the words what readers see: never "waits" beside a legend that says paused (round 3, #20).
  // Once a later day has published, what the output kept then, naming no later day ("‖ kept Mon 18").
  const own = out === 'waiting' || out === 'dont' ? dayOfRun(onScreen()) ?? null : null;
  const kept = readersHad(showsDay(id), own, own ? keptThen(own) : null);
  if (out === 'waiting') return { text: kept.past ? (kept.day ? `kept ${dayShort(kept.day)}` : 'not published') : kept.day ? `shows ${dayShort(kept.day)}` : 'none shown', tone: 'same', mark: 'waiting' };
  if (out === 'dont') return { text: kept.day ? `${kept.past ? 'kept' : 'still shows'} ${dayShort(kept.day)}` : 'not published', tone: 'same', mark: 'dont' };
  if (out === 'asis') return { text: dayOfRun(onScreen()) ? `as is · ${dayShort(dayOfRun(onScreen())!)}` : 'published as is', tone: 'same', mark: 'asis' };
  // A day readers got by a remedy (amendment 1 S12): "◧ filled · Thu 21", "◐ part only · Thu 21".
  if (out === 'fill' || out === 'complete') return { text: `${out === 'fill' ? 'filled' : 'part only'}${dayOfRun(onScreen()) ? ` · ${dayShort(dayOfRun(onScreen())!)}` : ''}`, tone: 'same', mark: out };
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
  const said = c ? summarize(c, id) : null;
  if (said) return said;
  // Folded into the steps that read it: worked out when read, never stored (plain words, not "folded").
  if (n.status === 'folded') return plain('worked out when read');
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
  if (story.hero === 'gate' && story.gate) return heldCardLine(story.gate).text;
  // The amount: its change ("−30% trips"), the number the card's line has room for.
  if (story.hero === 'amount' && story.amount) return `${changeLabel(story.amount.value / Math.max(1, story.amount.expected) - 1)} ${NEWS_NAMES.noun()}`;
  return cardWords(story.head, Math.floor((GRID.cardW - 24) / 7.2));
}

/**
 * A step after the one that held, or after a refused file: nothing of it was built from the day's load, so its card
 * says so instead of another day's counts (ADR 0008 §10).
 */
const notBuilt = (id: string): boolean => !!state.failed?.origin && state.failed.origin !== id && downstreamOf(state.failed.origin).includes(id);

/** An output on the day: not published (its run was held or refused upstream), built from a day with something wrong
 * upstream, or neither; on a day paused, an output that waits, and what became of it once decided (ADR 0009). */
function outputState(id: string): 'stale' | 'alert' | DayState | null {
  if (!isOutput(id) || !latest()) return null;
  const own = state.failed ? undefined : onScreen();
  const p = pauseOf(own);
  // What waits, or once decided what waited when the day was held (a day run again after its release has nothing left
  // waiting, and still says what became of it).
  if (p && (own!.result.waiting.includes(id) || (p.state !== 'waiting' && !!p.pause?.waiting.includes(id)))) return p.state;
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
  const { left, top, width, height } = gridLayout(canvasDoc(viewDoc()), state.collapsed, wrapWidth());
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
  if (el) el.textContent = text ?? (state.arranging ? HINT.arrange : isOwner() ? HINT.look : `As ${personName(state.viewer)} sees it · closed parts left out · drag, pinch`);
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
  syncCanvasKey();
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
  startView(gridLayout(canvasDoc(viewDoc()), state.collapsed, wrapWidth()));
}

/** The zoom a wrapped flow is read at on a phone: its cards' names and lines legible. */
const WRAP_ZOOM = 0.72;

/** On a narrow canvas (a phone), the width the flow's sections stack to, in world units at WRAP_ZOOM; none on a
 * wide one. */
function wrapWidth(): number | undefined {
  // ADR 0012 §4: on a phone the flow reads sideways at a readable size, as on a wide screen, never stacked. The stacked
  // layout stays in layout.ts for a flow a person pins that way.
  void WRAP_ZOOM;
  return undefined;
}

/** The beginning of the flow, at a size where its cards are easy to read: on a phone, the flow wrapped to the width,
 * its sections stacked from the top; on a wider screen, two columns and a bit. */
function startView(layout: GridLayout): void {
  const host = $('canvas');
  if (layout.rows?.length) {
    view.k = Math.max(0.5, Math.min(1, (host.clientWidth - 24) / layout.width));
    view.x = (host.clientWidth - layout.width * view.k) / 2 - layout.left * view.k;
    view.y = 30 - layout.top * view.k;
    view.ready = true;
    applyView();
    return;
  }
  // On a phone, two cards and a bit across at a readable size, the flow panned sideways (ADR 0012 §4); on a wider
  // screen the whole flow's height fits too.
  const narrow = host.clientWidth < 640;
  view.k = narrow
    ? Math.max(0.78, Math.min(1, (host.clientWidth - 16) / (2.2 * (GRID.cardW + GRID.gapX))))
    : Math.max(0.55, Math.min(1, (host.clientHeight - 40) / layout.height, (host.clientWidth - 16) / (2.2 * (GRID.cardW + GRID.gapX))));
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
    // A notebook's box opens the notebook (ADR 0011 §6); any other folded section unfolds.
    if (notebookOfSection(press.card)) openSection(press.card);
    else if (state.doc.groups?.some((g) => g.id === press.card)) setFolded(press.card, false);
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
    const { d, cx, cy } = edgePath(pos(e.from), pos(e.to), drawn.layout ? routeVia(drawn.layout, pos(e.to)) : undefined);
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
      const layout = pinLayout(canvasDoc(state.doc), state.collapsed, wrapWidth());
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
  const layout = pinLayout(canvasDoc(state.doc), state.collapsed, wrapWidth());
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
  const layout = { ...pinLayout(canvasDoc(state.doc), state.collapsed, wrapWidth()), [groupKey(id)]: [x, y] as [number, number] };
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
  const layout = pinLayout(canvasDoc(state.doc), state.collapsed, wrapWidth());
  delete layout[groupKey(id)];
  state.collapsed.delete(id);
  state.doc = { ...state.doc, groups: (state.doc.groups ?? []).filter((g) => g.id !== id), layout };
  saveArrangement();
  select(null);
}

/** Move a step into a section from its sheet: it lands in the section's first free slot; a new section is drawn around it. */
function placeInSection(id: string, target: string): void {
  const before = gridLayout(canvasDoc(state.doc), state.collapsed, wrapWidth());
  const doc: FlowDocument = { ...state.doc, layout: pinLayout(canvasDoc(state.doc), state.collapsed, wrapWidth()) };
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
  const edited = canonicalJSON(state.doc.steps as unknown as Parameters<typeof canonicalJSON>[0]) !== canonicalJSON(shippedDoc.steps as unknown as Parameters<typeof canonicalJSON>[0]);
  state.doc = { ...state.doc, steps: structuredClone(shippedDoc.steps) as StepDef[], groups: structuredClone(shippedDoc.groups) as FlowDocument['groups'], layout: {} };
  state.collapsed = new Set();
  try {
    localStorage.removeItem(arrangementKey());
    localStorage.removeItem(flowKey());
  } catch {
    // Nothing kept to forget.
  }
  select(null);
  startView(gridLayout(canvasDoc(viewDoc()), state.collapsed, wrapWidth()));
  if (edited) void run();
}

// ------------------------------------------------------------------ drawing the canvas

/** Whether the canvas drew a card's file seal: the key under it says what the mark means only then. */
let canvasSealed = false;
/**
 * The canvas's key (round 3, #21): the outlined tick a card carries for a file that matches its list, keyed once in
 * the canvas's corner, so it reads as the file's check and never as the day's news beside an alert.
 */
function syncCanvasKey(): void {
  const tools = document.querySelector('#canvas .canvas-tools');
  if (!tools) return;
  tools.querySelector('.canvas-key')?.remove();
  if (!canvasSealed || state.arranging) return;
  tools.prepend(h('p', { class: 'canvas-key' }, svgNode('<svg class="seal-key" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M5.2 8l2 2.2 3.6-4"/></svg>'), 'file matches its list'));
}

// ------------------------------------------------------------------ the notebook view (ADR 0011 §6)

/** The notebook a section of the canvas is, if it is one (ADR 0011 §6): a box on the canvas, its steps inside. */
const notebookOfSection = (id: string): NotebookOutline | undefined => state.doc.outline?.find((o) => notebookSectionId(o.path) === id);

/**
 * A notebook read top to bottom (ADR 0011 §6): each heading a part, each md cell its words, each source and step a
 * card that opens its sheet, with the rows that flow out of it once it has run and the rows that go on to the next
 * card between them, a check's rules and what each caught, each step's code a tap away, and what the notebook
 * publishes. What its box on the canvas holds, read down the page.
 */
function notebookElements(o: NotebookOutline): HTMLElement[] {
  const run = latest();
  const rowsOf = (id: string): number | undefined => nodeOf(id)?.rows;
  const nb = (id: string) => state.doc.notebooks?.find((n) => n.path === id);
  const code = (path: string, line: number, endLine: number): string => {
    const lines = (nb(path)?.source ?? '').split('\n').slice(line - 1, endLine);
    while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop();
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
    return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
  };
  const card = (id: string, kind: 'source' | 'step'): HTMLElement => {
    if (!visible(id)) return h('p', { class: 'nb-md' }, `${id}: closed to ${personName(state.viewer)}.`);
    const st = steps().get(id);
    const n = nodeOf(id);
    const line = cardLine(id);
    const rows = rowsOf(id);
    const classes = ['nb-card', kind, st?.dataset ? 'dataset' : '', n?.status === 'built' ? 'built' : '', state.failed?.origin === id ? 'failed' : '', state.selected === id ? 'selected' : ''].filter(Boolean).join(' ');
    const status = n ? (n.status === 'folded' ? 'folded' : n.status) : run ? 'not run' : '';
    return h('button', { type: 'button', class: classes, 'data-nb-card': id, onclick: () => select(id), 'aria-label': `${id}: open its sheet` },
      h('span', { class: 'eyebrow' }, kindLabel(id)),
      h('span', { class: 'nb-name' }, id),
      h('span', { class: `nb-line ${line.tone === 'drop' ? 'drop' : ''}` }, line.mark ? glyphEl(PAUSE_MARK[line.mark], 13) : '', line.text),
      h('span', { class: 'nb-side' }, rows !== undefined ? h('span', { class: 'nb-rows' }, `${fmtInt(rows)} rows`) : '', status ? h('span', { class: 'nb-status' }, status) : ''));
  };
  /** The rows that flow from a card to the next: the rows its version holds, or what its checks let through. */
  const flowOut = (id: string): string | null => {
    const n = nodeOf(id);
    if (!n) return null;
    if (n.expectations) return `${fmtInt(n.expectations.rows - n.expectations.dropped)} rows on`;
    if (n.rows !== undefined) return `${fmtInt(n.rows)} rows on`;
    return n.status === 'folded' ? 'folded into the next step' : null;
  };
  const checks = (id: string): HTMLElement | null => {
    const e = nodeOf(id)?.expectations;
    const st = steps().get(id);
    if (!e || st?.kind !== 'expectations') return null;
    return h('div', { class: 'nb-check', role: 'list', 'aria-label': 'The checks and what they caught' },
      ...e.rules.flatMap((r) => [h('span', { class: 'k' }, r.name), h('span', {}, st.rules.find((x) => x.name === r.name)?.onFail === 'drop' ? 'drops' : 'warns'), h('span', { class: `n ${r.failed && r.onFail === 'drop' ? 'drop' : ''}` }, r.failed ? `${fmtInt(r.failed)} rows` : 'none')]),
      h('span', { class: 'k' }, 'in'), h('span', {}, ''), h('span', { class: 'n' }, `${fmtInt(e.rows)} rows`),
      h('span', { class: 'k' }, 'dropped'), h('span', {}, ''), h('span', { class: `n ${e.dropped ? 'drop' : ''}` }, `${fmtInt(e.dropped)} rows`));
  };
  const parts: HTMLElement[] = [];
  let lastCard: string | null = null;
  const put = (el: HTMLElement) => parts.push(el);
  const between = (id: string) => {
    if (lastCard) {
      const said = flowOut(lastCard);
      if (said) parts.push(h('div', { class: 'nb-flow', 'aria-hidden': 'true' }, h('span', { class: 'arrow' }, '↓'), said));
    }
    lastCard = id;
  };
  {
    for (const c of o.cells) {
      if (c.kind === 'heading') {
        put(h('h3', { class: 'nb-h' }, c.heading ?? ''));
        if (c.text) put(h('p', { class: 'nb-lede' }, c.text));
      } else if (c.kind === 'md') put(h('p', { class: 'nb-md' }, c.text ?? ''));
      else if (c.kind === 'params') {
        const values = run?.result.manifest.parameters ?? Object.fromEntries((state.doc.parameters ?? []).map((p) => [p.name, p.default ?? null]));
        put(h('p', { class: 'nb-params' }, `Parameters · ${Object.entries(values).map(([k, v]) => `${k} = ${v === null || v === undefined ? '—' : String(v)}`).join(' · ')}`));
      } else if (c.kind === 'source' && c.source) {
        between(c.source);
        put(card(c.source, 'source'));
      } else if (c.kind === 'step' && c.step) {
        between(c.step);
        const st = steps().get(c.step);
        const text = code(o.path, c.line, c.endLine);
        const lines = text.split('\n').length;
        put(h('div', { class: 'nb-step' }, card(c.step, 'step'), checks(c.step) ?? '',
          h('details', { ...(st?.kind === 'sql' ? { open: 'open' } : {}) }, h('summary', {}, `${c.lang === 'sql' ? 'SQL' : st?.kind === 'expectations' ? 'The rules' : 'The cell'} · ${plural(lines, 'line')}`), h('pre', { class: 'cell-code' }, h('code', {}, text)))));
      } else if (c.kind === 'publish' && c.publishes) {
        put(h('p', { class: 'nb-pub' }, 'Publishes ', ...c.publishes.flatMap((n, i) => [i ? ', ' : '', h('b', {}, n)])));
      }
    }
  }
  return parts;
}

/**
 * A notebook's sheet (ADR 0011 §6): what opens when its box on the canvas is tapped. The notebook itself, read top
 * to bottom, each of its cells a tap from its own sheet; and the box's own settings (its steps shown on the canvas or
 * folded into the box, its name and colour) under it.
 */
function renderNotebookSheet(g: GroupDef, o: NotebookOutline): void {
  const sheet = $('sheet');
  sheet.classList.remove('drill');
  const folded = state.collapsed.has(g.id);
  const published = g.steps.filter((id) => isOutput(id));
  const fold = h('button', { class: 'btn small', type: 'button', onclick: () => setFolded(g.id, !folded) }, folded ? 'Show its steps on the canvas' : 'Fold it into one box');
  const name = h('input', { id: 'section-name', type: 'text', maxlength: '40', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done' });
  name.value = g.name;
  const title = h('h2', {}, g.name);
  name.addEventListener('input', () => {
    const v = name.value.trim() || 'Untitled';
    title.textContent = v;
    editSection(g.id, (x) => ({ ...x, name: v }));
  });
  name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
  const color = g.color ?? 'slate';
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' },
    ...GROUP_COLORS.map((c) => h('button', { type: 'button', class: `swatch-btn c-${c}`, role: 'radio', 'aria-checked': String(c === color), 'aria-label': c, title: c, onclick: () => (editSection(g.id, (x) => ({ ...x, color: c })), renderSheet()) })));
  sheet.setAttribute('aria-label', 'Notebook');
  sheet.replaceChildren(
    h('div', { class: 'sheet-head' },
      h('div', { style: 'flex:1;min-width:0' }, h('p', { class: 'eyebrow' }, `Notebook · ${o.path}`), title,
        h('p', { class: 'foot' }, `${plural(g.steps.length, 'step')}${published.length ? `, publishes ${published.join(', ')}` : ', publishes nothing: the next notebook reads it'}.`)),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => select(null) }, '×')),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'nb-actions' }, fold),
      h('div', { class: 'nb' }, ...notebookElements(o)),
      isOwner() ? h('details', { class: 'about-flow' }, h('summary', {}, 'The box on the canvas'),
        h('div', { class: 'sheet-body' },
          h('div', { class: 'field' }, h('label', { for: name.id }, 'Name'), name),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), swatches),
          h('p', { class: 'foot' }, 'The box only changes how the flow looks: never what it computes, or its hashes. The notebook is what runs.'))) : ''));
  sheet.hidden = false;
}

function renderCanvas(): void {
  // Mid-drag, wait: the drop draws everything once it lands.
  if (moving) return;
  let sealed = false;
  const host = $('canvas');
  const svg = host.querySelector('svg') ?? setUpCanvas(host);
  const world = svg.querySelector('#world')!;
  const { cardW, cardH, head } = GRID;
  const doc = canvasDoc(viewDoc());
  const layout = gridLayout(doc, state.collapsed, wrapWidth());
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
      const { d, cx, cy } = edgePath(drawn.at.get(from)!, drawn.at.get(to)!, routeVia(layout, drawn.at.get(to)!));
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
    const g = s('g', { class: ['card', ...classes].join(' '), 'data-card': key, tabindex: 0, role: 'button', 'aria-label': `${name}: ${kind}. ${line.mark ? CARD_SAID[line.mark] : ''}${line.text}.${guard}${told}` });
    g.append(s('rect', { class: 'box', x, y, width: cardW, height: cardH, rx: 9 }));
    // Its seal: checked back to the bytes (a tick), or broken (a cross); beside the news dot.
    if (extra.seal) {
      if (extra.seal === 'ok') sealed = true;
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
    // A held day's mark before the line, a shape at 14 px (ADR 0009 §12), the words after it.
    if (line.mark) {
      const m = svgNode(glyph(PAUSE_MARK[line.mark], 14));
      m.setAttribute('x', String(x + 11));
      m.setAttribute('y', String(y + 42));
      m.classList.add('card-mark');
      g.append(m);
    }
    g.append(s('text', { class: 'what', x: x + 12 + (line.mark ? 17 : 0), y: y + 53 }, fit(line.text, Math.floor(chars * 1.12) - (extra.shield ? 1 : 0) - (line.mark ? 2 : 0))));
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
    const nbk = notebookOfSection(f.id);
    const outs = f.members.filter((m) => isOutput(m)).length;
    // What is wrong inside the box shows on the box (ADR 0013 §5): the day's cause (the judged dataset's story, a
    // load held by its own verdict), checks that held, or the step a failed run stopped at, with its line and mark.
    const cday = newsDay();
    const wrong = f.members.find((m) => (cday && m === loadSource() && storyFor(cday)?.severity === 'alert') || ownHoldOf(m) || state.failed?.origin === m || (!state.failed && onScreen()?.result.holds.some((x) => x.by === 'checks' && x.origin === m)));
    const line = wrong ? cardLine(wrong) : { text, tone: lost ? 'drop' as const : 'same' as const, badge: lost ? `−${fmtCompact(lost)} rows` : undefined };
    const heldInside = !!wrong && !ownHoldOf(wrong) && wrong !== loadSource();
    card(f.id, nbk ? `NOTEBOOK${outs ? ` · ${outs === 1 ? 'OUTPUT' : `${outs} OUTPUTS`}` : ''}` : 'SECTION', f.name, line, ['summary', `c-${f.color ?? 'slate'}`, ...(wrong ? (heldInside ? ['failed', 'held'] : ['cause']) : [])], wrong ? { health: 'alert' } : {});
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
    // Checks that held the day's run (ADR 0009): drawn as a held gate is.
    else if (!state.failed && onScreen()?.result.holds.some((x) => x.by === 'checks' && x.origin === id)) classes.push('failed', 'held');
    const cday = newsDay();
    if (cday && id === loadSource() && storyFor(cday)?.severity === 'alert') classes.push('cause');
    // A load the run holds by its own verdict is a cause too (ADR 0013 §5): drawn as the day's cause is.
    else if (ownHoldOf(id)) classes.push('cause');
    const os = outputState(id);
    if (os === 'asis' || os === 'fill' || os === 'complete') classes.push(cday && storyFor(cday)?.severity === 'alert' ? 'from-alert' : n?.status ?? 'built');
    else if (os) classes.push(os === 'alert' ? 'from-alert' : 'not-published');
    else if (notBuilt(id)) classes.push('not-published');
    else if (readable && !readable.open) classes.push('closed');
    else if (n) classes.push(n.status);
    if (state.selected === id) classes.push('selected');
    card(id, kindLabel(id), id, cardLine(id), classes, { port: sourceIds().has(id) ? 'in' : isOutput(id) ? 'out' : undefined, end: readersOf(id).length === 0, shield: shieldOf(id), health: healthOf(id), seal: sealOf(id) });
  }
  world.replaceChildren(...parts);
  canvasSealed = sealed;
  syncCanvasKey();
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
  // A notebook's box opens its notebook (ADR 0011 §6); a section of the owner's own, or one being arranged, its settings.
  if (focusName || state.arranging || !notebookOfSection(id)) renderSectionSheet(focusName);
  else void renderSheet();
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
  // The checks on the node, read directly or through its fill step (ADR 0009 amendment 1 S1, C7).
  const through = (k: number | undefined) => k === i || (k !== undefined && insp.plan.nodes[k]?.op === 'fill' && insp.plan.nodes[k]!.inputs[0] === i);
  insp.plan.nodes.forEach((n, j) => n.op === 'expect' && through(n.inputs[0]) && visit(j));
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
    const before = gridLayout(canvasDoc(doc), state.collapsed, wrapWidth());
    const slot = besideSlot(before, before.cards.get(stepId)!, id);
    next.layout = { ...pinLayout(canvasDoc(doc), state.collapsed, wrapWidth()), [id]: [slot.x, slot.y] };
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
/** A fingerprint of the shipped flow's own steps: edits kept against another version of them aren't used. */
const flowBase = (): string => {
  let hash = 0x811c9dc5;
  for (const ch of canonicalJSON(shippedDoc.steps as unknown as Parameters<typeof canonicalJSON>[0])) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
};

/** The flow's steps as edited here (settings applied, check boxes added or taken out), kept in this browser. */
function saveFlow(): void {
  try {
    localStorage.setItem(flowKey(), JSON.stringify({ v: 1, base: flowBase(), steps: state.doc.steps }));
  } catch {
    // Storage can be off: the edits then last as long as the page.
  }
}

function loadFlow(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(flowKey()) ?? 'null') as { v?: number; base?: string; steps?: unknown } | null;
    if (!saved || saved.v !== 1 || saved.base !== flowBase() || !Array.isArray(saved.steps)) return;
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

type Tab = 'news' | 'data' | 'columns' | 'dropped' | 'odd' | 'history' | 'checks' | 'integrity' | 'about';
const TAB_LABEL: Record<Tab, string> = { news: 'News', data: 'Data', columns: 'Columns', dropped: 'Dropped', odd: 'Odd rows', history: 'History', checks: 'Checks', integrity: 'Integrity', about: 'About' };
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
/** The weather input: the source its binding marks as the weather, the context the news tells (ADR 0010 §9). */
const weatherSource = (): string | undefined => state.doc.sources.find((x) => bindingOf(x.id)?.context === 'weather')?.id;
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
  // The gate's checks (ADR 0014 §7), on a node a flow with gates judges or lets out.
  if (!profileOf(card) && gateOn(id)) out.push('checks');
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
  checks: checksTab,
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
    const bar = showsRunRows(card, tab) ? (tab !== 'news' && asReaders(id, who) ? readersBar() : rowsFromBar()) : tab === 'news' && pauseOnTop(card) ? pauseBanner() : null;
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
  // An output that waits on a held day leads its News with the staged bar too: what the tab says is of staged rows.
  if (tab === 'news') return stagedOutput(id);
  return tab !== 'dropped' && tab !== 'history';
}

/** Whether an output's rows on screen are staged, not what readers get: it waits on the day held, or was not published. */
const stagedOutput = (id: string): boolean => {
  const out = outputState(id);
  return out === 'waiting' || out === 'dont';
};

/**
 * The head of a held day's output's News (ADR 0009 §12), under the staged bar: that it waits, with Decide, or what
 * became of it. Null for an output that doesn't wait (or a day that published).
 */
function outputPause(id: string): HTMLElement | null {
  const out = outputState(id);
  const own = onScreen();
  if (!own || (out !== 'waiting' && out !== 'dont' && !isOut(out as DayState | null))) return null;
  const now = pauseOf(own);
  const d = now?.pause?.decision ?? null;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const l = outputPausedLine({ state: out as DayState, may, deciders: deciders(), standing: standsOn(d), remedy: now?.remedy ?? null, withdrawn: now?.withdrawn ?? null });
  const day = dayOfRun(own);
  // Someone who may not decide sees what readers get, read only: the sheet drawn, when the trips are theirs to read;
  // else the outputs that wait and the day readers see, nothing of the trips (readersSheet).
  const see = !l.verb && out === 'waiting' ? h('button', { type: 'button', class: 'btn small vf-see-out', onclick: () => (historyOpen() ? decisionSheet(own, day ? storyFor(day) : null) : readersSheet(own)) }, 'What readers get ›') : null;
  return h('div', { class: `paused-line ${out}`, role: 'status' }, glyphEl(PAUSE_MARK[out as DayState], 15), h('b', {}, l.text),
    l.verb ? h('button', { type: 'button', class: 'btn small vf-decide-out', onclick: () => decisionSheet(own, day ? storyFor(day) : null) }, `${l.verb} ›`) : see);
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
    // What reads it are steps, never "readers": readers are the people who get the outputs (ADR 0009).
    const noun = up ? `${xs.length} inputs` : `feeds ${xs.length} steps`;
    return h('details', { class: `nav-fold ${up ? 'up' : 'down'}` }, h('summary', { class: 'nav-chip', 'aria-label': `${up ? 'What it reads' : 'What reads it'}: ${xs.join(', ')}` }, up ? `‹ ${noun}` : `${noun} ›`),
      h('div', { class: 'nav-list' }, ...xs.map((x) => chip(x, up))));
  };
  const news = cardNews(card);
  const kind = historyOf(profileOf(card)?.of ?? id);
  const day = newsDay();
  const story = day && kind === 'trips' ? storyFor(day) : null;
  const worst = story ? story.severity : news[0]?.severity;
  const count = story ? (story.severity === 'alert' || story.severity === 'warn' ? 1 : 0) + story.stories.length + story.more.length : news.filter((f) => f.severity === 'alert' || f.severity === 'warn').length;
  // A day held carries its mark on the News tab too (ADR 0009 §12), where its story is told or an output waits on it.
  const viewed = viewedDay();
  const held = viewed ? dayPause(viewed) : null;
  // Its mark there too where the step held the day (the checks at trips_valid), as the trips' News carries it.
  const pm = held && (story || outputState(id) === held || onScreen()?.result.holds.some((x) => x.origin === id)) ? held : null;
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
        TAB_LABEL[t], t === 'news' && worst && (worst === 'alert' || worst === 'warn') && count ? h('span', { class: 'tab-mark', 'aria-label': worst === 'alert' ? 'something’s wrong' : 'unusual' }, glyphEl(worst, 14)) : null,
        t === 'news' && pm ? h('span', { class: `tab-mark pause ${pm}`, 'aria-label': PAUSE_WORD[pm] }, glyphEl(PAUSE_MARK[pm], 14)) : null)))));
}

/** A strip of tabs wider than the screen: the chosen one scrolled into view, and each edge faded while tabs lie past
 * it, so a tab off screen reads as there. */
function fitTabs(strip: HTMLElement): HTMLElement {
  // A chevron at each faded edge, a tap from the tabs past it: the row reads as one that scrolls.
  const more = (dir: 1 | -1) => h('button', { type: 'button', class: `tabs-more ${dir > 0 ? 'r' : 'l'}`, 'aria-label': dir > 0 ? 'More tabs' : 'Earlier tabs', tabindex: '-1', hidden: true, onclick: () => strip.scrollBy({ left: dir * strip.clientWidth * 0.6, behavior: 'smooth' }) }, glyphEl('chev', 14));
  const [left, right] = [more(-1), more(1)];
  const edges = () => {
    const l = strip.scrollLeft > 2;
    const r = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
    strip.classList.toggle('fade-l', l);
    strip.classList.toggle('fade-r', r);
    left.hidden = !l;
    right.hidden = !r;
  };
  strip.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(() => {
    // The chosen tab in view with a tab's room either side of it where there is one, never cut at an edge.
    const on = strip.querySelector<HTMLElement>('[aria-selected="true"]');
    const pad = 44;
    if (on && (on.offsetLeft - pad < strip.scrollLeft || on.offsetLeft + on.offsetWidth + pad > strip.scrollLeft + strip.clientWidth)) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2;
    edges();
  });
  return h('div', { class: 'tabs-wrap' }, strip, left, right);
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
  // Stepping a day is a run: off for anyone who may not decide (round 3, #7).
  const busy = state.running || loads.playing || !state.engine || !mayRun();
  // On the first load a greyed ‹ says "first day", so the head doesn't read as broken; after the last, no arrow, its
  // place kept.
  const first = k <= 0;
  const last = k < 0 || k >= list.length - 1;
  const pm = dayPause(l.day);
  return h('div', { class: 'day-pick', role: 'group', 'aria-label': 'The day' },
    first
      ? h('button', { type: 'button', class: 'btn small day-first', 'aria-label': 'The first day: none before it', disabled: true }, '‹', h('span', {}, 'first day'))
      : h('button', { type: 'button', class: 'btn small', 'aria-label': 'The day before', disabled: busy, onclick: () => void useLoad(list[k - 1]!) }, '‹'),
    // The day held carries its mark by its date (ADR 0009 §12): ‖ paused, ⚑ published as is, ✕ not published.
    h('span', { class: 'day-at', 'aria-live': 'polite' }, pm ? h('span', { class: `day-mark ${pm}`, role: 'img', 'aria-label': `${PAUSE_WORD[pm]}:` }, glyphEl(PAUSE_MARK[pm], 15)) : '', `${dayLabel(l.day)}${l.note ? ` · ${l.note}` : ''}`),
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
  // A step from a notebook cell shows the cell (ADR 0011); any other its settings, editable where they are text.
  const cellBox = st && !profileOf(card) ? cellView(id) : null;
  if (cellBox) box.append(cellBox);
  else if (st && !profileOf(card)) box.append(editor(st));
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

// ------------------------------------------------------------------ tabs: checks (ADR 0014 §7)

/** The gate's checks on a node (ADR 0014 §1): its own gate's, or its layer's defaults, in a flow with gates. */
const gateOn = (id: string): GateChecks | null => gateChecksOf(state.doc, id);

/** Another watched source's ranges (ADR 0013 §5): its base with its tail folded in, by the flow's settings, so its own
 * findings can be told on its card; the judged dataset's are `history`. */
const otherRanges = new Map<string, { key: string; h: HistoryRanges }>();
function rangesForLoad(id: string): HistoryRanges | null {
  if (id === loadSource()) return history;
  const b = bases.get(id);
  if (!b) return null;
  const tail = tailBefore(tails.get(id) ?? [], '\uffff');
  const skips = recordedSkips();
  const levels = levelsOf(ledger?.entries ?? [], id);
  const key = JSON.stringify([tail.map((m) => m.slot), skips, levels]);
  const known = otherRanges.get(id);
  if (known && known.key === key) return known.h;
  let h: HistoryRanges;
  try {
    h = new HistoryRanges(tail.length ? appendPeriods(b.file, tail) : b.file, { ...rangesFor(state.doc, id), recorded: new Set(skips), levels });
  } catch {
    return null;
  }
  otherRanges.set(id, { key, h });
  return h;
}

/** A watched node's findings on a day, as the flow judges it: the judged dataset's story, or another load's own news. */
function loadFindings(id: string, day: string): Finding[] {
  if (id === loadSource()) return dayNews(day);
  const h = rangesForLoad(id);
  if (!h || !h.file.days.includes(day)) return [];
  const apart = apartFor(id, day);
  return newsOf(h, day, flowNames(state.doc, id), { checks: countedChecks(state.doc, h, id), judge: judgeOf(state.doc, id), ...(apart ? { apart } : {}) });
}

/**
 * The gate's checks, one a row (ADR 0014 §7): the check and what it says, written or learned, what it does (hold, warn,
 * off), and today's result from the day's findings. Read-only in this slice: the gate is written in the notebook's
 * gate cell, shown below; a check this build doesn't judge yet says so.
 */
async function checksTab(card: string, id: string): Promise<HTMLElement> {
  const checks = gateOn(id)!;
  const layer = gateLayerOf(state.doc, id)!;
  const ref = state.doc.cells?.[`gate:${id}`];
  const day = newsDay() ?? viewedDay();
  const findings = day ? loadFindings(id, day) : [];
  const judged = !!day && (id === loadSource() ? !!history : !!rangesForLoad(id)?.file.days.includes(day));
  const box = h('div', { class: 'checks-tab' });
  box.append(h('p', { class: 'lede' }, `${layer[0]!.toUpperCase()}${layer.slice(1)} gate: ${LAYER_SAID[layer]}. Written checks hold the day; learned ones warn, unless the ontology marks the value bad.`));
  const grid = h('div', { class: 'checks-grid', role: 'table', 'aria-label': `The ${layer} gate’s checks on ${id}` });
  const head = (t: string) => h('span', { class: 'ch-head', role: 'columnheader' }, t);
  grid.append(h('div', { class: 'ch-row', role: 'row' }, head('Check'), head('Kind'), head('Does'), head(day ? `Today · ${dayShort(day)}` : 'Today')));
  for (const name of CHECK_NAMES) {
    const mode = checks[name];
    const mine = findings.filter((f) => f.check === name && f.severity !== 'ok').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.score - a.score);
    const worst = mine[0];
    const today: Child = mode === 'off' ? h('span', { class: 'ch-quiet' }, 'off')
      : !JUDGED.has(name) ? h('span', { class: 'ch-quiet' }, 'not judged in this build')
      : name === 'classifier' && !samples.has(id) ? h('span', { class: 'ch-quiet' }, 'no kept sample for it: nothing to learn from')
      : !judged ? h('span', { class: 'ch-quiet' }, 'no day to judge')
      : worst ? h('span', { class: 'ch-found' },
        ...mine.slice(0, 3).map((f) => h('button', { type: 'button', class: `ch-today ${f.severity}`, onclick: () => (openTab(card, 'news'), void Promise.resolve().then(() => document.getElementById(`finding-${f.key}`)?.scrollIntoView({ block: 'center' }))) }, glyphEl(f.severity === 'ok' ? 'publish' : f.severity, 14), ` ${f.title}`)),
        mine.length > 3 ? h('span', { class: 'ch-quiet' }, `and ${mine.length - 3} more`) : null)
      : h('span', { class: 'ch-ok' }, glyphEl('publish', 14), ' as usual');
    grid.append(h('div', { class: `ch-row${mode === 'off' ? ' off' : ''}`, role: 'row' },
      h('span', { class: 'ch-name', role: 'cell', title: CHECK_SAID[name] }, h('span', { class: 'mono' }, name), h('span', { class: 'ch-said' }, CHECK_SAID[name])),
      h('span', { class: `chip ${WRITTEN.has(name) ? 'written' : 'learned'}`, role: 'cell' }, WRITTEN.has(name) ? 'written' : 'learned'),
      h('span', { class: `chip ${mode}`, role: 'cell' }, mode),
      h('span', { class: 'ch-cell', role: 'cell' }, today)));
  }
  box.append(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, `${layer} gate · ${CHECK_NAMES.filter((c) => checks[c] !== 'off').length} of ${CHECK_NAMES.length} checks on`), grid));
  // Where it is written: the gate cell, or the layer's defaults.
  const nb = ref ? state.doc.notebooks?.find((n) => n.path === ref.notebook) : undefined;
  if (ref && nb) {
    const lines = nb.source.split('\n').slice(ref.line - 1, ref.endLine);
    while (lines.length && lines[lines.length - 1]!.trim() === '') lines.pop();
    box.append(h('div', { class: 'part cell-part' },
      h('p', { class: 'eyebrow' }, `Gate cell · ${ref.notebook} · lines ${ref.line}–${ref.endLine}`),
      h('pre', { class: 'cell-code', tabindex: '0', 'aria-label': `The gate cell ${ref.cell} in ${ref.notebook}` }, h('code', {}, lines.join('\n'))),
      h('p', { class: 'foot' }, 'The gate is written here, and the plan carries it: to change a check, change the cell.')));
  } else box.append(h('p', { class: 'foot' }, `No gate cell yet: ${id} has the ${layer} layer’s defaults. A gate(${id}, { checks }) cell beside it sets them.`));
  return box;
}

// ------------------------------------------------------------------ tabs: data, with each column's distribution on top

/** Whether someone may decide a held day: they may publish it as is, or not. */
const mayDecide = (who: string): boolean => (['asis', 'dont'] as const).some((o) => checkDecision(policies(), who, o).allowed);

/**
 * Whether a viewer reads an output as readers have it rather than its staged rows (round 3, #2): an output kept back on
 * the held day on screen (waiting, or decided not to publish), to someone who may not decide. Nothing reaches readers
 * from a held day without a recorded decision, so a reader's Data, Columns and Results show the version readers have.
 */
const asReaders = (id: string, who: string): boolean => isOutput(id) && stagedOutput(id) && !mayDecide(who);

/** The bar over rows read as readers have them on a held day: "As published · Wed 14", or "Nothing published yet". */
const readersBar = (): HTMLElement | null => {
  const text = asPublished();
  return text ? h('p', { class: 'rows-from', role: 'note' }, text) : null;
};

/** A node of the latest run, as a person reads it: its inspection, place, columns and rows, or why not. An output a
 * viewer reads as readers have it (asReaders) is read from the run readers have it from. */
async function nodeView(id: string, who: string): Promise<{ insp: Inspection; i: number; read: string; columns: string[] } | string> {
  const readers = asReaders(id, who);
  if (readers && !state.names.has(id)) return 'Nothing published under this name yet: readers have no rows of it.';
  const run = readers ? state.names.get(id) : latest();
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
    // Shares of all the rows, blanks included, as the day's news counts them: one denominator on the row (a column 0.4%
    // filled says its top value at 0.3%, never at the 71% of the few rows it fills).
    const filled = p.facts.present / Math.max(1, p.facts.rows);
    const top = p.top.slice(0, 3).map((t) => ({ ...t, share: t.share * filled }));
    let x = 0;
    const svg = s('svg', { viewBox: `0 0 ${W} 8`, class: 'mini tops', 'aria-hidden': 'true' }) as SVGSVGElement;
    top.forEach((t, k) => {
      const w = Math.max(1, t.share * W);
      svg.append(s('rect', { class: `v${k}`, x: x.toFixed(1), y: 0, width: (w - 0.6).toFixed(1), height: 8 }));
      x += w;
    });
    // The top value only, said short: its meaning when that is a word or two (a company's without its legal form,
    // "Curb Mobility"), a money value in dollars, else its code (the rest is a tap away); its share after a "·".
    const name = (t: { value: unknown }) => {
      // As the news names it ("Flex Fare", never "Flex Fare trip" or its code 0), a zone by its name where it fits.
      const m = meaningFor(meaning, t.value)?.replace(/\s+trips?$/i, '');
      const who = m && /,?\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|Corp\.?)$/i.test(m) ? shortWho(m) : m;
      if (who && (who.split(/\s+/).length <= 3 || who.length <= 22)) return who;
      const n = Number(t.value);
      return meaning?.unit === 'USD' && t.value !== '' && Number.isFinite(n) ? `$${n.toFixed(2)}` : String(t.value);
    };
    // A tie is said as one, never as one value's lead: "all equal", or "3 tie · 17%".
    const tie = tieOf(p);
    const share = (x: number) => (x >= 0.1 ? `${Math.round(x * 100)}%` : shareSaid(x));
    const said = tie === 'all' ? 'all equal' : tie > 1 ? `${tie === p.top.length && p.facts.distinct > tie ? `${tie}+` : tie} tie · ${share(top[0]!.share)}` : `${name(top[0]!)} · ${share(top[0]!.share)}`;
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
  // A day filled from another day (ADR 0009 amendment 1 S12): its rows from that day first, each with its gutter
  // stippled, and the head says how many came from it.
  const mark = columns.find((c) => c.toLowerCase() === 'filled_from');
  const filled = mark ? (await state.engine!.query(`SELECT count(*), max(${columnSql(mark)}) FROM (\n${read}\n) WHERE ${columnSql(mark)} IS NOT NULL`)).rows[0] : undefined;
  const fromDay = filled && Number(filled[0]) > 0 && typeof filled[1] === 'string' ? String(filled[1]) : null;
  const r = await state.engine!.query(`SELECT * FROM (\n${read}\n)${where}${fromDay ? ` ORDER BY ${columnSql(mark!)} IS NULL` : ''} LIMIT 50`);
  const total = (await rowsAs(insp, i, who)) ?? 0;
  const at = mark ? r.columns.findIndex((c) => c.toLowerCase() === 'filled_from') : -1;
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
    h('tbody', {}, ...r.rows.map((row, k) => h('tr', {}, h('th', { class: `rownum${at >= 0 && row[at] !== null && row[at] !== undefined ? ' filled' : ''}`, scope: 'row' }, String(k + 1)), ...row.map((v, j) => cell(v, r.columns[j]!))))))));
  const from = fromDay ? h('p', { class: 'rows-filled', role: 'note' }, glyphEl('fill', 14), `${fmtInt(Number(filled![0]))} of ${fmtInt(total)} rows from ${dayShort(fromDay)}`) : null;
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
  return h('div', { class: 'data-tab' }, from, lead, grid);
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
  const f = colNews(id, p);
  if (f) {
    const folded = f.tier === 'absorbed' || f.tier === 'follows' || f.tier === 'sameDay';
    const m: VizMark = folded ? 'explained' : f.severity === 'alert' ? 'alert' : f.severity === 'warn' ? 'warn' : 'note';
    return h('span', { class: `cr-mark ${folded ? 'explained' : f.severity}`, 'aria-label': f.title }, glyphEl(m, 13));
  }
  return out.length ? h('span', { class: 'cr-mark ring', 'aria-label': 'outside its range, not news' }, h('i', {})) : null;
}

/** The day's news about a column, beside the day's own rows only (ADR 0008 §10). */
function colNews(id: string, p: Profile): Told | undefined {
  if (rowsFrom(shownDay(), viewedDay())) return undefined;
  return idNews(id).find((x) => x.columns?.includes(p.name) && x.severity !== 'ok') as Told | undefined;
}

/**
 * What a column's news says on its row, under its bar: the value it is about by name and both of its numbers, today's
 * and its usual, over all the day's rows as the bar's are, the arrow after them saying which way ("Curb Mobility: 40.6%
 * · usual 72–76% ▼"; never "▼41%" beside another value's bar, nor "▲99%" for a level of 99%). News with no value of its
 * own says its title. Null without news.
 */
function colSaid(id: string, p: Profile): string | null {
  if (historyOf(id) === 'trips' && storyFor(newsDay() ?? '')?.hero === 'hours' && /pickup/i.test(p.name) && p.kind === 'time') return null;
  const f = colNews(id, p);
  if (!f) return null;
  if (f.value !== undefined && f.range && (f.kind === 'share' || f.kind === 'missing' || f.kind === 'gone')) {
    const mem = f.members?.find((x) => x.column === p.name) ?? f.members?.[0];
    const value = mem?.value ?? f.values?.[0] ?? 'null';
    const raw = f.kind === 'missing' || value === 'null' ? 'blank' : mem?.label || NEWS_NAMES.label(p.name, JSON.parse(value) as unknown);
    // A company said short, as the bar above names its value ("Curb Mobility", not "Curb Mobility, LLC").
    const name = /,?\s+(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|Corp\.?)$/i.test(raw) ? shortWho(raw) : raw;
    const share = mem?.share ?? f.value;
    const range = mem?.range ?? f.range;
    const w = shareWords(share, range.low, range.high);
    const dir = share > range.high ? ' ▲' : share < range.low ? ' ▼' : '';
    return `${name}: ${share === 0 ? 'none' : w.value} · usual ${w.range}${dir}`;
  }
  return f.title;
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
      colMark(id, p, out),
      ((said) => (said ? h('span', { class: 'cr-said' }, said) : null))(colSaid(id, p)));
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
  // Counts are over every row; the shapes and common values from an even sample, said as such.
  const lead = h('p', { class: 'foot' }, `${plural(q.profiles.length, 'column')}${gappy ? ` · ${gappy} with blanks` : ''} · ${q.sample.length < q.rows ? `shapes from ${fmtInt(q.sample.length)} of ${plural(q.rows, 'row')}, sampled` : `shapes from all ${plural(q.rows, 'row')}`}`);
  if (opened) requestAnimationFrame(() => opened!.scrollIntoView({ block: 'start' }));
  return h('div', { class: 'columns-tab' }, lead, colKey(list), list);
}

/** A key for the marks the column rows carry, only those shown: ↳ the day's cause explains it, ▲/▼ its share today
 * above or below its usual, ○ outside its range without being news. */
function colKey(list: HTMLElement): HTMLElement | null {
  const has = (sel: string) => !!list.querySelector(sel);
  const text = list.textContent ?? '';
  const items: Child[] = [];
  if (has('.cr-mark.explained')) items.push(h('span', { class: 'ck-i' }, glyphEl('explained', 13), 'follows from the day’s news'));
  if (/[▲▼]/.test(text)) items.push(h('span', { class: 'ck-i' }, '▲▼ above or below usual'));
  if (has('.cr-mark.ring')) items.push(h('span', { class: 'ck-i' }, h('span', { class: 'cr-mark ring', 'aria-hidden': 'true' }, h('i', {})), 'outside its range'));
  return items.length ? h('p', { class: 'col-key', 'aria-label': 'Key' }, ...items) : null;
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
  /** What the watched source's rows are called (ADR 0010 §8): its noun in the ontology, else rows. */
  noun: (n?: number) => {
    const x = rowNoun(loadSource() ?? '');
    return n === 1 ? x.one : x.many;
  },
  /** A column whose parts the ontology names (ADR 0010 §8): "Vendor {code}", and whether its parts send the rows. The
   * flow's verdict reads the same (news.ts flowNames), so a head says "Vendor 1 sent almost nothing" in both. */
  part: (c: string) => {
    const p = loadSource() ? propertyOf(state.doc.ontology, loadSource()!, c) : undefined;
    return p && (p.name || p.role) ? { ...(p.name ? { name: p.name } : {}), ...(p.role ? { role: p.role } : {}) } : undefined;
  },
};

/** What a source's or step's rows are called, one and many (ADR 0010 §8, ontology.ts `nounOf`). */
const rowNoun = (id: string): Noun => ontologyNoun(state.doc.ontology, id, readersThrough(id));
/** A count with the watched source's noun: "41,939 trips". */
const rowsSaid = (n: number) => `${fmtInt(n)} ${NEWS_NAMES.noun(n)}`;
/** The watched source's noun as a title begins: "Trips". */
const RowsWord = () => NEWS_NAMES.noun().replace(/^./, (c) => c.toUpperCase());
/** What a day is compared with, as the watched source's ranges are made (ADR 0010 §3): the words for its guess follow it. */
const patternNow = (): 'weekly' | 'none' | 'monthly' => (flowHistory ?? history)?.pattern ?? 'weekly';

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
  // The load's own rows by hour and the split's values, once counted for this viewer (byHourFor): what tells an hour
  // fall where one part kept arriving.
  const byHour = hourValues.known.get(`${day}|${state.previewAs ?? state.viewer}`) ?? undefined;
  // Held at the gate: by the run on screen, its checks holding it (ADR 0009 §3), or, for a flow that doesn't say what
  // holds it, the gate that stopped the run.
  const own = loaded && gate && !state.failed ? onScreen() : undefined;
  const held = loaded && gate && ((state.failed && !state.failed.file && state.failed.origin === gate.step) || own?.result.holds.some((x) => x.by === 'checks' && x.origin === gate.step)) ? true : undefined;
  const refused = loaded && !!state.failed?.file;
  const key = `${day}|${checksAsCounted()}|${dataLog.version}|${[...hidden].sort().join(',')}|${held ?? ''}|${refused}|${byHour ? byHour.column : ''}|${upstreamFor(day).map((u) => `${u.source}=${u.state}`).join(',')}|${apartFor(loadSource() ?? '', day) ? samples.get(loadSource() ?? '')!.days.length : ''}`;
  let told = storyCache.get(key);
  if (!told) {
    // Judged as the document says (ADR 0010 §10): the watch's settings and the marks on its source; a legacy watch's are
    // the settings every flow had.
    const judge = judgeOf(state.doc, loadSource() ?? '');
    const apart = apartFor(loadSource() ?? '', day);
    const found = newsOf(history, day, NEWS_NAMES, { checks: checksAsCounted(), judge, ...(apart ? { apart } : {}) });
    const acknowledged = new Set(found.filter((f) => logOf(day, f.key).some((e) => e.act === 'expected')).map((f) => f.key));
    // What the other watched loads said of the day (ADR 0014 §2): a finding of the judged step that repeats a source's
    // follows from it.
    const upstream = upstreamFor(day);
    told = storyOf(history, day, found, { names: NEWS_NAMES, step: gate?.step, limit: gate?.limit ?? null, held, refused, acknowledged, hidden, judge, ...(byHour ? { byHour } : {}), ...(upstream.length ? { upstream } : {}) });
    storyCache.set(key, told);
    for (const old of [...storyCache.keys()].slice(0, Math.max(0, storyCache.size - 60))) storyCache.delete(old);
  }
  // An hour fall with a split, its load's rows on screen and not yet counted by hour for this viewer: counted now, and the
  // day told again with them (run() counts them before it first says the day, so this is for a viewer changed since).
  if (!byHour && wantsByHour(told) && !hourValues.known.has(`${day}|${state.previewAs ?? state.viewer}`)) void byHourFor(day).then((changed) => changed && retellDay());
  return told;
}

/** What each other watched source's claim said of a day (ADR 0014 §2), from the claims told for its runs, for the
 * judged step's story; none when the judged dataset is a source. */
function upstreamFor(day: string): { source: string; state: string; head: string }[] {
  const own = loadSource();
  if (!own || sourceIds().has(own)) return [];
  const out: { source: string; state: string; head: string }[] = [];
  for (const [key, c] of claims) {
    if (!key.startsWith(`${day}|`) || !c || c.source === own || out.some((x) => x.source === c.source)) continue;
    out.push({ source: c.source, state: c.state, head: c.head });
  }
  return out;
}

/**
 * The viewed load's rows by hour and by the split's column (story.ts HourValues), by day and viewer: null once counted
 * and found not to be had (the column closed to them, no time column, no run of the day on screen).
 */
const hourValues = { known: new Map<string, HourValues | null>(), pending: new Map<string, Promise<boolean>>() };

/** Whether a day's story would say more with its load's rows by hour and value: an hour fall to the day's end with a
 * split to count by. */
const wantsByHour = (s: Story): boolean => s.hero === 'hours' && !!s.split && !!s.hours && s.hours.to === 23 && s.hours.got.length === 24;

/**
 * Count the viewed day's own load by hour and by its story's split column, as the viewer reads it (ADR 0008 §6): its
 * watched source's rows on the run on screen, through the plan and emit.ts (emitHourValues), each stamp's hour read as
 * its measures read it (measures.ts hourValuesOf). True when the day's story can now be told with them.
 */
function byHourFor(day: string): Promise<boolean> {
  const who = state.previewAs ?? state.viewer;
  const key = `${day}|${who}`;
  if (hourValues.known.has(key)) return Promise.resolve(false);
  let found = hourValues.pending.get(key);
  if (found) return found;
  found = (async () => {
    // Pending before the story is asked for, so asking doesn't count again.
    await null;
    const s = storyFor(day);
    const run = onScreen();
    const src = loadSource();
    const time = history ? timeOf(history.file) : null;
    if (!s || !wantsByHour(s) || !run || dayOfRun(run) !== day || !src || !time || !state.engine) return false;
    const insp = await inspect(run);
    const i = insp.index.get(src);
    const sql = i === undefined ? null : readIn(insp, i, who);
    const column = s.split!.column;
    const cols = i === undefined ? [] : viewIn(insp, i, who).columns;
    if (i === undefined || !sql || !cols.includes(column) || !cols.includes(time)) {
      hourValues.known.set(key, null);
      return false;
    }
    const r = await state.engine.query(emitHourValues(sql, time, column));
    hourValues.known.set(key, hourValuesOf(r.rows, column, history!.file.zone ?? null));
    for (const k of [...storyCache.keys()]) if (k.startsWith(`${day}|`)) storyCache.delete(k);
    return true;
  })().catch((e) => {
    console.warn(`smaltfl: couldn't count ${day} by hour: ${message(e)}`);
    hourValues.known.set(key, null);
    return false;
  }).finally(() => hourValues.pending.delete(key));
  hourValues.pending.set(key, found);
  return found;
}

/** The day on screen told again: once its load's rows by hour came in after it was first drawn. */
function retellDay(): void {
  syncTitle();
  const r = onScreen();
  if (r && !state.running) sayRun(r);
  renderCanvas();
  if (state.selected) void renderSheet();
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
  return rowNoun(id).many;
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
/** What a strip's darker bands are: the viewed day's weekday, said plural ("Sundays"), for its key. */
const sameDays = (day: string) => `${WEEKDAY_NAMES[dateOf(day).getUTCDay()]!}s`;
const stripLabels = (days: readonly StripDay[]): [number, string, string?][] => (days.length ? [[0, shortDay(days[0]!.day), 'start'], [days.length - 1, shortDay(days.at(-1)!.day), 'end']] : []);

/** The split on one count scale: the named part and everything else, the moved one with its mark. */
function splitVisual(story: Story): Element | null {
  const sp = story.split;
  if (!sp) return null;
  const sev = story.severity === 'alert' || story.severity === 'warn' ? story.severity : 'warn';
  const partMoved = sp.kind !== 'held';
  return svgNode(partBar({
    left: { name: partLabel(sp), today: sp.part.today, usual: sp.part.usual, label: countLabel(sp.part), sev: partMoved ? sev : null, overLabel: overLabel(sp), kept: !partMoved },
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
  // Beside a head about the hours from a fall, it says its window ("whole day −65%").
  const said = story.labels.amount.map((l) => /^(?:(.+) )?([+−]\d+%)$/.exec(l)).find((m) => !!m);
  const change = said?.[2];
  return svgNode(amountLine({ value: a.value, low: a.low, high: a.high, valueLabel: fmtInt(a.value), unit: NEWS_NAMES.noun(a.value), bandLabel: `usual ${compact(a.low)}–${compact(a.high)}`, changeLabel: change, changeWindow: said?.[1], sev, aria: `${rowsSaid(a.value)} on ${dayLabel(story.day)}${change ? `, ${said?.[1] ? `${said[1]} ` : ''}${change} against a usual ${wd}` : ''}, where a usual ${wd} has ${fmtInt(a.low)} to ${fmtInt(a.high)}.` }));
}

/** The hour chart's picture of a day told by its hours, the same on the card and in the Hours sheet: the fall, the
 * trips missing from it, and, where one part kept arriving (story.kept), the two parts stacked and keyed. */
function hourProps(story: Story): Parameters<typeof hourBars>[0] & { aria?: string } {
  const hr = story.hours!;
  const l = story.hoursLabels!;
  return {
    got: hr.got, usual: hr.usual, cut: hr.from, to: hr.to, cutLabel: l.cut, floorLabel: l.floor, missingLabel: l.missing, ghostLabel: l.ghost, beforeLabel: l.before,
    ...(story.kept && l.kept && l.rest ? { kept: { got: story.kept.got, label: l.kept, restLabel: l.rest } } : {}),
    aria: '',
  };
}

/** What the hour chart shows, said: the fall, what still came, and with a part that kept arriving, the two parts. */
function hourAria(story: Story): string {
  const hr = story.hours!;
  const l = story.hoursLabels!;
  const wd = WEEKDAY_NAMES[dateOf(story.day).getUTCDay()]!;
  const at = clockText(hr.from * 60);
  const had = hr.got.slice(hr.from, hr.to + 1).reduce((a, b) => a + b, 0);
  const want = hr.usual.slice(hr.from, hr.to + 1).reduce((a, b) => a + b, 0);
  const fall = Math.round((1 - had / Math.max(1, want)) * 100);
  const k = story.kept;
  if (k) {
    const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
    const restAt = k.rest[hr.from] ?? 0;
    const restAfter = sum(k.rest.slice(hr.from + 1));
    return `${RowsWord()} by hour, ${dayLabel(story.day)}, against a usual ${wd}: ${k.name} kept arriving all day, ${fmtInt(sum(k.got.slice(hr.from)))} from ${at}; everything else stopped in the ${at} hour, ${fmtInt(restAt)} then and ${fmtInt(restAfter)} after; ${rowsSaid(had)} from ${at} where about ${fmtInt(want)} is usual (−${fall}%)${l.before ? `; before ${at}, ${l.before}` : ''}.`;
  }
  return `${RowsWord()} by hour, ${dayLabel(story.day)}, against a usual ${wd}: from ${at} ${had ? `they fall ${fall}% but don't stop, ${rowsSaid(had)} where about ${fmtInt(want)} is usual, ${l.floor.replace('/h', ' an hour')}` : `no ${NEWS_NAMES.noun()} came, where about ${fmtInt(want)} is usual`}${l.before ? `; before ${at}, ${l.before}` : ''}.`;
}

/** The hero of a story's cause card: the one visual its cause calls for. */
function heroOf(story: Story): Element | null {
  const day = story.day;
  const wd = WEEKDAY_NAMES[dateOf(day).getUTCDay()]!;
  if (story.hero === 'split') return splitVisual(story);
  if (story.hero === 'hours' && story.hours && story.hoursLabels) {
    return svgNode(hourBars({ ...hourProps(story), aria: hourAria(story) }));
  }
  if ((story.hero === 'amount' || story.hero === 'finding') && story.cause?.kind === 'volume') {
    const days = stripOf({ of: 'trips' }, day, 28, story.severity);
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, key: STRIP_KEY, ...(story.labels.key[2] ? { more: { same: story.labels.key[2] } } : {}), aria: `${RowsWord()} day by day for four weeks to ${dayLabel(day)}, each against its own usual range; ${sameDays(day)} a step darker.` })) : null;
  }
  if (story.hero === 'gate' && story.gate) return gateVisual(story.gate, true, gateScale(story));
  // A population seen through its blanks: its share on its own row, zoomed to where it and its range are.
  const pop = story.split?.via === 'blanks' ? story.cause?.members?.find((m) => m.value !== 'null') : undefined;
  if (story.hero === 'finding' && pop && story.split) {
    const w = shareWords(pop.share, pop.range.low, pop.range.high);
    const sev = story.severity === 'alert' || story.severity === 'warn' ? story.severity : null;
    return svgNode(dumbbellRows({ rows: [{ label: story.split.name, today: pop.share, low: pop.range.low, high: pop.range.high, todayLabel: w.value, usualLabel: `usually ${w.range}`, sev }], aria: `${story.split.name} ${NEWS_NAMES.noun()}: ${w.value} of the day's ${NEWS_NAMES.noun()}, where ${w.range} is usual.` }));
  }
  if (story.hero === 'finding' && story.cause) return findingVisual(story.cause);
  if (story.hero === 'calm') {
    // After an episode, its days carry their marks: held at the checks, or published with something wrong.
    const rec = story.recovery;
    // Under a flow that holds, each by its severity and what became of it: ! ‖ waiting, ! ⚑ published as is, ! ✕ not
    // published (ADR 0009 §12), as the loads strip draws them; a day of it this visit didn't run, its fate unknown here,
    // is drawn not run (dashed, no mark), never as published with something wrong.
    const fate = (d: string): VizMark[] => {
      const f = state.doc.publish ? dayFate(d) : null;
      return f && f !== 'published' ? ['alert', PAUSE_MARK[f]] : rec!.held.includes(d) && !state.doc.publish ? ['held'] : ['alert'];
    };
    const unrun = (d: string) => !!state.doc.publish && dayFate(d) === null && loads.list.some((l) => l.day === d);
    // A day held before this one keeps its marks in every later strip, decided or not, whether or not this day comes
    // straight after its episode (Tue Sep 20, 2022 still shows Sat 17 and Sun 18 waiting).
    const heldBefore = (d: string): VizMark[] | null => {
      const f = state.doc.publish && d < day ? dayPause(d) : null;
      if (!f) return null;
      const sev = storyFor(d)?.severity;
      return [...(sev === 'alert' || sev === 'warn' ? [sev] : []), PAUSE_MARK[f]];
    };
    // A load before this day that this visit didn't run is drawn not run wherever it falls in the week (Tue 19 and Wed
    // 20 reached straight from Thu 21), as the canvas's strip draws it, never with the history's count as if run.
    const days = stripOf({ of: 'trips' }, day, 7).map((d) => {
      // The day not judged yet: its count and no band, under ◌ (ADR 0010 §12).
      if (d.day === day && story.state === 'unlearned') return { ...d, low: null, high: null, sev: null, unlearned: true };
      if (d.day < day && unrun(d.day)) return { ...d, notRun: true, sev: null };
      if (rec && d.day >= rec.from && d.day <= rec.to) return { ...d, sev: 'alert' as const, marks: fate(d.day) };
      const marks = heldBefore(d.day);
      return marks ? { ...d, sev: marks[0] === 'alert' || marks[0] === 'warn' ? marks[0] : null, marks } : d;
    });
    // Its key names each mark it draws that its line doesn't (the line under it keys ‖ ⚑ ✕): the episode's "wrong".
    const keyMarks: Partial<Record<VizMark, string>> = { alert: 'wrong', ...(state.doc.publish ? {} : { held: 'held' }) };
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, key: STRIP_KEY, ...(rec ? { more: { marks: keyMarks } } : {}), aria: `${RowsWord()} the seven days to ${dayLabel(day)}, each against its own usual range${rec ? `; ${rec.held.length ? `${rec.held.length} held at the checks` : ''}${rec.held.length && rec.published.length ? ', ' : ''}${rec.published.length ? `${rec.published.length} published with something wrong` : ''}` : ''}.` })) : null;
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
    // The gap to the limit: in the sheet always; on the card where the checks held or came near (story.labels.gate).
    shareLabel: l.share, limitLabel: l.limit, marginLabel: big || g.held || l.zoom ? l.margin : null, zoom: l.zoom,
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
    return days.length ? svgNode(dayStrip({ days, labels: stripLabels(days), aria: `${RowsWord()} day by day: ${f.title}` })) : null;
  }
  if (f.kind === 'hours' && f.hours) return svgNode(hourBars({ got: f.hours.got, usual: f.hours.usual, cut: f.hours.from, cutLabel: clockText(f.hours.from * 60), aria: `${RowsWord()} by hour: ${f.title}` }));
  if ((f.kind === 'share' || f.kind === 'gone' || f.kind === 'missing') && (f.members?.length || f.range)) {
    const rows: Dumbbell[] = (f.members ?? [{ column: f.columns?.[0] ?? '', value: f.values?.[0] ?? 'null', label: '', share: f.value ?? 0, range: f.range!, rows: f.rows ?? 0 }]).map((m) => {
      const w = shareWords(m.share, m.range.low, m.range.high);
      // A code's meaning says what it is on its own ("Store and forward trip"); a bare value is said with its column.
      const raw = m.value === 'null' ? null : JSON.parse(m.value) as unknown;
      const said = m.value === 'null' ? 'blank' : m.label || NEWS_NAMES.label(m.column, raw);
      const label = m.value !== 'null' && said !== String(raw) && !/^\$?-?[\d.,]+$/.test(said) ? said : `${NEWS_NAMES.column(m.column)} ${said}`;
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
function openDetail(title: string, sev: Severity, body: (Node | null)[], f?: Finding | null, card?: string, primary?: Act | null, lead?: HTMLElement | null): void {
  document.querySelector('.vf-detail-wrap')?.remove();
  const close = () => {
    wrap.remove();
    if (sheetStale && state.selected) void renderSheet();
    sheetStale = false;
  };
  const sheet = h('div', { class: 'vf-detail', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, ...(f ? { id: `finding-${f.key}` } : {}) },
    h('div', { class: 'vf-grab', 'aria-hidden': 'true' }),
    h('div', { class: 'vf-dhead' }, h('h3', {}, sevMark(sev) ? glyphEl(sevMark(sev)!, 16) : '', title), h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: close }, '×')),
    ...body.filter((x): x is Node => !!x),
    f && card ? actionsOf(f, card, primary !== undefined ? primary : (f.acts[0] ?? null), lead ?? undefined, !!lead) : null);
  const wrap: HTMLElement = h('div', { class: 'vf-detail-wrap', onclick: (e: Event) => e.target === wrap && close() }, sheet);
  wrap.addEventListener('keydown', (e: Event) => (e as KeyboardEvent).key === 'Escape' && close());
  // Over the card's sheet when one is open; from the canvas (Decide, Change decision on its day line), over the page.
  const host = document.getElementById('sheet');
  (host && !host.hidden ? host : document.body).append(wrap);
  (sheet.querySelector('button.close') as HTMLElement | null)?.focus();
}
const block = (head: string, ...children: (Node | null)[]) => h('div', { class: 'vf-block' }, h('p', { class: 'vf-bh' }, head), ...children.filter((x): x is Node => !!x));
const oneLine = (text: string | null | undefined) => (text ? h('p', { class: 'vf-one' }, text) : null);

/** What a tap on the cause opens: the cause told in more visuals. */
function causeDetail(story: Story, card: string): void {
  const day = story.day;
  const body: (Node | null)[] = [];
  const sp = story.split;
  // The sections in the cause's order: a day told by its hours leads with them, and its waterfall counts the same
  // windows as its hour chart and amount line (story.fallSteps: before the fall, from it, the whole day).
  const byHours = story.hero === 'hours';
  if (byHours && (story.hours || story.episode)) body.push(hoursDetail(story));
  const steps = (byHours ? fallSteps(story) : null) ?? splitSteps(story);
  if (story.amount && steps) {
    // Its labels whole counts, so they add up as read and end on the count the card prints (stepLabels).
    const [usual, moved, other, today] = steps as [DayStep, DayStep, DayStep, DayStep];
    const way = (v: number) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`;
    const kind = (x: DayStep) => (x.value >= 0 ? 'up' as const : 'down' as const);
    body.push(block('From a usual day to this one', svgNode(waterfall({
      steps: [
        { ...usual, total: true, kind: 'total' },
        { ...moved, kind: kind(moved), ...(moved.usual ? {} : { sev: story.severity === 'alert' || story.severity === 'warn' ? story.severity : undefined }) },
        { ...other, kind: kind(other), ...(byHours && !other.usual ? { sev: story.severity === 'alert' || story.severity === 'warn' ? story.severity : undefined } : {}) },
        { ...today, total: true, kind: 'total' },
      ],
      aria: `From a usual day's ${rowsSaid(usual.value)} to ${fmtInt(today.value)}: ${moved.name} ${way(moved.value)}${moved.usual ? ' (within its usual range)' : ''}, ${other.name} ${way(other.value)}${other.usual ? ' (within its usual range)' : ''}.`,
    }))));
  }
  if (sp && story.amount) {
    const part = stripOf({ of: 'count', column: sp.column, value: sp.value }, day, 28, story.severity);
    const at = part.at(-1);
    if (part.length) body.push(block(`${sp.name}, day by day`, svgNode(dayStrip({ days: part, h: 88, labels: stripLabels(part), key: STRIP_KEY, more: { same: sameDays(day) }, unit: '/day', aria: `${sp.name} records day by day for four weeks to ${dayLabel(day)}, each against its own usual range${at?.v !== null && at?.v !== undefined ? `: ${fmtInt(at.v)} on ${dayLabel(day)}${at.low !== null && at.high !== null ? `, where ${fmtInt(at.low)} to ${fmtInt(at.high)} is usual` : ''}` : ''}.` }))));
    // Its column's shares, usual and today, only when the part's own count moved: a part that held reads as a share
    // that surged when the rest fell (Thu Sep 21, 2023: Flex Fare 3.9% → 11.1% on its usual 4,657 trips). Its count is
    // on its segment, beside its share.
    const partOff = sp.part.low !== null && sp.part.high !== null ? sp.part.today < sp.part.low || sp.part.today > sp.part.high : Math.abs(sp.part.today / Math.max(1, sp.part.usual) - 1) > 0.1;
    const comp = partOff ? compositionOf(sp.column, day, sp.value, [partLabel(sp), sp.name], [approx(sp.part.usual), fmtInt(sp.part.today)]) : null;
    if (comp) body.push(block(`${NEWS_NAMES.column(sp.column)}, usual and today`, comp));
    body.push(oneLine(splitSentence(story)));
    if (sp.blank.length) body.push(h('div', { class: 'vf-chips' }, h('span', { class: 'vf-chip' }, `${sp.blank.length} fields blank on these ${NEWS_NAMES.noun()}`)));
  }
  if (!byHours && (story.hours || story.episode)) body.push(hoursDetail(story));
  if (story.hero === 'amount' || story.hero === 'calm') {
    const days = stripOf({ of: 'trips' }, day, 56, story.severity);
    if (days.length) body.push(block(`${RowsWord()}, eight weeks`, svgNode(dayStrip({ days, h: 90, labels: stripLabels(days), key: STRIP_KEY, more: { same: sameDays(day) }, unit: '/day', aria: `${RowsWord()} day by day for eight weeks to ${dayLabel(day)}.` }))));
    // The weather the card notes, under the same days, drawn and not said: context beside the trips, never a reason.
    const wx = story.labels.context && days.length ? weatherBars(story, days.map((d) => d.day), stripLabels(days)) : null;
    if (wx) body.push(wx);
  }
  // A population's own rows (the value and each field blank on it, all at one share) would say the split again.
  if (story.hero === 'finding' && story.cause && story.split?.via !== 'blanks') body.push(findingVisual(story.cause), oneLine(story.cause.detail));
  openDetail(story.head, story.severity, body, anchorOf(story), card, story.primary, pausedLead(story));
}

/**
 * On a day paused, a detail's main action is the card's: Decide (or, for someone who may not, who does), the story's
 * own verbs secondary (ADR 0009 §12). Null on any other day.
 */
function pausedLead(story: Story): HTMLElement | null {
  const own = !state.failed && story.day === viewedDay() ? onScreen() : undefined;
  if (!own || pauseOf(own)?.state !== 'waiting') return null;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  return may
    ? h('button', { type: 'button', class: 'vf-primary vf-decide', 'aria-label': `Decide what readers get for ${dayMid(story.day)}`, onclick: () => decisionSheet(own, story) }, 'Decide')
    : h('span', { class: 'vf-waits' }, `${deciders()} decides`);
}

/** An episode's shortfall said with its bound in words, never the bound alone (ADR 0008 §6): "~187k fewer (at least
 * 130k)". */
function shortSaid(est: number, short: number, noun = 'fewer'): string {
  const sig = (n: number) => { const mag = 10 ** (Math.floor(Math.log10(Math.max(1, n))) - 1); return Math.floor(n / mag) * mag; };
  return `~${compact(est)} ${noun} (at least ${short >= 1000 ? compact(sig(short)) : fmtInt(short)})`;
}

/**
 * What the episode's chip opens (ADR 0008 §11): its days so far and none after the viewed one (on the day after it, all
 * of them), one bar a day, each day's trips over its usual day with what became of it under its date (! ‖, ! ⚑, ! ✕, a
 * day not run here dashed), the trips short so far on one bar, a segment a day, as the chip counts them; then the days,
 * each with Decide while it waits.
 */
type EpisodeRow = { label: string; trips: number; usual: number; low: number; short: number; marks: VizMark[]; notRun: boolean; at: boolean; day: string; fate: DayState | 'published' | 'notrun' | null };

/**
 * An episode's days so far (or, after it, all of them), each with the trips it was short as the chip and the hours
 * count them (the day it fell from its hour, the days after whole), what became of it here, and whether this visit ran
 * it: what the chip draws and the episode's sheet draws and lists. Null with no history or no days.
 */
function episodeRows(story: Story): { days: EpisodeRow[]; first: string; last: string; total: { estimate: number; bound: number } } | null {
  if (!history) return null;
  const file = history.file;
  const rec = story.recovery;
  const first = story.episode?.since ?? rec?.from ?? story.day;
  const last = story.episode ? story.day : (rec?.to ?? story.day);
  const span = daysFrom(first, last);
  const viewed = viewedDay();
  const inLoads = (d: string) => loads.list.some((l) => l.day === d);
  // The trips short so far, as the chip and the hours count them: the day it fell from its hour, the days after whole.
  const fall = (() => { const f = storyFor(first)?.hours; return f ? { day: first, ...f } : null; })();
  const ep: EpisodeDay[] = [];
  const rows = span.map((d) => {
    const k = file.days.indexOf(d);
    const r = rangesOf({ of: 'trips' })?.at(d);
    if (k < 0 || !r) return null;
    const got = file.hours?.[k] ?? [file.rows[k]!];
    ep.push({ day: d, got, low: r.low, expected: r.expected, alert: storyFor(d)?.severity === 'alert' });
    return { day: d, trips: file.rows[k]!, usual: r.expected, low: r.low };
  }).filter((x): x is { day: string; trips: number; usual: number; low: number } => !!x);
  if (!rows.length) return null;
  const whole = (to: string) => ep.filter((d) => d.day <= to).reduce((t, d) => {
    const got = d.got.reduce((a, b) => a + b, 0);
    return { estimate: t.estimate + Math.max(0, d.expected - got), bound: t.bound + Math.max(0, d.low - got) };
  }, { estimate: 0, bound: 0 });
  const so = (to: string) => (fall ? shortfall(ep, fall, to) : whole(to));
  const fateOf = (d: string): DayState | 'published' | 'notrun' | null => {
    const f = state.doc.publish ? dayFate(d) : null;
    return f ?? (state.doc.publish && inLoads(d) && (!viewed || d < viewed) ? 'notrun' : null);
  };
  let before = 0;
  const days = rows.map((x): EpisodeRow => {
    const est = so(x.day).estimate;
    const short = est - before;
    before = est;
    const f = fateOf(x.day);
    const sev = storyFor(x.day)?.severity;
    const sevMarks: VizMark[] = sev === 'alert' || sev === 'warn' ? [sev] : [];
    const marks: VizMark[] = f === 'notrun' ? [] : f && f !== 'published' ? [...sevMarks, PAUSE_MARK[f]] : sevMarks;
    return { label: dayShort(x.day), trips: x.trips, usual: x.usual, low: x.low, short, marks, notRun: f === 'notrun', at: x.day === viewed, day: x.day, fate: f };
  });
  return { days, first, last, total: so(last) };
}

function episodeSheet(story: Story): void {
  const ep = episodeRows(story);
  if (!ep) return;
  const { days, first, last, total } = ep;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const said: Record<string, string> = { waiting: 'waits for a decision', asis: 'published as is', dont: 'not published', fill: 'filled', complete: 'part only', published: 'published', notrun: 'not run' };
  // The estimate and its bound said apart, which is which (round 3, #23): "likely ~187k short so far · at least 130k".
  const totalSaid = total.estimate >= 1 ? `likely ${shortSaid(total.estimate, total.bound, 'short so far').replace(/ \(at least (.+)\)$/, ' · at least $1')}` : null;
  const svg = svgNode(episodeDays({
    days, total: totalSaid, key: STRIP_KEY,
    aria: `${RowsWord()} each day, ${dayMid(first)} to ${dayMid(last)}, against a usual day: ${days.map((d) => `${d.label} ${d.notRun ? 'not run' : `${fmtInt(d.trips)} (usual ~${compact(d.usual)})`}${d.fate && d.fate !== 'notrun' ? `, ${said[d.fate]}` : ''}`).join('; ')}${totalSaid ? `; about ${rowsSaid(total.estimate)} short so far, at least ${fmtInt(total.bound)}` : ''}.`,
  }));
  const list = state.doc.publish ? h('ul', { class: 'vf-daylist' }, ...days.map((d) => h('li', {},
    h('span', { class: 'dl-marks', 'aria-hidden': 'true' }, ...d.marks.map((m) => glyphEl(m, 14))),
    h('span', { class: 'dl-day' }, d.label),
    h('span', { class: 'dl-fate' }, d.fate ? said[d.fate] : ''),
    d.fate === 'waiting' && may ? h('button', { type: 'button', class: 'btn small primary', 'aria-label': `Decide what readers get for ${dayMid(d.day)}`, onclick: () => (document.querySelector('.vf-detail-wrap')?.remove(), decideDay(d.day)) }, 'Decide ›') : null))) : null;
  openDetail(`${dayShort(first)} to ${dayShort(last)}`, story.episode ? story.severity : 'ok', [svg, list]);
}

/** The snow a card notes, as bars under its strip of days (each day's column where the strip has it), the days the
 * card names said at its corner in the order their bars stand ("Sat 7.2 cm · Sun 1.5 cm"). A block of context: no band,
 * no mark, no sentence. */
function weatherBars(story: Story, days: readonly string[], labels?: [number, string, string?][]): HTMLElement | null {
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
    values, label: fmt, kind: 'snow', gx: 12, ...(labels ? { labels } : {}), note: named.map((d) => `${ddd(d)} ${fmt(of(d))}`).join(' · '),
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
  const shortLabel = shortSaid(est, short);
  const floorLabel = blank.length ? `under ${Math.ceil(floor / 100) * 100}/h ${blank.length > 1 ? `${ddd(blank[0]!)}–${ddd(blank.at(-1)!)}` : ddd(blank[0]!)}` : undefined;
  const svg = svgNode(episodeBars({
    days, cut, cutLabel: clockText(hrs.from * 60), floorLabel, at: span.indexOf(story.day),
    floorAt: blank.length ? ((span.indexOf(blank[0]!) + span.indexOf(blank.at(-1)!) + 1) * 24) / 2 : undefined,
    bracket: { from: cut, to: (lastBad + 1) * 24, label: shortLabel },
    aria: `${RowsWord()} by hour, ${dayLabel(span[0]!)} to ${dayLabel(span.at(-1)!)}: a fall at ${clockText(hrs.from * 60)} ${ddd(cutDay)}, about ${fmtInt(est)} fewer than usual through ${ddd(last)}, at least ${fmtInt(sig(short))} against the low end of usual${floorLabel ? `, ${floorLabel.replace('/h', ' an hour')}` : ''}.`,
  }));
  const readout = h('p', { class: 'vf-readout', 'aria-live': 'polite' });
  // First the viewed day as its head says it: the fall over its hours on the day it began (Thu from 13:00: 3,679 trips
  // · usual ~80k, −95%), else the day's own trips against a usual day (Fri: 4,633 trips · usual ~110k, −96%). A tap
  // then reads one hour.
  const had = hrs.got.slice(hrs.from, hrs.to + 1).reduce((a, b) => a + b, 0);
  const want = hrs.usual.slice(hrs.from, hrs.to + 1).reduce((a, b) => a + b, 0);
  const amt = story.amount;
  readout.textContent = story.day === cutDay || !amt
    ? `${ddd(cutDay)} ${hrs.to === 23 ? `from ${clockText(hrs.from * 60)}` : `${clockText(hrs.from * 60)}–${clockText((hrs.to + 1) * 60)}`}: ${rowsSaid(had)} · usual ~${compact(want)} (−${Math.round((1 - had / Math.max(1, want)) * 100)}%)`
    : `${ddd(story.day)}: ${rowsSaid(amt.value)} · usual ~${compact(amt.expected)} (${changeLabel(amt.value / Math.max(1, amt.expected) - 1)})`;
  const at = (i: number) => {
    const d = days[Math.floor(i / 24)];
    if (!d) return;
    const hr = i % 24;
    readout.textContent = `${d.label} ${clockText(hr * 60)} · ${rowsSaid(d.got[hr]!)} · usual ~${compact(d.usual[hr]!)}`;
  };
  svg.addEventListener('click', (e) => {
    const box = (svg as SVGSVGElement).getBoundingClientRect();
    const i = Math.floor(((e as MouseEvent).clientX - box.left) / Math.max(1, box.width) * days.length * 24);
    at(Math.max(0, Math.min(days.length * 24 - 1, i)));
  });
  const title = days.length > 1 ? `${days[0]!.label} to ${days.at(-1)!.label}, ${NEWS_NAMES.noun()} by hour` : `${days[0]!.label}, ${NEWS_NAMES.noun()} by hour`;
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
      // Under a flow that holds, the steps were built and staged (ADR 0009 §1); without one, the gate stopped them.
      if (run) chain.push({ kind: 'steps', label: `${run} step${run === 1 ? '' : 's'} ${state.doc.publish ? 'built, not published' : 'not built'}` });
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
  const keep = day === viewedDay() ? stoppedWords({ refused: false, origin: g.step, shown: keptDay(), viewed: day }).tail : null;
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
  const anchor = anchorOf(story);
  // Its title says the share as the bars under it do, and takes the checks' own mark (ADR 0008 §7): held is something
  // wrong; unusual only when their findings are, or the share came within a point of the limit; no mark for a gate
  // that passed as it usually does (Sat Sep 17, 2022: 4% dropped).
  const worst = checksWorst(g, story.findings);
  const sev: Severity = worst === 'alert' || worst === 'warn' ? worst : g.near ? 'warn' : 'ok';
  // Under a flow that holds, a gate that held paused the day: said with the state's one word (round 3, #20).
  openDetail(state.doc.publish && g.held ? gateHead(g).replace(/^Held at /, 'Paused at ') : gateHead(g), sev, gateBlocks(g, story.day, gateScale(story), story.findings), anchor, card, g.held ? 'notify' : story.primary, pausedLead(story));
}

/** What a tap on the checks' card opens: what the card above doesn't show. The rows dropped day by day, each day
 * against its own usual range (the card has today only), what a held run kept back, and the rows themselves a tap
 * away on Dropped. */
function checksDetail(g: Gate, story: Story, card: string, sev: Severity): (Node | null)[] {
  const day = story.day;
  // Today's tick takes the card's own severity only when more rows were dropped than a day like it drops: fewer (the
  // kept rows went missing, Fri Sep 22, 2023) is drawn plain under its band.
  const days = stripOf({ of: 'droppedRows' }, day, 28, g.usual && g.dropped > g.usual.high ? sev : undefined);
  const keep = g.held && day === viewedDay() ? stoppedWords({ refused: false, origin: g.step, shown: keptDay(), viewed: day }).tail : null;
  return [
    days.length ? block('Rows dropped, day by day', svgNode(dayStrip({ days, labels: stripLabels(days), zero: true, unit: ' rows/day', key: STRIP_KEY, more: { same: sameDays(day) }, aria: `Rows the checks dropped day by day for four weeks to ${dayLabel(day)}, each against its own usual range: today ${fmtInt(g.dropped)}${g.usual ? `, usual ${fmtInt(g.usual.low)} to ${fmtInt(g.usual.high)}` : ''}.` }))) : null,
    g.held ? block('What it held back', lineageVisual(g), keep ? h('p', { class: 'vf-sub' }, keep.replace(/^./, (c) => c.toUpperCase())) : null) : null,
    h('button', { type: 'button', class: 'linkish vf-to', onclick: () => { document.querySelector('.vf-detail-wrap')?.remove(); openTab(card, 'dropped'); } }, 'The rows it dropped ›'),
  ];
}

/** A share as a bar's label says it: none, under 0.1%, or to a tenth of a point. */
const shareSaid = (x: number) => (x === 0 ? '0%' : x < 0.001 ? '<0.1%' : pct(x));

/** A coded column's values as two 100% bars, usual and today, the moved value dark and labelled by `names` (in the
 * usual bar, then today's: "Vendor 1 · Creative Mobile 29.3%", "Vendor 1 <0.1%"). */
function compositionOf(column: string, day: string, moved?: string, names?: [string, string], counts?: [string, string]): Element | null {
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
      { label: 'usual', parts: parts.map((p) => ({ name: p.v, share: p.usual, text: name(p.v), ...(p.v === moved ? { callout: `${first} ${shareSaid(p.usual)}${counts ? ` · ~${counts[0]}` : ''}` } : {}) })) },
      { label: 'today', parts: parts.map((p) => ({ name: p.v, share: p.today, text: name(p.v), gone: p.today === 0 && p.usual > 0.002, ...(p.v === moved ? { callout: `${again} ${shareSaid(p.today)}${counts ? ` · ${counts[1]}` : ''}` } : {}) })) },
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
    // On a scale from 0 with its top printed (round 3, #23), a share's in percent, a count's as a count; and where today
    // ran with the days before and its band sits apart from them, where they ran, so the strip and the note agree.
    // A level (a median, a time) keeps its 0 and no printed top: its unit is the column's own.
    const scale = rangesOf(f.metric)?.scale;
    const axis = scale === 'share' ? axisShare : scale === 'count' ? (v: number) => compact(v) : undefined;
    const recent = axis ? recentSpan(days, axis) : null;
    const most = Math.max(...days.flatMap((d) => [d.high ?? 0, d.v ?? 0]));
    if (days.length) body.push(block('Day by day', svgNode(dayStrip({ days, labels: stripLabels(days), key: STRIP_KEY, more: { same: sameDays(day) }, zero: true, ...(axis ? { axis } : {}), aria: `${f.title}, day by day for four weeks${axis ? `, from 0 to ${axis(most)} at most` : ''}${recent ? `; ${recent}` : ''}.` })), recent ? h('p', { class: 'vf-sub' }, recent) : null));
  }
  if (day && f.columns?.[0] && (f.kind === 'share' || f.kind === 'gone' || f.kind === 'new') && history?.file.values?.[f.columns[0]]?.counts) body.push(block(`${NEWS_NAMES.column(f.columns[0])}, usual and today`, compositionOf(f.columns[0], day, f.values?.[0])));
  body.push(oneLine(f.detail));
  // A finding that follows from the day's cause gets no primary verb of its own (round 3, #21): on a day paused its
  // detail leads with the pause's verb, Decide (or who decides), and its own verbs wait behind ⋯.
  if (followsCause(f)) {
    const story = day && historyOpen() ? storyFor(day) : null;
    const lead = story ? pausedLead(story) : null;
    return openDetail(f.title, f.severity, body, f, card, null, lead);
  }
  openDetail(f.title, f.severity, body, f, card);
}

/** The method, once: how a day is judged (the brief's 'How it's judged'), drawn from the day's own trips: the points
 * its range is learned from, named, and two sentences; the rest of the method one tap further. */
function judgedDetail(story: Story | null, of: 'trips' | 'dropped' = 'trips'): void {
  const day = story?.day ?? newsDay();
  // The metric in view: the day's trips, or the rows its checks dropped (the checks' card), each with today's value.
  const r = day ? rangesOf(of === 'dropped' ? { of: 'droppedRows' } : { of: 'trips' })?.at(day) : null;
  const value = of === 'dropped' ? (story?.gate?.dropped ?? null) : (story?.amount?.value ?? null);
  const what = of === 'dropped' ? 'rows dropped' : NEWS_NAMES.noun();
  const body: (Node | null)[] = [];
  const band = r ? `usual ${compact(r.low)}–${compact(r.high)}` : '';
  const wd = day ? WEEKDAY_NAMES[dateOf(day).getUTCDay()]! : '';
  // A day not judged yet (ADR 0010 §1): why it has no range, in one sentence, and that it is published, marked.
  if (!r && day && of === 'trips' && story?.state === 'unlearned') body.push(oneLine(`Not judged yet: ${(rangesOf({ of: 'trips' })?.explain(day)?.why ?? 'too few days') === 'no last year' ? 'the history has no day like it a year before' : 'there are too few days like it before it'}, so its ${NEWS_NAMES.noun()} have no usual range. It is published, marked ◌; a day with under a tenth of its recent ${NEWS_NAMES.noun()} still pauses.`));
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
      weeks: weeks?.from.map((x) => x.value) ?? [], weeksLabel: weeks ? guessWords(weeks.from.length, wd, patternNow()).replace(/^the /, '') : '',
      year: year?.from.map((x) => x.value) ?? [], yearLabel,
      today: { v: value, low: r.low, high: r.high, sev: outside ? sev : null },
      bandLabel: band,
      aria: `${of === 'dropped' ? 'Rows dropped' : RowsWord()}: ${weeks ? `${guessWords(weeks.from.length, wd, patternNow())} (${weeks.from.map((x) => `${shortDay(x.day)} ${fmtInt(x.value)}`).join(', ')})` : ''}${weeks && year ? ' and ' : ''}${year ? `the day last year (${year.from.map((x) => `${shortDay(x.day)} ${fmtInt(x.value)}`).join(', ')})` : ''}: today's range from them, ${fmtInt(r.low)} to ${fmtInt(r.high)}${value !== null ? `; today ${fmtInt(value)}` : ''}.`,
    })));
  }
  // Two sentences, as the picture has it, from what this day's range was learned from (days.judgedWords); the rules for
  // shares, levels and quantiles are a tap further.
  const said = r && day ? (() => {
    const weeks = r.guesses.find((g) => g.by === 'weeks')?.from.map((x) => x.day) ?? [];
    const year = r.guesses.find((g) => g.by === 'year')?.from.map((x) => x.day) ?? [];
    return judgedWords({ weekday: wd, weeks, year, holiday: holidayOf(day, calendarNow()) ?? null, special: !!r.special, band: band.replace(/^usual /, ''), low: r.low, high: r.high, expected: r.expected, holidayIn: weeks.some((d) => !!holidayOf(d, calendarNow()) || !!seasonOf(d, calendarNow())), pattern: patternNow() });
  })() : null;
  body.push(
    oneLine(said?.[0] ?? `A day is judged against ${patternNow() === 'weekly' ? 'the same weekday in the weeks before' : patternNow() === 'monthly' ? 'the same day of the months before' : 'the days before'} and the day last year, weighted by how well each guesses.`),
    oneLine(said?.[1] ?? 'The band is that guess give or take its typical misses.'),
    h('details', { class: 'fold vf-more-method' }, h('summary', {}, 'More on the method'),
      h('p', { class: 'vf-sub' }, `A share or a level is told only a typical miss past its band’s edge. Shares are over all ${NEWS_NAMES.noun()}, blanks included; quantiles come from a 2,000-row sample; hours count ${NEWS_NAMES.noun()} before the checks.`)));
  openDetail(of === 'dropped' ? 'How the rows dropped are judged' : 'How it’s judged', 'ok', body);
}

/**
 * One verb, and the others behind ⋯. A day paused leads with Decide (ADR 0009 §12); with `paused` (the day waits), the
 * finding's own main verb follows as a secondary one (a detail's "Tell the source"), and "OK this day" is left out: it
 * would read as approving the day, and it publishes nothing. The ⋯ holds only what the viewer may do.
 */
function actionsOf(f: Finding, card: string, primary: Act | null, lead?: HTMLElement | null, paused = false, quiet = false): HTMLElement {
  const main = lead ?? (primary ? actButton(primary, f, card) : null);
  // A verb that is optional (a day with nothing to do, marked so) stays a secondary button: never a call to act.
  if (!lead && !quiet) {
    main?.classList.add('vf-primary');
    main?.classList.remove('small', 'quiet');
  }
  const second = lead && paused && primary && primary !== 'expected' ? actButton(primary, f, card) : null;
  second?.classList.add('quiet');
  // A value marked bad is never marked as expected, not even behind ⋯ (ADR 0010 §4, C9).
  const others = [...new Set([...f.acts, 'export' as Act])].filter((a) => (!lead || (paused && second) ? a !== primary : true) && !(paused && a === 'expected') && !(f.bad && a === 'expected'));
  const menu = h('div', { class: 'vf-menu', hidden: true }, ...others.map((a) => actButton(a, f, card)).filter((x): x is HTMLElement => !!x));
  const more = menu.childElementCount ? h('button', { type: 'button', class: 'vf-more', 'aria-label': `More actions: ${Array.from(menu.children).map((b) => b.textContent).join(', ')}`, title: Array.from(menu.children).map((b) => b.textContent).join(' · '), 'aria-expanded': 'false', onclick: (e: Event) => { menu.hidden = !menu.hidden; (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!menu.hidden)); } }, glyphEl('more', 16)) : null;
  const done = findingLog(f);
  return h('div', { class: 'vf-acts' }, main, second, more, menu, done.length ? h('ul', { class: 'f-log' }, ...done.map((e) => h('li', {}, logText(e)))) : null);
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

/**
 * The changes the day's news explains and the ones the same day, as one row (ADR 0008 §6): ↳, its first change named
 * and the rest counted ("Passengers 1 share + 27 more"), opening in place into the two groups, each headed by what it
 * is ("16 changes this explains · shares · times", "12 more this day").
 */
function foldedRow(story: Story, card: string, open = false): HTMLElement {
  const l = story.labels;
  const group = (head: string | null, items: readonly Told[]) => (head && items.length ? [h('p', { class: 'vf-group-h' }, head), ...shownRows(items, card, 3)] : []);
  const list = h('div', { class: 'vf-group', hidden: !open },
    ...group(l.follows ? [l.follows, ...l.kinds].join(' · ') : null, story.follows),
    ...group(l.sameDay, story.sameDay));
  const said = [story.follows.length ? `${story.follows.length} the day’s news explains` : '', story.sameDay.length ? `${story.sameDay.length} more the same day` : ''].filter(Boolean).join(', ');
  const btn = h('button', { type: 'button', class: 'vf-fold', 'aria-expanded': String(open), 'aria-label': `${l.folded}: ${said}. Open.`, onclick: () => { list.hidden = !list.hidden; btn.setAttribute('aria-expanded', String(!list.hidden)); } },
    glyphEl('explained', 14), h('span', { class: 'vf-fold-t' }, l.folded), h('span', { class: 'vf-chev' }, glyphEl('chev', 14)));
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
  // A day not judged yet is told as a calm one is, its head under ◌ (ADR 0010 §12): nothing to act on, nothing normal.
  const calm = story.state === 'calm' || story.state === 'notes' || story.state === 'recovery' || story.state === 'unlearned';
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
  // The day paused (ADR 0009 §12): its reach row says what paused it, what readers see and the outputs that wait, and
  // its one verb is Decide.
  const own = !state.failed && story.day === viewedDay() ? onScreen() : undefined;
  const paused = own && pauseOf(own) ? pauseRow(own, story, pauseOnTop(card)) : null;
  // On a paused card the checks are drawn in full only when they held the day too; else one line (decision.ts).
  const checks = paused ? pausedChecks(g, pauseOf(own)?.state !== 'waiting') : null;
  const after = afterRow(story);
  // An episode's chip: its days so far as days, the trips short so far in its words, and a tap to the episode's sheet.
  const days = ep ? ep.trend.length : story.recovery ? daysFrom(story.recovery.from, story.recovery.to).length : 0;
  // The part the head names, glossed once where it first appears, a tap away (ADR 0008 §5): what Flex Fare and Vendor 1
  // are, from the ontology, and whom "Tell the source" reaches when that is among the day's verbs.
  const term = termOf(story, anchor);
  const gloss = term ? h('div', { class: 'vf-gloss', id: `gloss-${card}`, hidden: true }, ...term.lines.map((x) => h('p', {}, x))) : null;
  const head: (Node | string)[] = term ? (() => {
    const at = story.head.indexOf(term.name);
    const btn = h('button', { type: 'button', class: 'vf-term', 'aria-expanded': 'false', 'aria-controls': `gloss-${card}`, 'aria-label': `${term.name}: what it is`, onclick: () => { gloss!.hidden = !gloss!.hidden; btn.setAttribute('aria-expanded', String(!gloss!.hidden)); } }, term.name);
    return [story.head.slice(0, at), btn, story.head.slice(at + term.name.length)];
  })() : [story.head];
  // The brief (ADR 0012 §1, §2): on a day with something to say, or a paused one, the input's News is the brief: the
  // status and the one sentence under the head, then the card's visual, then the impact, the cause and the fix, and the
  // ways to share it, in that order every time.
  // On the input's own card and on its profile box alike: whichever tells the day's story.
  const brief = (!calm || paused) && src && (card === src || card === profiles().find((p) => p.of === src)?.id) ? briefSections(story, card) : null;
  return h('section', { class: `vf-card ${story.state}${paused ? ' paused' : ''}${brief ? ' brief' : ''}`, ...(anchor ? { id: `finding-${anchor.key}` } : {}) },
    h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head', role: 'status', 'aria-live': 'polite' }, story.state === 'unlearned' ? glyphEl('unlearned', 18) : m && !calm ? glyphEl(m, 18) : '', ...head)),
    gloss,
    story.chip ? h('button', { type: 'button', class: 'vf-chip-btn', 'aria-label': `${story.chip}${ep ? `: ${ep.trend.map((d) => `${WEEKDAY_NAMES[dateOf(d.day).getUTCDay()]!.slice(0, 3)} ${Math.round((d.trips / Math.max(1, d.expected)) * 100)}% of a usual day`).join(', ')}${ep.short ? `; about ${rowsSaid(ep.short.estimate)} short so far` : ''}` : ''}. Open the episode’s days.`, onclick: () => episodeSheet(story) },
      chipIcon(story, days), story.chip, glyphEl('chev', 13)) : null,
    told ? h('p', { class: 'vf-told' }, glyphEl('ack', 14), told) : null,
    ...(brief ? brief.top : []),
    after,
    // An unusual day whose trips all came, with nothing to decide: says so, so its amber can't read as a call to act.
    story.labels.settle ? h('p', { class: 'vf-settle' }, story.labels.settle) : null,
    amount ? h('div', { class: 'vf-amount' }, h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.head}: open`, onclick: () => causeDetail(story, card) }, amount), info) : info,
    hero ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.head}: open`, onclick: () => causeDetail(story, card) }, hero) : null,
    // On a day told by its hours, the part and the rest only when the part moved too: a part that held within its range
    // (Flex Fare on Thu Sep 21, 2023) is told in the detail, never beside the fall as a second story.
    story.hero === 'hours' && story.split && story.split.kind !== 'held' ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${story.split.name} and everything else: open`, onclick: () => causeDetail(story, card) }, splitVisual(story)) : null,
    // A day paused says so under its visual, its one verb with it, before the health row and the checks, so deciding is
    // on the first screen (ADR 0009 §12): Decide, every verb of the story behind ⋯, kept there once decided.
    paused ? paused.reach : null,
    paused ? pausedActs(paused, anchor ?? undefined, card, own ? pauseOf(own)?.state === 'waiting' : false) : null,
    ...(brief ? brief.body : []),
    // The five health cells, under the day's visuals so they stay in the first screen on a day with something wrong; on
    // a paused card without their head, the pause row and the checks named on either side of them.
    // So does the day after an episode under a flow that holds, once its line says what became of its days (with Decide
    // while one waits): the line and the strip are named around it, and the line's "not published" takes the head's word
    // (round 3, #20).
    healthRow(story, card, !!paused || (story.state === 'recovery' && !!state.doc.publish && (firstWaiting(story) !== null || !!afterOf(story)?.parts?.length))),
    // The checks on every day with something wrong, passed or held, and on a near miss (ADR 0008 §10). On a paused card,
    // in full under their ‖ when they held the day too (the pause row names them); else one line, "Checks passed: 6%
    // dropped", a tap from their sheet, so a check that passed reads as fine and not as a contradiction of the pause.
    g && (held || g.near || (story.severity === 'alert' && !calm)) && story.hero !== 'gate'
      ? checks && !checks.full
        ? h('button', { type: 'button', class: 'vf-checks-ok', id: 'vf-gate', onclick: () => gateSheet(story, card) }, h('span', {}, checks.line), h('span', { class: 'vf-chev' }, glyphEl('chev', 14)))
        : h('button', { type: 'button', class: 'vf-sec', id: 'vf-gate', ...(checks?.full ? { 'aria-label': 'Checks held: open' } : {}), onclick: () => gateSheet(story, card) }, h('p', { class: 'vf-sec-h' }, held ? glyphEl('held', 14) : '', checks?.full ? (checks.head ?? '') : held ? 'Checks held' : g.near ? 'Checks near the limit' : 'Checks passed'), gateVisual(g, false, gateScale(story)))
      : null,
    // What the day's outputs are: never "published" alone, which reads as good news; a tap names them.
    !paused && story.severity === 'alert' && !calm && outs.length ? h('button', { type: 'button', class: 'vf-reach', 'aria-label': `${reachLabel(story, outs.length, undefined, NEWS_NAMES.noun())}: ${outs.join(', ')}. Open the list.`, onclick: () => outputsDetail(story, outs) },
      svgNode(reachIcon({ n: outs.length, state: held ? 'held' : 'published' })), reachLabel(story, outs.length, undefined, NEWS_NAMES.noun()), h('span', { class: 'vf-chev' }, glyphEl('chev', 14))) : null,
    // The changes it explains and the ones the same day: one row, its first change named (ADR 0008 §6), opening into
    // the two groups, each headed by what it is.
    story.labels.folded ? foldedRow(story, card, profileOf(card) !== undefined) : null,
    // The weather last, as a tagged note: context, never a cause, and nothing to tap (ADR 0008 §11).
    story.labels.context ? h('p', { class: 'vf-wx', title: 'Snow, for context: not tested as a cause' }, h('span', { class: 'vf-tag' }, CONTEXT_TAG), h('span', {}, story.labels.context)) : null,
    !paused && anchor && primary ? actionsOf(anchor, card, primary, null, false, !!story.labels.settle) : null,
    brief ? brief.share : null);
}

/**
 * An episode chip's icon (round 3, #23): its days so far as blocks as wide as each was short, the viewed day filled,
 * a day not run here a grey dashed frame (viz episodeChip), so the row grows a block a day and its length is the total
 * the chip says; the calendar page where the days' trips aren't known.
 */
function chipIcon(story: Story, n: number): Element | string {
  const rows = story.episode || story.recovery ? episodeRows(story) : null;
  if (rows?.days.length) return svgNode(episodeChip({ days: rows.days.map((d) => ({ short: d.short, usual: d.usual, notRun: d.notRun, at: d.at })) }));
  return n ? svgNode(episodeIcon({ n, at: story.episode ? n - 1 : null })) : '';
}

/**
 * The part a story's head names, with its gloss (ontology.ts glossOf) and, when telling the source is among the day's
 * verbs, whom it reaches: the publisher of the source, not the part's own company. Null when the head names no part
 * with a meaning listed.
 */
function termOf(story: Story, anchor: Finding | null): { name: string; lines: string[] } | null {
  const sp = story.split;
  if (!sp || !story.head.includes(sp.name)) return null;
  const g = glossOf(propertyOf(state.doc.ontology, loadSource() ?? 'trips', sp.column), sp.value, sp.name);
  if (!g) return null;
  const tells = !!anchor && (story.primary === 'notify' || anchor.acts.includes('notify'));
  return { name: sp.name, lines: [g, ...(tells && anchor ? [`Tell the source reaches whoever publishes ${publisherOf(anchor)}.`] : [])] };
}

/**
 * The row under the day after an episode (ADR 0008 §6): under a flow that holds, what became of its days (ADR 0009
 * §12), the day on screen first once it published ("Mon 25 published · Thu–Sat still wait"), with Decide while a day
 * of it waits; the days not run here left out (its strip draws them not run). Otherwise the story's own line, from the
 * history's gate.
 */
function afterRow(story: Story): HTMLElement | null {
  const l = afterOf(story);
  if (!l) return null;
  const first = l.verb ? firstWaiting(story) : null;
  return h('div', { class: `vf-after${first ? ' waiting' : ''}` }, afterParts(l),
    first && l.verb ? h('button', { type: 'button', class: 'btn small primary vf-decide-after', 'aria-label': `Decide what readers get for ${dayMid(first)}`, onclick: () => decideDay(first) }, `${l.verb} ›`) : null);
}

/** The line under the day after an episode, each part's mark beside its words ("Mon 25 published · ‖ Thu–Sat still
 * wait"; "⚑ Thu as is · ✕ Fri–Sun unpublished"), so the line keys the strip's marks above it. */
function afterParts(l: { text: string; parts?: readonly AfterPart[] }): HTMLElement {
  if (!l.parts?.length) return h('span', {}, l.text);
  return h('span', { class: 'after-parts' }, ...l.parts.flatMap((p, i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true' }, ' · ') : '', h('span', { class: 'after-part' }, p.state !== 'published' ? glyphEl(PAUSE_MARK[p.state], 14) : '', p.text)]));
}

/** What the row under the day after an episode says, and its verb: decision.ts afterLine, or the story's own line. */
function afterOf(story: Story): { text: string; verb: string | null; parts?: AfterPart[] } | null {
  const rec = story.recovery;
  if (!rec || !state.doc.publish) return story.labels.after ? { text: story.labels.after, verb: null } : null;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const own = story.day === viewedDay() ? onScreen() : undefined;
  return afterLine(daysFrom(rec.from, rec.to).map((d) => ({ day: d, state: dayFate(d) })), { today: own ? { day: story.day, state: isPublished(own) ? 'published' : (pauseOf(own)?.state ?? null) } : null, may });
}

/** The first day of an episode a calm day comes after that still waits for a decision, if any. */
function firstWaiting(story: Story): string | null {
  const rec = story.recovery;
  return rec ? (daysFrom(rec.from, rec.to).find((d) => dayFate(d) === 'waiting') ?? null) : null;
}

/** Decide an earlier day from a later one: its sheet over its run in this visit, else the day run again first (its
 * news then has Decide), as a day held in an earlier visit is (ADR 0009 §10). */
// ------------------------------------------------------------------ the brief (ADR 0012 §1, §2)

const briefKey = (day: string) => `smaltfl:brief:${state.doc.id}:${day}`;

/** The facts of a day the brief is built from: the story, the pause, what readers get, the file, the options. */
function briefInputs(day: string): BriefIn {
  const story = storyFor(day);
  const r = heldRunOf(day) ?? [...state.runs].reverse().find((x) => dayOfRun(x) === day);
  const p = r ? pauseOf(r) : null;
  const readers = r ? readersDay(r) : null;
  const outs = state.doc.steps.filter((st) => st.dataset && visible(st.id)).map((st) => st.id);
  const waiting = new Set(r?.result.waiting ?? []);
  const outputs: BriefIn['outputs'] = outs.map((name) => {
    const shows = showsDay(name);
    const fate: BriefIn['outputs'][number]['fate'] = waiting.has(name) || (p?.state === 'waiting' && r && name in r.result.manifest.outputs && shows !== day) ? 'waits' : shows === day ? 'published' : shows && shows < day ? 'kept' : r ? 'published' : 'not built';
    return { name, fate };
  });
  const affected = new Set(outputs.filter((o) => o.fate !== 'published').map((o) => o.name));
  const objects = (state.doc.ontology?.objectTypes ?? []).filter((t) => affected.size ? affected.has(t.dataset) : outs.includes(t.dataset)).map((t) => t.name);
  const who = (policies()?.principals ?? []).filter((x) => !x.owner && outs.some((o) => access(o, x.id)?.open !== false)).map((x) => x.name);
  const load = loads.list.find((l) => l.day === day);
  const check = load ? integrity.checks.get(load.file)?.class ?? null : null;
  const options: BriefOption[] = [];
  if (r && p) {
    const later = readers && readers > day ? readers : null;
    const can = (o: DecisionOption) => checkDecision(policies(), state.viewer, o);
    options.push({ option: 'asis', label: 'Publish as is', line: 'readers get the day as it came, marked', off: later ? `${dayShort(later)} is published` : can('asis').allowed ? null : `${deciders()} decides` });
    options.push({ option: 'dont', label: readers && readers < day ? `Keep ${dayShort(readers)}` : 'Don’t publish', line: readers && readers < day ? `readers keep ${dayShort(readers)} until a corrected file arrives` : 'readers get nothing for the day', off: can('dont').allowed ? null : `${deciders()} decides` });
    const rem = remediesFor(r);
    for (const o of rem?.offers ?? []) if (o.option === 'fill' || o.option === 'complete') options.push({ option: o.option, label: o.label, line: o.option === 'fill' ? 'a good day near it fills what is missing, marked' : 'the part that arrived goes out alone, marked', off: o.off ?? (can(o.option).allowed ? null : `${deciders()} decides`) });
    const acc = acceptFor(r);
    if (acc) options.push({ option: 'accept', label: acc.offer.label, line: 'later days are judged at the new level', off: acc.offer.off ?? (can('accept').allowed ? null : `${deciders()} decides`) });
  }
  const picked: DecisionOption | null = p ? (p.state === 'waiting' ? null : p.state === 'accepted' ? 'accept' : p.state) : null;
  let edited: string | null = null;
  let prefer: DecisionOption | null = null;
  try {
    edited = localStorage.getItem(briefKey(day));
    const p = localStorage.getItem(`${briefKey(day)}:pick`);
    prefer = p && (DECIDE_OPTIONS as readonly string[]).includes(p) ? (p as DecisionOption) : null;
  } catch {
    // No storage: the generated words and the app's proposal.
  }
  return {
    day, flow: state.doc.name, noun: (n) => (n === 1 ? rowNoun(loadSource() ?? '').one : rowNoun(loadSource() ?? '').many), story,
    pause: p ? { state: p.state, readers, deciders: deciders(), may: mayDecide(state.viewer), remedy: p.remedy ? (p.remedy.donor ? `Filled from ${dayShort(p.remedy.donor)}` : p.remedy.part ? `${p.remedy.part} only` : null) : null, by: (() => { const e = heldElsewhere(r); return e ? `${e.origin}: ${e.said}` : null; })() } : null,
    outputs, objects, readers: who, file: load ? { name: load.file.replace(/^loads\//, ''), rows: load.rows, check } : null, options, picked, edited, prefer,
  };
}

/** The brief's sections for the input card's News (ADR 0012 §1, §2): the status and the sentence (editable), then,
 * after the card's own visual, the impact, the cause and the fix (the options, a tap proposing one), and the ways to
 * share it. The card's head and hero stay the cause card's. */
function briefSections(story: Story, card: string): { top: HTMLElement[]; body: HTMLElement[]; share: HTMLElement } {
  const day = story.day;
  const input = briefInputs(day);
  const b = briefOf(input);
  const again = () => openTab(card, 'news');
  const keep = (key: string, value: string | null) => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      // No storage: this once.
    }
  };
  const statusWord = b.status === 'no action' ? 'no action needed' : b.status;
  const status = h('p', { class: `brief-status ${b.status.replace(/\s+/g, '-')}` }, h('span', { class: 'pill' }, statusWord), h('span', { class: 'brief-day' }, dayMid(day)));
  const sit = h('p', { class: `brief-sit${b.edited ? ' edited' : ''}` }, b.situation);
  const area = h('textarea', { class: 'brief-edit', rows: '3', hidden: true, 'aria-label': 'The situation, in your words' });
  area.value = b.situation;
  const edit = h('button', { type: 'button', class: 'btn small', 'aria-label': 'Put the sentence in your words' }, 'Edit words');
  const save = h('button', { type: 'button', class: 'btn small primary', hidden: true }, 'Keep these words');
  const reset = h('button', { type: 'button', class: 'btn small', hidden: !b.edited }, 'The app’s words');
  edit.addEventListener('click', () => { area.hidden = false; save.hidden = false; edit.hidden = true; area.focus(); });
  save.addEventListener('click', () => { keep(briefKey(day), area.value.trim() && area.value.trim() !== b.generated ? area.value.trim() : null); again(); });
  reset.addEventListener('click', () => { keep(briefKey(day), null); again(); });
  const top = [status, h('div', { class: 'brief-sitwrap' }, sit, area, h('div', { class: 'nb-actions' }, edit, save, reset))];
  const body: HTMLElement[] = [];
  if (b.impact.length) body.push(block('Impact', h('ul', { class: 'brief-list' }, ...b.impact.map((x) => h('li', {}, x)))));
  if (b.cause.facts.length || b.cause.theories.length) body.push(block('Cause', h('ul', { class: 'brief-list' }, ...b.cause.facts.map((x) => h('li', {}, x)), ...b.cause.theories.map((x) => h('li', { class: 'theory' }, x)))));
  const waiting = input.pause?.state === 'waiting';
  if (b.fix.options.length) {
    const rows = b.fix.options.map((o) => {
      const mark = o.option === b.fix.picked ? 'decided' : o.option === b.fix.proposed ? 'proposed' : '';
      const canPropose = waiting && !o.off && !b.fix.picked;
      const el = h(canPropose ? 'button' : 'div', { class: `brief-opt${mark ? ` ${mark}` : ''}${o.off ? ' off' : ''}`, ...(canPropose ? { type: 'button', 'aria-pressed': String(mark === 'proposed'), 'aria-label': `Propose ${o.label}`, onclick: () => { keep(`${briefKey(day)}:pick`, o.option === b.fix.proposed && input.prefer ? null : o.option); again(); } } : {}) },
        h('span', { class: 'brief-opt-label' }, o.label, mark ? h('span', { class: 'chip' }, mark) : ''),
        h('span', { class: 'brief-opt-line' }, o.off ?? o.line ?? ''));
      return h('li', {}, el);
    });
    body.push(block(b.fix.picked ? 'Decided' : waiting ? 'Fix · tap to propose another' : 'Fix',
      h('ul', { class: 'brief-list opts', role: waiting && !b.fix.picked ? 'group' : undefined as unknown as string }, ...rows),
      b.fix.why ? h('p', { class: 'brief-why' }, b.fix.why) : null));
  }
  // Sharing: as text (SBAR), as an image (the first screen drawn), as a link to this day's brief.
  const copy = h('button', { type: 'button', class: 'btn small' }, 'Copy as text');
  copy.addEventListener('click', () => {
    const text = briefText(b, { flow: input.flow, pause: input.pause });
    const done = () => { copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy as text'), 1500); };
    navigator.clipboard?.writeText(text).then(done).catch(() => {
      const ta = h('textarea', { class: 'brief-edit', rows: '8', 'aria-label': 'The brief as text' });
      ta.value = text;
      copy.replaceWith(ta);
      ta.select();
    });
  });
  const image = h('button', { type: 'button', class: 'btn small' }, 'Copy as image');
  image.addEventListener('click', () => {
    image.textContent = 'Drawing…';
    void briefImage(b, story).then(async (blob) => {
      try {
        if (!('ClipboardItem' in window)) throw new Error('no clipboard images here');
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        image.textContent = 'Copied';
      } catch {
        // No clipboard for images (Safari, or a page without focus): the image itself, to save from.
        const url = URL.createObjectURL(blob);
        const img = h('img', { class: 'brief-img', alt: 'The brief as an image: press and hold to save it', src: url });
        image.replaceWith(img);
        return;
      }
      setTimeout(() => (image.textContent = 'Copy as image'), 1500);
    }).catch(() => { image.textContent = 'Couldn’t draw it'; });
  });
  const link = h('button', { type: 'button', class: 'btn small' }, 'Copy link');
  link.addEventListener('click', () => {
    const url = `${location.href.split('#')[0]}#brief-${day}`;
    navigator.clipboard?.writeText(url).then(() => { link.textContent = 'Copied'; setTimeout(() => (link.textContent = 'Copy link'), 1500); }).catch(() => { link.textContent = url; });
  });
  const share = h('div', { class: 'nb-actions brief-acts' }, copy, image, link);
  return { top, body, share };
}

/**
 * The brief as one image (ADR 0012 §1): the title, the status and the day, the sentence, the cause's own visual and
 * the impact lines, drawn as SVG with the page's styles inlined so the visual keeps its colours, then rasterised.
 */
async function briefImage(b: ReturnType<typeof briefOf>, story: Story): Promise<Blob> {
  const W = 720;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const wrap = (text: string, width: number): string[] => {
    const out: string[] = [];
    let line = '';
    for (const w of text.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > width) { out.push(line.trim()); line = w; } else line = `${line} ${w}`;
    }
    if (line.trim()) out.push(line.trim());
    return out;
  };
  const css = Array.from(document.styleSheets).flatMap((sheet) => { try { return Array.from(sheet.cssRules).map((r) => r.cssText); } catch { return []; } }).join('\n');
  const root = getComputedStyle(document.documentElement);
  const bg = root.getPropertyValue('--surface').trim() || '#fff';
  const ink = root.getPropertyValue('--ink').trim() || '#151922';
  const muted = root.getPropertyValue('--muted').trim() || '#5c6375';
  const hero = heroOf(story) ?? amountVisual(story);
  const heroSvg = hero ? new XMLSerializer().serializeToString(hero) : '';
  const heroH = hero ? 240 : 0;
  const sit = wrap(b.situation, 62);
  const impact = b.impact.flatMap((x) => wrap(`• ${x}`, 78));
  const facts = b.cause.facts.slice(0, 3).flatMap((x) => wrap(`• ${x}`, 78));
  const pick = b.fix.options.find((x) => x.option === (b.fix.picked ?? b.fix.proposed));
  let y = 44;
  const parts: string[] = [];
  const text = (t: string, size: number, weight: number, color: string, dy: number) => { y += dy; parts.push(`<text x="28" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(t)}</text>`); };
  text(b.title, 26, 650, ink, 0);
  text(`${b.status.toUpperCase()} · ${dayMid(b.day).toUpperCase()}`, 12, 500, muted, 26);
  y += 10;
  for (const l of sit) text(l, 18, 500, ink, 26);
  if (heroSvg) { y += 18; parts.push(`<svg x="28" y="${y}" width="${W - 56}" height="${heroH}" viewBox="0 0 334 ${Math.round(heroH * 334 / (W - 56))}" preserveAspectRatio="xMinYMin meet">${heroSvg}</svg>`); y += heroH; }
  if (impact.length) { text('IMPACT', 11, 600, muted, 30); for (const l of impact) text(l, 14, 400, ink, 22); }
  if (facts.length) { text('CAUSE', 11, 600, muted, 30); for (const l of facts) text(l, 14, 400, ink, 22); }
  if (pick) { text(b.fix.picked ? 'DECIDED' : 'PROPOSED', 11, 600, muted, 30); text(`${pick.label}${pick.line ? ` · ${pick.line}` : ''}`, 14, 600, ink, 22); }
  text(`smaltfl · ${state.doc.name}`, 11, 400, muted, 34);
  const H = y + 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${css}\nsvg text { font-family: ${root.getPropertyValue('--font') || 'system-ui, sans-serif'}; }</style><rect width="${W}" height="${H}" fill="${bg}"/>${parts.join('')}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('the image failed to draw')); i.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A link to a day's brief (`#brief-2023-09-21`): the day loaded and the input's News opened. */
async function openBriefFromHash(): Promise<void> {
  const m = /^#brief-(\d{4}-\d{2}-\d{2})$/.exec(location.hash);
  if (!m) return;
  const k = loads.list.findIndex((l) => l.day === m[1]);
  if (k < 0) return;
  if (loads.at !== k) await useLoad(k);
  const src = loadSource();
  if (!src) return;
  openTab(profiles().find((p) => p.of === src)?.id ?? src, 'news');
}

function decideDay(day: string): void {
  const r = heldRunOf(day);
  if (r) return decisionSheet(r, storyFor(day));
  const k = loads.list.findIndex((l) => l.day === day);
  if (k >= 0) void useLoad(k);
}

/** What became of a day under a flow that holds: paused or decided, published, or null when it wasn't run here and the
 * record has no pause of it. */
function dayFate(day: string): DayState | 'published' | null {
  return dayPause(day) ?? (state.runs.some((x) => dayOfRun(x) === day) ? 'published' : null);
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

/** What a reach row says without a story to say it from (a day the history doesn't have): only the pause is said. */
const NO_STORY = { severity: 'ok', split: null, amount: null, gate: null } as const;

/**
 * A held day's row (ADR 0009 §12): while it waits, what paused it ("Paused by trips, checks": only what the viewer may
 * see), what readers see meanwhile, and the outputs that wait, named, each a hatched box, the row a tap from their list;
 * its one verb, Decide, or for someone who may not decide, who does in its place; once decided, the receipt in its
 * place, the day's mark before it (who decided and when, or the standing decision it came under), what readers see,
 * and the outputs. Its words are core/decision.ts pauseLines', counted in the card's budget (pausedGlance).
 */
function pauseRow(r: RunRecord, story: Story | null, top = false): { reach: HTMLElement; verb: HTMLElement | null } {
  const now = pauseOf(r)!;
  const open = (x: string) => isOwner() || visible(x);
  // What waits, or once decided what waited when the day was held.
  const names = inFlowOrder((now.state === 'waiting' ? r.result.waiting : (now.pause?.waiting ?? r.result.waiting)).filter(open));
  const d = now.pause?.decision ?? null;
  const under = d?.about.under !== undefined ? ledger?.entries[d.about.under] : undefined;
  const underDay = (under?.about as { day?: string } | undefined)?.day;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const kept = readersAsOf(r);
  const l = pauseLines({ state: now.state, names, by: pauseReasons(r.result.holds, open), readers: kept.day, past: kept.past, who: d ? personName(d.by) : null, at: d && !underDay ? decidedAt(d.at) : null, under: underDay ? dayShort(underDay).split(' ')[0]! : null, may, deciders: deciders(), standing: standsOn(d), remedy: now.remedy, withdrawn: now.withdrawn, readersMark: kept.past ? null : readersMarkOf(r), top });
  const box = isOut(now.state) ? 'pub' : 'held';
  const reach = h('div', { class: 'vf-pause' },
    h('button', { type: 'button', class: `vf-reach vf-paused ${now.state}`, 'aria-label': `${l.reach}${l.see ? `; ${l.see}` : ''}${names.length ? `; ${names.join(', ')}` : ''}. Open the list.`, onclick: () => waitingDetail(r, l.reach, !may && now.state === 'waiting' ? () => decisionSheet(r, story) : null) },
      h('span', { class: 'vf-mark' }, glyphEl(PAUSE_MARK[now.state], 16)),
      h('span', { class: 'vf-paused-t' },
        h('b', {}, ...reachMarked(l.reach, now.state === 'waiting' ? story : null)),
        l.see ? h('span', { class: 'vf-see-line' }, l.see) : null,
        names.length ? h('span', { class: 'vf-outs-named', 'aria-hidden': 'true' }, ...names.map((o) => h('span', { class: `o-chip ${box}` }, h('i', {}, box === 'pub' ? glyphEl('ack', 11) : ''), o))) : null),
      h('span', { class: 'vf-chev' }, glyphEl('chev', 14))));
  // A remedy readers have, or one withdrawn (amendment 1 S12, Q-61): the day's versions, and changing the decision.
  const day = dayOfRun(r);
  const remedy = now.state === 'fill' || now.state === 'complete' || !!now.withdrawn;
  const links = remedy && day ? h('div', { class: 'vf-rc-acts' },
    h('button', { type: 'button', class: 'linkish vf-versions', onclick: () => versionsSheet(day) }, 'Versions ›'),
    may ? h('button', { type: 'button', class: 'linkish vf-change', onclick: () => decisionSheet(r, story) }, 'Change decision ›') : '') : null;
  // A day not published can still be published: Change decision in the row, as the canvas's receipt has it (round 3,
  // #28), never only behind ⋯.
  const change = !remedy && l.change && may ? h('div', { class: 'vf-rc-acts' }, h('button', { type: 'button', class: 'linkish vf-change', onclick: () => decisionSheet(r, story) }, `${l.change} ›`)) : null;
  const verb = l.verb
    ? h('button', { type: 'button', class: 'vf-primary vf-decide', 'aria-label': `Decide what readers get${dayOfRun(r) ? ` for ${dayMid(dayOfRun(r)!)}` : ''}`, onclick: () => decisionSheet(r, story) }, l.verb)
    : l.waits ? h('span', { class: 'vf-waits' }, l.waits) : (links ?? change);
  return { reach, verb };
}

/**
 * What paused a day, with the mark each reason carries where the card draws it (round 3, #16): the source by the day's
 * mark ("! trips"), its checks by ‖ ("‖ checks", headed "Checks held" under the health row), so the two problems read
 * apart at the top of the card. The words are pauseLines' own; only marks are added.
 */
function reachMarked(reach: string, story: Story | null): (Node | string)[] {
  const m = /^Paused by (.+)$/.exec(reach);
  if (!m) return [reach];
  const sev = story ? sevMark(story.severity) : null;
  const out: (Node | string)[] = ['Paused by '];
  m[1]!.split(', ').forEach((r, i) => {
    if (i) out.push(', ');
    const mark = /(^| )checks$/.test(r) ? glyphEl('held', 13) : sev === 'alert' || sev === 'warn' ? glyphEl(sev, 13) : null;
    out.push(mark ? h('span', { class: 'vf-why' }, mark, r) : r);
  });
  return out;
}

/**
 * The verbs under a paused card's row: Decide (or who decides) and the story's verbs behind ⋯, "OK this day" left out
 * while the day waits. Once decided there is no verb: the ⋯ sits at the end of the receipt row, labelled, never alone
 * in an empty row, its menu under the row.
 */
function pausedActs(paused: { reach: HTMLElement; verb: HTMLElement | null }, anchor: Finding | undefined, card: string, waiting: boolean): HTMLElement | null {
  if (!anchor) return paused.verb ? h('div', { class: 'vf-acts' }, paused.verb) : null;
  const acts = actionsOf(anchor, card, null, paused.verb, waiting);
  if (paused.verb) return acts;
  const more = acts.querySelector<HTMLElement>('.vf-more');
  if (more) {
    more.append(h('span', { class: 'vf-more-l' }, 'More'));
    paused.reach.append(more);
  }
  acts.classList.add('bare');
  return acts.querySelector('.vf-menu, .f-log') ? acts : null;
}

/** Steps in the flow's own order (zone_hour, borough_hour, weather_effect), as the canvas lays them out. */
function inFlowOrder(ids: readonly string[]): string[] {
  const order = state.doc.steps.map((x) => x.id);
  return [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Who may decide a held day, by name: the owners, and whoever a decide rule names. */
function deciders(): string {
  const p = policies();
  const names = p ? [...p.principals.filter((x) => x.owner).map((x) => x.name), ...p.rules.flatMap((x) => (x.kind === 'action' && x.action === 'smaltfl:decide' ? x.for.map((id) => p.groups?.find((g) => g.id === id)?.name ?? personName(id)) : []))] : [];
  return [...new Set(names)].join(' or ') || 'the owner';
}

/** A time of day, "09:40". */
const clock = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
/** When a decision was taken, by the clock it was taken at, with its date (round 3, #28): beside a day of the data a
 * bare "18:47" read as that day's. "today 18:47", "Nov 8 18:47". */
const decidedAt = (at: string): string => {
  const d = new Date(at);
  return d.toDateString() === new Date().toDateString() ? `today ${clock(at)}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock(at)}`;
};

/** The outputs a held day keeps back, each waiting with its staged rows and a tap to its card; for someone who may not
 * decide, a tap on to the decision sheet, read only: what readers would get, and who decides. */
function waitingDetail(r: RunRecord, label: string, options: (() => void) | null = null): void {
  const now = pauseOf(r);
  const day = dayOfRun(r);
  const shown = readersDay(r);
  const see = options ? h('button', { type: 'button', class: 'vf-see', onclick: options }, 'What readers get', glyphEl('chev', 13)) : null;
  // The day's other outputs, while it waits: the held run made the versions readers have already (the same keys), so
  // they are up to date (Thu Sep 21, 2023: zone_list, districts and weather_hourly).
  const others = now?.state === 'waiting' ? inFlowOrder(Object.keys(r.result.manifest.outputs).filter((o) => !r.result.waiting.includes(o) && (isOwner() || visible(o)))) : [];
  const upToDate = others.length ? h('div', { class: 'vf-block' }, h('p', { class: 'vf-bh' }, `${others.length} other${others.length === 1 ? '' : 's'} up to date`), h('ul', { class: 'vf-outlist' }, ...others.map((o) => h('li', {}, h('button', { type: 'button', onclick: () => (document.querySelector('.vf-detail-wrap')?.remove(), select(o)) },
    h('span', { class: 'o-box', 'aria-hidden': 'true' }, glyphEl('ack', 14)), h('span', { class: 'o-name' }, o), h('span', { class: 'o-rows' }, 'as published'), glyphEl('chev', 13)))))) : null;
  openDetail(label, 'ok', [oneLine(day && !isOut(now?.state) ? stagedBar(day, shown, keptThen(day), now?.state === 'waiting', readersMarkOf(r)) : null), waitingList(r), upToDate, see]);
}

/** Whether the viewer reads every row of a dataset (columns aside): only then is its whole count theirs to see. */
const rowsOpen = (id: string): boolean => {
  if (isOwner()) return true;
  const a = access(id);
  return !!a && a.open && !a.filters.length;
};

/** The outputs a held day keeps back that the viewer may see, each with what became of it, its rows where every row is
 * theirs to read, and a tap to its card. */
function waitingList(r: RunRecord): HTMLElement {
  const now = pauseOf(r);
  return h('ul', { class: 'vf-outlist' }, ...inFlowOrder(r.result.waiting.filter((x) => isOwner() || visible(x))).map((o) => h('li', {}, h('button', { type: 'button', onclick: () => (document.querySelector('.vf-detail-wrap')?.remove(), select(o)) },
    h('span', { class: `o-box${isOut(now?.state) ? '' : ' held'}`, 'aria-hidden': 'true' }, isOut(now?.state) ? glyphEl('ack', 14) : ''),
    h('span', { class: 'o-name' }, o),
    h('span', { class: 'o-rows' }, `${now?.state === 'asis' ? 'published' : now?.state === 'fill' ? 'published filled' : now?.state === 'complete' ? 'published, part only' : now?.state === 'dont' ? 'not published' : 'paused'}${rowsOpen(o) ? ` · ${fmtInt(r.result.manifest.outputs[o]?.rows ?? 0)} rows` : ''}`),
    glyphEl('chev', 13)))));
}

/**
 * What readers get, read only, for someone who may neither decide nor read the trips (ADR 0009 §12): the day readers see
 * meanwhile, the waiting outputs open to them, and who decides; nothing drawn from the trips, which are closed to them.
 */
function readersSheet(r: RunRecord): void {
  const day = dayOfRun(r);
  // Whom it waits on, at the top, with Ask; the day readers have is said once, by the hatched bar under it (with its
  // age, and as it stood then once a later day has published), never twice in a row.
  const waits: HTMLElement = h('div', { class: 'vf-waits-on' }, h('p', {}, glyphEl('held', 14), h('b', {}, `Waits on ${deciders()}`)), h('button', { type: 'button', class: 'linkish vf-ask', 'aria-label': `Ask ${deciders()} to decide: a note to send or copy`, onclick: () => askPanel(r, waits) }, 'Ask ›'));
  const bar = day ? stagedBar(day, readersDay(r), keptThen(day), pauseOf(r)?.state === 'waiting', readersMarkOf(r)) : null;
  openDetail(`${day ? `${dayMid(day)} · w` : 'W'}hat readers get`, 'ok', [waits, bar ? h('p', { class: 'rows-from staged', role: 'note' }, bar) : null, waitingList(r)]);
  document.querySelector('.vf-detail')?.classList.add('readonly');
  document.querySelector('.vf-detail .vf-dhead h3')?.prepend(glyphEl('held', 16));
}

/** The checks on a source: the step of kind expectations that reads it, directly or through its fill step (C7). */
const checksOf = (src: string): StepDef | undefined => state.doc.steps.find((x) => x.kind === 'expectations' && x.inputs.some((i) => i === src || sourceOf(state.doc, i) === src));

/** The steps that read a dataset, and for a source the steps that read it through its fill step (C7): where its rows go,
 * and what names them. */
const readersThrough = (id: string): string[] => state.doc.steps.filter((st) => st.inputs.some((i) => i === id || (st.kind !== 'fill' && sourceOf(state.doc, i) === id && i !== id))).map((st) => st.id);

/** What the trips were on a run: its trips source's rows. */
const tripsOf = (r: RunRecord | undefined) => r?.result.manifest.nodes.find((n) => n.origin === loadSource())?.rows;

/** The trips of a run that reach its outputs: what its checks on the trips kept (the trips themselves, with none). */
function tripsKept(r: RunRecord | undefined): number | undefined {
  const src = loadSource();
  const check = src ? checksOf(src) : undefined;
  const kept = check ? r?.result.manifest.nodes.find((n) => n.origin === check.id) : undefined;
  return kept?.expectations ? kept.expectations.rows - kept.expectations.dropped : tripsOf(r);
}

/** Whether a decision (or the one it came under) closes the days after it too: don't publish until a day publishes. */
const standsOn = (d: Decided | null | undefined): boolean => !!d && (d.about.option === 'dont' || d.about.option === 'fill' || d.about.option === 'complete') && (d.about.scope === 'untilPass' || d.about.under !== undefined);

/** Re-draw the sheet behind a detail once the detail closes, when what it shows changed meanwhile. */
let sheetStale = false;

/** Whether a card's News says the paused day at its top (round 3, #12): the watched source's, or its profile's, on a day
 * of it that waits. Its card's row then says only what paused it and what waits. */
const pauseOnTop = (card: string): boolean => {
  const own = onScreen();
  return !!own && dataOf(card) === loadSource() && pauseOf(own)?.state === 'waiting';
};

/**
 * The paused day said at the top of the source's News, under the date (round 3, #12), as the canvas's day line says it:
 * the pause and the day readers see, its age when stale ("Paused · readers see Mon 18 · 3 days old"), why that day (what
 * became of each day between: "Tue–Wed not run"), and Decide; for someone who may not decide, whom it waits on.
 */
function pauseBanner(): HTMLElement | null {
  const own = onScreen();
  const now = own ? pauseOf(own) : null;
  const day = own ? dayOfRun(own) : undefined;
  if (!own || !day || now?.state !== 'waiting') return null;
  const kept = readersAsOf(own);
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const l = dayPausedLine({ state: 'waiting', readers: kept.day, past: kept.past, may, standing: false, day, readersMark: kept.past ? null : readersMarkOf(own) });
  const between = kept.day && !kept.past && kept.day < day ? daysFrom(dayPlus(kept.day, 1), dayPlus(day, -1)) : [];
  const why = betweenLine(between.map((d) => ({ day: d, state: dayFate(d) })));
  return h('div', { class: 'pause-top', role: 'status' },
    glyphEl('held', 15),
    h('span', { class: 'pt-t' }, h('b', {}, ...unbroken(l.text)), why ? h('span', { class: 'pt-why' }, why) : null),
    l.verb ? h('button', { type: 'button', class: 'btn small primary vf-decide', 'aria-label': `Decide what readers get for ${dayMid(day)}`, onclick: () => decisionSheet(own, storyFor(day)) }, `${l.verb} ›`)
      : h('span', { class: 'pt-waits' }, `Waits on ${deciders()}`));
}

/** The checks that held a run too, with their share and limit: what publishing it as is overrides. From the day's story
 * where the viewer reads it, else from the run's own counts and the flow's limit. */
function heldChecks(r: RunRecord, story: Story | null): { share: number; limit: number | null } | null {
  if (!r.result.holds.some((x) => x.by === 'checks')) return null;
  if (story?.gate?.held) return story.gate;
  const src = loadSource();
  const check = src ? checksOf(src) : undefined;
  const e = check ? r.result.manifest.nodes.find((n) => n.origin === check.id)?.expectations : undefined;
  const limit = check && 'maxDropped' in check && typeof check.maxDropped === 'number' ? check.maxDropped : null;
  return e && e.rows ? { share: e.dropped / e.rows, limit } : null;
}

/** A note asking whoever decides to decide a held day, to send or copy (no server here to send it through). */
function askPanel(r: RunRecord, el: HTMLElement): void {
  const day = dayOfRun(r);
  const who = deciders();
  const subject = `Please decide ${day ? dayMid(day) : 'a held run'} in ${state.doc.name}`;
  // What readers see now, unless a later day has published since: then the day is said alone, naming no later day.
  const kept = readersAsOf(r);
  const body = `${day ? dayMid(day) : 'A run'} is paused, not published${kept.past ? ',' : `: ${readersSee(kept.day, null)}`} until ${who} decides what readers get. Open ${state.doc.name} in smaltfl to decide it.`;
  const share = async () => {
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
      const shared = typeof nav.share === 'function';
      if (shared) await nav.share!({ title: subject, text: body });
      else await nav.clipboard.writeText(`${subject}\n\n${body}`);
      setStatus(`A note asking ${who} to decide, ${shared ? 'shared' : 'copied'}.`);
    } catch {
      return;
    }
  };
  el.querySelector('.f-form')?.remove();
  const panel = h('div', { class: 'f-form tell' },
    h('pre', { class: 'code' }, `${subject}\n\n${body}`),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => void share() }, 'share' in navigator ? 'Send it…' : 'Copy it'),
      h('a', { class: 'btn small quiet', href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` }, 'Email it'),
      h('button', { type: 'button', class: 'btn small quiet', onclick: () => panel.remove() }, 'Cancel')));
  el.append(panel);
}

/**
 * The decision sheet (ADR 0009 §12): each option a row drawn as what readers would get, all on one scale, the cause
 * picking the drawing as it picks the hero (core/decision.ts decisionDrawing, viz.ts decisionRow): its mark (publish, or
 * the hatched swatch of the day readers keep), at most four words and what the drawing shows with its unit, the trips
 * past the checks under it, and what publishing overrides when the checks held the day too. Picking an option shows the
 * reasons that fit it under "Why?", the scope under Don't publish only, and a button that says what is missing until it
 * can go, then the result it names. Someone who may not decide sees the rows read only, what readers see until whoever
 * decides does, and Ask. Once decided the sheet collapses to a receipt. Its words are core/decision.ts sheetText's, 45
 * at most at once.
 */
function decisionSheet(shown0: RunRecord, story: Story | null): void {
  // On a day readers have a fill of, the views show its derived run: the decision is the held run's (amendment 1 S9).
  const r = shown0.derived?.from ?? shown0;
  const day = dayOfRun(r) ?? null;
  const first = pauseOf(r);
  // Readers have this day's fill (or its part alone): Keep withdraws it, back to the day they had before it (Q-61).
  const withdraws = first?.state === 'fill' || first?.state === 'complete' ? first.state : null;
  const shown = readersDay(r);
  const later = shown && day && shown > day ? shown : null;
  const can = Object.fromEntries(DECIDE_OPTIONS.map((o) => [o, checkDecision(policies(), state.viewer, o)])) as Record<DecisionOption, ReturnType<typeof checkDecision>>;
  const anyone = can.asis.allowed || can.dont.allowed || can.fill.allowed || can.complete.allowed;
  // Someone who may not decide, and doesn't read every row of the source, gets what readers get with nothing of the
  // source, whatever path led here (round 3, #6: the sheet draws and counts the source's rows).
  const src = loadSource();
  if (!anyone && src && !rowsOpen(src)) return readersSheet(r);
  const n = r.result.waiting.length || (first?.pause?.waiting.length ?? 0);
  const pick: SheetPick = { option: null, scope: 'day', reason: null, donor: 0, preparing: false };
  const pause = first?.pause ?? null;
  const opened = pause ? ledger?.entries[pause.opened]?.at : undefined;
  const rows = tripsOf(r) ?? 0;
  // Each row's number is what its drawing shows, the trips as they arrived (as the card and the Runs view count them);
  // the trips that reach the outputs, past the checks, are said under the day's own once it is picked.
  const back = withdraws ? keptBefore(r) : null;
  // A refill readers have went out over an earlier fill of the same day: withdrawing it would bring that fill back, so
  // Keep is off until the plugin's withdrawals of a chain of fills are recorded as one (left for later).
  if (withdraws && back?.day === day) can.dont = { allowed: false, reason: 'a refill is replaced by another fill, not withdrawn' };
  // With a later day current, a withdrawal moves no name back: readers keep that day (S5), and the Keep row says so.
  const readers = withdraws && !later ? (back?.day === day ? null : back) : readersOn(r, shown);
  const rem = remediesFor(r);
  const accept = acceptFor(r);
  const donors = rem ? rem.picks.map((p) => ({ day: p.day, counts: rem.counts.get(p.day)! })) : [];
  const draw = decisionDrawing(history, story, day ?? '', readers?.day ?? null, { day: rows, readers: readers?.rows ?? null }, rem ? { missing: rem.missing, donors: rem.picks.map((p) => p.day) } : null, readers?.repair ? { missing: readers.repair.missing, donor: readers.repair.donor?.day ?? null } : null, keptLacks(readers));
  // The staged run of the remedy picked, once made (S4): whether it passes its checks, and the hash of what goes out.
  let staged: SheetIn['staged'] = null;
  let stagedRun: RunRecord | null = null;
  const textOf = (): SheetText => sheetText({
    noun: rowNoun(loadSource() ?? ''),
    // How long it has waited, only while it waits (a day not published, opened to change its decision, isn't waiting).
    day, waited: opened && first?.state === 'waiting' ? (Date.now() - Date.parse(opened)) / 60000 : null, since: opened && new Date(opened).toDateString() === new Date().toDateString() ? clock(opened) : null, otherBuild: !!pause?.otherBuild, outputs: n, rows, reach: tripsKept(r) ?? null, readers, later, checks: heldChecks(r, story),
    usual: story?.amount ? { low: story.amount.low, high: story.amount.high } : null,
    part: draw.part, missing: draw.cause === 'hours' ? (story?.hoursLabels?.missing ?? null) : null, cut: draw.cut?.[1] ?? null, ticks: draw.ticks.map(([, x]) => x),
    unjudged: r.result.holds.some((x) => x.by === 'unjudged'), hash: r.result.hash, may: anyone, deciders: deciders(), head: story?.head ?? null,
    offers: [...(rem?.offers ?? []).filter((o) => o.option === 'fill' || o.option === 'complete'), ...(accept && !withdraws ? [accept.offer] : [])], donors, partOnly: rem?.part ?? null, staged, withdraws,
  });
  let t = textOf();
  // Each option a row drawn as what readers would get, on one scale: Publish as is the day's own rows, Keep another
  // day's hatched, a fill the day's own with the donor's stippled inside, the part alone with what it leaves out absent.
  const drawingOf = (o: SheetText['options'][number]) => {
    // Once a later day is out, Publish as is can't be picked: a lock in its mark's place (round 3, #19).
    if (o.option === 'asis') return { mark: (o.off ? 'lock' : 'publish') as VizMark, rows: draw.asis, usual: draw.usual, short: draw.short, other: false, missing: t.missing, cut: draw.cut, part: draw.part, filled: null };
    if (o.option === 'fill') {
      const d = donorPicked(o, pick);
      const f = d ? draw.fills.find((x) => x.day === d.day) : undefined;
      // The hour the trips fell is marked once, on the day's own row: the stipple shows where the fill begins.
      return { mark: 'fill' as VizMark, rows: f?.rows ?? draw.asis, usual: null, short: draw.short, other: false, missing: null, cut: null, part: null, filled: f?.filled ?? null };
    }
    if (o.option === 'complete') return { mark: 'part' as VizMark, rows: draw.complete?.rows ?? draw.asis, usual: draw.complete?.usual ?? null, short: draw.complete?.short ?? null, other: false, missing: null, cut: null, part: null, filled: null };
    // Accept the new level (amendment 1 S6, X6): the day's own rows as they came, with nothing drawn absent, so they read
    // as what is usual now; marked by the step. The part is named once, on Publish as is's row.
    if (o.option === 'accept') return { mark: 'level' as VizMark, rows: draw.asis, usual: null, short: null, other: false, missing: null, cut: null, part: null, filled: null };
    // The day readers keep, hatched; drawn with what it lacked when it went out as is (round 3, #3).
    return { mark: (readers ? 'keep' : 'closed') as VizMark, rows: draw.dont, usual: draw.dontUsual ?? null, short: draw.dontUsual ? (draw.dontShort ?? null) : draw.short, other: true, lacks: !!draw.dontUsual, missing: null, cut: null, part: null, filled: draw.dontFilled ?? null };
  };
  const rowOf = (o: SheetText['options'][number], last: boolean, still = false) => {
    const off = o.off || !can[o.option].allowed;
    const g = drawingOf(o);
    const d = donorPicked(o, pick);
    // Before a pick every row says its number; after one, only the row picked (amendment 1 S12).
    // Accept's number is the day as it came, Publish as is's, said once it is picked (decision.ts sheetShown).
    const own = o.option === 'accept' && !o.off ? (t.options.find((x) => x.option === 'asis')?.number ?? '') : (d?.number ?? o.number);
    const number = pick.option === o.option || still ? own : !pick.option ? (d?.number ?? o.number) : '';
    const svg = svgNode(decisionRow({ mark: g.mark, label: d?.label ?? o.label, number, cause: draw.cause, rows: g.rows, usual: g.usual, short: g.short, other: g.other, lacks: 'lacks' in g ? g.lacks : false, scale: draw.scale, part: g.part, ticks: last ? draw.ticks.filter(([, x]) => t.ticks.includes(x)) : [], missing: g.missing, cut: g.cut, filled: g.filled, off: off && !still, aria: d?.aria ?? o.aria }));
    const failing = d ? d.fails : !!o.fails;
    // Before a pick, what a row says under it: what publishing overrides (to someone who may publish), else its note
    // (the rows that arrived; a kept day of another weekday). Once picked, its one line.
    const line = !pick.option ? ((anyone ? o.warn : null) ?? o.note ?? null) : pick.option === o.option ? (o.option === 'asis' ? (o.warnPicked ?? o.sub) : d ? (d.fails ? (d.failed ?? failLine(null)) : d.sub) : o.sub) : null;
    const warns = (o.option === 'asis' && !!o.warn && anyone && !pick.option) || (!!line && failing && pick.option === o.option);
    const more = line ? h('span', { class: 'vf-opt-more' }, warns ? h('span', { class: 'vf-opt-warn' }, glyphEl('alert', 13), line) : h('span', { class: 'vf-opt-sub' }, line)) : null;
    if (still) return h('div', { class: 'vf-option drawn still', 'data-option': o.option }, svg);
    const row = h('button', { type: 'button', role: 'radio', class: 'vf-option drawn', 'data-option': o.option, 'aria-checked': String(pick.option === o.option), 'aria-label': d?.aria ?? o.aria, disabled: off, onclick: () => choose(o.option) }, svg, more);
    // A fill's other good days, as chips under it once it is picked: a tap swaps the donor and redraws the row.
    if (o.option !== 'fill' || pick.option !== 'fill' || !o.donors || o.donors.length < 2 || !anyone) return row;
    return h('div', { class: 'vf-fillrow' }, row, h('div', { class: 'vf-donors', role: 'group', 'aria-label': 'Fill from another day' }, ...o.donors.filter((x) => x !== d).map((x) =>
      h('button', { type: 'button', class: 'vf-donor', 'data-day': x.day, 'aria-pressed': 'false', 'aria-label': x.aria, onclick: () => ((pick.donor = o.donors!.indexOf(x)), void prepare()) }, x.chip))));
  };
  const rowsEl = h('div', { class: `vf-options${anyone ? '' : ' ro'}`, role: 'radiogroup', 'aria-label': 'What readers get', ...(anyone ? {} : { 'aria-readonly': 'true' }) });
  // One switch for a decision that may stand for the days after it, until one passes (amendment 1 S12).
  const scopes = h('button', { type: 'button', role: 'switch', class: 'vf-switch', 'aria-checked': 'false', hidden: true, onclick: () => ((pick.scope = pick.scope === 'untilPass' ? 'day' : 'untilPass'), sync()) }, h('span', { class: 'vf-switch-k', 'aria-hidden': 'true' }), t.switch ?? '');
  const why = h('div', { class: 'vf-why', hidden: true });
  const go = h('button', { type: 'button', class: 'vf-primary vf-go', disabled: true, title: `What goes out: manifest ${t.hash}`, onclick: () => void submit() }, t.go.rest);
  const foot = anyone ? h('div', { class: 'vf-go-row' }, go) : null;
  // The remedy picked, staged in the engine (S4): its derived run gives what goes out, and whether it passes its checks.
  const repairPicked = (): Repair | null => {
    if (!rem || (pick.option !== 'fill' && pick.option !== 'complete')) return null;
    const o = t.options.find((x) => x.option === pick.option);
    const d = o ? donorPicked(o, pick) : null;
    const p = d ? rem.picks.find((x) => x.day === d.day) ?? null : null;
    return pick.option === 'fill' ? (p ? repairOf(rem, p) : null) : repairOf(rem, null);
  };
  const prepare = async () => {
    const repair = repairPicked();
    if (!repair) return sync();
    pick.preparing = true;
    stagedRun = null;
    sync();
    const run = await stage(r, repair);
    // Picked again meanwhile: the latest pick's run is the one that counts.
    if (stagedKey(r, repair) !== (repairPicked() && stagedKey(r, repairPicked()!))) return;
    pick.preparing = false;
    stagedRun = run;
    staged = run ? { option: repair.kind, donor: repair.donor?.day ?? null, fails: derivedFails(run.result), why: derivedWhy(run.result, heldChecks(run, null), repair.donor?.day ?? null), reach: tripsKept(run) ?? null } : null;
    t = textOf();
    sync();
  };
  const choose = (option: DecisionOption) => {
    pick.option = option;
    if (option === 'asis' || option === 'accept') pick.scope = 'day';
    if (pick.reason && !t.chips[option].includes(pick.reason)) pick.reason = null;
    if (option === 'fill' || option === 'complete') void prepare();
    else (pick.preparing = false), sync();
  };
  const sync = () => {
    rowsEl.dataset.picked = pick.option ?? '';
    rowsEl.replaceChildren(...t.options.map((o, i) => rowOf(o, i === t.options.length - 1)));
    // The reasons that fit the option picked: needed to publish as is, a choice not to publish, none for a remedy.
    const o = pick.option;
    if (o && (t.why[o] || t.chips[o].length)) {
      why.replaceChildren(t.why[o] ? h('p', { class: 'vf-why-h', id: 'vf-why-h' }, t.why[o]) : '', h('div', { class: 'vf-reasons', role: 'radiogroup', 'aria-label': t.why[o] || 'Why' }, ...t.chips[o].map((x) =>
        h('button', { type: 'button', role: 'radio', class: 'vf-reason', 'aria-checked': String(x === pick.reason), onclick: () => ((pick.reason = pick.reason === x ? null : x), sync()) }, x))));
      why.hidden = false;
    } else why.hidden = true;
    // Publish as is covers one day; an Accept stands by its level (Q-57b): neither has the switch.
    scopes.hidden = !t.switch || !o || o === 'asis' || o === 'accept' || (o === 'dont' && !!withdraws);
    scopes.setAttribute('aria-checked', String(pick.scope === 'untilPass'));
    go.disabled = !o || ((o === 'asis' || o === 'accept') && !pick.reason) || !!pick.preparing || pickFails(t, pick) || ((o === 'fill' || o === 'complete') && !stagedRun);
    go.textContent = goShown(t, pick);
    go.title = `What goes out: manifest ${stagedRun && (o === 'fill' || o === 'complete') ? `${stagedRun.result.hash.slice(0, 4)} ${stagedRun.result.hash.slice(4, 8)}` : t.hash}`;
    if (status) status.hidden = !!o;
  };
  const status = anyone ? oneLine(t.status) : null;
  const ask = !anyone ? h('div', { class: 'vf-waits-on' }, h('p', {}, glyphEl('held', 14), h('b', {}, t.waitsOn ?? '')), h('button', { type: 'button', class: 'linkish vf-ask', 'aria-label': `Ask ${deciders()} to decide: a note to send or copy`, onclick: () => askPanel(r, ask!) }, t.ask ?? '')) : null;
  // The day's mark as it stands: ‖ while it waits, ✕ when a decision not to publish is being changed, ◧ or ◐ a remedy.
  const headMark = glyphEl(PAUSE_MARK[first?.state ?? 'waiting'], 16);
  const submit = async () => {
    const option = pick.option;
    if (!option) return;
    go.disabled = true;
    const derived = option === 'fill' || option === 'complete' ? stagedRun : null;
    if ((option === 'fill' || option === 'complete') && !derived) return sync();
    const entry = await decide(r, option, pick.scope, pick.reason, { ...(derived ? { derived } : {}), ...(option === 'dont' && withdraws ? { withdraw: true } : {}) });
    if (!entry) return sync();
    const now = pauseOf(r);
    const st = now?.state ?? 'waiting';
    // The sheet collapses to a receipt: what readers now see, drawn as the option picked was, then what was released,
    // who and when, the record's entry, Versions for a remedy, and Change decision where it can still change.
    const had = readersAsOf(r);
    const out = isOut(st);
    const l = receiptLines({ state: st, day, readers: out ? day : had.day, past: !out && had.past, released: out ? n : 0, who: personName(entry.by.as), at: decidedAt(entry.at), seq: entry.seq, under: null, standing: (entry.about as { scope?: unknown }).scope === 'untilPass', remedy: now?.remedy ? { ...now.remedy, ...remedyCounts(now.pause) } : null, withdrawn: now?.withdrawn ?? null, level: (entry.about as { level?: { from?: string } }).level?.from ?? null, reason: entry.reason ?? null });
    const kept = t.options.find((o) => o.option === option);
    const sheetEl = document.querySelector('.vf-detail');
    for (const el of [status, rowsEl, why, scopes, foot]) el?.remove();
    sheetEl?.append(
      kept ? h('div', { class: 'vf-options done' }, rowOf(kept, true, true)) : '',
      receiptBox(l, st, entry.seq, `${(derived ?? r).result.hash.slice(0, 4)} ${(derived ?? r).result.hash.slice(4, 8)}`, l.change && anyone ? () => decisionSheet(r, story) : null, day, l.versions && day ? () => versionsSheet(day) : null));
    headMark.replaceWith(glyphEl(PAUSE_MARK[st], 16));
  };
  openDetail(t.title, 'ok', [status, ask, rowsEl, why, scopes, foot]);
  document.querySelector('.vf-detail')?.classList.toggle('readonly', !anyone);
  document.querySelector('.vf-detail .vf-dhead h3')?.prepend(headMark);
  sync();
}

/** The day readers see in place of a held run's, with its trips as they arrived: null when nothing is published. */
function readersOn(r: RunRecord, shown: string | null): Kept | null {
  const theirs = shown ? state.names.get(r.result.waiting[0] ?? Object.keys(r.result.manifest.outputs)[0] ?? '') : undefined;
  return shown && theirs ? keptOf(theirs, shown) : null;
}

/** A day readers keep, as they have it (S12): a filled day's rows as filled, marked ◧ (◐ the part alone), with the
 * repair it was made by, so the Keep row draws the filled day with its stipple; else its rows as they arrived. */
interface Kept {
  day: string;
  rows: number;
  /** Its rows past its checks: what readers have of it. */
  reach?: number | null;
  /** Filled (◧), the part alone (◐), or published as is (⚑, round 3 #3). */
  mark?: KeptMark;
  repair?: Repair;
}
function keptOf(theirs: RunRecord, day: string): Kept | null {
  const d = theirs.derived;
  // A filled day's rows: what its checks were given, past the fill (the fill step itself is a view, uncounted).
  const src = loadSource();
  const check = src ? checksOf(src) : undefined;
  const given = check ? theirs.result.manifest.nodes.find((n) => n.origin === check.id)?.expectations?.rows : undefined;
  const rows = d ? (filledRows(theirs.result, d.repair.step) ?? given ?? tripsOf(d.from)) : tripsOf(theirs);
  // A day published as is went out with what it lacked: marked ⚑ beside its date, and drawn with it (round 3, #3).
  const asis = !d && pauseOf(theirs)?.state === 'asis';
  // What readers have of it: its rows past its checks (round 3, #4), the sheet's number for it.
  const reach = tripsKept(theirs) ?? null;
  return rows === undefined ? null : { day, rows, reach, ...(d ? { mark: d.repair.kind, repair: d.repair } : asis ? { mark: 'asis' as const } : {}) };
}

/** What a day readers keep lacked when it went out as is (round 3, #3): its guess, and its usual hours where it fell at
 * an hour, from the flow's verdict on it; null for a day kept whole. */
function keptLacks(k: Kept | null): KeptLacks | null {
  if (!k || k.mark !== 'asis') return null;
  const s = flowStoryOf(k.day);
  if (!s?.amount || s.state !== 'wrong') return null;
  return { expected: s.amount.expected, hours: s.hero === 'hours' && s.hours ? { usual: s.hours.usual, from: s.hours.from, to: s.hours.to } : null };
}

/** On a day readers have the fill of, the day they had before it (Q-61): what a withdrawal sends them back to. */
function keptBefore(r: RunRecord): Kept | null {
  const d = (filledOf(r) ?? releasedFillOf(r))?.derived?.release;
  const was = d ? shownBefore.get(d.release) : undefined;
  const name = was ? [...was.keys()][0] : undefined;
  const back = name ? was!.get(name) : undefined;
  const day = back ? dayOfRun(back) : undefined;
  return back && day ? keptOf(back, day) : null;
}

/** A held run's receipt once decided, on the canvas: as the decision sheet collapses to it. */
function receiptOf(r: RunRecord, may: boolean): HTMLElement | null {
  const now = pauseOf(r);
  if (!now || now.state === 'waiting') return null;
  const d = now.pause?.decision ?? null;
  const under = d?.about.under !== undefined ? ledger?.entries[d.about.under] : undefined;
  const underDay = (under?.about as { day?: string } | undefined)?.day;
  const day = dayOfRun(r) ?? null;
  const kept = readersAsOf(r);
  const out = isOut(now.state);
  // A fill or the part alone readers have is cited by the decision whose release applied, never a later one refused.
  const cites = (now.state === 'fill' || now.state === 'complete') && now.pause?.repaired?.decision !== undefined ? now.pause.repaired.decision : (d?.seq ?? null);
  const l = receiptLines({ state: now.state, day, readers: out ? day : kept.day, past: !out && kept.past, released: out ? (now.pause?.waiting ?? r.result.waiting).length : 0, who: d ? personName(d.by) : null, at: d && !underDay ? decidedAt(d.at) : null, seq: cites, under: underDay ? dayShort(underDay).split(' ')[0]! : null, standing: standsOn(d), remedy: now.remedy ? { ...now.remedy, ...remedyCounts(now.pause) } : null, withdrawn: now.withdrawn, level: d?.about.level?.from ?? null, reason: d?.reason ?? null });
  const box = receiptBox(l, now.state, d?.seq ?? null, null, l.change && may ? () => decisionSheet(r, day ? storyFor(day) : null) : null, day, l.versions && day ? () => versionsSheet(day) : null);
  box.classList.add('loads-receipt');
  // Under the loads strip, its links are the canvas's: the sheet's and the card's keep their own names.
  for (const [a, b] of [['vf-versions', 'vf-versions-c'], ['vf-change', 'vf-change-c']] as const) box.querySelector(`.${a}`)?.classList.replace(a, b);
  return box;
}

/** A decision's receipt (ADR 0009 §12), in the sheet and on the canvas: the day's mark and what readers now see, then
 * what was released, who and when and the record's entry (a tap to it in the Runs view), and Change decision where a
 * decision can still change. */
function receiptBox(l: { head: string; sub: string; change: string | null; versions?: true; note?: string }, st: DayState, seq: number | null, hash: string | null, change: (() => void) | null, day: string | null, versions: (() => void) | null = null): HTMLElement {
  return h('div', { class: `vf-receipt-box ${st}` },
    h('p', { class: 'vf-rc-head' }, glyphEl(PAUSE_MARK[st], 16), h('b', {}, l.head)),
    h('p', { class: 'vf-rc-sub' }, seq !== null ? l.sub.replace(/ · record #\d+$/, '') : l.sub, hash ? h('code', { class: 'vf-hash', title: 'The manifest of what went out' }, ` · manifest ${hash}`) : ''),
    h('div', { class: 'vf-rc-acts' },
      seq !== null ? h('button', { type: 'button', class: 'linkish', onclick: () => ((ribbonPick = day), document.querySelector('.vf-detail-wrap')?.remove(), (location.hash = '#runs')) }, `Record #${seq} ✓`) : '',
      versions ? h('button', { type: 'button', class: 'linkish vf-versions', onclick: versions }, 'Versions ›') : '',
      l.change && change ? h('button', { type: 'button', class: 'linkish vf-change', onclick: change }, `${l.change} ›`) : '',
      l.note ? h('span', { class: 'vf-rc-note' }, glyphEl('lock', 12), l.note) : ''));
}

/**
 * The outputs a day's load reaches, named (ADR 0008 §10): each ticked when published from it, hatched when not, with
 * its rows, a tap from its own card; one line says what they were built from, or what they keep.
 */
function outputsDetail(story: Story, outs: string[]): void {
  const held = !!story.gate?.held;
  const l = lacked(story, NEWS_NAMES.noun());
  const keep = held && story.day === viewedDay() ? stoppedWords({ refused: false, origin: story.gate!.step, shown: keptDay(), viewed: story.day }).tail : null;
  const list = h('ul', { class: 'vf-outlist' }, ...outs.map((o) => {
    const n = held ? undefined : nodeOf(o);
    return h('li', {}, h('button', { type: 'button', onclick: () => (document.querySelector('.vf-detail-wrap')?.remove(), select(o)) },
      h('span', { class: `o-box${held ? ' held' : ''}`, 'aria-hidden': 'true' }, held ? '' : glyphEl('ack', 14)),
      h('span', { class: 'o-name' }, o),
      h('span', { class: 'o-rows' }, held ? 'not published' : n?.rows !== undefined ? `${fmtInt(n.rows)} rows` : 'published'),
      glyphEl('chev', 13)));
  }));
  openDetail(reachLabel(story, outs.length, undefined, NEWS_NAMES.noun()), story.severity, [oneLine(held ? (keep ? keep.replace(/^./, (c) => c.toUpperCase()) : null) : (l?.long ?? null)), list]);
}

/**
 * The health row (ADR 0008 §6): its heading, and five cells, each the worst of its kinds, ↳ where the day's cause groups
 * them, no mark where nothing is out of the ordinary; the same row on every day. Each cell opens what it measured: its
 * check in words and visuals, and every finding of its kinds, the ones the cause absorbed too.
 */
function healthRow(story: Story, card: string, paused = false): HTMLElement {
  // The day's file, matched to the data's list: its cell carries the seal, as the Integrity tab does (ADR 0006 §9).
  const sealed = fileMatched(story.day);
  return h('div', { class: 'vf-healthwrap' },
    // On a paused card the row goes without its head: the pause row and the checks are named on either side of it.
    paused ? null : h('p', { class: 'vf-health-h', 'aria-hidden': 'true' }, story.labels.health),
    h('nav', { class: 'vf-health', 'aria-label': `${HEALTH_HEAD}: five measures of the day’s ${NEWS_NAMES.noun()}` }, ...story.health.map((c) => {
      const m: VizMark | null = c.explained ? 'explained' : c.severity === 'alert' ? 'alert' : c.severity === 'warn' ? 'warn' : c.severity === 'note' ? 'note' : c.cell === 'file' && sealed ? 'seal' : c.unjudged ? 'unlearned' : null;
      const said = c.explained ? `${c.follows} grouped under the day’s cause${c.sameDay ? `, ${c.sameDay} more came the same day` : ''}` : c.severity === 'alert' ? 'something’s wrong' : c.severity === 'warn' ? 'unusual' : c.severity === 'note' ? 'a note' : c.cell === 'file' && sealed ? 'matches the source’s list' : m === 'unlearned' ? `${c.unjudged} not judged` : 'normal';
      // A cell that shows a finding's mark still says what it couldn't judge, as the health line counts it.
      const also = m !== 'unlearned' && c.unjudged ? `, ${c.unjudged} not judged` : '';
      // A cell whose numbers had no range carries ◌ with their count (ADR 0010 §1), never a blank that reads as normal.
      return h('button', { type: 'button', class: `vf-cell ${c.explained ? 'explained' : c.severity ?? (m === 'unlearned' ? 'unlearned' : 'ok')}${m === 'seal' ? ' sealed' : ''}`, 'aria-label': `${CELL_NAMES[c.cell]}: ${said}${also}. Open.`, onclick: () => healthDetail(story, c.cell, card) }, m === 'unlearned' && c.cell !== 'amount' ? h('span', { class: 'vf-ring-n', 'aria-hidden': 'true' }, glyphEl('unlearned', 20), h('span', {}, c.unjudged > 99 ? '99+' : String(c.unjudged))) : m ? glyphEl(m, 14) : '', h('span', { 'aria-hidden': 'true' }, CELL_NAMES[c.cell]));
    })));
}

/** Whether a day's file was checked against the data's list and matched it (ADR 0006): its bytes are the ones listed. */
function fileMatched(day: string): boolean {
  const load = loads.list.find((l) => l.day === day);
  const c = load ? integrity.checks.get(load.file) : undefined;
  return !!c && fileSeverity(c.class) === 'ok';
}

/** What a health cell measures, in a line under its title, with the watched source's noun. */
const cellWhat = (cell: Cell): string => ({
  file: 'The day’s file, against the data’s published list',
  amount: `The day’s ${NEWS_NAMES.noun()}, against a day like it`,
  hours: `${RowsWord()} each hour, against a usual day`,
  values: `Each coded value’s share of the ${NEWS_NAMES.noun()}`,
  shape: 'Each measure’s spread, and the times of day',
})[cell];

/** A health cell, opened: what it measures, drawn, and each finding of its kinds a tap from its own detail. */
function healthDetail(story: Story, cell: Cell, card: string): void {
  const c = story.health.find((x) => x.cell === cell)!;
  const day = story.day;
  const k = history ? history.file.days.indexOf(day) : -1;
  const kinds = CELL_KINDS[cell];
  const rank = (f: Told) => (f.tier === 'cause' || f.tier === 'standalone' ? 0 : 1);
  const mine = story.findings.filter((f) => kinds.includes(f.kind) && f.was !== 'ok').sort((a, b) => rank(a) - rank(b) || SEV_RANK[a.was] - SEV_RANK[b.was] || b.score - a.score);
  const body: (Node | null)[] = [h('p', { class: 'vf-sub' }, cellWhat(cell))];
  if (cell === 'file') {
    const load = loads.list.find((l) => l.day === day);
    const checked = !!(load && integrity.checks.get(load.file));
    body.push(svgNode(chain({ nodes: ['list', 'file', 'load'], broken: 99, aria: checked ? 'The day’s file hashes to what the data’s list publishes, and the load was read from it.' : 'The day’s file was read; no list was there to check it against.' })));
    if (k >= 0) body.push(oneLine(`${rowsSaid(history!.file.rows[k]!)} in the day’s file${checked ? ', which matches the source’s list' : ''}.`));
  }
  if (cell === 'amount') {
    body.push(amountVisual(story));
    const days = stripOf({ of: 'trips' }, day, 28, story.severity);
    if (days.length) body.push(svgNode(dayStrip({ days, labels: stripLabels(days), key: STRIP_KEY, more: { same: sameDays(day) }, unit: '/day', aria: `${RowsWord()} day by day for four weeks to ${dayLabel(day)}, each against its own usual range.` })));
  }
  if (cell === 'hours' && history && k >= 0) {
    const r = rangesOf({ of: 'trips' })?.at(day);
    const raw = r ? usualHours(history, k, r.expected) : null;
    const got = history.file.hours?.[k];
    if (r && raw && got) {
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      const usual = story.hours?.usual ?? raw.map((x) => (x / sum) * r.expected);
      const wd = WEEKDAY_NAMES[dateOf(day).getUTCDay()]!;
      // A day told by its hours draws the card's own picture here (one usual, the same parts and labels).
      body.push(svgNode(story.hero === 'hours' && story.hours && story.hoursLabels ? hourBars({ ...hourProps(story), aria: hourAria(story) })
        : hourBars({ got, usual, ...(story.hours ? { cut: story.hours.from, to: story.hours.to, cutLabel: clockText(story.hours.from * 60) } : {}), ghostLabel: `usual ${wd}`, aria: `${RowsWord()} by hour on ${dayLabel(day)}, against a usual ${wd}${story.hours ? `: short from ${clockText(story.hours.from * 60)}` : ''}.` })));
    }
  }
  // Numbers that had no usual range that day are said so, never as usual (ADR 0010 §1), beside what was found too: the
  // health line counts them whatever else the cell shows.
  const unjudged = story.health.find((c) => c.cell === cell)?.unjudged ?? 0;
  const none = cell === 'values' ? `${unjudged} ${unjudged === 1 ? 'value' : 'values'} had no usual range today: not judged` : cell === 'shape' ? `${unjudged} ${unjudged === 1 ? 'spread' : 'spreads'} had no usual range today: not judged` : null;
  if (mine.length) {
    body.push(h('div', { class: 'vf-list' }, ...shownRows(mine, card, 6, true)));
    if (unjudged && none) body.push(oneLine(`${none}.`));
  }
  // Nothing found: said in words only where no visual above says it.
  else body.push(oneLine(unjudged && none ? `${none}; the others as usual.` : cell === 'file' || cell === 'amount' ? null : { hours: `${RowsWord()} every hour.`, values: 'Values as usual.', shape: 'Spreads and times as usual.' }[cell]));
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

/** The checks' own findings (their rows dropped, their rules) that say something. */
const checksFindings = (findings: readonly Finding[]) => findings.filter((f) => (f.kind === 'dropped' || f.kind === 'rule') && f.severity !== 'ok');

/** The checks' own severity: something wrong when held, else the worst of their own findings. */
function checksWorst(g: Gate, findings: readonly Finding[]): Severity {
  return g.held ? 'alert' : checksFindings(findings).reduce<Severity>((w, f) => (SEV_RANK[f.severity] < SEV_RANK[w] ? f.severity : w), 'ok');
}

/** The checks' news: held or passed, the gate, and the rules. */
function checksNews(card: string, story: Story): HTMLElement[] {
  const g = story.gate;
  if (!g) return [];
  const findings = checksFindings(story.findings);
  const worst = checksWorst(g, story.findings);
  const m = sevMark(worst);
  // Said as its bar says it (8.6%, not 9% over a bar labelled 8.6%), never equal to the limit it passed or missed.
  const head = `${g.held ? 'Held' : 'Passed'}: ${gateLabels(g).said} dropped`;
  const anchor = findings[0] ? { ...findings[0], title: head } : null;
  // Where these checks paused the day, their News says so as the trips' card does (ADR 0009 §12): the pause row, what
  // readers see and the outputs that wait, with Decide (or who decides) as the one verb and the story's verbs behind ⋯;
  // once decided, the receipt.
  const own = !state.failed && story.day === viewedDay() ? onScreen() : undefined;
  const paused = own && pauseOf(own) && own.result.holds.some((x) => x.by === 'checks' && x.origin === g.step) ? pauseRow(own, story) : null;
  return [h('section', { class: `vf-card ${g.held ? 'wrong' : worst === 'warn' ? 'unusual' : 'calm'}${paused ? ' paused' : ''}`, role: 'status', ...(anchor ? { id: `finding-${anchor.key}` } : {}) },
    // ‖ while the day waits; once it is decided (✕ or ⚑ on its tab), the held checks take something wrong's mark.
    h('div', { class: 'vf-headrow' }, h('h3', { class: 'vf-head' }, m && worst !== 'note' ? glyphEl(g.held ? (paused && pauseOf(own)?.state !== 'waiting' ? 'alert' : 'held') : m, 18) : '', head), h('button', { type: 'button', class: 'vf-info', 'aria-label': 'How the rows dropped are judged', onclick: () => judgedDetail(story, 'dropped') }, glyphEl('info', 16))),
    h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${head}: open`, onclick: () => openDetail(head, worst, checksDetail(g, story, card, worst)) }, gateVisual(g, true, gateScale(story))),
    paused ? paused.reach : null,
    paused ? pausedActs(paused, anchor ?? undefined, card, pauseOf(own)?.state === 'waiting') : null,
    rulesVisual(g, story.findings, story.day),
    !paused && anchor ? actionsOf(anchor, card, g.held ? 'notify' : anchor.acts[0] ?? null) : null)];
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
  // An output that waits on a held day says so first, with Decide; its staged bar sits over the panel (showsRunRows).
  const paused = outputPause(dataOf(card));
  if (paused) box.append(paused);
  const story = storyDay && (kind === 'trips' || kind === 'checks') && !state.failed?.file ? storyFor(storyDay) : null;
  if (story) {
    // The checks' rows on screen may be another run's on a held day: their table is on the Dropped tab, labelled.
    box.append(...(kind === 'checks' ? checksNews(card, story) : storyNews(card, story)));
    return box;
  }
  // Another watched load's own verdict (ADR 0013 §5): what the engine judged this load by, against its own history,
  // when it held the day; the judged dataset's view of the day is the status line's and its card's.
  const mine = !state.failed && dataOf(card) !== loadSource() ? onScreen()?.result.holds.find((x) => x.origin === dataOf(card) && (x.by === 'story' || x.by === 'unjudged')) : undefined;
  if (mine) {
    const now = viewedDay();
    box.append(h('div', { class: 'verdict alert stopped' },
      h('p', { class: 'v-day' }, now ? dayLabel(now) : ''),
      h('h3', { class: 'v-head' }, glyphEl(mine.by === 'unjudged' ? 'held' : 'alert', 16), mine.by === 'unjudged' ? 'Held: not judged' : mine.said.replace(/\s*\((usually|never)[^)]*\)$/, '')),
      h('p', { class: 'v-line' }, mine.by === 'unjudged' ? mine.said : `${mine.said}: this load against its own history. The day is paused by it.`)));
  }
  // A day paused with no story to tell it (the history doesn't have the day, or there is none): what held it, what
  // waits, and Decide (ADR 0009 §3: a source not judged is held, and a person decides).
  const own = !state.failed && dataOf(card) === loadSource() ? onScreen() : undefined;
  if (own && pauseOf(own)) {
    const row = pauseRow(own, null);
    const now = viewedDay();
    box.append(h('div', { class: 'verdict alert stopped' },
      h('p', { class: 'v-day' }, now ? dayLabel(now) : ''),
      h('h3', { class: 'v-head' }, glyphEl(PAUSE_MARK[pauseOf(own)!.state], 16), own.result.holds.every((x) => x.by === 'unjudged') ? 'Held: not judged' : 'Held'),
      h('p', { class: 'v-line' }, own.result.holds.map((x) => heldLine(x, !!history)).join('; '))),
      row.reach, row.verb ? h('div', { class: 'vf-acts' }, row.verb) : '');
  }
  // The run on this load stopped: a gate held (a check dropping more than it may), so nothing after it was built from
  // this load, and the rows below are the last day that passed, under their date bar (ADR 0008 §10).
  if (state.failed) {
    const now = viewedDay();
    const refused = state.failed.file;
    const origin = state.failed.origin;
    // The node it stopped at says so first, and every node after it.
    const after = !origin || origin === dataOf(card) || downstreamOf(origin).includes(dataOf(card));
    const g = storyDay ? storyFor(storyDay)?.gate : null;
    const said = g?.held && g.step === origin ? gateLabels(g) : null;
    if (after) box.append(h('div', { class: 'verdict alert stopped' },
      h('p', { class: 'v-day' }, now ? dayLabel(now) : ''),
      h('h3', { class: 'v-head' }, glyphEl(origin && sourceIds().has(origin) ? 'alert' : 'held', 16), refused ? 'Not built: the file was refused' : origin && steps().get(origin)?.kind === 'expectations' ? `Not built: held at ${origin}` : origin && sourceIds().has(origin) ? (origin === dataOf(card) ? failedHead() : `Not built: ${failedHead()}`) : 'The run stopped'),
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
  const built = !kind && !!src && downstreamOf(src).includes(dataOf(card));
  const fromStory = built && rowsDay ? storyFor(rowsDay) : null;
  // Whatever held the day, its story or its checks (ADR 0009 §12); not over a step a stopped run didn't build, which
  // says so above.
  const short = fromStory && !(state.failed && rowsDay === viewedDay()) ? lacked(fromStory, NEWS_NAMES.noun()) : null;
  // To someone who can't read the day's story (the trips closed to them, or the column it is about), a held load is
  // said from the flow's own verdict, naming no source, value or figure.
  const ownRun = built && !state.failed ? onScreen() : undefined;
  const heldSaid = !short && ownRun && pauseOf(ownRun) ? heldLoadLine(ownRun.result.holds) : null;
  if (short) box.append(h('div', { class: 'verdict alert' },
    h('p', { class: 'v-day' }, dayLabel(rowsDay!)),
    h('h3', { class: 'v-head' }, glyphEl('alert', 16), short.long),
    h('p', { class: 'v-line' }, `Its load: ${fromStory!.head}`),
    h('button', { type: 'button', class: 'btn small', onclick: () => select(src!) }, `Open ${src} ›`)));
  else if (heldSaid) box.append(h('div', { class: 'verdict alert' },
    h('p', { class: 'v-day' }, dayLabel(rowsDay!)),
    h('h3', { class: 'v-head' }, glyphEl('alert', 16), heldSaid)));
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
    // A day the history follows is judged as a day; a table on its own, as what it holds now. Rows built from a load
    // with something wrong, or staged on a held day, are never vouched for in green (ADR 0009 §12): what they say of
    // themselves is neutral ink under what their load lacked.
    const fromHeld = !kind && (!!short || !!heldSaid || stagedOutput(id));
    const normal = kind ? 'A normal day' : fromHeld ? 'Nothing odd in its own rows' : 'Nothing out of the ordinary';
    const head = alerts ? 'Something’s wrong' : warns ? `${warns === 1 ? 'One thing' : `${warns} things`} to look at` : notes ? `${normal}, with ${notes === 1 ? 'a note' : `${notes} notes`}` : normal;
    const calm = findings.find((f) => f.severity === 'ok');
    const sev = alerts ? 'alert' : warns ? 'warn' : fromHeld ? 'staged' : notes ? 'note' : 'ok';
    const idle = effect && !effect.measured && !alerts && !warns;
    box.append(h('div', { class: `verdict ${sev}` },
      h('p', { class: 'v-day' }, kind && day ? `${dayLabel(day)}${loads.list[loads.at]?.note ? ` · ${loads.list[loads.at]!.note}` : ''}` : kind ? '' : stagedOutput(id) ? (outputState(id) === 'dont' ? 'From its rows, not published' : 'From its rows, paused') : 'From its rows on this run'),
      h('h3', { class: 'v-head' }, idle ? `No effect to measure ${spanOf(id) === 'today' ? 'today' : 'here'}` : head),
      h('p', { class: 'v-line' }, idle ? `Its ${plural(effect.total, 'row')} ${effect.total === 1 ? 'is' : 'are all'} ${effect.baseline}: nothing to compare with.` : alerts || warns ? `${listed([alerts ? plural(alerts, 'alert') : '', warns ? plural(warns, 'unusual thing') : '', notes ? plural(notes, 'note') : ''].filter(Boolean))}. The first: ${top.title}.` : (calm ?? (telling.includes(top) ? null : top))?.detail ?? '')));
    if (effect?.measured) box.append(effectVisual(id, effect));
    // The weather's day drawn by the hour, as the trips' hours are (ADR 0008 §12), under its verdict.
    if (kind === 'weather' && day) {
      const wx = await weatherDay(id, day, who);
      if (wx) box.append(h('div', { class: 'part' }, svgNode(wx), h('div', { class: 'vf-key', 'aria-hidden': 'true' }, h('span', {}, h('i', { class: 'k-rain' }), 'rain'), h('span', {}, h('i', { class: 'k-snow' }), 'snow'), h('span', {}, h('i', { class: 'k-temp' }), 'temperature'))));
    }
    if (kind === 'trips' && day) box.append(healthStrip(card, day, findings));
    for (const f of telling) box.append(findingCard(f, card));
  }
  // What the step did with the rows: in, out, and how (an input's arrival is its File cell, not a panel).
  const panel = sourceIds().has(id) ? null : await changePanel(id, who);
  if (panel) box.append(h('div', { class: 'part did' }, panel.box));
  if (!top && !panel) box.append(h('p', { class: 'foot' }, 'Run the flow to see what this step does.'));
  return box;
}

/**
 * A day's weather by the hour, as the person may read it: its districts' temperature and rain averaged each hour
 * (emit.ts emitDayHours), each hour the one its stamp closes where the flow's own step reads it so (weather_hourly's
 * "-1 hour"). Null when the run has no such rows or the columns aren't open to them.
 */
async function weatherDay(id: string, day: string, who: string): Promise<string | null> {
  const run = latest();
  if (!run || !state.engine) return null;
  const insp = await inspect(run);
  const i = insp.index.get(id);
  const sql = i === undefined ? null : readIn(insp, i, who);
  if (i === undefined || !sql) return null;
  const cols = new Set(viewIn(insp, i, who).columns.map((c) => c.toLowerCase()));
  if (!['time', 'temperature_2m', 'precipitation', 'snowfall'].every((c) => cols.has(c))) return null;
  // The shift the flow's own step gives the stamp, if one reads this source by the hour.
  const exprs: string[] = [];
  for (const st of state.doc.steps) {
    if (!st.inputs?.includes(id) || !('columns' in st) || !Array.isArray(st.columns)) continue;
    for (const c of st.columns as unknown[]) if (c && typeof c === 'object' && 'expr' in c) exprs.push(String((c as { expr: unknown }).expr));
  }
  // Read in the engine's terms by the emitter, the only module that knows them (emit.ts stampShift).
  const shift = stampShift(exprs, 'time');
  try {
    const r = await state.engine.query(emitDayHours(sql, 'time', day, ['temperature_2m', 'precipitation', 'snowfall'], shift));
    if (r.rows.length < 12) return null;
    const by = new Map(r.rows.map((x) => [Number(x[0]), x]));
    const col = (k: number) => Array.from({ length: 24 }, (_, hr) => { const v = by.get(hr)?.[k]; return typeof v === 'number' ? v : v == null ? null : Number(v); });
    const [temp, precip, snow] = [col(1), col(2), col(3)];
    const t = temp.filter((x): x is number => x !== null);
    const rain = precip.reduce<number>((a, b) => a + (b ?? 0), 0);
    return weatherHours({ temp, precip, snow, aria: `The weather by the hour on ${dayLabel(day)}, its districts averaged: ${t.length ? `from ${degrees(Math.min(...t))} to ${degrees(Math.max(...t))}` : 'no temperatures'}, ${rain.toFixed(1)} mm of rain and snow in all.` });
  } catch {
    return null;
  }
}

/** The trips' health at a glance: arrived, amount, complete, values, shape; each a tap from what tells it. */
function healthStrip(card: string, day: string, findings: Finding[]): HTMLElement {
  const k = history!.file.days.indexOf(day);
  const worst = (kinds: Finding['kind'][]) => findings.filter((f) => kinds.includes(f.kind) && f.severity !== 'ok').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0];
  const rows: [string, Finding | undefined, string][] = [
    ['Arrived', findings.find((f) => f.kind === 'integrity'), k >= 0 ? `${rowsSaid(history!.file.rows[k]!)} in the day’s file${integrity.checks.get(loads.list[loads.at]?.file ?? '') ? ', which matches the source’s list' : ''}` : 'no file'],
    ['Amount', worst(['volume']), 'a normal amount for the day'],
    ['Complete', worst(['hours']), `${NEWS_NAMES.noun()} every hour`],
    ['Values', worst(['gone', 'share', 'new', 'pair', 'combo', 'unlike', 'missing']), 'values as usual'],
    ['Shape', worst(['shape', 'schema']), 'as usual'],
  ];
  return h('div', { class: 'health', role: 'list' }, ...rows.map(([name, f, calm]) =>
    h('button', { type: 'button', role: 'listitem', class: `hl ${f?.severity ?? 'ok'}`, disabled: !f, onclick: () => f && document.getElementById(`finding-${f.key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
      h('span', { class: 'hl-dot', 'aria-hidden': 'true' }), h('span', { class: 'hl-name' }, name), h('span', { class: 'hl-what' }, f ? f.title : calm))));
}

/**
 * Whether a finding follows from the day's cause (round 3, #21): on a day held, or one whose story has something wrong,
 * any finding but the cause's own is an effect of it ("Card tip rate empty on 99.6% of rows" when only Flex Fare
 * arrived, "Passengers 0: none"), so it gets no primary verb of its own: the cause's card and Decide are what to act on,
 * and its own verbs wait behind ⋯. A file refused is a cause in itself.
 */
function followsCause(f: Finding): boolean {
  const day = newsDay();
  const story = day && historyOpen() ? storyFor(day) : null;
  return followsFrom(f, { held: dayWaits(), story, anchor: story ? (anchorOf(story)?.key ?? null) : null });
}
/** Whether the day on screen waits for a decision: its follow-on findings' verbs leave out "Mark as expected" then. */
const dayWaits = (): boolean => { const own = onScreen(); return !!own && !state.failed && pauseOf(own)?.state === 'waiting'; };

/** A finding as a card (ADR 0008): its mark and title, its visual (or, with none, its one sentence), one verb; a tap
 * opens its detail. One that follows from the day's cause has its verbs behind ⋯ only (round 3, #21). */
function findingCard(f: Finding, card: string): HTMLElement {
  const m = sevMark(f.severity);
  const vis = findingVisual(f);
  const after = followsCause(f);
  return h('article', { class: `vf-story ${f.severity}`, id: `finding-${f.key}` },
    h('button', { type: 'button', class: 'vf-story-h', onclick: () => findingDetail(f, card) }, m ? glyphEl(m, 15) : '', h('span', {}, f.title), h('span', { class: 'vf-chev' }, glyphEl('chev', 13))),
    vis ? h('button', { type: 'button', class: 'vf-hero', 'aria-label': `${f.title}: open`, onclick: () => findingDetail(f, card) }, vis) : (chipsOf(f) ?? oneLine(f.detail)),
    f.acts.length ? (after ? moreOnly(actionsOf(f, card, null, null, dayWaits(), true)) : actionsOf(f, card, f.acts[0] ?? null)) : null);
}
/** Verbs behind ⋯ alone, the ⋯ labelled "More", so a lone square doesn't read as a stray control. */
function moreOnly(acts: HTMLElement): HTMLElement {
  const more = acts.querySelector<HTMLElement>('.vf-more');
  if (more) (more.classList.add('labelled'), more.append(h('span', { class: 'vf-more-l' }, 'More')));
  return acts;
}

/** Where a normal range comes from, in a line: the band under a finding's chart. */
function rangeFrom(r: NormalRange): string {
  if (r.special) return `The band: ${r.special} last year, moved by how this year has compared with last year lately${r.scale === 'count' ? ' and to this year’s weekday' : ''}, give or take how far that guess has missed on holidays.`;
  const by = r.guesses.map((g) => `${g.by === 'weeks' ? (patternNow() === 'weekly' ? 'the same weekday over the six weeks before' : patternNow() === 'monthly' ? 'the same day of the months before' : 'the days before') : 'its day last year'} (${Math.round(g.weight * 100)}%)`);
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
  // The day's own rows staged (ADR 0009): its bar at the top of the tab, as on Data and Columns, over everything under it.
  // Another day's rows keep their bar under the day's own gate (ADR 0008 §10).
  const bar = rowsFromBar();
  const stagedTop = !!bar?.classList.contains('staged');
  if (stagedTop) box.append(bar!);
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
    box.append(h('div', { class: `part did${bar && !stagedTop ? ' stale' : ''}` }, stagedTop ? null : bar, panel.box));
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
    h('h3', { class: 'v-head' }, q.odd.length ? `${plural(q.odd.length, 'row')} stand${q.odd.length === 1 ? 's' : ''} out` : 'No row stands out'),
    h('p', { class: 'v-line' }, `${q.sample.length < q.rows ? `Sampled ${fmtInt(q.sample.length)} of ${plural(q.rows, 'row')}` : `All ${plural(q.rows, 'row')}`}, scored on ${listed(q.measures.map((c) => meanings(c)?.title ?? c))} together.`)));
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
      // Named by the number each draws ("Extras $2.50 share"), a finding's chip carrying its mark and its title.
      ...top.map((c) => {
        const f = c.label.startsWith('In the news: ') ? dayNews(day).find((x) => x.metric && metricKey(x.metric) === c.key) : undefined;
        const mk = f ? sevMark(f.severity) : null;
        return h('button', { type: 'button', class: 'vf-pick-chip', 'aria-pressed': String(c.key === choice.key), ...(f ? { title: f.title, 'aria-label': `${metricName(c.m)}: ${f.title}` } : {}), onclick: () => set(c.key) }, mk ? glyphEl(mk, 12) : null, metricName(c.m));
      }),
      sel));
  }
  if (ranges) {
    // Eight weeks ending on this day, and nothing after it: no band, guess or value of a day that hasn't come (ADR 0008
    // §10).
    const days = daysFrom(dayPlus(day, -55), day);
    const seen = days;
    const fmt = metricFormat(choice.m);
    const focus = historyFocus.get(card) && seen.includes(historyFocus.get(card)!) ? historyFocus.get(card)! : day;
    const pick = (d: string) => {
      historyFocus.set(card, d);
      void renderSheet();
    };
    const gate = gateStep();
    const limit = choice.m.of === 'dropped' && gate?.limit != null ? gate.limit : undefined;
    const bt = backtestLine(ranges, choice.m);
    // The day picked takes its verdict's colour (the one its News, the calendar and the strip give it) when its number is
    // outside its range; "outside" alone is a shape, a ring, never a severity's colour (ADR 0008 §7).
    const verdict = verdictOf(focus)?.severity;
    box.append(bandChart(ranges, days, focus, choice.m.of === 'trips' ? (v) => fmtCompact(v).replace('.0k', 'k') : fmt, pick, limit, day, verdict === 'alert' || verdict === 'warn' ? verdict : undefined) ?? '',
      h('div', { class: 'vf-key', 'aria-hidden': 'true' },
        h('span', {}, h('i', { class: 'k-band' }), 'usual'), h('span', {}, h('i', { class: 'k-exp' }), 'guess'), h('span', {}, h('i', { class: 'k-out' }), 'outside'),
        h('span', {}, h('i', { class: 'k-focus' }), 'this day'), h('span', {}, h('i', { class: 'k-hol' }), 'holiday'), limit !== undefined ? h('span', {}, h('i', { class: 'k-limit' }), 'limit') : null),
      h('details', { class: 'vf-why' }, h('summary', {}, 'How this day’s band is made', bt ? h('span', { class: 'vf-chip' }, bt.textContent!.match(/\(([\d.]+%)\)/)?.[1] ? `${bt.textContent!.match(/\(([\d.]+%)\)/)![1]} of days outside it last year` : '') : null),
        rangeWhy(ranges, seen, focus, choice.m, fmt, pick, choice.label), bt ?? ''));
  }
  if (kind === 'trips') box.append(calendarView(), incidentsList() ?? '');
  return box;
}
const historyView = new Map<string, string>();
const historyFocus = new Map<string, string>();

/** The trips' numbers the history follows, to pick from: the trips, each column's share missing and middle value,
 * and each coded column's common values' shares. The day's news comes first: a finding's number a tap away. */
/** A metric's name as a chip says it: the number it draws, not a finding about it. */
function metricName(m: Metric): string {
  const col = (c: string) => NEWS_NAMES.column(c);
  switch (m.of) {
    case 'trips': return RowsWord();
    case 'dropped': return 'Dropped';
    case 'droppedRows': return 'Rows dropped';
    case 'rule': case 'ruleRows': return RULE_TITLE(m.name);
    case 'missing': return `${col(m.column)} blank`;
    case 'median': return `${col(m.column)} median`;
    case 'quantile': return `${col(m.column)} p${Math.round((QUANTILES[m.q] ?? 0) * 100)}`;
    case 'value': return `${col(m.column)} ${NEWS_NAMES.label(m.column, JSON.parse(m.value) as unknown)} share`;
    case 'count': return `${col(m.column)} ${NEWS_NAMES.label(m.column, JSON.parse(m.value) as unknown)} ${NEWS_NAMES.noun()}`;
    case 'combo': {
      const [a, b] = m.pair.split('|') as [string, string];
      const [x, y] = JSON.parse(m.value) as [unknown, unknown];
      return `${col(a)} ${NEWS_NAMES.label(a, x)} with ${col(b)} ${NEWS_NAMES.label(b, y)}, beyond the columns`;
    }
    case 'late': return `${col(m.column)} late share`;
    case 'scopeOut': return 'Rows out of scope';
    case 'scopeMissing': return 'In scope with no row';
    case 'needs': return `Rule ${m.rule + 1}: contradictions`;
  }
}

function tripChoices(): { key: string; label: string; m: Metric }[] {
  const file = history!.file;
  const col = (c: string) => NEWS_NAMES.column(c);
  const out: { key: string; label: string; m: Metric }[] = [{ key: 'trips', label: RowsWord(), m: { of: 'trips' } }];
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
      out.push({ key: metricKey({ of: 'value', column: c, value: v }), label: `${col(c)} ${NEWS_NAMES.value(c, JSON.parse(v) as unknown)}: share of ${NEWS_NAMES.noun()}`, m: { of: 'value', column: c, value: v } });
    });
  }
  return out.filter((x, i) => out.findIndex((y) => y.key === x.key) === i);
}

/** The weather of the weeks around the day: rain and snow a day, and the hours on record. */
function weatherHistory(day: string): HTMLElement {
  const w = history!.file.weather!;
  // Eight weeks ending on the day: the weather of days after it isn't known on it (ADR 0008 §10).
  const days = daysFrom(dayPlus(day, -55), day);
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
  // The day marked under the axis, at the chart's end; its date is the key's, so no end label sits under the mark.
  const fi = days.indexOf(day);
  if (fi >= 0) svg.append(s('path', { class: 'wx-caret', d: `M${(fi * step + step / 2 - 4).toFixed(1)} ${H + 9}l4 -6 4 6z` }));
  svg.append(s('text', { class: 'tick', x: 2, y: 10 }, `${max.toFixed(0)} mm`), s('text', { class: 'tick', x: 2, y: H + B - 3 }, shortDay(days[0]!)), s('line', { class: 'wx-base', x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5 }));
  const k = history!.file.days.indexOf(day);
  const short = w.boroughs.filter((_, b) => (w.hours[k]?.[b] ?? 0) < 24);
  return h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'Rain and snow, day by day'), svg,
    h('div', { class: 'vf-key', 'aria-hidden': 'true' }, h('span', {}, h('i', { class: 'k-rain' }), 'rain'), h('span', {}, h('i', { class: 'k-snow' }), 'snow'), h('span', {}, h('i', { class: 'k-caret' }), dayLabel(day).replace(/, \d{4}$/, ''))),
    h('p', { class: 'foot' }, `${(w.precip[k] ?? 0).toFixed(1)} mm${(w.snow[k] ?? 0) >= 0.1 ? ` · ${(w.snow[k] ?? 0).toFixed(1)} cm snow` : ''} · ${w.tmin[k] != null ? String(Math.round(w.tmin[k]!) || 0) : '?'} to ${w.tmax[k] != null ? String(Math.round(w.tmax[k]!) || 0) : '?'} °C${short.length ? ` · hours missing: ${listed(short)}` : ''}`));
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
      k >= 0 && mayRun() ? h('button', { type: 'button', class: 'btn small', disabled: state.running, onclick: () => void useLoad(k) }, 'Load it') : null);
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
  // The day on screen carries its News verdict at once, whatever is still being checked; the days after it haven't
  // arrived (ADR 0008 §10): not drawn and not counted, the newest month on top being the day's own.
  const today = newsDay();
  if (today && days.includes(today)) calendar.sev.set(today, calendarSeverity(today));
  const upTo = today ? days.filter((d) => d <= today) : days;
  const months = [...new Set(upTo.map((d) => d.slice(0, 7)))].reverse();
  const counted = () => new Map(upTo.flatMap((d) => (calendar.sev.has(d) ? [[d, calendar.sev.get(d)!] as const] : [])));
  const box = h('div', { class: 'vf-cal part' });
  const draw = () => {
    const cell = 9;
    const gap = 2;
    const left = 48;
    const W = left + 31 * (cell + gap);
    const H = months.length * (cell + gap) + 4;
    const seen = counted();
    const v = [...seen.values()];
    let svg = `<svg class="viz cal" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Every day of the history to ${today ? dayLabel(today) : 'its end'}, ${fmtInt(seen.size)} of ${fmtInt(upTo.length)} checked: ${v.filter((x) => x === 'alert').length} something wrong, ${v.filter((x) => x === 'warn').length} unusual.">`;
    let ring = '';
    months.forEach((m, r) => {
      const y = r * (cell + gap) + 2;
      // Newest first: each year's block starts at its December (or the top row), and says its year there.
      // Its month by name, the year with it on each year's first row ("Jan 24", "Dec 23", "Nov"), clear of its cells.
      const mon = MONTH_ABBR[Number(m.slice(5, 7)) - 1]!;
      svg += `<text x="0" y="${y + cell - 1}" class="tick">${m.slice(5, 7) === '12' || r === 0 ? `${mon} ${m.slice(2, 4)}` : mon}</text>`;
      for (let d = 1; d <= 31; d++) {
        const day = `${m}-${String(d).padStart(2, '0')}`;
        if (!file.days.includes(day) || day < days[0]! || (today && day > today)) continue;
        const sv = calendar.sev.get(day);
        const x = left + (d - 1) * (cell + gap);
        const cls = sv === 'alert' ? 'cal-alert' : sv === 'warn' ? 'cal-warn' : sv ? 'cal-ok' : 'cal-wait';
        svg += `<rect class="${cls}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" data-day="${day}"/>`;
        // The day on screen: a ring around its cell, apart from the cell's own verdict.
        if (day === today) ring = `<rect class="cal-now" x="${x - 2}" y="${y - 2}" width="${cell + 4}" height="${cell + 4}" rx="3"/>`;
      }
    });
    const el = svgNode(`${svg}${ring}</svg>`);
    el.addEventListener('click', (e) => {
      const day = (e.target as Element).getAttribute?.('data-day');
      if (!day || (today && day > today)) return;
      calendar.picked = day;
      const k = loads.list.findIndex((l) => l.day === day);
      const top = verdictOf(day);
      said.replaceChildren(top && (top.severity === 'alert' || top.severity === 'warn') ? glyphEl(top.severity, 13) : '', ` ${dayLabel(day)}: ${top?.title ?? ''} `, k >= 0 && mayRun() ? h('button', { type: 'button', class: 'btn small', disabled: state.running, onclick: () => void useLoad(k) }, 'Load it') : '');
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
    h('span', {}, h('i', { class: 'k-cal wait' }), 'not checked yet'), today ? h('span', {}, h('i', { class: 'k-cal now' }), 'this day') : null);
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
  history = history.with({ skip: incidentDays(), recorded: new Set(recordedSkips()) });
  storyCache.clear();
  alerts = null;
  backtests.clear();
}

const ACT_LABEL: Record<Act, string> = { expected: ACT_VERB.expected, incident: 'Open an incident', notify: 'Tell the source', rule: 'Add a check', quarantine: 'Set aside for review', refetch: 'Fetch it again', export: 'Export for audit' };

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
  if (a === 'refetch' && !mayRun()) return null;
  if (a === 'refetch') return h('button', { type: 'button', class: 'btn small', ...actAttrs(a, ACT_LABEL[a], f), disabled: state.running, onclick: () => void refetch() }, ACT_LABEL[a]);
  // The audit bag carries the whole record, every source's manifest among it: the owner's to export.
  if (a === 'export') return ledger && isOwner() ? h('button', { type: 'button', class: 'btn small quiet', ...actAttrs(a, ACT_LABEL[a], f), onclick: () => void exportAudit() }, ACT_LABEL[a]) : null;
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
  const prompts: Partial<Record<LogAct, string>> = { expected: 'Why is this expected?', incident: 'What is known so far', resolved: 'What it was, and what was done' };
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
  if (state.section) {
    const g = state.doc.groups?.find((x) => x.id === state.section);
    const o = notebookOfSection(state.section);
    if (g && o && !state.arranging) return renderNotebookSheet(g, o);
    return renderSectionSheet();
  }
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
    const before = gridLayout(canvasDoc(doc), state.collapsed, wrapWidth());
    const slot = besideSlot(before, before.cards.get(of)!, id);
    next.layout = { ...pinLayout(canvasDoc(doc), state.collapsed, wrapWidth()), [id]: [slot.x, slot.y] };
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
  // On a held day an output kept back never says it was published by this run (round 3, #2): it waits for a decision,
  // or was decided not to publish; the version readers have is another day's. Someone who may not decide is told only
  // of that version.
  const kept = stagedOutput(id) ? outputState(id) : null;
  const theirs = kept ? state.names.get(id) : undefined;
  const theirDay = theirs ? dayOfRun(theirs) : undefined;
  const theirContent = theirs?.result.manifest.outputs[id]?.content;
  const had = theirDay ? `readers have ${dayShort(theirDay)}’s${theirContent ? `, content ${short(theirContent)}` : ''}` : 'readers have nothing of it yet';
  const [line, foot] = !kept ? [`Published as ${id}`, n?.content ? `Stored by this run, content ${short(n.content)}, under the policies below.` : 'Stored, named and hashed when the flow runs, under the policies below.']
    : asReaders(id, state.previewAs ?? state.viewer) ? [`Published as ${id}`, `${had.replace(/^./, (c) => c.toUpperCase())}, under the policies below.`]
    : kept === 'dont' ? [`Not published as ${id} from this run`, `This run’s content ${short(n?.content)} was kept back by a decision; ${had}.`]
    : [`Publishes as ${id} once decided`, `This run’s content ${short(n?.content)} is paused; ${had}.`];
  return box('out', 'Output · a dataset the flow publishes',
    h('p', { class: 'io-line' }, `${line}${st.dataset.description ? `: ${st.dataset.description}` : ''}.`),
    h('p', { class: 'foot' }, foot),
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
  // An output kept back on a held day: each person's rows as readers have it, the version its name shows (round 3, #2),
  // never the paused run's, which no reader has.
  const theirs = isOutput(id) && stagedOutput(id) ? state.names.get(id) : undefined;
  const run = theirs ?? (isOutput(id) && stagedOutput(id) ? undefined : latest());
  const theirDay = theirs ? dayOfRun(theirs) : undefined;
  if (theirDay) box.append(h('p', { class: 'foot' }, `Rows as published · ${dayShort(theirDay)}`));
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
function split(kept: number, lost: number, keptLabel: string, lostLabel: string, routine = false): HTMLElement {
  const total = Math.max(1, kept + lost);
  return h('div', { class: `split-wrap${routine ? ' routine' : ''}` },
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
async function showDropped(into: HTMLElement, title: string, sql: string, rules: readonly { k: number; name: string; check?: string; description?: string; reads: ReadonlySet<string> }[], meanings: Meanings = noMeanings): Promise<void> {
  into.hidden = false;
  into.replaceChildren(h('p', { class: 'eyebrow' }, title), h('p', { class: 'foot' }, 'Loading…'));
  try {
    const r = await state.engine!.query(`SELECT * FROM (\n${sql}\n) LIMIT 50`);
    const flagAt = new Map(rules.map((x) => [x, r.columns.indexOf(`_smaltfl_fail_${x.k}`)]));
    const keep = [...r.columns.keys()].filter((k) => !r.columns[k]!.startsWith('_smaltfl_fail_'));
    const failed = r.rows.map((row) => rules.filter((x) => Number(row[flagAt.get(x)!]) === 1));
    // Why, in plain words from the row's own values: what the rule measures and what it needs ("Duration 19 s (needs
    // 1 min–3 h) · Distance 0 miles (needs over 0, at most 100)"); a rule read no simpler is said by its values.
    const at = (c: string) => keep.find((j) => r.columns[j]!.toLowerCase() === c.toLowerCase());
    const said = (c: string, v: unknown) => {
      const m = meanings(c);
      return typeof v === 'number' ? (m?.unit === 'USD' ? `$${v.toFixed(2)}` : `${fmtNum(v)}${m?.unit ? ` ${m.unit}` : ''}`) : cellOf(v).text;
    };
    const titled = (c: string) => meanings(c)?.title ?? c;
    const plainWhy = (x: (typeof rules)[number], row: unknown[]): string => {
      const need = x.check ? needOf(x.check) : null;
      // A bound in dollars as money; any other unit once, after the bounds ("over 0, at most 100 miles").
      const fmt = (c: string, v: number) => (meanings(c)?.unit === 'USD' ? `$${v.toFixed(2)}` : fmtNum(v));
      const unitOf = (c: string) => (meanings(c)?.unit && meanings(c)!.unit !== 'USD' ? ` ${meanings(c)!.unit}` : '');
      if (need?.kind === 'span') {
        const [a, b] = [at(need.from), at(need.to)];
        const secs = a !== undefined && b !== undefined ? (Date.parse(`${String(row[b]).replace(' ', 'T')}Z`) - Date.parse(`${String(row[a]).replace(' ', 'T')}Z`)) / 1000 : Number.NaN;
        if (Number.isFinite(secs)) return `${RULE_TITLE(x.name)} ${secondsText(secs)} (needs ${needWords(need)})`;
      }
      if (need?.kind === 'bounds' || need?.kind === 'present') {
        const k = at(need.column);
        if (k !== undefined) return `${titled(r.columns[k]!)} ${row[k] === null || row[k] === undefined ? 'blank' : said(r.columns[k]!, row[k])} (needs ${needWords(need, fmt)}${need.kind === 'bounds' ? unitOf(r.columns[k]!) : ''})`;
      }
      if (need?.kind === 'notIn') {
        const bad = need.columns.map((c) => at(c)).filter((k): k is number => k !== undefined && need.values.includes(String(row[k])));
        if (bad.length) return `${bad.map((k) => `${titled(r.columns[k]!)} ${cellOf(row[k]).text}`).join(', ')} (needs ${needWords(need)})`;
      }
      const values = [...x.reads].map((c) => at(c)).filter((k): k is number => k !== undefined).map((k) => `${titled(r.columns[k]!)} ${said(r.columns[k]!, row[k])}`);
      return `${RULE_TITLE(x.name)}${values.length ? `: ${values.join(', ')}` : ''}${x.description ? ` (${x.description})` : ''}`;
    };
    const why = failed.map((fs, n) => (fs.length ? fs.map((x) => plainWhy(x, r.rows[n]!)).join(' · ') : 'a rule on a column hidden from you'));
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
      // One severity rule (round 3, #21): the rows a check drops are routine where it passed, in neutral ink; amber only
      // where its checks held the run, or came within a point of their limit.
      const day = dayOfRun(run);
      const gate = day && historyOpen() ? storyFor(day)?.gate : null;
      const warned = run.result.holds.some((x) => x.by === 'checks' && x.origin === id) || (gate?.step === id && (gate.held || gate.near));
      headline(lost ? `Dropped ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : `Kept all ${plural(inn, 'row')}`, lost && warned ? 'drop' : 'same');
      box.append(split(out, lost, 'kept', 'dropped', !warned));
      box.append(await rulesTable(insp, i, rows, who));
      if (lost) {
        // Each dropped row with why it went: the rules it fails that the person can read, and their reasons.
        const view = viewIn(insp, input!, who);
        const hidden = new Set(view.removed.map((r) => r.column.toLowerCase()));
        const visibleCols = new Set(view.columns.map((x) => x.toLowerCase()));
        const reasons = ruleReasons(id);
        const flagged = n.rules.flatMap(([rule, check], k) => {
          const reads = [...identifiers(check)];
          return reads.some((x) => hidden.has(x)) ? [] : [{ k, name: rule, check, description: reasons.get(rule), reads: new Set(reads.filter((x) => visibleCols.has(x))) }];
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
        // In plain words: what it left out (in neutral ink: a step that keeps some rows does so by design), what it
        // renamed, what it adds and what it doesn't keep.
        const r = renamesOf(c.added, c.removed);
        headline(out < inn ? `Left out ${fmtInt(inn - out)} of ${plural(inn, rowNoun(id).one)}` : `${plural(inn, 'row')} in, ${fmtInt(out)} out`);
        if (r.renamed.length) say(`Renamed ${r.renamed.map(([a, b]) => `${a} → ${b}`).join(', ')}.`);
        if (r.added.length) say(`New columns: ${list(r.added)}.`);
        if (r.removed.length) say(`Columns it doesn’t keep: ${list(r.removed)}.`);
        break;
      }
      const lost = Math.max(0, inn - out);
      const kept = Math.min(inn, out);
      // A filter removes rows by design: routine, in neutral ink (round 3, #21).
      headline(lost ? `Removed ${fmtInt(lost)} of ${plural(inn, 'row')} (${pct(lost / Math.max(1, inn))})` : out > inn ? `Added ${plural(out - inn, 'row')}` : `Kept all ${plural(inn, 'row')}`);
      box.append(split(kept, lost, 'kept', 'removed', true));
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
  // A change runs the flow, and a run that passes publishes: read only for anyone who may not decide (round 3, #7).
  if (!mayRun()) {
    for (const area of inputs) area.readOnly = true;
    wrap.append(h('p', { class: 'foot loads-lock' }, glyphEl('lock', 13), `${deciders()} runs this flow.`));
    return wrap;
  }
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
const inUnit = (text: string, v: number, p: PropertyType | undefined) => (p?.unit === 'USD' ? `${v < 0 ? '−\u2060' : ''}$${Math.abs(v).toFixed(2)}` : p?.unit ? `${text} ${p.unit}` : text);

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
  return edgeFade(h('div', { class: `scroll${tall ? ' tall' : ''}` }, h('table', { class: 'data' }, h('thead', {}, h('tr', {}, ...columns.map(head))), h('tbody', {}, ...rows.map((row, r) => h('tr', {}, ...row.map((v, k) => cell(v, k, r))))))));
}

/** A box that scrolls sideways, its edge faded while columns lie past it (as the tabs are), so a table wider than the
 * phone reads as one that scrolls, its first column kept in place. */
function edgeFade(el: HTMLElement): HTMLElement {
  const edges = () => {
    el.classList.toggle('fade-l', el.scrollLeft > 2);
    el.classList.toggle('fade-r', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  el.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(edges);
  return el;
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
  // On a held day the outputs keep the last day before it that passed: said over them (ADR 0008 §10). Someone who may
  // not decide reads them as readers have them, under that day (round 3, #2).
  const readers = outputs.some(([name]) => asReaders(name, state.viewer));
  const bar = () => (readers ? readersBar() : rowsFromBar());
  $('datasets').replaceChildren(
    bar() ?? '',
    outputs.length
      ? h('ul', { class: 'runs' }, ...outputs.map(([name, held]) => {
        // As readers have it, for someone who may not decide (round 3, #2): the version its name shows.
        const d = asReaders(name, state.viewer) ? (state.names.get(name)?.result.manifest.outputs[name] ?? held) : held;
        return h('li', {}, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => select(name) }, name), owner ? h('span', { class: 'foot num' }, `${fmtInt(d.rows)} rows`) : null, h('span', { class: 'hash', title: `Content hash ${d.content}` }, `content ${short(d.content)}`)));
      }))
      : h('p', { class: 'foot' }, `No output is open to ${personName(state.viewer)}.`),
  );
  try {
    const zh = await readOutput('zone_hour');
    $('zones-panel').hidden = !zh;
    if (zh) {
      const zones = await engine.query(
        `SELECT pu_zone AS zone, pu_borough AS borough, sum(trips) AS trips, round(sum(avg_duration_min * trips) / sum(trips), 1) AS minutes, round(sum(avg_speed_mph * trips) / sum(trips), 1) AS mph FROM (${zh}) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`,
      );
      $('zones-table').replaceChildren(bar() ?? '', table(zones.columns, zones.rows, undefined, false, meaningsOf('zone_hour')));
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
    // The day on screen staged (ADR 0009 §12): its rows are in the effect, under the bar that says so.
    $('effect-chart').replaceChildren(bar() ?? '', effectChart(effect.rows as [string, string, number, number, number][], dry.rows as [string, number, number][], width, empty));
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
  // Only loads run on this same flow: their rows mean the same. A held day's rows count only on its own day, under its
  // staged bar: readers never got them (ADR 0009).
  for (const [k, l] of loads.list.entries()) {
    const r = l.episode === loads.episode ? runOfLoad(k) : undefined;
    // Someone who may not decide never counts a held day's rows, its own day's either (round 3, #2).
    if (!r || r.result.manifest.flow.hash !== run.result.manifest.flow.hash || ((r !== run || !mayDecide(who)) && !isPublished(r))) continue;
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
  // (The right margin holds each bar's percentage: right2 below.)
  const barH = 18;
  const gap = 8;
  const groupGap = 18;
  // Each ratio a bar from the dry hours' 1×, left for fewer trips and right for more (ADR 0008 §12), so +1% and −13%
  // read apart. Ratios from ½× to many times: on a doubling scale, each doubling the same width, its ticks printed.
  const vals = shown.map((r) => r[4]);
  const lo = Math.min(0.5, ...vals.map((v) => Math.max(v, 1 / 64)));
  const hi = Math.max(2, ...vals);
  const [l2lo, l2hi] = [Math.floor(Math.log2(lo)), Math.ceil(Math.log2(hi))];
  const pad = 10;
  const right2 = 56;
  const x = (v: number) => left + pad + ((Math.log2(Math.max(v, 1 / 64)) - l2lo) / Math.max(1, l2hi - l2lo)) * (width - left - right2 - pad * 2);
  const boroughs = [...new Set(shown.map((r) => r[0]))];
  let y = 26;
  const marks: SVGElement[] = [];
  for (const b of boroughs) {
    marks.push(s('text', { x: 0, y: y + 12, 'font-weight': 600 }, b));
    y += 20;
    for (const [, condition, hours, , vs] of shown.filter((r) => r[0] === b)) {
      const cls = condition === 'snow' ? 'snow' : condition === 'heavy rain' ? 'heavy' : 'rain';
      marks.push(s('text', { x: 12, y: y + 13 }, `${condition} · ${hours} h`));
      const [a, b] = [x(1), x(vs)];
      marks.push(s('rect', { class: `bar ${cls}`, x: Math.min(a, b), y, width: Math.max(2, Math.abs(b - a)), height: barH, rx: 3 }));
      const change = vs - 1;
      const said = `${change >= 0 ? '+' : '−'}${Math.abs(change * 100).toFixed(0)}%`;
      marks.push(s('text', { x: vs >= 1 ? Math.max(a, b) + 6 : Math.min(a, b) - 6, y: y + 13, class: 'num', 'text-anchor': vs >= 1 ? 'start' : 'end' }, said));
      y += barH + gap;
    }
    y += groupGap - gap;
  }
  const height = y + 4;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Trips per hour in rain, heavy rain and snow, against dry hours at the same hour of day' });
  // A tick every doubling, or every other or fourth when there are many (never beside 1×, named as the dry hours).
  const every = l2hi - l2lo > 10 ? 4 : l2hi - l2lo > 5 ? 2 : 1;
  for (let e = l2lo; e <= l2hi; e++) {
    if (e % every) continue;
    const t = 2 ** e;
    svg.append(s('line', { class: e === 0 ? 'base' : 'grid', x1: x(t), x2: x(t), y1: 18, y2: height }));
    svg.append(s('text', { class: 'axis', x: x(t), y: 12, 'text-anchor': 'middle' }, e === 0 ? 'dry 1×' : t < 1 ? `${t === 0.5 ? '½' : `1/${1 / t}`}×` : `${t}×`));
  }
  svg.append(...marks);
  return h('div', {}, svg, h('p', { class: 'foot' }, 'Only boroughs with at least 3 trips in a dry hour are shown, and conditions with 4 hours or more. Weather by Open-Meteo.com (CC BY 4.0); trips from the NYC TLC.'));
}

// ------------------------------------------------------------------ policies

const ruleNames = (ids: readonly string[]) =>
  ids.map((id) => (id === '*' ? 'everyone' : (policies()?.groups?.find((g) => g.id === id)?.name ?? personName(id)))).join(', ');
const actionName = (id: string) => (id === DECIDE ? 'Decide paused days' : state.doc.ontology?.actionTypes.find((a) => a.id === id)?.name ?? id);

function setViewer(id: string): void {
  state.viewer = id;
  state.previewAs = null;
  $<HTMLSelectElement>('viewer').value = id;
  state.object = null;
  state.verdict = null;
  if (!isOwner()) state.arranging = false;
  // Someone who may not decide doesn't run the flow, nor step its days (round 3, #7).
  syncRun();
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
  // The day's line again, for them: the same sentence as anyone's, of what they may see (ADR 0009 §12).
  const own = onScreen();
  if (!state.running && state.failed && !state.failed.file) sayFailed();
  else if (!state.running && !state.failed && own) sayRun(own);
  else if (!state.running && !state.failed?.file) {
    setStatus(isOwner(id) ? 'Viewing as the owner: every row and column.' : `Viewing as ${personName(id)}: every read goes through their rules, and what is closed to them is left out.`);
    $('status').title = '';
  }
}

let policiesRender = 0;
async function renderPolicies(): Promise<void> {
  const p = policies();
  if (!p) return;
  const token = ++policiesRender;
  // Anyone but the owner sees their own access, the rules that apply to them, and only datasets open to them.
  const owner = isOwner();
  const people = owner ? p.principals : p.principals.filter((x) => x.id === state.viewer);
  // The names readers get (ADR 0009): on a held day, the last day published, said so.
  const note = asPublished();
  const from = note ? note.replace(/^A/, 'a') : 'from this run';
  $('matrix-sub').textContent = owner
    ? `Rows each person can read in each output, ${from}. Closed means none: a rule applies but can’t filter that output’s rows.`
    : `The rows ${personName(state.viewer)} can read in each output open to them, ${from}.`;
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
    // Who may decide a paused day (ADR 0009 §8): the owner always, and whoever a rule for it names; said where the rules
    // are listed, as "Only Owner decides" says it on a paused day.
    ...(state.doc.publish ? [(() => {
      const deciders = [...new Set([...p.principals.filter((x) => x.owner).map((x) => x.name), ...p.rules.filter((r) => r.kind === 'action' && r.action === DECIDE).flatMap((r) => ruleNames(r.for).split(', '))])];
      return h('li', { class: 'decide-rule' }, h('span', { class: 'tag' }, `action · for ${deciders.join(', ') || 'no one'}`), h('span', { class: 'who' }, 'Decide paused days'), h('span', { class: 'foot', style: 'margin:0' }, 'Publish a paused day as is, or keep the day readers have.'));
    })()] : []),
  );
  const run = latest();
  if (!run || !state.engine) return;
  const outputs = Object.keys(run.result.manifest.outputs).filter((o) => owner || visible(o));
  const body: HTMLElement[] = [];
  for (const x of people) {
    const cells: HTMLElement[] = [];
    for (const o of outputs) {
      if (!state.names.has(o)) {
        cells.push(h('td', { class: 'n closed-cell', title: 'Nothing published under this name yet' }, '—'));
        continue;
      }
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
  if (!$('matrix').dataset.fade) ($('matrix').dataset.fade = '1'), edgeFade($('matrix'));
  else requestAnimationFrame(() => $('matrix').dispatchEvent(new Event('scroll')));
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
      const sql = readPublished(t.dataset);
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
          h('span', { class: 'meta' }, `${c === undefined || c === null ? '' : `${fmtInt(c)} objects${publishedNote(t.dataset)} · `}from ${t.dataset}, keyed by ${t.key.join(' + ')}`),
          links.length ? h('span', { class: 'links' }, `Links: ${links.join(' · ')}`) : null,
          acts.length ? h('span', { class: 'links' }, `Actions: ${acts.join(', ')}`) : null);
      })),
  );
  const t = types.find((x) => x.id === state.ontologyType);
  const objects = $('objects');
  if (!t || !engine || !latest()) {
    objects.replaceChildren(h('p', { class: 'foot' }, latest() ? 'Choose an object type to see its objects.' : 'Run the flow to see the objects.'));
  } else {
    // Actions act on what readers get: the objects are the published version, said so on a held day (ADR 0009).
    const sql = readPublished(t.dataset);
    const note = asPublished();
    const head = h('div', {}, h('h2', {}, t.name), h('p', { class: 'sub' }, `${t.description ?? ''} Read as ${personName(state.viewer)}${note ? ` · ${note.replace(/^A/, 'a')}` : ''}.`));
    if (!sql && !state.names.has(t.dataset)) {
      objects.replaceChildren(head, h('p', { class: 'foot' }, `Nothing is published from ${t.dataset} yet: a day waits for a decision.`));
    } else if (!sql) {
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
  /** With several daily sources (ADR 0013 §5): each source's file for the day, by id. */
  files?: Record<string, Listed>;
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
  /** The other daily sources' bytes for the same loads (ADR 0013 §5), by source id. */
  others: new Map<number, Record<string, Uint8Array>>(),
  /** The days a paused day may be filled from that aren't loads (loads.json `donors`, ADR 0009 amendment 1 S13): never
   * stepped through, checked against the data's list, and pinned only when a fill needs one. */
  donors: [] as Listed[],
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
/**
 * The source the loads feed (ADR 0010 §9): the one the data list gives loads, by id; else the flow's watched source;
 * else the example's trips.
 */
const loadSource = (): string | undefined => {
  // The data's list may name the watched source or step the views follow (ADR 0013 §5): the posture across several
  // daily sources, whose card carries the day's story.
  const judged = dataList?.judged;
  if (judged && Object.keys(state.doc.publish?.watch ?? {}).some((id) => id.toLowerCase() === judged.toLowerCase()) && (state.doc.sources.some((x) => x.id === judged) || state.doc.steps.some((x) => x.id === judged))) return judged;
  const listed = dataList?.loadSource;
  if (listed && state.doc.sources.some((x) => x.id === listed)) return listed;
  const watched = Object.keys(state.doc.publish?.watch ?? {}).find((id) => state.doc.sources.some((x) => x.id === id));
  if (watched) return watched;
  const table = EXAMPLE_SOURCES.find((x) => x.file === 'trips.parquet')?.table;
  return state.doc.sources.find((x) => x.table === table)?.id;
};
/** The name the loads' files are pinned under: their source's binding's file. */
/** The source the daily loads feed first (the list's `loadSource`): the file a load's bytes are pinned as. */
const primarySource = (): string | undefined => {
  const listed = dataList?.loadSource;
  return listed && state.doc.sources.some((x) => x.id === listed) ? listed : loadSource();
};
const loadFile = (): string => bindingOf(primarySource() ?? '')?.file ?? 'trips.parquet';
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
  const checker = checksOf(src);
  const e = checker ? m.nodes.find((n) => n.origin === checker.id)?.expectations : undefined;
  return { rows: Number(input.rows ?? 0), dropped: e && e.rows ? e.dropped / e.rows : null };
}

/** A day's verdict from its news: its worst finding, or none without a history. */
/** A day's verdict: a file refused or republished first, else its news. */
/** The health cell a finding's kind belongs to (story.ts CELL_KINDS), for the strip's marks. */
const cellOfKind = (kind: Finding['kind']): Cell | null => (Object.keys(CELL_KINDS) as Cell[]).find((c) => (CELL_KINDS[c] as readonly string[]).includes(kind)) ?? null;

function verdictOf(day: string): Finding | undefined {
  const l = loads.list.find((x) => x.day === day);
  const c = l ? integrity.checks.get(l.file) : undefined;
  if (c && fileSeverity(c.class) !== 'ok') {
    const said = describeFile(c);
    return { key: `integrity:${c.path}`, kind: 'integrity', severity: fileSeverity(c.class), score: 100, title: said.title, detail: said.detail, look: 'integrity', acts: [] };
  }
  // A run that failed on the day (a file the engine refused): the day is wrong, by its file (ADR 0013 §6).
  if (state.failed && !state.failed.file && loads.list[loads.at]?.day === day) return { key: `failed:${day}`, kind: 'schema', severity: 'alert', score: 100, title: failedHead(), detail: state.failed.message, look: 'integrity', acts: [] };
  // Another watched load that held the day (ADR 0013 §5), the cause before the judged dataset's own symptom: its
  // verdict is the day's, with the cell its words point at.
  const other = heldElsewhere(state.runs.find((x) => dayOfRun(x) === day));
  if (other) return { key: `hold:${day}:${other.origin}`, kind: kindOfHead(other.said), severity: 'alert', score: 100, title: `${other.origin}: ${other.said}`, detail: '', look: 'news', acts: [] };
  // The day as its story tells it: one head, one severity, for the strip, the history and the header alike.
  const story = history && historyOpen() && history.file.days.includes(day) ? storyFor(day) : null;
  return story ? { key: `story:${day}`, kind: story.state === 'unlearned' ? 'unlearned' : story.cause?.kind ?? 'calm', severity: story.severity, score: 100, title: story.head, detail: story.chip ?? '', look: 'news', acts: [] } : undefined;
}
/** The kind of finding a claim's head reads as (a claim carries its head, not its kind): for the strip's cell word. */
const kindOfHead = (head: string): Finding['kind'] =>
  /^(Almost no|Fewer|More) /.test(head) ? 'volume' : /^Gap in|fall to| from \d\d:\d\d/.test(head) ? 'hours' : /^New /.test(head) ? 'new' : / with .*: \d/.test(head) ? 'combo' : / blank/.test(head) ? 'missing' : /: none$|almost gone/.test(head) ? 'gone' : 'share';
// A day with notes says its head when the head isn't a calm one ("Busier than usual for days", Sep 14, 2022), as its
// News does: never "a normal day" beside a count outside its range.
const VERDICT_WORD: Record<Severity, string> = { alert: 'something’s wrong', warn: 'unusual', note: 'with a note', ok: 'a normal day' };
const saysHead = (f: Finding) => f.severity === 'alert' || f.severity === 'warn' || (f.severity === 'note' && !/^(A normal |Normal for |Back to normal)/.test(f.title));

/** The load now, in a sentence: its day, its trips, its verdict and the first thing to know. */
function loadSummary(): string {
  const k = loads.at;
  const l = loads.list[k];
  if (!l) return '';
  const list = shownLoads();
  const r = runOfLoad(k);
  const st = r ? loadStats(r) : null;
  const top = verdictOf(l.day);
  // The day's head, as its story says it: the strip above draws the rest. Its trips only to someone they are open to.
  void list;
  void st;
  const src = loadSource();
  return top ? `${dayLabel(l.day).replace(/, \d{4}$/, '')}: ${top.title}` : !src || visible(src) ? `${dayLabel(l.day)}: ${rowsSaid(l.rows)}` : dayLabel(l.day);
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
  // A day stepped to is a run, and a run that passes publishes: only someone who may decide steps the days (round 3,
  // #7). Anyone else reads the strip as it stands, at full ink, and who runs the days where Play was.
  const runs = mayRun();
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
  // A day before the one on screen that this visit didn't run, and whose fate the record doesn't keep, is not run: its
  // outline dashed (absent), its band and no count, no mark (nothing became of it here), and the key says so (ADR 0008
  // §7: dashes mean absent). A refused file was tried: its mark stays.
  const notRun = (k: number) => {
    const l = loads.list[k]!;
    const v = verdictOf(l.day);
    return !!viewed && l.day < viewed && !runOfLoad(k) && !dayPause(l.day) && v?.kind !== 'integrity' && !v?.key.startsWith('failed:');
  };
  // The day's trips, drawn and said, only to someone the trips are open to (ADR 0009 §12: a viewer never sees what is
  // closed to them); anyone else gets the days and what became of each.
  const loadSrc = loadSource();
  const counted = !loadSrc || visible(loadSrc);
  const chips = list.map((k) => {
    const l = loads.list[k]!;
    const later = !!viewed && l.day > viewed;
    const absent = notRun(k);
    const r = later ? undefined : runOfLoad(k);
    const top = later || absent ? undefined : verdictOf(l.day);
    const sev = top ? (top.severity === 'note' ? 'ok' : top.severity) : 'none';
    // A flow that says what holds it marks a day by what became of it (ADR 0009 §12); one that doesn't, by its gate.
    const pm = later ? null : dayPause(l.day);
    const held = !later && !absent && !state.doc.publish && !!(history && historyOpen() && storyFor(l.day)?.gate?.held);
    const range = tripsRanges?.at(l.day);
    const label = later ? `${dayLabel(l.day)}${l.note ? `, ${l.note}` : ''}: after this day` : absent ? `${dayLabel(l.day)}${l.note ? `, ${l.note}` : ''}: not run` : `${dayLabel(l.day)}${l.note ? `, ${l.note}` : ''}${counted ? `: ${rowsSaid(l.rows)}` : ''}${top ? (top.kind === 'unlearned' ? `, not judged yet${top.detail ? `: ${top.detail}` : ''}` : `, ${VERDICT_WORD[top.severity]}${saysHead(top) ? `: ${top.title}` : ''}`) : ''}${held ? ', held' : ''}${pm ? pauseSaid(l.day, pm) : ''}${r ? '' : top?.key.startsWith('failed:') ? ', the run failed: nothing published' : ', not run yet'}`;
    return h('button', { type: 'button', class: ['load', `sev-${sev}`, k === loads.at ? 'at' : '', r ? 'ran' : '', later ? 'later' : '', absent ? 'notrun' : '', holidayOf(l.day, calendarNow()) ? 'holiday' : l.note ? 'holiday season' : ''].filter(Boolean).join(' '), 'aria-pressed': String(k === loads.at), 'aria-label': label, title: label, disabled: busy || loads.playing || !runs, onclick: () => void useLoad(k) },
      h('span', { class: 'ld-day' }, weekday(l.day)),
      h('span', { class: 'ld-date' }, String(dateOf(l.day).getUTCDate())),
      svgNode(stripBar({ v: later || absent || !counted ? 0 : l.rows, low: range?.low ?? null, high: range?.high ?? null, ymax, sev: sev === 'alert' || sev === 'warn' ? sev : null })),
      h('span', { class: 'ld-marks', 'aria-hidden': 'true' }, sev === 'alert' || sev === 'warn' ? glyphEl(sev, 14) : top?.kind === 'unlearned' ? glyphEl('unlearned', 14) : '',
        // A mark about the values or the hours, under a bar within its range, says so (the two-minute test, round 1):
        // the bar is the amount; the mark is the day's story.
        (sev === 'alert' || sev === 'warn') && top && cellOfKind(top.kind) && cellOfKind(top.kind) !== 'amount' ? h('span', { class: 'ld-cell' }, CELL_NAMES[cellOfKind(top.kind)!].toLowerCase()) : '', held ? glyphEl('held', 14) : pm ? glyphEl(PAUSE_MARK[pm], 14) : ''));
  });
  const at = list.indexOf(loads.at);
  const last = at >= list.length - 1;
  const play = h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(loads.playing), disabled: busy && !loads.playing, onclick: () => void playLoads() }, loads.playing ? 'Pause' : last || at < 0 ? 'Play ▶' : 'Play the rest ▶');
  const next = h('button', { type: 'button', class: 'btn small', disabled: busy || loads.playing || last || at < 0, onclick: () => void useLoad(list[at + 1]!) }, 'Next ›');
  const ep = loads.episodes.find((e) => e.name === loads.episode);
  const episodes = loads.episodes.length > 1
    ? h('div', { class: 'episodes', role: 'group', 'aria-label': 'Which days' },
        ...loads.episodes.map((e) => {
          // Its mark from its days, never its place: the worst any of them is told (the history's verdict, the flow's
          // own), ! for something wrong, the triangle for unusual, none for a calm stretch.
          const worst = episodeWorst(e.name);
          return h('button', { type: 'button', class: 'nav-chip ep-chip', 'aria-pressed': String(e.name === loads.episode), 'aria-label': `${e.name}${worst ? `: ${worst === 'alert' ? 'something’s wrong' : 'unusual'} on some days` : ''}`, disabled: busy || loads.playing || !runs, onclick: () => setEpisode(e.name) }, e.name, worst ? glyphEl(worst, 13) : '');
        }))
    : null;
  const weekNav = h('div', { class: 'week-nav' },
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The week before', disabled: wi === 0, onclick: () => turn(-1) }, '‹'),
    h('span', { class: 'week-at', 'aria-live': 'polite' }, `Week ${wi + 1} of ${weeks.length} · ${weekSpan(shown.days)}`),
    h('button', { type: 'button', class: 'btn small', 'aria-label': 'The week after', disabled: wi === weeks.length - 1, onclick: () => turn(1) }, '›'));
  const src = loadSource();
  const lens = profiles().find((p) => p.of === src)?.id ?? src;
  const top = now ? verdictOf(now.day) : undefined;
  // The day held, on the first screen (ADR 0009 §12): the pause and the day readers see, and Decide a tap away.
  const own = now ? onScreen() : undefined;
  const held = own ? pauseOf(own) : null;
  const may = (['asis', 'dont'] as const).some((o) => checkDecision(policies(), state.viewer, o).allowed);
  const kept = own && held ? readersAsOf(own) : null;
  const pl = own && held ? dayPausedLine({ state: held.state, readers: kept!.day, past: kept!.past, may, standing: standsOn(held.pause?.decision), day: now!.day, remedy: held.remedy, withdrawn: held.withdrawn, level: held.pause?.decision?.about.level?.from ?? null, under: levelUnder(held.pause?.decision), readersMark: kept!.past ? null : readersMarkOf(own) }) : null;
  // The status line just above says the day by its pause where the viewer's story doesn't head it (core/decision.ts
  // daySentence, as sayRun says it): its date and, with no Decide to go with it, its pause aren't said again here.
  const statusPause = !!held && (!isOut(held.state) ? !(top?.title && top.severity === 'alert') : !top?.title);
  // The day after an episode says what became of its days here too, with Decide while one waits (ADR 0009 §12), as
  // its News does: only to someone the trips are open to.
  const nowStory = now && !held && history && historyOpen() && counted && history.file.days.includes(now.day) ? storyFor(now.day) : null;
  const after = nowStory?.recovery ? afterOf(nowStory) : null;
  const waitingDay = after?.verb && nowStory ? firstWaiting(nowStory) : null;
  box.replaceChildren(
    h('div', { class: 'loads-head' }, h('p', { class: 'eyebrow' }, `Daily loads · ${loads.episode}`), runs ? h('div', { class: 'loads-act' }, play, next) : h('p', { class: 'loads-lock', title: `${deciders()} runs the days: a day that passes publishes` }, glyphEl('lock', 13), `${deciders()} runs days`)),
    episodes ?? '',
    h('div', { class: `loads-row scroll${runs ? '' : ' ro'}`, role: 'group', 'aria-label': runs ? `Daily loads, ${weekSpan(list)}: tap one to run the flow on it` : `Daily loads, ${weekSpan(list)}: ${deciders()} runs them` }, ...chips),
    // A key for what the row draws, only what it draws (ADR 0008 §7): each mark on its days with its word, the line
    // under a holiday (light: a day of its season), and a dashed day: not run.
    keyOf(chips, list, notRun),
    h('div', { class: `loads-now${top ? ` sev-${top.severity}` : ''}` },
      // The day's head is the status line's, just above: said once (a day with no news says its trips here).
      (top && counted) || statusPause ? null : h('p', { 'aria-live': 'polite' }, top && (top.severity === 'alert' || top.severity === 'warn') ? glyphEl(top.severity, 14) : '', ' ', loadSummary()),
      // Once decided, the decision's receipt, as the sheet collapses to it: what readers now see, who, when, the record.
      pl && held && held.state === 'waiting' && !(statusPause && !pl.verb) ? h('p', { class: `loads-pause ${held.state}` }, glyphEl(PAUSE_MARK[held.state], 14), h('b', {}, pl.text)) : null,
      own && held && held.state !== 'waiting' ? receiptOf(own, may) : null,
      after ? h('p', { class: `loads-pause after${waitingDay ? ' waiting' : ''}` }, h('b', {}, afterParts(after))) : null,
      h('div', { class: 'loads-acts' },
        pl?.verb && own ? h('button', { type: 'button', class: 'btn small primary vf-decide-day', 'aria-label': `Decide what readers get for ${dayMid(now!.day)}`, onclick: () => decisionSheet(own, storyFor(now!.day)) }, `${pl.verb} ›`) : null,
        waitingDay && after?.verb ? h('button', { type: 'button', class: 'btn small primary vf-decide-day', 'aria-label': `Decide what readers get for ${dayMid(waitingDay)}`, onclick: () => decideDay(waitingDay) }, `${after.verb} ›`) : null,
        lens && top && visible(src!) ? h('button', { type: 'button', class: 'btn small', onclick: () => openTab(lens, 'news') }, 'The news ›') : null)));
  // The loaded day in view in the scrolling row.
  requestAnimationFrame(() => {
    const row = box.querySelector('.loads-row') as HTMLElement | null;
    const at = row?.querySelector('[aria-pressed="true"]') as HTMLElement | null;
    if (row && at) row.scrollLeft = Math.max(0, at.offsetLeft - row.offsetLeft - row.clientWidth / 2 + at.clientWidth / 2);
  });
  void weekNav;
}

/** The worst an episode's days are told, by the history's verdict (only to someone the trips are open to): its chip's
 * mark. Null for a calm stretch, or without a history to judge by. */
function episodeWorst(name: string): 'alert' | 'warn' | null {
  if (!history || !historyOpen()) return null;
  const src = loadSource();
  if (src && !visible(src)) return null;
  // The days' verdicts are the History calendar's (calendarSeverity), worked out a few at a time while the page is idle
  // and kept with the calendar's, the chips drawn again once every load's day is known.
  const key = `${checksAsCounted()}|${dataLog.version}|${[...hiddenTripColumns()].sort().join(',')}`;
  if (calendar.key !== key) (calendar.sev.clear(), (calendar.key = key), (calendar.busy = false));
  const file = history.file;
  const next = () => loads.list.find((l) => file.days.includes(l.day) && !calendar.sev.has(l.day))?.day;
  if (next() && !episodeMarks.busy) {
    episodeMarks.busy = true;
    const step = () => {
      if (calendar.key !== key) return void (episodeMarks.busy = false);
      const t0 = performance.now();
      for (let day = next(); day && performance.now() - t0 < 24; day = next()) calendar.sev.set(day, calendarSeverity(day));
      if (next()) idle(step);
      else (episodeMarks.busy = false), renderLoads();
    };
    idle(step);
  }
  let worst: 'alert' | 'warn' | null = null;
  for (const l of loads.list) {
    if (l.episode !== name) continue;
    const sev = calendar.sev.get(l.day);
    if (sev === 'alert') return 'alert';
    if (sev === 'warn') worst = 'warn';
  }
  return worst;
}
const episodeMarks = { busy: false };

/** What a day's chip says of its pause, after its trips and verdict. */
const PAUSE_SAID: Record<DayState, string> = { waiting: ', paused, waiting on a decision', asis: ', published as is', dont: ', not published', fill: ', filled', complete: ', published with the part that arrived', accepted: ', published as a new level' };
/** The same, said of a day's pause now: a fill names its donor (", filled from Thu 14"). */
function pauseSaid(day: string, s: DayState): string {
  if (s !== 'fill' && s !== 'complete') return PAUSE_SAID[s];
  const now = pauseOf(state.runs.find((x) => dayOfRun(x) === day));
  const r = now?.remedy ?? remedyOf(latestPause(day));
  return r ? `, ${remedyHead(r).replace(/^./, (c) => c.toLowerCase())}` : PAUSE_SAID[s];
}

/**
 * What became of a day the flow held (ADR 0009 §12): by its newest run in this visit, else by the record's pause of the
 * day under the flow on screen (a day held in an earlier visit still waits). Null for a day that published, or none.
 */
function dayPause(day: string): DayState | null {
  const r = state.runs.find((x) => dayOfRun(x) === day);
  if (r) return pauseOf(r)?.state ?? null;
  return dayState(null, latestPause(day));
}

/** The record's latest pause of a day under the flow on screen, if any. */
function latestPause(day: string): Pause | null {
  const flow = flowOnScreen();
  return flow ? (pauses().filter((x) => x.day === day && x.inputs.flow === flow).at(-1) ?? null) : null;
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
  // A day stepped to is a run (round 3, #7): only someone who may decide steps days, before anything is fetched.
  if (!mayRun()) return void run();
  let bytes = loads.bytes.get(k);
  try {
    if (!bytes) {
      setStatus(`Fetching ${dayLabel(l.day)}${sourceOpen() ? `: ${rowsSaid(l.rows)}` : ''}, checked against the data's list…`);
      bytes = await checked(l.file, { sha256: l.sha256, bytes: l.bytes ?? -1, from: l.file });
      loads.bytes.set(k, bytes);
      for (const old of [...loads.bytes.keys()].slice(0, Math.max(0, loads.bytes.size - 3))) loads.bytes.delete(old);
    }
    // The engine hashes the bytes again as it pins them, kept ones included, and refuses them if they don't match.
    await pinFile(engine, loadFile(), bytes, l.sha256);
    // The other daily sources' files for the day (ADR 0013 §5), each checked and pinned under its binding's name.
    const others = loads.others.get(k) ?? {};
    for (const [id, f] of Object.entries(l.files ?? {})) {
      const b = bindingOf(id);
      if (!b || id === primarySource()) continue;
      others[id] ??= await checked(f.file, { sha256: f.sha256, bytes: f.bytes ?? -1, from: f.file });
      await pinFile(engine, b.file, others[id], f.sha256);
    }
    loads.others.set(k, others);
    for (const old of [...loads.others.keys()].slice(0, Math.max(0, loads.others.size - 3))) loads.others.delete(old);
  } catch (e) {
    loads.bytes.delete(k);
    loads.others.delete(k);
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
    // A day that stopped, or one that waits for a person (ADR 0009), stops the play there.
    if (state.failed || pauseOf(onScreen())?.state === 'waiting') break;
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
  if (!top) return { text: day ? 'a normal day' : 'all normal', tone: 'same' };
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
  // A load held by its own verdict (ADR 0013 §5): something wrong, marked on its card.
  if (ownHoldOf(dataOf(card))) return 'alert';
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
/**
 * The history as the flow judges a day by it (ADR 0009 §3): every day in its ranges but those the record leaves out
 * (ADR 0010 §5, Q-80: held and not published as is), none left out by this browser's marks (`history` leaves an
 * incident's days out once someone marks one), and the file as the engine pinned it, by the name a flow's watch gives it.
 */
let flowHistory: HistoryRanges | null = null;
let historyPin: HistoryRef | null = null;
/** The watched source's base history, as the data's list gave it (ADR 0010 §6). */
let baseHistory: HistoryFile | null = null;
/** Every watch's base history and its pin (ADR 0013 §5), by watched id: the judged one's is `baseHistory`. */
const bases = new Map<string, { file: HistoryFile; ref: HistoryRef }>();
/** Each watched node's kept sample (ADR 0014 §5), by id: the build's, with the days run in this browser appended. */
const samples = new Map<string, SampleFile>();
/** The kept rows of each load run in this browser (ADR 0014 §5), by watched id and day: the classifier's today. */
const keptRows = new Map<string, Map<string, unknown[][]>>();
/** A day's kept rows added to a node's sample, once, in order; a day out of order is kept for its own story only. */
function keepDay(id: string, day: string, rows: unknown[][]): void {
  const mine = keptRows.get(id) ?? new Map<string, unknown[][]>();
  if (!mine.has(day)) mine.set(day, rows);
  keptRows.set(id, mine);
  const file = samples.get(id);
  if (file && !file.days.includes(day) && (file.days.length === 0 || day > file.days.at(-1)!)) samples.set(id, appendSample(file, day, rows));
}
/** The classifier's rows for a node's day (ADR 0014 §5): its sample and the day's kept rows, where both are had. */
function apartFor(id: string, day: string): { sample: SampleFile; today: unknown[][] } | undefined {
  const sample = samples.get(id);
  const today = keptRows.get(id)?.get(day);
  return sample && today ? { sample, today } : undefined;
}
/**
 * Each watched source's tail (ADR 0010 §6, C5): the measures of its loads the base lacks, from their own runs in this
 * browser, one a slot (the first to arrive), rebuilt from the record when the page opens. A derived run adds none.
 */
const tails = new Map<string, Measures[]>();
/** Add a load's measures to its source's tail: only a slot the base lacks, the first time it runs. */
function addToTail(m: Measures): boolean {
  if (baseHistory?.days.includes(m.slot)) return false;
  const tail = tails.get(m.source) ?? [];
  if (tail.some((x) => x.slot === m.slot)) return false;
  tails.set(m.source, [...tail, m]);
  return true;
}
/** The tails again, from the record's run entries (their `measures`), as they arrived. */
function rebuildTails(): void {
  tails.clear();
  for (const e of ledger?.entries ?? []) {
    const a = e.about as { outcome?: string; measures?: Measures[] } | null;
    if (e.kind === 'run' && (a?.outcome === 'ok' || a?.outcome === 'held') && Array.isArray(a.measures)) for (const m of a.measures) addToTail(m);
  }
}
/** The days the record leaves out of learning (ADR 0010 §5, C5, Q-80): held and not published as is. */
const recordedSkips = (): string[] => skipOf(ledger?.entries ?? [], periodOfFlow());
let rangesKey = '';
/**
 * The ranges again when the tail or the days the record leaves out changed: the base with the tail folded in, the flow's
 * (leaving out the record's days) and this browser's (its incident marks too), each by the flow's calendar.
 */
function refreshRanges(): void {
  const source = loadSource();
  if (!baseHistory || !source) return;
  const tail = tailBefore(tails.get(source) ?? [], '\uffff');
  const skips = recordedSkips();
  // The levels accepted (ADR 0010 §5, C6): from each, the metrics it names are learned anew, in the flow's verdict and
  // in what this browser shows.
  const levels = levelsOf(ledger?.entries ?? [], source);
  const key = JSON.stringify([tail.map((m) => m.slot), skips, levels]);
  if (key === rangesKey && flowHistory) return;
  rangesKey = key;
  const file = tail.length ? appendPeriods(baseHistory, tail) : baseHistory;
  const settings = rangesFor(state.doc, source);
  flowHistory = new HistoryRanges(file, { ...settings, recorded: new Set(skips), levels });
  history = new HistoryRanges(file, { ...settings, skip: incidentDays(), recorded: new Set(skips), levels });
  // claim/1 is told from these ranges, so it is told again; claim/2 is what each run was given, told before it from its
  // load's measures (claimsForRun), and is kept: a remedy staged later judges its day by the same claim.
  if (!generalForm()) claims.clear();
  storyCache.clear();
  alerts = null;
  backtests.clear();
}

/**
 * What the flow's story says of each watched source's day (ADR 0009 §3): the claims a run is given, told from the
 * history the engine pinned. None for a day the history doesn't have, or a watch of another file: the run holds that
 * source as not judged, and a person decides. Under plan/2 the claim is claim/2, told before the run from the load's own
 * measures (`claimsForRun`), and kept here.
 */
const claims = new Map<string, Claim | null>();
function claimsFor(day: string | undefined): Claim[] | undefined {
  const watch = state.doc.publish?.watch;
  if (!watch) return undefined;
  const out: Claim[] = [];
  for (const [source, w] of Object.entries(watch)) {
    if (!day || !flowHistory || !historyPin || historyPin.path !== watchHistory(w)) continue;
    const key = `${day}|${source}|${countedChecks(state.doc, flowHistory, source)}`;
    if (!claims.has(key) && !generalForm()) claims.set(key, dayClaim(flowHistory, state.doc, historyPin, day, source, BUILD_COMMIT));
    const c = claims.get(key);
    if (c) out.push(c);
  }
  return out;
}
/** Whether the flow says how its source is judged (ADR 0010 §11): its plan is plan/2, and its claims claim/2. */
const generalForm = (): boolean => planKindCache.doc === state.doc ? planKindCache.v2 : false;
const planKindCache = { doc: null as FlowDocument | null, v2: false };
/** The measures of the load a run is about to read, for the run's record (ADR 0010 §6). */
let measuring: Measures[] = [];

/**
 * The claims a run is given (ADR 0009 §3, ADR 0010 §6): claim/1 from the history, as `claimsFor` tells them; under plan/2,
 * claim/2 for each watched source, told from its base, its tail before the day and the load's own measures, which the
 * plugin measures in the engine first; its tail pinned beside its base, as the claim names it.
 */
async function claimsForRun(engine: Engine, day: string | undefined, parameters: Record<string, string>): Promise<{ claims: Claim[]; tell: Record<string, TellFor> } | undefined> {
  measuring = [];
  const plan = await translate(state.doc, parameters);
  planKindCache.doc = state.doc;
  planKindCache.v2 = !!plan.publish && isPublish2(plan.publish);
  if (!planKindCache.v2) {
    const c = claimsFor(day);
    return c ? { claims: c, tell: {} } : undefined;
  }
  const out: Claim[] = [];
  const tell: Record<string, TellFor> = {};
  for (const [source, w] of Object.entries(state.doc.publish?.watch ?? {})) {
    const node = plan.nodes.findIndex((n) => n.origin === source);
    if (!day || node < 0) continue;
    const known = bases.get(source);
    const base = known?.file ?? (source === loadSource() ? baseHistory : null);
    const pin = known?.ref ?? (source === loadSource() ? historyPin : null);
    const ref = base && pin && pin.path === watchHistory(w) ? pin : null;
    if (plan.nodes[node]!.op !== 'table') {
      // A watched step (ADR 0013 §4): its load is the dataset the run builds, so the engine tells its claim, from the
      // history and tail pinned under the watch's names and what the record says; its tail is pinned here.
      const tail = tailBefore(tails.get(source) ?? [], day);
      await pinFile(engine, tailPath(source), tail.length ? utf8(canonicalJSON(tail as unknown as Parameters<typeof canonicalJSON>[0])) : null);
      // The step's sample with the days run here appended (ADR 0014 §5), pinned again, so the engine's reference is current.
      const sample = samples.get(source);
      if (sample) await pinFile(engine, samplePath(source), utf8(JSON.stringify(sample)));
      tell[source] = { skip: recordedSkips(), levels: levelsOf(ledger?.entries ?? [], source) };
      continue;
    }
    const b = bindingOf(source);
    if (!b) continue;
    const settings = settingsFor(plan, node, ref ? base : null, state.doc.steps);
    if (!settings) continue;
    const m = await measureLoad(engine, b.table, settings);
    measuring.push(m);
    // The load's kept rows (ADR 0014 §5), where the node keeps a sample: the classifier's today, told with the claim.
    let kept: unknown[][] | undefined;
    if (samples.has(source)) {
      kept = (await sampleLoad(engine, b.table, { keep: SAMPLE_KEEP, strata: settings.counted })).rows;
      const mine = keptRows.get(source) ?? new Map<string, unknown[][]>();
      mine.set(day, kept);
      keptRows.set(source, mine);
    }
    const told = await loadClaim({ doc: state.doc, source, flow: plan.flow.hash, base: ref ? base : null, baseRef: ref, tail: tails.get(source) ?? [], measures: m, settings, skip: recordedSkips(), levels: levelsOf(ledger?.entries ?? [], source), build: BUILD_COMMIT, ...(kept && samples.get(source) ? { sample: samples.get(source)!, kept } : {}) });
    await pinFile(engine, tailPath(source), told?.tail.length ? utf8(canonicalJSON(told.tail as unknown as Parameters<typeof canonicalJSON>[0])) : null);
    const key = `${day}|${source}|${flowHistory ? countedChecks(state.doc, flowHistory, source) : false}`;
    claims.set(key, told?.claim ?? null);
    if (told) out.push(told.claim);
  }
  return { claims: out, tell };
}

/** Whether the person may read the history: the trips source is open to them. */
/** Whether the watched source is open to the viewer (or the flow watches none): what names its columns, values and
 * counts may be said to them (round 3, #6). */
function sourceOpen(): boolean {
  const src = loadSource();
  return !src || visible(src);
}

function historyOpen(): boolean {
  const src = loadSource();
  return !!history && !!src && visible(src);
}

/**
 * Whether the trips' checks are still the ones the history counted: the same rules, reading the trips themselves (a
 * box put in front of them would leave them other rows to count).
 */
function checksAsCounted(): boolean {
  return !!history && countedChecks(state.doc, history, loadSource());
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
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Dec 18". */
const shortDay = (day: string) => dateOf(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct0 = (x: number) => `${Math.round(x * 100)}%`;
/** What the loads strip's marks and lines mean, only those it draws: wrong, unusual, held ‖, as is ⚑, a new level, filled
 * ◧, part only ◐, not published ✕, a holiday, a day of a holiday's season, a day not run. */
function keyOf(chips: readonly HTMLElement[], list: readonly number[], notRun: (k: number) => boolean): HTMLElement | '' {
  const drawn = new Set(chips.flatMap((c) => Array.from(c.querySelectorAll('.ld-marks svg.g'), (g) => Array.from(g.classList).find((x) => x.startsWith('g-'))?.slice(2) ?? '')));
  const words: [VizMark, string][] = [['alert', 'wrong'], ['warn', 'unusual'], ['held', 'paused'], ['flag', 'as is'], ['level', 'new level'], ['fill', 'filled'], ['part', 'part only'], ['closed', 'not published']];
  const marks = words.filter(([m]) => drawn.has(m)).map(([m, w]) => h('span', { class: 'lk' }, glyphEl(m, 13), w));
  const day = (k: number) => loads.list[k]!;
  const holiday = list.some((k) => holidayOf(day(k).day, calendarNow()));
  const season = list.some((k) => !holidayOf(day(k).day, calendarNow()) && !!day(k).note);
  const items = [...marks, ...(holiday ? [h('span', { class: 'lk' }, h('i', { class: 'lk-hol' }), 'holiday')] : []), ...(season ? [h('span', { class: 'lk' }, h('i', { class: 'lk-hol season' }), 'holiday season')] : []), ...(list.some(notRun) ? [h('span', { class: 'lk' }, h('i', { class: 'lk-notrun' }), 'not run')] : [])];
  return items.length ? h('p', { class: 'loads-key' }, ...items) : '';
}

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
function bandChart(ranges: NormalRanges, days: readonly string[], focus: string, fmt: (v: number) => string, pick: (day: string) => void, limit?: number, today?: string, focusSev?: 'alert' | 'warn'): SVGSVGElement | null {
  const [W, H, L, R, T, B] = [340, 172, 38, 6, 8, 26];
  // A day after the one on screen has its band (made from the days before it) but no value: it hasn't arrived.
  const pts = days.map((d) => ({ d, v: today && d > today ? null : ranges.value(d), r: ranges.at(d) }));
  const all = [...pts.flatMap((p) => [p.v, p.r?.low, p.r?.high]), limit].filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!all.length) return null;
  let [lo, hi] = [Math.min(...all), Math.max(...all)];
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.05 || 1;
  // A count starts at zero (ADR 0008 §7): on a floor above it, a day of a third of its trips (Thu Sep 21, 2023: 41,939)
  // sits on the plot's edge and reads as none. A share or a level is zoomed to where its days are, and says so with a
  // break on its axis when its floor isn't zero.
  lo = ranges.scale === 'count' ? 0 : ranges.scale === 'level' ? lo - pad : Math.max(0, lo - pad);
  hi += pad;
  const step = (W - L - R) / pts.length;
  const X = (i: number) => L + (i + 0.5) * step;
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const out = pts.filter((p) => p.v !== null && p.r && ranges.place(p.r, p.v) !== 'within');
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bandchart', role: 'img', 'aria-label': `${shortDay(days[0]!)} to ${shortDay(days.at(-1)!)}, each day's number against its normal range: ${out.length ? `${plural(out.length, 'day')} outside it, ${listed(out.map((p) => shortDay(p.d)))}` : 'every day with one within it'}` }) as SVGSVGElement;
  for (const t of niceTicks(lo, hi, 4)) {
    svg.append(s('line', { class: 'grid', x1: L, x2: W - R, y1: Y(t).toFixed(1), y2: Y(t).toFixed(1) }), s('text', { class: 'tick', x: L - 4, y: (Y(t) + 3).toFixed(1), 'text-anchor': 'end' }, fmt(t)));
  }
  // A zoomed share: a break at the foot of its axis, so its floor can't read as zero.
  if (ranges.scale === 'share' && lo > 0) svg.append(s('path', { class: 'axis-brk', d: `M${L - 6} ${H - B - 1}l4 -3 4 3M${L - 6} ${H - B - 5}l4 -3 4 3` }));
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
    if (holidayOf(p.d, calendarNow())) svg.append(s('rect', { class: 'hol', x: (X(i) - step * 0.4).toFixed(1), y: H - B + 2, width: (step * 0.8).toFixed(1), height: 3 }));
    else if (seasonOf(p.d, calendarNow())) svg.append(s('rect', { class: 'hol season', x: (X(i) - step * 0.4).toFixed(1), y: H - B + 2.5, width: (step * 0.8).toFixed(1), height: 2 }));
  });
  // The checks' limit, drawn where it applies: the line a share past it crosses.
  if (limit !== undefined) svg.append(s('line', { class: 'limit-line', x1: L, x2: W - R, y1: Y(limit).toFixed(1), y2: Y(limit).toFixed(1) }), s('text', { class: 'tick limit-t', x: W - R, y: (Y(limit) - 3).toFixed(1), 'text-anchor': 'end' }, `limit ${fmt(limit)}`));
  pts.forEach((p, i) => {
    if (p.v === null) return;
    const off = p.r ? ranges.place(p.r, p.v) !== 'within' : false;
    svg.append(s('circle', { class: ['pt', off ? 'out' : '', p.r ? '' : 'bare', p.d === focus ? 'focus' : '', p.d === focus && off && focusSev ? `v-${focusSev}` : ''].filter(Boolean).join(' '), cx: X(i).toFixed(1), cy: Y(p.v).toFixed(1), r: p.d === focus ? 4.5 : off ? 3.2 : 2.3 }));
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
  const what = (x: number) => (m.of === 'trips' ? `${fmt(x)} ${NEWS_NAMES.noun(x)}` : m.of === 'dropped' ? `${fmt(x)} of its ${NEWS_NAMES.noun()} dropped by the checks` : `${label?.replace(/^In the news: /, '') ?? 'It'}: ${fmt(x)}`);
  const note = holidayOf(day, calendarNow()) ?? seasonOf(day, calendarNow());
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
    `${fmt(r.low)} to ${fmt(r.high)}, around ${fmt(r.expected)}${r.guesses.length > 1 ? ', from two guesses' : r.special ? (holidayOf(day, calendarNow()) ? ', from last year’s holiday alone' : `, from last year’s alone: ${seasonPhrase(r.special)}`) : ''}.`));
  const share = (g: NormalRange['guesses'][number]) => (r.guesses.length > 1 ? ` It counts ${pct0(g.weight)}${g.miss !== null ? `: it missed by ${missText(r.scale, g.miss, fmt)} on a typical day of the six weeks before` : ''}.` : '');
  const items = r.guesses.map((g) => {
    if (g.by === 'weeks') return h('li', {}, h('b', {}, fmt(g.value)), ` from ${patternNow() === 'weekly' ? 'the same weekday in the weeks before' : patternNow() === 'monthly' ? 'the same day of the months before' : 'the days before'}: the weighted median of ${listed(g.from.map((f) => shortDay(f.day)))}, the latest counting ${pct0(g.from[0]!.weight)}.${share(g)}`);
    const f = g.from[0]!;
    const fNote = holidayOf(f.day, calendarNow()) ?? seasonOf(f.day, calendarNow());
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
    if (rows.length) box.append(h('p', { class: 'foot' }, `Each rule’s share of the ${NEWS_NAMES.noun()} it fails, against its own normal range:`), h('ul', { class: 'rule-ranges' }, ...rows));
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

/** The paused day opened on the Runs view's ribbon. */
let ribbonPick: string | null = null;

/** Every day the flow on screen held, in this visit or an earlier one, with what became of it. */
function pausedDays(): { day: string; state: DayState }[] {
  const flow = flowOnScreen();
  const days = new Set<string>();
  for (const r of state.runs) {
    const d = dayOfRun(r);
    if (d && pauseOf(r)) days.add(d);
  }
  for (const p of pauses()) if (p.day && flow && p.inputs.flow === flow) days.add(p.day);
  return [...days].map((day) => ({ day, state: dayPause(day) })).filter((x): x is { day: string; state: DayState } => x.state !== null);
}

/**
 * The record of decisions (ADR 0009 §12): the Runs view opens on a ribbon of the paused days, by month, each its date
 * and its mark; a tap opens its card.
 */
function renderRibbon(): void {
  const box = document.getElementById('paused-days');
  if (!box) return;
  const days = pausedDays();
  box.hidden = !days.length;
  if (!days.length) return void box.replaceChildren();
  if (ribbonPick && !days.some((d) => d.day === ribbonPick)) ribbonPick = null;
  // The days still waiting apart from the days decided (round 3, #20): "Paused days" over days already decided read as
  // still paused.
  const ribbon = (head: string, xs: typeof days) => xs.length ? [
    h('p', { class: 'eyebrow' }, head),
    h('div', { class: 'ribbon', role: 'group', 'aria-label': `${head}: tap one for its decision` }, ...ribbonOf(xs).map((g) => h('div', { class: 'rb-month' },
      h('span', { class: 'rb-m' }, g.month),
      ...g.days.map((d) => h('button', { type: 'button', class: `rb-day ${d.state}`, 'aria-pressed': String(ribbonPick === d.day), 'aria-label': `${dayMid(d.day)}: ${PAUSE_PILL[d.state]}`, onclick: () => ((ribbonPick = ribbonPick === d.day ? null : d.day), renderRibbon()) },
        h('span', { class: 'rb-date' }, d.date), glyphEl(PAUSE_MARK[d.state], 14)))))),
  ] : [];
  box.replaceChildren(
    ...ribbon('Paused, waiting', days.filter((d) => d.state === 'waiting')),
    ...ribbon('Paused, decided', days.filter((d) => d.state !== 'waiting')),
    ribbonPick ? decidedCard(ribbonPick) : '');
}

/**
 * A paused day's card on the Runs view: its head and mark, its rows drawn small, who decided how long after it was held
 * and why, and where it is in the record; its hashes one tap further. A day still waiting says how long, and opens the
 * day to decide it.
 */
function decidedCard(day: string): HTMLElement {
  const st = dayPause(day) ?? 'waiting';
  const run = state.runs.find((x) => dayOfRun(x) === day);
  const p = (run ? pauseByInputs(run.inputs) : null) ?? latestPause(day);
  const d = p?.decision ?? null;
  const opened = p ? ledger?.entries[p.opened] : undefined;
  const underDay = d?.about.under !== undefined ? (ledger?.entries[d.about.under]?.about as { day?: string } | undefined)?.day : undefined;
  const minutes = opened ? ((d ? Date.parse(d.at) : Date.now()) - Date.parse(opened.at)) / 60000 : null;
  const decide = d ? ledger?.entries[d.seq] : undefined;
  // The release that applies the decision in this engine: the latest (after a reload the same decision is applied again).
  const released = d ? [...(ledger?.entries ?? [])].reverse().find((e) => e.kind === 'release' && (e.about as { decision?: number }).decision === d.seq && (e.about as { outcome?: string }).outcome === 'applied') : undefined;
  const ra = released?.about as { manifest?: string; run?: unknown } | undefined;
  const l = decidedLines({ day, state: st, who: d ? personName(d.by) : null, minutes, reason: d?.reason ?? null, run: ra ? runNameOf(ra.manifest, ra.run) : run ? runName(run) : p ? runNameOf(p.manifest, p.run) : null, seq: d?.seq ?? null, release: released?.seq ?? null, under: underDay ? dayShort(underDay).split(' ')[0]! : null, remedy: st === 'fill' || st === 'complete' ? remedyOf(p) : null });
  // The day's own rows, small, as the decision sheet draws them, with the trips past its checks: only to someone who reads
  // every row of the source (round 3, #6: "41,939 trips" reached Ben, to whom the trips are closed).
  const k = history ? history.file.days.indexOf(day) : -1;
  const src = loadSource();
  const rows = src && !rowsOpen(src) ? null : (tripsOf(run) ?? (k >= 0 ? history!.file.rows[k]! : null));
  const kept = run ? tripsKept(run) : undefined;
  const story = history && historyOpen() && k >= 0 ? storyFor(day) : null;
  const draw = rows !== null ? decisionDrawing(history, story, day, null, { day: rows, readers: null }) : null;
  const at = loads.list.findIndex((x) => x.day === day);
  const hashes = h('div', { class: 'rb-hashes', hidden: true },
    p ? h('p', { class: 'rec-root' }, 'Manifest: ', hash4(p.manifest, 'manifest hash')) : '',
    decide ? h('p', { class: 'rec-root' }, `Decision #${decide.seq}: `, hash4(entryLeaf(decide), 'decision’s record leaf')) : '',
    released ? h('p', { class: 'rec-root' }, `Release #${released.seq}: `, hash4(entryLeaf(released), 'release’s record leaf')) : '');
  return h('div', { class: 'rb-card' },
    h('h3', { class: 'rb-head' }, glyphEl(PAUSE_MARK[st], 16), l.head),
    draw ? svgNode(decisionRow({ mark: null, label: rowsSaid(rows!), number: kept !== undefined && kept !== rows ? `${fmtInt(kept)} after checks` : '', cause: draw.cause, rows: draw.asis, usual: draw.usual, short: draw.short, scale: draw.scale, part: draw.part, ticks: draw.ticks, cut: draw.cut, missing: draw.cause === 'hours' ? (story?.hoursLabels?.missing ?? null) : null, aria: `${dayMid(day)}: ${rowsSaid(rows!)}${kept !== undefined && kept !== rows ? `, ${fmtInt(kept)} past its checks` : ''}${story ? `, ${story.head}` : ''}` })) : '',
    l.who ? h('p', { class: 'rb-who' }, l.who) : '',
    l.where ? h('button', { type: 'button', class: 'linkish rb-where', 'aria-expanded': 'false', onclick: (e: Event) => { hashes.hidden = !hashes.hidden; (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!hashes.hidden)); } }, l.where) : '',
    hashes,
    st === 'fill' || st === 'complete' || (st === 'dont' && p?.withdrawn !== null && p?.withdrawn !== undefined) ? h('button', { type: 'button', class: 'linkish vf-versions', onclick: () => versionsSheet(day) }, 'Versions ›') : '',
    st === 'waiting' && at >= 0 && mayRun() ? h('button', { type: 'button', class: 'btn small', onclick: () => { location.hash = '#flow'; void useLoad(at); } }, `Open ${dayShort(day)} ›`) : '');
}

function renderRuns(): void {
  renderRecord();
  renderRibbon();
  const list = $('runs-list');
  if (state.runs.length === 0) {
    list.replaceChildren(h('li', { class: 'panel' }, h('p', { class: 'foot' }, state.failed ? state.failed.message : 'The first run starts as soon as the data is loaded.')));
    return;
  }
  const owner = isOwner();
  const card = (r: RunRecord, i: number) => {
    const m = r.result.manifest;
    // Anyone but the owner sees the run as far as they can see the flow: no steps closed to them, no full record.
    const nodes = m.nodes.filter((n) => owner || visible(n.origin));
    const count = (status: string) => nodes.filter((n) => n.status === status).length;
    const badge = runBadge(r);
    const li = h('li', { class: 'panel run-card' });
    // The run before it in time (further down the list), to say only the files that changed since.
    const before = state.runs[i + 1];
    const body = h('details', { class: 'run-body', ...(i === 0 ? { open: true } : {}) }, h('summary', {}, 'Its manifest, files and checks'),
      h('p', { class: 'rec-root' }, 'Manifest: ', hash4(r.result.hash, 'manifest hash')),
      runFiles(r, i === 0 ? undefined : before) ?? '',
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => void verify(r, 'rerun') }, 'Verify'),
        h('button', { class: 'btn quiet', type: 'button', onclick: () => void verify(r, 'rederive') }, 'Re-derive from the files'),
        owner ? h('button', { class: 'btn quiet', type: 'button', onclick: () => void sign(r) }, r.signed ? 'Signed' : 'Sign') : null));
    li.append(
      h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, `Run ${runName(r)}`), r.load !== undefined && loads.list[r.load] ? h('span', { class: 'pill load-pill' }, dayLabel(loads.list[r.load]!.day)) : null, badge ? h('span', { class: `pill${badge.mark ? ' held-pill' : ''}` }, badge.mark ? glyphEl(badge.mark, 13) : '', badge.text) : null, h('span', { class: 'pill' }, `${count('built')} built`), h('span', { class: 'pill' }, `${count('reused')} reused`), h('span', { class: 'pill', title: 'Steps worked out inside the ones that read them, with no copy of their own' }, `${count('folded')} not stored`), h('span', { class: 'foot num' }, `${fmtMs(r.ms)} · ${r.at.toLocaleTimeString()}`)),
      body,
    );
    if (r.verified) {
      const checks = checksFor(r).checks;
      const failed = checks.filter((c) => !c.ok);
      body.append(
        levelPills(r),
        h('div', { class: 'row' }, h('span', { class: `pill ${r.verified.ok ? 'ok' : 'bad'}` }, r.verified.ok ? 'verified' : 'verification failed'), h('span', { class: 'foot' }, `${checks.length} checks: ${LEVEL_SAYS[r.verified.level]}`)),
        h('ul', { class: 'checks' }, ...(failed.length ? failed : checks).slice(0, 12).map((c) => h('li', {}, h('span', { class: c.ok ? 'ok' : 'bad' }, c.ok ? 'ok' : 'failed'), h('span', {}, `${c.origin} · ${c.check}${c.note ? ` · ${c.note}` : ''}`)))),
      );
    }
    if (r.signed && owner) body.append(h('div', { class: 'row' }, h('span', { class: `pill ${r.signatureOk ? 'ok' : 'bad'}` }, r.signatureOk ? 'signature valid' : 'signature invalid'), h('span', { class: 'hash' }, `${r.signed.signer.name} · ${short(r.signed.signer.fingerprint)}`)));
    if (owner) body.append(h('details', {}, h('summary', {}, 'The manifest'), h('pre', { class: 'code' }, JSON.stringify(JSON.parse(canonicalJSON(m)), null, 2))));
    return li;
  };
  // Runs that built nothing and only repeat another of the same inputs fold into one line, one after another with the
  // same relation ("Runs #20–#22 · same as run #19, nothing built", "Runs #14–#18 · held, replaced by run #19"); a tap
  // opens them. The run that stands for a held day, and the newest run, are never folded.
  const quiet = (x: RunRecord) => x.result.manifest.nodes.filter((n) => owner || visible(n.origin)).every((n) => n.status !== 'built');
  const rel = (x: RunRecord, i: number): string | null => {
    if (i === 0 || !quiet(x)) return null;
    const b = runBadge(x);
    if (b) return b.mark ? null : b.text;
    const older = state.runs.slice(i + 1).find((y) => y.inputs === x.inputs);
    return older ? `same as run ${runName(older)}` : null;
  };
  const items: HTMLElement[] = [];
  for (let i = 0; i < state.runs.length; ) {
    const said = rel(state.runs[i]!, i);
    let j = i + 1;
    while (said && j < state.runs.length && rel(state.runs[j]!, j) === said) j++;
    if (!said) {
      items.push(card(state.runs[i]!, i));
      i++;
      continue;
    }
    const box = h('ul', { class: 'runs folded', hidden: true }, ...state.runs.slice(i, j).map((x, k) => card(x, i + k)));
    const names = j - i === 1 ? `Run ${runName(state.runs[i]!)}` : `Runs ${runName(state.runs[j - 1]!)}–${runName(state.runs[i]!)}`;
    const btn = h('button', { type: 'button', class: 'run-fold', 'aria-expanded': 'false', onclick: () => { box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden)); } },
      h('span', {}, `${names} · ${said}${said.startsWith('same') ? ', nothing built' : ''}`), glyphEl('chev', 13));
    items.push(h('li', { class: 'run-folds' }, btn, box));
    i = j;
  }
  list.replaceChildren(...items);
}

/** A held run in the run list (ADR 0009 §12): waiting for a decision (built, not published), then what became of it. */
const PAUSE_PILL: Record<DayState, string> = { waiting: 'waiting', asis: 'published as is', dont: 'not published', fill: 'filled', complete: 'part only', accepted: 'new level' };

/** The record's run entries by manifest, read again as the record grows. */
const runSeqCache = { size: -1, byManifest: new Map<string, number>() };
function runSeqOf(manifest: string | undefined): number | undefined {
  const entries = ledger?.entries ?? [];
  if (runSeqCache.size !== entries.length) {
    runSeqCache.byManifest = new Map();
    for (const e of entries) {
      const m = (e.about as { manifest?: unknown } | null)?.manifest;
      if (e.kind === 'run' && typeof m === 'string' && !runSeqCache.byManifest.has(m)) runSeqCache.byManifest.set(m, e.seq);
    }
    runSeqCache.size = entries.length;
  }
  return manifest ? runSeqCache.byManifest.get(manifest) : undefined;
}

/**
 * A run as the screens name it (ADR 0009 §12): by the record's entry that recorded it ("#13"), a number that keeps
 * rising across visits, where the engine's own run numbers start again at 1 after a reload; the engine's number while
 * the record has no entry for it.
 */
const runNameOf = (manifest: string | undefined, run: unknown): string => {
  const seq = runSeqOf(manifest);
  return seq !== undefined ? `#${seq}` : String(run ?? '?');
};
const runName = (r: RunRecord): string => runNameOf(r.result.hash, r.result.run);

/**
 * What a held run is among the runs of its day (ADR 0009 §12): the one that stands for the day carries what became of
 * it (the run released, "published as is · decision #20"; the run a decision not to publish names; else the newest,
 * staged); a run before it was held and replaced by it, one after it made the same versions again. One pause, one run
 * that counts.
 */
function runBadge(r: RunRecord): { mark: VizMark | null; text: string } | null {
  const now = pauseOf(r);
  if (!now) return null;
  const same = state.runs.filter((x) => x.inputs === r.inputs && x.result.holds.length);
  const d = now.pause?.decision ?? null;
  const stands = (now.state === 'asis' ? same.find((x) => x.release?.outcome === 'applied') : now.state === 'dont' || now.state === 'fill' || now.state === 'complete' ? same.find((x) => x.result.hash === d?.about.manifest) : undefined) ?? same[0]!;
  // A day closed under a standing decision is that decision's rule at work, named as the record's line names it ("by
  // #19's rule"), never by the entry that applied it.
  const by = d && now.state !== 'waiting' ? (d.about.under !== undefined ? ` · by #${d.about.under}’s rule` : ` · decision #${d.seq}`) : '';
  if (stands === r) return { mark: PAUSE_MARK[now.state], text: `${now.remedy ? remedyHead(now.remedy).replace(/^./, (c) => c.toLowerCase()) : PAUSE_PILL[now.state]}${by}` };
  // The run list is newest first: a run further down ran before.
  return { mark: null, text: state.runs.indexOf(r) > state.runs.indexOf(stands) ? `held, replaced by run ${runName(stands)}` : `same as run ${runName(stands)}` };
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

/** The files a run read, as the engine saw their bytes, and the data's list they came from; given the run before it,
 * only the files that changed since, the rest named in one line. */
function runFiles(r: RunRecord, before?: RunRecord): HTMLElement | null {
  const m = r.result.manifest;
  // Only the sources open to the viewer, a file's size and rows only where every row of it is theirs (round 3, #6).
  const seen = filesSeen(m.nodes, runSight());
  const all = seen.files;
  if (!all.length && !m.data) return null;
  const had = new Set(before ? filesSeen(before.result.manifest.nodes, runSight()).files.map((f) => `${f.origin}:${f.sha256}`) : []);
  const files = before ? all.filter((f) => !had.has(`${f.origin}:${f.sha256}`)) : all;
  const same = before ? all.filter((f) => had.has(`${f.origin}:${f.sha256}`)).map((f) => f.origin) : [];
  return h('div', { class: 'part' },
    h('p', { class: 'eyebrow' }, 'Read, by hash'),
    same.length ? h('p', { class: 'foot' }, `${same.join(', ')}: the same bytes as run ${runName(before!)}`) : null,
    h('ul', { class: 'chain' }, ...files.map((f) => h('li', {},
      h('p', { class: 'c-what' }, `${f.origin}: ${f.location.replace(PINNED_PREFIX_APP, '')}${f.bytes !== null ? `, ${fmtInt(f.bytes)} bytes` : ''}`),
      h('p', { class: 'c-line' }, 'sha256 ', hash4(f.sha256, `${f.origin} file hash`)),
      h('p', { class: 'c-line' }, `→ ${f.rows !== null ? `${fmtInt(f.rows)} rows, ` : ''}content ${short(f.content ?? '')}`)))),
    seen.left ? h('p', { class: 'foot' }, 'Closed parts left out.') : null,
    m.data ? h('p', { class: 'foot' }, `Checked against the data's list at commit ${m.data.commit.slice(0, 12)} (MANIFEST.json ${m.data.manifest.slice(0, 12)}…); built from smaltfl ${m.build?.smaltfl.slice(0, 12) ?? 'dev'}.`) : null);
}

/** A run's checks as the viewer may see them (round 3, #6, core/decision.ts checksSeen). */
const checksFor = (r: RunRecord) => checksSeen(r.verified?.checks ?? [], new Set([...r.result.manifest.nodes.map((n) => n.origin), ...Object.keys(r.result.manifest.outputs)]), runSight());
const PINNED_PREFIX_APP = 'smaltfl:';

async function verify(r: RunRecord, level: VerifyLevel = 'rerun'): Promise<void> {
  if (!state.engine) return;
  setStatus(`Verifying run ${runName(r)}${level === 'rederive' ? ', decoding its files again' : ''}…`);
  // A run re-derives from its own bytes: when another day is pinned now, the run's day is fetched, checked and pinned
  // again for it, and the day pinned now is put back after.
  const trips = r.result.manifest.nodes.find((n) => n.file?.location === `smaltfl:${loadFile()}`)?.file;
  const runDay = trips ? loads.list.findIndex((l) => l.sha256 === trips.sha256) : -1;
  const swap = level === 'rederive' && runDay >= 0 && runDay !== loads.pinned;
  try {
    if (swap) await pinFile(state.engine, loadFile(), loads.bytes.get(runDay) ?? (await checked(loads.list[runDay]!.file, { sha256: loads.list[runDay]!.sha256, bytes: loads.list[runDay]!.bytes ?? -1 })), loads.list[runDay]!.sha256);
    r.verified = await verifyRun(state.engine, r.result.run, { smaltdb: SMALTDB, level, manifest: r.result.hash });
    if (swap && loads.pinned >= 0) {
      const now = loads.list[loads.pinned]!;
      await pinFile(state.engine, loadFile(), loads.bytes.get(loads.pinned) ?? (await checked(now.file, { sha256: now.sha256, bytes: now.bytes ?? -1 })), now.sha256);
    }
    const failed = r.verified.checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`);
    if (ledger) await ledger.append('verify', state.viewer, { run: r.result.run, manifest: r.result.hash, level, ok: r.verified.ok, failed, smaltdb: SMALTDB });
    // What failed, as the viewer may see it: a closed part's failure is counted in the verdict, never named (round 3, #6).
    const named = checksFor(r).checks.filter((c) => !c.ok).map((c) => `${c.origin}:${c.check}`);
    setStatus(r.verified.ok ? `Run ${runName(r)} ${LEVEL_DONE[level]}.` : `Run ${runName(r)} failed verification${named.length ? `: ${named.slice(0, 3).join(', ')}` : ''}.`, !r.verified.ok);
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

/**
 * The Run button, for the viewer now (round 3, #7): off while a run is on, and for anyone who may not decide, whose
 * run would publish a day that passes under their name; its label then says who runs the flow.
 */
function syncRun(): void {
  const btn = $<HTMLButtonElement>('run');
  const may = mayRun();
  btn.disabled = state.running || !state.engine || !may;
  if (may) (btn.removeAttribute('title'), btn.setAttribute('aria-label', 'Run the flow'));
  else {
    btn.title = `${deciders()} runs this flow: a day that passes publishes`;
    btn.setAttribute('aria-label', `Run: ${deciders()} runs this flow`);
  }
}

async function run(): Promise<void> {
  const engine = state.engine;
  if (!engine || state.running) return;
  // Only someone who may decide runs the flow: a day that passes publishes, and the record names who ran it (round 3,
  // #7). Every control that runs is off for anyone else; this is the last stop.
  const may = checkRun(policies(), state.viewer);
  if (!may.allowed) {
    setStatus(`${may.reason.replace(/^./, (c) => c.toUpperCase())}.`, true);
    return;
  }
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
    const has = (name: string) => !!state.doc.parameters?.some((x) => x.name === name);
    const parameters: Record<string, string> = has('month') && loadDay ? { month: loadDay.slice(0, 7) } : {};
    // The day the trips are from: the period that orders the days a flow holds, and the day its claims name (ADR 0009).
    const period = periodOfFlow();
    if (period && has(period) && loadDay) parameters[period] = loadDay;
    refreshRanges();
    const asked = await claimsForRun(engine, loadDay, parameters);
    const told = asked?.claims;
    const data = integrity.data ? { commit: integrity.data.commit, manifest: integrity.data.manifest } : null;
    const result = await runFlow(engine, state.doc, { smaltdb: SMALTDB, parameters, data, log: recordHead(), ...(told ? { claims: told } : {}), ...(asked && Object.keys(asked.tell).length ? { tell: asked.tell } : {}) });
    const ms = performance.now() - t;
    // A held run returns, built, checked and recorded, its versions staged: only `published` names show it. A watched
    // step's claim, told in the engine, is kept from the hold it made (ADR 0013 §4).
    const engineTold = result.holds.flatMap((h) => (h.by === 'story' && h.claim && asked?.tell[h.origin] ? [h.claim] : []));
    const kept = [...(told ?? []), ...engineTold];
    const rec: RunRecord = { result, ms, at: new Date(), inputs: inputsKey(inputsOf(result.manifest)), ...(loads.pinned >= 0 && loads.list.length > 1 ? { load: loads.pinned } : {}), ...(kept.length ? { claims: kept } : {}) };
    state.runs.unshift(rec);
    // Each watched load's measures to its source's tail, the first time its slot runs (C5).
    for (const m of result.measures ?? []) addToTail(m);
    // Each load's kept rows to its node's sample (ADR 0014 §5): the sources' as the page kept them, the steps' as the
    // engine did.
    for (const m of result.measures ?? []) {
      const rows = keptRows.get(m.source)?.get(m.slot);
      if (rows) keepDay(m.source, m.slot, rows);
    }
    for (const [id, rows] of Object.entries(result.kept ?? {})) {
      const m = result.measures?.find((x) => x.source === id);
      if (m) keepDay(id, m.slot, rows);
    }
    noteShown(rec, result.published);
    // What is shown is what ran: after a refused day, a run on the day still pinned shows that day.
    if (loads.pinned >= 0) loads.at = loads.pinned;
    await recordRun(rec, null);
    // The day just measured (and the record's new days left out) in the ranges before anything is said or drawn of it:
    // a day past the base history has its story, its head and its News on its first run, not only on its second.
    refreshRanges();
    // A day decided before (in this visit, or an earlier one) is decided again by the same keys (ADR 0009 §10).
    if (result.holds.length) await applyDecided(rec);
    await learnColumns();
    void computeChanges();
    await refreshEdits();
    // The day's own rows by hour and value, before anything says the day: an hour fall names the part that kept arriving.
    const ranDay = dayOfRun(rec);
    if (ranDay) await byHourFor(ranDay);
    sayRun(rec);
  } catch (e) {
    const msg = message(e);
    state.failed = { origin: failedOrigin(msg), message: msg };
    sayFailed();
    await recordRun(null, msg);
  } finally {
    syncTitle();
    state.running = false;
    syncRun();
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
 * A run in the record: its manifest kept by hash, the files it read, the load, its day and its inputs; a held one
 * (ADR 0009 §9) with what held it, the outputs that wait, and the staged key of every output it held, which is what a
 * decision names; a failed one with why. Before it, the flow, when it changed since the record last saw it, whatever
 * changed it.
 */
async function recordRun(rec: RunRecord | null, error: string | null): Promise<void> {
  if (!ledger) return;
  const result = rec?.result ?? null;
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
      const typed = planRow ? (JSON.parse(String(planRow[0])) as FlowPlan) : null;
      const plan = typed ? await ledger.keep('plan', typed) : null;
      const files = result.manifest.nodes.filter((n) => n.file).map((n) => ({ source: n.origin, ...n.file! }));
      // Its day (the period's value) and its inputs find the day again after the engine is gone (ADR 0009 §10).
      const period = typed ? periodOfPlan(typed) : null;
      const value = period ? result.manifest.parameters[period] : undefined;
      const day = typeof value === 'string' ? value : load;
      const held = result.holds.length > 0;
      const keys = held && typed ? stagedKeys(result.manifest, heldOutputs(typed, result.holds)) : {};
      await ledger.append('run', state.viewer, {
        run: result.run, manifest: result.hash, blob, plan, load, outcome: held ? 'held' : 'ok', files: files as unknown as JSONValue, data: result.manifest.data ?? null,
        day, inputs: inputsOf(result.manifest) as unknown as JSONValue,
        ...(held ? { holds: result.holds as unknown as JSONValue, waiting: result.waiting, keys } : {}),
        // Its watched loads' measures (ADR 0010 §6): the tail is rebuilt from them when the page opens.
        ...(result.measures?.length ? { measures: result.measures as unknown as JSONValue } : {}),
        // The claims it was judged by, published or held: what `audit.mjs check --history` tells again (ADR 0010 §6).
        ...(rec?.claims?.length ? { claims: rec.claims as unknown as JSONValue } : {}),
      });
    } else await ledger.append('run', state.viewer, { run: null, load, outcome: 'failed', error });
  } catch (e) {
    console.warn(`smaltfl: couldn't record the run: ${message(e)}`);
  }
}

// ------------------------------------------------------------------ deciding a held day (ADR 0009 §5, §6, §10)

/** The outputs a held run holds back, with their staged keys: what a decision names (core/hold.ts stagedKeys). */
async function keysOf(r: RunRecord): Promise<Record<string, string>> {
  return stagedKeys(r.result.manifest, heldOutputs(await planFor(r), r.result.holds));
}

/** The day a run is of, by its plan's period: what a decision is about. */
async function periodDay(r: RunRecord): Promise<string | null> {
  const period = periodOfPlan(await planFor(r));
  const v = period ? r.result.manifest.parameters[period] : undefined;
  return typeof v === 'string' ? v : (dayOfRun(r) ?? null);
}

/** A day's newest run in this engine, when it was held: what a decision on the day applies to. */
const heldRunOf = (day: string): RunRecord | undefined => {
  const r = state.runs.find((x) => dayOfRun(x) === day);
  return r?.result.holds.length ? r : undefined;
};

/**
 * Publish a held run as a decision recorded first says (ADR 0009 §5, §9): the plugin checks it against the run and
 * the policies stored with it, then the record keeps what came of it, citing the decision by its leaf. A refusal is
 * kept too.
 */
async function release(r: RunRecord, decision: RecordEntry, keys: Record<string, string>, option: 'asis' | 'accept' = 'asis'): Promise<ReleaseResult | null> {
  if (!ledger || !state.engine) return null;
  const leaf = entryLeaf(decision);
  const out = await releaseRun(state.engine, { run: r.result.run, manifest: r.result.hash, keys, option, actor: decision.by.as, reason: decision.reason, decision: leaf });
  r.release = out;
  noteShown(r, out.published);
  const about: ReleaseAbout = { run: r.result.run, manifest: r.result.hash, outputs: keys, decision: decision.seq, leaf, outcome: out.outcome, why: out.why };
  await ledger.append('release', decision.by.as, about as unknown as JSONValue);
  return out;
}

/**
 * After a held run: a decision the record holds for the same inputs and keys is applied again (published as is: released
 * again, citing it; not published: nothing to do), which is how a decision outlives the engine (ADR 0009 §10). A
 * decision under another build is shown and applied only by a person, as an amendment. Undecided, a standing decision
 * not to publish until a day publishes closes the day, recorded as applied under it (§6).
 */
async function applyDecided(r: RunRecord): Promise<void> {
  if (!ledger || !r.result.waiting.length) return;
  try {
    const keys = await keysOf(r);
    const inputs = inputsOf(r.result.manifest);
    const found = decisionFor(ledger.entries, inputs, keys);
    if (found?.kind === 'same') {
      // Published as is, again: unless a later day is what readers see now (stepping back to a day decided before), as a
      // release never moves a name back (ADR 0009 §5; Q-51). A fill or the part alone is made again from its repair,
      // staged, and released again if it made the keys its decision names (amendment 1 S9).
      const day = await periodDay(r);
      const shown = readersDay(r);
      const later = !!(day && shown && shown > day);
      const o = found.decision.about.option;
      if ((o === 'asis' || o === 'accept') && !later) await release(r, ledger.entries[found.decision.seq]!, keys, o);
      if ((o === 'fill' || o === 'complete') && found.decision.about.repair && !later) await applyRemedy(r, found.decision);
      return;
    }
    if (found) return;
    const day = await periodDay(r);
    // A level accepted before it that still stands (Q-57b): the day's story off by nothing but the metrics it names, and
    // held by the story alone. Published under it, recorded as a decision under the Accept, unless a later day is current.
    const src = loadSource();
    const told = day && src ? flowStoryOf(day) : null;
    const lv = day && src && told?.state === 'wrong' ? levelFor(ledger.entries, src, day, (from) => levelWays(told, flowStoryOf(from) ?? undefined), (from) => { const then = flowStoryOf(from); return then ? levelWays(then) : new Map(); }, r.result.holds.every((x) => x.by === 'story')) : null;
    const shownNow = readersDay(r);
    if (lv && day && lv.about.level && !(shownNow && shownNow > day)) {
      const may = checkDecision(policies(), lv.by, 'accept');
      if (!may.allowed) return;
      const about: DecideAbout = { day, run: r.result.run, manifest: r.result.hash, inputs, outputs: keys, option: 'accept', scope: 'day', policies: await policiesHash(policies() ?? null), rule: may.rule ?? null, under: lv.seq, level: lv.about.level };
      const entry = await ledger.append('decide', lv.by, about as unknown as JSONValue, lv.reason);
      await release(r, entry, keys, 'accept');
      return;
    }
    const standing = day ? standingFor(ledger.entries, day, periodOfPlan(await planFor(r))) : null;
    if (!standing || !day) return;
    // A fill (or the part alone) that stands until a day passes (Q-64): this day filled by the same rule and direction,
    // from its own good day, decided under it and released, if its staged run passes; else it waits for a person.
    if (standing.about.option === 'fill' || standing.about.option === 'complete') {
      await applyStanding(r, standing, day, keys, inputs);
      return;
    }
    const may = checkDecision(policies(), standing.by, 'dont');
    if (!may.allowed) return;
    const about: DecideAbout = { day, run: r.result.run, manifest: r.result.hash, inputs, outputs: keys, option: 'dont', scope: 'day', policies: await policiesHash(policies() ?? null), rule: may.rule ?? null, under: standing.seq };
    await ledger.append('decide', standing.by, about as unknown as JSONValue, standing.reason);
  } catch (e) {
    console.warn(`smaltfl: couldn't apply the day's decision again: ${message(e)}`);
  }
}

/**
 * Decide a held day (ADR 0009 §5, §6), given its held run here or, for a day held in an earlier visit, its day.
 * Checked here first, so the page asks nothing the plugin would refuse; the day's held run must be in the engine
 * (after a reload it is run again, and the decision stops if that run made other keys than the pause names); the
 * decision is appended to the record; then, to publish as is, the release follows, its outcome recorded. Publish as
 * is covers this day only (Q-50), and a run with no day (a flow without daily loads) is decided for itself alone.
 */
async function decide(target: RunRecord | string, option: DecisionOption, scope: 'day' | 'untilPass', reason: string | null, remedy: Remedy = {}): Promise<RecordEntry | null> {
  if (!ledger || !state.engine || state.running) return null;
  // One decision at a time: a second, taken while the first's release is on its way, would amend a decision the engine
  // is about to apply, and the record would cite one that no longer stands.
  if (state.deciding) {
    setStatus('A decision is on its way: wait for it to be applied.', true);
    return null;
  }
  state.deciding = true;
  try {
    return await decideNow(target, option, scope, reason, remedy);
  } finally {
    state.deciding = false;
  }
}

/** What a decision by a remedy carries (amendment 1 S9): the staged derived run whose versions go out (a fill, or the
 * part alone), or that it withdraws the fill readers have (Q-61). */
interface Remedy {
  derived?: RunRecord;
  withdraw?: boolean;
}

async function decideNow(target: RunRecord | string, option: DecisionOption, scope: 'day' | 'untilPass', reason: string | null, remedy: Remedy = {}): Promise<RecordEntry | null> {
  if (!ledger || !state.engine) return null;
  const may = checkDecision(policies(), state.viewer, option);
  if (!may.allowed) {
    setStatus(`${may.reason.replace(/^./, (c) => c.toUpperCase())}.`, true);
    return null;
  }
  if ((option === 'asis' || option === 'accept') && !reason?.trim()) {
    setStatus(option === 'accept' ? 'Accepting a new level needs a reason.' : 'Publishing a held day as is needs a reason.', true);
    return null;
  }
  let r = typeof target === 'string' ? heldRunOf(target) : (target.derived?.from ?? target);
  if (!r && typeof target === 'string') {
    // The engine lost the day (a reload, or another flow ran it since): run it again, and decide on that run, if it
    // made the keys the day's pause names.
    const before = latestPause(target);
    const k = loads.list.findIndex((l) => l.day === target);
    if (k < 0) {
      setStatus(`${dayMid(target)} isn't one of the loads here: it can't be run again to decide it.`, true);
      return null;
    }
    await useLoad(k);
    r = heldRunOf(target);
    if (!r) return null;
    if (before && before.key === r.inputs && !sameKeys(before.keys, await keysOf(r))) {
      setStatus(`${dayMid(target)} ran again with other keys than its pause names, under another build: decide it from this run.`, true);
      return null;
    }
  }
  if (!r) return null;
  // Readers have a day published as is: no decision takes it back.
  if (pauseOf(r)?.state === 'asis' || pauseOf(r)?.state === 'accepted') {
    setStatus(`${dayOfRun(r) ? dayMid(dayOfRun(r)!) : 'This run'} is published as is: readers have it, and no decision takes it back.`, true);
    return null;
  }
  const day = await periodDay(r);
  const keys = await keysOf(r);
  const p = pauseByInputs(r.inputs);
  // A standing decision needs a day to stand until: a run with none is decided for itself, and so is a day readers have
  // a later day for already (one passed: it would stand already ended), as the sheet offers it.
  const shown = readersDay(r);
  const passed = !!day && !!shown && shown > day;
  // A remedy names its repair and the derived run whose versions go out (amendment 1 S9); a withdrawal is a decision not
  // to publish, amending the fill's, for this day alone (Q-61).
  const derived = option === 'fill' || option === 'complete' ? remedy.derived : undefined;
  if ((option === 'fill' || option === 'complete') && (!derived?.derived || derived.derived.from.inputs !== r.inputs)) {
    setStatus(`${option === 'fill' ? 'A fill' : 'The part that arrived'} is decided on its staged run: pick it on the sheet again.`, true);
    return null;
  }
  const fillShown = remedy.withdraw ? (filledOf(r) ?? releasedFillOf(r)) : undefined;
  // With a later day current, a withdrawal moves no name back (ADR 0009 amendment 1 S5): it is recorded, the day is not
  // published, and readers keep the later day; nothing goes to the engine.
  const keepLater = !!remedy.withdraw && passed;
  if (remedy.withdraw && !keepLater && !fillShown?.derived?.release) {
    setStatus('The fill readers have wasn’t released in this engine: run its day again, then withdraw it.', true);
    return null;
  }
  const dkeys = derived ? derivedKeys(await planFor(derived), derived.result) : null;
  // Accept the new level records the level its cause moved (amendment 1 S6, C6), and covers later days by it, not by a
  // scope (Q-57b).
  const level = option === 'accept' ? acceptFor(r)?.level ?? null : null;
  if (option === 'accept' && !level) {
    setStatus(`${day ? dayMid(day) : 'This run'} can't be accepted as a new level: its cause isn't one.`, true);
    return null;
  }
  const about: DecideAbout = {
    day, run: r.result.run, manifest: r.result.hash, inputs: inputsOf(r.result.manifest), outputs: keys, option, scope: option === 'asis' || option === 'accept' || remedy.withdraw || !day || passed ? 'day' : scope, policies: await policiesHash(policies() ?? null), rule: may.rule ?? null,
    ...(derived && dkeys ? { repair: derived.derived!.repair, derived: { run: derived.result.run, manifest: derived.result.hash, keys: dkeys } } : {}),
    ...(level ? { level } : {}),
  };
  const entry = await ledger.append('decide', state.viewer, about as unknown as JSONValue, reason?.trim() || null, p?.decision?.seq ?? null);
  let refused: string | null = null;
  if (option === 'asis' || option === 'accept') {
    const out = await release(r, entry, keys, option);
    if (out?.outcome === 'refused') refused = out.why;
    // The band accepted is written into the ontology (ADR 0014 §3): the decision is recorded, the document edited from it.
    else if (option === 'accept' && level?.band && loadSource()) {
      if (applyBand(level.source, level.band)) {
        storyCache.clear();
        planKindCache.doc = null;
        setStatus(`The new band is in the ontology: ${NEWS_NAMES.column(level.band.column)} ${level.band.value} ${Math.round(level.band.share[0] * 100)}–${Math.round(level.band.share[1] * 100)}%. The next run records the change.`, false);
      }
    }
  } else if (derived && dkeys) {
    const out = await releaseDerived(derived, entry, dkeys);
    if (out?.outcome === 'refused') refused = out.why;
  } else if (fillShown && !keepLater) {
    const out = await withdrawFill(fillShown, entry);
    if (out?.outcome === 'refused') refused = out.why;
  } else if (fillShown && keepLater) fillShown.derived!.withdrawn = true;
  const now = pauseOf(r);
  if (refused) setStatus(`The decision is recorded; the engine refused to ${fillShown ? 'withdraw the fill of' : 'publish'} ${day ? dayShort(day) : 'the run'}: ${refused}.`, true, { n: attempts, state: now && !isOut(now.state) ? 'held' : 'done', mark: now?.state ?? null });
  else {
    // Decided from a later day (the day after an episode, or its sheet), the line keeps saying the day on screen.
    const shown = onScreen();
    sayRun(shown && dayOfRun(shown) !== dayOfRun(r) ? shown : r);
  }
  afterDecision();
  return entry;
}

// ------------------------------------------------------------------ filling a paused day (ADR 0009 amendment 1)

/** The period parameter a plan's days are by (plan/1's publish, or a plan/2 watch's own). */
const periodOfPlan = (plan: FlowPlan): string | null => planPeriod(plan.publish);
/** The flow's period parameter, as its document says it (a fill's day, a decision's). */
const periodOfFlow = (): string | null => periodOf(state.doc, loadSource() ?? '') ?? null;

/** A day's file as the data lists it, a load's or a donor's, checked against MANIFEST.json when the page opened: what a
 * fill may read (S3). */
function listedFile(day: string): HistoryRef | null {
  const l: Listed | undefined = loads.list.find((x) => x.day === day) ?? loads.donors.find((x) => x.day === day);
  return l && l.bytes !== undefined ? { path: l.file, sha256: l.sha256, bytes: l.bytes } : null;
}

/** The flow's verdict on a day, raw names, told from the pinned history (core/hold.ts flowStory): what a remedy is
 * worked out from. Null where it can't be told. */
function flowStoryOf(day: string): Story | null {
  const src = loadSource();
  if (!flowHistory || !src) return null;
  try {
    return flowStory(flowHistory, day, state.doc, src);
  } catch {
    return null;
  }
}

/**
 * Whether a held run's day may be accepted as a new level (amendment 1 S6), with the level it would record: by the
 * flow's verdict on the day (its cause and what it absorbed), the claim it was held on, and what holds it. Off while a
 * later day is current, as publish as is is. Null on a derived run, or where the day can't be accepted.
 */
function acceptFor(r: RunRecord): { offer: Offer; level: { source: string; from: string; metrics: string[]; band?: { column: string; value: string; share: [number, number] } } } | null {
  const day = dayOfRun(r);
  const src = loadSource();
  if (!day || !src || r.derived) return null;
  const story = flowStoryOf(day);
  if (!story) return null;
  const claim = claimsFor(day)?.find((c) => c.source === src) ?? null;
  const level = acceptedLevel(story, claim, r.result.holds, day, src);
  if (!level) return null;
  const shown = readersDay(r);
  const later = shown && shown > day ? shown : null;
  // A band missed (ADR 0014 §3): the Accept is of a new band, which the decision records and the ontology is edited from.
  const label = level.band ? `Accept the new band: ${Math.round(level.band.share[0] * 100)}–${Math.round(level.band.share[1] * 100)}%` : 'Accept the new level';
  return { offer: { option: 'accept', label, ...(later ? { off: `${dayShort(later)} is published` } : {}) }, level };
}

/**
 * The ontology edited from an accepted band (ADR 0014 §3): the property of the column, for this source, gets the band
 * as its expect entry for the value (a general entry stays for the other datasets). The document changes, so the
 * flow hash does: the next run records the change as any edit is recorded (`recordRun`).
 */
function applyBand(source: string, band: { column: string; value: string; share: [number, number] }): boolean {
  const o = state.doc.ontology;
  if (!o) return false;
  const props = o.properties ?? [];
  const own = propertyOf(o, source, band.column);
  if (!own) return false;
  const list = [...(own.expect ?? [])];
  const mine = list.findIndex((b) => b.value === band.value && (b.datasets ? b.datasets.some((d) => d.toLowerCase() === source.toLowerCase()) : false));
  const general = list.findIndex((b) => b.value === band.value && !b.datasets);
  if (mine >= 0) list[mine] = { ...list[mine]!, share: band.share };
  else if (general >= 0 && own.datasets?.some((d) => d.toLowerCase() === source.toLowerCase())) list[general] = { ...list[general]!, share: band.share };
  else list.push({ value: band.value, share: band.share, datasets: [source] });
  const edited = { ...own, expect: list };
  state.doc = { ...state.doc, ontology: { ...o, properties: props.map((p) => (p === own ? edited : p)) } };
  return true;
}

/**
 * What a held run's day gets besides publishing it as is or not (S5): a fill from the good days the data lists, the part
 * that arrived alone; none without a fill step, a missing part, a history pinned in the engine, or on a derived run.
 */
function remediesFor(r: RunRecord): Remedies | null {
  const day = dayOfRun(r);
  const src = loadSource();
  if (!day || !src || !flowHistory || !historyPin || r.derived) return null;
  const story = flowStoryOf(day);
  if (!story) return null;
  const claim = claimsFor(day)?.find((c) => c.source === src) ?? null;
  const now = pauseOf(r);
  const shown = readersDay(r);
  // A backfill donor is a day that has arrived and been judged here (S3): run in this visit or in the record.
  const arrived = (d: string) => state.runs.some((x) => dayOfRun(x) === d) || !!ledger?.entries.some((e) => e.kind === 'run' && (e.about as { day?: string } | null)?.day === d && ['ok', 'held'].includes(String((e.about as { outcome?: string }).outcome)));
  const rem = donorsOf({ h: flowHistory, doc: state.doc, day, source: src, story, claim, listed: listedFile, history: historyPin, build: BUILD_COMMIT, later: shown && shown > day ? shown : null, readers: now?.state === 'fill' || now?.state === 'complete' ? now.state : null, partFails: r.result.holds.some((x) => x.by === 'checks'), arrived, current: now?.state === 'fill' ? (now.remedy?.donor ?? null) : null });
  // The part alone is named as the viewer's story names its part ("Flex Fare only"), not by the raw code.
  const name = storyFor(day)?.split?.name;
  return rem ? { ...rem, offers: rem.offers.map((o) => (o.option === 'complete' ? { ...o, label: remedyPart(rem.missing, name) } : o)) } : null;
}

/** Each held run's staged remedies, by what they repair: picking an option again shows the run already made. */
const stagedRuns = new Map<string, RunRecord>();
// By the held run's inputs: the same day run again (stepping back to it) makes the same derived run, staged once.
const stagedKey = (r: RunRecord, repair: Repair) => `${r.inputs}|${repair.kind}|${repair.donor?.day ?? ''}`;
/** One staged run at a time, whoever asks: the donor's file is pinned under one name. */
let staging: Promise<unknown> = Promise.resolve();

/**
 * A remedy of a held run, staged (S4): its donor's file checked and pinned (a fill), its derived document run with the
 * day's claim and the donor's, every output held, and recorded as a derived run with its document. The same remedy of
 * the same run is staged once. Inside a run (applied again, or under a standing decision) it runs at once; from the
 * sheet, not while a run or a decision is on its way.
 */
async function stage(r: RunRecord, repair: Repair, inRun = false): Promise<RunRecord | null> {
  const key = stagedKey(r, repair);
  const had = stagedRuns.get(key);
  if (had) return had;
  const engine = state.engine;
  if (!engine || (!inRun && state.running)) return null;
  const go = async (): Promise<RunRecord | null> => {
    const again = stagedRuns.get(key);
    if (again) return again;
    if (repair.donor) await pinDonor(engine, repair.source, bindingOf(repair.source)!, repair.donor.file, checked);
    const day = dayOfRun(r);
    const data = integrity.data ? { commit: integrity.data.commit, manifest: integrity.data.manifest } : null;
    // Under plan/2 the donor is judged by a claim/2 (C4, B13): told from the base and the tail before its day, with its
    // own snapshot's measures, as the derived run measures the donor's table.
    const told = repair.donor && generalForm() ? await donorClaim2(engine, r, repair) : null;
    const asked = told && repair.donor ? { ...repair, donor: { ...repair.donor, claim: told as never } } : repair;
    const { doc, result } = await stageRepair(engine, { doc: state.doc, held: r.result, repair: asked, claims: claimsFor(day) ?? [], smaltdb: SMALTDB, data, log: recordHead() });
    const rec: RunRecord = { result, ms: 0, at: new Date(), inputs: r.inputs, ...(r.load !== undefined ? { load: r.load } : {}), derived: { from: r, repair, doc, seq: null } };
    stagedRuns.set(key, rec);
    derivedRuns.set(result.hash, rec);
    rec.derived!.seq = await recordDerived(rec);
    return rec;
  };
  // From the sheet, the staged run is said on the status line as any run is, and counted as one.
  const what = repair.kind === 'fill' ? `the fill from ${repair.donor ? dayShort(repair.donor.day) : 'another day'}` : 'the part that arrived';
  if (!inRun) setStatus(`Running ${what}, staged: nothing goes out until it is decided…`);
  const next = staging.then(go, go);
  staging = next.catch(() => undefined);
  try {
    const made = await next;
    if (!inRun) {
      attempts++;
      const shown = onScreen();
      if (shown) sayRun(shown);
    }
    return made;
  } catch (e) {
    setStatus(`Couldn’t prepare ${repair.kind === 'fill' ? `the fill from ${repair.donor ? dayShort(repair.donor.day) : 'another day'}` : 'the part that arrived'}: ${message(e)}`, true);
    return null;
  }
}

/**
 * A donor's claim/2 (ADR 0010 §6, C4): the flow's verdict on the donor's day, told as `claimsForRun` tells a load's,
 * from the base, the tail before that day and the donor's own measures (its table measured with the settings of a run
 * on that day), named for the donor source. Null when it can't be told: the derived run then holds its donor as not
 * judged, and the fill can't go.
 */
async function donorClaim2(engine: Engine, r: RunRecord, repair: Repair): Promise<Claim | null> {
  const day = repair.donor!.day;
  const period = periodOfFlow();
  const parameters: Record<string, string> = { ...(r.result.manifest.parameters as Record<string, string>) };
  if (period) parameters[period] = day;
  if (Object.hasOwn(parameters, 'month')) parameters.month = day.slice(0, 7);
  const plan = await translate(state.doc, parameters);
  const node = plan.nodes.findIndex((n) => n.op === 'table' && n.origin === repair.source);
  const b = bindingOf(repair.source);
  const w = state.doc.publish?.watch?.[repair.source];
  const ref = baseHistory && historyPin && w && historyPin.path === watchHistory(w) ? historyPin : null;
  const settings = node < 0 || !b ? null : settingsFor(plan, node, ref ? baseHistory : null, state.doc.steps);
  if (!settings || !b) return null;
  const m = await measureLoad(engine, donorBinding(repair.source, b).table, settings);
  const told = await loadClaim({ doc: state.doc, source: repair.source, flow: plan.flow.hash, base: ref ? baseHistory : null, baseRef: ref, tail: tails.get(repair.source) ?? [], measures: m, settings, skip: recordedSkips(), levels: levelsOf(ledger?.entries ?? [], repair.source), build: BUILD_COMMIT });
  return told ? ({ ...told.claim, source: donorIdOf(repair.source) } as Claim) : null;
}

/** A derived run in the record (S9): what a held run's entry carries, with the held run it repairs, the repair, its
 * rows at the fill step and its document, kept as the flow's is. */
async function recordDerived(rec: RunRecord): Promise<number | null> {
  if (!ledger || !rec.derived) return null;
  try {
    const result = rec.result;
    const plan = await planFor(rec);
    const blob = await ledger.keep('manifest', result.manifest);
    const planBlob = await ledger.keep('plan', plan);
    const doc = await ledger.keep('flow', withoutDisplay(rec.derived.doc));
    const files = result.manifest.nodes.filter((n) => n.file).map((n) => ({ source: n.origin, ...n.file! }));
    const period = periodOfPlan(plan);
    const value = period ? result.manifest.parameters[period] : undefined;
    const about = derivedAbout({ result, plan, day: typeof value === 'string' ? value : (dayOfRun(rec) ?? null), held: rec.derived.from.result, repair: rec.derived.repair });
    const e = await ledger.append('run', state.viewer, { ...(about as unknown as Record<string, JSONValue>), blob, plan: planBlob, load: loads.list[rec.load ?? -1]?.day ?? null, files: files as unknown as JSONValue, data: result.manifest.data ?? null, doc });
    return e.seq;
  } catch (e) {
    console.warn(`smaltfl: couldn't record the derived run: ${message(e)}`);
    return null;
  }
}

/** What each name showed before a fill's release, by the engine's release: what a withdrawal sends readers back to. */
const shownBefore = new Map<number, Map<string, RunRecord | undefined>>();

/**
 * Release a derived run as a recorded decision says (S10): the plugin checks it against the held run it repairs, the
 * names then show its versions, and the record keeps the release with the repair and the rows it took from another
 * day. A refusal is kept too.
 */
async function releaseDerived(d: RunRecord, decision: RecordEntry, keys: Record<string, string>, under?: number): Promise<ReleaseResult | null> {
  if (!ledger || !state.engine || !d.derived) return null;
  const held = d.derived.from;
  const repair = d.derived.repair;
  const leaf = entryLeaf(decision);
  const before = new Map(Object.keys(keys).map((n) => [n, state.names.get(n)]));
  const from = { run: held.result.run, manifest: held.result.hash };
  const out = await releaseRun(state.engine, { run: d.result.run, manifest: d.result.hash, keys, option: repair.kind, actor: decision.by.as, reason: decision.reason, decision: leaf, from, repair });
  // A refusal never hides the release that applied before it: kept apart, as the receipt cites the decision that applied.
  if (out.outcome === 'applied' || d.derived.release?.outcome !== 'applied') d.derived.release = out;
  else d.derived.refused = out;
  if (out.outcome === 'applied') {
    d.derived.withdrawn = false;
    shownBefore.set(out.release, before);
    noteShown(d, out.published);
  }
  const about: ReleaseAbout = { run: d.result.run, manifest: d.result.hash, outputs: keys, decision: decision.seq, leaf, outcome: out.outcome, why: out.why, from, repair, filled: out.filled ?? 0, ...(under !== undefined ? { under } : {}) };
  const e = await ledger.append('release', decision.by.as, about as unknown as JSONValue);
  if (out.outcome === 'applied') d.derived.releaseSeq = e.seq;
  return out;
}

/**
 * Withdraw the fill readers have of a day (Q-61), as a recorded decision not to publish says: the plugin points each
 * name back to the version it showed before the fill, unless a later day is current, and the record keeps the release
 * with the names as they now show and the fill's release it takes back.
 */
async function withdrawFill(d: RunRecord, decision: RecordEntry): Promise<ReleaseResult | null> {
  if (!ledger || !state.engine || !d.derived?.release) return null;
  const keys = derivedKeys(await planFor(d), d.result);
  const leaf = entryLeaf(decision);
  const out = await releaseRun(state.engine, { run: d.result.run, manifest: d.result.hash, keys, option: 'dont', actor: decision.by.as, reason: decision.reason, decision: leaf, withdraws: d.derived.release.release });
  let back: Record<string, string> = {};
  if (out.outcome === 'applied') {
    const was = shownBefore.get(d.derived.release.release);
    for (const n of out.published) {
      const r = was?.get(n);
      if (r) state.names.set(n, r);
      else state.names.delete(n);
    }
    const names = out.published.map((n) => literal(n, 'text')).join(', ');
    if (names) back = Object.fromEntries((await state.engine.query(`SELECT name, key FROM _smaltfl_datasets WHERE name IN (${names})`)).rows.map(([n, k]) => [String(n), String(k)]));
    d.derived.withdrawn = true;
  }
  const about: ReleaseAbout = { run: d.result.run, manifest: d.result.hash, outputs: back, decision: decision.seq, leaf, outcome: out.outcome, why: out.why, ...(d.derived.releaseSeq !== undefined ? { withdraws: d.derived.releaseSeq } : {}) };
  await ledger.append('release', decision.by.as, about as unknown as JSONValue);
  return out;
}

/**
 * A fill or the part alone decided before, applied again to its day run once more (S9, ADR 0009 §10): its derived
 * document made again from the decision's repair, staged, and released citing the same decision when it made the keys
 * the decision names. Other keys (another build) leave the day as the record says, to be decided again by a person.
 */
async function applyRemedy(r: RunRecord, d: Decided): Promise<void> {
  const repair = d.about.repair;
  if (!repair || !ledger) return;
  const derived = await stage(r, repair, true);
  if (!derived) return;
  const keys = derivedKeys(await planFor(derived), derived.result);
  if (!d.about.derived || !sameKeys(keys, d.about.derived.keys)) return;
  // Already out in this engine (the day stepped back to): its names show it, and there is nothing to apply again.
  if (derived.derived?.release?.outcome === 'applied' && Object.keys(keys).every((n) => state.names.get(n) === derived)) return;
  await releaseDerived(derived, ledger.entries[d.seq]!, keys);
}

/**
 * A day under a standing fill (or part alone) decision (Q-64): filled by the decision's own rule and direction from
 * this day's first good day, staged; when it passes, decided under the standing decision, as its maker, and released.
 * With no good day near, or a staged run that fails its checks, the day waits for a person.
 */
async function applyStanding(r: RunRecord, standing: Decided, day: string, keys: Record<string, string>, inputs: Inputs): Promise<void> {
  const was = standing.about.repair;
  const option = standing.about.option as 'fill' | 'complete';
  if (!was || !ledger) return;
  const may = checkDecision(policies(), standing.by, option);
  if (!may.allowed) return;
  const rem = remediesFor(r);
  if (!rem) return;
  const pick = option === 'fill' ? (rem.picks.find((p) => p.rule === was.donor?.rule && p.direction === was.donor?.direction) ?? null) : null;
  if (option === 'fill' && !pick) return;
  const derived = await stage(r, repairOf(rem, pick), true);
  if (!derived || derivedFails(derived.result)) return;
  const dkeys = derivedKeys(await planFor(derived), derived.result);
  const about: DecideAbout = { day, run: r.result.run, manifest: r.result.hash, inputs, outputs: keys, option, scope: 'day', policies: await policiesHash(policies() ?? null), rule: may.rule ?? null, under: standing.seq, repair: derived.derived!.repair, derived: { run: derived.result.run, manifest: derived.result.hash, keys: dkeys } };
  const entry = await ledger.append('decide', standing.by, about as unknown as JSONValue, standing.reason);
  await releaseDerived(derived, entry, dkeys, standing.seq);
}

/** What a remedy readers have took and set aside (the receipt's numbers): the rows its release took from another day,
 * and those of the missing part that arrived. */
function remedyCounts(p: Pause | null): { filled: number | null; setAside: number | null } {
  const r = p?.repaired;
  if (!r || !ledger) return { filled: null, setAside: null };
  const rel = ledger.entries[r.release]?.about as Partial<ReleaseAbout> | undefined;
  const repair = rel?.repair ?? (ledger.entries[r.decision]?.about as Partial<DecideAbout> | undefined)?.repair;
  const day = p?.day ?? null;
  const part = repair && day && flowHistory ? fillCounts(flowHistory, day, repair.missing, null) : null;
  return { filled: typeof rel?.filled === 'number' ? rel.filled : null, setAside: part?.setAside ?? null };
}

/** A day's versions (S7): what arrived, each fill and the part alone, the one readers have ticked; from the record. */
function versionsSheet(day: string): void {
  if (!ledger) return;
  const vs = dayVersions(ledger.entries, day, periodOfFlow());
  const load = loads.list.find((l) => l.day === day);
  const story = storyFor(day);
  const firstRemedy = vs.find((v) => v.kind === 'complete');
  const repair = firstRemedy ? (ledger.entries[firstRemedy.seq]?.about as { repair?: Repair } | undefined)?.repair : undefined;
  // What readers get at the source: the load's rows as they arrived; a fill's or the part's from the history's counts,
  // the same number its derived run counts (S4), where the record doesn't say.
  const src = loadSource();
  const counted = (v: Version): number | null => {
    // Counts of the source only to someone who reads every row of it (round 3, #6).
    if (src && !rowsOpen(src)) return null;
    if (v.rows !== undefined) return v.rows;
    if (v.kind === 'arrived') return load?.rows ?? null;
    const rp = (ledger!.entries[v.seq]?.about as { repair?: Repair } | undefined)?.repair;
    return rp && flowHistory ? (fillCounts(flowHistory, day, rp.missing, rp.donor?.day ?? null)?.total ?? null) : null;
  };
  const l = versionLines(vs, { day, noun: rowNoun(loadSource() ?? ''), name: (v: Version) => runNameOf(v.manifest, v.run), rows: counted, part: repair && sourceOpen() ? remedyPart(repair.missing, story?.split?.name) : null });
  openDetail(l.title, 'ok', [h('ul', { class: 'vf-versions-list' }, ...l.lines.map((x) => h('li', { class: x.shown ? 'now' : '' }, x.text)))]);
}

/** Everything that shows a day's pause, drawn again after a decision. */
function afterDecision(): void {
  syncTitle();
  renderCanvas();
  renderLoads();
  renderRuns();
  // A detail open over the sheet (the decision's receipt) stays, and the sheet behind it says the decision at once: its
  // date's mark, its tab's and its card's row, never "Paused" under a receipt that says otherwise (round 3, #9). The
  // sheet is drawn again under the detail, which is put back over it.
  const wrap = document.querySelector('.vf-detail-wrap');
  if (state.selected && wrap) {
    const host = wrap.parentElement;
    const drawn = renderSheet();
    if (host && !wrap.isConnected) host.append(wrap);
    void drawn;
  } else if (state.selected) void renderSheet();
  if (location.hash === '#results') void renderResults();
  if (location.hash === '#policies') void renderPolicies();
  if (location.hash === '#ontology') void renderOntology();
}

// ------------------------------------------------------------------ integrity, card by card

/** The file a source reads now: the day's load for the trips, else the one the data's list names for it. */
function fileOf(source: string): string | undefined {
  if (!bindingOf(source)) return undefined;
  if (source === loadSource()) return loads.list[loads.at]?.file ?? integrity.files[source]?.path;
  return integrity.files[source]?.path;
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
  const stored = ok(['stored', 'coherent', 'key', 'published', 'previous', 'accounting', 'flow', 'held']);
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
  if (rowsFrom(shownDay(), viewedDay()) && src && (id === src || downstreamOf(src).includes(id))) {
    // A refused file still shows its broken seal: that is about today's bytes, not another day's run.
    if (id === src && integrityNews(id)[0]?.severity === 'alert') return 'bad';
    return null;
  }
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

/** The document's flow hash, once hashed ('' until then): hashing it is asynchronous, and everything that reads it is
 * drawn again when it is known. */
const flowHashNow = { doc: null as FlowDocument | null, hash: '' };
function docHash(): string {
  if (flowHashNow.doc !== state.doc) {
    const doc = (flowHashNow.doc = state.doc);
    flowHashNow.hash = '';
    void flowHash(doc).then((h) => {
      if (flowHashNow.doc !== doc) return;
      flowHashNow.hash = h;
      requestCanvas();
      syncTitle();
      if (location.hash === '#runs') renderRibbon();
    });
  }
  return flowHashNow.hash;
}

/** Whether the flow on screen is no longer the one the run ran. */
function flowChanged(r: RunRecord): boolean {
  const h = docHash();
  return h !== '' && h !== r.result.manifest.flow.hash;
}

/** The flow on screen, by its hash: the newest run's, or before any run the document's, once hashed. */
const flowOnScreen = (): string | undefined => state.runs[0]?.result.manifest.flow.hash ?? (docHash() || undefined);

async function integrityTab(card: string, id: string, who: string): Promise<HTMLElement> {
  void who;
  const box = h('div', { class: 'integrity-tab' });
  const r = latest();
  if (!r) return h('p', { class: 'foot' }, 'Run the flow to see what it read and made, by hash.');
  const m = r.result.manifest;
  const seal = sealOf(card);
  const want = new Set([id, ...upstreamOf(id)].map((x) => x.toLowerCase()));
  // Back to the bytes as far as the viewer may see: a part closed to them left out, neither named nor counted, and a
  // count, a file's size or what a check says only where every row of it is theirs (round 3, #6).
  const sight = runSight();
  const upstream = m.nodes.filter((n) => want.has(n.origin.toLowerCase()));
  const chainNodes = upstream.filter((n) => sight.open(n.origin));
  const v = r.verified;
  const seenChecks = checksFor(r).checks;
  const checksOf = (origin: string) => (v ? seenChecks.filter((c) => c.origin === origin) : []);
  // Green only once sealed: a run recorded but not yet verified is said in grey (ADR 0008).
  box.append(h('div', { class: `verdict ${seal === 'bad' ? 'alert' : seal === 'amber' ? 'warn' : seal === 'ok' || levelOf(r) > 0 ? 'ok' : 'note'}` },
    h('p', { class: 'v-day' }, `Run ${runName(r)}${r.load !== undefined && loads.list[r.load] ? ` · ${dayLabel(loads.list[r.load]!.day)}` : ''}`),
    h('h3', { class: 'v-head' }, seal === 'bad' ? 'The chain is broken'
      : sourceIds().has(id) ? (seal === 'ok' ? 'Sealed: this file matches the source’s list' : seal === 'amber' ? 'Read, with a note' : 'Recorded, not yet matched to the list')
      : ['Recorded, not yet verified', 'Intact: every hash, key and link checks', 'Recomputed: the same datasets from the snapshots', 'Sealed: re-derived from the files’ bytes'][levelOf(r)]!),
    h('p', { class: 'v-line' }, sourceIds().has(id)
      ? (seal === 'ok' ? 'Its bytes, hashed by the engine, are the ones the data’s list publishes.' : state.engine?.mode === 'page' ? 'The engine runs in this page: an audit outside the browser vouches for its hashes.' : 'The file the run read, against the data’s list.')
      : 'Every step back to the files’ bytes, each with its hash. Re-deriving seals it.')),
    levelPills(r),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => void verify(r, 'rerun') }, 'Verify the run'),
      h('button', { type: 'button', class: 'btn small quiet', onclick: () => void verify(r, 'rederive') }, 'Re-derive from the files'),
      // The audit bag carries the whole record and what the engine holds: the owner's to export, wherever it is offered.
      ledger && isOwner() ? h('button', { type: 'button', class: 'btn small quiet', onclick: () => void exportAudit() }, 'Export for audit') : null));
  const items = chainNodes.slice().reverse().map((n) => {
    const bad = checksOf(n.origin).some((c) => !c.ok);
    const fileCheck = n.file ? checkOfRead(n.file.sha256) : undefined;
    const lines: Child[] = [];
    const all = sight.counted(n.origin);
    if (n.file) {
      lines.push(h('p', { class: 'c-line' }, `Read ${n.file.location.replace('smaltfl:', '')}${all ? ` (${fmtInt(n.file.bytes)} bytes)` : ''}, hashed by the engine:`), h('p', { class: 'c-line' }, 'sha256 ', hash4(n.file.sha256, `${n.origin} file hash`)));
      lines.push(h('p', { class: `c-line ${fileCheck ? '' : 'bad'}` }, fileCheck ? `${describeFile(fileCheck).title}${fileCheck.commit ? `, data commit ${fileCheck.commit.slice(0, 12)}` : ''}.` : 'Not matched to the data’s list in this visit.'));
    } else if (n.op === 'table') lines.push(h('p', { class: 'c-line' }, 'A table in the database, snapshotted by its rows: no file.'));
    if (n.content) lines.push(h('p', { class: 'c-line' }, all ? `${fmtInt(n.rows ?? 0)} rows, content ` : 'Content ', hash4(n.content, `${n.origin} content hash`)));
    else lines.push(h('p', { class: 'c-line muted' }, 'folded into the step that reads it'));
    lines.push(h('p', { class: 'c-line' }, 'key ', h('span', { class: 'hash' }, short(n.key)), ` · ${n.status}`));
    for (const c of checksOf(n.origin)) lines.push(h('p', { class: `c-line ${c.ok ? '' : 'bad'}` }, `${c.ok ? '✓' : '✗'} ${c.check}${c.note ? `: ${c.note}` : ''}`));
    return h('li', { class: bad ? 'bad' : v ? '' : 'unchecked' }, h('p', { class: 'c-what' }, `${n.origin} · ${n.op}`), ...lines);
  });
  box.append(h('div', { class: 'part' }, h('p', { class: 'eyebrow' }, 'From this card back to the bytes'), h('ul', { class: 'chain' }, ...items), chainNodes.length < upstream.length ? h('p', { class: 'foot' }, 'Closed parts left out.') : null));
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

/**
 * What a record line needs beyond its entry (ADR 0009 §12): the held runs that ran a day already held (the same
 * inputs), and each held run's waiting outputs by its manifest, so a release counts the outputs whose version it
 * changed, as the button that decided it counted them.
 */
interface RecordContext {
  again: Set<number>;
  waiting: Map<string, string[]>;
  /** A day that passed once days before it were held: its run entry, and the standing decision it ends, if any. */
  passed: Map<number, number | null>;
  /** An applied release that ends a standing decision (it published a day the decision stood for): the decision. */
  ends: Map<number, number>;
  /** A release of a decision already applied once (the same decision applied again in a new engine). */
  reapplied: Set<number>;
  /** A run that published a day already run here, the same inputs: a routine line. */
  rerun: Set<number>;
}
function recordContext(entries: readonly RecordEntry[], period: string | null): RecordContext {
  const seen = new Set<string>();
  const ok = new Set<string>();
  const applied = new Set<number>();
  const ctx: RecordContext = { again: new Set(), waiting: new Map(), passed: new Map(), ends: new Map(), reapplied: new Set(), rerun: new Set() };
  // Held days since the last day that published. What a day publishing ends is standingFor's own rule (standingEnds):
  // only a day after the decision's, never one amended or applied under another, and a release that published a day
  // ends it too.
  let held = false;
  entries.forEach((e, i) => {
    const a = e.about as { outcome?: string; inputs?: unknown; manifest?: unknown; waiting?: unknown; decision?: unknown } | null;
    if (e.kind === 'release' && a?.outcome === 'applied' && typeof a.decision === 'number') {
      if (applied.has(a.decision)) ctx.reapplied.add(e.seq);
      applied.add(a.decision);
      const ends = standingEnds(entries, i, period);
      if (ends !== null) ctx.ends.set(e.seq, ends);
    }
    if (e.kind !== 'run') return;
    const key = a?.inputs && typeof a.inputs === 'object' ? inputsKey(a.inputs as Inputs) : null;
    if (a?.outcome === 'ok') {
      if (key && ok.has(key)) ctx.rerun.add(e.seq);
      else if (held) ctx.passed.set(e.seq, standingEnds(entries, i, period));
      if (key) ok.add(key);
      held = false;
      return;
    }
    if (a?.outcome !== 'held') return;
    if (Array.isArray(a.waiting) && a.waiting.length) held = true;
    if (key && seen.has(key)) ctx.again.add(e.seq);
    else if (key) seen.add(key);
    if (typeof a.manifest === 'string') ctx.waiting.set(a.manifest, Array.isArray(a.waiting) ? (a.waiting as string[]) : []);
  });
  return ctx;
}

/** What became of a held run's day now, by the record's pause of its inputs: its mark on a line with nothing waiting. */
function heldNow(a: Record<string, unknown>): DayState | null {
  const p = a.inputs && typeof a.inputs === 'object' ? pauseByInputs(inputsKey(a.inputs as Inputs)) : null;
  return dayState(null, p);
}

/** A run a record entry names, as the screens name runs: by the entry that recorded it ("run #13"). */
const runSaid = (a: Record<string, unknown>) => `run ${runNameOf(typeof a.manifest === 'string' ? a.manifest : undefined, a.run)}`;

const KIND_WORD: Record<string, (e: { seq: number; about: Record<string, unknown>; by: { as: string }; reason: string | null; amends?: number | null }, ctx: RecordContext) => string> = {
  // A run is named by its own entry (the line's number), as the Runs view names it.
  run: ({ seq, about: a }, ctx) => {
    // The files of sources open to the viewer: a closed one neither counted nor named (round 3, #6).
    const read = Array.isArray(a.files) ? (a.files as { source?: string }[]).filter((f) => runSight().open(String(f.source ?? ''))) : null;
    const files = read ? `${read.length} file${read.length === 1 ? '' : 's'} read by their hashes` : '';
    // A day that published once days before it were held: readers now see it, and a standing decision ends with it.
    if (a.outcome === 'ok' && ctx.passed.has(seq) && typeof (a.day ?? a.load) === 'string') return `${passedLine(String(a.day ?? a.load), ctx.passed.get(seq)!)} · ${files}`;
    if (a.outcome === 'ok') return `${ctx.rerun.has(seq) ? 'Ran again' : 'Ran the flow'}${a.load ? ` on ${dayLabel(String(a.load))}` : ''}: manifest ${String(a.manifest).slice(0, 12)}…, ${files}`;
    // A derived run (amendment 1 S9): a fill or the part alone, staged until a decision releases it.
    if (a.outcome === 'derived') {
      const r = a.repair as Repair | undefined;
      const day = a.day ?? a.load ? dayMid(String(a.day ?? a.load)) : 'the day';
      return `Made ${day} ${r?.kind === 'fill' && r.donor ? `filled from ${dayShort(r.donor.day)}` : 'with the part that arrived'}, staged: manifest ${String(a.manifest).slice(0, 12)}…, repairing run ${runNameOf((a.from as { manifest?: string } | undefined)?.manifest, (a.from as { run?: unknown } | undefined)?.run)}`;
    }
    if (a.outcome !== 'held') return `A run${a.load ? ` on ${dayLabel(String(a.load))}` : ''} stopped: ${String(a.error ?? '')}`;
    const day = a.day ?? a.load ? dayMid(String(a.day ?? a.load)) : null;
    const waiting = Array.isArray(a.waiting) ? a.waiting.length : 0;
    // A day held once more, or run again with nothing left waiting, says so: one pause, however many runs.
    if (!waiting) return `Ran ${day ?? 'the flow'} again: nothing waiting${heldNow(a) === 'asis' ? ', published as is' : heldNow(a) === 'dont' ? ', not published' : ''}`;
    if (ctx.again.has(seq)) return `Held ${day ?? 'the flow'} again: ${plural(waiting, 'output')} waiting`;
    return `Held ${day ?? 'the flow'}: ${plural(waiting, 'output')} waiting`;
  },
  // A day closed under a standing decision is the decision's rule at work, not a person deciding again.
  decide: ({ about: a, reason, amends }) => {
    const day = a.day ? dayMid(String(a.day)) : runSaid(a);
    // A remedy (amendment 1 S12): "Thu Sep 21 filled from Thu 14", "Tue Nov 15 filled from Tue 1, by #22’s rule",
    // "Thu Sep 21 refilled from Wed 20 · amends #22"; a withdrawal, "Thu Sep 21 fill withdrawn · amends #22".
    const repair = a.repair as Repair | undefined;
    const was = amends !== null && amends !== undefined ? (ledger?.entries[amends]?.about as { option?: string } | undefined)?.option : undefined;
    // The part names the source's column and value: to someone it is closed to, only that it was the part (#6).
    const remedy = repair ? (repair.kind === 'fill' && repair.donor ? `${was === 'fill' ? 'refilled' : 'filled'} from ${dayShort(repair.donor.day)}` : sourceOpen() ? `published ${remedyPart(repair.missing, a.day ? storyFor(String(a.day))?.split?.name : undefined).replace(/^(Before|Without|From) /, (m) => m.toLowerCase())}` : 'published with the part that arrived') : null;
    // Accept the new level (amendment 1 S6): "Mon Nov 14: new level from Mon 14 · decision #24"; a later day under it,
    // "Tue Nov 15 published, by #24’s new level".
    const level = a.level as { from?: string } | undefined;
    if (a.option === 'accept' && typeof a.under === 'number') return `${day} published, by #${a.under}’s new level`;
    if (a.option === 'accept') return `${day}: new level from ${level?.from ? dayShort(level.from) : 'the day'}${reason ? ` (${reason})` : ''}`;
    if (typeof a.under === 'number') return `${day} ${remedy ?? 'not published'}, by #${a.under}’s rule`;
    if (remedy) return `${day} ${remedy}${a.scope === 'untilPass' ? ', and later days until one passes' : ''}${amends !== null && amends !== undefined ? ` · amends #${amends}` : ''}`;
    if (a.option === 'dont' && (was === 'fill' || was === 'complete')) return `${day} ${was === 'fill' ? 'fill' : 'part'} withdrawn · amends #${amends}${reason ? ` (${reason})` : ''}`;
    return `Decided ${day}: ${a.option === 'asis' ? 'publish as is' : `don’t publish${a.scope === 'untilPass' ? `, ${UNTIL}` : ''}`}${reason ? ` (${reason})` : ''}`;
  },
  release: ({ seq, about: a }, ctx) => {
    if (a.outcome !== 'applied') return `A release of ${runSaid(a)} was refused: ${String(a.why ?? '')}`;
    // The outputs whose version it changed: those its run held back, as the cause card and the button counted them.
    const named = Object.keys((a.outputs as Record<string, string> | null) ?? {});
    const waited = typeof a.manifest === 'string' ? ctx.waiting.get(a.manifest) : undefined;
    const changed = waited ? named.filter((n) => waited.includes(n)) : named;
    // The same decision applied again after a reload (the engine started anew, and ran the day again): one decision.
    const ends = ctx.ends.has(seq) ? ` · ends #${ctx.ends.get(seq)}` : '';
    if (typeof a.withdraws === 'number') return `Withdrew release #${a.withdraws}: ${plural(named.length, 'output')} back to what ${named.length === 1 ? 'it' : 'they'} showed before, by decision #${String(a.decision)}${ends}`;
    if (ctx.reapplied.has(seq)) return `Applied decision #${String(a.decision)} again in a new engine: ${plural(changed.length, 'output')} of ${runSaid(a)}${ends}`;
    return `Released ${plural(changed.length, 'output')} of ${runSaid(a)}, by decision #${String(a.decision)}${ends}`;
  },
  flow: ({ about: a }) => (a.before ? `The flow changed: ${String(a.before).slice(0, 12)}… to ${String(a.after).slice(0, 12)}…` : `The flow as it first ran here: ${String(a.after).slice(0, 12)}…`),
  // A file of a source closed to the viewer names neither the source nor its file (round 3, #6).
  file: ({ about: a }) => (fileSeen(String(a.path ?? '')) ? describeFile(a as unknown as FileCheck).title : 'A closed part’s file, checked against the data’s list'),
  // What was done is said to anyone; what it was done about only to someone who reads all of its dataset, or who did it,
  // as they read it then (#6).
  act: ({ about: a, by }) => `${personName(by.as)} ${ACT_DONE[a.act as LogAct] ?? String(a.act)}${by.as === state.viewer || actSeen(String(a.finding ?? '')) ? `: ${String(a.title)}` : ''}`,
  verify: ({ about: a }) => {
    if (a.ok) return `Run ${runSaid(a).slice(4)} ${LEVEL_DONE[a.level as VerifyLevel] ?? 'verified'}`;
    // A closed part's failure counted in the verdict, never named (#6).
    const named = (a.failed as string[]).filter((x) => !nodeIds().has(x.split(':')[0]!) || runSight().open(x.split(':')[0]!));
    return `Run ${runSaid(a).slice(4)} failed verification${named.length ? `: ${named.slice(0, 3).join(', ')}` : ''}`;
  },
  sign: ({ about: a }) => `Signed ${runSaid(a)}'s manifest`,
  edit: ({ about: a }) => {
    const e = a.edit as { action?: string; objectType?: string; outcome?: string } | null;
    return `${e?.action ?? 'An action'} on a ${e?.objectType ?? 'object'}: ${e?.outcome ?? ''}`;
  },
  import: ({ about: a }) => `Imported ${Array.isArray(a.entries) ? a.entries.length : 0} entries from the old data log (its chain ${a.chainOk ? 'held' : 'was broken'})`,
  export: ({ about: a }) => `Exported for audit at ${String(a.size)} entries`,
  check: ({ about: a }) => (a.ok ? `Checked against a checkpoint kept elsewhere, at ${String(a.size)} entries: consistent` : `Checked against a checkpoint kept elsewhere: ${String(a.reason)}`),
};
const ROUTINE = new Set(['file', 'sign']);

/** The flow's sources and steps, by id: what a record line may name, as far as the viewer may see it. */
const nodeIds = (): Set<string> => new Set([...state.doc.sources.map((x) => x.id), ...state.doc.steps.map((x) => x.id)]);
/** Whether a recorded finding's title is the viewer's to read: only when they read all of its dataset (round 3, #6). */
function actSeen(key: string): boolean {
  if (isOwner()) return true;
  const of = findingOf(key, nodeIds(), loadSource() ?? null);
  const a = of ? access(of) : null;
  return !!a && accessOf(a) === 'all';
}
/** Whether a checked file is of a source open to the viewer (round 3, #6): a day's load is the watched source's. */
function fileSeen(path: string): boolean {
  if (isOwner()) return true;
  const src = loads.list.some((l) => l.file === path) ? loadSource() : state.doc.sources.find((x) => integrity.files[x.id]?.path === path)?.id;
  return !!src && runSight().open(src);
}

/**
 * A record line's mark (ADR 0009 §12): ‖ a held run with outputs waiting, ⚑ or ✕ a decision, ⚑ an applied release. A
 * held run with nothing waiting (a day run again once decided) carries what became of its day, or no mark.
 */
function recordMark(e: { kind: string; about: unknown }): VizMark | null {
  const a = e.about as { outcome?: string; option?: string; waiting?: unknown };
  if (e.kind === 'run' && a.outcome === 'held') {
    if (Array.isArray(a.waiting) && a.waiting.length) return 'held';
    const now = heldNow(e.about as Record<string, unknown>);
    return now && now !== 'waiting' ? PAUSE_MARK[now] : null;
  }
  if (e.kind === 'decide') return a.option === 'asis' ? 'flag' : a.option === 'accept' ? 'level' : a.option === 'fill' ? 'fill' : a.option === 'complete' ? 'part' : 'closed';
  if (e.kind === 'release' && a.outcome === 'applied') {
    const r = (e.about as { repair?: Repair; withdraws?: number }).repair;
    return (e.about as { withdraws?: number }).withdraws !== undefined ? 'closed' : r ? (r.kind === 'fill' ? 'fill' : 'part') : 'flag';
  }
  return null;
}

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
  const ctx = recordContext(ledger.entries, periodOfFlow());
  // Routine: files first read, signatures, and a day held again or run again with nothing waiting (one pause, one line).
  const isRoutine = (e: (typeof recent)[number]) => ROUTINE.has(e.kind) || ctx.rerun.has(e.seq) || (e.kind === 'run' && (e.about as { outcome?: string }).outcome === 'held' && (ctx.again.has(e.seq) || !((e.about as { waiting?: unknown[] }).waiting?.length)));
  const shown = recent.filter((e) => !isRoutine(e)).slice(0, 15);
  const routine = recent.filter(isRoutine).length;
  const line = (e: (typeof recent)[number]) => {
    const say = KIND_WORD[e.kind];
    const mark = recordMark(e);
    // A day closed under a standing decision is credited to that decision's rule, set by whoever made it.
    const under = e.kind === 'decide' ? (e.about as { under?: unknown }).under : undefined;
    const who = typeof under === 'number' ? `rule #${under} (${personName(e.by.as)})` : personName(e.by.as);
    return h('li', {}, h('span', { class: 'seq' }, `#${e.seq}`), h('span', { class: mark ? 'rec-marked' : '' }, mark ? glyphEl(mark, 14) : '', say ? say(e as never, ctx) : e.kind), h('span', { class: 'when' }, `${new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${who}`));
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
      isOwner() ? h('button', { type: 'button', class: 'btn', onclick: () => void exportAudit() }, 'Export for audit') : null,
      h('button', { type: 'button', class: `btn${isOwner() ? ' quiet' : ''}`, onclick: () => void downloadCheckpoint() }, 'Download a checkpoint'),
      h('button', { type: 'button', class: 'btn quiet', onclick: () => pick.click() }, 'Check against a checkpoint'), pick),
    h('ul', { class: 'timeline' }, ...shown.map(line)),
    routine ? h('details', { class: 'fold' }, h('summary', {}, `${routine === 1 ? '1 routine entry' : `${fmtInt(routine)} routine entries`}: files first read, signatures, days run again`), h('ul', { class: 'timeline' }, ...recent.filter(isRoutine).slice(0, 40).map(line))) : '',
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
 * record names, what the engine names, the releases it kept and what held its runs (ADR 0009 §11), the data's list, a
 * proof for each dataset as published, and a readable account. The source files are left out: an auditor gets each
 * from the data branch by its sha256.
 */
async function exportAudit(): Promise<void> {
  if (!ledger) return;
  // The bag names every node and hold, those closed to a viewer too: only the owner exports it (ADR 0009 §12).
  if (!isOwner()) {
    setStatus('Exporting for audit is the owner’s: the bag carries the whole record.', true);
    return;
  }
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
  // What the engine holds of this visit's runs, when it is running (a refused start-up leaves it without one): its
  // plans, flows and runs, the version each dataset name shows, the releases it kept and what held each run (ADR 0009
  // §11).
  const named: { datasets: { name: string; key: string; run: number; manifest: string; release: number | null }[]; releases: unknown[]; holds: unknown[]; repairs?: unknown } = { datasets: [], releases: [], holds: [] };
  if (state.engine) {
    for (const [hash, plan] of (await state.engine.query('SELECT hash, plan FROM _smaltfl_plans')).rows) payload.push({ path: `engine/plans/${String(hash)}.json`, bytes: enc.encode(String(plan) + '\n') });
    for (const [hash, doc] of (await state.engine.query('SELECT hash, doc FROM _smaltfl_flows')).rows) payload.push({ path: `engine/flows/${String(hash)}.json`, bytes: enc.encode(String(doc) + '\n') });
    for (const [id, hash, manifest] of (await state.engine.query('SELECT id, hash, manifest FROM _smaltfl_runs')).rows) payload.push({ path: `engine/runs/${String(id)}-${String(hash)}.json`, bytes: enc.encode(String(manifest) + '\n') });
    Object.assign(named, await state.engine.callPlugin('smaltfl', 'names', []));
    payload.push({ path: 'engine/datasets.json', bytes: json(named.datasets) }, { path: 'engine/releases.json', bytes: json(named.releases) }, { path: 'engine/holds.json', bytes: json(named.holds) });
    // What the engine kept of the fills (ADR 0009 amendment 1 S11): derived runs, releases of them, withdrawals.
    if (named.repairs) payload.push({ path: 'engine/repairs.json', bytes: json(named.repairs) });
  }
  if (integrity.manifestBytes) payload.push({ path: 'data/MANIFEST.json', bytes: integrity.manifestBytes });
  if (integrity.data) payload.push({ path: 'data/commit.txt', bytes: enc.encode(`${integrity.data.commit}\n`) });
  // A proof for each dataset as published, what its name shows: by its run's entry, or, for a day published as is, by
  // the release that published it, in the record whose root the bag names. Its manifest is the run's that made it.
  for (const d of named.datasets) {
    const runEntry = [...entries].reverse().find((e) => e.kind === 'run' && (e.about as { manifest?: string }).manifest === d.manifest);
    const releaseEntry = d.release === null ? undefined : [...entries].reverse().find((e) => e.kind === 'release' && (e.about as unknown as ReleaseAbout).manifest === d.manifest && (e.about as unknown as ReleaseAbout).outcome === 'applied' && (e.about as unknown as ReleaseAbout).outputs[d.name] === d.key);
    const entry = releaseEntry ?? runEntry;
    const made = (state.runs.find((x) => x.result.hash === d.manifest) ?? derivedRuns.get(d.manifest))?.result.manifest.outputs[d.name];
    if (entry && made) payload.push({ path: `proofs/${d.name}.json`, bytes: json({ dataset: d.name, ...made, run: d.run, manifest: d.manifest, entry, inclusion: ledger.proofOf(entry.seq, head.size) }) });
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
${r ? `<p>Run ${runName(r)}, manifest <code>${r.result.hash}</code>${r.verified ? `, ${r.verified.ok ? 'verified' : 'failed verification'} at the ${r.verified.level} level` : ''}. It read:</p><ul>${files}</ul>` : '<p>No run yet.</p>'}
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
  // The data list first (ADR 0010 §9): it binds each source by id, and names the flow when the page runs another than
  // the built example, which is checked against the list before it is read.
  const index = (await fetch('data/loads.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as unknown;
  dataList = readDataList(index, EXAMPLE_DATA);
  let opening: unknown = null;
  if (dataList.flow) {
    try {
      const bytes = await fetchChecked(dataList.flow.path, dataList.flow, { commit: dataList.data?.commit ?? null, onCheck: noteCheck });
      const doc = JSON.parse(new TextDecoder().decode(bytes)) as FlowDocument;
      const issues = validateDocument(doc);
      if (issues.length) throw new Error(`${dataList.flow.path} isn't a flow this version runs: ${issues[0]!.path}: ${issues[0]!.message}`);
      shippedDoc = doc;
      state.doc = structuredClone(doc);
      document.title = `smaltfl: ${doc.name}`;
    } catch (e) {
      opening = e;
    }
  }
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
    // A day held in an earlier visit still waits (ADR 0009 §10): the tab says so before anything runs.
    syncTitle();
    if (opening) throw opening;
    const engine = await connect();
    // The daily loads the data has, if any: the flow starts on the first.
    const list = dataList;
    integrity.data = list.data;
    integrity.files = list.files;
    // The list this app was built with: loads.json must name it. Only an auditor's check against the data branch
    // proves it is the data branch's; this stops a list, its files and loads.json being swapped together.
    if (BUILT_DATA && (list.data?.commit !== BUILT_DATA.commit || list.data.manifest !== BUILT_DATA.manifest)) {
      throw new IntegrityError({ path: 'MANIFEST.json', class: 'list', expected: BUILT_DATA.manifest, actual: list.data?.manifest ?? null, commit: BUILT_DATA.commit, at: new Date().toISOString() });
    }
    // The month, then each incident: an episode of days each. The app names the holidays itself.
    const month = list.month ? dateOf(`${list.month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'The loads';
    const tag = (ls: readonly Listed[], episode: string): Load[] => ls.map((l) => {
      const note = holidayOf(l.day, calendarNow()) ?? seasonOf(l.day, calendarNow());
      return { ...l, episode, ...(note ? { note } : {}) };
    });
    loads.list = [...tag(list.loads, month), ...list.episodes.flatMap((e) => tag(e.loads, e.name))];
    loads.episodes = [{ name: month }, ...list.episodes.map((e) => ({ name: e.name, about: e.about }))];
    loads.episode = month;
    loads.donors = list.donors.map((l) => ({ ...l }));
    // The data's list first: it must be the one this app was built with, and say what loads.json says of each file.
    if (integrity.data) await checkList(list);
    // Each watched source's history (ADR 0010 §9): its base, for each load's normal range, when the data has one.
    const watched = loadSource();
    const hf = watched ? list.histories[watched] : undefined;
    const pastBytes = hf ? await checked(hf.path, hf) : null;
    const past = pastBytes ? (JSON.parse(new TextDecoder().decode(pastBytes)) as HistoryFile) : null;
    if (isHistory(past) && past.days.length) {
      baseHistory = past;
      rebuildTails();
      refreshRanges();
    }
    const first = loads.list[0];
    const noun = rowNoun(watched ?? '');
    setStatus(first ? `Loading ${dayLabel(first.day)}: ${fmtInt(first.rows)} ${noun}, and the other sources, each checked against the data's list…` : `Loading the ${noun} and the other sources…`);
    // Each source's file, by its binding, checked here and pinned in the engine, which hashes it again and reads it as
    // smaltfl:<file>: the loads' source its first load.
    for (const [id, b] of Object.entries(list.sources)) {
      if (!state.doc.sources.some((x) => x.id === id)) continue;
      // A daily source's first load (with several daily sources, the first day's file of each, ADR 0013 §5).
      const day = first && (id === list.loadSource ? first : first.files?.[id]);
      const want: (Expected & { path: string }) | undefined = day ? { path: day.file, sha256: day.sha256, bytes: day.bytes ?? -1, from: day.file } : b.entry;
      if (!want) throw new Error(`no hash for ${b.file} in the data's list: it can't be checked, so it isn't used`);
      const bytes = await checked(want.path, want);
      await pinFile(engine, b.file, bytes, want.sha256);
      await engine.exec(pinnedDdl(b));
      if (id === list.loadSource && first) loads.bytes.set(0, bytes);
      else if (day) loads.others.set(0, { ...(loads.others.get(0) ?? {}), [id]: bytes });
    }
    // Each history pinned in the engine as the flow's watch names it (ADR 0009 §3): a claim told from it is checked
    // against the bytes the engine hashed, and a run whose claim was told from other bytes holds its day as not judged.
    // Every watch's (ADR 0013 §5): the judged one's is the page's base; a watched step's is read by the engine itself.
    const named = Object.values(state.doc.publish?.watch ?? {}).map(watchHistory);
    for (const [id, entry] of Object.entries(list.histories)) {
      const bytes = id === watched ? pastBytes : await checked(entry.path, entry);
      if (!bytes || !named.includes(entry.path)) continue;
      const file = id === watched ? past : (JSON.parse(new TextDecoder().decode(bytes)) as HistoryFile);
      if (!isHistory(file) || !file.days.length) continue;
      const pin = await pinFile(engine, entry.path, bytes, entry.sha256);
      const ref = { path: pin.name, sha256: pin.sha256, bytes: pin.bytes };
      bases.set(id, { file, ref });
      if (id === watched && flowHistory) historyPin = ref;
    }
    // Each kept sample (ADR 0014 §5), checked, kept here and pinned for the engine under the node's sample path, so a
    // watched step's claim reads it; a source's classifier runs here, from the same file.
    for (const [id, entry] of Object.entries(list.samples)) {
      if (!state.doc.publish?.watch || !Object.keys(state.doc.publish.watch).some((w) => w.toLowerCase() === id.toLowerCase())) continue;
      const bytes = await checked(entry.path, entry);
      const file = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      if (!isSample(file)) continue;
      samples.set(id, file);
      await pinFile(engine, samplePath(id), bytes, entry.sha256);
    }
    if (first) loads.pinned = 0;
    if (first) loads.at = 0;
    state.engine = engine;
    renderLoads();
    await run();
    renderLoads();
    await openBriefFromHash();
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
async function checkList(index: DataList): Promise<void> {
  const d = integrity.data!;
  const bytes = await fetchChecked('MANIFEST.json', { sha256: d.manifest, bytes: d.bytes ?? -1 }, { commit: d.commit, onCheck: (c) => noteCheck(c.class === 'corrupt' ? { ...c, class: 'list' } : c) }).catch((e: unknown) => {
    if (e instanceof IntegrityError && e.check.class === 'corrupt') throw new IntegrityError({ ...e.check, class: 'list' });
    throw e;
  });
  integrity.manifestBytes = bytes;
  const list = JSON.parse(new TextDecoder().decode(bytes)) as { files: { path: string; sha256: string; bytes: number }[] };
  const byPath = new Map(list.files.map((f) => [f.path, f]));
  // Every fixed file, every load and the donor days too (ADR 0009 amendment 1 S13): a fill reads one only if the list
  // has it, by the same sha256.
  const named = namedFiles(index);
  const off = named.find((f) => byPath.get(f.path)?.sha256 !== f.sha256 || byPath.get(f.path)?.bytes !== f.bytes);
  if (off) {
    const check: FileCheck = { path: off.path, class: 'list', expected: off.sha256, actual: byPath.get(off.path)?.sha256 ?? null, commit: d.commit, at: new Date().toISOString() };
    noteCheck(check);
    throw new IntegrityError(check);
  }
}

void start();
