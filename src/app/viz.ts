/**
 * The news's visuals (ADR 0008): small charts that say what a sentence used to, each a pure function from numbers to
 * an SVG string, so they can be tested without a page and put on one with a single parse. Every chart has role=img and
 * an aria-label stating its finding with its numbers; counts start at zero (data-y0="0"); words sit on the marks.
 *
 * Marks (one meaning each): alert, a filled hexagon with '!'; warn, an outlined triangle on a wash; held, the wall
 * cap ‖; explained, ↳; note, a small dot; usual, a light ghost behind today's ink; not today's run, a hatch. Colours
 * are the app's tokens, set by class in page.html under `.viz`, so light and dark both work.
 */

export type Mark = 'alert' | 'warn' | 'note' | 'held' | 'explained' | 'info' | 'chev' | 'more' | 'seal' | 'ack';

export const esc = (s: unknown): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const f1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);

/** A severity or state glyph, 16 units square, aria-hidden: the words beside it say what it means. */
export function glyph(kind: Mark, size = 16): string {
  const a = `width="${size}" height="${size}" viewBox="0 0 16 16" class="g g-${kind}" aria-hidden="true" focusable="false"`;
  switch (kind) {
    case 'alert':
      return `<svg ${a}><path class="g-fill" d="M8 .6l6.7 3.8v7.2L8 15.4l-6.7-3.8V4.4z"/><rect class="g-cut" x="6.9" y="3.6" width="2.2" height="6.2" rx="1.1"/><circle class="g-cut" cx="8" cy="12.1" r="1.25"/></svg>`;
    case 'warn':
      return `<svg ${a}><path class="g-tri" d="M8 1.9l6.6 12H1.4z"/><rect class="g-mark" x="7.1" y="5.9" width="1.8" height="4.4" rx=".9"/><circle class="g-mark" cx="8" cy="12" r="1"/></svg>`;
    case 'held':
      return `<svg ${a}><rect class="g-wall" x="3.6" y="1.5" width="2.8" height="13" rx="1"/><rect class="g-wall" x="9.6" y="1.5" width="2.8" height="13" rx="1"/></svg>`;
    case 'explained':
      return `<svg ${a}><path class="g-arrow" d="M4 2.5v6.5h8M9.2 6.2L12 9l-2.8 2.8"/></svg>`;
    case 'note':
      return `<svg ${a}><circle class="g-note" cx="8" cy="8" r="3"/></svg>`;
    case 'info':
      return `<svg ${a}><circle class="g-ring" cx="8" cy="8" r="6.6"/><rect class="g-i" x="7.2" y="6.9" width="1.6" height="5" rx=".8"/><circle class="g-i" cx="8" cy="4.7" r="1.05"/></svg>`;
    case 'chev':
      return `<svg ${a}><path class="g-chev" d="M6 3.5L10.5 8 6 12.5"/></svg>`;
    case 'more':
      return `<svg ${a}><circle class="g-i" cx="3" cy="8" r="1.5"/><circle class="g-i" cx="8" cy="8" r="1.5"/><circle class="g-i" cx="13" cy="8" r="1.5"/></svg>`;
    case 'seal':
      return `<svg ${a}><circle class="g-seal" cx="8" cy="8" r="7"/><path class="g-sealmark" d="M4.8 8.2l2.2 2.2 4.2-4.6"/></svg>`;
    case 'ack':
      return `<svg ${a}><path class="g-ack" d="M3.2 8.4l3 3 6.6-7"/></svg>`;
  }
}

/** A column grown from a baseline, its data end rounded. */
function colPath(x: number, base: number, w: number, h: number, r = 2): string {
  if (!(h > 0) || !(w > 0)) return '';
  const rr = Math.min(r, w / 2, h);
  const t = base - h;
  return `M${f1(x)} ${f1(base)}V${f1(t + rr)}Q${f1(x)} ${f1(t)} ${f1(x + rr)} ${f1(t)}H${f1(x + w - rr)}Q${f1(x + w)} ${f1(t)} ${f1(x + w)} ${f1(t + rr)}V${f1(base)}Z`;
}
/** A bar grown rightwards from x0, its data end rounded. */
function barPath(x0: number, y: number, len: number, h: number, r = 2): string {
  if (!(len > 0)) return '';
  const rr = Math.min(r, h / 2, len);
  const e = x0 + len;
  return `M${f1(x0)} ${f1(y)}H${f1(e - rr)}Q${f1(e)} ${f1(y)} ${f1(e)} ${f1(y + rr)}V${f1(y + h - rr)}Q${f1(e)} ${f1(y + h)} ${f1(e - rr)} ${f1(y + h)}H${f1(x0)}Z`;
}
const open = (w: number, h: number, aria: string, extra = '') =>
  `<svg class="viz" width="${w}" height="${f1(h)}" viewBox="0 0 ${w} ${f1(h)}" role="img" aria-label="${esc(aria)}"${extra ? ` ${extra}` : ''}>`;

export interface SplitRow {
  name: string;
  today: number;
  usual: number;
  todayLabel: string;
  usualLabel: string;
  /** The moved row carries the severity: the head's claim, drawn heavier. */
  sev?: 'alert' | 'warn';
}

/**
 * The cause as a population: the named part and everything else, each today against its own usual count. One axis of
 * today ÷ usual from 0, so a part that held reads as a full bar and one that stopped as a sliver (2 px at least); a
 * part above its usual runs past the end of its ghost.
 */
export function splitRows({ rows, w = 334, aria }: { rows: SplitRow[]; w?: number; aria: string }): string {
  const rowH = 34;
  const maxR = Math.max(1, ...rows.map((r) => r.today / Math.max(1, r.usual)));
  const xmax = maxR > 1 ? maxR * 1.02 : 1;
  const pw = w - 22;
  const x = (ratio: number) => (ratio / xmax) * pw;
  let s = open(w, rows.length * rowH, aria, 'data-y0="0"');
  rows.forEach((r, i) => {
    const moved = !!r.sev;
    const y = i * rowH;
    const barH = moved ? 14 : 9;
    const inH = moved ? 10 : 5;
    const ratio = r.today / Math.max(1, r.usual);
    const len = r.today > 0 ? Math.max(2, x(ratio)) : 0;
    s += `<text x="0" y="${y + 12}" class="${moved ? 'lbl-b' : 'lbl-mid'}">${esc(r.name)}</text>`;
    s += `<text x="${w}" y="${y + 12}" text-anchor="end" class="lbl-m"><tspan class="${moved ? 'lbl-b' : 'lbl-mid'}">${esc(r.todayLabel)}</tspan> of ${esc(r.usualLabel)}</text>`;
    const by = y + 17 + (moved ? 0 : 2);
    s += `<path class="ghost" d="${barPath(0, by, x(1), barH, 2)}"/>`;
    s += `<path class="${moved ? 'ink-strong' : 'ink'}" d="${barPath(0, by + (barH - inH) / 2, len, inH, 1.5)}"/>`;
    if (ratio > 1) s += `<line class="usual-end" x1="${f1(x(1))}" x2="${f1(x(1))}" y1="${by - 2}" y2="${by + barH + 2}"/>`;
    if (moved && r.sev) s += `<g transform="translate(${f1(len + 5)} ${by - 1})">${glyph(r.sev, 16)}</g>`;
  });
  return `${s}</svg>`;
}

