/**
 * The audit bag (ADR 0006): a run's evidence in one file that an auditor checks offline, with `sha256sum -c` and the
 * repository's audit script, without trusting the browser that made it. It is a BagIt 1.0 bag (RFC 8493), zipped
 * (zip.ts) under one top-level folder, and it holds:
 *
 * - `bagit.txt`: the declaration, BagIt 1.0 with its tag files in UTF-8.
 * - `bag-info.txt`: what the bag is, as `Label: value` lines in the caller's order, then the Bagging-Date and the
 *   Payload-Oxum (the payload's octets and files: a quick check that nothing was added or lost).
 * - `data/`: the payload, the files the evidence is made of.
 * - `manifest-sha256.txt`: the SHA-256 of every payload file, a `<hex>  <path>` line each, sorted by path, as
 *   `sha256sum` writes and checks them.
 * - `tagmanifest-sha256.txt`: the same over the three files above, so neither bag-info.txt nor the manifest can be
 *   changed without it showing.
 *
 * Paths in a manifest are relative to the bag's folder, with forward slashes; CR, LF and % in them are
 * percent-encoded (RFC 8493 §2.1.3), and paths that could leave the folder are refused. Lines end in LF and are
 * sorted by path in code point order (UTF-8 byte order, as `LC_ALL=C sort` has it), so the same payload always makes
 * the same bag. `sha256sum -c` doesn't decode percent-encoding, and Info-ZIP's `unzip` drops control characters (tab,
 * CR and LF among them) from names as it extracts them: a payload path with a control character or a % in it is
 * checked by the audit script, not by unzip and sha256sum.
 *
 * checkBag runs the auditor's checks over a bag's files: every hash in both manifests, the Payload-Oxum, every
 * payload file listed and every listed file there, and nothing in the bag that no manifest covers. Pure: no DOM,
 * SHA-256 through WebCrypto (hash.ts).
 */
import { sha256Hex, utf8 } from './hash.js';

/** A file of a bag, by its path with forward slashes. */
export interface BagFile {
  path: string;
  bytes: Uint8Array;
}

export interface BagInput {
  /** The bag's top-level folder, such as `smaltfl-audit-<origin>-<size>`. A trailing slash is allowed. */
  name: string;
  /** The payload: each path is relative to data/. */
  payload: readonly BagFile[];
  /** bag-info.txt's elements in order, as [label, value]. Bagging-Date and Payload-Oxum are added after them. */
  info: ReadonlyArray<readonly [string, string]>;
  /** The Bagging-Date: YYYY-MM-DD, or an ISO 8601 date and time whose date is used as written. */
  date: string;
}

export interface BagCheck {
  ok: boolean;
  /** What failed, one sentence each, by path relative to the bag's folder. Empty when ok. */
  problems: string[];
}

const BAGIT = 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n';
const MANIFEST = 'manifest-sha256.txt';
const TAG_MANIFEST = 'tagmanifest-sha256.txt';
/** The bag-info elements buildBag writes itself. Reserved labels are case-insensitive (RFC 8493 §2.2.2). */
const ADDED = new Set(['bagging-date', 'payload-oxum']);

/** Why a path can't be a file of a bag, or undefined if it can. */
function pathProblem(path: string): string | undefined {
  if (path === '') return 'is empty';
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'is absolute';
  if (path.includes('\\')) return 'has a backslash: paths use forward slashes';
  if (path.includes('\0')) return 'has a NUL character';
  // UTF-8 can't hold a lone surrogate: the manifest would name U+FFFD, a file other than the one in the bag.
  if (/[\uD800-\uDFFF]/u.test(path)) return 'has a lone surrogate, which UTF-8 cannot hold';
  for (const segment of path.split('/')) {
    if (segment === '..') return "has a '..' segment";
    if (segment === '.') return "has a '.' segment";
    if (segment === '') return 'has an empty segment';
  }
  return undefined;
}

