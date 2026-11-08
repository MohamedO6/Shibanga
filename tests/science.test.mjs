import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dateMs, seriesSpan, consecutiveRun, validationSummary, datasetCounts, fringeCycles, buildObservationReport, comparisonCsv } from "../science.js";

const json = async (file) => JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
const index = await json("../data/nisar/index.json");
const alx2 = await json("../data/gnss/nile-delta-ALX2.json");
const central = index.sites["central-valley"].stacks["114_D_070"];
const pair = (reference, secondary, extra = {}) => ({ reference, secondary, phase: "frame.png", ...extra });

test("dates reject calendar rollover, not just an ISO-looking string", () => {
  assert.equal(dateMs("2026-02-30"), null);
  assert.equal(dateMs("2026-13-01"), null);
  assert.equal(dateMs("2026-1-01"), null);
  assert.equal(dateMs(null), null);
  assert.notEqual(dateMs("2024-02-29"), null);
});

test("ALX2 is historical context ending before the 2026 imagery", () => {
  assert.deepEqual(seriesSpan(alx2), { start: "2014-01-01", end: "2024-12-04" });
});

test("series dates do not depend on sample order or the first valid row", () => {
  assert.deepEqual(seriesSpan({ t0: "2026-01-01", samples: [[12, 0], [null], [0, 0], [6, 0]] }), { start: "2026-01-01", end: "2026-01-13" });
  assert.equal(seriesSpan({ t0: "bad", samples: [[0]] }), null);
});

test("choose a continuous chain without inventing observations across a gap", () => {
  const stack = { browse: [pair("2026-01-25", "2026-02-06"), pair("2026-01-01", "2026-01-13"), pair("2026-02-06", "2026-02-18")] };
  const before = JSON.stringify(stack);
  assert.deepEqual(consecutiveRun(stack).map((p) => p.reference), ["2026-01-25", "2026-02-06"]);
  assert.equal(JSON.stringify(stack), before);
});

test("invalid and duplicate pairs do not create phantom observations", () => {
  assert.equal(consecutiveRun({ browse: [pair("1960-01-01", "bad"), pair("2026-01-01", "2026-01-13"), pair("2026-01-01", "2026-01-13")] }).length, 1);
});

test("processed pairs take precedence over their browse representations", () => {
  const p = pair("2026-01-01", "2026-01-13", { granule: "processed" });
  assert.equal(consecutiveRun({ pairs: [p], browse: [pair("2026-01-01", "2026-01-13", { granule: "browse" })] })[0].granule, "processed");
});

test("a processed representation is not counted as another satellite pair", () => {
  assert.deepEqual(datasetCounts(index), { sites: 9, pairs: 93, processed: 9, gcovFrames: 9 });
});

test("recompute the real residuals and zero-motion baseline from station rows", () => {
  const v = validationSummary(central.cumulativeGnss);
  assert.equal(v.count, 9);
  assert.ok(Math.abs(v.rmsCm - 3.06) < .01);
  assert.ok(Math.abs(v.zeroMotionRmsCm - .4260412082) < 1e-8);
  assert.ok(Math.abs(v.correlation - .07) < .01);
  assert.equal(v.status, "unresolved");
  assert.equal(v.beatsZero, false);
});

test("a low absolute RMS does not certify accuracy when zero predicts better", () => {
  const v = validationSummary({ stations: [1, 2, 3].map((a) => ({ insarCm: a * .1, gnssCm: a * .01 })) });
  assert.equal(v.status, "unresolved");
  assert.ok(v.rmsCm < 1);
});

test("no stations, too few stations and constant signals have explicit outcomes", () => {
  assert.equal(validationSummary().status, "unavailable");
  assert.equal(validationSummary({ stations: [{ insarCm: 1, gnssCm: 1 }] }).status, "insufficient");
  const v = validationSummary({ stations: [1, 2, 3].map(() => ({ insarCm: 1, gnssCm: 1 })) });
  assert.equal(v.correlation, null);
  assert.equal(v.status, "comparison");
});

test("nulls and strings are not converted into zero-valued measurements", () => {
  assert.equal(validationSummary({ stations: [{ insarCm: null, gnssCm: 0 }, { insarCm: "1", gnssCm: 2 }] }).count, 0);
});

test("a positive station comparison remains a comparison, not certification", () => {
  const v = validationSummary({ stations: [1, 2, 3].map((v) => ({ insarCm: v, gnssCm: v })) });
  assert.equal(v.status, "comparison");
  assert.equal(v.rmsCm, 0);
  assert.equal(v.correlation, 1);
});

test("two L-band cycles are 23.8 cm LOS; shorter wavelength creates more cycles", () => {
  assert.equal(fringeCycles(23.8, 23.8), 2);
  assert.equal(fringeCycles(-23.8, 23.8), 2);
  assert.ok(fringeCycles(23.8, 5.55) > 8);
  assert.equal(fringeCycles(1, 0), null);
});

test("a Nile Delta report keeps historical GNSS separate from radar validation", () => {
  const report = buildObservationReport({ event: { id: "nile-delta", name: "Nile Delta", lat: 31.2, lon: 31.5 }, site: index.sites["nile-delta"], series: [alx2], stackId: "007_D_073", now: new Date("2026-11-07T00:00:00Z") });
  assert.equal(report.comparison.status, "unavailable");
  assert.equal(report.bundledGnss[0].overlapsRadarWindow, false);
  assert.equal(report.bundledGnss[0].coversFullRadarWindow, false);
  assert.match(report.radar.representation, /Qualitative/);
  assert.equal(report.backscatter.frames.length, 9);
  assert.equal(report.generatedAt, "2026-11-07T00:00:00.000Z");
  assert.ok(report.radar.pairs.every((p) => p.intervalDays > 0));
});

test("a Central Valley report carries residuals, provenance and all station samples", () => {
  const report = buildObservationReport({ event: { id: "central-valley" }, site: index.sites["central-valley"], stackId: "114_D_070" });
  assert.equal(report.comparison.status, "unresolved");
  assert.equal(report.comparison.publishedSummary.stations.length, 9);
  assert.equal(report.radar.pairs.length, 9);
  assert.ok(report.radar.pairs.every((p) => p.granule && p.wavelengthCm));
});

test("station CSV exports all rows and protects spreadsheet formula-like identifiers", () => {
  const csv = comparisonCsv({ reference: "REF", stations: [{ station: '=HYPERLINK("x")', insarCm: -1, gnssCm: .25 }] });
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"-1.25"/);
  assert.equal(comparisonCsv(central.cumulativeGnss).split("\r\n").length, 10);
});

test('continuous animation retains a longer chain when date paths branch',()=>{
 const p=(a,b)=>pair(`2026-01-${a}`,`2026-01-${b}`);
 const run=consecutiveRun({browse:[p('01','03'),p('01','02'),p('02','04'),p('03','05'),p('04','05'),p('05','06')]});
 assert.equal(run.length,4);assert.deepEqual(run.map((p)=>p.reference),['2026-01-01','2026-01-02','2026-01-04','2026-01-05']);
});
