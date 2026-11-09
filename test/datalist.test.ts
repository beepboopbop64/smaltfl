/**
 * The data list a page opens (ADR 0010 §9): format 2 binds each source by id, its file or its loads and donors, and
 * each watched source's history; format 1, the data branch's list before it, still reads, bound by the example's
 * bindings. Either way the page and the real-data tests get one shape.
 */
import { describe, expect, it } from 'vitest';
import { namedFiles, readDataList } from '../src/app/datalist.js';
import { ddlOf, donorBinding, EXAMPLE_DATA, pinnedDdl } from '../examples/sources.js';

const SHA = (c: string) => c.repeat(64);
const day = (d: string, c: string) => ({ file: `loads/yellow_tripdata_${d}.parquet`, rows: 100, sha256: SHA(c), bytes: 10 });

describe('readDataList', () => {
  const history = { path: 'history.json', from: 'history.json', sha256: SHA('h'), bytes: 5 };
  const zones = { path: 'zones.csv', from: 'tlc/taxi_zone_lookup.csv', sha256: SHA('z'), bytes: 3 };
  const weather = { path: 'weather.csv', from: 'weather/open-meteo_loads.csv', sha256: SHA('w'), bytes: 4 };

  it('reads format 1 by the example\'s bindings: the trips\' loads and donors, the files by source', () => {
    const list = readDataList({ month: '2024-01', data: { commit: 'c', manifest: SHA('m'), bytes: 9 }, files: { zones, weather, history }, loads: [{ day: '2024-01-01', ...day('2024-01-01', 'a') }], episodes: [{ name: 'September 2023', about: 'x', loads: [{ day: '2023-09-21', ...day('2023-09-21', 'b') }] }], donors: [{ day: '2023-09-14', ...day('2023-09-14', 'd') }], history: 'history.json' }, EXAMPLE_DATA);
    expect(list).toMatchObject({ format: 1, month: '2024-01', loadSource: 'trips', flow: null, histories: { trips: history } });
    expect(list.loads).toEqual([{ day: '2024-01-01', ...day('2024-01-01', 'a') }]);
    expect(list.donors.map((l) => l.day)).toEqual(['2023-09-14']);
    expect(list.episodes[0]!.loads[0]!.day).toBe('2023-09-21');
    expect(Object.keys(list.files).sort()).toEqual(['history', 'history:trips', 'weather', 'zones']);
    expect(list.sources.weather).toMatchObject({ table: 'weather_file', context: 'weather', entry: weather });
  });

  it('reads the XS fixtures\' format 1: no loads, the trips one file', () => {
    const trips = { path: 'trips.parquet', from: 'fixtures/xs/trips.parquet', sha256: SHA('t'), bytes: 7 };
    const list = readDataList({ data: null, files: { trips, zones, weather }, loads: [], donors: [] }, EXAMPLE_DATA);
    expect(list.loadSource).toBeNull();
    expect(list.files.trips).toEqual(trips);
    expect(list.histories).toEqual({});
  });

  it('reads format 2 as it says: bindings by id, slots as days, histories by watched source, the flow it is for', () => {
    const flow = { path: 'flow.json', from: 'examples/security-signins.smaltfl.json', sha256: SHA('f'), bytes: 2 };
    const list = readDataList({
      format: 2, month: '2024-03', data: null, flow,
      sources: { auth: { table: 'auth_file', format: 'csv', file: 'auth.csv', header: true, columns: [['event_time', 'TEXT']], loads: [{ slot: '2024-03-12', file: 'loads/auth_2024-03-12.csv', sha256: SHA('a'), bytes: 1, rows: 3 }], donors: [] } },
      histories: { auth: history }, episodes: [],
    }, EXAMPLE_DATA);
    expect(list).toMatchObject({ format: 2, loadSource: 'auth', flow, histories: { auth: history } });
    expect(list.loads).toEqual([{ day: '2024-03-12', file: 'loads/auth_2024-03-12.csv', sha256: SHA('a'), bytes: 1, rows: 3 }]);
    expect(list.files).toEqual({ history, 'history:auth': history, flow });
    // The flow document is the build's own, checked by its entry when read, not one of the data's files (ADR 0011).
    expect(namedFiles(list).map((f) => f.path)).toEqual(['history.json', 'history.json', 'loads/auth_2024-03-12.csv']);
  });
});

describe('bindings', () => {
  it('make each table\'s DDL, pinned or not, and a donor\'s from its source\'s', () => {
    const auth = { table: 'auth_file', format: 'csv' as const, file: 'auth.csv', header: true, columns: [['event_time', 'TEXT'], ['user', 'TEXT']] as [string, string][] };
    expect(ddlOf(auth)).toBe(`CREATE EXTERNAL TABLE auth_file(event_time TEXT, "user" TEXT) WITH (location = 'file:auth.csv', format = 'csv', header = true)`);
    expect(pinnedDdl(auth)).toBe(`CREATE EXTERNAL TABLE auth_file(event_time TEXT, "user" TEXT) WITH (location = 'smaltfl:auth.csv', format = 'csv', header = true)`);
    expect(donorBinding('auth', auth)).toMatchObject({ table: 'auth_file_donor', file: 'auth_donor.csv' });
  });
});
