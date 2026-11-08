/**
 * The news's visuals (ADR 0008): every chart says its finding to a screen reader, starts counts at zero, carries no
 * broken numbers, and escapes what it is given.
 */
import { describe, expect, it } from 'vitest';
import { amountLine, bulletTrack, composition, dayStrip, dumbbellRows, episodeLine, gateBars, glyph, hourBars, lineage, niceMax, partBar, quantileStrip, ruleRows, splitRows, stripBar, waterfall } from '../src/app/viz.js';

const hours = Array.from({ length: 24 }, (_, h) => (h < 13 ? 5000 : 300));
const usual = Array.from({ length: 24 }, () => 5000);
const charts: [string, string, boolean][] = [
  ['split', splitRows({ rows: [{ name: 'Flex Fare', today: 4613, usual: 4800, todayLabel: '4,613', usualLabel: '~4.8k' }, { name: 'Everything else', today: 20, usual: 110_000, todayLabel: '20', usualLabel: '~110k', sev: 'alert' }], aria: 'Trips by kind: Flex Fare 4,613 of about 4,800; everything else 20 of about 110,000' }), true],
  ['hours', hourBars({ got: hours, usual, cut: 13, cutLabel: '13:00', floorLabel: '~300/h after', ghostLabel: 'usual Thursday', aria: 'Trips by hour: they fall 95% at 13:00' }), true],
  ['gate', gateBars({ rows: 4633, dropped: 2116, rules: [{ name: 'distance', label: 'Distance', warns: false, rows: 2059 }, { name: 'passengers', label: 'Passengers', warns: true, rows: 4613 }], limit: 0.1, usual: { low: 4531, high: 7472 }, held: true, shareLabel: '46% dropped', limitLabel: 'limit 10%', countLabel: ['2,116 rows', ' · usual 4.5k–7.5k'], aria: 'Checks held the run: 46% dropped, limit 10%' }), true],
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
