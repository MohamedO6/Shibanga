// Fringe core — physics, interferogram rendering and evidence verification.
// Ported from the iOS app (DeformationModel.swift, FringeRenderer.swift,
// DeformationEvent.swift, OTSProof.swift) so both clients compute the same numbers.

// ---------------------------------------------------------------------------
// Radar bands and viewing geometry
// ---------------------------------------------------------------------------

export const BANDS = {
  L: { id: "L", label: "NISAR L-band", short: "L", wavelengthCm: 23.8 },
  S: { id: "S", label: "NISAR S-band", short: "S", wavelengthCm: 9.4 },
  C: { id: "C", label: "Sentinel-1 C-band", short: "C", wavelengthCm: 5.55 },
};

/** NISAR is left-looking; ascending heading ≈ 348°, descending ≈ 192°. */
export const GEOMETRIES = {
  ascending: { id: "ascending", label: "Ascending", incidenceDeg: 37, groundToSatAzDeg: 78 },
  descending: { id: "descending", label: "Descending", incidenceDeg: 37, groundToSatAzDeg: 282 },
};

/** Unit vector from ground to satellite (east, north, up). */
export function losVector(g) {
  const th = (g.incidenceDeg * Math.PI) / 180;
  const az = (g.groundToSatAzDeg * Math.PI) / 180;
  return [Math.sin(th) * Math.sin(az), Math.sin(th) * Math.cos(az), Math.cos(th)];
}

// ---------------------------------------------------------------------------
// Analytic elastic-half-space deformation sources (displacement in metres)
// ---------------------------------------------------------------------------

/** Returns f(xKm east, yKm north) -> [east, north, up] metres. */
export function field(model) {
  switch (model.type) {
    case "mogi": {
      // Mogi (1958) point source, Poisson ratio 0.25: (1 − ν)·ΔV/π = 3ΔV/4π
      const d = Math.max(model.depthKm, 0.05) * 1000;
      const c = (3 * model.volumeKm3 * 1e9) / (4 * Math.PI);
      return (x, y) => {
        const xm = x * 1000, ym = y * 1000;
        const k = c / Math.pow(xm * xm + ym * ym + d * d, 1.5);
        return [k * xm, k * ym, k * d];
      };
    }
    case "rupture": {
      // Vertical strike-slip screw dislocation from the surface to depth, tapered along strike.
      const phi = (model.strikeDeg * Math.PI) / 180;
      const ae = Math.sin(phi), an = Math.cos(phi);
      const pe = Math.cos(phi), pn = -Math.sin(phi);
      const depth = Math.max(model.depthKm, 0.05);
      const half = model.lengthKm / 2;
      const taperWidth = Math.max(model.lengthKm * 0.12, depth);
      return (x, y) => {
        const along = x * ae + y * an;
        const perp = x * pe + y * pn;
        const taper = 0.5 * (1 - Math.tanh((Math.abs(along) - half) / taperWidth));
        const u = (model.slipM / Math.PI) * Math.atan(depth / perp) * taper;
        return [u * ae, u * an, 0];
      };
    }
    case "bowl": {
      // Aquifer-compaction bowl, elliptical Gaussian footprint; rotation from east.
      const th = (model.rotationDeg * Math.PI) / 180;
      const ct = Math.cos(th), st = Math.sin(th);
      const s2 = 2 * model.sigmaKm * model.sigmaKm;
      const asp = Math.max(model.aspect, 0.1);
      return (x, y) => {
        const xr = x * ct + y * st;
        const yr = -x * st + y * ct;
        const q = (xr * xr) / (asp * asp) + yr * yr;
        return [0, 0, -model.peakM * Math.exp(-q / s2)];
      };
    }
    case "flank": {
      const az = (model.azimuthDeg * Math.PI) / 180;
      const de = Math.sin(az), dn = Math.cos(az);
      const s2 = 2 * model.sigmaKm * model.sigmaKm;
      return (x, y) => {
        const g = model.peakM * Math.exp(-(x * x + y * y) / s2);
        return [g * de, g * dn, model.verticalRatio * g];
      };
    }
    default:
      throw new Error(`unknown model ${model.type}`);
  }
}

export function describeModel(m) {
  switch (m.type) {
    case "mogi": return `Model: a magma chamber ${fmt(m.depthKm, 1)} km deep, swelling by ${fmt(m.volumeKm3 * 1000, 1)} million m³`;
    case "rupture": return `Model: a fault ${fmt(m.lengthKm, 0)} km long slipping ${fmt(Math.abs(m.slipM), 2)} m sideways, down to ${fmt(m.depthKm, 0)} km`;
    case "bowl": return `Model: a sinking bowl ${fmt(m.peakM * 100, 0)} cm deep at its centre, about ${fmt(m.sigmaKm, 0)} km in radius`;
    case "flank": return `Model: the volcano's side sliding ${fmt(m.peakM * 100, 0)} cm toward ${fmt(m.azimuthDeg, 0)}°, about ${fmt(m.sigmaKm, 0)} km in radius`;
  }
  return "";
}

