"""Scientific regression checks: scaling, QA, shared support and honest statistics."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))
from season_check import ndvi_from_raw, rank_correlation, block_values, spatial_summary, select_candidates, analyse

PLAN = json.loads((PIPELINE / 'season_check_plan.json').read_text())


class SeasonScienceTests(unittest.TestCase):
    def ndvi(self, red=10000, nir=20000, qa=0, saturation=0, aerosol=0):
        return ndvi_from_raw(*[np.array([a], dtype=np.uint16) for a in [red,nir,qa,saturation,aerosol]],PLAN)[0]

    def test_reflectance_offset_is_applied_before_ndvi(self):
        self.assertAlmostEqual(float(self.ndvi()),(.35-.075)/(.35+.075),places=6)
        self.assertNotAlmostEqual(float(self.ndvi()),(20000-10000)/(20000+10000),places=3)

    def test_every_bad_pixel_bit_is_excluded(self):
        for bit in [0,1,2,3,4,5]:self.assertTrue(np.isnan(self.ndvi(qa=1<<bit)))
        self.assertTrue(np.isfinite(self.ndvi(qa=1<<7)))  # Water flag alone is not a cloud flag.

    def test_saturation_and_terrain_occlusion(self):
        for bit in [3,4,11]:self.assertTrue(np.isnan(self.ndvi(saturation=1<<bit)))
        self.assertTrue(np.isfinite(self.ndvi(saturation=1<<0)))

    def test_aerosol_and_missing_reflectance(self):
        self.assertTrue(np.isnan(self.ndvi(aerosol=3<<6)))
        self.assertTrue(np.isfinite(self.ndvi(aerosol=2<<6)))
        self.assertTrue(np.isnan(self.ndvi(aerosol=1)))
        self.assertTrue(np.isnan(self.ndvi(red=0)))
        self.assertTrue(np.isnan(self.ndvi(red=5000)))  # Negative scaled red reflectance.

    def test_rank_correlation_does_not_invent_zero_for_unknown(self):
        self.assertIsNone(rank_correlation([1,1,1],[2,3,4]))
        self.assertIsNone(rank_correlation([1,2],[3,4]))
        self.assertEqual(rank_correlation([1,2,3],[6,4,2]),-1)

    def test_common_pixels_prevent_clouds_from_changing_the_sample(self):
        cube=np.array([[[1.,100.],[2.,100.]],[[3.,np.nan],[4.,np.nan]]])
        common=np.all(np.isfinite(cube),axis=0)
        values=block_values(cube,common,2,.5)
        np.testing.assert_allclose(values,[[1.5],[3.5]])
        self.assertEqual(block_values(cube,common,2,.75).shape,(2,0))

    def test_spatial_bootstrap_is_reproducible_and_not_temporal(self):
        values=np.stack([np.arange(20),np.arange(20)+1]).astype(float)
        a,ci=spatial_summary(values,PLAN);b,cj=spatial_summary(values,PLAN)
        np.testing.assert_array_equal(ci,cj);np.testing.assert_array_equal(a,b)
        np.testing.assert_allclose(ci[:,1]-ci[:,0],[1,1])

    def test_date_selection_is_frozen_and_does_not_reuse_an_acquisition(self):
        item=lambda name,date:{'id':name,'properties':{'datetime':date+'T08:00:00Z'}}
        items=[item('later','2026-07-09'),item('earlier','2026-07-01'),item('too-far','2026-06-30')]
        candidates=select_candidates(items,'2026-07-05',set(),4)
        self.assertEqual([r['id'] for r in candidates],['earlier','later'])
        self.assertEqual([r['id'] for r in select_candidates(items,'2026-07-05',{'2026-07-01'},4)],['later'])

    def test_insufficient_support_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Insufficient planned support'):
            analyse({},[],np.zeros((2,4,4)),PLAN)

    def test_published_results_match_their_inputs_and_frozen_rules(self):
        root=PIPELINE.parent
        p=root/'data/nisar/nile-delta/season-check.json'
        if not p.is_file():self.skipTest('Run the optical analysis before checking its published result')
        d=json.loads(p.read_text());r=d['results'];rows=r['rows']
        self.assertEqual(d['analysisPlanSha256'],hashlib.sha256((PIPELINE/'season_check_plan.json').read_bytes()).hexdigest())
        radar_path=root/PLAN['radarSource']
        self.assertEqual(d['radarSourceSha256'],hashlib.sha256(radar_path.read_bytes()).hexdigest())
        radar={r['date']:r for r in json.loads(radar_path.read_text())['dates']}
        self.assertEqual(len({r['opticalDate'] for r in rows}),len(rows))
        self.assertEqual(len(rows),r['matchedDates'])
        for row in rows:
            self.assertLessEqual(abs(row['lagDays']),PLAN['maxDateGapDays'])
            self.assertGreaterEqual(row['clearFraction'],PLAN['minClearFractionPerScene'])
            self.assertEqual(row['hvDb'],radar[row['radarDate']]['hvDb'])
            self.assertLessEqual(row['ndviSpatialCi95'][0],row['ndvi'])
            self.assertGreaterEqual(row['ndviSpatialCi95'][1],row['ndvi'])
        # Independent no-tie rank formula rather than calling the pipeline's statistic.
        def ranks(v):return np.argsort(np.argsort(v)).astype(float)+1
        x,y=ranks([s['hvDb'] for s in rows]),ranks([s['ndvi'] for s in rows]);n=len(rows)
        rho=1-6*float(np.sum((x-y)**2))/(n*(n*n-1))
        self.assertAlmostEqual(rho,r['hvSpearman'],places=6)


if __name__=='__main__':unittest.main()
