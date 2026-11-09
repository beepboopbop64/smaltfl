// The September 2023 episode in the app (ADR 0008): the strip's marks, the day's cause card, an incident opened on
// the cause and listed in History, and Friday held at the gate, told as its split with the gate under it.
//   node episode.cjs <appDir> <shotsDir>
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const root = process.argv[2]; const shots = process.argv[3];
fs.mkdirSync(shots, { recursive: true });
const page = fs.readFileSync(path.join(root, 'page.html'), 'utf8');
const skeleton = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>${page}</body></html>`;
const types = { '.js': 'text/javascript', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json' };
const server = http.createServer((req, res) => { const url = decodeURIComponent(req.url.split('?')[0]); if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(skeleton); const file = path.join(root, url); if (!fs.existsSync(file)) return res.writeHead(404).end(); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file)); });
const checks = []; const ok = (name, cond, more = '') => { checks.push([name, !!cond]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${more ? ` (${String(more).slice(0, 300)})` : ''}`); };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })).newPage();
  const problems = [];
  p.on('pageerror', (e) => problems.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${server.address().port}/`);
  // A run has ended when the status line's run number changes (data-run), whatever its words.
  const runNo = () => p.evaluate(() => document.querySelector('#status').dataset.run ?? '');
  const ran = async (before) => { await p.waitForFunction((b) => (document.querySelector('#status').dataset.run ?? '') !== b && !!document.querySelector('#status').dataset.state, before, { timeout: 180000 }); await p.waitForTimeout(1500); };
  await ran('');
  const chips = await p.locator('.episodes button').allTextContents();
  ok('three incidents to choose', chips.length === 4, chips.join(', '));
  let b = await runNo();
  await p.locator('.episodes button', { hasText: 'September 2023' }).click();
  await ran(b);
  const day = (wd, date) => p.locator('#loads button').filter({ has: p.locator('.ld-day', { hasText: new RegExp(`^${wd}$`) }) }).filter({ has: p.locator('.ld-date', { hasText: new RegExp(`^${date}$`) }) }).first();
  b = await runNo();
  await day('Thu', '21').click();
  await ran(b);
  await p.waitForTimeout(1500);
  const status = await p.locator('#status').textContent();
  // Round 4 (truth #1): everything but Flex Fare stopped by 13:06 and Flex Fare kept arriving, which the day's own rows
  // by hour and payment type say: the head names it, as Fri's "Only Flex Fare records arrived" does.
  ok('the header says the day’s head', /^Thu Sep 21: Only Flex Fare after 13:00$/.test(status), status);
  const marks = await p.$$eval('#loads button.load', (xs) => xs.map((x) => `${x.querySelector('.ld-date')?.textContent}:${x.querySelector('.ld-marks .g-alert') ? 'alert' : x.querySelector('.ld-marks .g-warn') ? 'warn' : '-'}${x.querySelector('.ld-marks .g-held') ? '‖' : ''}:${x.querySelector('svg.ld-bar') ? 'bar' : 'nobar'}`));
  ok('the strip marks Thu something wrong and paused, and leaves the days after it unmarked (ADR 0008 §10, 0009)', ['21:alert‖:bar', '22:-:bar', '23:-:bar', '24:-:bar', '19:-:bar'].every((m) => marks.includes(m)), marks.join(' '));
  const dots = await p.$$eval('.health-dot', (xs) => xs.map((x) => `${x.closest('g.card').dataset.card}:${x.getAttribute('class').replace('health-dot ', '')}`));
  ok('the trips card has a red dot', dots.includes('trips:alert'), dots.join(', '));
  await p.locator('g.card[data-card="trips"]').focus(); await p.keyboard.press('Enter');
  await p.waitForSelector('#sheet.drill:not([hidden]) .tab-panel:not([aria-busy])', { timeout: 60000 });
  const card = p.locator('#sheet section.vf-card').first();
  const head = (await card.locator('.vf-head').innerText()).trim();
  ok('the cause card leads with the hour the trips fall and the part that kept arriving', /^Only Flex Fare after 13:00$/.test(head), head);
  ok('its hero is the hour bars, labelled on the marks', (await card.locator('svg.viz[aria-label*="Trips by hour"] text').allTextContents()).some((t) => /13:00/.test(t)));
  // The hour bars stack the two parts and key them (truth #1); the split's own bar stays in the detail (numbers #11).
  const keyed = await card.locator('svg.viz[aria-label*="Trips by hour"] text').allTextContents();
  ok('the hour bars key the part that kept arriving and everything else, and no split bar sits beside them', keyed.includes('Flex Fare') && keyed.includes('everything else') && (await card.locator('svg.viz[aria-label*="records:"]').count()) === 0 && /whole day\s*−\d+%/.test(await card.innerText()), keyed.join(' | '));
  await p.screenshot({ path: path.join(shots, 'sep21-news.png') });
  // Open an incident on the cause, with a note.
  // On a paused day the one verb is Decide (ADR 0009 §12); opening an incident sits behind ⋯.
  if (!(await card.getByRole('button', { name: /^Open an incident/ }).first().isVisible())) await card.locator('button.vf-more').first().click();
  await card.getByRole('button', { name: /^Open an incident/ }).first().click();
  await card.locator('input.note-in').fill('TLC feed stopped mid-day; asked the data team');
  await card.getByRole('button', { name: 'Open it' }).click();
  await p.waitForTimeout(1500);
  const after = (await p.locator('#sheet .tab-panel').innerText()).replace(/\s+/g, ' ');
  ok('the cause card shows the incident and the note', /opened an incident.*TLC feed stopped mid-day/i.test(after), after.match(/(opened|incident)[^.]{0,120}/i)?.[0]);
  ok('it offers to resolve it', /Resolve the incident/.test(after) || /Resolve the incident/.test((await card.locator('button.vf-more').first().getAttribute('aria-label').catch(() => '')) ?? ''));
  await p.locator('#sheet .tabs button', { hasText: 'History' }).click();
  await p.waitForSelector('#sheet .tab-panel:not([aria-busy])');
  const hist = (await p.locator('#sheet .tab-panel').innerText()).replace(/\s+/g, ' ');
  ok('the history lists the incident as open', /incident open/i.test(hist), hist.match(/Incidents[^]{0,200}/)?.[0]);
  ok('the history draws every day as a calendar', (await p.locator('#sheet svg.viz.cal').count()) === 1);
  await p.screenshot({ path: path.join(shots, 'sep21-history.png') });
  await p.locator('#sheet button.close').click();
  await p.waitForTimeout(500);
  // Friday: held at the gate.
  b = await runNo();
  await day('Fri', '22').click();
  await ran(b);
  const st2 = await p.locator('#status').textContent();
  ok('Friday: the header says the day’s head', /^Fri Sep 22: Only Flex Fare records arrived$/.test(st2), st2);
  await p.locator('g.card[data-card="trips"]').focus(); await p.keyboard.press('Enter');
  await p.waitForSelector('#sheet.drill:not([hidden]) .tab-panel:not([aria-busy])', { timeout: 60000 });
  await p.locator('#sheet .tabs button', { hasText: 'News' }).click();
  await p.waitForSelector('#sheet .tab-panel:not([aria-busy]) .news-tab', { timeout: 60000 });
  // Paused, not failed (ADR 0009): another tab shows the day's own staged rows under a bar naming what readers see.
  await p.locator('#sheet .tabs button', { hasText: 'Data' }).click();
  await p.waitForSelector('#sheet .tab-panel:not([aria-busy])', { timeout: 60000 });
  const dataTab = (await p.locator('#sheet .tab-panel').innerText()).replace(/\s+/g, ' ');
  ok('Friday, on any tab: paused, with whose rows are shown', /Fri 22 paused · readers see \w{3} \d+/.test(dataTab), dataTab.slice(0, 160));
  await p.locator('#sheet .tabs button', { hasText: 'News' }).click();
  await p.waitForSelector('#sheet .tab-panel:not([aria-busy]) .news-tab', { timeout: 60000 });
  const fri = (await p.locator('#sheet .tab-panel').innerText()).replace(/\s+/g, ' ');
  ok('Friday: only the Flex Fare records arrived, day 2 with the trips short so far', /Only Flex Fare records arrived/.test(fri) && /Day 2 · ~187k short/.test(fri), fri.slice(0, 300));
  ok('Friday: everything else 20, usual ~110k', /Everything else/.test(fri) && /\b20 · usual ~1\d\dk/.test(fri), fri.slice(0, 400));
  ok('Friday: the checks held the run too, its rows against a usual Friday', /Paused by trips, checks/.test(fri) && /45\.7% of arrived rows dropped/.test(fri) && /35\.7 pt over/.test(fri) && /limit 10%/.test(fri) && /2,116 rows dropped/.test(fri) && /usual \d/.test(fri), fri.slice(0, 500));
  ok('Friday: paused, what readers see, its outputs named, and the rest folded', /readers see \w{3} \d+/.test(fri) && /zone_hour/.test(fri) && /borough_hour/.test(fri) && /weather_effect/.test(fri) && /[A-Z][\w ]+ share \+ \d+ more/.test(fri), fri.slice(380, 900));
  const words = fri.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  // Round 3 (pause-everywhere #12): the pause is said at the top of the tab ("Paused · readers see Wed 20", why that
  // day: "Thu paused", Decide), and the card's row no longer repeats readers' day and Decide: 3 words more in all.
  ok('Friday: the News tab is under 78 words', words <= 78, `${words} words`);
  ok('Friday: the day’s count is drawn on its track', /4,633/.test(fri) && (await p.locator('#sheet svg.viz text.count').count()) === 1);
  await p.screenshot({ path: path.join(shots, 'sep22-news.png') });
  // A tap on the cause opens its detail: a waterfall and the part's own days.
  await p.locator('#sheet section.vf-card .vf-hero').first().click();
  await p.waitForSelector('.vf-detail', { timeout: 10000 });
  const det = (await p.locator('.vf-detail').innerText()).replace(/\s+/g, ' ');
  ok('the cause’s detail draws a waterfall and the part’s days', (await p.locator('.vf-detail svg.viz').count()) >= 3 && /From a usual day to this one/.test(det), det.slice(0, 200));
  await p.screenshot({ path: path.join(shots, 'sep22-detail.png') });
  console.log('problems:', problems.join(' // ') || 'none');
  console.log(`${checks.filter((c) => c[1]).length}/${checks.length} passed`);
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
