# Bundled NISAR data

This snapshot contains 93 unique provisional GUNW pairs on 11 tracks at 9 sites. The app has 10 places;
Kahramanmaras has no bundled NISAR stack. Browse previews and processed representations of the same pair
are counted once.

## Full GUNW processing

| Site | Track | Pairs | Acquisition window |
| --- | --- | --- | --- |
| Central Valley | 114_D_070 | 9 | 2026-06-10 to 2026-10-20 |
| Nile Delta | 007_D_073 | 8 | 2026-06-26 to 2026-10-12 |

`nisar_pipeline.py process` streams the study-area window from the full products. It masks invalid, water and
low-coherence pixels (minimum coherence 0.35), keeps the main connected component and subtracts the product's
ionospheric phase screen. Phase is converted to LOS displacement, positive toward the satellite. Each pair is
referenced to its scene median. Consecutive pairs are summed; a missing pixel in any pair stays missing in the
cumulative result. No gap filling or new observations are introduced by animation.

For the Delta, about 11% to 23% of native scene pixels survive the mask in each pair. About 4.7% of the final
displayed cumulative scene remains valid throughout all eight pairs. The PNG overlays retain their masks;
the smaller signed little-endian int16 grids store millimetres and use -32768 for missing data. Zero is a valid
displacement value. Cumulative `validFraction` describes the full display image; the audit also counts valid
cells independently in the reduced grids.

No usable station-to-reference GNSS comparison was obtained for the Delta. The bundled ALX2 series is historical
context, not validation of the 2026 observations. Central Valley's comparison has 9 station differences, with
about 3.06 cm radar/GNSS residual RMS versus about 0.43 cm for a zero-motion baseline; it does not resolve the
small station motion. These are relative LOS estimates with residual atmospheric and processing errors, not
absolute vertical sinking or a validated subsidence map. The published historical rates and Sea 2100 model
remain separate from this processing.

## Full GCOV season analysis

`gcov_season.py` reads 10 dates on track `129_A_017`, 2026-06-23 to 2026-10-21, over a 20 x 20 km window centred
at 31.10 N, 30.95 E near Kafr El Sheikh. It averages linear HH and HV gamma0 from 10 m pixels onto 50 m cells,
then records the spatial median in dB. The per-date granule IDs and results are in
`data/nisar/nile-delta/gcov-season.json`; the separate 9-frame GCOV browse sequence is indexed in `index.json`.

HV rises about 3.1 dB from the first date to its August peak; HH rises about 4.2 dB. The growing-season and
flooded-rice explanations are hypotheses. Crop types, harvest dates and water extent were not independently
verified. The exploratory RVI and dark-surface threshold values remain in the JSON for traceability; the app
shows HH/HV directly. The dark-surface estimates are all zero in this window at the chosen thresholds and
must not be presented as evidence that no water was present or as a validated water-area measurement.

## Check or reproduce

Serve the app from the repository root with `python -m http.server 5173 --bind 127.0.0.1`.

```sh
python Tools/audit_web.py --check
python pipeline/nisar_pipeline.py process nile-delta --stack 007_D_073
python pipeline/gcov_season.py 129_A_017
```

Processing requires Earthdata credentials and the packages in `pipeline/requirements.txt`. Reprocessing queries
the current catalogue and may change the available dates. For the exact bundled snapshot, use the granule IDs
and settings in the committed JSON files. After reviewing intentional data changes, regenerate the local
integrity manifest with `python Tools/audit_web.py`, then run its `--check` mode. File hashes establish bundle
integrity, not scientific accuracy. Do not modify the time-stamped evidence records in `data/evidence/`.

Sources: [ASF GUNW guide](https://nisar-docs.asf.alaska.edu/gunw/),
[ASF GCOV guide](https://nisar-docs.asf.alaska.edu/gcov/), [ASF Vertex](https://search.asf.alaska.edu/),
[NASA Earthdata Search](https://search.earthdata.nasa.gov/search).

SAOCOM, RADARSAT and UAVSAR data are not used in these computations. Their Guide links are learning resources
or future comparisons, not additional processed datasets.
