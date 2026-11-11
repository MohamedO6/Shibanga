// The 3D world view: a slowly turning Earth with every place on it (globe.gl on three.js).
// Loaded only when the globe is first shown, so the map itself stays light.

const LIB = "https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js";
const IMG = "https://cdn.jsdelivr.net/npm/three-globe@2.45.6/example/img/";

let libPromise = null;
function loadLib() {
  if (window.Globe) return Promise.resolve(window.Globe);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = LIB;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => (window.Globe ? resolve(window.Globe) : reject(new Error("globe.gl did not load")));
    s.onerror = () => reject(new Error("globe.gl could not be downloaded"));
    document.head.appendChild(s);
  });
  return libPromise;
}

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/**
 * sites: [{ id, name, status, lat, lon, color, kind }]
 * onPick(id): called when a place is tapped.
 */
export async function createGlobe(el, sites, { onPick, reduceMotion = false, small = false, start = { lat: 27, lng: 30, altitude: 2.05 } } = {}) {
  const Globe = await loadLib();
  // Phones get a 2k copy of NASA's Blue Marble (0.26 MB instead of 1.4 MB) and skip the relief map (0.37 MB):
  // on a small screen the difference does not show, and the globe appears much sooner.
  const g = Globe({ animateIn: !reduceMotion, rendererConfig: { antialias: !small, alpha: true, powerPreference: small ? "low-power" : "default" } })(el)
    .backgroundColor("rgba(0,0,0,0)")
    .globeImageUrl(small ? "assets/earth-2k.jpg" : `${IMG}earth-blue-marble.jpg`)
    .bumpImageUrl(small ? null : `${IMG}earth-topology.png`)
    .showAtmosphere(true)
    .atmosphereColor("#8fcdea")
    .atmosphereAltitude(0.16)
    // Ripples spreading from each place, like the rings a radar sees.
    .ringsData(sites)
    .ringLat("lat")
    .ringLng("lon")
    .ringColor((d) => (t) => rgba(d.color, Math.max(0, 0.85 - t)))
    .ringMaxRadius(4.5)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(1600)
    .ringAltitude(0.002)
    // Each place: a coloured dot with its name and what the ground is doing.
    .htmlElementsData(sites)
    .htmlLat("lat")
    .htmlLng("lon")
    .htmlAltitude(0.012)
    .htmlTransitionDuration(0)
    .htmlElement((d) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `g-pin kind-${d.kind}`;
      b.style.setProperty("--c", d.color);
      b.setAttribute("aria-label", `${d.name}: ${d.status}. Tell me the story.`);
      b.innerHTML = `<i></i><span class="g-label">${d.name}<small>${d.status}</small></span>`;
      b.addEventListener("click", (ev) => { ev.stopPropagation(); onPick?.(d.id); });
      b.addEventListener("pointerenter", () => { controls.autoRotate = false; });
      b.addEventListener("pointerleave", () => { controls.autoRotate = !reduceMotion; });
      return b;
    })
    .htmlElementVisibilityModifier((elem, visible) => {
      elem.style.opacity = visible ? "1" : "0";
      elem.style.pointerEvents = visible ? "auto" : "none";
    })
    .width(el.clientWidth)
    .height(el.clientHeight);

  const controls = g.controls();
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;
  controls.enableDamping = true;
  controls.minDistance = 140;
  controls.maxDistance = 600;
  g.pointOfView(start, 0);

  return {
    resize() { g.width(el.clientWidth).height(el.clientHeight); },
    pause() { g.pauseAnimation(); },
    resume() { g.resumeAnimation(); },
    focus(lat, lng) { g.pointOfView({ lat, lng, altitude: 1.7 }, 1400); },
  };
}
