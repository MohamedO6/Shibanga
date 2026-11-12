// Undula hook film (Egyptian Arabic). A pure function of time: window.seek(t) paints frame t on the canvas.
// Real app recordings carry every piece of data; the team appears as their astronaut renders.
const W = 1920, H = 1080, FPS = 30;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const TL = await (await fetch("timeline.json")).json();
const TOTAL = TL.total;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
// closed-form damped spring 0 -> 1
function spring(t, k = 170, c = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = c / (2 * w0);
  if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}
const RAINBOW = ["#ff5d73", "#ffc24d", "#7cf28b", "#4cc9ff", "#b48cff"];

// ---------- assets ----------
const img = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(i); i.src = src; });
const team = { 1: await img("../assets/team/omar.png"), 2: await img("../assets/team/mohamed.png"), 3: await img("../assets/team/islam.png") };
const NAMES = { 1: "عمر", 2: "محمد", 3: "إسلام" };
const logo = await img("../assets/brand/undula-mark.svg");
const earthImg = await img("../assets/earth-2k.jpg");
const SAT_SVG = `<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg"><defs>
<linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2a1"/><stop offset=".45" stop-color="#d79a35"/><stop offset="1" stop-color="#8a5a17"/></linearGradient>
<linearGradient id="cell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5fb8"/><stop offset="1" stop-color="#132a5c"/></linearGradient>
<radialGradient id="mesh" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#fff3cf" stop-opacity=".95"/><stop offset=".6" stop-color="#e8b65a" stop-opacity=".75"/><stop offset="1" stop-color="#9c6a1e" stop-opacity=".85"/></radialGradient></defs>
<g stroke="#0b1120" stroke-width="2" stroke-linejoin="round">
<g transform="translate(18 74) skewY(-8)"><rect x="0" y="0" width="136" height="56" rx="4" fill="url(#cell)"/><path d="M34 0V56M68 0V56M102 0V56M0 28H136" stroke="#7fb2ff" stroke-width="1" opacity=".6"/></g>
<path d="M152 92 L196 98" stroke="#c9d3e3" stroke-width="5"/><rect x="192" y="74" width="66" height="58" rx="6" fill="url(#foil)"/>
<path d="M258 116 L330 168" stroke="#dfe7f2" stroke-width="5"/><rect x="246" y="128" width="20" height="22" rx="3" fill="#d6dfeb"/>
<g transform="translate(330 186) rotate(-24)"><ellipse cx="0" cy="0" rx="84" ry="30" fill="url(#mesh)"/><path d="M-84 0A84 30 0 0 0 84 0" fill="none" stroke="#fff6d8" stroke-width="2.5"/>
<path d="M0 -30V30M-59 -21L59 21M59 -21L-59 21M-82 -7L82 7M-82 7L82 -7" stroke="#b07a25" stroke-width="1" opacity=".7"/></g></g></svg>`;
const sat = await img("data:image/svg+xml;charset=utf-8," + encodeURIComponent(SAT_SVG));
await Promise.all(["800 40px Cairo", "700 40px Cairo", "40px Lalezar", "700 40px 'Space Grotesk'"].map((f) => document.fonts.load(f, "أندولا Undula 123")));

// videos (one element per clip, seeked per frame)
const CLIPS = {};
for (const n of ["02-delta-rings", "03-sea-2100", "04-real-nisar", "05-live-cairo", "07-astrounit", "08-then-now", "10-jakarta", "11-mexico", "12-turkiye", "13-fields", "14-lab", "15-evidence"]) {
  const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = `../assets/clips/${n}.mp4`; CLIPS[n] = v;
}
await Promise.all(Object.values(CLIPS).map((v) => new Promise((r) => v.readyState >= 1 ? r() : v.addEventListener("loadedmetadata", r, { once: true }))));
async function frameOf(name, time) {
  const v = CLIPS[name]; time = clamp(time, 0, v.duration - 0.05);
  if (Math.abs(v.currentTime - time) > 0.001 || v.readyState < 2) {
    await new Promise((r) => { const done = () => r(); v.addEventListener("seeked", done, { once: true }); v.currentTime = time; setTimeout(done, 3000); });
  }
  return v;
}

