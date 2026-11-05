/**
 * Where each card sits on the canvas: rows by depth, with a source or side branch placed just above the step that
 * reads it, so the main line runs straight down and side inputs join it from the right.
 */
import type { FlowDocument } from '../core/document.js';

export interface Placed {
  id: string;
  row: number;
  col: number;
}

export function placeCards(doc: FlowDocument): { cards: Placed[]; rows: number; cols: number } {
  const ids = [...doc.sources.map((s) => s.id), ...doc.steps.map((s) => s.id)];
  const inputs = new Map<string, string[]>([...doc.sources.map((s) => [s.id, []] as [string, string[]]), ...doc.steps.map((s) => [s.id, s.inputs] as [string, string[]])]);
  const consumers = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [id, ins] of inputs) for (const i of ins) consumers.get(i)?.push(id);
  const depth = new Map<string, number>();
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const d = Math.max(-1, ...(inputs.get(id) ?? []).map(visit)) + 1;
    depth.set(id, d);
    return d;
  };
  ids.forEach(visit);
  // Latest-possible rows for anything that feeds a single later step: walk from the bottom up.
  const order = [...ids].sort((a, b) => depth.get(b)! - depth.get(a)!);
  for (const id of order) {
    const cs = consumers.get(id)!;
    if (cs.length === 0) continue;
    depth.set(id, Math.max(depth.get(id)!, Math.min(...cs.map((c) => depth.get(c)!)) - 1));
  }
  const rows = Math.max(...depth.values()) + 1;
  const cards: Placed[] = [];
  const colOf = new Map<string, number>();
  for (let r = 0; r < rows; r++) {
    const here = ids.filter((id) => depth.get(id) === r);
    const bary = (id: string) => {
      const ins = (inputs.get(id) ?? []).map((i) => colOf.get(i)).filter((c): c is number => c !== undefined);
      return ins.length ? ins.reduce((a, b) => a + b, 0) / ins.length : Number.POSITIVE_INFINITY;
    };
    here.sort((a, b) => bary(a) - bary(b) || ids.indexOf(a) - ids.indexOf(b));
    here.forEach((id, col) => {
      colOf.set(id, col);
      cards.push({ id, row: r, col });
    });
  }
  return { cards, rows, cols: Math.max(...cards.map((c) => c.col)) + 1 };
}
