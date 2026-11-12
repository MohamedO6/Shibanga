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
for (const n of ["02-delta-rings", "03-sea-2100", "04-real-nisar", "05-live-cairo", "06-globe", "07-astrounit", "08-then-now", "09-gps"]) {
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
  const L = lineWords.find((l) => t >= l.start - 0.1 && t <= l.end + 0.35);
  if (!L || L.id === "ALL") return;
  const a = clamp((t - (L.start - 0.1)) / .2, 0, 1) * clamp((L.end + 0.35 - t) / .25, 0, 1);
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
const T = {
  O1: L.O1.start, M1: L.M1.start, I1: L.I1.start, O2: L.O2.start, M2: L.M2.start, O3: L.O3.start,
  N: TL.notes[0], I2: L.I2.start, M3: L.M3.start, ALL: TL.all,
};
const CAM_INTRO = { cx: 960, cy: 1900, R: 1100, lat: -14, lon: 31 };
const CAM_O1 = { cx: 760, cy: 1720, R: 1150, lat: -6, lon: 31 };
const CAM_ORBIT = { cx: 1180, cy: 520, R: 300, lat: 18, lon: 31 };
const CAM_END = { cx: 960, cy: 1720, R: 1000, lat: -13, lon: 30 };

async function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  bg();
  // ---- A: intro text over black + heartbeat ring ----
  if (t < T.O1 + .4) {
    const words = "الأرض تحت أكتر من أربعين مليون مصري بتتحرك.".split(" ");
    const beat = (t % .9) / .9;
    ctx.save(); ctx.globalAlpha = (1 - beat) * .35 * clamp(t / .5, 0, 1);
    ctx.strokeStyle = "#ff7a66"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, H / 2, 120 + beat * 260, 0, 7); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.font = "88px Lalezar"; ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const sp = ctx.measureText(" ").width, ws = words.map((w) => ctx.measureText(w).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (words.length - 1);
    let x = W / 2 + tw / 2;
    words.forEach((w, i) => {
      const p = easeOut((t - 0.15 - i * .26) / .4);
      ctx.globalAlpha = p * clamp((T.O1 + .3 - t) / .4, 0, 1); ctx.fillStyle = i === 4 || i === 5 ? "#ffc24d" : "#f3f6fb";
      ctx.fillText(w, x, H / 2 + (1 - p) * 26); x -= ws[i] + sp;
    });
    ctx.restore();
  }
  // ---- B: O1, Omar whispers, Earth rising ----
  if (t >= T.O1 - .2 && t < T.M1 + .4) {
    const a = xf(t, T.O1 - .2, .6) * (1 - xf(t, T.M1, .4));
    const k = ease((t - T.O1) / (T.M1 - T.O1));
    ctx.globalAlpha = a; globe(camLerp(CAM_INTRO, CAM_O1, k), t, a); ctx.globalAlpha = 1;
    const p = project(camLerp(CAM_INTRO, CAM_O1, k), 30.9, 31.1); if (p.z > .05) { ctx.globalAlpha = a; rings(p.x, p.y, t, 90, a * .9); ctx.globalAlpha = 1; }
    vignette(.6);
    ctx.globalAlpha = a; astro(1, 1400 + k * 20, 1050 + k * 60, t, T.O1 - .1, T.M1 - .05, { drop: 260, tagY: 640 }); ctx.globalAlpha = 1;
  }
  // ---- C: M1, the Delta sinking (real rings clip) ----
  if (t >= T.M1 - .3 && t < T.I1 + .4) {
    const a = xf(t, T.M1 - .3) * (1 - xf(t, T.I1, .4)), k = (t - T.M1) / (T.I1 - T.M1);
    await fullClip("02-delta-rings", 6 + (t - T.M1), a, 1.12 + k * .12, .55, .42);
    ctx.globalAlpha = a; vignette(.7); ctx.globalAlpha = 1;
    ctx.globalAlpha = a; sticker("حتى 11 ملّي", "في السنة · الدلتا بتهبط", 470, 300, t, T.M1 + 1.0, "#ff7a66");
    sticker("+3.4 ملّي", "في السنة · البحر بيعلى", 520, 500, t, T.M1 + 3.05, "#4cc9ff", 430); ctx.globalAlpha = 1;
    astro(2, 1560, 900, t, T.M1, T.I1 - .1, { drop: 120 });
  }
  // ---- D: I1, NISAR from space, then real radar ----
  if (t >= T.I1 - .3 && t < T.O2 + .3) {
    const a = xf(t, T.I1 - .3) * (1 - xf(t, T.O2 - .1, .35));
    const cut = T.I1 + 5.0;
    if (t < cut + .4) {
      const b = a * (1 - xf(t, cut, .4));
      const cam = { ...CAM_ORBIT, lon: 31 + (t - T.I1) * 6 };
      globe(cam, t, b);
      // orbit + satellite with a radar beam
      const u = 0.2 + (t - T.I1) * 0.42, rr0 = cam.R * 1.42, tilt = .32, rot = -.42;
      const op = (uu) => { const x = Math.cos(uu) * rr0, y = Math.sin(uu) * rr0 * tilt; return { x: cam.cx + x * Math.cos(rot) - y * Math.sin(rot), y: cam.cy + x * Math.sin(rot) + y * Math.cos(rot), f: Math.sin(uu) > 0 }; };
      ctx.save(); ctx.globalAlpha = b * .7; ctx.setLineDash([3, 12]); ctx.strokeStyle = "#7ff3ff"; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 160; i++) { const p = op(i / 160 * Math.PI * 2); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.restore();
      const sp = op(u);
      const g = { x: cam.cx + (sp.x - cam.cx) * .66, y: cam.cy + (sp.y - cam.cy) * .66 };
      ctx.save(); ctx.globalAlpha = b; const gr = ctx.createLinearGradient(sp.x, sp.y, g.x, g.y); gr.addColorStop(0, "rgba(127,243,255,.6)"); gr.addColorStop(1, "rgba(52,226,238,.05)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); const nx = -(g.y - sp.y), ny = g.x - sp.x, Ln = Math.hypot(nx, ny);
      ctx.lineTo(g.x + nx / Ln * 50, g.y + ny / Ln * 50); ctx.lineTo(g.x - nx / Ln * 16, g.y - ny / Ln * 16); ctx.closePath(); ctx.fill();
      ctx.translate(sp.x, sp.y); ctx.rotate(Math.sin(u) * .12); ctx.drawImage(sat, -150, -93, 300, 186); ctx.restore();
      ctx.save(); ctx.globalAlpha = b * clamp((t - T.I1 - 1.2) / .5, 0, 1); ctx.font = "700 92px 'Space Grotesk'"; ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.fillText("NISAR", 120, 200);
      ctx.font = "800 34px Cairo"; ctx.direction = "rtl"; ctx.textAlign = "left"; ctx.fillStyle = "#9aa8bf"; ctx.fillText("ناسا + وكالة الفضاء الهندية", 120, 265);
      ctx.restore();
      ctx.globalAlpha = b; chip("كل 12 يوم", 1840, 870, t, T.I1 + 5.4 - 5, "right"); ctx.globalAlpha = 1;
    }
    if (t >= cut - .1) {
      const b = a * xf(t, cut - .1, .4);
      await screen("04-real-nisar", 3 + (t - cut), 260, 150, 1400, b, { zoom: 1.25, fx: .5, fy: .45 });
      ctx.globalAlpha = b; chip("داتا نيسار حقيقية · 2026", 1640, 150, t, cut + .2, "right");
      chip("بالليل والنهار", 1640, 800, t, T.I1 + 7.4, "right"); chip("ومن ورا السحاب", 1260, 800, t, T.I1 + 8.4, "right"); ctx.globalAlpha = 1;
    }
    vignette(.4);
    astro(3, 300, 860, t, T.I1, T.O2 - .1, { drop: 80 });
  }
  // ---- E: O2, the Undula logo ----
  if (t >= T.O2 - .2 && t < T.M2 + .35) {
    const a = xf(t, T.O2 - .2, .25) * (1 - xf(t, T.M2, .35)), k = t - T.O2;
    ctx.globalAlpha = a; globe({ cx: 960, cy: 1750, R: 1000, lat: -13, lon: 30 + k * 2 }, t, a);
    rings(960, 470, t, 520, a * .8, .5, 9);
    const p = spring(k - .1, 260, 16), s = lerp(.2, 1, clamp(p, 0, 1.3));
    ctx.save(); ctx.globalAlpha = a; ctx.translate(960, 400); ctx.scale(s, s); ctx.shadowColor = "rgba(52,226,238,.6)"; ctx.shadowBlur = 80;
    ctx.drawImage(logo, -130, -130, 260, 260); ctx.restore();
    const q = easeOut((k - .35) / .5);
    ctx.save(); ctx.globalAlpha = a * q; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.font = "150px Lalezar";
    const g = ctx.createLinearGradient(700, 0, 1220, 0); RAINBOW.forEach((c, i) => g.addColorStop(i / 4, c)); ctx.fillStyle = g;
    ctx.fillText("أندولا", 960, 700 + (1 - q) * 30); ctx.direction = "ltr"; ctx.font = "600 44px 'Space Grotesk'"; ctx.fillStyle = "#cfd8e6"; ctx.fillText("Undula · Hear the ground move", 960, 790);
    ctx.restore(); ctx.globalAlpha = 1;
    astro(1, 1620, 760, t, T.O2, T.M2 - .05, { drop: 60 });
  }
  // ---- F: M2, ten places, then live NISAR over Cairo ----
  if (t >= T.M2 - .2 && t < T.O3 + .35) {
    const a = xf(t, T.M2 - .2) * (1 - xf(t, T.O3, .35)), cut = T.M2 + 3.9;
    if (t < cut + .35) await screen("06-globe", 12 + (t - T.M2), 120, 190, 1360, a * (1 - xf(t, cut, .35)), { zoom: 1.05 });
    if (t >= cut - .1) await screen("05-live-cairo", 7.5 + (t - cut) * 1.6, 120, 190, 1360, a * xf(t, cut - .1, .35), { zoom: 1.35, fx: .62, fy: .45 });
    ctx.globalAlpha = a; chip("10 أماكن حقيقية", 1480, 120, t, T.M2 + .3, "right");
    if (t >= cut) chip("لايف من ناسا", 1480, 960, t, cut + 1.4, "right"); ctx.globalAlpha = 1;
    astro(2, 1660, 860, t, T.M2, T.O3 - .1, { drop: 60 });
  }
  // ---- G: O3, listen: notes rising from the rings ----
  if (t >= T.O3 - .2 && t < T.N + .3) {
    const a = xf(t, T.O3 - .2) * (1 - xf(t, T.N, .3)), k = t - T.O3;
    await fullClip("02-delta-rings", 12 + k, a, 1.5, .62, .38);
    ctx.globalAlpha = a; vignette(.75);
    for (let i = 0; i < 9; i++) {
      const ph = ((k * .45 + i / 9) % 1), x = 700 + Math.sin(i * 2.3) * 260 + Math.sin(k + i) * 30, y = 760 - ph * 560;
      ctx.globalAlpha = a * Math.sin(ph * Math.PI) * .95; ctx.fillStyle = RAINBOW[i % 5]; ctx.font = `${60 + (i % 3) * 18}px serif`; ctx.textAlign = "center"; ctx.fillText(i % 2 ? "♪" : "♫", x, y);
    }
    ctx.globalAlpha = a; sticker("1 سنتي = نوتة", "أندولا بتخليك تسمع الأرض", 640, 210, t, T.O3 + 2.2, "#7cf28b", 520); ctx.globalAlpha = 1;
    astro(1, 1560, 900, t, T.O3, T.N - .05, { drop: 100 });
  }
  // ---- H: the ground notes alone ----
  if (t >= T.N - .2 && t < T.I2 + .3) {
    const a = xf(t, T.N - .2, .25) * (1 - xf(t, T.I2, .3)), k = t - T.N;
    ctx.globalAlpha = a; rings(960, 540, t, 900, a, .9, 10);
    const bars = 48;
    for (let i = 0; i < bars; i++) {
      const v = Math.abs(Math.sin(k * 9 + i * .5) * Math.sin(k * 3.1 + i * .21));
      const h = 30 + v * 260; ctx.fillStyle = RAINBOW[Math.floor(i / bars * 5)]; ctx.globalAlpha = a * .9;
      rr(960 - bars * 13 + i * 26, 540 - h / 2, 16, h, 8); ctx.fill();
    }
    ctx.globalAlpha = a; ctx.font = "800 40px Cairo"; ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.fillStyle = "#cfd8e6"; ctx.fillText("ده صوت الدلتا وهي بتهبط", 960, 900); ctx.globalAlpha = 1;
  }
  // ---- I: I2, Sea 2100, then take the sinking away ----
  if (t >= T.I2 - .2 && t < T.M3 + .35) {
    const a = xf(t, T.I2 - .2) * (1 - xf(t, T.M3, .35)), mid = T.I2 + 4.3, k = t - T.I2;
    const src = t < mid ? lerp(10, 61.5, ease(k / 4.3)) : 64.4 + (t - mid);
    await screen("03-sea-2100", src, 540, 150, 1300, a, { zoom: 1.3, fx: .5, fy: .42 });
    ctx.globalAlpha = a;
    if (t < mid) { const yr = Math.round(lerp(2026, 2100, ease(k / 4.3))); sticker(String(yr), "البحر سنة 2100 · تقدير تقريبي", 360, 260, t, T.I2 + .2, "#4cc9ff", 440); }
    else { sticker("3,491 ← 1,557 كم²", "من غير هبوط الأرض", 360, 300, t, mid + .3, "#ff7a66", 520); }
    ctx.globalAlpha = 1;
    astro(3, 300, 760, t, T.I2, T.M3 - .1, { drop: 40 });
  }
  // ---- J: M3, Astrounit, then and now, GPS ----
  if (t >= T.M3 - .2 && t < T.ALL + .3) {
    const a = xf(t, T.M3 - .2) * (1 - xf(t, T.ALL - .2, .35)), d = (T.ALL - T.M3) / 3;
    const parts = [["07-astrounit", 10, "أسترويونت", 1.3, .55, .35], ["08-then-now", 7, "زمان والنهارده", 1.25, .55, .45], ["09-gps", 11, "كل رقم بمصدره", 1.2, .7, .4]];
    for (let i = 0; i < 3; i++) {
      const s0 = T.M3 + i * d; if (t < s0 - .2 || t > s0 + d + .25) continue;
      const b = a * xf(t, s0 - .2, .25) * (1 - xf(t, s0 + d, .25));
      const [n, st, label, z, fx, fy] = parts[i];
      await screen(n, st + (t - s0), 160, 170, 1320, b, { zoom: z, fx, fy });
      ctx.globalAlpha = b; chip(label, 1480, 130, t, s0 + .1, "right"); ctx.globalAlpha = 1;
    }
    astro(2, 1680, 820, t, T.M3, T.ALL - .1, { drop: 60 });
  }
  // ---- K: all three on Earth, the sign-off ----
  if (t >= T.ALL - .3) {
    const a = xf(t, T.ALL - .3, .45), k = t - T.ALL;
    globe({ ...CAM_END, lon: 30 + k * 1.5 }, t, a);
    const p = project({ ...CAM_END, lon: 30 + k * 1.5 }, 30.9, 31.1); if (p.z > .05) rings(p.x, p.y, t, 90, a * .8);
    const crew = [[3, 680], [2, 960], [1, 1240]];
    crew.forEach(([who, x], i) => astro(who, x, 470 + (who === 2 ? 30 : 0), t, T.ALL + i * .12, 0, { drop: -318, tagY: -36, glow: true }));
    const q = easeOut((k - .2) / .6);
    ctx.save(); ctx.globalAlpha = a * q; ctx.drawImage(logo, 960 - 46, 26 + (1 - q) * 20, 92, 92);
    ctx.textAlign = "center"; ctx.direction = "rtl"; ctx.font = "104px Lalezar"; ctx.fillStyle = "#fff"; ctx.fillText("ودي أندولا", 960, 205);
    const q2 = easeOut((k - 1.3) / .6); ctx.globalAlpha = a * q2;
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
