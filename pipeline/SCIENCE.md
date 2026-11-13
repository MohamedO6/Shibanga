# An independent check of the Nile Delta season

## Question and interpretation

Does the seasonal change in NISAR HV backscatter agree with optical greenness from an independent sensor
over the same study area? This tests the existing growing-season interpretation; it is not a test of ground
displacement or a claim to identify rice, cotton, harvest dates or flooding.

The check finds a positive but imperfect regional association across eight paired observations. It adds
evidence consistent with seasonal vegetation change. It does not establish a cause, validate a crop map,
or validate the Delta GUNW displacement estimates against GPS.

## Data and analysis plan

- Radar: the existing ten full-product provisional NISAR GCOV observations on track `129_A_017`,
  23 June to 21 October 2026, with median HH/HV gamma0 in `gcov-season.json`.
- Optical: USGS Landsat 8/9 Collection 2 Level 2, Tier 1, red and near-infrared surface reflectance,
  served through the public Microsoft Planetary Computer catalogue. Each accepted scene's ID, date and
  unsigned asset URLs are retained in `season-check.json`.
- Area: the original 20 x 20 km UTM footprint centred at 31.10 N, 30.95 E. Optical measurements are
  averaged onto a fixed 50 m grid. The radar input remains the original regional medians; it is not
  recomputed on the slightly smaller optical support. This is a comparison of regional summaries,
  not pixel-by-pixel validation.
- The rules in `season_check_plan.json` were fixed before reading the optical NDVI results. The radar
  seasonal pattern was already known, so this is exploratory research, not a preregistered field trial.
  The output records the plan and input-radar SHA-256 fingerprints.

For each radar date, select the nearest unused Landsat acquisition within four days. Ties prefer the earlier
date and then scene ID. Only QA coverage can reject a candidate; NDVI values and correlation cannot be used
to choose dates. The catalogue query and rejected candidates are retained. September 27 and October 9 radar
observations have no optical scene meeting the frozen rules and are excluded from the paired analysis.
Gaps use UTC calendar dates, not a strict 96-hour timestamp bound; same-date pairs need not be simultaneous.

## Scaling, masking and common support

Apply the USGS Collection 2 surface-reflectance scale and offset **before** computing NDVI:

```
reflectance = DN * 0.0000275 - 0.2
NDVI = (NIR - red) / (NIR + red)
```

Reject fill, dilated cloud, cirrus, cloud, shadow and snow using QA_PIXEL bits 0 through 5. Reject red/NIR
saturation and terrain occlusion using QA_RADSAT bits 3, 4 and 11. Exclude aerosol fill and high aerosol
levels, zero-DN fill, reflectance outside [0, 1], and nonpositive denominators. A water flag alone does
not imply bad optical data and is not used to select vegetation pixels.

A 50 m cell requires at least 90% valid native optical support. A scene requires at least 80% usable cells.
All eight accepted dates use the same intersection of valid optical cells: **393.165 km2, or 98.2912% of the
400 km2 footprint**. Missing data is not replaced with zero or filled from another date.

## Results and robustness

| Check | Result | Scope |
| --- | --- | --- |
| Matched radar/optical dates | 8 | Each within 4 days; 3 pairs on the exact date |
| Primary HV vs NDVI Spearman correlation | 0.666667 | Descriptive regional association |
| Secondary HH vs NDVI correlation | 0.761905 | Reported even though HV was primary |
| HV/NDVI first-difference rate correlation | 0.857143 | Seven intervals; each sensor uses its own date gaps |
| Leave-one-date-out HV correlation | 0.535714 to 0.821429 | Direction remains positive; strength varies |
| HV correlation with 1 km / 4 km blocks | 0.571429 / 0.571429 | Spatial aggregation affects the estimate |
| HV correlation on exact-date pairs only | 0.5 | Only three pairs: too few for a strong conclusion |

NDVI rises from about 0.478 on June 27 to 0.674 on August 6, then falls to 0.360 on October 17. NISAR HV
peaks on August 22 in the original radar series, so the peaks do not coincide exactly. HH has the larger
association in this small sample. These observations do not show that HV uniquely measures crop growth,
or that the HH increase must be flooded rice.

The primary NDVI summary is the median of 100 spatial-block means, using nonoverlapping 2 km blocks.
The figure's intervals come from 2,000 seeded spatial-block bootstrap replicates. The same block draws
are used across dates. These intervals describe spatial sampling variability under the block-resampling
assumption. They **omit calibration, atmospheric, geolocation and temporal-sampling uncertainty** and
are not measurement-accuracy bounds. Results from 1 km and 4 km blocks are also reported.

No significance p-values are reported: there are few dates and temporal dependence. The first-difference
check reduces reliance on a shared broad seasonal trend, but does not remove all confounding or temporal
dependence. No time lag was searched to maximise correlation, and no crop labels were fitted to the result.
The eight optical windows are independent sensor measurements, not independent field observations.
The study covers one patch and one season, so it does not establish general performance elsewhere.

## Reproduce and inspect

```sh
python -m pip install -r pipeline/science-requirements.txt
python pipeline/season_check.py
python pipeline/season_check.py --offline
python -m unittest discover -s pipeline/tests -v
python Tools/audit_web.py --check
```

The online command fetches only public Landsat image windows. No Earthdata credentials are required for this
optical check. Cached windows and the catalogue are ignored by Git; offline mode requires a completed online
run. The scene IDs in the published result pin the observations. A future catalogue refresh can discover
reprocessed scenes, so compare IDs and plan hashes before treating a fresh run as identical.

Outputs in `data/nisar/nile-delta/`: `season-check.json` (methods, source IDs, exclusions and statistics),
`season-check.csv` (paired values), and `season-check.png` (separate radar and NDVI axes, in their own units).
The existing full-product radar processing, historical GNSS series and stamped evidence records remain separate.

## Primary documentation

- [USGS Collection 2 reflectance scaling](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products)
- [USGS Collection 2 QA flags](https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands)
- [ASF NISAR GCOV product guide](https://nisar-docs.asf.alaska.edu/gcov/)
- [Microsoft Planetary Computer data access](https://planetarycomputer.microsoft.com/docs/)
