#!/usr/bin/env python3
"""Independent Landsat NDVI check of the existing NISAR seasonal interpretation.

Run from the app root: python pipeline/season_check.py
Use --offline to recompute from cached 50 m NDVI windows without network access.
No Earthdata login is needed; only public Landsat image windows are read.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
import requests
from scipy.stats import spearmanr

ROOT = Path(__file__).resolve().parent.parent
PLAN_PATH = ROOT / "pipeline/season_check_plan.json"
CACHE = ROOT / "pipeline/cache/season-check"
OUT = ROOT / "data/nisar/nile-delta"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"


def rank_correlation(x, y):
    x, y = np.asarray(x, float), np.asarray(y, float)
    good = np.isfinite(x) & np.isfinite(y)
    if good.sum() < 3 or np.ptp(x[good]) == 0 or np.ptp(y[good]) == 0:
        return None
    return round(float(spearmanr(x[good], y[good]).statistic), 6)


def ndvi_from_raw(red, nir, qa, saturation, aerosol, plan):
    """USGS C2 scaling (including the offset) and explicit bit masks, before NDVI."""
    red, nir = np.asarray(red), np.asarray(nir)
    sr = plan["surfaceReflectance"]
    r = red.astype(np.float32) * sr["scale"] + sr["offset"]
    n = nir.astype(np.float32) * sr["scale"] + sr["offset"]
    qa_mask = sum(1 << b for b in plan["qaPixelRejectBits"])
    sat_mask = sum(1 << b for b in plan["qaRadsatRejectBits"])
    lo, hi = plan["reflectanceRange"]
    good = ((qa & qa_mask) == 0) & ((saturation & sat_mask) == 0)
    good &= (red != 0) & (nir != 0) & ((aerosol & 1) == 0)
    good &= ~np.isin((aerosol >> 6) & 3, plan["aerosolRejectLevels"])
    good &= np.isfinite(r) & np.isfinite(n) & (r >= lo) & (r <= hi) & (n >= lo) & (n <= hi) & (r + n > 0)
    result = np.full(r.shape, np.nan, dtype=np.float32)
    np.divide(n - r, n + r, out=result, where=good)
    return result


def block_values(cube, common, block_pixels, minimum):
    """Same spatial support at every date; each retained block gets one vote."""
    rows = []
    for y in range(0, common.shape[0], block_pixels):
        for x in range(0, common.shape[1], block_pixels):
            mask = common[y:y + block_pixels, x:x + block_pixels]
            if mask.size and mask.mean() >= minimum:
                pixels = cube[:, y:y + block_pixels, x:x + block_pixels][:, mask]
                rows.append(pixels.mean(axis=1))
    return np.stack(rows, axis=1) if rows else np.empty((len(cube), 0))


def spatial_summary(values, plan):
    if values.shape[1] < 10:
        raise ValueError("Fewer than 10 spatial blocks: insufficient support for the planned summary")
    rng = np.random.default_rng(plan["randomSeed"])
    indices = rng.integers(values.shape[1], size=(plan["bootstrapReplicates"], values.shape[1]))
    medians = np.median(values[:, indices], axis=2)
    center = np.median(values, axis=1)
    ci = np.percentile(medians, [2.5, 97.5], axis=1)
    return center, ci


def select_candidates(items, date, used_dates, gap):
    target = dt.date.fromisoformat(date)
    eligible = [i for i in items if i["properties"]["datetime"][:10] not in used_dates
                and abs((dt.date.fromisoformat(i["properties"]["datetime"][:10]) - target).days) <= gap]
    return sorted(eligible, key=lambda i: (abs((dt.date.fromisoformat(i["properties"]["datetime"][:10]) - target).days),
                                          i["properties"]["datetime"][:10], i["id"]))


def read_window(item, bounds, epsg, width, plan, session):
    """Read five cropped COG layers, then average valid native NDVI to a fixed grid."""
    import certifi
    import rasterio
    from rasterio.transform import from_origin
    from rasterio.warp import transform_bounds, reproject, Resampling
    from rasterio.windows import from_bounds, Window

    cache = CACHE / f"{item['id']}.npz"
    fingerprint = hashlib.sha256(PLAN_PATH.read_bytes() + json.dumps({"bounds":bounds,"epsg":epsg,"width":width,"assets":item['assets']},sort_keys=True).encode()).hexdigest()
    if cache.is_file():
        with np.load(cache, allow_pickle=False) as z:
            if str(z["plan"]) == fingerprint:
                return z["ndvi"].copy()
    # The SAS only grants anonymous public-data read access. Never save it in outputs.
    if not hasattr(session, "landsat_read_token"):
        token = session.get("https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2", timeout=45)
        token.raise_for_status()
        session.landsat_read_token = token.json()["token"]
    signed = session.landsat_read_token
    arrays = []
    native_transform = native_crs = native_shape = None
    options = {"GDAL_HTTP_CAINFO": certifi.where(), "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
               "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".TIF,.tif", "GDAL_HTTP_TIMEOUT": "60",
               "GDAL_HTTP_MAX_RETRY": "2", "GDAL_HTTP_RETRY_DELAY": "2"}
    with rasterio.Env(**options):
        for band in ("red", "nir08", "qa_pixel", "qa_radsat", "qa_aerosol"):
            href = item["assets"][band]["href"]
            with rasterio.open(href + "?" + signed) as src:
                box = transform_bounds(epsg, src.crs, *bounds, densify_pts=21)
                win = from_bounds(*box, src.transform)
                win = Window(math.floor(win.col_off), math.floor(win.row_off),
                             math.ceil(win.col_off + win.width) - math.floor(win.col_off),
                             math.ceil(win.row_off + win.height) - math.floor(win.row_off))
                data = src.read(1, window=win, boundless=True, fill_value=0)
                transform = src.window_transform(win)
                if native_transform is not None and (transform != native_transform or data.shape != native_shape or src.crs != native_crs):
                    raise ValueError(f"Native bands do not share a grid: {item['id']}")
                native_transform, native_crs, native_shape = transform, src.crs, data.shape
                arrays.append(data)
    native = ndvi_from_raw(*arrays, plan)
    target = np.full((width, width), np.nan, dtype=np.float32)
    coverage = np.zeros_like(target)
    dst_transform = from_origin(bounds[0], bounds[3], plan["outputCellM"], plan["outputCellM"])
    common_args = dict(src_transform=native_transform, src_crs=native_crs, dst_transform=dst_transform,
                       dst_crs=epsg, resampling=Resampling.average)
    reproject(native, target, src_nodata=np.nan, dst_nodata=np.nan, **common_args)
    reproject(np.isfinite(native).astype(np.float32), coverage, **common_args)
    target[coverage < plan["minValidNativeFractionPerCell"]] = np.nan
    np.savez_compressed(cache, ndvi=target, plan=fingerprint)
    return target


def analyse(radar_rows, matched, cube, plan):
    common = np.all(np.isfinite(cube), axis=0)
    fraction = float(common.mean())
    if len(matched) < plan["minMatchedDates"] or fraction < plan["minCommonAreaFraction"]:
        raise ValueError(f"Insufficient planned support: {len(matched)} dates, {fraction:.1%} common area")
    values = block_values(cube, common, plan["spatialBlockM"] // plan["outputCellM"], plan["minCommonFractionPerBlock"])
    center, ci = spatial_summary(values, plan)
    radar = [radar_rows[r["radarDate"]] for r in matched]
    primary = np.array([r[plan["primaryRadarChannel"]] for r in radar])
    secondary = np.array([r[plan["secondaryRadarChannel"]] for r in radar])
    radar_days = np.array([dt.date.fromisoformat(r["radarDate"]).toordinal() for r in matched])
    optical_days = np.array([dt.date.fromisoformat(r["opticalDate"]).toordinal() for r in matched])
    rho = rank_correlation(primary, center)
    loo = [rank_correlation(np.delete(primary, i), np.delete(center, i)) for i in range(len(primary))]
    loo = [r for r in loo if r is not None]
    changes = rank_correlation(np.diff(primary) / np.diff(radar_days), np.diff(center) / np.diff(optical_days))
    sensitivities = []
    for size in plan["sensitivityBlockM"]:
        v = block_values(cube, common, size // plan["outputCellM"], plan["minCommonFractionPerBlock"])
        sensitivities.append({"blockM": size, "blocks": v.shape[1], "hvSpearman": rank_correlation(primary, np.median(v, axis=1)) if v.shape[1] else None})
    exact = np.array([r["lagDays"] == 0 for r in matched])
    rows = []
    for i, row in enumerate(matched):
        rows.append({**row, "hhDb": radar[i]["hhDb"], "hvDb": radar[i]["hvDb"],
                     "ndvi": round(float(center[i]), 6), "ndviSpatialCi95": [round(float(ci[0, i]), 6), round(float(ci[1, i]), 6)]})
    return {"radarDates": len(radar_rows), "matchedDates": len(rows), "commonAreaFraction": round(fraction, 6), "commonAreaKm2": round(float(common.sum() * plan["outputCellM"] ** 2 / 1e6), 3),
            "spatialBlocks": values.shape[1], "hvSpearman": rho, "hhSpearmanSecondary": rank_correlation(secondary, center),
            "hvFirstDifferenceRateSpearman": changes, "leaveOneDateOutHvSpearmanRange": [min(loo), max(loo)] if loo else None,
            "blockSizeSensitivity": sensitivities, "exactDateMatches": int(exact.sum()),
            "exactDateHvSpearman": rank_correlation(primary[exact], center[exact]), "rows": rows}, common


def write_outputs(result, common, plan, season):
    import platform
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.dates import DateFormatter, MonthLocator

    rows = result["rows"]
    fig, axes = plt.subplots(2, 1, figsize=(10, 6.5), sharex=True, constrained_layout=True)
    plt.rcParams.update({"font.size": 10})
    dates = [dt.date.fromisoformat(r["radarDate"]) for r in rows]
    optical = [dt.date.fromisoformat(r["opticalDate"]) for r in rows]
    axes[0].plot(dates, [r["hhDb"] for r in rows], 'o-', color='#b33e6b', label='NISAR HH (secondary)')
    axes[0].plot(dates, [r["hvDb"] for r in rows], 'o-', color='#16814a', label='NISAR HV (primary)')
    axes[0].set_ylabel('Median gamma0 (dB)'); axes[0].legend(loc='best')
    axes[0].set_title('Nile Delta: radar season checked against independent Landsat greenness', fontsize=13)
    axes[1].plot(optical, [r["ndvi"] for r in rows], 'o-', color='#2467ac', label='Landsat 8/9 NDVI')
    axes[1].fill_between(optical, [r["ndviSpatialCi95"][0] for r in rows], [r["ndviSpatialCi95"][1] for r in rows], color='#2467ac', alpha=.2, label='95% spatial-block bootstrap interval')
    axes[1].set_ylabel('NDVI (unitless)'); axes[1].legend(loc='best')
    axes[1].xaxis.set_major_locator(MonthLocator()); axes[1].xaxis.set_major_formatter(DateFormatter('%b %Y'))
    for ax in axes: ax.grid(alpha=.2)
    fig.supxlabel(f"{len(rows)} date pairs; gap <= {plan['maxDateGapDays']} days; HV/NDVI rank r = {result['hvSpearman']:.2f}.\nSpatial intervals omit sensor/systematic errors. Association does not establish crop type or cause.", fontsize=9)
    fig.savefig(OUT / 'season-check.png', dpi=180); plt.close(fig)
    with (OUT / 'season-check.csv').open('w', encoding='utf-8', newline='') as stream:
        fields = ['radarDate','opticalDate','lagDays','hhDb','hvDb','ndvi','ndviCiLow','ndviCiHigh','clearFraction','scene']
        writer = csv.DictWriter(stream, fieldnames=fields); writer.writeheader()
        for r in rows: writer.writerow({**{k:r[k] for k in fields if k in r}, 'ndviCiLow':r['ndviSpatialCi95'][0], 'ndviCiHigh':r['ndviSpatialCi95'][1]})
    source_hash = hashlib.sha256((ROOT / plan['radarSource']).read_bytes()).hexdigest()
    output = {"schema":"undula.season-check/1", "generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),
              "analysisPlanSha256":hashlib.sha256(PLAN_PATH.read_bytes()).hexdigest(), "radarSourceSha256":source_hash,
              "question":plan['question'], "method":plan, "area":{"center":season['center'],"windowKm":season['windowKm'],"epsg":32636,
                 "supportNote":"Radar uses the existing whole-window medians. Optical NDVI uses fixed common support within that footprint; this is regional consistency, not pixel-level validation."},
              "software":{"python":platform.python_version(),"numpy":np.__version__,"matplotlib":matplotlib.__version__,
                          "processingCodeSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
              "results":result, "interpretation":plan['interpretation'],
              "sources":[{"title":"USGS Landsat surface reflectance and scaling","url":"https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products"},
                         {"title":"USGS Landsat QA flags","url":"https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands"},
                         {"title":"ASF NISAR GCOV guide","url":"https://nisar-docs.asf.alaska.edu/gcov/"},
                         {"title":"Landsat public STAC catalogue","url":STAC}]}
    (OUT / 'season-check.json').write_text(json.dumps(output,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--offline',action='store_true');args=parser.parse_args()
    plan=json.loads(PLAN_PATH.read_text(encoding='utf-8'));season=json.loads((ROOT/plan['radarSource']).read_text(encoding='utf-8'))
    CACHE.mkdir(parents=True,exist_ok=True)
    import rasterio
    from rasterio.warp import transform,transform_bounds
    lon,lat=season['center']['lon'],season['center']['lat'];epsg=32636
    cx,cy=transform(4326,epsg,[lon],[lat]);half=season['windowKm']*500
    bounds=(cx[0]-half,cy[0]-half,cx[0]+half,cy[0]+half);width=round(half*2/plan['outputCellM'])
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    session=requests.Session()
    session.mount('https://', HTTPAdapter(max_retries=Retry(total=3,backoff_factor=1,status_forcelist=[429,500,502,503,504])))
    catalogue=CACHE/'catalogue.json'
    if args.offline:
        items=json.loads(catalogue.read_text(encoding='utf-8'))
    else:
        start=dt.date.fromisoformat(season['dates'][0]['date'])-dt.timedelta(days=plan['maxDateGapDays'])
        end=dt.date.fromisoformat(season['dates'][-1]['date'])+dt.timedelta(days=plan['maxDateGapDays'])
        params={'collections':plan['opticalCollection'],'bbox':','.join(map(str,transform_bounds(epsg,4326,*bounds))),
                'datetime':f'{start}T00:00:00Z/{end}T23:59:59Z','limit':100}
        response=session.get(STAC+'/search',params=params,timeout=45);response.raise_for_status();body=response.json()
        if any(l.get('rel')=='next' for l in body.get('links',[])):raise ValueError('Catalogue query is truncated; paginate before analysis')
        items=[i for i in body['features'] if i['id'].endswith('_T1') and i['properties'].get('platform') in plan['sensors']]
        catalogue.write_text(json.dumps(items),encoding='utf-8')
    used_dates=set();matched=[];arrays=[];excluded=[]
    for row in season['dates']:
        accepted=False
        for item in select_candidates(items,row['date'],used_dates,plan['maxDateGapDays']):
            if args.offline and not (CACHE/f"{item['id']}.npz").is_file():
                raise ValueError('Offline cache is incomplete; run online once')
            try:ndvi=read_window(item,bounds,epsg,width,plan,session)
            except Exception as exc:
                # Network/reader errors are failures, never silently converted into a low-quality scene.
                raise RuntimeError(f"Could not read public Landsat scene {item['id']} ({type(exc).__name__})") from None
            fraction=float(np.isfinite(ndvi).mean());date=item['properties']['datetime'][:10]
            print(f"{row['date']} / {date} {item['id']}: {fraction:.1%} usable optical cells",flush=True)
            if fraction<plan['minClearFractionPerScene']:
                excluded.append({'radarDate':row['date'],'scene':item['id'],'clearFraction':round(fraction,6),'reason':'below planned optical coverage threshold'});continue
            used_dates.add(date);arrays.append(ndvi)
            matched.append({'radarDate':row['date'],'opticalDate':date,'lagDays':(dt.date.fromisoformat(date)-dt.date.fromisoformat(row['date'])).days,
                            'scene':item['id'],'clearFraction':round(fraction,6),'assets':{k:item['assets'][k]['href'] for k in ['red','nir08','qa_pixel','qa_radsat','qa_aerosol']}})
            accepted=True;break
        if not accepted:excluded.append({'radarDate':row['date'],'reason':'no unused optical scene met the frozen date/coverage rules'})
    if not arrays:raise ValueError('No usable optical dates; do not claim an independent check')
    result,common=analyse({r['date']:r for r in season['dates']},matched,np.stack(arrays),plan)
    result['excludedCandidates']=excluded
    write_outputs(result,common,plan,season)


if __name__=='__main__':main()
