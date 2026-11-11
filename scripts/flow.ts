/**
 * A flow document from disk, in either form (ADR 0011): a `.smaltfl.json` file as it is, or a folder's `flow.json`
 * with its notebooks loaded beside it and its steps derived (format 4). What the app build and the history builder
 * read a flow with; the tests have the same in test/helpers/notebooks.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { smaltty } from 'smaltkit/typescript';
import type { FlowDocument } from '../src/core/document.js';
import { syncRuleCells } from '../src/core/gatecell.js';
import { expandNotebooks, loadNotebooks, type NotebookRef } from '../src/core/notebook.js';
import { importOntologies } from '../src/core/shared.js';

/**
 * A flow from disk, the shared ontologies it imports brought in (shared.ts: each starting file's meanings and rules,
 * read relative to the flow), and the check cells that enforce a shared file's rules listing them (`syncRuleCells`), so
 * a change to a shared file reaches every flow that imports it.
 */
export async function readFlow(path: string): Promise<FlowDocument> {
  const dir = dirname(path);
  const raw = await importOntologies(JSON.parse(readFileSync(path, 'utf8')) as FlowDocument, async (p) => JSON.parse(readFileSync(join(dir, p), 'utf8')));
  if (!(raw as { notebooks?: NotebookRef[] }).notebooks) return raw;
  const loaded = await loadNotebooks(raw as FlowDocument & { notebooks: NotebookRef[] }, async (p) => readFileSync(join(dir, p), 'utf8'));
  return syncRuleCells(await expandNotebooks(loaded as FlowDocument, smaltty));
}

/** The flow's data list: `<doc>.data.json` beside a `.smaltfl.json`, `data.json` in a folder. */
export const bindingsPath = (flowPath: string): string => (flowPath.endsWith('.smaltfl.json') ? flowPath.replace(/\.smaltfl\.json$/, '.data.json') : join(dirname(flowPath), 'data.json'));

/**
 * The check cells of a flow folder's notebooks written on disk as reading the flow brings them in step with its
 * ontology and the shared ontologies it imports (`npm run rules:sync`): what each cell lists of its file's rules. The
 * notebooks whose text changed, by path; a `.smaltfl.json` flow has none.
 */
export async function syncFlowFiles(path: string): Promise<string[]> {
  const doc = await readFlow(path);
  const dir = dirname(path);
  const changed: string[] = [];
  for (const nb of doc.notebooks ?? []) {
    const file = join(dir, nb.path);
    if (readFileSync(file, 'utf8') === nb.source) continue;
    writeFileSync(file, nb.source);
    changed.push(file);
  }
  return changed;
}
