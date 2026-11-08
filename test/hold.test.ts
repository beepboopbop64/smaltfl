/**
 * What holds a run, what waits, and what the record says was decided (ADR 0009), on the example's plan with made-up
 * counts and claims, the synthetic history, and made-up record entries.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FlowDocument, PublishDef } from '../src/core/document.js';
import { HistoryRanges } from '../src/core/history.js';
import {
  claimHolds,
  countedChecks,
  dayClaim,
  decisionFor,
  flowStory,
  heldOutputs,
  holdsOf,
  inputsKey,
  inputsOf,
  judgeClaims,
  pausesOf,
  pauseState,
  reachOf,
  sameKeys,
  stagedKeys,
  standingFor,
  tripped,
  waitingOf,
  type ClaimFacts,
  type DecideAbout,
  type HeldAbout,
  type Inputs,
  type Judged,
  type StoryClaim,
} from '../src/core/hold.js';
import type { LogEntry } from '../src/core/log.js';
import type { ExpectationResult, RunManifest } from '../src/core/manifest.js';
import { translate, type FlowPlan } from '../src/core/plan.js';
import { historyWith } from './helpers/history.js';

const example = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
const PUBLISH: PublishDef = { hold: ['checks', 'wrong'], watch: { trips: 'history.json' }, period: 'day', together: true };
const DAY_PARAM = { name: 'day', type: 'text' as const, default: null };

/** The example with a day parameter and a publish block, as a plan for Thu Sep 21, 2023. */
async function planOf(publish: PublishDef = PUBLISH, day = '2023-09-21'): Promise<FlowPlan> {
  const { publish: _p, ...doc } = example;
  const parameters = [...(doc.parameters ?? []).filter((p) => p.name !== 'day'), DAY_PARAM];
  return translate({ ...doc, smaltfl: 2, parameters, publish }, { month: day.slice(0, 7), day });
}
const at = (plan: FlowPlan, origin: string) => plan.nodes.findIndex((n) => n.origin === origin);

const SHA = (c: string) => c.repeat(64);
const HISTORY = { path: 'history.json', sha256: SHA('a'), bytes: 1_234_567 };
const counts = (rows: number, dropped: number, rules: ExpectationResult['rules'] = [{ name: 'fare', onFail: 'drop', failed: dropped }]): ExpectationResult => ({ rows, dropped, rules });

/** A manifest of the plan: the checks' counts at trips_valid, a snapshot of 41,939 trips, and a key per output. */
function manifestOf(plan: FlowPlan, expectations: ExpectationResult | null = counts(41_939, 2_000), keys: Record<string, string> = {}): RunManifest {
  return {
    smaltflRun: 1,
    flow: plan.flow,
    plan: SHA('p'),
    parameters: plan.parameters,
    engine: { smaltdb: '0.9.0', smaltfl: '0.1.0' },
    nodes: plan.nodes.map((n, i) => ({
      node: i, origin: n.origin, op: n.op, key: `key-${i}`, status: 'built' as const,
      ...(n.op === 'table' ? { content: SHA(String(i)), rows: n.origin === 'trips' ? 41_939 : 100, file: { location: `smaltfl:${n.origin}.parquet`, sha256: SHA(String(i + 1)), bytes: 10 } } : {}),
      ...(n.op === 'expect' && expectations ? { expectations } : {}),
    })),
    outputs: Object.fromEntries(plan.outputs.map((o) => [o.name, { key: keys[o.name] ?? `staged-${o.name}`, content: SHA('c'), rows: 1 }])),
    previous: null,
  };
}

const claim = (over: Partial<StoryClaim> = {}): StoryClaim => ({ by: 'story', source: 'trips', day: '2023-09-21', state: 'wrong', below: true, head: 'Trips fall 95% from 13:00', build: 'dev', history: HISTORY, rows: 41_939, ...over });
const facts = (over: Partial<ClaimFacts> = {}): ClaimFacts => ({ rows: () => 41_939, pinned: (p) => (p === 'history.json' ? { sha256: HISTORY.sha256, bytes: HISTORY.bytes } : undefined), ...over });

