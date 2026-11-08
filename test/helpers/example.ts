import { readFileSync } from 'node:fs';
import { insertAfter, type FlowDocument, type StepDef } from '../../src/core/document.js';

/** The example document as shipped: format 2, with a day parameter and a publish block that holds a day that is off
 * (ADR 0009 §2). A run of it publishes only with a claim for its day that doesn't hold. */
export function exampleDoc(): FlowDocument {
  return JSON.parse(readFileSync(new URL('../../examples/nyc-taxis-weather.smaltfl.json', import.meta.url), 'utf8')) as FlowDocument;
}

/**
 * The example as it was before it said what holds it: format 1, no day parameter, no publish block. Its runs publish
 * as they always did, so tests about what the flow computes, and timings, stay comparable with every run before
 * ADR 0009 (and its plan keeps the plan/0 hash it had).
 */
export function examplePublishing(): FlowDocument {
  const { publish: _publish, ...doc } = exampleDoc();
  return { ...doc, smaltfl: 1, parameters: (doc.parameters ?? []).filter((p) => p.name !== 'day') };
}

/**
 * The example with its fill step (ADR 0009 amendment 1 S1, step A6): `trips_filled` on the trips, read by trips_valid;
 * the mark carried by every output it reaches (zone_hour and borough_hour as `max(filled_from)` and the rows filled,
 * weather_effect through its SQL), described in the ontology; the flow's donor rule, the same weekday; and the step in
 * the trips' section. Built from the example as shipped, so a change to the example reaches it too. The example ships
 * it once the app reads the checks through a fill step (step A10, C7).
 */
export function exampleFilled(): FlowDocument {
  const doc = exampleDoc();
  const fill: StepDef = {
    id: 'trips_filled', kind: 'fill', inputs: ['trips'], description: 'The trips as they arrived, each marked with the day it came from when a paused day is filled from another day',
    time: 'tpep_pickup_datetime', shift: ['tpep_pickup_datetime', 'tpep_dropoff_datetime'],
  };
  const marked = (s: StepDef): StepDef => {
    if (s.kind === 'aggregate' && s.id === 'zone_hour') return { ...s, measures: [...s.measures, { name: 'filled_from', expr: 'max(filled_from)' }, { name: 'filled', expr: 'count(filled_from)' }] };
    if (s.kind === 'aggregate' && s.id === 'borough_hour') return { ...s, measures: [...s.measures, { name: 'filled_from', expr: 'max(filled_from)' }, { name: 'filled', expr: 'sum(filled)' }] };
    if (s.kind === 'sql' && s.id === 'weather_effect') return { ...s, sql: s.sql.replace(', trips\n', ', trips, filled, filled_from\n').replace('AS vs_dry\n', 'AS vs_dry, sum(h.filled) AS filled, max(h.filled_from) AS filled_from\n') };
    return s;
  };
  const filled = insertAfter(doc, 'trips', fill);
  return {
    ...filled,
    steps: filled.steps.map(marked),
    ontology: doc.ontology && {
      ...doc.ontology,
      properties: [
        ...(doc.ontology.properties ?? []),
        { column: 'filled_from', title: 'Filled from', description: 'The day a row came from, when its own day was filled from another day (ADR 0009 amendment 1): empty for a row that arrived. In a row that sums others up, the latest such day among them.' },
        { column: 'filled', title: 'Filled', description: 'How many of the trips it counts came from another day: 0 when nothing was filled.' },
      ],
    },
    groups: doc.groups?.map((g) => (g.steps.includes('trips') ? { ...g, steps: g.steps.flatMap((x) => (x === 'trips' ? ['trips', 'trips_filled'] : x === 'trips_filled' ? [] : [x])) } : g)),
    publish: { ...doc.publish!, donor: 'weekday' },
  };
}
