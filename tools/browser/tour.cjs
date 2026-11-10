// Drive the built smaltfl app at phone size and capture what each view shows.
//
//   node tour.cjs <appDir> <outDir> <stops.json>
//   TOUR_SCALE=2 node tour.cjs …           the same at twice the pixels, for screenshots a person will look at
//
// stops.json: an array of stops, visited in order in one page:
//   { "name": "sep22-trips-news",        file name for the screenshot and the metrics
//     "episode": "September 2023",       optional: the episode chip to pick ("January 2024" for the month)
//     "day": "Fri 22",                    optional: the day button in the loads strip ("<Weekday> <date>")
//     "card": "trips_profile",           optional: the card whose drill-down to open (none: the canvas)
//     "tab": "News",                      optional: the drill-down tab
//     "full": true,                       optional: capture the whole sheet, not just the first screen
//     "scheme": "dark",                   optional: "light" (default) or "dark"
//     "mask": "letters",                  optional: mask the text ("letters": keep digits; "all"); reloads after
//     "click": "#sheet .vf-hero",         optional: tap this first (a detail sheet opens), then capture
//     "clicks": ["sel", ...],             optional: tap each in order, settling ~900 ms (or a run) after each
//     "reload": true,                     optional: reload the page first, keeping IndexedDB, and settle
//     "view": "runs",                     optional: show a view (#runs, #policies, ...) before capturing
//     "viewFirst": true,                  optional: show the view before the clicks, not after
//     "select": ["#viewer", "ana"],       optional: choose a value in a select (after the card opens)
//     "download": "sel",                  optional: tap this and save the download into outDir
//     "unfold": ["nb-posture"],           optional: notebook boxes to unfold first, so their steps are cards on the canvas
//     "box": "nb-summary",                optional: the notebook box whose sheet to open and capture
//     "what": "Tue Mar 12, the brief",    optional: what the stop shows, copied into metrics.json for a judge to read
//     "expect": { ... } }                 optional: checks, each failure a problem (below)
//
// expect (each optional; text is the captured scope's innerText, whitespace folded):
//   "state": "held"                       #status[data-state] equals this
//   "title": "^‖ ", "noTitle": "‖"        document.title matches / doesn't match (regexes)
//   "status": "^Thu Sep 21"               the status line's text matches
//   "text": ["…"], "noText": ["…"]        each string is / none is in the scope's text
//   "pageText": ["…"], "noPageText": [""]  the same over the whole page's text
//   "maxWords": 45, "minCharts": 2        the scope's word count, its charts (as the metrics count them)
//   "count": { "sel": n }                 exactly n visible elements match in the page
//   "disabled": ["sel"], "enabled": [..]  the first visible match is (not) disabled
//   "cards": { "zone_hour": "‖|…" }       a canvas card's line (text.what) contains the text; a leading "‖|", "⚑|"
//                                         or "✕|" also needs the card's glyph mark (.card-mark) present; "-|" none
//   "loads": { "Thu 21": ", paused" }     a loads-strip day's aria-label contains this ("!…": doesn't)
//   "words": { "sel": max }               words outside drawings in the first visible match, at most max
//
// Writes <outDir>/<name>.png and <outDir>/metrics.json: per stop, the status line, the visible text of the
// sheet (or the canvas page), its word count, its paragraphs of more than 25 words, the number of charts
// (svg/canvas) and the words before the first chart.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [root, out, stopsFile] = process.argv.slice(2);
if (!root || !out || !stopsFile) {
  console.error('usage: node tour.cjs <appDir> <outDir> <stops.json>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const stops = JSON.parse(fs.readFileSync(stopsFile, 'utf8'));
const page = fs.readFileSync(path.join(root, 'page.html'), 'utf8');
const skeleton = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>${page}</body></html>`;
const types = { '.js': 'text/javascript', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(skeleton);
  const file = path.join(root, url);
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
});

const WEEKDAY = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun' };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const metrics = [];
  let ctx = null;
  let p = null;
  let scheme = null;
  let episode = null;
  const problems = [];
  // The status line's run number and state (data-run, data-state), with its words: what changed after a step.
  const status = () => p.evaluate(() => { const el = document.querySelector('#status'); return `${el?.dataset.run ?? ''}|${el?.dataset.state ?? ''}|${el?.textContent ?? ''}`; });
  const settled = async (before) => {
    // A click that starts nothing (the episode already shown) settles at once: wait 4 s for a run or a fetch to start.
    const started = await p.waitForFunction((was) => {
      const el = document.querySelector('#status');
      const text = el?.textContent ?? '';
      return (el?.dataset.run ?? '') !== was.split('|')[0] || /Running|Fetching/.test(text) || text !== was.split('|').slice(2).join('|');
    }, before, { timeout: 4000 }).then(() => true, () => false);
    if (!started && before !== '') return;
    // Settled when a new run has finished (its number on the status line changed), or a refused file says so.
    await p.waitForFunction((was) => {
      const el = document.querySelector('#status');
      const run = el?.dataset.run ?? '';
      const text = el?.textContent ?? '';
      return (run !== '' && run !== was.split('|')[0]) || (text !== was.split('|').slice(2).join('|') && /isn.t the file|refused|couldn/i.test(text));
    }, before, { timeout: 180000 }).catch(() => {});
    await p.waitForTimeout(2500);
  };
  const open = async (wanted) => {
    if (ctx && scheme === wanted) return;
    if (ctx) await ctx.close();
    scheme = wanted;
    episode = null;
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: Number(process.env.TOUR_SCALE || 1), colorScheme: wanted, acceptDownloads: true });
    p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && problems.push(`console ${m.text()}`));
    await p.goto(url);
    await settled('');
  };
  for (const stop of stops) {
    try {
      await open(stop.scheme === 'dark' ? 'dark' : 'light');
      if (stop.reload) {
        await p.reload();
        episode = null;
        await settled('');
      }
      if ((await p.evaluate(() => location.hash)) !== '') {
        await p.evaluate(() => { location.hash = ''; });
        await p.waitForTimeout(600);
      }
      // Close any open detail and sheet first.
      if (await p.locator('.vf-detail-wrap').count()) await p.locator('.vf-detail button.close').first().click().catch(() => {});
      if (await p.locator('#sheet:not([hidden]) button.close').count()) await p.locator('#sheet button.close').first().click().catch(() => {});
      if (stop.episode && stop.episode !== episode) {
        const chip = p.locator('.episodes button', { hasText: stop.episode });
        if (await chip.count()) {
          const before = await status();
          await chip.first().click();
          await settled(before);
        } else if (stop.episode !== 'January 2024') {
          problems.push(`no episode chip "${stop.episode}"`);
        }
        episode = stop.episode;
      }
      if (stop.day) {
        const [wd, date] = stop.day.split(/\s+/);
        const btn = p.locator('#loads button').filter({ has: p.locator('.ld-day', { hasText: new RegExp(`^${WEEKDAY[wd] ?? wd}$`) }) }).filter({ has: p.locator('.ld-date', { hasText: new RegExp(`^${date}$`) }) });
        // A week at a time: page forward (the strip's lone ›) until the day shows.
        for (let page = 0; page < 6 && !(await btn.count()); page++) {
          const next = p.locator('#loads button', { hasText: /^\s*›\s*$/ });
          if (!(await next.count()) || (await next.first().isDisabled())) break;
          await next.first().click();
          await p.waitForTimeout(400);
        }
        if (await btn.count()) {
          const before = await status();
          await btn.first().click();
          await settled(before);
        } else {
          problems.push(`no day button "${stop.day}" (${(await p.locator('#loads button').allTextContents()).slice(0, 12).join(' | ')})`);
        }
      }
      // A notebook is a box on the canvas (ADR 0011 §6): its steps are cards only once it is unfolded.
      for (const box of stop.unfold ?? []) {
        const el = p.locator(`g.card[data-card="${box}"]`);
        if (!(await el.count())) continue;
        await el.first().focus();
        await p.keyboard.press('Enter');
        await p.waitForSelector('#sheet:not([hidden]) .nb-actions button', { timeout: 20000 });
        const show = p.locator('#sheet .nb-actions button', { hasText: 'Show its steps' });
        if (await show.count()) await show.first().click();
        await p.locator('#sheet button.close').first().click().catch(() => {});
        await p.waitForSelector('#sheet', { state: 'hidden', timeout: 20000 }).catch(() => {});
      }
      if (stop.box) {
        await p.locator(`g.card[data-card="${stop.box}"]`).first().focus();
        await p.keyboard.press('Enter');
        await p.waitForSelector('#sheet:not([hidden]) .nb', { timeout: 20000 });
      }
      if (stop.select) {
        await p.selectOption(stop.select[0], stop.select[1]);
        await p.waitForTimeout(1500);
      }
      if (stop.card) {
        await p.locator(`g.card[data-card="${stop.card}"]`).focus();
        await p.keyboard.press('Enter');
        await p.waitForSelector('#sheet:not([hidden]) .tab-panel:not([aria-busy])', { timeout: 60000 });
        if (stop.tab) {
          const tab = p.locator('#sheet .tabs button', { hasText: stop.tab });
          if (await tab.count()) {
            await tab.first().click();
            await p.waitForSelector('#sheet .tab-panel:not([aria-busy])', { timeout: 60000 });
          } else problems.push(`${stop.name}: no tab "${stop.tab}" (${(await p.locator('#sheet .tabs button').allTextContents()).join(' | ')})`);
        }
        await p.waitForTimeout(700);
      }
      // A view shown before its taps ("viewFirst": the Runs view's ribbon), else after them.
      if (stop.view && stop.viewFirst) {
        await p.evaluate((v) => { location.hash = v === 'flow' ? '' : `#${v}`; }, stop.view);
        await p.waitForTimeout(1500);
      }
      // Optionally tap something first (a hero, a fold row): the sheet it opens is what is captured.
      if (stop.click) {
        const target = p.locator(stop.click).first();
        if (await target.count()) {
          await target.click();
          await p.waitForTimeout(900);
        } else problems.push(`${stop.name}: nothing to click at ${stop.click}`);
      }
      for (const sel of stop.clicks ?? []) {
        const target = p.locator(sel).first();
        if (await target.count()) {
          const before = await status();
          await target.click();
          await p.waitForTimeout(900);
          if ((await status()).split('|')[0] !== before.split('|')[0] || /Running|Fetching/.test(await status())) await settled(before);
        } else problems.push(`${stop.name}: nothing to click at ${sel}`);
      }
      if (stop.view && !stop.viewFirst) {
        await p.evaluate((v) => { location.hash = v === 'flow' ? '' : `#${v}`; }, stop.view);
        await p.waitForTimeout(1500);
      }
      if (stop.download) {
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator(stop.download).first().click()]);
        const to = path.join(out, dl.suggestedFilename());
        await dl.saveAs(to);
        console.log(`${stop.name}: saved ${to}`);
      }
      const scope = (stop.click || stop.clicks) && (await p.locator('.vf-detail').count()) ? '.vf-detail' : stop.card || stop.box ? '#sheet' : 'body';
      const m = await p.evaluate((sel) => {
        const el = document.querySelector(sel);
        const text = (el?.innerText ?? '').replace(/\s+/g, ' ').trim();
        const words = (t) => (t.match(/[A-Za-z0-9’'%.,:–-]+/g) ?? []).filter((w) => /[A-Za-z0-9]/.test(w)).length;
        const long = [...(el?.querySelectorAll('p, li, dd, h3') ?? [])].filter((x) => x.offsetParent !== null).map((x) => x.innerText.replace(/\s+/g, ' ').trim()).filter((t) => words(t) > 25);
        const charts = [...(el?.querySelectorAll('svg, canvas') ?? [])].filter((x) => x.getBoundingClientRect().width > 60 && x.getBoundingClientRect().height > 24 && x.offsetParent !== null);
        // Words before the first chart, in document order.
        let before = 0;
        if (el && charts[0]) {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (n === charts[0]) break;
            if (n.nodeType === 3 && n.parentElement?.offsetParent !== null && !n.parentElement.closest('svg')) before += words(n.textContent);
          }
        }
        const height = sel === 'body' ? document.documentElement.scrollHeight : Math.max(el?.scrollHeight ?? 0, ...[...(el?.querySelectorAll('*') ?? [])].slice(0, 3000).map((x) => (x.scrollHeight > x.clientHeight + 4 && getComputedStyle(x).overflowY !== 'visible' ? x.scrollHeight : 0)));
        return { text, words: words(text), longParagraphs: long, charts: charts.length, wordsBeforeFirstChart: charts[0] ? before : null, height };
      }, scope);
      m.name = stop.name;
      if (stop.what) m.what = stop.what;
      m.status = (await status()).split('|').slice(2).join('|');
      m.state = (await status()).split('|')[1];
      m.title = await p.title();
      // The capture is of the day it is named for: the status line starts "Ddd Mon D:".
      if (stop.day && !stop.select) {
        const [wd, date] = stop.day.split(/\s+/);
        if (!new RegExp(`^${wd} [A-Z][a-z]{2} ${date}\\b`).test(m.status)) problems.push(`${stop.name}: status "${m.status.slice(0, 40)}" is not ${stop.day}`);
      }
      if (stop.expect) {
        const x = stop.expect;
        const fail = (why) => problems.push(`${stop.name}: ${why}`);
        if (x.state !== undefined && m.state !== x.state) fail(`state "${m.state}", expected "${x.state}"`);
        if (x.title && !new RegExp(x.title).test(m.title)) fail(`title "${m.title}" doesn't match /${x.title}/`);
        if (x.noTitle && new RegExp(x.noTitle).test(m.title)) fail(`title "${m.title}" matches /${x.noTitle}/`);
        if (x.status && !new RegExp(x.status).test(m.status)) fail(`status "${m.status.slice(0, 60)}" doesn't match /${x.status}/`);
        for (const t of x.text ?? []) if (!m.text.includes(t)) fail(`no "${t}" in the ${scope} text`);
        for (const t of x.noText ?? []) if (m.text.includes(t)) fail(`"${t}" in the ${scope} text`);
        if (x.pageText || x.noPageText) {
          const all = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
          for (const t of x.pageText ?? []) if (!all.includes(t)) fail(`no "${t}" on the page`);
          for (const t of x.noPageText ?? []) if (all.includes(t)) fail(`"${t}" on the page`);
        }
        if (x.maxWords !== undefined && m.words > x.maxWords) fail(`${m.words} words, at most ${x.maxWords}`);
        if (x.minCharts !== undefined && m.charts < x.minCharts) fail(`${m.charts} charts, at least ${x.minCharts}`);
        const visibleAll = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length, sel);
        for (const [sel, n] of Object.entries(x.count ?? {})) { const c = await visibleAll(sel); if (c !== n) fail(`${c} × ${sel}, expected ${n}`); }
        // The first visible match: whether it is disabled, and its words outside drawings (visible text nodes not in an
        // svg; a drawing's labels are budgeted in the Node tests), and all its words.
        const firstVisible = (sel) => p.evaluate((s) => {
          const e = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (!e) return null;
          const count = (t) => (t.match(/[A-Za-z0-9’'%.,:–-]+/g) ?? []).filter((w) => /[A-Za-z0-9]/.test(w)).length;
          let out = 0;
          const prose = [];
          const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement;
            if (!el || el.closest('svg') || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
            if (el.closest('[hidden]')) continue;
            out += count(n.textContent);
            if (n.textContent.trim()) prose.push(n.textContent.trim());
          }
          return { disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true', words: out, all: count(e.innerText), text: prose.join(' ') };
        }, sel);
        for (const sel of x.disabled ?? []) { const e = await firstVisible(sel); if (!e) fail(`no ${sel} to be disabled`); else if (!e.disabled) fail(`${sel} is enabled, expected disabled`); }
        for (const sel of x.enabled ?? []) { const e = await firstVisible(sel); if (!e) fail(`no ${sel} to be enabled`); else if (e.disabled) fail(`${sel} is disabled, expected enabled`); }
        for (const [sel, max] of Object.entries(x.words ?? {})) {
          const e = await firstVisible(sel);
          if (!e) fail(`no ${sel} to count`);
          else {
            (m.glance ??= {})[sel] = { words: e.words, all: e.all, text: e.text };
            if (e.words > max) fail(`${e.words} words in ${sel} outside drawings ("${e.text.slice(0, 100)}…"), at most ${max}`);
          }
        }
        for (const [card, want] of Object.entries(x.cards ?? {})) {
          const got = await p.evaluate((c) => { const g = document.querySelector(`g.card[data-card="${c}"]`); return g ? { line: g.querySelector('text.what')?.textContent ?? '', mark: !!g.querySelector('.card-mark') } : null; }, card);
          const [, needMark, text] = /^(?:([‖⚑✕◧◐-])\|)?(.*)$/.exec(want);
          if (!got) fail(`no card ${card}`);
          else {
            if (!got.line.includes(text)) fail(`card ${card} reads "${got.line}", expected "${text}"`);
            if (needMark && needMark !== '-' && !got.mark) fail(`card ${card} has no mark, expected ${needMark}`);
            if (needMark === '-' && got.mark) fail(`card ${card} has a mark, expected none`);
          }
        }
        for (const [d, want] of Object.entries(x.loads ?? {})) {
          const [wd, date] = d.split(/\s+/);
          const label = await p.evaluate(([w, n]) => { const b = [...document.querySelectorAll('#loads button')].find((e) => e.querySelector('.ld-day')?.textContent === w && e.querySelector('.ld-date')?.textContent === n); return b?.getAttribute('aria-label') ?? null; }, [wd, date]);
          const not = want.startsWith('!');
          const t = not ? want.slice(1) : want;
          if (label === null) fail(`no loads-strip day ${d}`);
          else if (not ? label.includes(t) : !label.includes(t)) fail(`loads ${d} reads "${label}", expected ${not ? 'no ' : ''}"${t}"`);
        }
      }
      if (stop.mask) {
        await p.addScriptTag({ path: path.join(__dirname, 'mask.js') });
        await p.evaluate((mode) => window.__maskText(mode), stop.mask);
      }
      const shot = path.join(out, `${stop.name}.png`);
      if (stop.full && m.height > 844) {
        await p.setViewportSize({ width: 390, height: Math.min(9000, m.height + 160) });
        await p.waitForTimeout(400);
        await p.screenshot({ path: shot });
        await p.setViewportSize({ width: 390, height: 844 });
        await p.waitForTimeout(200);
      } else await p.screenshot({ path: shot });
      m.screenshot = shot;
      metrics.push(m);
      if (stop.mask) await p.evaluate(() => window.__unmaskText());
      console.log(`${stop.name}: ${m.words} words, ${m.charts} charts, ${m.longParagraphs.length} long paragraphs, ${m.wordsBeforeFirstChart ?? '-'} words before the first chart; state ${m.state}; title "${m.title}"`);
    } catch (e) {
      problems.push(`${stop.name}: ${e.message.split('\n')[0]}`);
      console.log(`${stop.name}: FAILED ${e.message.split('\n')[0]}`);
    }
  }
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify({ metrics, problems }, null, 1));
  console.log(`problems: ${problems.length ? problems.join(' // ') : 'none'}`);
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