/** Scene statistics at scale 1 (displacement is linear in scale). */
export function stats(model, extentKm, geometry) {
  const f = field(model);
  const s = losVector(geometry);
  const n = 73;
  let minL = Infinity, maxL = -Infinity, peakV = 0, peakH = 0;
  for (let j = 0; j < n; j++) {
    const y = (0.5 - j / (n - 1)) * extentKm;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * extentKm;
      const u = f(x, y);
      const los = u[0] * s[0] + u[1] * s[1] + u[2] * s[2];
      if (los < minL) minL = los;
      if (los > maxL) maxL = los;
      if (Math.abs(u[2]) > Math.abs(peakV)) peakV = u[2];
      peakH = Math.max(peakH, Math.hypot(u[0], u[1]));
    }
  }
  return { minLOS: minL, maxLOS: maxL, peakVertical: peakV, peakHorizontal: peakH };
}

export function scaleStats(st, k) {
  return { minLOS: st.minLOS * k, maxLOS: st.maxLOS * k, peakVertical: st.peakVertical * k, peakHorizontal: st.peakHorizontal * k };
}

/** Colour cycles across the scene: N = ΔLOS ÷ (λ/2). */
export function fringeCount(st, wavelengthCm) {
  return (st.maxLOS - st.minLOS) / (wavelengthCm / 200);
}

// ---------------------------------------------------------------------------
// Event timing and headline numbers (DeformationEvent.swift)
// ---------------------------------------------------------------------------

export const acquisitions = (e) => Math.floor(e.windowDays / 12);

export function dayAt(e, progress) {
  const p = clamp(progress, 0, 1);
  return Math.round(p * acquisitions(e)) * 12;
}

export function scaleAt(e, progress) {
  const p = clamp(progress, 0, 1);
  if (e.coseismicDay == null) return p;
  const f = e.coseismicDay / e.windowDays;
  const t = clamp((p - (f - 0.025)) / 0.05, 0, 1);
  return t * t * (3 - 2 * t);
}

export function windowText(e) {
  if (e.windowDays >= 720) return `${fmt(e.windowDays / 365.25, 1)} yr`;
  if (e.windowDays >= 90) return `${Math.round(e.windowDays / 30.44)} mo`;
  return `${e.windowDays} days`;
}

export function motion(e, st) {
  switch (e.kind) {
    case "uplift": case "subsidence": return st.peakVertical;
    case "faultSlip": return st.peakHorizontal * 2;
    case "flank": return st.peakHorizontal;
  }
  return 0;
}

export function motionText(e, st) {
  const m = motion(e, st);
  return length(m, e.kind === "uplift" || e.kind === "subsidence");
}

export function rateText(e, fullStats) {
  const full = Math.abs(motion(e, fullStats)) * 100;
  const d = e.windowDays;
  switch (e.rateUnit) {
    case "day": return `${fmt(full / d, 2)} cm/day`;
    case "month": return `${fmt((full / d) * 30.44, 1)} cm/mo`;
    case "year": return `${fmt((full / d) * 365.25, 1)} cm/yr`;
    default: return "Coseismic";
  }
}

export function length(meters, signed) {
  const v = signed ? meters : Math.abs(meters);
  const sign = signed && v > 0.0005 ? "+" : "";
  if (Math.abs(v) >= 1) return sign + fmt(v, 2) + " m";
  return sign + fmt(v * 100, 1) + " cm";
}

export function fmt(v, digits) {
  const s = Number(v).toFixed(digits);
  return s.startsWith("-") ? "−" + s.slice(1) : s;
}

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ---------------------------------------------------------------------------
// Interferogram renderer (FringeRenderer.swift)
// ---------------------------------------------------------------------------

export const FRINGE_STOPS = [0xff4d6d, 0xffc24d, 0x7cff6b, 0x4cc9ff, 0xb48cff];

/** The fringe colour cycle as 256 RGB triples (0 to 1). Shared with the GPU renderer in gl.js. */
export const LUT = (() => {
  const stops = [...FRINGE_STOPS, FRINGE_STOPS[0]].map((h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]);
  const seg = stops.length - 1;
  const out = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 256) * seg;
    const k = Math.min(Math.floor(t), seg - 1);
    const f = t - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  return out;
})();

