/**
 * Several watched sources, each with its own cadence (ADR 0010 §7, B20), in the core: a run's loads; holds about loads,
 * the checks of the one watched source they read among them; carried holds; pauses keyed by load, so a daily load held
 * at 08:00 is decided once whatever slots of another source arrive after it; a decision about a load; a standing
 * decision until a load of the same source passes; the slots a source's pauses leave out of learning; and the fills of a
 * load: the slot's hours, and none when two loads hold (amendment 1 S2).
 */
import { describe, expect, it } from 'vitest';
import { offersOf, missingOf } from '../src/core/fill.js';
import { byLoad, carry, dayState, decisionForLoad, holdsOf, judgeClaims, loadKey, loadsOf, pausesOf, skipOf, standingForLoad, type DecideAbout, type HeldAbout, type Hold, type Inputs, type Load, type ReleaseAbout, type StoryClaim2 } from '../src/core/hold.js';
import type { LogEntry } from '../src/core/log.js';
import type { RunManifest } from '../src/core/manifest.js';
import { translate, type FlowPlan } from '../src/core/plan.js';
import { twoSourceDoc } from './fixtures/security.js';

const SHA = (c: string) => c.repeat(64);
const doc = twoSourceDoc();

/** A run's manifest: each source's snapshot by its file, the checks' counts, each output's key. */
function manifestOf(plan: FlowPlan, files: Record<string, string>, failed = 0): RunManifest {
  return {
    smaltflRun: 1, flow: plan.flow, plan: SHA('p'), parameters: plan.parameters, engine: { smaltdb: '0.9.0', smaltfl: '0.0.0' }, build: { smaltfl: 'dev', plugins: [] },
    nodes: plan.nodes.map((n, i) => ({ node: i, origin: n.origin, op: n.op, key: SHA('k'), status: 'built' as const, ...(n.op === 'table' ? { content: SHA('c'), rows: 100, file: { path: `${n.origin}.csv`, location: `${n.origin}.csv`, sha256: files[n.origin]!, bytes: 1 } } : {}), ...(n.op === 'expect' ? { expectations: { rows: 100, dropped: failed, rules: [{ name: 'known_result', onFail: 'drop', failed }, { name: 'in_day', onFail: 'drop', failed: 0 }, { name: 'has_user', onFail: 'warn', failed: 0 }] } } : {}) })),
    outputs: Object.fromEntries(plan.outputs.map((o) => [o.name, { key: SHA(o.name[0]!), content: SHA('c'), rows: 1 }])), data: null, log: null, previous: null,
  };
}

const claim2 = (source: string, slot: string, over: Partial<StoryClaim2> = {}): StoryClaim2 => ({
  by: 'story', v: 2, source, slot, every: source === 'edr' ? '6h' : 'day', state: 'calm', below: false, head: 'A normal Tuesday', build: 'dev', flow: SHA('f'),
  history: { base: { path: `${source}-history.json`, sha256: SHA('a'), bytes: 1 }, tail: null }, measured: SHA('e'), rows: 100, skip: [], levels: [], ...over,
});
const factsOf = (plan: FlowPlan) => ({ rows: () => 100, pinned: (p: string) => (p.endsWith('history.json') ? { sha256: SHA('a'), bytes: 1 } : undefined), measured: () => SHA('e'), flow: plan.flow.hash });

