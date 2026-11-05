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

/** World coordinates of the grid canvas, in pixels at zoom 1. */
export const GRID = { cardW: 176, cardH: 64, gapX: 40, gapY: 26, pad: 14, head: 28, groupGapX: 56, groupGapY: 34 };

export interface GridFrame {
  id: string;
  name: string;
  members: string[];
  collapsed: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridLayout {
  /** Each card's top-left corner; members of a folded section share the section's card. */
  cards: Map<string, { x: number; y: number }>;
  frames: GridFrame[];
  width: number;
  height: number;
}

/**
 * An open grid, left to right (ARCHITECTURE.md §13). Sections are laid out as blocks, each placed one column after
 * the sections it reads from, so a section of reference data (or one source on its own) sits just before the steps
 * it feeds rather than at the top. Inside a block, a member's column is its depth among the section's members.
 * Positions the document's layout gives (dragged cards) win over the automatic ones, and frames then fit around
 * their members.
 */
export function gridLayout(doc: FlowDocument, collapsed: ReadonlySet<string>): GridLayout {
  const ids = [...doc.sources.map((s) => s.id), ...doc.steps.map((s) => s.id)];
  const inputs = new Map<string, string[]>(ids.map((id) => [id, doc.steps.find((s) => s.id === id)?.inputs ?? []]));
  const groups = (doc.groups ?? []).map((g) => ({ id: g.id, name: g.name, members: g.steps.filter((m) => inputs.has(m)), frame: true }));
  const grouped = new Set(groups.flatMap((g) => g.members));
  for (const id of ids) if (!grouped.has(id)) groups.push({ id: `_${id}`, name: id, members: [id], frame: false });
  const groupOf = new Map(groups.flatMap((g, gi) => g.members.map((m) => [m, gi] as const)));
  // Section-level depth: one column after every section read from, then pulled right to just before its first reader.
  const reads = groups.map((_, gi) => new Set<number>());
  for (const [id, ins] of inputs) for (const i of ins) if (groupOf.get(i) !== groupOf.get(id)) reads[groupOf.get(id)!]!.add(groupOf.get(i)!);
  const depth = new Map<number, number>();
  const visit = (gi: number, seen: Set<number>): number => {
    if (depth.has(gi)) return depth.get(gi)!;
    if (seen.has(gi)) return 0;
    seen.add(gi);
    const d = Math.max(-1, ...[...reads[gi]!].map((r) => visit(r, seen))) + 1;
    depth.set(gi, d);
    return d;
  };
  groups.forEach((_, gi) => visit(gi, new Set()));
  const readers = groups.map((_, gi) => groups.map((__, gj) => gj).filter((gj) => reads[gj]!.has(gi)));
  for (const gi of [...groups.keys()].sort((a, b) => depth.get(b)! - depth.get(a)!)) {
    if (readers[gi]!.length) depth.set(gi, Math.max(depth.get(gi)!, Math.min(...readers[gi]!.map((r) => depth.get(r)!)) - 1));
  }
  // Inside each section: columns by depth among its members, rows by the order members arrive.
  const local = new Map<string, { col: number; row: number }>();
  const size = groups.map((g, gi) => {
    if (collapsed.has(g.id)) return { cols: 1, rows: 1 };
    const d = new Map<string, number>();
    const at = (id: string): number => d.get(id) ?? (d.set(id, Math.max(-1, ...inputs.get(id)!.filter((i) => groupOf.get(i) === gi).map(at)) + 1), d.get(id)!);
    g.members.forEach(at);
    const rows = new Map<number, number>();
    for (const m of g.members) {
      const col = d.get(m)!;
      const row = rows.get(col) ?? 0;
      rows.set(col, row + 1);
      local.set(m, { col, row });
    }
    return { cols: Math.max(...d.values()) + 1, rows: Math.max(...rows.values()) };
  });
  const { cardW, cardH, gapX, gapY, pad, head, groupGapX, groupGapY } = GRID;
  const blockW = (gi: number) => (groups[gi]!.frame ? 2 * pad : 0) + size[gi]!.cols * cardW + (size[gi]!.cols - 1) * gapX;
  const blockH = (gi: number) => (groups[gi]!.frame ? head + pad : 0) + size[gi]!.rows * cardH + (size[gi]!.rows - 1) * gapY;
  const columns = [...new Set(depth.values())].sort((a, b) => a - b);
  const cards = new Map<string, { x: number; y: number }>();
  const frames: GridFrame[] = [];
  let x = 0;
  let height = 0;
  for (const c of columns) {
    const here = [...groups.keys()].filter((gi) => depth.get(gi) === c);
    let y = 0;
    for (const gi of here) {
      const g = groups[gi]!;
      const ox = x + (g.frame ? pad : 0);
      const oy = y + (g.frame ? head : 0);
      if (collapsed.has(g.id)) for (const m of g.members) cards.set(m, { x: ox, y: oy });
      else for (const m of g.members) cards.set(m, { x: ox + local.get(m)!.col * (cardW + gapX), y: oy + local.get(m)!.row * (cardH + gapY) });
      if (g.frame) frames.push({ id: g.id, name: g.name, members: g.members, collapsed: collapsed.has(g.id), x, y, w: blockW(gi), h: blockH(gi) });
      y += blockH(gi) + groupGapY;
    }
    height = Math.max(height, y - groupGapY);
    x += Math.max(...here.map(blockW)) + groupGapX;
  }
  // Dragged cards keep their place; their sections fit around them.
  const placed = doc.layout ?? {};
  for (const [id, [px, py]] of Object.entries(placed)) if (cards.has(id) && !frames.some((f) => f.collapsed && f.members.includes(id))) cards.set(id, { x: px, y: py });
  for (const f of frames) {
    if (f.collapsed || !f.members.some((m) => m in placed)) continue;
    const xs = f.members.map((m) => cards.get(m)!);
    f.x = Math.min(...xs.map((p) => p.x)) - pad;
    f.y = Math.min(...xs.map((p) => p.y)) - head;
    f.w = Math.max(...xs.map((p) => p.x)) + cardW + pad - f.x;
    f.h = Math.max(...xs.map((p) => p.y)) + cardH + pad - f.y;
  }
  const all = [...cards.values()];
  return {
    cards,
    frames,
    width: Math.max(x - groupGapX, ...all.map((p) => p.x + cardW), ...frames.map((f) => f.x + f.w)),
    height: Math.max(height, ...all.map((p) => p.y + cardH), ...frames.map((f) => f.y + f.h)),
  };
}
