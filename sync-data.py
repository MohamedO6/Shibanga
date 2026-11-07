#!/usr/bin/env python3
"""
sync-data.py — copy the iOS app's evidence records, OpenTimestamps proofs and
GNSS bundles into web/data/ so the web explorer and the iOS app always show
the same bytes (the browser re-verifies the same SHA-256 digests).

    python3 web/sync-data.py            # copy files + rebuild data/index.json
    python3 web/sync-data.py --stations # also refresh station coordinates from NGL

Writes:
    data/evidence/*.json, *.ots        — copied verbatim (hashes must not change)
    data/gnss/*.json                   — copied verbatim
    data/index.json                    — which files belong to which event
    data/stations.json                 — station lat/lon (Nevada Geodetic Lab DataHoldings)
"""
import glob
import json
import os
import shutil
import sys
import urllib.request

WEB = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(os.path.dirname(WEB), "ios-fringe", "Fringe", "Resources")
OUT = os.path.join(WEB, "data")
HOLDINGS = "https://geodesy.unr.edu/NGLStationPages/DataHoldings.txt"


def copy_dir(src, dst, patterns):
    os.makedirs(dst, exist_ok=True)
    for old in glob.glob(os.path.join(dst, "*")):
        os.remove(old)
    names = []
    for pat in patterns:
        for path in sorted(glob.glob(os.path.join(src, pat))):
            shutil.copyfile(path, os.path.join(dst, os.path.basename(path)))
            names.append(os.path.basename(path))
    return names


def refresh_stations(stations):
    req = urllib.request.Request(HOLDINGS, headers={"User-Agent": "fringe-web-sync/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = r.read().decode("latin-1")
    coords = {}
    for line in text.splitlines()[1:]:
        c = line.split()
        if len(c) >= 3 and c[0] in stations:
            lon = float(c[2])
            coords[c[0]] = {"lat": round(float(c[1]), 5), "lon": round(lon - 360 if lon > 180 else lon, 5)}
    return coords


def main():
    evidence = copy_dir(os.path.join(RES, "Evidence"), os.path.join(OUT, "evidence"), ["*.json", "*.ots"])
    gnss = copy_dir(os.path.join(RES, "GNSS"), os.path.join(OUT, "gnss"), ["*.json"])

    events = {}
    for name in evidence:
        if name.startswith("evidence-") and name.endswith(".json") and name != "evidence-manifest.json":
            eid = name[len("evidence-"):-len(".json")]
            proof = f"evidence-{eid}.ots"
            events[eid] = {"evidence": name, "proof": proof if proof in evidence else None, "gnss": []}
    for name in gnss:
        for eid in events:
            if name.startswith(eid + "-"):
                events[eid]["gnss"].append(name)
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"events": events, "manifest": "evidence-manifest.json"}, f, indent=1)

    stations_path = os.path.join(OUT, "stations.json")
    if "--stations" in sys.argv[1:] or not os.path.exists(stations_path):
        wanted = {n.split("-")[-1][:-len(".json")] for n in gnss}
        coords = refresh_stations(wanted)
        with open(stations_path, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(coords.items())), f, indent=1)
        missing = wanted - set(coords)
        if missing:
            print("no coordinates for:", ", ".join(sorted(missing)))

    print(f"synced {len(evidence)} evidence files, {len(gnss)} GNSS bundles, {len(events)} events -> {OUT}")


if __name__ == "__main__":
    main()
