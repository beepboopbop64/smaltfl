/**
 * A small output read as a grid (src/app/grid.ts, the maintainer 2026-11-11): the estate's summaries drawn as heat
 * tables so what fails where is seen before it is read. Pure, from the rows as the engine gives them.
 */
import { describe, expect, it } from 'vitest';
import { gridOf, shadeOf, shareOf, standOut } from '../src/app/grid.js';
import { heatGrid } from '../src/app/viz.js';

describe('the shape of a grid, from the columns alone', () => {
  it('reads a long output as a row a value of its first text column and a column the rest, each cell a share of the first count', () => {
    const rows = [
      ['backup', 'cloud', 'high', 40, 4], ['backup', 'onprem', 'high', 20, 7], ['backup', 'cloud', 'standard', 50, 6], ['backup', 'onprem', 'standard', 30, 10],
      ['mfa', 'cloud', 'high', 40, 2], ['mfa', 'onprem', 'high', 20, 1], ['mfa', 'cloud', 'standard', 50, 3], ['mfa', 'onprem', 'standard', 30, 2],
    ];
    const g = gridOf(['control', 'hosting', 'criticality', 'applicable', 'failing'], rows)!;
    expect(g).toMatchObject({ shape: 'long', rowBy: 'control', colBy: ['hosting', 'criticality'], rows: ['backup', 'mfa'], cols: ['cloud · high', 'onprem · high', 'cloud · standard', 'onprem · standard'], measure: 'failing', of: 'applicable', shade: 'share' });
    expect(shareOf(g, 0, 1)).toBeCloseTo(0.35);
    // The darkest cell is the grid's largest share; the rest against it.
    expect(shadeOf(g, 0, 1)).toBe(1);
    expect(shadeOf(g, 0, 0)).toBeCloseTo(0.1 / 0.35);
    // On premises, backup fails a third of the time against a tenth elsewhere: the cells that stand out.
    expect(standOut(g).map((x) => `${g.rows[x.r]} ${g.cols[x.c]}`)).toEqual(['backup onprem · standard', 'backup onprem · high']);
  });

  it('reads a wide output with a count that bounds the rest as shares of it, and one without against each column’s largest', () => {
    const wide = gridOf(['business_unit', 'apps', 'tls_failing', 'waf_failing'], [['Retail', 100, 10, 5], ['Payments', 50, 20, 2]])!;
    expect(wide).toMatchObject({ shape: 'wide', cols: ['tls_failing', 'waf_failing'], of: 'apps', shade: 'share' });
    expect(shareOf(wide, 1, 0)).toBeCloseTo(0.4);
    const raw = gridOf(['unit', 'a', 'b'], [['x', 1, 9], ['y', 4, 3]])!;
    expect(raw).toMatchObject({ shade: 'column', of: null });
    expect(shadeOf(raw, 0, 0)).toBeCloseTo(0.25);
  });

  it('reads a square output, a column named for each row, as which two come together, each a share of the row’s own', () => {
    const g = gridOf(['control', 'failing', 'tls', 'waf', 'mfa'], [['tls', 10, 10, 6, 2], ['waf', 8, 6, 8, 0], ['mfa', 8, 2, 0, 8]])!;
    expect(g).toMatchObject({ shape: 'square', rows: ['tls', 'waf', 'mfa'], cols: ['tls', 'waf', 'mfa'] });
    expect(shareOf(g, 1, 0)).toBeCloseTo(0.75);
    // Of those failing the WAF, three in four fail TLS too, against one in four of the others': the pair, said once.
    expect(standOut(g).map((x) => [g.rows[x.r], g.cols[x.c], x.share, x.others])).toEqual([['waf', 'tls', 0.75, 0.25]]);
    // The diagonal (each row's own) never sets the darkest.
    expect(shadeOf(g, 1, 0)).toBe(1);
  });

  it('puts rows and columns in the order the ontology lists their values', () => {
    const order = (c: string) => (c === 'hosting' ? ['cloud', 'onprem', 'saas'] : c === 'criticality' ? ['critical', 'high', 'standard'] : undefined);
    const g = gridOf(['hosting', 'criticality', 'apps', 'at_risk'], [['saas', 'high', 9, 1], ['onprem', 'standard', 9, 2], ['cloud', 'high', 9, 0], ['onprem', 'critical', 9, 1]], { order })!;
    expect([g.rows, g.cols]).toEqual([['cloud', 'onprem', 'saas'], ['critical', 'high', 'standard']]);
    expect(gridOf(['hosting', 'apps', 'n'], [['saas', 9, 1], ['cloud', 9, 2]], { order })!.rows).toEqual(['cloud', 'saas']);
  });

  it('is no grid for many rows, no numbers, or values that aren’t text or numbers', () => {
    expect(gridOf(['a', 'n'], Array.from({ length: 30 }, (_, i) => [`v${i}`, i]))).toBeNull();
    expect(gridOf(['a', 'b'], [['x', 'y']])).toBeNull();
    expect(gridOf(['a', 'n'], [[true, 1]])).toBeNull();
    expect(gridOf(['a', 'n'], [])).toBeNull();
  });
});

describe('the heat table drawn', () => {
  it('draws a cell a number, shaded, light text on the darkest, a dashed cell where nothing applies, and outlines the hot', () => {
    const svg = heatGrid({ rows: ['backup', 'mfa'], cols: ['cloud', 'onprem'], cells: [[{ text: '10%', shade: 0.1 }, { text: '80%', shade: 0.8, hot: true }], [null, { text: '5%', shade: 0.05 }]], aria: 'Failing of applicable' });
    expect(svg).toMatch(/^<svg class="viz"/);
    expect(svg).toContain('aria-label="Failing of applicable"');
    expect((svg.match(/class="heat( hot)?"/g) ?? []).length).toBe(3);
    expect(svg).toContain('class="heat hot"');
    expect(svg).toContain('class="heat-none"');
    expect(svg).toContain('class="heat-t on">80%');
    expect(svg).toContain('class="heat-t">10%');
  });

  it('heads columns of two parts by the first once over its run, the second under it, by its first letter with a key where it doesn’t fit', () => {
    const cols = ['Cloud · Critical', 'Cloud · High', 'Cloud · Standard', 'On premises · Critical', 'On premises · High', 'On premises · Standard', 'SaaS · Critical', 'SaaS · High', 'SaaS · Standard'];
    const svg = heatGrid({ rows: ['tls'], cols, cells: [cols.map(() => ({ text: '1%', shade: 0.1 }))], aria: 'x' });
    expect((svg.match(/class="lbl-mid heat-g"/g) ?? []).length).toBe(3);
    expect(svg).toContain('>On premises</text>');
    expect((svg.match(/class="tick" text-anchor="middle">[CHS]<\/text>/g) ?? []).length).toBe(9);
    expect(svg).toContain('>C Critical · H High · S Standard</text>');
    expect(svg).not.toContain('rotate(');
  });

  it('turns column labels that don’t fit their cell', () => {
    const svg = heatGrid({ rows: ['a'], cols: Array.from({ length: 9 }, (_, i) => `standard and more ${i}`), cells: [Array.from({ length: 9 }, () => ({ text: '1', shade: 0.5 }))], aria: 'x' });
    expect(svg).toContain('rotate(-55');
  });
});
