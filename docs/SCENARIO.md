# The reference scenario: NYC taxis, weather and districts

- **Status:** draft (open point: [Q-37](OPEN_QUESTIONS.md); districts are boroughs,
  [ADR 0002](adr/0002-second-round-decisions.md) §2; the actions, [ADR 0003](adr/0003-third-round-decisions.md) §2)
- **Date:** 2026-11-05

One realistic example that smaltfl is built, tested and optimized against (ADR 0001 §15). Every feature is checked
against it, the benchmarks run on it, and the UI is judged by how easily someone can build it.

> **To verify.** This session's network policy blocks the data hosts, so the sizes and row counts below come from
> the publishers' documentation and earlier releases, not from a download. They are marked *(to verify)* until the
> first fixture build measures them.

## 1. The problem

A city operations team plans taxi coverage. They want to know, by district and hour:

1. **How weather moves demand.** How many more (or fewer) trips start in rain or snow, and how much longer they take.
2. **Where service is slow.** Average speeds and trip durations by zone and hour, as a congestion signal.
3. **Airport trips.** How trip times to JFK, LaGuardia and Newark change with weather and time of day, so planners
   can set buffers.
4. **Tipping and fares.** How tip rates on card payments move with weather, distance and district.

Each district lead sees only their own district. A city analyst sees every district but not the fare and tip
details. Stewards can mark bad records, and leads can set service targets for their own zones. Anyone who receives
the results can verify how they were made.

## 2. The data

| Source | What | Size | Access |
| --- | --- | --- | --- |
| NYC TLC yellow taxi trip records | One row per trip: pickup and dropoff time and zone, distance, passenger count, fare, tip, tolls, surcharges, payment type (19 columns in 2024) | About 3 million trips and 50 MB of Parquet a month *(to verify)* | Monthly Parquet files on the TLC's CloudFront host (`d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_YYYY-MM.parquet`). Whether it sends CORS headers is *to verify*; if not, the demo serves a copy, or the user picks the downloaded file |
| NYC TLC taxi zone lookup | `LocationID`, `Borough`, `Zone`, `service_zone` for 265 zones, including "Unknown" and "Outside of NYC" | 265 rows | CSV on the same host (`misc/taxi_zone_lookup.csv`); the zone shapes are a separate download, for maps later |
| Open-Meteo historical weather | Hourly temperature, precipitation, rain, snowfall, snow depth, wind and weather code, for one point per borough plus Newark, in New York local time | About 2,200 hours per point for Q1 2024 | `archive-api.open-meteo.com/v1/archive`, CSV or JSON, CORS-enabled *(to verify)*; free for non-commercial use with attribution (CC BY 4.0) |

What makes this data a good test:
- **Real defects.** Trips dated outside their month, negative fares, zero or absurd distances, durations under a
  minute or over a day, missing passenger counts, exact duplicate rows, unknown zones (264 and 265).
- **Time.** Timestamps are local wall-clock time without a zone. Q1 2024 includes the start of daylight saving time
  (10 March), when the hour from 02:00 to 03:00 does not exist. The Parquet plugin reads timestamps as SQLite-style
  text, so bucketing uses smaltdb's date functions (`strftime('%Y-%m-%d %H:00', …)`).
- **Skew.** Most trips start in Manhattan; Staten Island has very few. Policies by district give very uneven
  partitions.
- **Joins at different grains.** Trips (rows) to zones (265) to boroughs (6), and to weather by borough and hour.

### Tiers

| Tier | Data | Rows | Used for |
| --- | --- | --- | --- |
| XS | A deterministic sample: 10,000 trips from January 2024, the zone table, one week of weather | ~10k | Fixtures in this repository; unit tests |
| S | The first week of January 2024 | 609,698 | CI browser tests; the app, as seven daily loads (below) |
| M | January 2024 | ~3M *(to verify)* | The default demo and the main benchmark |
| L | January to March 2024 | ~9.5M *(to verify)* | The limit test: smaltdb's design point is about 10M rows and 1 GB |
| XL | All of 2024 | ~40M *(to verify)* | The future server runner: run there, bring aggregates back to the browser (ADR 0001 §3) |

### Daily loads

