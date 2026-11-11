import { readFileSync } from 'node:fs';
import { smaltty } from 'smaltkit/typescript';
import type { FlowDocument } from '../../src/core/document.js';
import { syncRuleCells } from '../../src/core/gatecell.js';
import { expandNotebooks, loadNotebooks, type ExpandOptions } from '../../src/core/notebook.js';
import { importOntologies } from '../../src/core/shared.js';

/** smaltty, the TypeScript kit smaltnb's parser works on, as the app's pages and the tests get it. */
export const ts = smaltty;

/** A format-4 flow from its folder: `flow.json` with its notebooks loaded and its steps derived (ADR 0011). */
export async function loadFlowDir(dir: URL, options: ExpandOptions = {}): Promise<FlowDocument> {
  const raw = await importOntologies(JSON.parse(readFileSync(new URL('flow.json', dir), 'utf8')) as FlowDocument, async (path) => JSON.parse(readFileSync(new URL(path, dir), 'utf8')));
  const loaded = await loadNotebooks(raw, async (path) => readFileSync(new URL(path, dir), 'utf8'));
  return syncRuleCells(await expandNotebooks(loaded as FlowDocument, ts, options));
}

/** The sign-ins example in its notebook form (examples/security-signins/). */
export const signinsDir = new URL('../../examples/security-signins/', import.meta.url);
