/**
 * ZIP archives with no compression (the STORE method), written and read with no dependency: how an audit bag (bag.ts)
 * leaves the browser as one file. A stored entry is its file's bytes as they are, so every ZIP tool opens the archive
 * (`unzip`, the file manager of every system) and what an auditor extracts is byte for byte what was hashed.
 *
 * zip() writes a local file header and the bytes for each file, then the central directory and its end record. Each
 * entry has its CRC-32 (IEEE 802.3), its name in UTF-8 (general purpose bit 11), a Unix file mode (rw-r--r--) and a
 * DOS date and time. A DOS time has no time zone: it is written in UTC, so the same files make the same bytes
 * wherever they are zipped. There is no ZIP64: an archive of 4 GiB or more, or of 65,535 files or more (0xFFFF and
 * 0xFFFFFFFF mean "see the ZIP64 record"), is refused.
 *
 * unzip() reads the central directory, checks each entry against its local header and checks its CRC-32. It reads
 * what zip() writes and refuses the rest with a message that says so: compressed or encrypted entries, ZIP64, archives
 * split across disks. An auditor's own tools open those; this reader only needs to read our own. It also refuses what
 * an auditor's `unzip` would extract as something other than what it read, so that what the audit script checks is
 * what lands on the auditor's disk: entries whose bytes overlap, a central directory that holds more entries than its
 * end record counts, links and other entries that aren't plain files, and a path that is both a file and a folder.
 */
import { utf8 } from './hash.js';

/** A file in an archive. */
export interface ZipEntry {
  /** A relative path with forward slashes. Folders come from the paths: there are no folder entries. */
  path: string;
  bytes: Uint8Array;
  /** When it was last changed, to the two seconds a DOS time holds, in UTC. Left out: 1980-01-01 00:00. */
  date?: Date;
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const LOCAL_SIZE = 30;
const CENTRAL_SIZE = 46;
const END_SIZE = 22;
/** General purpose bit 11: the name is UTF-8. */
const UTF8_NAMES = 0x0800;
/** 2.0, the version most writers give stored files; readers of 1.0 read them as well. */
const VERSION = 20;
/** Made on Unix, so the external attributes carry a file mode. */
const MADE_BY = (3 << 8) | VERSION;
/** A regular file, rw-r--r--, in the upper half of the external attributes. */
const FILE_MODE = (0o100644 << 16) >>> 0;
/** The file type bits of a Unix mode, and the types of a plain file and of a folder. */
const TYPE_BITS = 0o170000;
const REGULAR = 0o100000;
const FOLDER = 0o040000;
/** 0xFFFF entries and 0xFFFFFFFF sizes or offsets mean ZIP64, so the largest plain values are one less. */
const MAX_ENTRIES = 0xfffe;
const MAX_BYTES = 0xfffffffe;
const DOS_FIRST = Date.UTC(1980, 0, 1);
const DOS_LAST = Date.UTC(2107, 11, 31, 23, 59, 58);
const METHODS: Record<number, string> = { 8: 'deflate', 9: 'deflate64', 12: 'bzip2', 14: 'LZMA', 93: 'Zstandard', 95: 'XZ' };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as ZIP, PNG and Ethernet use it (IEEE 802.3, reflected polynomial 0xEDB88320), as an unsigned number. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Why a path can't name a file in an archive, or undefined if it can. */
function pathProblem(path: string): string | undefined {
  if (path === '') return 'is empty';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'is absolute: entries have relative paths';
  if (path.includes('\\')) return 'has a backslash: entries use forward slashes';
  if (path.includes('\0')) return 'has a NUL character';
  // UTF-8 can't hold a lone surrogate: it would be written as U+FFFD, a name other than the one given.
  if (/[\uD800-\uDFFF]/u.test(path)) return 'has a lone surrogate, which UTF-8 cannot hold';
  for (const segment of path.split('/')) {
    if (segment === '..') return "has a '..' segment";
    if (segment === '.') return "has a '.' segment";
    if (segment === '') return 'has an empty segment';
  }
  return undefined;
}

/** A path that is both a file of the set and the folder of another file in it, as [file, other], or undefined. */
function fileAndFolder(paths: ReadonlySet<string>): [string, string] | undefined {
  for (const path of paths) {
    for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) {
      if (paths.has(path.slice(0, i))) return [path.slice(0, i), path];
    }
  }
  return undefined;
}

