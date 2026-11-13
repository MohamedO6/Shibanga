#!/usr/bin/env python3
"""
gcov_season.py: the Nile Delta's farming season in numbers, from NISAR GCOV (HH and HV backscatter).

    python pipeline/gcov_season.py              # needs an Earthdata Login (~/.netrc or _netrc)

Streams a 20 km x 20 km window over the rice and cotton belt near Kafr El Sheikh from every NISAR GCOV image of
one track (only the chunks inside the window are fetched, about 50 MB per date instead of ~5 GB), then for each
date computes:

  * HH and HV median backscatter (gamma0, dB) over valid pixels,
  * a simple dual-pol radar vegetation index, RVI = 4 * HV / (HH + HV) (higher = more vegetation volume),
  * the area of very dark, smooth surfaces (HH < -18 dB and HV < -24 dB), which at L-band is mostly open water
    and freshly flooded fields,

and saves a small colour composite (R = HH, G = HV, B = HH/HV, the same colours as Undula's crops-and-water view).
Outputs: data/nisar/nile-delta/gcov-season.json and data/nisar/nile-delta/gcov-season/<date>.png.

These are Undula's own estimates from provisional NISAR products: thresholds are simple and nothing here is a
validated crop or flood classification.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data/nisar/nile-delta"
SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"
CENTER = (31.10, 30.95)          # lat, lon: rice and cotton belt near Kafr El Sheikh
HALF_KM = 10.0
STACK = sys.argv[1] if len(sys.argv) > 1 else None   # e.g. 129_A_017 (default: the track with most dates)
BLOCK = 5                        # 10 m pixels averaged 5 x 5 -> 50 m
WATER_HH, WATER_HV = -18.0, -24.0
BASE = "/science/LSAR/GCOV/grids/frequencyA"


def utm(lat, lon, epsg):
    from pyproj import Transformer
    return Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)


def block_mean(a, k):
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    a = a[:h, :w].reshape(h // k, k, w // k, k)
    return np.nanmean(a, axis=(1, 3))


def to_db(x):
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10 * np.log10(x)


def main():
    import earthaccess
    import h5py
    earthaccess.login(strategy="netrc")
    lat, lon = CENTER
    dlat, dlon = HALF_KM / 111.0, HALF_KM / (111.0 * np.cos(np.radians(lat)))
    res = earthaccess.search_data(short_name=SHORT_NAME, bounding_box=(lon - dlon, lat - dlat, lon + dlon, lat + dlat), count=200)
    groups = {}
    for g in res:
        p = g["umm"]["GranuleUR"].split("_")
        groups.setdefault(f"{p[5]}_{p[6]}_{p[7]}", []).append(g)
    stack = STACK or max(groups, key=lambda k: len(groups[k]))
    grans = sorted(groups[stack], key=lambda g: g["umm"]["GranuleUR"].split("_")[-6])
    print(f"stack {stack}: {len(grans)} GCOV dates", flush=True)
    (OUT_DIR / "gcov-season").mkdir(parents=True, exist_ok=True)
    rows = []
    for g in grans:
        ur = g["umm"]["GranuleUR"]
        date = ur.split("_")[-6][:8]
        date = f"{date[:4]}-{date[4:6]}-{date[6:]}"
        f = earthaccess.open([g])[0]
        with h5py.File(f, "r") as h:
            epsg = int(h[f"{BASE}/projection"][()])
            x = h[f"{BASE}/xCoordinates"][:]; y = h[f"{BASE}/yCoordinates"][:]
            cx, cy = utm(lat, lon, epsg)
            half = HALF_KM * 1000
            xi = np.where((x >= cx - half) & (x <= cx + half))[0]
            yi = np.where((y >= cy - half) & (y <= cy + half))[0]
            if len(xi) < 100 or len(yi) < 100:
                print(f"{date}: window not covered, skipped", flush=True); continue
            sl = (slice(yi[0], yi[-1] + 1), slice(xi[0], xi[-1] + 1))
            hh = h[f"{BASE}/HHHH"][sl].astype(np.float32)
            hv = h[f"{BASE}/HVHV"][sl].astype(np.float32)
            dx = float(abs(x[1] - x[0]))
        for a in (hh, hv):
            a[~np.isfinite(a) | (a <= 0)] = np.nan
        valid_frac = float(np.isfinite(hh).mean())
        if valid_frac < 0.6:
            print(f"{date}: only {valid_frac:.0%} valid, skipped", flush=True); continue
        HH, HV = block_mean(hh, BLOCK), block_mean(hv, BLOCK)
        hh_db, hv_db = to_db(HH), to_db(HV)
        ok = np.isfinite(hh_db) & np.isfinite(hv_db)
        rvi = 4 * HV / (HH + HV)
        dark = ok & (hh_db < WATER_HH) & (hv_db < WATER_HV)
        px_km2 = (dx * BLOCK / 1000) ** 2
        row = {
            "date": date,
            "hhDb": round(float(np.nanmedian(hh_db[ok])), 2),
            "hvDb": round(float(np.nanmedian(hv_db[ok])), 2),
            "rvi": round(float(np.nanmedian(rvi[ok])), 3),
            "darkKm2": round(float(dark.sum() * px_km2), 1),
            "validFrac": round(valid_frac, 3),
            "granule": ur,
        }
        rows.append(row)
        # colour composite like the app's crops-and-water view: R = HH, G = HV, B = HH (scaled in dB)
        r = np.clip((hh_db + 22) / 20, 0, 1); gch = np.clip((hv_db + 30) / 20, 0, 1)
        rgb = np.dstack([r, gch, r]); rgb[~ok] = 0
        Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT_DIR / "gcov-season" / f"{date}.png", optimize=True)
        print(f"{date}: HH {row['hhDb']} dB, HV {row['hvDb']} dB, RVI {row['rvi']}, dark {row['darkKm2']} km²", flush=True)
    out = {
        "schema": "undula.gcov-season/1",
        "product": SHORT_NAME,
        "stack": stack,
        "center": {"lat": lat, "lon": lon},
        "windowKm": 2 * HALF_KM,
        "pixelM": 10 * BLOCK,
        "thresholds": {"darkHHdb": WATER_HH, "darkHVdb": WATER_HV},
        "rvi": "4*HV/(HH+HV), linear gamma0",
        "note": "Undula's estimate from provisional NISAR GCOV. Simple thresholds; not a validated crop or flood classification.",
        "dates": rows,
    }
    (OUT_DIR / "gcov-season.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {len(rows)} dates", flush=True)


if __name__ == "__main__":
    main()
