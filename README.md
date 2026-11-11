# smaltfl

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="docs/public/work-in-progress.svg" height="56"></picture></a>

**Small. Alternative. Flow.** Data pipelines for smaltdb, built visually and run in the browser.

[Documentation](https://stenhoor.github.io/smaltfl/) · [smaltworks.dev](https://smaltworks.dev)

smaltfl reads daily files, runs them through steps written as [smaltnb](https://github.com/stenhoor/smaltnb) notebooks,
and publishes datasets, with an ontology, enforced access policies and content hashes attached to what it produces.
Each day is judged against the days before it: a day that is off is **paused, not published**, told as one cause with
what it reaches, until someone with the right to decides (publish as is, keep it back, fill it from another day, accept
a new level). Everything runs in the browser, on [smaltdb](https://github.com/stenhoor/smaltdb).

> **Status: early development.** [Try the live demo →](https://stenhoor.github.io/smaltfl/app/) (the control estate:
> 600 applications, twelve security controls, a year of history and a planted March) ·
> [Read the docs →](https://stenhoor.github.io/smaltfl/) · [A walk through the demo](https://stenhoor.github.io/smaltfl/guide/demo)
> - **Where the work stands:** [docs/HANDOFF.md](docs/HANDOFF.md) (what is built, how to check it, what is left)
> - Decisions: [docs/adr/](docs/adr/README.md) (ADR 0001 to 0015)
> - The architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the scenario it is measured against: [docs/SCENARIO.md](docs/SCENARIO.md)
> - The owner's answers and the questions still open: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)
> - Brand: [docs/brand/DECISIONS.md](docs/brand/DECISIONS.md) (the layer's colour is set; the mark is on hold)

## Development

```sh
npm ci && npm run deps   # dependencies, then the smaltdb build pinned in packed.json
npm run check            # typecheck and tests
npm run bench            # the scenario benchmarks (bench/results/node.json)
npm run build:app        # the app, in dist/app (with the data branch's loads when fetched: git fetch origin data --depth 1)
npm run build:app -- --flow examples/control-estate/flow.json --out dist/app-estate   # the demo
npm run docs:dev         # the site (VitePress), with live reload
```

The tests are the worked example: [test/runtime.test.ts](test/runtime.test.ts) runs the reference flow
([test/fixtures/taxi.ts](test/fixtures/taxi.ts)) on a seeded stand-in for the scenario's taxi data and checks it
against the same flow computed in plain JavaScript, and [test/example.test.ts](test/example.test.ts) runs
[the weather example](examples/nyc-taxis-weather.smaltfl.json) on real data. [CLAUDE.md](CLAUDE.md) has the layout and
the working rules.

**Data.** This project's cloud sessions can't reach the TLC and Open-Meteo hosts, so
[a workflow](.github/workflows/data.yml) downloads the scenario's data on a GitHub runner and publishes it as the
`data` branch, with every file's hash in its `MANIFEST.json`.

MIT licence ([LICENSE](LICENSE)).
