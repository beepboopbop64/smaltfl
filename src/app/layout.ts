/**
 * Where each card sits on the canvas: an open grid, left to right (ARCHITECTURE.md §13). The automatic layout gives
 * each card a column and each section a lane; an arrangement (the document's display-only layout) pins cards, and
 * empty sections, where a person put them.
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
 * The automatic layout, on columns that run left to right:
 *
 * - **Columns, per card.** Every card first goes as late as it can, just before the first step that reads it; then
 *   every card that reads something comes back to just after its last input. So an input sits just before the step
 *   that first reads it, a side branch follows what it reads, and most edges join neighbouring columns.
 * - **Lanes, per section.** A section spans its cards' columns. Sections take horizontal lanes in the order they
 *   start, each in the lane, free over its columns, nearest the sections it is joined to: a chain of sections runs
 *   along one lane, and a section that shares columns with it sits in the next.
 * - **Rows, inside a section.** Each card takes the first row free at its column, keeping clear the way out to a step
 *   in another section that reads it, and the way in from one it reads, so no card sits on an edge that crosses a
 *   section's border.
 *
 * A folded section is one card, in the column where its edges are shortest, after everything it reads and, where it
 * can be, before everything that reads it; a column left empty closes up. Positions the document's layout gives win over the
 * automatic ones, and frames then fit around their members; a folded section's card sits at its members' top-left
 * corner. An empty section sits where it was left, or after everything else.
 */
