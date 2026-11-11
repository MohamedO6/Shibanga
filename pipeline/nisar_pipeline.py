#!/usr/bin/env python3
"""
nisar_pipeline.py — put real NISAR L-band interferograms into the Fringe web explorer.

    python pipeline/nisar_pipeline.py search central-valley
    python pipeline/nisar_pipeline.py browse central-valley            # no login needed
    python pipeline/nisar_pipeline.py process central-valley           # needs an Earthdata Login
    python pipeline/nisar_pipeline.py process central-valley --local path/to/*.h5

Modes
  search   List NISAR GUNW (geocoded unwrapped interferogram) pairs over a site, grouped into
           12-day stacks (track_direction_frame).
  browse   Download the public JPL browse images of each pair in the best stack (no login),
           georeference them from the granule footprint, crop to the site and reproject to Web
           Mercator. This shows real NISAR wrapped interferograms, but only qualitatively.
  process  Read the HDF5 products (streamed over HTTPS, so only the cropped window is fetched;
           or local files): mask invalid / water / low-coherence pixels, keep the main connected
           component, subtract the ionospheric phase screen, convert unwrapped phase to
           line-of-sight motion, check it against Nevada Geodetic Lab GNSS stations, and chain
           consecutive 12-day pairs into a cumulative time series.

Outputs go to web/data/nisar/<site>/ and are listed in web/data/nisar/index.json, which the web
explorer reads.

Sign convention (NISAR ATBD JPL D-95677 §5.7–5.9): interferogram = reference × conj(secondary),
phase = (4π/λ)·Δr, so positive phase = range increase = motion away from the satellite. Fringe
reports LOS motion TOWARD the satellite as positive: los = −φ·λ/(4π). The GNSS comparison flags a
likely sign error if the two disagree in sign systematically.

Earthdata Login (process mode only) is read, never prompted for: set EARTHDATA_TOKEN, or
EARTHDATA_USERNAME + EARTHDATA_PASSWORD, or put urs.earthdata.nasa.gov in ~/.netrc (_netrc on
Windows).
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import io
import json
import math
import os
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WEB_ROOT = ROOT if (ROOT / "data/nisar/index.json").is_file() else ROOT / "web"
WEB_NISAR = WEB_ROOT / "data" / "nisar"
CACHE = HERE / "cache"
SITES_FILE = HERE / "sites.json"

SHORT_NAMES = {"GUNW": "NISAR_L2_GUNW_PROVISIONAL_V1"}
PROVISIONAL_START = "2026-06-17"
GUNW_BASE = "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
RADAR_GRID = "/science/LSAR/GUNW/metadata/radarGrid"
C_LIGHT = 299_792_458.0
DEFAULT_WAVELENGTH_M = 0.2384
LOS_SIGN = -1.0  # los toward satellite = LOS_SIGN · φ · λ / 4π
NGL_HOLDINGS = "https://geodesy.unr.edu/NGLStationPages/DataHoldings.txt"
NGL_TENV3 = "https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/{st}.tenv3"
NGL_STEPS = "https://geodesy.unr.edu/NGLStationPages/steps.txt"
UA = {"User-Agent": "fringe-nisar-pipeline/1.0"}

# Fringe's fringe colour cycle (web/fringe.js FRINGE_STOPS) so measured and modeled rings match.
FRINGE_STOPS = [0xFF4D6D, 0xFFC24D, 0x7CFF6B, 0x4CC9FF, 0xB48CFF]


def log(msg: str) -> None:
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:  # legacy console code page
        print(msg.encode("ascii", "replace").decode(), flush=True)


# ---------------------------------------------------------------------------
# Sites and geometry helpers
# ---------------------------------------------------------------------------

@dataclass
class Site:
    id: str
    name: str
    event_id: str | None
    lat: float
    lon: float
    extent_km: float
    reference_station: str | None = None

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        """(west, south, east, north), identical to the web explorer's scene bounds."""
        dlat = self.extent_km / 2 / 110.574
        dlon = self.extent_km / 2 / (111.32 * math.cos(math.radians(self.lat)))
        return (self.lon - dlon, self.lat - dlat, self.lon + dlon, self.lat + dlat)


def load_sites() -> dict[str, Site]:
    raw = json.loads(SITES_FILE.read_text(encoding="utf-8"))
    out = {}
    for sid, s in raw.items():
        if sid.startswith("_"):
            continue
        out[sid] = Site(sid, s["name"], s.get("eventId"), s["center"][0], s["center"][1], s["extentKm"], s.get("referenceStation"))
    return out


def merc_y(lat_deg):
    return np.log(np.tan(np.pi / 4 + np.radians(lat_deg) / 2))