describe('what the checks hold (ADR 0009 §3)', () => {
  it('holds past maxDropped, strictly, as the runtime enforces it, and not at the limit', async () => {
    const plan = await planOf();
    const v = at(plan, 'trips_valid');
    expect(holdsOf(plan, manifestOf(plan, counts(4_633, 2_116)), [{ node: 0, claim: claim({ state: 'calm', below: false }) }])).toEqual([
      { by: 'checks', node: v, origin: 'trips_valid', said: 'dropped 2,116 of 4,633 rows (45.67%), more than the 10% allowed', reaches: ['borough_hour', 'weather_effect', 'zone_hour'] },
    ]);
    expect(tripped({ maxDropped: 0.1 }, counts(1_000, 100))).toBeNull();
    expect(tripped({ maxDropped: 0.1 }, counts(1_000, 101))).toBe('dropped 101 of 1,000 rows (10.1%), more than the 10% allowed');
    expect(tripped({ maxDropped: null }, counts(1_000, 900))).toBeNull();
  });

  it('holds on a fail rule that failed, never on a warn rule', () => {
    expect(tripped({ maxDropped: 0.1 }, counts(1_000, 0, [{ name: 'one_per_hour', onFail: 'fail', failed: 3 }, { name: 'passengers', onFail: 'warn', failed: 500 }]))).toBe('expectations failed: one_per_hour (3 rows)');
    expect(tripped({ maxDropped: 0.1 }, counts(1_000, 0, [{ name: 'passengers', onFail: 'warn', failed: 500 }]))).toBeNull();
  });

  it('reads the manifest only, so a check reused by key holds again; missing counts hold too', async () => {
    const plan = await planOf();
    const m = manifestOf(plan, counts(4_633, 2_116));
    const reused = { ...m, nodes: m.nodes.map((n) => (n.op === 'expect' ? { ...n, status: 'reused' as const } : n)) };
    const judged: Judged[] = [{ node: 0, claim: claim({ state: 'calm', below: false }) }];
    expect(holdsOf(plan, reused, judged)).toEqual(holdsOf(plan, m, judged));
    expect(holdsOf(plan, manifestOf(plan, null), judged)).toMatchObject([{ by: 'checks', origin: 'trips_valid', said: 'its checks were not counted' }]);
  });

  it('holds nothing for checks a flow leaves out of hold, and nothing at all for a plan without publish', async () => {
    const plan = await planOf({ ...PUBLISH, hold: ['wrong'] });
    expect(holdsOf(plan, manifestOf(plan, counts(4_633, 2_116)), [{ node: 0, claim: claim({ state: 'calm', below: false }) }])).toEqual([]);
    const { publish: _p, ...without } = plan;
    const plain: FlowPlan = { ...without, smaltflPlan: 0 };
    expect(holdsOf(plain, manifestOf(plan, counts(4_633, 2_116)), [])).toEqual([]);
  });
});

describe('what a story claim holds (ADR 0009 §2, §3)', () => {
  it('holds a short day under short and wrong, a wrong day in range only under wrong, a calm day never', async () => {
    expect(claimHolds(['short'], claim())).toBe(true);
    expect(claimHolds(['wrong'], claim())).toBe(true);
    expect(claimHolds(['short'], claim({ below: false }))).toBe(false);
    expect(claimHolds(['wrong'], claim({ below: false }))).toBe(true);
    expect(claimHolds(['checks', 'wrong'], claim({ state: 'unusual', below: true }))).toBe(false);
    expect(claimHolds(['wrong'], claim({ state: 'calm', below: false }))).toBe(false);
    expect(claimHolds(['checks'], claim())).toBe(false);
    const plan = await planOf();
    expect(holdsOf(plan, manifestOf(plan), [{ node: 0, claim: claim({ below: false, head: 'Payment type 3: 2.1%' }) }])).toEqual([
      { by: 'story', node: 0, origin: 'trips', said: 'Payment type 3: 2.1%', reaches: ['borough_hour', 'weather_effect', 'zone_hour'], claim: claim({ below: false, head: 'Payment type 3: 2.1%' }) },
    ]);
    expect(holdsOf(await planOf({ ...PUBLISH, hold: ['checks', 'short'] }), manifestOf(plan), [{ node: 0, claim: claim({ below: false }) }])).toEqual([]);
  });

  it('holds a watched source with no verdict, or two, as not judged', async () => {
    const plan = await planOf();
    expect(holdsOf(plan, manifestOf(plan), [])).toEqual([{ by: 'unjudged', node: 0, origin: 'trips', said: 'no claim for trips', reaches: ['borough_hour', 'weather_effect', 'zone_hour'] }]);
    expect(holdsOf(plan, manifestOf(plan), [{ node: 0, unjudged: 'the claim is of 2023-09-20, the run of 2023-09-21' }])[0]!.said).toBe('the claim is of 2023-09-20, the run of 2023-09-21');
    const calm = claim({ state: 'calm', below: false });
    expect(holdsOf(plan, manifestOf(plan), [{ node: 0, claim: calm }, { node: 0, claim: calm }])[0]).toMatchObject({ by: 'unjudged', said: '2 verdicts for trips' });
  });
});

