import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBag, checkBag, readBagInfo, type BagFile } from '../src/core/bag.js';
import { sha256Hex, utf8 } from '../src/core/hash.js';
import { crc32, unzip, zip } from '../src/core/zip.js';

const has = (command: string, arg: string) => spawnSync(command, [arg], { stdio: 'ignore' }).status === 0;
const hasUnzip = has('unzip', '-v');
const hasSha256sum = has('sha256sum', '--version');

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const file = (files: readonly BagFile[], path: string) => files.find((f) => f.path === path)!;
const replace = (files: readonly BagFile[], path: string, bytes: Uint8Array) => files.map((f) => (f.path === path ? { ...f, bytes } : f));

const SHA_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

let seed = 7;
const noise = (n: number) => new Uint8Array(n).map(() => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 24);

const example = () =>
  buildBag({
    name: 'smaltfl-audit-trips-3/',
    payload: [
      { path: 'run/manifest.json', bytes: utf8('abc') },
      { path: 'datasets/trips.csv', bytes: utf8('pickup,fare\n2024-01-01,12.5\n') },
      { path: 'données/vide.txt', bytes: new Uint8Array() },
    ],
    info: [
      ['Source-Organization', 'smaltfl'],
      ['External-Description', 'The trips flow, run on 2024-01'],
    ],
    date: '2026-11-06T10:11:12.345Z',
  });

describe('CRC-32', () => {
  it('matches the check value of IEEE 802.3 and the usual examples', () => {
    expect(crc32(utf8('123456789')).toString(16)).toBe('cbf43926');
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(utf8('The quick brown fox jumps over the lazy dog')).toString(16)).toBe('414fa339');
  });
});

