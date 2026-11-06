/**
 * File integrity (ADR 0006 §2): what a data file the app read is, against the list the data branch publishes and
 * against what this browser's record saw before. Pure, so the app and the tests (and an auditor's script) agree.
 *
 *   same          the bytes match the list, and the record saw these same bytes before
 *   new           the bytes match the list, and the record hasn't seen this file before
 *   republished   the bytes match the list, but the list changed since the record last saw the file: the data was
 *                 rebuilt or the source republished it (amber: worth knowing, not tampering)
 *   corrupt       the bytes don't match the list: refused
 *   missing       the file isn't there (a 404): refused
 *   unlisted      the file isn't in the list at all: refused
 *   list          the list itself doesn't match the hash the app was built with, or its entries disagree: refused
 *   not-checked   the file couldn't be fetched (a network error): nothing to judge, and nothing to run on
 */
export type FileClass = 'same' | 'new' | 'republished' | 'corrupt' | 'missing' | 'unlisted' | 'list' | 'not-checked';

export interface FileCheck {
  /** The file as the app names it (loads/…parquet, zones.csv), and where the data branch keeps it. */
  path: string;
  from?: string;
  class: FileClass;
  /** The sha256 and size the list gives, and what the bytes fetched hash to (null: nothing fetched). */
  expected?: string;
  actual?: string | null;
  bytes?: number;
  /** The data branch commit the list came from. */
  commit?: string | null;
  /** What this record saw before, when it differs. */
  was?: string;
  at: string;
}

export interface Observed {
  /** What the list gives for the file, or undefined when it isn't listed. */
  listed?: { sha256: string; bytes: number };
  /** The bytes' hash and size, or null when nothing could be fetched; and the HTTP status when it wasn't a 2xx. */
  actual: { sha256: string; bytes: number } | null;
  status?: number;
  /** The sha256 this record last saw for the file, if it saw it. */
  seen?: string;
}

export function classify(o: Observed): FileClass {
  if (o.status === 404) return 'missing';
  if (!o.actual) return 'not-checked';
  if (!o.listed) return 'unlisted';
  if (o.actual.sha256 !== o.listed.sha256 || o.actual.bytes !== o.listed.bytes) return 'corrupt';
  if (o.seen === undefined) return 'new';
  return o.seen === o.actual.sha256 ? 'same' : 'republished';
}

/** Whether a file of this class may be used: only bytes that match the list. */
export const usable = (c: FileClass): boolean => c === 'same' || c === 'new' || c === 'republished';
/** How it shows: red for refused, amber for republished, grey for not checked, none for the rest. */
export const severityOf = (c: FileClass): 'alert' | 'warn' | 'note' | 'ok' => (c === 'corrupt' || c === 'missing' || c === 'unlisted' || c === 'list' ? 'alert' : c === 'republished' ? 'warn' : c === 'not-checked' ? 'note' : 'ok');

/** A file check, said: a title and a sentence for a person, with both hashes where they differ. */
export function describe(c: FileCheck): { title: string; detail: string } {
  const name = c.path;
  const where = c.commit ? ` at data commit ${c.commit.slice(0, 12)}` : '';
  switch (c.class) {
    case 'same':
      return { title: `${name}: the bytes published`, detail: `Its ${fmtBytes(c.bytes)} hash to the sha256 the data's list gives${where}, as they did when this browser last read it.` };
    case 'new':
      return { title: `${name}: the bytes published`, detail: `Its ${fmtBytes(c.bytes)} hash to the sha256 the data's list gives${where}. This browser hasn't read it before.` };
    case 'republished':
      return { title: `${name} was republished`, detail: `Its bytes match the data's list${where}, but not what this browser read before (${(c.was ?? '').slice(0, 16)}…, now ${(c.actual ?? '').slice(0, 16)}…): the data was rebuilt, or its source republished it. Worth knowing; nothing is wrong with the bytes.` };
    case 'corrupt':
      return { title: `${name} isn't the file published`, detail: `Its bytes hash to ${c.actual ?? 'nothing'}, where the data's list${where} gives ${c.expected}. It was fetched again and still didn't match, so it isn't used: the flow keeps its last good run.` };
    case 'missing':
      return { title: `${name} is missing`, detail: `The data's list${where} names it, and it isn't there. Nothing ran on it.` };
    case 'unlisted':
      return { title: `${name} isn't in the data's list`, detail: `A file the list doesn't name has no hash to check it against, so it isn't used.` };
    case 'list':
      return name === 'MANIFEST.json'
        ? { title: "The data's list isn't the one this app was built with", detail: `MANIFEST.json hashes to ${c.actual ?? 'nothing'}, where the app expects ${c.expected}: no file can be checked against it, so none is used.` }
        : { title: "The data's list and the app's disagree", detail: `The app expects ${name} to hash to ${c.expected}; the data's list${where} says ${c.actual ?? 'nothing'}. No file can be trusted while they disagree, so none is used.` };
    case 'not-checked':
      return { title: `${name} couldn't be fetched`, detail: 'The network failed before its bytes arrived: nothing to check, and nothing ran on it. Try again.' };
  }
}

export const fmtBytes = (n?: number) => (n === undefined ? 'bytes' : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} kB` : `${n} bytes`);
