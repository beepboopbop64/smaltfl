/**
 * Fetching a data file the way an auditor would accept (ADR 0006 §2): its bytes are hashed as they arrive and compared
 * with the sha256 and size the data's list gives for them. A mismatch is fetched once more, past any cache, before it
 * is refused; a network error is "not checked", never an alarm. A Parquet file travels base64-encoded as
 * `<name>.txt` (the artifact host serves text but not Parquet), and it is the decoded bytes that are hashed.
 */
import { sha256Hex } from '../core/hash.js';
import { classify, type FileCheck } from '../core/integrity.js';

export interface Expected {
  sha256: string;
  bytes: number;
  from?: string;
}

/** A file refused: its check says why. */
export class IntegrityError extends Error {
  override name = 'IntegrityError';
  constructor(readonly check: FileCheck) {
    super(`${check.path}: ${check.class}`);
  }
}

async function fetchBytes(path: string, reload: boolean): Promise<{ bytes: Uint8Array<ArrayBuffer> | null; status: number }> {
  const binary = path.endsWith('.parquet');
  const res = await fetch(`data/${path}${binary ? '.txt' : ''}`, reload ? { cache: 'reload' } : {});
  if (!res.ok) return { bytes: null, status: res.status };
  if (!binary) return { bytes: new Uint8Array(await res.arrayBuffer()), status: res.status };
  const text = atob((await res.text()).trim());
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return { bytes, status: res.status };
}

/**
 * The file's bytes, checked: resolved only when they match `expected`. `seen` is the sha256 this record last saw for
 * the file; `commit` the data branch commit the list came from. Every outcome is reported to `onCheck`, used or not.
 */
export async function fetchChecked(path: string, expected: Expected | undefined, options: { seen?: string; commit?: string | null; onCheck?: (c: FileCheck) => void } = {}): Promise<Uint8Array<ArrayBuffer>> {
  const at = new Date().toISOString();
  let got: { bytes: Uint8Array<ArrayBuffer> | null; status: number } | null = null;
  let actual: { sha256: string; bytes: number } | null = null;
  for (const reload of [false, true]) {
    try {
      got = await fetchBytes(path, reload);
    } catch {
      got = null;
    }
    actual = got?.bytes ? { sha256: await sha256Hex(got.bytes), bytes: got.bytes.byteLength } : null;
    // Only a mismatch is worth a second fetch: the cache may hold an older build's file.
    if (!actual || !expected || (actual.sha256 === expected.sha256 && actual.bytes === expected.bytes)) break;
  }
  const c = classify({ ...(expected ? { listed: expected } : {}), actual, ...(got && !got.bytes ? { status: got.status } : {}), ...(options.seen ? { seen: options.seen } : {}) });
  const check: FileCheck = {
    path,
    ...(expected?.from ? { from: expected.from } : {}),
    class: c,
    ...(expected ? { expected: expected.sha256 } : {}),
    actual: actual?.sha256 ?? null,
    ...(actual ? { bytes: actual.bytes } : expected ? { bytes: expected.bytes } : {}),
    commit: options.commit ?? null,
    ...(c === 'republished' && options.seen ? { was: options.seen } : {}),
    at,
  };
  options.onCheck?.(check);
  if (c !== 'same' && c !== 'new' && c !== 'republished') throw new IntegrityError(check);
  return got!.bytes!;
}
