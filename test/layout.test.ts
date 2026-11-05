/**
 * The canvas layout an arrangement builds on: pinning every card's place moves nothing, a folded section's steps keep
 * their arrangement, an empty section sits where it was left, and a step moved into a section lands in a free slot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FlowDocument } from '../src/core/document.js';
import { edgePath, frameAt, freeSlot, GRID, gridLayout, groupKey, pinLayout } from '../src/app/layout.js';
import { visualFlow } from './fixtures/taxi.js';

const example = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;

/** The reference flow in three sections, laid out automatically (the fixture places two cards by hand). */
const sectioned = (): FlowDocument => ({
  ...visualFlow(),
  layout: {},
  groups: [
    { id: 'clean', name: 'Clean', steps: ['trips', 'trips_valid', 'trips_dedup'] },
    { id: 'enrich', name: 'Enrich', steps: ['zones', 'trips_zoned', 'trips_enriched'] },
    { id: 'demand', name: 'Demand', steps: ['zone_hour', 'borough_hour'] },
  ],
});

const positions = (doc: FlowDocument, collapsed = new Set<string>()) => Object.fromEntries([...gridLayout(doc, collapsed).cards].map(([id, p]) => [id, [p.x, p.y]]));

describe('the canvas layout', () => {
  it('pins every card where it already is', () => {
    for (const doc of [sectioned(), { ...sectioned(), layout: visualFlow().layout }]) {
      const pinned = { ...doc, layout: pinLayout(doc, new Set()) };
      expect(positions(pinned)).toEqual(positions(doc));
      expect(gridLayout(pinned, new Set()).frames).toEqual(gridLayout(doc, new Set()).frames);
    }
  });

  it("keeps a folded section's card in place, and its steps' arrangement for when it opens", () => {
    const doc = sectioned();
    const folded = new Set(['clean']);
    const pinned = { ...doc, layout: pinLayout(doc, folded) };
    // Folded, nothing moves.
    expect(positions(pinned, folded)).toEqual(positions(doc, folded));
    // Opened, its steps sit as they do in the open layout, from the folded card's corner.
    const open = gridLayout(doc, new Set());
    const card = gridLayout(doc, folded).cards.get('trips')!;
    const frame = open.frames.find((f) => f.id === 'clean')!;
    const opened = gridLayout(pinned, new Set()).cards;
    for (const id of ['trips', 'trips_valid', 'trips_dedup']) {
      const o = open.cards.get(id)!;
      expect(opened.get(id)).toEqual({ x: card.x + o.x - (frame.x + GRID.pad), y: card.y + o.y - (frame.y + GRID.head) });
    }
  });

  it('draws an empty section where it was left, or after everything else', () => {
    const doc = { ...sectioned(), groups: [...sectioned().groups!, { id: 'later', name: 'Later', steps: [] }] };
    const auto = gridLayout(doc, new Set());
    const empty = auto.frames.find((f) => f.id === 'later')!;
    expect(empty.members).toEqual([]);
    expect(empty.x).toBeGreaterThan(Math.max(...auto.frames.filter((f) => f.id !== 'later').map((f) => f.x + f.w)));
    const placed = gridLayout({ ...doc, layout: { [groupKey('later')]: [-200, 300] } }, new Set());
    expect(placed.frames.find((f) => f.id === 'later')).toMatchObject({ x: -200, y: 300 });
    expect(placed.left).toBe(-200);
  });

  it('finds the section a dropped card lands in, with a little slack', () => {
    const l = gridLayout(sectioned(), new Set());
    const f = l.frames.find((x) => x.id === 'enrich')!;
    expect(frameAt(l, f.x + 5, f.y + 5)?.id).toBe('enrich');
    expect(frameAt(l, f.x - 10, f.y + 5)).toBeUndefined();
    expect(frameAt(l, f.x - 10, f.y + 5, 12)?.id).toBe('enrich');
  });

  it('puts a step moved into a section in its first free slot', () => {
    const doc = sectioned();
    const l = gridLayout(doc, new Set());
    const demand = l.frames.find((f) => f.id === 'demand')!;
    const slot = freeSlot(l, demand, 'trips_dedup');
    const others = [...l.cards].filter(([id]) => id !== 'trips_dedup').map(([, p]) => p);
    expect(others.every((p) => Math.abs(p.x - slot.x) >= GRID.cardW || Math.abs(p.y - slot.y) >= GRID.cardH)).toBe(true);
    expect(slot.x).toBeGreaterThanOrEqual(demand.x);
    // Placed there and moved into the section, the section grows around it.
    const moved: FlowDocument = { ...doc, groups: doc.groups!.map((g) => ({ ...g, steps: g.id === 'demand' ? [...g.steps, 'trips_dedup'] : g.steps.filter((s) => s !== 'trips_dedup') })), layout: { ...pinLayout(doc, new Set()), trips_dedup: [slot.x, slot.y] } };
    const after = gridLayout(moved, new Set()).frames.find((f) => f.id === 'demand')!;
    expect(after.x <= slot.x && after.x + after.w >= slot.x + GRID.cardW && after.y <= slot.y && after.y + after.h >= slot.y + GRID.cardH).toBe(true);
  });
});