def inv_merc_y(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def display_grid(site: Site, width: int):
    """Regular Web-Mercator grid over the site bbox: returns lon (W,), lat (H,) of pixel centres.
    An image on this grid drops straight into a Leaflet imageOverlay with the bbox as bounds."""
    w, s, e, n = site.bbox
    y0, y1 = merc_y(n), merc_y(s)
    height = max(2, int(round(width * (y0 - y1) / math.radians(e - w))))
    lon = w + (np.arange(width) + 0.5) / width * (e - w)
    lat = inv_merc_y(y0 + (np.arange(height) + 0.5) / height * (y1 - y0))
    return lon, lat


def point_in_polygon(lat: float, lon: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        (yi, xi), (yj, xj) = poly[i], poly[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def coverage(site: Site, poly) -> float:
    w, s, e, n = site.bbox
    pts = [(s + (n - s) * (j + 0.5) / 12, w + (e - w) * (i + 0.5) / 12) for j in range(12) for i in range(12)]
    return sum(point_in_polygon(la, lo, poly) for la, lo in pts) / len(pts)


# ---------------------------------------------------------------------------
# Searching NISAR granules (public CMR search, no login)
# ---------------------------------------------------------------------------

@dataclass
class Granule:
    name: str
    reference: dt.date
    secondary: dt.date
    stack: str
    direction: str
    track: int
    frame: int
    polygon: list
    h5_url: str | None
    browse_url: str | None
    size_mb: float
    full_frame: bool
    result: object = field(repr=False, default=None)

    @property
    def days(self) -> int:
        return (self.secondary - self.reference).days

    @property
    def pair_id(self) -> str:
        return f"{self.reference:%Y%m%d}_{self.secondary:%Y%m%d}"


def _attr(umm, name):
    for a in umm.get("AdditionalAttributes", []):
        if a.get("Name") == name and a.get("Values"):
            return a["Values"][0]
    return None


def granule_from_result(r) -> Granule:
    u = r["umm"]
    pts = u["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]["GPolygons"][0]["Boundary"]["Points"]
    poly = [(p["Latitude"], p["Longitude"]) for p in pts]
    if len(poly) > 1 and poly[0] == poly[-1]:
        poly = poly[:-1]
    urls = [x.get("URL", "") for x in u.get("RelatedUrls", [])]
    h5 = next((x for x in urls if x.startswith("https") and x.endswith(".h5")), None)
    browse = next((x for x in urls if x.startswith("https") and x.endswith("_LATLON.png")), None)
    ref = dt.date.fromisoformat(_attr(u, "REFERENCE_ZERO_DOPPLER_START_TIME")[:10])
    sec = dt.date.fromisoformat(_attr(u, "SECONDARY_ZERO_DOPPLER_START_TIME")[:10])
    return Granule(
        name=u["GranuleUR"], reference=ref, secondary=sec,
        stack=_attr(u, "STACK_ID") or "unknown",
        direction=(_attr(u, "ASCENDING_DESCENDING") or "?")[:1],
        track=int(_attr(u, "TRACK_NUMBER") or 0), frame=int(_attr(u, "FRAME_NUMBER") or 0),
        polygon=poly, h5_url=h5, browse_url=browse,
        size_mb=float(getattr(r, "size", 0.0) if not callable(getattr(r, "size", None)) else r.size()),
        full_frame=(_attr(u, "FULL_FRAME") or "").upper() == "TRUE", result=r,
    )


def search(site: Site, start: str, end: str) -> list[Granule]:
    import earthaccess  # imported lazily so `--help` works without it

    w, s, e, n = site.bbox
    results = earthaccess.search_data(short_name=SHORT_NAMES["GUNW"], bounding_box=(w, s, e, n), temporal=(start, end), count=2000)
    grans = [granule_from_result(r) for r in results]
    # Keep pairs whose footprint actually contains the site centre.
    grans = [g for g in grans if point_in_polygon(site.lat, site.lon, g.polygon)]
    grans.sort(key=lambda g: (g.stack, g.reference, g.secondary))
    return grans


def group_stacks(site: Site, grans: list[Granule]) -> list[dict]:
    stacks: dict[str, list[Granule]] = {}
    for g in grans:
        stacks.setdefault(g.stack, []).append(g)
    out = []
    for sid, gs in stacks.items():
        cov = float(np.mean([coverage(site, g.polygon) for g in gs]))
        gaps = sum(1 for a, b in zip(gs, gs[1:]) if a.secondary != b.reference)
        out.append({"stack": sid, "granules": gs, "coverage": cov, "gaps": gaps})
    out.sort(key=lambda s: (-(s["coverage"] >= 0.6), -len(s["granules"]), -s["coverage"]))
    return out


def pick_stack(site: Site, grans: list[Granule], wanted: str | None) -> dict:
    stacks = group_stacks(site, grans)
    if not stacks:
        raise SystemExit(f"No NISAR GUNW pairs cover {site.id} in that window.")
    if wanted:
        for s in stacks:
            if s["stack"] == wanted:
                return s
        raise SystemExit(f"Stack {wanted} not found. Available: {', '.join(s['stack'] for s in stacks)}")
    return stacks[0]


def print_search(site: Site, grans: list[Granule]) -> None:
    stacks = group_stacks(site, grans)
    log(f"{site.name}: {len(grans)} GUNW pairs over the site centre, {len(stacks)} stacks")
    for s in stacks:
        gs = s["granules"]
        log(f"\n  stack {s['stack']}  ({'ascending' if gs[0].direction == 'A' else 'descending'}, track {gs[0].track}, frame {gs[0].frame})"
            f"  covers {s['coverage']:.0%} of the scene  ·  {len(gs)} pairs  ·  chain gaps {s['gaps']}")
        for g in gs:
            log(f"    {g.reference} → {g.secondary}  ({g.days:>2} d)  {g.size_mb:7.0f} MB  {g.name}")


# ---------------------------------------------------------------------------
# Index file shared with the web explorer
# ---------------------------------------------------------------------------

def load_index() -> dict:
    path = WEB_NISAR / "index.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"schema": "fringe.nisar/1", "sites": {}}


def save_index(index: dict) -> None:
    WEB_NISAR.mkdir(parents=True, exist_ok=True)
    index["generatedAt"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (WEB_NISAR / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")


def site_entry(index: dict, site: Site) -> dict:
    w, s, e, n = site.bbox
    entry = index["sites"].setdefault(site.id, {})
    entry.update({"name": site.name, "eventId": site.event_id, "bounds": [[round(s, 5), round(w, 5)], [round(n, 5), round(e, 5)]]})
    entry.setdefault("stacks", {})
    return entry


def stack_entry(site_e: dict, g: Granule) -> dict:
    st = site_e["stacks"].setdefault(g.stack, {})
    st.update({"direction": g.direction, "track": g.track, "frame": g.frame})
    return st


def upsert(items: list, item: dict, key: str = "id") -> None:
    for i, old in enumerate(items):
        if old.get(key) == item[key]:
            items[i] = item
            return
    items.append(item)
    items.sort(key=lambda x: x.get("reference") or x.get("date") or "")


# ---------------------------------------------------------------------------
# Browse mode: public JPL browse PNGs → georeferenced, cropped, Web Mercator
# ---------------------------------------------------------------------------

def http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def cached(path: Path, url: str, max_age_s: float | None = None) -> bytes:
    if path.exists() and (max_age_s is None or time.time() - path.stat().st_mtime < max_age_s):
        return path.read_bytes()
    data = http_get(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def georeference_browse(rgba: np.ndarray, polygon) -> dict:
    """The _LATLON browse is a plate-carrée plot of the frame footprint. Its four outermost opaque
    pixels are the footprint corners, so a separable linear fit x = a·lon + b, y = c·lat + d
    maps geography to pixels. Returns the fit and its RMS residual (pixels)."""
    alpha = rgba[:, :, 3] > 0
    ys, xs = np.nonzero(alpha)
    if xs.size < 100:
        raise ValueError("browse image is empty")

    def extreme(sel):
        return float(xs[sel].mean()), float(ys[sel].mean())

    img = {
        "N": extreme(ys <= ys.min() + 1), "S": extreme(ys >= ys.max() - 1),
        "W": extreme(xs <= xs.min() + 1), "E": extreme(xs >= xs.max() - 1),
    }
    lats = np.array([p[0] for p in polygon])
    lons = np.array([p[1] for p in polygon])
    geo = {"N": polygon[int(lats.argmax())], "S": polygon[int(lats.argmin())],
           "W": polygon[int(lons.argmin())], "E": polygon[int(lons.argmax())]}
    keys = ["N", "S", "W", "E"]
    lon_v = np.array([geo[k][1] for k in keys])
    lat_v = np.array([geo[k][0] for k in keys])
    x_v = np.array([img[k][0] for k in keys])
    y_v = np.array([img[k][1] for k in keys])
    a, b = np.polyfit(lon_v, x_v, 1)
    c, d = np.polyfit(lat_v, y_v, 1)
    resid = np.concatenate([a * lon_v + b - x_v, c * lat_v + d - y_v])
    rms = float(np.sqrt(np.mean(resid ** 2)))
    aspect = a / -c if c else float("nan")
    expected = math.cos(math.radians(float(lat_v.mean())))
    return {"a": a, "b": b, "c": c, "d": d, "rmsPx": rms, "aspect": aspect, "expectedAspect": expected}


def resample_browse(rgba: np.ndarray, fit: dict, site: Site, width: int) -> np.ndarray:
    lon, lat = display_grid(site, width)
    sx = np.rint(fit["a"] * lon + fit["b"]).astype(int)
    sy = np.rint(fit["c"] * lat + fit["d"]).astype(int)
    h, w = rgba.shape[:2]
    out = np.zeros((lat.size, lon.size, 4), dtype=np.uint8)
    okx = (sx >= 0) & (sx < w)
    oky = (sy >= 0) & (sy < h)
    rows = np.where(oky)[0]
    cols = np.where(okx)[0]
    if rows.size and cols.size:
        out[np.ix_(rows, cols)] = rgba[np.ix_(sy[rows], sx[cols])]
    return out


_TWILIGHT_CUBE = None


def twilight_cube():
    """64³ RGB cube → (index into a 512-step matplotlib 'twilight' cycle, colour distance).
    JPL renders the GUNW browse as wrapped phase in 'twilight', so this inverts colour → phase."""
    global _TWILIGHT_CUBE
    if _TWILIGHT_CUBE is None:
        cache = CACHE / "twilight_cube.npz"
        if cache.exists():
            z = np.load(cache)
            _TWILIGHT_CUBE = (z["idx"], z["dist"])
        else:
            import matplotlib  # only needed once, to build the lookup cube

            lut = matplotlib.colormaps["twilight"](np.linspace(0, 1, 512, endpoint=False))[:, :3] * 255
            centres = (np.arange(64) * 4 + 1.5)
            grid = np.stack(np.meshgrid(centres, centres, centres, indexing="ij"), -1).reshape(-1, 3)
            idx = np.empty(len(grid), dtype=np.uint16)
            dist = np.empty(len(grid), dtype=np.float32)
            for s in range(0, len(grid), 8192):
                d = ((grid[s:s + 8192, None, :] - lut[None, :, :]) ** 2).sum(-1)
                idx[s:s + 8192] = d.argmin(1)
                dist[s:s + 8192] = np.sqrt(d.min(1))
            _TWILIGHT_CUBE = (idx.reshape(64, 64, 64), dist.reshape(64, 64, 64))
            CACHE.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(cache, idx=_TWILIGHT_CUBE[0], dist=_TWILIGHT_CUBE[1])
    return _TWILIGHT_CUBE


def box_mean(a: np.ndarray, r: int) -> np.ndarray:
    """Mean over a (2r+1)² window, edges handled by clipping (summed-area table)."""
    p = np.pad(a, r, mode="edge")
    c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / (k * k)


def local_range(a: np.ndarray, r: int) -> np.ndarray:
    """Max minus min over each (2r+1)² neighbourhood (edges padded)."""
    win = np.lib.stride_tricks.sliding_window_view(np.pad(a, r, mode="edge"), (2 * r + 1, 2 * r + 1))
    return win.max(axis=(2, 3)) - win.min(axis=(2, 3))


def browse_to_phase(rgba: np.ndarray):
    """Recover wrapped phase (cycles, 0–1) and a 0–1 confidence from a twilight-coloured browse crop.
    Confidence combines colour fit, footprint and local phase consistency (a coherence proxy),
    so decorrelated water and noise fade out instead of flickering."""
    idx_cube, dist_cube = twilight_cube()
    q = (rgba[..., :3] >> 2).astype(np.intp)
    idx = idx_cube[q[..., 0], q[..., 1], q[..., 2]]
    dist = dist_cube[q[..., 0], q[..., 1], q[..., 2]]
    phase = idx / 512.0
    valid = (rgba[..., 3] > 200) & (dist < 9)
    # Some browse images paint masked water as one flat colour. Real phase always carries some
    # texture, so a 9×9 patch of a single colour is fill, not signal.
    valid &= local_range(idx, 4) > 0
    ang = 2 * np.pi * phase
    w = valid.astype(float)
    cs = box_mean(np.cos(ang) * w, 2)
    sn = box_mean(np.sin(ang) * w, 2)
    n = box_mean(w, 2)
    r = np.where(n > 0.3, np.hypot(cs, sn) / np.maximum(n, 1e-6), 0)
    conf = np.clip((r - 0.45) / 0.35, 0, 1) * valid
    # Gentle 3×3 complex smoothing: removes browse speckle, keeps the fringe pattern.
    phase = np.where(valid, np.mod(np.arctan2(box_mean(np.sin(ang) * w, 1), box_mean(np.cos(ang) * w, 1)) / (2 * np.pi), 1.0), phase)
    ang = 2 * np.pi * phase
    # Reference each pair to its own circular mean so a colormap offset or bulk atmosphere
    # does not flash the whole scene when pairs are summed.
    if conf.sum() > 0:
        mean_ang = math.atan2(float((np.sin(ang) * conf).sum()), float((np.cos(ang) * conf).sum()))
        phase = np.mod(phase - mean_ang / (2 * np.pi), 1.0)
    return phase, conf


def save_phase_frame(phase: np.ndarray, conf: np.ndarray, path: Path) -> None:
    """Opaque RGB PNG: R = wrapped phase (256 steps per cycle), G = confidence (0–255), B = 0.
    Kept opaque on purpose: browsers premultiply alpha and would corrupt phase stored beside it."""
    r8 = (np.rint(phase * 256).astype(np.int64) % 256).astype(np.uint8)
    g8 = np.clip(np.rint(conf * 255), 0, 255).astype(np.uint8)
    Image.fromarray(np.dstack([r8, g8, np.zeros_like(r8)]), mode="RGB").save(path, optimize=True)


def run_browse(site: Site, args) -> None:
    grans = search(site, args.start, args.end)
    stack = pick_stack(site, grans, args.stack)
    gs = stack["granules"][-args.max:] if args.max else stack["granules"]
    log(f"{site.id}: stack {stack['stack']} — {len(gs)} pairs from public JPL browse images (no login)")
    index = load_index()
    se = site_entry(index, site)
    st = stack_entry(se, gs[0])
    st["browse"] = []  # regenerate the whole stack so every frame shares one grid
    out_dir = WEB_NISAR / site.id
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob(f"{gs[0].stack}_*_browse*.png"):
        old.unlink()
    width = None
    w0, _, e0, _ = site.bbox
    loaded = []
    for g in gs:
        if not g.browse_url:
            log(f"  {g.pair_id}: no browse image listed, skipped")
            continue
        raw = cached(CACHE / site.id / "browse" / f"{g.name}.png", g.browse_url)
        rgba = np.array(Image.open(io.BytesIO(raw)).convert("RGBA"))
        fit = georeference_browse(rgba, g.polygon)
        fit["ok"] = fit["rmsPx"] <= args.max_fit_px and abs(fit["aspect"] - fit["expectedAspect"]) <= 0.06
        loaded.append((g, rgba, fit))
    # Every pair of one track/frame is geocoded onto the same fixed grid, so its browse images share
    # one pixel geometry. When a footprint outline trips the corner fit (often a coast, where the
    # outline runs out over masked sea), borrow the median of the clean fits from the same frame.
    good = {}
    for _, rgba, fit in loaded:
        if fit["ok"]:
            good.setdefault(rgba.shape[:2], []).append(fit)
    for g, rgba, fit in loaded:
        if not fit["ok"]:
            siblings = good.get(rgba.shape[:2], [])
            if len(siblings) < 2:
                log(f"  {g.pair_id}: georeference fit rejected (rms {fit['rmsPx']:.1f}px, aspect {fit['aspect']:.3f} vs {fit['expectedAspect']:.3f})")
                continue
            fit = {k: float(np.median([s[k] for s in siblings])) for k in ("a", "b", "c", "d")}
            fit["rmsPx"] = float("nan")
            log(f"  {g.pair_id}: own corner fit failed, using the median fit of {len(siblings)} frames on the same grid")
        if width is None:
            native = fit["a"] * (e0 - w0)  # browse pixels across the scene
            width = int(np.clip(round(native * 1.25), 120, args.width))
        img = resample_browse(rgba, fit, site, width)
        if (img[:, :, 3] > 0).mean() < 0.05:
            log(f"  {g.pair_id}: footprint misses the scene, skipped")
            continue
        phase, conf = browse_to_phase(img)
        rel = f"{site.id}/{g.stack}_{g.pair_id}_browse_phase.png"
        save_phase_frame(phase, conf, WEB_NISAR / rel)
        upsert(st["browse"], {
            "id": g.pair_id, "reference": g.reference.isoformat(), "secondary": g.secondary.isoformat(), "days": g.days,
            "phase": f"nisar/{rel}", "width": int(img.shape[1]), "height": int(img.shape[0]),
            "granule": g.name, "fitRmsPx": None if math.isnan(fit["rmsPx"]) else round(fit["rmsPx"], 2),
            **({"fitFrom": "frame median"} if math.isnan(fit["rmsPx"]) else {}),
            "coverage": round(float((conf > 0.2).mean()), 3),
        })
        how = "shared frame fit" if math.isnan(fit["rmsPx"]) else f"fit rms {fit['rmsPx']:.1f}px"
        log(f"  {g.reference} → {g.secondary}: phase frame {img.shape[1]}×{img.shape[0]} ({how}, {(conf > 0.2).mean():.0%} coherent)")
    save_index(index)
    log(f"index updated: {WEB_NISAR / 'index.json'}")


# ---------------------------------------------------------------------------
# Process mode: HDF5 → masked, ionosphere-corrected LOS displacement
# ---------------------------------------------------------------------------

def _decode(v):
    """HDF5 strings arrive as bytes, numpy bytes, or object arrays of bytes; normalise to str / list[str]."""
    if isinstance(v, (bytes, np.bytes_)):
        return bytes(v).decode()
    if isinstance(v, np.ndarray):
        if v.shape == ():
            return _decode(v[()])
        return [_decode(x) for x in v.ravel()]
    return v


NAME_DATES = re.compile(r"_[A-Z]{2}_(\d{8})T\d{6}_\d{8}T\d{6}_(\d{8})T\d{6}_")


def _date_from(value, label: str, which: int) -> dt.date:
    """Acquisition date from the identification metadata, falling back to the granule name."""
    if value:
        return dt.date.fromisoformat(str(value)[:10])
    m = NAME_DATES.search(label)
    if not m:
        raise ValueError("acquisition dates not found in metadata or file name")
    return dt.datetime.strptime(m.group(which), "%Y%m%d").date()


def _get(h5, *paths):
    for p in paths:
        if p in h5:
            return h5[p]
    return None


def read_epsg(proj_ds) -> int:
    for key in ("epsg_code", "epsg"):
        if key in proj_ds.attrs:
            return int(np.asarray(proj_ds.attrs[key]).ravel()[0])
    return int(np.asarray(proj_ds[()]).ravel()[0])


@dataclass
class PairResult:
    los: np.ndarray            # LOS toward satellite (m), NaN where invalid, native grid crop
    x: np.ndarray              # crop x coordinates (m, product CRS)
    y: np.ndarray              # crop y coordinates
    epsg: int
    wavelength: float
    polarization: str
    reference: dt.date
    secondary: dt.date
    direction: str
    valid_fraction: float
    component_fraction: float
    iono_corrected: bool
    los_vectors: dict | None   # {"x","y","h","lx","ly"} radar-grid cubes (product CRS)
    notes: list


def extract_pair(h5, site: Site, min_coherence: float = 0.35, use_iono: bool = True, keep_all_components: bool = False, label: str = "") -> PairResult:
    from pyproj import Transformer

    notes = []
    pols = _get(h5, "/science/LSAR/GUNW/grids/frequencyA/listOfPolarizations")
    pol_list = _decode(pols[()]) if pols is not None else []
    if isinstance(pol_list, str):
        pol_list = [pol_list]
    pol = next((p for p in (pol_list or []) + ["HH", "VV"] if f"{GUNW_BASE}/{p}/unwrappedPhase" in h5), None)
    if pol is None:
        raise ValueError("no unwrappedPhase layer in this product")
    g = f"{GUNW_BASE}/{pol}"

    x_ds = _get(h5, f"{g}/xCoordinates", f"{GUNW_BASE}/xCoordinates")
    y_ds = _get(h5, f"{g}/yCoordinates", f"{GUNW_BASE}/yCoordinates")
    proj = _get(h5, f"{g}/projection", f"{GUNW_BASE}/projection")
    if x_ds is None or y_ds is None or proj is None:
        raise ValueError("coordinates/projection not found")
    x, y = x_ds[()], y_ds[()]
    epsg = read_epsg(proj)

    to_prod = Transformer.from_crs(4326, epsg, always_xy=True)
    w, s, e, n = site.bbox
    edge = np.linspace(0, 1, 25)
    lons = np.concatenate([w + (e - w) * edge, np.full(25, e), w + (e - w) * edge, np.full(25, w)])
    lats = np.concatenate([np.full(25, s), s + (n - s) * edge, np.full(25, n), s + (n - s) * edge])
    px, py = to_prod.transform(lons, lats)
    cols = np.where((x >= px.min()) & (x <= px.max()))[0]
    rows = np.where((y >= py.min()) & (y <= py.max()))[0]
    if cols.size < 4 or rows.size < 4:
        raise ValueError("product does not cover the site")
    r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1

    phase = h5[f"{g}/unwrappedPhase"][r0:r1, c0:c1].astype(np.float64)
    valid = np.isfinite(phase)
    coh_ds = _get(h5, f"{g}/coherenceMagnitude")
    if coh_ds is not None:
        coh = coh_ds[r0:r1, c0:c1]
        valid &= np.isfinite(coh) & (coh >= min_coherence)
    cc_ds = _get(h5, f"{g}/connectedComponents")
    cc = cc_ds[r0:r1, c0:c1] if cc_ds is not None else None
    if cc is not None:
        valid &= (cc != 0) & (cc != 65535)
    mask_ds = _get(h5, f"{GUNW_BASE}/mask", f"{g}/mask")
    if mask_ds is not None and mask_ds.shape == h5[f"{g}/unwrappedPhase"].shape:
        m = mask_ds[r0:r1, c0:c1].astype(np.int32)
        valid &= (m != 255) & ((m // 10) % 10 > 0) & (m % 10 > 0) & (m // 100 != 1)
    elif mask_ds is None:
        notes.append("no valid-data/water mask in product")

    comp_frac = 1.0
    if cc is not None and not keep_all_components and valid.any():
        labels, counts = np.unique(cc[valid], return_counts=True)
        best = labels[counts.argmax()]
        comp_frac = float(counts.max() / counts.sum())
        valid &= cc == best

    iono = False
    iono_ds = _get(h5, f"{g}/ionospherePhaseScreen")
    if use_iono and iono_ds is not None:
        ip = iono_ds[r0:r1, c0:c1].astype(np.float64)
        valid &= np.isfinite(ip)
        phase = phase - np.where(np.isfinite(ip), ip, 0.0)
        iono = True
    elif use_iono:
        notes.append("ionospheric phase screen not in product; not corrected")

    freq_ds = _get(h5, "/science/LSAR/GUNW/grids/frequencyA/centerFrequency")
    wavelength = C_LIGHT / float(np.asarray(freq_ds[()]).ravel()[0]) if freq_ds is not None else DEFAULT_WAVELENGTH_M
    los = LOS_SIGN * phase * wavelength / (4 * math.pi)
    los[~valid] = np.nan

    def ident(name, default=None):
        ds = _get(h5, f"/science/LSAR/identification/{name}")
        return _decode(ds[()]) if ds is not None else default

    ref = ident("referenceZeroDopplerStartTime")
    sec = ident("secondaryZeroDopplerStartTime")
    direction = (ident("orbitPassDirection", "?") or "?")[:1].upper()

    vec = None
    rg = {k: _get(h5, f"{RADAR_GRID}/{k}") for k in ("xCoordinates", "yCoordinates", "heightAboveEllipsoid", "losUnitVectorX", "losUnitVectorY")}
    if all(v is not None for v in rg.values()):
        vec = {"x": rg["xCoordinates"][()], "y": rg["yCoordinates"][()], "h": rg["heightAboveEllipsoid"][()],
               "lx": rg["losUnitVectorX"][()], "ly": rg["losUnitVectorY"][()]}
    else:
        notes.append("no LOS unit-vector cubes; GNSS projection uses nominal 37° geometry")

    return PairResult(
        los=los, x=x[c0:c1], y=y[r0:r1], epsg=epsg, wavelength=wavelength, polarization=pol,
        reference=_date_from(ref, label, 1),
        secondary=_date_from(sec, label, 2),
        direction=direction, valid_fraction=float(valid.mean()), component_fraction=comp_frac,
        iono_corrected=iono, los_vectors=vec, notes=notes,
    )


def los_unit_at(pr: PairResult, lon: float, lat: float, height: float = 0.0) -> np.ndarray:
    """ENU unit vector from ground to satellite at a point."""
    from pyproj import Transformer

    if pr.los_vectors:
        v = pr.los_vectors
        px, py = Transformer.from_crs(4326, pr.epsg, always_xy=True).transform(lon, lat)
        i = int(np.abs(v["x"] - px).argmin())
        j = int(np.abs(v["y"] - py).argmin())
        k = int(np.abs(v["h"] - height).argmin())
        lx, ly = float(v["lx"][k, j, i]), float(v["ly"][k, j, i])
        return np.array([lx, ly, math.sqrt(max(0.0, 1 - lx * lx - ly * ly))])
    th = math.radians(37)
    az = math.radians(78 if pr.direction == "A" else 282)
    return np.array([math.sin(th) * math.sin(az), math.sin(th) * math.cos(az), math.cos(th)])


def sample_native(pr: PairResult, lon: float, lat: float, half: int = 2) -> float | None:
    """Median LOS (m) in a (2·half+1)² window of the native grid around a point."""
    from pyproj import Transformer

    px, py = Transformer.from_crs(4326, pr.epsg, always_xy=True).transform(lon, lat)
    i = int(np.abs(pr.x - px).argmin())
    j = int(np.abs(pr.y - py).argmin())
    if abs(pr.x[i] - px) > 2 * abs(pr.x[1] - pr.x[0]) or abs(pr.y[j] - py) > 2 * abs(pr.y[1] - pr.y[0]):
        return None
    win = pr.los[max(0, j - half): j + half + 1, max(0, i - half): i + half + 1]
    vals = win[np.isfinite(win)]
    return float(np.median(vals)) if vals.size >= 5 else None


def to_display(pr: PairResult, site: Site, width: int) -> np.ndarray:
    """Nearest-neighbour resample of the native crop onto the site's Web-Mercator grid."""
    from pyproj import Transformer

    lon, lat = display_grid(site, width)
    LON, LAT = np.meshgrid(lon, lat)
    px, py = Transformer.from_crs(4326, pr.epsg, always_xy=True).transform(LON, LAT)
    dx = pr.x[1] - pr.x[0]
    dy = pr.y[1] - pr.y[0]
    ci = np.rint((px - pr.x[0]) / dx).astype(int)
    ri = np.rint((py - pr.y[0]) / dy).astype(int)
    ok = (ci >= 0) & (ci < pr.x.size) & (ri >= 0) & (ri < pr.y.size)
    out = np.full(LON.shape, np.nan)
    out[ok] = pr.los[ri[ok], ci[ok]]
    return out


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def _lut() -> np.ndarray:
    stops = FRINGE_STOPS + [FRINGE_STOPS[0]]
    rgb = np.array([[(h >> 16) & 255, (h >> 8) & 255, h & 255] for h in stops], dtype=np.float64)
    t = np.arange(256) / 256 * (len(stops) - 1)
    k = np.minimum(t.astype(int), len(stops) - 2)
    f = (t - k)[:, None]
    return (rgb[k] + (rgb[k + 1] - rgb[k]) * f).astype(np.uint8)


LUT = _lut()


def render_wrapped(los: np.ndarray, wavelength: float) -> np.ndarray:
    """Re-wrap LOS motion into Fringe's colour cycle: one cycle = λ/2, like the modeled scenes."""
    ok = np.isfinite(los)
    cycles = np.where(ok, los, 0) / (wavelength / 2)
    frac = cycles - np.floor(cycles)
    rgba = np.zeros(los.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = LUT[np.clip((frac * 256).astype(int), 0, 255)]
    rgba[..., 3] = np.where(ok, 235, 0)
    return rgba


DIVERGING = np.array([[33, 102, 172], [103, 169, 207], [247, 247, 247], [239, 138, 98], [178, 24, 43]], dtype=np.float64)


def render_los(los: np.ndarray, limit_m: float) -> np.ndarray:
    """Diverging map: blue = toward the satellite (uplift-like), red = away (sinking-like)."""
    ok = np.isfinite(los)
    t = np.clip((-np.where(ok, los, 0) / limit_m + 1) / 2, 0, 1) * (len(DIVERGING) - 1)
    k = np.minimum(t.astype(int), len(DIVERGING) - 2)
    f = (t - k)[..., None]
    rgba = np.zeros(los.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = (DIVERGING[k] + (DIVERGING[k + 1] - DIVERGING[k]) * f).astype(np.uint8)
    # Stable ground stays faint so the moving areas stand out on a dark basemap.
    strength = np.clip(np.abs(np.where(ok, los, 0)) / limit_m, 0, 1)
    rgba[..., 3] = np.where(ok, 70 + 170 * strength, 0).astype(np.uint8)
    return rgba


def color_limit(los: np.ndarray) -> float:
    v = np.abs(los[np.isfinite(los)])
    return max(float(np.percentile(v, 98)) if v.size else 0.0, 0.005)


def save_grid(los: np.ndarray, path: Path, step: int = 3) -> dict:
    """Coarse int16 grid (mm) for click-to-probe in the browser; −32768 = no data."""
    g = los[step // 2::step, step // 2::step]
    mm = np.where(np.isfinite(g), np.clip(np.rint(g * 1000), -32767, 32767), -32768).astype("<i2")
    path.write_bytes(mm.tobytes())
    return {"width": int(g.shape[1]), "height": int(g.shape[0]), "unit": "mm", "nodata": -32768}


# ---------------------------------------------------------------------------
# GNSS validation (Nevada Geodetic Lab)
# ---------------------------------------------------------------------------

def _mgb():
    path = HERE / "make-gnss-bundle.py"
    if not path.is_file():
        path = ROOT / "ios-fringe" / "Tools" / "make-gnss-bundle.py"
    spec = importlib.util.spec_from_file_location("make_gnss_bundle", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class GNSS:
    """Lazily fetches and caches NGL station lists, steps and daily solutions."""

    def __init__(self):
        self.mgb = _mgb()
        self._rows: dict[str, list] = {}
        self._steps: str | None = None
        self._holdings: list | None = None

    def holdings(self) -> list[dict]:
        if self._holdings is None:
            text = cached(CACHE / "ngl" / "DataHoldings.txt", NGL_HOLDINGS, max_age_s=7 * 86400).decode("latin-1")
            out = []
            for line in text.splitlines()[1:]:
                c = line.split()
                try:
                    lat, lon = float(c[1]), float(c[2])
                    out.append({"station": c[0], "lat": lat, "lon": lon - 360 if lon > 180 else lon, "height": float(c[3]),
                                "begin": dt.date.fromisoformat(c[7]), "end": dt.date.fromisoformat(c[8])})
                except (ValueError, IndexError):
                    continue
            self._holdings = out
        return self._holdings

    def stations_in(self, site: Site, start: dt.date, end: dt.date) -> list[dict]:
        w, s, e, n = site.bbox
        return [h for h in self.holdings() if w <= h["lon"] <= e and s <= h["lat"] <= n and h["begin"] <= start and h["end"] >= end]

    def rows(self, station: str) -> list:
        if station not in self._rows:
            text = cached(CACHE / "ngl" / f"{station}.tenv3", NGL_TENV3.format(st=station), max_age_s=86400).decode("latin-1")
            if self._steps is None:
                self._steps = cached(CACHE / "ngl" / "steps.txt", NGL_STEPS, max_age_s=7 * 86400).decode("latin-1")
            rows = self.mgb.parse_tenv3(text)
            steps = self.mgb.fetch_steps(station, self._steps)
            if rows:
                rows, _ = self.mgb.remove_steps(rows, steps, rows[0][0], rows[-1][0])
            self._rows[station] = rows
        return self._rows[station]

    def enu_change(self, station: str, d0: dt.date, d1: dt.date, window: int = 3) -> np.ndarray | None:
        rows = self.rows(station)
        a = [r[1:] for r in rows if abs((r[0] - d0).days) <= window]
        b = [r[1:] for r in rows if abs((r[0] - d1).days) <= window]
        if len(a) < 2 or len(b) < 2:
            return None
        return np.mean(b, axis=0) - np.mean(a, axis=0)


def compare_with_gnss(samples: list[dict], reference: str | None) -> dict:
    """samples: [{station, insar, gnss}] in metres (LOS toward satellite). Double-differences each
    station against a reference station, so the unknown InSAR reference level cancels out."""
    usable = [s for s in samples if s["insar"] is not None and s["gnss"] is not None]
    if len(usable) < 2:
        return {"stations": samples, "reference": None, "n": 0, "note": "fewer than two stations with both InSAR and GNSS"}
    ref = next((s for s in usable if s["station"] == reference), None) or usable[0]
    rows = []
    for s in usable:
        if s is ref:
            continue
        rows.append({**s, "insarDD": s["insar"] - ref["insar"], "gnssDD": s["gnss"] - ref["gnss"]})
    d_in = np.array([r["insarDD"] for r in rows])
    d_gn = np.array([r["gnssDD"] for r in rows])
    rms = float(np.sqrt(np.mean((d_in - d_gn) ** 2)))
    corr = float(np.corrcoef(d_in, d_gn)[0, 1]) if len(rows) >= 3 and d_in.std() > 0 and d_gn.std() > 0 else None
    note = None
    if corr is not None and corr < -0.5:
        note = "InSAR and GNSS are anti-correlated: check the LOS sign convention"
    to_cm = lambda v: None if v is None else round(v * 100, 2)  # noqa: E731
    return {
        "reference": ref["station"], "n": len(rows), "rmsCm": round(rms * 100, 2), "correlation": None if corr is None else round(corr, 3),
        "note": note,
        "stations": [{"station": r["station"], "lat": r["lat"], "lon": r["lon"], "insarCm": to_cm(r["insarDD"]), "gnssCm": to_cm(r["gnssDD"])} for r in rows],
    }


def gnss_check(pr: PairResult, site: Site, gnss: GNSS, d0: dt.date, d1: dt.date, sampler) -> dict:
    samples = []
    for h in gnss.stations_in(site, d0, d1):
        try:
            denu = gnss.enu_change(h["station"], d0, d1)
        except Exception as exc:  # network / parse issues should not stop the run
            log(f"    GNSS {h['station']}: {exc}")
            denu = None
        lu = los_unit_at(pr, h["lon"], h["lat"], h["height"])
        samples.append({"station": h["station"], "lat": h["lat"], "lon": h["lon"],
                        "gnss": None if denu is None else float(denu @ lu),
                        "insar": sampler(h["lon"], h["lat"])})
    return compare_with_gnss(samples, site.reference_station)


# ---------------------------------------------------------------------------
# Process command
# ---------------------------------------------------------------------------

def earthdata_login():
    import earthaccess

    if os.environ.get("EARTHDATA_TOKEN") or os.environ.get("EARTHDATA_USERNAME"):
        auth = earthaccess.login(strategy="environment")
    else:
        netrc = Path.home() / ("_netrc" if os.name == "nt" else ".netrc")
        if not (netrc.exists() and "urs.earthdata.nasa.gov" in netrc.read_text(errors="ignore")):
            raise SystemExit(
                "Earthdata Login needed to read NISAR HDF5 products.\n"
                "  Create a free account at https://urs.earthdata.nasa.gov, then either\n"
                "  - set EARTHDATA_TOKEN (generate one under 'Generate Token'), or\n"
                "  - set EARTHDATA_USERNAME and EARTHDATA_PASSWORD, or\n"
                f"  - add 'machine urs.earthdata.nasa.gov login <user> password <pass>' to {netrc}\n"
                "Or run `browse` mode, which needs no login.")
        auth = earthaccess.login(strategy="netrc")
    if not auth or not getattr(auth, "authenticated", False):
        raise SystemExit("Earthdata Login failed — check the token or credentials.")
    return earthaccess


def open_products(site: Site, args):
    """Yields (label, h5py.File) for local files or streamed granules."""
    import h5py

    if args.local:
        for p in args.local:
            yield Path(p).stem, h5py.File(p, "r")
        return
    grans = search(site, args.start, args.end)
    stack = pick_stack(site, grans, args.stack)
    gs = stack["granules"][-args.max:] if args.max else stack["granules"]
    log(f"{site.id}: stack {stack['stack']} — streaming {len(gs)} pairs (only the scene window is read)")
    ea = earthdata_login()
    for g in gs:
        local = CACHE / site.id / "h5" / f"{g.name}.h5"
        if local.exists():
            yield g.name, h5py.File(local, "r")
            continue
        fobj = ea.open([g.result])[0]
        yield g.name, h5py.File(fobj, "r")


def run_process(site: Site, args) -> None:
    index = load_index()
    se = site_entry(index, site)
    out_dir = WEB_NISAR / site.id
    out_dir.mkdir(parents=True, exist_ok=True)
    gnss = None if args.no_gnss else GNSS()

    processed = []
    for label, h5 in open_products(site, args):
        with h5:
            try:
                pr = extract_pair(h5, site, args.min_coherence, not args.no_iono, args.all_components, label)
            except ValueError as exc:
                log(f"  {label}: skipped ({exc})")
                continue
        m = re.search(r"GUNW_\d{3}_(\d{3})_([AD])_(\d{3})", label)
        stack_id = f"{m.group(1)}_{m.group(2)}_{m.group(3)}" if m else f"local_{pr.direction}"
        pair_id = f"{pr.reference:%Y%m%d}_{pr.secondary:%Y%m%d}"

        # Reference: tie to a GNSS station if configured, else the scene median.
        referencing = "scene median"
        med = float(np.nanmedian(pr.los)) if np.isfinite(pr.los).any() else 0.0
        pr.los -= med
        if gnss and site.reference_station:
            h = next((x for x in gnss.holdings() if x["station"] == site.reference_station), None)
            if h:
                ins = sample_native(pr, h["lon"], h["lat"])
                denu = gnss.enu_change(h["station"], pr.reference, pr.secondary)
                if ins is not None and denu is not None:
                    pr.los += float(denu @ los_unit_at(pr, h["lon"], h["lat"], h["height"])) - ins
                    referencing = f"tied to GNSS {h['station']}"

        disp = to_display(pr, site, args.width)
        limit = color_limit(disp)
        base = f"{site.id}/{stack_id}_{pair_id}"
        Image.fromarray(render_wrapped(disp, pr.wavelength)).save(WEB_NISAR / f"{base}_wrapped.png", optimize=True)
        Image.fromarray(render_los(disp, limit)).save(WEB_NISAR / f"{base}_los.png", optimize=True)
        grid = save_grid(disp, WEB_NISAR / f"{base}_los.i16")
        # Animatable frame in the same format as browse mode: LOS re-wrapped at λ/2.
        ok = np.isfinite(disp)
        save_phase_frame(np.mod(np.where(ok, disp, 0) / (pr.wavelength / 2), 1.0), ok.astype(float), WEB_NISAR / f"{base}_phase.png")

        check = None
        if gnss:
            check = gnss_check(pr, site, gnss, pr.reference, pr.secondary, lambda lo, la: sample_native(pr, lo, la))
            if check.get("n"):
                log(f"    GNSS check vs {check['reference']}: {check['n']} stations, RMS {check['rmsCm']} cm, r = {check['correlation']}")
            if check.get("note"):
                log(f"    ! {check['note']}")

        st = se["stacks"].setdefault(stack_id, {})
        st.update({"direction": pr.direction})
        st.setdefault("pairs", [])
        upsert(st["pairs"], {
            "id": pair_id, "reference": pr.reference.isoformat(), "secondary": pr.secondary.isoformat(),
            "days": (pr.secondary - pr.reference).days, "granule": label, "polarization": pr.polarization,
            "wavelengthCm": round(pr.wavelength * 100, 3), "wrapped": f"nisar/{base}_wrapped.png", "los": f"nisar/{base}_los.png",
            "phase": f"nisar/{base}_phase.png", "width": int(disp.shape[1]), "height": int(disp.shape[0]),
            "grid": {**grid, "file": f"nisar/{base}_los.i16"}, "colorLimitCm": round(limit * 100, 2),
            "validFraction": round(pr.valid_fraction, 3), "componentFraction": round(pr.component_fraction, 3),
            "ionosphereCorrected": pr.iono_corrected, "referencing": referencing, "minCoherence": args.min_coherence,
            "gnss": check, "notes": pr.notes,
        })
        processed.append((stack_id, pr, disp))
        log(f"  {pr.reference} → {pr.secondary}: {pr.valid_fraction:.0%} valid, colour limit ±{limit * 100:.1f} cm → {base}_*.png")

    # Chain consecutive pairs of a stack into a cumulative time series.
    for stack_id in sorted({p[0] for p in processed}):
        chain = sorted([p for p in processed if p[0] == stack_id], key=lambda p: p[1].reference)
        runs, cur = [], [chain[0]] if chain else []
        for a, b in zip(chain, chain[1:]):
            if a[1].secondary == b[1].reference:
                cur.append(b)
            else:
                runs.append(cur)
                cur = [b]
        if cur:
            runs.append(cur)
        run = max(runs, key=len) if runs else []
        if len(run) < 2:
            continue
        st = se["stacks"][stack_id]
        st["cumulative"] = []
        total = np.zeros_like(run[0][2])
        frames = []
        for _, pr, disp in run:
            total = total + disp  # NaN anywhere in the chain stays NaN: no gap-filling
            frames.append((pr.secondary, total.copy()))
        limit = color_limit(frames[-1][1])
        start = run[0][1].reference
        for date, cum in frames:
            base = f"{site.id}/{stack_id}_cum_{date:%Y%m%d}"
            Image.fromarray(render_los(cum, limit)).save(WEB_NISAR / f"{base}_los.png", optimize=True)
            Image.fromarray(render_wrapped(cum, run[0][1].wavelength)).save(WEB_NISAR / f"{base}_wrapped.png", optimize=True)
            grid = save_grid(cum, WEB_NISAR / f"{base}_los.i16")
            st["cumulative"].append({"date": date.isoformat(), "start": start.isoformat(), "referencing": "sum of pairs, each referenced to its scene median",
                                     "los": f"nisar/{base}_los.png",
                                     "wrapped": f"nisar/{base}_wrapped.png", "grid": {**grid, "file": f"nisar/{base}_los.i16"},
                                     "colorLimitCm": round(limit * 100, 2)})
        if gnss:
            lon, lat = display_grid(site, args.width)
            last = frames[-1][1]

            def sample_display(lo, la, last=last, lon=lon, lat=lat):
                i, j = int(np.abs(lon - lo).argmin()), int(np.abs(lat - la).argmin())
                win = last[max(0, j - 1): j + 2, max(0, i - 1): i + 2]
                v = win[np.isfinite(win)]
                return float(np.median(v)) if v.size else None

            check = gnss_check(run[-1][1], site, gnss, start, frames[-1][0], sample_display)
            st["cumulativeGnss"] = check
            if check.get("n"):
                log(f"  cumulative {start} → {frames[-1][0]}: GNSS RMS {check['rmsCm']} cm over {check['n']} stations, r = {check['correlation']}")
        log(f"  stack {stack_id}: {len(frames)} cumulative frames from {start}")

    save_index(index)
    log(f"index updated: {WEB_NISAR / 'index.json'}")


# ---------------------------------------------------------------------------
# GCOV mode: dual-polarization (HH + HV) backscatter over time, from public browse images
# ---------------------------------------------------------------------------

GCOV_SHORT_NAME = "NISAR_L2_GCOV_PROVISIONAL_V1"
_GCOV_DATE = re.compile(r"_(\d{8})T\d{6}_\d{8}T\d{6}_P")


def search_gcov(site: Site, start: str, end: str) -> list[dict]:
    """Dual-pol GCOV granules whose footprint holds the site centre, one dict per acquisition."""
    import earthaccess

    w, s, e, n = site.bbox
    out = []
    for r in earthaccess.search_data(short_name=GCOV_SHORT_NAME, bounding_box=(w, s, e, n), temporal=(start, end), count=2000):
        u = r["umm"]
        name = u["GranuleUR"]
        m = _GCOV_DATE.search(name)
        pts = u["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]["GPolygons"][0]["Boundary"]["Points"]
        poly = [(p["Latitude"], p["Longitude"]) for p in pts]
        if len(poly) > 1 and poly[0] == poly[-1]:
            poly = poly[:-1]
        urls = [x.get("URL", "") for x in u.get("RelatedUrls", [])]
        browse = next((x for x in urls if x.startswith("https") and x.endswith("_LATLON.png")), None)
        if not (m and browse and "_DHDH_" in name and point_in_polygon(site.lat, site.lon, poly)):
            continue
        track = int(_attr(u, "TRACK_NUMBER") or 0)
        direction = (_attr(u, "ASCENDING_DESCENDING") or "?")[:1]
        frame = int(_attr(u, "FRAME_NUMBER") or 0)
        out.append({"name": name, "date": dt.datetime.strptime(m.group(1), "%Y%m%d").date(), "track": track,
                    "direction": direction, "frame": frame, "stack": f"{track:03d}_{direction}_{frame:03d}",
                    "polygon": poly, "browse": browse})
    out.sort(key=lambda g: (g["stack"], g["date"]))
    return out


def run_gcov(site: Site, args) -> None:
    grans = search_gcov(site, args.start, args.end)
    if not grans:
        raise SystemExit(f"{site.id}: no dual-polarization GCOV images cover the site centre")
    stacks: dict[str, list[dict]] = {}
    for g in grans:
        stacks.setdefault(g["stack"], []).append(g)
    if args.stack:
        sid = args.stack
    else:
        sid = max(stacks, key=lambda k: (np.mean([coverage(site, g["polygon"]) for g in stacks[k]]) >= 0.6, len(stacks[k])))
    gs = stacks[sid][-args.max:] if args.max else stacks[sid]
    log(f"{site.id}: GCOV stack {sid}: {len(gs)} dual-pol (HH, HV) acquisitions from public browse images (no login)")
    loaded = []
    for g in gs:
        raw = cached(CACHE / site.id / "gcov" / f"{g['name']}.png", g["browse"])
        rgb = np.array(Image.open(io.BytesIO(raw)).convert("RGB"))
        # The browse is R = HH, G = HV, B = HH on black; anything not black is inside the footprint.
        rgba = np.dstack([rgb, np.where(rgb.sum(axis=2) > 0, 255, 0).astype(np.uint8)])
        fit = georeference_browse(rgba, g["polygon"])
        fit["ok"] = fit["rmsPx"] <= args.max_fit_px and abs(fit["aspect"] - fit["expectedAspect"]) <= 0.06
        loaded.append((g, rgba, fit))
    good = [f for _, rgba, f in loaded if f["ok"]]
    index = load_index()
    se = site_entry(index, site)
    out_dir = WEB_NISAR / site.id / "gcov"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.webp"):
        old.unlink()
    frames = []
    width = None
    w0, _, e0, _ = site.bbox
    for g, rgba, fit in loaded:
        if not fit["ok"]:
            same = [f for (_, r2, f) in loaded if f["ok"] and r2.shape == rgba.shape]
            if len(same) < 2:
                log(f"  {g['date']}: georeference fit rejected (rms {fit['rmsPx']:.1f}px)")
                continue
            fit = {k: float(np.median([s[k] for s in same])) for k in ("a", "b", "c", "d")}
            fit["rmsPx"] = float("nan")
        if width is None:
            width = int(np.clip(round(fit["a"] * (e0 - w0) * 1.25), 200, args.width))
        img = resample_browse(rgba, fit, site, width)
        if (img[:, :, 3] > 0).mean() < 0.05:
            log(f"  {g['date']}: footprint misses the scene, skipped")
            continue
        rel = f"{site.id}/gcov/{sid}_{g['date']:%Y%m%d}.webp"
        Image.fromarray(img, mode="RGBA").save(WEB_NISAR / rel, quality=80, method=6)
        frames.append({"date": g["date"].isoformat(), "file": f"nisar/{rel}", "granule": g["name"],
                       "fitRmsPx": None if math.isnan(fit["rmsPx"]) else round(fit["rmsPx"], 2)})
        how = "shared frame fit" if math.isnan(fit["rmsPx"]) else f"fit rms {fit['rmsPx']:.1f}px"
        log(f"  {g['date']}: {img.shape[1]}×{img.shape[0]} ({how}, {(img[:, :, 3] > 0).mean():.0%} of the scene)")
    if not good:
        log("  warning: no frame passed its own corner fit")
    se["gcov"] = {"stack": sid, "track": gs[0]["track"], "direction": gs[0]["direction"], "frame": gs[0]["frame"],
                  "polarizations": ["HH", "HV"], "composite": "R = HH, G = HV, B = HH",
                  "width": width, "frames": frames}
    save_index(index)
    log(f"index updated: {WEB_NISAR / 'index.json'}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None) -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):  # Windows consoles default to a legacy code page
            stream.reconfigure(encoding="utf-8", errors="replace")
    sites = load_sites()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("search", "browse", "process", "gcov"):
        sp = sub.add_parser(name)
        sp.add_argument("site", choices=sorted(sites))
        sp.add_argument("--start", default=PROVISIONAL_START, help="first reference date (YYYY-MM-DD)")
        sp.add_argument("--end", default=dt.date.today().isoformat(), help="last secondary date (YYYY-MM-DD)")
        sp.add_argument("--stack", help="stack id track_direction_frame, e.g. 114_D_070 (default: best coverage)")
        sp.add_argument("--max", type=int, default=12, help="use the most recent N pairs of the stack (0 = all)")
        sp.add_argument("--width", type=int, default=640, help="output image width in pixels")
        if name in ("browse", "gcov"):
            sp.add_argument("--max-fit-px", type=float, default=6.0, help="reject browse georeferencing worse than this RMS")
        if name == "process":
            sp.add_argument("--local", nargs="+", help="process these local .h5 files instead of streaming")
            sp.add_argument("--min-coherence", type=float, default=0.35)
            sp.add_argument("--no-iono", action="store_true", help="do not subtract the ionospheric phase screen")
            sp.add_argument("--all-components", action="store_true", help="keep every connected component (offsets between them are arbitrary)")
            sp.add_argument("--no-gnss", action="store_true", help="skip the GNSS comparison")
    args = p.parse_args(argv)
    site = sites[args.site]
    if args.cmd == "search":
        print_search(site, search(site, args.start, args.end))
    elif args.cmd == "browse":
        run_browse(site, args)
    elif args.cmd == "gcov":
        if args.width == 640:
            args.width = 900
        run_gcov(site, args)
    else:
        run_process(site, args)


if __name__ == "__main__":
    main()