describe('judging a claim against the run (ADR 0009 §3)', () => {
  it('takes a claim that matches the day, the pinned history and the snapshot, and keeps only its own fields', async () => {
    const plan = await planOf();
    const extra = { ...claim(), source: 'Trips', note: 'from the page' };
    expect(judgeClaims(plan, [extra], facts())).toEqual([{ node: 0, claim: claim({ source: 'Trips' }) }]);
  });

  it('leaves the source not judged, saying why, for each way a claim can miss the run', async () => {
    const plan = await planOf();
    const why = (claims: unknown[] | undefined, f: ClaimFacts = facts()) => {
      const [j] = judgeClaims(plan, claims, f);
      return j && 'unjudged' in j ? j.unjudged : null;
    };
    expect(why(undefined)).toBe('no claim for trips');
    expect(why([claim({ source: 'zones' })])).toBe('no claim for trips');
    expect(why([claim(), claim()])).toBe('2 claims for trips');
    expect(why([{ ...claim(), by: 'page' }])).toBe("the claim for trips isn't a story's claim");
    expect(why([{ ...claim(), state: 'fine' }])).toBe('the claim for trips has no story state');
    expect(why([{ ...claim(), history: { ...HISTORY, sha256: 'not hex' } }])).toBe("the claim for trips doesn't name its history's file, sha256 and size");
    expect(why([{ ...claim(), rows: -1 }])).toBe('the claim for trips counts no rows');
    expect(why([claim({ day: '2023-09-20' })])).toBe('the claim is of 2023-09-20, the run of 2023-09-21');
    expect(why([claim({ history: { ...HISTORY, path: 'old-history.json' } })])).toBe('the claim was told from old-history.json, not history.json');
    expect(why([claim()], facts({ pinned: () => undefined }))).toBe("history.json isn't pinned in the engine");
    expect(why([claim({ history: { ...HISTORY, sha256: SHA('b') } })])).toBe("the claim's history.json isn't the one pinned in the engine");
    expect(why([claim({ history: { ...HISTORY, bytes: 1 } })])).toBe("the claim's history.json isn't the one pinned in the engine");
    expect(why([claim({ rows: 41_000 })])).toBe('the claim counts 41,000 rows of trips, the snapshot holds 41,939');
    // A run with no day can't be matched by any claim.
    const noDay = await planOf(PUBLISH, '2023-09-21');
    noDay.parameters.day = null;
    expect((judgeClaims(noDay, [claim()], facts())[0] as { unjudged: string }).unjudged).toBe('the claim is of 2023-09-21, the run of null');
  });

  it('judges nothing for a plan without watches', async () => {
    expect(judgeClaims(await planOf({ hold: ['checks'] }), [claim()], facts())).toEqual([]);
  });
});

