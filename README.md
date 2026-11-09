# smaltfl

**Small. Alternative. Flow.** Data pipelines for smaltdb.

smaltfl builds flows visually and runs them in the browser: sources become datasets through typed steps, with an
ontology, actions, enforced access policies and content hashes attached to everything it produces. A planned member
of the [smalt family](https://smaltworks.dev).

> **Status: a working app on real data, and a handoff.** The core and the runtime plugin run flows on smaltdb with
> content hashes, signed manifests, verification and an audit trail. The app (`src/app/`) runs the taxi example on real
> January 2024 trips and three real incidents in the browser: the day's news drawn visual-first, a day that is off
> paused until someone decides (publish as is, keep, fill from another day, the part that arrived, accept a new level),
> and the same for any dataset (a generated sign-in log is the second example).
> - **Start here:** [docs/HANDOFF.md](docs/HANDOFF.md) (what is built, how to check it, what is left)
> - Decisions: [docs/adr/](docs/adr/README.md) (ADR 0001 to 0010)
> - The architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
> - The example it is built and measured against: [docs/SCENARIO.md](docs/SCENARIO.md)
> - The owner's answers and the questions still open: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)
> - What the family already provides: [docs/research/ecosystem-survey.md](docs/research/ecosystem-survey.md)
> - Brand: [docs/brand/DECISIONS.md](docs/brand/DECISIONS.md) (the colour is cobalt teal; the mark is on hold after
>   round 3)

## Development

```sh
npm ci && npm run deps   # dependencies, then the smaltdb build pinned in packed.json
npm run check            # typecheck and tests
npm run bench            # the scenario benchmarks (bench/results/node.json)
npm run build:app        # the app, in dist/app (with the data branch's loads when fetched: git fetch origin data --depth 1)
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