function dosTime(when: Date): { time: number; date: number } {
  const ms = when.getTime();
  if (Number.isNaN(ms)) throw new Error('zip: an entry has an invalid date');
  const d = new Date(Math.min(Math.max(ms, DOS_FIRST), DOS_LAST));
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >>> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function fromDosTime(time: number, date: number): Date {
  return new Date(Date.UTC((date >>> 9) + 1980, ((date >>> 5) & 0xf) - 1, date & 0x1f, time >>> 11, (time >>> 5) & 0x3f, (time & 0x1f) * 2));
}

/** A ZIP archive of the files, stored, in the order given. */
export function zip(files: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  if (files.length > MAX_ENTRIES) throw new Error(`zip: ${files.length} files are more than an archive without ZIP64 holds (${MAX_ENTRIES})`);
  const names = new Set<string>();
  for (const file of files) {
    const problem = pathProblem(file.path);
    if (problem) throw new Error(`zip: the path ${JSON.stringify(file.path)} ${problem}`);
    if (names.has(file.path)) throw new Error(`zip: ${file.path} is in the archive twice`);
    names.add(file.path);
  }
  const both = fileAndFolder(names);
  if (both) throw new Error(`zip: ${both[0]} is both a file and the folder of ${both[1]}`);
  const entries = files.map((file) => {
    const name = utf8(file.path);
    if (name.length > 0xffff) throw new Error(`zip: the path of ${file.path.slice(0, 40)}... is longer than 65,535 bytes`);
    return { name, bytes: file.bytes, crc: crc32(file.bytes), ...dosTime(file.date ?? new Date(DOS_FIRST)) };
  });
  let filesSize = 0;
  let directorySize = 0;
  for (const e of entries) {
    filesSize += LOCAL_SIZE + e.name.length + e.bytes.length;
    directorySize += CENTRAL_SIZE + e.name.length;
  }
  const total = filesSize + directorySize + END_SIZE;
  if (total > MAX_BYTES) throw new Error(`zip: the archive would be ${total} bytes, more than an archive without ZIP64 holds (4 GiB)`);

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let at = 0;
  for (const e of entries) {
    offsets.push(at);
    view.setUint32(at, LOCAL, true);
    view.setUint16(at + 4, VERSION, true);
    view.setUint16(at + 6, UTF8_NAMES, true);
    view.setUint16(at + 8, 0, true); // stored
    view.setUint16(at + 10, e.time, true);
    view.setUint16(at + 12, e.date, true);
    view.setUint32(at + 14, e.crc, true);
    view.setUint32(at + 18, e.bytes.length, true);
    view.setUint32(at + 22, e.bytes.length, true);
    view.setUint16(at + 26, e.name.length, true);
    view.setUint16(at + 28, 0, true); // no extra field
    out.set(e.name, at + LOCAL_SIZE);
    out.set(e.bytes, at + LOCAL_SIZE + e.name.length);
    at += LOCAL_SIZE + e.name.length + e.bytes.length;
  }
  entries.forEach((e, i) => {
    view.setUint32(at, CENTRAL, true);
    view.setUint16(at + 4, MADE_BY, true);
    view.setUint16(at + 6, VERSION, true);
    view.setUint16(at + 8, UTF8_NAMES, true);
    view.setUint16(at + 10, 0, true); // stored
    view.setUint16(at + 12, e.time, true);
    view.setUint16(at + 14, e.date, true);
    view.setUint32(at + 16, e.crc, true);
    view.setUint32(at + 20, e.bytes.length, true);
    view.setUint32(at + 24, e.bytes.length, true);
    view.setUint16(at + 28, e.name.length, true);
    // The extra field, the comment, the disk number and the internal attributes (offsets 30 to 37) are all zero.
    view.setUint32(at + 38, FILE_MODE, true);
    view.setUint32(at + 42, offsets[i]!, true);
    out.set(e.name, at + CENTRAL_SIZE);
    at += CENTRAL_SIZE + e.name.length;
  });
  view.setUint32(at, END, true);
  // This disk and the central directory's disk (offsets 4 to 7) are both disk 0.
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, directorySize, true);
  view.setUint32(at + 16, filesSize, true);
  // No archive comment.
  return out;
}

/** Strict UTF-8 that keeps a leading U+FEFF: a name is read as it was written. */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * The files of an archive zip() wrote (or any archive of stored entries), in central directory order, with their dates.
 * Each file's bytes are a view into `bytes`, not a copy. Folder entries are left out. Throws on anything it can't read
 * exactly: a damaged archive, a CRC-32 that doesn't match, an unsafe or repeated path, compression, encryption, ZIP64,
 * files that overlap, links, and a path that is both a file and a folder.
 */
