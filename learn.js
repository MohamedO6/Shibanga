import { COPY, MISSION_IDS, COMPARISON_LABEL, readProgress, missionSolved } from "./learn-content.js?v=7.0";
import { fringeCycles, validationSummary, seriesSpan, downloadFile } from "./science.js?v=7.0";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STORAGE_KEY = "fringe.academy.v1";
const COLORS = ["#ff7a66", "#ffc857", "#3ddc97", "#8fcdea", "#e3eff8"];
const n = (v, digits = 1) => Number.isFinite(v) ? v.toFixed(digits) : "—";
const SOURCES = [
  ["NASA · NISAR", "https://science.nasa.gov/mission/nisar/"],
  ["NASA · Polarimetry", "https://science.nasa.gov/mission/nisar/polarimetry/"],
  ["NASA · Calibration & validation", "https://science.nasa.gov/mission/nisar/calibration-and-validation/"],
  ["ASF · GCOV user guide", "https://nisar-docs.asf.alaska.edu/gcov/"],
];

// SVG and ordinary controls keep the academy usable without WebGL, a map tile
// server, a voice service, a new package, or a drag gesture.
function cloudScene(response, copy) {
  const canSee = response.sensor === "radar" || (!response.clouds && !response.night);
  return `<svg class="learn-landscape ${response.sensor === "radar" ? "is-radar" : ""}" viewBox="0 0 560 360" role="img" aria-label="${esc(canSee ? copy.echo : response.clouds ? copy.blocked : copy.dark)}">
    <defs><linearGradient id="academy-sky" x2="0" y2="1"><stop stop-color="${response.night ? "#0c1627" : "#19394b"}"/><stop offset="1" stop-color="#172a30"/></linearGradient><pattern id="academy-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#9cb3c4" stroke-opacity=".09"/></pattern></defs>
    <rect width="560" height="360" rx="22" fill="url(#academy-sky)"/><rect width="560" height="360" fill="url(#academy-grid)"/>
    ${response.night ? '<circle cx="450" cy="58" r="17" fill="#edf5e4"/><circle cx="457" cy="51" r="17" fill="#0c1627"/><g fill="#8fcdea"><circle cx="95" cy="50" r="1.7"/><circle cx="350" cy="42" r="2"/><circle cx="505" cy="115" r="1.5"/></g>' : '<circle cx="450" cy="58" r="20" fill="#ffc857"/>'}
    <path d="M0 276Q80 235 170 270T360 263T560 270V360H0Z" fill="#213e36"/><path d="M0 298 560 280V360H0Z" fill="#2c4f3c"/>
    <path d="M65 295l88-9 25 43-103 12zM195 282l85-2 7 47-93 6zM305 281l90 4-16 43-77-1z" fill="#70945e" opacity="${canSee ? 1 : .22}"/>
    <path d="M414 275q-29 30 10 85" fill="none" stroke="#8fcdea" stroke-width="16" opacity=".7"/>
    ${response.sensor === "radar" ? '<path class="learn-beam" d="M240 76 148 299M240 76 320 299" fill="none" stroke="#3ddc97" stroke-width="2" stroke-dasharray="7 7"/><path d="m233 140 16-9-2 17M195 217l-16 9 2-17" fill="none" stroke="#3ddc97" stroke-width="3"/><ellipse cx="234" cy="300" rx="87" ry="14" fill="#3ddc97" fill-opacity=".12" stroke="#3ddc97"/>' : '<path d="m240 76-60 203m60-203 63 203" fill="none" stroke="#ffc857" stroke-opacity=".35" stroke-dasharray="5 7"/>'}
    ${response.clouds ? '<g fill="#627884" fill-opacity=".9"><path d="M100 179q-11-24 15-29 8-31 37-20 18-30 39-5 31-2 32 25 26 10 12 29z"/><path d="M280 184q-8-20 15-26 5-34 34-22 23-30 46-3 31-5 34 25 22 10 9 26z"/></g>' : ""}
    <g transform="translate(240 70) rotate(25)"><rect x="-15" y="-14" width="30" height="28" rx="5" fill="#e3eff8"/><path d="M-18-9H-58V9h40m36-18h40V9H18" fill="#406885" stroke="#8fcdea"/><path d="M0 14v15m-8-3 8 5 8-5" fill="none" stroke="#3ddc97" stroke-width="3"/></g>
    <text x="30" y="333" fill="#d8e9e2" font-size="12" font-family="system-ui">NILE DELTA · TRAINING SECTOR</text>
  </svg>`;
}

