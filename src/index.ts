/**
 * smaltfl's core: pure TypeScript with no DOM or engine imports. The flow document (what people write), its
 * translation into the flow plan (what the machine runs), hashing, keys, the SQL emitter, manifests and identity
 * cards. The runtime plugin (`smaltfl/plugin`) runs plans inside the engine.
 */
import type { FlowDocument } from './core/document.js';
import { translate } from './core/plan.js';
import type { PluginCaller, ReleaseInput, ReleaseResult, RunContext, RunResult, VerifyLevel, VerifyResult } from './core/protocol.js';
import { PLUGIN_NAME } from './core/protocol.js';
import type { ParamValue } from './core/sqltext.js';

export { canonicalJSON } from './core/canonical.js';
export { hashOf, hex, sha256, sha256Hex, unhex, utf8 } from './core/hash.js';
export { DOCUMENT_FORMATS, HOLD_KINDS, documentFormat, validateDocument, withoutDisplay } from './core/document.js';
export type {
  AggregateStep,
  DatasetDef,
  DocumentFormat,
  ExpectationRule,
  ExpectationsStep,
  FilterStep,
  FlowDocument,
  FormulaStep,
  GroupDef,
  HoldKind,
  ProfileDef,
  Issue,
  JoinStep,
  NamedExpr,
  ParameterDef,
  PublishDef,
  SelectStep,
  SourceDef,
  SqlStep,
  StepDef,
  StepKind,
} from './core/document.js';
export { PLAN_FORMATS, PlanError, flowHash, translate, validatePlan } from './core/plan.js';
export type { Column, ColumnType, FlowPlan, PlanFormat, PlanNode, PlanOutput, PlanPublish } from './core/plan.js';
export { shapeOf } from './core/optimize.js';
export type { RunShape } from './core/optimize.js';
export { emitSelect, nodeSelect } from './core/emit.js';
export { checksOver, drift, fillGaps, growForest, isolationForest, isolationPath, madsOf, pathLength, principalComponents, profileColumn, psi, scoreOf, suggestChecks, unusual } from './core/quality.js';
export type { ColumnFacts, Cut, Drift, Forest, Judge, Kind, Profile, Projection, Quantiles, Suggestion, Tree, Unusual } from './core/quality.js';
export { dayLastYear, holidayOf, holidaysOf, isSpecial, seasonOf } from './core/calendar.js';
export { NormalRanges } from './core/normal.js';
export type { Backtest, DailySeries, Guess, NormalOptions, NormalRange, Place, Scale } from './core/normal.js';
export { HISTORY_FORMAT, HistoryRanges, metricKey, seriesOf } from './core/history.js';
export type { DayError, HistoryFile, Metric, ValueHistory } from './core/history.js';
export { isPlaceholder, MATERIAL, newsOf, PLACEHOLDERS, schemaChanges, tableNewsOf } from './core/news.js';
export type { Act, Finding, Look, Names, Severity, TableFacts } from './core/news.js';
export { nodeKey } from './core/keys.js';
export type { KeyEnv } from './core/keys.js';
export { MANIFEST_FORMAT, createIdentity, fingerprint, manifestHash, planHash, planKind, signManifest, verifyManifest } from './core/manifest.js';
export type { DatasetRecord, ExpectationResult, Identity, IdentityCard, ManifestNode, RunManifest, SignatureCheck, SignedManifest } from './core/manifest.js';
export { DECIDE, DECIDE_OPTIONS, checkAction, checkDecision, covers, readView, wrapRead } from './core/policy.js';
export type { ActionCheck, ActionRule, ColumnRule, DecideOption, Group, Policies, Principal, ReadView, RowRule, Rule } from './core/policy.js';
export type { ActRequest, ActionType, Edit, LinkType, ObjectType, Ontology, PropertyType, Reference } from './core/ontology.js';
export { meaningOf, propertyOf } from './core/ontology.js';
export { claimHolds, countedChecks, dayClaim, decisionFor, flowStory, heldOutputs, holdsOf, inputsKey, inputsOf, judgeClaims, pausesOf, reachOf, sameKeys, stagedKeys, standingFor, tripped, waitingOf } from './core/hold.js';
export type { ClaimFacts, DecideAbout, Decided, HeldAbout, HistoryRef, Hold, Inputs, Judged, Pause, ReleaseAbout, StoryClaim } from './core/hold.js';
export { PLUGIN_NAME } from './core/protocol.js';
export type { PluginCaller, ReleaseInput, ReleaseResult, RunContext, RunOptions, RunResult, VerifyCheck, VerifyLevel, VerifyOptions, VerifyResult } from './core/protocol.js';
export type { ParamType, ParamValue } from './core/sqltext.js';

/**
 * Translate a flow document and run its plan in the engine that `db` reaches (which needs the smaltfl plugin). The
 * document goes with the plan: the plugin checks that it hashes to the plan's flow hash, and keeps it with the run.
 * `data` and `log` are recorded in the manifest as the caller's claims (ADR 0006 §4). For a document with a publish
 * block, `claims` are what the story says of each watched source's day (core/hold.ts dayClaim): a run returns what
 * holds it, and only `published` names show its versions (ADR 0009).
 */
export async function runFlow(db: PluginCaller, doc: FlowDocument, options: { smaltdb: string; parameters?: Readonly<Record<string, ParamValue>>; data?: RunContext['data']; log?: RunContext['log']; claims?: RunContext['claims'] }): Promise<RunResult> {
  const plan = await translate(doc, options.parameters ?? {});
  const context: RunContext = { doc, data: options.data ?? null, log: options.log ?? null, ...(options.claims !== undefined ? { claims: options.claims } : {}) };
  return (await db.callPlugin(PLUGIN_NAME, 'run', [plan, { smaltdb: options.smaltdb, context }], { lock: true })) as RunResult;
}

/**
 * Publish a held run's outputs as a decision says (ADR 0009 §5), after the decision is in the record: `decision` is
 * its entry's leaf. The plugin checks it against the run and its stored policies, and returns a refusal, saying why,
 * rather than throwing; either way it keeps the release.
 */
export async function releaseRun(db: PluginCaller, input: ReleaseInput): Promise<ReleaseResult> {
  return (await db.callPlugin(PLUGIN_NAME, 'release', [input], { lock: true })) as ReleaseResult;
}

/**
 * Verify a run: its stored hashes and links; then a recomputation from its snapshots; then, at rederive, its files
 * decoded again. Give `manifest`, the hash the caller holds for the run, to check that the run is that one.
 */
export async function verifyRun(db: PluginCaller, run: number, options: { smaltdb: string; level?: VerifyLevel; manifest?: string }): Promise<VerifyResult> {
  return (await db.callPlugin(PLUGIN_NAME, 'verify', [run, { smaltdb: options.smaltdb, level: options.level ?? 'rerun', ...(options.manifest !== undefined ? { manifest: options.manifest } : {}) }], { lock: true })) as VerifyResult;
}

/** Pin a source file's bytes in the engine (served as smaltfl:<name>), refused unless they hash to `sha256` when given. */
export async function pinFile(db: PluginCaller, name: string, bytes: Uint8Array | null, sha256?: string): Promise<{ name: string; sha256: string; bytes: number }> {
  // A pinned file lives in the engine worker: a new worker (another tab taking over a shared database) gets it again,
  // checked again, from the client's replay of this call.
  return (await db.callPlugin(PLUGIN_NAME, 'pin', [name, bytes, sha256 ?? null], { lock: true, replay: `smaltfl-pin:${name}`, dropReplay: bytes === null })) as { name: string; sha256: string; bytes: number };
}
