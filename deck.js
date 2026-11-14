// Undula presentation engine: WebGL globe, NISAR satellite fly-over with a radar sweep that reveals each slide,
// count-ups, real app clips, the ground sound, a live-app overlay and a static export mode for the PDF.

// ---------- config ----------
const params = new URLSearchParams(location.search);
// Public application URL used by the closing slide's QR code.
const APP_URL = params.get("app") || "https://undula.vercel.app";
const LIVE_URL = params.get("live") || "app/?welcome=0";
const EXPORT = params.has("export") ? Number(params.get("export")) : null;
const W = 1920, H = 1080;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutExpo = (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
const D2R = Math.PI / 180;
if (EXPORT !== null) document.body.classList.add("export");

// ---------- stage scaling ----------
const stage = $("#stage");
let scale = 1;
function fit() {
  scale = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${(innerHeight - H * scale) / 2}px) scale(${scale})`;
  sizeCanvases();
}
addEventListener("resize", fit);

// ---------- slides + camera states ----------
const slides = $$(".slide");
// Globe camera per slide: centre (stage px), radius, view-centre lat/lon, brightness, slow spin (deg/s).
const CAM = [
  { cx: 960, cy: 1720, R: 1000, lat: -13, lon: 30, dim: 1, spin: 0 },        // title
  { cx: 960, cy: 1900, R: 1000, lat: -12, lon: 31, dim: 0, spin: 0 },        // opening film (globe hidden)
  { cx: 1400, cy: 560, R: 900, lat: 30.6, lon: 31.2, dim: 1, spin: 0 },      // problem: Nile Delta
  { cx: 1430, cy: 540, R: 280, lat: 18, lon: 31, dim: 1, spin: 5 },          // NISAR orbit
  { cx: 960, cy: 2300, R: 1100, lat: 0, lon: 31, dim: .3, spin: 0 },         // world (map slide)
  { cx: 1650, cy: 1500, R: 1050, lat: 5, lon: 20, dim: .45, spin: 0 },       // see
  { cx: 260, cy: 1500, R: 1000, lat: 10, lon: 40, dim: .45, spin: 0 },       // hear
  { cx: 960, cy: 2050, R: 1200, lat: -20, lon: 31, dim: .5, spin: 0 },       // trust
  { cx: 960, cy: 2300, R: 1200, lat: -20, lon: 31, dim: .3, spin: 0 },       // unique
  { cx: 960, cy: 2080, R: 1100, lat: -22, lon: 31, dim: 1, spin: 0 },        // close
];
const NOTES = [
  "Introduce yourselves (about 10 s): we're team Shiblanga from Egypt. Then: let us show you. Press space and the film starts with sound.",
  "The film (55 s). When it ends it moves to the next slide by itself. Press space to skip it.",
  "The Nile Delta is home to more than 40% of Egyptians. It sinks up to 11 mm a year while the sea rises 3.4 mm. Too slow to see.",
  "NISAR is the NASA-ISRO radar satellite. Every 12 days, day and night, through clouds. Comparing two passes gives rainbow rings: each cycle is about 12 cm of motion.",
  "Ten real places on a world map: five where the ground sinks, three volcanoes, two faults. The bundled NISAR data covers nine of these places; Kahramanmaras has published context only.",
  "Mohamed: ten real places, rings growing, real NISAR passes from 2026, and NISAR's latest image of any spot on Earth. Press L to open the live app.",
  "Omar: press S (or the button) to hear the Delta sink. Then Sea 2100: press → to reveal that more than half of it is the land sinking.",
  "Islam: Astrounit walks the map, Then & Now shows real satellite photos. The chart is backscatter from 10 full GCOV dates. We independently checked the seasonal interpretation against Landsat optical NDVI: 8 paired dates within 4 days, fixed optical support over 98.3% of the area, HV rank correlation 0.67 and first-difference rate correlation 0.86. We publish rejected dates, spatial bootstrap intervals and sensitivity checks. This supports seasonal change; it is not crop classification or displacement validation. Delta GUNW has about 4.7% final cumulative coverage and no usable Delta GPS validation; Central Valley's comparison does not resolve small station motion.",
  "Everything in one app: nine ways to see, hear and check how the ground moves. Each tile is a real part of Undula.",
  "Close: scan the QR code to try Undula. Thank you.",
];

// ---------- globe (WebGL) ----------
const gcv = $("#globe"), fcv = $("#fx");
const gl = gcv.getContext("webgl", { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: EXPORT !== null });
const fx = fcv.getContext("2d");
let pxScale = 1, gScale = 1;
function sizeCanvases() {
  pxScale = Math.min(1, scale * (devicePixelRatio || 1));
  gScale = pxScale * (EXPORT !== null ? 1 : 0.75);
  fcv.width = Math.round(W * pxScale); fcv.height = Math.round(H * pxScale);
  gcv.width = Math.round(W * gScale); gcv.height = Math.round(H * gScale);
  gl && gl.viewport(0, 0, gcv.width, gcv.height);
}
const VS = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `precision highp float;
uniform vec2 uRes; uniform float uPx; uniform vec2 uC; uniform float uR; uniform float uLat; uniform float uLon;
uniform float uDim; uniform float uT; uniform sampler2D uTex; uniform float uHas;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
  vec3 col = mix(vec3(0.012,0.02,0.04), vec3(0.03,0.05,0.09), px.y / 1080.0);
  // stars
  vec2 cell = floor(px / 3.0); float h = hash(cell);
  if (h > 0.9965) { float tw = 0.6 + 0.4 * sin(uT * (1.0 + h * 3.0) + h * 40.0); col += vec3(0.75, 0.85, 1.0) * tw * (h - 0.9965) * 220.0; }
  vec2 d = (px - uC) / uR; float r2 = dot(d, d); float dist = sqrt(r2);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2); vec3 n = vec3(d.x, -d.y, z);
    float a = -uLat; vec3 q = vec3(n.x, n.y * cos(a) - n.z * sin(a), n.y * sin(a) + n.z * cos(a));
    float b = uLon; vec3 w = vec3(q.x * cos(b) + q.z * sin(b), q.y, -q.x * sin(b) + q.z * cos(b));
    float lat = asin(clamp(w.y, -1.0, 1.0)); float lon = atan(w.x, w.z);
    vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927);
    vec3 tex = uHas > 0.5 ? texture2D(uTex, uv).rgb : vec3(0.1, 0.25, 0.4);
    vec3 sun = normalize(vec3(-0.55, 0.45, 0.72));
    float lit = clamp(dot(n, sun) * 1.15 + 0.22, 0.04, 1.0);
    vec3 c = pow(tex, vec3(1.08)) * lit * 1.12;
    float rim = pow(1.0 - z, 2.6);
    c += vec3(0.25, 0.6, 1.0) * rim * 0.9;
    float edge = smoothstep(1.0, 0.996, dist);
    col = mix(col, c * uDim + col * (1.0 - uDim) * 0.0, edge);
  }
  // atmosphere halo
  float outPx = (dist - 1.0) * uR;
  if (outPx > -2.0) { float g = exp(-max(outPx, 0.0) / (14.0 + uR * 0.045)); col += vec3(0.2, 0.55, 1.0) * g * 0.55 * uDim; }
  gl_FragColor = vec4(col, 1.0);
}`;
let prog, U = {};
function initGL() {
  if (!gl) return;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; };
  prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of ["uRes", "uPx", "uC", "uR", "uLat", "uLon", "uDim", "uT", "uTex", "uHas"]) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 50, 90, 255]));
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1f(U.uHas, 1); texReady = true;
  };
  img.src = window.EARTH_DATA || "assets/earth-2k.jpg";
}
let texReady = false;
// camera spring state
const cam = { ...CAM[0] }, camV = { cx: 0, cy: 0, R: 0, lat: 0, lon: 0, dim: 0 };
let camTarget = CAM[0], spinLon = 0;
function stepCam(dt) {
  const k = 34, c = 2 * Math.sqrt(k) * 1.0;
  for (const key of ["cx", "cy", "R", "lat", "lon", "dim"]) {
    let target = camTarget[key];
    if (key === "lon") { target += spinLon; let diff = ((target - cam.lon + 540) % 360) - 180; target = cam.lon + diff; }
    const a = k * (target - cam[key]) - c * camV[key];
    camV[key] += a * dt; cam[key] += camV[key] * dt;
  }
}
function snapCam() { Object.assign(cam, camTarget); cam.lon += spinLon; for (const k in camV) camV[k] = 0; }
function project(lat, lon) {
  const la = lat * D2R, lo = lon * D2R, la0 = cam.lat * D2R, lo0 = cam.lon * D2R;
  const g = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  // inverse of shader: rotate by -lon0 about y, then +lat0 about x
  const b = -lo0; const q = [g[0] * Math.cos(b) + g[2] * Math.sin(b), g[1], -g[0] * Math.sin(b) + g[2] * Math.cos(b)];
  const a = la0; const n = [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)];
  return { x: cam.cx + n[0] * cam.R, y: cam.cy - n[1] * cam.R, z: n[2] };
}
function drawGlobe(t) {
  if (!gl || !prog) return;
  gl.uniform2f(U.uRes, gcv.width, gcv.height); gl.uniform1f(U.uPx, gScale);
  gl.uniform2f(U.uC, cam.cx, cam.cy); gl.uniform1f(U.uR, Math.max(cam.R, 1));
  gl.uniform1f(U.uLat, cam.lat * D2R); gl.uniform1f(U.uLon, cam.lon * D2R);
  gl.uniform1f(U.uDim, clamp(cam.dim, 0, 1.2)); gl.uniform1f(U.uT, t); gl.uniform1i(U.uTex, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ---------- fx layer: rings on the Delta, NISAR orbit ----------
const DELTA = [30.9, 31.1];
const ringHue = (i) => ["#ff5d73", "#ffc24d", "#7cf28b", "#4cc9ff", "#b48cff"][((i % 5) + 5) % 5];
function drawRings(x, y, t, size, alpha) {
  for (let i = 0; i < 7; i++) {
    const ph = ((t * 0.35 + i / 7) % 1);
    const r = 8 + ph * size;
    fx.strokeStyle = ringHue(i); fx.globalAlpha = alpha * (1 - ph) * 0.9; fx.lineWidth = 3 + (1 - ph) * 3;
    fx.beginPath(); fx.ellipse(x, y, r, r * 0.8, -0.3, 0, Math.PI * 2); fx.stroke();
  }
  fx.globalAlpha = alpha; fx.fillStyle = "#fff"; fx.beginPath(); fx.arc(x, y, 5, 0, 7); fx.fill();
  fx.globalAlpha = 1;
}
// Orbit: tilted circle around the globe, satellite rides it; the far half is hidden behind the Earth.
let orbitT = 0;
function orbitPoint(u) {
  const rr = cam.R * 1.38, tilt = 0.32, rot = -0.42;
  const x = Math.cos(u) * rr, y = Math.sin(u) * rr * tilt, z = Math.sin(u);
  return { x: cam.cx + x * Math.cos(rot) - y * Math.sin(rot), y: cam.cy + x * Math.sin(rot) + y * Math.cos(rot), front: z > 0 };
}
function drawOrbit(t, alpha, front) {
  fx.lineWidth = 2; fx.setLineDash([2, 10]); fx.strokeStyle = "rgba(127,243,255,.55)"; fx.globalAlpha = alpha;
  fx.beginPath();
  let started = false;
  for (let i = 0; i <= 200; i++) {
    const u = i / 200 * Math.PI * 2, p = orbitPoint(u);
    if (p.front !== front) { started = false; continue; }
    if (!started) { fx.moveTo(p.x, p.y); started = true; } else fx.lineTo(p.x, p.y);
  }
  fx.stroke(); fx.setLineDash([]); fx.globalAlpha = 1;
}
const satImg = new Image();
function drawFx(t, dt) {
  fx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  fx.clearRect(0, 0, W, H);
  const s = cur;
  const SC = slides[s].classList; if (SC.contains("title-slide") || SC.contains("problem") || SC.contains("close")) {
    const p = project(DELTA[0], DELTA[1]);
    if (p.z > 0.05 && p.y < H + 40) {
      const a = clamp(cam.dim, 0, 1) * (SC.contains("problem") ? 1 : .8);
      drawRings(p.x, p.y, t, SC.contains("problem") ? 170 : 90, a);
      if (SC.contains("problem")) { const lab = $("#deltaLabel"); lab.style.left = p.x + 30 + "px"; lab.style.top = p.y + "px"; }
    }
  }
  if (slides[s].classList.contains("nisar")) {
    orbitT += dt * 0.32;
    const u = orbitT % (Math.PI * 2);
    drawOrbit(t, .8, false);
    const sp = orbitPoint(u);
    // radar swath from satellite to ground when in front
    if (sp.front) {
      const g = { x: cam.cx + (sp.x - cam.cx) / 1.38 * 0.93, y: cam.cy + (sp.y - cam.cy) / 1.38 * 0.93 };
      const grad = fx.createLinearGradient(sp.x, sp.y, g.x, g.y);
      grad.addColorStop(0, "rgba(127,243,255,.55)"); grad.addColorStop(1, "rgba(52,226,238,.05)");
      fx.fillStyle = grad; fx.beginPath(); fx.moveTo(sp.x, sp.y);
      const nx = -(g.y - sp.y), ny = g.x - sp.x, L = Math.hypot(nx, ny) || 1;
      fx.lineTo(g.x + nx / L * 36, g.y + ny / L * 36); fx.lineTo(g.x - nx / L * 10, g.y - ny / L * 10); fx.closePath(); fx.fill();
    }
    drawOrbit(t, .8, true);
    if (satImg.complete && satImg.naturalWidth) {
      fx.save(); fx.globalAlpha = sp.front ? 1 : 0.0; fx.translate(sp.x, sp.y); fx.rotate(Math.sin(u) * 0.15);
      fx.drawImage(satImg, -105, -65, 210, 130); fx.restore();
    }
  }
}

// ---------- satellite artwork (NISAR-like: bus, boom, 12 m mesh reflector, solar wing) ----------
const SAT_SVG = `<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2a1"/><stop offset=".45" stop-color="#d79a35"/><stop offset="1" stop-color="#8a5a17"/></linearGradient>
<linearGradient id="cell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5fb8"/><stop offset="1" stop-color="#132a5c"/></linearGradient>
<radialGradient id="mesh" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#fff3cf" stop-opacity=".95"/><stop offset=".6" stop-color="#e8b65a" stop-opacity=".75"/><stop offset="1" stop-color="#9c6a1e" stop-opacity=".85"/></radialGradient>
<pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0H0V6" fill="none" stroke="#7a4f12" stroke-width=".6" opacity=".55"/></pattern>
</defs>
<g stroke="#0b1120" stroke-width="2" stroke-linejoin="round">
  <!-- solar wing -->
  <g transform="translate(18 74) skewY(-8)">
    <rect x="0" y="0" width="136" height="56" rx="4" fill="url(#cell)"/>
    <path d="M34 0V56M68 0V56M102 0V56M0 28H136" stroke="#7fb2ff" stroke-width="1" opacity=".6"/>
  </g>
  <path d="M152 92 L196 98" stroke="#c9d3e3" stroke-width="5"/>
  <!-- bus -->
  <rect x="192" y="74" width="66" height="58" rx="6" fill="url(#foil)"/>
  <path d="M200 84h50M200 96h50M200 108h50M200 120h50" stroke="#fff3cf" stroke-width="1" opacity=".45"/>
  <!-- boom to reflector -->
  <path d="M258 116 L330 168" stroke="#dfe7f2" stroke-width="5"/>
  <path d="M258 116 L330 168" stroke="#7b8aa3" stroke-width="1.5"/>
  <!-- feed -->
  <rect x="246" y="128" width="20" height="22" rx="3" fill="#d6dfeb"/>
  <!-- 12 m mesh reflector -->
  <g transform="translate(330 186) rotate(-24)">
    <ellipse cx="0" cy="0" rx="84" ry="30" fill="url(#mesh)"/>
    <ellipse cx="0" cy="0" rx="84" ry="30" fill="url(#grid)"/>
    <path d="M-84 0A84 30 0 0 0 84 0" fill="none" stroke="#fff6d8" stroke-width="2.5"/>
    <path d="M0 -30V30M-59 -21L59 21M59 -21L-59 21M-82 -7L82 7M-82 7L82 -7" stroke="#b07a25" stroke-width="1" opacity=".7"/>
  </g>
