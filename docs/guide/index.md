# Quick start

## Try it

**[Open the demo](/app/){target="_self"}**: the control estate, a month of security controls for 600 applications,
run entirely in your browser. The first run takes a few seconds while the engine starts. **[The sign-in log](/signins/){target="_self"}**
is a second demo, with the two models' planted days.

Nothing is sent anywhere: the data files, the engine (smaltdb, in a Web Worker) and the record of what was decided
all live in the page and your browser's storage.

Then read [A walk through the demo](./demo): ten minutes, day by day.

## What you are looking at

A **flow** reads daily files (the **sources**), runs them through **steps** (checks, joins, summaries) and publishes
**datasets**. Each step is a cell of a [smaltnb](https://stenhoor.github.io/smaltnb/) notebook. Each day, every
watched dataset is compared with the days before it; a day that is off is **held**: what it would publish waits, and
readers keep the last good day, until someone with the right to decides.

The screen has a strip of days at the top (each day's state), the **canvas** (the flow: a card a source or a step, a
box a notebook) and, when you tap something, its **sheet** (News, Data, Columns, Checks, Rules, Models, History,
Integrity).

## Run it locally

```sh
git clone https://github.com/stenhoor/smaltfl && cd smaltfl
npm ci && npm run deps          # dependencies, then the smaltdb build pinned in packed.json
npm run check                   # typecheck and tests
npm run build:app -- --flow examples/control-estate/flow.json --out dist/app-estate
npx serve dist/app-estate       # or any static file server
```

`npm run build:app` generates the example's data (a year of history, a month of daily loads), measures the history
on the runtime and writes a static page. Other examples: `--flow examples/security-signins/flow.json`,
`--flow examples/controls/flow.json`, and the taxi example (the default, on the `data` branch's real trips:
`git fetch origin data --depth 1`).
