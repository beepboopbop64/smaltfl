/**
 * Actions (ARCHITECTURE.md §7 and §8). The runtime reads the object's row from its dataset itself, asks the policy
 * whether the actor may run the action on that row, and records the outcome either way: an edit, or a refusal with
 * its reason. Each record's hash covers it and the hash before it, so the history can't be changed unnoticed. The
 * chain is extended in one synchronous transaction (with the synchronous SHA-256), so two actions can't fork it.
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import { utf8 } from '../core/hash.js';
import type { ActRequest, Edit, Ontology } from '../core/ontology.js';
import type { Policies } from '../core/policy.js';
import { checkAction } from '../core/policy.js';
import { sha256HexSync } from '../core/sha256.js';
import { literal, quoteIdent } from '../core/sqltext.js';
import { RunError } from './runtime.js';
import { ensureStore, inTransaction } from './store.js';

export interface ActInput {
  ontology: Ontology;
  policies?: Policies;
  /** The table or view each object type's dataset is read from: a dataset's name, for one the flow stores. */
  tables: Record<string, string>;
  request: ActRequest;
}

const editHash = (e: Omit<Edit, 'hash'>) => sha256HexSync(utf8(`smaltfl/edit/0\n${canonicalJSON(e)}`));

export async function act(db: Database, input: ActInput): Promise<Edit> {
  ensureStore(db);
  const { ontology, policies, tables, request } = input;
  const action = ontology.actionTypes.find((a) => a.id === request.action);
  if (!action) throw new RunError(`no action ${request.action}`);
  const type = ontology.objectTypes.find((t) => t.id === action.on)!;
  const table = tables[type.dataset];
  if (!table) throw new RunError(`${type.name}'s dataset ${type.dataset} isn't stored yet: run the flow first`);
  for (const k of type.key) if (!(k in request.key)) throw new RunError(`the object needs its key ${k}`);
  for (const p of action.params) {
    const v = request.params[p.name];
    const ok = v === null || v === undefined ? false : p.type === 'text' ? typeof v === 'string' && v.trim() !== '' : typeof v === 'number' && Number.isFinite(v) && (p.type === 'real' || Number.isInteger(v));
    if (!ok) throw new RunError(`${p.label} needs a ${p.type === 'text' ? 'value' : p.type === 'integer' ? 'whole number' : 'number'}`);
  }
  const where = type.key.map((k) => `${quoteIdent(k)} = ${typeof request.key[k] === 'number' ? String(request.key[k]) : literal(request.key[k] === null ? null : String(request.key[k]), 'text')}`).join(' AND ');
  const rows = await db.queryAsync(`SELECT * FROM ${quoteIdent(table)} WHERE ${where} LIMIT 2`);
  const row = rows.rows.length === 1 ? Object.fromEntries(rows.columns.map((c, i) => [c, rows.rows[0]![i]])) : null;
  const verdict = row ? checkAction(policies, action.id, request.actor, row) : { allowed: false as const, reason: rows.rows.length ? 'the key matches more than one object' : 'no such object' };
  const object = canonicalJSON(Object.fromEntries(type.key.map((k) => [k, request.key[k] ?? null])));
  const params = Object.fromEntries(action.params.map((p) => [p.name, request.params[p.name] ?? null]));
  return inTransaction(db, () => {
    const last = db.query('SELECT seq, hash FROM _smaltfl_edits ORDER BY seq DESC LIMIT 1').rows[0];
    const body: Omit<Edit, 'hash'> = {
      seq: last ? Number(last[0]) + 1 : 1,
      action: action.id,
      objectType: type.id,
      object,
      params,
      actor: request.actor,
      at: new Date().toISOString(),
      outcome: verdict.allowed ? 'applied' : 'refused',
      reason: verdict.reason,
      prev: last ? String(last[1]) : null,
    };
    const edit: Edit = { ...body, hash: editHash(body) };
    db.run('INSERT INTO _smaltfl_edits(seq, action, object_type, object, params, actor, at, outcome, reason, prev, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      edit.seq, edit.action, edit.objectType, edit.object, canonicalJSON(edit.params), edit.actor, edit.at, edit.outcome, edit.reason, edit.prev, edit.hash,
    ]);
    return edit;
  });
}

export function listEdits(db: Database): Edit[] {
  ensureStore(db);
  return db.query('SELECT seq, action, object_type, object, params, actor, at, outcome, reason, prev, hash FROM _smaltfl_edits ORDER BY seq').rows.map((r) => ({
    seq: Number(r[0]),
    action: String(r[1]),
    objectType: String(r[2]),
    object: String(r[3]),
    params: JSON.parse(String(r[4])) as Edit['params'],
    actor: String(r[5]),
    at: String(r[6]),
    outcome: r[7] === 'applied' ? 'applied' : 'refused',
    reason: String(r[8]),
    prev: r[9] === null ? null : String(r[9]),
    hash: String(r[10]),
  }));
}

/** Recompute the chain: the first record whose hash or link doesn't hold, if any. */
export function verifyEdits(db: Database): { ok: boolean; edits: number; broken?: number } {
  const edits = listEdits(db);
  let prev: string | null = null;
  for (const e of edits) {
    const { hash, ...body } = e;
    if (e.prev !== prev || editHash(body) !== hash) return { ok: false, edits: edits.length, broken: e.seq };
    prev = hash;
  }
  return { ok: true, edits: edits.length };
}