</g>
<circle cx="225" cy="70" r="3" fill="#7ff3ff"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle>
</svg>`;
$("#sat").innerHTML = SAT_SVG;
satImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(SAT_SVG.replace(/<animate[^>]*\/>/g, ""));

// ---------- deck state ----------
let cur = 0, busy = false, stepIdx = 0;
const dots = $("#dots");
const INTRO = slides.findIndex((s) => s.classList.contains("intro"));
const DOT_SLIDES = slides.map((_, i) => i).filter((i) => i !== INTRO);
DOT_SLIDES.forEach((s, i) => { const b = document.createElement("button"); b.title = slides[s].dataset.title; b.addEventListener("click", () => go(s)); dots.append(b); });
function paintDots() { $$("button", dots).forEach((b, i) => { b.classList.toggle("cur", DOT_SLIDES[i] === (cur === INTRO ? cur - 1 : cur)); b.classList.toggle("done", DOT_SLIDES[i] < cur); }); }

function revealAll(slide, on) { for (const el of $$("[data-a]", slide)) el.classList.toggle("in", on); if (!on) for (const el of $$("[data-step]", slide)) el.classList.remove("in"); }
function animEls(slide) {
  return $$("[data-a]", slide).map((el) => { const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    return { el, left: (r.left - sr.left) / scale, right: (r.right - sr.left) / scale, top: (r.top - sr.top) / scale }; });
}

// count-ups
function runCounts(slide) {
  for (const el of $$("[data-count]", slide)) {
    const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), t0 = performance.now(), dur = 1500;
    const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (EXPORT !== null) { el.textContent = fmt(to); continue; }
    el.textContent = fmt(0);
    const host = el.closest("[data-a]");
    const tick = () => {
      if (host && !host.classList.contains("in")) return requestAnimationFrame(tick);
      const st = el._st || (el._st = performance.now()); const p = clamp((performance.now() - st - 200) / dur, 0, 1);
      el.textContent = fmt(to * easeOutExpo(p)); if (p < 1) requestAnimationFrame(tick); else el._st = 0;
    };
    el._st = 0; requestAnimationFrame(tick);
  }
}

// videos inside slides: load lazily, play only on the visible slide
function slideVideos(slide) { return $$("video[data-src]", slide); }
function activateVideos(slide, on) {
  for (const v of slideVideos(slide)) {
    if (on) {
      if (!v.src) v.src = v.dataset.src;
      v.playbackRate = Number(v.dataset.rate || 1);
      if (!v.closest("#seeScreen")) { const st = Number(v.dataset.start || 0); const go = () => { try { v.currentTime = st; } catch {} v.play().catch(() => {}); }; v.readyState >= 1 ? go() : v.addEventListener("loadedmetadata", go, { once: true }); loopRange(v); }
    } else v.pause();
  }
  if (slide.classList.contains("see")) see.active(on);
}

function loopRange(v) {
  if (v._looping) return; v._looping = true;
  const st = () => Number(v.dataset.start || 0), en = () => Number(v.dataset.end || (v.duration - 0.25));
  v.addEventListener("timeupdate", () => { if (v.currentTime >= en()) { v.currentTime = st(); v.play().catch(() => {}); } });
  v.addEventListener("ended", () => { v.currentTime = st(); v.play().catch(() => {}); });
}

// SEE carousel: four real clips with matching chips
const see = (() => {
  const vids = $$("#seeScreen video"), chips = $$("#seeChips li"), DUR = 5600;
  let i = 0, t0 = 0, on = false, raf = 0;
  function show(n) {
    i = (n + vids.length) % vids.length; t0 = performance.now();
    vids.forEach((v, k) => { v.classList.toggle("cur", k === i); if (k === i) { if (!v.src) v.src = v.dataset.src; const st = Number(v.dataset.start || 0); const g = () => { try { v.currentTime = st; } catch {} v.play().catch(() => {}); }; v.readyState >= 1 ? g() : v.addEventListener("loadedmetadata", g, { once: true }); } else v.pause(); });
    chips.forEach((c, k) => { c.classList.toggle("cur", k === i); $(".bar", c).style.width = "0"; });
  }
  function loop() { if (!on) return; const p = (performance.now() - t0) / DUR; $(".bar", chips[i]).style.width = Math.min(p, 1) * 100 + "%"; if (p >= 1) show(i + 1); raf = requestAnimationFrame(loop); }
  chips.forEach((c, k) => c.addEventListener("click", () => show(k)));
  return { active(v) { on = v; cancelAnimationFrame(raf); if (v) { vids.forEach((x) => { if (!x.src) x.src = x.dataset.src; }); show(0); loop(); } else vids.forEach((x) => x.pause()); }, show };
})();

// ---------- transition: satellite sweep ----------
const sat = $("#sat"), beam = $("#beam"), beamPoly = $("#beamPoly"), scan = $("#scan");
function go(to, opts = {}) {
  to = clamp(to, 0, slides.length - 1);
  if (to === cur || busy) return;
  const from = cur, dir = to > from ? 1 : -1, A = slides[from], B = slides[to];
  busy = true; stepIdx = 0;
  revealAll(B, false); B.classList.add("on"); A.classList.add("leaving");
  activateVideos(B, true);
  if (to === INTRO) startIntro();
  camTarget = CAM[to]; spinLon = 0; cur = to; paintDots(); updateNotes();
  if (slides[to].classList.contains("nisar")) orbitT = 0.25;
  runCounts(B);
  const els = animEls(B);
  const dur = opts.fast ? 900 : 1700, t0 = performance.now();
  sat.style.opacity = 1; beam.style.opacity = 1; scan.style.opacity = 1;
  const x0 = dir > 0 ? -260 : W + 260, x1 = dir > 0 ? W + 260 : -260;
  const frame = () => {
    const p = clamp((performance.now() - t0) / dur, 0, 1), e = easeInOut(p);
    const sx = lerp(x0, x1, e), sy = 150 + Math.sin(p * Math.PI) * -40;
    const scanX = clamp(sx + (dir > 0 ? -20 : 20), 0, W);
    sat.style.transform = `translate(${sx}px, ${sy}px) scaleX(${dir})`;
    // beam from the reflector to the ground at the scan line
    const fx0 = sx + 120 * dir, fy0 = sy + 60;
    beamPoly.setAttribute("points", `${fx0},${fy0} ${scanX + 70},${H} ${scanX - 70},${H}`);
    scan.style.transform = `translateX(${scanX}px)`;
    if (dir > 0) { B.style.clipPath = `inset(0 ${W - scanX}px 0 0)`; A.style.clipPath = `inset(0 0 0 ${scanX}px)`; }
    else { B.style.clipPath = `inset(0 0 0 ${scanX}px)`; A.style.clipPath = `inset(0 ${W - scanX}px 0 0)`; }
    for (const o of els) if (!o.el.classList.contains("in") && (dir > 0 ? scanX > o.left + 30 : scanX < o.right - 30)) o.el.classList.add("in");
    if (p < 1) requestAnimationFrame(frame);
    else {
      sat.style.opacity = 0; beam.style.opacity = 0; scan.style.opacity = 0;
      A.classList.remove("on", "leaving"); A.style.clipPath = ""; B.style.clipPath = "";
      revealAll(A, false); activateVideos(A, false);
      for (const o of els) o.el.classList.add("in");
      if (from === INTRO) stopIntro();
      busy = false;
    }
  };
  requestAnimationFrame(frame);
}
function next() {
  if (busy) return;
  if (cur === INTRO && !slides[INTRO].classList.contains("playing")) return startIntro();
  const steps = $$("[data-step]", slides[cur]).filter((e) => !e.classList.contains("in"));
  if (steps.length) { steps[0].classList.add("in"); return; }
  go(cur + 1);
}
function prev() { if (busy || cur === 0) return; go(cur - 1 === INTRO ? cur - 2 : cur - 1); }

// ---------- opening film ----------
const film = $("#opening");
function startIntro() { slides[INTRO].classList.add("playing"); film.currentTime = 0; film.muted = false; film.play().catch(() => { film.muted = true; film.play(); }); }
function stopIntro() { film.pause(); slides[INTRO].classList.remove("playing"); }
film.addEventListener("ended", () => { if (cur === INTRO) go(INTRO + 1); });
$("#begin").addEventListener("click", (e) => { e.stopPropagation(); startIntro(); });

// ---------- ground sound ----------
let playing = false;
const groundAudio = new Audio("assets/sound/ground-sinking-notes.wav");
groundAudio.preload = "auto";
groundAudio.addEventListener("ended", () => { playing = false; $("#playSound").classList.remove("on"); });
function toggleSound() {
  const btn = $("#playSound");
  if (playing) { groundAudio.pause(); groundAudio.currentTime = 0; playing = false; btn.classList.remove("on"); return; }
  groundAudio.currentTime = 0; groundAudio.play().catch(() => {});
  playing = true; btn.classList.add("on");
}
$("#playSound").addEventListener("click", (e) => { e.stopPropagation(); toggleSound(); });
const wave = $("#wave"), wctx = wave.getContext("2d");
function drawWave(t) {
  const w = wave.width, h = wave.height; wctx.clearRect(0, 0, w, h);
  const bins = 64, ph = groundAudio.currentTime;
  const g = wctx.createLinearGradient(0, 0, w, 0);
  ["#ff5d73", "#ffc24d", "#7cf28b", "#4cc9ff", "#b48cff"].forEach((c, i) => g.addColorStop(i / 4, c));
  wctx.fillStyle = g;
  for (let i = 0; i < bins; i++) {
    const v = playing ? 0.18 + 0.8 * Math.abs(Math.sin(ph * 7 + i * 0.37) * Math.sin(ph * 2.3 + i * 0.11)) * Math.exp(-((ph * 3) % 1) * 1.5) : (0.08 + 0.06 * Math.sin(t * 2 + i * 0.4));
    const bh = Math.max(4, v * h * 0.95), bw = w / bins - 4;
    wctx.globalAlpha = playing ? 1 : .5;
    wctx.beginPath(); wctx.roundRect(i * (w / bins) + 2, (h - bh) / 2, bw, bh, 3); wctx.fill();
  }
  wctx.globalAlpha = 1;
}

// ---------- mini fringe (InSAR rainbow) ----------
const mf = $(".mini-fringe"), mctx = mf.getContext("2d");
const mImg = mctx.createImageData(mf.width, mf.height);
function drawMini(t) {
  const w = mf.width, h = mf.height, d = mImg.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), r2 = dx * dx * 1.2 + dy * dy;
    const k = (y * w + x) * 4; if (r2 > 1) { d[k + 3] = 0; continue; }
    const disp = Math.exp(-r2 * 2.2) * 4.2; // cycles
    const ph = ((disp - t * 0.35) % 1 + 1) % 1;
    const hue = ph * 6; const c = (n) => { const kk = (n + hue) % 6; return 255 * (1 - Math.max(0, Math.min(kk, 4 - kk, 1))); };
    d[k] = c(5); d[k + 1] = c(3); d[k + 2] = c(1); d[k + 3] = 235;
  }
  mctx.putImageData(mImg, 0, 0);
}

// ---------- QR ----------
(function makeQR() {
  try {
    const q = qrcode(0, "M"); q.addData(APP_URL); q.make();
    $("#qr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    $("#qrUrl").textContent = APP_URL.replace(/^https?:\/\//, "");
  } catch (e) { console.warn("qr", e); }
})();

// ---------- notes, live app, fullscreen, idle cursor ----------
const notes = $("#notes");
function updateNotes() { notes.innerHTML = `<b>Speaker notes · ${slides[cur].dataset.title}</b>${NOTES[cur] || ""}`; }
function toggleLive(on) {
  const live = $("#live"); const show = on ?? live.hidden;
  if (show) { const f = $("iframe", live); if (!f.src) f.src = LIVE_URL; live.hidden = false; } else live.hidden = true;
}
$("#liveClose").addEventListener("click", () => toggleLive(false));
addEventListener("keydown", (e) => {
  if (!$("#live").hidden) { if (e.key === "Escape" || e.key.toLowerCase() === "l") toggleLive(false); return; }
  const k = e.key.toLowerCase();
  if (["arrowright", "pagedown", " ", "enter"].includes(k)) { e.preventDefault(); next(); }
  else if (["arrowleft", "pageup", "backspace"].includes(k)) { e.preventDefault(); prev(); }
  else if (k === "f") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === "n") { notes.hidden = !notes.hidden; }
  else if (k === "l") toggleLive(true);
  else if (k === "s" && slides[cur].classList.contains("hear")) toggleSound();
  else if (k === "home") go(0, { fast: true });
  else if (/^[1-9]$/.test(k) && Number(k) <= DOT_SLIDES.length) go(DOT_SLIDES[Number(k) - 1], { fast: true });
});
stage.addEventListener("click", (e) => { if (e.target.closest("button, a, li, #live")) return; next(); });
let idleT = 0; addEventListener("mousemove", () => { document.body.classList.remove("idle"); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add("idle"), 2200); });

// ---------- main loop ----------
let last = performance.now(), t = 0, frameN = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
  if (camTarget.spin) spinLon += camTarget.spin * dt;
  frameN++;
  const filmOnly = cur === INTRO && !busy;
  if (!filmOnly) {
    stepCam(dt);
    const moving = busy || Math.abs(camV.cx) + Math.abs(camV.cy) + Math.abs(camV.R) + Math.abs(camV.lat) + Math.abs(camV.lon) > 0.5 || camTarget.spin;
    if (moving || frameN % 2 === 0) drawGlobe(t);
    drawFx(t, dt);
    if (slides[cur].classList.contains("hear")) drawWave(t);
    if (slides[cur].classList.contains("nisar") && frameN % 2 === 0) drawMini(t);
  }
  requestAnimationFrame(loop);
}

// ---------- boot ----------
fit(); initGL(); updateNotes(); paintDots();
if (EXPORT !== null) {
  // Static export: show one slide in its final state (used to build the PDF).
  cur = DOT_SLIDES[clamp(EXPORT, 1, DOT_SLIDES.length) - 1]; camTarget = CAM[cur]; snapCam();
  slides[cur].classList.add("on"); revealAll(slides[cur], true); for (const s of $$("[data-step]", slides[cur])) s.classList.add("in");
  runCounts(slides[cur]); activateVideos(slides[cur], true);
  if (slides[cur].classList.contains("nisar")) orbitT = 0.5;
  window.__ready = async () => {
    await document.fonts.ready;
    if (slides[cur].classList.contains("see")) { see.active(false); $$("#seeScreen video").forEach((v, k) => { v.classList.toggle("cur", v.hasAttribute("data-export")); }); $$("#seeChips li").forEach((c, k) => c.classList.toggle("cur", k === 1)); }
    const vids = $$("video[data-src]", slides[cur]).filter((v) => !slides[cur].classList.contains("see") || v.hasAttribute("data-export"));
    await Promise.all(vids.map((v) => new Promise((r) => {
      if (!v.src) v.src = v.dataset.src;
      const seek = () => { v.pause(); v.addEventListener("seeked", () => setTimeout(r, 150), { once: true }); v.currentTime = Number(v.dataset.poster ?? v.dataset.start ?? 0); };
      v.readyState >= 1 ? seek() : v.addEventListener("loadedmetadata", seek, { once: true });
      setTimeout(r, 15000);
    })));
    await new Promise((r) => { const w = () => texReady ? r() : setTimeout(w, 50); w(); });
    drawGlobe(t); drawFx(t, 0); if (slides[cur].classList.contains("nisar")) drawMini(1.2); if (slides[cur].classList.contains("hear")) drawWave(1);
    return true;
  };
} else {
  slides[0].classList.add("on"); camTarget = CAM[0]; snapCam(); runCounts(slides[0]);
  setTimeout(() => { if (cur === 0) revealAll(slides[0], true); }, 350);
  if (params.has("slide")) { const s = Number(params.get("slide")); cur = 0; slides[0].classList.remove("on"); cur = s; slides[s].classList.add("on"); camTarget = CAM[s]; snapCam(); revealAll(slides[s], true); runCounts(slides[s]); activateVideos(slides[s], true); paintDots(); updateNotes(); }
}
requestAnimationFrame(loop);
