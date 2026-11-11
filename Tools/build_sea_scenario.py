"""Where could the sea reach by 2100, with and without the land sinking? One coastal place at a time.

A simple, openly labelled "bathtub" scenario, consistent with the explorer's "sea against the land" card:
  * land height: Copernicus DEM GLO-90 (3 arc-second, heights above the EGM2008 geoid; the model sets the
    open sea to exactly 0 m)
  * sea-level rise and land sinking: the published rates listed per place below, kept constant to 2100
  * sinking between the measured points is spread by inverse-distance weighting
  * a spot floods once it is lower than the sea AND joined to the open sea by ground that is also lower
    (a "priority flood" from the open sea), so inland hollows do not fill on their own

For each pixel the ground's height relative to the sea falls by (sea rise + sinking) every year, so it
reaches sea level after t = height / (rise + sinking) years. The year water arrives is the smallest, over
all paths from the sea, of the largest t along the path. That is computed for:
  R channel: sea rise + sinking      G channel: sea rise only
Pixel values: 0 = still dry in 2100, 1 = at or below sea level already in 2026 (today this land is kept dry
by dunes, walls and pumps), 2..75 = first year under water minus 2025, 255 = open sea.

What it ignores, and the page says so: sea walls and dunes, drainage pumps, storms and tides, faster future
sea-level rise, sediment, and the elevation model's own error (about a metre or two on flat land; it also
measures roofs and trees, not bare ground). It shows where the sea could reach, not a forecast.

Places this does NOT fit, and why they are left out:
  * Jakarta: the elevation model measures rooftops across a dense city, and its sinking rates (up to 25 cm a
    year) cannot sensibly be held constant for 74 years.
  * Central Valley and Mexico City are far inland and high above the sea; the volcanoes and faults are not
    sinking toward it.

Usage: python Tools/build_sea_scenario.py <site> <folder with the Copernicus tiles> [out_dir=data/sea]
       sites: nile-delta, norfolk
Needs numpy, scipy, pillow, tifffile, imagecodecs.
Tiles: https://copernicus-dem-90m.s3.amazonaws.com/<name>/<name>.tif, e.g.
       Copernicus_DSM_COG_30_N31_00_E031_00_DEM
"""
import heapq
import json
import math
import sys
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image
from scipy import ndimage

TILE = 1200                      # GLO-90 tiles below 50 degrees: 1200 x 1200 pixels per degree
NOW, END = 2026, 2100

SITES = {
    "nile-delta": {
        "bounds": (30.0, 29.6, 31.75, 32.6),          # south, west, north, east
        "seaMmYr": 3.4,
        "sinking": [                                   # (name, lat, lon, mm a year)
            ("Alexandria", 31.20, 29.92, 1.6),
            ("Mansoura (GPS MNSO)", 31.04, 31.38, 9.7),
            ("Damietta", 31.42, 31.81, 11.0),
            ("Port Said", 31.26, 32.30, 6.3),
        ],
        "step": 2,
        "rates": "Hassan et al., 2025, Scientific Reports (sea 3.4 mm/yr from satellite altimetry; land sinking from Sentinel-1 radar checked against GPS)",
        "compare": "The published study's worst case is about 2,400 km² of delta land at risk within 100 years (Hassan et al., 2025).",
    },
    "norfolk": {
        "bounds": (36.72, -76.62, 36.99, -76.05),
        # The tide gauge at Sewells Point measures 4.84 mm/yr of sea against the land (NOAA, 1927 to 2025).
        # Sentinel-1 radar finds Hampton Roads sinking 3.6 mm/yr on average (Buzzanga et al., 2020), so the sea's
        # own share is the remaining 1.24 mm/yr. Norfolk itself averages 4.4 mm/yr.
        "seaMmYr": 1.24,
        "sinking": [
            ("Norfolk", 36.89, -76.29, 4.4),
            ("Hampton Roads average", 36.95, -76.45, 3.6),
            ("Virginia Beach", 36.85, -76.05, 3.6),
        ],
        "step": 1,
        "rates": "NOAA tide gauge 8638610 (4.84 mm/yr relative, 1927 to 2025); Buzzanga et al., 2020, GRL (Sentinel-1 sinking, Norfolk 4.4 and Hampton Roads 3.6 mm/yr)",
        "compare": "Hampton Roads has some of the fastest relative sea-level rise on the US East Coast; about half or more of it comes from the land sinking (Buzzanga et al., 2020).",
    },
}


def tile_name(la, lo):
    ns = f"N{la:02d}" if la >= 0 else f"S{-la:02d}"
    ew = f"E{lo:03d}" if lo >= 0 else f"W{-lo:03d}"
    return f"Copernicus_DSM_COG_30_{ns}_00_{ew}_00_DEM.tif"


def mosaic(folder, s, w, n, e):
    lat_n = list(range(int(math.floor(s)), int(math.ceil(n))))
    lon_n = list(range(int(math.floor(w)), int(math.ceil(e))))
    rows = []
    for la in reversed(lat_n):                     # north at the top
        row = []
        for lo in lon_n:
            a = tifffile.imread(Path(folder) / tile_name(la, lo)).astype(np.float32)
            assert a.shape == (TILE, TILE), (tile_name(la, lo), a.shape)
            row.append(a)
        rows.append(np.hstack(row))
    m = np.vstack(rows)
    north, west = max(lat_n) + 1, min(lon_n)
    r0, r1 = int(round((north - n) * TILE)), int(round((north - s) * TILE))
    c0, c1 = int(round((w - west) * TILE)), int(round((e - west) * TILE))
    return m[r0:r1, c0:c1]


