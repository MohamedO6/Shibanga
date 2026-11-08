#!/usr/bin/env python3
"""
imagery_timeline.py — find every distinct satellite photo of each "then & now" spot.

Esri's World Imagery Wayback keeps every published version of the World Imagery basemap since
February 2014 (~200 versions). For a point, each version's metadata service reports the capture
date, sensor and resolution of the photo used there. Most versions repeat the previous photo, so
this script keeps only the versions where the photo actually changed and writes them to
web/data/imagery.json for the web explorer's Then & Now timelapse.

    python pipeline/imagery_timeline.py            # all spots in pipeline/then_now.json
    python pipeline/imagery_timeline.py svartsengi # one spot
"""
from __future__ import annotations

import datetime as dt
import math
import json
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WEB_ROOT = ROOT if (ROOT / "data/nisar/index.json").is_file() else ROOT / "web"
CONFIG_URL = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json"
TILE_URL = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{release}/{z}/{y}/{x}"
OUT = WEB_ROOT / "data" / "imagery.json"
CACHE = HERE / "cache" / "wayback"
UA = {"User-Agent": "fringe-imagery-timeline/1.0"}


def get_json(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:  # transient network errors: back off and retry
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def releases() -> list[dict]:
    cache = CACHE / "waybackconfig.json"
    if cache.exists() and time.time() - cache.stat().st_mtime < 86400:
        cfg = json.loads(cache.read_text(encoding="utf-8"))
    else:
        cfg = get_json(CONFIG_URL)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(cfg), encoding="utf-8")
    out = []
    for num, r in cfg.items():
        date = r["itemTitle"].split("Wayback ")[-1].rstrip(")")
        out.append({"release": int(num), "releaseDate": date, "metadata": r["metadataLayerUrl"]})
    return sorted(out, key=lambda r: r["releaseDate"])


def metadata_layer(zoom: int) -> int:
    """Metadata layers are ordered by resolution: layer 10 ≈ 19 m (zoom 13) … layer 6 ≈ 1.2 m (zoom 17)."""
    return max(0, min(13, 23 - zoom))


def capture_at(release: dict, lat: float, lon: float, zoom: int) -> dict | None:
    params = urllib.parse.urlencode({
        "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "false", "f": "json",
        "outFields": "SRC_DATE,SRC_RES,SRC_DESC,NICE_DESC",
    })
    try:
        d = get_json(f"{release['metadata']}/{metadata_layer(zoom)}/query?{params}")
    except Exception as exc:
        print(f"    {release['releaseDate']}: metadata unavailable ({exc})")
        return None
    feats = d.get("features") or []
    if not feats:
        return None
    a = feats[0]["attributes"]
    raw = str(a.get("SRC_DATE") or "")
    if len(raw) != 8:
        return None
    return {
        "captured": f"{raw[:4]}-{raw[4:6]}-{raw[6:]}",
        "source": (a.get("SRC_DESC") or "").strip(),
        "provider": (a.get("NICE_DESC") or "").strip(),
        "resM": a.get("SRC_RES"),
    }


TILEMAP_URL = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/{release}/{z}/{y}/{x}"


def tile_xy(lat: float, lon: float, z: int) -> tuple[int, int]:
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    lr = math.radians(lat)
    y = int((1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n)
    return x, y


def changed_releases(spot: dict, rels: list[dict]) -> list[dict]:
    """Walk back from the newest version using the Wayback tilemap, which reports the version in
    which a tile last changed — the same trick Esri's Wayback app uses to list "local changes".
    Visits only the distinct photos instead of all ~200 versions."""
    x, y = tile_xy(spot["lat"], spot["lon"], spot["zoom"])
    by_num = {r["release"]: r for r in rels}
    newest_first = sorted(rels, key=lambda r: r["releaseDate"], reverse=True)
    found, cursor = [], newest_first[0]
    while cursor:
        tm = get_json(TILEMAP_URL.format(release=cursor["release"], z=spot["zoom"], y=y, x=x))
        if not tm.get("data") or not tm["data"][0]:
            break
        src = by_num.get(tm["select"][0] if tm.get("select") else cursor["release"], cursor)
        if src not in found:
            found.append(src)
        older = [r for r in newest_first if r["releaseDate"] < src["releaseDate"]]
        cursor = older[0] if older else None
    return found


def timeline(spot: dict, rels: list[dict]) -> list[dict]:
    distinct = changed_releases(spot, rels)
    with ThreadPoolExecutor(max_workers=6) as pool:
        caps = list(pool.map(lambda r: capture_at(r, spot["lat"], spot["lon"], spot["zoom"]), distinct))
    versions, seen = [], set()
    for rel, cap in zip(distinct, caps):
        if not cap:  # metadata service slow or missing: fall back to the version's publication date
            cap = {"captured": rel["releaseDate"], "source": "", "provider": "", "resM": None, "approx": True}
        if cap["captured"] in seen:
            continue
        seen.add(cap["captured"])
        versions.append({"release": rel["release"], "releaseDate": rel["releaseDate"], **cap})
    return sorted(versions, key=lambda v: v["captured"])


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    spots = {k: v for k, v in json.loads((HERE / "then_now.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
    wanted = sys.argv[1:] or list(spots)
    rels = releases()
    print(f"{len(rels)} Wayback versions, {rels[0]['releaseDate']} → {rels[-1]['releaseDate']}")
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    out.update({"schema": "fringe.imagery/1", "tileUrl": TILE_URL,
                "credit": "Esri World Imagery Wayback: Esri, Vantor (Maxar), Airbus, Earthstar Geographics, USDA, USGS and the GIS user community"})
    out.setdefault("sites", {})
    for eid in wanted:
        spot = spots[eid]
        vs = timeline(spot, rels)
        focus = {k: spot[k] for k in ("label", "lat", "lon", "zoom", "note", "event", "eventLabel") if k in spot}
        out["sites"][eid] = {"eventId": eid, "focus": focus, "versions": vs}
        span = f"{vs[0]['captured']} → {vs[-1]['captured']}" if vs else "none"
        print(f"  {eid:15} {len(vs):2} distinct photos  {span}")
    out["generatedAt"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