// ---------- globe (WebGL, same look as the deck) ----------
const gcv = document.createElement("canvas"); gcv.width = W; gcv.height = H;
const gl = gcv.getContext("webgl", { preserveDrawingBuffer: true });
const FS = `precision highp float;
uniform vec2 uC; uniform float uR; uniform float uLat; uniform float uLon; uniform float uT; uniform sampler2D uTex;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, 1080.0 - gl_FragCoord.y);
  vec3 col = mix(vec3(0.012,0.02,0.04), vec3(0.03,0.05,0.09), px.y / 1080.0);
  vec2 cell = floor(px / 3.0); float h = hash(cell);
  if (h > 0.9965) { float tw = 0.6 + 0.4 * sin(uT * (1.0 + h * 3.0) + h * 40.0); col += vec3(0.75, 0.85, 1.0) * tw * (h - 0.9965) * 220.0; }
  vec2 d = (px - uC) / uR; float r2 = dot(d, d); float dist = sqrt(r2);
  if (r2 < 1.0) {
    float z = sqrt(1.0 - r2); vec3 n = vec3(d.x, -d.y, z);
    float a = -uLat; vec3 q = vec3(n.x, n.y * cos(a) - n.z * sin(a), n.y * sin(a) + n.z * cos(a));
    float b = uLon; vec3 w = vec3(q.x * cos(b) + q.z * sin(b), q.y, -q.x * sin(b) + q.z * cos(b));
    float lat = asin(clamp(w.y, -1.0, 1.0)); float lon = atan(w.x, w.z);
    vec3 tex = texture2D(uTex, vec2(lon / 6.2831853 + 0.5, 0.5 - lat / 3.1415927)).rgb;
    vec3 sun = normalize(vec3(-0.55, 0.45, 0.72));
    float lit = clamp(dot(n, sun) * 1.15 + 0.22, 0.04, 1.0);
    vec3 c = pow(tex, vec3(1.08)) * lit * 1.12 + vec3(0.25, 0.6, 1.0) * pow(1.0 - z, 2.6) * 0.9;
    col = mix(col, c, smoothstep(1.0, 0.996, dist));
  }
  float outPx = (dist - 1.0) * uR;
  if (outPx > -2.0) { float g = exp(-max(outPx, 0.0) / (14.0 + uR * 0.045)); col += vec3(0.2, 0.55, 1.0) * g * 0.55; }
  gl_FragColor = vec4(col, 1.0);
}`;
const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }")); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog); gl.useProgram(prog);
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const U = {}; for (const n of ["uC", "uR", "uLat", "uLon", "uT", "uTex"]) U[n] = gl.getUniformLocation(prog, n);
gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, earthImg);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.viewport(0, 0, W, H);
const D2R = Math.PI / 180;
function globe(cam, t, alpha = 1) {
  gl.uniform2f(U.uC, cam.cx, cam.cy); gl.uniform1f(U.uR, cam.R); gl.uniform1f(U.uLat, cam.lat * D2R); gl.uniform1f(U.uLon, cam.lon * D2R); gl.uniform1f(U.uT, t);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.globalAlpha = alpha; ctx.drawImage(gcv, 0, 0); ctx.globalAlpha = 1;
}
function project(cam, lat, lon) {
  const la = lat * D2R, lo = lon * D2R, la0 = cam.lat * D2R, lo0 = cam.lon * D2R;
  const g = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  const b = -lo0, q = [g[0] * Math.cos(b) + g[2] * Math.sin(b), g[1], -g[0] * Math.sin(b) + g[2] * Math.cos(b)];
  const a = la0, n = [q[0], q[1] * Math.cos(a) - q[2] * Math.sin(a), q[1] * Math.sin(a) + q[2] * Math.cos(a)];
  return { x: cam.cx + n[0] * cam.R, y: cam.cy - n[1] * cam.R, z: n[2] };
}
const camLerp = (A, B, k) => ({ cx: lerp(A.cx, B.cx, k), cy: lerp(A.cy, B.cy, k), R: lerp(A.R, B.R, k), lat: lerp(A.lat, B.lat, k), lon: lerp(A.lon, B.lon, k) });