describe('what waits (ADR 0009 §4)', () => {
  it('reaches the outputs that read any source the holding node reads', async () => {
    const plan = await planOf();
    expect(reachOf(plan, at(plan, 'trips'))).toEqual(['borough_hour', 'weather_effect', 'zone_hour']);
    expect(reachOf(plan, at(plan, 'trips_valid'))).toEqual(['borough_hour', 'weather_effect', 'zone_hour']);
    expect(reachOf(plan, at(plan, 'zones'))).toEqual(['borough_hour', 'districts', 'weather_effect', 'zone_hour', 'zone_list']);
    expect(reachOf(plan, at(plan, 'weather'))).toEqual(['weather_effect', 'weather_hourly']);
  });

  it('keeps every output back while anything holds, or with together: false only what the holds reach', async () => {
    const plan = await planOf();
    const holds = holdsOf(plan, manifestOf(plan), []);
    expect(heldOutputs(plan, holds)).toEqual(['borough_hour', 'districts', 'weather_effect', 'weather_hourly', 'zone_hour', 'zone_list']);
    expect(heldOutputs(plan, [])).toEqual([]);
    const apart = await planOf({ ...PUBLISH, together: false });
    expect(heldOutputs(apart, holdsOf(apart, manifestOf(apart), []))).toEqual(['borough_hour', 'weather_effect', 'zone_hour']);
  });

  it('waits only where the staged key is not the current one: the zones and the weather reuse theirs', async () => {
    const plan = await planOf();
    const same = { zone_list: 'k-zones', districts: 'k-districts', weather_hourly: 'k-weather' };
    const m = manifestOf(plan, null, same);
    const held = heldOutputs(plan, holdsOf(plan, m, []));
    const current = { ...same, zone_hour: 'k-wed', borough_hour: 'k-wed-b', weather_effect: 'k-wed-e' };
    expect(waitingOf(m, held, current)).toEqual(['borough_hour', 'weather_effect', 'zone_hour']);
    // The first run of all: nothing current, everything held waits.
    expect(waitingOf(m, held, {})).toEqual(held);
    expect(stagedKeys(m, ['zone_hour', 'nowhere'])).toEqual({ zone_hour: 'staged-zone_hour' });
  });
});

