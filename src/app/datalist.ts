/**
 * The data list a page opens (loads.json, ADR 0010 §9), read into one shape whatever its format: format 2 binds each
 * source by id to its file, or to its daily loads and the days a paused one may be filled from, and names each watched
 * source's history; format 1 (the data branch as the fills shipped it, and the XS fixtures) named the files by the
 * example's file names, its loads and donors at the top. Pure: the app reads it at start, the real-data tests read the
 * same file through it.
 */
import type { Binding, DataBindings } from '../../examples/sources.js';
import type { Expected } from './fetch-checked.js';

/** A day's file of a source, as the data lists it, checked against MANIFEST.json at start. */
export interface Listed {
  day: string;
  file: string;
  sha256: string;
  bytes?: number;
  rows: number;
}

/** A fixed file's entry: where the page fetches it, the sha256 and size the list gives, and where it came from. */
export type FileEntry = Expected & { path: string };

/** A source's binding with what the list says of its files: one file, or its loads and donors. */
export interface ListedSource extends Binding {
  entry?: FileEntry;
  loads?: Listed[];
  donors?: Listed[];
}

/** A data list, read. */
export interface DataList {
  format: 1 | 2;
  month?: string;
  built?: string;
  /** The data branch commit and list hash it was built from (null for a build's own list). */
  data: { commit: string; manifest: string; bytes?: number } | null;
  /** The flow document the data is for, when it isn't the built-in example. */
  flow: FileEntry | null;
  sources: Record<string, ListedSource>;
  /** Each watched source's history, by source id. */
  histories: Record<string, FileEntry>;
  /** The source the loads feed (the one with loads), its month's loads, its incidents' and its donor days. */
  loadSource: string | null;
  loads: Listed[];
  episodes: { name: string; about?: string; loads: Listed[] }[];
  donors: Listed[];
  /** Every fixed file by key: each source's by its id, each history as `history` (the first) and `history:<id>`. */
  files: Record<string, FileEntry>;
}

type RawLoad = { day?: string; slot?: string; file: string; sha256: string; bytes?: number; rows: number };
const listedOf = (l: RawLoad): Listed => ({ day: l.slot ?? l.day ?? '', file: l.file, sha256: l.sha256, ...(l.bytes !== undefined ? { bytes: l.bytes } : {}), rows: l.rows });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A loads.json read: format 2 as it says; format 1 bound by the example's bindings (`fallback`), each of its files found
 * by its source's id (its file name without the extension), its loads and donors the trips'.
 */
export function readDataList(raw: unknown, fallback: DataBindings): DataList {
  const index = isRecord(raw) ? raw : {};
  const data = (index.data ?? null) as DataList['data'];
  const episodesOf = (src: unknown) => (Array.isArray(src) ? src : []).map((e: Record<string, unknown>) => ({ name: String(e.name), ...(typeof e.about === 'string' ? { about: e.about } : {}), loads: ((e.loads ?? []) as RawLoad[]).map(listedOf) }));
  if (index.format === 2) {
    const sources: Record<string, ListedSource> = {};
    for (const [id, s] of Object.entries((index.sources ?? {}) as Record<string, Record<string, unknown>>)) {
      sources[id] = { ...(s as unknown as Binding), ...(s.entry ? { entry: s.entry as FileEntry } : {}), ...(Array.isArray(s.loads) ? { loads: (s.loads as RawLoad[]).map(listedOf) } : {}), ...(Array.isArray(s.donors) ? { donors: (s.donors as RawLoad[]).map(listedOf) } : {}) };
    }
    const histories = (index.histories ?? {}) as Record<string, FileEntry>;
    const loadSource = Object.entries(sources).find(([, s]) => s.loads !== undefined)?.[0] ?? null;
    const files: Record<string, FileEntry> = {};
    for (const [id, s] of Object.entries(sources)) if (s.entry) files[id] = s.entry;
    Object.entries(histories).forEach(([id, h], k) => {
      files[`history:${id}`] = h;
      if (k === 0) files.history = h;
    });
    const flow = isRecord(index.flow) ? (index.flow as unknown as FileEntry) : null;
    if (flow) files.flow = flow;
    return {
      format: 2, ...(typeof index.month === 'string' ? { month: index.month } : {}), ...(typeof index.built === 'string' ? { built: index.built } : {}), data, flow, sources, histories, loadSource,
      loads: loadSource ? sources[loadSource]!.loads! : [], episodes: episodesOf(index.episodes), donors: loadSource ? sources[loadSource]!.donors ?? [] : [], files,
    };
  }
  // Format 1: the example's files by name.
  const files = (index.files ?? {}) as Record<string, FileEntry>;
  const sources: Record<string, ListedSource> = {};
  const loads = ((index.loads ?? []) as RawLoad[]).map(listedOf);
  const donors = ((index.donors ?? []) as RawLoad[]).map(listedOf);
  let loadSource: string | null = null;
  for (const [id, b] of Object.entries(fallback.sources)) {
    const key = b.file.split('.')[0]!;
    if (b.format === 'parquet' && (loads.length || !files[key])) {
      loadSource = id;
      sources[id] = { ...b, loads, donors, ...(files[key] ? { entry: files[key] } : {}) };
    } else sources[id] = { ...b, ...(files[key] ? { entry: files[key] } : {}) };
  }
  const histories: Record<string, FileEntry> = files.history && loadSource ? { [loadSource]: files.history } : {};
  const out: Record<string, FileEntry> = {};
  for (const [id, s] of Object.entries(sources)) if (s.entry) out[id] = s.entry;
  if (files.history) {
    out.history = files.history;
    if (loadSource) out[`history:${loadSource}`] = files.history;
  }
  return {
    format: 1, ...(typeof index.month === 'string' ? { month: index.month } : {}), ...(typeof index.built === 'string' ? { built: index.built } : {}), data, flow: null, sources, histories,
    loadSource: loads.length ? loadSource : null, loads, episodes: episodesOf(index.episodes), donors, files: out,
  };
}

/** Every file a list names, with the sha256 and size it gives: what must be in MANIFEST.json, as it says. */
export function namedFiles(list: DataList): { path: string; sha256: string; bytes: number }[] {
  const fixed = Object.values(list.files).map((f) => ({ path: f.from ?? f.path, sha256: f.sha256, bytes: f.bytes }));
  const days = [...list.loads, ...list.episodes.flatMap((e) => e.loads), ...list.donors].map((l) => ({ path: l.file, sha256: l.sha256, bytes: l.bytes ?? -1 }));
  return [...fixed, ...days];
}
