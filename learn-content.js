import { dateMs } from "./science.js?v=10.0";
// English-only narrative. Scene progress is navigation, never a score.
export const JOURNEY_KEY = "fringe.journey.v1";
export const CHAPTERS = [
  { id: "delta", label: "A living delta", eyebrow: "A FIELD GUIDE TO THE INVISIBLE", title: "See the<br><em>Unseen.</em>", text: "A river. A thousand fields. A landscape quietly changing. Come closer, and discover another way to see it.", guide: "Meet your guide: NISAR", next: "Begin Journey", tag: "An illustrated journey" },
  { id: "clouds", label: "Beyond the clouds", eyebrow: "01 / FOLLOW THE ECHO", title: "A different<br>kind of <em>light.</em>", text: "Radar sends its own signal. It can observe through clouds, by day or night.", guide: "Move the scan across the landscape.", next: "Follow the signal", tag: "Illustrative model" },
  { id: "ground", label: "Watch the ground change", eyebrow: "02 / LET TIME REVEAL IT", title: "Small shifts.<br><em>Hidden stories.</em>", text: "Change the radar viewing distance and the colours shift. Real phase also carries atmosphere and measurement errors.", guide: "Move time forward. Watch the pattern grow.", next: "Meet the observations", tag: "Illustrative model · motion exaggerated" },
  { id: "observations", label: "From illustration to observation", eyebrow: "03 / LOOK AT THE REAL DELTA", title: "Now, through<br><em>NISAR’s eyes.</em>", text: "These are real HH/HV previews of the Nile Delta. Different echoes offer clues. Dates, sources and independent checks give them meaning.", guide: "Explore the acquisition dates, then take the controls.", next: "Enter the explorer", tag: "Real NISAR · qualitative preview" },
];

export function readJourneyPrefs(raw) {
  try {
    const value = JSON.parse(raw);
    if (value?.version === 1) return { version: 1, visited: value.visited === true, sound: typeof value.sound === "boolean" ? value.sound : true };
  } catch { /* unavailable or old preferences */ }
  return { version: 1, visited: false, sound: true };
}

export function canonicalView(hash) { return hash === "learn" ? "journey" : hash; }

export function shouldShowJourney({ hash = "", params = new URLSearchParams(), visited = false }) {
  if (["journey", "learn"].includes(hash)) return true;
  return !hash && !visited && params.get("welcome") !== "0" && !["mode", "story", "live"].some((key) => params.has(key));
}

export function clampChapter(index) { return Number.isFinite(index) ? Math.max(0, Math.min(CHAPTERS.length - 1, Math.round(index))) : 0; }

export function observationFrames(data) {
  const frames = data?.nisar?.sites?.["nile-delta"]?.gcov?.frames;
  return (Array.isArray(frames) ? frames : [])
    .filter((f) => f && dateMs(f.date) !== null && typeof f.file === "string" && f.file.startsWith("nisar/") && !f.file.includes(".."))
    .slice().sort((a, b) => a.date.localeCompare(b.date));
}
