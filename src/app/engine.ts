/**
 * The app's connection to the engine. In a browser that allows it, the engine runs in a worker (worker.js), so the
 * page stays responsive while a flow runs; otherwise it runs in the page (inline.js, loaded only then).
 */
import { open } from 'smaltdb';
import type { PluginCaller } from '../core/protocol.js';

export interface Engine extends PluginCaller {
  /** Where the engine runs. */
  mode: 'worker' | 'page';
  query(sql: string): Promise<{ columns: string[]; rows: unknown[][] }>;
  exec(sql: string): Promise<void>;
}

export async function connect(): Promise<Engine> {
  try {
    const db = await open(':memory:', { storage: 'memory', worker: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) });
    await db.query('SELECT 1', [], { rowMode: 'array' });
    return {
      mode: 'worker',
      async query(sql) {
        const r = await db.query(sql, [], { rowMode: 'array' });
        return { columns: r.columns, rows: [...r] };
      },
      async exec(sql) {
        await db.exec(sql);
      },
      callPlugin: (plugin, method, args, options) => db.callPlugin(plugin, method, args, options),
    };
  } catch (e) {
    console.warn('smaltfl: the engine worker did not start, so the engine runs in the page', e);
    const inline = (await import(/* @vite-ignore */ new URL('./inline.js', import.meta.url).href)) as { openInPage(): Engine };
    return inline.openInPage();
  }
}
