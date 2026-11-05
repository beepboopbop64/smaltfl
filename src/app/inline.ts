/** The engine in the page, for browsers where the worker can't start. Loaded by engine.ts only then. */
import { Database } from 'smaltdb/engine';
import io from '@smaltdb/io';
import external from '@smaltdb/external';
import parquet from '@smaltdb/parquet';
import smaltfl from '../plugin/index.js';
import type { Engine } from './engine.js';

export function openInPage(): Engine {
  const db = Database.openMemory({ plugins: [io, external, parquet, smaltfl] });
  return {
    mode: 'page',
    async query(sql) {
      const r = await db.queryAsync(sql);
      return { columns: r.columns, rows: r.rows };
    },
    async exec(sql) {
      await db.execAsync(sql);
    },
    callPlugin: (plugin, method, args) => db.callPlugin(plugin, method, args),
  };
}
