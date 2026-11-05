import { readFileSync } from 'node:fs';
import { Database } from 'smaltdb/engine';
import smaltfl from '../../src/plugin/index.js';

/** The pinned smaltdb's version, which run keys depend on. */
export const SMALTDB = (JSON.parse(readFileSync(new URL('../../node_modules/smaltdb/package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** An in-memory engine with the smaltfl plugin installed, as a page's engine worker would have it. */
export function openEngine(): Database {
  return Database.openMemory({ plugins: [smaltfl] });
}