export function unzip(bytes: Uint8Array): Array<{ path: string; bytes: Uint8Array; date: Date }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - END_SIZE; at >= 0 && at >= bytes.length - END_SIZE - 0xffff; at--) {
    if (view.getUint32(at, true) === END && at + END_SIZE + view.getUint16(at + 20, true) === bytes.length) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error('zip: not a ZIP archive (it has no end of central directory record)');
  const count = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directory = view.getUint32(end + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directory === 0xffffffff) throw new Error('zip: a ZIP64 archive, which this reader does not read');
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 || view.getUint16(end + 8, true) !== count) {
    throw new Error('zip: an archive split across disks, which this reader does not read');
  }
  if (directory + directorySize > end) throw new Error('zip: the central directory runs past its end record (the archive is damaged)');
  // Without ZIP64 or a signature, the end record follows the central directory. A gap could hold entries that
  // other readers find by walking the headers and this one would not.
  if (directory + directorySize !== end) throw new Error('zip: the central directory does not end at its end record (the archive is damaged)');

  /** Each file: where its local header starts, where its bytes start and end, and what the directory says of it. */
  const found: Array<{ path: string; from: number; start: number; to: number; crc: number; time: number; date: number }> = [];
  const seen = new Set<string>();
  const folders = new Set<string>();
  const directoryEnd = directory + directorySize;
  let at = directory;
  for (let i = 1; i <= count; i++) {
    if (at + CENTRAL_SIZE > directoryEnd || view.getUint32(at, true) !== CENTRAL) throw new Error(`zip: entry ${i} of ${count} is damaged in the central directory`);
    const madeOnUnix = view.getUint16(at + 4, true) >>> 8 === 3;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const date = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const type = madeOnUnix ? (view.getUint32(at + 38, true) >>> 16) & TYPE_BITS : 0;
    const local = view.getUint32(at + 42, true);
    const nameBytes = bytes.subarray(at + CENTRAL_SIZE, at + CENTRAL_SIZE + nameLength);
    at += CENTRAL_SIZE + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    if (at > directoryEnd) throw new Error(`zip: entry ${i} of ${count} runs past the central directory (the archive is damaged)`);
    let path: string;
    try {
      path = strictUtf8.decode(nameBytes);
    } catch {
      throw new Error(`zip: the name of entry ${i} of ${count} is not UTF-8`);
    }
    if (flags & 1) throw new Error(`zip: ${path} is encrypted, which this reader does not read`);
    if (path.endsWith('/') && size === 0 && (type === 0 || type === FOLDER || type === REGULAR)) {
      folders.add(path.slice(0, -1)); // a folder entry: it holds nothing
      continue;
    }
    // A link's bytes are where it points: unzip would make a link there, not a file holding those bytes.
    if (type !== 0 && type !== REGULAR) throw new Error(`zip: ${path} is ${type === 0o120000 ? 'a link' : 'not a plain file'} (Unix mode ${type.toString(8)}), which this reader does not read`);
    if (method !== 0) {
      throw new Error(`zip: ${path} is compressed (${METHODS[method] ?? `method ${method}`}); this reader reads only stored entries, as zip() writes them: open the archive with unzip or another ZIP tool`);
    }
    if (packed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new Error(`zip: ${path} needs ZIP64, which this reader does not read`);
    if (packed !== size) throw new Error(`zip: ${path} is stored, but its stored size (${packed}) and its size (${size}) differ (the archive is damaged)`);
    const problem = pathProblem(path);
    if (problem) throw new Error(`zip: the path ${JSON.stringify(path)} ${problem}`);
    if (seen.has(path)) throw new Error(`zip: ${path} is in the archive twice`);
    seen.add(path);

    if (local + LOCAL_SIZE > directory || view.getUint32(local, true) !== LOCAL) throw new Error(`zip: ${path}: its local header is missing or damaged`);
    const localNameLength = view.getUint16(local + 26, true);
    const localName = bytes.subarray(local + LOCAL_SIZE, local + LOCAL_SIZE + localNameLength);
    if (localNameLength !== nameLength || localName.some((b, k) => b !== nameBytes[k])) throw new Error(`zip: ${path}: its local header names another file`);
    if (view.getUint16(local + 8, true) !== method) throw new Error(`zip: ${path}: its local header and the central directory disagree on its method`);
    const start = local + LOCAL_SIZE + localNameLength + view.getUint16(local + 28, true);
    if (start + size > directory) throw new Error(`zip: ${path} runs into the central directory (the archive is damaged)`);
    found.push({ path, from: local, start, to: start + size, crc, time, date });
  }
  if (at !== directoryEnd) throw new Error(`zip: the central directory holds more than its end record counts (${count}): the archive is damaged`);
  // Files that share bytes are read differently by different tools (unzip refuses them), and checking each one's
  // CRC-32 would take time that grows with the square of the archive's size.
  const byOffset = [...found].sort((a, b) => a.from - b.from);
  for (let i = 1; i < byOffset.length; i++) {
    if (byOffset[i]!.from < byOffset[i - 1]!.to) throw new Error(`zip: ${byOffset[i - 1]!.path} and ${byOffset[i]!.path} overlap in the archive (it is damaged)`);
  }
  for (const path of seen) if (folders.has(path)) throw new Error(`zip: ${path} is both a file and a folder`);
  const both = fileAndFolder(seen);
  if (both) throw new Error(`zip: ${both[0]} is both a file and the folder of ${both[1]}`);
  return found.map(({ path, start, to, crc, time, date }) => {
    const data = bytes.subarray(start, to);
    const actual = crc32(data);
    if (actual !== crc) throw new Error(`zip: ${path}: its CRC-32 is ${crcHex(actual)} where the archive says ${crcHex(crc)}: the file is damaged`);
    return { path, bytes: data, date: fromDosTime(time, date) };
  });
}

const crcHex = (crc: number) => crc.toString(16).padStart(8, '0');
