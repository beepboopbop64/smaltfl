/**
 * Dataset content hashes (ARCHITECTURE.md §6), computed in the engine worker so the rows never leave it.
 *
 * A dataset's content is its schema and the multiset of its rows: the same rows in any order have the same hash.
 * Rather than sort the rows (in the engine, the slowest part of hashing), each row is hashed on its own, and the row
 * hashes are sorted. Each row is encoded value by value, each value a tag byte and its payload:
 *
 *   0x00 NULL · 0x01 INTEGER, 8 bytes big-endian two's complement · 0x02 REAL, 8 bytes big-endian IEEE-754 (-0 as 0)
 *   0x03 TEXT, uint32 big-endian byte length and UTF-8 · 0x04 BLOB, uint32 big-endian length and the bytes
 *
 *   row     = SHA-256(the row's encoding)
 *   content = SHA-256( "smaltfl/dataset/0\n" ‖ canonical JSON of [[name, declared type], …] ‖ "\n" ‖ uint64 rows ‖
 *                      SHA-256(chunk 0) ‖ SHA-256(chunk 1) ‖ … )
 *
 * where the chunks are the row hashes in ascending order, 32,768 to a chunk (1 MiB). Collision resistance is
 * SHA-256's: two different multisets of rows with the same hash would need a SHA-256 collision.
 *
 * The cursor never stays open across an await: the scan and the row hashes are synchronous, and the chunk digests
 * are started on copies and awaited afterwards.
 */
import type { Database } from 'smaltdb/engine';
import { canonicalJSON } from '../core/canonical.js';
import { hex, sha256, utf8 } from '../core/hash.js';
import { SHA256_PADDING, sha256Into } from '../core/sha256.js';
import { quoteIdent as q } from '../core/sqltext.js';

/** Row hashes to a chunk of the sorted list: 1 MiB. */
export const ROWS_PER_CHUNK = 32768;

export type Declared = 'INTEGER' | 'REAL' | 'TEXT' | 'BLOB' | 'ANY';

export interface TableHash {
  content: string;
  rows: number;
  columns: [name: string, declared: Declared][];
}

/** The declared types of a table's columns, normalized to the five a STRICT table takes. */
export function tableColumns(db: Database, table: string): [string, Declared][] {
  return db.query('SELECT name, type FROM pragma_table_info(?)', [table]).rows.map(([n, t]) => [String(n), normalize(String(t ?? ''))]);
}

const STATIC: Record<Exclude<Declared, 'ANY'>, 'int' | 'real' | 'text' | 'blob'> = { INTEGER: 'int', REAL: 'real', TEXT: 'text', BLOB: 'blob' };

/**
 * A source table's columns as a snapshot keeps them: the engine's static types, and for an external table, whose
 * columns read as untyped (`any`) even when declared, the declared types where it has them. The runtime's snapshot
 * and a measure before the run copy a source into a table of these columns, so both hash it the same.
 */
export function sourceColumns(db: Database, table: string, st: { columns: readonly string[]; columnTypes: readonly string[]; externalSources: readonly unknown[] }): [string, string][] {
  const declared = st.externalSources.length > 0 ? tableColumns(db, table) : [];
  return st.columns.map((name, k): [string, string] => {
    const type = st.columnTypes[k]!;
    const d = declared[k];
    return [name, type === 'any' && d && d[1] !== 'ANY' ? STATIC[d[1]] : type];
  });
}

/** SQLite's affinity rules, folded onto the STRICT types; anything else is ANY, which keeps values as they are. */
export function normalize(declared: string): Declared {
  const t = declared.toUpperCase();
  if (t.includes('INT')) return 'INTEGER';
  if (t.includes('CHAR') || t.includes('CLOB') || t.includes('TEXT')) return 'TEXT';
  if (t.includes('BLOB')) return 'BLOB';
  if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'REAL';
  return 'ANY';
}

const STORAGE: Record<Exclude<Declared, 'ANY'>, string> = { INTEGER: 'integer', REAL: 'real', TEXT: 'text', BLOB: 'blob' };

