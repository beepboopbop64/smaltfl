/**
 * The isolation forest as the app draws it: its trees, a row's way down one (the cuts, and the rows still beside it),
 * and the two principal components the rows are drawn on. And profile boxes: display only, out of every hash.
 */
import { describe, expect, it } from 'vitest';
import { clockText, drift, growForest, isolationForest, isolationPath, minuteOfDay, pathLength, principalComponents, random, scoreOf } from '../src/core/quality.js';
import { takeOut, validateDocument, type FlowDocument } from '../src/core/document.js';
import { flowHash, translate } from '../src/core/plan.js';
import { nodeKey } from '../src/core/keys.js';
import { visualFlow } from './fixtures/taxi.js';

const rnd = random(7);
const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const data = Array.from({ length: 400 }, () => [normal(), 2 * normal(), rnd() * 10]);
data.push([8, 8, 50], [-7, 0, 5]);

describe('the forest’s trees', () => {
  it('score exactly as before: the trees are the forest the scores came from', () => {
    // Scores the forest gave before its trees were kept, on the same seeded data.
    const s = isolationForest(data);
    expect([s.length, ...[0, 1, 2, 100, 399, 400, 401].map((i) => s[i])]).toEqual([402, 0.4127040287868583, 0.4249845173525483, 0.48349320837905907, 0.48292985841122454, 0.44288575081825676, 0.8398270768007027, 0.6672520845992749]);
    const forest = growForest(data)!;
    expect(forest.trees).toHaveLength(100);
    expect(forest.trees.every((t) => t.members.length === 256 && new Set(t.members).size === 256)).toBe(true);
    expect(data.map((x) => scoreOf(forest, x))).toEqual(s);
    expect(growForest([[1], [2]])).toBeNull();
  });

  it('cut a row away from the rest: each cut keeps the rows on its side, until it stands alone or a leaf keeps a few', () => {
    const forest = growForest(data)!;
    const odd = data[400]!;
    for (let t = 0; t < 10; t++) {
      const cuts = isolationPath(forest, t, data, odd);
      // As many cuts as the tree's splits on its way down, each leaving fewer rows beside it.
      const lefts = cuts.map((c) => c.left.length);
      expect(lefts.every((n, k) => n <= (k ? lefts[k - 1]! : 256))).toBe(true);
      expect(cuts.every((c) => c.left.every((i) => (data[i]![c.feature]! < c.split) === (c.side === 'below')))).toBe(true);
      expect(Math.floor(pathLength(forest.trees[t]!.root, odd))).toBeGreaterThanOrEqual(cuts.length);
    }
    // The odd row is set apart in fewer cuts than an ordinary one, on average over the forest.
    const cutsOf = (x: number[]) => forest.trees.reduce((n, _, t) => n + isolationPath(forest, t, data, x).length, 0) / forest.trees.length;
    expect(cutsOf(odd)).toBeLessThan(cutsOf(data[0]!) / 2);
  });
});

describe('days compared by the time of day', () => {
  it('read a time as minutes since midnight, as the record writes it', () => {
    expect([minuteOfDay('2024-01-01 14:58:31'), minuteOfDay('2024-01-02T00:05'), minuteOfDay('2024-01-03'), minuteOfDay('soon'), minuteOfDay(null)]).toEqual([898, 5, 0, null, null]);
    expect(clockText(898)).toBe('14:58');
    // The same hours on two days: steady by the time of day, though every date differs.
    const day = (d: number) => Array.from({ length: 300 }, (_, k) => `2024-01-0${d} ${String(k % 24).padStart(2, '0')}:${String((k * 7) % 60).padStart(2, '0')}:00`);
    expect(drift('measure', day(1).map(minuteOfDay), day(2).map(minuteOfDay), clockText).level).toBe('steady');
    expect(drift('time', day(1), day(2)).level).toBe('shifted');
  });
});