/** CSS gradient for one fringe cycle, used in legends. */
export const FRINGE_GRADIENT = `linear-gradient(90deg, ${[...FRINGE_STOPS, FRINGE_STOPS[0]]
  .map((h, i, a) => `#${h.toString(16).padStart(6, "0")} ${Math.round((i / (a.length - 1)) * 100)}%`)
  .join(", ")})`;

function hash(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffffff) / 0xffffff;
}

function valueNoise(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  const top = a + (b - a) * sx, bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

function fbm(x, y, s, octaves) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, (s + o * 31) | 0);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

const noiseCache = new Map();
function noiseField(res, seed) {
  const key = `${res}:${seed}`;
  if (noiseCache.has(key)) return noiseCache.get(key);
  const n = res * res;
  const aps = new Float32Array(n), grain = new Float32Array(n), terrain = new Float32Array(n);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const u = i / res, v = j / res, idx = j * res + i;
      aps[idx] = fbm(u * 2.5, v * 2.5, seed, 3) * 2 - 1;
      grain[idx] = 0.72 + 0.45 * hash(i, j, seed + 101);
      const base = fbm(u * 4 + 11, v * 4 + 7, seed + 7, 4);
      const ridge = 1 - Math.abs(fbm(u * 8, v * 8, seed + 13, 3) * 2 - 1);
      terrain[idx] = 0.03 + 0.2 * Math.pow(base, 1.4) + 0.09 * ridge * ridge;
    }
  }
  const out = { aps, grain, terrain };
  if (noiseCache.size > 24) noiseCache.clear();
  noiseCache.set(key, out);
  return out;
}

const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Renders a wrapped interferogram into `ctx` (a 2D canvas context of size res×res).
 * style "overlay": transparent outside the deforming area (for maps);
 * style "scene": full frame over synthetic dark SAR terrain (for the lab).
 */
export function renderInterferogram(ctx, req) {
  const res = req.resolution;
  const f = field(req.model);
  const s = losVector(req.geometry);
  const halfLambda = Math.max(req.wavelengthCm, 0.5) / 200;
  const noise = noiseField(res, req.seed ?? 1);
  const ext = req.extentKm, scale = req.scale, atm = (req.atmosphereCm ?? 0) / 100;
  const denom = res - 1;
  const overlay = req.style === "overlay";
  const img = ctx.createImageData(res, res);
  const px = img.data;
  const byte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0);

  for (let j = 0; j < res; j++) {
    const fy = j / denom, y = (0.5 - fy) * ext, ny = (fy - 0.5) * 2;
    for (let i = 0; i < res; i++) {
      const fx = i / denom, x = (fx - 0.5) * ext, nx = (fx - 0.5) * 2;
      const idx = j * res + i;
      const u = f(x, y);
      const losModel = (u[0] * s[0] + u[1] * s[1] + u[2] * s[2]) * scale;
      const cycles = (losModel + noise.aps[idx] * atm) / halfLambda;
      const frac = cycles - Math.floor(cycles);
      const li = Math.min(255, Math.max(0, (frac * 256) | 0)) * 3;
      const grain = noise.grain[idx];
      const rn = Math.sqrt(nx * nx + ny * ny);
      const strength = smoothstep(0.03, 0.28, Math.abs(losModel) / halfLambda);
      const p = idx * 4;
      if (overlay) {
        const a = strength * (1 - smoothstep(0.6, 0.98, rn)) * 0.94;
        px[p] = byte(LUT[li] * grain);
        px[p + 1] = byte(LUT[li + 1] * grain);
        px[p + 2] = byte(LUT[li + 2] * grain);
        px[p + 3] = byte(a);
      } else {
        const t = noise.terrain[idx] * grain;
        const edge = 1 - smoothstep(0.78, 1.25, rn) * 0.75;
        const mix = (0.1 + 0.82 * strength) * edge;
        px[p] = byte(t * 0.86 * (1 - mix) + LUT[li] * grain * mix);
        px[p + 1] = byte(t * 0.95 * (1 - mix) + LUT[li + 1] * grain * mix);
        px[p + 2] = byte(t * (1 - mix) + LUT[li + 2] * grain * mix);
        px[p + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Fast animation path: displacement is linear in time, so everything except the
// scale factor is precomputed once per scene and each frame is a colour lookup.
// ---------------------------------------------------------------------------

const preparedCache = new Map();

export function prepareScene({ model, extentKm, geometry, resolution, seed = 1 }) {
  const key = JSON.stringify([model, extentKm, geometry.incidenceDeg, geometry.groundToSatAzDeg, resolution, seed]);
  const hit = preparedCache.get(key);
  if (hit) return hit;
  const res = resolution;
  const f = field(model);
  const s = losVector(geometry);
  const noise = noiseField(res, seed);
  const n = res * res;
  const los = new Float32Array(n), edgeO = new Float32Array(n), edgeS = new Float32Array(n);
  const denom = res - 1;
  for (let j = 0; j < res; j++) {
    const fy = j / denom, y = (0.5 - fy) * extentKm, ny = (fy - 0.5) * 2;
    for (let i = 0; i < res; i++) {
      const fx = i / denom, x = (fx - 0.5) * extentKm, nx = (fx - 0.5) * 2;
      const idx = j * res + i;
      const u = f(x, y);
      los[idx] = u[0] * s[0] + u[1] * s[1] + u[2] * s[2];
      const rn = Math.sqrt(nx * nx + ny * ny);
      edgeO[idx] = 1 - smoothstep(0.6, 0.98, rn);
      edgeS[idx] = 1 - smoothstep(0.78, 1.25, rn) * 0.75;
    }
  }
  const out = { res, los, edgeO, edgeS, noise, img: null };
  if (preparedCache.size > 80) preparedCache.clear();
  preparedCache.set(key, out);
  return out;
}

/** Same output as renderInterferogram, from a prepared scene. */
export function renderPrepared(ctx, p, { scale, wavelengthCm, atmosphereCm = 0, style = "overlay" }) {
  const res = p.res, n = res * res;
  if (!p.img || p.img.width !== res) p.img = ctx.createImageData(res, res);
  const px = p.img.data;
  const inv = 200 / Math.max(wavelengthCm, 0.5); // 1 / (λ/2) in 1/m
  const atm = atmosphereCm / 100;
  const { los, edgeO, edgeS } = p;
  const { aps, grain, terrain } = p.noise;
  const overlay = style === "overlay";
  for (let idx = 0; idx < n; idx++) {
    const lm = los[idx] * scale;
    const cycles = (lm + aps[idx] * atm) * inv;
    const li = (((cycles - Math.floor(cycles)) * 256) | 0) * 3;
    let t = (Math.abs(lm) * inv - 0.03) / 0.25;
    t = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const g = grain[idx];
    const q = idx * 4;
    if (overlay) {
      const a = t * edgeO[idx] * 0.94;
      px[q] = LUT[li] * g * 255;
      px[q + 1] = LUT[li + 1] * g * 255;
      px[q + 2] = LUT[li + 2] * g * 255;
      px[q + 3] = a * 255;
    } else {
      const tr = terrain[idx] * g;
      const m = (0.1 + 0.82 * t) * edgeS[idx];
      px[q] = (tr * 0.86 * (1 - m) + LUT[li] * g * m) * 255;
      px[q + 1] = (tr * 0.95 * (1 - m) + LUT[li + 1] * g * m) * 255;
      px[q + 2] = (tr * (1 - m) + LUT[li + 2] * g * m) * 255;
      px[q + 3] = 255;
    }
  }
  ctx.putImageData(p.img, 0, 0);
}

// ---------------------------------------------------------------------------
// Real NISAR phase stacks (frames written by pipeline/nisar_pipeline.py).
// Wrapped phases add exactly modulo one cycle, so the running sum of consecutive
// 12-day pairs is the interferogram from the first date to each later date, and
// interpolating inside a pair moves the real fringes smoothly through time.
// ---------------------------------------------------------------------------

/** True on a developer's machine, where files change under the same name and must be re-checked. */
export const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname ?? "");

async function decodeFrame(url) {
  const res = await fetch(url, DEV ? { cache: "no-cache" } : undefined);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const n = bmp.width * bmp.height;
  const phase = new Int8Array(n);   // signed: shortest rotation when interpolating
  const conf = new Uint8Array(n);
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    const p = px[q];
    phase[i] = p >= 128 ? p - 256 : p;
    conf[i] = px[q + 1];
  }
  return { w: bmp.width, h: bmp.height, phase, conf };
}

export async function loadPhaseStack(urls) {
  const frames = await Promise.all(urls.map(decodeFrame));
  const { w, h } = frames[0];
  const n = w * h;
  const cum = [new Uint8Array(n)];
  const cumConf = [new Uint8Array(n).fill(255)];
  for (const f of frames) {
    const prev = cum[cum.length - 1], prevC = cumConf[cumConf.length - 1];
    const next = new Uint8Array(n), nextC = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      next[i] = (prev[i] + f.phase[i]) & 255;
      nextC[i] = prevC[i] < f.conf[i] ? prevC[i] : f.conf[i];
    }
    cum.push(next);
    cumConf.push(nextC);
  }
  return { w, h, pairs: frames.length, frames, cum, cumConf, img: null };
}

/** Draws the stack at time t (0 … pairs, in pairs) with Fringe's colour cycle. */
export function renderPhaseStack(ctx, s, t) {
  const tt = clamp(t, 0, s.pairs);
  const k = Math.min(Math.floor(tt), s.pairs - 1);
  const f = tt - k;
  const base = s.cum[k], baseC = s.cumConf[k];
  const step = s.frames[k].phase, stepC = s.frames[k].conf;
  const fade = smoothstep(0, 0.7, tt) * 0.94;
  const n = s.w * s.h;
  if (!s.img) s.img = ctx.createImageData(s.w, s.h);
  const px = s.img.data;
  for (let i = 0, q = 0; i < n; i++, q += 4) {
    let ph = base[i] + f * step[i];
    ph -= Math.floor(ph / 256) * 256;
    const li = (ph | 0) * 3;
    const c = baseC[i] < stepC[i] ? baseC[i] : stepC[i];
    px[q] = LUT[li] * 255;
    px[q + 1] = LUT[li + 1] * 255;
    px[q + 2] = LUT[li + 2] * 255;
    px[q + 3] = c * fade;
  }
  ctx.putImageData(s.img, 0, 0);
}

/** Wrapped phase (cycles, 0–1) and confidence (0–1) of a stack pixel at time t. */
export function phaseAt(s, t, i) {
  const tt = clamp(t, 0, s.pairs);
  const k = Math.min(Math.floor(tt), s.pairs - 1);
  let ph = s.cum[k][i] + (tt - k) * s.frames[k].phase[i];
  ph -= Math.floor(ph / 256) * 256;
  return { cycles: ph / 256, conf: Math.min(s.cumConf[k][i], s.frames[k].conf[i]) / 255 };
}

// ---------------------------------------------------------------------------
// Mission clock (MissionClock.swift): modeled NISAR passes when no real orbit
// data is bundled for a site. Deterministic FNV-1a slots, dawn/dusk local time.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function stableHash(str) {
  let h = 0xcbf29ce484222325n;
  const mask = (1n << 64n) - 1n;
  for (const b of new TextEncoder().encode(str)) h = ((h ^ BigInt(b)) * 0x100000001b3n) & mask;
  return Number(h % 4827906307n);
}

export function modeledPasses(event, now = Date.now(), count = 3) {
  const anchor = Date.UTC(2026, 7, 1);
  const repeat = 12 * DAY_MS;
  const slots = (asc, localHour) => {
    const key = event.id + (asc ? "|asc" : "|dsc");
    const slot = stableHash(key) % 12;
    let utcHour = (localHour - event.lon / 15) % 24;
    if (utcHour < 0) utcHour += 24;
    const jitter = (stableHash(key + "|min") % 44) - 22;
    const offset = slot * DAY_MS + utcHour * 3_600_000 + jitter * 60_000;
    const cycle = Math.max(0, Math.floor((now - anchor) / repeat));
    const out = [];
    for (let k = cycle; k <= cycle + 2 && out.length < 2; k++) {
      const date = anchor + k * repeat + offset;
      if (date >= now - 28_000) out.push({ date, ascending: asc, modeled: true });
    }
    return out;
  };
  return [...slots(true, 6), ...slots(false, 18)].sort((a, b) => a.date - b.date).slice(0, count);
}

export function countdown(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400);
  const hms = [Math.floor((t % 86400) / 3600), Math.floor((t % 3600) / 60), t % 60].map((v) => String(v).padStart(2, "0")).join(":");
  return d > 0 ? `${d}d ${hms}` : hms;
}

/** Modeled displacement at a map point (km from the scene centre). */
export function probe(model, geometry, xKm, yKm, scale) {
  const u = field(model)(xKm, yKm).map((v) => v * scale);
  const s = losVector(geometry);
  return { east: u[0], north: u[1], up: u[2], los: u[0] * s[0] + u[1] * s[1] + u[2] * s[2] };
}

// ---------------------------------------------------------------------------
// SHA-256 (synchronous; needed while walking OpenTimestamps commitment ops)
// ---------------------------------------------------------------------------

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(bytes) {
  const len = bytes.length;
  const padded = (((len + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(padded);
  m.set(bytes);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(padded - 8, Math.floor((len * 8) / 0x100000000));
  dv.setUint32(padded - 4, (len * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

// ---------------------------------------------------------------------------
// OpenTimestamps proof parsing (OTSProof.swift) + Merkle-root extraction
// ---------------------------------------------------------------------------

const OTS_MAGIC = [0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
  0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94, 0x01];
const PENDING_TAG = "83dfe30d2ef90c8e";
const BITCOIN_TAG = "0588960d73d71901";

const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };

/**
 * Parses an .ots proof. Returns { digest, attestations: [{kind:"pending", uri} |
 * {kind:"bitcoin", height, merkleRoot}] }, where merkleRoot is the attested message
 * in block-explorer (reversed) byte order — the value a Bitcoin block header must contain.
 */
export function parseOTS(bytes) {
  if (bytes.length <= OTS_MAGIC.length + 32 || OTS_MAGIC.some((b, i) => bytes[i] !== b)) throw new Error("not an OpenTimestamps proof");
  if (bytes[OTS_MAGIC.length] !== 0x08) throw new Error("unsupported file hash op");
  const digest = bytes.slice(OTS_MAGIC.length + 1, OTS_MAGIC.length + 33);
  const pos = { v: OTS_MAGIC.length + 33 };
  const end = bytes.length;
  const out = [];

  const varint = (d, p, e) => {
    let value = 0, mul = 1;
    for (;;) {
      if (p.v >= e || mul > 2 ** 56) throw new Error("truncated proof");
      const b = d[p.v++];
      value += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return value;
      mul *= 128;
    }
  };
  const varbytes = (d, p, e) => {
    const n = varint(d, p, e);
    if (n > e - p.v) throw new Error("truncated proof");
    const v = d.slice(p.v, p.v + n);
    p.v += n;
    return v;
  };
  const attestation = () => {
    if (end - pos.v < 8) throw new Error("truncated proof");
    const tag = hex(bytes.slice(pos.v, pos.v + 8));
    pos.v += 8;
    const payload = varbytes(bytes, pos, end);
    const p = { v: 0 };
    return { tag, payload, p };
  };
  const timestamp = (msg, depth) => {
    if (depth > 512) throw new Error("proof too deep");
    for (;;) {
      if (pos.v >= end) throw new Error("truncated proof");
      let tag = bytes[pos.v++];
      const final = tag !== 0xff;
      if (!final) {
        if (pos.v >= end) throw new Error("truncated proof");
        tag = bytes[pos.v++];
      }
      if (tag === 0x00) {
        const a = attestation();
        if (a.tag === PENDING_TAG) {
          out.push({ kind: "pending", uri: new TextDecoder().decode(varbytes(a.payload, a.p, a.payload.length)) });
        } else if (a.tag === BITCOIN_TAG) {
          out.push({ kind: "bitcoin", height: varint(a.payload, a.p, a.payload.length), merkleRoot: hex(msg.slice().reverse()) });
        }
      } else if (tag === 0xf0) {
        const arg = varbytes(bytes, pos, end);
        timestamp(concat(msg, arg), depth + 1);
      } else if (tag === 0xf1) {
        const arg = varbytes(bytes, pos, end);
        timestamp(concat(arg, msg), depth + 1);
      } else if (tag === 0x08) {
        timestamp(sha256(msg), depth + 1);
      } else {
        throw new Error(`unsupported op 0x${tag.toString(16)}`);
      }
      if (final) return;
    }
  };
  timestamp(digest, 0);
  if (!out.length) throw new Error("proof has no attestations");
  return { digest: hex(digest), attestations: out };
}

// ---------------------------------------------------------------------------
// Event catalogue (EventCatalog.swift)
// ---------------------------------------------------------------------------

export const EVENTS = [
  {
    id: "central-valley", name: "Central Valley", region: "California", episode: "Drought subsidence", kind: "subsidence",
    lat: 36.10, lon: -119.56, model: { type: "bowl", peakM: 0.30, sigmaKm: 16, aspect: 2.2, rotationDeg: -50 },
    extentKm: 140, geometry: "ascending", windowDays: 180, rateUnit: "month", coseismicDay: null, seed: 71,
    driver: "Groundwater pumping during drought",
    headline: "Farms pumped so hard in the drought that the valley floor dropped.",
    story: "When surface water ran short in the 2012-2016 drought, growers drilled deeper wells. As the aquifers drained, the clay layers between them compacted for good. That permanently shrank underground water storage and buckled the canals that carry California's water. NASA radar caught some spots sinking nearly 5 cm a month.",
    facts: [
      ["~5 cm/mo", "Peak sinking during the 2014-2015 drought (\"nearly 2 inches per month\")", "NASA JPL, Farr et al., 2015"],
      ["> 300 mm/yr", "Peak sinking near Corcoran, Jan 2015 to Sep 2016", "NASA JPL / CA Dept. of Water Resources, InSAR"],
      ["−54 cm", "Ground drop measured by GNSS station CRCN in Corcoran over the same period, compared with −6 to −8 cm at P304 and P307, about 100 km to the northwest", "Nevada Geodetic Lab, IGS20 daily solutions"],
      ["2014", "SGMA, the California law that makes groundwater basins stop overpumping", "CA Sustainable Groundwater Management Act"],
    ],
  },
  {
    id: "nile-delta", name: "Nile Delta", region: "Egypt", episode: "Coastal subsidence", kind: "subsidence",
    lat: 31.25, lon: 31.62, model: { type: "bowl", peakM: 0.055, sigmaKm: 14, aspect: 2.0, rotationDeg: 45 },
    extentKm: 100, geometry: "ascending", windowDays: 1826, rateUnit: "year", coseismicDay: null, seed: 61,
    driver: "Groundwater pumping and a mud-starved delta, while the sea rises",
    coast: {
      intro: "On the delta coast the land is sinking while the Mediterranean rises, so the two add up.",
      source: "sea 3.4 mm a year from satellite altimetry, land sinking from Sentinel-1 radar; Hassan et al., 2025",
      places: [
        { name: "Damietta", relMmYr: 14.4, how: "Sea +3.4 mm a year, land sinking 11 mm a year" },
        { name: "Port Said", relMmYr: 9.7, how: "Sea +3.4 mm a year, land sinking 6.3 mm a year" },
        { name: "Alexandria", relMmYr: 5.0, how: "Sea +3.4 mm a year, land sinking 1.6 mm a year" },
      ],
    },
    gcovNote: "Over the delta you can watch the summer rice season. Egypt plants its rice in May and harvests from September (FAO). The farmland in the west of this scene turns pink through August, while the paddies are flooded under growing plants, and fades again by October.",
    headline: "Egypt's most crowded land is sinking while the Mediterranean rises.",
    story: "More than 40% of Egypt's people live on the Nile Delta, and over half of the country's farmland is here. Its northern edge is only about a metre above the sea. Since the Aswan High Dam was finished in 1970, the Nile carries very little mud down to build the delta up, while growing cities pump groundwater and press down on soft river clay. Sentinel-1 radar from 2014 to 2019 found Damietta sinking about 11 mm a year and Mansoura about 9 mm, while satellites measured the sea off the coast rising 3.4 mm a year. On the Alexandria coast, rising salty groundwater is weakening old foundations, and building collapses have jumped from about one a year to about 40 a year.",
    facts: [
      ["−11 ± 0.6 mm/yr", "Sinking at Damietta, Sentinel-1 radar checked against GPS, 2014 to 2019", "Hassan et al., 2025, Scientific Reports"],
      ["−9.7 ± 1.3 mm/yr", "Sinking at GPS station MNSO in Mansoura", "Hassan et al., 2025, Scientific Reports"],
      ["3.4 ± 0.5 mm/yr", "Sea-level rise off the delta coast, satellite altimetry 1993 to 2019", "Hassan et al., 2025, Scientific Reports"],
      ["~40 a year", "Building collapses on the Alexandria coast in the last decade, up from about one a year", "Fouad et al., 2025, Earth's Future"],
      ["~2,400 km²", "Delta land that could flood within 100 years in the study's worst case", "Hassan et al., 2025, Scientific Reports"],
    ],
  },
  {
    id: "norfolk", name: "Norfolk", region: "Virginia, USA", episode: "Coastal subsidence", kind: "subsidence",
    lat: 36.89, lon: -76.29, model: { type: "bowl", peakM: 0.019, sigmaKm: 9, aspect: 1.7, rotationDeg: -25 },
    extentKm: 60, geometry: "ascending", windowDays: 1584, rateUnit: "year", coseismicDay: null, seed: 97,
    driver: "Groundwater pumping + glacial rebound, compounding sea-level rise",
    headline: "The sea is rising while the land sinks, and Norfolk gets both at once.",
    story: "Hampton Roads is one of the US metro areas most exposed to sea-level rise, and part of the exposure is the land itself. Sentinel-1 radar from 2015 to 2019 found Norfolk sinking about 4.4 mm a year on average, with hot spots near the waterfront. Half or more of the region's relative sea-level rise (4.84 mm a year at the Sewells Point tide gauge since 1927) comes from the ground going down, driven by groundwater pumping, settling sediments and the slow relaxation of land once pushed up by Ice Age ice sheets. The region's water utility is answering by refilling the aquifer: the SWIFT program treats wastewater and injects it back underground.",
    facts: [
      ["−4.4 ± 2.5 mm/yr", "Average sinking of Norfolk, Mar 2015 to Jun 2019", "Buzzanga et al., 2020, GRL (Sentinel-1 InSAR)"],
      ["−3.6 ± 2.3 mm/yr", "Average subsidence across Hampton Roads", "Buzzanga et al., 2020, GRL (Sentinel-1 InSAR)"],
      ["4.84 mm/yr", "Relative sea-level rise at Sewells Point, 1927 to 2025", "NOAA tides & currents, station 8638610"],
    ],
    coast: {
      intro: "In Norfolk the tide gauge already measures the sea and the sinking land together.",
      source: "NOAA tide gauge 8638610, 1927 to 2025",
      places: [
        { name: "Sewells Point, Norfolk", relMmYr: 4.84, how: "Measured by the tide gauge since 1927, sinking land included" },
      ],
    },
  },
  {
    id: "jakarta", name: "Jakarta", region: "Indonesia", episode: "Coastal subsidence", kind: "subsidence",
    lat: -6.12, lon: 106.83, model: { type: "bowl", peakM: 0.18, sigmaKm: 5, aspect: 2.0, rotationDeg: 5 },
    extentKm: 50, geometry: "ascending", windowDays: 360, rateUnit: "year", coseismicDay: null, seed: 37,
    driver: "Groundwater pumping + building load",
    headline: "Parts of North Jakarta are sinking faster than the sea is rising.",
    story: "Groundwater pumping and the weight of new buildings squeeze Jakarta's young coastal sediments together. Some northern districts already sit below sea level behind sea walls, which is one reason Indonesia is moving its capital to Nusantara on Borneo.",
    facts: [
      ["1-15 cm/yr", "Typical sinking rates across the city", "Abidin et al., 2011, Natural Hazards"],
      ["20-28 cm/yr", "Fastest local rates in North Jakarta", "Abidin et al., 2011, Natural Hazards"],
    ],
  },
  {
    id: "mexico-city", name: "Mexico City", region: "Mexico", episode: "Aquifer subsidence", kind: "subsidence",
    lat: 19.43, lon: -99.08, model: { type: "bowl", peakM: 0.30, sigmaKm: 6, aspect: 1.5, rotationDeg: 20 },
    extentKm: 55, geometry: "ascending", windowDays: 360, rateUnit: "month", coseismicDay: null, seed: 23,
    driver: "Groundwater pumping from lakebed clays",
    headline: "Pumping out groundwater is letting the old lakebed clay collapse.",
    story: "Mexico City is built on the soft clays of ancient Lake Texcoco. Pumping water from the aquifer below squeezes those clays like a sponge, so the city sinks unevenly and cracks pipes, metro lines and buildings. NISAR's first look in 2025-26 found neighborhoods dropping more than 2 cm every month.",
    facts: [
      ["> 2 cm/mo", "Sinking mapped by NISAR L-band, October 2025 to January 2026", "NASA / JPL, 2026"],
      ["~35 cm/yr", "Peak historical rates in the 1990s and 2000s", "NASA / JPL, 2026"],
    ],
  },
  {
    id: "svartsengi", name: "Svartsengi", region: "Iceland", episode: "Inflation episode", kind: "uplift",
    lat: 63.878, lon: -22.432, model: { type: "mogi", depthKm: 4.5, volumeKm3: 0.02 },
    extentKm: 40, geometry: "ascending", windowDays: 120, rateUnit: "day", coseismicDay: null, seed: 11,
    driver: "Magma recharge (natural)",
    headline: "Magma is refilling the reservoir beneath the geothermal plant.",
    story: "Since October 2023 the ground at Svartsengi has swelled and dropped again and again. Each swell is magma pooling 4 to 5 km down. Each drop is that magma escaping sideways into a dike, and by January 2026 it had erupted nine times along the Sundhnúkur crater row. The town of Grindavík and the Blue Lagoon sit right on this bullseye.",
    facts: [
      ["3-4 mm/day", "Uplift rate at the onset of inflation in this volcanic system (Þorbjörn, January 2020)", "Icelandic Met Office, 2020"],
      ["4-5 km", "Depth of the magma source, worked out from GPS and radar together", "Parks et al., 2025"],
      ["9 eruptions", "Sundhnúkur crater row, December 2023 to January 2026", "Lanzi et al., EGU 2026"],
      ["Fast, then slow", "Uplift is fastest right after each eruption, then eases as the reservoir refills", "Icelandic Met Office, 2025"],
    ],
  },
  {
    id: "kilauea", name: "Kīlauea", region: "Hawaiʻi", episode: "South flank creep", kind: "flank",
    lat: 19.30, lon: -155.15, model: { type: "flank", peakM: 0.27, sigmaKm: 14, azimuthDeg: 155, verticalRatio: -0.3 },
    extentKm: 70, geometry: "descending", windowDays: 1080, rateUnit: "year", coseismicDay: null, seed: 41,
    driver: "Magma intrusion pushing the flank (natural)",
    headline: "Hawaiʻi's south flank is sliding into the Pacific.",
    story: "Kīlauea's south flank slowly creeps out to sea along a deep fault, pushed by magma forcing its way into the rift zones. Because the slide is mostly sideways, one radar look direction sees it much better than the other, so this scene uses a descending pass. In May 2018 the creep broke loose in a magnitude 6.9 earthquake.",
    facts: [
      ["up to ~10 cm/yr", "Seaward motion of the south flank", "USGS Hawaiian Volcano Observatory"],
      ["M 6.9", "South-flank earthquake, 4 May 2018", "USGS"],
    ],
  },
  {
    id: "san-andreas", name: "San Andreas", region: "California", episode: "Creeping section", kind: "faultSlip",
    lat: 36.30, lon: -120.90, model: { type: "rupture", slipM: -0.25, depthKm: 12, strikeDeg: 317, lengthKm: 150 },
    extentKm: 90, geometry: "ascending", windowDays: 3600, rateUnit: "year", coseismicDay: null, seed: 53,
    driver: "Plate motion (natural)",
    headline: "Here the fault slides quietly instead of storing up a big quake.",
    story: "Between San Juan Bautista and Parkfield the San Andreas creeps steadily, shifting curbs, fences and winery walls a little every year. InSAR shows the creep as a sharp color step across the fault. Even over a decade the step is under one L-band fringe, so switch the sensor to C-band to measure it with a finer ruler.",
    facts: [
      ["~25 mm/yr", "Surface creep near the center of the creeping section", "Titus et al., 2006, BSSA"],
      ["~27 mm/yr", "Relative fault-parallel motion between GNSS stations P289 and P290 on opposite sides, 2015 to 2026 (see the charts)", "Nevada Geodetic Lab, IGS20 daily solutions"],
      ["Aseismic", "Steady creep between San Juan Bautista and Parkfield instead of stored strain", "USGS"],
    ],
  },
  {
    id: "campi-flegrei", name: "Campi Flegrei", region: "Italy", episode: "Bradyseism", kind: "uplift",
    lat: 40.827, lon: 14.139, model: { type: "mogi", depthKm: 3.5, volumeKm3: 0.0154 },
    extentKm: 24, geometry: "ascending", windowDays: 360, rateUnit: "month", coseismicDay: null, seed: 61,
    driver: "Caldera pressurization (natural)",
    headline: "The ground under Pozzuoli is rising again.",
    story: "Campi Flegrei is a huge caldera just west of Naples, and roughly half a million people live inside it. Since 2005 the town of Pozzuoli has risen more than a meter in a slow swell geologists call bradyseism, while earthquake swarms rattle the homes above.",
    facts: [
      ["~25 mm/mo", "Ground uplift rate, December 2025", "INGV Osservatorio Vesuviano"],
      ["> 1 m", "Cumulative uplift at Pozzuoli since 2005", "INGV, RITE GNSS station"],
    ],
  },
  {
    id: "kahramanmaras", name: "Kahramanmaraş", region: "Türkiye", episode: "M 7.8 earthquake", kind: "faultSlip",
    lat: 37.25, lon: 37.05, model: { type: "rupture", slipM: 5, depthKm: 15, strikeDeg: 40, lengthKm: 300 },
    extentKm: 380, geometry: "ascending", windowDays: 12, rateUnit: "coseismic", coseismicDay: 6, seed: 83,
    driver: "Earthquake rupture (natural)",
    headline: "A 300 km tear across southern Türkiye, seen in a single pass pair.",
    story: "On 6 February 2023 the East Anatolian Fault ruptured in a magnitude 7.8 earthquake, and a magnitude 7.5 followed hours later. Radar pairs that span the quake show fringes packed tightly against the fault. Right at the trace, where the ground was torn apart, the signal dissolves into noise. L-band keeps a usable signal there far better than shorter wavelengths do.",
    facts: [
      ["M 7.8", "6 February 2023, East Anatolian Fault", "USGS"],
      ["~300 km", "Approximate length of the surface rupture", "USGS"],
    ],
  },
];

export const KIND = {
  subsidence: { label: "Subsidence", word: "sinking", color: "#FF6B57", group: "human" },
  uplift: { label: "Uplift", word: "uplift", color: "#FFC24D", group: "volcano" },
  flank: { label: "Flank slide", word: "seaward", color: "#8FC8E0", group: "volcano" },
  faultSlip: { label: "Fault slip", word: "offset", color: "#8FC8E0", group: "fault" },
};
