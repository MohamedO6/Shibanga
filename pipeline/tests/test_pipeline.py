"""
Tests for nisar_pipeline.py against synthetic GUNW products laid out exactly as the NISAR L2 GUNW
product specification (JPL D-102272 Rev E) describes, with a known deformation field.

    python pipeline/tests/test_pipeline.py
"""
import datetime as dt
import importlib.util
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

import h5py
import numpy as np
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nisar_pipeline", HERE.parent / "nisar_pipeline.py")
P = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = P  # dataclasses resolve annotations through sys.modules
spec.loader.exec_module(P)

SITE = P.Site("test-valley", "Test valley", "central-valley", 36.10, -119.56, 140, None)
EPSG = 32611
FREQ = 1.2575e9                      # Hz → λ ≈ 23.84 cm
LAM = P.C_LIGHT / FREQ
LOS = np.array([-0.55, 0.12, 0.0])   # descending-like ground→satellite unit vector (E, N, U)
LOS[2] = math.sqrt(1 - LOS[0] ** 2 - LOS[1] ** 2)
CENTRE_XY = Transformer.from_crs(4326, EPSG, always_xy=True).transform(SITE.lon, SITE.lat)


def truth_up(x, y, peak):
    """Subsidence bowl (metres, negative = down) centred on the site."""
    r2 = (x - CENTRE_XY[0]) ** 2 + (y - CENTRE_XY[1]) ** 2
    return -peak * np.exp(-r2 / (2 * 15_000.0 ** 2))


def truth_los(x, y, peak):
    return truth_up(x, y, peak) * LOS[2]  # vertical-only motion projected on the LOS


