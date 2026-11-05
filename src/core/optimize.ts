/**
 * smaltfl's optimizer: across steps (ADR 0004 §5). The engine optimizes within each statement; this decides which
 * nodes a run computes at all, and which it stores rather than folds into the statement of the node that reads them.
 */
import type { FlowPlan } from './plan.js';

export interface RunShape {
  /** The nodes a run computes: every output and expectation, and what they read. Ascending. */
  needed: number[];
  /** The needed nodes that are stored: sources (as snapshots), outputs, and nodes read more than once. */
  stored: Set<number>;
}

/**
 * Which nodes run, and which are stored. A node is stored when it is a source (its snapshot), an output, or read by
 * more than one needed node (so it is computed once). Every other needed node is folded into the statement of the
 * node that reads it. Expectations always run, whether or not anything reads them; their counts are recorded by key,
 * so they don't need their rows stored.
 */
export function shapeOf(plan: FlowPlan): RunShape {
  const roots = new Set<number>(plan.outputs.map((o) => o.node));
  plan.nodes.forEach((n, i) => n.op === 'expect' && roots.add(i));
  const needed = new Set<number>();
  const visit = (i: number) => {
    if (needed.has(i)) return;
    needed.add(i);
    for (const j of plan.nodes[i]!.inputs) visit(j);
  };
  for (const r of roots) visit(r);
  const readers = new Map<number, number>();
  for (const i of needed) for (const j of plan.nodes[i]!.inputs) readers.set(j, (readers.get(j) ?? 0) + 1);
  const stored = new Set<number>();
  for (const i of needed) {
    const n = plan.nodes[i]!;
    if (n.op === 'table' || plan.outputs.some((o) => o.node === i) || (readers.get(i) ?? 0) > 1) stored.add(i);
  }
  return { needed: [...needed].sort((a, b) => a - b), stored };
}

/** The folded nodes a stored node's statement computes, inputs first. */
export function foldedInto(plan: FlowPlan, node: number, isStored: (i: number) => boolean): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const visit = (i: number) => {
    for (const j of plan.nodes[i]!.inputs) {
      if (isStored(j) || seen.has(j)) continue;
      seen.add(j);
      visit(j);
      out.push(j);
    }
  };
  visit(node);
  return out;
}