describe('a run of two watched sources: its loads and what holds it', () => {
  it('names each watched source\'s load by its slot parameter and its file', async () => {
    const plan = await translate(doc, { day: '2024-09-10', slot: '2024-09-10T06' });
    expect(byLoad(plan.publish)).toBe(true);
    const m = manifestOf(plan, { auth: SHA('1'), edr: SHA('2') });
    expect([...loadsOf(plan, m).values()]).toEqual([{ source: 'auth', slot: '2024-09-10', sha256: SHA('1') }, { source: 'edr', slot: '2024-09-10T06', sha256: SHA('2') }]);
    // One watched source: no loads, as ADR 0009 has it.
    const one = await translate({ ...doc, publish: { ...doc.publish!, watch: { auth: doc.publish!.watch!.auth! } } }, { day: '2024-09-10', slot: '2024-09-10T06' });
    expect(byLoad(one.publish)).toBe(false);
  });

  it('holds the off load alone, naming it, and keeps back only what reads it (Q-55)', async () => {
    const plan = await translate({ ...doc, publish: { ...doc.publish!, hold: ['checks', 'wrong'] } }, { day: '2024-09-10', slot: '2024-09-10T06' });
    const m = manifestOf(plan, { auth: SHA('1'), edr: SHA('2') });
    const gap = claim2('edr', '2024-09-10T06', { state: 'wrong', below: true, head: 'Gap in endpoint events, 06:00–10:00', flow: plan.flow.hash });
    const judged = judgeClaims(plan, [claim2('auth', '2024-09-10', { flow: plan.flow.hash }), gap], factsOf(plan));
    const holds = holdsOf(plan, m, judged);
    expect(holds.map((h) => [h.by, h.origin, h.load])).toEqual([['story', 'edr', { source: 'edr', slot: '2024-09-10T06', sha256: SHA('2') }]]);
    expect(holds[0]!.reaches).toEqual(['edr_actions', 'edr_hosts_signing_in']);
  });

  it('names the load a check is about when it reads one watched source, and carries a load an earlier run held', async () => {
    const plan = await translate(doc, { day: '2024-09-10', slot: '2024-09-10T12' });
    const m = manifestOf(plan, { auth: SHA('1'), edr: SHA('3') }, 50);
    const judged = judgeClaims(plan, [claim2('auth', '2024-09-10', { flow: plan.flow.hash }), claim2('edr', '2024-09-10T12', { flow: plan.flow.hash })], factsOf(plan));
    const holds = holdsOf(plan, m, judged);
    expect(holds.map((h) => [h.by, h.origin, h.load?.source])).toEqual([['checks', 'auth_valid', 'auth']]);
    const auth: Load = { source: 'auth', slot: '2024-09-10', sha256: SHA('1') };
    expect(carry(holds, (l) => (loadKey(l) === loadKey(auth) ? 7 : undefined))[0]).toMatchObject({ carried: 7 });
    expect(carry(holds, () => undefined)[0]!.carried).toBeUndefined();
  });
});

// ------------------------------------------------------------------ the record, by load

let seq = 0;
const entry = (kind: string, about: unknown, more: Partial<LogEntry> = {}): LogEntry => ({ smaltflLog: 1, origin: 'o', seq: seq++, kind, at: '2026-11-09T09:00:00.000Z', by: { card: null, as: 'owner' }, about: about as LogEntry['about'], reason: null, amends: null, nonce: '0'.repeat(32), ...more });
const AUTH = (day: string, f = '1'): Load => ({ source: 'auth', slot: day, sha256: SHA(f) });
const EDR = (slot: string, f = '2'): Load => ({ source: 'edr', slot, sha256: SHA(f) });
const inputs = (auth: Load, edr: Load): Inputs => ({ flow: SHA('f'), parameters: { day: auth.slot, slot: edr.slot }, files: { auth: auth.sha256, edr: edr.sha256 } });
const KEYS = { auth_results: 'ka', edr_actions: 'ke', edr_hosts_signing_in: 'kb' };
const story = (l: Load, carried?: number): Hold => ({ by: 'story', node: l.source === 'auth' ? 0 : 1, origin: l.source, said: 'off', reaches: l.source === 'auth' ? ['auth_results', 'edr_hosts_signing_in'] : ['edr_actions', 'edr_hosts_signing_in'], load: l, ...(carried !== undefined ? { carried } : {}) });
/** A run of the two sources' loads: held by the holds given, every held output waiting. */
const run = (n: number, auth: Load, edr: Load, holds: Hold[] = []): LogEntry => {
  const reach = new Set(holds.flatMap((h) => h.reaches));
  const keys = Object.fromEntries(Object.entries(KEYS).filter(([k]) => reach.has(k)).map(([k, v]) => [k, `${v}-${n}`]));
  return holds.length
    ? entry('run', { run: n, manifest: SHA(String(n % 10)), outcome: 'held', day: auth.slot, inputs: inputs(auth, edr), holds, waiting: Object.keys(keys), keys, loads: [auth, edr] } satisfies HeldAbout)
    : entry('run', { run: n, manifest: SHA(String(n % 10)), outcome: 'ok', day: auth.slot, inputs: inputs(auth, edr), loads: [auth, edr] });
};
const decideLoad = (l: Load, n: number, option: DecideAbout['option'], scope: DecideAbout['scope'] = 'day', more: Partial<DecideAbout> = {}): LogEntry =>
  entry('decide', { day: l.slot, run: n, manifest: SHA(String(n % 10)), inputs: inputs(AUTH('2024-09-10'), EDR('2024-09-10T06')), outputs: {}, option, scope, policies: SHA('e'), rule: null, load: l, ...more } satisfies DecideAbout);
