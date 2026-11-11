// Hear the ground move. Every centimetre the ground moves toward or away from the satellite plays one note
// (the app passes the motion in cm; the engine just counts whole units and quarter units):
//   sinking  -> notes step DOWN a pentatonic scale (falling ground, falling melody)
//   rising   -> notes step UP
//   sideways -> notes alternate left and right in stereo
// Between notes a soft tick marks every quarter centimetre, so slow places still have a pulse. More motion
// means more notes, so a fast place plays a fast run and a slow place a few long notes. Real NISAR mode plays a
// short radar "ping" for each 12-day pair. On phones each ring can also be a tiny vibration.
// The sound is a translation of the numbers on screen; it adds no data of its own.

const SCALE = [0, 2, 4, 7, 9];          // major pentatonic: any run of notes sounds calm
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

export function createGroundSound({ Context = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null, master = null, echo = null, failed = false, enabled = false, lastAt = 0, lastBuzz = 0;

  function setup() {
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp);
    comp.connect(ctx.destination);
    // A short, soft echo gives the notes some air without a heavy reverb.
    echo = ctx.createDelay(0.5);
    echo.delayTime.value = 0.19;
    const feedback = ctx.createGain(), wet = ctx.createGain(), tone = ctx.createBiquadFilter();
    feedback.gain.value = 0.28;
    wet.gain.value = 0.32;
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    echo.connect(tone);
    tone.connect(feedback);
    feedback.connect(echo);
    tone.connect(wet);
    wet.connect(master);
  }

  /** One mallet-like note: a sine body plus a quiet bright partial that fades fast. */
  function note(midi, { at = 0, gain = 0.16, length = 0.9, pan = 0 } = {}) {
    const t = ctx.currentTime + 0.01 + at;
    const out = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + length);
    if (p) { p.pan.value = pan; out.connect(p); p.connect(master); p.connect(echo); }
    else { out.connect(master); out.connect(echo); }
    for (const [mult, level, type] of [[1, 1, "sine"], [3.01, 0.18, "sine"], [2, 0.12, "triangle"]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = midiToHz(midi) * mult;
      g.gain.value = level;
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + length + 0.05);
      o.onended = () => { o.disconnect(); g.disconnect(); };
    }
    setTimeout(() => { out.disconnect(); p?.disconnect(); }, (length + at + 0.3) * 1000);
  }

  function tick(pan = 0) {
    const t = ctx.currentTime + 0.01, len = 0.05;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 4;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = "bandpass";
    f.frequency.value = 3200;
    f.Q.value = 2.5;
    g.gain.value = 0.11;
    src.connect(f);
    f.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan * 0.6; g.connect(p); p.connect(master); }
    else g.connect(master);
    src.start(t);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  function buzz(ms) {
    const now = performance.now();
    if (now - lastBuzz < 70 || !navigator.vibrate || !matchMedia("(pointer: coarse)").matches) return;
    lastBuzz = now;
    try { navigator.vibrate(ms); } catch { /* not allowed here */ }
  }

  const ready = () => enabled && !failed && ctx && ctx.state === "running";

  return {
    get on() { return enabled; },
    get failed() { return failed; },

    /** Must be called from a click or tap the first time (browsers only start audio after a gesture). */
    async setEnabled(on) {
      enabled = !!on;
      try {
        if (enabled) {
          if (!Context) throw new Error("no Web Audio");
          if (!ctx) setup();
          await ctx.resume();
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.05);
        } else if (ctx) {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
          setTimeout(() => { if (!enabled && ctx?.state === "running") ctx.suspend().catch(() => {}); }, 400);
        }
      } catch { failed = true; enabled = false; }
      return enabled;
    },

    /** Lower the music while the story voice is speaking. */
    duck(on) {
      if (!ctx || !master || !enabled) return;
      master.gain.setTargetAtTime(on ? 0.35 : 0.9, ctx.currentTime, 0.15);
    },

    /**
     * The ring count went from `from` to `to` (fractional). kind: "down" | "up" | "side".
     * Plays a note on every whole ring crossed and a tick on every quarter ring.
     */
    rings(from, to, kind) {
      if (!ready() || !(to > from)) return;
      const now = ctx.currentTime;
      const quarters = Math.floor(to * 4) - Math.floor(from * 4);
      if (quarters <= 0) return;
      // Never more than 3 sounds in one frame, and never closer than 45 ms: fast places become a run, not noise.
      if (now - lastAt < 0.045) return;
      lastAt = now;
      let played = 0;
      for (let q = Math.floor(from * 4) + 1; q <= Math.floor(to * 4) && played < 3; q++, played++) {
        const ring = q / 4;
        if (q % 4 === 0) {
          // Two octaves of the scale (10 notes), then the run starts again from the top (or bottom).
          const step = (Math.round(ring) - 1) % (SCALE.length * 2);
          const offset = Math.floor(step / SCALE.length) * 12 + SCALE[step % SCALE.length];
          const midi = kind === "down" ? 81 - offset : kind === "up" ? 60 + offset : 69 + SCALE[step % SCALE.length];
          note(midi, { at: played * 0.03, pan: kind === "side" ? (Math.round(ring) % 2 ? -0.75 : 0.75) : 0, length: kind === "down" ? 1.2 : 0.9 });
          buzz(14);
        } else {
          tick(kind === "side" ? (q % 2 ? -1 : 1) : 0);
        }
      }
    },

    /** One 12-day NISAR pair passed in the real-data view. */
    ping(index = 0) {
      if (!ready()) return;
      note(84 + SCALE[index % SCALE.length], { gain: 0.07, length: 0.5 });
      note(72, { gain: 0.05, length: 0.7, at: 0.05 });
      buzz(10);
    },

    destroy() { if (ctx) ctx.close().catch(() => {}); },
  };
}