describe('principal components', () => {
  it('find the direction the rows spread along, and keep far rows far', () => {
    // Rows along the diagonal of x and y, with noise in z: the first component is the diagonal.
    const r = random(3);
    const rows = Array.from({ length: 500 }, () => {
      const t = 4 * (r() - 0.5);
      return [t + 0.05 * (r() - 0.5), t + 0.05 * (r() - 0.5), 0.3 * (r() - 0.5)];
    });
    rows.push([40, 40, 0]);
    const p = principalComponents(rows)!;
    const [u, w] = p.components;
    expect(Math.abs(u[0]! - Math.SQRT1_2)).toBeLessThan(0.02);
    expect(Math.abs(u[1]! - Math.SQRT1_2)).toBeLessThan(0.02);
    expect(Math.abs(u.reduce((t, x, k) => t + x * w[k]!, 0))).toBeLessThan(1e-6);
    expect(Math.hypot(...u)).toBeCloseTo(1, 9);
    // Each column scaled to the same spread, z's noise counts as much as x or y: the diagonal carries two thirds,
    // and z the rest, as the second component.
    expect(p.explained[0]).toBeCloseTo(2 / 3, 1);
    expect(p.explained[1]).toBeCloseTo(1 / 3, 1);
    expect(Math.abs(w[2]!)).toBeGreaterThan(0.99);
    expect(p.explained[0] + p.explained[1]).toBeLessThanOrEqual(1 + 1e-9);
    // The far row, uncapped, lies far beyond the rest along the first component.
    const xs = p.points.map(([x]) => x);
    expect(xs.at(-1)!).toBeGreaterThan(5 * Math.max(...xs.slice(0, -1).map(Math.abs)));
    // The same rows, the same picture.
    expect(principalComponents(rows)).toEqual(p);
    expect(principalComponents([[1, 2]])).toBeNull();
  });
});

describe('profile boxes', () => {
  const profiled = (): FlowDocument => ({ ...visualFlow(), profiles: [{ id: 'trips_profile', of: 'trips', description: 'What each load holds' }] });

  it('are checked: an id of their own, of a source or step', () => {
    expect(validateDocument(profiled())).toEqual([]);
    const bad = { ...visualFlow(), groups: [{ id: 'clean', name: 'Clean', steps: [] }], profiles: [{ id: 'trips', of: 'trips' }, { id: 'clean', of: 'nowhere' }, { of: 'trips' }] } as unknown as FlowDocument;
    expect(validateDocument(bad)).toEqual([
      { path: '$.profiles[0].id', message: 'trips is already the id of a profile, group, source or step' },
      { path: '$.profiles[1].id', message: 'clean is already the id of a profile, group, source or step' },
      { path: '$.profiles[1].of', message: 'no source or step nowhere' },
      { path: '$.profiles[2]', message: '{ id, of }' },
    ]);
  });

  it('change no hash and no key: they only look', async () => {
    const env = { smaltdb: '0.9.0', smaltfl: '0.0.0' };
    const keysOf = async (doc: FlowDocument) => {
      const plan = await translate(doc);
      const keys: string[] = [];
      for (const n of plan.nodes) keys.push(await nodeKey(n, n.inputs.map((j) => keys[j]!), env, n.op === 'table' ? `content-of-${n.table}` : undefined));
      return keys;
    };
    expect(await flowHash(profiled())).toBe(await flowHash(visualFlow()));
    expect(await keysOf(profiled())).toEqual(await keysOf(visualFlow()));
  });

  it('go with the step they look at when it is taken out', () => {
    const doc: FlowDocument = { ...visualFlow(), profiles: [{ id: 'valid_profile', of: 'trips_valid' }, { id: 'trips_profile', of: 'trips' }], layout: { valid_profile: [1, 2], trips_profile: [3, 4] } };
    const out = takeOut(doc, 'trips_valid')!;
    expect(out.profiles).toEqual([{ id: 'trips_profile', of: 'trips' }]);
    expect(out.layout).toEqual({ trips_profile: [3, 4] });
    expect(validateDocument(out)).toEqual([]);
  });
});