def make_gunw(path: Path, ref: dt.date, sec: dt.date, peak: float, seed: int = 0) -> None:
    rng = np.random.default_rng(seed)
    n, step = 340, 500.0
    x = CENTRE_XY[0] + (np.arange(n) - n / 2) * step
    y = CENTRE_XY[1] - (np.arange(n) - n / 2) * step      # north-up: y decreases down the rows
    X, Y = np.meshgrid(x, y)

    los = truth_los(X, Y, peak)
    iono = 1.5 * np.sin(X / 40_000.0) + 0.8 * np.cos(Y / 55_000.0)   # radians, smooth screen
    phase = -(4 * np.pi / LAM) * los + iono + rng.normal(0, 0.05, X.shape) + 7.3  # arbitrary offset

    # The 140 km scene covers rows/cols ~30–310 of this 170 km grid; put every defect inside it.
    cc = np.ones(X.shape, dtype=np.uint16)
    patch = (slice(60, 100), slice(240, 280))
    cc[patch] = 2
    phase[patch] += 2 * np.pi * 3                         # mis-unwrapped island → must be dropped
    coh = np.full(X.shape, 0.8, dtype=np.float32)
    coh[250:290, 40:80] = 0.1                             # decorrelated field → masked
    mask = np.full(X.shape, 11, dtype=np.uint8)           # subswath 1 in both images, land
    mask[40:55, :] = 111                                  # water strip → masked
    phase[290:300, 40:80] = np.nan                        # no-data hole

    with h5py.File(path, "w") as h:
        ident = h.create_group("/science/LSAR/identification")
        ident["orbitPassDirection"] = np.bytes_("Descending")
        ident["referenceZeroDopplerStartTime"] = np.bytes_(f"{ref.isoformat()}T02:48:23.000000000")
        ident["secondaryZeroDopplerStartTime"] = np.bytes_(f"{sec.isoformat()}T02:48:23.000000000")
        fa = h.create_group("/science/LSAR/GUNW/grids/frequencyA")
        fa["centerFrequency"] = FREQ
        fa["listOfPolarizations"] = np.array([b"HH"])
        ui = fa.create_group("unwrappedInterferogram")
        ui["xCoordinates"] = x
        ui["yCoordinates"] = y
        proj = ui.create_dataset("projection", data=np.uint32(EPSG))
        proj.attrs["epsg_code"] = np.int32(EPSG)
        ui.create_dataset("mask", data=mask, fillvalue=255)
        hh = ui.create_group("HH")
        hh.create_dataset("unwrappedPhase", data=phase.astype(np.float32), chunks=(64, 64))
        hh.create_dataset("coherenceMagnitude", data=coh, chunks=(64, 64))
        hh.create_dataset("connectedComponents", data=cc, chunks=(64, 64))
        hh.create_dataset("ionospherePhaseScreen", data=iono.astype(np.float32), chunks=(64, 64))
        rg = h.create_group("/science/LSAR/GUNW/metadata/radarGrid")
        cx = x[::20]
        cy = y[::20]
        hts = np.array([-500.0, 0.0, 500.0, 1500.0])
        rg["xCoordinates"] = cx
        rg["yCoordinates"] = cy
        rg["heightAboveEllipsoid"] = hts
        rg["losUnitVectorX"] = np.full((hts.size, cy.size, cx.size), LOS[0], dtype=np.float32)
        rg["losUnitVectorY"] = np.full((hts.size, cy.size, cx.size), LOS[1], dtype=np.float32)


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.dates = [dt.date(2026, 6, 10) + dt.timedelta(days=12 * k) for k in range(4)]
        cls.files = []
        for k in range(3):
            name = (f"NISAR_L2_PR_GUNW_0{22 + k}_114_D_070_0{23 + k}_4000_SH_"
                    f"{cls.dates[k]:%Y%m%d}T024823_{cls.dates[k]:%Y%m%d}T024858_"
                    f"{cls.dates[k + 1]:%Y%m%d}T024823_{cls.dates[k + 1]:%Y%m%d}T024857_P05023_N_F_J_001.h5")
            f = cls.dir / name
            make_gunw(f, cls.dates[k], cls.dates[k + 1], peak=0.02, seed=k)
            cls.files.append(f)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def extract(self, f, **kw):
        with h5py.File(f, "r") as h:
            return P.extract_pair(h, SITE, label=f.name, **kw)

    def test_recovers_los_with_correct_sign_and_masks(self):
        pr = self.extract(self.files[0])
        self.assertEqual(pr.reference, self.dates[0])
        self.assertEqual(pr.direction, "D")
        self.assertTrue(pr.iono_corrected)
        self.assertAlmostEqual(pr.wavelength, LAM, places=6)
        X, Y = np.meshgrid(pr.x, pr.y)
        truth = truth_los(X, Y, 0.02)
        ok = np.isfinite(pr.los)
        diff = pr.los[ok] - truth[ok]
        self.assertLess(np.std(diff), 0.002, "LOS should match truth up to a constant (2 mm noise)")
        centre = pr.los[np.unravel_index(np.argmin(np.abs(X - CENTRE_XY[0]) + np.abs(Y - CENTRE_XY[1])), X.shape)]
        edge = np.nanmedian(pr.los[:, :20])
        self.assertLess(centre - edge, -0.015, "sinking ground must come out as motion AWAY from the satellite")

    def test_drops_bad_component_water_and_decorrelation(self):
        with h5py.File(self.files[0], "r") as h:
            ny, nx = h["/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH/unwrappedPhase"].shape
        pr = self.extract(self.files[0])
        self.assertLess(pr.component_fraction, 1.0)
        self.assertLess(pr.valid_fraction, 0.95)
        X, Y = np.meshgrid(pr.x, pr.y)
        truth = truth_los(X, Y, 0.02)
        ok = np.isfinite(pr.los)
        resid = pr.los[ok] - truth[ok]
        self.assertLess(np.max(np.abs(resid - np.median(resid))), 0.02, "no 3-cycle island should survive")

    def test_ionosphere_toggle_changes_result(self):
        a = self.extract(self.files[0])
        b = self.extract(self.files[0], use_iono=False)
        self.assertFalse(b.iono_corrected)
        X, Y = np.meshgrid(a.x, a.y)
        truth = truth_los(X, Y, 0.02)
        ok = np.isfinite(b.los) & np.isfinite(a.los)
        self.assertGreater(np.std(b.los[ok] - truth[ok]), 5 * np.std(a.los[ok] - truth[ok]))

    def test_los_unit_vector_from_cubes(self):
        pr = self.extract(self.files[0])
        v = P.los_unit_at(pr, SITE.lon, SITE.lat, 60.0)
        np.testing.assert_allclose(v, LOS, atol=1e-5)

    def test_display_grid_and_rendering(self):
        pr = self.extract(self.files[0])
        disp = P.to_display(pr, SITE, 200)
        lon, lat = P.display_grid(SITE, 200)
        self.assertEqual(disp.shape, (lat.size, lon.size))
        self.assertTrue(np.isfinite(disp).mean() > 0.5)
        wrapped = P.render_wrapped(disp, pr.wavelength)
        los = P.render_los(disp, P.color_limit(disp))
        self.assertEqual(wrapped.shape, disp.shape + (4,))
        self.assertTrue(np.all(wrapped[..., 3][~np.isfinite(disp)] == 0))
        self.assertTrue(np.all(los[..., 3][np.isfinite(disp)] > 0))

    def test_gnss_double_difference(self):
        s = [{"station": "A", "lat": 0, "lon": 0, "insar": 0.010, "gnss": 0.002},
             {"station": "B", "lat": 0, "lon": 0, "insar": -0.004, "gnss": -0.012},
             {"station": "C", "lat": 0, "lon": 0, "insar": 0.000, "gnss": -0.008},
             {"station": "D", "lat": 0, "lon": 0, "insar": 0.020, "gnss": 0.012}]
        r = P.compare_with_gnss(s, "A")
        self.assertEqual(r["reference"], "A")
        self.assertEqual(r["n"], 3)
        self.assertLess(r["rmsCm"], 0.01, "a constant InSAR offset must cancel in double differences")
        self.assertGreater(r["correlation"], 0.99)
        flipped = [{**x, "insar": -x["insar"]} for x in s]
        self.assertIn("sign", P.compare_with_gnss(flipped, "A")["note"])

    def test_browse_georeferencing(self):
        poly = [(38.02544, -122.1005), (35.97222, -122.8578), (35.29557, -120.17888), (37.32832, -119.34807)]
        a, c = 364.98, -454.6
        b, d = 56 - a * -122.8578, 73 - c * 38.02544
        img = np.zeros((1439, 1458, 4), dtype=np.uint8)
        yy, xx = np.mgrid[0:1439, 0:1458]
        lon = (xx - b) / a
        lat = (yy - d) / c
        inside = np.array([P.point_in_polygon(la, lo, poly) for la, lo in zip(lat[::4, ::4].ravel(), lon[::4, ::4].ravel())]).reshape(lat[::4, ::4].shape)
        img[::4, ::4, 3] = np.where(inside, 255, 0)
        fit = P.georeference_browse(img, poly)
        self.assertLess(fit["rmsPx"], 4)
        self.assertAlmostEqual(fit["a"], a, delta=3)
        self.assertAlmostEqual(fit["c"], c, delta=3)
        self.assertAlmostEqual(fit["aspect"], fit["expectedAspect"], delta=0.02)

    def test_browse_colour_inverts_to_phase(self):
        """A twilight-coloured wrapped phase field must come back as the same phase."""
        import matplotlib

        yy, xx = np.mgrid[0:120, 0:160]
        truth = np.mod(np.hypot(xx - 80, yy - 60) / 25.0, 1.0)            # concentric fringes, cycles
        rgba = (matplotlib.colormaps["twilight"](truth) * 255).astype(np.uint8)
        phase, conf = P.browse_to_phase(rgba)
        ok = conf > 0.5
        self.assertGreater(ok.mean(), 0.9)
        # Each frame is referenced to its own circular mean, so compare after removing a constant.
        d = np.angle(np.exp(2j * np.pi * (phase - truth)))[ok]
        d = np.angle(np.exp(1j * (d - np.angle(np.mean(np.exp(1j * d))))))
        self.assertLess(np.percentile(np.abs(d), 95) / (2 * np.pi), 0.02, "phase should match to within 2% of a cycle")

    def test_phase_frames_sum_like_interferograms(self):
        """Summed wrapped frames equal the wrapped total, which is what the web animation relies on."""
        rng = np.random.default_rng(3)
        a, b = rng.random((40, 40)), rng.random((40, 40))
        out = self.dir / "frames"
        out.mkdir(exist_ok=True)
        P.save_phase_frame(a, np.ones_like(a), out / "a.png")
        P.save_phase_frame(b, np.ones_like(b), out / "b.png")
        from PIL import Image
        ra = np.array(Image.open(out / "a.png"))[..., 0].astype(int)
        rb = np.array(Image.open(out / "b.png"))[..., 0].astype(int)
        total = np.mod(a + b, 1.0) * 256
        err = np.abs(((ra + rb) % 256) - total)
        self.assertLess(np.minimum(err, 256 - err).max(), 1.01)

    def test_end_to_end_process_and_cumulative(self):
        out = self.dir / "web-nisar"
        old = P.WEB_NISAR
        P.WEB_NISAR = out
        try:
            args = type("A", (), {"local": [str(f) for f in self.files], "min_coherence": 0.35, "no_iono": False,
                                  "all_components": False, "no_gnss": True, "width": 240})()
            P.run_process(SITE, args)
        finally:
            P.WEB_NISAR = old
        index = json.loads((out / "index.json").read_text(encoding="utf-8"))
        st = index["sites"]["test-valley"]["stacks"]["114_D_070"]
        self.assertEqual(len(st["pairs"]), 3)
        self.assertEqual([c["date"] for c in st["cumulative"]], [d.isoformat() for d in self.dates[1:]])
        for p in st["pairs"]:
            for key in ("wrapped", "los"):
                self.assertTrue((out / p[key].split("/", 1)[1]).exists())
        grid = st["cumulative"][-1]["grid"]
        raw = np.frombuffer((out / grid["file"].split("/", 1)[1]).read_bytes(), dtype="<i2").reshape(grid["height"], grid["width"])
        vals = raw[raw != grid["nodata"]]
        self.assertGreater(vals.size, 100)
        # Three 12-day pairs of a 2 cm bowl: centre ≈ 3 × 2 cm × cos(incidence) away from the satellite.
        expected_mm = -3 * 20 * LOS[2]
        self.assertAlmostEqual((vals.min() - np.median(vals)) / expected_mm, 1.0, delta=0.15)


if __name__ == "__main__":
    unittest.main(verbosity=2)