export function gridLayout(doc: FlowDocument, collapsed: ReadonlySet<string>): GridLayout {
  const ids = [...doc.sources.map((s) => s.id), ...doc.steps.map((s) => s.id)];
  const known = new Set(ids);
  const inputs = new Map<string, string[]>(ids.map((id) => [id, (doc.steps.find((s) => s.id === id)?.inputs ?? []).filter((i) => known.has(i) && i !== id)]));
  const consumers = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [id, ins] of inputs) for (const i of ins) consumers.get(i)!.push(id);
  // Inputs before what reads them (a cycle, in a document that isn't valid, just goes last).
  const order: string[] = [];
  const waiting = new Map(ids.map((id) => [id, inputs.get(id)!.length]));
  const ready = ids.filter((id) => waiting.get(id) === 0);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const c of consumers.get(id)!) if (waiting.set(c, waiting.get(c)! - 1).get(c) === 0) ready.push(c);
  }
  for (const id of ids) if (!order.includes(id)) order.push(id);

  const col = new Map<string, number>();
  const colOf = (id: string) => col.get(id) ?? 0;
  for (const id of order) col.set(id, Math.max(-1, ...inputs.get(id)!.map(colOf)) + 1);
  const end = Math.max(0, ...col.values());
  for (const id of [...order].reverse()) {
    const cs = consumers.get(id)!;
    col.set(id, cs.length ? Math.min(...cs.map(colOf)) - 1 : end);
  }
  for (const id of order) if (inputs.get(id)!.length) col.set(id, Math.max(...inputs.get(id)!.map(colOf)) + 1);

  const declared = (doc.groups ?? []).map((g) => ({ id: g.id, name: g.name, color: g.color, members: g.steps.filter((m) => known.has(m)), frame: true }));
  const empty = declared.filter((g) => g.members.length === 0);
  const groups = declared.filter((g) => g.members.length > 0);
  const grouped = new Set(groups.flatMap((g) => g.members));
  for (const id of ids) if (!grouped.has(id)) groups.push({ id: `_${id}`, name: id, color: undefined, members: [id], frame: false });
  const groupOf = new Map(groups.flatMap((g, gi) => g.members.map((m) => [m, gi] as const)));
  for (const g of groups) g.members.sort((a, b) => colOf(a) - colOf(b) || ids.indexOf(a) - ids.indexOf(b));
  const folded = (gi: number) => groups[gi]!.frame && collapsed.has(groups[gi]!.id);
  const outside = (gi: number) => (id: string) => groupOf.get(id) !== gi;
  const span = groups.map((g, gi) => {
    const cs = g.members.map(colOf);
    const e = Math.max(...cs);
    if (!folded(gi)) return { s: Math.min(...cs), e };
    const ins = g.members.flatMap((m) => inputs.get(m)!.filter(outside(gi)).map(colOf));
    const outs = g.members.flatMap((m) => consumers.get(m)!.filter(outside(gi)).map(colOf));
    const lo = Math.max(-1, ...ins) + 1;
    const hi = outs.length ? Math.min(...outs) - 1 : Infinity;
    // Where its edges are shortest: next to what it reads when more edges come in than go out, else just before what
    // reads it; never before something it reads.
    const want = ins.length > outs.length ? lo : ins.length < outs.length ? hi : e;
    const at = Math.max(lo, Math.min(want, hi));
    return { s: at, e: at };
  });

  const links = groups.map(() => new Set<number>());
  for (const [id, ins] of inputs) {
    for (const i of ins) {
      const [a, b] = [groupOf.get(i)!, groupOf.get(id)!];
      if (a !== b) (links[a]!.add(b), links[b]!.add(a));
    }
  }
  const lanes: number[][] = [];
  const laneOf = new Map<number, number>();
  const fits = (lane: number[], gi: number) => lane.every((gj) => span[gj]!.e < span[gi]!.s || span[gj]!.s > span[gi]!.e);
  for (const gi of [...groups.keys()].sort((a, b) => span[a]!.s - span[b]!.s || a - b)) {
    let best = lanes.length;
    let cost = Infinity;
    for (let l = 0; l <= lanes.length; l++) {
      if (l < lanes.length && !fits(lanes[l]!, gi)) continue;
      const c = [...links[gi]!].filter((gj) => laneOf.has(gj)).reduce((sum, gj) => sum + Math.abs(laneOf.get(gj)! - l), 0) + l / 1000;
      if (c < cost) [best, cost] = [l, c];
    }
    if (best === lanes.length) lanes.push([]);
    lanes[best]!.push(gi);
    laneOf.set(gi, best);
  }

  const row = new Map<string, number>();
  const rows = groups.map((g, gi) => {
    if (folded(gi)) return 1;
    const taken = new Set<string>();
    const { s, e } = span[gi]!;
    for (const m of g.members) {
      const c = colOf(m);
      const ins = inputs.get(m)!.filter(outside(gi)).map(colOf);
      const from = ins.length ? Math.max(s, Math.max(...ins) + 1) : c;
      let r = 0;
      const clear = (r: number) => {
        for (let k = from; k <= c; k++) if (taken.has(`${k},${r}`)) return false;
        return true;
      };
      while (!clear(r)) r++;
      taken.add(`${c},${r}`);
      row.set(m, r);
      const outs = consumers.get(m)!.filter(outside(gi)).map(colOf);
      for (let k = c + 1; k <= Math.min(e, Math.max(c, ...outs) - 1); k++) taken.add(`${k},${r}`);
    }
    return Math.max(...g.members.map((m) => row.get(m)!)) + 1;
  });

  const { cardW, cardH, gapX, gapY, pad, head, groupGapX, groupGapY } = GRID;
  const laneTop: number[] = [];
  let y = 0;
  for (const lane of lanes) {
    const n = Math.max(1, ...lane.map((gi) => rows[gi]!));
    laneTop.push(y);
    y += head + n * cardH + (n - 1) * gapY + pad + groupGapY;
  }
  const shownCol = (m: string) => (folded(groupOf.get(m)!) ? span[groupOf.get(m)!]!.s : colOf(m));
  const used = [...new Set(ids.map(shownCol))].sort((a, b) => a - b);
  const index = new Map(used.map((c, k) => [c, k]));
  // Between columns: the gap inside a section, or, where a section ends or starts in any lane, room for both frames.
  const boundary = (k: number) => groups.some((g, gi) => g.frame && (index.get(span[gi]!.e) === k || index.get(span[gi]!.s) === k + 1));
  const xs: number[] = [];
  let x = pad;
  for (let k = 0; k < used.length; k++) {
    xs.push(x);
    x += cardW + (boundary(k) ? 2 * pad + groupGapX : gapX);
  }
  const cards = new Map<string, { x: number; y: number }>();
  const frames: GridFrame[] = [];
  for (const [gi, g] of groups.entries()) {
    const top = laneTop[laneOf.get(gi)!]!;
    for (const m of g.members) cards.set(m, { x: xs[index.get(shownCol(m))!]!, y: top + head + (folded(gi) ? 0 : row.get(m)! * (cardH + gapY)) });
    if (!g.frame) continue;
    const x0 = xs[index.get(span[gi]!.s)!]!;
    const n = rows[gi]!;
    frames.push({ id: g.id, name: g.name, color: g.color, members: g.members, collapsed: folded(gi), x: x0 - pad, y: top, w: xs[index.get(span[gi]!.e)!]! + cardW - x0 + 2 * pad, h: head + n * cardH + (n - 1) * gapY + pad });
  }
  const placed = doc.layout ?? {};
  const after = used.length ? xs[used.length - 1]! + cardW + pad + groupGapX : 0;
  let emptyY = 0;
  for (const g of empty) {
    const at = placed[groupKey(g.id)];
    frames.push({ id: g.id, name: g.name, color: g.color, members: [], collapsed: false, x: at ? at[0] : after, y: at ? at[1] : emptyY, w: cardW + 2 * pad, h: head + cardH + pad });
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
  const right = Math.max(0, ...all.map((p) => p.x + cardW), ...frames.map((f) => f.x + f.w));
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

/** The edge from one card to another: out of the first's right side, into the second's left, as a cubic curve. */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): { d: string; cx: number; cy: number; points: [number, number][] } {
  const { cardW, cardH } = GRID;
  const x1 = from.x + cardW;
  const y1 = from.y + cardH / 2;
  const x2 = to.x;
  const y2 = to.y + cardH / 2;
  const bend = Math.max(36, Math.abs(x2 - x1) / 2);
  const c: [number, number][] = [[x1, y1], [x1 + bend, y1], [x2 - bend, y2], [x2 - 5, y2]];
  const at = (t: number, k: 0 | 1) => (1 - t) ** 3 * c[0]![k] + 3 * (1 - t) ** 2 * t * c[1]![k] + 3 * (1 - t) * t ** 2 * c[2]![k] + t ** 3 * c[3]![k];
  return {
    d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 5} ${y2}`,
    cx: x2 - 3,
    cy: y2,
    // Points along it, for checking what it passes over.
    points: Array.from({ length: 33 }, (_, i) => [at(i / 32, 0), at(i / 32, 1)] as [number, number]),
  };
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
