/**
 * smaltfl's core: pure TypeScript with no DOM or engine imports. The flow document (what people write), its
 * translation into the flow plan (what the machine runs), hashing, keys, the SQL emitter, manifests and identity
 * cards. The runtime plugin (`smaltfl/plugin`) runs plans inside the engine.
 */
import type { FlowDocument } from './core/document.js';
import { translate } from './core/plan.js';
import type { PluginCaller, RunResult, VerifyResult } from './core/protocol.js';
import { PLUGIN_NAME } from './core/protocol.js';
import type { ParamValue } from './core/sqltext.js';

export { canonicalJSON } from './core/canonical.js';
export { hashOf, hex, sha256, sha256Hex, unhex, utf8 } from './core/hash.js';
export { DOCUMENT_FORMAT, validateDocument, withoutDisplay } from './core/document.js';
export type {
  AggregateStep,
  DatasetDef,
  ExpectationRule,
  ExpectationsStep,
  FilterStep,
  FlowDocument,
  FormulaStep,
  GroupDef,
  Issue,
  JoinStep,
  NamedExpr,
  ParameterDef,
  SelectStep,
  SourceDef,
  SqlStep,
  StepDef,
  StepKind,
} from './core/document.js';
export { PLAN_FORMAT, PlanError, flowHash, translate, validatePlan } from './core/plan.js';
export type { Column, ColumnType, FlowPlan, PlanNode, PlanOutput } from './core/plan.js';
export { shapeOf } from './core/optimize.js';
export type { RunShape } from './core/optimize.js';
export { emitSelect, nodeSelect } from './core/emit.js';
export { drift, fillGaps, isolationForest, madsOf, profileColumn, psi, suggestChecks, unusual } from './core/quality.js';
export type { ColumnFacts, Drift, Kind, Profile, Quantiles, Suggestion, Unusual } from './core/quality.js';
export { nodeKey } from './core/keys.js';
export type { KeyEnv } from './core/keys.js';
export { MANIFEST_FORMAT, createIdentity, fingerprint, manifestHash, planHash, signManifest, verifyManifest } from './core/manifest.js';
export type { DatasetRecord, ExpectationResult, Identity, IdentityCard, ManifestNode, RunManifest, SignatureCheck, SignedManifest } from './core/manifest.js';
export { checkAction, covers, readView, wrapRead } from './core/policy.js';
export type { ActionCheck, ActionRule, ColumnRule, Group, Policies, Principal, ReadView, RowRule, Rule } from './core/policy.js';
export type { ActRequest, ActionType, Edit, LinkType, ObjectType, Ontology } from './core/ontology.js';
export { PLUGIN_NAME } from './core/protocol.js';
export type { PluginCaller, RunOptions, RunResult, VerifyCheck, VerifyResult } from './core/protocol.js';
export type { ParamType, ParamValue } from './core/sqltext.js';

/** Translate a flow document and run its plan in the engine that `db` reaches (which needs the smaltfl plugin). */
export async function runFlow(db: PluginCaller, doc: FlowDocument, options: { smaltdb: string; parameters?: Readonly<Record<string, ParamValue>> }): Promise<RunResult> {
  const plan = await translate(doc, options.parameters ?? {});
  return (await db.callPlugin(PLUGIN_NAME, 'run', [plan, { smaltdb: options.smaltdb }], { lock: true })) as RunResult;
}

/** Verify a run: its stored hashes, then a recomputation from its snapshots. */
export async function verifyRun(db: PluginCaller, run: number, options: { smaltdb: string }): Promise<VerifyResult> {
  return (await db.callPlugin(PLUGIN_NAME, 'verify', [run, { smaltdb: options.smaltdb }], { lock: true })) as VerifyResult;
}