function rulerScene(response, copy) {
  const wavelength = response.band === "L" ? 23.8 : 5.55;
  const cycles = fringeCycles(response.motion, wavelength);
  const stops = Array.from({ length: 101 }, (_, i) => `<stop offset="${i}%" stop-color="${COLORS[Math.floor(i / 100 * cycles * COLORS.length) % COLORS.length]}"/>`).join("");
  return `<svg viewBox="0 0 560 360" class="learn-ruler" role="img" aria-label="${n(cycles, 2)} ${esc(copy.cycles)}">
    <defs><radialGradient id="academy-rings">${stops}</radialGradient></defs>
    <rect width="560" height="360" rx="22" fill="#101f29"/>
    <g stroke="#abc3d1" stroke-opacity=".09"><path d="M0 90h560M0 180h560M0 270h560M140 0v360M280 0v360M420 0v360"/></g>
    <ellipse cx="280" cy="180" rx="175" ry="145" fill="url(#academy-rings)" opacity=".92"/>
    <path d="M280 28v304M97 180h366" stroke="#f0f4ee" stroke-opacity=".5" stroke-dasharray="3 5"/>
    <circle cx="280" cy="180" r="4" fill="#0d1424" stroke="#fff"/>
    <rect x="18" y="18" width="92" height="27" rx="13" fill="#0d1424"/><text x="64" y="37" text-anchor="middle" fill="#f3f6fb" font-size="12" font-family="system-ui">${response.band}-band</text>
    <text x="280" y="337" text-anchor="middle" fill="#c5cfdf" font-family="system-ui" font-size="12">λ / 2 = ${n(wavelength / 2, 3)} cm</text>
  </svg>`;
}

function polarizationScene(copy) {
  return `<div class="learn-polar-scene"><svg viewBox="0 0 560 260" role="img" aria-label="${esc(copy.hv)}">
    <rect width="560" height="260" rx="22" fill="#142b2b"/>
    <g stroke="#3ddc97" stroke-width="2" fill="none" opacity=".7"><path d="m80 28 110 95m-54-8 56 12-15-52M306 135l100-87m-20 42 25-45-46 9" stroke-dasharray="6 6"/></g>
    <g fill="#395e3d" stroke="#77ae65"><circle cx="160" cy="155" r="33"/><circle cx="219" cy="145" r="41"/><circle cx="279" cy="158" r="34"/><circle cx="337" cy="145" r="39"/><circle cx="397" cy="161" r="29"/></g>
    <path d="M80 208h400" stroke="#c2a97a" stroke-width="6"/><g stroke="#b4a180" stroke-width="4"><path d="M160 178v30m59-30v30m60-27v27m58-28v28m60-25v25"/></g>
    <g stroke="#ffc857" stroke-width="2"><path d="m242 96 20-43m-10 60 66-57m-69 82 114-5m-137-12-45-57"/></g>
    <text x="30" y="34" font-family="system-ui" fill="#8fcdea" font-size="13">HH →</text><text x="447" y="45" font-family="system-ui" fill="#3ddc97" font-size="13">↑ HV</text>
  </svg><div class="learn-echo-row"><span>${copy.hh}</span><i style="--echo:58%;--echo-color:var(--lateral)"></i></div><div class="learn-echo-row"><span>${copy.hv}</span><i style="--echo:82%;--echo-color:var(--accent)"></i></div><p class="learn-caption">${copy.illustrative}</p></div>`;
}

