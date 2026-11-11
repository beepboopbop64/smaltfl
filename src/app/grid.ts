/**
 * A small output read as a grid (the maintainer, 2026-11-11: "interesting interactions between the controls and types
 * of apps"): rows of a summary drawn as a heat table above its rows, so what fails where is seen before it is read.
 * Pure: it takes the rows as the engine gave them and says the grid, or null where the output isn't one.
 *
 * The shapes it knows, by the columns alone:
 * - **long:** two or more text columns and numbers (`control, hosting, criticality, applicable, failing`): a row a value
 *   of the first, a column a combination of the rest, the cell the last number;
 * - **wide:** one text column and numbers (`business_unit, apps, tls_failing, …`): a row a value, a column a number;
 * - **square:** a wide grid whose columns are named for its rows' values (`control, failing, tls, waf, …`): which two
 *   fail together.
 * A cell is a share where a count says how many it is of: the first number when no other exceeds it on any row
 * (applications, applicable, failing on the diagonal). Otherwise it is shaded against its column's largest.
 */

export interface GridCell {
  value: number;
  /** What it is of, where a share: the cell shaded by value / of. */
  of: number | null;
}

export interface Grid {
  shape: 'long' | 'wide' | 'square';
  /** The text column that names the rows, and those that name the columns (long). */
  rowBy: string;
  colBy: string[];
  rows: string[];
  cols: string[];
  /** cells[r][c], or null where the output has no such row. */
  cells: (GridCell | null)[][];
  /** The number each cell shows, and what it is a share of ("failing of applicable"), null where shaded by column. */
  measure: string;
  of: string | null;
  /** How the shade reads: a share of what the row counts, or against the column's largest. */
  shade: 'share' | 'column';
}

type Cell = string | number | bigint | null | undefined | boolean;
const isNum = (x: Cell) => typeof x === 'number' || typeof x === 'bigint';

/** The grid an output's rows draw, or null: too many rows or columns to read as one, or no numbers to shade. */
export function gridOf(columns: readonly string[], rows: (readonly Cell[])[] | readonly (readonly Cell[])[], o: { maxRows?: number; maxCols?: number; order?: (column: string) => readonly string[] | undefined } = {}): Grid | null {
  const maxRows = o.maxRows ?? 16;
  const maxCols = o.maxCols ?? 14;
  if (!rows.length || rows.length > 400) return null;
  const kind = columns.map((_, i) => (rows.every((r) => r[i] === null || r[i] === undefined || isNum(r[i])) && rows.some((r) => isNum(r[i])) ? 'num' : rows.every((r) => r[i] === null || typeof r[i] === 'string') ? 'text' : 'other'));
  if (kind.includes('other')) return null;
  const text = columns.map((_, i) => i).filter((i) => kind[i] === 'text');
  const nums = columns.map((_, i) => i).filter((i) => kind[i] === 'num');
  if (!text.length || !nums.length) return null;
  const n = (r: readonly Cell[], i: number) => (r[i] === null || r[i] === undefined ? null : Number(r[i]));
  const label = (x: Cell) => (x === null || x === undefined ? '(blank)' : String(x));
  const firstBounds = (cols: number[]) => cols.length > 1 && rows.every((r) => { const d = n(r, cols[0]!); return d !== null && cols.slice(1).every((i) => (n(r, i) ?? 0) <= d); });

  if (text.length >= 2) {
    const rowI = text[0]!;
    const colI = text.slice(1);
    const rowsSeen = ordered([...new Set(rows.map((r) => label(r[rowI])))], o.order?.(columns[rowI]!));
    // Columns in the order the ontology lists each part's values (cloud, onprem, saas; critical, high, standard), the
    // first part slowest, so a part's columns sit together; values it doesn't list after, as they came.
    const rank = colI.map((i) => o.order?.(columns[i]!) ?? []);
    const at = (k: number, v: string) => { const j = rank[k]!.indexOf(v); return j < 0 ? rank[k]!.length : j; };
    const seen = [...new Map(rows.map((r) => { const parts = colI.map((i) => label(r[i])); return [parts.join(' · '), parts] as const; })).values()];
    const colsSeen = seen.map((parts, n) => ({ parts, n })).sort((a, b) => { for (let k = 0; k < a.parts.length; k++) { const d = at(k, a.parts[k]!) - at(k, b.parts[k]!); if (d) return d; } return a.n - b.n; }).map((x) => x.parts.join(' · '));
    if (rowsSeen.length > maxRows || colsSeen.length > maxCols) return null;
    const share = firstBounds(nums);
    const v = nums[nums.length - 1]!;
    const cells: (GridCell | null)[][] = rowsSeen.map(() => colsSeen.map(() => null));
    for (const r of rows) {
      const ri = rowsSeen.indexOf(label(r[rowI]));
      const ci = colsSeen.indexOf(colI.map((i) => label(r[i])).join(' · '));
      const prev = cells[ri]![ci];
      const value = (prev?.value ?? 0) + (n(r, v) ?? 0);
      const of = share ? (prev?.of ?? 0) + (n(r, nums[0]!) ?? 0) : null;
      cells[ri]![ci] = { value, of };
    }
    return { shape: 'long', rowBy: columns[rowI]!, colBy: colI.map((i) => columns[i]!), rows: rowsSeen, cols: colsSeen, cells, measure: columns[v]!, of: share ? columns[nums[0]!]! : null, shade: share ? 'share' : 'column' };
  }

  const rowI = text[0]!;
  if (rows.length > maxRows) return null;
  const rank = o.order?.(columns[rowI]!);
  rows = ordered(rows.map((r) => label(r[rowI])), rank).map((v) => rows.find((r) => label(r[rowI]) === v)!);
  const names = rows.map((r) => label(r[rowI]));
  // Square: a column named for each row's value, the cell that pair's count, each a share of the row's own (the diagonal).
  const lower = (x: string) => x.toLowerCase();
  const named = names.map((x) => columns.findIndex((c, i) => kind[i] === 'num' && lower(c) === lower(x)));
  if (names.length >= 3 && named.every((i) => i >= 0)) {
    const cells = rows.map((r, ri) => named.map((ci) => { const d = n(r, named[ri]!); return { value: n(r, ci) ?? 0, of: d && d > 0 ? d : null }; }));
    return { shape: 'square', rowBy: columns[rowI]!, colBy: [], rows: names, cols: names, cells, measure: 'together', of: 'the row’s own', shade: 'share' };
  }
  const share = firstBounds(nums);
  const shown = share ? nums.slice(1) : nums;
  if (shown.length > maxCols) return null;
  const cells = rows.map((r) => shown.map((i) => ({ value: n(r, i) ?? 0, of: share ? n(r, nums[0]!) : null })));
  return { shape: 'wide', rowBy: columns[rowI]!, colBy: [], rows: names, cols: shown.map((i) => columns[i]!), cells, measure: shown.length === 1 ? columns[shown[0]!]! : 'counts', of: share ? columns[nums[0]!]! : null, shade: share ? 'share' : 'column' };
}

