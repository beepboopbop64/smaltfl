# Writing a flow

A flow is a folder: a `flow.json` that says what the flow reads, who may do what and what it watches, and the
[smaltnb](https://stenhoor.github.io/smaltnb/) notebooks (`*.nb.ts`) whose cells are its steps
([ADR 0011](../adr/0011-notebooks-as-the-step-surface.md)). The examples are in
[`examples/`](../../examples/): `control-estate/`, `security-signins/`, `security-lockouts/`, `controls/` and
`nyc-taxis-weather/`.

## flow.json

```json
{
  "smaltfl": 4,
  "id": "signins",
  "name": "Sign-ins",
  "parameters": [{ "name": "day", "type": "text", "default": null }],
  "sources": [{ "id": "auth", "table": "auth_file", "description": "The day's authentication events, one file a day" }],
  "notebooks": ["checks.nb.ts", "counts.nb.ts"],
  "calendar": { "base": "us" },
  "ontology": { "import": ["../ontologies/auth.json"] },
  "policies": { "principals": [{ "id": "owner", "name": "Owner", "owner": true }], "rules": [] },
  "publish": { "hold": ["checks", "wrong"], "period": "day", "watch": { "auth": { "history": "history.json", "time": "event_time" } } }
}
```

- **sources**: the files the flow reads, bound to real files by id in `<flow>.data.json`.
- **ontology**: what columns mean, the rules rows are held to and the fixes a held day may be offered; `import` brings
  in a file's shared ontology.
- **policies**: people, what each may open (rows and columns), and who may decide a held day.
- **publish**: what holds a day (`checks`: a check that holds; `wrong`: the day's story says it is off), and the
  datasets **watched**, each judged against its own history.

## A notebook

```ts
import { cell, md, param, sql } from 'smaltnb';
import { check, fill, gate, publish, source } from 'smaltfl/notebook';

cell('params');
export const params = param({ day: param.text('') });

cell('auth');
export const auth = source('auth');

cell('about', { lang: 'md' });
md`Sign-ins with a known result, on the day`;

cell('auth_valid');
export const auth_valid = check(auth, {
  rules: [
    { name: 'known_result', check: "result IN ('success', 'fail', 'locked')", onFail: 'drop' },
    { name: 'has_user', check: 'user IS NOT NULL', onFail: 'warn' },
  ],
  maxDropped: 0.05,
  ontology: { method_one_of: 'on', latency_ms_range: 'on' },
});

cell('by_method', { lang: 'sql' });
export const by_method = sql`SELECT method, count(*) AS n FROM ${auth_valid} GROUP BY 1`;

cell('by_method_gate');
export const by_method_gate = gate(by_method, { layer: 'gold', reconcile: { key: 'method' } });

cell('published');
publish(by_method, { description: 'Sign-ins by method' });
```

A notebook is TypeScript that `tsc` checks as written. The cells smaltfl reads:

| Cell | What it is |
|---|---|
| `source(id)` | a source's rows for the day |
| `check(input, { rules, maxDropped, ontology })` | rules a row must meet: `drop`, `warn` or `fail` (hold); `ontology` switches the ontology's rules for the file |
| `fill(input, { time, shift })` | where a held day's missing rows come in from another day, each marked `filled_from` |
| `` sql`…` `` | a SQL step; `${name}` reads another cell |
| `gate(node, { layer, checks, scope, needs, reconcile })` | the node's checks: bronze, silver or gold defaults, each check `hold`, `warn` or `off` |
| `publish(node, { description })` | a dataset readers get |

Another notebook's exports are imported like any module (`import { posture } from './posture.nb.js'`).

## From the notebook to a run

People say what, the machine decides how ([ADR 0004](../adr/0004-the-flow-plan.md)): the notebooks are translated into
a **flow plan**, hashed by content; only `emit.ts` turns it into the engine's SQL. A run records a signed manifest of
what it read and made. Names and display fields stay out of the hashes, so renaming a column's title changes no run.

## Building the app on your flow

```sh
npm run build:app -- --flow examples/control-estate/flow.json --out dist/app-estate
```

The build reads the flow's data list (`data.json`: where each source's files are, or the generator that makes them),
measures each watched dataset's history on the runtime, keeps a sample for the classifier, and writes a static page.