/** A path as a manifest writes it: CR, LF and % percent-encoded, and nothing else (RFC 8493 §2.1.3). */
const encodePath = (path: string): string => path.replace(/[%\r\n]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/** A manifest's path as it names the file, or undefined if it has a % that isn't one of the three encodings. */
function decodePath(text: string): string | undefined {
  if (/%(?!0[aAdD]|25)/.test(text)) return undefined;
  return text.replace(/%(0[aAdD]|25)/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

/** Code point order, which is UTF-8 byte order: `LC_ALL=C sort`, and Python's sorted() on strings. */
function byCodePoint(a: string, b: string): number {
  for (let i = 0; i < a.length && i < b.length; ) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(i)!;
    if (x !== y) return x - y;
    i += x > 0xffff ? 2 : 1;
  }
  return a.length - b.length;
}

/** WebCrypto takes bytes on an ArrayBuffer; bytes on a SharedArrayBuffer are copied. */
const own = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => (bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes));

/** YYYY-MM-DD, then a time of day (a leap second allowed) and its offset from UTC if there is one, as ISO 8601. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::(?:[0-5]\d|60)(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?)?$/;

function baggingDate(date: string): string {
  const m = DATE.exec(date);
  const [y, mo, d] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (!m || day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) {
    throw new Error(`audit bag: the date ${JSON.stringify(date)} is not YYYY-MM-DD or an ISO 8601 date and time`);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** A bag-info.txt line. A value of several lines continues on lines indented by two spaces (RFC 8493 §2.2.2). */
function infoLine(label: string, value: string): string {
  if (label === '') throw new Error('audit bag: a bag-info label is empty');
  if (/[:\r\n]/.test(label)) throw new Error(`audit bag: the label ${JSON.stringify(label)} has a colon or a line break, which a label can't hold`);
  if (/^[ \t]|[ \t]$/.test(label)) throw new Error(`audit bag: the label ${JSON.stringify(label)} starts or ends with a space or a tab`);
  if (ADDED.has(label.toLowerCase())) throw new Error(`audit bag: buildBag writes ${label} itself; leave it out of info`);
  return `${label}: ${value.split(/\r\n|\r|\n/).join('\n  ')}\n`;
}

/** A manifest's text: a `<SHA-256>  <path>` line for each file, sorted by path. */
async function manifest(files: readonly BagFile[]): Promise<string> {
  const lines = await Promise.all(files.map(async (f) => ({ path: encodePath(f.path), hash: await sha256Hex(own(f.bytes)) })));
  lines.sort((a, b) => byCodePoint(a.path, b.path));
  return lines.map((l) => `${l.hash}  ${l.path}\n`).join('');
}

/**
 * The files of a bag, each path under the bag's folder: its four tag files, then the payload under data/, sorted by
 * path. Throws on a payload path that could leave data/, a payload path given twice or used as a file and as a
 * folder, a label bag-info.txt can't hold, and a date that isn't one.
 */
export async function buildBag({ name, payload, info, date }: BagInput): Promise<BagFile[]> {
  const folder = name.endsWith('/') ? name.slice(0, -1) : name;
  if (pathProblem(folder) || /[/\r\n]/.test(folder)) {
    throw new Error(`audit bag: the folder name ${JSON.stringify(name)} is not one folder's name`);
  }
  const paths = new Set<string>();
  for (const file of payload) {
    const problem = pathProblem(file.path);
    if (problem) throw new Error(`audit bag: the payload path ${JSON.stringify(file.path)} ${problem}`);
    if (paths.has(file.path)) throw new Error(`audit bag: the payload has ${file.path} twice`);
    paths.add(file.path);
  }
  for (const path of paths) {
    for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) {
      if (paths.has(path.slice(0, i))) throw new Error(`audit bag: ${path.slice(0, i)} is both a payload file and the folder of ${path}`);
    }
  }
  const lines = info.map(([label, value]) => infoLine(label, value));
  const day = baggingDate(date);

  const data = payload.map((f) => ({ path: `data/${f.path}`, bytes: f.bytes })).sort((a, b) => byCodePoint(a.path, b.path));
  const octets = data.reduce((n, f) => n + f.bytes.length, 0);
  lines.push(`Bagging-Date: ${day}\n`, `Payload-Oxum: ${octets}.${data.length}\n`);
  const tags: BagFile[] = [
    { path: 'bagit.txt', bytes: utf8(BAGIT) },
    { path: 'bag-info.txt', bytes: utf8(lines.join('')) },
    { path: MANIFEST, bytes: utf8(await manifest(data)) },
  ];
  tags.push({ path: TAG_MANIFEST, bytes: utf8(await manifest(tags)) });
  return [...tags, ...data].map((f) => ({ path: `${folder}/${f.path}`, bytes: f.bytes }));
}