function scatterScene(check, copy) {
  const rows = (check?.stations || []).filter((s) => Number.isFinite(s.insarCm) && Number.isFinite(s.gnssCm));
  const min = Math.min(-1, ...rows.flatMap((s) => [s.insarCm, s.gnssCm])) - .3;
  const max = Math.max(1, ...rows.flatMap((s) => [s.insarCm, s.gnssCm])) + .5;
  const x = (v) => 65 + (v - min) / (max - min) * 400;
  const y = (v) => 278 - (v - min) / (max - min) * 236;
  return `<svg viewBox="0 0 560 340" role="img" aria-label="NISAR vs GNSS, ${rows.length} ${esc(copy.stationCount)}">
    <rect width="560" height="340" rx="22" fill="#101f29"/>
    <path d="M65 42v236h400" fill="none" stroke="#79909b"/>
    <path d="M${x(min)} ${y(min)}L${x(max)} ${y(max)}" stroke="#8e9bb0" stroke-dasharray="5 6"/>
    <path d="M${x(0)} 42V278M65 ${y(0)}H465" stroke="#8e9bb0" stroke-opacity=".25"/>
    ${[min, 0, max].map((v) => `<text x="${x(v)}" y="300" text-anchor="middle" fill="#a9bbc9" font-size="12" font-family="system-ui">${n(v)}</text>`).join("")}
    ${rows.map((s) => `<circle cx="${x(s.gnssCm)}" cy="${y(s.insarCm)}" r="6" fill="#ff7a66" stroke="#101f29" stroke-width="2"><title>${esc(s.station)}: GNSS ${n(s.gnssCm, 2)} cm; NISAR ${n(s.insarCm, 2)} cm</title></circle>`).join("")}
    <text x="280" y="328" text-anchor="middle" fill="#c5cfdf" font-size="12" font-family="system-ui">GNSS (cm)</text>
    <text x="28" y="164" text-anchor="middle" transform="rotate(-90 28 164)" fill="#c5cfdf" font-size="12" font-family="system-ui">NISAR (cm)</text>
    <text x="90" y="31" fill="#8fcdea" font-size="12" font-family="system-ui">Central Valley · station-to-reference LOS</text>
  </svg>`;
}

