#!/usr/bin/env python3
"""
ground_photos.py — fetch the curated ground photos in pipeline/ground_photos.json from Wikimedia
Commons, re-check that each one is freely licensed, store a web-sized copy and its credits.

    python pipeline/ground_photos.py

Writes web/data/photos/<event>/<file>.jpg and web/data/photos.json. Only public domain, CC0,
CC BY and CC BY-SA files are accepted; anything else (or a licence change) is skipped loudly.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WEB_ROOT = ROOT if (ROOT / "data/nisar/index.json").is_file() else ROOT / "web"
OUT_DIR = WEB_ROOT / "data" / "photos"
OUT = WEB_ROOT / "data" / "photos.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "FringeExplorer/1.0 (https://github.com/omar-aloush/fringe; NASA Space Apps project)"}
FREE = re.compile(r"^(public domain|pd\b|cc0|cc[- ]by(-sa)?([- ][0-9.]+)?$)", re.I)
WIDTH = 1280


def get(url: str) -> bytes:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            raise


def plain(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def info(titles: list[str]) -> dict:
    params = {
        "action": "query", "format": "json", "titles": "|".join(titles),
        "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": WIDTH,
    }
    data = json.loads(get(API + "?" + urllib.parse.urlencode(params)).decode())
    norm = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
    return {norm.get(p["title"], p["title"]): p for p in data["query"]["pages"].values()}


def slug(title: str) -> str:
    stem = title.split(":", 1)[1].rsplit(".", 1)[0]
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")[:60]


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    cfg = {k: v for k, v in json.loads((HERE / "ground_photos.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
    titles = [p["title"] for photos in cfg.values() for p in photos]
    pages = {}
    for i in range(0, len(titles), 40):
        pages.update(info(titles[i:i + 40]))
        time.sleep(1)
    out = {"schema": "fringe.photos/1", "sites": {}}
    for eid, photos in cfg.items():
        items = []
        for p in photos:
            page = pages.get(p["title"])
            if not page or "imageinfo" not in page:
                print(f"  ! {eid}: {p['title']} not found")
                continue
            ii = page["imageinfo"][0]
            md = ii.get("extmetadata", {})
            lic = plain(md.get("LicenseShortName", {}).get("value", ""))
            if not FREE.match(lic) or re.search(r"\b(NC|ND)\b", lic):
                print(f"  ! {eid}: {p['title']} skipped — licence '{lic}' is not free enough")
                continue
            src = ii.get("thumburl") or ii["url"]
            dest = OUT_DIR / eid / f"{slug(p['title'])}.jpg"
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(get(src))
                time.sleep(1.5)
            items.append({
                "file": f"photos/{eid}/{dest.name}",
                "caption": p["caption"],
                "title": p["title"].split(":", 1)[1],
                "author": plain(md.get("Artist", {}).get("value", "")) or "Unknown",
                "credit": plain(md.get("Credit", {}).get("value", ""))[:200],
                "license": lic,
                "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
                "date": plain(md.get("DateTimeOriginal", {}).get("value", ""))[:40],
                "source": ii.get("descriptionurl", ""),
                "width": ii.get("thumbwidth") or ii.get("width"),
                "height": ii.get("thumbheight") or ii.get("height"),
            })
            print(f"  {eid:15} {lic:14} {dest.name}")
        if items:
            out["sites"][eid] = items
    out["generatedAt"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