/**
 * Trips by pickup hour: 24 columns, today's count (ink) over the usual count that hour (ghost); the uncovered ghost is
 * the shortfall. A rule marks the first short hour; the floor after it and the ghost are labelled on the chart.
 */
export function hourBars(o: { got: readonly number[]; usual: readonly number[]; w?: number; barsH?: number; cut?: number; cutLabel?: string; floorLabel?: string; ghostLabel?: string; aria: string; pick?: number }): string {
  const w = o.w ?? 334;
  const barsH = o.barsH ?? 64;
  const top = 16;
  const base = top + barsH;
  const h = base + 16;
  const cw = w / 24;
  const bw = cw - 2.5;
  const ymax = Math.max(1, ...o.usual, ...o.got) * 1.04;
  const y = (v: number) => (v / ymax) * barsH;
  let s = open(w, h, o.aria, 'data-y0="0"');
  for (let i = 0; i < 24; i++) {
    const x0 = i * cw + 1.25;
    s += `<path class="ghost" d="${colPath(x0, base, bw, y(o.usual[i] ?? 0))}"/>`;
    const got = o.got[i] ?? 0;
    s += `<path class="${o.pick === i ? 'ink-strong' : 'ink'}" d="${colPath(x0 + 1.5, base, bw - 3, got > 0 ? Math.max(1.5, y(got)) : 0, 1.5)}"/>`;
  }
  s += `<line class="base" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  if (o.cut !== undefined) {
    const cx = o.cut * cw;
    s += `<line class="cut-bad" x1="${f1(cx)}" x2="${f1(cx)}" y1="${top - 3}" y2="${base}"/>`;
    if (o.cutLabel) s += `<text x="${f1(cx - 4)}" y="${top - 5}" text-anchor="end" class="lbl-bad">${esc(o.cutLabel)}</text>`;
    if (o.floorLabel) {
      const after = o.got.slice(o.cut + 1);
      const fy = base - y(Math.max(0, ...after)) - 5;
      s += `<text x="${f1(cx + 5)}" y="${f1(fy)}" class="lbl-m lbl-halo">${esc(o.floorLabel)}</text>`;
    }
  }
  if (o.ghostLabel) s += `<text x="${w}" y="${top - 5}" text-anchor="end" class="lbl-m">${esc(o.ghostLabel)}</text>`;
  if (o.pick !== undefined) {
    const px = o.pick * cw + cw / 2;
    s += `<path class="pick" d="M${f1(px - 4)} ${base + 7}l4 -4 4 4z"/>`;
  }
  for (const t of [0, 6, 12, 18, 24]) s += `<text x="${f1(t * cw)}" y="${base + 13}" text-anchor="${t === 0 ? 'start' : t === 24 ? 'end' : 'middle'}" class="tick" aria-hidden="true">${t}</text>`;
  return `${s}</svg>`;
}

export interface GateRule {
  name: string;
  label: string;
  warns: boolean;
  rows: number;
}

/**
 * The checks: a share bar (0-100%: the dropped rows as one segment, a ‖ wall when the run was held, the kept rows in a
 * ghost; the limit a cut through the ink with stubs above and below) and under it a count bar (rows dropped today from 0,
 * over the usual range of rows dropped), which shows whether more bad rows came or the kept rows went missing. Both
 * scales' ends are printed.
 */
export function gateBars(o: { rows: number; dropped: number; rules?: readonly GateRule[]; limit: number | null; usual: { low: number; high: number } | null; held: boolean; shareLabel: string; limitLabel?: string; countLabel: [string, string]; aria: string; w?: number; big?: boolean }): string {
  const w = o.w ?? 334;
  const share = o.rows ? o.dropped / o.rows : 0;
  const sbH = o.big ? 18 : 12;
  const cbH = o.big ? 14 : 10;
  const sy = 18;
  const cy = sy + sbH + 40;
  const h = cy + cbH + 16;
  const x = (p: number) => p * w;
  let s = open(w, h, o.aria, 'data-y0="0"');
  const total = Math.max(2, x(share));
  const keptX = total + (o.held ? 11 : 2);
  s += `<rect class="ghost edge" x="${f1(keptX)}" y="${sy}" width="${f1(Math.max(0, w - keptX))}" height="${sbH}" rx="2"/>`;
  s += `<path class="ink-strong" d="${barPath(0, sy, total, sbH, 2)}"/>`;
  if (o.held) s += `<g transform="translate(${f1(total + 2)} ${sy - 3})"><rect class="wall" x="0" y="0" width="3" height="${sbH + 6}" rx="1"/><rect class="wall" x="5" y="0" width="3" height="${sbH + 6}" rx="1"/></g>`;
  if (o.limit !== null) {
    const lx = x(o.limit);
    s += `<rect class="limit-gap" x="${f1(lx - 1)}" y="${sy}" width="2" height="${sbH}"/><rect class="limit" x="${f1(lx - 1)}" y="${sy - 5}" width="2" height="4"/><rect class="limit" x="${f1(lx - 1)}" y="${sy + sbH + 1}" width="2" height="4"/>`;
    if (o.limitLabel) s += `<text x="${f1(lx)}" y="${sy + sbH + 17}" text-anchor="${lx < 40 ? 'start' : 'middle'}" class="lbl-m">${esc(o.limitLabel)}</text>`;
  }
  s += `<text x="${f1(Math.min(w - 40, Math.max(total, 76)))}" y="${sy - 6}" text-anchor="end" class="lbl-b">${esc(o.shareLabel)}</text>`;
  s += `<text x="${w}" y="${sy + sbH + 17}" text-anchor="end" class="tick" aria-hidden="true">100%</text>`;
  if (o.usual) {
    const raw = Math.max(o.usual.high, o.dropped, 1) * 1.08;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const cmax = Math.ceil(raw / mag) * mag;
    const c = (v: number) => (v / cmax) * w;
    s += `<rect class="ghost-2 edge" x="${f1(c(o.usual.low))}" y="${cy}" width="${f1(Math.max(2, c(o.usual.high) - c(o.usual.low)))}" height="${cbH}" rx="2"/>`;
    s += `<path class="ink-strong" d="${barPath(0, cy + 2, Math.max(2, c(o.dropped)), cbH - 4, 1.5)}"/>`;
    s += `<text x="0" y="${cy - 6}" class="lbl-b">${esc(o.countLabel[0])}</text>`;
    if (o.countLabel[1]) s += `<text x="${f1(Math.min(w, Math.max(c(o.usual.high), 150)))}" y="${cy - 6}" text-anchor="end" class="lbl-m">${esc(o.countLabel[1])}</text>`;
    const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k`.replace('.0k', 'k') : String(v));
    s += `<text x="0" y="${cy + cbH + 13}" class="tick" aria-hidden="true">0</text><text x="${w}" y="${cy + cbH + 13}" text-anchor="end" class="tick" aria-hidden="true">${fmt(cmax)}</text>`;
  } else s += `<text x="0" y="${cy - 6}" class="lbl-b">${esc(o.countLabel[0])}</text>`;
  return `${s}</svg>`;
}

