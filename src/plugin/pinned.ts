/**
 * Pinned files (ADR 0006 §3): a source's bytes, hashed inside the engine and served to it under `smaltfl:<name>`, so
 * a run records the file it read as the engine observed it, not as the page that sent it says.
 *
 * `pin(name, bytes, expected)` hashes the bytes with WebCrypto here, in the engine's worker, and refuses them when they
 * do not match `expected` (the sha256 the data's published list gives): a second gate after the page's own. The
 * engine reads them through the source below, whose validator is the hash, and every open is noted, so the runtime can
 * say which pinned file each snapshot copied.
 */
import type { Database, OpenedFile, SourceHandler, SourceTarget } from 'smaltdb/engine';
import { sha256Hex } from '../core/hash.js';
import type { SourceFile } from '../core/manifest.js';
import { quoteIdent } from '../core/sqltext.js';

export const PINNED_PREFIX = 'smaltfl:';

interface Pinned {
  bytes: Uint8Array;
  sha256: string;
}

/** Pinned files, by name. One engine per worker; in Node, tests that share the plugin use different names. */
const pins = new Map<string, Pinned>();
/** The pinned files read since the last `takeOpened`, by location. */
const opened = new Map<string, SourceFile>();

export class PinError extends Error {
  override name = 'PinError';
}

/** Pin a file's bytes under a name, after checking them against the hash expected of them. */
export async function pin(name: unknown, bytes: unknown, expected: unknown): Promise<{ name: string; sha256: string; bytes: number }> {
  if (typeof name !== 'string' || name === '' || /[\s/]/.test(name)) throw new PinError('a pinned file needs a plain name (no spaces or slashes)');
  if (bytes === null) {
    pins.delete(name);
    return { name, sha256: '', bytes: 0 };
  }
  const data = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
  if (!data) throw new PinError(`the bytes for ${name} are not bytes`);
  // A copy: the caller's buffer may be reused or transferred after this returns.
  const own = new Uint8Array(data);
  const sha256 = await sha256Hex(own);
  if (expected !== undefined && expected !== null && expected !== sha256) {
    throw new PinError(`${name}: its bytes hash to ${sha256}, not the ${String(expected)} expected of them`);
  }
  pins.set(name, { bytes: own, sha256 });
  return { name, sha256, bytes: own.byteLength };
}

/** The bytes pinned under a name, with their hash, for verify to decode again. */
export function pinned(name: string): Pinned | undefined {
  return pins.get(name);
}

/**
 * The pinned file a source table reads, or null when it reads none. Only an external table whose one location is a
 * pinned file gives that file's rows and nothing else: a view or a query over it may filter them or add others, and a
 * temporary object of the same name hides the table. A table that reads a pinned file any other way is refused, so a
 * run never records a file for rows that aren't all of it, and a re-derivation never decodes anything but the file.
 */
export function pinnedLocation(db: Database, table: string): string | null {
  const sources = db.prepare(`SELECT * FROM ${quoteIdent(table)}`).externalSources;
  const pinnedOnes = sources.filter((s) => s.location.startsWith(PINNED_PREFIX));
  if (pinnedOnes.length === 0) return null;
  const temp = db.query('SELECT 1 FROM sqlite_temp_schema WHERE lower(name) = lower(?)', [table]).rows.length > 0;
  const type = db.query('SELECT type FROM sqlite_schema WHERE lower(name) = lower(?)', [table]).rows[0]?.[0];
  if (temp || type !== 'external' || sources.length !== 1) {
    const how = temp ? 'a temporary object' : type === 'external' ? 'an external table that reads other files too' : `a ${String(type ?? 'query')}`;
    throw new PinError(`${table} reads the pinned file ${pinnedOnes[0]!.location} through ${how}: a source that reads a pinned file must be the external table over it, so that its rows are the file's and nothing else`);
  }
  return pinnedOnes[0]!.location;
}

/** The pinned files opened since the last call, and forget them. */
export function takeOpened(): SourceFile[] {
  const out = [...opened.values()];
  opened.clear();
  return out;
}

const nameOf = (target: SourceTarget): string => target.location.slice(PINNED_PREFIX.length);

function lookup(target: SourceTarget): Pinned {
  const name = nameOf(target);
  const p = pins.get(name);
  if (!p) throw new PinError(`no file is pinned as '${name}' (pin it first)`);
  opened.set(target.location, { location: target.location, sha256: p.sha256, bytes: p.bytes.byteLength });
  return p;
}

/** The source the engine reads pinned files through: the whole file, its hash as the validator. */
export const pinnedSource: SourceHandler = {
  name: 'smaltfl-pinned',
  prefixes: [PINNED_PREFIX],
  async open(target): Promise<OpenedFile> {
    const p = lookup(target);
    return { bytes: async () => ({ bytes: p.bytes, validator: `sha256:${p.sha256}` }) };
  },
  async validator(target) {
    return `sha256:${lookup(target).sha256}`;
  },
  isPattern: () => false,
};
