import { readFileSync } from 'node:fs';
import type { FlowDocument, StepDef } from '../../src/core/document.js';

/** The example document as shipped: format 2, with a day parameter, a publish block that holds a day that is off
 * (ADR 0009 §2), and a fill step on its watched trips (amendment 1 S1). A run of it publishes only with a claim for its
 * day that doesn't hold. */
export function exampleDoc(): FlowDocument {
  return JSON.parse(readFileSync(new URL('../../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
}

/**
 * The example as it was before it said what holds it: format 1, no day parameter, no publish block, and no fill step.
 * Its runs publish as they always did, so tests about what the flow computes, and timings, stay comparable with every
 * run before ADR 0009 (and its plan keeps the plan/0 hash it had).
 */
export function examplePublishing(): FlowDocument {
  const { publish: _publish, ...doc } = exampleUnfilled();
  return { ...doc, smaltfl: 1, parameters: (doc.parameters ?? []).filter((p) => p.name !== 'day') };
}

/**
 * The example with its fill step (ADR 0009 amendment 1 S1, steps A6 and A10), as it ships: `trips_filled` on the trips,
 * read by trips_valid; the mark carried by every output it reaches (zone_hour and borough_hour as `max(filled_from)`
 * and the rows filled, weather_effect through its SQL), described in the ontology; the flow's donor rule, the same
 * weekday; and the step in the trips' section.
 */
export function exampleFilled(): FlowDocument {
  return exampleDoc();
}

/**
 * The example as it shipped before its fill step (ADR 0009 slice 1, with ADR 0010's nouns): the fill step taken out,
 * the trips read by trips_valid again, the mark's measures, columns and descriptions gone, no donor rule. Its plan/1
 * hash is 7d7236ea… (test/plan.test.ts), which shows this undoes exactly what the fill step added.
 */
export function exampleUnfilled(): FlowDocument {
  const doc = exampleDoc();
  const marks = new Set(['filled_from', 'filled']);
  const unmarked = (s: StepDef): StepDef | null => {
    if (s.kind === 'fill') return null;
    if (s.kind === 'expectations' && s.inputs.includes('trips_filled')) return { ...s, inputs: s.inputs.map((x) => (x === 'trips_filled' ? 'trips' : x)) };
    if (s.kind === 'aggregate') return { ...s, measures: s.measures.filter((m) => !marks.has(m.name)) };
    if (s.kind === 'sql' && s.id === 'weather_effect') return { ...s, sql: s.sql.replace(', trips, filled, filled_from\n', ', trips\n').replace('AS vs_dry, sum(h.filled) AS filled, max(h.filled_from) AS filled_from\n', 'AS vs_dry\n') };
    return s;
  };
  const { donor: _donor, ...publish } = doc.publish!;
  return {
    ...doc,
    steps: doc.steps.map(unmarked).filter((s): s is StepDef => s !== null),
    ontology: doc.ontology && { ...doc.ontology, properties: (doc.ontology.properties ?? []).filter((p) => !marks.has(p.column)) },
    groups: doc.groups?.map((g) => ({ ...g, steps: g.steps.filter((x) => x !== 'trips_filled') })),
    publish,
  };
}
