// Delta Dispatch: deterministic game rules. All world readings are fictional.
import { dateMs } from './science.js?v=10.0';
export const TILE = 16, COLS = 40, ROWS = 28;
export const SAVE_KEY = "fringe.delta-dispatch.v1";
export const OBJECTS = [
  { id: "lab", x: 104, y: 392, name: "Field station" },
  { id: "relay", x: 168, y: 120, name: "Lost radar relay" },
  { id: "compare", x: 232, y: 136, name: "Time relay" },
  { id: "gauge", x: 472, y: 120, name: "Field gauge" },
  { id: "note-radar", x: 88, y: 280, name: "A field note", note: "Radar sends its own light. Clouds can hide an optical scene while radar still receives echoes." },
  { id: "note-echo", x: 536, y: 296, name: "A field note", note: "HH and HV describe different echo channels. A colour alone cannot prove a crop type or flooding." },
  { id: "note-dates", x: 504, y: 56, name: "A field note", note: "A useful field check needs compatible dates, location and reference. Older measurements can provide context." },
];
export const TREES = [[3,4],[5,11],[14,20],[24,25],[33,11],[36,22],[26,3],[3,18],[35,5],[15,16]];
export const HOUSES = [[4,21,5,3],[29,21,5,3],[31,16,3,2]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function stageOf(s) {
  return s.delivered ? "complete" : s.gauge ? "return" : s.captures.length === 2 ? "gauge" : s.relay ? "compare" : "relay";
}
export function newGame(raw) {
  let old;
  try { old = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { /* optional checkpoint */ }
  if (old?.version !== 1) old = {};
  const relay = old.relay === true;
  const captures = relay && Array.isArray(old.captures) ? [...new Set(old.captures.filter((v) => v === "A" || v === "B"))] : [];
  const gauge = captures.length === 2 && old.gauge === true;
  const s = { version: 1, x: 104, y: 408, facing: "up", moving: false, walk: 0, era: old.era === "A" ? "A" : "B", relay,
    found: relay || old.found === true, captures, gauge, delivered: gauge && old.delivered === true,
    archiveSeen: old.archiveSeen === true,
    archivePair: dateMs(old.archivePair?.a)!==null && dateMs(old.archivePair?.b)!==null && old.archivePair.a<old.archivePair.b ? {a:old.archivePair.a,b:old.archivePair.b} : null,
    notes: Array.isArray(old.notes) ? [...new Set(old.notes.filter((v) => OBJECTS.some((o) => o.id === v && o.note)))] : [],
    seconds: Number.isFinite(old.seconds) ? clamp(old.seconds, 0, 86400) : 0, pulses: [], reveal: 0, cooldown: 0, nav: [] };
  if (Number.isFinite(old.x) && Number.isFinite(old.y) && canStand(old.x, old.y, s)) { s.x = old.x; s.y = old.y; }
  return s;
}
export function checkpoint(s) {
  const { version, x, y, era, relay, found, captures, gauge, delivered, notes, seconds, archiveSeen, archivePair } = s;
  return JSON.stringify({ version, x, y, era, relay, found, captures, gauge, delivered, notes, seconds, archiveSeen, archivePair });
}
export function bridgeOpen(s) { return s.captures.length === 2; }
export function tileAt(x, y, s) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return "edge";
  if ((x === 18 || x === 19) && ((y >= 22 && y <= 23) || (y >= 8 && y <= 9 && bridgeOpen(s)))) return "bridge";
  if ((y === 13 || y === 14) && ((x >= 9 && x <= 10) || (x >= 29 && x <= 30))) return "bridge";
  if (x === 18 || x === 19 || y === 13 || y === 14) return "water";
  if (HOUSES.some(([a,b,w,h]) => x >= a && x < a+w && y >= b && y < b+h)) return "house";
  if (TREES.some(([a,b]) => x === a && y === b)) return "tree";
  if ((x >= 9 && x <= 10 && y >= 7 && y <= 25) || (y >= 8 && y <= 9 && x >= 9 && x <= 30)
    || (x >= 29 && x <= 30 && y >= 7 && y <= 24) || (y >= 23 && y <= 24 && x >= 5 && x <= 34)) return "path";
  if (x >= 25 && x <= 31 && y >= 3 && y <= 6) return s.era === "B" ? "wetland" : "crop";
  if ((x >= 3 && x <= 15 && y >= 3 && y <= 6) || (x >= 3 && x <= 7 && y >= 16 && y <= 19)
    || (x >= 24 && x <= 35 && y >= 17 && y <= 20) || (x >= 23 && x <= 34 && y >= 10 && y <= 12)) return "crop";
  return "grass";
}
export function canStand(x, y, s) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const blocked = new Set(["edge", "water", "house", "tree"]);
  return [[-4,-3],[4,-3],[-4,3],[4,3]].every(([a,b]) => !blocked.has(tileAt(Math.floor((x+a)/TILE), Math.floor((y+b)/TILE), s)));
}
export function move(s, dx, dy, dt) {
  const size = Math.hypot(dx, dy);
  s.moving = !!size;
  if (!size) return;
  const distance = 68 * clamp(dt, 0, .05), vx = dx/size*distance, vy = dy/size*distance;
  if (canStand(s.x+vx,s.y,s)) s.x += vx;
  if (canStand(s.x,s.y+vy,s)) s.y += vy;
  s.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "up" : "down";
  s.walk += distance;
}
export function targetOf(s) {
  const id = { relay: "relay", compare: "compare", gauge: "gauge", return: "lab", complete: "lab" }[stageOf(s)];
  return OBJECTS.find((o) => o.id === id);
}
export function nearby(s) {
  return OBJECTS.filter((o) => Math.hypot(s.x-o.x,s.y-o.y) < 27 && (o.id !== "relay" || s.found))
    .sort((a,b) => Math.hypot(s.x-a.x,s.y-a.y)-Math.hypot(s.x-b.x,s.y-b.y))[0];
}
export function objective(s) {
  const stage = stageOf(s);
  return {
    relay: { chapter: "01 / THROUGH THE CLOUDS", title: s.found ? "Reconnect the lost relay" : "Find the lost radar relay", text: "Head north-west. Send a radar pulse near the cloud bank, then approach the revealed relay.", action: "Radar pulse" },
    compare: { chapter: "02 / THE SAME PLACE, TWICE", title: "Pair two survey dates", text: `Use the time relay by the canal. Capture date A and date B at the same spot. ${s.captures.length}/2 paired.`, action: "Switch date" },
    gauge: { chapter: "03 / BOOTS ON THE GROUND", title: "Check the field gauge", text: "The north bridge is powered. Cross east and collect the field reading beside the wetland.", action: "Read gauge" },
    return: { chapter: "04 / BRING THE EVIDENCE HOME", title: "Return to the field station", text: "Bring the radar echo, paired survey dates and field reading to the station in the south-west.", action: "Deliver evidence" },
    complete: { chapter: "MISSION COMPLETE", title: "A clue became a checked case", text: "This was a fictional field exercise. Your next expedition uses real NISAR observations in Fringe.", action: "Open real observations" },
  }[stage];
}
export function pulse(s) {
  if (s.cooldown > 0) return { type: "quiet" };
  s.cooldown = 1.1; s.reveal = 6;
  s.pulses.push({ x: s.x, y: s.y, age: 0 });
  const relay = OBJECTS.find((o) => o.id === "relay");
  if (!s.found && Math.hypot(s.x-relay.x,s.y-relay.y) <= 100) {
    s.found = true;
    return { type: "discovery", text: "There! An echo under the clouds. Walk to the glowing relay and reconnect it." };
  }
  return { type: "pulse", text: stageOf(s) === "relay" ? "The relay is farther north-west, under the cloud bank. Try another pulse closer to it." : "Echo sent. Radar provides a clue; dates and field checks help us interpret it." };
}
export function switchEra(s) {
  if (!s.relay) return { type: "hint", text: "Reconnect the lost radar relay first. It powers your time lens." };
  s.era = s.era === "A" ? "B" : "A";
  return { type: "time", text: `Survey ${s.era} selected. Look at the north-east field: the world changes between the two fictional visits.` };
}
export function interact(s) {
  const o = nearby(s);
  if (!o) return { type: "hint", text: "Get closer to a relay, field note or gauge. Echo can lead you to your next objective." };
  if (o.note) {
    if (s.notes.includes(o.id)) return { type: "note", text: o.note };
    s.notes.push(o.id); return { type: "note", text: o.note, fresh: true };
  }
  if (o.id === "relay") {
    if (s.relay) return { type: "hint", text: "The relay is online. Your time lens is ready at the canal's time relay to the east." };
    s.relay = true; return { type: "milestone", text: "Relay online! I’m Echo, your radar scout. Next: compare the same place on two survey dates. Follow me east to the time relay." };
  }
  if (o.id === "compare") {
    if (!s.relay) return { type: "hint", text: "This relay needs power. Find and reconnect the lost radar relay under the clouds first." };
    if (s.captures.includes(s.era)) return { type: "hint", text: s.captures.length === 2 ? "Both dates are paired. The north bridge is open. Find the field gauge to the east." : `Survey ${s.era} is already captured. Switch dates with T or the date button, then capture the other visit.` };
    s.captures.push(s.era);
    return { type: "milestone", text: s.captures.length === 2 ? "Two visits, one place. The north bridge is powered! The echo changed, but why? Let’s check the field gauge beyond the bridge." : `Survey ${s.era} captured. Now switch dates and capture the same location again. Watch how the north-east field changes.` };
  }
  if (o.id === "gauge") {
    if (s.captures.length !== 2) return { type: "hint", text: "Pair both survey dates before collecting the field check. One visit cannot establish a change." };
    if (s.gauge) return { type: "hint", text: "The field reading is in your pack. Bring it back to the station in the south-west." };
    s.gauge = true; return { type: "milestone", text: "Field check collected. In this fictional case, water rose at this sample plot between visits. That supports local water change, not a flood map for the whole delta. Let’s bring the evidence home." };
  }
  if (o.id === "lab") {
    if (!s.gauge) return { type: "hint", text: "The station is waiting for three clues: a radar echo, paired dates and a field check. Your next objective is marked on the compass." };
    s.delivered = true; return { type: "complete", text: "Case delivered. You followed an echo, compared dates and checked the ground. Now bring those habits into real NISAR exploration." };
  }
}
export function actionLabel(s) {
  const o = nearby(s);
  if (!o) return "Interact";
  return o.note ? "Read field note" : ({lab:s.gauge?"Deliver evidence":"Field station",relay:s.relay?"Inspect relay":"Reconnect relay",compare:`Capture survey ${s.era}`,gauge:"Collect field check"})[o.id];
}
// Cardinal BFS: the same collision grid as manual movement. Never teleports or collects evidence.
export function routeTo(s, target = targetOf(s)) {
  const start = [Math.floor(s.x/TILE), Math.floor(s.y/TILE)], goal = [Math.floor(target.x/TILE),Math.floor(target.y/TILE)];
  const key = (x,y) => y*COLS+x, queue = [start], parents = new Map([[key(...start), null]]);
  let end;
  for (let q = 0; q < queue.length; q++) {
    const [x,y] = queue[q];
    if (x === goal[0] && y === goal[1]) { end = [x,y]; break; }
    for (const [a,b] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx=x+a,ny=y+b,k=key(nx,ny);
      if (nx<0 || nx>=COLS || ny<0 || ny>=ROWS || parents.has(k) || !canStand(nx*TILE+8,ny*TILE+8,s)) continue;
      parents.set(k,[x,y]); queue.push([nx,ny]);
    }
  }
  if (!end) return [];
  const path = [];
  while (end) { path.unshift({x:end[0]*TILE+8,y:end[1]*TILE+8}); end=parents.get(key(...end)); }
  return path;
}
export function tick(s, dt, input = {}) {
  dt = clamp(Number.isFinite(dt) ? dt : 0,0,.05);
  s.seconds += dt; s.cooldown = Math.max(0,s.cooldown-dt); s.reveal = Math.max(0,s.reveal-dt);
  s.pulses = s.pulses.filter((p) => (p.age += dt) < 1.1);
  let dx=input.x || 0,dy=input.y || 0;
  if (dx || dy) s.nav = [];
  else if (s.nav.length) {
    const next=s.nav[0], ax=next.x-s.x, ay=next.y-s.y;
    if (Math.hypot(ax,ay)<2) s.nav.shift();
    else { dx=ax;dy=ay; }
  }
  move(s,dx,dy,dt);
}