def sinking_field(points, h, w, s, wst, n, e):
    lats = n - (np.arange(h) + 0.5) / h * (n - s)
    lons = wst + (np.arange(w) + 0.5) / w * (e - wst)
    LA, LO = np.meshgrid(lats, lons, indexing="ij")
    num = np.zeros_like(LA)
    den = np.zeros_like(LA)
    for _, plat, plon, rate in points:
        d2 = ((LA - plat) * 110.6) ** 2 + ((LO - plon) * 111.3 * math.cos(math.radians(plat))) ** 2 + 1.0
        wgt = 1.0 / d2
        num += wgt * rate
        den += wgt
    return (num / den).astype(np.float32), lats


def flood_years(sea, years_to_sea):
    """Priority flood from the open sea: earliest year water can reach each pixel."""
    h, w = sea.shape
    out = np.zeros((h, w), dtype=np.uint8)
    done = np.zeros((h, w), dtype=bool)
    heap = []
    horizon = END - NOW
    for r, c in zip(*np.nonzero(sea)):
        done[r, c] = True
        out[r, c] = 255
        heap.append((0.0, int(r), int(c)))
    heapq.heapify(heap)
    while heap:
        t, r, c = heapq.heappop(heap)
        if t > horizon:
            break
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < h and 0 <= cc < w and not done[rr, cc]:
                done[rr, cc] = True
                tt = max(t, float(years_to_sea[rr, cc]))
                if tt <= horizon:
                    out[rr, cc] = 1 + int(math.ceil(tt)) if tt > 0 else 1
                    heapq.heappush(heap, (tt, rr, cc))
    return out


def to_mercator_rows(img, s, n):
    """Resample rows so the picture lines up on Leaflet's Web Mercator map."""
    merc = lambda lat: math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    h = img.shape[0]
    m1, m0 = merc(n), merc(s)
    rows = []
    for i in range(h):
        m = m1 - (i + 0.5) / h * (m1 - m0)
        lat = math.degrees(2 * math.atan(math.exp(m)) - math.pi / 2)
        rows.append(img[int(min(h - 1, max(0, math.floor((n - lat) / (n - s) * h))))])
    return np.stack(rows)


def main():
    site, folder = sys.argv[1], sys.argv[2]
    out_dir = Path(sys.argv[3] if len(sys.argv) > 3 else "data/sea")
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = SITES[site]
    s, w, n, e = cfg["bounds"]
    step = cfg["step"]

    dem = mosaic(folder, s, w, n, e)
    hh, ww = dem.shape[0] // step * step, dem.shape[1] // step * step
    dem = dem[:hh, :ww]
    # The open sea: the model sets the sea surface to exactly 0 m. Keep the parts that reach the edge of the
    # map (lagoons and farmland below 0 m are land or inland water, and stay out of it).
    labels, _ = ndimage.label(dem == 0.0)
    edge = (set(np.unique(labels[0, :])) | set(np.unique(labels[-1, :])) | set(np.unique(labels[:, 0])) | set(np.unique(labels[:, -1]))) - {0}
    sea_full = np.isin(labels, list(edge))
    pool = lambda a: a.reshape(hh // step, step, ww // step, step).mean(axis=(1, 3))
    sea = pool(sea_full.astype(np.float32)) >= 0.5
    dem = pool(dem)
    h, w_px = dem.shape

    sink, lats = sinking_field(cfg["sinking"], h, w_px, s, w, n, e)
    above = np.maximum(dem, 0.0) * 1000.0        # mm above sea level today
    with_sink = flood_years(sea, above / (cfg["seaMmYr"] + sink))
    sea_only = flood_years(sea, above / cfg["seaMmYr"])

    px_km2 = ((n - s) / h * 110.57) * ((e - w) / w_px * 111.32 * np.cos(np.radians(lats)))[:, None]
    px_km2 = np.broadcast_to(px_km2, (h, w_px))

    def series(a):
        return [round(float(px_km2[(a >= 2) & (a <= y - 2025)].sum()), 1) for y in range(NOW, END + 1)]

    stats = {
        "site": site,
        "years": [NOW, END],
        "bounds": [[s, w], [n, e]],
        "newLandKm2": {"withSinking": series(with_sink), "seaOnly": series(sea_only)},
        "lowTodayKm2": round(float(px_km2[with_sink == 1].sum()), 1),
        "seaMmYr": cfg["seaMmYr"],
        "sinking": [{"name": nm, "lat": la, "lon": lo, "mmYr": r} for nm, la, lo, r in cfg["sinking"]],
        "maxSinkingMmYr": max(r for *_, r in cfg["sinking"]),
        "pixelM": round((n - s) / h * 110570),
        "compare": cfg["compare"],
        "sources": {
            "elevation": "Copernicus DEM GLO-90, © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA",
            "rates": cfg["rates"],
        },
    }

    rgb = np.zeros((h, w_px, 3), dtype=np.uint8)
    rgb[..., 0] = with_sink
    rgb[..., 1] = sea_only
    Image.fromarray(to_mercator_rows(rgb, s, n), "RGB").save(out_dir / f"{site}-sea.png", optimize=True)
    (out_dir / f"{site}-sea.json").write_text(json.dumps(stats, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    a, b = stats["newLandKm2"]["withSinking"], stats["newLandKm2"]["seaOnly"]
    print(f"{site}: grid {w_px} x {h}, about {stats['pixelM']} m per pixel; open sea {sea.mean():.0%} of the area")
    print(f"low today (at or below sea level, not sea): {stats['lowTodayKm2']} km2")
    for y in (2050, 2075, 2100):
        i = y - NOW
        print(f"{y}: new land under the sea {a[i]:>8.1f} km2 with sinking, {b[i]:>8.1f} km2 sea rise only")


if __name__ == "__main__":
    main()