describe('ZIP, stored', () => {
  const files = [
    { path: 'a.txt', bytes: utf8('hello\n') },
    { path: 'empty', bytes: new Uint8Array() },
    { path: 'every byte.bin', bytes: Uint8Array.from({ length: 256 }, (_, i) => i) },
    { path: 'dossier/données/é😀.csv', bytes: utf8('x,y\n1,2\n') },
    { path: 'big/noise', bytes: noise(100_000) },
  ];

  it('round-trips files, names in UTF-8 and the same bytes every time', () => {
    const archive = zip(files);
    expect(zip(files)).toEqual(archive);
    const back = unzip(archive);
    expect(back.map((f) => f.path)).toEqual(files.map((f) => f.path));
    back.forEach((f, i) => expect(f.bytes, f.path).toEqual(files[i]!.bytes));
    const view = new DataView(archive.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true)).toBe(0x0800); // general purpose bit 11: UTF-8 names
    expect(view.getUint16(8, true)).toBe(0); // stored
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
  });

  it('writes DOS dates and times in UTC, to two seconds, and 1980-01-01 when there is none', () => {
    const [dated, undated] = unzip(zip([{ path: 'a', bytes: utf8('a'), date: new Date('2026-11-06T23:59:59.900Z') }, { path: 'b', bytes: utf8('b') }]));
    expect(dated!.date.toISOString()).toBe('2026-11-06T23:59:58.000Z');
    expect(undated!.date.toISOString()).toBe('1980-01-01T00:00:00.000Z');
    expect(unzip(zip([{ path: 'a', bytes: utf8(''), date: new Date('1970-01-01T00:00:00Z') }]))[0]!.date.toISOString()).toBe('1980-01-01T00:00:00.000Z');
    expect(() => zip([{ path: 'a', bytes: utf8(''), date: new Date('not a date') }])).toThrow('zip: an entry has an invalid date');
  });

  it('refuses paths that are unsafe, repeated or both a file and a folder, and more files than it can hold', () => {
    const one = (path: string) => () => zip([{ path, bytes: utf8('x') }]);
    expect(one('../x')).toThrow(`zip: the path "../x" has a '..' segment`);
    expect(one('a/../../x')).toThrow(`has a '..' segment`);
    expect(one('/etc/passwd')).toThrow('is absolute');
    expect(one('C:/x')).toThrow('is absolute');
    expect(one('a\\b')).toThrow('has a backslash');
    expect(one('folder/')).toThrow('has an empty segment');
    expect(one('a/./b')).toThrow(`has a '.' segment`);
    expect(one('')).toThrow('is empty');
    expect(() => zip([{ path: 'a', bytes: utf8('1') }, { path: 'a', bytes: utf8('2') }])).toThrow('zip: a is in the archive twice');
    expect(() => zip([{ path: 'a/b', bytes: utf8('1') }, { path: 'a', bytes: utf8('2') }])).toThrow('zip: a is both a file and the folder of a/b');
    const many = Array.from({ length: 65_535 }, (_, i) => ({ path: `f${i}`, bytes: new Uint8Array() }));
    expect(() => zip(many)).toThrow('zip: 65535 files are more than an archive without ZIP64 holds (65534)');
    expect(unzip(zip(many.slice(1))).length).toBe(65_534);
  });

  it('refuses a damaged file by its CRC-32, compressed and encrypted entries, and what is not a ZIP', () => {
    const archive = zip(files);
    const directory = new DataView(archive.buffer).getUint32(archive.length - 22 + 16, true);
    const flipped = archive.slice();
    flipped[directory - 1]! ^= 0x01; // the last byte of big/noise
    expect(() => unzip(flipped)).toThrow(/^zip: big\/noise: its CRC-32 is [0-9a-f]{8} where the archive says [0-9a-f]{8}: the file is damaged$/);

    const deflated = archive.slice();
    const view = new DataView(deflated.buffer);
    view.setUint16(8, 8, true);
    view.setUint16(directory + 10, 8, true);
    expect(() => unzip(deflated)).toThrow('zip: a.txt is compressed (deflate); this reader reads only stored entries, as zip() writes them: open the archive with unzip or another ZIP tool');

    const encrypted = archive.slice();
    new DataView(encrypted.buffer).setUint16(directory + 8, 0x0801, true);
    expect(() => unzip(encrypted)).toThrow('zip: a.txt is encrypted, which this reader does not read');

    expect(() => unzip(utf8('not a zip at all, just some text'))).toThrow('zip: not a ZIP archive');
    expect(() => unzip(archive.subarray(0, archive.length - 1))).toThrow('zip: not a ZIP archive');
    expect(unzip(zip([]))).toEqual([]);
  });

  it("refuses what the system's unzip would extract as something else: a miscount, overlaps, links, a file that is a folder", () => {
    const directoryOf = (archive: Uint8Array) => new DataView(archive.buffer).getUint32(archive.length - 22 + 16, true);
    /** The archive with every occurrence of one name's bytes replaced by another of the same length. */
    const rename = (archive: Uint8Array, from: string, to: string) => {
      const out = archive.slice();
      const [a, b] = [utf8(from), utf8(to)];
      for (let i = 0; i + a.length <= out.length; i++) if (a.every((x, k) => out[i + k] === x)) out.set(b, i);
      return out;
    };
    expect(() => zip([{ path: 'x\uD800', bytes: utf8('a') }])).toThrow('zip: the path "x\\ud800" has a lone surrogate, which UTF-8 cannot hold');

    // An end record that counts one entry fewer than the directory holds: unzip and Python read both.
    const two = zip([{ path: 'a', bytes: utf8('1') }, { path: 'b', bytes: utf8('2') }]);
    const miscounted = two.slice();
    const end = new DataView(miscounted.buffer, miscounted.length - 22);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    expect(() => unzip(miscounted)).toThrow('zip: the central directory holds more than its end record counts (1): the archive is damaged');
    end.setUint32(12, 47, true);
    expect(() => unzip(miscounted)).toThrow('zip: the central directory does not end at its end record');

    // b's central entry points at a copy of b's local header inside a's bytes.
    const b = zip([{ path: 'b', bytes: utf8('inner') }]).subarray(0, 30 + 1 + 5);
    const overlapping = zip([{ path: 'a', bytes: b }, { path: 'b', bytes: utf8('inner') }]);
    new DataView(overlapping.buffer).setUint32(directoryOf(overlapping) + 47 + 42, 30 + 1, true);
    expect(() => unzip(overlapping)).toThrow('zip: a and b overlap in the archive (it is damaged)');

    const link = zip([{ path: 'link', bytes: utf8('/etc/passwd') }]);
    new DataView(link.buffer).setUint32(directoryOf(link) + 38, (0o120777 << 16) >>> 0, true);
    expect(() => unzip(link)).toThrow('zip: link is a link (Unix mode 120000), which this reader does not read');

    expect(() => unzip(rename(zip([{ path: 'a', bytes: utf8('1') }, { path: 'c/b', bytes: utf8('2') }]), 'c/b', 'a/b'))).toThrow('zip: a is both a file and the folder of a/b');
    // Folder entries, as other writers make them, hold nothing and are left out, unless a file has the same name.
    expect(unzip(rename(zip([{ path: 'gx', bytes: new Uint8Array() }]), 'gx', 'g/'))).toEqual([]);
    expect(() => unzip(rename(zip([{ path: 'g', bytes: utf8('1') }, { path: 'gx', bytes: new Uint8Array() }]), 'gx', 'g/'))).toThrow('zip: g is both a file and a folder');
  });

  it.skipIf(!hasUnzip)("opens with the system's unzip", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'smaltfl-zip-'));
    try {
      writeFileSync(join(dir, 'files.zip'), zip(files));
      writeFileSync(join(dir, 'bag.zip'), zip(await example()));
      for (const name of ['files.zip', 'bag.zip']) {
        const run = spawnSync('unzip', ['-t', join(dir, name)], { encoding: 'utf8' });
        expect(run.status, run.stdout + run.stderr).toBe(0);
        expect(run.stdout).toContain('No errors detected');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('audit bag', () => {
  it('writes the BagIt 1.0 files under one folder, the tag files first, the payload sorted', async () => {
    const bag = await example();
    expect(bag.map((f) => f.path)).toEqual([
      'smaltfl-audit-trips-3/bagit.txt',
      'smaltfl-audit-trips-3/bag-info.txt',
      'smaltfl-audit-trips-3/manifest-sha256.txt',
      'smaltfl-audit-trips-3/tagmanifest-sha256.txt',
      'smaltfl-audit-trips-3/data/datasets/trips.csv',
      'smaltfl-audit-trips-3/data/données/vide.txt',
      'smaltfl-audit-trips-3/data/run/manifest.json',
    ]);
    const at = (path: string) => text(file(bag, `smaltfl-audit-trips-3/${path}`).bytes);
    expect(at('bagit.txt')).toBe('BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
    expect(at('bag-info.txt')).toBe(
      'Source-Organization: smaltfl\nExternal-Description: The trips flow, run on 2024-01\nBagging-Date: 2026-11-06\nPayload-Oxum: 31.3\n',
    );
    const trips = await sha256Hex('pickup,fare\n2024-01-01,12.5\n');
    expect(at('manifest-sha256.txt')).toBe(`${trips}  data/datasets/trips.csv\n${SHA_EMPTY}  data/données/vide.txt\n${SHA_ABC}  data/run/manifest.json\n`);
    const tag = async (path: string) => `${await sha256Hex(file(bag, `smaltfl-audit-trips-3/${path}`).bytes as Uint8Array<ArrayBuffer>)}  ${path}\n`;
    expect(at('tagmanifest-sha256.txt')).toBe((await tag('bag-info.txt')) + (await tag('bagit.txt')) + (await tag('manifest-sha256.txt')));
    expect(await checkBag(bag)).toEqual({ ok: true, problems: [] });
  });

  it('sorts by code point, percent-encodes CR, LF and % in manifest paths, and checks them back', async () => {
    const bag = await buildBag({
      name: 'b',
      payload: [
        { path: '\u{1F600}.txt', bytes: utf8('2') },
        { path: '\uFF61.txt', bytes: utf8('1') },
        { path: '100%\r\nsure.txt', bytes: utf8('abc') },
      ],
      info: [],
      date: '2026-11-06',
    });
    const lines = text(file(bag, 'b/manifest-sha256.txt').bytes).split('\n').map((l) => l.slice(66));
    expect(lines).toEqual(['data/100%25%0D%0Asure.txt', 'data/\uFF61.txt', 'data/\u{1F600}.txt', '']);
    expect(file(bag, 'b/data/100%\r\nsure.txt').bytes).toEqual(utf8('abc'));
    expect(await checkBag(bag)).toEqual({ ok: true, problems: [] });
  });

  it('continues a value of several lines on indented lines, as readBagInfo reads them back', async () => {
    const bag = await buildBag({ name: 'b', payload: [], info: [['Note', 'one\ntwo\r\nthree'], ['Empty', '']], date: '2026-11-06' });
    const info = text(file(bag, 'b/bag-info.txt').bytes);
    expect(info).toBe('Note: one\n  two\n  three\nEmpty: \nBagging-Date: 2026-11-06\nPayload-Oxum: 0.0\n');
    expect(readBagInfo(info)).toEqual([
      ['Note', 'one\ntwo\nthree'],
      ['Empty', ''],
      ['Bagging-Date', '2026-11-06'],
      ['Payload-Oxum', '0.0'],
    ]);
    expect(() => readBagInfo('  indented first\n')).toThrow('line 1 continues a value');
    expect(() => readBagInfo('Label: a\nno colon here\n')).toThrow("line 2 is not 'Label: value'");
    expect(await checkBag(bag)).toEqual({ ok: true, problems: [] });
  });

  it('refuses payload paths that leave data/, repeated paths, labels bag-info.txt cannot hold, and bad dates', async () => {
    const bag = (over: Partial<Parameters<typeof buildBag>[0]>) => buildBag({ name: 'b', payload: [], info: [], date: '2026-11-06', ...over });
    const payload = (...paths: string[]) => bag({ payload: paths.map((path) => ({ path, bytes: utf8('x') })) });
    await expect(payload('../escape')).rejects.toThrow(`audit bag: the payload path "../escape" has a '..' segment`);
    await expect(payload('a/../../escape')).rejects.toThrow(`has a '..' segment`);
    await expect(payload('/etc/passwd')).rejects.toThrow('is absolute');
    await expect(payload('a\\b')).rejects.toThrow('has a backslash');
    await expect(payload('a//b')).rejects.toThrow('has an empty segment');
    await expect(payload('x\uD800.txt')).rejects.toThrow('has a lone surrogate, which UTF-8 cannot hold');
    await expect(payload('x', 'x')).rejects.toThrow('audit bag: the payload has x twice');
    await expect(payload('a', 'a/b')).rejects.toThrow('audit bag: a is both a payload file and the folder of a/b');
    await expect(bag({ name: 'a/b' })).rejects.toThrow(`audit bag: the folder name "a/b" is not one folder's name`);
    await expect(bag({ name: '..' })).rejects.toThrow('is not one folder');
    await expect(bag({ name: 'C:' })).rejects.toThrow('is not one folder'); // zip() would refuse C:/bagit.txt
    await expect(bag({ info: [['Payload-Oxum', '1.1']] })).rejects.toThrow('audit bag: buildBag writes Payload-Oxum itself; leave it out of info');
    await expect(bag({ info: [['bagging-date', '2020-01-01']] })).rejects.toThrow('buildBag writes bagging-date itself');
    await expect(bag({ info: [['A: B', 'x']] })).rejects.toThrow('has a colon or a line break');
    await expect(bag({ info: [[' A', 'x']] })).rejects.toThrow('starts or ends with a space or a tab');
    await expect(bag({ info: [['', 'x']] })).rejects.toThrow('a bag-info label is empty');
    for (const date of ['2026-02-30', '06/11/2026', '2026-11-06 10:00', '20261106', '', '2026-11-06T25:00Z', '2026-11-06T10:61', '2026-11-06T10:00+24:00']) {
      await expect(bag({ date }), date).rejects.toThrow('is not YYYY-MM-DD or an ISO 8601 date and time');
    }
    for (const date of ['2024-02-29', '2026-11-06T23:59:60.5+05:30', '2026-11-06T00:00Z']) await expect(bag({ date }), date).resolves.toBeDefined();
  });

  it('reads manifests as RFC 8493 allows them: uppercase hex, tabs between hash and path, CRLF line endings', async () => {
    const bag = await buildBag({ name: 'b', payload: [{ path: 'x.txt', bytes: utf8('abc') }], info: [], date: '2026-11-06' });
    const loose = async (f: BagFile) => `${(await sha256Hex(f.bytes as Uint8Array<ArrayBuffer>)).toUpperCase()}\t${f.path.slice(2)}\r\n`;
    const payload = utf8(await loose(file(bag, 'b/data/x.txt')));
    const tags = replace(bag, 'b/manifest-sha256.txt', payload);
    const tagManifest = (await Promise.all(tags.slice(0, 3).map(loose))).join('');
    expect(await checkBag(replace(tags, 'b/tagmanifest-sha256.txt', utf8(tagManifest)))).toEqual({ ok: true, problems: [] });
  });

  it('checks as a bag after its ZIP is read back, and with bagit.txt at the top', async () => {
    const bag = await example();
    expect(await checkBag(unzip(zip(bag)))).toEqual({ ok: true, problems: [] });
    const top = bag.map((f) => ({ ...f, path: f.path.slice('smaltfl-audit-trips-3/'.length) }));
    expect(await checkBag(top)).toEqual({ ok: true, problems: [] });
  });

  it('fails a flipped payload byte, both in checkBag and in the CRC-32 of its ZIP', async () => {
    const bag = await example();
    const path = 'smaltfl-audit-trips-3/data/datasets/trips.csv';
    const flipped = file(bag, path).bytes.slice();
    flipped[3]! ^= 0x20;
    expect(await checkBag(replace(bag, path, flipped))).toEqual({ ok: false, problems: ["data/datasets/trips.csv: its SHA-256 doesn't match manifest-sha256.txt"] });

    const archive = zip(bag);
    const at = archive.findIndex((_, i) => text(archive.subarray(i, i + 11)) === 'pickup,fare');
    archive[at + 3]! ^= 0x20;
    expect(() => unzip(archive)).toThrow(/^zip: smaltfl-audit-trips-3\/data\/datasets\/trips\.csv: its CRC-32 is [0-9a-f]{8} where the archive says [0-9a-f]{8}: the file is damaged$/);
  });

  it('finds files missing, added or changed, in the payload and in the tag files', async () => {
    const bag = await example();
    const root = 'smaltfl-audit-trips-3/';
    const without = (path: string) => bag.filter((f) => f.path !== root + path);
    const problems = async (files: readonly BagFile[]) => (await checkBag(files)).problems;

    expect(await problems(without('data/run/manifest.json'))).toEqual([
      'data/run/manifest.json: listed in manifest-sha256.txt but not in the bag',
      'bag-info.txt: the Payload-Oxum says 31 octets in 3 files, and data/ holds 28 octets in 2 files',
    ]);
    expect(await problems([...bag, { path: `${root}data/extra.csv`, bytes: utf8('x') }])).toEqual([
      'data/extra.csv: in data/ but not in manifest-sha256.txt',
      'bag-info.txt: the Payload-Oxum says 31 octets in 3 files, and data/ holds 32 octets in 4 files',
    ]);
    expect(await problems([...bag, { path: `${root}notes.txt`, bytes: utf8('trust me') }])).toEqual(['notes.txt: in the bag but in no manifest']);
    expect(await problems([...bag, { path: 'elsewhere.txt', bytes: utf8('x') }])).toEqual(["elsewhere.txt: outside the bag's folder smaltfl-audit-trips-3/"]);
    // A manifest checkBag can't check is a claim nobody verified, listed or not.
    expect(await problems([...bag, { path: `${root}tagmanifest-md5.txt`, bytes: utf8(`${'0'.repeat(32)}  bagit.txt\n`) }])).toEqual([
      "tagmanifest-md5.txt: a manifest checkBag doesn't check (it checks SHA-256 only)",
    ]);

    const info = text(file(bag, `${root}bag-info.txt`).bytes);
    expect(await problems(replace(bag, `${root}bag-info.txt`, utf8(info.replace('31.3', '30.3'))))).toEqual([
      "bag-info.txt: its SHA-256 doesn't match tagmanifest-sha256.txt",
      'bag-info.txt: the Payload-Oxum says 30 octets in 3 files, and data/ holds 31 octets in 3 files',
    ]);
    expect(await problems(replace(bag, `${root}bag-info.txt`, utf8(info.replace(/Payload-Oxum.*\n/, ''))))).toEqual([
      "bag-info.txt: its SHA-256 doesn't match tagmanifest-sha256.txt",
      'bag-info.txt: no Payload-Oxum',
    ]);

    const manifest = text(file(bag, `${root}manifest-sha256.txt`).bytes);
    const forged = manifest.replace(/^[0-9a-f]{64}(?=  data\/run)/m, SHA_EMPTY) + 'not a line\n' + `${SHA_ABC}  data/../../etc/passwd\n${SHA_ABC}  data/50%.txt\n`;
    expect(await problems(replace(bag, `${root}manifest-sha256.txt`, utf8(forged)))).toEqual([
      "manifest-sha256.txt line 4: not '<SHA-256>  <path>'",
      `manifest-sha256.txt line 5: the path "data/../../etc/passwd" has a '..' segment`,
      'manifest-sha256.txt line 6: data/50%.txt has a % that is not percent-encoded (RFC 8493 §2.1.3)',
      "data/run/manifest.json: its SHA-256 doesn't match manifest-sha256.txt",
      "manifest-sha256.txt: its SHA-256 doesn't match tagmanifest-sha256.txt",
    ]);

    expect(await problems(without('tagmanifest-sha256.txt'))).toEqual(['there is no tagmanifest-sha256.txt']);
    expect(await problems(without('bagit.txt'))).toEqual(['there is no bagit.txt, at the top or in one top-level folder']);
    expect(await problems(replace(bag, `${root}bagit.txt`, utf8('BagIt-Version: 0.97\nTag-File-Character-Encoding: UTF-8\n')))).toEqual([
      'bagit.txt: BagIt-Version is 0.97, not 1.0',
      "bagit.txt: its SHA-256 doesn't match tagmanifest-sha256.txt",
    ]);
    expect(await problems(replace(bag, `${root}bag-info.txt`, new Uint8Array([0xff, 0xfe])))).toEqual([
      "bag-info.txt: its SHA-256 doesn't match tagmanifest-sha256.txt",
      'bag-info.txt: not UTF-8',
    ]);
  });

  it.skipIf(!hasUnzip || !hasSha256sum)("checks with the system's unzip and sha256sum -c, as an auditor would", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'smaltfl-bag-'));
    try {
      writeFileSync(join(dir, 'bag.zip'), zip(await example()));
      const extract = spawnSync('unzip', ['-q', join(dir, 'bag.zip'), '-d', dir], { encoding: 'utf8' });
      expect(extract.status, extract.stderr).toBe(0);
      for (const manifest of ['manifest-sha256.txt', 'tagmanifest-sha256.txt']) {
        const check = spawnSync('sha256sum', ['--strict', '-c', manifest], { cwd: join(dir, 'smaltfl-audit-trips-3'), encoding: 'utf8' });
        expect(check.status, check.stdout + check.stderr).toBe(0);
        expect(check.stdout.trim().split('\n').every((line) => line.endsWith(': OK'))).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
