// Shared, dependency-free evidence calculations. No thresholds here certify a
// product as accurate: comparisons describe only the stations and time span used.
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
export const rms = (values) => values.length ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : null;

export function dateMs(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === iso ? ms : null;
}

export function seriesSpan(series) {
  const origin = dateMs(series?.t0);
  const days = (series?.samples || []).filter((s) => Array.isArray(s) && isNumber(s[0])).map((s) => s[0]);
  if (origin === null || !days.length) return null;
  const iso = (d) => new Date(origin + d * 864e5).toISOString().slice(0, 10);
  return { start: iso(Math.min(...days)), end: iso(Math.max(...days)) };
}

export function consecutiveRun(stack) {
  const processed = (stack?.pairs || []).filter((p) => p.phase);
  const source = processed.length ? processed : (stack?.browse || []).filter((p) => p.phase);
  const valid = source.filter((p) => dateMs(p.reference) !== null && dateMs(p.secondary) !== null && dateMs(p.secondary) > dateMs(p.reference));
  const unique = [...new Map(valid.map((p) => [`${p.reference}|${p.secondary}`, p])).values()];
  const sorted = unique.sort((a, b) => a.reference.localeCompare(b.reference) || a.secondary.localeCompare(b.secondary));
  let longest = [], run = [];
  for (const pair of sorted) {
    if (run.length && run[run.length - 1].secondary !== pair.reference) {
      if (run.length > longest.length) longest = run;
      run = [];
    }
    run.push(pair);
  }
  return run.length > longest.length ? run : longest;
}

export function validationSummary(check) {
  const rows = (check?.stations || []).filter((s) => isNumber(s.insarCm) && isNumber(s.gnssCm));
  if (!rows.length) return { count: 0, status: "unavailable", rmsCm: null, zeroMotionRmsCm: null, correlation: null, biasCm: null, beatsZero: null };
  const gps = rows.map((s) => s.gnssCm), radar = rows.map((s) => s.insarCm);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const x = radar.map((v) => v - mean(radar)), y = gps.map((v) => v - mean(gps));
  const den = Math.sqrt(x.reduce((s, v) => s + v * v, 0) * y.reduce((s, v) => s + v * v, 0));
  const error = rms(rows.map((s) => s.insarCm - s.gnssCm));
  const baseline = rms(gps);
  return {
    count: rows.length,
    reference: check.reference || null,
    rmsCm: error,
    zeroMotionRmsCm: baseline,
    correlation: rows.length >= 3 && den > 1e-12 ? x.reduce((s, v, i) => s + v * y[i], 0) / den : null,
    biasCm: mean(rows.map((s) => s.insarCm - s.gnssCm)),
    gnssRangeCm: Math.max(...gps) - Math.min(...gps),
    beatsZero: error < baseline,
    status: rows.length < 3 ? "insufficient" : error >= baseline ? "unresolved" : "comparison",
  };
}

export function datasetCounts(nisar) {
  let pairs = 0, processed = 0, gcovFrames = 0;
  const sites = Object.values(nisar?.sites || {});
  for (const site of sites) {
    gcovFrames += site.gcov?.frames?.length || 0;
    for (const stack of Object.values(site.stacks || {})) {
      const key = (p) => `${p.reference}|${p.secondary}`;
      pairs += new Set([...(stack.browse || []), ...(stack.pairs || [])].map(key)).size;
      processed += new Set((stack.pairs || []).map(key)).size;
    }
  }
  return { sites: sites.length, pairs, processed, gcovFrames };
}

export function fringeCycles(displacementCm, wavelengthCm) {
  if (!isNumber(displacementCm) || !isNumber(wavelengthCm) || wavelengthCm <= 0) return null;
  return Math.abs(displacementCm) / (wavelengthCm / 2);
}

