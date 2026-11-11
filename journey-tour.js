// A lightweight, non-modal guide anchored to the actual explorer controls.
export function createExplorerTour({ openDetails, onFinish = () => {} }) {
  const steps = [
    { label: "01 / TIMELINE", title: "Let time do the revealing.", text: "Move this slider to compare the available acquisition dates. Press play whenever you want to watch the sequence.", target: "#scrubber" },
    { label: "02 / LAYERS", title: "Choose how you look.", text: "Switch between the physics model, real NISAR observations and photographs. Each view has its own dates and evidence.", target: ".ec-modes" },
    { label: "03 / DETAILS & SOURCES", title: "Keep the evidence close.", text: "Read the source and save the observation report here. The details above explain the layer and its limits; the charts below add historical context.", target: ".observation-sources, #evidence-card, .sheet-hero" },
  ];
  const overlay = document.createElement("div"); overlay.className = "jr-tour"; overlay.hidden = true;
  overlay.innerHTML = '<div class="jr-tour-ring" aria-hidden="true"></div><div class="jr-tour-card" role="dialog" aria-modal="false" aria-label="Explorer field guide" tabindex="-1"><p></p><h2></h2><div class="jr-tour-text"></div><footer><button data-tour="skip">Skip guide</button><button data-tour="next"></button></footer></div>';
  document.body.appendChild(overlay);
  let index = 0, active = false, target, frame, focusTimer;
  const card = overlay.querySelector(".jr-tour-card"), ring = overlay.querySelector(".jr-tour-ring");
  const resolveTarget = () => steps[index].target.split(", ").map((selector) => document.querySelector(selector)).find((el) => el && el.getBoundingClientRect().height);
  function position() {
    if (!active) return;
    target = resolveTarget();
    if (!target) { stop(); return; }
    const rect = target.getBoundingClientRect();
    const pad = 8, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (!rect.width || !rect.height) { ring.hidden = true; return; }
    ring.hidden = false;
    const left = Math.max(pad, rect.left - 5), top = Math.max(pad, rect.top - 5);
    const right = Math.min(vw - pad, rect.right + 5), bottom = Math.min(vh - pad, rect.bottom + 5);
    Object.assign(ring.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, right - left)}px`, height: `${Math.max(0, bottom - top)}px` });
    const width = Math.min(338, vw - 24); card.style.width = `${width}px`;
    const height = card.getBoundingClientRect().height;
    let x = Math.min(vw - width - 12, Math.max(12, left));
    let y = top - height - 18;
    if (y < 12) y = bottom + 18;
    if (y + height > vh - 90) { y = Math.max(80, vh - height - 105); x = Math.max(12, Math.min(vw - width - 12, left - width - 24)); }
    Object.assign(card.style, { left: `${x}px`, top: `${Math.max(12, Math.min(vh - height - 12, y))}px` });
  }
  function show() {
    const step = steps[index];
    if (index === 2) openDetails();
    // Resolve alternatives in priority order, not document order.
    target = resolveTarget();
    if (!target) { stop(); return; }
    overlay.hidden = false;
    card.querySelector("p").textContent = step.label;
    card.querySelector("h2").textContent = step.title;
    card.querySelector(".jr-tour-text").textContent = step.text;
    card.querySelector('[data-tour="next"]').textContent = index === 2 ? "Start exploring →" : "Next →";
    if (index === 2) target.scrollIntoView({ block: "center", behavior: "instant" });
    position();
    let until = performance.now() + 700;
    cancelAnimationFrame(frame);
    const settle = () => { position(); if (active && performance.now() < until) frame = requestAnimationFrame(settle); };
    frame = requestAnimationFrame(settle);
    clearTimeout(focusTimer); focusTimer = setTimeout(() => { if (active) card.focus({ preventScroll: true }); }, 60);
  }
  function stop() { active = false; overlay.hidden = true; cancelAnimationFrame(frame); clearTimeout(focusTimer); onFinish(); }
  overlay.addEventListener("click", (ev) => {
    const action = ev.target.closest("[data-tour]")?.dataset.tour;
    if (action === "skip" || (action === "next" && index === 2)) stop();
    else if (action === "next") { index++; show(); }
  });
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
  const observer = new MutationObserver(() => { if (active) position(); });
  observer.observe(document.querySelector("#app"), { childList: true, subtree: true });
  document.addEventListener("keydown", (ev) => { if (active && ev.key === "Escape") stop(); });
  return { start() { active = true; index = 0; show(); }, stop, isActive: () => active };
}
