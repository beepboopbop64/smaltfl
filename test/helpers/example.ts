import { readFileSync } from 'node:fs';
import type { FlowDocument } from '../../src/core/document.js';

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
