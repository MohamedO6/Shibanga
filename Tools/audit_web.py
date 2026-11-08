"""Audit the bundled archive without fetching or changing scientific data.

Run: python Tools/audit_web.py          (write manifest)
     python Tools/audit_web.py --check  (compare files with manifest)
Fingerprints verify a bundled copy, not scientific accuracy or source authenticity.
"""
import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT if (ROOT / "data/nisar/index.json").is_file() else ROOT / "web"
OUTPUT = WEB / "data/review/audit.json"


def iso(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"Invalid acquisition date: {value!r}")
    return date.fromisoformat(value)


def audit():
    nisar = json.loads((WEB / "data/nisar/index.json").read_text(encoding="utf-8"))
    errors, references, pairs, processed, frames = [], set(), 0, 0, 0

    def paths(value):
        if isinstance(value, dict):
            for v in value.values():
                paths(v)
        elif isinstance(value, list):
            for v in value:
                paths(v)
        elif isinstance(value, str) and value.startswith("nisar/"):
            references.add(value)

    paths(nisar)
    for relative in sorted(references):
        path = (WEB / "data" / relative).resolve()
        if not path.is_relative_to((WEB / "data/nisar").resolve()) or not path.is_file():
            errors.append(f"Missing or unsafe indexed asset: {relative}")
    for site in nisar["sites"].values():
        for stack in site.get("stacks", {}).values():
            unique = set()
            for p in stack.get("browse", []) + stack.get("pairs", []):
                if iso(p["reference"]) >= iso(p["secondary"]):
                    errors.append("Non-positive acquisition interval")
                unique.add((p["reference"], p["secondary"]))
            pairs += len(unique)
            processed += len({(p["reference"], p["secondary"]) for p in stack.get("pairs", [])})
        seen = set()
        for f in site.get("gcov", {}).get("frames", []):
            iso(f["date"])
            if f["date"] in seen:
                errors.append("Duplicate GCOV acquisition date")
            seen.add(f["date"])
            frames += 1
    index = json.loads((WEB / "data/index.json").read_text(encoding="utf-8"))
    evidence_manifest = json.loads((WEB / "data/evidence" / index["manifest"]).read_text(encoding="utf-8"))
    for record in evidence_manifest["records"]:
        p = (WEB / "data/evidence" / record["file"]).resolve()
        if not p.is_relative_to((WEB / "data/evidence").resolve()) or not p.is_file():
            errors.append("Missing or unsafe evidence-manifest record")
        elif hashlib.sha256(p.read_bytes()).hexdigest() != record["sha256"]:
            errors.append(f"Evidence record differs from its existing manifest: {record['file']}")
    for event in index["events"].values():
        for relative in [f"evidence/{event['evidence']}", *([f"evidence/{event['proof']}"] if event.get("proof") else []), *[f"gnss/{g}" for g in event["gnss"]]]:
            p = (WEB / "data" / relative).resolve()
            if not p.is_relative_to((WEB / "data").resolve()) or not p.is_file():
                errors.append(f"Missing or unsafe evidence/context file: {relative}")
    files = []
    for p in sorted((WEB / "data").rglob("*")):
        if not p.is_file() or p.is_relative_to(OUTPUT.parent):
            continue
        content = p.read_bytes()
        files.append({"path": p.relative_to(WEB).as_posix(), "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    check = nisar["sites"]["central-valley"]["stacks"]["114_D_070"]["cumulativeGnss"]
    rows = check["stations"]
    rms = lambda values: math.sqrt(sum(x*x for x in values) / len(values))
    findings = {"evidenceRecordsChecked": len(evidence_manifest["records"]), "comparisonStationDifferences": len(rows), "referenceStation": check["reference"],
                "radarGnssRmsCm": rms([r["insarCm"] - r["gnssCm"] for r in rows]),
                "zeroMotionBaselineRmsCm": rms([r["gnssCm"] for r in rows]),
                "interpretation": "Small motion unresolved in this bundled comparison; shared-reference errors are correlated.",
                "scope": "Metadata and file integrity only. No source authentication, OTS proof verification, scientific accuracy certification or independent field validation performed."}
    return {"schema": "fringe.bundle-audit/1", "datasetSnapshot": nisar.get("generatedAt"),
            "counts": {"radarSites": len(nisar["sites"]), "uniqueGUNWPairs": pairs, "fullGUNWPairs": processed, "gcovPreviews": frames, "files": len(files)},
            "findings": findings, "errors": errors, "files": files}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = audit()
    if result["errors"]:
        raise SystemExit("Archive audit failed: " + "; ".join(result["errors"]))
    if args.check:
        previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        previous.pop("generatedAt", None)
        if result != previous:
            raise SystemExit("Archive differs from audit manifest. Review changes, then regenerate it.")
        print(f"PASS: {len(result['files'])} bundled files match the audit manifest.")
    else:
        result["generatedAt"] = datetime.now(timezone.utc).isoformat()
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {OUTPUT.relative_to(ROOT)}: {result['counts']}")
    print("Integrity and metadata checked. Scientific accuracy is not certified.")
