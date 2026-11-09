/**
 * What holds a run, what waits, and what the record says was decided (ADR 0009), on the example's plan with made-up
 * counts and claims, the synthetic history, and made-up record entries.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NONE } from '../src/core/calendar.js';
import { sourceOf, type FlowDocument, type PublishDef, type StepDef } from '../src/core/document.js';
import { HistoryRanges } from '../src/core/history.js';
import {
  calendarFor,
  rangesFor,
  claimHolds,
  countedChecks,
  dayClaim,
  dayState,
  decisionFor,
  donorDefault,
  flowStory,
  heldOutputs,
  holdsOf,
  inputsKey,
  inputsOf,
  judgeClaim,
  judgeClaims,
  judgeDonors,
  lastPublished,
  pausesOf,
  levelFor,
  levelsOf,
  pauseState,
  skipOf,
  reachOf,
  sameKeys,
  stagedKeys,
  standingEnds,
  standingFor,
  tripped,
  waitingOf,
  type ClaimFacts,
  type DecideAbout,
  type DerivedAbout,
  type HeldAbout,
  type Inputs,
  type Judged,
  type ReleaseAbout,
  type StoryClaim,
  type StoryClaim2,
} from '../src/core/hold.js';
import type { Repair } from '../src/core/fill.js';
import type { LogEntry } from '../src/core/log.js';
import type { ExpectationResult, RunManifest } from '../src/core/manifest.js';
import { translate, type FlowPlan } from '../src/core/plan.js';
import { historyWith } from './helpers/history.js';
import { exampleUnfilled } from './helpers/example.js';

// The example as it was before its fill step: these plans index its nodes, and add a fill step of their own.
const example = exampleUnfilled();
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

  it('judges a plan/2 watch by its own period, and holds nothing for one that never holds (ADR 0010 §10)', async () => {
    const { publish: _p, ...doc } = example;
    const parameters = [...(doc.parameters ?? []).filter((p) => p.name !== 'day'), DAY_PARAM];
    const plan2 = (watch: Record<string, unknown>, hold: PublishDef['hold']) => translate({ ...doc, smaltfl: 3, parameters, publish: { hold, watch: { trips: { history: 'history.json', period: 'day', ...watch } as never } } }, { month: '2023-09', day: '2023-09-21' });
    const told = await plan2({ holds: false }, ['checks']);
    expect(told.smaltflPlan).toBe(2);
    // plan/2 reads claim/2 (ADR 0010 §6): told under the flow hash, from the measures the run made.
    const MEASURED = SHA('c');
    const c2 = (over: Partial<StoryClaim2> = {}): StoryClaim2 => ({ by: 'story', v: 2, source: 'trips', slot: '2023-09-21', every: 'day', state: 'wrong', below: true, head: 'Trips fall 95% from 13:00', build: 'dev', flow: told.flow.hash, history: { base: HISTORY, tail: null }, measured: MEASURED, rows: 41_939, skip: [], levels: [], ...over });
    const facts2 = facts({ measured: () => MEASURED, flow: told.flow.hash });
    expect(judgeClaims(told, [c2()], facts2)).toEqual([{ node: 0, claim: c2() }]);
    expect(judgeClaims(told, [claim()], facts2)).toEqual([{ node: 0, unjudged: "the claim for trips isn't claim/2, which plan/2 needs" }]);
    expect(holdsOf(told, manifestOf(told), judgeClaims(told, [c2()], facts2))).toEqual([]);
    expect(holdsOf(told, manifestOf(told), [])).toEqual([]);
    const holding = await plan2({}, ['checks', 'wrong']);
    const facts2h = facts({ measured: () => MEASURED, flow: holding.flow.hash });
    expect(holdsOf(holding, manifestOf(holding), judgeClaims(holding, [c2({ flow: holding.flow.hash })], facts2h))).toMatchObject([{ by: 'story', origin: 'trips', said: 'Trips fall 95% from 13:00' }]);
    expect(judgeClaims(holding, [c2({ flow: holding.flow.hash, slot: '2023-09-20' })], facts2h)).toEqual([{ node: 0, unjudged: 'the claim is of 2023-09-20, the run of 2023-09-21' }]);
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

  it('judges one claim where it is told: any node, its day and the watch’s file, as a donor’s will be (amendment 1 S3)', () => {
    // A donor's claim: its own day, the history pinned under the source's watch, the donor snapshot's rows at its node.
    const donor = claim({ day: '2023-09-14', state: 'calm', below: false, head: 'A normal Thursday', rows: 118_250 });
    const at = { node: 7, origin: 'trips', file: 'history.json', day: '2023-09-14' };
    const rows = facts({ rows: (n) => (n === 7 ? 118_250 : 41_939) });
    expect(judgeClaim({ ...donor, note: 'from the page' }, at, rows)).toEqual({ node: 7, claim: donor });
    expect(judgeClaim({ ...donor }, { ...at, day: '2023-09-21' }, rows)).toEqual({ node: 7, unjudged: 'the claim is of 2023-09-14, the run of 2023-09-21' });
    expect(judgeClaim({ ...donor }, { ...at, node: 0 }, rows)).toEqual({ node: 0, unjudged: 'the claim counts 118,250 rows of trips, the snapshot holds 41,939' });
    expect(judgeClaim({ ...donor, by: 'page' }, at, rows)).toEqual({ node: 7, unjudged: "the claim for trips isn't a story's claim" });
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
  // The flow's noun for its source (ADR 0010 §8): the claim's head says it, as the example's does.
  const doc = { steps: [{ id: 'trips_valid', kind: 'expectations' as const, inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' as const }] }], ontology: { objectTypes: [], linkTypes: [], actionTypes: [], nouns: { trips: { one: 'trip', many: 'trips' } } } };
  const claimOn = (trouble: Parameters<typeof historyWith>[0]) => dayClaim(new HistoryRanges(historyWith(trouble)), doc, HISTORY, DAY, 'trips', 'abc123');

  it('tells a day that falls at an hour, and one a vendor left, as wrong and short', () => {
    expect(claimOn({ [DAY]: { stopAt: 13 } })).toEqual({ by: 'story', source: 'trips', day: DAY, state: 'wrong', below: true, head: 'Trips fall to trickle from 13:00', build: 'abc123', history: HISTORY, rows: 44_219 });
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

  it('judges as the document says (ADR 0010): days not judged yet are published, marked; a bad value is something wrong', () => {
    const FIRST_THANKSGIVING = '2021-11-25';
    const unlearned = dayClaim(new HistoryRanges(historyWith({})), doc, HISTORY, FIRST_THANKSGIVING, 'trips', 'dev')!;
    expect(unlearned).toMatchObject({ state: 'unlearned', below: false, head: 'Not judged yet' });
    expect([claimHolds(['checks', 'wrong'], unlearned), claimHolds(['short'], unlearned), claimHolds(['checks', 'unlearned', 'wrong'], unlearned)]).toEqual([false, false, true]);
    // The floor that needs no range holds under short as well as wrong (Q-53).
    const floor = dayClaim(new HistoryRanges(historyWith({ [FIRST_THANKSGIVING]: { blank: true } })), doc, HISTORY, FIRST_THANKSGIVING, 'trips', 'dev')!;
    expect(floor).toMatchObject({ state: 'wrong', below: true });
    expect(floor.head).toMatch(/^Almost no trips: /);
    expect(claimHolds(['short'], floor)).toBe(true);
    // A watched source whose ontology marks a rare value bad (vendor 6, a fifth of a percent of the trips): its rise to
    // 0.65% is something wrong, where unmarked it is too few points to tell (ADR 0010 §4).
    const marked = { ...doc, ontology: { ...doc.ontology, properties: [{ column: 'VendorID', title: 'Vendor', description: 'Who', values: { '1': 'One', '2': 'Two', '6': 'Six' }, bad: ['6'] }] }, publish: { hold: ['checks', 'wrong'] as PublishDef['hold'], watch: { trips: 'history.json' }, period: 'day' } };
    const file = historyWith({});
    const vh = file.values.VendorID!;
    [vh.first[2], vh.last[2]] = [0, file.days.length - 1];
    vh.counts = vh.counts!.map((c, k) => [c[0]!, c[1]!, Math.round(file.rows[k]! * (file.days[k] === DAY ? 0.0065 : 0.002 * (1 + 0.04 * Math.sin(k * 1.7))))]);
    const rise = (d: typeof doc) => dayClaim(new HistoryRanges(file), d, HISTORY, DAY, 'trips', 'dev')!;
    expect(rise(doc).state).toBe('calm');
    expect(rise(marked)).toMatchObject({ state: 'wrong', below: false });
    expect(claimHolds(['checks', 'wrong'], rise(marked))).toBe(true);
    // A general watch is judged by its own calendar, none unless chosen (Q-58): the ranges must be made with it.
    const general = { ...doc, publish: { hold: ['checks', 'wrong'] as PublishDef['hold'], watch: { trips: { history: 'history.json' } }, period: 'day' } };
    expect(calendarFor(general, 'trips')).toBe(NONE);
    expect(calendarFor(doc, 'trips').base).toBe('us-nyc/1');
    expect(() => flowStory(new HistoryRanges(historyWith({})), DAY, general, 'trips')).toThrow('the flow judges trips by the none calendar: these ranges were made with us-nyc/1');
    // And with the general form's pattern and re-learning (ADR 0010 §3, §5), which ranges made otherwise don't have.
    expect(() => flowStory(new HistoryRanges(historyWith({}), { calendar: NONE }), DAY, general, 'trips')).toThrow("the flow judges trips by its watch's pattern and re-learning: these ranges were made with other settings");
    expect(rangesFor(general, 'trips')).toMatchObject({ calendar: NONE, pattern: 'weekly', echoes: true, relearn: false });
    expect(rangesFor({ ...general, publish: { ...general.publish, watch: { trips: { history: 'history.json', relearn: true } } } }, 'trips')).toMatchObject({ relearn: true });
    expect(rangesFor(doc, 'trips')).toMatchObject({ pattern: 'weekly', echoes: false, relearn: false });
    expect(dayClaim(new HistoryRanges(historyWith({}), rangesFor(general, 'trips')), general, HISTORY, FIRST_THANKSGIVING, 'trips', 'dev')!.state).not.toBe('unlearned');
  });

  it('fills a paused day from the same weekday for the weekly pattern, and the nearest good day otherwise (ADR 0010 §3)', () => {
    expect(donorDefault('history.json')).toBe('weekday');
    expect(donorDefault({ history: 'h.json' })).toBe('weekday');
    expect(donorDefault({ history: 'h.json', donor: 'nearest' })).toBe('nearest');
    expect(donorDefault({ pattern: 'none' as never, donor: undefined as never })).toBe('nearest');
    expect(donorDefault({ pattern: 'weekly', donor: 'nearest' })).toBe('nearest');
  });

  it('counts the checks only when they are the ones the history counted, reading the source alone', () => {
    const h = new HistoryRanges(historyWith({}));
    expect(countedChecks(doc, h, 'trips')).toBe(true);
    expect(countedChecks(doc, h, 'zones')).toBe(false);
    expect(countedChecks(doc, h, undefined)).toBe(false);
    expect(countedChecks({ steps: [{ ...doc.steps[0]!, rules: [{ ...doc.steps[0]!.rules[0]!, check: 'fare_amount > 0' }] }] }, h, 'trips')).toBe(false);
    // A box in front of the source leaves the checks other rows to count.
    const boxed = { steps: [{ id: 'trips_box', kind: 'filter' as const, inputs: ['trips'], where: 'true' }, { ...doc.steps[0]!, inputs: ['trips_box'] }] };
    expect(countedChecks(boxed, h, 'trips')).toBe(false);
  });

  // A fill step (amendment 1 S1) passes its source's rows through on any day it fills nothing. Only its kind and inputs
  // matter here, so these steps are written short.
  const fill = (id: string, inputs: string[]) => ({ id, kind: 'fill', inputs }) as unknown as StepDef;

  it('reads the source through its fill step: what the checks count, and what an input stands for (C7)', () => {
    const h = new HistoryRanges(historyWith({}));
    const filled = { steps: [fill('trips_filled', ['trips']), { ...doc.steps[0]!, inputs: ['trips_filled'] }] };
    expect(countedChecks(filled, h, 'trips')).toBe(true);
    expect(countedChecks(filled, h, 'trips_filled')).toBe(false);
    expect(sourceOf(filled, 'trips_filled')).toBe('trips');
    expect(sourceOf(filled, 'trips')).toBe('trips');
    expect(sourceOf(example, 'trips')).toBe('trips');
    // Any other step stands for no source, and neither does a fill step that reads one, or a loop.
    expect(sourceOf(example, 'trips_valid')).toBeUndefined();
    expect(sourceOf({ steps: [...filled.steps, fill('again', ['trips_valid'])] }, 'again')).toBeUndefined();
    expect(sourceOf({ steps: [fill('a', ['b']), fill('b', ['a'])] }, 'a')).toBeUndefined();
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

  it('stays published as is once released, whatever is decided after: a release is never taken back', () => {
    const asis = decide('2023-09-21', 41, 'asis');
    const log = [held('2023-09-21', 41), asis, release(asis.seq), decide('2023-09-21', 41, 'dont', 'day', {}, { amends: asis.seq })];
    expect(pause(log)).toMatchObject({ state: 'decided', released: true, decision: { about: { option: 'dont' } } });
    expect(pauseState(null, pause(log))).toBe('asis');
    expect(pauseState(run(1, 0), pause(log))).toBe('asis');
    // A release of other keys (another build's) isn't this run's: the day waits again.
    expect(pause([...log, held('2023-09-21', 1, { ...KEYS, zone_hour: 'other' })]).released).toBe(false);
  });

  it('has nothing to decide when every held output shows its versions already, and waits again under another build', () => {
    expect(pauseState(run(1, 0), null)).toBeNull();
    const log = [held('2023-09-21', 41), decide('2023-09-21', 41, 'dont'), held('2023-09-21', 1, { ...KEYS, zone_hour: 'other' })];
    expect(pauseState(run(1, 3), pause(log))).toBe('waiting');
  });

  it('is read from the record alone for a day held in an earlier visit', () => {
    expect(pauseState(null, null)).toBeNull();
    expect(pauseState(null, pause([held('2023-09-21', 41)]))).toBe('waiting');
    // Published as is needs its release: decided, with none applied (the tab closed in between, or it was refused), the
    // day still waits, though no run of it is here to say so.
    const asis = decide('2023-09-21', 41, 'asis');
    expect(pauseState(null, pause([held('2023-09-21', 41), asis]))).toBe('waiting');
    expect(pauseState(null, pause([held('2023-09-21', 41), asis, release(asis.seq, 'refused')]))).toBe('waiting');
    expect(pauseState(null, pause([held('2023-09-21', 41), asis, release(asis.seq)]))).toBe('asis');
    expect(pauseState(null, pause([held('2023-09-21', 41), decide('2023-09-21', 41, 'dont', 'untilPass')]))).toBe('dont');
    expect(pauseState(null, pause([held('2023-09-21', 41), ok('2023-09-21', 42)]))).toBeNull();
  });
});

describe('a decision that stands until a day publishes (ADR 0009 §6)', () => {
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

  it('is said to end where standingFor stops applying it, and nowhere else (the record\'s "· ends #N")', () => {
    const at = (log: LogEntry[], e: LogEntry) => standingEnds(log, log.indexOf(e));
    const thu = decide('2023-09-21', 1, 'dont', 'untilPass');
    // A day after it publishes: it ends, and Fri no longer stands under it.
    const mon = ok('2023-09-25', 6);
    const log = [held('2023-09-21', 1), thu, mon];
    expect(at(log, mon)).toBe(thu.seq);
    expect(standingFor(log, '2023-09-26')).toBeNull();
    // A day before it publishing (Wed 20 run after Thu was decided) ends nothing: Fri still stands under it.
    const wed = ok('2023-09-20', 2);
    const early = [held('2023-09-21', 1), thu, wed];
    expect(at(early, wed)).toBeNull();
    expect(standingFor(early, '2023-09-22')!.seq).toBe(thu.seq);
    // Amended to publish as is: it stopped standing when amended, so the day that publishes later ends nothing.
    const amend = decide('2023-09-21', 1, 'asis', 'day', {}, { amends: thu.seq });
    const mon2 = ok('2023-09-25', 6);
    const amended = [held('2023-09-21', 1), thu, amend, mon2];
    expect(standingFor(amended.slice(0, 3), '2023-09-22')).toBeNull();
    expect(at(amended, mon2)).toBeNull();
    // A release that publishes a day after it ends it, and the day that passes after that ends nothing more.
    const fri = decide('2023-09-22', 3, 'asis');
    const rel = release(fri.seq);
    const mon3 = ok('2023-09-25', 6);
    const released = [held('2023-09-21', 1), thu, held('2023-09-22', 3), fri, rel, mon3];
    expect(at(released, rel)).toBe(thu.seq);
    expect(at(released, mon3)).toBeNull();
    // The same day run again ends nothing again; held runs and decisions end nothing.
    const again = ok('2023-09-25', 7);
    expect(at([...log, again], again)).toBeNull();
    expect(at(log, thu)).toBeNull();
  });

  it('says the day readers had when a decision was made: the day of the last publication before it', () => {
    const fri = decide('2023-09-22', 3, 'dont');
    // Readers had Thu 21 (published as is) when Fri was decided; Mon 25 passing after it changes nothing of that.
    const thu = decide('2023-09-21', 1, 'asis');
    const log = [ok('2023-09-18', 1), held('2023-09-21', 1), thu, release(thu.seq), held('2023-09-22', 3), fri, ok('2023-09-25', 6)];
    expect(lastPublished(log.slice(0, log.indexOf(fri)))).toBe('2023-09-21');
    expect(lastPublished(log)).toBe('2023-09-25');
    // An earlier day passing moves the names back (Q-51): readers then had that day.
    expect(lastPublished([ok('2024-01-01', 1), ok('2023-09-20', 2)])).toBe('2023-09-20');
    // A refused release published nothing; nothing published yet, nothing.
    expect(lastPublished([ok('2023-09-18', 1), thu, release(thu.seq, 'refused')])).toBe('2023-09-18');
    expect(lastPublished([held('2023-09-21', 1)])).toBeNull();
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

// ------------------------------------------------------------------ filling a paused day (ADR 0009 amendment 1)

/** The example with a fill step on the trips, derived for Thu 21 from Thu 14: a plan with a donor (S4). */
async function derivedPlan(from: string | null = '2023-09-14'): Promise<FlowPlan> {
  const { publish: _p, ...doc } = example;
  const parameters = [...(doc.parameters ?? []).filter((p) => p.name !== 'day'), DAY_PARAM];
  const steps = [
    { id: 'trips_filled', kind: 'fill' as const, inputs: from ? ['trips', 'trips_donor'] : ['trips'], time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime'], missing: { time: 'tpep_pickup_datetime', hours: [13, 23] as [number, number] }, from },
    ...doc.steps.map((s) => (s.id === 'trips_valid' ? { ...s, inputs: ['trips_filled'] } : s)),
  ];
  const sources = from ? [...doc.sources, { id: 'trips_donor', table: 'trips_file_donor' }] : doc.sources;
  return translate({ ...doc, smaltfl: 2, parameters, sources, steps, publish: PUBLISH }, { month: '2023-09', day: '2023-09-21' });
}
const donorClaim = (over: Partial<StoryClaim> = {}): StoryClaim => claim({ source: 'trips_donor', day: '2023-09-14', state: 'calm', below: false, head: 'A normal Thursday', rows: 125_129, ...over });
const donorFacts = (donor: number) => facts({ rows: (n) => (n === donor ? 125_129 : 41_939) });

describe('a donor, judged by its claim (amendment 1 S3, C4)', () => {
  it('is judged by the one check every claim goes through, at the donor’s node and the fill’s day', async () => {
    const plan = await derivedPlan();
    const donor = at(plan, 'trips_donor');
    expect(judgeDonors(plan, [claim(), donorClaim()], donorFacts(donor))).toEqual([{ node: donor, claim: donorClaim() }]);
    // The day's own claim (source trips) is a watched source's, not the donor's.
    expect(judgeDonors(plan, [claim()], donorFacts(donor))).toEqual([{ node: donor, unjudged: 'no claim for trips_donor' }]);
    expect(judgeDonors(plan, [donorClaim(), donorClaim()], donorFacts(donor))).toEqual([{ node: donor, unjudged: '2 claims for trips_donor' }]);
  });

  it('is not judged when the claim names another day, another history, or other rows', async () => {
    const plan = await derivedPlan();
    const donor = at(plan, 'trips_donor');
    const said = (c: StoryClaim, f = donorFacts(donor)) => judgeDonors(plan, [c], f)[0];
    expect(said(donorClaim({ day: '2023-09-07' }))).toEqual({ node: donor, unjudged: 'the claim is of 2023-09-07, the run of 2023-09-14' });
    expect(said(donorClaim({ history: { ...HISTORY, path: 'other.json' } }))).toEqual({ node: donor, unjudged: 'the claim was told from other.json, not history.json' });
    expect(said(donorClaim({ rows: 99 }))).toEqual({ node: donor, unjudged: 'the claim counts 99 rows of trips_donor, the snapshot holds 125,129' });
    expect(said(donorClaim(), facts({ pinned: () => undefined }))).toEqual({ node: donor, unjudged: "history.json isn't pinned in the engine" });
  });

  it('judges none for a plan that fills nothing, and says so when the fill’s source isn’t watched', async () => {
    expect(judgeDonors(await planOf(), [donorClaim()], facts())).toEqual([]);
    expect(judgeDonors(await derivedPlan(null), [donorClaim()], facts())).toEqual([]);
    const plan = await derivedPlan();
    const unwatched = { ...plan, publish: { ...plan.publish!, watch: [] } };
    expect(judgeDonors(unwatched, [donorClaim()], facts())).toEqual([{ node: at(plan, 'trips_donor'), unjudged: "trips isn't watched: there is no history to judge its donor by" }]);
  });
});

describe('what holds a derived run (amendment 1 S4, S10)', () => {
  it('holds it by its fill, reaching every output, whatever else holds; and by a donor not judged good', async () => {
    const plan = await derivedPlan();
    const donor = at(plan, 'trips_donor');
    const fill = at(plan, 'trips_filled');
    const m = manifestOf(plan, counts(121_931, 4_000));
    const outputs = plan.outputs.map((o) => o.name);
    const judged: Judged[] = [{ node: 0, claim: claim() }];
    const derived = { by: 'derived', node: fill, origin: 'trips_filled', said: 'fills 13:00–23:59 from 2023-09-14', reaches: outputs };
    expect(holdsOf(plan, m, judged, { derived: true, donors: [{ node: donor, claim: donorClaim() }] })).toEqual([
      { by: 'story', node: 0, origin: 'trips', said: 'Trips fall 95% from 13:00', reaches: ['borough_hour', 'weather_effect', 'zone_hour'], claim: claim() },
      derived,
    ]);
    const wrong = donorClaim({ state: 'wrong', head: 'Vendor 1 sent almost nothing' });
    expect(holdsOf(plan, m, judged, { derived: true, donors: [{ node: donor, claim: wrong }] }).map((h) => [h.by, h.said])).toEqual([
      ['story', 'Trips fall 95% from 13:00'],
      ['donor', 'the donor day 2023-09-14: Vendor 1 sent almost nothing'],
      ['derived', 'fills 13:00–23:59 from 2023-09-14'],
    ]);
    expect(holdsOf(plan, m, judged, { derived: true, donors: [{ node: donor, unjudged: 'no claim for trips_donor' }] }).map((h) => [h.by, h.origin, h.said])[1]).toEqual(['donor', 'trips_donor', 'no claim for trips_donor']);
    // A donor day not judged yet (ADR 0010 §1, C9) publishes as itself, but nothing says it is good: it holds a fill.
    const unlearned = donorClaim({ state: 'unlearned', head: 'Not judged yet' });
    expect(holdsOf(plan, m, judged, { derived: true, donors: [{ node: donor, claim: unlearned }] }).map((h) => [h.by, h.said])[1]).toEqual(['donor', 'the donor day 2023-09-14: Not judged yet']);
    // The complete part: no donor, the same hold.
    const part = await derivedPlan(null);
    expect(holdsOf(part, manifestOf(part), judged, { derived: true }).at(-1)).toMatchObject({ by: 'derived', said: 'keeps all but 13:00–23:59' });
    // Not asked to be derived: the plan's own holds only, as before.
    expect(holdsOf(plan, m, judged)).toEqual([holdsOf(plan, m, judged, { derived: true })[0]]);
  });
});

/** A derived run's entry: Thu 21 filled, run `run`, repairing held run 41. */
const derivedRun = (day: string, run: number, donor: string | null = '2023-09-14'): LogEntry =>
  entry('run', { run, manifest: SHA(String(run % 10)), outcome: 'derived', day, inputs: { ...inputs(day), flow: SHA('g') }, holds: [], waiting: ['zone_hour'], keys: { zone_hour: `kz-${run}` }, from: { run: 41, manifest: SHA('1') }, repair: repairOf(donor) } satisfies DerivedAbout);
const repairOf = (donor: string | null): Repair => ({ kind: donor ? 'fill' : 'complete', step: 'trips_filled', source: 'trips', missing: { time: 'tpep_pickup_datetime', hours: [13, 23] }, donor: donor ? { rule: 'weekday', direction: 'before', day: donor, file: { path: `loads/${donor}.parquet`, sha256: SHA('b'), bytes: 1 }, claim: donorClaim({ day: donor }) } : null });
const fillDecide = (day: string, donor: string | null, scope: DecideAbout['scope'] = 'day', more: Partial<DecideAbout> = {}, entryMore: Partial<LogEntry> = {}) =>
  decide(day, 41, donor ? 'fill' : 'complete', scope, { repair: repairOf(donor), derived: { run: 42, manifest: SHA('2'), keys: { zone_hour: 'kz-42' } }, ...more }, entryMore);
const fillRelease = (decision: number, more: Partial<ReleaseAbout> = {}): LogEntry => entry('release', { run: 42, manifest: SHA('2'), outputs: { zone_hour: 'kz-42' }, decision, leaf: SHA('d'), outcome: 'applied', why: null, from: { run: 41, manifest: SHA('1') }, filled: 83_671, ...more } satisfies ReleaseAbout);

describe('a filled day in the record (amendment 1 S5, S7, S9)', () => {
  it('opens no pause for a derived run, and is filled once its release applies', () => {
    const fill = fillDecide('2023-09-21', '2023-09-14');
    const log = [held('2023-09-21', 41), derivedRun('2023-09-21', 42), fill];
    expect(pausesOf(log).map((p) => [p.day, p.run, p.state])).toEqual([['2023-09-21', 41, 'decided']]);
    expect(pausesOf(log)[0]).toMatchObject({ repaired: null, released: null, withdrawn: null });
    // Decided, not yet released: the day still waits.
    expect(pauseState(null, pausesOf(log)[0]!)).toBe('waiting');
    expect(dayState({ holds: 1, waiting: 3, released: false }, pausesOf(log)[0]!)).toBe('waiting');
    const rel = fillRelease(fill.seq);
    const p = pausesOf([...log, rel])[0]!;
    expect(p.repaired).toEqual({ option: 'fill', release: rel.seq, decision: fill.seq, donor: '2023-09-14', meanwhile: false });
    expect(dayState(null, p)).toBe('fill');
    expect(dayState({ holds: 1, waiting: 3, released: false }, p)).toBe('fill');
    // Slice 1's screens read a day readers got as published, until they draw the remedies (A9).
    expect(pauseState(null, p)).toBe('asis');
    // The part that arrived alone, the same way.
    const part = fillDecide('2023-09-21', null);
    expect(dayState(null, pausesOf([held('2023-09-21', 41), part, fillRelease(part.seq)])[0]!)).toBe('complete');
    // A refused release gave readers nothing.
    expect(dayState(null, pausesOf([...log, fillRelease(fill.seq, { outcome: 'refused', why: 'Mon 25 is published' })])[0]!)).toBe('waiting');
  });

  it('is refilled by an amendment released, and withdrawn by a decision not to publish that amends it (Q-61)', () => {
    const fill = fillDecide('2023-09-21', '2023-09-14');
    const rel = fillRelease(fill.seq);
    const refill = fillDecide('2023-09-21', '2023-09-20', 'day', {}, { amends: fill.seq });
    const rel2 = fillRelease(refill.seq);
    const log = [held('2023-09-21', 41), fill, rel, refill, rel2];
    expect(pausesOf(log)[0]!.repaired).toMatchObject({ donor: '2023-09-20', decision: refill.seq });
    // The refill decided, not yet released: readers still have the first fill.
    expect(pausesOf(log.slice(0, 4))[0]!.repaired).toMatchObject({ donor: '2023-09-14' });
    expect(dayState(null, pausesOf(log.slice(0, 4))[0]!)).toBe('fill');
    const withdraw = decide('2023-09-21', 41, 'dont', 'day', {}, { amends: refill.seq });
    const back = entry('release', { run: 41, manifest: SHA('1'), outputs: { zone_hour: 'kz-wed' }, decision: withdraw.seq, leaf: SHA('d'), outcome: 'applied', why: null, withdraws: rel2.seq } satisfies ReleaseAbout);
    const p = pausesOf([...log, withdraw, back])[0]!;
    expect(p).toMatchObject({ repaired: null, withdrawn: back.seq, decision: { about: { option: 'dont' } } });
    expect(dayState(null, p)).toBe('dont');
    // With a later day current, the names can't go back: the withdrawal is recorded, and the day is not published.
    const refused = entry('release', { run: 41, manifest: SHA('1'), outputs: {}, decision: withdraw.seq, leaf: SHA('d'), outcome: 'refused', why: '2023-09-25 is current', withdraws: rel2.seq } satisfies ReleaseAbout);
    const q = pausesOf([...log, withdraw, refused])[0]!;
    expect(q).toMatchObject({ repaired: null, withdrawn: withdraw.seq });
    expect(dayState(null, q)).toBe('dont');
    // Or with no release at all, as the page records it once a later day is current (S5): withdrawn all the same.
    expect(pausesOf([...log, withdraw])[0]).toMatchObject({ repaired: null, withdrawn: withdraw.seq });
  });

  it('says readers see the day before again once a fill is withdrawn', () => {
    const fill = fillDecide('2023-09-21', '2023-09-14');
    const rel = fillRelease(fill.seq);
    const withdraw = decide('2023-09-21', 41, 'dont', 'day', {}, { amends: fill.seq });
    const back = entry('release', { run: 41, manifest: SHA('1'), outputs: {}, decision: withdraw.seq, leaf: SHA('d'), outcome: 'applied', why: null, withdraws: rel.seq } satisfies ReleaseAbout);
    const log = [ok('2023-09-20', 1), held('2023-09-21', 41), fill, rel];
    expect(lastPublished(log)).toBe('2023-09-21');
    expect(lastPublished([...log, withdraw, back])).toBe('2023-09-20');
  });

  it('is filled under the flow’s meanwhile setting while a person still decides', () => {
    const setting = entry('flow', { flow: SHA('f'), set: { meanwhile: 'fill' } });
    const meanwhile = fillRelease(setting.seq, { under: setting.seq, repair: repairOf('2023-09-14') });
    const log = [setting, held('2023-09-21', 41), meanwhile];
    const p = pausesOf(log)[0]!;
    expect(p).toMatchObject({ state: 'open', repaired: { option: 'fill', meanwhile: true, donor: '2023-09-14', decision: setting.seq } });
    expect(dayState(null, p)).toBe('waiting');
    expect(dayState({ holds: 1, waiting: 3, released: false }, p)).toBe('waiting');
    // A person's fill decision over it: filled.
    const fill = fillDecide('2023-09-21', '2023-09-14');
    expect(dayState(null, pausesOf([...log, fill])[0]!)).toBe('fill');
    // A person's decision not to publish: not published.
    expect(dayState(null, pausesOf([...log, decide('2023-09-21', 41, 'dont')])[0]!)).toBe('dont');
  });
});

describe('a fill that stands until a day passes (amendment 1 S5, Q-64)', () => {
  it('covers each held day after it, its releases under it not ending it', () => {
    const mon = fillDecide('2022-11-14', '2022-11-07', 'untilPass');
    const tue = fillDecide('2022-11-15', '2022-11-01', 'day', { under: mon.seq });
    const log = [held('2022-11-14', 41), mon, fillRelease(mon.seq), held('2022-11-15', 43), tue, fillRelease(tue.seq)];
    expect(standingFor(log, '2022-11-15')!.seq).toBe(mon.seq);
    expect(standingFor(log, '2022-11-16')!.seq).toBe(mon.seq);
    // A day that passes ends it; the part that arrived stands the same way.
    expect(standingFor([...log, ok('2022-11-21', 50)], '2022-11-22')).toBeNull();
    expect(standingFor([fillDecide('2022-11-14', null, 'untilPass')], '2022-11-15')).toMatchObject({ about: { option: 'complete' } });
    // Another decision's release in between (a day published as is) ends it, as for a decision not to publish.
    const wed = decide('2022-11-16', 44, 'asis');
    expect(standingFor([...log, wed, release(wed.seq)], '2022-11-17')).toBeNull();
    // Its own release for a day under it is the decision at work: the record's line ends nothing ("· ends #…" only on the
    // day that passes).
    const end = [...log, ok('2022-11-21', 50)];
    expect(log.map((_, i) => standingEnds(log, i))).toEqual(log.map(() => null));
    expect(standingEnds(end, end.length - 1)).toBe(mon.seq);
  });

  it('is ended by a withdrawal of a fill it covered, or of its own (Q-61): later days wait for a person', () => {
    const mon = fillDecide('2022-11-14', '2022-11-07', 'untilPass');
    const tue = fillDecide('2022-11-15', '2022-11-01', 'day', { under: mon.seq });
    const log = [mon, fillRelease(mon.seq), tue, fillRelease(tue.seq)];
    const withdrawTue = decide('2022-11-15', 43, 'dont', 'day', {}, { amends: tue.seq });
    expect(standingFor([...log, withdrawTue], '2022-11-16')).toBeNull();
    const withdrawMon = decide('2022-11-14', 41, 'dont', 'day', {}, { amends: mon.seq });
    expect(standingFor([...log, withdrawMon], '2022-11-16')).toBeNull();
    // A refill amends it too: the new decision stands if it says so.
    const refill = fillDecide('2022-11-14', '2022-11-13', 'untilPass', {}, { amends: mon.seq });
    expect(standingFor([...log, refill], '2022-11-16')!.seq).toBe(refill.seq);
  });
});

describe('a new level accepted, read from the record (ADR 0009 amendment 1 S6, ADR 0010 §5, C6)', () => {
  const LEVEL = { source: 'trips', from: '2022-11-14', metrics: ['count:VendorID=1', 'trips', 'value:VendorID=1'] };
  const accepted = () => {
    const log = [held('2022-11-14', 61), decide('2022-11-14', 61, 'accept', 'day', { level: LEVEL }, { reason: 'Planned change' })];
    return [...log, release(log[1]!.seq)];
  };

  it('keeps each Accept whose release applied, with its decision, never one amended, refused or under another', () => {
    const log = accepted();
    expect(levelsOf(log, 'trips')).toEqual([{ from: '2022-11-14', metrics: LEVEL.metrics, decision: log[1]!.seq }]);
    expect(levelsOf(log, 'TRIPS')).toHaveLength(1);
    expect(levelsOf(log, 'weather')).toEqual([]);
    expect(levelsOf(log.slice(0, 2), 'trips')).toEqual([]);
    expect(levelsOf([...log.slice(0, 2), release(log[1]!.seq, 'refused')], 'trips')).toEqual([]);
    // A later day published under it names the same level, and adds none.
    const under = decide('2022-11-15', 62, 'accept', 'day', { level: LEVEL, under: log[1]!.seq }, { reason: 'Planned change' });
    expect(levelsOf([...log, held('2022-11-15', 62), under, release(under.seq)], 'trips')).toHaveLength(1);
    // An Accept names its level: one without isn't a decision the record reads.
    expect(pausesOf([held('2022-11-14', 63), decide('2022-11-14', 63, 'accept')])[0]!.decision).toBeNull();
  });

  it('stands for a later day off by nothing but the metrics it names, the way they were, held by the story alone (Q-57b)', () => {
    const log = accepted();
    // On the level's own day the vendor's rows and the day's rows were down.
    const ways = (from: string) => new Map(from === '2022-11-14' ? [['count:VendorID=1', false], ['trips', false], ['value:VendorID=1', false]] : []);
    const off = (...xs: [string, boolean][]) => new Map(xs);
    expect(levelFor(log, 'trips', '2022-11-15', off(['count:VendorID=1', false], ['trips', false]), ways)).toMatchObject({ seq: log[1]!.seq, reason: 'Planned change', about: { option: 'accept', level: LEVEL } });
    // Back the other way (the vendor returns), another metric off, a check holding too, nothing off, the day itself: no.
    expect(levelFor(log, 'trips', '2022-11-21', off(['trips', true]), ways)).toBeNull();
    expect(levelFor(log, 'trips', '2022-11-15', off(['trips', false], ['value:extra=3', false]), ways)).toBeNull();
    expect(levelFor(log, 'trips', '2022-11-15', off(['trips', false]), ways, false)).toBeNull();
    expect(levelFor(log, 'trips', '2022-11-15', off(), ways)).toBeNull();
    expect(levelFor(log, 'trips', '2022-11-14', off(['trips', false]), ways)).toBeNull();
  });

  it('says the day was accepted, publishes it as it came, and learns from it (Q-59)', () => {
    const log = accepted();
    const p = pausesOf(log)[0]!;
    expect(p).toMatchObject({ state: 'decided', released: true });
    expect(dayState(null, p)).toBe('accepted');
    expect(dayState({ holds: 1, waiting: 0, released: true }, p)).toBe('accepted');
    expect(pauseState(null, p)).toBe('asis');
    expect(skipOf(log)).toEqual([]);
    expect(skipOf(log.slice(0, 1))).toEqual(['2022-11-14']);
  });

  it('names the levels in the claim a day after them is told with, and keeps only a level’s own fields', () => {
    const DAY = '2023-10-11';
    const doc = { steps: [{ id: 'trips_valid', kind: 'expectations' as const, inputs: ['trips'], rules: [{ name: 'fare', check: 'fare_amount >= 0', onFail: 'drop' as const }] }], ontology: { objectTypes: [], linkTypes: [], actionTypes: [], nouns: { trips: { one: 'trip', many: 'trips' } } } };
    const file = historyWith({});
    const h = new HistoryRanges(file, { levels: [{ from: '2023-10-04', metrics: ['trips'], decision: 7 }] });
    const c = dayClaim(h, doc, HISTORY, DAY, 'trips', 'dev')!;
    expect(c.levels).toEqual([{ from: '2023-10-04', metrics: ['trips'], decision: 7 }]);
    expect(dayClaim(new HistoryRanges(file), doc, HISTORY, DAY, 'trips', 'dev')!.levels).toBeUndefined();
    const facts = { rows: () => c.rows, pinned: () => ({ sha256: HISTORY.sha256, bytes: HISTORY.bytes }) };
    const at = { node: 0, origin: 'trips', file: HISTORY.path, day: DAY };
    expect(judgeClaim({ ...c, levels: [{ ...c.levels![0]!, extra: 1 }] }, at, facts)).toEqual(expect.objectContaining({ claim: expect.objectContaining({ levels: [{ from: '2023-10-04', metrics: ['trips'], decision: 7 }] }) }));
    expect(judgeClaim({ ...c, levels: [{ from: 'Mon', metrics: [], decision: 7 }] }, at, facts)).toEqual({ node: 0, unjudged: "the claim for trips names levels that aren't levels: a day, metrics and a decision" });
  });
});
