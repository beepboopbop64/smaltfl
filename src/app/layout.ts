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

export interface SectionLayout {
  id: string;
  name: string;
  members: string[];
  collapsed: boolean;
  /** The members' rows and columns inside the section (empty when collapsed). */
  cards: Placed[];
  rows: number;
  cols: number;
}

/**
 * The canvas in sections: the document's groups, in the order the document gives them (the author's reading order),
 * each laid out on its own grid, one row per depth among its members. Sources and steps no group holds form a last
 * section.
 */
export function placeSections(doc: FlowDocument, collapsed: ReadonlySet<string>): SectionLayout[] {
  const { cards } = placeCards(doc);
  const row = new Map(cards.map((c) => [c.id, c.row]));
  const groups = (doc.groups ?? []).map((g) => ({ id: g.id, name: g.name, members: g.steps.filter((s) => row.has(s)) }));
  const grouped = new Set(groups.flatMap((g) => g.members));
  const rest = [...row.keys()].filter((id) => !grouped.has(id));
  if (rest.length) groups.push({ id: '_other', name: 'Other steps', members: rest });
  return groups
    .filter((g) => g.members.length > 0)
    .map((g) => {
      const depths = [...new Set(g.members.map((m) => row.get(m)!))].sort((a, b) => a - b);
      const placed: Placed[] = [];
      for (const [r, d] of depths.entries()) g.members.filter((m) => row.get(m) === d).forEach((id, col) => placed.push({ id, row: r, col }));
      const isCollapsed = collapsed.has(g.id);
      return { ...g, collapsed: isCollapsed, cards: isCollapsed ? [] : placed, rows: isCollapsed ? 1 : depths.length, cols: Math.max(1, ...placed.map((c) => c.col + 1)) };
    });
}