export function initAcademy({ root, getData, getCaseReport, onExplore, onGuide }) {
  let raw = null, writable = true;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { writable = false; }
  let progress = readProgress(raw);
  let language = progress.language || (new URLSearchParams(location.search).get("lang") === "ar" || navigator.language?.startsWith("ar") ? "ar" : "en");
  const state = { index: -1, feedback: null, confirmingReset: false, response: {} };
  const copy = () => COPY[language];
  const done = (i) => progress.completed.includes(MISSION_IDS[i]);
  const response = () => state.response[MISSION_IDS[state.index]] ||= { sensor: "optical", clouds: true, night: true, band: "L", motion: 5.9, choice: null, labels: ["", "", ""] };
  const caseData = () => {
    const data = getData();
    const site = data.nisar?.sites?.["nile-delta"];
    return { frames: site?.gcov?.frames || [], series: (data.gnss?.["nile-delta"] || []).find((s) => s.station === "ALX2") };
  };
  const actualCheck = () => getData().nisar?.sites?.["central-valley"]?.stacks?.["114_D_070"]?.cumulativeGnss;
  const exampleCheck = { reference: "TEACHING", stations: [{ station: "A", insarCm: 2.0, gnssCm: .1 }, { station: "B", insarCm: 3.5, gnssCm: .2 }, { station: "C", insarCm: 1.5, gnssCm: -.1 }] };
  const save = () => {
    progress.language = language;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); writable = true; } catch { writable = false; }
  };
  const stamp = (i) => done(i) ? "✓" : String(i + 1).padStart(2, "0");
  const progressMarkup = () => `<div class="learn-progress"><div class="learn-progress-top"><span>${progress.completed.length}/6 ${copy().complete}</span><span class="learn-saved">${writable ? copy().saved : copy().unsaved}</span></div><div role="progressbar" aria-label="${esc(copy().complete)}" aria-valuenow="${progress.completed.length}" aria-valuemin="0" aria-valuemax="6"><i style="width:${progress.completed.length / 6 * 100}%"></i></div></div>`;
  const languageMarkup = () => `<div class="learn-languages" role="group" aria-label="Language / اللغة"><button data-lang="en" lang="en" aria-pressed="${language === "en"}">EN</button><button data-lang="ar" lang="ar" aria-pressed="${language === "ar"}">العربية</button></div>`;
  const linksMarkup = () => `<details class="learn-sources"><summary>${copy().sources}</summary><ul>${SOURCES.map(([title, url]) => `<li><a href="${url}" target="_blank" rel="noopener">${title} ↗</a></li>`).join("")}</ul></details>`;
  const choicesMarkup = (m) => `<div class="learn-choices" role="group" aria-label="${esc(m.task)}">${(m.choices || []).map(([id, label], i) => `<button class="learn-choice" data-choice="${id}" aria-pressed="${response().choice === id}"><span>${String.fromCharCode(65 + i)}</span><strong>${esc(label)}</strong></button>`).join("")}</div>`;

  function missionVisual(index) {
    const c = copy(), r = response();
    if (index === 0) return cloudScene(r, c);
    if (index === 1) return rulerScene(r, c);
    if (index === 2) return polarizationScene(c);
    if (index === 3) return scatterScene(actualCheck() || exampleCheck, c);
    if (index === 4) return `<div class="learn-provenance-art" aria-hidden="true"><span>01</span><i></i><span>02</span><i></i><span>03</span><p>source → method → claim</p><b>SHA-256 ✓</b></div><p class="learn-caption">${c.notCertified}</p>`;
    const { frames, series } = caseData();
    if (!frames.length) return `<div class="learn-unavailable">${c.dataUnavailable}</div>`;
    const ends = frames.length > 1 ? [frames[0], frames[frames.length - 1]] : [frames[0]];
    const dates = seriesSpan(series);
    return `<div class="learn-delta-images">${ends.map((f, i) => `<figure><img src="data/${esc(f.file)}" alt="NISAR HH/HV browse, Nile Delta, ${esc(f.date)}" loading="lazy"><span class="learn-image-missing" hidden>${c.noImage}</span><figcaption><span>0${i + 1}</span><time datetime="${esc(f.date)}">${esc(f.date)}</time></figcaption></figure>`).join("")}</div>
      <div class="learn-period"><span>${c.previewDates}</span><b dir="ltr">${esc(frames[0].date)} → ${esc(frames[frames.length - 1].date)}</b></div>
      <div class="learn-period"><span>${c.gnssDates}</span><b dir="ltr">${dates ? `${dates.start} → ${dates.end}` : "—"}</b></div>
      <p class="learn-data-note">${dates && dates.end < frames[0].date ? c.mismatch : c.noMismatchedDates}</p>`;
  }

  function controls(index, m) {
    const c = copy(), r = response();
    if (index === 0) return `<div class="learn-control-label">${c.sensor}</div><div class="learn-toggle-row" role="group" aria-label="${c.sensor}">${["optical", "radar"].map((id) => `<button data-sensor="${id}" aria-pressed="${r.sensor === id}">${c[id]}</button>`).join("")}</div><div class="learn-weather"><label><input type="checkbox" data-response="clouds" ${r.clouds ? "checked" : ""}>${c.clouds}</label><label><input type="checkbox" data-response="night" ${r.night ? "checked" : ""}>${c.night}</label></div><p class="learn-observation" id="learn-observation" aria-live="polite"></p>`;
    if (index === 1) return `<div class="learn-control-label">${c.wavelength}</div><div class="learn-toggle-row" role="group" aria-label="${c.wavelength}">${["L", "C"].map((band) => `<button data-band="${band}" aria-pressed="${r.band === band}">${band}-band · ${band === "L" ? "23.8" : "5.55"} cm</button>`).join("")}</div><label class="learn-slider-label" for="learn-motion">${c.displacement}<output id="learn-motion-value" dir="ltr">${n(r.motion)} cm</output></label><input id="learn-motion" type="range" min="0" max="35.7" step="0.1" value="${r.motion}" data-response="motion"><div class="learn-ruler-stat"><strong id="learn-cycle-value" dir="ltr">${n(fringeCycles(r.motion, r.band === "L" ? 23.8 : 5.55), 2)}</strong><span>${c.cycles}</span></div><p class="learn-target">${c.target}</p><p class="learn-small">${c.lineOfSight}</p>`;
    if (index === 4) return `<div class="learn-evidence-cards">${m.cards.map((text, i) => `<label class="learn-evidence-card"><span class="learn-card-num">0${i + 1}</span><span>${esc(text)}</span><select data-label="${i}" aria-label="${c.choose} ${i + 1}"><option value="">${c.choose}</option>${["modeled", "cited", "scenario"].map((id) => `<option value="${id}" ${r.labels[i] === id ? "selected" : ""}>${c[id]}</option>`).join("")}</select></label>`).join("")}</div>`;
    return choicesMarkup(m);
  }

  function render() {
    const c = copy();
    root.lang = language; root.dir = language === "ar" ? "rtl" : "ltr";
    root.innerHTML = `<header class="learn-top"><a href="#learn" class="learn-brand" data-home><span class="learn-brand-mark" aria-hidden="true">◎</span>${esc(c.eyebrow)}</a>${languageMarkup()}</header>`;
    if (state.index < 0) {
      root.insertAdjacentHTML("beforeend", `<div class="learn-hero"><div><div class="learn-eyebrow">${c.title}</div><h1 id="learn-heading" tabindex="-1">${c.intro}</h1><p>${c.lede}</p><div class="learn-hero-actions"><button class="learn-primary" data-action="begin">${progress.completed.length ? c.resume : c.start}<span aria-hidden="true">↗</span></button><span class="learn-time">${c.minutes}</span></div></div><div class="learn-hero-art">${cloudScene({ sensor: "radar", clouds: true, night: true }, c)}<span class="learn-art-badge">${c.model}</span><span class="learn-orbit-label">01 / 06 · FOLLOW THE ECHO</span></div></div>${progressMarkup()}<div class="learn-mission-grid">${c.missions.map((m, i) => `<button class="learn-mission-card ${done(i) ? "is-complete" : ""}" data-mission="${i}"><span class="learn-stamp">${stamp(i)}</span><span class="learn-concept">${m.concept}</span><strong>${m.title}</strong><span class="learn-card-foot">${c.stamps[i]}<span aria-hidden="true">↗</span></span></button>`).join("")}</div>${footer()}`);
    } else if (state.index >= MISSION_IDS.length) {
      root.insertAdjacentHTML("beforeend", `<div class="learn-finish"><div class="learn-finish-seal" aria-hidden="true">◎<span>6 / 6</span></div><div class="learn-eyebrow">${c.badge}</div><h1 id="learn-heading" tabindex="-1">${c.doneTitle}</h1><p>${c.doneText}</p><div class="learn-earned-stamps">${c.stamps.map((s, i) => `<span>✓ ${esc(s)}</span>`).join("")}</div><div class="learn-finish-actions"><button class="learn-primary" data-action="explore">${c.map} ↗</button><button class="learn-secondary" data-action="notebook">${c.download} ↓</button></div><p class="learn-small">${c.notebookNote}</p><button class="learn-text-button" data-action="home">${c.replay}</button></div>${footer()}`);
    } else {
      const i = state.index, m = c.missions[i];
      const dataAvailable = i !== 5 || caseData().frames.length > 0;
      const stats = i === 3 ? validationSummary(actualCheck() || exampleCheck) : null;
      root.insertAdjacentHTML("beforeend", `${progressMarkup()}<div class="learn-workspace"><nav class="learn-rail" aria-label="${esc(c.title)}">${c.missions.map((item, j) => `<button data-mission="${j}" class="${done(j) ? "is-complete" : ""}" ${i === j ? 'aria-current="step"' : ""}><span class="learn-stamp">${stamp(j)}</span><span><small>${item.concept}</small><b>${c.stamps[j]}</b></span></button>`).join("")}</nav><article class="learn-stage"><header class="learn-stage-header"><div class="learn-eyebrow">${c.mission} ${i + 1} ${c.of} 6 <span>·</span> ${m.concept}</div><h1 id="learn-heading" tabindex="-1">${m.title}</h1><p>${m.brief}</p></header><div class="learn-task-grid"><div class="learn-visual-column"><span class="learn-scene-label">${i === 5 ? c.actual : i === 3 && actualCheck() ? COMPARISON_LABEL[language] : c.model}</span><div id="learn-visual">${missionVisual(i)}</div>${i === 3 ? `<div class="learn-metrics"><div><strong>${n(stats.rmsCm, 2)} <small>cm</small></strong><span>${c.residual}</span></div><div><strong>${n(stats.zeroMotionRmsCm, 2)} <small>cm</small></strong><span>${c.baseline}</span></div><div><strong>${n(stats.correlation, 2)}</strong><span>${c.correlation}</span></div></div><p class="learn-small">${actualCheck() ? c.compareNote : c.noComparison}</p>` : i < 3 ? `<p class="learn-caption">${i === 1 ? c.rulerHint : c.instrument}</p>` : ""}</div><div class="learn-task"><h2>${m.task}</h2>${controls(i, m)}<details class="learn-hint"><summary>${c.hint}</summary><p>${m.hint}</p></details><button class="learn-primary learn-check" data-action="check" ${dataAvailable ? "" : "disabled"}>${c.check}<span aria-hidden="true">↗</span></button><div class="learn-feedback" id="learn-feedback" role="status" aria-live="polite"></div></div></div><footer class="learn-stage-nav"><button class="learn-text-button" data-action="previous">← ${i ? c.back : c.title}</button><button class="learn-next learn-secondary" data-action="next" ${done(i) ? "" : "disabled"}>${i === 5 ? c.finish : c.next} →</button></footer>${linksMarkup()}</article></div>${footer()}`);
    }
    for (const img of root.querySelectorAll(".learn-delta-images img")) img.addEventListener("error", () => { img.hidden = true; img.nextElementSibling.hidden = false; }, { once: true });
    updateDynamic();
    if (state.feedback) showFeedback();
  }

  function footer() {
    const c = copy();
    return `<div class="learn-bottom"><button class="learn-text-button" data-action="guide">${c.guide} ↗</button><div>${state.confirmingReset ? `<span>${c.confirmReset}</span><button class="learn-text-button" data-action="confirm-reset">${c.yesReset}</button><button class="learn-text-button" data-action="cancel-reset">${c.cancel}</button>` : `<button class="learn-text-button learn-reset" data-action="reset">${c.reset}</button>`}</div></div>`;
  }

  function updateDynamic() {
    if (state.index < 0 || state.index > 1) return;
    const c = copy(), r = response();
    const visual = root.querySelector("#learn-visual");
    if (visual) visual.innerHTML = missionVisual(state.index);
    if (state.index === 0) {
      const text = r.sensor === "radar" ? c.echo : r.clouds ? c.blocked : r.night ? c.dark : c.visible;
      const label = root.querySelector("#learn-observation");
      if (label) label.textContent = text;
    } else {
      root.querySelector("#learn-motion-value").textContent = `${n(r.motion)} cm`;
      root.querySelector("#learn-cycle-value").textContent = n(fringeCycles(r.motion, r.band === "L" ? 23.8 : 5.55), 2);
    }
    for (const button of root.querySelectorAll("[data-sensor]")) button.setAttribute("aria-pressed", String(button.dataset.sensor === r.sensor));
    for (const button of root.querySelectorAll("[data-band]")) button.setAttribute("aria-pressed", String(button.dataset.band === r.band));
  }

  function clearFeedback() {
    state.feedback = null;
    const el = root.querySelector("#learn-feedback");
    if (el) { el.innerHTML = ""; el.className = "learn-feedback"; }
  }

  function showFeedback() {
    const c = copy(), m = c.missions[state.index], result = state.feedback;
    const el = root.querySelector("#learn-feedback");
    if (!el || !result) return;
    const choice = m.choices?.find(([id]) => id === result.choice);
    const detail = result.correct ? m.success : choice?.[2] || m.failure || m.hint;
    el.className = `learn-feedback is-visible ${result.correct ? "is-correct" : "is-retry"}`;
    el.innerHTML = `<strong>${result.correct ? "✓ " + c.correct : "↻ " + c.incorrect}</strong><p>${esc(detail)}</p>`;
  }

  function go(index) {
    state.index = Math.max(-1, Math.min(MISSION_IDS.length, index));
    state.feedback = null;
    render();
    root.closest(".view-page")?.scrollTo({ top: 0, behavior: "instant" });
    root.querySelector("#learn-heading")?.focus({ preventScroll: true });
  }

  root.addEventListener("click", (ev) => {
    const el = ev.target.closest("button, [data-home]");
    if (!el || !root.contains(el)) return;
    if (el.hasAttribute("data-home")) { ev.preventDefault(); go(-1); return; }
    if (el.dataset.lang) { language = el.dataset.lang; save(); render(); root.querySelector(`[data-lang="${language}"]`)?.focus(); return; }
    if (el.dataset.mission !== undefined) { go(Number(el.dataset.mission)); return; }
    if (el.dataset.sensor || el.dataset.band) { response()[el.dataset.sensor ? "sensor" : "band"] = el.dataset.sensor || el.dataset.band; clearFeedback(); updateDynamic(); return; }
    if (el.dataset.choice) {
      response().choice = el.dataset.choice;
      clearFeedback();
      for (const b of root.querySelectorAll("[data-choice]")) b.setAttribute("aria-pressed", String(b === el));
      return;
    }
    const action = el.dataset.action;
    if (action === "begin") { const next = MISSION_IDS.findIndex((_, i) => !done(i)); go(next < 0 ? 0 : next); }
    if (action === "home") go(-1);
    if (action === "previous") go(state.index - 1);
    if (action === "next" && done(state.index)) {
      const next = state.index + 1;
      go(next === MISSION_IDS.length && progress.completed.length < MISSION_IDS.length ? MISSION_IDS.findIndex((_, i) => !done(i)) : next);
    }
    if (action === "guide") onGuide();
    if (action === "explore") onExplore();
    if (action === "check") {
      const id = MISSION_IDS[state.index], correct = missionSolved(id, response());
      progress.attempts[id] = (progress.attempts[id] || 0) + 1;
      if (correct && !progress.completed.includes(id)) progress.completed.push(id);
      state.feedback = { correct, choice: response().choice };
      save(); render();
      root.querySelector(correct ? '[data-action="next"]' : '[data-action="check"]')?.focus({ preventScroll: true });
    }
    if (action === "reset" || action === "cancel-reset") { state.confirmingReset = action === "reset"; render(); }
    if (action === "confirm-reset") { progress = readProgress(null); state.response = {}; state.confirmingReset = false; save(); go(-1); }
    if (action === "notebook") {
      downloadFile("fringe-field-notebook.json", JSON.stringify({ schema: "fringe.learning-notebook/1", savedAt: new Date().toISOString(), language, completedConcepts: progress.completed.map((id) => ({ id, concept: COPY.en.missions[MISSION_IDS.indexOf(id)].concept, attempts: progress.attempts[id] || 0 })), takeaways: ["Radar sees phase and backscatter, not causes directly.", "One fringe is half a wavelength along the line of sight in an ideal deformation model.", "Check independent evidence, dates, references and uncertainty before making a claim."], observations: getCaseReport?.() || null, note: COPY.en.notebookNote }, null, 2));
    }
  });
  root.addEventListener("input", (ev) => {
    const key = ev.target.dataset.response;
    if (!key) return;
    response()[key] = ev.target.type === "checkbox" ? ev.target.checked : Number(ev.target.value);
    clearFeedback(); updateDynamic();
  });
  root.addEventListener("change", (ev) => {
    if (ev.target.dataset.label === undefined) return;
    response().labels[Number(ev.target.dataset.label)] = ev.target.value;
    clearFeedback();
  });
  render();
  return { refresh: render, home: () => go(-1), enter: () => root.querySelector("#learn-heading")?.focus({ preventScroll: true }) };
}
