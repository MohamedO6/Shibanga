import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { CHAPTERS, readJourneyPrefs, canonicalView, shouldShowJourney, clampChapter, observationFrames } from "../learn-content.js";
import { createJourneyAudio } from "../journey-audio.js";

test("new preferences ignore old academy completion and language settings", () => {
  assert.deepEqual(readJourneyPrefs(null), { version: 1, visited: false, sound: true });
  assert.deepEqual(readJourneyPrefs("bad"), { version: 1, visited: false, sound: true });
  assert.equal(readJourneyPrefs('{"version":1,"language":"ar","completed":["radar"]}').visited, false);
  assert.deepEqual(readJourneyPrefs('{"version":1,"visited":true,"sound":false}'), { version: 1, visited: true, sound: false });
  assert.equal(readJourneyPrefs('{"version":1,"visited":"yes","sound":"off"}').sound, true);
});
test("old Learn links resolve to the Journey route", () => {
  assert.equal(canonicalView("learn"), "journey");
  assert.equal(canonicalView("journey"), "journey");
  assert.equal(canonicalView("nile-delta"), "nile-delta");
});
test("first ordinary visit opens the journey and a returning visit opens the explorer", () => {
  assert.equal(shouldShowJourney({}), true);
  assert.equal(shouldShowJourney({ visited: true }), false);
  assert.equal(shouldShowJourney({ hash: "journey", visited: true }), true);
  assert.equal(shouldShowJourney({ hash: "learn", visited: true }), true);
});
test("site, page, layer and story deep links bypass the introduction", () => {
  for (const hash of ["nile-delta", "central-valley", "guide", "events", "game", "lab"]) assert.equal(shouldShowJourney({ hash }), false);
  for (const query of ["mode=fields", "story=nile-delta", "live=31,30", "welcome=0"]) assert.equal(shouldShowJourney({ params: new URLSearchParams(query) }), false);
});
test("the chapter range is navigable without scores or solved answers", () => {
  assert.equal(CHAPTERS.length, 4);
  assert.equal(clampChapter(-1), 0); assert.equal(clampChapter(100), 3); assert.equal(clampChapter(NaN), 0);
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.title && chapter.text && chapter.next);
    assert.equal(/\p{Script=Arabic}/u.test(JSON.stringify(chapter)), false);
    assert.equal(Object.hasOwn(chapter, "answer"), false);
  }
});
test("real observation dates come from the bundled GCOV index", async () => {
  const data = { nisar: JSON.parse(await readFile(new URL("../data/nisar/index.json", import.meta.url), "utf8")) };
  const frames = observationFrames(data);
  assert.equal(frames.length, 9); assert.equal(frames[0].date, "2026-06-26"); assert.equal(frames.at(-1).date, "2026-10-12");
});
test("missing, malformed and escaping preview entries cannot become fake observations", () => {
  assert.deepEqual(observationFrames({}), []);
  assert.deepEqual(observationFrames({ nisar: { sites: { "nile-delta": { gcov: { frames: {} } } } } }), []);
  const frames = [null, {}, { date: "2026-99-01", file: "nisar/a.webp" }, { date: "2026-06-01", file: "https://external/image" }, { date: "2026-06-01", file: "nisar/../../image" }];
  assert.deepEqual(observationFrames({ nisar: { sites: { "nile-delta": { gcov: { frames } } } } }), []);
});
test("the initial illustration payload stays below 1.5 MB", async () => {
  const files = ["delta.webp", "satellite.webp"];
  const sizes = await Promise.all(files.map((f) => stat(new URL(`../assets/journey/${f}`, import.meta.url)).then((s) => s.size)));
  assert.ok(sizes.every((s) => s > 0)); assert.ok(sizes.reduce((a, b) => a + b, 0) < 1_500_000);
});

class FakeContext {
  static count = 0;
  static latest;
  constructor() { FakeContext.count++; FakeContext.latest = this; this.oscillators = 0; this.state = "suspended"; this.currentTime = 0; this.sampleRate = 32; this.destination = {}; }
  parameter() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} }; }
  node() { return { connect() {}, disconnect() {}, start() {}, stop() {}, gain: this.parameter(), frequency: this.parameter(), detune: this.parameter() }; }
  createGain() { return this.node(); } createOscillator() { this.oscillators++; return this.node(); } createDynamicsCompressor() { return this.node(); }
  createConvolver() { return this.node(); } createBufferSource() { return this.node(); } createBiquadFilter() { return this.node(); }
  createBuffer(channels, length) { return { getChannelData() { return new Float32Array(length); } }; }
  async resume() { this.state = "running"; } async suspend() { this.state = "suspended"; } async close() { this.state = "closed"; }
}
test("audio never constructs a context before Begin Journey", async () => {
  FakeContext.count = 0; const sound = createJourneyAudio({ Context: FakeContext });
  await sound.setActive(true); await sound.setEnabled(true);
  assert.equal(FakeContext.count, 0); assert.equal(sound.getState(), "idle"); sound.destroy();
});
test("muted start, enable, exit and visibility preserve control of the score", async () => {
  FakeContext.count = 0; const sound = createJourneyAudio({ Context: FakeContext, enabled: false });
  await sound.begin(); assert.equal(FakeContext.count, 0); assert.equal(sound.getState(), "muted");
  await sound.setEnabled(true); assert.equal(FakeContext.count, 1); assert.equal(sound.getState(), "running");
  await sound.setVisible(false); assert.equal(sound.getState(), "paused");
  await sound.setVisible(true); assert.equal(sound.getState(), "running");
  await sound.setActive(false); assert.equal(sound.getState(), "paused"); sound.destroy();
});
test("unavailable audio never blocks the visual experience", async () => {
  const sound = createJourneyAudio({ Context: null });
  await sound.begin(); assert.equal(sound.getState(), "unavailable"); sound.ping(); sound.destroy();
});
test("background fade suspends the audio clock and resuming does not duplicate scheduled chords", async () => {
  const sound = createJourneyAudio({ Context: FakeContext });
  await sound.begin(); const ctx = FakeContext.latest, count = ctx.oscillators;
  assert.ok(count > 0);
  await sound.setVisible(false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(ctx.state, "suspended");
  await sound.setVisible(true);
  assert.equal(ctx.state, "running"); assert.equal(ctx.oscillators, count);
  await sound.setEnabled(false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(ctx.state, "suspended"); sound.destroy();
});