const releaseOf = (n: number, decisions: number[], outputs: Record<string, string>): LogEntry => entry('release', { run: n, manifest: SHA(String(n % 10)), outputs, decision: decisions[0]!, decisions, leaf: SHA('d'), outcome: 'applied', why: null } satisfies ReleaseAbout);

describe('pauses about loads (ADR 0010 §7)', () => {
  it('opens one pause a load, carried across the runs that read it, and decided once', () => {
    seq = 0;
    const day = AUTH('2024-09-10');
    const entries = [
      run(1, AUTH('2024-09-09', '0'), EDR('2024-09-10T00', '5')), // 06:00: edr's 00–06 arrives, yesterday's sign-ins
      run(2, day, EDR('2024-09-10T00', '5'), [story(day)]), // 08:00: today's sign-ins arrive, off
      run(3, day, EDR('2024-09-10T06'), [story(day, 2)]), // 12:00: edr's 06–12, the sign-ins carried
      run(4, day, EDR('2024-09-10T12', '6'), [story(day, 2)]),
      run(5, day, EDR('2024-09-10T18', '7'), [story(day, 2)]),
    ];
    const pauses = pausesOf(entries, 'day');
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ key: `load:${loadKey(day)}`, load: day, day: '2024-09-10', run: 5, state: 'open', opened: 1, keys: { auth_results: 'ka-5', edr_hosts_signing_in: 'kb-5' } });
    const d = decideLoad(day, 5, 'asis', 'day');
    const decided = [...entries, d, releaseOf(5, [d.seq], { auth_results: 'ka-5', edr_hosts_signing_in: 'kb-5' })];
    expect(pausesOf(decided, 'day')[0]).toMatchObject({ state: 'decided', released: true });
    expect(decisionForLoad(decided, day)?.seq).toBe(d.seq);
    expect(decisionForLoad(decided, AUTH('2024-09-11'))).toBeNull();
    // A later run that still reads the load carries the same decision: one pause, still decided.
    const later = [...decided, run(6, day, EDR('2024-09-11T00', '8'), [story(day, 2)])];
    expect(pausesOf(later, 'day')).toHaveLength(1);
    expect(pausesOf(later, 'day')[0]).toMatchObject({ state: 'decided', run: 6, released: true });
    expect(dayState(null, pausesOf(later, 'day')[0]!)).toBe('asis');
  });

  it('pauses the off slot alone: a later slot that passes passes nothing of it, and its pause is its own (Q-55)', () => {
    seq = 0;
    const day = AUTH('2024-09-10');
    const gap = EDR('2024-09-10T06');
    const entries = [run(3, day, gap, [story(gap)]), run(4, day, EDR('2024-09-10T12', '6'))];
    const pauses = pausesOf(entries, 'day');
    expect(pauses.map((p) => [p.load?.source, p.day, p.state])).toEqual([['edr', '2024-09-10T06', 'open']]);
    expect(pauses[0]!.keys).toEqual({ edr_actions: 'ke-3', edr_hosts_signing_in: 'kb-3' });
    // The slots left out of learning are the source's own.
    expect(skipOf(entries, 'day', 'edr')).toEqual(['2024-09-10T06']);
    expect(skipOf(entries, 'day', 'auth')).toEqual([]);
    // A run that reads the load again and doesn't hold it passes it.
    expect(pausesOf([...entries, run(5, day, gap)], 'day')[0]!.state).toBe('passed');
  });

  it('opens two pauses for a run two loads hold, each decided by its own', () => {
    seq = 0;
    const day = AUTH('2024-09-10');
    const gap = EDR('2024-09-10T06');
    const entries = [run(3, day, gap, [story(day), story(gap)])];
    expect(pausesOf(entries, 'day').map((p) => p.load?.source)).toEqual(['auth', 'edr']);
    const d = decideLoad(gap, 3, 'dont', 'untilPass');
    const after = [...entries, d];
    expect(pausesOf(after, 'day').map((p) => [p.load?.source, p.state])).toEqual([['auth', 'open'], ['edr', 'decided']]);
  });

  it('lets a decision not to publish stand for the source\'s later loads until one of them passes', () => {
    seq = 0;
    const day = AUTH('2024-09-10');
    const d = decideLoad(EDR('2024-09-10T06'), 3, 'dont', 'untilPass');
    const base = [run(3, day, EDR('2024-09-10T06'), [story(EDR('2024-09-10T06'))]), d];
    expect(standingForLoad(base, EDR('2024-09-10T12', '6'))?.seq).toBe(d.seq);
    // Not for another source's loads, nor an earlier slot.
    expect(standingForLoad(base, AUTH('2024-09-11'))).toBeNull();
    expect(standingForLoad(base, EDR('2024-09-10T00', '5'))).toBeNull();
    // Once a later slot passes, the decision stands no more.
    const passed = [...base, run(4, day, EDR('2024-09-10T12', '6'))];
    expect(standingForLoad(passed, EDR('2024-09-10T18', '7'))).toBeNull();
    // A decision for one day stands for no other.
    expect(standingForLoad([run(3, day, EDR('2024-09-10T06'), [story(EDR('2024-09-10T06'))]), decideLoad(EDR('2024-09-10T06'), 3, 'dont', 'day')], EDR('2024-09-10T12', '6'))).toBeNull();
  });
});

