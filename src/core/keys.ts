/**
 * Keys (ADR 0004 §6): a node's key is the hash of its plan node in canonical form, with its inputs replaced by
 * their keys, and the engine and smaltfl versions. Merkle-style: a change upstream changes every key downstream.
 * Names, origins and display fields are not in it, so renaming a dataset or moving a card rebuilds nothing.
 */
import { hashOf } from './hash.js';
import type { PlanNode } from './plan.js';

/** The versions a key depends on: what executes the node. */
export interface KeyEnv {
  smaltdb: string;
  smaltfl: string;
}

/** What a node's key covers. A snapshot is identified by its content alone, not by the table it came from. */
export function keyMaterial(node: PlanNode, inputKeys: readonly string[], snapshot?: string): unknown {
  if (node.op === 'table') {
    if (!snapshot) throw new Error('a snapshot key needs the snapshot content hash');
    return { op: 'snapshot', content: snapshot };
  }
  const { origin: _origin, inputs: _inputs, schema: _schema, ...rest } = node;
  return { ...rest, inputs: [...inputKeys] };
}

export function nodeKey(node: PlanNode, inputKeys: readonly string[], env: KeyEnv, snapshot?: string): Promise<string> {
  return hashOf('key/0', { node: keyMaterial(node, inputKeys, snapshot), engine: { smaltdb: env.smaltdb, smaltfl: env.smaltfl } });
}
