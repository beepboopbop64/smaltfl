/**
 * A flow document from disk, in either form (ADR 0011): a `.smaltfl.json` file as it is, or a folder's `flow.json`
 * with its notebooks loaded beside it and its steps derived (format 4). What the app build and the history builder
 * read a flow with; the tests have the same in test/helpers/notebooks.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { smaltty } from 'smaltkit/typescript';
import type { FlowDocument } from '../src/core/document.js';
import { expandNotebooks, loadNotebooks, type NotebookRef } from '../src/core/notebook.js';

export async function readFlow(path: string): Promise<FlowDocument> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as FlowDocument & { notebooks?: NotebookRef[] };
  if (!raw.notebooks) return raw;
  const dir = dirname(path);
  const loaded = await loadNotebooks(raw, async (p) => readFileSync(join(dir, p), 'utf8'));
  return expandNotebooks(loaded as FlowDocument, smaltty);
}

/** The flow's data list: `<doc>.data.json` beside a `.smaltfl.json`, `data.json` in a folder. */
export const bindingsPath = (flowPath: string): string => (flowPath.endsWith('.smaltfl.json') ? flowPath.replace(/\.smaltfl\.json$/, '.data.json') : join(dirname(flowPath), 'data.json'));