/**
 * The day's count on a track from 0: the number large, in its severity when the amount is the news; its usual range as
 * a band with an edge; today a dot. One chart, so the first numbers on the screen are drawn, not said.
 */
export function amountLine(o: { value: number; low: number; high: number; valueLabel: string; bandLabel: string; sev?: 'alert' | 'warn' | null; aria: string; w?: number }): string {
  const w = o.w ?? 334;
  const h = 62;
  const ty = 46;
  const raw = Math.max(o.high, o.value) * 1.05;
  const max = Math.ceil(raw / 10_000) * 10_000 || 1;
  const x = (v: number) => (v / max) * (w - 8) + 4;
  let s = open(w, h, o.aria, 'data-y0="0"');
  s += `<text x="0" y="30" class="count${o.sev === 'alert' ? ' count-bad' : ''}">${esc(o.valueLabel)}<tspan class="count-unit" dx="6">trips</tspan></text>`;
  s += `<text x="${w - 30}" y="30" text-anchor="end" class="lbl-m">${esc(o.bandLabel)}</text>`;
  s += `<line class="base" x1="4" x2="${w - 4}" y1="${ty}" y2="${ty}"/>`;
  s += `<rect class="ghost-2 edge" x="${f1(x(o.low))}" y="${ty - 5}" width="${f1(Math.max(3, x(o.high) - x(o.low)))}" height="10" rx="3"/>`;
  s += `<circle class="dot${o.sev ? ` dot-${o.sev}` : ''}" cx="${f1(x(o.value))}" cy="${ty}" r="5.5"/>`;
  const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
  s += `<text x="4" y="${h - 1}" class="tick" aria-hidden="true">0</text><text x="${w - 4}" y="${h - 1}" text-anchor="end" class="tick" aria-hidden="true">${k(max)}</text>`;
  return `${s}</svg>`;
}

export interface Part {
  name: string;
  today: number;
  usual: number;
  label: string;
  sev?: 'alert' | 'warn' | null;
}

/**
 * The split on one count scale: the named part on the left, everything else on the right, end to end. Each part's slot
 * is its usual or today's count, whichever is more, outlined; today fills it from its start (2 px at least). Rows missing
 * today are a dashed outline on a wash; a surge runs past a usual-end tick in a solid grey, never dashed.
 */
export function partBar({ left, right, w = 334, aria }: { left: Part; right: Part; w?: number; aria: string }): string {
  const h = 58;
  const by = 32;
  const bh = 20;
  const gap = 4;
  const slot = (p: Part) => Math.max(p.today, p.usual, 1);
  const total = slot(left) + slot(right);
  const scale = (w - gap) / total;
  let s = open(w, h, aria, 'data-y0="0"');
  const draw = (p: Part, x0: number) => {
    const sw = slot(p) * scale;
    const today = p.today > 0 ? Math.max(2, p.today * scale) : 0;
    const usual = p.usual * scale;
    s += `<rect class="slot" x="${f1(x0)}" y="${by}" width="${f1(sw)}" height="${bh}" rx="2"/>`;
    if (p.today < p.usual) {
      if (today) s += `<rect class="ink-strong" x="${f1(x0)}" y="${by}" width="${f1(today)}" height="${bh}" rx="2"/>`;
      if (usual - today > 3) s += `<rect class="absent" x="${f1(x0 + today + 1)}" y="${by + 1}" width="${f1(usual - today - 2)}" height="${bh - 2}" rx="2"/>`;
    } else {
      s += `<rect class="ink-strong" x="${f1(x0)}" y="${by}" width="${f1(Math.max(2, usual))}" height="${bh}" rx="2"/>`;
      if (today - usual > 1) {
        s += `<rect class="over" x="${f1(x0 + usual + 2)}" y="${by}" width="${f1(today - usual - 2)}" height="${bh}" rx="2"/>`;
        s += `<line class="usual-end" x1="${f1(x0 + usual + 1)}" x2="${f1(x0 + usual + 1)}" y1="${by - 3}" y2="${by + bh + 3}"/>`;
      }
    }
    return sw;
  };
  const lw = draw(left, 0);
  draw(right, lw + gap);
  const name = (p: Part, x: number, anchor: 'start' | 'end') =>
    `<text x="${f1(x + (p.sev && anchor === 'start' ? 16 : 0))}" y="12" text-anchor="${anchor}" class="lbl-b">${esc(p.name)}</text>` +
    (p.sev ? `<g transform="translate(${f1(anchor === 'start' ? x : x - p.name.length * 6.9 - 16)} 1)">${glyph(p.sev, 13)}</g>` : '') +
    `<text x="${f1(x)}" y="26" text-anchor="${anchor}" class="lbl-m">${esc(p.label)}</text>`;
  s += name(left, 0, 'start') + name(right, w, 'end');
  return `${s}</svg>`;
}

/** The reach as an icon: the source, the checks, the outputs; hatched (not built) when the run was held, double-ringed
 * when they were published from a day with something wrong. aria-hidden: the row's words say it. */
export function reachIcon({ n, state }: { n: number; state: 'held' | 'alert' }): string {
  const boxes = Math.min(3, Math.max(1, n));
  const w = 9 + 6 + 22 + 6 + 22 + 6 + boxes * 25;
  let s = `<svg class="viz reach" width="${w}" height="28" viewBox="0 0 ${w} 28" aria-hidden="true" focusable="false">`;
  s += `<circle class="port" cx="4.5" cy="14" r="4.5"/><line class="base" x1="9" x2="15" y1="14" y2="14"/>`;
  s += `<rect class="node" x="15" y="2" width="22" height="24" rx="4"/><line class="base" x1="37" x2="43" y1="14" y2="14"/>`;
  s += `<rect class="node" x="43" y="2" width="22" height="24" rx="4"/>`;
  if (state === 'held') s += `<rect class="wall" x="50" y="8" width="2.5" height="12" rx="1"/><rect class="wall" x="55.5" y="8" width="2.5" height="12" rx="1"/>`;
  s += `<line class="${state === 'held' ? 'joint' : 'base'}" x1="65" x2="71" y1="14" y2="14"/>`;
  for (let i = 0; i < boxes; i++) {
    const x = 71 + i * 25;
    s += state === 'held' ? `<rect class="hatch-box" x="${x}" y="2" width="21" height="24" rx="4"/>` : `<rect class="ring-bad" x="${x - 2}" y="0" width="25" height="28" rx="6"/><rect class="node" x="${x}" y="2" width="21" height="24" rx="4"/>`;
  }
  return `${s}</svg>`;
}

