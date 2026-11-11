/**
 * The news's visuals (ADR 0008): every chart says its finding to a screen reader, starts counts at zero, carries no
 * broken numbers, and escapes what it is given.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFS, aucTrack, forestTicks, rankBars, amountLine, bandSpan, notJudgedMark, degrees, weatherHours, bulletTrack, composition, contextBars, dayStrip, decisionRow, dumbbellRows, episodeBars, episodeChip, episodeDays, episodeIcon, esc, episodeLine, gateBars, glyph, hourBars, learnStrip, lineage, niceMax, partBar, quantileStrip, reachIcon, ruleRows, splitRows, stripBar, trendPips, waterfall, wrapName } from '../src/app/viz.js';

const hours = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 300));
const usual = Array.from({ length: 24 }, () => 5000);
const charts: [string, string, boolean][] = [
  ['split', splitRows({ rows: [{ name: 'Flex Fare', today: 4613, usual: 4800, todayLabel: '4,613', usualLabel: '~4.8k' }, { name: 'Everything else', today: 20, usual: 110_000, todayLabel: '20', usualLabel: '~110k', sev: 'alert' }], aria: 'Trips by kind: Flex Fare 4,613 of about 4,800; everything else 20 of about 110,000' }), true],
  ['hours', hourBars({ got: hours, usual, cut: 13, cutLabel: '13:00', floorLabel: '~300/h after', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 95% at 13:00' }), true],
  ['hours parts', hourBars({ got: hours, usual, cut: 13, to: 23, cutLabel: '13:00', missingLabel: '~52k fewer', ghostLabel: 'usual Thursday', kept: { got: hours.map((n, h) => (h < 13 ? 200 : n)), label: 'Flex Fare', restLabel: 'everything else' }, aria: 'Trips by hour: Flex Fare kept arriving, everything else stopped at 13:00' }), true],
  ['hours zoomed', hourBars({ got: hours, usual, cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~300/h', missingLabel: '~52k fewer', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 94% from 13:00 but don’t stop' }), true],
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
  ['episode days', episodeDays({ days: [{ label: 'Thu 21', trips: 41_939, usual: 119_398, low: 89_028, short: 77_459, marks: ['alert', 'held'] }, { label: 'Fri 22', trips: 4633, usual: 114_913, low: 84_912, short: 110_280, marks: ['alert', 'held'], at: true }], total: '~187k short so far (≥130k)', aria: 'Trips each day, Thu 21 to Fri 22, against a usual day: Thu 41,939, Fri 4,633; about 187,000 short so far' }), true],
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

  it('draws the hours after a fall as a trickle still coming, the trips missing as missing, and zooms the trickle under its own hours', () => {
    const got = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 40));
    const svg = hourBars({ got, usual, cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~40/h', missingLabel: '~55k fewer', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 99% from 13:00' });
    // The short hours' trips are one unbroken dark ribbon, 5 px at least each hour though 40 of 5,000 is under 1 px:
    // never a row of separate dashes on the baseline.
    const ribbon = svg.match(/<path class="ink-strong trickle" d="([^"]+)"/)![1]!;
    const tops = [...ribbon.matchAll(/V([\d.]+)H/g)].map((m) => Number(m[1]));
    const base = Number(ribbon.match(/^M[\d.]+ ([\d.]+)/)![1]);
    expect(tops).toHaveLength(11);
    for (const t of tops) expect(base - t).toBeGreaterThanOrEqual(5 - 1e-9);
    expect(svg.match(/class="ink-strong"/g) ?? []).toHaveLength(0);
    // The trips missing: one wash, and its dashed edge drawn apart, which never runs along the baseline or the trickle.
    expect(svg.match(/class="absent-fill"/g)).toHaveLength(1);
    const edge = svg.match(/<path class="absent-edge" d="([^"]+)"/)![1]!;
    const ys = [...edge.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    for (const y of ys) expect(y).toBeLessThanOrEqual(base - 5 - 3 + 1e-9);
    expect(svg).not.toMatch(/class="absent"/);
    // How many fewer came, in words on the wash ("fewer", never "missing", which read as the file cut off).
    expect(svg).toContain('~55k fewer');
    // The first short hour is marked by the wash's edge and a short mark under its label, never a rule through the plot
    // (which read as the file cut there).
    const cutMark = svg.match(/<line class="cut-bad" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)"\/>/)!;
    expect(Number(cutMark[2]) - Number(cutMark[1])).toBeLessThanOrEqual(6);
    expect(Number(cutMark[2])).toBeLessThan(base - 40);
    // The trickle zoomed under the axis, in its own hours' columns (13:00 to 24:00): its eleven hours again, each a bar
    // on the zoom's own scale from 0 under the hour it counts, with their mean a solid line labelled with the rate, so
    // the hours after the fall each keep a bar and read as trips still coming; no wedge (a panel widened under one read
    // as a range slider), and no bracket over the ribbon.
    expect(svg.match(/class="brace"/g)).toBeNull();
    const zoom = svg.slice(svg.indexOf('<g class="zoom">'));
    expect(zoom).not.toBe(svg);
    expect(zoom).not.toContain('zoom-wedge');
    const cw = 334 / 24;
    const panel = zoom.match(/<rect class="zoom-panel" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/)!.slice(1).map(Number);
    expect(panel[0]).toBeCloseTo(13 * cw + 0.75, 0);
    expect(panel[0]! + panel[2]!).toBeCloseTo(334 - 0.75, 0);
    // Apart from the axis, and its bars 4 px under its top (its scale is the rest), so they never hang from the ribbon.
    expect(panel[1]).toBeGreaterThanOrEqual(base + 5);
    const zh = panel[3]! - 4;
    const zb = Number(zoom.match(/<line class="base" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)"/)![1]) - 0.5;
    expect(zb).toBeCloseTo(panel[1]! + panel[3]!, 5);
    const bars = [...zoom.matchAll(/<path class="ink-strong zoom-bar" d="M([\d.]+) ([\d.]+)V([\d.]+)Q[^H]*H([\d.]+)/g)].map((m) => ({ x0: Number(m[1]), h: Number(m[2]) - Number(m[3]) + 1.5, x1: Number(m[4]) + 1.5 }));
    expect(bars).toHaveLength(11);
    // Each bar inside the column of the hour it counts, as the hours above.
    bars.forEach((b, i) => {
      expect(b.x0).toBeGreaterThanOrEqual((13 + i) * cw);
      expect(b.x1).toBeLessThanOrEqual((14 + i) * cw);
    });
    const level = Number(zoom.match(/<line class="level" [^>]*y1="([\d.]+)"/)![1]);
    // Every hour 40 of a zoom to niceMax(40.8) = 50: each bar, and the mean's line, at 40/50 of the zoom's height.
    for (const b of bars) expect(b.h).toBeCloseTo((40 / 50) * zh, 0);
    expect(zb - level).toBeCloseTo((40 / 50) * zh, 0);
    const label = zoom.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="end" class="lbl-b">still ~40\/h<\/text>/)!;
    expect(Number(label[2]) - 4).toBeCloseTo(level, 0);
    expect(Number(label[1])).toBeLessThan(13 * cw);
    // The axis's hours sit under the panel, one clock for both; the chart grows to hold them.
    for (const t of [0, 6, 12, 18, 24]) expect(svg).toMatch(new RegExp(`y="${zb + 13}" text-anchor="(start|middle|end)" class="tick" aria-hidden="true">${t}</text>`));
    expect(Number(svg.match(/height="([\d.]+)"/)![1])).toBeGreaterThan(zb + 13);
    // A fall too early in the day to put the rate beside the zoom: the rate on a bracket over the ribbon instead.
    const early = hourBars({ got: got.map((n, h) => (h < 3 ? n : 40)), usual, cut: 3, to: 23, cutLabel: '03:00', floorLabel: 'still ~40/h', aria: 'Trips by hour' });
    expect(early).not.toContain('class="zoom"');
    expect(early.match(/class="brace"/g)).toHaveLength(1);
    // A finding's own small chart, with no span and so no wash, keeps the rule through the plot.
    const plain = hourBars({ got, usual, cut: 13, aria: 'Trips by hour' }).match(/<line class="cut-bad" x1="[\d.]+" x2="[\d.]+" y1="[\d.]+" y2="([\d.]+)"\/>/)!;
    expect(Number(plain[1])).toBe(80);
    // Nothing came in the short hours: nothing to zoom, and no rate bracketed over a ribbon that isn't there (the story
    // gives none; a "~0/h" passed anyway is left off too).
    const none = hourBars({ got: got.map((n, h) => (h < 13 ? n : 0)), usual, cut: 13, to: 23, cutLabel: '13:00', floorLabel: '~0/h', aria: 'Trips by hour' });
    expect(none).not.toContain('class="zoom"');
    expect(none).not.toContain('class="brace"');
    expect(none).not.toContain('~0/h');
    // Without a rate, no zoom (the Hours detail's chart); without a span, no missing area: a finding's own small chart
    // draws ghosts only.
    expect(hourBars({ got, usual, cut: 13, to: 23, aria: 'Trips by hour' })).not.toContain('zoom');
    expect(hourBars({ got, usual, cut: 13, aria: 'Trips by hour' })).not.toContain('absent');
    // The hours before the fall, bracketed and said, when given.
    const before = hourBars({ got, usual, cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~40/h', beforeLabel: '~8.3k above usual', aria: 'Trips by hour' });
    expect(before).toContain('~8.3k above usual');
    expect(before.match(/class="brace"/g)).toHaveLength(1);
  });

  it('zooms a real trickle to its own scale: Thu Sep 21, 2023 from 13:00, its mean the rate on its line', () => {
    const thu = [2577, 1196, 677, 419, 431, 731, 2000, 4290, 5131, 4840, 5020, 5359, 5589, 742, 150, 206, 244, 315, 317, 279, 283, 393, 399, 351];
    const svg = hourBars({ got: thu, usual: thu.map((n, h) => (h < 13 ? n : 8000)), cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~330/h', missingLabel: '~77k fewer', ghostLabel: 'usual Thursday', aria: 'Trips by hour' });
    const zoom = svg.slice(svg.indexOf('<g class="zoom">'));
    const zh = Number(zoom.match(/<rect class="zoom-panel" [^>]*height="([\d.]+)"/)![1]) - 4;
    const zb = Number(zoom.match(/<line class="base" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)"/)![1]) - 0.5;
    const level = Number(zoom.match(/<line class="level" [^>]*y1="([\d.]+)"/)![1]);
    // 3,679 trips in eleven hours: a mean of 334 an hour, on a zoom to 800 (the 13:00 hour's 742 its tallest bar).
    expect(zb - level).toBeCloseTo((3679 / 11 / 800) * zh, 0);
    const bars = [...zoom.matchAll(/<path class="ink-strong zoom-bar" d="M[\d.]+ ([\d.]+)V([\d.]+)/g)].map((m) => Number(m[1]) - Number(m[2]) + 1.5);
    expect(bars.map((b) => Math.round((b / zh) * 800))).toEqual(thu.slice(13).map((n) => expect.closeTo(n, -1.5)));
    // The tallest, the 13:00 hour's, stays under the panel's top.
    expect(Math.max(...bars)).toBeLessThanOrEqual(zh);
    // At the chart's own scale the same hours are the ribbon, 5 px each: under 3 px of a usual ~9k.
    expect(svg).toContain('class="ink-strong trickle"');
  });

  it('stacks an hour fall’s two parts when one kept arriving: its band unbroken from 0h to 24h, the rest stopping at the fall (Thu Sep 21, 2023)', () => {
    const thu = [2577, 1196, 677, 419, 431, 731, 2000, 4290, 5131, 4840, 5020, 5359, 5589, 742, 150, 206, 244, 315, 317, 279, 283, 393, 399, 351];
    const flex = [96, 36, 25, 16, 44, 72, 155, 333, 351, 203, 121, 81, 115, 109, 150, 206, 242, 313, 313, 272, 275, 390, 392, 347];
    const usualThu = [2260, 1227, 685, 419, 394, 699, 1917, 3537, 5363, 5628, 5804, 5950, 6666, 6867, 7212, 8150, 8438, 8099, 8750, 7969, 6810, 6863, 6140, 5149];
    const svg = hourBars({ got: thu, usual: usualThu, cut: 13, to: 23, cutLabel: '13:00', floorLabel: 'still ~330/h', missingLabel: '~77k fewer', ghostLabel: 'usual Thursday', kept: { got: flex, label: 'Flex Fare', restLabel: 'everything else' }, aria: 'Trips by hour' });
    const base = Number(svg.match(/<line class="base" x1="0" x2="334" y1="([\d.]+)"/)![1]) - 0.5;
    const top = 16;
    const plot = base - top;
    const ymax = Math.max(...usualThu, ...thu) * 1.04;
    const cw = 334 / 24;
    // The band: one path along the baseline from 0 to the chart's end, each hour's top its Flex Fare trips, 5 px at least.
    const band = svg.match(/<path class="kept" d="M0.5 ([\d.]+)((?:V[\d.]+H[\d.]+)+)V[\d.]+Z"\/>/)!;
    const steps = [...band[2]!.matchAll(/V([\d.]+)H([\d.]+)/g)].map((m) => ({ h: base - Number(m[1]), x: Number(m[2]) }));
    expect(steps).toHaveLength(24);
    expect(steps.at(-1)!.x).toBeCloseTo(333.5, 1);
    steps.forEach((st, i) => expect(st.h).toBeCloseTo(Math.max(5, (flex[i]! / ymax) * plot), 0));
    // Everything else: its own column on the band each hour before the fall and in the fall's own hour (633 trips, from
    // 13:00 to 13:06), at its true height and 3 px at least; after it, its stragglers (2 to 8 an hour, under a twentieth
    // of each hour) draw nothing.
    const rest = [...svg.matchAll(/<rect class="ink rest" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" rx="1.2" data-k="(\d+)"\/>/g)].map((m) => ({ k: Number(m[2]), h: Number(m[1]) }));
    expect(rest.map((r) => r.k)).toEqual(Array.from({ length: 14 }, (_, i) => i));
    rest.forEach((r) => expect(r.h).toBeCloseTo(Math.max(3, ((thu[r.k]! - flex[r.k]!) / ymax) * plot), 0));
    // One usual: the ghost columns before the fall and the wash's skyline after it are the same usual hours.
    const ghosts = [...svg.matchAll(/<path class="ghost" d="M[\d.]+ ([\d.]+)V([\d.]+)Q/g)].map((m) => Number(m[1]) - Number(m[2]));
    expect(ghosts).toHaveLength(13);
    ghosts.forEach((g, i) => expect(g).toBeCloseTo(Math.max(0, (usualThu[i]! / ymax) * plot - 2), 0));
    const sky = svg.match(/<path class="absent-fill" d="M([\d.]+) ([\d.]+)H/)!;
    expect(Number(sky[1])).toBeCloseTo(13 * cw + 0.75, 1);
    expect(base - Number(sky[2])).toBeCloseTo((usualThu[13]! / ymax) * plot, 0);
    expect(svg).toContain('class="absent-edge"');
    // The fall's mark is short and above the plot; no zoom, no trickle ribbon, no rate; the key names the two parts.
    const cut = svg.match(/<line class="cut-bad" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)"\/>/)!.slice(1).map(Number);
    expect(cut[1]! - cut[0]!).toBeLessThanOrEqual(6);
    expect(svg).not.toMatch(/zoom|trickle|still ~/);
    expect(svg).toMatch(/<rect class="kept" [^>]*\/><text [^>]*>Flex Fare<\/text>/);
    expect(svg).toMatch(/<rect class="ink" [^>]*\/><text [^>]*>everything else<\/text>/);
    expect(svg).toContain('~77k fewer');
    // Sat Sep 17, 2022: the hours before the fall bracketed above the plot, clear of the cut.
    const sat = hourBars({ got: thu, usual: usualThu, cut: 15, to: 23, cutLabel: '15:00', beforeLabel: '~8.3k above usual', kept: { got: flex, label: 'Flex Fare', restLabel: 'everything else' }, aria: 'Trips by hour' });
    const brace = sat.match(/<path class="brace" d="M1.5 ([\d.]+)V([\d.]+)H([\d.]+)V/)!.slice(1).map(Number);
    expect(Math.max(brace[0]!, brace[1]!)).toBeLessThanOrEqual(top + 1.5);
    expect(brace[2]).toBeLessThan(15 * cw);
    expect(sat).toContain('~8.3k above usual');
    // An hour with no rows of the part breaks the band there: nothing is drawn for a zero.
    const gap = hourBars({ got: thu, usual: usualThu, cut: 13, to: 23, kept: { got: flex.map((n, i) => (i === 3 ? 0 : n)), label: 'Flex Fare', restLabel: 'everything else' }, aria: 'Trips by hour' });
    const gapSteps = [...gap.match(/<path class="kept" d="M0.5 [\d.]+((?:V[\d.]+H[\d.]+)+)/)![1]!.matchAll(/V([\d.]+)H/g)].map((m) => base - Number(m[1]));
    expect(gapSteps[3]).toBe(0);
    expect(gapSteps[2]).toBeGreaterThanOrEqual(5);
  });

  it('puts the day’s change on the amount line when it is given', () => {
    const svg = amountLine({ value: 41939, low: 89028, high: 160128, valueLabel: '41,939', unit: 'trips', bandLabel: 'usual 89k–160k', changeLabel: '−65%', sev: 'alert', aria: '41,939 trips, −65%' });
    expect(svg).toContain('class="count-chg chg-alert" dx="8">−65%</tspan>');
    expect(amountLine({ value: 1, low: 0, high: 2, valueLabel: '1', unit: 'trips', bandLabel: 'usual 0–2', aria: 'one trip' })).not.toContain('count-chg');
    // Beside a head about part of the day, the change says its window in small type before it.
    expect(amountLine({ value: 41939, low: 89028, high: 160128, valueLabel: '41,939', unit: 'trips', bandLabel: 'usual 89k–160k', changeLabel: '−65%', changeWindow: 'whole day', sev: 'alert', aria: '41,939 trips, whole day −65%' })).toContain('<tspan class="count-unit" dx="8">whole day</tspan><tspan class="count-chg chg-alert" dx="4">−65%</tspan>');
  });

  it('draws trips beyond the usual count filled past a notch, said under them, and a sliver of them without a notch', () => {
    const svg = partBar({ left: { name: 'Flex Fare', today: 10518, usual: 4508, label: '10,518 · usual ~4.5k', sev: 'warn', overLabel: '+6k over usual' }, right: { name: 'Everything else', today: 69_500, usual: 68_486, label: '69,500 · usual ~68.5k' }, aria: 'Flex Fare 10,518 against about 4,508' });
    const overs = [...svg.matchAll(/<rect class="over" x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]));
    // Both parts' extra trips are drawn, filled (the class has a fill, never a hollow box); the rest's 1,014 are a
    // sliver of about 4 px, which takes no notch, so the slivers never tangle into a shape like ‖.
    expect(overs).toHaveLength(2);
    expect(svg.match(/class="usual-end"/g)).toHaveLength(1);
    expect(svg).toContain('+6k over usual');
    // Each usual notch stays clear of the count labels over the bar, their descenders (a comma, ~3 px) included.
    const labels = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="(?:start|end)" class="lbl-m">/g)].map((m) => Number(m[1]));
    const notches = [...svg.matchAll(/class="usual-end" x1="[\d.]+" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    expect(labels).toHaveLength(2);
    for (const [y1] of notches) for (const y of labels) expect(y1, `notch from ${y1}, label on ${y}`).toBeGreaterThanOrEqual(y + 4);
    // The parts sit 6 px apart, so a 3 px sliver of one never reads as a second wall beside the other.
    const slots = [...svg.matchAll(/<rect class="slot" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(slots[1]![0]! - (slots[0]![0]! + slots[0]![1]!)).toBeGreaterThanOrEqual(6 - 0.11);
  });

  it('draws a waterfall step within its usual range neutral, never as trips missing', () => {
    const svg = waterfall({ steps: [{ name: 'Usual', label: '114,913', value: 114_913, total: true, kind: 'total' }, { name: 'Everything else', label: '−110,137', value: -110_137, kind: 'down', sev: 'alert' }, { name: 'Flex Fare', label: '−143', value: -143, kind: 'down', usual: true }, { name: 'Today', label: '4,633', value: 4_633, total: true, kind: 'total' }], aria: 'From a usual day to this one' });
    expect(svg.match(/class="absent"/g)).toHaveLength(1);
    expect(svg).toContain('class="wf-usual"');
    expect(svg).toMatch(/class="lbl-m">−143</);
    expect(svg).toMatch(/class="lbl-bad">−110,137</);
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
    // The trips missing from the fall to the bracket's end are the card's wash with its dashed skyline, never a grey
    // usual: the usual's ghost only before the fall (13 hours of Thu).
    expect(svg.match(/class="ghost flat"/g)).toHaveLength(13);
    expect(svg).toMatch(/<path class="absent-fill" d="M[\d.]+ /);
    expect(svg).toMatch(/<path class="absent-edge" d="M[\d.]+ /);
    expect(episodeBars({ days: [day], aria: 'Trips by hour, Thu' })).not.toMatch(/absent/);
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
    // Each band 9 px at least, so a narrow range shows above and below its tick; the tick 2 px on a band that narrow.
    for (const [, hgt] of bands) expect(hgt).toBeGreaterThanOrEqual(9 - 1e-9);
    // The second day's tick sits above its band: the band's top stays at its true high, under the tick.
    const ticks = [...svg.matchAll(/<rect class="(?:ink|sev-warn-fill)" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="2"/g)].map((m) => Number(m[1]));
    expect(ticks).toHaveLength(2);
    expect(ticks[1]! + 2).toBeLessThanOrEqual(bands[1]![0]! + 1e-9);
    // The band's edge is drawn again after the tick, so a value on the edge never hides which side of it it is.
    expect(svg.indexOf('class="band-line"')).toBeGreaterThan(svg.indexOf('class="ink"'));
  });

  it('colours a day’s tick by where it sits: plain inside its own band, its severity only outside', () => {
    const inside = dayStrip({ days: [{ day: '2023-09-22', v: 4613, low: 2600, high: 5500, sev: 'alert' }], aria: 'Flex Fare by day' });
    expect(inside).not.toContain('sev-alert-fill');
    expect(dayStrip({ days: [{ day: '2024-01-01', v: 10_518, low: 2280, high: 8610, sev: 'warn' }], aria: 'Flex Fare by day' })).toContain('sev-warn-fill');
  });

  it('draws a day this visit didn’t run as absent: its band, no tick, no mark, a dashed frame, and keys it', () => {
    // Mon Sep 25, 2023, after a visit that ran Thu–Sat and skipped Sun 24: Sun is not run, never “published with
    // something wrong”.
    const days = [
      { day: '2023-09-23', v: 4_100, low: 80_000, high: 140_000, sev: 'alert' as const, mark: 'held' as const },
      { day: '2023-09-24', v: 3_900, low: 70_000, high: 130_000, sev: 'alert' as const, mark: 'alert' as const, notRun: true },
      { day: '2023-09-25', v: 91_341, low: 71_515, high: 130_105 },
    ];
    const svg = dayStrip({ days, key: ['usual', 'actual'], zero: true, aria: 'Trips by day' });
    expect(svg.match(/class="notrun"/g)).toHaveLength(2);
    expect(svg).toContain('>not run</text>');
    expect(svg).not.toContain('g-alert');
    expect(svg).toContain('g-held');
    // Two ticks only, Sat's and Mon's, and the key's tick swatch.
    expect(svg.match(/class="(ink|sev-alert-fill)" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="3"/g)).toHaveLength(3);
    // Without a day not run, no such key.
    expect(dayStrip({ days: [days[0]!, days[2]!], key: ['usual', 'actual'], aria: 'Trips by day' })).not.toContain('not run');
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
    const svg = amountLine({ value: 97_117, low: 94_000, high: 156_000, valueLabel: '97,117', unit: 'trips', bandLabel: 'usual 94k–156k', aria: 'Trips' });
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

  it('puts a finding’s day by day on a scale from 0 with its top printed in the metric’s own terms (round 3, #23)', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ day: `2024-01-${String(i + 1).padStart(2, '0')}`, v: 0.08, low: 0.07, high: 0.11 }));
    days.push({ day: '2024-01-15', v: 0.087, low: 0.21, high: 0.33 });
    const svg = dayStrip({ days, zero: true, axis: (v) => `${Math.round(v * 100)}%`, aria: 'Extras $5.00 day by day' });
    // Its 0 and its top: niceMax of the largest band end or value, 0.33 → 0.4, printed as the metric says it.
    expect(svg).toContain('<text x="0" y="');
    expect(svg).toMatch(/class="tick" aria-hidden="true">0<\/text>/);
    expect(svg).toMatch(/class="tick" aria-hidden="true">40%<\/text>/);
    const base = Number(svg.match(/<line class="base" x1="12" x2="334" y1="([\d.]+)"/)![1]) - 0.5;
    const topLine = Number(svg.match(/<line class="hair" x1="12" x2="334" y1="([\d.]+)"/)![1]) - 0.5;
    // Today's tick at 8.7% sits where its number says, far under its band.
    const ticks = [...svg.matchAll(/<rect class="(?:ink|sev-[a-z]+-fill)" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2]) / 2);
    expect((base - ticks.at(-1)!) / (base - topLine)).toBeCloseTo(0.087 / 0.4, 1);
    // Without an axis, as before: no printed top.
    expect(dayStrip({ days, aria: 'x' })).not.toMatch(/40%/);
  });

  it('draws a part that kept arriving in the band’s teal, so a rest that stopped never looks like a part that vanished', () => {
    // Fri Sep 22, 2023: Flex Fare kept arriving, everything else stopped; Mon Nov 14, 2022: Vendor 1 vanished.
    const held = partBar({ left: { name: 'Flex Fare', today: 4613, usual: 4800, label: '4,613 · usual ~4.8k', kept: true }, right: { name: 'Everything else', today: 20, usual: 110_000, label: '20 · usual ~110k', sev: 'alert' }, aria: 'Split' });
    const gone = partBar({ left: { name: 'Vendor 1', today: 2, usual: 33_800, label: '2 · usual ~33.8k', sev: 'alert' }, right: { name: 'Everything else', today: 82_276, usual: 82_500, label: '82,276 · usual ~82.5k' }, aria: 'Split' });
    expect(held).toMatch(/<rect class="kept" x="0" /);
    expect(held.match(/class="absent"/g)).toHaveLength(1);
    expect(gone).not.toContain('class="kept"');
    expect(gone).toMatch(/<rect class="ink-strong" x="[1-9][\d.]+" /);
    // Above its usual (Sun Sep 18, 2022's 4,169 Flex Fare against ~2.9k), past the notch in the band's lighter tone.
    const over = partBar({ left: { name: 'Flex Fare', today: 4169, usual: 2900, label: '4,169 · usual ~2.9k', kept: true }, right: { name: 'Everything else', today: 60, usual: 85_000, label: '60 · usual ~85k', sev: 'alert' }, aria: 'Split' });
    expect(over).toContain('class="kept-over"');
    expect(over).not.toContain('class="over"');
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
    // Its 0 at the baseline, in the gutter; with the strip's dates, the same dates under the same columns.
    expect(bars).toMatch(/<text x="0" y="[\d.]+" class="tick" aria-hidden="true">0<\/text>/);
    const dated = contextBars({ values, note: '', label: (v) => `${v.toFixed(1)} cm`, kind: 'snow', gx: 12, aria: 'Snow', labels: [[0, 'Nov 13', 'start'], [55, 'Jan 7', 'end']] });
    const stripDated = dayStrip({ days, unit: '/day', aria: 'Trips', labels: [[0, 'Nov 13', 'start'], [55, 'Jan 7', 'end']] });
    const at = (svg: string, t: string) => new RegExp(`<text x="([\\d.]+)" y="[\\d.]+" text-anchor="\\w+" class="tick" aria-hidden="true">${t}<`).exec(svg)?.[1];
    expect(at(dated, 'Jan 7')).toBe(at(stripDated, 'Jan 7'));
    expect(at(dated, 'Nov 13')).toBe(at(stripDated, 'Nov 13'));
  });

  it('keys a strip’s darker weekday, a day with no usual and its marks, only what it draws', () => {
    const days = Array.from({ length: 14 }, (_, i) => ({ day: `2024-01-${String(i + 1).padStart(2, '0')}`, v: 90_000, low: i === 2 ? null : 80_000, high: i === 2 ? null : 120_000, ...(i === 5 ? { marks: ['alert', 'held'] as ('alert' | 'held')[] } : {}) }));
    const svg = dayStrip({ days, key: ['usual', 'actual'], aria: 'Trips', more: { same: 'Sundays', marks: { alert: 'wrong', held: 'paused', flag: 'as is' } } });
    expect(svg).toContain('>Sundays<');
    expect(svg).toContain('>no usual<');
    expect(svg).toContain('>wrong<');
    expect(svg).toContain('>paused<');
    // A mark the strip doesn't draw has no key.
    expect(svg).not.toContain('>as is<');
    // Without `more`, one row as before.
    expect(dayStrip({ days, key: ['usual', 'actual'], aria: 'Trips' })).not.toContain('>Sundays<');
  });

  it('draws a day’s weather by the hour as the trips’ hours are drawn: rain from 0, the temperature a line, never “−0”', () => {
    const temp = Array.from({ length: 24 }, (_, h) => -0.4 + (h > 12 ? 3 : 0));
    const precip = Array.from({ length: 24 }, (_, h) => (h === 5 ? 1.2 : h === 6 ? 0.3 : 0));
    const snow = Array.from({ length: 24 }, (_, h) => (h === 5 ? 0.8 : 0));
    const svg = weatherHours({ temp, precip, snow, aria: 'Weather by the hour' });
    // A column for each hour with rain or snow, snow in its own colour, from the 0 baseline.
    expect([...svg.matchAll(/class="wx-bar (snow|rain)"/g)].map((m) => m[1])).toEqual(['snow', 'rain']);
    expect(svg).toMatch(/>0<\/text>/);
    // The temperature a line through each hour with its lowest and highest said in whole degrees: 0 °C, not "−0 °C".
    expect(svg).toContain('class="line temp"');
    expect(svg).toContain('>3 °C<');
    expect(svg).toContain('>0 °C<');
    expect(svg).not.toMatch(/[−-]0 °C/);
    expect([degrees(-0.4), degrees(-0.6), degrees(2.5)]).toEqual(['0 °C', '−1 °C', '3 °C']);
    // The hour axis as the trips': 0, 6, 12, 18, 24.
    expect([...svg.matchAll(/class="tick" aria-hidden="true">(\d+)<\/text>/g)].map((m) => m[1]).slice(-5)).toEqual(['0', '6', '12', '18', '24']);
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

  it('draws an episode’s days as a calendar page, never as bars that read as a battery or as ‖', () => {
    const svg = episodeIcon({ n: 3, at: 2 });
    expect(svg).toContain('aria-hidden="true"');
    expect([...svg.matchAll(/class="cal-(day|at)"/g)].map((m) => m[1])).toEqual(['day', 'day', 'at']);
    expect(svg).toContain('class="cal-band"');
    // Seven cells at most, the viewed day among the last shown; on the day after an episode, none dark.
    expect([...episodeIcon({ n: 9, at: 8 }).matchAll(/class="cal-(day|at)"/g)].map((m) => m[1])).toEqual(['day', 'day', 'day', 'day', 'day', 'day', 'at']);
    expect(episodeIcon({ n: 4, at: null })).not.toContain('cal-at');
  });

  it('draws an episode chip’s days as blocks as wide as each was short, so day 3 reads apart from day 2 (round 3, #23)', () => {
    const thu = { short: 77_459, usual: 119_398 };
    const fri = { short: 110_280, usual: 114_913 };
    const sat = { short: 103_000, usual: 113_000 };
    const blocks = (svg: string) => [...svg.matchAll(/<rect class="([a-z-]+)" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((m) => ({ cls: m[1], x: Number(m[2]), w: Number(m[3]) }));
    const day2 = blocks(episodeChip({ days: [thu, { ...fri, at: true }] }));
    const day3 = blocks(episodeChip({ days: [thu, fri, { ...sat, at: true }] }));
    // A block a day, each as wide as it was short in usual days (16 px a whole day), the viewed day filled.
    expect(day2.map((b) => b.cls)).toEqual(['absent', 'ep-at']);
    expect(day3.map((b) => b.cls)).toEqual(['absent', 'absent', 'ep-at']);
    expect(day2[0]!.w).toBeCloseTo((77_459 / 119_398) * 16, 1);
    expect(day3[2]!.w).toBeCloseTo((103_000 / 113_000) * 16, 1);
    // The row grows by the day's block: its running total.
    const end = (bs: typeof day2) => bs.at(-1)!.x + bs.at(-1)!.w;
    expect(end(day3) - end(day2)).toBeCloseTo(1.5 + day3[2]!.w, 1);
    // A day this visit didn't run: the strip's not-run frame, its width the history's; 3 px at least for a small day.
    const notRun = blocks(episodeChip({ days: [{ ...thu, notRun: true }, { short: 10, usual: 100_000, at: true }] }));
    expect(notRun.map((b) => b.cls)).toEqual(['notrun', 'ep-at']);
    expect(notRun[1]!.w).toBe(3);
    expect(episodeChip({ days: [thu] })).toContain('aria-hidden="true"');
  });

  it('draws an episode’s days so far: one bar a day from 0 over its usual day, each day’s marks, the shortfall a segment a day', () => {
    const days = [
      { label: 'Thu 21', trips: 41_939, usual: 119_398, low: 89_028, short: 77_459, marks: ['alert', 'held'] as const },
      { label: 'Fri 22', trips: 4633, usual: 114_913, low: 84_912, short: 110_280, marks: ['alert', 'flag'] as const },
      { label: 'Sat 23', trips: 5732, usual: 113_000, low: 81_000, short: 103_000, marks: [] as const, notRun: true, at: true },
    ];
    const svg = episodeDays({ days, total: '~291k short so far (≥210k)', aria: 'Trips each day' });
    // Each run day's count over its bar; a day not run has its usual day in a dashed frame and no count.
    expect(svg).toContain('>42k</text>');
    expect(svg).toContain('>4.6k</text>');
    expect(svg).not.toContain('>5.7k</text>');
    // Its frame, and its segment of the shortfall drawn as the strip draws a day not run (its trips the history's).
    expect([...svg.matchAll(/class="notrun"/g)].length).toBe(2);
    expect([...svg.matchAll(/class="ghost"/g)].length).toBe(3);
    // Below its range, a day's bar takes the severity's fill.
    expect([...svg.matchAll(/class="sev-alert-fill"/g)].length).toBe(2);
    // Its marks: ! ‖ and ! ⚑ under their dates; the shortfall, three segments on one bar, its total said.
    expect([...svg.matchAll(/class="g g-(alert|held|flag)"/g)].map((m) => m[1])).toEqual(['alert', 'held', 'alert', 'flag']);
    expect([...svg.matchAll(/class="absent"/g)].length).toBe(2);
    expect(svg).toContain('>~291k short so far (≥210k)</text>');
    expect(svg).toContain('class="today-ring"');
    // Each count sits at its own bar's top, inside the ghost, never on the ghost's top: Thu's 42k is well under its
    // ~119k usual. The shortfall bar is a share of the whole, with no lone 0 under it.
    const keyed = episodeDays({ days, total: '~291k short so far (≥210k)', aria: 'Trips each day', key: ['usual', 'actual'] });
    const bar = (cls: string, i: number) => [...keyed.matchAll(new RegExp(`<rect class="${cls}" x="[\\d.]+" y="([\\d.]+)" width="[\\d.]+" height="([\\d.]+)"`, 'g'))][i]!;
    const thuInk = bar('sev-alert-fill', 0);
    const thuGhost = bar('ghost', 1);
    const thuLabel = Number(keyed.match(/<text x="[\d.]+" y="([\d.]+)" text-anchor="middle" class="lbl-m lbl-halo">42k<\/text>/)![1]);
    expect(thuLabel).toBeCloseTo(Number(thuInk[1]) - 4, 0);
    expect(thuLabel).toBeGreaterThan(Number(thuGhost[1]) + 10);
    // The key: usual, actual, and not run (Sat 23 wasn't).
    for (const word of ['usual', 'actual', 'not run']) expect(keyed).toContain(`class="lbl-m key">${word}</text>`);
    expect(keyed).not.toMatch(/class="tick">0<\/text>/);
    expect([...keyed.matchAll(/class="tick" aria-hidden="true">0<\/text>/g)]).toHaveLength(1);
  });

  it('draws a held day’s severity and what became of it side by side in a strip of days', () => {
    const svg = dayStrip({ days: [{ day: '2023-09-21', v: 41_939, low: 89_028, high: 160_128, sev: 'alert', marks: ['alert', 'held'] }, { day: '2023-09-25', v: 91_341, low: 72_000, high: 130_000 }], aria: 'Trips' });
    const at = [...svg.matchAll(/<g transform="translate\(([\d.]+) [\d.]+\)"><svg [^>]*class="g g-(\w+)"/g)].map((m) => [Number(m[1]), m[2]] as const);
    expect(at.map((x) => x[1])).toEqual(['alert', 'held']);
    // Side by side, 16 apart, centred on the day's column.
    expect(at[1]![0] - at[0]![0]).toBe(16);
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

  it('hatches another day’s rows only, dashes only the hours the day’s own rows lack, and draws the trickle as one ribbon', () => {
    expect(asis).not.toContain('hatch-col');
    expect(dont).not.toMatch(/class="ink-strong"/);
    // One absent area over the short hours, on the day's own rows; none on another day's. Its dashed edge never runs
    // along the baseline or the trickle.
    expect(asis.match(/class="absent-fill"/g)).toHaveLength(1);
    expect(dont).not.toContain('absent');
    const d = /<path class="absent-edge" d="M([\d.]+) ([\d.]+)/.exec(asis)!;
    expect(Number(d[1])).toBeCloseTo((13 * 300) / 24 + 0.75, 0);
    const base = Number(/<path class="ink-strong" d="M[\d.]+ ([\d.]+)V/.exec(asis)![1]);
    expect(Number(d[2])).toBeLessThanOrEqual(base - 5 - 3 + 1e-9);
    // Without a short span, nothing is absent.
    expect(decisionRow({ mark: 'flag', label: 'Publish as is', number: '1', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, scale, aria: 'Publish as is: 1 trip' })).not.toContain('absent');
    // 30 trips of 5,200 is under 1 px, drawn at 5, each short hour abutting the next.
    const short = [...asis.matchAll(/<path class="ink-strong" d="M([\d.]+) [\d.]+V[\d.]+Q[^"]*H([\d.]+)Q[^"]*" data-k="(\d+)"/g)].filter((m) => Number(m[3]) >= 13);
    expect(short).toHaveLength(11);
    for (const [hr, ht] of heights(asis, 'ink-strong')) if (hr >= 13) expect(ht).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('marks each option as what it does, labels what the short hours lack in their wash, and marks the hour they fell on the day’s own row', () => {
    const row = decisionRow({ mark: 'publish', label: 'Publish as is', number: '41,939 trips', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, short: [13, 23], scale, missing: '~77k missing', cut: [13, '13h'], aria: 'Publish as is: 41,939 trips' });
    const keep = decisionRow({ mark: 'keep', label: 'Keep Wed 20', number: '108,434 trips', cause: 'hours', rows: { cause: 'hours', hours: wed }, other: true, scale, cut: [13, '13h'], missing: '~77k missing', aria: 'Don’t publish: readers keep Wed Sep 20' });
    // Publish, an arrow out of a tray; Keep, the hatched swatch another day's rows are drawn in.
    expect(row).toContain('g-publish');
    expect(keep).toContain('g-keep');
    expect(glyph('keep')).toContain('class="g-keep"');
    // The wash says what it is, over the short hours' middle; another day's rows have no wash to label.
    const miss = /<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle" class="lbl-bad lbl-halo miss-l">~77k missing<\/text>/.exec(row)!;
    expect(Number(miss[1])).toBeCloseTo(((13 + 24) / 2) * (300 / 24), 0);
    expect(keep).not.toContain('missing');
    // The cut: a solid tick at 13h (never dashed) and the hour under it, on this row; the rows kept draw no cut.
    expect(row).toMatch(/<line class="cut-t" x1="162.5" x2="162.5"/);
    expect(row).toMatch(/class="tick at" data-cut="13">13h<\/text>/);
    expect(row).not.toMatch(/cut-t[^>]*dash/);
    expect(decisionRow({ mark: 'keep', label: 'Keep Wed 20', number: '1', cause: 'hours', rows: { cause: 'hours', hours: wed }, other: true, scale, aria: 'x' })).not.toContain('cut-t');
  });

  it('draws a day kept that went out short as is with what it lacked dashed on its hatched rows, and a lock where Publish can’t go (round 3, #3, #19)', () => {
    // Another day's rows draw no wash unless that day went out short (`lacks`): then its own, as its own day drew it.
    const whole = decisionRow({ mark: 'keep', label: 'Keep Thu 21 ⚑', number: '37,935', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, short: [13, 23], other: true, scale, aria: 'x' });
    expect(whole).not.toContain('absent-fill');
    const short = decisionRow({ mark: 'keep', label: 'Keep Thu 21 ⚑', number: '37,935', cause: 'hours', rows: { cause: 'hours', hours: thu }, usual: { cause: 'hours', hours: usualThu }, short: [13, 23], other: true, lacks: true, scale, aria: 'x' });
    expect(short).toContain('absent-fill');
    expect(short).toContain('absent-edge');
    expect(short).toContain('hatch-col');
    // A split kept short: its bar runs on dashed to its usual.
    const bar = decisionRow({ mark: 'keep', label: 'Keep Thu 21 ⚑', number: '37,935', cause: 'split', rows: { cause: 'split', part: 4_600, rest: 37_000 }, usual: { cause: 'split', part: 4_600, rest: 110_000 }, other: true, lacks: true, scale: 120_000, aria: 'x' });
    expect(bar).toContain('class="absent"');
    expect(glyph('lock')).toContain('g-lockbody');
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

describe('a day not judged yet (ADR 0010 §12)', () => {
  it('is a dashed ring at the marks’ 14 px, never a severity’s colour', () => {
    const svg = notJudgedMark();
    expect(svg).toContain('class="g g-unlearned"');
    expect(svg).toContain('width="14" height="14"');
    expect(svg).toContain('<circle class="g-unlearned"');
    expect(svg).not.toMatch(/sev-|g-fill|g-tri/);
    expect(glyph('unlearned')).toContain('width="16"');
  });

  it('draws in a strip of days as its count with no band, under ◌, the inverse of a day not run, and keys it', () => {
    const svg = dayStrip({ days: [{ day: '2021-11-23', v: 100, low: 90, high: 110 }, { day: '2021-11-24', v: 95, low: 85, high: 115, notRun: true }, { day: '2021-11-25', v: 70, low: null, high: null, unlearned: true }], key: ['usual', 'actual'], more: {}, aria: 'x' });
    expect(svg).toContain('>not judged</text>');
    expect(svg).not.toContain('>no usual</text>');
    // Two bands (the day judged and the day not run), two ticks (the day not run has none), one ring.
    expect(svg.match(/<rect class="ghost(-2)?"/g)!.length).toBe(2 + 1); // and the key's swatch
    expect(svg.match(/<rect class="ink"/g)!.length).toBe(2 + 1); // and the key's swatch
    expect(svg.match(/g-unlearned"/g)!.length).toBe(2 + 2); // the day's ring and the key's, each an svg and a circle
    // A day with no band that isn't marked so keeps its own key, "no usual".
    expect(dayStrip({ days: [{ day: '2021-11-25', v: 70, low: null, high: null }], key: ['usual', 'actual'], more: {}, aria: 'x' })).toContain('>no usual</text>');
  });

  it('says the source’s noun beside the day’s count', () => {
    expect(amountLine({ value: 981, low: 900, high: 1200, valueLabel: '981', unit: 'sign-ins', bandLabel: 'usual 900–1.2k', aria: '981 sign-ins' })).toContain('<tspan class="count-unit" dx="6">sign-ins</tspan>');
  });
});

describe('a filled day, drawn (ADR 0009 amendment 1 S12)', () => {
  // Thu Sep 21, 2023: the hours before 13:00 arrived; Thu 14's hours from 13:00 fill the rest.
  const thu = Array.from({ length: 24 }, (_, h) => (h < 13 ? 4000 + h * 100 : 30));
  const donor = Array.from({ length: 24 }, (_, h) => 3800 + h * 90);
  const usualThu = Array.from({ length: 24 }, () => 5200);
  const filled = thu.map((v, h) => (h >= 13 ? donor[h]! : v));
  const part = thu.map((v, h) => (h >= 13 ? 0 : v));
  const scale = Math.max(...usualThu, ...filled);
  const fill = decisionRow({ mark: 'fill', label: 'Fill from Thu 14', number: '121,931 trips', cause: 'hours', rows: { cause: 'hours', hours: filled }, filled: [13, 23], cut: [13, '13h'], scale, aria: 'Fill from Thu 14: readers get 121,931 trips, 83,671 of them from Thu Sep 14' });
  const only = decisionRow({ mark: 'part', label: 'Before 13:00 only', number: '38,260 trips', cause: 'hours', rows: { cause: 'hours', hours: part }, usual: { cause: 'hours', hours: usualThu }, short: [13, 23], cut: [13, '13h'], scale, aria: 'Before 13:00 only: readers get 38,260 trips, 3,679 set aside' });

  it('stipples the donor’s hours under a solid top edge, the day’s own hours solid, and says so to a screen reader', () => {
    expect(fill).toContain('aria-label="Fill from Thu 14: readers get 121,931 trips, 83,671 of them from Thu Sep 14"');
    expect(fill).toContain('data-filled="true"');
    expect(fill.match(/class="stipple-col"[^>]*data-filled="1"/g)).toHaveLength(11);
    expect(fill.match(/class="stipple-top"/g)).toHaveLength(11);
    expect(fill.match(/class="ink-strong"[^>]*data-k="(\d+)"/g)).toHaveLength(13);
    // The donor's rows are present, not absent, and not another day shown instead: no dashes, no hatch.
    expect(fill).not.toMatch(/absent|hatch/);
    expect(fill).toContain('g-fill');
    expect(fill).toMatch(/class="tick at" data-cut="13">13h<\/text>/);
  });

  it('draws the part that arrived alone with the hours it leaves out absent at their usual, dashed, and nothing stippled', () => {
    expect(only).not.toContain('stipple');
    expect(only.match(/class="absent-fill"/g)).toHaveLength(1);
    expect(only.match(/class="absent-edge"/g)).toHaveLength(1);
    expect(only.match(/class="ink-strong"[^>]*data-k/g)).toHaveLength(13);
    expect(only).not.toContain('miss-l');
    expect(only).toContain('g-part');
  });

  it('stipples a split’s donated part, or its donated rest, on one count bar; another day’s rows are never stippled', () => {
    const sc = 33_842 + 82_544;
    const vendor = decisionRow({ mark: 'fill', label: 'Fill from Mon 7', number: '114,863 trips', cause: 'split', rows: { cause: 'split', part: 32_587, rest: 82_276 }, filled: 'part', part: 'Vendor 1 · 2', scale: sc, aria: 'Fill from Mon 7' });
    expect(vendor).toMatch(/<rect class="stipple-col" x="0" [^>]*data-part="part" data-filled="1"\/>/);
    expect(vendor).toMatch(/<rect class="ink" [^>]*data-part="rest"\/>/);
    expect(vendor.match(/class="stipple-top"/g)).toHaveLength(1);
    const rest = decisionRow({ mark: 'fill', label: 'Fill from Fri 15', number: '1', cause: 'split', rows: { cause: 'split', part: 4613, rest: 110_000 }, filled: 'rest', part: 'Flex Fare · 4,613', scale: 120_000, aria: 'Fill from Fri 15' });
    expect(rest).toMatch(/<rect class="stipple-col" [^>]*data-part="rest" data-filled="1"\/>/);
    expect(rest).toMatch(/<rect class="ink-strong" x="0" [^>]*data-part="part"\/>/);
    const kept = decisionRow({ mark: 'keep', label: 'Keep Sun 13', number: '1', cause: 'split', rows: { cause: 'split', part: 30_000, rest: 70_000 }, other: true, filled: 'part', scale: sc, aria: 'Keep Sun 13' });
    expect(kept).not.toContain('stipple');
  });

  it('marks ◧ and ◐ at the marks’ 14 px, by shape: half a box, half a disc', () => {
    for (const g of ['fill', 'part'] as const) {
      expect(glyph(g, 14)).toMatch(/^<svg width="14" height="14" viewBox="0 0 16 16" class="g g-/);
      expect(glyph(g)).toContain('class="g-half"');
    }
    expect(glyph('fill')).toContain('<rect class="g-fillbox"');
    expect(glyph('part')).toContain('<circle class="g-fillbox"');
  });

  it('defines the stipple once, beside the hatch, its dots at 3:1 against the card in both themes', () => {
    expect(DEFS).toContain('<pattern id="viz-stipple" width="4" height="4" patternUnits="userSpaceOnUse">');
    expect(DEFS).toContain('class="stipple-dot"');
    expect(DEFS).toContain('<pattern id="viz-hatch"');
    const page = readFileSync(new URL('../src/app/page.html', import.meta.url), 'utf8');
    const dot = /\.stipple-dot \{ fill: var\(--([a-z0-9-]+)\); \}/.exec(page)![1]!;
    expect(/\.stipple-bg \{ fill: var\(--surface\); \}/.test(page)).toBe(true);
    const token = (block: string, name: string) => new RegExp(`--${name}: (#[0-9a-f]{6})`).exec(block)![1]!;
    const light = /:root \{([^}]*)\}/.exec(page)![1]!;
    const dark = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(page)![1]!;
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const block of [light, dark]) expect(contrast(token(block, dot), token(block, 'surface'))).toBeGreaterThanOrEqual(3);
  });
});

describe('a share’s row at a phone’s width (dumbbellRows)', () => {
  it('gives the usual range way first, then cuts the label short, so the two never meet', () => {
    const row = (label: string) => dumbbellRows({ rows: [{ label, today: 0.001, low: 0.004, high: 0.007, todayLabel: '0.1%', usualLabel: 'usually 0.4–0.7%', sev: 'warn' }], aria: 'x' });
    expect(row('Store and forward trip')).toContain('usually 0.4–0.7%');
    const long = row('Stored and forwarded Store and forward trip records today');
    expect(long).not.toContain('usually 0.4–0.7%');
    const label = /<text x="0" y="12" class="lbl-b">([^<]*)</.exec(long)![1]!;
    expect(label.endsWith('…')).toBe(true);
    // Label at about 7 units a letter, figures at 6.6: within the 334 wide row.
    expect(label.length * 7 + '0.1%'.length * 6.6 + 12).toBeLessThanOrEqual(334);
  });
});

describe('the models’ views (ADR 0015 §6)', () => {
  it('draws the forest: a tick a learned day, the cut, today labelled, warned when past the cut', () => {
    const svg = forestTicks({ learned: [0.42, 0.45, 0.5, 0.57], score: 0.61, cut: 0.57, speaks: true, aria: 'The day against the cut' });
    expect(svg.match(/class="ghost-tick"/g)).toHaveLength(4);
    expect(svg).toContain('today 0.61');
    expect(svg).toContain('cut 0.57');
    expect(svg).toContain('class="dot dot-warn"');
    expect(forestTicks({ learned: [0.4], score: 0.45, cut: 0.5, aria: 'x' })).not.toContain('dot-warn');
  });

  it('draws the classifier: its AUC from chance to certain, what random labels reach shaded, the 0.7 it speaks from', () => {
    const svg = aucTrack({ auc: 0.92, floor: 0.56, speaks: true, aria: 'AUC 0.92' });
    expect(svg).toContain('AUC 0.92');
    expect(svg).toContain('0.5 chance');
    expect(svg).toContain('class="dot dot-warn"');
    // An AUC under chance sits at chance's end of the track, never off it.
    expect(aucTrack({ auc: 0.4, floor: 0.55, aria: 'x' })).toMatch(/<circle class="dot" cx="6"/);
  });

  it('ranks what tells today apart, a bar a column with its share', () => {
    const svg = rankBars({ rows: [{ label: 'Client', share: 0.81 }, { label: 'Method', share: 0.1 }], aria: 'Client 81%, Method 10%' });
    expect(svg).toContain('>Client<');
    expect(svg).toContain('>81%<');
    expect(svg.match(/<rect class="ink"/g)).toHaveLength(2);
  });
});

