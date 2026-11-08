/**
 * The example flow's sources as the engine reads them: each file is registered with `@smaltdb/external` under its
 * name, and read through an external table. The app and the tests use the same definitions.
 */
export interface ExampleSource {
  /** The registered file's name, also its name next to the app. */
  file: string;
  /** The external table the flow document's source names. */
  table: string;
  ddl: string;
}

/**
 * The same table, read from a file pinned in the engine by the smaltfl plugin (`pin`, ADR 0006 §3): the engine hashes
 * the bytes, refuses a mismatch, and records which file each run read. The app reads its sources this way.
 */
export const pinnedDdl = (src: ExampleSource): string => src.ddl.replace(`'file:${src.file}'`, `'smaltfl:${src.file}'`);

/**
 * The donor a fill reads (ADR 0009 amendment 1 S3): another day's trips file, pinned only when a fill needs it, read
 * through its own external table with the trips' columns. A derived document names it as the source `trips_donor`
 * (fill.ts donorSourceOf). Not one of the sources every run reads, so it isn't in EXAMPLE_SOURCES. Until loads.json
 * format 2 makes a donor's table from its source's binding (ADR 0010 §9).
 */
export const DONOR_SOURCE: ExampleSource = { file: 'trips_donor.parquet', table: 'trips_file_donor', ddl: "CREATE EXTERNAL TABLE trips_file_donor WITH (location = 'file:trips_donor.parquet', format = 'parquet')" };

export const EXAMPLE_SOURCES: ExampleSource[] = [
  { file: 'trips.parquet', table: 'trips_file', ddl: "CREATE EXTERNAL TABLE trips_file WITH (location = 'file:trips.parquet', format = 'parquet')" },
  {
    file: 'zones.csv',
    table: 'zones_file',
    ddl: "CREATE EXTERNAL TABLE zones_file(LocationID INTEGER, Borough TEXT, Zone TEXT, service_zone TEXT) WITH (location = 'file:zones.csv', format = 'csv', header = true)",
  },
  {
    file: 'weather.csv',
    table: 'weather_file',
    ddl: 'CREATE EXTERNAL TABLE weather_file(borough TEXT, "time" TEXT, temperature_2m REAL, precipitation REAL, rain REAL, snowfall REAL, snow_depth REAL, wind_speed_10m REAL, weather_code INTEGER) ' +
      "WITH (location = 'file:weather.csv', format = 'csv', header = true)",
  },
];