export function buildObservationReport({ event, site, series = [], stackId, mode = "nisar", now = new Date() }) {
  const selectedId = stackId && site?.stacks?.[stackId] ? stackId : Object.keys(site?.stacks || {})[0];
  const stack = site?.stacks?.[selectedId];
  const chain = consecutiveRun(stack);
  const processed = !!stack?.pairs?.some((p) => p.phase);
  const span = chain.length ? { start: chain[0].reference, end: chain[chain.length - 1].secondary } : null;
  const temporal = series.map((s) => {
    const dates = seriesSpan(s);
    return { station: s.station, source: s.source, dates, overlapsRadarWindow: !!(span && dates && dates.start <= span.end && dates.end >= span.start), coversFullRadarWindow: !!(span && dates && dates.start <= span.start && dates.end >= span.end), role: "Bundled context; overlap alone is not independent validation of this scene." };
  });
  return {
    schema: "fringe.observation-report/1",
    generatedAt: now.toISOString(),
    site: { id: event.id, name: event.name, region: event.region, center: [event.lat, event.lon] },
    selectedView: mode,
    radar: {
      stack: selectedId || null, direction: stack?.direction || null, period: span,
      collection: "NISAR_L2_GUNW_PROVISIONAL_V1", doi: "10.5067/NIL1GUNW-P1", maturity: "Provisional",
      representation: processed ? "LOS derived from full GUNW; residual atmospheric and other errors remain." : "Qualitative browse preview; no validated displacement estimate.",
      pairs: chain.map((p) => ({ granule: p.granule, reference: p.reference, secondary: p.secondary, intervalDays: (dateMs(p.secondary) - dateMs(p.reference)) / 864e5, wavelengthCm: p.wavelengthCm ?? null, ionosphereCorrected: p.ionosphereCorrected ?? false, minCoherence: p.minCoherence ?? null, validFraction: p.validFraction ?? null, referencing: p.referencing || "browse phase referenced to a circular mean" })),
      animation: "Between acquisition dates, the animation is an interpolation, not a new satellite observation.",
    },
    comparison: processed ? { ...validationSummary(stack.cumulativeGnss), publishedSummary: stack.cumulativeGnss || null, scope: "Station-to-reference LOS differences over this time span; shared reference errors are correlated. The zero-motion baseline predicts 0 cm for these same differences. No automatic accuracy certification." } : { status: "unavailable", scope: "No quantitative GNSS comparison for this browse stack." },
    bundledGnss: temporal,
    backscatter: site?.gcov ? { collection: "NISAR_L2_GCOV_PROVISIONAL_V1", representation: "HH/HV browse colour composite, qualitative; no validated flood or crop classification.", frames: site.gcov.frames.map((f) => ({ date: f.date, granule: f.granule, image: f.file })) } : null,
    coastalScenario: event.coast ? { baselineYear: 2026, assumption: "Illustrative constant-rate extrapolation of cited historical rates, not a flood forecast or a new NISAR measurement.", places: event.coast.places, source: event.coast.source } : null,
    limitations: [
      "Wrapped radar phase includes ground motion, atmosphere and processing errors; one look direction does not uniquely separate vertical and horizontal motion.",
      "A missing or masked pixel means unknown, not zero change. Browse confidence is not the product's measured coherence.",
      "Historical GNSS or published rates are context unless the time, location and reference match the actual comparison.",
      "This explorer supports education and investigation; its previews are not operational hazard warnings.",
    ],
    sources: [
      { title: "NISAR data search (ASF)", url: "https://search.asf.alaska.edu/#/?dataset=NISAR" },
      { title: "NISAR GUNW user guide", url: "https://nisar-docs.asf.alaska.edu/gunw/" },
      { title: "NISAR GCOV user guide", url: "https://nisar-docs.asf.alaska.edu/gcov/" },
      { title: "Nevada Geodetic Laboratory", url: "https://geodesy.unr.edu/" },
    ],
  };
}

export function comparisonCsv(check) {
  const q = (v) => {
    const value = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v ?? "");
    return `"${value.replace(/"/g, '""')}"`;
  };
  const rows = (check?.stations || []).filter((s) => isNumber(s.insarCm) && isNumber(s.gnssCm));
  return [
    ["station", "reference_station", "nisar_relative_los_cm", "gnss_relative_los_cm", "residual_cm"],
    ...rows.map((s) => [s.station, check.reference, s.insarCm, s.gnssCm, Number((s.insarCm - s.gnssCm).toFixed(6))]),
  ].map((r) => r.map(q).join(",")).join("\r\n");
}

export function downloadFile(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