describe('the flow’s verdict on a day (ADR 0009 §3)', () => {
  const DAY = '2023-10-11'; // a Wednesday
  const doc = { steps: [{ id: 'trips_valid', kind: 'expectations' as const, inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' as const }] }] };
  const claimOn = (trouble: Parameters<typeof historyWith>[0]) => dayClaim(new HistoryRanges(historyWith(trouble)), doc, HISTORY, DAY, 'trips', 'abc123');

  it('tells a day that falls at an hour, and one a vendor left, as wrong and short', () => {
    expect(claimOn({ [DAY]: { stopAt: 13 } })).toEqual({ by: 'story', source: 'trips', day: DAY, state: 'wrong', below: true, head: 'Trips fall 98% from 13:00', build: 'abc123', history: HISTORY, rows: 44_219 });
    expect(claimOn({ [DAY]: { vendorGone: true } })).toMatchObject({ state: 'wrong', below: true, head: 'Vendor 1 sent almost nothing', rows: 72_784 });
  });

  it('tells a share far off with the trips in range as wrong, not short; a calm day as calm', () => {
    const shifted = claimOn({ [DAY]: { vendorShare: 0.45 } })!;
    expect(shifted).toMatchObject({ state: 'wrong', below: false });
    expect(claimHolds(['wrong'], shifted)).toBe(true);
    expect(claimHolds(['short'], shifted)).toBe(false);
    expect(claimOn({})).toMatchObject({ state: 'calm', below: false, head: 'A normal Wednesday', rows: 103_979 });
  });

  it('gives no claim for a day the history lacks, and refuses ranges that leave days out', () => {
    const file = historyWith({});
    expect(dayClaim(new HistoryRanges(file), doc, HISTORY, '2024-02-01', 'trips', 'dev')).toBeNull();
    expect(() => flowStory(new HistoryRanges(file, { skip: new Set(['2023-09-21']) }), DAY, doc, 'trips')).toThrow("the flow's verdict learns from every day of the history");
  });

  it('counts the checks only when they are the ones the history counted, reading the source alone', () => {
    const h = new HistoryRanges(historyWith({}));
    expect(countedChecks(doc, h, 'trips')).toBe(true);
    expect(countedChecks(doc, h, 'zones')).toBe(false);
    expect(countedChecks(doc, h, undefined)).toBe(false);
    expect(countedChecks({ steps: [{ ...doc.steps[0]!, rules: [{ ...doc.steps[0]!.rules[0]!, check: 'fare_amount > 0' }] }] }, h, 'trips')).toBe(false);
  });
});

// ------------------------------------------------------------------ the record

const inputs = (day: string, files = { trips: SHA('1'), zones: SHA('2'), weather: SHA('3') }): Inputs => ({ flow: SHA('f'), parameters: { month: day.slice(0, 7), day }, files });
const KEYS = { borough_hour: 'kb', weather_effect: 'ke', zone_hour: 'kz' };
let seq = 0;
const entry = (kind: string, about: unknown, more: Partial<LogEntry> = {}): LogEntry => ({ smaltflLog: 1, origin: 'o', seq: seq++, kind, at: `2026-11-08T09:${String(seq).padStart(2, '0')}:00.000Z`, by: { card: null, as: 'owner' }, about: about as LogEntry['about'], reason: null, amends: null, nonce: '0'.repeat(32), ...more });
const held = (day: string, run: number, keys: Record<string, string> = KEYS, i = inputs(day)): LogEntry => entry('run', { run, manifest: SHA(String(run % 10)), outcome: 'held', day, inputs: i, holds: [], waiting: Object.keys(keys), keys } satisfies HeldAbout);
const ok = (day: string, run: number, i = inputs(day)): LogEntry => entry('run', { run, manifest: SHA('9'), outcome: 'ok', day, inputs: i });
const decide = (day: string, run: number, option: DecideAbout['option'], scope: DecideAbout['scope'] = 'day', more: Partial<DecideAbout> = {}, entryMore: Partial<LogEntry> = {}): LogEntry =>
  entry('decide', { day, run, manifest: SHA(String(run % 10)), inputs: inputs(day), outputs: KEYS, option, scope, policies: SHA('e'), rule: null, ...more } satisfies DecideAbout, { reason: option === 'asis' ? 'Real change' : null, ...entryMore });
const release = (decision: number, outcome: 'applied' | 'refused' = 'applied'): LogEntry => entry('release', { run: 1, manifest: SHA('1'), outputs: KEYS, decision, leaf: SHA('d'), outcome, why: outcome === 'refused' ? 'a later day is current' : null });

describe('pauses, read from the record (ADR 0009 §10)', () => {
  it('opens with a held run, and is decided by a decision for the same inputs and keys', () => {
    const log = [held('2023-09-21', 41), decide('2023-09-21', 41, 'asis')];
    const [p] = pausesOf(log);
    expect(p).toMatchObject({ day: '2023-09-21', run: 41, state: 'decided', otherBuild: false, released: false, waiting: ['borough_hour', 'weather_effect', 'zone_hour'], keys: KEYS });
    expect(p!.decision).toMatchObject({ seq: log[1]!.seq, by: 'owner', reason: 'Real change', about: { option: 'asis', scope: 'day' } });
    expect(pausesOf([...log, release(log[1]!.seq)])[0]!.released).toBe(true);
    expect(pausesOf([...log, release(log[1]!.seq, 'refused')])[0]!.released).toBe(false);
  });

  it('stays open across visits until someone decides, whatever else runs', () => {
    const log = [held('2023-09-21', 41), ok('2023-09-20', 2), held('2023-09-22', 3), ok('2023-09-25', 4)];
    expect(pausesOf(log).map((p) => [p.day, p.state])).toEqual([['2023-09-21', 'open'], ['2023-09-22', 'open']]);
  });

  it('closes when a later run of the same inputs passes', () => {
    expect(pausesOf([held('2023-09-21', 41), ok('2023-09-21', 42)])[0]!.state).toBe('passed');
    // Another day's file is other inputs: it closes nothing.
    expect(pausesOf([held('2023-09-21', 41), ok('2023-09-21', 42, inputs('2023-09-21', { trips: SHA('7'), zones: SHA('2'), weather: SHA('3') }))])[0]!.state).toBe('open');
  });

  it('takes the latest decision, an amendment included', () => {
    const first = decide('2023-09-21', 41, 'dont');
    const log = [held('2023-09-21', 41), first, decide('2023-09-21', 41, 'asis', 'day', {}, { amends: first.seq })];
    expect(pausesOf(log)[0]!.decision).toMatchObject({ amends: first.seq, about: { option: 'asis' } });
  });

  it('runs again after a reload: the same keys stay decided; other keys (another build) open it again', () => {
    const log = [held('2023-09-21', 41), decide('2023-09-21', 41, 'asis')];
    expect(pausesOf([...log, held('2023-09-21', 1)])[0]).toMatchObject({ run: 1, state: 'decided', otherBuild: false });
    expect(pausesOf([...log, held('2023-09-21', 1, { ...KEYS, zone_hour: 'other' })])[0]).toMatchObject({ state: 'open', otherBuild: true });
    expect(decisionFor(log, inputs('2023-09-21'), KEYS)).toMatchObject({ kind: 'same', decision: { about: { option: 'asis' } } });
    expect(decisionFor(log, inputs('2023-09-21'), { ...KEYS, zone_hour: 'other' })!.kind).toBe('otherBuild');
    expect(decisionFor(log, inputs('2023-09-22'), KEYS)).toBeNull();
  });

  it('stays decided when a day published as is runs again with nothing left waiting, and opens nothing for such a run', () => {
    const asis = decide('2023-09-21', 41, 'asis');
    const log = [held('2023-09-21', 41), asis, release(asis.seq), held('2023-09-21', 42, {})];
    expect(pausesOf(log)[0]).toMatchObject({ run: 41, state: 'decided', otherBuild: false, released: true });
    expect(pausesOf([held('2023-09-23', 5, {})])).toEqual([]);
  });

  it('names every held output by key, so a reload that leaves every output waiting keeps the same decision', () => {
    const ALL = { ...KEYS, districts: 'kd', weather_hourly: 'kw', zone_list: 'kl' };
    const reheld = (run: number, waiting: string[]) => entry('run', { run, manifest: SHA(String(run % 10)), outcome: 'held', day: '2023-09-21', inputs: inputs('2023-09-21'), holds: [], waiting, keys: ALL } satisfies HeldAbout);
    // The first visit: the zones and the weather reuse their keys, so three outputs wait; the decision names all six.
    const log = [reheld(41, Object.keys(KEYS)), decide('2023-09-21', 41, 'asis', 'day', { outputs: ALL })];
    expect(pausesOf(log)[0]).toMatchObject({ state: 'decided', waiting: Object.keys(KEYS), keys: ALL });
    // After a reload the engine is empty: every held output waits, with the same keys. Still the same decision.
    const after = [...log, reheld(1, Object.keys(ALL))];
    expect(pausesOf(after)[0]).toMatchObject({ run: 1, state: 'decided', otherBuild: false, waiting: Object.keys(ALL) });
    expect(decisionFor(after, inputs('2023-09-21'), ALL)!.kind).toBe('same');
    // Run again once it is published: held, its keys named, nothing waiting. It opens and changes nothing.
    expect(pausesOf([...after, reheld(2, [])])[0]).toMatchObject({ run: 1, state: 'decided' });
    expect(pausesOf([reheld(3, [])])).toEqual([]);
  });

  it('compares inputs and keys exactly', () => {
    expect(inputsKey(inputs('2023-09-21'))).toBe(inputsKey(inputs('2023-09-21')));
    expect(inputsKey(inputs('2023-09-21'))).not.toBe(inputsKey(inputs('2023-09-22')));
    expect(sameKeys(KEYS, { zone_hour: 'kz', weather_effect: 'ke', borough_hour: 'kb' })).toBe(true);
    expect(sameKeys(KEYS, { ...KEYS, extra: 'x' })).toBe(false);
  });

  it("finds a run's inputs in its manifest: the flow, the parameters, and each source's file", async () => {
    const plan = await planOf();
    const m = manifestOf(plan);
    expect(inputsOf(m)).toEqual({ flow: plan.flow.hash, parameters: { month: '2023-09', day: '2023-09-21' }, files: { trips: SHA('1'), zones: SHA('2'), weather: SHA('3') } });
  });
});

describe('what became of a held day (ADR 0009 §6, §12)', () => {
  const pause = (log: LogEntry[]) => pausesOf(log)[0]!;
  const run = (holds: number, waiting: number, released = false) => ({ holds, waiting, released });

  it('waits until a person decides, and a run that published has no pause', () => {
    expect(pauseState(run(0, 0), null)).toBeNull();
    expect(pauseState(run(1, 3), null)).toBe('waiting');
    expect(pauseState(run(1, 3), pause([held('2023-09-21', 41)]))).toBe('waiting');
  });

  it('is not published once decided so; published as is once released, or once nothing is left waiting', () => {
    const asis = decide('2023-09-21', 41, 'asis');
    expect(pauseState(run(1, 3), pause([held('2023-09-21', 41), decide('2023-09-21', 41, 'dont')]))).toBe('dont');
    // Decided, not yet released (a crash between the two, or a release refused): the day still waits.
    expect(pauseState(run(1, 3), pause([held('2023-09-21', 41), asis]))).toBe('waiting');
    expect(pauseState(run(1, 3, true), pause([held('2023-09-21', 41), asis]))).toBe('asis');
    expect(pauseState(run(1, 3), pause([held('2023-09-21', 41), asis, release(asis.seq)]))).toBe('asis');
    expect(pauseState(run(1, 0), pause([held('2023-09-21', 41), asis]))).toBe('asis');
  });

  it('has nothing to decide when every held output shows its versions already, and waits again under another build', () => {
    expect(pauseState(run(1, 0), null)).toBeNull();
    const log = [held('2023-09-21', 41), decide('2023-09-21', 41, 'dont'), held('2023-09-21', 1, { ...KEYS, zone_hour: 'other' })];
    expect(pauseState(run(1, 3), pause(log))).toBe('waiting');
  });

  it('is read from the record alone for a day held in an earlier visit', () => {
    expect(pauseState(null, null)).toBeNull();
    expect(pauseState(null, pause([held('2023-09-21', 41)]))).toBe('waiting');
    expect(pauseState(null, pause([held('2023-09-21', 41), decide('2023-09-21', 41, 'asis')]))).toBe('asis');
    expect(pauseState(null, pause([held('2023-09-21', 41), decide('2023-09-21', 41, 'dont', 'untilPass')]))).toBe('dont');
    expect(pauseState(null, pause([held('2023-09-21', 41), ok('2023-09-21', 42)]))).toBeNull();
  });
});

describe('a decision that stands until a day passes (ADR 0009 §6)', () => {
  it('covers each held day after it until a day publishes', () => {
    const fri = decide('2023-09-22', 3, 'dont', 'untilPass');
    const log = [held('2023-09-22', 3), fri];
    expect(standingFor(log, '2023-09-23')).toMatchObject({ seq: fri.seq, about: { day: '2023-09-22' } });
    expect(standingFor(log, '2023-09-24')!.seq).toBe(fri.seq);
    expect(standingFor(log, '2023-09-22')).toBeNull();
    const after = [...log, ok('2023-09-25', 6)];
    expect(standingFor(after, '2023-09-26')).toBeNull();
    // Mon 25 passing ends it for the days after Mon, not for Sat and Sun before it.
    expect(standingFor(after, '2023-09-23')!.seq).toBe(fri.seq);
  });

  it('is ended by a day published as is in between', () => {
    const fri = decide('2023-09-22', 3, 'dont', 'untilPass');
    const sat = decide('2023-09-23', 4, 'asis');
    expect(standingFor([fri, sat, release(sat.seq)], '2023-09-24')).toBeNull();
    expect(standingFor([fri, sat, release(sat.seq, 'refused')], '2023-09-24')!.seq).toBe(fri.seq);
  });

  it('never stands for this day only, for publish as is, once amended, or when applied under another', () => {
    expect(standingFor([decide('2023-09-22', 3, 'dont', 'day')], '2023-09-23')).toBeNull();
    expect(standingFor([decide('2023-09-22', 3, 'asis', 'untilPass')], '2023-09-23')).toBeNull();
    const fri = decide('2023-09-22', 3, 'dont', 'untilPass');
    expect(standingFor([fri, decide('2023-09-22', 3, 'dont', 'day', {}, { amends: fri.seq })], '2023-09-23')).toBeNull();
    const sat = decide('2023-09-23', 4, 'dont', 'untilPass', { under: fri.seq });
    // Sat applied Fri's decision: Sun stands under Fri's, not Sat's.
    expect(standingFor([fri, sat], '2023-09-24')!.seq).toBe(fri.seq);
  });

  it('takes the nearest day before, and reads a day from the period when an entry has none', () => {
    const nov = decide('2022-11-14', 1, 'dont', 'untilPass');
    const fri = decide('2023-09-22', 3, 'dont', 'untilPass');
    expect(standingFor([fri, nov], '2023-09-23')!.seq).toBe(fri.seq);
    // An ok run of an earlier build carries only its inputs, or its load.
    const passed = entry('run', { run: 5, manifest: SHA('5'), outcome: 'ok', inputs: inputs('2023-09-23') });
    expect(standingFor([fri, passed], '2023-09-24', 'day')).toBeNull();
    expect(standingFor([fri, passed], '2023-09-24')!.seq).toBe(fri.seq);
    expect(standingFor([fri, entry('run', { run: 5, outcome: 'ok', load: '2023-09-23' })], '2023-09-24')).toBeNull();
  });
});
