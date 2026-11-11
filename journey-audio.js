// Original generative score: slow suspended chords, glass notes, filtered air.
// Artistic sound design, not sonified scientific measurements. No audio requests.
export function createJourneyAudio({ Context = globalThis.AudioContext || globalThis.webkitAudioContext, enabled = true, onStatus = () => {} } = {}) {
  let ctx, master, reverb, timer, suspendTimer, failed = false;
  let active = false, visible = true, begun = false, step = 0, next = 0, lastPing = -10;
  const sources = new Set();
  const state = () => failed ? "unavailable" : !begun ? "idle" : !enabled ? "muted" : ctx?.state === "running" && active && visible ? "running" : "paused";
  const report = () => onStatus({ status: state(), enabled });
  const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

  function voice(midi, start, duration, volume = .055, type = "sine") {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency(midi);
    oscillator.detune.value = type === "triangle" ? -3 : 2;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + Math.min(1.6, duration * .12));
    gain.gain.setTargetAtTime(volume * .65, start + duration * .35, 1.2);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain); gain.connect(master); gain.connect(reverb);
    sources.add(oscillator);
    oscillator.onended = () => { sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .05);
  }

  function schedule() {
    if (!ctx || !active || !visible || !enabled || ctx.state !== "running") return;
    if (next > ctx.currentTime + 1) return;
    const chords = [[50, 57, 60, 64], [46, 53, 57, 60], [53, 60, 64, 67], [48, 55, 58, 62]];
    const chord = chords[step % chords.length], start = Math.max(next, ctx.currentTime + .03);
    chord.forEach((note, i) => voice(note, start + i * .12, 16, i ? .043 : .065, i ? "sine" : "triangle"));
    [0, 4, 7, 11].forEach((beat, i) => voice(chord[(i + 1) % 4] + 12, start + beat * 60 / 72, 3.6, .018));
    next = start + 16 * 60 / 72; step++;
  }

  function setup() {
    ctx = new Context(); master = ctx.createGain(); master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor(); master.connect(compressor); compressor.connect(ctx.destination);
    reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.4), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 3 * .18;
    }
    reverb.buffer = impulse; reverb.connect(master);
    const air = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), values = air.getChannelData(0);
    for (let i = 0; i < values.length; i++) values[i] = (Math.random() * 2 - 1) * .2;
    const wind = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), windGain = ctx.createGain();
    wind.buffer = air; wind.loop = true; filter.type = "lowpass"; filter.frequency.value = 480; windGain.gain.value = .11;
    wind.connect(filter); filter.connect(windGain); windGain.connect(master); wind.start(); sources.add(wind);
  }

  async function sync() {
    clearTimeout(suspendTimer);
    const audible = begun && active && visible && enabled && !failed;
    if (!audible) {
      clearInterval(timer); timer = null;
      if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, .12);
        suspendTimer = setTimeout(() => { if (ctx?.state === "running" && !(begun && active && visible && enabled)) void ctx.suspend().catch(() => {}); }, 450);
      }
      report(); return;
    }
    try {
      if (!Context) throw new Error("Audio is unavailable");
      if (!ctx) setup();
      await ctx.resume();
      if (!(active && visible && enabled)) return sync();
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(.28, ctx.currentTime, .7);
      if (!timer) { next = Math.max(next, ctx.currentTime + .1); schedule(); timer = setInterval(schedule, 400); }
    } catch { failed = true; }
    report();
  }

  return {
    begin() { begun = true; active = true; return sync(); },
    setEnabled(value) { enabled = !!value; return sync(); },
    setActive(value) { active = !!value; return sync(); },
    setVisible(value) { visible = !!value; return sync(); },
    ping(value = .5) {
      if (state() !== "running" || ctx.currentTime - lastPing < .22) return;
      lastPing = ctx.currentTime; voice(62 + Math.round(Math.max(0, Math.min(1, value)) * 7), ctx.currentTime + .01, 1.15, .035);
    },
    getState: state,
    destroy() {
      clearInterval(timer); clearTimeout(suspendTimer);
      for (const source of sources) { try { source.stop(); } catch { /* already ended */ } }
      if (ctx) void ctx.close().catch(() => {});
    },
  };
}