describe('the automatic placement of the example', () => {
  const { cardW, cardH } = GRID;
  for (const folded of [[], ['clean'], ['places'], ['enrich'], ['weather_group']]) {
    it(`keeps every edge in sight, with ${folded.length ? `${folded[0]} folded` : 'every section open'}`, () => {
      const l = gridLayout(example, new Set(folded));
      // What is drawn: each card, a folded section's members as its one card.
      const shown = new Map<string, string>();
      for (const f of l.frames) for (const m of f.members) shown.set(m, f.collapsed ? f.id : m);
      const at = new Map<string, { x: number; y: number }>();
      for (const [id, p] of l.cards) at.set(shown.get(id) ?? id, p);
      const boxes = [...at.entries()];
      const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const box = (p: { x: number; y: number }) => ({ x: p.x, y: p.y, w: cardW, h: cardH });
      for (const [i, [a, p]] of boxes.entries()) for (const [b, q] of boxes.slice(i + 1)) expect(overlap(box(p), box(q)), `${a} and ${b}`).toBe(false);
      for (const [i, f] of l.frames.entries()) for (const g of l.frames.slice(i + 1)) expect(overlap(f, g), `${f.id} and ${g.id}`).toBe(false);
      for (const st of example.steps) {
        for (const input of st.inputs) {
          const [from, to] = [shown.get(input) ?? input, shown.get(st.id) ?? st.id];
          if (from === to) continue;
          const [p, q] = [at.get(from)!, at.get(to)!];
          expect(q.x, `${input} → ${st.id} runs forward`).toBeGreaterThan(p.x);
          // Nothing drawn on the way: no point along the edge falls inside a card other than its two ends.
          for (const [x, y] of edgePath(p, q).points) {
            for (const [id, r] of boxes) if (id !== from && id !== to) expect(x > r.x + 1 && x < r.x + cardW - 1 && y > r.y + 1 && y < r.y + cardH - 1, `${input} → ${st.id} passes over ${id}`).toBe(false);
          }
        }
      }
    });
  }

  it('puts each input just before the step that first reads it', () => {
    const l = gridLayout(example, new Set());
    const xs = [...new Set([...l.cards.values()].map((p) => p.x))].sort((a, b) => a - b);
    for (const src of example.sources) {
      const first = Math.min(...example.steps.filter((st) => st.inputs.includes(src.id)).map((st) => l.cards.get(st.id)!.x));
      expect(xs.indexOf(first) - xs.indexOf(l.cards.get(src.id)!.x), src.id).toBe(1);
    }
  });
});
