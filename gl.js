// GPU renderer for the moving rings.
// app.js used to recolour every pixel in JavaScript on each frame (about 100,000 pixels for the model and
// 400,000 for a real NISAR stack). That kept the main thread busy and made the map stutter while dragging.
// Here the same colour lookup runs in a fragment shader, so a frame costs almost nothing on the main thread.
// Output matches fringe.js renderPrepared (style "overlay") and renderPhaseStack. Needs WebGL 2; when it is
// missing, createRingRenderer returns null and app.js keeps using the 2D canvas path.

const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);   // row 0 of the data is the top of the picture
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// Model: R = line-of-sight motion (m), G = atmosphere noise, B = grain, A = edge fade.
const FRAG_MODEL = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uLut;
uniform float uScale, uInv, uAtm;
in vec2 uv;
out vec4 o;
void main() {
  vec4 f = texture(uField, uv);
  float lm = f.r * uScale;
  float cycles = (lm + f.g * uAtm) * uInv;
  float li = min(floor((cycles - floor(cycles)) * 256.0), 255.0);
  vec3 c = min(texelFetch(uLut, ivec2(int(li), 0), 0).rgb * f.b, vec3(1.0));
  float t = clamp((abs(lm) * uInv - 0.03) / 0.25, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float a = t * f.a * 0.94;
  o = vec4(c * a, a);
}`;

// Real NISAR: R = phase summed up to this pair, G = this pair's phase (signed byte), B and A = confidence.
const FRAG_STACK = `#version 300 es
precision highp float;
uniform sampler2D uPair;
uniform sampler2D uLut;
uniform float uF, uFade;
in vec2 uv;
out vec4 o;
void main() {
  vec4 d = texture(uPair, uv) * 255.0;
  float step = d.g >= 128.0 ? d.g - 256.0 : d.g;
  float ph = d.r + uF * step;
  ph -= floor(ph / 256.0) * 256.0;
  vec3 c = texelFetch(uLut, ivec2(int(min(floor(ph), 255.0)), 0), 0).rgb;
  float a = min(d.b, d.a) / 255.0 * uFade;
  o = vec4(c * a, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader failed");
  return s;
}

function program(gl, frag, uniforms) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, "p");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
  const u = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name);
  return { p, u };
}

function texture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * lut: Float32Array of 256 RGB triples (0 to 1), the fringe colour cycle.
 * Returns { drawModel(prepared, opts), drawStack(stack, t) } or null when WebGL 2 is not available.
 */
export function createRingRenderer(canvas, lut) {
  let gl;
  try {
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: "low-power" });
  } catch { gl = null; }
  if (!gl) return null;

  let model, stack, lutTex, fieldTex, pairTex, fieldOf = null, pairOf = null, pairK = -1, pairBuf = null, ok = false;

  function init() {
    model = program(gl, FRAG_MODEL, ["uField", "uLut", "uScale", "uInv", "uAtm"]);
    stack = program(gl, FRAG_STACK, ["uPair", "uLut", "uF", "uFade"]);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.BLEND);
    const bytes = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      bytes[i * 4] = Math.round(lut[i * 3] * 255);
      bytes[i * 4 + 1] = Math.round(lut[i * 3 + 1] * 255);
      bytes[i * 4 + 2] = Math.round(lut[i * 3 + 2] * 255);
      bytes[i * 4 + 3] = 255;
    }
    lutTex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    fieldTex = texture(gl);
    pairTex = texture(gl);
    fieldOf = pairOf = null;
    pairK = -1;
    ok = true;
  }

  try { init(); } catch (err) { console.warn("Ring renderer unavailable", err); return null; }
  canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); ok = false; });
  canvas.addEventListener("webglcontextrestored", () => { try { init(); } catch { ok = false; } });

  function begin(prog, w, h) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(prog.u.uLut, 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  return {
    get ok() { return ok; },

    /** The model rings for one place, at `scale` (0 to 1) of the full motion. */
    drawModel(prepared, { scale, wavelengthCm, atmosphereCm = 0 }) {
      if (!ok) return false;
      const res = prepared.res;
      begin(model, res, res);
      gl.bindTexture(gl.TEXTURE_2D, fieldTex);
      if (fieldOf !== prepared) {
        const n = res * res;
        const packed = new Float32Array(n * 4);
        const { los, edgeO } = prepared;
        const { aps, grain } = prepared.noise;
        for (let i = 0, q = 0; i < n; i++, q += 4) {
          packed[q] = los[i];
          packed[q + 1] = aps[i];
          packed[q + 2] = grain[i];
          packed[q + 3] = edgeO[i];
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, res, res, 0, gl.RGBA, gl.FLOAT, packed);
        fieldOf = prepared;
      }
      gl.uniform1i(model.u.uField, 0);
      gl.uniform1f(model.u.uScale, scale);
      gl.uniform1f(model.u.uInv, 200 / Math.max(wavelengthCm, 0.5));
      gl.uniform1f(model.u.uAtm, atmosphereCm / 100);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },

    /** A real NISAR stack at time t (0 to pairs). */
    drawStack(s, t) {
      if (!ok) return false;
      const tt = Math.min(Math.max(t, 0), s.pairs);
      const k = Math.min(Math.floor(tt), s.pairs - 1);
      begin(stack, s.w, s.h);
      gl.bindTexture(gl.TEXTURE_2D, pairTex);
      if (pairOf !== s || pairK !== k) {
        const n = s.w * s.h;
        if (!pairBuf || pairBuf.length !== n * 4) pairBuf = new Uint8Array(n * 4);
        const base = s.cum[k], baseC = s.cumConf[k], step = s.frames[k].phase, stepC = s.frames[k].conf;
        for (let i = 0, q = 0; i < n; i++, q += 4) {
          pairBuf[q] = base[i];
          pairBuf[q + 1] = step[i];      // Int8 stored as its two's complement byte
          pairBuf[q + 2] = baseC[i];
          pairBuf[q + 3] = stepC[i];
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, s.w, s.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pairBuf);
        pairOf = s;
        pairK = k;
      }
      const x = Math.min(Math.max(tt / 0.7, 0), 1);
      gl.uniform1i(stack.u.uPair, 0);
      gl.uniform1f(stack.u.uF, tt - k);
      gl.uniform1f(stack.u.uFade, x * x * (3 - 2 * x) * 0.94);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return true;
    },
  };
}