describe('fills of a load (ADR 0010 §7, amendment 1 S2)', () => {
  const told = { hero: 'hours' as const, split: null, hours: { got: [3, 2, 4, 3, 900, 950], usual: [880, 900, 910, 920, 900, 950], from: 0, to: 3, fall: 99, start: 360, width: 60 } };
  it('names a slot\'s missing hours as the day\'s, and none in quarter hours', () => {
    expect(missingOf(told as never, 'event_time')).toEqual({ time: 'event_time', hours: [6, 9] });
    expect(missingOf({ ...told, hours: { ...told.hours, start: 840, width: 15 } } as never, 'event_time')).toBeNull();
    // A day's hours as they always were.
    expect(missingOf({ ...told, hours: { got: [], usual: [], from: 13, to: 23, fall: 77 } } as never, 'event_time')).toEqual({ time: 'event_time', hours: [13, 23] });
  });

  it('offers a fill when the load holds alone, none when two loads hold the run, and no Accept for a slot', () => {
    const claim = { state: 'wrong' as const, below: true };
    const base = { story: told as never, claim, fill: { time: 'event_time' }, donors: [{ day: '2024-09-03' }] };
    expect(offersOf(base).map((o) => [o.option, o.label])).toEqual([['fill', 'Fill from Tue 3'], ['complete', 'Without 06:00–10:00']]);
    expect(offersOf({ ...base, holding: 2 })).toEqual([]);
    const amount = { state: 'wrong' as const, hero: 'amount' as const, split: null, cause: { kind: 'volume' }, absorbed: [], amount: { value: 10, low: 50, high: 90, expected: 70 } };
    expect(offersOf({ ...base, told: amount as never, holds: [{ by: 'story' }], every: '6h' }).some((o) => o.option === 'accept')).toBe(false);
  });
});
