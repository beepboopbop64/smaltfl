# smaltfl

**Small. Alternative. Flow.** Data pipelines for smaltdb.

smaltfl builds flows visually and runs them in the browser: sources become datasets through typed steps, with an
ontology, actions, enforced access policies and content hashes attached to everything it produces. A planned member
of the [smalt family](https://smaltworks.dev).

> **Status: the first slice, and a first app.** The core and the runtime plugin run a flow on smaltdb: snapshots by
> content hash, keys, reuse, expectations, signed manifests and verification, tested in Node, through the worker
> protocol and on real data. The app (`src/app/`) runs the example flow on 100,000 real January 2024 trips in the
> browser.
> - Decisions so far: [docs/adr/](docs/adr/README.md) (ADR 0001 to 0005)
> - The architecture (draft): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
> - The example it is built and measured against: [docs/SCENARIO.md](docs/SCENARIO.md)
> - Questions still open: [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md)
> - What the family already provides: [docs/research/ecosystem-survey.md](docs/research/ecosystem-survey.md)
> - Brand: [docs/brand/DECISIONS.md](docs/brand/DECISIONS.md) (the colour is cobalt teal; the mark is on hold after
>   round 3)

## Development

```sh
npm ci && npm run deps   # dependencies, then the smaltdb build pinned in packed.json
npm run check            # typecheck and tests
npm run bench            # the scenario benchmarks (bench/results/node.json)
npm run build:app        # the app, in dist/app (with the data branch's 100k sample when fetched)
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
