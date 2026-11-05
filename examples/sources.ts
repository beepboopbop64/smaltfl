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
