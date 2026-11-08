/**
 * The news's visuals (ADR 0008): every chart says its finding to a screen reader, starts counts at zero, carries no
 * broken numbers, and escapes what it is given.
 */
import { describe, expect, it } from 'vitest';
import { amountLine, bandSpan, bulletTrack, composition, dayStrip, dumbbellRows, episodeBars, episodeLine, gateBars, glyph, hourBars, lineage, niceMax, partBar, quantileStrip, ruleRows, splitRows, stripBar, waterfall, wrapName } from '../src/app/viz.js';

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
  });

  it('marks earlier days in a strip, and gives axes ends that don’t jump', () => {
    const svg = dayStrip({ days: [{ day: '2023-09-22', v: 4633, low: 84912, high: 155515, sev: 'alert', mark: 'held' }, { day: '2023-09-25', v: 91341, low: 71515, high: 130105 }], aria: 'Trips by day' });
    expect(svg).toContain('g-held');
    expect([niceMax(8360), niceMax(10_800), niceMax(1), niceMax(21)]).toEqual([10_000, 12_000, 1, 25]);
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

  it('escapes the names it is given', () => {
    const svg = splitRows({ rows: [{ name: '<b>"x"&', today: 1, usual: 2, todayLabel: '1', usualLabel: '2' }], aria: 'a "quoted" <label>' });
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;&quot;x&quot;&amp;');
    expect(svg).toContain('aria-label="a &quot;quoted&quot; &lt;label&gt;"');
  });

  it('marks severity by shape, and every glyph is hidden from screen readers', () => {
    expect(glyph('alert')).toContain('M8 .6l6.7 3.8v7.2');
    expect(glyph('warn')).toContain('g-tri');
    for (const g of ['alert', 'warn', 'note', 'held', 'explained', 'ack'] as const) expect(glyph(g)).toContain('aria-hidden="true"');
    expect(stripBar({ v: 4633, low: 84912, high: 155515, ymax: 160000, sev: 'alert' })).toContain('sev-alert-fill');
  });
});