The app runs on the first week a day at a time, as a feed would bring it: the data branch's `loads/` has one file a
day, every trip picked up that day (local time, as the records give it), from 67,543 trips on Sunday the 7th to
103,178 on Friday the 5th. Each load is the `trips` source for one run, and is compared with the one before. The
week shows the differences a daily feed has: New Year's Day drops 8.6% of its trips at the checks (the rest of the
week 3.9 to 5.0%), with 13% of its trips Flex Fare trips and so no passenger count, and its pickups earlier in the
day, the small hours after midnight busy (a median time of day of 11:59 against 14:58 the day after); a Saturday has
no rush-hour surcharge in its extras;
and the storm of the 6th and 7th brings the week's only wet and snowy hours in number.

## 3. The flows

One flow document, `nyc-taxi-weather.smaltfl.json`, with a `month` parameter (default `2024-01`; tier L passes a
range). Steps, in the order a person would build them:

**Ingest (bronze).**
1. `trips`: the month's Parquet file. Snapshotted by content hash on first read.
2. `zones`: the zone lookup CSV.
3. `weather`: hourly weather for the six points, from Open-Meteo.

**Clean (silver).**
4. `trips_valid`: expectations with actions on failure. Drop: pickup outside the month, duration under 1 minute or
   over 3 hours, distance at or below 0 or over 100 miles, negative fare, unknown zones. Warn: missing passenger
   count. Fail the run: more than 10% of rows dropped (calibrated on the real data: the drop rules remove 4.5% of a
   100,000-trip sample of January 2024, 3.9 to 5.0% of a day's trips in the first week, and 8.6% on New Year's Day,
   which an 8% limit would stop). The run report lists counts per rule.
5. `trips_dedup`: exact duplicates removed; each trip gets a stable `trip_id` (a hash of its fields plus an occurrence
   number, so true duplicates stay distinguishable).
