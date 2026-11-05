/**
 * Where each card sits on the canvas: an open grid, left to right (ARCHITECTURE.md §13). The automatic layout places
 * sections as blocks; an arrangement (the document's display-only layout) pins cards, and empty sections, where a
 * person put them.
 */
import type { FlowDocument, GroupColor } from '../core/document.js';

/** World coordinates of the grid canvas, in pixels at zoom 1. */
export const GRID = { cardW: 176, cardH: 64, gapX: 40, gapY: 26, pad: 14, head: 28, groupGapX: 56, groupGapY: 34 };

export interface GridFrame {
  id: string;
  name: string;
  color?: GroupColor;
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
  /** The bounds of everything drawn: cards can be placed left of or above the automatic layout's origin. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The layout key that holds where an empty section sits. */
export const groupKey = (id: string): string => `group:${id}`;

/**
 * Sections are laid out as blocks, each placed one column after the sections it reads from, so a section of reference
 * data (or one source on its own) sits just before the steps it feeds rather than at the top. Inside a block, a
 * member's column is its depth among the section's members. Positions the document's layout gives win over the
 * automatic ones, and frames then fit around their members; a folded section's card sits at its members' top-left
 * corner. An empty section sits where it was left, or after everything else.
 */
export function gridLayout(doc: FlowDocument, collapsed: ReadonlySet<string>): GridLayout {
  const ids = [...doc.sources.map((s) => s.id), ...doc.steps.map((s) => s.id)];
  const inputs = new Map<string, string[]>(ids.map((id) => [id, doc.steps.find((s) => s.id === id)?.inputs ?? []]));
  const declared = (doc.groups ?? []).map((g) => ({ id: g.id, name: g.name, color: g.color, members: g.steps.filter((m) => inputs.has(m)), frame: true }));
  const empty = declared.filter((g) => g.members.length === 0);
  const groups = declared.filter((g) => g.members.length > 0);
  const grouped = new Set(groups.flatMap((g) => g.members));
  for (const id of ids) if (!grouped.has(id)) groups.push({ id: `_${id}`, name: id, color: undefined, members: [id], frame: false });
  const groupOf = new Map(groups.flatMap((g, gi) => g.members.map((m) => [m, gi] as const)));
  // Section-level depth: one column after every section read from, then pulled right to just before its first reader.
  const reads = groups.map(() => new Set<number>());
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
  for (const c of columns) {
    const here = [...groups.keys()].filter((gi) => depth.get(gi) === c);
    let y = 0;
    for (const gi of here) {
      const g = groups[gi]!;
      const ox = x + (g.frame ? pad : 0);
      const oy = y + (g.frame ? head : 0);
      if (collapsed.has(g.id)) for (const m of g.members) cards.set(m, { x: ox, y: oy });
      else for (const m of g.members) cards.set(m, { x: ox + local.get(m)!.col * (cardW + gapX), y: oy + local.get(m)!.row * (cardH + gapY) });
      if (g.frame) frames.push({ id: g.id, name: g.name, color: g.color, members: g.members, collapsed: collapsed.has(g.id), x, y, w: blockW(gi), h: blockH(gi) });
      y += blockH(gi) + groupGapY;
    }
    x += Math.max(...here.map(blockW)) + groupGapX;
  }
  const placed = doc.layout ?? {};
  let emptyY = 0;
  for (const g of empty) {
    const at = placed[groupKey(g.id)];
    frames.push({ id: g.id, name: g.name, color: g.color, members: [], collapsed: false, x: at ? at[0] : x, y: at ? at[1] : emptyY, w: cardW + 2 * pad, h: head + cardH + pad });
    if (!at) emptyY += head + cardH + pad + groupGapY;
  }
  // Placed cards keep their place, a folded section's members too; their sections fit around them.
  for (const [id, p] of Object.entries(placed)) if (cards.has(id)) cards.set(id, { x: p[0], y: p[1] });
  for (const f of frames) {
    if (f.members.length === 0 || !f.members.some((m) => m in placed)) continue;
    const ps = f.members.map((m) => cards.get(m)!);
    const x0 = Math.min(...ps.map((p) => p.x));
    const y0 = Math.min(...ps.map((p) => p.y));
    if (f.collapsed) {
      for (const m of f.members) cards.set(m, { x: x0, y: y0 });
      Object.assign(f, { x: x0 - pad, y: y0 - head, w: cardW + 2 * pad, h: head + cardH + pad });
    } else {
      Object.assign(f, { x: x0 - pad, y: y0 - head, w: Math.max(...ps.map((p) => p.x)) + cardW + pad - (x0 - pad), h: Math.max(...ps.map((p) => p.y)) + cardH + pad - (y0 - head) });
    }
  }
  const all = [...cards.values()];
  const left = Math.min(0, ...all.map((p) => p.x), ...frames.map((f) => f.x));
  const top = Math.min(0, ...all.map((p) => p.y), ...frames.map((f) => f.y));
  const right = Math.max(x - groupGapX, ...all.map((p) => p.x + cardW), ...frames.map((f) => f.x + f.w));
  const bottom = Math.max(0, ...all.map((p) => p.y + cardH), ...frames.map((f) => f.y + f.h));
  return { cards, frames, left, top, width: right - left, height: bottom - top };
}

/**
 * Every card's place, written down: the layout an arrangement edit starts from, so that moving or folding one thing
 * leaves everything else where it is. A folded section's steps keep their arrangement, unfolding from its card.
 */
export function pinLayout(doc: FlowDocument, collapsed: ReadonlySet<string>): Record<string, [number, number]> {
  const now = gridLayout(doc, collapsed);
  const open = gridLayout(doc, new Set());
  const layout: Record<string, [number, number]> = { ...(doc.layout ?? {}) };
  for (const f of now.frames) {
    if (!f.collapsed || f.members.length === 0) continue;
    const at = now.cards.get(f.members[0]!)!;
    const of = open.frames.find((o) => o.id === f.id)!;
    for (const m of f.members) {
      if (m in layout) continue;
      const o = open.cards.get(m)!;
      layout[m] = [at.x + o.x - (of.x + GRID.pad), at.y + o.y - (of.y + GRID.head)];
    }
  }
  for (const [id, p] of now.cards) if (!(id in layout)) layout[id] = [p.x, p.y];
  for (const f of now.frames) if (f.members.length === 0) layout[groupKey(f.id)] = [f.x, f.y];
  return layout;
}

/**
 * The section a point falls in: the last drawn (the one on top) when sections overlap, or else the nearest one within
 * `slack`, so a drop just short of a small section, far out on a phone, still lands in it.
 */
export function frameAt(l: GridLayout, x: number, y: number, slack = 0): GridFrame | undefined {
  const inside = [...l.frames].reverse().find((f) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
  if (inside || slack <= 0) return inside;
  let near: GridFrame | undefined;
  let best = slack;
  for (const f of l.frames) {
    const d = Math.hypot(Math.max(f.x - x, 0, x - f.x - f.w), Math.max(f.y - y, 0, y - f.y - f.h));
    if (d <= best) [near, best] = [f, d];
  }
  return near;
}

/**
 * A place for one more card in a section: the first slot of its grid, row by row, that no other card covers, so a
 * step moved into a section without dragging lands inside it.
 */
export function freeSlot(l: GridLayout, frame: GridFrame, card: string): { x: number; y: number } {
  const { cardW, cardH, gapX, gapY, pad, head } = GRID;
  const x0 = frame.x + pad;
  const y0 = frame.y + head;
  const others = [...l.cards.entries()].filter(([id]) => id !== card).map(([, p]) => p);
  const free = (x: number, y: number) => others.every((p) => Math.abs(p.x - x) >= cardW + gapX / 2 || Math.abs(p.y - y) >= cardH + gapY / 2);
  const cols = Math.max(1, Math.round((frame.w - 2 * pad + gapX) / (cardW + gapX)));
  for (let r = 0; r < 200; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cardW + gapX);
      const y = y0 + r * (cardH + gapY);
      if (free(x, y)) return { x, y };
    }
  }
  return { x: frame.x + frame.w + gapX, y: y0 };
}
