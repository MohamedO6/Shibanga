#!/usr/bin/env python3
"""
make-gnss-bundle.py — regenerate Fringe's bundled GNSS time-series JSON.

Downloads daily IGS20 position solutions (tenv3) from the Nevada Geodetic Lab
for a station, removes offsets at NGL-logged equipment events inside the
window, computes weekly means referenced to the first 30 days of the window,
and writes <eventId>-<STATION>.json in the same compact format as the other
bundles:

    {"station","name","t0","source","corrections","samples":[[daysSinceT0, eastMm, northMm, upMm], ...]}

Usage:
    python3 make-gnss-bundle.py <STATION> <eventId> <stationName> <t0 YYYY-MM-DD> <t1 YYYY-MM-DD> [outDir]

Example:
    python3 make-gnss-bundle.py CRCN central-valley "Corcoran — centre of the drought subsidence bowl" 2015-01-01 2016-09-30
"""
import datetime as dt
import json
import sys
import urllib.request

URL = "https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/{st}.tenv3"
STEPS_URL = "https://geodesy.unr.edu/NGLStationPages/steps.txt"
SOURCE = "Nevada Geodetic Lab, daily IGS20 solutions (tenv3)"
UA = {"User-Agent": "fringe-bundler/1.1"}


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("latin-1")


def _tenv3_date(token: str) -> dt.date:
    # tenv3 dates are YYMMMDD (e.g. "15JAN01" = 2015-01-01), not DDMMMYY.
    return dt.datetime.strptime(token, "%y%b%d").date()


def fetch(station: str):
    return parse_tenv3(_get(URL.format(st=station)))


def parse_tenv3(text: str):
    """Parse NGL tenv3 text into sorted (date, east_m, north_m, up_m) rows."""
    rows = []
    for line in text.splitlines():
        if line.startswith("site") or line.startswith("#"):
            continue
        c = line.split()
        if len(c) < 21:
            continue
        # Each component is an integer part (_e0/n0/u0) plus a fractional part;
        # add them so values stay continuous when the fraction rolls over.
        east = float(c[7]) + float(c[8])
        north = float(c[9]) + float(c[10])
        up = float(c[11]) + float(c[12])
        rows.append((_tenv3_date(c[1]), east, north, up))  # (date, east_m, north_m, up_m)
    rows.sort()
    return rows


def fetch_steps(station: str, steps_text: str | None = None):
    """Equipment / unknown-event dates (type 1) that NGL logs for this station.
    Earthquake steps (type 2) are left in: they are real ground motion."""
    events = {}
    for line in (steps_text if steps_text is not None else _get(STEPS_URL)).splitlines():
        c = line.split()
        if len(c) >= 4 and c[0] == station and c[2] == "1":
            events.setdefault(_tenv3_date(c[1]), []).append(c[3])
    return sorted((d, sorted(set(kinds))) for d, kinds in events.items())


def _solve3(m, v):
    """Solve a 3x3 linear system by Gaussian elimination with partial pivoting."""
    a = [row[:] + [v[i]] for i, row in enumerate(m)]
    for col in range(3):
        piv = max(range(col, 3), key=lambda r: abs(a[r][col]))
        a[col], a[piv] = a[piv], a[col]
        if abs(a[col][col]) < 1e-12:
            return None
        for r in range(3):
            if r != col:
                f = a[r][col] / a[col][col]
                a[r] = [x - f * y for x, y in zip(a[r], a[col])]
    return [a[i][3] / a[i][i] for i in range(3)]


def estimate_offset(rows, day, comp, span=30):
    """Fit y = a + b·t + c·H(t − day) to `span` days either side; c is the offset."""
    pts = [((r[0] - day).days, r[comp]) for r in rows if abs((r[0] - day).days) <= span]
    before = sum(1 for t, _ in pts if t < 0)
    if before < 5 or len(pts) - before < 5:
        return None
    sums = [[0.0] * 3 for _ in range(3)]
    rhs = [0.0] * 3
    for t, y in pts:
        x = (1.0, float(t), 1.0 if t >= 0 else 0.0)
        for i in range(3):
            rhs[i] += x[i] * y
            for j in range(3):
                sums[i][j] += x[i] * x[j]
    sol = _solve3(sums, rhs)
    return None if sol is None else sol[2]


def remove_steps(rows, steps, t0, t1):
    """Subtract equipment offsets from every later solution. Returns (rows, notes)."""
    rows = [list(r) for r in rows]
    notes = []
    for day, kinds in steps:
        if not (t0 < day <= t1):
            continue
        offsets = [estimate_offset(rows, day, k) for k in (1, 2, 3)]
        if any(o is None for o in offsets):
            notes.append(f"{day.isoformat()} NGL step ({', '.join(kinds)}): too few solutions to estimate, left in")
            continue
        for r in rows:
            if r[0] >= day:
                for k, o in zip((1, 2, 3), offsets):
                    r[k] -= o
        e, n, u = (o * 1000 for o in offsets)
        notes.append(
            f"{day.isoformat()} NGL step ({', '.join(kinds)}): removed offset "
            f"E {e:+.1f} / N {n:+.1f} / U {u:+.1f} mm"
        )
    return [tuple(r) for r in rows], notes


def bundle(rows, t0, t1):
    sel = [r for r in rows if t0 <= r[0] <= t1]
    if len(sel) < 30:
        raise SystemExit(f"only {len(sel)} solutions in window; refusing to bundle")

    # Reference: mean of the first 30 days of the window.
    d0 = sel[0][0]
    ref_idx = [i for i, r in enumerate(sel) if (r[0] - d0).days <= 30]
    ref = tuple(sum(sel[i][k] for i in ref_idx) / len(ref_idx) for k in (1, 2, 3))  # (e, n, u)

    # Weekly means (7-day buckets, gap-tolerant: each bucket averages whatever falls in it).
    buckets = {}
    for r in sel:
        w = (r[0] - d0).days // 7
        buckets.setdefault(w, []).append(r)
    samples = []
    for w in sorted(buckets):
        g = buckets[w]
        day = w * 7
        vals = [(sum(r[j] for r in g) / len(g) - ref[j - 1]) * 1000 for j in (1, 2, 3)]
        if max(abs(v) for v in vals) > 2000:  # gross-outlier guard
            continue
        samples.append([day] + [round(v, 1) for v in vals])
    return samples


def main():
    station, event_id, name, t0s, t1s = sys.argv[1:6]
    out_dir = sys.argv[6] if len(sys.argv) > 6 else "."
    t0, t1 = dt.date.fromisoformat(t0s), dt.date.fromisoformat(t1s)
    rows, notes = remove_steps(fetch(station), fetch_steps(station), t0, t1)
    samples = bundle(rows, t0, t1)
    out = {
        "station": station,
        "name": name,
        "t0": t0s,
        "source": SOURCE,
        "corrections": notes,
        "samples": samples,
    }
    path = f"{out_dir}/{event_id}-{station}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    up_end = samples[-1][3]
    print(f"{path}: {len(samples)} weekly samples, {samples[-1][0]/365.25:.2f} yr span, up {up_end:+.1f} mm at end")
    for n in notes:
        print("  " + n)


if __name__ == "__main__":
    main()
