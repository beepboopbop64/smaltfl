/**
 * The story on the real history (ADR 0008): the heads the incident days and the calm days should get. Runs when the
 * app has been built from the data branch (npm run build:app writes dist/app/data/history.json); skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HistoryRanges, type HistoryFile } from '../src/core/history.js';
import { newsOf, type Names } from '../src/core/news.js';
import { lacked, reachLabel, shortfall, type EpisodeDay } from '../src/core/days.js';
import { afterLine, decisionDrawing, pausedGlance, pauseLines, receiptLines, sheetText, sheetWords, versionLines } from '../src/core/decision.js';
import { donorChoices, fillCounts, missingOf, offersOf } from '../src/core/fill.js';
import { dayClaim, type HistoryRef } from '../src/core/hold.js';
import { exampleFilled } from './helpers/example.js';
import { meaningOf, propertyOf } from '../src/core/ontology.js';
import { CELL_KINDS, countRange, fallParts, fallSteps, gateHead, gateLabels, glanceStrings, partLabel, ruleOrder, ruleUsual, splitSentence, splitSteps, storyOf, wordsIn, type HourValues } from '../src/core/story.js';

const HISTORY = new URL('../dist/app/data/history.json', import.meta.url);
const has = existsSync(HISTORY) && (JSON.parse(readFileSync(HISTORY, 'utf8')) as HistoryFile).days.length > 400;

describe.skipIf(!has)('the story on the real history', () => {
  const file = has ? (JSON.parse(readFileSync(HISTORY, 'utf8')) as HistoryFile) : null;
  const doc = JSON.parse(readFileSync(new URL('../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8'));
  const prop = (c: string) => propertyOf(doc.ontology, 'trips', c);
  const names: Names = {
    column: (c) => prop(c)?.title ?? c,
    value: (c, v) => {
      const m = meaningOf(prop(c), v);
      return m ? `${String(v)} (${m})` : String(v);
    },
    label: (c, v) => meaningOf(prop(c), v) ?? String(v),
    noun: (n) => (n === 1 ? 'trip' : 'trips'),
  };
  const h = file ? new HistoryRanges(file) : null;
  const story = (day: string) => storyOf(h!, day, newsOf(h!, day, names), { names, step: 'trips_valid', limit: 0.1 });

  it('tells Thu Sep 21, 2023 from the history alone as the hour the trips fall, to the trickle that still came', () => {
    // Without the load's own rows by hour and value (a day not run here, and the claim its run is judged by): the
    // history's hours alone, which can't say which trips kept coming. With them, below, the head names Flex Fare.
    const s = story('2023-09-21');
    // The head says the trips fell to a trickle, so the fall can't read as the file cut off: ~330 an hour still came,
    // 3,679 of a usual ~80k, which the chart's zoom says.
    expect(s.head).toBe('Trips fall to trickle from 13:00');
    expect(s.split).toMatchObject({ kind: 'held', name: 'Flex Fare' });
    // The trips go on after the fall (~330 an hour), the missing trips are counted, and the day's own change is on
    // the amount line, named as the whole day's so it can't fight the head; the morning ran close to usual (no label).
    // The detail's sentence says the others fell from 13:00, never that they almost stopped.
    expect(s.hoursLabels).toEqual({ cut: '13:00', floor: 'still ~330/h', missing: '~77k fewer', ghost: 'usual Thursday', before: null, kept: null, rest: null });
    expect(s.labels.amount).toEqual(['41,939 trips', 'whole day −65%', 'usual 89k–160k']);
    expect(splitSentence(s)).toBe('Flex Fare as usual (4,657; usual 2.8k–5.4k); everything else fell from 13:00 (37,282; usual ~115k).');
  });

  // The two hour-fall days' Flex Fare trips (payment type 0) by pickup hour, counted from their day files (the loads
  // the app runs; scratch hourfall/truth.md): every other payment stopped by 13:06 on Thu Sep 21, 2023 (633 that hour,
  // 37 in the rest of the day), and at 15:00 on Sat Sep 17, 2022 (none after), while Flex Fare kept arriving.
  const FLEX: Record<string, number[]> = {
    '2023-09-21': [96, 36, 25, 16, 44, 72, 155, 333, 351, 203, 121, 81, 115, 109, 150, 206, 242, 313, 313, 272, 275, 390, 392, 347],
    '2022-09-17': [321, 311, 256, 183, 83, 42, 54, 55, 90, 119, 140, 189, 235, 218, 189, 180, 196, 261, 286, 335, 315, 228, 250, 342],
  };
  // The load's rows by hour and payment type, as the app counts them from the day's own rows (every other payment
  // together under one value: only the totals and Flex Fare's matter here).
  const byHour = (day: string): HourValues => {
    const got = file!.hours![file!.days.indexOf(day)]!;
    return { column: 'payment_type', values: { '0': FLEX[day]!, '1': got.map((n, i) => n - FLEX[day]![i]!) } };
  };
  const told = (day: string) => storyOf(h!, day, newsOf(h!, day, names), { names, step: 'trips_valid', limit: 0.1, byHour: byHour(day) });

  it('heads an hour fall by the part that kept arriving when the load’s rows say everything else stopped (Sep 21, 2023; Sep 17, 2022)', () => {
    // The day files' hours are the history's, hour by hour: the counts add up.
    for (const d of Object.keys(FLEX)) expect(byHour(d).values['0']!.map((n, i) => n + byHour(d).values['1']![i]!)).toEqual(file!.hours![file!.days.indexOf(d)]);
    const thu = told('2023-09-21');
    expect(thu.head).toBe('Only Flex Fare after 13:00');
    expect(thu.kept).toMatchObject({ column: 'payment_type', value: '0', name: 'Flex Fare' });
    expect(thu.kept!.rest.slice(13)).toEqual([633, 0, 0, 2, 2, 4, 7, 8, 3, 7, 4]);
    expect(thu.hoursLabels).toEqual({ cut: '13:00', floor: 'still ~330/h', missing: '~77k fewer', ghost: 'usual Thursday', before: null, kept: 'Flex Fare', rest: 'everything else' });
    expect(splitSentence(thu)).toBe('Flex Fare kept arriving (4,657; usual 2.8k–5.4k); everything else stopped after 13:00 (37,282; usual ~115k).');
    const sat = told('2022-09-17');
    expect(sat.head).toBe('Only Flex Fare after 15:00');
    expect(sat.kept!.rest.slice(15).every((n) => n === 0)).toBe(true);
    expect(sat.hoursLabels).toMatchObject({ cut: '15:00', missing: '~52k fewer', before: '~8.3k above usual', kept: 'Flex Fare', rest: 'everything else' });
    // Within the budgets, at a glance and paused, and every number the chart prints is its own (story.ts hoursLabels).
    for (const s of [thu, sat]) {
      expect([...glanceStrings(s), reachLabel(s, 3)].reduce((t, x) => t + wordsIn(x), 0), s.day).toBeLessThanOrEqual(60);
      expect([...glanceStrings(s).filter((x) => x !== s.labels.primary), 'Decide', reachLabel(s, 3, 'waiting')].reduce((t, x) => t + wordsIn(x), 0), s.day).toBeLessThanOrEqual(60);
      expect(s.labels.hero.join(' ')).not.toMatch(/still|trickle/);
    }
    // The history alone (a day not run here, the claim a run is judged by) tells it as before.
    expect(story('2023-09-21').head).toBe('Trips fall to trickle from 13:00');
    expect(story('2023-09-21').kept).toBeNull();
  });

  it('names each figure of an hour-fall day by its window, and the detail’s waterfall says the same (Sat Sep 17, 2022)', () => {
    const s = story('2022-09-17');
    expect(s.head).toBe('Trips fall to trickle from 15:00');
    // ~52k fewer from 15:00; the morning ~8.3k above a usual Saturday's; the whole day −42%: they add up.
    expect(s.hoursLabels).toMatchObject({ missing: '~52k fewer', before: '~8.3k above usual' });
    expect(s.labels.amount).toEqual(['59,501 trips', 'whole day −42%', 'usual 91k–118k']);
    const steps = fallSteps(s)!;
    expect(steps.map((x) => x.name)).toEqual(['Usual', 'before 15:00', 'from 15:00', 'Today']);
    expect(steps.map((x) => x.label)).toEqual(['103,349', '+8,283', '−52,131', '59,501']);
    expect(steps[1]!.usual).toBe(true);
    expect(steps[0]!.value + steps[1]!.value + steps[2]!.value).toBe(steps[3]!.value);
    expect(fallParts(s.hours!, s.amount!)).toEqual({ before: 8_283, after: -52_131 });
    // A gap that ends before midnight is told by its window, with no waterfall of its own.
    expect(fallSteps(story('2022-01-29'))).toBeNull();
    // A part that held within its range is drawn neutral in its split's waterfall: Fri Sep 22, 2023's Flex Fare.
    expect(splitSteps(story('2023-09-22'))![2]).toMatchObject({ name: 'Flex Fare', usual: true });
    expect(splitSteps(story('2023-09-22'))![1]!.usual).toBeUndefined();
  });

  it('counts an episode’s shortfall only to the day on screen, the day it began as its head does (ADR 0008 §10)', () => {
    const trips = h!.of({ of: 'trips' })!;
    const ep = (first: string, viewed: string) => {
      const fall = story(first).hours!;
      const days: EpisodeDay[] = file!.days.filter((d) => d >= first && d <= '2023-09-30').map((d) => {
        const r = trips.at(d)!;
        const k = file!.days.indexOf(d);
        return { day: d, got: file!.hours![k]!, low: r.low, expected: r.expected, alert: story(d).severity === 'alert' };
      });
      return shortfall(days, { day: first, ...fall }, viewed);
    };
    // Thu Sep 21 alone: the same ~77k its hour chart says came fewer, not Thu to Mon's ~375k.
    const thu = ep('2023-09-21', '2023-09-21');
    expect(Math.round(thu.estimate / 1000)).toBe(77);
    expect(story('2023-09-21').hoursLabels!.missing).toBe(`~${Math.round(thu.estimate / 1000)}k fewer`);
    // Fri adds Fri, Sat adds Sat; Sun and Mon never reach Fri's figure.
    const fri = ep('2023-09-21', '2023-09-22');
    const sat = ep('2023-09-21', '2023-09-23');
    expect(fri.estimate).toBeGreaterThan(thu.estimate + 100_000);
    expect(fri.estimate).toBeLessThan(thu.estimate + 120_000);
    expect(sat.estimate).toBeGreaterThan(fri.estimate + 90_000);
    expect(fri.bound).toBeLessThan(fri.estimate);
  });

  it('labels the split’s waterfall at one precision, so the labels add up as read and each is the value it shows', () => {
    // A label read back: "119.4k", "−77.5k", "−26", "41,939"; its unit, half of which is what rounding may move it.
    const read = (l: string) => {
      const m = l.replace(/,/g, '').match(/^([+−]?)(\d+(?:\.(\d+))?)(k?)$/)!;
      const k = m[4] ? 1000 : 1;
      return { v: (m[1] === '−' ? -1 : 1) * Number(m[2]) * k, unit: 10 ** -(m[3]?.length ?? 0) * k };
    };
    for (const d of ['2023-09-21', '2023-09-22', '2022-11-14', '2022-09-17', '2024-01-01', '2022-08-10', '2022-11-15']) {
      const steps = splitSteps(story(d))!;
      const said = steps.map((x) => `${x.name} ${x.label}`).join(' | ');
      const back = steps.map((x) => read(x.label));
      const unit = Math.max(...back.map((b) => b.unit));
      // Today is what the steps come to, and so are its labels, within half the coarsest label's last place.
      expect(steps[0]!.value + steps[1]!.value + steps[2]!.value, d).toBeCloseTo(steps[3]!.value, 6);
      expect(Math.abs(back[0]!.v + back[1]!.v + back[2]!.v - back[3]!.v), `${d}: ${said}`).toBeLessThanOrEqual(unit / 2 + 1e-9);
      steps.forEach((x, i) => expect(Math.abs(back[i]!.v - x.value), `${d}: ${said}`).toBeLessThanOrEqual(back[i]!.unit / 2 + 1e-9));
    }
  }, 30_000);

  it('says what a day’s outputs were built from with the figures its head says, never against it (ADR 0008 §10)', () => {
    for (const d of ['2022-01-29', '2022-08-10', '2022-09-17', '2022-11-08', '2022-11-14', '2022-12-19', '2023-09-21', '2023-11-07']) {
      const s = story(d);
      const l = lacked(s)!;
      // The head's percentages and times are the long form's; hours fall short and are never missing; a part is
      // "without" only on a day its head says it almost stopped.
      for (const n of s.head.match(/\d+%|\d\d:\d\d/g) ?? []) expect(l.long, `${d}: ${s.head} | ${l.long}`).toContain(n);
      expect(l.long, d).not.toMatch(/missing/);
      expect(/without/.test(l.long + l.short), `${d}: ${s.head} | ${l.short}`).toBe(/almost (gone|nothing)/.test(s.head));
    }
  });

  it('says what outputs built from a day with something wrong were built from, and shows its checks (ADR 0008 §10)', () => {
    const glance = (d: string) => { const s = story(d); return [...glanceStrings(s), reachLabel(s, 3)].reduce((t, x) => t + wordsIn(x), 0); };
    expect(reachLabel(story('2023-09-21'), 3)).toBe('Outputs built from a short day');
    expect(reachLabel(story('2023-09-21'), 5)).toBe('5 outputs built from a short day');
    expect(lacked(story('2023-09-21'))!.long).toBe('Built from a load 95% short from 13:00');
    expect(lacked(story('2022-09-17'))!.long).toBe('Built from a load 96% short from 15:00');
    expect(lacked(story('2022-01-29'))!.long).toMatch(/^Built from a load \d+% short 06:00–16:00$/);
    expect(reachLabel(story('2022-11-14'), 3)).toBe('Outputs built without Vendor 1');
    expect(reachLabel(story('2022-11-15'), 3)).toBe('Outputs built without Vendor 1');
    // A part that only fell partway is short, never "without" (Aug 10, 2022: 5,197 of ~33.6k Vendor 1 trips came).
    expect(story('2022-08-10').head).toBe('Vendor 1 records 85% short');
    expect(reachLabel(story('2022-08-10'), 3)).toBe('Outputs built with Vendor 1 short');
    expect(lacked(story('2022-08-10'), 'trips')!.long).toBe('Built with Vendor 1’s trips 85% short');
    expect(reachLabel(story('2023-11-07'), 3)).toBe('Outputs built with Extras 7.5 short');
    expect(reachLabel(story('2023-09-22'), 3)).toBe('Outputs not published');
    expect(lacked(story('2023-09-25'))).toBeNull();
    // The checks show on every day with something wrong: passed on Sat Sep 17, 2022 and Mon Nov 14, 2022.
    expect(story('2022-09-17').labels.hero).toContain('Checks passed');
    expect(story('2022-11-14').labels.hero).toContain('Checks passed');
    expect(story('2023-09-21').labels.hero).toContain('Checks near the limit');
    for (const d of ['2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24', '2022-09-17', '2022-09-18', '2022-11-14', '2022-11-15', '2022-08-10', '2023-11-07']) expect(glance(d), `${d}: ${[...glanceStrings(story(d)), reachLabel(story(d), 3)].join(' | ')}`).toBeLessThanOrEqual(60);
    // Held, the card is the paused one ADR 0009 §12 draws: its reach row says the day is paused, and its one verb is
    // Decide, the story's verb behind ⋯. The budget still holds on the episodes' days (Sat Sep 18, 2022 is 59 words;
    // with the story's verb, "Tell the source", it would be 61).
    const paused = (d: string) => { const s = story(d); return [...glanceStrings(s).filter((x) => x !== s.labels.primary), 'Decide', reachLabel(s, 3, 'waiting')].reduce((t, x) => t + wordsIn(x), 0); };
    expect(reachLabel(story('2023-09-21'), 3, 'waiting')).toBe('Paused · 3 outputs waiting');
    for (const d of ['2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24', '2022-09-17', '2022-09-18', '2022-11-14', '2022-11-15']) expect(paused(d), d).toBeLessThanOrEqual(60);
  });

  it('says each split day’s sentence from its own figures', () => {
    expect(splitSentence(story('2023-09-22'))).toBe('Flex Fare as usual (4,613; usual 2.6k–5.5k); everything else almost stopped (20; usual ~110k).');
    // Inside its range but 44% above the usual count: not "as usual".
    expect(splitSentence(story('2022-09-18'))).toBe('Flex Fare within its usual range (4,169; usual 1.6k–4.8k); everything else almost stopped (60; usual ~85k).');
    expect(splitSentence(story('2022-09-17'))).toMatch(/^Flex Fare within its usual range \(4,878; .*everything else fell from 15:00 \(54,623; /);
    expect(splitSentence(story('2022-11-19'))).toMatch(/^Vendor 1 almost stopped \(82; usual .*\); everything else as usual \(94,850; usual ~97.2k\)\.$/);
    expect(splitSentence(story('2024-01-01'))).toBe('Flex Fare 2.3× usual (10,518; usual ~4.5k); everything else as usual (70,495; usual ~68.5k).');
  });

  it('heads Mon Sep 18, 2023 with the population, not its symptom, and folds the symptom under it', () => {
    const s = story('2023-09-18');
    expect(s.head).toBe('More Flex Fare trips: 5.3%');
    // Its usual range is on the visual, labelled: the share against 2.1–4.6%.
    expect(s.labels.hero).toEqual(['Flex Fare', '5.3%', 'usually 2.1–4.6%']);
    expect(s.state).toBe('unusual');
    expect(s.split).toMatchObject({ via: 'blanks', name: 'Flex Fare', kind: 'surged' });
    // Stored and forwarded N's drop is the same trips going blank: it follows, told as a note.
    expect(s.findings.find((f) => f.key === 'share:store_and_fwd_flag="N"')).toMatchObject({ tier: 'follows', severity: 'note', was: 'warn' });
    expect(s.stories).toEqual([]);
    expect(wordsIn(s.head)).toBeLessThanOrEqual(6);
  });

  it('counts together findings’ trips with the sign of their trips, not of their share', () => {
    // New Year's Day 2024: more trips than usual, credit cards a smaller share of them. No "N trips fewer".
    for (const day of ['2024-01-01', '2023-09-22']) {
      for (const f of story(day).findings) {
        expect(f.title, f.title).not.toMatch(/move together|trips (fewer|more)$/);
        expect(f.detail, f.detail).not.toMatch(/trips (fewer|more) than a day like it/);
      }
    }
    const cards = story('2024-01-01').findings.find((f) => f.key === 'together:share:RatecodeID=1,share:payment_type=1')!;
    expect(cards.title).toBe('Rate code Standard rate: 80% (usually 82–90%)');
  });

  it('tells the weeks after Labor Day 2022 as a lasting rise, not as news every day (no last year to learn them from)', () => {
    // Wed Sep 7 to Sat Sep 10 are unusual; from Sun Sep 11 most of the week before was above its own range too.
    expect(story('2022-09-07').state).toBe('unusual');
    for (const day of ['2022-09-14', '2022-09-15', '2022-09-16']) {
      const s = story(day);
      expect(s.state, day).toBe('notes');
      expect(s.head, day).toBe('Busier than usual for days');
      expect(s.findings.find((f) => f.kind === 'volume'), day).toMatchObject({ severity: 'note', lasting: '2022-09-07' });
      // The amount line still says how far: +15% and more, outside its range.
      expect(s.labels.amount[1], day).toMatch(/^\+1\d%$/);
    }
    // The incident after them is told as before.
    expect(story('2022-09-17').head).toBe('Trips fall to trickle from 15:00');
  });

  it('names the episode a calm day comes after, and says nothing is left to do', () => {
    const s = story('2023-09-25');
    // Its days from the hour the first fell, never what its last day was (Thu lost its trips from 13:00, not all but Flex
    // Fare): what it was is a tap away.
    expect(s.chip).toBe('after Thu 13:00–Sun');
    expect(story('2022-09-19').chip).toBe('after Sat 15:00–Sun');
    expect(story('2022-11-21').chip).toBe('after Mon–Sun');
    expect(s.labels.after).toBe('Nothing to do · Thu published short, Fri–Sun held');
    expect(s.recovery).toMatchObject({ held: ['2023-09-22', '2023-09-23', '2023-09-24'], published: ['2023-09-21'] });
  });

  it('tells Fri Sep 22, 2023 as the Flex Fare trips alone arriving, the run held with fewer rows dropped than usual', () => {
    const s = story('2023-09-22');
    expect(s.head).toBe('Only Flex Fare records arrived');
    // Its chip counts the trips short so far, as its hours do: day 3 reads apart from day 2.
    expect(s.chip).toBe('Day 2 · ~187k short');
    expect(story('2023-09-23').chip).toBe('Day 3 · ~290k short');
    expect(s.split!.part.today).toBe(4613);
    expect(s.split!.rest.today).toBe(20);
    expect(s.gate).toMatchObject({ held: true, dropped: 2116 });
    expect(s.gate!.dropped).toBeLessThan(s.gate!.usual!.low);
    expect(s.stories).toEqual([]);
    expect(s.follows.length + s.sameDay.length + s.absorbed.length).toBeGreaterThanOrEqual(25);
    expect(glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(60);
  });

  it('tells Nov 14 and 15, 2022 as vendor 1 sending almost nothing, the second as day 2', () => {
    expect(story('2022-11-14').head).toBe('Vendor 1 sent almost nothing');
    const s = story('2022-11-15');
    expect(s.head).toBe('Vendor 1 sent almost nothing');
    // A part that vanished counts each day whole, its guess less its trips, as its amount line's change does.
    expect(s.chip).toBe('Day 2 · ~66k short');
    expect(s.episode!.short!.estimate).toBeCloseTo((h!.of({ of: 'trips' })!.at('2022-11-14')!.expected - 82_278) + (h!.of({ of: 'trips' })!.at('2022-11-15')!.expected - 90_728), 0);
    expect(s.split!.part.today).toBe(3);
  });

  it('tells New Year’s Day 2024 as a Flex Fare surge, unusual and nothing more', () => {
    const s = story('2024-01-01');
    // Its trips all came (81,013 in 49k–108k, every hour): its amber says there is nothing to do, and marking it is
    // optional (ADR 0008 §6).
    expect(s.labels.settle).toBe('Total in range · nothing to do');
    expect(s.labels.primary).toBe('Mark as expected (optional)');
    expect(s.labels.folded).toBe('Rate code Standard rate share + 1 more');
    expect(s.head).toBe('Flex Fare records 2.3× usual');
    expect(s.state).toBe('unusual');
    // Its trips beyond usual are said under them, and the day stays within its 45 words.
    expect(s.labels.hero).toContain('+6k over usual');
    expect(glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(45);
  });

  it('prints every number on a label as the value it shows: rounded, or within 5% after a ~', () => {
    // Each number in a label, in order, against the value it claims to show.
    const said = (label: string, ...values: number[]) => {
      const text = label.replace(/,/g, '');
      [...text.matchAll(/(\d+(?:\.\d+)?)(k?)/g)].forEach((m, i) => {
        const v = values[i];
        if (v === undefined) return;
        const dec = (m[1]!.split('.')[1] ?? '').length;
        const unit = 10 ** -dec * (m[2] ? 1000 : 1);
        const shown = Number(m[1]) * (m[2] ? 1000 : 1);
        const loose = /~$/.test(text.slice(0, m.index));
        expect(Math.abs(shown - v), `${label}: ${shown} for ${v}`).toBeLessThanOrEqual(Math.max(unit / 2, loose ? 0.05 * v : 0) + 1e-9);
      });
    };
    for (const day of ['2023-09-22', '2022-11-15', '2024-01-01', '2023-09-21', '2022-09-18', '2023-10-29', '2022-09-17']) {
      const s = story(day);
      const [part, partNum, , restNum, over] = s.split ? s.labels.hero : [];
      if (s.split && s.hero === 'split') {
        expect(part).toBe(partLabel(s.split));
        said(partNum!, s.split.part.today, s.split.part.usual);
        said(restNum!, s.split.rest.today, s.split.rest.usual);
        // A surge's trips beyond usual, said under them (New Year's Day 2024: "+6k over usual").
        if (s.split.kind === 'surged') said(over!, s.split.part.today - s.split.part.usual);
      }
      said(s.labels.amount[0]!, s.amount!.value);
      said(s.labels.amount.at(-1)!, s.amount!.low, s.amount!.high);
      // The day's change, when the amount line carries it ("whole day −65%" beside an hour head): against the guess.
      const change = s.labels.amount.find((l) => /^(whole day )?[+−]\d+%$/.test(l));
      if (change) said(change, Math.abs(s.amount!.value / s.amount!.expected - 1) * 100);
      if (s.hoursLabels && s.hours) {
        const { got, usual, from, to } = s.hours;
        const had = got.slice(from, to + 1).reduce((a, b) => a + b, 0);
        said(s.hoursLabels.floor, had / (to - from + 1));
        said(s.hoursLabels.missing, usual.slice(from, to + 1).reduce((a, b) => a + b, 0) - had);
        // A head's rate is the floor's ("Trips fall to ~330/h from 13:00"), its hour the cut's; a trickle is trips in
        // every one of those hours and under a tenth of a usual day's.
        if (to === 23 && /~[\d,]+\/h/.test(s.head)) said(s.head.replace(/ from .*$/, ''), had / (to - from + 1));
        if (/trickle/.test(s.head)) {
          expect(got.slice(from, to + 1).every((n) => n > 0), s.day).toBe(true);
          expect(had, s.day).toBeLessThan(0.1 * usual.slice(from, to + 1).reduce((a, b) => a + b, 0));
        }
        if (s.hoursLabels.before) said(s.hoursLabels.before, Math.abs(fallParts(s.hours, s.amount!)!.before));
      }
      if (s.gate?.held || s.gate?.near) {
        // Each of the gate's labels is on the screen, and says its own number: the share of the rows that arrived,
        // the margin to the limit when within two points of it, the rows dropped and a day like it's.
        const g = gateLabels(s.gate);
        for (const l of [g.share, g.limit, g.margin, g.rows, g.usual]) if (l) expect(s.labels.hero).toContain(l);
        said(g.share, s.gate.share * 100);
        if (g.margin) said(g.margin, Math.abs(s.gate.share - s.gate.limit!) * 100);
        said(g.rows, s.gate.dropped);
        said(g.usual!, s.gate.usual!.low, s.gate.usual!.high);
      }
      if (s.gate) {
        // The gate's sheet title says the share as its bars do, so the margin beside them is the title's share less
        // the limit at the decimals printed (Sep 21, 2023: 9.55%, 0.45 pt under; never 9.5% over 0.45).
        const g = gateLabels(s.gate);
        const title = gateHead(s.gate);
        said(title.replace(/^[^:]*: /, ''), s.gate.share * 100);
        expect(title, day).toContain(` ${g.said} dropped`);
        if (g.margin) {
          const [share, margin] = [g.said, g.margin].map((x) => x.match(/\d+(?:\.\d+)?/)![0]);
          const dec = (margin!.split('.')[1] ?? '').length;
          expect(Math.abs(Number(share) - s.gate.limit! * 100).toFixed(dec), `${title} | ${g.margin}`).toBe(margin);
        }
      }
    }
  });

  it('draws count bands only where they hold: 90% of ordinary days inside, for the counts the visuals draw', async () => {
    const { isSpecial } = await import('../src/core/calendar.js');
    for (const m of [{ of: 'count', column: 'payment_type', value: '0' }, { of: 'count', column: 'VendorID', value: '1' }, { of: 'droppedRows' }, { of: 'ruleRows', name: 'distance' }] as const) {
      const r = h!.of(m)!;
      let n = 0;
      let inside = 0;
      for (const day of file!.days) {
        if (day < '2023-01-01' || isSpecial(day)) continue;
        const at = r.at(day);
        const v = r.value(day);
        if (!at || v === null) continue;
        n++;
        if (r.place(at, v) === 'within') inside++;
      }
      expect(inside / n, JSON.stringify(m)).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('labels the gate’s two bars, and says a margin within two points of the limit to the share’s decimals', () => {
    // Sun Sep 18, 2022: held at 10.45% of 4,229 rows against a 10% limit; Thu Sep 21, 2023: 9.55%, just under.
    expect(gateLabels(story('2022-09-18').gate!)).toEqual({ said: '10.45%', share: '10.45% of arrived rows dropped', limit: 'limit 10%', margin: '0.45 pt over', zoom: true, rows: '442 rows dropped', usual: 'usual 3.8k–5.4k' });
    expect(gateLabels(story('2023-09-21').gate!)).toMatchObject({ share: '9.55% of arrived rows dropped', margin: '0.45 pt under', rows: '4,004 rows dropped' });
    // Far past it, no zoom, but its gap said so no one has to subtract: Fri Sep 22, 2023, on its card too (it held).
    expect(gateLabels(story('2023-09-22').gate!)).toMatchObject({ share: '45.7% of arrived rows dropped', margin: '35.7 pt over', zoom: false, rows: '2,116 rows dropped' });
    expect(story('2023-09-22').labels.gate).toContain('35.7 pt over');
    // Far under it and passed, its gap said in its sheet, not on the card: Tue Nov 15, 2022 at 4.6%, as the canvas says.
    expect(gateLabels(story('2022-11-15').gate!)).toMatchObject({ said: '4.6%', margin: '5.4 pt under' });
    expect(story('2022-11-15').labels.gate).not.toContain('5.4 pt under');
    expect(glanceStrings(story('2022-09-18')).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(60);
    // The sheet a tap on the gate opens is titled with the share its bars say.
    expect(gateHead(story('2022-09-18').gate!)).toBe('Held at trips_valid: 10.45% dropped');
    expect(gateHead(story('2023-09-21').gate!)).toBe('trips_valid: 9.55% dropped');
  });

  it('says each rule of the checks one way on the real days: in_month never fails, no range no "·" (tabs #12)', () => {
    for (const day of ['2024-01-01', '2023-09-22', '2023-09-21', '2022-11-15']) {
      const g = story(day).gate!;
      const inMonth = g.rules.find((r) => r.name === 'in_month')!;
      expect(inMonth.never, day).toBe(true);
      expect(ruleUsual(inMonth), day).toBe('never fails');
      for (const r of g.rules) expect(ruleUsual(r), `${day} ${r.name}`).not.toMatch(/usual (\S+)–\1$/);
    }
    // New Year's Day 2024: Fare, Known zones and Passengers have no range of their own, and say none.
    const jan1 = story('2024-01-01').gate!;
    expect(jan1.rules.filter((r) => !r.usual).map((r) => [r.name, ruleUsual(r)])).toEqual([['fare', ''], ['known_zones', ''], ['passengers', '']]);
    // Past its range: Distance 4,305 (usual 365–2.6k) and Duration 1,553 (679–1.3k), and the rows dropped, 6,942.
    expect(jan1.rules.filter((r) => r.usual && r.rows > r.usual.high).map((r) => r.name).sort()).toEqual(['distance', 'duration']);
    expect(jan1.dropped).toBeGreaterThan(jan1.usual!.high);
    expect(ruleOrder(jan1.rules).map((r) => r.name)).toEqual(['distance', 'duration', 'fare', 'known_zones', 'in_month', 'passengers']);
    expect(gateLabels(jan1).said).toBe('8.6%');
  });

  it('names vendor 1 beside its code where the head names it', () => {
    const s = story('2022-11-14');
    expect(s.split).toMatchObject({ name: 'Vendor 1', who: 'Creative Mobile' });
    expect(s.labels.hero[0]).toBe('Vendor 1 · Creative Mobile');
    expect(story('2023-09-22').split!.who).toBeUndefined();
  });

  it('gives a value’s count the range its split is judged on where its own has none (New Year’s Day 2024)', () => {
    // Flex Fare's count moved too far since last year for its own holiday range; its share's range of a usual New
    // Year's Day's trips is 2.3k–8.6k, about 4.5k expected: the split's "usual ~4.5k".
    expect(h!.of({ of: 'count', column: 'payment_type', value: '0' })!.at('2024-01-01')).toBeNull();
    const r = countRange(h!, 'payment_type', '0', '2024-01-01')!;
    expect([Math.round(r.low / 100) * 100, Math.round(r.high / 100) * 100, Math.round(r.expected / 100) * 100]).toEqual([2300, 8600, 4500]);
    expect(Math.abs(r.expected - story('2024-01-01').split!.part.usual)).toBeLessThan(1);
    // Where the count has its own range, that is the one.
    expect(countRange(h!, 'payment_type', '0', '2023-09-22')).toMatchObject({ low: h!.of({ of: 'count', column: 'payment_type', value: '0' })!.at('2023-09-22')!.low });
  });

  it('tells the snow of Jan 6 and 7, 2024 as context after the numbers, not in a cause’s chip', () => {
    // Sun Jan 7: fewer trips, with today's snow and Saturday's; Sat Jan 6: a normal Saturday with its own.
    const sun = story('2024-01-07');
    expect(sun).toMatchObject({ state: 'unusual', chip: null });
    expect(sun.labels.context).toBe('❄ 1.5 cm today · 7.2 cm Sat');
    // Each number is the snow it shows, to its one decimal.
    const snow = (d: string) => file!.weather!.snow[file!.days.indexOf(d)]!;
    expect([...sun.labels.context!.matchAll(/(\d+\.\d) cm/g)].map((m) => Number(m[1]))).toEqual([snow('2024-01-07'), snow('2024-01-06')].map((x) => Math.round(x * 10) / 10));
    expect(glanceStrings(sun).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(45);
    // Tagged as context where it shows, never as a reason, and the tag counted.
    expect(glanceStrings(sun)).toContain('Context ❄ 1.5 cm today · 7.2 cm Sat');
    // Its total below its range: nothing says there is nothing to do; its verb says marking it is optional.
    expect(sun.labels.settle).toBeNull();
    expect(sun.labels.primary).toBe('Mark as expected (optional)');
    // Its one change explained and two the same day, in one row, its first named.
    expect(sun.labels.folded).toBe('Duration rule + 2 more');
    const sat = story('2024-01-06');
    expect(sat).toMatchObject({ head: 'A normal Saturday', chip: null });
    expect(sat.labels.context).toBe('❄ 7.2 cm today');
    expect(glanceStrings(sat).reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(16);
    // Sat Sep 23, 2023 had 33 mm of rain: its cause is told, its weather left to the weather's card.
    expect(story('2023-09-23').labels.context).toBeNull();
    // Every day the note shows on (a snowy day, or the day after one) stays within its budget, the note counted.
    const budget: Record<string, number> = { unusual: 45, calm: 16, notes: 16, recovery: 24 };
    let noted = 0;
    for (const [k, d] of file!.days.entries()) {
      if (!((file!.weather!.snow[k] ?? 0) >= 1 || (file!.weather!.snow[k - 1] ?? 0) >= 1)) continue;
      const s = story(d);
      if (!s.labels.context) continue;
      noted++;
      expect(glanceStrings(s).reduce((t, x) => t + wordsIn(x), 0), `${d}: ${glanceStrings(s).join(' | ')}`).toBeLessThanOrEqual(budget[s.state]!);
    }
    expect(noted).toBeGreaterThan(10);
  }, 60_000);

  it('keeps a paused day’s card within 60 words and its decision sheet within 45, on every day the flow holds (ADR 0009 §12)', () => {
    // The 28 days `wrong` holds (test/hold-real.test.ts), each told as a viewer sees it.
    const WRONG = ['2022-01-04', '2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09', '2022-01-29', '2022-08-10', '2022-09-17', '2022-09-18',
      '2022-11-08', '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20', '2022-12-19', '2022-12-20', '2022-12-21', '2022-12-22',
      '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24', '2023-11-07', '2023-11-14'];
    const rows = (d: string) => file!.rows[file!.days.indexOf(d)]!;
    const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    for (const d of WRONG) {
      const s = story(d);
      expect(s.state, d).toBe('wrong');
      // The card: its glance without the story's verb (behind ⋯), and the pause row with its verb, in each of its states:
      // waiting with Decide, waiting on the owner for someone who may not decide, and each receipt.
      // The pause row names what paused it (its checks too when they held), readers' day and the three outputs; the
      // checks are drawn as a paused card draws them (decision.ts pausedGlance).
      const words = (xs: readonly string[]) => xs.reduce((t, x) => t + wordsIn(x), 0);
      const by = s.gate?.held ? ['trips', 'checks'] : ['trips'];
      for (const [state, may, under, standing] of [['waiting', true, null, false], ['waiting', false, null, false], ['asis', true, null, false], ['dont', true, null, false], ['dont', true, null, true], ['dont', true, 'Wed', true]] as const) {
        const l = pauseLines({ state, names: ['zone_hour', 'borough_hour', 'weather_effect'], by, readers: plus(d, -1), who: 'Owner', at: '23:59', under, may, deciders: 'Owner', standing });
        const said = pausedGlance(s, l, state !== 'waiting');
        expect(words(said), `${d} ${state}${may ? '' : ' (may not decide)'}: ${said.join(' | ')}`).toBeLessThanOrEqual(60);
      }
      // The sheet, drawn as the page draws it, the day before what readers keep; at its wordiest, the day after already
      // published and another build's decision said.
      const draw = decisionDrawing(h, s, d, plus(d, -1), { day: rows(d), readers: rows(plus(d, -1)) });
      expect(draw.cause, d).toBe(s.hero === 'hours' ? 'hours' : s.split ? 'split' : 'amount');
      expect(draw.dont, d).not.toBeNull();
      // Whatever is picked (decision.ts sheetShown): its drawing's words (the part, the trips missing, the cut), the
      // trips past the checks under the trips that arrived, what publishing overrides where the checks held the day too,
      // a stale day kept (readers three days back), the reasons for the option picked and the scope under Don't publish;
      // and for someone who may not decide, what readers see until the owner does. With a later day published, Publish
      // as is can't be picked.
      for (const [later, readersAt, may] of [[null, -1, true], [null, -3, true], [plus(d, 4), -1, true], [null, -3, false]] as const) {
        const t = sheetText({ day: d, waited: 3000, otherBuild: true, outputs: 3, rows: rows(d), reach: rows(d) - file!.dropped[file!.days.indexOf(d)]!, readers: { day: plus(d, readersAt), rows: rows(plus(d, readersAt)) }, later, checks: s.gate?.held ? s.gate : null, part: draw.part, missing: draw.cause === 'hours' ? s.hoursLabels?.missing ?? null : null, cut: draw.cut?.[1] ?? null, ticks: draw.ticks.map(([, x]) => x), unjudged: false, hash: 'a'.repeat(64), may, deciders: 'Owner', head: s.head, noun: { one: 'trip', many: 'trips' } });
        expect(sheetWords(t), `${d}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(45);
      }
    }
    // The same budgets with the tests' longest noun, a two-word one (ADR 0010 §8, Q-78): each day's card at a glance,
    // and its sheet at its wordiest, say "endpoint events" where they say trips.
    const events: Names = { ...names, noun: (n) => (n === 1 ? 'endpoint event' : 'endpoint events') };
    for (const d of WRONG) {
      const s = storyOf(h!, d, newsOf(h!, d, events), { names: events, step: 'trips_valid', limit: 0.1 });
      expect(glanceStrings(s).filter((x) => /trip/i.test(x)), d).toEqual([]);
      const l = pauseLines({ state: 'waiting', names: ['zone_hour', 'borough_hour', 'weather_effect'], by: s.gate?.held ? ['trips', 'checks'] : ['trips'], readers: plus(d, -1), who: 'Owner', at: '23:59', under: null, may: true, deciders: 'Owner', standing: false });
      const said = pausedGlance(s, l, false);
      expect(said.reduce((t, x) => t + wordsIn(x), 0), `${d}: ${said.join(' | ')}`).toBeLessThanOrEqual(60);
      const draw = decisionDrawing(h, s, d, plus(d, -1), { day: rows(d), readers: rows(plus(d, -1)) });
      const t = sheetText({ day: d, waited: 3000, otherBuild: true, outputs: 3, rows: rows(d), reach: rows(d) - file!.dropped[file!.days.indexOf(d)]!, readers: { day: plus(d, -3), rows: rows(plus(d, -3)) }, later: null, checks: s.gate?.held ? s.gate : null, part: draw.part, missing: draw.cause === 'hours' ? s.hoursLabels?.missing ?? null : null, cut: draw.cut?.[1] ?? null, ticks: draw.ticks.map(([, x]) => x), unjudged: false, hash: 'a'.repeat(64), may: true, deciders: 'Owner', head: s.head, noun: { one: 'endpoint event', many: 'endpoint events' } });
      expect(t.options[0]!.number, d).toMatch(/ endpoint events$/);
      expect(sheetWords(t), `${d}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(45);
    }
    // Thu Sep 21: its hours, Wed 20 kept, on one scale; Mon Nov 14, 2022: Vendor 1's 2 trips beside 82,276.
    const thu = decisionDrawing(h, story('2023-09-21'), '2023-09-21', '2023-09-20', { day: 41_939, readers: rows('2023-09-20') });
    expect(thu).toMatchObject({ cause: 'hours', short: [13, 23], ticks: [], cut: [13, '13h'] });
    expect(rows('2023-09-20')).toBe(108_434);
    const nov = decisionDrawing(h, story('2022-11-14'), '2022-11-14', '2022-11-13', { day: rows('2022-11-14'), readers: rows('2022-11-13') });
    expect(nov).toMatchObject({ cause: 'split', part: 'Vendor 1 · 2', asis: { part: 2, rest: 82_276 } });
    // The day after an episode says what became of its days, the day on screen first once it published, with Decide
    // while one waits: in each state, a day of it not run keyed in its strip ("not run"; the strip draws only the
    // episode's own days so), within its 24 words, on each of the episodes the app loads.
    for (const day of ['2023-09-25', '2022-09-19', '2022-11-21']) {
      const mon = story(day);
      const rec = mon.recovery!;
      const days: string[] = [];
      for (let x = rec.from; x <= rec.to; x = plus(x, 1)) days.push(x);
      const states: ('waiting' | 'asis' | 'dont' | null)[][] = [days.map(() => 'waiting'), days.map((_, i) => (i === 0 ? 'asis' : 'dont')), days.map((_, i) => (i === days.length - 1 ? null : 'waiting'))];
      for (const fates of states) {
        const after = afterLine(days.map((x, i) => ({ day: x, state: fates[i]! })), { today: { day, state: 'published' } })!;
        // Its strip keys the episode's ! ("wrong"); while a day of it waits, the health cells go without their head, as
        // on a paused card (its line, with Decide, and its strip are named around them).
        const said = [...glanceStrings(mon).filter((x) => x !== mon.labels.after && !(fates.includes('waiting') && x === mon.labels.health)), after.text, after.verb ?? '', fates.includes(null) ? 'not run' : ''];
        expect(said).toContain('wrong');
        expect(said.reduce((t, x) => t + wordsIn(x), 0), `${day}: ${said.join(' | ')}`).toBeLessThanOrEqual(24);
      }
    }
    expect(story('2023-09-25').labels.after).toBe('Nothing to do · Thu published short, Fri–Sun held');
  }, 60_000);

  it('keeps the sheet within 45 words with its remedies on every day the flow holds: every pick, every donor, staged or not (amendment 1 S12)', () => {
    // Accept on 20 of the 28 (amendment 1 S5): not the hours days (Jan 29, Sep 17, 2022; Sep 21, 2023), nor the parts that
    // held while the rest vanished (Jan 4, Sep 18, 2022; Sep 22–24, 2023).
    const ACCEPTED = ['2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09', '2022-08-10', '2022-11-08', '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20',
      '2022-12-19', '2022-12-20', '2022-12-21', '2022-12-22', '2023-11-07', '2023-11-14'];
    const WRONG = ['2022-01-04', '2022-01-05', '2022-01-06', '2022-01-07', '2022-01-08', '2022-01-09', '2022-01-29', '2022-08-10', '2022-09-17', '2022-09-18',
      '2022-11-08', '2022-11-14', '2022-11-15', '2022-11-16', '2022-11-17', '2022-11-18', '2022-11-19', '2022-11-20', '2022-12-19', '2022-12-20', '2022-12-21', '2022-12-22',
      '2023-09-21', '2023-09-22', '2023-09-23', '2023-09-24', '2023-11-07', '2023-11-14'];
    const filled = exampleFilled();
    const ref: HistoryRef = { path: 'history.json', sha256: '0'.repeat(64), bytes: 0 };
    const rows = (d: string) => file!.rows[file!.days.indexOf(d)]!;
    const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    // Every day the history has may be a donor here: the words must hold whichever the data's list gives.
    const listed = (d: string) => ({ path: d, sha256: '0'.repeat(64), bytes: 0 });
    let offered = 0;
    const accepted: string[] = [];
    for (const d of WRONG) {
      const s = story(d);
      const claim = dayClaim(h!, filled, ref, d, 'trips', 'dev');
      const { picks } = donorChoices({ h: h!, doc: filled, day: d, source: 'trips', listed, history: ref, build: 'dev' }, 'weekday');
      // With Accept the new level where the cause is a level (amendment 1 S6): five rows on Nov 14–16, 2022.
      const offers = offersOf({ story: s, claim, fill: { time: 'tpep_pickup_datetime' }, donors: picks, told: s, holds: s.gate?.held ? [{ by: 'story' }, { by: 'checks' }] : [{ by: 'story' }] });
      const missing = missingOf(s, 'tpep_pickup_datetime');
      if (offers.some((o) => o.option === 'fill')) offered++;
      if (offers.some((o) => o.option === 'accept')) accepted.push(d);
      const fills = offers.some((o) => o.option === 'fill');
      const draw = decisionDrawing(h, s, d, plus(d, -1), { day: rows(d), readers: rows(plus(d, -1)) }, missing && fills ? { missing, donors: picks.map((p) => p.day) } : null);
      const donors = missing && fills ? picks.flatMap((p) => { const c = fillCounts(h!, d, missing, p.day); return c ? [{ day: p.day, counts: c }] : []; }) : [];
      const partOnly = missing && fills ? fillCounts(h!, d, missing, null) : null;
      expect(draw.fills.length, d).toBe(fills ? picks.length : 0);
      for (const [noun, readersAt, may, fails, withdraws] of [[{ one: 'trip', many: 'trips' }, -1, true, false, null], [{ one: 'trip', many: 'trips' }, -3, true, true, null], [{ one: 'trip', many: 'trips' }, -1, false, false, null], [{ one: 'trip', many: 'trips' }, -1, true, false, 'fill'], [{ one: 'endpoint event', many: 'endpoint events' }, -3, true, false, null]] as const) {
        const t = sheetText({
          day: d, waited: 3000, otherBuild: true, outputs: 3, rows: rows(d), reach: rows(d) - file!.dropped[file!.days.indexOf(d)]!, readers: { day: plus(d, readersAt), rows: rows(plus(d, readersAt)) }, later: null, checks: s.gate?.held ? s.gate : null,
          part: draw.part, missing: draw.cause === 'hours' ? s.hoursLabels?.missing ?? null : null, cut: draw.cut?.[1] ?? null, ticks: draw.ticks.map(([, x]) => x), unjudged: false, hash: 'a'.repeat(64), may, deciders: 'Owner', head: s.head, noun,
          offers: fails ? offers.map((o) => (o.option === 'complete' ? { ...o, note: 'fails its checks' } : o)) : offers, donors, partOnly, staged: fails && picks[0] ? { option: 'fill', donor: picks[0].day, fails: true } : null, withdraws,
        });
        expect(sheetWords(t), `${d} ${JSON.stringify([noun.many, readersAt, may, fails, withdraws])}: ${JSON.stringify(t)}`).toBeLessThanOrEqual(45);
      }
    }
    // The 17 days with a missing part on a short day (fill-real.test.ts); Accept where the cause is a level and nothing
    // but the story holds (amendment 1 S6, X6): never an hours cause, a part that held, or a day the checks held too.
    expect(offered).toBe(17);
    expect(accepted).toEqual(ACCEPTED);
    // The receipts within 45, an Accept's among them, and the versions.
    const a = receiptLines({ state: 'accepted', day: '2022-11-14', readers: '2022-11-14', released: 3, who: 'Owner', at: '09:40', seq: 24, under: null, standing: false, level: '2022-11-14' });
    expect([a.head, a.sub]).toEqual(['New level from Mon 14 · readers now see Mon 14', 'learns from Mon 14 · 3 outputs released · Owner · 09:40 · record #24']);
    expect([a.head, a.sub].reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(45);
    const l = receiptLines({ state: 'fill', day: '2023-09-21', readers: '2023-09-21', released: 3, who: 'Owner', at: '09:40', seq: 222, under: null, standing: true, remedy: { option: 'fill', donor: '2023-09-14', part: null, filled: 83_671, setAside: 3679 } });
    expect([l.head, l.sub, 'Versions ›', `${l.change} ›`].reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(45);
    const v = versionLines([{ seq: 13, run: 1, manifest: 'a', kind: 'arrived', shown: null }, { seq: 15, run: 2, manifest: 'b', kind: 'filled', donor: '2023-09-14', shown: 'before' }, { seq: 18, run: 3, manifest: 'c', kind: 'filled', donor: '2023-09-20', shown: 'now' }, { seq: 31, run: 4, manifest: 'd', kind: 'complete', shown: null }], { day: '2023-09-21', noun: { one: 'endpoint event', many: 'endpoint events' }, name: (x) => `#${x.seq}`, rows: () => 121_931, part: 'Before 13:00 only' });
    expect([v.title, ...v.lines.map((x) => x.text)].reduce((t, x) => t + wordsIn(x), 0)).toBeLessThanOrEqual(45);
  }, 120_000);

  it('accounts for every finding in one tier: the grouped rows add up to what the old view counted', () => {
    // The old view counted every finding; the story groups them. Thu Sep 21: 1 cause + 2 absorbed + 6 + 8 = 17.
    for (const day of ['2023-09-21', '2023-09-22', '2023-09-23', '2022-11-15', '2024-01-01', '2024-01-06', '2024-01-07', '2023-09-18']) {
      const found = newsOf(h!, day, names).filter((f) => f.severity !== 'ok');
      const s = story(day);
      const tiers = [s.cause, ...s.stories, ...s.more, ...s.absorbed, ...s.follows, ...s.sameDay, ...s.notes, s.context].filter((f) => !!f).map((f) => f!.key);
      expect(new Set(tiers).size, day).toBe(tiers.length);
      expect(tiers.sort(), day).toEqual(found.map((f) => f.key).sort());
      // What no row lists (what the cause absorbed) is in a health cell, a tap from the card.
      for (const f of s.absorbed) expect(Object.values(CELL_KINDS).flat(), `${day}: ${f.title}`).toContain(f.kind);
    }
    const thu = story('2023-09-21');
    expect([thu.cause ? 1 : 0, thu.absorbed.length, thu.follows.length, thu.sameDay.length]).toEqual([1, 2, 6, 8]);
    // At a glance its 6 explained and 8 the same day are one row, its first named and the rest counted: 1 + 13.
    expect(thu.labels.folded).toBe('Rate code Standard rate share + 13 more');
    expect(story('2023-09-22').labels.folded).toBe('Passengers 1 share + 27 more');
  });

  it('draws an episode’s days in its chip, and counts its shortfall as its hours do, to the viewed day', () => {
    const sat = story('2023-09-23');
    expect(sat.episode!.trend.map((d) => d.day)).toEqual(['2023-09-21', '2023-09-22', '2023-09-23']);
    // Thursday a third of a usual day, Friday and Saturday a twentieth: day 3 reads as more of the same.
    expect(sat.episode!.trend.map((d) => Math.round((d.trips / d.expected) * 100))).toEqual([35, 4, 5]);
    const trips = h!.of({ of: 'trips' })!;
    for (const viewed of ['2023-09-22', '2023-09-23']) {
      const days: EpisodeDay[] = file!.days.filter((d) => d >= '2023-09-21' && d <= viewed).map((d) => ({ day: d, got: file!.hours![file!.days.indexOf(d)]!, low: trips.at(d)!.low, expected: trips.at(d)!.expected, alert: story(d).severity === 'alert' }));
      expect(story(viewed).episode!.short, viewed).toEqual(shortfall(days, { day: '2023-09-21', ...story('2023-09-21').hours! }, viewed));
    }
    expect(story('2023-09-21').episode).toBeNull();
  });

  it('tells calm days and the day after an episode calmly', () => {
    expect(story('2024-01-15')).toMatchObject({ state: 'calm', head: 'Normal for MLK Day' });
    expect(story('2023-09-25')).toMatchObject({ state: 'recovery', head: 'Back to normal', chip: 'after Thu 13:00–Sun' });
    // A calm day says its cells are all normal: a blank cell can't be told from one not checked; one with numbers that had
    // no range that day says how many, never all normal (ADR 0010 §1): MLK Day's shares moved too far since last year.
    expect(story('2024-01-17').labels.health).toBe('Health · all normal');
    expect(story('2024-01-15').labels.health).toBe('Health · 14 not judged');
    expect(story('2024-01-06').labels.health).toBe('Health');
  });
});