/**
 * The elements of a bag-info.txt (or of a bagit.txt), in order, as [label, value]. A continuation line (one that
 * starts with a space or a tab) adds a line to the value before it, without its indent. Throws on a line that is
 * neither an element nor a continuation.
 */
export function readBagInfo(text: string): Array<[string, string]> {
  const elements: Array<[string, string]> = [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  lines.forEach((line, i) => {
    if (/^[ \t]/.test(line)) {
      const last = elements.at(-1);
      if (!last) throw new Error(`line ${i + 1} continues a value, but no element comes before it`);
      last[1] += `\n${line.replace(/^[ \t]+/, '')}`;
      return;
    }
    const m = /^([^:]*[^:\s]):(?:[ \t](.*))?$/s.exec(line);
    if (!m) throw new Error(`line ${i + 1} is not 'Label: value'`);
    elements.push([m[1]!, m[2] ?? '']);
  });
  return elements;
}

/** Strict UTF-8 that keeps a leading U+FEFF, which a tag file must not have. */
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Check a bag's files, as unzip() reads them from its ZIP or as buildBag made them: under one top-level folder, or
 * with bagit.txt at the top. The checks are an auditor's: bagit.txt declares BagIt 1.0 in UTF-8; every file
 * manifest-sha256.txt lists is there with that SHA-256, and every file in data/ is listed; every file
 * tagmanifest-sha256.txt lists is there with that SHA-256, and every other file outside data/ is listed (a file no
 * manifest covers is a file nobody can vouch for); there is no manifest for another algorithm, which it can't check;
 * bag-info.txt's Payload-Oxum counts what data/ holds.
 */
export async function checkBag(files: readonly BagFile[]): Promise<BagCheck> {
  const problems: string[] = [];
  const result = (): BagCheck => ({ ok: problems.length === 0, problems });

  let root = '';
  if (!files.some((f) => f.path === 'bagit.txt')) {
    const declarations = files.filter((f) => /^[^/]+\/bagit\.txt$/.test(f.path));
    if (declarations.length !== 1) {
      problems.push(declarations.length === 0 ? 'there is no bagit.txt, at the top or in one top-level folder' : `there are ${declarations.length} bags, one in each top-level folder with a bagit.txt`);
      return result();
    }
    root = declarations[0]!.path.slice(0, -'bagit.txt'.length);
  }
  const byPath = new Map<string, Uint8Array>();
  for (const f of files) {
    if (!f.path.startsWith(root)) {
      problems.push(`${f.path}: outside the bag's folder ${root}`);
      continue;
    }
    const path = f.path.slice(root.length);
    if (byPath.has(path)) problems.push(`${path}: in the bag twice`);
    byPath.set(path, f.bytes);
  }
  const text = (path: string): string | undefined => {
    const bytes = byPath.get(path);
    if (!bytes) return undefined;
    try {
      return strictUtf8.decode(bytes);
    } catch {
      problems.push(`${path}: not UTF-8`);
      return undefined;
    }
  };
  const elements = (path: string): Array<[string, string]> | undefined => {
    const t = text(path);
    if (t === undefined) return undefined;
    try {
      return readBagInfo(t);
    } catch (e) {
      problems.push(`${path}: ${(e as Error).message}`);
      return undefined;
    }
  };

  const declaration = elements('bagit.txt');
  if (declaration) {
    const version = declaration.find(([label]) => label === 'BagIt-Version')?.[1];
    const encoding = declaration.find(([label]) => label === 'Tag-File-Character-Encoding')?.[1];
    if (version !== '1.0') problems.push(`bagit.txt: ${version === undefined ? 'no BagIt-Version' : `BagIt-Version is ${version}, not 1.0`}`);
    if (encoding?.toUpperCase() !== 'UTF-8') problems.push(`bagit.txt: ${encoding === undefined ? 'no Tag-File-Character-Encoding' : `the tag files are in ${encoding}, not UTF-8`}`);
  }

  // A manifest's listing, checked against the bag's files.
  const check = async (name: string, inData: boolean): Promise<Set<string> | undefined> => {
    const t = text(name);
    if (t === undefined) {
      if (!byPath.has(name)) problems.push(`there is no ${name}`);
      return undefined;
    }
    const listed = new Map<string, string>();
    const lines = t.split(/\r\n|\r|\n/);
    if (lines.at(-1) === '') lines.pop();
    for (const [i, line] of lines.entries()) {
      const at = `${name} line ${i + 1}`;
      const m = /^([0-9a-fA-F]{64})[ \t]+(.+)$/s.exec(line);
      const path = m ? decodePath(m[2]!) : undefined;
      const problem = path === undefined ? undefined : pathProblem(path);
      if (!m) problems.push(`${at}: not '<SHA-256>  <path>'`);
      else if (path === undefined) problems.push(`${at}: ${m[2]} has a % that is not percent-encoded (RFC 8493 §2.1.3)`);
      else if (problem) problems.push(`${at}: the path ${JSON.stringify(path)} ${problem}`);
      else if (path.startsWith('data/') !== inData) problems.push(`${at}: ${path} is ${inData ? 'not a payload file' : `a payload file, for ${MANIFEST} to list`}`);
      else if (listed.has(path)) problems.push(`${at}: ${path} is listed twice`);
      else listed.set(path, m[1]!.toLowerCase());
    }
    const verdicts = await Promise.all(
      [...listed].map(async ([path, hash]) => {
        const bytes = byPath.get(path);
        if (!bytes) return `${path}: listed in ${name} but not in the bag`;
        return (await sha256Hex(own(bytes))) === hash ? undefined : `${path}: its SHA-256 doesn't match ${name}`;
      }),
    );
    for (const v of verdicts) if (v) problems.push(v);
    return new Set(listed.keys());
  };

  const payload = [...byPath].filter(([path]) => path.startsWith('data/'));
  const listedPayload = await check(MANIFEST, true);
  if (listedPayload) for (const [path] of payload) if (!listedPayload.has(path)) problems.push(`${path}: in data/ but not in ${MANIFEST}`);
  const listedTags = await check(TAG_MANIFEST, false);
  for (const path of byPath.keys()) {
    if (path.startsWith('data/') || path === TAG_MANIFEST) continue;
    // A bag is valid when every checksum in every manifest holds (RFC 8493 §3): one checkBag can't check is a claim
    // nobody verified, and a tag manifest can't be listed in another (§2.2.1).
    if (path !== MANIFEST && /^(?:tag)?manifest-[^/]*\.txt$/.test(path)) problems.push(`${path}: a manifest checkBag doesn't check (it checks SHA-256 only)`);
    else if (listedTags && !listedTags.has(path)) problems.push(`${path}: in the bag but in no manifest`);
  }

  const info = elements('bag-info.txt');
  if (!info && !byPath.has('bag-info.txt')) problems.push('there is no bag-info.txt');
  if (info) {
    const oxums = info.filter(([label]) => label.toLowerCase() === 'payload-oxum');
    const m = oxums.length === 1 ? /^(\d+)\.(\d+)$/.exec(oxums[0]![1]) : null;
    const octets = payload.reduce((n, [, bytes]) => n + bytes.length, 0);
    if (oxums.length !== 1) problems.push(`bag-info.txt: ${oxums.length === 0 ? 'no Payload-Oxum' : 'more than one Payload-Oxum'}`);
    else if (!m) problems.push(`bag-info.txt: the Payload-Oxum ${JSON.stringify(oxums[0]![1])} is not '<octets>.<files>'`);
    else if (Number(m[1]) !== octets || Number(m[2]) !== payload.length) {
      problems.push(`bag-info.txt: the Payload-Oxum says ${m[1]} octets in ${m[2]} files, and data/ holds ${octets} octets in ${payload.length} files`);
    }
  }
  return result();
}
