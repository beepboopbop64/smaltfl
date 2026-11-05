# Tier XS fixtures

Real data for the tests (docs/SCENARIO.md §2): 10,000 trips sampled from the NYC TLC yellow taxi records for
January 2024 (seeded, in file order), the TLC zone lookup, and Open-Meteo hourly weather for one point per district.
Copied from the repository's `data` branch, which `scripts/data/build.py` builds; sizes and SHA-256 hashes are in
`MANIFEST.json`.

Trip records and the zone lookup are published by the NYC Taxi and Limousine Commission under the NYC Open Data
terms of use. Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