// ---------- drawing helpers ----------
function bg() { ctx.fillStyle = "#05080f"; ctx.fillRect(0, 0, W, H); }
function vignette(a = .55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
// a clip inside a glowing screen frame
async function screen(name, srcT, x, y, w, alpha = 1, opts = {}) {
  const v = await frameOf(name, srcT); const h = w * 9 / 16;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(52,226,238,.25)"; ctx.shadowBlur = 80; rr(x, y, w, h, 22); ctx.fillStyle = "#0b1120"; ctx.fill(); ctx.shadowBlur = 0;
  ctx.save(); rr(x, y, w, h, 22); ctx.clip();
  const z = opts.zoom || 1, cx = opts.fx ?? .5, cy = opts.fy ?? .5;
  const sw = v.videoWidth / z, shh = v.videoHeight / z;
  ctx.drawImage(v, (v.videoWidth - sw) * cx, (v.videoHeight - shh) * cy, sw, shh, x, y, w, h);
  ctx.restore();
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.16)"; rr(x, y, w, h, 22); ctx.stroke();
  ctx.restore();
}
async function fullClip(name, srcT, alpha = 1, zoom = 1, fx = .5, fy = .5) {
  const v = await frameOf(name, srcT);
  const sw = v.videoWidth / zoom, shh = v.videoHeight / zoom;
  ctx.globalAlpha = alpha; ctx.drawImage(v, (v.videoWidth - sw) * fx, (v.videoHeight - shh) * fy, sw, shh, 0, 0, W, H); ctx.globalAlpha = 1;
}
function rmsAt(t) { const i = Math.floor(t * FPS); return TL.rms[i] || 0; }
function speakerAt(t) { return TL.spk[Math.floor(t * FPS)] || 0; }
// astronaut: who, anchor (bottom centre x), height, enter time, exit time
function astro(who, x, h, t, t0, t1, opts = {}) {
  const im = team[who]; if (!im?.naturalWidth) return;
  const inP = spring(t - t0, 220, 22), outP = t1 ? easeOut((t - t1) / .35) : 0;
  if (inP <= 0.001 || outP >= 1) return;
  const talking = speakerAt(t) === who || speakerAt(t) === 4;
  const r = talking ? rmsAt(t) : 0;
  const w = h * im.naturalWidth / im.naturalHeight;
  const bob = Math.sin(t * 1.6 + who) * 6 - r * 16;
  const y = H + (opts.drop ?? 0) + (1 - inP) * h * .6 + outP * h * .6 + bob;
  const s = 1 + r * 0.025;
  ctx.save(); ctx.globalAlpha = clamp(inP, 0, 1) * (1 - outP);
  ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.1 + who * 2) * 0.012 + r * 0.02 * (who % 2 ? 1 : -1)); ctx.scale(s, s);
  if (talking && opts.glow !== false) { ctx.shadowColor = "rgba(52,226,238,.55)"; ctx.shadowBlur = 40 + r * 40; }
  else { ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 40; }
  ctx.drawImage(im, -w / 2, -h, w, h);
  ctx.restore();
  if (opts.tag !== false) nameTag(NAMES[who], x, y - (opts.tagY ?? h * 0.36), clamp(inP, 0, 1) * (1 - outP), talking);
}
function nameTag(text, x, y, a, on) {
  ctx.save(); ctx.globalAlpha = a; ctx.font = "800 30px Cairo"; ctx.direction = "rtl"; ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 44;
  rr(x - w / 2, y - 26, w, 52, 26); ctx.fillStyle = "#070b14"; ctx.fill();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); RAINBOW.forEach((c, i) => g.addColorStop(i / 4, c));
  ctx.lineWidth = on ? 3 : 2; ctx.strokeStyle = g; ctx.stroke();
  ctx.fillStyle = "#f3f6fb"; ctx.textBaseline = "middle"; ctx.fillText(text, x, y + 2);
  ctx.restore();
}
// karaoke caption (Arabic, right to left)
const lineWords = TL.lines.map((l) => {
  const words = l.text.split(/\s+/).filter(Boolean);
  const total = words.reduce((s, w) => s + w.length, 0);
  const a = l.wt.length ? l.wt[0][0] : l.start, b = l.wt.length ? l.wt[l.wt.length - 1][1] : l.end;
  let acc = 0;
  const times = words.map((w) => { const s = a + (b - a) * acc / total; acc += w.length; return s; });
  if (l.wt.length === words.length) l.wt.forEach((x, i) => times[i] = x[0]);
  return { ...l, words, times };
});
function caption(t) {
  const L = [...lineWords].reverse().find((l) => t >= l.start - 0.1 && t <= l.end + 0.35);
  if (!L || L.id === "ALL") return;
  const nxt = lineWords[lineWords.indexOf(L) + 1], stop = nxt && nxt.start - 0.1 < L.end + 0.35 ? nxt.start - 0.1 : L.end + 0.35;
  const a = clamp((t - (L.start - 0.1)) / .2, 0, 1) * clamp((stop - t) / .12, 0, 1);
  ctx.save(); ctx.font = "700 44px Cairo"; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  const space = ctx.measureText(" ").width, maxW = 1120;
  const rows = [[]]; let rw = 0;
  L.words.forEach((w, i) => { const ww = ctx.measureText(w).width; if (rw + ww > maxW && rows.at(-1).length) { rows.push([]); rw = 0; } rows.at(-1).push(i); rw += ww + space; });
  const lh = 64, y0 = H - 70 - (rows.length - 1) * lh;
  rows.forEach((row, ri) => {
    const widths = row.map((i) => ctx.measureText(L.words[i]).width);
    const tw = widths.reduce((s, w) => s + w, 0) + space * (row.length - 1);
    const y = y0 + ri * lh;
    ctx.globalAlpha = a * .78; rr(W / 2 - tw / 2 - 30, y - 34, tw + 60, 68, 18); ctx.fillStyle = "rgba(5,8,15,.82)"; ctx.fill();
    let x = W / 2 + tw / 2; // start at the right edge
    row.forEach((i, k) => {
      const said = t >= L.times[i] - 0.05, cur = said && (i === L.words.length - 1 || t < L.times[i + 1] - 0.05);
      ctx.globalAlpha = a; ctx.textAlign = "right";
      ctx.fillStyle = cur ? "#ffffff" : said ? "#cfd8e6" : "rgba(207,216,230,.42)";
      if (cur) { ctx.shadowColor = "rgba(52,226,238,.8)"; ctx.shadowBlur = 18; } else ctx.shadowBlur = 0;
      ctx.fillText(L.words[i], x, y + 2); x -= widths[k] + space;
    });
  });
  ctx.restore();
}
// a stat sticker that slams in
function sticker(text, sub, x, y, t, t0, color, w = 470) {
  const p = spring(t - t0, 320, 18); if (p <= 0.001) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.05); ctx.scale(lerp(1.6, 1, clamp(p, 0, 1.2)), lerp(1.6, 1, clamp(p, 0, 1.2))); ctx.globalAlpha = clamp(p * 1.5, 0, 1);
  rr(-w / 2, -70, w, 140, 26); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 50; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = "#05080f"; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  ctx.font = "54px Lalezar"; ctx.fillText(text, 0, -14); ctx.font = "700 26px Cairo"; ctx.fillText(sub, 0, 40);
  ctx.restore();
}
function chip(text, x, y, t, t0, align = "right") {
  const p = spring(t - t0, 220, 24); if (p <= 0.001) return;
  ctx.save(); ctx.globalAlpha = clamp(p, 0, 1); ctx.font = "800 34px Cairo"; ctx.direction = "rtl"; ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 56, xx = align === "right" ? x - w : x;
  ctx.translate(0, (1 - p) * 30);
  rr(xx, y - 32, w, 64, 32); ctx.fillStyle = "rgba(7,11,20,.88)"; ctx.fill();
  const g = ctx.createLinearGradient(xx, 0, xx + w, 0); RAINBOW.forEach((c, i) => g.addColorStop(i / 4, c)); ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(text, xx + w / 2, y + 2);
  ctx.restore();
}
function rings(x, y, t, size, alpha, speed = .35, n = 7) {
  for (let i = 0; i < n; i++) {
    const ph = ((t * speed + i / n) % 1), r = 8 + ph * size;
    ctx.strokeStyle = RAINBOW[i % 5]; ctx.globalAlpha = alpha * (1 - ph) * .9; ctx.lineWidth = 3 + (1 - ph) * 4;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * .8, -.3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function fadeBlack(a) { if (a <= 0) return; ctx.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
const xf = (t, t0, d = .35) => clamp((t - t0) / d, 0, 1); // crossfade helper

// ---------- scene times (from the voice timeline) ----------
const L = Object.fromEntries(TL.lines.map((l) => [l.id, l]));
const S = (id) => L[id].start, E = (id) => L[id].end;
const CAM_INTRO = { cx: 960, cy: 1900, R: 1100, lat: -14, lon: 31 };
const CAM_O1 = { cx: 760, cy: 1720, R: 1150, lat: -6, lon: 31 };
const CAM_ORBIT = { cx: 1180, cy: 520, R: 300, lat: 18, lon: 31 };
const CAM_END = { cx: 960, cy: 1720, R: 1000, lat: -13, lon: 30 };
const win = (t, a, b, fi = .3, fo = .3) => clamp((t - a) / fi, 0, 1) * clamp((b - t) / fo, 0, 1);

// one feature card: number, title, real clip in a frame, presenter on the other side
const FEATS = [
  ["L05", 3, "04-real-nisar", 3, "داتا نيسار الحقيقية", "متشغّلة كأنها فيلم", { zoom: 1.25, fx: .5, fy: .45 }],
  ["L06", 2, "13-fields", 9, "الزرع والمية من الفضاء", "استقطابين من رادار نيسار", { zoom: 1.7, fx: .48, fy: .42 }],
  ["L07", 1, "05-live-cairo", 7.5, "أي حتة في العالم", "آخر صورة نيسار · لايف من ناسا", { zoom: 1.35, fx: .62, fy: .45 }],
  ["L08", 3, "02-delta-rings", 12, "اسمع الأرض", "كل سنتي = نوتة", { zoom: 1.5, fx: .62, fy: .38 }],
  ["L09", 2, "03-sea-2100", 10, "البحر سنة 2100", "تقدير تقريبي · الدلتا", { zoom: 1.3, fx: .5, fy: .42 }],
  ["L10", 1, "14-lab", 2.5, "معمل التداخل", "حرّك الأرض بإيدك", { zoom: 1.15, fx: .42, fy: .5 }],
  ["L11", 3, "07-astrounit", 15.5, "اكتشف مع أسترويونت", "حكاية كل منطقة", { zoom: 1.25, fx: .55, fy: .5 }],
  ["L12", 2, "08-then-now", 10, "زمان والنهارده", "صور أقمار صناعية حقيقية", { zoom: 1.2, fx: .55, fy: .45 }],
  ["L13", 1, "15-evidence", 11, "كل رقم بمصدره", "ومختوم على بلوكتشين البيتكوين", { zoom: 1.55, fx: 1.0, fy: .62 }],
];
async function feature(t, i) {
  const [id, who, clip, st, title, sub, view] = FEATS[i];
  const a0 = S(id) - .15, a1 = (i + 1 < FEATS.length ? S(FEATS[i + 1][0]) : TL.all) - .05;
  if (id === "L08") { }
  const a = win(t, a0, id === "L08" ? TL.notes[0] + .1 : a1, .22, .22); if (a <= 0) return;
  const k = t - S(id), right = i % 2 === 0; // presenter side alternates
  let srcT = st + k;
  if (id === "L09") srcT = lerp(10, 61.5, ease(k / (E(id) - S(id))));
  if (id === "L13") srcT = st + k * .8;
  const x = right ? 110 : 500, w = 1310;
  await screen(clip, srcT, x, 200, w, a, view);
  ctx.save(); ctx.globalAlpha = a;
  // number + title
  const p = spring(t - a0, 260, 22);
  ctx.translate(0, (1 - clamp(p, 0, 1)) * 40);
  ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
  const tx = right ? x + w : x + w;
  ctx.font = "800 26px Cairo"; ctx.fillStyle = "#34e2ee"; ctx.fillText(`ميزة ${i + 1} من 9`, tx, 120);
  ctx.font = "76px Lalezar"; ctx.fillStyle = "#fff"; ctx.fillText(title, tx, 186);
  ctx.restore();
  ctx.globalAlpha = a; chip(sub, x + w - 24, 200 + w * 9 / 16 - 50, t, a0 + .35, "right"); ctx.globalAlpha = 1;
  if (id === "L08") {
    for (let j = 0; j < 9; j++) {
      const ph = ((k * .5 + j / 9) % 1), xx = x + w * .35 + Math.sin(j * 2.3) * 220, yy = 200 + 600 - ph * 460;
      ctx.globalAlpha = a * Math.sin(ph * Math.PI) * .95; ctx.fillStyle = RAINBOW[j % 5]; ctx.font = `${60 + (j % 3) * 18}px serif`; ctx.textAlign = "center"; ctx.fillText(j % 2 ? "♪" : "♫", xx, yy);
    }
    ctx.globalAlpha = 1;
  }
  if (id === "L09") { const yr = Math.round(lerp(2026, 2100, ease(k / (E(id) - S(id))))); ctx.globalAlpha = a; sticker(String(yr), "السنة", x + 180, 330, t, S(id) + .2, "#4cc9ff", 300); ctx.globalAlpha = 1; }
  if (id === "L13") { ctx.globalAlpha = a; sticker("مختوم ✓", "Bitcoin · OpenTimestamps", x + 230, 330, t, S(id) + 2.2, "#ffc24d", 400); ctx.globalAlpha = 1; }
  astro(who, right ? 1660 : 260, 800, t, a0, a1 - .05, { drop: 60 });
}

async function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  bg();
  // ---- intro: heartbeat + one line ----
  if (t < S("O1") + .4) {
    const words = "الأرض اللي تحت رجلك بتتحرك.".split(" ");
    const beat = (t % .9) / .9;
    ctx.save(); ctx.globalAlpha = (1 - beat) * .35 * clamp(t / .4, 0, 1);
    ctx.strokeStyle = "#ff7a66"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H / 2, 120 + beat * 260, 0, 7); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.font = "96px Lalezar"; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const sp = ctx.measureText(" ").width, ws = words.map((w) => ctx.measureText(w).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = W / 2 + tw / 2;
    words.forEach((w, i) => {
      const p = easeOut((t - 0.1 - i * .2) / .35);
      ctx.globalAlpha = p * clamp((S("O1") + .3 - t) / .35, 0, 1); ctx.fillStyle = i === 4 ? "#ffc24d" : "#f3f6fb";
      ctx.fillText(w, x, H / 2 + (1 - p) * 26); x -= ws[i] + sp;
    });
    ctx.restore();
  }
  // ---- O1: Omar whispers, Earth rising ----
  if (t >= S("O1") - .2 && t < S("L01") + .3) {
    const a = win(t, S("O1") - .2, S("L01") + .1, .5, .35), k = ease((t - S("O1")) / (E("O1") - S("O1")));
    const cam = camLerp(CAM_INTRO, CAM_O1, k);
    globe(cam, t, a);
    const p = project(cam, 30.9, 31.1); if (p.z > .05) rings(p.x, p.y, t, 90, a * .9);
    ctx.globalAlpha = a; vignette(.6); ctx.globalAlpha = 1;
    astro(1, 1400 + k * 20, 1050 + k * 60, t, S("O1") - .1, S("L01") - .05, { drop: 260, tagY: 640 });
  }
  // ---- L01: Jakarta, Mexico City, Türkiye (real app clips, hard cuts with a punch-in) ----
  if (t >= S("L01") - .15 && t < S("L02") + .3) {
    const C = TL.cities, ends = [C[1], C[2], S("L02")];
    const cities = [["10-jakarta", "جاكرتا", "بتهبط", "#ff7a66"], ["11-mexico", "مكسيكو سيتي", "بتهبط", "#ff7a66"], ["12-turkiye", "تركيا", "اتشقّت 300 كم", "#b48cff"]];
    for (let i = 0; i < 3; i++) {
      const s0 = C[i], s1 = ends[i]; if (t < s0 - .12 || t > s1 + .12) continue;
      const a = win(t, s0 - .12, s1 + .12, .12, .12) * (i === 2 ? 1 - xf(t, S("L02") - .1, .3) : 1), k = t - s0;
      await fullClip(cities[i][0], 9.5 + k, a, 1.35 + k * .08, .5, .42);
      ctx.globalAlpha = a; vignette(.65);
      const p = spring(k, 320, 18), s = lerp(1.5, 1, clamp(p, 0, 1.2));
      ctx.save(); ctx.translate(560, 300); ctx.rotate(-.04); ctx.scale(s, s); ctx.textAlign = "center"; ctx.direction = "rtl";
      ctx.font = "150px Lalezar"; ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 30; ctx.fillStyle = "#fff"; ctx.fillText(cities[i][1], 0, 0);
      ctx.font = "800 54px Cairo"; ctx.fillStyle = cities[i][3]; ctx.fillText(cities[i][2], 0, 82); ctx.restore();
      ctx.globalAlpha = 1;
    }
    astro(2, 1640, 820, t, S("L01"), S("L02") - .1, { drop: 80 });
  }
  // ---- L02: the Delta ----
  if (t >= S("L02") - .3 && t < S("L03") + .3) {
    const a = win(t, S("L02") - .3, S("L03") + .1, .3, .35), k = t - S("L02");
    await fullClip("02-delta-rings", 9 + k, a, 1.15 + k * .03, .55, .42);
    ctx.globalAlpha = a; vignette(.7);
    sticker("حتى 11 ملّي", "في السنة · الدلتا بتهبط", 1380, 300, t, S("L02") + 1.4, "#ff7a66");
    ctx.save(); ctx.font = "120px Lalezar"; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 30;
    ctx.globalAlpha = a * easeOut(k / .4); ctx.fillText("والدلتا عندنا؟", 1760, 900); ctx.restore(); ctx.globalAlpha = 1;
    astro(3, 300, 860, t, S("L02"), S("L03") - .1, { drop: 80 });
  }
  // ---- L03: only NISAR sees it ----
  if (t >= S("L03") - .3 && t < S("L04") + .3) {
    const a = win(t, S("L03") - .3, S("L04") + .1, .35, .3), k = t - S("L03");
    const cam = { ...CAM_ORBIT, lon: 31 + k * 6 };
    globe(cam, t, a);
    const u = 0.2 + k * 0.5, rr0 = cam.R * 1.42, tilt = .32, rot = -.42;
    const op = (uu) => { const x = Math.cos(uu) * rr0, y = Math.sin(uu) * rr0 * tilt; return { x: cam.cx + x * Math.cos(rot) - y * Math.sin(rot), y: cam.cy + x * Math.sin(rot) + y * Math.cos(rot) }; };
    ctx.save(); ctx.globalAlpha = a * .7; ctx.setLineDash([3, 12]); ctx.strokeStyle = "#7ff3ff"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const p = op(i / 160 * Math.PI * 2); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.restore();
    const sp = op(u), g = { x: cam.cx + (sp.x - cam.cx) * .66, y: cam.cy + (sp.y - cam.cy) * .66 };
    ctx.save(); ctx.globalAlpha = a; const gr = ctx.createLinearGradient(sp.x, sp.y, g.x, g.y); gr.addColorStop(0, "rgba(127,243,255,.6)"); gr.addColorStop(1, "rgba(52,226,238,.05)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); const nx = -(g.y - sp.y), ny = g.x - sp.x, Ln = Math.hypot(nx, ny);
    ctx.lineTo(g.x + nx / Ln * 50, g.y + ny / Ln * 50); ctx.lineTo(g.x - nx / Ln * 16, g.y - ny / Ln * 16); ctx.closePath(); ctx.fill();
    ctx.translate(sp.x, sp.y); ctx.rotate(Math.sin(u) * .12); ctx.drawImage(sat, -150, -93, 300, 186); ctx.restore();
    ctx.save(); ctx.globalAlpha = a * easeOut((k - .6) / .5); ctx.font = "700 110px 'Space Grotesk'"; ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.fillText("NISAR", 120, 230);
    ctx.font = "800 34px Cairo"; ctx.direction = "rtl"; ctx.fillStyle = "#9aa8bf"; ctx.fillText("ناسا + وكالة الفضاء الهندية · كل 12 يوم", 120, 300); ctx.restore();
    astro(1, 1700, 760, t, S("L03"), S("L04") - .1, { drop: 60 });
  }
  // ---- L04: Undula, see it · hear it · understand it ----
  if (t >= S("L04") - .2 && t < S("L05") + .3) {
    const a = win(t, S("L04") - .2, S("L05") - .05, .25, .3), k = t - S("L04");
    globe({ cx: 960, cy: 1750, R: 1000, lat: -13, lon: 30 + k * 2 }, t, a);
    ctx.globalAlpha = a; rings(960, 400, t, 520, a * .8, .5, 9);
    const p = spring(k - .05, 260, 16), s = lerp(.2, 1, clamp(p, 0, 1.3));
    ctx.save(); ctx.globalAlpha = a; ctx.translate(960, 330); ctx.scale(s, s); ctx.shadowColor = "rgba(52,226,238,.6)"; ctx.shadowBlur = 80; ctx.drawImage(logo, -110, -110, 220, 220); ctx.restore();
    const q = easeOut((k - .25) / .45);
    ctx.save(); ctx.globalAlpha = a * q; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.font = "140px Lalezar";
    const g = ctx.createLinearGradient(700, 0, 1220, 0); RAINBOW.forEach((c, i) => g.addColorStop(i / 4, c)); ctx.fillStyle = g; ctx.fillText("أندولا", 960, 600);
    ctx.restore();
    const wt = L.L04.wt, verbs = ["يشوفه", "يسمعه", "يفهمه"], at = wt.length >= 3 ? wt.slice(-3).map((w) => w[0]) : [S("L04") + 2, S("L04") + 2.7, S("L04") + 3.4];
    verbs.forEach((v, i) => { const pp = spring(t - at[i], 300, 18); if (pp <= 0) return; ctx.save(); ctx.globalAlpha = a * clamp(pp, 0, 1); ctx.translate(1340 - i * 380, 730); ctx.scale(lerp(1.4, 1, clamp(pp, 0, 1)), lerp(1.4, 1, clamp(pp, 0, 1)));
      ctx.font = "800 58px Cairo"; ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.fillStyle = RAINBOW[i * 2]; ctx.fillText(v, 0, 0); ctx.restore(); });
    astro(2, 1700, 700, t, S("L04"), S("L05") - .1, { drop: 40, tag: false });
  }
  // ---- L05..L13: nine features ----
  for (let i = 0; i < FEATS.length; i++) {
    const id = FEATS[i][0]; if (t >= S(id) - .25 && t <= (i + 1 < FEATS.length ? S(FEATS[i + 1][0]) : TL.all) + .25) await feature(t, i);
  }
  // ---- the ground notes alone ----
  if (t >= TL.notes[0] - .15 && t < TL.notes[1] + .3) {
    const a = win(t, TL.notes[0] - .15, TL.notes[1] + .2, .2, .3), k = t - TL.notes[0];
    ctx.globalAlpha = a; rings(960, 540, t, 900, a, .9, 10);
    for (let i = 0; i < 48; i++) {
      const v = Math.abs(Math.sin(k * 9 + i * .5) * Math.sin(k * 3.1 + i * .21)), h = 30 + v * 260; ctx.fillStyle = RAINBOW[Math.floor(i / 48 * 5)]; ctx.globalAlpha = a * .9;
      rr(960 - 48 * 13 + i * 26, 540 - h / 2, 16, h, 8); ctx.fill();
    }
    ctx.globalAlpha = a; ctx.font = "800 40px Cairo"; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.fillStyle = "#cfd8e6"; ctx.fillText("ده صوت الدلتا وهي بتهبط", 960, 900); ctx.globalAlpha = 1;
  }
  // ---- all three on Earth ----
  if (t >= TL.all - .3) {
    const a = xf(t, TL.all - .3, .45), k = t - TL.all;
    globe({ ...CAM_END, lon: 30 + k * 1.5 }, t, a);
    const p = project({ ...CAM_END, lon: 30 + k * 1.5 }, 30.9, 31.1); if (p.z > .05) rings(p.x, p.y, t, 90, a * .8);
    [[3, 680], [2, 960], [1, 1240]].forEach(([who, x], i) => astro(who, x, 470 + (who === 2 ? 30 : 0), t, TL.all + i * .12, 0, { drop: -318, tagY: -36, glow: true }));
    const q = easeOut((k - .2) / .6);
    ctx.save(); ctx.globalAlpha = a * q; ctx.drawImage(logo, 960 - 46, 26 + (1 - q) * 20, 92, 92);
    ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.font = "104px Lalezar"; ctx.fillStyle = "#fff"; ctx.fillText("ودي أندولا", 960, 205);
    const q2 = easeOut((k - 1.0) / .6); ctx.globalAlpha = a * q2;
    const g = ctx.createLinearGradient(700, 0, 1220, 0); RAINBOW.forEach((c, i) => g.addColorStop(i / 4, c)); ctx.fillStyle = g; ctx.font = "800 54px Cairo"; ctx.fillText("تعالوا نوريكم", 960, 282);
    ctx.restore();
  }
  caption(t);
  // global fade in/out
  fadeBlack(1 - clamp(t / .35, 0, 1));
}

window.TOTAL = TOTAL;
window.seek = async (t) => { await draw(t); return true; };
window.ready = true;
await draw(Number(new URLSearchParams(location.search).get("t") || 0));