/**
 * Every hour of an episode as a bar from 0 over the usual hour's ghost: days divided, a rule at the first short hour,
 * a bracket over the short span carrying the shortfall, the floor labelled, and each day's mark under its name. Each
 * bar carries its hour (data-k) for a readout.
 */
export function episodeBars(o: { days: readonly { label: string; got: readonly number[]; usual: readonly number[]; mark?: string }[]; cut?: number; cutLabel?: string; bracket?: { from: number; to: number; label: string }; floorLabel?: string; aria: string; w?: number; h?: number }): string {
  const w = o.w ?? 334;
  const h = o.h ?? 170;
  const top = 30;
  const base = h - 34;
  const hours = o.days.length * 24;
  const xw = w / Math.max(1, hours);
  const usual = o.days.flatMap((d) => [...d.usual]);
  const got = o.days.flatMap((d) => [...d.got]);
  const ymax = Math.max(1, ...usual, ...got) * 1.05;
  const y = (v: number) => base - (v / ymax) * (base - top);
  let s = open(w, h, o.aria, 'data-y0="0"');
  for (let i = 0; i < hours; i++) {
    const x0 = i * xw;
    s += `<rect class="ghost" x="${f1(x0)}" y="${f1(y(usual[i] ?? 0))}" width="${f1(Math.max(0.6, xw - 0.6))}" height="${f1(base - y(usual[i] ?? 0))}"/>`;
    const g = got[i] ?? 0;
    if (g > 0) s += `<rect class="ink-strong" x="${f1(x0 + 0.3)}" y="${f1(Math.min(y(g), base - 1))}" width="${f1(Math.max(0.6, xw - 1.2))}" height="${f1(Math.max(1, base - y(g)))}" data-k="${i}"/>`;
  }
  o.days.forEach((d, i) => {
    if (i) s += `<line class="hair dotted" x1="${f1(i * 24 * xw)}" x2="${f1(i * 24 * xw)}" y1="${top - 4}" y2="${base}"/>`;
    s += `<text x="${f1((i * 24 + 12) * xw)}" y="${base + 13}" text-anchor="middle" class="tick" aria-hidden="true">${esc(d.label)}</text>`;
    if (d.mark) s += `<g transform="translate(${f1((i * 24 + 12) * xw - (d.mark.includes('held') ? 13 : 6))} ${base + 18})">${d.mark.split(' ').filter(Boolean).map((m, j) => `<g transform="translate(${j * 13} 0)">${glyph(m as Mark, 12)}</g>`).join('')}</g>`;
  });
  s += `<line class="base" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  if (o.cut !== undefined) {
    const cx = o.cut * xw;
    s += `<line class="cut-bad" x1="${f1(cx)}" x2="${f1(cx)}" y1="${top - 8}" y2="${base}"/>`;
    if (o.cutLabel) s += `<text x="${f1(cx + 4)}" y="${top - 10}" class="lbl-bad">${esc(o.cutLabel)}</text>`;
  }
  if (o.bracket) {
    const x1 = o.bracket.from * xw;
    const x2 = o.bracket.to * xw;
    s += `<path class="bracket" d="M${f1(x1)} ${top - 2}v-5H${f1(x2)}v5"/><text x="${f1((x1 + x2) / 2)}" y="${top - 10}" text-anchor="middle" class="lbl-bad">${esc(o.bracket.label)}</text>`;
  }
  if (o.floorLabel) s += `<text x="${f1(w * 0.62)}" y="${base - 10}" text-anchor="middle" class="lbl-m lbl-halo">${esc(o.floorLabel)}</text>`;
  return `${s}</svg>`;
}

/**
 * What a held run didn't build, on the plan's real chain: the source and the checks with their wall, then a dashed spine
 * through the steps not built (consecutive ones as a pill) and the outputs, hatched.
 */
export function heldLineage({ source, rows, step, chain, w = 334, aria }: { source: string; rows: string; step: string; chain: readonly { kind: 'steps' | 'output'; label: string }[]; w?: number; aria: string }): string {
  const rowH = 36;
  const h = 34 + chain.length * rowH + 6;
  let s = open(w, h, aria);
  s += `<rect class="node" x="0" y="0" width="150" height="30" rx="6"/><text x="10" y="19" class="mono">${esc(source)} · ${esc(rows)}</text>`;
  s += `<line class="edge-t" x1="150" x2="172" y1="15" y2="15"/>`;
  s += `<rect class="node" x="172" y="0" width="${w - 172}" height="30" rx="6"/><text x="182" y="19" class="mono">${esc(step)}</text>`;
  s += `<g transform="translate(${w - 22} 7)"><rect class="wall" x="0" y="0" width="3" height="16" rx="1"/><rect class="wall" x="6" y="0" width="3" height="16" rx="1"/></g>`;
  s += `<path class="edge-t dash" d="M${w - 80} 30V${f1(34 + (chain.length - 1) * rowH + 15)}"/>`;
  chain.forEach((c, i) => {
    const y0 = 34 + i * rowH + 3;
    if (c.kind === 'steps') s += `<rect class="pill" x="${w - 170}" y="${y0 + 4}" width="180" height="22" rx="11" transform="translate(-10 0)"/><text x="${w - 90}" y="${y0 + 19}" text-anchor="middle" class="lbl-m">${esc(c.label)}</text>`;
    else s += `<rect class="hatch-box" x="${w - 180}" y="${y0}" width="180" height="30" rx="6"/><text x="${w - 90}" y="${y0 + 19}" text-anchor="middle" class="mono">${esc(c.label)}</text>`;
  });
  return `${s}</svg>`;
}

/** A calm day's number on a track from 0: the usual range as a band, today as an ink dot, both labelled. */
export function bulletTrack(o: { value: number; low: number; high: number; valueLabel: string; bandLabel: string; aria: string; w?: number; sev?: 'alert' | 'warn' | null }): string {
  const w = o.w ?? 334;
  const h = 56;
  const ty = 20;
  const bh = 12;
  const xmax = Math.max(o.high, o.value) * 1.12 || 1;
  const x = (v: number) => (v / xmax) * (w - 8) + 4;
  let s = open(w, h, o.aria, 'data-y0="0"');
  s += `<line class="base" x1="4" x2="${w - 4}" y1="${ty + bh / 2}" y2="${ty + bh / 2}"/>`;
  s += `<rect class="ghost" x="${f1(x(o.low))}" y="${ty}" width="${f1(Math.max(2, x(o.high) - x(o.low)))}" height="${bh}" rx="3"/>`;
  s += `<circle class="dot${o.sev ? ` dot-${o.sev}` : ''}" cx="${f1(x(o.value))}" cy="${ty + bh / 2}" r="5.5"/>`;
  s += `<text x="${f1(Math.min(w - 30, Math.max(30, x(o.value))))}" y="${ty - 7}" text-anchor="middle" class="lbl-b">${esc(o.valueLabel)}</text>`;
  s += `<text x="${f1((x(o.low) + x(o.high)) / 2)}" y="${ty + bh + 17}" text-anchor="middle" class="lbl-m">${esc(o.bandLabel)}</text>`;
  s += `<text x="4" y="${ty + bh + 17}" class="tick" aria-hidden="true">0</text>`;
  return `${s}</svg>`;
}

export interface StripDay {
  day: string;
  v: number | null;
  low: number | null;
  high: number | null;
  sev?: 'alert' | 'warn' | null;
}

/**
 * One column per day, each the day's own usual range as a band (the same weekday as the last day a step darker) with
 * the day's value as an ink tick, the last day outlined; a tick takes a severity fill only if that day was told as
 * alert or warn. The axis starts at 0.
 */
export function dayStrip(o: { days: readonly StripDay[]; w?: number; h?: number; labels?: [number, string, string?][]; aria: string; bandLabel?: string; zero?: boolean }): string {
  const w = o.w ?? 334;
  const h = o.h ?? 64;
  const n = o.days.length;
  const cw = w / Math.max(1, n);
  const bw = Math.min(14, cw - 2);
  const top = 14;
  const base = h - 14;
  const ymax = Math.max(1, ...o.days.flatMap((d) => [d.high ?? 0, d.v ?? 0])) * 1.06;
  const y = (v: number) => base - (v / ymax) * (base - top);
  const last = o.days[n - 1];
  const wd = last ? new Date(`${last.day}T00:00:00Z`).getUTCDay() : -1;
  let s = open(w, h, o.aria, 'data-y0="0"');
  s += `<line class="base" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  o.days.forEach((d, i) => {
    const cx = i * cw + cw / 2;
    const same = new Date(`${d.day}T00:00:00Z`).getUTCDay() === wd;
    if (d.low !== null && d.high !== null) s += `<rect class="${same ? 'ghost-2' : 'ghost'}" x="${f1(cx - bw / 2)}" y="${f1(y(d.high))}" width="${f1(bw)}" height="${f1(Math.max(1, y(d.low) - y(d.high)))}" rx="2"/>`;
    if (d.v !== null) s += `<rect class="${d.sev ? `sev-${d.sev}-fill` : 'ink'}" x="${f1(cx - bw / 2 - 1)}" y="${f1(Math.min(y(d.v), base - 3) - 1.5)}" width="${f1(bw + 2)}" height="3" rx="1"/>`;
  });
  if (last) {
    const lx = (n - 1) * cw + cw / 2;
    s += `<rect class="today-ring" x="${f1(lx - cw / 2 + 0.5)}" y="${top - 6}" width="${f1(cw - 1)}" height="${base - top + 8}" rx="3"/>`;
    if (o.bandLabel && last.high !== null) s += `<text x="${f1(lx - cw / 2 - 4)}" y="${f1(y(last.high) + 4)}" text-anchor="end" class="lbl-m lbl-halo">${esc(o.bandLabel)}</text>`;
  }
  if (o.zero) s += `<text x="0" y="${base - 3}" class="tick" aria-hidden="true">0</text>`;
  for (const [i, t, anchor] of o.labels ?? []) s += `<text x="${f1(i * cw + cw / 2)}" y="${h - 2}" text-anchor="${anchor ?? 'middle'}" class="tick" aria-hidden="true">${esc(t)}</text>`;
  return `${s}</svg>`;
}