export async function hashTable(db: Database, table: string): Promise<TableHash> {
  const columns = tableColumns(db, table);
  if (columns.length === 0) throw new Error(`no table ${table} to hash`);
  // An ANY column's values bring their storage type with them; every other column has one.
  const select = columns.map(([n, t]) => (t === 'ANY' ? `typeof(${q(n)}), ${q(n)}` : q(n))).join(', ');
  const types = columns.map(([, t]) => (t === 'ANY' ? null : STORAGE[t]));
  const hasher = new RowHasher();
  const cursor = db.prepare(`SELECT ${select} FROM ${q(table)}`).cursor();
  try {
    for (let row = cursor.next(); row !== null; row = cursor.next()) {
      let k = 0;
      for (const type of types) {
        if (type === null) {
          const t = row[k++] as string;
          hasher.value(row[k++], t);
        } else {
          hasher.value(row[k++], type);
        }
      }
      hasher.endRow();
    }
  } finally {
    cursor.close();
  }
  const rows = hasher.rows;
  const chunks = await hasher.sortedChunkDigests();
  const count = new Uint8Array(8);
  new DataView(count.buffer).setBigUint64(0, BigInt(rows));
  const parts = [utf8(`smaltfl/dataset/0\n${canonicalJSON(columns)}\n`), count, ...chunks];
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return { content: hex(await sha256(all)), rows, columns };
}

const encoder = new TextEncoder();

/** Encodes each row into a scratch buffer, hashes it there, and keeps the row hashes as words for sorting. */
class RowHasher {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  private pos = 0;
  private words = new Uint32Array(8 * 1024);
  rows = 0;

  value(v: unknown, type: string): void {
    if (v === null || type === 'null') {
      this.room(1);
      this.buf[this.pos++] = 0;
      return;
    }
    switch (type) {
      case 'integer': {
        this.room(9);
        this.buf[this.pos] = 1;
        if (typeof v === 'bigint') {
          this.view.setBigInt64(this.pos + 1, v);
        } else {
          const n = v as number;
          const hi = Math.floor(n / 4294967296);
          this.view.setInt32(this.pos + 1, hi);
          this.view.setUint32(this.pos + 5, n - hi * 4294967296);
        }
        this.pos += 9;
        return;
      }
      case 'real': {
        const x = v as number;
        this.room(9);
        this.buf[this.pos] = 2;
        this.view.setFloat64(this.pos + 1, x === 0 ? 0 : x);
        this.pos += 9;
        return;
      }
      case 'text': {
        const s = v as string;
        this.room(5 + s.length * 3);
        this.buf[this.pos] = 3;
        const { written } = encoder.encodeInto(s, this.buf.subarray(this.pos + 5));
        this.view.setUint32(this.pos + 1, written!);
        this.pos += 5 + written!;
        return;
      }
      case 'blob': {
        const b = v as Uint8Array;
        this.room(5 + b.length);
        this.buf[this.pos] = 4;
        this.view.setUint32(this.pos + 1, b.length);
        this.buf.set(b, this.pos + 5);
        this.pos += 5 + b.length;
        return;
      }
      default:
        throw new Error(`cannot hash a value of type ${type}`);
    }
  }

  endRow(): void {
    this.room(0);
    if ((this.rows + 1) * 8 > this.words.length) {
      const grown = new Uint32Array(this.words.length * 2);
      grown.set(this.words);
      this.words = grown;
    }
    sha256Into(this.buf, this.pos, this.words, this.rows * 8);
    this.rows++;
    this.pos = 0;
  }

  /** Room for `n` more bytes, and the padding a row hash writes after them. */
  private room(n: number): void {
    const need = this.pos + n + SHA256_PADDING;
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buf.subarray(0, this.pos));
    this.buf = grown;
    this.view = new DataView(grown.buffer);
  }

  /** The row hashes in ascending order, cut into chunks, each chunk's SHA-256 (in order). */
  async sortedChunkDigests(): Promise<Uint8Array[]> {
    const words = this.words;
    const order = new Uint32Array(this.rows);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => {
      for (let k = 0; k < 8; k++) {
        const d = words[a * 8 + k]! - words[b * 8 + k]!;
        if (d !== 0) return d;
      }
      return 0;
    });
    const digests: Promise<ArrayBuffer>[] = [];
    for (let start = 0; start < order.length; start += ROWS_PER_CHUNK) {
      const end = Math.min(order.length, start + ROWS_PER_CHUNK);
      const chunk = new Uint8Array((end - start) * 32);
      const view = new DataView(chunk.buffer);
      for (let i = start; i < end; i++) {
        const w = order[i]! * 8;
        for (let k = 0; k < 8; k++) view.setUint32((i - start) * 32 + k * 4, words[w + k]!);
      }
      digests.push(crypto.subtle.digest('SHA-256', chunk));
    }
    return (await Promise.all(digests)).map((d) => new Uint8Array(d));
  }
}