/** Values in the order the ontology lists them, those it doesn't after, as they came. */
function ordered(values: string[], rank: readonly string[] | undefined): string[] {
  if (!rank?.length) return values;
  const at = (v: string) => { const j = rank.indexOf(v); return j < 0 ? rank.length : j; };
  return values.map((v, n) => ({ v, n })).sort((a, b) => at(a.v) - at(b.v) || a.n - b.n).map((x) => x.v);
}

/** A cell's share of what it is of (0 to 1), or null where it is shaded by column or is of nothing. */
export function shareOf(g: Grid, r: number, c: number): number | null {
  const cell = g.cells[r]?.[c];
  if (!cell || g.shade !== 'share' || !cell.of || cell.of <= 0) return null;
  return Math.max(0, Math.min(1, cell.value / cell.of));
}

/** A cell's shade, 0 to 1: its share against the grid's largest share (the darkest cell is the worst, whatever its
 * share; the number on it says the share), or its count against its column's largest. */
export function shadeOf(g: Grid, r: number, c: number): number {
  const cell = g.cells[r]?.[c];
  if (!cell) return 0;
  if (g.shade === 'share') {
    const top = Math.max(0, ...g.cells.flatMap((row, i) => row.map((_, j) => (g.shape === 'square' && i === j ? 0 : shareOf(g, i, j) ?? 0))));
    return top > 0 ? (shareOf(g, r, c) ?? 0) / top : 0;
  }
  const max = Math.max(0, ...g.cells.map((row) => row[c]?.value ?? 0));
  return max > 0 ? cell.value / max : 0;
}

/** The cells most out of line with their row and column: a cell's shade against what its row and column would give it
 * if a control failed alike on every kind of application (the shares' expected value, row share × column share / all).
 * The few that stand out most, for words beside the picture: "backup on onprem: 31% (others 12%)". */
export function standOut(g: Grid, k = 3): { r: number; c: number; share: number; others: number }[] {
  if (g.shade !== 'share') return [];
  const out: { r: number; c: number; share: number; others: number; lift: number }[] = [];
  const square = g.shape === 'square';
  g.cells.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell?.of || cell.of < 5 || (square && (r === c || cell.value < 3))) return;
    // A square's pair against the same column's share among the other controls' failures: "of those failing key
    // rotation, 60% fail encryption too; 12% of those failing the others do". Each pair once, the row the smaller.
    if (square && (g.cells[c]![r]!.value / g.cells[c]![r]!.of! > cell.value / cell.of)) return;
    const rest = square ? g.cells.map((x) => x[c]).filter((x, j) => j !== r && j !== c && x && x.of) : row.filter((x, j) => j !== c && x && x.of);
    const v = rest.reduce((s, x) => s + x!.value, 0);
    const of = rest.reduce((s, x) => s + x!.of!, 0);
    if (of < 5) return;
    const share = cell.value / cell.of;
    const others = v / of;
    if (share < 0.05 || share < others * 1.5) return;
    out.push({ r, c, share, others, lift: (share - others) * Math.sqrt(cell.of) });
  }));
  return out.sort((a, b) => b.lift - a.lift).slice(0, k).map(({ lift: _l, ...x }) => x);
}