export interface Step {
  name: string;
  label: string;
  value: number;
  total?: boolean;
  /** 'total', 'down' or 'up': how it is drawn. */
  kind: 'total' | 'down' | 'up';
  sev?: 'alert' | 'warn';
}

/** From the usual count to today's: each part's change as a floating bar on a count axis from 0, joined by dashes. */
export function waterfall({ steps, w = 334, h = 172, aria }: { steps: readonly Step[]; w?: number; h?: number; aria: string }): string {
  const top = 22;
  const base = h - 22;
  const n = steps.length;
  const cw = w / n;
  const bw = Math.min(40, cw - 30);
  let run = 0;
  const bars = steps.map((st) => {
    if (st.total) {
      run = st.value;
      return { ...st, from: 0, to: st.value };
    }
    const from = run;
    run += st.value;
    return { ...st, from, to: run };
  });
  const ymax = Math.max(1, ...bars.map((b) => Math.max(b.from, b.to))) * 1.08;
  const y = (v: number) => base - (v / ymax) * (base - top);
  let s = open(w, h, aria, 'data-y0="0"');
  s += `<line class="base" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  bars.forEach((b, i) => {
    const cx = i * cw + cw / 2;
    const yt = y(Math.max(b.from, b.to));
    const yb = y(Math.min(b.from, b.to));
    s += `<rect class="${i === 0 && b.kind === 'total' ? 'ghost-2 edge' : b.kind === 'total' ? 'ink-strong' : b.kind === 'down' ? 'absent' : 'ink'}" x="${f1(cx - bw / 2)}" y="${f1(yt)}" width="${f1(bw)}" height="${f1(Math.max(2, yb - yt))}" rx="2"/>`;
    if (i < n - 1) s += `<line class="joint" x1="${f1(cx + bw / 2)}" x2="${f1(cx + cw - bw / 2)}" y1="${f1(y(b.to))}" y2="${f1(y(b.to))}"/>`;
    s += `<text x="${f1(cx)}" y="${f1(yt - 6)}" text-anchor="middle" class="${b.kind === 'down' ? 'lbl-bad' : 'lbl-b'}">${esc(b.label)}</text>`;
    s += `<text x="${f1(cx)}" y="${h - 6}" text-anchor="middle" class="tick" aria-hidden="true">${esc(b.name)}</text>`;
    if (b.sev) s += `<g transform="translate(${f1(cx + bw / 2 + 3)} ${f1(yb - 16)})">${glyph(b.sev, 14)}</g>`;
  });
  s += `<text x="0" y="${base - 3}" class="tick" aria-hidden="true">0</text>`;
  return `${s}</svg>`;
}

export interface Segment {
  name: string;
  share: number;
  text?: string;
  above?: string;
  /** Not there today but usually: drawn as a dashed empty slot. */
  gone?: boolean;
  /** Never seen before: an accent segment. */
  fresh?: boolean;
}

/** A column's values as 100% bars, usual over today, the moved part dark, names inside a segment only when they fit. */
export function composition({ bars, moved, w = 334, aria }: { bars: readonly { label: string; parts: readonly Segment[] }[]; moved?: string; w?: number; aria: string }): string {
  const bh = 22;
  const gap = 2;
  let s = open(w, bars.length * (bh + 18), aria);
  bars.forEach((b, i) => {
    const y = i * (bh + 18) + 14;
    s += `<text x="0" y="${y - 4}" class="tick" aria-hidden="true">${esc(b.label)}</text>`;
    const parts = b.parts.filter((p) => p.share > 0 || p.gone);
    const avail = w - gap * Math.max(0, parts.length - 1);
    const widths = parts.map((p) => Math.max(p.gone ? 8 : 2, p.share * avail));
    const extra = sum(widths) - avail;
    if (widths.length) widths[widths.indexOf(Math.max(...widths))]! -= extra;
    let x = 0;
    parts.forEach((p, j) => {
      const dark = p.name === moved;
      const cls = p.gone ? 'seg-gone' : p.fresh ? 'seg-new' : dark ? 'ink-strong' : 'ghost-2';
      s += `<rect class="${cls}" x="${f1(x)}" y="${y}" width="${f1(Math.max(1, widths[j]!))}" height="${bh}" rx="${j === 0 || j === parts.length - 1 ? 3 : 0}"/>`;
      if (p.text && widths[j]! > p.text.length * 6.6 + 12) s += `<text x="${f1(x + 6)}" y="${y + bh / 2 + 4}" class="${dark ? 'lbl-on-dark' : 'lbl-in'}">${esc(p.text)}</text>`;
      if (p.above) s += `<text x="${f1(Math.min(w, x + widths[j]!))}" y="${y - 4}" text-anchor="end" class="lbl-b">${esc(p.above)}</text>`;
      x += widths[j]! + gap;
    });
  });
  return `${s}</svg>`;
}

/** Every hour of an episode, today's trips as a line over the usual trips that hour (a ghost area), days divided. */
export function episodeLine(o: { days: readonly { label: string; got: readonly number[]; usual: readonly number[] }[]; w?: number; h?: number; aria: string; cut?: number; cutLabel?: string; floorLabel?: string; floorAt?: number; ghostLabel?: string }): string {
  const w = o.w ?? 334;
  const h = o.h ?? 150;
  const top = 20;
  const base = h - 18;
  const hours = o.days.length * 24;
  const xw = w / Math.max(1, hours);
  const usual = o.days.flatMap((d) => [...d.usual]);
  const got = o.days.flatMap((d) => [...d.got]);
  const ymax = Math.max(1, ...usual, ...got) * 1.05;
  const x = (i: number) => i * xw + xw / 2;
  const y = (v: number) => base - (v / ymax) * (base - top);
  let s = open(w, h, o.aria, 'data-y0="0"');
  s += `<path class="ghost" d="M${f1(x(0))} ${base}${usual.map((v, i) => `L${f1(x(i))} ${f1(y(v))}`).join('')}L${f1(x(hours - 1))} ${base}Z"/>`;
  o.days.forEach((d, i) => {
    if (i) s += `<line class="hair" x1="${f1(i * 24 * xw)}" x2="${f1(i * 24 * xw)}" y1="${top - 4}" y2="${base}"/>`;
    s += `<text x="${f1((i * 24 + 12) * xw)}" y="${h - 4}" text-anchor="middle" class="tick" aria-hidden="true">${esc(d.label)}</text>`;
  });
  s += `<line class="base" x1="0" x2="${w}" y1="${base + 0.5}" y2="${base + 0.5}"/>`;
  s += `<path class="line" d="${got.map((v, i) => `${i ? 'L' : 'M'}${f1(x(i))} ${f1(y(v))}`).join('')}"/>`;
  if (o.cut !== undefined) {
    const cx = o.cut * xw;
    s += `<line class="cut" x1="${f1(cx)}" x2="${f1(cx)}" y1="${top - 6}" y2="${base}"/>`;
    if (o.cutLabel) s += `<text x="${f1(cx + 4)}" y="${top - 8}" class="lbl-b">${esc(o.cutLabel)}</text>`;
  }
  if (o.floorLabel && o.floorAt !== undefined) s += `<text x="${f1(o.floorAt * xw)}" y="${base - 10}" text-anchor="middle" class="lbl-m lbl-halo">${esc(o.floorLabel)}</text>`;
  if (o.ghostLabel) s += `<text x="${w}" y="${top - 8}" text-anchor="end" class="lbl-m">${esc(o.ghostLabel)}</text>`;
  return `${s}</svg>`;
}

/** One row per check: today's failing rows (ink from 0) over the rule's usual range (band), on one shared count axis. */
export function ruleRows({ rules, w = 334, aria }: { rules: readonly { label: string; warns: boolean; rows: number; low: number | null; high: number | null; usualLabel: string; sev?: 'alert' | 'warn' | null }[]; w?: number; aria: string }): string {
  const rowH = 40;
  const cmax = Math.max(1, ...rules.flatMap((r) => [r.rows, r.high ?? 0])) * 1.06;
  const x = (v: number) => (v / cmax) * w;
  let s = open(w, rules.length * rowH, aria, 'data-y0="0"');
  rules.forEach((r, i) => {
    const y0 = i * rowH;
    if (i) s += `<line class="hair" x1="0" x2="${w}" y1="${y0 + 0.5}" y2="${y0 + 0.5}"/>`;
    s += `<text x="0" y="${y0 + 15}" class="lbl-b">${esc(r.label)}${r.warns ? `<tspan class="tag" dx="6">warns</tspan>` : ''}</text>`;
    s += `<text x="${w}" y="${y0 + 15}" text-anchor="end" class="lbl-m"><tspan class="lbl-b">${esc(r.rows.toLocaleString('en-US'))}</tspan> · ${esc(r.usualLabel)}</text>`;
    const by = y0 + 22;
    if (r.low !== null && r.high !== null && r.high > 0) s += `<rect class="ghost" x="${f1(x(r.low))}" y="${by}" width="${f1(Math.max(2, x(r.high) - x(r.low)))}" height="10" rx="2"/>`;
    s += `<line class="base" x1="0" x2="${w}" y1="${by + 5}" y2="${by + 5}"/>`;
    if (r.rows > 0) s += `<path class="${r.warns ? 'ink-outline' : r.sev ? `sev-${r.sev}-fill` : 'ink'}" d="${barPath(0, by + 2, Math.max(2, x(r.rows)), 6, 1.5)}"/>`;
  });
  return `${s}</svg>`;
}

/** The gate's reach: the source, the checks with their wall cap, and the outputs they didn't build (hatched). */
export function lineage({ source, step, outputs, w = 334, aria }: { source: string; step: string; outputs: readonly string[]; w?: number; aria: string }): string {
  const h = Math.max(1, outputs.length) * 30 + 4;
  const nodeY = h / 2 - 14;
  let s = open(w, h, aria);
  s += `<rect class="node" x="0" y="${f1(nodeY)}" width="64" height="28" rx="6"/><text x="32" y="${f1(nodeY + 18)}" text-anchor="middle" class="mono">${esc(source)}</text>`;
  s += `<line class="edge-t" x1="64" x2="84" y1="${f1(h / 2)}" y2="${f1(h / 2)}"/>`;
  s += `<rect class="node" x="84" y="${f1(nodeY)}" width="96" height="28" rx="6"/><text x="132" y="${f1(nodeY + 18)}" text-anchor="middle" class="mono">${esc(step)}</text>`;
  s += `<g transform="translate(184 ${f1(h / 2 - 8)})"><rect class="wall" x="0" y="0" width="3" height="16" rx="1"/><rect class="wall" x="5" y="0" width="3" height="16" rx="1"/></g>`;
  outputs.forEach((o, i) => {
    const oy = i * 30 + 2;
    s += `<path class="edge-t dash" d="M196 ${f1(h / 2)}C206 ${f1(h / 2)} 206 ${oy + 13} 216 ${oy + 13}"/>`;
    s += `<rect class="hatch-box" x="216" y="${oy}" width="${w - 216}" height="26" rx="6"/><text x="${f1(216 + (w - 216) / 2)}" y="${oy + 17}" text-anchor="middle" class="mono">${esc(o)}</text>`;
  });
  return `${s}</svg>`;
}

export interface Dumbbell {
  label: string;
  /** Shares (0-1): today, and the usual range. */
  today: number;
  low: number | null;
  high: number | null;
  todayLabel: string;
  usualLabel: string;
  sev?: 'alert' | 'warn' | null;
  fresh?: boolean;
  gone?: boolean;
}

/**
 * Values' shares as rows on one 0-100% scale (or a printed zoom when every share is small): the usual range as a band,
 * today as a dot joined to it by a line, so the direction reads without colour. A value gone today is a ×; a new one
 * has no band and a 'new' tag.
 */
export function dumbbellRows({ rows, w = 334, aria }: { rows: readonly Dumbbell[]; w?: number; aria: string }): string {
  const rowH = 30;
  const top = Math.max(0.0001, ...rows.flatMap((r) => [r.today, r.high ?? 0]));
  const scale = top > 0.4 ? 1 : top > 0.1 ? 0.5 : top > 0.02 ? 0.1 : Math.max(0.0001, Math.ceil(top * 1.2 * 1000) / 1000);
  const x = (v: number) => (Math.min(v, scale) / scale) * (w - 12) + 6;
  let s = open(w, rows.length * rowH + 14, aria, 'data-y0="0"');
  rows.forEach((r, i) => {
    const y = i * rowH + 12;
    s += `<text x="0" y="${y}" class="${r.sev ? 'lbl-b' : 'lbl-mid'}">${esc(r.label)}${r.fresh ? '<tspan class="tag" dx="6">new</tspan>' : ''}</text>`;
    s += `<text x="${w}" y="${y}" text-anchor="end" class="lbl-m"><tspan class="lbl-b">${esc(r.todayLabel)}</tspan>${r.usualLabel ? ` · ${esc(r.usualLabel)}` : ''}</text>`;
    const by = y + 9;
    s += `<line class="base" x1="6" x2="${w - 6}" y1="${by}" y2="${by}"/>`;
    if (r.low !== null && r.high !== null) {
      s += `<rect class="ghost-2" x="${f1(x(r.low))}" y="${by - 4}" width="${f1(Math.max(3, x(r.high) - x(r.low)))}" height="8" rx="3"/>`;
      const from = r.today < r.low ? x(r.low) : r.today > r.high ? x(r.high) : null;
      if (from !== null) s += `<line class="dumb" x1="${f1(from)}" x2="${f1(x(r.today))}" y1="${by}" y2="${by}"/>`;
    }
    if (r.gone) s += `<path class="gone-x" d="M${f1(x(0) - 3.5)} ${by - 3.5}l7 7M${f1(x(0) + 3.5)} ${by - 3.5}l-7 7"/>`;
    else s += `<circle class="dot${r.sev ? ` dot-${r.sev}` : ''}" cx="${f1(x(r.today))}" cy="${by}" r="4.5"/>`;
  });
  const sy = rows.length * rowH + 10;
  s += `<text x="6" y="${sy + 2}" class="tick" aria-hidden="true">0</text><text x="${w - 6}" y="${sy + 2}" text-anchor="end" class="tick" aria-hidden="true">${scale >= 1 ? '100%' : `${f1(scale * 100)}%`}</text>`;
  return `${s}</svg>`;
}

/**
 * A measure's or a time's quantiles on one axis: the usual 10th, 25th, 50th, 75th and 90th as light boxes, today's as
 * ink ticks, the one that moved in its severity with an arrow from its usual. End labels in words.
 */
export function quantileStrip(o: { today: readonly number[]; usual: readonly ({ low: number; high: number } | null)[]; moved?: number; sev?: 'alert' | 'warn' | null; fmt: (v: number) => string; ends: [string, string]; aria: string; w?: number }): string {
  const w = o.w ?? 334;
  const h = 44;
  const all = [...o.today, ...o.usual.flatMap((u) => (u ? [u.low, u.high] : []))].filter(Number.isFinite);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * (w - 16) + 8;
  let s = open(w, h, o.aria);
  s += `<line class="base" x1="0" x2="${w}" y1="18" y2="18"/>`;
  o.usual.forEach((u) => {
    if (u) s += `<rect class="ghost-2" x="${f1(x(u.low))}" y="12" width="${f1(Math.max(3, x(u.high) - x(u.low)))}" height="12" rx="2"/>`;
  });
  o.today.forEach((v, i) => {
    const moved = i === o.moved;
    s += `<rect class="${moved && o.sev ? `sev-${o.sev}-fill` : moved ? 'ink-strong' : 'ink'}" x="${f1(x(v) - (moved ? 2 : 1))}" y="${moved ? 6 : 9}" width="${moved ? 4 : 2}" height="${moved ? 24 : 18}" rx="1"/>`;
    const u = o.usual[i];
    if (moved && u) {
      const from = v < u.low ? x(u.low) : x(u.high);
      s += `<line class="dumb" x1="${f1(from)}" x2="${f1(x(v))}" y1="3" y2="3"/>`;
      s += `<text x="${f1(x(v))}" y="${h - 2}" text-anchor="middle" class="lbl-b">${esc(o.fmt(v))}</text>`;
    }
  });
  s += `<text x="0" y="${h - 2}" class="tick" aria-hidden="true">${esc(o.ends[0])}</text><text x="${w}" y="${h - 2}" text-anchor="end" class="tick" aria-hidden="true">${esc(o.ends[1])}</text>`;
  return `${s}</svg>`;
}

/** A share's micro dot on its usual range, for a folded row: 0-100% (or a zoom when small), today's dot, the band. */
export function microDot({ today, low, high, gone, w = 72 }: { today: number; low: number | null; high: number | null; gone?: boolean; w?: number }): string {
  const top = Math.max(today, high ?? 0, 0.0001);
  const scale = top > 0.4 ? 1 : top > 0.1 ? 0.5 : top > 0.02 ? 0.1 : Math.ceil(top * 1.2 * 1000) / 1000;
  const x = (v: number) => (Math.min(v, scale) / scale) * (w - 8) + 4;
  let s = `<svg class="viz micro" width="${w}" height="14" viewBox="0 0 ${w} 14" aria-hidden="true" data-y0="0"><line class="base" x1="4" x2="${w - 4}" y1="7" y2="7"/>`;
  if (low !== null && high !== null) s += `<rect class="ghost-2" x="${f1(x(low))}" y="3.5" width="${f1(Math.max(3, x(high) - x(low)))}" height="7" rx="2.5"/>`;
  s += gone ? `<path class="gone-x muted" d="M${f1(x(0) - 3)} 4l6 6M${f1(x(0) + 3)} 4l-6 6"/>` : `<circle class="dot" cx="${f1(x(today))}" cy="7" r="3.5"/>`;
  return `${s}</svg>`;
}

/**
 * A value far beyond everything else: the column's usual spread (its 1st to 99th percentile) as a box on the left, a
 * break, and the far value as a dot at the right end, labelled. The break says the scale isn't to size.
 */
export function farStrip({ lowLabel, highLabel, valueLabel, aria, w = 334, below = false }: { lowLabel: string; highLabel: string; valueLabel: string; aria: string; w?: number; below?: boolean }): string {
  const h = 40;
  const y = 20;
  const box = below ? [w * 0.42, w - 6] : [6, w * 0.58];
  const dot = below ? 10 : w - 10;
  const brk = below ? w * 0.27 : w * 0.73;
  let s = open(w, h, aria);
  s += `<line class="base" x1="0" x2="${f1(brk - 6)}" y1="${y}" y2="${y}"/><line class="base" x1="${f1(brk + 6)}" x2="${w}" y1="${y}" y2="${y}"/>`;
  s += `<path class="joint" d="M${f1(brk - 6)} ${y + 6}l4 -12M${f1(brk + 2)} ${y + 6}l4 -12"/>`;
  s += `<rect class="ghost-2" x="${f1(box[0]!)}" y="${y - 6}" width="${f1(box[1]! - box[0]!)}" height="12" rx="3"/>`;
  s += `<text x="${f1(box[0]!)}" y="${h - 1}" class="tick" aria-hidden="true">${esc(lowLabel)}</text><text x="${f1(box[1]!)}" y="${h - 1}" text-anchor="end" class="tick" aria-hidden="true">${esc(highLabel)}</text>`;
  s += `<circle class="dot dot-alert" cx="${f1(dot)}" cy="${y}" r="5.5"/><text x="${f1(dot)}" y="${y - 10}" text-anchor="${below ? 'start' : 'end'}" class="lbl-b">${esc(valueLabel)}</text>`;
  return `${s}</svg>`;
}

/**
 * A chain of links, left to right (the data's list → the file's bytes → the load → the outputs), each a node; the link
 * that broke is cut, its two ends labelled, and the nodes after it hatched: not built from these bytes.
 */
export function chain({ nodes, broken, w = 334, aria }: { nodes: readonly string[]; broken: number; w?: number; aria: string }): string {
  const h = 52;
  const n = nodes.length;
  const nw = Math.min(72, (w - (n - 1) * 14) / n);
  const gap = (w - n * nw) / Math.max(1, n - 1);
  let s = open(w, h, aria);
  nodes.forEach((label, i) => {
    const x = i * (nw + gap);
    const after = i > broken;
    s += `<rect class="${after ? 'hatch-box' : 'node'}" x="${f1(x)}" y="8" width="${f1(nw)}" height="28" rx="6"/><text x="${f1(x + nw / 2)}" y="26" text-anchor="middle" class="mono">${esc(label)}</text>`;
    if (i < n - 1) {
      const x1 = x + nw;
      const x2 = x1 + gap;
      if (i === broken) s += `<line class="edge-t" x1="${f1(x1)}" x2="${f1(x1 + gap / 2 - 4)}" y1="22" y2="22"/><line class="edge-t" x1="${f1(x1 + gap / 2 + 4)}" x2="${f1(x2)}" y1="22" y2="22"/><path class="gone-x" d="M${f1(x1 + gap / 2 - 4)} 16l8 12M${f1(x1 + gap / 2 + 4)} 16l-8 12"/>`;
      else s += `<line class="${i > broken ? 'joint' : 'base'}" x1="${f1(x1)}" x2="${f1(x2)}" y1="22" y2="22"/>`;
    }
  });
  return `${s}</svg>`;
}

/** A load's micro bar for the loads strip: its trips against its own usual range, on the strip's one scale. */
export function stripBar({ v, low, high, ymax, sev }: { v: number; low: number | null; high: number | null; ymax: number; sev?: 'alert' | 'warn' | null }): string {
  const H = 26;
  const W = 22;
  const y = (n: number) => H - (Math.min(n, ymax) / Math.max(1, ymax)) * H;
  let s = `<svg class="viz ld-bar" width="${W}" height="${H + 1}" viewBox="0 0 ${W} ${H + 1}" aria-hidden="true" data-y0="0">`;
  if (low !== null && high !== null) s += `<rect class="ghost" x="3" y="${f1(y(high))}" width="${W - 6}" height="${f1(Math.max(1, y(low) - y(high)))}" rx="2"/>`;
  s += `<path class="${sev ? `sev-${sev}-fill` : 'ink'}" d="${colPath(7, H, W - 14, Math.max(1.5, H - y(v)), 1.5)}"/>`;
  s += `<line class="base" x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}"/>`;
  return `${s}</svg>`;
}

/** The hatch pattern the 'not today's run' marks use: once per page. */
export const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><pattern id="viz-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="4" class="hatch-line"/></pattern></defs></svg>`;
