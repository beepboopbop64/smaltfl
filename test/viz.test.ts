/**
 * The news's visuals (ADR 0008): every chart says its finding to a screen reader, starts counts at zero, carries no
 * broken numbers, and escapes what it is given.
 */
import { describe, expect, it } from 'vitest';
import { amountLine, bandSpan, bulletTrack, composition, contextBars, dayStrip, decisionRow, dumbbellRows, episodeBars, esc, episodeLine, gateBars, glyph, hourBars, learnStrip, lineage, niceMax, partBar, quantileStrip, reachIcon, ruleRows, splitRows, stripBar, trendPips, waterfall, wrapName } from '../src/app/viz.js';

const hours = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 300));
const usual = Array.from({ length: 24 }, () => 5000);
const charts: [string, string, boolean][] = [
  ['split', splitRows({ rows: [{ name: 'Flex Fare', today: 4613, usual: 4800, todayLabel: '4,613', usualLabel: '~4.8k' }, { name: 'Everything else', today: 20, usual: 110_000, todayLabel: '20', usualLabel: '~110k', sev: 'alert' }], aria: 'Trips by kind: Flex Fare 4,613 of about 4,800; everything else 20 of about 110,000' }), true],
  ['hours', hourBars({ got: hours, usual, cut: 13, cutLabel: '13:00', floorLabel: '~300/h after', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 95% at 13:00' }), true],
  ['gate', gateBars({ rows: 4633, dropped: 2116, limit: 0.1, usual: { low: 4531, high: 7472 }, shareLabel: '46% of arrived rows dropped', limitLabel: 'limit 10%', countLabel: ['2,116 rows dropped', 'usual 4.5k–7.5k'], aria: 'Checks held the run: 46% of arrived rows dropped, limit 10%' }), true],
  ['bullet', bulletTrack({ value: 77033, low: 54642, high: 118922, valueLabel: '77,033', bandLabel: 'usual 55k–119k', aria: 'Trips: 77,033, usual 55k to 119k' }), true],
  ['strip', dayStrip({ days: [{ day: '2024-01-01', v: 81013, low: 49479, high: 107687 }, { day: '2024-01-02', v: null, low: null, high: null }, { day: '2024-01-03', v: 90000, low: 80000, high: 120000, sev: 'warn' }], aria: 'Trips day by day' }), true],
  ['waterfall', waterfall({ steps: [{ name: 'Usual', label: '122,920', value: 122920, total: true, kind: 'total' }, { name: 'Vendor 1', label: '−35,335', value: -35335, kind: 'down', sev: 'alert' }, { name: 'Rest', label: '+3,143', value: 3143, kind: 'up' }, { name: 'Today', label: '90,728', value: 90728, total: true, kind: 'total' }], aria: 'From usual to today' }), true],
  ['composition', composition({ bars: [{ label: 'usual', parts: [{ name: '1', share: 0.75, text: 'Credit card' }, { name: '2', share: 0.25 }] }, { label: 'today', parts: [{ name: '1', share: 0.002 }, { name: '0', share: 0.996, fresh: true }, { name: '2', share: 0, gone: true }] }], aria: 'Payment type' }), false],
  ['episode', episodeLine({ days: [{ label: 'Thu', got: hours, usual }, { label: 'Fri', got: hours.map(() => 200), usual }], cut: 13, cutLabel: 'Thu 13:00', aria: 'Every hour, Thu to Fri' }), true],
  ['rules', ruleRows({ rules: [{ label: 'Distance', warns: false, rows: 2059, low: 1700, high: 4100, usualLabel: 'usual 1.7k–4.1k' }, { label: 'Passengers', warns: true, rows: 4613, low: null, high: null, usualLabel: '' }], aria: 'Rows each check fails' }), true],
  ['lineage', lineage({ source: 'trips', step: 'trips_valid', outputs: ['zone_hour', 'borough_hour', 'weather_effect'], aria: 'Not published' }), false],
  ['dumbbell', dumbbellRows({ rows: [{ label: 'Credit card', today: 0.002, low: 0.75, high: 0.8, todayLabel: '0.2%', usualLabel: 'usually 75–80%', sev: 'alert' }, { label: 'JFK', today: 0, low: 0.037, high: 0.061, todayLabel: 'none', usualLabel: 'usually 3.7–6.1%', gone: true }], aria: 'Shares that moved' }), true],
  ['context', contextBars({ values: [0, 0, 7.2, 1.5], note: 'Sat 7.2 cm · Sun 1.5 cm', label: (v) => `${v.toFixed(1)} cm`, kind: 'snow', aria: 'Snow in Manhattan each day, for context: 7.2 cm on Sat, 1.5 cm on Sun' }), true],
  ['learned', learnStrip({ weeks: [98_000, 101_000, 95_000, 99_000, 97_000, 100_000], weeksLabel: '6 Saturdays before', year: [92_000], yearLabel: ['last year', 'Sep 24'], today: { v: 5732, low: 81_000, high: 147_000, sev: 'alert' }, bandLabel: 'usual 81k–147k', aria: 'The six Saturdays before and the day last year: today’s range from them, 81,000 to 147,000' }), true],
  ['quantiles', quantileStrip({ today: [0, 0.6, 1.1, 1.9, 4], usual: [{ low: 0.46, high: 0.76 }, null, { low: 1.7, high: 2.0 }, null, { low: 3.4, high: 3.9 }], moved: 0, sev: 'warn', fmt: (v) => `${v} mi`, ends: ['short', 'long'], aria: 'Distance: shorter at the bottom' }), false],
];

describe('the news’s charts', () => {
  it.each(charts)('%s says its finding, carries no broken numbers', (_name, svg, counts) => {
    expect(svg).toMatch(/^<svg class="viz" [^>]*role="img" aria-label="[^"]{10,}"/);
    expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
    if (counts) expect(svg).toContain('data-y0="0"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('draws a part that almost stopped as a sliver you can still see', () => {
    const svg = splitRows({ rows: [{ name: 'A', today: 1, usual: 100_000, todayLabel: '1', usualLabel: '~100k', sev: 'alert' }], aria: 'A: 1 of about 100,000' });
    const widths = [...svg.matchAll(/<path class="ink-strong" d="M0 [\d.]+H([\d.]+)/g)].map((m) => Number(m[1]));
    expect(widths.length).toBe(1);
    expect(widths[0]).toBeGreaterThan(0);
  });

  it('draws the hours after a fall as present but low, and the trips missing as missing, counted', () => {
    const got = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 40));
    const svg = hourBars({ got, usual, cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~40/h', missingLabel: '~55k missing', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 99% from 13:00' });
    // Each short hour's bar is at least 3 px tall, though 40 of 5,000 would be under 1 px.
    const tall = [...svg.matchAll(/<path class="ink-strong" d="M[\d.]+ ([\d.]+)V[\d.]+Q[\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]) - Number(m[2]));
    expect(tall).toHaveLength(11);
    for (const t of tall) expect(t).toBeGreaterThanOrEqual(3 - 1e-9);
    // One area for what is missing, a wash with a dashed edge, and its count and the floor in words on the chart.
    expect(svg.match(/class="absent"/g)).toHaveLength(1);
    expect(svg).toContain('~55k missing');
    expect(svg).toContain('still ~40/h');
    // Without a span, no missing area: a finding's own small chart draws ghosts only.
    expect(hourBars({ got, usual, cut: 13, aria: 'Trips by hour' })).not.toContain('absent');
  });

  it('puts the day’s change on the amount line when it is given', () => {
    const svg = amountLine({ value: 41939, low: 89028, high: 160128, valueLabel: '41,939', bandLabel: 'usual 89k–160k', changeLabel: '−65%', sev: 'alert', aria: '41,939 trips, −65%' });
    expect(svg).toContain('class="count-chg chg-alert" dx="8">−65%</tspan>');
    expect(amountLine({ value: 1, low: 0, high: 2, valueLabel: '1', bandLabel: 'usual 0–2', aria: 'one trip' })).not.toContain('count-chg');
  });

  it('draws trips beyond the usual count as an outlined box past a notch, 6 px at least', () => {
    const svg = partBar({ left: { name: 'Flex Fare', today: 10518, usual: 4508, label: '10,518 · usual ~4.5k', sev: 'warn' }, right: { name: 'Everything else', today: 69_500, usual: 68_486, label: '69,500 · usual ~68.5k' }, aria: 'Flex Fare 10,518 against about 4,508' });
    const overs = [...svg.matchAll(/<rect class="over" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(overs).toHaveLength(2);
    // The rest's 1,014 extra trips are 4 px at this scale: drawn as 6 px (less its outline).
    expect(Math.min(...overs)).toBeGreaterThanOrEqual(4.5 - 1e-9);
    expect(svg.match(/class="usual-end"/g)).toHaveLength(2);
    // Each usual notch stays clear of the count labels over the bar, their descenders (a comma, ~3 px) included.
    const labels = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="(?:start|end)" class="lbl-m">/g)].map((m) => Number(m[1]));
    const notches = [...svg.matchAll(/class="usual-end" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(labels).toHaveLength(2);
    expect(notches).toHaveLength(2);
    for (const [y1, y2] of notches) {
      for (const y of labels) expect(y1, `notch from ${y1}, label on ${y}`).toBeGreaterThanOrEqual(y + 4);
      expect(y2).toBeLessThanOrEqual(62);
    }
  });

  it('marks earlier days in a strip, and gives axes ends that don’t jump', () => {
    const svg = dayStrip({ days: [{ day: '2023-09-22', v: 4633, low: 84912, high: 155515, sev: 'alert', mark: 'held' }, { day: '2023-09-25', v: 91341, low: 71515, high: 130105 }], aria: 'Trips by day' });
    expect(svg).toContain('g-held');
    expect([niceMax(8360), niceMax(10_800), niceMax(1), niceMax(21)]).toEqual([10_000, 12_000, 1, 25]);
  });

  it('frames the day on screen in an episode’s hours, and draws no day after it (ADR 0008 §10)', () => {
    const day = { label: 'Thu', got: hours, usual };
    // Fri Sep 22: Thu and Fri only, Fri framed and its name bold; the bracket ends where the chart does.
    const svg = episodeBars({ days: [day, { ...day, label: 'Fri', got: hours.map(() => 20) }], cut: 13, cutLabel: '13:00', at: 1, bracket: { from: 13, to: 48, label: '~187k fewer (≥130k)' }, aria: 'Trips by hour, Thu to Fri' });
    expect(svg.match(/class="today-ring"/g)).toHaveLength(1);
    expect(Number(/class="today-ring" x="([\d.]+)"/.exec(svg)![1])).toBeCloseTo(24 * (334 / 48) + 0.5, 0);
    expect(svg).toMatch(/class="tick at"[^>]*>Fri</);
    expect(svg).not.toContain('>Sat<');
    // A lone day needs no frame; a late fall on it puts its shortfall under the bracket, clear of the hour's label.
    expect(episodeBars({ days: [day], cut: 13, at: 0, aria: 'Trips by hour, Thu' })).not.toContain('today-ring');
    const late = episodeBars({ days: [day], cut: 15, cutLabel: '15:00', at: 0, bracket: { from: 15, to: 24, label: '~52k fewer (≥45k)' }, aria: 'Trips by hour, Sat' });
    expect(late).toMatch(/y="39" text-anchor="end" class="lbl-bad lbl-halo">~52k fewer/);
    // A day after the one on screen in the loads strip: its usual range, no count.
    const later = stripBar({ v: 0, low: 84912, high: 155515, ymax: 160000 });
    expect(later).toContain('class="ghost"');
    expect(later).not.toMatch(/class="(ink|sev-[a-z]+-fill)"/);
  });

  it('ticks published outputs in plain boxes, never a severity ring, and hatches held ones (ADR 0008 §10)', () => {
    const pub = reachIcon({ n: 3, state: 'published' });
    expect(pub.match(/class="tick-pub"/g)).toHaveLength(3);
    expect(pub).not.toContain('ring-bad');
    const held = reachIcon({ n: 5, state: 'held' });
    expect(held.match(/class="hatch-box"/g)).toHaveLength(3);
    expect(held).not.toContain('tick-pub');
    expect(held).toContain('class="wall"');
  });

  it('keeps an episode’s shortfall, an estimate with its bound, clear of the hour it began', () => {
    const day = { label: 'Sat', got: hours, usual };
    const svg = episodeBars({ days: [day, { ...day, label: 'Sun', got: hours.map(() => 60) }], cut: 15, cutLabel: '15:00', bracket: { from: 15, to: 48, label: '~135k fewer (≥110k)' }, aria: 'Trips by hour, Sat to Sun: about 135,000 fewer, at least 110,000' });
    const at = Number(/<text x="([\d.]+)"[^>]*class="lbl-bad lbl-halo">~135k fewer/.exec(svg)![1]);
    const cutEnd = (15 * 334) / 48 + 4 + 5 * 7;
    expect(at - ('~135k fewer (≥110k)'.length * 6.6) / 2).toBeGreaterThan(cutEnd);
  });

  it('draws a gate just past its limit crossing it, zoomed with its margin said, the value a pointer and never ‖', () => {
    const near = gateBars({ rows: 4229, dropped: 442, limit: 0.1, usual: { low: 3800, high: 5400 }, shareLabel: '10.45% of arrived rows dropped', limitLabel: 'limit 10%', marginLabel: '0.45 pt over', zoom: true, countLabel: ['442 rows dropped', 'usual 3.8k–5.4k'], aria: 'Held: 10.45% of arrived rows dropped against a 10% limit, 0.45 points over' });
    // Two tracks (the full bar and its zoom), two limit ticks, two pointers; no wall cap, no dashes.
    expect(near.match(/class="track"/g)).toHaveLength(2);
    expect(near.match(/class="limit"/g)).toHaveLength(2);
    expect(near.match(/class="pointer"/g)).toHaveLength(2);
    expect(near).not.toContain('class="wall"');
    expect(near).toContain('0.45 pt over');
    expect(near).toContain('>20%</text>');
    // On the full bar the ink ends 3 px past the tick (it is 1.5 px past at scale); on the zoom, at its true place.
    const ends = [...near.matchAll(/<path class="ink-strong" d="M0 [\d.]+H([\d.]+)Q([\d.]+)/g)].map((m) => Number(m[2]));
    const ticks = [...near.matchAll(/<rect class="limit" x="([\d.]+)"/g)].map((m) => Number(m[1]) + 1.25);
    expect(ends[0]! - ticks[0]!).toBeGreaterThanOrEqual(3 - 0.1);
    expect(ends[1]! - ticks[1]!).toBeCloseTo((0.4516 / 20) * 334, 0);
    // Just under, it ends 3 px short of the tick; far past it, no zoom.
    const under = gateBars({ rows: 41_939, dropped: 4004, limit: 0.1, usual: null, shareLabel: '9.55%', countLabel: ['4,004 rows dropped', ''], aria: 'The checks: 9.55% of arrived rows dropped' });
    const uEnd = Number(/<path class="ink-strong" d="M0 [\d.]+H[\d.]+Q([\d.]+)/.exec(under)![1]);
    expect(Number(/<rect class="limit" x="([\d.]+)"/.exec(under)![1]) + 1.25 - uEnd).toBeGreaterThanOrEqual(3 - 0.1);
    expect(gateBars({ rows: 4633, dropped: 2116, limit: 0.1, usual: null, shareLabel: '46%', countLabel: ['2,116 rows dropped', ''], aria: 'Held: 46% of arrived rows dropped' }).match(/class="track"/g)).toHaveLength(1);
  });

  it('shows a narrow band past its tick, and never stretches it over a tick outside it', () => {
    // Grown about its middle when the value is inside or unknown; away from the value when it is outside.
    expect(bandSpan(50, 52, null, 7)).toEqual([47.5, 54.5]);
    expect(bandSpan(50, 52, 45, 7)).toEqual([50, 57]);
    expect(bandSpan(50, 52, 60, 7)).toEqual([45, 52]);
    expect(bandSpan(50, 52, null, 7, 0, 53)).toEqual([46, 53]);
    expect(bandSpan(10, 40, 5, 7)).toEqual([10, 40]);
    const svg = dayStrip({ days: [{ day: '2022-11-11', v: 130_000, low: 129_000, high: 131_000 }, { day: '2022-11-12', v: 140_000, low: 129_000, high: 131_000, sev: 'warn' }], aria: 'Trips by day' });
    const bands = [...svg.matchAll(/<rect class="ghost(?:-2)?" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(bands).toHaveLength(2);
    for (const [, hgt] of bands) expect(hgt).toBeGreaterThanOrEqual(7 - 1e-9);
    // The second day's tick sits above its band: the band's top stays at its true high, under the tick.
    const ticks = [...svg.matchAll(/<rect class="(?:ink|sev-warn-fill)" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="3"/g)].map((m) => Number(m[1]));
    expect(ticks[1]! + 3).toBeLessThanOrEqual(bands[1]![0]! + 1e-9);
  });

  it('colours a day’s tick by where it sits: plain inside its own band, its severity only outside', () => {
    const inside = dayStrip({ days: [{ day: '2023-09-22', v: 4613, low: 2600, high: 5500, sev: 'alert' }], aria: 'Flex Fare by day' });
    expect(inside).not.toContain('sev-alert-fill');
    expect(dayStrip({ days: [{ day: '2024-01-01', v: 10_518, low: 2280, high: 8610, sev: 'warn' }], aria: 'Flex Fare by day' })).toContain('sev-warn-fill');
  });

  it('keys a strip where it is first shown, and prints its axis with a unit and 0', () => {
    const svg = dayStrip({ days: [{ day: '2024-01-01', v: 10_518, low: 2280, high: 8610 }, { day: '2023-12-31', v: 13_296, low: 3615, high: 7771 }], key: ['usual', 'actual'], unit: '/day', aria: 'Flex Fare by day' });
    expect(svg).toContain('>usual</text>');
    expect(svg).toContain('>actual</text>');
    expect(svg).toContain('>15k/day</text>');
    expect(svg).toMatch(/class="tick" aria-hidden="true">0<\/text>/);
  });

  it('labels the value a story is about in a 100% bar, and gives a value gone today no width but its name', () => {
    const svg = composition({ moved: '0', bars: [
      { label: 'usual', parts: [{ name: '1', share: 0.75, text: 'Credit card' }, { name: '4', share: 0.19, text: 'Cash' }, { name: '0', share: 0.06, text: 'Flex Fare trip', callout: 'Flex Fare 6.2%' }] },
      { label: 'today', parts: [{ name: '1', share: 0.004, text: 'Credit card' }, { name: '0', share: 0.996, text: 'Flex Fare trip', callout: 'Flex Fare 99.6%' }, { name: '4', share: 0, text: 'Cash', gone: true }] },
    ], aria: 'Payment type: Flex Fare 99.6% today, usually 6.2%' });
    // Narrow: over the bar with a leader. Wide: inside. Cash takes no width and is named.
    expect(svg).toMatch(/class="lbl-b">Flex Fare 6\.2%<\/text><line class="leader"/);
    expect(svg).toContain('class="lbl-on-dark">Flex Fare 99.6%</text>');
    expect(svg).toContain('>Cash: none</text>');
    expect(svg).not.toContain('seg-gone');
    expect(svg.match(/<rect /g)).toHaveLength(5);
    // A sliver is 3 px at least.
    const widths = [...svg.matchAll(/<rect class="[^"]+" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it('wraps a step’s name in the waterfall instead of cutting it, and joins the steps with solid lines', () => {
    expect(wrapName('Everything else', 12)).toEqual(['Everything', 'else']);
    expect(wrapName('Usual', 12)).toEqual(['Usual']);
    expect(wrapName('Vendor 1 · Creative Mobile Technologies', 12)).toEqual(['Vendor 1 ·', 'Creative Mo…']);
    const svg = waterfall({ steps: [{ name: 'Usual', label: '115k', value: 115_000, total: true, kind: 'total' }, { name: 'Everything else', label: '−110k', value: -110_000, kind: 'down' }, { name: 'Flex Fare', label: '−143', value: -143, kind: 'up' }, { name: 'Today', label: '4.6k', value: 4633, total: true, kind: 'total' }], aria: 'From a usual day to this one' });
    expect(svg).toContain('>Everything</text>');
    expect(svg).toContain('>else</text>');
    expect(svg).not.toContain('…');
    expect(svg).not.toContain('class="joint"');
    expect(svg.match(/class="link"/g)).toHaveLength(3);
  });

  it('keeps dashes for what is absent: no dotted day dividers, the usual hours under one skyline', () => {
    const day = { label: 'Sat', got: hours, usual };
    const svg = episodeBars({ days: [day, { ...day, label: 'Sun' }], aria: 'Trips by hour, Sat to Sun' });
    expect(svg).not.toContain('dotted');
    expect(svg.match(/class="skyline"/g)).toHaveLength(1);
    // A warn-only rule's bar is hollow, so the band behind it shows through; non-zero bars are 3 px at least.
    const rules = ruleRows({ rules: [{ label: 'In month', warns: false, rows: 1, low: null, high: null, usualLabel: '' }, { label: 'Passengers', warns: true, rows: 4613, low: 2600, high: 5500, usualLabel: 'usual 2.6k–5.5k' }], aria: 'Rows each check fails' });
    expect(Number(/<path class="ink" d="M0 [\d.]+H[\d.]+Q([\d.]+)/.exec(rules)![1])).toBeGreaterThanOrEqual(3 - 1e-9);
    expect(rules.indexOf('class="ghost"')).toBeLessThan(rules.indexOf('class="ink-outline"'));
  });

  it('marks a count past its usual range past a notch, and ends a row with no range on its count (tabs #12)', () => {
    // Jan 1, 2024: Distance 4,305 against 365–2.6k, Fare 1,306 with no range of its own, In month never failing.
    const svg = ruleRows({ rules: [{ label: 'Distance', warns: false, rows: 4305, low: 365, high: 2605, usualLabel: 'usual 365–2.6k' }, { label: 'Fare', warns: false, rows: 1306, low: null, high: null, usualLabel: '' }, { label: 'In month', warns: false, rows: 0, low: 0.5, high: 0.5, usualLabel: 'never fails' }], aria: 'Rows each rule failed' });
    // One row past its range: the outlined box past a notch; the others none.
    expect(svg.match(/class="over"/g)).toHaveLength(1);
    expect(svg.match(/class="usual-end"/g)).toHaveLength(1);
    expect(svg).not.toMatch(/ · <\/text>/);
    expect(svg).toContain('1,306</tspan></text>');
    expect(svg).toContain('never fails');
    // A band of less than one row is no band.
    expect(svg.match(/class="ghost"/g)).toHaveLength(1);
    // The gate's count bar the same: 6,942 rows dropped against 2.1k–6.3k.
    const gate = gateBars({ rows: 81013, dropped: 6942, limit: 0.1, usual: { low: 2119, high: 6327 }, shareLabel: '8.6% of arrived rows dropped', limitLabel: 'limit 10%', countLabel: ['6,942 rows dropped', 'usual 2.1k–6.3k'], aria: 'The checks: 8.6%' });
    expect(gate.match(/class="over"/g)).toHaveLength(1);
    const inside = gateBars({ rows: 81013, dropped: 4000, limit: 0.1, usual: { low: 2119, high: 6327 }, shareLabel: '4.9% of arrived rows dropped', limitLabel: 'limit 10%', countLabel: ['4,000 rows dropped', 'usual 2.1k–6.3k'], aria: 'The checks: 4.9%' });
    expect(inside).not.toContain('class="over"');
  });

  it('escapes the names it is given', () => {
    const svg = splitRows({ rows: [{ name: '<b>"x"&', today: 1, usual: 2, todayLabel: '1', usualLabel: '2' }], aria: 'a "quoted" <label>' });
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;&quot;x&quot;&amp;');
    expect(svg).toContain('aria-label="a &quot;quoted&quot; &lt;label&gt;"');
  });

  it('marks severity by shape, and every glyph is hidden from screen readers', () => {
    expect(glyph('alert')).toContain('M8 .6l6.7 3.8v7.2');
    expect(glyph('warn')).toContain('g-tri');
    for (const g of ['alert', 'warn', 'note', 'held', 'flag', 'closed', 'explained', 'ack'] as const) expect(glyph(g)).toContain('aria-hidden="true"');
    // A day decided reads by shape (ADR 0009 §12): published as is a flag, not published a box crossed out, paused two
    // bars; three different shapes, none a colour alone.
    expect(glyph('flag')).toContain('g-wall');
    expect(glyph('closed')).toMatch(/g-box.*g-x/);
    expect(new Set(['held', 'flag', 'closed'].map((g) => glyph(g as 'held').replace(/class="g g-\w+"/, '')))).toHaveProperty('size', 3);
    expect(stripBar({ v: 4633, low: 84912, high: 155515, ymax: 160000, sev: 'alert' })).toContain('sev-alert-fill');
  });

  it('keeps the band’s ends standing past the amount line’s dot, so a value on an end never hides it', () => {
    // Sat Jan 6, 2024: 97,117 just inside a 94k–156k range.
    const svg = amountLine({ value: 97_117, low: 94_000, high: 156_000, valueLabel: '97,117', bandLabel: 'usual 94k–156k', aria: 'Trips' });
    const ends = /<path class="band-end" d="M([\d.]+) ([\d.]+)V([\d.]+)M([\d.]+) [\d.]+V[\d.]+"/.exec(svg)!;
    const dot = /<circle class="dot" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(svg)!;
    // Taller than the dot and its halo (5.5 + 2), above and below; and drawn first, so the dot sits on the band, not under.
    expect(Number(dot[2]) - Number(ends[2])).toBeGreaterThan(Number(dot[3]) + 1);
    expect(Number(ends[3]) - Number(dot[2])).toBeGreaterThan(Number(dot[3]) + 1);
    expect(svg.indexOf('band-end')).toBeLessThan(svg.indexOf('class="dot'));
    // The left end is at the band's left edge, within the dot's reach: the dot covers it only in the middle.
    expect(Math.abs(Number(ends[1]) - Number(dot[1]))).toBeLessThan(8);
  });

  it('puts a part’s mark against its own name, before the left one and after the right one', () => {
    const svg = partBar({ left: { name: 'Flex Fare', today: 5714, usual: 4700, label: '5,714 · usual ~4.7k' }, right: { name: 'Everything else', today: 18, usual: 104_000, label: '18 · usual ~104k', sev: 'alert' }, aria: 'Split' });
    expect(svg).toContain('<text x="318" y="12" text-anchor="end" class="lbl-b">Everything else</text>');
    expect(svg).toContain('<g transform="translate(321 1)">');
    const left = partBar({ left: { name: 'Vendor 1', today: 3, usual: 35_000, label: '3 · usual ~35k', sev: 'alert' }, right: { name: 'Everything else', today: 90_000, usual: 88_000, label: '90,000 · usual ~88k' }, aria: 'Split' });
    expect(left).toContain('<g transform="translate(0 1)">');
    expect(left).toContain('<text x="16" y="12" text-anchor="start" class="lbl-b">Vendor 1</text>');
  });

  it('draws snow as context in the strip’s own columns, from 0, the days the card names said clear of every bar', () => {
    const days = Array.from({ length: 56 }, (_, i) => ({ day: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`, v: 90_000, low: 80_000, high: 120_000 }));
    const strip = dayStrip({ days, unit: '/day', aria: 'Trips' });
    const values = days.map((_, i) => (i === 20 ? 12 : i === 54 ? 7.2 : i === 55 ? 1.5 : 0));
    const bars = contextBars({ values, note: 'Sat 7.2 cm · Sun 1.5 cm', label: (v) => `${v.toFixed(1)} cm`, kind: 'snow', gx: 12, aria: 'Snow' });
    // The strip's tick for the last day and the context bar for it share a centre.
    const tick = [...strip.matchAll(/<rect class="ink" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].at(-1)!;
    const bar = [...bars.matchAll(/<path class="wx-bar snow" d="M([\d.]+) ([\d.]+)V([\d.]+)/g)];
    expect(bar.length).toBe(3);
    const bw = Math.min(14, (334 - 12) / 56 - 2);
    expect(Math.abs(Number(tick[1]) + Number(tick[2]) / 2 - (Number(bar[2]![1]) + bw / 2))).toBeLessThan(0.2);
    // The note at the top right, above every bar's top; the storm further back says its own amount over its bar.
    const labels = [...bars.matchAll(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)" class="lbl-m">([^<]+)</g)];
    expect(labels.map((l) => l[4])).toEqual(['Sat 7.2 cm · Sun 1.5 cm', '12.0 cm']);
    const tops = bar.map((b) => Number(b[3]));
    expect(Number(labels[0]![2])).toBeLessThan(Math.min(...tops));
    expect(bars).not.toMatch(/sev-|ghost/);
  });

  it('draws an episode’s days in its chip, each against a usual day, the viewed day darker', () => {
    const svg = trendPips({ days: [{ trips: 41_939, expected: 119_400 }, { trips: 4633, expected: 115_000 }, { trips: 5732, expected: 114_000 }] });
    expect(svg).toContain('aria-hidden="true"');
    expect([...svg.matchAll(/class="ghost"/g)].length).toBe(3);
    const ink = [...svg.matchAll(/<rect class="(ink|ink-strong)" x="[\d.]+" y="[\d.]+" width="5" height="([\d.]+)"/g)];
    expect(ink.map((m) => m[1])).toEqual(['ink', 'ink', 'ink-strong']);
    // Thursday's third of a day stands taller than Friday's and Saturday's twentieth, which still show (2 px).
    expect(Number(ink[0]![2])).toBeGreaterThan(2 * Number(ink[1]![2]));
    expect(Number(ink[1]![2])).toBeGreaterThanOrEqual(2);
  });

  it('draws what a day is learned from inside its frame: each weekday, the day last year, today’s band, named', () => {
    const svg = learnStrip({ weeks: [98_000, 101_000, 95_000, 99_000, 97_000, 100_000], weeksLabel: '6 Saturdays before', year: [92_000, 94_000], yearLabel: ['last year', 'Sep 17–24'], today: { v: 5732, low: 81_000, high: 147_000, sev: 'alert' }, bandLabel: 'usual 81k–147k', aria: 'Learned from' });
    expect([...svg.matchAll(/class="learn-dot"/g)].length).toBe(6);
    expect([...svg.matchAll(/class="learn-year"/g)].length).toBe(2);
    for (const label of ['6 Saturdays before', 'last year', 'Sep 17–24', 'usual 81k–147k', 'today']) expect(svg).toContain(`>${label}</text>`);
    // Every label inside the frame: a start-anchored one from 0, an end-anchored one to the width, a middle one with
    // room for its half on each side.
    for (const m of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"(?: text-anchor="(\w+)")?[^>]*>([^<]+)</g)) {
      const x = Number(m[1]);
      const half = (m[4]!.length * 6.2) / 2;
      expect(x, m[4]).toBeGreaterThanOrEqual(m[3] === 'middle' ? half : 0);
      expect(x, m[4]).toBeLessThanOrEqual(m[3] === 'middle' ? 334 - half : 334);
      expect(Number(m[2]), m[4]).toBeGreaterThan(8);
    }
    // Today's value below its band takes the day's severity; a holiday has last year alone.
    expect(svg).toContain('sev-alert-fill');
    const holiday = learnStrip({ weeks: [], weeksLabel: '', year: [70_000], yearLabel: ['last year', 'Jan 1'], today: { v: 81_013, low: 49_000, high: 108_000 }, bandLabel: 'usual 49k–108k', aria: 'Learned from' });
    expect(holiday).not.toContain('learn-dot');
    expect(holiday).not.toContain('sev-');
  });
});

describe('a held day’s options, drawn as what readers get (ADR 0009 §12)', () => {
  // Thu Sep 21, 2023: the trips fall at 13:00 to a trickle; Wed 20 is what readers keep.
  const thu = Array.from({ length: 24 }, (_, h) => (h < 13 ? 4000 + h * 100 : 30));
  const usualThu = Array.from({ length: 24 }, () => 5200);
  const wed = Array.from({ length: 24 }, (_, h) => 3000 + h * 120);
  const scale = Math.max(...usualThu, ...thu, ...wed);
  const asis = decisionRow({ mark: 'flag', label: 'Publish as is', number: '41,939', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, short: [13, 23], scale, aria: 'Publish as is: readers get Thu Sep 21 as it came, 41,939 trips, Trips fall 95% from 13:00' });
  const dont = decisionRow({ mark: 'closed', label: 'Don’t publish', number: 'Wed 20 · 108,434', cause: 'hours', rows: { cause: 'hours', hours: wed }, other: true, scale, ticks: [[0, '0h'], [13, '13h'], [24, '24h']], aria: 'Don’t publish: readers keep Wed Sep 20, 108,434 trips, and this day is never published' });
  // Each bar's height, by its hour.
  const heights = (svg: string, cls: string) => new Map([...svg.matchAll(new RegExp(`<path class="${cls}" d="M[\\d.]+ ([\\d.]+)V([\\d.]+)Q[^"]*" data-k="(\\d+)"`, 'g'))].map((m) => [Number(m[3]), Number(m[1]) - Number(m[2]) + 1.5]));

  it('says its option with its numbers, as a chart, its mark beside four words at most and one number', () => {
    for (const svg of [asis, dont]) {
      expect(svg).toMatch(/^<svg class="viz decide-row" [^>]*role="img" aria-label="[^"]{20,}"/);
      expect(svg).not.toMatch(/NaN|undefined|Infinity|null/);
      expect(svg).toContain('data-y0="0"');
    }
    expect(asis).toContain('aria-label="Publish as is: readers get Thu Sep 21 as it came, 41,939 trips');
    expect(dont).toContain('108,434 trips');
    expect(asis).toContain('g-flag');
    expect(dont).toContain('g-closed');
    for (const [svg, label, n] of [[asis, 'Publish as is', '41,939'], [dont, 'Don’t publish', 'Wed 20 · 108,434']] as const) {
      expect(svg).toContain(`class="opt-l">${esc(label)}</text>`);
      expect(svg).toContain(`class="opt-n">${esc(n)}</text>`);
      expect(label.split(' ').length).toBeLessThanOrEqual(4);
    }
  });

  it('draws every row on one scale: the same count is the same height on each, and heights go as the counts', () => {
    const a = heights(asis, 'ink-strong');
    const b = heights(dont, 'hatch-col');
    expect(a.size).toBe(24);
    expect(b.size).toBe(24);
    // Hour 5: Thu 4,500 and Wed 3,600, drawn in that ratio; the tallest hour of either fills the drawing's height.
    expect(a.get(5)! / b.get(5)!).toBeCloseTo(thu[5]! / wed[5]!, 1);
    expect(Math.max(...a.values(), ...b.values())).toBeLessThanOrEqual(34 + 1e-9);
  });

  it('hatches another day’s rows only, dashes only the hours the day’s own rows lack, and never draws a trickle under 3 px', () => {
    expect(asis).not.toContain('hatch-col');
    expect(dont).not.toMatch(/class="ink-strong"/);
    // One absent area over the short hours, on the day's own rows; none on another day's.
    expect(asis.match(/class="absent"/g)).toHaveLength(1);
    expect(dont).not.toContain('absent');
    const d = /<path class="absent" d="M([\d.]+) [\d.]+(.*?)V[\d.]+Z"/.exec(asis)!;
    expect(Number(d[1])).toBeCloseTo((13 * 300) / 24 + 0.75, 0);
    // Without a short span, nothing is absent.
    expect(decisionRow({ mark: 'flag', label: 'Publish as is', number: '1', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, scale, aria: 'Publish as is: 1 trip' })).not.toContain('absent');
    // 30 trips of 5,200 is under 1 px, drawn at 3.
    for (const [hr, ht] of heights(asis, 'ink-strong')) if (hr >= 13) expect(ht).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it('prints the shared axis once, under the row that carries it, hidden from screen readers', () => {
    expect(asis).not.toContain('class="tick"');
    for (const t of ['0h', '13h', '24h']) expect(dont).toMatch(new RegExp(`class="tick" aria-hidden="true">${t}</text>`));
  });

  it('draws a split as the part and the rest on one count bar, the part named, its missing trips absent; another day split too, hatched', () => {
    // Mon Nov 14, 2022: Vendor 1 sent 2 trips where ~33.8k are usual; the rest as usual. Sun 13 is what readers keep.
    const sc = 33_842 + 82_544;
    const own = decisionRow({ mark: 'flag', label: 'Publish as is', number: '82,278', cause: 'split', rows: { cause: 'split', part: 2, rest: 82_276 }, usual: { cause: 'split', part: 33_842, rest: 82_544 }, part: 'Vendor 1 · 2', scale: sc, aria: 'Publish as is: 82,278 trips' });
    const sun = decisionRow({ mark: 'closed', label: 'Don’t publish', number: 'Sun 13 · 100,000', cause: 'split', rows: { cause: 'split', part: 30_000, rest: 70_000 }, other: true, part: 'Vendor 1 · 2', scale: sc, ticks: [[0, '0'], [sc, '116k']], aria: 'Don’t publish: readers keep Sun Nov 13, 100,000 trips' });
    const part = /<rect class="ink-strong" x="0" y="[\d.]+" width="([\d.]+)"[^>]*data-part="part"/.exec(own)!;
    expect(Number(part[1])).toBe(3);
    expect(own).toContain('>Vendor 1 · 2</text>');
    expect(own.match(/class="absent"/g)).toHaveLength(1);
    expect(sun.match(/class="hatch-col"/g)).toHaveLength(2);
    expect(sun).not.toContain('absent');
    expect(sun).not.toContain('Vendor 1 · 2');
    // One scale: the rest's 82,276 against Sun's 70,000, in that ratio.
    const w = (svg: string, p: string) => Number(new RegExp(`width="([\\d.]+)" height="16" rx="2" data-part="${p}"`).exec(svg)![1]);
    expect(w(own, 'rest') / w(sun, 'rest')).toBeCloseTo(82_276 / 70_000, 2);
  });

  it('draws anything else as a strip of the week, the day last: its own rows below their range lacking, another day’s hatched', () => {
    const week = [96_000, 101_000, 99_000, 104_000, 98_000, 102_000];
    const own = decisionRow({ mark: 'flag', label: 'Publish as is', number: '74,592', cause: 'amount', rows: { cause: 'amount', days: [...week, 74_592] }, usual: { cause: 'amount', days: [...week, 118_000] }, scale: 118_000, aria: 'Publish as is: 74,592 trips' });
    const kept = decisionRow({ mark: 'closed', label: 'Don’t publish', number: 'Tue 4 · 74,562', cause: 'amount', rows: { cause: 'amount', days: [...week, 74_562] }, other: true, scale: 118_000, ticks: [[0, 'Thu 30'], [6, 'Wed 5']], aria: 'Don’t publish: readers keep Tue Jan 4' });
    expect(own.match(/class="ink"/g)).toHaveLength(6);
    expect(own.match(/data-k="day"/g)).toHaveLength(1);
    expect(own.match(/class="absent"/g)).toHaveLength(1);
    expect(kept.match(/class="hatch-col"/g)).toHaveLength(1);
    expect(kept).not.toContain('absent');
    expect(kept).toContain('>Wed 5</text>');
  });

  it('draws nothing published as one absent frame, and greys a row that can’t be chosen', () => {
    const none = decisionRow({ mark: 'closed', label: 'Don’t publish', number: 'nothing shown', cause: 'hours', rows: null, other: true, scale: 10, aria: 'Don’t publish: readers get nothing, nothing is published yet' });
    expect(none.match(/class="absent"/g)).toHaveLength(1);
    expect(none).not.toContain('hatch-col');
    const off = decisionRow({ mark: 'flag', label: 'Publish as is', number: 'Mon 25 is published', cause: 'hours', rows: { cause: 'hours', hours: thu }, scale, off: true, aria: 'Publish as is: not possible' });
    expect(off).toMatch(/^<svg class="viz decide-row off"/);
    expect(off).toContain('data-off="true"');
    // Under a head that carries the mark, the row draws none, and its words start at the left edge.
    const bare = decisionRow({ mark: null, label: '41,939 trips', number: '', cause: 'hours', rows: { cause: 'hours', hours: thu }, scale, aria: 'Thu Sep 21: 41,939 trips' });
    expect(bare).not.toContain('class="g ');
    expect(bare).toContain('<text x="0" y="15" class="opt-l">41,939 trips</text>');
    expect(bare).not.toContain('opt-n');
  });

  it('marks a decided day at 14 px by shape: ⚑ a flag on its pole, ✕ a box crossed out', () => {
    for (const g of ['held', 'flag', 'closed'] as const) expect(glyph(g, 14)).toMatch(/^<svg width="14" height="14" viewBox="0 0 16 16"/);
  });
});