6. `trips_clean`: minus the trips stewards excluded (the *Exclude trips* action's edits).

**Enrich (silver).**
7. `trips_enriched`: pickup and dropoff borough and zone, local pickup hour, hour of week, duration, average speed,
   airport flag, card tip rate (cash tips aren't recorded).
8. `weather_hourly`: one row per borough and hour, with a condition label (dry, rain, heavy rain, snow). Open-Meteo
   stamps an hour's precipitation, rain and snowfall at the hour's end (they sum the preceding hour), so the row
   stamped 15:00 is the hour from 14:00, the pickup hour it joins.

**Aggregate (gold), persisted as datasets.**
9. `zone_hour`: trips, average duration, speed, fare and card tip rate, per pickup zone and hour.
10. `borough_hour_weather`: `zone_hour` rolled up to borough, joined to the weather.
11. `weather_effect`: demand, duration and tip rate in each condition relative to dry hours, per borough and hour of
    day: the table that answers question 1.
12. `airport_times`: trip times to each airport by hour of day and condition: question 3.

**Share.**
13. A package for each recipient (section 5).

The same flow must be buildable two ways: entirely with visual tools, and with SQL steps. Both must produce the same
hashes for the gold datasets.

## 4. The ontology and actions

| Object type | Key | Backed by | Links |
| --- | --- | --- | --- |
| District | borough | `zones` (distinct boroughs) | has many Zones |
| Zone | `LocationID` | `zones` | belongs to a District; has many ZoneHours |
| ZoneHour | zone, hour | `zone_hour` | belongs to a Zone; has a WeatherHour |
| WeatherHour | borough, hour | `weather_hourly` | belongs to a District |
| Trip | `trip_id` | `trips_clean` | picked up in a Zone; dropped off in a Zone |

| Action | Who may run it | Effect |
| --- | --- | --- |
| Exclude trips | Data stewards | Adds trips (by id or by a filter) to an exclusions dataset with a reason; `trips_clean` drops them on the next run |
| Set zone service target | A district lead, for zones in their district only | Sets a target trip count for a zone and hour of week; compared with `zone_hour` |
| Annotate weather event | Anyone with access to the flow | Labels a period ("snowstorm") for one or more districts; used to split the analysis |

Every action's edits are recorded with who, when, the parameters and a hash chained to the previous edit, so the
history can't be rewritten unnoticed.

## 5. Sharing with permissions

The flow's owner shares results with four people:

| Recipient | Sees | Can run |
| --- | --- | --- |
| Ana, Manhattan lead | Rows for Manhattan only | Set zone service target (Manhattan zones), Annotate weather event |
| Ben, Brooklyn and Queens planner | Rows for Brooklyn and Queens | Set zone service target (Brooklyn and Queens zones), Annotate weather event |
| Cara, airport operations | Rows for the airport zones only (JFK, LaGuardia, Newark), in any district | Annotate weather event |
| Dev, city analyst | Every district, without fare, tip and toll columns | Annotate weather event |

Each person gets one package (Q-35). Rows are partitioned by the columns the rules use (the district, and the airport
zones for Cara's rule), each partition is encrypted with its own key, and each key is wrapped only for the people
allowed to read it (ADR 0001 §7): the JFK and LaGuardia zones' partition has one key, wrapped for Ben and for Cara.
Columns a recipient may not see are removed before encryption. The package carries the flow, the run manifest and its
signature, so a recipient can check where every number came from.

## 6. Checks that must pass

**Correctness.**
- Gold datasets on tier XS and S match reference results computed independently and stored with the fixtures.
- The visual and the SQL versions of the flow give identical gold hashes.

**Enforcement.**
- Ana's package holds no row outside Manhattan: the other partitions' keys aren't in it, and decrypting with Ana's
  key fails for them. Dev's package holds no fare, tip or toll column, nor any column made from one.
- "View as Ana" in the app shows exactly what Ana's package shows.
- `airport_times` mixes districts in each row, so it is closed to the district leads, and the app says why
  ([Q-41](OPEN_QUESTIONS.md)).
- *Set zone service target* is refused for a zone outside the lead's district, and the refusal is recorded.

**Reproducibility.**
- Re-running a shared run from its manifest gives the same output hashes, bit for bit.
- Changing one byte of an input snapshot makes verification fail and names the input.
- Editing one step's SQL changes that step's key and its dependents' keys, and nothing else is recomputed.

## 7. What to optimize for

These are budgets to calibrate at the first baseline, not measurements. Each is measured on Chromium on a mid-range
laptop, with the results saved as JSON in `bench/results/`, as smaltdb does.

| What | Budget | Why |
| --- | --- | --- |
| Full run, tier M, inputs already in OPFS | ≤ 10 s | The scenario should feel interactive at a month of data |
| Full run, tier L | Completes, ≤ 45 s | The limit test: it must finish without running out of memory |
| Preview of any step (first 1,000 rows), tier M | ≤ 300 ms | Building a flow is a loop of change, look, change |
| Re-run after editing one gold step | ≤ 1 s | Only that step and its dependents run, keyed by hash |
| Orchestration overhead over the compiled SQL run directly | ≤ 5% | smaltfl adds structure, not time |
| Hashing, tier M | ≤ 10% of the run | Hashes all the way through has to be cheap enough to leave on |
| Building the four packages, tier M | ≤ 5 s | Sharing under policy has to be routine |
| Canvas with 50 steps | 60 frames a second while dragging; opens in ≤ 1 s | The UI stays smooth at the scenario's size and beyond |
| Bytes read for a filtered Parquet scan | Only the needed columns and row groups | Pushdown keeps the network and OPFS cost down |
| First-time build of the scenario by a new user | ≤ 15 minutes, from a blank canvas, without the docs | The measure of an intuitive UI |

Correctness, enforcement and verification come before speed: a faster version that weakens any check in section 6 is
rejected.

**A first baseline** (`bench/results/node.json`: Node 22 in a cloud container, on the seeded stand-in for the data,
not yet Chromium). At 300,000 trips, the flow's statements run on their own in 4.4 s, and a first run takes 6.0 s; the
difference is the table source's snapshot (its copy and its hash), which a Parquet source replaces by hashing the
file's bytes. A run with nothing changed takes 16 ms, a run after editing a gold step 36 ms, and verifying a run
4.7 s. The engine's own statements dominate, `DISTINCT` and the date functions above all, so the tier M budget is
first a question of what those statements cost in smaltdb, measured in Chromium.

## 8. Later

- **Congestion pricing.** Q1 2025 against Q1 2024: the same flow with a second parameter, and the 2025 data's
  congestion fee column.
- **The server runner.** Tier XL on a server, bringing `zone_hour` back to the browser, or writing Parquet the
  browser reads in place.
- **Maps.** Zone shapes for a choropleth, once there is a chart for it.
