> Repository layout: this GitHub repository is the web root. Output paths are `data/nisar/` here. The pipeline source is included with filesystem-path adaptation only; the scientific processing is unchanged. `make-gnss-bundle.py` is included alongside the pipeline for reproducible GNSS checks.

# NISAR pipeline

`nisar_pipeline.py` turns NASA-ISRO **NISAR L-band GUNW** products (geocoded unwrapped interferograms, provisional
release, Alaska Satellite Facility) into map layers for the web explorer. Outputs land in `web/data/nisar/` and are listed
in `web/data/nisar/index.json`. The explorer picks them up automatically for any event whose `eventId` matches a site in
[`sites.json`](sites.json).

## Install

```bash
python -m pip install -r pipeline/requirements.txt
```

## 1 · Search (no login)

```bash
python pipeline/nisar_pipeline.py search central-valley
```

Lists every GUNW pair whose footprint contains the site, grouped into **stacks** (`track_direction_frame`, e.g.
`114_D_070`). A stack is one look direction revisited every 12 days, so its pairs chain into a time series.

## 2 · Animated real phase from browse images (no login)

```bash
python pipeline/nisar_pipeline.py browse central-valley --max 0
```

```bash
python pipeline/nisar_pipeline.py browse central-valley --stack 034_A_020 --max 0
```

For each pair in the best stack, this:

1. downloads JPL's public browse image;
2. georeferences it from the granule footprint — the image's four footprint corners are matched to the granule polygon
   (typical RMS ≈ 1 px; fits worse than `--max-fit-px`, default 6 px, are rejected);
3. crops it to the scene and reprojects it to Web Mercator;
4. **recovers the real wrapped phase** by inverting the browse colour map. JPL draws GUNW browse images in matplotlib's
   cyclic *twilight* map, which matches every pixel to within ~1 RGB unit;
5. lightly smooths the phase (3×3 complex mean), computes a coherence-like confidence from local phase consistency so
   water and decorrelated fields fade out, and references each pair to its own circular mean;
6. writes one small RGB frame per pair (R = phase, G = confidence).

The web explorer **animates** these frames. Wrapped phases add exactly modulo one cycle, so the running sum of consecutive
12-day pairs is the interferogram from the first date to each later date, and interpolating inside a pair moves the real
fringes smoothly through time. Atmosphere and ionosphere telescope out of the sum except on the first and current dates,
so this view is real but qualitative. For measured centimetres, use `process`, which writes the same animatable frames
from masked, ionosphere-corrected unwrapped phase.

## 2b · Crops and water: dual-polarization backscatter (no login)

```bash
python pipeline/nisar_pipeline.py gcov nile-delta
```

Downloads the public preview of every dual-polarization (HH + HV) GCOV image of the best track over the site, places
it on the same map grid as the phase frames and writes WebP frames to `web/data/nisar/<site>/gcov/`. The preview colours
are R = HH, G = HV, B = HH. These are qualitative browse composites. Scattering, moisture, vegetation, acquisition,
processing and alignment can all affect appearance; a colour alone is not a verified land-cover or flood label.
For quantitative backscatter work, use the calibrated full GCOV product and its quality information, then validate
the interpretation against matching-date independent observations. The web Observation Desk compares these previews
without estimating flood extent, crop health or a calibrated backscatter difference.

## 3 · Measured LOS motion + GNSS check + time series (Earthdata Login)

The HDF5 products need a free [Earthdata Login](https://urs.earthdata.nasa.gov). The script **reads** credentials and never
prompts. Set them up yourself in one of these ways:

- set `EARTHDATA_TOKEN` (Earthdata profile → *Generate Token*), or
- set `EARTHDATA_USERNAME` and `EARTHDATA_PASSWORD`, or
- add `machine urs.earthdata.nasa.gov login <user> password <pass>` to `~/.netrc` (`%USERPROFILE%\_netrc` on Windows).

```bash
python pipeline/nisar_pipeline.py process central-valley --max 0
```

Each GUNW file is about 2.2 GB, but the pipeline **streams** it over HTTPS and reads only the scene window. To work
offline, download the files once with the ASF Vertex or `earthaccess` and pass them in:

```bash
python pipeline/nisar_pipeline.py process central-valley --local path/to/NISAR_L2_PR_GUNW_*.h5
```

For every pair it:

1. crops `unwrappedPhase`, `coherenceMagnitude`, `connectedComponents`, `ionospherePhaseScreen` and the valid/water
   `mask` to the scene;
2. drops water, invalid subswaths, coherence < 0.35 (`--min-coherence`) and every connected component except the
   largest (`--all-components` to keep them; their relative offsets are arbitrary);
3. subtracts the ionospheric phase screen (`--no-iono` to skip);
4. converts phase to line-of-sight motion, **positive toward the satellite**: `los = −φ·λ/4π`, with λ from
   `centerFrequency` (NISAR ATBD JPL D-95677: interferogram = reference × conj(secondary), φ = 4π·Δr/λ);
5. references the scene to its median, or ties it to a GNSS station (`referenceStation` in `sites.json`);
6. compares with every Nevada Geodetic Lab station inside the scene: GNSS ENU change (±3-day means, NGL-logged equipment
   offsets removed) projected on the product's own LOS unit vectors, as **station-to-station double differences** so the
   unknown InSAR reference cancels. It reports RMS and correlation, and warns if they are anti-correlated (a sign error);
7. renders LOS motion (diverging map), a re-wrapped view in Fringe's colours, and a coarse int16 grid (mm) for
   click-to-probe in the browser;
8. chains consecutive pairs of a stack into **cumulative** motion frames, with a GNSS check over the whole span.

## Photos: Then & Now and On the ground (no login)

```bash
python pipeline/imagery_timeline.py     # satellite photos over time  -> web/data/imagery.json
python pipeline/ground_photos.py        # ground photos + credits     -> web/data/photos.json, web/data/photos/
```

`imagery_timeline.py` walks every version of Esri World Imagery Wayback for the spots in `then_now.json` and keeps
the versions whose photo really changed, with capture date and sensor. `ground_photos.py` downloads the Wikimedia
Commons files listed in `ground_photos.json` at 1280 px, after re-checking that each is public domain, CC0, CC BY or
CC BY-SA; anything else is skipped. To add a photo, add its `File:` title and a factual caption, then run it again.

## Add a study area (e.g. your home town)

Add an entry to `sites.json`:

```json
"nile-delta": { "name": "Nile Delta — Alexandria coast", "eventId": "nile-delta", "center": [31.2, 29.95], "extentKm": 60 }
```

Then run `search` / `browse` / `process`. The web explorer shows the layers for an event with the same `eventId` in
`web/fringe.js` `EVENTS`, so add the event there too, with its story, driver and sources.

## Tests

```bash
python pipeline/tests/test_pipeline.py
```

These build synthetic GUNW products in the layout of the official product specification (JPL D-102272 Rev E), with a
known subsidence bowl, an ionospheric screen, a mis-unwrapped island, water and decorrelated areas. They check that the
pipeline recovers the motion to within 2 mm with the right sign, removes the bad pixels, uses the LOS vectors, double-
differences GNSS correctly, georeferences browse images and builds the cumulative series end to end.

## Data credit

NISAR data: NASA/JPL-Caltech and ISRO, distributed by the Alaska Satellite Facility DAAC. Cite the collection DOI shown
in ASF Vertex / Earthdata Search for `NISAR_L2_GUNW_PROVISIONAL_V1`. GNSS: Nevada Geodetic Laboratory (Blewitt et al.,
2018, Eos 99).
